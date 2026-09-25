// Explica por qué una carga (motor, bobina, lámpara...) funciona o no:
// sigue el camino de alimentación en el esquema y señala los contactos
// abiertos y el motivo de cada uno (termostato satisfecho, puerta abierta,
// relé sin tensión, presostato disparado...).

import { TYPES } from './components.js';
import { PH } from './solver.js';

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const LINES = PH.L1 | PH.L2 | PH.L3;
const single = (m) => m !== 0 && (m & (m - 1)) === 0;

// Pares de bornes que cada tipo PUEDE unir en algún estado.
const PAIRS = new Map();
export function possiblePairs(type) {
  if (PAIRS.has(type)) return PAIRS.get(type);
  const T = TYPES[type];
  const out = [];
  if (T && T.links) {
    const base = { comp: { props: {} }, load: null };
    const c0 = { ...base, st: { blown: false, pressed: false, latched: false, on: true, pos: 0, actuated: false, tripped: false }, dev: { active: false, defrost: false }, sim: { door: false } };
    const c1 = { ...base, st: { blown: false, pressed: true, latched: false, on: true, pos: 1, actuated: true, tripped: false }, dev: { active: true, defrost: true }, sim: { door: true } };
    const seen = new Set();
    for (const ctx of [c0, c1]) {
      let links = [];
      try {
        links = T.links(ctx);
      } catch {
        links = [];
      }
      for (const [a, b] of links) {
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (!seen.has(k)) {
          seen.add(k);
          out.push([a, b]);
        }
      }
    }
  }
  PAIRS.set(type, out);
  return out;
}

function who(c) {
  return `${c.props.tag || TYPES[c.type].label}${c.props.name ? ' (' + c.props.name + ')' : ''}`;
}

/** Motivo por el que un aparato de maniobra está ABIERTO ahora. */
export function whyOpen(sim, c, depth = 0) {
  const ctx = sim.ctx(c);
  const st = ctx.st || {};
  const dev = ctx.dev;
  const p = c.props;
  switch (c.type) {
    case 'pb_no':
      return `${who(c)} no está pulsado`;
    case 'pb_nc':
      return `${who(c)} está pulsado`;
    case 'estop':
      return `la seta ${who(c)} está enclavada`;
    case 'sw':
      return `${who(c)} está abierto`;
    case 'sel':
      return `${who(c)} está en la otra posición`;
    case 'mcb1':
    case 'mcb2':
    case 'mcb3':
    case 'mcb4':
      return st.tripped ? `${who(c)} ha disparado por cortocircuito` : `${who(c)} está desconectado`;
    case 'fuse':
      return `${who(c)} está fundido o quitado`;
    case 'door_nc':
      return `la puerta está abierta (${p.tag} abre al abrir la puerta)`;
    case 'door_no':
      return `la puerta está cerrada (${p.tag} solo cierra con la puerta abierta)`;
    case 'thermostat': {
      const v = st.value;
      const val = v === null || v === undefined ? '' : ` (${fmt(v)} °C)`;
      const probe = { camara: 'la cámara', evaporador: 'la batería', producto: 'el género', exterior: 'el exterior' }[p.probe] || 'la sonda';
      if (p.mode === 'calor') {
        return st.actuated
          ? `${who(c)} tiene abierto C-NC: ${probe} está caliente${val}; vuelve a cerrar a ${fmt(p.sp - p.diff)} °C`
          : `${who(c)} tiene abierto C-NA: ${probe} está fría${val}`;
      }
      return st.actuated
        ? `${who(c)} está satisfecho: ${probe} ha bajado a la consigna${val}; vuelve a pedir frío a ${fmt(+p.sp + +p.diff)} °C`
        : `${who(c)} tiene abierto C-NA: ${probe} está por encima de la consigna${val}`;
    }
    case 'pressostat': {
      const v = st.value;
      const val = v === null || v === undefined ? '' : `${fmt(v)} bar`;
      if (!st.actuated) return `${who(c)} tiene abierto C-NA (presión normal ${val})`;
      if (p.kind === 'alta') return `${who(c)} ha disparado por ALTA presión (${val} ≥ ${fmt(p.cut)} bar)${st.latched ? '; necesita rearme manual' : ''}`;
      return `${who(c)} ha abierto por BAJA presión (${val} ≤ ${fmt(p.cut)} bar); vuelve a cerrar a ${fmt(+p.cut + +p.diff)} bar`;
    }
    case 'th_nc':
      return `el relé térmico ${p.tag} ha disparado por sobrecarga`;
    case 'th_no':
      return `el relé térmico ${p.tag} no ha disparado`;
    case 'clk_c':
      return dev && dev.defrost ? `el reloj ${p.tag} está en DESESCARCHE` : `el reloj ${p.tag} está en frío`;
    case 'c_no':
    case 'c_main3':
    case 'c_nc':
    case 't_no':
    case 't_nc': {
      const tag = p.tag;
      const master = sim.comps.find((q) => (q.type === 'coil' || q.type === 'tcoil') && q.props.tag === tag);
      if (!master) return `no hay ninguna bobina ${tag} en el esquema`;
      const active = dev && dev.active;
      if (c.type === 'c_nc' || c.type === 't_nc') {
        if (!active) return `${tag} está en reposo`;
        return `${tag} está activado (su bobina tiene tensión)`;
      }
      if (dev && dev.timing) return `${tag} está contando el tiempo (${fmt(dev.t, 0)} de ${dev.delay} s)`;
      const L = sim.loadOf(master.id);
      if (L && L.on) return `${tag} tiene tensión pero aún no ha cambiado`;
      if (depth >= 2) return `la bobina ${tag} no tiene tensión`;
      const sub = explainLoad(sim, master.id, depth + 1);
      const because = sub.blockers.length ? `, porque ${sub.blockers[0].reason}` : '';
      return `la bobina ${tag} no tiene tensión${because}`;
    }
    default:
      return `${who(c)} está abierto`;
  }
}

