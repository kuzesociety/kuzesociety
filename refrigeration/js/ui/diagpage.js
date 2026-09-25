// Página "Diagnosticar una máquina real".

import { h } from './dom.js';
import { seg } from './cards.js';
import { ptConverter } from './partcards.js';
import { PHChart } from './charts.js';
import { diagnoseReadings, APPS, EXPANSIONS, LEAK_GUIDE } from '../diagnose.js';
import { REFRIGERANTS, REFRIGERANT_IDS, getRefrigerant, gauge, psatDew, psatBubble, hVap, hLiq, cpVap, absolute } from '../refrig/refrigerants.js';

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const LVT = { '-2': 'muy bajo', '-1': 'bajo', 0: 'normal', 1: 'alto', 2: 'muy alto' };
const LVC = { '-2': 'low', '-1': 'low', 0: 'ok', 1: 'high', 2: 'high' };
const LS = 'frigosimu.diag';

const EXAMPLE = {
  refrigerant: 'R404A', app: 'positiva', expansion: 'txv', LP: '1,8', HP: '15', Tsuc: '8', Tliq: '35,5', Troom: '6', Tamb: '30', sight: 'burbujas',
};

export class DiagPage {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    this.state = { refrigerant: 'R404A', app: 'positiva', expansion: 'txv', sight: '', ice: '', evapFan: '', condFan: '', comp: '', solenoid: '', flags: {} };
    try {
      Object.assign(this.state, JSON.parse(localStorage.getItem(LS) || '{}'));
    } catch {
      /* sin almacenamiento */
    }
    this.built = false;
  }

  show() {
    if (!this.built) this.build();
    this.compute();
  }

  save() {
    try {
      localStorage.setItem(LS, JSON.stringify(this.state));
    } catch {
      /* sin almacenamiento */
    }
  }

  // ---------------------------------------------------------------- formulario
  build() {
    this.built = true;
    const s = this.state;
    const el = this.el;
    el.innerHTML = '';
    const form = h('form', { class: 'dg-form', autocomplete: 'off' });
    form.addEventListener('submit', (e) => e.preventDefault());
    this.fields = {};

    const num = (key, label, unit, hint) => {
      const id = `dg-${key}`;
      const i = h('input', { id, type: 'text', inputmode: 'decimal', value: s[key] ?? '', placeholder: '—' });
      i.addEventListener('input', () => {
        s[key] = i.value;
        this.soon();
      });
      const extra = h('span', { class: 'dg-sat', id: `${id}-sat` });
      this.fields[key] = { input: i, extra };
      return h('label', { class: 'dg-f', for: id }, h('span', { class: 'dg-l' }, label, hint && h('small', {}, hint)), h('span', { class: 'dg-in' }, i, h('span', { class: 'dg-u' }, unit)), extra);
    };
    const pick = (key, label, options) => {
      const c = seg(label, options, s[key] ?? '', (v) => {
        s[key] = v;
        this.soon();
      });
      c.classList.add('dg-seg');
      return c;
    };
    const flag = (key, label) => {
      const i = h('input', { type: 'checkbox', id: `dg-f-${key}`, checked: !!s.flags[key] });
      i.addEventListener('change', () => {
        s.flags[key] = i.checked;
        this.soon();
      });
      return h('label', { class: 'dg-check', for: `dg-f-${key}` }, i, label);
    };

    // Refrigerante e instalación.
    const refSel = h('select', { id: 'dg-ref' }, REFRIGERANT_IDS.map((id) => h('option', { value: id, selected: id === s.refrigerant }, REFRIGERANTS[id].label)));
    refSel.addEventListener('change', () => {
      s.refrigerant = refSel.value;
      this.refInfo();
      this.pt.refresh();
      this.soon();
    });
    const appSel = h('select', { id: 'dg-app' }, Object.entries(APPS).map(([k, a]) => h('option', { value: k, selected: k === s.app }, a.label)));
    appSel.addEventListener('change', () => {
      s.app = appSel.value;
      this.soon();
    });
    this.refInfoEl = h('p', { class: 'dg-refinfo' });
    // La regla P-T usa el refrigerante elegido aquí.
    this.pt = ptConverter({ params: () => ({ refrigerant: this.state.refrigerant }) });

    form.append(
      h('fieldset', { class: 'dg-fs' }, h('legend', {}, '1 · Máquina'),
        h('label', { class: 'dg-f', for: 'dg-ref' }, h('span', { class: 'dg-l' }, 'Refrigerante'), refSel),
        this.refInfoEl,
        h('label', { class: 'dg-f', for: 'dg-app' }, h('span', { class: 'dg-l' }, 'Tipo de instalación'), appSel),
        pick('expansion', 'Expansión', EXPANSIONS),
      ),
      h('fieldset', { class: 'dg-fs' }, h('legend', {}, '2 · Manómetros (en marcha)'),
        num('LP', 'Presión de baja', 'bar'),
        num('HP', 'Presión de alta', 'bar'),
      ),
      h('fieldset', { class: 'dg-fs' }, h('legend', {}, '3 · Termómetros'),
        num('Tsuc', 'Tubería de aspiración', '°C', 'a la salida del evaporador, junto al bulbo'),
        num('Tliq', 'Tubería de líquido', '°C', 'a la salida del condensador o del recipiente'),
        num('Troom', 'Aire de la cámara / sala', '°C', 'el que entra al evaporador'),
        num('Tamb', 'Aire exterior', '°C', 'el que entra al condensador'),
        num('Tdis', 'Tubería de descarga', '°C', 'opcional'),
        num('filterDT', 'Caída de temperatura en el filtro', 'K', 'opcional: entrada − salida'),
      ),
      h('fieldset', { class: 'dg-fs' }, h('legend', {}, '4 · Compresor'),
        num('amps', 'Intensidad medida', 'A', 'opcional'),
        num('ampsNom', 'Intensidad de placa', 'A', 'opcional'),
        pick('comp', 'Cómo funciona', { '': 'No sé', marcha: 'En marcha continua', ciclos: 'Ciclos cortos', pb: 'Para por baja', pa: 'Salta el de alta', termico: 'Salta el térmico', noArranca: 'No arranca' }),
      ),
      h('fieldset', { class: 'dg-fs' }, h('legend', {}, '5 · Lo que se ve'),
        pick('sight', 'Visor de líquido', { '': 'No sé', lleno: 'Lleno', burbujas: 'Burbujas', vacio: 'Sin líquido', humedad: 'Indicador de humedad' }),
        pick('ice', 'Batería del evaporador', { '': 'No sé', no: 'Sin hielo', parcial: 'Escarcha normal', entrada: 'Solo escarcha la entrada', bloqueado: 'Bloqueada de hielo', aspiracion: 'Aspiración escarchada hasta el compresor' }),
        pick('evapFan', 'Ventilador del evaporador', { '': 'No sé', ok: 'Gira', parado: 'Parado' }),
        pick('condFan', 'Ventilador del condensador', { '': 'No sé', ok: 'Gira', parado: 'Parado' }),
        pick('solenoid', '¿Tiene solenoide de líquido?', { '': 'No sé', si: 'Sí', no: 'No' }),
        h('div', { class: 'dg-checks' },
          flag('oil', 'Manchas de aceite en alguna unión'),
          flag('recent', 'Intervención o carga reciente'),
          flag('filterCold', 'Filtro frío, sudando o escarchado'),
          flag('condDirty', 'Condensador sucio'),
          flag('bulbLoose', 'Bulbo suelto o sin aislar'),
          flag('equalizeFast', 'Al parar, las presiones se igualan enseguida'),
          flag('noCool', 'No llega a temperatura'),
          flag('recentLoad', 'Género caliente o puerta abierta hace poco'),
          flag('intermittent', 'La baja cae y se recupera al calentar la válvula'),
        ),
      ),
      h('fieldset', { class: 'dg-fs' }, h('legend', {}, '6 · Prueba en parado y carga (opcional)'),
        num('standP', 'Presión con la máquina parada', 'bar', 'tras horas parada, todo a temperatura ambiente'),
        num('standT', 'Temperatura ambiente en ese momento', '°C'),
        num('chargeKg', 'Carga de la placa', 'kg', 'para calcular las t CO₂ eq'),
      ),
      h('div', { class: 'dg-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => this.fromSim() }, 'Usar las lecturas del simulador'),
        h('button', { class: 'btn', type: 'button', onclick: () => this.load(EXAMPLE) }, 'Cargar un ejemplo'),
        h('button', { class: 'btn', type: 'button', onclick: () => this.load({ refrigerant: s.refrigerant, app: s.app, expansion: s.expansion }) }, 'Borrar medidas'),
      ),
    );

    this.out = h('div', { class: 'dg-out', 'aria-live': 'polite' });
    const phWrap = h('div', { class: 'dg-ph' }, h('h3', {}, 'Tu ciclo en el diagrama P-h'), h('canvas', { id: 'dg-ph-canvas' }));
    this.phWrap = phWrap;
    this.ptWrap = h('div', { class: 'dg-pt' });
    el.append(
      h('div', { class: 'dg-intro' },
        h('h2', {}, 'Diagnosticar una máquina real'),
        h('p', {}, 'Elige el refrigerante y escribe lo que marcan tus manómetros y termómetros. Con solo las presiones ya te digo las temperaturas de saturación; cuantas más medidas añadas, más fino es el diagnóstico.'),
      ),
      h('div', { class: 'dg-cols' }, form, h('div', { class: 'dg-right' }, this.out, phWrap, this.ptWrap)),
    );
    this.ph = new PHChart(phWrap.querySelector('canvas'));
    this.refInfo();
  }

  refInfo() {
    const r = getRefrigerant(this.state.refrigerant);
    const cls = { A1: 'no inflamable', A2L: 'poco inflamable', A3: 'inflamable', B2L: 'tóxico' }[r.safety] || '';
    this.refInfoEl.textContent = `${r.composition} · ${r.safety} (${cls}) · PCA ${r.gwp}${r.zeotropic ? ' · mezcla con deslizamiento: baja en rocío, alta en burbuja' : ''}${r.sim ? '' : ' · no disponible en el simulador'}`;
  }

  load(values) {
    this.state = { refrigerant: 'R404A', app: 'positiva', expansion: 'txv', sight: '', ice: '', evapFan: '', condFan: '', comp: '', solenoid: '', flags: {}, ...values };
    this.build();
    this.compute();
  }

  fromSim() {
    const r = this.app.simReadings();
    if (!r) {
      this.app.snack('Pon en marcha el simulador (con circuito frigorífico) para usar sus lecturas.');
      return;
    }
    const f = (v, d = 1) => (Number.isFinite(v) ? String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',') : '');
    this.load({
      refrigerant: r.refrigerant,
      app: r.app,
      expansion: r.expansion,
      LP: f(r.LP, 2),
      HP: f(r.HP, 2),
      Tsuc: f(r.Tsuc),
      Tliq: f(r.Tliq),
      Troom: f(r.Troom),
      Tamb: f(r.Tamb),
      Tdis: f(r.Tdis, 0),
      amps: f(r.amps),
      ampsNom: f(r.ampsNom),
      filterDT: f(r.filterDT),
      sight: r.sight,
      ice: r.ice,
      evapFan: r.evapFan,
      condFan: r.condFan,
      comp: r.comp,
      solenoid: r.solenoid,
    });
  }

  soon() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.compute(), 120);
  }

  // ---------------------------------------------------------------- resultado
  compute() {
    const s = this.state;
    this.save();
    const m = {};
    for (const [k, v] of Object.entries(s)) m[k] = typeof v === 'string' ? v.replace(',', '.') : v;
    const r = diagnoseReadings(m);
    this.last = r;
    const c = r.computed;
    const ref = r.ref;
    // Temperaturas de saturación junto a las presiones.
    const sat = (key, text) => {
      const f = this.fields[key];
      if (f) f.extra.textContent = text || '';
    };
    sat('LP', c.Te !== undefined ? `= ${fmt(c.Te)} °C${ref.zeotropic ? ` rocío (${fmt(c.TeBub)} burbuja)` : ''}` : '');
    sat('HP', c.Tc !== undefined ? `= ${fmt(c.Tc)} °C${ref.zeotropic ? ` burbuja (${fmt(c.TcDew)} rocío)` : ''}` : '');
    sat('Tsuc', c.SH !== undefined ? `recalentamiento ${fmt(c.SH)} K` : '');
    sat('Tliq', c.SC !== undefined ? `subenfriamiento ${fmt(c.SC)} K` : '');
    sat('Troom', c.TD !== undefined ? `salto evaporador ${fmt(c.TD)} K` : '');
    sat('Tamb', c.approach !== undefined ? `salto condensador ${fmt(c.approach)} K` : '');
    sat('Tdis', c.TdisEst !== undefined ? `esperable ≈ ${fmt(c.TdisEst, 0)} °C` : '');
    sat('standP', c.standstill ? `saturación a ${fmt(c.standstill.T)} °C = ${fmt(c.standstill.Psat, 2)} bar (${c.standstill.excess > 0 ? '+' : ''}${fmt(c.standstill.excess, 2)})` : '');

    const out = this.out;
    out.innerHTML = '';
    out.append(h('p', { class: 'dg-summary' }, r.summary));
    if (r.vars.length) {
      const tb = h('table', { class: 'dg-table' }, h('tbody', {}, r.vars.map((v) =>
        h('tr', {}, h('th', {}, v.label), h('td', { class: 'v' }, `${fmt(v.value, v.unit === 'bar' ? 2 : 1)} ${v.unit}`),
          h('td', {}, v.level === null || v.level === undefined ? '' : h('span', { class: `pill ${LVC[v.level]}` }, LVT[v.level])),
          h('td', { class: 'sub' }, [v.note, v.band && `normal: ${v.band}`].filter(Boolean).join(' · '))))));
      out.append(h('div', { class: 'dg-scroll' }, tb));
    }
    if (r.warnings.length) out.append(h('ul', { class: 'dg-warn' }, r.warnings.map((w) => h('li', {}, w))));

    const hyps = r.hypotheses.filter((x) => x.confidence > 0.04).slice(0, 4);
    if (hyps.length) {
      out.append(h('h3', {}, 'Qué le puede pasar'));
      hyps.forEach((x, i) => out.append(this.hypCard(x, i === 0, r)));
    }
    if (r.next.length) out.append(h('div', { class: 'dg-next' }, h('h3', {}, 'Qué medir ahora'), h('ol', {}, r.next.map((t) => h('li', {}, t)))));

    // Diagrama P-h de lo medido.
    const phOk = c.Te !== undefined && c.Tc !== undefined;
    this.phWrap.hidden = !phOk;
    if (phOk) {
      const Tsuc = num(s.Tsuc) ?? c.Te + 8;
      const Tliq = num(s.Tliq) ?? c.Tc - 4;
      const Tdis = num(s.Tdis) ?? c.TdisEst;
      const h1 = hVap(ref, c.Te) + cpVap(ref, c.Te) * Math.max(Tsuc - c.Te, 0);
      const h3 = hLiq(ref, Math.min(Tliq, c.Tc));
      const h2 = hVap(ref, c.TcDew) + cpVap(ref, c.TcDew) * Math.max(Tdis - c.TcDew, 0);
      requestAnimationFrame(() => this.ph.draw({ refrigerant: ref.id, running: true, ph: { h1, h2, h3, h4: h3, Pe: absolute(num(s.LP)), Pc: absolute(num(s.HP)) } }));
    }
    this.ptTable(ref);
  }

  hypCard(x, open, r) {
    const pct = Math.round(x.confidence * 100);
    const det = h('details', { class: `dg-hyp${x.id === 'normal' ? ' normal' : ''}`, open: open || undefined });
    det.append(
      h('summary', {},
        h('span', { class: 'dg-hname' }, x.name),
        h('span', { class: 'dg-bar', 'aria-label': `${pct} %` }, h('i', { style: `width:${pct}%` })),
        h('span', { class: 'dg-pct' }, `${pct} %`)),
    );
    if (x.what) det.append(h('p', {}, x.what));
    if (x.evidence && x.evidence.length) {
      det.append(h('h4', {}, 'Por qué lo creo'), h('ul', { class: 'dg-ev' }, x.evidence.map((e) => h('li', { class: e.ok ? 'ok' : 'no' }, e.text))));
    }
    if (x.checks && x.checks.length) det.append(h('h4', {}, 'Qué comprobar'), h('ul', {}, x.checks.map((t) => h('li', {}, t))));
    if (x.fix && x.fix.length) det.append(h('h4', {}, 'Solución'), h('ul', {}, x.fix.map((t) => h('li', {}, t))));
    if (x.leak) {
      const g = LEAK_GUIDE;
      const leak = h('div', { class: 'dg-leak' },
        h('h4', {}, 'Dónde buscar la fuga'), h('ol', {}, g.where.map((t) => h('li', {}, t))),
        h('h4', {}, 'Cómo buscarla'), h('ul', {}, g.how.map((t) => h('li', {}, t))),
        h('h4', {}, 'Antes de volver a cargar'), h('ul', {}, g.after.map((t) => h('li', {}, t))));
      if (r.leak) leak.append(h('p', { class: 'note' }, `Carga de placa = ${fmt(r.leak.tco2, 1)} t CO₂ eq. ${r.leak.every ? `Control de fugas obligatorio ${r.leak.every}.` : 'Por debajo de 5 t CO₂ eq no hay control periódico obligatorio.'}`));
      det.append(leak);
    }
    if (x.sim !== null && x.sim !== undefined) {
      det.append(h('div', { class: 'row' }, h('button', { class: 'btn small primary', type: 'button', onclick: () => this.app.simulateFault(x, this.state) }, 'Ver esta avería en el simulador')));
    }
    return det;
  }

  ptTable(ref) {
    const rows = [];
    for (let T = -40; T <= 60; T += 5) {
      if (T > ref.Tc - 2) break;
      rows.push(h('tr', {}, h('td', {}, `${T} °C`),
        h('td', {}, fmt(gauge(psatDew(ref, T)), 2)),
        ref.zeotropic ? h('td', {}, fmt(gauge(psatBubble(ref, T)), 2)) : null));
    }
    this.ptWrap.innerHTML = '';
    this.ptWrap.append(
      h('details', {}, h('summary', {}, `Tabla presión-temperatura del ${ref.id} (bar manométricos)`),
        h('div', { class: 'dg-scroll' }, h('table', { class: 'dg-pttable' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Temperatura'), h('th', {}, ref.zeotropic ? 'Rocío (baja)' : 'Presión'), ref.zeotropic ? h('th', {}, 'Burbuja (alta)') : null)),
          h('tbody', {}, rows)))),
      this.pt,
    );
    this.pt.refresh();
  }
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
