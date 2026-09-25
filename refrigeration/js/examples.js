// Esquemas de ejemplo.

import { Builder } from './elec/builder.js';

const NA = (tag) => ({ type: 'c_no', in: '13', out: '14', props: { tag } });
const coil = (tag, name) => ({ type: 'coil', in: 'A1', out: 'A2', props: { tag, name } });

/** Red trifásica + Q1 + KM1 + F1 + compresor; alimenta el mando con Q2 (1P+N). */
function powerCircuit(b, { Iset = 3.2, compName = 'Compresor' } = {}) {
  b.add('label', 0, -5, { text: 'POTENCIA', size: 16 });
  b.add('supply3', 0, 0);
  b.add('mcb3', 0, 2, { tag: 'Q1', In: 16, name: 'General' });
  for (const x of [0, 2, 4]) b.wire([x, 0], [x, 2]);
  b.add('c_main3', 0, 7, { tag: 'KM1' });
  for (const x of [0, 2, 4]) b.wire([x, 5], [x, 7]);
  b.add('thermal3', 0, 12, { tag: 'F1', Iset, reset: 'manual' });
  for (const x of [0, 2, 4]) b.wire([x, 10], [x, 12]);
  b.add('motor3', 0, 17, { tag: 'M1', func: 'compresor', name: compName });
  for (const x of [0, 2, 4]) b.wire([x, 15], [x, 17]);
  // Mando: toma L1 y N antes de Q1.
  b.add('mcb2', 10, 2, { tag: 'Q2', In: 6, name: 'Mando' });
  b.wire([0, 1], [10, 1], [10, 2]);
  b.wire([6, 0], [12, 0], [12, 2]);
}

/** Barras del circuito de mando: L (y=7), L' tras KA1 (y=12) y N (y=40). */
function controlRails(b, xEnd) {
  b.add('label', 16, -5, { text: 'MANDO 230 V', size: 16 });
  b.wire([10, 5], [10, 7], [xEnd, 7]);
  b.wire([12, 5], [12, 40], [xEnd, 40]);
  // Marcha / paro general con autoenclavamiento (KA1).
  const r = b.series(16, 7, [
    { type: 'pb_nc', in: '1', out: '2', ref: 's0', props: { tag: 'S0', name: 'Paro' } },
    { type: 'pb_no', in: '3', out: '4', ref: 's1', props: { tag: 'S1', name: 'Marcha' } },
    { ...coil('KA1', 'Maniobra'), ref: 'ka' },
  ], 40);
  const k = b.add('c_no', 19, 12, { tag: 'KA1' });
  b.wire(b.t(r.s0, '2'), [19, 11], b.t(k, '13'));
  b.wire(b.t(k, '14'), [19, 16], b.t(r.ka, 'A1'));
  b.wire([19, 16], [19, 17]);
  b.add('lamp', 19, 17, { tag: 'H0', name: 'Servicio', color: 'verde' });
  b.wire([19, 20], [19, 40]);
  // L' (tensión tras KA1).
  b.add('c_no', 23, 8, { tag: 'KA1' });
  b.wire([23, 7], [23, 8]);
  b.wire([23, 11], [23, 12], [xEnd, 12]);
}

