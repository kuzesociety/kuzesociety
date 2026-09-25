// Propiedades simplificadas de refrigerantes.
//
// - Presión de saturación: tabla T (°C) -> P (bar absolutos), interpolada
//   linealmente sobre ln(P) (forma de Clausius-Clapeyron).
// - Entalpías: líquido saturado lineal con cp, calor latente con la
//   correlación de Watson hacia el punto crítico. Referencia IIR
//   (h = 200 kJ/kg para líquido saturado a 0 °C).
//
// Es un modelo didáctico: los valores son del orden correcto (±3 %) pero no
// sustituye a unas tablas termodinámicas.

export const P_ATM = 1.013; // bar

const R = {
  R404A: {
    label: 'R404A',
    Tc: 72.1, Mw: 97.6, cpL: 1.5, cpV: 0.92, hfg0: 163.5, n: 1.10,
    table: [[-50, 0.82], [-40, 1.31], [-30, 2.02], [-20, 3.0], [-10, 4.3], [0, 6.0], [10, 8.15],
      [20, 10.85], [30, 14.15], [40, 18.2], [50, 23.05], [60, 28.85], [70, 35.8]],
  },
  R134a: {
    label: 'R134a',
    Tc: 101.1, Mw: 102.0, cpL: 1.4, cpV: 0.86, hfg0: 198.6, n: 1.10,
    table: [[-50, 0.299], [-40, 0.512], [-30, 0.844], [-20, 1.327], [-10, 2.006], [0, 2.928],
      [10, 4.146], [20, 5.717], [30, 7.702], [40, 10.166], [50, 13.179], [60, 16.818],
      [70, 21.168], [80, 26.33], [90, 32.44], [100, 39.72]],
  },
  R22: {
    label: 'R22',
    Tc: 96.1, Mw: 86.5, cpL: 1.24, cpV: 0.70, hfg0: 205.0, n: 1.16,
    table: [[-50, 0.645], [-40, 1.049], [-30, 1.635], [-20, 2.448], [-10, 3.548], [0, 4.976],
      [10, 6.807], [20, 9.099], [30, 11.919], [40, 15.335], [50, 19.42], [60, 24.27],
      [70, 29.96], [80, 36.6], [90, 44.3]],
  },
  R290: {
    label: 'R290 (propano)',
    Tc: 96.7, Mw: 44.1, cpL: 2.6, cpV: 1.75, hfg0: 374.6, n: 1.12,
    table: [[-50, 0.70], [-40, 1.11], [-30, 1.68], [-20, 2.44], [-10, 3.45], [0, 4.74], [10, 6.36],
      [20, 8.36], [30, 10.79], [40, 13.69], [50, 17.13], [60, 21.16], [70, 25.9], [80, 31.4], [90, 37.8]],
  },
  R410A: {
    label: 'R410A',
    Tc: 71.3, Mw: 72.6, cpL: 1.65, cpV: 0.95, hfg0: 221.0, n: 1.16,
    table: [[-50, 1.10], [-40, 1.75], [-30, 2.70], [-20, 3.99], [-10, 5.73], [0, 7.99], [10, 10.87],
      [20, 14.44], [30, 18.85], [40, 24.18], [50, 30.6], [60, 38.2], [70, 47.3]],
  },
  R32: {
    label: 'R32',
    Tc: 78.1, Mw: 52.0, cpL: 1.9, cpV: 1.1, hfg0: 315.0, n: 1.24,
    table: [[-50, 1.10], [-40, 1.77], [-30, 2.74], [-20, 4.06], [-10, 5.83], [0, 8.13], [10, 11.07],
      [20, 14.75], [30, 19.28], [40, 24.78], [50, 31.4], [60, 39.3], [70, 48.8]],
  },
  R600a: {
    label: 'R600a (isobutano)',
    Tc: 134.7, Mw: 58.1, cpL: 2.35, cpV: 1.65, hfg0: 355.0, n: 1.08,
    table: [[-50, 0.17], [-40, 0.29], [-30, 0.47], [-20, 0.72], [-10, 1.08], [0, 1.57], [10, 2.2],
      [20, 3.02], [30, 4.05], [40, 5.31], [50, 6.84], [60, 8.67], [70, 10.8], [80, 13.3], [90, 16.2]],
  },
};

for (const [id, r] of Object.entries(R)) {
  r.id = id;
  r.lnTable = r.table.map(([t, p]) => [t, Math.log(p)]);
}

export const REFRIGERANTS = R;
export const REFRIGERANT_IDS = Object.keys(R);

export function getRefrigerant(id) {
  return R[id] || R.R404A;
}

/** Presión de saturación absoluta (bar) a la temperatura T (°C). */
export function psat(ref, T) {
  const t = ref.lnTable;
  const Tm = Math.min(T, ref.Tc - 0.5);
  let i = 0;
  if (Tm <= t[0][0]) i = 0;
  else if (Tm >= t[t.length - 1][0]) i = t.length - 2;
  else while (i < t.length - 2 && Tm > t[i + 1][0]) i++;
  const [t0, l0] = t[i];
  const [t1, l1] = t[i + 1];
  return Math.exp(l0 + ((l1 - l0) * (Tm - t0)) / (t1 - t0));
}

/** Temperatura de saturación (°C) a la presión absoluta P (bar). */
export function tsat(ref, P) {
  const t = ref.lnTable;
  const lp = Math.log(Math.max(P, 1e-4));
  let i = 0;
  if (lp <= t[0][1]) i = 0;
  else if (lp >= t[t.length - 1][1]) i = t.length - 2;
  else while (i < t.length - 2 && lp > t[i + 1][1]) i++;
  const [t0, l0] = t[i];
  const [t1, l1] = t[i + 1];
  return Math.min(t0 + ((lp - l0) * (t1 - t0)) / (l1 - l0), ref.Tc);
}

export const gauge = (Pabs) => Pabs - P_ATM;
export const absolute = (Pg) => Pg + P_ATM;

/** Calor latente de vaporización (kJ/kg), correlación de Watson. */
export function hfg(ref, T) {
  const x = Math.max(ref.Tc - T, 0) / ref.Tc;
  return ref.hfg0 * Math.pow(x, 0.38);
}

/** Entalpía de líquido saturado (kJ/kg). */
export function hLiq(ref, T) {
  // Término cuadrático suave para que la curva de líquido se incline hacia
  // el punto crítico como en un diagrama real.
  const bump = 0.175 * ref.hfg0;
  const w = Math.max(0, (T - (ref.Tc - 30)) / 30);
  return 200 + ref.cpL * T + bump * w * w;
}

/** Entalpía de vapor saturado (kJ/kg). */
export function hVap(ref, T) {
  return hLiq(ref, T) + hfg(ref, T);
}

/** Densidad del vapor (kg/m³) a presión absoluta P (bar) y temperatura T (°C). */
export function vaporDensity(ref, P, T) {
  const Z = 0.92;
  return (P * 1e5 * ref.Mw) / (Z * 8314 * (T + 273.15));
}

/**
 * Compresión politrópica: devuelve la relación T_desc/T_asp (absolutas)
 * ideal y el trabajo específico ideal (kJ/kg) para una relación de
 * presiones pr.
 */
export function compression(ref, TsucC, pr) {
  const e = (ref.n - 1) / ref.n;
  const f = Math.pow(Math.max(pr, 1), e) - 1;
  const TsK = TsucC + 273.15;
  return { f, work: ref.cpV * TsK * f };
}
