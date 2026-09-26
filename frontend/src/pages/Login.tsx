import { useState } from 'react'
import { api, setToken } from '../api'
import { useUser, type User } from '../components'

export default function Login() {
  const { setUser } = useUser()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await api<{ token: string; user: User }>('/auth/login', { body: { username, password } })
      setToken(r.token)
      setUser(r.user)
    } catch (e2) {
      setErr((e2 as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <form className="card col" style={{ width: '100%', maxWidth: 360 }} onSubmit={submit}>
        <h1>Kuze Edge</h1>
        <p className="muted">NFL model vs. the exact Hard Rock number. No locks, no hype.</p>
        <label className="field">Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>
        <label className="field">Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        {err && <p className="error">{err}</p>}
        <button className="primary" disabled={busy || !username || !password}>Sign in</button>
      </form>
    </div>
  )
}
