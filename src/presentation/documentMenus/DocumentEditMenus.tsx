import { useRef, useState } from 'react'
import { parseOriginPositionInput } from '../../domain/sequence'
import { type SequenceRecord } from '../../domain/types'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'
import { type WorkspaceTab } from '../sequence'

export function DocumentEditMenu({
  topology,
  caretPosition,
  sequenceLength,
  canUndo,
  canRedo,
  hasSelection,
  canInvertSelection,
  canCopySelection,
  canCopyTranslation,
  onUndo,
  onRedo,
  onCopyTopStrand,
  onCopyBottomStrand53,
  onCopyBottomStrand35,
  onCopyTranslation,
  onSelectRange,
  onInvertSelection,
  onMakeUppercase,
  onMakeLowercase,
  onSetDnaColor,
  onToggleTopology,
  onFlipSequence,
  onSetOrigin,
  onEditDnaEnds,
  isDnaLibrary = false,
  canCropLibrary = false,
  onCropLibrary,
}: {
  topology: SequenceRecord['topology']
  caretPosition: number
  sequenceLength: number
  canUndo: boolean
  canRedo: boolean
  hasSelection: boolean
  canInvertSelection: boolean
  canCopySelection: boolean
  canCopyTranslation: boolean
  onUndo: () => void
  onRedo: () => void
  onCopyTopStrand: () => void
  onCopyBottomStrand53: () => void
  onCopyBottomStrand35: () => void
  onCopyTranslation: () => void
  onSelectRange: () => void
  onInvertSelection: () => void
  onMakeUppercase: () => void
  onMakeLowercase: () => void
  onSetDnaColor: () => void
  onToggleTopology: () => void
  onFlipSequence: () => void
  onSetOrigin: (origin: number) => void
  onEditDnaEnds: () => void
  isDnaLibrary?: boolean
  canCropLibrary?: boolean
  onCropLibrary?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [originInput, setOriginInput] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  const applyOrigin = () => {
    const origin = parseOriginPositionInput(originInput, sequenceLength)
    if (origin === null) return
    onSetOrigin(origin)
    setMenuOpen(false)
  }

  return (
    <div className={`toolbar-edit-menu ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="toolbar-edit-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => {
          if (!menuOpen) setOriginInput(String(Math.min(caretPosition, Math.max(sequenceLength - 1, 0)) + 1))
          setMenuOpen(!menuOpen)
        }}
      >
        Edit <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <div className="toolbar-edit-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canUndo}
            onClick={() => {
              onUndo()
              setMenuOpen(false)
            }}
          >
            Undo
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canRedo}
            onClick={() => {
              onRedo()
              setMenuOpen(false)
            }}
          >
            Redo
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canCopySelection}
            onClick={() => {
              onCopyTopStrand()
              setMenuOpen(false)
            }}
          >
            Copy top strand
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canCopySelection}
            onClick={() => {
              onCopyBottomStrand53()
              setMenuOpen(false)
            }}
          >
            Copy bottom strand 5'→3'
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canCopySelection}
            onClick={() => {
              onCopyBottomStrand35()
              setMenuOpen(false)
            }}
          >
            Copy bottom strand 3'→5'
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canCopyTranslation}
            onClick={() => {
              onCopyTranslation()
              setMenuOpen(false)
            }}
          >
            Copy translation
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={sequenceLength === 0}
            onClick={() => {
              onSelectRange()
              setMenuOpen(false)
            }}
          >
            Select range…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canInvertSelection}
            onClick={() => {
              onInvertSelection()
              setMenuOpen(false)
            }}
          >
            Invert selection
          </button>
          {isDnaLibrary && onCropLibrary && (
            <button
              type="button"
              role="menuitem"
              className="toolbar-edit-item"
              disabled={!canCropLibrary}
              onClick={() => {
                onCropLibrary()
                setMenuOpen(false)
              }}
            >
              Crop library
            </button>
          )}
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasSelection}
            onClick={() => {
              onMakeUppercase()
              setMenuOpen(false)
            }}
          >
            Make uppercase
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasSelection}
            onClick={() => {
              onMakeLowercase()
              setMenuOpen(false)
            }}
          >
            Make lowercase
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => {
              onSetDnaColor()
              setMenuOpen(false)
            }}
          >
            Set DNA color
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => {
              onToggleTopology()
              setMenuOpen(false)
            }}
          >
            {topology === 'circular' ? 'Linearize at origin' : 'Circularize'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={sequenceLength === 0}
            onClick={() => {
              onFlipSequence()
              setMenuOpen(false)
            }}
          >
            Flip sequence
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={topology !== 'linear' || sequenceLength === 0}
            onClick={() => {
              onEditDnaEnds()
              setMenuOpen(false)
            }}
          >
            Edit DNA ends
          </button>
          <div className="toolbar-edit-item toolbar-edit-origin-row" role="none">
            <button
              type="button"
              role="menuitem"
              className="toolbar-edit-origin-button"
              disabled={topology !== 'circular' || sequenceLength === 0}
              onClick={applyOrigin}
            >
              Set origin
            </button>
            <input
              type="number"
              min={1}
              max={Math.max(sequenceLength, 1)}
              value={originInput}
              disabled={topology !== 'circular' || sequenceLength === 0}
              aria-label="Origin position"
              className="toolbar-edit-origin-input"
              onChange={(event) => setOriginInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applyOrigin()
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function DocumentProteinEditMenu({
  canUndo,
  canRedo,
  hasSelection,
  canInvertSelection,
  sequenceLength,
  onUndo,
  onRedo,
  onCopySequence,
  onCopyFasta,
  onSelectRange,
  onInvertSelection,
  onMakeUppercase,
  onMakeLowercase,
}: {
  canUndo: boolean
  canRedo: boolean
  hasSelection: boolean
  canInvertSelection: boolean
  sequenceLength: number
  onUndo: () => void
  onRedo: () => void
  onCopySequence: () => void
  onCopyFasta: () => void
  onSelectRange: () => void
  onInvertSelection: () => void
  onMakeUppercase: () => void
  onMakeLowercase: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)
  const run = (action: () => void) => { action(); setMenuOpen(false) }
  return (
    <div className={`toolbar-edit-menu ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
      <button type="button" className="toolbar-edit-trigger" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((open) => !open)}>
        Edit <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && <div className="toolbar-edit-dropdown" role="menu">
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!canUndo} onClick={() => run(onUndo)}>Undo</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!canRedo} onClick={() => run(onRedo)}>Redo</button>
        <div className="toolbar-edit-divider" role="separator" />
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasSelection} onClick={() => run(onCopySequence)}>Copy amino-acid sequence</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasSelection} onClick={() => run(onCopyFasta)}>Copy selection as FASTA</button>
        <div className="toolbar-edit-divider" role="separator" />
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!sequenceLength} onClick={() => run(onSelectRange)}>Select range…</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!canInvertSelection} onClick={() => run(onInvertSelection)}>Invert selection</button>
        <div className="toolbar-edit-divider" role="separator" />
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasSelection} onClick={() => run(onMakeUppercase)}>Make uppercase</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasSelection} onClick={() => run(onMakeLowercase)}>Make lowercase</button>
      </div>}
    </div>
  )
}

