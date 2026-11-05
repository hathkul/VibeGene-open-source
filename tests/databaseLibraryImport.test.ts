// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/storage/syncSourceHash', () => ({
  hashSyncSourceBytes: async () => 'test-hash',
}))
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { serializeProjectFile } from '../src/domain/fileFormats'
import {
  createRestrictionCloningProductLibrary,
  expandRestrictionInsertSources,
} from '../src/domain/restrictionCloningBatch'
import type { SequenceRecord } from '../src/domain/types'
import { initSnapGeneLzma } from '../src/domain/snapgeneLzma'
import { importBytesIntoLibrary } from '../src/storage/databaseImport'
import { db, getProject } from '../src/storage/projects'

function record(id: string, name: string, sequence: string): SequenceRecord {
  return {
    id,
    name,
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '',
    updatedAt: '',
  }
}

beforeAll(async () => {
  await initSnapGeneLzma()
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  await db.delete()
})

describe('database DNA-library import', () => {
  it('sniffs binary sequence payloads even when a legacy file is named .gb', async () => {
    const source = record('boris', 'BORIS locus', 'ACGTACGT')
    const serialized = serializeProjectFile('snapgene', source)
    if (!serialized.ok) throw new Error(serialized.error)

    const imported = await importBytesIntoLibrary('BORIS locus.gb', serialized.bytes)
    if (!imported.ok) throw new Error(imported.error)

    const stored = await getProject(imported.id)
    expect(stored?.fileFormat).toBe('snapgene')
    expect(stored?.record.sequence).toBe(source.sequence)
  })

  it('repairs an unedited legacy .gb row from its retained binary payload on open', async () => {
    const source = record('boris', 'BORIS locus', 'ACGTACGT')
    const serialized = serializeProjectFile('snapgene', source)
    if (!serialized.ok) throw new Error(serialized.error)

    const imported = await importBytesIntoLibrary('BORIS locus.gb', serialized.bytes)
    if (!imported.ok) throw new Error(imported.error)
    const stored = await getProject(imported.id)
    if (!stored) throw new Error('Imported project was not stored')

    await db.projects.put({ ...stored, fileFormat: 'genbank' })
    await db.projectRecords.put({
      id: stored.id,
      record: { ...stored.record, sequence: 'TT' },
    })

    const repaired = await getProject(stored.id)
    expect(repaired?.fileFormat).toBe('snapgene')
    expect(repaired?.record.sequence).toBe(source.sequence)
  })

  it('retains packed members so a reloaded library expands for cloning', async () => {
    const library = createRestrictionCloningProductLibrary(
      [
        record('member-a', 'Insert A', 'AAATCTAGAGGATCCCCC'),
        record('member-b', 'Insert B', 'GGGTCTAGAGGATCCTTT'),
      ],
      'Insert library',
    )
    const serialized = serializeProjectFile('snapgene', library)
    if (!serialized.ok) throw new Error(serialized.error)

    const imported = await importBytesIntoLibrary('Insert library.dna', serialized.bytes)
    if (!imported.ok) throw new Error(imported.error)

    const stored = await getProject(imported.id)
    expect(stored?.record.dna?.documentRole).toBe('library')
    expect(stored?.record.traceFiles?.map((member) => member.fileName)).toEqual([
      'Insert A',
      'Insert B',
    ])
    expect(
      expandRestrictionInsertSources([
        { key: `database:${imported.id}`, record: stored!.record },
      ]).map((choice) => choice.record.name),
    ).toEqual(['Insert A', 'Insert B'])
  })
})