function cameraPositive() {
  const b = new Builder();
  powerCircuit(b);
  const X = 70;
  controlRails(b, X);

  // Compresor: seguridades + reloj + termostato → KM1.
  const c = b.series(27, 12, [
    { type: 'th_nc', in: '95', out: '96', props: { tag: 'F1' } },
    { type: 'pressostat', in: 'C', out: 'NC', ref: 'pa', props: { tag: 'PA', name: 'Alta', kind: 'alta', cut: 27, diff: 4, reset: 'manual' } },
    { type: 'pressostat', in: 'C', out: 'NC', props: { tag: 'PB', name: 'Baja', kind: 'baja', cut: 1, diff: 1.5, reset: 'auto' } },
    { type: 'clk_c', in: 'C', out: 'F', props: { tag: 'RD1' } },
    { type: 'thermostat', in: 'C', out: 'NC', props: { tag: 'TH1', name: 'Cámara', probe: 'camara', mode: 'frio', sp: 2, diff: 2 } },
    coil('KM1', 'Compresor'),
  ], 40);
  // Alarma de alta presión por el NA del presostato.
  b.wire(b.t(c.pa, 'NA'), [33, 20], [33, 21]);
  b.add('lamp', 33, 21, { tag: 'H2', name: 'Alarma AP', color: 'rojo' });
  b.wire([33, 24], [33, 40]);

  // Ventilador del condensador (con el compresor) + piloto.
  b.series(38, 12, [NA('KM1'), { type: 'motor1', in: '1', out: '2', props: { tag: 'M2', name: 'Vent. cond.', func: 'vent_cond', In: 0.8 } }], 40);
  b.wire([38, 16], [41, 16], [41, 17]);
  b.add('lamp', 41, 17, { tag: 'H1', name: 'Compresor', color: 'verde' });
  b.wire([41, 20], [41, 40]);

  // Ventilador del evaporador: se para al abrir la puerta.
  b.series(46, 12, [
    { type: 'door_nc', in: '1', out: '2', props: { tag: 'SQ1', name: 'Puerta' } },
    { type: 'motor1', in: '1', out: '2', props: { tag: 'M3', name: 'Vent. evap.', func: 'vent_evap', In: 0.5 } },
  ], 40);
  // Luz de la cámara: se enciende al abrir la puerta.
  b.series(52, 12, [
    { type: 'door_no', in: '3', out: '4', props: { tag: 'SQ1', name: 'Puerta' } },
    { type: 'lamp', in: 'X1', out: 'X2', props: { tag: 'H4', name: 'Luz cámara', color: 'blanco', func: 'luz' } },
  ], 40);
  // Reloj de desescarche (por parada: solo corta el compresor).
  b.series(57, 12, [{ type: 'clock', in: 'A1', out: 'A2', props: { tag: 'RD1', name: 'Reloj', interval: 6, duration: 25, first: 60 } }], 40);
  b.series(63, 12, [
    { type: 'clk_c', in: 'C', out: 'D', props: { tag: 'RD1' } },
    { type: 'lamp', in: 'X1', out: 'X2', props: { tag: 'H3', name: 'Desescarche', color: 'amarillo' } },
  ], 40);
  // Aviso de disparo del térmico.
  b.series(69, 12, [
    { type: 'th_no', in: '97', out: '98', props: { tag: 'F1' } },
    { type: 'lamp', in: 'X1', out: 'X2', props: { tag: 'H5', name: 'Térmico', color: 'rojo' } },
  ], 40);

  return b.project({
    name: 'Cámara de conservación +2 °C',
    description:
      'Cámara positiva con R404A y válvula de expansión termostática. Pulsa S1 (Marcha) para poner en servicio. ' +
      'El termostato TH1 manda el compresor; el presostato de alta y el relé térmico lo protegen. ' +
      'Al abrir la puerta (SQ1) se para el ventilador del evaporador y se enciende la luz. ' +
      'El reloj RD1 hace desescarches por parada (solo corta el compresor; el ventilador sigue fundiendo el hielo).',
    refrig: { enabled: true, refrigerant: 'R404A', capacityKW: 2.5, expansion: 'txv', Tamb: 30, TroomInit: 8 },
  });
}

