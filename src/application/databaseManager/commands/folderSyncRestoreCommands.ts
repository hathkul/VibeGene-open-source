export function databaseManagerRestoreIgnoredFileConfirmMessage(relativePath: string): string {
  return `Restore “${relativePath}” to folder sync?\n\nThe source file will become eligible for the next Sync from source folder. It will not be imported now.`
}

export function databaseManagerRestoreIgnoredFileSuccessStatus(relativePath: string): string {
  return `Restored “${relativePath}”. It is eligible for the next inbound sync and was not imported now.`
}

export const databaseManagerRestoreIgnoredFileFailureStatus = 'Could not restore ignored file.'

export type DatabaseManagerRestoreIgnoredFileApplyPort = {
  deleteTombstone: (tombstoneId: string) => Promise<void>
  removeTombstoneFromState: (tombstoneId: string) => void
  reportStatus: (message: string) => void
}

export async function applyDatabaseManagerRestoreIgnoredFile(
  tombstone: { id: string; relativePath: string },
  port: DatabaseManagerRestoreIgnoredFileApplyPort,
): Promise<'success' | 'error'> {
  try {
    await port.deleteTombstone(tombstone.id)
    port.removeTombstoneFromState(tombstone.id)
    port.reportStatus(databaseManagerRestoreIgnoredFileSuccessStatus(tombstone.relativePath))
    return 'success'
  } catch {
    port.reportStatus(databaseManagerRestoreIgnoredFileFailureStatus)
    return 'error'
  }
}
