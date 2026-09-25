// Importa esquemas de CADe SIMU (.cad).
//
// El archivo es texto: tras la cabecera "CADe_SIMU" van registros
//   *id*código#etiqueta#descripción#b1#…#b8*f1*…*f8*x*y*x2*y2*c0*c1*c2*c3*…*giro*…#texto
// b1…b8 son los nombres de los bornes y f1…f8 dicen cuáles existen; (x, y) es
// el punto de inserción; c0…c3 la caja del símbolo; en los cables (x, y) y
// (x2, y2) son los extremos. Las unidades son de 3 en 3: un cuadro nuestro son
// 3 unidades de CADe SIMU (la separación entre polos, 6, son 2 cuadros).
//
// Cada pieza se coloca donde estaba y se reutilizan los cables originales. Los
// símbolos de CADe SIMU son más altos que los nuestros (12 unidades = 4
// cuadros, frente a 3), así que se añade un tramo corto de cable entre nuestro
// borne y el punto donde estaba el borne original. Al final se comprueba que
// las conexiones eléctricas son las mismas que en el archivo.

import { TYPES, termPos, rotatePt } from '../elec/components.js';
import { ElecSim } from '../elec/solver.js';

const S = 3; // unidades de CADe SIMU por cuadro
const WIRES = new Set([4000, 4009, 4018, 4019]);
const PE_WIRE = 4010;
const JUNCTION = 4001;
const TEXT = 8;

/** Lee los registros del archivo. */
export function parseCad(txt) {
  if (!/^\s*CADe_SIMU/.test(txt)) throw new Error('No es un archivo de CADe SIMU (debe empezar por «CADe_SIMU»).');
  const re = /\*(-?\d+)\*(\d+)#((?:[^#*]*#){9}[^#*]*)\*((?:[^*#]*\*){15,40}[^*#]*)#([^*]*)/g;
  const out = [];
  let m;
  while ((m = re.exec(txt))) {
    const hf = m[3].split('#');
    out.push({
      id: +m[1],
      code: +m[2],
      tag: hf[0].trim(),
      desc: hf[1].trim(),
      slots: hf.slice(2, 10),
      n: m[4].split('*').map((v) => (v.trim() === '' ? 0 : Number(v))),
      text: m[5].replace(/\$\$\$.*$/, '').trim(),
    });
  }
  return out;
}

const cleanTag = (t) => t.replace(/^-+/, '').trim();

// Bornes de nuestros símbolos que corresponden a la fila de arriba y a la de
// abajo del símbolo de CADe SIMU (de izquierda a derecha).
function ourRows(type) {
  switch (type) {
    case 'c_main3':
    case 'mcb3':
    case 'thermal3':
      return [['1', '3', '5'], ['2', '4', '6']];
    case 'mcb4':
      return [['1', '3', '5', 'N1'], ['2', '4', '6', 'N2']];
    case 'mcb2':
      return [['1', 'N1'], ['2', 'N2']];
    case 'motor3':
      return [['U', 'V', 'W'], []];
    case 'thermostat':
    case 'pressostat':
      return [['C'], ['NC']];
    default: {
      const t = TYPES[type].terms;
      return [[t[0].n], [t[1].n]];
    }
  }
}

