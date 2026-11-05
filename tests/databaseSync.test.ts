import { describe, expect, it } from 'vitest'
import {
  exportFileNameForSummary,
  folderPathRelativeToRoot,
  matchTopLevelFolderByName,
  type DatabaseExportIndexEntry,
} from '../src/storage/databaseExport'
import {
  constructSyncKey,
  encodeRecordForSyncRelativePath,
  outboundSyncRelativePath,
  planDatabaseSyncCandidates,
  planInboundCleanupRemovals,
  planInboundConstructSync,
  resolveExistingOutboundPath,
  sequenceFileStem,
} from '../src/storage/databaseSync'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import type { SequenceRecord } from '../src/domain/types'

function entry(
  partial: Pick<DatabaseExportIndexEntry, 'projectId' | 'relativePath' | 'updatedAt'> &
    Partial<DatabaseExportIndexEntry>,
): DatabaseExportIndexEntry {
  return {
    name: partial.name ?? partial.relativePath,
    constructName: partial.constructName ?? partial.relativePath,
    folderId: partial.folderId ?? null,
    tags: partial.tags ?? [],
    topology: partial.topology ?? 'circular',
    sequenceLength: partial.sequenceLength ?? 4,
    molecule: partial.molecule ?? 'dna',
    ...partial,
  }
}

