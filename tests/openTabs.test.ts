import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { emptyChromatogramForSequence } from '../src/domain/sequenceTraceFactory'
import type { SequenceRecord } from '../src/domain/types'
import type { TraceFileRecord } from '../src/domain/traceTypes'
import {
  isOpenTabStale,
  openTabRecordSnapshot,
  OPEN_TAB_STALE_MS,
} from '../src/crossTab/openTabs'

function record(role?: 'library'): SequenceRecord {
  return {
    id: 'record',
    name: 'Open library',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ATGC',
    features: [],
    primers: [],
    operations: [],
    dna: role ? { documentRole: role } : undefined,
    construct: { ...defaultConstructProperties },
    createdAt: '',
    updatedAt: '',
  }
}

function member(): TraceFileRecord {
  return {
    id: 'member-one',
    fileName: 'Member one.seq',
    sequence: 'AAAGAATTCTTT',
    chromatogram: emptyChromatogramForSequence('AAAGAATTCTTT'),
    enabled: true,
    expanded: true,
    showAnnotations: true,
    alignment: {
      templateStart: 0,
      templateEnd: 4,
      traceStart: 0,
      traceEnd: 4,
      mismatchCount: 0,
      gapCount: 0,
      orientation: 'forward',
      alignmentScore: 4,
      columns: [],
    },
  }
}

describe('openTabs stale detection', () => {
  it('treats recent heartbeats as live', () => {
    const now = Date.parse('2026-07-21T12:00:00.000Z')
    expect(isOpenTabStale(new Date(now - 5_000).toISOString(), now)).toBe(false)
  })

  it('marks tabs older than the grace period as stale', () => {
    const now = Date.parse('2026-07-21T12:00:00.000Z')
    expect(isOpenTabStale(new Date(now - OPEN_TAB_STALE_MS - 1).toISOString(), now)).toBe(true)
  })

  it('keeps lightweight library members available without chromatogram peak arrays', () => {
    const snapshot = openTabRecordSnapshot(record('library'), [member()])

    expect(snapshot.traceFiles?.map((entry) => [entry.id, entry.fileName, entry.sequence])).toEqual([
      ['member-one', 'Member one.seq', 'AAAGAATTCTTT'],
    ])
    expect(snapshot.traceFiles?.[0]?.chromatogram.aTrace).toEqual([])
    expect(snapshot.traceFiles?.[0]?.chromatogram.baseCalls).toEqual([])
    expect(snapshot.traceFiles?.[0]?.alignment).toBeNull()
  })

  it('continues to omit trace data from ordinary open constructs', () => {
    expect(openTabRecordSnapshot(record(), [member()]).traceFiles).toBeUndefined()
  })
})
