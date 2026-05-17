import { useState, useEffect } from 'react'
import { facultyApi, coursesApi, type Faculty, type Course } from '../api'
import { FormModal } from '../components/FormModal'
import { TagInput } from '../components/TagInput'
import { MultiSelect } from '../components/MultiSelect'
import { showToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'

const EMPTY: Omit<Faculty, 'id'> = { first_name: '', last_name: '', rank: 'full_time', tags: [], full_load: 4 }

export function FacultyTab() {
  const { isLoggedIn } = useAuth()
  const [faculty, setFaculty] = useState<Faculty[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [editing, setEditing] = useState<Faculty | null>(null)
  const [form, setForm] = useState<Omit<Faculty, 'id'>>(EMPTY)
  const [teachingIds, setTeachingIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const load = async () => {
    const [f, c] = await Promise.all([facultyApi.list(), coursesApi.list()])
    setFaculty(f)
    setCourses(c)
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setEditing(null)
    setForm(EMPTY)
    setTeachingIds([])
    setShowModal(true)
  }

  const openEdit = async (f: Faculty) => {
    setEditing(f)
    setForm({ first_name: f.first_name, last_name: f.last_name, rank: f.rank, tags: f.tags, full_load: f.full_load })
    const taught = await facultyApi.getCourses(f.id)
    setTeachingIds(taught.map(c => c.id))
    setShowModal(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      let savedFaculty: Faculty
      if (editing) {
        savedFaculty = await facultyApi.update(editing.id, form)
        // Sync teaching capabilities
        const current = await facultyApi.getCourses(editing.id)
        const currentIds = current.map(c => c.id)
        const toAdd = teachingIds.filter(id => !currentIds.includes(id))
        const toRemove = currentIds.filter(id => !teachingIds.includes(id))
        await Promise.all([
          ...toAdd.map(cid => facultyApi.addCourse(editing.id, cid)),
          ...toRemove.map(cid => facultyApi.removeCourse(editing.id, cid)),
        ])
      } else {
        savedFaculty = await facultyApi.create(form)
        await Promise.all(teachingIds.map(cid => facultyApi.addCourse(savedFaculty.id, cid)))
      }
      setShowModal(false)
      await load()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const del = async (f: Faculty) => {
    if (!confirm(`Delete ${f.first_name} ${f.last_name}?`)) return
    try {
      await facultyApi.delete(f.id)
      await load()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Delete failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Faculty</h1>
        {isLoggedIn && <button className="btn-primary" onClick={openNew}>+ Add Faculty</button>}
      </div>
      <div className="page-content">
        {faculty.length === 0 ? (
          <div className="empty-state"><div className="icon">👤</div>No faculty yet. Add one to get started.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Rank</th>
                <th>Full Load</th>
                <th>Tags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {faculty.map(f => (
                <tr key={f.id}>
                  <td style={{ color: 'var(--text-bright)' }}>{f.last_name}, {f.first_name}</td>
                  <td>
                    <span className={`badge ${f.rank === 'full_time' ? 'badge-fall' : 'badge-spring'}`}>
                      {f.rank === 'full_time' ? 'Full Time' : 'Part Time'}
                    </span>
                  </td>
                  <td>{f.full_load}</td>
                  <td>{f.tags.map(t => <span key={t} className="tag">{t}</span>)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {isLoggedIn && <button className="btn-secondary btn-sm" onClick={() => openEdit(f)}>Edit</button>}
                    {isLoggedIn && <button className="btn-danger btn-sm" onClick={() => del(f)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <FormModal title={editing ? 'Edit Faculty' : 'Add Faculty'} onClose={() => setShowModal(false)} onSave={save} saving={saving}>
          <div className="form-group">
            <label>First Name</label>
            <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Last Name</label>
            <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Rank</label>
            <select value={form.rank} onChange={e => setForm(f => ({ ...f, rank: e.target.value as Faculty['rank'] }))}>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
            </select>
          </div>
          <div className="form-group">
            <label>Full Load (sections)</label>
            <input type="number" min={1} value={form.full_load} onChange={e => setForm(f => ({ ...f, full_load: +e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Tags</label>
            <TagInput value={form.tags} onChange={tags => setForm(f => ({ ...f, tags }))} />
          </div>
          <div className="form-group">
            <label>Teaching Capabilities</label>
            <MultiSelect
              options={courses.map(c => ({ id: c.id, label: `${c.dept_code} ${c.course_number} — ${c.course_name}` }))}
              selected={teachingIds}
              onChange={setTeachingIds}
              placeholder="Select courses..."
            />
          </div>
        </FormModal>
      )}
    </div>
  )
}
