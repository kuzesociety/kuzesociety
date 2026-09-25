// Explica en lenguaje de frigorista lo que pasa en el circuito frigorífico
// cuando cambia algo en el eléctrico, y genera un diagnóstico de lecturas.

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');

function tagsFor(sim, fn) {
  return sim.elec.comps
    .filter((c) => c.props.func === fn)
    .map((c) => c.props.tag)
    .filter(Boolean)
    .join('/');
}

export class Narrator {
  constructor(log) {
    this.log = log;
    this.reset(null);
  }

  reset(sim) {
    this.prev = null;
    this.pending = null;
    this.flags = {};
    this.runSince = null;
    this.sim = sim;
  }

  _say(level, msg) {
    this.log(level, msg, this.sim ? this.sim.time : 0);
  }

  _snap(o) {
    return { t: o.t, Pe: o.PeG, Pc: o.PcG, Tr: o.Troom, Te: o.Te, Tc: o.Tc };
  }

  _schedule(o, label) {
    if (this.pending && o.t - this.pending.t0 >= 20) this._report(o);
    this.pending = { t0: o.t, snap: this._snap(o), label };
  }

  _report(o) {
    const p = this.pending;
    this.pending = null;
    const s = p.snap;
    const mins = (o.t - p.t0) / 60;
    const parts = [];
    if (Math.abs(o.PeG - s.Pe) >= 0.1) parts.push(`BAJA ${fmt(s.Pe)} → ${fmt(o.PeG)} bar`);
    if (Math.abs(o.PcG - s.Pc) >= 0.2) parts.push(`ALTA ${fmt(s.Pc)} → ${fmt(o.PcG)} bar`);
    if (Math.abs(o.Troom - s.Tr) >= 0.2) parts.push(`cámara ${fmt(s.Tr)} → ${fmt(o.Troom)} °C`);
    if (!parts.length) return;
    this._say('result', `↳ ${fmt(mins, 1)} min después (${p.label}): ${parts.join(' · ')}.`);
  }

