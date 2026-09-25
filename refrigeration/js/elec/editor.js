// Editor y visor del esquema eléctrico (SVG).

import { G, TYPES, termPos, compBox } from './components.js';
import { ElecSim } from './solver.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const MASTER_OF = { relay: 'coil', timer: 'tcoil', thermal: 'thermal3', clock: 'clock' };

export class SchematicEditor {
  /**
   * opts: {
   *   onSelect(sel)          — cambia la selección ({kind, id} | null)
   *   onChange()             — el esquema ha cambiado (guardar)
   *   onSimClick(id)         — clic sobre un aparato en simulación
   *   onSimPress(id, down)   — pulsador en simulación
   *   onHint(text)           — texto de ayuda contextual
   * }
   */
  constructor(svg, opts = {}) {
    this.svg = svg;
    this.opts = opts;
    this.project = { components: [], wires: [] };
    this.sim = null;
    this.tool = 'select';
    this.sel = null;
    this.vp = { x: 60, y: 120, k: 1 };
    this.history = [];
    this.future = [];
    this.pointers = new Map();
    this.drag = null;
    this.draft = null;
    this.placing = null;
    this.compEls = new Map();
    this.cache = new Map();
    this._build();
    this._bind();
  }

  // ------------------------------------------------------------------ DOM
  _build() {
    this.svg.innerHTML = `
<defs>
  <pattern id="ed-grid" width="${G}" height="${G}" x="${-G / 2}" y="${-G / 2}" patternUnits="userSpaceOnUse">
    <circle cx="${G / 2}" cy="${G / 2}" r="1" class="gridpt"/>
  </pattern>
</defs>
<g class="viewport">
  <rect class="gridbg" x="-40000" y="-40000" width="80000" height="80000" fill="url(#ed-grid)"/>
  <g class="wires"></g>
  <g class="comps"></g>
  <g class="junctions"></g>
  <g class="overlay"></g>
</g>`;
    this.gView = this.svg.querySelector('.viewport');
    this.gWires = this.svg.querySelector('.wires');
    this.gComps = this.svg.querySelector('.comps');
    this.gJunc = this.svg.querySelector('.junctions');
    this.gOver = this.svg.querySelector('.overlay');
    this._applyView();
  }

