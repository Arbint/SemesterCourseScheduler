import { Fragment, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { Course, Faculty, Room, ScheduleEntry, ScheduleTable, TimeSlot, Weekday } from '../api'

export const PASTEL = [
  '#4a3060', '#2e4a35', '#2e3a4a', '#4a3a25', '#3a2e4a',
  '#254a3a', '#4a2a2e', '#253a4a', '#4a4225', '#2e4a44',
  '#4a2e3a', '#354a25'
]

export function facultyColor(facultyId: number | null): string {
  if (facultyId === null) return 'var(--bg-elevated)'
  return PASTEL[facultyId % PASTEL.length]
}

export const DAY_ABBR: Record<string, string> = { mon: 'M', tue: 'T', wed: 'W', thu: 'Th', fri: 'F' }

// Font sizes below use calc(var(--sched-font-scale, 1) * Npx) so a container
// (e.g. the View tab) can scale all table text via one CSS variable without
// threading a prop through every card. Falls back to 1 (unscaled) elsewhere.
const fs = (px: number) => `calc(var(--sched-font-scale, 1) * ${px}px)`

// --- Scheduled Section Card (inside table cell) ---
export function ScheduledSectionCard({
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
        fontSize: fs(11),
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
      <div style={{ color: '#bbb', marginTop: 2, fontSize: fs(10) }}>{course.course_name}</div>
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
                  fontSize: fs(9),
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
          style={{ width: '100%', fontSize: fs(10), padding: '2px 4px', background: 'rgba(0,0,0,0.3)', color: '#ddd', border: '1px solid rgba(255,255,255,0.15)' }}
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
            fontSize: fs(11), cursor: 'pointer', lineHeight: '16px'
          }}
        >×</button>
      )}
    </div>
  )
}

// --- Combined card for a TaughtWith pair in the same cell ---
export function TaughtWithSectionCard({
  primaryEntry, primaryCourse, partnerCourse,
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
        fontSize: fs(11),
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
      <div style={{ color: '#bbb', fontSize: fs(10), marginTop: 1 }}>{primaryCourse.course_name}</div>
      <div style={{ color: 'rgba(180,200,220,0.8)', fontSize: fs(10), marginTop: 3, fontWeight: 600 }}>
        & {partnerCourse.dept_code} {partnerCourse.course_number}
      </div>
      <div style={{ color: 'rgba(150,160,170,0.7)', fontSize: fs(9) }}>{partnerCourse.course_name}</div>
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
                  padding: '1px 4px', fontSize: fs(9), fontWeight: 600,
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
          style={{ width: '100%', fontSize: fs(10), padding: '2px 4px', background: 'rgba(0,0,0,0.3)', color: '#ddd', border: '1px solid rgba(255,255,255,0.15)' }}
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
            fontSize: fs(11), cursor: 'pointer', lineHeight: '16px'
          }}
        >×</button>
      )}
    </div>
  )
}

// --- Column Resizer Handle ---
export function ColumnResizer({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
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
export function TableCell({
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
        minWidth: fs(Math.max(130, isOnline ? entryGroups.length * 130 : 130)),
        height: fs(100),
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
              <div key={group.primary.id} style={isOnline ? { minWidth: fs(122), flexShrink: 0, height: '100%' } : { flex: 1 }}>
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
            <div key={group.primary.id} style={isOnline ? { minWidth: fs(122), flexShrink: 0, height: '100%' } : { flex: 1 }}>
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
export function ScheduleTableView({
  table, weekdays, timeSlots, rooms, entries, courses, effectivePartnerIds, allFaculty,
  isEntryDimmed, isLoggedIn, issueHighlightEntryIds, issueHighlightSeverity,
  onWeekdaysChange, onDeleteTable, onFacultyChange, onDeleteEntry, onActiveWeekdaysChange,
  forceHideUnused = false,
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
  // View tab: always hide unused rooms/time-slot rows, no toggle shown.
  forceHideUnused?: boolean
}) {
  const [hideUnusedState, setHideUnusedState] = useState(false)
  const hideUnused = forceHideUnused || hideUnusedState

  const selectedWeekdays = new Set<number>(table.weekday_ids)
  const dayNames: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' }

  const tableEntries = entries.filter(e => e.schedule_table_id === table.id)
  const usedRoomIds = new Set(tableEntries.map(e => e.room_id).filter(Boolean))

  // Sort rooms: physical rooms first (by label), online rooms last
  const sortedRooms = [...rooms]
    .sort((a, b) => {
      if (a.is_online !== b.is_online) return a.is_online ? 1 : -1
      return a.display_label.localeCompare(b.display_label)
    })
    .filter(r => !hideUnused || usedRoomIds.has(r.id))

  const tableWeekdays = weekdays.filter(w => table.weekday_ids.includes(w.id))
    .sort((a, b) => a.display_order - b.display_order)

  // A time slot row is "used" if any entry in this table occupies it —
  // whether it starts there or is mid-span from an earlier row. Filtering
  // on this (rather than "starts here") keeps rowSpan-covered rows intact,
  // since a spanning entry's time_slot_ids includes every slot it covers.
  const visibleTimeSlots = forceHideUnused
    ? timeSlots.filter(ts => tableEntries.some(e => e.time_slot_ids.includes(ts.id)))
    : timeSlots

  // Precompute which cells are covered by a multi-slot entry's rowspan,
  // and which starting cells need a rowspan > 1.
  const sortedSlotIds = visibleTimeSlots.map(ts => ts.id) // already in display_order
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
          {!forceHideUnused && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none', fontSize: 12, color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={hideUnusedState}
                onChange={e => setHideUnusedState(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              Hide unused rooms
            </label>
          )}
          {isLoggedIn && <button className="btn-danger btn-sm" onClick={onDeleteTable}>Delete Table</button>}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 10px', textAlign: 'left', background: 'var(--bg-elevated)', fontSize: fs(11), border: '1px solid var(--border-color)', minWidth: fs(130) }}>Time Slot</th>
              {sortedRooms.map(r => (
                <th key={r.id} style={{ padding: '6px 10px', textAlign: 'left', background: 'var(--bg-elevated)', fontSize: fs(11), border: '1px solid var(--border-color)', minWidth: fs(130) }}>
                  {r.display_label}{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {r.is_online ? '(∞)' : `(${r.capacity})`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleTimeSlots.map(ts => (
              <tr key={ts.id}>
                <td style={{ padding: '6px 10px', fontSize: fs(11), color: 'var(--text-secondary)', border: '1px solid var(--border-color)', whiteSpace: 'nowrap', background: 'var(--bg-elevated)' }}>
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
