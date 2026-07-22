import { useState, useEffect } from 'react'
import {
  termsApi, tablesApi, entriesApi, coursesApi, facultyApi, roomsApi, weekdaysApi, timeSlotsApi, termLabel,
  courseListExportUrl,
  type Term, type ScheduleTable, type ScheduleEntry, type Course, type Faculty, type Room, type Weekday, type TimeSlot,
} from '../api'
import { SearchableSelect } from '../components/SearchableSelect'
import { SortableTh, compareValues, nextSort, type SortState } from '../components/SortableTh'

const DAY_ABBR: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' }

function formatClock(t: string): string {
  const [hStr, m] = t.split(':')
  let h = parseInt(hStr, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${m} ${ampm}`
}

interface Row {
  entry: ScheduleEntry
  course: Course
  faculty: Faculty | null
  room: Room | null
  dayLabel: string
  startMinutes: number
  timeLabel: string
}

function minutesOf(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const EMPTY_COLUMN_FILTERS = { code: '', title: '', section: '', instructor: '', fulltime: '', time: '', room: '' }

export function TermCourseListTab() {
  const [terms, setTerms] = useState<Term[]>([])
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null)
  const [tables, setTables] = useState<ScheduleTable[]>([])
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [allFaculty, setAllFaculty] = useState<Faculty[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [sort, setSort] = useState<SortState | null>({ key: 'code', dir: 'asc' })
  const [columnFilters, setColumnFilters] = useState(EMPTY_COLUMN_FILTERS)

  useEffect(() => {
    Promise.all([termsApi.list(), facultyApi.list(), roomsApi.list(), weekdaysApi.list(), timeSlotsApi.list()])
      .then(([t, f, r, w, ts]) => {
        setTerms(t)
        setAllFaculty(f)
        setRooms(r)
        setWeekdays(w)
        setTimeSlots(ts)
        if (t.length) setSelectedTermId(t[0].id)
      })
  }, [])

  useEffect(() => {
    if (!selectedTermId) { setTables([]); setEntries([]); setCourses([]); return }
    const term = terms.find(t => t.id === selectedTermId)
    if (!term) return
    Promise.all([
      tablesApi.list(selectedTermId),
      entriesApi.listByTerm(selectedTermId),
      coursesApi.list(term.semester_name),
    ]).then(([tbs, ents, cs]) => {
      setTables(tbs)
      setEntries(ents)
      setCourses(cs)
    })
  }, [selectedTermId, terms])

  const selectedTerm = terms.find(t => t.id === selectedTermId)
  const courseMap = new Map(courses.map(c => [c.id, c]))
  const facultyMap = new Map(allFaculty.map(f => [f.id, f]))
  const roomMap = new Map(rooms.map(r => [r.id, r]))
  const tableMap = new Map(tables.map(t => [t.id, t]))
  const weekdayMap = new Map(weekdays.map(w => [w.id, w]))
  const timeSlotMap = new Map(timeSlots.map(ts => [ts.id, ts]))
  const sortedWeekdays = [...weekdays].sort((a, b) => a.display_order - b.display_order)

  const buildTimeInfo = (entry: ScheduleEntry): { dayLabel: string; startMinutes: number; timeLabel: string } => {
    const table = entry.schedule_table_id != null ? tableMap.get(entry.schedule_table_id) : undefined
    if (!table || entry.time_slot_ids.length === 0) return { dayLabel: '', startMinutes: -1, timeLabel: 'Not scheduled' }

    const effWeekdayIds = entry.active_weekday_ids.length ? entry.active_weekday_ids : table.weekday_ids
    const days = sortedWeekdays.filter(w => effWeekdayIds.includes(w.id)).map(w => DAY_ABBR[w.name] ?? w.name)

    const slots = entry.time_slot_ids.map(id => timeSlotMap.get(id)).filter((s): s is TimeSlot => !!s)
      .sort((a, b) => a.display_order - b.display_order)
    if (slots.length === 0 || days.length === 0) return { dayLabel: '', startMinutes: -1, timeLabel: 'Not scheduled' }

    const start = slots[0].start_time
    const end = slots[slots.length - 1].end_time
    return {
      dayLabel: days.join('/'),
      startMinutes: minutesOf(start),
      timeLabel: `${days.join('/')} ${formatClock(start)}–${formatClock(end)}`,
    }
  }

  const rows: Row[] = entries
    .filter(e => e.course_id != null)
    .map(entry => {
      const course = courseMap.get(entry.course_id as number)
      if (!course) return null
      const faculty = entry.faculty_id != null ? facultyMap.get(entry.faculty_id) ?? null : null
      const room = entry.room_id != null ? roomMap.get(entry.room_id) ?? null : null
      const { dayLabel, startMinutes, timeLabel } = buildTimeInfo(entry)
      return { entry, course, faculty, room, dayLabel, startMinutes, timeLabel }
    })
    .filter((r): r is Row => r !== null)

  const sortKeyValue = (r: Row, key: string): string | number => {
    switch (key) {
      case 'code': return r.course.course_number // number part only, per feedback_75
      case 'title': return r.course.course_name
      case 'section': return r.entry.section
      case 'instructor': return r.faculty ? `${r.faculty.last_name}, ${r.faculty.first_name}` : ''
      case 'fulltime': return r.faculty ? (r.faculty.full_time_or_part_time === 'full_time' ? 'Full Time' : 'Part Time') : ''
      case 'time': return r.startMinutes < 0 ? Number.MAX_SAFE_INTEGER : (weekdayOrder(r.dayLabel, weekdayMap) * 100000 + r.startMinutes)
      case 'room': return r.room?.display_label ?? ''
      default: return 0
    }
  }

  const filteredRows = rows.filter(r => {
    const f = columnFilters
    if (f.code && !`${r.course.dept_code} ${r.course.course_number}`.toLowerCase().includes(f.code.toLowerCase())) return false
    if (f.title && !r.course.course_name.toLowerCase().includes(f.title.toLowerCase())) return false
    if (f.section && !String(r.entry.section).includes(f.section)) return false
    if (f.instructor) {
      const name = r.faculty ? `${r.faculty.last_name}, ${r.faculty.first_name}` : 'No instructor'
      if (!name.toLowerCase().includes(f.instructor.toLowerCase())) return false
    }
    if (f.fulltime) {
      const label = r.faculty ? (r.faculty.full_time_or_part_time === 'full_time' ? 'Full Time' : 'Part Time') : ''
      if (!label.toLowerCase().includes(f.fulltime.toLowerCase())) return false
    }
    if (f.time && !r.timeLabel.toLowerCase().includes(f.time.toLowerCase())) return false
    if (f.room) {
      const roomName = r.room?.display_label ?? 'Not scheduled'
      if (!roomName.toLowerCase().includes(f.room.toLowerCase())) return false
    }
    return true
  })

  const sortedRows = sort
    ? [...filteredRows].sort((a, b) => compareValues(sortKeyValue(a, sort.key), sortKeyValue(b, sort.key), sort.dir))
    : filteredRows

  const setColumnFilter = (key: keyof typeof EMPTY_COLUMN_FILTERS, value: string) =>
    setColumnFilters(f => ({ ...f, [key]: value }))

  return (
    <div>
      <div className="page-header">
        <h1>Term Course List</h1>
        {selectedTermId && sortedRows.length > 0 && (
          <button
            className="btn-primary btn-sm"
            onClick={() => window.open(courseListExportUrl(selectedTermId, sortedRows.map(r => r.entry.id)), '_blank')}
          >
            Export
          </button>
        )}
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ margin: '16px 0' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Term</div>
          <SearchableSelect
            options={terms.map(t => ({ id: t.id, label: termLabel(t) }))}
            selectedId={selectedTermId}
            onSelect={id => { setSelectedTermId(id); setColumnFilters(EMPTY_COLUMN_FILTERS) }}
            placeholder="Select term..."
            searchPlaceholder="Search terms..."
          />
        </div>

        {!selectedTerm ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Select a term.</div>
        ) : rows.length === 0 ? (
          <div className="empty-state"><div className="icon">📋</div>No courses in this term yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <SortableTh label="Course Code" sortKey="code" sort={sort} onSort={k => setSort(s => nextSort(s, k))}
                  filterValue={columnFilters.code} onFilterChange={v => setColumnFilter('code', v)} filterPlaceholder="e.g. ANGD 3371" />
                <SortableTh label="Title" sortKey="title" sort={sort} onSort={k => setSort(s => nextSort(s, k))}
                  filterValue={columnFilters.title} onFilterChange={v => setColumnFilter('title', v)} filterPlaceholder="Filter title..." />
                <SortableTh label="Sec" sortKey="section" sort={sort} onSort={k => setSort(s => nextSort(s, k))}
                  filterValue={columnFilters.section} onFilterChange={v => setColumnFilter('section', v)} filterPlaceholder="#" />
                <SortableTh label="Instructor" sortKey="instructor" sort={sort} onSort={k => setSort(s => nextSort(s, k))}
                  filterValue={columnFilters.instructor} onFilterChange={v => setColumnFilter('instructor', v)} filterPlaceholder="Filter instructor..." />
                <SortableTh label="Full-Time/Part-Time" sortKey="fulltime" sort={sort} onSort={k => setSort(s => nextSort(s, k))}
                  filterValue={columnFilters.fulltime} onFilterChange={v => setColumnFilter('fulltime', v)} filterPlaceholder="Full/Part..." />
                <SortableTh label="Time" sortKey="time" sort={sort} onSort={k => setSort(s => nextSort(s, k))}
                  filterValue={columnFilters.time} onFilterChange={v => setColumnFilter('time', v)} filterPlaceholder="e.g. Mon" />
                <SortableTh label="Room" sortKey="room" sort={sort} onSort={k => setSort(s => nextSort(s, k))}
                  filterValue={columnFilters.room} onFilterChange={v => setColumnFilter('room', v)} filterPlaceholder="Filter room..." />
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 16 }}>No courses match the current filters.</td></tr>
              ) : sortedRows.map(r => (
                <tr key={r.entry.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>
                    {r.course.dept_code} {r.course.course_number}
                  </td>
                  <td style={{ color: 'var(--text-bright)' }}>{r.course.course_name}</td>
                  <td>{r.entry.section}</td>
                  <td>{r.faculty ? `${r.faculty.last_name}, ${r.faculty.first_name}` : 'No instructor'}</td>
                  <td>{r.faculty ? (r.faculty.full_time_or_part_time === 'full_time' ? 'Full Time' : 'Part Time') : '—'}</td>
                  <td style={{ color: r.startMinutes < 0 ? 'var(--text-secondary)' : undefined }}>{r.timeLabel}</td>
                  <td>{r.room?.display_label ?? 'Not scheduled'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function weekdayOrder(dayLabel: string, weekdayMap: Map<number, Weekday>): number {
  if (!dayLabel) return 0
  const firstAbbr = dayLabel.split('/')[0]
  const found = [...weekdayMap.values()].find(w => (DAY_ABBR[w.name] ?? w.name) === firstAbbr)
  return found?.display_order ?? 0
}
