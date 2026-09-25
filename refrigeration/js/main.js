// FrigoSIMU — aplicación principal.

import { G, TYPES, PALETTE, renderSymbol } from './elec/components.js';
import { SchematicEditor } from './elec/editor.js';
import { FridgeModel, DEFAULT_REFRIG, DEFAULT_FAULTS } from './refrig/model.js';
import { FridgeView } from './refrig/view.js';
import { CoupledSim } from './link.js';
import { Narrator } from './narrator.js';
import { TrendChart, PHChart } from './ui/charts.js';
import { Panels, h, clockText } from './ui/panels.js';
import { EXAMPLES, buildExample } from './examples.js';

const LS_PROJECT = 'frigosimu.project';
const LS_UI = 'frigosimu.ui';

function lsGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

function blankProject(kind) {
  const three = kind === '3f';
  return {
    version: 1,
    name: three ? 'Esquema nuevo (3F+N)' : 'Esquema nuevo (L+N)',
    description: '',
    components: [{ id: 'c1', type: three ? 'supply3' : 'supply1', x: 0, y: 0, rot: 0, props: { tag: '', name: three ? '400/230 V 50 Hz' : '230 V' } }],
    wires: [],
    refrig: { ...DEFAULT_REFRIG },
    faults: { ...DEFAULT_FAULTS },
  };
}

function normalize(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.components) || !Array.isArray(p.wires)) throw new Error('El archivo no es un esquema de FrigoSIMU.');
  p.components = p.components.filter((c) => c && TYPES[c.type]).map((c) => ({ rot: 0, ...c, props: { ...(TYPES[c.type].defaults || {}), ...(c.props || {}) } }));
  p.wires = p.wires.filter((w) => w && Array.isArray(w.points) && w.points.length >= 2);
  p.refrig = { ...DEFAULT_REFRIG, ...(p.refrig || {}) };
  p.faults = { ...DEFAULT_FAULTS, ...(p.faults || {}) };
  p.name = p.name || 'Esquema';
  return p;
}

