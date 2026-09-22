/** Shared dashboard components. */
import type { ComponentChildren } from "preact";
import { band } from "./format";

export function Score({ value, small }: { value: number; small?: string }) {
  return (
    <div class={`score ${band(value)}`} aria-label={`score ${Math.round(value)}`}>
      {Math.round(value)}
      {small && <small>{small}</small>}
    </div>
  );
}

export function Switch({ id, checked, onChange, label, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label class="switch" title={label}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span />
    </label>
  );
}

export function Field({ label, help, children, htmlFor }: { label: string; help?: ComponentChildren; children: ComponentChildren; htmlFor?: string }) {
  return (
    <div class="field">
      <div class="row">
        <label for={htmlFor} style="flex:1">
          {label}
        </label>
        <div class="ctrl">{children}</div>
      </div>
      {help && <div class="help">{help}</div>}
    </div>
  );
}

export function NumInput({ id, value, onChange, step = 1, min, max, suffix, disabled }: { id: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; disabled?: boolean }) {
  return (
    <span class="row" style="gap:6px">
      <input
        id={id}
        class="inp"
        type="number"
        inputMode="decimal"
        value={value}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onInput={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {suffix && <span class="muted">{suffix}</span>}
    </span>
  );
}

export function Stat({ k, v, s, tone }: { k: string; v: ComponentChildren; s?: ComponentChildren; tone?: "good" | "bad" | "" }) {
  return (
    <div class="stat">
      <div class="k">{k}</div>
      <div class={`v num ${tone ?? ""}`}>{v}</div>
      {s !== undefined && <div class="s">{s}</div>}
    </div>
  );
}

export function Tag({ children, tone }: { children: ComponentChildren; tone?: "good" | "bad" | "warn" | "flare" }) {
  return <span class={`tag ${tone ?? ""}`}>{children}</span>;
}

/** Equity sparkline: area fill, faint baseline, emphasized endpoint. */
export function Spark({ points, height = 64 }: { points: { t: number; v: number }[]; height?: number }) {
  if (points.length < 2) return <div class="empty" style="padding:12px">Equity line appears after the first closed trade.</div>;
  const w = 600;
  const h = height;
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const pad = (y1 - y0) * 0.1 || Math.abs(y1) * 0.01 || 1;
  const sx = (x: number) => ((x - x0) / Math.max(1, x1 - x0)) * (w - 8) + 4;
  const sy = (y: number) => h - 4 - ((y - (y0 - pad)) / (y1 + pad - (y0 - pad))) * (h - 8);
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p.t).toFixed(1)},${sy(p.v).toFixed(1)}`).join(" ");
  const last = points[points.length - 1]!;
  const up = last.v >= points[0]!.v;
  const color = up ? "var(--good)" : "var(--bad)";
  return (
    <svg class="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="equity over time">
      <line x1="0" x2={w} y1={sy(points[0]!.v)} y2={sy(points[0]!.v)} stroke="var(--line2)" stroke-dasharray="3 4" stroke-width="1" />
      <path d={`${d} L${sx(last.t)},${h} L${sx(points[0]!.t)},${h} Z`} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} stroke-width="2" vector-effect="non-scaling-stroke" />
      <circle cx={sx(last.t)} cy={sy(last.v)} r="4" fill={color} />
    </svg>
  );
}

/** Score histogram (10 bins), bins at/above the threshold highlighted. */
export function Hist({ bins, threshold }: { bins: number[]; threshold: number }) {
  const max = Math.max(1, ...bins);
  return (
    <div>
      <div class="hist" role="img" aria-label="score distribution">
        {bins.map((b, i) => (
          <i key={i} class={i * 10 + 10 > threshold ? "hot" : ""} style={{ height: `${Math.max(3, (b / max) * 100)}%` }} title={`${i * 10}–${i * 10 + 9}: ${b}`} />
        ))}
      </div>
      <div class="row faint" style="justify-content:space-between;font-size:11px;margin-top:4px">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <div class="empty">{children}</div>;
}

export const Icon = {
  radar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12l6-6" />
    </svg>
  ),
  trades: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  ),
  bot: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M12 3v4M9 12h.01M15 12h.01M9 16h6" />
    </svg>
  ),
  learn: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  ),
};
