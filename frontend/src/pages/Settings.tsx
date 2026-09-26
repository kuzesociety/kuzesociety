import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useUser, type User } from '../components'
import { ago } from '../format'

export default function Settings() {
  const { user, setUser } = useUser()
  const [f, setF] = useState({
    bankroll: String(user?.bankroll ?? 1000), kelly_mult: String(user?.kelly_mult ?? 0.25),
    max_bet_pct: String(user?.max_bet_pct ?? 0.02), unit_size: String(user?.unit_size ?? 10), display_name: user?.display_name ?? '',
    new_password: '',
  })
  const [msg, setMsg] = useState('')
  const [status, setStatus] = useState<any | null>(null)

  const loadStatus = useCallback(() => { api('/status').then(setStatus).catch(() => {}) }, [])
  useEffect(() => {
    loadStatus()
    const t = setInterval(loadStatus, 10000)
    return () => clearInterval(t)
  }, [loadStatus])

  const save = async () => {
    try {
      const body: Record<string, unknown> = {
        bankroll: Number(f.bankroll), kelly_mult: Number(f.kelly_mult), max_bet_pct: Number(f.max_bet_pct),
        unit_size: Number(f.unit_size), display_name: f.display_name,
      }
      if (f.new_password) body.new_password = f.new_password
      setUser(await api<User>('/auth/settings', { method: 'PUT', body }))
      setMsg('Saved.')
      setF({ ...f, new_password: '' })
    } catch (e) {
      setMsg((e as Error).message)
    }
  }
  const job = async (path: string) => {
    try {
      await api(`/admin/${path}`, { method: 'POST' })
      setMsg(`Started ${path}.`)
      loadStatus()
    } catch (e) {
      setMsg((e as Error).message)
    }
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="col">
      <h1>Settings</h1>
      {msg && <div className="notice">{msg}</div>}
      <div className="grid grid-2">
        <div className="card col">
          <h3>Bankroll & staking</h3>
          <div className="row">
            <label className="field">Bankroll ($)<input className="num-in" value={f.bankroll} onChange={set('bankroll')} /></label>
            <label className="field">Unit ($)<input className="num-in" value={f.unit_size} onChange={set('unit_size')} /></label>
          </div>
          <div className="row">
            <label className="field">Kelly fraction<input className="num-in" value={f.kelly_mult} onChange={set('kelly_mult')} /></label>
            <label className="field">Max bet (% bankroll)<input className="num-in" value={f.max_bet_pct} onChange={set('max_bet_pct')} /></label>
          </div>
          <small>Stake = full Kelly × fraction × confidence, halved for SMALLER, capped at the max. Quarter Kelly (0.25) and a 2% cap are sane defaults: model probabilities are estimates.</small>
          <label className="field">Display name<input value={f.display_name} onChange={set('display_name')} /></label>
          <label className="field">New password<input type="password" value={f.new_password} onChange={set('new_password')} placeholder="leave blank to keep" /></label>
          <div><button className="primary" onClick={save}>Save</button></div>
        </div>
        <div className="card col">
          <h3>System</h3>
          {status && (
            <dl className="kv">
              <dt>Model</dt><dd>{status.model_version} · through {status.trained_through}</dd>
              <dt>Data built</dt><dd>{ago(status.data_built_at)}</dd>
              <dt>Props engine</dt><dd>{status.props_ready ? 'ready' : 'building…'}</dd>
              <dt>Odds sync</dt><dd>{status.odds_api ? 'The Odds API connected (Hard Rock + consensus every 30 min)' : 'off — set ODDS_API_KEY to auto-pull Hard Rock & sharp lines'}</dd>
              <dt>AI analyst</dt><dd>{status.analyst ? 'enabled' : 'off — set ANTHROPIC_API_KEY'}</dd>
            </dl>
          )}
          <div className="row">
            <button className="small" onClick={() => job('refresh')}>Refresh data now</button>
            <button className="small" onClick={() => job('odds-sync')} disabled={!status?.odds_api}>Sync odds</button>
            <button className="small" onClick={() => job('learn')}>Run learning loop</button>
            <button className="small" onClick={() => job('retrain')}>Full retrain</button>
          </div>
          <small>Automatic: data refresh 4×/day, paper bets at kickoff, weekly learning (Tuesday) — grading, CLV, thresholds, blend weights, prop bias, champion/challenger retrain.</small>
          <h4>Recent jobs</h4>
          <table><tbody>{(status?.jobs ?? []).slice(0, 8).map((j: any, i: number) => (
            <tr key={i}><td>{j.job}</td><td>{j.status}</td><td className="muted">{ago(j.started)}</td></tr>
          ))}</tbody></table>
        </div>
      </div>
    </div>
  )
}
