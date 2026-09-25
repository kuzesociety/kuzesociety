// Paneles inferiores: propiedades (editor), ajustes de la instalación y
// averías, y registro.

import { TYPES } from '../elec/components.js';
import { REFRIGERANTS, SIM_REFRIGERANT_IDS } from '../refrig/refrigerants.js';
import { h, fmt, clockText } from './dom.js';
import { stepper, slider, toggle, seg, select, section } from './cards.js';

export const DESCRIPTIONS = {
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

  // ------------------------------------------- instalación y averías
  /**
   * Ajustes de la instalación frigorífica y averías. Sirve para la pestaña
   * del simulador (cambios en vivo) y para la del editor (valores de partida).
   */
  renderRoom(el, { edit = false } = {}) {
    const { app } = this;
    el.innerHTML = '';
    const P = () => app.params();
    const F = () => app.faults();
    const sync = [];
    const bind = (ctl, get) => {
      sync.push({ ctl, get, last: get() });
      return ctl;
    };
    const th = app.thermostat();
    const pct = (v) => Math.round(v * 100);

    const col1 = h('div', { class: 'stack' }, h('h4', {}, 'Cámara'));
    if (!edit) {
      col1.append(
        bind(toggle('Puerta abierta', app.out() && app.out().door, (v) => {
          if (app.out() && v !== app.out().door) app.toggleDoor();
        }), () => !!(app.out() && app.out().door)),
        h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => app.addProductLoad() }, 'Meter género caliente')),
      );
    }
    if (th) {
      col1.append(
        bind(stepper(`Consigna ${th.props.tag} (para a)`, +th.props.sp, { step: 0.5, min: -35, max: 20, unit: '°C' }, (v) => app.setThermostat('sp', v)), () => +th.props.sp),
        bind(stepper('Diferencial', +th.props.diff, { step: 0.5, min: 0.5, max: 10, unit: 'K' }, (v) => app.setThermostat('diff', v)), () => +th.props.diff),
      );
    }
    col1.append(
      bind(stepper('Temperatura exterior', P().Tamb, { step: 1, min: -10, max: 46, unit: '°C' }, (v) => app.setRefrig('Tamb', v)), () => P().Tamb),
      bind(stepper(edit ? 'Temperatura inicial de la cámara' : 'Cámara al reiniciar', P().TroomInit, { step: 1, min: -30, max: 35, unit: '°C' }, (v) => app.setRefrig('TroomInit', v)), () => P().TroomInit),
      bind(seg('Aislamiento', { 0.025: 'Bueno', 0.04: 'Normal', 0.07: 'Malo' }, String(P().roomUA), (v) => app.setRefrig('roomUA', +v)), () => String(P().roomUA)),
    );

    const col2 = h('div', { class: 'stack' }, h('h4', {}, 'Instalación'));
    if (edit) {
      col2.append(toggle('Circuito frigorífico asociado', P().enabled !== false, (v) => app.setRefrigEnabled(v)),
        h('p', { class: 'note' }, 'Desactívalo para simular solo el esquema eléctrico, como en CADe SIMU.'));
    }
    const refOpts = Object.fromEntries(SIM_REFRIGERANT_IDS.map((id) => [id, REFRIGERANTS[id].label]));
    col2.append(
      bind(select('Refrigerante', refOpts, P().refrigerant, (v) => app.setRefrig('refrigerant', v)), () => P().refrigerant),
      bind(stepper('Potencia frigorífica (−10/+40 °C)', P().capacityKW, { step: 0.1, min: 0.2, max: 50, unit: 'kW' }, (v) => app.setRefrig('capacityKW', v)), () => P().capacityKW),
      bind(seg('Expansión', { txv: 'VET + recipiente', capilar: 'Tubo capilar' }, P().expansion, (v) => app.setRefrig('expansion', v)), () => P().expansion),
      bind(stepper('Recalentamiento de la VET', P().shSet, { step: 0.5, min: 2, max: 15, unit: 'K' }, (v) => app.setRefrig('shSet', v)), () => P().shSet),
      bind(stepper('Resistencia de desescarche', P().heaterKW, { step: 0.1, min: 0.1, max: 20, unit: 'kW' }, (v) => app.setRefrig('heaterKW', v)), () => P().heaterKW),
      bind(toggle('Si el esquema no tiene ventiladores, suponer que giran', P().assumeFans !== false, (v) => app.setRefrig('assumeFans', v)), () => P().assumeFans !== false),
    );

    const cols = [col1, col2];
    if (!app.practiceHideFaults) {
      const chk = (key, label) => bind(toggle(label, F()[key], (v) => app.setFault(key, v), { danger: true }), () => !!F()[key]);
      const col3 = h('div', { class: 'stack' }, h('h4', {}, edit ? 'Averías de partida' : 'Averías'),
        bind(slider('Carga de refrigerante', Math.round(F().chargePct), { min: 20, max: 140, step: 1, unit: '%' }, (v) => app.setFault('chargePct', v)), () => Math.round(F().chargePct)),
        bind(seg('Fuga', { 0: 'Sin fuga', 5: 'Lenta', 20: 'Media', 60: 'Rápida' }, String(F().leakRate || 0), (v) => app.setFault('leakRate', +v)), () => String(F().leakRate || 0)),
        bind(slider('Condensador sucio', pct(F().condDirt), { min: 0, max: 100, step: 5, unit: '%' }, (v) => app.setFault('condDirt', v / 100)), () => pct(F().condDirt)),
        bind(slider('Filtro deshidratador obstruido', pct(F().filterClog), { min: 0, max: 100, step: 5, unit: '%' }, (v) => app.setFault('filterClog', v / 100)), () => pct(F().filterClog)),
        bind(seg('Válvula de expansión', { ok: 'Correcta', cerrada: 'Casi cerrada', abierta: 'Atascada abierta' }, F().txv, (v) => app.setFault('txv', v)), () => F().txv),
        chk('condFanBroken', 'Ventilador del condensador averiado'),
        chk('evapFanBroken', 'Ventilador del evaporador averiado'),
        chk('compValves', 'Compresor con válvulas rotas'),
        chk('compLocked', 'Compresor agarrotado'),
        chk('solenoidStuck', 'Solenoide que no abre'),
        chk('solenoidLeak', 'Solenoide que no cierra del todo'),
        chk('doorSeal', 'Burlete de la puerta dañado'),
        chk('nonCondensables', 'Aire (incondensables) en el circuito'),
        h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => app.clearFaults() }, 'Quitar todas las averías')),
      );
      cols.push(col3);
    }
    el.append(h('div', { class: 'room-cols' }, ...cols));
    el._sync = sync;
  }

  /** Pone los mandos del panel al día si algo ha cambiado desde fuera. */
  syncRoom(el) {
    for (const s of el._sync || []) {
      const v = s.get();
      if (v !== s.last) {
        s.last = v;
        s.ctl.setValue(v);
      }
    }
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

export function liveText(sim, c) {
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
<h3>Cómo se usa el editor</h3>
<p>Elige un componente a la izquierda y colócalo. Con <kbd>W</kbd> dibujas cables (clic en cada esquina, termina sobre un borne o un cable). <kbd>R</kbd> gira, <kbd>Supr</kbd> borra, <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshace.</p>
<p>A los motores, resistencias, solenoides y luces se les asigna una <i>función frigorífica</i> (compresor, ventilador del evaporador…): así mueven el circuito frigorífico. Los termostatos y presostatos leen sus temperaturas y presiones, y los contactos de puerta siguen a la puerta de la cámara.</p>
<p>Vuelve a <b>Simulador</b> para verlo funcionar: arranca solo.</p>`;
