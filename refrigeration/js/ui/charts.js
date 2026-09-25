// Gráfica de tendencias (presiones y temperaturas) y diagrama P-h en canvas.

import { getRefrigerant, psat, hLiq, hVap, gauge } from '../refrig/refrigerants.js';

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return null;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

function niceStep(range, n) {
  const raw = range / Math.max(n, 1);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

const fmt = (v, d = 1) => v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

function clock(t) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export class TrendChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.samples = [];
    this.window = 1800;
  }

  reset() {
    this.samples = [];
  }

  push(o) {
    const last = this.samples[this.samples.length - 1];
    if (last && o.t - last.t < 4) return;
    this.samples.push({
      t: o.t, Pe: o.PeG, Pc: o.PcG, Tr: o.Troom, Tp: o.Tprod, Te: o.Te, Tcoil: o.Tcoil,
      run: o.running, heat: o.heater, door: o.door,
    });
    const cut = o.t - 6 * 3600;
    while (this.samples.length && this.samples[0].t < cut) this.samples.shift();
  }

  draw() {
    const s = setup(this.canvas);
    if (!s) return;
    const { g, w, h } = s;
    const muted = css('--muted');
    g.font = '11px "IBM Plex Sans", system-ui, sans-serif';
    const data = this.samples;
    if (data.length < 2) {
      g.fillStyle = muted;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('Pulsa Simular: aquí verás cómo evolucionan presiones y temperaturas.', w / 2, h / 2);
      return;
    }
    const tEnd = data[data.length - 1].t;
    const tStart = Math.max(data[0].t, tEnd - this.window);
    const view = data.filter((d) => d.t >= tStart);
    const rows = [
      { title: 'ALTA', unit: 'bar', frac: 0.3, series: [{ k: 'Pc', color: css('--hp-gas'), label: 'alta', w: 2 }] },
      { title: 'BAJA', unit: 'bar', frac: 0.3, series: [{ k: 'Pe', color: css('--lp-gas'), label: 'baja', w: 2 }] },
      {
        title: 'TEMPERATURAS', unit: '°C', frac: 0.4,
        series: [
          { k: 'Tr', color: css('--ok'), label: 'cámara', w: 2 },
          { k: 'Tp', color: muted, label: 'género', dash: [4, 3] },
          { k: 'Tcoil', color: css('--lp-mix'), label: 'batería' },
          { k: 'Te', color: css('--lp-gas'), label: 'evaporación' },
        ],
      },
    ];
    // En pantallas anchas, tres gráficas lado a lado; si no, apiladas.
    const wide = w > 820;
    const gap = wide ? 18 : 10;
    let off = 0;
    for (const row of rows) {
      let rect;
      if (wide) {
        const rw = (w - gap * (rows.length - 1)) * row.frac;
        rect = { x: off, y: 0, w: rw, h };
        off += rw + gap;
      } else {
        const rh = (h - gap * (rows.length - 1)) * (row.series.length > 1 ? 0.4 : 0.3);
        rect = { x: 0, y: off, w, h: rh };
        off += rh + gap;
      }
      this._plot(g, rect, row, view, tStart, tEnd, !wide && row !== rows[rows.length - 1]);
    }
  }

  _plot(g, r, row, view, tStart, tEnd, compact) {
    const ink = css('--ink-2');
    const muted = css('--muted');
    const line = css('--line');
    const L = r.x + 40, R = r.x + r.w - 44, T = r.y + 22, strip = compact ? 0 : 9;
    const B = r.y + r.h - (compact ? 4 : 18) - strip;
    const x = (t) => L + ((t - tStart) / Math.max(tEnd - tStart, 1)) * (R - L);
    let lo = Infinity, hi = -Infinity;
    for (const d of view) for (const sr of row.series) {
      lo = Math.min(lo, d[sr.k]);
      hi = Math.max(hi, d[sr.k]);
    }
    if (hi - lo < 1) {
      const m = (hi + lo) / 2;
      lo = m - 0.5;
      hi = m + 0.5;
    }
    const step = niceStep(hi - lo, Math.max(1, Math.min(5, Math.floor((B - T) / 26))));
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const yy = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
    g.lineWidth = 1;
    g.strokeStyle = line;
    g.fillStyle = muted;
    g.font = '10.5px "IBM Plex Sans", system-ui, sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let v = lo; v <= hi + 1e-9; v += step) {
      g.beginPath();
      g.moveTo(L, Math.round(yy(v)) + 0.5);
      g.lineTo(R, Math.round(yy(v)) + 0.5);
      g.stroke();
      g.fillText(fmt(v, step < 1 ? 1 : 0), L - 5, yy(v));
    }
    // Título y leyenda.
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = ink;
    g.font = '600 12px "Barlow Condensed", "Arial Narrow", sans-serif';
    const title = `${row.title} (${row.unit})`;
    g.fillText(title, L, r.y + 13);
    g.font = '10.5px "IBM Plex Sans", system-ui, sans-serif';
    let lx = L + g.measureText(title).width + 12;
    if (row.series.length > 1) {
      for (const sr of row.series) {
        const tw = g.measureText(sr.label).width;
        if (lx + 14 + tw > R + 40) break;
        g.fillStyle = sr.color;
        g.fillRect(lx, r.y + 8, 10, 2.5);
        g.fillStyle = muted;
        g.fillText(sr.label, lx + 13, r.y + 13);
        lx += 22 + tw;
      }
    }
    // Series.
    g.save();
    g.beginPath();
    g.rect(L, T - 4, R - L, B - T + 8);
    g.clip();
    for (const sr of row.series) {
      g.strokeStyle = sr.color;
      g.lineWidth = sr.w || 1.5;
      g.setLineDash(sr.dash || []);
      g.beginPath();
      view.forEach((d, i) => (i ? g.lineTo(x(d.t), yy(d[sr.k])) : g.moveTo(x(d.t), yy(d[sr.k]))));
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
    const last = view[view.length - 1];
    for (const sr of row.series) {
      g.fillStyle = sr.color;
      g.beginPath();
      g.arc(x(last.t), yy(last[sr.k]), 2.8, 0, Math.PI * 2);
      g.fill();
    }
    const sr0 = row.series[0];
    g.fillStyle = sr0.color;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    g.fillText(fmt(last[sr0.k]), R + 6, yy(last[sr0.k]));
    if (compact) return;
    // Franja de estados: marcha del compresor (verde), desescarche (ámbar), puerta (gris).
    const sy = B + 4;
    const bands = [['run', css('--ok')], ['heat', css('--warn')], ['door', muted]];
    const bh = strip / bands.length;
    bands.forEach(([k, color], i) => {
      g.fillStyle = color;
      for (let j = 1; j < view.length; j++) {
        if (view[j - 1][k]) g.fillRect(x(view[j - 1].t), sy + i * bh, Math.max(1, x(view[j].t) - x(view[j - 1].t)), bh - 0.5);
      }
    });
    // Eje de tiempo.
    g.fillStyle = muted;
    g.font = '10.5px "IBM Plex Sans", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    const span = tEnd - tStart;
    const perPx = span / Math.max(R - L, 1);
    const tstep = [60, 120, 300, 600, 900, 1800, 3600].find((st) => st / perPx > 60) || 7200;
    for (let t = Math.ceil(tStart / tstep) * tstep; t <= tEnd; t += tstep) g.fillText(clock(t), x(t), sy + strip + 3);
  }
}

