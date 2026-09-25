// Modelo dinámico (de parámetros concentrados) de una cámara frigorífica
// con compresor, condensador por aire, recipiente de líquido, filtro,
// visor, válvula solenoide, válvula de expansión (termostática o capilar)
// y evaporador con ventilador y resistencia de desescarche.
//
// El objetivo es didáctico: que las presiones, temperaturas, caudales,
// escarcha, etc. reaccionen de forma creíble a lo que hace el circuito
// eléctrico (compresor en marcha o parado, ventiladores, solenoide,
// resistencias, puerta abierta, averías...).

import {
  getRefrigerant, psat, tsat, gauge, hfg, hLiq, hVap, vaporDensity, compression,
} from './refrigerants.js';

export const DEFAULT_REFRIG = {
  enabled: true,
  refrigerant: 'R404A',
  capacityKW: 2.5, // capacidad frigorífica nominal a -10 / +40 °C
  expansion: 'txv', // 'txv' (válvula termostática) | 'capilar'
  shSet: 6, // recalentamiento ajustado en la VET (K)
  Tamb: 30, // temperatura exterior (°C)
  TroomInit: 20, // temperatura inicial de la cámara (°C)
  roomUA: 0.04, // pérdidas por paredes (kW/K)
  airMass: 80, // capacidad térmica del aire + estructura (kJ/K)
  productMass: 300, // capacidad térmica del género (kJ/K)
  doorUA: 0.3, // entrada de calor extra con puerta abierta (kW/K)
  internalKW: 0.08, // cargas internas fijas (kW)
  heaterKW: 1.5, // potencia de la resistencia de desescarche (kW)
  humidity: 1, // factor de formación de escarcha
};

