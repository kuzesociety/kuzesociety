import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseReadings } from '../js/diagnose.js';

const base = { refrigerant: 'R404A', app: 'positiva', expansion: 'txv', Troom: 3, Tamb: 30 };
const top = (m) => diagnoseReadings({ ...base, ...m }).hypotheses[0].id;

test('calcula saturación, recalentamiento y subenfriamiento', () => {
  const r = diagnoseReadings({ ...base, LP: 3.5, HP: 18.2, Tsuc: -2.5, Tliq: 39 });
  assert.ok(Math.abs(r.computed.Te - -8.6) < 0.2, `Te ${r.computed.Te}`);
  assert.ok(Math.abs(r.computed.Tc - 42.1) < 0.2, `Tc ${r.computed.Tc}`);
  assert.ok(Math.abs(r.computed.SH - 6.1) < 0.3);
  assert.ok(Math.abs(r.computed.SC - 3.1) < 0.3);
});

test('mezclas: rocío en baja y burbuja en alta', () => {
  const r = diagnoseReadings({ ...base, refrigerant: 'R449A', LP: 2.5, HP: 17 });
  assert.ok(r.computed.Te - r.computed.TeBub > 4, 'deslizamiento en baja');
  assert.ok(r.computed.TcDew - r.computed.Tc > 3, 'deslizamiento en alta');
});

test('reconoce las averías típicas', () => {
  assert.equal(top({ LP: 3.5, HP: 18.2, Tsuc: -2.5, Tliq: 39, sight: 'lleno' }), 'normal');
  assert.equal(top({ LP: 1.8, HP: 15, Tsuc: 8, Tliq: 35.5, Troom: 6, sight: 'burbujas' }), 'fuga');
  assert.equal(top({ LP: 1.9, HP: 17, Tsuc: 7, Tliq: 33, Troom: 5, filterDT: 5 }), 'restriccion');
  assert.equal(top({ LP: 3.9, HP: 26, Tsuc: 0, Tliq: 53 }), 'condensacion');
  assert.equal(top({ LP: 1.9, HP: 16, Tsuc: -14, Tliq: 36, Troom: 5, ice: 'bloqueado' }), 'evaporador');
  assert.equal(top({ LP: 5.4, HP: 15.5, Tsuc: 9, Tliq: 30, Troom: 8, Tamb: 30, amps: 1.6, ampsNom: 2.6 }), 'compresor');
  assert.equal(top({ LP: 3.8, HP: 23, Tsuc: -2, Tliq: 36, sight: 'lleno' }), 'exceso');
  assert.equal(top({ LP: 3.7, HP: 24, Tsuc: -2, Tliq: 44, Tamb: 25, standP: 14, standT: 25 }), 'incondensables');
});

test('con solo presiones pide las medidas que faltan', () => {
  const r = diagnoseReadings({ refrigerant: 'R449A', app: 'positiva', expansion: 'txv', LP: 1.2, HP: 14 });
  assert.ok(r.next.some((t) => t.includes('recalentamiento')));
  assert.ok(r.next.some((t) => t.includes('subenfriamiento')));
});

test('avisa de medidas incoherentes', () => {
  const r = diagnoseReadings({ ...base, LP: 3.5, HP: 12, Tsuc: -12, Tliq: 30, Tamb: 30 });
  assert.ok(r.warnings.length >= 2);
});
