import { useState, useEffect, useRef } from 'react'
import {
  doorTagAssetsApi, pdfPresetsApi,
  PDF_LAYOUT_OPTIONS, PDF_PAGE_SIZE_OPTIONS, PDF_ORIENTATION_OPTIONS, isFillLayout,
  DEFAULT_PRINT_CONFIG, type PrintConfig, type PdfLayoutPreset,
} from '../api'
import { FormModal } from './FormModal'
import { showToast } from './Toast'
import { useAuth } from '../contexts/AuthContext'

interface PrintConfigPanelProps {
  config: PrintConfig
  onChange: (config: PrintConfig) => void
}

// Collapsible "Export Configuration" section (feedback_64/65) shared by the
// Room Schedule and Faculty Schedule export panels — header/footer image (a
// single global asset, same as before), header/footer size, orientation,
// page size (+ custom dimensions), the two 8-option layout dropdowns (each
// with its own padding spin box once its layout isn't Fill), and
// saved-preset load/save. Fully controlled: the caller owns `config` and
// threads it into its own export URL builder.
export function PrintConfigPanel({ config, onChange }: PrintConfigPanelProps) {
  const { isLoggedIn } = useAuth()
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState<PdfLayoutPreset[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)

  const [hasHeaderImage, setHasHeaderImage] = useState(false)
  const [hasFooterImage, setHasFooterImage] = useState(false)
  const [uploadingHeader, setUploadingHeader] = useState(false)
  const [uploadingFooter, setUploadingFooter] = useState(false)
  const headerFileRef = useRef<HTMLInputElement>(null)
  const footerFileRef = useRef<HTMLInputElement>(null)

  const loadPresets = () => pdfPresetsApi.list().then(setPresets)

  useEffect(() => {
    loadPresets()
    doorTagAssetsApi.exists('header').then(setHasHeaderImage)
    doorTagAssetsApi.exists('footer').then(setHasFooterImage)
  }, [])

  const set = <K extends keyof PrintConfig>(key: K, value: PrintConfig[K]) => onChange({ ...config, [key]: value })

  const uploadAsset = async (kind: 'header' | 'footer', file: File) => {
    const setUploading = kind === 'header' ? setUploadingHeader : setUploadingFooter
    const setHas = kind === 'header' ? setHasHeaderImage : setHasFooterImage
    setUploading(true)
    try {
      await doorTagAssetsApi.upload(kind, file)
      setHas(true)
    } catch (e: any) {
      showToast(e.response?.data?.detail || `Failed to upload ${kind} image`)
    } finally {
      setUploading(false)
    }
  }

  const removeAsset = async (kind: 'header' | 'footer') => {
    const setHas = kind === 'header' ? setHasHeaderImage : setHasFooterImage
    try {
      await doorTagAssetsApi.remove(kind)
      setHas(false)
    } catch (e: any) {
      showToast(e.response?.data?.detail || `Failed to remove ${kind} image`)
    }
  }

  const applyPreset = (id: string) => {
    setSelectedPresetId(id)
    const preset = presets.find(p => String(p.id) === id)
    // Merge over the defaults so presets saved before a config field existed
    // (e.g. the padding settings added in feedback_65) still apply cleanly.
    if (preset) onChange({ ...DEFAULT_PRINT_CONFIG, ...preset.config })
  }

  const savePreset = async () => {
    if (!saveName.trim()) return
    setSaving(true)
    try {
      const created = await pdfPresetsApi.create(saveName.trim(), config)
      setShowSaveModal(false)
      setSaveName('')
      await loadPresets()
      setSelectedPresetId(String(created.id))
      showToast('Layout preset saved', 'success')
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to save preset')
    } finally {
      setSaving(false)
    }
  }

  const deletePreset = async (id: number) => {
    if (!confirm('Delete this saved layout?')) return
    try {
      await pdfPresetsApi.delete(id)
      if (selectedPresetId === String(id)) setSelectedPresetId('')
      await loadPresets()
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to delete preset')
    }
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
      >
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-bright)' }}>Export Configuration</h3>
        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{open ? '▲ Collapse' : '▼ Expand'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={selectedPresetId} onChange={e => applyPreset(e.target.value)} style={{ padding: '5px 8px', fontSize: 13 }}>
              <option value="">Select a saved layout...</option>
              {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {isLoggedIn && (
              <button className="btn-primary btn-sm" onClick={() => setShowSaveModal(true)}>Save Layout</button>
            )}
            {isLoggedIn && selectedPresetId && (
              <button className="btn-danger btn-sm" onClick={() => deletePreset(+selectedPresetId)}>Delete Selected</button>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            {([
              { kind: 'header' as const, label: 'Header Image', has: hasHeaderImage, uploading: uploadingHeader, ref: headerFileRef },
              { kind: 'footer' as const, label: 'Footer Image', has: hasFooterImage, uploading: uploadingFooter, ref: footerFileRef },
            ]).map(({ kind, label, has, uploading, ref }) => (
              <div key={kind}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {has && (
                    <img
                      src={doorTagAssetsApi.url(kind)}
                      alt={`${label} preview`}
                      style={{ height: 26, maxWidth: 80, objectFit: 'contain', background: 'var(--bg-elevated)', borderRadius: 3 }}
                    />
                  )}
                  <input
                    ref={ref}
                    type="file"
                    accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) uploadAsset(kind, file)
                      e.target.value = ''
                    }}
                  />
                  <button className="btn-secondary btn-sm" disabled={uploading} onClick={() => ref.current?.click()}>
                    {uploading ? 'Uploading...' : has ? 'Replace' : 'Upload'}
                  </button>
                  {has && <button className="btn-secondary btn-sm" onClick={() => removeAsset(kind)}>Remove</button>}
                </div>
              </div>
            ))}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Header Size</div>
              <input
                type="number" min={0.25} max={3} step={0.1}
                value={config.header_scale}
                onChange={e => set('header_scale', +e.target.value)}
                style={{ padding: '5px 8px', fontSize: 13, width: 70 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Footer Size</div>
              <input
                type="number" min={0.25} max={3} step={0.1}
                value={config.footer_scale}
                onChange={e => set('footer_scale', +e.target.value)}
                style={{ padding: '5px 8px', fontSize: 13, width: 70 }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Orientation</div>
              <select value={config.orientation} onChange={e => set('orientation', e.target.value)} style={{ padding: '5px 8px', fontSize: 13 }}>
                {PDF_ORIENTATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Page Size</div>
              <select value={config.page_size} onChange={e => set('page_size', e.target.value)} style={{ padding: '5px 8px', fontSize: 13 }}>
                {PDF_PAGE_SIZE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {config.page_size === 'custom' && (
              <>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Width (in)</div>
                  <input
                    type="number" min={1} max={60} step={0.5}
                    value={config.custom_width_in}
                    onChange={e => set('custom_width_in', +e.target.value)}
                    style={{ padding: '5px 8px', fontSize: 13, width: 70 }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Height (in)</div>
                  <input
                    type="number" min={1} max={60} step={0.5}
                    value={config.custom_height_in}
                    onChange={e => set('custom_height_in', +e.target.value)}
                    style={{ padding: '5px 8px', fontSize: 13, width: 70 }}
                  />
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Header Section Layout</div>
              <select value={config.header_layout} onChange={e => set('header_layout', e.target.value)} style={{ padding: '5px 8px', fontSize: 13 }}>
                {PDF_LAYOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {!isFillLayout(config.header_layout) && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Header Padding (in)</div>
                  <input
                    type="number" min={0} max={2} step={0.05}
                    value={config.header_padding_in}
                    onChange={e => set('header_padding_in', +e.target.value)}
                    style={{ padding: '5px 8px', fontSize: 13, width: 70 }}
                  />
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Info Text Area Layout</div>
              <select value={config.info_layout} onChange={e => set('info_layout', e.target.value)} style={{ padding: '5px 8px', fontSize: 13 }}>
                {PDF_LAYOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {!isFillLayout(config.info_layout) && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Info Padding (in)</div>
                  <input
                    type="number" min={0} max={2} step={0.05}
                    value={config.info_padding_in}
                    onChange={e => set('info_padding_in', +e.target.value)}
                    style={{ padding: '5px 8px', fontSize: 13, width: 70 }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <FormModal title="Save Layout Preset" onClose={() => setShowSaveModal(false)} onSave={savePreset} saving={saving}>
          <div className="form-group">
            <label>Preset Name</label>
            <input autoFocus value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="e.g. Landscape Flyer" />
          </div>
        </FormModal>
      )}
    </div>
  )
}
