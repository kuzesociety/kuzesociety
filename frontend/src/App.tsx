import { lazy, Suspense, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { api, setToken } from './api'
import { UserCtx, type User, Loading } from './components'
import Bets from './pages/Bets'
import Game from './pages/Game'
import Login from './pages/Login'
import Settings from './pages/Settings'
import Slate from './pages/Slate'

// chart-heavy pages load on demand (recharts is most of the bundle)
const ModelPage = lazy(() => import('./pages/Model'))
const Performance = lazy(() => import('./pages/Performance'))

function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--surface-2)" />
      <path d="M8 23 L14 9 L18 17 L21 12 L24 23" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecked(true))
  }, [])

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setToken(null)
    setUser(null)
  }
  const toggleTheme = () => {
    const cur = document.documentElement.getAttribute('data-theme') ??
      (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    const next = cur === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem('kuze_theme', next)
    } catch {
      /* ignore */
    }
  }

  if (!checked) return <Loading />
  if (!user) {
    return (
      <UserCtx.Provider value={{ user, setUser }}>
        <Login />
      </UserCtx.Provider>
    )
  }
  return (
    <UserCtx.Provider value={{ user, setUser }}>
      <div className="app">
        <header className="topbar">
          <NavLink to="/" className="brand"><Logo /> Kuze Edge</NavLink>
          <nav className="nav">
            <NavLink to="/" end>Slate</NavLink>
            <NavLink to="/bets">Bets</NavLink>
            <NavLink to="/performance">Performance</NavLink>
            <NavLink to="/model">Model</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
          <div className="spacer" />
          <button className="ghost small" onClick={toggleTheme} title="Toggle light/dark">◐</button>
          <span className="muted" style={{ fontSize: '0.85rem' }}>{user.display_name}</span>
          <button className="ghost small" onClick={logout}>Log out</button>
        </header>
        <main className="main">
          <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Slate />} />
            <Route path="/game/:gameId" element={<Game />} />
            <Route path="/bets" element={<Bets />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/model" element={<ModelPage />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          </Suspense>
        </main>
      </div>
    </UserCtx.Provider>
  )
}
