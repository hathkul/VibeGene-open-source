import { describe, expect, it } from 'vitest'
import { featureArrowForPiece } from './featureDirectionality'
import { featureEditorFromFeature, featureFromEditor } from './featureQualifiers'
import type { SequenceFeature } from './types'

function piece(feature: SequenceFeature, strand: 'forward' | 'reverse', isFeatureStart: boolean, isFeatureEnd: boolean) {
  return featureArrowForPiece({ feature, strand, isFeatureStart, isFeatureEnd })
}

describe('feature directionality arrows', () => {
  const base: SequenceFeature = {
    id: 'feature',
    name: 'feature',
    type: 'misc_feature',
    color: '',
    locations: [{ start: 10, end: 20, strand: 'forward' }],
  }

  it('uses explicit none, forward, reverse, and bidirectional arrows independent of feature type', () => {
    expect(piece({ ...base, directionality: 'none' }, 'forward', true, true)).toBe('none')
    expect(piece({ ...base, directionality: 'forward' }, 'forward', true, true)).toBe('forward')
    expect(piece({ ...base, directionality: 'reverse' }, 'forward', true, true)).toBe('reverse')
    expect(piece({ ...base, directionality: 'both' }, 'forward', true, true)).toBe('both')
  })

  it('puts bidirectional arrows only on the outer endpoints of multisegment features', () => {
    const feature = { ...base, directionality: 'both' as const }
    expect(piece(feature, 'forward', true, false)).toBe('reverse')
    expect(piece(feature, 'forward', false, true)).toBe('forward')
  })

  it('round-trips no direction without changing the feature strand', () => {
    const reverseFeature = {
      ...base,
      locations: [{ start: 10, end: 20, strand: 'reverse' as const }],
    }
    const draft = featureEditorFromFeature(reverseFeature)
    draft.directionality = 'none'
    const saved = featureFromEditor(draft)
    expect(saved.directionality).toBe('none')
    expect(saved.locations[0]?.strand).toBe('reverse')
  })
})
