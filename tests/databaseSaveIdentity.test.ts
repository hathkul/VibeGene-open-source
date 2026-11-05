import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { chooseDatabaseCopyFileName, prepareDatabaseProjectSave } from '../src/domain/projectSaveSemantics'
import type { SequenceRecord } from '../src/domain/types'
import { createFolder } from '../src/storage/projectLibrary'
import { db, getProject, listProjectSummaries, saveProject } from '../src/storage/projects'

function record(id: string, sequence = 'ATGC'): SequenceRecord {
  return {
    id,
    name: 'Example construct',
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('database save identity', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterAll(async () => {
    await db.delete()
  })

  it('updates Save in place without changing its Database folder or creating a second entry', async () => {
    const folder = await createFolder('Maps')
    await saveProject(record('original'), {
      folderId: folder.id,
      fileName: 'example.dna',
      fileFormat: 'snapgene',
    })

    await saveProject(record('original', 'ATGCA'), {
      folderId: folder.id,
      fileName: 'example.dna',
      fileFormat: 'snapgene',
    })

    expect(await listProjectSummaries()).toHaveLength(1)
    await expect(getProject('original')).resolves.toMatchObject({
      folderId: folder.id,
      fileName: 'example.dna',
      record: { sequence: 'ATGCA' },
    })
  })

  it('persists a Save to copy with a new identity while retaining the original entry', async () => {
    const folder = await createFolder('Maps')
    const original = record('original')
    await saveProject(original, {
      folderId: folder.id,
      fileName: 'example.dna',
      fileFormat: 'snapgene',
      fileBytes: new Uint8Array([1]),
    })
    const copyFileName = chooseDatabaseCopyFileName('example.dna', ['example.dna'], 'dna')
    expect(copyFileName).toBe('example (2).dna')
    const prepared = prepareDatabaseProjectSave({
      record: { ...original, sequence: 'ATGCA' },
      existing: {
        id: 'original',
        folderId: folder.id,
        fileName: 'example.dna',
        fileFormat: 'snapgene',
      },
      decision: 'copy',
      bytes: new Uint8Array([2]),
      copyFileName,
      freshProjectId: 'copy',
      createdAt: '2026-01-02T00:00:00.000Z',
    })

    await saveProject(prepared.record, {
      folderId: prepared.folderId,
      fileName: prepared.fileName,
      fileFormat: prepared.fileFormat,
      fileBytes: prepared.fileBytes,
      fileSyncState: prepared.fileSyncState,
      fileProvenance: prepared.fileProvenance,
      syncSourceHash: null,
      syncRelativePath: null,
      baseline: null,
    })

    expect(await listProjectSummaries()).toHaveLength(2)
    await expect(getProject('original')).resolves.toMatchObject({
      folderId: folder.id,
      fileName: 'example.dna',
      record: { sequence: 'ATGC' },
    })
    await expect(getProject('copy')).resolves.toMatchObject({
      folderId: folder.id,
      fileName: 'example (2).dna',
      fileSyncState: 'local-only',
      record: { sequence: 'ATGCA' },
    })
  })

  it('atomically rejects a save based on a stale database revision', async () => {
    const saved = await saveProject(record('shared'))
    const concurrent = { ...saved, sequence: 'AAAA', updatedAt: '2099-01-01T00:00:00.000Z' }
    await db.projectRecords.put({ id: 'shared', record: concurrent })

    await expect(saveProject(
      { ...saved, sequence: 'CCCC' },
      { expectedProjectUpdatedAt: saved.updatedAt },
    )).rejects.toThrow('changed in another window')
    await expect(getProject('shared')).resolves.toMatchObject({ record: { sequence: 'AAAA' } })
  })
})
