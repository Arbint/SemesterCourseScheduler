import { useState, useEffect, useRef } from 'react'
import { DndContext, type DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import {
  termsApi, tablesApi, entriesApi, coursesApi, roomsApi, timeSlotsApi,
  weekdaysApi, semestersApi, facultyApi, chatApi,
  type Term, type ScheduleTable, type ScheduleEntry, type Course,
  type Room, type TimeSlot, type Weekday, type Semester, type Faculty
} from '../api'
import { showToast } from '../components/Toast'
import { FormModal } from '../components/FormModal'

const PASTEL = [
  '#4a3060', '#2e4a35', '#2e3a4a', '#4a3a25', '#3a2e4a',
  '#254a3a', '#4a2a2e', '#253a4a', '#4a4225', '#2e4a44',
  '#4a2e3a', '#354a25'
]

function facultyColor(facultyId: number | null): string {
  if (facultyId === null) return 'var(--bg-elevated)'
  return PASTEL[facultyId % PASTEL.length]
}

// --- Draggable Course Card (from Course List) ---
function DraggableCourseCard({
  course, entries, neededSections, onSectionChange, highlighted
}: {
  course: Course
  entries: ScheduleEntry[]
  neededSections: number
  onSectionChange: (count: number) => void
  highlighted: boolean
}) {
  const scheduled = entries.filter(e => e.schedule_table_id !== null)
  const border = scheduled.length === 0
    ? '2px solid var(--error)'
    : scheduled.length < neededSections
    ? '2px solid var(--warning)'
    : highlighted
    ? '2px solid var(--accent)'
    : '1px solid var(--border-color)'

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `course-${course.id}`,
    data: { type: 'course', course_id: course.id }
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        background: 'var(--bg-surface)',
        border,
        borderRadius: 'var(--border-radius)',
        padding: '10px 12px',
        marginBottom: 8,
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        boxShadow: highlighted ? '0 0 8px var(--accent)' : undefined,
        userSelect: 'none'
      }}
    >
      <div style={{ fontFamily: 'monospace', color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>
        {course.dept_code} {course.course_number}
      </div>
      <div style={{ color: 'var(--text-bright)', fontSize: 13, marginTop: 2 }}>{course.course_name}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 4 }}>Capacity: {course.capacity}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Sections needed:</span>
        <input
          type="number"
          min={1}
          max={10}
          value={neededSections}
          onClick={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          onChange={e => onSectionChange(+e.target.value)}
          style={{ width: 50, padding: '2px 6px', fontSize: 12 }}
        />
        <span style={{ fontSize: 11, color: scheduled.length === 0 ? 'var(--error)' : scheduled.length < neededSections ? 'var(--warning)' : 'var(--success)' }}>
          {scheduled.length}/{neededSections} scheduled
        </span>
      </div>
    </div>
  )
}

// --- Scheduled Section Card (inside table cell) ---
function ScheduledSectionCard({
  entry, course, allFaculty, onFacultyChange, onDelete
}: {
  entry: ScheduleEntry
  course: Course
  faculty?: Faculty | null
  allFaculty: Faculty[]
  onFacultyChange: (fid: number | null) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `entry-${entry.id}`,
    data: { type: 'entry', entry_id: entry.id }
  })

  const bg = facultyColor(entry.faculty_id)

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        background: bg,
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 'var(--border-radius)',
        padding: '6px 8px',
        fontSize: 11,
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        userSelect: 'none',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div style={{ fontWeight: 600, color: '#ddd' }}>{course.dept_code} {course.course_number} §{entry.section}</div>
      <div style={{ color: '#bbb', marginTop: 2, fontSize: 10 }}>{course.course_name}</div>
      <div onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ marginTop: 4 }}>
        <select
          value={entry.faculty_id ?? ''}
          onChange={e => onFacultyChange(e.target.value ? +e.target.value : null)}
          style={{ width: '100%', fontSize: 10, padding: '2px 4px', background: 'rgba(0,0,0,0.3)', color: '#ddd', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <option value="">No instructor</option>
          {allFaculty.map(f => (
            <option key={f.id} value={f.id}>{f.last_name}, {f.first_name}</option>
          ))}
        </select>
      </div>
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onDelete() }}
        style={{
          position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.4)',
          color: '#ff8080', border: 'none', borderRadius: 3, padding: '0 4px',
          fontSize: 11, cursor: 'pointer', lineHeight: '16px'
        }}
      >×</button>
    </div>
  )
}

