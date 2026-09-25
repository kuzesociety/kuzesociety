// Biblioteca de componentes eléctricos (símbolos IEC, estilo CADe SIMU).
//
// Cada tipo define:
//   label, terms: [{n, x, y}] en unidades de rejilla (origen = primer borne),
//   box: [x0, y0, x1, y1] caja de selección (rejilla),
//   defaults: propiedades iniciales, props: campos editables,
//   links(ctx): pares de bornes conectados eléctricamente ahora mismo,
//   loads: cargas [{terms, kind}] (bobinas, lámparas, motores...),
//   draw(ctx): SVG en coordenadas locales (px),
//   master: tipo de dispositivo que crea (bobina de relé, temporizador...),
//   slaveOf: tipo de dispositivo del que depende (contactos por etiqueta).

export const G = 20;

// ---------------------------------------------------------------- helpers SVG
const f = (n) => Math.round(n * 10) / 10;
const line = (x1, y1, x2, y2, cls = 's') => `<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
const path = (d, cls = 's') => `<path class="${cls}" d="${d}"/>`;
const circle = (cx, cy, r, cls = 's') => `<circle class="${cls}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`;
const rect = (x, y, w, h, cls = 's') => `<rect class="${cls}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/>`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Texto que se mantiene horizontal aunque el símbolo esté girado. */
function text(ctx, x, y, s, cls = 't', anchor = 'middle') {
  if (s === undefined || s === null || s === '') return '';
  const rot = ctx.comp.rot || 0;
  let a = anchor;
  // Al girar 180° el anclaje izquierdo/derecho se invierte visualmente.
  if (rot === 180 && anchor !== 'middle') a = anchor === 'end' ? 'start' : 'end';
  const tr = rot ? ` transform="rotate(${-rot} ${f(x)} ${f(y)})"` : '';
  return `<text class="${cls}" x="${f(x)}" y="${f(y)}" text-anchor="${a}" dominant-baseline="middle"${tr}>${esc(s)}</text>`;
}

function tagLabel(ctx, x = -16, y = 30) {
  const { props } = ctx.comp;
  let out = text(ctx, x, props.name ? y - 6 : y, props.tag, 'tag', 'end');
  if (props.name) out += text(ctx, x, y + 7, props.name, 'tname', 'end');
  return out;
}

const termNums = (ctx, a, b, x = 5) => text(ctx, x, 7, a, 'tn', 'start') + text(ctx, x, 54, b, 'tn', 'start');

// --------------------------------------------------------- piezas de símbolos
function contactNO(closed, cls = '', x = 0) {
  return (
    line(x, 0, x, 20) +
    line(x, 40, x, 60) +
    (closed ? line(x, 40, x - 1.5, 20, `s blade ${cls}`) : line(x, 40, x - 11, 21, `s blade ${cls}`))
  );
}

function contactNC(closed, cls = '', x = 0) {
  return (
    line(x, 0, x, 20) +
    line(x, 20, x - 12, 20) +
    line(x, 40, x, 60) +
    (closed ? line(x, 40, x - 13, 17, `s blade ${cls}`) : line(x, 40, x - 4, 22, `s blade ${cls}`))
  );
}

/** Conmutado: común arriba, NC recto hacia abajo, NA desplazado 2 cuadros. */
function changeover(actuated) {
  return (
    line(0, 0, 0, 18) +
    line(0, 44, 0, 60) +
    line(0, 44, -12, 44) +
    line(14, 44, 14, 50) +
    line(14, 50, 40, 50) +
    line(40, 50, 40, 60) +
    (actuated ? line(0, 18, 15, 42, 's blade') : line(0, 18, -11, 45, 's blade')) +
    circle(0, 18, 1.8, 'dot')
  );
}

function actuatorLine(x1, y, x2 = -26) {
  return line(x1, y, x2, y, 's dash');
}

const act = {
  push: (x = -26, y = 30) => path(`M${x + 4},${y - 6} H${x} V${y + 6} H${x + 4}`),
  pull: (x = -26, y = 30) => path(`M${x - 4},${y - 6} H${x} V${y + 6} H${x - 4}`),
  toggle: (x = -26, y = 30) => path(`M${x},${y - 6} V${y + 6} M${x},${y - 6} L${x - 5},${y - 11}`),
  estop: (x = -26, y = 30) => path(`M${x},${y} m0,-9 a9,9 0 0,0 0,18 z`, 's fillsym'),
  thermal: (x = -26, y = 30) => path(`M${x},${y - 5} h-5 v10 h-5`),
  position: (x = -26, y = 30) => path(`M${x},${y - 6} L${x - 7},${y} L${x},${y + 6}`),
  temp: (x = -26, y = 30) => rect(x - 14, y - 7, 14, 14) + `<text class="t sym-t" x="${x - 7}" y="${y + 0.5}" text-anchor="middle" dominant-baseline="middle">θ</text>`,
  press: (x = -26, y = 30) => rect(x - 14, y - 7, 14, 14) + `<text class="t sym-t" x="${x - 7}" y="${y + 0.5}" text-anchor="middle" dominant-baseline="middle">P</text>`,
  clock: (x = -26, y = 30) => circle(x - 7, y, 7) + path(`M${x - 7},${y} V${y - 5} M${x - 7},${y} H${x - 3}`),
  timer: (x = -26, y = 30, tof = false) =>
    tof ? path(`M${x + 2},${y - 6} a6,6 0 0,0 0,12`) + line(x + 2, y - 6, x + 2, y + 6) : path(`M${x - 4},${y - 6} a6,6 0 0,1 0,12`) + line(x - 4, y - 6, x - 4, y + 6),
};

// ------------------------------------------------------------- dispositivos
const devActive = (ctx) => !!(ctx.dev && ctx.dev.active);

// --------------------------------------------------------------------- tipos
export const FUNCS = {
  ninguna: 'Ninguna',
  compresor: 'Compresor',
  vent_evap: 'Ventilador evaporador',
  vent_cond: 'Ventilador condensador',
  desescarche: 'Resistencia desescarche',
  solenoide: 'Válvula solenoide (línea de líquido)',
  luz: 'Luz de la cámara',
};

const PROBES = { camara: 'Aire cámara', evaporador: 'Batería evaporador', producto: 'Género', exterior: 'Ambiente exterior' };

