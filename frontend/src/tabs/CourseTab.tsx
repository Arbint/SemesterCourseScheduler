import { useState, useEffect } from 'react'
import { coursesApi, semestersApi, type Course, type Semester } from '../api'
import { FormModal } from '../components/FormModal'
import { MultiSelect } from '../components/MultiSelect'
import { showToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'

const EMPTY: Omit<Course, 'id' | 'semester_ids'> = {
  dept_code: '', course_number: 0, course_name: '', duration_minutes: 75, capacity: 30, frequency: 2
}

function decodeNumber(n: number) {
  const s = String(n).padStart(4, '0')
  const levels = ['', 'Freshman', 'Sophomore', 'Junior', 'Senior']
  return `Level: ${levels[+s[0]] || s[0]}, Credits: ${s[1]}, Category: ${s[2]}, Index: ${s[3]}`
}

export function CourseTab() {
  const { isLoggedIn } = useAuth()
  const [courses, setCourses] = useState<Course[]>([])
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [editing, setEditing] = useState<Course | null>(null)
  const [form, setForm] = useState<Omit<Course, 'id' | 'semester_ids'>>(EMPTY)
  const [semIds, setSemIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const load = async () => {
    const [c, s] = await Promise.all([coursesApi.list(), semestersApi.list()])
    setCourses(c)
    setSemesters(s)
  }

  useEffect(() => { load() }, [])

  const semBadge = (id: number) => {
    const s = semesters.find(s => s.id === id)
    if (!s) return null
    return <span key={id} className={`badge badge-${s.name}`} style={{ margin: '0 2px' }}>{s.name}</span>
  }

  const openNew = () => {
    setEditing(null)
    setForm(EMPTY)
    setSemIds([])
    setShowModal(true)
  }

  const openEdit = (c: Course) => {
    setEditing(c)
    setForm({ dept_code: c.dept_code, course_number: c.course_number, course_name: c.course_name, duration_minutes: c.duration_minutes, capacity: c.capacity, frequency: c.frequency })
    setSemIds(c.semester_ids)
    setShowModal(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      let saved: Course
      if (editing) {
        saved = await coursesApi.update(editing.id, form)
        const toAdd = semIds.filter(id => !editing.semester_ids.includes(id))
        const toRemove = editing.semester_ids.filter(id => !semIds.includes(id))
        await Promise.all([
          ...toAdd.map(sid => coursesApi.addSemester(editing.id, sid)),
          ...toRemove.map(sid => coursesApi.removeSemester(editing.id, sid)),
        ])
      } else {
        saved = await coursesApi.create(form)
        await Promise.all(semIds.map(sid => coursesApi.addSemester(saved.id, sid)))
      }
      setShowModal(false)
      await load()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const del = async (c: Course) => {
    if (!confirm(`Delete ${c.dept_code} ${c.course_number}?`)) return
    try {
      await coursesApi.delete(c.id)
      await load()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Delete failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Course Catalog</h1>
        {isLoggedIn && <button className="btn-primary" onClick={openNew}>+ Add Course</button>}
      </div>
      <div className="page-content">
        {courses.length === 0 ? (
          <div className="empty-state"><div className="icon">📚</div>No courses yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Duration</th>
                <th>Capacity</th>
                <th>Freq/week</th>
                <th>Semesters</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {courses.map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--accent)' }} title={decodeNumber(c.course_number)}>
                    {c.dept_code} {c.course_number}
                  </td>
                  <td style={{ color: 'var(--text-bright)' }}>{c.course_name}</td>
                  <td>{c.duration_minutes}min</td>
                  <td>{c.capacity}</td>
                  <td>{c.frequency}×</td>
                  <td>{c.semester_ids.map(id => semBadge(id))}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {isLoggedIn && <button className="btn-secondary btn-sm" onClick={() => openEdit(c)}>Edit</button>}
                    {isLoggedIn && <button className="btn-danger btn-sm" onClick={() => del(c)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <FormModal title={editing ? 'Edit Course' : 'Add Course'} onClose={() => setShowModal(false)} onSave={save} saving={saving}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Dept Code</label>
              <input value={form.dept_code} onChange={e => setForm(f => ({ ...f, dept_code: e.target.value.toUpperCase() }))} placeholder="ANGD" />
            </div>
            <div className="form-group">
              <label>Course Number</label>
              <input type="number" value={form.course_number || ''} onChange={e => setForm(f => ({ ...f, course_number: +e.target.value }))} placeholder="3371" />
            </div>
          </div>
          <div className="form-group">
            <label>Course Name</label>
            <input value={form.course_name} onChange={e => setForm(f => ({ ...f, course_name: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Duration (min)</label>
              <input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Capacity</label>
              <input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Freq / week</label>
              <input type="number" min={1} max={5} value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: +e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Offered in Semesters</label>
            <MultiSelect
              options={semesters.map(s => ({ id: s.id, label: s.name.charAt(0).toUpperCase() + s.name.slice(1) }))}
              selected={semIds}
              onChange={setSemIds}
              placeholder="Select semesters..."
            />
          </div>
          {form.course_number > 999 && (
            <div style={{ padding: '6px 10px', background: 'var(--bg-elevated)', borderRadius: 'var(--border-radius)', fontSize: 12, color: 'var(--text-secondary)', marginTop: -6 }}>
              {decodeNumber(form.course_number)}
            </div>
          )}
        </FormModal>
      )}
    </div>
  )
}
