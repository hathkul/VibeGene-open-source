import { describe, expect, it } from 'vitest'
import { featureDrawableSegments, minimapFeaturePath } from '../src/presentation/map/featureRendering'
import { linearFeatureShowsArrow } from '../src/presentation/map/mapPrimitives'
import type { SequenceFeature } from '../src/domain/types'

describe('reverse multi-segment feature arrows', () => {
  it('puts the reverse arrow on the low-coordinate terminal segment', () => {
    const feature: SequenceFeature = {
      id: 'ampr',
      name: 'AmpR',
      type: 'CDS',
      color: '#ccffcc',
      locations: [
        { start: 4828, end: 5620, strand: 'reverse' },
        { start: 5620, end: 5689, strand: 'reverse' },
      ],
    }
    const segments = featureDrawableSegments([feature], 5824)
    const lowCoordinateSegment = segments.find((segment) => segment.start === 4828)!
    const highCoordinateSegment = segments.find((segment) => segment.start === 5620)!

    expect(lowCoordinateSegment.isFeatureEnd).toBe(true)
    expect(highCoordinateSegment.isFeatureStart).toBe(true)
    expect(linearFeatureShowsArrow(lowCoordinateSegment)).toBe(true)
    expect(linearFeatureShowsArrow(highCoordinateSegment)).toBe(false)

    const arrowPath = minimapFeaturePath(lowCoordinateSegment, 0, 5824, 5824, 0, 10)
    expect(arrowPath).toContain('L 4828 5')
  })
})
