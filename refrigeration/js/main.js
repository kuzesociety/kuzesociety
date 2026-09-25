// FrigoSIMU — aplicación principal.
//
// Cuatro modos:
//   Simulador       la instalación funciona sola; se toca cualquier pieza para
//                   verla y cambiarla, y se ve qué va a pasar antes de que pase.
//   Diagnosticar    lecturas de una máquina real → averías probables y fugas.
//   Practicar       averías misteriosas para entrenar el diagnóstico.
//   Editar esquema  editor del esquema eléctrico, como CADe SIMU.

import { G, TYPES, PALETTE, renderSymbol } from './elec/components.js';
import { SchematicEditor } from './elec/editor.js';
import { explainLoad } from './elec/explain.js';
import { DEFAULT_REFRIG, DEFAULT_FAULTS } from './refrig/model.js';
import { FridgeView } from './refrig/view.js';
import { REFRIGERANTS, SIM_REFRIGERANT_IDS, getRefrigerant, gauge, psatDew } from './refrig/refrigerants.js';
import { CoupledSim } from './link.js';
import { Narrator } from './narrator.js';
import { diagnoseReadings, APPS } from './diagnose.js';
import { TrendChart, PHChart } from './ui/charts.js';
import { Panels } from './ui/panels.js';
import { h, fmt, clockText } from './ui/dom.js';
import { Cards, stepper } from './ui/cards.js';
import { Readings, readingVM } from './ui/readings.js';
import { partCard, compCard } from './ui/partcards.js';
import { DiagPage } from './ui/diagpage.js';
import { Practice } from './ui/practice.js';
import { EXAMPLES, buildExample } from './examples.js';

const LS_PROJECT = 'frigosimu.project';
const LS_UI = 'frigosimu.ui';
const MODES = ['sim', 'diag', 'practice', 'edit'];
const SPEEDS = [1, 10, 30, 120, 600];
const HASH_MODES = { simulador: 'sim', diagnosticar: 'diag', practicar: 'practice', editar: 'edit' };

// Pieza del dibujo frigorífico ↔ función frigorífica de las cargas del esquema.
const PART_FUNCS = { comp: ['compresor'], evap: ['vent_evap', 'desescarche'], cond: ['vent_cond'], sol: ['solenoide'], room: ['luz'] };
const FUNC_PART = { compresor: 'comp', vent_evap: 'evap', desescarche: 'evap', vent_cond: 'cond', solenoide: 'sol', luz: 'room' };
const FAULT_PART = {
  chargePct: 'receiver', leakRate: 'receiver', condDirt: 'cond', condFanBroken: 'cond', nonCondensables: 'cond', evapFanBroken: 'evap',
  filterClog: 'filter', txv: 'txv', compValves: 'comp', compLocked: 'comp', solenoidStuck: 'sol', solenoidLeak: 'sol', doorSeal: 'room',
};
const FAULT_NAMES = {
  condFanBroken: 'ventilador del condensador averiado',
  evapFanBroken: 'ventilador del evaporador averiado',
  compValves: 'compresor con las válvulas rotas',
  compLocked: 'compresor agarrotado',
  solenoidStuck: 'solenoide que no abre',
  solenoidLeak: 'solenoide que no cierra del todo',
  doorSeal: 'burlete de la puerta dañado',
  nonCondensables: 'aire (incondensables) en el circuito',
};
// Averías cuyo efecto no se ve en el punto de funcionamiento en marcha.
const NO_PREDICT = new Set(['leakRate', 'compLocked', 'solenoidStuck', 'solenoidLeak', 'doorSeal']);
// Parámetros que obligan a redimensionar el modelo (el resto se cambia en caliente).
const RESIZE = new Set(['refrigerant', 'capacityKW', 'expansion']);
const PREDICT_REFRIG = new Set(['refrigerant', 'capacityKW', 'expansion', 'Tamb', 'shSet']);

// Diferencia mínima para enseñar una flecha de previsión en las lecturas.
const ARROW_TH = { PeG: 0.08, Te: 0.4, Tsuc: 0.5, SH: 0.8, TD: 0.5, PcG: 0.15, Tc: 0.4, Tliq: 0.5, SC: 0.8, condDT: 0.5, current: 0.15, Tdis: 2, pr: 0.15, Wel: 0.05, Qref: 0.08, cop: 0.08, flowkg: 2 };
// Qué se cuenta en el texto de la previsión: clave, nombre, decimales, unidad.
const PRED_TEXT = [
  ['PeG', 'BAJA', 2, 'bar'],
  ['Te', 'evapora a', 1, '°C'],
  ['PcG', 'ALTA', 2, 'bar'],
  ['Tc', 'condensa a', 1, '°C'],
  ['SH', 'recalentamiento', 1, 'K'],
  ['SC', 'subenfriamiento', 1, 'K'],
  ['Tdis', 'descarga', 0, '°C'],
  ['current', 'intensidad', 1, 'A'],
  ['Qref', 'frío', 2, 'kW'],
  ['cop', 'COP', 2, ''],
];

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

const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

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
  if (!getRefrigerant(p.refrig.refrigerant).sim) p.refrig.refrigerant = DEFAULT_REFRIG.refrigerant;
  p.faults = { ...DEFAULT_FAULTS, ...(p.faults || {}) };
  p.name = p.name || 'Esquema';
  return p;
}

function faultText(key, v) {
  switch (key) {
    case 'chargePct':
      return `carga de refrigerante al ${Math.round(v)} %`;
    case 'leakRate':
      return v ? `fuga ${v >= 60 ? 'rápida' : v >= 20 ? 'media' : 'lenta'} (pierde el ${v} % de la carga por hora)` : 'fuga reparada';
    case 'condDirt':
      return `condensador sucio al ${Math.round(v * 100)} %`;
    case 'filterClog':
      return `filtro obstruido al ${Math.round(v * 100)} %`;
    case 'txv':
      return `válvula de expansión ${v === 'ok' ? 'correcta' : v === 'cerrada' ? 'casi cerrada' : 'atascada abierta'}`;
    default:
      return `${FAULT_NAMES[key] || key}${v ? '' : ': reparado'}`;
  }
}

function refrigText(key, v, ref) {
  switch (key) {
    case 'refrigerant': {
      const r = getRefrigerant(v);
      return `Ahora la máquina lleva ${r.id} (${r.composition}, ${r.safety}, PCA ${r.gwp}). A las mismas temperaturas le corresponden otras presiones: a −10 °C evapora a ${fmt(gauge(psatDew(r, -10)), 2)} bar${r.zeotropic ? ' (rocío; es una mezcla con deslizamiento)' : ''}. La máquina se recalcula para dar la misma potencia.`;
    }
    case 'Tamb':
      return `Exterior a ${fmt(v, 0)} °C: el condensador echa el calor a un aire ${v > ref ? 'más caliente → sube la presión de ALTA, el compresor consume más y da menos frío' : 'más frío → baja la presión de ALTA y el compresor trabaja más desahogado'}.`;
    case 'shSet':
      return `Recalentamiento de la VET ajustado a ${fmt(v)} K: la válvula ${v > ref ? 'cierra un poco: menos líquido al evaporador, baja la presión de BAJA' : 'abre un poco: más líquido al evaporador, sube la presión de BAJA'} (cuidado con el retorno de líquido por debajo de 3–4 K).`;
    case 'capacityKW':
      return `Máquina de ${fmt(v)} kW: compresor, intercambiadores y carga se redimensionan.`;
    case 'expansion':
      return v === 'capilar' ? 'Expansión por tubo capilar: no regula el recalentamiento y no hay recipiente.' : 'Expansión por válvula termostática (VET) con recipiente de líquido.';
    case 'roomUA':
      return `Aislamiento ${v <= 0.03 ? 'bueno' : v >= 0.06 ? 'malo: entra más calor por las paredes y el compresor trabaja más rato' : 'normal'}.`;
    default:
      return null;
  }
}

