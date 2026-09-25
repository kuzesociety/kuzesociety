import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, buildExample } from '../js/examples.js';
import { CoupledSim } from '../js/link.js';
import { TYPES } from '../js/elec/components.js';

function start(id) {
  const sim = new CoupledSim(buildExample(id));
  const s1 = sim.elec.comps.find((c) => c.props.tag === 'S1' && c.type === 'pb_no');
  if (s1) {
    sim.elec.press(s1.id, true);
    sim.resolve();
    sim.step(1);
    sim.elec.press(s1.id, false);
    sim.resolve();
  }
  return sim;
}

test('los ejemplos se construyen sin errores ni cortocircuitos', () => {
  for (const e of EXAMPLES) {
    const p = e.build();
    for (const c of p.components) assert.ok(TYPES[c.type], `${e.id}: tipo ${c.type}`);
    const sim = start(e.id);
    sim.step(60);
    assert.equal(sim.elec.fault, null, `${e.id}: cortocircuito`);
    assert.equal(sim.elec.oscillating, false, `${e.id}: oscila`);
  }
});

test('cámara +2 °C: el termostato hace ciclos y la puerta para el ventilador', () => {
  const sim = start('positiva');
  let starts = 0;
  let stops = 0;
  let prev = sim.io.comp;
  for (let t = 0; t < 3600; t++) {
    sim.step(1);
    if (sim.io.comp !== prev) {
      if (sim.io.comp === 'run') starts++;
      else stops++;
      prev = sim.io.comp;
    }
  }
  assert.ok(starts >= 2 && stops >= 2, `arranques ${starts}, paradas ${stops}`);
  assert.ok(Math.abs(sim.fridge.out.Troom - 3) < 2.5);
  assert.equal(sim.io.evapFan, true);
  sim.setDoor(true);
  sim.resolve();
  assert.equal(sim.io.evapFan, false, 'la puerta para el ventilador del evaporador');
  assert.equal(sim.io.light, true, 'y enciende la luz');
});

test('congelados: pump-down y desescarche terminado por termostato', () => {
  const sim = start('congelados');
  let pumpedDown = false;
  let heated = false;
  const logs = [];
  sim.logFn = (l, m) => logs.push(m);
  sim.elec.hooks.log = (l, m) => logs.push(m);
  for (let t = 0; t < 4800; t++) {
    sim.step(1);
    const o = sim.fridge.out;
    if (!o.running && o.hasSolenoid && !o.solOpen && o.PeG < 0.1) pumpedDown = true;
    if (o.heater) heated = true;
  }
  assert.ok(pumpedDown, 'el presostato de baja para el compresor tras recoger el gas');
  assert.ok(heated, 'hubo desescarche');
  assert.ok(logs.some((m) => m.includes('fin de desescarche por termostato')), 'fin por TFD');
});

test('relé térmico: dispara con el compresor agarrotado', () => {
  const sim = start('positiva');
  sim.step(30);
  sim.fridge.setFaults({ compLocked: true });
  const logs = [];
  sim.elec.hooks.log = (l, m) => logs.push(m);
  for (let t = 0; t < 120; t++) sim.step(1);
  assert.ok(logs.some((m) => m.includes('DISPARO del relé térmico')), logs.join('\n'));
  assert.notEqual(sim.io.comp, 'locked');
});