export const DEFAULT_FAULTS = {
  chargePct: 100, // carga de refrigerante (%)
  condDirt: 0, // suciedad del condensador 0..1
  condFanBroken: false,
  evapFanBroken: false,
  filterClog: 0, // obstrucción del filtro 0..1
  txv: 'ok', // 'ok' | 'cerrada' | 'abierta'
  compValves: false, // válvulas del compresor rotas
  compLocked: false, // compresor agarrotado
  solenoidStuck: false, // la solenoide no abre
  solenoidLeak: false, // la solenoide no cierra del todo
  doorSeal: false, // burlete de la puerta dañado
  nonCondensables: false, // aire / incondensables en el circuito
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const relax = (x, target, h, tau) => x + (target - x) * (1 - Math.exp(-h / tau));

const ETA_W = 0.85; // rendimiento (calibración) del trabajo de compresión
const ETA_T = 0.72; // rendimiento para la temperatura de descarga
const ETA_MOTOR = 0.9;
const LINE_GAIN = 3; // K que gana el vapor en la línea de aspiración
const LATENT_FUSION = 334; // kJ/kg
const LATENT_SUBLIM = 2834; // kJ/kg

export class FridgeModel {
  constructor(params = {}, faults = {}) {
    this.faults = { ...DEFAULT_FAULTS, ...faults };
    this.setParams(params);
    this.reset();
  }

  setParams(params) {
    this.p = { ...DEFAULT_REFRIG, ...params };
    this.ref = getRefrigerant(this.p.refrigerant);
    this._size();
  }

  setFaults(f) {
    Object.assign(this.faults, f);
  }

  /** Dimensiona compresor, intercambiadores y carga a partir de la capacidad. */
  _size() {
    const { p, ref } = this;
    const f = p.capacityKW / 2.5;
    const cap = p.expansion === 'capilar';
    const k = {
      f,
      UAairFan: 0.36 * f,
      UAairNat: 0.05 * f,
      UAref: 1.3 * f,
      UAcFan: 0.3 * f,
      UAcNat: 0.045 * f,
      Ccoil: 10 * f,
      MevapFull: 1.0 * f,
      chargeNom: (cap ? 1.8 : 3.0) * f,
      MhighSeal: (cap ? 0.6 : 1.2) * f,
      MhighFull: (cap ? 1.1 : 2.9) * f,
      iceRef: 2.0 * f,
      fanHeat: 0.06 * f,
    };
    // Punto de diseño: -10 / +40 °C.
    const Te = -10, Tc = 40, SC = 4;
    const Pe = psat(ref, Te), Pc = psat(ref, Tc);
    const Tsuc = Te + p.shSet + LINE_GAIN;
    const rho = vaporDensity(ref, Pe, Tsuc);
    const qe = hVap(ref, Te) + ref.cpV * p.shSet - hLiq(ref, Tc - SC);
    const m = p.capacityKW / qe;
    k.mNom = m;
    k.Vd = m / (rho * etaV(Pc / Pe, false));
    k.dPnom = Pc - Pe;
    k.txvK = (1.7 * m) / Math.sqrt(k.dPnom);
    k.capK = m / Math.sqrt(k.dPnom);
    const w = (m * compression(ref, Tsuc, Pc / Pe).work) / ETA_W;
    k.Wnom = w / ETA_MOTOR + 0.04 * w;
    k.Kp = 0.0036 * f; // ganancia de la VET (kg/s por K de recalentamiento)
    this.k = k;
    this.nominalCurrent = {
      '3F': currentFrom(k.Wnom, '3F'),
      '1F': currentFrom(k.Wnom, '1F'),
    };
  }

  reset() {
    const { p, k } = this;
    const T0 = p.TroomInit;
    this.door = false;
    this.pendingLoad = 0;
    this.s = {
      t: 0,
      Troom: T0,
      Tprod: T0,
      Tcoil: T0,
      Te: T0,
      Tc: Math.max(p.Tamb, T0),
      Mlow: 0.75 * k.MevapFull,
      ice: 0,
      Tdis: p.Tamb,
      Tsuc: p.Tamb,
      Tliq: p.Tamb,
      TevapOut: T0,
      SHevap: 0,
    };
    this.out = null;
    this._compute(defaultIO(), 0);
  }

  /** Añade una carga de género caliente (kJ) que se libera poco a poco. */
  addProductLoad(kJ) {
    this.pendingLoad += kJ;
  }

  /**
   * Avanza la simulación dt segundos con las entradas del circuito
   * eléctrico:
   *   io.comp: 'off' | 'run' | 'locked'
   *   io.compPhase: '3F' | '1F'
   *   io.evapFan, io.condFan, io.heater, io.light: boolean
   *   io.solenoid: boolean | null (null = no hay solenoide en el esquema)
   */
  step(dt, io) {
    let left = dt;
    while (left > 1e-9) {
      const h = Math.min(left, 0.25);
      this._step(h, io);
      left -= h;
    }
    this._compute(io, dt);
  }

  _actuators(io) {
    const F = this.faults;
    const running = io.comp === 'run' && !F.compLocked;
    const locked = io.comp === 'locked' || (io.comp === 'run' && F.compLocked);
    const hasSol = io.solenoid !== null && io.solenoid !== undefined;
    const solOpen = hasSol ? !!io.solenoid && !F.solenoidStuck : true;
    return {
      running,
      locked,
      fanE: !!io.evapFan && !F.evapFanBroken,
      fanC: !!io.condFan && !F.condFanBroken,
      heater: !!io.heater,
      light: !!io.light,
      hasSol,
      solOpen,
      solPass: solOpen ? 1 : F.solenoidLeak ? 0.06 : 0,
    };
  }

  _inventory() {
    const { k, faults: F } = this;
    const Mtot = (k.chargeNom * F.chargePct) / 100;
    const Mhigh = Math.max(Mtot - this.s.Mlow, 0);
    const liqAvail = clamp((Mhigh - k.MhighSeal * 0.5) / (k.MhighSeal * 0.5), 0, 1);
    const flooded = clamp((Mhigh - k.MhighFull) / (k.MhighFull * 0.6), 0, 0.6);
    const SC = liqAvail < 1 ? 0.5 * liqAvail : 3 + 14 * flooded;
    const xFlash = (1 - liqAvail) * 0.3 + F.filterClog * 0.12;
    return { Mtot, Mhigh, liqAvail, flooded, SC, xFlash };
  }

  _compState(Te, Tc, SHevap, inv, running) {
    const { ref, k, faults: F } = this;
    const Pe = psat(ref, Te);
    const Pc = psat(ref, Tc);
    const pr = Pc / Pe;
    const floodback = this.s.Mlow > k.MevapFull;
    const Tsuc = floodback ? Te : Te + SHevap + LINE_GAIN;
    if (!running) return { Pe, Pc, pr, Tsuc, m: 0, qe: 0 };
    const rho = vaporDensity(ref, Pe, Tsuc);
    const m = rho * k.Vd * etaV(pr, F.compValves);
    let qe = hVap(ref, Te) + ref.cpV * SHevap - (hLiq(ref, Tc - inv.SC) + inv.xFlash * hfg(ref, Tc));
    if (floodback) qe -= Math.min(1, (this.s.Mlow / k.MevapFull - 1) * 2) * 0.5 * hfg(ref, Te);
    return { Pe, Pc, pr, Tsuc, m, qe: Math.max(qe, 5) };
  }

  _solveTe(Tcoil, Tc, SHevap, wetEff, inv) {
    const { ref, k } = this;
    const TeMin = Math.max(tsat(ref, 0.25), -80);
    const f = (Te) => {
      const c = this._compState(Te, Tc, SHevap, inv, true);
      return c.m * c.qe - k.UAref * wetEff * (Tcoil - Te);
    };
    let lo = TeMin, hi = Tcoil;
    if (hi <= lo) return lo;
    if (f(lo) >= 0) return lo;
    for (let i = 0; i < 24; i++) {
      const mid = 0.5 * (lo + hi);
      if (f(mid) > 0) hi = mid;
      else lo = mid;
    }
    return 0.5 * (lo + hi);
  }

  _step(h, io) {
    const { s, k, p, ref, faults: F } = this;
    const a = this._actuators(io);
    const inv = this._inventory();
    const wet = s.Mlow / k.MevapFull;
    const wetEff = clamp(wet, 0, 1);
    const Tamb = p.Tamb;

    // ---- Recalentamiento a la salida del evaporador
    const dTevap = Math.max(s.Troom - s.Te, 0);
    s.SHevap = wet >= 1 ? 0 : 0.95 * dTevap * Math.pow(1 - wetEff, 0.7);

    // ---- Lado de baja: temperatura de evaporación
    let TeTarget, tauE;
    if (a.running) {
      TeTarget = this._solveTe(s.Tcoil, s.Tc, s.SHevap, wetEff, inv);
      tauE = 3;
    } else if (wetEff > 0.03) {
      TeTarget = s.Tcoil; // líquido en el evaporador a la temperatura de la batería
      tauE = 6;
    } else {
      // Evaporador vacío (recogida de gas): la presión sube muy despacio.
      TeTarget = s.Tcoil;
      tauE = F.solenoidLeak ? 600 : 3000;
    }
    s.Te = relax(s.Te, TeTarget, h, tauE);

    const c = this._compState(s.Te, s.Tc, s.SHevap, inv, a.running);
    const mComp = c.m;

    // ---- Válvula de expansión / capilar
    const dP = Math.max(c.Pc - c.Pe, 0);
    const clog = 1 - 0.85 * F.filterClog;
    let mFeed;
    if (p.expansion === 'capilar') {
      mFeed = k.capK * Math.sqrt(dP) * clog * (0.3 + 0.7 * inv.liqAvail) * (1 + 0.03 * inv.SC);
    } else {
      const txvF = F.txv === 'cerrada' ? 0.18 : 1;
      const capTXV = k.txvK * Math.sqrt(dP) * txvF * clog * (0.1 + 0.9 * Math.pow(inv.liqAvail, 1.5));
      const req = F.txv === 'abierta' ? capTXV : mComp + k.Kp * (s.SHevap - p.shSet);
      mFeed = clamp(req, 0, capTXV);
    }
    mFeed *= a.solPass;
    s.Mlow = clamp(s.Mlow + (mFeed - mComp) * h, 0, inv.Mtot * 0.97);

    // ---- Batería del evaporador (metal + refrigerante + escarcha)
    const frost = 1 / (1 + Math.pow(s.ice / k.iceRef, 1.6));
    const UAair = (a.fanE ? k.UAairFan : k.UAairNat) * frost;
    const Qair = UAair * (s.Troom - s.Tcoil);
    const boil = k.UAref * wetEff * Math.max(s.Tcoil - s.Te, 0) + mComp * ref.cpV * s.SHevap;
    const Qref = a.running ? Math.min(mComp * c.qe, boil) : 0;
    const heaterKW = a.heater ? p.heaterKW : 0;
    const QheatCoil = heaterKW * (a.fanE ? 0.55 : 0.85);
    let frostRate = 0;
    if (s.Tcoil < -0.5) {
      const moist = (0.35 + (this.door ? 3 : 0) + (F.doorSeal ? 0.8 : 0)) / 3600;
      frostRate = p.humidity * k.f * moist * (a.fanE ? 1 : 0.25) * clamp((s.Troom - s.Tcoil) / 10, 0, 1.5);
    }
    const Qfrost = frostRate * LATENT_SUBLIM * 0.15; // parte latente que carga la batería
    let TcoilNew = s.Tcoil + ((Qair + QheatCoil + Qfrost - Qref) / k.Ccoil) * h;
    s.ice += frostRate * h;
    if (s.ice > 0 && TcoilNew > 0) {
      const melt = (TcoilNew * k.Ccoil) / LATENT_FUSION;
      if (melt <= s.ice) {
        s.ice -= melt;
        TcoilNew = 0;
      } else {
        TcoilNew = ((melt - s.ice) * LATENT_FUSION) / k.Ccoil;
        s.ice = 0;
      }
    }
    s.Tcoil = TcoilNew;

    // ---- Cámara: aire y género
    const doorUA = (this.door ? p.doorUA : 0) + (F.doorSeal ? 0.2 * p.doorUA : 0);
    const UAprod = 0.2 * k.f;
    const Qin =
      p.roomUA * (Tamb - s.Troom) +
      doorUA * (Tamb - s.Troom) +
      p.internalKW +
      (a.fanE ? k.fanHeat : 0) +
      (a.light ? 0.05 : 0) +
      (heaterKW - QheatCoil) +
      UAprod * (s.Tprod - s.Troom);
    s.Troom += ((Qin - Qair) / p.airMass) * h;
    let Qload = 0;
    if (this.pendingLoad > 0) {
      Qload = this.pendingLoad / 400;
      this.pendingLoad = Math.max(0, this.pendingLoad - Qload * h);
    }
    s.Tprod += ((UAprod * (s.Troom - s.Tprod) + Qload) / p.productMass) * h;

    // ---- Condensador (lado de alta)
    const UAc = (a.fanC ? k.UAcFan : k.UAcNat) * (1 - 0.75 * F.condDirt) * (1 - inv.flooded);
    const nc = F.nonCondensables ? 7 : 0;
    let TcTarget, tauC;
    let Wref = 0;
    if (a.running) {
      Wref = (mComp * compression(ref, c.Tsuc, c.pr).work) / (F.compValves ? 0.6 : ETA_W);
      const Wel = Wref / ETA_MOTOR + 0.04 * k.Wnom;
      const Qc = Qref + Wref + 0.8 * (Wel - Wref);
      TcTarget = Tamb + Qc / UAc + nc;
      tauC = 30;
    } else if (p.expansion === 'capilar' && a.solPass > 0) {
      TcTarget = s.Te + (Tamb - s.Te) * 0.05;
      tauC = 90;
    } else {
      TcTarget = Tamb + nc * 0.5;
      tauC = 150;
    }
    TcTarget = Math.min(TcTarget, ref.Tc - 3);
    s.Tc = relax(s.Tc, TcTarget, h, tauC);
    if (s.Tc < s.Te) s.Tc = s.Te;

    // ---- Temperaturas de línea (con inercia)
    if (a.running && mComp > 1e-5) {
      const comp = compression(ref, c.Tsuc, c.pr);
      const motorHeat = Math.min(45, (0.1 * Wref + 0.04 * k.Wnom) / (Math.max(mComp, 0.15 * k.mNom) * ref.cpV));
      const TdisT = (c.Tsuc + 273.15) * (1 + comp.f / (F.compValves ? 0.5 : ETA_T)) - 273.15 + motorHeat;
      s.Tdis = relax(s.Tdis, TdisT, h, 40);
      s.Tsuc = relax(s.Tsuc, c.Tsuc, h, 15);
      s.Tliq = relax(s.Tliq, s.Tc - inv.SC, h, 30);
      s.TevapOut = relax(s.TevapOut, s.Te + s.SHevap, h, 10);
    } else {
      s.Tdis = relax(s.Tdis, a.locked ? s.Tdis + 2 : Tamb + 2, h, a.locked ? 60 : 400);
      s.Tsuc = relax(s.Tsuc, Tamb, h, 300);
      s.Tliq = relax(s.Tliq, Tamb, h, 200);
      s.TevapOut = relax(s.TevapOut, s.Tcoil, h, 30);
    }

    s.t += h;
    this._last = { a, inv, c, mComp, mFeed, Qref, Qair, Wref, frost, wet };
  }

  /** Calcula las salidas visibles (presiones, temperaturas, consumos...). */
  _compute(io, dt) {
    const { s, k, p, ref, faults: F } = this;
    const a = this._actuators(io);
    const inv = this._inventory();
    const L = this._last || {};
    const Pe = psat(ref, s.Te);
    const Pc = psat(ref, s.Tc);
    const mComp = a.running ? L.mComp || 0 : 0;
    const Wref = a.running ? L.Wref || 0 : 0;
    const Wel = a.running ? Wref / ETA_MOTOR + 0.04 * k.Wnom : 0;
    const phase = io.compPhase || '3F';
    const In = this.nominalCurrent[phase];
    let current = 0;
    if (a.running) current = currentFrom(Wel, phase);
    else if (a.locked) current = In * 5.5;
    const Qref = a.running ? L.Qref || 0 : 0;
    const flow = mComp / k.mNom;
    const wet = s.Mlow / k.MevapFull;
    const floodback = a.running && wet > 1;
    const filterDT = a.running ? F.filterClog * 9 * Math.min(flow, 1.5) : 0;
    const flash = a.running || (L.mFeed || 0) > 1e-5 ? clamp(Math.max(1 - inv.liqAvail, F.filterClog * 0.8), 0, 1) : 0;
    const level = clamp(
      (inv.Mhigh - k.MhighSeal * 0.5) / (k.MhighFull - k.MhighSeal * 0.5),
      0,
      1,
    );
    const SHtotal = s.Tsuc - s.Te;

    // Puntos del ciclo para el diagrama P-h.
    const h1 = hVap(ref, s.Te) + ref.cpV * Math.max(s.Tsuc - s.Te, 0);
    const h3 = hLiq(ref, s.Tc - inv.SC) + inv.xFlash * hfg(ref, s.Tc);
    const h2 = hVap(ref, s.Tc) + ref.cpV * Math.max(s.Tdis - s.Tc, 0);

    this.out = {
      t: s.t,
      refrigerant: ref.id,
      running: a.running,
      locked: a.locked,
      fanE: a.fanE,
      fanC: a.fanC,
      heater: a.heater,
      light: a.light,
      hasSolenoid: a.hasSol,
      solOpen: a.solOpen,
      door: this.door,
      Pe,
      Pc,
      PeG: gauge(Pe),
      PcG: gauge(Pc),
      Te: s.Te,
      Tc: s.Tc,
      Tamb: p.Tamb,
      Troom: s.Troom,
      Tprod: s.Tprod,
      Tcoil: s.Tcoil,
      Tdis: s.Tdis,
      Tsuc: s.Tsuc,
      Tliq: s.Tliq,
      TafterFilter: s.Tliq - filterDT,
      TevapOut: s.TevapOut,
      SHevap: s.SHevap,
      SH: SHtotal,
      SC: a.running ? inv.SC : Math.max(s.Tc - s.Tliq, 0),
      TD: s.Troom - s.Te,
      condDT: s.Tc - p.Tamb,
      mComp,
      mFeed: L.mFeed || 0,
      flow,
      Qref,
      Wel,
      cop: Wel > 0.05 ? Qref / Wel : 0,
      current,
      nominalCurrent: In,
      ice: s.ice,
      iceFrac: clamp(s.ice / (2 * k.iceRef), 0, 1),
      frostFactor: 1 / (1 + Math.pow(s.ice / k.iceRef, 1.6)),
      wet,
      floodback,
      liqAvail: inv.liqAvail,
      receiverLevel: level,
      flash,
      filterDT,
      chargeKg: inv.Mtot,
      ph: { h1, h2, h3, h4: h3, Pe, Pc },
    };
    return this.out;
  }
}

function etaV(pr, broken) {
  const v = 1 - 0.045 * (Math.pow(Math.max(pr, 1), 1 / 1.12) - 1);
  return clamp(v, 0, 1) * (broken ? 0.45 : 1);
}

function currentFrom(Wel, phase) {
  if (phase === '1F') return (Wel * 1000) / (230 * 0.9) + 0.5;
  return (Wel * 1000) / (Math.sqrt(3) * 400 * 0.8) + 0.4;
}

function defaultIO() {
  return { comp: 'off', compPhase: '3F', evapFan: false, condFan: false, heater: false, light: false, solenoid: null };
}
