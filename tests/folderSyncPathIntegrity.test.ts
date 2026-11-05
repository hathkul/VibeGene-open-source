import 'fake-indexeddb/auto'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { SequenceRecord } from '../src/domain/types'
import { flushPendingFolderSync } from '../src/storage/folderScopedSyncRepository'
import { createFolder } from '../src/storage/projectLibrary'
import { hashSyncSourceBytes } from '../src/storage/syncSourceHash'
import {
  db,
  getProjectFileBaseline,
  getProject,
  listFolderSyncPendingProjects,
  putFolderSyncMapping,
  saveProject,
} from '../src/storage/projects'

function record(id: string, sequence: string): SequenceRecord {
  return {
    id,
    name: 'Example-construct',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('folder sync path integrity', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterAll(async () => {
    await db.delete()
  })

  async function seedStaleMetadata() {
    const root = await createFolder('SnapGene folder')
    const cars = await createFolder('Projects', root.id)
    const planning = await createFolder('planning', cars.id)
    await putFolderSyncMapping({
      folderId: root.id,
      externalPath: '/mapped',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const original = new Uint8Array([1, 2, 3, 4])
    const baselineHash = await hashSyncSourceBytes(original)
    await saveProject(record('edited', 'ACGT'), {
      folderId: planning.id,
      fileName: 'Example-construct.gb',
      fileFormat: 'genbank',
      fileSyncState: 'synced',
      syncRelativePath: 'Projects/plannning/Example-construct.gb',
      fileBytes: original,
      baseline: {
        contentHash: baselineHash,
        semanticRecordHash: 'previous-semantic-hash',
        relativePath: 'Projects/plannning/Example-construct.gb',
      },
    })
    await saveProject(record('edited', 'ACGTA'))
    return { root, baselineHash, original }
  }

  it('writes edited bytes at the visible hierarchy path when hidden baseline path is stale', async () => {
    const { root, baselineHash, original } = await seedStaleMetadata()
    const disk = new Map<string, Uint8Array>([
      ['Projects/planning/Example-construct.gb', original],
    ])
    const writeFile = vi.fn(async (_path: string, relativePath: string, bytes: Uint8Array) => {
      disk.set(relativePath, new Uint8Array(bytes))
      return { contentHash: await hashSyncSourceBytes(bytes) }
    })
    const findFilesByContentHash = vi.fn(async () => [] as string[] | null)

    const result = await flushPendingFolderSync(root.id, {
      fileExists: async (_path, relativePath) => disk.has(relativePath),
      readFile: async (_path, relativePath) => {
        const bytes = disk.get(relativePath)
        if (!bytes) throw new Error(`Missing test file: ${relativePath}`)
        return bytes
      },
      writeFile,
      deleteFile: async (_path, relativePath) => { disk.delete(relativePath) },
      findFilesByContentHash,
    })

    expect(result).toMatchObject({ written: 1, conflicts: 0 })
    expect(writeFile).toHaveBeenCalledWith('/mapped', 'Projects/planning/Example-construct.gb', expect.any(Uint8Array))
    expect(disk.has('Projects/plannning/Example-construct.gb')).toBe(false)
    expect(await hashSyncSourceBytes(disk.get('Projects/planning/Example-construct.gb')!)).not.toBe(baselineHash)
    expect(findFilesByContentHash).not.toHaveBeenCalled()
    expect(await getProjectFileBaseline('edited')).toMatchObject({
      relativePath: 'Projects/planning/Example-construct.gb',
    })
    expect(await listFolderSyncPendingProjects(root.id)).toEqual([])
  })

  it('preserves externally edited target bytes and keeps the database change pending', async () => {
    const { root } = await seedStaleMetadata()
    const externallyEdited = new Uint8Array([9, 9, 9])
    const disk = new Map([['Projects/planning/Example-construct.gb', externallyEdited]])
    const writeFile = vi.fn(async () => ({ contentHash: 'unused' }))
    const result = await flushPendingFolderSync(root.id, {
      fileExists: async (_path, relativePath) => disk.has(relativePath),
      readFile: async (_path, relativePath) => disk.get(relativePath)!,
      writeFile,
      deleteFile: vi.fn(async () => {}),
      findFilesByContentHash: vi.fn(async () => [] as string[] | null),
    })

    expect(result).toMatchObject({ written: 0, conflicts: 1 })
    expect(writeFile).not.toHaveBeenCalled()
    expect(disk.get('Projects/planning/Example-construct.gb')).toEqual(externallyEdited)
    expect((await getProject('edited'))?.record.sequence).toBe('ACGTA')
    expect((await listFolderSyncPendingProjects(root.id)).map(({ id }) => id)).toContain('edited')
  })

  it('recovers a unique baseline match, writes the hierarchy path, then removes only the verified old file', async () => {
    const { root, baselineHash, original } = await seedStaleMetadata()
    const disk = new Map<string, Uint8Array>([['elsewhere/Example-construct.gb', original]])
    const findFilesByContentHash = vi.fn(async (_path: string, expectedHash: string) =>
      expectedHash === baselineHash ? ['elsewhere/Example-construct.gb'] : [],
    )
    const io = {
      fileExists: async (_path: string, relativePath: string) => disk.has(relativePath),
      readFile: async (_path: string, relativePath: string) => disk.get(relativePath)!,
      writeFile: async (_path: string, relativePath: string, bytes: Uint8Array) => {
        disk.set(relativePath, new Uint8Array(bytes))
        return { contentHash: await hashSyncSourceBytes(bytes) }
      },
      deleteFile: async (_path: string, relativePath: string) => { disk.delete(relativePath) },
      findFilesByContentHash,
    }

    const first = await flushPendingFolderSync(root.id, io)
    expect(first).toMatchObject({ written: 1, conflicts: 0 })
    expect(disk.has('elsewhere/Example-construct.gb')).toBe(true)
    expect(disk.has('Projects/planning/Example-construct.gb')).toBe(true)
    expect(await getProjectFileBaseline('edited')).toMatchObject({
      relativePath: 'Projects/planning/Example-construct.gb',
    })

    // The second drain pass is allowed to remove the previous source only
    // after re-reading it and proving it still has the common-baseline hash.
    await flushPendingFolderSync(root.id, io)
    expect(await hashSyncSourceBytes(disk.get('Projects/planning/Example-construct.gb')!)).not.toBe(baselineHash)
    expect(disk.has('elsewhere/Example-construct.gb')).toBe(false)
  })

  it('refuses ambiguous baseline recovery without writing or deleting either source', async () => {
    const { root, original } = await seedStaleMetadata()
    const duplicate = new Uint8Array(original)
    const disk = new Map<string, Uint8Array>([
      ['one/Example-construct.gb', original],
      ['two/Example-construct.gb', duplicate],
    ])
    const writeFile = vi.fn(async () => ({ contentHash: 'unused' }))
    const deleteFile = vi.fn(async () => {})
    const result = await flushPendingFolderSync(root.id, {
      fileExists: async (_path, relativePath) => disk.has(relativePath),
      readFile: async (_path, relativePath) => disk.get(relativePath)!,
      writeFile,
      deleteFile,
      findFilesByContentHash: async () => [...disk.keys()],
    })

    expect(result).toMatchObject({ written: 0, conflicts: 1 })
    expect(writeFile).not.toHaveBeenCalled()
    expect(deleteFile).not.toHaveBeenCalled()
    expect(disk.size).toBe(2)
    expect((await listFolderSyncPendingProjects(root.id)).map(({ id }) => id)).toContain('edited')
  })

  it('preserves a relocated source if it is externally edited before tombstone cleanup', async () => {
    const { root, original } = await seedStaleMetadata()
    const disk = new Map<string, Uint8Array>([['elsewhere/Example-construct.gb', original]])
    const editedOldSource = new Uint8Array([8, 7, 6])
    const io = {
      fileExists: async (_path: string, relativePath: string) => disk.has(relativePath),
      readFile: async (_path: string, relativePath: string) => disk.get(relativePath)!,
      writeFile: async (_path: string, relativePath: string, bytes: Uint8Array) => {
        disk.set(relativePath, new Uint8Array(bytes))
        return { contentHash: await hashSyncSourceBytes(bytes) }
      },
      deleteFile: vi.fn(async (_path: string, relativePath: string) => { disk.delete(relativePath) }),
      findFilesByContentHash: async () => ['elsewhere/Example-construct.gb'],
    }

    await flushPendingFolderSync(root.id, io)
    disk.set('elsewhere/Example-construct.gb', editedOldSource)
    const cleanup = await flushPendingFolderSync(root.id, io)

    expect(cleanup.conflicts).toBe(1)
    expect(io.deleteFile).not.toHaveBeenCalled()
    expect(disk.get('elsewhere/Example-construct.gb')).toEqual(editedOldSource)
  })

  it('keeps restart-persisted work pending when no unique baseline source can be found', async () => {
    const { root } = await seedStaleMetadata()
    db.close()
    await db.open()
    const writeFile = vi.fn(async () => ({ contentHash: 'unused' }))
    const result = await flushPendingFolderSync(root.id, {
      fileExists: async () => false,
      readFile: async () => { throw new Error('No file should be read') },
      writeFile,
      deleteFile: vi.fn(async () => {}),
      findFilesByContentHash: async () => [],
    })

    expect(result).toMatchObject({ written: 0, conflicts: 1 })
    expect(writeFile).not.toHaveBeenCalled()
    expect((await getProject('edited'))?.record.sequence).toBe('ACGTA')
    expect((await listFolderSyncPendingProjects(root.id)).map(({ id }) => id)).toContain('edited')
  })

  it('treats case-only metadata differences as the same existing file on a case-insensitive disk', async () => {
    const { root, original } = await seedStaleMetadata()
    const disk = new Map<string, Uint8Array>([['projects/Planning/Example-construct.gb', original]])
    const key = (path: string) => path.toLocaleLowerCase('en-US')
    const writePaths: string[] = []
    const result = await flushPendingFolderSync(root.id, {
      fileExists: async (_path, relativePath) => [...disk.keys()].some((candidate) => key(candidate) === key(relativePath)),
      readFile: async (_path, relativePath) => disk.get([...disk.keys()].find((candidate) => key(candidate) === key(relativePath))!)!,
      writeFile: async (_path, relativePath, bytes) => {
        writePaths.push(relativePath)
        const existing = [...disk.keys()].find((candidate) => key(candidate) === key(relativePath))
        disk.set(existing ?? relativePath, new Uint8Array(bytes))
        return { contentHash: await hashSyncSourceBytes(bytes) }
      },
      deleteFile: async (_path, relativePath) => {
        const existing = [...disk.keys()].find((candidate) => key(candidate) === key(relativePath))
        if (existing) disk.delete(existing)
      },
      findFilesByContentHash: vi.fn(async () => [] as string[] | null),
    })

    expect(result).toMatchObject({ written: 1, conflicts: 0 })
    expect(writePaths).toEqual(['Projects/planning/Example-construct.gb'])
    expect(disk.size).toBe(1)
    expect([...disk.keys()]).toEqual(['projects/Planning/Example-construct.gb'])
  })
})
