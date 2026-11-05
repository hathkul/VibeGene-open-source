import { describe, expect, it } from 'vitest'
import {
  buildRichClipboardFragment,
  clipFeaturesForRange,
  clipPrimersForRange,
  mergeRichClipboardAnnotations,
  richClipboardMatchesPasteText,
} from '../src/domain/richClipboard'
import { applySequenceReplacementAnnotations } from '../src/domain/sequence'
import type { Primer, SequenceRecord } from '../src/domain/types'

function makeRecord(sequence: string, features: SequenceRecord['features'], primers: Primer[] = []): SequenceRecord {
  return {
    id: 'rec',
    name: 'test',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features,
    primers,
    operations: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('richClipboard', () => {
  it('clips overlapping features to fragment coordinates', () => {
    const features = clipFeaturesForRange(
      [{
        id: 'f1',
        name: 'CDS',
        type: 'CDS',
        color: '#22c55e',
        locations: [{ start: 8, end: 20 }],
      }],
      10,
      25,
    )
    expect(features).toHaveLength(1)
    expect(features[0]!.locations[0]).toEqual({ start: 0, end: 10 })
  })

  it('builds a rich fragment with clipped primers that overlap the range', () => {
    const bindingTop = 'CTTCTCAAAAGTCTGCTAG'
    const template = 'A'.repeat(10) + bindingTop + 'C'.repeat(20)
    const primer: Primer = {
      id: 'p1',
      name: 'rev',
      sequence: 'AGAGAGCTAGCAGACTTTTGAGAAG',
      color: '#7c3aed',
      bindings: [{
        strand: 'reverse',
        templateStart: 10,
        templateEnd: 29,
        components: [
          { primerBases: 'AGAGAG' },
          { primerBases: 'CTAGCAGACTTTTGAGAAG', templateStart: 10, templateEnd: 29 },
        ],
      }],
    }
    const fragment = buildRichClipboardFragment(makeRecord(template, [], [primer]), 10, 29)
    expect(fragment?.sequence).toBe(bindingTop)
    expect(fragment?.primers).toHaveLength(1)
    expect(fragment?.primers[0]!.bindings?.[0]!.templateStart).toBe(0)
  })

  it('merges pasted features and primers at the insertion point', () => {
    const destination = makeRecord('A'.repeat(30), [{
      id: 'existing',
      name: 'promoter',
      type: 'promoter',
      color: '#2563eb',
      locations: [{ start: 0, end: 5 }],
    }])
    const fragment = {
      id: 'latest',
      fromTabId: 'tab',
      fromRecordId: 'src',
      fromRecordName: 'source',
      sequence: 'GACCACCATGTC',
      rangeStart: 0,
      rangeEnd: 12,
      copiedAt: new Date().toISOString(),
      features: [{
        id: 'clip',
        sourceFeatureId: 'other-cds',
        name: 'insert',
        type: 'CDS',
        color: '#22c55e',
        locations: [{ start: 0, end: 12 }],
      }],
      primers: [{
        id: 'clip-primer',
        name: 'fwd',
        sequence: 'GACCACCATGTC',
        color: '#7c3aed',
        bindings: [{
          strand: 'forward',
          templateStart: 0,
          templateEnd: 12,
          components: [{ primerBases: 'GACCACCATGTC', templateStart: 0, templateEnd: 12 }],
        }],
      }],
    }
    const merged = mergeRichClipboardAnnotations(destination, fragment, 10)
    expect(merged.features).toHaveLength(2)
    expect(merged.features[1]!.locations[0]).toEqual({ start: 10, end: 22 })
    expect(merged.primers).toHaveLength(1)
    expect(merged.primers[0]!.bindings?.[0]!.templateStart).toBe(10)
  })

  it('does not duplicate a feature when pasting a copied sub-range back into the same feature', () => {
    const record = makeRecord('A'.repeat(100), [{
      id: 'cds1',
      name: 'GFP',
      type: 'CDS',
      color: '#22c55e',
      locations: [{ start: 20, end: 80 }],
    }])
    const fragment = buildRichClipboardFragment(record, 30, 42)
    expect(fragment?.features).toHaveLength(1)
    const insertAt = 40
    const insertLength = fragment!.sequence.length
    const adjusted = applySequenceReplacementAnnotations(record, insertAt, insertAt, insertLength)
    const merged = mergeRichClipboardAnnotations(
      { ...record, features: adjusted.features, primers: adjusted.primers },
      {
        id: 'latest',
        fromTabId: 'tab',
        fromRecordId: record.id,
        fromRecordName: record.name,
        copiedAt: new Date().toISOString(),
        ...fragment!,
      },
      insertAt,
    )
    expect(merged.features).toHaveLength(1)
    expect(merged.features[0]!.id).toBe('cds1')
    expect(merged.features[0]!.locations[0]).toEqual({ start: 20, end: 80 + insertLength })
  })

  it('still adds a clipped feature when pasted outside the source feature', () => {
    const record = makeRecord('A'.repeat(100), [{
      id: 'cds1',
      name: 'GFP',
      type: 'CDS',
      color: '#22c55e',
      locations: [{ start: 20, end: 80 }],
    }])
    const fragment = buildRichClipboardFragment(record, 30, 42)
    const insertAt = 85
    const insertLength = fragment!.sequence.length
    const adjusted = applySequenceReplacementAnnotations(record, insertAt, insertAt, insertLength)
    const merged = mergeRichClipboardAnnotations(
      { ...record, features: adjusted.features, primers: adjusted.primers },
      {
        id: 'latest',
        fromTabId: 'tab',
        fromRecordId: record.id,
        fromRecordName: record.name,
        copiedAt: new Date().toISOString(),
        ...fragment!,
      },
      insertAt,
    )
    expect(merged.features).toHaveLength(2)
    expect(merged.features[1]!.name).toBe('GFP')
    expect(merged.features[1]!.locations[0]).toEqual({ start: insertAt, end: insertAt + insertLength })
  })

  it('matches paste text against the stored rich fragment sequence', () => {
    const fragment = {
      id: 'latest',
      fromTabId: 'tab',
      fromRecordId: 'src',
      fromRecordName: 'source',
      sequence: 'gaccaccatgtc',
      rangeStart: 0,
      rangeEnd: 12,
      copiedAt: new Date().toISOString(),
      features: [],
      primers: [],
    }
    expect(richClipboardMatchesPasteText(fragment, 'GACCACCATGTC')).toBe(true)
    expect(richClipboardMatchesPasteText(fragment, 'AAAA')).toBe(false)
  })

  it('includes primers whose binding overlaps only part of the copied range', () => {
    const template = 'NNNNGACCACCATGTCNNNN'
    const primer: Primer = {
      id: 'partial',
      name: 'partial fwd',
      sequence: 'GACCACCATGTC',
      color: '#7c3aed',
    }
    const clipped = clipPrimersForRange(template, [primer], 8, 18)
    expect(clipped).toHaveLength(1)
    expect(clipped[0]!.bindings?.[0]!.templateStart).toBe(0)
    expect(clipped[0]!.bindings?.[0]!.templateEnd).toBe(8)
  })
})
