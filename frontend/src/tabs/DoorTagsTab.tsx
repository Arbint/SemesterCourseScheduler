import { useState, useEffect, useRef } from 'react'
import {
  termsApi, roomsApi, weekdaysApi, timeSlotsApi, tablesApi, entriesApi, coursesApi, facultyApi, meetingsApi,
  termLabel, doorTagSettingsApi, doorTagPdfUrl, DEFAULT_PRINT_CONFIG,
  type Term, type Room, type Weekday, type TimeSlot, type ScheduleTable, type ScheduleEntry,
  type Course, type Faculty, type Meeting, type DoorTagSettings, type PrintConfig,
} from '../api'
import { SearchableSelect } from '../components/SearchableSelect'
import { courseColor, MEETING_SOLID_COLOR } from '../components/ScheduleGrid'
import { PrintConfigPanel } from '../components/PrintConfigPanel'
import { showToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'

const DEFAULT_DEPARTMENT_EMPTY_LABEL = 'OPEN'
const DEFAULT_SHARED_EMPTY_LABEL = 'OPEN'

type CellData = { entry: ScheduleEntry; course: Course | null; meeting: Meeting | null; faculty: Faculty | null; span: number }
type EmptyRun = { emptySpan: number }
type GridCell = CellData | EmptyRun | 'covered'

// Collapses consecutive empty (null) cells in a weekday column into one
// merged block: the first cell becomes an EmptyRun with the run's length,
// the rest become 'covered' — mirrors the backend door tag PDF's
// _merge_empty_runs so on-screen and exported tables read the same way.
function mergeEmptyRuns(column: (CellData | 'covered' | null)[]): GridCell[] {
  const result: GridCell[] = new Array(column.length)
  let i = 0
  while (i < column.length) {
    if (column[i] === null) {
      let j = i
      while (j < column.length && column[j] === null) j++
      result[i] = { emptySpan: j - i }
      for (let k = i + 1; k < j; k++) result[k] = 'covered'
      i = j
    } else {
      result[i] = column[i] as GridCell
      i++
    }
  }
  return result
}

interface RoomFilter {
  id: string
  value: string
  negated: boolean
}

function roomMatchesValue(room: Room, value: string): boolean {
  return room.display_label.toLowerCase().includes(value.toLowerCase())
}

function roomVisible(room: Room, filters: RoomFilter[]): boolean {
  const positive = filters.filter(f => !f.negated)
  const negative = filters.filter(f => f.negated)
  if (negative.some(f => roomMatchesValue(room, f.value))) return false
  if (positive.length > 0 && !positive.some(f => roomMatchesValue(room, f.value))) return false
  return true
}

// Filter bar for the Room Schedule tab — same chip/NOT-toggle interaction as
// the Term Schedules FilterBar, but scoped to filtering which room tables
// are shown rather than dimming entries within one table. Room Number is
// the only filter type this currently supports.
function RoomFilterBar({ filters, onAdd, onRemove, onToggleNot }: {
  filters: RoomFilter[]
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
          <span style={{ color: 'var(--text-secondary)', fontSize: 10, marginLeft: 3 }}>room:</span>
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
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Room Number</div>
            <input
              autoFocus
              placeholder="e.g. JB 123"
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

export function DoorTagsTab() {
  const { isLoggedIn } = useAuth()
  const [terms, setTerms] = useState<Term[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [allFaculty, setAllFaculty] = useState<Faculty[]>([])

  const [selectedTermId, setSelectedTermId] = useState<number | null>(null)
  // Persisted server-side (feedback_60) — shared across all terms/users, not
  // local browser state, and only editable while logged in.
  const [savedLabels, setSavedLabels] = useState<DoorTagSettings>({
    department_empty_label: DEFAULT_DEPARTMENT_EMPTY_LABEL, shared_empty_label: DEFAULT_SHARED_EMPTY_LABEL,
  })
  const [labelForm, setLabelForm] = useState<DoorTagSettings>(savedLabels)
  const [savingLabels, setSavingLabels] = useState(false)
  const [roomFilters, setRoomFilters] = useState<RoomFilter[]>([])
  const [deptOwnedOnly, setDeptOwnedOnly] = useState(true)
  const [printConfig, setPrintConfig] = useState<PrintConfig>(DEFAULT_PRINT_CONFIG)

  const [tables, setTables] = useState<ScheduleTable[]>([])
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])

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
    })
    doorTagSettingsApi.get().then(s => { setSavedLabels(s); setLabelForm(s) })
  }, [])

  const labelsDirty = labelForm.department_empty_label !== savedLabels.department_empty_label ||
    labelForm.shared_empty_label !== savedLabels.shared_empty_label

  const saveLabels = async () => {
    setSavingLabels(true)
    try {
      const updated = await doorTagSettingsApi.update(labelForm)
      setSavedLabels(updated)
      setLabelForm(updated)
      showToast('Empty slot labels saved', 'success')
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Save failed')
    } finally {
      setSavingLabels(false)
    }
  }

  useEffect(() => {
    if (!selectedTermId) { setTables([]); setEntries([]); setCourses([]); setMeetings([]); return }
    const term = terms.find(t => t.id === selectedTermId)
    if (!term) return
    Promise.all([
      tablesApi.list(selectedTermId),
      entriesApi.listByTerm(selectedTermId),
      coursesApi.list(term.semester_name),
      meetingsApi.list(selectedTermId),
    ]).then(([tbs, ents, cs, mts]) => {
      setTables(tbs)
      setEntries(ents)
      setCourses(cs)
      setMeetings(mts)
    })
  }, [selectedTermId, terms])

  const courseMap = new Map(courses.map(c => [c.id, c]))
  const meetingMap = new Map(meetings.map(m => [m.id, m]))
  const facultyMap = new Map(allFaculty.map(f => [f.id, f]))

  const sortedWeekdays = [...weekdays].sort((a, b) => a.display_order - b.display_order)
  const sortedTimeSlots = [...timeSlots].sort((a, b) => a.display_order - b.display_order)
  const slotOrder = new Map(sortedTimeSlots.map((ts, i) => [ts.id, i]))

  // grid[weekdayId][slotIndex] = CellData | 'covered' | EmptyRun — mirrors the
  // rowSpan handling used by the Term Schedules / View tab grids, projected
  // by weekday instead of by room since each call here is scoped to one room.
  // Empty runs are merged (see mergeEmptyRuns) so a stretch of blank slots
  // renders as one spanning cell with a single label.
  const buildRoomGrid = (roomId: number): Map<number, GridCell[]> => {
    const grid = new Map<number, (CellData | 'covered' | null)[]>()
    for (const w of sortedWeekdays) grid.set(w.id, new Array(sortedTimeSlots.length).fill(null))

    for (const table of tables) {
      for (const entry of entries) {
        if (entry.schedule_table_id !== table.id || entry.room_id !== roomId) continue
        const course = entry.course_id != null ? courseMap.get(entry.course_id) ?? null : null
        const meeting = entry.meeting_id != null ? meetingMap.get(entry.meeting_id) ?? null : null
        if ((!course && !meeting) || entry.time_slot_ids.length === 0) continue
        const slotIds = [...entry.time_slot_ids].sort((a, b) => (slotOrder.get(a) ?? 0) - (slotOrder.get(b) ?? 0))
        const startIdx = slotOrder.get(slotIds[0])
        if (startIdx === undefined) continue
        const span = slotIds.length
        const faculty = entry.faculty_id !== null ? facultyMap.get(entry.faculty_id) ?? null : null
        for (const wid of table.weekday_ids) {
          const col = grid.get(wid)
          if (!col) continue
          col[startIdx] = { entry, course, meeting, faculty, span }
          for (let i = startIdx + 1; i < startIdx + span && i < col.length; i++) col[i] = 'covered'
        }
      }
    }

    const mergedGrid = new Map<number, GridCell[]>()
    for (const [wid, col] of grid) mergedGrid.set(wid, mergeEmptyRuns(col))
    return mergedGrid
  }

  const selectedTerm = terms.find(t => t.id === selectedTermId)

  const sortedRooms = [...rooms].sort((a, b) => a.display_label.localeCompare(b.display_label))
  const visibleRooms = sortedRooms.filter(r => roomVisible(r, roomFilters) && (!deptOwnedOnly || r.is_department_owned))

  const addRoomFilter = (value: string) => {
    setRoomFilters(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, value, negated: false }])
  }
  const removeRoomFilter = (id: string) => setRoomFilters(prev => prev.filter(f => f.id !== id))
  const toggleRoomFilterNot = (id: string) => setRoomFilters(prev => prev.map(f => f.id === id ? { ...f, negated: !f.negated } : f))

  // Shared by the per-room Export button and the Export Configuration
  // preview (feedback_66) so both build the exact same URL.
  const buildRoomPdfUrl = (roomId: number): string | null => {
    if (!selectedTermId) return null
    const room = rooms.find(r => r.id === roomId)
    const label = room?.is_department_owned
      ? (savedLabels.department_empty_label || DEFAULT_DEPARTMENT_EMPTY_LABEL)
      : (savedLabels.shared_empty_label || DEFAULT_SHARED_EMPTY_LABEL)
    return doorTagPdfUrl(selectedTermId, roomId, label, printConfig)
  }

  const exportPdf = (roomId: number) => {
    const url = buildRoomPdfUrl(roomId)
    if (url) window.open(url, '_blank')
  }

  return (
    <div>
      <div className="page-header">
        <h1>Room Schedule</h1>
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
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Department Owned Empty Slot Label</div>
            <input
              value={labelForm.department_empty_label}
              onChange={e => isLoggedIn && setLabelForm(f => ({ ...f, department_empty_label: e.target.value }))}
              placeholder={DEFAULT_DEPARTMENT_EMPTY_LABEL}
              disabled={!isLoggedIn}
              style={{ padding: '5px 10px', fontSize: 13, width: 200 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Shared Empty Slot Label</div>
            <input
              value={labelForm.shared_empty_label}
              onChange={e => isLoggedIn && setLabelForm(f => ({ ...f, shared_empty_label: e.target.value }))}
              placeholder={DEFAULT_SHARED_EMPTY_LABEL}
              disabled={!isLoggedIn}
              style={{ padding: '5px 10px', fontSize: 13, width: 200 }}
            />
          </div>
          {isLoggedIn && (
            <button
              className="btn-primary btn-sm"
              onClick={saveLabels}
              disabled={savingLabels || !labelsDirty}
              style={{ alignSelf: 'flex-end' }}
            >
              {savingLabels ? 'Saving...' : 'Save Labels'}
            </button>
          )}
        </div>

        <PrintConfigPanel
          config={printConfig}
          onChange={setPrintConfig}
          previewOptions={sortedRooms.map(r => ({ id: r.id, label: r.display_label }))}
          buildPreviewUrl={buildRoomPdfUrl}
          assetScope="room"
          presetScope="room"
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <RoomFilterBar
            filters={roomFilters}
            onAdd={addRoomFilter}
            onRemove={removeRoomFilter}
            onToggleNot={toggleRoomFilterNot}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 12, color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={deptOwnedOnly}
              onChange={e => setDeptOwnedOnly(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            Department owned only
          </label>
        </div>

        {!selectedTerm ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Select a term.</div>
        ) : visibleRooms.length === 0 ? (
          <div className="empty-state"><div className="icon">🏫</div>No rooms match the current filters.</div>
        ) : (
          visibleRooms.map(room => {
            const grid = buildRoomGrid(room.id)
            return (
              <div key={room.id} className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-bright)' }}>
                        {room.display_label}
                      </div>
                      <span style={{
                        fontSize: 11, padding: '1px 6px', borderRadius: 10,
                        color: room.is_department_owned ? 'var(--accent)' : 'var(--text-secondary)',
                        border: '1px solid var(--border-color)',
                      }}>
                        {room.is_department_owned ? 'Department' : 'Shared'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {termLabel(selectedTerm)} Schedule
                    </div>
                  </div>
                  <button className="btn-secondary btn-sm" onClick={() => exportPdf(room.id)}>Export</button>
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
                        <tr key={ts.id}>
                          <td style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-secondary)', border: '1px solid var(--border-color)', whiteSpace: 'nowrap', background: 'var(--bg-elevated)' }}>
                            {ts.label}
                          </td>
                          {sortedWeekdays.map(w => {
                            const cell = grid.get(w.id)?.[r] ?? null
                            if (cell === 'covered' || cell === null) return null
                            if ('emptySpan' in cell) {
                              const label = room.is_department_owned
                                ? (savedLabels.department_empty_label || DEFAULT_DEPARTMENT_EMPTY_LABEL)
                                : (savedLabels.shared_empty_label || DEFAULT_SHARED_EMPTY_LABEL)
                              return (
                                <td key={w.id} rowSpan={cell.emptySpan} style={{ padding: 4, border: '1px solid var(--border-color)' }}>
                                  <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', opacity: 0.6,
                                    minHeight: 26, boxSizing: 'border-box',
                                  }}>
                                    {label}
                                  </div>
                                </td>
                              )
                            }
                            const rowSpan = cell.span
                            const bg = cell.course ? courseColor(cell.course.id) : MEETING_SOLID_COLOR
                            return (
                              <td key={w.id} rowSpan={rowSpan} style={{ padding: 4, border: '1px solid var(--border-color)' }}>
                                <div style={{
                                  background: bg, borderRadius: 3,
                                  display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                                  textAlign: 'center', padding: '8px 10px', boxSizing: 'border-box', minHeight: 64,
                                }}>
                                  {cell.course ? (
                                    <>
                                      <div style={{ fontWeight: 700, fontSize: 13, color: '#eee' }}>
                                        {cell.course.dept_code} {cell.course.course_number} Sec {cell.entry.section}
                                      </div>
                                      <div style={{ fontSize: 12, color: '#ddd', marginTop: 2 }}>{cell.course.course_name}</div>
                                      <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>
                                        {cell.faculty ? `${cell.faculty.last_name}, ${cell.faculty.first_name}` : 'No instructor'}
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div style={{ fontWeight: 700, fontSize: 13, color: '#eee' }}>
                                        {cell.meeting?.name}
                                      </div>
                                      <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>Meeting</div>
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
    </div>
  )
}