function cameraFreezer() {
  const b = new Builder();
  powerCircuit(b, { Iset: 6.5 });
  const X = 80;
  controlRails(b, X);

  // Solenoide: reloj (frío) + termostato → YV1 (recogida de gas / pump-down).
  b.series(27, 12, [
    { type: 'clk_c', in: 'C', out: 'F', props: { tag: 'RD1' } },
    { type: 'thermostat', in: 'C', out: 'NC', props: { tag: 'TH1', name: 'Cámara', probe: 'camara', mode: 'frio', sp: -20, diff: 2 } },
    { type: 'solenoid', in: 'A1', out: 'A2', props: { tag: 'YV1', name: 'Solenoide', func: 'solenoide' } },
  ], 40);

  // Compresor: térmico + alta + baja (la baja lo para al recoger el gas).
  const c = b.series(35, 12, [
    { type: 'th_nc', in: '95', out: '96', props: { tag: 'F1' } },
    { type: 'pressostat', in: 'C', out: 'NC', ref: 'pa', props: { tag: 'PA', name: 'Alta', kind: 'alta', cut: 27, diff: 4, reset: 'manual' } },
    { type: 'pressostat', in: 'C', out: 'NC', props: { tag: 'PB', name: 'Baja', kind: 'baja', cut: 0, diff: 1.5, reset: 'auto' } },
    coil('KM1', 'Compresor'),
  ], 40);
  b.wire(b.t(c.pa, 'NA'), [40, 20], [40, 21]);
  b.add('lamp', 40, 21, { tag: 'H2', name: 'Alarma AP', color: 'rojo' });
  b.wire([40, 24], [40, 40]);

  // Ventilador del condensador con el compresor.
  b.series(44, 12, [NA('KM1'), { type: 'motor1', in: '1', out: '2', props: { tag: 'M2', name: 'Vent. cond.', func: 'vent_cond', In: 0.8 } }], 40);

  // Ventiladores del evaporador: reloj (frío) + retardo + puerta.
  b.series(51, 12, [
    { type: 'clk_c', in: 'C', out: 'F', props: { tag: 'RD1' } },
    { type: 'thermostat', in: 'C', out: 'NC', props: { tag: 'TV', name: 'Retardo vent.', probe: 'evaporador', mode: 'calor', sp: -2, diff: 3 } },
    { type: 'door_nc', in: '1', out: '2', props: { tag: 'SQ1', name: 'Puerta' } },
    { type: 'motor1', in: '1', out: '2', props: { tag: 'M3', name: 'Vent. evap.', func: 'vent_evap', In: 0.6 } },
  ], 40);

  // Desescarche eléctrico: reloj (desescarche) → resistencias + piloto.
  b.series(58, 12, [
    { type: 'clk_c', in: 'C', out: 'D', props: { tag: 'RD1' } },
    { type: 'heater', in: '1', out: '2', props: { tag: 'R1', name: 'Resist. desesc.', func: 'desescarche' } },
  ], 40);
  b.wire([60, 16], [63, 16], [63, 17]);
  b.add('lamp', 63, 17, { tag: 'H3', name: 'Desescarche', color: 'amarillo' });
  b.wire([63, 20], [63, 40]);

  // Reloj + termostato de fin de desescarche en el borne X.
  b.series(67, 12, [{ gap: 7 }, { type: 'clock', in: 'A1', out: 'A2', props: { tag: 'RD1', name: 'Reloj', interval: 6, duration: 30, first: 40 } }], 40);
  b.series(75, 12, [{ type: 'thermostat', in: 'C', out: 'NC', props: { tag: 'TFD', name: 'Fin desesc.', probe: 'evaporador', mode: 'frio', sp: 5, diff: 5 } }]);
  b.wire([75, 16], [75, 18], [69, 18], [69, 20]);

  // Térmico disparado.
  b.series(79, 12, [
    { type: 'th_no', in: '97', out: '98', props: { tag: 'F1' } },
    { type: 'lamp', in: 'X1', out: 'X2', props: { tag: 'H5', name: 'Térmico', color: 'rojo' } },
  ], 40);

  return b.project({
    name: 'Congelados −20 °C con pump-down',
    description:
      'Cámara de congelación con recogida de gas (pump-down): el termostato TH1 abre/cierra la solenoide YV1 y es el ' +
      'presostato de baja PB quien arranca y para el compresor. Desescarche eléctrico con reloj RD1, fin por ' +
      'termostato TFD (+10 °C en la batería) y retardo de ventiladores TV para no soplar agua ni aire caliente. Pulsa S1 (Marcha).',
    refrig: {
      enabled: true, refrigerant: 'R404A', capacityKW: 6, expansion: 'txv', Tamb: 30, TroomInit: -14,
      roomUA: 0.03, airMass: 90, productMass: 400, heaterKW: 3,
    },
  });
}

