import type { DatabaseBrowseMode, DatabaseViewMode } from '../browsePresentation'
import type { DatabaseManagerConstructSelectionRow } from './neutralTypes'
import type {
  DatabaseManagerAlignmentPickContext,
  DatabaseManagerConstructPickContext,
  DatabaseManagerLibraryMemberPickContext,
} from './pickContext'
import { buildAppDatabaseManagerFileSelectionToolbarSlice } from './toolbarFileSelectionModel'
import { buildAppDatabaseManagerFolderToolbarSlice } from './toolbarFolderModel'
import { buildAppDatabaseManagerHistoryRecoveryToolbarSlice } from './toolbarHistoryRecoveryModel'
import type { AppDatabaseManagerToolbarModes } from './toolbarModeTypes'
import { buildAppDatabaseManagerPickToolbarSlice } from './toolbarPickModel'
import {
  buildAppDatabaseManagerPrimerSelectionToolbarSlice,
  type AppDatabaseManagerPrimerSelectionRow,
} from './toolbarPrimerSelectionModel'
import { buildAppDatabaseManagerProteinSelectionToolbarSlice } from './toolbarProteinSelectionModel'
import { buildAppDatabaseManagerSyncToolbarSlice } from './toolbarSyncModel'
import { buildAppDatabaseManagerViewModeToolbarSlice } from './toolbarViewModeModel'

export type DatabaseManagerIntent = 'manage' | 'pick'

export type AppDatabaseManagerToolbarPresentationInput = {
  intent?: DatabaseManagerIntent
  libraryMemberPick: DatabaseManagerLibraryMemberPickContext | null
  onAddLibraryMembersHandler: boolean
  constructPick: DatabaseManagerConstructPickContext | null
  onAddConstructHandlers: boolean
  onCancelConstructPickHandler: boolean
  selectedConstructs: DatabaseManagerConstructSelectionRow[]
  viewMode: DatabaseViewMode
  busy: boolean
  fileView: boolean
  browse: DatabaseBrowseMode
  isTauriRuntime: boolean
  folderDirectoryImportAvailable: boolean
  selectedFolderHasSyncSource: boolean
  toolbarModes: AppDatabaseManagerToolbarModes
  selectedFolderIsTopLevel: boolean
  hasFolderSyncMapping: boolean
  latestHistoryRecoveryProjectCount: number
  alignmentPick: DatabaseManagerAlignmentPickContext | null
  onAddToAlignmentHandler: boolean
  selectedPrimers: AppDatabaseManagerPrimerSelectionRow[]
  currentRecordId: string | null
  selectedProteinCount: number
}

export type AppDatabaseManagerToolbarPresentationModel = {
  intent: DatabaseManagerIntent
  pick: ReturnType<typeof buildAppDatabaseManagerPickToolbarSlice>
  viewMode: ReturnType<typeof buildAppDatabaseManagerViewModeToolbarSlice>
  sync: ReturnType<typeof buildAppDatabaseManagerSyncToolbarSlice>
  folder: ReturnType<typeof buildAppDatabaseManagerFolderToolbarSlice>
  historyRecovery: ReturnType<typeof buildAppDatabaseManagerHistoryRecoveryToolbarSlice>
  fileSelection: ReturnType<typeof buildAppDatabaseManagerFileSelectionToolbarSlice>
  primerSelection: ReturnType<typeof buildAppDatabaseManagerPrimerSelectionToolbarSlice>
  proteinSelection: ReturnType<typeof buildAppDatabaseManagerProteinSelectionToolbarSlice>
}

export function buildAppDatabaseManagerToolbarPresentationModel(
  input: AppDatabaseManagerToolbarPresentationInput,
): AppDatabaseManagerToolbarPresentationModel {
  const selectedProjectCount = input.selectedConstructs.length
  return {
    intent: input.intent ?? 'manage',
    pick: buildAppDatabaseManagerPickToolbarSlice({
      libraryMemberPick: input.libraryMemberPick,
      onAddLibraryMembersHandler: input.onAddLibraryMembersHandler,
      constructPick: input.constructPick,
      onAddConstructHandlers: input.onAddConstructHandlers,
      onCancelConstructPickHandler: input.onCancelConstructPickHandler,
      selectedConstructs: input.selectedConstructs,
      busy: input.busy,
    }),
    viewMode: buildAppDatabaseManagerViewModeToolbarSlice({
      viewMode: input.viewMode,
      busy: input.busy,
      constructPick: input.constructPick,
      libraryMemberPick: input.libraryMemberPick,
    }),
    sync: buildAppDatabaseManagerSyncToolbarSlice({
      isTauriRuntime: input.isTauriRuntime,
      folderDirectoryImportAvailable: input.folderDirectoryImportAvailable,
      selectedFolderHasSyncSource: input.selectedFolderHasSyncSource,
      modes: input.toolbarModes,
    }),
    folder: buildAppDatabaseManagerFolderToolbarSlice({
      fileView: input.fileView,
      browse: input.browse,
      selectedFolderIsTopLevel: input.selectedFolderIsTopLevel,
      isTauriRuntime: input.isTauriRuntime,
      hasFolderSyncMapping: input.hasFolderSyncMapping,
      busy: input.busy,
    }),
    historyRecovery: buildAppDatabaseManagerHistoryRecoveryToolbarSlice({
      fileView: input.fileView,
      latestHistoryRecoveryProjectCount: input.latestHistoryRecoveryProjectCount,
      busy: input.busy,
    }),
    fileSelection: buildAppDatabaseManagerFileSelectionToolbarSlice({
      fileView: input.fileView,
      selectedProjectCount,
      alignmentPick: input.alignmentPick,
      onAddToAlignmentHandler: input.onAddToAlignmentHandler,
      libraryMemberPick: input.libraryMemberPick,
      isTauriRuntime: input.isTauriRuntime,
      busy: input.busy,
    }),
    primerSelection: buildAppDatabaseManagerPrimerSelectionToolbarSlice({
      viewMode: input.viewMode,
      selectedPrimers: input.selectedPrimers,
      busy: input.busy,
      currentRecordId: input.currentRecordId,
    }),
    proteinSelection: buildAppDatabaseManagerProteinSelectionToolbarSlice({
      viewMode: input.viewMode,
      selectedProteinCount: input.selectedProteinCount,
      alignmentPick: input.alignmentPick,
      onAddToAlignmentHandler: input.onAddToAlignmentHandler,
      busy: input.busy,
    }),
  }
}
