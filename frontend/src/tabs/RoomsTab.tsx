import { useState, useEffect } from 'react'
import { roomsApi, type Room } from '../api'
import { FormModal } from '../components/FormModal'
import { showToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'

type RoomForm = Omit<Room, 'id' | 'display_label'>

const EMPTY: RoomForm = { building_name: '', room_number: '', building_abbr: '', capacity: 30, is_online: false }

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
    setForm({ building_name: r.building_name, room_number: r.room_number, building_abbr: r.building_abbr ?? '', capacity: r.capacity, is_online: r.is_online })
    setShowModal(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = { ...form, building_abbr: form.building_abbr?.trim() || null }
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
                <th>Full Name</th>
                <th>Abbreviation</th>
                <th>Room #</th>
                <th>Capacity</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rooms.map(r => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--text-bright)', fontFamily: 'monospace' }}>{r.display_label}</td>
                  <td>{r.building_name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.building_abbr ?? '—'}</td>
                  <td>{r.room_number}</td>
                  <td>{r.is_online ? '—' : `${r.capacity} students`}</td>
                  <td>{r.is_online ? <span style={{ color: 'var(--accent)', fontSize: 12 }}>Online</span> : 'Physical'}</td>
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
            <label>Full Name <span style={{ color: 'var(--error)' }}>*</span></label>
            <input
              value={form.building_name}
              onChange={e => setForm(f => ({ ...f, building_name: e.target.value }))}
              placeholder="Fullerton Hall"
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
            <label>Abbreviation <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>(optional)</span></label>
            <input
              value={form.building_abbr ?? ''}
              onChange={e => setForm(f => ({ ...f, building_abbr: e.target.value }))}
              placeholder="FH"
            />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
              Shown as "{(form.building_abbr?.trim() || form.building_name || 'FH') || 'FH'} {form.room_number || '3056'}" in schedules
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
        </FormModal>
      )}
    </div>
  )
}
