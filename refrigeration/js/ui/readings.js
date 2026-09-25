// Barra de lecturas tipo analizador digital (siempre visible en el simulador).

import { h } from './dom.js';

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const LV = { '-2': 'low', '-1': 'low', 0: 'ok', 1: 'high', 2: 'high' };
const LVT = { '-2': 'muy bajo', '-1': 'bajo', 0: 'normal', 1: 'alto', 2: 'muy alto' };

/**
 * Valores numéricos que enseña la barra. La aspiración y el recalentamiento
 * se miden a la salida del evaporador (junto al bulbo), como en la práctica.
 */
export function readingVM(o) {
  return {
    PeG: o.PeG, Te: o.Te, Tsuc: o.TevapOut, SH: o.SHevap, TD: o.TD,
    PcG: o.PcG, Tc: o.Tc, Tliq: o.Tliq, SC: o.SC, condDT: o.condDT,
    current: o.current, Tdis: o.Tdis, pr: o.pr, Wel: o.Wel,
    Qref: o.Qref, cop: o.cop, flowkg: o.mComp * 3600,
  };
}

export class Readings {
  constructor(el, { onPart } = {}) {
    this.el = el;
    this.onPart = onPart;
    this.cells = {};
    el.innerHTML = '';
    const grp = (cls, part, title, main, unit, rows) => {
      const g = h('div', { class: `rd rd-${cls}`, 'data-part': part, tabindex: '0', role: 'button', 'aria-label': title });
      const head = h('div', { class: 'rd-h' }, h('span', {}, title));
      if (cls === 'lp') {
        this.refEl = h('span', { class: 'rd-ref', 'data-part': 'refrigerant', title: 'Cambiar el refrigerante' }, '');
        head.append(this.refEl);
      }
      const mv = h('b', { class: 'rd-v' }, '—');
      const mu = h('span', { class: 'rd-u' }, unit);
      const mp = h('span', { class: 'rd-p' }, '');
      this.cells[main] = { v: mv, p: mp };
      g.append(head, h('div', { class: 'rd-main' }, mv, mu, mp));
      const dl = h('dl', { class: 'rd-rows' });
      for (const [k, label] of rows) {
        const dd = h('dd', {}, '—');
        const pp = h('span', { class: 'rd-p' }, '');
        const row = h('div', { class: 'rd-row', 'data-k': k }, h('dt', {}, label), h('div', { class: 'rd-dd' }, dd, pp));
        this.cells[k] = { v: dd, p: pp, row };
        dl.append(row);
      }
      g.append(dl);
      g.addEventListener('click', (e) => this.onPart && this.onPart(e.target.closest('[data-part]').dataset.part, e));
      g.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && this.onPart) {
          e.preventDefault();
          this.onPart(part, e);
        }
      });
      el.append(g);
      return g;
    };
    grp('lp', 'gLP', 'BAJA', 'PeG', 'bar', [['Te', 'evapora a'], ['Tsuc', 'salida evaporador'], ['SH', 'recalentamiento'], ['TD', 'salto evaporador']]);
    grp('hp', 'gHP', 'ALTA', 'PcG', 'bar', [['Tc', 'condensa a'], ['Tliq', 'línea de líquido'], ['SC', 'subenfriamiento'], ['condDT', 'salto condensador']]);
    grp('comp', 'comp', 'COMPRESOR', 'current', 'A', [['state', 'estado'], ['Tdis', 'descarga'], ['pr', 'relación comp.'], ['Wel', 'consumo']]);
    grp('room', 'room', 'CÁMARA', 'Troom', '°C', [['sp', 'termostato'], ['Tprod', 'género'], ['Tamb', 'exterior'], ['ice', 'hielo batería']]);
    grp('perf', 'receiver', 'RENDIMIENTO', 'Qref', 'kW', [['cop', 'COP'], ['charge', 'carga'], ['sight', 'visor'], ['flowkg', 'caudal']]);
    const v = h('div', { class: 'rd rd-verdict', 'data-part': 'verdict', role: 'button', tabindex: '0', 'aria-live': 'polite', title: 'Ver el análisis de las lecturas' });
    v.addEventListener('click', (e) => this.onPart && this.onPart('verdict', e));
    v.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && this.onPart) {
        e.preventDefault();
        this.onPart('verdict', e);
      }
    });
    this.verdictH = h('div', { class: 'rd-h' }, h('span', {}, 'ESTADO'));
    this.verdict = h('p', { class: 'rd-vt' }, '—');
    this.verdictSub = h('p', { class: 'rd-vs' }, '');
    v.append(this.verdictH, this.verdict, this.verdictSub);
    el.append(v);
  }

  set(k, text, pred, level) {
    const c = this.cells[k];
    if (!c) return;
    if (c.v.textContent !== text) c.v.textContent = text;
    const p = pred === undefined || pred === null || pred === '' ? '' : `→ ${pred}`;
    if (c.p.textContent !== p) c.p.textContent = p;
    const cls = level === null || level === undefined ? '' : `lv-${LV[level]}`;
    const target = c.row || c.v;
    if (target.dataset.lv !== cls) {
      target.dataset.lv = cls;
      target.className = target.className.replace(/\s*lv-\w+/g, '') + (cls ? ` ${cls}` : '');
      if (c.row) c.row.title = level === null || level === undefined ? '' : LVT[level];
    }
  }

  /**
   * o: salida del modelo; ctx: { levels: {SH, SC, LP, HP, Tdis, amps}, pred: valores previstos
   *   (solo los que cambian, como readingVM), thermostat: {stop, start}, verdict: {text, sub, cls}, hideLevels }
   */
  update(o, ctx = {}) {
    if (!o) return;
    const L = ctx.hideLevels ? {} : ctx.levels || {};
    const P = ctx.pred;
    const V = readingVM(o);
    const pr = (k, d = 1) => (P && Number.isFinite(P[k]) ? fmt(P[k], d) : null);
    const run = o.running;
    this.refEl.textContent = `${o.refrigerant} ▾`;
    this.set('PeG', fmt(V.PeG, 2), pr('PeG', 2));
    this.set('Te', `${fmt(V.Te)} °C${o.zeotropic ? ' (rocío)' : ''}`, pr('Te'));
    this.set('Tsuc', `${fmt(V.Tsuc)} °C`, pr('Tsuc'));
    this.set('SH', run ? `${fmt(V.SH)} K` : '—', pr('SH'), run ? L.SH : null);
    this.set('TD', run ? `${fmt(V.TD)} K` : '—', pr('TD'), run ? L.LP : null);
    this.set('PcG', fmt(V.PcG, 2), pr('PcG', 2));
    this.set('Tc', `${fmt(V.Tc)} °C${o.zeotropic ? ' (burb.)' : ''}`, pr('Tc'));
    this.set('Tliq', `${fmt(V.Tliq)} °C`, pr('Tliq'));
    this.set('SC', run ? `${fmt(V.SC)} K` : '—', pr('SC'), run ? L.SC : null);
    this.set('condDT', run ? `${fmt(V.condDT)} K` : '—', pr('condDT'), run ? L.HP : null);
    this.set('current', fmt(V.current, 1), pr('current'), run ? L.amps : null);
    this.set('state', o.locked ? 'BLOQUEADO' : run ? 'en marcha' : 'parado', null, o.locked ? 2 : null);
    this.set('Tdis', `${fmt(V.Tdis, 0)} °C`, pr('Tdis', 0), run ? L.Tdis : null);
    this.set('pr', run ? fmt(V.pr, 1) : '—', pr('pr'));
    this.set('Wel', run ? `${fmt(V.Wel, 2)} kW` : '—', pr('Wel', 2));
    this.set('Troom', fmt(o.Troom, 1));
    const th = ctx.thermostat;
    this.set('sp', th ? `${fmt(th.stop)} → ${fmt(th.start)} °C` : 'sin termostato');
    this.set('Tprod', `${fmt(o.Tprod)} °C`);
    this.set('Tamb', `${fmt(o.Tamb)} °C`);
    this.set('ice', `${fmt(o.ice, 2)} kg`, null, o.frostFactor < 0.5 ? 2 : o.frostFactor < 0.8 ? 1 : null);
    this.set('Qref', fmt(V.Qref, 2), pr('Qref', 2));
    this.set('cop', run ? fmt(V.cop, 2) : '—', pr('cop', 2));
    this.set('charge', `${fmt(o.chargeKg, 2)} kg (${Math.round(o.chargePct)} %)`, null, o.chargePct < 85 ? -1 : o.chargePct > 115 ? 1 : null);
    this.set('sight', o.flash > 0.08 && run ? 'burbujas' : 'lleno', null, o.flash > 0.08 && run ? 1 : null);
    this.set('flowkg', run ? `${fmt(V.flowkg, 0)} kg/h` : '—', pr('flowkg', 0));
    const vd = ctx.verdict || { text: '—', sub: '' };
    if (this.verdict.textContent !== vd.text) this.verdict.textContent = vd.text;
    if (this.verdictSub.textContent !== (vd.sub || '')) this.verdictSub.textContent = vd.sub || '';
    this.verdict.parentElement.dataset.state = vd.cls || '';
  }
}