  /** Llamar tras cada paso de simulación. */
  update(sim) {
    this.sim = sim;
    if (!sim.refrigOn) return;
    const o = sim.fridge.out;
    const io = sim.io;
    const cap = sim.fridge.p.expansion === 'capilar';
    const cur = {
      comp: io.comp,
      evapFan: o.fanE,
      condFan: o.fanC,
      heater: o.heater,
      sol: o.hasSolenoid ? o.solOpen : null,
      door: o.door,
    };
    const p = this.prev;
    this.prev = cur;
    if (!p) return;

    if (cur.door !== p.door && cur.door) {
      this._say('cause', 'Puerta abierta: entra aire caliente y húmedo. Sube la temperatura de la cámara y la humedad se convierte en escarcha sobre la batería.');
      this._schedule(o, 'puerta abierta');
    }
    if (cur.comp !== p.comp) {
      const t = tagsFor(sim, 'compresor') || 'compresor';
      if (cur.comp === 'run') {
        this.runSince = o.t;
        this._say('cause', `▶ Arranca el compresor (${t}). Aspira vapor del evaporador → la presión de BAJA cae; lo comprime y lo empuja al condensador → la presión de ALTA sube. El refrigerante empieza a circular.`);
        this._schedule(o, 'arranque');
      } else if (cur.comp === 'locked') {
        this.runSince = null;
        this._say('error', `⚠ El compresor (${t}) tiene tensión pero NO gira (falta una fase o está agarrotado): consume la intensidad de arranque, no bombea refrigerante y el relé térmico acabará disparando.`);
      } else {
        this.runSince = null;
        const pumped = o.hasSolenoid && !o.solOpen && o.wet < 0.1;
        let msg;
        if (pumped) msg = `■ Para el compresor (${t}) con el evaporador vacío (recogida de gas): la solenoide está cerrada, así que la BAJA se queda baja y el refrigerante queda guardado en el recipiente de líquido. Volverá a arrancar cuando se abra la solenoide y suba la presión.`;
        else if (cap) msg = `■ Para el compresor (${t}). Sin aspiración la BAJA sube y, a través del capilar, las presiones de alta y baja se van igualando.`;
        else msg = `■ Para el compresor (${t}). La VET cierra: la BAJA sube (el líquido del evaporador se calienta con el aire de la cámara) y la ALTA baja al enfriarse el condensador hacia la temperatura exterior.`;
        this._say('cause', msg);
        this._schedule(o, pumped ? 'parada tras recogida de gas' : 'parada');
      }
    }
    if (cur.evapFan !== p.evapFan) {
      const t = tagsFor(sim, 'vent_evap') || 'ventilador del evaporador';
      if (!cur.evapFan) {
        this._say('cause', `Ventilador del evaporador (${t}) PARADO${o.door ? ' al abrir la puerta' : ''}: el aire deja de pasar por la batería y el evaporador absorbe mucho menos calor. ${o.running ? 'Con el compresor en marcha, la presión de BAJA cae y la batería se enfría y escarcha.' : ''}`);
      } else {
        this._say('cause', `Ventilador del evaporador (${t}) en marcha: vuelve a circular aire por la batería, entra más calor al refrigerante y la presión de BAJA sube.`);
      }
      this._schedule(o, cur.evapFan ? 'ventilador evaporador en marcha' : 'ventilador evaporador parado');
    }
    if (cur.condFan !== p.condFan) {
      const t = tagsFor(sim, 'vent_cond') || 'ventilador del condensador';
      if (!cur.condFan && o.running) {
        this._say('cause', `Ventilador del condensador (${t}) PARADO con el compresor en marcha: el calor no se evacua y la presión de ALTA sube muy deprisa (vigila el presostato de alta).`);
        this._schedule(o, 'ventilador condensador parado');
      } else if (cur.condFan && p.comp === 'run') {
        this._say('cause', `Ventilador del condensador (${t}) en marcha: el condensador evacua el calor y la ALTA se estabiliza.`);
      }
    }
    if (cur.heater !== p.heater) {
      const t = tagsFor(sim, 'desescarche') || 'resistencia';
      this._say('cause', cur.heater
        ? `🔥 Resistencia de desescarche (${t}) conectada: calienta la batería para fundir el hielo. La temperatura de la batería sube hasta 0 °C y se queda ahí mientras funde.`
        : `Resistencia de desescarche (${t}) desconectada.`);
    }
    if (cur.sol !== p.sol && cur.sol !== null && p.sol !== null) {
      const t = tagsFor(sim, 'solenoide') || 'solenoide';
      if (!cur.sol) {
        this._say('cause', o.running
          ? `Se cierra la solenoide (${t}): deja de llegar líquido al evaporador. El compresor lo vacía (recogida de gas / pump-down) y la BAJA cae hasta que el presostato de baja lo para.`
          : `Se cierra la solenoide (${t}): el líquido queda retenido en el recipiente.`);
        this._schedule(o, 'solenoide cerrada');
      } else {
        this._say('cause', `Se abre la solenoide (${t}): entra líquido al evaporador, la BAJA sube${o.running ? '' : ' y el presostato de baja volverá a arrancar el compresor'}.`);
        this._schedule(o, 'solenoide abierta');
      }
    }

    if (this.pending && o.t - this.pending.t0 >= 90) this._report(o);
    this._alarms(o);
  }

  _flag(key, on, msg, level = 'warn') {
    if (on && !this.flags[key]) {
      this.flags[key] = true;
      this._say(level, msg);
    } else if (!on && this.flags[key]) {
      this.flags[key] = false;
    }
  }

