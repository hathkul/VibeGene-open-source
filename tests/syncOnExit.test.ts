import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isTauriRuntime: vi.fn(() => true),
  readAppPreferences: vi.fn((): { syncDatabaseOnExit: boolean } => ({ syncDatabaseOnExit: true })),
  isLastWorkspaceWindow: vi.fn(async () => true),
  listFolderSyncMappings: vi.fn(async () => [{ folderId: 'root', externalPath: '/mapped' }]),
  globalPendingChecks: 0,
  hasPendingFolderSyncWork: vi.fn(async (folderId?: string) => {
    if (folderId) return true
    mocks.globalPendingChecks += 1
    return mocks.globalPendingChecks <= 2
  }),
  syncDatabaseLibrary: vi.fn(async (
    _onProgress?: (done: number, total: number, name: string) => void,
    _options?: { folderId: string },
  ): Promise<{ ok: boolean; conflicts?: number; error?: string }> => {
    void _onProgress
    void _options
    return { ok: true, conflicts: 0 }
  }),
  invoke: vi.fn(async (command: string) => {
    if (command === 'exit_sync_revision') return 0
    if (command === 'acquire_exit_sync_lock') return true
    return undefined
  }),
  restoreLegacyImportedFolderSyncBaselines: vi.fn(async (folderId: string) => {
    void folderId
    return 0
  }),
}))

vi.mock('../src/desktop/tauriRuntime', () => ({
  isTauriRuntime: () => mocks.isTauriRuntime(),
}))

vi.mock('../src/domain/appPreferences', () => ({
  readAppPreferences: () => mocks.readAppPreferences(),
}))

vi.mock('../src/desktop/workspaceWindows', () => ({
  isLastWorkspaceWindow: () => mocks.isLastWorkspaceWindow(),
}))

vi.mock('../src/storage/projects', () => ({
  listFolderSyncMappings: () => mocks.listFolderSyncMappings(),
  hasPendingFolderSyncWork: (folderId?: string) => mocks.hasPendingFolderSyncWork(folderId),
}))

vi.mock('../src/desktop/syncDatabaseLibrary', () => ({
  syncDatabaseLibrary: (
    onProgress: ((done: number, total: number, name: string) => void) | undefined,
    options: { folderId: string },
  ) => mocks.syncDatabaseLibrary(onProgress, options),
}))

vi.mock('../src/storage/folderScopedSyncRepository', () => ({
  restoreLegacyImportedFolderSyncBaselines: (folderId: string) =>
    mocks.restoreLegacyImportedFolderSyncBaselines(folderId),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mocks.invoke(...args as [string]) }))

import {
  maybeSyncDatabaseOnExit,
  scheduleDatabaseBackgroundSync,
  shouldHoldCloseForDatabaseSync,
} from '../src/desktop/syncOnExit'