  _applyView() {
    const { x, y, k } = this.vp;
    this.gView.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${k.toFixed(4)})`);
    this.svg.classList.toggle('zoomed-out', k < 0.55);
  }

  setProject(project, { keepView = false } = {}) {
    this.project = project;
    this.sel = null;
    this.draft = null;
    this.history = [];
    this.future = [];
    this.render();
    if (!keepView) this.zoomToFit();
    this._select(null);
  }

  setSim(sim) {
    this.sim = sim;
    this.draft = null;
    this.placing = null;
    this.tool = 'select';
    this.svg.classList.toggle('sim', !!sim);
    this.cache.clear();
    this.render();
  }

  // ------------------------------------------------------------- dibujo
  render() {
    this._renderWires();
    this._renderComps();
    this._renderJunctions();
    this._renderOverlay();
  }

  _ctx(c) {
    if (this.sim && this.sim.compById.has(c.id)) return this.sim.ctx(c);
    const T = TYPES[c.type];
    return { comp: c, st: T.initState ? T.initState(c) : {}, dev: null, load: null, sim: null };
  }

  _compHTML(c) {
    const T = TYPES[c.type];
    const b = T.getBox ? T.getBox(c) : T.box;
    const selected = this.sel && this.sel.kind === 'comp' && this.sel.id === c.id;
    let s = `<g transform="translate(${c.x * G},${c.y * G}) rotate(${c.rot || 0})">`;
    s += `<rect class="hit" x="${b[0] * G - 3}" y="${b[1] * G - 3}" width="${(b[2] - b[0]) * G + 6}" height="${(b[3] - b[1]) * G + 6}" rx="4"/>`;
    s += T.draw(this._ctx(c));
    if (!this.sim) for (const t of T.terms) s += `<circle class="term" cx="${t.x * G}" cy="${t.y * G}" r="2.6"/>`;
    if (selected) s += `<rect class="selbox" x="${b[0] * G - 5}" y="${b[1] * G - 5}" width="${(b[2] - b[0]) * G + 10}" height="${(b[3] - b[1]) * G + 10}" rx="5"/>`;
    return s + '</g>';
  }

  _renderComps() {
    const seen = new Set();
    for (const c of this.project.components) {
      if (!TYPES[c.type]) continue;
      seen.add(c.id);
      let g = this.compEls.get(c.id);
      if (!g) {
        g = document.createElementNS(SVGNS, 'g');
        g.dataset.id = c.id;
        this.gComps.appendChild(g);
        this.compEls.set(c.id, g);
      }
      const T = TYPES[c.type];
      const interactive = this.sim && (T.click || T.momentary);
      g.setAttribute('class', `comp t-${c.type}${interactive ? ' clickable' : ''}`);
      const html = this._compHTML(c);
      if (this.cache.get(c.id) !== html) {
        g.innerHTML = html;
        this.cache.set(c.id, html);
      }
    }
    for (const [id, g] of this.compEls) {
      if (!seen.has(id)) {
        g.remove();
        this.compEls.delete(id);
        this.cache.delete(id);
      }
    }
  }

  _renderWires() {
    const sel = this.sel && this.sel.kind === 'wire' ? this.sel.id : null;
    let s = '';
    for (const w of this.project.wires) {
      if (!w.points || w.points.length < 2) continue;
      const pts = w.points.map(([x, y]) => `${x * G},${y * G}`).join(' ');
      let cls = 'wire';
      if (this.sim) {
        const ph = ElecSim.phaseName(this.sim.wireMaskById(w.id));
        if (ph === 'short') cls += ' short';
        else if (ph === 'N') cls += ' neutral';
        else if (ph) cls += ` live ph-${ph}`;
      }
      if (w.id === sel) cls += ' sel';
      s += `<g class="w" data-wid="${w.id}"><polyline class="wire-hit" points="${pts}"/><polyline class="${cls}" points="${pts}"/></g>`;
    }
    this.gWires.innerHTML = s;
  }

  _renderJunctions() {
    let pts = [];
    try {
      pts = this.sim ? this.sim.junctions : new ElecSim(this.project).junctions;
    } catch {
      pts = [];
    }
    const seen = new Set();
    let s = '';
    for (const [x, y] of pts) {
      const k = x + ',' + y;
      if (seen.has(k)) continue;
      seen.add(k);
      s += `<circle class="junction" cx="${x * G}" cy="${y * G}" r="3.2"/>`;
    }
    this.gJunc.innerHTML = s;
  }

  _renderOverlay() {
    let s = '';
    if (this.draft && this.draft.pts.length) {
      const pts = [...this.draft.pts];
      if (this.draft.cursor) pts.push(...lRoute(pts[pts.length - 1], this.draft.cursor));
      s += `<polyline class="draft" points="${pts.map(([x, y]) => `${x * G},${y * G}`).join(' ')}"/>`;
      const [cx, cy] = this.draft.cursor || pts[pts.length - 1];
      s += `<circle class="snap${this._connectable([cx, cy]) ? ' hot' : ''}" cx="${cx * G}" cy="${cy * G}" r="5"/>`;
    } else if (this.tool === 'wire' && this.hover) {
      const [x, y] = this.hover;
      s += `<circle class="snap${this._connectable(this.hover) ? ' hot' : ''}" cx="${x * G}" cy="${y * G}" r="5"/>`;
    }
    if (this.placing && this.placing.pos) {
      const c = { ...this.placing.comp, x: this.placing.pos[0], y: this.placing.pos[1] };
      s += `<g class="ghost">${this._compHTML(c)}</g>`;
    }
    this.gOver.innerHTML = s;
  }

  /** Refresco ligero durante la simulación. */
  refresh() {
    this._renderWires();
    this._renderComps();
  }

  // --------------------------------------------------------- coordenadas
  _world(e) {
    const r = this.svg.getBoundingClientRect();
    return [(e.clientX - r.left - this.vp.x) / this.vp.k, (e.clientY - r.top - this.vp.y) / this.vp.k];
  }

  _grid(e) {
    const [x, y] = this._world(e);
    return [Math.round(x / G), Math.round(y / G)];
  }

  zoomAt(factor, cx, cy) {
    const r = this.svg.getBoundingClientRect();
    const mx = cx ?? r.width / 2;
    const my = cy ?? r.height / 2;
    const k2 = Math.max(0.2, Math.min(4, this.vp.k * factor));
    const f = k2 / this.vp.k;
    this.vp.x = mx - (mx - this.vp.x) * f;
    this.vp.y = my - (my - this.vp.y) * f;
    this.vp.k = k2;
    this._applyView();
  }

  zoomToFit() {
    const r = this.svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of this.project.components) {
      if (!TYPES[c.type]) continue;
      const b = compBox(c);
      x0 = Math.min(x0, b[0] - 2.5);
      y0 = Math.min(y0, b[1]);
      x1 = Math.max(x1, b[2] + 1);
      y1 = Math.max(y1, b[3]);
    }
    for (const w of this.project.wires) {
      for (const [x, y] of w.points) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    if (!Number.isFinite(x0)) {
      this.vp = { x: 60, y: 80, k: 1 };
      this._applyView();
      return;
    }
    const pad = 24;
    const w = (x1 - x0) * G;
    const h = (y1 - y0) * G;
    const k = Math.max(0.2, Math.min(1.6, Math.min((r.width - 2 * pad) / w, (r.height - 2 * pad) / h)));
    this.vp.k = k;
    this.vp.x = (r.width - w * k) / 2 - x0 * G * k;
    this.vp.y = (r.height - h * k) / 2 - y0 * G * k;
    this._applyView();
  }

  // ------------------------------------------------------------- eventos
  _bind() {
    const svg = this.svg;
    svg.addEventListener('pointerdown', (e) => this._down(e));
    svg.addEventListener('pointermove', (e) => this._move(e));
    svg.addEventListener('pointerup', (e) => this._up(e));
    svg.addEventListener('pointercancel', (e) => this._up(e, true));
    svg.addEventListener('pointerleave', () => {
      if (this.draft) {
        this.draft.cursor = null;
        this._renderOverlay();
      }
    });
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (e.ctrlKey || !e.shiftKey) this.zoomAt(Math.exp(-d * 0.0015), e.clientX - r.left, e.clientY - r.top);
      else {
        this.vp.x -= d;
        this._applyView();
      }
    }, { passive: false });
    svg.addEventListener('dblclick', (e) => {
      if (this.draft) {
        e.preventDefault();
        this._finishWire();
      }
    });
    svg.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.draft) this._finishWire();
      else if (this.placing) this.setTool('select');
    });
  }

  _down(e) {
    this.svg.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (this.pointers.size === 2) {
      // Pellizco: zoom + desplazamiento con dos dedos.
      this.drag = { kind: 'pinch', ...this._pinchState() };
      return;
    }
    if (this.pointers.size > 2) return;
    const compEl = e.target.closest('.comp');
    const wireEl = e.target.closest('.w');
    const gp = this._grid(e);

    if (e.button === 1 || e.button === 2) {
      if (e.button === 1) this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.vp.x, vy: this.vp.y };
      return;
    }

    if (this.sim) {
      if (compEl) {
        const id = compEl.dataset.id;
        const c = this.project.components.find((q) => q.id === id);
        const T = TYPES[c.type];
        this._select({ kind: 'comp', id });
        if (T.momentary) {
          this.pressed = id;
          this.opts.onSimPress && this.opts.onSimPress(id, true);
        } else if (T.click) this.opts.onSimClick && this.opts.onSimClick(id);
        this.drag = { kind: 'none' };
        return;
      }
      this._select(null);
      this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.vp.x, vy: this.vp.y };
      return;
    }

    if (this.placing) {
      this._place(gp);
      return;
    }
    if (this.tool === 'wire') {
      this._wireClick(gp, e.pointerType !== 'mouse');
      return;
    }
    if (compEl) {
      const id = compEl.dataset.id;
      this._select({ kind: 'comp', id });
      const c = this.project.components.find((q) => q.id === id);
      this.drag = { kind: 'move', c, start: gp, orig: [c.x, c.y], attach: this._attachments(c), snap: this._snapshot(), moved: false };
      return;
    }
    if (wireEl) {
      this._select({ kind: 'wire', id: wireEl.dataset.wid });
      this.drag = { kind: 'none' };
      return;
    }
    this._select(null);
    this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.vp.x, vy: this.vp.y };
  }

  _pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, k: this.vp.k, vx: this.vp.x, vy: this.vp.y };
  }

  _move(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const d = this.drag;
    if (d && d.kind === 'pinch' && this.pointers.size === 2) {
      const now = this._pinchState();
      const r = this.svg.getBoundingClientRect();
      const k2 = Math.max(0.2, Math.min(4, d.k * (now.d / Math.max(d.d, 1))));
      const f = k2 / d.k;
      const mx = d.cx - r.left;
      const my = d.cy - r.top;
      this.vp.k = k2;
      this.vp.x = mx - (mx - d.vx) * f + (now.cx - d.cx);
      this.vp.y = my - (my - d.vy) * f + (now.cy - d.cy);
      this._applyView();
      return;
    }
    if (d && d.kind === 'pan') {
      this.vp.x = d.vx + (e.clientX - d.sx);
      this.vp.y = d.vy + (e.clientY - d.sy);
      this._applyView();
      return;
    }
    if (d && d.kind === 'move') {
      const gp = this._grid(e);
      const nx = d.orig[0] + gp[0] - d.start[0];
      const ny = d.orig[1] + gp[1] - d.start[1];
      if (nx !== d.c.x || ny !== d.c.y) {
        d.c.x = nx;
        d.c.y = ny;
        d.moved = true;
        this._applyAttachments(d.c, d.attach);
        this._renderWires();
        this._renderComps();
      }
      return;
    }
    if (this.sim) return;
    const gp = this._grid(e);
    if (this.placing) {
      this.placing.pos = gp;
      this._renderOverlay();
    } else if (this.tool === 'wire') {
      this.hover = gp;
      if (this.draft) this.draft.cursor = gp;
      this._renderOverlay();
    }
  }

  _up(e, cancel = false) {
    this.pointers.delete(e.pointerId);
    if (this.pressed) {
      this.opts.onSimPress && this.opts.onSimPress(this.pressed, false);
      this.pressed = null;
    }
    const d = this.drag;
    if (d && d.kind === 'pinch') {
      if (this.pointers.size < 2) this.drag = null;
      return;
    }
    this.drag = null;
    if (!d || cancel) return;
    if (d.kind === 'move' && d.moved) {
      for (const a of d.attach) a.w.points = simplify(a.w.points);
      this._pushHistory(d.snap);
      this.render();
      this._changed();
    }
  }

  // ------------------------------------------------------- herramientas
  setTool(tool) {
    this.tool = tool;
    this.draft = null;
    if (tool !== 'place') this.placing = null;
    this.svg.classList.toggle('tool-wire', tool === 'wire');
    this.svg.classList.toggle('tool-place', tool === 'place');
    this._renderOverlay();
    const hints = {
      select: 'Arrastra para mover · R gira · Supr borra · rueda o pellizco para zoom',
      wire: 'Cable: toca un punto para empezar; cada toque añade un tramo. Termina sobre un borne o cable, con doble clic o con Esc.',
      place: 'Toca en el esquema para colocar el componente · Esc para cancelar',
    };
    this.opts.onHint && this.opts.onHint(hints[tool] || '');
    if (this.opts.onTool) this.opts.onTool(tool);
  }

  startPlace(item) {
    if (this.sim) return;
    const T = TYPES[item.type];
    const props = { tag: '', name: '', ...(T.defaults || {}), ...item.props };
    this.placing = { item, comp: { id: 'ghost', type: item.type, x: 0, y: 0, rot: 0, props } };
    this.setTool('place');
  }

  _place(gp) {
    const item = this.placing.item;
    const snap = this._snapshot();
    const c = {
      id: this._newId('c'),
      type: item.type,
      x: gp[0],
      y: gp[1],
      rot: 0,
      props: JSON.parse(JSON.stringify(this.placing.comp.props)),
    };
    c.props.tag = this._autoTag(c, item.props && item.props.tag);
    this.project.components.push(c);
    this._pushHistory(snap);
    this.placing = null;
    this.setTool('select');
    this._select({ kind: 'comp', id: c.id });
    this.render();
    this._changed();
  }

  _newId(prefix) {
    const used = new Set([...this.project.components.map((c) => c.id), ...this.project.wires.map((w) => w.id)]);
    let n = used.size + 1;
    while (used.has(prefix + n)) n++;
    return prefix + n;
  }

  _autoTag(c, preset) {
    const T = TYPES[c.type];
    if (!T.tagPrefix) return c.props.tag || '';
    const comps = this.project.components;
    if (T.slaveOf) {
      if (preset) return preset;
      const masterType = MASTER_OF[T.slaveOf];
      const masters = comps.filter((q) => q.type === masterType);
      if (masters.length) return masters[masters.length - 1].props.tag;
      return `${T.tagPrefix}1`;
    }
    const base = preset ? preset.replace(/\d+$/, '') : T.tagPrefix;
    const taken = new Set(comps.filter((q) => q !== c).map((q) => q.props.tag));
    if (preset && !taken.has(preset)) return preset;
    let n = 1;
    while (taken.has(base + n)) n++;
    return base + n;
  }

  // ---------------------------------------------------------------- cables
  _connectable(p) {
    const [x, y] = p;
    for (const c of this.project.components) {
      const T = TYPES[c.type];
      if (!T) continue;
      for (const t of T.terms) {
        const [tx, ty] = termPos(c, t);
        if (tx === x && ty === y) return true;
      }
    }
    for (const w of this.project.wires) {
      const pts = w.points;
      for (let i = 1; i < pts.length; i++) if (onSeg(x, y, pts[i - 1], pts[i])) return true;
    }
    return false;
  }

  _wireClick(gp, touch) {
    if (!this.draft) {
      this.draft = { pts: [gp], cursor: touch ? null : gp };
      this._renderOverlay();
      return;
    }
    const pts = this.draft.pts;
    const last = pts[pts.length - 1];
    if (last[0] === gp[0] && last[1] === gp[1]) {
      this._finishWire();
      return;
    }
    pts.push(...lRoute(last, gp));
    if (this._connectable(gp)) this._finishWire();
    else this._renderOverlay();
  }

  _finishWire() {
    const d = this.draft;
    this.draft = null;
    if (d) {
      const pts = simplify(d.pts);
      if (pts.length >= 2) {
        const snap = this._snapshot();
        this.project.wires.push({ id: this._newId('w'), points: pts });
        this._pushHistory(snap);
        this.render();
        this._changed();
      }
    }
    this._renderOverlay();
  }

  cancel() {
    if (this.draft) {
      this.draft = null;
      this._renderOverlay();
    } else if (this.placing || this.tool !== 'select') this.setTool('select');
    else this._select(null);
  }

  // ------------------------------------------------------- cables elásticos
  _attachments(c) {
    const T = TYPES[c.type];
    const terms = T.terms.map((t) => [t, termPos(c, t)]);
    const out = [];
    for (const w of this.project.wires) {
      const n = w.points.length;
      for (const idx of [0, n - 1]) {
        const [x, y] = w.points[idx];
        const hit = terms.find(([, p]) => p[0] === x && p[1] === y);
        if (hit) out.push({ w, idx, term: hit[0], orig: w.points.map((p) => [...p]) });
      }
    }
    return out;
  }

  _applyAttachments(c, attach) {
    const byWire = new Map();
    for (const a of attach) {
      if (!byWire.has(a.w)) byWire.set(a.w, { orig: a.orig, ends: [] });
      byWire.get(a.w).ends.push(a);
    }
    for (const [w, { orig, ends }] of byWire) {
      const pts = orig.map((p) => [...p]);
      for (const a of ends) {
        const np = termPos(c, a.term);
        const n = a.idx === 0 ? 1 : pts.length - 2;
        const vertical = orig[a.idx][0] === orig[n][0];
        pts[a.idx] = np;
        if (pts.length > 2 && !ends.some((e) => e.idx === n)) {
          if (vertical) pts[n][0] = np[0];
          else pts[n][1] = np[1];
        }
      }
      w.points = orthogonalize(pts);
    }
  }

  // --------------------------------------------------------------- edición
  selected() {
    if (!this.sel) return null;
    if (this.sel.kind === 'comp') return this.project.components.find((c) => c.id === this.sel.id) || null;
    return this.project.wires.find((w) => w.id === this.sel.id) || null;
  }

  _select(sel) {
    const prev = this.sel;
    this.sel = sel;
    if (!sameSel(prev, sel)) {
      this._renderWires();
      if (prev && prev.kind === 'comp') this._rerenderComp(prev.id);
      if (sel && sel.kind === 'comp') this._rerenderComp(sel.id);
      this.opts.onSelect && this.opts.onSelect(sel);
    }
  }

  _rerenderComp(id) {
    const c = this.project.components.find((q) => q.id === id);
    const g = this.compEls.get(id);
    if (!c || !g) return;
    const html = this._compHTML(c);
    g.innerHTML = html;
    this.cache.set(id, html);
  }

  deleteSelection() {
    if (this.sim || !this.sel) return;
    const snap = this._snapshot();
    if (this.sel.kind === 'comp') this.project.components = this.project.components.filter((c) => c.id !== this.sel.id);
    else this.project.wires = this.project.wires.filter((w) => w.id !== this.sel.id);
    this._pushHistory(snap);
    this._select(null);
    this.render();
    this._changed();
  }

  rotateSelection() {
    const c = this.selected();
    if (this.sim || !c || !this.sel || this.sel.kind !== 'comp') return;
    const snap = this._snapshot();
    const attach = this._attachments(c);
    c.rot = ((c.rot || 0) + 90) % 360;
    this._applyAttachments(c, attach);
    for (const a of attach) a.w.points = simplify(a.w.points);
    this._pushHistory(snap);
    this.render();
    this._changed();
  }

  duplicateSelection() {
    const c = this.selected();
    if (this.sim || !c || this.sel.kind !== 'comp') return;
    const snap = this._snapshot();
    const copy = JSON.parse(JSON.stringify(c));
    copy.id = this._newId('c');
    copy.x += 3;
    copy.y += 1;
    const T = TYPES[c.type];
    if (!T.slaveOf) copy.props.tag = this._autoTag(copy, c.props.tag);
    this.project.components.push(copy);
    this._pushHistory(snap);
    this._select({ kind: 'comp', id: copy.id });
    this.render();
    this._changed();
  }

  /** Cambia una propiedad del componente seleccionado. */
  setProp(id, key, value) {
    const c = this.project.components.find((q) => q.id === id);
    if (!c) return;
    if (!this.sim) this._pushHistory(this._snapshot());
    c.props[key] = value;
    this._rerenderComp(id);
    this.render();
    this._changed();
  }

  // -------------------------------------------------------------- historial
  _snapshot() {
    return JSON.stringify({ components: this.project.components, wires: this.project.wires });
  }

  _pushHistory(snap) {
    this.history.push(snap);
    if (this.history.length > 150) this.history.shift();
    this.future = [];
  }

  _restore(snap) {
    const o = JSON.parse(snap);
    this.project.components = o.components;
    this.project.wires = o.wires;
    this.sel = null;
    this.render();
    this.opts.onSelect && this.opts.onSelect(null);
    this._changed();
  }

  undo() {
    if (this.sim || !this.history.length) return;
    this.future.push(this._snapshot());
    this._restore(this.history.pop());
  }

  redo() {
    if (this.sim || !this.future.length) return;
    this.history.push(this._snapshot());
    this._restore(this.future.pop());
  }

  _changed() {
    this.opts.onChange && this.opts.onChange();
  }

  /** Atajos de teclado (los llama la aplicación). Devuelve true si lo usa. */
  key(e) {
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (k === 'z' || k === 'Z')) {
      if (e.shiftKey) this.redo();
      else this.undo();
      return true;
    }
    if (mod && (k === 'y' || k === 'Y')) {
      this.redo();
      return true;
    }
    if (mod && (k === 'd' || k === 'D')) {
      this.duplicateSelection();
      return true;
    }
    if (mod) return false;
    if (k === 'Escape') {
      this.cancel();
      return true;
    }
    if (k === 'Delete' || k === 'Backspace') {
      this.deleteSelection();
      return true;
    }
    if (k === 'r' || k === 'R') {
      this.rotateSelection();
      return true;
    }
    if (k === 'w' || k === 'W') {
      if (!this.sim) this.setTool('wire');
      return true;
    }
    if (k === 'v' || k === 'V') {
      this.setTool('select');
      return true;
    }
    if (k === '+' || k === '=') {
      this.zoomAt(1.2);
      return true;
    }
    if (k === '-') {
      this.zoomAt(1 / 1.2);
      return true;
    }
    if (k === '0' || k === 'f' || k === 'F') {
      this.zoomToFit();
      return true;
    }
    return false;
  }
}

// ------------------------------------------------------------ geometría
function lRoute(a, b) {
  if (a[0] === b[0] || a[1] === b[1]) return [b];
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  return dx >= dy ? [[b[0], a[1]], b] : [[a[0], b[1]], b];
}

function onSeg(x, y, p, q) {
  if (p[0] === q[0]) return x === p[0] && y >= Math.min(p[1], q[1]) && y <= Math.max(p[1], q[1]);
  if (p[1] === q[1]) return y === p[1] && x >= Math.min(p[0], q[0]) && x <= Math.max(p[0], q[0]);
  return false;
}

function orthogonalize(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    if (a[0] !== b[0] && a[1] !== b[1]) out.push([a[0], b[1]]);
    out.push(b);
  }
  return out;
}

export function simplify(pts) {
  const a = [];
  for (const p of pts) {
    const l = a[a.length - 1];
    if (!l || l[0] !== p[0] || l[1] !== p[1]) a.push([p[0], p[1]]);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < a.length - 1; i++) {
      const [p, q, r] = [a[i - 1], a[i], a[i + 1]];
      const col = (p[0] === q[0] && q[0] === r[0]) || (p[1] === q[1] && q[1] === r[1]);
      const back = col && (Math.sign(q[0] - p[0]) !== Math.sign(r[0] - q[0]) || Math.sign(q[1] - p[1]) !== Math.sign(r[1] - q[1]));
      if (col && !back) {
        a.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return a;
}

function sameSel(a, b) {
  return (!a && !b) || (a && b && a.kind === b.kind && a.id === b.id);
}
