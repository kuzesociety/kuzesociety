// Paneles inferiores: propiedades, cámara/averías, diagnóstico y registro.

import { TYPES } from '../elec/components.js';
import { REFRIGERANTS, REFRIGERANT_IDS } from '../refrig/refrigerants.js';
import { DEFAULT_REFRIG, DEFAULT_FAULTS } from '../refrig/model.js';
import { diagnose } from '../narrator.js';

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');

export function clockText(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const DESCRIPTIONS = {
  supply3: 'Red trifásica: L1, L2 y L3 a 400 V entre fases y N (230 V fase-neutro).',
  supply1: 'Red monofásica de 230 V (L y N).',
  bus: 'Borne suelto de una fase o del neutro. Útil para las barras del circuito de mando.',
  mcb1: 'Protege contra cortocircuitos: si una red queda unida a dos potenciales, dispara. En simulación, clic para abrir/cerrar o rearmar.',
  mcb2: 'Protege contra cortocircuitos (fase + neutro). En simulación, clic para abrir/cerrar o rearmar.',
  mcb3: 'Protección trifásica. En simulación, clic para abrir/cerrar o rearmar.',
  mcb4: 'Protección 3 fases + neutro. En simulación, clic para abrir/cerrar o rearmar.',
  fuse: 'Se funde en un cortocircuito. En simulación, clic para quitarlo o reponerlo (prueba a quitar uno de los tres del motor: falta de fase).',
  thermal3: 'Protege el motor contra sobrecargas: mide la intensidad de los motores conectados a sus bornes 2-4-6. Cuando dispara abre su contacto 95-96. Clic para rearmar.',
  th_nc: 'Contacto del relé térmico: abre cuando el térmico dispara. Ponlo en serie con la bobina del contactor.',
  th_no: 'Contacto del relé térmico: cierra cuando dispara (aviso de avería).',
  pb_no: 'Pulsador de marcha: cierra mientras lo mantienes pulsado.',
  pb_nc: 'Pulsador de paro: abre mientras lo mantienes pulsado.',
  estop: 'Seta de emergencia: abre y se queda enclavada. Clic otra vez para desenclavar.',
  sw: 'Interruptor que mantiene la posición. Clic para cambiar.',
  sel: 'Selector de dos posiciones (conmutado). Clic para cambiar.',
  coil: 'Bobina de contactor o relé. Todos los contactos con la misma etiqueta cambian cuando la bobina tiene tensión.',
  c_no: 'Contacto normalmente abierto: se cierra cuando se activa la bobina con su misma etiqueta.',
  c_nc: 'Contacto normalmente cerrado: se abre cuando se activa la bobina con su misma etiqueta.',
  c_main3: 'Contactos de potencia del contactor (1-2, 3-4, 5-6).',
  tcoil: 'Bobina de temporizador. A la conexión: sus contactos cambian cuando pasa el tiempo con tensión. A la desconexión: cambian al instante y vuelven cuando pasa el tiempo sin tensión.',
  t_no: 'Contacto temporizado normalmente abierto.',
  t_nc: 'Contacto temporizado normalmente cerrado.',
  motor3: 'Motor trifásico. Con "Función frigorífica = Compresor" mueve el circuito frigorífico. Con solo dos fases no arranca: zumba y consume la intensidad de arranque.',
  motor1: 'Motor monofásico. Asígnale una función frigorífica (compresor, ventilador del evaporador o del condensador).',
  lamp: 'Piloto de señalización. Con la función "Luz de la cámara" añade calor a la cámara.',
  heater: 'Resistencia. Con la función "Resistencia desescarche" calienta la batería del evaporador y funde el hielo.',
  solenoid: 'Válvula solenoide de la línea de líquido: con tensión deja pasar el líquido a la válvula de expansión. Sin tensión lo corta (recogida de gas).',
  thermostat: 'Conmuta según la temperatura de su sonda. Modo Frío: C-NC cerrado mientras la temperatura está alta (pide frío); abre al bajar a la consigna y vuelve a cerrar a consigna + diferencial. Modo Calor: al revés.',
  pressostat: 'Presostato. Alta: abre C-NC cuando la presión de alta llega al corte (protección; con rearme manual haz clic sobre él). Baja: abre C-NC cuando la presión de baja cae al corte y cierra al subir a corte + diferencial.',
  door_nc: 'Final de carrera de la puerta: abre al abrir la puerta de la cámara (típico para parar los ventiladores). Clic en simulación = abrir/cerrar la puerta.',
  door_no: 'Final de carrera de la puerta: cierra al abrir la puerta (típico para la luz). Clic en simulación = abrir/cerrar la puerta.',
  clock: 'Motor del reloj de desescarche: avanza solo mientras tiene tensión (A1-A2). Si el borne X recibe tensión durante un desescarche, lo termina (fin por termostato). Clic para forzar o terminar un desescarche.',
  clk_c: 'Contacto conmutado del reloj: C-F en frío, C-D durante el desescarche.',
  label: 'Texto libre para rotular el esquema.',
};

export class Panels {
  constructor(app) {
    this.app = app;
    this.props = document.getElementById('panel-props');
    this.room = document.getElementById('panel-room');
    this.diag = document.getElementById('panel-diag');
    this.logEl = document.getElementById('log');
    this.logOnly = document.getElementById('log-only-explain');
    this.entries = [];
    this.logOnly.addEventListener('change', () => this.renderLog());
  }

  // ---------------------------------------------------------- propiedades
  renderProps() {
    const { app } = this;
    const sel = app.editor.sel;
    const el = this.props;
    el.innerHTML = '';
    this.liveBox = null;
    if (!sel) {
      el.append(this._projectInfo());
      return;
    }
    if (sel.kind === 'wire') {
      el.append(
        h('div', { class: 'props-head' },
          h('h3', {}, 'Cable'),
          h('span', { class: 'kind' }, app.sim ? 'En simulación: rojo = fase, azul = neutro.' : 'Selecciona y pulsa Supr para borrarlo.'),
          !app.sim && h('div', { class: 'props-actions' }, h('button', { class: 'btn small danger', onclick: () => app.editor.deleteSelection() }, 'Borrar cable')),
        ),
      );
      return;
    }
    const c = app.editor.selected();
    if (!c) return;
    const T = TYPES[c.type];
    const head = h('div', { class: 'props-head' },
      h('h3', {}, c.props.tag ? `${c.props.tag}${c.props.name ? ' · ' + c.props.name : ''}` : T.label),
      h('span', { class: 'kind' }, T.label),
      !app.sim && h('div', { class: 'props-actions' },
        h('button', { class: 'btn small', onclick: () => app.editor.rotateSelection() }, 'Girar'),
        h('button', { class: 'btn small', onclick: () => app.editor.duplicateSelection() }, 'Duplicar'),
        h('button', { class: 'btn small danger', onclick: () => app.editor.deleteSelection() }, 'Borrar'),
      ),
    );
    const grid = h('div', { class: 'props-grid' });
    for (const def of T.props || []) grid.append(this._field(c, def));
    el.append(head, grid);
    if (DESCRIPTIONS[c.type]) el.append(h('p', { class: 'note', style: 'margin-top:10px;max-width:80ch' }, DESCRIPTIONS[c.type]));
    if (app.sim) {
      this.liveBox = h('div', { class: 'live-box' });
      el.append(this.liveBox);
      this.updatePropsLive();
    }
  }

  _field(c, def) {
    const { app } = this;
    const id = `prop-${def.key}`;
    const disabled = app.sim && !def.live && def.key !== 'name';
    const val = c.props[def.key];
    const set = (v) => app.setProp(c.id, def.key, v);
    let input;
    if (def.type === 'select') {
      input = h('select', { id, disabled }, Object.entries(def.options).map(([k, l]) => h('option', { value: k, selected: String(val) === k }, l)));
      input.addEventListener('change', () => set(input.value));
    } else if (def.type === 'bool') {
      input = h('input', { type: 'checkbox', id, disabled, checked: !!val });
      input.addEventListener('change', () => set(input.checked));
      return h('label', { class: 'field check', for: id }, input, def.label);
    } else if (def.type === 'number') {
      input = h('input', { type: 'number', id, disabled, value: val, step: def.step ?? 'any', min: def.min, max: def.max, inputmode: 'decimal' });
      input.addEventListener('change', () => {
        const v = parseFloat(String(input.value).replace(',', '.'));
        if (Number.isFinite(v)) set(v);
      });
    } else {
      input = h('input', { type: 'text', id, disabled, value: val ?? '' });
      input.addEventListener('change', () => set(input.value.trim()));
    }
    return h('label', { class: 'field', for: id }, def.label, input, def.hint && h('span', { class: 'hint2' }, def.hint));
  }

  _projectInfo() {
    const { app } = this;
    const p = app.project;
    const name = h('input', { type: 'text', id: 'proj-name', value: p.name || '' });
    name.addEventListener('change', () => {
      p.name = name.value;
      app.saveSoon();
    });
    const desc = h('textarea', { id: 'proj-desc', rows: 3 }, p.description || '');
    desc.addEventListener('change', () => {
      p.description = desc.value;
      app.saveSoon();
    });
    return h('div', { class: 'room-cols' },
      h('div', { class: 'stack' },
        h('label', { class: 'field', for: 'proj-name' }, 'Nombre del esquema', name),
        h('label', { class: 'field', for: 'proj-desc' }, 'Descripción', desc),
      ),
      h('div', { class: 'help', html: HELP_HTML }),
    );
  }

  updatePropsLive() {
    const { app } = this;
    if (!this.liveBox || !app.sim) return;
    const c = app.editor.selected();
    if (!c || !app.sim.elec.compById.has(c.id)) return;
    this.liveBox.textContent = liveText(app.sim, c);
  }

  // ------------------------------------------------------- cámara y averías
  renderRoom() {
    const { app } = this;
    const el = this.room;
    el.innerHTML = '';
    const P = { ...DEFAULT_REFRIG, ...(app.project.refrig || {}) };
    const F = { ...DEFAULT_FAULTS, ...(app.project.faults || {}) };
    const sim = !!app.sim;

    const door = h('button', { class: 'btn door-btn', id: 'room-door', onclick: () => app.toggleDoor() }, 'Abrir la puerta');
    this.doorBtn = door;
    const tamb = rangeField('room-tamb', 'Temperatura exterior', P.Tamb, -5, 45, 1, '°C', (v) => app.setRefrig('Tamb', v));
    const load = h('button', { class: 'btn', id: 'room-load', disabled: !sim, onclick: () => app.addProductLoad() }, 'Meter género caliente');
    const col1 = h('div', { class: 'stack' },
      h('h4', {}, 'Cámara'),
      h('div', { class: 'row' }, door, load),
      tamb,
      h('p', { class: 'note' }, 'La puerta también se abre haciendo clic en ella en el dibujo o en un contacto de puerta del esquema.'),
    );

    const refSel = selectField('room-ref', 'Refrigerante', P.refrigerant, Object.fromEntries(REFRIGERANT_IDS.map((id) => [id, REFRIGERANTS[id].label])), (v) => app.setRefrig('refrigerant', v), sim);
    const capF = numField('room-cap', 'Potencia frigorífica (kW a −10/+40 °C)', P.capacityKW, 0.2, 50, 0.1, (v) => app.setRefrig('capacityKW', v), sim);
    const expSel = selectField('room-exp', 'Expansión', P.expansion, { txv: 'Válvula termostática (VET) + recipiente', capilar: 'Tubo capilar (sin recipiente)' }, (v) => app.setRefrig('expansion', v), sim);
    const shF = numField('room-sh', 'Recalentamiento de la VET (K)', P.shSet, 2, 15, 0.5, (v) => app.setRefrig('shSet', v), false);
    const t0 = numField('room-t0', 'Temperatura inicial de la cámara (°C)', P.TroomInit, -30, 35, 1, (v) => app.setRefrig('TroomInit', v), sim);
    const heat = numField('room-heat', 'Resistencia de desescarche (kW)', P.heaterKW, 0.1, 20, 0.1, (v) => app.setRefrig('heaterKW', v), sim);
    const col2 = h('div', { class: 'stack' },
      h('h4', {}, 'Instalación'),
      refSel, capF, expSel, shF, t0, heat,
      sim && h('p', { class: 'note' }, 'Para cambiar refrigerante, potencia o expansión, detén la simulación.'),
    );

    const fr = (key, label, min, max, step, unit, map = (v) => v, unmap = (v) => v) =>
      rangeField(`f-${key}`, label, unmap(F[key]), min, max, step, unit, (v) => app.setFault(key, map(v)));
    const chk = (key, label) => {
      const i = h('input', { type: 'checkbox', id: `f-${key}`, checked: !!F[key] });
      i.addEventListener('change', () => app.setFault(key, i.checked));
      return h('label', { class: 'field check', for: `f-${key}` }, i, label);
    };
    const txv = selectField('f-txv', 'Válvula de expansión', F.txv, { ok: 'Correcta', cerrada: 'Bloqueada casi cerrada / bulbo descargado', abierta: 'Bloqueada abierta' }, (v) => app.setFault('txv', v), false);
    const col3 = h('div', { class: 'stack' },
      h('h4', {}, 'Averías'),
      fr('chargePct', 'Carga de refrigerante', 20, 140, 1, '%'),
      fr('condDirt', 'Condensador sucio', 0, 100, 5, '%', (v) => v / 100, (v) => Math.round(v * 100)),
      fr('filterClog', 'Filtro deshidratador obstruido', 0, 100, 5, '%', (v) => v / 100, (v) => Math.round(v * 100)),
      txv,
      chk('condFanBroken', 'Ventilador del condensador averiado'),
      chk('evapFanBroken', 'Ventilador del evaporador averiado'),
      chk('compValves', 'Compresor con válvulas rotas'),
      chk('compLocked', 'Compresor agarrotado'),
      chk('solenoidStuck', 'Solenoide que no abre'),
      chk('solenoidLeak', 'Solenoide que no cierra del todo'),
      chk('doorSeal', 'Burlete de la puerta dañado'),
      chk('nonCondensables', 'Aire (incondensables) en el circuito'),
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => app.clearFaults() }, 'Quitar todas las averías')),
    );
    el.append(h('div', { class: 'room-cols' }, col1, col2, col3));
    this.updateRoomLive();
  }

  updateRoomLive() {
    const o = this.app.fridgeOut();
    if (this.doorBtn && o) {
      this.doorBtn.textContent = o.door ? 'Cerrar la puerta' : 'Abrir la puerta';
      this.doorBtn.classList.toggle('open', o.door);
    }
  }

  // ----------------------------------------------------------- diagnóstico
  renderDiag() {
    const { app } = this;
    const el = this.diag;
    const o = app.fridgeOut();
    if (!o || !app.refrigOn()) {
      el.innerHTML = '<p class="note">Activa el circuito frigorífico para ver las lecturas.</p>';
      return;
    }
    const P = { ...DEFAULT_REFRIG, ...(app.project.refrig || {}) };
    const runFor = app.narrator.runSince !== null && app.sim ? o.t - app.narrator.runSince : 0;
    const { rows, findings } = diagnose(o, P, app.project.faults || {}, runFor);
    const label = { ok: 'normal', high: 'alto', low: 'bajo', warn: 'vigilar', na: '—', info: 'lectura' };
    const table = h('table', {}, h('tbody', {}, rows.map((r) =>
      h('tr', {}, h('td', {}, r.k), h('td', { class: 'v' }, r.v), h('td', {}, h('span', { class: `pill ${r.st}` }, label[r.st])), h('td', { class: 'sub' }, r.sub)))));
    el.innerHTML = '';
    el.append(h('div', { class: 'diag' },
      h('div', {}, h('h4', {}, `Lecturas (${o.refrigerant})`), h('div', { style: 'overflow-x:auto' }, table)),
      h('div', {}, h('h4', {}, 'Diagnóstico'), h('ul', { class: 'findings' }, findings.map((f) => h('li', {}, f)))),
    ));
  }

  // ---------------------------------------------------------------- registro
  addLog(entry) {
    this.entries.unshift(entry);
    if (this.entries.length > 400) this.entries.pop();
    if (this.logOnly.checked && !['cause', 'result'].includes(entry.level)) return;
    const li = this._logItem(entry);
    const empty = this.logEl.querySelector('.empty');
    if (empty) empty.remove();
    this.logEl.prepend(li);
    while (this.logEl.children.length > 400) this.logEl.lastChild.remove();
  }

  _logItem(e) {
    return h('li', { class: e.level }, h('time', {}, clockText(e.t)), h('span', {}, e.msg));
  }

  renderLog() {
    this.logEl.innerHTML = '';
    const list = this.logOnly.checked ? this.entries.filter((e) => ['cause', 'result'].includes(e.level)) : this.entries;
    if (!list.length) this.logEl.append(h('li', { class: 'empty' }, 'Aquí aparecerá lo que ocurre durante la simulación y su explicación.'));
    for (const e of list) this.logEl.append(this._logItem(e));
  }

  clearLog() {
    this.entries = [];
    this.renderLog();
  }
}