const nameProp = { key: 'name', label: 'Descripción', type: 'text' };
const tagProp = { key: 'tag', label: 'Etiqueta', type: 'text' };

function twoTermBox() {
  return [-1.5, 0, 1, 3];
}

export const TYPES = {
  // ============================================================ alimentación
  supply3: {
    label: 'Red trifásica 3F+N',
    terms: [
      { n: 'L1', x: 0, y: 0, phase: 'L1' },
      { n: 'L2', x: 2, y: 0, phase: 'L2' },
      { n: 'L3', x: 4, y: 0, phase: 'L3' },
      { n: 'N', x: 6, y: 0, phase: 'N' },
    ],
    box: [-0.6, -2.4, 6.6, 0],
    defaults: { name: '400/230 V 50 Hz' },
    props: [nameProp],
    draw(ctx) {
      let s = rect(-12, -46, 144, 26, 's fillbg');
      s += text(ctx, 60, -39, ctx.comp.props.name || '', 'tname');
      const names = ['L1', 'L2', 'L3', 'N'];
      names.forEach((n, i) => {
        s += line(i * 40, -20, i * 40, 0, `s ph-${n}`);
        s += text(ctx, i * 40, -27, n, 'tag');
      });
      return s;
    },
  },
  supply1: {
    label: 'Red monofásica L+N',
    terms: [
      { n: 'L', x: 0, y: 0, phase: 'L1' },
      { n: 'N', x: 2, y: 0, phase: 'N' },
    ],
    box: [-0.6, -2.4, 2.6, 0],
    defaults: { name: '230 V' },
    props: [nameProp],
    draw(ctx) {
      let s = rect(-12, -46, 64, 26, 's fillbg');
      s += text(ctx, 20, -39, ctx.comp.props.name || '', 'tname');
      s += line(0, -20, 0, 0, 's ph-L1') + line(40, -20, 40, 0, 's ph-N');
      s += text(ctx, 0, -27, 'L', 'tag') + text(ctx, 40, -27, 'N', 'tag');
      return s;
    },
  },
  bus: {
    label: 'Borne de alimentación',
    terms: [{ n: 'P', x: 0, y: 0, phaseProp: 'phase' }],
    box: [-0.6, -1.2, 0.6, 0],
    defaults: { phase: 'L1' },
    props: [{ key: 'phase', label: 'Fase', type: 'select', options: { L1: 'L1', L2: 'L2', L3: 'L3', N: 'N' } }],
    draw(ctx) {
      const ph = ctx.comp.props.phase;
      return line(0, -6, 0, 0) + circle(0, -14, 9, `s fillbg ph-${ph}`) + text(ctx, 0, -13.5, ph, 'tag');
    },
  },

  // ============================================================ protecciones
  mcb1: mcb(1),
  mcb2: mcb(2),
  mcb3: mcb(3),
  mcb4: mcb(4),
  fuse: {
    label: 'Fusible',
    tagPrefix: 'F',
    terms: [{ n: '1', x: 0, y: 0 }, { n: '2', x: 0, y: 3 }],
    box: twoTermBox(),
    defaults: { In: 10 },
    props: [tagProp, nameProp, { key: 'In', label: 'Calibre (A)', type: 'number', min: 0.5, step: 0.5 }],
    protective: true,
    initState: () => ({ blown: false }),
    links: (ctx) => (ctx.st.blown ? [] : [['1', '2']]),
    draw(ctx) {
      const b = ctx.st && ctx.st.blown;
      let s = rect(-6, 12, 12, 36, 's fillbg');
      s += b ? line(0, 0, 0, 24) + line(0, 36, 0, 60) + path('M-5,26 L5,34 M5,26 L-5,34', 's trip') : line(0, 0, 0, 60);
      return s + tagLabel(ctx, -12) + termNums(ctx, '1', '2');
    },
    click(sim, c, st) {
      if (st.blown) {
        st.blown = false;
        sim.log('info', `${c.props.tag}: fusible sustituido.`);
      } else {
        st.blown = true;
        sim.log('warn', `${c.props.tag}: fusible retirado (circuito abierto).`);
      }
      return true;
    },
  },
  thermal3: {
    label: 'Relé térmico (3 polos)',
    tagPrefix: 'F',
    master: 'thermal',
    terms: [
      { n: '1', x: 0, y: 0 }, { n: '2', x: 0, y: 3 },
      { n: '3', x: 2, y: 0 }, { n: '4', x: 2, y: 3 },
      { n: '5', x: 4, y: 0 }, { n: '6', x: 4, y: 3 },
    ],
    box: [-1.2, 0, 5.8, 3],
    defaults: { Iset: 4, reset: 'manual' },
    props: [
      tagProp,
      nameProp,
      { key: 'Iset', label: 'Regulación (A)', type: 'number', min: 0.1, step: 0.1 },
      { key: 'reset', label: 'Rearme', type: 'select', options: { manual: 'Manual', auto: 'Automático' } },
    ],
    // Los elementos térmicos siempre conducen; lo que abre es el contacto 95-96.
    links: () => [['1', '2'], ['3', '4'], ['5', '6']],
    draw(ctx) {
      const trip = devActive(ctx);
      let s = '';
      for (const x of [0, 40, 80]) {
        s += line(x, 0, x, 16) + rect(x - 7, 16, 14, 28, 's fillbg') + path(`M${x},16 v8 h5 v12 h-5 v8`) + line(x, 44, x, 60);
      }
      s += line(7, 30, 33, 30, 's dash') + line(47, 30, 73, 30, 's dash') + line(87, 30, 104, 30, 's dash');
      s += rect(104, 23, 14, 14, trip ? 's trip-fill' : 's fillbg');
      s += text(ctx, 111, 30.5, 'R', 'tn');
      if (ctx.dev) s += text(ctx, 111, 46, `${fmt1(ctx.dev.current)} A`, trip ? 'tn trip-t' : 'tn');
      return s + tagLabel(ctx, -12);
    },
    click(sim, c) {
      const d = sim.devices.get(c.props.tag);
      return d ? sim.resetThermal(d) : false;
    },
  },
  th_nc: {
    label: 'Contacto térmico NC 95-96',
    tagPrefix: 'F',
    slaveOf: 'thermal',
    terms: [{ n: '95', x: 0, y: 0 }, { n: '96', x: 0, y: 3 }],
    box: twoTermBox(),
    props: [tagProp],
    links: (ctx) => (devActive(ctx) ? [] : [['95', '96']]),
    draw(ctx) {
      const on = devActive(ctx);
      return contactNC(!on) + actuatorLine(on ? -2 : -6, 30) + act.thermal() + text(ctx, -46, 30, ctx.comp.props.tag, 'tag', 'end') + termNums(ctx, '95', '96');
    },
    click(sim, c) {
      const d = sim.devices.get(c.props.tag);
      return d ? sim.resetThermal(d) : false;
    },
  },
  th_no: {
    label: 'Contacto térmico NA 97-98',
    tagPrefix: 'F',
    slaveOf: 'thermal',
    terms: [{ n: '97', x: 0, y: 0 }, { n: '98', x: 0, y: 3 }],
    box: twoTermBox(),
    props: [tagProp],
    links: (ctx) => (devActive(ctx) ? [['97', '98']] : []),
    draw(ctx) {
      const on = devActive(ctx);
      return contactNO(on) + actuatorLine(on ? -1 : -6, 30) + act.thermal() + text(ctx, -46, 30, ctx.comp.props.tag, 'tag', 'end') + termNums(ctx, '97', '98');
    },
    click(sim, c) {
      const d = sim.devices.get(c.props.tag);
      return d ? sim.resetThermal(d) : false;
    },
  },

  // ================================================================== mando
  pb_no: {
    label: 'Pulsador NA (marcha)',
    tagPrefix: 'S',
    terms: [{ n: '3', x: 0, y: 0 }, { n: '4', x: 0, y: 3 }],
    box: [-2, 0, 1, 3],
    defaults: { name: 'Marcha' },
    props: [tagProp, nameProp],
    momentary: true,
    initState: () => ({ pressed: false }),
    links: (ctx) => (ctx.st.pressed ? [['3', '4']] : []),
    draw(ctx) {
      const p = ctx.st && ctx.st.pressed;
      return contactNO(p) + actuatorLine(p ? -1 : -6, 30) + act.push() + tagLabel(ctx, -32) + termNums(ctx, '3', '4');
    },
  },
  pb_nc: {
    label: 'Pulsador NC (paro)',
    tagPrefix: 'S',
    terms: [{ n: '1', x: 0, y: 0 }, { n: '2', x: 0, y: 3 }],
    box: [-2, 0, 1, 3],
    defaults: { name: 'Paro' },
    props: [tagProp, nameProp],
    momentary: true,
    initState: () => ({ pressed: false }),
    links: (ctx) => (ctx.st.pressed ? [] : [['1', '2']]),
    draw(ctx) {
      const p = ctx.st && ctx.st.pressed;
      return contactNC(!p) + actuatorLine(p ? -2 : -6, 30) + act.push() + tagLabel(ctx, -32) + termNums(ctx, '1', '2');
    },
  },
  estop: {
    label: 'Seta de emergencia',
    tagPrefix: 'S',
    terms: [{ n: '1', x: 0, y: 0 }, { n: '2', x: 0, y: 3 }],
    box: [-2.2, 0, 1, 3],
    defaults: { name: 'Emergencia' },
    props: [tagProp, nameProp],
    initState: () => ({ latched: false }),
    links: (ctx) => (ctx.st.latched ? [] : [['1', '2']]),
    draw(ctx) {
      const p = ctx.st && ctx.st.latched;
      return contactNC(!p) + actuatorLine(p ? -2 : -6, 30) + act.estop() + tagLabel(ctx, -38) + termNums(ctx, '1', '2');
    },
    click(sim, c, st) {
      st.latched = !st.latched;
      sim.log(st.latched ? 'warn' : 'info', `${c.props.tag}: seta de emergencia ${st.latched ? 'enclavada' : 'desenclavada'}.`);
      return true;
    },
  },
  sw: {
    label: 'Interruptor',
    tagPrefix: 'S',
    terms: [{ n: '1', x: 0, y: 0 }, { n: '2', x: 0, y: 3 }],
    box: [-2, 0, 1, 3],
    defaults: { on: false },
    props: [tagProp, nameProp, { key: 'on', label: 'Cerrado al iniciar', type: 'bool' }],
    initState: (c) => ({ on: !!c.props.on }),
    links: (ctx) => (ctx.st.on ? [['1', '2']] : []),
    draw(ctx) {
      const on = ctx.st ? ctx.st.on : ctx.comp.props.on;
      return contactNO(on) + actuatorLine(on ? -1 : -6, 30) + act.toggle() + tagLabel(ctx, -34) + termNums(ctx, '1', '2');
    },
    click(sim, c, st) {
      st.on = !st.on;
      sim.log('info', `${c.props.tag}${c.props.name ? ' (' + c.props.name + ')' : ''}: ${st.on ? 'cerrado' : 'abierto'}.`);
      return true;
    },
  },
  sel: {
    label: 'Selector 2 posiciones',
    tagPrefix: 'S',
    terms: [{ n: 'C', x: 0, y: 0 }, { n: '1', x: 0, y: 3 }, { n: '2', x: 2, y: 3 }],
    box: [-2, 0, 2.4, 3],
    props: [tagProp, nameProp],
    initState: () => ({ pos: 0 }),
    links: (ctx) => (ctx.st.pos ? [['C', '2']] : [['C', '1']]),
    draw(ctx) {
      const p = ctx.st ? ctx.st.pos : 0;
      return changeover(!!p) + actuatorLine(p ? 7 : -5, 31) + act.toggle(-26, 31) + tagLabel(ctx, -34) + text(ctx, 5, 7, 'C', 'tn', 'start') + text(ctx, -4, 57, '1', 'tn', 'end') + text(ctx, 44, 57, '2', 'tn', 'start');
    },
    click(sim, c, st) {
      st.pos = st.pos ? 0 : 1;
      sim.log('info', `${c.props.tag}: selector en posición ${st.pos + 1}.`);
      return true;
    },
  },

  // ======================================================= contactores/relés
  coil: {
    label: 'Bobina contactor / relé',
    tagPrefix: 'KM',
    master: 'relay',
    terms: [{ n: 'A1', x: 0, y: 0 }, { n: 'A2', x: 0, y: 3 }],
    box: [-1.5, 0, 1, 3],
    props: [tagProp, nameProp],
    loads: [{ terms: ['A1', 'A2'], kind: 'coil' }],
    draw(ctx) {
      const on = ctx.load && ctx.load.on;
      return line(0, 0, 0, 16) + line(0, 44, 0, 60) + rect(-12, 16, 24, 28, on ? 's coil-on' : 's fillbg') + tagLabel(ctx, -17) + termNums(ctx, 'A1', 'A2');
    },
  },
  c_no: {
    label: 'Contacto NA (13-14)',
    tagPrefix: 'KM',
    slaveOf: 'relay',
    terms: [{ n: '13', x: 0, y: 0 }, { n: '14', x: 0, y: 3 }],
    box: twoTermBox(),
    props: [tagProp],
    links: (ctx) => (devActive(ctx) ? [['13', '14']] : []),
    draw(ctx) {
      return contactNO(devActive(ctx)) + text(ctx, -16, 30, ctx.comp.props.tag, 'tag', 'end') + termNums(ctx, '13', '14');
    },
  },
  c_nc: {
    label: 'Contacto NC (21-22)',
    tagPrefix: 'KM',
    slaveOf: 'relay',
    terms: [{ n: '21', x: 0, y: 0 }, { n: '22', x: 0, y: 3 }],
    box: twoTermBox(),
    props: [tagProp],
    links: (ctx) => (devActive(ctx) ? [] : [['21', '22']]),
    draw(ctx) {
      return contactNC(!devActive(ctx)) + text(ctx, -18, 30, ctx.comp.props.tag, 'tag', 'end') + termNums(ctx, '21', '22');
    },
  },
  c_main3: {
    label: 'Contactos principales 3P',
    tagPrefix: 'KM',
    slaveOf: 'relay',
    terms: [
      { n: '1', x: 0, y: 0 }, { n: '2', x: 0, y: 3 },
      { n: '3', x: 2, y: 0 }, { n: '4', x: 2, y: 3 },
      { n: '5', x: 4, y: 0 }, { n: '6', x: 4, y: 3 },
    ],
    box: [-1.5, 0, 4.6, 3],
    props: [tagProp],
    links: (ctx) => (devActive(ctx) ? [['1', '2'], ['3', '4'], ['5', '6']] : []),
    draw(ctx) {
      const on = devActive(ctx);
      let s = '';
      for (const x of [0, 40, 80]) s += contactNO(on, '', x) + path(`M${x - 3},20 a3,3 0 0,0 6,0`);
      const bx = on ? -1 : -6;
      s += line(bx + 0.5, 30, 40 + bx, 30, 's dash') + line(40 + bx, 30, 80 + bx, 30, 's dash');
      return s + text(ctx, -16, 30, ctx.comp.props.tag, 'tag', 'end');
    },
  },
  tcoil: {
    label: 'Temporizador (bobina)',
    tagPrefix: 'KT',
    master: 'timer',
    terms: [{ n: 'A1', x: 0, y: 0 }, { n: 'A2', x: 0, y: 3 }],
    box: [-1.5, 0, 1, 3],
    defaults: { mode: 'ton', delay: 10 },
    props: [
      tagProp,
      nameProp,
      { key: 'mode', label: 'Tipo', type: 'select', options: { ton: 'A la conexión (TON)', tof: 'A la desconexión (TOF)' } },
      { key: 'delay', label: 'Tiempo (s)', type: 'number', min: 0, step: 1, live: true },
    ],
    loads: [{ terms: ['A1', 'A2'], kind: 'coil' }],
    draw(ctx) {
      const on = ctx.load && ctx.load.on;
      const tof = ctx.comp.props.mode === 'tof';
      let s = line(0, 0, 0, 16) + line(0, 44, 0, 60) + rect(-12, 16, 24, 28, on ? 's coil-on' : 's fillbg');
      s += tof ? rect(-12, 16, 7, 28, 's fillsym') : rect(-12, 16, 7, 28) + line(-12, 16, -5, 44) + line(-5, 16, -12, 44);
      if (ctx.dev && (ctx.dev.timing || ctx.dev.active)) {
        s += text(ctx, 16, 30, `${Math.min(ctx.dev.t, ctx.comp.props.delay).toFixed(0)}/${ctx.comp.props.delay}s`, 'tn', 'start');
      } else s += text(ctx, 16, 30, `${ctx.comp.props.delay}s`, 'tn', 'start');
      return s + tagLabel(ctx, -17) + termNums(ctx, 'A1', 'A2');
    },
  },
  t_no: {
    label: 'Contacto temporizado NA',
    tagPrefix: 'KT',
    slaveOf: 'timer',
    terms: [{ n: '67', x: 0, y: 0 }, { n: '68', x: 0, y: 3 }],
    box: [-2, 0, 1, 3],
    props: [tagProp],
    links: (ctx) => (devActive(ctx) ? [['67', '68']] : []),
    draw(ctx) {
      const on = devActive(ctx);
      const tof = ctx.dev && ctx.dev.mode === 'tof';
      return contactNO(on) + actuatorLine(on ? -1 : -6, 30, -22) + act.timer(-22, 30, tof) + text(ctx, -32, 30, ctx.comp.props.tag, 'tag', 'end') + termNums(ctx, '67', '68');
    },
  },
  t_nc: {
    label: 'Contacto temporizado NC',
    tagPrefix: 'KT',
    slaveOf: 'timer',
    terms: [{ n: '55', x: 0, y: 0 }, { n: '56', x: 0, y: 3 }],
    box: [-2, 0, 1, 3],
    props: [tagProp],
    links: (ctx) => (devActive(ctx) ? [] : [['55', '56']]),
    draw(ctx) {
      const on = devActive(ctx);
      const tof = ctx.dev && ctx.dev.mode === 'tof';
      return contactNC(!on) + actuatorLine(on ? -2 : -6, 30, -22) + act.timer(-22, 30, tof) + text(ctx, -32, 30, ctx.comp.props.tag, 'tag', 'end') + termNums(ctx, '55', '56');
    },
  },

  // ================================================================= cargas
  motor3: {
    label: 'Motor trifásico',
    tagPrefix: 'M',
    terms: [{ n: 'U', x: 0, y: 0 }, { n: 'V', x: 2, y: 0 }, { n: 'W', x: 4, y: 0 }],
    box: [-1.3, 0, 5.3, 4.2],
    defaults: { func: 'ninguna', In: 2 },
    props: [
      tagProp,
      nameProp,
      { key: 'func', label: 'Función frigorífica', type: 'select', options: FUNCS },
      { key: 'In', label: 'Intensidad nominal (A)', type: 'number', min: 0.1, step: 0.1, hint: 'Solo si no es el compresor' },
    ],
    loads: [{ terms: ['U', 'V', 'W'], kind: 'motor3' }],
    draw(ctx) {
      const L = ctx.load || {};
      let s = line(0, 0, 0, 16) + line(0, 16, 28, 31) + line(40, 0, 40, 28) + line(80, 0, 80, 16) + line(80, 16, 52, 31);
      s += circle(40, 52, 24, `s fillbg ${L.state === 'run' ? 'motor-on' : L.state === 'hum' ? 'motor-hum' : ''}`);
      s += text(ctx, 40, 49, 'M', 'mot') + text(ctx, 40, 63, '3~', 'tn');
      if (L.state === 'run') s += `<g class="spin${L.reverse ? ' rev' : ''}" style="transform-origin:40px 52px">${path('M40,24 a28,28 0 0,1 26,17', 's rot')}${path('M66,41 l-1,-7 m1,7 l-7,-2', 's rot')}</g>`;
      s += text(ctx, 5, 7, 'U', 'tn', 'start') + text(ctx, 45, 7, 'V', 'tn', 'start') + text(ctx, 85, 7, 'W', 'tn', 'start');
      s += tagLabel(ctx, 12, 64);
      if (ctx.current !== undefined && L.state && L.state !== 'off') s += text(ctx, 70, 76, `${fmt1(ctx.current)} A`, L.state === 'hum' ? 'tn trip-t' : 'tn', 'start');
      return s;
    },
  },
  motor1: {
    label: 'Motor monofásico',
    tagPrefix: 'M',
    terms: [{ n: '1', x: 0, y: 0 }, { n: '2', x: 0, y: 3 }],
    box: [-1.5, 0, 1, 3],
    defaults: { func: 'ninguna', In: 0.6 },
    props: [
      tagProp,
      nameProp,
      { key: 'func', label: 'Función frigorífica', type: 'select', options: FUNCS },
      { key: 'In', label: 'Intensidad nominal (A)', type: 'number', min: 0.1, step: 0.1, hint: 'Solo si no es el compresor' },
    ],
    loads: [{ terms: ['1', '2'], kind: 'motor1' }],
    draw(ctx) {
      const L = ctx.load || {};
      let s = line(0, 0, 0, 13) + line(0, 47, 0, 60) + circle(0, 30, 17, `s fillbg ${L.state === 'run' ? 'motor-on' : ''}`);
      s += text(ctx, 0, 27, 'M', 'mot') + text(ctx, 0, 39, '1~', 'tn');
      if (L.state === 'run') s += `<g class="spin" style="transform-origin:0px 30px">${path('M0,9 a21,21 0 0,1 19,12', 's rot')}${path('M19,21 l0,-6 m0,6 l-6,-1', 's rot')}</g>`;
      return s + tagLabel(ctx, -21) + termNums(ctx, '', '');
    },
  },
  lamp: {
    label: 'Piloto / lámpara',
    tagPrefix: 'H',
    terms: [{ n: 'X1', x: 0, y: 0 }, { n: 'X2', x: 0, y: 3 }],
    box: [-1.5, 0, 1, 3],
    defaults: { color: 'verde', func: 'ninguna' },
    props: [
      tagProp,
      nameProp,
      { key: 'color', label: 'Color', type: 'select', options: { verde: 'Verde', rojo: 'Rojo', amarillo: 'Amarillo', blanco: 'Blanco', azul: 'Azul' } },
      { key: 'func', label: 'Función frigorífica', type: 'select', options: { ninguna: 'Ninguna', luz: 'Luz de la cámara' } },
    ],
    loads: [{ terms: ['X1', 'X2'], kind: 'lamp' }],
    draw(ctx) {
      const on = ctx.load && ctx.load.on;
      const col = ctx.comp.props.color;
      let s = line(0, 0, 0, 19) + line(0, 41, 0, 60);
      s += circle(0, 30, 11, on ? `s lamp-on lamp-${col}` : `s fillbg lamp-off-${col}`);
      s += line(-7.8, 22.2, 7.8, 37.8) + line(7.8, 22.2, -7.8, 37.8);
      return s + tagLabel(ctx, -16) + termNums(ctx, 'X1', 'X2');
    },
  },
  heater: {
    label: 'Resistencia',
    tagPrefix: 'R',
    terms: [{ n: '1', x: 0, y: 0 }, { n: '2', x: 0, y: 3 }],
    box: [-1.5, 0, 1, 3],
    defaults: { func: 'ninguna' },
    props: [tagProp, nameProp, { key: 'func', label: 'Función frigorífica', type: 'select', options: { ninguna: 'Ninguna', desescarche: 'Resistencia desescarche' } }],
    loads: [{ terms: ['1', '2'], kind: 'heater' }],
    draw(ctx) {
      const on = ctx.load && ctx.load.on;
      return line(0, 0, 0, 12) + line(0, 48, 0, 60) + rect(-7, 12, 14, 36, on ? 's heat-on' : 's fillbg') + path('M0,15 l4,3 l-8,5 l8,5 l-8,5 l8,5 l-8,5 l4,2', on ? 's heat-zig' : 's thin') + tagLabel(ctx, -12) + termNums(ctx, '1', '2');
    },
  },
  solenoid: {
    label: 'Válvula solenoide',
    tagPrefix: 'YV',
    terms: [{ n: 'A1', x: 0, y: 0 }, { n: 'A2', x: 0, y: 3 }],
    box: [-1.5, 0, 2, 3],
    defaults: { func: 'solenoide' },
    props: [tagProp, nameProp, { key: 'func', label: 'Función frigorífica', type: 'select', options: { solenoide: 'Válvula solenoide (línea de líquido)', ninguna: 'Ninguna' } }],
    loads: [{ terms: ['A1', 'A2'], kind: 'coil' }],
    draw(ctx) {
      const on = ctx.load && ctx.load.on;
      let s = line(0, 0, 0, 16) + line(0, 44, 0, 60) + rect(-12, 16, 24, 28, on ? 's coil-on' : 's fillbg') + line(-12, 44, 12, 16);
      s += line(12, 30, 20, 30, 's dash') + path('M20,23 L32,37 L32,23 L20,37 Z', on ? 's valve-open' : 's fillbg');
      return s + tagLabel(ctx, -17) + termNums(ctx, 'A1', 'A2');
    },
  },

  // ============================================================ frigorífico
  thermostat: {
    label: 'Termostato',
    tagPrefix: 'TH',
    terms: [{ n: 'C', x: 0, y: 0 }, { n: 'NC', x: 0, y: 3 }, { n: 'NA', x: 2, y: 3 }],
    box: [-2.4, 0, 2.4, 3],
    defaults: { probe: 'camara', mode: 'frio', sp: 2, diff: 2 },
    props: [
      tagProp,
      nameProp,
      { key: 'probe', label: 'Sonda', type: 'select', options: PROBES },
      { key: 'mode', label: 'Modo', type: 'select', options: { frio: 'Frío: C-NC cerrado con T alta', calor: 'Calor: C-NC cerrado con T baja' } },
      { key: 'sp', label: 'Consigna (°C)', type: 'number', step: 0.5, live: true },
      { key: 'diff', label: 'Diferencial (K)', type: 'number', min: 0.2, step: 0.5, live: true },
    ],
    initState: () => ({ actuated: false, value: null }),
    links: (ctx) => (ctx.st.actuated ? [['C', 'NA']] : [['C', 'NC']]),
    draw(ctx) {
      const a = ctx.st && ctx.st.actuated;
      const p = ctx.comp.props;
      let s = changeover(a) + actuatorLine(a ? 7 : -5, 31) + act.temp(-26, 31) + tagLabel(ctx, -46);
      s += text(ctx, 5, 7, 'C', 'tn', 'start') + text(ctx, -4, 57, 'NC', 'tn', 'end') + text(ctx, 44, 57, 'NA', 'tn', 'start');
      const v = ctx.st && ctx.st.value;
      const rng = p.mode === 'calor' ? `${fmtN(p.sp - p.diff)}…${fmtN(p.sp)}` : `${fmtN(p.sp)}…${fmtN(+p.sp + +p.diff)}`;
      s += text(ctx, 20, 8, v === null || v === undefined ? `${rng} °C` : `${fmt1(v)} °C`, 'val', 'start');
      return s;
    },
  },
  pressostat: {
    label: 'Presostato',
    tagPrefix: 'PA',
    terms: [{ n: 'C', x: 0, y: 0 }, { n: 'NC', x: 0, y: 3 }, { n: 'NA', x: 2, y: 3 }],
    box: [-2.4, 0, 2.4, 3],
    defaults: { kind: 'alta', cut: 27, diff: 4, reset: 'manual' },
    props: [
      tagProp,
      nameProp,
      { key: 'kind', label: 'Tipo', type: 'select', options: { alta: 'Alta (abre C-NC al SUBIR la presión)', baja: 'Baja (abre C-NC al BAJAR la presión)' } },
      { key: 'cut', label: 'Presión de corte (bar)', type: 'number', step: 0.1, live: true },
      { key: 'diff', label: 'Diferencial (bar)', type: 'number', min: 0.1, step: 0.1, live: true },
      { key: 'reset', label: 'Rearme', type: 'select', options: { auto: 'Automático', manual: 'Manual' } },
    ],
    initState: () => ({ actuated: false, value: null, latched: false }),
    links: (ctx) => (ctx.st.actuated ? [['C', 'NA']] : [['C', 'NC']]),
    draw(ctx) {
      const a = ctx.st && ctx.st.actuated;
      const p = ctx.comp.props;
      let s = changeover(a) + actuatorLine(a ? 7 : -5, 31) + act.press(-26, 31) + tagLabel(ctx, -46);
      s += text(ctx, 5, 7, 'C', 'tn', 'start') + text(ctx, -4, 57, 'NC', 'tn', 'end') + text(ctx, 44, 57, 'NA', 'tn', 'start');
      const v = ctx.st && ctx.st.value;
      s += text(ctx, 20, 8, v === null || v === undefined ? `${p.kind === 'alta' ? 'corta ≥' : 'corta ≤'} ${fmtN(p.cut)} bar` : `${fmt1(v)} bar`, a ? 'val trip-t' : 'val', 'start');
      if (ctx.st && ctx.st.latched) s += text(ctx, 20, 20, 'REARME', 'tn trip-t', 'start');
      return s;
    },
    click(sim, c, st) {
      return sim.resetPressostat(c, st);
    },
  },
  door_nc: {
    label: 'Contacto puerta (abre al abrir)',
    tagPrefix: 'SQ',
    terms: [{ n: '1', x: 0, y: 0 }, { n: '2', x: 0, y: 3 }],
    box: [-2, 0, 1, 3],
    defaults: { name: 'Puerta' },
    props: [tagProp, nameProp],
    links: (ctx) => (ctx.sim && ctx.sim.door ? [] : [['1', '2']]),
    draw(ctx) {
      const open = ctx.sim && ctx.sim.door;
      return contactNC(!open) + actuatorLine(open ? -2 : -6, 30) + act.position() + tagLabel(ctx, -36) + termNums(ctx, '1', '2');
    },
    click(sim) {
      sim.toggleDoor();
      return true;
    },
  },
  door_no: {
    label: 'Contacto puerta (cierra al abrir)',
    tagPrefix: 'SQ',
    terms: [{ n: '3', x: 0, y: 0 }, { n: '4', x: 0, y: 3 }],
    box: [-2, 0, 1, 3],
    defaults: { name: 'Puerta' },
    props: [tagProp, nameProp],
    links: (ctx) => (ctx.sim && ctx.sim.door ? [['3', '4']] : []),
    draw(ctx) {
      const open = ctx.sim && ctx.sim.door;
      return contactNO(open) + actuatorLine(open ? -1 : -6, 30) + act.position() + tagLabel(ctx, -36) + termNums(ctx, '3', '4');
    },
    click(sim) {
      sim.toggleDoor();
      return true;
    },
  },
  clock: {
    label: 'Reloj de desescarche (motor)',
    tagPrefix: 'RD',
    master: 'clock',
    terms: [{ n: 'A1', x: 0, y: 0 }, { n: 'A2', x: 0, y: 3 }, { n: 'X', x: 2, y: 0 }],
    box: [-1.5, 0, 2.5, 3],
    defaults: { interval: 6, duration: 30, first: 30 },
    props: [
      tagProp,
      nameProp,
      { key: 'interval', label: 'Desescarche cada (h)', type: 'number', min: 0.1, step: 0.5 },
      { key: 'duration', label: 'Duración máxima (min)', type: 'number', min: 1, step: 1 },
      { key: 'first', label: 'Primer desescarche a los (min)', type: 'number', min: 0, step: 1 },
    ],
    loads: [
      { terms: ['A1', 'A2'], kind: 'clock' },
      { terms: ['X', 'A2'], kind: 'coil', id: 'term' },
    ],
    draw(ctx) {
      const on = ctx.load && ctx.load.on;
      const d = ctx.dev;
      let s = line(0, 0, 0, 12) + line(0, 48, 0, 60) + line(40, 0, 40, 22) + line(40, 22, 14, 22);
      s += rect(-14, 12, 28, 36, d && d.defrost ? 's defrost-fill' : 's fillbg');
      s += circle(0, 32, 9, on ? 's motor-on' : 's');
      const ang = d ? (d.pos / (d.interval || 1)) * 360 : 0;
      s += `<g transform="rotate(${f(ang)} 0 32)">${line(0, 32, 0, 25)}</g>` + line(0, 32, 4, 32);
      s += text(ctx, 44, 7, 'X', 'tn', 'start') + text(ctx, 5, 7, 'A1', 'tn', 'start') + text(ctx, 5, 54, 'A2', 'tn', 'start');
      if (d) s += text(ctx, 18, 42, d.defrost ? `DESESC. ${fmtMin(d.pos)}` : `próx. ${fmtMin(d.interval - d.pos)}`, d.defrost ? 'val defrost-t' : 'val', 'start');
      return s + tagLabel(ctx, -19);
    },
    click(sim, c) {
      const d = sim.devices.get(c.props.tag);
      return d ? sim.forceDefrost(d) : false;
    },
  },
  clk_c: {
    label: 'Contacto reloj desescarche',
    tagPrefix: 'RD',
    slaveOf: 'clock',
    terms: [{ n: 'C', x: 0, y: 0 }, { n: 'F', x: 0, y: 3 }, { n: 'D', x: 2, y: 3 }],
    box: [-2.4, 0, 2.4, 3],
    props: [tagProp],
    links: (ctx) => (ctx.dev && ctx.dev.defrost ? [['C', 'D']] : [['C', 'F']]),
    draw(ctx) {
      const a = !!(ctx.dev && ctx.dev.defrost);
      return (
        changeover(a) + actuatorLine(a ? 7 : -5, 31) + act.clock(-26, 31) + text(ctx, -46, 31, ctx.comp.props.tag, 'tag', 'end') +
        text(ctx, 5, 7, 'C', 'tn', 'start') + text(ctx, -4, 57, 'F', 'tn', 'end') + text(ctx, 44, 57, 'D', 'tn', 'start') +
        text(ctx, 20, 8, a ? 'desescarche' : 'frío', a ? 'val defrost-t' : 'val', 'start')
      );
    },
    click(sim, c) {
      const d = sim.devices.get(c.props.tag);
      return d ? sim.forceDefrost(d) : false;
    },
  },

  // ================================================================= varios
  label: {
    label: 'Texto',
    terms: [],
    box: [0, -0.8, 6, 0.4],
    defaults: { text: 'Texto', size: 14 },
    props: [
      { key: 'text', label: 'Texto', type: 'text' },
      { key: 'size', label: 'Tamaño', type: 'number', min: 8, max: 40, step: 1 },
    ],
    getBox(c) {
      const w = (String(c.props.text || '').length * (c.props.size || 14) * 0.58) / G;
      const h = (c.props.size || 14) / G;
      return [0, -h * 0.8, Math.max(w, 1), h * 0.4];
    },
    draw(ctx) {
      const p = ctx.comp.props;
      return `<text class="label-t" x="0" y="0" font-size="${p.size || 14}">${esc(p.text)}</text>`;
    },
  },
};

