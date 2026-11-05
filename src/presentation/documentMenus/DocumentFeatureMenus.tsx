import { useRef, useState } from 'react'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'

export function DocumentProteinFeaturesMenu({
  hasFeatureSelected,
  onAddFeature,
  onAddBond,
  onEditFeature,
  onDuplicateFeature,
  onRemoveFeature,
  onFeatureColor,
  onShowSelectedFeatures,
  onHideSelectedFeatures,
  onImportFeatures,
  onExportFeatureData,
}: {
  hasFeatureSelected: boolean
  onAddFeature: () => void
  onAddBond: () => void
  onEditFeature: () => void
  onDuplicateFeature: () => void
  onRemoveFeature: () => void
  onFeatureColor: () => void
  onShowSelectedFeatures: () => void
  onHideSelectedFeatures: () => void
  onImportFeatures: () => void
  onExportFeatureData: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)
  const run = (action: () => void) => { action(); setMenuOpen(false) }
  return (
    <div className={`toolbar-edit-menu ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
      <button type="button" className="toolbar-edit-trigger" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((open) => !open)}>
        Features <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && <div className="toolbar-edit-dropdown" role="menu">
        <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onAddFeature)}>Add Feature…</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onAddBond)}>Add Bond…</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasFeatureSelected} onClick={() => run(onEditFeature)}>Edit Feature…</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasFeatureSelected} onClick={() => run(onDuplicateFeature)}>Duplicate Feature…</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasFeatureSelected} onClick={() => run(onRemoveFeature)}>Remove Feature</button>
        <div className="toolbar-edit-divider" role="separator" />
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasFeatureSelected} onClick={() => run(onFeatureColor)}>Feature Color…</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasFeatureSelected} onClick={() => run(onShowSelectedFeatures)}>Show Selected Features</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasFeatureSelected} onClick={() => run(onHideSelectedFeatures)}>Hide Selected Features</button>
        <div className="toolbar-edit-divider" role="separator" />
        <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onImportFeatures)}>Import Features from Another File…</button>
        <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasFeatureSelected} onClick={() => run(onExportFeatureData)}>Export Feature Data…</button>
      </div>}
    </div>
  )
}

export function DocumentFeaturesMenu({
  hasFeatureSelected,
  canOpenAsProtein,
  hasSelectionRange,
  hasSelectionPoint,
  canAddCleavageSite,
  canRemoveCleavageSite,
  canShowSelectedFeatures,
  canHideSelectedFeatures,
  onAddFeature,
  onEditFeature,
  onOpenAsProtein,
  onDuplicateFeature,
  onRemoveFeature,
  onCreateSegment,
  onDeleteSegment,
  onMergeSegments,
  canMergeFeatures,
  onMergeFeatures,
  onAddCleavageSite,
  onRemoveCleavageSite,
  onFeatureColor,
  onShowSelectedFeatures,
  onHideSelectedFeatures,
  onSpliceIntrons,
  onDetectCommonFeatures,
  onAnnotateDatabasesWhole,
  onAnnotateDatabasesSelection,
  onAnnotateTranslatedOrfsWhole,
  onAnnotateTranslatedOrfsSelection,
  onAddToCommonFeatures,
  onBrowseCommonFeatures,
  onImportFeaturesFromAnotherFile,
  onExportFeatureData,
}: {
  hasFeatureSelected: boolean
  canOpenAsProtein: boolean
  hasSelectionRange: boolean
  hasSelectionPoint: boolean
  canAddCleavageSite: boolean
  canRemoveCleavageSite: boolean
  canShowSelectedFeatures: boolean
  canHideSelectedFeatures: boolean
  onAddFeature: () => void
  onEditFeature: () => void
  onOpenAsProtein: () => void
  onDuplicateFeature: () => void
  onRemoveFeature: () => void
  onCreateSegment: () => void
  onDeleteSegment: () => void
  onMergeSegments: () => void
  canMergeFeatures: boolean
  onMergeFeatures: () => void
  onAddCleavageSite: () => void
  onRemoveCleavageSite: () => void
  onFeatureColor: () => void
  onShowSelectedFeatures: () => void
  onHideSelectedFeatures: () => void
  onSpliceIntrons: () => void
  onDetectCommonFeatures: () => void
  onAnnotateDatabasesWhole: () => void
  onAnnotateDatabasesSelection: () => void
  onAnnotateTranslatedOrfsWhole: () => void
  onAnnotateTranslatedOrfsSelection: () => void
  onAddToCommonFeatures: () => void
  onBrowseCommonFeatures: () => void
  onImportFeaturesFromAnotherFile: () => void
  onExportFeatureData: () => void
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
        Features <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <div className="toolbar-edit-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item toolbar-edit-item-shortcut"
            onClick={() => run(onAddFeature)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            <span className="toolbar-edit-label">Add Feature…</span>
            <span className="toolbar-edit-shortcut">⌘T</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasFeatureSelected}
            onClick={() => run(onEditFeature)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Edit Features…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canOpenAsProtein}
            onClick={() => run(onOpenAsProtein)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Open as Protein
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item toolbar-edit-item-shortcut"
            disabled={!hasFeatureSelected}
            onClick={() => run(onDuplicateFeature)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            <span className="toolbar-edit-label">Duplicate Feature…</span>
            <span className="toolbar-edit-shortcut">⇧⌘T</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasFeatureSelected}
            onClick={() => run(onRemoveFeature)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Remove Features
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onAnnotateDatabasesWhole)}>
            <span className="toolbar-edit-check" aria-hidden />Annotate Whole Sequence from Databases…
          </button>
          <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasSelectionRange} onClick={() => run(onAnnotateDatabasesSelection)}>
            <span className="toolbar-edit-check" aria-hidden />Annotate Selection from Databases…
          </button>
          <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onAnnotateTranslatedOrfsWhole)}>
            <span className="toolbar-edit-check" aria-hidden />Annotate Translated ORFs in Whole Sequence…
          </button>
          <button type="button" role="menuitem" className="toolbar-edit-item" disabled={!hasSelectionRange} onClick={() => run(onAnnotateTranslatedOrfsSelection)}>
            <span className="toolbar-edit-check" aria-hidden />Annotate Translated ORFs in Selection…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasSelectionRange}
            onClick={() => run(onCreateSegment)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Create Feature Segment…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasSelectionPoint}
            onClick={() => run(onDeleteSegment)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Delete Feature Segment…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasSelectionRange}
            onClick={() => run(onMergeSegments)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Merge Feature Segments…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canMergeFeatures}
            title={canMergeFeatures ? undefined : 'Select two or more features to merge.'}
            onClick={() => run(onMergeFeatures)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Merge Features…
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            title={
              canAddCleavageSite
                ? undefined
                : 'To add a cleavage site, first place the caret at the desired position.'
            }
            onClick={() => run(onAddCleavageSite)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Add Cleavage Site…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canRemoveCleavageSite}
            onClick={() => run(onRemoveCleavageSite)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Remove Cleavage Sites…
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasFeatureSelected}
            onClick={() => run(onFeatureColor)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Feature Color…
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canShowSelectedFeatures}
            onClick={() => run(onShowSelectedFeatures)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Show Selected Features
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canHideSelectedFeatures}
            onClick={() => run(onHideSelectedFeatures)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Hide Selected Features
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onImportFeaturesFromAnotherFile)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Import Features from Another File…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasFeatureSelected}
            onClick={() => run(onExportFeatureData)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Export Feature Data…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasFeatureSelected}
            onClick={() => run(onSpliceIntrons)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Splice to Remove Introns…
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onDetectCommonFeatures)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Detect Common Features…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasFeatureSelected}
            onClick={() => run(onAddToCommonFeatures)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Add to Common Features…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onBrowseCommonFeatures)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Browse Common Features
          </button>
        </div>
      )}
    </div>
  )
}
