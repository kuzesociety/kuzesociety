import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { ErrorBox, Label, Loading, LogBet, type BetDraft } from '../components'
import { STAT_LABELS, num, odds, pct, signedPct } from '../format'

type Player = Record<string, any>
type Priced = Record<string, any>
const POS_STATS: Record<string, string[]> = {
  QB: ['passing_yards', 'attempts', 'completions', 'passing_tds', 'rushing_yards', 'carries'],
  RB: ['rushing_yards', 'carries', 'rush_rec_yards', 'receptions', 'receiving_yards'],
  WR: ['receiving_yards', 'receptions', 'targets'],
  TE: ['receiving_yards', 'receptions', 'targets'],
}

export default function GameProps({ gameId }: { gameId: string }) {
  const [data, setData] = useState<{ players: Player[]; lines: Priced[]; best_by_team: Record<string, any[]> } | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const [form, setForm] = useState({ player_id: '', stat: '', line: '', over_odds: '-110', under_odds: '-110' })
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<BetDraft | null>(null)
  const [team, setTeam] = useState<string>('')

  const load = useCallback(() => {
    api(`/games/${gameId}/props`).then((d) => { setData(d); setErr(null) }).catch(setErr)
  }, [gameId])
  useEffect(() => { load() }, [load])

  const teams = useMemo(() => Array.from(new Set((data?.players ?? []).map((p) => p.team))), [data])
  const active = useMemo(() => (data?.players ?? []).filter((p) => !p.out), [data])
  const out = useMemo(() => (data?.players ?? []).filter((p) => p.out), [data])
  const selPlayer = data?.players.find((p) => p.player_id === form.player_id)
  const statsFor = selPlayer ? POS_STATS[selPlayer.position] ?? [] : []

  const submit = async () => {
    setBusy(true)
    try {
      const r = await api<{ lines: Priced[] }>(`/games/${gameId}/props/lines`, {
        body: { player_id: form.player_id, stat: form.stat, line: Number(form.line), over_odds: Number(form.over_odds), under_odds: Number(form.under_odds) },
      })
      setData((d) => (d ? { ...d, lines: r.lines } : d))
      setForm({ ...form, line: '' })
      load()
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  const remove = async (id: number) => {
    const r = await api<{ lines: Priced[] }>(`/games/${gameId}/props/lines/${id}`, { method: 'DELETE' })
    setData((d) => (d ? { ...d, lines: r.lines } : d))
  }

  if (err && !data) return <ErrorBox error={err} />
  if (!data) return <Loading what="Projecting players" />
  const shown = active.filter((p) => !team || p.team === team)
  const outShown = out.filter((p) => !team || p.team === team)
  return (
    <div className="col">
      {draft && <LogBet draft={draft} onClose={() => setDraft(null)} />}
      <div className="card col">
        <h3>Enter a Hard Rock prop</h3>
        <div className="row">
          <select value={form.player_id} onChange={(e) => setForm({ ...form, player_id: e.target.value, stat: '' })}>
            <option value="">Player…</option>
            {active.map((p) => <option key={p.player_id} value={p.player_id}>{p.team} {p.position} {p.name}</option>)}
          </select>
          <select value={form.stat} onChange={(e) => setForm({ ...form, stat: e.target.value })} disabled={!selPlayer}>
            <option value="">Stat…</option>
            {statsFor.map((s) => <option key={s} value={s}>{STAT_LABELS[s]}</option>)}
          </select>
          <input className="num-in" placeholder="line" value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })} />
          <input className="num-in" placeholder="over" value={form.over_odds} onChange={(e) => setForm({ ...form, over_odds: e.target.value })} />
          <input className="num-in" placeholder="under" value={form.under_odds} onChange={(e) => setForm({ ...form, under_odds: e.target.value })} />
          <button className="primary" disabled={busy || !form.player_id || !form.stat || form.line === ''} onClick={submit}>Price it</button>
        </div>
        <small>Rule: compare the model's distribution with the Hard Rock line. Yardage is right-skewed (mean above median), so a big mean can still be an UNDER. Enter both prices: the fair probability blends the model with Hard Rock's no-vig price (props are where models fool themselves most). Max 2 props per team.</small>
      </div>

      {data.lines.length > 0 && (
        <div className="card">
          <h3>Hard Rock props vs the model</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Player</th><th>Prop</th><th className="num">Line</th><th className="num">Mean</th><th className="num">Median</th><th className="num">P(over)</th><th>Over</th><th>Under</th><th></th></tr></thead>
              <tbody>
                {data.lines.filter((l) => l.stat !== 'anytime_td').map((l) => {
                  const over = l.sides?.find((s: any) => s.side === 'over')
                  const under = l.sides?.find((s: any) => s.side === 'under')
                  const cell = (s: any) => s ? (
                    <span className="row" style={{ gap: '0.3rem' }}>
                      <Label value={s.label} /><span className="num">{odds(s.odds)} · {signedPct(s.ev)}</span>
                      <button className="small ghost" onClick={() => setDraft({ game_id: gameId, market: 'prop', side: s.side, selection: `${l.player} ${s.side === 'over' ? 'Over' : 'Under'} ${l.line} ${STAT_LABELS[l.stat]}`, odds: s.odds, line: l.line, player_id: l.player_id, stat: l.stat, model_prob: s.win, model_ev: s.ev, label: s.label, confidence: s.confidence })}>Log</button>
                    </span>
                  ) : '—'
                  return (
                    <tr key={l.id}>
                      <td>{l.player}</td><td>{STAT_LABELS[l.stat]}</td><td className="num">{l.line}</td>
                      <td className="num">{num(l.projection)}</td><td className="num">{num(l.median)}</td>
                      <td className="num">{pct(l.p_over, 0)}{l.p_over_market != null && <><br /><small className="muted">model {pct(l.p_over_model, 0)} · book {pct(l.p_over_market, 0)}</small></>}</td>
                      <td>{cell(over)}</td><td>{cell(under)}</td>
                      <td><button className="small ghost" onClick={() => remove(l.id)} title="Remove">✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {Object.keys(data.best_by_team).length > 0 && (
            <p><strong>Best by team (max 2):</strong> {Object.entries(data.best_by_team).map(([t, ps]) => `${t}: ${ps.map((p: any) => `${p.player} ${p.side} ${p.line} ${STAT_LABELS[p.stat]} (${signedPct(p.ev)})`).join('; ')}`).join(' | ')}</p>
          )}
        </div>
      )}

      <div className="card">
        <div className="section-title">
          <h3>Projections</h3>
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Both teams</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Player</th><th>Status</th><th className="num">Tgt share</th><th className="num">Carry share</th><th className="num">Snap%</th><th>Projection (mean · median · 10–90%)</th></tr></thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.player_id}>
                  <td><strong>{p.name}</strong> <small>{p.team} {p.position}</small></td>
                  <td>{p.status ?? <span className="muted">—</span>}{p.p_play < 0.95 && <small> ({pct(p.p_play, 0)} to play)</small>}</td>
                  <td className="num">{pct(p.usage.target_share, 0)}</td>
                  <td className="num">{pct(p.usage.carry_share, 0)}</td>
                  <td className="num">{pct(p.usage.snap_pct, 0)}</td>
                  <td style={{ whiteSpace: 'normal' }}>
                    {(POS_STATS[p.position] ?? []).filter((s) => p.projections[s]).slice(0, 4).map((s) => {
                      const x = p.projections[s]
                      return <span key={s} className="pill" style={{ margin: '0.1rem' }}>{STAT_LABELS[s]} <strong>{num(x.mean)}</strong> · {num(x.p50)} · {num(x.p10, 0)}–{num(x.p90, 0)}</span>
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {outShown.length > 0 && (
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            <strong>Out</strong> (their targets and carries are redistributed): {outShown.map((p) => `${p.name} ${p.team} ${p.position} (${p.status ?? 'out'})`).join(' · ')}
          </p>
        )}
        <small>Projections = team volume × player share × efficiency, calibrated out of sample (2019–2025). Shares re-normalize when teammates are out.</small>
      </div>
    </div>
  )
}
