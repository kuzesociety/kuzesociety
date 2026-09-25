// Qué es cada pieza de un esquema importado dentro de la instalación
// frigorífica: compresor, ventiladores, termostato, presostatos, puerta…
// Se adivina por la etiqueta, la descripción y los textos cercanos, y el
// usuario lo confirma antes de cargarlo.

import { TYPES } from '../elec/components.js';
import { DEFAULT_REFRIG, DEFAULT_FAULTS } from '../refrig/model.js';
import { getRefrigerant, psatDew, psatBubble, gauge } from '../refrig/refrigerants.js';
import { buildExample } from '../examples.js';

export const INSTALLS = {
  positiva: { label: 'Cámara de conservación (+2 °C)', example: 'positiva', sp: 2, diff: 2, teCut: -30 },
  congelados: { label: 'Cámara de congelados (−20 °C)', example: 'congelados', sp: -20, diff: 2, teCut: -40 },
  armario: { label: 'Armario o nevera (capilar)', example: 'armario', sp: 3, diff: 3, teCut: -35 },
  ninguna: { label: 'Solo el esquema eléctrico', example: null },
};

export const ROLE_OPTIONS = {
  motor: { compresor: 'Compresor', vent_evap: 'Ventilador del evaporador', vent_cond: 'Ventilador del condensador', ninguna: 'Otro motor' },
  heater: { desescarche: 'Resistencia de desescarche', ninguna: 'Otra resistencia' },
  valve: { solenoide: 'Solenoide de líquido', ninguna: 'Otra válvula' },
  lamp: { ninguna: 'Piloto de señalización', luz: 'Luz de la cámara' },
  contact: {
    manual: 'Pulsador o interruptor (lo accionas tú)',
    termostato: 'Termostato de la cámara',
    termostato_evap: 'Termostato de la batería (fin de desescarche)',
    pa: 'Presostato de alta',
    pb: 'Presostato de baja',
    puerta: 'Final de carrera de la puerta',
  },
};

const KIND_OF = { motor1: 'motor', motor3: 'motor', heater: 'heater', solenoid: 'valve', lamp: 'lamp' };
const SWITCHES = new Set(['pb_no', 'pb_nc', 'sw', 'thermostat', 'pressostat', 'door_nc', 'door_no']);
const RELAY_CONTACTS = new Set(['c_no', 'c_nc']);

const norm = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Textos del esquema cerca de una pieza (etiquetas sueltas). */
function nearbyText(c, labels) {
  let best = '';
  let bd = 7;
  for (const l of labels) {
    const d = Math.hypot(l.x - c.x, l.y - c.y);
    if (d < bd) {
      bd = d;
      best = l.text;
    }
  }
  return best;
}

function guessContact(words, c) {
  if (c.type === 'thermostat') return c.props.probe === 'evaporador' ? 'termostato_evap' : 'termostato';
  if (c.type === 'pressostat') return c.props.kind === 'baja' ? 'pb' : 'pa';
  if (c.type === 'door_nc' || c.type === 'door_no') return 'puerta';
  if (/PRES.*ALTA|\bHP\b|\bPA\b|ALTA PRES/.test(words)) return 'pa';
  if (/PRES.*BAJA|\bLP\b|\bPB\b|BAJA PRES/.test(words)) return 'pb';
  if (/PRESOS/.test(words)) return 'pb';
  if (/FIN.*DESESC|BATERIA|EVAP/.test(words) && /TERM|TH|TEMP/.test(words)) return 'termostato_evap';
  if (/TERMOS|TERMOST|\bTH\d*\b|\bTER\b|TEMPERAT|\bB\d*T\b/.test(words)) return 'termostato';
  if (/PUERTA|DOOR|\bSQ\d*\b|FINAL DE CARRERA|\bFC\d*\b/.test(words)) return 'puerta';
  return 'manual';
}

function guessMotor(words, c, state) {
  if (c.props.func && c.props.func !== 'ninguna') return c.props.func;
  if (/COMPRES|\bCP\b|\bMC\b/.test(words)) return 'compresor';
  if (/EVAP|INTERIOR/.test(words)) return 'vent_evap';
  if (/COND|EXTERIOR/.test(words)) return 'vent_cond';
  if (/VENT/.test(words)) return state.evapTaken ? 'vent_cond' : 'vent_evap';
  return null;
}

/**
 * Lista de piezas a confirmar: [{id, kind, tag, what, value, options}] y el
 * tipo de instalación que parece. `texts`: [{text, x, y}] en cuadros.
 */
