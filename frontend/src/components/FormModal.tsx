import { type ReactNode } from 'react'

interface FormModalProps {
  title: string
  onClose: () => void
  onSave: () => void
  saving?: boolean
  children: ReactNode
}

export function FormModal({ title, onClose, onSave, saving, children }: FormModalProps) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{title}</h2>
        {children}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
