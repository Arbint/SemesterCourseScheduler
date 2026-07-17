import { useState, useEffect } from 'react'
import {
  termsApi, tablesApi, entriesApi, coursesApi, roomsApi, timeSlotsApi,
  weekdaysApi, termTaughtWithApi, facultyApi, meetingsApi,
  type Term, type ScheduleTable, type ScheduleEntry, type Course,
  type Room, type TimeSlot, type Weekday, type Faculty, type TermTaughtWithGroup, type Meeting,
} from '../api'
import { showToast } from '../components/Toast'
import { TermSelector } from '../components/TermSelector'
import { ScheduleTableView, DEFAULT_CELL_WIDTH, DEFAULT_CELL_HEIGHT } from '../components/ScheduleGrid'
import { FilterBar, entryMatchesFilters, type ActiveFilter } from '../components/FilterBar'

const noop = () => {}

const CELL_WIDTH_RANGE = { min: 60, max: 400 }
const CELL_HEIGHT_RANGE = { min: 40, max: 300 }
const FONT_SCALE_RANGE = { min: 0.3, max: 3 }

function SpinBox({ label, value, onChange, min, max, step = 1 }: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => {
          const raw = +e.target.value
          if (Number.isFinite(raw)) onChange(Math.max(min, Math.min(max, raw)))
        }}
        style={{ width: 64, padding: '3px 6px', fontSize: 12 }}
      />
    </label>
  )
}

function getTermIdFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get('term')
  const id = raw ? +raw : NaN
  return Number.isFinite(id) ? id : null
}

function getNumberParam(name: string, fallback: number, min: number, max: number): number {
  const raw = new URLSearchParams(window.location.search).get(name)
  const val = raw ? +raw : NaN
  return Number.isFinite(val) ? Math.max(min, Math.min(max, val)) : fallback
}

