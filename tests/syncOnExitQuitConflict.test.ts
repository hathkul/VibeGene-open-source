import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async (command: string) => {
    if (command === 'exit_sync_revision') return 1
    if (command === 'acquire_exit_sync_lock') return true
    return undefined
  }),
  syncDatabaseLibrary: vi.fn(async () => ({ ok: true, conflicts: 1 })),
}))

vi.mock('../src/desktop/tauriRuntime', () => ({ isTauriRuntime: () => true }))
vi.mock('../src/desktop/workspaceWindows', () => ({
  countWorkspaceWindows: async () => 1,
  isLastWorkspaceWindow: async () => true,
  requiresSingleWorkspaceQuitGuard: (count: number) => count > 1,
}))
vi.mock('../src/storage/projects', () => ({
  hasPendingFolderSyncWork: async () => true,
  listFolderSyncMappings: async () => [{ folderId: 'root', externalPath: '/mapped' }],
}))
vi.mock('../src/storage/folderScopedSyncRepository', () => ({
  restoreLegacyImportedFolderSyncBaselines: async () => 0,
}))
vi.mock('../src/desktop/syncDatabaseLibrary', () => ({
  syncDatabaseLibrary: (...args: unknown[]) => mocks.syncDatabaseLibrary(...args),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mocks.invoke(...args as [string]) }))

import { quitNativeAppAfterDatabaseSync } from '../src/desktop/syncOnExit'

describe('native Quit when incremental sync conflicts', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    mocks.invoke.mockClear()
    mocks.syncDatabaseLibrary.mockClear()
    mocks.syncDatabaseLibrary.mockResolvedValue({ ok: true, conflicts: 1 })
  })

  it('keeps the app open when the user declines to quit with pending sync conflicts', async () => {
    const confirm = vi.fn(() => false)
    vi.stubGlobal('window', { confirm })

    await expect(quitNativeAppAfterDatabaseSync()).resolves.toBe(false)

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('1 sync conflict'))
    expect(mocks.invoke).not.toHaveBeenCalledWith('quit_app')
    expect(mocks.invoke).not.toHaveBeenCalledWith('mark_exit_sync_complete')
  })

  it('only quits after the user explicitly accepts unresolved conflicts', async () => {
    vi.stubGlobal('window', { confirm: vi.fn(() => true) })

    await expect(quitNativeAppAfterDatabaseSync()).resolves.toBe(true)

    expect(mocks.invoke).toHaveBeenCalledWith('quit_app')
    expect(mocks.invoke).not.toHaveBeenCalledWith('mark_exit_sync_complete')
  })
})
