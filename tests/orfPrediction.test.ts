import { describe, expect, it } from 'vitest'
import {
  clearOrfPredictionCacheForTests,
  getCachedOrfFeatures,
  getCachedOrfTranslations,
  isOrfFeature,
  orfPredictionCacheKey,
} from '../src/domain/orfPrediction'

const defaultSettings = {
  mode: 'orfs-only' as const,
  minimumLengthAa: 75,
  requireStartCodon: true,
  startCodon: 'ATG',
  geneticCode: 'Standard' as const,
}

describe('orfPrediction cache', () => {
  it('reuses predicted ORFs for the same sequence and settings', () => {
    clearOrfPredictionCacheForTests()
    const sequence = 'ATG'.repeat(80) + 'TAA'
    const first = getCachedOrfFeatures(sequence, defaultSettings)
    const second = getCachedOrfFeatures(sequence, defaultSettings)
    expect(second).toBe(first)
    expect(first.length).toBeGreaterThan(0)
    expect(isOrfFeature(first[0]!)).toBe(true)
  })

  it('invalidates cache when prediction settings change', () => {
    clearOrfPredictionCacheForTests()
    const sequence = 'ATG'.repeat(80) + 'TAA'
    const first = getCachedOrfFeatures(sequence, defaultSettings)
    const second = getCachedOrfFeatures(sequence, { ...defaultSettings, minimumLengthAa: 10 })
    expect(second).not.toBe(first)
    expect(second.length).toBeGreaterThanOrEqual(first.length)
  })

  it('caches translations with features', () => {
    clearOrfPredictionCacheForTests()
    const sequence = 'ATG'.repeat(80) + 'TAA'
    const features = getCachedOrfFeatures(sequence, defaultSettings)
    const translations = getCachedOrfTranslations(sequence, defaultSettings)
    const feature = features[0]!
    expect(feature.translateInSequenceView).toBe(true)
    expect(feature.translation).toBeDefined()
    expect(translations.get(feature.id)?.length).toBeGreaterThan(0)
  })

  it('builds stable cache keys', () => {
    const sequence = 'ATGAAA'
    const keyA = orfPredictionCacheKey(sequence, defaultSettings)
    const keyB = orfPredictionCacheKey(sequence, { ...defaultSettings })
    const keyC = orfPredictionCacheKey(sequence, { ...defaultSettings, mode: 'all-6' })
    expect(keyA).toBe(keyB)
    expect(keyA).not.toBe(keyC)
  })
})
