import { useState, useEffect } from 'react'
import { roomsApi, type Room } from '../api'
import { FormModal } from '../components/FormModal'
import { showToast } from '../components/Toast'

const EMPTY: Omit<Room, 'id'> = { label: '', capacity: 30, is_online: false }

export function RoomsTab() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [editing, setEditing] = useState<Room | null>(null)
  const [form, setForm] = useState<Omit<Room, 'id'>>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const load = () => roomsApi.list().then(setRooms)
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (r: Room) => { setEditing(r); setForm({ label: r.label, capacity: r.capacity, is_online: r.is_online }); setShowModal(true) }

  const save = async () => {
    setSaving(true)
    try {
      if (editing) await roomsApi.update(editing.id, form)
      else await roomsApi.create(form)
      setShowModal(false)
      await load()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  const del = async (r: Room) => {
    if (!confirm(`Delete room ${r.label}?`)) return
    try { await roomsApi.delete(r.id); await load() }
    catch (e: any) { showToast(e.response?.data?.detail || 'Delete failed') }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Rooms</h1>
        <button className="btn-primary" onClick={openNew}>+ Add Room</button>
      </div>
      <div className="page-content">
        {rooms.length === 0 ? (
          <div className="empty-state"><div className="icon">🏫</div>No rooms yet.</div>
        ) : (
          <table>
            <thead><tr><th>Label</th><th>Capacity</th><th>Type</th><th></th></tr></thead>
            <tbody>
              {rooms.map(r => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--text-bright)', fontFamily: 'monospace' }}>{r.label}</td>
                  <td>{r.is_online ? '—' : `${r.capacity} students`}</td>
                  <td>{r.is_online ? <span style={{ color: 'var(--accent)', fontSize: 12 }}>Online</span> : 'Physical'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
                    <button className="btn-danger btn-sm" onClick={() => del(r)}>Delete</button>
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
            <label>Room Label</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="FH 3233" />
          </div>
          <div className="form-group">
            <label>Capacity</label>
            <input type="number" min={1} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: +e.target.value }))} disabled={form.is_online} />
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
