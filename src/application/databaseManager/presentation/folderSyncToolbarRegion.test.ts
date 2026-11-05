import { describe, expect, it } from 'vitest'
import {
  buildDatabaseManagerFolderSyncRegionModel,
  databaseManagerFolderSyncRegionVisible,
} from './folderSyncToolbarRegion'

describe('folder sync toolbar region', () => {
  it('shows only for folder file view with top-level folder', () => {
    expect(
      databaseManagerFolderSyncRegionVisible({
        fileView: true,
        browseKind: 'folder',
        hasTopLevelFolder: true,
      }),
    ).toBe(true)
    expect(
      databaseManagerFolderSyncRegionVisible({
        fileView: false,
        browseKind: 'folder',
        hasTopLevelFolder: true,
      }),
    ).toBe(false)
  })

  it('maps tombstones for presentation', () => {
    expect(
      buildDatabaseManagerFolderSyncRegionModel({
        loading: false,
        mapping: { externalPath: '/tmp/db', lastSyncedAt: null },
        selectedFolderIsTopLevel: true,
        topLevelFolderName: 'Lab',
        tombstones: [{ id: 't1', relativePath: 'a.dna' }],
        busy: false,
      }).tombstones,
    ).toEqual([{ id: 't1', relativePath: 'a.dna' }])
  })
})