class App {
  constructor() {
    this.root = document.getElementById('app');
    this.ui = { speed: 20, tab: 'props', split: 0.54, dock: null, collapsed: false, theme: null, win: 1800 };
    try {
      Object.assign(this.ui, JSON.parse(lsGet(LS_UI) || '{}'));
    } catch {
      /* ignorar */
    }
    this.sim = null;
    this.paused = false;
    this.last = performance.now();
    this.acc = { ui: 0, chart: 0, edit: 0 };

    this.editor = new SchematicEditor(document.getElementById('elec-svg'), {
      onSelect: () => {
        this.panels.renderProps();
        if (this.editor.sel && this.ui.tab !== 'props' && !this.sim) this.selectTab('props');
      },
      onChange: () => {
        this.saveSoon();
        this.updateToolbar();
        this.refreshFridgeInfo();
      },
      onSimClick: (id) => {
        if (!this.sim) return;
        this.sim.elec.click(id);
        this.sim.resolve();
        this.editor.refresh();
        this.panels.updatePropsLive();
      },
      onSimPress: (id, down) => {
        if (!this.sim) return;
        this.sim.elec.press(id, down);
        this.sim.resolve();
        this.editor.refresh();
      },
      onHint: (t) => (document.getElementById('elec-hint').textContent = t),
      onTool: () => this.updateToolbar(),
    });
    this.fridgeView = new FridgeView(document.getElementById('fridge-svg'), { onDoor: () => this.toggleDoor() });
    this.narrator = new Narrator((l, m, t) => this.log(l, m, t));
    this.trend = new TrendChart(document.getElementById('chart'));
    this.trend.window = this.ui.win;
    this.ph = new PHChart(document.getElementById('ph'));
    this.panels = new Panels(this);

    this.buildPalette();
    this.bindToolbar();
    this.bindLayout();
    this.applyUI();

    let project = null;
    const hash = (location.hash || '').slice(1);
    if (hash && EXAMPLES.some((e) => e.id === hash)) project = buildExample(hash);
    if (!project) {
      try {
        const saved = lsGet(LS_PROJECT);
        if (saved) project = normalize(JSON.parse(saved));
      } catch {
        project = null;
      }
    }
    this.loadProject(project || buildExample('positiva'), { quiet: true });
    this.panels.renderLog();
    this.editor.setTool('select');
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------- proyecto
  loadProject(p, { quiet = false, undoable = false } = {}) {
    const prev = this.project ? JSON.stringify(this.project) : null;
    if (this.sim) this.stopSim();
    this.project = normalize(p);
    this.editor.setProject(this.project);
    this.preview = new FridgeModel(this.project.refrig, this.project.faults);
    this.panels.renderProps();
    this.panels.renderRoom();
    this.trend.reset();
    this.updateToolbar();
    this.refreshFridgeInfo();
    this.saveSoon();
    if (!quiet) {
      this.snack(`Cargado: ${this.project.name}`, undoable && prev ? { label: 'Deshacer', fn: () => this.loadProject(JSON.parse(prev), { quiet: true }) } : null);
    }
  }

  saveSoon() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => lsSet(LS_PROJECT, JSON.stringify(this.project)), 400);
  }

  saveUI() {
    lsSet(LS_UI, JSON.stringify(this.ui));
  }

  download() {
    const data = JSON.stringify(this.project, null, 1);
    const name = `${(this.project.name || 'esquema').replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '_') || 'esquema'}.frigosimu.json`;
    try {
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = h('a', { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      /* algunos visores bloquean las descargas */
    }
    this.snack(`Guardado como ${name}. Si no se descarga, copia el esquema:`, {
      label: 'Copiar JSON',
      fn: () => navigator.clipboard.writeText(data).then(() => this.snack('Esquema copiado al portapapeles.'), () => this.snack('No se pudo copiar.')),
    });
  }

  openFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        this.loadProject(JSON.parse(String(r.result)), { undoable: true });
      } catch (e) {
        this.snack(`No se pudo abrir: ${e.message}`);
      }
    };
    r.readAsText(file);
  }

  refrigOn() {
    return this.project.refrig.enabled !== false;
  }

  fridgeOut() {
    if (this.sim && this.sim.refrigOn) return this.sim.fridge.out;
    return this.preview ? this.preview.out : null;
  }

  // -------------------------------------------------------------- simulación
  startSim() {
    const hasSupply = this.project.components.some((c) => ['supply3', 'supply1', 'bus'].includes(c.type));
    if (!hasSupply) {
      this.snack('Añade una alimentación (red o borne de fase/neutro) antes de simular.');
      return;
    }
    this.editor.setTool('select');
    this.panels.clearLog();
    this.sim = new CoupledSim(this.project, { log: (l, m, t) => this.log(l, m, t) });
    this.sim.refrigOn = this.refrigOn();
    this.narrator.reset(this.sim);
    this.trend.reset();
    this.paused = false;
    this.editor.setSim(this.sim.elec);
    this.log('info', `Simulación iniciada: ${this.project.name}.`, 0);
    if (this.refrigOn()) {
      const names = { compresor: 'compresor', vent_evap: 'ventilador del evaporador', vent_cond: 'ventilador del condensador' };
      const missing = Object.keys(names).filter((fn) => !this.project.components.some((c) => c.props.func === fn));
      if (missing.length) {
        this.log('warn', `El esquema no tiene ${missing.map((m) => names[m]).join(', ')}. Asigna la "Función frigorífica" a los motores en Propiedades para que el circuito frigorífico los tenga en cuenta.`, 0);
      }
    }
    const s1 = this.project.components.find((c) => c.type === 'pb_no' && /marcha/i.test(c.props.name || ''));
    if (s1) this.log('info', `Pulsa ${s1.props.tag} (${s1.props.name}) para poner la instalación en servicio.`, 0);
    this.updateToolbar();
    this.panels.renderProps();
    this.panels.renderRoom();
  }

  stopSim() {
    this.sim = null;
    this.paused = false;
    this.editor.setSim(null);
    this.preview = new FridgeModel(this.project.refrig, this.project.faults);
    document.getElementById('elec-banner').hidden = true;
    this.updateToolbar();
    this.panels.renderProps();
    this.panels.renderRoom();
  }

  toggleSim() {
    if (this.sim) this.stopSim();
    else this.startSim();
    requestAnimationFrame(() => this.editor.zoomToFit());
  }

  togglePause() {
    if (!this.sim) return;
    this.paused = !this.paused;
    this.updateToolbar();
  }

  toggleDoor() {
    if (this.sim) {
      this.sim.setDoor(!this.sim.fridge.door);
      this.sim.resolve();
      this.editor.refresh();
    } else if (this.preview) {
      this.preview.door = !this.preview.door;
      this.preview._compute({ comp: 'off', solenoid: null }, 0);
      this.snack('Pulsa Simular para ver cómo afecta la puerta al circuito.');
    }
    this.panels.updateRoomLive();
  }

  addProductLoad() {
    if (!this.sim) return;
    const f = (this.project.refrig.capacityKW || 2.5) / 2.5;
    this.sim.fridge.addProductLoad(3500 * f);
    this.log('cause', `Se mete género caliente (≈ ${Math.round(120 * f)} kg a temperatura ambiente): sube la carga térmica, la cámara tarda más en enfriar y la presión de BAJA sube.`, this.sim.time);
  }

  setProp(id, key, value) {
    this.editor.setProp(id, key, value);
    if (this.sim) {
      this.sim.elec.build();
      this.sim.resolve();
      this.editor.refresh();
    }
    if (key === 'tag') this.panels.renderProps();
    this.refreshFridgeInfo();
  }

  setRefrig(key, value) {
    this.project.refrig[key] = value;
    if (this.sim) {
      if (key === 'Tamb' || key === 'shSet') this.sim.fridge.p[key] = value;
    } else {
      this.preview = new FridgeModel(this.project.refrig, this.project.faults);
    }
    this.saveSoon();
  }

  setFault(key, value) {
    this.project.faults[key] = value;
    if (this.sim) {
      this.sim.fridge.setFaults({ [key]: value });
      const labels = {
        chargePct: `Carga de refrigerante al ${value} %`,
        condDirt: `Condensador sucio al ${Math.round(value * 100)} %`,
        filterClog: `Filtro obstruido al ${Math.round(value * 100)} %`,
        txv: `VET: ${value === 'ok' ? 'correcta' : value === 'cerrada' ? 'bloqueada casi cerrada' : 'bloqueada abierta'}`,
      };
      clearTimeout(this._faultT);
      this._faultT = setTimeout(() => this.log('warn', `Avería: ${labels[key] || (value ? 'activada' : 'eliminada')}${labels[key] ? '' : ` (${key})`}.`, this.sim ? this.sim.time : 0), 400);
    } else {
      this.preview.setFaults({ [key]: value });
    }
    this.saveSoon();
  }

  clearFaults() {
    this.project.faults = { ...DEFAULT_FAULTS };
    if (this.sim) {
      this.sim.fridge.setFaults({ ...DEFAULT_FAULTS });
      this.log('info', 'Se han quitado todas las averías.', this.sim.time);
    } else this.preview.setFaults({ ...DEFAULT_FAULTS });
    this.panels.renderRoom();
    this.saveSoon();
  }

  setRefrigEnabled(on) {
    this.project.refrig.enabled = on;
    if (this.sim) this.sim.refrigOn = on;
    this.saveSoon();
    this.updateToolbar();
    requestAnimationFrame(() => this.editor.zoomToFit());
  }

  // ------------------------------------------------------------------ bucle
  frame(ts) {
    const dt = Math.min(0.1, Math.max(0, (ts - this.last) / 1000));
    this.last = ts;
    const sim = this.sim;
    if (sim && !this.paused && !sim.elec.fault) {
      const changed = sim.step(dt * this.ui.speed);
      if (changed) this.editor.refresh();
      this.narrator.update(sim);
      if (sim.refrigOn) this.trend.push(sim.fridge.out);
    }
    const o = this.fridgeOut();
    if (o && this.refrigOn()) this.fridgeView.update(o, this.fridgeInfo(), this.paused ? 0 : dt);

    this.acc.ui += dt;
    this.acc.chart += dt;
    if (this.acc.ui > 0.25) {
      this.acc.ui = 0;
      if (sim) {
        this.editor.refresh();
        this.panels.updatePropsLive();
        document.getElementById('sim-clock').textContent = clockText(sim.time);
        const banner = document.getElementById('elec-banner');
        if (sim.elec.fault) {
          banner.hidden = false;
          banner.textContent = '⚡ Cortocircuito sin protección. Detén la simulación y revisa el esquema.';
        } else banner.hidden = true;
      }
      this.updateChips(o);
      this.panels.updateRoomLive();
      if (this.ui.tab === 'diag' && !this.ui.collapsed) this.panels.renderDiag();
    }
    if (this.acc.chart > 0.3 && !this.ui.collapsed) {
      this.acc.chart = 0;
      if (this.ui.tab === 'chart') this.trend.draw();
      if (this.ui.tab === 'ph' && o) this.ph.draw(o);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Datos del esquema que ayudan a la vista frigorífica. */
  fridgeInfo() {
    if (this._info && !this.sim) return this._info;
    const comps = this.project.components;
    const th = comps.find((c) => c.type === 'thermostat' && c.props.probe === 'camara');
    const pa = comps.filter((c) => c.type === 'pressostat' && c.props.kind === 'alta');
    const pb = comps.filter((c) => c.type === 'pressostat' && c.props.kind === 'baja');
    const st = (c) => (this.sim ? this.sim.elec.cstate.get(c.id) : null);
    const info = {
      thermostat: th && {
        tag: th.props.tag,
        stop: th.props.mode === 'calor' ? +th.props.sp : +th.props.sp,
        start: th.props.mode === 'calor' ? +th.props.sp - +th.props.diff : +th.props.sp + +th.props.diff,
      },
      hasPA: pa.length > 0,
      hasPB: pb.length > 0,
      paTrip: pa.some((c) => st(c) && st(c).actuated),
      pbTrip: pb.some((c) => st(c) && st(c).actuated),
      condDirt: this.project.faults.condDirt || 0,
    };
    if (!this.sim) this._info = info;
    return info;
  }

  refreshFridgeInfo() {
    this._info = null;
  }

  updateChips(o) {
    const el = document.getElementById('chips');
    const io = this.sim ? this.sim.io : { present: {} };
    const has = (fn) => this.project.components.some((c) => c.props.func === fn);
    const chips = [
      ['Compresor', o && (o.running || o.locked), o && o.locked ? 'bad' : '', has('compresor')],
      ['Vent. cond.', o && o.fanC, '', has('vent_cond')],
      ['Vent. evap.', o && o.fanE, '', has('vent_evap')],
      ['Desescarche', o && o.heater, 'warn', has('desescarche')],
      ['Solenoide', o && o.hasSolenoid && o.solOpen, '', has('solenoide')],
      ['Puerta', o && o.door, 'warn', true],
    ];
    const key = JSON.stringify(chips);
    if (key === this._chipsKey) return;
    this._chipsKey = key;
    el.innerHTML = '';
    for (const [label, on, cls, avail] of chips) {
      el.append(h('span', { class: `chip ${cls}${on ? ' on' : ''}${avail ? '' : ' absent'}`, title: avail ? '' : 'No hay ningún componente con esta función frigorífica en el esquema' }, h('i'), label));
    }
  }

  // --------------------------------------------------------------- registro
  log(level, msg, t) {
    const e = { level, msg, t: t ?? (this.sim ? this.sim.time : 0) };
    this.panels.addLog(e);
    if (['cause', 'warn', 'error'].includes(level)) this.toast(msg, level);
    if (this.ui.tab !== 'log') {
      this.unread = (this.unread || 0) + 1;
      const b = document.getElementById('log-badge');
      b.hidden = false;
      b.textContent = this.unread > 99 ? '99+' : String(this.unread);
    }
  }

  toast(msg, level) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast ${level}`;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => (el.hidden = true), 7000);
  }

  snack(msg, action) {
    let el = document.getElementById('snack');
    if (!el) {
      el = h('div', { id: 'snack', class: 'snack', role: 'status' });
      document.body.append(el);
    }
    el.innerHTML = '';
    el.append(h('span', {}, msg));
    if (action) {
      el.append(h('button', { class: 'btn small', onclick: () => {
        el.hidden = true;
        action.fn();
      } }, action.label));
    }
    el.hidden = false;
    clearTimeout(this._snackT);
    this._snackT = setTimeout(() => (el.hidden = true), action ? 9000 : 4000);
  }

  // ------------------------------------------------------------------- UI
  buildPalette() {
    const pal = document.getElementById('palette');
    pal.innerHTML = '';
    for (const cat of PALETTE) {
      const items = h('div', { class: 'pal-items' });
      for (const item of cat.items) {
        const T = TYPES[item.type];
        const c = { id: 'p', type: item.type, x: 0, y: 0, rot: 0, props: { ...(T.defaults || {}), ...item.props, tag: '', name: '' } };
        const b = T.getBox ? T.getBox(c) : T.box;
        const pad = 6;
        const vb = `${b[0] * G - pad} ${b[1] * G - pad} ${(b[2] - b[0]) * G + 2 * pad} ${(b[3] - b[1]) * G + 2 * pad}`;
        const btn = h('button', { class: 'pal-item', title: T.label, type: 'button' });
        btn.innerHTML = `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${renderSymbol(c, { st: T.initState ? T.initState(c) : {} })}</svg>`;
        btn.append(h('span', {}, item.label));
        btn.addEventListener('click', () => {
          if (this.sim) return;
          for (const x of pal.querySelectorAll('.pal-item.on')) x.classList.remove('on');
          btn.classList.add('on');
          this.editor.startPlace(item);
          this.root.classList.remove('pal-open');
        });
        items.append(btn);
      }
      pal.append(h('div', { class: `pal-cat${cat.cat === 'Frigorífico' ? ' fridge-cat' : ''}` }, h('h3', {}, cat.cat), items));
    }
  }

  bindToolbar() {
    const $ = (id) => document.getElementById(id);
    const sel = $('sel-example');
    const fill = () => {
      sel.innerHTML = '';
      sel.append(h('option', { value: '', selected: true, disabled: true }, 'Abrir ejemplo…'));
      const og = h('optgroup', { label: 'Ejemplos' });
      for (const e of EXAMPLES) og.append(h('option', { value: e.id }, e.build().name));
      sel.append(og, h('optgroup', { label: 'Nuevo' }, h('option', { value: 'blank-3f' }, 'Esquema en blanco (3F+N)'), h('option', { value: 'blank-1f' }, 'Esquema en blanco (L+N)')));
    };
    fill();
    sel.addEventListener('change', () => {
      const v = sel.value;
      if (v === 'blank-3f') this.loadProject(blankProject('3f'), { undoable: true });
      else if (v === 'blank-1f') this.loadProject(blankProject('1f'), { undoable: true });
      else if (v) this.loadProject(buildExample(v), { undoable: true });
      sel.value = '';
    });
    $('btn-open').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) this.openFile(f);
      e.target.value = '';
    });
    $('btn-save').addEventListener('click', () => this.download());
    $('btn-undo').addEventListener('click', () => this.editor.undo());
    $('btn-redo').addEventListener('click', () => this.editor.redo());
    for (const b of document.querySelectorAll('.tool')) b.addEventListener('click', () => this.editor.setTool(b.dataset.tool));
    $('btn-rotate').addEventListener('click', () => this.editor.rotateSelection());
    $('btn-delete').addEventListener('click', () => this.editor.deleteSelection());
    $('btn-sim').addEventListener('click', () => this.toggleSim());
    $('btn-pause').addEventListener('click', () => this.togglePause());
    const speed = $('sel-speed');
    speed.value = String(this.ui.speed);
    speed.addEventListener('change', () => {
      this.ui.speed = Number(speed.value);
      this.saveUI();
    });
    $('btn-fridge').addEventListener('click', () => this.setRefrigEnabled(!this.refrigOn()));
    $('btn-fridge-on').addEventListener('click', () => this.setRefrigEnabled(true));
    $('btn-theme').addEventListener('click', () => {
      const dark = this.effectiveDark();
      this.ui.theme = dark ? 'light' : 'dark';
      this.saveUI();
      this.applyUI();
    });
    $('btn-zoom-in').addEventListener('click', () => this.editor.zoomAt(1.25));
    $('btn-zoom-out').addEventListener('click', () => this.editor.zoomAt(0.8));
    $('btn-fit').addEventListener('click', () => this.editor.zoomToFit());
    $('btn-parts-mobile').addEventListener('click', () => this.root.classList.toggle('pal-open'));
    for (const b of document.querySelectorAll('.viewtabs [data-view]')) {
      b.addEventListener('click', () => {
        this.root.dataset.view = b.dataset.view;
        for (const x of document.querySelectorAll('.viewtabs [data-view]')) x.classList.toggle('on', x === b);
        if (b.dataset.view === 'elec') requestAnimationFrame(() => this.editor.zoomToFit());
      });
    }
    for (const t of document.querySelectorAll('.tabs [role="tab"]')) t.addEventListener('click', () => this.selectTab(t.dataset.tab));
    $('btn-dock').addEventListener('click', () => {
      this.ui.collapsed = !this.ui.collapsed;
      this.saveUI();
      this.applyUI();
    });
    for (const b of document.querySelectorAll('.chart-tools [data-win]')) {
      b.addEventListener('click', () => {
        this.ui.win = Number(b.dataset.win);
        this.trend.window = this.ui.win;
        for (const x of document.querySelectorAll('.chart-tools [data-win]')) x.classList.toggle('on', x === b);
        this.trend.draw();
        this.saveUI();
      });
    }
    for (const x of document.querySelectorAll('.chart-tools [data-win]')) x.classList.toggle('on', Number(x.dataset.win) === this.ui.win);
    $('btn-log-clear').addEventListener('click', () => this.panels.clearLog());

    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
      if (e.key === ' ' && this.sim) {
        e.preventDefault();
        this.togglePause();
        return;
      }
      if ((e.key === 'p' || e.key === 'P') && this.sim && !e.ctrlKey && !e.metaKey) {
        this.togglePause();
        return;
      }
      if (this.editor.key(e)) e.preventDefault();
    });
  }

  selectTab(tab) {
    this.ui.tab = tab;
    for (const t of document.querySelectorAll('.tabs [role="tab"]')) t.setAttribute('aria-selected', String(t.dataset.tab === tab));
    for (const p of document.querySelectorAll('.panel[data-panel]')) p.hidden = p.dataset.panel !== tab;
    if (this.ui.collapsed) {
      this.ui.collapsed = false;
      this.applyUI();
    }
    if (tab === 'log') {
      this.unread = 0;
      document.getElementById('log-badge').hidden = true;
    }
    if (tab === 'diag') this.panels.renderDiag();
    if (tab === 'chart') requestAnimationFrame(() => this.trend.draw());
    if (tab === 'ph') requestAnimationFrame(() => this.ph.draw(this.fridgeOut()));
    this.saveUI();
  }

  bindLayout() {
    const split = document.getElementById('splitter');
    split.addEventListener('pointerdown', (e) => {
      split.setPointerCapture(e.pointerId);
      split.classList.add('dragging');
      const stage = document.getElementById('stage').getBoundingClientRect();
      const move = (ev) => {
        this.ui.split = Math.max(0.25, Math.min(0.78, (ev.clientX - stage.left) / stage.width));
        this.root.style.setProperty('--split', this.ui.split);
      };
      const up = () => {
        split.classList.remove('dragging');
        split.removeEventListener('pointermove', move);
        split.removeEventListener('pointerup', up);
        this.saveUI();
      };
      split.addEventListener('pointermove', move);
      split.addEventListener('pointerup', up);
    });
    split.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        this.ui.split = Math.max(0.25, Math.min(0.78, this.ui.split + (e.key === 'ArrowLeft' ? -0.03 : 0.03)));
        this.root.style.setProperty('--split', this.ui.split);
        this.saveUI();
      }
    });
    const rs = document.getElementById('dock-resize');
    rs.addEventListener('pointerdown', (e) => {
      rs.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const hgt = Math.max(120, Math.min(window.innerHeight * 0.7, window.innerHeight - ev.clientY));
        this.ui.dock = Math.round(hgt);
        this.ui.collapsed = false;
        this.applyUI();
      };
      const up = () => {
        rs.removeEventListener('pointermove', move);
        rs.removeEventListener('pointerup', up);
        this.saveUI();
      };
      rs.addEventListener('pointermove', move);
      rs.addEventListener('pointerup', up);
    });
    const ro = new ResizeObserver(() => {
      if (this.ui.tab === 'chart') this.trend.draw();
      if (this.ui.tab === 'ph') this.ph.draw(this.fridgeOut());
    });
    ro.observe(document.querySelector('.panels'));
    window.addEventListener('hashchange', () => {
      const id = location.hash.slice(1);
      if (EXAMPLES.some((e) => e.id === id)) this.loadProject(buildExample(id), { undoable: true });
    });
  }

  effectiveDark() {
    const t = document.documentElement.dataset.theme;
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  applyUI() {
    const r = this.root;
    if (this.ui.theme) document.documentElement.dataset.theme = this.ui.theme;
    r.style.setProperty('--split', this.ui.split);
    if (this.ui.dock && window.innerWidth > 860) r.style.setProperty('--dock-h', `${this.ui.dock}px`);
    r.classList.toggle('dock-collapsed', !!this.ui.collapsed);
    this.selectTabQuiet(this.ui.tab);
  }

  selectTabQuiet(tab) {
    for (const t of document.querySelectorAll('.tabs [role="tab"]')) t.setAttribute('aria-selected', String(t.dataset.tab === tab));
    for (const p of document.querySelectorAll('.panel[data-panel]')) p.hidden = p.dataset.panel !== tab;
  }

  updateToolbar() {
    const r = this.root;
    const sim = !!this.sim;
    r.classList.toggle('sim-mode', sim);
    r.classList.toggle('paused', sim && this.paused);
    r.classList.toggle('no-fridge', !this.refrigOn());
    if (!this.refrigOn() && r.dataset.view === 'fridge') r.dataset.view = 'elec';
    document.getElementById('fridge-off').hidden = true;
    const btn = document.getElementById('btn-sim');
    btn.innerHTML = sim ? '<svg><use href="#i-stop"/></svg><span>Editar</span>' : '<svg><use href="#i-play"/></svg><span>Simular</span>';
    btn.title = sim ? 'Detener la simulación y volver a editar' : 'Simular el esquema';
    const pause = document.getElementById('btn-pause');
    pause.innerHTML = this.paused ? '<svg><use href="#i-play"/></svg>' : '<svg><use href="#i-pause"/></svg>';
    pause.title = this.paused ? 'Continuar (P)' : 'Pausa (P)';
    document.getElementById('mode-chip').textContent = sim ? (this.paused ? 'PAUSA' : 'SIMULANDO') : 'EDICIÓN';
    document.getElementById('btn-fridge').setAttribute('aria-pressed', String(this.refrigOn()));
    for (const b of document.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === this.editor.tool);
    document.getElementById('btn-undo').disabled = !this.editor.history.length;
    document.getElementById('btn-redo').disabled = !this.editor.future.length;
    if (!sim) document.getElementById('sim-clock').textContent = '0:00:00';
    if (this.editor.tool !== 'place') for (const x of document.querySelectorAll('.pal-item.on')) x.classList.remove('on');
    const hintEl = document.getElementById('elec-hint');
    if (sim) hintEl.textContent = 'Simulando: clic en pulsadores, interruptores, protecciones, presostatos o en la puerta · Espacio = pausa';
  }
}

function boot() {
  window.frigosimu = new App();
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
else boot();
