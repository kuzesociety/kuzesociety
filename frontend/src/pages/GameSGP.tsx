import { useEffect, useState } from 'react'
import { api } from '../api'
import { ErrorBox, Label, LogBet, type BetDraft } from '../components'
import { STAT_LABELS, odds, pct, signedPct } from '../format'
import type { Report } from './Game'

type Leg = { kind: string; side: string; line?: number | null; team?: string | null; player_id?: string | null; stat?: string | null; label: string }

export default function GameSGP({ gameId, rep }: { gameId: string; rep: Report }) {
  const g = rep.game
  const hr = rep.hard_rock ?? {}
  const [sugg, setSugg] = useState<any | null>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [legs, setLegs] = useState<Leg[]>([])
  const [price, setPrice] = useState('')
  const [res, setRes] = useState<any | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const [pl, setPl] = useState({ player_id: '', stat: '', side: 'over', line: '' })
  const [draft, setDraft] = useState<BetDraft | null>(null)

  useEffect(() => {
    api(`/games/${gameId}/sgp/suggestions`).then(setSugg).catch(setErr)
    api(`/games/${gameId}/props`).then((d) => setPlayers(d.players.filter((p: any) => !p.out))).catch(() => {})
  }, [gameId])

  const add = (l: Leg) => { setLegs([...legs.filter((x) => x.label !== l.label), l]); setRes(null) }
  const gameLegs: Leg[] = []
  if (hr.home_spread != null) {
    gameLegs.push({ kind: 'spread', side: 'home', team: g.home, line: hr.home_spread, label: `${g.home} ${hr.home_spread > 0 ? '+' : ''}${hr.home_spread}` })
    gameLegs.push({ kind: 'spread', side: 'away', team: g.away, line: hr.away_spread, label: `${g.away} ${hr.away_spread > 0 ? '+' : ''}${hr.away_spread}` })
  }
  if (hr.home_ml != null) {
    gameLegs.push({ kind: 'moneyline', side: 'home', team: g.home, label: `${g.home} ML` })
    gameLegs.push({ kind: 'moneyline', side: 'away', team: g.away, label: `${g.away} ML` })
  }
  if (hr.total != null) {
    gameLegs.push({ kind: 'total', side: 'over', line: hr.total, label: `Over ${hr.total}` })
    gameLegs.push({ kind: 'total', side: 'under', line: hr.total, label: `Under ${hr.total}` })
  }
  const sel = players.find((p) => p.player_id === pl.player_id)
  const run = async () => {
    setErr(null)
    try {
      setRes(await api(`/games/${gameId}/sgp`, { body: { legs, odds: price ? Number(price) : null } }))
    } catch (e) {
      setErr(e)
    }
  }
  return (
    <div className="col">
      {draft && <LogBet draft={draft} onClose={() => setDraft(null)} />}
      <div className="notice warn">Books price correlation into SGPs and usually hold 20%+. Build 3–4 legs that share ONE script; bet only when the model's fair odds beat the Hard Rock SGP price.</div>
      <div className="card col">
        <h3>Script-based suggestions</h3>
        {!sugg ? <p className="muted">Loading…</p> : sugg.suggestions.length === 0 ? (
          <p className="muted">Enter Hard Rock game lines and a few prop lines (Props tab) to get script-consistent SGPs.</p>
        ) : (
          <div className="grid grid-2">
            {sugg.suggestions.map((s: any) => (
              <div key={s.script} className="card flat col" style={{ gap: '0.3rem' }}>
                <div className="row between"><strong>{s.script}. {s.name}</strong><small>script {pct(s.script_prob, 0)}</small></div>
                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>{s.legs.map((l: any) => <li key={l.leg}>{l.leg} <small>({pct(l.prob, 0)})</small></li>)}</ul>
                <div className="row"><span>Joint <strong>{pct(s.joint_prob, 1)}</strong></span><span>Fair <strong>{odds(s.fair_odds)}</strong></span><span className="muted">lift ×{s.correlation_lift?.toFixed(2)}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card col">
        <h3>Build your own</h3>
        <div className="row">
          {gameLegs.map((l) => <button key={l.label} className="small" onClick={() => add(l)}>+ {l.label}</button>)}
          {gameLegs.length === 0 && <small>Enter Hard Rock lines in the Report tab to add spread/ML/total legs.</small>}
        </div>
        <div className="row">
          <select value={pl.player_id} onChange={(e) => setPl({ ...pl, player_id: e.target.value, stat: '' })}>
            <option value="">Player…</option>
            {players.map((p) => <option key={p.player_id} value={p.player_id}>{p.team} {p.position} {p.name}</option>)}
          </select>
          <select value={pl.stat} onChange={(e) => setPl({ ...pl, stat: e.target.value })} disabled={!sel}>
            <option value="">Stat…</option>
            {sel && Object.keys(sel.projections).map((s) => <option key={s} value={s}>{STAT_LABELS[s]} (median {sel.projections[s].p50})</option>)}
          </select>
          <select value={pl.side} onChange={(e) => setPl({ ...pl, side: e.target.value })}><option value="over">Over</option><option value="under">Under</option></select>
          <input className="num-in" placeholder="line" value={pl.line} onChange={(e) => setPl({ ...pl, line: e.target.value })} />
          <button className="small" disabled={!sel || !pl.stat || pl.line === ''} onClick={() => add({ kind: 'player', side: pl.side, player_id: pl.player_id, stat: pl.stat, line: Number(pl.line), label: `${sel?.name} ${pl.side} ${pl.line} ${STAT_LABELS[pl.stat]}` })}>+ Add leg</button>
        </div>
        {legs.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {legs.map((l) => <li key={l.label}>{l.label} <button className="small ghost" onClick={() => { setLegs(legs.filter((x) => x.label !== l.label)); setRes(null) }}>✕</button></li>)}
          </ul>
        )}
        <div className="row">
          <label className="field">Hard Rock SGP price<input className="num-in" placeholder="+450" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          <button className="primary" disabled={legs.length < 2} onClick={run}>Simulate 40,000 games</button>
        </div>
        <ErrorBox error={err} />
        {res && (
          <div className="col" style={{ gap: '0.3rem' }}>
            <div className="row">
              <span>Joint <strong>{pct(res.joint_prob, 1)}</strong></span>
              <span>Fair <strong>{odds(res.fair_odds)}</strong></span>
              <span className="muted">independent {pct(res.independent_prob, 1)} · lift ×{res.correlation_lift?.toFixed(2)}</span>
              {res.ev != null && <><span>EV <strong>{signedPct(res.ev)}</strong></span><Label value={res.label} /></>}
            </div>
            {res.warning && <p className="error">{res.warning}</p>}
            <table><tbody>{res.legs.map((l: any) => <tr key={l.leg}><td>{l.leg}</td><td className="num">{pct(l.prob, 1)}</td><td className="num">fair {odds(l.fair_odds)}</td></tr>)}</tbody></table>
            {res.ev != null && <div><button className="small" onClick={() => setDraft({ game_id: gameId, market: 'sgp', selection: `SGP: ${legs.map((l) => l.label).join(' + ')}`, odds: Number(price), legs: { legs: legs.map(({ label: _l, ...rest }) => rest) }, model_prob: res.joint_prob, model_ev: res.ev, label: res.label })}>Log this SGP</button></div>}
          </div>
        )}
      </div>
    </div>
  )
}
