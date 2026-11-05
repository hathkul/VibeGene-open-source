import {
  Archive,
  Bookmark,
  Database,
  Dna,
  Download,
  FolderInput,
  FolderOpen,
  FolderSync,
  Library,
  Pencil,
  Pill,
  RotateCcw,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react'
import { DbSelectionExportMenu } from './DbExportMenus'
import { DbToolbarMenuProvider, DbToolbarModeGroup } from './DbToolbarModeGroup'
import type { DatabaseManagerToolbarCommands, DatabaseManagerToolbarModel } from './databaseManagerToolbarTypes'

export type DatabaseManagerToolbarProps = {
  model: DatabaseManagerToolbarModel
  commands: DatabaseManagerToolbarCommands
}

export function DatabaseManagerToolbar({ model, commands }: DatabaseManagerToolbarProps) {
  const { intent, pick, viewMode, sync, historyRecovery, fileSelection, primerSelection, proteinSelection } =
    model
  const manageOnly = intent === 'manage'

  return (
    <div className="db-main-toolbar">
      <DbToolbarMenuProvider>
        <div className="db-main-actions">
          {fileSelection.visible && fileSelection.showAlignment ? (
            <button
              type="button"
              className="primary database-construct-add-button"
              disabled={fileSelection.busy}
              title="Add selected constructs to the open alignment"
              onClick={() => void commands.fileSelection.onAddToAlignment()}
            >
              Add to alignment
              {fileSelection.count > 1 ? ` (${fileSelection.count})` : ''}
            </button>
          ) : null}
          {proteinSelection.visible && proteinSelection.showAlignment ? (
            <button
              type="button"
              className="primary database-construct-add-button"
              disabled={proteinSelection.busy}
              title="Add selected translated CDSes to the open protein alignment"
              onClick={() => void commands.proteinSelection.onAddToAlignment()}
            >
              Add to alignment
              {proteinSelection.count > 1 ? ` (${proteinSelection.count})` : ''}
            </button>
          ) : null}
          {pick.libraryMember?.visible ? (
            <button
              type="button"
              className="primary database-construct-add-button"
              disabled={pick.libraryMember.disabled}
              title={pick.libraryMember.title}
              onClick={() => commands.pick.onAddLibraryMembers?.()}
            >
              {pick.libraryMember.label}
              {pick.libraryMember.countSuffix}
            </button>
          ) : null}
          {pick.construct?.visible ? (
            <button
              type="button"
              className="primary database-construct-add-button"
              disabled={pick.construct.disabled}
              title={pick.construct.title}
              onClick={() => commands.pick.onAddConstruct?.()}
            >
              {pick.construct.confirmLabel}
            </button>
          ) : null}
          {pick.construct?.cancelVisible ? (
            <button type="button" disabled={viewMode.busy} onClick={() => commands.pick.onCancelConstructPick?.()}>
              {pick.construct?.cancelLabel ?? 'Cancel cloning selection'}
            </button>
          ) : null}
          <div className="db-view-mode-group" role="group" aria-label="Database view mode">
            <button
              type="button"
              className={viewMode.active === 'dna' ? 'is-active' : undefined}
              disabled={viewMode.busy || viewMode.dnaDisabled}
              title="Show DNA constructs"
              onClick={commands.viewMode.onSelectDna}
            >
              <Dna size={14} /> DNA
            </button>
            <button
              type="button"
              className={viewMode.active === 'primers' ? 'is-active' : undefined}
              disabled={viewMode.busy || viewMode.primersDisabled}
              title="Show primers from database files"
              onClick={commands.viewMode.onSelectPrimers}
            >
              <Bookmark size={14} /> Primers
            </button>
            <button
              type="button"
              className={viewMode.active === 'proteins' ? 'is-active' : undefined}
              disabled={viewMode.busy || viewMode.proteinsDisabled}
              title="Show saved protein files"
              onClick={commands.viewMode.onSelectProteins}
            >
              <Pill size={14} /> Proteins
            </button>
            <button
              type="button"
              className={viewMode.active === 'cdses' ? 'is-active' : undefined}
              disabled={viewMode.busy || viewMode.cdsesDisabled}
              title="Show translated CDSes from DNA files"
              onClick={commands.viewMode.onSelectCdses}
            >
              <Library size={14} /> CDSes
            </button>
          </div>
          {manageOnly ? <DbToolbarModeGroup
            menuId="import"
            value={sync.modes.import}
            onChange={commands.sync.onImportModeChange}
            disabled={viewMode.busy}
            onRun={commands.sync.onRunImportMode}
            modes={[
              {
                id: 'import',
                label: 'Import',
                title: 'Import sequence files into the database',
                icon: <Upload size={14} />,
              },
              {
                id: 'import-folder',
                label: 'Import folder',
                title: sync.folderDirectoryImportAvailable
                  ? 'Import a folder and its subfolders as a new database folder tree'
                  : 'Folder import is not available in iOS Safari',
                icon: <FolderOpen size={14} />,
                available: sync.folderDirectoryImportAvailable,
              },
            ]}
          /> : null}
          {manageOnly ? (
            <>
              <DbToolbarModeGroup
                menuId="sync"
                value={sync.modes.outbound === 'sync-to-folder' ? 'sync-to-folder' : sync.modes.inbound}
                onChange={(mode) => {
                  if (mode === 'sync-to-folder') commands.sync.onOutboundModeChange(mode)
                  else if (mode === 'sync-to-database' || mode === 'sync-cleanup-database') commands.sync.onInboundModeChange(mode)
                }}
                disabled={viewMode.busy}
                onRun={(mode) => {
                  if (mode === 'sync-to-folder') void commands.sync.onRunOutboundMode(mode)
                  else if (mode === 'export-database') void commands.sync.onRunOutboundMode(mode)
                  else void commands.sync.onRunInboundMode(mode)
                }}
                modes={[
                  {
                    id: 'import-database',
                    label: 'Import database',
                    title: sync.importDatabaseTitle,
                    icon: <Archive size={14} />,
                  },
                  {
                    id: 'export-database',
                    label: 'Export database',
                    title: sync.exportDatabaseTitle,
                    icon: <Download size={14} />,
                  },
                  {
                    id: 'sync-to-database',
                    label: 'Sync from folder',
                    title: 'Import changes from a folder once; this does not create a folder link',
                    icon: <Database size={14} />,
                    available: sync.isTauri,
                  },
                  {
                    id: 'sync-cleanup-database',
                    label: 'Sync and clean up',
                    title: sync.selectedFolderHasSyncSource ? 'Reconcile this mapped folder now' : 'Reconcile a folder once; this does not create a folder link',
                    icon: <Trash2 size={14} />,
                    available: sync.isTauri,
                  },
                  {
                    id: 'sync-to-folder',
                    label: 'Sync to folder',
                    title: 'Write this database folder to a folder once; this does not create a folder link',
                    icon: <FolderSync size={14} />,
                    available: sync.isTauri,
                  },
                ]}
              />
            </>
          ) : null}
          {manageOnly && historyRecovery.visible ? (
            <>
              <button
                type="button"
                disabled={historyRecovery.busy}
                title={`Restore history trimmed from ${historyRecovery.projectCount} database file${historyRecovery.projectCount === 1 ? '' : 's'}`}
                onClick={() => void commands.historyRecovery.onRestore()}
              >
                <RotateCcw size={14} /> Restore last trim ({historyRecovery.projectCount})
              </button>
              <button
                type="button"
                className="danger-text"
                disabled={historyRecovery.busy}
                title="Delete the latest recovery copy now to reclaim its storage"
                onClick={() => void commands.historyRecovery.onDiscard()}
              >
                <Trash2 size={14} /> Discard recovery
              </button>
            </>
          ) : null}
          {fileSelection.visible ? (
            <>
              {manageOnly ? <DbSelectionExportMenu
                selectionCount={fileSelection.count}
                disabled={fileSelection.busy}
                selectionTitle={fileSelection.exportSelectionTitle}
                onStatus={commands.fileSelection.onStatus}
                onExport={async (format) => commands.fileSelection.onExport(format)}
              /> : null}
              {manageOnly ? <button
                type="button"
                disabled={fileSelection.busy || fileSelection.renameDisabled}
                title={fileSelection.renameTitle}
                onClick={commands.fileSelection.onRename}
              >
                <Pencil size={14} /> Rename
              </button> : null}
              {manageOnly ? <button type="button" disabled={fileSelection.busy} onClick={commands.fileSelection.onMove}>
                <FolderInput size={14} /> {fileSelection.moveLabel}
              </button> : null}
              {manageOnly ? <button type="button" disabled={fileSelection.busy} onClick={commands.fileSelection.onEditTags}>
                <Tag size={14} /> {fileSelection.tagsLabel}
              </button> : null}
              {manageOnly ? <button
                type="button"
                disabled={fileSelection.busy}
                title="Preview and trim history in the selected database files"
                onClick={() => void commands.fileSelection.onTrimHistory()}
              >
                <Archive size={14} /> {fileSelection.trimLabel}
              </button> : null}
              {manageOnly ? <button
                type="button"
                className="danger-text"
                disabled={fileSelection.busy}
                title={fileSelection.deleteTitle}
                onClick={() => void commands.fileSelection.onDelete()}
              >
                <Trash2 size={14} /> {fileSelection.deleteLabel}
              </button> : null}
            </>
          ) : null}
          {manageOnly && primerSelection.visible ? (
            <>
              <button
                type="button"
                disabled={primerSelection.busy || primerSelection.renameDisabled}
                title={primerSelection.renameTitle}
                onClick={commands.primerSelection.onRename}
              >
                <Pencil size={14} /> Rename
              </button>
              <button type="button" disabled={primerSelection.busy} onClick={commands.primerSelection.onEditTags}>
                <Tag size={14} /> {primerSelection.tagsLabel}
              </button>
              <button
                type="button"
                disabled={primerSelection.busy || primerSelection.addToCurrentDisabled}
                title={primerSelection.addToCurrentTitle}
                onClick={commands.primerSelection.onAddToCurrent}
              >
                Add to current sequence
                {primerSelection.count > 1 ? ` (${primerSelection.count})` : ''}
              </button>
              <button
                type="button"
                disabled={primerSelection.busy || primerSelection.addToCommonDisabled}
                title={primerSelection.addToCommonTitle}
                onClick={() => void commands.primerSelection.onAddToCommon()}
              >
                <Bookmark size={14} /> Add to Common primers
                {primerSelection.count > 1 ? ` (${primerSelection.count})` : ''}
              </button>
              {primerSelection.showRemoveCommon ? (
                <button
                  type="button"
                  className="danger-text"
                  disabled={primerSelection.busy}
                  onClick={() => void commands.primerSelection.onRemoveFromCommon()}
                >
                  <Trash2 size={14} /> Remove from common
                </button>
              ) : null}
            </>
          ) : null}
          {manageOnly && proteinSelection.visible ? (
            <>
              <button type="button" disabled={proteinSelection.busy} onClick={commands.proteinSelection.onOpen}>
                Open
                {proteinSelection.count > 1 ? ` (${proteinSelection.count})` : ''}
              </button>
              <button
                type="button"
                disabled={proteinSelection.busy}
                title="Copy selected translated CDS sequence(s) to the clipboard"
                onClick={commands.proteinSelection.onCopySequences}
              >
                Copy sequence
                {proteinSelection.count > 1 ? ` (${proteinSelection.count})` : ''}
              </button>
            </>
          ) : null}
        </div>
      </DbToolbarMenuProvider>
    </div>
  )
}
