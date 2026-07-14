import { useEffect, useRef, useState } from 'react'
import {
  termsApi, changeListApi,
  type Term, type ChangeListRow, type ComputedChangeListRow,
} from '../api'

type SheetsMap = Record<string, ChangeListRow[]>
type OverridesMap = Record<string, Record<string, number>>

const STATUS_TEXT: Record<ComputedChangeListRow['status'], string> = {
  keep: 'KEEP', changed: 'CHANGE', delete: 'DELETE', add: 'ADD',
}

// Which display column(s) a given backend changed_fields entry maps to.
const CHANGED_FIELD_COLUMNS: Record<string, string[]> = {
  days: ['days'],
  begin: ['begin'],
  end: ['end'],
  room: ['bldg', 'rm'],
  instructor: ['instructor'],
  course_comment: ['course_comments'],
  enrollment_max: ['enrollment_max'],
}

const COLUMNS: { key: keyof ChangeListRow; label: string }[] = [
  { key: 'term_num', label: 'Term' },
  { key: 'start_date', label: 'Start Date' },
  { key: 'end_date', label: 'End Date' },
  { key: 'crn', label: 'CRN' },
  { key: 'subject', label: 'Subject' },
  { key: 'course_number', label: 'CRSE#' },
  { key: 'section', label: 'SEC#' },
  { key: 'course_title', label: 'Course Title' },
  { key: 'type', label: 'Type' },
  { key: 'inst_method', label: 'Inst. Method' },
  { key: 'instructor', label: 'Instructor' },
  { key: 'secondary_instructor', label: 'Secondary Instructor' },
  { key: 'hours', label: 'Hours' },
  { key: 'enrollment_max', label: 'Enrollment Max' },
  { key: 'waitlist_cap', label: 'Waitlist Cap' },
  { key: 'begin', label: 'Begin' },
  { key: 'end', label: 'End' },
  { key: 'days', label: 'Days' },
  { key: 'bldg', label: 'Bldg' },
  { key: 'rm', label: 'RM' },
  { key: 'course_comments', label: 'Course Comments' },
  { key: 'prerequisite', label: 'Prerequisite' },
  { key: 'fee_detail', label: 'Fee Detail' },
  { key: 'fee_amount', label: 'Fee Amount' },
  { key: 'sig_code', label: 'Signature Code' },
  { key: 'sig_required', label: 'Signature Required' },
]

// Wherever the excel export would give a cell a solid background, the on-screen
// table instead draws a colored outline so the underlying values stay legible.
function outlineColor(row: ComputedChangeListRow, field: 'label' | string): string | undefined {
  if (row.status === 'delete') return 'var(--error)'
  if (row.status === 'add') return 'var(--success)'
  if (field === 'label') {
    if (row.status === 'keep') return 'var(--success)'
    if (row.status === 'changed') return 'var(--warning)'
    return undefined
  }
  if (row.status === 'changed') {
    const cols = new Set(row.changed_fields.flatMap(cf => CHANGED_FIELD_COLUMNS[cf] ?? []))
    return cols.has(field) ? 'var(--warning)' : undefined
  }
  return undefined
}

function cellStyle(color: string | undefined): React.CSSProperties {
  return {
    padding: '4px 8px',
    border: '1px solid var(--border-color)',
    outline: color ? `2px solid ${color}` : undefined,
    outlineOffset: -2,
    whiteSpace: 'nowrap',
  }
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  return String(v)
}

