import {
  applyDatabaseManagerRestoreIgnoredFile,
  databaseManagerRestoreIgnoredFileConfirmMessage,
} from './folderSyncRestoreCommands'

export async function runDatabaseManagerRestoreIgnoredFileAfterConfirm(
  tombstone: { id: string; relativePath: string },
  deps: {
    confirm: (message: string) => boolean
    runAction: (label: string, action: () => Promise<void>) => void | Promise<void>
    deleteTombstone: (tombstoneId: string) => Promise<void>
    removeTombstoneFromState: (tombstoneId: string) => void
    reportStatus: (message: string) => void
  },
): Promise<void> {
  if (!deps.confirm(databaseManagerRestoreIgnoredFileConfirmMessage(tombstone.relativePath))) {
    return
  }
  await deps.runAction('restore ignored file', async () => {
    await applyDatabaseManagerRestoreIgnoredFile(tombstone, {
      deleteTombstone: deps.deleteTombstone,
      removeTombstoneFromState: deps.removeTombstoneFromState,
      reportStatus: deps.reportStatus,
    })
  })
}
