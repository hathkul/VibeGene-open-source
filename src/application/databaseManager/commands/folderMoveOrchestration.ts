export type DatabaseManagerMovePickerState =
  | { kind: 'move-folder'; folderId: string }
  | { kind: 'move-projects'; projectIds: readonly string[] }

export const databaseManagerFolderMoveCycleFailureStatus =
  'Could not move folder (check for cycles).'

export function databaseManagerFolderMoveSuccessStatus(folderName: string): string {
  return `Moved folder “${folderName}”.`
}

export function databaseManagerProjectMoveSuccessStatus(input: {
  count: number
  destinationLabel: string
}): string {
  if (input.count === 1) {
    return `Moved 1 file to ${input.destinationLabel}.`
  }
  return `Moved ${input.count} files to ${input.destinationLabel}.`
}

export type DatabaseManagerMovePickerExecutionPort = {
  moveFolder: (folderId: string, parentId: string | null) => Promise<{ name: string } | null>
  moveProjects: (projectIds: readonly string[], folderId: string | null) => Promise<number>
  resolveDestinationLabel: (folderId: string | null) => string
  reportStatus: (message: string) => void
}

export async function executeDatabaseManagerMovePickerConfirm(
  picker: DatabaseManagerMovePickerState,
  pickerTarget: string,
  unfiledFolderId: string,
  port: DatabaseManagerMovePickerExecutionPort,
): Promise<boolean> {
  if (picker.kind === 'move-folder') {
    const parentId = pickerTarget.trim() === '' ? null : pickerTarget
    const moved = await port.moveFolder(picker.folderId, parentId)
    if (!moved) {
      port.reportStatus(databaseManagerFolderMoveCycleFailureStatus)
      return false
    }
    port.reportStatus(databaseManagerFolderMoveSuccessStatus(moved.name))
    return true
  }
  const folderId =
    pickerTarget === unfiledFolderId || pickerTarget.trim() === '' ? null : pickerTarget
  const count = await port.moveProjects(picker.projectIds, folderId)
  port.reportStatus(
    databaseManagerProjectMoveSuccessStatus({
      count,
      destinationLabel: port.resolveDestinationLabel(folderId),
    }),
  )
  return true
}
