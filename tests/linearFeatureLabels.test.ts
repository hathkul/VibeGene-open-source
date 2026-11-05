import { describe, expect, it } from 'vitest'
import {
  estimateLinearInlineFeatureLabelWidthPx,
  estimateLinearInlineFeatureTextWidthPx,
  layoutLinearFeatureLabels,
  linearFeatureInlineLabelCenterX,
  linearFeatureInlineLabelFitsDirectionalBody,
  linearFeatureLabelFitsInBody,
  linearFeatureUsableLabelWidthPx,
} from '../src/domain/linearFeatureLabels'

describe('linearFeatureLabels', () => {
  it('keeps the visible text estimate separate from fit reserves', () => {
    expect(estimateLinearInlineFeatureTextWidthPx('β-globin intron', 12)).toBeCloseTo(100.8)
    expect(estimateLinearInlineFeatureLabelWidthPx('β-globin intron', 12)).toBeCloseTo(112.8)
  })
  it('keeps names that fit in the body as inline', () => {
    const width = estimateLinearInlineFeatureLabelWidthPx('lacZ', 11)
    expect(linearFeatureLabelFitsInBody(80, width)).toBe(true)
    const { placements } = layoutLinearFeatureLabels(
      [
        {
          segmentId: 'a',
          featureId: 'f1',
          name: 'lacZ',
          priority: 1,
          spanBp: 100,
          body: { left: 0, right: 80, top: 40, bottom: 55 },
          labelWidth: width,
          textHeight: 12,
        },
      ],
      { rowHeight: 26, allowExternal: true },
    )
    expect(placements).toEqual([{ segmentId: 'a', kind: 'inline' }])
  })

  it('places an overflowing name half a row below when clear', () => {
    const width = estimateLinearInlineFeatureLabelWidthPx('VeryLongFeatureNameXYZ', 11)
    expect(linearFeatureLabelFitsInBody(20, width)).toBe(false)
    const { placements } = layoutLinearFeatureLabels(
      [
        {
          segmentId: 'a',
          featureId: 'f1',
          name: 'VeryLongFeatureNameXYZ',
          priority: 1,
          spanBp: 10,
          body: { left: 100, right: 120, top: 40, bottom: 55 },
          labelWidth: width,
          textHeight: 12,
        },
      ],
      { rowHeight: 26, allowExternal: true, mapLeft: 0, mapRight: 400 },
    )
    expect(placements[0]?.kind).toBe('belowHalf')
    if (placements[0]?.kind === 'belowHalf') {
      expect(placements[0].x).toBe(110)
      expect(placements[0].y).toBeGreaterThan(55)
      expect(placements[0].y).toBeLessThan(55 + 13)
    }
  })

  it('falls back to a full-row leader label and keeps the leader under the label', () => {
    const width = 60
    const { placements } = layoutLinearFeatureLabels(
      [
        {
          segmentId: 'a',
          featureId: 'f1',
          name: 'NeedsLeader',
          priority: 1,
          spanBp: 10,
          body: { left: 100, right: 120, top: 40, bottom: 55 },
          labelWidth: width,
          textHeight: 12,
        },
      ],
      {
        rowHeight: 26,
        allowExternal: true,
        mapLeft: 0,
        mapRight: 400,
        obstacles: [{ left: 80, right: 140, top: 55, bottom: 68 }],
      },
    )
    const target = placements.find((p) => p.segmentId === 'a')
    expect(target?.kind === 'belowFull' || target?.kind === 'external').toBe(true)
    if (target?.kind === 'belowFull') {
      expect(target.leaderX).toBeGreaterThanOrEqual(target.labelCenterX - target.width / 2 - 0.5)
      expect(target.leaderX).toBeLessThanOrEqual(target.labelCenterX + target.width / 2 + 0.5)
    }
  })

  it('marks labels external when lower tiers are blocked and external is allowed', () => {
    const width = 80
    const bodies = Array.from({ length: 6 }, (_, index) => {
      const left = 40 + index * 8
      return {
        segmentId: `s${index}`,
        featureId: `f${index}`,
        name: 'CrowdedLabelName',
        priority: index,
        spanBp: 5,
        body: { left, right: left + 12, top: 40, bottom: 55 },
        labelWidth: width,
        textHeight: 12,
      }
    })
    const { placements } = layoutLinearFeatureLabels(bodies, {
      rowHeight: 26,
      allowExternal: true,
      mapLeft: 0,
      mapRight: 400,
      obstacles: [{ left: 0, right: 400, top: 55, bottom: 120 }],
    })
    const externals = placements.filter((p) => p.kind === 'external' && p.segmentId.startsWith('s'))
    expect(externals.length).toBeGreaterThan(0)
  })

  it('does not use external labels when the feature row disallows them', () => {
    const { placements } = layoutLinearFeatureLabels(
      [
        {
          segmentId: 'row1',
          featureId: 'f1',
          name: 'CrowdedLabelName',
          priority: 1,
          spanBp: 5,
          allowExternal: false,
          body: { left: 100, right: 112, top: 40, bottom: 55 },
          labelWidth: 80,
          textHeight: 12,
        },
      ],
      {
        rowHeight: 26,
        allowExternal: true,
        mapLeft: 0,
        mapRight: 400,
        obstacles: [{ left: 0, right: 400, top: 55, bottom: 120 }],
      },
    )
    expect(placements.find((p) => p.segmentId === 'row1')).toBeUndefined()
  })

  it('reserves a full arrowhead and centers the label in the flat body', () => {
    expect(linearFeatureUsableLabelWidthPx(100, false, 16)).toBe(100)
    expect(linearFeatureUsableLabelWidthPx(100, true, 16)).toBe(84)
    expect(linearFeatureInlineLabelCenterX(0, 100, true, 16, 'forward')).toBe(42)
    expect(linearFeatureInlineLabelCenterX(0, 100, true, 16, 'reverse')).toBe(58)
  })

  it('demotes directional labels that would run past the blunt edge', () => {
    // Label wider than the flat body (100 - 16) after tip reserve → must not stay inline.
    const { placements } = layoutLinearFeatureLabels(
      [
        {
          segmentId: 'a',
          featureId: 'f1',
          name: 'AlmostFitsButOverflowsBlunt',
          priority: 1,
          spanBp: 80,
          body: { left: 0, right: 100, top: 40, bottom: 55 },
          usableBodyWidth: linearFeatureUsableLabelWidthPx(100, true, 16),
          strand: 'forward',
          arrowLengthPx: 16,
          labelWidth: 90,
          textHeight: 12,
        },
      ],
      { rowHeight: 26, allowExternal: true, mapLeft: -50, mapRight: 200 },
    )
    expect(placements[0]?.kind).not.toBe('inline')
    expect(linearFeatureInlineLabelFitsDirectionalBody(0, 100, 90, true, 16, 'forward')).toBe(false)
    expect(linearFeatureInlineLabelFitsDirectionalBody(0, 100, 70, true, 16, 'forward')).toBe(true)
  })
})
