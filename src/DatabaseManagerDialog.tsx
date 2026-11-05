import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Upload } from 'lucide-react'
import {
  createHistoryTrimRecoveryBatch,
  deleteHistoryTrimRecoveryBatch,
  deleteProjectFileTombstone,
  getProject,
  getProjectFileBlobByteLengths,
  listHistoryTrimRecoveryBatches,
  listProjectFileTombstones,
  normalizeProjectFileName,
  queryProjectSummaryPage,
  restoreHistoryTrimRecoveryBatch,
  saveProject,
  type HistoryTrimRecoveryBatch,
  type StoredFolderSyncMapping,
  type StoredProject,
  type StoredProjectFileTombstone,
  type StoredProjectSummary,
} from './storage/projects'
import { constructRecordFromLibraryMember } from './domain/libraryMemberRecord'
import { collectFolderSubtreeIds } from './storage/databaseExport'
import {
  DatabaseHistoryBatchDialog,
  type DatabaseHistoryBatchApplyOptions,
  type DatabaseHistoryBatchResult,
} from './DatabaseHistoryBatchDialog'
import { applyHistoryRetention, type HistoryRetentionPolicy } from './domain/historyRetention'
import { previewHistoryTrimBatch } from './domain/historyRetentionPreview'
import {
  addCommonPrimers,
  deleteCommonPrimers,
  listCommonPrimers,
  upsertCommonPrimer,
} from './storage/commonPrimers'
import { DatabaseManagerPrimerPropertiesOverlay } from './DatabaseManagerPrimerPropertiesOverlay'
import { scheduleDatabasePrimerPropertiesOpen } from './application/primerWorkflow/scheduleDatabasePrimerPropertiesOpen'
import { DatabaseFolderPickerTree } from './DatabaseFolderPickerTree'
import { bytesToFile, pickDesktopDirectory, subscribeDesktopFileDrops } from './desktop/fileIo'
import { exportDatabaseLibrary } from './desktop/exportDatabaseLibrary'
import { exportProjectById, exportSelectedProjects } from './desktop/databaseManagerProjectExport'
import { importDatabaseLibrary, importFolderLibrary } from './desktop/importDatabaseLibrary'
import { applyFolderScopedSync, preflightFolderScopedSync, reconcileMappedFolderDesktop } from './desktop/folderScopedSync'
import { isTauriRuntime } from './desktop/tauriRuntime'
import { isHybridWindowRuntime } from './desktop/hybridWindows'
import { syncNativeWindowTitle } from './desktop/windowTitle'
import { loadDatabaseManagerStartupData } from './desktop/databaseManagerStartup'
import { databaseManagerWorkflowHeaderStatus } from './application/databaseManager/workflowHeaderStatus'
import { useMobileShellViewport } from './ui/mobileShellMedia'

import { formatSequenceLength } from './domain/moleculeCapabilities'
import { subscribeLibraryChanged } from './storage/libraryEvents'
import {
  UNFILED_FOLDER_ID,
  buildFolderTree,
  collectAllTags,
  commonTags,
  createFolder,
  deleteFolder,
  folderPathLabel,
  listFolders,
  moveFolder,
  moveProjectsToFolder,
  normalizeTags,
  renameFolder,
  renameProjectFileName,
  resolveFolderSyncMapping,
  resolveTopLevelFolder,
  setTopLevelFolderSyncMapping,
  setProjectsTags,
  type StoredFolder,
} from './storage/projectLibrary'
import {
  DATABASE_FILE_COLUMN_MIN_WIDTH,
  DATABASE_PRIMER_COLUMN_MIN_WIDTH,
  DATABASE_PROTEIN_COLUMN_MIN_WIDTH,
  DATABASE_UI_PREFS_CHANGED_EVENT,
  DEFAULT_DATABASE_FILE_COLUMN_WIDTHS,
  DEFAULT_DATABASE_PRIMER_COLUMN_WIDTHS,
  DEFAULT_DATABASE_PROTEIN_COLUMN_WIDTHS,
  moveColumnInOrder,
  readDatabaseColumnWidths,
  readDatabaseExpandedFolderIds,
  readDatabaseFileColumnOrder,
  readDatabaseModalSize,
  readDatabasePrimerColumnOrder,
  readDatabasePrimerColumnWidths,
  readDatabaseProteinColumnOrder,
  readDatabaseProteinColumnWidths,
  readDatabaseSidebarWidth,
  readDatabaseToolbarModes,
  readDatabaseViewMode,
  moleculeBelongsInDatabaseFileView,
  writeDatabaseColumnWidths,
  writeDatabaseExpandedFolderIds,
  writeDatabaseFileColumnOrder,
  writeDatabaseModalSize,
  writeDatabasePrimerColumnOrder,
  writeDatabasePrimerColumnWidths,
  writeDatabaseProteinColumnOrder,
  writeDatabaseProteinColumnWidths,
  writeDatabaseSidebarWidth,
  writeDatabaseToolbarModes,
  writeDatabaseViewMode,
  type DatabaseFileColumnId,
  type DatabaseImportToolbarMode,
  type DatabaseInboundToolbarMode,
  type DatabaseOutboundToolbarMode,
  type DatabasePrimerColumnId,
  type DatabaseProteinColumnId,
  type DatabaseToolbarModes,
  type DatabaseViewMode,
} from './storage/databaseUiPrefs'
import {
  collectPrimerTagNames,
  commonPrimerTags,
  COMMON_PRIMERS_SOURCE_ID,
  commonPrimersToHits,
  databasePrimerRowAfterCommonSave,
  dedupePrimerHits,
  loadPrimerTagMap,
  primerIdentityKey,
  primerPropertiesPayloadFromDatabaseRow,
  primerRowIsCommon,
  scanDatabasePrimerHits,
  setPrimerKeysTags,
  tagsForPrimerKey,
  type DatabasePrimerHit,
  type DatabasePrimerRow,
} from './storage/databasePrimers'
import {
  createSequenceRecordFromDatabaseProtein,
  dedupeProteinHits,
  peptideForTranslatedCds,
  scanDatabaseProteinHits,
  type DatabaseProteinHit,
  type DatabaseProteinRow,
} from './storage/databaseProteins'
import { proteinTranslationSourceFromRecord } from './domain/proteinTranslationProvenance'
import { libraryMemberWorkspaceDocumentOrigin, type WorkspaceDocumentOrigin } from './domain/workspaceDocumentOrigin'
import { peptideMassDa } from './domain/commonFeatures'
import { gcContent } from './domain/sequence'
import { databasePageWindow, DATABASE_TABLE_PAGE_SIZE } from './domain/databasePagination'
import { importFilesIntoLibrary } from './storage/importToLibrary'
import { inferProjectFileFormat, isIosWebFilePicker, projectFileFormatLabel, SEQUENCE_OPEN_ACCEPT } from './domain/fileFormats'
import {
  folderScopedSyncConflictChoices,
  folderScopedSyncConflictHasDiskFile,
  folderScopedSyncDiskFilesByPath,
  type FolderScopedSyncApplyResult,
  type FolderScopedSyncConflictResolution,
  type FolderScopedSyncPreflight,
} from './storage/folderScopedSyncService'
import {
  BUILTIN_PLASMID_TREE,
  entryMatchesBuiltInGroup,
  loadBuiltInPlasmidIndex,
  loadBuiltInPlasmidRecord,
  type BuiltInPlasmidEntry,
  type BuiltInPlasmidGroupId,
} from './domain/builtInPlasmids'
import {
  databaseWindowTitle,
  type DatabaseBrowseMode,
} from './application/databaseManager/browsePresentation'
import { effectiveFlexibleColumnWidths } from './application/databaseManager/columnWidthPlanning'
import { primerFileNamesSortKey, proteinFileNamesSortKey } from './application/databaseManager/sourceSortKeys'
import { type FolderSyncIntent } from './application/databaseManager/folderSyncPresentation'
import {
  buildAppDatabaseManagerHeaderPresentationSlice,
  databaseManagerHeaderItemCount,
  databaseManagerHeaderSelectedCount,
  buildAppDatabaseManagerToolbarPresentationModel,
  databaseManagerBrowseNavigationEffect,
  assembleDatabaseManagerRecordsPaneModels,
  buildAppDatabaseManagerFilesRowActionSlice,
  buildDatabaseManagerFolderSyncRegionModel,
  databaseManagerFolderSyncRegionVisible,
} from './application/databaseManager/presentation'
import { executeDatabaseManagerMovePickerConfirm } from './application/databaseManager/commands/folderMoveOrchestration'
import { runDatabaseManagerRestoreIgnoredFileAfterConfirm } from './application/databaseManager/commands/folderSyncRestoreWorkflow'
import { buildDatabaseManagerRecordsRegionCommands } from './application/databaseManager/commands/recordsRegionCommandBuilders'
import type { DatabaseManagerRecordsRegionCommandPorts } from './application/databaseManager/commands/recordsRegionCommandBuilders'
import type { LibraryPrimer } from './domain/libraryPrimer'
import { openDatabaseManagerSidebarNewFolderPrompt } from './application/databaseManager/commands/sidebarNewFolderCommands'
import { buildDatabaseManagerToolbarCommandsFromPorts } from './application/databaseManager/composition/toolbarCommandAssembly'
import { createDatabaseManagerToolbarPortBundle } from './application/databaseManager/composition/toolbarPortFactories'
import { addFolderAncestors } from './application/databaseManager/folderAncestorIds'
import { buildDatabaseManagerGoToPageCommand } from './application/databaseManager/paginationRouting'
import { primerOligoTm } from './application/databaseManager/primerOligoTm'
import { primerPropertiesPayloadFromLibrary } from './application/primerWorkflow/primerPropertiesPayload'
import type { PrimerPropertiesPayload } from './application/ports/hybridWindows'
import { assembleFolderSyncPreflightViewModel } from './application/databaseManager/presentation/folderSyncPreflightViewModelAssembly'
import { mapPresentationTreeNodes } from './application/databaseManager/presentation/presentationTreeMapping'
import type { DatabaseManagerConstructPickContext } from './application/databaseManager/presentation/pickContext'
import { databaseManagerPickSelectionScope, filterDatabaseManagerSelection } from './application/databaseManager/selectionScope'
import { useDatabaseManagerSelectionScope } from './presentation/hooks/useDatabaseManagerSelectionScope'
import type { DatabaseManagerRecordsRegionProps } from './presentation/databaseManager/DatabaseManagerRecordsRegion'
import {
  applyToggleToSelection,
  planConstructSinglePickSelection,
  planTableRangeSelection,
} from './application/databaseManager/tableSelection'
import {
  DatabaseManagerShellLayout,
  DatabaseTextPromptDialog,
  FolderSyncPreflightDialog,
  mapBuiltInTableRows,
  mapPrimerTableRows,
  mapProteinTableRows,
  mapProjectTableRows,
  type DbSortDirection,
} from './presentation/databaseManager'
import type { DatabaseManagerToolbarModel } from './presentation/databaseManager/databaseManagerToolbarTypes'
import type { FolderSyncPreflightViewModel } from './presentation/databaseManager/folderSyncPreflightTypes'

type BrowseMode = DatabaseBrowseMode
function databaseProjectFileName(project: StoredProjectSummary): string {
  return normalizeProjectFileName(project.fileName ?? project.syncRelativePath, project.name, project.molecule)
}

function databaseProjectFormatLabel(project: StoredProjectSummary): string {
  return projectFileFormatLabel(
    project.fileFormat ?? inferProjectFileFormat(databaseProjectFileName(project)),
  )
}

type PickerMode =
  | null
  | { kind: 'move-folder'; folderId: string }
  | { kind: 'move-projects'; projectIds: string[] }
type DatabaseManagerDialogProps = {
  projects: StoredProjectSummary[]
  currentRecordId: string | null
  /** When set, show Add to alignment for the focused editor's alignment mode. */
  alignmentPick?: import('./desktop/hybridWindows').DatabaseAlignmentPick | null
  /** When set, use the full database browser to choose cloning source constructs. */
  constructPick?: import('./desktop/hybridWindows').DatabaseConstructPick | null
  /** When set, Database shows Add for inserting DNA constructs into the open library. */
  libraryMemberPick?: import('./desktop/hybridWindows').DatabaseLibraryMemberPick | null
  onClose: () => void
  onRefresh: () => Promise<void> | void
  onOpenProject: (project: StoredProject & { documentOrigin?: WorkspaceDocumentOrigin }) => void
  onDragProjectsToWorkspace?: (projectIds: string[]) => void
  onDragPrimersToWorkspace?: (primers: LibraryPrimer[]) => void
  onAddPrimersToCurrent: (primers: DatabasePrimerRow[]) => void
  onAddToAlignment?: (
    constructs: import('./desktop/hybridWindows').DatabaseAlignmentConstruct[],
  ) => void
  onAddLibraryMembers?: (projectIds: string[]) => void
  onAddConstruct?: (project: StoredProject) => void
  onAddConstructs?: (projects: StoredProject[]) => void
  onCancelConstructPick?: () => void
  onDeleteProjects: (projectIds: string[]) => Promise<void> | void
  onStatus?: (message: string) => void
  onOpenPrimerProperties?: (primer: PrimerPropertiesPayload) => void
}

const MIN_WIDTH = 1000
const MIN_HEIGHT = 480
const DEFAULT_WIDTH = 1220
const DEFAULT_HEIGHT = 680
const DEFAULT_SIDEBAR_WIDTH = 220
const MIN_SIDEBAR_WIDTH = 140
const MAX_SIDEBAR_WIDTH = 420

const DB_CHECK_COL_WIDTH = 40

const NO_VISIBLE_PROJECT_PAGE: StoredProjectSummary[] = []

function formatFileSize(bytes: number | undefined): string {
  if (!Number.isFinite(bytes)) return '—'
  if ((bytes ?? 0) < 1024) return `${bytes} B`
  if ((bytes ?? 0) < 1024 * 1024) return `${((bytes ?? 0) / 1024).toFixed(1)} KB`
  return `${((bytes ?? 0) / (1024 * 1024)).toFixed(1)} MB`
}

type DbColumnId = DatabaseFileColumnId
type PrimerColumnId = DatabasePrimerColumnId
type ProteinColumnId = DatabaseProteinColumnId

const DEFAULT_DB_COLUMN_WIDTHS = DEFAULT_DATABASE_FILE_COLUMN_WIDTHS
const DB_COLUMN_MIN_WIDTH = DATABASE_FILE_COLUMN_MIN_WIDTH
const DEFAULT_PRIMER_COLUMN_WIDTHS = DEFAULT_DATABASE_PRIMER_COLUMN_WIDTHS
const PRIMER_COLUMN_MIN_WIDTH = DATABASE_PRIMER_COLUMN_MIN_WIDTH
const DEFAULT_PROTEIN_COLUMN_WIDTHS = DEFAULT_DATABASE_PROTEIN_COLUMN_WIDTHS
const PROTEIN_COLUMN_MIN_WIDTH = DATABASE_PROTEIN_COLUMN_MIN_WIDTH

