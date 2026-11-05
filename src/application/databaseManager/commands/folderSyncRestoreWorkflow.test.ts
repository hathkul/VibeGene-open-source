import { describe, expect, it, vi } from 'vitest'
import { databaseManagerRestoreIgnoredFileFailureStatus } from './folderSyncRestoreCommands'
import { runDatabaseManagerRestoreIgnoredFileAfterConfirm } from './folderSyncRestoreWorkflow'

describe('restore ignored file workflow', () => {
  it('declines before runAction and apply side effects', async () => {
    const runAction = vi.fn()
    const deleteTombstone = vi.fn()
    await runDatabaseManagerRestoreIgnoredFileAfterConfirm(
      { id: 't1', relativePath: 'a.dna' },
      {
        confirm: () => false,
        runAction,
        deleteTombstone,
        removeTombstoneFromState: vi.fn(),
        reportStatus: vi.fn(),
      },
    )
    expect(runAction).not.toHaveBeenCalled()
    expect(deleteTombstone).not.toHaveBeenCalled()
  })

  it('runs action only after confirm and reports failure without success copy', async () => {
    const runAction = vi.fn(async (_label, action) => action())
    const reportStatus = vi.fn()
    const deleteTombstone = vi.fn(async () => {
      throw new Error('db down')
    })
    await runDatabaseManagerRestoreIgnoredFileAfterConfirm(
      { id: 't1', relativePath: 'a.dna' },
      {
        confirm: () => true,
        runAction,
        deleteTombstone,
        removeTombstoneFromState: vi.fn(),
        reportStatus,
      },
    )
    expect(runAction).toHaveBeenCalledWith('restore ignored file', expect.any(Function))
    expect(reportStatus).toHaveBeenCalledWith(databaseManagerRestoreIgnoredFileFailureStatus)
    expect(reportStatus).not.toHaveBeenCalledWith(expect.stringContaining('Restored'))
  })
})
