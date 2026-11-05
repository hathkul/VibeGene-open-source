import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  preflight: vi.fn(),
  apply: vi.fn(),
}))

vi.mock('../src/desktop/tauriRuntime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('../src/desktop/folderScopedSync', () => ({
  preflightFolderScopedSync: mocks.preflight,
  applyFolderScopedSync: mocks.apply,
}))

import { syncDatabaseLibrary } from '../src/desktop/syncDatabaseLibrary'
import { syncFolderIntoDatabaseLibrary } from '../src/desktop/syncFolderIntoDatabaseLibrary'

const emptyCounts = {
  addToDb: 0,
  updateDb: 0,
  createOnDisk: 0,
  overwriteDisk: 0,
  removeFromDb: 0,
  ignore: 0,
  conflict: 0,
}

describe('folder-scoped sync wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.preflight.mockImplementation(
      async (
        folderId: string,
        options: { direction: 'from' | 'to'; cleanup?: boolean },
      ) => ({
        folderId,
        externalPath: '/mapped',
        direction: options.direction,
        cleanup: options.cleanup === true,
        dbFiles: [],
        diskFiles: [],
        primerListFiles: [],
        tombstones: [],
        plan: {
          direction: options.direction,
          actions: [],
          counts: emptyCounts,
        },
        conflicts: [],
      }),
    )
    mocks.apply.mockResolvedValue({
      applied: 0,
      addedToDb: 0,
      updatedInDb: 0,
      writtenToDisk: 0,
      removedFromDb: 0,
      ignored: 0,
      primersSaved: 0,
      primersRemoved: 0,
      primerListsSaved: 0,
      primerListsRemoved: 0,
      unresolvedConflicts: [],
      failures: [],
    })
  })

  it('keeps the database-to-folder wrapper outbound-only', async () => {
    const result = await syncDatabaseLibrary(undefined, { folderId: 'root' })

    expect(result.ok).toBe(true)
    expect(mocks.preflight).toHaveBeenCalledWith('root', { direction: 'to' })
  })

  it('keeps folder import and cleanup inbound-only', async () => {
    const result = await syncFolderIntoDatabaseLibrary(undefined, {
      folderId: 'root',
      cleanup: true,
    })

    expect(result.ok).toBe(true)
    expect(mocks.preflight).toHaveBeenCalledWith('root', {
      direction: 'from',
      cleanup: true,
    })
  })
})
