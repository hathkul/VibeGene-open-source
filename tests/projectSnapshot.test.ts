import { describe, expect, it } from 'vitest'
import { cloneFixture } from '../src/domain/fixtures'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { projectSnapshotsEqual, serializeProjectSnapshot } from '../src/domain/projectSnapshot'
import { nowIso } from '../src/domain/sequence'
import type { SequenceRecord } from '../src/domain/types'
import type { TraceFileRecord } from '../src/domain/traceTypes'

function makeTrace(fileName: string, sequence: string): TraceFileRecord {
  return {
    id: `trace-${fileName}`,
    fileName,
    sequence,
    chromatogram: {
      aTrace: [],
      tTrace: [],
      gTrace: [],
      cTrace: [],
      basePos: [],
      baseCalls: sequence.split(''),
    },
    enabled: true,
    expanded: false,
    showAnnotations: false,
    alignment: null,
  }
}

describe('projectSnapshot', () => {
  it('matches identical record and trace snapshots', () => {
    const record = cloneFixture()
    const traces = record.traceFiles ?? []
    expect(projectSnapshotsEqual(record, traces, record, traces)).toBe(true)
    expect(serializeProjectSnapshot(record, traces)).toBe(serializeProjectSnapshot(record, traces))
  })

  it('detects sequence edits', () => {
    const baseline = cloneFixture()
    const edited = { ...baseline, sequence: `${baseline.sequence}a`, updatedAt: nowIso() }
    expect(projectSnapshotsEqual(baseline, [], edited, [])).toBe(false)
  })

  it('includes trace files in the snapshot', () => {
    const record = cloneFixture()
    const traces = [makeTrace('trace.ab1', 'ATGC')]
    expect(projectSnapshotsEqual(record, [], record, traces)).toBe(false)
  })

  it('distinguishes trace verification and comparative alignment rows', () => {
    const record = cloneFixture()
    const trace = makeTrace('sequence.seq', 'ATGC')
    const comparative = { ...trace, alignmentPurpose: 'comparative' as const }
    expect(projectSnapshotsEqual(record, [trace], record, [comparative])).toBe(false)
  })

  it('does not stringify chromatogram sample arrays', () => {
    const record = cloneFixture()
    const traces = [
      makeTrace('trace.ab1', 'ATGC'),
    ]
    traces[0]!.chromatogram.aTrace = Array.from({ length: 50_000 }, (_, index) => index)
    traces[0]!.chromatogram.tTrace = Array.from({ length: 50_000 }, (_, index) => index)
    traces[0]!.chromatogram.gTrace = Array.from({ length: 50_000 }, (_, index) => index)
    traces[0]!.chromatogram.cTrace = Array.from({ length: 50_000 }, (_, index) => index)
    traces[0]!.chromatogram.basePos = Array.from({ length: 50_000 }, (_, index) => index)
    const snapshot = serializeProjectSnapshot(record, traces)
    expect(snapshot.includes('"aTrace"')).toBe(false)
    expect(snapshot.length).toBeLessThan(50_000)
  })

  it('fingerprints native SnapGene history without stringifying binary packets', () => {
    const record = cloneFixture()
    record.snapGeneNativeHistory = {
      treePayload: new Uint8Array(50_000).fill(17),
      treeFingerprint: 'fnv1a32:example:10',
      nodePackets: [{ nodeId: '2', payload: new Uint8Array(50_000).fill(29) }],
    }
    const snapshot = serializeProjectSnapshot(record, [])
    expect(snapshot).toContain('"treePayloadBytes":50000')
    expect(snapshot).toContain('"payloadBytes":50000')
    expect(snapshot.length).toBeLessThan(50_000)
  })

  it('fingerprints native history nested in protein source DNA', () => {
    const sourceRecord: SequenceRecord = {
      ...cloneFixture(),
      id: 'source-dna',
      snapGeneNativeHistory: {
        treeFingerprint: 'fnv1a32:nested:10',
        nodePackets: [{ nodeId: '2', payload: new Uint8Array(500_000).fill(29) }],
      },
    }
    const protein: SequenceRecord = {
      id: 'protein',
      name: 'Protein',
      description: '',
      molecule: 'protein',
      topology: 'linear',
      sequence: 'MV',
      protein: {
        numberingStart: 1,
        numberingRegions: [],
        bonds: [],
        translationDerivation: {
          kind: 'translated-cds',
          createdAt: nowIso(),
          sources: [{
            projectName: sourceRecord.name,
            sequenceDigest: 'fnv1a64:source',
            sourceRecord,
          }],
        },
      },
      features: [],
      primers: [],
      operations: [],
      construct: defaultConstructProperties,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    const snapshot = serializeProjectSnapshot(protein, [])
    expect(snapshot).toContain('"payloadBytes":500000')
    expect(snapshot).not.toContain('"0":29')
    expect(snapshot.length).toBeLessThan(50_000)
  })

  it('detects chromatogram length changes via fingerprint', () => {
    const record = cloneFixture()
    const left = [makeTrace('trace.ab1', 'ATGC')]
    const right = [makeTrace('trace.ab1', 'ATGC')]
    right[0] = {
      ...right[0]!,
      chromatogram: {
        ...right[0]!.chromatogram,
        aTrace: [1, 2, 3],
      },
    }
    expect(projectSnapshotsEqual(record, left, record, right)).toBe(false)
  })
})
