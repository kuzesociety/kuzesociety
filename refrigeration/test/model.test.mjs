import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FridgeModel } from '../js/refrig/model.js';
import { psat, tsat, getRefrigerant } from '../js/refrig/refrigerants.js';

const RUN = { comp: 'run', compPhase: '3F', evapFan: true, condFan: true, heater: false, solenoid: null };
const OFF = { ...RUN, comp: 'off', condFan: false };

function settle(m, io, secs) {
  for (let i = 0; i < secs; i++) m.step(1, io);
  return m.out;
}

test('tablas de saturación: psat y tsat son inversas', () => {
  const r = getRefrigerant('R404A');
  for (const T of [-40, -10, 0, 25, 45]) assert.ok(Math.abs(tsat(r, psat(r, T)) - T) < 0.01);
  assert.ok(Math.abs(psat(getRefrigerant('R134a'), 0) - 2.928) < 0.01);
});

test('al arrancar el compresor la baja cae y la alta sube', () => {
  const m = new FridgeModel({ TroomInit: 4 });
  const off = settle(m, OFF, 60);
  const on = settle(m, RUN, 300);
  assert.ok(on.PeG < off.PeG - 1, `baja ${off.PeG} → ${on.PeG}`);
  assert.ok(on.PcG > off.PcG + 2, `alta ${off.PcG} → ${on.PcG}`);
  assert.ok(on.SHevap > 3 && on.SHevap < 9, `recalentamiento ${on.SHevap}`);
});

test('parar el ventilador del evaporador hace caer la baja', () => {
  const m = new FridgeModel({ TroomInit: 4 });
  const a = settle(m, RUN, 600);
  const b = settle(m, { ...RUN, evapFan: false }, 180);
  assert.ok(b.PeG < a.PeG - 0.5, `baja ${a.PeG} → ${b.PeG}`);
});

test('sin ventilador del condensador la alta se dispara', () => {
  const m = new FridgeModel({ TroomInit: 4 });
  const a = settle(m, RUN, 600);
  const b = settle(m, { ...RUN, condFan: false }, 90);
  assert.ok(b.PcG > 27, `alta ${a.PcG} → ${b.PcG}`);
});

test('recogida de gas: con la solenoide cerrada el compresor vacía el evaporador', () => {
  const m = new FridgeModel({ TroomInit: 4 });
  settle(m, { ...RUN, solenoid: true }, 600);
  const b = settle(m, { ...RUN, solenoid: false }, 120);
  assert.ok(b.PeG < 0.3, `baja ${b.PeG}`);
  assert.ok(b.receiverLevel > 0.9, 'el líquido se guarda en el recipiente');
});

test('falta de refrigerante: recalentamiento alto y burbujas en el visor', () => {
  const m = new FridgeModel({ TroomInit: 4 }, { chargePct: 35 });
  const o = settle(m, RUN, 900);
  assert.ok(o.SHevap > 10, `recalentamiento ${o.SHevap}`);
  assert.ok(o.flash > 0.1, `visor ${o.flash}`);
});

test('la resistencia de desescarche funde el hielo a 0 °C', () => {
  const m = new FridgeModel({ TroomInit: -20 });
  m.s.ice = 2;
  m.s.Tcoil = -25;
  let sawPlateau = false;
  for (let i = 0; i < 1800; i++) {
    m.step(1, { ...OFF, evapFan: false, heater: true });
    if (m.s.ice > 0.2 && Math.abs(m.s.Tcoil) < 0.01) sawPlateau = true;
  }
  assert.ok(sawPlateau, 'la batería se queda a 0 °C mientras funde');
  assert.equal(m.s.ice, 0);
  assert.ok(m.s.Tcoil > 5);
});

test('capilar: al parar se igualan las presiones', () => {
  const m = new FridgeModel({ TroomInit: 10, expansion: 'capilar', refrigerant: 'R134a', capacityKW: 0.8 });
  const on = settle(m, { ...RUN, compPhase: '1F' }, 600);
  const off = settle(m, OFF, 900);
  assert.ok(on.PcG - on.PeG > 5);
  assert.ok(off.PcG - off.PeG < 1, `alta ${off.PcG} baja ${off.PeG}`);
});
