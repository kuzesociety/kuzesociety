// Diagnóstico de una máquina real a partir de sus lecturas.
//
// Con el refrigerante y las presiones se calculan las temperaturas de
// saturación (rocío en baja, burbuja en alta). Con las temperaturas de
// tubería y de aire se obtienen recalentamiento, subenfriamiento y saltos
// térmicos. Cada lectura se clasifica (muy baja … muy alta) según el tipo de
// instalación y se compara con la "firma" típica de cada avería.

import { getRefrigerant, absolute, tsatDew, tsatBubble, psatDew, psatBubble, compression } from './refrig/refrigerants.js';

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(+v) ? null : +v);

export const APPS = {
  positiva: { label: 'Cámara de conservación (0 a +8 °C)', room: [-2, 10], TD: [6, 12], Te: [-15, -2] },
  negativa: { label: 'Cámara de congelados (−18 a −25 °C)', room: [-28, -15], TD: [5, 9], Te: [-38, -24] },
  clima: { label: 'Aire acondicionado (modo frío)', room: [20, 30], TD: [12, 22], Te: [0, 12] },
  domestica: { label: 'Nevera, arcón o botellero', room: [-22, 8], TD: [8, 20], Te: [-32, -8] },
  otra: { label: 'Otra instalación', room: null, TD: [5, 15], Te: null },
};

export const EXPANSIONS = {
  txv: 'Válvula termostática (VET)',
  electronica: 'Válvula electrónica (VEE)',
  capilar: 'Tubo capilar',
};

const SH_BAND = { txv: [4, 9, 2, 14], electronica: [3, 8, 1.5, 12], capilar: [2, 12, 0.8, 18] };

function level(v, lo, hi, vlo, vhi) {
  if (v === null) return null;
  if (v < vlo) return -2;
  if (v < lo) return -1;
  if (v > vhi) return 2;
  if (v > hi) return 1;
  return 0;
}

const LEVEL_TXT = { '-2': 'muy bajo', '-1': 'bajo', 0: 'normal', 1: 'alto', 2: 'muy alto' };