class App {
  constructor() {
    this.root = document.getElementById('app');
    this.$ = (id) => document.getElementById(id);
    this.ui = { speed: 30, split: 0.56, dock: null, collapsed: false, theme: null, win: 1800, mode: 'sim', tabs: { sim: 'chart', practice: 'chart', edit: 'props' } };
    try {
      Object.assign(this.ui, JSON.parse(lsGet(LS_UI) || '{}'));
    } catch {
      /* ignorar */
    }
    if (!SPEEDS.includes(this.ui.speed)) this.ui.speed = 30;
    this.ui.tabs = { sim: 'chart', practice: 'chart', edit: 'props', ...(this.ui.tabs || {}) };
    this.mode = null;
    this.sim = null;
    this.paused = false;
    this.ffwd = null;
    this.pred = null;
    this.levels = {};
    this.verdictNow = null;
    this.practiceHideFaults = false;
    this.scratch = false;
    this.last = performance.now();
    this.acc = 0;
    this.accChart = 0;
    this.accDiag = 99;
    this.unread = 0;
    this._logSoon = {};

    this.editor = new SchematicEditor(this.$('elec-svg'), {
      onSelect: (sel) => {
        if (this.mode !== 'edit') return;
        this.panels.renderProps();
        if (sel) this.selectTab('props');
      },
      onChange: () => {
        this.saveSoon();
        this.updateToolbar();
      },
      onSimClick: (id) => this.clickComp(id),
      onSimPress: (id, down) => {
        if (!this.sim) return;
        this.sim.elec.press(id, down);
        this.sim.resolve();
        this.editor.refresh();
      },
      onSimSelect: (id, e) => this.openComp(id, e),
      onHint: (t) => (this.$('elec-hint').textContent = t),
      onTool: () => this.updateToolbar(),
    });
    this.fridgeView = new FridgeView(this.$('fridge-svg'), {
      onDoor: () => this.toggleDoor(),
      onPart: (part, e) => this.openPart(part, e),
    });
    this.narrator = new Narrator((l, m, t) => this.log(l, m, t));
    this.trend = new TrendChart(this.$('chart'));
    this.trend.window = this.ui.win;
    this.ph = new PHChart(this.$('ph'));
    this.panels = new Panels(this);
    this.cards = new Cards();
    this.readings = new Readings(this.$('readings'), { onPart: (part, e) => this.openPart(part, e) });
    this.diagPage = new DiagPage(this.$('diagpage'), this);
    this.practice = new Practice(this, this.$('practice'));

    this.buildPalette();
    this.bindToolbar();
    this.bindLayout();
    this.applyUI();

    // Proyecto inicial: ejemplo del enlace, el último guardado o la cámara positiva.
    let project = null;
    let mode = MODES.includes(this.ui.mode) && this.ui.mode !== 'practice' ? this.ui.mode : 'sim';
    const hash = decodeURIComponent((location.hash || '').slice(1));
    if (HASH_MODES[hash]) mode = HASH_MODES[hash];
    if (hash && EXAMPLES.some((e) => e.id === hash)) {
      project = buildExample(hash);
      mode = 'sim';
    }
    if (!project) {
      try {
        const saved = lsGet(LS_PROJECT);
        if (saved) project = normalize(JSON.parse(saved));
      } catch {
        project = null;
      }
    }
    this.mode = mode === 'practice' ? 'sim' : mode;
    this.applyModeUI();
    this.loadProject(project || buildExample('positiva'), { quiet: true });
    if (this.mode === 'diag') this.diagPage.show();
    if (mode === 'practice') this.setMode('practice');
    this.panels.renderLog();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ================================================================ modos
  /** Cambia de modo (simulador, diagnóstico, práctica o editor). */
  setMode(mode) {
    if (!MODES.includes(mode)) mode = 'sim';
    const prev = this.mode;
    if (prev === mode) return;
    this.cards.close();
    this.mode = mode;
    this.applyModeUI();
    this.practiceHideFaults = mode === 'practice';
    this.narrator.noSpoilers = mode === 'practice';
    if (prev === 'practice' && this.userProject) {
      // Al salir de la práctica se recupera el esquema del usuario.
      const saved = this.userProject;
      this.userProject = null;
      this.loadProject(JSON.parse(saved), { quiet: true });
    }
    if (mode === 'edit') {
      this.stopSim();
      this.editor.setTool('select');
      this.panels.renderProps();
    } else if (mode === 'practice') {
      this.userProject = JSON.stringify(this.project);
      this.practice.start();
    } else if (!this.sim && mode === 'sim') this.startSim();
    if (mode === 'diag') this.diagPage.show();
    if (mode !== 'practice') {
      this.ui.mode = mode;
      this.saveUI();
    }
    this.selectTab(this.ui.tabs[mode] || 'chart', { quiet: true });
    this.updateToolbar();
    requestAnimationFrame(() => {
      this.editor.zoomToFit();
      this.drawCharts();
    });
  }

  /** Aspecto según el modo: atributo, pestañas y elementos only-*. */
  applyModeUI() {
    const m = this.mode;
    this.root.dataset.mode = m;
    for (const b of document.querySelectorAll('.modes [data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    for (const el of this.root.querySelectorAll('[class*="only-"]')) {
      const cls = [...el.classList].filter((c) => c.startsWith('only-'));
      if (cls.length) el.hidden = !cls.includes(`only-${m}`);
    }
    const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
    const cur = tabs.find((t) => t.dataset.tab === this.ui.tabs[m]);
    if (!cur || cur.hidden) this.ui.tabs[m] = (tabs.find((t) => !t.hidden) || {}).dataset?.tab || 'chart';
    this.selectTabQuiet(this.ui.tabs[m]);
  }

  // ============================================================= proyecto
  loadProject(p, { quiet = false, undoable = false, noSave = false } = {}) {
    const prev = this.project && !this.scratch ? JSON.stringify(this.project) : null;
    this.cards.close();
    this.stopSim();
    this.project = normalize(p);
    this.scratch = noSave;
    this.editor.setProject(this.project);
    this.trend.reset();
    if (this.mode === 'edit') {
      this.panels.renderProps();
      if (this.ui.tabs.edit === 'install') this.panels.renderRoom(this.$('panel-install'), { edit: true });
    } else this.startSim({ quiet: noSave });
    this.saveSoon();
    this.updateToolbar();
    if (!quiet) {
      this.snack(`Cargado: ${this.project.name}`, undoable && prev ? { label: 'Deshacer', fn: () => this.loadProject(JSON.parse(prev), { quiet: true }) } : null);
    }
    requestAnimationFrame(() => this.editor.zoomToFit());
  }

  saveSoon() {
    if (this.scratch) return;
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
        const p = JSON.parse(String(r.result));
        if (this.mode === 'practice' || this.mode === 'diag') this.setMode('sim');
        this.loadProject(p, { undoable: true });
      } catch (e) {
        this.snack(`No se pudo abrir: ${e.message}`);
      }
    };
    r.readAsText(file);
  }

  refrigOn() {
    return this.project.refrig.enabled !== false;
  }

  // ============================================================ simulación
  startSim({ quiet = false } = {}) {
    this.cards.close();
    this.clearPrediction();
    this.root.classList.toggle('no-fridge', !this.refrigOn());
    const hasSupply = this.project.components.some((c) => ['supply3', 'supply1', 'bus'].includes(c.type));
    if (!hasSupply) {
      this.sim = null;
      this.editor.setSim(null);
      this.buildQuick();
      this.setStory('warn', 'Este esquema no tiene alimentación. Añade una red en «Editar esquema» para poder simularlo.');
      this.updateToolbar();
      return;
    }
    this.panels.clearLog();
    this.unread = 0;
    this.$('log-badge').hidden = true;
    this.sim = new CoupledSim(this.project, { log: (l, m, t) => this.log(l, m, t) });
    this.sim.refrigOn = this.refrigOn();
    this.narrator.reset(this.sim);
    this.trend.reset();
    this.paused = false;
    this.endFfwd();
    this.lastDoorT = null;
    this.lastLoadT = null;
    this.starts = [];
    this.lastStopBy = null;
    this._wasRun = false;
    this._vc = null;
    this._vT = -99;
    this.verdictNow = null;
    this.accDiag = 99;
    this.editor.setSim(this.sim.elec);
    this.setStory('info', this.refrigOn() ? 'La instalación está arrancando…' : 'Esquema solo eléctrico: actúa sobre pulsadores, interruptores y protecciones.');
    this.log('info', `Simulación iniciada: ${this.project.name}.`, 0);
    if (this.refrigOn()) {
      const names = { compresor: 'compresor', vent_evap: 'ventilador del evaporador', vent_cond: 'ventilador del condensador' };
      const missing = Object.keys(names).filter((fn) => !this.project.components.some((c) => c.props.func === fn));
      if (missing.length) {
        this.log('warn', `El esquema no tiene ${missing.map((m) => names[m]).join(', ')}. En «Editar esquema» asigna la función frigorífica a los motores para que el circuito frigorífico los tenga en cuenta.`, 0);
      }
      this.pressMarcha(quiet);
    } else {
      const s1 = this.marchaButton();
      if (s1) this.setStory('info', `Pulsa ${s1.props.tag} (${s1.props.name}) en el esquema, o el botón Marcha de arriba.`);
    }
    this.buildQuick();
    if (this.mode === 'sim' && this.ui.tabs.sim === 'room') this.panels.renderRoom(this.$('panel-room'));
    this.refreshReadings();
    this.updateToolbar();
  }

