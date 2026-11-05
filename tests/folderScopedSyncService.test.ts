import { describe, expect, it } from 'vitest'
import {
  createFolderScopedSyncService,
  folderScopedSyncConflictChoices,
  folderScopedSyncConflictId,
  isFolderScopedSyncConflictResolvable,
  type FolderScopedSyncDependencies,
  type FolderScopedSyncScannedFile,
  type FolderScopedSyncScope,
} from '../src/storage/folderScopedSyncService'
import { hashSyncSourceBytes } from '../src/storage/syncSourceHash'

const encoder = new TextEncoder()

async function scanned(
  relativePath: string,
  text: string,
): Promise<FolderScopedSyncScannedFile> {
  const bytes = encoder.encode(text)
  return {
    relativePath,
    bytes,
    contentHash: await hashSyncSourceBytes(bytes),
  }
}

function scope(
  partial: Partial<FolderScopedSyncScope> = {},
): FolderScopedSyncScope {
  return {
    folderId: 'root',
    externalPath: '/mapped/root',
    dbFiles: [],
    tombstones: [],
    ...partial,
  }
}

function fakeDependencies(
  syncScope: FolderScopedSyncScope,
  diskFiles: FolderScopedSyncScannedFile[],
  primerListFiles: FolderScopedSyncScannedFile[] = [],
) {
  const disk = new Map(
    [...diskFiles, ...primerListFiles].map((file) => [file.relativePath, new Uint8Array(file.bytes)]),
  )
  const calls: string[] = []
  const added: FolderScopedSyncScannedFile[] = []
  const updated: Array<{ projectId: string; file: FolderScopedSyncScannedFile }> = []
  const accepted: Array<{ relativePath: string; bytes: Uint8Array }> = []
  const removed: string[] = []
  const conflictCopies: Array<{ projectId: string; relativePath: string; bytes: Uint8Array }> = []
  const diskDeletions: Array<{ projectId: string; relativePath: string; contentHash: string }> = []
  const clearedDiskDeletions: string[] = []
  const primerSyncs: FolderScopedSyncScannedFile[][] = []
  let failWrite = false

  const dependencies: FolderScopedSyncDependencies = {
    async loadScope(folderId) {
      expect(folderId).toBe('root')
      return syncScope
    },
    async scanFolder(path) {
      expect(path).toBe('/mapped/root')
      return { diskFiles, primerListFiles }
    },
    async readFile(_path, relativePath) {
      const bytes = disk.get(relativePath)
      if (!bytes) throw new Error('missing virtual file')
      return new Uint8Array(bytes)
    },
    async writeFile(_path, relativePath, bytes) {
      calls.push(`write:${relativePath}`)
      if (failWrite) throw new Error('virtual write failed')
      disk.set(relativePath, new Uint8Array(bytes))
      return { contentHash: await hashSyncSourceBytes(bytes) }
    },
    async addToDb(_folderId, file) {
      calls.push(`add:${file.relativePath}`)
      added.push({ ...file, bytes: new Uint8Array(file.bytes) })
      return `added-${added.length}`
    },
    async updateDb(projectId, _folderId, file) {
      calls.push(`update:${projectId}`)
      updated.push({ projectId, file: { ...file, bytes: new Uint8Array(file.bytes) } })
    },
    async getDatabaseWrite(projectId, relativePath) {
      return {
        projectId,
        relativePath,
        bytes: encoder.encode(`database:${projectId}`),
        semanticRecordHash: 'semantic-current',
      }
    },
    async acceptDatabaseWrite(write) {
      calls.push(`accept:${write.relativePath}`)
      accepted.push({
        relativePath: write.relativePath,
        bytes: new Uint8Array(write.bytes),
      })
    },
    async removeFromDb(projectId) {
      calls.push(`remove:${projectId}`)
      removed.push(projectId)
    },
    async syncPrimerLists(_folderId, files, options) {
      calls.push(`primers:${files.length}:${options.cleanup ? 'cleanup' : 'keep'}`)
      primerSyncs.push([...files])
      return {
        listsSaved: files.length,
        primersSaved: files.length,
        listsRemoved: 0,
        primersRemoved: 0,
      }
    },
    async markSynced() {
      calls.push('mark-synced')
    },
    async createConflictCopy(input) {
      calls.push(`copy:${input.relativePath}`)
      conflictCopies.push({
        projectId: input.projectId,
        relativePath: input.relativePath,
        bytes: new Uint8Array(input.bytes),
      })
      return {
        projectId: `copy-${conflictCopies.length}`,
        relativePath: input.relativePath,
        bytes: new Uint8Array(input.bytes),
        semanticRecordHash: input.semanticRecordHash,
      }
    },
    async removeConflictCopy(projectId) {
      calls.push(`remove-copy:${projectId}`)
    },
    async recordDiskDeletion(input) {
      calls.push(`disk-delete:${input.relativePath}`)
      diskDeletions.push(input)
    },
    async clearDiskDeletion(_projectId, _folderId, relativePath) {
      clearedDiskDeletions.push(relativePath)
    },
  }
  return {
    service: createFolderScopedSyncService(dependencies),
    dependencies,
    calls,
    added,
    updated,
    accepted,
    removed,
    conflictCopies,
    diskDeletions,
    clearedDiskDeletions,
    primerSyncs,
    disk,
    setFailWrite(value: boolean) {
      failWrite = value
    },
  }
}

