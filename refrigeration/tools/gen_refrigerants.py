"""Genera js/refrig/refdata.js con propiedades de saturación reales (CoolProp).

Uso:  pip install CoolProp && python3 tools/gen_refrigerants.py

Para cada refrigerante se tabula, cada 2 K, la presión de burbuja y de rocío,
la entalpía del líquido saturado (burbuja) y del vapor saturado (rocío), la
densidad y el cp del vapor saturado. Las entalpías se refieren al criterio IIR
(h = 200 kJ/kg para el líquido saturado a 0 °C). Además se calibra un exponente
politrópico y un cp efectivo de compresión con una compresión isentrópica real
a -10 °C / +40 °C con 10 K de recalentamiento.
"""
import json
import math
import os
import CoolProp.CoolProp as CP

MM = {}


def molar(n):
    if n not in MM:
        MM[n] = CP.PropsSI('M', n)
    return MM[n]


def blend(mass):
    moles = {k: v / molar(k) for k, v in mass.items()}
    s = sum(moles.values())
    return 'HEOS::' + '&'.join(f'{k}[{moles[k] / s:.8f}]' for k in mass)


FLUIDS = [
    # id, fluido CoolProp, composición (texto), clase de seguridad, PCA (AR4, F-gas UE 517/2014), simulable
    ('R404A', 'R404A', 'R125/R143a/R134a 44/52/4', 'A1', 3922, True),
    ('R449A', blend({'R32': 24.3, 'R125': 24.7, 'R1234yf': 25.3, 'R134a': 25.7}), 'R32/R125/R1234yf/R134a 24,3/24,7/25,3/25,7', 'A1', 1397, True),
    ('R448A', blend({'R32': 26, 'R125': 26, 'R134a': 21, 'R1234ze(E)': 7, 'R1234yf': 20}), 'R32/R125/R1234yf/R134a/R1234ze(E) 26/26/20/21/7', 'A1', 1387, True),
    ('R452A', blend({'R32': 11, 'R125': 59, 'R1234yf': 30}), 'R32/R125/R1234yf 11/59/30', 'A1', 2140, True),
    ('R507A', 'R507A', 'R125/R143a 50/50', 'A1', 3985, True),
    ('R134a', 'R134a', 'puro', 'A1', 1430, True),
    ('R513A', blend({'R1234yf': 56, 'R134a': 44}), 'R1234yf/R134a 56/44 (azeótropo)', 'A1', 631, True),
    ('R1234yf', 'R1234yf', 'puro (HFO)', 'A2L', 4, True),
    ('R1234ze', 'R1234ze(E)', 'puro (HFO)', 'A2L', 7, True),
    ('R22', 'R22', 'puro (HCFC, prohibido recargar con virgen)', 'A1', 1810, True),
    ('R407C', 'R407C', 'R32/R125/R134a 23/25/52', 'A1', 1774, True),
    ('R407F', blend({'R32': 30, 'R125': 30, 'R134a': 40}), 'R32/R125/R134a 30/30/40', 'A1', 1825, True),
    ('R410A', 'R410A', 'R32/R125 50/50', 'A1', 2088, True),
    ('R32', 'R32', 'puro', 'A2L', 675, True),
    ('R454B', blend({'R32': 68.9, 'R1234yf': 31.1}), 'R32/R1234yf 68,9/31,1', 'A2L', 466, True),
    ('R290', 'R290', 'propano', 'A3', 3, True),
    ('R600a', 'R600a', 'isobutano', 'A3', 3, True),
    ('R717', 'R717', 'amoniaco', 'B2L', 0, True),
    ('R744', 'R744', 'CO2 (solo subcrítico: por encima de 31 °C no condensa)', 'A1', 1, False),
]


def one(fn):
    """Evalúa una propiedad reintentando muy cerca si el solver no converge."""
    for dT in (0, 0.01, -0.01, 0.05, -0.05, 0.2, -0.2):
        try:
            v = fn(dT)
            if v == v and abs(v) < 1e12:
                return v
        except Exception:
            continue
    return None


def props(fl, T):
    Pb = one(lambda d: CP.PropsSI('P', 'T', T + d, 'Q', 0, fl))
    Pd = one(lambda d: CP.PropsSI('P', 'T', T + d, 'Q', 1, fl))
    hl = one(lambda d: CP.PropsSI('H', 'T', T + d, 'Q', 0, fl))
    hv = one(lambda d: CP.PropsSI('H', 'T', T + d, 'Q', 1, fl))
    rv = one(lambda d: CP.PropsSI('D', 'T', T + d, 'Q', 1, fl))
    cpv = None
    if Pd:
        cpv = one(lambda d: CP.PropsSI('C', 'P', Pd * 0.999, 'T', T + 3 + d, fl))
    return Pb, Pd, hl, hv, rv, cpv


def fill(rows, col, log=False):
    """Rellena huecos (None) interpolando linealmente en T (en ln para presiones)."""
    xs = [r[0] for r in rows]
    known = [(r[0], math.log(r[col]) if log else r[col]) for r in rows if r[col] is not None]
    for r in rows:
        if r[col] is not None:
            continue
        lo = max((k for k in known if k[0] < r[0]), default=None, key=lambda k: k[0])
        hi = min((k for k in known if k[0] > r[0]), default=None, key=lambda k: k[0])
        if lo and hi:
            v = lo[1] + (hi[1] - lo[1]) * (r[0] - lo[0]) / (hi[0] - lo[0])
            r[col] = math.exp(v) if log else v
    return xs