  stopSim() {
    this.sim = null;
    this.paused = false;
    this.endFfwd();
    this.clearPrediction();
    this.editor.setSim(null);
    this.editor.highlight([]);
    this.$('elec-banner').hidden = true;
    this.updateToolbar();
  }

  togglePause() {
    if (!this.sim) return;
    this.paused = !this.paused;
    this.updateToolbar();
  }

  fastForward(secs) {
    if (!this.sim) return;
    this.paused = false;
    this.ffwd = { left: secs };
    this.$('sim-clock').classList.add('ff');
    this.updateToolbar();
  }

  endFfwd() {
    this.ffwd = null;
    this.$('sim-clock').classList.remove('ff');
  }

  /** Avanza la simulación `total` segundos en pasos de hasta `stepMax`. */
  advance(total, stepMax = 2) {
    const sim = this.sim;
    if (!sim) return;
    let left = total;
    while (left > 1e-9) {
      const hh = Math.min(stepMax, left);
      sim.step(hh);
      this.narrator.update(sim);
      if (sim.refrigOn) {
        const o = sim.fridge.out;
        this.trend.push(o);
        let changed = false;
        if (o.running !== this._wasRun) {
          if (o.running) {
            this.starts.push(sim.time);
            if (this.starts.length > 12) this.starts.shift();
          } else if (this._wasRun) this.lastStopBy = this.stopReason();
          this._wasRun = o.running;
          changed = true;
        }
        // El diagnóstico en vivo sigue el tiempo simulado (vale para cualquier velocidad).
        if (changed || sim.time - this._vT >= 5) {
          this._vT = sim.time;
          this.computeVerdict();
        }
      }
      left -= hh;
      if (sim.elec.fault) break;
    }
    if (this.pred && sim.time - this.pred.t0 > 1800) this.clearPrediction();
  }

  marchaButton() {
    return this.project.components.find((c) => c.type === 'pb_no' && /marcha/i.test(c.props.name || ''));
  }

  paroButton() {
    return this.project.components.find((c) => c.type === 'pb_nc' && /paro/i.test(c.props.name || ''));
  }

  /** Puesta en servicio automática: pulsa y suelta el pulsador de marcha. */
  pressMarcha(quiet) {
    const s1 = this.marchaButton();
    if (!s1 || !this.sim) return;
    const e = this.sim.elec;
    e.press(s1.id, true);
    this.sim.resolve();
    e.press(s1.id, false);
    this.sim.resolve();
    this.editor.refresh();
    const s0 = this.paroButton();
    if (!quiet) this.log('info', `Puesta en servicio automática: se ha pulsado ${s1.props.tag} (${s1.props.name}).${s0 ? ` Para pararla pulsa ${s0.props.tag} (${s0.props.name}).` : ''}`, 0);
  }

  /** Pulsación breve de un pulsador (botones Marcha/Paro de la barra). */
  pressButton(id) {
    const sim = this.sim;
    if (!sim) return;
    sim.elec.press(id, true);
    sim.resolve();
    this.editor.refresh();
    setTimeout(() => {
      if (this.sim !== sim) return;
      sim.elec.press(id, false);
      sim.resolve();
      this.editor.refresh();
    }, 250);
  }

  // ================================================== datos para la interfaz
  out() {
    return this.sim && this.sim.refrigOn ? this.sim.fridge.out : null;
  }

  fridgeOut() {
    return this.out();
  }

  params() {
    return this.sim ? this.sim.fridge.p : { ...DEFAULT_REFRIG, ...this.project.refrig };
  }

  faults() {
    return this.sim ? this.sim.fridge.faults : { ...DEFAULT_FAULTS, ...this.project.faults };
  }

  /** Termostato de cámara (el primero en modo frío con sonda en la cámara). */
  thermostat() {
    return this.project.components.find((c) => c.type === 'thermostat' && c.props.probe === 'camara' && c.props.mode !== 'calor') || null;
  }

  thermoInfo() {
    const th = this.thermostat();
    if (!th) return null;
    return { tag: th.props.tag, stop: +th.props.sp, start: +th.props.sp + +th.props.diff };
  }

  pressostat(kind) {
    return this.project.components.find((c) => c.type === 'pressostat' && c.props.kind === kind) || null;
  }

  clockDevice() {
    if (!this.sim) return null;
    return [...this.sim.elec.devices.values()].find((d) => d.kind === 'clock') || null;
  }

  funcTags(fn) {
    return this.project.components
      .filter((c) => c.props.func === fn)
      .map((c) => `${c.props.tag}${c.props.name ? ' · ' + c.props.name : ''}`)
      .join(', ');
  }

  /** Explicación eléctrica de cada carga con esa función frigorífica. */
  explainFunc(fn) {
    const sim = this.sim;
    if (!sim) return [];
    return sim.elec.comps.filter((c) => c.props.func === fn).map((c) => {
      const x = explainLoad(sim.elec, c.id);
      return { on: x.on, text: x.text };
    });
  }

  /** Causa última de que el compresor esté parado (el final de la cadena de "porque"). */
  compWhy() {
    const lines = this.explainFunc('compresor');
    if (!lines.length) return 'No hay ningún motor con la función «compresor» en el esquema.';
    const t = lines[0].text.replace(/\.$/, '');
    const parts = t.split(/,? porque /);
    const root = parts[parts.length - 1].split('. También')[0];
    return `${cap1(root)}.`;
  }

  /** Qué tiene parado al compresor ahora mismo. */
  stopReason() {
    const e = this.sim && this.sim.elec;
    if (!e) return null;
    const act = (c) => !!(c && e.cstate.get(c.id) && e.cstate.get(c.id).actuated);
    if (act(this.pressostat('alta'))) return 'pa';
    if ([...e.devices.values()].some((d) => d.kind === 'thermal' && d.active)) return 'termico';
    if ([...e.devices.values()].some((d) => d.kind === 'clock' && d.defrost)) return 'defrost';
    if (act(this.pressostat('baja'))) {
      const o = this.out();
      return o && o.hasSolenoid && !o.solOpen ? 'pumpdown' : 'pb';
    }
    if (act(this.thermostat())) return 'th';
    return 'otro';
  }

  /** Tres arranques o más en 15 minutos sin que los pare el termostato (ciclos cortos). */
  shortCycling() {
    if (!this.sim || !this.starts || ['th', 'pumpdown', 'defrost', null].includes(this.lastStopBy)) return false;
    const t = this.sim.time;
    return this.starts.filter((x) => t - x < 900).length >= 3;
  }

  fridgeInfo() {
    const comps = this.project.components;
    const pa = comps.filter((c) => c.type === 'pressostat' && c.props.kind === 'alta');
    const pb = comps.filter((c) => c.type === 'pressostat' && c.props.kind === 'baja');
    const st = (c) => (this.sim ? this.sim.elec.cstate.get(c.id) : null);
    return {
      thermostat: this.thermoInfo(),
      hasPA: pa.length > 0,
      hasPB: pb.length > 0,
      paTrip: pa.some((c) => st(c) && st(c).actuated),
      pbTrip: pb.some((c) => st(c) && st(c).actuated),
      condDirt: this.faults().condDirt || 0,
      capillary: this.params().expansion === 'capilar',
    };
  }

  /** Tipo de instalación para el diagnóstico. */
  appType() {
    if (this.params().expansion === 'capilar') return 'domestica';
    const th = this.thermostat();
    if (th && +th.props.sp < -8) return 'negativa';
    return 'positiva';
  }

  /** Lecturas del simulador con el formato de «Diagnosticar». */
  simReadings() {
    const o = this.out();
    if (!o) return null;
    const run = o.running;
    const recent = (t) => t !== null && t !== undefined && o.t - t < 1800;
    return {
      refrigerant: o.refrigerant,
      app: this.appType(),
      expansion: this.params().expansion === 'capilar' ? 'capilar' : 'txv',
      LP: o.PeG,
      HP: o.PcG,
      Tsuc: o.TevapOut,
      Tliq: o.Tliq,
      Troom: o.Troom,
      Tamb: o.Tamb,
      Tdis: o.Tdis,
      amps: o.current,
      ampsNom: o.nominalCurrent,
      filterDT: o.filterDT > 0.3 ? o.filterDT : 0,
      sight: run ? (o.flash > 0.5 ? 'vacio' : o.flash > 0.08 ? 'burbujas' : 'lleno') : '',
      ice: o.frostFactor < 0.5 ? 'bloqueado' : o.floodback ? 'aspiracion' : run && o.SHevap > 14 ? 'entrada' : o.ice > 0.3 ? 'parcial' : 'no',
      evapFan: o.fanE ? 'ok' : 'parado',
      condFan: o.fanC ? 'ok' : 'parado',
      comp: o.locked ? 'noArranca' : this.shortCycling() ? (this.lastStopBy === 'pb' ? 'pb' : 'ciclos') : run ? 'marcha' : '',
      solenoid: o.hasSolenoid ? 'si' : 'no',
      flags: { recentLoad: recent(this.lastDoorT) || recent(this.lastLoadT) },
    };
  }

