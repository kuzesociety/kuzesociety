// Explica en lenguaje de frigorista lo que pasa en el circuito frigorífico
// cuando cambia algo en el eléctrico. (El diagnóstico de lecturas está en
// diagnose.js.)

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
    if (!p) {
      // Primer paso: si ya arranca, se cuenta como un arranque.
      if (cur.comp === 'run') {
        this.runSince = o.t;
        this._startMsg(sim, o);
      }
      return;
    }

    if (cur.door !== p.door && cur.door) {
      this._say('cause', 'Puerta abierta: entra aire caliente y húmedo. Sube la temperatura de la cámara y la humedad se convierte en escarcha sobre la batería.');
      this._schedule(o, 'puerta abierta');
    }
    if (cur.comp !== p.comp) {
      const t = tagsFor(sim, 'compresor') || 'compresor';
      if (cur.comp === 'run') {
        this.runSince = o.t;
        this._startMsg(sim, o);
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

  _startMsg(sim, o) {
    const t = tagsFor(sim, 'compresor') || 'compresor';
    this._say('cause', `▶ Arranca el compresor (${t}). Aspira vapor del evaporador → la presión de BAJA cae; lo comprime y lo empuja al condensador → la presión de ALTA sube. El refrigerante empieza a circular.`);
    this._schedule(o, 'arranque');
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
    this._flag('hp', o.Tc > 57 || (fl.hp && o.Tc > 52), `⚠ Presión de ALTA muy elevada: ${fmt(o.PcG)} bar (condensa a ${fmt(o.Tc, 0)} °C).${this.noSpoilers ? '' : ' ¿Ventilador del condensador parado, condensador sucio o exceso de carga?'}`, 'warn');
    this._flag('tdis', o.Tdis > 115 || (fl.tdis && o.Tdis > 100), `⚠ Temperatura de descarga muy alta (${fmt(o.Tdis, 0)} °C): riesgo para el aceite y las válvulas del compresor.`);
    this._flag('flood', run && (o.floodback || o.SHevap < 1), '⚠ Retorno de líquido al compresor: recalentamiento ≈ 0 K. La línea de aspiración se escarcha.', 'error');
    this._flag('flash', run && o.flash > 0.08, `Burbujas en el visor: llega gas mezclado con el líquido a la válvula de expansión${this.noSpoilers ? '' : ` (${o.liqAvail < 0.95 ? 'falta de refrigerante' : 'restricción en la línea de líquido'})`}.`);
    this._flag('sh', run && o.SHevap > 14 && !fl.flood, `Recalentamiento alto (${fmt(o.SHevap)} K): el evaporador está desabastecido de refrigerante.`);
    this._flag('ice', o.frostFactor < 0.5 || (fl.ice && o.frostFactor < 0.7), `❄ Evaporador muy escarchado (${fmt(o.ice, 1)} kg de hielo): el aire casi no pasa, baja el rendimiento. Hace falta un desescarche.`);
    this._flag('vac', run && o.PeG < -0.2, `Aspiración en vacío (${fmt(o.PeG)} bar).`);
  }
}
