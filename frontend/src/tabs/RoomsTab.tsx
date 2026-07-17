import { useState, useEffect } from 'react'
import { roomsApi, type Room } from '../api'
import { FormModal } from '../components/FormModal'
import { showToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'

type RoomForm = Omit<Room, 'id' | 'display_label'>

const EMPTY: RoomForm = { building_name: '', room_number: '', building_code: '', capacity: 30, is_online: false, is_department_owned: false }

export function RoomsTab() {
  const { isLoggedIn } = useAuth()
  const [rooms, setRooms] = useState<Room[]>([])
  const [editing, setEditing] = useState<Room | null>(null)
  const [form, setForm] = useState<RoomForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const load = () => roomsApi.list().then(setRooms)
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (r: Room) => {
    setEditing(r)
    setForm({ building_name: r.building_name ?? '', room_number: r.room_number, building_code: r.building_code, capacity: r.capacity, is_online: r.is_online, is_department_owned: r.is_department_owned })
    setShowModal(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = { ...form, building_name: form.building_name?.trim() || null }
      if (editing) await roomsApi.update(editing.id, payload)
      else await roomsApi.create(payload)
      setShowModal(false)
      await load()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  const del = async (r: Room) => {
    if (!confirm(`Delete room ${r.display_label}?`)) return
    try { await roomsApi.delete(r.id); await load() }
    catch (e: any) { showToast(e.response?.data?.detail || 'Delete failed') }
  }

  const previewLabel = `${form.building_code || 'FH'} ${form.room_number || '3056'}`

  return (
    <div>
      <div className="page-header">
        <h1>Rooms</h1>
        {isLoggedIn && <button className="btn-primary" onClick={openNew}>+ Add Room</button>}
      </div>
      <div className="page-content">
        {rooms.length === 0 ? (
          <div className="empty-state"><div className="icon">🏫</div>No rooms yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Display</th>
                <th>Building Code</th>
                <th>Room #</th>
                <th>Full Name</th>
                <th>Capacity</th>
                <th>Type</th>
                <th>Ownership</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rooms.map(r => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--text-bright)', fontFamily: 'monospace' }}>{r.display_label}</td>
                  <td>{r.building_code}</td>
                  <td>{r.room_number}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.building_name ?? '—'}</td>
                  <td>{r.is_online ? '—' : `${r.capacity} students`}</td>
                  <td>{r.is_online ? <span style={{ color: 'var(--accent)', fontSize: 12 }}>Online</span> : 'Physical'}</td>
                  <td>
                    {r.is_department_owned
                      ? <span style={{ color: 'var(--accent)', fontSize: 12 }}>Department</span>
                      : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Shared</span>}
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {isLoggedIn && <button className="btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>}
                    {isLoggedIn && <button className="btn-danger btn-sm" onClick={() => del(r)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showModal && (
        <FormModal title={editing ? 'Edit Room' : 'Add Room'} onClose={() => setShowModal(false)} onSave={save} saving={saving}>
          <div className="form-group">
            <label>Building Code <span style={{ color: 'var(--error)' }}>*</span></label>
            <input
              value={form.building_code}
              onChange={e => setForm(f => ({ ...f, building_code: e.target.value }))}
              placeholder="FH"
            />
          </div>
          <div className="form-group">
            <label>Room Number <span style={{ color: 'var(--error)' }}>*</span></label>
            <input
              value={form.room_number}
              onChange={e => setForm(f => ({ ...f, room_number: e.target.value }))}
              placeholder="3056"
            />
          </div>
          <div className="form-group">
            <label>Full Name <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>(optional)</span></label>
            <input
              value={form.building_name ?? ''}
              onChange={e => setForm(f => ({ ...f, building_name: e.target.value }))}
              placeholder="Fullerton Hall"
            />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
              Shown in schedules as: <strong>{previewLabel}</strong>
            </span>
          </div>
          <div className="form-group">
            <label>Capacity</label>
            <input
              type="number" min={1}
              value={form.capacity}
              onChange={e => setForm(f => ({ ...f, capacity: +e.target.value }))}
              disabled={form.is_online}
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.is_online}
                onChange={e => setForm(f => ({ ...f, is_online: e.target.checked }))}
                style={{ accentColor: 'var(--accent)' }}
              />
              Online room (unlimited capacity, no room conflicts)
            </label>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.is_department_owned}
                onChange={e => setForm(f => ({ ...f, is_department_owned: e.target.checked }))}
                style={{ accentColor: 'var(--accent)' }}
              />
              Department owned (vs. shared)
            </label>
          </div>
        </FormModal>
      )}
    </div>
  )
}
