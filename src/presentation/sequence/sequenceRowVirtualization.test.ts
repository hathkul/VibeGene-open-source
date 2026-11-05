import { describe, expect, it } from 'vitest'
import type { SequenceLabelRouterInput, SequenceRowLabelLayout, SequenceRowSegment } from '../../domain/sequenceLabelRouter'
import {
  clampSequenceVirtualWindow,
  estimateSequenceRowHeights,
  horizontalSequenceVirtualWindow,
  initialSequenceVirtualWindow,
  planSequenceVirtualWindowTransition,
  raiseSequenceRowHeightFloors,
  syncSequenceRowHeightFloors,
  type SequenceVirtualRowWindowOwner,
} from './sequenceRowVirtualization'

const rowSegments: SequenceRowSegment[] = [
  { rowStart: 0, rowLength: 10 },
  { rowStart: 10, rowLength: 10 },
]

const labelRouterBase: SequenceLabelRouterInput = {
  enzymeSites: [],
  primerSites: [],
  sequenceLength: 20,
  basesPerRow: 10,
  rowSegments,
  baseStepPx: 10,
  trackInsetPx: 0,
  collisionUnitPx: 1,
  labelForSite: () => '',
  textHeight: 12,
  labelPadding: 6,
  labelWidthForSite: () => 0,
}

function options(overrides: Partial<Parameters<typeof estimateSequenceRowHeights>[0]> = {}) {
  return {
    rowSegments,
    rowPrimerPlacementsByIndex: new Map(),
    sgRnaLanesByRow: new Map(),
    rowLayoutByIndex: new Map<number, SequenceRowLabelLayout>(),
    restrictionSiteCountByLabelRow: new Map<number, number>(),
    rowFeatureBandHeightByRow: [24, 24],
    horizontalMode: false,
    featuresVisible: true,
    featureLaneStepPx: 24,
    sequenceStrandRowHeightPx: 18,
    sequenceRulerHeightPx: 10,
    virtualRowEstimatePx: 160,
    labelRouterBase,
    ...overrides,
  }
}

describe('estimateSequenceRowHeights', () => {
  it('keeps a stable minimum for rows with no routed annotations', () => {
    expect(estimateSequenceRowHeights(options())).toEqual([160, 160])
  })

  it('reserves bounded placeholder space for off-window restriction sites', () => {
    const sites = new Map<number, number>([[1, 20]])
    const heights = estimateSequenceRowHeights(options({ restrictionSiteCountByLabelRow: sites }))
    expect(heights[0]).toBe(160)
    expect(heights[1]).toBeGreaterThan(160)
  })

  it('preserves the full feature-band estimate in horizontal mode', () => {
    const heights = estimateSequenceRowHeights(options({ horizontalMode: true, featureLaneStepPx: 100, rowFeatureBandHeightByRow: [100, 24] }))
    expect(heights[0]).toBeGreaterThan(160)
    expect(heights[1]).toBe(160)
  })

  it('counts the combined feature and reverse-primer band once', () => {
    const heights = estimateSequenceRowHeights(options({
      rowFeatureBandHeightByRow: [100, 24],
      rowPrimerPlacementsByIndex: new Map([[0, { reverseLaneHeight: 50 }]]),
      virtualRowEstimatePx: 0,
    }))
    expect(heights[0]).toBe(174)
  })

  it('keeps a reverse-primer band when feature display is hidden', () => {
    const heights = estimateSequenceRowHeights(options({
      rowFeatureBandHeightByRow: [48, 0],
      rowPrimerPlacementsByIndex: new Map([[0, { reverseLaneHeight: 30 }]]),
      featuresVisible: false,
      virtualRowEstimatePx: 0,
    }))
    expect(heights[0]).toBe(122)
  })
})

describe('raiseSequenceRowHeightFloors', () => {
  it('returns the same reference when no floor rises', () => {
    const previous = { 0: 200, 1: 180, 99: 50 }
    expect(raiseSequenceRowHeightFloors(previous, [160, 160])).toBe(previous)
  })

  it('does not mutate previous and keeps extra keys', () => {
    const previous = { 0: 100, 5: 40 }
    const next = raiseSequenceRowHeightFloors(previous, [160, 120])
    expect(previous).toEqual({ 0: 100, 5: 40 })
    expect(next).toEqual({ 0: 160, 5: 40, 1: 120 })
    expect(next).not.toBe(previous)
  })
})

describe('initialSequenceVirtualWindow', () => {
  it('returns {0,0} for zero rows', () => {
    expect(initialSequenceVirtualWindow(0)).toEqual({ start: 0, end: 0 })
  })

  it('caps end at 18 for large row counts', () => {
    expect(initialSequenceVirtualWindow(100)).toEqual({ start: 0, end: 18 })
  })
})

describe('clampSequenceVirtualWindow', () => {
  it('returns the same reference when already in range', () => {
    const current = { start: 4, end: 12 }
    expect(clampSequenceVirtualWindow(current, 50)).toBe(current)
  })

  it('does not zero a scrolled start when the row count still contains it', () => {
    const current = { start: 30, end: 40 }
    expect(clampSequenceVirtualWindow(current, 100)).toEqual({ start: 30, end: 40 })
  })

  it('clamps end when row count shrinks', () => {
    const current = { start: 8, end: 20 }
    expect(clampSequenceVirtualWindow(current, 12)).toEqual({ start: 8, end: 11 })
  })
})

describe('horizontalSequenceVirtualWindow', () => {
  it('spans all rows', () => {
    expect(horizontalSequenceVirtualWindow(25)).toEqual({ start: 0, end: 24 })
    expect(horizontalSequenceVirtualWindow(0)).toEqual({ start: 0, end: 0 })
  })
})