export function ChangeListTab() {
  const [terms, setTerms] = useState<Term[]>([])
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null)
  const [sheets, setSheets] = useState<SheetsMap | null>(null)
  const [department, setDepartment] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<OverridesMap>({})
  const [computedRows, setComputedRows] = useState<ComputedChangeListRow[]>([])
  const [sourceLabel, setSourceLabel] = useState('No data loaded')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const importInputRef = useRef<HTMLInputElement>(null)
  const loadInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    termsApi.list().then(t => {
      setTerms(t)
      if (t.length) setSelectedTermId(t[t.length - 1].id)
    })
  }, [])

  const termLabel = (t: Term) =>
    `${t.semester_name.charAt(0).toUpperCase() + t.semester_name.slice(1)} ${t.year}`

  const handleImportDraft = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const result = await changeListApi.parseDraft(file)
      setSheets(result.sheets)
      setDepartment(result.departments[0] ?? null)
      setOverrides({})
      setSourceLabel(`Imported: ${file.name}`)
    } catch {
      setError('Could not parse that spreadsheet — check it matches the expected registrar format.')
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  const handleSaveConfig = () => {
    if (!sheets || !department) return
    const config = { version: 1, department, sheets, overrides }
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'change-list-config.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleLoadConfig = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const config = JSON.parse(text)
      setSheets(config.sheets ?? null)
      setDepartment(config.department ?? null)
      setOverrides(config.overrides ?? {})
      setSourceLabel(`Loaded config: ${file.name}`)
      setError(null)
    } catch {
      setError('Could not load that configuration file.')
    } finally {
      e.target.value = ''
    }
  }

  const handleExport = () => {
    if (!sheets || !department || !selectedTermId) return
    changeListApi.exportXlsx({
      term_id: selectedTermId,
      department,
      old_rows: sheets[department] ?? [],
      enrollment_overrides: overrides[department] ?? {},
    })
  }

  // Recompute whenever the inputs change; debounced so spin-box typing doesn't spam the API.
  useEffect(() => {
    if (!sheets || !department || !selectedTermId) {
      setComputedRows([])
      return
    }
    const handle = setTimeout(() => {
      setLoading(true)
      changeListApi.compute({
        term_id: selectedTermId,
        department,
        old_rows: sheets[department] ?? [],
        enrollment_overrides: overrides[department] ?? {},
      })
        .then(rows => { setComputedRows(rows); setError(null) })
        .catch(() => setError('Could not compute the change list for this term/department.'))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(handle)
  }, [sheets, department, selectedTermId, overrides])

  const setOverride = (rowKey: string, value: number | null) => {
    if (!department) return
    setOverrides(prev => {
      const deptOverrides = { ...(prev[department] ?? {}) }
      if (value === null) delete deptOverrides[rowKey]
      else deptOverrides[rowKey] = value
      return { ...prev, [department]: deptOverrides }
    })
  }

  const deptOverrides = department ? overrides[department] ?? {} : {}

  return (
    <div>
      <div className="page-header">
        <h1>Change List</h1>
      </div>

      {/* Status */}
      <div style={{ padding: '8px 20px', fontSize: 13, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
        {sourceLabel}
        {department && sheets && <span> — working on <strong style={{ color: 'var(--text-primary)' }}>{department}</strong></span>}
        {loading && <span style={{ marginLeft: 12 }}>Computing…</span>}
        {error && <span style={{ color: 'var(--error)', marginLeft: 12 }}>{error}</span>}
      </div>

      {/* Control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)', flexWrap: 'wrap' }}>
        <select
          aria-label="Term"
          value={selectedTermId ?? ''}
          onChange={e => setSelectedTermId(+e.target.value)}
          style={{ padding: '5px 10px', fontSize: 13 }}
        >
          {terms.map(t => (
            <option key={t.id} value={t.id}>{termLabel(t)}</option>
          ))}
        </select>

        <input ref={importInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleImportDraft} />
        <button className="btn-secondary btn-sm" onClick={() => importInputRef.current?.click()}>
          Import Draft
        </button>

        {sheets && (
          <select
            aria-label="Department"
            value={department ?? ''}
            onChange={e => setDepartment(e.target.value)}
            style={{ padding: '5px 10px', fontSize: 13 }}
          >
            {Object.keys(sheets).map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}

        <div style={{ flex: 1 }} />

        <button className="btn-secondary btn-sm" onClick={handleSaveConfig} disabled={!sheets || !department}>
          Save Configuration
        </button>

        <input ref={loadInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleLoadConfig} />
        <button className="btn-secondary btn-sm" onClick={() => loadInputRef.current?.click()}>
          Load Configuration
        </button>

        <button className="btn-primary btn-sm" onClick={handleExport} disabled={!sheets || !department || computedRows.length === 0}>
          Export
        </button>
      </div>

      {/* Table */}
      <div className="page-content">
        {!sheets && (
          <div className="empty-state">
            <div className="icon">📄</div>
            Import a registrar draft spreadsheet or load a saved configuration to begin.
          </div>
        )}

        {sheets && computedRows.length === 0 && !loading && (
          <div className="empty-state">
            <div className="icon">📄</div>
            No rows for {department} in this term (nothing imported and nothing currently scheduled).
          </div>
        )}

        {sheets && computedRows.length > 0 && (
          <div className="change-list-table" style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>ADD/KEEP/CHANGE/DELETE</th>
                  {COLUMNS.map(c => (
                    <th key={c.key} style={{ whiteSpace: 'nowrap' }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {computedRows.map(row => (
                  <tr key={row.row_key}>
                    <td style={cellStyle(outlineColor(row, 'label'))}>{STATUS_TEXT[row.status]}</td>
                    {COLUMNS.map(c => {
                      if (c.key === 'enrollment_max') {
                        const overridden = deptOverrides[row.row_key] !== undefined
                        return (
                          <td key={c.key} style={cellStyle(outlineColor(row, 'enrollment_max'))}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input
                                type="number"
                                value={row.values.enrollment_max ?? ''}
                                onChange={e => setOverride(row.row_key, e.target.value === '' ? null : Number(e.target.value))}
                                style={{ width: 60, padding: '2px 4px', fontSize: 12 }}
                              />
                              <button
                                className="btn-secondary btn-sm"
                                title="Reset to original value"
                                disabled={!overridden}
                                onClick={() => setOverride(row.row_key, null)}
                                style={{ padding: '1px 6px' }}
                              >
                                ↺
                              </button>
                            </div>
                          </td>
                        )
                      }
                      return (
                        <td key={c.key} style={cellStyle(outlineColor(row, c.key))}>
                          {formatValue(row.values[c.key])}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
