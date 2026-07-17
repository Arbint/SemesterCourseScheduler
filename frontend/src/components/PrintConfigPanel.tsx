import { useState, useEffect, useRef, type ReactNode } from 'react'
import {
  doorTagAssetsApi, pdfPresetsApi,
  PDF_LAYOUT_OPTIONS, PDF_PAGE_SIZE_OPTIONS, PDF_ORIENTATION_OPTIONS, isFillLayout,
  DEFAULT_PRINT_CONFIG, type PrintConfig, type PdfLayoutPreset, type AssetScope,
} from '../api'
import { FormModal } from './FormModal'
import { showToast } from './Toast'
import { useAuth } from '../contexts/AuthContext'
import { SearchableSelect, type SearchableOption } from './SearchableSelect'

const labelStyle = { fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 } as const
const numberInputStyle = { padding: '5px 8px', fontSize: 13, width: 70 } as const
const colorInputStyle = { width: 44, height: 32, padding: 2, border: '1px solid var(--border-color)', borderRadius: 4, background: 'transparent', cursor: 'pointer' } as const

// One "Table Body" row (feedback_70) — a font-size multiplier next to a
// native color swatch, plus an optional vertical padding field (feedback_71,
// the gap inserted above this line within its cell). Takes plain
// value/setter pairs rather than PrintConfig keys so it stays fully
// type-safe without generic key-narrowing machinery.
function sizeColorField(
  label: string, sizeValue: number, onSize: (v: number) => void, colorValue: string, onColor: (v: string) => void,
  padding?: { value: number; onChange: (v: number) => void },
) {
  return (
    <div key={label}>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="number" min={0.25} max={3} step={0.1} value={sizeValue} onChange={e => onSize(+e.target.value)} style={numberInputStyle} />
        <input type="color" value={colorValue} onChange={e => onColor(e.target.value)} style={colorInputStyle} />
        {padding && (
          <input
            type="number" min={0} max={0.5} step={0.02} title="Padding above this line (in)"
            value={padding.value} onChange={e => padding.onChange(+e.target.value)}
            style={{ ...numberInputStyle, width: 56 }}
          />
        )}
      </div>
    </div>
  )
}

// Every numeric PrintConfig field — used to keep OffsetDPad (below) fully
// type-safe without repeating its ~70 lines of JSX for header/footer/icon.
type NumericKey = { [K in keyof PrintConfig]: PrintConfig[K] extends number ? K : never }[keyof PrintConfig]

// One reusable "nudge" D-pad (feedback_67, extended to footer + attribute
// icons in feedback_69) — 4 arrows, each with its own step-size field, plus
// a live x/y readout and a reset. `x`/`y` are the offset fields it mutates;
// `stepUp`/`stepDown`/`stepLeft`/`stepRight` are the per-arrow increments.
function OffsetDPad({ config, onChange, x, y, stepUp, stepDown, stepLeft, stepRight }: {
  config: PrintConfig
  onChange: (config: PrintConfig) => void
  x: NumericKey; y: NumericKey
  stepUp: NumericKey; stepDown: NumericKey; stepLeft: NumericKey; stepRight: NumericKey
}) {
  const set = (key: NumericKey, value: number) => onChange({ ...config, [key]: value })
  const stepInput = (key: NumericKey, title: string) => (
    <input
      type="number" min={0} step={0.05} title={title}
      value={config[key]}
      onChange={e => set(key, +e.target.value)}
      style={{ width: 44, padding: '2px 4px', fontSize: 11 }}
    />
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '44px 64px 44px', gap: 4, justifyItems: 'center' }}>
      <div />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <button type="button" className="btn-secondary btn-sm" title="Nudge up" style={{ padding: '2px 8px' }}
          onClick={() => set(y, config[y] + config[stepUp])}>▲</button>
        {stepInput(stepUp, 'Up step (in)')}
      </div>
      <div />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <button type="button" className="btn-secondary btn-sm" title="Nudge left" style={{ padding: '2px 8px' }}
          onClick={() => set(x, config[x] - config[stepLeft])}>◀</button>
        {stepInput(stepLeft, 'Left step (in)')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-secondary)', height: '100%' }}>
        <div>{config[x].toFixed(2)}, {config[y].toFixed(2)}</div>
        <button type="button" className="btn-secondary btn-sm" title="Reset offset" style={{ padding: '1px 6px', fontSize: 10, marginTop: 2 }}
          onClick={() => onChange({ ...config, [x]: 0, [y]: 0 })}>Reset</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <button type="button" className="btn-secondary btn-sm" title="Nudge right" style={{ padding: '2px 8px' }}
          onClick={() => set(x, config[x] + config[stepRight])}>▶</button>
        {stepInput(stepRight, 'Right step (in)')}
      </div>

      <div />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <button type="button" className="btn-secondary btn-sm" title="Nudge down" style={{ padding: '2px 8px' }}
          onClick={() => set(y, config[y] - config[stepDown])}>▼</button>
        {stepInput(stepDown, 'Down step (in)')}
      </div>
      <div />
    </div>
  )
}