  /** Recalcula el diagnóstico en vivo y lo enseña. */
  refreshReadings() {
    this.computeVerdict();
    this.updateReadings();
  }

  /** Diagnóstico en vivo: niveles de colores y veredicto. */
  computeVerdict() {
    const o = this.out();
    if (!o) return;
    const r = this.simReadings();
    const d = o.running ? diagnoseReadings(r) : null;
    this.lastDiag = d;
    this.levels = {};
    if (d) for (const v of d.vars) this.levels[v.key] = v.level;
    // Un diagnóstico nuevo tiene que mantenerse medio minuto antes de enseñarse.
    const cand = this.verdict(o, d);
    if (!this._vc || this._vc.text !== cand.text) this._vc = { text: cand.text, since: o.t };
    const shown = this.verdictNow;
    if (cand.cls === 'idle' || !shown || this.mode === 'practice' || shown.text === cand.text || o.t - this._vc.since >= 30) this.verdictNow = cand;
    else if (shown.cls === 'idle') this.verdictNow = { text: 'Midiendo…', sub: 'Comprobando que las lecturas se mantienen.', cls: 'idle' };
  }

  updateReadings() {
    const o = this.out();
    if (!o) return;
    this.readings.update(o, {
      levels: this.levels,
      pred: this.pred && this.pred.vm,
      thermostat: this.thermoInfo(),
      verdict: this.verdictNow,
      hideLevels: this.mode === 'practice' && !this.practice.easy,
    });
  }

  verdict(o, d) {
    if (this.mode === 'practice') return { text: '¿Qué le pasa a esta máquina?', sub: 'Mira las lecturas y el dibujo, y elige la respuesta abajo.', cls: 'idle' };
    if (this.sim && this.sim.elec.fault) return { text: 'Cortocircuito', sub: 'Revisa el esquema eléctrico.', cls: 'bad' };
    if (o.locked) return { text: 'Compresor bloqueado', sub: 'Tiene tensión pero no gira: falta una fase o está agarrotado. El térmico acabará disparando.', cls: 'bad' };
    if (!o.running) {
      if (this.sim && this.sim.io.comp === 'run') return { text: 'Arrancando…', sub: 'El compresor acaba de recibir tensión.', cls: 'idle' };
      const why = this.compWhy();
      const by = this.stopReason();
      if (by === 'pa') return { text: 'Disparo por alta presión', sub: why, cls: 'bad' };
      if (by === 'termico') return { text: 'Térmico disparado', sub: why, cls: 'bad' };
      if (by === 'pb') return { text: this.shortCycling() ? 'Ciclos cortos por baja presión' : 'Parado por baja presión', sub: why, cls: 'warn' };
      if (by === 'pumpdown') return { text: 'Parado tras la recogida de gas', sub: why, cls: 'idle' };
      if (by === 'defrost') return { text: 'Desescarche', sub: why, cls: 'idle' };
      return { text: 'Compresor parado', sub: why, cls: 'idle' };
    }
    const runFor = this.narrator.runSince !== null ? o.t - this.narrator.runSince : 0;
    if (runFor < 90) {
      if (this.shortCycling()) {
        return this.lastStopBy === 'pb'
          ? { text: 'Ciclos cortos por baja presión', sub: 'El presostato de baja para el compresor y enseguida vuelve a arrancar: típico de falta de refrigerante, de una restricción o de poco aire en el evaporador.', cls: 'bad' }
          : { text: 'Ciclos cortos', sub: 'El compresor arranca y para cada pocos minutos. Mira qué lo para (tócalo en el esquema).', cls: 'warn' };
      }
      return { text: 'Arrancando…', sub: 'Espera un par de minutos a que se estabilicen las presiones.', cls: 'idle' };
    }
    const top = d && d.hypotheses[0];
    const th = this.thermoInfo();
    // Con la cámara por encima del termostato, o justo después de abrir la puerta o meter
    // género, el evaporador trabaja con más salto térmico: no es una avería.
    const warm = th && o.Troom > th.start + 0.3;
    const recent = (this.lastDoorT !== null && o.t - this.lastDoorT < 600) || (this.lastLoadT !== null && o.t - this.lastLoadT < 1800);
    const benign = !top || ['normal', 'carga_termica'].includes(top.id) || (top.id === 'evaporador' && o.fanE && o.frostFactor > 0.7) || top.confidence <= 0.5;
    if ((warm || recent) && benign) {
      return warm
        ? { text: 'Enfriando la cámara', sub: `Está a ${fmt(o.Troom)} °C y el termostato para a ${fmt(th.stop)} °C. Con la cámara caliente la baja y el salto térmico son mayores: es normal.`, cls: 'ok' }
        : { text: 'Recuperándose', sub: `Hace poco se abrió la puerta o entró género: la cámara vuelve a su temperatura.`, cls: 'ok' };
    }
    if (!top || top.id === 'normal') {
      const lab = APPS[d ? d.app : 'positiva'].label;
      return { text: 'Funciona bien', sub: `Lecturas normales (${lab[0].toLowerCase()}${lab.slice(1)}). Toca aquí para ver el análisis.`, cls: 'ok' };
    }
    if (top.id === 'carga_termica') return { text: 'Mucha carga de calor', sub: 'La cámara está caliente: presiones e intensidad altas. Deben ir bajando.', cls: 'warn' };
    return { text: top.name, sub: `Probabilidad ${Math.round(top.confidence * 100)} %. Toca aquí para ver por qué y qué comprobar.`, cls: top.confidence > 0.45 ? 'bad' : 'warn' };
  }

  // ============================================================ cambios
  /** Cambia una propiedad de un componente del esquema. */
  setCompProp(id, key, value) {
    const th = this.thermostat();
    if (th && id === th.id && (key === 'sp' || key === 'diff')) {
      this.setThermostat(key, value);
      return;
    }
    this._setProp(id, key, value);
  }

  _setProp(id, key, value) {
    this.editor.setProp(id, key, value);
    if (this.sim) {
      this.sim.elec.build();
      this.sim.resolve();
      this.editor.refresh();
    }
    if (this.mode === 'edit' && key === 'tag') this.panels.renderProps();
  }

  setThermostat(key, value) {
    const th = this.thermostat();
    if (!th) return;
    const tag = th.props.tag;
    const sp = () => +th.props.sp;
    const start = () => +th.props.sp + +th.props.diff;
    this.withPrediction(
      () => `Termostato ${tag}: para a ${fmt(sp())} °C y arranca a ${fmt(start())} °C`,
      () => this._setProp(th.id, key, value),
      {
        roomBefore: +th.props.sp + +th.props.diff / 2,
        room: () => sp() + +th.props.diff / 2,
        note: () => this.thermoNote(),
      },
    );
    if (this.sim) {
      this.logSoon('th', 'info', () => `Termostato ${tag}: consigna ${fmt(sp())} °C, diferencial ${fmt(+th.props.diff)} K. ${this.thermoNote()}`);
      this.markSoon('th', () => `consigna ${fmt(sp())} °C`);
    }
    this.syncQuick();
  }

  thermoNote() {
    const o = this.out();
    const th = this.thermoInfo();
    if (!o || !th) return '';
    if (o.Troom <= th.stop) return `La cámara (${fmt(o.Troom)} °C) ya está por debajo: el termostato queda satisfecho y el compresor para hasta que suba a ${fmt(th.start)} °C.`;
    if (o.Troom >= th.start) return `La cámara (${fmt(o.Troom)} °C) está por encima: el termostato pide frío hasta bajar a ${fmt(th.stop)} °C.`;
    return `La cámara (${fmt(o.Troom)} °C) está dentro del diferencial: el compresor sigue como estaba.`;
  }

