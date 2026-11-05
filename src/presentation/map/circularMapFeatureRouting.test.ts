import { describe, expect, it, vi } from 'vitest'
import type { EnzymeCallout, EnzymeCalloutLayoutInput } from '../../domain/mapLayout'
import type { RestrictionSite } from '../../domain/types'
import { createCircularMapLayoutHelpers, splitCircularFeatureCallouts, type CircularMapLayoutHelperScope } from './circularMapLayoutHelpers'
import type { FeatureRenderInfo } from './featureRendering'

vi.mock('../../domain/circularLaneRouter', () => ({
  layoutCircularLaneCalloutsStrict: (input: EnzymeCalloutLayoutInput) => {
    const makeCallout = (site: RestrictionSite, index: number): EnzymeCallout => {
      const anchor = { x: 0, y: 0 }
      const elbow = { x: 0, y: 1 }
      const connectorEnd = { x: 1, y: 1 }
      return {
        site,
        index,
        anchor,
        elbow,
        connectorEnd,
        x: connectorEnd.x,
        y: connectorEnd.y,
        label: site.enzyme.name,
        textAnchor: 'start',
        box: { left: 1, right: 2, top: 0, bottom: 1 },
        segments: [[anchor, elbow], [elbow, connectorEnd]],
      }
    }

    return {
      // Simulate one missing cut of an enzyme that has two sites. All-or-none
      // filtering will remove its other cut while preserving the feature callout.
      callouts: input.sites.flatMap((site, index) => index === 1 ? [] : [makeCallout(site, index)]),
      hasPlacementFailure: true,
    }
  },
  summarizeCircularLayout: vi.fn(),
}))

describe('circular external feature routing', () => {
  it('keeps feature candidates when the combined layout is crowded and maps them after enzyme callouts are dropped', () => {
    const site = (name: string, match: string, start: number) => ({
      enzyme: { name }, match, start, end: start, cutTop: start, cutBottom: start,
    }) as RestrictionSite
    const feature = {
      feature: { id: 'tail', name: 'cytoplasmic tail', type: 'misc_feature' },
      segmentId: 'tail:100-120', start: 100, end: 120, level: 0,
    } as FeatureRenderInfo
    const helpers = createCircularMapLayoutHelpers({
      record: { sequence: 'A'.repeat(1000), topology: 'circular' },
      centerX: 400, centerY: 400,
      responsiveMapPolicy: {},
      displaySettings: { labelRouting: {} },
      enzymeCalloutSites: [site('EcoRI', '__enzyme_callout__', 50), site('EcoRI', '__enzyme_callout__', 60)],
      primerCalloutSites: [site('primer', '__primer_callout__0', 80)],
      prioritizedOuterFeatureBudget: 50,
      circularRouterAlgorithm: 'lane',
    } as CircularMapLayoutHelperScope)

    const routed = helpers.routableCombinedCallouts([feature], 250)
    expect(routed.candidates.map((candidate) => candidate.info.segmentId)).toEqual([feature.segmentId])
    expect(routed.callouts.map((callout) => callout.index)).toEqual([2, 3])

    const split = splitCircularFeatureCallouts(routed.callouts, routed.baseSiteCount, routed.candidates)
    expect(split.baseCallouts.map((callout) => callout.site.enzyme.name)).toEqual(['primer'])
    expect(split.featureCallouts.map(({ info }) => info.segmentId)).toEqual([feature.segmentId])
  })
})
