// Interpretar con Claude un esquema que no es de CADe SIMU: una foto, una
// captura, un PDF o el texto de un archivo de otro programa. Claude devuelve
// la descripción en escalera que dibuja ladder.js.

const EXAMPLE = {
  name: 'Cámara de conservación',
  install: 'positiva',
  power: [{ items: [{ type: 'mcb3', tag: 'Q1' }, { type: 'c_main3', tag: 'KM1' }, { type: 'thermal3', tag: 'F1', Iset: 3.2 }, { type: 'motor3', tag: 'M1', name: 'Compresor', func: 'compresor' }] }],
  control: {
    protection: { type: 'mcb2', tag: 'Q2' },
    rungs: [
      [{ type: 'pb_nc', tag: 'S0', name: 'Paro' }, { par: [[{ type: 'pb_no', tag: 'S1', name: 'Marcha' }], [{ type: 'c_no', tag: 'KA1' }]] }, { type: 'coil', tag: 'KA1' }],
      [{ type: 'c_no', tag: 'KA1' }, {
        par: [
          [{ type: 'th_nc', tag: 'F1' }, { type: 'pressostat', tag: 'PA', kind: 'alta', cut: 27 }, { type: 'pressostat', tag: 'PB', kind: 'baja', cut: 1 }, { type: 'thermostat', tag: 'TH1', probe: 'camara', sp: 2, diff: 2 }, { type: 'coil', tag: 'KM1', name: 'Compresor' }],
          [{ type: 'c_no', tag: 'KM1' }, { type: 'motor1', tag: 'M2', name: 'Vent. condensador', func: 'vent_cond' }],
          [{ type: 'door_nc', tag: 'SQ1' }, { type: 'motor1', tag: 'M3', name: 'Vent. evaporador', func: 'vent_evap' }],
          [{ type: 'door_no', tag: 'SQ1' }, { type: 'lamp', tag: 'H1', name: 'Luz cámara', func: 'luz', color: 'blanco' }],
        ],
      }],
    ],
  },
  notes: [],
};

const RULES = `Eres técnico frigorista y electricista. Convierte el esquema eléctrico en un JSON para el simulador FrigoSIMU.

Responde SOLO con un objeto JSON con esta forma:
{"name": texto, "install": "positiva"|"congelados"|"armario"|"ninguna", "power": [{"items": [...]}], "control": {"protection": pieza|null, "rungs": [[...], ...]}, "notes": [texto, ...]}

POTENCIA: cada elemento de "power" es un motor trifásico con sus aparatos, en "items" de arriba abajo (de la red al motor). Tipos: "mcb3" (magnetotérmico o guardamotor 3P), "fuse3" (fusibles), "c_main3" (contactos principales; tag = el del contactor), "thermal3" (relé térmico; Iset en A), "motor3" (func).
MANDO: "protection" es la protección del mando ("mcb2" 1P+N, "mcb1" o "fuse"). Cada escalón de "rungs" va de la fase (arriba) al neutro (abajo): una lista de piezas en serie. Las ramas en paralelo se escriben {"par": [[piezas en serie], [piezas en serie], ...]} y pueden anidarse.
Tipos del mando:
- "pb_no" pulsador NA (marcha), "pb_nc" pulsador NC (paro), "estop" seta de emergencia, "sw" interruptor ("on": true si arranca cerrado), "sel" selector ("out": "1" o "2").
- "c_no" / "c_nc" contacto NA / NC de un contactor o relé (tag = el de su bobina). "t_no" / "t_nc" contacto temporizado (tag = el del temporizador).
- "th_nc" / "th_no" contacto 95-96 / 97-98 del relé térmico (tag = el del térmico).
- "thermostat" termostato ("probe": "camara" o "evaporador", "sp" y "diff" en °C; su contacto C-NC está cerrado mientras pide frío).
- "pressostat" presostato ("kind": "alta" o "baja", "cut" en bar, "diff"; su contacto C-NC abre al disparar).
- "door_nc" final de carrera de la puerta que abre al abrirla (ventiladores); "door_no" que cierra al abrirla (luz).
- "clock" motor del reloj de desescarche; "clk_c" su contacto ("out": "F" en frío, "D" en desescarche; tag = el del reloj).
- Cargas: "coil" bobina de contactor o relé, "tcoil" temporizador ("delay" en s, "mode" "ton" o "tof"), "lamp" piloto ("color": verde, rojo, amarillo, blanco, azul; "func": "luz" si es la luz de la cámara), "motor1" motor monofásico (ventiladores), "heater" resistencia ("func": "desescarche"), "solenoid" válvula solenoide de líquido.
- "fuse" o "mcb1" protección de una sola rama.
"func" de los motores: "compresor", "vent_evap" (ventilador del evaporador), "vent_cond" (ventilador del condensador) o "ninguna".
Cada pieza: {"type", "tag", "name"} y las propiedades que tenga. Copia las etiquetas tal cual (KM1, S1, TH1...).
Reglas: un autoenclavamiento es {"par": [[pulsador de marcha], [contacto NA de la bobina]]} seguido de la bobina. Si varias ramas cuelgan de un mismo contacto, pon ese contacto y detrás un "par" con las ramas. Todas las bobinas y cargas acaban en el neutro. Si no es una instalación frigorífica usa "install": "ninguna". Si algo no se lee bien, haz la interpretación más probable y explícalo en "notes" (en español, frases cortas).

Ejemplo de respuesta:
${JSON.stringify(EXAMPLE)}`;

/** Texto de la petición a Claude. */
export function buildPrompt({ kind, fileName, text, description }) {
  let what;
  if (kind === 'images') what = `Las imágenes son un esquema eléctrico${fileName ? ` (${fileName})` : ''}. Léelo con cuidado: símbolos, etiquetas y cables.`;
  else if (kind === 'file') what = `Este es el contenido del archivo «${fileName}» de un programa de esquemas eléctricos. Interprétalo:\n\n${text}`;
  else what = `El usuario describe así el esquema que quiere:\n\n${description}`;
  return `${RULES}\n\n${what}`;
}

/** Reduce un archivo de texto grande a lo esencial para que quepa en la petición. */
export function condenseFile(text, max = 42000) {
  let t = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');
  // XML: quita atributos de dibujo que no aportan nada al circuito.
  t = t.replace(/\s(?:style|font|color|antialias|width|height|rx|ry|x\d?|y\d?|length\d?|orientation|angle|rotation)="[^"]*"/g, '');
  if (t.length > max) t = `${t.slice(0, max)}\n[... archivo recortado ...]`;
  return t;
}

/** Comprueba lo mínimo del JSON que devuelve Claude. */
export function checkSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('La respuesta no es un esquema.');
  const rungs = spec.control && Array.isArray(spec.control.rungs) ? spec.control.rungs : [];
  const power = Array.isArray(spec.power) ? spec.power : [];
  if (!rungs.length && !power.length) throw new Error('No he encontrado ningún circuito en la respuesta.');
  return spec;
}
