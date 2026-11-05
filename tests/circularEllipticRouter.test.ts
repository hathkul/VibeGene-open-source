import { describe, expect, it } from 'vitest'
import {
  computeEllipticRadii,
  cubicArcMaintainsRadialClearance,
  cubicArcPoint,
  circularRoutingQualityIsBetter,
  curveRadiusAtPolarAngle,
  layoutCircularEllipticCalloutsStrict,
  leaderCrossesRing,
  maxCubicArcCurvatureForRadialClearance,
} from '../src/domain/circularEllipticRouter'
import { calloutsContentBounds, circularRadiusBounds, contentFitsViewport } from '../src/domain/enzymeLabelBudget'
import { parseCircularRouterAlgorithm } from '../src/domain/circularLaneRouter'
import {
  leaderBendAngleDegrees,
  summarizeLeaderBendAngles,
  type EnzymeCalloutLayoutResult,
  type EnzymeCallout,
  type EnzymeCalloutLayoutInput,
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

function inputFor(starts: number[], radius = 220, mapSize = 900): EnzymeCalloutLayoutInput {
  const center = mapSize / 2
  return {
    sites: starts.map((start, index) => site(`E${index + 1}`, start)),
    sequenceLength: 3600,
    mapSize,
    mapWidth: mapSize,
    mapHeight: mapSize,
    center,
    centerX: center,
    centerY: center,
    radius,
    outerFeatureOffset: 18,
  }
}

function signedLeaderTurnDegrees(
  callout: Pick<EnzymeCallout, 'site' | 'elbow' | 'connectorEnd'>,
  sequenceLength: number,
) {
  const theta = (callout.site.start / sequenceLength) * Math.PI * 2 - Math.PI / 2
  const radialX = Math.cos(theta)
  const radialY = Math.sin(theta)
  const leaderX = callout.connectorEnd.x - callout.elbow.x
  const leaderY = callout.connectorEnd.y - callout.elbow.y
  return (Math.atan2(radialX * leaderY - radialY * leaderX, radialX * leaderX + radialY * leaderY) * 180) / Math.PI
}

describe('circularEllipticRouter', () => {
  it('balances worst-bend quality against count and bounded viewport growth', () => {
    type Quality = NonNullable<EnzymeCalloutLayoutResult['routingQuality']>
    const quality = (overrides: Partial<Quality>): Quality => ({
      fitsViewport: false,
      viewportOverflowPx: 200,
      minBendAngle: 100,
      meanBendAngle: 130,
      belowTargetBendCount: 2,
      belowTargetBendSeverity: 40,
      maxLeaderLength: 100,
      meanLeaderLength: 60,
      ...overrides,
    })

    const improvedWorst = quality({
      viewportOverflowPx: 204,
      minBendAngle: 108,
      meanBendAngle: 132,
      belowTargetBendCount: 3,
      belowTargetBendSeverity: 36,
    })
    expect(circularRoutingQualityIsBetter(improvedWorst, quality({}))).toBe(true)

    const worseWorstWithFewerFailures = quality({
      minBendAngle: 78,
      meanBendAngle: 136,
      belowTargetBendCount: 1,
      belowTargetBendSeverity: 44,
    })
    expect(circularRoutingQualityIsBetter(worseWorstWithFewerFailures, quality({}))).toBe(false)

    expect(circularRoutingQualityIsBetter(quality({ viewportOverflowPx: 224 }), quality({}))).toBe(false)
    expect(circularRoutingQualityIsBetter(quality({ viewportOverflowPx: 204, meanBendAngle: 129 }), quality({}))).toBe(false)
  })

  it('summarizes interior leader bend angles', () => {
    const leaders = [
      {
        anchor: { x: 0, y: 0 },
        elbow: { x: 1, y: 0 },
        connectorEnd: { x: 2, y: 0 },
      },
      {
        anchor: { x: 0, y: 0 },
        elbow: { x: 1, y: 0 },
        connectorEnd: { x: 1, y: 1 },
      },
    ]

    expect(leaderBendAngleDegrees(leaders[0])).toBeCloseTo(180)
    expect(leaderBendAngleDegrees(leaders[1])).toBeCloseTo(90)
    expect(summarizeLeaderBendAngles(leaders)).toEqual({ count: 2, min: 90, mean: 135, max: 180 })
  })

  it('reports both the count and total severity of leaders below the 120 degree target', () => {
    const result = layoutCircularEllipticCalloutsStrict({
      ...inputFor([100, 900, 1800, 2700], 200),
      balanceRing: false,
    })
    const quality = result.routingQuality!
    const bends = result.callouts
      .map((callout) => leaderBendAngleDegrees(callout))
      .filter((angle): angle is number => angle !== null)
    const expectedBelowTarget = bends.filter((angle) => angle < 120)

    expect(quality.belowTargetBendCount).toBe(expectedBelowTarget.length)
    expect(quality.belowTargetBendSeverity).toBeCloseTo(
      expectedBelowTarget.reduce((sum, angle) => sum + 120 - angle, 0),
    )
  })

  it('parses elliptic algorithm flag', () => {
    expect(parseCircularRouterAlgorithm('elliptic')).toBe('elliptic')
    expect(parseCircularRouterAlgorithm('lane')).toBe('lane')
    expect(parseCircularRouterAlgorithm(null)).toBe('elliptic')
    expect(parseCircularRouterAlgorithm('classic')).toBe('classic')
  })

  it('makes the oval closest to the ring at 3h/9h when viewport allows', () => {
    const { a, b } = computeEllipticRadii(inputFor([0], 200))
    expect(a).toBeLessThanOrEqual(b)
    expect(a).toBeGreaterThan(200)
  })

  it('supports an explicit horizontal ring-to-oval gap', () => {
    const compact = computeEllipticRadii({
      ...inputFor([0], 200),
      ringGap: 0,
      sideBudget: 0,
      ellipticHorizontalGapPx: 32,
    })
    const wide = computeEllipticRadii({
      ...inputFor([0], 200),
      ringGap: 0,
      sideBudget: 0,
      ellipticHorizontalGapPx: 120,
    })

    expect(compact.a).toBe(232)
    expect(wide.a).toBe(320)
  })

  it('supports an explicit vertical ring-to-oval gap', () => {
    const compact = computeEllipticRadii({
      ...inputFor([0], 200),
      ellipticVerticalGapPx: 40,
    })
    const tall = computeEllipticRadii({
      ...inputFor([0], 200),
      ellipticVerticalGapPx: 120,
    })

    expect(compact.b).toBe(240)
    expect(tall.b).toBe(320)
  })

  it('uses independent equator and polar controls for two-arc mode', () => {
    const compact = computeEllipticRadii({
      ...inputFor([0], 200),
      labelCurveShape: 'arcs',
      ringGap: 0,
      sideBudget: 0,
      arcHorizontalGapPx: 32,
      arcUpperVerticalGapPx: 40,
      arcLowerVerticalGapPx: 40,
      arcUpperTipAngleDegrees: 170,
      arcLowerTipAngleDegrees: 170,
    })
    const tall = computeEllipticRadii({
      ...inputFor([0], 200),
      labelCurveShape: 'arcs',
      ringGap: 0,
      sideBudget: 0,
      arcHorizontalGapPx: 120,
      arcUpperVerticalGapPx: 160,
      arcLowerVerticalGapPx: 80,
      arcUpperTipAngleDegrees: 170,
      arcLowerTipAngleDegrees: 170,
    })

    expect(compact.a).toBe(232)
    expect(tall.a).toBe(320)
    expect(tall.bTop).toBe(360)
    expect(tall.bBottom).toBeLessThan(tall.bTop)
    expect(tall.b).toBeGreaterThan(compact.b)
  })

  it('reserves room below automatic arcs for an external map name and length', () => {
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor([1500, 1800, 2100], 200, 800),
      labelCurveShape: 'arcs',
      ringGap: 0,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
    }
    const normalRadii = computeEllipticRadii(input)
    const reservedInput = { ...input, bottomReservedPx: 64 }
    const reservedRadii = computeEllipticRadii(reservedInput)
    const reserved = layoutCircularEllipticCalloutsStrict(reservedInput)

    expect(reservedRadii.maxBBottom).toBe(normalRadii.maxBBottom - 64)
    expect(reserved.hasPlacementFailure).toBe(false)
    expect(reserved.routingQuality?.fitsViewport).toBe(true)
    expect(Math.max(...reserved.callouts.map((callout) => callout.box.bottom))).toBeLessThan(800 - 64)
  })

  it('counts the ring itself when a below-map title cannot fit', () => {
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor([], 260, 600),
      labelCurveShape: 'arcs',
    }
    expect(layoutCircularEllipticCalloutsStrict(input).routingQuality?.fitsViewport).toBe(true)
    const reserved = layoutCircularEllipticCalloutsStrict({ ...input, bottomReservedPx: 64 })
    expect(reserved.routingQuality?.fitsViewport).toBe(false)
    expect(reserved.routingQuality?.viewportOverflowPx).toBeGreaterThan(0)
    const smaller = layoutCircularEllipticCalloutsStrict({
      ...input,
      radius: 220,
      bottomReservedPx: 64,
    })
    expect(smaller.routingQuality?.fitsViewport).toBe(true)
  })

  it('does not compress a manual vertical gap below label-stack capacity', () => {
    const dense = computeEllipticRadii({
      ...inputFor(Array.from({ length: 40 }, (_, index) => index * 10), 200),
      ellipticVerticalGapPx: 16,
    })

    expect(dense.b).toBe(dense.capacityB)
    expect(dense.b).toBeGreaterThan(216)
  })

  it('caps oval axes so labels can stay inside the map box', () => {
    const input = inputFor([0], 320, 800)
    const { a, b, maxA, maxB } = computeEllipticRadii(input)
    expect(a).toBeLessThanOrEqual(maxA)
    expect(b).toBeLessThanOrEqual(maxB)
    expect(a).toBeLessThanOrEqual(400 - 64)
    expect(b).toBeLessThanOrEqual(400 - 14)
  })

  it('places sparse labels without overlaps or failure', () => {
    const input = inputFor([100, 900, 1800, 2700], 200)
    const { callouts, hasPlacementFailure } = layoutCircularEllipticCalloutsStrict(input)
    expect(hasPlacementFailure).toBe(false)
    expect(callouts).toHaveLength(4)
    for (let i = 0; i < callouts.length; i += 1) {
      for (let j = i + 1; j < callouts.length; j += 1) {
        const a = callouts[i].box
        const b = callouts[j].box
        const overlap = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
        expect(overlap).toBe(false)
      }
    }
  })

  it('keeps leaders reasonably short on a large ring', () => {
    const input = inputFor(
      Array.from({ length: 24 }, (_, i) => Math.floor((i / 24) * 3600)),
      280,
    )
    const { callouts } = layoutCircularEllipticCalloutsStrict(input)
    expect(callouts.length).toBeGreaterThan(0)
    const avg =
      callouts.reduce((sum, callout) => {
        const len = Math.hypot(callout.connectorEnd.x - callout.elbow.x, callout.connectorEnd.y - callout.elbow.y)
        return sum + len
      }, 0) / callouts.length
    expect(avg).toBeLessThan(160)
  })

  it('fits a moderate label set inside the viewport at the largest radius that fits', () => {
    const starts = Array.from({ length: 24 }, (_, i) => Math.floor((i / 24) * 3600))
    const mapSize = 800
    const { maxRadius, hardMinRadius } = circularRadiusBounds(mapSize, mapSize, {
      algorithm: 'elliptic',
      siteCount: starts.length,
    })
    let chosen: number | null = null
    for (let radius = maxRadius; radius >= hardMinRadius; radius -= 12) {
      const input = inputFor(starts, radius, mapSize)
      const { callouts, hasPlacementFailure } = layoutCircularEllipticCalloutsStrict(input)
      if (hasPlacementFailure || callouts.length !== starts.length) continue
      const bounds = calloutsContentBounds(callouts, radius, mapSize / 2, mapSize / 2)
      if (!contentFitsViewport(bounds, mapSize, mapSize)) continue
      chosen = radius
      break
    }
    expect(chosen).not.toBeNull()
    expect(chosen).toBeLessThanOrEqual(maxRadius)
    expect(chosen).toBeGreaterThanOrEqual(hardMinRadius)

    const fitted = layoutCircularEllipticCalloutsStrict(inputFor(starts, chosen as number, mapSize))
    expect(fitted.hasPlacementFailure).toBe(false)
    expect(fitted.callouts).toHaveLength(24)
    expect(contentFitsViewport(calloutsContentBounds(fitted.callouts, chosen as number, mapSize / 2, mapSize / 2), mapSize, mapSize)).toBe(true)
    for (let i = 0; i < fitted.callouts.length; i += 1) {
      for (let j = i + 1; j < fitted.callouts.length; j += 1) {
        const a = fitted.callouts[i].box
        const b = fitted.callouts[j].box
        const overlap = a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5
        expect(overlap).toBe(false)
      }
    }
  })

  it('places dense long labels without AABB overlaps', () => {
    const starts = Array.from({ length: 40 }, (_, i) => Math.floor((i / 40) * 3600))
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor(starts, 240),
      labelForSite: (site) => `${site.enzyme.name}-restriction (${site.start + 1})`,
      labelWidthForSite: (_site, label) => label.length * 6.2 + 10,
      textHeightForSite: () => 12,
    }
    const center = { x: 450, y: 450 }
    const { callouts } = layoutCircularEllipticCalloutsStrict(input)
    expect(callouts.length).toBeGreaterThanOrEqual(28)
    let overlaps = 0
    for (let i = 0; i < callouts.length; i += 1) {
      for (let j = i + 1; j < callouts.length; j += 1) {
        const a = callouts[i].box
        const b = callouts[j].box
        if (a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5) overlaps += 1
      }
      expect(leaderCrossesRing(callouts[i].elbow, callouts[i].connectorEnd, center, input.radius)).toBe(false)
      expect(callouts[i].box.left).toBeGreaterThanOrEqual(0)
      expect(callouts[i].box.right).toBeLessThanOrEqual(900)
      expect(callouts[i].box.top).toBeGreaterThanOrEqual(-200)
      expect(callouts[i].box.bottom).toBeLessThanOrEqual(1100)
    }
    expect(overlaps).toBe(0)
  })

  it('keeps crowded upper-right labels on the right half without crossing the ring', () => {
    // All sites in upper-right (0..25% of circle).
    const starts = Array.from({ length: 12 }, (_, i) => Math.floor((i / 12) * 900))
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor(starts, 260),
      balanceRing: false,
      labelForSite: (site) => `${site.enzyme.name}-long-name (${site.start + 1})`,
      labelWidthForSite: (_site, label) => label.length * 6.2 + 10,
      textHeightForSite: () => 12,
    }
    const center = { x: 450, y: 450 }
    const { callouts } = layoutCircularEllipticCalloutsStrict(input)
    expect(callouts.length).toBeGreaterThan(0)

    callouts.forEach((callout) => {
      expect(leaderCrossesRing(callout.elbow, callout.connectorEnd, center, input.radius)).toBe(false)
      // Must stay on the right half (side packing, not a hard upper/lower clamp).
      expect(callout.box.left).toBeGreaterThanOrEqual(center.x - 2)
      expect(callout.textAnchor).toBe('start')
    })
  })

  it('balances a collision-packed upper-left run around radial leaders', () => {
    const starts = Array.from({ length: 8 }, (_, index) => 3000 + index * 24)
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor(starts, 220),
      balanceRing: false,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
      labelForSite: () => 'XXXXXXXX',
      labelWidthForSite: () => 60,
      textHeightForSite: () => 12,
    }
    const { callouts, hasPlacementFailure } = layoutCircularEllipticCalloutsStrict(input)

    const signedTurns = callouts.map((callout) => signedLeaderTurnDegrees(callout, input.sequenceLength))

    expect(hasPlacementFailure).toBe(false)
    expect(Math.min(...signedTurns)).toBeLessThan(-5)
    expect(Math.max(...signedTurns)).toBeGreaterThan(5)
    expect(Math.abs(signedTurns.reduce((sum, turn) => sum + turn, 0) / signedTurns.length)).toBeLessThan(1)
    expect(Math.min(...signedTurns.map(Math.abs))).toBeLessThan(3)
    expect(signedTurns.reduce((sum, turn) => sum + 180 - Math.abs(turn), 0) / signedTurns.length).toBeGreaterThan(170)

    for (let i = 0; i < callouts.length; i += 1) {
      for (let j = i + 1; j < callouts.length; j += 1) {
        const first = callouts[i].box
        const second = callouts[j].box
        expect(first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top).toBe(false)
      }
    }

    const arcResult = layoutCircularEllipticCalloutsStrict({
      ...input,
      labelCurveShape: 'arcs',
      arcUpperTipAngleDegrees: 150,
      arcLowerTipAngleDegrees: 150,
    })
    expect(arcResult.hasPlacementFailure).toBe(false)
    expect(arcResult.callouts).toHaveLength(callouts.length)
    expect(
      Math.min(...arcResult.callouts.map((callout) => leaderBendAngleDegrees(callout) ?? 0)),
    ).toBeGreaterThan(90)
  })

  it('preserves dense-run balance after moving the ring toward open space', () => {
    const denseStarts = Array.from({ length: 8 }, (_, index) => 3000 + index * 24)
    const starts = [200, 900, 1600, 2400, ...denseStarts]
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor(starts, 220),
      raySlideEnabled: false,
      radialImplodeEnabled: false,
      labelForSite: () => 'XXXXXXXX',
      labelWidthForSite: () => 60,
      textHeightForSite: () => 12,
    }
    const { callouts, ringCenter } = layoutCircularEllipticCalloutsStrict(input)
    const signedTurns = callouts
      .filter((callout) => callout.site.start >= denseStarts[0])
      .map((callout) => signedLeaderTurnDegrees(callout, input.sequenceLength))

    expect(ringCenter).toBeTruthy()
    expect(Math.hypot(ringCenter!.x - 450, ringCenter!.y - 450)).toBeGreaterThan(2)
    expect(Math.min(...signedTurns)).toBeLessThan(-5)
    expect(Math.max(...signedTurns)).toBeGreaterThan(5)
    expect(Math.abs(signedTurns.reduce((sum, turn) => sum + turn, 0) / signedTurns.length)).toBeLessThan(1)
  })

  it('uses both sides of a populated pole shelf to unblock a plasmid-like dense run', () => {
    const sequenceLength = 5976
    const rightStarts = [246, 282, 906, 1018]
    const leftStarts = [4692, 4793, 4838, 4903, 5054, 5096, 5116, 5117, 5135, 5163, 5189, 5190, 5201, 5203, 5204, 5243, 5268, 5276, 5277, 5281, 5340, 5433, 5555, 5575, 5767, 5773, 5859, 5891]
    const starts = [...rightStarts, ...leftStarts]
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor([], 370, 1053),
      sites: starts.map((start, index) => site(index % 4 === 0 ? `Long primer label ${index}` : `E${index}`, start)),
      sequenceLength,
      mapWidth: 1656,
      mapHeight: 1053,
      center: 828,
      centerX: 828,
      centerY: 526.5,
      balanceRing: false,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
      labelForSite: (entry) => entry.enzyme.name,
      labelWidthForSite: (_entry, label) => label.length * 6.5 + 6,
      textHeightForSite: () => 14,
    }
    const { callouts, hasPlacementFailure } = layoutCircularEllipticCalloutsStrict(input)
    const dense = callouts.filter((callout) => callout.site.start >= 5054 && callout.site.start <= 5575)
    const signedTurns = dense.map((callout) => signedLeaderTurnDegrees(callout, sequenceLength))

    expect(hasPlacementFailure).toBe(false)
    expect(callouts.some((callout) => callout.site.start > sequenceLength * 0.75 && callout.textAnchor === 'start')).toBe(true)
    expect(Math.min(...signedTurns)).toBeLessThan(-20)
    expect(Math.max(...signedTurns)).toBeGreaterThan(20)
    expect(Math.min(...dense.map((callout) => leaderBendAngleDegrees(callout) ?? 0))).toBeGreaterThan(90)

    for (let i = 0; i < callouts.length; i += 1) {
      for (let j = i + 1; j < callouts.length; j += 1) {
        const first = callouts[i].box
        const second = callouts[j].box
        expect(first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top).toBe(false)
      }
    }
  })

  it('uses free polar shelf space to straighten arc-mode labels near 12h', () => {
    const sequenceLength = 5976
    const starts = [
      246, 282, 906, 1018,
      4692, 4793, 4838, 4903, 5054, 5096, 5116, 5117, 5135, 5163, 5189, 5190,
      5201, 5203, 5204, 5243, 5268, 5276, 5277, 5281, 5340, 5433, 5555, 5575,
      5767, 5773, 5859, 5891,
    ]
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor([], 370, 1053),
      sites: starts.map((start, index) => site(index % 4 === 0 ? `Long primer label ${index}` : `E${index}`, start)),
      sequenceLength,
      mapWidth: 1656,
      mapHeight: 1053,
      center: 828,
      centerX: 828,
      centerY: 526.5,
      labelCurveShape: 'arcs',
      balanceRing: true,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
      labelForSite: (entry) => entry.enzyme.name,
      labelWidthForSite: (_entry, label) => label.length * 6.5 + 6,
      textHeightForSite: () => 14,
    }
    const debug: Array<Record<string, unknown>> = []
    const { callouts, hasPlacementFailure } = layoutCircularEllipticCalloutsStrict({
      ...input,
      debugLog: (entry) => debug.push(entry),
    })
    const compact = layoutCircularEllipticCalloutsStrict({
      ...input,
      arcUpperTipAngleDegrees: 175,
      arcLowerTipAngleDegrees: 175,
    })
    const poleLabels = callouts.filter((callout) => callout.site.start >= 5767)
    const compactPoleLabels = compact.callouts.filter((callout) => callout.site.start >= 5767)
    const autoStats = summarizeLeaderBendAngles(poleLabels)!
    const compactStats = summarizeLeaderBendAngles(compactPoleLabels)!

    expect(hasPlacementFailure).toBe(false)
    expect(poleLabels).toHaveLength(4)
    expect(autoStats.min).toBeGreaterThan(90)
    expect(autoStats.min).toBeGreaterThan(compactStats.min + 5)
    expect(autoStats.mean).toBeGreaterThan(compactStats.mean + 5)
    expect(Number(debug[0]?.arcUpperTipAngleDegrees)).toBeLessThan(175)
    for (let i = 0; i < callouts.length; i += 1) {
      for (let j = i + 1; j < callouts.length; j += 1) {
        const first = callouts[i].box
        const second = callouts[j].box
        expect(first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top).toBe(false)
      }
    }
  })

  it('keeps automatic arcs inside a short viewport before spending height on sharper tips', () => {
    const sequenceLength = 5976
    const starts = [
      246, 282, 906, 1018, 1321, 1387, 1866, 2275, 2392, 2506, 2507, 2508,
      2533, 3177, 3270, 3535, 3930, 3965, 4169, 4173, 4362, 4700, 4801, 4844,
      4909, 5057, 5098, 5117, 5136, 5146, 5164, 5191, 5204, 5210, 5222, 5236,
      5270, 5277, 5278, 5282, 5307, 5310, 5348, 5453, 5559, 5561, 5580, 5769,
      5774, 5844, 5860, 5894,
    ]
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor([], 266, 590),
      sites: starts.map((start, index) => site(`Label ${index}`, start)),
      sequenceLength,
      mapWidth: 936,
      mapHeight: 590,
      center: 468,
      centerX: 468,
      centerY: 295,
      labelCurveShape: 'arcs',
      ringGap: 0,
      balanceRing: true,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
      labelForSite: (entry) => entry.enzyme.name,
      labelWidthForSite: (_entry, label) => label.length * 6.5 + 6,
      textHeightForSite: () => 14,
    }

    const automatic = layoutCircularEllipticCalloutsStrict(input)
    const forcedSharp = layoutCircularEllipticCalloutsStrict({
      ...input,
      arcUpperTipAngleDegrees: 125,
      arcLowerTipAngleDegrees: 125,
    })

    expect(automatic.hasPlacementFailure).toBe(false)
    expect(automatic.routingQuality?.fitsViewport).toBe(true)
    expect(automatic.routingQuality?.viewportOverflowPx).toBe(0)
    expect(forcedSharp.routingQuality?.viewportOverflowPx).toBeGreaterThan(0)
  })

  it('switches to an uncapped scroll layout when an arc label shelf cannot fit the viewport', () => {
    const starts = Array.from({ length: 128 }, (_, index) => index * 28)
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor(starts, 240, 600),
      labelCurveShape: 'arcs',
      ringGap: 24,
      balanceRing: false,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
      labelForSite: () => 'Long outside label',
      labelWidthForSite: () => 112,
      textHeightForSite: () => 14,
    }
    const result = layoutCircularEllipticCalloutsStrict(input)

    expect(result.overflowMode).toBe(true)
    expect(result.hasPlacementFailure).toBe(false)
    expect(result.routingQuality?.fitsViewport).toBe(false)
    expect(result.callouts).toHaveLength(starts.length)
    const top = Math.min(...result.callouts.map((callout) => callout.box.top))
    const bottom = Math.max(...result.callouts.map((callout) => callout.box.bottom))
    expect(bottom - top).toBeGreaterThan(input.mapSize)
    for (let i = 0; i < result.callouts.length; i += 1) {
      for (let j = i + 1; j < result.callouts.length; j += 1) {
        const first = result.callouts[i].box
        const second = result.callouts[j].box
        const overlaps =
          first.left < second.right &&
          first.right > second.left &&
          first.top < second.bottom &&
          first.bottom > second.top
        expect(overlaps).toBe(false)
      }
    }
  })

  it('can compact sparse polar overflow toward the ring without lowering the protected minimum bend', () => {
    let randomState = 1
    const random = () => {
      randomState = (randomState * 1_664_525 + 1_013_904_223) >>> 0
      return randomState / 2 ** 32
    }
    const sequenceLength = 14_261
    const starts = [
      ...Array.from({ length: 105 }, () => Math.floor(random() * sequenceLength)),
      ...Array.from({ length: 35 }, () => Math.floor(random() * 1_200)),
      ...Array.from({ length: 35 }, () => 6_900 + Math.floor(random() * 1_200)),
    ].sort((left, right) => left - right)
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor([], 307.44, 1098),
      sites: starts.map((start, index) => site(`Outside sequencing primer ${index}`, start)),
      sequenceLength,
      mapWidth: 3678,
      mapHeight: 1098,
      center: 1839,
      centerX: 1839,
      centerY: 549,
      labelCurveShape: 'arcs',
      ringGap: 24,
      balanceRing: true,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
      labelForSite: (entry) => entry.enzyme.name,
      labelWidthForSite: (_entry, label) => label.length * 7,
      labelPaddingForSite: () => 12,
      textHeightForSite: () => 16,
    }

    const normal = layoutCircularEllipticCalloutsStrict(input)
    const compact = layoutCircularEllipticCalloutsStrict({
      ...input,
      arcCompactOverflowLabels: true,
    })
    const normalQuality = normal.routingQuality!
    const compactQuality = compact.routingQuality!

    expect(normal.overflowMode).toBe(true)
    expect(compact.overflowMode).toBe(true)
    expect(compact.hasPlacementFailure).toBe(false)
    expect(compactQuality.minBendAngle).toBeGreaterThanOrEqual(normalQuality.minBendAngle - 1e-4)
    expect(compactQuality.maxLeaderLength).toBeLessThan(normalQuality.maxLeaderLength)
    expect(compactQuality.viewportOverflowPx).toBeLessThan(normalQuality.viewportOverflowPx - 500)
  })

  it('enters arc overflow when final balancing makes independently packed labels collide', () => {
    const sequenceLength = 14_261
    const background = Array.from({ length: 80 }, (_, index) =>
      site(`Background primer ${index}`, Math.round((index / 80) * sequenceLength)),
    )
    const denseShelf = Array.from({ length: 30 }, (_, index) =>
      site(`Dense sequencing primer ${index}`, 720 + index * 14),
    )
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor([], 399, 1425),
      sites: [...background, ...denseShelf],
      sequenceLength,
      mapWidth: 1760,
      mapHeight: 1425,
      center: 880,
      centerX: 880,
      centerY: 712.5,
      labelCurveShape: 'arcs',
      ringGap: 24,
      balanceRing: true,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
      labelForSite: (entry) => entry.enzyme.name,
      labelWidthForSite: (_entry, label) => label.length * 7,
      labelPaddingForSite: () => 12,
      textHeightForSite: () => 16,
    }
    const result = layoutCircularEllipticCalloutsStrict(input)

    expect(result.overflowMode).toBe(true)
    expect(result.hasPlacementFailure).toBe(false)
    expect(result.routingQuality?.fitsViewport).toBe(false)
    for (let index = 0; index < result.callouts.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < result.callouts.length; otherIndex += 1) {
        const first = result.callouts[index].box
        const second = result.callouts[otherIndex].box
        const conflicts =
          first.left < second.right + 2 &&
          first.right + 2 > second.left &&
          first.top < second.bottom + 2 &&
          first.bottom + 2 > second.top
        expect(conflicts).toBe(false)
      }
    }
  })

  it('keeps unblocked labels on their polar rays', () => {
    // Sparse sites; exact 12h/6h tips are reserved (1-letter left/right inset), so avoid them.
    const starts = [200, 300, 900, 1600, 2600]
    const input = { ...inputFor(starts, 220), balanceRing: false, radialImplodeEnabled: false }
    const { a, b } = computeEllipticRadii(input)
    const { callouts, hasPlacementFailure } = layoutCircularEllipticCalloutsStrict(input)
    expect(hasPlacementFailure).toBe(false)
    expect(callouts).toHaveLength(5)

    const center = { x: 450, y: 450 }
    callouts.forEach((callout) => {
      const theta = (callout.site.start / input.sequenceLength) * Math.PI * 2 - Math.PI / 2
      const denom = Math.cos(theta) ** 2 / a ** 2 + Math.sin(theta) ** 2 / b ** 2
      const rho = 1 / Math.sqrt(denom)
      const ideal = { x: center.x + rho * Math.cos(theta), y: center.y + rho * Math.sin(theta) }
      expect(Math.abs(callout.connectorEnd.x - ideal.x)).toBeLessThan(1.5)
      expect(Math.abs(callout.connectorEnd.y - ideal.y)).toBeLessThan(1.5)

      const rx = Math.cos(theta)
      const ry = Math.sin(theta)
      const lx = callout.connectorEnd.x - callout.elbow.x
      const ly = callout.connectorEnd.y - callout.elbow.y
      const cross = Math.abs(rx * ly - ry * lx)
      expect(cross).toBeLessThan(2)
    })
  })

  it('ovoidK=0 matches the ellipse polar radius', () => {
    const a = 260
    const b = 340
    for (const deg of [-90, -45, 0, 30, 90, 135, 180]) {
      const theta = (deg * Math.PI) / 180
      const ellipse = 1 / Math.sqrt(Math.cos(theta) ** 2 / a ** 2 + Math.sin(theta) ** 2 / b ** 2)
      expect(curveRadiusAtPolarAngle(a, b, theta, 0)).toBeCloseTo(ellipse, 6)
    }
  })

  it('builds mirrored circular arcs through the equator and independently sized poles', () => {
    const a = 240
    const bTop = 360
    const bBottom = 280

    expect(curveRadiusAtPolarAngle(a, bTop, 0, 0, 'arcs', bBottom)).toBeCloseTo(a, 8)
    expect(curveRadiusAtPolarAngle(a, bTop, -Math.PI / 2, 0, 'arcs', bBottom)).toBeCloseTo(bTop, 8)
    expect(curveRadiusAtPolarAngle(a, bTop, Math.PI / 2, 0, 'arcs', bBottom)).toBeCloseTo(bBottom, 8)
    expect(curveRadiusAtPolarAngle(a, bTop, Math.PI, 0, 'arcs', bBottom)).toBeCloseTo(a, 8)

    for (const theta of [-1.4, -0.9, -0.35, 0.35, 0.9, 1.4, 2.1, 2.8]) {
      const poleRadius = Math.sin(theta) < 0 ? bTop : bBottom
      const circleCenter = (a * a - poleRadius * poleRadius) / (2 * a)
      const arcRadius = (a * a + poleRadius * poleRadius) / (2 * a)
      const rho = curveRadiusAtPolarAngle(a, bTop, theta, 0, 'arcs', bBottom)
      const x = rho * Math.cos(theta)
      const y = rho * Math.sin(theta)
      const sideCenter = Math.sign(x || 1) * circleCenter
      const residual = (x - sideCenter) ** 2 + y ** 2 - arcRadius ** 2
      expect(Math.abs(residual)).toBeLessThan(1e-6)
    }
  })

  it('supports viewport-optimized cubic arcs with the same equator and pole endpoints', () => {
    const a = 200
    const bTop = 460
    const bBottom = 440
    const curvature = 0.3

    expect(curveRadiusAtPolarAngle(a, bTop, 0, curvature, 'arcs', bBottom)).toBeCloseTo(a, 1)
    expect(curveRadiusAtPolarAngle(a, bTop, -Math.PI / 2, curvature, 'arcs', bBottom)).toBeCloseTo(bTop, 1)
    expect(curveRadiusAtPolarAngle(a, bTop, Math.PI / 2, curvature, 'arcs', bBottom)).toBeCloseTo(bBottom, 1)
    const circular = curveRadiusAtPolarAngle(a, bTop, -Math.PI / 4, 0, 'arcs', bBottom)
    const cubic = curveRadiusAtPolarAngle(a, bTop, -Math.PI / 4, curvature, 'arcs', bBottom)
    expect(Math.abs(cubic - circular)).toBeGreaterThan(1)
    expect(cubicArcMaintainsRadialClearance(a, bTop, curvature)).toBe(true)
    expect(cubicArcMaintainsRadialClearance(a, bBottom, curvature)).toBe(true)
  })

  it('rejects inward-bowed two-arc cubics and keeps ordinary quarters', () => {
    const compactA = 240
    const compactPole = 270
    const tallA = 200
    const tallPole = 460

    expect(cubicArcMaintainsRadialClearance(compactA, compactPole, 0.65)).toBe(false)
    expect(cubicArcMaintainsRadialClearance(compactA, compactA, 0.22)).toBe(false)
    expect(cubicArcMaintainsRadialClearance(tallA, tallPole, 0.22)).toBe(true)
    expect(cubicArcMaintainsRadialClearance(tallA, tallPole, 0.12)).toBe(true)

    const cap = maxCubicArcCurvatureForRadialClearance(tallA, tallPole)
    expect(cap).toBeGreaterThan(0.22)
    expect(cap).toBeLessThan(0.8)
    expect(cubicArcMaintainsRadialClearance(tallA, tallPole, cap)).toBe(true)
    expect(cubicArcMaintainsRadialClearance(tallA, tallPole, cap + 0.05)).toBe(false)

    const floor = Math.min(compactA, compactPole)
    for (let index = 1; index < 20; index += 1) {
      const point = cubicArcPoint(compactA, compactPole, 0.65, index / 20)
      if (index === 10) {
        expect(Math.hypot(point.x, point.y)).toBeLessThan(floor)
      }
    }
    for (let index = 0; index <= 20; index += 1) {
      const point = cubicArcPoint(tallA, tallPole, 0.22, index / 20)
      expect(Math.hypot(point.x, point.y)).toBeGreaterThanOrEqual(Math.min(tallA, tallPole) - 1e-6)
    }
  })

  it('does not realize concave Bézier curvature on compact two-arc poles', () => {
    const a = 240
    const bTop = 280
    const bBottom = 260
    const requested = 0.65
    for (const theta of [-1.2, -Math.PI / 4, 0.4, Math.PI / 4, 1.1]) {
      const cubic = curveRadiusAtPolarAngle(a, bTop, theta, requested, 'arcs', bBottom)
      const circular = curveRadiusAtPolarAngle(a, bTop, theta, 0, 'arcs', bBottom)
      expect(cubic).toBeCloseTo(circular, 8)
    }
  })

  it('rejects a near-endpoint radial dip that 20 uniform samples used to miss', () => {
    const a = 200
    const poleRadius = 20
    const curvature = 0.12
    const floor = Math.min(a, poleRadius)
    let coarseAccept = true
    for (let index = 1; index < 20; index += 1) {
      const point = cubicArcPoint(a, poleRadius, curvature, index / 20)
      if (point.x * point.x + point.y * point.y < floor * floor - 1e-3) coarseAccept = false
    }
    const nearPole = cubicArcPoint(a, poleRadius, curvature, 0.005)
    expect(coarseAccept).toBe(true)
    expect(Math.hypot(nearPole.x, nearPole.y)).toBeLessThan(floor)
    expect(cubicArcMaintainsRadialClearance(a, poleRadius, curvature)).toBe(false)
  })

  it('does not silently clamp out-of-range curvature when checking clearance', () => {
    const a = 200
    const tallPole = 600
    expect(cubicArcMaintainsRadialClearance(a, tallPole, 0.8)).toBe(true)
    expect(cubicArcMaintainsRadialClearance(a, tallPole, 1.2)).toBe(false)
    const dipped = cubicArcPoint(a, tallPole, 1.2, 0.45)
    expect(Math.hypot(dipped.x, dipped.y)).toBeLessThan(a)
    expect(cubicArcMaintainsRadialClearance(a, 20, -0.2)).toBe(true)
    expect(cubicArcMaintainsRadialClearance(a, 20, 0.12)).toBe(false)
  })

  it('does not let a cached cap from a nearby geometry become effective', () => {
    const loose = { a: 200.004, poleRadius: 460.004 }
    const tight = { a: 199.996, poleRadius: 459.996 }
    expect(`${loose.a.toFixed(2)}:${loose.poleRadius.toFixed(2)}`).toBe(
      `${tight.a.toFixed(2)}:${tight.poleRadius.toFixed(2)}`,
    )

    const looseCap = maxCubicArcCurvatureForRadialClearance(loose.a, loose.poleRadius)
    const tightCap = maxCubicArcCurvatureForRadialClearance(tight.a, tight.poleRadius)
    expect(tightCap === 0 || cubicArcMaintainsRadialClearance(tight.a, tight.poleRadius, tightCap)).toBe(true)

    const floor = Math.min(tight.a, tight.poleRadius)
    for (const theta of [-1.35, -1.1, -0.8, -Math.PI / 4, -0.2]) {
      const rho = curveRadiusAtPolarAngle(
        tight.a,
        tight.poleRadius,
        theta,
        Math.max(looseCap, 0.8),
        'arcs',
        tight.poleRadius,
      )
      expect(rho).toBeGreaterThanOrEqual(floor - 1e-6)
    }
    if (!cubicArcMaintainsRadialClearance(tight.a, tight.poleRadius, looseCap) && looseCap > 0) {
      expect(tightCap).toBeLessThan(looseCap)
    }

    const neighbors = [
      { a: 200, poleRadius: 460 },
      { a: 200.001, poleRadius: 459.999 },
      { a: 199.999, poleRadius: 460.001 },
      { a: 200.01, poleRadius: 460.01 },
    ]
    for (const geometry of neighbors) {
      maxCubicArcCurvatureForRadialClearance(geometry.a, geometry.poleRadius)
    }
    for (const geometry of neighbors) {
      const cap = maxCubicArcCurvatureForRadialClearance(geometry.a, geometry.poleRadius)
      expect(cap === 0 || cubicArcMaintainsRadialClearance(geometry.a, geometry.poleRadius, cap)).toBe(true)
      const neighborFloor = Math.min(geometry.a, geometry.poleRadius)
      const rho = curveRadiusAtPolarAngle(geometry.a, geometry.poleRadius, -0.7, 0.8, 'arcs', geometry.poleRadius)
      expect(rho).toBeGreaterThanOrEqual(neighborFloor - 1e-6)
    }
  })

  it('never accepts a cubic that dips below the endpoint radius on a ratio/curvature grid', () => {
    const ratios = [0.1, 0.2, 0.4, 0.7, 1, 1.2, 1.5, 2, 2.3, 3]
    const curvatures = [0, 0.02, 0.12, 0.22, 0.35, 0.5, 0.65, 0.8]
    for (const ratio of ratios) {
      const a = 200
      const poleRadius = a * ratio
      for (const curvature of curvatures) {
        if (!cubicArcMaintainsRadialClearance(a, poleRadius, curvature)) continue
        const floor = Math.min(a, poleRadius)
        for (let index = 0; index <= 400; index += 1) {
          const t = index / 400
          const point = cubicArcPoint(a, poleRadius, curvature, t)
          expect(Math.hypot(point.x, point.y)).toBeGreaterThanOrEqual(floor - 1e-6)
        }
      }
    }
  })

  it('reports tip angles from the curvature actually realized on each pole', () => {
    const compactInput = {
      ...inputFor([0], 200),
      labelCurveShape: 'arcs' as const,
      ringGap: 0,
      sideBudget: 0,
      arcHorizontalGapPx: 32,
      arcUpperVerticalGapPx: 40,
      arcLowerVerticalGapPx: 40,
    }
    const compactCircular = computeEllipticRadii(compactInput)
    const compactRequested = computeEllipticRadii({
      ...compactInput,
      arcLeftCurvature: 0.65,
      arcRightCurvature: 0.65,
    })
    expect(compactRequested.arcLeftCurvature).toBe(0.65)
    expect(compactRequested.actualUpperTipAngleDegrees).toBeCloseTo(
      compactCircular.actualUpperTipAngleDegrees!,
      5,
    )

    const tallInput = {
      ...inputFor([0], 180, 1400),
      labelCurveShape: 'arcs' as const,
      ringGap: 0,
      sideBudget: 0,
      arcHorizontalGapPx: 32,
      arcUpperVerticalGapPx: 420,
      arcLowerVerticalGapPx: 420,
    }
    const tallCircular = computeEllipticRadii(tallInput)
    const tallCubic = computeEllipticRadii({
      ...tallInput,
      arcLeftCurvature: 0.22,
      arcRightCurvature: 0.22,
    })
    expect(cubicArcMaintainsRadialClearance(tallCubic.a, tallCubic.bTop, 0.22)).toBe(true)
    expect(tallCubic.actualUpperTipAngleDegrees).not.toBeCloseTo(tallCircular.actualUpperTipAngleDegrees!, 1)
  })

  it('caps curvature by the more restrictive independent pole', () => {
    const a = 200
    const tallPole = 480
    const shortPole = 220
    expect(maxCubicArcCurvatureForRadialClearance(a, tallPole)).toBeGreaterThan(0.5)
    expect(maxCubicArcCurvatureForRadialClearance(a, shortPole)).toBe(0)
    expect(curveRadiusAtPolarAngle(a, tallPole, -Math.PI / 4, 0.5, 'arcs', shortPole)).not.toBeCloseTo(
      curveRadiusAtPolarAngle(a, tallPole, -Math.PI / 4, 0, 'arcs', shortPole),
      1,
    )
    expect(curveRadiusAtPolarAngle(a, tallPole, Math.PI / 4, 0.5, 'arcs', shortPole)).toBeCloseTo(
      curveRadiusAtPolarAngle(a, tallPole, Math.PI / 4, 0, 'arcs', shortPole),
      8,
    )
  })

  it('grows arc height for both the requested tip and the densest pole-side shelf', () => {
    const starts = Array.from({ length: 18 }, (_, index) => 2800 + index * 18)
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor(starts, 220),
      labelCurveShape: 'arcs',
      arcUpperTipAngleDegrees: 150,
      arcLowerTipAngleDegrees: 150,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
      textHeightForSite: () => 18,
    }
    const radii = computeEllipticRadii(input)

    expect(radii.shape).toBe('arcs')
    expect(radii.bTop).toBeGreaterThanOrEqual(radii.capacityTopB)
    expect(radii.actualUpperTipAngleDegrees).not.toBeNull()
    expect(radii.actualUpperTipAngleDegrees!).toBeLessThanOrEqual(150.0001)
    expect(radii.bTop).toBeGreaterThan(radii.a)
  })

  it('lets a dense upper half grow without pushing a sparse lower half away', () => {
    const upperDense = Array.from({ length: 18 }, (_, index) => 2800 + index * 18)
    const upperInput: EnzymeCalloutLayoutInput = {
      ...inputFor([...upperDense, 1200, 2100], 220),
      labelCurveShape: 'arcs',
      ringGap: 0,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
      textHeightForSite: () => 18,
    }
    const upperRadii = computeEllipticRadii(upperInput)

    expect(upperRadii.capacityTopB).toBeGreaterThan(upperRadii.capacityBottomB)
    expect(upperRadii.bTop).toBeGreaterThan(upperRadii.bBottom)
    expect(upperRadii.bBottom).toBe(236)
    expect(upperRadii.actualUpperTipAngleDegrees!).toBeLessThan(upperRadii.actualLowerTipAngleDegrees!)

    const lowerDense = Array.from({ length: 18 }, (_, index) => 1000 + index * 18)
    const lowerRadii = computeEllipticRadii({
      ...upperInput,
      sites: inputFor([...lowerDense, 100, 3300], 220).sites,
    })
    expect(lowerRadii.capacityBottomB).toBeGreaterThan(lowerRadii.capacityTopB)
    expect(lowerRadii.bBottom).toBeGreaterThan(lowerRadii.bTop)
    expect(lowerRadii.bTop).toBe(236)
    expect(lowerRadii.actualLowerTipAngleDegrees!).toBeLessThan(lowerRadii.actualUpperTipAngleDegrees!)
  })

  it('routes sparse labels on the two-arc curve without overlaps', () => {
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor([180, 760, 1320, 2100, 2780, 3340], 220),
      labelCurveShape: 'arcs',
      arcUpperTipAngleDegrees: 135,
      arcLowerTipAngleDegrees: 135,
      balanceRing: false,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
    }
    const { callouts, hasPlacementFailure } = layoutCircularEllipticCalloutsStrict(input)

    expect(hasPlacementFailure).toBe(false)
    expect(callouts).toHaveLength(input.sites.length)
    for (let i = 0; i < callouts.length; i += 1) {
      for (let j = i + 1; j < callouts.length; j += 1) {
        const first = callouts[i].box
        const second = callouts[j].box
        expect(first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top).toBe(false)
      }
    }
  })

  it('measures each label only once while comparing automatic arc candidates', () => {
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor([180, 760, 1320, 2100, 2780, 3340], 220),
      labelCurveShape: 'arcs',
      balanceRing: false,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
    }
    let measurements = 0
    input.labelWidthForSite = (_entry, label) => {
      measurements += 1
      return label.length * 6
    }

    layoutCircularEllipticCalloutsStrict(input)

    expect(measurements).toBe(input.sites.length)
  })

  it('keeps every arc connector on the curve when travel and implosion are disabled', () => {
    const starts = [20, 55, 110, 170, 3430, 3480, 3530, 3570, 1780, 1820]
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor(starts, 220),
      labelCurveShape: 'arcs',
      arcHorizontalGapPx: 64,
      arcUpperVerticalGapPx: 96,
      arcLowerVerticalGapPx: 72,
      arcUpperTipAngleDegrees: 145,
      arcLowerTipAngleDegrees: 155,
      balanceRing: false,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
      labelForSite: () => 'XXXXXXXX',
      labelWidthForSite: () => 60,
    }
    const radii = computeEllipticRadii(input)
    const { callouts } = layoutCircularEllipticCalloutsStrict(input)
    const center = { x: 450, y: 450 }

    expect(callouts).toHaveLength(starts.length)
    for (const callout of callouts) {
      const dx = callout.connectorEnd.x - center.x
      const dy = callout.connectorEnd.y - center.y
      const theta = Math.atan2(dy, dx)
      const expectedRho = curveRadiusAtPolarAngle(
        radii.a,
        radii.bTop,
        theta,
        radii.lambda,
        'arcs',
        radii.bBottom,
      )
      expect(Math.hypot(dx, dy)).toBeCloseTo(expectedRho, 5)
    }
  })

  it('supports independent left and right Bézier curvature', () => {
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor([300, 3300], 180, 1400),
      labelCurveShape: 'arcs',
      ringGap: 0,
      sideBudget: 0,
      arcHorizontalGapPx: 32,
      arcUpperVerticalGapPx: 420,
      arcLowerVerticalGapPx: 420,
      arcUpperTipAngleDegrees: 145,
      arcLowerTipAngleDegrees: 145,
      arcLeftCurvature: 0.12,
      arcRightCurvature: 0.65,
      balanceRing: false,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
    }
    const radii = computeEllipticRadii(input)
    const { callouts } = layoutCircularEllipticCalloutsStrict(input)
    const left = callouts.find((callout) => callout.textAnchor === 'end')!
    const right = callouts.find((callout) => callout.textAnchor === 'start')!
    const rho = (callout: EnzymeCallout) =>
      Math.hypot(callout.connectorEnd.x - 700, callout.connectorEnd.y - 700)

    expect(radii.a / radii.bTop).toBeLessThan(0.5)
    expect(cubicArcMaintainsRadialClearance(radii.a, radii.bTop, 0.12)).toBe(true)
    expect(cubicArcMaintainsRadialClearance(radii.a, radii.bTop, 0.65)).toBe(true)
    expect(radii.arcLeftCurvature).toBe(0.12)
    expect(radii.arcRightCurvature).toBe(0.65)
    expect(Math.abs(rho(left) - rho(right))).toBeGreaterThan(5)
  })

  it('keeps automatic compact two-arc routing outside an inward radial bow', () => {
    const logs: Array<{
      a: number
      bTop: number
      bBottom: number
      arcLeftCurvature: number
      arcRightCurvature: number
    }> = []
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor([180, 760, 1320, 2100, 2780, 3340], 220),
      labelCurveShape: 'arcs',
      balanceRing: false,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
      debugLog: (entry) => {
        logs.push({
          a: Number(entry.a),
          bTop: Number(entry.bTop),
          bBottom: Number(entry.bBottom),
          arcLeftCurvature: Number(entry.arcLeftCurvature),
          arcRightCurvature: Number(entry.arcRightCurvature),
        })
      },
    }
    layoutCircularEllipticCalloutsStrict(input)
    expect(logs.length).toBeGreaterThan(0)
    const { a, bTop, bBottom, arcLeftCurvature: left, arcRightCurvature: right } = logs[0]
    expect(left === 0 || cubicArcMaintainsRadialClearance(a, bTop, left)).toBe(true)
    expect(left === 0 || cubicArcMaintainsRadialClearance(a, bBottom, left)).toBe(true)
    expect(right === 0 || cubicArcMaintainsRadialClearance(a, bTop, right)).toBe(true)
    expect(right === 0 || cubicArcMaintainsRadialClearance(a, bBottom, right)).toBe(true)
    for (const theta of [-1.3, -0.9, -0.45, 0.45, 0.9, 1.3]) {
      const pole = Math.sin(theta) < 0 ? bTop : bBottom
      const rhoLeft = curveRadiusAtPolarAngle(a, bTop, theta, left, 'arcs', bBottom)
      const rhoRight = curveRadiusAtPolarAngle(a, bTop, theta, right, 'arcs', bBottom)
      expect(rhoLeft).toBeGreaterThanOrEqual(Math.min(a, pole) - 0.05)
      expect(rhoRight).toBeGreaterThanOrEqual(Math.min(a, pole) - 0.05)
    }
  })

  it('charges a visual penalty before moving a label across a pole', () => {
    const input: EnzymeCalloutLayoutInput = {
      ...inputFor([3550, 3500, 50], 220),
      labelCurveShape: 'arcs',
      balanceRing: false,
      raySlideEnabled: false,
      radialImplodeEnabled: false,
      textHeightForSite: (entry) => entry.start > 1800 ? 14 : 12,
    }
    const { callouts } = layoutCircularEllipticCalloutsStrict(input)
    const upperLeft = callouts.filter((callout) => callout.site.start > 1800)

    expect(upperLeft).toHaveLength(2)
    expect(upperLeft.every((callout) => callout.textAnchor === 'end')).toBe(true)
  })

  it('positive ovoidK fattens the 3 o\'clock side relative to 9 o\'clock', () => {
    const a = 260
    const b = 340
    const k = 0.4
    const lambda = k / a
    // Same |angle| off the horizontal: right side (θ) vs left side (π-θ).
    const theta = Math.PI / 6
    const rightRho = curveRadiusAtPolarAngle(a, b, theta, lambda)
    const leftRho = curveRadiusAtPolarAngle(a, b, Math.PI - theta, lambda)
    const rightY = Math.abs(rightRho * Math.sin(theta))
    const leftY = Math.abs(leftRho * Math.sin(Math.PI - theta))
    expect(rightY).toBeGreaterThan(leftY + 5)

    // And the point still satisfies the ovoid equation.
    const x = rightRho * Math.cos(theta)
    const y = rightRho * Math.sin(theta)
    const residual = (x * x) / (a * a) + (y * y) / (b * b * (1 + lambda * x) ** 2) - 1
    expect(Math.abs(residual)).toBeLessThan(1e-4)
  })

  it('layout with ovoidK still places sparse labels without overlaps', () => {
    const input = { ...inputFor([200, 900, 1600, 2700], 220), ovoidK: 0.35 }
    const { callouts, hasPlacementFailure } = layoutCircularEllipticCalloutsStrict(input)
    expect(hasPlacementFailure).toBe(false)
    expect(callouts).toHaveLength(4)
    for (let i = 0; i < callouts.length; i += 1) {
      for (let j = i + 1; j < callouts.length; j += 1) {
        const a = callouts[i].box
        const b = callouts[j].box
        const overlap = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
        expect(overlap).toBe(false)
      }
    }
  })

  it('keeps polar-most left/right connectors at least one letter apart on X', () => {
    const letter = 6
    const starts = [50, 100, 1700, 1750, 1780, 1820, 1850, 1900, 3500, 3550]
    const input = inputFor(starts, 240)
    const { callouts } = layoutCircularEllipticCalloutsStrict(input)
    const centerX = 450

    for (const atTwelve of [true, false]) {
      const ranked = callouts
        .map((callout) => ({
          callout,
          score: atTwelve ? callout.connectorEnd.y : -callout.connectorEnd.y,
        }))
        .toSorted((left, right) => left.score - right.score)
      const left = ranked.find((entry) => entry.callout.connectorEnd.x < centerX - 0.5)?.callout
      const right = ranked.find((entry) => entry.callout.connectorEnd.x > centerX + 0.5)?.callout
      expect(left).toBeTruthy()
      expect(right).toBeTruthy()
      expect(Math.abs(left!.connectorEnd.x - right!.connectorEnd.x)).toBeGreaterThanOrEqual(letter)
      // Neither polar-most connector may sit on the axis.
      expect(Math.abs(left!.connectorEnd.x - centerX)).toBeGreaterThanOrEqual(letter / 2)
      expect(Math.abs(right!.connectorEnd.x - centerX)).toBeGreaterThanOrEqual(letter / 2)
    }
  })

  it('slides packed polar labels horizontally toward their rays without growing the oval', () => {
    const starts = [...Array.from({ length: 8 }, (_, i) => 30 + i * 40)]
    const input = inputFor(starts, 200)
    const { a, b } = computeEllipticRadii({ ...input, balanceRing: false })
    // Must not resurrect the multi-screen oval growth.
    expect(b).toBeLessThan(a * 2.5)
    const { callouts } = layoutCircularEllipticCalloutsStrict({ ...input, balanceRing: false })
    const center = { x: 450, y: 450 }
    callouts.forEach((callout) => {
      const theta = (callout.site.start / input.sequenceLength) * Math.PI * 2 - Math.PI / 2
      const rayX =
        Math.abs(Math.sin(theta)) < 1e-4
          ? center.x
          : center.x + ((callout.connectorEnd.y - center.y) / Math.sin(theta)) * Math.cos(theta)
      // Horizontal slide should pull connectors closer to the ray than a pure oval pack at
      // large angular drift would (allow a few px for tip clearance / collisions).
      expect(Math.abs(callout.connectorEnd.x - rayX)).toBeLessThan(40)
      const elbow = callout.elbow
      const cross = Math.abs(
        Math.cos(theta) * (callout.connectorEnd.y - elbow.y) - Math.sin(theta) * (callout.connectorEnd.x - elbow.x),
      )
      expect(cross).toBeLessThan(35)
    })
  })

  it('keeps horizontal stop-gap to the more polar neighbor when ray-sliding', () => {
    const starts = [...Array.from({ length: 8 }, (_, i) => 30 + i * 40)]
    const clearance = 5
    const input = {
      ...inputFor(starts, 200),
      raySlideClearancePx: clearance,
      labelForSite: () => 'XXXXXXXX',
      textHeightForSite: () => 12,
      labelWidthForSite: () => 60,
    }
    const { callouts } = layoutCircularEllipticCalloutsStrict(input)
    const centerY = 450
    const upperRight = callouts
      .filter((c) => c.connectorEnd.x >= 450 && c.connectorEnd.y <= centerY)
      .toSorted((a, b) => a.connectorEnd.y - b.connectorEnd.y)
    expect(upperRight.length).toBeGreaterThan(2)
    for (let i = 1; i < upperRight.length; i += 1) {
      // Polar-closer is above; moved label must stay at least `clearance` px to the outside on X.
      expect(upperRight[i].connectorEnd.x - upperRight[i - 1].connectorEnd.x).toBeGreaterThanOrEqual(clearance - 0.05)
    }
  })

  it('skips horizontal ray travel when raySlideEnabled is false', () => {
    const starts = [...Array.from({ length: 8 }, (_, i) => 30 + i * 40)]
    const base = {
      ...inputFor(starts, 200),
      raySlideClearancePx: 4,
      labelForSite: () => 'XXXXXXXX',
      textHeightForSite: () => 12,
      labelWidthForSite: () => 60,
    }
    const withSlide = layoutCircularEllipticCalloutsStrict(base).callouts
    const withoutSlide = layoutCircularEllipticCalloutsStrict({ ...base, raySlideEnabled: false }).callouts
    const moved = withSlide.some((callout, index) => {
      const other = withoutSlide[index]
      return Math.hypot(callout.connectorEnd.x - other.connectorEnd.x, callout.connectorEnd.y - other.connectorEnd.y) > 0.5
    })
    expect(moved).toBe(true)
  })

  it('keeps the layout center when balanceRing is false', () => {
    const starts = [...Array.from({ length: 10 }, (_, i) => 40 + i * 30), 2700]
    const input = {
      ...inputFor(starts, 220),
      raySlideClearancePx: 4,
      ringGap: 56,
      balanceRing: false,
      labelForSite: () => 'XXXXXXXX',
      textHeightForSite: () => 12,
      labelWidthForSite: () => 60,
    }
    const { ringCenter } = layoutCircularEllipticCalloutsStrict(input)
    expect(ringCenter?.x).toBe(450)
    expect(ringCenter?.y).toBe(450)
  })

  it('implodes labels radially toward the ring when enabled', () => {
    // Sparse left/right sites so packing leaves room to move inward from the oval.
    const starts = [200, 1600]
    const base = {
      ...inputFor(starts, 200),
      balanceRing: false,
      raySlideEnabled: true,
      radialImplodeClearancePx: 4,
      radialImplodeMinRingDistancePx: 24,
      ringGap: 56,
      labelForSite: () => 'XXXXXXXX',
      textHeightForSite: () => 12,
      labelWidthForSite: () => 60,
    }
    const center = { x: 450, y: 450 }
    const without = layoutCircularEllipticCalloutsStrict({ ...base, radialImplodeEnabled: false }).callouts
    const withImp = layoutCircularEllipticCalloutsStrict({ ...base, radialImplodeEnabled: true }).callouts
    const rho = (c: { connectorEnd: { x: number; y: number } }) =>
      Math.hypot(c.connectorEnd.x - center.x, c.connectorEnd.y - center.y)
    const movedIn = withImp.some((callout, index) => rho(callout) < rho(without[index]) - 2)
    expect(movedIn).toBe(true)
    for (const callout of withImp) {
      expect(rho(callout)).toBeGreaterThanOrEqual(200)
    }
  })

  it('implodes polarmost labels along their site rays', () => {
    // Dense upper-right stack including near-12h; polar labels must still move inward.
    const starts = Array.from({ length: 8 }, (_, i) => 40 + i * 80)
    const base = {
      ...inputFor(starts, 200),
      balanceRing: false,
      raySlideEnabled: true,
      radialImplodeClearancePx: 2,
      radialImplodeMinRingDistancePx: 20,
      ringGap: 40,
      labelForSite: () => 'XXXX',
      textHeightForSite: () => 12,
      labelWidthForSite: () => 28,
    }
    const center = { x: 450, y: 450 }
    const without = layoutCircularEllipticCalloutsStrict({ ...base, radialImplodeEnabled: false }).callouts
    const withImp = layoutCircularEllipticCalloutsStrict({ ...base, radialImplodeEnabled: true }).callouts
    const polarmost = without
      .map((callout, index) => ({ callout, index, y: callout.connectorEnd.y }))
      .toSorted((a, b) => a.y - b.y)[0]
    const before = Math.hypot(polarmost.callout.connectorEnd.x - center.x, polarmost.callout.connectorEnd.y - center.y)
    const afterCallout = withImp[polarmost.index]
    const after = Math.hypot(afterCallout.connectorEnd.x - center.x, afterCallout.connectorEnd.y - center.y)
    expect(after).toBeLessThan(before - 2)
  })

  it('respects the implosion min-distance threshold to the ring', () => {
    const starts = [200, 1600]
    const tight = layoutCircularEllipticCalloutsStrict({
      ...inputFor(starts, 200),
      balanceRing: false,
      radialImplodeEnabled: true,
      radialImplodeMinRingDistancePx: 8,
      labelForSite: () => 'XXXXXXXX',
      textHeightForSite: () => 12,
      labelWidthForSite: () => 60,
    }).callouts
    const loose = layoutCircularEllipticCalloutsStrict({
      ...inputFor(starts, 200),
      balanceRing: false,
      radialImplodeEnabled: true,
      radialImplodeMinRingDistancePx: 80,
      labelForSite: () => 'XXXXXXXX',
      textHeightForSite: () => 12,
      labelWidthForSite: () => 60,
    }).callouts
    const center = { x: 450, y: 450 }
    const minDist = (callouts: typeof tight) =>
      Math.min(...callouts.map((c) => Math.hypot(c.connectorEnd.x - center.x, c.connectorEnd.y - center.y) - 200))
    expect(minDist(loose)).toBeGreaterThan(minDist(tight) + 10)
  })

  it('skips radial implosion when radialImplodeEnabled is false', () => {
    const starts = [...Array.from({ length: 6 }, (_, i) => 40 + i * 50)]
    const input = {
      ...inputFor(starts, 200),
      balanceRing: false,
      radialImplodeEnabled: false,
      labelForSite: () => 'XXXXXXXX',
      textHeightForSite: () => 12,
      labelWidthForSite: () => 60,
    }
    const a = layoutCircularEllipticCalloutsStrict(input).callouts
    const b = layoutCircularEllipticCalloutsStrict({ ...input, radialImplodeClearancePx: 16 }).callouts
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i].connectorEnd.x).toBeCloseTo(b[i].connectorEnd.x, 5)
      expect(a[i].connectorEnd.y).toBeCloseTo(b[i].connectorEnd.y, 5)
    }
  })

  it('nudges the ring center toward the emptiest pocket among labels', () => {
    const starts = [...Array.from({ length: 10 }, (_, i) => 40 + i * 30), 2700]
    const input = {
      ...inputFor(starts, 220),
      raySlideClearancePx: 4,
      ringGap: 56,
      labelForSite: () => 'XXXXXXXX',
      textHeightForSite: () => 12,
      labelWidthForSite: () => 60,
    }
    const { callouts, ringCenter } = layoutCircularEllipticCalloutsStrict(input)
    expect(ringCenter).toBeTruthy()
    expect(callouts.length).toBe(starts.length)
    const center = ringCenter ?? { x: 450, y: 450 }
    for (const callout of callouts) {
      expect(leaderCrossesRing(callout.elbow, callout.connectorEnd, center, 220)).toBe(false)
    }
    expect(Math.hypot(center.x - 450, center.y - 450)).toBeGreaterThan(2)
  })

  it('reroutes away from an imbalanced label sector only when the finished geometry improves', () => {
    const starts = Array.from({ length: 12 }, (_, index) => index * 18)
    const input = {
      ...inputFor(starts, 220),
      labelForSite: () => 'XXXXXXXX',
      textHeightForSite: () => 12,
      labelWidthForSite: () => 60,
    }
    const fixed = layoutCircularEllipticCalloutsStrict({ ...input, balanceRing: false })
    const first = layoutCircularEllipticCalloutsStrict(input)
    const second = layoutCircularEllipticCalloutsStrict(input)

    expect(first.hasPlacementFailure).toBe(false)
    expect(first.callouts).toHaveLength(starts.length)
    expect(first.ringCenter).toBeTruthy()
    expect(Math.hypot(first.ringCenter!.x - 450, first.ringCenter!.y - 450)).toBeGreaterThan(2)
    expect(circularRoutingQualityIsBetter(first.routingQuality!, fixed.routingQuality!)).toBe(true)
    expect(second.ringCenter).toEqual(first.ringCenter)
    for (const callout of first.callouts) {
      expect(callout.box.left).toBeGreaterThanOrEqual(4)
      expect(callout.box.right).toBeLessThanOrEqual(896)
      expect(leaderCrossesRing(callout.elbow, callout.connectorEnd, first.ringCenter!, 220)).toBe(false)
    }
  })

  it('relaxes off-ray labels toward shorter radial leaders when space allows', () => {
    // Sparse enough that packing should leave ideals (or relaxation restore them).
    const starts = [400, 800, 2000, 2800]
    const input = { ...inputFor(starts, 220), balanceRing: false, radialImplodeEnabled: false }
    const { a, b } = computeEllipticRadii(input)
    const { callouts } = layoutCircularEllipticCalloutsStrict(input)
    callouts.forEach((callout) => {
      const theta = (callout.site.start / input.sequenceLength) * Math.PI * 2 - Math.PI / 2
      const rho = curveRadiusAtPolarAngle(a, b, theta, 0)
      const ideal = { x: 450 + rho * Math.cos(theta), y: 450 + rho * Math.sin(theta) }
      expect(Math.abs(callout.connectorEnd.x - ideal.x)).toBeLessThan(2)
      expect(Math.abs(callout.connectorEnd.y - ideal.y)).toBeLessThan(2)
    })
  })
})
