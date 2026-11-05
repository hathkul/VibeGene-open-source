import { describe, expect, it } from 'vitest'
import {
  calloutLeaderLength,
  chooseCircularMapRadius,
  collectLayoutViolations,
  assertLinearLayoutValid,
  collectLinearLayoutViolations,
  computeLinearTrackLayout,
  estimateLinearMapHeightForRows,
  fitLinearMapViewBox,
  layoutEnzymeCallouts,
  layoutEnzymeCalloutsPacked,
  layoutLinearEnzymeCallouts,
  linearCalloutLadderHeightAboveStrand,
  linearCalloutLadderRowGap,
  linearClusterConnectorOutwardShift,
  linearClusterPreferredLabelOffset,
  buildLinearLadderGroupMap,
  linearLadderTargetAttachX,
  linearSweepRowTransitionAllowed,
  segmentIntersectsBox,
  type EnzymeCallout,
  type EnzymeCalloutLayoutInput,
  type LinearEnzymeCalloutLayoutInput,
} from '../src/domain/mapLayout'
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

function siteAtCut(name: string, start: number, cutTop: number): RestrictionSite {
  return {
    enzyme: {
      name,
      notation: 'NNNNNN',
      recognition: 'NNNNNN',
      cutTop: 0,
      cutBottom: 0,
      type: 'II',
      overhang: { type: 'blunt', sequence: null, length: 0 },
      manufacturers: [],
      notes: [],
    },
    start,
    end: start + 6,
    match: 'NNNNNN',
    cutTop,
    cutBottom: cutTop,
  }
}

function inputFor(starts: number[], sequenceLength = 900): EnzymeCalloutLayoutInput {
  const mapSize = 900
  const center = mapSize / 2
  const outerFeatureOffset = 18
  const radiusInput = {
    sites: starts.map((start, index) => site(`E${index + 1}`, start)),
    sequenceLength,
    mapSize,
    center,
    outerFeatureOffset,
  }
  return {
    sites: radiusInput.sites,
    sequenceLength,
    mapSize,
    center,
    radius: chooseCircularMapRadius(radiusInput),
    outerFeatureOffset,
  }
}

function expectValidLayout(input: EnzymeCalloutLayoutInput) {
  const callouts = layoutEnzymeCallouts(input)
  expect(callouts).toHaveLength(input.sites.length)
  expect(collectLayoutViolations(callouts, input)).toEqual([])
  callouts.forEach((callout) => {
    expect(calloutLeaderLength(callout)).toBeGreaterThanOrEqual(15.5 * 3 - 0.001)
  })
}

