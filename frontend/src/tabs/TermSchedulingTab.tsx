import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { DndContext, type DragEndEvent, useDraggable } from '@dnd-kit/core'
import {
  termsApi, tablesApi, entriesApi, coursesApi, roomsApi, timeSlotsApi,
  weekdaysApi, semestersApi, facultyApi, chatApi, termTaughtWithApi, auditApi, meetingsApi,
  termLabel,
  type Term, type ScheduleTable, type ScheduleEntry, type Course, type Meeting,
  type Room, type TimeSlot, type Weekday, type Semester, type Faculty,
  type IssueItem, type TermTaughtWithGroup, type ChatTraceStep
} from '../api'
import { showToast } from '../components/Toast'
import { FormModal } from '../components/FormModal'
import { useAuth } from '../contexts/AuthContext'
import { TermSelector } from '../components/TermSelector'
import { ScheduleTableView, ColumnResizer } from '../components/ScheduleGrid'
import { FilterBar, entryMatchesFilters, type ActiveFilter } from '../components/FilterBar'
import { useUndoStack } from '../hooks/useUndoStack'

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

// --- Draggable Meeting Card (from Meetings List) ---
function DraggableMeetingCard({
  meeting, isScheduled, isLoggedIn, onDeleteMeeting, onEditMeeting,
}: {
  meeting: Meeting
  isScheduled: boolean
  isLoggedIn: boolean
  onDeleteMeeting: () => void
  onEditMeeting: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `meeting-${meeting.id}`,
    data: { type: 'meeting', meeting_id: meeting.id },
    disabled: !isLoggedIn || isScheduled,
  })

  return (
    <div
      ref={setNodeRef}
      {...(isLoggedIn && !isScheduled ? listeners : {})}
      {...attributes}
      style={{
        background: 'var(--bg-surface)',
        border: isScheduled ? '1px solid var(--success)' : '2px solid var(--accent)',
        borderRadius: 'var(--border-radius)',
        padding: '10px 12px',
        marginBottom: 8,
        cursor: isLoggedIn && !isScheduled ? 'grab' : 'default',
        opacity: isDragging ? 0.5 : 1,
        transition: 'opacity 0.15s',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meeting</div>
      <div style={{ color: 'var(--text-bright)', fontSize: 13, marginTop: 2 }}>{meeting.name}</div>
      <div style={{ fontSize: 11, marginTop: 4, color: isScheduled ? 'var(--success)' : 'var(--text-secondary)' }}>
        {isScheduled ? 'Scheduled' : 'Not scheduled'}
      </div>
      {isLoggedIn && (
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onEditMeeting() }}
            title="Edit meeting"
            style={{
              background: 'transparent', color: 'var(--text-secondary)',
              border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: 1
            }}
          >Edit</button>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onDeleteMeeting() }}
            title="Delete meeting"
            style={{
              background: 'transparent', color: 'var(--text-secondary)',
              border: 'none', cursor: 'pointer', fontSize: 13, lineHeight: 1
            }}
          >×</button>
        </div>
      )}
    </div>
  )
}

