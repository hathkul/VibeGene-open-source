import { describe, expect, it } from 'vitest'
import { revealedFolderIds } from './folderReveal'

describe('revealedFolderIds', () => {
  const folders = [
    { id: 'root', parentId: null },
    { id: 'child', parentId: 'root' },
    { id: 'leaf', parentId: 'child' },
  ]

  it('persists the revealed folder and its ancestors', () => {
    expect([...revealedFolderIds(folders, new Set(), 'leaf')]).toEqual(['leaf', 'child', 'root'])
  })

  it('preserves prior expansion and respects exclusions', () => {
    expect([...revealedFolderIds(folders, new Set(['prior']), 'leaf', new Set(['child']))])
      .toEqual(['prior', 'leaf', 'root'])
  })
})
