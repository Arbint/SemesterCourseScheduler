import { useState } from 'react'
import { ToastContainer } from './components/Toast'
import { FacultyTab } from './tabs/FacultyTab'
import { CourseTab } from './tabs/CourseTab'
import { RoomsTab } from './tabs/RoomsTab'
import { TimeSlotsTab } from './tabs/TimeSlotsTab'
import { ConstraintsTab } from './tabs/ConstraintsTab'
import { TermSchedulesTab } from './tabs/TermSchedulesTab'

const TABS = [
  { id: 'faculty', label: 'Faculty' },
  { id: 'courses', label: 'Course Catalog' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'timeslots', label: 'Time Slots' },
  { id: 'constraints', label: 'Constraints' },
  { id: 'schedules', label: 'Term Schedules' },
] as const

type TabId = typeof TABS[number]['id']

export default function App() {
  const [tab, setTab] = useState<TabId>('schedules')

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <ToastContainer />
      <div style={{
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', height: 44
      }}>
        <img src="/icon.png" alt="icon" style={{ width: 24, height: 24, objectFit: 'contain' }} onError={e => (e.currentTarget.style.display = 'none')} />
        <span style={{ color: 'var(--text-bright)', fontWeight: 700, fontSize: 15 }}>Semester Course Scheduler</span>
        <div style={{ flex: 1 }} />
        <div className="tab-bar" style={{ background: 'none', border: 'none', padding: 0 }}>
          {TABS.map(t => (
            <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: tab === 'schedules' ? 'hidden' : 'auto' }}>
        {tab === 'faculty' && <FacultyTab />}
        {tab === 'courses' && <CourseTab />}
        {tab === 'rooms' && <RoomsTab />}
        {tab === 'timeslots' && <TimeSlotsTab />}
        {tab === 'constraints' && <ConstraintsTab />}
        {tab === 'schedules' && <TermSchedulesTab />}
      </div>
    </div>
  )
}
