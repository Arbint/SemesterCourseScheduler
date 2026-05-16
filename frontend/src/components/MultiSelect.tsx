import { useState } from 'react'

interface Option {
  id: number
  label: string
}

interface MultiSelectProps {
  options: Option[]
  selected: number[]
  onChange: (ids: number[]) => void
  placeholder?: string
}

export function MultiSelect({ options, selected, onChange, placeholder = 'Select...' }: MultiSelectProps) {
  const [open, setOpen] = useState(false)

  const toggle = (id: number) => {
    if (selected.includes(id)) onChange(selected.filter(s => s !== id))
    else onChange([...selected, id])
  }

  const selectedLabels = options.filter(o => selected.includes(o.id)).map(o => o.label).join(', ')

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--border-radius)', padding: '6px 10px', cursor: 'pointer',
          color: selectedLabels ? 'var(--text-primary)' : 'var(--text-secondary)',
          minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          userSelect: 'none'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabels || placeholder}
        </span>
        <span style={{ marginLeft: 8, opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
            background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius)', marginTop: 4,
            maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
          }}>
            {options.length === 0 && (
              <div style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>No options</div>
            )}
            {options.map(o => (
              <div
                key={o.id}
                onClick={() => toggle(o.id)}
                style={{
                  padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  background: selected.includes(o.id) ? 'var(--bg-elevated)' : 'transparent',
                  color: selected.includes(o.id) ? 'var(--accent)' : 'var(--text-primary)',
                }}
              >
                <input type="checkbox" readOnly checked={selected.includes(o.id)} style={{ accentColor: 'var(--accent)' }} />
                {o.label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