describe('enzyme callout layout', () => {
  it('keeps dense top-right and top-left cloning-site labels inside bounds without intersections', () => {
    expectValidLayout(inputFor([1, 7, 30, 36, 43, 49, 55, 852, 858, 864, 870, 876, 882]))
  })

  it('routes labels in all four quarters without line, label, or feature-ring intersections', () => {
    expectValidLayout(inputFor([20, 60, 120, 190, 260, 330, 420, 490, 570, 650, 735, 810, 870]))
  })

  it('handles many same-quarter labels by using horizontal and radial candidates before clipping', () => {
    expectValidLayout(inputFor([5, 11, 17, 23, 29, 35, 41, 47, 53, 59, 65, 71]))
  })

  it('places upper-right labels from the 3h side toward 12h without forcing a global outer row', () => {
    const input = inputFor([55, 49, 43, 36, 30, 7, 1])
    const callouts = layoutEnzymeCallouts(input)

    expect(collectLayoutViolations(callouts, input)).toEqual([])
    for (let index = 1; index < callouts.length; index += 1) {
      expect(callouts[index].connectorEnd.y).toBeLessThan(callouts[index - 1].connectorEnd.y)
      expect(callouts[index].connectorEnd.x).toBeLessThanOrEqual(callouts[index - 1].connectorEnd.x)
    }
    expect(calloutLeaderLength(callouts[0])).toBeLessThan(calloutLeaderLength(callouts[callouts.length - 1]))
  })

  it('keeps isolated labels above the minimum total leader length while maximizing radius', () => {
    const input = inputFor([225])
    const [callout] = layoutEnzymeCallouts(input)

    expect(collectLayoutViolations([callout], input)).toEqual([])
    expect(callout.segments[0]).toBeDefined()
    expect(calloutLeaderLength(callout)).toBeGreaterThanOrEqual(15.5 * 3 - 0.001)
    expect(input.radius).toBeGreaterThan(300)
  })

  it('chooses the largest radius that keeps enzyme labels visible', () => {
    const input = inputFor([1, 7, 30, 36, 43, 49, 55, 852, 858, 864, 870, 876, 882])
    const largerInput = { ...input, radius: input.radius + 3 }

    expect(input.radius).toBeGreaterThan(173)
    expect(collectLayoutViolations(layoutEnzymeCallouts(input), input)).toEqual([])
    expect(collectLayoutViolations(layoutEnzymeCallouts(largerInput), largerInput).length).toBeGreaterThan(0)
  })

  it('accounts for larger external feature label boxes alongside enzyme labels', () => {
    const enzymeSites = [10, 18, 26, 226, 234, 242].map((start, index) => site(`E${index + 1}`, start))
    const featureSites = [34, 218].map((start, index) => ({ ...site(`Feature label ${index + 1}`, start), match: '__feature_callout__' }))
    const radiusInput = {
      sites: [...enzymeSites, ...featureSites],
      sequenceLength: 900,
      mapSize: 900,
      center: 450,
      outerFeatureOffset: 18,
      labelForSite: (restrictionSite: RestrictionSite) =>
        restrictionSite.match === '__feature_callout__' ? restrictionSite.enzyme.name : `${restrictionSite.enzyme.name} (${restrictionSite.start + 1})`,
      textHeightForSite: (restrictionSite: RestrictionSite) => (restrictionSite.match === '__feature_callout__' ? 24 : 12),
      textWidthForSite: (restrictionSite: RestrictionSite) => (restrictionSite.match === '__feature_callout__' ? 6.8 : 6),
      labelPaddingForSite: (restrictionSite: RestrictionSite) => (restrictionSite.match === '__feature_callout__' ? 18 : 6),
    }
    const input = {
      ...radiusInput,
      radius: chooseCircularMapRadius(radiusInput),
    }

    expect(collectLayoutViolations(layoutEnzymeCallouts(input), input)).toEqual([])
  })

  it('routes linear-map enzyme labels without collisions or protected-band intersections', () => {
    const trackLeft = 16
    const trackRight = 884
    const featureStubHeight = 48
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [20, 60, 120, 190, 260, 330, 420, 490, 570, 650, 735, 810, 870].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft,
      trackRight,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureStubHeight,
    }
    const callouts = layoutLinearEnzymeCallouts(input)

    expect(callouts).toHaveLength(input.sites.length)
    expect(collectLinearLayoutViolations(callouts, input)).toEqual([])
    callouts.forEach((callout) => {
      expect(callout.anchor.y).toBe(input.strandY)
      expect(callout.anchor.x).toBeCloseTo(callout.elbow.x, 0.5)
      expect(callout.anchor.y - callout.elbow.y).toBeCloseTo(featureStubHeight, 1)
      expect(callout.connectorEnd.y).toBe(callout.box.bottom)
      expect(callout.segments[0][0].x).toBeCloseTo(callout.segments[0][1].x, 0.5)
      if (callout.site.cutTop < input.sequenceLength / 2) {
        expect(callout.box.right).toBeLessThanOrEqual(callout.anchor.x + 1)
      } else {
        expect(callout.box.left).toBeGreaterThanOrEqual(callout.anchor.x - 1)
      }
    })
  })

  it('orders linear label placement by cutTop when recognition start differs', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [siteAtCut('MwoI', 3, 9), siteAtCut('HindIII', 1, 2)],
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
    }
    const callouts = layoutLinearEnzymeCallouts(input)
    const hind = callouts.find((callout) => callout.site.enzyme.name === 'HindIII')
    const mwo = callouts.find((callout) => callout.site.enzyme.name === 'MwoI')

    expect(callouts).toHaveLength(2)
    expect(hind).toBeDefined()
    expect(mwo).toBeDefined()
    expect(hind!.anchor.x).toBeLessThan(mwo!.anchor.x)
    const hindCenterY = (hind!.box.top + hind!.box.bottom) / 2
    const mwoCenterY = (mwo!.box.top + mwo!.box.bottom) / 2
    expect(mwoCenterY).toBeLessThanOrEqual(hindCenterY)
  })

  it('assigns cluster tilt by placement order: outward first, inward later', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [],
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
    }
    expect(linearClusterPreferredLabelOffset(0, 4, 'left', input)).toBe(-48)
    expect(linearClusterPreferredLabelOffset(1, 4, 'left', input)).toBe(-24)
    expect(linearClusterPreferredLabelOffset(2, 4, 'left', input)).toBe(24)
    expect(linearClusterPreferredLabelOffset(3, 4, 'left', input)).toBe(48)
    expect(linearClusterPreferredLabelOffset(0, 4, 'right', input)).toBe(24)
    expect(linearClusterPreferredLabelOffset(1, 4, 'right', input)).toBe(48)
    expect(linearClusterPreferredLabelOffset(2, 4, 'right', input)).toBe(-48)
    expect(linearClusterPreferredLabelOffset(3, 4, 'right', input)).toBe(-24)
  })

  it('caps preferred cluster tilt so large bushes do not fan too aggressively', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [],
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
    }

    expect(linearClusterPreferredLabelOffset(0, 16, 'left', input)).toBe(-72)
    expect(linearClusterPreferredLabelOffset(7, 16, 'right', input)).toBe(72)
  })

  it('does not place cluster labels further outward than the previous sweep label', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [44, 46, 48, 50, 52, 851, 857, 863].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
    }
    const callouts = layoutLinearEnzymeCallouts(input)
    const leftCluster = callouts
      .filter((callout) => callout.site.start < 100)
      .toSorted((a, b) => a.site.cutTop - b.site.cutTop)
    const rightCluster = callouts
      .filter((callout) => callout.site.start > 800)
      .toSorted((a, b) => b.site.cutTop - a.site.cutTop)

    expect(leftCluster.length).toBeGreaterThanOrEqual(3)
    expect(rightCluster.length).toBeGreaterThanOrEqual(3)

    for (let index = 1; index < leftCluster.length; index += 1) {
      const previous = leftCluster[index - 1]
      const current = leftCluster[index]
      expect(linearClusterConnectorOutwardShift(current.box, current.anchor.x, 'left')).toBeLessThanOrEqual(
        linearClusterConnectorOutwardShift(previous.box, previous.anchor.x, 'left') + 0.5,
      )
    }

    for (let index = 1; index < rightCluster.length; index += 1) {
      const previous = rightCluster[index - 1]
      const current = rightCluster[index]
      expect(linearClusterConnectorOutwardShift(current.box, current.anchor.x, 'right')).toBeLessThanOrEqual(
        linearClusterConnectorOutwardShift(previous.box, previous.anchor.x, 'right') + 0.5,
      )
    }
  })

  it('does not fan a cluster further outward than a previous non-cluster label', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [20, 80, 82, 84].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
    }
    const callouts = layoutLinearEnzymeCallouts(input).toSorted((a, b) => a.site.cutTop - b.site.cutTop)

    expect(callouts).toHaveLength(4)
    for (let index = 1; index < callouts.length; index += 1) {
      expect(linearClusterConnectorOutwardShift(callouts[index].box, callouts[index].anchor.x, 'left')).toBeLessThanOrEqual(
        linearClusterConnectorOutwardShift(callouts[index - 1].box, callouts[index - 1].anchor.x, 'left') + 0.5,
      )
    }
    expect(collectLinearLayoutViolations(callouts, input)).toEqual([])
  })

  it('fans tilted leaders when linear sites cluster within half feature height', () => {
    const featureHeight = 24
    const tiltStep = featureHeight
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [200, 202, 204, 206].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight,
      featureStubHeight: 48,
    }
    const callouts = layoutLinearEnzymeCallouts(input)
    const reachSpreads = callouts.map((callout) => {
      const reach = callout.segments[2]
      return reach ? Math.abs(reach[1].x - reach[0].x) : 0
    })
    const labelCenters = callouts.map((callout) => (callout.box.left + callout.box.right) / 2)

    expect(callouts.length).toBe(4)
    expect(Math.max(...labelCenters) - Math.min(...labelCenters)).toBeGreaterThanOrEqual(tiltStep - 1)
    expect(Math.max(...reachSpreads)).toBeGreaterThanOrEqual(tiltStep - 1)
  })

  it('keeps isolated linear leaders vertical when sites are not clustered', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [40, 220, 410, 620, 800].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
    }
    const callouts = layoutLinearEnzymeCallouts(input)

    callouts.forEach((callout) => {
      const reach = callout.segments[2]
      expect(reach ? Math.abs(reach[1].x - reach[0].x) : 0).toBeLessThan(3)
    })
  })

  it('keeps reach segments clear of other callout labels on dense maps', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [44, 46, 48, 50, 52, 851, 857, 863, 869, 875, 881].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
      labelForSite: (s) => s.enzyme.name,
      labelWidthForSite: (_s, label) => label.length * 7 + 6,
    }
    const callouts = layoutLinearEnzymeCallouts(input)
    assertLinearLayoutValid(callouts, input)
    callouts.forEach((callout) => {
      const reach = callout.segments[2]
      if (!reach) return
      callouts.forEach((other) => {
        if (other.index === callout.index) return
        expect(segmentIntersectsBox(reach[0], reach[1], other.box)).toBe(false)
      })
    })
  })

  it('does not let cluster reach segments cross earlier nearby labels', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [siteAtCut('Earlier', 180, 194), siteAtCut('BsaAI', 228, 230), siteAtCut('BtgZI', 229, 231)],
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
    }
    const callouts = layoutLinearEnzymeCallouts(input)
    const earlier = callouts.find((callout) => callout.site.enzyme.name === 'Earlier')
    const clusterCallouts = callouts.filter((callout) => callout.site.enzyme.name !== 'Earlier')

    expect(earlier).toBeDefined()
    clusterCallouts.forEach((callout) => {
      const reach = callout.segments[2]
      expect(reach).toBeDefined()
      if (!reach || !earlier) return
      expect(segmentIntersectsBox(reach[0], reach[1], earlier.box)).toBe(false)
    })
  })

  it('does not skip cluster rows when vertical stubs share anchor column', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [siteAtCut('BsaAI', 228, 230), siteAtCut('BtgZI', 229, 231)],
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
    }
    const callouts = layoutLinearEnzymeCallouts(input).toSorted((a, b) => a.site.cutTop - b.site.cutTop)
    const firstCenterY = (callouts[0].box.top + callouts[0].box.bottom) / 2
    const secondCenterY = (callouts[1].box.top + callouts[1].box.bottom) / 2

    expect(callouts).toHaveLength(2)
    expect(secondCenterY).toBeLessThanOrEqual(firstCenterY)
    expect(firstCenterY - secondCenterY).toBeLessThanOrEqual(36)
  })

  it('keeps horizontally adjacent cluster mates within one row step', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [siteAtCut('NheI', 6, 7), siteAtCut('Cac8I', 8, 9)],
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
    }
    const callouts = layoutLinearEnzymeCallouts(input).toSorted((a, b) => a.site.cutTop - b.site.cutTop)
    const rowGap = 12 + 7
    const baseLabelY = input.strandY! - 48 - 6 - 3
    const rows = callouts.map((callout) => Math.round((baseLabelY - (callout.box.top + callout.box.bottom) / 2) / rowGap))

    expect(callouts).toHaveLength(2)
    expect(rows[1] - rows[0]).toBeLessThanOrEqual(1)
  })

  it('stacks tight cluster labels upward toward map center along placement order', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [44, 46, 48, 50, 52].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
    }
    const callouts = layoutLinearEnzymeCallouts(input).toSorted((a, b) => a.site.cutTop - b.site.cutTop)

    expect(callouts.length).toBe(5)
    for (let index = 1; index < callouts.length; index += 1) {
      const previousCenterY = (callouts[index - 1].box.top + callouts[index - 1].box.bottom) / 2
      const currentCenterY = (callouts[index].box.top + callouts[index].box.bottom) / 2
      expect(currentCenterY).toBeLessThanOrEqual(previousCenterY)
    }
  })

  it('drops independent labels back to the lowest valid row after a tight cluster', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [44, 46, 48, 220].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
    }
    const callouts = layoutLinearEnzymeCallouts(input).toSorted((a, b) => a.site.cutTop - b.site.cutTop)
    const rowGap = 12 + 6 + 2 + 1
    const baseLabelY = input.strandY! - 48 - 6 - 1
    const rows = callouts.map((callout) => Math.round((baseLabelY - (callout.box.top + callout.box.bottom) / 2) / rowGap))

    expect(callouts).toHaveLength(4)
    expect(rows.slice(0, 3)).toEqual([0, 1, 2])
    expect(rows[3]).toBe(0)
    expect(collectLinearLayoutViolations(callouts, input)).toEqual([])
  })

  it('does not inherit cluster row from distant sites in the same cluster id', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [44, 46, 400, 402].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
    }
    const callouts = layoutLinearEnzymeCallouts(input).toSorted((a, b) => a.site.cutTop - b.site.cutTop)
    const distant = callouts.find((callout) => callout.site.start >= 400)
    const tightStack = callouts.filter((callout) => callout.site.start < 100)

    expect(callouts).toHaveLength(4)
    expect(tightStack).toHaveLength(2)
    expect(distant).toBeDefined()
    const distantCenterY = (distant!.box.top + distant!.box.bottom) / 2
    const highestTightCenterY = Math.min(...tightStack.map((callout) => (callout.box.top + callout.box.bottom) / 2))
    expect(distantCenterY).toBeGreaterThan(highestTightCenterY - 40)
  })

  it('keeps reach segments clear of labels from neighboring clusters', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [44, 46, 48, 70, 72, 74].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
    }
    const callouts = layoutLinearEnzymeCallouts(input)

    expect(collectLinearLayoutViolations(callouts, input)).toEqual([])
    callouts.forEach((callout) => {
      const reach = callout.segments[2]
      if (!reach) return
      callouts.forEach((other) => {
        if (other.index === callout.index) return
        expect(segmentIntersectsBox(reach[0], reach[1], other.box)).toBe(false)
      })
    })
  })

  it('detects full linear leader segments crossing labels, not just reach segments', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [siteAtCut('Leader', 10, 10), siteAtCut('Label', 20, 20)],
      sequenceLength: 900,
      mapWidth: 300,
      mapHeight: 300,
      trackLeft: 0,
      trackRight: 200,
      strandY: 10,
      protectedBandTop: 100,
      protectedBandBottom: 150,
    }
    const callouts: EnzymeCallout[] = [
      {
        site: input.sites[0],
        index: 0,
        anchor: { x: 50, y: 10 },
        elbow: { x: 50, y: -20 },
        connectorEnd: { x: 70, y: -80 },
        x: 70,
        y: -73,
        label: 'Leader',
        textAnchor: 'start',
        box: { left: 70, right: 100, top: -86, bottom: -74 },
        segments: [
          [
            { x: 50, y: 10 },
            { x: 50, y: -20 },
          ],
          [
            { x: 50, y: -20 },
            { x: 50, y: -80 },
          ],
          [
            { x: 50, y: -80 },
            { x: 70, y: -80 },
          ],
        ],
      },
      {
        site: input.sites[1],
        index: 1,
        anchor: { x: 120, y: 10 },
        elbow: { x: 120, y: -20 },
        connectorEnd: { x: 55, y: -45 },
        x: 25,
        y: -38,
        label: 'Label',
        textAnchor: 'start',
        box: { left: 45, right: 55, top: -50, bottom: -40 },
        segments: [
          [
            { x: 120, y: 10 },
            { x: 120, y: -20 },
          ],
          [
            { x: 120, y: -20 },
            { x: 120, y: -45 },
          ],
          [
            { x: 120, y: -45 },
            { x: 55, y: -45 },
          ],
        ],
      },
    ]

    expect(collectLinearLayoutViolations(callouts, input)).toContain('callout 0 leader segment 1 intersects callout 1 label')
  })

  it('detects intersections between any linear leader segments', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [siteAtCut('Vertical', 10, 10), siteAtCut('Horizontal', 20, 20)],
      sequenceLength: 900,
      mapWidth: 300,
      mapHeight: 300,
      trackLeft: 0,
      trackRight: 200,
      strandY: 10,
      protectedBandTop: 100,
      protectedBandBottom: 150,
    }
    const callouts: EnzymeCallout[] = [
      {
        site: input.sites[0],
        index: 0,
        anchor: { x: 50, y: 10 },
        elbow: { x: 50, y: -20 },
        connectorEnd: { x: 80, y: -80 },
        x: 80,
        y: -73,
        label: 'Vertical',
        textAnchor: 'start',
        box: { left: 80, right: 110, top: -86, bottom: -74 },
        segments: [
          [
            { x: 50, y: 10 },
            { x: 50, y: -20 },
          ],
          [
            { x: 50, y: -20 },
            { x: 50, y: -80 },
          ],
          [
            { x: 50, y: -80 },
            { x: 80, y: -80 },
          ],
        ],
      },
      {
        site: input.sites[1],
        index: 1,
        anchor: { x: 120, y: 10 },
        elbow: { x: 120, y: -20 },
        connectorEnd: { x: 40, y: -45 },
        x: 10,
        y: -38,
        label: 'Horizontal',
        textAnchor: 'start',
        box: { left: 10, right: 40, top: -51, bottom: -39 },
        segments: [
          [
            { x: 120, y: 10 },
            { x: 120, y: -20 },
          ],
          [
            { x: 120, y: -20 },
            { x: 120, y: -45 },
          ],
          [
            { x: 120, y: -45 },
            { x: 40, y: -45 },
          ],
        ],
      },
    ]

    expect(collectLinearLayoutViolations(callouts, input)).toContain('callout 0 leader segment 1 intersects callout 1 leader segment 2')
  })

  it('allows only +1 row or row-1 drop transitions along each half sweep', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [851, 857, 863, 869, 875, 881].map((start, index) => site(`R${index + 1}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
      labelForSite: (s) => s.enzyme.name,
      labelWidthForSite: (_s, label) => label.length * 7 + 6,
    }
    const callouts = layoutLinearEnzymeCallouts(input)
    const rightSweep = callouts.filter((callout) => callout.site.cutTop >= 450).toSorted((a, b) => b.site.cutTop - a.site.cutTop)
    const stubHeight = 48
    const baseLabelY = input.strandY! - stubHeight - 6 - 3
    const rowGap = 12 + 7

    expect(rightSweep.length).toBeGreaterThanOrEqual(4)
    let previousRow: number | undefined
    rightSweep.forEach((callout) => {
      const centerY = (callout.box.top + callout.box.bottom) / 2
      const row = Math.round((baseLabelY - centerY) / rowGap)
      expect(linearSweepRowTransitionAllowed(row, previousRow)).toBe(true)
      if (previousRow !== undefined) {
        expect(row === previousRow + 1 || row === 0).toBe(true)
      }
      previousRow = row
    })
    assertLinearLayoutValid(callouts, input)
  })

  it('computes ladder spread end from next label width and feature clearance', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [44, 46, 48, 50, 52, 160].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
    }
    const items = input.sites.map((site, index) => ({
      site,
      index,
      label: site.enzyme.name,
      labelWidth: index === 5 ? 68 : 40,
      textHeight: 12,
      quarter: 'upper-right' as const,
      side: 'right' as const,
      anchor: {
        x: input.trackLeft + (site.start / input.sequenceLength) * (input.trackRight - input.trackLeft),
        y: input.strandY!,
      },
      elbow: { x: 0, y: 0 },
      progress: 0,
    }))
    const sorted = items.toSorted((a, b) => a.site.start - b.site.start)
    const ladderMap = buildLinearLadderGroupMap(sorted, input, 'left')
    const first = ladderMap.get(items[0].index)!
    const last = ladderMap.get(items[4].index)!
    const next = items[5]
    const expectedSpreadEnd = next.anchor.x - (next.labelWidth + input.featureHeight! / 2)
    const expectedStep = (expectedSpreadEnd - first.anchorStart) / first.labelCount

    expect(first.labelCount).toBe(5)
    expect(Math.abs(last.spreadEnd - expectedSpreadEnd)).toBeLessThanOrEqual(0.001)
    for (let index = 0; index < 5; index += 1) {
      const group = ladderMap.get(items[index].index)!
      const target = linearLadderTargetAttachX(group)
      const expected = first.anchorStart + index * expectedStep
      expect(Math.abs(target - expected)).toBeLessThanOrEqual(0.001)
    }
  })

  it('places pDemo right-end MCS enzymes including NdeI without layout violations', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [
        site('EcoRI', 0),
        site('NheI', 6),
        site('HindIII', 29),
        site('NotI', 35),
        site('XhoI', 42),
        site('BsaI', 48),
        site('SpeI', 54),
        site('HindIII', 851),
        site('KpnI', 857),
        site('BamHI', 863),
        site('PstI', 869),
        site('NdeI', 875),
        site('NotI', 881),
      ],
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
      labelForSite: (s) => s.enzyme.name,
      labelWidthForSite: (_s, label) => label.length * 7 + 6,
    }
    const callouts = layoutLinearEnzymeCallouts(input)
    const nde = callouts.find((callout) => callout.site.enzyme.name === 'NdeI')
    const rightMcs = callouts.filter((callout) => callout.site.cutTop >= 851)

    expect(callouts).toHaveLength(13)
    expect(nde).toBeDefined()
    expect(rightMcs).toHaveLength(6)
    assertLinearLayoutValid(callouts, input)
    const ndeCenterY = (nde!.box.top + nde!.box.bottom) / 2
    const lowestRightCenterY = Math.max(...rightMcs.map((callout) => (callout.box.top + callout.box.bottom) / 2))
    expect(ndeCenterY).toBeGreaterThan(lowestRightCenterY - 55)
  })

  it('insets the linear track so edge labels fit inside the viewport map width', () => {
    const viewportWidth = 900
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [site('LeftEnd', 2), site('RightEnd', 898)],
      sequenceLength: 900,
      mapWidth: viewportWidth,
      mapHeight: 600,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
      labelForSite: (s) => s.enzyme.name,
      labelWidthForSite: (_s, label) => label.length * 7 + 6,
    }
    const provisional = layoutLinearEnzymeCallouts(input)
    const track = computeLinearTrackLayout(viewportWidth, provisional, 16)
    expect(track.mapWidth).toBe(viewportWidth)
    expect(track.trackLeft).toBeGreaterThan(16)
    expect(track.trackRight).toBeLessThan(884)

    const fitted = layoutLinearEnzymeCallouts({ ...input, mapWidth: track.mapWidth, trackLeft: track.trackLeft, trackRight: track.trackRight })
    const view = fitLinearMapViewBox(fitted, track.trackLeft, track.trackRight, 28, 140, 10, track.mapWidth)
    expect(view.left).toBe(0)
    expect(view.width).toBe(viewportWidth)
    assertLinearLayoutValid(fitted, { ...input, mapWidth: track.mapWidth, trackLeft: track.trackLeft, trackRight: track.trackRight })

    fitted.forEach((callout) => {
      const minX = Math.min(callout.box.left, callout.anchor.x, callout.elbow.x, callout.connectorEnd.x)
      const maxX = Math.max(callout.box.right, callout.anchor.x, callout.elbow.x, callout.connectorEnd.x)
      expect(minX).toBeGreaterThanOrEqual(0)
      expect(maxX).toBeLessThanOrEqual(viewportWidth)
    })
  })

  it('places many linear labels while keeping leaders and labels collision-free', () => {
    const starts = Array.from({ length: 75 }, (_value, index) => Math.round(4 + index * (890 / 74)))
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: starts.map((start, index) => site(`E${index}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 1400,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
      labelForSite: (s) => s.enzyme.name,
      labelWidthForSite: (_s, label) => label.length * 7 + 6,
    }
    const callouts = layoutLinearEnzymeCallouts(input)

    expect(callouts).toHaveLength(input.sites.length)
    expect(collectLinearLayoutViolations(callouts, input)).toEqual([])
  })

  it('places every primer label when guaranteePlacement is enabled', () => {
    const primerSites = Array.from({ length: 36 }, (_, index) => ({
      ...site(`Primer ${index + 1}`, 40 + index * 8),
      match: `__primer_callout__${index}`,
    }))
    const heightBase = {
      strandY: 28,
      featureStubHeight: 48,
      featureHeight: 24,
      protectedBandBottom: 140,
      textHeight: 14,
    }
    const mapHeight = estimateLinearMapHeightForRows(primerSites.length + 4, heightBase, 14)
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: primerSites,
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureHeight: 24,
      featureStubHeight: 48,
      textHeightForSite: () => 14,
      labelPaddingForSite: () => 12,
      labelWidthForSite: (_site, label) => label.length * 7 + 12,
      guaranteePlacement: true,
    }
    const callouts = layoutLinearEnzymeCallouts(input)

    expect(callouts).toHaveLength(primerSites.length)
    expect(collectLinearLayoutViolations(callouts, input)).toEqual([])
  })

  it('stacks dense linear labels vertically near their cut sites', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      sites: [5, 11, 17, 23, 29, 35, 41, 47, 53, 59, 65, 71].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 900,
      mapWidth: 1200,
      mapHeight: 900,
      trackLeft: 16,
      trackRight: 884,
      strandY: 28,
      protectedBandTop: 38,
      protectedBandBottom: 140,
      featureStubHeight: 48,
    }
    const callouts = layoutLinearEnzymeCallouts(input)

    expect(callouts.length).toBeGreaterThanOrEqual(8)
    expect(collectLinearLayoutViolations(callouts, input)).toEqual([])
    callouts.forEach((callout) => {
      expect(callout.anchor.x).toBeCloseTo(callout.elbow.x, 0.5)
      expect(callout.segments[0][0].x).toBeCloseTo(callout.segments[0][1].x, 0.5)
      if (callout.site.cutTop < input.sequenceLength / 2) {
        expect(callout.box.right).toBeLessThanOrEqual(callout.anchor.x + 16)
      } else {
        expect(callout.box.left).toBeGreaterThanOrEqual(callout.anchor.x - 16)
      }
    })
  })

  it('keeps packed leaders close to each site polar projection', () => {
    const mapSize = 600
    const center = 300
    const radius = 150
    const input: EnzymeCalloutLayoutInput = {
      sites: [5, 12, 20].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 900,
      mapSize,
      center,
      radius,
      outerFeatureOffset: 18,
    }
    const callouts = layoutEnzymeCalloutsPacked(input)

    expect(callouts).toHaveLength(3)
    callouts.forEach((callout) => {
      const connectorLen = Math.hypot(callout.connectorEnd.x - callout.elbow.x, callout.connectorEnd.y - callout.elbow.y)
      expect(connectorLen).toBeLessThan(90)
      expect(Math.hypot(callout.connectorEnd.x - center, callout.connectorEnd.y - center)).toBeGreaterThanOrEqual(radius)
    })
  })

  it('keeps packed labels near the ring at large radius', () => {
    const mapSize = 1600
    const center = 800
    const radius = 600
    const input: EnzymeCalloutLayoutInput = {
      sites: [5, 40, 80, 120, 200, 280].map((start, index) => site(`E${index + 1}`, start)),
      sequenceLength: 3600,
      mapSize,
      mapWidth: 1600,
      mapHeight: 1200,
      center,
      centerX: center,
      centerY: 600,
      radius,
      outerFeatureOffset: 18,
    }
    const callouts = layoutEnzymeCalloutsPacked(input)
    expect(callouts.length).toBeGreaterThan(0)
    callouts.forEach((callout) => {
      const connectorLen = Math.hypot(callout.connectorEnd.x - callout.elbow.x, callout.connectorEnd.y - callout.elbow.y)
      expect(connectorLen).toBeLessThan(120)
      expect(callout.box.left).toBeGreaterThanOrEqual(0)
      expect(callout.box.right).toBeLessThanOrEqual(1600)
      expect(callout.box.top).toBeGreaterThanOrEqual(0)
      expect(callout.box.bottom).toBeLessThanOrEqual(1200)
    })
  })

  it('sizes bond-label ladder clearance and viewBox for stacked callouts', () => {
    const textHeight = 12
    const stubHeight = 8
    const rows = 12
    expect(linearCalloutLadderRowGap(textHeight)).toBe(textHeight + 9)
    const aboveStrand = linearCalloutLadderHeightAboveStrand(rows, textHeight, stubHeight)
    // 12 rows at ~21px pitch plus stub/text padding must clear a typical title band.
    expect(aboveStrand).toBeGreaterThan(200)

    const strandY = 56 + 10 + aboveStrand
    const callouts: EnzymeCallout[] = Array.from({ length: rows }, (_, index) => {
      const y = strandY - stubHeight - textHeight / 2 - 1 - index * linearCalloutLadderRowGap(textHeight)
      return {
        index,
        site: site(`Bond${index}`, 10 + index),
        label: `Bond${index}`,
        x: 40,
        y,
        box: { left: 40, right: 100, top: y - textHeight / 2, bottom: y + textHeight / 2 },
        anchor: { x: 80, y: strandY },
        elbow: { x: 80, y },
        connectorEnd: { x: 40, y },
        segments: [],
      }
    })
    const view = fitLinearMapViewBox(callouts, 40, 400, strandY + 20, strandY + 80, 10, 480, 8)
    expect(view.top).toBeLessThanOrEqual(callouts[rows - 1]!.box.top - 10)
    expect(view.height).toBeGreaterThan(aboveStrand)
  })
})
