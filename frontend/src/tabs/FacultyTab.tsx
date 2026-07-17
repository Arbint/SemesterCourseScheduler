import { useState, useEffect, useRef } from 'react'
import { facultyApi, coursesApi, facultyAttributesApi, type Faculty, type Course, type FacultyRank, type FacultyAttribute } from '../api'
import { FormModal } from '../components/FormModal'
import { TagInput } from '../components/TagInput'
import { MultiSelect } from '../components/MultiSelect'
import { showToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'

const EMPTY: Omit<Faculty, 'id' | 'attribute_ids'> = { first_name: '', last_name: '', full_time_or_part_time: 'full_time', tags: [], office: '', is_department_owned: false, rank: null }

const RANK_LABELS: Record<FacultyRank, string> = {
  instructor: 'Instructor',
  senior_instructor: 'Senior Instructor',
  assistant_professor: 'Assistant Professor',
  associate_professor: 'Associate Professor',
  professor_of_practice: 'Professor of Practice',
  professor: 'Professor',
}

// Manage-attributes panel — lives under the faculty list, lets the user
// create/rename/delete attributes and upload/replace/remove each one's icon.
function AttributePanel({ attributes, isLoggedIn, onChanged }: {
  attributes: FacultyAttribute[]
  isLoggedIn: boolean
  onChanged: () => void
}) {
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [uploadingId, setUploadingId] = useState<number | null>(null)
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const createAttribute = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await facultyAttributesApi.create(newName.trim())
      setNewName('')
      onChanged()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to create attribute')
    } finally {
      setCreating(false)
    }
  }

  const startRename = (a: FacultyAttribute) => {
    setRenamingId(a.id)
    setRenameValue(a.name)
  }

  const saveRename = async (id: number) => {
    if (!renameValue.trim()) return
    try {
      await facultyAttributesApi.update(id, renameValue.trim())
      setRenamingId(null)
      onChanged()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to rename attribute')
    }
  }

  const deleteAttribute = async (a: FacultyAttribute) => {
    if (!confirm(`Delete attribute "${a.name}"? This removes it from every faculty member who has it.`)) return
    try {
      await facultyAttributesApi.delete(a.id)
      onChanged()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to delete attribute')
    }
  }

  const uploadIcon = async (id: number, file: File) => {
    setUploadingId(id)
    try {
      await facultyAttributesApi.uploadIcon(id, file)
      onChanged()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to upload icon')
    } finally {
      setUploadingId(null)
    }
  }

  const removeIcon = async (id: number) => {
    try {
      await facultyAttributesApi.removeIcon(id)
      onChanged()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to remove icon')
    }
  }

  return (
    <div className="card" style={{ marginTop: 20, maxWidth: 500 }}>
      <h3 style={{ margin: '0 0 14px', color: 'var(--text-bright)', fontSize: 14 }}>Faculty Attributes</h3>

      {attributes.length === 0 && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
          No attributes yet — e.g. "FLIGHT Certified".
        </div>
      )}

      {attributes.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
          {a.has_icon ? (
            <img src={facultyAttributesApi.iconUrl(a.id)} alt="" style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 24, height: 24, flexShrink: 0, border: '1px dashed var(--border-color)', borderRadius: 4 }} />
          )}

          {renamingId === a.id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(a.id); if (e.key === 'Escape') setRenamingId(null) }}
              style={{ flex: 1, padding: '3px 6px', fontSize: 13 }}
            />
          ) : (
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{a.name}</span>
          )}

          {isLoggedIn && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <input
                ref={el => { fileRefs.current[a.id] = el }}
                type="file"
                accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) uploadIcon(a.id, file)
                  e.target.value = ''
                }}
              />
              <button
                className="btn-secondary btn-sm"
                disabled={uploadingId === a.id}
                onClick={() => fileRefs.current[a.id]?.click()}
              >
                {uploadingId === a.id ? 'Uploading...' : a.has_icon ? 'Replace Icon' : 'Upload Icon'}
              </button>
              {a.has_icon && <button className="btn-secondary btn-sm" onClick={() => removeIcon(a.id)}>Remove Icon</button>}
              {renamingId === a.id ? (
                <>
                  <button className="btn-primary btn-sm" onClick={() => saveRename(a.id)}>Save</button>
                  <button className="btn-secondary btn-sm" onClick={() => setRenamingId(null)}>Cancel</button>
                </>
              ) : (
                <button className="btn-secondary btn-sm" onClick={() => startRename(a)}>Rename</button>
              )}
              <button className="btn-danger btn-sm" onClick={() => deleteAttribute(a)}>Delete</button>
            </div>
          )}
        </div>
      ))}

      {isLoggedIn && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createAttribute() }}
            placeholder="New attribute name, e.g. FLIGHT Certified"
            style={{ flex: 1, padding: '5px 10px', fontSize: 13 }}
          />
          <button className="btn-primary btn-sm" disabled={creating || !newName.trim()} onClick={createAttribute}>
            {creating ? 'Adding...' : '+ Add Attribute'}
          </button>
        </div>
      )}
    </div>
  )
}