/** Lightweight library-member row for Database expand-in-place browsing. */
type DatabaseLibraryMemberBrowseRow = {
  id: string
  fileName: string
  sequenceLength: number
  enabled: boolean
  parseError?: string
}

const databaseFileFlexColumnId: DbColumnId = 'name'
const databaseFileColumnSizing = {
  flexColumnMinWidth: DB_COLUMN_MIN_WIDTH.name,
  selectionColumnWidth: DB_CHECK_COL_WIDTH,
  minWidths: DB_COLUMN_MIN_WIDTH,
}

const databasePrimerFlexColumnId: PrimerColumnId = 'sequence'
const databasePrimerColumnSizing = {
  flexColumnMinWidth: PRIMER_COLUMN_MIN_WIDTH.sequence,
  selectionColumnWidth: DB_CHECK_COL_WIDTH,
  minWidths: PRIMER_COLUMN_MIN_WIDTH,
}

const databaseProteinFlexColumnId: ProteinColumnId = 'sequence'
const databaseProteinColumnSizing = {
  flexColumnMinWidth: PROTEIN_COLUMN_MIN_WIDTH.sequence,
  selectionColumnWidth: DB_CHECK_COL_WIDTH,
  minWidths: PROTEIN_COLUMN_MIN_WIDTH,
}

type DbSortColumn = Exclude<DbColumnId, 'actions'>
type PrimerSortColumn = Exclude<PrimerColumnId, 'actions'>
type ProteinSortColumn = Exclude<ProteinColumnId, 'actions'>

type FolderSyncDialogState = {
  intent: FolderSyncIntent
  preflight: FolderScopedSyncPreflight
}

type TextPromptState = {
  title: string
  label: string
  initial: string
  confirmLabel?: string
  allowEmpty?: boolean
  secondaryLabel?: string
  secondaryInitial?: string
  /** Existing tags shown below the input for one-click assign/toggle. */
  suggestions?: string[]
  onConfirm: (value: string, secondaryValue?: string) => Promise<void> | void
}

