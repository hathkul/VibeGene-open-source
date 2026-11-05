import { describe, expect, it } from 'vitest'
import { createCircularMapLayoutHelpers, type CircularMapLayoutHelperScope } from './circularMapLayoutHelpers'
import type { FeatureRenderInfo } from './featureRendering'

describe('circular feature label paths', () => {
  it.each([
    { start: 100, end: 250 },
    { start: 400, end: 600 },
  ])('follows the final map center for labels and no-color backdrops ($start–$end)', ({ start, end }) => {
    const helpers = createCircularMapLayoutHelpers({
      record: { sequence: 'A'.repeat(1000), topology: 'circular' },
      centerX: 400,
      centerY: 350,
    } as CircularMapLayoutHelperScope)
    const feature = { start, end } as FeatureRenderInfo
    const center = { x: 325, y: 390 }

    const endpoints = (path: string) => {
      const match = /^M ([\d.-]+) ([\d.-]+) A [\d.-]+ [\d.-]+ 0 \d \d ([\d.-]+) ([\d.-]+)$/.exec(path)
      if (!match) throw new Error(`Unexpected arc path: ${path}`)
      return match.slice(1).map(Number)
    }
    const compareCenters = (original: string, moved: string) => {
      const from = endpoints(original)
      const to = endpoints(moved)
      expect(to[0] - from[0]).toBeCloseTo(-75)
      expect(to[1] - from[1]).toBeCloseTo(40)
      expect(to[2] - from[2]).toBeCloseTo(-75)
      expect(to[3] - from[3]).toBeCloseTo(40)
    }

    compareCenters(helpers.featureLabelArcAtRadius(feature, 280), helpers.featureLabelArcAtRadius(feature, 280, center))
    compareCenters(
      helpers.featureNoColorLabelBackdropArc(feature, 280, 80),
      helpers.featureNoColorLabelBackdropArc(feature, 280, 80, center),
    )
  })
})