export function FacultyTab() {
  const { isLoggedIn } = useAuth()
  const [faculty, setFaculty] = useState<Faculty[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [attributes, setAttributes] = useState<FacultyAttribute[]>([])
  const [editing, setEditing] = useState<Faculty | null>(null)
  const [form, setForm] = useState<Omit<Faculty, 'id' | 'attribute_ids'>>(EMPTY)
  const [teachingIds, setTeachingIds] = useState<number[]>([])
  const [attributeIds, setAttributeIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const load = async () => {
    const [f, c, a] = await Promise.all([facultyApi.list(), coursesApi.list(), facultyAttributesApi.list()])
    setFaculty(f)
    setCourses(c)
    setAttributes(a)
  }

  useEffect(() => { load() }, [])

  const attributeMap = new Map(attributes.map(a => [a.id, a]))

  const openNew = () => {
    setEditing(null)
    setForm(EMPTY)
    setTeachingIds([])
    setAttributeIds([])
    setShowModal(true)
  }

  const openEdit = async (f: Faculty) => {
    setEditing(f)
    setForm({ first_name: f.first_name, last_name: f.last_name, full_time_or_part_time: f.full_time_or_part_time, tags: f.tags, office: f.office ?? '', is_department_owned: f.is_department_owned, rank: f.rank })
    setAttributeIds(f.attribute_ids)
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
        // Sync attributes
        const currentAttrIds = editing.attribute_ids
        const attrToAdd = attributeIds.filter(id => !currentAttrIds.includes(id))
        const attrToRemove = currentAttrIds.filter(id => !attributeIds.includes(id))
        await Promise.all([
          ...toAdd.map(cid => facultyApi.addCourse(editing.id, cid)),
          ...toRemove.map(cid => facultyApi.removeCourse(editing.id, cid)),
          ...attrToAdd.map(aid => facultyApi.addAttribute(editing.id, aid)),
          ...attrToRemove.map(aid => facultyApi.removeAttribute(editing.id, aid)),
        ])
      } else {
        savedFaculty = await facultyApi.create(form)
        await Promise.all([
          ...teachingIds.map(cid => facultyApi.addCourse(savedFaculty.id, cid)),
          ...attributeIds.map(aid => facultyApi.addAttribute(savedFaculty.id, aid)),
        ])
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
                <th>Full-Time/Part-Time</th>
                <th>Office</th>
                <th>Ownership</th>
                <th>Attributes</th>
                <th>Tags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {faculty.map(f => (
                <tr key={f.id}>
                  <td style={{ color: 'var(--text-bright)' }}>{f.last_name}, {f.first_name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{f.rank ? RANK_LABELS[f.rank] : '—'}</td>
                  <td>
                    <span className={`badge ${f.full_time_or_part_time === 'full_time' ? 'badge-fall' : 'badge-spring'}`}>
                      {f.full_time_or_part_time === 'full_time' ? 'Full Time' : 'Part Time'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{f.office || '—'}</td>
                  <td>
                    {f.is_department_owned
                      ? <span style={{ color: 'var(--accent)', fontSize: 12 }}>Department</span>
                      : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>—</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {f.attribute_ids.map(aid => {
                        const a = attributeMap.get(aid)
                        if (!a) return null
                        return a.has_icon ? (
                          <img key={aid} src={facultyAttributesApi.iconUrl(a.id)} alt={a.name} title={a.name} style={{ width: 18, height: 18, objectFit: 'contain' }} />
                        ) : (
                          <span key={aid} className="tag" title={a.name}>{a.name}</span>
                        )
                      })}
                    </div>
                  </td>
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

        <AttributePanel attributes={attributes} isLoggedIn={isLoggedIn} onChanged={load} />
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
            <select
              value={form.rank ?? ''}
              onChange={e => setForm(f => ({ ...f, rank: e.target.value ? e.target.value as FacultyRank : null }))}
            >
              <option value="">Not set</option>
              {(Object.keys(RANK_LABELS) as FacultyRank[]).map(r => (
                <option key={r} value={r}>{RANK_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Full-Time/Part-Time</label>
            <select value={form.full_time_or_part_time} onChange={e => setForm(f => ({ ...f, full_time_or_part_time: e.target.value as Faculty['full_time_or_part_time'] }))}>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
            </select>
          </div>
          <div className="form-group">
            <label>Office</label>
            <input
              value={form.office ?? ''}
              onChange={e => setForm(f => ({ ...f, office: e.target.value }))}
              placeholder="e.g. JB 245"
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.is_department_owned}
                onChange={e => setForm(f => ({ ...f, is_department_owned: e.target.checked }))}
                style={{ accentColor: 'var(--accent)' }}
              />
              Department owned (required at department meetings when full-time)
            </label>
          </div>
          <div className="form-group">
            <label>Tags</label>
            <TagInput value={form.tags} onChange={tags => setForm(f => ({ ...f, tags }))} />
          </div>
          <div className="form-group">
            <label>Attributes</label>
            <MultiSelect
              options={attributes.map(a => ({ id: a.id, label: a.name }))}
              selected={attributeIds}
              onChange={setAttributeIds}
              placeholder="Select attributes..."
            />
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