// ------------------------------------------------------------ averías
// sig: nivel esperado de cada variable (lista) y peso.
// obs(o): pruebas por observación → [{w, text}] (w > 0 a favor, < 0 en contra).
const FAULTS = [
  {
    id: 'fuga',
    name: 'Falta de refrigerante (fuga)',
    prior: 1,
    sig: { LP: [[-1, -2], 2], HP: [[-1, 0], 1], SH: [[1, 2], 3], SC: [[-1, -2], 2.5], amps: [[-1, 0], 0.8], Tdis: [[1, 2], 0.8] },
    obs: (o) => [
      o.sight === 'burbujas' && { w: 3, text: 'Burbujas en el visor: llega gas mezclado con el líquido.' },
      o.sight === 'vacio' && { w: 3, text: 'El visor no muestra líquido.' },
      o.sight === 'lleno' && { w: -2, text: 'El visor está lleno (con falta de gas suele tener burbujas).' },
      o.ice === 'entrada' && { w: 2, text: 'Solo escarcha la entrada del evaporador: el refrigerante se evapora enseguida.' },
      o.comp === 'pb' && { w: 1.2, text: 'Para por presostato de baja.' },
      o.oil && { w: 1.5, text: 'Hay manchas de aceite en alguna unión.' },
    ],
    what: 'Falta refrigerante en el circuito. Al evaporador llega poco líquido, así que se evapora enseguida y el vapor sale muy recalentado; la presión de baja cae. En el condensador apenas queda líquido y no hay subenfriamiento.',
    checks: [
      'Visor: burbujas continuas o sin líquido.',
      'Recalentamiento alto (> 10 K) con subenfriamiento casi nulo (< 2 K).',
      'Busca manchas de aceite en uniones, llaves de servicio y visor.',
      'No recargues sin encontrar y reparar la fuga.',
    ],
    fix: ['Localizar y reparar la fuga', 'Cambiar el filtro deshidratador', 'Hacer vacío y cargar por peso (mezclas en fase líquida)'],
    leak: true,
    sim: { faults: { chargePct: 42 } },
  },
  {
    id: 'exceso',
    name: 'Exceso de carga de refrigerante',
    prior: 0.5,
    sig: { LP: [[0, 1], 1], HP: [[1, 2], 2.5], SH: [[0, -1], 1], SC: [[1, 2], 3], amps: [[1, 0], 1] },
    obs: (o) => [
      o.sight === 'lleno' && { w: 0.5, text: 'Visor lleno.' },
      o.recent && { w: 1.5, text: 'Se ha cargado refrigerante hace poco.' },
      o.standstill && o.standstill.excess > 0.5 && { w: -3, text: 'En parado la presión supera la de saturación: eso apunta a incondensables, no a exceso de carga.' },
      o.sight === 'burbujas' && { w: -2, text: 'Burbujas en el visor: no parece que sobre refrigerante.' },
    ],
    what: 'Sobra refrigerante: el líquido que no cabe en el recipiente inunda el condensador, se reduce la superficie para condensar, sube la presión de alta y el subenfriamiento es muy alto.',
    checks: ['Subenfriamiento alto (> 10 K) con presión de alta elevada.', 'Condensador limpio y ventilador bien (descarta condensación deficiente).', 'Comprueba la carga de la placa.'],
    fix: ['Recuperar refrigerante poco a poco hasta subenfriamiento normal (4–6 K)'],
    sim: { faults: { chargePct: 135 } },
  },
  {
    id: 'restriccion',
    name: 'Restricción en la línea de líquido (filtro obstruido)',
    prior: 0.6,
    sig: { LP: [[-1, -2], 2], HP: [[0, -1], 1], SH: [[1, 2], 3], SC: [[0, 1, 2], 2], amps: [[-1, 0], 0.5] },
    obs: (o) => [
      o.filterDT !== null && o.filterDT >= 2 && { w: 3.5, text: `Caída de temperatura en el filtro de ${fmt(o.filterDT)} K: está frenando el paso.` },
      o.filterDT !== null && o.filterDT < 1 && { w: -2, text: 'Sin caída de temperatura en el filtro.' },
      o.filterCold && { w: 3, text: 'El filtro está frío, sudando o escarchado a la salida.' },
      o.sight === 'burbujas' && { w: 0.8, text: 'Burbujas en el visor (se forma gas tras la restricción).' },
    ],
    what: 'Algo frena el paso del líquido antes de la válvula de expansión (filtro deshidratador sucio, llave semicerrada, tubo pinzado). El evaporador se queda sin refrigerante como en una fuga, pero el líquido se acumula antes de la restricción y el subenfriamiento es normal o alto.',
    checks: ['Mide la temperatura antes y después del filtro: más de 2 K de diferencia indica obstrucción.', 'Revisa llaves de servicio de líquido y tubos aplastados.', 'Subenfriamiento normal o alto distingue esta avería de una fuga.'],
    fix: ['Sustituir el filtro deshidratador', 'Abrir la llave de líquido / corregir el tubo'],
    sim: { faults: { filterClog: 0.75 } },
  },
  {
    id: 'vet_cerrada',
    name: 'Válvula de expansión que alimenta poco',
    prior: 0.55,
    only: ['txv', 'electronica'],
    sig: { LP: [[-1, -2], 2], HP: [[0, -1], 1], SH: [[1, 2], 3], SC: [[0, 1], 2], amps: [[-1, 0], 0.5] },
    obs: (o) => [
      o.sight === 'lleno' && { w: 1.5, text: 'Visor lleno: el líquido llega bien hasta la válvula.' },
      o.filterDT !== null && o.filterDT < 1 && { w: 1, text: 'Sin caída de temperatura en el filtro.' },
      o.filterDT !== null && o.filterDT >= 2 && { w: -2.5, text: 'El filtro tiene caída de temperatura: el problema está antes de la válvula.' },
      o.sight === 'burbujas' && { w: -1.5, text: 'Burbujas en el visor: el líquido ya llega mal a la válvula.' },
      o.txvFrost && { w: 2, text: 'La válvula escarcha o hace ruido a la salida (trabaja casi cerrada).' },
    ],
    what: 'La válvula deja pasar menos refrigerante del necesario: bulbo descargado o mal colocado, orificio o filtro de la válvula sucio, ajuste de recalentamiento excesivo o igualación externa mal conectada.',
    checks: ['Visor lleno y subenfriamiento normal, pero recalentamiento alto.', 'Revisa el bulbo: bien sujeto, en posición 4 u 8 h, aislado.', 'Tubo de igualación externa conectado después del bulbo.', 'Calienta el bulbo con la mano: si la presión de baja no sube, el bulbo ha perdido la carga.'],
    fix: ['Recolocar o aislar el bulbo', 'Ajustar el recalentamiento', 'Limpiar el filtro de la válvula o cambiar el elemento termostático/orificio'],
    sim: { faults: { txv: 'cerrada' } },
  },
  {
    id: 'capilar',
    name: 'Tubo capilar parcialmente obstruido',
    prior: 0.55,
    only: ['capilar'],
    sig: { LP: [[-1, -2], 2.5], HP: [[0, -1], 1], SH: [[1, 2], 3], SC: [[1, 2, 0], 1.5], amps: [[-1], 0.5] },
    obs: (o) => [
      o.sight === 'lleno' && { w: 0.5, text: 'Líquido suficiente antes del capilar.' },
      o.filterCold && { w: 2, text: 'El filtro o la entrada del capilar están fríos o escarchados.' },
    ],
    what: 'El capilar deja pasar poco refrigerante (suciedad, humedad congelada, cera del aceite o un pinzamiento). La baja cae mucho y el evaporador se queda casi sin escarcha.',
    checks: ['La baja puede llegar a vacío.', 'Tras parar, las presiones tardan mucho en igualarse.', 'Escarcha o sudor en el filtro/entrada del capilar.'],
    fix: ['Sustituir filtro y capilar (o desatascar con bomba de presión)', 'Vacío profundo'],
    sim: { faults: { filterClog: 0.75 }, expansion: 'capilar' },
  },
  {
    id: 'vet_abierta',
    name: 'Válvula de expansión que alimenta de más (retorno de líquido)',
    prior: 0.45,
    only: ['txv', 'electronica'],
    sig: { LP: [[1, 0], 1], HP: [[0], 0.5], SH: [[-1, -2], 3.5], SC: [[0, -1], 1], amps: [[1, 0], 0.5] },
    obs: (o) => [
      o.ice === 'aspiracion' && { w: 3, text: 'La línea de aspiración escarcha hasta el compresor: vuelve líquido.' },
      o.bulbLoose && { w: 2.5, text: 'El bulbo está suelto o sin aislar.' },
    ],
    what: 'La válvula deja pasar más refrigerante del que el evaporador puede evaporar. Sale líquido por la aspiración y puede romper las válvulas del compresor (golpe de líquido).',
    checks: ['Recalentamiento casi nulo (< 2 K).', 'Aspiración fría o escarchada hasta el compresor.', 'Bulbo suelto, sin aislar o en mal sitio.', 'Ajuste de recalentamiento demasiado bajo.'],
    fix: ['Sujetar y aislar el bulbo', 'Subir el ajuste de recalentamiento', 'Revisar que la válvula no esté atascada abierta'],
    sim: { faults: { txv: 'abierta' } },
  },
  {
    id: 'condensacion',
    name: 'Condensación deficiente (condensador sucio o poco aire)',
    prior: 0.9,
    sig: { HP: [[1, 2], 3.5], LP: [[0, 1], 1], SH: [[0], 0.5], SC: [[0, -1], 1], amps: [[1, 2], 1], Tdis: [[1, 2], 1] },
    obs: (o) => [
      o.condFan === 'parado' && { w: 3.5, text: 'El ventilador del condensador está parado.' },
      o.condFan === 'ok' && { w: 0, text: '' },
      o.comp === 'pa' && { w: 2, text: 'Dispara el presostato de alta.' },
      o.condDirty && { w: 3, text: 'El condensador está visiblemente sucio u obstruido.' },
    ],
    what: 'El condensador no puede echar el calor: suciedad en las aletas, ventilador parado o lento, aire caliente recirculando o unidad al sol. Sube la temperatura de condensación, la alta, la intensidad y la temperatura de descarga.',
    checks: ['Salto de condensación (condensación − aire exterior) mayor de 18–20 K.', 'Ventilador: gira, sentido correcto, condensador de marcha, aspas.', 'Aletas limpias; la unidad no recircula su propio aire caliente.'],
    fix: ['Limpiar el condensador', 'Reparar el ventilador', 'Mejorar la ventilación de la unidad'],
    sim: { faults: { condDirt: 0.85 } },
  },
  {
    id: 'incondensables',
    name: 'Aire o incondensables en el circuito',
    prior: 0.4,
    sig: { HP: [[1, 2], 3], SC: [[1, 2, 0], 1], LP: [[0, 1], 0.5], Tdis: [[1, 2], 1], amps: [[1], 0.5] },
    obs: (o) => [
      o.standstill && o.standstill.excess > 0.5 && { w: 5, text: `En parado la presión (${fmt(o.standstill.P)} bar) supera en ${fmt(o.standstill.excess)} bar la de saturación a ${fmt(o.standstill.T)} °C: hay gases que no condensan.` },
      o.standstill && o.standstill.excess <= 0.3 && o.standstill.excess >= -0.5 && { w: -4, text: 'En parado la presión coincide con la de saturación: no hay incondensables.' },
      o.condDirty && { w: -1.5, text: 'El condensador está sucio (explica la alta sin necesidad de incondensables).' },
      o.recent && { w: 1, text: 'Hubo una intervención reciente (vacío mal hecho).' },
    ],
    what: 'Entró aire o nitrógeno (vacío insuficiente, fuga en la baja trabajando en vacío). Esos gases ocupan el condensador y suman su presión: la alta es mayor que la que corresponde a la temperatura de condensación.',
    checks: ['Prueba en parado: con la máquina parada horas y todo a temperatura ambiente, la presión debe coincidir con la de saturación a esa temperatura.', 'Alta elevada con el condensador limpio y el ventilador bien.'],
    fix: ['Recuperar el refrigerante', 'Cambiar el filtro', 'Vacío profundo (< 5 mbar) y carga nueva por peso'],
    sim: { faults: { nonCondensables: true } },
  },
  {
    id: 'evaporador',
    name: 'Poco aire en el evaporador (ventilador, hielo o suciedad)',
    prior: 0.85,
    sig: { LP: [[-1, -2], 2.5], SH: [[0, -1], 2], SC: [[0], 0.5], HP: [[0, -1], 1], amps: [[-1, 0], 0.5] },
    obs: (o) => [
      o.evapFan === 'parado' && { w: 4, text: 'El ventilador del evaporador está parado.' },
      o.ice === 'bloqueado' && { w: 4, text: 'La batería está bloqueada por el hielo.' },
      o.ice === 'no' && { w: -0.5, text: 'La batería no tiene hielo.' },
      o.TDhigh && { w: 1.5, text: 'El salto térmico del evaporador es muy grande.' },
    ],
    what: 'El aire no pasa bien por el evaporador (ventilador parado, batería helada por falta de desescarche, filtros o aletas sucias). Entra poco calor al refrigerante: la baja cae, la batería se escarcha más y la cámara no llega a temperatura. El recalentamiento se mantiene o baja.',
    checks: ['Salto térmico del evaporador grande con recalentamiento normal o bajo.', 'Ventiladores del evaporador: giran, retardo de ventiladores, final de carrera de puerta.', 'Desescarches: reloj, resistencias, termostato de fin de desescarche.'],
    fix: ['Reparar el ventilador', 'Hacer un desescarche y revisar por qué no desescarchaba', 'Limpiar la batería'],
    sim: { faults: { evapFanBroken: true } },
  },
  {
    id: 'compresor',
    name: 'Compresor ineficiente (válvulas o segmentos)',
    prior: 0.45,
    sig: { LP: [[1, 2], 3], HP: [[-1, -2], 3], SH: [[0, 1], 0.5], SC: [[0, -1], 0.5], amps: [[-1, 0], 1.5], Tdis: [[1, 2], 0.5] },
    obs: (o) => [
      o.pr !== null && o.pr < 2.2 && o.app !== 'clima' && { w: 1.5, text: `Relación de compresión muy baja (${fmt(o.pr)}).` },
      o.equalizeFast && { w: 2, text: 'Al parar, las presiones se igualan enseguida.' },
      o.noCool && { w: 1, text: 'La instalación no llega a temperatura.' },
    ],
    what: 'El compresor no bombea bien (válvulas de láminas rotas, segmentos gastados, junta de culata): parte del gas vuelve de la alta a la baja. La baja queda alta, la alta baja, la intensidad baja y no enfría.',
    checks: ['Baja alta y alta baja a la vez, con poca intensidad.', 'Al parar, las presiones se igualan casi al instante.', 'Prueba de bombeo: cierra la llave de aspiración y mira cuánto vacío hace (un compresor sano baja a vacío en segundos).'],
    fix: ['Cambiar las placas de válvulas (semihermético) o el compresor (hermético)'],
    sim: { faults: { compValves: true } },
  },
  {
    id: 'carga_termica',
    name: 'Mucha carga térmica (cámara caliente o recién cargada)',
    prior: 0.6,
    sig: { LP: [[1, 2], 2], HP: [[1, 0], 1], SH: [[1, 0], 1], SC: [[0], 0.5], amps: [[1, 2], 1] },
    obs: (o) => [
      o.roomHot && { w: 3, text: 'La cámara está bastante por encima de su temperatura normal.' },
      o.recentLoad && { w: 2, text: 'Se ha metido género caliente o la puerta ha estado abierta.' },
      o.roomKnown === false && { w: -1, text: 'Falta la temperatura de la cámara para confirmarlo.' },
      o.roomKnown && !o.roomHot && { w: -2, text: 'La cámara no está caliente.' },
    ],
    what: 'No es una avería: con la cámara caliente, el evaporador recibe mucho calor y todo trabaja más alto (baja, alta e intensidad). Debe ir bajando a medida que la cámara se enfría.',
    checks: ['Espera y comprueba que la baja va bajando junto con la temperatura de la cámara.', 'Revisa puertas, burletes y la cantidad de género.'],
    fix: ['Nada si evoluciona bien; revisar aislamiento y puertas si no'],
    sim: { roomHot: true },
  },
  {
    id: 'baja_condensacion',
    name: 'Presión de alta demasiado baja (exterior frío)',
    prior: 0.4,
    sig: { HP: [[-1, -2], 3], LP: [[-1, 0], 1], SH: [[1, 0], 1], SC: [[0, 1, 2], 0.5] },
    obs: (o) => [
      o.Tamb !== null && o.Tamb < 12 && { w: 3, text: `Exterior frío (${fmt(o.Tamb)} °C).` },
      o.Tamb !== null && o.Tamb > 22 && { w: -2, text: 'El exterior no está frío.' },
      o.Tamb === null && { w: -1.5, text: 'Falta la temperatura exterior para confirmarlo.' },
    ],
    what: 'Con el exterior frío el condensador condensa demasiado bajo. Hay poca diferencia de presión en la válvula de expansión, que deja pasar poco refrigerante: la baja cae y el recalentamiento sube.',
    checks: ['Alta muy baja con aire exterior frío.', 'Falta regulación de condensación (presostato de ventilador, variador o válvula de presión de condensación).'],
    fix: ['Instalar o ajustar la regulación de presión de condensación'],
    sim: { params: { Tamb: 4 } },
  },
  {
    id: 'solenoide',
    name: 'Solenoide de líquido que no abre',
    prior: 0.3,
    sig: { LP: [[-2], 3], SH: [[2, 1], 2], HP: [[0, -1], 0.5], SC: [[0, 1, 2], 1.5] },
    obs: (o) => [
      o.comp === 'pb' && { w: 2, text: 'El compresor para por presostato de baja.' },
      o.comp === 'ciclos' && { w: 1.5, text: 'El compresor hace ciclos cortos.' },
      o.solenoid === 'si' && { w: 1.5, text: 'La instalación tiene válvula solenoide.' },
      o.solenoid === 'no' && { w: -5, text: 'La instalación no tiene válvula solenoide.' },
      (o.comp === 'marcha' || o.comp === '') && { w: -2, text: 'El compresor funciona en continuo: con la solenoide cerrada pararía por el presostato de baja.' },
    ],
    what: 'La válvula solenoide de la línea de líquido no abre (bobina quemada, sin tensión, termostato que no la alimenta): el compresor vacía el evaporador y para por baja.',
    checks: ['¿Tiene tensión la bobina? ¿Se nota el campo magnético con un destornillador?', 'Termostato y reloj que la alimentan.', 'Diferencia de temperatura antes y después de la solenoide.'],
    fix: ['Cambiar la bobina o revisar su alimentación'],
    sim: { faults: { solenoidStuck: true }, example: 'congelados' },
  },
  {
    id: 'humedad',
    name: 'Humedad en el circuito (tapón de hielo en la válvula)',
    prior: 0.25,
    sig: { LP: [[-1, -2], 1], SH: [[1, 2], 1] },
    obs: (o) => [
      o.sight === 'humedad' && { w: 4, text: 'El indicador de humedad del visor está en amarillo/rosa.' },
      o.comp === 'ciclos' && { w: 1, text: 'Funciona a ratos (se tapona y se destapona).' },
      o.intermittent && { w: 2.5, text: 'La baja cae y se recupera al calentar la válvula.' },
      !(o.sight === 'humedad' || o.intermittent || o.comp === 'ciclos') && { w: -1.5, text: 'No hay indicios de humedad (visor, funcionamiento a ratos).' },
    ],
    what: 'Hay humedad en el circuito: se congela en el orificio de la válvula o del capilar y lo va taponando a ratos. Además forma ácidos que dañan el compresor.',
    checks: ['Indicador de humedad del visor.', 'Calentar la válvula con un trapo caliente: si la baja sube de golpe, había hielo.'],
    fix: ['Recuperar, cambiar el filtro (sobredimensionado si hace falta), vacío profundo y carga nueva'],
    sim: null,
  },
];