// A collapsible sub-heading used for the Header/Footer groups.
function CollapsibleGroup({ title, open, onToggle, children }: {
  title: string; open: boolean; onToggle: () => void; children: ReactNode
}) {
  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
        <h4 style={{ margin: 0, fontSize: 13, color: 'var(--text-bright)' }}>{title}</h4>
        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{open ? '▲ Collapse' : '▼ Expand'}</span>
      </div>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  )
}

interface PrintConfigPanelProps {
  config: PrintConfig
  onChange: (config: PrintConfig) => void
  // Preview sub-section (feedback_66) — the entity list to search ("which
  // table to preview" = which room/faculty schedule, whichever this export
  // is keyed on) and a URL builder closing over the caller's own term/label
  // state. Icon Size only makes sense for the Faculty Schedule export.
  previewOptions: SearchableOption[]
  buildPreviewUrl: (entityId: number) => string | null
  showIconSize?: boolean
  // Room Schedule and Faculty Schedule each get their own independent
  // header/footer images and saved layout presets (feedback_69) — never
  // mixed between the two tabs.
  assetScope: AssetScope
  presetScope: AssetScope
}

// Collapsible "Export Configuration" section (feedback_64-69) shared by the
// Room Schedule and Faculty Schedule export panels. Layout: saved-preset
// row, Overall settings, a collapsible Header group (text/image/attribute
// icon sub-settings), a collapsible Footer group (image settings, identical
// to Header's), Table Body font sizes, and the Preview column. Fully
// controlled: the caller owns `config` and threads it into its own export
// URL builder.
export function PrintConfigPanel({
  config, onChange, previewOptions, buildPreviewUrl, showIconSize, assetScope, presetScope,
}: PrintConfigPanelProps) {
  const { isLoggedIn } = useAuth()
  const [open, setOpen] = useState(false)
  const [presets, setPresets] = useState<PdfLayoutPreset[]>([])
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [duplicateName, setDuplicateName] = useState('')
  const [duplicating, setDuplicating] = useState(false)

  const [headerOpen, setHeaderOpen] = useState(false)
  const [footerOpen, setFooterOpen] = useState(false)

  const [hasHeaderImage, setHasHeaderImage] = useState(false)
  const [hasFooterImage, setHasFooterImage] = useState(false)
  const [uploadingHeader, setUploadingHeader] = useState(false)
  const [uploadingFooter, setUploadingFooter] = useState(false)
  const headerFileRef = useRef<HTMLInputElement>(null)
  const footerFileRef = useRef<HTMLInputElement>(null)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewEntityId, setPreviewEntityId] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // buildPreviewUrl is a fresh closure every parent render — read it via a
  // ref so the debounce effect below only reacts to *semantic* changes
  // (previewOpen/previewEntityId/config), not the caller re-rendering.
  const buildPreviewUrlRef = useRef(buildPreviewUrl)
  buildPreviewUrlRef.current = buildPreviewUrl

  // Debounced so dragging a spinner or typing a font-size value doesn't
  // re-render the PDF on every keystroke — only once things settle. The
  // export routes default to Content-Disposition: attachment (so the
  // Export button downloads a file); the preview needs the PDF to render
  // in-place instead, so it appends inline=true to whatever URL the caller
  // builds rather than downloading it.
  useEffect(() => {
    if (!previewOpen || previewEntityId == null) { setPreviewUrl(null); return }
    const handle = setTimeout(() => {
      const url = buildPreviewUrlRef.current(previewEntityId)
      setPreviewUrl(url ? `${url}${url.includes('?') ? '&' : '?'}inline=true` : null)
    }, 500)
    return () => clearTimeout(handle)
  }, [previewOpen, previewEntityId, config])

  useEffect(() => {
    if (previewEntityId == null && previewOptions.length > 0) setPreviewEntityId(previewOptions[0].id)
  }, [previewOptions, previewEntityId])

  const loadPresets = () => pdfPresetsApi.list(presetScope).then(setPresets)

  useEffect(() => {
    loadPresets()
    doorTagAssetsApi.exists('header', assetScope).then(setHasHeaderImage)
    doorTagAssetsApi.exists('footer', assetScope).then(setHasFooterImage)
    setSelectedPresetId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetScope, presetScope])

  const set = <K extends keyof PrintConfig>(key: K, value: PrintConfig[K]) => onChange({ ...config, [key]: value })

  const uploadAsset = async (kind: 'header' | 'footer', file: File) => {
    const setUploading = kind === 'header' ? setUploadingHeader : setUploadingFooter
    const setHas = kind === 'header' ? setHasHeaderImage : setHasFooterImage
    setUploading(true)
    try {
      await doorTagAssetsApi.upload(kind, assetScope, file)
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
      await doorTagAssetsApi.remove(kind, assetScope)
      setHas(false)
    } catch (e: any) {
      showToast(e.response?.data?.detail || `Failed to remove ${kind} image`)
    }
  }

  const selectedPreset = presets.find(p => String(p.id) === selectedPresetId)

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
      const created = await pdfPresetsApi.create(saveName.trim(), presetScope, config)
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

  const renamePreset = async () => {
    if (!renameName.trim() || !selectedPreset) return
    setRenaming(true)
    try {
      await pdfPresetsApi.rename(selectedPreset.id, renameName.trim())
      setShowRenameModal(false)
      await loadPresets()
      showToast('Layout renamed', 'success')
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to rename preset')
    } finally {
      setRenaming(false)
    }
  }

  const duplicatePreset = async () => {
    if (!duplicateName.trim() || !selectedPreset) return
    setDuplicating(true)
    try {
      const created = await pdfPresetsApi.create(duplicateName.trim(), presetScope, selectedPreset.config)
      setShowDuplicateModal(false)
      setDuplicateName('')
      await loadPresets()
      setSelectedPresetId(String(created.id))
      showToast('Layout duplicated', 'success')
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to duplicate preset')
    } finally {
      setDuplicating(false)
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

  // Header/Footer Image Settings are structurally identical — upload/replace
  // controls + a Size multiplier laid out beside (not above) the D-pad, so
  // the row's height is just the D-pad's height instead of the D-pad plus
  // several stacked rows above it.
  const imageSettings = (kind: 'header' | 'footer') => {
    const has = kind === 'header' ? hasHeaderImage : hasFooterImage
    const uploading = kind === 'header' ? uploadingHeader : uploadingFooter
    const ref = kind === 'header' ? headerFileRef : footerFileRef
    const scaleKey = kind === 'header' ? 'header_scale' as const : 'footer_scale' as const
    const label = kind === 'header' ? 'Header' : 'Footer'
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div>
          <div style={labelStyle}>{label} Image</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {has && (
              <img
                src={doorTagAssetsApi.url(kind, assetScope)}
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
          <div style={{ marginTop: 10 }}>
            <div style={labelStyle}>{label} Size</div>
            <input
              type="number" min={0.25} max={3} step={0.1}
              value={config[scaleKey]}
              onChange={e => set(scaleKey, +e.target.value)}
              style={numberInputStyle}
            />
          </div>
        </div>
        <div>
          <div style={labelStyle}>{label} Image Offset</div>
          {kind === 'header' ? (
            <OffsetDPad
              config={config} onChange={onChange}
              x="header_offset_x_in" y="header_offset_y_in"
              stepUp="header_offset_step_up_in" stepDown="header_offset_step_down_in"
              stepLeft="header_offset_step_left_in" stepRight="header_offset_step_right_in"
            />
          ) : (
            <OffsetDPad
              config={config} onChange={onChange}
              x="footer_offset_x_in" y="footer_offset_y_in"
              stepUp="footer_offset_step_up_in" stepDown="footer_offset_step_down_in"
              stepLeft="footer_offset_step_left_in" stepRight="footer_offset_step_right_in"
            />
          )}
        </div>
      </div>
    )
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
              <>
                <button className="btn-secondary btn-sm" onClick={() => { setRenameName(selectedPreset?.name ?? ''); setShowRenameModal(true) }}>Rename Selected</button>
                <button className="btn-secondary btn-sm" onClick={() => { setDuplicateName(`${selectedPreset?.name ?? ''} (copy)`); setShowDuplicateModal(true) }}>Duplicate Selected</button>
                <button className="btn-danger btn-sm" onClick={() => deletePreset(+selectedPresetId)}>Delete Selected</button>
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 480px', minWidth: 320 }}>

          <div>
            <h4 style={{ margin: 0, fontSize: 13, color: 'var(--text-bright)' }}>Overall Settings</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
              <div>
                <div style={labelStyle}>Orientation</div>
                <select value={config.orientation} onChange={e => set('orientation', e.target.value)} style={{ padding: '5px 8px', fontSize: 13 }}>
                  {PDF_ORIENTATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <div style={labelStyle}>Margin (in)</div>
                <input
                  type="number" min={0.1} max={2} step={0.05}
                  value={config.margin_in}
                  onChange={e => set('margin_in', +e.target.value)}
                  style={numberInputStyle}
                />
              </div>
              <div>
                <div style={labelStyle}>Page Size</div>
                <select value={config.page_size} onChange={e => set('page_size', e.target.value)} style={{ padding: '5px 8px', fontSize: 13 }}>
                  {PDF_PAGE_SIZE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {config.page_size === 'custom' && (
                <>
                  <div>
                    <div style={labelStyle}>Width (in)</div>
                    <input
                      type="number" min={1} max={60} step={0.5}
                      value={config.custom_width_in}
                      onChange={e => set('custom_width_in', +e.target.value)}
                      style={numberInputStyle}
                    />
                  </div>
                  <div>
                    <div style={labelStyle}>Height (in)</div>
                    <input
                      type="number" min={1} max={60} step={0.5}
                      value={config.custom_height_in}
                      onChange={e => set('custom_height_in', +e.target.value)}
                      style={numberInputStyle}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <CollapsibleGroup title="Header" open={headerOpen} onToggle={() => setHeaderOpen(o => !o)}>
            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>Header Top Padding (in)</div>
              <input
                type="number" min={0} max={1} step={0.05}
                value={config.header_top_padding_in}
                onChange={e => set('header_top_padding_in', +e.target.value)}
                style={numberInputStyle}
              />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 8 }}>Header Text Info Settings</div>
            {showIconSize && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
                {([
                  { key: 'show_rank' as const, label: 'Rank' },
                  { key: 'show_office' as const, label: 'Office' },
                  { key: 'show_tags' as const, label: 'Tags' },
                  { key: 'show_attributes' as const, label: 'Attributes' },
                ]).map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', fontSize: 13, color: 'var(--text-primary)' }}>
                    <input type="checkbox" checked={config[key]} onChange={e => set(key, e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                    {label}
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
              <div>
                <div style={labelStyle}>Header Section Layout</div>
                <select value={config.header_layout} onChange={e => set('header_layout', e.target.value)} style={{ padding: '5px 8px', fontSize: 13 }}>
                  {PDF_LAYOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {!isFillLayout(config.header_layout) && (
                  <div style={{ marginTop: 8 }}>
                    <div style={labelStyle}>Header Padding (in)</div>
                    <input
                      type="number" min={0} max={2} step={0.05}
                      value={config.header_padding_in}
                      onChange={e => set('header_padding_in', +e.target.value)}
                      style={numberInputStyle}
                    />
                  </div>
                )}
              </div>
              <div>
                <div style={labelStyle}>Info Text Area Layout</div>
                <select value={config.info_layout} onChange={e => set('info_layout', e.target.value)} style={{ padding: '5px 8px', fontSize: 13 }}>
                  {PDF_LAYOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {!isFillLayout(config.info_layout) && (
                  <div style={{ marginTop: 8 }}>
                    <div style={labelStyle}>Info Padding (in)</div>
                    <input
                      type="number" min={0} max={2} step={0.05}
                      value={config.info_padding_in}
                      onChange={e => set('info_padding_in', +e.target.value)}
                      style={numberInputStyle}
                    />
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {([
                { key: 'name_font_scale' as const, label: 'Name Font Size' },
                { key: 'info_font_scale' as const, label: 'Info Font Size' },
                { key: 'semester_font_scale' as const, label: 'Semester Font Size' },
              ]).map(({ key, label }) => (
                <div key={key}>
                  <div style={labelStyle}>{label}</div>
                  <input
                    type="number" min={0.25} max={3} step={0.1}
                    value={config[key]}
                    onChange={e => set(key, +e.target.value)}
                    style={numberInputStyle}
                  />
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-bright)', margin: '16px 0 8px' }}>Header Image Settings</div>
            {imageSettings('header')}

            {showIconSize && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-bright)', margin: '16px 0 8px' }}>Attribute Image Settings</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
                  <div>
                    <div style={labelStyle}>Icon Size</div>
                    <input
                      type="number" min={0.25} max={20} step={0.25}
                      value={config.icon_scale}
                      onChange={e => set('icon_scale', +e.target.value)}
                      style={numberInputStyle}
                    />
                  </div>
                  <div>
                    <div style={labelStyle}>Attribute Icon Offset</div>
                    <OffsetDPad
                      config={config} onChange={onChange}
                      x="icon_offset_x_in" y="icon_offset_y_in"
                      stepUp="icon_offset_step_up_in" stepDown="icon_offset_step_down_in"
                      stepLeft="icon_offset_step_left_in" stepRight="icon_offset_step_right_in"
                    />
                  </div>
                </div>
              </>
            )}
          </CollapsibleGroup>

          <CollapsibleGroup title="Footer" open={footerOpen} onToggle={() => setFooterOpen(o => !o)}>
            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>Footer Top Padding (in)</div>
              <input
                type="number" min={0} max={1} step={0.05}
                value={config.footer_top_padding_in}
                onChange={e => set('footer_top_padding_in', +e.target.value)}
                style={numberInputStyle}
              />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 8 }}>Footer Image Settings</div>
            {imageSettings('footer')}
          </CollapsibleGroup>

          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: 0, fontSize: 13, color: 'var(--text-bright)' }}>Table Body</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
              <div>
                <div style={labelStyle}>Table Top Padding (in)</div>
                <input
                  type="number" min={0} max={1} step={0.05}
                  value={config.table_top_padding_in}
                  onChange={e => set('table_top_padding_in', +e.target.value)}
                  style={numberInputStyle}
                />
              </div>
              <div>
                <div style={labelStyle}>Empty Slot Background Color</div>
                <input type="color" value={config.empty_bg_color} onChange={e => set('empty_bg_color', e.target.value)} style={colorInputStyle} />
              </div>
              {sizeColorField('Empty Slot Font', config.empty_font_scale, v => set('empty_font_scale', v), config.empty_font_color, v => set('empty_font_color', v))}
              {sizeColorField(
                'Name Font', config.entry_name_font_scale, v => set('entry_name_font_scale', v), config.entry_name_font_color, v => set('entry_name_font_color', v),
                { value: config.entry_name_padding_in, onChange: v => set('entry_name_padding_in', v) },
              )}
              {sizeColorField(
                'Instructor Name Font', config.entry_instructor_font_scale, v => set('entry_instructor_font_scale', v), config.entry_instructor_font_color, v => set('entry_instructor_font_color', v),
                { value: config.entry_instructor_padding_in, onChange: v => set('entry_instructor_padding_in', v) },
              )}
              {sizeColorField(
                'Time Range Font', config.entry_time_font_scale, v => set('entry_time_font_scale', v), config.entry_time_font_color, v => set('entry_time_font_color', v),
                { value: config.entry_time_padding_in, onChange: v => set('entry_time_padding_in', v) },
              )}
              {sizeColorField('Time Label Font', config.time_font_scale, v => set('time_font_scale', v), config.time_font_color, v => set('time_font_color', v))}
              {sizeColorField('Weekday Font', config.weekday_font_scale, v => set('weekday_font_scale', v), config.weekday_font_color, v => set('weekday_font_color', v))}
              <div>
                <div style={labelStyle}>Weekday Offset (in)</div>
                <input
                  type="number" step={0.05}
                  value={config.weekday_offset_y_in}
                  onChange={e => set('weekday_offset_y_in', +e.target.value)}
                  style={numberInputStyle}
                />
              </div>
            </div>
          </div>

          </div>

          <div style={{ flex: '1 1 420px', minWidth: 320, borderLeft: '1px solid var(--border-color)', paddingLeft: 24 }}>
            <div
              onClick={() => setPreviewOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
            >
              <h4 style={{ margin: 0, fontSize: 13, color: 'var(--text-bright)' }}>Preview</h4>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{previewOpen ? '▲ Collapse' : '▼ Expand'}</span>
            </div>

            {previewOpen && (
              <div style={{ marginTop: 12 }}>
                <SearchableSelect
                  options={previewOptions}
                  selectedId={previewEntityId}
                  onSelect={setPreviewEntityId}
                  placeholder="Select to preview..."
                  searchPlaceholder="Search..."
                />
                <div style={{ marginTop: 12 }}>
                  {previewUrl ? (
                    <iframe
                      key={previewEntityId ?? undefined}
                      src={previewUrl}
                      title="Export preview"
                      style={{ width: '100%', height: 700, border: '1px solid var(--border-color)', borderRadius: 4, background: '#fff' }}
                    />
                  ) : (
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 12 }}>
                      {previewOptions.length === 0 ? 'Nothing available to preview yet.' : 'Select an item above to preview its export.'}
                    </div>
                  )}
                </div>
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

      {showRenameModal && (
        <FormModal title="Rename Layout Preset" onClose={() => setShowRenameModal(false)} onSave={renamePreset} saving={renaming}>
          <div className="form-group">
            <label>Preset Name</label>
            <input autoFocus value={renameName} onChange={e => setRenameName(e.target.value)} />
          </div>
        </FormModal>
      )}

      {showDuplicateModal && (
        <FormModal title="Duplicate Layout Preset" onClose={() => setShowDuplicateModal(false)} onSave={duplicatePreset} saving={duplicating}>
          <div className="form-group">
            <label>New Preset Name</label>
            <input autoFocus value={duplicateName} onChange={e => setDuplicateName(e.target.value)} />
          </div>
        </FormModal>
      )}
    </div>
  )
}