export class PHChart {
  constructor(canvas) {
    this.canvas = canvas;
  }

  draw(o) {
    const s = setup(this.canvas);
    if (!s || !o) return;
    const { g, w, h } = s;
    const ref = getRefrigerant(o.refrigerant);
    const muted = css('--muted');
    const ink = css('--ink-2');
    const lineC = css('--line');
    const Tmin = -60;
    const Tmax = ref.Tc - 0.5;
    const dome = [];
    for (let T = Tmin; T <= Tmax; T += 1) dome.push({ T, P: psat(ref, T), hl: hLiq(ref, T), hv: hVap(ref, T) });
    const hMin = dome[0].hl - 15;
    const hMax = Math.max(...dome.map((d) => d.hv)) + ref.cpV * 110;
    const pMin = dome[0].P * 0.9;
    const pMax = psat(ref, Tmax) * 1.3;
    const L = 48, R = 14, T = 12, B = 30;
    const X = (hh) => L + ((hh - hMin) / (hMax - hMin)) * (w - L - R);
    const Y = (p) => T + (1 - (Math.log(p) - Math.log(pMin)) / (Math.log(pMax) - Math.log(pMin))) * (h - T - B);
    g.font = '10px "IBM Plex Sans", system-ui, sans-serif';
    // Rejilla logarítmica de presión (absoluta).
    g.strokeStyle = lineC;
    g.fillStyle = muted;
    g.lineWidth = 1;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (const p of [0.5, 1, 2, 5, 10, 20, 40]) {
      if (p < pMin || p > pMax) continue;
      g.beginPath();
      g.moveTo(L, Math.round(Y(p)) + 0.5);
      g.lineTo(w - R, Math.round(Y(p)) + 0.5);
      g.stroke();
      g.fillText(`${p}`, L - 6, Y(p));
    }
    g.textAlign = 'center';
    g.textBaseline = 'top';
    const hs = niceStep(hMax - hMin, 6);
    for (let hh = Math.ceil(hMin / hs) * hs; hh <= hMax; hh += hs) {
      g.beginPath();
      g.moveTo(Math.round(X(hh)) + 0.5, T);
      g.lineTo(Math.round(X(hh)) + 0.5, h - B);
      g.stroke();
      g.fillText(`${hh}`, X(hh), h - B + 4);
    }
    g.fillText('entalpía h (kJ/kg)', (L + w - R) / 2, h - 13);
    g.save();
    g.translate(11, (T + h - B) / 2);
    g.rotate(-Math.PI / 2);
    g.fillText('P abs (bar)', 0, -4);
    g.restore();
    // Campana de saturación.
    g.strokeStyle = ink;
    g.lineWidth = 1.6;
    g.beginPath();
    dome.forEach((d, i) => (i ? g.lineTo(X(d.hl), Y(d.P)) : g.moveTo(X(d.hl), Y(d.P))));
    for (let i = dome.length - 1; i >= 0; i--) g.lineTo(X(dome[i].hv), Y(dome[i].P));
    g.stroke();
    g.fillStyle = muted;
    g.textAlign = 'left';
    g.fillText('líquido', X(dome[12].hl) + 4, Y(dome[12].P) - 2);
    g.textAlign = 'right';
    g.fillText('vapor', X(dome[12].hv) - 4, Y(dome[12].P) - 2);

    // Ciclo actual.
    const { h1, h2, h3, h4, Pe, Pc } = o.ph;
    const pts = [[h1, Pe], [h2, Pc], [h3, Pc], [h4, Pe]];
    const alpha = o.running ? 1 : 0.35;
    g.globalAlpha = alpha * 0.16;
    g.fillStyle = css('--accent');
    g.beginPath();
    pts.forEach(([hh, p], i) => (i ? g.lineTo(X(hh), Y(p)) : g.moveTo(X(hh), Y(p))));
    g.closePath();
    g.fill();
    g.globalAlpha = alpha;
    const seg = (a, b, color, dash) => {
      g.strokeStyle = color;
      g.lineWidth = 2.4;
      g.setLineDash(dash || []);
      g.beginPath();
      g.moveTo(X(a[0]), Y(a[1]));
      g.lineTo(X(b[0]), Y(b[1]));
      g.stroke();
      g.setLineDash([]);
    };
    seg(pts[0], pts[1], css('--hp-gas'));
    seg(pts[1], pts[2], css('--hp-liq'));
    seg(pts[2], pts[3], css('--lp-mix'), [5, 4]);
    seg(pts[3], pts[0], css('--lp-gas'));
    g.fillStyle = css('--ink');
    g.font = '600 12px "Barlow Condensed", "Arial Narrow", sans-serif';
    const lab = [['1', 8, 12], ['2', 8, -6], ['3', -12, -6], ['4', -12, 12]];
    pts.forEach(([hh, p], i) => {
      g.beginPath();
      g.arc(X(hh), Y(p), 3.2, 0, Math.PI * 2);
      g.fill();
      g.textAlign = 'center';
      g.fillText(lab[i][0], X(hh) + lab[i][1], Y(p) + lab[i][2] - 6);
    });
    g.globalAlpha = 1;
    // Resumen.
    const q0 = h1 - h4;
    const wk = h2 - h1;
    g.font = '11px "IBM Plex Sans", system-ui, sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'top';
    g.fillStyle = ink;
    const lines = o.running
      ? [
          `${ref.label}`,
          `baja ${fmt(gauge(Pe))} bar · alta ${fmt(gauge(Pc))} bar`,
          `efecto frigorífico h1−h4 = ${fmt(q0, 0)} kJ/kg`,
          `compresión h2−h1 = ${fmt(wk, 0)} kJ/kg`,
          `COP ≈ ${fmt(q0 / Math.max(wk, 1))}`,
        ]
      : [`${ref.label}`, 'compresor parado (ciclo del último funcionamiento)'];
    lines.forEach((l, i) => g.fillText(l, w - R - 4, T + 4 + i * 15));
  }
}
