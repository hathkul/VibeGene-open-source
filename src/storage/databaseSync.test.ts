import { describe, expect, it } from 'vitest'
import { constructSyncContentKey } from './databaseImport'
import type { HistoryNode, SequenceRecord } from '../domain/types'
import { planFolderScopedSync, type FolderSyncDbFile } from './databaseSync'
import { folderScopedSyncConflictChoices } from './folderScopedSyncService'

function historyNode(overrides: Partial<HistoryNode> = {}): HistoryNode {
  return {
    id: '1',
    name: 'construct',
    seqLen: 4,
    circular: true,
    operation: 'invalid',
    resurrectable: false,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: [],
    features: [],
    children: [],
    ...overrides,
  }
}

function recordWithHistory(history: HistoryNode): SequenceRecord {
  return {
    id: 'record-1',
    name: 'construct',
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence: 'ATGC',
    features: [],
    primers: [],
    operations: [],
    history,
    construct: {} as SequenceRecord['construct'],
    createdAt: '',
    updatedAt: '',
  }
}

function syncedDb(overrides: Partial<FolderSyncDbFile> = {}): FolderSyncDbFile {
  return {
    projectId: 'project-1',
    relativePath: 'construct.dna',
    fileName: 'construct.dna',
    syncState: 'synced',
    semanticRecordHash: 'semantic-current',
    baselineDiskHash: 'disk-baseline',
    baselineSemanticRecordHash: 'semantic-baseline',
    ...overrides,
  }
}

describe('folder-scoped sync planning', () => {
  it('lets sync-to keep a changed database construct when its disk file is missing', () => {
    expect(folderScopedSyncConflictChoices({
      projectId: 'project-1',
      reason: 'database-changed-disk-missing',
    }, 'to', false, false)).toEqual(['database'])
  })

  it('treats SnapGene history-only edits as Database changes', () => {
    const baseline = recordWithHistory(historyNode())
    const edited = recordWithHistory(historyNode({ operation: 'PCR' }))
    const changedAncestorSequence = recordWithHistory(historyNode({ sequence: 'GCTA' }))
    expect(constructSyncContentKey(edited)).not.toBe(constructSyncContentKey(baseline))
    expect(constructSyncContentKey(changedAncestorSequence)).not.toBe(constructSyncContentKey(baseline))
  })

  it('updates from a changed disk file and reports a three-way conflict when both sides changed', () => {
    const update = planFolderScopedSync({
      direction: 'from',
      dbFiles: [syncedDb({ semanticRecordHash: 'semantic-baseline' })],
      diskFiles: [{ relativePath: 'construct.dna', contentHash: 'disk-new' }],
      tombstones: [],
    })
    expect(update.actions).toEqual([{
      kind: 'updateDb',
      reason: 'disk-changed',
      projectId: 'project-1',
      relativePath: 'construct.dna',
      diskContentHash: 'disk-new',
    }])

    const conflict = planFolderScopedSync({
      direction: 'from',
      dbFiles: [syncedDb()],
      diskFiles: [{ relativePath: 'construct.dna', contentHash: 'disk-new' }],
      tombstones: [],
    })
    expect(conflict.counts.conflict).toBe(1)
    expect(conflict.actions[0]).toMatchObject({ kind: 'conflict', reason: 'both-changed' })
  })

  it('only removes missing database rows when explicit cleanup is enabled', () => {
    const withoutCleanup = planFolderScopedSync({
      direction: 'from',
      dbFiles: [syncedDb({ semanticRecordHash: 'semantic-baseline' })],
      diskFiles: [],
      tombstones: [],
    })
    expect(withoutCleanup.actions[0]).toMatchObject({ kind: 'ignore', reason: 'missing-on-disk' })

    const withCleanup = planFolderScopedSync({
      direction: 'from',
      cleanup: true,
      dbFiles: [syncedDb({ semanticRecordHash: 'semantic-baseline' })],
      diskFiles: [],
      tombstones: [],
    })
    expect(withCleanup.actions[0]).toEqual({
      kind: 'removeFromDb',
      reason: 'disk-missing',
      projectId: 'project-1',
      relativePath: 'construct.dna',
    })
  })

  it('honors tombstones and refuses a path collision instead of re-importing a deleted file', () => {
    const ignored = planFolderScopedSync({
      direction: 'from',
      dbFiles: [],
      diskFiles: [{ relativePath: 'deleted.dna', contentHash: 'same' }],
      tombstones: [{ relativePath: 'deleted.dna', contentHash: 'same' }],
    })
    expect(ignored.actions).toEqual([{
      kind: 'ignore',
      reason: 'tombstoned',
      relativePath: 'deleted.dna',
    }])

    const collision = planFolderScopedSync({
      direction: 'from',
      dbFiles: [syncedDb({ relativePath: 'deleted.dna', semanticRecordHash: 'semantic-baseline' })],
      diskFiles: [{ relativePath: 'deleted.dna', contentHash: 'same' }],
      tombstones: [{ relativePath: 'deleted.dna', projectId: 'old-project', contentHash: 'same' }],
    })
    expect(collision.actions).toEqual([
      { kind: 'conflict', reason: 'tombstone-project-collision', projectId: 'project-1', relativePath: 'deleted.dna' },
      { kind: 'ignore', reason: 'tombstoned', relativePath: 'deleted.dna' },
    ])
  })
})
