import { describe, expect, it } from 'vitest'
import {
  chooseFolderSyncKeepBothPath,
  normalizeFolderSyncRelativePath,
  planFolderScopedSync as planFolderScopedSyncRaw,
  type FolderSyncAction,
  type FolderSyncDbFile,
  type FolderSyncDirection,
  type FolderSyncDiskFile,
  type FolderSyncPlanInput,
} from '../src/storage/databaseSync'

function dbFile(partial: Partial<FolderSyncDbFile> = {}): FolderSyncDbFile {
  return {
    projectId: 'project-1',
    relativePath: 'folder/plasmid.gb',
    fileName: 'plasmid.gb',
    syncState: 'synced',
    semanticRecordHash: 'record-baseline',
    baselineDiskHash: 'disk-baseline',
    baselineSemanticRecordHash: 'record-baseline',
    ...partial,
  }
}

function diskFile(partial: Partial<FolderSyncDiskFile> = {}): FolderSyncDiskFile {
  return {
    relativePath: 'folder/plasmid.gb',
    contentHash: 'disk-baseline',
    ...partial,
  }
}

function actionOfKind<TKind extends FolderSyncAction['kind']>(
  actions: readonly FolderSyncAction[],
  kind: TKind,
): Extract<FolderSyncAction, { kind: TKind }>[] {
  return actions.filter(
    (action): action is Extract<FolderSyncAction, { kind: TKind }> => action.kind === kind,
  )
}

function planFolderScopedSync(
  input: Omit<FolderSyncPlanInput, 'direction'> & {
    direction?: FolderSyncDirection
  },
) {
  return planFolderScopedSyncRaw({
    ...input,
    direction: input.direction ?? 'from',
  })
}

