import { useRef, useState } from 'react'
import { DnaUserColorIcon } from '../protein'
import { SNAPGENE_USER_STRAND_COLORS } from '../../domain/snapgeneStrandColors'
import {
  dnaColorModeIcon,
  type DisplaySettings,
  type DnaColorMode,
  type DnaColorPalette,
  type SelectionRange,
  type UserStrandPaintTarget,
} from '../sequence'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'

export function SetDnaColorDialog({
  draft,
  onDraftChange,
  onCancel,
  onConfirm,
}: {
  draft: DnaColorPalette
  onDraftChange: (patch: Partial<DnaColorPalette>) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div className="translation-dialog" role="dialog" aria-modal="true" aria-label="Set DNA Color" onPointerDown={(event) => event.stopPropagation()}>
        <h3>Set DNA Color</h3>
        {(['A', 'C', 'G', 'T'] as const).map((base) => (
          <label key={base} className="translation-field-row">
            <span>{base}:</span>
            <input type="color" value={draft[base]} onChange={(event) => onDraftChange({ [base]: event.target.value })} />
          </label>
        ))}
        <div className="translation-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" onClick={onConfirm}>OK</button>
        </div>
      </div>
    </div>
  )
}
export function SelectRangeDialog({
  sequenceLength,
  initialStart,
  initialEnd,
  onCancel,
  onConfirm,
}: {
  sequenceLength: number
  initialStart: number
  initialEnd: number
  onCancel: () => void
  onConfirm: (start: number, end: number) => void
}) {
  const [startInput, setStartInput] = useState(String(initialStart))
  const [endInput, setEndInput] = useState(String(initialEnd))

  const start = Number.parseInt(startInput, 10)
  const end = Number.parseInt(endInput, 10)
  const valid =
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 1 &&
    end >= start &&
    end <= sequenceLength

  const confirm = () => {
    if (!valid) return
    onConfirm(start, end)
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog select-range-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Select range"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3>Select range</h3>
        <p className="select-range-hint">Enter 1-based start and end positions (1–{sequenceLength}).</p>
        <label className="translation-field-row">
          <span>From:</span>
          <input
            type="number"
            min={1}
            max={sequenceLength}
            value={startInput}
            autoFocus
            onChange={(event) => setStartInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                confirm()
              }
            }}
          />
        </label>
        <label className="translation-field-row">
          <span>To:</span>
          <input
            type="number"
            min={1}
            max={sequenceLength}
            value={endInput}
            onChange={(event) => setEndInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                confirm()
              }
            }}
          />
        </label>
        <div className="translation-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" disabled={!valid} onClick={confirm}>Select</button>
        </div>
      </div>
    </div>
  )
}


export function StrandPaintTargetSwitch({
  value,
  onChange,
}: {
  value: UserStrandPaintTarget
  onChange: (target: UserStrandPaintTarget) => void
}) {
  const options: Array<{ target: UserStrandPaintTarget; title: string }> = [
    { target: 'top', title: 'Paint top strand' },
    { target: 'both', title: 'Paint both strands' },
    { target: 'bottom', title: 'Paint bottom strand' },
  ]

  return (
    <div className="sidebar-strand-paint-switch" role="radiogroup" aria-label="Strand to paint">
      {options.map(({ target, title }) => (
        <button
          key={target}
          type="button"
          role="radio"
          aria-checked={value === target}
          className={`sidebar-strand-paint-switch-option ${value === target ? 'is-active' : ''}`}
          title={title}
          onClick={() => onChange(target)}
        >
          <span className={`sidebar-strand-paint-glyph is-${target}`} aria-hidden />
        </button>
      ))}
    </div>
  )
}