describe('folder-scoped sync service', () => {
  it('reconciles a disk-only edit into the existing Database record', async () => {
    const baseline = await scanned('plasmid.gb', 'baseline')
    const edited = await scanned('plasmid.gb', 'edited on disk')
    const fake = fakeDependencies(scope({
      dbFiles: [{
        projectId: 'linked', relativePath: baseline.relativePath, fileName: 'plasmid.gb',
        syncState: 'synced', semanticRecordHash: 'same',
        baselineDiskHash: baseline.contentHash, baselineSemanticRecordHash: 'same',
      }],
    }), [edited])

    const result = await fake.service.reconcileMapped('root')

    expect(result).toMatchObject({ importedFromDisk: 1, writtenToDisk: 0, conflictCopies: 0, failures: [] })
    expect(fake.updated).toHaveLength(1)
    expect(fake.updated[0]?.file.bytes).toEqual(edited.bytes)
  })

  it('writes a Database-only edit to the mapped disk path', async () => {
    const baseline = await scanned('plasmid.gb', 'baseline')
    const fake = fakeDependencies(scope({
      dbFiles: [{
        projectId: 'linked', relativePath: baseline.relativePath, fileName: 'plasmid.gb',
        syncState: 'modified', semanticRecordHash: 'changed',
        baselineDiskHash: baseline.contentHash, baselineSemanticRecordHash: 'baseline-semantic',
      }],
    }), [baseline])

    const result = await fake.service.reconcileMapped('root')

    expect(result).toMatchObject({ importedFromDisk: 0, writtenToDisk: 1, conflictCopies: 0, failures: [] })
    expect(fake.disk.get('plasmid.gb')).toEqual(encoder.encode('database:linked'))
    expect(fake.accepted).toHaveLength(1)
  })

  it('records a disk deletion without removing the retained Database record', async () => {
    const baseline = await scanned('plasmid.gb', 'baseline')
    const fake = fakeDependencies(scope({
      dbFiles: [{
        projectId: 'linked', relativePath: baseline.relativePath, fileName: 'plasmid.gb',
        syncState: 'synced', semanticRecordHash: 'same',
        baselineDiskHash: baseline.contentHash, baselineSemanticRecordHash: 'same',
      }],
    }), [])

    const result = await fake.service.reconcileMapped('root')

    expect(result.diskDeleted).toBe(1)
    expect(fake.diskDeletions).toEqual([{
      projectId: 'linked', folderId: 'root', relativePath: 'plasmid.gb', contentHash: baseline.contentHash,
    }])
    expect(fake.removed).toEqual([])
  })

  it('clears a disk-deletion tombstone when the file is restored and reconciles it', async () => {
    const baseline = await scanned('plasmid.gb', 'baseline')
    const restored = await scanned('plasmid.gb', 'restored externally')
    const fake = fakeDependencies(scope({
      dbFiles: [{
        projectId: 'linked', relativePath: baseline.relativePath, fileName: 'plasmid.gb',
        syncState: 'synced', semanticRecordHash: 'same',
        baselineDiskHash: baseline.contentHash, baselineSemanticRecordHash: 'same',
      }],
      tombstones: [{ relativePath: 'plasmid.gb', projectId: 'linked', contentHash: baseline.contentHash, reason: 'disk-delete' }],
    }), [restored])

    const result = await fake.service.reconcileMapped('root')

    expect(result.importedFromDisk).toBe(1)
    expect(fake.updated[0]?.file.bytes).toEqual(restored.bytes)
    expect(fake.clearedDiskDeletions).toEqual(['plasmid.gb'])
  })

  it('leaves a common-baseline file unchanged', async () => {
    const baseline = await scanned('plasmid.gb', 'baseline')
    const fake = fakeDependencies(scope({
      dbFiles: [{
        projectId: 'linked', relativePath: baseline.relativePath, fileName: 'plasmid.gb',
        syncState: 'synced', semanticRecordHash: 'same',
        baselineDiskHash: baseline.contentHash, baselineSemanticRecordHash: 'same',
      }],
    }), [baseline])

    const result = await fake.service.reconcileMapped('root')

    expect(result).toMatchObject({ unchanged: 1, importedFromDisk: 0, writtenToDisk: 0, failures: [] })
    expect(fake.calls).toEqual(['mark-synced'])
  })

  it('preserves simultaneous edits as a timestamped copy and adopts the disk version', async () => {
    const baseline = await scanned('plasmid.gb', 'baseline')
    const editedOnDisk = await scanned('plasmid.gb', 'disk edit')
    const fake = fakeDependencies(scope({
      dbFiles: [{
        projectId: 'linked', relativePath: baseline.relativePath, fileName: 'plasmid.gb',
        syncState: 'modified', semanticRecordHash: 'database-edit',
        baselineDiskHash: baseline.contentHash, baselineSemanticRecordHash: 'baseline-semantic',
      }],
    }), [editedOnDisk])
    fake.service = createFolderScopedSyncService({
      ...fake.dependencies,
      now: () => new Date('2026-10-24T09:05:07.000Z'),
    })

    const result = await fake.service.reconcileMapped('root')

    expect(result).toMatchObject({ conflictCopies: 1, importedFromDisk: 0, failures: [] })
    expect(fake.conflictCopies[0]?.relativePath).toBe("plasmid VibeGene's conflicted copy 2026-10-24 09-05-07.gb")
    expect(fake.conflictCopies[0]?.bytes).toEqual(encoder.encode('database:linked'))
    expect(fake.disk.get(fake.conflictCopies[0]!.relativePath)).toEqual(fake.conflictCopies[0]?.bytes)
    expect(fake.accepted.some((write) => write.relativePath === fake.conflictCopies[0]?.relativePath)).toBe(true)
    expect(fake.updated[0]?.file.bytes).toEqual(editedOnDisk.bytes)
  })

  it('removes the staged Database copy if its disk write fails', async () => {
    const baseline = await scanned('plasmid.gb', 'baseline')
    const editedOnDisk = await scanned('plasmid.gb', 'disk edit')
    const fake = fakeDependencies(scope({
      dbFiles: [{
        projectId: 'linked', relativePath: baseline.relativePath, fileName: 'plasmid.gb',
        syncState: 'modified', semanticRecordHash: 'database-edit',
        baselineDiskHash: baseline.contentHash, baselineSemanticRecordHash: 'baseline-semantic',
      }],
    }), [editedOnDisk])
    fake.setFailWrite(true)

    const result = await fake.service.reconcileMapped('root')

    expect(result.failures).toHaveLength(1)
    expect(fake.calls).toContain('remove-copy:copy-1')
    expect(fake.updated).toHaveLength(0)
  })

  it('marks path collisions as requiring manual repair', () => {
    expect(
      isFolderScopedSyncConflictResolvable({
        projectId: 'project',
        reason: 'both-changed',
      }, 'from'),
    ).toBe(true)
    expect(
      isFolderScopedSyncConflictResolvable({
        projectId: 'project',
        reason: 'database-path-collision',
      }, 'to'),
    ).toBe(false)
    expect(
      isFolderScopedSyncConflictResolvable({
        projectId: null,
        reason: 'disk-path-collision',
      }, 'from'),
    ).toBe(false)
    expect(
      isFolderScopedSyncConflictResolvable(
        {
          projectId: 'project',
          reason: 'database-changed-disk-missing',
        },
        'from',
      ),
    ).toBe(true)
    expect(
      isFolderScopedSyncConflictResolvable(
        {
          projectId: 'project',
          reason: 'database-changed-disk-missing',
        },
        'from',
        true,
      ),
    ).toBe(true)
    expect(
      folderScopedSyncConflictChoices(
        { projectId: 'project', reason: 'missing-baseline' },
        'from',
        false,
        false,
      ),
    ).toEqual(['database'])
    expect(
      folderScopedSyncConflictChoices(
        { projectId: 'project', reason: 'missing-baseline' },
        'from',
        true,
        false,
      ),
    ).toEqual(['database', 'filesystem'])
  })

  it('imports a newly created disk file with exact bytes and never deletes disk files', async () => {
    const file = await scanned('new/sample.gb', 'LOCUS exact\r\nORIGIN\r\n//\r\n')
    const fake = fakeDependencies(scope(), [file])
    const preflight = await fake.service.preflight('root', { direction: 'from' })
    const result = await fake.service.apply(preflight)

    expect(result.addedToDb).toBe(1)
    expect(fake.added[0]?.bytes).toEqual(file.bytes)
    expect(fake.disk.get(file.relativePath)).toEqual(file.bytes)
    expect(fake.calls).toEqual(['add:new/sample.gb', 'mark-synced'])
  })

  it('creates a brand-new filesystem file and accepts metadata only after verified write', async () => {
    const fake = fakeDependencies(
      scope({
        dbFiles: [
          {
            projectId: 'local',
            relativePath: 'nested/local.dna',
            fileName: 'local.dna',
            syncState: 'local-only',
            semanticRecordHash: 'semantic-current',
          },
        ],
      }),
      [],
    )
    const result = await fake.service.apply(
      await fake.service.preflight('root', { direction: 'to' }),
    )

    expect(result.writtenToDisk).toBe(1)
    expect(fake.calls).toEqual([
      'write:nested/local.dna',
      'accept:nested/local.dna',
      'mark-synced',
    ])
    expect(fake.disk.get('nested/local.dna')).toEqual(encoder.encode('database:local'))
  })

  it('never writes a local-only database row during inbound sync', async () => {
    const fake = fakeDependencies(
      scope({
        dbFiles: [
          {
            projectId: 'local',
            relativePath: 'local.dna',
            fileName: 'local.dna',
            syncState: 'local-only',
            semanticRecordHash: 'semantic-current',
          },
        ],
      }),
      [],
    )

    const result = await fake.service.apply(
      await fake.service.preflight('root', { direction: 'from' }),
    )

    expect(result.writtenToDisk).toBe(0)
    expect(result.ignored).toBe(1)
    expect(fake.calls).toEqual(['mark-synced'])
  })

  it('never imports a disk-only file during outbound sync', async () => {
    const file = await scanned('disk-only.gb', 'disk bytes')
    const fake = fakeDependencies(scope(), [file])

    const result = await fake.service.apply(
      await fake.service.preflight('root', { direction: 'to' }),
    )

    expect(result.addedToDb).toBe(0)
    expect(result.updatedInDb).toBe(0)
    expect(result.ignored).toBe(1)
    expect(fake.calls).toEqual(['mark-synced'])
  })

  it('removes missing linked rows only for inbound cleanup', async () => {
    const syncScope = scope({
      dbFiles: [
        {
          projectId: 'linked',
          relativePath: 'missing.gb',
          fileName: 'missing.gb',
          syncState: 'synced',
          semanticRecordHash: 'semantic-baseline',
          baselineDiskHash: 'disk-baseline',
          baselineSemanticRecordHash: 'semantic-baseline',
        },
      ],
    })
    const keep = fakeDependencies(syncScope, [])
    const keepResult = await keep.service.apply(
      await keep.service.preflight('root', { direction: 'from' }),
    )
    expect(keepResult.removedFromDb).toBe(0)
    expect(keep.removed).toEqual([])

    const cleanup = fakeDependencies(syncScope, [])
    const cleanupResult = await cleanup.service.apply(
      await cleanup.service.preflight('root', {
        direction: 'from',
        cleanup: true,
      }),
    )
    expect(cleanupResult.removedFromDb).toBe(1)
    expect(cleanup.removed).toEqual(['linked'])
  })

  it('does not advance metadata when a filesystem write fails', async () => {
    const fake = fakeDependencies(
      scope({
        dbFiles: [
          {
            projectId: 'local',
            relativePath: 'local.dna',
            fileName: 'local.dna',
            syncState: 'local-only',
            semanticRecordHash: 'semantic-current',
          },
        ],
      }),
      [],
    )
    fake.setFailWrite(true)
    const result = await fake.service.apply(
      await fake.service.preflight('root', { direction: 'to' }),
    )

    expect(result.failures).toHaveLength(1)
    expect(fake.accepted).toHaveLength(0)
    expect(fake.calls).toEqual(['write:local.dna'])
  })

  it('accepts exact filesystem bytes for a both-changed conflict', async () => {
    const file = await scanned('sample.gb', 'filesystem bytes')
    const fake = fakeDependencies(
      scope({
        dbFiles: [
          {
            projectId: 'project',
            relativePath: 'sample.gb',
            fileName: 'sample.gb',
            syncState: 'modified',
            semanticRecordHash: 'semantic-new',
            baselineDiskHash: 'disk-old',
            baselineSemanticRecordHash: 'semantic-old',
          },
        ],
      }),
      [file],
    )
    const preflight = await fake.service.preflight('root', { direction: 'from' })
    const conflict = preflight.conflicts[0]!
    const result = await fake.service.apply(preflight, {
      resolutions: [
        {
          conflictId: folderScopedSyncConflictId(conflict),
          choice: 'filesystem',
        },
      ],
    })

    expect(result.updatedInDb).toBe(1)
    expect(fake.updated[0]?.file.bytes).toEqual(file.bytes)
    expect(fake.calls).toEqual(['update:project', 'mark-synced'])
  })

  it('reports apply progress for each non-ignored action', async () => {
    const file = await scanned('new/sample.gb', 'LOCUS exact\r\nORIGIN\r\n//\r\n')
    const fake = fakeDependencies(scope(), [file])
    const preflight = await fake.service.preflight('root', { direction: 'from' })
    const progress: Array<[number, number, string]> = []
    await fake.service.apply(preflight, {
      onProgress: (done, total, name) => {
        progress.push([done, total, name])
      },
    })
    expect(progress).toEqual([[1, 1, 'new/sample.gb']])
  })

  it('keeps the current side without crossing the requested sync direction', async () => {
    const file = await scanned('sample.gb', 'filesystem version')
    const fake = fakeDependencies(
      scope({
        dbFiles: [
          {
            projectId: 'project',
            relativePath: 'sample.gb',
            fileName: 'sample.gb',
            syncState: 'modified',
            semanticRecordHash: 'semantic-new',
            baselineDiskHash: 'disk-old',
            baselineSemanticRecordHash: 'semantic-old',
          },
        ],
      }),
      [file],
    )
    const inbound = await fake.service.preflight('root', { direction: 'from' })
    const inboundResult = await fake.service.apply(inbound, {
      resolutions: [{ conflictId: inbound.conflicts[0]!.id, choice: 'database' }],
    })

    expect(inboundResult.ignored).toBe(1)
    expect(inboundResult.updatedInDb).toBe(0)
    expect(fake.accepted).toHaveLength(0)
    expect(fake.updated).toHaveLength(0)
    expect(fake.disk.get('sample.gb')).toEqual(file.bytes)

    const outbound = await fake.service.preflight('root', { direction: 'to' })
    const outboundResult = await fake.service.apply(outbound, {
      resolutions: [{ conflictId: outbound.conflicts[0]!.id, choice: 'filesystem' }],
    })
    expect(outboundResult.ignored).toBe(1)
    expect(outboundResult.writtenToDisk).toBe(0)
    expect(fake.updated).toHaveLength(0)
    expect(fake.accepted).toHaveLength(0)
  })

  it('ignores tombstoned disk files without importing or deleting them', async () => {
    const file = await scanned('deleted.gb', 'old source remains')
    const fake = fakeDependencies(
      scope({ tombstones: [{ relativePath: 'deleted.gb' }] }),
      [file],
    )
    const result = await fake.service.apply(
      await fake.service.preflight('root', { direction: 'from' }),
    )

    expect(result.ignored).toBe(1)
    expect(fake.added).toHaveLength(0)
    expect(fake.removed).toHaveLength(0)
    expect(fake.disk.get('deleted.gb')).toEqual(file.bytes)
  })

  it('cleanup filesystem resolution removes a missing-baseline row with no disk file', async () => {
    const syncScope = scope({
      dbFiles: [
        {
          projectId: 'detached',
          relativePath: 'Constructs/gone.dna',
          fileName: 'gone.dna',
          syncState: 'synced',
          semanticRecordHash: 'semantic-current',
        },
      ],
    })
    const keep = fakeDependencies(syncScope, [])
    const keepPreflight = await keep.service.preflight('root', {
      direction: 'from',
      cleanup: true,
    })
    expect(keepPreflight.conflicts[0]?.reason).toBe('missing-baseline')
    const keepResult = await keep.service.apply(keepPreflight, {
      resolutions: [{ conflictId: keepPreflight.conflicts[0]!.id, choice: 'database' }],
    })
    expect(keepResult.removedFromDb).toBe(0)
    expect(keep.removed).toEqual([])

    const remove = fakeDependencies(syncScope, [])
    const removePreflight = await remove.service.preflight('root', {
      direction: 'from',
      cleanup: true,
    })
    const removeResult = await remove.service.apply(removePreflight, {
      resolutions: [{ conflictId: removePreflight.conflicts[0]!.id, choice: 'filesystem' }],
    })
    expect(removeResult.removedFromDb).toBe(1)
    expect(remove.removed).toEqual(['detached'])
    expect(remove.calls).toEqual(['remove:detached', 'primers:0:cleanup', 'mark-synced'])
  })

  it('cleanup filesystem resolution removes a locally changed row missing from disk', async () => {
    const fake = fakeDependencies(
      scope({
        dbFiles: [
          {
            projectId: 'edited',
            relativePath: 'missing.gb',
            fileName: 'missing.gb',
            syncState: 'modified',
            semanticRecordHash: 'semantic-new',
            baselineDiskHash: 'disk-baseline',
            baselineSemanticRecordHash: 'semantic-old',
          },
        ],
      }),
      [],
    )
    const preflight = await fake.service.preflight('root', {
      direction: 'from',
      cleanup: true,
    })
    expect(preflight.conflicts[0]?.reason).toBe('database-changed-disk-missing')
    const result = await fake.service.apply(preflight, {
      resolutions: [{ conflictId: preflight.conflicts[0]!.id, choice: 'filesystem' }],
    })
    expect(result.removedFromDb).toBe(1)
    expect(fake.removed).toEqual(['edited'])
  })

  it('imports tab-separated primer lists without treating them as constructs', async () => {
    const construct = await scanned('plasmid.gb', 'LOCUS exact\r\nORIGIN\r\n//\r\n')
    const primers = await scanned('Primers/demo.txt', 'M13F\tGTAAAACGACGGCCAGT\nM13R\tCAGGAAACAGCTATGAC\n')
    const fake = fakeDependencies(scope(), [construct], [primers])
    const preflight = await fake.service.preflight('root', { direction: 'from' })

    expect(preflight.diskFiles.map((file) => file.relativePath)).toEqual(['plasmid.gb'])
    expect(preflight.primerListFiles.map((file) => file.relativePath)).toEqual(['Primers/demo.txt'])
    expect(preflight.plan.counts.addToDb).toBe(1)

    const result = await fake.service.apply(preflight)
    expect(result.addedToDb).toBe(1)
    expect(result.primersSaved).toBe(1)
    expect(result.primerListsSaved).toBe(1)
    expect(fake.added.map((file) => file.relativePath)).toEqual(['plasmid.gb'])
    expect(fake.primerSyncs[0]?.map((file) => file.relativePath)).toEqual(['Primers/demo.txt'])
    expect(fake.calls).toEqual(['add:plasmid.gb', 'primers:1:keep', 'mark-synced'])
  })
})
