import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteProject: vi.fn(),
  deleteProjectForSyncCleanup: vi.fn(),
}))

vi.mock('../src/storage/databaseExport', () => ({
  collectFolderSubtreeIds: vi.fn(),
  folderPathRelativeToRoot: vi.fn(),
}))

vi.mock('../src/storage/databaseImport', () => ({
  hashConstructSemanticRecord: vi.fn(),
  importBytesIntoLibrary: vi.fn(),
  importBytesReplacingProject: vi.fn(),
}))

vi.mock('../src/storage/databaseSync', () => ({
  encodeRecordForSyncRelativePath: vi.fn(),
  normalizeFolderSyncRelativePath: vi.fn((path: string) => path),
  sequenceFileStem: vi.fn(),
}))

vi.mock('../src/storage/folderPrimerLists', () => ({
  syncFolderPrimerLists: vi.fn(),
}))

vi.mock('../src/storage/projectLibrary', () => ({
  createFolder: vi.fn(),
  listFolders: vi.fn(),
  setFolderSyncMappingLastSyncedAt: vi.fn(),
}))

vi.mock('../src/storage/projects', () => ({
  acceptProjectFileSync: vi.fn(),
  deleteProject: mocks.deleteProject,
  deleteProjectForSyncCleanup: mocks.deleteProjectForSyncCleanup,
  getFolderSyncMapping: vi.fn(),
  getProject: vi.fn(),
  getProjectFileBaseline: vi.fn(),
  getProjectFileBlob: vi.fn(),
  inferProjectFileFormat: vi.fn(),
  listProjectFileTombstones: vi.fn(),
  listProjectSummaries: vi.fn(),
}))

import { createFolderScopedSyncRepositoryDependencies } from '../src/storage/folderScopedSyncRepository'

describe('folder-scoped sync repository boundaries', () => {
  it('routes cleanup removal through the no-tombstone deletion path', async () => {
    const dependencies = createFolderScopedSyncRepositoryDependencies({
      scanFolder: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
    })

    await dependencies.removeFromDb('cleanup-project')

    expect(mocks.deleteProjectForSyncCleanup).toHaveBeenCalledWith('cleanup-project')
    expect(mocks.deleteProject).not.toHaveBeenCalled()
  })
})
