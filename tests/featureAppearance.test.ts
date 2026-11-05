import { describe, expect, it } from 'vitest'
import {
  featureNoColorStripeThickness,
  isFeatureNoColor,
} from '../src/domain/featureAppearance'

describe('featureAppearance', () => {
  it('detects SnapGene noColor tokens', () => {
    expect(isFeatureNoColor('noColor')).toBe(true)
    expect(isFeatureNoColor('No Color')).toBe(true)
    expect(isFeatureNoColor('none')).toBe(true)
    expect(isFeatureNoColor('#000000')).toBe(false)
    expect(isFeatureNoColor('#ffffff')).toBe(false)
    expect(isFeatureNoColor(undefined)).toBe(false)
  })

  it('sizes the mid stripe to one third of the band thickness', () => {
    expect(featureNoColorStripeThickness(15)).toBe(5)
    expect(featureNoColorStripeThickness(15.5)).toBeCloseTo(15.5 / 3)
  })
})
