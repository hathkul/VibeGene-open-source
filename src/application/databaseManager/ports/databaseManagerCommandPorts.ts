import type {
  AppDatabaseManagerImportToolbarMode,
  AppDatabaseManagerInboundToolbarMode,
  AppDatabaseManagerOutboundToolbarMode,
} from '../presentation/toolbarModeTypes'
import type { DatabaseManagerProjectExportFormat } from '../presentation/exportActionOrchestration'

export type DatabaseManagerTextPromptRequest = {
  title: string
  label: string
  initial: string
  confirmLabel?: string
  secondaryLabel?: string
  secondaryInitial?: string
  allowEmpty?: boolean
  suggestions?: string[]
  onConfirm: (value: string, secondaryValue?: string) => Promise<void> | void
}

export type DatabaseManagerTextPromptPort = {
  open: (request: DatabaseManagerTextPromptRequest) => void
  close: () => void
}

export type DatabaseManagerActionPort = {
  run: (label: string, action: () => Promise<void>) => void | Promise<void>
}

export type DatabaseManagerStatusPort = {
  report: (message: string) => void
}

export type DatabaseManagerPickCommandPort = {
  addLibraryMembers: () => void | Promise<void>
  addSelectedConstructs: () => void | Promise<void>
  addConstructById: (projectId: string) => void | Promise<void>
  onCancelConstructPick?: () => void
}

export type DatabaseManagerViewModeCommandPort = {
  setViewMode: (mode: 'dna' | 'primers' | 'proteins' | 'cdses') => void
}

export type DatabaseManagerSyncCommandPort = {
  setImportMode: (mode: AppDatabaseManagerImportToolbarMode) => void
  runImportMode: (mode: AppDatabaseManagerImportToolbarMode) => void
  setInboundMode: (mode: AppDatabaseManagerInboundToolbarMode) => void
  runInboundMode: (mode: AppDatabaseManagerInboundToolbarMode) => void | Promise<void>
  setOutboundMode: (mode: AppDatabaseManagerOutboundToolbarMode) => void
  runOutboundMode: (mode: AppDatabaseManagerOutboundToolbarMode) => void | Promise<void>
}

export type DatabaseManagerFolderToolbarCommandPort = {
  chooseSourceFolder: () => void | Promise<void>
  renameFolder: (folderId: string, name: string) => Promise<unknown>
  deleteFolder: (folderId: string) => Promise<unknown>
  setBrowseAll: () => void
  openMoveFolderPicker: (folderId: string, parentId: string) => void
  confirmDeleteFolder: (folderName: string) => boolean
}

export type DatabaseManagerFileSelectionCommandPort = {
  addToAlignment: () => void | Promise<void>
  exportProjects: (
    projectIds: readonly string[],
    format: DatabaseManagerProjectExportFormat,
  ) => Promise<{ message: string }>
  renameProjectFile: (projectId: string, name: string, constructName?: string) => Promise<{ fileName?: string } | null>
  openMoveProjectsPicker: (projectIds: readonly string[], targetFolderId: string) => void
  resolveMoveTargetFolder: (projectIds: readonly string[]) => string
  setProjectTags: (projectIds: readonly string[], tags: readonly string[]) => Promise<number>
  trimHistory: () => void | Promise<void>
  deleteProjects: (projectIds: readonly string[]) => void | Promise<void>
  normalizeTagsFromRaw: (raw: string) => readonly string[]
  sharedTagsForProjects: (projectIds: readonly string[]) => readonly string[]
  fileNameForProject: (projectId: string) => string
  constructNameForProject: (projectId: string) => string
}

export type DatabaseManagerPrimerCommandPort = {
  upsertCommonPrimer: (draft: {
    id?: string
    name: string
    sequence: string
    color: string
    description?: string
  }) => Promise<{ id: string; name: string; sequence: string }>
  setPrimerKeysTags: (keys: string[], tags: string[]) => Promise<number>
  refreshPrimerLibrary: () => void | Promise<void>
  refreshPrimerTags: () => void | Promise<void>
  addCommonPrimers: (
    drafts: Array<{ name: string; sequence: string; color: string; description?: string }>,
  ) => Promise<{ added: Array<{ name: string }>; skipped: number }>
  deleteCommonPrimers: (ids: string[]) => Promise<number>
  addPrimersToCurrent: () => void
  tagsForPrimerKey: (key: string) => readonly string[]
  primerIdentityKey: (name: string, sequence: string) => string
  commonTagsForKeys: (keys: readonly string[]) => readonly string[]
  confirmRemoveCommon: (count: number) => boolean
  normalizeTagsFromRaw: (raw: string) => readonly string[]
  isCommonPrimer: (index: number) => boolean
  primerAt: (index: number) => {
    key: string
    name: string
    sequence: string
    color: string
    description?: string
    commonId?: string
  } | null
}

export type DatabaseManagerProteinCommandPort = {
  addToAlignment: () => void | Promise<void>
  openProteinAt: (index: number) => void | Promise<void>
  copySequencesAt: (indices: readonly number[]) => Promise<void>
  proteinAt: (index: number) => { name: string; sequence: string } | null
  proteinCount: () => number
}

export type DatabaseManagerSelectionPort = {
  setSelectedIds: (ids: string[] | ((current: string[]) => string[])) => void
  setSelectionAnchorId: (id: string | null) => void
}
