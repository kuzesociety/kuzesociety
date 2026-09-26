import { Fragment, useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { ErrorBox, Label, Loading, LogBet, type BetDraft } from '../components'
import { num, odds, pct, signedPct } from '../format'

export default function GameTD({ gameId }: { gameId: string }) {
  const [data, setData] = useState<{ players: any[]; out?: any[]; note: string } | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const [price, setPrice] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState<BetDraft | null>(null)

  const load = useCallback(() => {
    api(`/games/${gameId}/td`).then(setData).catch(setErr)
  }, [gameId])
  useEffect(() => { load() }, [load])

  const save = async (pid: string) => {
    const o = Number(price[pid])
    if (!o) return
    await api(`/games/${gameId}/props/lines`, { body: { player_id: pid, stat: 'anytime_td', over_odds: o } })
    load()
  }
  if (err && !data) return <ErrorBox error={err} />
  if (!data) return <Loading />
  return (
    <div className="col">
      {draft && <LogBet draft={draft} onClose={() => setDraft(null)} />}
      <div className="notice">{data.note}</div>
      <div className="card">
        <h3>Anytime TD · QB trust / red-zone connection</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Player</th><th className="num">Model P(TD)</th><th className="num">Fair</th><th className="num">RZ tgt share</th><th className="num">EZ share</th><th className="num">GL carries</th><th className="num">QB→RZ share</th><th>Hard Rock</th><th></th></tr></thead>
            <tbody>
              {data.players.map((p) => (
                <Fragment key={p.player_id}>
                  <tr>
                    <td><strong>{p.name}</strong> <small>{p.team} {p.position}</small>{p.p_play < 0.95 && <small> · {p.status ?? 'status unclear'} ({pct(p.p_play, 0)} to play)</small>}</td>
                    <td className="num">{pct(p.p_anytime, 1)}</td>
                    <td className="num">{odds(p.fair_odds)}</td>
                    <td className="num">{pct(p.usage.rz_target_share, 0)}</td>
                    <td className="num">{pct(p.usage.ez_target_share, 0)}</td>
                    <td className="num">{pct(p.usage.goal_line_carry_share, 0)}</td>
                    <td className="num">{pct(p.qb_trust?.rz_share_from_qb, 0)}</td>
                    <td>
                      {p.hard_rock ? (
                        <span className="row" style={{ gap: '0.3rem' }}>
                          <Label value={p.hard_rock.label} /><span className="num">{odds(p.hard_rock.odds)} · {signedPct(p.hard_rock.ev)}</span>
                          <button className="small ghost" onClick={() => setDraft({ game_id: gameId, market: 'td', side: 'yes', selection: `${p.name} anytime TD`, odds: p.hard_rock.odds, player_id: p.player_id, stat: 'tds', model_prob: p.p_anytime, model_ev: p.hard_rock.ev, label: p.hard_rock.label })}>Log</button>
                        </span>
                      ) : (
                        <span className="row" style={{ gap: '0.3rem' }}>
                          <input className="num-in" placeholder="+150" value={price[p.player_id] ?? ''} onChange={(e) => setPrice({ ...price, [p.player_id]: e.target.value })} />
                          <button className="small" onClick={() => save(p.player_id)}>Price</button>
                        </span>
                      )}
                    </td>
                    <td><button className="small ghost" onClick={() => setOpen(open === p.player_id ? null : p.player_id)}>{open === p.player_id ? '▾' : '▸'}</button></td>
                  </tr>
                  {open === p.player_id && (
                    <tr>
                      <td colSpan={9} style={{ whiteSpace: 'normal' }}>
                        <div className="grid grid-3" style={{ gap: '0.5rem', padding: '0.4rem 0' }}>
                          <div><h4>1-2. QB history & trust</h4>
                            <small>With this QB: {p.qb_trust.games_together} games · {num(p.qb_trust.rz_targets_from_qb, 1)} RZ tgts · {num(p.qb_trust.ez_targets_from_qb, 1)} EZ tgts · {num(p.qb_trust.tds_from_qb, 1)} TDs (recency-weighted) · share of QB's RZ looks {pct(p.qb_trust.rz_share_from_qb, 0)}, EZ {pct(p.qb_trust.ez_share_from_qb, 0)}, TDs {pct(p.qb_trust.td_share_from_qb, 0)} · 3rd-down looks {num(p.qb_trust.third_down_looks, 1)} · late-half looks {num(p.qb_trust.late_half_looks, 1)}</small></div>
                          <div><h4>3. Ball security</h4><small>Fumbles lost / touch {num(p.ball_security.fumbles_lost_per_touch, 4)} · catch rate {pct(p.ball_security.catch_rate, 0)}</small></div>
                          <div><h4>4. Contract / role</h4><small>APY {pct(p.contract.apy_cap_pct, 1)} of cap · draft pick {p.contract.draft_overall >= 300 ? 'undrafted/unknown' : `#${p.contract.draft_overall}`} (weak, secondary signal)</small></div>
                          <div><h4>5. Recent usage</h4><small>Target share {pct(p.usage.target_share, 0)} · inside-10 share {pct(p.usage.inside10_share, 0)} · snap {pct(p.usage.snap_pct, 0)} (recent games outweigh old history)</small></div>
                          <div><h4>6. Opponent</h4><small>TDs allowed to position (recency-weighted per game): {num(p.opp_tds_allowed_to_pos, 2)}</small></div>
                          <div><h4>Transparent baseline</h4><small>Poisson from team TDs × scoring-area shares: {pct(p.structural, 1)}</small></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {(data.out ?? []).length > 0 && (
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            <strong>Out</strong> (scoring-area looks redistributed): {(data.out ?? []).map((p) => `${p.name} ${p.team} ${p.position} (${p.status ?? 'out'})`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}
