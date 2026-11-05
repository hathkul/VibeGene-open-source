import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { SequenceRecord } from '../src/domain/types'
import {
  createFolderScopedSyncRepositoryDependencies,
  flushPendingFolderSync,
  reconcileMappedFolder,
  restoreLegacyImportedFolderSyncBaselines,
} from '../src/storage/folderScopedSyncRepository'
import { importBytesIntoLibrary } from '../src/storage/databaseImport'
import { createFolder, renameProjectFileName, setTopLevelFolderSyncMapping } from '../src/storage/projectLibrary'
import { hashSyncSourceBytes } from '../src/storage/syncSourceHash'
import {
  db,
  listFolderSyncPendingProjects,
  getProjectFileBaseline,
  getProject,
  listProjectFileTombstones,
  putFolderSyncMapping,
  putProjectFileTombstone,
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

describe('folder sync path lifecycle', () => {
  it('reconciles a renamed mapped record and a subsequent sequence edit without reimporting the old path', async () => {
    const root = await createFolder('Rename mirror regression')
    const source = new TextEncoder().encode('>original\nACGTACGT\n')
    const imported = await importBytesIntoLibrary('original.fa', source, {
      folderId: root.id, syncRelativePath: 'original.fa',
      contentHash: await hashSyncSourceBytes(source),
    })
    if (!imported.ok) throw new Error(imported.error)
    await setTopLevelFolderSyncMapping(root.id, '/isolated', { importedContentsAreBaseline: true })
    const disk = new Map([['original.fa', source]])
    const io = {
      fileExists: async (_root: string, path: string) => disk.has(path),
      readFile: async (_root: string, path: string) => {
        const bytes = disk.get(path)
        if (!bytes) throw new Error(`Missing ${path}`)
        return bytes
      },
      writeFile: async (_root: string, path: string, bytes: Uint8Array) => {
        disk.set(path, bytes)
        return { contentHash: await hashSyncSourceBytes(bytes) }
      },
      deleteFile: async (_root: string, path: string) => { disk.delete(path) },
      scanFolder: async () => ({
        diskFiles: await Promise.all([...disk].map(async ([relativePath, bytes]) => ({
          relativePath, bytes: new Uint8Array(), contentHash: await hashSyncSourceBytes(bytes),
        }))),
        primerListFiles: [],
      }),
    }
    await renameProjectFileName(imported.id, 'renamed.fa', 'Renamed construct')
    expect((await reconcileMappedFolder(root.id, io)).failures).toEqual([])
    expect([...disk.keys()]).toEqual(['renamed.fa'])
    expect(new TextDecoder().decode(disk.get('renamed.fa'))).toContain('ACGTACGT')
    const project = await getProject(imported.id)
    if (!project) throw new Error('Missing Database record')
    await saveProject({ ...project.record, sequence: 'TTTTACGTACGT' }, { folderId: root.id })
    expect((await reconcileMappedFolder(root.id, io)).failures).toEqual([])
    expect(new TextDecoder().decode(disk.get('renamed.fa'))).toContain('TTTTACGTACGT')
    expect(await listProjectFileTombstones(root.id)).toEqual([])
  })
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterAll(async () => {
    await db.delete()
  })

  it('queues existing local constructs when a mapped folder is first assigned', async () => {
    const root = await createFolder('Existing library')
    await saveProject(record('existing', 'Existing construct'), { folderId: root.id })

    await setTopLevelFolderSyncMapping(root.id, '/mapped')

    expect((await listFolderSyncPendingProjects(root.id)).map(({ id }) => id))
      .toEqual(['existing'])
  })

  it('keeps imported file baselines and does not queue them when their source folder is first mapped', async () => {
    const root = await createFolder('Imported library')
    const sourceBytes = new Uint8Array([1, 2, 3])
    const sourceHash = await hashSyncSourceBytes(sourceBytes)
    await saveProject(record('imported', 'Imported construct'), {
      folderId: root.id,
      fileName: 'imported.gb',
      fileBytes: sourceBytes,
      fileSyncState: 'synced',
      syncRelativePath: 'nested/imported.gb',
      baseline: {
        contentHash: sourceHash,
        semanticRecordHash: 'semantic-hash',
        relativePath: 'nested/imported.gb',
      },
    })

    await setTopLevelFolderSyncMapping(root.id, '/imported-source', {
      importedContentsAreBaseline: true,
    })

    expect(await listFolderSyncPendingProjects(root.id)).toEqual([])
    expect(await getProjectFileBaseline('imported')).toMatchObject({
      contentHash: sourceHash,
      relativePath: 'nested/imported.gb',
    })
    expect(await getProject('imported')).toMatchObject({
      fileSyncState: 'synced',
      syncRelativePath: 'nested/imported.gb',
    })
  })

  it('repairs legacy imported queues from retained bytes without reading or writing source files', async () => {
    const root = await createFolder('Imported library')
    const bytes = new TextEncoder().encode('>legacy\nACGTACGT\n')
    const imported = await importBytesIntoLibrary('legacy.fa', bytes, {
      folderId: root.id,
      syncRelativePath: 'legacy.fa',
    })
    expect(imported.ok).toBe(true)
    if (!imported.ok) return

    await setTopLevelFolderSyncMapping(root.id, '/imported-source', {
      lastSyncedAt: new Date().toISOString(),
    })
    expect((await listFolderSyncPendingProjects(root.id)).map(({ id }) => id)).toEqual([imported.id])

    await expect(restoreLegacyImportedFolderSyncBaselines(root.id)).resolves.toBe(1)

    expect(await listFolderSyncPendingProjects(root.id)).toEqual([])
    expect(await getProject(imported.id)).toMatchObject({
      fileSyncState: 'synced',
      fileProvenance: 'sync-folder',
      syncRelativePath: 'legacy.fa',
    })
    expect(await getProjectFileBaseline(imported.id)).toMatchObject({
      relativePath: 'legacy.fa',
      contentHash: await hashSyncSourceBytes(bytes),
    })
  })

  it('keeps legacy imported work queued when the construct changed after import', async () => {
    const root = await createFolder('Imported library')
    const bytes = new TextEncoder().encode('>legacy\nACGTACGT\n')
    const imported = await importBytesIntoLibrary('legacy.fa', bytes, {
      folderId: root.id,
      syncRelativePath: 'legacy.fa',
    })
    expect(imported.ok).toBe(true)
    if (!imported.ok) return

    await setTopLevelFolderSyncMapping(root.id, '/imported-source', {
      lastSyncedAt: new Date().toISOString(),
    })
    const project = await getProject(imported.id)
    expect(project).not.toBeNull()
    await saveProject({ ...project!.record, sequence: 'TTTTTTTT' })

    await expect(restoreLegacyImportedFolderSyncBaselines(root.id)).resolves.toBe(0)
    expect((await listFolderSyncPendingProjects(root.id)).map(({ id }) => id)).toEqual([imported.id])
    expect(await getProjectFileBaseline(imported.id)).toBeNull()
  })

  it('queues a renamed file and records its previous synced path for safe cleanup', async () => {
    const root = await createFolder('Mapped')
    await putFolderSyncMapping({
      folderId: root.id,
      externalPath: '/mapped',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    await saveProject(record('rename-me', 'Construct'), {
      folderId: root.id,
      fileName: 'old.dna',
      fileSyncState: 'synced',
      syncRelativePath: 'old.dna',
      baseline: {
        contentHash: 'old-hash',
        semanticRecordHash: 'old-semantic-hash',
        relativePath: 'old.dna',
      },
    })

    await renameProjectFileName('rename-me', 'new.dna')

    expect((await listFolderSyncPendingProjects(root.id)).map(({ id }) => id))
      .toEqual(['rename-me'])
    expect(await listProjectFileTombstones(root.id)).toEqual([
      expect.objectContaining({
        relativePath: 'old.dna',
        reason: 'path-change',
        contentHash: 'old-hash',
      }),
    ])
  })

  it('deletes a path-change tombstone only when disk bytes still match its recorded hash', async () => {
    const root = await createFolder('Mapped')
    await putFolderSyncMapping({
      folderId: root.id,
      externalPath: '/mapped',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const originalBytes = new Uint8Array([1, 2, 3])
    const originalHash = await hashSyncSourceBytes(originalBytes)
    await saveProject(record('committed-rename', 'Renamed'), {
      folderId: root.id, fileName: 'new.dna', fileSyncState: 'synced',
      baseline: { contentHash: originalHash, semanticRecordHash: 'unchanged', relativePath: 'new.dna' },
    })
    await putProjectFileTombstone({
      rootFolderId: root.id,
      relativePath: 'old.dna',
      projectId: 'committed-rename',
      fileName: 'old.dna',
      fileFormat: 'snapgene',
      deletedAt: '2026-01-01T00:00:00.000Z',
      contentHash: originalHash,
      reason: 'path-change',
    })
    const deleteFile = vi.fn(async () => {})
    const io = {
      fileExists: async () => true,
      readFile: async () => originalBytes,
      writeFile: async () => ({ contentHash: originalHash }),
      deleteFile,
    }

    const result = await flushPendingFolderSync(root.id, io)

    expect(result.conflicts).toBe(0)
    expect(deleteFile).toHaveBeenCalledWith('/mapped', 'old.dna')
    expect(await listProjectFileTombstones(root.id)).toEqual([])
  })

  it('retains a path-change tombstone as a conflict when disk bytes were edited', async () => {
    const root = await createFolder('Mapped')
    await putFolderSyncMapping({
      folderId: root.id,
      externalPath: '/mapped',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const originalBytes = new Uint8Array([1, 2, 3])
    await saveProject(record('committed-rename', 'Renamed'), {
      folderId: root.id, fileName: 'new.dna', fileSyncState: 'synced',
      baseline: { contentHash: await hashSyncSourceBytes(originalBytes), semanticRecordHash: 'unchanged', relativePath: 'new.dna' },
    })
    await putProjectFileTombstone({
      rootFolderId: root.id,
      relativePath: 'old.dna',
      projectId: 'committed-rename',
      fileName: 'old.dna',
      fileFormat: 'snapgene',
      deletedAt: '2026-01-01T00:00:00.000Z',
      contentHash: await hashSyncSourceBytes(originalBytes),
      reason: 'path-change',
    })
    const deleteFile = vi.fn(async () => {})
    const io = {
      fileExists: async () => true,
      readFile: async (_root: string, path: string) => path === 'new.dna' ? originalBytes : new Uint8Array([9, 8, 7]),
      writeFile: async () => ({ contentHash: 'unused' }),
      deleteFile,
    }

    const result = await flushPendingFolderSync(root.id, io)

    expect(result.conflicts).toBe(1)
    expect(deleteFile).not.toHaveBeenCalled()
    expect(await listProjectFileTombstones(root.id)).toHaveLength(1)
  })

  it('does not replace the active path baseline when a rename happens during a write', async () => {
    const root = await createFolder('Mapped')
    await putFolderSyncMapping({
      folderId: root.id,
      externalPath: '/mapped',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const diskBytes = new Uint8Array([1, 2, 3])
    const diskHash = await hashSyncSourceBytes(diskBytes)
    await saveProject(record('rename-race', 'Before'), {
      folderId: root.id,
      fileName: 'before.dna',
      fileSyncState: 'synced',
      syncSourceHash: diskHash,
      syncRelativePath: 'before.dna',
      baseline: { contentHash: diskHash, semanticRecordHash: 'old', relativePath: 'before.dna' },
    })
    await saveProject(record('rename-race', 'Edited'), { folderId: root.id })
    const io = {
      fileExists: async () => true,
      readFile: async () => diskBytes,
      writeFile: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        await renameProjectFileName('rename-race', 'after.dna')
        return { contentHash: diskHash }
      },
      deleteFile: vi.fn(async () => {}),
    }

    await flushPendingFolderSync(root.id, io)

    expect((await getProject('rename-race'))?.fileName).toBe('after.dna')
    expect(await getProjectFileBaseline('rename-race')).toBeNull()
    expect((await listFolderSyncPendingProjects(root.id)).map(({ id }) => id))
      .toContain('rename-race')
  })

  it('writes to the current Database hierarchy and repairs a stale hidden sync path', async () => {
    const root = await createFolder('Mapped')
    const currentFolder = await createFolder('planning', root.id)
    await putFolderSyncMapping({
      folderId: root.id,
      externalPath: '/mapped',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const originalBytes = new Uint8Array([1, 2, 3])
    const originalHash = await hashSyncSourceBytes(originalBytes)
    await saveProject(record('stale-path', 'Construct'), {
      folderId: currentFolder.id,
      fileName: 'construct.dna',
      fileSyncState: 'modified',
      syncRelativePath: 'plannning/construct.dna',
      baseline: {
        contentHash: originalHash,
        semanticRecordHash: 'previous-semantic-hash',
        relativePath: 'plannning/construct.dna',
      },
    })

    const writes: string[] = []
    const findFilesByContentHash = vi.fn(async () => [] as string[])
    const io = {
      fileExists: async (_path: string, relativePath: string) =>
        relativePath === 'planning/construct.dna',
      readFile: async () => originalBytes,
      writeFile: async (_path: string, relativePath: string, bytes: Uint8Array) => {
        writes.push(relativePath)
        return { contentHash: await hashSyncSourceBytes(bytes) }
      },
      findFilesByContentHash,
      deleteFile: vi.fn(async () => {}),
    }

    const result = await flushPendingFolderSync(root.id, io)

    expect(result.written).toBe(1)
    expect(result.conflicts).toBe(0)
    expect(writes).toEqual(['planning/construct.dna'])
    expect(findFilesByContentHash).not.toHaveBeenCalled()
    expect((await getProject('stale-path'))?.syncRelativePath).toBe('planning/construct.dna')
    expect((await getProjectFileBaseline('stale-path'))?.relativePath).toBe('planning/construct.dna')
  })

  it('uses the current hierarchy for outbound preflight while preserving historical inbound matching', async () => {
    const root = await createFolder('Mapped')
    const currentFolder = await createFolder('planning', root.id)
    await putFolderSyncMapping({
      folderId: root.id,
      externalPath: '/mapped',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    await saveProject(record('preflight-path', 'Construct'), {
      folderId: currentFolder.id,
      fileName: 'construct.dna',
      fileSyncState: 'modified',
      syncRelativePath: 'plannning/construct.dna',
      baseline: {
        contentHash: 'source-hash',
        semanticRecordHash: 'source-semantic-hash',
        relativePath: 'plannning/construct.dna',
      },
    })
    const dependencies = createFolderScopedSyncRepositoryDependencies({
      scanFolder: async () => ({ diskFiles: [], primerListFiles: [] }),
      readFile: async () => new Uint8Array(),
      writeFile: async () => ({ contentHash: 'unused' }),
    })

    const outbound = await dependencies.loadScope(root.id, 'to')
    const inbound = await dependencies.loadScope(root.id, 'from')

    expect(outbound.dbFiles[0]?.relativePath).toBe('planning/construct.dna')
    expect(inbound.dbFiles[0]?.relativePath).toBe('plannning/construct.dna')
  })
})
