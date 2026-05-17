import { useState, useEffect } from 'react'
import { constraintsApi, coursesApi, type TaughtWithGroup, type CoReqGroup, type Course } from '../api'
import { showToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'

function GroupPanel({
  title, groups, courses, isLoggedIn, onCreateGroup, onDeleteGroup, onAddCourse, onRemoveCourse
}: {
  title: string
  groups: { id: number; course_ids: number[] }[]
  courses: Course[]
  isLoggedIn: boolean
  onCreateGroup: () => void
  onDeleteGroup: (id: number) => void
  onAddCourse: (gid: number, cid: number) => void
  onRemoveCourse: (gid: number, cid: number) => void
}) {
  const [addingFor, setAddingFor] = useState<number | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<string>('')

  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]))

  const handleAdd = (gid: number) => {
    const cid = +selectedCourse
    if (!cid) return
    onAddCourse(gid, cid)
    setAddingFor(null)
    setSelectedCourse('')
  }

  return (
    <div className="card" style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: 'var(--text-bright)', fontSize: 14 }}>{title}</h3>
        {isLoggedIn && <button className="btn-secondary btn-sm" onClick={onCreateGroup}>+ New Group</button>}
      </div>

      {groups.length === 0 && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No groups yet.</div>
      )}

      {groups.map(g => {
        const usedIds = g.course_ids
        const available = courses.filter(c => !usedIds.includes(c.id))
        return (
          <div key={g.id} style={{ marginBottom: 16, background: 'var(--bg-elevated)', borderRadius: 'var(--border-radius)', padding: 12, border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Group #{g.id}</span>
              {isLoggedIn && <button className="btn-danger btn-sm" onClick={() => onDeleteGroup(g.id)}>Delete Group</button>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {g.course_ids.map(cid => {
                const c = courseMap[cid]
                return c ? (
                  <span key={cid} style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                    borderRadius: 'var(--border-radius)', padding: '3px 8px', fontSize: 12,
                    display: 'flex', alignItems: 'center', gap: 4
                  }}>
                    <span style={{ color: 'var(--accent)' }}>{c.dept_code} {c.course_number}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{c.course_name}</span>
                    {isLoggedIn && <button onClick={() => onRemoveCourse(g.id, cid)} style={{ background: 'none', padding: '0 0 0 4px', color: 'var(--error)', minWidth: 'unset' }}>×</button>}
                  </span>
                ) : null
              })}
            </div>
            {isLoggedIn && (addingFor === g.id ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Select course...</option>
                  {available.map(c => <option key={c.id} value={c.id}>{c.dept_code} {c.course_number} — {c.course_name}</option>)}
                </select>
                <button className="btn-primary btn-sm" onClick={() => handleAdd(g.id)}>Add</button>
                <button className="btn-secondary btn-sm" onClick={() => setAddingFor(null)}>Cancel</button>
              </div>
            ) : (
              <button className="btn-secondary btn-sm" onClick={() => { setAddingFor(g.id); setSelectedCourse('') }}>+ Add Course</button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export function ConstraintsTab() {
  const { isLoggedIn } = useAuth()
  const [taughtWith, setTaughtWith] = useState<TaughtWithGroup[]>([])
  const [coreq, setCoReq] = useState<CoReqGroup[]>([])
  const [courses, setCourses] = useState<Course[]>([])

  const load = async () => {
    const [tw, cr, c] = await Promise.all([
      constraintsApi.listTaughtWith(),
      constraintsApi.listCoReq(),
      coursesApi.list()
    ])
    setTaughtWith(tw)
    setCoReq(cr)
    setCourses(c)
  }
  useEffect(() => { load() }, [])

  const withToast = async (fn: () => Promise<void>) => {
    try { await fn(); await load() }
    catch (e: any) { showToast(e.response?.data?.detail || 'Operation failed') }
  }

  return (
    <div>
      <div className="page-header"><h1>Constraints</h1></div>
      <div className="page-content" style={{ display: 'flex', gap: 20 }}>
        <GroupPanel
          title="Taught With (same time, same room, same instructor)"
          groups={taughtWith}
          courses={courses}
          isLoggedIn={isLoggedIn}
          onCreateGroup={() => withToast(() => constraintsApi.createTaughtWith().then(() => {}))}
          onDeleteGroup={id => withToast(() => constraintsApi.deleteTaughtWith(id).then(() => {}))}
          onAddCourse={(gid, cid) => withToast(() => constraintsApi.addTaughtWithCourse(gid, cid).then(() => {}))}
          onRemoveCourse={(gid, cid) => withToast(() => constraintsApi.removeTaughtWithCourse(gid, cid).then(() => {}))}
        />
        <GroupPanel
          title="Co-Requisites (must not overlap)"
          groups={coreq}
          courses={courses}
          isLoggedIn={isLoggedIn}
          onCreateGroup={() => withToast(() => constraintsApi.createCoReq().then(() => {}))}
          onDeleteGroup={id => withToast(() => constraintsApi.deleteCoReq(id).then(() => {}))}
          onAddCourse={(gid, cid) => withToast(() => constraintsApi.addCoReqCourse(gid, cid).then(() => {}))}
          onRemoveCourse={(gid, cid) => withToast(() => constraintsApi.removeCoReqCourse(gid, cid).then(() => {}))}
        />
      </div>
    </div>
  )
}
