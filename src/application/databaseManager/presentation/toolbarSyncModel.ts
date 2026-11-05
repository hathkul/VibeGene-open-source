import type { AppDatabaseManagerToolbarModes } from './toolbarModeTypes'

export type AppDatabaseManagerSyncToolbarInput = {
  isTauriRuntime: boolean
  folderDirectoryImportAvailable: boolean
  selectedFolderHasSyncSource: boolean
  modes: AppDatabaseManagerToolbarModes
}

export type AppDatabaseManagerSyncToolbarSlice = {
  isTauri: boolean
  folderDirectoryImportAvailable: boolean
  selectedFolderHasSyncSource: boolean
  importDatabaseTitle: string
  exportDatabaseTitle: string
  modes: AppDatabaseManagerToolbarModes
}

export function buildAppDatabaseManagerSyncToolbarSlice(
  input: AppDatabaseManagerSyncToolbarInput,
): AppDatabaseManagerSyncToolbarSlice {
  return {
    isTauri: input.isTauriRuntime,
    folderDirectoryImportAvailable: input.folderDirectoryImportAvailable,
    selectedFolderHasSyncSource: input.selectedFolderHasSyncSource,
    importDatabaseTitle: input.isTauriRuntime
      ? 'Import a previously exported database folder (or Cancel to pick a .zip)'
      : 'Import a previously exported database .zip',
    exportDatabaseTitle: input.isTauriRuntime
      ? 'Export all folders and constructs as .dna files plus vibegene-database.json'
      : 'Download a zip of all folders and constructs (.dna) plus vibegene-database.json',
    modes: input.modes,
  }
}
