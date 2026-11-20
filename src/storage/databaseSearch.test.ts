// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, normalizeStoredProjectSummary, queryProjectSummaryPage, type StoredProjectSummary } from './projects'

describe('database project search', () => {
  beforeEach(async () => {
    await db.open()
    await db.projects.clear()
    const row = (id: string, folderId: string, name: string, fileName: string, tags: string[]): StoredProjectSummary =>
      normalizeStoredProjectSummary({ id, folderId, name, fileName, tags, updatedAt: '2026-01-01', sequenceLength: 100, molecule: 'dna', topology: 'linear' })
    await db.projects.bulkPut([
      row('1', 'a', 'Alpha', 'first.dna', ['marker']),
      row('2', 'a', 'Beta', 'MARKER-two.dna', []),
      row('3', 'b', 'Marker three', 'third.dna', []),
      row('4', 'a', 'Other', 'other.dna', []),
    ])
  })
  afterEach(async () => { await db.projects.clear() })

  it('filters case-insensitively before paginating, within a folder or globally', async () => {
    const base = { molecule: 'nucleic' as const, sortBy: 'name' as const, direction: 'asc' as const, pageSize: 1, search: ' MaRkEr ' }
    const folder = await queryProjectSummaryPage({ ...base, scope: { kind: 'folder', folderId: 'a' }, page: 1 })
    expect(folder.total).toBe(2)
    expect(folder.rows.map((row) => row.id)).toEqual(['2'])
    const global = await queryProjectSummaryPage({ ...base, scope: { kind: 'all' }, page: 2 })
    expect(global.total).toBe(3)
    expect(global.rows.map((row) => row.id)).toEqual(['3'])
  })
})