export function roleCandidates(project, texts = []) {
  const labels = [
    ...texts,
    ...project.components.filter((c) => c.type === 'label').map((c) => ({ text: c.props.text, x: c.x, y: c.y })),
  ];
  const comps = project.components.filter((c) => TYPES[c.type]);
  const coilTags = new Set(comps.filter((c) => c.type === 'coil' || c.type === 'tcoil').map((c) => norm(c.props.tag)));
  const all = norm([project.name, project.description, ...labels.map((l) => l.text)].join(' '));
  const out = [];
  const state = { evapTaken: false };
  const motors = [];
  for (const c of comps) {
    const words = norm(`${c.props.tag} ${c.props.name || ''} ${nearbyText(c, labels)}`);
    const tagWhat = `${c.props.tag || TYPES[c.type].label}${c.props.name ? ' · ' + c.props.name : ''}`;
    const kind = KIND_OF[c.type];
    if (kind === 'motor') {
      const g = guessMotor(words, c, state);
      if (g === 'vent_evap') state.evapTaken = true;
      const item = { id: c.id, kind, tag: tagWhat, what: TYPES[c.type].label, value: g, options: ROLE_OPTIONS.motor };
      motors.push({ item, c });
      out.push(item);
    } else if (kind) {
      let value = Object.keys(ROLE_OPTIONS[kind])[0];
      if (kind === 'lamp') value = c.props.func === 'luz' || /LUZ|ALUMBR|ILUMIN/.test(words) ? 'luz' : 'ninguna';
      if (kind === 'heater' && c.props.func === 'ninguna' && !/DESESC|RESIST|DEFROST|\bR\d|\bE\d/.test(words) && /CARTER|CALEF/.test(words)) value = 'ninguna';
      out.push({ id: c.id, kind, tag: tagWhat, what: TYPES[c.type].label, value, options: ROLE_OPTIONS[kind] });
    } else if (SWITCHES.has(c.type) || (RELAY_CONTACTS.has(c.type) && !coilTags.has(norm(c.props.tag)))) {
      // Pulsadores, interruptores y contactos sin bobina (sensores dibujados como contactos).
      const orphan = RELAY_CONTACTS.has(c.type);
      const value = guessContact(words, c);
      out.push({
        id: c.id,
        kind: 'contact',
        tag: tagWhat,
        what: orphan ? `${TYPES[c.type].label} sin bobina` : (c.cade && c.cade.what) || TYPES[c.type].label,
        value: orphan && value === 'manual' ? 'termostato' : value,
        options: ROLE_OPTIONS.contact,
      });
    }
  }
  // Sin pistas: el primer motor trifásico (o el primero) es el compresor.
  if (motors.length && !motors.some((m) => m.item.value === 'compresor')) {
    const m = motors.find((x) => x.c.type === 'motor3' && !x.item.value) || motors.find((x) => !x.item.value);
    if (m) m.item.value = 'compresor';
  }
  for (const m of motors) if (!m.item.value) m.item.value = 'ninguna';
  let install = 'positiva';
  if (!out.some((x) => x.kind === 'motor' && x.value === 'compresor')) install = 'ninguna';
  else if (/CONGEL|NEGATIV|-\s?(18|20|25)\s?[°º]?C/.test(all)) install = 'congelados';
  else if (/NEVERA|ARMARIO|CAPILAR|ARCON|BOTELLERO|FRIGORIFICO DOMEST/.test(all)) install = 'armario';
  return { items: out, install };
}

/** Aplica las funciones elegidas y prepara la instalación frigorífica. */
export function applyRoles(project, choices, install) {
  const p = JSON.parse(JSON.stringify(project));
  const I = INSTALLS[install] || INSTALLS.positiva;
  const refrig = I.example ? { ...DEFAULT_REFRIG, ...(buildExample(I.example).refrig || {}), enabled: true } : { ...DEFAULT_REFRIG, enabled: false };
  const ref = getRefrigerant(refrig.refrigerant);
  const byId = new Map(p.components.map((c) => [c.id, c]));
  for (const [id, value] of Object.entries(choices)) {
    const c = byId.get(id);
    if (!c) continue;
    const kind = KIND_OF[c.type];
    if (kind) {
      c.props.func = value;
      continue;
    }
    const wasNC = c.type === 'pb_nc' || c.type === 'c_nc' || c.type === 'door_nc' || (c.type === 'sw' && c.props.on) || (c.cade && c.cade.nc);
    const keep = { tag: c.props.tag, name: c.props.name || '' };
    const become = (type, props) => {
      c.type = type;
      c.props = { ...(TYPES[type].defaults || {}), ...keep, ...props };
    };
    switch (value) {
      case 'termostato':
        become('thermostat', { probe: 'camara', mode: 'frio', sp: I.sp ?? 2, diff: I.diff ?? 2, name: keep.name || 'Cámara' });
        break;
      case 'termostato_evap':
        become('thermostat', { probe: 'evaporador', mode: 'frio', sp: 10, diff: 5, name: keep.name || 'Fin desesc.' });
        break;
      case 'pa':
        become('pressostat', { kind: 'alta', cut: round1(gauge(psatBubble(ref, 60))), diff: 4, reset: 'manual', name: keep.name || 'Alta' });
        break;
      case 'pb': {
        const cut = Math.max(0, round1(gauge(psatDew(ref, I.teCut ?? -30))));
        become('pressostat', { kind: 'baja', cut, diff: 1.5, reset: 'auto', name: keep.name || 'Baja' });
        break;
      }
      case 'puerta':
        become(wasNC ? 'door_nc' : 'door_no', { name: keep.name || 'Puerta' });
        break;
      default:
        // Manual: un contacto de relé sin bobina pasa a ser un interruptor.
        if (RELAY_CONTACTS.has(c.type)) become('sw', { on: !!wasNC });
        else if (c.type === 'thermostat' || c.type === 'pressostat') become('sw', { on: true });
    }
  }
  for (const c of p.components) delete c.cade;
  // Nombres útiles para la puesta en marcha automática.
  const pbs = p.components.filter((c) => c.type === 'pb_no');
  if (pbs.length && !pbs.some((c) => /marcha/i.test(c.props.name || ''))) pbs[0].props.name = 'Marcha';
  p.refrig = refrig;
  p.faults = { ...DEFAULT_FAULTS };
  const th = p.components.find((c) => c.type === 'thermostat' && c.props.probe === 'camara');
  if (th && I.sp !== undefined) p.refrig.TroomInit = +th.props.sp + +th.props.diff + 4;
  return p;
}

const round1 = (v) => Math.round(v * 10) / 10;