const NEXT = {
  LP: 'Coloca el manómetro de baja (en la toma de aspiración) para conocer la presión y la temperatura de evaporación.',
  HP: 'Coloca el manómetro de alta para conocer la presión y la temperatura de condensación.',
  SH: 'Mide la temperatura de la tubería de aspiración a la salida del evaporador (junto al bulbo) para calcular el recalentamiento.',
  SC: 'Mide la temperatura de la tubería de líquido a la salida del condensador o del recipiente para calcular el subenfriamiento.',
  TD: 'Mide la temperatura del aire que entra al evaporador para conocer el salto térmico.',
  Tamb: 'Mide la temperatura del aire que entra al condensador.',
  amps: 'Mide la intensidad del compresor con la pinza y compárala con la de la placa.',
  Tdis: 'Mide la temperatura de la tubería de descarga a unos 15 cm del compresor.',
  sight: 'Mira el visor de líquido: ¿lleno, con burbujas o con el indicador de humedad cambiado?',
  standstill: 'Prueba en parado: con la máquina parada unas horas y todo a la temperatura ambiente, anota la presión y la temperatura del ambiente.',
  filterDT: 'Toca o mide el filtro deshidratador a la entrada y a la salida: si la salida está más fría (más de 2 K) o suda, está obstruido.',
};