  setRefrig(key, value) {
    const P = this.project.refrig;
    const old = this.params()[key];
    if (old === value && P[key] === value) return;
    const apply = () => {
      P[key] = value;
      if (this.sim) {
        const m = this.sim.fridge;
        if (RESIZE.has(key)) m.setParams({ ...m.p, [key]: value });
        else m.p[key] = value;
      }
    };
    if (this.sim && this.refrigOn() && PREDICT_REFRIG.has(key)) {
      const label = {
        refrigerant: () => `Refrigerante ${value}`,
        capacityKW: () => `Máquina de ${fmt(this.params().capacityKW)} kW`,
        expansion: () => (this.params().expansion === 'capilar' ? 'Expansión por capilar' : 'Expansión por VET'),
        Tamb: () => `Exterior a ${fmt(this.params().Tamb, 0)} °C`,
        shSet: () => `VET ajustada a ${fmt(this.params().shSet)} K`,
      }[key];
      this.withPrediction(label, apply);
    } else apply();
    if (this.sim) {
      const ref0 = this._refOld && this._refOld.key === key ? this._refOld.v : old;
      this._refOld = { key, v: ref0 };
      const txt = refrigText(key, value, ref0);
      if (txt) {
        this.logSoon(`r-${key}`, 'cause', () => {
          this._refOld = null;
          return refrigText(key, this.params()[key], ref0);
        });
        this.markSoon(`r-${key}`, () => ({ refrigerant: this.params().refrigerant, Tamb: `exterior ${fmt(this.params().Tamb, 0)} °C`, shSet: `VET ${fmt(this.params().shSet)} K`, capacityKW: `${fmt(this.params().capacityKW)} kW`, expansion: this.params().expansion, roomUA: 'aislamiento' }[key] || key));
      }
    }
    this.saveSoon();
    this.syncQuick();
  }

  setFault(key, value) {
    this.project.faults[key] = value;
    const apply = () => {
      if (this.sim) this.sim.fridge.setFaults({ [key]: value });
    };
    if (this.sim && this.refrigOn() && !NO_PREDICT.has(key) && !this.practiceHideFaults) this.withPrediction(() => `Avería: ${faultText(key, this.faults()[key])}`, apply);
    else apply();
    if (this.sim && !this.practiceHideFaults) {
      const level = key === 'leakRate' && value ? 'cause' : 'warn';
      this.logSoon(`f-${key}`, level, () => {
        const v = this.faults()[key];
        let msg = `Avería: ${faultText(key, v)}.`;
        if (key === 'leakRate' && v) msg += ' Irá bajando la carga: primero burbujas en el visor, luego sube el recalentamiento y baja la presión de baja. Prueba a adelantar 1 h.';
        return msg;
      });
      this.markSoon(`f-${key}`, () => faultText(key, this.faults()[key]));
    }
    this.saveSoon();
  }

  clearFaults() {
    this.project.faults = { ...DEFAULT_FAULTS };
    const apply = () => {
      if (this.sim) this.sim.fridge.setFaults({ ...DEFAULT_FAULTS });
    };
    if (this.sim && this.refrigOn() && !this.practiceHideFaults) this.withPrediction('Sin averías', apply);
    else apply();
    if (this.sim) {
      this.log('info', 'Se han quitado todas las averías.');
      this.trend.mark(this.sim.time, 'sin averías');
    }
    this.saveSoon();
  }

  setRefrigEnabled(on) {
    this.project.refrig.enabled = on;
    this.saveSoon();
  }

  toggleDoor() {
    const sim = this.sim;
    if (!sim) return;
    const open = !sim.fridge.door;
    this.withPrediction(open ? 'Puerta abierta' : 'Puerta cerrada', () => {
      sim.setDoor(open);
      sim.resolve();
      this.editor.refresh();
    });
    if (open) this.lastDoorT = sim.time;
    this.trend.mark(sim.time, open ? 'puerta abierta' : 'puerta cerrada');
    this.syncQuick();
    this.cards.refresh();
  }

  addProductLoad() {
    const sim = this.sim;
    if (!sim) return;
    const f = (this.params().capacityKW || 2.5) / 2.5;
    sim.fridge.addProductLoad(3500 * f);
    this.lastLoadT = sim.time;
    this.trend.mark(sim.time, 'género caliente');
    this.log('cause', `Se mete género caliente (≈ ${Math.round(120 * f)} kg a temperatura ambiente): sube la carga térmica, la cámara tarda más en enfriar y la presión de BAJA sube.`);
  }

  forceDefrost() {
    const d = this.clockDevice();
    if (!d || !this.sim) return;
    this.sim.elec.forceDefrost(d);
    this.sim.elec.dirty = true;
    this.sim.resolve();
    this.editor.refresh();
    this.trend.mark(this.sim.time, d.defrost ? 'desescarche' : 'fin desescarche');
  }

  manualDefrost() {
    if (!this.sim) return;
    this.sim.fridge.s.ice = 0;
    this.log('cause', 'Se quita el hielo de la batería a mano: el aire vuelve a pasar bien y la presión de BAJA sube.');
    this.trend.mark(this.sim.time, 'hielo quitado');
  }

  clickComp(id) {
    const sim = this.sim;
    if (!sim) return;
    const c = sim.elec.compById.get(id);
    if (c && (c.type === 'door_nc' || c.type === 'door_no')) {
      this.toggleDoor();
      return;
    }
    sim.elec.click(id);
    sim.resolve();
    this.editor.refresh();
    this.cards.refresh();
  }

  highlight(ids) {
    this.editor.highlight(ids);
  }

  // Registro y marcas agrupados: los mandos de paso a paso generan muchos cambios seguidos.
  logSoon(key, level, msgFn) {
    clearTimeout(this._logSoon[key]);
    this._logSoon[key] = setTimeout(() => {
      const msg = msgFn();
      if (msg && this.sim) this.log(level, msg);
    }, 700);
  }

  markSoon(key, labelFn) {
    clearTimeout(this._logSoon[`m-${key}`]);
    this._logSoon[`m-${key}`] = setTimeout(() => this.sim && this.trend.mark(this.sim.time, labelFn()), 300);
  }

  // ============================================================ previsión
  /** Temperatura de cámara para la previsión: la del termostato si ya está cerca. */
  predRoom() {
    const o = this.out();
    const th = this.thermoInfo();
    if (!o) return 5;
    if (!th) return o.Troom;
    if (o.Troom > th.start + 3 || o.Troom < th.stop - 3) return o.Troom;
    return (th.stop + th.start) / 2;
  }

  /** Qué hace la parte eléctrica con los ventiladores (para prever el punto en marcha). */
  runIO() {
    const sim = this.sim;
    const io = sim.io;
    const door = sim.fridge.door;
    return {
      evapFan: !io.present.evapFan || io.evapFan || (io.comp !== 'run' && !door),
      condFan: !io.present.condFan || io.condFan || io.comp !== 'run',
    };
  }

  predictAt(Troom) {
    return this.sim.fridge.predict({ Troom, io: this.runIO() });
  }

  /**
   * Aplica un cambio y enseña qué va a pasar: compara el funcionamiento en
   * marcha antes y después (misma cámara, salvo que cambie el termostato).
   */
  withPrediction(label, apply, { roomBefore, room, note } = {}) {
    const sim = this.sim;
    if (!sim || !this.refrigOn() || this.mode === 'edit' || this.mode === 'diag') {
      apply();
      return;
    }
    if (!this._pp || this._pp.sim !== sim) {
      const rb = roomBefore ?? this.predRoom();
      this._pp = { sim, room: rb, before: this.predictAt(rb) };
    }
    apply();
    clearTimeout(this._ppT);
    this._ppT = setTimeout(() => {
      const pp = this._pp;
      this._pp = null;
      if (!pp || this.sim !== pp.sim) return;
      const ra = typeof room === 'function' ? room() : room ?? pp.room;
      const after = this.predictAt(ra);
      this.showPrediction(pp.before, after, {
        label: typeof label === 'function' ? label() : label,
        roomBefore: pp.room,
        room: ra,
        note: typeof note === 'function' ? note() : note,
      });
    }, 280);
  }

  showPrediction(before, after, { label, roomBefore, room, note }) {
    const B = readingVM(before);
    const A = readingVM(after);
    const vm = {};
    for (const [k, th] of Object.entries(ARROW_TH)) if (Math.abs(A[k] - B[k]) >= th) vm[k] = A[k];
    this.pred = { vm, t0: this.sim.time };
    const parts = [];
    if (Math.abs(room - roomBefore) > 0.3) parts.push(`cámara ${fmt(roomBefore)} → ${fmt(room)} °C`);
    for (const [k, name, d, unit] of PRED_TEXT) {
      if (!(k in vm)) continue;
      parts.push(`${name} ${fmt(B[k], d)} → ${fmt(A[k], d)}${unit ? ' ' + unit : ''}`);
    }
    let text = parts.length
      ? `${label}. En marcha con la cámara a ${fmt(room)} °C: ${parts.join(' · ')}.`
      : `${label}. En el punto de funcionamiento apenas cambia nada.`;
    const pa = this.pressostat('alta');
    const pb = this.pressostat('baja');
    if (pa && A.PcG >= +pa.props.cut) text += ` ⚠ Pasa del corte del presostato de alta (${pa.props.tag}, ${fmt(+pa.props.cut)} bar): lo parará.`;
    else if (pb && A.PeG <= +pb.props.cut) text += ` ⚠ Baja del corte del presostato de baja (${pb.props.tag}, ${fmt(+pb.props.cut)} bar): lo parará.`;
    const el = this.$('story-pred');
    el.innerHTML = '';
    el.append(
      h('b', {}, 'Qué va a pasar'),
      h('p', {}, text, note ? h('span', { class: 'pred-note' }, ` ${note}`) : null),
      h('button', { class: 'card-x', type: 'button', 'aria-label': 'Cerrar la previsión', onclick: () => this.clearPrediction() }, '×'),
    );
    el.hidden = false;
    this.log('info', `Previsión — ${text}${note ? ' ' + note : ''}`);
    this.updateReadings();
  }

