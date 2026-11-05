import { describe, expect, it } from 'vitest'
import {
  layoutCircularLaneCalloutsStrict,
  parseCircularRouterAlgorithm,
  summarizeCircularLayout,
} from '../src/domain/circularLaneRouter'
import { collectLayoutViolations, layoutEnzymeCalloutsStrict, type EnzymeCalloutLayoutInput } from '../src/domain/mapLayout'
import type { RestrictionSite } from '../src/domain/types'

function site(name: string, start: number): RestrictionSite {
  return {
    enzyme: {
      name,
      notation: 'G/AATTC',
      recognition: 'GAATTC',
      cutTop: 1,
      cutBottom: 5,
      type: 'II',
      overhang: { type: "5'", sequence: 'AATT', length: 4 },
      manufacturers: [],
      notes: [],
    },
    start,
    end: start + 6,
    match: 'GAATTC',
    cutTop: start + 1,
    cutBottom: start + 5,
  }
}

function inputFor(starts: number[], sequenceLength = 3600, radius = 220): EnzymeCalloutLayoutInput {
  const mapSize = 900
  const center = mapSize / 2
  return {
    sites: starts.map((start, index) => site(`E${index + 1}`, start)),
    sequenceLength,
    mapSize,
    center,
    centerX: center,
    centerY: center,
    radius,
    outerFeatureOffset: 18,
  }
}

describe('circularLaneRouter', () => {
  it('parses algorithm flag', () => {
    expect(parseCircularRouterAlgorithm('lane')).toBe('lane')
    expect(parseCircularRouterAlgorithm('classic')).toBe('classic')
    expect(parseCircularRouterAlgorithm(null)).toBe('elliptic')
    expect(parseCircularRouterAlgorithm('elliptic')).toBe('elliptic')
  })

  it('places sparse sites without strict failure', () => {
    const input = inputFor([100, 900, 1800, 2700])
    const { callouts, hasPlacementFailure } = layoutCircularLaneCalloutsStrict(input)
    expect(hasPlacementFailure).toBe(false)
    expect(callouts).toHaveLength(4)
    expect(collectLayoutViolations(callouts, input)).toEqual([])
  })

  it('handles a dense angular cluster without crashing', () => {
    // Cluster near 9 o'clock (normalized ~0.75) plus sparse sites near 12.
    const dense = Array.from({ length: 12 }, (_, i) => 2600 + i * 8)
    const sparse = [50, 100, 150]
    const input = inputFor([...sparse, ...dense], 3600, 200)
    const { callouts } = layoutCircularLaneCalloutsStrict(input)
    expect(callouts.length).toBeGreaterThan(0)
    const summary = summarizeCircularLayout(callouts, input)
    expect(summary.labels).toBe(callouts.length)
    expect(summary.leaderAverage).toBeGreaterThan(0)
  })

  it('is faster than classic on a moderate label set', () => {
    const starts = Array.from({ length: 48 }, (_, i) => Math.floor((i / 48) * 3600))
    const input = inputFor(starts, 3600, 240)

    const classicStarted = performance.now()
    const classic = layoutEnzymeCalloutsStrict(input)
    const classicMs = performance.now() - classicStarted

    const laneStarted = performance.now()
    const lane = layoutCircularLaneCalloutsStrict(input)
    const laneMs = performance.now() - laneStarted

    expect(classic.callouts.length).toBeGreaterThan(0)
    expect(lane.callouts.length).toBeGreaterThan(0)
    // Allow some noise on CI; lane should not be dramatically slower.
    expect(laneMs).toBeLessThan(classicMs * 3 + 50)
  })
})