function fridgeCapillary() {
  const b = new Builder();
  b.add('label', 0, -5, { text: 'ARMARIO FRIGORÍFICO 230 V', size: 16 });
  b.add('supply1', 0, 0);
  b.add('mcb2', 0, 2, { tag: 'Q1', In: 10 });
  b.wire([0, 0], [0, 2]);
  b.wire([2, 0], [2, 2]);
  b.wire([0, 5], [0, 7], [28, 7]);
  b.wire([2, 5], [2, 24], [28, 24]);
  // Termostato → compresor y ventilador del condensador en paralelo.
  b.series(10, 7, [
    { type: 'thermostat', in: 'C', out: 'NC', props: { tag: 'TH1', name: 'Termostato', probe: 'camara', mode: 'frio', sp: 3, diff: 3 } },
    { type: 'motor1', in: '1', out: '2', props: { tag: 'M1', name: 'Compresor', func: 'compresor' } },
  ], 24);
  b.wire([10, 12], [16, 12]);
  b.add('motor1', 16, 12, { tag: 'M2', name: 'Vent. cond.', func: 'vent_cond', In: 0.3 });
  b.wire([16, 15], [16, 24]);
  b.series(21, 7, [
    { type: 'door_nc', in: '1', out: '2', props: { tag: 'SQ1', name: 'Puerta' } },
    { type: 'motor1', in: '1', out: '2', props: { tag: 'M3', name: 'Vent. evap.', func: 'vent_evap', In: 0.2 } },
  ], 24);
  b.series(26, 7, [
    { type: 'door_no', in: '3', out: '4', props: { tag: 'SQ1', name: 'Puerta' } },
    { type: 'lamp', in: 'X1', out: 'X2', props: { tag: 'H1', name: 'Luz', color: 'blanco', func: 'luz' } },
  ], 24);
  return b.project({
    name: 'Armario frigorífico (R134a, capilar)',
    description:
      'Equipo sencillo monofásico: el termostato arranca directamente el compresor y el ventilador del condensador. ' +
      'Expansión por tubo capilar: al parar, las presiones se igualan. La puerta para el ventilador interior y enciende la luz.',
    refrig: {
      enabled: true, refrigerant: 'R134a', capacityKW: 0.8, expansion: 'capilar', Tamb: 25, TroomInit: 18,
      roomUA: 0.012, airMass: 20, productMass: 60, doorUA: 0.08, internalKW: 0.02, heaterKW: 0.3,
    },
  });
}

function motorStartStop() {
  const b = new Builder();
  b.add('label', 0, -5, { text: 'ARRANQUE DIRECTO CON MARCHA-PARO', size: 16 });
  b.add('supply3', 0, 0);
  b.add('mcb3', 0, 2, { tag: 'Q1', In: 16 });
  for (const x of [0, 2, 4]) b.wire([x, 0], [x, 2]);
  b.add('c_main3', 0, 7, { tag: 'KM1' });
  for (const x of [0, 2, 4]) b.wire([x, 5], [x, 7]);
  b.add('thermal3', 0, 12, { tag: 'F1', Iset: 2.5 });
  for (const x of [0, 2, 4]) b.wire([x, 10], [x, 12]);
  b.add('motor3', 0, 17, { tag: 'M1', In: 2.2 });
  for (const x of [0, 2, 4]) b.wire([x, 15], [x, 17]);
  b.add('mcb2', 10, 2, { tag: 'Q2', In: 6 });
  b.wire([0, 1], [10, 1], [10, 2]);
  b.wire([6, 0], [12, 0], [12, 2]);
  b.wire([10, 5], [10, 7], [26, 7]);
  b.wire([12, 5], [12, 30], [26, 30]);
  const r = b.series(16, 7, [
    { type: 'th_nc', in: '95', out: '96', props: { tag: 'F1' } },
    { type: 'pb_nc', in: '1', out: '2', ref: 's0', props: { tag: 'S0', name: 'Paro' } },
    { type: 'pb_no', in: '3', out: '4', ref: 's1', props: { tag: 'S1', name: 'Marcha' } },
    { ...coil('KM1'), ref: 'km' },
  ], 30);
  const k = b.add('c_no', 19, 16, { tag: 'KM1' });
  b.wire(b.t(r.s0, '2'), [19, 15], b.t(k, '13'));
  b.wire(b.t(k, '14'), [19, 20], b.t(r.km, 'A1'));
  b.series(24, 7, [NA('KM1'), { type: 'lamp', in: 'X1', out: 'X2', props: { tag: 'H1', name: 'Marcha', color: 'verde' } }], 30);
  return b.project({
    name: 'Marcha-paro de un motor (solo eléctrico)',
    description: 'Esquema clásico de CADe SIMU sin circuito frigorífico: pulsa S1 para arrancar y S0 para parar. Prueba a quitar un fusible… o a provocar un cortocircuito.',
    refrig: { enabled: false },
  });
}

export const EXAMPLES = [
  { id: 'positiva', build: cameraPositive },
  { id: 'congelados', build: cameraFreezer },
  { id: 'armario', build: fridgeCapillary },
  { id: 'motor', build: motorStartStop },
];

export function exampleList() {
  return EXAMPLES.map((e) => ({ id: e.id, name: e.build().name }));
}

export function buildExample(id) {
  const e = EXAMPLES.find((x) => x.id === id) || EXAMPLES[0];
  return e.build();
}
