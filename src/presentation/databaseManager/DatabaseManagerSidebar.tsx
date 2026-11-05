import { Bookmark, Folder, FolderInput, FolderOpen, FolderPlus, FolderSync, Library, Pencil, Tag, Trash2 } from 'lucide-react'
import { allBrowseLabel } from '../../application/databaseManager/browsePresentation'
import { BuiltinTreeRows } from './BuiltinTreeRows'
import { FolderTreeRows } from './FolderTreeRows'
import type { DatabaseManagerBuiltinTreeNode, DatabaseManagerFolderTreeNode, DatabaseManagerViewMode } from './types'
import type { DatabaseManagerBrowseState } from './databaseManagerTableTypes'

export type DatabaseManagerSidebarModel = {
  viewMode: DatabaseManagerViewMode
  browse: DatabaseManagerBrowseState
  folderTree: DatabaseManagerFolderTreeNode[]
  selectedFolderId: string | null
  expandedFolderIds: ReadonlySet<string>
  builtinTree: DatabaseManagerBuiltinTreeNode[]
  expandedBuiltinIds: ReadonlySet<string>
  selectedBuiltinGroupId: string | null
  sidebarTags: string[]
  busy: boolean
  selectedProjectCount: number
  isMobileShell: boolean
  folderActions?: {
    visible: boolean
    showSourceFolderButton: boolean
    sourceFolderLabel: string
    sourceFolderTitle: string
    busy: boolean
  }
}

export type DatabaseManagerSidebarCommands = {
  onBrowseAll: () => void
  onBrowseUnfiled: () => void
  onBrowseFolder: (folderId: string) => void
  onToggleFolderExpanded: (folderId: string) => void
  onBrowseBuiltinGroup: (groupId: string) => void
  onBrowseAllBuiltin: () => void
  onToggleBuiltinExpanded: (groupId: string) => void
  onBrowseCommonPrimers: () => void
  onBrowseTag: (tag: string) => void
  onNewFolder: () => void
  onChooseSourceFolder?: () => void
  onRenameFolder?: () => void
  onMoveFolder?: () => void
  onDeleteFolder?: () => void
  onMobileTreeSelect?: () => void
}

export type DatabaseManagerSidebarProps = {
  model: DatabaseManagerSidebarModel
  commands: DatabaseManagerSidebarCommands
}

export function DatabaseManagerSidebar({ model, commands }: DatabaseManagerSidebarProps) {
  const {
    viewMode,
    browse,
    folderTree,
    selectedFolderId,
    expandedFolderIds,
    builtinTree,
    expandedBuiltinIds,
    selectedBuiltinGroupId,
    sidebarTags,
    busy,
    selectedProjectCount,
    isMobileShell,
    folderActions,
  } = model

  return (
    <aside
      className="db-manager-sidebar"
      onClick={(event) => {
        if (!isMobileShell) return
        if ((event.target as HTMLElement).closest('.db-tree-item')) {
          commands.onMobileTreeSelect?.()
        }
      }}
    >
      <div className="db-sidebar-section">
        <div className="db-sidebar-heading db-sidebar-heading-with-actions">
          <span>Folders</span>
          <span className="db-sidebar-heading-actions">
            <button type="button" className="icon-button" title={selectedProjectCount > 0 ? `New folder with ${selectedProjectCount} selected files` : 'New folder'} aria-label="New folder" disabled={busy} onClick={commands.onNewFolder}><FolderPlus size={14} /></button>
            {folderActions?.visible ? (
              <>
                {folderActions.showSourceFolderButton ? <button type="button" className="icon-button db-folder-action" title={folderActions.sourceFolderTitle} aria-label={folderActions.sourceFolderLabel} disabled={folderActions.busy} onClick={commands.onChooseSourceFolder}><FolderSync size={14} /></button> : null}
                <button type="button" className="icon-button db-folder-action" title="Rename folder" aria-label="Rename folder" disabled={folderActions.busy} onClick={commands.onRenameFolder}><Pencil size={14} /></button>
                <button type="button" className="icon-button db-folder-action" title="Move folder" aria-label="Move folder" disabled={folderActions.busy} onClick={commands.onMoveFolder}><FolderInput size={14} /></button>
                <button type="button" className="icon-button db-folder-action danger-text" title="Delete folder" aria-label="Delete folder" disabled={folderActions.busy} onClick={commands.onDeleteFolder}><Trash2 size={14} /></button>
              </>
            ) : null}
          </span>
        </div>
        <button
          type="button"
          className={`db-tree-item${browse.kind === 'all' ? ' is-selected' : ''}`}
          onClick={commands.onBrowseAll}
        >
          <FolderOpen size={14} />
          <span>{allBrowseLabel(viewMode)}</span>
        </button>
        <button
          type="button"
          className={`db-tree-item${browse.kind === 'unfiled' ? ' is-selected' : ''}`}
          onClick={commands.onBrowseUnfiled}
        >
          <Folder size={14} />
          <span>Unfiled</span>
        </button>
        <FolderTreeRows
          nodes={folderTree}
          depth={0}
          selectedFolderId={selectedFolderId}
          expandedIds={expandedFolderIds}
          onSelect={commands.onBrowseFolder}
          onToggle={commands.onToggleFolderExpanded}
        />
      </div>

      {viewMode === 'dna' && (
        <div className="db-sidebar-section">
          <div className="db-sidebar-heading">
            <span>Built-in</span>
          </div>
          <button
            type="button"
            className={`db-tree-item${browse.kind === 'builtin' && browse.group === 'builtin' ? ' is-selected' : ''}`}
            onClick={commands.onBrowseAllBuiltin}
          >
            <Library size={14} />
            <span>All built-in plasmids</span>
          </button>
          <BuiltinTreeRows
            nodes={builtinTree}
            depth={0}
            selectedGroupId={selectedBuiltinGroupId}
            expandedIds={expandedBuiltinIds}
            onSelect={commands.onBrowseBuiltinGroup}
            onToggle={commands.onToggleBuiltinExpanded}
          />
        </div>
      )}

      {viewMode === 'primers' && (
        <div className="db-sidebar-section">
          <div className="db-sidebar-heading">
            <span>Library</span>
          </div>
          <button
            type="button"
            className={`db-tree-item${browse.kind === 'common' ? ' is-selected' : ''}`}
            onClick={commands.onBrowseCommonPrimers}
          >
            <Bookmark size={14} />
            <span>Common primers</span>
          </button>
        </div>
      )}

      {viewMode !== 'cdses' && (
        <div className="db-sidebar-section">
          <div className="db-sidebar-heading">
            <span>{viewMode === 'primers' ? 'Primer tags' : 'Tags'}</span>
          </div>
          {sidebarTags.length === 0 && (
            <p className="muted db-sidebar-empty">
              {viewMode === 'primers' ? 'No primer tags yet.' : 'No tags yet.'}
            </p>
          )}
          {sidebarTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`db-tree-item${browse.kind === 'tag' && browse.tag === tag ? ' is-selected' : ''}`}
              onClick={() => commands.onBrowseTag(tag)}
            >
              <Tag size={14} />
              <span>{tag}</span>
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}
