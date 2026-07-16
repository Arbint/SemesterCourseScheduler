import { useState, useEffect } from 'react'
import {
  termsApi, roomsApi, weekdaysApi, timeSlotsApi, tablesApi, entriesApi, coursesApi, facultyApi,
  termLabel,
  type Term, type Room, type Weekday, type TimeSlot, type ScheduleTable, type ScheduleEntry,
  type Course, type Faculty,
} from '../api'
import { SearchableSelect } from '../components/SearchableSelect'

const DEFAULT_EMPTY_LABEL = 'OPEN'

type CellData = { entry: ScheduleEntry; course: Course; faculty: Faculty | null; span: number }

export function DoorTagsTab() {
  const [terms, setTerms] = useState<Term[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [allFaculty, setAllFaculty] = useState<Faculty[]>([])

  const [selectedTermId, setSelectedTermId] = useState<number | null>(null)
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null)
  const [emptyLabel, setEmptyLabel] = useState(DEFAULT_EMPTY_LABEL)

  const [tables, setTables] = useState<ScheduleTable[]>([])
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [courses, setCourses] = useState<Course[]>([])

  useEffect(() => {
    Promise.all([
      termsApi.list(), roomsApi.list(), weekdaysApi.list(), timeSlotsApi.list(), facultyApi.list(),
    ]).then(([t, r, w, ts, f]) => {
      setTerms(t)
      setRooms(r)
      setWeekdays(w)
      setTimeSlots(ts)
      setAllFaculty(f)
      if (t.length) setSelectedTermId(t[0].id)
      if (r.length) setSelectedRoomId(r[0].id)
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

  const courseMap = new Map(courses.map(c => [c.id, c]))
  const facultyMap = new Map(allFaculty.map(f => [f.id, f]))

  const sortedWeekdays = [...weekdays].sort((a, b) => a.display_order - b.display_order)
  const sortedTimeSlots = [...timeSlots].sort((a, b) => a.display_order - b.display_order)
  const slotOrder = new Map(sortedTimeSlots.map((ts, i) => [ts.id, i]))

  // grid[weekdayId][slotIndex] = CellData | 'covered' | null — mirrors the
  // rowSpan handling used by the Term Schedules / View tab grids, projected
  // by weekday instead of by room since this view is scoped to one room.
  const grid = new Map<number, (CellData | 'covered' | null)[]>()
  for (const w of sortedWeekdays) grid.set(w.id, new Array(sortedTimeSlots.length).fill(null))

  if (selectedRoomId) {
    for (const table of tables) {
      for (const entry of entries) {
        if (entry.schedule_table_id !== table.id || entry.room_id !== selectedRoomId) continue
        const course = courseMap.get(entry.course_id)
        if (!course || entry.time_slot_ids.length === 0) continue
        const slotIds = [...entry.time_slot_ids].sort((a, b) => (slotOrder.get(a) ?? 0) - (slotOrder.get(b) ?? 0))
        const startIdx = slotOrder.get(slotIds[0])
        if (startIdx === undefined) continue
        const span = slotIds.length
        const faculty = entry.faculty_id !== null ? facultyMap.get(entry.faculty_id) ?? null : null
        for (const wid of table.weekday_ids) {
          const col = grid.get(wid)
          if (!col) continue
          col[startIdx] = { entry, course, faculty, span }
          for (let i = startIdx + 1; i < startIdx + span && i < col.length; i++) col[i] = 'covered'
        }
      }
    }
  }

  const selectedTerm = terms.find(t => t.id === selectedTermId)
  const selectedRoom = rooms.find(r => r.id === selectedRoomId)

  const exportPdf = () => {
    if (!selectedTermId || !selectedRoomId) return
    const params = new URLSearchParams({
      term_id: String(selectedTermId),
      room_id: String(selectedRoomId),
      empty_label: emptyLabel || DEFAULT_EMPTY_LABEL,
    })
    window.open(`/api/door-tags/pdf?${params.toString()}`, '_blank')
  }

  return (
    <div>
      <div className="page-header">
        <h1>Door Tags</h1>
      </div>
      <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
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
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Room</div>
          <SearchableSelect
            options={rooms.map(r => ({ id: r.id, label: r.display_label }))}
            selectedId={selectedRoomId}
            onSelect={setSelectedRoomId}
            placeholder="Select room..."
            searchPlaceholder="Search rooms..."
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Empty Slot Label</div>
          <input
            value={emptyLabel}
            onChange={e => setEmptyLabel(e.target.value)}
            placeholder={DEFAULT_EMPTY_LABEL}
            style={{ padding: '5px 10px', fontSize: 13, width: 160 }}
          />
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button className="btn-primary" onClick={exportPdf} disabled={!selectedTermId || !selectedRoomId}>
            Export
          </button>
        </div>
      </div>

      {!selectedRoom || !selectedTerm ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Select a term and room.</div>
      ) : (
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-bright)', marginBottom: 2 }}>
            {selectedRoom.display_label}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            {termLabel(selectedTerm)} Schedule
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 10px', textAlign: 'left', background: 'var(--bg-elevated)', fontSize: 11, border: '1px solid var(--border-color)', minWidth: 120 }}>Time Slot</th>
                  {sortedWeekdays.map(w => (
                    <th key={w.id} style={{ padding: '6px 10px', textAlign: 'center', background: 'var(--bg-elevated)', fontSize: 11, border: '1px solid var(--border-color)', minWidth: 150 }}>
                      {w.name.charAt(0).toUpperCase() + w.name.slice(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTimeSlots.map((ts, r) => (
                  <tr key={ts.id}>
                    <td style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-secondary)', border: '1px solid var(--border-color)', whiteSpace: 'nowrap', background: 'var(--bg-elevated)' }}>
                      {ts.label}
                    </td>
                    {sortedWeekdays.map(w => {
                      const cell = grid.get(w.id)?.[r] ?? null
                      if (cell === 'covered') return null
                      if (cell === null) {
                        return (
                          <td key={w.id} style={{ padding: '8px 10px', border: '1px solid var(--border-color)', textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', opacity: 0.6 }}>
                            {emptyLabel || DEFAULT_EMPTY_LABEL}
                          </td>
                        )
                      }
                      const rowSpan = cell.span
                      return (
                        <td key={w.id} rowSpan={rowSpan} style={{ padding: '8px 10px', border: '1px solid var(--border-color)', textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-bright)' }}>
                            {cell.course.dept_code} {cell.course.course_number} §{cell.entry.section}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 2 }}>{cell.course.course_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                            {cell.faculty ? `${cell.faculty.last_name}, ${cell.faculty.first_name}` : 'No instructor'}
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
      )}
      </div>
    </div>
  )
}
