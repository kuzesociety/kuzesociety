// Propiedades de refrigerantes a partir de tablas reales (CoolProp, ver
// tools/gen_refrigerants.py).
//
// Para las mezclas zeotrópicas (R449A, R448A, R407C...) la temperatura de
// saturación depende de si se mira el punto de ROCÍO (vapor saturado, el que
// se usa para el recalentamiento y la presión de baja) o el de BURBUJA
// (líquido saturado, el que se usa para el subenfriamiento y la alta). La
// diferencia entre ambos es el deslizamiento ("glide").
//
// El modelo de simulación trabaja con la temperatura MEDIA entre burbuja y
// rocío (psat/tsat); los manómetros y el diagnóstico usan rocío/burbuja como
// un analizador digital.

import { REFDATA } from './refdata.js';

export const P_ATM = 1.013; // bar

const LABELS = {
  R290: 'R290 (propano)',
  R600a: 'R600a (isobutano)',
  R717: 'R717 (amoniaco)',
  R744: 'R744 (CO₂)',
  R1234ze: 'R1234ze(E)',
};

const R = {};
for (const [id, d] of Object.entries(REFDATA)) {
  const n = d.T.length;
  const lnPb = d.Pb.map(Math.log);
  const lnPd = d.Pd.map(Math.log);
  const lnPm = lnPb.map((v, i) => (v + lnPd[i]) / 2);
  const ref = {
    ...d,
    label: LABELS[id] || id,
    t0: d.T[0],
    step: d.T[1] - d.T[0],
    count: n,
    lnPb,
    lnPd,
    lnPm,
    Tmax: d.T[n - 1],
  };
  // Deslizamiento en función de la temperatura media (para el modelo).
  ref.glideT = lnPm.map((lp) => invLn(ref, lnPd, lp) - invLn(ref, lnPb, lp));
  ref.zeotropic = Math.max(...ref.glideT.slice(0, Math.min(n, 40))) > 1.0;
  ref.cpV = at(ref, d.cpv, -10);
  R[id] = ref;
}

export const REFRIGERANTS = R;
export const REFRIGERANT_IDS = Object.keys(R);
export const SIM_REFRIGERANT_IDS = REFRIGERANT_IDS.filter((id) => R[id].sim);

export function getRefrigerant(id) {
  return R[id] || R.R404A;
}

// ------------------------------------------------------------- interpolación
function idx(ref, T) {
  let x = (T - ref.t0) / ref.step;
  let i = Math.floor(x);
  if (i < 0) i = 0;
  else if (i > ref.count - 2) i = ref.count - 2;
  return [i, x - i];
}

/** Valor tabulado en T (interpolación lineal; extrapola en los extremos). */
function at(ref, arr, T) {
  const [i, f] = idx(ref, T);
  return arr[i] + (arr[i + 1] - arr[i]) * f;
}

/** Inversa de una tabla creciente de ln(P): devuelve T. */
function invLn(ref, arr, lp) {
  const n = ref.count;
  let lo = 0;
  let hi = n - 1;
  if (lp <= arr[0]) hi = 1;
  else if (lp >= arr[n - 1]) lo = n - 2;
  else {
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (arr[m] <= lp) lo = m;
      else hi = m;
    }
  }
  const i = Math.min(lo, n - 2);
  const f = (lp - arr[i]) / (arr[i + 1] - arr[i]);
  return ref.t0 + (i + f) * ref.step;
}

// ------------------------------------------------------------- presiones
/** Presión de burbuja (líquido saturado), bar abs. */
export const psatBubble = (ref, T) => Math.exp(at(ref, ref.lnPb, T));
/** Presión de rocío (vapor saturado), bar abs. */
export const psatDew = (ref, T) => Math.exp(at(ref, ref.lnPd, T));
/** Presión de saturación "media" (la que usa el modelo), bar abs. */
export const psat = (ref, T) => Math.exp(at(ref, ref.lnPm, Math.min(T, ref.Tc - 0.5)));

/** Temperatura de burbuja (°C) a la presión absoluta P (bar). */
export const tsatBubble = (ref, P) => invLn(ref, ref.lnPb, Math.log(Math.max(P, 1e-4)));
/** Temperatura de rocío (°C) a la presión absoluta P (bar). */
export const tsatDew = (ref, P) => invLn(ref, ref.lnPd, Math.log(Math.max(P, 1e-4)));
/** Temperatura media de saturación (°C) a la presión absoluta P (bar). */
export const tsat = (ref, P) => Math.min(invLn(ref, ref.lnPm, Math.log(Math.max(P, 1e-4))), ref.Tc);

/** Deslizamiento (K) a la temperatura media T. */
export const glideAt = (ref, T) => Math.max(0, at(ref, ref.glideT, T));

export const gauge = (Pabs) => Pabs - P_ATM;
export const absolute = (Pg) => Pg + P_ATM;

// ------------------------------------------------------------- entalpías
/** Entalpía del líquido saturado a T (kJ/kg, ref. IIR). */
export const hLiq = (ref, T) => at(ref, ref.hl, T);
/** Entalpía del vapor saturado (rocío) a T (kJ/kg). */
export const hVap = (ref, T) => at(ref, ref.hv, T);
/** Calor latente aproximado a T (kJ/kg). */
export const hfg = (ref, T) => Math.max(1, hVap(ref, T) - hLiq(ref, T));
/** cp del vapor saturado a T (kJ/kg·K). */
export const cpVap = (ref, T) => at(ref, ref.cpv, T);

/**
 * Densidad del vapor (kg/m³) a presión absoluta P (bar) y temperatura T (°C):
 * densidad del vapor saturado corregida por el recalentamiento.
 */
export function vaporDensity(ref, P, T) {
  const Td = tsatDew(ref, P);
  const rho = Math.exp(at(ref, logRv(ref), Td));
  return rho * (Td + 273.15) / (Math.max(T, Td) + 273.15);
}

function logRv(ref) {
  if (!ref._lnRv) ref._lnRv = ref.rv.map(Math.log);
  return ref._lnRv;
}

/**
 * Compresión calibrada con una compresión isentrópica real: devuelve la
 * relación de temperaturas ideal (f = T2s/T1 − 1) y el trabajo isentrópico
 * (kJ/kg) para una relación de presiones pr.
 */
export function compression(ref, TsucC, pr) {
  const e = (ref.n - 1) / ref.n;
  const f = Math.pow(Math.max(pr, 1), e) - 1;
  const TsK = TsucC + 273.15;
  return { f, work: ref.cpw * TsK * f };
}

/** Temperaturas de saturación a una presión manométrica (bar), para el diagnóstico. */
export function satFromGauge(ref, Pg) {
  const P = absolute(Pg);
  const dew = tsatDew(ref, P);
  const bub = tsatBubble(ref, P);
  return { dew, bub, glide: dew - bub, outOfRange: P > Math.exp(ref.lnPb[ref.count - 1]) * 1.02 || P < Math.exp(ref.lnPd[0]) * 0.98 };
}
