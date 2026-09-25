// Dibuja un esquema a partir de una descripción en escalera (JSON), la que
// devuelve Claude al interpretar una foto, un PDF o un archivo de otro programa.
//
// {
//   "name": "Cámara de conservación",
//   "install": "positiva" | "congelados" | "armario" | "ninguna",
//   "power":   [ { "items": [ {type:"mcb3"}, {type:"c_main3", tag:"KM1"}, {type:"thermal3", tag:"F1"},
//                             {type:"motor3", tag:"M1", func:"compresor"} ] } ],
//   "control": { "protection": {type:"mcb2", tag:"Q2"},
//                "rungs": [ [pieza, {"par": [[pieza, …], [pieza, …]]}, pieza], … ] }
// }
//
// Cada escalón va de la fase (arriba) al neutro (abajo). Una rama "par" son
// caminos en paralelo, cada uno una lista en serie (que a su vez puede tener
// más ramas en paralelo).

import { TYPES, termPos } from '../elec/components.js';

// Borne de entrada y salidas posibles de cada tipo en un escalón.
const IO = {
  pb_no: ['3', { '': '4' }],
  pb_nc: ['1', { '': '2' }],
  estop: ['1', { '': '2' }],
  sw: ['1', { '': '2' }],
  sel: ['C', { '': '1', 1: '1', 2: '2' }],
  c_no: ['13', { '': '14' }],
  c_nc: ['21', { '': '22' }],
  t_no: ['67', { '': '68' }],
  t_nc: ['55', { '': '56' }],
  th_nc: ['95', { '': '96' }],
  th_no: ['97', { '': '98' }],
  thermostat: ['C', { '': 'NC', NC: 'NC', NA: 'NA' }],
  pressostat: ['C', { '': 'NC', NC: 'NC', NA: 'NA' }],
  door_nc: ['1', { '': '2' }],
  door_no: ['3', { '': '4' }],
  clk_c: ['C', { '': 'F', F: 'F', D: 'D' }],
  coil: ['A1', { '': 'A2' }],
  tcoil: ['A1', { '': 'A2' }],
  lamp: ['X1', { '': 'X2' }],
  motor1: ['1', { '': '2' }],
  heater: ['1', { '': '2' }],
  solenoid: ['A1', { '': 'A2' }],
  clock: ['A1', { '': 'A2' }],
  fuse: ['1', { '': '2' }],
  mcb1: ['1', { '': '2' }],
};
const POWER = new Set(['mcb3', 'mcb4', 'fuse3', 'c_main3', 'thermal3', 'motor3']);
const PROPS = ['name', 'func', 'probe', 'mode', 'sp', 'diff', 'kind', 'cut', 'reset', 'delay', 'color', 'In', 'Iset', 'interval', 'duration', 'first', 'on'];

const COL = 6; // cuadros entre columnas en paralelo

