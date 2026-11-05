import { describe, expect, it, vi } from 'vitest'
import {
  applyDatabaseManagerRestoreIgnoredFile,
  databaseManagerRestoreIgnoredFileSuccessStatus,
} from './folderSyncRestoreCommands'

describe('apply restore ignored file', () => {
  it('deletes tombstone and reports success text', async () => {
    const deleteTombstone = vi.fn(async () => {})
    const removeTombstoneFromState = vi.fn()
    const reportStatus = vi.fn()
    const result = await applyDatabaseManagerRestoreIgnoredFile(
      { id: 't1', relativePath: 'seq/plasmid.dna' },
      {
        deleteTombstone,
        removeTombstoneFromState,
        reportStatus,
      },
    )
    expect(result).toBe('success')
    expect(deleteTombstone).toHaveBeenCalledWith('t1')
    expect(removeTombstoneFromState).toHaveBeenCalledWith('t1')
    expect(reportStatus).toHaveBeenCalledWith(
      databaseManagerRestoreIgnoredFileSuccessStatus('seq/plasmid.dna'),
    )
  })
})