  clearPrediction() {
    this.pred = null;
    const el = this.$('story-pred');
    if (el) {
      el.hidden = true;
      el.innerHTML = '';
    }
  }

  // ============================================================== tarjetas
  cardPos(spec, e) {
    if (e && Number.isFinite(e.clientX) && (e.clientX || e.clientY)) {
      spec.x = e.clientX;
      spec.y = e.clientY;
    } else if (e && e.target && e.target.getBoundingClientRect) {
      const r = e.target.getBoundingClientRect();
      spec.x = r.left + r.width / 2;
      spec.y = r.top + r.height / 2;
    }
  }

  /** Toca una pieza del circuito frigorífico (o de la barra de lecturas). */
  openPart(part, e) {
    if (part === 'verdict') {
      this.openVerdict(e);
      return;
    }
    if (!this.out() || this.mode === 'edit' || this.mode === 'diag') return;
    const spec = partCard(this, part);
    if (!spec) return;
    if (this.cards.isOpen(spec.key)) {
      this.cards.close();
      return;
    }
    this.cardPos(spec, e);
    const inner = spec.onClose;
    spec.onClose = () => {
      if (inner) inner();
      this.fridgeView.select(null);
      this.editor.highlight([]);
    };
    this.cards.open(spec);
    this.fridgeView.select(part);
    this.editor.highlight(this.partComps(part));
  }

  /** Componentes del esquema relacionados con una pieza (para resaltarlos). */
  partComps(part) {
    const sim = this.sim && this.sim.elec;
    if (!sim) return [];
    const ids = new Set();
    const addPath = (id, deep) => {
      const x = explainLoad(sim, id);
      for (const q of x.path) {
        ids.add(q);
        const c = sim.compById.get(q);
        // Contactos de un relé: se añade también la cadena de su bobina.
        if (deep && c && ['c_main3', 'c_no', 'c_nc', 't_no', 't_nc'].includes(c.type)) {
          const coil = sim.comps.find((k) => (k.type === 'coil' || k.type === 'tcoil') && k.props.tag === c.props.tag);
          if (coil && !ids.has(coil.id)) addPath(coil.id, false);
        }
      }
    };
    for (const fn of PART_FUNCS[part] || []) for (const c of sim.comps) if (c.props.func === fn) addPath(c.id, true);
    if (part === 'room') {
      const th = this.thermostat();
      if (th) ids.add(th.id);
      for (const c of sim.comps) if (c.type === 'door_nc' || c.type === 'door_no') ids.add(c.id);
    }
    if (part === 'pa' || part === 'pb') {
      const c = this.pressostat(part === 'pa' ? 'alta' : 'baja');
      if (c) ids.add(c.id);
    }
    return [...ids].filter((id) => {
      const c = sim.compById.get(id);
      return c && !['supply3', 'supply1', 'bus'].includes(c.type);
    });
  }

  /** Toca un componente del esquema en simulación. */
  openComp(id, e) {
    if (!this.sim) return;
    const spec = compCard(this, id);
    if (!spec) return;
    if (this.cards.isOpen(spec.key)) {
      this.cards.close();
      return;
    }
    this.cardPos(spec, e);
    const inner = spec.onClose;
    spec.onClose = () => {
      if (inner) inner();
      this.fridgeView.select(null);
    };
    this.cards.open(spec);
    const c = this.sim.elec.compById.get(id);
    this.fridgeView.select(this.refrigOn() ? this.compPart(c) : null);
  }

  compPart(c) {
    if (!c) return null;
    if (c.props.func && FUNC_PART[c.props.func]) return FUNC_PART[c.props.func];
    if (c.type === 'thermostat') return c.props.probe === 'evaporador' ? 'evap' : 'room';
    if (c.type === 'pressostat') return c.props.kind === 'alta' ? 'pa' : 'pb';
    if (c.type === 'door_nc' || c.type === 'door_no') return 'room';
    return null;
  }

  /** Tarjeta del veredicto: el análisis de las lecturas en vivo. */
  openVerdict(e) {
    if (this.mode !== 'sim' || !this.out()) return;
    const key = 'verdict';
    if (this.cards.isOpen(key)) {
      this.cards.close();
      return;
    }
    const app = this;
    let box;
    let lastKey = '';
    const spec = {
      key,
      kicker: 'DIAGNÓSTICO EN VIVO',
      title: 'Qué le pasa a la máquina',
      what: 'Comparo cada lectura con lo normal para esta instalación y con la «firma» de cada avería, igual que en Diagnosticar con una máquina real.',
      render(b) {
        box = h('div', { class: 'vd-box' });
        b.append(box, h('div', { class: 'row' },
          h('button', { class: 'btn small primary', type: 'button', onclick: () => {
            app.cards.close();
            app.setMode('diag');
            app.diagPage.fromSim();
          } }, 'Abrir en Diagnosticar')));
      },
      update() {
        const o = app.out();
        if (!o) return;
        const d = app.lastDiag;
        const v = app.verdictNow || {};
        const hyps = o.running && d ? d.hypotheses.filter((x) => x.confidence > 0.06).slice(0, 3) : [];
        const k = `${v.text}|${hyps.map((x) => `${x.id}${Math.round(x.confidence * 20)}`).join(',')}`;
        if (k === lastKey) return;
        lastKey = k;
        box.innerHTML = '';
        box.append(h('p', { class: `vd-now ${v.cls || ''}` }, h('b', {}, v.text || '—'), v.sub ? ` · ${v.sub}` : ''));
        if (!hyps.length) {
          if (!o.running) box.append(h('p', { class: 'note' }, 'Con el compresor parado no se puede diagnosticar el circuito frigorífico: espera a que arranque.'));
          return;
        }
        for (const x of hyps) {
          const pct = Math.round(x.confidence * 100);
          const det = h('details', { class: 'dg-hyp', open: x === hyps[0] || undefined },
            h('summary', {}, h('span', { class: 'dg-hname' }, x.name), h('span', { class: 'dg-bar' }, h('i', { style: `width:${pct}%` })), h('span', { class: 'dg-pct' }, `${pct} %`)));
          if (x.evidence && x.evidence.length) det.append(h('ul', { class: 'dg-ev' }, x.evidence.slice(0, 6).map((ev) => h('li', { class: ev.ok ? 'ok' : 'no' }, ev.text))));
          if (x.checks && x.checks.length) det.append(h('p', { class: 'note' }, `Comprueba: ${x.checks[0]}`));
          box.append(det);
        }
      },
    };
    this.cardPos(spec, e);
    this.cards.open(spec);
  }

  // =============================================================== práctica
  /** Prepara una máquina con una avería y la deja funcionando unos minutos. */
  setupScenario({ example, refrigerant, Tamb, faults, warm = 3, minutes = 14 }) {
    const p = buildExample(example);
    p.name = 'Avería misteriosa';
    p.refrig.refrigerant = refrigerant;
    p.refrig.Tamb = Tamb;
    const th = p.components.find((c) => c.type === 'thermostat' && c.props.probe === 'camara' && c.props.mode !== 'calor');
    if (th) p.refrig.TroomInit = +th.props.sp + +th.props.diff + warm;
    p.faults = { ...DEFAULT_FAULTS, ...faults };
    this.practiceHideFaults = this.mode === 'practice';
    this.narrator.noSpoilers = this.practiceHideFaults;
    this.loadProject(p, { quiet: true, noSave: true });
    if (!this.sim) return;
    this.advance(minutes * 60, 5);
    // Que esté en marcha al preguntar.
    for (let i = 0; i < 25 && this.sim.fridge.out && !this.sim.fridge.out.running; i++) this.advance(60, 5);
    this.panels.clearLog();
    this.unread = 0;
    this.$('log-badge').hidden = true;
    this.refreshReadings();
    this.drawCharts();
  }

