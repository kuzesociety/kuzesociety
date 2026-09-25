// Motor de simulación eléctrica "lógica" (como CADe SIMU):
//
// 1. Los cables y los bornes que coinciden forman redes estáticas.
// 2. Los contactos cerrados unen redes; las cargas (bobinas, lámparas,
//    motores...) NO propagan tensión.
// 3. Cada red recibe las fases de las fuentes a las que está unida. Una
//    carga funciona si sus bornes están a potenciales distintos (fase-N o
//    fase-fase). Una red con dos potenciales es un cortocircuito.
// 4. Las bobinas cambian el estado de sus contactos y se repite hasta que
//    todo es estable.

import { TYPES, termPos } from './components.js';

export const PH = { L1: 1, L2: 2, L3: 4, N: 8 };
const LINES = PH.L1 | PH.L2 | PH.L3;
const single = (m) => m !== 0 && (m & (m - 1)) === 0;
const PH_NAME = { 1: 'L1', 2: 'L2', 4: 'L3', 8: 'N' };

class UF {
  constructor(n) {
    this.p = new Int32Array(n);
    for (let i = 0; i < n; i++) this.p[i] = i;
  }
  find(x) {
    const p = this.p;
    while (p[x] !== x) {
      p[x] = p[p[x]];
      x = p[x];
    }
    return x;
  }
  union(a, b) {
    a = this.find(a);
    b = this.find(b);
    if (a !== b) this.p[a] = b;
  }
}

const THERMAL_TAU = 200; // s, constante térmica del relé
const THERMAL_TRIP = 1.3; // (I/Ir)² de disparo ≈ 1.14·Ir sostenida

export class ElecSim {
  /**
   * hooks: {
   *   log(level, msg, t)      — mensajes para el registro
   *   refrig()                — salida actual del modelo frigorífico o null
   *   setDoor(open)           — abrir/cerrar la puerta de la cámara
   * }
   */
  constructor(project, hooks = {}) {
    this.project = project;
    this.hooks = hooks;
    this.time = 0;
    this.door = false;
    this.fault = null;
    this.oscillating = false;
    this.build();
  }

  log(level, msg) {
    if (this.hooks.log) this.hooks.log(level, msg, this.time);
  }

  // ------------------------------------------------------------ topología
  build() {
    const comps = this.project.components.filter((c) => TYPES[c.type]);
    const wires = this.project.wires.filter((w) => w.points && w.points.length >= 2);
    this.comps = comps;
    this.compById = new Map(comps.map((c) => [c.id, c]));
    this.wires = wires;

    const index = new Map();
    const coords = [];
    const idx = (x, y) => {
      const k = x + ',' + y;
      let i = index.get(k);
      if (i === undefined) {
        i = coords.length;
        index.set(k, i);
        coords.push([x, y]);
      }
      return i;
    };

    const termPts = new Map();
    for (const c of comps) {
      const m = {};
      for (const t of TYPES[c.type].terms) {
        const [x, y] = termPos(c, t);
        m[t.n] = idx(x, y);
      }
      termPts.set(c.id, m);
    }
    const wirePts = wires.map((w) => w.points.map(([x, y]) => idx(x, y)));

    const uf = new UF(coords.length);
    for (const ids of wirePts) for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);

    // Uniones en T: un borne o un extremo de cable sobre el tramo de otro cable.
    const special = new Set();
    for (const m of termPts.values()) for (const i of Object.values(m)) special.add(i);
    for (const ids of wirePts) {
      special.add(ids[0]);
      special.add(ids[ids.length - 1]);
    }
    const specialList = [...special];
    this.junctions = [];
    wires.forEach((w, wi) => {
      const pts = w.points;
      for (let s = 1; s < pts.length; s++) {
        const [x1, y1] = pts[s - 1];
        const [x2, y2] = pts[s];
        for (const si of specialList) {
          const [px, py] = coords[si];
          if (!onSegment(px, py, x1, y1, x2, y2)) continue;
          if ((px === x1 && py === y1) || (px === x2 && py === y2)) continue;
          uf.union(si, wirePts[wi][0]);
          this.junctions.push([px, py]);
        }
      }
    });

    // Redes estáticas compactas.
    const rootToNet = new Map();
    const pointNet = new Int32Array(coords.length);
    for (let i = 0; i < coords.length; i++) {
      const r = uf.find(i);
      let n = rootToNet.get(r);
      if (n === undefined) {
        n = rootToNet.size;
        rootToNet.set(r, n);
      }
      pointNet[i] = n;
    }
    this.netCount = rootToNet.size;
    this.termNet = new Map();
    for (const [id, m] of termPts) {
      const o = {};
      for (const [n, i] of Object.entries(m)) o[n] = pointNet[i];
      this.termNet.set(id, o);
    }
    this.wireNet = wirePts.map((ids) => pointNet[ids[0]]);
    this.wireNetById = new Map(wires.map((w, i) => [w.id, this.wireNet[i]]));