export function ladderToProject(spec) {
  const notes = [];
  const components = [];
  const wires = [];
  let n = 0;
  const add = (type, x, y, item = {}) => {
    const T = TYPES[type];
    const props = { tag: '', name: '', ...(T.defaults || {}) };
    if (item.tag) props.tag = String(item.tag).replace(/^-+/, '');
    for (const k of PROPS) {
      if (item[k] === undefined || item[k] === null || item[k] === '') continue;
      const def = (T.props || []).find((p) => p.key === k);
      if (!def && k !== 'name') continue;
      if (def && def.type === 'number') {
        const v = parseFloat(item[k]);
        if (Number.isFinite(v)) props[k] = v;
      } else if (def && def.type === 'select') {
        if (Object.prototype.hasOwnProperty.call(def.options, item[k])) props[k] = item[k];
      } else if (def && def.type === 'bool') props[k] = !!item[k];
      else props[k] = String(item[k]);
    }
    const c = { id: `c${++n}`, type, x, y, rot: 0, props };
    components.push(c);
    return c;
  };
  const wire = (...pts) => {
    const out = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (last && last[0] !== p[0] && last[1] !== p[1]) out.push([last[0], p[1]]);
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
    }
    if (out.length >= 2) wires.push({ id: `w${wires.length + 1}`, points: out });
  };
  const T = (c, name) => termPos(c, TYPES[c.type].terms.find((t) => t.n === name));
  const label = (text, x, y) => {
    const c = add('label', x, y);
    Object.assign(c.props, { text, size: 16 });
  };

  // ------------------------------------------------------------ potencia
  const chains = (Array.isArray(spec.power) ? spec.power : []).map((ch) => (Array.isArray(ch) ? ch : ch && ch.items) || []).filter((ch) => ch.length);
  let xCtl = 0;
  if (chains.length) {
    label('POTENCIA', 0, -5);
    const sup = add('supply3', 0, 0);
    const xMax = (chains.length - 1) * 8;
    wire(T(sup, 'L1'), [0, 2], [xMax, 2]);
    wire(T(sup, 'L2'), [2, 3], [xMax + 2, 3]);
    wire(T(sup, 'L3'), [4, 4], [xMax + 4, 4]);
    chains.forEach((items, j) => {
      const cx = j * 8;
      let tops = [[cx, 2], [cx + 2, 3], [cx + 4, 4]];
      let y = 6;
      for (const it of items) {
        const type = it.type === 'fuse3' ? 'fuse' : it.type;
        if (!POWER.has(it.type) && it.type !== 'fuse') {
          notes.push(`En potencia no sé colocar «${it.type}»; lo quito.`);
          continue;
        }
        let pins;
        if (type === 'fuse') {
          const f = [0, 2, 4].map((dx) => add('fuse', cx + dx, y, it));
          pins = { top: f.map((c) => T(c, '1')), bot: f.map((c) => T(c, '2')) };
        } else {
          const c = add(type, cx, y, it);
          if (type === 'motor3') pins = { top: [T(c, 'U'), T(c, 'V'), T(c, 'W')], bot: null };
          else pins = { top: [T(c, '1'), T(c, '3'), T(c, '5')], bot: [T(c, '2'), T(c, '4'), T(c, '6')] };
        }
        tops.forEach((p, i) => wire(p, pins.top[i]));
        if (!pins.bot) {
          tops = null;
          break;
        }
        tops = pins.bot;
        y = pins.bot[0][1] + 2;
      }
    });
    xCtl = xMax + 14;
  }

  // -------------------------------------------------------------- mando
  const ctl = spec.control || {};
  const rungs = (Array.isArray(ctl.rungs) ? ctl.rungs : []).filter((r) => Array.isArray(r) && r.length);
  if (rungs.length) {
    label('MANDO', xCtl, -5);
    const sup = add('supply1', xCtl, 0);
    let pL = T(sup, 'L');
    let pN = T(sup, 'N');
    const prot = ctl.protection && TYPES[ctl.protection.type] ? ctl.protection : null;
    if (prot && (prot.type === 'mcb2' || prot.type === 'mcb1' || prot.type === 'fuse')) {
      const c = add(prot.type, xCtl, 2, prot);
      wire(pL, T(c, '1'));
      pL = T(c, '2');
      if (prot.type === 'mcb2') {
        wire(pN, T(c, 'N1'));
        pN = T(c, 'N2');
      }
    }
    const yL = pL[1] + 2;
    // Medidas.
    const measure = (node) => {
      if (Array.isArray(node)) {
        const ms = node.map(measure).filter(Boolean);
        if (!ms.length) return null;
        return { kind: 's', items: ms, w: Math.max(...ms.map((m) => m.w)), h: ms.reduce((a, m) => a + m.h, 0) + ms.length - 1 };
      }
      if (node && Array.isArray(node.par)) {
        const ms = node.par.map((b) => measure(Array.isArray(b) ? b : [b])).filter(Boolean);
        if (!ms.length) return null;
        if (ms.length === 1) return ms[0];
        return { kind: 'p', items: ms, w: ms.reduce((a, m) => a + m.w, 0), h: Math.max(...ms.map((m) => m.h)) + 2 };
      }
      if (!node || !IO[node.type]) {
        if (node && node.type) notes.push(`No sé dibujar «${node.type}» en el mando; lo quito.`);
        return null;
      }
      const [, outs] = IO[node.type];
      const out = outs[node.out || ''] || outs[''];
      const t = TYPES[node.type].terms.find((q) => q.n === out);
      return { kind: 'leaf', item: node, out, w: 1, h: t.x !== 0 ? 4 : 3 };
    };
    // Dibujo: entra por (x, y) y devuelve el punto de salida.
    const draw = (m, x, y) => {
      if (m.kind === 'leaf') {
        const [inT] = IO[m.item.type];
        const tin = TYPES[m.item.type].terms.find((q) => q.n === inT);
        const c = add(m.item.type, x - tin.x, y - tin.y, m.item);
        const o = T(c, m.out);
        if (o[0] !== x) {
          wire(o, [o[0], o[1] + 1], [x, o[1] + 1]);
          return [x, o[1] + 1];
        }
        return o;
      }
      if (m.kind === 's') {
        let p = draw(m.items[0], x, y);
        for (const it of m.items.slice(1)) {
          wire(p, [x, p[1] + 1]);
          p = draw(it, x, p[1] + 1);
        }
        return p;
      }
      // Paralelo.
      let cx = x;
      const xs = [];
      const exits = [];
      for (const it of m.items) {
        xs.push(cx);
        wire([cx, y], [cx, y + 1]);
        exits.push(draw(it, cx, y + 1));
        cx += it.w * COL;
      }
      const yb = y + m.h;
      exits.forEach((e, i) => wire(e, [xs[i], yb]));
      wire([x, y], [xs[xs.length - 1], y]);
      wire([x, yb], [xs[xs.length - 1], yb]);
      return [x, yb];
    };
    const ms = rungs.map((r) => measure(r)).filter(Boolean);
    const yN = yL + 1 + Math.max(...ms.map((m) => m.h)) + 2;
    let x = xCtl + 6;
    const xs = [];
    for (const m of ms) {
      xs.push(x);
      wire([x, yL], [x, yL + 1]);
      const e = draw(m, x, yL + 1);
      wire(e, [x, yN]);
      x += m.w * COL;
    }
    const xLast = xs[xs.length - 1];
    wire(pL, [pL[0], yL], [xLast, yL]);
    wire(pN, [pN[0], yN], [xLast, yN]);
  }

  if (!chains.length && !rungs.length) throw new Error('La descripción no tiene ni circuito de potencia ni de mando.');
  // Los contactos del térmico necesitan su relé; si no está en potencia, se avisa.
  const thTags = new Set(components.filter((c) => c.type === 'thermal3').map((c) => c.props.tag));
  const orphanTh = components.filter((c) => (c.type === 'th_nc' || c.type === 'th_no') && !thTags.has(c.props.tag));
  if (orphanTh.length) notes.push(`El contacto del térmico ${orphanTh[0].props.tag} no tiene relé térmico en el circuito de potencia: no disparará nunca.`);
  return {
    project: { version: 1, name: spec.name || 'Esquema importado', description: spec.description || 'Dibujado a partir de una imagen o descripción.', components, wires },
    notes,
    install: spec.install,
  };
}
