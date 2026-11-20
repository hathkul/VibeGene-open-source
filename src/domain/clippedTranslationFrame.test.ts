import { describe, expect, it } from 'vitest'
import { readingFrameAfterMapping } from './cdsTranslationFrame'
import { defaultFeatureTranslationOptions } from './geneticCode'

describe('reading frame after clipping and coordinate mapping', () => {
  it('counts coding bases rather than introns in a forward multisegment feature', () => {
    const feature = { locations: [{ start: 10, end: 14, strand: 'forward' as const }, { start: 20, end: 29, strand: 'forward' as const }],
      translation: defaultFeatureTranslationOptions(2) }
    expect(readingFrameAfterMapping(feature, (pos) => pos >= 20 ? pos - 20 : null)).toBe(3)
  })

  it('preserves reverse-strand phase when the high-coordinate end is clipped', () => {
    const feature = { locations: [{ start: 10, end: 30, strand: 'reverse' as const }],
      translation: { ...defaultFeatureTranslationOptions(1), readingFrame: -1 as const } }
    expect(readingFrameAfterMapping(feature, (pos) => pos < 28 ? pos + 100 : null)).toBe(-2)
  })

  it('ignores skipped segments when counting coding bases', () => {
    const feature = { locations: [{ start: 1, end: 5, strand: 'forward' as const }, { start: 8, end: 13, strand: 'forward' as const }],
      translation: { ...defaultFeatureTranslationOptions(2), segmentNumbering: [{ startAt: 1, skip: true }, { startAt: 1, skip: false }] } }
    expect(readingFrameAfterMapping(feature, (pos) => pos >= 8 ? pos : null)).toBe(1)
  })
})