export function DocumentProteinMenu({
  hasSelection,
  hasVariableRegions,
  onAddFeature,
  onAddBond,
  onMarkVariable,
  onClearVariable,
  onComparativeAlignment,
  onProperties,
  onAnnotateUniProtWhole,
  onAnnotateUniProtSelection,
  onAnnotateImgt,
  onAnnotateKabat,
}: {
  hasSelection: boolean
  hasVariableRegions: boolean
  onAddFeature: () => void
  onAddBond: () => void
  onMarkVariable: () => void
  onClearVariable: () => void
  onComparativeAlignment: () => void
  onProperties: () => void
  onAnnotateUniProtWhole: () => void
  onAnnotateUniProtSelection: () => void
  onAnnotateImgt: () => void
  onAnnotateKabat: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)
  const run = (action: () => void) => { action(); setMenuOpen(false) }
  return (
    <div className={`toolbar-edit-menu ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
      <button type="button" className="toolbar-edit-trigger" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((open) => !open)}>
        Protein <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && <div className="toolbar-edit-dropdown" role="menu">
        <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onAddFeature)}>Add feature…</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onAddBond)}>Add bond…</button>
        <div className="toolbar-edit-divider" role="separator" />
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasSelection} onClick={() => run(onMarkVariable)}>Mark selection as variability</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasVariableRegions} onClick={() => run(onClearVariable)}>Clear variability regions</button>
        <div className="toolbar-edit-divider" role="separator" />
        <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onComparativeAlignment)}>Comparative alignment…</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onProperties)}>Protein Properties</button>
        <div className="toolbar-edit-divider" role="separator" />
        <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onAnnotateUniProtWhole)}>Annotate whole protein from databases…</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasSelection} onClick={() => run(onAnnotateUniProtSelection)}>Annotate selection from databases…</button>
        <div className="toolbar-edit-divider" role="separator" />
        <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onAnnotateImgt)}>Annotate auto-detected binder (IMGT)…</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onAnnotateKabat)}>Annotate auto-detected antibody (Kabat)…</button>
      </div>}
    </div>
  )
}

export function DocumentViewMenu({
  activeTab,
  availableTabs,
  dnaTools,
  proteinTools,
  alignmentsVisible,
  descriptionPanelVisible,
  descriptionPanelAvailable = true,
  featuresVisible,
  featureLabelsVisible,
  proteinColorsVisible,
  proteinVisualControlsVisible,
  onSelectTab,
  onEditMapLabel,
  onToggleAlignments,
  onToggleDescriptionPanel,
  onTranslationOptions,
  onToggleFeatures,
  onToggleFeatureLabels,
  onToggleProteinColors,
  onToggleProteinVisualControls,
}: {
  activeTab: WorkspaceTab
  availableTabs: readonly WorkspaceTab[]
  dnaTools: boolean
  proteinTools: boolean
  alignmentsVisible: boolean
  descriptionPanelVisible: boolean
  descriptionPanelAvailable?: boolean
  featuresVisible: boolean
  featureLabelsVisible: boolean
  proteinColorsVisible: boolean
  proteinVisualControlsVisible: boolean
  onSelectTab: (tab: WorkspaceTab) => void
  onEditMapLabel: () => void
  onToggleAlignments: () => void
  onToggleDescriptionPanel: () => void
  onTranslationOptions: () => void
  onToggleFeatures: () => void
  onToggleFeatureLabels: () => void
  onToggleProteinColors: () => void
  onToggleProteinVisualControls: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  const run = (action: () => void) => {
    action()
    setMenuOpen(false)
  }

  return (
    <div className={`toolbar-edit-menu ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="toolbar-edit-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        View <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <div className="toolbar-edit-dropdown" role="menu">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="menuitemradio"
              aria-checked={activeTab === tab}
              className="toolbar-edit-item"
              onClick={() => run(() => onSelectTab(tab))}
            >
              <span className="toolbar-edit-check" aria-hidden>{activeTab === tab ? '✓' : ''}</span>
              {tab}
            </button>
          ))}
          {(dnaTools || proteinTools) && (
            <>
              <div className="toolbar-edit-divider" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="toolbar-edit-item"
                onClick={() => run(onEditMapLabel)}
              >
                <span className="toolbar-edit-check" aria-hidden />
                Edit map label…
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={alignmentsVisible}
                className="toolbar-edit-item"
                onClick={() => run(onToggleAlignments)}
              >
                <span className="toolbar-edit-check" aria-hidden>{alignmentsVisible ? '✓' : ''}</span>
                {proteinTools ? 'Show comparative alignments' : 'Show alignments'}
              </button>
            </>
          )}
          {descriptionPanelAvailable && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={descriptionPanelVisible}
              className="toolbar-edit-item"
              onClick={() => run(onToggleDescriptionPanel)}
            >
              <span className="toolbar-edit-check" aria-hidden>{descriptionPanelVisible ? '✓' : ''}</span>
              Description panel
            </button>
          )}
          {proteinTools && (
            <>
              <div className="toolbar-edit-divider" role="separator" />
              {([
                ['Show features', featuresVisible, onToggleFeatures],
                ['Show feature labels', featureLabelsVisible, onToggleFeatureLabels],
                ['Amino-acid colors', proteinColorsVisible, onToggleProteinColors],
                ['Visual controls', proteinVisualControlsVisible, onToggleProteinVisualControls],
              ] as const).map(([label, checked, action]) => (
                <button
                  key={label}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  className="toolbar-edit-item"
                  onClick={() => run(action)}
                >
                  <span className="toolbar-edit-check" aria-hidden>{checked ? '✓' : ''}</span>
                  {label}
                </button>
              ))}
            </>
          )}
          {dnaTools && (
            <>
              <div className="toolbar-edit-divider" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="toolbar-edit-item"
                onClick={() => run(onTranslationOptions)}
              >
                <span className="toolbar-edit-check" aria-hidden />
                Translation options…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
