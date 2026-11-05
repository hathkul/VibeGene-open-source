import { describe, expect, it } from 'vitest'
import { defaultPrimerHybridizationParams } from '../../domain/primerHybridization'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { Primer, SequenceRecord } from '../../domain/types'
import {
  addPrimers,
  deletePrimers,
  duplicatePrimers,
  refreshPrimerHybridization,
  savePrimer,
  setPrimerVisibility,
} from './primerWorkflow'

const hybridization = { ...defaultPrimerHybridizationParams, minContinuousMatchLen: 4, minMeltingTemperature: 0 }

function primer(id: string, sequence = 'ACGTACGT'): Primer {
  return { id, name: id, sequence, color: id }
}

function record(primers: Primer[]): SequenceRecord {
  return {
    id: 'record', name: 'record', molecule: 'dna', topology: 'linear', sequence: 'ACGTACGTACGT',
    features: [], primers, history: [],
  } as unknown as SequenceRecord
}

function member(id: string, primers: Primer[] = [], sequence = 'ACGTACGTACGT'): TraceFileRecord {
  return {
    id, fileName: `${id}.ab1`, sequence, chromatogram: {} as never,
    enabled: true, expanded: false, showAnnotations: true, alignment: null, primers,
  }
}

describe('primer workflow transitions', () => {
  it('duplicates consensus primers and projects them onto hybridizing members', () => {
    const source = primer('p1')
    const result = duplicatePrimers({
      record: record([source]), members: [member('m1')], isLibrary: true,
      referenceMemberId: null, hybridization,
    }, [source], () => 'copy', null)

    expect(result.added[0]?.id).toBe('copy')
    expect(result.record.primers.map((entry) => entry.id)).toEqual(['p1', 'copy'])
    expect(result.members[0]?.primers?.map((entry) => entry.id)).toEqual(['copy'])
  })

  it('edits a reference member, updates consensus, and refreshes projections', () => {
    const edited = primer('p1', 'TGCATGCA')
    const result = savePrimer({
      record: record([primer('p1')]), members: [member('reference', [], 'TGCATGCATGCA'), member('peer', [], 'TGCATGCATGCA')], isLibrary: true,
      referenceMemberId: 'reference', hybridization,
    }, edited, 'reference')

    expect(result.record.primers[0]?.sequence).toBe('TGCATGCA')
    expect(result.members[0]?.primers?.[0]?.sequence).toBe('TGCATGCA')
    expect(result.members[1]?.primers?.[0]?.sequence).toBe('TGCATGCA')
  })

  it('deletes consensus primers from every member but keeps member-local deletes scoped', () => {
    const p1 = primer('p1')
    const p2 = primer('p2', 'TGCATGCA')
    const context = { record: record([p1, p2]), members: [member('m1', [p1, p2])], isLibrary: true, referenceMemberId: null, hybridization }
    const deleted = deletePrimers(context, [p1], null)
    expect(deleted.record.primers.map((entry) => entry.id)).toEqual(['p2'])
    expect(deleted.members[0]?.primers?.map((entry) => entry.id)).toEqual(['p2'])
    const local = deletePrimers(context, [p1], 'm1')
    expect(local.record.primers.map((entry) => entry.id)).toEqual(['p1', 'p2'])
    expect(local.members[0]?.primers?.map((entry) => entry.id)).toEqual(['p2'])
  })

  it('applies multi-selection visibility without mutating unrelated primers', () => {
    const p1 = primer('p1')
    const p2 = primer('p2')
    const result = setPrimerVisibility({ record: record([p1, p2]), members: [], isLibrary: false, referenceMemberId: null, hybridization }, ['p1'], false, null)
    expect(result.record.primers.map((entry) => entry.visible)).toEqual([false, undefined])
  })

  it('refreshes hybridization and reports dropped consensus primers', () => {
    const good = primer('good')
    const bad = primer('bad', 'AAAAAAAA')
    const result = refreshPrimerHybridization({
      record: record([good, bad]), members: [member('m1')], isLibrary: true,
      referenceMemberId: null, hybridization,
    }, ['ACGTACGTACGT'])
    expect(result.record.primers.map((entry) => entry.id)).toEqual(['good'])
    expect(result.dropped.map((entry) => entry.id)).toEqual(['bad'])
  })

  it('adds only unique hybridizing primers and reports removed stale entries', () => {
    const stale = primer('stale', 'CCCCCCCC')
    const existing = primer('existing')
    const incoming = primer('incoming', 'GTACGTAC')
    const result = addPrimers({
      record: record([stale, existing]), members: [], isLibrary: false,
      referenceMemberId: null, hybridization,
    }, [existing, incoming])
    expect(result.record.primers.map((entry) => entry.id)).toEqual(['existing', 'incoming'])
    expect(result.added.map((entry) => entry.id)).toEqual(['incoming'])
    expect(result.removed.map((entry) => entry.id)).toEqual(['stale'])
  })

  it('keeps existing primers when adding picked candidates without a refresh', () => {
    const stale = primer('stale', 'CCCCCCCC')
    const incoming = primer('incoming', 'GTACGTAC')
    const result = addPrimers({
      record: record([stale]), members: [], isLibrary: false,
      referenceMemberId: null, hybridization,
    }, [incoming], { refreshExisting: false })
    expect(result.record.primers.map((entry) => entry.id)).toEqual(['stale', 'incoming'])
    expect(result.removed).toEqual([])
  })
})
