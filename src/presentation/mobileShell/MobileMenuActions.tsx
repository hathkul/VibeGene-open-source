import type { RefObject } from 'react'
import { AppWindow, ChevronDown, Database, Save, Upload } from 'lucide-react'
import type { SaveToolbarMode } from '../../application/ports/saveToolbar'
import type { SaveToolbarModeOption } from '../../domain/projectSaveSemantics'

export type MobileMenuActionsProps = {
  onOpen: () => void
  saveMenuRef: RefObject<HTMLDivElement | null>
  saveMenuOpen: boolean
  saveToolbarMode: SaveToolbarMode
  saveToolbarOptions: readonly SaveToolbarModeOption[]
  onRunSaveMode: (mode: SaveToolbarMode) => void
  onToggleSaveMenu: () => void
  onSelectSaveMode: (mode: SaveToolbarMode) => void
  onOpenDatabase: () => void
  onOpenNewWindow: () => void
  newWindowAvailable: boolean
}

/**
 * Leading actions of the document menu / toolbar: Open, the save-mode group,
 * Database, and New window. Routing stays in App-supplied callbacks.
 */
export function MobileMenuActions({
  onOpen,
  saveMenuRef,
  saveMenuOpen,
  saveToolbarMode,
  saveToolbarOptions,
  onRunSaveMode,
  onToggleSaveMenu,
  onSelectSaveMode,
  onOpenDatabase,
  onOpenNewWindow,
  newWindowAvailable,
}: MobileMenuActionsProps) {
  return (
    <>
      <button type="button" onClick={onOpen}>
        <Upload size={17} /> Open
      </button>
      <div className={`toolbar-save-mode-group${saveMenuOpen ? ' is-open' : ''}`} ref={saveMenuRef}>
        <button
          type="button"
          className="toolbar-save-mode-main"
          title={saveToolbarOptions.find((option) => option.id === saveToolbarMode)?.title ?? 'Save'}
          onClick={() => onRunSaveMode(saveToolbarMode)}
        >
          <Save size={17} />
          {saveToolbarOptions.find((option) => option.id === saveToolbarMode)?.label ?? 'Save'}
        </button>
        <button
          type="button"
          className={`toolbar-save-mode-chevron${saveMenuOpen ? ' is-open' : ''}`}
          aria-label="Choose save mode"
          aria-haspopup="menu"
          aria-expanded={saveMenuOpen}
          onClick={onToggleSaveMenu}
        >
          <ChevronDown size={14} />
        </button>
        {saveMenuOpen && (
          <div className="toolbar-save-mode-menu" role="menu">
            {saveToolbarOptions.map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="menuitem"
                className={mode.id === saveToolbarMode ? 'is-active' : undefined}
                title={mode.title}
                onClick={() => onSelectSaveMode(mode.id)}
              >
                <Save size={14} />
                <span>{mode.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" onClick={onOpenDatabase}>
        <Database size={17} /> Database
      </button>
      {newWindowAvailable ? (
        <button type="button" onClick={onOpenNewWindow}>
          <AppWindow size={17} /> New window
        </button>
      ) : null}
    </>
  )
}