// Pretty-print a tool call's JSON result for the Thinking panel; falls back
// to the raw string when it isn't valid JSON (e.g. truncated payloads).
function formatToolResult(result?: string): string {
  if (!result) return ''
  try {
    return JSON.stringify(JSON.parse(result), null, 2)
  } catch {
    return result
  }
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
  type ChatMsg = { role: 'user' | 'agent'; text: string; proposal?: any; trace?: ChatTraceStep[]; pending?: boolean }
  const sessionId = useRef(Math.random().toString(36).slice(2))
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Mutates only the last (agent) message in place — safe because sends are
  // serialized: the input is disabled until the previous stream finishes.
  const patchLastMessage = (patch: (msg: ChatMsg) => Partial<ChatMsg>) => {
    setMessages(m => {
      const copy = [...m]
      copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch(copy[copy.length - 1]) }
      return copy
    })
  }

  const send = async () => {
    if (!input.trim() || sending) return
    const msg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', text: msg }, { role: 'agent', text: '', trace: [], pending: true }])
    setSending(true)
    try {
      await chatApi.sendStream(
        termId, msg, sessionId.current,
        step => patchLastMessage(cur => ({ trace: [...(cur.trace || []), step] })),
        done => {
          patchLastMessage(() => ({ text: done.text, proposal: done.proposal, pending: false }))
          if (done.highlighted_course_ids.length) onHighlight(done.highlighted_course_ids)
        },
        errMsg => {
          showToast(errMsg || 'Agent error')
          patchLastMessage(() => ({ text: '_(agent error — see above)_', pending: false }))
        },
      )
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
            {m.role === 'agent' && (m.pending || (m.trace && m.trace.length > 0)) && (
              <details open={m.pending || undefined} style={{
                maxWidth: '85%', marginBottom: 6, fontSize: 11,
                background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius)', padding: '4px 8px',
              }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', userSelect: 'none' }}>
                  {m.pending
                    ? (m.trace?.length ? `Thinking (${m.trace.length} step${m.trace.length === 1 ? '' : 's'})…` : 'Thinking…')
                    : `Thought for ${m.trace?.length || 0} step${(m.trace?.length || 0) === 1 ? '' : 's'}`}
                </summary>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(m.trace || []).map((step, si) => step.type === 'text' ? (
                    <div key={si} style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{step.text}</div>
                  ) : (
                    <div key={si} style={{
                      border: `1px solid ${step.is_error ? 'var(--error)' : 'var(--border-color)'}`,
                      borderRadius: 4, padding: '6px 8px', fontFamily: 'monospace',
                    }}>
                      <div style={{ color: step.is_error ? 'var(--error)' : 'var(--cyan)' }}>
                        {step.is_error ? '✕ ' : ''}{step.name}(<span style={{ color: 'var(--text-secondary)' }}>{JSON.stringify(step.input)}</span>)
                      </div>
                      <pre style={{
                        margin: '4px 0 0', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        maxHeight: 160, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 3, padding: '4px 6px',
                      }}>
                        {formatToolResult(step.result)}
                      </pre>
                    </div>
                  ))}
                  {m.pending && (
                    <div style={{ color: 'var(--text-secondary)' }}>…</div>
                  )}
                </div>
              </details>
            )}
            {(!m.pending || m.text) && (
            <div style={{
              background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
              color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
              borderRadius: 'var(--border-radius)', padding: '8px 12px',
              maxWidth: '85%', fontSize: 13, lineHeight: 1.5,
            }}>
              {m.role === 'user' ? (
                <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ children }) => (
                      <table style={{ borderCollapse: 'collapse', fontSize: 12, margin: '6px 0', width: '100%' }}>{children}</table>
                    ),
                    th: ({ children }) => (
                      <th style={{ border: '1px solid var(--border-color)', padding: '4px 8px', background: 'var(--bg-surface)', textAlign: 'left' }}>{children}</th>
                    ),
                    td: ({ children }) => (
                      <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px' }}>{children}</td>
                    ),
                    p: ({ children }) => <p style={{ margin: '4px 0' }}>{children}</p>,
                    code: ({ children }) => <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: 3, fontSize: 11 }}>{children}</code>,
                  }}
                >
                  {m.text}
                </ReactMarkdown>
              )}
            </div>
            )}
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
export function TermSchedulingTab() {
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
  const [auditLoading, setAuditLoading] = useState(false)
  const [issueHighlight, setIssueHighlight] = useState<{ key: string, entryIds: number[], severity: 'error' | 'warning' } | null>(null)
  const [highlightedIds, setHighlightedIds] = useState<number[]>([])
  const [neededSections, setNeededSections] = useState<Map<number, number>>(new Map())
  const [showNewTermModal, setShowNewTermModal] = useState(false)
  const [newTermForm, setNewTermForm] = useState<{ semester_id: number; year: number; name: string; duplicate_from_id: number | null }>(
    { semester_id: 0, year: new Date().getFullYear(), name: '', duplicate_from_id: null }
  )
  const [savingTerm, setSavingTerm] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameForm, setRenameForm] = useState('')
  const [savingRename, setSavingRename] = useState(false)
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([])
  const [termTaughtWith, setTermTaughtWith] = useState<TermTaughtWithGroup[]>([])
  const [showTermTWModal, setShowTermTWModal] = useState(false)
  const [termTWForm, setTermTWForm] = useState<number[]>([0, 0])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [showMeetingModal, setShowMeetingModal] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null)
  const [meetingForm, setMeetingForm] = useState({ name: '', duration_minutes: 75, frequency: 2 })
  const [savingMeeting, setSavingMeeting] = useState(false)
  const undoStack = useUndoStack()
  const courseMap = new Map(courses.map(c => [c.id, c]))
  const meetingMap = new Map(meetings.map(m => [m.id, m]))

  // Combined partner map: global (from course.taught_with_partner_ids) + per-term
  const effectivePartnerIds = new Map<number, number[]>()
  // Combined lead map: which course_id is the group's lead — always displayed
  // first when two TaughtWith partners land in the same cell (feedback_80).
  const effectiveLeadId = new Map<number, number>()
  for (const c of courses) {
    const partners = [...c.taught_with_partner_ids]
    if (c.taught_with_lead_id != null) effectiveLeadId.set(c.id, c.taught_with_lead_id)
    for (const g of termTaughtWith) {
      if (g.course_ids.includes(c.id)) {
        for (const pid of g.course_ids) {
          if (pid !== c.id && !partners.includes(pid)) partners.push(pid)
        }
        if (g.lead_course_id != null) effectiveLeadId.set(c.id, g.lead_course_id)
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

    const [tbs, ents, cs, ttw, mts, needed] = await Promise.all([
      tablesApi.list(termId),
      entriesApi.listByTerm(termId),
      coursesApi.list(termData.semester_name),
      termTaughtWithApi.list(termId),
      meetingsApi.list(termId),
      entriesApi.getSectionsNeeded(termId),
    ])
    setTables(tbs)
    setEntries(ents)
    setCourses(cs)
    setTermTaughtWith(ttw)
    setMeetings(mts)

    // Init needed sections map — prefer the persisted target (set via the
    // spin box); a course that's never had one set falls back to however
    // many entries already exist for it, same as before (feedback_79).
    const map = new Map<number, number>()
    for (const c of cs) {
      const courseEntries = ents.filter(e => e.course_id === c.id)
      map.set(c.id, needed[c.id] ?? Math.max(1, courseEntries.length))
    }
    setNeededSections(map)
  }

  useEffect(() => {
    loadStatic().then(async ({ terms: t }) => {
      if (t.length) {
        setSelectedTermId(t[0].id)
        await loadTerm(t[0].id, t[0])
        await refreshAudit(t[0].id)
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
    setIssueHighlight(null)
    setHighlightedIds([])
    setTermTaughtWith([])
    undoStack.clear()
    await loadTerm(id, term)
    await refreshAudit(id)
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
      setNewTermForm({ semester_id: 0, year: new Date().getFullYear(), name: '', duplicate_from_id: null })
      undoStack.clear()
      await loadTerm(term.id, term)
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Create term failed')
    } finally { setSavingTerm(false) }
  }

  const renameTerm = async () => {
    if (!selectedTermId) return
    setSavingRename(true)
    try {
      const updated = await termsApi.rename(selectedTermId, renameForm.trim())
      setTerms(prev => prev.map(t => t.id === updated.id ? updated : t))
      setShowRenameModal(false)
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Rename failed')
    } finally { setSavingRename(false) }
  }

  const handleTermDelete = async (termId: number) => {
    if (!window.confirm('Delete this term and all its schedule data? This cannot be undone.')) return
    try {
      await termsApi.delete(termId)
      const remaining = terms.filter(t => t.id !== termId)
      setTerms(remaining)
      if (selectedTermId === termId) {
        undoStack.clear()
        if (remaining.length > 0) {
          setSelectedTermId(remaining[0].id)
          loadTerm(remaining[0].id, remaining[0])
        } else {
          setSelectedTermId(null)
          setTables([])
          setEntries([])
          setCourses([])
          setMeetings([])
          setErrors([])
          setWarnings([])
          setIssueHighlight(null)
        }
      }
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to delete term')
    }
  }

  const refreshAudit = async (termId?: number) => {
    const id = termId ?? selectedTermId
    if (!id) return
    setAuditLoading(true)
    try {
      const result = await auditApi.auditTerm(id)
      setErrors(result.errors)
      setWarnings(result.warnings)
      setIssueHighlight(null)
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Audit failed')
    } finally {
      setAuditLoading(false)
    }
  }

  const handleUndo = async () => {
    const action = undoStack.stack[undoStack.stack.length - 1]
    if (!action) return
    undoStack.removeLast()
    try {
      await action.undo()
      showToast(`Undid: ${action.label}`, 'success')
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Undo failed — refreshing to stay in sync')
    } finally {
      refresh()
      refreshAudit()
    }
  }

  // Ctrl/Cmd+Z triggers the same undo, except while the user is actively
  // typing in a text field (so native input undo isn't hijacked).
  useEffect(() => {
    if (!isLoggedIn) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey) return
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      handleUndo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isLoggedIn, undoStack.stack])

  const addTable = async () => {
    if (!selectedTermId) return
    const table = await tablesApi.create(selectedTermId, [])
    setTables(prev => [...prev, table])
    undoStack.push({
      label: 'Add table',
      undo: async () => { await tablesApi.delete(table.id) },
    })
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
    const termId = selectedTermId
    const tableSnapshot = tables.find(t => t.id === tableId)
    const entrySnapshots = entries.filter(e => e.schedule_table_id === tableId)
    const meetingSnapshots = entrySnapshots.filter(e => e.meeting_id != null)
    const courseSnapshots = entrySnapshots.filter(e => e.meeting_id == null)

    // Deleting a table cascades and permanently destroys its entries — fine
    // for courses (a blank placeholder is auto-restored), but a meeting's
    // single entry must survive so the meeting stays re-schedulable, so
    // unschedule those in place *before* the table (and its cascade) goes.
    for (const me of meetingSnapshots) {
      await entriesApi.delete(me.id)
    }
    await tablesApi.delete(tableId)
    setTables(prev => prev.filter(t => t.id !== tableId))
    setEntries(prev => prev
      .filter(e => !(e.schedule_table_id === tableId && e.meeting_id == null))
      .map(e => e.schedule_table_id === tableId && e.meeting_id != null
        ? { ...e, schedule_table_id: null, room_id: null, faculty_id: null, time_slot_ids: [], active_weekday_ids: [] }
        : e
      )
    )

    if (tableSnapshot && termId) {
      undoStack.push({
        label: 'Delete table',
        undo: async () => {
          const newTable = await tablesApi.create(termId, tableSnapshot.weekday_ids)
          for (const es of courseSnapshots) {
            await entriesApi.create(newTable.id, {
              course_id: es.course_id ?? undefined,
              room_id: es.room_id ?? undefined,
              time_slot_ids: es.time_slot_ids,
              faculty_id: es.faculty_id ?? undefined,
              active_weekday_ids: es.active_weekday_ids,
            })
          }
          for (const es of meetingSnapshots) {
            await entriesApi.update(es.id, {
              schedule_table_id: newTable.id,
              room_id: es.room_id ?? undefined,
              time_slot_ids: es.time_slot_ids,
            })
          }
        },
      })
    }
  }

  const saveMeeting = async () => {
    if (!selectedTermId || !meetingForm.name.trim()) return
    setSavingMeeting(true)
    try {
      if (editingMeeting) {
        await meetingsApi.update(editingMeeting.id, {
          name: meetingForm.name.trim(),
          duration_minutes: meetingForm.duration_minutes,
          frequency: meetingForm.frequency,
        })
      } else {
        await meetingsApi.create(selectedTermId, {
          name: meetingForm.name.trim(),
          duration_minutes: meetingForm.duration_minutes,
          frequency: meetingForm.frequency,
        })
      }
      await loadTerm(selectedTermId)
      setShowMeetingModal(false)
      setEditingMeeting(null)
      setMeetingForm({ name: '', duration_minutes: 75, frequency: 2 })
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to save meeting')
    } finally { setSavingMeeting(false) }
  }

  // No undo — this deletes the meeting definition itself, not a drag/drop.
  const deleteMeetingDefinition = async (meetingId: number) => {
    if (!confirm('Delete this meeting for the term?')) return
    try {
      await meetingsApi.delete(meetingId)
      setMeetings(prev => prev.filter(m => m.id !== meetingId))
      setEntries(prev => prev.filter(e => e.meeting_id !== meetingId))
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to delete meeting')
    }
  }

  const handleFacultyChange = async (entryId: number, facultyId: number | null) => {
    const prevFacultyId = entries.find(e => e.id === entryId)?.faculty_id ?? null
    try {
      const { entry: updated, errors: errs, warnings: warns } = await entriesApi.patchFaculty(entryId, facultyId)
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, faculty_id: updated.faculty_id } : e))
      setErrors(errs)
      setWarnings(warns)
      if (prevFacultyId !== facultyId) {
        undoStack.push({
          label: 'Change instructor',
          undo: async () => { await entriesApi.patchFaculty(entryId, prevFacultyId) },
        })
      }
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to assign instructor')
    }
  }

  const handleSectionNumberChange = async (entryId: number, section: number) => {
    const prevSection = entries.find(e => e.id === entryId)?.section
    try {
      const { entry: updated, errors: errs, warnings: warns } = await entriesApi.update(entryId, { section })
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, section: updated.section } : e))
      setErrors(errs)
      setWarnings(warns)
      if (prevSection !== undefined && prevSection !== section) {
        undoStack.push({
          label: 'Change section number',
          undo: async () => { await entriesApi.update(entryId, { section: prevSection }) },
        })
      }
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to change section number')
    }
  }

  // A meeting has exactly one entry, no sections — the backend unschedules
  // it in place (the row survives) rather than deleting it, so it stays in
  // the Meetings List instead of vanishing. Mirror that locally.
  const unscheduleMeetingEntry = async (entryId: number) => {
    await entriesApi.delete(entryId)
    setEntries(prev => prev.map(e => e.id === entryId
      ? { ...e, schedule_table_id: null, room_id: null, faculty_id: null, time_slot_ids: [], active_weekday_ids: [] }
      : e
    ))
  }

  const handleDeleteEntry = async (entryId: number) => {
    const snapshot = entries.find(e => e.id === entryId)

    if (snapshot?.meeting_id != null) {
      const priorTableId = snapshot.schedule_table_id
      const priorRoomId = snapshot.room_id
      const priorSlotIds = snapshot.time_slot_ids
      await unscheduleMeetingEntry(entryId)
      if (priorTableId !== null) {
        undoStack.push({
          label: 'Remove meeting',
          undo: async () => {
            await entriesApi.update(entryId, {
              schedule_table_id: priorTableId,
              room_id: priorRoomId ?? undefined,
              time_slot_ids: priorSlotIds,
            })
          },
        })
      }
      return
    }

    await entriesApi.delete(entryId)
    setEntries(prev => prev.filter(e => e.id !== entryId))

    if (snapshot && snapshot.schedule_table_id !== null) {
      const tableId = snapshot.schedule_table_id
      undoStack.push({
        label: 'Remove course',
        undo: async () => {
          await entriesApi.create(tableId, {
            course_id: snapshot.course_id ?? undefined,
            room_id: snapshot.room_id ?? undefined,
            time_slot_ids: snapshot.time_slot_ids,
            faculty_id: snapshot.faculty_id ?? undefined,
            active_weekday_ids: snapshot.active_weekday_ids,
          })
        },
      })
    }
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

  const isEntryDimmed = (entry: ScheduleEntry): boolean =>
    entryMatchesFilters(
      entry,
      entry.course_id != null ? courseMap.get(entry.course_id) : undefined,
      tables.find(t => t.id === entry.schedule_table_id),
      activeFilters
    )

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
    const termId = selectedTermId
    const priorEntries = entries.filter(e => e.course_id === courseId)
    setNeededSections(prev => new Map(prev).set(courseId, count))
    try {
      await entriesApi.patchSectionCount(termId, courseId, count)
      await loadTerm(termId)
      undoStack.push({
        label: 'Change sections needed',
        undo: async () => {
          // Reconcile the course's entries back to the pre-change snapshot:
          // delete anything the increase added, recreate anything a decrease
          // deleted that was actually scheduled somewhere (a plain recount
          // can't resurrect the room/time/faculty), then top up any
          // remaining unscheduled slots via patchSectionCount.
          const currentAll = await entriesApi.listByTerm(termId)
          const current = currentAll.filter(e => e.course_id === courseId)
          const priorIds = new Set(priorEntries.map(e => e.id))
          for (const e of current) {
            if (!priorIds.has(e.id)) await entriesApi.delete(e.id)
          }
          const currentIds = new Set(current.map(e => e.id))
          for (const e of priorEntries) {
            if (currentIds.has(e.id) || e.schedule_table_id === null) continue
            await entriesApi.create(e.schedule_table_id, {
              course_id: e.course_id ?? undefined,
              room_id: e.room_id ?? undefined,
              time_slot_ids: e.time_slot_ids,
              faculty_id: e.faculty_id ?? undefined,
              active_weekday_ids: e.active_weekday_ids,
            })
          }
          await entriesApi.patchSectionCount(termId, courseId, priorEntries.length || 1)
        },
      })
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

        // Snapshot possible TaughtWith partners' prior placement before the
        // create call, since the backend may co-schedule/move them too.
        const partnerCourseIds = effectivePartnerIds.get(activeData.course_id) ?? []
        const partnerSnapshots = entries.filter(e => e.course_id != null && partnerCourseIds.includes(e.course_id))

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

        const newEntryId = result.entry.id
        const partnerResults = result.additional_entries
        undoStack.push({
          label: `Schedule ${course!.dept_code} ${course!.course_number}`,
          undo: async () => {
            await entriesApi.delete(newEntryId)
            for (const pe of partnerResults) {
              const prior = partnerSnapshots.find(p => p.id === pe.id)
              if (!prior) continue
              if (prior.schedule_table_id !== null) {
                await entriesApi.update(pe.id, {
                  schedule_table_id: prior.schedule_table_id,
                  room_id: prior.room_id ?? undefined,
                  time_slot_ids: prior.time_slot_ids,
                  active_weekday_ids: prior.active_weekday_ids,
                })
              } else {
                await entriesApi.delete(pe.id)
              }
            }
          },
        })
      } else if (activeData?.type === 'meeting') {
        const meeting = meetingMap.get(activeData.meeting_id)
        if (!meeting) return

        const slotsNeeded = Math.max(1, Math.round(meeting.duration_minutes / 75))
        const sortedSlots = [...timeSlots].sort((a, b) => a.display_order - b.display_order)
        const startIdx = sortedSlots.findIndex(ts => ts.id === time_slot_id)
        if (startIdx === -1) return
        const slotIds = sortedSlots.slice(startIdx, startIdx + slotsNeeded).map(ts => ts.id)

        const result = await entriesApi.create(table_id, {
          meeting_id: activeData.meeting_id,
          room_id,
          time_slot_ids: slotIds,
        })
        const newEntryId = result.entry.id
        setEntries(prev => prev.map(e => e.id === newEntryId ? result.entry : e))
        setErrors(result.errors)
        setWarnings(result.warnings)

        undoStack.push({
          label: `Schedule meeting: ${meeting.name}`,
          undo: async () => { await unscheduleMeetingEntry(newEntryId) },
        })
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
        const noOpMove = !tableChanged && existing.room_id === room_id
          && existing.time_slot_ids.length === slotIds.length
          && existing.time_slot_ids.every(id => slotIds.includes(id))

        // Snapshot this entry's + any TaughtWith partners' prior placement.
        const priorSelf = {
          schedule_table_id: existing.schedule_table_id,
          room_id: existing.room_id,
          time_slot_ids: existing.time_slot_ids,
          active_weekday_ids: existing.active_weekday_ids,
        }
        // Meetings have no course_id and never participate in TaughtWith pairing.
        const partnerCourseIds = existing.course_id ? (effectivePartnerIds.get(existing.course_id) ?? []) : []
        const partnerSnapshots = entries.filter(e => e.course_id != null && partnerCourseIds.includes(e.course_id))

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

        if (!noOpMove) {
          const partnerResults = result.additional_entries
          undoStack.push({
            label: existing.meeting_id != null ? 'Move meeting' : 'Move course',
            undo: async () => {
              await entriesApi.update(entryId, {
                schedule_table_id: priorSelf.schedule_table_id!,
                room_id: priorSelf.room_id ?? undefined,
                time_slot_ids: priorSelf.time_slot_ids,
                active_weekday_ids: priorSelf.active_weekday_ids,
              })
              for (const pe of partnerResults) {
                const prior = partnerSnapshots.find(p => p.id === pe.id)
                if (!prior) continue
                if (prior.schedule_table_id !== null) {
                  await entriesApi.update(pe.id, {
                    schedule_table_id: prior.schedule_table_id,
                    room_id: prior.room_id ?? undefined,
                    time_slot_ids: prior.time_slot_ids,
                    active_weekday_ids: prior.active_weekday_ids,
                  })
                } else {
                  await entriesApi.delete(pe.id)
                }
              }
            },
          })
        }
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
            onNew={() => {
              setNewTermForm({ semester_id: 0, year: new Date().getFullYear(), name: '', duplicate_from_id: null })
              setShowNewTermModal(true)
            }}
          />
          {selectedTermId && (
            <>
              {isLoggedIn && (
                <button
                  className="btn-secondary"
                  onClick={() => { setRenameForm(selectedTerm?.name ?? ''); setShowRenameModal(true) }}
                >
                  Rename
                </button>
              )}
              {isLoggedIn && (
                <button
                  className="btn-secondary"
                  onClick={handleUndo}
                  disabled={undoStack.stack.length === 0}
                  title={undoStack.stack.length ? `Undo: ${undoStack.stack[undoStack.stack.length - 1].label}` : undefined}
                >
                  Undo{undoStack.stack.length > 1 ? ` (${undoStack.stack.length})` : ''}
                </button>
              )}
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
              {isLoggedIn && (
                <button
                  className="btn-secondary"
                  onClick={() => { setEditingMeeting(null); setMeetingForm({ name: '', duration_minutes: 75, frequency: 2 }); setShowMeetingModal(true) }}
                >
                  Term Meetings
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

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 10px' }}>Meetings List</div>
            {meetings.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>No meetings for this term.</div>
            )}
            {meetings.map(m => {
              const meetingEntry = entries.find(e => e.meeting_id === m.id)
              return (
                <DraggableMeetingCard
                  key={m.id}
                  meeting={m}
                  isScheduled={meetingEntry?.schedule_table_id != null}
                  isLoggedIn={isLoggedIn}
                  onDeleteMeeting={() => deleteMeetingDefinition(m.id)}
                  onEditMeeting={() => {
                    setEditingMeeting(m)
                    setMeetingForm({ name: m.name, duration_minutes: m.duration_minutes, frequency: m.frequency })
                    setShowMeetingModal(true)
                  }}
                />
              )
            })}
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
                meetings={meetingMap}
                effectivePartnerIds={effectivePartnerIds}
                effectiveLeadId={effectiveLeadId}
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
                onSectionChange={handleSectionNumberChange}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issues</div>
              {selectedTermId && (
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => refreshAudit()}
                  disabled={auditLoading}
                  style={{ fontSize: 11, padding: '2px 8px' }}
                >
                  {auditLoading ? '...' : 'Refresh'}
                </button>
              )}
            </div>
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
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              placeholder="e.g. V1, V2-BetterLoads"
              value={newTermForm.name}
              onChange={e => setNewTermForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Duplicate From</label>
            <select
              value={newTermForm.duplicate_from_id ?? ''}
              onChange={e => setNewTermForm(f => ({ ...f, duplicate_from_id: e.target.value ? +e.target.value : null }))}
            >
              <option value="">None</option>
              {terms.map(t => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}
            </select>
          </div>
        </FormModal>
      )}

      {showRenameModal && selectedTerm && (
        <FormModal title="Rename Term" onClose={() => setShowRenameModal(false)} onSave={renameTerm} saving={savingRename}>
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. V1, V2-BetterLoads"
              value={renameForm}
              onChange={e => setRenameForm(e.target.value)}
            />
          </div>
        </FormModal>
      )}

      {showMeetingModal && selectedTermId && (
        <FormModal
          title={editingMeeting ? 'Edit Term Meeting' : 'New Term Meeting'}
          onClose={() => { setShowMeetingModal(false); setEditingMeeting(null) }}
          onSave={saveMeeting}
          saving={savingMeeting}
        >
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Faculty Senate"
              value={meetingForm.name}
              onChange={e => setMeetingForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Duration (minutes)</label>
              <input
                type="number"
                min={75}
                step={75}
                value={meetingForm.duration_minutes}
                onChange={e => setMeetingForm(f => ({ ...f, duration_minutes: +e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>Freq / week</label>
              <input
                type="number"
                min={1}
                max={5}
                value={meetingForm.frequency}
                onChange={e => setMeetingForm(f => ({ ...f, frequency: +e.target.value }))}
              />
            </div>
          </div>
        </FormModal>
      )}
    </DndContext>
  )
}