/** Lista de dónde y cómo buscar una fuga (para mostrar cuando la fuga es probable). */
export const LEAK_GUIDE = {
  where: [
    'Obuses (válvulas Schrader) de las tomas de servicio y sus tapones: pon siempre los tapones con junta.',
    'Uniones abocardadas (flare): válvula de expansión, visor, filtro, llaves de servicio y conexiones de los splits.',
    'Prensaestopas y vástagos de las llaves de servicio.',
    'Capilares de presostatos y manómetros que rozan o vibran.',
    'Soldaduras y curvas del condensador (vibraciones) y del evaporador (corrosión, productos de limpieza).',
    'Juntas del compresor semihermético (tapa de válvulas, visor de aceite) y antivibratorios.',
    'Tubería que roza en pasamuros, soportes o carrocería.',
  ],
  how: [
    'Busca manchas de aceite: suelen marcar el sitio de la fuga.',
    'Detector electrónico despacio (2–3 cm/s) y por debajo de las uniones: los HFC pesan más que el aire. Con A2L y A3 usa un detector compatible.',
    'Espuma o agua jabonosa en las uniones sospechosas.',
    'Si no aparece: recupera el refrigerante, presuriza con nitrógeno seco sin pasar de la presión máxima (PS) de la baja, aísla tramos cerrando llaves y comprueba si cae la presión.',
    'Para fugas muy pequeñas: nitrógeno con 5 % de hidrógeno y detector de hidrógeno, o trazador UV en el aceite.',
  ],
  after: [
    'Repara la fuga antes de cargar: rellenar sin reparar no está permitido y la fuga seguirá.',
    'Cambia el filtro deshidratador.',
    'Vacío profundo (por debajo de 5 mbar) y prueba de que se mantiene.',
    'Carga por peso. Las mezclas (R404A, R449A, R407C…) se cargan en fase líquida.',
    'Anota la intervención en el registro de la instalación (gases fluorados).',
  ],
};

