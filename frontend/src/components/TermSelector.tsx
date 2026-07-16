import { useState, useEffect, useRef } from 'react'
import { termLabel, type Term } from '../api'

// --- Term Selector with per-item delete buttons ---
export function TermSelector({
  terms, selectedTermId, isLoggedIn, onSelect, onDelete, onNew
}: {
  terms: Term[]
  selectedTermId: number | null
  isLoggedIn: boolean
  onSelect: (val: string) => void
  onDelete: (termId: number) => void
  onNew: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = terms.find(t => t.id === selectedTermId)
  const label = selected ? termLabel(selected) : 'Select term...'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ minWidth: 170, textAlign: 'left', padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}
      >
        {label} <span style={{ float: 'right', opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.35)', zIndex: 1000, minWidth: 200 }}>
          {terms.map(t => {
            const tLabel = termLabel(t)
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  onClick={() => { onSelect(String(t.id)); setOpen(false) }}
                  style={{ flex: 1, textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: t.id === selectedTermId ? 'var(--accent)' : 'var(--text-primary)', fontSize: 13 }}
                >
                  {tLabel}
                </button>
                {isLoggedIn && (
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(t.id); setOpen(false) }}
                    title="Delete term"
                    style={{ padding: '4px 8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1 }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
          {isLoggedIn && (
            <>
              <div style={{ borderTop: '1px solid var(--border-color)', margin: '2px 0' }} />
              <button
                onClick={() => { onNew(); setOpen(false) }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13 }}
              >
                + New Term
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
