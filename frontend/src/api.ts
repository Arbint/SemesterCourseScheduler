import axios from 'axios'

const TOKEN_KEY = 'scs_auth_token'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(config => {
  const token = getStoredToken()
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  r => r,
  err => {
    console.error('API error', err.response?.data || err.message)
    return Promise.reject(err)
  }
)

export default api

// --- Types ---

export type FullTimeOrPartTime = 'full_time' | 'part_time'
export type FacultyRank = 'instructor' | 'senior_instructor' | 'assistant_professor' | 'associate_professor' | 'professor_of_practice' | 'professor'
export type SemesterName = 'fall' | 'spring' | 'summer'
export type WeekdayName = 'mon' | 'tue' | 'wed' | 'thu' | 'fri'

export interface Faculty {
  id: number
  first_name: string
  last_name: string
  full_time_or_part_time: FullTimeOrPartTime
  tags: string[]
  office: string | null
  is_department_owned: boolean
  rank: FacultyRank | null
  attribute_ids: number[]
}

export interface LoadSettings {
  fulltime_load: number
  parttime_load: number
  min_office_hours_fulltime: number
  min_office_hours_parttime: number
}

export interface Semester {
  id: number
  name: SemesterName
}

export interface Weekday {
  id: number
  name: WeekdayName
  display_order: number
}

export interface TimeSlot {
  id: number
  label: string
  start_time: string
  end_time: string
  display_order: number
}

export interface Room {
  id: number
  building_name: string | null
  room_number: string
  building_code: string
  capacity: number
  is_online: boolean
  is_department_owned: boolean
  display_label: string
}

export interface Course {
  id: number
  dept_code: string
  course_number: number
  course_name: string
  duration_minutes: number
  capacity: number
  frequency: number
  semester_ids: number[]
  scheduled_entry_count: number
  taught_with_partner_ids: number[]
}

export interface TaughtWithGroup {
  id: number
  course_ids: number[]
}

export interface CoReqGroup {
  id: number
  course_ids: number[]
}

export interface TermTaughtWithGroup {
  id: number
  term_id: number
  course_ids: number[]
}

export interface Term {
  id: number
  semester_id: number
  year: number
  name: string
  semester_name: string
}

export function termLabel(t: Term): string {
  const base = `${t.semester_name.charAt(0).toUpperCase() + t.semester_name.slice(1)} ${t.year}`
  return t.name ? `${base} ${t.name}` : base
}

export interface ScheduleTable {
  id: number
  term_id: number
  weekday_ids: number[]
  entry_ids: number[]
}

export interface ScheduleEntry {
  id: number
  term_id: number
  schedule_table_id: number | null
  // Exactly one of course_id / meeting_id is set.
  course_id: number | null
  meeting_id: number | null
  section: number
  room_id: number | null
  faculty_id: number | null
  time_slot_ids: number[]
  active_weekday_ids: number[]
}

export interface Meeting {
  id: number
  term_id: number
  name: string
  duration_minutes: number
  frequency: number
}

export interface OfficeHour {
  id: number
  term_id: number
  faculty_id: number
  weekday_id: number
  start_time: string
  end_time: string
}

export interface IssueItem {
  description: string
  courses: number[]
  entries: number[]
}

export interface EntryWithWarnings {
  entry: ScheduleEntry
  additional_entries: ScheduleEntry[]
  errors: IssueItem[]
  warnings: IssueItem[]
}

export interface ChatTraceStep {
  type: 'text' | 'tool_call'
  text?: string
  name?: string
  input?: Record<string, unknown>
  result?: string
  is_error?: boolean
}

export interface ChatDonePayload {
  text: string
  highlighted_course_ids: number[]
  proposal: {
    proposal_id: string
    description: string
    changes: object[]
  } | null
}

// --- API functions ---

// Shared by both PDF export URL builders — every field in PrintConfig maps
// 1:1 to a backend query param name.
export function printConfigParams(config: PrintConfig): Record<string, string> {
  return {
    header_layout: config.header_layout,
    info_layout: config.info_layout,
    header_scale: String(config.header_scale),
    footer_scale: String(config.footer_scale),
    page_size: config.page_size,
    orientation: config.orientation,
    custom_width_in: String(config.custom_width_in),
    custom_height_in: String(config.custom_height_in),
    header_padding_in: String(config.header_padding_in),
    info_padding_in: String(config.info_padding_in),
    name_font_scale: String(config.name_font_scale),
    info_font_scale: String(config.info_font_scale),
    semester_font_scale: String(config.semester_font_scale),
    table_font_scale: String(config.table_font_scale),
    icon_scale: String(config.icon_scale),
  }
}

export const facultyApi = {
  list: () => api.get<Faculty[]>('/faculty').then(r => r.data),
  create: (d: Omit<Faculty, 'id' | 'attribute_ids'>) => api.post<Faculty>('/faculty', d).then(r => r.data),
  update: (id: number, d: Omit<Faculty, 'id' | 'attribute_ids'>) => api.put<Faculty>(`/faculty/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/faculty/${id}`),
  getCourses: (id: number) => api.get<Course[]>(`/faculty/${id}/courses`).then(r => r.data),
  addCourse: (fid: number, cid: number) => api.post(`/faculty/${fid}/courses/${cid}`),
  removeCourse: (fid: number, cid: number) => api.delete(`/faculty/${fid}/courses/${cid}`),
  addAttribute: (fid: number, attributeId: number) => api.post(`/faculty/${fid}/attributes/${attributeId}`),
  removeAttribute: (fid: number, attributeId: number) => api.delete(`/faculty/${fid}/attributes/${attributeId}`),
  schedulePdfUrl: (facultyId: number, termId: number, config: PrintConfig) => {
    const params = new URLSearchParams({ term_id: String(termId), ...printConfigParams(config) })
    return `/api/faculty/${facultyId}/schedule-pdf?${params.toString()}`
  },
}

export interface FacultyAttribute {
  id: number
  name: string
  has_icon: boolean
}

export const facultyAttributesApi = {
  list: () => api.get<FacultyAttribute[]>('/faculty-attributes').then(r => r.data),
  create: (name: string) => api.post<FacultyAttribute>('/faculty-attributes', { name }).then(r => r.data),
  update: (id: number, name: string) => api.put<FacultyAttribute>(`/faculty-attributes/${id}`, { name }).then(r => r.data),
  delete: (id: number) => api.delete(`/faculty-attributes/${id}`),
  uploadIcon: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/faculty-attributes/${id}/icon`, form)
  },
  removeIcon: (id: number) => api.delete(`/faculty-attributes/${id}/icon`),
  iconUrl: (id: number) => `/api/faculty-attributes/${id}/icon`,
}

export const coursesApi = {
  list: (semester?: string) => api.get<Course[]>('/courses', { params: semester ? { semester } : {} }).then(r => r.data),
  create: (d: Omit<Course, 'id' | 'semester_ids'>) => api.post<Course>('/courses', d).then(r => r.data),
  update: (id: number, d: Omit<Course, 'id' | 'semester_ids'>) => api.put<Course>(`/courses/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/courses/${id}`),
  addSemester: (cid: number, sid: number) => api.post(`/courses/${cid}/semesters/${sid}`),
  removeSemester: (cid: number, sid: number) => api.delete(`/courses/${cid}/semesters/${sid}`),
  getOfferingRemovalImpact: (cid: number, sid: number) =>
    api.get<{ affected_terms: { term_id: number; term_label: string; entry_count: number; scheduled_count: number }[] }>(
      `/courses/${cid}/semesters/${sid}/impact`
    ).then(r => r.data),
}

export const roomsApi = {
  list: () => api.get<Room[]>('/rooms').then(r => r.data),
  create: (d: Omit<Room, 'id' | 'display_label'>) => api.post<Room>('/rooms', d).then(r => r.data),
  update: (id: number, d: Omit<Room, 'id' | 'display_label'>) => api.put<Room>(`/rooms/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/rooms/${id}`),
}

export const timeSlotsApi = {
  list: () => api.get<TimeSlot[]>('/timeslots').then(r => r.data),
  create: (d: Omit<TimeSlot, 'id'>) => api.post<TimeSlot>('/timeslots', d).then(r => r.data),
  update: (id: number, d: Omit<TimeSlot, 'id'>) => api.put<TimeSlot>(`/timeslots/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/timeslots/${id}`),
}

export const semestersApi = {
  list: () => api.get<Semester[]>('/semesters').then(r => r.data),
}

export const weekdaysApi = {
  list: () => api.get<Weekday[]>('/weekdays').then(r => r.data),
}

export const constraintsApi = {
  listTaughtWith: () => api.get<TaughtWithGroup[]>('/taughtwith').then(r => r.data),
  createTaughtWith: () => api.post<TaughtWithGroup>('/taughtwith').then(r => r.data),
  deleteTaughtWith: (id: number) => api.delete(`/taughtwith/${id}`),
  addTaughtWithCourse: (gid: number, cid: number) => api.post(`/taughtwith/${gid}/courses/${cid}`),
  removeTaughtWithCourse: (gid: number, cid: number) => api.delete(`/taughtwith/${gid}/courses/${cid}`),

  listCoReq: () => api.get<CoReqGroup[]>('/coreq').then(r => r.data),
  createCoReq: () => api.post<CoReqGroup>('/coreq').then(r => r.data),
  deleteCoReq: (id: number) => api.delete(`/coreq/${id}`),
  addCoReqCourse: (gid: number, cid: number) => api.post(`/coreq/${gid}/courses/${cid}`),
  removeCoReqCourse: (gid: number, cid: number) => api.delete(`/coreq/${gid}/courses/${cid}`),
}

export const termsApi = {
  list: () => api.get<Term[]>('/terms').then(r => r.data),
  create: (d: { semester_id: number; year: number; name?: string; duplicate_from_id?: number | null }) =>
    api.post<Term>('/terms', d).then(r => r.data),
  rename: (id: number, name: string) => api.patch<Term>(`/terms/${id}`, { name }).then(r => r.data),
  delete: (id: number) => api.delete(`/terms/${id}`),
}

export const termTaughtWithApi = {
  list: (termId: number) => api.get<TermTaughtWithGroup[]>(`/terms/${termId}/taughtwith`).then(r => r.data),
  create: (termId: number, course_ids: number[]) =>
    api.post<TermTaughtWithGroup>(`/terms/${termId}/taughtwith`, { course_ids }).then(r => r.data),
  delete: (termId: number, groupId: number) => api.delete(`/terms/${termId}/taughtwith/${groupId}`),
}

export const tablesApi = {
  list: (termId: number) => api.get<ScheduleTable[]>(`/terms/${termId}/tables`).then(r => r.data),
  create: (termId: number, weekday_ids: number[]) =>
    api.post<ScheduleTable>(`/terms/${termId}/tables`, { weekday_ids }).then(r => r.data),
  update: (id: number, weekday_ids: number[]) =>
    api.put<ScheduleTable>(`/tables/${id}`, { weekday_ids }).then(r => r.data),
  delete: (id: number) => api.delete(`/tables/${id}`),
}

export const entriesApi = {
  listByTerm: (termId: number) => api.get<ScheduleEntry[]>(`/terms/${termId}/entries`).then(r => r.data),
  listByTable: (tableId: number) => api.get<ScheduleEntry[]>(`/tables/${tableId}/entries`).then(r => r.data),
  // Provide exactly one of course_id / meeting_id.
  create: (tableId: number, d: { course_id?: number; meeting_id?: number; room_id?: number; time_slot_ids: number[]; faculty_id?: number; active_weekday_ids?: number[] }) =>
    api.post<EntryWithWarnings>(`/tables/${tableId}/entries`, d).then(r => r.data),
  update: (id: number, d: { room_id?: number; time_slot_ids?: number[]; schedule_table_id?: number; faculty_id?: number; active_weekday_ids?: number[] }) =>
    api.put<EntryWithWarnings>(`/entries/${id}`, d).then(r => r.data),
  patchFaculty: (id: number, faculty_id: number | null) =>
    api.patch<EntryWithWarnings>(`/entries/${id}/faculty`, { faculty_id }).then(r => r.data),
  delete: (id: number) => api.delete(`/entries/${id}`),
  patchSectionCount: (termId: number, courseId: number, count: number) =>
    api.patch(`/terms/${termId}/courses/${courseId}/section-count`, { count }),
}

export const meetingsApi = {
  list: (termId: number) => api.get<Meeting[]>(`/terms/${termId}/meetings`).then(r => r.data),
  create: (termId: number, d: { name: string; duration_minutes: number; frequency: number }) =>
    api.post<Meeting>(`/terms/${termId}/meetings`, d).then(r => r.data),
  update: (id: number, d: { name: string; duration_minutes: number; frequency: number }) =>
    api.put<Meeting>(`/meetings/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/meetings/${id}`),
}

export const officeHoursApi = {
  list: (termId: number) => api.get<OfficeHour[]>(`/terms/${termId}/office-hours`).then(r => r.data),
  create: (facultyId: number, d: { term_id: number; weekday_id: number; start_time: string; end_time: string }) =>
    api.post<OfficeHour>(`/faculty/${facultyId}/office-hours`, d).then(r => r.data),
  update: (id: number, d: { start_time: string; end_time: string }) =>
    api.put<OfficeHour>(`/office-hours/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/office-hours/${id}`),
}

export const doorTagAssetsApi = {
  upload: (kind: 'header' | 'footer', file: File) => {
    const form = new FormData()
    form.append('file', file)
    // Let the browser set Content-Type itself so it includes the multipart boundary.
    return api.post(`/door-tags/${kind}-image`, form)
  },
  remove: (kind: 'header' | 'footer') => api.delete(`/door-tags/${kind}-image`),
  exists: (kind: 'header' | 'footer') =>
    api.get(`/door-tags/${kind}-image`, { validateStatus: () => true }).then(r => r.status === 200),
  url: (kind: 'header' | 'footer') => `/api/door-tags/${kind}-image`,
}

export interface DoorTagSettings {
  department_empty_label: string
  shared_empty_label: string
}

export const doorTagSettingsApi = {
  get: () => api.get<DoorTagSettings>('/door-tags/settings').then(r => r.data),
  update: (d: DoorTagSettings) => api.put<DoorTagSettings>('/door-tags/settings', d).then(r => r.data),
}

// Mirrors facultyApi.schedulePdfUrl — shared by the Room Schedule tab's
// Export button and the Export Configuration preview (feedback_66).
export function doorTagPdfUrl(termId: number, roomId: number, emptyLabel: string, config: PrintConfig): string {
  const params = new URLSearchParams({
    term_id: String(termId), room_id: String(roomId), empty_label: emptyLabel,
    ...printConfigParams(config),
  })
  return `/api/door-tags/pdf?${params.toString()}`
}

// Shared between the Room Schedule and Faculty Schedule PDF exports
// (feedback_63/64). Two independent dropdowns reuse this same 8-option set:
// one for the header section's 3 items (header image / info text area /
// attribute icon area), one for the info text area's own internal lines.
export const PDF_LAYOUT_OPTIONS: { value: string; label: string }[] = [
  { value: 'vertical_center', label: 'Vertical Center' },
  { value: 'vertical_left', label: 'Vertical Left' },
  { value: 'vertical_right', label: 'Vertical Right' },
  { value: 'vertical_fill', label: 'Vertical Fill' },
  { value: 'horizontal_center', label: 'Horizontal Center' },
  { value: 'horizontal_left', label: 'Horizontal Left' },
  { value: 'horizontal_right', label: 'Horizontal Right' },
  { value: 'horizontal_fill', label: 'Horizontal Fill' },
]

export const PDF_PAGE_SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: 'letter', label: 'Letter (8.5 x 11 in)' },
  { value: 'legal', label: 'Legal (8.5 x 14 in)' },
  { value: 'tabloid', label: 'Tabloid (11 x 17 in)' },
  { value: 'a4', label: 'A4' },
  { value: 'a3', label: 'A3' },
  { value: 'custom', label: 'Custom Size' },
]

export const PDF_ORIENTATION_OPTIONS: { value: string; label: string }[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
]

// One "Export Configuration" snapshot (feedback_64) — everything needed to
// reproduce a PDF export's page/layout settings, shared by both exports.
export interface PrintConfig {
  header_layout: string
  info_layout: string
  header_scale: number
  footer_scale: number
  page_size: string
  orientation: string
  custom_width_in: number
  custom_height_in: number
  // Gap (inches) between items under their respective layout, only used —
  // and only shown in the UI — when that layout isn't one of the two Fill
  // options (feedback_65).
  header_padding_in: number
  info_padding_in: number
  // Scale multipliers (feedback_66) on top of each element's base point
  // size, same convention as header_scale/footer_scale above. icon_scale
  // only affects the Faculty Schedule export (rooms have no attribute icons).
  name_font_scale: number
  info_font_scale: number
  semester_font_scale: number
  table_font_scale: number
  icon_scale: number
}

// A layout's own "align" half controls Fill vs not; independent of axis.
export const isFillLayout = (layout: string) => layout.endsWith('_fill')

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  header_layout: 'vertical_center',
  info_layout: 'vertical_center',
  header_scale: 1,
  footer_scale: 1,
  page_size: 'tabloid',
  orientation: 'portrait',
  custom_width_in: 11,
  custom_height_in: 17,
  header_padding_in: 0.2,
  info_padding_in: 0.1,
  name_font_scale: 1,
  info_font_scale: 1,
  semester_font_scale: 1,
  table_font_scale: 1,
  icon_scale: 1,
}

export interface PdfLayoutPreset {
  id: number
  name: string
  config: PrintConfig
}

export const pdfPresetsApi = {
  list: () => api.get<PdfLayoutPreset[]>('/pdf-presets').then(r => r.data),
  create: (name: string, config: PrintConfig) => api.post<PdfLayoutPreset>('/pdf-presets', { name, config }).then(r => r.data),
  delete: (id: number) => api.delete(`/pdf-presets/${id}`),
}

export interface FacultyCourseLoad {
  display: string
  sections: number
  credit_hours: number
  total_credit_hours: number
}

export interface FacultyLoad {
  faculty_id: number
  name: string
  full_time_or_part_time: string
  full_load: number
  courses: FacultyCourseLoad[]
  total_sections: number
  total_credit_hours: number
}

export const loadApi = {
  getTermLoad: (termId: number) => api.get<FacultyLoad[]>(`/terms/${termId}/load`).then(r => r.data),
}

export const auditApi = {
  auditTerm: (termId: number) =>
    api.get<{ errors: IssueItem[]; warnings: IssueItem[] }>(`/terms/${termId}/audit`).then(r => r.data),
}

export const loadSettingsApi = {
  get: () => api.get<LoadSettings>('/load-settings').then(r => r.data),
  update: (d: LoadSettings) => api.put<LoadSettings>('/load-settings', d).then(r => r.data),
}

export const chatApi = {
  // Streams the agent's response over SSE: each trace step (interim text /
  // tool call) fires onStep the moment it happens, then onDone fires once
  // with the final answer. onError fires on any failure (network or agent).
  sendStream: async (
    termId: number, message: string, session_id: string,
    onStep: (step: ChatTraceStep) => void,
    onDone: (payload: ChatDonePayload) => void,
    onError: (message: string) => void,
  ) => {
    let res: Response
    try {
      const token = getStoredToken()
      res = await fetch(`/api/terms/${termId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message, session_id }),
      })
    } catch {
      onError('Network error')
      return
    }
    if (!res.ok || !res.body) {
      onError(`Agent error (${res.status})`)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const line = rawEvent.split('\n').find(l => l.startsWith('data: '))
        if (!line) continue
        const payload = JSON.parse(line.slice(6))
        if (payload.type === 'error') onError(payload.error || 'Agent error')
        else if (payload.type === 'done') onDone(payload)
        else onStep(payload)
      }
    }
  },
  approveProposal: (proposalId: string) => api.post(`/chat/proposals/${proposalId}/approve`).then(r => r.data),
  rejectProposal: (proposalId: string) => api.post(`/chat/proposals/${proposalId}/reject`),
}

