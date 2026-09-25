// Importar esquemas: CADe SIMU (.cad) y descripción en escalera.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCad, importCadeSimu } from '../js/import/cadesimu.js';
import { ladderToProject } from '../js/import/ladder.js';
import { roleCandidates, applyRoles } from '../js/import/roles.js';
import { CoupledSim } from '../js/link.js';

// ---------------------------------------------------------------- CADe SIMU
// Genera un .cad con el mismo formato que guarda CADe SIMU.
function cadFile() {
  let id = 0;
  const recs = [];
  const rec = (code, tag, terms, x, y, box = [0, 0, 0, 0], text = '', x2 = 0, y2 = 0) => {
    const slots = [...terms, ...Array(8 - terms.length).fill('')];
    const flags = slots.map((s, i) => (i < terms.length && s !== '' ? 1 : 0));
    const n = [...flags, x, y, x2, y2, ...box, 0, 0, 0, 1, 0, 0, 0];
    recs.push(`*${id++}*${code}#${tag}##${slots.join('#')}*${n.join('*')}#${text}`);
  };
  const wire = (x1, y1, x2, y2) => rec(4000, '', [], x1, y1, [0, 0, 0, 0], '', x2, y2);
  const C2 = [-12, -3, 6, 15]; // contacto
  const PB = [-18, -3, 6, 15]; // pulsador
  // Potencia: red 3F+N, magnetotérmico, contactor, térmico y motor.
  rec(3004, '-X', [], 60, 51, [-12, -9, 18, 3]);
  rec(6009, '-Q1', ['1', '3', '5', '2', '4', '6'], 60, 60, [-21, -3, 18, 24]);
  for (const dx of [0, 6, 12]) wire(60 + dx, 51, 60 + dx, 60);
  rec(2001, '-KM1', ['1', '3', '5', '2', '4', '6'], 60, 90, [-12, -3, 18, 15]);
  for (const dx of [0, 6, 12]) wire(60 + dx, 81, 60 + dx, 90);
  rec(6007, '-F1', ['1', '3', '5', '2', '4', '6'], 60, 111, [-15, -3, 21, 15]);
  for (const dx of [0, 6, 12]) wire(60 + dx, 102, 60 + dx, 111);
  rec(1000, '-M1', ['U1', 'V1', 'W1', 'PE'], 60, 135, [-12, -6, 24, 24]);
  for (const dx of [0, 6, 12]) wire(60 + dx, 123, 60 + dx, 135);
  rec(8, '', [], 84, 150, [0, 0, 0, 0], 'COMPRESOR', 110, 153);
  // Mando: L arriba, N abajo.
  rec(3000, '-X', [], 150, 51, [-12, -9, 6, 3]);
  rec(8017, '-F1', ['95', '96'], 150, 60, PB);
  wire(150, 51, 150, 60);
  rec(8001, '-S0', ['11', '12'], 150, 78, PB);
  wire(150, 72, 150, 78);
  rec(8000, '-S1', ['13', '14'], 150, 96, PB);
  wire(150, 90, 150, 96);
  rec(7000, '-KM1', ['13', '14'], 168, 96, C2);
  wire(150, 93, 168, 93);
  wire(168, 93, 168, 96);
  wire(168, 108, 168, 111);
  wire(150, 111, 168, 111);
  wire(150, 108, 150, 120);
  rec(7001, '-TH1', ['11', '12'], 150, 120, C2); // termostato dibujado como contacto
  rec(8, '', [], 126, 126, [0, 0, 0, 0], 'TERMOSTATO', 146, 129);
  wire(150, 132, 150, 150);
  rec(9000, '-KM1', ['A1', 'A2'], 150, 150, [-15, -3, 9, 15]);
  wire(150, 162, 150, 180);
  rec(3001, '-X', [], 150, 180, [-12, -9, 6, 3]);
  // Piloto de marcha en paralelo con la bobina.
  wire(150, 141, 186, 141);
  wire(186, 141, 186, 150);
  rec(9008, '-H1', ['X1', 'X2', '1'], 186, 150, [-15, -3, 9, 15]);
  wire(186, 162, 186, 171);
  wire(150, 171, 186, 171);
  return `CADe_SIMU${recs.join('')}`;
}

test('lee los registros de un .cad', () => {
  const recs = parseCad(cadFile());
  assert.ok(recs.length > 30);
  const coil = recs.find((r) => r.code === 9000);
  assert.equal(coil.tag, '-KM1');
  assert.deepEqual(coil.slots.slice(0, 2), ['A1', 'A2']);
  assert.throws(() => parseCad('hola'), /CADe SIMU/);
});

