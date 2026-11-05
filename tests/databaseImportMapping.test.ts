import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  readDir: vi.fn(),
  readFile: vi.fn(),
  setMapping: vi.fn(),
  importDatabase: vi.fn(),
  importFolder: vi.fn(),
}))

vi.mock('../src/desktop/tauriRuntime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: mocks.open,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: mocks.readDir,
  readFile: mocks.readFile,
}))

vi.mock('../src/storage/projectLibrary', () => ({
  setTopLevelFolderSyncMapping: mocks.setMapping,
}))

vi.mock('../src/storage/databaseImport', () => ({
  importDatabaseFromVirtualFs: mocks.importDatabase,
  importFolderTreeFromVirtualFs: mocks.importFolder,
}))

import {
  importDatabaseLibrary,
  importFolderLibrary,
} from '../src/desktop/importDatabaseLibrary'

describe('database import source mappings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readDir.mockResolvedValue([])
    mocks.importDatabase.mockResolvedValue({
      foldersCreated: 1,
      projectsSaved: 1,
      failed: [],
    })
    mocks.importFolder.mockResolvedValue({
      rootFolderId: 'new-root',
      rootFolderName: 'Source',
      foldersCreated: 1,
      projectsSaved: 1,
      primersSaved: 0,
      primersSkipped: 0,
      failed: [],
    })
  })

  it('establishes a mapping for a desktop folder import', async () => {
    mocks.open.mockResolvedValue('/Users/example/Source')

    const result = await importFolderLibrary()

    expect(result).toMatchObject({ ok: true, source: '/Users/example/Source' })
    expect(mocks.setMapping).toHaveBeenCalledWith(
      'new-root',
      '/Users/example/Source',
      expect.objectContaining({
        lastSyncedAt: expect.any(String),
        importedContentsAreBaseline: true,
      }),
    )
  })

  it('scans folder paths first and reads file bytes on demand while reporting scan progress', async () => {
    mocks.open.mockResolvedValue('C:\\Source')
    mocks.readDir.mockImplementation(async (path: string) => {
      if (path === 'C:\\Source') return [{ name: 'sub', isDirectory: true }, { name: 'top.gb', isDirectory: false }]
      if (path === 'C:\\Source\\sub') return [{ name: 'nested.gb', isDirectory: false }]
      return []
    })
    mocks.readFile.mockImplementation(async (path: string) => new TextEncoder().encode(path))
    mocks.importFolder.mockImplementation(async (_root, entries, _progress, loadBytes) => {
      expect(entries.map((entry: { relativePath: string; bytes: Uint8Array }) => [entry.relativePath, entry.bytes.length])).toEqual([
        ['sub/nested.gb', 0],
        ['top.gb', 0],
      ])
      expect(mocks.readFile).not.toHaveBeenCalled()
      const loaded = await loadBytes(entries[0])
      expect(new TextDecoder().decode(loaded)).toBe('C:\\Source\\sub\\nested.gb')
      return {
        rootFolderId: 'new-root',
        rootFolderName: 'Source',
        foldersCreated: 1,
        projectsSaved: 1,
        primersSaved: 0,
        primersSkipped: 0,
        failed: [],
      }
    })
    const progress = vi.fn()

    await importFolderLibrary(null, progress)

    expect(progress).toHaveBeenCalledWith(0, 0, 'Scanning folder… 1 files found')
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
  })

  it('never changes source mappings when importing an exported database', async () => {
    mocks.open.mockResolvedValue('/Users/example/database-export')

    const result = await importDatabaseLibrary()

    expect(result).toMatchObject({ ok: true, sourceKind: 'directory' })
    expect(mocks.setMapping).not.toHaveBeenCalled()
  })
})
