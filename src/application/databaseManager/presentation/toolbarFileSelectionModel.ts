import type {
  DatabaseManagerAlignmentPickContext,
  DatabaseManagerLibraryMemberPickContext,
} from './pickContext'

export type AppDatabaseManagerFileSelectionToolbarInput = {
  fileView: boolean
  selectedProjectCount: number
  alignmentPick: DatabaseManagerAlignmentPickContext | null
  onAddToAlignmentHandler: boolean
  libraryMemberPick: DatabaseManagerLibraryMemberPickContext | null
  isTauriRuntime: boolean
  busy: boolean
}

export type AppDatabaseManagerFileSelectionToolbarSlice = {
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

export function buildAppDatabaseManagerFileSelectionToolbarSlice(
  input: AppDatabaseManagerFileSelectionToolbarInput,
): AppDatabaseManagerFileSelectionToolbarSlice {
  const count = input.selectedProjectCount
  return {
    visible: input.fileView && count > 0,
    count,
    showAlignment: Boolean(
      input.alignmentPick && input.onAddToAlignmentHandler && !input.libraryMemberPick,
    ),
    exportSelectionTitle:
      count === 1
        ? 'Export the selected file'
        : input.isTauriRuntime
          ? `Export ${count} selected files to a folder`
          : `Export ${count} selected files as a zip`,
    renameDisabled: count !== 1,
    renameTitle:
      count === 1 ? 'Rename the selected file' : 'Select a single file to rename',
    moveLabel: count === 1 ? 'Move file' : `Move ${count}`,
    tagsLabel: count === 1 ? 'Tags' : `Tags (${count})`,
    trimLabel: `Trim history${count > 1 ? ` (${count})` : ''}`,
    deleteTitle: `Delete ${count} selected construct${count === 1 ? '' : 's'}`,
    deleteLabel: `Delete${count > 1 ? ` (${count})` : ''}`,
    busy: input.busy,
  }
}
