import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { ErrorBox, Loading } from '../components'
import { kickoff } from '../format'
import GameProps from './GameProps'
import GameReport from './GameReport'
import GameSGP from './GameSGP'
import GameTD from './GameTD'

const GameAnalyst = lazy(() => import('./GameAnalyst'))

export type Report = Record<string, any>

const TABS = ['Report', 'Props', 'Anytime TD', 'SGP', 'AI analyst'] as const

export default function Game() {
  const { gameId = '' } = useParams()
  const [rep, setRep] = useState<Report | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Report')

  const load = useCallback(() => {
    setErr(null)
    api<Report>(`/games/${gameId}`).then(setRep).catch(setErr)
  }, [gameId])
  useEffect(() => {
    load()
  }, [load])

  if (err && !rep) return <ErrorBox error={err} />
  if (!rep) return <Loading what="Running the model" />
  const g = rep.game
  return (
    <div className="col">
      <div className="row between">
        <div>
          <Link to="/" className="muted" style={{ fontSize: '0.85rem' }}>← Slate</Link>
          <h1>🏈 {g.away} @ {g.home}</h1>
          <span className="muted">{kickoff(g.kickoff_utc)} · {g.stadium ?? ''}{g.roof ? ` (${g.roof})` : ''} · {g.away_qb} vs {g.home_qb}</span>
        </div>
        <button className="small" onClick={load}>↻ Re-run</button>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === 'Report' && <GameReport rep={rep} setRep={setRep} />}
      {tab === 'Props' && <GameProps gameId={gameId} />}
      {tab === 'Anytime TD' && <GameTD gameId={gameId} />}
      {tab === 'SGP' && <GameSGP gameId={gameId} rep={rep} />}
      {tab === 'AI analyst' && <Suspense fallback={<Loading />}><GameAnalyst gameId={gameId} /></Suspense>}
    </div>
  )
}