def compression(fl, Te, Tc, sh=10.0):
    """Compresión isentrópica real: devuelve (T1, T2s, dh_is) en K y J/kg."""
    P1 = CP.PropsSI('P', 'T', Te, 'Q', 1, fl)
    P2 = math.sqrt(CP.PropsSI('P', 'T', Tc, 'Q', 0, fl) * CP.PropsSI('P', 'T', Tc, 'Q', 1, fl))
    T1 = CP.PropsSI('T', 'P', P1, 'Q', 1, fl) + sh
    h1 = CP.PropsSI('H', 'P', P1, 'T', T1, fl)
    s1 = CP.PropsSI('S', 'P', P1, 'T', T1, fl)
    h2 = CP.PropsSI('H', 'P', P2, 'S', s1, fl)
    T2 = CP.PropsSI('T', 'P', P2, 'S', s1, fl)
    return T1, T2, h2 - h1, P2 / P1


def tcrit(fl):
    if not fl.startswith('HEOS::'):
        return CP.PropsSI('Tcrit', fl) - 273.15
    parts = fl[6:].split('&')
    names = [q.split('[')[0] for q in parts]
    x = [float(q.split('[')[1].rstrip(']')) for q in parts]
    st = CP.AbstractState('HEOS', '&'.join(names))
    st.set_mole_fractions(x)
    pts = [q for q in st.all_critical_points() if q.stable and q.T > 273.15]
    return pts[0].T - 273.15


out = {}
for rid, fl, comp, safety, gwp, sim in FLUIDS:
    Tc = tcrit(fl)
    Mw = CP.PropsSI('M', 'T', 300, 'P', 1e5, fl) * 1000 if fl.startswith('HEOS::') else CP.PropsSI('M', fl) * 1000
    Ttriple = CP.PropsSI('Ttriple', fl) - 273.15 if not fl.startswith('HEOS::') else -100
    t0 = max(-60, 2 * math.ceil((Ttriple + 1) / 2))
    t1 = min(Tc - 1.5, 95)
    rows = []
    T = t0
    while T <= t1 + 1e-9:
        Pb, Pd, hl, hv, rv, cpv = props(fl, T + 273.15)
        sc = lambda v, k: None if v is None else v / k
        rows.append([T, sc(Pb, 1e5), sc(Pd, 1e5), sc(hl, 1e3), sc(hv, 1e3), rv, sc(cpv, 1e3)])
        T += 2
    # Algunas mezclas no convergen en ciertos puntos: se interpolan.
    for col, lg in ((1, True), (2, True), (3, False), (4, False), (5, True), (6, False)):
        fill(rows, col, lg)
    rows = [r for r in rows if all(v is not None for v in r)]
    # Referencia IIR: líquido saturado a 0 °C = 200 kJ/kg.
    h0 = CP.PropsSI('H', 'T', 273.15, 'Q', 0, fl) / 1e3
    shift = 200 - h0
    for r in rows:
        r[3] += shift
        r[4] += shift
    # Calibración de la compresión (media de dos puntos típicos).
    ns, cps = [], []
    if sim:
        for te in (-30, -10, 0):
            T1, T2, dh, pr = compression(fl, te + 273.15, 40 + 273.15)
            e = math.log(T2 / T1) / math.log(pr)
            ns.append(1 / (1 - e))
            cps.append(dh / 1e3 / (T2 - T1))
    n = sum(ns) / len(ns) if ns else 1.1
    cpw = sum(cps) / len(cps) if cps else 1.0

    def r4(x):
        return float(f'{x:.5g}')

    out[rid] = {
        'id': rid,
        'composition': comp,
        'safety': safety,
        'gwp': gwp,
        'sim': sim,
        'Tc': round(Tc, 2),
        'Mw': round(Mw, 2),
        'n': round(n, 4),
        'cpw': round(cpw, 4),
        'T': [r[0] for r in rows],
        'Pb': [r4(r[1]) for r in rows],
        'Pd': [r4(r[2]) for r in rows],
        'hl': [round(r[3], 2) for r in rows],
        'hv': [round(r[4], 2) for r in rows],
        'rv': [r4(r[5]) for r in rows],
        'cpv': [round(r[6], 4) for r in rows],
    }
    g0 = None
    if -10 in out[rid]['T']:
        i = out[rid]['T'].index(-10)
        g0 = (out[rid]['Pb'][i], out[rid]['Pd'][i])
    print(f"{rid:8s} {len(rows):3d} pts  T {rows[0][0]}..{rows[-1][0]}  Tc={Tc:.1f}  n={n:.3f} cpw={cpw:.3f}  (-10°C: Pb={g0[0] if g0 else '-'} Pd={g0[1] if g0 else '-'})")

here = os.path.dirname(os.path.abspath(__file__))
dst = os.path.join(here, '..', 'js', 'refrig', 'refdata.js')
with open(dst, 'w') as f:
    f.write('// Generado por tools/gen_refrigerants.py con CoolProp ' + CP.get_global_param_string('version') + '. No editar a mano.\n')
    f.write('// T (°C); Pb/Pd: presión absoluta de burbuja/rocío (bar); hl/hv: entalpía líquido/vapor saturado (kJ/kg, ref. IIR);\n')
    f.write('// rv: densidad del vapor saturado (kg/m³); cpv: cp del vapor (kJ/kg·K); n, cpw: calibración de la compresión.\n')
    f.write('export const REFDATA = ')
    json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
    f.write(';\n')
print('escrito', os.path.relpath(dst), os.path.getsize(dst), 'bytes')
