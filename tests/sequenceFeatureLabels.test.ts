import { describe, expect, it } from 'vitest'
import {
  belowFeatureLabelLeftPx,
  clampBelowLabelLeftPx,
  compressBelowLabelBodyHeights,
  computeFloatingFeatureLabelPlacements,
  estimateFeatureLabelWidthPx,
  floatingFeatureLabelLeftPx,
  pickFeatureLabelRun,
  pickWidestFeatureLabelRun,
  routeBelowFeatureLabelLevels,
  routeBelowFeatureLabels,
  separateBelowFeatureLabelsHorizontally,
  visibleFeatureBodyRuns,
} from '../src/domain/sequenceFeatureLabels'

const baseStepPx = 10

function linearSpanPx(start: number, end: number) {
  return { left: start * baseStepPx, width: (end - start) * baseStepPx }
}

describe('sequenceFeatureLabels', () => {
  it('prefers the widest visible segment for multi-segment features', () => {
    const segments = [
      { featureId: 'f1', start: 0, end: 3, lane: 0 },
      { featureId: 'f1', start: 10, end: 40, lane: 0 },
    ]
    const labels = new Map([['f1', 'LongFeatureName']])
    const placements = computeFloatingFeatureLabelPlacements(
      segments,
      labels,
      0,
      100,
      linearSpanPx,
    )
    expect(placements).toHaveLength(1)
    expect(placements[0]?.below).toBe(false)
    expect(placements[0]?.leftPx).toBeGreaterThan(100)
  })

  it('anchors the label inside the visible viewport window', () => {
    const segments = [{ featureId: 'f1', start: 0, end: 100, lane: 0 }]
    const labels = new Map([['f1', 'Gene']])
    const placements = computeFloatingFeatureLabelPlacements(
      segments,
      labels,
      40,
      70,
      linearSpanPx,
    )
    expect(placements).toHaveLength(1)
    expect(placements[0]?.below).toBe(false)
    expect(placements[0]?.leftPx).toBeGreaterThanOrEqual(400)
    expect(placements[0]?.leftPx).toBeLessThan(700)
  })

  it('places the label below the body when visible body is too narrow', () => {
    const segments = [{ featureId: 'f1', start: 0, end: 2, lane: 0 }]
    const labels = new Map([['f1', 'VeryLongFeatureName']])
    const placements = computeFloatingFeatureLabelPlacements(
      segments,
      labels,
      0,
      100,
      linearSpanPx,
      { rowWidthPx: 1000 },
    )
    expect(placements).toHaveLength(1)
    expect(placements[0]?.below).toBe(true)
    expect(placements[0]?.belowLevel).toBe(0)
    expect(placements[0]?.maxWidthPx).toBe(estimateFeatureLabelWidthPx('VeryLongFeatureName'))
  })

  it('separates nearby below-body labels horizontally before stacking', () => {
    const segments = [
      { featureId: 'f1', start: 0, end: 2, lane: 0 },
      { featureId: 'f2', start: 8, end: 10, lane: 0 },
    ]
    const labels = new Map([
      ['f1', 'AlphaSite'],
      ['f2', 'BetaSite'],
    ])
    const placements = computeFloatingFeatureLabelPlacements(
      segments,
      labels,
      0,
      100,
      linearSpanPx,
    )
    const byId = new Map(placements.map((placement) => [placement.featureId, placement]))
    const left = byId.get('f1')
    const right = byId.get('f2')
    expect(left?.below).toBe(true)
    expect(right?.below).toBe(true)
    expect(left?.belowLevel).toBe(0)
    expect(right?.belowLevel).toBe(0)
    expect(left!.leftPx).toBeLessThan(right!.leftPx)
    expect(left!.leftPx + left!.maxWidthPx + 4).toBeLessThanOrEqual(right!.leftPx + 0.01)
    // Each label still overlaps its own body.
    expect(left!.leftPx).toBeLessThan(20)
    expect(left!.leftPx + left!.maxWidthPx).toBeGreaterThan(0)
    expect(right!.leftPx).toBeLessThan(100)
    expect(right!.leftPx + right!.maxWidthPx).toBeGreaterThan(80)
  })

  it('stacks below-body labels only when horizontal separation cannot clear overlap', () => {
    const segments = [
      { featureId: 'f1', start: 0, end: 2, lane: 0 },
      { featureId: 'f2', start: 1, end: 3, lane: 0 },
    ]
    const labels = new Map([
      ['f1', 'VeryLongRestrictionSiteNameA'],
      ['f2', 'VeryLongRestrictionSiteNameB'],
    ])
    const placements = computeFloatingFeatureLabelPlacements(
      segments,
      labels,
      0,
      100,
      linearSpanPx,
    )
    const levels = placements.filter((placement) => placement.below).map((placement) => placement.belowLevel)
    expect(levels.length).toBe(2)
    expect(new Set(levels).size).toBe(2)
  })

  it('keeps a below-body label overlapping its feature body while sliding', () => {
    const width = 60
    expect(clampBelowLabelLeftPx(-100, width, 10, 20)).toBe(10 - width + 4)
    expect(clampBelowLabelLeftPx(100, width, 10, 20)).toBe(20 - 4)
    expect(clampBelowLabelLeftPx(8, width, 10, 20)).toBe(8)
  })

  it('keeps non-overlapping below-body labels on the same level', () => {
    const placements = routeBelowFeatureLabelLevels([
      {
        featureId: 'f1',
        lane: 0,
        leftPx: 0,
        maxWidthPx: 100,
        label: 'Short',
        below: true,
        belowLevel: 0,
      },
      {
        featureId: 'f2',
        lane: 0,
        leftPx: 200,
        maxWidthPx: 100,
        label: 'AlsoShort',
        below: true,
        belowLevel: 0,
      },
    ])
    expect(placements.map((placement) => placement.belowLevel)).toEqual([0, 0])
  })

  it('nudges two overlapping labels apart when body anchors allow it', () => {
    const separated = separateBelowFeatureLabelsHorizontally([
      {
        featureId: 'f1',
        lane: 0,
        leftPx: belowFeatureLabelLeftPx({ left: 0, width: 20, lane: 0 }),
        widthPx: estimateFeatureLabelWidthPx('AlphaSite'),
        bodyLeftPx: 0,
        bodyRightPx: 20,
        label: 'AlphaSite',
      },
      {
        featureId: 'f2',
        lane: 0,
        leftPx: belowFeatureLabelLeftPx({ left: 80, width: 20, lane: 0 }),
        widthPx: estimateFeatureLabelWidthPx('BetaSite'),
        bodyLeftPx: 80,
        bodyRightPx: 100,
        label: 'BetaSite',
      },
    ])
    expect(separated[0]!.leftPx + separated[0]!.widthPx + 4).toBeLessThanOrEqual(separated[1]!.leftPx + 0.01)
    const routed = routeBelowFeatureLabels(separated)
    expect(routed.map((item) => item.belowLevel)).toEqual([0, 0])
  })

  it('centers the label within the chosen run', () => {
    const label = 'Gene'
    const run = { left: 100, width: 200, lane: 0 }
    const labelWidth = estimateFeatureLabelWidthPx(label)
    expect(floatingFeatureLabelLeftPx(run, label)).toBe(100 + (200 - labelWidth) / 2)
  })

  it('collects visible runs per segment overlap', () => {
    const runs = visibleFeatureBodyRuns(
      [
        { featureId: 'f1', start: 0, end: 5, lane: 0 },
        { featureId: 'f1', start: 20, end: 30, lane: 0 },
      ],
      0,
      25,
      linearSpanPx,
    )
    expect(runs.map((run) => run.width)).toEqual([50, 50])
    expect(pickFeatureLabelRun(runs, 'Gene')?.width).toBe(50)
    expect(pickWidestFeatureLabelRun(runs)?.width).toBe(50)
  })

  it('compresses short-feature body height when a below-label would hit an obstacle', () => {
    const placements = computeFloatingFeatureLabelPlacements(
      [{ featureId: 'short', start: 0, end: 2, lane: 0 }],
      new Map([['short', 'VeryLongFeatureName']]),
      0,
      100,
      linearSpanPx,
    )
    expect(placements[0]?.below).toBe(true)

    const heights = compressBelowLabelBodyHeights(
      placements,
      [{ featureId: 'short', bodyTopPx: 0, bodyLeftPx: 0, bodyRightPx: 20 }],
      [{ topPx: 22, leftPx: 0, rightPx: 80 }],
      16,
    )
    expect(heights.get('short')).toBeLessThan(16)
    expect(heights.get('short')).toBeGreaterThanOrEqual(8)
  })

  it('keeps default body height when nothing sits under the below-label', () => {
    const placements = [
      {
        featureId: 'short',
        lane: 0,
        leftPx: 0,
        maxWidthPx: 80,
        label: 'Short',
        below: true,
        belowLevel: 0,
      },
    ]
    const heights = compressBelowLabelBodyHeights(
      placements,
      [{ featureId: 'short', bodyTopPx: 0, bodyLeftPx: 0, bodyRightPx: 20 }],
      [],
      16,
    )
    expect(heights.get('short')).toBe(16)
  })
})
