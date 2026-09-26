import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { api } from '../api'
import { ErrorBox } from '../components'
import { ago } from '../format'

export default function GameAnalyst({ gameId }: { gameId: string }) {
  const [reports, setReports] = useState<any[]>([])
  const [notes, setNotes] = useState('')
  const [web, setWeb] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<unknown>(null)
  const [sources, setSources] = useState<any[]>([])

  useEffect(() => {
    api<any[]>(`/games/${gameId}/analyst`).then(setReports).catch(() => {})
  }, [gameId])

  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await api(`/games/${gameId}/analyst`, { body: { notes: notes || null, web_search: web } })
      setSources(r.sources ?? [])
      setReports([{ id: Date.now(), markdown: r.markdown, model: r.model, at: new Date().toISOString(), by: 'you' }, ...reports])
    } catch (e) {
      setErr(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="col">
      <div className="card col">
        <h3>AI analyst write-up</h3>
        <p className="secondary">Claude writes the report in your master-prompt format from the model's numbers (it never invents lines or probabilities) and uses web search to verify late injury / QB / weather news. If the news contradicts the model's inputs it marks the bet UNKNOWN so you can fix the input and re-run.</p>
        <textarea rows={3} placeholder="Optional notes (e.g. 'heard LT is a game-time decision')" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="row">
          <label className="row" style={{ gap: '0.3rem' }}><input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} /> verify news with web search</label>
          <button className="primary" disabled={busy} onClick={run}>{busy ? 'Writing… (up to a few minutes)' : 'Write the report'}</button>
        </div>
        <ErrorBox error={err} />
      </div>
      {reports.map((r) => (
        <div key={r.id} className="card">
          <small>{r.model} · {ago(r.at)} · by {r.by}</small>
          <div className="markdown"><Markdown>{r.markdown}</Markdown></div>
        </div>
      ))}
      {sources.length > 0 && (
        <div className="card">
          <h4>Sources checked</h4>
          <ul>{sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a></li>)}</ul>
        </div>
      )}
    </div>
  )
}