describe('planSequenceVirtualWindowTransition', () => {
  it('resets to an empty window when the span changes with zero rows', () => {
    const owner: SequenceVirtualRowWindowOwner = {
      spanKey: '900|0|900',
      rowCount: 50,
      layoutActive: true,
      horizontalMode: false,
    }
    const result = planSequenceVirtualWindowTransition(
      { start: 30, end: 40 },
      owner,
      '0|0|0',
      0,
      true,
      false,
    )
    expect(result.nextWindow).toEqual({ start: 0, end: 0 })
    expect(result.nextOwner).toEqual({
      spanKey: '0|0|0',
      rowCount: 0,
      layoutActive: true,
      horizontalMode: false,
    })
  })

  it('updates owner only when the tab activates with rows already present', () => {
    const spanKey = '1200|0|1200'
    const owner: SequenceVirtualRowWindowOwner = {
      spanKey,
      rowCount: 25,
      layoutActive: false,
      horizontalMode: false,
    }
    const current = { start: 4, end: 18 }
    const result = planSequenceVirtualWindowTransition(current, owner, spanKey, 25, true, false)
    expect(result.nextWindow).toBeUndefined()
    expect(result.nextOwner).toEqual({
      spanKey,
      rowCount: 25,
      layoutActive: true,
      horizontalMode: false,
    })
  })

  it('re-initializes the window when the span changes while the tab is active', () => {
    const owner: SequenceVirtualRowWindowOwner = {
      spanKey: '500|0|500',
      rowCount: 40,
      layoutActive: true,
      horizontalMode: false,
    }
    const rowCount = 40
    const newSpanKey = '800|0|800'
    const result = planSequenceVirtualWindowTransition(
      { start: 10, end: 22 },
      owner,
      newSpanKey,
      rowCount,
      true,
      false,
    )
    expect(result.nextWindow).toEqual(initialSequenceVirtualWindow(rowCount))
    expect(result.nextOwner).toEqual({
      spanKey: newSpanKey,
      rowCount,
      layoutActive: true,
      horizontalMode: false,
    })
  })

  it('defers window writes to the scroll listener when leaving horizontal mode', () => {
    const spanKey = '600|0|600'
    const rowCount = 30
    const owner: SequenceVirtualRowWindowOwner = {
      spanKey,
      rowCount,
      layoutActive: true,
      horizontalMode: true,
    }
    const current = horizontalSequenceVirtualWindow(rowCount)
    const result = planSequenceVirtualWindowTransition(current, owner, spanKey, rowCount, true, false)
    expect(result.nextWindow).toBeUndefined()
    expect(result.nextOwner).toEqual({
      spanKey,
      rowCount,
      layoutActive: true,
      horizontalMode: false,
    })
  })

  it('expands to the full horizontal window when the stored window is partial', () => {
    const spanKey = '400|0|400'
    const rowCount = 15
    const owner: SequenceVirtualRowWindowOwner = {
      spanKey,
      rowCount,
      layoutActive: true,
      horizontalMode: true,
    }
    const result = planSequenceVirtualWindowTransition({ start: 0, end: 5 }, owner, spanKey, rowCount, true, true)
    expect(result.nextWindow).toEqual(horizontalSequenceVirtualWindow(rowCount))
  })

  it('returns no writes when horizontal mode already spans all rows and owner matches', () => {
    const spanKey = '300|0|300'
    const rowCount = 12
    const owner: SequenceVirtualRowWindowOwner = {
      spanKey,
      rowCount,
      layoutActive: true,
      horizontalMode: true,
    }
    const current = horizontalSequenceVirtualWindow(rowCount)
    const result = planSequenceVirtualWindowTransition(current, owner, spanKey, rowCount, true, true)
    expect(result.nextWindow).toBeUndefined()
    expect(result.nextOwner).toBeUndefined()
  })

  it('clamps the window on row-count shrink while layout is inactive without zeroing scroll', () => {
    const spanKey = '1000|0|1000'
    const owner: SequenceVirtualRowWindowOwner = {
      spanKey,
      rowCount: 100,
      layoutActive: false,
      horizontalMode: false,
    }
    const current = { start: 8, end: 20 }
    const result = planSequenceVirtualWindowTransition(current, owner, spanKey, 12, false, false)
    expect(result.nextWindow).toEqual({ start: 8, end: 11 })
    expect(result.nextWindow?.start).toBe(8)
    expect(result.nextOwner).toEqual({
      spanKey,
      rowCount: 12,
      layoutActive: false,
      horizontalMode: false,
    })
  })
})

describe('syncSequenceRowHeightFloors', () => {
  it('resets floors from empty estimates when the measure key changes', () => {
    const previous = { 0: 500, 3: 220 }
    const estimates = [160, 180] as const
    const result = syncSequenceRowHeightFloors('new-key', 'old-key', previous, estimates)
    expect(result.nextMeasureKey).toBe('new-key')
    expect(result.resetMeasured).toBe(true)
    expect(result.nextFloors).toEqual({ 0: 160, 1: 180 })
    expect(result.nextFloors).not.toBe(previous)
    expect(previous).toEqual({ 0: 500, 3: 220 })
  })

  it('keeps the previous floor object when the key is unchanged and estimates do not rise', () => {
    const previous = { 0: 200, 1: 190 }
    const result = syncSequenceRowHeightFloors('same-key', 'same-key', previous, [160, 180])
    expect(result.nextMeasureKey).toBe('same-key')
    expect(result.resetMeasured).toBe(false)
    expect(result.nextFloors).toBe(previous)
  })
})
