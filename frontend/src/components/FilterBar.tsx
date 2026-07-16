import { useState, useEffect, useRef } from 'react'
import type { Course, Faculty, ScheduleEntry, ScheduleTable, Weekday } from '../api'

export interface ActiveFilter {
  id: string
  type: 'faculty' | 'weekday' | 'course'
  value: number | string
  label: string
  negated: boolean
}

export const DAY_NAMES: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' }

// Shared by TermSchedulesTab and ViewTab so a scheduled entry dims/highlights
// consistently under the same filter set in both places.
export function entryMatchesFilters(
  entry: ScheduleEntry, course: Course | undefined, table: ScheduleTable | undefined, filters: ActiveFilter[]
): boolean {
  if (filters.length === 0 || !course) return false
  return filters.some(f => {
    let matches: boolean
    if (f.type === 'faculty') {
      matches = entry.faculty_id === f.value
    } else if (f.type === 'weekday') {
      matches = table?.weekday_ids.includes(f.value as number) ?? false
    } else {
      matches = `${course.dept_code} ${course.course_number} ${course.course_name}`
        .toLowerCase().includes((f.value as string).toLowerCase())
    }
    return f.negated ? matches : !matches
  })
}

export function FilterBar({ filters, onAdd, onRemove, onToggleNot, allFaculty, weekdays, courses }: {
  filters: ActiveFilter[]
  onAdd: (f: Omit<ActiveFilter, 'id'>) => void
  onRemove: (id: string) => void
  onToggleNot: (id: string) => void
  allFaculty: Faculty[]
  weekdays: Weekday[]
  courses: Course[]
}) {
  const [step, setStep] = useState<null | 'type' | 'value'>(null)
  const [pendingType, setPendingType] = useState<ActiveFilter['type'] | null>(null)
  const [courseSearch, setCourseSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setStep(null); setPendingType(null); setCourseSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectType = (type: ActiveFilter['type']) => { setPendingType(type); setStep('value') }

  const selectValue = (value: number | string, label: string) => {
    if (!pendingType) return
    onAdd({ type: pendingType, value, label, negated: false })
    setStep(null); setPendingType(null); setCourseSearch('')
  }

  const filteredCourses = courseSearch.trim()
    ? courses.filter(c =>
        `${c.dept_code} ${c.course_number} ${c.course_name}`.toLowerCase().includes(courseSearch.toLowerCase())
      ).slice(0, 10)
    : []

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)', flexWrap: 'wrap', minHeight: 36 }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>Filter:</span>

      {filters.map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '2px 6px 2px 4px', fontSize: 12, flexShrink: 0 }}>
          <button
            onClick={() => onToggleNot(f.id)}
            title="Toggle NOT"
            style={{
              padding: '0 5px', fontSize: 10, fontWeight: 700, lineHeight: '16px',
              background: f.negated ? 'var(--error)' : 'var(--bg-surface)',
              color: f.negated ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--border-color)', borderRadius: 3, cursor: 'pointer',
            }}
          >NOT</button>
          <span style={{ color: 'var(--text-secondary)', fontSize: 10, marginLeft: 3 }}>{f.type}:</span>
          <span style={{ color: 'var(--text-bright)', marginLeft: 2 }}>{f.label}</span>
          <button onClick={() => onRemove(f.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 0 0 4px', marginLeft: 2 }}>×</button>
        </div>
      ))}

      <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setStep(s => s ? null : 'type')}
          style={{ padding: '2px 10px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 12, cursor: 'pointer', color: 'var(--accent)' }}
        >+ Add Filter</button>

        {step && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.4)', zIndex: 2000, minWidth: 190 }}>
            {step === 'type' && (['faculty', 'weekday', 'course'] as const).map(type => (
              <button
                key={type}
                onClick={() => selectType(type)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}

            {step === 'value' && pendingType === 'faculty' && (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {allFaculty.map(f => (
                  <button
                    key={f.id}
                    onClick={() => selectValue(f.id, `${f.last_name}, ${f.first_name}`)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {f.last_name}, {f.first_name}
                  </button>
                ))}
              </div>
            )}

            {step === 'value' && pendingType === 'weekday' && weekdays.map(w => (
              <button
                key={w.id}
                onClick={() => selectValue(w.id, DAY_NAMES[w.name] ?? w.name)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {DAY_NAMES[w.name] ?? w.name}
              </button>
            ))}

            {step === 'value' && pendingType === 'course' && (
              <div style={{ padding: 8 }}>
                <input
                  autoFocus
                  placeholder="Search course..."
                  value={courseSearch}
                  onChange={e => setCourseSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && courseSearch.trim()) selectValue(courseSearch.trim(), courseSearch.trim()) }}
                  style={{ width: '100%', padding: '4px 8px', fontSize: 12, boxSizing: 'border-box' }}
                />
                <div style={{ marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
                  {filteredCourses.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectValue(courseSearch.trim(), courseSearch.trim())}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {c.dept_code} {c.course_number} — {c.course_name}
                    </button>
                  ))}
                  {courseSearch.trim() && filteredCourses.length === 0 && (
                    <div style={{ padding: '4px 8px', fontSize: 12, color: 'var(--text-secondary)' }}>No matches — press Enter to use as text filter</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
