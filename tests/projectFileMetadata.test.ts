import { describe, expect, it } from 'vitest'
import {
  acceptedSyncPathMatchesTombstone,
  buildUserDeletionTombstone,
  inferProjectFileFormat,
  normalizeProjectFileName,
  normalizeStoredProjectSummary,
  type StoredProjectSummary,
} from '../src/storage/projects'
import { retainedExactBytesForExport } from '../src/storage/databaseExport'
import { retainedExactBytesForFolderSyncWrite } from '../src/storage/folderScopedSyncRepository'

function summary(partial: Partial<StoredProjectSummary> = {}): StoredProjectSummary {
  return {
    id: 'project-1',
    name: 'Demo plasmid',
    updatedAt: '2026-01-01T00:00:00.000Z',
    folderId: null,
    tags: [],
    sequenceLength: 4,
    topology: 'circular',
    ...partial,
  }
}

describe('project file metadata', () => {
  it('retains a real sync basename and infers a normalized format', () => {
    const normalized = normalizeStoredProjectSummary(
      summary({ syncRelativePath: 'Gateway/pcDNA3-DN-p73-alpha.gb' }),
    )
    expect(normalized.fileName).toBe('pcDNA3-DN-p73-alpha.gb')
    expect(normalized.fileFormat).toBe('genbank')
    expect(normalized.fileSyncState).toBe('synced')
    expect(normalized.fileProvenance).toBe('sync-folder')
  })

  it('backfills a safe dna filename without pretending legacy bytes exist', () => {
    const normalized = normalizeStoredProjectSummary(summary({ name: '../Demo: plasmid' }))
    expect(normalized.fileName).toBe('_Demo_ plasmid.dna')
    expect(normalized.fileFormat).toBe('snapgene')
    expect(normalized.fileSyncState).toBe('local-only')
    expect(normalized.fileProvenance).toBe('legacy')
  })

  it('keeps DNA library documentRole marks on summaries', () => {
    const normalized = normalizeStoredProjectSummary(
      summary({ molecule: 'dna', documentRole: 'library' }),
    )
    expect(normalized.documentRole).toBe('library')
    expect(normalizeStoredProjectSummary(summary({ molecule: 'dna' })).documentRole).toBeUndefined()
  })

  it('normalizes source paths and common sequence formats', () => {
    expect(normalizeProjectFileName('nested\\sample.FASTA', 'ignored')).toBe('sample.FASTA')
    expect(inferProjectFileFormat('sample.FASTA')).toBe('fasta')
    expect(inferProjectFileFormat('sample.embl')).toBe('embl')
    expect(inferProjectFileFormat('sample.custom')).toBe('unknown')
  })

  it('retains exact export bytes only while the semantic baseline matches', () => {
    const bytes = new Uint8Array([0, 13, 10, 255])
    const blob = {
      projectId: 'project-1',
      fileName: 'sample.gb',
      fileFormat: 'genbank' as const,
      bytes,
      byteLength: bytes.byteLength,
      contentHash: 'disk-hash',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const baseline = {
      projectId: 'project-1',
      fileName: 'sample.gb',
      fileFormat: 'genbank' as const,
      contentHash: 'disk-hash',
      semanticRecordHash: 'semantic-old',
      relativePath: 'sample.gb',
      capturedAt: '2026-01-01T00:00:00.000Z',
    }
    const project = summary({ fileSyncState: 'synced' })

    expect(retainedExactBytesForExport(project, blob, baseline, 'semantic-old')).toEqual(bytes)
    expect(retainedExactBytesForExport(project, blob, baseline, 'semantic-new')).toBe(null)
    expect(
      retainedExactBytesForExport(
        summary({
          fileSyncState: 'local-only',
          updatedAt: '2025-01-01T00:00:00.000Z',
        }),
        { ...blob, updatedAt: '2026-01-01T00:00:00.000Z' },
        null,
        'semantic-old',
      ),
    ).toBe(null)
    expect(
      retainedExactBytesForExport(
        project,
        { ...blob, contentHash: 'different-bytes' },
        baseline,
        'semantic-old',
      ),
    ).toBe(null)
  })

  it('uses exact sync-to bytes only for the matching format and semantic baseline', () => {
    const bytes = new Uint8Array([1, 2, 3])
    const blob = {
      projectId: 'project-1',
      fileName: 'sample.gb',
      fileFormat: 'genbank' as const,
      bytes,
      byteLength: bytes.byteLength,
      contentHash: 'disk-hash',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const baseline = {
      projectId: 'project-1',
      fileName: 'sample.gb',
      fileFormat: 'genbank' as const,
      contentHash: 'disk-hash',
      semanticRecordHash: 'semantic',
      capturedAt: '2026-01-01T00:00:00.000Z',
    }

    expect(
      retainedExactBytesForFolderSyncWrite(blob, baseline, 'genbank', 'semantic'),
    ).toEqual(bytes)
    expect(
      retainedExactBytesForFolderSyncWrite(blob, baseline, 'snapgene', 'semantic'),
    ).toBe(null)
    expect(
      retainedExactBytesForFolderSyncWrite(blob, baseline, 'genbank', 'changed'),
    ).toBe(null)
    expect(
      retainedExactBytesForFolderSyncWrite(blob, null, 'genbank', 'semantic'),
    ).toBe(null)
  })

  it('creates tombstones only for user deletion of source-linked rows', () => {
    const linked = summary({
      id: 'linked',
      folderId: 'root',
      syncRelativePath: 'nested/sample.gb',
      syncSourceHash: 'source-hash',
      fileName: 'sample.gb',
      fileFormat: 'genbank',
      fileSyncState: 'synced',
    })
    const tombstone = buildUserDeletionTombstone({
      summary: linked,
      baseline: null,
      rootFolderId: 'root',
      tombstoneId: 'tombstone-1',
      deletedAt: '2026-08-13T00:00:00.000Z',
    })

    expect(tombstone).toMatchObject({
      id: 'tombstone-1',
      rootFolderId: 'root',
      relativePath: 'nested/sample.gb',
      projectId: 'linked',
      contentHash: 'source-hash',
    })
    expect(
      buildUserDeletionTombstone({
        summary: { ...linked, fileSyncState: 'local-only' },
        baseline: null,
        rootFolderId: 'root',
        tombstoneId: 'unused',
        deletedAt: '2026-08-13T00:00:00.000Z',
      }),
    ).toBe(null)
  })

  it('clears only a tombstone for the accepted root and path', () => {
    const tombstone = { rootFolderId: 'old-root', relativePath: 'Nested\\Sample.gb' }

    expect(
      acceptedSyncPathMatchesTombstone(tombstone, 'old-root', 'nested/sample.GB'),
    ).toBe(true)
    expect(
      acceptedSyncPathMatchesTombstone(tombstone, 'new-root', 'nested/sample.gb'),
    ).toBe(false)
    expect(
      acceptedSyncPathMatchesTombstone(tombstone, 'old-root', 'new/sample.gb'),
    ).toBe(false)
  })
})