describe('folder-scoped three-way sync planner', () => {
  it.each([
    {
      label: 'neither side changed',
      semanticRecordHash: 'record-baseline',
      diskHash: 'disk-baseline',
      kind: 'ignore',
      reason: 'unchanged',
    },
    {
      label: 'only disk changed',
      semanticRecordHash: 'record-baseline',
      diskHash: 'disk-new',
      kind: 'updateDb',
      reason: 'disk-changed',
    },
    {
      label: 'only database changed',
      semanticRecordHash: 'record-new',
      diskHash: 'disk-baseline',
      kind: 'ignore',
      reason: 'database-changed',
    },
    {
      label: 'both sides changed',
      semanticRecordHash: 'record-new',
      diskHash: 'disk-new',
      kind: 'conflict',
      reason: 'both-changed',
    },
  ] as const)('$label', ({ semanticRecordHash, diskHash, kind, reason }) => {
    const plan = planFolderScopedSync({
      dbFiles: [dbFile({ semanticRecordHash })],
      diskFiles: [diskFile({ contentHash: diskHash })],
      tombstones: [],
    })

    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0]).toMatchObject({
      kind,
      reason,
      projectId: 'project-1',
      relativePath: 'folder/plasmid.gb',
    })
  })

  it('keeps a missing local-only row during inbound cleanup', () => {
    const plan = planFolderScopedSync({
      dbFiles: [
        dbFile({
          syncState: 'local-only',
          baselineDiskHash: null,
          baselineSemanticRecordHash: null,
        }),
      ],
      diskFiles: [],
      tombstones: [],
      cleanup: true,
    })

    expect(plan.actions).toEqual([
      {
        kind: 'ignore',
        reason: 'local-only',
        projectId: 'project-1',
        relativePath: 'folder/plasmid.gb',
      },
    ])
  })

  it('does not overwrite an unrelated disk file at a local-only path', () => {
    const plan = planFolderScopedSync({
      dbFiles: [
        dbFile({
          syncState: 'local-only',
          baselineDiskHash: null,
          baselineSemanticRecordHash: null,
        }),
      ],
      diskFiles: [diskFile()],
      tombstones: [],
    })

    expect(plan.actions).toEqual([
      {
        kind: 'conflict',
        reason: 'local-only-path-collision',
        projectId: 'project-1',
        relativePath: 'folder/plasmid.gb',
      },
    ])
  })

  it('reports a missing unchanged synced file unless cleanup is enabled', () => {
    const keep = planFolderScopedSync({
      dbFiles: [dbFile()],
      diskFiles: [],
      tombstones: [],
    })
    const cleanup = planFolderScopedSync({
      dbFiles: [dbFile()],
      diskFiles: [],
      tombstones: [],
      cleanup: true,
    })

    expect(keep.actions).toEqual([
      {
        kind: 'ignore',
        reason: 'missing-on-disk',
        projectId: 'project-1',
        relativePath: 'folder/plasmid.gb',
      },
    ])
    expect(cleanup.actions).toEqual([
      {
        kind: 'removeFromDb',
        reason: 'disk-missing',
        projectId: 'project-1',
        relativePath: 'folder/plasmid.gb',
      },
    ])
  })

  it('conflicts when a changed database record has gone missing on disk', () => {
    for (const cleanup of [false, true]) {
      const plan = planFolderScopedSync({
        dbFiles: [dbFile({ semanticRecordHash: 'record-new' })],
        diskFiles: [],
        tombstones: [],
        cleanup,
      })
      expect(plan.actions).toEqual([
        {
          kind: 'conflict',
          reason: 'database-changed-disk-missing',
          projectId: 'project-1',
          relativePath: 'folder/plasmid.gb',
        },
      ])
    }
  })

  it('ignores a tombstoned file instead of reimporting or deleting it', () => {
    const plan = planFolderScopedSync({
      dbFiles: [],
      diskFiles: [diskFile({ relativePath: 'Folder/Plasmid.gb' })],
      tombstones: [{ relativePath: 'folder/plasmid.GB' }],
      cleanup: true,
    })

    expect(plan.actions).toEqual([
      {
        kind: 'ignore',
        reason: 'tombstoned',
        relativePath: 'Folder/Plasmid.gb',
      },
    ])
    expect(plan.counts.addToDb).toBe(0)
    expect(plan.counts.removeFromDb).toBe(0)
  })

  it('ignores a moved project old path while creating its new local-only path', () => {
    const plan = planFolderScopedSync({
      direction: 'to',
      dbFiles: [
        dbFile({
          relativePath: 'new-folder/plasmid.gb',
          syncState: 'local-only',
          baselineDiskHash: null,
          baselineSemanticRecordHash: null,
        }),
      ],
      diskFiles: [diskFile({ relativePath: 'old-folder/plasmid.gb' })],
      tombstones: [
        {
          relativePath: 'old-folder/plasmid.gb',
          projectId: 'project-1',
          contentHash: 'disk-baseline',
        },
      ],
    })

    expect(actionOfKind(plan.actions, 'ignore')).toContainEqual({
      kind: 'ignore',
      reason: 'tombstoned',
      relativePath: 'old-folder/plasmid.gb',
    })
    expect(actionOfKind(plan.actions, 'createOnDisk')).toEqual([
      {
        kind: 'createOnDisk',
        reason: 'local-only',
        projectId: 'project-1',
        relativePath: 'new-folder/plasmid.gb',
      },
    ])
  })

  it('adds an unmatched disk file unless it is tombstoned', () => {
    const plan = planFolderScopedSync({
      dbFiles: [],
      diskFiles: [diskFile({ relativePath: 'new/file.dna', contentHash: 'new-hash' })],
      tombstones: [],
    })

    expect(plan.actions).toEqual([
      {
        kind: 'addToDb',
        relativePath: 'new/file.dna',
        diskContentHash: 'new-hash',
      },
    ])
  })

  it('allows a restored external file to return after its user-deletion tombstone is removed', () => {
    const input = {
      dbFiles: [],
      diskFiles: [diskFile({ relativePath: 'restored.gb', contentHash: 'restored' })],
    }
    const blocked = planFolderScopedSync({
      ...input,
      tombstones: [{ relativePath: 'restored.gb', projectId: 'deleted-project' }],
    })
    const restored = planFolderScopedSync({ ...input, tombstones: [] })

    expect(blocked.actions).toEqual([
      { kind: 'ignore', reason: 'tombstoned', relativePath: 'restored.gb' },
    ])
    expect(restored.actions).toEqual([
      {
        kind: 'addToDb',
        relativePath: 'restored.gb',
        diskContentHash: 'restored',
      },
    ])
  })

  it('keeps inbound and outbound actions strictly separated', () => {
    const dbFiles = [
      dbFile({
        projectId: 'db-changed',
        relativePath: 'db-changed.gb',
        semanticRecordHash: 'record-new',
      }),
      dbFile({
        projectId: 'local-only',
        relativePath: 'local-only.gb',
        syncState: 'local-only',
        baselineDiskHash: null,
        baselineSemanticRecordHash: null,
      }),
      dbFile({
        projectId: 'disk-changed',
        relativePath: 'disk-changed.gb',
      }),
    ]
    const diskFiles = [
      diskFile({ relativePath: 'db-changed.gb' }),
      diskFile({ relativePath: 'disk-changed.gb', contentHash: 'disk-new' }),
      diskFile({ relativePath: 'disk-only.gb', contentHash: 'disk-only' }),
    ]

    const inbound = planFolderScopedSync({
      direction: 'from',
      dbFiles,
      diskFiles,
      tombstones: [],
    })
    expect(actionOfKind(inbound.actions, 'createOnDisk')).toHaveLength(0)
    expect(actionOfKind(inbound.actions, 'overwriteDisk')).toHaveLength(0)
    expect(actionOfKind(inbound.actions, 'updateDb')).toHaveLength(1)
    expect(actionOfKind(inbound.actions, 'addToDb')).toHaveLength(1)
    expect(
      actionOfKind(inbound.actions, 'ignore').find(
        (action) => action.projectId === 'local-only',
      ),
    ).toMatchObject({ reason: 'local-only' })

    const outbound = planFolderScopedSync({
      direction: 'to',
      dbFiles,
      diskFiles,
      tombstones: [],
    })
    expect(actionOfKind(outbound.actions, 'addToDb')).toHaveLength(0)
    expect(actionOfKind(outbound.actions, 'updateDb')).toHaveLength(0)
    expect(actionOfKind(outbound.actions, 'removeFromDb')).toHaveLength(0)
    expect(actionOfKind(outbound.actions, 'overwriteDisk')).toHaveLength(1)
    expect(actionOfKind(outbound.actions, 'createOnDisk')).toHaveLength(1)
    expect(
      actionOfKind(outbound.actions, 'ignore').find(
        (action) => action.relativePath === 'disk-only.gb',
      ),
    ).toMatchObject({ reason: 'disk-only' })
    expect(
      actionOfKind(outbound.actions, 'ignore').find(
        (action) => action.projectId === 'disk-changed',
      ),
    ).toMatchObject({ reason: 'disk-changed' })
  })

  it('rejects cleanup for outbound intent', () => {
    expect(() =>
      planFolderScopedSync({
        direction: 'to',
        dbFiles: [],
        diskFiles: [],
        tombstones: [],
        cleanup: true,
      }),
    ).toThrow('cleanup is only valid')
  })

  it('detects a unique exact-hash disk rename after path matching', () => {
    const plan = planFolderScopedSync({
      dbFiles: [dbFile({ relativePath: 'old/plasmid.gb' })],
      diskFiles: [diskFile({ relativePath: 'new/plasmid.gb' })],
      tombstones: [],
    })

    expect(plan.actions).toEqual([
      {
        kind: 'updateDb',
        reason: 'disk-renamed',
        projectId: 'project-1',
        relativePath: 'new/plasmid.gb',
        previousRelativePath: 'old/plasmid.gb',
        diskContentHash: 'disk-baseline',
      },
    ])
  })

  it('treats a DB edit plus disk rename as a conflict', () => {
    const plan = planFolderScopedSync({
      dbFiles: [
        dbFile({
          relativePath: 'old/plasmid.gb',
          semanticRecordHash: 'record-new',
        }),
      ],
      diskFiles: [diskFile({ relativePath: 'new/plasmid.gb' })],
      tombstones: [],
    })

    expect(plan.actions).toEqual([
      {
        kind: 'conflict',
        reason: 'both-changed',
        projectId: 'project-1',
        relativePath: 'new/plasmid.gb',
        conflictingPaths: ['new/plasmid.gb', 'old/plasmid.gb'],
      },
    ])
  })

  it('reports ambiguous equal-hash rename candidates without adding or removing', () => {
    const plan = planFolderScopedSync({
      dbFiles: [dbFile({ relativePath: 'old/plasmid.gb' })],
      diskFiles: [
        diskFile({ relativePath: 'new/a.gb' }),
        diskFile({ relativePath: 'new/b.gb' }),
      ],
      tombstones: [],
      cleanup: true,
    })

    expect(actionOfKind(plan.actions, 'conflict')).toEqual([
      {
        kind: 'conflict',
        reason: 'ambiguous-rename',
        projectId: 'project-1',
        relativePath: 'old/plasmid.gb',
        conflictingPaths: ['new/a.gb', 'new/b.gb', 'old/plasmid.gb'],
      },
    ])
    expect(actionOfKind(plan.actions, 'ignore')).toHaveLength(2)
    expect(plan.counts.addToDb).toBe(0)
    expect(plan.counts.removeFromDb).toBe(0)
  })

  it('claims case-normalized path identity before hash rename detection', () => {
    const plan = planFolderScopedSync({
      dbFiles: [
        dbFile({
          projectId: 'exact',
          relativePath: 'Folder\\Plasmid.GB',
        }),
        dbFile({
          projectId: 'renamed',
          relativePath: 'old/other.gb',
        }),
      ],
      diskFiles: [
        diskFile({ relativePath: 'folder/plasmid.gb' }),
        diskFile({ relativePath: 'new/other.gb' }),
      ],
      tombstones: [],
    })

    expect(actionOfKind(plan.actions, 'ignore')).toEqual([
      {
        kind: 'ignore',
        reason: 'unchanged',
        projectId: 'exact',
        relativePath: 'folder/plasmid.gb',
      },
    ])
    expect(actionOfKind(plan.actions, 'updateDb')).toEqual([
      {
        kind: 'updateDb',
        reason: 'disk-renamed',
        projectId: 'renamed',
        relativePath: 'new/other.gb',
        previousRelativePath: 'old/other.gb',
        diskContentHash: 'disk-baseline',
      },
    ])
  })

  it('never guesses a rename from similar stems', () => {
    const plan = planFolderScopedSync({
      dbFiles: [dbFile({ relativePath: 'Lab/pET-TEV-Se.dna' })],
      diskFiles: [
        diskFile({
          relativePath: 'Lab/pET-TEV-Sesn2.gb',
          contentHash: 'different-bytes',
        }),
      ],
      tombstones: [],
    })

    expect(actionOfKind(plan.actions, 'addToDb')).toHaveLength(1)
    expect(actionOfKind(plan.actions, 'ignore')).toEqual([
      {
        kind: 'ignore',
        reason: 'missing-on-disk',
        projectId: 'project-1',
        relativePath: 'Lab/pET-TEV-Se.dna',
      },
    ])
  })

  it('conflicts instead of guessing when a synced project lacks either baseline hash', () => {
    const plan = planFolderScopedSync({
      dbFiles: [dbFile({ baselineSemanticRecordHash: null })],
      diskFiles: [diskFile()],
      tombstones: [],
    })

    expect(plan.actions[0]).toMatchObject({
      kind: 'conflict',
      reason: 'missing-baseline',
      projectId: 'project-1',
    })
  })

  it('conflicts with missing-baseline when a synced project has no baseline and no disk file', () => {
    const plan = planFolderScopedSync({
      dbFiles: [dbFile({ baselineDiskHash: null, baselineSemanticRecordHash: null })],
      diskFiles: [],
      tombstones: [],
      cleanup: true,
    })

    expect(plan.actions[0]).toMatchObject({
      kind: 'conflict',
      reason: 'missing-baseline',
      projectId: 'project-1',
      relativePath: 'folder/plasmid.gb',
    })
  })

  it('reports case-normalized DB and disk path collisions deterministically', () => {
    const dbCollision = planFolderScopedSync({
      dbFiles: [
        dbFile({ projectId: 'a', relativePath: 'Lab/A.gb' }),
        dbFile({ projectId: 'b', relativePath: 'lab/a.GB' }),
      ],
      diskFiles: [diskFile({ relativePath: 'LAB/a.gb' })],
      tombstones: [],
    })
    expect(actionOfKind(dbCollision.actions, 'conflict')).toHaveLength(2)
    expect(
      actionOfKind(dbCollision.actions, 'conflict').map((action) => action.reason),
    ).toEqual(['database-path-collision', 'database-path-collision'])

    const diskCollision = planFolderScopedSync({
      dbFiles: [],
      diskFiles: [
        diskFile({ relativePath: 'Lab/A.gb', contentHash: 'one' }),
        diskFile({ relativePath: 'lab/a.GB', contentHash: 'two' }),
      ],
      tombstones: [],
    })
    expect(diskCollision.actions).toEqual([
      {
        kind: 'conflict',
        reason: 'disk-path-collision',
        projectId: null,
        relativePath: 'Lab/A.gb',
        conflictingPaths: ['Lab/A.gb', 'lab/a.GB'],
      },
    ])
  })

  it('returns the same deterministic plan regardless of input order', () => {
    const dbFiles = [
      dbFile({ projectId: 'b', relativePath: 'b.gb' }),
      dbFile({ projectId: 'a', relativePath: 'a.gb' }),
    ]
    const diskFiles = [
      diskFile({ relativePath: 'b.gb' }),
      diskFile({ relativePath: 'a.gb' }),
    ]

    const forward = planFolderScopedSync({ dbFiles, diskFiles, tombstones: [] })
    const reverse = planFolderScopedSync({
      dbFiles: [...dbFiles].reverse(),
      diskFiles: [...diskFiles].reverse(),
      tombstones: [],
    })
    expect(reverse).toEqual(forward)
  })
})

describe('folder-scoped sync path helpers', () => {
  it('normalizes separators, dot segments, repeated separators, and Unicode composition', () => {
    expect(normalizeFolderSyncRelativePath('./Lab//Cafe\u0301\\sample.gb')).toBe(
      'Lab/Café/sample.gb',
    )
  })

  it('chooses deterministic case-insensitive keep-both paths', () => {
    expect(chooseFolderSyncKeepBothPath('Lab/Plasmid.gb', [])).toBe('Lab/Plasmid.gb')
    expect(
      chooseFolderSyncKeepBothPath('Lab/Plasmid.gb', [
        'lab/plasmid.GB',
        'Lab/Plasmid (2).gb',
        'Lab/Plasmid (4).gb',
      ]),
    ).toBe('Lab/Plasmid (3).gb')
    expect(chooseFolderSyncKeepBothPath('README', ['readme'])).toBe('README (2)')
  })
})
