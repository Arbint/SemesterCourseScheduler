import { useState, useEffect, useRef } from 'react'

export interface SearchableOption {
  id: number
  label: string
}

// Generic dropdown-with-search picker — used wherever a list is long enough
// that a plain <select> becomes hard to scan (e.g. Door Tags' term/room
// pickers).
export function SearchableSelect({
  options, selectedId, onSelect, placeholder = 'Select...', searchPlaceholder = 'Search...',
}: {
  options: SearchableOption[]
  selectedId: number | null
  onSelect: (id: number) => void
  placeholder?: string
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find(o => o.id === selectedId)
  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ minWidth: 170, textAlign: 'left', padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}
      >
        {selected ? selected.label : placeholder} <span style={{ float: 'right', opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.35)', zIndex: 1000, minWidth: 220, padding: 8 }}>
          <input
            autoFocus
            placeholder={searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '4px 8px', fontSize: 12, boxSizing: 'border-box' }}
          />
          <div style={{ marginTop: 4, maxHeight: 240, overflowY: 'auto' }}>
            {filtered.map(o => (
              <button
                key={o.id}
                onClick={() => { onSelect(o.id); setOpen(false); setSearch('') }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'transparent', border: 'none', cursor: 'pointer', color: o.id === selectedId ? 'var(--accent)' : 'var(--text-primary)', fontSize: 13 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
