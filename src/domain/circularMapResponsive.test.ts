import { describe, expect, it } from 'vitest'
import {
  circularFeatureLevelLimit,
  circularMapTitleFitsInsideRing,
  fitCircularContentViewport,
  resolveCircularMapResponsivePolicy,
  stableCircularScrollportHeight,
} from './circularMapResponsive'

describe('stable circular scrollport height', () => {
  it('uses the same height whether a horizontal scrollbar is present or not', () => {
    const common = { offsetWidth: 852, clientWidth: 837, offsetHeight: 670, horizontalBorders: 0, verticalBorders: 0 }
    expect(stableCircularScrollportHeight({ ...common, clientHeight: 655 })).toBe(655)
    expect(stableCircularScrollportHeight({ ...common, clientHeight: 670 })).toBe(655)
  })

  it('does not invent a gutter with overlay scrollbars and accounts for borders', () => {
    expect(stableCircularScrollportHeight({ offsetWidth: 802, clientWidth: 800, offsetHeight: 602,
      clientHeight: 600, horizontalBorders: 2, verticalBorders: 2 })).toBe(600)
  })
})

function ellipticPolicy(
  overrides: Partial<Parameters<typeof resolveCircularMapResponsivePolicy>[0]> = {},
) {
  return resolveCircularMapResponsivePolicy({
    viewportWidth: 1200,
    viewportHeight: 800,
    mapSize: 800,
    algorithm: 'elliptic',
    maxLabelWidth: 140,
    ringGap: 0,
    configuredSideBudget: undefined,
    minMapRadiusRatio: 0.3,
    softRingFloorDiameterRatio: 0.7,
    softRingFloorEnabled: true,
    ...overrides,
  })
}

describe('resolveCircularMapResponsivePolicy', () => {
  it('keeps a medium landscape viewport height-limited when width already fits labels', () => {
    const policy = ellipticPolicy()

    expect(policy.sideBudgetRelieved).toBe(false)
    expect(policy.sideBudgetOverride).toBe(140)
    expect(policy.maxRadius).toBe(Math.floor(800 * 0.46))
    expect(policy.softFloorRadius).toBe(280)
    expect(policy.maxRadius).toBeGreaterThan(policy.softFloorRadius!)
  })

  it('lets the configured soft floor lower the preferred ring diameter', () => {
    const policy = ellipticPolicy({
      maxLabelWidth: 240,
      softRingFloorDiameterRatio: 0.5,
    })

    expect(policy.desiredSoftFloor).toBe(200)
    expect(policy.softFloorRadius).toBe(200)
    expect(policy.maxRadius).toBe(360)
  })

  it('lets a user cap the ring below the automatic size and soft floor', () => {
    const automatic = ellipticPolicy()
    const reduced = ellipticPolicy({ autoRingScaleRatio: 0.65 })

    expect(reduced.maxRadius).toBe(Math.floor(automatic.maxRadius * 0.65))
    expect(reduced.softFloorRadius).toBe(reduced.maxRadius)
    expect(reduced.maxRadius).toBeLessThan(automatic.softFloorRadius!)
  })

  it('does not unlock extra feature tracks when soft floor grows the ring', () => {
    const withFloor = ellipticPolicy({
      viewportWidth: 900,
      viewportHeight: 600,
      mapSize: 600,
      maxLabelWidth: 160,
    })
    const withoutFloor = ellipticPolicy({
      viewportWidth: 900,
      viewportHeight: 600,
      mapSize: 600,
      maxLabelWidth: 160,
      softRingFloorEnabled: false,
    })

    expect(withFloor.sideBudgetRelieved).toBe(false)
    expect(withFloor.maxRadius).toBe(withoutFloor.maxRadius)
    expect(withFloor.softFloorRadius).not.toBeNull()
    expect(withFloor.featureLevelLimit).toBe(withoutFloor.featureLevelLimit)
  })

  it('preserves configured side budget when no relief is required', () => {
    const policy = ellipticPolicy({
      viewportWidth: 1800,
      viewportHeight: 1200,
      mapSize: 1200,
      maxLabelWidth: 64,
      configuredSideBudget: 80,
    })

    expect(policy.sideBudgetRelieved).toBe(false)
    expect(policy.sideBudgetOverride).toBe(80)
  })

  it('arms the soft floor even when the normal budget already clears it', () => {
    // Wide/tall pane with narrow labels: no relief is needed, but the search still must not be
    // free to collapse the ring toward hardMinRadius.
    const policy = ellipticPolicy({
      viewportWidth: 2560,
      viewportHeight: 1440,
      mapSize: 1440,
      maxLabelWidth: 64,
      ringGap: 56,
    })

    expect(policy.sideBudgetRelieved).toBe(false)
    expect(policy.softFloorRadius).toBe(policy.desiredSoftFloor)
    expect(policy.softFloorRadius).toBeLessThanOrEqual(policy.maxRadius)
    expect(policy.softFloorRadius).toBeGreaterThan(policy.hardMinRadius)
  })

  it('shares the measured auto side budget with bounds and router', () => {
    const policy = ellipticPolicy({
      softRingFloorEnabled: false,
      maxLabelWidth: 137.6,
    })

    expect(policy.sideBudgetOverride).toBe(138)
    expect(policy.sideBudgetRelieved).toBe(false)
  })

  it('disarms the floor when the soft ring floor is turned off', () => {
    const policy = ellipticPolicy({ softRingFloorEnabled: false })

    expect(policy.softFloorRadius).toBeNull()
  })

  it('does not apply elliptic soft-floor relief to other routers', () => {
    const policy = ellipticPolicy({ algorithm: 'classic' })

    expect(policy.sideBudgetRelieved).toBe(false)
    expect(policy.softFloorRadius).toBeNull()
  })
})

