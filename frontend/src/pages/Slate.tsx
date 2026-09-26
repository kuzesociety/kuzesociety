import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Conf, ErrorBox, Label, Loading } from '../components'
import { ago, kickoff, line, odds, pct, signedPct } from '../format'

type SlateGame = {
  game_id: string
  home: string
  away: string
  kickoff_utc: string
  stadium?: string
  roof?: string
  home_qb?: string
  away_qb?: string
  final: boolean
  score?: { home: number; away: number } | null
  market: { spread_line: number | null; total_line: number | null; home_ml: number | null; away_ml: number | null }
  model?: {
    fair_margin: number
    fair_total: number
    fair_spread: { text: string }
    fair_total_line: number
    win_prob: { home: number; away: number }
  }
  hard_rock?: Record<string, number | null> | null
  confidence?: Record<string, string>
  flags?: number
  primary?: { selection: string; odds: number; ev: number; label: string } | null
  labels?: Record<string, string>
  best_ev?: number | null
  error?: string
}
type Slate = { season: number; week: number; weeks: number[]; games: SlateGame[]; model_version: string; data_built_at: string }

function marketText(g: SlateGame) {
  const s = g.market.spread_line
  if (s == null) return '—'
  const fav = s >= 0 ? g.home : g.away
  return `${fav} ${line(-Math.abs(s))} · ${g.market.total_line ?? '—'}`
}

function hrText(hr: Record<string, number | null>, g: SlateGame) {
  const parts: string[] = []
  if (hr.home_spread != null) {
    const fav = (hr.home_spread as number) <= 0 ? g.home : g.away
    const l = (hr.home_spread as number) <= 0 ? hr.home_spread : hr.away_spread
    const o = (hr.home_spread as number) <= 0 ? hr.home_spread_odds : hr.away_spread_odds
    parts.push(`${fav} ${line(l)} (${odds(o)})`)
  }
  if (hr.home_ml != null) parts.push(`ML ${odds(hr.away_ml)}/${odds(hr.home_ml)}`)
  if (hr.total != null) parts.push(`O/U ${hr.total}`)
  return parts.join(' · ')
}

export default function Slate() {
  const [data, setData] = useState<Slate | null>(null)
  const [week, setWeek] = useState<{ season: number; week: number } | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const nav = useNavigate()

  const load = useCallback(() => {
    const q = week ? `?season=${week.season}&week=${week.week}` : ''
    setErr(null)
    api<Slate>(`/slate${q}`).then(setData).catch(setErr)
  }, [week])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    if (!(err as { status?: number })?.status || (err as { status?: number }).status !== 503) return
    const t = setTimeout(load, 8000)
    return () => clearTimeout(t)
  }, [err, load])

  if (err && !data) return <ErrorBox error={err} />
  if (!data) return <Loading what="Running the model on this week" />
  const plays = data.games.filter((g) => g.primary)
  return (
    <div className="col">
      <div className="row between">
        <div className="row">
          <h1>Week {data.week}</h1>
          <select value={`${data.season}-${data.week}`} onChange={(e) => {
            const [s, w] = e.target.value.split('-').map(Number)
            setWeek({ season: s, week: w })
            setData(null)
          }}>
            {data.weeks.map((w) => <option key={w} value={`${data.season}-${w}`}>{data.season} · Week {w}</option>)}
          </select>
        </div>
        <span className="muted" style={{ fontSize: '0.8rem' }}>model {data.model_version} · data {ago(data.data_built_at)}</span>
      </div>
      <div className="notice">
        {plays.length
          ? <>✓ {plays.length} game{plays.length > 1 ? 's' : ''} with a bet that clears the bar at the Hard Rock price.</>
          : <>Enter the exact Hard Rock lines on a game to evaluate bets. Most games should be a PASS: the market is sharp and the model only acts on real price edges.</>}
      </div>
      <div className="grid grid-3">
        {data.games.map((g) => (
          <div key={g.game_id} className="card game-card" onClick={() => nav(`/game/${g.game_id}`)} role="link" tabIndex={0}
               onKeyDown={(e) => e.key === 'Enter' && nav(`/game/${g.game_id}`)}>
            <div className="teams">
              <div>
                <div className="team-name">{g.away} <span className="muted">@</span> {g.home}</div>
                <small>{g.away_qb ?? '?'} vs {g.home_qb ?? '?'}</small>
              </div>
              {g.final && g.score
                ? <span className="pill num">FINAL {g.score.away}-{g.score.home}</span>
                : <span className="pill">{kickoff(g.kickoff_utc)}</span>}
            </div>
            {g.error && <p className="error">{g.error}</p>}
            {g.model && (
              <dl className="kv">
                <dt>Market</dt><dd>{marketText(g)}</dd>
                <dt>Model fair</dt>
                <dd><strong>{g.model.fair_spread.text}</strong> · {g.model.fair_total_line} · {g.model.win_prob.home >= 0.5 ? g.home : g.away} {pct(Math.max(g.model.win_prob.home, g.model.win_prob.away), 0)}</dd>
                <dt>Hard Rock</dt>
                <dd>{g.hard_rock ? hrText(g.hard_rock, g) : <span className="muted">not entered</span>}</dd>
              </dl>
            )}
            <div className="row between">
              {g.primary
                ? <span className="row" style={{ gap: '0.4rem' }}><Label value={g.primary.label} /><strong>{g.primary.selection}</strong> <span className="muted">{odds(g.primary.odds)} · EV {signedPct(g.primary.ev)}</span></span>
                : g.hard_rock ? <Label value="PASS" /> : <span className="muted" style={{ fontSize: '0.82rem' }}>no bet evaluated</span>}
              {g.confidence && <Conf value={g.confidence.spread} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