describe('databaseSync', () => {
  it('export prefers syncRelativePath basename over truncated construct name', () => {
    const base = {
      id: '1',
      topology: 'circular' as const,
      sequenceLength: 100,
      updatedAt: '2026-01-01T00:00:00.000Z',
      folderId: null,
      tags: [] as string[],
      molecule: 'dna' as const,
    }
    expect(
      exportFileNameForSummary({
        ...base,
        name: 'pcDNA3-DN-',
        syncRelativePath: 'Lab/pcDNA3-DN-p73-alpha.gb',
      }),
    ).toBe('pcDNA3-DN-p73-alpha.gb')
    expect(
      exportFileNameForSummary({
        ...base,
        id: '2',
        name: 'pcDNA3-DN-',
      }),
    ).toBe('pcDNA3-DN-.dna')
  })

  it('exports and syncs proteins as SnapGene .prot (not .dna)', () => {
    const base = {
      id: 'p1',
      topology: 'linear' as const,
      sequenceLength: 20,
      updatedAt: '2026-01-01T00:00:00.000Z',
      folderId: null,
      tags: [] as string[],
      molecule: 'protein' as const,
      name: 'Albumin',
    }
    expect(exportFileNameForSummary(base)).toBe('Albumin.prot')
    expect(
      exportFileNameForSummary({
        ...base,
        fileName: 'Albumin.dna',
      }),
    ).toBe('Albumin.prot')
    expect(
      exportFileNameForSummary({
        ...base,
        syncRelativePath: 'Proteins/Albumin.gp',
      }),
    ).toBe('Albumin.gp')
    expect(
      outboundSyncRelativePath({
        relativePath: 'Albumin.prot',
        syncRelativePath: 'Lab/Albumin.dna',
        molecule: 'protein',
      }),
    ).toBe('Lab/Albumin.prot')

    const protein: SequenceRecord = {
      id: 'p1',
      name: 'Albumin',
      description: '',
      molecule: 'protein',
      topology: 'linear',
      sequence: 'ACDEFGHIKLMNPQRSTVWY',
      features: [],
      primers: [],
      operations: [],
      construct: defaultConstructProperties,
      protein: {
        numberingStart: 1,
        numberingRegions: [],
        bonds: [],
        comparisonSources: [],
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const bytes = encodeRecordForSyncRelativePath('Albumin.prot', protein)
    let offset = 0
    let cookieType: number | null = null
    let hasProteinSequence = false
    let hasDnaSequence = false
    while (offset + 5 <= bytes.length) {
      const type = bytes[offset]!
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, false)
      if (type === 0x09) {
        cookieType = new DataView(bytes.buffer, bytes.byteOffset + offset + 5).getUint16(8, false)
      }
      if (type === 0x15) hasProteinSequence = true
      if (type === 0x00) hasDnaSequence = true
      offset += 5 + length
    }
    expect(cookieType).toBe(2)
    expect(hasProteinSequence).toBe(true)
    expect(hasDnaSequence).toBe(false)
  })

  it('only queues constructs newer than the last sync watermark', () => {
    const projects = [
      entry({
        projectId: 'keep',
        relativePath: 'keep.dna',
        updatedAt: '2026-01-01T10:00:00.000Z',
      }),
      entry({
        projectId: 'changed',
        relativePath: 'changed.dna',
        updatedAt: '2026-01-02T12:00:00.000Z',
      }),
      entry({
        projectId: 'also-old',
        relativePath: 'Lab/old.dna',
        updatedAt: '2026-01-01T09:00:00.000Z',
      }),
    ]

    const plan = planDatabaseSyncCandidates(projects, '2026-01-01T11:00:00.000Z')
    expect(plan.skippedUnchanged).toBe(2)
    expect(plan.candidates.map((row) => row.relativePath)).toEqual(['changed.dna'])
  })

  it('writes Sync-to-folder candidates to syncRelativePath when known', () => {
    const plan = planDatabaseSyncCandidates(
      [
        entry({
          projectId: 'from-gb',
          relativePath: 'Lab/pcDNA3-DN-.dna',
          syncRelativePath: 'Lab/pcDNA3-DN-p73-alpha.gb',
          updatedAt: '2026-01-02T12:00:00.000Z',
        }),
      ],
      '2026-01-01T11:00:00.000Z',
    )
    expect(plan.candidates.map((row) => row.relativePath)).toEqual(['Lab/pcDNA3-DN-p73-alpha.gb'])
  })

  it('resolves missing truncated .dna targets to an existing longer .gb', () => {
    expect(
      resolveExistingOutboundPath('Lab/pcDNA3-DN-.dna', [
        'pcDNA3-DN-p73-alpha.gb',
        'pcDNA3-DN-p73-beta.gb',
      ]),
    ).toBe(null) // ambiguous longer matches
    expect(
      resolveExistingOutboundPath('Lab/pcDNA3-DN-.dna', ['pcDNA3-DN-p73-alpha.gb', 'other.gb']),
    ).toBe('Lab/pcDNA3-DN-p73-alpha.gb')
    expect(resolveExistingOutboundPath('Lab/missing.dna', ['other.gb'])).toBe(null)
    expect(resolveExistingOutboundPath('Lab/pUC18.dna', ['pUC18.gb'])).toBe('Lab/pUC18.gb')
  })

  it('does not treat missing on-disk exports as dirty after a sync watermark exists', () => {
    const projects = [
      entry({
        projectId: 'imported',
        relativePath: 'plasmid.dna',
        updatedAt: '2026-01-01T10:00:00.000Z',
      }),
    ]
    const plan = planDatabaseSyncCandidates(projects, '2026-01-01T11:00:00.000Z')
    expect(plan.candidates).toHaveLength(0)
    expect(plan.skippedUnchanged).toBe(1)
  })

  it('queues everything when never synced', () => {
    const projects = [
      entry({ projectId: 'a', relativePath: 'a.dna', updatedAt: '2026-01-01T00:00:00.000Z' }),
      entry({ projectId: 'b', relativePath: 'b.dna', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ]
    const plan = planDatabaseSyncCandidates(projects, null)
    expect(plan.skippedUnchanged).toBe(0)
    expect(plan.candidates).toHaveLength(2)
  })
})

describe('folder-scoped sync paths', () => {
  const folders = [
    { id: 'vnti', name: 'VectorNTI files', parentId: null },
    { id: 'sub', name: 'Gateway', parentId: 'vnti' },
    { id: 'other', name: 'Other', parentId: null },
  ]

  it('strips the import-folder root so sync does not nest Name/Name', () => {
    expect(folderPathRelativeToRoot(folders, 'vnti', 'vnti')).toBe('')
    expect(folderPathRelativeToRoot(folders, 'sub', 'vnti')).toBe('Gateway')
    expect(folderPathRelativeToRoot(folders, 'vnti', null)).toBe('VectorNTI files')
    expect(folderPathRelativeToRoot(folders, 'sub', null)).toBe('VectorNTI files/Gateway')
  })

  it('matches a unique top-level folder by OS folder basename', () => {
    expect(matchTopLevelFolderByName(folders, 'VectorNTI files')).toBe('vnti')
    expect(matchTopLevelFolderByName(folders, 'Gateway')).toBe(null)
    expect(matchTopLevelFolderByName(folders, 'Missing')).toBe(null)
  })
})

describe('inbound Sync to database planning', () => {
  it('matches gb on disk to dna export stems', () => {
    expect(sequenceFileStem('pUC19.gb')).toBe('pUC19')
    expect(constructSyncKey('Gateway/pUC19.gb')).toBe('gateway/puc19')
    expect(constructSyncKey('Gateway/pUC19.dna')).toBe('gateway/puc19')
  })

  it('adds new files, updates when hash differs, and skips matches without re-parse', () => {
    const watermark = '2026-06-01T12:00:00.000Z'
    const watermarkMs = Date.parse(watermark)
    const plan = planInboundConstructSync(
      [
        { relativePath: 'old.gb', mtimeMs: watermarkMs + 10_000, contentHash: 'hash-old' },
        { relativePath: 'newer.gb', mtimeMs: watermarkMs + 10_000, contentHash: 'hash-new' },
        { relativePath: 'brand-new.fasta', mtimeMs: watermarkMs - 5000, contentHash: 'hash-brand' },
        { relativePath: 'Sub/extra.dna', mtimeMs: watermarkMs + 1, contentHash: 'hash-extra' },
        { relativePath: 'touched.gb', mtimeMs: watermarkMs + 10_000, contentHash: 'hash-touched' },
      ],
      [
        { projectId: 'p-old', relativePath: 'old.dna', updatedAt: watermark, syncSourceHash: 'hash-old' },
        { projectId: 'p-newer', relativePath: 'newer.dna', updatedAt: watermark, syncSourceHash: 'hash-stale' },
        {
          projectId: 'p-touched',
          relativePath: 'touched.dna',
          updatedAt: watermark,
          syncSourceHash: 'hash-touched',
        },
      ],
      watermark,
    )

    expect(plan.actions.filter((row) => row.kind === 'add').map((row) => row.relativePath)).toEqual([
      'brand-new.fasta',
      'Sub/extra.dna',
    ])
    expect(plan.actions.filter((row) => row.kind === 'update')).toEqual([
      { kind: 'update', relativePath: 'newer.gb', key: 'newer', projectId: 'p-newer' },
    ])
    expect(plan.skippedUnchanged).toBe(2)
  })

  it('does not re-parse path matches when mtime is newer but no content hash is stored yet', () => {
    const watermark = '2026-06-01T12:00:00.000Z'
    const plan = planInboundConstructSync(
      [{ relativePath: 'big.gb', mtimeMs: Date.parse(watermark) + 60_000, contentHash: 'abc' }],
      [{ projectId: 'p1', relativePath: 'big.dna', updatedAt: watermark }],
      watermark,
    )
    expect(plan.actions.filter((row) => row.kind === 'update')).toEqual([])
    expect(plan.actions.filter((row) => row.kind === 'skip' && row.reason === 'unchanged')).toHaveLength(1)
  })

  it('without a watermark, does not rewrite matches on mtime alone', () => {
    const updatedAt = '2026-06-01T12:00:00.000Z'
    const updatedMs = Date.parse(updatedAt)
    const plan = planInboundConstructSync(
      [
        { relativePath: 'same.gb', mtimeMs: updatedMs - 60_000 },
        { relativePath: 'edited.gb', mtimeMs: updatedMs + 60_000 },
      ],
      [
        { projectId: 'p-same', relativePath: 'same.dna', updatedAt },
        { projectId: 'p-edited', relativePath: 'edited.dna', updatedAt },
      ],
      null,
    )
    expect(plan.actions.filter((row) => row.kind === 'update')).toEqual([])
    expect(plan.skippedUnchanged).toBe(2)
  })

  it('updates when on-disk bytes differ from the stored sync hash', () => {
    const plan = planInboundConstructSync(
      [{ relativePath: 'plasmid.gb', mtimeMs: Date.parse('2099-01-02T00:00:00.000Z'), contentHash: 'aaa' }],
      [{ projectId: 'p1', relativePath: 'plasmid.dna', syncSourceHash: 'bbb' }],
      '2000-01-01T00:00:00.000Z',
    )
    expect(plan.actions.filter((row) => row.kind === 'update')).toEqual([
      { kind: 'update', relativePath: 'plasmid.gb', key: 'plasmid', projectId: 'p1' },
    ])
  })

  it('updates when stored hash differs from every same-stem file on disk', () => {
    const plan = planInboundConstructSync(
      [{ relativePath: 'plasmid.dna', mtimeMs: Date.parse('2099-01-02T00:00:00.000Z'), contentHash: 'aaa' }],
      [{ projectId: 'p1', relativePath: 'plasmid.dna', syncSourceHash: 'bbb' }],
      '2000-01-01T00:00:00.000Z',
    )
    expect(plan.actions.filter((row) => row.kind === 'update')).toEqual([
      { kind: 'update', relativePath: 'plasmid.dna', key: 'plasmid', projectId: 'p1' },
    ])
  })

  it('does not re-parse when hash disagrees but the file is older than last sync', () => {
    const plan = planInboundConstructSync(
      [{ relativePath: 'plasmid.dna', mtimeMs: Date.parse('2000-01-01T00:00:00.000Z'), contentHash: 'aaa' }],
      [{ projectId: 'p1', relativePath: 'plasmid.dna', syncSourceHash: 'bbb' }],
      '2099-01-01T00:00:00.000Z',
    )
    expect(plan.actions.filter((row) => row.kind === 'update')).toEqual([])
    expect(plan.skippedUnchanged).toBe(1)
  })

  it('skips truncated SnapGene twin files when a longer stem exists in the same folder', () => {
    const plan = planInboundConstructSync(
      [
        { relativePath: 'Lab/pcDNA3-DN-.dna', mtimeMs: 1, contentHash: 'short' },
        { relativePath: 'Lab/pcDNA3-DN-p73-alpha.gb', mtimeMs: 1, contentHash: 'full' },
      ],
      [
        {
          projectId: 'p1',
          relativePath: 'Lab/pcDNA3-DN-p73-alpha.dna',
          syncRelativePath: 'Lab/pcDNA3-DN-p73-alpha.gb',
          syncSourceHash: 'full',
        },
      ],
      '2099-01-01T00:00:00.000Z',
    )
    expect(plan.actions.filter((row) => row.kind === 'add')).toEqual([])
    expect(plan.actions.some((row) => row.kind === 'skip' && row.relativePath.endsWith('pcDNA3-DN-.dna'))).toBe(
      true,
    )
  })
  it('skips when on-disk bytes match the stored sync hash even if mtime is newer', () => {
    const plan = planInboundConstructSync(
      [{ relativePath: 'plasmid.gb', mtimeMs: Date.parse('2099-01-02T00:00:00.000Z'), contentHash: 'abc' }],
      [{ projectId: 'p1', relativePath: 'plasmid.dna', syncSourceHash: 'abc' }],
      '2000-01-01T00:00:00.000Z',
    )
    expect(plan.actions.filter((row) => row.kind === 'update')).toEqual([])
    expect(plan.skippedUnchanged).toBe(1)
  })

  it('without timestamps, does not rewrite every matched construct', () => {
    const plan = planInboundConstructSync(
      [{ relativePath: 'plasmid.gb', mtimeMs: null }],
      [{ projectId: 'p1', relativePath: 'plasmid.dna' }],
      null,
    )
    expect(plan.actions.filter((row) => row.kind === 'update')).toEqual([])
    expect(plan.skippedUnchanged).toBe(1)
  })

  it('prefers .dna when duplicate stems exist on disk', () => {
    const plan = planInboundConstructSync(
      [
        { relativePath: 'plasmid.gb', mtimeMs: 2 },
        { relativePath: 'plasmid.dna', mtimeMs: 1 },
      ],
      [],
      null,
    )
    expect(plan.actions.filter((row) => row.kind === 'add')).toEqual([
      { kind: 'add', relativePath: 'plasmid.dna', key: 'plasmid' },
    ])
    expect(plan.skippedDuplicates).toBe(1)
  })

  it('lists library constructs with no matching disk file for cleanup', () => {
    expect(
      planInboundCleanupRemovals(
        [{ relativePath: 'keep.gb', mtimeMs: 1 }],
        [
          { projectId: 'keep', relativePath: 'keep.dna' },
          { projectId: 'gone', relativePath: 'gone.dna' },
          { projectId: 'also-gone', relativePath: 'Sub/missing.dna' },
        ],
      ),
    ).toEqual(['gone', 'also-gone'])
  })

  it('matches disk files via syncRelativePath when export name differs', () => {
    const plan = planInboundConstructSync(
      [{ relativePath: 'Sub/p66shc-NM_183001.gb', mtimeMs: 1, contentHash: 'h1' }],
      [
        {
          projectId: 'p1',
          relativePath: 'Sub/Homo sapiens SHC1.dna',
          syncRelativePath: 'Sub/p66shc-NM_183001.gb',
          syncSourceHash: 'h1',
        },
      ],
      '2099-01-01T00:00:00.000Z',
    )
    expect(plan.actions.filter((row) => row.kind === 'add')).toEqual([])
    expect(plan.actions.filter((row) => row.kind === 'update')).toEqual([])
    expect(plan.skippedUnchanged).toBe(1)
    expect(plan.matchedProjectIds).toEqual(['p1'])
  })

  it('rematches by content hash when path keys disagree', () => {
    const plan = planInboundConstructSync(
      [{ relativePath: 'file-on-disk.gb', mtimeMs: 1, contentHash: 'same' }],
      [
        {
          projectId: 'p1',
          relativePath: 'GenBank Locus Name.dna',
          syncSourceHash: 'same',
        },
      ],
      '2099-01-01T00:00:00.000Z',
    )
    expect(plan.actions.filter((row) => row.kind === 'add')).toEqual([])
    expect(plan.matchedProjectIds).toEqual(['p1'])
    expect(
      planInboundCleanupRemovals(
        [{ relativePath: 'file-on-disk.gb', mtimeMs: 1, contentHash: 'same' }],
        [{ projectId: 'p1', relativePath: 'GenBank Locus Name.dna', syncSourceHash: 'same' }],
        plan.matchedProjectIds,
      ),
    ).toEqual([])
  })

  it('treats library .gb hash as unchanged when preferred disk file is .dna', () => {
    const plan = planInboundConstructSync(
      [
        { relativePath: 'plasmid.gb', mtimeMs: 1, contentHash: 'hash-gb' },
        { relativePath: 'plasmid.dna', mtimeMs: 2, contentHash: 'hash-dna' },
      ],
      [
        {
          projectId: 'p1',
          relativePath: 'Some Locus Name.dna',
          syncSourceHash: 'hash-gb',
        },
      ],
      '2099-01-01T00:00:00.000Z',
    )
    expect(plan.actions.filter((row) => row.kind === 'add')).toEqual([])
    expect(plan.actions.filter((row) => row.kind === 'update')).toEqual([])
    expect(plan.matchedProjectIds).toEqual(['p1'])
    expect(plan.skippedUnchanged).toBeGreaterThanOrEqual(1)
  })

  it('keeps real on-disk (N) filenames distinct from the unnumbered twin', () => {
    expect(constructSyncKey('Lab/foo.gb')).toBe('lab/foo')
    expect(constructSyncKey('Lab/foo (2).gb')).toBe('lab/foo (2)')
    const plan = planInboundConstructSync(
      [
        { relativePath: 'Lab/foo.gb', mtimeMs: 1, contentHash: 'h1' },
        { relativePath: 'Lab/foo (2).gb', mtimeMs: 1, contentHash: 'h2' },
      ],
      [
        {
          projectId: 'p1',
          relativePath: 'Lab/foo.dna',
          syncRelativePath: 'Lab/foo.gb',
          syncSourceHash: 'h1',
        },
        {
          projectId: 'p2',
          relativePath: 'Lab/foo (2).dna',
          syncRelativePath: 'Lab/foo (2).gb',
          syncSourceHash: 'h2',
        },
      ],
      '2099-01-01T00:00:00.000Z',
    )
    expect(plan.actions.filter((row) => row.kind === 'add')).toEqual([])
    expect(plan.skippedDuplicates).toBe(0)
    expect(plan.matchedProjectIds.sort()).toEqual(['p1', 'p2'])
  })

  it('matches export uniqueRelativePath (N) to the unnumbered disk file', () => {
    const plan = planInboundConstructSync(
      [{ relativePath: 'Lab/HaloTag.gb', mtimeMs: 1, contentHash: 'h' }],
      [
        {
          projectId: 'p1',
          relativePath: 'Lab/HaloTag (2).dna',
          syncSourceHash: 'h',
        },
      ],
      '2099-01-01T00:00:00.000Z',
    )
    expect(plan.actions.filter((row) => row.kind === 'add')).toEqual([])
    expect(plan.matchedProjectIds).toEqual(['p1'])
  })

  it('removes duplicate library rows that share the same syncRelativePath', () => {
    const disk = [{ relativePath: 'Lab/a.gb', mtimeMs: 1, contentHash: 'h' }]
    const library = [
      {
        projectId: 'keep',
        relativePath: 'Lab/a.dna',
        syncRelativePath: 'Lab/a.gb',
        syncSourceHash: 'h',
      },
      {
        projectId: 'dup',
        relativePath: 'Lab/a (2).dna',
        syncRelativePath: 'Lab/a.gb',
        syncSourceHash: 'h',
      },
    ]
    const plan = planInboundConstructSync(disk, library, '2099-01-01T00:00:00.000Z')
    expect(planInboundCleanupRemovals(disk, library, plan.matchedProjectIds)).toEqual(['dup'])
  })

  it('fuzzy-rematches truncated export names in the same folder', () => {
    const plan = planInboundConstructSync(
      [{ relativePath: 'Lab/pET-TEV-Sesn2.gb', mtimeMs: 1, contentHash: 'h' }],
      [
        {
          projectId: 'p1',
          relativePath: 'Lab/pET-TEV-Se.dna',
          syncSourceHash: 'other',
        },
      ],
      '2099-01-01T00:00:00.000Z',
    )
    expect(plan.actions.filter((row) => row.kind === 'add')).toEqual([])
    expect(plan.matchedProjectIds).toEqual(['p1'])
  })
})
