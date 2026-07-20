import type { CSSProperties } from 'react'

export type SortDir = 'asc' | 'desc'
export interface SortState { key: string; dir: SortDir }

// Toggles asc -> desc -> asc on repeated clicks of the same column.
export function nextSort(current: SortState | null, key: string): SortState {
  if (current?.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: 'asc' }
}

export function compareValues(a: string | number, b: string | number, dir: SortDir): number {
  const cmp = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
  return dir === 'asc' ? cmp : -cmp
}

// A <th> that sorts its column on click and optionally shows a text-filter
// input beneath the label — shared by any table that needs per-column
// sort + filter (Course Catalog, Term Course List).
export function SortableTh({ label, sortKey, sort, onSort, filterValue, onFilterChange, filterPlaceholder, style }: {
  label: string
  sortKey: string
  sort: SortState | null
  onSort: (key: string) => void
  filterValue?: string
  onFilterChange?: (v: string) => void
  filterPlaceholder?: string
  style?: CSSProperties
}) {
  const active = sort?.key === sortKey
  return (
    <th style={{ ...style, cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort(sortKey)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>{label}</span>
        <span style={{ fontSize: 9, color: active ? 'var(--accent)' : 'var(--text-secondary)', opacity: active ? 1 : 0.4 }}>
          {active && sort!.dir === 'desc' ? '▼' : '▲'}
        </span>
      </div>
      {onFilterChange && (
        <input
          value={filterValue ?? ''}
          onClick={e => e.stopPropagation()}
          onChange={e => onFilterChange(e.target.value)}
          placeholder={filterPlaceholder ?? 'Filter...'}
          style={{ width: '100%', marginTop: 4, padding: '2px 6px', fontSize: 11, fontWeight: 400, boxSizing: 'border-box' }}
        />
      )}
    </th>
  )
}
