import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { SequenceRecord } from '../src/domain/types'
import { constructSyncContentKey } from '../src/storage/databaseImportSemanticHash'
import { createFolder, deleteTopLevelFolderSyncMapping } from '../src/storage/projectLibrary'
import {
  acknowledgeFolderSyncPending,
  acceptProjectFileSync,
  db,
  listFolderSyncPendingProjects,
  getProjectFileBaseline,
  hasPendingFolderSyncWork,
  putFolderSyncMapping,
  saveProject,
} from '../src/storage/projects'

function record(id: string, name: string): SequenceRecord {
  return {
    id,
    name,
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ACGT',
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('folder sync pending outbox', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterAll(async () => {
    await db.delete()
  })

  it('queues mapped-root edits durably and coalesces repeated saves to the latest project state', async () => {
    const root = await createFolder('Mapped library')
    const nested = await createFolder('Nested', root.id)
    await putFolderSyncMapping({
      folderId: root.id,
      externalPath: '/mapped',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    await saveProject(record('project-a', 'First name'), { folderId: nested.id })
    await saveProject(record('project-a', 'Latest name'), { folderId: nested.id })
    await saveProject(record('project-b', 'Other construct'), { folderId: root.id })

    expect((await listFolderSyncPendingProjects(root.id)).map(({ id, name }) => [id, name]))
      .toEqual([
        ['project-a', 'Latest name'],
        ['project-b', 'Other construct'],
      ])

    db.close()
    await db.open()
    expect((await listFolderSyncPendingProjects(root.id)).map(({ id }) => id))
      .toEqual(['project-a', 'project-b'])
  })

  it('keeps pending work scoped to its mapped root and removes only acknowledged work', async () => {
    const firstRoot = await createFolder('First')
    const secondRoot = await createFolder('Second')
    await Promise.all([firstRoot, secondRoot].map((root) => putFolderSyncMapping({
      folderId: root.id,
      externalPath: `/mapped/${root.name}`,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })))

    await saveProject(record('project-a', 'First project'), { folderId: firstRoot.id })
    await saveProject(record('project-b', 'Second project'), { folderId: secondRoot.id })
    await acknowledgeFolderSyncPending(firstRoot.id, 'project-a')

    await expect(listFolderSyncPendingProjects(firstRoot.id)).resolves.toEqual([])
    expect((await listFolderSyncPendingProjects(secondRoot.id)).map(({ id }) => id))
      .toEqual(['project-b'])
  })

  it('clears queued sync work transactionally when its mapping is explicitly removed', async () => {
    const root = await createFolder('Mapped')
    await putFolderSyncMapping({
      folderId: root.id,
      externalPath: '/mapped',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    await saveProject(record('project-a', 'Pending project'), { folderId: root.id })
    expect(await hasPendingFolderSyncWork(root.id)).toBe(true)

    await expect(deleteTopLevelFolderSyncMapping(root.id)).resolves.toBe(true)

    expect(await listFolderSyncPendingProjects(root.id)).toEqual([])
    expect(await hasPendingFolderSyncWork()).toBe(false)
    expect(await db.projects.get('project-a')).toMatchObject({ fileSyncState: 'local-only' })
  })

  it('does not acknowledge an older write when a newer edit was saved during the flush', async () => {
    const root = await createFolder('Mapped library')
    await putFolderSyncMapping({
      folderId: root.id,
      externalPath: '/mapped',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    const writtenRecord = await saveProject(record('project-a', 'Version one'), { folderId: root.id })
    await saveProject(record('project-a', 'Version two'), { folderId: root.id })

    await acceptProjectFileSync({
      projectId: 'project-a',
      rootFolderId: root.id,
      relativePath: 'Version one.dna',
      bytes: new Uint8Array([1, 2, 3]),
      contentHash: 'older-write-hash',
      semanticRecordHash: 'older-semantic-hash',
      sourceUpdatedAt: writtenRecord.updatedAt,
      sourceContentKey: constructSyncContentKey(writtenRecord),
    })

    expect((await listFolderSyncPendingProjects(root.id)).map(({ name }) => name))
      .toEqual(['Version two'])
    await expect(getProjectFileBaseline('project-a')).resolves.toBeNull()
  })
})
