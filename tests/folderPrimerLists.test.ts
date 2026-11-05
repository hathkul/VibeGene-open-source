import { describe, expect, it } from 'vitest'
import { folderPrimerListsToHits, primerIdentityKey } from '../src/storage/databasePrimers'
import type { StoredFolderPrimerList } from '../src/storage/folderPrimerLists'

describe('folderPrimerListsToHits', () => {
  it('maps list oligos onto the owning database folder', () => {
    const lists: StoredFolderPrimerList[] = [
      {
        id: 'list-1',
        folderId: 'folder-primers',
        relativePath: 'Primers/demo.txt',
        name: 'demo',
        updatedAt: '2026-01-01T00:00:00.000Z',
        primers: [
          { name: 'M13F', sequence: 'gt aaaacgacggccagt'.replace(/\s/g, ''), color: '#111' },
          { name: 'M13R', sequence: 'CAGGAAACAGCTATGAC' },
        ],
      },
    ]

    const hits = folderPrimerListsToHits(lists)
    expect(hits).toHaveLength(2)
    expect(hits[0]).toMatchObject({
      key: primerIdentityKey('M13F', 'GTAAAACGACGGCCAGT'),
      folderId: 'folder-primers',
      projectId: 'list-1',
      projectName: 'demo',
      folderPrimerListId: 'list-1',
    })
    expect(hits.every((hit) => hit.folderId === 'folder-primers')).toBe(true)
  })
})
