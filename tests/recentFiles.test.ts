/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  listRecentFiles,
  removeRecentDatabaseProject,
  touchRecentDatabaseProject,
  touchRecentLocalFile,
  trimRecentFilesToLimit,
} from '../src/storage/recentFiles'

describe('recentFiles', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('stores local and database opens with newest first and deduplication', () => {
    touchRecentLocalFile('/tmp/plasmid.dna', 'plasmid', 5)
    touchRecentDatabaseProject('proj-1', 'Construct A', 5)
    touchRecentLocalFile('/tmp/other.dna', 'other', 5)
    touchRecentLocalFile('/tmp/plasmid.dna', 'plasmid renamed', 5)

    expect(listRecentFiles(5)).toEqual([
      expect.objectContaining({ kind: 'local', path: '/tmp/plasmid.dna', name: 'plasmid renamed' }),
      expect.objectContaining({ kind: 'local', path: '/tmp/other.dna', name: 'other' }),
      expect.objectContaining({ kind: 'database', projectId: 'proj-1', name: 'Construct A' }),
    ])
  })

  it('trims to the configured limit and removes deleted database entries', () => {
    touchRecentLocalFile('/tmp/a.dna', 'a', 10)
    touchRecentLocalFile('/tmp/b.dna', 'b', 10)
    touchRecentDatabaseProject('proj-1', 'A', 10)
    touchRecentDatabaseProject('proj-2', 'B', 10)

    trimRecentFilesToLimit(2)
    expect(listRecentFiles(10)).toHaveLength(2)

    removeRecentDatabaseProject('proj-1')
    expect(listRecentFiles(10).some((entry) => entry.kind === 'database' && entry.projectId === 'proj-1')).toBe(
      false,
    )
  })
})
