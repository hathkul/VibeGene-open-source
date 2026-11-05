import { useRef, useState } from 'react'
import { type EnzymePreferences, type SavedEnzymeSet } from '../../domain/enzymePreferences'
import { type EnzymeManufacturerId } from '../../domain/types'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'
import { EnzymeSetMenu } from './EnzymeSetMenu'
import { type DisplaySettings, type EnzymeSetMode, type RestrictionSiteList } from '../sequence'

export function DocumentEnzymesMenu({
  settings,
  preferences,
  fileEnzymeSets = [],
  parentalRestrictionSites,
  enzymesVisible,
  canSaveEnzymeSet,
  onSelectSet,
  onSelectSupplier,
  onSelectSavedSet,
  onSelectFileSet,
  onChooseEnzymes,
  onToggleVisibility,
  onShowNoncutters,
  onSaveEnzymeSet,
  onExportEnzymeSet,
  onManageEnzymeSets,
  onOpenEnzymePriorities,
  onOpenRestrictionEnzymes,
  onOpenEnzymeDatabase,
}: {
  settings: DisplaySettings
  preferences: EnzymePreferences
  fileEnzymeSets?: SavedEnzymeSet[]
  parentalRestrictionSites: RestrictionSiteList
  enzymesVisible: boolean
  canSaveEnzymeSet: boolean
  onSelectSet: (set: EnzymeSetMode) => void
  onSelectSupplier: (supplierId: EnzymeManufacturerId) => void
  onSelectSavedSet: (savedSetId: string) => void
  onSelectFileSet: (savedSetId: string) => void
  onChooseEnzymes: () => void
  onToggleVisibility: () => void
  onShowNoncutters: () => void
  onSaveEnzymeSet: () => void
  onExportEnzymeSet: () => void
  onManageEnzymeSets: () => void
  onOpenEnzymePriorities: () => void
  onOpenRestrictionEnzymes: () => void
  onOpenEnzymeDatabase: () => void
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
        Enzymes <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <div className="toolbar-edit-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item toolbar-edit-item-shortcut"
            onClick={() => run(onChooseEnzymes)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            <span className="toolbar-edit-label">Choose Enzymes…</span>
            <span className="toolbar-edit-shortcut">⌘E</span>
          </button>
          <div className="toolbar-edit-submenu">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              className="toolbar-edit-item toolbar-edit-item-shortcut toolbar-edit-submenu-trigger"
            >
              <span className="toolbar-edit-check" aria-hidden />
              <span className="toolbar-edit-label">Use Enzyme Set</span>
              <span className="toolbar-edit-submenu-arrow" aria-hidden>›</span>
            </button>
            <div className="toolbar-edit-submenu-panel">
              <EnzymeSetMenu
                className="sidebar-enzyme-picker enzyme-toolbar-submenu"
                settings={settings}
                preferences={preferences}
                fileEnzymeSets={fileEnzymeSets}
                parentalRestrictionSites={parentalRestrictionSites}
                onSelectSet={(set) => run(() => onSelectSet(set))}
                onSelectSupplier={(supplier) => run(() => onSelectSupplier(supplier))}
                onSelectSavedSet={(savedSetId) => run(() => onSelectSavedSet(savedSetId))}
                onSelectFileSet={(savedSetId) => run(() => onSelectFileSet(savedSetId))}
                onChooseEnzymes={() => run(onChooseEnzymes)}
                onShowNoncutters={() => run(onShowNoncutters)}
                onOpenPreferences={() => setMenuOpen(false)}
                showActions={false}
              />
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onToggleVisibility)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            {enzymesVisible ? 'Hide Enzymes' : 'Show Enzymes'}
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canSaveEnzymeSet}
            onClick={() => run(onSaveEnzymeSet)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Save Enzyme Set…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={!canSaveEnzymeSet}
            onClick={() => run(onExportEnzymeSet)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Export Enzyme Set…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onManageEnzymeSets)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Manage Enzyme Sets…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onOpenEnzymePriorities)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Enzyme priorities…
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onShowNoncutters)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Noncutters
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onOpenRestrictionEnzymes)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Restriction Enzymes
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item toolbar-edit-item-shortcut"
            onClick={() => run(onOpenEnzymeDatabase)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            <span className="toolbar-edit-label">Enzyme Database</span>
            <span className="toolbar-edit-shortcut">⇧⌘E</span>
          </button>
        </div>
      )}
    </div>
  )
}
