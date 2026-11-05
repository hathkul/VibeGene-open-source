import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  rememberDatabaseSyncTarget: vi.fn(),
}))

vi.mock('../src/desktop/tauriRuntime', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: mocks.open,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
}))

vi.mock('../src/storage/databaseSyncPrefs', () => ({
  rememberDatabaseSyncTarget: mocks.rememberDatabaseSyncTarget,
}))

vi.mock('../src/storage/databaseExport', () => ({
  DATABASE_EXPORT_MANIFEST_NAME: 'vibegene-database.json',
  sanitizePathSegment: (value: string) => value,
  encodeDatabaseExportManifest: () => new TextEncoder().encode('{}\n'),
  buildDatabaseExportBundle: async () => ({
    manifest: {
      format: 'vibegene-database-export',
      version: 2,
      exportedAt: '2026-01-01T00:00:00.000Z',
      folders: [],
      projects: [
        {
          id: 'project',
          name: 'Project',
          constructName: 'Project',
          folderId: null,
          tags: [],
          topology: 'circular',
          sequenceLength: 4,
          relativePath: 'Project.gb',
        },
      ],
    },
    files: [{ relativePath: 'Project.gb', bytes: new Uint8Array([1, 2, 3]) }],
  }),
}))

import { exportDatabaseLibrary } from '../src/desktop/exportDatabaseLibrary'

describe('database export side effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.open.mockResolvedValue('/chosen/export')
  })

  it('writes the selected export without remembering it as a sync target', async () => {
    const result = await exportDatabaseLibrary()

    expect(result).toMatchObject({ ok: true, mode: 'directory', path: '/chosen/export' })
    expect(mocks.writeFile).toHaveBeenCalled()
    expect(mocks.rememberDatabaseSyncTarget).not.toHaveBeenCalled()
  })
})
