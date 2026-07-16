import { Fragment, useState, useMemo, useRef } from 'react'
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

// Cell width/height defaults match the Term Schedules tab's historical fixed
// sizing (130×100) so it renders identically whether or not a caller passes
// these explicitly. The View tab overrides both via user-facing spin boxes.
export const DEFAULT_CELL_WIDTH = 130
export const DEFAULT_CELL_HEIGHT = 100

const CARD_FONT_FAMILY = "'Segoe UI', system-ui, -apple-system, sans-serif"
const CARD_PADDING_H = 16 // card padding '6px 8px' -> 8 + 8
const CARD_PADDING_V = 12 // 6 + 6

let measureCtx: CanvasRenderingContext2D | null | undefined
function measureTextWidth(text: string, px: number, weight: number): number {
  if (measureCtx === undefined) {
    measureCtx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  }
  if (!measureCtx) return text.length * px * 0.6
  measureCtx.font = `${weight} ${px}px ${CARD_FONT_FAMILY}`
  return measureCtx.measureText(text).width
}

// --- View-tab uniform card font size (feedback_48 revision) ---
// Every card must render at the exact same font size regardless of what
// it's displaying — a short course name must not look bigger than a long
// one. So this is deliberately *not* per-card: it sizes off the cell's own
// width/height plus fixed representative sample text, never a specific
// course's actual content. Anything that doesn't fit at that size is simply
// clipped by the card's own overflow: hidden; the cell/card box itself never
// changes size because of font/content. Binary search works because the
// "fits" predicate is monotonic (a smaller base font always fits if a
// larger one does).
const FIT_MIN_PX = 6
const FIT_MAX_PX = 40
const FIT_LINE_HEIGHT = 1.25
const FIT_GAP = 2
export const FIT_NAME_RATIO = 0.88
export const FIT_INSTRUCTOR_RATIO = 0.8
export const FIT_PARTNER_RATIO = 0.8
const FIT_BADGE_ROW_RESERVE = 18
const FIT_NAME_LINES = 2 // assumed reservation; real names aren't measured here on purpose
const CARD_INSET = 4     // matches the position:absolute inset:4 gap around each card

// Deliberately generic, not tied to any real course/instructor — this is
// what keeps the result independent of which card it's applied to.
const SAMPLE_TITLE = 'WXYZ 0000 §0'
const SAMPLE_INSTRUCTOR = 'Worthington, Alexandra'

function uniformFits(base: number, availWidth: number, availHeight: number): boolean {
  if (measureTextWidth(SAMPLE_TITLE, base, 600) > availWidth) return false
  const instrSize = base * FIT_INSTRUCTOR_RATIO
  if (measureTextWidth(SAMPLE_INSTRUCTOR, instrSize, 400) > availWidth) return false
  const nameSize = base * FIT_NAME_RATIO
  const height = base * FIT_LINE_HEIGHT + FIT_NAME_LINES * nameSize * FIT_LINE_HEIGHT + instrSize * FIT_LINE_HEIGHT
    + 3 * FIT_GAP + FIT_BADGE_ROW_RESERVE
  return height <= availHeight
}

// The base font size (before fontScale) shared by every card in the table —
// a pure function of cellWidth/cellHeight.
export function computeUniformFontSize(cellWidth: number, cellHeight: number): number {
  const availWidth = Math.max(1, cellWidth - CARD_PADDING_H - CARD_INSET * 2)
  const availHeight = Math.max(1, cellHeight - CARD_PADDING_V - CARD_INSET * 2)
  if (!uniformFits(FIT_MIN_PX, availWidth, availHeight)) return FIT_MIN_PX
  let lo = FIT_MIN_PX, hi = FIT_MAX_PX
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2)
    if (uniformFits(mid, availWidth, availHeight)) lo = mid
    else hi = mid - 1
  }
  return lo
}

// Combines the entries' rowSpan-covered slots into one human range, e.g.
// "10:30 AM - 11:45 AM", by pulling the first slot's start half and the
// last slot's end half from their already-formatted labels.
export function formatEntryTimeRange(entry: ScheduleEntry, timeSlots: TimeSlot[]): string {
  const slots = timeSlots
    .filter(ts => entry.time_slot_ids.includes(ts.id))
    .sort((a, b) => a.display_order - b.display_order)
  if (slots.length === 0) return ''
  const start = slots[0].label.split(' - ')[0]
  const end = slots[slots.length - 1].label.split(' - ')[1] ?? slots[slots.length - 1].label
  return `${start} - ${end}`
}

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

