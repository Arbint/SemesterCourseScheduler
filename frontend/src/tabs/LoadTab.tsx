import { useState, useEffect } from 'react'
import { termsApi, semestersApi, loadApi, type Term, type FacultyLoad } from '../api'

export function LoadTab() {
  const [terms, setTerms] = useState<Term[]>([])
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null)
  const [loadData, setLoadData] = useState<FacultyLoad[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Promise.all([termsApi.list(), semestersApi.list()]).then(([t]) => {
      setTerms(t)
      if (t.length) {
        setSelectedTermId(t[0].id)
      }
    })
  }, [])

  useEffect(() => {
    if (!selectedTermId) return
    setLoading(true)
    loadApi.getTermLoad(selectedTermId)
      .then(setLoadData)
      .finally(() => setLoading(false))
  }, [selectedTermId])

  const termLabel = (t: Term) =>
    `${t.semester_name.charAt(0).toUpperCase() + t.semester_name.slice(1)} ${t.year}`

  return (
    <div>
      <div className="page-header">
        <h1>Faculty Load</h1>
        <select
          value={selectedTermId ?? ''}
          onChange={e => setSelectedTermId(+e.target.value)}
          style={{ padding: '5px 10px', fontSize: 13 }}
        >
          {terms.map(t => (
            <option key={t.id} value={t.id}>{termLabel(t)}</option>
          ))}
        </select>
      </div>

      <div className="page-content">
        {loading && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading...</div>
        )}

        {!loading && loadData.length === 0 && (
          <div className="empty-state">
            <div className="icon">📋</div>
            No faculty assigned to any courses for this term.
          </div>
        )}

        {!loading && loadData.map(faculty => {
          const overloaded = faculty.total_sections > faculty.full_load
          return (
            <div
              key={faculty.faculty_id}
              className="card"
              style={{ marginBottom: 20 }}
            >
              {/* Faculty header */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-bright)' }}>
                  {faculty.name}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {faculty.rank.replace('_', ' ')}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  · load limit: <strong style={{ color: 'var(--text-primary)' }}>{faculty.full_load}</strong>
                </span>
              </div>

              {/* Course table — snapped to the right */}
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 13, maxWidth: 700, width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11 }}>
                        Course(s)
                      </th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, width: 90 }}>
                        Sections
                      </th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, width: 130 }}>
                        Credit Hrs / unit
                      </th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11, width: 130 }}>
                        Total Credit Hrs
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {faculty.courses.map((c, i) => (
                      <tr key={i}>
                        <td style={{ padding: '6px 10px', border: '1px solid var(--border-color)', fontFamily: 'monospace', color: 'var(--accent)', maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.display}>
                          {c.display}
                        </td>
                        <td style={{ padding: '6px 10px', border: '1px solid var(--border-color)', textAlign: 'right' }}>
                          {c.sections}
                        </td>
                        <td style={{ padding: '6px 10px', border: '1px solid var(--border-color)', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {c.credit_hours}
                        </td>
                        <td style={{ padding: '6px 10px', border: '1px solid var(--border-color)', textAlign: 'right' }}>
                          {c.total_credit_hours}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr style={{ background: 'var(--bg-elevated)' }}>
                      <td style={{ padding: '6px 10px', border: '1px solid var(--border-color)', fontWeight: 700, maxWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        TOTAL
                      </td>
                      <td style={{
                        padding: '6px 10px', border: '1px solid var(--border-color)',
                        textAlign: 'right', fontWeight: 700,
                        color: overloaded ? 'var(--error)' : 'var(--success)',
                      }}>
                        {faculty.total_sections}
                        {overloaded && <span style={{ fontSize: 10, marginLeft: 4 }}>⚠ over</span>}
                      </td>
                      <td style={{ padding: '6px 10px', border: '1px solid var(--border-color)' }} />
                      <td style={{ padding: '6px 10px', border: '1px solid var(--border-color)', textAlign: 'right', fontWeight: 700 }}>
                        {faculty.total_credit_hours}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