/** Controles de fugas obligatorios según las toneladas de CO₂ equivalente. */
export function leakCheckInfo(ref, chargeKg) {
  if (!chargeKg || !ref.gwp) return null;
  const t = (chargeKg * ref.gwp) / 1000;
  let every = null;
  if (t >= 500) every = 'cada 3 meses (6 con sistema de detección de fugas)';
  else if (t >= 50) every = 'cada 6 meses (12 con sistema de detección de fugas)';
  else if (t >= 5) every = 'cada 12 meses (24 con sistema de detección de fugas)';
  return { tco2: t, every };
}

/**
 * Diagnostica a partir de las lecturas. m = {
 *   refrigerant, app, expansion,
 *   LP, HP (bar manométricos), Tsuc, Tliq, Troom, Tamb, Tdis, amps, ampsNom (°C, A),
 *   sight: ''|'lleno'|'burbujas'|'vacio'|'humedad', ice: ''|'no'|'parcial'|'bloqueado'|'entrada'|'aspiracion',
 *   evapFan, condFan: ''|'ok'|'parado', comp: ''|'marcha'|'ciclos'|'pb'|'pa'|'termico'|'noArranca',
 *   filterDT, standP, standT, chargeKg, solenoid: ''|'si'|'no',
 *   flags: {oil, recent, filterCold, txvFrost, bulbLoose, condDirty, equalizeFast, noCool, recentLoad, intermittent}
 * }
 */
