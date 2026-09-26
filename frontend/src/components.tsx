import { createContext, useContext, useState, type ReactNode } from 'react'
import { api } from './api'
import { odds as fmtOdds } from './format'

export type User = {
  id: number
  username: string
  display_name: string
  bankroll: number
  kelly_mult: number
  max_bet_pct: number
  unit_size: number
}

export const UserCtx = createContext<{ user: User | null; setUser: (u: User | null) => void }>({
  user: null,
  setUser: () => {},
})
export const useUser = () => useContext(UserCtx)

const LABEL_ICON: Record<string, string> = { PLAY: '✓', SMALLER: '½', LEAN: '→', PASS: '–', UNKNOWN: '?' }

/** PLAY / SMALLER / LEAN / PASS / UNKNOWN: icon + text, never color alone. */
export function Label({ value }: { value?: string | null }) {
  if (!value) return null
  const v = value.toUpperCase()
  return (
    <span className={`chip ${v.toLowerCase()}`} title={LABEL_HELP[v] ?? v}>
      <span className="ic" aria-hidden>{LABEL_ICON[v] ?? '•'}</span>
      {v}
    </span>
  )
}

const LABEL_HELP: Record<string, string> = {
  PLAY: 'Edge clears the PLAY bar at this exact Hard Rock price and confidence is high enough',
  SMALLER: 'Real edge but an open uncertainty (or thin cushion): half stake',
  LEAN: 'Positive but below the PLAY bar, or downgraded by uncertainty: no bet or tiny',
  PASS: 'No edge at this price',
  UNKNOWN: 'Critical information is unverified (QB status, line missing): resolve before betting',
}

export function Result({ value }: { value: string }) {
  const icon: Record<string, string> = { win: '✓', loss: '✗', push: '=', void: '∅', pending: '…' }
  return (
    <span className={`chip ${value}`}>
      <span className="ic" aria-hidden>{icon[value] ?? '•'}</span>
      {value.toUpperCase()}
    </span>
  )
}

export function Conf({ value }: { value?: string | null }) {
  if (!value) return null
  const bars = { HIGH: 4, 'MEDIUM+': 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 }[value] ?? 0
  return (
    <span className="conf" title="Data confidence">
      <span aria-hidden>{'▮'.repeat(bars)}{'▯'.repeat(4 - bars)}</span> {value}
    </span>
  )
}

export function Flags({ flags }: { flags: { code: string; text: string; severity: number }[] }) {
  if (!flags?.length) return <p className="muted">No open uncertainties.</p>
  const sym = ['', 'i', '!', '‼']
  return (
    <div>
      {flags.map((f) => (
        <div className="flag" key={f.code + f.text}>
          <span className={`sev sev-${f.severity}`} aria-label={`severity ${f.severity}`}>{sym[f.severity]}</span>
          <span>{f.text}</span>
        </div>
      ))}
    </div>
  )
}

export function Tile({ label, value, delta }: { label: string; value: ReactNode; delta?: ReactNode }) {
  return (
    <div className="card tile">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {delta !== undefined && <span className="delta">{delta}</span>}
    </div>
  )
}

export type BetDraft = {
  game_id: string
  market: string
  selection: string
  odds: number
  line?: number | null
  side?: string | null
  player_id?: string | null
  stat?: string | null
  legs?: Record<string, unknown> | null
  model_prob?: number | null
  model_ev?: number | null
  label?: string | null
  confidence?: string | null
  suggested_stake?: number | null
}

/** "Log bet" modal: records what was actually bet (price & stake) for grading, ROI and CLV. */
export function LogBet({ draft, onClose }: { draft: BetDraft; onClose: (saved: boolean) => void }) {
  const { user } = useUser()
  const [odds, setOdds] = useState(String(draft.odds))
  const [lineVal, setLineVal] = useState(draft.line != null ? String(draft.line) : '')
  const [stake, setStake] = useState(String(draft.suggested_stake && draft.suggested_stake > 0 ? draft.suggested_stake : user?.unit_size ?? 10))
  const [notes, setNotes] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      await api('/bets', {
        body: {
          ...draft, odds: Number(odds), stake: Number(stake), line: lineVal === '' ? null : Number(lineVal), notes,
          suggested_stake: undefined,
        },
      })
      onClose(true)
    } catch (e) {
      setErr(String((e as Error).message))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal-back" onClick={() => onClose(false)}>
      <div className="modal col" onClick={(e) => e.stopPropagation()}>
        <h3>Log bet</h3>
        <div className="row between">
          <strong>{draft.selection}</strong>
          <Label value={draft.label} />
        </div>
        <p className="muted">Enter the exact price you got at Hard Rock. Model EV at {fmtOdds(draft.odds)}: {draft.model_ev != null ? `${(draft.model_ev * 100).toFixed(1)}%` : '—'}</p>
        <div className="row">
          <label className="field">Odds<input className="num-in" value={odds} onChange={(e) => setOdds(e.target.value)} /></label>
          {draft.line != null && <label className="field">Line<input className="num-in" value={lineVal} onChange={(e) => setLineVal(e.target.value)} /></label>}
          <label className="field">Stake ($)<input className="num-in" value={stake} onChange={(e) => setStake(e.target.value)} /></label>
        </div>
        <label className="field">Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" /></label>
        {err && <p className="error">{err}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={() => onClose(false)}>Cancel</button>
          <button className="primary" disabled={busy} onClick={save}>Save bet</button>
        </div>
      </div>
    </div>
  )
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <div className="loading">{what}…</div>
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const msg = String((error as Error)?.message ?? error)
  const warming = msg.toLowerCase().includes('warming')
  return <div className={`notice ${warming ? '' : 'warn'}`}>{warming ? '⏳ ' : '⚠ '}{msg}</div>
}