const DAY_FULL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' }

// Anchors a floating hover panel to a card. Positioned with the card's
// live bounding rect and rendered as position: fixed *outside* the card
// (a sibling, not a child) so the card's own overflow: hidden — needed to
// clip an oversized fontScale — can't also clip the tooltip.
function useCardTooltip() {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const onMouseEnter = () => {
    const rect = ref.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 6, left: Math.min(rect.left, Math.max(4, window.innerWidth - 280)) })
  }
  const onMouseLeave = () => setPos(null)
  return { ref, pos, onMouseEnter, onMouseLeave }
}

function CardTooltip({ pos, children }: { pos: { top: number; left: number } | null; children: React.ReactNode }) {
  if (!pos) return null
  return (
    <div style={{
      position: 'fixed', top: pos.top, left: pos.left, zIndex: 3000, maxWidth: 260,
      background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 6,
      boxShadow: '0 4px 14px rgba(0,0,0,0.4)', padding: '10px 12px', fontSize: 12,
      color: 'var(--text-primary)', lineHeight: 1.5, pointerEvents: 'none',
    }}>
      {children}
    </div>
  )
}

function activeDayNames(entry: ScheduleEntry, tableWeekdays: Weekday[], showBadges: boolean): string {
  const activeIds = showBadges ? entry.active_weekday_ids : tableWeekdays.map(w => w.id)
  return tableWeekdays.filter(w => activeIds.includes(w.id)).map(w => DAY_FULL[w.name] ?? w.name).join(', ')
}

// --- View-tab section card (feedback_48): plain instructor text, centered
// layout, and one uniform auto-fit font shared by every card on the page
// (see computeUniformFontSize) times the user's font-scale. Never resizes
// the card/cell — an oversized fontScale just clips via the card's own
// overflow: hidden, exactly like the base ScheduledSectionCard. A hover
// tooltip shows the full text plus the scheduled start/end time, which the
// compact card has no room to display.
export function ViewSectionCard({
  entry, course, allFaculty, tableWeekdays, dimmed, issueHighlightSeverity, fontPx, timeSlots,
}: {
  entry: ScheduleEntry
  course: Course
  allFaculty: Faculty[]
  tableWeekdays: Weekday[]
  dimmed: boolean
  issueHighlightSeverity?: 'error' | 'warning' | null
  fontPx: number
  timeSlots: TimeSlot[]
}) {
  const bg = facultyColor(entry.faculty_id)
  const showBadges = tableWeekdays.length > course.frequency
  const faculty = entry.faculty_id !== null ? allFaculty.find(f => f.id === entry.faculty_id) : undefined
  const instructorText = faculty ? `${faculty.last_name}, ${faculty.first_name}` : 'No instructor'
  const title = `${course.dept_code} ${course.course_number} §${entry.section}`
  const timeRange = formatEntryTimeRange(entry, timeSlots)
  const days = activeDayNames(entry, tableWeekdays, showBadges)
  const tip = useCardTooltip()

  return (
    <>
      <div
        ref={tip.ref}
        onMouseEnter={tip.onMouseEnter}
        onMouseLeave={tip.onMouseLeave}
        style={{
          background: bg,
          border: issueHighlightSeverity === 'error'
            ? '2px solid var(--error)'
            : issueHighlightSeverity === 'warning'
            ? '2px solid var(--warning)'
            : '1px solid rgba(255,255,255,0.1)',
          borderRadius: 'var(--border-radius)',
          padding: '6px 8px',
          opacity: dimmed ? 0.25 : 1,
          userSelect: 'none',
          overflow: 'hidden',
          height: '100%',
          width: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          boxShadow: issueHighlightSeverity === 'error'
            ? '0 0 8px var(--error)'
            : issueHighlightSeverity === 'warning'
            ? '0 0 8px var(--warning)'
            : undefined,
        }}
      >
        <div style={{ fontWeight: 600, color: '#ddd', fontSize: fontPx }}>{title}</div>
        <div style={{ color: '#bbb', marginTop: 2, fontSize: fontPx * FIT_NAME_RATIO }}>{course.course_name}</div>
        <div style={{ color: '#ccc', marginTop: 2, fontSize: fontPx * FIT_INSTRUCTOR_RATIO }}>{instructorText}</div>
        {showBadges && (
          <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
            {tableWeekdays.map(w => {
              const isActive = entry.active_weekday_ids.includes(w.id)
              return (
                <span
                  key={w.id}
                  style={{
                    padding: '1px 4px', fontSize: 9, fontWeight: 600, borderRadius: 3,
                    border: '1px solid rgba(255,255,255,0.3)',
                    background: isActive ? 'rgba(97,175,239,0.5)' : 'rgba(0,0,0,0.35)',
                    color: isActive ? '#fff' : '#888',
                    lineHeight: '14px',
                  }}
                >
                  {DAY_ABBR[w.name] ?? w.name}
                </span>
              )
            })}
          </div>
        )}
      </div>
      <CardTooltip pos={tip.pos}>
        <div style={{ fontWeight: 700, color: 'var(--text-bright)' }}>{title}</div>
        <div>{course.course_name}</div>
        <div style={{ color: 'var(--text-secondary)' }}>{instructorText}</div>
        {timeRange && <div style={{ color: 'var(--text-secondary)' }}>{timeRange}</div>}
        {days && <div style={{ color: 'var(--text-secondary)' }}>{days}</div>}
      </CardTooltip>
    </>
  )
}

