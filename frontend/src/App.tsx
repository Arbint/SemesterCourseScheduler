import { useState } from 'react'
import { ToastContainer } from './components/Toast'
import { LoginModal } from './components/LoginModal'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { FacultyTab } from './tabs/FacultyTab'
import { CourseTab } from './tabs/CourseTab'
import { RoomsTab } from './tabs/RoomsTab'
import { TimeSlotsTab } from './tabs/TimeSlotsTab'
import { ConstraintsTab } from './tabs/ConstraintsTab'
import { TermSchedulesTab } from './tabs/TermSchedulesTab'
import { LoadTab } from './tabs/LoadTab'
import { ViewTab } from './tabs/ViewTab'
import { ChangeListTab } from './tabs/ChangeListTab'

const TABS = [
  { id: 'faculty', label: 'Faculty' },
  { id: 'courses', label: 'Course Catalog' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'timeslots', label: 'Time Slots' },
  { id: 'constraints', label: 'Constraints' },
  { id: 'schedules', label: 'Term Schedules' },
  { id: 'load', label: 'Load' },
  { id: 'view', label: 'View' },
  { id: 'changelist', label: 'Change List' },
] as const

type TabId = typeof TABS[number]['id']

function initialTab(): TabId {
  const requested = new URLSearchParams(window.location.search).get('tab')
  return TABS.some(t => t.id === requested) ? (requested as TabId) : 'schedules'
}

function AppShell() {
  const [tab, setTab] = useState<TabId>(initialTab)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const { isLoggedIn, hasUser, username, logout } = useAuth()

  const loginMode = hasUser ? 'login' : 'create'

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
          {isLoggedIn ? (
            <>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{username}</span>
              <button
                className="btn-secondary btn-sm"
                onClick={logout}
              >
                Log Out
              </button>
            </>
          ) : (
            <button
              className="btn-primary btn-sm"
              onClick={() => setShowLoginModal(true)}
            >
              {hasUser ? 'Log In' : 'Set Up Account'}
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: tab === 'schedules' || tab === 'view' ? 'hidden' : 'auto', position: 'relative' }}>
        {tab === 'faculty' && <FacultyTab />}
        {tab === 'courses' && <CourseTab />}
        {tab === 'rooms' && <RoomsTab />}
        {tab === 'timeslots' && <TimeSlotsTab />}
        {tab === 'constraints' && <ConstraintsTab />}
        {/* Always mounted so chat history is preserved across tab switches */}
        <div style={{ display: tab === 'schedules' ? 'flex' : 'none', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <TermSchedulesTab />
        </div>
        {tab === 'load' && <LoadTab />}
        {tab === 'view' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <ViewTab />
          </div>
        )}
        {tab === 'changelist' && <ChangeListTab />}
      </div>

      {showLoginModal && (
        <LoginModal mode={loginMode} onClose={() => setShowLoginModal(false)} />
      )}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
