import { useState, useEffect, useRef, useMemo } from 'react'
import {
  termsApi, tablesApi, entriesApi, coursesApi, weekdaysApi, timeSlotsApi, facultyApi, roomsApi,
  officeHoursApi, loadSettingsApi, meetingsApi, facultyAttributesApi, termLabel, DEFAULT_PRINT_CONFIG,
  type Term, type Weekday, type TimeSlot, type ScheduleTable, type ScheduleEntry,
  type Course, type Faculty, type OfficeHour, type LoadSettings, type Room, type Meeting,
  type FacultyRank, type FacultyAttribute, type PrintConfig,
} from '../api'
import { SearchableSelect } from '../components/SearchableSelect'
import { courseColor, OFFICE_HOUR_SOLID_COLOR, MEETING_SOLID_COLOR } from '../components/ScheduleGrid'
import { PrintConfigPanel } from '../components/PrintConfigPanel'
import { showToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'

const ROW_HEIGHT = 64
const MIN_OFFICE_HOUR_MINUTES = 30
// Below this rendered height, the normal 3-line card (label + office +
// time) can't fit — collapse to a single centered line instead.
const COMPACT_HEIGHT_PX = 42

const RANK_LABELS: Record<FacultyRank, string> = {
  instructor: 'Instructor',
  senior_instructor: 'Senior Instructor',
  assistant_professor: 'Assistant Professor',
  associate_professor: 'Associate Professor',
  professor_of_practice: 'Professor of Practice',
  professor: 'Professor',
}

type CourseCell = { kind: 'course'; entry: ScheduleEntry; course: Course; room: Room | null; span: number; timeRange: string }
// Meetings (feedback_58) carry no faculty_id of their own — they're
// department-wide, so the same meeting is shown on every faculty's table.
type MeetingCell = { kind: 'meeting'; entry: ScheduleEntry; meeting: Meeting; room: Room | null; span: number; timeRange: string }
// A single row-position can host several office-hour blocks that all start
// within the same underlying time slot (e.g. two short blocks inside one
// 75-minute slot) — `items` holds all of them, laid out side by side.
type OfficeHourCell = { kind: 'officehour'; items: OfficeHourPlacement[]; span: number }
type EmptyCell = { kind: 'empty' }
type CoveredCell = { kind: 'covered' }
type GridCell = CourseCell | MeetingCell | OfficeHourCell | EmptyCell | CoveredCell

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
  return minutesBetween(slot.start_time, slot.end_time)
}

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