// Conversión de cada código de CADe SIMU. kind: 'poles' (bornes arriba y abajo),
// 'top' (todos arriba, motores), 'supply', 'skip'.
const CODES = {
  1000: { kind: 'top', type: 'motor3', what: 'motor trifásico' },
  2001: { kind: 'poles', type: 'c_main3', what: 'contactos principales' },
  3000: { kind: 'supply', phases: ['L1'] },
  3001: { kind: 'supply', phases: ['N'] },
  3002: { kind: 'skip', what: 'tierra' },
  3004: { kind: 'supply', phases: ['L1', 'L2', 'L3', 'N'] },
  3005: { kind: 'supply', phases: ['L1', 'L2', 'L3', null] },
  3008: { kind: 'supply', phases: ['L1'] },
  3009: { kind: 'supply', phases: ['N'] },
  3011: { kind: 'supply', phases: ['L1', 'L2', 'L3'] },
  5000: { kind: 'poles', type: 'fuse', what: 'fusible' },
  6003: { kind: 'poles', type: 'fuse', split: true, what: 'fusibles' },
  6006: { kind: 'poles', type: 'mcb4', what: 'interruptor 4P' },
  6007: { kind: 'poles', type: 'thermal3', what: 'relé térmico' },
  6009: { kind: 'poles', type: 'mcb3', what: 'magnetotérmico 3P' },
  6010: { kind: 'poles', type: 'mcb1', what: 'magnetotérmico 1P' },
  7000: { kind: 'poles', type: 'c_no', what: 'contacto NA' },
  7001: { kind: 'poles', type: 'c_nc', what: 'contacto NC' },
  7008: { kind: 'poles', type: 't_no', what: 'contacto temporizado NA' },
  8000: { kind: 'poles', type: 'pb_no', what: 'pulsador NA' },
  8001: { kind: 'poles', type: 'pb_nc', what: 'pulsador NC' },
  8005: { kind: 'poles', type: 'pb_nc', what: 'pulsador NC' },
  8008: { kind: 'poles', type: 'sw', what: 'interruptor' },
  8013: { kind: 'poles', type: 'sw', on: true, what: 'final de carrera NC' },
  8016: { kind: 'poles', type: 'th_no', what: 'contacto del térmico 97-98' },
  8017: { kind: 'poles', type: 'th_nc', what: 'contacto del térmico 95-96' },
  8018: { kind: 'poles', type: 'th_nc', pair: 'th_no', pitch: 9, what: 'contactos del térmico' },
  9000: { kind: 'poles', type: 'coil', what: 'bobina' },
  9003: { kind: 'poles', type: 'solenoid', what: 'electroválvula' },
  9005: { kind: 'poles', type: 'tcoil', what: 'temporizador' },
  9008: { kind: 'poles', type: 'lamp', what: 'piloto' },
  7551: { kind: 'poles', type: 'sw', sensor: true, what: 'sensor' },
  7553: { kind: 'poles', type: 'sw', sensor: true, what: 'sensor' },
  20000: { kind: 'skip', what: 'hoja' },
};

const LAMP_COLORS = ['rojo', 'verde', 'amarillo', 'azul', 'blanco'];

/** Para símbolos que no conocemos: se decide por los nombres de los bornes y la etiqueta. */
function guessCode(r, names, coilTags) {
  const tag = cleanTag(r.tag).toUpperCase();
  const [a, b] = names;
  if (names.length === 2) {
    if (a === 'A1' && b === 'A2') return { kind: 'poles', type: /^(KT|T)\d*/.test(tag) ? 'tcoil' : /^(Y|EV)/.test(tag) ? 'solenoid' : 'coil', guessed: true };
    if (a === 'X1' && b === 'X2') return { kind: 'poles', type: 'lamp', guessed: true };
    if (a === '95' && b === '96') return { kind: 'poles', type: 'th_nc', guessed: true };
    if (a === '97' && b === '98') return { kind: 'poles', type: 'th_no', guessed: true };
    if (a === '67' && b === '68') return { kind: 'poles', type: 't_no', guessed: true };
    if (a === '55' && b === '56') return { kind: 'poles', type: 't_nc', guessed: true };
    const no = /3$/.test(a) && /4$/.test(b);
    const nc = /1$/.test(a) && /2$/.test(b) && a !== '1';
    if (no || nc) {
      if (coilTags.has(tag)) return { kind: 'poles', type: no ? 'c_no' : 'c_nc', guessed: true };
      if (r.code >= 8000 && r.code < 9000) return { kind: 'poles', type: no ? 'pb_no' : 'pb_nc', guessed: true };
      return { kind: 'poles', type: 'sw', on: nc, sensor: true, guessed: true };
    }
    if (/^E|^R\d/.test(tag)) return { kind: 'poles', type: 'heater', guessed: true };
    if (/^M/.test(tag)) return { kind: 'poles', type: 'motor1', guessed: true };
    if (/^H/.test(tag)) return { kind: 'poles', type: 'lamp', guessed: true };
    if (/^Y/.test(tag)) return { kind: 'poles', type: 'solenoid', guessed: true };
    if (/^Q/.test(tag)) return { kind: 'poles', type: 'mcb1', guessed: true };
    if (/^F/.test(tag)) return { kind: 'poles', type: 'fuse', guessed: true };
    return { kind: 'poles', type: 'sw', sensor: true, guessed: true };
  }
  if (names.length >= 3 && /^U/.test(a) && /^V/.test(b)) return { kind: 'top', type: 'motor3', guessed: true };
  if (names.length === 6 && names.join(',') === '1,3,5,2,4,6') {
    if (/^K/.test(tag)) return { kind: 'poles', type: 'c_main3', guessed: true };
    return { kind: 'poles', type: r.code >= 6000 && r.code < 7000 ? 'mcb3' : 'mcb3', guessed: true };
  }
  return null;
}

