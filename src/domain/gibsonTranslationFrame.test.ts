import { describe, expect, it } from 'vitest'
import { analyzeGibsonAssembly, assembleGibsonProduct, defaultGibsonPartConfig, resolveGibsonPart } from './gibsonAssembly'
import { defaultFeatureTranslationOptions } from './geneticCode'
import { parseFasta } from './parsers'

describe('Gibson feature clipping', () => {
  it('preserves CDS phase when the incoming overlap removes coding bases', () => {
    const overlap = 'GATTACAGGCTAACGTC'
    const vector = parseFasta(`>vector\n${'C'.repeat(40)}${overlap}`, 'vector.fasta')
    const insert = parseFasta(`>insert\n${overlap}${'T'.repeat(45)}`, 'insert.fasta')
    insert.features = [{
      id: 'cds', name: 'CDS', type: 'CDS', color: '', directionality: 'forward',
      locations: [{ start: 0, end: insert.sequence.length, strand: 'forward' }],
      translateInSequenceView: true, translation: defaultFeatureTranslationOptions(1),
    }]
    const parts = [
      resolveGibsonPart(defaultGibsonPartConfig('vector', vector), 0),
      resolveGibsonPart(defaultGibsonPartConfig('fragment', insert), 1),
    ]
    const analysis = analyzeGibsonAssembly(parts, { mode: 'linear', minOverlap: 15 })
    expect(analysis.ready).toBe(true)
    expect(analysis.junctions[0]?.overlapLength).toBe(17)
    const product = assembleGibsonProduct({ parts, analysis, productName: 'assembled' })
    const cds = product.features.find((feature) => feature.name === 'CDS')
    expect(cds?.locations[0]?.start).toBe(vector.sequence.length)
    expect(cds?.translation?.readingFrame).toBe(2)
  })

  it('reverses feature direction, frame, and anchor when a part is reversed', () => {
    const source = parseFasta('>insert\nATGAAACCCGGG', 'insert.fasta')
    source.features = [{
      id: 'cds', name: 'CDS', type: 'CDS', color: '', directionality: 'forward',
      locations: [{ start: 0, end: 9, strand: 'forward' }], sourceTranslationAnchor: 0,
      translateInSequenceView: true, translation: defaultFeatureTranslationOptions(1),
    }]
    const config = defaultGibsonPartConfig('fragment', source)
    config.orientation = 'reverse'
    const resolved = resolveGibsonPart(config, 0)
    expect(resolved.features[0]).toMatchObject({ directionality: 'reverse', sourceTranslationAnchor: 11,
      locations: [{ start: 3, end: 12, strand: 'reverse' }], translation: { readingFrame: -1 } })
  })
})
