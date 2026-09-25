// Tarjetas emergentes: al tocar una pieza se abre una tarjeta con qué es,
// sus valores en vivo y controles para cambiarla. En pantallas estrechas se
// muestra como hoja inferior.

import { h } from './dom.js';

export class Cards {
  constructor() {
    this.el = h('div', { class: 'card', role: 'dialog', 'aria-modal': 'false', hidden: true });
    document.body.append(this.el);
    this.cur = null;
    document.addEventListener('pointerdown', (e) => {
      if (!this.cur) return;
      if (this.el.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-part], .comp, .keep-card')) return;
      this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.cur) {
        this.close();
        e.stopPropagation();
      }
    }, true);
    window.addEventListener('resize', () => this.cur && this._place());
  }

  /**
   * spec: { key, kicker, title, what, render(body), update(body), onClose, x, y }
   */
  open(spec) {
    if (this.cur && this.cur.onClose) this.cur.onClose();
    this.cur = spec;
    const el = this.el;
    el.innerHTML = '';
    const close = h('button', { class: 'card-x', type: 'button', 'aria-label': 'Cerrar', onclick: () => this.close() }, '×');
    const head = h('header', { class: 'card-head' },
      h('div', {}, spec.kicker && h('div', { class: 'card-kicker' }, spec.kicker), h('h3', {}, spec.title)),
      close,
    );
    const body = h('div', { class: 'card-body' });
    if (spec.what) body.append(h('p', { class: 'card-what' }, spec.what));
    el.append(head, body);
    spec.body = body;
    spec.render && spec.render(body);
    spec.update && spec.update(body);
    el.hidden = false;
    this._place();
    requestAnimationFrame(() => this._place());
  }

  _place() {
    const s = this.cur;
    if (!s) return;
    const el = this.el;
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (W < 700) {
      el.classList.add('sheet');
      el.style.left = '';
      el.style.top = '';
      return;
    }
    el.classList.remove('sheet');
    const r = el.getBoundingClientRect();
    const m = 12;
    let x = (s.x ?? W / 2) + 16;
    let y = (s.y ?? H / 3) - 40;
    if (x + r.width > W - m) x = (s.x ?? W / 2) - r.width - 16;
    if (x < m) x = Math.max(m, Math.min(W - r.width - m, (s.x ?? W / 2) - r.width / 2));
    y = Math.max(m + 50, Math.min(H - r.height - m, y));
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
  }

  refresh() {
    const s = this.cur;
    if (s && s.update) s.update(s.body);
  }

  /** Vuelve a construir la tarjeta abierta (por ejemplo tras un cambio de estructura). */
  rerender() {
    const s = this.cur;
    if (!s) return;
    const keep = { ...s };
    this.cur = null;
    this.open(keep);
  }

  close() {
    const s = this.cur;
    this.cur = null;
    this.el.hidden = true;
    if (s && s.onClose) s.onClose();
  }

  isOpen(key) {
    return !!this.cur && this.cur.key === key;
  }
}

// ------------------------------------------------------------ controles
const fmtN = (v, d) => Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Paso a paso: − valor +. */
export function stepper(label, value, { step = 1, min = -Infinity, max = Infinity, unit = '', digits = null, id } = {}, onChange) {
  const d = digits ?? (String(step).includes('.') ? String(step).split('.')[1].length : 0);
  let v = value;
  const out = h('input', { class: 'step-v', type: 'text', inputmode: 'decimal', id, value: fmtN(v, d), 'aria-label': label });
  const set = (nv, fire = true) => {
    nv = Math.min(max, Math.max(min, Math.round(nv / step) * step));
    v = nv;
    out.value = fmtN(v, d);
    if (fire) onChange(v);
  };
  out.addEventListener('change', () => {
    const n = parseFloat(out.value.replace(',', '.'));
    if (Number.isFinite(n)) set(n);
    else out.value = fmtN(v, d);
  });
  const minus = h('button', { class: 'step-b', type: 'button', 'aria-label': `Bajar ${label}`, onclick: () => set(v - step) }, '−');
  const plus = h('button', { class: 'step-b', type: 'button', 'aria-label': `Subir ${label}`, onclick: () => set(v + step) }, '+');
  const wrap = h('div', { class: 'ctl ctl-step' }, h('span', { class: 'ctl-l' }, label), h('div', { class: 'stepper' }, minus, out, unit && h('span', { class: 'step-u' }, unit), plus));
  wrap.setValue = (nv) => set(nv, false);
  return wrap;
}