/**
 * Convierte el texto de un .cad en un esquema de FrigoSIMU.
 * Devuelve { project, notes: [texto], unknown: [...], check: {ok, splits, merges}, texts: [...] }.
 */
export function importCadeSimu(txt, { name = 'Esquema de CADe SIMU' } = {}) {
  const recs = parseCad(txt);
  if (!recs.length) throw new Error('El archivo de CADe SIMU está vacío o no se ha podido leer.');
  const notes = [];
  const unknown = [];
  const components = [];
  const wires = [];
  const texts = [];
  let nId = 0;
  const newId = (p) => `${p}${++nId}`;

  // Puntos de conexión del archivo (en unidades de CADe SIMU).
  const wireSegs = [];
  for (const r of recs) {
    if (!WIRES.has(r.code)) continue;
    const [x1, y1, x2, y2] = r.n.slice(8, 12);
    if (x1 === x2 && y1 === y2) continue;
    wireSegs.push([x1, y1, x2, y2]);
  }
  const endpointKeys = new Set();
  for (const [x1, y1, x2, y2] of wireSegs) {
    endpointKeys.add(`${x1},${y1}`);
    endpointKeys.add(`${x2},${y2}`);
  }
  const onWire = (px, py) => wireSegs.some(([x1, y1, x2, y2]) => onSeg(px, py, x1, y1, x2, y2));

  const coilTags = new Set(recs.filter((r) => r.code === 9000 || r.code === 9005).map((r) => cleanTag(r.tag).toUpperCase()));
  const plc = recs.filter((r) => r.code >= 10000 && r.code < 20000).length;

  // 1. Piezas: posición de cada borne en el archivo.
  const parts = [];
  const seen = new Set();
  for (const r of recs) {
    if (WIRES.has(r.code) || r.code === JUNCTION || r.code === PE_WIRE || r.code < 1000 || (r.code >= 10000 && r.code < 20000)) {
      if (r.code === TEXT && r.text) texts.push({ text: r.text, x: r.n[8], y: r.n[9], x2: r.n[10], y2: r.n[11] });
      continue;
    }
    const flags = r.n.slice(0, 8);
    const names = r.slots.filter((_, i) => flags[i] === 1).map((s) => s.trim());
    let spec = CODES[r.code];
    if (!spec) spec = guessCode(r, names, coilTags);
    if (!spec) {
      unknown.push({ code: r.code, tag: cleanTag(r.tag), terms: names, x: r.n[8], y: r.n[9] });
      continue;
    }
    if (spec.kind === 'skip') continue;
    // Algunos archivos repiten la misma pieza en el mismo sitio.
    const dup = `${r.code},${r.n[8]},${r.n[9]},${r.n[17]},${r.tag}`;
    if (seen.has(dup)) continue;
    seen.add(dup);
    const x = r.n[8];
    const y = r.n[9];
    const box = r.n.slice(12, 16);
    const rot = ((r.n[17] || 0) % 4 + 4) % 4;
    parts.push({ r, spec, names, x, y, box, rot });
  }

  // Posición (unidades CADe, absoluta) de un desplazamiento del símbolo girado.
  const at = (p, dx, dy) => {
    const [rx, ry] = rotatePt(dx, dy, p.rot * 90);
    return [p.x + rx, p.y + ry];
  };
  const occupied = (px, py) => endpointKeys.has(`${px},${py}`) || onWire(px, py);

  // Mapa de bornes: clave "x,y" CADe → {comp, term} y lista para comprobar.
  const mapped = [];
  // Otros bornes de piezas (unidas borne con borne, sin cable).
  const termKeys = new Map();
  const pending = [];

  for (const p of parts) {
    const { r, spec } = p;
    const tag = cleanTag(r.tag);
    const H = Math.max(3, p.box[3] - 3);
    if (spec.kind === 'supply') {
      spec.phases.forEach((ph, i) => {
        if (!ph) return;
        const [cx, cy] = at(p, 6 * i, 0);
        pending.push({ kind: 'bus', phase: ph, cx, cy });
      });
      continue;
    }
    const count = spec.kind === 'top' ? Math.min(p.names.length, 3) : p.names.length;
    const poles = spec.kind === 'top' ? count : Math.max(1, Math.floor(count / 2));
    const pitch = spec.pitch || 6;
    const cadeTop = [];
    const cadeBot = [];
    for (let i = 0; i < poles; i++) {
      cadeTop.push(at(p, pitch * i, 0));
      if (spec.kind !== 'top') cadeBot.push(at(p, pitch * i, H));
    }
    // El contacto 95-96-98 de CADe: el 98 (NA) va junto al 96.
    const extra98 = r.code === 8017 && p.names.includes('98');
    if (spec.split) {
      // Fusibles trifásicos: tres fusibles.
      for (let i = 0; i < poles; i++) {
        pending.push({ kind: 'comp', type: spec.type, tag, name: r.desc, rot: p.rot, cadeTop: [cadeTop[i]], cadeBot: [cadeBot[i]], src: r, spec });
      }
      continue;
    }
    if (spec.pair) {
      pending.push({ kind: 'comp', type: spec.type, tag, name: r.desc, rot: p.rot, cadeTop: [cadeTop[0]], cadeBot: [cadeBot[0]], src: r, spec });
      pending.push({ kind: 'comp', type: spec.pair, tag, name: r.desc, rot: p.rot, cadeTop: [cadeTop[1]], cadeBot: [cadeBot[1]], src: r, spec });
      continue;
    }
    const item = { kind: 'comp', type: spec.type, tag, name: r.desc, rot: p.rot, cadeTop, cadeBot, src: r, spec, names: p.names };
    pending.push(item);
    if (extra98) {
      // Busca el borne 98 en la fila de abajo (a la derecha del 96).
      for (const dx of [6, 9, 3, 12]) {
        const [bx, by] = at(p, dx, H);
        if (occupied(bx, by)) {
          const [tx, ty] = at(p, dx, 0);
          pending.push({ kind: 'comp', type: 'th_no', tag, name: r.desc, rot: p.rot, cadeTop: [[tx, ty]], cadeBot: [[bx, by]], src: r, spec, joinTop: cadeTop[0] });
          break;
        }
      }
    }
  }
  for (const it of pending) for (const pt of [...(it.cadeTop || []), ...(it.cadeBot || []), ...(it.kind === 'bus' ? [[it.cx, it.cy]] : [])]) {
    const k = `${pt[0]},${pt[1]}`;
    termKeys.set(k, (termKeys.get(k) || 0) + 1);
  }
  const attached = (px, py) => occupied(px, py) || (termKeys.get(`${px},${py}`) || 0) > 1;

  // 2. Nuestras piezas y los tramos de cable que las unen a los puntos originales.
  const stub = (from, to) => {
    const [ax, ay] = from;
    const [bx, by] = to;
    if (ax === bx && ay === by) return;
    const pts = [[ax, ay]];
    if (ax !== bx && ay !== by) pts.push([ax, by]);
    pts.push([bx, by]);
    wires.push({ id: newId('w'), points: pts });
  };
  const toGrid = ([px, py]) => [px / S, py / S];

  for (const it of pending) {
    if (it.kind === 'bus') {
      const c = { id: newId('c'), type: 'bus', x: it.cx / S, y: it.cy / S, rot: 0, props: { ...(TYPES.bus.defaults || {}), phase: it.phase, tag: '', name: '' } };
      components.push(c);
      mapped.push({ key: `${it.cx},${it.cy}`, comp: c.id, term: 'P' });
      continue;
    }
    const T = TYPES[it.type];
    const [ox, oy] = it.cadeTop[0];
    const c = {
      id: newId('c'),
      type: it.type,
      x: Math.round(ox / S),
      y: Math.round(oy / S),
      rot: it.rot * 90,
      props: { tag: it.tag, name: it.name || '', ...(T.defaults || {}) },
    };
    if (it.name) c.props.name = it.name;
    const r = it.src;
    if (it.type === 'lamp') c.props.color = LAMP_COLORS[+r.slots[2] || 0] || 'rojo';
    if (it.type === 'tcoil') {
      const d = parseFloat(r.slots[3]);
      if (Number.isFinite(d) && d > 0) c.props.delay = d;
      if (r.slots[2] === '1') c.props.mode = 'tof';
    }
    if (it.type === 'sw') c.props.on = !!it.spec.on;
    c.cade = { code: r.code, what: it.spec.what || null, guessed: !!it.spec.guessed, sensor: !!it.spec.sensor, nc: it.type === 'pb_nc' || it.type === 'c_nc' || (it.type === 'sw' && !!it.spec.on) };
    components.push(c);
    const [topT, botT] = ourRows(it.type);
    const link = (cadePts, ourNames) => cadePts.forEach((pt, i) => {
      const tn = ourNames[i];
      if (!tn) return;
      const t = T.terms.find((q) => q.n === tn);
      const ours = termPos(c, t);
      mapped.push({ key: `${pt[0]},${pt[1]}`, comp: c.id, term: tn });
      if (attached(pt[0], pt[1])) stub(ours, toGrid(pt));
    });
    link(it.cadeTop, topT);
    link(it.cadeBot || [], botT);
    if (it.joinTop) stub(termPos(c, T.terms[0]), toGrid(it.joinTop));
  }

  // 3. Cables originales.
  for (const [x1, y1, x2, y2] of wireSegs) wires.push({ id: newId('w'), points: [[x1 / S, y1 / S], [x2 / S, y2 / S]] });

  // 4. Textos.
  for (const t of texts) {
    components.push({ id: newId('c'), type: 'label', x: t.x / S, y: t.y / S + 0.8, rot: 0, props: { text: t.text, size: 13 } });
  }

  const project = { version: 1, name, description: 'Importado de CADe SIMU.', components, wires };

  // 5. Comprobación: mismas conexiones que en el archivo.
  const check = verify(project, mapped, wireSegs);
  if (plc) notes.push(`El archivo tiene ${plc} elementos de autómata o GRAFCET (PC_SIMU) que no se importan.`);
  if (unknown.length) notes.push(`${unknown.length} símbolo${unknown.length > 1 ? 's' : ''} que no reconozco: ${unknown.map((u) => `${u.tag || '?'} (código ${u.code})`).join(', ')}.`);
  if (!check.ok) notes.push(`Revisa el esquema: ${check.splits + check.merges} conexión${check.splits + check.merges > 1 ? 'es' : ''} no ha${check.splits + check.merges > 1 ? 'n' : ''} quedado igual que en el archivo.`);
  return { project, notes, unknown, check, texts: texts.map((t) => ({ ...t, x: t.x / S, y: t.y / S })) };
}