// --- Drop Cell ---
function TableCell({
  tableId, timeSlotId, roomId, entries, courses, allFaculty,
  onFacultyChange, onDeleteEntry
}: {
  tableId: number
  timeSlotId: number
  roomId: number
  entries: ScheduleEntry[]
  courses: Map<number, Course>
  allFaculty: Faculty[]
  onFacultyChange: (entryId: number, fid: number | null) => void
  onDeleteEntry: (entryId: number) => void
}) {
  const dropId = `cell-${tableId}-${timeSlotId}-${roomId}`
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { type: 'cell', table_id: tableId, time_slot_id: timeSlotId, room_id: roomId }
  })

  const cellEntries = entries.filter(e =>
    e.schedule_table_id === tableId &&
    e.room_id === roomId &&
    e.time_slot_ids.includes(timeSlotId)
  )

  return (
    <td
      ref={setNodeRef}
      style={{
        border: '1px solid var(--border-color)',
        padding: 4,
        verticalAlign: 'top',
        minWidth: 130,
        background: isOver ? 'rgba(97,175,239,0.1)' : undefined,
        transition: 'background 0.1s',
      }}
    >
      {cellEntries.map(e => {
        const course = courses.get(e.course_id)
        if (!course) return null
        return (
          <ScheduledSectionCard
            key={e.id}
            entry={e}
            course={course}
            allFaculty={allFaculty}
            onFacultyChange={fid => onFacultyChange(e.id, fid)}
            onDelete={() => onDeleteEntry(e.id)}
          />
        )
      })}
    </td>
  )
}

