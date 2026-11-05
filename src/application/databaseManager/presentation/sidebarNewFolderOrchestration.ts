export type DatabaseManagerNewFolderPromptModel = {
  title: 'New folder'
  label: string
  initial: string
  confirmLabel: 'Create'
}

export function databaseManagerNewFolderPromptModel(input: {
  movingCount: number
  singleSelectedName: string | null
}): DatabaseManagerNewFolderPromptModel {
  const defaultName =
    input.movingCount > 0
      ? input.movingCount === 1 && input.singleSelectedName
        ? input.singleSelectedName
        : 'New folder'
      : 'New folder'
  return {
    title: 'New folder',
    label:
      input.movingCount > 0
        ? `Folder name (${input.movingCount} selected file${input.movingCount === 1 ? '' : 's'} will be moved in)`
        : 'Folder name',
    initial: defaultName,
    confirmLabel: 'Create',
  }
}

export function databaseManagerNewFolderSuccessStatus(input: {
  folderName: string
  movedCount: number
}): string {
  if (input.movedCount > 0) {
    return `Created folder “${input.folderName}” and moved ${input.movedCount} file${input.movedCount === 1 ? '' : 's'} into it.`
  }
  return `Created folder “${input.folderName}”.`
}
