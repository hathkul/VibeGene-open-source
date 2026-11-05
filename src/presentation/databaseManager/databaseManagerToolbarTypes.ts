import type {
  DatabaseManagerImportToolbarMode,
  DatabaseManagerInboundToolbarMode,
  DatabaseManagerOutboundToolbarMode,
  DatabaseManagerToolbarModes,
} from './types'

export type DatabaseManagerPickToolbarModel = {
  libraryMember: {
    visible: boolean
    label: string
    countSuffix: string
    disabled: boolean
    title: string
  } | null
  construct: {
    visible: boolean
    confirmLabel: string
    disabled: boolean
    title: string
    cancelVisible: boolean
    cancelLabel: string
  } | null
}

export type DatabaseManagerViewModeToolbarModel = {
  active: 'dna' | 'primers' | 'proteins' | 'cdses'
  dnaDisabled: boolean
  primersDisabled: boolean
  proteinsDisabled: boolean
  cdsesDisabled: boolean
  busy: boolean
}

export type DatabaseManagerSyncToolbarModel = {
  isTauri: boolean
  folderDirectoryImportAvailable: boolean
  selectedFolderHasSyncSource: boolean
  importDatabaseTitle: string
  exportDatabaseTitle: string
  modes: DatabaseManagerToolbarModes
}

export type DatabaseManagerFolderToolbarModel = {
  visible: boolean
  showSourceFolderButton: boolean
  sourceFolderLabel: string
  sourceFolderTitle: string
  busy: boolean
}

export type DatabaseManagerHistoryRecoveryToolbarModel = {
  visible: boolean
  projectCount: number
  busy: boolean
}

export type DatabaseManagerFileSelectionToolbarModel = {
  visible: boolean
  count: number
  showAlignment: boolean
  exportSelectionTitle: string
  renameDisabled: boolean
  renameTitle: string
  moveLabel: string
  tagsLabel: string
  trimLabel: string
  deleteTitle: string
  deleteLabel: string
  busy: boolean
}

export type DatabaseManagerPrimerSelectionToolbarModel = {
  visible: boolean
  count: number
  renameDisabled: boolean
  renameTitle: string
  tagsLabel: string
  addToCurrentDisabled: boolean
  addToCurrentTitle: string
  addToCommonDisabled: boolean
  addToCommonTitle: string
  showRemoveCommon: boolean
  busy: boolean
}

export type DatabaseManagerProteinSelectionToolbarModel = {
  visible: boolean
  count: number
  showAlignment: boolean
  busy: boolean
}

export type DatabaseManagerToolbarModel = {
  intent?: 'manage' | 'pick'
  pick: DatabaseManagerPickToolbarModel
  viewMode: DatabaseManagerViewModeToolbarModel
  sync: DatabaseManagerSyncToolbarModel
  folder: DatabaseManagerFolderToolbarModel
  historyRecovery: DatabaseManagerHistoryRecoveryToolbarModel
  fileSelection: DatabaseManagerFileSelectionToolbarModel
  primerSelection: DatabaseManagerPrimerSelectionToolbarModel
  proteinSelection: DatabaseManagerProteinSelectionToolbarModel
}

export type DatabaseManagerToolbarCommands = {
  pick: {
    onAddLibraryMembers?: () => void
    onAddConstruct?: () => void
    onCancelConstructPick?: () => void
  }
  viewMode: {
    onSelectDna: () => void
    onSelectPrimers: () => void
    onSelectProteins: () => void
    onSelectCdses: () => void
  }
  sync: {
    onImportModeChange: (mode: DatabaseManagerImportToolbarMode) => void
    onRunImportMode: (mode: DatabaseManagerImportToolbarMode) => void
    onInboundModeChange: (mode: DatabaseManagerInboundToolbarMode) => void
    onRunInboundMode: (mode: DatabaseManagerInboundToolbarMode) => void
    onOutboundModeChange: (mode: DatabaseManagerOutboundToolbarMode) => void
    onRunOutboundMode: (mode: DatabaseManagerOutboundToolbarMode) => void
  }
  folder: {
    onChooseSourceFolder: () => void
    onRenameFolder: () => void
    onMoveFolder: () => void
    onDeleteFolder: () => void
  }
  historyRecovery: {
    onRestore: () => void
    onDiscard: () => void
  }
  fileSelection: {
    onAddToAlignment: () => void
    onExport: (format: import('./types').DatabaseProjectExportFormat) => void
    onStatus: (message: string) => void
    onRename: () => void
    onMove: () => void
    onEditTags: () => void
    onTrimHistory: () => void
    onDelete: () => void
  }
  primerSelection: {
    onRename: () => void
    onEditTags: () => void
    onAddToCurrent: () => void
    onAddToCommon: () => void
    onRemoveFromCommon: () => void
  }
  proteinSelection: {
    onAddToAlignment: () => void
    onOpen: () => void
    onCopySequences: () => void
  }
}