// --- View-tab TaughtWith card: same uniform-font/centered/plain-text/hover
// treatment as ViewSectionCard, plus the "& partner" line.
export function ViewTaughtWithSectionCard({
  primaryEntry, primaryCourse, partnerCourse, allFaculty, tableWeekdays, dimmed, issueHighlightSeverity,
  fontPx, timeSlots,
}: {
  primaryEntry: ScheduleEntry
  primaryCourse: Course
  partnerCourse: Course
  allFaculty: Faculty[]
  tableWeekdays: Weekday[]
  dimmed: boolean
  issueHighlightSeverity?: 'error' | 'warning' | null
  fontPx: number
  timeSlots: TimeSlot[]
}) {
  const bg = facultyColor(primaryEntry.faculty_id)
  const showBadges = tableWeekdays.length > primaryCourse.frequency
  const faculty = primaryEntry.faculty_id !== null ? allFaculty.find(f => f.id === primaryEntry.faculty_id) : undefined
  const instructorText = faculty ? `${faculty.last_name}, ${faculty.first_name}` : 'No instructor'
  const title = `${primaryCourse.dept_code} ${primaryCourse.course_number} §${primaryEntry.section}`
  const partnerLine = `& ${partnerCourse.dept_code} ${partnerCourse.course_number}`
  const timeRange = formatEntryTimeRange(primaryEntry, timeSlots)
  const days = activeDayNames(primaryEntry, tableWeekdays, showBadges)
  const tip = useCardTooltip()

  return (
    <>
      <div
        ref={tip.ref}
        onMouseEnter={tip.onMouseEnter}
        onMouseLeave={tip.onMouseLeave}
        style={{
          background: bg,
          border: issueHighlightSeverity === 'error'
            ? '2px solid var(--error)'
            : issueHighlightSeverity === 'warning'
            ? '2px solid var(--warning)'
            : '1px solid rgba(255,255,255,0.1)',
          borderRadius: 'var(--border-radius)',
          padding: '6px 8px',
          opacity: dimmed ? 0.25 : 1,
          userSelect: 'none',
          overflow: 'hidden',
          height: '100%',
          width: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          boxShadow: issueHighlightSeverity === 'error'
            ? '0 0 8px var(--error)'
            : issueHighlightSeverity === 'warning'
            ? '0 0 8px var(--warning)'
            : undefined,
        }}
      >
        <div style={{ fontWeight: 600, color: '#ddd', fontSize: fontPx }}>{title}</div>
        <div style={{ color: '#bbb', marginTop: 2, fontSize: fontPx * FIT_NAME_RATIO }}>{primaryCourse.course_name}</div>
        <div style={{ color: 'rgba(180,200,220,0.8)', marginTop: 2, fontWeight: 600, fontSize: fontPx * FIT_PARTNER_RATIO }}>{partnerLine}</div>
        <div style={{ color: '#ccc', marginTop: 2, fontSize: fontPx * FIT_INSTRUCTOR_RATIO }}>{instructorText}</div>
        {showBadges && (
          <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
            {tableWeekdays.map(w => {
              const isActive = primaryEntry.active_weekday_ids.includes(w.id)
              return (
                <span
                  key={w.id}
                  style={{
                    padding: '1px 4px', fontSize: 9, fontWeight: 600, borderRadius: 3,
                    border: '1px solid rgba(255,255,255,0.3)',
                    background: isActive ? 'rgba(97,175,239,0.5)' : 'rgba(0,0,0,0.35)',
                    color: isActive ? '#fff' : '#888',
                    lineHeight: '14px',
                  }}
                >
                  {DAY_ABBR[w.name] ?? w.name}
                </span>
              )
            })}
          </div>
        )}
      </div>
      <CardTooltip pos={tip.pos}>
        <div style={{ fontWeight: 700, color: 'var(--text-bright)' }}>{title}</div>
        <div>{primaryCourse.course_name}</div>
        <div style={{ fontWeight: 600 }}>{partnerLine} — {partnerCourse.course_name}</div>
        <div style={{ color: 'var(--text-secondary)' }}>{instructorText}</div>
        {timeRange && <div style={{ color: 'var(--text-secondary)' }}>{timeRange}</div>}
        {days && <div style={{ color: 'var(--text-secondary)' }}>{days}</div>}
      </CardTooltip>
    </>
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
  issueHighlightEntryIds, issueHighlightSeverity, cellWidth, cellHeight = DEFAULT_CELL_HEIGHT,
  viewMode = false, fontPx = 14, timeSlots = [],
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
  cellWidth: number
  cellHeight?: number
  // View tab only (feedback_48): swaps in the uniform-font, plain-text,
  // centered card variants instead of the editable ones.
  viewMode?: boolean
  fontPx?: number
  timeSlots?: TimeSlot[]
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
        minWidth: isOnline ? Math.max(cellWidth, entryGroups.length * cellWidth) : cellWidth,
        height: cellHeight,
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
          const cardWidth = isOnline ? Math.max(60, cellWidth - 8) : cellWidth - 8
          // minHeight/minWidth: 0 override the flex default of "auto", which
          // otherwise lets an oversized card (e.g. from a large fontScale)
          // force this wrapper — and the table row/cell it sits in — to grow
          // past the fixed cellWidth/cellHeight even though the card itself
          // has overflow: hidden. overflow: hidden here closes the same gap
          // at this level too.
          const wrapperStyle = isOnline
            ? { minWidth: cardWidth, flexShrink: 0, height: '100%', overflow: 'hidden' as const }
            : { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' as const }
          if (group.partner) {
            const partnerCourse = courses.get(group.partner.course_id)
            if (!partnerCourse) return null
            const highlight = issueHighlightEntryIds?.has(group.primary.id) || issueHighlightEntryIds?.has(group.partner.id)
              ? issueHighlightSeverity : null
            return (
              <div key={group.primary.id} style={wrapperStyle}>
                {viewMode ? (
                  <ViewTaughtWithSectionCard
                    primaryEntry={group.primary}
                    primaryCourse={course}
                    partnerCourse={partnerCourse}
                    allFaculty={allFaculty}
                    tableWeekdays={tableWeekdays}
                    dimmed={isEntryDimmed(group.primary) || isEntryDimmed(group.partner)}
                    issueHighlightSeverity={highlight}
                    fontPx={fontPx}
                    timeSlots={timeSlots}
                  />
                ) : (
                  <TaughtWithSectionCard
                    primaryEntry={group.primary}
                    partnerEntry={group.partner}
                    primaryCourse={course}
                    partnerCourse={partnerCourse}
                    allFaculty={allFaculty}
                    tableWeekdays={tableWeekdays}
                    dimmed={isEntryDimmed(group.primary) || isEntryDimmed(group.partner)}
                    isLoggedIn={isLoggedIn}
                    issueHighlightSeverity={highlight}
                    onFacultyChange={fid => { onFacultyChange(group.primary.id, fid); onFacultyChange(group.partner!.id, fid) }}
                    onDelete={() => { onDeleteEntry(group.primary.id); onDeleteEntry(group.partner!.id) }}
                    onActiveWeekdaysChange={ids => { onActiveWeekdaysChange(group.primary.id, ids); onActiveWeekdaysChange(group.partner!.id, ids) }}
                  />
                )}
              </div>
            )
          }
          const highlight = issueHighlightEntryIds?.has(group.primary.id) ? issueHighlightSeverity : null
          return (
            <div key={group.primary.id} style={wrapperStyle}>
              {viewMode ? (
                <ViewSectionCard
                  entry={group.primary}
                  course={course}
                  allFaculty={allFaculty}
                  tableWeekdays={tableWeekdays}
                  dimmed={isEntryDimmed(group.primary)}
                  issueHighlightSeverity={highlight}
                  fontPx={fontPx}
                  timeSlots={timeSlots}
                />
              ) : (
                <ScheduledSectionCard
                  entry={group.primary}
                  course={course}
                  allFaculty={allFaculty}
                  tableWeekdays={tableWeekdays}
                  dimmed={isEntryDimmed(group.primary)}
                  isLoggedIn={isLoggedIn}
                  issueHighlightSeverity={highlight}
                  onFacultyChange={fid => onFacultyChange(group.primary.id, fid)}
                  onDelete={() => onDeleteEntry(group.primary.id)}
                  onActiveWeekdaysChange={ids => onActiveWeekdaysChange(group.primary.id, ids)}
                />
              )}
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
  forceHideUnused = false, cellWidth = DEFAULT_CELL_WIDTH, cellHeight = DEFAULT_CELL_HEIGHT,
  viewMode = false, fontScale = 1,
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
  // Uniform column width/height for all room cells — the same values are
  // passed to every ScheduleTableView instance on the page so tables don't
  // each auto-size to their own content independently.
  cellWidth?: number
  cellHeight?: number
  // View tab only (feedback_48): uniform-font, plain-text, centered cards.
  viewMode?: boolean
  fontScale?: number
}) {
  const [hideUnusedState, setHideUnusedState] = useState(false)
  const hideUnused = forceHideUnused || hideUnusedState

  // Every card on the page shares this exact size — computed once from
  // cellWidth/cellHeight alone (see computeUniformFontSize), then scaled by
  // the user's fontScale. Not memoized on content, so it can't vary card to
  // card the way a per-card fit would.
  const fontPx = useMemo(() => computeUniformFontSize(cellWidth, cellHeight) * fontScale, [cellWidth, cellHeight, fontScale])

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
      {/* overflowY: 'hidden' (not just omitted) is required here — per the
          CSS overflow spec, a non-'visible' overflow-x forces overflow-y to
          also compute as 'auto' if left 'visible', which turns a wide
          table's horizontal scrollbar into a cascading vertical one too
          (the horizontal bar eats height, shrinking clientHeight below
          scrollHeight). height: 'max-content' is also required alongside it:
          with height left 'auto', Chromium's auto-height pass for a
          scrolling box doesn't fully account for the reserved horizontal
          scrollbar strip, so overflow-y: hidden ends up clipping a
          scrollbar's-width sliver off the bottom row. Pinning height to the
          content's own intrinsic size sidesteps that and keeps every row
          fully visible. */}
      <div style={{ overflowX: 'auto', overflowY: 'hidden', height: 'max-content' }}>
        {/* width: max-content — a plain auto-width table still stretches to
            fill its containing block per the CSS auto-table-layout spec
            whenever the container is wider than the table's natural content
            width. That silently inflated columns on tables with few rooms
            (they'd stretch to fill the page) while tables with many rooms
            stayed at their natural size — the actual source of "different
            cell sizes", not the font scale. max-content pins every table to
            its own intrinsic width (numColumns * cellWidth) instead. */}
        <table style={{ borderCollapse: 'collapse', width: 'max-content' }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 10px', textAlign: 'left', background: 'var(--bg-elevated)', fontSize: fs(11), border: '1px solid var(--border-color)', minWidth: 130 }}>Time Slot</th>
              {sortedRooms.map(r => (
                <th key={r.id} style={{ padding: '6px 10px', textAlign: 'left', background: 'var(--bg-elevated)', fontSize: fs(11), border: '1px solid var(--border-color)', minWidth: cellWidth }}>
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
                      cellWidth={cellWidth}
                      cellHeight={cellHeight}
                      viewMode={viewMode}
                      fontPx={fontPx}
                      timeSlots={timeSlots}
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
