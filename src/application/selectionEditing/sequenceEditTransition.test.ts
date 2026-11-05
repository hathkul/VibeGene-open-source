import { themeFixturePalette } from '../../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../../domain/constructProperties'
import type { HistoryNode, Primer, SequenceFeature, SequenceRecord } from '../../domain/types'
import type { RichClipboardFragment } from '../../domain/richClipboard'
import { applySequenceEditTransition, type SequenceEditReplacement } from './sequenceEditTransition'

const baseRecord = (overrides: Partial<SequenceRecord> = {}): SequenceRecord => ({
  id: 'record-1',
  name: 'Demo',
  description: '',
  molecule: 'dna',
  topology: 'circular',
  sequence: 'ACGTACGT',
  features: [],
  primers: [],
  operations: [],
  construct: defaultConstructProperties,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const replacement = (start: number, end: number, insertedLength: number): SequenceEditReplacement => ({ start, end, insertedLength })

function richFragment(): RichClipboardFragment {
  const feature: SequenceFeature & { sourceFeatureId: string } = {
    id: 'pasted-feature', sourceFeatureId: 'source-feature', name: 'Pasted', type: 'misc_feature', color: themeFixturePalette.purpleFixture,
    locations: [{ start: 0, end: 2, strand: 'forward' }],
  }
  const primer: Primer = { id: 'pasted-primer', name: 'Pasted primer', sequence: 'GG', color: themeFixturePalette.magentaFixture }
  return {
    id: 'fragment-1', fromTabId: 'tab-1', fromRecordId: 'source-1', fromRecordName: 'Source',
    sequence: 'GG', rangeStart: 0, rangeEnd: 2, features: [feature], primers: [primer], copiedAt: '2026-01-01T00:00:00.000Z',
  }
}

function history(editSession = false): HistoryNode {
  return {
    id: 'history-1', name: 'Demo', seqLen: 8, circular: true, operation: 'import', resurrectable: true,
    hideHistory: false, oligos: [], regeneratedSites: [], inputSummaries: [], features: [],
    children: [{
      id: 'snapshot-1', name: 'Demo', seqLen: 8, circular: true, operation: 'import', resurrectable: true,
      hideHistory: false, oligos: [], regeneratedSites: [], inputSummaries: [], features: [], sequence: 'ACGTACGT', children: [],
    }],
    ...(editSession ? { editSession: true } : {}),
  }
}

describe('applySequenceEditTransition', () => {
  it('applies insert/delete replacements immutably and records operations', () => {
    const current = baseRecord()
    const inserted = applySequenceEditTransition(current, {
      nextSequence: 'ACGGGTACGT', replacement: replacement(3, 3, 3),
    })
    expect(inserted.sequence).toBe('ACGGGTACGT')
    expect(inserted.operations[0]).toMatchObject({ type: 'insert' })
    expect(current.sequence).toBe('ACGTACGT')
    const deleted = applySequenceEditTransition(current, {
      nextSequence: 'ACGT', replacement: replacement(2, 6, 0),
    })
    expect(deleted.sequence).toBe('ACGT')
    expect(deleted.operations[0]).toMatchObject({ type: 'remove' })
  })

  it('merges shifted rich annotations while removing duplicate primer sequences', () => {
    const existingPrimer: Primer = { id: 'existing', name: 'Existing', sequence: 'GG', color: themeFixturePalette.namedBlack }
    const current = baseRecord({ primers: [existingPrimer] })
    const next = applySequenceEditTransition(current, {
      nextSequence: 'ACGGGTACGT', replacement: replacement(3, 3, 3), richFragment: richFragment(),
    })
    expect(next.features[0]?.locations[0]).toMatchObject({ start: 3, end: 5 })
    expect(next.primers).toHaveLength(1)
    expect(next.primers[0]).toBe(existingPrimer)
  })

  it('synchronizes translated feature notes against the edited sequence', () => {
    const featureColor = themeFixturePalette.blackLong
    const feature: SequenceFeature = {
      id: 'cds-1', name: 'CDS', type: 'CDS', color: featureColor,
      locations: [{ start: 0, end: 3, strand: 'forward' }], translateInSequenceView: true,
      translation: { geneticCode: 'Standard', firstCodonAsMet: true, readingFrame: 1, consecutiveNumbering: true, segmentNumbering: [{ startAt: 1, skip: false }] },
      notes: '/product="old"',
    }
    const next = applySequenceEditTransition(baseRecord({ sequence: 'ATG', features: [feature] }), {
      nextSequence: 'ATGCC', replacement: replacement(3, 3, 2),
    })
    expect(next.features[0]?.notes).toContain('/translation="M"')
    expect(next.features[0]?.notes === feature.notes).toBe(false)
  })

  it('adjusts linear DNA ends and marks touched imported provenance user-defined', () => {
    const current = baseRecord({
      topology: 'linear', sequence: 'AACCGGTT', dnaEnds: {
        upstream: { modification: 'fivePrimePhosphorylated', stickiness: 2 },
        downstream: { modification: 'fivePrimePhosphorylated', stickiness: -2 },
      }, dnaEndsProvenance: 'snapgene-block8',
    })
    const next = applySequenceEditTransition(current, {
      nextSequence: 'CCGGTT', replacement: replacement(0, 2, 0),
    })
    expect(next.dnaEnds?.upstream.stickiness).toBe(0)
    expect(next.dnaEnds?.downstream.stickiness).toBe(-2)
    expect(next.dnaEndsProvenance).toBe('user-defined')
  })

  it('preserves circular end chemistry when the replacement is internal', () => {
    const current = baseRecord({
      dnaEnds: { upstream: { modification: 'unmodified', stickiness: 1 }, downstream: { modification: 'unmodified', stickiness: -1 } },
      dnaEndsProvenance: 'snapgene-block8',
    })
    const next = applySequenceEditTransition(current, {
      nextSequence: 'ACGTTACGT', replacement: replacement(3, 3, 1),
    })
    expect(next.dnaEnds).toEqual(current.dnaEnds)
    expect(next.dnaEndsProvenance).toBe('snapgene-block8')
  })

  it('clears a cancelled edit session and upserts the net operation otherwise', () => {
    const cancelled = baseRecord({ history: history(true), operations: [{ id: 'op-1', type: 'insert', summary: 'old', createdAt: 'old' }] })
    const cleared = applySequenceEditTransition(cancelled, {
      nextSequence: cancelled.sequence, replacement: replacement(2, 2, 0),
    })
    expect(cleared.history?.editSession).toBeUndefined()
    expect(cleared.operations).toEqual([])

    const active = baseRecord({ history: history(true), operations: [{ id: 'op-1', type: 'insert', summary: 'old', createdAt: 'old' }] })
    const updated = applySequenceEditTransition(active, {
      nextSequence: 'ACGTTACGT', replacement: replacement(4, 4, 1),
    })
    expect(updated.history?.editSession).toBe(true)
    expect(updated.operations[0]).toMatchObject({ id: 'op-1', type: 'insert' })
  })
})