function mcb(poles) {
  const xs = [0, 2, 4, 6].slice(0, poles);
  const terms = [];
  xs.forEach((x, i) => {
    terms.push({ n: String(i * 2 + 1), x, y: 0 }, { n: String(i * 2 + 2), x, y: 3 });
  });
  if (poles === 2) {
    terms[2].n = 'N1';
    terms[3].n = 'N2';
  }
  if (poles === 4) {
    terms[6].n = 'N1';
    terms[7].n = 'N2';
  }
  const pairs = [];
  for (let i = 0; i < terms.length; i += 2) pairs.push([terms[i].n, terms[i + 1].n]);
  const labels = { 1: 'Magnetotérmico 1P', 2: 'Magnetotérmico 1P+N', 3: 'Magnetotérmico 3P', 4: 'Magnetotérmico 3P+N' };
  return {
    label: labels[poles],
    tagPrefix: 'Q',
    terms,
    box: [-2.2, 0, (poles - 1) * 2 + 0.6, 3],
    defaults: { In: poles >= 3 ? 16 : 10 },
    props: [tagProp, nameProp, { key: 'In', label: 'Calibre (A)', type: 'number', min: 1, step: 1 }],
    protective: true,
    initState: () => ({ on: true, tripped: false }),
    links: (ctx) => (ctx.st.on && !ctx.st.tripped ? pairs : []),
    draw(ctx) {
      const st = ctx.st || { on: true };
      const closed = st.on && !st.tripped;
      let s = '';
      for (const x of xs.map((v) => v * G)) {
        s += contactNO(closed, st.tripped ? 'trip' : '', x);
        s += line(x - 3, 17, x + 3, 23) + line(x + 3, 17, x - 3, 23);
      }
      const bx = closed ? -1 : -6;
      const last = xs[xs.length - 1] * G;
      if (poles > 1) s += line(bx + 0.5, 30, last + bx, 30, 's dash');
      s += actuatorLine(bx, 30, -24) + rect(-38, 23, 14, 14, st.tripped ? 's trip-fill' : 's fillbg') + text(ctx, -31, 30.5, 'I>', 'tn');
      return s + tagLabel(ctx, -42) + text(ctx, last + 6, 60, `${ctx.comp.props.In}A`, 'tn', 'start');
    },
    click(sim, c, st) {
      if (st.tripped) {
        st.tripped = false;
        st.on = true;
        sim.log('info', `${c.props.tag}: rearmado.`);
      } else {
        st.on = !st.on;
        sim.log('info', `${c.props.tag}: ${st.on ? 'conectado' : 'desconectado'}.`);
      }
      return true;
    },
  };
}