    // Puntos donde confluyen 3 o más extremos de cable/bornes → punto de unión.
    const count = new Map();
    const bump = (i) => count.set(i, (count.get(i) || 0) + 1);
    for (const ids of wirePts) {
      bump(ids[0]);
      bump(ids[ids.length - 1]);
      for (let k = 1; k < ids.length - 1; k++) {
        bump(ids[k]);
        bump(ids[k]);
      }
    }
    for (const [i, n] of count) if (n >= 3) this.junctions.push(coords[i]);

    // Estados de componentes y dispositivos por etiqueta.
    const oldState = this.cstate || new Map();
    this.cstate = new Map();
    for (const c of comps) {
      const T = TYPES[c.type];
      const prev = oldState.get(c.id);
      this.cstate.set(c.id, prev || (T.initState ? T.initState(c) : {}));
    }
    const oldDev = this.devices || new Map();
    this.devices = new Map();
    for (const c of comps) {
      const T = TYPES[c.type];
      if (!T.master) continue;
      const tag = c.props.tag;
      let d = this.devices.get(tag);
      if (!d) {
        const prev = oldDev.get(tag);
        d = prev && prev.kind === T.master ? prev : newDevice(T.master, tag);
        d.comps = [];
        this.devices.set(tag, d);
      }
      d.comps.push(c.id);
      configureDevice(d, c);
    }
    // Relé térmico: motores conectados directamente a sus bornes de salida.
    for (const d of this.devices.values()) {
      if (d.kind !== 'thermal') continue;
      const outs = new Set();
      for (const id of d.comps) {
        const tn = this.termNet.get(id);
        for (const n of ['2', '4', '6']) outs.add(tn[n]);
      }
      d.motors = comps
        .filter((c) => c.type === 'motor3' || c.type === 'motor1')
        .filter((c) => Object.values(this.termNet.get(c.id)).some((n) => outs.has(n)))
        .map((c) => c.id);
    }
    this.loads = new Map();
    this.dirty = true;
  }

  /** Reconstruye la topología manteniendo el estado (tras editar). */
  rebuild() {
    this.build();
  }

  // ------------------------------------------------------------- utilidades
  ctx(c) {
    const T = TYPES[c.type];
    const dev = T.slaveOf || T.master ? this.devices.get(c.props.tag) : null;
    return {
      comp: c,
      st: this.cstate.get(c.id),
      dev: dev && (dev.kind === (T.slaveOf || T.master)) ? dev : null,
      load: this.loads.get(c.id) || null,
      sim: this,
      current: this.motorCurrent(c),
    };
  }

  _union(skipId) {
    const uf = new UF(this.netCount);
    for (const c of this.comps) {
      if (c.id === skipId) continue;
      const T = TYPES[c.type];
      if (!T.links) continue;
      const tn = this.termNet.get(c.id);
      for (const [a, b] of T.links(this.ctx(c))) uf.union(tn[a], tn[b]);
    }
    return uf;
  }

  _masks(uf) {
    const mask = new Int32Array(this.netCount);
    for (const c of this.comps) {
      const T = TYPES[c.type];
      const tn = this.termNet.get(c.id);
      for (const t of T.terms) {
        const ph = t.phase || (t.phaseProp ? c.props[t.phaseProp] : null);
        if (ph && PH[ph]) mask[uf.find(tn[t.n])] |= PH[ph];
      }
    }
    return mask;
  }

  _shorts(mask) {
    let n = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] && !single(mask[i])) n++;
    return n;
  }

  _trip(shorts) {
    // Probamos a abrir cada protección: dispara la de menor calibre que
    // elimina (o reduce) el cortocircuito.
    const cands = [];
    for (const c of this.comps) {
      const T = TYPES[c.type];
      if (!T.protective) continue;
      if (!T.links(this.ctx(c)).length) continue;
      const uf = this._union(c.id);
      const n = this._shorts(this._masks(uf));
      if (n < shorts) cands.push({ c, n, In: +c.props.In || 999 });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.n - b.n || a.In - b.In);
    const { c } = cands[0];
    const st = this.cstate.get(c.id);
    if (c.type === 'fuse') st.blown = true;
    else st.tripped = true;
    return c;
  }

  // ------------------------------------------------------------ resolución
  solve() {
    this.dirty = false;
    this.oscillating = false;
    for (let iter = 0; iter < 60; iter++) {
      const uf = this._union();
      const mask = this._masks(uf);
      const shorts = this._shorts(mask);
      if (shorts) {
        const c = this._trip(shorts);
        if (c) {
          const what = c.type === 'fuse' ? 'se ha fundido el fusible' : 'ha disparado el magnetotérmico';
          this.log('error', `⚡ Cortocircuito: ${what} ${c.props.tag}.`);
          continue;
        }
        this.fault = { type: 'short' };
        this._store(uf, mask);
        this.log('error', '⚡ ¡Cortocircuito sin protección! Revisa el esquema.');
        return;
      }
      this.fault = null;
      this._evalLoads(uf, mask);
      if (!this._updateDevices()) {
        this._store(uf, mask);
        return;
      }
    }
    this.oscillating = true;
    const uf = this._union();
    this._store(uf, this._masks(uf));
    this.log('warn', 'El circuito oscila (un relé se activa y desactiva continuamente).');
  }

  _store(uf, mask) {
    this.netMask = new Int32Array(this.netCount);
    for (let i = 0; i < this.netCount; i++) this.netMask[i] = mask[uf.find(i)];
  }

  _evalLoads(uf, mask) {
    const m = (c, n) => mask[uf.find(this.termNet.get(c.id)[n])];
    const loads = new Map();
    for (const c of this.comps) {
      const T = TYPES[c.type];
      if (!T.loads) continue;
      for (const L of T.loads) {
        let res;
        if (L.kind === 'motor3') {
          const ms = L.terms.map((n) => m(c, n));
          const lines = ms.filter((x) => single(x) && x & LINES);
          const distinct = new Set(lines);
          if (lines.length === 3 && distinct.size === 3) {
            const order = ms.map((x) => Math.log2(x));
            const reverse = !((order[1] - order[0] + 3) % 3 === 1 && (order[2] - order[1] + 3) % 3 === 1);
            res = { on: true, state: 'run', volts: 400, reverse };
          } else if (distinct.size === 2) {
            res = { on: false, state: 'hum', volts: 400 };
          } else res = { on: false, state: 'off' };
        } else {
          const a = m(c, L.terms[0]);
          const b = m(c, L.terms[1]);
          const on = single(a) && single(b) && a !== b;
          res = { on, state: on ? 'run' : 'off', volts: on ? (a === PH.N || b === PH.N ? 230 : 400) : 0 };
        }
        loads.set(L.id ? `${c.id}:${L.id}` : c.id, res);
      }
    }
    this.loads = loads;
  }

  _coilOn(d) {
    return d.comps.some((id) => {
      const L = this.loads.get(id);
      return L && L.on;
    });
  }

  _updateDevices() {
    let changed = false;
    for (const d of this.devices.values()) {
      if (d.kind === 'relay') {
        const e = this._coilOn(d);
        d.energized = e;
        if (d.active !== e) {
          d.active = e;
          changed = true;
        }
      } else if (d.kind === 'timer') {
        const e = this._coilOn(d);
        const was = d.active;
        if (d.mode === 'tof') {
          if (e) {
            d.active = true;
            d.timing = false;
            d.t = 0;
          } else if (d.energized && d.active) {
            d.timing = d.delay > 0;
            d.t = 0;
            if (d.delay <= 0) d.active = false;
          }
        } else if (!e) {
          d.active = false;
          d.timing = false;
          d.t = 0;
        } else if (!d.energized) {
          d.t = 0;
          d.timing = d.delay > 0;
          d.active = d.delay <= 0;
        }
        d.energized = e;
        if (was !== d.active) changed = true;
      } else if (d.kind === 'clock') {
        d.powered = d.comps.some((id) => (this.loads.get(id) || {}).on);
        const term = d.comps.some((id) => (this.loads.get(`${id}:term`) || {}).on);
        if (d.defrost && term) {
          d.defrost = false;
          d.terminated = true;
          changed = true;
          this.log('info', `${d.tag}: fin de desescarche por termostato (solenoide X del reloj).`);
        }
      }
    }
    return changed;
  }

  // ------------------------------------------------------------ tiempo real
  motorCurrent(c) {
    if (c.type !== 'motor3' && c.type !== 'motor1') return undefined;
    const L = this.loads.get(c.id);
    if (!L || L.state === 'off') return 0;
    const r = this.hooks.refrig ? this.hooks.refrig() : null;
    const isComp = c.props.func === 'compresor' && r;
    if (L.state === 'hum') return (isComp ? r.nominalCurrent : +c.props.In || 1) * 5.5;
    if (isComp) return r.current;
    return +c.props.In || 0;
  }

  /** Avanza h segundos: temporizadores, reloj, relés térmicos y sensores. */
  tick(h) {
    this.time += h;
    const r = this.hooks.refrig ? this.hooks.refrig() : null;
    let changed = false;
    for (const d of this.devices.values()) {
      if (d.kind === 'timer' && d.timing) {
        d.t += h;
        if (d.t >= d.delay) {
          d.timing = false;
          d.active = d.mode !== 'tof';
          changed = true;
        }
      } else if (d.kind === 'clock') {
        if (d.powered) {
          d.pos += h;
          if (d.pos >= d.interval) {
            d.pos -= d.interval;
            d.terminated = false;
          }
        }
        const win = d.pos < d.duration && !d.terminated;
        if (win !== d.defrost) {
          d.defrost = win;
          changed = true;
          this.log('info', win ? `${d.tag}: comienza el DESESCARCHE.` : `${d.tag}: fin del desescarche por tiempo.`);
        }
      } else if (d.kind === 'thermal') {
        let I = 0;
        for (const id of d.motors) I += this.motorCurrent(this.compById.get(id)) || 0;
        d.current = I;
        const ratio = I / Math.max(d.Iset, 0.01);
        d.theta += (ratio * ratio - d.theta) * (1 - Math.exp(-h / THERMAL_TAU));
        if (!d.active && d.theta >= THERMAL_TRIP) {
          d.active = true;
          changed = true;
          this.log('error', `${d.tag}: DISPARO del relé térmico (${I.toFixed(1)} A con regulación ${d.Iset} A).`);
        } else if (d.active && d.reset === 'auto' && d.theta < 0.6) {
          d.active = false;
          changed = true;
          this.log('info', `${d.tag}: rearme automático del relé térmico.`);
        }
      }
    }
    for (const c of this.comps) {
      if (c.type === 'thermostat' || c.type === 'pressostat') {
        if (this._sensor(c, r)) changed = true;
      }
    }
    if (changed) this.dirty = true;
    return changed;
  }

  sensorValue(c, r) {
    if (!r) return null;
    const p = c.props;
    if (c.type === 'thermostat') {
      return { camara: r.Troom, evaporador: r.Tcoil, producto: r.Tprod, exterior: r.Tamb }[p.probe] ?? r.Troom;
    }
    return p.kind === 'alta' ? r.PcG : r.PeG;
  }

  _sensor(c, r) {
    const st = this.cstate.get(c.id);
    const v = this.sensorValue(c, r);
    st.value = v;
    if (v === null) return false;
    const p = c.props;
    const sp = +p.sp, diff = Math.abs(+p.diff), cut = +p.cut;
    const was = st.actuated;
    const who = `${p.tag}${p.name ? ' (' + p.name + ')' : ''}`;
    if (c.type === 'thermostat') {
      if (p.mode === 'calor') {
        if (!st.actuated && v >= sp) st.actuated = true;
        else if (st.actuated && v <= sp - diff) st.actuated = false;
      } else if (!st.actuated && v <= sp) st.actuated = true;
      else if (st.actuated && v >= sp + diff) st.actuated = false;
      if (st.init && was !== st.actuated) {
        this.log('info', `${who}: ${v.toFixed(1)} °C → conmuta a C-${st.actuated ? 'NA' : 'NC'}.`);
      }
    } else if (p.kind === 'alta') {
      if (!st.actuated && v >= cut) {
        st.actuated = true;
        st.latched = p.reset === 'manual';
        if (st.init) this.log('error', `${who}: DISPARO por alta presión (${v.toFixed(1)} bar ≥ ${cut} bar).`);
      } else if (st.actuated && !st.latched && v <= cut - diff) {
        st.actuated = false;
        this.log('info', `${who}: presión normal (${v.toFixed(1)} bar), rearme automático.`);
      }
    } else {
      if (!st.actuated && v <= cut) {
        st.actuated = true;
        st.latched = p.reset === 'manual';
        if (st.init) this.log('warn', `${who}: abre por baja presión (${v.toFixed(1)} bar ≤ ${cut} bar).`);
      } else if (st.actuated && !st.latched && v >= cut + diff) {
        st.actuated = false;
        this.log('info', `${who}: cierra, presión recuperada (${v.toFixed(1)} bar ≥ ${(cut + diff).toFixed(1)} bar).`);
      }
    }
    st.init = true;
    return was !== st.actuated;
  }

  // ------------------------------------------------------- interacciones
  press(id, down) {
    const c = this.compById.get(id);
    if (!c) return;
    const st = this.cstate.get(id);
    if (st.pressed === down) return;
    st.pressed = down;
    if (down) this.log('info', `${c.props.tag}${c.props.name ? ' (' + c.props.name + ')' : ''}: pulsado.`);
    this.dirty = true;
  }

  click(id) {
    const c = this.compById.get(id);
    if (!c) return false;
    const T = TYPES[c.type];
    if (!T.click) return false;
    const r = T.click(this, c, this.cstate.get(id));
    if (r) this.dirty = true;
    return r;
  }

  setDoor(open) {
    if (this.door === open) return;
    this.door = open;
    this.dirty = true;
  }

  toggleDoor() {
    if (this.hooks.setDoor) this.hooks.setDoor(!this.door);
    else this.setDoor(!this.door);
  }

  resetThermal(d) {
    if (!d.active) {
      this.log('info', `${d.tag}: el relé térmico no está disparado.`);
      return false;
    }
    if (d.theta > 0.9) {
      this.log('warn', `${d.tag}: aún caliente, espera a que se enfríe para rearmar.`);
      return false;
    }
    d.active = false;
    this.log('info', `${d.tag}: relé térmico rearmado manualmente.`);
    return true;
  }

  resetPressostat(c, st) {
    if (!st.latched) {
      this.log('info', `${c.props.tag}: no necesita rearme.`);
      return false;
    }
    const v = st.value;
    const p = c.props;
    const ok = v === null || (p.kind === 'alta' ? v <= p.cut - p.diff : v >= +p.cut + +p.diff);
    if (!ok) {
      this.log('warn', `${c.props.tag}: no se puede rearmar todavía (${v.toFixed(1)} bar).`);
      return false;
    }
    st.latched = false;
    st.actuated = false;
    this.log('info', `${c.props.tag}: presostato rearmado manualmente.`);
    return true;
  }

  forceDefrost(d) {
    if (d.defrost) {
      d.terminated = true;
      d.defrost = false;
      this.log('info', `${d.tag}: desescarche terminado manualmente.`);
    } else {
      d.pos = 0;
      d.terminated = false;
      d.defrost = true;
      this.log('info', `${d.tag}: desescarche forzado manualmente.`);
    }
    return true;
  }

  // ---------------------------------------------------------- resultados
  netMaskOf(net) {
    return this.netMask ? this.netMask[net] : 0;
  }

  wireMask(i) {
    return this.netMaskOf(this.wireNet[i]);
  }

  wireMaskById(id) {
    const n = this.wireNetById.get(id);
    return n === undefined ? 0 : this.netMaskOf(n);
  }

  loadOf(id) {
    return this.loads.get(id);
  }

  static phaseName(mask) {
    if (!mask) return null;
    if (!single(mask)) return 'short';
    return PH_NAME[mask];
  }
}

