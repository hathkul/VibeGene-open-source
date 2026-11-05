import { describe, expect, it } from 'vitest'
import type { SequenceFeature } from '../../domain/types'
import { featureDrawableSegments } from './featureRendering'

describe('featureDrawableSegments', () => {
  it('renders source features like other feature annotations', () => {
    const source = {
      id: 'source-1',
      name: 'source',
      type: 'source',
      color: '',
      locations: [{ start: 0, end: 20, strand: 'forward' }],
    } as SequenceFeature

    expect(featureDrawableSegments([source], 20)).toEqual([{
      feature: source,
      segmentId: 'source-1:0-20',
      start: 0,
      end: 20,
      strand: 'forward',
      isFeatureStart: true,
      isFeatureEnd: true,
    }])
  })
})
