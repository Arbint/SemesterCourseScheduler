import { useState, useEffect } from 'react'
import { timeSlotsApi, type TimeSlot } from '../api'
import { FormModal } from '../components/FormModal'
import { showToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'

const EMPTY: Omit<TimeSlot, 'id'> = { label: '', start_time: '', end_time: '', display_order: 1 }

export function TimeSlotsTab() {
  const { isLoggedIn } = useAuth()
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [editing, setEditing] = useState<TimeSlot | null>(null)
  const [form, setForm] = useState<Omit<TimeSlot, 'id'>>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const load = () => timeSlotsApi.list().then(setSlots)
  useEffect(() => { load() }, [])

  const openNew = () => {
    const nextOrder = slots.length ? Math.max(...slots.map(s => s.display_order)) + 1 : 1
    setEditing(null)
    setForm({ ...EMPTY, display_order: nextOrder })
    setShowModal(true)
  }

  const openEdit = (s: TimeSlot) => {
    setEditing(s)
    setForm({ label: s.label, start_time: s.start_time, end_time: s.end_time, display_order: s.display_order })
    setShowModal(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      if (editing) await timeSlotsApi.update(editing.id, form)
      else await timeSlotsApi.create(form)
      setShowModal(false)
      await load()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  const del = async (s: TimeSlot) => {
    if (!confirm(`Delete time slot "${s.label}"?`)) return
    try { await timeSlotsApi.delete(s.id); await load() }
    catch (e: any) { showToast(e.response?.data?.detail || 'Delete failed') }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Time Slots</h1>
        {isLoggedIn && <button className="btn-primary" onClick={openNew}>+ Add Time Slot</button>}
      </div>
      <div className="page-content">
        {slots.length === 0 ? (
          <div className="empty-state"><div className="icon">🕐</div>No time slots yet.</div>
        ) : (
          <table>
            <thead><tr><th>Order</th><th>Label</th><th>Start</th><th>End</th><th></th></tr></thead>
            <tbody>
              {slots.map(s => (
                <tr key={s.id}>
                  <td style={{ color: 'var(--text-secondary)' }}>{s.display_order}</td>
                  <td style={{ color: 'var(--text-bright)' }}>{s.label}</td>
                  <td style={{ fontFamily: 'monospace' }}>{s.start_time}</td>
                  <td style={{ fontFamily: 'monospace' }}>{s.end_time}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {isLoggedIn && <button className="btn-secondary btn-sm" onClick={() => openEdit(s)}>Edit</button>}
                    {isLoggedIn && <button className="btn-danger btn-sm" onClick={() => del(s)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showModal && (
        <FormModal title={editing ? 'Edit Time Slot' : 'Add Time Slot'} onClose={() => setShowModal(false)} onSave={save} saving={saving}>
          <div className="form-group">
            <label>Label</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="7:30 AM - 8:45 AM" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Start Time (HH:MM)</label>
              <input value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} placeholder="07:30" />
            </div>
            <div className="form-group">
              <label>End Time (HH:MM)</label>
              <input value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} placeholder="08:45" />
            </div>
          </div>
          <div className="form-group">
            <label>Display Order</label>
            <input type="number" min={1} value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: +e.target.value }))} />
          </div>
        </FormModal>
      )}
    </div>
  )
}
