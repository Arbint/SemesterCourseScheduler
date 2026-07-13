import { useState, useEffect, useRef, Fragment } from 'react'
import { DndContext, type DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import {
  termsApi, tablesApi, entriesApi, coursesApi, roomsApi, timeSlotsApi,
  weekdaysApi, semestersApi, facultyApi, chatApi, termTaughtWithApi,
  type Term, type ScheduleTable, type ScheduleEntry, type Course,
  type Room, type TimeSlot, type Weekday, type Semester, type Faculty,
  type IssueItem, type TermTaughtWithGroup
} from '../api'
import { showToast } from '../components/Toast'
import { FormModal } from '../components/FormModal'
import { useAuth } from '../contexts/AuthContext'

const PASTEL = [
  '#4a3060', '#2e4a35', '#2e3a4a', '#4a3a25', '#3a2e4a',
  '#254a3a', '#4a2a2e', '#253a4a', '#4a4225', '#2e4a44',
  '#4a2e3a', '#354a25'
]

function facultyColor(facultyId: number | null): string {
  if (facultyId === null) return 'var(--bg-elevated)'
  return PASTEL[facultyId % PASTEL.length]
}

// --- Filter types ---
interface ActiveFilter {
  id: string
  type: 'faculty' | 'weekday' | 'course'
  value: number | string
  label: string
  negated: boolean
}

// --- Term Selector with per-item delete buttons ---
function TermSelector({
  terms, selectedTermId, isLoggedIn, onSelect, onDelete, onNew
}: {
  terms: Term[]
  selectedTermId: number | null
  isLoggedIn: boolean
  onSelect: (val: string) => void
  onDelete: (termId: number) => void
  onNew: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = terms.find(t => t.id === selectedTermId)
  const label = selected
    ? `${selected.semester_name.charAt(0).toUpperCase() + selected.semester_name.slice(1)} ${selected.year}`
    : 'Select term...'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ minWidth: 170, textAlign: 'left', padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}
      >
        {label} <span style={{ float: 'right', opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.35)', zIndex: 1000, minWidth: 200 }}>
          {terms.map(t => {
            const tLabel = `${t.semester_name.charAt(0).toUpperCase() + t.semester_name.slice(1)} ${t.year}`
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  onClick={() => { onSelect(String(t.id)); setOpen(false) }}
                  style={{ flex: 1, textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: t.id === selectedTermId ? 'var(--accent)' : 'var(--text-primary)', fontSize: 13 }}
                >
                  {tLabel}
                </button>
                {isLoggedIn && (
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(t.id); setOpen(false) }}
                    title="Delete term"
                    style={{ padding: '4px 8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1 }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
          {isLoggedIn && (
            <>
              <div style={{ borderTop: '1px solid var(--border-color)', margin: '2px 0' }} />
              <button
                onClick={() => { onNew(); setOpen(false) }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13 }}
              >
                + New Term
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// --- Draggable Course Card (from Course List) ---
function DraggableCourseCard({
  course, entries, neededSections, isLoggedIn, onSectionChange, highlighted, dimmed, taughtWithPartners
}: {
  course: Course
  entries: ScheduleEntry[]
  neededSections: number
  isLoggedIn: boolean
  onSectionChange: (count: number) => void
  highlighted: boolean
  dimmed: boolean
  taughtWithPartners: Course[]
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
    data: { type: 'course', course_id: course.id },
    disabled: !isLoggedIn,
  })

  return (
    <div
      ref={setNodeRef}
      {...(isLoggedIn ? listeners : {})}
      {...attributes}
      style={{
        background: 'var(--bg-surface)',
        border,
        borderRadius: 'var(--border-radius)',
        padding: '10px 12px',
        marginBottom: 8,
        cursor: isLoggedIn ? 'grab' : 'default',
        opacity: isDragging ? 0.5 : dimmed ? 0.25 : 1,
        boxShadow: highlighted ? '0 0 8px var(--accent)' : undefined,
        transition: 'opacity 0.15s',
        userSelect: 'none'
      }}
    >
      <div style={{ fontFamily: 'monospace', color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>
        {course.dept_code} {course.course_number}
      </div>
      <div style={{ color: 'var(--text-bright)', fontSize: 13, marginTop: 2 }}>{course.course_name}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 4 }}>Capacity: {course.capacity}</div>
      {taughtWithPartners.length > 0 && (
        <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          {taughtWithPartners.map(p => (
            <span key={p.id} style={{ fontSize: 10, background: 'rgba(97,175,239,0.15)', color: 'var(--accent)', border: '1px solid rgba(97,175,239,0.35)', borderRadius: 3, padding: '1px 5px' }}>
              TW: {p.dept_code} {p.course_number}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Sections needed:</span>
        <input
          type="number"
          min={1}
          max={10}
          value={neededSections}
          onClick={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          onChange={e => isLoggedIn && onSectionChange(+e.target.value)}
          disabled={!isLoggedIn}
          style={{ width: 50, padding: '2px 6px', fontSize: 12 }}
        />
        <span style={{ fontSize: 11, color: scheduled.length === 0 ? 'var(--error)' : scheduled.length < neededSections ? 'var(--warning)' : 'var(--success)' }}>
          {scheduled.length}/{neededSections} scheduled
        </span>
      </div>
    </div>
  )
}

const DAY_ABBR: Record<string, string> = { mon: 'M', tue: 'T', wed: 'W', thu: 'Th', fri: 'F' }

// --- Scheduled Section Card (inside table cell) ---
function ScheduledSectionCard({
  entry, course, allFaculty, tableWeekdays, dimmed, isLoggedIn, issueHighlightSeverity, onFacultyChange, onDelete, onActiveWeekdaysChange
}: {
  entry: ScheduleEntry
  course: Course
  faculty?: Faculty | null
  allFaculty: Faculty[]
  tableWeekdays: Weekday[]
  dimmed: boolean
  isLoggedIn: boolean
  issueHighlightSeverity?: 'error' | 'warning' | null
  onFacultyChange: (fid: number | null) => void
  onDelete: () => void
  onActiveWeekdaysChange: (ids: number[]) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `entry-${entry.id}`,
    data: { type: 'entry', entry_id: entry.id },
    disabled: !isLoggedIn,
  })

  const bg = facultyColor(entry.faculty_id)
  const showToggles = tableWeekdays.length > course.frequency

  const toggleDay = (dayId: number) => {
    const active = entry.active_weekday_ids.includes(dayId)
    const newIds = active
      ? entry.active_weekday_ids.filter(id => id !== dayId)
      : [...entry.active_weekday_ids, dayId]
    onActiveWeekdaysChange(newIds)
  }

  return (
    <div
      ref={setNodeRef}
      {...(isLoggedIn ? listeners : {})}
      {...attributes}
      style={{
        background: bg,
        border: issueHighlightSeverity === 'error'
          ? '2px solid var(--error)'
          : issueHighlightSeverity === 'warning'
          ? '2px solid var(--warning)'
          : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 'var(--border-radius)',
        padding: '6px 8px',
        fontSize: 11,
        cursor: isLoggedIn ? 'grab' : 'default',
        opacity: isDragging ? 0.4 : dimmed ? 0.25 : 1,
        userSelect: 'none',
        position: 'relative',
        transition: 'opacity 0.15s',
        overflow: 'hidden',
        height: '100%',
        boxSizing: 'border-box',
        boxShadow: issueHighlightSeverity === 'error'
          ? '0 0 8px var(--error)'
          : issueHighlightSeverity === 'warning'
          ? '0 0 8px var(--warning)'
          : undefined,
      }}
    >
      <div style={{ fontWeight: 600, color: '#ddd' }}>{course.dept_code} {course.course_number} §{entry.section}</div>
      <div style={{ color: '#bbb', marginTop: 2, fontSize: 10 }}>{course.course_name}</div>
      {showToggles && (
        <div
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{ display: 'flex', gap: 2, marginTop: 4 }}
        >
          {tableWeekdays.map(w => {
            const isActive = entry.active_weekday_ids.includes(w.id)
            return (
              <button
                key={w.id}
                onClick={() => isLoggedIn && toggleDay(w.id)}
                disabled={!isLoggedIn}
                style={{
                  padding: '1px 4px',
                  fontSize: 9,
                  fontWeight: 600,
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 3,
                  background: isActive ? 'rgba(97,175,239,0.5)' : 'rgba(0,0,0,0.35)',
                  color: isActive ? '#fff' : '#888',
                  cursor: isLoggedIn ? 'pointer' : 'default',
                  lineHeight: '14px',
                }}
              >
                {DAY_ABBR[w.name] ?? w.name}
              </button>
            )
          })}
        </div>
      )}
      <div onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ marginTop: 4 }}>
        <select
          value={entry.faculty_id ?? ''}
          onChange={e => isLoggedIn && onFacultyChange(e.target.value ? +e.target.value : null)}
          disabled={!isLoggedIn}
          style={{ width: '100%', fontSize: 10, padding: '2px 4px', background: 'rgba(0,0,0,0.3)', color: '#ddd', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <option value="">No instructor</option>
          {allFaculty.map(f => (
            <option key={f.id} value={f.id}>{f.last_name}, {f.first_name}</option>
          ))}
        </select>
      </div>
      {isLoggedIn && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.4)',
            color: '#ff8080', border: 'none', borderRadius: 3, padding: '0 4px',
            fontSize: 11, cursor: 'pointer', lineHeight: '16px'
          }}
        >×</button>
      )}
    </div>
  )
}

// --- Combined card for a TaughtWith pair in the same cell ---
function TaughtWithSectionCard({
  primaryEntry, partnerEntry, primaryCourse, partnerCourse,
  allFaculty, tableWeekdays, dimmed, isLoggedIn, issueHighlightSeverity,
  onFacultyChange, onDelete, onActiveWeekdaysChange
}: {
  primaryEntry: ScheduleEntry
  partnerEntry: ScheduleEntry
  primaryCourse: Course
  partnerCourse: Course
  allFaculty: Faculty[]
  tableWeekdays: Weekday[]
  dimmed: boolean
  isLoggedIn: boolean
  issueHighlightSeverity?: 'error' | 'warning' | null
  onFacultyChange: (fid: number | null) => void
  onDelete: () => void
  onActiveWeekdaysChange: (ids: number[]) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `entry-${primaryEntry.id}`,
    data: { type: 'entry', entry_id: primaryEntry.id },
    disabled: !isLoggedIn,
  })

  const bg = facultyColor(primaryEntry.faculty_id)
  const showToggles = tableWeekdays.length > primaryCourse.frequency

  const toggleDay = (dayId: number) => {
    const active = primaryEntry.active_weekday_ids.includes(dayId)
    const newIds = active
      ? primaryEntry.active_weekday_ids.filter(id => id !== dayId)
      : [...primaryEntry.active_weekday_ids, dayId]
    onActiveWeekdaysChange(newIds)
  }

  return (
    <div
      ref={setNodeRef}
      {...(isLoggedIn ? listeners : {})}
      {...attributes}
      style={{
        background: bg,
        border: issueHighlightSeverity === 'error'
          ? '2px solid var(--error)'
          : issueHighlightSeverity === 'warning'
          ? '2px solid var(--warning)'
          : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 'var(--border-radius)',
        padding: '6px 8px',
        fontSize: 11,
        cursor: isLoggedIn ? 'grab' : 'default',
        opacity: isDragging ? 0.4 : dimmed ? 0.25 : 1,
        userSelect: 'none',
        position: 'relative',
        transition: 'opacity 0.15s',
        overflow: 'hidden',
        height: '100%',
        boxSizing: 'border-box',
        boxShadow: issueHighlightSeverity === 'error'
          ? '0 0 8px var(--error)'
          : issueHighlightSeverity === 'warning'
          ? '0 0 8px var(--warning)'
          : undefined,
      }}
    >
      <div style={{ fontWeight: 600, color: '#ddd', lineHeight: 1.3 }}>
        {primaryCourse.dept_code} {primaryCourse.course_number} §{primaryEntry.section}
      </div>
      <div style={{ color: '#bbb', fontSize: 10, marginTop: 1 }}>{primaryCourse.course_name}</div>
      <div style={{ color: 'rgba(180,200,220,0.8)', fontSize: 10, marginTop: 3, fontWeight: 600 }}>
        & {partnerCourse.dept_code} {partnerCourse.course_number}
      </div>
      <div style={{ color: 'rgba(150,160,170,0.7)', fontSize: 9 }}>{partnerCourse.course_name}</div>
      {showToggles && (
        <div
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{ display: 'flex', gap: 2, marginTop: 4 }}
        >
          {tableWeekdays.map(w => {
            const isActive = primaryEntry.active_weekday_ids.includes(w.id)
            return (
              <button
                key={w.id}
                onClick={() => isLoggedIn && toggleDay(w.id)}
                disabled={!isLoggedIn}
                style={{
                  padding: '1px 4px', fontSize: 9, fontWeight: 600,
                  border: '1px solid rgba(255,255,255,0.3)', borderRadius: 3,
                  background: isActive ? 'rgba(97,175,239,0.5)' : 'rgba(0,0,0,0.35)',
                  color: isActive ? '#fff' : '#888',
                  cursor: isLoggedIn ? 'pointer' : 'default', lineHeight: '14px',
                }}
              >
                {DAY_ABBR[w.name] ?? w.name}
              </button>
            )
          })}
        </div>
      )}
      <div onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ marginTop: 4 }}>
        <select
          value={primaryEntry.faculty_id ?? ''}
          onChange={e => isLoggedIn && onFacultyChange(e.target.value ? +e.target.value : null)}
          disabled={!isLoggedIn}
          style={{ width: '100%', fontSize: 10, padding: '2px 4px', background: 'rgba(0,0,0,0.3)', color: '#ddd', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <option value="">No instructor</option>
          {allFaculty.map(f => (
            <option key={f.id} value={f.id}>{f.last_name}, {f.first_name}</option>
          ))}
        </select>
      </div>
      {isLoggedIn && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.4)',
            color: '#ff8080', border: 'none', borderRadius: 3, padding: '0 4px',
            fontSize: 11, cursor: 'pointer', lineHeight: '16px'
          }}
        >×</button>
      )}
    </div>
  )
}

// --- Column Resizer Handle ---
function ColumnResizer({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: 4,
        flexShrink: 0,
        cursor: 'col-resize',
        background: 'var(--border-color)',
        transition: 'background 0.15s',
        zIndex: 10,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--accent)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--border-color)' }}
    />
  )
}