export function TermScheduleTab() {
  const [terms, setTerms] = useState<Term[]>([])
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null)
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [tables, setTables] = useState<ScheduleTable[]>([])
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [allFaculty, setAllFaculty] = useState<Faculty[]>([])
  const [termTaughtWith, setTermTaughtWith] = useState<TermTaughtWithGroup[]>([])
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([])
  const [cellWidth, setCellWidth] = useState(
    () => getNumberParam('cellWidth', DEFAULT_CELL_WIDTH, CELL_WIDTH_RANGE.min, CELL_WIDTH_RANGE.max)
  )
  const [cellHeight, setCellHeight] = useState(
    () => getNumberParam('cellHeight', DEFAULT_CELL_HEIGHT, CELL_HEIGHT_RANGE.min, CELL_HEIGHT_RANGE.max)
  )
  const [fontScale, setFontScale] = useState(
    () => getNumberParam('fontScale', 1, FONT_SCALE_RANGE.min, FONT_SCALE_RANGE.max)
  )

  const loadTerm = async (termId: number, term?: Term, allTerms?: Term[]) => {
    const termData = term ?? (allTerms ?? terms).find(t => t.id === termId)
    if (!termData) return
    const [tbs, ents, cs, ttw, mts] = await Promise.all([
      tablesApi.list(termId),
      entriesApi.listByTerm(termId),
      coursesApi.list(termData.semester_name),
      termTaughtWithApi.list(termId),
      meetingsApi.list(termId),
    ])
    setTables(tbs)
    setEntries(ents)
    setCourses(cs)
    setTermTaughtWith(ttw)
    setMeetings(mts)
  }

  useEffect(() => {
    Promise.all([
      termsApi.list(), weekdaysApi.list(), roomsApi.list(), timeSlotsApi.list(), facultyApi.list(),
    ]).then(async ([t, w, r, ts, f]) => {
      setTerms(t)
      setWeekdays(w)
      setRooms(r)
      setTimeSlots(ts)
      setAllFaculty(f)
      const urlTermId = getTermIdFromUrl()
      const initial = (urlTermId && t.find(term => term.id === urlTermId)) || t[0]
      if (initial) {
        setSelectedTermId(initial.id)
        await loadTerm(initial.id, initial, t)
      }
    })
  }, [])

  const handleTermChange = async (val: string) => {
    const id = +val
    setSelectedTermId(id)
    const term = terms.find(t => t.id === id)
    setTermTaughtWith([])
    await loadTerm(id, term)
  }

  const copyViewUrl = async () => {
    if (!selectedTermId) return
    const params = new URLSearchParams({
      tab: 'view',
      term: String(selectedTermId),
      cellWidth: String(cellWidth),
      cellHeight: String(cellHeight),
      fontScale: String(fontScale),
    })
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`
    try {
      await navigator.clipboard.writeText(url)
      showToast('View URL copied to clipboard', 'success')
    } catch {
      showToast('Could not copy URL — copy it manually: ' + url)
    }
  }

  const addFilter = (f: Omit<ActiveFilter, 'id'>) =>
    setActiveFilters(prev => [...prev, { ...f, id: Math.random().toString(36).slice(2) }])
  const removeFilter = (id: string) =>
    setActiveFilters(prev => prev.filter(f => f.id !== id))
  const toggleNot = (id: string) =>
    setActiveFilters(prev => prev.map(f => f.id === id ? { ...f, negated: !f.negated } : f))

  const courseMap = new Map(courses.map(c => [c.id, c]))
  const meetingMap = new Map(meetings.map(m => [m.id, m]))

  const effectivePartnerIds = new Map<number, number[]>()
  for (const c of courses) {
    const partners = [...c.taught_with_partner_ids]
    for (const g of termTaughtWith) {
      if (g.course_ids.includes(c.id)) {
        for (const pid of g.course_ids) {
          if (pid !== c.id && !partners.includes(pid)) partners.push(pid)
        }
      }
    }
    if (partners.length) effectivePartnerIds.set(c.id, partners)
  }

  const isEntryDimmed = (entry: ScheduleEntry): boolean =>
    entryMatchesFilters(entry, entry.course_id != null ? courseMap.get(entry.course_id) : undefined, tables.find(t => t.id === entry.schedule_table_id), activeFilters)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
        <TermSelector
          terms={terms}
          selectedTermId={selectedTermId}
          isLoggedIn={false}
          onSelect={handleTermChange}
          onDelete={noop}
          onNew={noop}
        />
        <SpinBox label="Cell Width" value={cellWidth} onChange={setCellWidth} {...CELL_WIDTH_RANGE} step={5} />
        <SpinBox label="Cell Height" value={cellHeight} onChange={setCellHeight} {...CELL_HEIGHT_RANGE} step={5} />
        <SpinBox label="Font Scale" value={fontScale} onChange={setFontScale} {...FONT_SCALE_RANGE} step={0.1} />
        {selectedTermId && (
          <button className="btn-secondary" onClick={copyViewUrl}>
            Get View URL
          </button>
        )}
      </div>

      <FilterBar
        filters={activeFilters}
        onAdd={addFilter}
        onRemove={removeFilter}
        onToggleNot={toggleNot}
        allFaculty={allFaculty}
        weekdays={weekdays}
        courses={courses}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {!selectedTermId && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No term selected.</div>
        )}
        {tables.map(table => (
          <ScheduleTableView
            key={table.id}
            table={table}
            weekdays={weekdays}
            timeSlots={timeSlots}
            rooms={rooms}
            entries={entries}
            courses={courseMap}
            meetings={meetingMap}
            effectivePartnerIds={effectivePartnerIds}
            allFaculty={allFaculty}
            isEntryDimmed={isEntryDimmed}
            isLoggedIn={false}
            forceHideUnused
            cellWidth={cellWidth}
            cellHeight={cellHeight}
            viewMode
            fontScale={fontScale}
            onWeekdaysChange={noop}
            onDeleteTable={noop}
            onFacultyChange={noop}
            onDeleteEntry={noop}
            onActiveWeekdaysChange={noop}
          />
        ))}
      </div>
    </div>
  )
}
