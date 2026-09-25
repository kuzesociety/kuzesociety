import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Builder } from '../js/elec/builder.js';
import { ElecSim } from '../js/elec/solver.js';

function marchaParo() {
  const b = new Builder();
  b.add('bus', 0, 2, { phase: 'L1' });
  b.add('bus', 0, 26, { phase: 'N' }, 180);
  b.wire([0, 2], [20, 2]);
  b.wire([0, 26], [20, 26]);
  const r = b.series(4, 2, [
    { type: 'pb_nc', in: '1', out: '2', ref: 's0', props: { tag: 'S0' } },
    { type: 'pb_no', in: '3', out: '4', ref: 's1', props: { tag: 'S1' } },
    { type: 'coil', in: 'A1', out: 'A2', ref: 'km', props: { tag: 'KM1' } },
  ], 26);
  const k = b.add('c_no', 7, 7, { tag: 'KM1' });
  b.wire(b.t(r.s0, '2'), [7, 6], b.t(k, '13'));
  b.wire(b.t(k, '14'), [7, 11], b.t(r.km, 'A1'));
  const r2 = b.series(12, 2, [
    { type: 'c_no', in: '13', out: '14', props: { tag: 'KM1' } },
    { type: 'lamp', in: 'X1', out: 'X2', ref: 'h1', props: { tag: 'H1' } },
  ], 26);
  return { project: b.project(), s0: r.s0, s1: r.s1, km: r.km, h1: r2.h1 };
}

test('marcha-paro con autoenclavamiento', () => {
  const { project, s0, s1, km, h1 } = marchaParo();
  const sim = new ElecSim(project);
  sim.solve();
  assert.equal(sim.loadOf(km.id).on, false);
  assert.equal(sim.loadOf(h1.id).on, false);

  sim.press(s1.id, true);
  sim.solve();
  assert.equal(sim.loadOf(km.id).on, true, 'KM1 entra al pulsar marcha');
  sim.press(s1.id, false);
  sim.solve();
  assert.equal(sim.loadOf(km.id).on, true, 'KM1 queda enclavado');
  assert.equal(sim.loadOf(h1.id).on, true, 'H1 se enciende');

  sim.press(s0.id, true);
  sim.solve();
  assert.equal(sim.loadOf(km.id).on, false, 'paro desactiva KM1');
  sim.press(s0.id, false);
  sim.solve();
  assert.equal(sim.loadOf(km.id).on, false, 'sigue parado');
  assert.equal(sim.loadOf(h1.id).on, false);
});

test('cortocircuito dispara la protección de menor calibre', () => {
  const b = new Builder();
  b.add('bus', 0, 0, { phase: 'L1' });
  b.add('bus', 10, 0, { phase: 'N' });
  const q1 = b.add('mcb1', 0, 1, { tag: 'Q1', In: 16 });
  const q2 = b.add('mcb1', 0, 5, { tag: 'Q2', In: 6 });
  const sw = b.add('sw', 0, 9, { tag: 'S1' });
  b.wire([0, 0], [0, 1]);
  b.wire([0, 4], [0, 5]);
  b.wire([0, 8], [0, 9]);
  b.wire([0, 12], [0, 14], [10, 14], [10, 0]);
  const logs = [];
  const sim = new ElecSim(b.project(), { log: (l, m) => logs.push(m) });
  sim.solve();
  assert.equal(sim.fault, null);
  sim.click(sw.id);
  sim.solve();
  assert.equal(sim.cstate.get(q2.id).tripped, true, 'dispara Q2 (6 A)');
  assert.equal(sim.cstate.get(q1.id).tripped, false, 'Q1 (16 A) no dispara');
  assert.ok(logs.some((m) => m.includes('Q2')));
});

test('motor trifásico: marcha, inversión y falta de fase', () => {
  const b = new Builder();
  const net = b.add('supply3', 0, 0);
  const f1 = b.add('fuse', 0, 2, { tag: 'F1' });
  const f2 = b.add('fuse', 2, 2, { tag: 'F2' });
  const f3 = b.add('fuse', 4, 2, { tag: 'F3' });
  b.wire([0, 0], [0, 2]);
  b.wire([2, 0], [2, 2]);
  b.wire([4, 0], [4, 2]);
  const m = b.add('motor3', 0, 7);
  b.wire([0, 5], [0, 7]);
  b.wire([2, 5], [2, 7]);
  b.wire([4, 5], [4, 7]);
  const sim = new ElecSim(b.project());
  sim.solve();
  assert.equal(sim.loadOf(m.id).state, 'run');
  assert.equal(sim.loadOf(m.id).reverse, false);
  sim.click(f3.id);
  sim.solve();
  assert.equal(sim.loadOf(m.id).state, 'hum', 'con dos fases el motor zumba');
  void net, f1, f2;
});

test('temporizador a la conexión', () => {
  const b = new Builder();
  b.add('bus', 0, 0, { phase: 'L1' });
  b.add('bus', 0, 20, { phase: 'N' }, 180);
  b.wire([0, 0], [8, 0]);
  b.wire([0, 20], [8, 20]);
  const r = b.series(2, 0, [
    { type: 'sw', in: '1', out: '2', ref: 's', props: { tag: 'S1' } },
    { type: 'tcoil', in: 'A1', out: 'A2', props: { tag: 'KT1', mode: 'ton', delay: 5 } },
  ], 20);
  const r2 = b.series(6, 0, [
    { type: 't_no', in: '67', out: '68', props: { tag: 'KT1' } },
    { type: 'lamp', in: 'X1', out: 'X2', ref: 'h' },
  ], 20);
  const sim = new ElecSim(b.project());
  sim.solve();
  sim.click(r.s.id);
  sim.solve();
  assert.equal(sim.loadOf(r2.h.id).on, false);
  for (let i = 0; i < 4; i++) sim.tick(1), sim.dirty && sim.solve();
  assert.equal(sim.loadOf(r2.h.id).on, false, 'aún no');
  for (let i = 0; i < 2; i++) sim.tick(1), sim.dirty && sim.solve();
  assert.equal(sim.loadOf(r2.h.id).on, true, 'tras 5 s');
});