// --- Drop Cell ---
function TableCell({
  tableId, timeSlotId, roomId, rowSpan = 1, isOnline = false, tableWeekdays,
  entries, courses, effectivePartnerIds, allFaculty, isEntryDimmed, isLoggedIn,
  issueHighlightEntryIds, issueHighlightSeverity,
  onFacultyChange, onDeleteEntry, onActiveWeekdaysChange
}: {
  tableId: number
  timeSlotId: number
  roomId: number
  rowSpan?: number
  isOnline?: boolean
  tableWeekdays: Weekday[]
  entries: ScheduleEntry[]
  courses: Map<number, Course>
  effectivePartnerIds: Map<number, number[]>
  allFaculty: Faculty[]
  isEntryDimmed: (e: ScheduleEntry) => boolean
  isLoggedIn: boolean
  issueHighlightEntryIds?: Set<number>
  issueHighlightSeverity?: 'error' | 'warning' | null
  onFacultyChange: (entryId: number, fid: number | null) => void
  onDeleteEntry: (entryId: number) => void
  onActiveWeekdaysChange: (entryId: number, ids: number[]) => void
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

  // Group TaughtWith partners into one display unit
  type EntryGroup = { primary: ScheduleEntry; partner?: ScheduleEntry }
  const entryGroups: EntryGroup[] = []
  const usedIds = new Set<number>()
  for (const e of cellEntries) {
    if (usedIds.has(e.id)) continue
    const partnerIds = effectivePartnerIds.get(e.course_id) ?? []
    const partnerEntry = partnerIds
      .map(pid => cellEntries.find(ce => ce.course_id === pid && !usedIds.has(ce.id)))
      .find(Boolean)
    if (partnerEntry) {
      entryGroups.push({ primary: e, partner: partnerEntry })
      usedIds.add(e.id)
      usedIds.add(partnerEntry.id)
    } else {
      entryGroups.push({ primary: e })
      usedIds.add(e.id)
    }
  }

  return (
    <td
      ref={setNodeRef}
      rowSpan={rowSpan}
      style={{
        border: '1px solid var(--border-color)',
        padding: 0,
        verticalAlign: 'top',
        minWidth: isOnline ? Math.max(130, entryGroups.length * 130) : 130,
        height: 100,
        background: isOver ? 'rgba(97,175,239,0.1)' : undefined,
        transition: 'background 0.1s',
        position: 'relative',
      }}
    >
      <div style={{
        position: 'absolute', inset: 4,
        display: 'flex',
        flexDirection: isOnline ? 'row' : 'column',
        gap: 4,
        overflowX: isOnline ? 'auto' : undefined,
      }}>
        {entryGroups.map(group => {
          const course = courses.get(group.primary.course_id)
          if (!course) return null
          if (group.partner) {
            const partnerCourse = courses.get(group.partner.course_id)
            if (!partnerCourse) return null
            return (
              <div key={group.primary.id} style={isOnline ? { minWidth: 122, flexShrink: 0, height: '100%' } : { flex: 1 }}>
                <TaughtWithSectionCard
                  primaryEntry={group.primary}
                  partnerEntry={group.partner}
                  primaryCourse={course}
                  partnerCourse={partnerCourse}
                  allFaculty={allFaculty}
                  tableWeekdays={tableWeekdays}
                  dimmed={isEntryDimmed(group.primary) || isEntryDimmed(group.partner)}
                  isLoggedIn={isLoggedIn}
                  issueHighlightSeverity={
                    issueHighlightEntryIds?.has(group.primary.id) || issueHighlightEntryIds?.has(group.partner.id)
                      ? issueHighlightSeverity : null
                  }
                  onFacultyChange={fid => { onFacultyChange(group.primary.id, fid); onFacultyChange(group.partner!.id, fid) }}
                  onDelete={() => { onDeleteEntry(group.primary.id); onDeleteEntry(group.partner!.id) }}
                  onActiveWeekdaysChange={ids => { onActiveWeekdaysChange(group.primary.id, ids); onActiveWeekdaysChange(group.partner!.id, ids) }}
                />
              </div>
            )
          }
          return (
            <div key={group.primary.id} style={isOnline ? { minWidth: 122, flexShrink: 0, height: '100%' } : { flex: 1 }}>
              <ScheduledSectionCard
                entry={group.primary}
                course={course}
                allFaculty={allFaculty}
                tableWeekdays={tableWeekdays}
                dimmed={isEntryDimmed(group.primary)}
                isLoggedIn={isLoggedIn}
                issueHighlightSeverity={issueHighlightEntryIds?.has(group.primary.id) ? issueHighlightSeverity : null}
                onFacultyChange={fid => onFacultyChange(group.primary.id, fid)}
                onDelete={() => onDeleteEntry(group.primary.id)}
                onActiveWeekdaysChange={ids => onActiveWeekdaysChange(group.primary.id, ids)}
              />
            </div>
          )
        })}
      </div>
    </td>
  )
}

// --- Schedule Table Component ---
function ScheduleTableView({
  table, weekdays, timeSlots, rooms, entries, courses, effectivePartnerIds, allFaculty,
  isEntryDimmed, isLoggedIn, issueHighlightEntryIds, issueHighlightSeverity,
  onWeekdaysChange, onDeleteTable, onFacultyChange, onDeleteEntry, onActiveWeekdaysChange
}: {
  table: ScheduleTable
  weekdays: Weekday[]
  timeSlots: TimeSlot[]
  rooms: Room[]
  entries: ScheduleEntry[]
  courses: Map<number, Course>
  effectivePartnerIds: Map<number, number[]>
  allFaculty: Faculty[]
  isEntryDimmed: (e: ScheduleEntry) => boolean
  isLoggedIn: boolean
  issueHighlightEntryIds?: Set<number>
  issueHighlightSeverity?: 'error' | 'warning' | null
  onWeekdaysChange: (ids: number[]) => void
  onDeleteTable: () => void
  onFacultyChange: (entryId: number, fid: number | null) => void
  onDeleteEntry: (entryId: number) => void
  onActiveWeekdaysChange: (entryId: number, ids: number[]) => void
}) {
  const [hideUnused, setHideUnused] = useState(false)

  const selectedWeekdays = new Set<number>(table.weekday_ids)
  const dayNames: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' }

  const tableEntries = entries.filter(e => e.schedule_table_id === table.id)
  const usedRoomIds = new Set(tableEntries.map(e => e.room_id).filter(Boolean))

  // Sort rooms: physical rooms first (by label), online rooms last
  const sortedRooms = [...rooms]
    .sort((a, b) => {
      if (a.is_online !== b.is_online) return a.is_online ? 1 : -1
      return a.label.localeCompare(b.label)
    })
    .filter(r => !hideUnused || usedRoomIds.has(r.id))

  const tableWeekdays = weekdays.filter(w => table.weekday_ids.includes(w.id))
    .sort((a, b) => a.display_order - b.display_order)

  // Precompute which cells are covered by a multi-slot entry's rowspan,
  // and which starting cells need a rowspan > 1.
  const sortedSlotIds = timeSlots.map(ts => ts.id) // already in display_order
  const coveredCells = new Set<string>()   // `${roomId}:${slotId}`
  const rowSpanMap  = new Map<string, number>()  // `${roomId}:${slotId}` → span count
  for (const entry of entries) {
    if (entry.schedule_table_id !== table.id) continue
    if (!entry.room_id || entry.time_slot_ids.length <= 1) continue
    let first = true
    for (const sid of sortedSlotIds) {
      if (!entry.time_slot_ids.includes(sid)) continue
      const key = `${entry.room_id}:${sid}`
      if (first) { rowSpanMap.set(key, entry.time_slot_ids.length); first = false }
      else        { coveredCells.add(key) }
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {weekdays.map(w => (
            <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: isLoggedIn ? 'pointer' : 'default', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={selectedWeekdays.has(w.id)}
                disabled={!isLoggedIn}
                onChange={e => {
                  if (!isLoggedIn) return
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none', fontSize: 12, color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={hideUnused}
              onChange={e => setHideUnused(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            Hide unused rooms
          </label>
          {isLoggedIn && <button className="btn-danger btn-sm" onClick={onDeleteTable}>Delete Table</button>}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 10px', textAlign: 'left', background: 'var(--bg-elevated)', fontSize: 11, border: '1px solid var(--border-color)', minWidth: 130 }}>Time Slot</th>
              {sortedRooms.map(r => (
                <th key={r.id} style={{ padding: '6px 10px', textAlign: 'left', background: 'var(--bg-elevated)', fontSize: 11, border: '1px solid var(--border-color)', minWidth: 130 }}>
                  {r.label}{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {r.is_online ? '(∞)' : `(${r.capacity})`}
                  </span>
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
                {sortedRooms.map(r => {
                  const cellKey = `${r.id}:${ts.id}`
                  if (coveredCells.has(cellKey)) return <Fragment key={r.id} />
                  return (
                    <TableCell
                      key={r.id}
                      tableId={table.id}
                      timeSlotId={ts.id}
                      roomId={r.id}
                      rowSpan={rowSpanMap.get(cellKey) ?? 1}
                      isOnline={r.is_online}
                      tableWeekdays={tableWeekdays}
                      isLoggedIn={isLoggedIn}
                      entries={entries}
                      courses={courses}
                      effectivePartnerIds={effectivePartnerIds}
                      allFaculty={allFaculty}
                      isEntryDimmed={isEntryDimmed}
                      issueHighlightEntryIds={issueHighlightEntryIds}
                      issueHighlightSeverity={issueHighlightSeverity}
                      onFacultyChange={onFacultyChange}
                      onDeleteEntry={onDeleteEntry}
                      onActiveWeekdaysChange={onActiveWeekdaysChange}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// --- Filter Bar ---
const DAY_NAMES: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' }

function FilterBar({ filters, onAdd, onRemove, onToggleNot, allFaculty, weekdays, courses }: {
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

// --- AI Chat Panel ---
function AIChatPanel({
  termId, isLoggedIn, onHighlight, onProposalApproved
}: {
  termId: number
  highlightedIds?: number[]
  isLoggedIn: boolean
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
          placeholder={isLoggedIn ? 'Ask the AI...' : 'Log in to use AI audit'}
          style={{ flex: 1 }}
          disabled={sending || !isLoggedIn}
        />
        <button className="btn-primary" onClick={send} disabled={sending || !input.trim() || !isLoggedIn}>
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}

// --- Main Term Schedules Tab ---
export function TermSchedulesTab() {
  const { isLoggedIn } = useAuth()
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
  const [errors, setErrors] = useState<IssueItem[]>([])
  const [warnings, setWarnings] = useState<IssueItem[]>([])
  const [issueHighlight, setIssueHighlight] = useState<{ key: string, entryIds: number[], severity: 'error' | 'warning' } | null>(null)
  const [highlightedIds, setHighlightedIds] = useState<number[]>([])
  const [neededSections, setNeededSections] = useState<Map<number, number>>(new Map())
  const [showNewTermModal, setShowNewTermModal] = useState(false)
  const [newTermForm, setNewTermForm] = useState({ semester_id: 0, year: new Date().getFullYear() })
  const [savingTerm, setSavingTerm] = useState(false)
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([])
  const [termTaughtWith, setTermTaughtWith] = useState<TermTaughtWithGroup[]>([])
  const [showTermTWModal, setShowTermTWModal] = useState(false)
  const [termTWForm, setTermTWForm] = useState<number[]>([0, 0])
  const courseMap = new Map(courses.map(c => [c.id, c]))

  // Combined partner map: global (from course.taught_with_partner_ids) + per-term
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

  // Clear issue highlight when the underlying issue is resolved
  useEffect(() => {
    if (!issueHighlight) return
    const { key, entryIds } = issueHighlight
    const list = key.startsWith('error-') ? errors : warnings
    const idx = parseInt(key.split('-')[1])
    const issue = list[idx]
    if (!issue || issue.entries.length !== entryIds.length || !entryIds.every(id => issue.entries.includes(id))) {
      setIssueHighlight(null)
    }
  }, [errors, warnings])

  // --- Resizable columns ---
  const [courseWidth, setCourseWidth] = useState(220)
  const [warningWidth, setWarningWidth] = useState(200)
  const [aiWidth, setAiWidth] = useState(280)
  const resizerDrag = useRef<{
    idx: number; startX: number
    startCourse: number; startWarning: number; startAI: number
  } | null>(null)

  useEffect(() => {
    const MIN = 120
    const onMouseMove = (e: MouseEvent) => {
      if (!resizerDrag.current) return
      const { idx, startX, startCourse, startWarning, startAI } = resizerDrag.current
      const delta = e.clientX - startX
      if (idx === 0) {
        setCourseWidth(Math.max(MIN, startCourse + delta))
      } else if (idx === 1) {
        setWarningWidth(Math.max(MIN, startWarning - delta))
      } else {
        // Zero-sum between Warnings and AI
        const clamped = Math.max(MIN - startWarning, Math.min(startAI - MIN, delta))
        setWarningWidth(startWarning + clamped)
        setAiWidth(startAI - clamped)
      }
    }
    const onMouseUp = () => {
      if (resizerDrag.current) {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        resizerDrag.current = null
      }
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const startResize = (idx: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    resizerDrag.current = {
      idx, startX: e.clientX,
      startCourse: courseWidth, startWarning: warningWidth, startAI: aiWidth
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

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

    const [tbs, ents, cs, ttw] = await Promise.all([
      tablesApi.list(termId),
      entriesApi.listByTerm(termId),
      coursesApi.list(termData.semester_name),
      termTaughtWithApi.list(termId),
    ])
    setTables(tbs)
    setEntries(ents)
    setCourses(cs)
    setTermTaughtWith(ttw)

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
    setErrors([])
    setWarnings([])
    setIssueHighlight(null)
    setHighlightedIds([])
    setTermTaughtWith([])
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

  const handleTermDelete = async (termId: number) => {
    if (!window.confirm('Delete this term and all its schedule data? This cannot be undone.')) return
    try {
      await termsApi.delete(termId)
      const remaining = terms.filter(t => t.id !== termId)
      setTerms(remaining)
      if (selectedTermId === termId) {
        if (remaining.length > 0) {
          setSelectedTermId(remaining[0].id)
          loadTerm(remaining[0].id, remaining[0])
        } else {
          setSelectedTermId(null)
          setTables([])
          setEntries([])
          setCourses([])
          setErrors([])
          setWarnings([])
          setIssueHighlight(null)
        }
      }
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to delete term')
    }
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
      const { entry: updated, errors: errs, warnings: warns } = await entriesApi.patchFaculty(entryId, facultyId)
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, faculty_id: updated.faculty_id } : e))
      setErrors(errs)
      setWarnings(warns)
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to assign instructor')
    }
  }

  const handleDeleteEntry = async (entryId: number) => {
    await entriesApi.delete(entryId)
    setEntries(prev => prev.filter(e => e.id !== entryId))
  }

  const addFilter = (f: Omit<ActiveFilter, 'id'>) =>
    setActiveFilters(prev => [...prev, { ...f, id: Math.random().toString(36).slice(2) }])
  const removeFilter = (id: string) =>
    setActiveFilters(prev => prev.filter(f => f.id !== id))
  const toggleNot = (id: string) =>
    setActiveFilters(prev => prev.map(f => f.id === id ? { ...f, negated: !f.negated } : f))

  const isCourseDimmed = (courseId: number): boolean => {
    if (activeFilters.length === 0) return false
    const course = courseMap.get(courseId)
    if (!course) return false
    const courseEntries = entries.filter(e => e.course_id === courseId && e.schedule_table_id)
    return activeFilters.some(f => {
      let matches: boolean
      if (f.type === 'faculty') {
        matches = courseEntries.some(e => e.faculty_id === f.value)
      } else if (f.type === 'weekday') {
        matches = courseEntries.some(e => {
          const t = tables.find(t => t.id === e.schedule_table_id)
          return t?.weekday_ids.includes(f.value as number) ?? false
        })
      } else {
        matches = `${course.dept_code} ${course.course_number} ${course.course_name}`
          .toLowerCase().includes((f.value as string).toLowerCase())
      }
      return f.negated ? matches : !matches
    })
  }

  const isEntryDimmed = (entry: ScheduleEntry): boolean => {
    if (activeFilters.length === 0) return false
    const course = courseMap.get(entry.course_id)
    if (!course) return false
    const table = tables.find(t => t.id === entry.schedule_table_id)
    return activeFilters.some(f => {
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

  const handleActiveWeekdaysChange = async (entryId: number, activeWeekdayIds: number[]) => {
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, active_weekday_ids: activeWeekdayIds } : e))
    try {
      const { entry: updated, errors: errs, warnings: warns } = await entriesApi.update(entryId, { active_weekday_ids: activeWeekdayIds })
      setEntries(prev => prev.map(e => e.id === entryId ? updated : e))
      setErrors(errs)
      setWarnings(warns)
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to update day selection')
    }
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
        const allChanged = [result.entry, ...result.additional_entries]
        setEntries(prev => [
          ...prev.filter(e => !allChanged.some(c => c.id === e.id)),
          ...allChanged,
        ])
        setErrors(result.errors)
        setWarnings(result.warnings)
      } else if (activeData?.type === 'entry') {
        const entryId = activeData.entry_id
        const existing = entries.find(e => e.id === entryId)
        if (!existing) return

        const slotsNeeded = existing.time_slot_ids.length || 1
        const sortedSlots = [...timeSlots].sort((a, b) => a.display_order - b.display_order)
        const startIdx = sortedSlots.findIndex(ts => ts.id === time_slot_id)
        if (startIdx === -1) return
        const slotIds = sortedSlots.slice(startIdx, startIdx + slotsNeeded).map(ts => ts.id)

        const tableChanged = existing.schedule_table_id !== table_id
        const result = await entriesApi.update(entryId, {
          schedule_table_id: table_id,
          room_id,
          time_slot_ids: slotIds,
          ...(tableChanged ? { active_weekday_ids: [] } : {}),
        })
        const allChanged = [result.entry, ...result.additional_entries]
        setEntries(prev => prev.map(e => {
          const updated = allChanged.find(c => c.id === e.id)
          return updated ?? e
        }))
        setErrors(result.errors)
        setWarnings(result.warnings)
      }
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Drop failed')
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
          <TermSelector
            terms={terms}
            selectedTermId={selectedTermId}
            isLoggedIn={isLoggedIn}
            onSelect={handleTermChange}
            onDelete={handleTermDelete}
            onNew={() => setShowNewTermModal(true)}
          />
          {selectedTermId && (
            <>
              <button
                className="btn-secondary"
                onClick={() => window.open(`/api/terms/${selectedTermId}/export`, '_blank')}
              >
                Export
              </button>
              {isLoggedIn && (
                <button
                  className="btn-secondary"
                  onClick={() => { setTermTWForm([0, 0]); setShowTermTWModal(true) }}
                >
                  Term TW
                </button>
              )}
            </>
          )}
        </div>

        {/* Filter bar */}
        <FilterBar
          filters={activeFilters}
          onAdd={addFilter}
          onRemove={removeFilter}
          onToggleNot={toggleNot}
          allFaculty={allFaculty}
          weekdays={weekdays}
          courses={termCourses}
        />

        {/* Main area: 4 resizable columns */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Course List */}
          <div style={{ width: courseWidth, flexShrink: 0, overflowY: 'auto', padding: 12 }}>
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
                isLoggedIn={isLoggedIn}
                onSectionChange={count => handleSectionChange(c.id, count)}
                highlighted={highlightedIds.includes(c.id)}
                dimmed={isCourseDimmed(c.id)}
                taughtWithPartners={(effectivePartnerIds.get(c.id) ?? []).map(pid => courseMap.get(pid)).filter(Boolean) as Course[]}
              />
            ))}
          </div>

          <ColumnResizer onMouseDown={startResize(0)} />

          {/* Tables List */}
          <div style={{ flex: 1, minWidth: 300, overflowY: 'auto', padding: 16 }}>
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
                effectivePartnerIds={effectivePartnerIds}
                allFaculty={allFaculty}
                isEntryDimmed={isEntryDimmed}
                isLoggedIn={isLoggedIn}
                issueHighlightEntryIds={issueHighlight ? new Set(issueHighlight.entryIds) : undefined}
                issueHighlightSeverity={issueHighlight?.severity}
                onWeekdaysChange={ids => updateTableWeekdays(table.id, ids)}
                onDeleteTable={() => deleteTable(table.id)}
                onFacultyChange={handleFacultyChange}
                onDeleteEntry={handleDeleteEntry}
                onActiveWeekdaysChange={handleActiveWeekdaysChange}
              />
            ))}
            {selectedTermId && isLoggedIn && (
              <button
                className="btn-secondary"
                style={{ width: '100%', padding: '12px', fontSize: 20, borderStyle: 'dashed' }}
                onClick={addTable}
              >
                + Add Table
              </button>
            )}
          </div>

          <ColumnResizer onMouseDown={startResize(1)} />

          {/* Issues List */}
          <div style={{ width: warningWidth, flexShrink: 0, overflowY: 'auto', padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Issues</div>
            {errors.length === 0 && warnings.length === 0 ? (
              <div style={{ color: 'var(--success)', fontSize: 12 }}>No issues</div>
            ) : (
              <>
                {errors.map((e, i) => {
                  const key = `error-${i}`
                  const active = issueHighlight?.key === key
                  return (
                    <div
                      key={key}
                      onClick={() => e.entries.length && setIssueHighlight(active ? null : { key, entryIds: e.entries, severity: 'error' })}
                      style={{ background: active ? 'var(--bg-surface)' : 'var(--bg-elevated)', border: `1px solid var(--error)`, borderRadius: 'var(--border-radius)', padding: '8px 10px', marginBottom: 8, fontSize: 11, color: 'var(--error)', cursor: e.entries.length ? 'pointer' : 'default', userSelect: 'none' }}
                    >
                      {e.description}
                    </div>
                  )
                })}
                {warnings.map((w, i) => {
                  const key = `warning-${i}`
                  const active = issueHighlight?.key === key
                  return (
                    <div
                      key={key}
                      onClick={() => w.entries.length && setIssueHighlight(active ? null : { key, entryIds: w.entries, severity: 'warning' })}
                      style={{ background: active ? 'var(--bg-surface)' : 'var(--bg-elevated)', border: `1px solid var(--warning)`, borderRadius: 'var(--border-radius)', padding: '8px 10px', marginBottom: 8, fontSize: 11, color: 'var(--warning)', cursor: w.entries.length ? 'pointer' : 'default', userSelect: 'none' }}
                    >
                      {w.description}
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {isLoggedIn && (
            <>
              <ColumnResizer onMouseDown={startResize(2)} />

              {/* AI Audit */}
              <div style={{ width: aiWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 12px 8px', borderBottom: '1px solid var(--border-color)' }}>AI Audit</div>
                {selectedTermId ? (
                  <AIChatPanel
                    termId={selectedTermId}
                    highlightedIds={highlightedIds}
                    isLoggedIn={isLoggedIn}
                    onHighlight={setHighlightedIds}
                    onProposalApproved={() => { refresh(); setErrors([]); setWarnings([]); setIssueHighlight(null) }}
                  />
                ) : (
                  <div style={{ padding: 12, color: 'var(--text-secondary)', fontSize: 12 }}>Select a term to use AI audit.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showTermTWModal && selectedTermId && (
        <FormModal
          title="Term TaughtWith Groups"
          onClose={() => setShowTermTWModal(false)}
          onSave={async () => {
            const [a, b] = termTWForm
            if (!a || !b || a === b) { showToast('Select two different courses'); return }
            try {
              await termTaughtWithApi.create(selectedTermId, [a, b])
              const updated = await termTaughtWithApi.list(selectedTermId)
              setTermTaughtWith(updated)
              setTermTWForm([0, 0])
            } catch (e: any) {
              showToast(e.response?.data?.detail || 'Failed to create group')
            }
          }}
          saving={false}
        >
          {termTaughtWith.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {termTaughtWith.map(g => {
                const names = g.course_ids.map(id => {
                  const c = courseMap.get(id)
                  return c ? `${c.dept_code} ${c.course_number}` : `#${id}`
                }).join(' + ')
                return (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', marginBottom: 4, background: 'var(--bg-elevated)', borderRadius: 4 }}>
                    <span style={{ fontSize: 13 }}>{names}</span>
                    <button
                      className="btn-danger btn-sm"
                      onClick={async () => {
                        await termTaughtWithApi.delete(selectedTermId, g.id)
                        setTermTaughtWith(prev => prev.filter(x => x.id !== g.id))
                      }}
                    >Remove</button>
                  </div>
                )
              })}
            </div>
          )}
          <div className="form-group">
            <label>Course A</label>
            <select value={termTWForm[0] || ''} onChange={e => setTermTWForm(f => [+e.target.value, f[1]])}>
              <option value="">Select course...</option>
              {termCourses.map(c => <option key={c.id} value={c.id}>{c.dept_code} {c.course_number} — {c.course_name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Course B</label>
            <select value={termTWForm[1] || ''} onChange={e => setTermTWForm(f => [f[0], +e.target.value])}>
              <option value="">Select course...</option>
              {termCourses.map(c => <option key={c.id} value={c.id}>{c.dept_code} {c.course_number} — {c.course_name}</option>)}
            </select>
          </div>
        </FormModal>
      )}

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