/** Deslizador con valor. */
export function slider(label, value, { min = 0, max = 100, step = 1, unit = '', format, id } = {}, onInput) {
  const f = format || ((x) => `${fmtN(x, String(step).includes('.') ? 1 : 0)} ${unit}`.trim());
  const val = h('span', { class: 'ctl-v' }, f(value));
  const i = h('input', { type: 'range', id, min, max, step, value, 'aria-label': label });
  i.addEventListener('input', () => {
    val.textContent = f(+i.value);
    onInput(+i.value);
  });
  const wrap = h('div', { class: 'ctl ctl-range' }, h('span', { class: 'ctl-l' }, label, val), i);
  wrap.setValue = (x) => {
    i.value = x;
    val.textContent = f(x);
  };
  return wrap;
}

/** Interruptor sí/no. */
export function toggle(label, checked, onChange, { danger = false, id } = {}) {
  const i = h('input', { type: 'checkbox', role: 'switch', id, checked: !!checked });
  i.addEventListener('change', () => onChange(i.checked));
  const wrap = h('label', { class: `ctl ctl-toggle${danger ? ' danger' : ''}` }, i, h('span', { class: 'sw' }), h('span', { class: 'ctl-l' }, label));
  wrap.setValue = (x) => (i.checked = !!x);
  return wrap;
}

/** Opciones excluyentes (botones). */
export function seg(label, options, value, onChange) {
  const btns = [];
  const box = h('div', { class: 'segs', role: 'radiogroup', 'aria-label': label });
  for (const [k, l] of Object.entries(options)) {
    const b = h('button', { type: 'button', class: `segb${String(k) === String(value) ? ' on' : ''}`, role: 'radio', 'aria-checked': String(String(k) === String(value)) }, l);
    b.addEventListener('click', () => {
      for (const x of btns) {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      }
      onChange(k);
    });
    btns.push(b);
    box.append(b);
  }
  const wrap = h('div', { class: 'ctl ctl-seg' }, label && h('span', { class: 'ctl-l' }, label), box);
  wrap.setValue = (v) => btns.forEach((b, i) => {
    const on = String(Object.keys(options)[i]) === String(v);
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  });
  return wrap;
}

/** Desplegable con etiqueta. options: {valor: texto}. */
export function select(label, options, value, onChange) {
  const s = h('select', { class: 'ctl-select', 'aria-label': label }, Object.entries(options).map(([k, l]) => h('option', { value: k, selected: String(k) === String(value) }, l)));
  s.addEventListener('change', () => onChange(s.value));
  const wrap = h('label', { class: 'ctl ctl-sel' }, h('span', { class: 'ctl-l' }, label), s);
  wrap.setValue = (v) => {
    if (s.value !== String(v)) s.value = String(v);
  };
  return wrap;
}

/** Lista de valores en vivo: [[clave, etiqueta]] → actualiza con set(obj). */
export function values(rows) {
  const dl = h('dl', { class: 'vals' });
  const map = {};
  for (const [k, l] of rows) {
    const dd = h('dd', {}, '—');
    map[k] = dd;
    dl.append(h('div', { class: 'vrow', 'data-k': k }, h('dt', {}, l), dd));
  }
  dl.set = (obj) => {
    for (const [k, v] of Object.entries(obj)) {
      if (!map[k]) continue;
      const txt = typeof v === 'object' && v !== null ? v.text : v;
      if (map[k].textContent !== txt) map[k].textContent = txt;
      const cls = typeof v === 'object' && v !== null ? v.cls || '' : '';
      map[k].className = cls;
    }
  };
  return dl;
}

export function section(title, ...kids) {
  return h('section', { class: 'card-sec' }, title && h('h4', {}, title), ...kids);
}