describe('circular feature rows and title placement', () => {
  it('uses the tighter viewport/radius row limit', () => {
    // Dialog-sized panes (~500px) still get enough rings to avoid stacking
    // every overlapping feature on the outer track.
    expect(circularFeatureLevelLimit(500, 300)).toBe(2)
    expect(circularFeatureLevelLimit(900, 160)).toBe(2)
    expect(circularFeatureLevelLimit(900, 280)).toBe(4)
    expect(circularFeatureLevelLimit(300, 100)).toBe(1)
  })

  it('moves the title out when the clear disk is too small', () => {
    expect(
      circularMapTitleFitsInsideRing({
        innerContentRadius: 40,
        titleWidth: 200,
      }),
    ).toBe(false)
  })

  it('keeps the title centered while the ring is unchanged (independent of viewport height)', () => {
    // Same ring / feature rows => same innerContentRadius => same decision regardless of window height.
    const decision = () =>
      circularMapTitleFitsInsideRing({ innerContentRadius: 180, titleWidth: 300 })
    expect(decision()).toBe(true)
    expect(decision()).toBe(true)
  })

  it('uses the clear diameter for title fit', () => {
    expect(
      circularMapTitleFitsInsideRing({
        innerContentRadius: 176,
        titleWidth: 300,
      }),
    ).toBe(true)
    expect(
      circularMapTitleFitsInsideRing({
        innerContentRadius: 176,
        titleWidth: 340,
      }),
    ).toBe(false)
  })
})

describe('fitCircularContentViewport', () => {
  it('shifts just enough to include compact content beyond a polar edge', () => {
    expect(
      fitCircularContentViewport({
        contentLeft: 80,
        contentTop: -35,
        contentWidth: 640,
        contentHeight: 700,
        layoutWidth: 800,
        layoutHeight: 800,
      }),
    ).toEqual({
      left: 0,
      top: -35,
      width: 800,
      height: 800,
      pixelWidth: 800,
      pixelHeight: 800,
    })
  })

  it('expands the SVG when content is larger so the scroll host gets overflow', () => {
    expect(
      fitCircularContentViewport({
        contentLeft: -40,
        contentTop: -120,
        contentWidth: 920,
        contentHeight: 1040,
        layoutWidth: 800,
        layoutHeight: 800,
      }),
    ).toEqual({
      left: -40,
      top: -120,
      width: 920,
      height: 1040,
      pixelWidth: 920,
      pixelHeight: 1040,
    })
  })
})