describe('shouldHoldCloseForDatabaseSync', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.useRealTimers()
    mocks.isTauriRuntime.mockReturnValue(true)
    mocks.readAppPreferences.mockReturnValue({ syncDatabaseOnExit: true })
    mocks.isLastWorkspaceWindow.mockResolvedValue(true)
    mocks.listFolderSyncMappings.mockResolvedValue([
      { folderId: 'root', externalPath: '/mapped' },
    ])
    mocks.globalPendingChecks = 0
    mocks.hasPendingFolderSyncWork.mockImplementation(async (folderId?: string) => {
      if (folderId) return true
      mocks.globalPendingChecks += 1
      return mocks.globalPendingChecks <= 2
    })
    mocks.syncDatabaseLibrary.mockClear()
    mocks.restoreLegacyImportedFolderSyncBaselines.mockClear()
    mocks.invoke.mockReset()
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'exit_sync_revision') return 0
      if (command === 'acquire_exit_sync_lock') return true
      return undefined
    })
  })

  it('holds the last clean editor when a mapped folder exists', async () => {
    await expect(shouldHoldCloseForDatabaseSync()).resolves.toBe(true)
    expect(mocks.restoreLegacyImportedFolderSyncBaselines).toHaveBeenCalledWith('root')
  })

  it('lets the last editor close when pending work is only the legacy import queue', async () => {
    mocks.hasPendingFolderSyncWork
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    mocks.restoreLegacyImportedFolderSyncBaselines.mockResolvedValueOnce(3)

    await expect(shouldHoldCloseForDatabaseSync()).resolves.toBe(false)
  })

  it('lets a clean last window close when nothing is mapped', async () => {
    mocks.listFolderSyncMappings.mockResolvedValue([])
    mocks.hasPendingFolderSyncWork.mockResolvedValue(false)
    await expect(shouldHoldCloseForDatabaseSync()).resolves.toBe(false)
  })

  it('holds close when orphaned global work exists even without a mapping', async () => {
    mocks.listFolderSyncMappings.mockResolvedValue([])
    mocks.hasPendingFolderSyncWork.mockResolvedValue(true)

    await expect(shouldHoldCloseForDatabaseSync()).resolves.toBe(true)
  })

  it('does not hold close while other editor windows remain', async () => {
    mocks.isLastWorkspaceWindow.mockResolvedValue(false)
    await expect(shouldHoldCloseForDatabaseSync()).resolves.toBe(false)
  })

  it('reports preparation and forwards per-item progress while syncing on exit', async () => {
    mocks.syncDatabaseLibrary.mockImplementationOnce(async (onProgress) => {
      onProgress?.(0, 3, 'Applying sync')
      onProgress?.(2, 3, 'folder/construct.dna')
      return { ok: true, conflicts: 0 }
    })
    const onProgress = vi.fn()

    const result = await maybeSyncDatabaseOnExit(onProgress)

    expect(result.ok).toBe(true)
    expect(mocks.syncDatabaseLibrary).toHaveBeenCalledWith(expect.any(Function), {
      folderId: 'root', incremental: true,
    })

    expect(onProgress).toHaveBeenNthCalledWith(1, expect.objectContaining({
      phase: 'preparing',
      folderTotal: 0,
    }))
    expect(onProgress).toHaveBeenLastCalledWith({
      phase: 'syncing',
      folderIndex: 1,
      folderTotal: 1,
      folderPath: '/mapped',
      done: 2,
      total: 3,
      itemName: 'folder/construct.dna',
    })
  })

  it('reports a retryable failure instead of waiting forever for a dead sync owner', async () => {
    vi.useFakeTimers()
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'exit_sync_revision') return 0
      if (command === 'acquire_exit_sync_lock') return false
      return undefined
    })
    const pending = maybeSyncDatabaseOnExit()
    await vi.advanceTimersByTimeAsync(30_200)
    await expect(pending).resolves.toMatchObject({ ok: false, error: expect.stringContaining('did not release') })
    expect(mocks.syncDatabaseLibrary).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('releases the process lock after a successful sync', async () => {
    await maybeSyncDatabaseOnExit()
    expect(mocks.invoke).toHaveBeenCalledWith('release_exit_sync_lock', expect.objectContaining({ token: expect.any(String) }))
  })

  it('surfaces conflicts as a retryable exit failure', async () => {
    mocks.syncDatabaseLibrary.mockResolvedValueOnce({ ok: true, conflicts: 2 })
    await expect(maybeSyncDatabaseOnExit()).resolves.toMatchObject({
      ok: false,
      conflicts: 2,
      error: expect.stringContaining('2 sync conflict'),
    })
  })

  it('drains changes that arrive during the first successful pass before marking completion', async () => {
    let globalChecks = 0
    mocks.hasPendingFolderSyncWork.mockImplementation(async (folderId?: string) => {
      if (folderId) return true
      globalChecks += 1
      return globalChecks <= 3
    })
    const result = await maybeSyncDatabaseOnExit()
    expect(result).toMatchObject({ ok: true })
    expect(mocks.syncDatabaseLibrary).toHaveBeenCalledTimes(2)
    expect(mocks.invoke).toHaveBeenCalledWith('mark_exit_sync_complete')
  })

  it('does not hold close or acquire the lock when no mapped work is pending', async () => {
    mocks.hasPendingFolderSyncWork.mockResolvedValue(false)
    await expect(shouldHoldCloseForDatabaseSync()).resolves.toBe(false)
    const result = await maybeSyncDatabaseOnExit()
    expect(result).toMatchObject({ ok: true, syncedFolders: 0 })
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.syncDatabaseLibrary).not.toHaveBeenCalled()
  })

  it('does not acquire the sync lock when baseline recovery clears a legacy import queue', async () => {
    mocks.hasPendingFolderSyncWork
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    mocks.restoreLegacyImportedFolderSyncBaselines.mockResolvedValueOnce(2)

    await expect(maybeSyncDatabaseOnExit()).resolves.toMatchObject({
      ok: true,
      syncedFolders: 0,
    })
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.syncDatabaseLibrary).not.toHaveBeenCalled()
  })

  it('returns an actionable failure instead of success when pending work has no mapping', async () => {
    mocks.listFolderSyncMappings.mockResolvedValue([])
    mocks.hasPendingFolderSyncWork.mockResolvedValue(true)

    await expect(maybeSyncDatabaseOnExit()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('no active folder mapping'),
    })
    expect(mocks.syncDatabaseLibrary).not.toHaveBeenCalled()
  })

  it('coalesces library changes into one delayed background flush', async () => {
    vi.useFakeTimers()
    let globalChecks = 0
    mocks.hasPendingFolderSyncWork.mockImplementation(async (folderId?: string) => {
      if (folderId) return true
      globalChecks += 1
      return globalChecks <= 3
    })
    scheduleDatabaseBackgroundSync()
    scheduleDatabaseBackgroundSync()
    await vi.advanceTimersByTimeAsync(1_100)
    expect(mocks.syncDatabaseLibrary).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('holds the last editor close when pending work exists despite a persisted legacy false', async () => {
    mocks.readAppPreferences.mockReturnValue({ syncDatabaseOnExit: false })

    await expect(shouldHoldCloseForDatabaseSync()).resolves.toBe(true)
  })

  it('runs the required background drain despite a persisted legacy false', async () => {
    vi.resetModules()
    const { scheduleDatabaseBackgroundSync: schedule } = await import('../src/desktop/syncOnExit')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2099-01-01T00:00:00.000Z'))
    mocks.readAppPreferences.mockReturnValue({ syncDatabaseOnExit: false })
    mocks.globalPendingChecks = 0
    mocks.hasPendingFolderSyncWork.mockImplementation(async (folderId?: string) => {
      if (folderId) return true
      mocks.globalPendingChecks += 1
      return mocks.globalPendingChecks <= 3
    })

    schedule()
    await vi.advanceTimersByTimeAsync(1_100)
    await vi.advanceTimersByTimeAsync(1)

    expect(mocks.hasPendingFolderSyncWork).toHaveBeenCalled()
    expect(mocks.globalPendingChecks).toBe(1)
    expect(mocks.invoke).toHaveBeenCalled()
    expect(mocks.syncDatabaseLibrary).toHaveBeenCalledWith(undefined, {
      folderId: 'root', incremental: true,
    })
  })

  it('retries pending work at the cooldown boundary when a new save arrives during cooldown', async () => {
    vi.resetModules()
    const { scheduleDatabaseBackgroundSync: schedule } = await import('../src/desktop/syncOnExit')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2099-01-01T00:00:00.000Z'))
    mocks.readAppPreferences.mockReturnValue({ syncDatabaseOnExit: false })
    mocks.globalPendingChecks = 0
    mocks.hasPendingFolderSyncWork.mockImplementation(async (folderId?: string) => {
      if (folderId) return true
      mocks.globalPendingChecks += 1
      return mocks.globalPendingChecks <= 3
    })

    schedule()
    await vi.advanceTimersByTimeAsync(1_001)
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.syncDatabaseLibrary).toHaveBeenCalledTimes(1)

    mocks.globalPendingChecks = 0
    schedule()
    await vi.advanceTimersByTimeAsync(1_001)
    expect(mocks.syncDatabaseLibrary).toHaveBeenCalledTimes(1)

    mocks.globalPendingChecks = 0
    await vi.advanceTimersByTimeAsync(15_100)
    expect(mocks.syncDatabaseLibrary).toHaveBeenCalledTimes(2)
  })

  it('does not report a successful quit flush when the mandatory write fails despite legacy false', async () => {
    mocks.readAppPreferences.mockReturnValue({ syncDatabaseOnExit: false })
    mocks.syncDatabaseLibrary.mockResolvedValueOnce({ ok: false, error: 'disk write failed' })

    await expect(maybeSyncDatabaseOnExit()).resolves.toMatchObject({
      ok: false,
      error: 'disk write failed',
    })
    expect(mocks.syncDatabaseLibrary).toHaveBeenCalledWith(expect.any(Function), {
      folderId: 'root', incremental: true,
    })
  })
})