// "14:05" -> "2:05 PM" — TimeSlot rows only ever show a pre-baked label, but
// office hours carry raw "HH:MM" strings that need formatting ourselves.
function formatTimeOfDay(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function formatTimeRange(start: string, end: string): string {
  return `${formatTimeOfDay(start)} - ${formatTimeOfDay(end)}`
}

// Combines a set of (already-contiguous) time slot ids into one human range,
// e.g. "10:30 AM - 11:45 AM" — used for courses, which stay slot-quantized.
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

interface OfficeHourPlacement {
  officeHour: OfficeHour
  firstIdx: number
  lastIdx: number
  // Fraction of the first/last touched slot's own duration that falls
  // *outside* the office hour's actual range — lets the block's edges land
  // mid-cell instead of snapping to a slot boundary (feedback_57).
  topInsetFrac: number
  bottomInsetFrac: number
  timeRange: string
}

// Figures out which time-slot rows a free-form office hour visually spans,
// and how far inset its top/bottom edges are within the first/last of those
// rows. Falls back to pinning a sliver at the nearest row edge if the office
// hour's time range doesn't touch any defined slot at all (e.g. entirely
// before/after the day's slots).
function computeOfficeHourPlacement(oh: OfficeHour, sortedTimeSlots: TimeSlot[], slotOrder: Map<number, number>): OfficeHourPlacement {
  const timeRange = formatTimeRange(oh.start_time, oh.end_time)
  const touched = sortedTimeSlots.filter(ts => ts.start_time < oh.end_time && oh.start_time < ts.end_time)

  if (touched.length > 0) {
    const first = touched[0]
    const last = touched[touched.length - 1]
    const firstIdx = slotOrder.get(first.id)!
    const lastIdx = slotOrder.get(last.id)!
    const topInsetFrac = oh.start_time <= first.start_time ? 0 : minutesBetween(first.start_time, oh.start_time) / slotMinutes(first)
    const bottomInsetFrac = oh.end_time >= last.end_time ? 0 : minutesBetween(oh.end_time, last.end_time) / slotMinutes(last)
    return { officeHour: oh, firstIdx, lastIdx, topInsetFrac, bottomInsetFrac, timeRange }
  }

  if (sortedTimeSlots.length === 0) {
    return { officeHour: oh, firstIdx: 0, lastIdx: 0, topInsetFrac: 0, bottomInsetFrac: 0, timeRange }
  }
  const after = sortedTimeSlots.find(ts => ts.start_time >= oh.end_time)
  if (after) {
    const idx = slotOrder.get(after.id)!
    return { officeHour: oh, firstIdx: idx, lastIdx: idx, topInsetFrac: 0, bottomInsetFrac: 0.9, timeRange }
  }
  const idx = sortedTimeSlots.length - 1
  return { officeHour: oh, firstIdx: idx, lastIdx: idx, topInsetFrac: 0.9, bottomInsetFrac: 0, timeRange }
}

interface PopupState {
  mode: 'create' | 'edit'
  x: number
  y: number
  facultyId: number
  weekdayId: number
  officeHourId?: number
  startTime: string
  endTime: string
}

export function FacultyScheduleTab() {
  const { isLoggedIn } = useAuth()
  const [terms, setTerms] = useState<Term[]>([])
  const [allFaculty, setAllFaculty] = useState<Faculty[]>([])
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [attributes, setAttributes] = useState<FacultyAttribute[]>([])
  const [loadSettings, setLoadSettings] = useState<LoadSettings>({ fulltime_load: 3, parttime_load: 2, min_office_hours_fulltime: 4, min_office_hours_parttime: 1 })

  const [selectedTermId, setSelectedTermId] = useState<number | null>(null)
  const [facultyFilters, setFacultyFilters] = useState<FacultyFilter[]>([])
  const [filterFullTime, setFilterFullTime] = useState(false)
  const [filterPartTime, setFilterPartTime] = useState(false)
  const [filterDeptOnly, setFilterDeptOnly] = useState(false)
  const [printConfig, setPrintConfig] = useState<PrintConfig>(DEFAULT_PRINT_CONFIG)

  const [tables, setTables] = useState<ScheduleTable[]>([])
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [officeHours, setOfficeHours] = useState<OfficeHour[]>([])

  const [popup, setPopup] = useState<PopupState | null>(null)
  const [savingPopup, setSavingPopup] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      termsApi.list(), facultyApi.list(), weekdaysApi.list(), timeSlotsApi.list(), roomsApi.list(), loadSettingsApi.get(),
      facultyAttributesApi.list(),
    ]).then(([t, f, w, ts, r, ls, attrs]) => {
      setTerms(t)
      setAllFaculty(f)
      setWeekdays(w)
      setTimeSlots(ts)
      setRooms(r)
      setLoadSettings(ls)
      setAttributes(attrs)
      if (t.length) setSelectedTermId(t[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selectedTermId) { setTables([]); setEntries([]); setCourses([]); setMeetings([]); setOfficeHours([]); return }
    const term = terms.find(t => t.id === selectedTermId)
    if (!term) return
    Promise.all([
      tablesApi.list(selectedTermId),
      entriesApi.listByTerm(selectedTermId),
      coursesApi.list(term.semester_name),
      meetingsApi.list(selectedTermId),
      officeHoursApi.list(selectedTermId),
    ]).then(([tbs, ents, cs, mts, ohs]) => {
      setTables(tbs)
      setEntries(ents)
      setCourses(cs)
      setMeetings(mts)
      setOfficeHours(ohs)
    })
  }, [selectedTermId, terms])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setPopup(null)
    }
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopup(null) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', escHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escHandler)
    }
  }, [])

  const courseMap = new Map(courses.map(c => [c.id, c]))
  const meetingMap = new Map(meetings.map(m => [m.id, m]))
  const roomMap = new Map(rooms.map(r => [r.id, r]))
  const attributeMap = new Map(attributes.map(a => [a.id, a]))
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

  // grid[weekdayId][slotIndex] — rows=time slots, columns=weekdays, scoped to
  // one faculty's own courses + office hours, plus scheduled meetings — but
  // only for faculty who are actually required to attend (full-time AND
  // department-owned, feedback_59); everyone else's table omits the meeting
  // block entirely.
  const buildFacultyGrid = (faculty: Faculty): Map<number, GridCell[]> => {
    const facultyId = faculty.id
    const requiresDepartmentMeeting = faculty.is_department_owned && faculty.full_time_or_part_time === 'full_time'
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

    if (requiresDepartmentMeeting) for (const table of tables) {
      for (const entry of entries) {
        if (entry.schedule_table_id !== table.id || !entry.meeting_id) continue
        const meeting = meetingMap.get(entry.meeting_id)
        if (!meeting || entry.time_slot_ids.length === 0) continue
        const slotIds = [...entry.time_slot_ids].sort((a, b) => (slotOrder.get(a) ?? 0) - (slotOrder.get(b) ?? 0))
        const startIdx = slotOrder.get(slotIds[0])
        if (startIdx === undefined) continue
        const span = slotIds.length
        const timeRange = formatSlotRangeLabel(slotIds, sortedTimeSlots, slotOrder)
        const room = entry.room_id != null ? roomMap.get(entry.room_id) ?? null : null
        const effWeekdays = entry.active_weekday_ids.length ? entry.active_weekday_ids : table.weekday_ids
        for (const wid of effWeekdays) {
          const col = grid.get(wid)
          if (!col || col[startIdx].kind !== 'empty') continue
          col[startIdx] = { kind: 'meeting', entry, meeting, room, span, timeRange }
          for (let i = startIdx + 1; i < startIdx + span && i < col.length; i++) col[i] = { kind: 'covered' }
        }
      }
    }

    // Group office-hour placements by (weekday, starting row) — several
    // short blocks can legitimately start within the same underlying slot.
    const placementGroups = new Map<string, OfficeHourPlacement[]>()
    for (const oh of officeHours) {
      if (oh.faculty_id !== facultyId || !grid.has(oh.weekday_id)) continue
      const placement = computeOfficeHourPlacement(oh, sortedTimeSlots, slotOrder)
      const key = `${oh.weekday_id}:${placement.firstIdx}`
      const arr = placementGroups.get(key)
      if (arr) arr.push(placement)
      else placementGroups.set(key, [placement])
    }
    for (const [key, items] of placementGroups) {
      const [weekdayIdStr, firstIdxStr] = key.split(':')
      const weekdayId = Number(weekdayIdStr)
      const firstIdx = Number(firstIdxStr)
      const col = grid.get(weekdayId)
      if (!col || col[firstIdx].kind !== 'empty') continue
      const maxLastIdx = Math.max(...items.map(it => it.lastIdx))
      const span = maxLastIdx - firstIdx + 1
      col[firstIdx] = { kind: 'officehour', items, span }
      for (let i = firstIdx + 1; i <= maxLastIdx && i < col.length; i++) col[i] = { kind: 'covered' }
    }

    return grid
  }

  const selectedTerm = terms.find(t => t.id === selectedTermId)
  const sortedFaculty = [...allFaculty].sort((a, b) => facultyDisplayName(a).localeCompare(facultyDisplayName(b)))
  const visibleFaculty = sortedFaculty.filter(f => {
    if (!facultyVisible(f, facultyFilters)) return false
    // Full-Time/Part-Time are two checkboxes on the same dimension (rank) —
    // checking either narrows to that rank; checking neither shows both.
    const rankOk = (!filterFullTime && !filterPartTime) ||
      (filterFullTime && f.full_time_or_part_time === 'full_time') ||
      (filterPartTime && f.full_time_or_part_time === 'part_time')
    if (!rankOk) return false
    if (filterDeptOnly && !f.is_department_owned) return false
    return true
  })

  const addFacultyFilter = (value: string) => {
    setFacultyFilters(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, value, negated: false }])
  }
  const removeFacultyFilter = (id: string) => setFacultyFilters(prev => prev.filter(f => f.id !== id))
  const toggleFacultyFilterNot = (id: string) => setFacultyFilters(prev => prev.map(f => f.id === id ? { ...f, negated: !f.negated } : f))

  const officeHourMinutes = (facultyId: number): number =>
    officeHours
      .filter(oh => oh.faculty_id === facultyId)
      .reduce((sum, oh) => sum + minutesBetween(oh.start_time, oh.end_time), 0)

  // Scheduled section count this term — same "raw section count" the Load
  // tab shows, just scoped to whichever faculty's card is rendering.
  const sectionCount = (facultyId: number): number =>
    entries.filter(e => e.faculty_id === facultyId && e.course_id && e.schedule_table_id).length

  const openCreatePopup = (e: React.MouseEvent, facultyId: number, weekdayId: number, slot: TimeSlot) => {
    if (!isLoggedIn) return
    e.preventDefault()
    setPopup({ mode: 'create', x: e.clientX, y: e.clientY, facultyId, weekdayId, startTime: slot.start_time, endTime: slot.end_time })
  }

  const openEditPopup = (e: React.MouseEvent, facultyId: number, weekdayId: number, oh: OfficeHour) => {
    if (!isLoggedIn) return
    e.preventDefault()
    e.stopPropagation()
    setPopup({ mode: 'edit', x: e.clientX, y: e.clientY, facultyId, weekdayId, officeHourId: oh.id, startTime: oh.start_time, endTime: oh.end_time })
  }

  const submitPopup = async () => {
    if (!popup || !selectedTermId) return
    if (popup.startTime >= popup.endTime) {
      showToast('End time must be after start time')
      return
    }
    if (minutesBetween(popup.startTime, popup.endTime) < MIN_OFFICE_HOUR_MINUTES) {
      showToast(`Office hours must be at least ${MIN_OFFICE_HOUR_MINUTES} minutes`)
      return
    }
    setSavingPopup(true)
    try {
      if (popup.mode === 'create') {
        const created = await officeHoursApi.create(popup.facultyId, {
          term_id: selectedTermId, weekday_id: popup.weekdayId, start_time: popup.startTime, end_time: popup.endTime,
        })
        setOfficeHours(prev => [...prev, created])
      } else if (popup.officeHourId) {
        const updated = await officeHoursApi.update(popup.officeHourId, { start_time: popup.startTime, end_time: popup.endTime })
        setOfficeHours(prev => prev.map(o => o.id === updated.id ? updated : o))
      }
      setPopup(null)
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to save office hour')
    } finally {
      setSavingPopup(false)
    }
  }

  const deletePopupOfficeHour = async () => {
    if (!popup?.officeHourId) return
    const id = popup.officeHourId
    setSavingPopup(true)
    try {
      await officeHoursApi.delete(id)
      setOfficeHours(prev => prev.filter(o => o.id !== id))
      setPopup(null)
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to delete office hour')
    } finally {
      setSavingPopup(false)
    }
  }

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

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <FacultyFilterBar
            filters={facultyFilters}
            onAdd={addFacultyFilter}
            onRemove={removeFacultyFilter}
            onToggleNot={toggleFacultyFilterNot}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 12, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={filterFullTime} onChange={e => setFilterFullTime(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            Full-Time
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 12, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={filterPartTime} onChange={e => setFilterPartTime(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            Part-Time
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 12, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={filterDeptOnly} onChange={e => setFilterDeptOnly(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            Department Only
          </label>
        </div>

        <PrintConfigPanel
          config={printConfig}
          onChange={setPrintConfig}
          previewOptions={sortedFaculty.map(f => ({ id: f.id, label: facultyDisplayName(f) }))}
          buildPreviewUrl={id => selectedTermId != null ? facultyApi.schedulePdfUrl(id, selectedTermId, printConfig) : null}
          showIconSize
        />

        {!selectedTerm ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Select a term.</div>
        ) : visibleFaculty.length === 0 ? (
          <div className="empty-state"><div className="icon">👤</div>No faculty match the current filters.</div>
        ) : (
          visibleFaculty.map(faculty => {
            const grid = buildFacultyGrid(faculty)
            const minutes = officeHourMinutes(faculty.id)
            const minHours = faculty.full_time_or_part_time === 'full_time' ? loadSettings.min_office_hours_fulltime : loadSettings.min_office_hours_parttime
            const minMinutes = minHours * 60
            const underMin = minutes < minMinutes
            const fullLoad = faculty.full_time_or_part_time === 'full_time' ? loadSettings.fulltime_load : loadSettings.parttime_load
            const sections = sectionCount(faculty.id)
            const facultyAttrs = faculty.attribute_ids.map(id => attributeMap.get(id)).filter((a): a is FacultyAttribute => !!a)
            return (
              <div key={faculty.id} className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-bright)' }}>
                        {facultyDisplayName(faculty)}
                      </div>
                      {facultyAttrs.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {facultyAttrs.map(a => a.has_icon ? (
                            <img key={a.id} src={facultyAttributesApi.iconUrl(a.id)} alt={a.name} title={a.name} style={{ width: 64, height: 64, objectFit: 'contain' }} />
                          ) : (
                            <span key={a.id} className="tag" title={a.name}>{a.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      {termLabel(selectedTerm)} Schedule
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span>{faculty.rank ? RANK_LABELS[faculty.rank] : 'Rank not set'}</span>
                      <span className={`badge ${faculty.full_time_or_part_time === 'full_time' ? 'badge-fall' : 'badge-spring'}`}>
                        {faculty.full_time_or_part_time === 'full_time' ? 'Full Time' : 'Part Time'}
                      </span>
                      <span>Load: {sections} / {fullLoad}</span>
                      {faculty.office && <span>Office: {faculty.office}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ fontSize: 12, color: underMin ? 'var(--warning)' : 'var(--text-secondary)', fontWeight: underMin ? 700 : 400 }}>
                      Office Hours: {(minutes / 60).toFixed(1)} / {minHours} hrs/week
                    </div>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => selectedTermId != null && window.open(
                        facultyApi.schedulePdfUrl(faculty.id, selectedTermId, printConfig),
                        '_blank'
                      )}
                    >
                      Export
                    </button>
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
                                  onContextMenu={e => openCreatePopup(e, faculty.id, w.id, ts)}
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

                            if (cell.kind === 'meeting') {
                              return (
                                <td key={w.id} rowSpan={cell.span} style={{ padding: 4, border: '1px solid var(--border-color)', height: cell.span * ROW_HEIGHT }}>
                                  <div style={{
                                    background: MEETING_SOLID_COLOR, borderRadius: 3,
                                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                                    textAlign: 'center', padding: '8px 10px', boxSizing: 'border-box', minHeight: 56, height: '100%',
                                  }}>
                                    <div style={{ fontWeight: 700, fontSize: 10, color: '#fff', letterSpacing: '0.03em', textTransform: 'uppercase', opacity: 0.7 }}>
                                      Meeting
                                    </div>
                                    <div style={{ fontWeight: 600, fontSize: 13, color: '#fff', marginTop: 2 }}>{cell.meeting.name}</div>
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

                            // office hour(s) — one or more free-form blocks starting on this row
                            return (
                              <td key={w.id} rowSpan={cell.span} style={{ padding: 4, border: '1px solid var(--border-color)', height: cell.span * ROW_HEIGHT }}>
                                <div style={{ display: 'flex', gap: 4, height: '100%' }}>
                                  {cell.items.map(item => {
                                    const itemRows = item.lastIdx - item.firstIdx + 1
                                    const topPx = item.topInsetFrac * ROW_HEIGHT
                                    const bottomPx = (cell.span - itemRows) * ROW_HEIGHT + item.bottomInsetFrac * ROW_HEIGHT
                                    const heightPx = itemRows * ROW_HEIGHT - topPx - bottomPx
                                    const compact = heightPx < COMPACT_HEIGHT_PX
                                    return (
                                      <div key={item.officeHour.id} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                                        <div
                                          onContextMenu={e => openEditPopup(e, faculty.id, w.id, item.officeHour)}
                                          title={isLoggedIn ? 'Right-click to edit' : undefined}
                                          style={{
                                            position: 'absolute', top: topPx, bottom: bottomPx, left: 0, right: 0,
                                            background: OFFICE_HOUR_SOLID_COLOR, borderRadius: 3, border: '1px solid rgba(255,255,255,0.15)',
                                            display: 'flex',
                                            flexDirection: compact ? 'row' : 'column',
                                            justifyContent: 'center', alignItems: 'center',
                                            textAlign: 'center', padding: compact ? '0 4px' : '4px 6px', boxSizing: 'border-box', overflow: 'hidden',
                                            cursor: isLoggedIn ? 'context-menu' : 'default',
                                          }}
                                        >
                                          {compact ? (
                                            <div style={{ fontSize: 9, fontWeight: 600, color: '#eee', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                              {item.timeRange}
                                            </div>
                                          ) : (
                                            <>
                                              <div style={{ fontWeight: 700, fontSize: 10, color: '#eee', letterSpacing: '0.03em', textTransform: 'uppercase', opacity: 0.8 }}>
                                                Office Hours
                                              </div>
                                              {faculty.office && (
                                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{faculty.office}</div>
                                              )}
                                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>{item.timeRange}</div>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
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

      {popup && (
        <div
          ref={popupRef}
          style={{
            position: 'fixed', top: popup.y, left: popup.x, zIndex: 3000,
            background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 6,
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)', padding: 12, minWidth: 220,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 8 }}>
            {popup.mode === 'create' ? 'Add Office Hour' : 'Edit Office Hour'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div className="form-group" style={{ margin: 0, flex: 1 }}>
              <label style={{ fontSize: 11 }}>Start</label>
              <input
                type="time"
                value={popup.startTime}
                onChange={e => setPopup(p => p && { ...p, startTime: e.target.value })}
                style={{ padding: '4px 6px', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div className="form-group" style={{ margin: 0, flex: 1 }}>
              <label style={{ fontSize: 11 }}>End</label>
              <input
                type="time"
                value={popup.endTime}
                onChange={e => setPopup(p => p && { ...p, endTime: e.target.value })}
                style={{ padding: '4px 6px', fontSize: 12, width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            {popup.mode === 'edit' && (
              <button className="btn-danger btn-sm" disabled={savingPopup} onClick={deletePopupOfficeHour}>Delete</button>
            )}
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <button className="btn-secondary btn-sm" onClick={() => setPopup(null)}>Cancel</button>
              <button className="btn-primary btn-sm" disabled={savingPopup} onClick={submitPopup}>
                {popup.mode === 'create' ? 'Add' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
