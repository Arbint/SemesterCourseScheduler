import { useState, useEffect, useRef, useMemo } from 'react'
import {
  termsApi, tablesApi, entriesApi, coursesApi, weekdaysApi, timeSlotsApi, facultyApi, roomsApi,
  officeHoursApi, loadSettingsApi, termLabel,
  type Term, type Weekday, type TimeSlot, type ScheduleTable, type ScheduleEntry,
  type Course, type Faculty, type OfficeHour, type LoadSettings, type Room,
} from '../api'
import { SearchableSelect } from '../components/SearchableSelect'
import { courseColor, OFFICE_HOUR_SOLID_COLOR } from '../components/ScheduleGrid'
import { showToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'

const ROW_HEIGHT = 64

type CourseCell = { kind: 'course'; entry: ScheduleEntry; course: Course; room: Room | null; span: number; timeRange: string }
type OfficeHourCell = { kind: 'officehour'; officeHour: OfficeHour; span: number; timeRange: string }
type EmptyCell = { kind: 'empty' }
type CoveredCell = { kind: 'covered' }
type GridCell = CourseCell | OfficeHourCell | EmptyCell | CoveredCell

interface FacultyFilter {
  id: string
  value: string
  negated: boolean
}

function facultyDisplayName(f: Faculty): string {
  return `${f.last_name}, ${f.first_name}`
}

function facultyMatchesValue(f: Faculty, value: string): boolean {
  return facultyDisplayName(f).toLowerCase().includes(value.toLowerCase())
}

function facultyVisible(f: Faculty, filters: FacultyFilter[]): boolean {
  const positive = filters.filter(x => !x.negated)
  const negative = filters.filter(x => x.negated)
  if (negative.some(x => facultyMatchesValue(f, x.value))) return false
  if (positive.length > 0 && !positive.some(x => facultyMatchesValue(f, x.value))) return false
  return true
}

// Filter bar for the Faculty Schedule tab — same chip/NOT-toggle interaction as
// the Room Schedule tab's RoomFilterBar, scoped to faculty name instead of room.
function FacultyFilterBar({ filters, onAdd, onRemove, onToggleNot }: {
  filters: FacultyFilter[]
  onAdd: (value: string) => void
  onRemove: (id: string) => void
  onToggleNot: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setPending('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const submit = () => {
    if (!pending.trim()) return
    onAdd(pending.trim())
    setPending('')
    setOpen(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
          <span style={{ color: 'var(--text-secondary)', fontSize: 10, marginLeft: 3 }}>faculty:</span>
          <span style={{ color: 'var(--text-bright)', marginLeft: 2 }}>{f.value}</span>
          <button onClick={() => onRemove(f.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 0 0 4px', marginLeft: 2 }}>×</button>
        </div>
      ))}

      <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ padding: '2px 10px', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 12, cursor: 'pointer', color: 'var(--accent)' }}
        >+ Add Filter</button>

        {open && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.4)', zIndex: 2000, minWidth: 200, padding: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Faculty Name</div>
            <input
              autoFocus
              placeholder="e.g. Smith"
              value={pending}
              onChange={e => setPending(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }}
              style={{ width: '100%', padding: '4px 8px', fontSize: 12, boxSizing: 'border-box' }}
            />
            <button
              onClick={submit}
              disabled={!pending.trim()}
              style={{ marginTop: 6, width: '100%', padding: '4px 8px', fontSize: 12 }}
              className="btn-secondary btn-sm"
            >Add</button>
          </div>
        )}
      </div>
    </div>
  )
}

