import { useEffect, useState } from 'react'
import { api } from '../api'
import { Conf, Flags, Label, LogBet, type BetDraft } from '../components'
import { isNum, line, num, odds, pct, signed, signedPct } from '../format'
import type { Report } from './Game'

type Bet = Record<string, any>

/* ------------------------------------------------------------------ lines entry */
function LinesForm({ rep, onSaved }: { rep: Report; onSaved: (r: Report) => void }) {
  const hr = rep.hard_rock ?? {}
  const g = rep.game
  const init = (k: string) => (hr[k] != null ? String(hr[k]) : '')
  const [f, setF] = useState<Record<string, string>>({
    home_spread: init('home_spread'), home_spread_odds: init('home_spread_odds') || '-110',
    away_spread_odds: init('away_spread_odds') || '-110', home_ml: init('home_ml'), away_ml: init('away_ml'),
    total: init('total'), over_odds: init('over_odds') || '-110', under_odds: init('under_odds') || '-110',
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    const body: Record<string, number> = {}
    for (const [k, v] of Object.entries(f)) if (v.trim() !== '') body[k] = Number(v)
    if (body.home_spread != null) body.away_spread = -body.home_spread
    setBusy(true)
    setErr('')
    try {
      onSaved(await api<Report>(`/games/${g.game_id}/lines`, { body }))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card col">
      <div className="section-title"><h3>Hard Rock lines</h3>{hr.updated_at && <small>{hr.source} · saved</small>}</div>
      <div className="row">
        <label className="field">{g.home} spread<input className="num-in" value={f.home_spread} onChange={set('home_spread')} placeholder="-3.5" /></label>
        <label className="field">{g.home} odds<input className="num-in" value={f.home_spread_odds} onChange={set('home_spread_odds')} /></label>
        <label className="field">{g.away} odds<input className="num-in" value={f.away_spread_odds} onChange={set('away_spread_odds')} /></label>
      </div>
      <div className="row">
        <label className="field">{g.home} ML<input className="num-in" value={f.home_ml} onChange={set('home_ml')} placeholder="-175" /></label>
        <label className="field">{g.away} ML<input className="num-in" value={f.away_ml} onChange={set('away_ml')} placeholder="+150" /></label>
      </div>
      <div className="row">
        <label className="field">Total<input className="num-in" value={f.total} onChange={set('total')} placeholder="44.5" /></label>
        <label className="field">Over<input className="num-in" value={f.over_odds} onChange={set('over_odds')} /></label>
        <label className="field">Under<input className="num-in" value={f.under_odds} onChange={set('under_odds')} /></label>
      </div>
      {err && <p className="error">{err}</p>}
      <button className="primary" disabled={busy} onClick={save}>Save & run the model</button>
      <small>Use the exact Hard Rock number: a half-point or price change can flip PLAY to PASS.</small>
    </div>
  )
}

/* ------------------------------------------------------------------ best bet */
function BetCard({ b, title, onLog }: { b: Bet; title: string; onLog: (b: Bet) => void }) {
  const th = b.thresholds ?? {}
  const isML = b.market === 'moneyline'
  return (
    <div className="card col bet-hero">
      <div className="section-title"><h4>{title}</h4><Label value={b.label} /></div>
      <div className="row between">
        <span className="bet-line">{b.selection} <span className="secondary">{odds(b.odds)}</span></span>
        <Conf value={b.confidence} />
      </div>
      <div className="thresholds">
        <div><span>EV</span><strong>{signedPct(b.ev)}</strong></div>
        <div><span>Win prob</span>{pct(b.win_pct_no_push)}{b.push > 0.001 && <small> · push {pct(b.push)}</small>}</div>
        <div><span>Fair price</span>{odds(b.fair_odds)}</div>
        <div><span>Stake</span>{b.stake?.units ? `${b.stake.units}u ($${b.stake.amount})` : '—'}</div>
      </div>
      <div className="thresholds">
        {isML ? (
          <>
            <div><span>Playable to</span>{odds(th.playable_to)}</div>
            <div><span>Lean to</span>{odds(th.lean_to)}</div>
            <div><span>Fair price</span>{odds(th.fair_price)}</div>
          </>
        ) : (
          <>
            <div><span>Best (now)</span>{line(b.line)}</div>
            <div><span>Playable to</span>{line(th.playable_to)}</div>
            <div><span>Pass at</span>{line(th.pass_at)}</div>
          </>
        )}
        {isNum(b.vs_market_pts) && <div><span>vs market fair</span>{signed(b.vs_market_pts)} pts</div>}
      </div>
      <div><button className="small" onClick={() => onLog(b)}>Log bet</button></div>
    </div>
  )
}

/* ------------------------------------------------------------------ QB override */
function QBPanel({ rep, onSaved }: { rep: Report; onSaved: (r: Report) => void }) {
  const g = rep.game
  const [cands, setCands] = useState<Record<string, any> | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api(`/games/${g.game_id}/qbs`).then(setCands).catch(() => setCands(null))
  }, [g.game_id])
  const set = async (side: string, qb_id: string, name: string) => {
    setBusy(true)
    try {
      onSaved(await api<Report>(`/games/${g.game_id}/qb`, { body: { side, qb_id, qb_name: name, confirmed: true } }))
    } finally {
      setBusy(false)
    }
  }
  const clear = async (side: string) => {
    setBusy(true)
    try {
      onSaved(await api<Report>(`/games/${g.game_id}/qb/${side}`, { method: 'DELETE' }))
    } finally {
      setBusy(false)
    }
  }
  const qb = rep.qb ?? {}
  return (
    <div className="card col">
      <h3>QB analysis <small>(very high priority)</small></h3>
      <div className="grid grid-2">
        {(['away', 'home'] as const).map((side) => {
          const team = side === 'home' ? g.home : g.away
          const q = qb[team] ?? {}
          const cur = q.current ?? {}
          const l3 = q.last3 ?? {}
          const base = q.baseline ?? {}
          const ov = rep.qb_overrides?.[side]
          return (
            <div key={side} className="col" style={{ gap: '0.4rem' }}>
              <div className="row between">
                <strong>{team}: {q.name ?? '?'}</strong>
                {ov?.confirmed ? <span className="chip win"><span className="ic">✓</span>CONFIRMED</span> : <span className="chip unknown"><span className="ic">?</span>NOT CONFIRMED</span>}
              </div>
              <small>Model QB value {signed(q.model_value_epa, 3)} EPA/play vs league · {signed(q.delta_vs_recent, 3)} vs QBs behind recent numbers · {q.career_qb_plays ?? 0} career QB plays</small>
              <div className="table-wrap">
                <table>
                  <thead><tr><th></th><th className="num">EPA/db</th><th className="num">CPOE</th><th className="num">Comp%</th><th className="num">YPA</th><th className="num">aDOT</th><th className="num">TD%</th><th className="num">INT%</th><th className="num">Sack%</th><th className="num">TWP%</th></tr></thead>
                  <tbody>
                    {[['2026', cur], ['Last 3', l3], ['2025', base]].map(([lab, s]: any) => (
                      <tr key={lab}>
                        <td>{lab} <small>({s.dropbacks ?? 0} db)</small></td>
                        <td className="num">{num(s.epa_db, 3)}</td><td className="num">{num(s.cpoe, 1)}</td>
                        <td className="num">{pct(s.comp_pct, 0)}</td><td className="num">{num(s.ypa, 1)}</td>
                        <td className="num">{num(s.adot, 1)}</td><td className="num">{pct(s.td_pct, 1)}</td>
                        <td className="num">{pct(s.int_pct, 1)}</td><td className="num">{pct(s.sack_pct, 1)}</td>
                        <td className="num">{pct(s.turnover_worthy_rate, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <small>Early-down EPA {num(cur.early_epa, 3)} · 3rd-down EPA {num(cur.third_epa, 3)} · RZ EPA {num(cur.rz_epa, 3)} · rush EPA {num(cur.rush_epa, 1)} ({cur.scrambles ?? 0} scrambles, {cur.designed_runs ?? 0} designed runs) · EPA when hit/sacked {num(cur.pressure_proxy_epa, 2)}</small>
              {cands?.[side] && (
                <div className="row">
                  <select disabled={busy} value="" onChange={(e) => {
                    const c = cands[side].candidates.find((x: any) => x.qb_id === e.target.value)
                    if (c) set(side, c.qb_id, c.name)
                  }}>
                    <option value="">Set / confirm starter…</option>
                    {cands[side].candidates.map((c: any) => <option key={c.qb_id} value={c.qb_id}>{c.name} ({Math.round(c.plays)} plays)</option>)}
                  </select>
                  {ov && <button className="small ghost" disabled={busy} onClick={() => clear(side)}>Reset</button>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ baseline / form */
const FORM_ROWS: [string, string, (s: any) => string][] = [
  ['Record', 'record', (s) => s.record ?? '—'],
  ['Points / game', 'ppg', (s) => num(s.ppg)],
  ['Allowed / game', 'papg', (s) => num(s.papg)],
  ['Point diff / game', 'diff', (s) => signed(s.diff_pg)],
  ['Off EPA/play', 'oe', (s) => num(s.off?.epa_play, 3)],
  ['Def EPA/play', 'de', (s) => num(s.def?.epa_play, 3)],
  ['Off pass EPA', 'ope', (s) => num(s.off?.pass_epa, 3)],
  ['Off rush EPA', 'ore', (s) => num(s.off?.rush_epa, 3)],
  ['Off success', 'os', (s) => pct(s.off?.success, 1)],
  ['Def success allowed', 'ds', (s) => pct(s.def?.success, 1)],
  ['Pts / drive', 'ppd', (s) => num(s.off?.pts_drive, 2)],
  ['Pts / drive allowed', 'dppd', (s) => num(s.def?.pts_drive, 2)],
  ['Red-zone TD%', 'rz', (s) => pct(s.off?.rz_td, 0)],
  ['Explosive pass %', 'xp', (s) => pct(s.off?.exp_pass, 1)],
  ['Sack % allowed', 'sk', (s) => pct(s.off?.sack_rate, 1)],
  ['Sack % forced', 'skf', (s) => pct(s.def?.sack_rate, 1)],
  ['Turnover margin', 'to', (s) => (s.to_margin != null ? signed(s.to_margin, 0) : '—')],
]

function FormTable({ rep }: { rep: Report }) {
  const g = rep.game
  const cols: [string, any][] = []
  for (const t of [g.away, g.home]) {
    cols.push([`${t} 2025`, rep.baseline?.[t] ?? {}])
    cols.push([`${t} 2026`, rep.current?.[t]?.season ?? {}])
    cols.push([`${t} L3`, rep.current?.[t]?.last3 ?? {}])
    cols.push([`${t} L5`, rep.current?.[t]?.last5 ?? {}])
  }
  return (
    <div className="card">
      <h3>2025 baseline + 2026 current form</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th></th>{cols.map(([c]) => <th key={c} className="num">{c}</th>)}</tr></thead>
          <tbody>
            {FORM_ROWS.map(([lab, key, f]) => (
              <tr key={key}><td>{lab}</td>{cols.map(([c, s]) => <td key={c} className="num">{s?.games ? f(s) : '—'}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <small>The model itself uses opponent-adjusted, recency-weighted ratings (2025 fades as 2026 games accumulate); raw splits are context.</small>
    </div>
  )
}

/* ------------------------------------------------------------------ matchups */
function Matchups({ rep }: { rep: Report }) {
  const m = rep.matchups ?? {}
  const g = rep.game
  const r = m.ratings ?? {}
  const rows: [string, string][] = [['off_pass_epa', 'Pass offense EPA'], ['off_rush_epa', 'Rush offense EPA'], ['def_pass_epa', 'Pass defense EPA'],
    ['def_rush_epa', 'Run defense EPA'], ['off_sack_rate', 'Sack rate allowed'], ['def_sack_rate', 'Sack rate forced'],
    ['off_ppd', 'Pts/drive (off)'], ['def_ppd', 'Pts/drive (def)'], ['off_pace', 'Neutral sec/play']]
  return (
    <div className="card col">
      <h3>Matchup exploit engine</h3>
      {(m.exploits ?? []).length ? (
        <ol style={{ margin: 0, paddingLeft: '1.2rem' }}>
          {m.exploits.map((x: any) => <li key={x.text} style={{ margin: '0.25rem 0' }}>{x.text}</li>)}
        </ol>
      ) : <p className="muted">No meaningful edges.</p>}
      <div className="row">
        {(m.ol_vs_rush ?? []).map((v: any) => (
          <span key={v.offense} className="pill">{v.offense} OL (#{v.ol_rank}) vs {v.defense} rush (#{v.rush_rank}): <strong>{v.verdict}</strong></span>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Opponent-adjusted</th><th className="num">{g.away}</th><th className="num">rank</th><th className="num">{g.home}</th><th className="num">rank</th></tr></thead>
          <tbody>
            {rows.map(([k, lab]) => (
              <tr key={k}>
                <td>{lab}</td>
                <td className="num">{signed(r.values?.[g.away]?.[k], 3)}</td><td className="num">#{r.ranks?.[k]?.[g.away] ?? '—'}</td>
                <td className="num">{signed(r.values?.[g.home]?.[k], 3)}</td><td className="num">#{r.ranks?.[k]?.[g.home] ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small>Ratings are vs league average (per play); defense: lower EPA allowed is better. Ranks 1 = best.</small>
    </div>
  )
}

/* ------------------------------------------------------------------ injuries */
function Injuries({ rep, onSaved }: { rep: Report; onSaved: (r: Report) => void }) {
  const g = rep.game
  const inj = rep.injuries ?? {}
  const [player, setPlayer] = useState('')
  const [pp, setPp] = useState('0')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      onSaved(await api<Report>(`/games/${g.game_id}/injury`, { body: { player, p_play: Number(pp) } }))
      setPlayer('')
    } finally {
      setBusy(false)
    }
  }
  const List = ({ rows, empty }: { rows: any[]; empty: string }) => rows?.length ? (
    <table><tbody>{rows.map((p) => (
      <tr key={p.player + p.status}>
        <td>{p.player} <small>{p.position}</small></td><td>{p.status}</td>
        <td className="num">play {pct(p.p_play, 0)}</td><td className="num">{signed(p.impact_pts, 2)} pts</td>
      </tr>))}</tbody></table>
  ) : <p className="muted" style={{ fontSize: '0.85rem' }}>{empty}</p>
  return (
    <div className="card col">
      <h3>Injuries / availability</h3>
      <div className="grid grid-2">
        {[g.away, g.home].map((t) => (
          <div key={t} className="col" style={{ gap: '0.3rem' }}>
            <div className="row between"><strong>{t}</strong><small>net {signed(inj[t]?.total_impact_pts, 2)} pts</small></div>
            <h4>Out / questionable</h4><List rows={inj[t]?.injuries} empty="No key absences." />
            {inj[t]?.returning?.length > 0 && (<><h4>Returning</h4><List rows={inj[t].returning} empty="" /></>)}
            {inj[t]?.departed?.length > 0 && (<details><summary className="muted">Roster departures still in the ratings window ({inj[t].departed.length})</summary><List rows={inj[t].departed} empty="" /></details>)}
          </div>
        ))}
      </div>
      <div className="row">
        <input placeholder="Player name (fresh news)" value={player} onChange={(e) => setPlayer(e.target.value)} />
        <select value={pp} onChange={(e) => setPp(e.target.value)}>
          <option value="0">OUT</option><option value="0.25">Doubtful-ish (25%)</option><option value="0.76">Questionable (76%)</option><option value="1">Will play</option>
        </select>
        <button className="small" disabled={busy || !player} onClick={save}>Apply & re-run</button>
      </div>
      {Object.keys(rep.injury_overrides ?? {}).length > 0 && <small>Overrides: {Object.entries(rep.injury_overrides).map(([k, v]) => `${k} ${pct(v as number, 0)}`).join(', ')}</small>}
      <small>Impact = the model's points per unit of snap-share change for that position group (validated with pre-game injury reports only).</small>
    </div>
  )
}

/* ------------------------------------------------------------------ main */
export default function GameReport({ rep, setRep }: { rep: Report; setRep: (r: Report) => void }) {
  const [draft, setDraft] = useState<BetDraft | null>(null)
  const m = rep.model
  const g = rep.game
  const mk = rep.market ?? {}
  const mh = rep.market_history ?? {}
  const env = rep.environment ?? {}
  const wx = env.weather ?? {}
  const sch = env.schedule ?? {}
  const bets: Bet[] = (rep.bets ?? []).filter((b: Bet) => b.market !== 'all')
  const logBet = (b: Bet) => setDraft({
    game_id: g.game_id, market: b.market, selection: b.selection, odds: b.odds, line: b.line ?? null, side: b.side,
    model_prob: b.win_pct_no_push, model_ev: b.ev, label: b.label, confidence: b.confidence, suggested_stake: b.stake?.amount,
  })
  const favHome = m.fair_margin >= 0
  return (
    <div className="col">
      {draft && <LogBet draft={draft} onClose={() => setDraft(null)} />}
      <div className="grid grid-3">
        <LinesForm rep={rep} onSaved={setRep} />
        <div className="card col">
          <h3>Model fair line</h3>
          <div className="hero num">{m.fair_spread?.text}</div>
          <dl className="kv">
            <dt>Moneyline</dt><dd>{g.away} {odds(m.fair_ml?.away)} / {g.home} {odds(m.fair_ml?.home)}</dd>
            <dt>Win prob</dt><dd>{g.away} {pct(m.win_prob?.away)} · {g.home} {pct(m.win_prob?.home)}</dd>
            <dt>Total</dt><dd>{m.fair_total_line}</dd>
            <dt>Projection</dt><dd>{g.away} {m.projection?.[g.away]} – {g.home} {m.projection?.[g.home]}</dd>
            <dt>Raw model</dt><dd>{favHome ? g.home : g.away} by {num(Math.abs(m.raw_margin))} · total {num(m.raw_total)}</dd>
            <dt>Trust in model</dt><dd>{pct(m.beta_spread, 0)} spread · {pct(m.beta_total, 0)} total <small>(rest = market)</small></dd>
          </dl>
          <small>Fair = market + trust × (model − market). Trust is learned out of sample and grows early in the week.</small>
        </div>
        <div className="card col">
          <h3>Market</h3>
          <dl className="kv">
            <dt>Consensus</dt><dd>{mk.spread_line != null ? `${mk.spread_line >= 0 ? g.home : g.away} ${line(-Math.abs(mk.spread_line))}` : '—'} · {mk.total_line ?? '—'} <small>({mk.source})</small></dd>
            <dt>No-vig margin</dt><dd>{mk.margin != null ? `${mk.margin >= 0 ? g.home : g.away} by ${num(Math.abs(mk.margin), 2)}` : '—'}</dd>
            <dt>No-vig total</dt><dd>{num(mk.total, 2)}</dd>
            <dt>ML</dt><dd>{g.away} {odds(mk.away_ml)} / {g.home} {odds(mk.home_ml)}</dd>
            <dt>Opening</dt><dd>{mh.open ? `${line(mh.open.home_spread)} · ${mh.open.total_line ?? '—'}` : 'not tracked yet'}</dd>
            <dt>Movement</dt><dd>{mh.spread_move != null ? `${signed(mh.spread_move, 1)} pts margin · ${signed(mh.total_move, 1)} total` : '—'}</dd>
          </dl>
          <small>Ticket/money splits are not used: they are not verifiable here and never proof of anything.</small>
        </div>
      </div>

      <div className="grid grid-2">
        {rep.primary ? <BetCard b={rep.primary} title="PRIMARY" onLog={logBet} /> : (
          <div className="card col">
            <h3>Best bet</h3>
            <p className="bet-line">{rep.hard_rock ? 'PASS THE GAME' : 'Enter Hard Rock lines'}</p>
            <p className="secondary">{rep.final?.summary}</p>
          </div>
        )}
        {rep.secondary ? <BetCard b={rep.secondary} title="SECONDARY" onLog={logBet} /> : (
          <div className="card col">
            <h3>Data confidence</h3>
            <div className="row"><span>Spread <Conf value={rep.confidence?.by_market?.spread} /></span><span>ML <Conf value={rep.confidence?.by_market?.moneyline} /></span><span>Total <Conf value={rep.confidence?.by_market?.total} /></span></div>
            <Flags flags={rep.confidence?.flags ?? []} />
          </div>
        )}
      </div>

      {bets.length > 0 && (
        <div className="card">
          <h3>Every bet at the Hard Rock price</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Bet</th><th className="num">Price</th><th className="num">Win%</th><th className="num">Push</th><th className="num">EV</th><th className="num">Fair</th><th className="num">Playable to</th><th className="num">Pass at</th><th>Call</th><th></th></tr></thead>
              <tbody>
                {bets.map((b) => (
                  <tr key={b.selection}>
                    <td>{b.selection}</td><td className="num">{odds(b.odds)}</td><td className="num">{pct(b.win_pct_no_push)}</td>
                    <td className="num">{b.push > 0.001 ? pct(b.push) : '—'}</td><td className="num">{signedPct(b.ev)}</td>
                    <td className="num">{odds(b.fair_odds)}</td>
                    <td className="num">{b.market === 'moneyline' ? odds(b.thresholds?.playable_to) : line(b.thresholds?.playable_to)}</td>
                    <td className="num">{b.market === 'moneyline' ? odds(b.thresholds?.lean_to) : line(b.thresholds?.pass_at)}</td>
                    <td><Label value={b.label} /></td>
                    <td><button className="small ghost" onClick={() => logBet(b)}>Log</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rep.secondary && (
        <div className="card">
          <h3>Data confidence</h3>
          <Flags flags={rep.confidence?.flags ?? []} />
        </div>
      )}

      <QBPanel rep={rep} onSaved={setRep} />
      <FormTable rep={rep} />
      <div className="grid grid-2">
        <Matchups rep={rep} />
        <Injuries rep={rep} onSaved={setRep} />
      </div>
      <div className="grid grid-3">
        <div className="card col">
          <h3>Pace / weather / schedule</h3>
          <dl className="kv">
            <dt>Pace</dt><dd>{env.pace?.classification} <small>(combined neutral sec/play {signed(env.pace?.combined_pace_vs_avg, 1)} vs avg)</small></dd>
            <dt>Weather</dt><dd>{wx.status}{wx.temp_f != null && wx.status !== 'INDOOR' ? ` · ${Math.round(wx.temp_f)}°F · wind ${Math.round(wx.wind_mph ?? 0)} mph` : ''}{(wx.notes ?? []).length ? ` · ${wx.notes.join('; ')}` : ''}</dd>
            <dt>Rest</dt><dd>{sch.home_bye ? `${g.home} off bye · ` : ''}{sch.away_bye ? `${g.away} off bye · ` : ''}{sch.home_short_week ? `${g.home} short week · ` : ''}{sch.away_short_week ? `${g.away} short week · ` : ''}rest diff {signed(sch.rest_diff_days, 0)} d</dd>
            <dt>Travel</dt><dd>{g.away} {sch.away_travel_miles} mi · {signed(sch.away_tz_shift_hours, 0)} h{sch.away_body_clock_early ? ' · early body-clock kickoff' : ''}</dd>
            <dt>Spot</dt><dd>{[sch.divisional && 'divisional', sch.primetime && 'primetime', sch.neutral_site && 'neutral site', sch.altitude && 'altitude'].filter(Boolean).join(' · ') || '—'}</dd>
          </dl>
          <small>{sch.note}</small>
        </div>
        <div className="card col">
          <h3>Game scripts</h3>
          <table><tbody>{(rep.scripts ?? []).map((s: any) => (
            <tr key={s.code}><td><strong>{s.code}</strong> {s.name}<br /><small>{s.desc}</small></td><td className="num">{pct(s.prob, 0)}</td></tr>
          ))}</tbody></table>
          <small>Scripts overlap (A/C/D split the margin; B/E the total).</small>
        </div>
        <div className="card col">
          <h3>Turnovers</h3>
          {[g.away, g.home].map((t) => {
            const x = rep.turnovers?.[t] ?? {}
            return <p key={t}><strong>{t}</strong> margin {signed(x.to_margin, 0)} ({x.takeaways ?? 0} take / {x.giveaways ?? 0} give){x.flag ? <><br /><span className="chip unknown"><span className="ic">!</span>REGRESSION FLAG</span> <small>{x.flag}</small></> : null}</p>
          })}
          <small>Turnovers barely repeat (next-game R² ~1%): the model regresses them hard.</small>
        </div>
      </div>

      <div className="card">
        <h3>Why the model says this</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Feature</th><th className="num">Margin pts ({g.home} +)</th></tr></thead>
            <tbody>
              {Object.entries(rep.explain?.margin ?? {}).filter(([k]) => k !== 'intercept').sort((a: any, b: any) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 10).map(([k, v]) => (
                <tr key={k}><td className="mono">{k}</td><td className="num">{signed(v as number, 2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Final</h3>
        {(['PLAY', 'SMALLER', 'LEAN', 'PASS', 'UNKNOWN'] as const).map((k) => (
          <div key={k} className="row" style={{ margin: '0.2rem 0' }}><Label value={k} /><span>{(rep.final?.[k] ?? []).join(', ') || '—'}</span></div>
        ))}
        <p className="secondary">{rep.final?.summary}</p>
      </div>
    </div>
  )
}
