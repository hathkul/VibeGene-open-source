import { describe, expect, it } from 'vitest'
import { defaultRangeForNewFeature, explicitDnaRangeForNewFeature } from './featureQualifiers'

describe('new feature range guardrails', () => {
  it('does not inherit the range of a selected source feature', () => {
    expect(explicitDnaRangeForNewFeature({ start: 0, end: 45_270 }, 'feature', false)).toBeNull()
    expect(explicitDnaRangeForNewFeature({ start: 0, end: 45_270 }, 'primer-binding', false)).toBeNull()
    expect(defaultRangeForNewFeature(45_270)).toEqual({ start: 10, end: 40 })
  })

  it('preserves an explicit DNA selection and rejects incomplete/cut selections', () => {
    expect(explicitDnaRangeForNewFeature({ start: 120, end: 420 }, 'dna-range', false))
      .toEqual({ start: 120, end: 420 })
    expect(explicitDnaRangeForNewFeature({ start: 120, end: 420 }, 'primer-amplicon', false))
      .toEqual({ start: 120, end: 420 })
    expect(explicitDnaRangeForNewFeature({ start: 120, end: 120 }, 'dna-range', false)).toBeNull()
    expect(explicitDnaRangeForNewFeature({ start: 120, end: 420 }, 'dna-range', true)).toBeNull()
  })
})
