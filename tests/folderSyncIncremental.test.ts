import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  preflight: vi.fn(),
  apply: vi.fn(),
  flushPending: vi.fn(),
  io: { fileExists: vi.fn() },
}))

vi.mock('../src/desktop/tauriRuntime', () => ({ isTauriRuntime: () => true }))
vi.mock('../src/desktop/folderScopedSync', () => ({
  preflightFolderScopedSync: mocks.preflight,
  applyFolderScopedSync: mocks.apply,
}))
vi.mock('../src/storage/folderScopedSyncRepository', () => ({
  flushPendingFolderSync: mocks.flushPending,
}))
vi.mock('../src/desktop/folderScopedSyncIo', () => ({ desktopFolderScopedSyncIo: mocks.io }))

import { syncDatabaseLibrary } from '../src/desktop/syncDatabaseLibrary'

describe('incremental folder sync wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.flushPending.mockResolvedValue({ written: 2, conflicts: 1, skipped: 0, path: '/mapped' })
  })

  it('flushes only durable pending work without running the full preflight scan', async () => {
    const onProgress = vi.fn()
    const result = await syncDatabaseLibrary(onProgress, { folderId: 'root', incremental: true })

    expect(mocks.flushPending).toHaveBeenCalledWith('root', mocks.io, expect.any(Function))
    expect(mocks.preflight).not.toHaveBeenCalled()
    expect(mocks.apply).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      ok: true,
      path: '/mapped',
      written: 2,
      skippedUnchanged: 0,
      conflicts: 1,
      projectCount: 3,
    })
  })
})
