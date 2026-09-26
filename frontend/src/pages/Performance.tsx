import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api'
import { ErrorBox, Label, Loading, Tile } from '../components'
import { money, pct, signedPct } from '../format'

function ProfitTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="tt">
      <div className="v">{money(p.cum_profit)}</div>
      <div className="k">after bet #{p.n}{p.at ? ` · ${new Date(p.at).toLocaleDateString()}` : ''}</div>
    </div>
  )
}

function Summary({ title, rows }: { title: string; rows: Record<string, any> }) {
  const entries = Object.entries(rows ?? {})
  if (!entries.length) return null
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th></th><th className="num">Bets</th><th>Record</th><th className="num">Staked</th><th className="num">P/L</th><th className="num">ROI</th><th className="num">Avg CLV</th><th className="num">Beat close</th><th className="num">Avg model EV</th></tr></thead>
          <tbody>
            {entries.map(([k, s]) => (
              <tr key={k}>
                <td>{['PLAY', 'SMALLER', 'LEAN', 'PASS', 'UNKNOWN'].includes(k) ? <Label value={k} /> : k}</td>
                <td className="num">{s.bets}</td><td>{s.record}</td><td className="num">{money(s.staked)}</td>
                <td className="num">{money(s.profit)}</td><td className="num">{signedPct(s.roi)}</td>
                <td className="num">{signedPct(s.avg_clv_prob)}</td><td className="num">{pct(s.beat_close_pct, 0)}</td>
                <td className="num">{signedPct(s.avg_model_ev)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Performance() {
  const [scope, setScope] = useState('me')
  const [data, setData] = useState<any | null>(null)
  const [err, setErr] = useState<unknown>(null)
  useEffect(() => {
    setData(null)
    api(`/performance?scope=${scope}`).then(setData).catch(setErr)
  }, [scope])
  if (err && !data) return <ErrorBox error={err} />
  const o = data?.overall
  const curve = (data?.curve ?? []).map((p: any, i: number) => ({ ...p, n: i + 1 }))
  return (
    <div className="col">
      <div className="row between">
        <h1>Performance</h1>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="me">My bets</option><option value="all">Team (all bets)</option><option value="paper">Model paper trading</option>
        </select>
      </div>
      {!data ? <Loading /> : !o ? (
        <div className="notice">No graded bets yet. Paper trading records the model's own PLAY/SMALLER calls at kickoff so the system builds a track record even when you pass.</div>
      ) : (
        <>
          <div className="grid grid-4">
            <Tile label="Profit" value={money(o.profit)} delta={`${o.record} · ${money(o.staked)} staked`} />
            <Tile label="ROI" value={signedPct(o.roi)} delta="per dollar staked" />
            <Tile label="Avg closing-line value" value={signedPct(o.avg_clv_prob)} delta="win prob at close minus break-even" />
            <Tile label="Beat the close" value={pct(o.beat_close_pct, 0)} delta="share of bets with positive CLV" />
          </div>
          {curve.length > 1 && (
            <div className="card chart-card">
              <h3>Cumulative profit</h3>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <AreaChart data={curve} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--grid)" vertical={false} />
                    <XAxis dataKey="n" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={60} />
                    <ReferenceLine y={0} stroke="var(--axis)" />
                    <Tooltip content={<ProfitTooltip />} cursor={{ stroke: 'var(--text-muted)', strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="cum_profit" stroke="var(--series-1)" strokeWidth={2} fill="var(--series-1)" fillOpacity={0.1}
                          activeDot={{ r: 4, stroke: 'var(--surface-1)', strokeWidth: 2 }} dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <small>x = bet number (graded order). Variance is large: judge the process by CLV first.</small>
            </div>
          )}
          <Summary title="By market" rows={data.by_market} />
          <Summary title="By model call" rows={data.by_label} />
        </>
      )}
    </div>
  )
}