// --- Schedule Table Component ---
function ScheduleTableView({
  table, weekdays, timeSlots, rooms, entries, courses, allFaculty,
  onWeekdaysChange, onDeleteTable, onFacultyChange, onDeleteEntry
}: {
  table: ScheduleTable
  weekdays: Weekday[]
  timeSlots: TimeSlot[]
  rooms: Room[]
  entries: ScheduleEntry[]
  courses: Map<number, Course>
  allFaculty: Faculty[]
  onWeekdaysChange: (ids: number[]) => void
  onDeleteTable: () => void
  onFacultyChange: (entryId: number, fid: number | null) => void
  onDeleteEntry: (entryId: number) => void
}) {
  const selectedWeekdays = new Set(table.weekday_ids)
  const dayNames: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {weekdays.map(w => (
            <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={selectedWeekdays.has(w.id)}
                onChange={e => {
                  const ids = e.target.checked
                    ? [...table.weekday_ids, w.id]
                    : table.weekday_ids.filter(id => id !== w.id)
                  onWeekdaysChange(ids)
                }}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span style={{ color: selectedWeekdays.has(w.id) ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 13 }}>
                {dayNames[w.name] ?? w.name}
              </span>
            </label>
          ))}
        </div>
        <button className="btn-danger btn-sm" onClick={onDeleteTable}>Delete Table</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 10px', textAlign: 'left', background: 'var(--bg-elevated)', fontSize: 11, border: '1px solid var(--border-color)', minWidth: 130 }}>Time Slot</th>
              {rooms.map(r => (
                <th key={r.id} style={{ padding: '6px 10px', textAlign: 'left', background: 'var(--bg-elevated)', fontSize: 11, border: '1px solid var(--border-color)', minWidth: 130 }}>
                  {r.label} <span style={{ color: 'var(--text-secondary)' }}>({r.capacity})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map(ts => (
              <tr key={ts.id}>
                <td style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-secondary)', border: '1px solid var(--border-color)', whiteSpace: 'nowrap', background: 'var(--bg-elevated)' }}>
                  {ts.label}
                </td>
                {rooms.map(r => (
                  <TableCell
                    key={r.id}
                    tableId={table.id}
                    timeSlotId={ts.id}
                    roomId={r.id}
                    entries={entries}
                    courses={courses}
                    allFaculty={allFaculty}
                    onFacultyChange={onFacultyChange}
                    onDeleteEntry={onDeleteEntry}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// --- AI Chat Panel ---
function AIChatPanel({
  termId, onHighlight, onProposalApproved
}: {
  termId: number
  highlightedIds?: number[]
  onHighlight: (ids: number[]) => void
  onProposalApproved: () => void
}) {
  const sessionId = useRef(Math.random().toString(36).slice(2))
  const [messages, setMessages] = useState<{ role: 'user' | 'agent'; text: string; proposal?: any }[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    if (!input.trim() || sending) return
    const msg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', text: msg }])
    setSending(true)
    try {
      const res = await chatApi.send(termId, msg, sessionId.current)
      setMessages(m => [...m, { role: 'agent', text: res.text, proposal: res.proposal }])
      if (res.highlighted_course_ids.length) onHighlight(res.highlighted_course_ids)
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Agent error')
    } finally {
      setSending(false)
    }
  }

  const approve = async (proposalId: string) => {
    try {
      await chatApi.approveProposal(proposalId)
      showToast('Changes applied!', 'success')
      onProposalApproved()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Apply failed')
    }
  }

  const reject = async (proposalId: string) => {
    await chatApi.rejectProposal(proposalId)
    setMessages(m => m.map(msg => msg.proposal?.proposal_id === proposalId ? { ...msg, proposal: null } : msg))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
            Ask the AI to audit or auto-schedule this term.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
              color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
              borderRadius: 'var(--border-radius)', padding: '8px 12px',
              maxWidth: '85%', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5
            }}>
              {m.text}
            </div>
            {m.proposal && (
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--warning)', borderRadius: 'var(--border-radius)', padding: 12, marginTop: 8, maxWidth: '85%' }}>
                <div style={{ color: 'var(--warning)', fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Proposed Changes</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{m.proposal.description}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>{m.proposal.changes?.length} change(s)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-primary btn-sm" onClick={() => approve(m.proposal.proposal_id)}>Approve</button>
                  <button className="btn-danger btn-sm" onClick={() => reject(m.proposal.proposal_id)}>Reject</button>
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ask the AI..."
          style={{ flex: 1 }}
          disabled={sending}
        />
        <button className="btn-primary" onClick={send} disabled={sending || !input.trim()}>
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}

// --- Main Term Schedules Tab ---
export function TermSchedulesTab() {
  const [terms, setTerms] = useState<Term[]>([])
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [weekdays, setWeekdays] = useState<Weekday[]>([])
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null)
  const [tables, setTables] = useState<ScheduleTable[]>([])
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [allFaculty, setAllFaculty] = useState<Faculty[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [highlightedIds, setHighlightedIds] = useState<number[]>([])
  const [neededSections, setNeededSections] = useState<Map<number, number>>(new Map())
  const [showNewTermModal, setShowNewTermModal] = useState(false)
  const [newTermForm, setNewTermForm] = useState({ semester_id: 0, year: new Date().getFullYear() })
  const [savingTerm, setSavingTerm] = useState(false)
  const courseMap = new Map(courses.map(c => [c.id, c]))

  const loadStatic = async () => {
    const [t, s, w, r, ts, f] = await Promise.all([
      termsApi.list(), semestersApi.list(), weekdaysApi.list(),
      roomsApi.list(), timeSlotsApi.list(), facultyApi.list()
    ])
    setTerms(t)
    setSemesters(s)
    setWeekdays(w)
    setRooms(r)
    setTimeSlots(ts)
    setAllFaculty(f)
    return { terms: t, semesters: s }
  }

  const loadTerm = async (termId: number, term?: Term) => {
    const termData = term ?? terms.find(t => t.id === termId)
    if (!termData) return

    const [tbs, ents, cs] = await Promise.all([
      tablesApi.list(termId),
      entriesApi.listByTerm(termId),
      coursesApi.list(termData.semester_name)
    ])
    setTables(tbs)
    setEntries(ents)
    setCourses(cs)

    // Init needed sections map
    const map = new Map<number, number>()
    for (const c of cs) {
      const courseEntries = ents.filter(e => e.course_id === c.id)
      map.set(c.id, Math.max(1, courseEntries.length))
    }
    setNeededSections(map)
  }

  useEffect(() => {
    loadStatic().then(({ terms: t }) => {
      if (t.length) {
        setSelectedTermId(t[0].id)
        loadTerm(t[0].id, t[0])
      }
    })
  }, [])

  const refresh = () => {
    if (selectedTermId) loadTerm(selectedTermId)
  }

  const handleTermChange = async (val: string) => {
    if (val === 'new') {
      setShowNewTermModal(true)
      return
    }
    const id = +val
    setSelectedTermId(id)
    const term = terms.find(t => t.id === id)
    setWarnings([])
    setHighlightedIds([])
    await loadTerm(id, term)
  }

  const createTerm = async () => {
    if (!newTermForm.semester_id) return
    setSavingTerm(true)
    try {
      const term = await termsApi.create(newTermForm)
      const updated = await termsApi.list()
      setTerms(updated)
      setSelectedTermId(term.id)
      setShowNewTermModal(false)
      await loadTerm(term.id, term)
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Create term failed')
    } finally { setSavingTerm(false) }
  }

  const addTable = async () => {
    if (!selectedTermId) return
    const table = await tablesApi.create(selectedTermId, [])
    setTables(prev => [...prev, table])
  }

  const updateTableWeekdays = async (tableId: number, weekdayIds: number[]) => {
    const prevTables = tables
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, weekday_ids: weekdayIds } : t))
    try {
      const updated = await tablesApi.update(tableId, weekdayIds)
      setTables(prev => prev.map(t => t.id === tableId ? updated : t))
    } catch (e: any) {
      setTables(prevTables)
      showToast(e.response?.data?.detail || 'Failed to update weekdays')
    }
  }

  const deleteTable = async (tableId: number) => {
    if (!confirm('Delete this table?')) return
    await tablesApi.delete(tableId)
    setTables(prev => prev.filter(t => t.id !== tableId))
    setEntries(prev => prev.filter(e => e.schedule_table_id !== tableId))
  }

  const handleFacultyChange = async (entryId: number, facultyId: number | null) => {
    try {
      const { entry: updated, warnings } = await entriesApi.patchFaculty(entryId, facultyId)
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, faculty_id: updated.faculty_id } : e))
      if (warnings.length) setWarnings(warnings)
    } catch (e: any) {
      const detail = e.response?.data?.detail
      if (Array.isArray(detail)) {
        showToast(detail.map((d: any) => d.description).join('; '))
      } else {
        showToast(detail || 'Failed to assign instructor')
      }
    }
  }

  const handleDeleteEntry = async (entryId: number) => {
    await entriesApi.delete(entryId)
    setEntries(prev => prev.filter(e => e.id !== entryId))
  }

  const handleSectionChange = async (courseId: number, count: number) => {
    if (!selectedTermId) return
    setNeededSections(prev => new Map(prev).set(courseId, count))
    try {
      await entriesApi.patchSectionCount(selectedTermId, courseId, count)
      await loadTerm(selectedTermId)
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed')
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const activeData = active.data.current as any
    const overData = over.data.current as any

    if (!overData || overData.type !== 'cell') return

    const { table_id, time_slot_id, room_id } = overData
    const course = courseMap.get(activeData?.course_id)
    if (!course && activeData?.type === 'course') return

    try {
      if (activeData?.type === 'course') {
        // Determine how many time slots this course needs
        const slotsNeeded = Math.max(1, Math.round(course!.duration_minutes / 75))
        const sortedSlots = [...timeSlots].sort((a, b) => a.display_order - b.display_order)
        const startIdx = sortedSlots.findIndex(ts => ts.id === time_slot_id)
        if (startIdx === -1) return
        const slotIds = sortedSlots.slice(startIdx, startIdx + slotsNeeded).map(ts => ts.id)

        const result = await entriesApi.create(table_id, {
          course_id: activeData.course_id,
          room_id,
          time_slot_ids: slotIds,
        })
        setEntries(prev => [...prev.filter(e => e.id !== result.entry.id), result.entry])
        if (result.warnings.length) setWarnings(result.warnings)
      } else if (activeData?.type === 'entry') {
        const entryId = activeData.entry_id
        const existing = entries.find(e => e.id === entryId)
        if (!existing) return

        const slotsNeeded = existing.time_slot_ids.length || 1
        const sortedSlots = [...timeSlots].sort((a, b) => a.display_order - b.display_order)
        const startIdx = sortedSlots.findIndex(ts => ts.id === time_slot_id)
        if (startIdx === -1) return
        const slotIds = sortedSlots.slice(startIdx, startIdx + slotsNeeded).map(ts => ts.id)

        const result = await entriesApi.update(entryId, {
          schedule_table_id: table_id,
          room_id,
          time_slot_ids: slotIds,
        })
        setEntries(prev => prev.map(e => e.id === entryId ? result.entry : e))
        if (result.warnings.length) setWarnings(result.warnings)
      }
    } catch (e: any) {
      const detail = e.response?.data?.detail
      if (Array.isArray(detail)) {
        showToast(detail.map((d: any) => d.description).join('; '))
      } else {
        showToast(detail || 'Drop failed')
      }
    }
  }

  const selectedTerm = terms.find(t => t.id === selectedTermId)

  const termCourses = courses.filter(c => {
    const sem = semesters.find(s => s.name === selectedTerm?.semester_name)
    return sem ? c.semester_ids.includes(sem.id) : true
  })

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 44px)' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
          <select
            value={selectedTermId ?? ''}
            onChange={e => handleTermChange(e.target.value)}
            style={{ minWidth: 160 }}
          >
            <option value="" disabled>Select term...</option>
            {terms.map(t => (
              <option key={t.id} value={t.id}>{t.semester_name.charAt(0).toUpperCase() + t.semester_name.slice(1)} {t.year}</option>
            ))}
            <option value="new">+ New Term</option>
          </select>
          {selectedTermId && (
            <button
              className="btn-secondary"
              onClick={() => window.open(`/api/terms/${selectedTermId}/export`, '_blank')}
            >
              Export
            </button>
          )}
        </div>

        {/* Main area: 4 columns */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Course List */}
          <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border-color)', overflowY: 'auto', padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Course List</div>
            {termCourses.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>No courses for this semester.</div>
            )}
            {termCourses.map(c => (
              <DraggableCourseCard
                key={c.id}
                course={c}
                entries={entries.filter(e => e.course_id === c.id)}
                neededSections={neededSections.get(c.id) ?? 1}
                onSectionChange={count => handleSectionChange(c.id, count)}
                highlighted={highlightedIds.includes(c.id)}
              />
            ))}
          </div>

          {/* Tables List */}
          <div style={{ flex: 3, overflowY: 'auto', padding: 16, borderRight: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Schedule Tables</div>
            {tables.map(table => (
              <ScheduleTableView
                key={table.id}
                table={table}
                weekdays={weekdays}
                timeSlots={timeSlots}
                rooms={rooms}
                entries={entries}
                courses={courseMap}
                allFaculty={allFaculty}
                onWeekdaysChange={ids => updateTableWeekdays(table.id, ids)}
                onDeleteTable={() => deleteTable(table.id)}
                onFacultyChange={handleFacultyChange}
                onDeleteEntry={handleDeleteEntry}
              />
            ))}
            {selectedTermId && (
              <button
                className="btn-secondary"
                style={{ width: '100%', padding: '12px', fontSize: 20, borderStyle: 'dashed' }}
                onClick={addTable}
              >
                + Add Table
              </button>
            )}
          </div>

          {/* Warning List */}
          <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border-color)', overflowY: 'auto', padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Warnings</div>
            {warnings.length === 0 ? (
              <div style={{ color: 'var(--success)', fontSize: 12 }}>No warnings</div>
            ) : warnings.map((w, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--warning)', borderRadius: 'var(--border-radius)', padding: '8px 10px', marginBottom: 8, fontSize: 11, color: 'var(--warning)' }}>
                {w}
              </div>
            ))}
          </div>

          {/* AI Audit */}
          <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 8px', borderBottom: '1px solid var(--border-color)' }}>AI Audit</div>
            {selectedTermId ? (
              <AIChatPanel
                termId={selectedTermId}
                highlightedIds={highlightedIds}
                onHighlight={setHighlightedIds}
                onProposalApproved={() => { refresh(); setWarnings([]) }}
              />
            ) : (
              <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 12 }}>Select a term to use AI audit.</div>
            )}
          </div>
        </div>
      </div>

      {showNewTermModal && (
        <FormModal title="Create New Term" onClose={() => setShowNewTermModal(false)} onSave={createTerm} saving={savingTerm}>
          <div className="form-group">
            <label>Semester</label>
            <select value={newTermForm.semester_id || ''} onChange={e => setNewTermForm(f => ({ ...f, semester_id: +e.target.value }))}>
              <option value="">Select semester...</option>
              {semesters.map(s => <option key={s.id} value={s.id}>{s.name.charAt(0).toUpperCase() + s.name.slice(1)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Year</label>
            <input type="number" value={newTermForm.year} onChange={e => setNewTermForm(f => ({ ...f, year: +e.target.value }))} />
          </div>
        </FormModal>
      )}
    </DndContext>
  )
}
