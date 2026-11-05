import {
  buildDatabaseManagerToolbarFileSelectionCommands,
  buildDatabaseManagerToolbarFolderCommands,
  buildDatabaseManagerToolbarHistoryRecoveryCommands,
  buildDatabaseManagerToolbarPickCommands,
  buildDatabaseManagerToolbarPrimerCommands,
  buildDatabaseManagerToolbarProteinCommands,
  buildDatabaseManagerToolbarSyncCommands,
  buildDatabaseManagerToolbarViewModeCommands,
  type DatabaseManagerFileSelectionCommandState,
  type DatabaseManagerFolderToolbarCommandState,
  type DatabaseManagerPrimerToolbarCommandState,
  type DatabaseManagerToolbarPickCommandState,
} from '../commands/toolbarCommandBuilders'
import type { DatabaseManagerToolbarPortBundle } from './toolbarPortFactories'

export type DatabaseManagerToolbarCommandAssemblyState = {
  pick: DatabaseManagerToolbarPickCommandState
  folder: DatabaseManagerFolderToolbarCommandState
  fileSelection: DatabaseManagerFileSelectionCommandState
  primer: DatabaseManagerPrimerToolbarCommandState
  proteinIndices: readonly number[]
}

export function buildDatabaseManagerToolbarCommandsFromPorts(
  state: DatabaseManagerToolbarCommandAssemblyState,
  ports: DatabaseManagerToolbarPortBundle,
) {
  return {
    pick: buildDatabaseManagerToolbarPickCommands(state.pick, ports.pick),
    viewMode: buildDatabaseManagerToolbarViewModeCommands(ports.viewMode),
    sync: buildDatabaseManagerToolbarSyncCommands(ports.sync),
    folder: buildDatabaseManagerToolbarFolderCommands(state.folder, {
      folder: ports.folder,
      textPrompt: ports.textPrompt,
      action: ports.action,
      status: ports.status,
    }),
    historyRecovery: buildDatabaseManagerToolbarHistoryRecoveryCommands(ports.history),
    fileSelection: buildDatabaseManagerToolbarFileSelectionCommands(state.fileSelection, {
      file: ports.file,
      textPrompt: ports.textPrompt,
      action: ports.action,
      status: ports.status,
    }),
    primerSelection: buildDatabaseManagerToolbarPrimerCommands(state.primer, {
      primer: ports.primer,
      textPrompt: ports.textPrompt,
      action: ports.action,
      status: ports.status,
      selection: ports.selection,
    }),
    proteinSelection: buildDatabaseManagerToolbarProteinCommands(
      { selectedIndices: state.proteinIndices },
      { protein: ports.protein, status: ports.status },
    ),
  }
}