export function diagnoseReadings(m) {
  const ref = getRefrigerant(m.refrigerant);
  const app = APPS[m.app] ? m.app : 'positiva';
  const A = APPS[app];
  const exp = EXPANSIONS[m.expansion] ? m.expansion : 'txv';
  const LP = num(m.LP), HP = num(m.HP), Tsuc = num(m.Tsuc), Tliq = num(m.Tliq), Troom = num(m.Troom);
  const Tamb = num(m.Tamb), Tdis = num(m.Tdis), amps = num(m.amps), ampsNom = num(m.ampsNom), filterDT = num(m.filterDT);
  const flags = m.flags || {};
  const warnings = [];

  // ---- Cálculos a partir de las presiones.
  const c = { ref };
  if (LP !== null) {
    if (LP < -1) warnings.push('La presión de baja no puede ser menor que −1 bar (vacío absoluto).');
    const P = absolute(Math.max(LP, -0.99));
    c.Te = tsatDew(ref, P);
    c.TeBub = tsatBubble(ref, P);
  }
  if (HP !== null) {
    const P = absolute(HP);
    c.Tc = tsatBubble(ref, P);
    c.TcDew = tsatDew(ref, P);
    if (HP > (Math.exp(ref.lnPb[ref.count - 1]) - 1.013) * 1.01) warnings.push(`La presión de alta está por encima de la tabla del ${ref.id} (cerca del punto crítico, ${fmt(ref.Tc, 0)} °C).`);
  }
  if (LP !== null && HP !== null) {
    c.pr = absolute(HP) / absolute(Math.max(LP, -0.99));
    if (HP < LP) warnings.push('La alta es menor que la baja: revisa que los manómetros no estén cambiados.');
  }
  if (c.Te !== undefined && Tsuc !== null) c.SH = Tsuc - c.Te;
  if (c.Tc !== undefined && Tliq !== null) c.SC = c.Tc - Tliq;
  if (c.Te !== undefined && Troom !== null) c.TD = Troom - c.Te;
  if (c.Tc !== undefined && Tamb !== null) c.approach = (c.Tc + c.TcDew) / 2 - Tamb;
  if (c.Te !== undefined && c.pr !== undefined) {
    const T1 = (Tsuc !== null ? Tsuc : c.Te + 8);
    const comp = compression(ref, T1, c.pr);
    c.TdisEst = (T1 + 273.15) * (1 + comp.f / 0.75) - 273.15 + 8;
  }
  if (c.SH !== undefined && c.SH < -1) warnings.push(`El recalentamiento sale negativo (${fmt(c.SH)} K): la tubería no puede estar más fría que la evaporación salvo que vuelva líquido o la medida esté mal (sonda sin contacto o mal aislada, o refrigerante equivocado).`);
  if (c.SC !== undefined && c.SC < -1) warnings.push(`El subenfriamiento sale negativo (${fmt(c.SC)} K): revisa la medida de la tubería de líquido o el refrigerante elegido.`);
  if (Tamb !== null && c.Tc !== undefined && c.Tc < Tamb - 1 && (m.comp || 'marcha') === 'marcha') warnings.push('La condensación sale más fría que el aire exterior: con el compresor en marcha eso no es posible. Revisa el refrigerante o las medidas.');

  // ---- Clasificación de cada variable.
  const vars = [];
  const lv = {};
  const push = (key, label, value, unit, L, band, note) => {
    lv[key] = L;
    vars.push({ key, label, value, unit, level: L, band, note });
  };
  // Presión de baja: por el salto térmico si hay T de cámara; si no, por el rango típico.
  if (c.Te !== undefined) {
    let L = null;
    let band = null;
    let note = '';
    if (c.TD !== undefined) {
      const [lo, hi] = A.TD;
      L = -level(c.TD, lo, hi, lo - 3, hi + 6) || 0;
      band = `salto ${lo}–${hi} K`;
      note = `salto térmico ${fmt(c.TD)} K`;
    } else if (A.Te) {
      const [lo, hi] = A.Te;
      L = level(c.Te, lo, hi, lo - 8, hi + 8);
      band = `evaporación típica ${lo} a ${hi} °C`;
    }
    push('LP', 'Presión de baja', LP, 'bar', L, band, `evapora a ${fmt(c.Te)} °C${ref.zeotropic ? ` (rocío; burbuja ${fmt(c.TeBub)} °C)` : ''}${note ? ' · ' + note : ''}`);
  }
  if (c.Tc !== undefined) {
    let L = null;
    let band = null;
    if (c.approach !== undefined) {
      L = level(c.approach, 6, 17, 3, 24);
      band = 'salto 8–17 K';
    } else {
      L = level(c.Tc, 32, 50, 22, 58);
      band = 'condensación típica 32–50 °C';
    }
    push('HP', 'Presión de alta', HP, 'bar', L, band, `condensa a ${fmt(c.Tc)} °C${ref.zeotropic ? ` (burbuja; rocío ${fmt(c.TcDew)} °C)` : ''}${c.approach !== undefined ? ` · salto ${fmt(c.approach)} K sobre el exterior` : ''}`);
  }
  if (c.SH !== undefined) {
    const [lo, hi, vlo, vhi] = SH_BAND[exp];
    push('SH', 'Recalentamiento', c.SH, 'K', level(c.SH, lo, hi, vlo, vhi), `${lo}–${hi} K`, `aspiración ${fmt(Tsuc)} °C − evaporación ${fmt(c.Te)} °C`);
  }
  if (c.SC !== undefined) {
    const withReceiver = exp !== 'capilar' && app !== 'clima';
    const band = withReceiver ? [1.5, 7, 0.6, 11] : [3, 10, 1, 14];
    push('SC', 'Subenfriamiento', c.SC, 'K', level(c.SC, band[0], band[1], band[2], band[3]), `${band[0]}–${band[1]} K`, `condensación ${fmt(c.Tc)} °C − líquido ${fmt(Tliq)} °C`);
  }
  if (Tdis !== null) {
    const lim = ['R22', 'R32', 'R410A', 'R454B'].includes(ref.id) ? 110 : ref.id === 'R717' ? 140 : 100;
    push('Tdis', 'Temperatura de descarga', Tdis, '°C', level(Tdis, -100, lim, -200, lim + 15), `< ${lim} °C`, c.TdisEst ? `esperable ≈ ${fmt(c.TdisEst, 0)} °C` : '');
  }
  if (amps !== null && ampsNom) {
    const r = amps / ampsNom;
    push('amps', 'Intensidad del compresor', amps, 'A', level(r, 0.6, 1.1, 0.4, 1.3), `60–110 % de ${fmt(ampsNom)} A`, `${Math.round(r * 100)} % de la nominal`);
  }

  // ---- Observaciones.
  const standP = num(m.standP), standT = num(m.standT);
  const o = {
    app,
    sight: m.sight || '',
    ice: m.ice || '',
    evapFan: m.evapFan || '',
    condFan: m.condFan || '',
    comp: m.comp || '',
    solenoid: m.solenoid || '',
    filterDT,
    Tamb,
    pr: c.pr ?? null,
    TDhigh: c.TD !== undefined && c.TD > A.TD[1] + 4,
    roomHot: Troom !== null && A.room && Troom > A.room[1] + 4,
    roomKnown: Troom !== null,
    ...flags,
    standstill: null,
  };
  if (standP !== null && standT !== null) {
    const Psat = psatBubble(ref, standT) - 1.013;
    o.standstill = { P: standP, T: standT, Psat, excess: standP - Psat };
    c.standstill = o.standstill;
    if (standP < psatDew(ref, standT) - 1.013 - 1) {
      warnings.push(`En parado la presión (${fmt(standP)} bar) es claramente menor que la de saturación a ${fmt(standT)} °C (${fmt(Psat)} bar): queda muy poco refrigerante (solo vapor).`);
    }
  }

  // ---- Puntuación de cada avería.
  const known = Object.entries(lv).filter(([, L]) => L !== null && L !== undefined);
  const hyps = [];
  for (const F of FAULTS) {
    if (F.only && !F.only.includes(exp)) continue;
    let s = 0;
    let wsum = 0;
    const ev = [];
    for (const [key, [allowed, w]] of Object.entries(F.sig)) {
      const L = lv[key];
      if (L === null || L === undefined) continue;
      const vr = vars.find((x) => x.key === key);
      const txt = `${vr.label} ${LEVEL_TXT[L]} (${fmt(vr.value)} ${vr.unit})`;
      wsum += w;
      if (allowed.includes(L)) {
        s += w;
        ev.push({ ok: true, text: txt });
      } else if (L !== 0 && allowed.every((x) => Math.sign(x) === -Math.sign(L))) {
        s -= w;
        ev.push({ ok: false, text: `${txt}: con esta avería sería ${expectTxt(allowed)}` });
      } else {
        s -= 0.35 * w;
        ev.push({ ok: false, text: `${txt}: con esta avería suele ser ${expectTxt(allowed)}` });
      }
    }
    for (const x of F.obs(o).filter(Boolean)) {
      if (!x.text) continue;
      if (x.w > 0) {
        s += x.w;
        wsum += x.w;
        ev.push({ ok: true, text: x.text });
      } else {
        wsum += -x.w;
        s += x.w;
        ev.push({ ok: false, text: x.text });
      }
    }
    if (wsum === 0) continue;
    const coverage = Math.min(1, wsum / 6);
    const match = Math.max(0, s / wsum);
    const score = match * match * (0.35 + 0.65 * coverage) * (0.5 + 0.5 * (F.prior ?? 0.5));
    hyps.push({ ...F, match, score, evidence: ev });
  }
  // "Todo normal".
  if (known.length) {
    const pts = known.reduce((acc, [, L]) => acc + (L === 0 ? 1 : Math.abs(L) === 1 ? -0.6 : -1.6), 0);
    const badObs = ['burbujas', 'vacio', 'humedad'].includes(o.sight) || o.ice === 'bloqueado' || o.ice === 'aspiracion' || o.evapFan === 'parado' || o.condFan === 'parado' || ['pa', 'termico', 'noArranca', 'pb', 'ciclos'].includes(o.comp);
    const match = Math.max(0, pts / known.length) * (badObs ? 0.3 : 1);
    const score = match * match * (0.35 + 0.65 * Math.min(1, known.length / 4)) * 0.9;
    hyps.push({
      id: 'normal',
      name: 'Funcionamiento normal',
      match,
      score,
      evidence: known.map(([k, L]) => {
        const vr = vars.find((x) => x.key === k);
        return { ok: L === 0, text: `${vr.label} ${LEVEL_TXT[L]} (${fmt(vr.value)} ${vr.unit})` };
      }),
      what: 'Las lecturas están dentro de lo normal para este tipo de instalación.',
      checks: ['Si aun así hay un problema, revisa controles (termostato, desescarches, ventiladores) y la carga térmica de la cámara.'],
      fix: [],
      sim: { faults: {} },
    });
  }
  hyps.sort((a, b) => b.score - a.score);
  // Probabilidad relativa entre las hipótesis con algo de peso.
  const best = hyps.length ? hyps[0].score : 0;
  const pool = hyps.filter((h) => h.score > best * 0.08);
  const total = pool.reduce((acc, h) => acc + h.score, 0) || 1;
  for (const h of hyps) h.confidence = pool.includes(h) ? h.score / total : 0;

  // ---- Qué medir a continuación para distinguir las más probables.
  const top = hyps.filter((h) => h.confidence > 0.12).slice(0, 3);
  const next = [];
  const has = { LP: LP !== null, HP: HP !== null, SH: c.SH !== undefined, SC: c.SC !== undefined, TD: c.TD !== undefined, Tamb: Tamb !== null, amps: amps !== null && !!ampsNom, Tdis: Tdis !== null };
  for (const key of ['LP', 'HP', 'SH', 'SC', 'TD', 'Tamb', 'amps', 'Tdis']) {
    if (has[key]) continue;
    const sigKey = key === 'TD' ? 'LP' : key === 'Tamb' ? 'HP' : key;
    if (key === 'TD' && !has.LP) continue;
    if (key === 'Tamb' && !has.HP) continue;
    const sets = top.map((h) => (h.sig && h.sig[sigKey] ? h.sig[sigKey][0].join(',') : '?'));
    if (!top.length || new Set(sets).size > 1 || ['LP', 'HP', 'SH', 'SC'].includes(key)) next.push(NEXT[key]);
  }
  if (!o.sight) next.push(NEXT.sight);
  if (top.some((h) => h.id === 'incondensables' || h.id === 'condensacion') && !o.standstill) next.push(NEXT.standstill);
  if (top.some((h) => h.id === 'restriccion' || h.id === 'vet_cerrada' || h.id === 'fuga') && filterDT === null) next.push(NEXT.filterDT);

  // ---- Resumen.
  const parts = [];
  if (c.Te !== undefined) parts.push(`${fmt(LP)} bar de baja con ${ref.id} = evaporación a ${fmt(c.Te)} °C`);
  if (c.Tc !== undefined) parts.push(`${fmt(HP)} bar de alta = condensación a ${fmt(c.Tc)} °C`);
  const summary = parts.length ? parts.join(' · ') + '.' : 'Introduce al menos una presión.';

  return {
    ref,
    app,
    expansion: exp,
    computed: c,
    vars,
    hypotheses: hyps,
    next: [...new Set(next)].slice(0, 5),
    warnings,
    summary,
    leak: leakCheckInfo(ref, num(m.chargeKg)),
  };
}

function expectTxt(allowed) {
  const t = [...new Set(allowed.map((x) => LEVEL_TXT[x]))];
  return t.join(' o ');
}

export { FAULTS };
