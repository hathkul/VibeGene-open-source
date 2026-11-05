import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { designPcrPrimerPair } from '../src/domain/pcr'
import {
  analyzeTaGcAssembly,
  assembleTaGcProduct,
  defaultTaGcInsertConfig,
  defaultTaGcVectorConfig,
  formatTaGcProductJunctions,
  formatTaGcStickyPreview,
  resolveTaGcInsert,
  resolveTaGcVector,
  type ResolvedTaGcPart,
} from '../src/domain/taGcCloning'
import type { SequenceRecord } from '../src/domain/types'

function makeRecord(
  name: string,
  sequence: string,
  topology: SequenceRecord['topology'] = 'linear',
): SequenceRecord {
  const dnaEnds = {
    upstream: { modification: 'unmodified' as const, stickiness: -1 },
    downstream: { modification: 'unmodified' as const, stickiness: -1 },
  }
  return {
    id: `seq-${name}`,
    name,
    description: '',
    molecule: 'dna',
    topology,
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: defaultConstructProperties,
    dnaEnds,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('taGcCloning', () => {
  it('assembles a TA product from A-overhang insert and T-vector', () => {
    const insertRec = makeRecord('Insert', 'ACGTACGTACGTACGTA') // A…A
    const vectorRec = makeRecord('Vector', 'AGGGCGAGCTTGCCCTT') // A…T
    const insert = resolveTaGcInsert(
      { ...defaultTaGcInsertConfig(insertRec), mode: 'direct' },
      'ta',
    )
    const vector = resolveTaGcVector(
      { ...defaultTaGcVectorConfig(), source: 'custom', customRecord: vectorRec },
      'ta',
      null,
    )
    expect(insert.ready).toBe(true)
    expect(vector.ready).toBe(true)
    const analysis = analyzeTaGcAssembly(insert, vector, 'ta')
    expect(analysis.ready).toBe(true)
    expect(analysis.productLength).toBe(insert.sequence.length + vector.sequence.length - 2)
    const product = assembleTaGcProduct({
      insert,
      vector,
      analysis,
      productName: 'Cloned.dna',
    })
    expect(product.topology).toBe('circular')
    expect(product.sequence.length).toBe(analysis.productLength)
  })

  it('rejects GC vector under TA method', () => {
    const vectorRec = makeRecord('GC', 'GTCGTCGACGTCGACGAC') // G…C
    const vector = resolveTaGcVector(
      { ...defaultTaGcVectorConfig(), source: 'custom', customRecord: vectorRec },
      'ta',
      null,
    )
    expect(vector.ready).toBe(false)
  })

  it('rejects circular custom vectors without rewriting topology', () => {
    const circular = makeRecord('Circ', 'AGGGCGAGCTTGCCCTT', 'circular')
    const vector = resolveTaGcVector(
      { ...defaultTaGcVectorConfig(), source: 'custom', customRecord: circular },
      'ta',
      null,
    )
    expect(vector.ready).toBe(false)
    expect(vector.message).toMatch(/linear/i)
    expect(circular.topology).toBe('circular')
  })

  it('shows R for PCR sticky insert overhangs instead of template termini', () => {
    const part = {
      sequence: 'GGGGAAAA',
      dnaEnds: {
        upstream: { modification: 'unmodified', stickiness: -1 },
        downstream: { modification: 'unmodified', stickiness: -1 },
      },
      schemaOverhangBase: 'R',
    } as ResolvedTaGcPart
    const up = formatTaGcStickyPreview(part, 'upstream')
    const down = formatTaGcStickyPreview(part, 'downstream')
    // Without schemaOverhangBase, termini would show template bases; R is A/G.
    expect(up.bottom.replace(/\s/g, '')[0]).toBe('r')
    expect(down.top.endsWith('r')).toBe(true)
    const withoutGlyph = formatTaGcStickyPreview(
      { ...part, schemaOverhangBase: null },
      'upstream',
    )
    expect(withoutGlyph.bottom.replace(/\s/g, '')[0]).toBe('c') // complement of template terminal G
  })

  it('keeps insert G and vector C at GC junctions instead of two G bases', () => {
    const insertRec = makeRecord('Insert', 'GATGCATGCATGCG') // G…G
    const vectorRec = makeRecord('Vector', 'GTCGTCGACGTCGAC') // G…C
    const insert = resolveTaGcInsert(
      { ...defaultTaGcInsertConfig(insertRec), mode: 'direct' },
      'gc',
    )
    const vector = resolveTaGcVector(
      { ...defaultTaGcVectorConfig(), source: 'custom', customRecord: vectorRec },
      'gc',
      null,
    )
    expect(insert.ready).toBe(true)
    expect(vector.ready).toBe(true)
    const analysis = analyzeTaGcAssembly(insert, vector, 'gc')
    expect(analysis.ready).toBe(true)
    // BODY (dropped upstream G) + downstream G + vector without upstream G (keeps trailing C)
    expect(analysis.fusedSequence).toBe('ATGCATGCATGCG' + 'TCGTCGACGTCGAC')
    expect(analysis.fusedSequence.endsWith('C')).toBe(true)
    expect(analysis.partSpans).toHaveLength(2)
    expect(analysis.partSpans[0]?.role).toBe('insert')
    expect(analysis.partSpans[1]?.role).toBe('vector')
  })

  it('builds staggered junction glyphs for the product card', () => {
    const preview = formatTaGcProductJunctions('ATGCATGCGTCGAC', 8, {
      contextBases: 4,
      overhangLen: 1,
    })
    expect(preview).not.toBeNull()
    expect(preview!.left.top.some((glyph) => glyph.role === 'insert')).toBe(true)
    expect(preview!.right.top.some((glyph) => glyph.role === 'vector')).toBe(true)
    expect(preview!.left.top.length).toBe(preview!.left.bottom.length)
    const topInsert = preview!.left.top.filter((glyph) => glyph.role === 'insert').length
    const bottomInsert = preview!.left.bottom.filter((glyph) => glyph.role === 'insert').length
    expect(bottomInsert).toBeLessThan(topInsert)
  })

  it('rejects blunt PCR insert against sticky vector', () => {
    const template = makeRecord('Template', `${'GATC'.repeat(80)}${'ACGT'.repeat(80)}`)
    const pair = designPcrPrimerPair(template, 10, 120, 45)
    const insert = resolveTaGcInsert(
      {
        ...defaultTaGcInsertConfig(template),
        mode: 'pcr',
        polymerase: 'blunt',
        forwardPrimer: { ...pair.forward, sourcePrimerId: null },
        reversePrimer: { ...pair.reverse, sourcePrimerId: null },
      },
      'ta',
    )
    const vectorRec = makeRecord('Vector', 'AGGGCGAGCTTGCCCTT')
    const vector = resolveTaGcVector(
      { ...defaultTaGcVectorConfig(), source: 'custom', customRecord: vectorRec },
      'ta',
      null,
    )
    expect(insert.ready).toBe(true)
    expect(vector.ready).toBe(true)
    const analysis = analyzeTaGcAssembly(insert, vector, 'ta')
    expect(analysis.ready).toBe(false)
    expect(analysis.message).toMatch(/blunt/i)
  })
})
