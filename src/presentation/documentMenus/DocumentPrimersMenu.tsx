import { useEffect, useRef, useState } from 'react'
import { collectTagsAmongCommonPrimers } from '../../application/primerWorkflow/commonPrimerTags'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'

export type DocumentPrimersMenuProps = {
  hasPrimerSelected: boolean
  hasSelectionRange: boolean
  canShowSelectedPrimers: boolean
  canHideSelectedPrimers: boolean
  onAddPrimer: () => void
  onPickPrimers: () => void
  onEditPrimers: () => void
  onDuplicatePrimers: () => void
  onRemovePrimers: () => void
  onPrimerColor: () => void
  onHybridizationParameters: () => void
  onShowSelectedPrimers: () => void
  onHideSelectedPrimers: () => void
  onImportPrimersFromAnotherFile: () => void
  onImportPrimersFromList: () => void
  onDetectCommonPrimers: (scope: 'all' | { tag: string }) => void
  onAddToCommonPrimers: () => void
  onExportPrimers: () => void
  loadCommonPrimers: () => Promise<readonly { name: string; sequence: string }[]>
  loadPrimerTagMap: () => Promise<Map<string, string[]>>
}

export function DocumentPrimersMenu({
  hasPrimerSelected,
  hasSelectionRange,
  canShowSelectedPrimers,
  canHideSelectedPrimers,
  onAddPrimer,
  onPickPrimers,
  onEditPrimers,
  onDuplicatePrimers,
  onRemovePrimers,
  onPrimerColor,
  onHybridizationParameters,
  onShowSelectedPrimers,
  onHideSelectedPrimers,
  onImportPrimersFromAnotherFile,
  onImportPrimersFromList,
  onDetectCommonPrimers,
  onAddToCommonPrimers,
  onExportPrimers,
  loadCommonPrimers,
  loadPrimerTagMap,
}: DocumentPrimersMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [commonDetectTags, setCommonDetectTags] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement | null>(null)

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  useEffect(() => {
    if (!menuOpen) return
    let cancelled = false
    void (async () => {
      const [library, tagMap] = await Promise.all([loadCommonPrimers(), loadPrimerTagMap()])
      if (cancelled) return
      setCommonDetectTags(collectTagsAmongCommonPrimers(library, tagMap))
    })()
    return () => {
      cancelled = true
    }
  }, [loadCommonPrimers, loadPrimerTagMap, menuOpen])

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
        Primers <span className="sidebar-enzyme-caret" aria-hidden>
          ▾
        </span>
      </button>
      {menuOpen && (
        <div className="toolbar-edit-dropdown" role="menu">
          <button type="button" role="menuitem" className="toolbar-edit-item" onClick={() => run(onAddPrimer)}>
            <span className="toolbar-edit-check" aria-hidden />
            Add Primer…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasSelectionRange}
            onClick={() => run(onPickPrimers)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Pick Primers…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasPrimerSelected}
            onClick={() => run(onEditPrimers)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Edit Primers…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasPrimerSelected}
            onClick={() => run(onDuplicatePrimers)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Duplicate Primer…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasPrimerSelected}
            onClick={() => run(onRemovePrimers)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Remove Primers
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasPrimerSelected}
            onClick={() => run(onPrimerColor)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Primer Color…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onHybridizationParameters)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Hybridization Parameters…
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canShowSelectedPrimers}
            onClick={() => run(onShowSelectedPrimers)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Show Selected Primers
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canHideSelectedPrimers}
            onClick={() => run(onHideSelectedPrimers)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Hide Selected Primers
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onImportPrimersFromAnotherFile)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Import Primers from Another File…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onImportPrimersFromList)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Import Primers from a List…
          </button>
          <button type="button" role="menuitem" className="toolbar-edit-item" disabled>
            <span className="toolbar-edit-check" aria-hidden />
            Import Primers from Vector NTI®…
          </button>
          <button type="button" role="menuitem" className="toolbar-edit-item" disabled>
            <span className="toolbar-edit-check" aria-hidden />
            Import Primers from Clone Manager…
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <div className="toolbar-edit-submenu">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              className="toolbar-edit-item toolbar-edit-submenu-trigger"
            >
              <span className="toolbar-edit-check" aria-hidden />
              <span className="toolbar-edit-label">Detect Common Primers</span>
              <span className="toolbar-edit-submenu-arrow" aria-hidden>
                ›
              </span>
            </button>
            <div className="toolbar-edit-submenu-panel">
              <button
                type="button"
                role="menuitem"
                className="toolbar-edit-item"
                onClick={() => run(() => onDetectCommonPrimers('all'))}
              >
                <span className="toolbar-edit-check" aria-hidden />
                All
              </button>
              {commonDetectTags.length > 0 ? <div className="toolbar-edit-divider" role="separator" /> : null}
              {commonDetectTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  role="menuitem"
                  className="toolbar-edit-item"
                  onClick={() => run(() => onDetectCommonPrimers({ tag }))}
                >
                  <span className="toolbar-edit-check" aria-hidden />
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasPrimerSelected}
            onClick={() => run(onAddToCommonPrimers)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Add to Common Primers…
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!hasPrimerSelected}
            onClick={() => run(onExportPrimers)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Export Selected Primers…
          </button>
        </div>
      )}
    </div>
  )
}
