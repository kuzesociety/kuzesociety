// Ayudante para construir esquemas desde código (ejemplos y pruebas).

import { TYPES, termPos } from './components.js';

export class Builder {
  constructor() {
    this.components = [];
    this.wires = [];
    this.n = 0;
  }

  add(type, x, y, props = {}, rot = 0) {
    const T = TYPES[type];
    if (!T) throw new Error(`Tipo desconocido: ${type}`);
    const c = {
      id: `c${++this.n}`,
      type,
      x,
      y,
      rot,
      props: { tag: '', name: '', ...(T.defaults || {}), ...props },
    };
    this.components.push(c);
    return c;
  }

  /** Posición absoluta del borne `name` del componente `c`. */
  t(c, name) {
    const t = TYPES[c.type].terms.find((q) => q.n === name);
    if (!t) throw new Error(`${c.type} no tiene borne ${name}`);
    return termPos(c, t);
  }

  /**
   * Cable ortogonal que pasa por los puntos dados. Entre dos puntos que no
   * están alineados se añade una esquina (primero vertical, luego horizontal,
   * salvo que se pida lo contrario con {h: true} como primer argumento).
   */
  wire(...pts) {
    let hFirst = false;
    if (pts.length && !Array.isArray(pts[0])) hFirst = !!pts.shift().h;
    const out = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (last && last[0] !== p[0] && last[1] !== p[1]) {
        out.push(hFirst ? [p[0], last[1]] : [last[0], p[1]]);
      }
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push([p[0], p[1]]);
    }
    if (out.length >= 2) this.wires.push({ id: `w${this.wires.length + 1}`, points: out });
    return this;
  }

  /**
   * Coloca una serie de componentes en vertical empezando en (x, yTop) —un
   * punto que normalmente está sobre la barra superior— y termina con un
   * cable hasta y = yBottom. Cada elemento: {type, props, in, out, ref}.
   * Devuelve un mapa ref → componente.
   */
  series(x, yTop, specs, yBottom, gap = 1) {
    const refs = {};
    let prev = [x, yTop];
    let cy = yTop + gap;
    for (const s of specs) {
      if (s.gap) {
        cy += s.gap;
        continue;
      }
      const T = TYPES[s.type];
      const tin = T.terms.find((q) => q.n === s.in);
      const c = this.add(s.type, prev[0] - tin.x, cy - tin.y, s.props || {});
      this.wire(prev, [prev[0], cy]);
      prev = this.t(c, s.out);
      cy = prev[1] + gap;
      if (s.ref) refs[s.ref] = c;
      refs.last = c;
    }
    if (yBottom !== undefined && yBottom !== null) this.wire(prev, [prev[0], yBottom]);
    refs.end = prev;
    return refs;
  }

  project(meta = {}) {
    return {
      version: 1,
      name: meta.name || 'Esquema',
      description: meta.description || '',
      components: this.components,
      wires: this.wires,
      refrig: meta.refrig || null,
      faults: meta.faults || null,
      view: meta.view || null,
    };
  }
}
