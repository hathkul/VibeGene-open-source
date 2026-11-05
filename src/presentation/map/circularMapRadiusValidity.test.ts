import { describe, expect, it, vi } from 'vitest'
import type { EnzymeCallout, EnzymeCalloutLayoutInput } from '../../domain/mapLayout'
import type { RestrictionSite } from '../../domain/types'
import { createCircularMapLayoutHelpers, type CircularMapLayoutHelperScope } from './circularMapLayoutHelpers'

vi.mock('../../domain/circularLaneRouter', () => ({
  layoutCircularLaneCalloutsStrict: (input: EnzymeCalloutLayoutInput) => ({
    callouts: input.sites.map((site, index) => {
      const overflow = site.enzyme.name === 'overflow'
      const anchor = { x: 140, y: 100 }
      const elbow = { x: 145, y: 100 }
      const connectorEnd = { x: overflow ? 450 : 210, y: 100 }
      return {
        site, index, label: site.enzyme.name, anchor, elbow, connectorEnd,
        x: connectorEnd.x, y: 100, textAnchor: 'start',
        box: { left: connectorEnd.x, right: connectorEnd.x + 40, top: 93, bottom: 107 },
        segments: [[anchor, elbow], [elbow, connectorEnd]],
      } as EnzymeCallout
    }),
    hasPlacementFailure: input.sites.some((site) => site.enzyme.name === 'placement-failure'),
    overflowMode: true,
    ringCenter: { x: 100, y: 100 },
    routingQuality: {
      fitsViewport: true,
      viewportOverflowPx: 0,
      canvasGrowthHorizontalPx: 3,
      canvasGrowthVerticalPx: 5,
      minBendAngle: 180,
      meanBendAngle: 180,
      belowTargetBendCount: 0,
      belowTargetBendSeverity: 0,
      maxLeaderLength: 305,
      meanLeaderLength: 305,
    },
  }),
  summarizeCircularLayout: vi.fn(),
}))

function helpers(
  names: string[],
  renderedCalloutAnchor?: CircularMapLayoutHelperScope['renderedCalloutAnchor'],
  includeViolationDetails = false,
) {
  const sites = names.map((name, index) => ({
    enzyme: { name }, start: index, end: index, cutTop: index, cutBottom: index,
    match: '__enzyme_callout__',
  }) as RestrictionSite)
  return createCircularMapLayoutHelpers({
    record: { sequence: 'A'.repeat(1000), topology: 'circular' },
    centerX: 200, centerY: 200,
    responsiveMapPolicy: {}, displaySettings: { labelRouting: {} },
    enzymeCalloutSites: sites, primerCalloutSites: [], prioritizedOuterFeatureBudget: 0,
    circularRouterAlgorithm: 'lane', layoutMapSize: 400, layoutMapWidth: 400, layoutMapHeight: 400,
    outsideLabelFontSizePx: 12, circularCalloutPadding: () => 0, circularCalloutTextWidth: () => 40,
    renderedCalloutAnchor,
    includeViolationDetails,
  } as unknown as CircularMapLayoutHelperScope)
}

describe('radius candidate validity', () => {
  it('marks non-bounds collisions invalid even if the router reports no placement failure', () => {
    const routed = helpers(['one', 'two']).routableCombinedCallouts([], 40)
    expect(routed.callouts).toHaveLength(2)
    expect(routed.strictInvalid).toBe(true)
    expect(routed.violations).not.toHaveLength(0)
  })

  it('allows bounds-only overflow while validating against the returned ring center', () => {
    const routed = helpers(['overflow']).routableCombinedCallouts([], 40)
    expect(routed.callouts).toHaveLength(1)
    expect(routed.strictInvalid).toBe(false)
    expect(routed.ringCenterX).toBe(100)
    expect(routed.ringCenterY).toBe(100)
    expect(routed.violations).toContain('callout 0 has an out-of-bounds leader point')
  })

  it('reports bounds details without classifying them as non-bounds geometry violations', () => {
    const routed = helpers(['overflow'], undefined, true).routableCombinedCallouts([], 40)
    const nonBoundsOnly = helpers(['overflow'], undefined, true).routableCombinedCallouts([], 40, {
      nonBoundsOnly: true,
    })

    expect(routed.violations).toContain('callout 0 has an out-of-bounds leader point')
    expect(routed.violations).toContain('callout 0 is out of bounds')
    expect(routed.placementFailure).toBe(false)
    expect(routed.nonBoundsGeometryViolation).toBe(false)
    expect(routed.strictInvalid).toBe(false)
    expect(nonBoundsOnly.violations).toEqual([])
    expect(nonBoundsOnly.nonBoundsGeometryViolation).toBe(false)
  })

  it('keeps router placement failure explicit and separate from geometric violations', () => {
    const routed = helpers(['placement-failure'], undefined, true).routableCombinedCallouts([], 40, {
      nonBoundsOnly: true,
    })

    expect(routed.placementFailure).toBe(true)
    expect(routed.nonBoundsGeometryViolation).toBe(false)
    expect(routed.strictInvalid).toBe(true)
    expect(routed.violations).toEqual(['router reported placement failure'])
  })

  it('validates the rendered anchor while keeping the router callout as output', () => {
    const renderedAnchor = vi.fn((_callout: EnzymeCallout, center: { x: number; y: number }, radius: number) => {
      expect(center).toEqual({ x: 100, y: 100 })
      expect(radius).toBe(40)
      // Move the rendered anchor across the elbow, creating a forbidden acute bend.
      return { x: 150, y: 100 }
    })
    const routed = helpers(['one'], renderedAnchor, true).routableCombinedCallouts([], 40)

    expect(renderedAnchor).toHaveBeenCalledOnce()
    expect(routed.strictInvalid).toBe(true)
    expect(routed.violations).not.toHaveLength(0)
    expect(routed.violations).toContain('callout 0 has an acute bend')
    expect(routed.nonBoundsGeometryViolation).toBe(true)
    expect(routed.placementFailure).toBe(false)
    expect(routed.callouts[0].anchor).toEqual({ x: 140, y: 100 })
    expect(routed.callouts[0].segments[0]).toEqual([{ x: 140, y: 100 }, { x: 145, y: 100 }])
  })

  it('recomputes bend quality from a changed rendered anchor and preserves extent metrics', () => {
    const routed = helpers(['one'], () => ({ x: 140, y: 105 }))
      .routableCombinedCallouts([], 40)

    expect(routed.strictInvalid).toBe(false)
    expect(routed.routingQuality?.minBendAngle).toBeCloseTo(135)
    expect(routed.routingQuality?.meanBendAngle).toBeCloseTo(135)
    expect(routed.routingQuality?.belowTargetBendCount).toBe(0)
    expect(routed.routingQuality?.belowTargetBendSeverity).toBe(0)
    expect(routed.routingQuality?.canvasGrowthHorizontalPx).toBe(3)
    expect(routed.routingQuality?.canvasGrowthVerticalPx).toBe(5)
    expect(routed.routingQuality?.maxLeaderLength).toBe(305)
    expect(routed.routingQuality?.meanLeaderLength).toBe(305)
  })
})
