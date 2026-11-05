import { useRef, useState } from 'react'
import { AppWindow, Download } from 'lucide-react'
import { ALIGNMENTS_HELP_TITLE } from '../../AlignmentsHelpDialog'
import { CRISPR_WORKFLOW_HELP_TITLE } from '../../CrisprWorkflowHelpDialog'
import { DATABASE_HELP_TITLE } from '../../DatabaseHelpDialog'
import { HISTORY_DERIVED_WORKFLOWS_HELP_TITLE } from '../../HistoryDerivedWorkflowsHelpDialog'
import { DESKTOP_DOWNLOADS } from '../../domain/desktopDownloads'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'

export function DocumentSettingsMenu({
  onDownloadSettings,
  onLoadSettings,
}: {
  onDownloadSettings: () => void
  onLoadSettings: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  return (
    <div className={`toolbar-edit-menu ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="toolbar-edit-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Download size={16} /> Settings <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <div className="toolbar-edit-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => {
              onDownloadSettings()
              setMenuOpen(false)
            }}
          >
            Download settings file
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => {
              onLoadSettings()
              setMenuOpen(false)
            }}
          >
            Load settings file…
          </button>
        </div>
      )}
    </div>
  )
}

export function DocumentDesktopAppMenu() {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  return (
    <div className={`toolbar-edit-menu ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="toolbar-edit-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <AppWindow size={16} /> Standalone app <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <div className="toolbar-edit-dropdown" role="menu">
          {DESKTOP_DOWNLOADS.map((download) => (
            <a
              key={download.id}
              role="menuitem"
              className="toolbar-edit-item toolbar-edit-link"
              href={download.href}
              download
              onClick={() => setMenuOpen(false)}
            >
              <span className="toolbar-edit-check" aria-hidden />
              {download.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export const KOFI_SUPPORT_URL = 'https://ko-fi.com/vibegene'

export function DocumentHelpMenu({
  onDnaLibraryFormat,
  onHistoryDerivedWorkflows,
  onDatabase,
  onCrisprWorkflow,
  onAlignments,
  onKeyboardShortcuts,
  onAbout,
  onSupport,
  onSourceCode,
  onTelegramGroup,
  onReportBug,
}: {
  onDnaLibraryFormat: () => void
  onHistoryDerivedWorkflows: () => void
  onDatabase: () => void
  onCrisprWorkflow: () => void
  onAlignments: () => void
  onKeyboardShortcuts: () => void
  onAbout: () => void
  onSupport: () => void
  onSourceCode: () => void
  onTelegramGroup: () => void
  onReportBug: () => void
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
        Help <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <div className="toolbar-edit-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onDnaLibraryFormat)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            .dna library format
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onHistoryDerivedWorkflows)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            {HISTORY_DERIVED_WORKFLOWS_HELP_TITLE}
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onDatabase)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            {DATABASE_HELP_TITLE}
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onCrisprWorkflow)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            {CRISPR_WORKFLOW_HELP_TITLE}
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onAlignments)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            {ALIGNMENTS_HELP_TITLE}
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onKeyboardShortcuts)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Keyboard Shortcuts…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onAbout)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            About…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onReportBug)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Report a bug…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onSourceCode)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Source code on GitHub
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onTelegramGroup)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Telegram group
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => run(onSupport)}
          >
            <span className="toolbar-edit-check" aria-hidden />
            Support…
          </button>
        </div>
      )}
    </div>
  )
}