export function DatabaseManagerDialog({
  projects,
  currentRecordId,
  alignmentPick = null,
  constructPick = null,
  libraryMemberPick = null,
  onClose,
  onRefresh,
  onOpenProject,
  onDragProjectsToWorkspace,
  onDragPrimersToWorkspace,
  onAddPrimersToCurrent,
  onAddToAlignment,
  onAddLibraryMembers,
  onAddConstruct,
  onAddConstructs,
  onCancelConstructPick,
  onDeleteProjects,
  onStatus,
  onOpenPrimerProperties,
}: DatabaseManagerDialogProps) {
  const [folders, setFolders] = useState<StoredFolder[]>([])
  const [browse, setBrowse] = useState<BrowseMode>({ kind: 'all' })
  const [pagination, setPagination] = useState({ key: '', page: 0 })
  const [projectPage, setProjectPage] = useState<{
    key: string
    page: number
    rows: StoredProjectSummary[]
    total: number
  }>({ key: '', page: 0, rows: [], total: 0 })
  const [projectFileByteLengths, setProjectFileByteLengths] = useState<Record<string, number>>({})
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => readDatabaseExpandedFolderIds())
  const [size, setSize] = useState(() =>
    readDatabaseModalSize(
      { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
      { width: MIN_WIDTH, height: MIN_HEIGHT },
    ),
  )
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readDatabaseSidebarWidth(DEFAULT_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH),
  )
  const [busy, setBusy] = useState(false)
  const [headerStatus, setHeaderStatus] = useState<string | null>(null)
  const [picker, setPicker] = useState<PickerMode>(null)
  const [pickerTarget, setPickerTarget] = useState<string>('')
  const [dragOver, setDragOver] = useState(false)
  const [columnWidths, setColumnWidths] = useState<Record<DbColumnId, number>>(
    () => ({
      ...readDatabaseColumnWidths(DEFAULT_DB_COLUMN_WIDTHS, DB_COLUMN_MIN_WIDTH),
      actions: DEFAULT_DB_COLUMN_WIDTHS.actions,
    }),
  )
  const [primerColumnWidths, setPrimerColumnWidths] = useState<Record<PrimerColumnId, number>>(
    () => readDatabasePrimerColumnWidths(DEFAULT_PRIMER_COLUMN_WIDTHS, PRIMER_COLUMN_MIN_WIDTH),
  )
  const [proteinColumnWidths, setProteinColumnWidths] = useState<Record<ProteinColumnId, number>>(
    () => readDatabaseProteinColumnWidths(DEFAULT_PROTEIN_COLUMN_WIDTHS, PROTEIN_COLUMN_MIN_WIDTH),
  )
  const [fileColumnOrder, setFileColumnOrder] = useState<DbColumnId[]>(() => readDatabaseFileColumnOrder())
  const [primerColumnOrder, setPrimerColumnOrder] = useState<PrimerColumnId[]>(() =>
    readDatabasePrimerColumnOrder(),
  )
  const [proteinColumnOrder, setProteinColumnOrder] = useState<ProteinColumnId[]>(() =>
    readDatabaseProteinColumnOrder(),
  )
  const [dragColumnId, setDragColumnId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<DbSortColumn>('updated')
  const [sortDirection, setSortDirection] = useState<DbSortDirection>('desc')
  const [storedViewMode, setViewMode] = useState<DatabaseViewMode>(() => readDatabaseViewMode())
  const viewMode = alignmentPick?.mode === 'dna' || Boolean(constructPick || libraryMemberPick)
    ? 'dna'
    : storedViewMode
  const pickSelectionScope = databaseManagerPickSelectionScope(constructPick, libraryMemberPick, alignmentPick)
  const { selectedIds, selectionScopeKey, setScopedSelectedIds } = useDatabaseManagerSelectionScope(pickSelectionScope)
  const [toolbarModes, setToolbarModes] = useState<DatabaseToolbarModes>(() => readDatabaseToolbarModes())
  const [primerHits, setPrimerHits] = useState<DatabasePrimerHit[]>([])
  const [primerTagMap, setPrimerTagMap] = useState<Map<string, string[]>>(() => new Map())
  const [primerScanBusy, setPrimerScanBusy] = useState(false)
  const [primerSortColumn, setPrimerSortColumn] = useState<PrimerSortColumn>('name')
  const [primerSortDirection, setPrimerSortDirection] = useState<DbSortDirection>('asc')
  const [proteinHits, setProteinHits] = useState<DatabaseProteinHit[]>([])
  const [proteinScanBusy, setProteinScanBusy] = useState(false)
  const [proteinSortColumn, setProteinSortColumn] = useState<ProteinSortColumn>('name')
  const [proteinSortDirection, setProteinSortDirection] = useState<DbSortDirection>('asc')
  const [builtInPlasmids, setBuiltInPlasmids] = useState<BuiltInPlasmidEntry[]>([])
  const [expandedBuiltinIds, setExpandedBuiltinIds] = useState<Set<string>>(
    () => new Set(['builtin', 'gateway', 'ta-gc']),
  )
  const [expandedLibraryIds, setExpandedLibraryIds] = useState<Set<string>>(() => new Set())
  const [libraryMembersById, setLibraryMembersById] = useState<
    Record<string, DatabaseLibraryMemberBrowseRow[]>
  >({})
  const [libraryMembersLoadingIds, setLibraryMembersLoadingIds] = useState<Set<string>>(() => new Set())
  const [editingPrimer, setEditingPrimer] = useState<DatabasePrimerRow | null>(null)
  const [editingPrimerPayload, setEditingPrimerPayload] = useState<PrimerPropertiesPayload | null>(null)
  const [textPrompt, setTextPrompt] = useState<TextPromptState | null>(null)
  const [folderSyncMapping, setFolderSyncMapping] = useState<StoredFolderSyncMapping | null>(null)
  const [folderSyncTombstones, setFolderSyncTombstones] = useState<StoredProjectFileTombstone[]>([])
  const [folderSyncContextLoading, setFolderSyncContextLoading] = useState(false)
  const [folderSyncDialog, setFolderSyncDialog] = useState<FolderSyncDialogState | null>(null)
  const folderSyncPreflightModel = useMemo((): FolderSyncPreflightViewModel | null => {
    if (!folderSyncDialog) return null
    const { intent, preflight } = folderSyncDialog
    const diskByPath = folderScopedSyncDiskFilesByPath(preflight.diskFiles)
    const conflictById = new Map(preflight.conflicts.map((conflict) => [conflict.id, conflict]))
    return assembleFolderSyncPreflightViewModel(
      intent,
      {
        externalPath: preflight.externalPath,
        direction: preflight.direction,
        primerListCount: preflight.primerListFiles.length,
        counts: preflight.plan.counts,
        conflicts: preflight.conflicts.map((conflict) => ({
          id: conflict.id,
          relativePath: conflict.relativePath,
          reason: conflict.reason,
          conflictingPaths: conflict.conflictingPaths,
        })),
      },
      {
        allowedChoicesFor: (conflict) => {
          const source = conflictById.get(conflict.id)!
          return folderScopedSyncConflictChoices(
            source,
            preflight.direction,
            preflight.cleanup,
            folderScopedSyncConflictHasDiskFile(source, diskByPath),
          )
        },
        conflictHasDiskFile: (conflict) => {
          const source = conflictById.get(conflict.id)!
          return folderScopedSyncConflictHasDiskFile(source, diskByPath)
        },
      },
    )
  }, [folderSyncDialog])
  const [folderSyncApplyProgress, setFolderSyncApplyProgress] = useState<string | null>(null)
  const [historyBatch, setHistoryBatch] = useState<{
    projects: StoredProject[]
    result: DatabaseHistoryBatchResult | null
  } | null>(null)
  const [latestHistoryRecovery, setLatestHistoryRecovery] = useState<HistoryTrimRecoveryBatch | null>(null)
  const historyBatchProjects = historyBatch?.projects
  const historyBatchRecords = useMemo(
    () => historyBatchProjects?.map((project) => project.record) ?? [],
    [historyBatchProjects],
  )
  const [tableViewportWidth, setTableViewportWidth] = useState(0)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const fileListRef = useRef<HTMLDivElement | null>(null)
  const pendingInfiniteScrollRef = useRef<{
    top: number
    left: number
    anchorId: string | null
    anchorOffset: number | null
  } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)
  const sidebarResizeRef = useRef<{ startX: number; startW: number } | null>(null)
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const importDatabaseZipInputRef = useRef<HTMLInputElement | null>(null)
  const importFolderInputRef = useRef<HTMLInputElement | null>(null)
  const dragDepthRef = useRef(0)
  const hybridWindow = isHybridWindowRuntime()
  const isMobileShell = useMobileShellViewport()
  const folderDirectoryImportAvailable = isTauriRuntime() || !isIosWebFilePicker()
  const [mobilePane, setMobilePane] = useState<'folders' | 'records'>('records')

  const reportStatus = useCallback((message: string) => {
    setHeaderStatus(message)
    onStatus?.(message)
  }, [onStatus])

  function clearIdleHeaderStatus() {
    if (busy || !headerStatus) return
    setHeaderStatus(null)
  }

  async function runDatabaseImport(source?: File | null) {
    await runAction('import database', async () => {
      const result = await importDatabaseLibrary(source ?? null, (done, total, name) => {
        if (total === 0) return
        reportStatus(
          done >= total ? 'Finishing database import…' : `Importing database ${done + 1}/${total}: ${name}`,
        )
      })
      if (!result.ok) {
        if (result.cancelled) {
          reportStatus('Database import cancelled.')
          return
        }
        throw new Error(result.error)
      }
      const failNote =
        result.result.failed.length > 0
          ? ` (${result.result.failed.length} failed: ${result.result.failed[0]!.fileName})`
          : ''
      reportStatus(
        `Imported database: ${result.result.projectsSaved} construct(s), ${result.result.foldersCreated} folder(s)${failNote}.`,
      )
      setBrowse({ kind: 'all' })
    })
  }

  async function runFolderImport(source?: { rootName: string; files: File[] } | null) {
    await runAction('import folder', async () => {
      const result = await importFolderLibrary(source ?? null, (done, total, name) => {
        if (total === 0) {
          reportStatus(name)
          return
        }
        reportStatus(
          done >= total ? 'Finishing folder import…' : `Importing folder ${done + 1}/${total}: ${name}`,
        )
      })
      if (!result.ok) {
        if (result.cancelled) {
          reportStatus('Folder import cancelled.')
          return
        }
        throw new Error(result.error)
      }
      const failNote =
        result.result.failed.length > 0
          ? ` (${result.result.failed.length} failed: ${result.result.failed[0]!.fileName})`
          : ''
      const primerNote =
        result.result.primersSaved > 0
          ? `, ${result.result.primersSaved} folder primer(s)`
          : ''
      reportStatus(
        `Imported folder “${result.result.rootFolderName}”: ${result.result.projectsSaved} construct(s), ${result.result.foldersCreated} folder(s)${primerNote}${failNote}.`,
      )
      applyBrowseNavigation({ kind: 'folder', folderId: result.result.rootFolderId })
    })
  }

  function setInboundMode(mode: DatabaseInboundToolbarMode) {
    setToolbarModes((current) => ({ ...current, inbound: mode }))
  }

  function setImportMode(mode: DatabaseImportToolbarMode) {
    setToolbarModes((current) => ({ ...current, import: mode }))
  }

  function setOutboundMode(mode: DatabaseOutboundToolbarMode) {
    setToolbarModes((current) => ({ ...current, outbound: mode }))
  }

  async function beginFolderSync(intent: FolderSyncIntent) {
    if (!isTauriRuntime()) {
      reportStatus('Folder sync is only available in the desktop app.')
      return
    }
    if (!selectedTopLevelFolder || browse.kind !== 'folder') {
      reportStatus('Select a database folder before syncing.')
      return
    }
    if (intent === 'sync-cleanup' && folderSyncMapping?.folderId === selectedTopLevelFolder.id) {
      await runAction('reconcile linked folder', async () => {
        reportStatus(`Reconciling linked folder ${folderSyncMapping.externalPath}…`)
        const result = await reconcileMappedFolderDesktop(selectedTopLevelFolder.id)
        if (result.failures.length) throw new Error(result.failures[0]!.error)
        reportStatus(`Linked folder reconciled: ${result.importedFromDisk} imported, ${result.writtenToDisk} written, ${result.diskDeleted} tombstoned, ${result.conflictCopies} preserved copy(s).`)
        await refreshFolderSyncContext(selectedTopLevelFolder.id)
      })
      return
    }
    const externalPath = await pickDesktopDirectory(intent === 'sync-to' ? 'Sync to folder' : intent === 'sync-cleanup' ? 'Sync and clean up' : 'Sync from folder')
    if (!externalPath) {
      reportStatus('Folder sync cancelled.')
      return
    }
    await runAction('prepare folder sync', async () => {
      reportStatus(`Scanning ${externalPath}…`)
      const preflight = await preflightFolderScopedSync(selectedTopLevelFolder.id, {
        direction: intent === 'sync-to' ? 'to' : 'from',
        cleanup: intent === 'sync-cleanup',
        externalPath,
      })
      setFolderSyncDialog({ intent, preflight })
      reportStatus(
        `Preflight ready: ${preflight.plan.actions.length} action(s), ${preflight.conflicts.length} conflict(s). No changes applied yet.`,
      )
    })
  }

  function folderSyncApplyStatus(result: FolderScopedSyncApplyResult): string {
    const changes =
      result.addedToDb +
      result.updatedInDb +
      result.writtenToDisk +
      result.removedFromDb
    if (result.failures.length || result.unresolvedConflicts.length) {
      const failure = result.failures[0]
      const unresolved = result.unresolvedConflicts[0]
      return [
        `Sync incomplete: ${changes} change(s) applied`,
        result.failures.length
          ? `${result.failures.length} failure(s)${failure ? ` (${failure.relativePath}: ${failure.error})` : ''}`
          : '',
        result.unresolvedConflicts.length
          ? `${result.unresolvedConflicts.length} unresolved conflict(s)${unresolved ? ` (${unresolved.relativePath}: ${unresolved.reason})` : ''}`
          : '',
      ]
        .filter(Boolean)
        .join('; ')
    }
    return `Sync complete: added ${result.addedToDb}, updated ${result.updatedInDb}, wrote ${result.writtenToDisk}, removed ${result.removedFromDb}, ignored ${result.ignored}${
      result.primersSaved || result.primersRemoved
        ? `, primers saved ${result.primersSaved}, removed ${result.primersRemoved}`
        : ''
    }.`
  }

  async function applyPreparedFolderSync(
    resolutions: FolderScopedSyncConflictResolution[],
  ) {
    const prepared = folderSyncDialog
    if (!prepared) return
    await runAction('apply folder sync', async () => {
      try {
        setFolderSyncApplyProgress('Starting…')
        reportStatus('Applying reviewed sync plan…')
        const result = await applyFolderScopedSync(prepared.preflight, {
          resolutions,
          onProgress: (done, total, name) => {
            const label = `Applying ${done} of ${total}: ${name}`
            setFolderSyncApplyProgress(label)
            reportStatus(label)
          },
        })
        setFolderSyncDialog(null)
        reportStatus(folderSyncApplyStatus(result))
        await refreshPrimerLibrary()
        await refreshFolderSyncContext(prepared.preflight.folderId)
      } finally {
        setFolderSyncApplyProgress(null)
      }
    })
  }

  async function runInboundMode(mode: DatabaseInboundToolbarMode) {
    if (mode === 'import-database') {
      if (isTauriRuntime()) void runDatabaseImport()
      else importDatabaseZipInputRef.current?.click()
      return
    }
    await beginFolderSync(mode === 'sync-cleanup-database' ? 'sync-cleanup' : 'sync-from')
  }

  function runImportMode(mode: DatabaseImportToolbarMode) {
    if (mode === 'import') {
      importInputRef.current?.click()
      return
    }
    if (isTauriRuntime()) void runFolderImport()
    else importFolderInputRef.current?.click()
  }

  async function runOutboundMode(mode: DatabaseOutboundToolbarMode) {
    if (mode === 'export-database') {
      await runAction('export database', async () => {
        const result = await exportDatabaseLibrary((done, total, name) => {
          if (total === 0) return
          reportStatus(
            done >= total
              ? `Finishing database export…`
              : `Exporting ${done + 1}/${total}: ${name}`,
          )
        })
        if (!result.ok) {
          if (result.cancelled) {
            reportStatus('Database export cancelled.')
            return
          }
          throw new Error(result.error)
        }
        if (result.mode === 'directory') {
          reportStatus(
            `Exported ${result.projectCount} construct(s) and ${result.folderCount} folder(s) to ${result.path}`,
          )
        } else {
          reportStatus(
            `Downloaded ${result.fileName} (${result.projectCount} construct(s), ${result.folderCount} folder(s)).`,
          )
        }
      })
      return
    }
    await beginFolderSync('sync-to')
  }

  const toolbarSyncHandlersRef = useRef({
    runImportMode: (() => {}) as (mode: DatabaseImportToolbarMode) => void,
    runInboundMode: (async () => {}) as (mode: DatabaseInboundToolbarMode) => Promise<void>,
    runOutboundMode: (async () => {}) as (mode: DatabaseOutboundToolbarMode) => Promise<void>,
  })
  useLayoutEffect(() => {
    toolbarSyncHandlersRef.current = {
      runImportMode,
      runInboundMode,
      runOutboundMode,
    }
  })

  const toolbarSyncRunImportMode = useCallback(
    (mode: DatabaseImportToolbarMode) => toolbarSyncHandlersRef.current.runImportMode(mode),
    [],
  )
  const toolbarSyncRunInboundMode = useCallback(
    async (mode: DatabaseInboundToolbarMode) => toolbarSyncHandlersRef.current.runInboundMode(mode),
    [],
  )
  const toolbarSyncRunOutboundMode = useCallback(
    async (mode: DatabaseOutboundToolbarMode) => toolbarSyncHandlersRef.current.runOutboundMode(mode),
    [],
  )

  async function openProjectById(projectId: string) {
    try {
      const project = await getProject(projectId)
      if (!project) {
        reportStatus('Could not open project (missing from database).')
        return
      }
      onOpenProject(project)
    } catch (error) {
      reportStatus(`Could not open project: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function ensureLibraryMembersLoaded(libraryProjectId: string) {
    if (libraryMembersById[libraryProjectId] || libraryMembersLoadingIds.has(libraryProjectId)) return
    setLibraryMembersLoadingIds((current) => new Set(current).add(libraryProjectId))
    try {
      const project = await getProject(libraryProjectId)
      const members = (project?.record.traceFiles ?? []).map((member) => ({
        id: member.id,
        fileName: member.fileName || 'Library member',
        sequenceLength: member.sequence?.length ?? 0,
        enabled: member.enabled !== false,
        parseError: member.parseError,
      }))
      setLibraryMembersById((current) => ({ ...current, [libraryProjectId]: members }))
    } catch (error) {
      reportStatus(
        `Could not load library members: ${error instanceof Error ? error.message : String(error)}`,
      )
      setLibraryMembersById((current) => ({ ...current, [libraryProjectId]: [] }))
    } finally {
      setLibraryMembersLoadingIds((current) => {
        const next = new Set(current)
        next.delete(libraryProjectId)
        return next
      })
    }
  }

  function toggleLibraryExpanded(libraryProjectId: string) {
    setExpandedLibraryIds((current) => {
      const next = new Set(current)
      if (next.has(libraryProjectId)) next.delete(libraryProjectId)
      else {
        next.add(libraryProjectId)
        void ensureLibraryMembersLoaded(libraryProjectId)
      }
      return next
    })
  }

  async function openLibraryMemberAsConstruct(libraryProjectId: string, memberId: string) {
    try {
      const project = await getProject(libraryProjectId)
      if (!project) {
        reportStatus('Could not open library (missing from database).')
        return
      }
      const member = project.record.traceFiles?.find((entry) => entry.id === memberId)
      if (!member) {
        reportStatus('That library member is no longer available.')
        return
      }
      if (member.parseError) {
        reportStatus(`Cannot open “${member.fileName}”: ${member.parseError}`)
        return
      }
      if (!member.sequence?.trim()) {
        reportStatus(`“${member.fileName}” has no sequence.`)
        return
      }
      const record = constructRecordFromLibraryMember(member, {
        topology: project.record.topology,
        libraryName: project.name,
      })
      onOpenProject({
        id: record.id,
        name: record.name,
        updatedAt: record.updatedAt,
        sequenceLength: record.sequence.length,
        molecule: 'dna',
        topology: record.topology,
        folderId: null,
        record,
        documentOrigin: libraryMemberWorkspaceDocumentOrigin({ projectId: project.id, folderId: project.folderId, memberId, parentUpdatedAt: project.record.updatedAt }),
      })
      reportStatus(`Opened “${record.name}” from library “${project.name}”.`)
    } catch (error) {
      reportStatus(
        `Could not open library member: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  function projectCanBeAdded(project: StoredProjectSummary): boolean {
    if (libraryMemberPick) {
      if (project.id === currentRecordId || project.id === libraryMemberPick.targetRecordId) return false
      if (project.molecule === 'protein') return false
      if (project.documentRole === 'library') return false
      return project.sequenceLength > 0
    }
    if (!constructPick) return true
    if (
      !constructPick.allowCurrent
      && (project.id === currentRecordId || project.id === constructPick.targetRecordId)
    ) {
      return false
    }
    if (constructPick.molecules?.length) {
      const molecule = project.molecule === 'protein' ? 'protein' : 'dna'
      if (!constructPick.molecules.includes(molecule)) return false
    } else if (project.molecule === 'protein') {
      return false
    }
    return !constructPick.topology || project.topology === constructPick.topology
  }

  async function addConstructById(projectId: string) {
    if (!constructPick || !onAddConstruct) return
    const summary = projects.find((project) => project.id === projectId)
    if (!summary || !projectCanBeAdded(summary)) {
      reportStatus(
        constructPick.topology
          ? `Select a ${constructPick.topology} DNA construct other than the current construct.`
          : 'Select a DNA construct other than the current construct.',
      )
      return
    }
    try {
      const project = await getProject(projectId)
      if (!project) {
        reportStatus('Could not add construct (missing from database).')
        return
      }
      onAddConstruct(project)
    } catch (error) {
      reportStatus(`Could not add construct: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function addSelectedConstructs() {
    if (!constructPick?.multiple || !onAddConstructs) return
    const summaries = effectiveSelectedIds
      .map((id) => projects.find((project) => project.id === id))
      .filter((project): project is StoredProjectSummary => Boolean(project))
    if (!summaries.length || summaries.some((project) => !projectCanBeAdded(project))) {
      reportStatus(
        constructPick.topology
          ? `Select one or more ${constructPick.topology} DNA constructs other than the current construct.`
          : 'Select one or more DNA constructs other than the current construct.',
      )
      return
    }
    try {
      const loaded = await Promise.all(summaries.map((project) => getProject(project.id)))
      const available = loaded.filter((project): project is StoredProject => Boolean(project))
      if (available.length !== summaries.length) {
        reportStatus('One or more selected constructs are no longer available.')
        return
      }
      onAddConstructs(available)
    } catch (error) {
      reportStatus(`Could not add constructs: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function addSelectedLibraryMembers() {
    if (!libraryMemberPick || !onAddLibraryMembers) return
    const ids = selectedProjects.filter(projectCanBeAdded).map((project) => project.id)
    if (!ids.length) {
      reportStatus(
        libraryMemberPick.purpose === 'convert'
          ? 'Select one or more DNA constructs, then Convert.'
          : 'Select one or more DNA constructs, then Add.',
      )
      return
    }
    onAddLibraryMembers(ids)
    onStatus?.(
      libraryMemberPick.purpose === 'convert'
        ? ids.length === 1
          ? `Converting with “${selectedProjects.find((project) => project.id === ids[0])?.name ?? 'construct'}”…`
          : `Converting with ${ids.length} constructs…`
        : ids.length === 1
          ? `Added “${selectedProjects.find((project) => project.id === ids[0])?.name ?? 'construct'}” to the library.`
          : `Added ${ids.length} constructs to the library.`,
    )
  }

  const tree = useMemo(() => buildFolderTree(folders), [folders])
  const fileModeProjects = useMemo(
    () => projects.filter((project) => moleculeBelongsInDatabaseFileView(project.molecule, viewMode)),
    [projects, viewMode],
  )
  const allTags = useMemo(() => collectAllTags(fileModeProjects), [fileModeProjects])
  const allPrimerTags = useMemo(() => collectPrimerTagNames(primerTagMap), [primerTagMap])
  const fileView = viewMode === 'dna' || viewMode === 'proteins'
  const sidebarTags = viewMode === 'primers' ? allPrimerTags : fileView ? allTags : []

  const visibleBuiltIn = useMemo(() => {
    if (browse.kind !== 'builtin') return []
    return builtInPlasmids.filter((entry) => entryMatchesBuiltInGroup(entry, browse.group))
  }, [browse, builtInPlasmids])

  const visiblePrimers = useMemo(() => {
    let scoped: DatabasePrimerHit[]
    if (browse.kind === 'all') scoped = primerHits
    else if (browse.kind === 'common') {
      scoped = primerHits.filter((hit) => hit.projectId === COMMON_PRIMERS_SOURCE_ID)
    } else if (browse.kind === 'unfiled') {
      scoped = primerHits.filter((hit) => !hit.folderId && hit.projectId !== COMMON_PRIMERS_SOURCE_ID)
    } else if (browse.kind === 'folder') {
      scoped = primerHits.filter((hit) => hit.folderId === browse.folderId)
    } else if (browse.kind === 'builtin') {
      scoped = []
    } else {
      const tagKey = browse.tag.toLowerCase()
      scoped = primerHits.filter((hit) =>
        tagsForPrimerKey(primerTagMap, hit.key).some((tag) => tag.toLowerCase() === tagKey),
      )
    }
    const rows = dedupePrimerHits(scoped)
    const sign = primerSortDirection === 'asc' ? 1 : -1
    return [...rows].sort((left, right) => {
      if (primerSortColumn === 'files') {
        // More files first when descending (default); then filename A–Z.
        const byCount = left.sources.length - right.sources.length
        if (byCount !== 0) return sign * byCount
        const byFile = primerFileNamesSortKey(left).localeCompare(
          primerFileNamesSortKey(right),
          undefined,
          { sensitivity: 'base' },
        )
        return (
          byFile ||
          left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
          left.key.localeCompare(right.key)
        )
      }
      let cmp = 0
      if (primerSortColumn === 'name') {
        cmp = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      } else if (primerSortColumn === 'sequence') {
        cmp = left.sequence.localeCompare(right.sequence)
      } else if (primerSortColumn === 'length') {
        cmp = left.sequence.length - right.sequence.length
      } else if (primerSortColumn === 'tm') {
        cmp = (primerOligoTm(left.sequence) ?? -Infinity) - (primerOligoTm(right.sequence) ?? -Infinity)
      } else if (primerSortColumn === 'gc') {
        cmp = gcContent(left.sequence) - gcContent(right.sequence)
      } else if (primerSortColumn === 'tags') {
        cmp = tagsForPrimerKey(primerTagMap, left.key)
          .join(', ')
          .localeCompare(tagsForPrimerKey(primerTagMap, right.key).join(', '), undefined, {
            sensitivity: 'base',
          })
      }
      return sign * cmp || left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) || left.key.localeCompare(right.key)
    })
  }, [browse, primerHits, primerSortColumn, primerSortDirection, primerTagMap])

  const visibleProteins = useMemo(() => {
    let scoped: DatabaseProteinHit[]
    if (browse.kind === 'all') scoped = proteinHits
    else if (browse.kind === 'unfiled') {
      scoped = proteinHits.filter((hit) => !hit.folderId)
    } else if (browse.kind === 'folder') {
      scoped = proteinHits.filter((hit) => hit.folderId === browse.folderId)
    } else {
      scoped = []
    }
    const rows = dedupeProteinHits(scoped)
    const sign = proteinSortDirection === 'asc' ? 1 : -1
    return [...rows].sort((left, right) => {
      if (proteinSortColumn === 'files') {
        const byCount = left.sources.length - right.sources.length
        if (byCount !== 0) return sign * byCount
        const byFile = proteinFileNamesSortKey(left).localeCompare(
          proteinFileNamesSortKey(right),
          undefined,
          { sensitivity: 'base' },
        )
        return (
          byFile ||
          left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
          left.key.localeCompare(right.key)
        )
      }
      let cmp = 0
      if (proteinSortColumn === 'name') {
        cmp = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      } else if (proteinSortColumn === 'sequence') {
        cmp = left.sequence.localeCompare(right.sequence)
      } else if (proteinSortColumn === 'length') {
        cmp = left.sequence.length - right.sequence.length
      } else if (proteinSortColumn === 'mass') {
        cmp = peptideMassDa(left.sequence) - peptideMassDa(right.sequence)
      } else if (proteinSortColumn === 'product') {
        cmp = left.product.localeCompare(right.product, undefined, { sensitivity: 'base' })
      }
      return (
        sign * cmp ||
        left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
        left.key.localeCompare(right.key)
      )
    })
  }, [browse, proteinHits, proteinSortColumn, proteinSortDirection])

  const browsePaginationKey =
    browse.kind === 'folder'
      ? `folder:${browse.folderId}`
      : browse.kind === 'tag'
        ? `tag:${browse.tag.toLowerCase()}`
        : browse.kind === 'builtin'
          ? `builtin:${browse.group}`
          : browse.kind
  const paginationKey = [
    viewMode,
    browsePaginationKey,
    viewMode === 'primers'
      ? `${primerSortColumn}:${primerSortDirection}`
      : viewMode === 'cdses'
        ? `${proteinSortColumn}:${proteinSortDirection}`
        : `${sortColumn}:${sortDirection}`,
  ].join('|')
  const paginationTotal =
    viewMode === 'primers'
      ? visiblePrimers.length
      : viewMode === 'cdses'
        ? visibleProteins.length
        : browse.kind === 'builtin'
          ? visibleBuiltIn.length
          : projectPage.key === paginationKey ? projectPage.total : 0
  const requestedPage = pagination.key === paginationKey ? pagination.page : 0
  const {
    page: paginationPage,
    pageCount: paginationPageCount,
    start: paginationStart,
    end: paginationEnd,
  } = databasePageWindow(paginationTotal, requestedPage, DATABASE_TABLE_PAGE_SIZE)
  const visibleProjects =
    projectPage.key === paginationKey && projectPage.rows.length > 0
      ? projectPage.rows
      : NO_VISIBLE_PROJECT_PAGE
  const projectPageLoading =
    fileView && browse.kind !== 'builtin' && browse.kind !== 'common' &&
    (projectPage.key !== paginationKey || projectPage.page !== paginationPage)
  const paginatedProjects = visibleProjects
  const paginatedPrimers = visiblePrimers.slice(paginationStart, paginationEnd)
  const paginatedProteins = visibleProteins.slice(paginationStart, paginationEnd)
  const paginatedBuiltIn = visibleBuiltIn.slice(paginationStart, paginationEnd)

  useEffect(() => {
    if (!fileView || browse.kind === 'builtin' || browse.kind === 'common') return
    let cancelled = false
    const scope = browse.kind === 'folder'
      ? { kind: 'folder' as const, folderId: browse.folderId }
      : browse.kind === 'tag'
        ? { kind: 'tag' as const, tag: browse.tag }
        : browse.kind === 'unfiled'
          ? { kind: 'unfiled' as const }
          : { kind: 'all' as const }
    const folderSortKeys = sortColumn === 'folder'
      ? Object.fromEntries([
          ['', folderPathLabel(folders, null)],
          ...folders.map((folder) => [folder.id, folderPathLabel(folders, folder.id)] as const),
        ])
      : undefined

    void queryProjectSummaryPage({
      molecule: viewMode === 'proteins' ? 'protein' : 'nucleic',
      scope,
      sortBy: sortColumn,
      direction: sortDirection,
      page: requestedPage,
      pageSize: DATABASE_TABLE_PAGE_SIZE,
      folderSortKeys,
    }).then((result) => {
      if (cancelled) return
      setProjectPage((current) => ({
        key: paginationKey,
        page: result.page,
        rows: current.key === paginationKey && result.page === current.page + 1
          ? [...current.rows, ...result.rows]
          : result.rows,
        total: result.total,
      }))
      void getProjectFileBlobByteLengths(result.rows.map((row) => row.id)).then((lengths) => {
        if (!cancelled) setProjectFileByteLengths((current) => ({ ...current, ...lengths }))
      })
      if (result.page !== requestedPage) {
        setPagination({ key: paginationKey, page: result.page })
      }
    }).catch((error) => {
      if (cancelled) return
      const message = `Could not load database page: ${error instanceof Error ? error.message : String(error)}`
      setProjectPage({ key: paginationKey, page: paginationPage, rows: [], total: 0 })
      setHeaderStatus(message)
      onStatus?.(message)
    })
    return () => {
      cancelled = true
    }
  }, [browse, fileView, folders, onStatus, paginationKey, paginationPage, projects, requestedPage, sortColumn, sortDirection, viewMode])

  useEffect(() => {
    if (!fileView || browse.kind === 'builtin' || browse.kind === 'common') return
    const node = fileListRef.current
    if (!node) return
    const loadNextPage = () => {
      if (projectPageLoading || paginationPage >= paginationPageCount - 1) return
      if (node.scrollHeight - node.scrollTop - node.clientHeight > 160) return
      const containerTop = node.getBoundingClientRect().top
      const anchor = [...node.querySelectorAll<HTMLElement>('[data-db-project-id]')]
        .find((row) => row.getBoundingClientRect().bottom > containerTop)
      pendingInfiniteScrollRef.current = {
        top: node.scrollTop,
        left: node.scrollLeft,
        anchorId: anchor?.dataset.dbProjectId ?? null,
        anchorOffset: anchor ? anchor.getBoundingClientRect().top - containerTop : null,
      }
      setPagination({ key: paginationKey, page: paginationPage + 1 })
    }
    node.addEventListener('scroll', loadNextPage, { passive: true })
    loadNextPage()
    return () => node.removeEventListener('scroll', loadNextPage)
  }, [browse.kind, fileView, paginationKey, paginationPage, paginationPageCount, projectPageLoading])

  useLayoutEffect(() => {
    const node = fileListRef.current
    const pending = pendingInfiniteScrollRef.current
    if (!node || !pending || projectPageLoading) return
    pendingInfiniteScrollRef.current = null
    let frame = 0
    let cancelled = false
    const restore = () => {
      if (cancelled) return
      let nextTop = pending.top
      if (pending.anchorId && pending.anchorOffset !== null) {
        const anchor = [...node.querySelectorAll<HTMLElement>('[data-db-project-id]')]
          .find((row) => row.dataset.dbProjectId === pending.anchorId)
        if (anchor) {
          const currentOffset = anchor.getBoundingClientRect().top - node.getBoundingClientRect().top
          nextTop += currentOffset - pending.anchorOffset
        }
      }
      node.scrollTop = nextTop
      node.scrollLeft = pending.left
      frame += 1
      if (frame < 3) requestAnimationFrame(restore)
    }
    restore()
    return () => {
      cancelled = true
    }
  }, [projectPage.page, projectPageLoading])

  const goToDatabasePage = buildDatabaseManagerGoToPageCommand({
    pageCount: paginationPageCount,
    setPage: (page) => setPagination({ key: paginationKey, page }),
  })

  function resetDatabasePaging() {
    pendingInfiniteScrollRef.current = null
    setPagination({ key: '', page: 0 })
    fileListRef.current?.scrollTo({ top: 0, left: fileListRef.current.scrollLeft })
  }

  function toggleSort(column: DbSortColumn) {
    resetDatabasePaging()
    if (sortColumn === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortColumn(column)
    setSortDirection(column === 'updated' || column === 'size' || column === 'fileSize' ? 'desc' : 'asc')
  }

  function togglePrimerSort(column: PrimerSortColumn) {
    resetDatabasePaging()
    if (primerSortColumn === column) {
      setPrimerSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setPrimerSortColumn(column)
    setPrimerSortDirection(column === 'name' || column === 'sequence' ? 'asc' : 'desc')
  }

  function toggleProteinSort(column: ProteinSortColumn) {
    resetDatabasePaging()
    if (proteinSortColumn === column) {
      setProteinSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setProteinSortColumn(column)
    setProteinSortDirection(column === 'name' || column === 'sequence' || column === 'product' ? 'asc' : 'desc')
  }

  function setDatabaseViewMode(mode: DatabaseViewMode) {
    setViewMode(mode)
    resetDatabasePaging()
    writeDatabaseViewMode(mode)
    setScopedSelectedIds([])
    setSelectionAnchorId(null)
    if (mode !== 'dna' && browse.kind === 'builtin') setBrowse({ kind: 'all' })
    if (mode !== 'primers' && browse.kind === 'common') setBrowse({ kind: 'all' })
    if (browse.kind === 'tag') {
      if (mode === 'cdses') {
        setBrowse({ kind: 'all' })
      } else {
        const tags = mode === 'primers' ? allPrimerTags : allTags
        if (!tags.some((tag) => tag.toLowerCase() === browse.tag.toLowerCase())) {
          setBrowse({ kind: 'all' })
        }
      }
    }
  }

  useEffect(() => {
    if (!alignmentPick) return
    onStatus?.(
      alignmentPick.mode === 'dna'
        ? 'Select DNA constructs, then Add to alignment.'
        : 'Select constructs or proteins, then Add to alignment.',
    )
    // Only react to pick mode changes from the editor, not local view toggles.
  }, [alignmentPick, alignmentPick?.mode, alignmentPick?.targetRecordId, onStatus])

  useEffect(() => {
    if (!constructPick) return
    onStatus?.(
      constructPick.topology
        ? `Select ${constructPick.multiple ? 'one or more' : 'one'} ${constructPick.topology} DNA construct${constructPick.multiple ? 's' : ''}, then Add to cloning.`
        : `Select ${constructPick.multiple ? 'one or more' : 'one'} DNA construct${constructPick.multiple ? 's' : ''}, then Add to cloning.`,
    )
    // Only react when a cloning dialog starts a new selection request.
  }, [constructPick, constructPick?.requestId, onStatus])

  useEffect(() => {
    if (!libraryMemberPick) return
    onStatus?.('Select one or more DNA constructs, then Add.')
    // Only react when the library Members pane starts a new selection request.
  }, [libraryMemberPick, libraryMemberPick?.targetRecordId, onStatus])

  const effectiveSelectedIds = useMemo(() => {
    const visible = viewMode === 'primers'
      ? visiblePrimers.map((primer) => primer.key)
      : viewMode === 'cdses'
        ? visibleProteins.map((protein) => protein.key)
        : visibleProjects.map((project) => project.id)
    return filterDatabaseManagerSelection(selectedIds, visible, pickSelectionScope, selectionScopeKey)
  }, [pickSelectionScope, selectedIds, selectionScopeKey, viewMode, visiblePrimers, visibleProteins, visibleProjects])

  const selectedProjects = useMemo(
    () => visibleProjects.filter((project) => effectiveSelectedIds.includes(project.id)),
    [effectiveSelectedIds, visibleProjects],
  )
  const selectedPrimers = useMemo(
    () => visiblePrimers.filter((primer) => effectiveSelectedIds.includes(primer.key)),
    [effectiveSelectedIds, visiblePrimers],
  )
  const selectedProteins = useMemo(
    () => visibleProteins.filter((protein) => effectiveSelectedIds.includes(protein.key)),
    [effectiveSelectedIds, visibleProteins],
  )
  const selectedFolderId = browse.kind === 'folder' ? browse.folderId : null
  const selectedFolder = selectedFolderId
    ? folders.find((folder) => folder.id === selectedFolderId) ?? null
    : null
  const selectedTopLevelFolder = resolveTopLevelFolder(folders, selectedFolderId)
  const selectedTopLevelFolderId = selectedTopLevelFolder?.id ?? null
  const selectedFolderIsTopLevel = Boolean(
    selectedFolder && selectedTopLevelFolder?.id === selectedFolder.id,
  )
  const selectedFolderHasSyncSource = Boolean(
    selectedTopLevelFolder &&
      folderSyncMapping?.folderId === selectedTopLevelFolder.id &&
      folderSyncMapping.externalPath,
  )
  const visibleRowIds = useMemo(
    () =>
      viewMode === 'primers'
        ? visiblePrimers.map((primer) => primer.key)
        : viewMode === 'cdses'
          ? visibleProteins.map((protein) => protein.key)
          : visibleProjects.map((project) => project.id),
    [viewMode, visiblePrimers, visibleProteins, visibleProjects],
  )
  const allVisibleSelected =
    visibleRowIds.length > 0 && visibleRowIds.every((id) => effectiveSelectedIds.includes(id))
  const someVisibleSelected = effectiveSelectedIds.some((id) => visibleRowIds.includes(id))

  useEffect(() => {
    writeDatabaseExpandedFolderIds(expandedFolderIds)
  }, [expandedFolderIds])

  useEffect(() => {
    if (hybridWindow) return
    writeDatabaseModalSize(size)
  }, [hybridWindow, size])

  useEffect(() => {
    writeDatabaseColumnWidths(columnWidths)
  }, [columnWidths])

  useEffect(() => {
    writeDatabasePrimerColumnWidths(primerColumnWidths)
  }, [primerColumnWidths])

  useEffect(() => {
    writeDatabaseProteinColumnWidths(proteinColumnWidths)
  }, [proteinColumnWidths])

  useEffect(() => {
    writeDatabaseFileColumnOrder(fileColumnOrder)
  }, [fileColumnOrder])

  useEffect(() => {
    writeDatabasePrimerColumnOrder(primerColumnOrder)
  }, [primerColumnOrder])

  useEffect(() => {
    writeDatabaseProteinColumnOrder(proteinColumnOrder)
  }, [proteinColumnOrder])

  useEffect(() => {
    const reloadUiPrefs = () => {
      setColumnWidths(readDatabaseColumnWidths(DEFAULT_DB_COLUMN_WIDTHS, DB_COLUMN_MIN_WIDTH))
      setPrimerColumnWidths(
        readDatabasePrimerColumnWidths(DEFAULT_PRIMER_COLUMN_WIDTHS, PRIMER_COLUMN_MIN_WIDTH),
      )
      setProteinColumnWidths(
        readDatabaseProteinColumnWidths(DEFAULT_PROTEIN_COLUMN_WIDTHS, PROTEIN_COLUMN_MIN_WIDTH),
      )
      setFileColumnOrder(readDatabaseFileColumnOrder())
      setPrimerColumnOrder(readDatabasePrimerColumnOrder())
      setProteinColumnOrder(readDatabaseProteinColumnOrder())
    }
    window.addEventListener(DATABASE_UI_PREFS_CHANGED_EVENT, reloadUiPrefs)
    return () => window.removeEventListener(DATABASE_UI_PREFS_CHANGED_EVENT, reloadUiPrefs)
  }, [])

  useEffect(() => {
    let disposed = false
    const unsubscribe = subscribeLibraryChanged(() => {
      if (disposed) return
      void Promise.all([Promise.resolve(onRefresh()), refreshFolders()])
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [onRefresh])

  useEffect(() => {
    writeDatabaseSidebarWidth(sidebarWidth)
  }, [sidebarWidth])

  useEffect(() => {
    writeDatabaseToolbarModes(toolbarModes)
  }, [toolbarModes])

  useEffect(() => {
    if (!hybridWindow) return
    const itemCount =
      viewMode === 'primers'
        ? visiblePrimers.length
        : viewMode === 'cdses'
          ? visibleProteins.length
          : browse.kind === 'builtin'
            ? visibleBuiltIn.length
            : paginationTotal
    const selectedCount =
      viewMode === 'primers'
        ? selectedPrimers.length
        : viewMode === 'cdses'
          ? selectedProteins.length
          : selectedProjects.length
    void syncNativeWindowTitle(
      databaseWindowTitle(
        browse,
        (folderId: string) => folderPathLabel(folders, folderId),
        itemCount,
        selectedCount,
        viewMode,
        headerStatus,
      ),
    )
  }, [
    browse,
    folders,
    headerStatus,
    hybridWindow,
    selectedPrimers.length,
    selectedProteins.length,
    selectedProjects.length,
    viewMode,
    visiblePrimers.length,
    visibleProteins.length,
    visibleBuiltIn.length,
    paginationTotal,
  ])

  const primerScanDoneRef = useRef(false)
  const proteinScanDoneRef = useRef(false)
  const primerScanRequestRef = useRef<{
    key: string
    promise: ReturnType<typeof scanDatabasePrimerHits>
  } | null>(null)
  const proteinScanRequestRef = useRef<{
    key: string
    promise: ReturnType<typeof scanDatabaseProteinHits>
  } | null>(null)

  const projectScanKey = useMemo(
    () =>
      projects
        .map((project) => `${project.id}:${project.updatedAt}`)
        .sort()
        .join('|'),
    [projects],
  )

  useEffect(() => {
    if (viewMode !== 'primers') return
    let cancelled = false
    if (!primerScanDoneRef.current) setPrimerScanBusy(true)
    const existing = primerScanRequestRef.current
    const request = existing?.key === projectScanKey
      ? existing.promise
      : scanDatabasePrimerHits()
    primerScanRequestRef.current = { key: projectScanKey, promise: request }
    void Promise.all([request, listCommonPrimers()])
      .then(([hits, common]) => {
        if (cancelled) return
        primerScanDoneRef.current = true
        setPrimerHits([...hits, ...commonPrimersToHits(common)])
      })
      .catch((error) => {
        if (cancelled) return
        reportStatus(error instanceof Error ? error.message : 'Could not scan primers.')
      })
      .finally(() => {
        if (primerScanRequestRef.current?.promise === request) {
          primerScanRequestRef.current = null
        }
        if (!cancelled) setPrimerScanBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectScanKey, reportStatus, viewMode])

  useEffect(() => {
    if (viewMode !== 'cdses') return
    let cancelled = false
    if (!proteinScanDoneRef.current) setProteinScanBusy(true)
    const existing = proteinScanRequestRef.current
    const request = existing?.key === projectScanKey
      ? existing.promise
      : scanDatabaseProteinHits()
    proteinScanRequestRef.current = { key: projectScanKey, promise: request }
    void request
      .then((hits) => {
        if (cancelled) return
        proteinScanDoneRef.current = true
        setProteinHits(hits)
      })
      .catch((error) => {
        if (cancelled) return
        reportStatus(error instanceof Error ? error.message : 'Could not scan proteins.')
      })
      .finally(() => {
        if (proteinScanRequestRef.current?.promise === request) {
          proteinScanRequestRef.current = null
        }
        if (!cancelled) setProteinScanBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectScanKey, reportStatus, viewMode])

  useEffect(() => {
    let cancelled = false
    void loadBuiltInPlasmidIndex()
      .then((entries) => {
        if (!cancelled) setBuiltInPlasmids(entries)
      })
      .catch((error) => {
        if (!cancelled) {
          reportStatus(error instanceof Error ? error.message : 'Could not load built-in plasmids.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [onStatus, reportStatus])

  async function refreshPrimerLibrary() {
    const [hits, common, tags] = await Promise.all([
      scanDatabasePrimerHits(),
      listCommonPrimers(),
      loadPrimerTagMap(),
    ])
    setPrimerHits([...hits, ...commonPrimersToHits(common)])
    setPrimerTagMap(tags)
  }

  async function refreshPrimerTags() {
    setPrimerTagMap(await loadPrimerTagMap())
  }

  async function openBuiltInEntry(entry: BuiltInPlasmidEntry) {
    const record = await loadBuiltInPlasmidRecord(entry)
    onOpenProject({
      id: record.id,
      name: record.name,
      updatedAt: record.updatedAt,
      sequenceLength: record.sequence.length,
      molecule: record.molecule,
      topology: record.topology,
      folderId: null,
      tags: [],
      record,
    })
  }

  async function openDatabaseProtein(protein: DatabaseProteinRow) {
    const translationSources = (await Promise.all(protein.sources.map(async (source) => {
      const project = await getProject(source.projectId)
      if (!project || project.record.molecule === 'protein') return null
      const feature = project.record.features.find((candidate) => candidate.id === source.featureId)
        ?? project.record.features.find((candidate) => (
          peptideForTranslatedCds(candidate, project.record.sequence) === protein.sequence
        ))
      return feature
        ? proteinTranslationSourceFromRecord(project.record, feature, source.folderId)
        : null
    }))).filter((source): source is NonNullable<typeof source> => Boolean(source))
    const record = createSequenceRecordFromDatabaseProtein({ ...protein, translationSources })
    window.getSelection()?.removeAllRanges()
    onOpenProject({
      id: record.id,
      name: record.name,
      updatedAt: record.updatedAt,
      sequenceLength: record.sequence.length,
      molecule: record.molecule,
      topology: record.topology,
      folderId: null,
      tags: [],
      record,
    })
    reportStatus(`Opened ${record.name} as a protein (${record.sequence.length} aa).`)
  }

  async function openSelectedHistoryBatch() {
    if (busy || selectedProjects.length === 0) return
    setBusy(true)
    setHeaderStatus(`Loading history for ${selectedProjects.length} selected file${selectedProjects.length === 1 ? '' : 's'}…`)
    try {
      const loaded = (await Promise.all(selectedProjects.map((summary) => getProject(summary.id))))
        .filter((project): project is StoredProject => Boolean(project))
      if (!loaded.length) throw new Error('The selected database files could not be loaded.')
      setHistoryBatch({ projects: loaded, result: null })
      if (loaded.length !== selectedProjects.length) {
        reportStatus(`Loaded ${loaded.length} of ${selectedProjects.length} selected files for history preview.`)
      } else {
        setHeaderStatus(null)
      }
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : 'Could not load selected history.')
    } finally {
      setBusy(false)
    }
  }

  async function applySelectedHistoryBatch(
    policy: HistoryRetentionPolicy,
    options: DatabaseHistoryBatchApplyOptions,
  ) {
    if (!historyBatch || busy) return
    const preview = previewHistoryTrimBatch(
      historyBatch.projects.map((project) => project.record),
      policy,
    )
    const changed = historyBatch.projects.filter((_, index) => preview.records[index]?.changed)
    if (!changed.length) return

    setBusy(true)
    const result: DatabaseHistoryBatchResult = { trimmedNames: [], failures: [] }
    try {
      const recovery = await createHistoryTrimRecoveryBatch(changed, options.recoveryDays)
      if (recovery) setLatestHistoryRecovery(recovery)
      for (let index = 0; index < changed.length; index += 1) {
        const project = changed[index]!
        setHeaderStatus(`Trimming history ${index + 1}/${changed.length}: ${project.name}`)
        try {
          await saveProject(applyHistoryRetention(project.record, policy), { fileBytes: null })
          result.trimmedNames.push(project.name)
        } catch (error) {
          result.failures.push({
            name: project.name,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      setHistoryBatch((current) => current ? { ...current, result } : current)
      try {
        await onRefresh()
      } catch (error) {
        result.failures.push({
          name: 'Database view refresh',
          error: error instanceof Error ? error.message : String(error),
        })
        setHistoryBatch((current) => current ? { ...current, result: { ...result } } : current)
      }
      reportStatus(
        result.failures.length
          ? `Trimmed ${result.trimmedNames.length} file${result.trimmedNames.length === 1 ? '' : 's'}; ${result.failures.length} failed.`
          : `Trimmed history in ${result.trimmedNames.length} database file${result.trimmedNames.length === 1 ? '' : 's'}.`,
      )
    } finally {
      setBusy(false)
    }
  }

  async function restoreLatestHistoryTrim() {
    const recovery = latestHistoryRecovery
    if (!recovery || busy) return
    const names = recovery.projectNames.slice(0, 3).join(', ')
    const extra = recovery.projectCount > 3 ? ` and ${recovery.projectCount - 3} more` : ''
    if (!window.confirm(`Restore history trimmed from ${names}${extra}? Current saved copies of those files will be replaced.`)) return
    setBusy(true)
    try {
      setHeaderStatus(`Restoring history in ${recovery.projectCount} file${recovery.projectCount === 1 ? '' : 's'}…`)
      const result = await restoreHistoryTrimRecoveryBatch(recovery.batchId)
      await onRefresh()
      const recoveries = await listHistoryTrimRecoveryBatches()
      setLatestHistoryRecovery(recoveries[0] ?? null)
      reportStatus(
        result.failures.length
          ? `Restored ${result.restoredNames.length} file${result.restoredNames.length === 1 ? '' : 's'}; ${result.failures.length} failed.`
          : `Restored pre-trim history in ${result.restoredNames.length} database file${result.restoredNames.length === 1 ? '' : 's'}.`,
      )
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : 'Could not restore trimmed history.')
    } finally {
      setBusy(false)
    }
  }

  async function discardLatestHistoryTrimRecovery() {
    const recovery = latestHistoryRecovery
    if (!recovery || busy) return
    if (!window.confirm(`Permanently delete the recovery copy for ${recovery.projectCount} trimmed file${recovery.projectCount === 1 ? '' : 's'}?`)) return
    setBusy(true)
    try {
      await deleteHistoryTrimRecoveryBatch(recovery.batchId)
      const recoveries = await listHistoryTrimRecoveryBatches()
      setLatestHistoryRecovery(recoveries[0] ?? null)
      reportStatus('Deleted the latest history-trim recovery copy.')
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : 'Could not delete the recovery copy.')
    } finally {
      setBusy(false)
    }
  }

  async function addSelectedToAlignment() {
    if (!alignmentPick || !onAddToAlignment) return
    await runAction('add to alignment', async () => {
      const constructs: import('./desktop/hybridWindows').DatabaseAlignmentConstruct[] = []
      if (fileView) {
        for (const summary of selectedProjects) {
          const project = await getProject(summary.id)
          if (!project?.record.sequence) continue
          const molecule = project.record.molecule
          if (alignmentPick.mode === 'dna' && molecule === 'protein') continue
          constructs.push({
            id: project.record.id,
            name: project.record.name,
            sequence: project.record.sequence,
            molecule,
          })
        }
      } else if (viewMode === 'cdses' && alignmentPick.mode === 'protein') {
        for (const protein of selectedProteins) {
          if (!protein.sequence) continue
          constructs.push({
            id: protein.key,
            name: protein.name,
            sequence: protein.sequence,
            molecule: 'protein',
          })
        }
      }
      if (!constructs.length) {
        reportStatus(
          alignmentPick.mode === 'dna'
            ? 'Select one or more DNA constructs to add to alignment.'
            : 'Select DNA/protein constructs or CDS proteins to add to alignment.',
        )
        return
      }
      onAddToAlignment(constructs)
      reportStatus(
        constructs.length === 1
          ? `Added “${constructs[0]!.name}” to alignment.`
          : `Added ${constructs.length} sequences to alignment.`,
      )
    })
  }

  function toggleFolderExpanded(folderId: string) {
    setExpandedFolderIds((current) => {
      const next = new Set(current)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  function toggleBuiltinExpanded(groupId: BuiltInPlasmidGroupId) {
    setExpandedBuiltinIds((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const effectiveColumnWidths = useMemo(
    () =>
      effectiveFlexibleColumnWidths(
        columnWidths,
        tableViewportWidth,
        databaseFileFlexColumnId,
        databaseFileColumnSizing,
      ),
    [columnWidths, tableViewportWidth],
  )
  const effectivePrimerWidths = useMemo(
    () =>
      effectiveFlexibleColumnWidths(
        primerColumnWidths,
        tableViewportWidth,
        databasePrimerFlexColumnId,
        databasePrimerColumnSizing,
      ),
    [primerColumnWidths, tableViewportWidth],
  )
  const effectiveProteinWidths = useMemo(
    () =>
      effectiveFlexibleColumnWidths(
        proteinColumnWidths,
        tableViewportWidth,
        databaseProteinFlexColumnId,
        databaseProteinColumnSizing,
      ),
    [proteinColumnWidths, tableViewportWidth],
  )

  const tableWidth = DB_CHECK_COL_WIDTH + fileColumnOrder.reduce((sum, id) => sum + effectiveColumnWidths[id], 0)
  const primerTableWidth =
    DB_CHECK_COL_WIDTH + primerColumnOrder.reduce((sum, id) => sum + effectivePrimerWidths[id], 0)
  const proteinTableWidth =
    DB_CHECK_COL_WIDTH + proteinColumnOrder.reduce((sum, id) => sum + effectiveProteinWidths[id], 0)
  async function refreshFolders() {
    setFolders(await listFolders())
  }

  async function refreshFolderSyncContext(
    rootFolderId: string | null = selectedTopLevelFolder?.id ?? null,
  ) {
    if (!rootFolderId) {
      setFolderSyncMapping(null)
      setFolderSyncTombstones([])
      setFolderSyncContextLoading(false)
      return
    }
    setFolderSyncContextLoading(true)
    try {
      const resolved = await resolveFolderSyncMapping(rootFolderId)
      if (!resolved || resolved.rootFolder.id !== rootFolderId) {
        setFolderSyncMapping(null)
        setFolderSyncTombstones([])
        return
      }
      const tombstones = await listProjectFileTombstones(rootFolderId)
      setFolderSyncMapping(resolved.mapping)
      setFolderSyncTombstones(
        [...tombstones].sort((left, right) =>
          left.relativePath.localeCompare(right.relativePath, undefined, { sensitivity: 'base' }),
        ),
      )
    } finally {
      setFolderSyncContextLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void loadDatabaseManagerStartupData().then(({ folders: nextFolders, primerTags, recoveries }) => {
      if (cancelled) return
      setFolders(nextFolders)
      setPrimerTagMap(primerTags)
      setLatestHistoryRecovery(recoveries[0] ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (!selectedTopLevelFolderId) {
        if (!cancelled) {
          setFolderSyncMapping(null)
          setFolderSyncTombstones([])
          setFolderSyncContextLoading(false)
        }
        return
      }
      if (!cancelled) setFolderSyncContextLoading(true)
      try {
        const resolved = await resolveFolderSyncMapping(selectedTopLevelFolderId)
        const tombstones = resolved
          ? await listProjectFileTombstones(selectedTopLevelFolderId)
          : []
        if (cancelled) return
        setFolderSyncMapping(resolved?.mapping ?? null)
        setFolderSyncTombstones(
          [...tombstones].sort((left, right) =>
            left.relativePath.localeCompare(right.relativePath, undefined, {
              sensitivity: 'base',
            }),
          ),
        )
      } finally {
        if (!cancelled) setFolderSyncContextLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedTopLevelFolderId])

  const hasVisiblePrimers = visiblePrimers.length > 0
  const hasVisibleProteins = visibleProteins.length > 0
  const hasVisibleProjects = visibleProjects.length > 0

  useEffect(() => {
    const node = fileListRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const update = () => {
      const style = window.getComputedStyle(node)
      const padX = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
      setTableViewportWidth(Math.max(0, Math.floor(node.clientWidth - padX)))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [viewMode, hasVisiblePrimers, hasVisibleProteins, hasVisibleProjects])

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startW: size.width,
      startH: size.height,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onResizeMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = resizeRef.current
    if (!drag) return
    const nextWidth = Math.max(MIN_WIDTH, Math.min(window.innerWidth - 24, drag.startW + (event.clientX - drag.startX)))
    const nextHeight = Math.max(MIN_HEIGHT, Math.min(window.innerHeight - 24, drag.startH + (event.clientY - drag.startY)))
    setSize({ width: nextWidth, height: nextHeight })
  }

  function endResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return
    resizeRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }

  function beginSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (isMobileShell) return
    event.preventDefault()
    event.stopPropagation()
    sidebarResizeRef.current = { startX: event.clientX, startW: sidebarWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onSidebarResizeMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = sidebarResizeRef.current
    if (!drag) return
    const maxForDialog = Math.max(MIN_SIDEBAR_WIDTH, size.width - 360)
    const next = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, maxForDialog, drag.startW + (event.clientX - drag.startX)),
    )
    setSidebarWidth(next)
  }

  function endSidebarResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (!sidebarResizeRef.current) return
    sidebarResizeRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }

  async function runAction(label: string, action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setHeaderStatus('Working...')
    try {
      await action()
      await refreshFolders()
      await onRefresh()
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : `Could not ${label}.`)
    } finally {
      setBusy(false)
    }
  }

  async function deleteProjectsWithConfirmation(selected: StoredProjectSummary[]) {
    if (busy || selected.length === 0) return
    const count = selected.length
    const prompt =
      count === 1
        ? `Delete saved project “${selected[0]!.name}”?`
        : `Delete ${count} selected constructs? This cannot be undone.`
    if (!window.confirm(prompt)) return

    await runAction('delete selected constructs', async () => {
      await onDeleteProjects(selected.map((project) => project.id))
      setScopedSelectedIds([])
      setSelectionAnchorId(null)
      reportStatus(`Deleted ${count} construct${count === 1 ? '' : 's'} from the database.`)
    })
  }

  function resizeColumn(columnId: DbColumnId, nextWidth: number) {
    if (columnId === 'actions') return
    setColumnWidths((current) => {
      const effective = effectiveFlexibleColumnWidths(
        current,
        tableViewportWidth,
        databaseFileFlexColumnId,
        databaseFileColumnSizing,
      )
      const index = fileColumnOrder.indexOf(columnId)
      const neighborId = fileColumnOrder[index + 1]

      if (!neighborId) {
        const delta = Math.round(nextWidth) - effective[columnId]
        if (delta === 0) return current
        const flexWidth = effective[databaseFileFlexColumnId]
        const applied = Math.max(
          DB_COLUMN_MIN_WIDTH[columnId] - effective[columnId],
          Math.min(flexWidth - DB_COLUMN_MIN_WIDTH.name, delta),
        )
        if (applied === 0) return current
        return {
          ...current,
          [columnId]: effective[columnId] + applied,
          [databaseFileFlexColumnId]: flexWidth - applied,
        }
      }

      const delta = Math.round(nextWidth) - effective[columnId]
      if (delta === 0) return current

      const maxDelta = effective[neighborId] - DB_COLUMN_MIN_WIDTH[neighborId]
      const minDelta = DB_COLUMN_MIN_WIDTH[columnId] - effective[columnId]
      const applied = Math.max(minDelta, Math.min(maxDelta, delta))
      if (applied === 0) return current

      const nextLeft = effective[columnId] + applied
      const nextRight = effective[neighborId] - applied

      return {
        ...current,
        [columnId]: nextLeft,
        [neighborId]: nextRight,
      }
    })
  }

  function resizePrimerColumn(columnId: PrimerColumnId, nextWidth: number) {
    setPrimerColumnWidths((current) => {
      const effective = effectiveFlexibleColumnWidths(
        current,
        tableViewportWidth,
        databasePrimerFlexColumnId,
        databasePrimerColumnSizing,
      )
      const index = primerColumnOrder.indexOf(columnId)
      const neighborId = primerColumnOrder[index + 1]

      if (!neighborId) {
        const clamped = Math.max(PRIMER_COLUMN_MIN_WIDTH[columnId], Math.round(nextWidth))
        return current[columnId] === clamped ? current : { ...current, [columnId]: clamped }
      }

      const delta = Math.round(nextWidth) - effective[columnId]
      if (delta === 0) return current

      const maxDelta = effective[neighborId] - PRIMER_COLUMN_MIN_WIDTH[neighborId]
      const minDelta = PRIMER_COLUMN_MIN_WIDTH[columnId] - effective[columnId]
      const applied = Math.max(minDelta, Math.min(maxDelta, delta))
      if (applied === 0) return current

      const nextLeft = effective[columnId] + applied
      const nextRight = effective[neighborId] - applied

      return {
        ...current,
        [columnId]: nextLeft,
        [neighborId]: nextRight,
      }
    })
  }

  function endColumnReorderDrag() {
    setDragColumnId(null)
    setDropTargetId(null)
  }

  function reorderFileColumn(toId: DbColumnId) {
    if (!dragColumnId) return
    const fromId = dragColumnId as DbColumnId
    setFileColumnOrder((current) => moveColumnInOrder(current, fromId, toId))
    endColumnReorderDrag()
  }

  function reorderPrimerColumn(toId: PrimerColumnId) {
    if (!dragColumnId) return
    const fromId = dragColumnId as PrimerColumnId
    setPrimerColumnOrder((current) => moveColumnInOrder(current, fromId, toId))
    endColumnReorderDrag()
  }

  function resizeProteinColumn(columnId: ProteinColumnId, nextWidth: number) {
    setProteinColumnWidths((current) => {
      const effective = effectiveFlexibleColumnWidths(
        current,
        tableViewportWidth,
        databaseProteinFlexColumnId,
        databaseProteinColumnSizing,
      )
      const index = proteinColumnOrder.indexOf(columnId)
      const neighborId = proteinColumnOrder[index + 1]

      if (!neighborId) {
        const clamped = Math.max(PROTEIN_COLUMN_MIN_WIDTH[columnId], Math.round(nextWidth))
        return current[columnId] === clamped ? current : { ...current, [columnId]: clamped }
      }

      const delta = Math.round(nextWidth) - effective[columnId]
      if (delta === 0) return current

      const maxDelta = effective[neighborId] - PROTEIN_COLUMN_MIN_WIDTH[neighborId]
      const minDelta = PROTEIN_COLUMN_MIN_WIDTH[columnId] - effective[columnId]
      const applied = Math.max(minDelta, Math.min(maxDelta, delta))
      if (applied === 0) return current

      const nextLeft = effective[columnId] + applied
      const nextRight = effective[neighborId] - applied

      return {
        ...current,
        [columnId]: nextLeft,
        [neighborId]: nextRight,
      }
    })
  }

  function reorderProteinColumn(toId: ProteinColumnId) {
    if (!dragColumnId) return
    const fromId = dragColumnId as ProteinColumnId
    setProteinColumnOrder((current) => moveColumnInOrder(current, fromId, toId))
    endColumnReorderDrag()
  }

  function parentForNewFolder(): string | null {
    return browse.kind === 'folder' ? browse.folderId : null
  }

  function dropFolderId(): string | null {
    return browse.kind === 'folder' ? browse.folderId : null
  }

  function selectVisibleRow(rowId: string, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
    const plan = planTableRangeSelection({
      rowId,
      anchorId: selectionScopeKey === pickSelectionScope ? selectionAnchorId : null,
      visibleRowIds,
      event,
    })
    if (plan.kind === 'range') {
      setScopedSelectedIds(plan.selectedIds)
      return
    }
    if (plan.kind === 'toggle') {
      setScopedSelectedIds((current) => applyToggleToSelection(current, rowId))
      setSelectionAnchorId(rowId)
      return
    }
    if (plan.kind === 'single') {
      setScopedSelectedIds(plan.selectedIds)
      setSelectionAnchorId(plan.anchorId)
    }
  }

  function selectProject(projectId: string, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
    if (constructPick && !constructPick.multiple) {
      const plan = planConstructSinglePickSelection(projectId)
      if (plan.kind === 'single') {
        setScopedSelectedIds(plan.selectedIds)
        setSelectionAnchorId(plan.anchorId)
      }
      return
    }
    selectVisibleRow(projectId, event)
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setScopedSelectedIds([])
      setSelectionAnchorId(null)
      return
    }
    setScopedSelectedIds(visibleRowIds)
    setSelectionAnchorId(visibleRowIds[0] ?? null)
  }

  async function importDroppedFiles(fileList: FileList | File[]) {
    const files = [...fileList]
    if (!files.length) return
    let importedIds: string[] = []
    await runAction('import files', async () => {
      const { saved, failed } = await importFilesIntoLibrary(files, dropFolderId())
      importedIds = saved.map((entry) => entry.id)
      if (saved.length && failed.length === 0) {
        reportStatus(
          saved.length === 1
            ? `Imported “${saved[0]!.name}” into the database.`
            : `Imported ${saved.length} files into the database.`,
        )
      } else if (saved.length && failed.length) {
        reportStatus(`Imported ${saved.length}, failed ${failed.length} (${failed[0]!.fileName}: ${failed[0]!.error}).`)
      } else if (failed.length) {
        reportStatus(
          failed.length === 1
            ? `Could not import “${failed[0]!.fileName}”: ${failed[0]!.error}.`
            : `Could not import ${failed.length} files.`,
        )
      }
    })
    if (importedIds.length) {
      setScopedSelectedIds(importedIds)
      setSelectionAnchorId(importedIds[0] ?? null)
    }
  }

  const importDroppedFilesRef = useRef(importDroppedFiles)
  importDroppedFilesRef.current = importDroppedFiles

  // Tauri webviews swallow HTML5 OS file drops; use the native drag-drop API instead.
  useEffect(() => {
    if (!isTauriRuntime()) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void subscribeDesktopFileDrops({
      onHoverChange: (active) => {
        if (!cancelled) {
          dragDepthRef.current = active ? 1 : 0
          setDragOver(active)
        }
      },
      onFiles: async (opened) => {
        const files = opened.map((file) => bytesToFile(file.name, file.bytes))
        if (files.length) await importDroppedFilesRef.current(files)
      },
    }).then((stop) => {
      if (cancelled) {
        stop()
        return
      }
      unlisten = stop
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  function onDragEnter(event: ReactDragEvent) {
    if (!fileView || browse.kind === 'builtin') return
    if (isTauriRuntime() || ![...event.dataTransfer.types].includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current += 1
    setDragOver(true)
  }

  function onDragOver(event: ReactDragEvent) {
    if (!fileView || browse.kind === 'builtin') return
    if (isTauriRuntime() || ![...event.dataTransfer.types].includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave(event: ReactDragEvent) {
    if (isTauriRuntime() || ![...event.dataTransfer.types].includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragOver(false)
  }

  function onDrop(event: ReactDragEvent) {
    if (!fileView || browse.kind === 'builtin') return
    if (isTauriRuntime()) return
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = 0
    setDragOver(false)
    const files = event.dataTransfer.files
    if (files?.length) void importDroppedFiles(files)
  }

  async function chooseSourceFolder() {
    if (!selectedFolder || !selectedFolderIsTopLevel) {
      reportStatus('Only a selected top-level database folder can own a source mapping.')
      return
    }
    const selectedPath = await pickDesktopDirectory(
      folderSyncMapping ? 'Change source folder' : 'Set source folder',
    )
    if (!selectedPath) {
      reportStatus('Source folder selection cancelled.')
      return
    }
    await runAction('set source folder', async () => {
      const mapping = await setTopLevelFolderSyncMapping(selectedFolder.id, selectedPath, {
        lastSyncedAt: null,
      })
      setFolderSyncMapping(mapping)
      setFolderSyncTombstones(await listProjectFileTombstones(selectedFolder.id))
      reportStatus(`Source folder set to ${mapping.externalPath}. No files were synced yet.`)
    })
  }

  async function restoreIgnoredFile(tombstone: StoredProjectFileTombstone) {
    await runDatabaseManagerRestoreIgnoredFileAfterConfirm(tombstone, {
      confirm: (message) => window.confirm(message),
      runAction,
      deleteTombstone: deleteProjectFileTombstone,
      removeTombstoneFromState: (tombstoneId) =>
        setFolderSyncTombstones((current) => current.filter((item) => item.id !== tombstoneId)),
      reportStatus,
    })
  }

  const constructPickContext: DatabaseManagerConstructPickContext | null = constructPick
    ? {
        multiple: constructPick.multiple,
        topology: constructPick.topology,
        confirmLabel: constructPick.confirmLabel,
        cancelLabel: constructPick.cancelLabel,
        title: constructPick.title,
        molecules: constructPick.molecules,
      }
    : null
  const applyBrowseNavigation = (nextBrowse: DatabaseBrowseMode) => {
    const effect = databaseManagerBrowseNavigationEffect(nextBrowse)
    if (nextBrowse.kind === 'folder') {
      setExpandedFolderIds((current) => addFolderAncestors(current, folders, nextBrowse.folderId))
    }
    setBrowse(effect.browse)
    resetDatabasePaging()
    if (effect.clearSelection) setScopedSelectedIds([])
  }

  const workflowHeaderStatus = databaseManagerWorkflowHeaderStatus(alignmentPick, constructPick, libraryMemberPick)
  const effectiveHeaderStatus = workflowHeaderStatus ?? headerStatus

  const headerPresentation = buildAppDatabaseManagerHeaderPresentationSlice({
    constructPick: constructPickContext,
    libraryMemberPick: libraryMemberPick ?? null,
    browse,
    resolveFolderPathLabel: (folderId: string) => folderPathLabel(folders, folderId),
    viewMode,
    itemCount: databaseManagerHeaderItemCount({
      viewMode,
      browse,
      visiblePrimerCount: visiblePrimers.length,
      visibleProteinCount: visibleProteins.length,
      visibleBuiltInCount: visibleBuiltIn.length,
      paginationTotal,
    }),
    selectedCount: databaseManagerHeaderSelectedCount({
      viewMode,
      selectedPrimerCount: selectedPrimers.length,
      selectedProteinCount: selectedProteins.length,
      selectedProjectCount: selectedProjects.length,
    }),
    busy,
    headerStatus: effectiveHeaderStatus,
  })

  const toolbarPresentationModel = buildAppDatabaseManagerToolbarPresentationModel({
    intent: alignmentPick || constructPick || libraryMemberPick ? 'pick' : 'manage',
    libraryMemberPick: libraryMemberPick ?? null,
    onAddLibraryMembersHandler: Boolean(onAddLibraryMembers),
    constructPick: constructPickContext,
    onAddConstructHandlers: Boolean(onAddConstruct || onAddConstructs),
    onCancelConstructPickHandler: Boolean(onCancelConstructPick),
    selectedConstructs: selectedProjects.map((project) => ({
      id: project.id,
      name: project.name,
      eligible: projectCanBeAdded(project),
    })),
    viewMode,
    busy,
    fileView,
    browse,
    isTauriRuntime: isTauriRuntime(),
    folderDirectoryImportAvailable,
    selectedFolderHasSyncSource,
    toolbarModes,
    selectedFolderIsTopLevel,
    hasFolderSyncMapping: Boolean(folderSyncMapping),
    latestHistoryRecoveryProjectCount: latestHistoryRecovery?.projectCount ?? 0,
    alignmentPick: alignmentPick ?? null,
    onAddToAlignmentHandler: Boolean(onAddToAlignment),
    selectedPrimers: selectedPrimers.map((primer) => ({ isCommon: primerRowIsCommon(primer) })),
    currentRecordId,
    selectedProteinCount: selectedProteins.length,
  })

  const selectedProjectIds = selectedProjects.map((project) => project.id)
  const browseFolder =
    browse.kind === 'folder' ? folders.find((item) => item.id === browse.folderId) : null

  const textPromptPort = {
    open: (request: import('./application/databaseManager/ports/databaseManagerCommandPorts').DatabaseManagerTextPromptRequest) =>
      setTextPrompt(request),
    close: () => setTextPrompt(null),
  }
  const actionPort = { run: runAction }
  const statusPort = { report: reportStatus }
  const selectionPort = { setSelectedIds: setScopedSelectedIds, setSelectionAnchorId }

  const toolbarPortInput = {
    textPrompt: textPromptPort,
    action: actionPort,
    status: statusPort,
    selection: selectionPort,
    unfiledFolderId: UNFILED_FOLDER_ID,
    pick: {
      addLibraryMembers: () => addSelectedLibraryMembers(),
      addSelectedConstructs: () => addSelectedConstructs(),
      addConstructById: (projectId: string) => addConstructById(projectId),
      onCancelConstructPick,
    },
    viewMode: { setViewMode: setDatabaseViewMode },
    sync: {
      setImportMode,
      runImportMode: toolbarSyncRunImportMode,
      setInboundMode,
      runInboundMode: toolbarSyncRunInboundMode,
      setOutboundMode,
      runOutboundMode: toolbarSyncRunOutboundMode,
    },
    folder: {
      chooseSourceFolder,
      renameFolder,
      deleteFolder,
      setBrowseAll: () => setBrowse({ kind: 'all' }),
      openMoveFolderPicker: (folderId: string, parentId: string) => {
        setPicker({ kind: 'move-folder', folderId })
        setPickerTarget(parentId)
      },
      confirmDeleteFolder: (folderName: string) =>
        window.confirm(
          `Delete folder “${folderName}”? Subfolders move up; files move to the parent (or Unfiled).`,
        ),
    },
    history: { restore: restoreLatestHistoryTrim, discard: discardLatestHistoryTrimRecovery },
    projectRows: selectedProjects.map((project) => ({
      id: project.id,
      folderId: project.folderId ?? null,
      name: project.name,
    })),
    file: {
      addToAlignment: addSelectedToAlignment,
      exportProjects: exportSelectedProjects,
      renameProjectFile: renameProjectFileName,
      openMoveProjectsPicker: (projectIds, targetFolderId) => {
        setPicker({ kind: 'move-projects', projectIds: [...projectIds] })
        setPickerTarget(targetFolderId)
      },
      setProjectTags: (projectIds, tags) => setProjectsTags([...projectIds], [...tags]),
      trimHistory: openSelectedHistoryBatch,
      deleteProjects: (projectIds) => {
        const projects = selectedProjects.filter((project) => projectIds.includes(project.id))
        void deleteProjectsWithConfirmation(projects)
      },
      normalizeTagsFromRaw: (raw) => normalizeTags(raw.split(/[,;]/)),
      sharedTagsForProjectIds: (projectIds) => {
        const projects = selectedProjects.filter((project) => projectIds.includes(project.id))
        return commonTags(projects)
      },
      fileNameForProject: (projectId) => {
        const project = selectedProjects.find((item) => item.id === projectId)
        return project ? databaseProjectFileName(project) : ''
      },
    },
    primerRows: selectedPrimers.map((primer) => ({
      key: primer.key,
      name: primer.name,
      sequence: primer.sequence,
      color: primer.color,
      description: primer.description,
      commonId: primer.commonId,
      isCommon: primerRowIsCommon(primer),
    })),
    primer: {
      upsertCommonPrimer,
      setPrimerKeysTags,
      refreshPrimerLibrary,
      refreshPrimerTags,
      addCommonPrimers,
      deleteCommonPrimers,
      addPrimersToCurrent: () => onAddPrimersToCurrent(selectedPrimers),
      tagsForPrimerKey: (key) => tagsForPrimerKey(primerTagMap, key),
      primerIdentityKey,
      commonTagsForKeys: (keys) => commonPrimerTags([...keys], primerTagMap),
      confirmRemoveCommon: (count) =>
        window.confirm(
          count === 1
            ? 'Remove this primer from Common primers?'
            : `Remove ${count} primers from Common primers?`,
        ),
      normalizeTagsFromRaw: (raw) => normalizeTags(raw.split(/[,;]/)),
    },
    proteinRows: selectedProteins.map((protein) => ({
      name: protein.name,
      sequence: protein.sequence,
    })),
    protein: {
      addToAlignment: addSelectedToAlignment,
      openProteinAt: (index) => {
        const protein = selectedProteins[index]
        if (protein) void openDatabaseProtein(protein)
      },
      copySequencesAt: async (indices) => {
        const text = indices
          .map((index) => selectedProteins[index])
          .filter(Boolean)
          .map((protein) => `>${protein!.name}\n${protein!.sequence}`)
          .join('\n')
        await navigator.clipboard.writeText(text)
      },
    },
  } satisfies Parameters<typeof createDatabaseManagerToolbarPortBundle>[0]

  const folderSyncRegionVisible = databaseManagerFolderSyncRegionVisible({
    fileView,
    browseKind: browse.kind,
    hasTopLevelFolder: Boolean(selectedTopLevelFolder),
  })

  const projectFileRows = mapProjectTableRows({
    projects: paginatedProjects.map((project) => {
      const selected = effectiveSelectedIds.includes(project.id)
      const isLibrary = project.documentRole === 'library'
      const libraryExpanded = isLibrary && expandedLibraryIds.has(project.id)
      const libraryMembers = libraryMembersById[project.id]
      const libraryMembersLoading = libraryMembersLoadingIds.has(project.id)
      const fileName = databaseProjectFileName(project)
      const rowAction = buildAppDatabaseManagerFilesRowActionSlice({
        constructPick: constructPickContext,
        libraryMemberPick: libraryMemberPick ?? null,
        selected,
        eligible: projectCanBeAdded(project),
      })
      return {
        id: project.id,
        name: project.name,
        fileName,
        formatLabel: databaseProjectFormatLabel(project),
        folderLabel: folderPathLabel(folders, project.folderId ?? null),
        tags: project.tags ?? [],
        updatedLabel: new Date(project.updatedAt).toLocaleString(),
        sequenceLengthLabel: formatSequenceLength(project.sequenceLength, project.molecule),
        fileSizeLabel: formatFileSize(projectFileByteLengths[project.id]),
        isCurrent: project.id === currentRecordId,
        isLibrary,
        libraryExpanded,
        libraryMembersLoading,
        libraryMembers: libraryExpanded
          ? (libraryMembers?.map((member) => ({
              id: member.id,
              fileName: member.fileName,
              parentFileName: fileName,
              sequenceLengthLabel: member.parseError ? '—' : formatSequenceLength(member.sequenceLength, 'dna'),
              parseError: member.parseError,
              enabled: member.enabled,
              openDisabled: Boolean(constructPick || libraryMemberPick || member.parseError),
              openTitle: member.parseError
                ? member.parseError
                : `Open “${member.fileName}” as a construct`,
            })) ?? null)
          : null,
        selected,
        rowActionLabel: rowAction.rowActionLabel,
        rowActionDisabled: rowAction.rowActionDisabled,
      }
    }),
  })

  const recordsPaneModels = assembleDatabaseManagerRecordsPaneModels({
    viewMode,
    browse,
    constructPick: constructPickContext,
    libraryMemberPick: libraryMemberPick ?? null,
    primerScanBusy,
    primerHitCount: primerHits.length,
    visiblePrimerCount: visiblePrimers.length,
    proteinScanBusy,
    proteinHitCount: proteinHits.length,
    visibleProteinCount: visibleProteins.length,
    visibleBuiltInCount: visibleBuiltIn.length,
    projectPageLoading,
    visibleProjectCount: visibleProjects.length,
    paginationTotal,
    paginationPage,
    pageSize: DATABASE_TABLE_PAGE_SIZE,
    primers: {
      rows: mapPrimerTableRows(paginatedPrimers, (key) => tagsForPrimerKey(primerTagMap, key)),
      tableWidth: primerTableWidth,
      viewportWidth: tableViewportWidth,
      checkColWidth: DB_CHECK_COL_WIDTH,
      columnOrder: primerColumnOrder,
      columnWidths: effectivePrimerWidths,
      sortColumn: primerSortColumn,
      sortDirection: primerSortDirection,
      selection: { allVisibleSelected, someVisibleSelected },
      selectedKeys: effectiveSelectedIds,
      columnReorder: { dragColumnId, dropTargetId },
    },
    proteins: {
      rows: mapProteinTableRows(paginatedProteins),
      tableWidth: proteinTableWidth,
      viewportWidth: tableViewportWidth,
      checkColWidth: DB_CHECK_COL_WIDTH,
      columnOrder: proteinColumnOrder,
      columnWidths: effectiveProteinWidths,
      sortColumn: proteinSortColumn,
      sortDirection: proteinSortDirection,
      selection: { allVisibleSelected, someVisibleSelected },
      selectedKeys: effectiveSelectedIds,
      columnReorder: { dragColumnId, dropTargetId },
    },
    builtin: { rows: mapBuiltInTableRows(paginatedBuiltIn) },
    files: {
      rows: projectFileRows,
      tableWidth,
      viewportWidth: tableViewportWidth,
      checkColWidth: DB_CHECK_COL_WIDTH,
      columnOrder: fileColumnOrder,
      columnWidths: effectiveColumnWidths,
      sortColumn,
      sortDirection,
      selection: { allVisibleSelected, someVisibleSelected },
      selectedIds: effectiveSelectedIds,
      columnReorder: { dragColumnId, dropTargetId },
    },
  }) as Omit<DatabaseManagerRecordsRegionProps, 'fileListRef' | 'commands' | 'paginationCommands'>

  const recordsCommandPorts = {
    onDragProjectsToWorkspace,
    onDragPrimersToWorkspace,
    constructPick: constructPickContext,
    libraryMemberPickActive: Boolean(libraryMemberPick),
    toggleSelectAll,
    setSelectedIds: setScopedSelectedIds,
    setSelectionAnchorId,
    selectVisibleRow,
    selectProject,
    findPrimerKey: (key) => paginatedPrimers.find((row) => row.key === key) ?? null,
    openPrimerEditor: (primer) => {
      const row = primer as DatabasePrimerRow
      scheduleDatabasePrimerPropertiesOpen({
        hybridWindow,
        onOpenPrimerProperties,
        resolvePayload: () =>
          primerPropertiesPayloadFromDatabaseRow(row, async (projectId) => (await getProject(projectId))?.record ?? null),
        openInline: (payload) => {
          setEditingPrimer(row)
          setEditingPrimerPayload(payload)
        },
      })
    },
    findProteinKey: (key) => paginatedProteins.find((row) => row.key === key) ?? null,
    openProtein: (protein) => void openDatabaseProtein(protein as DatabaseProteinRow),
    copyProteinSequence: (protein) => {
      void navigator.clipboard.writeText(protein.sequence).then(
        () => reportStatus(`Copied “${protein.name}” to the clipboard.`),
        () => reportStatus('Could not copy to the clipboard.'),
      )
    },
    findBuiltInId: (id) => paginatedBuiltIn.find((row) => row.id === id) ?? null,
    openBuiltIn: (entry) => openBuiltInEntry(entry as BuiltInPlasmidEntry),
    runBuiltInAction: runAction,
    browseTag: (tag) => applyBrowseNavigation({ kind: 'tag', tag }),
    togglePrimerSort: (column) => togglePrimerSort(column as PrimerSortColumn),
    toggleProteinSort: (column) => toggleProteinSort(column as ProteinSortColumn),
    toggleFileSort: (column) => toggleSort(column as DbSortColumn),
    resizePrimerColumn: (column, width) => resizePrimerColumn(column as PrimerColumnId, width),
    resizeProteinColumn: (column, width) => resizeProteinColumn(column as ProteinColumnId, width),
    resizeFileColumn: (column, width) => resizeColumn(column as DbColumnId, width),
    reorderPrimerColumn: (toId) => reorderPrimerColumn(toId as PrimerColumnId),
    reorderProteinColumn: (toId) => reorderProteinColumn(toId as ProteinColumnId),
    reorderFileColumn: (toId) => reorderFileColumn(toId as DbColumnId),
    setDragColumnId,
    setDropTargetId,
    endColumnReorderDrag,
    addConstructById,
    openProjectById,
    toggleLibraryExpanded,
    togglePickSelection: (projectId) => {
      setScopedSelectedIds((current) =>
        current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId],
      )
    },
    exportProject: async (projectId, format) => {
      const { path, fileLabel } = await exportProjectById(
        projectId,
        format as import('./presentation/databaseManager').DatabaseProjectExportFormat,
      )
      reportStatus(path ? `Exported ${path}` : `Exported ${fileLabel}`)
    },
    deleteProject: (projectId) => {
      const project = paginatedProjects.find((row) => row.id === projectId)
      if (project) void deleteProjectsWithConfirmation([project])
    },
    openLibraryMember: openLibraryMemberAsConstruct,
    libraryMemberBlocked: (projectId, memberId) => {
      if (constructPick || libraryMemberPick) return true
      const member = libraryMembersById[projectId]?.find((row) => row.id === memberId)
      return Boolean(member?.parseError)
    },
    reportStatus,
  } satisfies DatabaseManagerRecordsRegionCommandPorts

  const toolbarPorts = createDatabaseManagerToolbarPortBundle(toolbarPortInput)
  const toolbarCommands = buildDatabaseManagerToolbarCommandsFromPorts(
    {
      pick: { constructPick: constructPickContext, selectedProjectIds },
      folder: {
        browse,
        folderId: browse.kind === 'folder' ? browse.folderId : null,
        folderName: browseFolder?.name ?? null,
        parentId: browseFolder?.parentId ?? '',
      },
      fileSelection: {
        selectedProjectIds,
        unfiledFolderId: UNFILED_FOLDER_ID,
        tagSuggestions: allTags,
      },
      primer: { selectedCount: selectedPrimers.length, tagSuggestions: allPrimerTags },
      proteinIndices: selectedProteins.map((_, index) => index),
    },
    toolbarPorts,
  )
  const recordsPaneCommands = buildDatabaseManagerRecordsRegionCommands(recordsCommandPorts)

  return (
    <div className="db-manager-backdrop" role="presentation" onPointerDown={onClose}>
      <div
        ref={dialogRef}
        className={`db-manager-dialog${dragOver ? ' is-drop-target' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="VibeGene database"
        style={hybridWindow || isMobileShell ? undefined : { width: size.width, height: size.height }}
        onPointerDown={(event) => {
          event.stopPropagation()
          clearIdleHeaderStatus()
        }}
        onKeyDown={clearIdleHeaderStatus}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <DatabaseManagerShellLayout
          hybridWindow={hybridWindow}
          isMobileShell={isMobileShell}
          mobilePane={mobilePane}
          onMobilePaneChange={setMobilePane}
          sidebarWidth={sidebarWidth}
          header={
            hybridWindow
              ? null
              : {
                  model: {
                    title: headerPresentation.title,
                    browse,
                    browsePathLabel: headerPresentation.browsePathLabel,
                    viewMode,
                    itemCount: headerPresentation.itemCount,
                    selectedCount: headerPresentation.selectedCount,
                    busy: headerPresentation.busy,
                    headerStatus: headerPresentation.headerStatus,
                  },
                  commands: { onClose, onClearIdleHeaderStatus: clearIdleHeaderStatus },
                }
          }
          sidebar={{
            model: {
              viewMode,
              browse,
              folderTree: mapPresentationTreeNodes(tree),
              selectedFolderId,
              expandedFolderIds,
              builtinTree: mapPresentationTreeNodes(BUILTIN_PLASMID_TREE),
              expandedBuiltinIds,
              selectedBuiltinGroupId: browse.kind === 'builtin' ? browse.group : null,
              sidebarTags,
              busy,
              selectedProjectCount: selectedProjects.length,
              isMobileShell,
              folderActions: !alignmentPick && !constructPick && !libraryMemberPick
                ? {
                    ...toolbarPresentationModel.folder,
                    visible: true,
                    busy: busy || selectedFolderId === null,
                  }
                : undefined,
            },
            commands: {
              onBrowseAll: () => applyBrowseNavigation({ kind: 'all' }),
              onBrowseUnfiled: () => applyBrowseNavigation({ kind: 'unfiled' }),
              onBrowseFolder: (folderId: string) => applyBrowseNavigation({ kind: 'folder', folderId }),
              onToggleFolderExpanded: toggleFolderExpanded,
              onBrowseBuiltinGroup: (groupId: string) =>
                applyBrowseNavigation({ kind: 'builtin', group: groupId as BuiltInPlasmidGroupId }),
              onBrowseAllBuiltin: () => applyBrowseNavigation({ kind: 'builtin', group: 'builtin' }),
              onToggleBuiltinExpanded: (groupId: string) =>
                toggleBuiltinExpanded(groupId as BuiltInPlasmidGroupId),
              onBrowseCommonPrimers: () => applyBrowseNavigation({ kind: 'common' }),
              onBrowseTag: (tag: string) => applyBrowseNavigation({ kind: 'tag', tag }),
              onNewFolder: () =>
                openDatabaseManagerSidebarNewFolderPrompt({
                  movingProjectIds: selectedProjects.map((project) => project.id),
                  singleSelectedName:
                    selectedProjects.length === 1 ? selectedProjects[0]!.name : null,
                  parentId: parentForNewFolder(),
                  textPrompt: textPromptPort,
                  action: actionPort,
                  status: statusPort,
                  folder: {
                    createFolder: (name, parentId) => createFolder(name, parentId),
                    moveProjectsToFolder: async (ids, folderId) => {
                      await moveProjectsToFolder([...ids], folderId)
                    },
                    browseFolder: (folderId) => applyBrowseNavigation({ kind: 'folder', folderId }),
                    restoreSelection: (ids) => {
                      setScopedSelectedIds([...ids])
                      setSelectionAnchorId(ids[0] ?? null)
                    },
                  },
                }),
              onChooseSourceFolder: () => void toolbarCommands.folder.onChooseSourceFolder(),
              onRenameFolder: () => toolbarCommands.folder.onRenameFolder(),
              onMoveFolder: () => toolbarCommands.folder.onMoveFolder(),
              onDeleteFolder: () => void toolbarCommands.folder.onDeleteFolder(),
              onMobileTreeSelect: () => setMobilePane('records'),
            },
          }}
          sidebarResize={{
            onPointerDown: beginSidebarResize,
            onPointerMove: onSidebarResizeMove,
            onPointerUp: endSidebarResize,
            onPointerCancel: endSidebarResize,
          }}
          main={{
            toolbar: {
              model: toolbarPresentationModel as DatabaseManagerToolbarModel,
              commands: toolbarCommands,
              folderSync: {
                visible: folderSyncRegionVisible,
                model: buildDatabaseManagerFolderSyncRegionModel({
                  loading: folderSyncContextLoading,
                  mapping: folderSyncMapping
                    ? {
                        externalPath: folderSyncMapping.externalPath,
                        lastSyncedAt: folderSyncMapping.lastSyncedAt,
                      }
                    : null,
                  selectedFolderIsTopLevel,
                  topLevelFolderName: selectedTopLevelFolder?.name ?? '',
                  tombstones: folderSyncTombstones.map((t) => ({
                    id: t.id,
                    relativePath: t.relativePath,
                  })),
                  busy,
                }),
                commands: {
                  onRestoreTombstone: (tombstoneId) => {
                    const tombstone = folderSyncTombstones.find((item) => item.id === tombstoneId)
                    if (tombstone) void restoreIgnoredFile(tombstone)
                  },
                },
              },
            },
            records: {
              ...recordsPaneModels,
              commands: recordsPaneCommands,
              paginationCommands: { onGoToPage: goToDatabasePage },
            },
            recordsFileListRef: fileListRef,
          }}
        />


        {dragOver && (
          <div className="db-drop-overlay" aria-hidden>
            <Upload size={28} />
            <strong>Drop files to import</strong>
            <span>
              {browse.kind === 'folder'
                ? `Saving into ${folderPathLabel(folders, browse.folderId)}`
                : 'Saving into Unfiled'}
            </span>
          </div>
        )}

        {folderSyncPreflightModel && (
          <FolderSyncPreflightDialog
            model={folderSyncPreflightModel}
            busy={busy}
            progress={folderSyncApplyProgress}
            onCancel={() => {
              if (!busy) setFolderSyncDialog(null)
            }}
            onApply={(resolutions) => applyPreparedFolderSync(resolutions)}
          />
        )}

        {historyBatch && (
          <DatabaseHistoryBatchDialog
            records={historyBatchRecords}
            busy={busy}
            result={historyBatch.result}
            containsOpenRecord={Boolean(
              currentRecordId && historyBatch.projects.some((project) => project.id === currentRecordId),
            )}
            onLoadProject={async (projectId) => (await getProject(projectId))?.record ?? null}
            onCancel={() => {
              if (!busy) setHistoryBatch(null)
            }}
            onApply={(policy, options) => void applySelectedHistoryBatch(policy, options)}
          />
        )}

        {textPrompt && (
          <DatabaseTextPromptDialog
            prompt={textPrompt}
            busy={busy}
            onConfirm={textPrompt.onConfirm}
            onCancel={() => {
              if (!busy) setTextPrompt(null)
            }}
          />
        )}

        {picker && (
          <div
            className="db-picker-backdrop"
            role="presentation"
            onPointerDown={() => {
              if (!busy) setPicker(null)
            }}
          >
            <div
              className="db-picker-dialog save-to-database-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="db-move-picker-title"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <h4 id="db-move-picker-title">
                {picker.kind === 'move-folder'
                  ? 'Move folder into…'
                  : picker.projectIds.length === 1
                    ? 'Move file into…'
                    : `Move ${picker.projectIds.length} files into…`}
              </h4>
              <DatabaseFolderPickerTree
                folders={folders}
                selectedId={pickerTarget}
                onSelect={setPickerTarget}
                rootOption={
                  picker.kind === 'move-folder'
                    ? { id: '', label: 'Root (top level)' }
                    : { id: UNFILED_FOLDER_ID, label: 'Unfiled' }
                }
                excludeFolderIds={
                  picker.kind === 'move-folder'
                    ? collectFolderSubtreeIds(folders, picker.folderId)
                    : undefined
                }
                revealFolderId={
                  pickerTarget &&
                  pickerTarget !== UNFILED_FOLDER_ID &&
                  pickerTarget !== ''
                    ? pickerTarget
                    : null
                }
              />
              <div className="db-picker-actions">
                <button type="button" disabled={busy} onClick={() => setPicker(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void runAction('move', async () => {
                      const completed = await executeDatabaseManagerMovePickerConfirm(
                        picker,
                        pickerTarget,
                        UNFILED_FOLDER_ID,
                        {
                          moveFolder: moveFolder,
                          moveProjects: (projectIds, folderId) =>
                            moveProjectsToFolder([...projectIds], folderId),
                          resolveDestinationLabel: (folderId) => folderPathLabel(folders, folderId),
                          reportStatus,
                        },
                      )
                      if (completed) setPicker(null)
                    })
                  }
                >
                  Move
                </button>
              </div>
            </div>
          </div>
        )}

        <input
          ref={importInputRef}
          type="file"
          hidden
          multiple
          accept={SEQUENCE_OPEN_ACCEPT}
          onChange={(event) => {
            const files = event.target.files
            if (files?.length) void importDroppedFiles(files)
            event.target.value = ''
          }}
        />
        <input
          ref={importDatabaseZipInputRef}
          type="file"
          hidden
          accept=".zip,application/zip"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void runDatabaseImport(file)
            event.target.value = ''
          }}
        />
        {folderDirectoryImportAvailable ? (
        <input
          ref={(el) => {
            importFolderInputRef.current = el
            if (el) {
              el.setAttribute('webkitdirectory', '')
              el.setAttribute('directory', '')
            }
          }}
          type="file"
          hidden
          multiple
          onChange={(event) => {
            const list = event.target.files
            if (!list?.length) {
              event.target.value = ''
              return
            }
            const files = [...list]
            const firstPath =
              (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || files[0]!.name
            const rootName = firstPath.replace(/\\/g, '/').split('/')[0] || 'Imported folder'
            void runFolderImport({ rootName, files })
            event.target.value = ''
          }}
        />
        ) : null}

        {editingPrimer && editingPrimerPayload && (
          <DatabaseManagerPrimerPropertiesOverlay
            editingPrimer={editingPrimer}
            editingPrimerPayload={editingPrimerPayload}
            onClose={() => {
              setEditingPrimer(null)
              setEditingPrimerPayload(null)
            }}
            onCopyAsCommon={async (next) => {
              const saved = await upsertCommonPrimer(next)
              await refreshPrimerLibrary()
              setEditingPrimer(databasePrimerRowAfterCommonSave(editingPrimer, saved))
              setEditingPrimerPayload(primerPropertiesPayloadFromLibrary({ ...saved, commonId: saved.id }))
              reportStatus(`Saved “${saved.name}” as a common primer.`)
            }}
            onSaveCommon={async (next) => {
              if (!editingPrimer.commonId) return
              const saved = await upsertCommonPrimer({ ...next, id: editingPrimer.commonId })
              await refreshPrimerLibrary()
              setEditingPrimer(null)
              setEditingPrimerPayload(null)
              reportStatus(`Updated common primer “${saved.name}”.`)
            }}
          />
        )}

        {!hybridWindow && !isMobileShell && (
          <div
            className="db-manager-resize-handle"
            onPointerDown={beginResize}
            onPointerMove={onResizeMove}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            aria-hidden
          />
        )}
      </div>
    </div>
  )
}
