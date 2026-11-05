import { useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { MapExportButton } from '../map/MapExportButton'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'
import { aminoAcidInfo } from '../../domain/protein'
import {
  defaultProteinClassColorPalette,
  defaultProteinResidueColorPalette,
  featureLabelModeIcon,
  normalizeProteinColorMode,
  proteinClassColorOptions,
  proteinColorCodes,
  type DisplaySettings,
  type ProteinClassColorPalette,
  type ProteinColorMode,
  type ProteinResidueColorPalette,
  type SelectionRange,
} from '../sequence'
import { SNAPGENE_USER_STRAND_COLORS } from '../../domain/snapgeneStrandColors'

export function ProteinColorDialog({
  enabled,
  mode,
  residuePalette,
  classPalette,
  onEnabledChange,
  onModeChange,
  onResiduePaletteChange,
  onClassPaletteChange,
  onCancel,
  onConfirm,
}: {
  enabled: boolean
  mode: ProteinColorMode
  residuePalette: ProteinResidueColorPalette
  classPalette: ProteinClassColorPalette
  onEnabledChange: (enabled: boolean) => void
  onModeChange: (mode: ProteinColorMode) => void
  onResiduePaletteChange: (palette: ProteinResidueColorPalette) => void
  onClassPaletteChange: (palette: ProteinClassColorPalette) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div className="translation-dialog protein-color-dialog" role="dialog" aria-modal="true" aria-label="Protein sequence colors" onPointerDown={(event) => event.stopPropagation()}>
        <h3>Protein Sequence Colors</h3>
        <label className="protein-color-enabled-row">
          <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
          <span>Show amino-acid colors</span>
        </label>
        <fieldset className="protein-color-mode-picker">
          <legend>Color source</legend>
          <label>
            <input type="radio" name="protein-color-mode" checked={mode === 'class'} onChange={() => onModeChange('class')} />
            <span>Colors by amino-acid type</span>
          </label>
          <label>
            <input type="radio" name="protein-color-mode" checked={mode === 'residue'} onChange={() => onModeChange('residue')} />
            <span>Colors by individual amino acid</span>
          </label>
          <label>
            <input type="radio" name="protein-color-mode" checked={mode === 'user'} onChange={() => onModeChange('user')} />
            <span>User-painted amino acids</span>
          </label>
        </fieldset>
        {mode === 'residue' ? (
          <div className="protein-color-palette-grid">
            {proteinColorCodes.map((code) => {
              const info = aminoAcidInfo(code)
              return (
                <label key={code} title={info.name}>
                  <strong>{code}</strong>
                  <span>{info.threeLetter}</span>
                  <input
                    type="color"
                    aria-label={`${info.name} color`}
                    value={residuePalette[code]}
                    onChange={(event) => onResiduePaletteChange({ ...residuePalette, [code]: event.target.value })}
                  />
                </label>
              )
            })}
          </div>
        ) : mode === 'class' ? (
          <div className="protein-color-palette-grid is-class-palette">
            {proteinClassColorOptions.map(({ code, label }) => (
              <label key={code}>
                <strong className={`protein-color-class-dot is-${code}`} style={{ background: classPalette[code] }} aria-hidden />
                <span>{label}</span>
                <input
                  type="color"
                  aria-label={`${label} amino-acid color`}
                  value={classPalette[code]}
                  onChange={(event) => onClassPaletteChange({ ...classPalette, [code]: event.target.value })}
                />
              </label>
            ))}
          </div>
        ) : (
          <p className="protein-color-user-hint">Select amino acids in Sequence view, then use the color swatches below the toolbar button to paint them.</p>
        )}
        <div className="translation-actions protein-color-actions">
          {mode === 'residue' ? <button type="button" onClick={() => onResiduePaletteChange(defaultProteinResidueColorPalette)}>Reset defaults</button> : null}
          {mode === 'class' ? <button type="button" onClick={() => onClassPaletteChange(defaultProteinClassColorPalette)}>Reset defaults</button> : null}
          <span className="protein-color-actions-spacer" />
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" onClick={onConfirm}>OK</button>
        </div>
      </div>
    </div>
  )
}

export function DnaUserColorIcon() {
  return (
    <svg viewBox="0 0 22 22" width={22} height={22} aria-hidden className="sidebar-tool-icon">
      <rect x="2" y="2" width="8" height="8" fill="#dc2626" />
      <rect x="12" y="2" width="8" height="8" fill="#2563eb" />
      <rect x="2" y="12" width="8" height="8" fill="#16a34a" />
      <rect x="12" y="12" width="8" height="8" fill="#c026d3" />
    </svg>
  )
}

export function FeatureLabelSidebarControl({
  settings,
  updateSection,
}: {
  settings: DisplaySettings
  updateSection: <Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const labelsOn = settings.features.labelsVisible
  const showAllMode = settings.features.externalLabels

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  function selectMode(externalLabels: boolean) {
    updateSection('features', { externalLabels, labelsVisible: true })
    setMenuOpen(false)
  }

  return (
    <div className={`sidebar-enzyme-split sidebar-feature-label-split ${labelsOn ? 'is-on' : ''} ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="sidebar-enzyme-toggle"
        title={
          labelsOn
            ? showAllMode
              ? 'Hide feature labels (internal and external)'
              : 'Hide feature labels (internal only)'
            : showAllMode
              ? 'Show feature labels (internal and external)'
              : 'Show feature labels (internal only)'
        }
        aria-pressed={labelsOn}
        onClick={() => updateSection('features', { labelsVisible: !labelsOn })}
      >
        <img src={showAllMode ? featureLabelModeIcon.all : featureLabelModeIcon.internal} alt="" className="sidebar-tool-icon" width={22} height={22} />
      </button>
      <button
        type="button"
        className="sidebar-enzyme-menu-trigger"
        title="Feature label options"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="sidebar-enzyme-caret" aria-hidden>
          ▾
        </span>
      </button>
      {menuOpen && (
        <div className="sidebar-menu sidebar-feature-label-picker" role="menu">
          <button type="button" className={`orf-mode-item ${showAllMode ? 'is-selected' : ''}`} onClick={() => selectMode(true)}>
            <span className="orf-mode-check">{showAllMode ? '✓' : ''}</span>
            <span className="orf-mode-label">Internal and external feature labels</span>
          </button>
          <button type="button" className={`orf-mode-item ${!showAllMode ? 'is-selected' : ''}`} onClick={() => selectMode(false)}>
            <span className="orf-mode-check">{!showAllMode ? '✓' : ''}</span>
            <span className="orf-mode-label">Internal feature labels only</span>
          </button>
        </div>
      )}
    </div>
  )
}

export function ProteinColorSidebarControl({
  settings,
  updateSection,
  selectedRange,
  sequenceLength,
  onPaintColor,
}: {
  settings: DisplaySettings
  updateSection: <Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) => void
  selectedRange: SelectionRange | null
  sequenceLength: number
  onPaintColor: (colorName: string | null) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [enabledDraft, setEnabledDraft] = useState(settings.proteinColors.enabled)
  const [modeDraft, setModeDraft] = useState<ProteinColorMode>(normalizeProteinColorMode(settings.proteinColors.mode))
  const [residuePaletteDraft, setResiduePaletteDraft] = useState<ProteinResidueColorPalette>(settings.proteinColors.residuePalette ?? defaultProteinResidueColorPalette)
  const [classPaletteDraft, setClassPaletteDraft] = useState<ProteinClassColorPalette>(settings.proteinColors.classPalette ?? defaultProteinClassColorPalette)
  const canPaintSelection = Boolean(selectedRange && selectedRange.end > selectedRange.start && sequenceLength > 0)
  const currentMode = normalizeProteinColorMode(settings.proteinColors.mode)
  const showUserPalette = settings.proteinColors.enabled && currentMode === 'user'
  const rootRef = useRef<HTMLDivElement>(null)

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  function selectMode(mode: ProteinColorMode) {
    updateSection('proteinColors', { mode, enabled: true })
    setMenuOpen(false)
  }

  function openDialog() {
    setMenuOpen(false)
    setEnabledDraft(settings.proteinColors.enabled)
    setModeDraft(currentMode)
    setResiduePaletteDraft(settings.proteinColors.residuePalette ?? defaultProteinResidueColorPalette)
    setClassPaletteDraft(settings.proteinColors.classPalette ?? defaultProteinClassColorPalette)
    setDialogOpen(true)
  }

  function confirmDialog() {
    updateSection('proteinColors', {
      enabled: enabledDraft,
      mode: modeDraft,
      residuePalette: residuePaletteDraft,
      classPalette: classPaletteDraft,
    })
    setDialogOpen(false)
  }

  return (
    <>
      <div className="sidebar-protein-color-control">
        <div className={`sidebar-enzyme-split sidebar-dna-split ${settings.proteinColors.enabled ? 'is-on' : ''} ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
          <button
            type="button"
            className="sidebar-enzyme-toggle sidebar-protein-colors-button"
            title={settings.proteinColors.enabled ? 'Hide amino-acid colors' : 'Show amino-acid colors'}
            aria-pressed={settings.proteinColors.enabled}
            onClick={() => updateSection('proteinColors', { enabled: !settings.proteinColors.enabled })}
          >
            <DnaUserColorIcon />
          </button>
          <button
            type="button"
            className="sidebar-enzyme-menu-trigger"
            title="Protein color options"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
          </button>
          {menuOpen ? (
            <div className="sidebar-menu sidebar-dna-picker sidebar-protein-color-picker" role="menu">
              {([
                ['class', 'Colors by amino-acid type'],
                ['residue', 'Colors by individual amino acid'],
                ['user', 'User-painted amino acids'],
              ] as const).map(([mode, label]) => (
                <button key={mode} type="button" className={`orf-mode-item ${currentMode === mode ? 'is-selected' : ''}`} onClick={() => selectMode(mode)}>
                  <span className="orf-mode-check">{currentMode === mode ? '✓' : ''}</span>
                  <span className="orf-mode-label">{label}</span>
                </button>
              ))}
              <div className="sidebar-menu-divider" />
              <button type="button" className="orf-mode-item" onClick={openDialog}>
                <span className="orf-mode-check" aria-hidden />
                <span className="orf-mode-label">Set Protein Colors...</span>
              </button>
            </div>
          ) : null}
        </div>
        {showUserPalette ? (
          <div className="sidebar-user-color-tools">
            <div className="sidebar-strand-color-palette" role="toolbar" aria-label="User amino-acid colors">
              <button
                type="button"
                className="sidebar-strand-color-swatch is-no-color"
                title={canPaintSelection ? 'Remove color from selected amino acids' : 'Select amino acids to remove their color'}
                aria-label="No color"
                disabled={!canPaintSelection}
                onClick={() => onPaintColor(null)}
              />
              {SNAPGENE_USER_STRAND_COLORS.map((entry) => (
                <button
                  key={entry.name}
                  type="button"
                  className="sidebar-strand-color-swatch"
                  title={canPaintSelection ? `Paint selected amino acids ${entry.label}` : 'Select amino acids to paint'}
                  aria-label={entry.label}
                  disabled={!canPaintSelection}
                  style={{ background: entry.css }}
                  onClick={() => onPaintColor(entry.name)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {dialogOpen ? (
        <ProteinColorDialog
          enabled={enabledDraft}
          mode={modeDraft}
          residuePalette={residuePaletteDraft}
          classPalette={classPaletteDraft}
          onEnabledChange={setEnabledDraft}
          onModeChange={setModeDraft}
          onResiduePaletteChange={setResiduePaletteDraft}
          onClassPaletteChange={setClassPaletteDraft}
          onCancel={() => setDialogOpen(false)}
          onConfirm={confirmDialog}
        />
      ) : null}
    </>
  )
}

export function ProteinViewSidebar({
  id,
  recordName,
  settings,
  showMapVisualControls = false,
  showSequenceVisualControls = false,
  showAlignmentVisualControls = false,
  selectedRange,
  sequenceLength,
  onPaintColor,
  onToggleMapZoom,
  onChange,
}: {
  id?: string
  recordName: string
  settings: DisplaySettings
  showMapVisualControls?: boolean
  showSequenceVisualControls?: boolean
  showAlignmentVisualControls?: boolean
  selectedRange: SelectionRange | null
  sequenceLength: number
  onPaintColor: (colorName: string | null) => void
  onToggleMapZoom?: () => void
  onChange: (updater: (current: DisplaySettings) => DisplaySettings) => void
}) {
  function updateSection<Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) {
    onChange((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }))
  }

  const visualControlsOpen = showMapVisualControls
    ? settings.proteinMapVisual.panelOpen
    : showAlignmentVisualControls
      ? settings.proteinAlignmentVisual.panelOpen
      : showSequenceVisualControls
        ? settings.proteinSequenceVisual.panelOpen
        : false

  function toggleVisualControls() {
    if (showMapVisualControls) {
      updateSection('proteinMapVisual', { panelOpen: !settings.proteinMapVisual.panelOpen })
      return
    }
    if (showAlignmentVisualControls) {
      updateSection('proteinAlignmentVisual', { panelOpen: !settings.proteinAlignmentVisual.panelOpen })
      return
    }
    if (showSequenceVisualControls) {
      updateSection('proteinSequenceVisual', { panelOpen: !settings.proteinSequenceVisual.panelOpen })
    }
  }

  return (
    <aside id={id} className="view-sidebar protein-view-sidebar" aria-label="Protein display controls">
      <button
        type="button"
        className={`sidebar-tool-button sidebar-feature-button ${settings.features.visible ? 'is-active' : ''}`}
        title={settings.features.visible ? 'Hide features' : 'Show features'}
        aria-pressed={settings.features.visible}
        onClick={() => updateSection('features', { visible: !settings.features.visible })}
      >
        <img src="/feature-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
      </button>

      <button
        type="button"
        className={`sidebar-tool-button sidebar-protein-bonds-button ${settings.proteinBonds.visible ? 'is-active' : ''}`}
        title={settings.proteinBonds.visible ? 'Hide bonds' : 'Show bonds'}
        aria-pressed={settings.proteinBonds.visible}
        onClick={() => updateSection('proteinBonds', { visible: !settings.proteinBonds.visible })}
      >
        <img
          src={settings.proteinBonds.visible ? '/protein-bonds-on-icon.png' : '/protein-bonds-off-icon.png'}
          alt=""
          className="sidebar-tool-icon"
          width={22}
          height={22}
        />
      </button>

      <ProteinColorSidebarControl
        settings={settings}
        updateSection={updateSection}
        selectedRange={selectedRange}
        sequenceLength={sequenceLength}
        onPaintColor={onPaintColor}
      />

      <FeatureLabelSidebarControl settings={settings} updateSection={updateSection} />

      {onToggleMapZoom ? (
        <button
          type="button"
          className={`sidebar-tool-button sidebar-map-zoom-button ${settings.mapView.zoom ? 'is-active' : ''}`}
          title={settings.mapView.zoom ? 'Exit zoom' : 'Zoom protein sequence / map'}
          aria-pressed={settings.mapView.zoom}
          onClick={onToggleMapZoom}
        >
          <Search className="sidebar-tool-icon" size={20} strokeWidth={1.85} aria-hidden />
        </button>
      ) : null}

      <button
        type="button"
        className={`sidebar-tool-button sidebar-alignments-button ${settings.alignments.visible ? 'is-active' : ''}`}
        title={settings.alignments.visible ? 'Hide protein alignments' : 'Show protein alignments'}
        aria-pressed={settings.alignments.visible}
        onClick={() => {
          const nextVisible = !settings.alignments.visible
          onChange((current) => ({
            ...current,
            alignments: { ...current.alignments, visible: nextVisible },
            ...(nextVisible ? { mapView: { ...current.mapView, zoom: false } } : {}),
          }))
        }}
      >
        <img src="/protein-alignments-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
      </button>

      {showMapVisualControls || showSequenceVisualControls || showAlignmentVisualControls ? (
        <>
          <div className="sidebar-spacer" aria-hidden />
          <button
            type="button"
            className={`sidebar-tool-button sidebar-visual-controls-button ${visualControlsOpen ? 'is-active' : ''}`}
            title={visualControlsOpen ? 'Hide visual controls' : 'Show visual controls'}
            aria-pressed={visualControlsOpen}
            onClick={toggleVisualControls}
          >
            <img src="/vis-settings-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
          </button>
          {showMapVisualControls ? (
            <MapExportButton
              recordName={recordName}
              title={settings.mapView.zoom ? 'Export zoomed protein map' : 'Export protein map'}
            />
          ) : null}
        </>
      ) : null}
    </aside>
  )
}
