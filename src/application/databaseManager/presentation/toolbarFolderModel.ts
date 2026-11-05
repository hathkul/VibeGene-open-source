import type { DatabaseBrowseMode } from '../browsePresentation'

export type AppDatabaseManagerFolderToolbarInput = {
  fileView: boolean
  browse: DatabaseBrowseMode
  selectedFolderIsTopLevel: boolean
  isTauriRuntime: boolean
  hasFolderSyncMapping: boolean
  busy: boolean
}

export type AppDatabaseManagerFolderToolbarSlice = {
  visible: boolean
  showSourceFolderButton: boolean
  sourceFolderLabel: string
  sourceFolderTitle: string
  busy: boolean
}

export function buildAppDatabaseManagerFolderToolbarSlice(
  input: AppDatabaseManagerFolderToolbarInput,
): AppDatabaseManagerFolderToolbarSlice {
  return {
    visible: input.fileView && input.browse.kind === 'folder',
    // A persistent folder link is created only by Import folder.  Keeping a
    // generic Set source button here made the one-off sync commands silently
    // create permanent links, so it is deliberately not exposed.
    showSourceFolderButton: false,
    sourceFolderLabel: '',
    sourceFolderTitle: '',
    busy: input.busy,
  }
}
