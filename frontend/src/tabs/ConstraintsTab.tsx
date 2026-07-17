import { useState, useEffect } from 'react'
import { constraintsApi, coursesApi, loadSettingsApi, type TaughtWithGroup, type CoReqGroup, type Course, type LoadSettings } from '../api'
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
  const [loadSettings, setLoadSettings] = useState<LoadSettings>({ fulltime_load: 3, parttime_load: 2, min_office_hours_fulltime: 4, min_office_hours_parttime: 1 })
  const [loadForm, setLoadForm] = useState<LoadSettings>({ fulltime_load: 3, parttime_load: 2, min_office_hours_fulltime: 4, min_office_hours_parttime: 1 })
  const [savingLoad, setSavingLoad] = useState(false)

  const load = async () => {
    const [tw, cr, c, ls] = await Promise.all([
      constraintsApi.listTaughtWith(),
      constraintsApi.listCoReq(),
      coursesApi.list(),
      loadSettingsApi.get(),
    ])
    setTaughtWith(tw)
    setCoReq(cr)
    setCourses(c)
    setLoadSettings(ls)
    setLoadForm(ls)
  }
  useEffect(() => { load() }, [])

  const withToast = async (fn: () => Promise<void>) => {
    try { await fn(); await load() }
    catch (e: any) { showToast(e.response?.data?.detail || 'Operation failed') }
  }

  const saveLoadSettings = async () => {
    setSavingLoad(true)
    try {
      const updated = await loadSettingsApi.update(loadForm)
      setLoadSettings(updated)
      setLoadForm(updated)
      showToast('Load settings saved', 'success')
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Save failed')
    } finally {
      setSavingLoad(false) }
  }

  const loadDirty = loadForm.fulltime_load !== loadSettings.fulltime_load ||
    loadForm.parttime_load !== loadSettings.parttime_load ||
    loadForm.min_office_hours_fulltime !== loadSettings.min_office_hours_fulltime ||
    loadForm.min_office_hours_parttime !== loadSettings.min_office_hours_parttime

  return (
    <div>
      <div className="page-header"><h1>Constraints</h1></div>
      <div className="page-content">

      {/* Load Settings */}
      <div className="card" style={{ marginBottom: 20, maxWidth: 400 }}>
        <h3 style={{ margin: '0 0 14px', color: 'var(--text-bright)', fontSize: 14 }}>Faculty Load Tiers</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12 }}>Full-Time Load</label>
            <input
              type="number" min={1} max={10}
              value={loadForm.fulltime_load}
              onChange={e => isLoggedIn && setLoadForm(f => ({ ...f, fulltime_load: +e.target.value }))}
              disabled={!isLoggedIn}
              style={{ padding: '5px 8px', fontSize: 13 }}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12 }}>Part-Time Load</label>
            <input
              type="number" min={1} max={10}
              value={loadForm.parttime_load}
              onChange={e => isLoggedIn && setLoadForm(f => ({ ...f, parttime_load: +e.target.value }))}
              disabled={!isLoggedIn}
              style={{ padding: '5px 8px', fontSize: 13 }}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12 }}>Min Office Hours/Week (Full-Time)</label>
            <input
              type="number" min={0} max={40}
              value={loadForm.min_office_hours_fulltime}
              onChange={e => isLoggedIn && setLoadForm(f => ({ ...f, min_office_hours_fulltime: +e.target.value }))}
              disabled={!isLoggedIn}
              style={{ padding: '5px 8px', fontSize: 13 }}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: 12 }}>Min Office Hours/Week (Part-Time)</label>
            <input
              type="number" min={0} max={40}
              value={loadForm.min_office_hours_parttime}
              onChange={e => isLoggedIn && setLoadForm(f => ({ ...f, min_office_hours_parttime: +e.target.value }))}
              disabled={!isLoggedIn}
              style={{ padding: '5px 8px', fontSize: 13 }}
            />
          </div>
        </div>
        {isLoggedIn && (
          <button
            className="btn-primary btn-sm"
            onClick={saveLoadSettings}
            disabled={savingLoad || !loadDirty}
          >
            {savingLoad ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
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
    </div>
  )
}
