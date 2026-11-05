import { describe, expect, it } from 'vitest'
import { buildFeatureGapConnectors, shouldSkipFeatureGapConnector } from '../src/domain/featureMapGaps'
import { layoutCircularEllipticCalloutsStrict } from '../src/domain/circularEllipticRouter'
import { circularMapAngle } from '../src/domain/circularMapGeometry'
import type { EnzymeCalloutLayoutInput } from '../src/domain/mapLayout'
import type { RestrictionSite } from '../src/domain/types'

describe('featureMapGaps', () => {
  it('skips connectors between origin wrap-split halves', () => {
    expect(
      shouldSkipFeatureGapConnector(
        { start: 0, end: 50, originWrapSplit: true },
        { start: 900, end: 1000, originWrapSplit: true },
        1000,
      ),
    ).toBe(true)

    expect(
      shouldSkipFeatureGapConnector({ start: 0, end: 50 }, { start: 900, end: 1000 }, 1000),
    ).toBe(true)

    expect(
      shouldSkipFeatureGapConnector({ start: 100, end: 200 }, { start: 300, end: 400 }, 1000),
    ).toBe(false)
  })

  it('does not emit a mid-sequence gap for linearized wrap features', () => {
    const connectors = buildFeatureGapConnectors(
      [
        {
          featureId: 'wrap',
          start: 0,
          end: 40,
          level: 0,
          strand: 'forward',
          locationCount: 2,
          originWrapSplit: true,
        },
        {
          featureId: 'wrap',
          start: 960,
          end: 1000,
          level: 0,
          strand: 'forward',
          locationCount: 2,
          originWrapSplit: true,
        },
      ],
      1000,
    )
    expect(connectors).toEqual([])
  })

  it('still connects ordinary multi-location feature gaps', () => {
    const connectors = buildFeatureGapConnectors(
      [
        {
          featureId: 'joined',
          start: 100,
          end: 200,
          level: 0,
          strand: 'forward',
          locationCount: 2,
        },
        {
          featureId: 'joined',
          start: 300,
          end: 400,
          level: 0,
          strand: 'forward',
          locationCount: 2,
        },
      ],
      1000,
    )
    expect(connectors).toEqual([{ featureId: 'joined', start: 200, end: 300, level: 0, strand: 'forward' }])
  })

  it('connects reverse-strand locations in ascending coordinate order', () => {
    const connectors = buildFeatureGapConnectors([
      { featureId: 'reverse', start: 100, end: 200, level: 0, strand: 'reverse', locationCount: 2 },
      { featureId: 'reverse', start: 300, end: 400, level: 0, strand: 'reverse', locationCount: 2 },
    ], 1000)
    expect(connectors).toEqual([{ featureId: 'reverse', start: 200, end: 300, level: 0, strand: 'reverse' }])
  })
})

describe('topology remaps callout anchors', () => {
  function site(start: number): RestrictionSite {
    return {
      enzyme: {
        name: 'EcoRI',
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

  function input(topology: 'circular' | 'linear'): EnzymeCalloutLayoutInput {
    const mapSize = 900
    const center = mapSize / 2
    return {
      sites: [site(0), site(10), site(3590)],
      sequenceLength: 3600,
      topology,
      mapSize,
      mapWidth: mapSize,
      mapHeight: mapSize,
      center,
      centerX: center,
      centerY: center,
      radius: 220,
      outerFeatureOffset: 18,
      balanceRing: false,
      radialImplodeEnabled: false,
      raySlideEnabled: false,
    }
  }

  it('moves labels near start/end when switching circular → linear horseshoe', () => {
    const circular = layoutCircularEllipticCalloutsStrict(input('circular')).callouts
    const linear = layoutCircularEllipticCalloutsStrict(input('linear')).callouts
    expect(circular).toHaveLength(3)
    expect(linear).toHaveLength(3)

    for (const callout of circular) {
      const linearCallout = linear.find((item) => item.site.start === callout.site.start)
      expect(linearCallout).toBeTruthy()
      // Anchors must rematerialize on the horseshoe angle, not reuse full-circle rays.
      expect(linearCallout!.anchor.x).not.toBeCloseTo(callout.anchor.x, 5)
      const expected = circularMapAngle(callout.site.start, 3600, 'linear')
      const actual = Math.atan2(linearCallout!.anchor.y - 450, linearCallout!.anchor.x - 450)
      const delta = Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected))
      expect(Math.abs(delta)).toBeLessThan(0.05)
    }
  })
})