// --- Change List (feedback_42) ---

export interface ChangeListRow {
  row_key: string
  term_num: number | string | null
  start_date: string | null
  end_date: string | null
  crn: number | null
  subject: string | null
  course_number: number | string | null
  section: number | string | null
  course_title: string | null
  type: string | null
  inst_method: string | null
  instructor: string | null
  secondary_instructor: string | null
  hours: number | null
  enrollment_max: number | null
  waitlist_cap: number | null
  begin: number | null
  end: number | null
  days: string | null
  bldg: string | null
  rm: string | null
  course_comments: string | null
  prerequisite: string | null
  fee_detail: string | null
  fee_amount: string | null
  sig_code: string | null
  sig_required: string | null
}

export type ChangeListStatus = 'keep' | 'changed' | 'delete' | 'add'

export interface ComputedChangeListRow {
  row_key: string
  status: ChangeListStatus
  changed_fields: string[]
  values: ChangeListRow
  original_enrollment_max: number | null
}

export interface ChangeListParseResult {
  departments: string[]
  sheets: Record<string, ChangeListRow[]>
}

export interface ChangeListComputeRequest {
  term_id: number
  department: string
  old_rows: ChangeListRow[]
  enrollment_overrides: Record<string, number>
}

export const changeListApi = {
  parseDraft: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    // Let the browser set Content-Type itself so it includes the multipart boundary.
    return api.post<ChangeListParseResult>('/change-list/parse', form).then(r => r.data)
  },
  compute: (payload: ChangeListComputeRequest) =>
    api.post<{ rows: ComputedChangeListRow[] }>('/change-list/compute', payload).then(r => r.data.rows),
  exportXlsx: async (payload: ChangeListComputeRequest) => {
    const res = await api.post('/change-list/export', payload, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `change_list_${payload.department}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}

export interface AuthStatus {
  has_user: boolean
  logged_in: boolean
  username: string | null
}

export const authApi = {
  status: () => api.get<AuthStatus>('/auth/status').then(r => r.data),
  register: (username: string, password: string) => api.post('/auth/register', { username, password }),
  login: (username: string, password: string) =>
    api.post<{ token: string; username: string }>('/auth/login', { username, password }).then(r => {
      setStoredToken(r.data.token)
      return r.data
    }),
  logout: () => api.post('/auth/logout').then(r => { setStoredToken(null); return r }),
}