export function DnaColorSidebarControl({
  settings,
  updateSection,
  selectedRange,
  sequenceLength,
  onPaintStrandColor,
}: {
  settings: DisplaySettings
  updateSection: <Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) => void
  selectedRange: SelectionRange | null
  sequenceLength: number
  onPaintStrandColor: (colorName: string, strandTarget: UserStrandPaintTarget) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [setColorOpen, setSetColorOpen] = useState(false)
  const [paletteDraft, setPaletteDraft] = useState<DnaColorPalette | null>(null)
  const [strandPaintTarget, setStrandPaintTarget] = useState<UserStrandPaintTarget>('top')
  const rootRef = useRef<HTMLDivElement>(null)

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  function selectMode(mode: DnaColorMode) {
    updateSection('dnaColors', { mode, enabled: true })
    setMenuOpen(false)
  }

  function openSetColorDialog() {
    setMenuOpen(false)
    setPaletteDraft(settings.dnaColors.palette)
    setSetColorOpen(true)
  }

  function confirmSetColorDialog() {
    if (!paletteDraft) return
    updateSection('dnaColors', { palette: paletteDraft, mode: 'custom', enabled: true })
    setSetColorOpen(false)
    setPaletteDraft(null)
  }

  const showUserPalette = settings.dnaColors.enabled && settings.dnaColors.mode === 'user'
  const canPaintSelection = selectedRange !== null && sequenceLength > 0

  return (
    <>
      <div className="sidebar-dna-control">
        <div className={`sidebar-enzyme-split sidebar-dna-split ${settings.dnaColors.enabled ? 'is-on' : ''} ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
          <button
            type="button"
            className="sidebar-enzyme-toggle"
            title={settings.dnaColors.enabled ? 'Hide DNA colors' : 'Show DNA colors'}
            aria-pressed={settings.dnaColors.enabled}
            onClick={() => updateSection('dnaColors', { enabled: !settings.dnaColors.enabled })}
          >
            {settings.dnaColors.mode === 'user' ? (
              <DnaUserColorIcon />
            ) : (
              <img src={dnaColorModeIcon[settings.dnaColors.mode]} alt="" className="sidebar-tool-icon" width={22} height={22} />
            )}
          </button>
        <button
          type="button"
          className="sidebar-enzyme-menu-trigger"
          title="DNA color options"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="sidebar-enzyme-caret" aria-hidden>
            ▾
          </span>
        </button>
        {menuOpen && (
          <div className="sidebar-menu sidebar-dna-picker" role="menu">
            <button type="button" className={`orf-mode-item ${settings.dnaColors.mode === 'history' ? 'is-selected' : ''}`} onClick={() => selectMode('history')}>
              <span className="orf-mode-check">{settings.dnaColors.mode === 'history' ? '✓' : ''}</span>
              <span className="orf-mode-label">History Colors</span>
            </button>
            <button type="button" className={`orf-mode-item ${settings.dnaColors.mode === 'custom' ? 'is-selected' : ''}`} onClick={() => selectMode('custom')}>
              <span className="orf-mode-check">{settings.dnaColors.mode === 'custom' ? '✓' : ''}</span>
              <span className="orf-mode-label">Custom DNA Colors</span>
            </button>
            <button type="button" className={`orf-mode-item ${settings.dnaColors.mode === 'user' ? 'is-selected' : ''}`} onClick={() => selectMode('user')}>
              <span className="orf-mode-check">{settings.dnaColors.mode === 'user' ? '✓' : ''}</span>
              <span className="orf-mode-label">User Colors</span>
            </button>
            <div className="sidebar-menu-divider" />
            <button type="button" className="orf-mode-item" onClick={openSetColorDialog}>
              <span className="orf-mode-check" aria-hidden />
              <span className="orf-mode-label">Set DNA Color...</span>
            </button>
          </div>
        )}
        </div>
        {showUserPalette && (
          <div className="sidebar-user-color-tools">
            <div className="sidebar-strand-color-palette" role="toolbar" aria-label="User strand colors">
              {SNAPGENE_USER_STRAND_COLORS.map((entry) => (
                <button
                  key={entry.name}
                  type="button"
                  className="sidebar-strand-color-swatch"
                  title={canPaintSelection ? `Paint selection ${entry.label}` : 'Select a sequence range to paint'}
                  aria-label={entry.label}
                  disabled={!canPaintSelection}
                  style={{ background: entry.css }}
                  onClick={() => onPaintStrandColor(entry.name, strandPaintTarget)}
                />
              ))}
            </div>
            <StrandPaintTargetSwitch value={strandPaintTarget} onChange={setStrandPaintTarget} />
          </div>
        )}
      </div>
      {setColorOpen && paletteDraft && (
        <SetDnaColorDialog
          draft={paletteDraft}
          onDraftChange={(patch) => setPaletteDraft((current) => (current ? { ...current, ...patch } : current))}
          onCancel={() => { setSetColorOpen(false); setPaletteDraft(null) }}
          onConfirm={confirmSetColorDialog}
        />
      )}
    </>
  )
}

export function AminoAcidCodeSidebarControl({
  settings,
  updateSection,
}: {
  settings: DisplaySettings
  updateSection: <Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) => void
}) {
  const threeLetter = settings.sequenceView.aminoAcidCodeFormat === 'three-letter'
  return (
    <button
      type="button"
      className={`sidebar-tool-button sidebar-amino-acid-button ${threeLetter ? 'is-active' : ''}`}
      title={threeLetter ? 'Show 1-letter amino acid codes' : 'Show 3-letter amino acid codes'}
      aria-pressed={threeLetter}
      onClick={() =>
        updateSection('sequenceView', {
          aminoAcidCodeFormat: threeLetter ? 'one-letter' : 'three-letter',
        })
      }
    >
      <img
        src={threeLetter ? '/amino-acid-three-letter.png' : '/amino-acid-one-letter.png'}
        alt=""
        className="sidebar-tool-icon"
        width={22}
        height={22}
      />
    </button>
  )
}