function fmtN(n) {
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: 1 });
}

function fmt1(n) {
  return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtMin(s) {
  const m = Math.max(0, s) / 60;
  if (m >= 90) return `${(m / 60).toFixed(1)} h`;
  return `${Math.ceil(m)} min`;
}

// --------------------------------------------------------------- geometría
export function rotatePt(x, y, rot) {
  switch (rot) {
    case 90: return [-y, x];
    case 180: return [-x, -y];
    case 270: return [y, -x];
    default: return [x, y];
  }
}

export function termPos(c, t) {
  const [dx, dy] = rotatePt(t.x, t.y, c.rot || 0);
  return [c.x + dx, c.y + dy];
}

export function compBox(c) {
  const T = TYPES[c.type];
  const b = T.getBox ? T.getBox(c) : T.box;
  const pts = [rotatePt(b[0], b[1], c.rot || 0), rotatePt(b[2], b[3], c.rot || 0)];
  return [
    c.x + Math.min(pts[0][0], pts[1][0]),
    c.y + Math.min(pts[0][1], pts[1][1]),
    c.x + Math.max(pts[0][0], pts[1][0]),
    c.y + Math.max(pts[0][1], pts[1][1]),
  ];
}

export function renderSymbol(c, ctx) {
  const T = TYPES[c.type];
  return T.draw({ comp: c, st: null, dev: null, load: null, sim: null, ...ctx });
}

// ---------------------------------------------------------------- paleta
const P = (type, label, props = {}) => ({ type, label, props });

export const PALETTE = [
  {
    cat: 'Alimentación',
    items: [
      P('supply3', 'Red 3F+N'),
      P('supply1', 'Red L+N'),
      P('bus', 'Borne L1', { phase: 'L1' }),
      P('bus', 'Borne L2', { phase: 'L2' }),
      P('bus', 'Borne L3', { phase: 'L3' }),
      P('bus', 'Borne N', { phase: 'N' }),
    ],
  },
  {
    cat: 'Protecciones',
    items: [
      P('mcb1', 'Magnetot. 1P'),
      P('mcb2', 'Magnetot. 1P+N'),
      P('mcb3', 'Magnetot. 3P'),
      P('mcb4', 'Magnetot. 3P+N'),
      P('fuse', 'Fusible'),
      P('thermal3', 'Relé térmico'),
      P('th_nc', 'Térmico NC 95-96'),
      P('th_no', 'Térmico NA 97-98'),
    ],
  },
  {
    cat: 'Mando',
    items: [
      P('pb_no', 'Pulsador marcha NA'),
      P('pb_nc', 'Pulsador paro NC'),
      P('estop', 'Seta emergencia'),
      P('sw', 'Interruptor'),
      P('sel', 'Selector'),
    ],
  },
  {
    cat: 'Contactores y relés',
    items: [
      P('coil', 'Bobina KM/KA'),
      P('c_no', 'Contacto NA'),
      P('c_nc', 'Contacto NC'),
      P('c_main3', 'Contactos principales'),
      P('tcoil', 'Temporizador'),
      P('t_no', 'Temporizado NA'),
      P('t_nc', 'Temporizado NC'),
    ],
  },
  {
    cat: 'Cargas',
    items: [
      P('motor3', 'Motor 3~'),
      P('motor1', 'Motor 1~'),
      P('lamp', 'Piloto'),
      P('heater', 'Resistencia'),
      P('solenoid', 'Electroválvula'),
    ],
  },
  {
    cat: 'Frigorífico',
    items: [
      P('motor3', 'Compresor 3~', { func: 'compresor', name: 'Compresor', tag: 'M1' }),
      P('motor1', 'Compresor 1~', { func: 'compresor', name: 'Compresor' }),
      P('motor1', 'Vent. evaporador', { func: 'vent_evap', name: 'Vent. evap.', In: 0.5 }),
      P('motor1', 'Vent. condensador', { func: 'vent_cond', name: 'Vent. cond.', In: 0.8 }),
      P('heater', 'Resist. desescarche', { func: 'desescarche', name: 'Desescarche' }),
      P('solenoid', 'Solenoide línea líq.', { func: 'solenoide', name: 'Solenoide' }),
      P('lamp', 'Luz cámara', { func: 'luz', color: 'blanco', name: 'Luz cámara' }),
      P('thermostat', 'Termostato cámara', { probe: 'camara', mode: 'frio', sp: 2, diff: 2, name: 'Cámara' }),
      P('thermostat', 'Termostato fin desesc.', { probe: 'evaporador', mode: 'frio', sp: 5, diff: 5, name: 'Fin desesc.', tag: 'TFD' }),
      P('thermostat', 'Retardo ventiladores', { probe: 'evaporador', mode: 'calor', sp: -2, diff: 3, name: 'Retardo vent.', tag: 'TV' }),
      P('pressostat', 'Presostato alta', { kind: 'alta', cut: 27, diff: 4, reset: 'manual', tag: 'PA', name: 'Alta' }),
      P('pressostat', 'Presostato baja', { kind: 'baja', cut: 0.5, diff: 1.5, reset: 'auto', tag: 'PB', name: 'Baja' }),
      P('door_nc', 'Puerta (abre)'),
      P('door_no', 'Puerta (cierra)'),
      P('clock', 'Reloj desescarche'),
      P('clk_c', 'Contacto reloj'),
    ],
  },
  { cat: 'Otros', items: [P('label', 'Texto')] },
];