/**
 * Explica una carga. Devuelve:
 *   { on, state, text, blockers: [{id, reason}], path: [ids], sides }
 */
export function explainLoad(sim, id, depth = 0) {
  const c = sim.compById.get(id);
  const T = c && TYPES[c.type];
  if (!c || !T || !T.loads) return { on: false, text: '', blockers: [], path: [] };
  const Ld = T.loads[0];
  const L = sim.loadOf(id) || { on: false, state: 'off' };
  const tn = sim.termNet.get(id);

  // Grafo de redes estáticas con todas las uniones posibles.
  if (!sim._graph || sim._graphFor !== sim.netCount) {
    const adj = Array.from({ length: sim.netCount }, () => []);
    for (const q of sim.comps) {
      const qt = TYPES[q.type];
      if (!qt.links) continue;
      const qn = sim.termNet.get(q.id);
      for (const [a, b] of possiblePairs(q.type)) {
        const na = qn[a];
        const nb = qn[b];
        if (na === undefined || nb === undefined || na === nb) continue;
        adj[na].push({ to: nb, comp: q.id, a, b });
        adj[nb].push({ to: na, comp: q.id, a: b, b: a });
      }
    }
    const src = new Map();
    for (const q of sim.comps) {
      const qt = TYPES[q.type];
      const qn = sim.termNet.get(q.id);
      for (const t of qt.terms) {
        const ph = t.phase || (t.phaseProp ? q.props[t.phaseProp] : null);
        if (ph && PH[ph]) src.set(qn[t.n], (src.get(qn[t.n]) || 0) | PH[ph]);
      }
    }
    sim._graph = { adj, src };
    sim._graphFor = sim.netCount;
  }
  const { adj, src } = sim._graph;

  const closedNow = (e) => {
    const q = sim.compById.get(e.comp);
    const links = TYPES[q.type].links(sim.ctx(q));
    return links.some(([x, y]) => (x === e.a && y === e.b) || (x === e.b && y === e.a));
  };

  // Camino más corto (BFS) desde una red hasta una fuente que cumpla want(mask).
  const route = (start, want) => {
    const prev = new Map([[start, null]]);
    const queue = [start];
    while (queue.length) {
      const n = queue.shift();
      if (src.has(n) && want(src.get(n))) {
        const edges = [];
        let k = n;
        while (prev.get(k)) {
          const e = prev.get(k);
          edges.push(e);
          k = e.from;
        }
        return { mask: src.get(n), edges };
      }
      for (const e of adj[n]) {
        if (prev.has(e.to)) continue;
        prev.set(e.to, { ...e, from: n });
        queue.push(e.to);
      }
    }
    return null;
  };

  const terms = Ld.terms;
  const masks = terms.map((t) => sim.netMaskOf(tn[t]));
  const blockers = [];
  const path = [id];
  const sides = [];
  const addBlockers = (r) => {
    if (!r) return;
    for (const e of r.edges) {
      if (!path.includes(e.comp)) path.push(e.comp);
      if (!closedNow(e) && !blockers.some((b) => b.id === e.comp)) {
        blockers.push({ id: e.comp, reason: whyOpen(sim, sim.compById.get(e.comp), depth) });
      }
    }
  };

  if (Ld.kind === 'motor3') {
    terms.forEach((t, i) => {
      const r = route(tn[t], (m) => (m & LINES) !== 0);
      sides.push({ term: t, mask: masks[i], route: r });
      if (!single(masks[i]) || !(masks[i] & LINES)) addBlockers(r);
      else if (r) for (const e of r.edges) if (!path.includes(e.comp)) path.push(e.comp);
    });
  } else {
    // Lado "vivo" (fase) y lado de retorno (neutro u otra fase).
    const r0 = route(tn[terms[0]], (m) => (m & LINES) !== 0);
    const r1 = route(tn[terms[1]], (m) => (m & LINES) !== 0);
    const n0 = route(tn[terms[0]], (m) => (m & PH.N) !== 0);
    const n1 = route(tn[terms[1]], (m) => (m & PH.N) !== 0);
    // Elegimos la asignación con caminos más cortos.
    const len = (r) => (r ? r.edges.length : 99);
    const hotFirst = len(r0) + len(n1) <= len(r1) + len(n0);
    const hot = hotFirst ? { i: 0, r: r0 } : { i: 1, r: r1 };
    const ret = hotFirst ? { i: 1, r: n1 || r1 } : { i: 0, r: n0 || r0 };
    sides.push({ term: terms[hot.i], mask: masks[hot.i], route: hot.r, role: 'fase' });
    sides.push({ term: terms[ret.i], mask: masks[ret.i], route: ret.r, role: 'retorno' });
    if (!single(masks[hot.i])) addBlockers(hot.r);
    else if (hot.r) for (const e of hot.r.edges) if (!path.includes(e.comp)) path.push(e.comp);
    if (!single(masks[ret.i])) addBlockers(ret.r);
    else if (ret.r) for (const e of ret.r.edges) if (!path.includes(e.comp)) path.push(e.comp);
  }

  let text;
  const name = who(c);
  if (sim.fault) text = `${name}: hay un cortocircuito en el esquema.`;
  else if (L.on) text = `${name} funciona: le llega tensión por ${describe(sim, path.slice(1))}.`;
  else if (L.state === 'hum') {
    text = `${name} tiene solo dos fases: zumba sin girar${blockers.length ? '; falta una fase porque ' + blockers.map((b) => b.reason).join(' y ') : ''}.`;
  } else if (blockers.length) {
    // La causa real es el primer contacto abierto desde la fuente; los demás
    // se nombran aparte.
    const others = blockers.slice(1).map((b) => sim.compById.get(b.id).props.tag).filter(Boolean);
    text = `${name} no funciona porque ${blockers[0].reason}.${others.length ? ` También están abiertos: ${others.join(', ')}.` : ''}`;
  }
  else if (masks.every((m) => m && single(m)) && new Set(masks).size === 1) text = `${name} tiene el mismo potencial en los dos bornes: revisa el cableado.`;
  else if (sides.some((s) => !s.route)) text = `${name} no está conectado a la alimentación (falta un cable hasta la fase o el neutro).`;
  else text = `${name} no funciona.`;
  return { on: !!L.on, state: L.state, text, blockers, path, sides };
}

function describe(sim, ids) {
  const names = ids
    .map((i) => sim.compById.get(i))
    .filter((c) => c && !['supply3', 'supply1', 'bus'].includes(c.type))
    .map((c) => c.props.tag || TYPES[c.type].label);
  if (!names.length) return 'conexión directa';
  return names.join(' → ');
}
