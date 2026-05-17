import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { showToast } from './Toast'

interface Props {
  mode: 'create' | 'login'
  onClose: () => void
}

export function LoginModal({ mode, onClose }: Props) {
  const { login, register } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!username.trim() || !password) return
    if (mode === 'create' && password !== confirm) {
      showToast('Passwords do not match')
      return
    }
    setSaving(true)
    try {
      if (mode === 'create') {
        await register(username.trim(), password)
        await login(username.trim(), password)
        showToast('Account created — you are now logged in', 'success')
      } else {
        await login(username.trim(), password)
        showToast('Logged in', 'success')
      }
      onClose()
    } catch (e: any) {
      showToast(e.response?.data?.detail || (mode === 'create' ? 'Failed to create account' : 'Invalid credentials'))
    } finally {
      setSaving(false)
    }
  }

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') submit() }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ minWidth: 340 }} onClick={e => e.stopPropagation()}>
        <h2>{mode === 'create' ? 'Create Account' : 'Log In'}</h2>
        <div className="form-group">
          <label>Username</label>
          <input autoFocus value={username} onChange={e => setUsername(e.target.value)} onKeyDown={onKey} />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey} />
        </div>
        {mode === 'create' && (
          <div className="form-group">
            <label>Confirm Password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={onKey} />
          </div>
        )}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={saving || !username.trim() || !password || (mode === 'create' && !confirm)}
          >
            {saving ? '...' : mode === 'create' ? 'Create Account' : 'Log In'}
          </button>
        </div>
      </div>
    </div>
  )
}
