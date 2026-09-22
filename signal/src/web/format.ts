/** Display formatting (dashboard). */
export const LAMPORTS = 1e9;

export function sol(lamports: number | null | undefined, digits = 3): string {
  if (lamports === null || lamports === undefined || !Number.isFinite(lamports)) return "—";
  return (lamports / LAMPORTS).toFixed(digits);
}

export function signedSol(lamports: number, digits = 3): string {
  const v = lamports / LAMPORTS;
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
}

export function pct(x: number | null | undefined, digits = 0, signed = false): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const v = x * 100;
  return `${signed && v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function num(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Market cap in SOL → "$84k" style when the SOL price is known, else "412 SOL". */
export function mcap(mcapSol: number, solUsd: number): string {
  if (!Number.isFinite(mcapSol)) return "—";
  if (solUsd > 0) return usd(mcapSol * solUsd);
  return `${mcapSol >= 100 ? mcapSol.toFixed(0) : mcapSol.toFixed(1)} SOL`;
}

export function usd(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  return `$${v.toFixed(0)}`;
}

export function age(sec: number): string {
  if (!Number.isFinite(sec)) return "—";
  if (sec < 60) return `${Math.max(0, Math.round(sec))}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

export function ago(ts: number, now = Date.now()): string {
  if (!ts) return "—";
  return `${age((now - ts) / 1000)} ago`;
}

export function short(a: string | undefined | null): string {
  if (!a) return "—";
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const band = (score: number) => (score >= 75 ? "b3" : score >= 60 ? "b2" : "b1");