  _alarms(o) {
    const run = o.running && this.runSince !== null && o.t - this.runSince > 45;
    const fl = this.flags;
    this._flag('hp', o.Tc > 57 || (fl.hp && o.Tc > 52), `⚠ Presión de ALTA muy elevada: ${fmt(o.PcG)} bar (condensa a ${fmt(o.Tc, 0)} °C). ¿Ventilador del condensador parado, condensador sucio o exceso de carga?`, 'warn');
    this._flag('tdis', o.Tdis > 115 || (fl.tdis && o.Tdis > 100), `⚠ Temperatura de descarga muy alta (${fmt(o.Tdis, 0)} °C): riesgo para el aceite y las válvulas del compresor.`);
    this._flag('flood', run && (o.floodback || o.SHevap < 1), '⚠ Retorno de líquido al compresor: recalentamiento ≈ 0 K. La línea de aspiración se escarcha.', 'error');
    this._flag('flash', run && o.flash > 0.08, `Burbujas en el visor: llega gas mezclado con el líquido a la válvula de expansión (${o.liqAvail < 0.95 ? 'falta de refrigerante' : 'restricción en la línea de líquido'}).`);
    this._flag('sh', run && o.SHevap > 14 && !fl.flood, `Recalentamiento alto (${fmt(o.SHevap)} K): el evaporador está desabastecido de refrigerante.`);
    this._flag('ice', o.frostFactor < 0.5 || (fl.ice && o.frostFactor < 0.7), `❄ Evaporador muy escarchado (${fmt(o.ice, 1)} kg de hielo): el aire casi no pasa, baja el rendimiento. Hace falta un desescarche.`);
    this._flag('vac', run && o.PeG < -0.2, `Aspiración en vacío (${fmt(o.PeG)} bar).`);
  }
}

// ----------------------------------------------------------------- diagnóstico
/**
 * Devuelve {rows, findings} con las lecturas principales, su rango normal y
 * un estado ('ok' | 'high' | 'low' | 'na'), más un diagnóstico probable.
 */
