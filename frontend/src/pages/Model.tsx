import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api'
import { ErrorBox, Loading } from '../components'
import { num, pct } from '../format'

function SeasonTooltip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="tt">
      <div className="k">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey}><span style={{ display: 'inline-block', width: 12, height: 2, background: p.color, verticalAlign: 'middle', marginRight: 6 }} /><span className="v">{fmt(p.value)}</span> <span className="k">{p.name}</span></div>
      ))}
    </div>
  )
}

export default function ModelPage() {
  const [m, setM] = useState<any | null>(null)
  const [err, setErr] = useState<unknown>(null)
  useEffect(() => { api('/model').then(setM).catch(setErr) }, [])
  if (err && !m) return <ErrorBox error={err} />
  if (!m) return <Loading />
  const bs: any[] = m.backtest?.by_season ?? []
  const rows = bs.map((r) => ({
    season: String(r.season),
    ats: r.ats_n_3 ? r.ats_w_3 / r.ats_n_3 : null,
    ou: r.ou_n_3 ? r.ou_w_3 / r.ou_n_3 : null,
    mae_model: r.mae_model, mae_line: r.mae_line, mae_fair: r.mae_fair,
  }))
  const tot = bs.reduce((a, r) => ({ aw: a.aw + r.ats_w_3, an: a.an + r.ats_n_3, ow: a.ow + r.ou_w_3, on: a.on + r.ou_n_3 }), { aw: 0, an: 0, ow: 0, on: 0 })
  const recent = bs.filter((r) => r.season >= 2020).reduce((a, r) => ({ aw: a.aw + r.ats_w_3, an: a.an + r.ats_n_3, ow: a.ow + r.ou_w_3, on: a.on + r.ou_n_3 }), { aw: 0, an: 0, ow: 0, on: 0 })
  const br = m.backtest?.blend_report ?? {}
  const th = m.thresholds?.values ?? {}
  return (
    <div className="col">
      <h1>The model, honestly</h1>
      <div className="grid grid-3">
        <div className="card col">
          <h3>Current version</h3>
          <dl className="kv">
            <dt>Version</dt><dd>{m.version}</dd>
            <dt>Trained through</dt><dd>{m.trained_through}</dd>
            <dt>Key numbers</dt><dd>{m.key_numbers?.fitted_on}</dd>
          </dl>
          <small>Retrained weekly; a challenger replaces the champion only if it is not worse on recent out-of-sample games.</small>
        </div>
        <div className="card col">
          <h3>Trust in model vs market</h3>
          <dl className="kv">
            <dt>Spread, early week</dt><dd>{pct(m.blend?.spread_early, 0)}</dd>
            <dt>Spread, at close</dt><dd>{pct(m.blend?.spread_close, 0)}</dd>
            <dt>Total, early week</dt><dd>{pct(m.blend?.total_early, 0)}</dd>
            <dt>Total, at close</dt><dd>{pct(m.blend?.total_close, 0)}</dd>
          </dl>
          <small>Out-of-sample slope of (result − market) on (model − market): spread {num(br.spread_close_beta, 2)} ± {num(br.spread_close_se, 2)} at the close; {num(br.spread_mid_beta_2013_2020, 2)} vs Wednesday lines (2013–2020). Shrunk toward conservative priors.</small>
        </div>
        <div className="card col">
          <h3>Edge bars (learned from CLV)</h3>
          <table><tbody>
            {Object.entries(th).map(([k, v]: any) => <tr key={k}><td>{k}</td><td className="num">PLAY ≥ {pct(v.play, 1)}</td><td className="num">LEAN ≥ {pct(v.lean, 1)}</td></tr>)}
          </tbody></table>
          <small>{Object.values(m.thresholds?.notes ?? {}).slice(0, 2).join(' · ') || 'Defaults until 25+ graded bets per market carry closing-line value.'}</small>
        </div>
      </div>

      <div className="notice">
        Walk-forward backtest (each season predicted by a model trained only on earlier seasons). Betting every game where the model disagreed with the <strong>closing</strong> line by 3+ points:
        ATS {tot.aw}/{tot.an} = <strong>{pct(tot.an ? tot.aw / tot.an : null)}</strong> overall, {pct(recent.an ? recent.aw / recent.an : null)} since 2020;
        O/U {tot.ow}/{tot.on} = <strong>{pct(tot.on ? tot.ow / tot.on : null)}</strong> overall, {pct(recent.on ? recent.ow / recent.on : null)} since 2020. Break-even at −110 is 52.4%.
        Closing lines are the hardest benchmark — edges live earlier in the week (Wednesday-line test: ~55–60% at 3+ pts) and in Hard Rock prices that differ from the sharp consensus.
      </div>

      <div className="grid grid-2">
        <div className="card chart-card">
          <h3>Hit rate at 3+ point disagreement vs the close</h3>
          <div className="legend"><span><i style={{ background: 'var(--series-1)' }} />ATS</span><span><i style={{ background: 'var(--series-2)' }} />Over/under</span><span><i style={{ background: 'var(--text-muted)' }} />52.4% break-even</span></div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="season" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                <YAxis domain={[0.3, 0.7]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <ReferenceLine y={0.524} stroke="var(--text-muted)" />
                <Tooltip content={<SeasonTooltip fmt={(v: number) => pct(v)} />} cursor={{ fill: 'var(--surface-2)' }} />
                <Bar dataKey="ats" name="ATS" fill="var(--series-1)" maxBarSize={12} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="ou" name="Over/under" fill="var(--series-2)" maxBarSize={12} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card chart-card">
          <h3>Mean absolute error of the final margin</h3>
          <div className="legend"><span><i style={{ background: 'var(--series-1)' }} />Blended fair line</span><span><i style={{ background: 'var(--series-2)' }} />Raw model</span></div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="season" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<SeasonTooltip fmt={(v: number) => `${num(v, 2)} pts`} />} cursor={{ stroke: 'var(--text-muted)', strokeWidth: 1 }} />
                <Line dataKey="mae_fair" name="Blended fair line" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: 'var(--surface-1)', strokeWidth: 2 }} />
                <Line dataKey="mae_model" name="Raw model" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: 'var(--surface-1)', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <small>The closing line itself averages ~{num(bs.length ? bs.reduce((a, r) => a + r.mae_line, 0) / bs.length : null, 2)} pts; the blend tracks it closely by design.</small>
        </div>
      </div>

      <div className="card">
        <h3>Backtest by season</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Season</th><th className="num">Games</th><th className="num">MAE model</th><th className="num">MAE close</th><th className="num">MAE fair</th><th className="num">ATS 3+</th><th className="num">O/U 3+</th></tr></thead>
            <tbody>{bs.map((r) => (
              <tr key={r.season}><td>{r.season}</td><td className="num">{r.games}</td><td className="num">{num(r.mae_model, 2)}</td><td className="num">{num(r.mae_line, 2)}</td><td className="num">{num(r.mae_fair, 2)}</td>
                <td className="num">{r.ats_w_3}/{r.ats_n_3} ({pct(r.ats_n_3 ? r.ats_w_3 / r.ats_n_3 : null, 0)})</td><td className="num">{r.ou_w_3}/{r.ou_n_3} ({pct(r.ou_n_3 ? r.ou_w_3 / r.ou_n_3 : null, 0)})</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {m.props_backtest && (
        <div className="card">
          <h3>Props backtest (walk-forward 2019–2025)</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Stat</th><th className="num">Player-games</th><th className="num">MAE model</th><th className="num">MAE own avg</th><th className="num">80% interval coverage</th><th className="num">Over-median rate</th></tr></thead>
              <tbody>{Object.entries(m.props_backtest).map(([k, v]: any) => (
                <tr key={k}><td>{k}</td><td className="num">{v.n}</td><td className="num">{num(v.mae_model, 2)}</td><td className="num">{num(v.mae_naive, 2)}</td><td className="num">{pct(v.coverage_80, 0)}</td><td className="num">{pct(v.over_median_rate, 0)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <small>“Own avg” = the player's recent average (what most bettors look at). Calibration: a well-calibrated 80% interval covers ~80%; over-median ~50%.</small>
        </div>
      )}

      {m.td_backtest && (
        <div className="card">
          <h3>Anytime TD model (walk-forward)</h3>
          <table><tbody>{Object.entries(m.td_backtest.scores ?? {}).map(([k, v]: any) => (
            <tr key={k}><td>{({ p_full: 'Usage + QB trust', p_contract: 'Usage + QB trust + contract', p_notrust: 'Usage only', p_struct: 'Poisson baseline', p_naive: '“Scored recently”' } as Record<string, string>)[k] ?? k}</td><td className="num">log loss {num(v.logloss, 4)}</td><td className="num">Brier {num(v.brier, 4)}</td></tr>
          ))}</tbody></table>
          <small>Lower is better. Recent TD scoring alone is a terrible predictor; red-zone/end-zone usage is what matters.</small>
        </div>
      )}
    </div>
  )
}