function slotMinutes(slot: TimeSlot): number {
  const [sh, sm] = slot.start_time.split(':').map(Number)
  const [eh, em] = slot.end_time.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

// Combines a set of (already-contiguous) time slot ids into one human range,
// e.g. "10:30 AM - 11:45 AM", by pulling the first slot's start half and the
// last slot's end half from their already-formatted labels — mirrors
// ScheduleGrid's formatEntryTimeRange, generalized to a plain id list since
// office hours aren't ScheduleEntry rows.
function formatSlotRangeLabel(slotIds: number[], sortedTimeSlots: TimeSlot[], slotOrder: Map<number, number>): string {
  const slots = slotIds
    .filter(id => slotOrder.has(id))
    .map(id => sortedTimeSlots[slotOrder.get(id)!])
    .sort((a, b) => a.display_order - b.display_order)
  if (slots.length === 0) return ''
  const start = slots[0].label.split(' - ')[0]
  const end = slots[slots.length - 1].label.split(' - ')[1] ?? slots[slots.length - 1].label
  return `${start} - ${end}`
}

interface DragState {
  officeHourId: number
  edge: 'top' | 'bottom'
  facultyId: number
  weekdayId: number
  startY: number
  origStartIdx: number
  origEndIdx: number
  minStartIdx: number
  maxEndIdx: number
}

export function FacultyScheduleTab() {
  const { isLoggedIn } = useAuth()
  const [terms, setTerms] = useState<Term[]>([])
  const [allFaculty, setAllFaculty] = useState<Faculty[]>([])
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loadSettings, setLoadSettings] = useState<LoadSettings>({ fulltime_load: 3, parttime_load: 2, min_office_hours_per_week: 4 })

  const [selectedTermId, setSelectedTermId] = useState<number | null>(null)
  const [facultyFilters, setFacultyFilters] = useState<FacultyFilter[]>([])

  const [tables, setTables] = useState<ScheduleTable[]>([])
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [officeHours, setOfficeHours] = useState<OfficeHour[]>([])

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; facultyId: number; weekdayId: number; timeSlotId: number } | null>(null)
  const [dragPreview, setDragPreview] = useState<{ officeHourId: number; startIdx: number; endIdx: number } | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const ctxMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      termsApi.list(), facultyApi.list(), weekdaysApi.list(), timeSlotsApi.list(), roomsApi.list(), loadSettingsApi.get(),
    ]).then(([t, f, w, ts, r, ls]) => {
      setTerms(t)
      setAllFaculty(f)
      setWeekdays(w)
      setTimeSlots(ts)
      setRooms(r)
      setLoadSettings(ls)
      if (t.length) setSelectedTermId(t[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selectedTermId) { setTables([]); setEntries([]); setCourses([]); setOfficeHours([]); return }
    const term = terms.find(t => t.id === selectedTermId)
    if (!term) return
    Promise.all([
      tablesApi.list(selectedTermId),
      entriesApi.listByTerm(selectedTermId),
      coursesApi.list(term.semester_name),
      officeHoursApi.list(selectedTermId),
    ]).then(([tbs, ents, cs, ohs]) => {
      setTables(tbs)
      setEntries(ents)
      setCourses(cs)
      setOfficeHours(ohs)
    })
  }, [selectedTermId, terms])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', escHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escHandler)
    }
  }, [])

  const courseMap = new Map(courses.map(c => [c.id, c]))
  const roomMap = new Map(rooms.map(r => [r.id, r]))
  const sortedWeekdays = useMemo(
    () => [...weekdays].sort((a, b) => a.display_order - b.display_order),
    [weekdays]
  )
  const sortedTimeSlots = useMemo(
    () => [...timeSlots].sort((a, b) => a.display_order - b.display_order),
    [timeSlots]
  )
  const slotOrder = useMemo(
    () => new Map(sortedTimeSlots.map((ts, i) => [ts.id, i])),
    [sortedTimeSlots]
  )
  const numSlots = sortedTimeSlots.length

  // Kept in sync with the memoized value above so the resize effect (which
  // registers its listeners once, on mount) can always read the current
  // sorted time slots without re-subscribing on every render.
  const sortedTimeSlotsRef = useRef(sortedTimeSlots)
  sortedTimeSlotsRef.current = sortedTimeSlots

  // Boolean occupancy (course/meeting or a *different* office hour) per row
  // index for one faculty/weekday column — used to clamp a resize drag so it
  // can never cross into an already-occupied slot.
  const occupiedSlotIndexes = (facultyId: number, weekdayId: number, excludeOfficeHourId?: number): boolean[] => {
    const occupied = new Array(numSlots).fill(false)
    for (const table of tables) {
      for (const entry of entries) {
        if (entry.faculty_id !== facultyId || entry.schedule_table_id !== table.id || !entry.course_id) continue
        const effWeekdays = entry.active_weekday_ids.length ? entry.active_weekday_ids : table.weekday_ids
        if (!effWeekdays.includes(weekdayId)) continue
        for (const sid of entry.time_slot_ids) {
          const idx = slotOrder.get(sid)
          if (idx !== undefined) occupied[idx] = true
        }
      }
    }
    for (const oh of officeHours) {
      if (oh.faculty_id !== facultyId || oh.weekday_id !== weekdayId || oh.id === excludeOfficeHourId) continue
      for (const sid of oh.time_slot_ids) {
        const idx = slotOrder.get(sid)
        if (idx !== undefined) occupied[idx] = true
      }
    }
    return occupied
  }

  // grid[weekdayId][slotIndex] — rows=time slots, columns=weekdays, scoped to
  // one faculty's own courses + office hours (meetings have no faculty
  // association in this app, so they never appear here).
  const buildFacultyGrid = (facultyId: number): Map<number, GridCell[]> => {
    const grid = new Map<number, GridCell[]>()
    for (const w of sortedWeekdays) grid.set(w.id, new Array(numSlots).fill(null).map(() => ({ kind: 'empty' } as GridCell)))

    for (const table of tables) {
      for (const entry of entries) {
        if (entry.faculty_id !== facultyId || entry.schedule_table_id !== table.id || !entry.course_id) continue
        const course = courseMap.get(entry.course_id)
        if (!course || entry.time_slot_ids.length === 0) continue
        const slotIds = [...entry.time_slot_ids].sort((a, b) => (slotOrder.get(a) ?? 0) - (slotOrder.get(b) ?? 0))
        const startIdx = slotOrder.get(slotIds[0])
        if (startIdx === undefined) continue
        const span = slotIds.length
        const timeRange = formatSlotRangeLabel(slotIds, sortedTimeSlots, slotOrder)
        const room = entry.room_id != null ? roomMap.get(entry.room_id) ?? null : null
        const effWeekdays = entry.active_weekday_ids.length ? entry.active_weekday_ids : table.weekday_ids
        for (const wid of effWeekdays) {
          const col = grid.get(wid)
          if (!col) continue
          col[startIdx] = { kind: 'course', entry, course, room, span, timeRange }
          for (let i = startIdx + 1; i < startIdx + span && i < col.length; i++) col[i] = { kind: 'covered' }
        }
      }
    }

    for (const oh of officeHours) {
      if (oh.faculty_id !== facultyId) continue
      const col = grid.get(oh.weekday_id)
      if (!col) continue
      const preview = dragPreview && dragPreview.officeHourId === oh.id ? dragPreview : null
      const slotIds = preview
        ? sortedTimeSlots.slice(preview.startIdx, preview.endIdx + 1).map(ts => ts.id)
        : [...oh.time_slot_ids].sort((a, b) => (slotOrder.get(a) ?? 0) - (slotOrder.get(b) ?? 0))
      if (slotIds.length === 0) continue
      const startIdx = slotOrder.get(slotIds[0])
      if (startIdx === undefined) continue
      const span = slotIds.length
      const timeRange = formatSlotRangeLabel(slotIds, sortedTimeSlots, slotOrder)
      if (col[startIdx].kind !== 'empty') continue
      col[startIdx] = { kind: 'officehour', officeHour: oh, span, timeRange }
      for (let i = startIdx + 1; i < startIdx + span && i < col.length; i++) col[i] = { kind: 'covered' }
    }

    return grid
  }

  const selectedTerm = terms.find(t => t.id === selectedTermId)
  const sortedFaculty = [...allFaculty].sort((a, b) => facultyDisplayName(a).localeCompare(facultyDisplayName(b)))
  const visibleFaculty = sortedFaculty.filter(f => facultyVisible(f, facultyFilters))

  const addFacultyFilter = (value: string) => {
    setFacultyFilters(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, value, negated: false }])
  }
  const removeFacultyFilter = (id: string) => setFacultyFilters(prev => prev.filter(f => f.id !== id))
  const toggleFacultyFilterNot = (id: string) => setFacultyFilters(prev => prev.map(f => f.id === id ? { ...f, negated: !f.negated } : f))

  const officeHourMinutes = (facultyId: number): number =>
    officeHours
      .filter(oh => oh.faculty_id === facultyId)
      .reduce((sum, oh) => sum + oh.time_slot_ids.reduce((s, sid) => {
        const slot = timeSlots.find(ts => ts.id === sid)
        return s + (slot ? slotMinutes(slot) : 0)
      }, 0), 0)

  const addOfficeHour = async (facultyId: number, weekdayId: number, timeSlotId: number) => {
    if (!selectedTermId) return
    try {
      const created = await officeHoursApi.create(facultyId, {
        term_id: selectedTermId, weekday_id: weekdayId, time_slot_ids: [timeSlotId],
      })
      setOfficeHours(prev => [...prev, created])
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to add office hour')
    }
    setCtxMenu(null)
  }

  const deleteOfficeHour = async (id: number) => {
    try {
      await officeHoursApi.delete(id)
      setOfficeHours(prev => prev.filter(o => o.id !== id))
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to delete office hour')
    }
  }

  const startResize = (oh: OfficeHour, edge: 'top' | 'bottom', facultyId: number, startIdx: number, endIdx: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const occupied = occupiedSlotIndexes(facultyId, oh.weekday_id, oh.id)
    let minStartIdx = startIdx
    while (minStartIdx - 1 >= 0 && !occupied[minStartIdx - 1]) minStartIdx--
    let maxEndIdx = endIdx
    while (maxEndIdx + 1 < numSlots && !occupied[maxEndIdx + 1]) maxEndIdx++
    dragRef.current = {
      officeHourId: oh.id, edge, facultyId, weekdayId: oh.weekday_id, startY: e.clientY,
      origStartIdx: startIdx, origEndIdx: endIdx, minStartIdx, maxEndIdx,
    }
    setDragPreview({ officeHourId: oh.id, startIdx, endIdx })
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
    const onMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const deltaRows = Math.round((e.clientY - drag.startY) / ROW_HEIGHT)
      if (drag.edge === 'top') {
        const newStart = clamp(drag.origStartIdx + deltaRows, drag.minStartIdx, drag.origEndIdx)
        setDragPreview({ officeHourId: drag.officeHourId, startIdx: newStart, endIdx: drag.origEndIdx })
      } else {
        const newEnd = clamp(drag.origEndIdx + deltaRows, drag.origStartIdx, drag.maxEndIdx)
        setDragPreview({ officeHourId: drag.officeHourId, startIdx: drag.origStartIdx, endIdx: newEnd })
      }
    }
    const onMouseUp = async () => {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setDragPreview(current => {
        if (current && current.officeHourId === drag.officeHourId &&
            (current.startIdx !== drag.origStartIdx || current.endIdx !== drag.origEndIdx)) {
          const newSlotIds = sortedTimeSlotsRef.current.slice(current.startIdx, current.endIdx + 1).map(ts => ts.id)
          officeHoursApi.resize(drag.officeHourId, newSlotIds)
            .then(updated => setOfficeHours(prev => prev.map(o => o.id === updated.id ? updated : o)))
            .catch((e: any) => showToast(e.response?.data?.detail || 'Failed to resize office hour'))
            .finally(() => setDragPreview(null))
          return current
        }
        return null
      })
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return (
    <div>
      <div className="page-header">
        <h1>Faculty Schedule</h1>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Term</div>
            <SearchableSelect
              options={terms.map(t => ({ id: t.id, label: termLabel(t) }))}
              selectedId={selectedTermId}
              onSelect={setSelectedTermId}
              placeholder="Select term..."
              searchPlaceholder="Search terms..."
            />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <FacultyFilterBar
            filters={facultyFilters}
            onAdd={addFacultyFilter}
            onRemove={removeFacultyFilter}
            onToggleNot={toggleFacultyFilterNot}
          />
        </div>

        {!selectedTerm ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Select a term.</div>
        ) : visibleFaculty.length === 0 ? (
          <div className="empty-state"><div className="icon">👤</div>No faculty match the current filters.</div>
        ) : (
          visibleFaculty.map(faculty => {
            const grid = buildFacultyGrid(faculty.id)
            const minutes = officeHourMinutes(faculty.id)
            const minMinutes = loadSettings.min_office_hours_per_week * 60
            const underMin = minutes < minMinutes
            return (
              <div key={faculty.id} className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 2 }}>
                      {facultyDisplayName(faculty)}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {termLabel(selectedTerm)} Schedule
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: underMin ? 'var(--warning)' : 'var(--text-secondary)', fontWeight: underMin ? 700 : 400 }}>
                    Office Hours: {(minutes / 60).toFixed(1)} / {loadSettings.min_office_hours_per_week} hrs/week
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '6px 10px', textAlign: 'left', background: 'var(--bg-elevated)', fontSize: 11, border: '1px solid var(--border-color)', minWidth: 120 }}>Time Slot</th>
                        {sortedWeekdays.map(w => (
                          <th key={w.id} style={{ padding: '6px 10px', textAlign: 'center', background: 'var(--bg-elevated)', fontSize: 11, border: '1px solid var(--border-color)', minWidth: 190 }}>
                            {w.name.charAt(0).toUpperCase() + w.name.slice(1)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTimeSlots.map((ts, r) => (
                        <tr key={ts.id} style={{ height: ROW_HEIGHT }}>
                          <td style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-secondary)', border: '1px solid var(--border-color)', whiteSpace: 'nowrap', background: 'var(--bg-elevated)' }}>
                            {ts.label}
                          </td>
                          {sortedWeekdays.map(w => {
                            const cell = grid.get(w.id)?.[r]
                            if (!cell || cell.kind === 'covered') return null

                            if (cell.kind === 'empty') {
                              return (
                                <td
                                  key={w.id}
                                  style={{ padding: 4, border: '1px solid var(--border-color)', height: ROW_HEIGHT, boxSizing: 'border-box' }}
                                  onContextMenu={e => {
                                    if (!isLoggedIn) return
                                    e.preventDefault()
                                    setCtxMenu({ x: e.clientX, y: e.clientY, facultyId: faculty.id, weekdayId: w.id, timeSlotId: ts.id })
                                  }}
                                />
                              )
                            }

                            if (cell.kind === 'course') {
                              const bg = courseColor(cell.course.id)
                              return (
                                <td key={w.id} rowSpan={cell.span} style={{ padding: 4, border: '1px solid var(--border-color)', height: cell.span * ROW_HEIGHT }}>
                                  <div style={{
                                    background: bg, borderRadius: 3,
                                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                                    textAlign: 'center', padding: '8px 10px', boxSizing: 'border-box', minHeight: 56, height: '100%',
                                  }}>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: '#eee' }}>
                                      {cell.course.dept_code} {cell.course.course_number} Sec {cell.entry.section}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#ddd', marginTop: 2 }}>{cell.course.course_name}</div>
                                    {cell.room && (
                                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>{cell.room.display_label}</div>
                                    )}
                                    {cell.timeRange && (
                                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>{cell.timeRange}</div>
                                    )}
                                  </div>
                                </td>
                              )
                            }

                            // office hour
                            const isDragging = dragPreview?.officeHourId === cell.officeHour.id
                            return (
                              <td key={w.id} rowSpan={cell.span} style={{ padding: 4, border: '1px solid var(--border-color)', height: cell.span * ROW_HEIGHT }}>
                                <div style={{
                                  position: 'relative',
                                  background: OFFICE_HOUR_SOLID_COLOR, borderRadius: 3,
                                  border: isDragging ? '1px solid var(--accent)' : '1px solid transparent',
                                  display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                                  textAlign: 'center', padding: '8px 10px', boxSizing: 'border-box', minHeight: 56, height: '100%',
                                }}>
                                  <div style={{ fontWeight: 700, fontSize: 12, color: '#eee', letterSpacing: '0.03em', textTransform: 'uppercase', opacity: 0.8 }}>
                                    Office Hours
                                  </div>
                                  {faculty.office && (
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>{faculty.office}</div>
                                  )}
                                  {cell.timeRange && (
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>{cell.timeRange}</div>
                                  )}
                                  {isLoggedIn && (
                                    <>
                                      <div
                                        onMouseDown={startResize(cell.officeHour, 'top', faculty.id, r, r + cell.span - 1)}
                                        title="Drag to change start time"
                                        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, cursor: 'row-resize' }}
                                      />
                                      <div
                                        onMouseDown={startResize(cell.officeHour, 'bottom', faculty.id, r, r + cell.span - 1)}
                                        title="Drag to change end time"
                                        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 'row-resize' }}
                                      />
                                      <button
                                        onClick={() => deleteOfficeHour(cell.officeHour.id)}
                                        style={{
                                          position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.4)',
                                          color: '#ff8080', border: 'none', borderRadius: 3, padding: '0 4px',
                                          fontSize: 11, cursor: 'pointer', lineHeight: '16px',
                                        }}
                                      >×</button>
                                    </>
                                  )}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })
        )}
      </div>

      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          style={{
            position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 3000,
            background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 6,
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)', padding: 4,
          }}
        >
          <button
            className="btn-secondary btn-sm"
            onClick={() => addOfficeHour(ctxMenu.facultyId, ctxMenu.weekdayId, ctxMenu.timeSlotId)}
            style={{ whiteSpace: 'nowrap' }}
          >
            + Add Office Hour
          </button>
        </div>
      )}
    </div>
  )
}
