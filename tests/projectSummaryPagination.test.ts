import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  db,
  normalizeStoredProjectSummary,
  queryProjectSummaryPage,
  type StoredProjectSummary,
} from '../src/storage/projects'

function summary(input: {
  id: string
  name?: string
  molecule?: StoredProjectSummary['molecule']
  folderId?: string | null
  tags?: string[]
  updatedIndex?: number
  sequenceLength?: number
}): StoredProjectSummary {
  const name = input.name ?? input.id
  return normalizeStoredProjectSummary({
    id: input.id,
    name,
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, input.updatedIndex ?? 0)).toISOString(),
    folderId: input.folderId ?? null,
    tags: input.tags ?? [],
    sequenceLength: input.sequenceLength ?? 100,
    molecule: input.molecule ?? 'dna',
    topology: 'linear',
    fileName: `${name}.${input.molecule === 'protein' ? 'prot' : 'dna'}`,
    fileFormat: 'snapgene',
  })
}

describe('queryProjectSummaryPage', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterAll(async () => {
    await db.delete()
  })

  it('settles an empty indexed library', async () => {
    await expect(queryProjectSummaryPage({
      molecule: 'protein',
      scope: { kind: 'all' },
      sortBy: 'updated',
      direction: 'desc',
      page: 0,
      pageSize: 200,
    })).resolves.toEqual({ rows: [], total: 0, page: 0 })
  })

  it('backfills browse keys while upgrading an existing summary library', async () => {
    await db.delete()
    const legacy = new Dexie('vibegene')
    legacy.version(13).stores({
      projects: 'id, name, updatedAt, folderId, *tags, fileName, fileFormat, fileSyncState',
    })
    await legacy.open()
    await legacy.table('projects').put({
      id: 'legacy-dna',
      name: 'Legacy construct',
      updatedAt: '2026-01-01T00:00:00.000Z',
      folderId: null,
      tags: ['Legacy'],
      sequenceLength: 123,
      molecule: 'dna',
      topology: 'linear',
      fileName: 'Legacy construct.dna',
      fileFormat: 'snapgene',
    })
    legacy.close()
    await db.open()

    const result = await queryProjectSummaryPage({
      molecule: 'nucleic',
      scope: { kind: 'all' },
      sortBy: 'name',
      direction: 'asc',
      page: 0,
      pageSize: 200,
    })

    expect(result.rows.map((row) => row.id)).toEqual(['legacy-dna'])
    expect(result.rows[0]?.browseMolecule).toBe('nucleic')
    expect(result.rows[0]?.browseName).toBe('legacy construct.dna')
  })

  it('returns one indexed page and count without mixing protein records into DNA', async () => {
    const dnaRows = Array.from({ length: 450 }, (_, index) => summary({
      id: `dna-${String(index).padStart(3, '0')}`,
      updatedIndex: index,
      sequenceLength: index + 1,
    }))
    const proteinRows = Array.from({ length: 25 }, (_, index) => summary({
      id: `protein-${String(index).padStart(3, '0')}`,
      molecule: 'protein',
      updatedIndex: index,
    }))
    await db.projects.bulkPut([...dnaRows, ...proteinRows])

    const result = await queryProjectSummaryPage({
      molecule: 'nucleic',
      scope: { kind: 'all' },
      sortBy: 'updated',
      direction: 'desc',
      page: 1,
      pageSize: 200,
    })

    expect(result.total).toBe(450)
    expect(result.page).toBe(1)
    expect(result.rows).toHaveLength(200)
    expect(result.rows[0]?.id).toBe('dna-249')
    expect(result.rows.at(-1)?.id).toBe('dna-050')
    expect(result.rows.every((row) => row.molecule !== 'protein')).toBe(true)
  })

  it('applies folder and tag scopes before paging', async () => {
    await db.projects.bulkPut([
      summary({ id: 'alpha', folderId: 'folder-a', tags: ['favorite'], updatedIndex: 1 }),
      summary({ id: 'beta', folderId: 'folder-a', tags: ['other'], updatedIndex: 2 }),
      summary({ id: 'gamma', folderId: 'folder-b', tags: ['Favorite'], updatedIndex: 3 }),
      summary({ id: 'unfiled', tags: ['favorite'], updatedIndex: 4 }),
    ])

    const folder = await queryProjectSummaryPage({
      molecule: 'nucleic',
      scope: { kind: 'folder', folderId: 'folder-a' },
      sortBy: 'name',
      direction: 'asc',
      page: 0,
      pageSize: 20,
    })
    const tagged = await queryProjectSummaryPage({
      molecule: 'nucleic',
      scope: { kind: 'tag', tag: 'FAVORITE' },
      sortBy: 'name',
      direction: 'asc',
      page: 0,
      pageSize: 20,
    })

    expect(folder.rows.map((row) => row.id)).toEqual(['alpha', 'beta'])
    expect(tagged.rows.map((row) => row.id)).toEqual(['alpha', 'gamma', 'unfiled'])
  })

  it('clamps a stale page after rows are removed', async () => {
    await db.projects.bulkPut(Array.from({ length: 201 }, (_, index) => summary({
      id: `row-${String(index).padStart(3, '0')}`,
      updatedIndex: index,
    })))

    const result = await queryProjectSummaryPage({
      molecule: 'nucleic',
      scope: { kind: 'all' },
      sortBy: 'updated',
      direction: 'desc',
      page: 99,
      pageSize: 200,
    })

    expect(result.page).toBe(1)
    expect(result.rows).toHaveLength(1)
  })
})