  /** Enseña la avería de la práctica y abre la tarjeta donde se puede reparar. */
  revealFaults() {
    this.practiceHideFaults = false;
    this.narrator.noSpoilers = false;
    const F = this.faults();
    const keys = Object.keys(DEFAULT_FAULTS).filter((k) => (k === 'chargePct' ? Math.abs(F[k] - 100) > 2 : F[k] !== DEFAULT_FAULTS[k]));
    if (!keys.length) {
      this.snack('Esta máquina no tenía ninguna avería.');
      return;
    }
    this.log('warn', `La avería era: ${keys.map((k) => faultText(k, F[k])).join(', ')}. Puedes repararla desde la tarjeta y ver cómo se recupera.`);
    let part = FAULT_PART[keys[0]];
    if (keys[0] === 'filterClog' && this.params().expansion === 'capilar') part = 'txv';
    const el = this.fridgeView.svg.querySelector(`[data-part="${part}"]`);
    const r = el && el.getBoundingClientRect();
    this.cards.close();
    this.openPart(part, r && r.width ? { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 } : null);
  }

  /** Desde «Diagnosticar»: reproduce la avería en el simulador. */
  simulateFault(hyp, st) {
    const spec = hyp.sim || {};
    let example = spec.example || (st.app === 'negativa' ? 'congelados' : st.expansion === 'capilar' || st.app === 'domestica' ? 'armario' : 'positiva');
    if (spec.expansion === 'capilar') example = 'armario';
    const p = buildExample(example);
    const ref = getRefrigerant(st.refrigerant);
    if (ref.sim) p.refrig.refrigerant = ref.id;
    const Tamb = num(st.Tamb);
    if (Tamb !== null) p.refrig.Tamb = clamp(Math.round(Tamb), -10, 46);
    const th = p.components.find((c) => c.type === 'thermostat' && c.props.probe === 'camara' && c.props.mode !== 'calor');
    if (th) p.refrig.TroomInit = spec.roomHot ? +th.props.sp + 12 : +th.props.sp + +th.props.diff + 1.5;
    Object.assign(p.refrig, spec.params || {});
    p.faults = { ...DEFAULT_FAULTS, ...(spec.faults || {}) };
    p.name = `${p.name} — ${hyp.name}`;
    this.loadProject(p, { undoable: true });
    this.setMode('sim');
    this.fastForward(360);
    this.log('info', `Simulando «${hyp.name}» con ${p.refrig.refrigerant}. Adelanto 6 minutos para que se vea el efecto; toca las piezas para ver y cambiar la avería.`);
  }

  // ================================================================ bucle
  frame(ts) {
    // El siguiente fotograma se pide antes: un error puntual no para la simulación.
    requestAnimationFrame((t) => this.frame(t));
    try {
      this._frame(ts);
    } catch (err) {
      if (!this._frameErr) console.error(err);
      this._frameErr = err;
    }
  }

  _frame(ts) {
    const dt = Math.min(0.1, Math.max(0, (ts - this.last) / 1000));
    this.last = ts;
    const sim = this.sim;
    const live = sim && (this.mode === 'sim' || this.mode === 'practice');
    if (live && !this.paused && !sim.elec.fault) {
      if (this.ffwd) {
        const chunk = Math.min(this.ffwd.left, 150);
        this.advance(chunk);
        this.ffwd.left -= chunk;
        if (this.ffwd.left <= 1e-6) this.endFfwd();
      } else this.advance(dt * this.ui.speed);
    }
    const o = this.out();
    if (live && o) this.fridgeView.update(o, this.fridgeInfo(), this.paused ? 0 : dt);

    this.acc += dt;
    this.accChart += dt;
    this.accDiag += dt;
    if (this.acc > 0.25) {
      this.acc = 0;
      this.uiTick();
    }
    if (this.accChart > 0.3 && live && !this.ui.collapsed) {
      this.accChart = 0;
      this.drawCharts();
    }
  }

  uiTick() {
    const sim = this.sim;
    const live = this.mode === 'sim' || this.mode === 'practice';
    if (sim && live) {
      this.editor.refresh();
      this.$('sim-clock').textContent = clockText(sim.time);
      const banner = this.$('elec-banner');
      if (sim.elec.fault) {
        banner.hidden = false;
        banner.textContent = '⚡ Cortocircuito sin protección: revisa el esquema en «Editar esquema».';
      } else banner.hidden = true;
      if (this.out()) {
        if (this.paused && this.accDiag > 1) {
          this.accDiag = 0;
          this.computeVerdict();
        }
        this.updateReadings();
      }
      this.cards.refresh();
      this.syncQuick();
      if (this.mode === 'sim' && this.ui.tabs.sim === 'room' && !this.ui.collapsed) this.panels.syncRoom(this.$('panel-room'));
    }
    if (this.mode === 'edit' && this.ui.tabs.edit === 'install') this.panels.syncRoom(this.$('panel-install'));
  }

  drawCharts() {
    const tab = this.ui.tabs[this.mode];
    if (tab === 'chart') this.trend.draw();
    if (tab === 'ph') this.ph.draw(this.out());
  }

  // ============================================================ registro
  log(level, msg, t) {
    const e = { level, msg, t: t ?? (this.sim ? this.sim.time : 0) };
    this.panels.addLog(e);
    const story = this.refrigOn() ? ['cause', 'warn', 'error', 'result'].includes(level) : level !== 'result';
    if (story) this.setStory(level, msg);
    if (this.ui.tabs[this.mode] !== 'log' || this.ui.collapsed) {
      this.unread++;
      const b = this.$('log-badge');
      b.hidden = false;
      b.textContent = this.unread > 99 ? '99+' : String(this.unread);
    }
  }

  setStory(level, msg) {
    const el = this.$('story');
    el.dataset.level = level;
    this.$('story-text').textContent = msg;
    this.$('story-ic').textContent = { cause: '→', warn: '!', error: '!', result: '↳', info: 'i' }[level] || 'i';
  }

  snack(msg, action) {
    let el = this.$('snack');
    if (!el) {
      el = h('div', { id: 'snack', class: 'snack keep-card', role: 'status' });
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

  // ======================================================= cuadro de mando
  /** Mandos rápidos de la barra superior (según lo que tenga el esquema). */
  buildQuick() {
    const q = this.$('quick');
    q.innerHTML = '';
    this.quick = {};
    if (!this.sim) return;
    const icon = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
    const s1 = this.marchaButton();
    const s0 = this.paroButton();
    if (s1 || s0) {
      const g = h('div', { class: 'qc btns', role: 'group', 'aria-label': 'Marcha y paro' });
      if (s1) {
        g.append(h('button', { class: 'btn small', type: 'button', title: `Pulsa ${s1.props.tag} (${s1.props.name})`, onclick: () => this.pressButton(s1.id) }, 'Marcha'));
      }
      if (s0) {
        g.append(h('button', { class: 'btn small', type: 'button', title: `Pulsa ${s0.props.tag} (${s0.props.name})`, onclick: () => this.pressButton(s0.id) }, 'Paro'));
      }
      q.append(g);
    }
    if (!this.refrigOn()) return;
    const th = this.thermostat();
    if (th) {
      const st = stepper('Consigna', +th.props.sp, { step: 1, min: -35, max: 20, unit: '°C' }, (v) => this.setThermostat('sp', v));
      q.append(h('div', { class: 'qc', title: `Termostato ${th.props.tag}: temperatura a la que para el frío` }, h('span', {}, 'Cámara'), st));
      this.quick.sp = { ctl: st, get: () => +th.props.sp, last: +th.props.sp };
    }
    const door = h('button', { class: 'btn small', type: 'button', onclick: () => this.toggleDoor() });
    door.innerHTML = `${icon('i-door')}<span>Abrir puerta</span>`;
    const dg = h('div', { class: 'qc btns' }, door);
    if (this.clockDevice()) {
      const df = h('button', { class: 'btn small', type: 'button', title: 'Forzar o terminar un desescarche', onclick: () => this.forceDefrost() });
      df.innerHTML = `${icon('i-drop')}<span>Desescarche</span>`;
      dg.append(df);
      this.quick.defrost = { el: df };
    }
    q.append(dg);
    this.quick.door = { el: door };
    const amb = stepper('Exterior', this.params().Tamb, { step: 1, min: -10, max: 46, unit: '°C' }, (v) => this.setRefrig('Tamb', v));
    q.append(h('div', { class: 'qc', title: 'Temperatura del aire exterior (el que enfría el condensador)' }, h('span', {}, 'Exterior'), amb));
    this.quick.amb = { ctl: amb, get: () => this.params().Tamb, last: this.params().Tamb };
    const sel = h('select', { 'aria-label': 'Refrigerante' }, SIM_REFRIGERANT_IDS.map((id) => h('option', { value: id, selected: id === this.params().refrigerant }, id)));
    sel.addEventListener('change', () => this.setRefrig('refrigerant', sel.value));
    q.append(h('label', { class: 'qc', title: 'Cambia el refrigerante y mira cómo cambian las presiones' }, h('span', {}, 'Gas'), sel));
    this.quick.ref = { ctl: { setValue: (v) => (sel.value = v) }, get: () => this.params().refrigerant, last: this.params().refrigerant };
  }

  syncQuick() {
    const Q = this.quick || {};
    for (const k of ['sp', 'amb', 'ref']) {
      const s = Q[k];
      if (!s) continue;
      const v = s.get();
      if (v !== s.last) {
        s.last = v;
        s.ctl.setValue(v);
      }
    }
    const o = this.out();
    if (Q.door && o) {
      const t = o.door ? 'Cerrar puerta' : 'Abrir puerta';
      const span = Q.door.el.querySelector('span');
      if (span.textContent !== t) span.textContent = t;
      Q.door.el.classList.toggle('on', o.door);
    }
    if (Q.defrost && o) Q.defrost.el.classList.toggle('on', !!o.heater);
  }

  // =================================================================== UI
  buildPalette() {
    const pal = this.$('palette');
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
          if (this.mode !== 'edit') return;
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
    const $ = this.$;
    for (const b of document.querySelectorAll('.modes [data-mode]')) b.addEventListener('click', () => this.setMode(b.dataset.mode));
    const sel = $('sel-example');
    sel.innerHTML = '';
    sel.append(h('option', { value: '', selected: true, disabled: true }, 'Abrir ejemplo…'));
    const og = h('optgroup', { label: 'Ejemplos' });
    for (const e of EXAMPLES) og.append(h('option', { value: e.id }, e.build().name));
    sel.append(og, h('optgroup', { label: 'Nuevo' }, h('option', { value: 'blank-3f' }, 'Esquema en blanco (3F+N)'), h('option', { value: 'blank-1f' }, 'Esquema en blanco (L+N)')));
    sel.addEventListener('change', () => {
      const v = sel.value;
      sel.value = '';
      if (v === 'blank-3f' || v === 'blank-1f') {
        this.setMode('edit');
        this.loadProject(blankProject(v === 'blank-3f' ? '3f' : '1f'), { undoable: true });
      } else if (v) this.loadProject(buildExample(v), { undoable: true });
    });
    $('btn-open').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) this.openFile(f);
      e.target.value = '';
    });
    $('btn-save').addEventListener('click', () => this.download());
    $('btn-theme').addEventListener('click', () => {
      const dark = this.effectiveDark();
      this.ui.theme = dark ? 'light' : 'dark';
      this.saveUI();
      this.applyUI();
      this.drawCharts();
    });

