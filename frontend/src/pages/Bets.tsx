import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { ErrorBox, Label, Loading, Result, useUser } from '../components'
import { money, odds, signed, signedPct } from '../format'

const SCOPES = [['mine', 'My bets'], ['team', 'Team'], ['paper', 'Model paper bets']] as const

export default function Bets() {
  const { user } = useUser()
  const [scope, setScope] = useState<string>('mine')
  const [status, setStatus] = useState<string>('')
  const [bets, setBets] = useState<any[] | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    api<any[]>(`/bets?scope=${scope}${status ? `&status=${status}` : ''}`).then(setBets).catch(setErr)
  }, [scope, status])
  useEffect(() => { load() }, [load])

  const grade = async () => {
    const r = await api('/bets/grade', { method: 'POST' })
    setMsg(`Graded ${r.graded} bet(s).`)
    load()
  }
  const setResult = async (id: number, result: string) => {
    await api(`/bets/${id}`, { method: 'PATCH', body: { result } })
    load()
  }
  const del = async (id: number) => {
    if (!confirm('Delete this bet?')) return
    await api(`/bets/${id}`, { method: 'DELETE' })
    load()
  }
  if (err && !bets) return <ErrorBox error={err} />
  return (
    <div className="col">
      <div className="row between">
        <h1>Bets</h1>
        <div className="row">
          <select value={scope} onChange={(e) => setScope(e.target.value)}>{SCOPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option><option value="pending">Pending</option><option value="win">Won</option><option value="loss">Lost</option><option value="push">Push</option>
          </select>
          <button className="small" onClick={grade}>Grade finished games</button>
        </div>
      </div>
      {msg && <div className="notice">{msg}</div>}
      <div className="notice">CLV = how your number compares with the closing market. Beating the close consistently is the earliest reliable sign of a real edge — results alone need thousands of bets.</div>
      {!bets ? <Loading /> : bets.length === 0 ? <p className="muted">No bets yet. Log bets from a game page (“Log bet”).</p> : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Placed</th><th>Game</th><th>Bet</th><th className="num">Price</th><th className="num">Stake</th><th>Call</th><th className="num">Model EV</th><th>Result</th><th className="num">P/L</th><th className="num">CLV pts</th><th className="num">CLV prob</th><th></th></tr></thead>
              <tbody>
                {bets.map((b) => (
                  <tr key={b.id}>
                    <td>{b.placed_at ? new Date(b.placed_at + (b.placed_at.includes('+') ? '' : 'Z')).toLocaleDateString() : ''}{scope !== 'mine' && <small> · {b.user}</small>}</td>
                    <td><Link to={`/game/${b.game_id}`}>{b.game_id.slice(8).replace('_', ' @ ')}</Link></td>
                    <td style={{ whiteSpace: 'normal', minWidth: 160 }}>{b.selection}</td>
                    <td className="num">{odds(b.odds)}</td>
                    <td className="num">{money(b.stake)}</td>
                    <td><Label value={b.label} /></td>
                    <td className="num">{signedPct(b.model_ev)}</td>
                    <td><Result value={b.result} /></td>
                    <td className="num">{b.profit != null ? money(b.profit) : '—'}</td>
                    <td className="num">{signed(b.clv_points, 1)}</td>
                    <td className="num">{b.clv_prob != null ? signedPct(b.clv_prob) : '—'}</td>
                    <td>
                      {b.user === user?.username && (
                        <span className="row" style={{ gap: '0.2rem', flexWrap: 'nowrap' }}>
                          {b.result === 'pending' && <>
                            <button className="small ghost" title="Mark won" onClick={() => setResult(b.id, 'win')}>W</button>
                            <button className="small ghost" title="Mark lost" onClick={() => setResult(b.id, 'loss')}>L</button>
                            <button className="small ghost" title="Mark push" onClick={() => setResult(b.id, 'push')}>P</button>
                          </>}
                          <button className="small ghost" title="Delete" onClick={() => del(b.id)}>✕</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small>Pushes return the stake. Voided props (player inactive) are graded VOID automatically.</small>
        </div>
      )}
    </div>
  )
}