function rangeField(id, label, value, min, max, step, unit, onChange) {
  const out = h('span', { class: 'rangeval' }, `${value} ${unit}`);
  const i = h('input', { type: 'range', id, min, max, step, value });
  i.addEventListener('input', () => {
    out.textContent = `${i.value} ${unit}`;
    onChange(parseFloat(i.value));
  });
  return h('label', { class: 'field', for: id }, h('span', { style: 'display:flex;justify-content:space-between;gap:8px' }, label, out), i);
}

function selectField(id, label, value, options, onChange, disabled) {
  const s = h('select', { id, disabled }, Object.entries(options).map(([k, l]) => h('option', { value: k, selected: k === value }, l)));
  s.addEventListener('change', () => onChange(s.value));
  return h('label', { class: 'field', for: id }, label, s);
}

function numField(id, label, value, min, max, step, onChange, disabled) {
  const i = h('input', { type: 'number', id, value, min, max, step, disabled, inputmode: 'decimal' });
  i.addEventListener('change', () => {
    const v = parseFloat(String(i.value).replace(',', '.'));
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
  });
  return h('label', { class: 'field', for: id }, label, i);
}

function liveText(sim, c) {
  const e = sim.elec;
  const ctx = e.ctx(c);
  const st = ctx.st || {};
  const L = ctx.load;
  const dev = ctx.dev;
  switch (c.type) {
    case 'coil':
    case 'solenoid':
    case 'lamp':
    case 'heater':
      return L && L.on ? `Con tensión (${L.volts} V).` : 'Sin tensión.';
    case 'tcoil':
      if (!dev) return '';
      return `${L && L.on ? 'Con tensión' : 'Sin tensión'} · ${dev.timing ? `contando ${fmt(dev.t, 0)} de ${dev.delay} s` : dev.active ? 'contactos cambiados' : 'contactos en reposo'}.`;
    case 'motor3':
    case 'motor1': {
      const s = L ? L.state : 'off';
      const txt = s === 'run' ? `En marcha${L.reverse ? ' (giro invertido)' : ''}` : s === 'hum' ? 'Zumba sin girar: le falta una fase' : 'Parado';
      return `${txt} · ${fmt(ctx.current || 0)} A.`;
    }
    case 'thermostat':
    case 'pressostat': {
      const unit = c.type === 'thermostat' ? '°C' : 'bar';
      const v = st.value;
      return `Lectura: ${v === null || v === undefined ? '—' : fmt(v)} ${unit} · C-${st.actuated ? 'NA' : 'NC'} cerrado${st.latched ? ' · DISPARADO: clic para rearmar' : ''}.`;
    }
    case 'thermal3':
      return dev ? `Intensidad ${fmt(dev.current)} A · regulación ${dev.Iset} A · calentamiento ${Math.round((dev.theta / 1.3) * 100)} %${dev.active ? ' · DISPARADO' : ''}.` : '';
    case 'clock':
      return dev ? `${dev.powered ? 'Reloj en marcha' : 'Reloj SIN tensión (no avanza)'} · ${dev.defrost ? 'en desescarche' : `próximo desescarche en ${fmt((dev.interval - dev.pos) / 60, 0)} min`}.` : '';
    case 'mcb1':
    case 'mcb2':
    case 'mcb3':
    case 'mcb4':
      return st.tripped ? 'DISPARADO por cortocircuito. Clic para rearmar.' : st.on ? 'Cerrado.' : 'Abierto.';
    case 'fuse':
      return st.blown ? 'Fundido / retirado. Clic para reponer.' : 'Correcto.';
    case 'door_nc':
    case 'door_no':
      return e.door ? 'Puerta ABIERTA.' : 'Puerta cerrada.';
    default: {
      const T = TYPES[c.type];
      if (T.links) return T.links(ctx).length ? 'Contacto cerrado.' : 'Contacto abierto.';
      return '';
    }
  }
}

const HELP_HTML = `
<h3>Cómo se usa</h3>
<p><b>Editar:</b> elige un componente a la izquierda y colócalo. Con <kbd>W</kbd> dibujas cables (clic en cada esquina, termina sobre un borne o un cable). <kbd>R</kbd> gira, <kbd>Supr</kbd> borra, <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshace.</p>
<p><b>Circuito frigorífico:</b> a los motores, resistencias, solenoides y luces se les asigna una <i>función frigorífica</i> (compresor, ventilador del evaporador…). Los termostatos y presostatos leen el circuito frigorífico y la puerta mueve sus contactos.</p>
<p><b>Simular:</b> pulsa <b>Simular</b>. Haz clic en pulsadores, interruptores, magnetotérmicos, térmicos y presostatos para actuar sobre ellos. Abre la puerta de la cámara y mira qué pasa con las presiones. En <b>Cámara y averías</b> puedes provocar fallos.</p>`;