function newDevice(kind, tag) {
  const base = { kind, tag, comps: [], active: false, energized: false };
  if (kind === 'timer') Object.assign(base, { t: 0, timing: false, mode: 'ton', delay: 10 });
  if (kind === 'thermal') Object.assign(base, { theta: 0, current: 0, motors: [], Iset: 4, reset: 'manual' });
  if (kind === 'clock') Object.assign(base, { pos: 0, defrost: false, terminated: false, powered: false, interval: 21600, duration: 1800, init: false });
  return base;
}

function configureDevice(d, c) {
  const p = c.props;
  if (d.kind === 'timer') {
    d.mode = p.mode || 'ton';
    d.delay = Math.max(0, +p.delay || 0);
  } else if (d.kind === 'thermal') {
    d.Iset = +p.Iset || 1;
    d.reset = p.reset || 'manual';
  } else if (d.kind === 'clock') {
    d.interval = Math.max(60, (+p.interval || 6) * 3600);
    d.duration = Math.max(60, (+p.duration || 30) * 60);
    if (!d.init) {
      d.pos = Math.max(0, d.interval - (+p.first || 0) * 60);
      if (d.pos >= d.interval) d.pos = 0;
      d.init = true;
    }
  }
}

function onSegment(px, py, x1, y1, x2, y2) {
  if (x1 === x2) return px === x1 && py >= Math.min(y1, y2) && py <= Math.max(y1, y2);
  if (y1 === y2) return py === y1 && px >= Math.min(x1, x2) && px <= Math.max(x1, x2);
  return false;
}