    // Simulación.
    $('btn-pause').addEventListener('click', () => this.togglePause());
    for (const b of document.querySelectorAll('.speeds [data-speed]')) {
      b.addEventListener('click', () => {
        this.ui.speed = Number(b.dataset.speed);
        this.saveUI();
        this.updateToolbar();
      });
    }
    $('btn-ff10').addEventListener('click', () => this.fastForward(600));
    $('btn-ff60').addEventListener('click', () => this.fastForward(3600));
    $('btn-reset').addEventListener('click', () => {
      if (this.mode === 'practice' && this.practice.cur) this.practice.start();
      else this.startSim();
    });
    $('btn-story-log').addEventListener('click', () => this.selectTab('log'));

    // Editor.
    $('btn-undo').addEventListener('click', () => this.editor.undo());
    $('btn-redo').addEventListener('click', () => this.editor.redo());
    for (const b of document.querySelectorAll('.tool')) b.addEventListener('click', () => this.editor.setTool(b.dataset.tool));
    $('btn-rotate').addEventListener('click', () => this.editor.rotateSelection());
    $('btn-delete').addEventListener('click', () => this.editor.deleteSelection());
    $('btn-parts-mobile').addEventListener('click', () => this.root.classList.toggle('pal-open'));
    $('btn-zoom-in').addEventListener('click', () => this.editor.zoomAt(1.25));
    $('btn-zoom-out').addEventListener('click', () => this.editor.zoomAt(0.8));
    $('btn-fit').addEventListener('click', () => this.editor.zoomToFit());

    // Panel inferior.
    for (const t of document.querySelectorAll('.tabs [role="tab"]')) t.addEventListener('click', () => this.selectTab(t.dataset.tab));
    $('btn-dock').addEventListener('click', () => {
      this.ui.collapsed = !this.ui.collapsed;
      this.saveUI();
      this.applyUI();
      requestAnimationFrame(() => this.drawCharts());
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
      const t = e.target;
      const tag = (t && t.tagName) || '';
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
      if (this.mode === 'edit') {
        if (this.editor.key(e)) e.preventDefault();
        return;
      }
      if (this.mode !== 'sim' && this.mode !== 'practice') return;
      if (t && t.closest && t.closest('button, [role="button"], [role="switch"], a, summary')) return;
      if ((e.key === ' ' || e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.togglePause();
      }
    });
  }

  selectTab(tab, { quiet = false } = {}) {
    const btn = [...document.querySelectorAll('.tabs [role="tab"]')].find((t) => t.dataset.tab === tab);
    if (!btn || btn.hidden) return;
    this.ui.tabs[this.mode] = tab;
    this.selectTabQuiet(tab);
    if (this.ui.collapsed && !quiet) {
      this.ui.collapsed = false;
      this.applyUI();
    }
    if (tab === 'log') {
      this.unread = 0;
      this.$('log-badge').hidden = true;
    }
    if (tab === 'room') this.panels.renderRoom(this.$('panel-room'));
    if (tab === 'install') this.panels.renderRoom(this.$('panel-install'), { edit: true });
    if (tab === 'props') this.panels.renderProps();
    if (tab === 'chart' || tab === 'ph') requestAnimationFrame(() => this.drawCharts());
    this.saveUI();
  }

  selectTabQuiet(tab) {
    for (const t of document.querySelectorAll('.tabs [role="tab"]')) t.setAttribute('aria-selected', String(t.dataset.tab === tab));
    for (const p of document.querySelectorAll('.panel[data-panel]')) p.hidden = p.dataset.panel !== tab;
  }

  bindLayout() {
    const split = this.$('splitter');
    split.addEventListener('pointerdown', (e) => {
      split.setPointerCapture(e.pointerId);
      split.classList.add('dragging');
      const stage = this.$('stage').getBoundingClientRect();
      const move = (ev) => {
        this.ui.split = clamp((ev.clientX - stage.left) / stage.width, 0.25, 0.78);
        this.root.style.setProperty('--split', this.ui.split);
      };
      const up = () => {
        split.classList.remove('dragging');
        split.removeEventListener('pointermove', move);
        split.removeEventListener('pointerup', up);
        this.saveUI();
        this.editor.zoomToFit();
      };
      split.addEventListener('pointermove', move);
      split.addEventListener('pointerup', up);
    });
    split.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        this.ui.split = clamp(this.ui.split + (e.key === 'ArrowLeft' ? -0.03 : 0.03), 0.25, 0.78);
        this.root.style.setProperty('--split', this.ui.split);
        this.saveUI();
      }
    });
    const rs = this.$('dock-resize');
    rs.addEventListener('pointerdown', (e) => {
      rs.setPointerCapture(e.pointerId);
      const move = (ev) => {
        this.ui.dock = Math.round(clamp(window.innerHeight - ev.clientY, 120, window.innerHeight * 0.7));
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
    const ro = new ResizeObserver(() => this.drawCharts());
    ro.observe(document.querySelector('.panels'));
    window.addEventListener('hashchange', () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (HASH_MODES[id]) this.setMode(HASH_MODES[id]);
      else if (EXAMPLES.some((e) => e.id === id)) {
        if (this.mode !== 'sim' && this.mode !== 'edit') this.setMode('sim');
        this.loadProject(buildExample(id), { undoable: true });
      }
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
  }

  updateToolbar() {
    const r = this.root;
    const sim = !!this.sim;
    r.classList.toggle('paused', sim && this.paused);
    const pause = this.$('btn-pause');
    pause.innerHTML = this.paused ? '<svg><use href="#i-play"/></svg>' : '<svg><use href="#i-pause"/></svg>';
    pause.title = this.paused ? 'Continuar (espacio)' : 'Pausa (espacio)';
    pause.setAttribute('aria-pressed', String(this.paused));
    for (const b of document.querySelectorAll('.speeds [data-speed]')) {
      const on = Number(b.dataset.speed) === this.ui.speed;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      b.setAttribute('role', 'radio');
    }
    for (const b of document.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === this.editor.tool);
    this.$('btn-undo').disabled = !this.editor.history.length;
    this.$('btn-redo').disabled = !this.editor.future.length;
    if (!sim) this.$('sim-clock').textContent = '0:00:00';
    if (this.editor.tool !== 'place') for (const x of document.querySelectorAll('.pal-item.on')) x.classList.remove('on');
  }
}

function boot() {
  window.frigosimu = new App();
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
else boot();
