import { useRef, useState } from 'react'
import { Database, Download, FileDown, FolderOpen, Save, Trash2 } from 'lucide-react'
import { formatSequenceLength } from '../../domain/moleculeCapabilities'
import { type WorkspaceDocumentBinding } from '../../domain/projectSaveSemantics'
import type { StoredProjectSummary } from '../../application/ports/projectPersistence'
import type { RecentFileEntry } from '../../application/ports/recentFiles'
import { useCloseOnOutsidePointer } from '../hooks/useCloseOnOutsidePointer'
import { recentFileDetail } from './menuHelpers'

function formatDraftTime(updatedAt: string) {
  const date = new Date(updatedAt)
  return Number.isNaN(date.getTime()) ? updatedAt : date.toLocaleString()
}

export function DocumentFileMenu({
  nucleotideDocument,
  canCreateFromSelection,
  onOpen,
  onOpenFromUrl,
  onGenerateLink,
  recentFiles,
  onOpenRecent,
  drafts,
  onRestoreDraft,
  onDiscardDraft,
  onNewDnaFile,
  onNewDnaLibrary,
  onConvertToLibrary,
  canConvertToLibrary,
  onNewProteinFile,
  onImportFromDatabase,
  onNewFileFromSelection,
  onSave,
  onSaveTo,
  onRenameFile,
  onSaveAsFile,
  onSaveToDatabase,
  onSaveDna,
  onSaveGenBank,
  onSaveFasta,
  onPreferences,
  saveBinding,
  canRenameFile,
  readOnlyDocument,
}: {
  nucleotideDocument: boolean
  canCreateFromSelection: boolean
  onOpen: () => void
  onOpenFromUrl?: () => void
  onGenerateLink: () => void
  recentFiles: RecentFileEntry[]
  onOpenRecent: (entry: RecentFileEntry) => void
  drafts: StoredProjectSummary[]
  onRestoreDraft: (draftId: string) => void
  onDiscardDraft: (draftId: string) => void
  onNewDnaFile: () => void
  onNewDnaLibrary: () => void
  onConvertToLibrary: () => void
  canConvertToLibrary: boolean
  onNewProteinFile: () => void
  onImportFromDatabase: () => void
  onNewFileFromSelection: () => void
  onSave: () => void | Promise<void>
  onSaveTo: () => void
  onRenameFile: () => void
  onSaveAsFile: () => void | Promise<void>
  onSaveToDatabase: () => void
  onSaveDna: () => void | Promise<void>
  onSaveGenBank: () => void | Promise<void>
  onSaveFasta: () => void | Promise<void>
  onPreferences: () => void
  saveBinding: WorkspaceDocumentBinding
  canRenameFile: boolean
  readOnlyDocument: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useCloseOnOutsidePointer(menuOpen, rootRef, setMenuOpen)

  const snapGeneExtension = nucleotideDocument ? 'dna' : 'prot'
  const diskBound = saveBinding !== 'database'

  return (
    <div className={`toolbar-edit-menu ${menuOpen ? 'menu-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="toolbar-edit-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        File <span className="sidebar-enzyme-caret" aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <div className="toolbar-edit-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => {
              onOpen()
              setMenuOpen(false)
            }}
          >
            <FolderOpen size={15} /> Open…
          </button>
          {onOpenFromUrl && (
            <button
              type="button"
              role="menuitem"
              className="toolbar-edit-item"
              onClick={() => {
                onOpenFromUrl()
                setMenuOpen(false)
              }}
            >
              Open from URL…
            </button>
          )}
          {recentFiles.length > 0 && (
            <div className="toolbar-edit-submenu">
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                className="toolbar-edit-item toolbar-edit-submenu-trigger"
              >
                Open Recent
                <span className="toolbar-edit-submenu-arrow" aria-hidden>›</span>
              </button>
              <div className="toolbar-edit-submenu-panel document-recent-submenu-panel" role="menu">
                {recentFiles.map((entry) => (
                  <button
                    key={entry.kind === 'local' ? entry.path : entry.projectId}
                    type="button"
                    role="menuitem"
                    className="document-recent-open"
                    title={entry.kind === 'local' ? entry.path : entry.name}
                    onClick={() => {
                      onOpenRecent(entry)
                      setMenuOpen(false)
                    }}
                  >
                    <span className="document-recent-name">{entry.name}</span>
                    <span className="document-recent-meta">{recentFileDetail(entry)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => {
              onGenerateLink()
              setMenuOpen(false)
            }}
          >
            Generate link…
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => {
              onNewDnaFile()
              setMenuOpen(false)
            }}
          >
            New DNA file…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => {
              onNewDnaLibrary()
              setMenuOpen(false)
            }}
          >
            New DNA library…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={readOnlyDocument || !canConvertToLibrary}
            onClick={() => {
              onConvertToLibrary()
              setMenuOpen(false)
            }}
          >
            Convert to library…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => {
              onNewProteinFile()
              setMenuOpen(false)
            }}
          >
            New Protein file…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => {
              onImportFromDatabase()
              setMenuOpen(false)
            }}
          >
            <Download size={15} /> Import from Sequence Database…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={readOnlyDocument || !canCreateFromSelection}
            onClick={() => {
              onNewFileFromSelection()
              setMenuOpen(false)
            }}
          >
            New file from selection
          </button>
          {drafts.length > 0 && (
            <>
              <div className="toolbar-edit-divider" role="separator" />
              <div className="toolbar-edit-submenu">
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  className="toolbar-edit-item toolbar-edit-submenu-trigger"
                >
                  Drafts ({drafts.length})
                  <span className="toolbar-edit-submenu-arrow" aria-hidden>›</span>
                </button>
                <div className="toolbar-edit-submenu-panel document-drafts-submenu-panel" role="menu">
                  {drafts.map((draft) => (
                    <div className="document-draft-row" key={draft.id} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className="document-draft-open"
                        title={draft.name}
                        onClick={() => {
                          onRestoreDraft(draft.id)
                          setMenuOpen(false)
                        }}
                      >
                        <span className="document-draft-name">{draft.name}</span>
                        <span className="document-draft-meta">
                          {formatSequenceLength(draft.sequenceLength, draft.molecule)} · {formatDraftTime(draft.updatedAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-button danger document-draft-discard"
                        aria-label={`Discard draft ${draft.name}`}
                        title="Discard draft"
                        onClick={() => {
                          onDiscardDraft(draft.id)
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={readOnlyDocument}
            onClick={() => {
              void onSave()
              setMenuOpen(false)
            }}
          >
            <Save size={15} /> Save
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={readOnlyDocument}
            onClick={() => {
              if (diskBound) onSaveToDatabase()
              else onSaveTo()
              setMenuOpen(false)
            }}
          >
            <Database size={15} /> {diskBound ? 'Save to database…' : 'Save to…'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={readOnlyDocument || !canRenameFile}
            onClick={() => {
              onRenameFile()
              setMenuOpen(false)
            }}
          >
            Rename file…
          </button>
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={readOnlyDocument}
            onClick={() => {
              void (diskBound ? onSaveAsFile() : onSaveDna())
              setMenuOpen(false)
            }}
          >
            <FileDown size={15} />{' '}
            {diskBound ? 'Save as…' : `Save as SnapGene .${snapGeneExtension} file`}
          </button>
          {nucleotideDocument ? (
            <button
              type="button"
              role="menuitem"
              className="toolbar-edit-item"
              disabled={readOnlyDocument}
              onClick={() => {
                void onSaveGenBank()
                setMenuOpen(false)
              }}
            >
              <FileDown size={15} /> Save as GenBank (.gb)
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="toolbar-edit-item"
              disabled={readOnlyDocument}
              onClick={() => {
                void onSaveGenBank()
                setMenuOpen(false)
              }}
            >
              <FileDown size={15} /> Save as GenPept file
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            disabled={readOnlyDocument}
            onClick={() => {
              void onSaveFasta()
              setMenuOpen(false)
            }}
          >
            <FileDown size={15} /> {nucleotideDocument ? 'Save as FASTA (.fasta)' : 'Save protein FASTA (.fasta)'}
          </button>
          <div className="toolbar-edit-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar-edit-item"
            onClick={() => {
              onPreferences()
              setMenuOpen(false)
            }}
          >
            Preferences…
          </button>
        </div>
      )}
    </div>
  )
}
