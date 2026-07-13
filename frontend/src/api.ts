import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.response.use(
  r => r,
  err => {
    console.error('API error', err.response?.data || err.message)
    return Promise.reject(err)
  }
)

export default api

// --- Types ---

export type Rank = 'full_time' | 'part_time'
export type SemesterName = 'fall' | 'spring' | 'summer'
export type WeekdayName = 'mon' | 'tue' | 'wed' | 'thu' | 'fri'

export interface Faculty {
  id: number
  first_name: string
  last_name: string
  rank: Rank
  tags: string[]
  full_load: number
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
  label: string
  capacity: number
  is_online: boolean
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

export interface Term {
  id: number
  semester_id: number
  year: number
  semester_name: string
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
  course_id: number
  section: number
  room_id: number | null
  faculty_id: number | null
  time_slot_ids: number[]
  active_weekday_ids: number[]
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

export interface ChatResponse {
  text: string
  highlighted_course_ids: number[]
  proposal: {
    proposal_id: string
    description: string
    changes: object[]
  } | null
}

// --- API functions ---

export const facultyApi = {
  list: () => api.get<Faculty[]>('/faculty').then(r => r.data),
  create: (d: Omit<Faculty, 'id'>) => api.post<Faculty>('/faculty', d).then(r => r.data),
  update: (id: number, d: Omit<Faculty, 'id'>) => api.put<Faculty>(`/faculty/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/faculty/${id}`),
  getCourses: (id: number) => api.get<Course[]>(`/faculty/${id}/courses`).then(r => r.data),
  addCourse: (fid: number, cid: number) => api.post(`/faculty/${fid}/courses/${cid}`),
  removeCourse: (fid: number, cid: number) => api.delete(`/faculty/${fid}/courses/${cid}`),
}

export const coursesApi = {
  list: (semester?: string) => api.get<Course[]>('/courses', { params: semester ? { semester } : {} }).then(r => r.data),
  create: (d: Omit<Course, 'id' | 'semester_ids'>) => api.post<Course>('/courses', d).then(r => r.data),
  update: (id: number, d: Omit<Course, 'id' | 'semester_ids'>) => api.put<Course>(`/courses/${id}`, d).then(r => r.data),
  delete: (id: number) => api.delete(`/courses/${id}`),
  addSemester: (cid: number, sid: number) => api.post(`/courses/${cid}/semesters/${sid}`),
  removeSemester: (cid: number, sid: number) => api.delete(`/courses/${cid}/semesters/${sid}`),
}

export const roomsApi = {
  list: () => api.get<Room[]>('/rooms').then(r => r.data),
  create: (d: Omit<Room, 'id'>) => api.post<Room>('/rooms', d).then(r => r.data),
  update: (id: number, d: Omit<Room, 'id'>) => api.put<Room>(`/rooms/${id}`, d).then(r => r.data),
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
  create: (d: { semester_id: number; year: number }) => api.post<Term>('/terms', d).then(r => r.data),
  delete: (id: number) => api.delete(`/terms/${id}`),
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
  create: (tableId: number, d: { course_id: number; room_id?: number; time_slot_ids: number[]; faculty_id?: number; active_weekday_ids?: number[] }) =>
    api.post<EntryWithWarnings>(`/tables/${tableId}/entries`, d).then(r => r.data),
  update: (id: number, d: { room_id?: number; time_slot_ids?: number[]; schedule_table_id?: number; faculty_id?: number; active_weekday_ids?: number[] }) =>
    api.put<EntryWithWarnings>(`/entries/${id}`, d).then(r => r.data),
  patchFaculty: (id: number, faculty_id: number | null) =>
    api.patch<EntryWithWarnings>(`/entries/${id}/faculty`, { faculty_id }).then(r => r.data),
  delete: (id: number) => api.delete(`/entries/${id}`),
  patchSectionCount: (termId: number, courseId: number, count: number) =>
    api.patch(`/terms/${termId}/courses/${courseId}/section-count`, { count }),
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
  rank: string
  full_load: number
  courses: FacultyCourseLoad[]
  total_sections: number
  total_credit_hours: number
}

export const loadApi = {
  getTermLoad: (termId: number) => api.get<FacultyLoad[]>(`/terms/${termId}/load`).then(r => r.data),
}

export const chatApi = {
  send: (termId: number, message: string, session_id: string) =>
    api.post<ChatResponse>(`/terms/${termId}/chat`, { message, session_id }).then(r => r.data),
  approveProposal: (proposalId: string) => api.post(`/chat/proposals/${proposalId}/approve`).then(r => r.data),
  rejectProposal: (proposalId: string) => api.post(`/chat/proposals/${proposalId}/reject`),
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
    api.post<{ token: string; username: string }>('/auth/login', { username, password }).then(r => r.data),
  logout: () => api.post('/auth/logout'),
}