function onSeg(px, py, x1, y1, x2, y2) {
  if (x1 === x2) return px === x1 && py > Math.min(y1, y2) && py < Math.max(y1, y2);
  if (y1 === y2) return py === y1 && px > Math.min(x1, x2) && px < Math.max(x1, x2);
  return false;
}

/** Compara las redes del archivo con las del esquema importado. */
function verify(project, mapped, wireSegs) {
  // Redes del archivo (unión de puntos).
  const parent = new Map();
  const find = (k) => {
    if (!parent.has(k)) parent.set(k, k);
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r);
    parent.set(k, r);
    return r;
  };
  const union = (a, b) => parent.set(find(a), find(b));
  for (const [x1, y1, x2, y2] of wireSegs) union(`${x1},${y1}`, `${x2},${y2}`);
  const pts = new Set(mapped.map((m) => m.key));
  for (const [x1, y1, x2, y2] of wireSegs) {
    pts.add(`${x1},${y1}`);
    pts.add(`${x2},${y2}`);
  }
  for (const k of pts) {
    const [px, py] = k.split(',').map(Number);
    for (const [x1, y1, x2, y2] of wireSegs) if (onSeg(px, py, x1, y1, x2, y2)) union(k, `${x1},${y1}`);
  }
  // Redes del esquema importado.
  let sim;
  try {
    sim = new ElecSim(project, {});
  } catch {
    return { ok: false, splits: 1, merges: 0 };
  }
  const byCade = new Map();
  const byOurs = new Map();
  for (const m of mapped) {
    const tn = sim.termNet.get(m.comp);
    if (!tn || tn[m.term] === undefined) continue;
    const cn = find(m.key);
    const on = tn[m.term];
    if (!byCade.has(cn)) byCade.set(cn, new Set());
    byCade.get(cn).add(on);
    if (!byOurs.has(on)) byOurs.set(on, new Set());
    byOurs.get(on).add(cn);
  }
  let splits = 0;
  let merges = 0;
  for (const s of byCade.values()) if (s.size > 1) splits += s.size - 1;
  for (const s of byOurs.values()) if (s.size > 1) merges += s.size - 1;
  return { ok: splits === 0 && merges === 0, splits, merges };
}
