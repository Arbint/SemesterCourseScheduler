import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  type?: 'error' | 'success' | 'warning'
  onClose: () => void
  duration?: number
}

export function Toast({ message, type = 'error', onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [onClose, duration])

  return (
    <div className={`toast ${type}`} onClick={onClose} style={{ cursor: 'pointer' }}>
      {message}
    </div>
  )
}

interface ToastState {
  id: number
  message: string
  type: 'error' | 'success' | 'warning'
}

let toastCounter = 0
let globalShowToast: ((msg: string, type?: 'error' | 'success' | 'warning') => void) | null = null

export function showToast(message: string, type: 'error' | 'success' | 'warning' = 'error') {
  globalShowToast?.(message, type)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastState[]>([])

  useEffect(() => {
    globalShowToast = (message, type = 'error') => {
      const id = ++toastCounter
      setToasts(prev => [...prev, { id, message, type }])
    }
    return () => { globalShowToast = null }
  }, [])

  const remove = (id: number) => setToasts(prev => prev.filter(t => t.id !== id))

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <Toast key={t.id} message={t.message} type={t.type} onClose={() => remove(t.id)} />
      ))}
    </div>
  )
}