export function diagnose(o, params, faults, runFor) {
  const running = o.running;
  const freezer = o.Troom < -8;
  const cap = params.expansion === 'capilar';
  const hotRef = ['R22', 'R32', 'R410A'].includes(o.refrigerant);
  const band = (v, lo, hi) => (!running ? 'na' : v > hi ? 'high' : v < lo ? 'low' : 'ok');
  const rows = [
    { k: 'Presión de baja', v: `${fmt(o.PeG, 2)} bar`, sub: `evapora a ${fmt(o.Te)} °C`, st: 'info' },
    { k: 'Presión de alta', v: `${fmt(o.PcG, 2)} bar`, sub: `condensa a ${fmt(o.Tc)} °C`, st: 'info' },
    { k: 'Recalentamiento', v: running ? `${fmt(o.SHevap)} K` : '—', sub: cap ? 'normal 3–10 K' : 'normal 4–9 K (VET)', st: band(o.SHevap, cap ? 3 : 4, cap ? 10 : 9) },
    { k: 'Subenfriamiento', v: running ? `${fmt(o.SC)} K` : '—', sub: 'normal 2–8 K', st: band(o.SC, 2, 8) },
    { k: 'Salto térmico evaporador', v: running ? `${fmt(o.TD)} K` : '—', sub: freezer ? 'normal 5–9 K (cámara − evaporación)' : 'normal 6–12 K (cámara − evaporación)', st: band(o.TD, freezer ? 5 : 6, freezer ? 9 : 12) },
    { k: 'Salto térmico condensador', v: running ? `${fmt(o.condDT)} K` : '—', sub: 'normal 8–17 K (condensación − exterior)', st: band(o.condDT, 6, 17) },
    { k: 'Temperatura de descarga', v: `${fmt(o.Tdis, 0)} °C`, sub: hotRef ? 'normal < 110 °C' : 'normal < 95 °C', st: running ? (o.Tdis > (hotRef ? 110 : 95) ? 'high' : 'ok') : 'na' },
    { k: 'Intensidad compresor', v: running || o.locked ? `${fmt(o.current)} A` : '—', sub: `nominal ≈ ${fmt(o.nominalCurrent)} A`, st: o.locked ? 'high' : band(o.current / o.nominalCurrent, 0.55, 1.2) },
    { k: 'Potencia frigorífica', v: running ? `${fmt(o.Qref, 2)} kW` : '—', sub: running ? `COP ${fmt(o.cop)}` : '', st: 'info' },
    { k: 'Escarcha en batería', v: `${fmt(o.ice, 2)} kg`, sub: `paso de aire ${Math.round(o.frostFactor * 100)} %`, st: o.frostFactor < 0.5 ? 'high' : o.frostFactor < 0.8 ? 'warn' : 'ok' },
    { k: 'Visor de líquido', v: o.flash > 0.08 ? 'burbujas' : 'lleno', sub: `carga ${fmt(o.chargeKg, 2)} kg`, st: o.flash > 0.08 && running ? 'high' : 'ok' },
  ];

  const findings = [];
  if (o.locked) findings.push('El compresor recibe tensión pero no arranca: comprueba las tres fases (fusibles, contactos) o si está agarrotado.');
  if (!running) {
    if (!o.locked) findings.push('Compresor parado: las lecturas de funcionamiento (recalentamiento, subenfriamiento, saltos) solo son válidas con el compresor en marcha.');
    return { rows, findings };
  }
  if (runFor < 120) {
    findings.push('Compresor recién arrancado: espera un par de minutos a que se estabilice antes de diagnosticar.');
    return { rows, findings };
  }
  const hiSH = o.SHevap > (cap ? 10 : 9);
  const loSH = o.SHevap < 2;
  const loSC = o.SC < 1.5;
  const hiSC = o.SC > 9;
  const hiCond = o.condDT > 18;
  const loTD = o.TD < (freezer ? 4 : 5);
  const hiTD = o.TD > (freezer ? 10 : 13);
  if (hiSH && loSC && o.flash > 0.05) findings.push('Recalentamiento alto + subenfriamiento bajo + burbujas en el visor → FALTA DE REFRIGERANTE (busca la fuga).');
  else if (hiSH && o.filterDT > 1.5) findings.push(`Recalentamiento alto y ${fmt(o.filterDT)} K de caída de temperatura en el filtro → FILTRO DESHIDRATADOR OBSTRUIDO.`);
  else if (hiSH && !loSC) findings.push('Recalentamiento alto con subenfriamiento normal → la válvula de expansión alimenta poco (VET cerrada, bulbo descargado o restricción).');
  if (loSH) findings.push('Recalentamiento casi nulo → la válvula alimenta de más o el evaporador no evapora todo: riesgo de golpe de líquido.');
  if (hiCond && hiSC) findings.push('Alta elevada con subenfriamiento alto → EXCESO DE CARGA (el líquido inunda el condensador).');
  else if (hiCond && !o.fanC) findings.push('Alta elevada con el ventilador del condensador parado → revisa el ventilador y su alimentación.');
  else if (hiCond) findings.push('Alta elevada → CONDENSADOR SUCIO, poco aire o incondensables en el circuito.');
  if (hiTD && !hiSH && (o.frostFactor < 0.8 || !o.fanE)) findings.push(`Salto térmico del evaporador alto (${fmt(o.TD)} K) sin falta de gas → poco aire en el evaporador (${!o.fanE ? 'ventilador parado' : 'batería escarchada'}).`);
  if (loTD && o.PcG < (o.Tamb > 20 ? 12 : 8) && o.Qref < 0.6 * params.capacityKW) findings.push('Presión de baja alta, de alta baja y poca potencia → COMPRESOR INEFICIENTE (válvulas o segmentos).');
  if (!findings.length) findings.push('Lecturas dentro de lo normal. ✔');
  return { rows, findings };
}