test('importa un esquema de CADe SIMU con las mismas conexiones', () => {
  const res = importCadeSimu(cadFile(), { name: 'Cámara' });
  assert.ok(res.check.ok, JSON.stringify(res.check));
  const types = res.project.components.map((c) => c.type);
  for (const t of ['motor3', 'c_main3', 'thermal3', 'mcb3', 'th_nc', 'pb_nc', 'pb_no', 'c_no', 'c_nc', 'coil', 'lamp', 'bus']) {
    assert.ok(types.includes(t), `falta ${t}`);
  }
  // Las piezas quedan donde estaban (unidades de CADe / 3).
  const km = res.project.components.find((c) => c.type === 'coil');
  assert.deepEqual([km.x, km.y], [50, 50]);
});

test('adivina qué es cada pieza y la cámara funciona', () => {
  const res = importCadeSimu(cadFile(), { name: 'Cámara' });
  const { items, install } = roleCandidates(res.project, res.texts);
  assert.equal(install, 'positiva');
  const by = (tag) => items.find((i) => i.tag.startsWith(tag));
  assert.equal(by('M1').value, 'compresor');
  assert.equal(by('TH1').value, 'termostato');
  assert.equal(by('S1').value, 'manual');
  const p = applyRoles(res.project, Object.fromEntries(items.map((i) => [i.id, i.value])), install);
  assert.ok(p.components.some((c) => c.type === 'thermostat'));
  const sim = new CoupledSim(p, {});
  const s1 = p.components.find((c) => c.props.tag === 'S1');
  sim.elec.press(s1.id, true);
  sim.resolve();
  sim.elec.press(s1.id, false);
  sim.resolve();
  sim.step(60);
  assert.equal(sim.io.comp, 'run');
  assert.ok(sim.fridge.out.running);
  const T0 = sim.fridge.out.Troom;
  sim.step(600);
  assert.ok(sim.fridge.out.Troom < T0 - 1, 'la cámara se enfría');
});

// ------------------------------------------------------------ escalera
const SPEC = {
  name: 'Cámara dibujada',
  install: 'positiva',
  power: [{ items: [{ type: 'mcb3', tag: 'Q1' }, { type: 'c_main3', tag: 'KM1' }, { type: 'thermal3', tag: 'F1' }, { type: 'motor3', tag: 'M1', func: 'compresor' }] }],
  control: {
    protection: { type: 'mcb2', tag: 'Q2' },
    rungs: [
      [{ type: 'pb_nc', tag: 'S0' }, { par: [[{ type: 'pb_no', tag: 'S1', name: 'Marcha' }], [{ type: 'c_no', tag: 'KA1' }]] }, { type: 'coil', tag: 'KA1' }],
      [{ type: 'c_no', tag: 'KA1' }, { par: [
        [{ type: 'th_nc', tag: 'F1' }, { type: 'thermostat', tag: 'TH1', sp: 2, diff: 2 }, { type: 'coil', tag: 'KM1' }],
        [{ type: 'door_nc', tag: 'SQ1' }, { type: 'motor1', tag: 'M3', func: 'vent_evap' }],
        [{ type: 'c_no', tag: 'KM1' }, { type: 'motor1', tag: 'M2', func: 'vent_cond' }],
        [{ type: 'pressostat', tag: 'PA', kind: 'alta', out: 'NA' }, { type: 'lamp', tag: 'H2', color: 'rojo' }],
      ] }],
    ],
  },
};

test('dibuja un esquema en escalera que funciona', () => {
  const { project, notes } = ladderToProject(SPEC);
  assert.deepEqual(notes, []);
  const { items, install } = roleCandidates(project);
  const p = applyRoles(project, Object.fromEntries(items.map((i) => [i.id, i.value])), install);
  const sim = new CoupledSim(p, {});
  const s1 = p.components.find((c) => c.props.tag === 'S1');
  sim.elec.press(s1.id, true);
  sim.resolve();
  sim.elec.press(s1.id, false);
  sim.resolve();
  sim.step(60);
  assert.equal(sim.io.comp, 'run');
  assert.ok(sim.io.evapFan && sim.io.condFan);
  // La alarma de alta (contacto NA del presostato) está apagada.
  const h2 = p.components.find((c) => c.props.tag === 'H2');
  assert.equal(sim.elec.loadOf(h2.id).on, false);
  // Abrir la puerta para el ventilador del evaporador.
  sim.setDoor(true);
  sim.resolve();
  assert.equal(sim.io.evapFan, false);
});

test('avisa de las piezas que no sabe dibujar', () => {
  const { notes } = ladderToProject({ control: { rungs: [[{ type: 'raro' }, { type: 'coil', tag: 'K1' }]] } });
  assert.ok(notes.some((n) => /raro/.test(n)));
  assert.throws(() => ladderToProject({}), /circuito/);
});
