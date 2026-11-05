// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteFolder } from './projectLibrary'
import { db, type StoredProjectSummary } from './projects'

describe('deleteFolder', () => {
  beforeEach(async () => {
    await db.open()
    await Promise.all([
      db.folders.clear(),
      db.projects.clear(),
      db.projectRecords.clear(),
      db.projectFileBlobs.clear(),
      db.projectFileBaselines.clear(),
      db.projectFileTombstones.clear(),
      db.folderSyncMappings.clear(),
      db.folderSyncPending.clear(),
    ])
  })

  afterEach(async () => {
    await Promise.all([
      db.folders.clear(),
      db.projects.clear(),
      db.projectRecords.clear(),
      db.projectFileBlobs.clear(),
      db.projectFileBaselines.clear(),
      db.projectFileTombstones.clear(),
      db.folderSyncMappings.clear(),
      db.folderSyncPending.clear(),
    ])
  })

  it('deletes the selected folder subtree and its projects without touching siblings', async () => {
    await db.folders.bulkPut([
      { id: 'root', name: 'Root', parentId: null, updatedAt: '' },
      { id: 'branch', name: 'Branch', parentId: 'root', updatedAt: '' },
      { id: 'leaf', name: 'Leaf', parentId: 'branch', updatedAt: '' },
      { id: 'sibling', name: 'Sibling', parentId: 'root', updatedAt: '' },
    ])
    await db.projects.bulkPut([
      { id: 'branch-project', folderId: 'branch' } as StoredProjectSummary,
      { id: 'leaf-project', folderId: 'leaf' } as StoredProjectSummary,
      { id: 'sibling-project', folderId: 'sibling' } as StoredProjectSummary,
    ])

    await deleteFolder('branch')

    expect(await db.folders.bulkGet(['root', 'branch', 'leaf', 'sibling'])).toEqual([
      expect.objectContaining({ id: 'root' }),
      undefined,
      undefined,
      expect.objectContaining({ id: 'sibling' }),
    ])
    expect(await db.projects.bulkGet(['branch-project', 'leaf-project', 'sibling-project'])).toEqual([
      undefined,
      undefined,
      expect.objectContaining({ id: 'sibling-project', folderId: 'sibling' }),
    ])
  })
})
