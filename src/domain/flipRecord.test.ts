// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { flipFeature, flipRecord } from './flipRecord'
import { defaultFeatureTranslationOptions } from './geneticCode'
import { exportSnapGene, parseFasta, parseSnapGene } from './parsers'
import type { SequenceFeature } from './types'
import { themeFixturePalette } from '../test-support/themeFixturePalette'

const feature: SequenceFeature = {
  id: 'cds', name: 'CDS', type: 'CDS', color: themeFixturePalette.grayLong,
  locations: [{ start: 0, end: 9, strand: 'forward' }],
  directionality: 'forward', translateInSequenceView: true,
  translation: defaultFeatureTranslationOptions(1),
}

describe('flipping feature directionality', () => {
  it.each([
    ['forward', 'reverse'], ['reverse', 'forward'], ['none', 'none'], ['both', 'both'],
    [undefined, undefined],
  ] as const)('flips %s to %s and restores it after a second flip', (original, expected) => {
    const source = { ...feature, directionality: original }
    const flipped = flipFeature(source, 30)
    expect(flipped.directionality).toBe(expected)
    expect(flipFeature(flipped, 30)).toEqual(source)
  })

  it('preserves the flipped strand, arrow direction, and translation frame after SnapGene save and reopen', () => {
    const record = parseFasta('>test\nATGAAACCCGGG', 'test.fasta')
    record.features = [feature]
    const flipped = flipRecord(record)
    const reopened = parseSnapGene(exportSnapGene(flipped), 'flipped.dna', { skipTraces: true })
    expect(reopened.features[0]).toMatchObject({
      directionality: 'reverse',
      locations: [{ start: 3, end: 12, strand: 'reverse' }],
      translation: { readingFrame: -1 },
    })
  })
})
