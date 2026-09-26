export const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

export function odds(o: number | null | undefined): string {
  if (!isNum(o)) return '—'
  const r = Math.round(o)
  return r > 0 ? `+${r}` : `${r}`
}

export function line(l: number | null | undefined): string {
  if (!isNum(l)) return '—'
  if (l === 0) return 'PK'
  return l > 0 ? `+${l}` : `${l}`
}

export function pct(x: number | null | undefined, digits = 1): string {
  if (!isNum(x)) return '—'
  return `${(x * 100).toFixed(digits)}%`
}

export function signedPct(x: number | null | undefined, digits = 1): string {
  if (!isNum(x)) return '—'
  const v = (x * 100).toFixed(digits)
  return x > 0 ? `+${v}%` : `${v}%`
}

export function num(x: number | null | undefined, digits = 1): string {
  if (!isNum(x)) return '—'
  return x.toFixed(digits)
}

export function signed(x: number | null | undefined, digits = 1): string {
  if (!isNum(x)) return '—'
  return x > 0 ? `+${x.toFixed(digits)}` : x.toFixed(digits)
}

export function money(x: number | null | undefined): string {
  if (!isNum(x)) return '—'
  const s = Math.abs(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return x < 0 ? `-$${s}` : `$${s}`
}

export function kickoff(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

export const STAT_LABELS: Record<string, string> = {
  receptions: 'Receptions', receiving_yards: 'Receiving yds', targets: 'Targets', carries: 'Rush att',
  rushing_yards: 'Rushing yds', rush_rec_yards: 'Rush+Rec yds', attempts: 'Pass att', completions: 'Completions',
  passing_yards: 'Passing yds', passing_tds: 'Passing TDs', anytime_td: 'Anytime TD',
}
