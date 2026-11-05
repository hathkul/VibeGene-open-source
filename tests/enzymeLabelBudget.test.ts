import { describe, expect, it } from 'vitest'
import {
  buildRadiusProbeLadder,
  circularArcRadiusCandidateIsBetter,
  circularRadiusBounds,
  contentFitsViewport,
  enforceAllOrNoneEnzymeCallouts,
  expectedEnzymeSiteCounts,
  rankEnzymeGroups,
  selectEnzymeSitesAllOrNone,
  selectPreferredCircularArcRadius,
  type CircularArcRadiusCandidate,
} from '../src/domain/enzymeLabelBudget'
import type { EnzymeCallout } from '../src/domain/mapLayout'
import type { RestrictionEnzyme, RestrictionSite, SiteMethylationDisplay } from '../src/domain/types'

function enzyme(
  name: string,
  options: {
    recognition?: string
    overhang?: RestrictionEnzyme['overhang']
  } = {},
): RestrictionEnzyme {
  const recognition = options.recognition ?? 'GAATTC'
  return {
    name,
    notation: 'G/AATTC',
    recognition,
    cutTop: 1,
    cutBottom: Math.max(1, recognition.length - 1),
    type: 'II',
    overhang: options.overhang ?? { type: "5'", sequence: 'AATT', length: 4 },
    manufacturers: [],
    notes: [],
  }
}

function site(
  name: string,
  start: number,
  options: {
    recognition?: string
    overhang?: RestrictionEnzyme['overhang']
    methylationDisplay?: SiteMethylationDisplay
  } = {},
): RestrictionSite {
  const recognition = options.recognition ?? 'GAATTC'
  return {
    enzyme: enzyme(name, { recognition, overhang: options.overhang }),
    start,
    end: start + recognition.length,
    match: recognition,
    cutTop: start + 1,
    cutBottom: start + Math.max(1, recognition.length - 1),
    methylationDisplay: options.methylationDisplay,
  }
}

function callout(name: string, start: number, index: number): EnzymeCallout {
  const s = site(name, start)
  return {
    site: s,
    index,
    anchor: { x: 0, y: 0 },
    elbow: { x: 1, y: 0 },
    connectorEnd: { x: 2, y: 0 },
    x: 2,
    y: 0,
    label: name,
    textAnchor: 'start',
    box: { left: 2, right: 40, top: 0, bottom: 12 },
    segments: [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      [
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    ],
  }
}

describe('enzymeLabelBudget', () => {
  it('keeps all-or-none enzyme groups within budget', () => {
    const sites = [
      site('AclI', 10),
      site('AclI', 100),
      site('AclI', 200),
      site('EcoRI', 50),
      site('BamHI', 60),
      site('BamHI', 70),
    ]
    // Budget 4: EcoRI(1) + BamHI(2) = 3, AclI(3) does not fit → skip AclI entirely
    const selected = selectEnzymeSitesAllOrNone(sites, 4)
    const names = selected.map((s) => s.enzyme.name)
    expect(names.filter((n) => n === 'AclI')).toHaveLength(0)
    expect(names.filter((n) => n === 'EcoRI')).toHaveLength(1)
    expect(names.filter((n) => n === 'BamHI')).toHaveLength(2)
  })

  it('prioritizes common sticky 6/8-cutters over other sticky and blunt enzymes', () => {
    const ranked = rankEnzymeGroups([
      site('SmaI', 10, {
        recognition: 'CCCGGG',
        overhang: { type: 'blunt', sequence: null, length: 0 },
      }),
      site('AclI', 20, { recognition: 'AACGTT' }),
      site('NotI', 30, { recognition: 'GCGGCCGC' }),
      site('EcoRI-HF', 40),
    ])
    expect(ranked.map((group) => group.name)).toEqual(['EcoRI-HF', 'NotI', 'AclI', 'SmaI'])
  })

  it('honors a custom priorityOrder over the built-in common sticky list', () => {
    const ranked = rankEnzymeGroups(
      [
        site('EcoRI', 10),
        site('BamHI', 20),
        site('AclI', 30, { recognition: 'AACGTT' }),
      ],
      { priorityOrder: ['AclI', 'BamHI'] },
    )
    expect(ranked.map((group) => group.name)).toEqual(['AclI', 'BamHI', 'EcoRI'])
  })

  it('deprioritizes fully methylation-blocked enzymes behind usable ones', () => {
    const ranked = rankEnzymeGroups([
      site('EcoRI', 10, { methylationDisplay: 'blocked' }),
      site('AclI', 20, { recognition: 'AACGTT' }),
      site('BamHI', 30),
    ])
    expect(ranked.map((group) => group.name)).toEqual(['BamHI', 'AclI', 'EcoRI'])
    expect(ranked[2]?.usable).toBe(false)
  })

  it('prefers sticky cutters over blunt cutters when both are usable', () => {
    const ranked = rankEnzymeGroups([
      site('SmaI', 10, {
        recognition: 'CCCGGG',
        overhang: { type: 'blunt', sequence: null, length: 0 },
      }),
      site('AclI', 20, { recognition: 'AACGTT' }),
    ])
    expect(ranked.map((group) => group.name)).toEqual(['AclI', 'SmaI'])
  })

  it('never keeps a partial enzyme after placement', () => {
    const expected = new Map([
      ['AclI', 3],
      ['EcoRI', 1],
    ])
    const placed = [callout('AclI', 10, 0), callout('AclI', 100, 1), callout('EcoRI', 50, 2)]
    const { callouts, droppedEnzymes } = enforceAllOrNoneEnzymeCallouts(placed, expected)
    expect(droppedEnzymes).toContain('AclI')
    expect(callouts.map((c) => c.site.enzyme.name)).toEqual(['EcoRI'])
  })

  it('does not treat zero placements as an all-or-none failure', () => {
    const expected = new Map([
      ['AclI', 3],
      ['EcoRI', 1],
    ])
    // Placer omitted AclI entirely — showing none is valid; do not drop EcoRI or flag AclI.
    const placed = [callout('EcoRI', 50, 0)]
    const { callouts, droppedEnzymes } = enforceAllOrNoneEnzymeCallouts(placed, expected)
    expect(droppedEnzymes).toEqual([])
    expect(callouts.map((c) => c.site.enzyme.name)).toEqual(['EcoRI'])
  })

  it('computes radius bounds with useful search floor', () => {
    const bounds = circularRadiusBounds(1000, 800)
    expect(bounds.shortSide).toBe(800)
    expect(bounds.maxRadius).toBe(320) // 0.4 * shortSide
    expect(bounds.hardMinRadius).toBe(64) // 0.08 * shortSide
    expect(bounds.searchMinRadius).toBeGreaterThanOrEqual(bounds.hardMinRadius)
    expect(bounds.searchMinRadius).toBeLessThanOrEqual(bounds.maxRadius)
  })

  it('uses landscape width for elliptic side labels and searches down to hard min', () => {
    const classic = circularRadiusBounds(1000, 800)
    const elliptic = circularRadiusBounds(1000, 800, { algorithm: 'elliptic', siteCount: 40 })
    expect(elliptic.maxRadius).toBeGreaterThan(classic.maxRadius)
    expect(elliptic.maxRadius).toBe(Math.floor(800 * 0.46))
    expect(elliptic.searchMinRadius).toBe(elliptic.hardMinRadius)
    expect(contentFitsViewport({ left: 0, top: 0, width: 800, height: 780 }, 800, 800)).toBe(true)
    expect(contentFitsViewport({ left: 0, top: 0, width: 900, height: 800 }, 800, 800)).toBe(false)
  })

  it('grows elliptic max radius when ringGap shrinks', () => {
    const tight = circularRadiusBounds(1000, 800, { algorithm: 'elliptic', maxLabelWidth: 80, ringGap: 16 })
    const loose = circularRadiusBounds(1000, 800, { algorithm: 'elliptic', maxLabelWidth: 80, ringGap: 120 })
    expect(tight.maxRadius).toBeGreaterThan(loose.maxRadius)
  })

  it('grows elliptic max radius when sideBudget drops to zero', () => {
    const reserved = circularRadiusBounds(1000, 800, {
      algorithm: 'elliptic',
      maxLabelWidth: 140,
      ringGap: 0,
      sideBudget: 140,
      maxRadiusRatio: 0.49,
    })
    const open = circularRadiusBounds(1000, 800, {
      algorithm: 'elliptic',
      maxLabelWidth: 140,
      ringGap: 0,
      sideBudget: 0,
      maxRadiusRatio: 0.49,
    })
    expect(open.maxRadius).toBeGreaterThan(reserved.maxRadius)
    expect(open.maxRadius).toBe(Math.floor(800 * 0.49))
  })

  it('uses newly available landscape width instead of retaining square-pane margins', () => {
    const square = circularRadiusBounds(800, 800, {
      algorithm: 'elliptic',
      maxLabelWidth: 120,
      ringGap: 16,
    })
    const wide = circularRadiusBounds(1400, 800, {
      algorithm: 'elliptic',
      maxLabelWidth: 120,
      ringGap: 16,
    })

    expect(square.maxRadius).toBe(264)
    expect(wide.maxRadius).toBe(Math.floor(800 * 0.46))
    expect(wide.maxRadius).toBeGreaterThan(square.maxRadius)
  })

  it('builds a short descending probe ladder', () => {
    const probes = buildRadiusProbeLadder(100, 400, 12, 8)
    expect(probes[0]).toBeGreaterThanOrEqual(probes[probes.length - 1])
    expect(probes.length).toBeLessThanOrEqual(9)
    expect(probes[probes.length - 1]).toBe(100)
  })

  it('scopes all-or-none expectations to layout input enzymes only', () => {
    // Global budget may include AclI, but this layout input only has EcoRI.
    const layoutSites = [site('EcoRI', 50)]
    const expected = expectedEnzymeSiteCounts(layoutSites)
    expect(expected.has('AclI')).toBe(false)
    expect(expected.get('EcoRI')).toBe(1)

    const placed = [callout('EcoRI', 50, 0)]
    const { callouts, droppedEnzymes } = enforceAllOrNoneEnzymeCallouts(placed, expected)
    expect(droppedEnzymes).toEqual([])
    expect(callouts).toHaveLength(1)
  })

  it('expands merged enzyme names when counting expectations', () => {
    const merged = site('AclI, EcoRI', 10)
    merged.match = '__enzyme_callout__'
    const expected = expectedEnzymeSiteCounts([merged, site('AclI', 100)])
    expect(expected.get('AclI')).toBe(2)
    expect(expected.get('EcoRI')).toBe(1)
  })
})

describe('circular arc radius ranking', () => {
  const preferredRadius = 216

  function quality(
    overrides: Partial<NonNullable<CircularArcRadiusCandidate['routingQuality']>>,
  ): NonNullable<CircularArcRadiusCandidate['routingQuality']> {
    return {
      fitsViewport: false,
      viewportOverflowPx: 400,
      minBendAngle: 140,
      meanBendAngle: 150,
      maxLeaderLength: 48,
      meanLeaderLength: 32,
      ...overrides,
    }
  }

  function candidate(
    radius: number,
    overrides: Partial<CircularArcRadiusCandidate> = {},
  ): CircularArcRadiusCandidate {
    const routingQuality = overrides.routingQuality ?? quality({})
    return {
      radius,
      overflowMode: routingQuality.fitsViewport ? false : true,
      strictInvalid: false,
      ...overrides,
      routingQuality,
    }
  }

  it('keeps readable-then-largest selection among viewport-fitting rings', () => {
    const larger = candidate(396, { routingQuality: quality({ fitsViewport: true, viewportOverflowPx: 0 }) })
    const smaller = candidate(312, { routingQuality: quality({ fitsViewport: true, viewportOverflowPx: 0 }) })
    expect(circularArcRadiusCandidateIsBetter(larger, smaller, { preferredRadius })).toBe(true)
    expect(circularArcRadiusCandidateIsBetter(smaller, larger, { preferredRadius })).toBe(false)

    const sharperSmaller = candidate(312, {
      routingQuality: quality({ fitsViewport: true, viewportOverflowPx: 0, minBendAngle: 148 }),
    })
    expect(circularArcRadiusCandidateIsBetter(sharperSmaller, larger, { preferredRadius })).toBe(true)
  })

  it('prefers a compact overflow ring over a near-max ring with slightly better bends', () => {
    const maxRing = candidate(480, {
      routingQuality: quality({
        viewportOverflowPx: 920,
        minBendAngle: 146.2,
        meanBendAngle: 154,
      }),
    })
    const compact = candidate(preferredRadius, {
      routingQuality: quality({
        viewportOverflowPx: 240,
        minBendAngle: 145.8,
        meanBendAngle: 153.4,
      }),
    })
    expect(selectPreferredCircularArcRadius([maxRing, compact], { preferredRadius })?.radius).toBe(
      preferredRadius,
    )
    expect(selectPreferredCircularArcRadius([compact, maxRing], { preferredRadius })?.radius).toBe(
      preferredRadius,
    )
  })

  it('rejects an overflow layout whose worst bend is far less readable', () => {
    const readable = candidate(396, {
      routingQuality: quality({ viewportOverflowPx: 500, minBendAngle: 142 }),
    })
    const unreadable = candidate(preferredRadius, {
      routingQuality: quality({ viewportOverflowPx: 80, minBendAngle: 118 }),
    })
    expect(selectPreferredCircularArcRadius([unreadable, readable], { preferredRadius })?.radius).toBe(
      396,
    )
  })

  it('treats hard validity as the first partition before viewport fit', () => {
    const fittingInvalid = candidate(396, {
      strictInvalid: true,
      routingQuality: quality({ fitsViewport: true, viewportOverflowPx: 0, minBendAngle: 150 }),
    })
    const validOverflow = candidate(preferredRadius, {
      strictInvalid: false,
      routingQuality: quality({ viewportOverflowPx: 280, minBendAngle: 141 }),
    })
    expect(circularArcRadiusCandidateIsBetter(fittingInvalid, validOverflow, { preferredRadius })).toBe(
      false,
    )
    expect(circularArcRadiusCandidateIsBetter(validOverflow, fittingInvalid, { preferredRadius })).toBe(
      true,
    )
    expect(
      selectPreferredCircularArcRadius([fittingInvalid, validOverflow], { preferredRadius })?.radius,
    ).toBe(preferredRadius)
    expect(
      selectPreferredCircularArcRadius([validOverflow, fittingInvalid], { preferredRadius })?.radius,
    ).toBe(preferredRadius)
  })

  it('selects overflow rings globally so a 12° bend chain cannot depend on order', () => {
    const sharpest = candidate(480, {
      routingQuality: quality({ viewportOverflowPx: 820, minBendAngle: 150 }),
    })
    const mid = candidate(360, {
      routingQuality: quality({ viewportOverflowPx: 220, minBendAngle: 139 }),
    })
    const compactUnreadable = candidate(preferredRadius, {
      routingQuality: quality({ viewportOverflowPx: 40, minBendAngle: 128 }),
    })
    const set = [sharpest, mid, compactUnreadable]
    const permutations = [
      set,
      [sharpest, compactUnreadable, mid],
      [mid, sharpest, compactUnreadable],
      [mid, compactUnreadable, sharpest],
      [compactUnreadable, sharpest, mid],
      [compactUnreadable, mid, sharpest],
    ]
    for (const order of permutations) {
      expect(selectPreferredCircularArcRadius(order, { preferredRadius })?.radius).toBe(360)
    }
  })

  it('breaks comparable overflow ties toward the soft-floor radius instead of max', () => {
    const maxRing = candidate(480, {
      routingQuality: quality({ viewportOverflowPx: 310.2, minBendAngle: 141 }),
    })
    const floorRing = candidate(preferredRadius, {
      routingQuality: quality({ viewportOverflowPx: 310.4, minBendAngle: 140.8 }),
    })
    expect(selectPreferredCircularArcRadius([maxRing, floorRing], { preferredRadius })?.radius).toBe(
      preferredRadius,
    )
  })

  it('does not drop to a much smaller ring when a modest resize starts to fit', () => {
    const radii = [240, 216, 168, 144, 140]
    const overflowFloor = 0.7 * 240
    const canvasHeight = (radius: number) => radius + 500

    function candidatesAt(viewportHeight: number) {
      return radii.map((radius) => {
        const overflow = Math.max(0, canvasHeight(radius) - viewportHeight)
        return candidate(radius, {
          routingQuality: quality({
            fitsViewport: overflow <= 0.5,
            viewportOverflowPx: overflow,
            minBendAngle: 141 + (radius - 140) * 0.01,
          }),
        })
      })
    }

    const overflowViewport = 630
    const slightlyLargerViewport = 720
    const rankOptions = { preferredRadius: 168, minimumOverflowRadius: overflowFloor }
    const overflowChoice = selectPreferredCircularArcRadius(candidatesAt(overflowViewport), rankOptions)
    const fittedChoice = selectPreferredCircularArcRadius(candidatesAt(slightlyLargerViewport), rankOptions)
    const unconstrainedOverflow = selectPreferredCircularArcRadius(candidatesAt(overflowViewport), {
      preferredRadius: 168,
    })

    expect({
      overflowRadius: overflowChoice?.radius,
      overflowMode: overflowChoice?.overflowMode,
      fittedRadius: fittedChoice?.radius,
      fittedFits: fittedChoice?.routingQuality?.fitsViewport,
      unconstrainedOverflowRadius: unconstrainedOverflow?.radius,
    }).toEqual({
      overflowRadius: 168,
      overflowMode: true,
      fittedRadius: 216,
      fittedFits: true,
      unconstrainedOverflowRadius: 140,
    })
    expect(fittedChoice!.radius).toBeGreaterThan(overflowChoice!.radius)
  })

  it('ranks already-evaluated overflow probes without adding radii', () => {
    const probes = buildRadiusProbeLadder(preferredRadius, 480, 24, 4)
    expect(probes.length).toBeLessThanOrEqual(5)
    expect(probes[0]).toBeGreaterThan(probes[probes.length - 1])

    const evaluated = probes.map((radius, index) =>
      candidate(radius, {
        routingQuality: quality({
          viewportOverflowPx: 80 + (probes.length - 1 - index) * 40,
          minBendAngle: 144 - index * 0.05,
        }),
      }),
    )
    const winner = selectPreferredCircularArcRadius(evaluated, {
      preferredRadius,
      minimumOverflowRadius: Math.max(...probes) * 0.7,
    })

    expect(evaluated.map((item) => item.radius)).toEqual(probes)
    expect(probes).toContain(winner?.radius)
    expect(winner!.radius).toBeGreaterThanOrEqual(Math.max(...probes) * 0.7)
  })

  it('applies an overflow-only floor so a VSV-like ladder keeps r=168 instead of r=140', () => {
    const probes = [240, 216, 168, 144, 140]
    const evaluated = probes.map((radius) =>
      candidate(radius, {
        routingQuality: quality({
          viewportOverflowPx: radius * 2,
          minBendAngle: 142,
        }),
      }),
    )
    expect(selectPreferredCircularArcRadius(evaluated, { preferredRadius: 168 })?.radius).toBe(140)
    expect(
      selectPreferredCircularArcRadius(evaluated, {
        preferredRadius: 168,
        minimumOverflowRadius: 0.7 * 240,
      })?.radius,
    ).toBe(168)
    expect(evaluated.map((item) => item.radius)).toEqual(probes)
  })

  it('does not apply the overflow floor when a valid fitting candidate exists below it', () => {
    const fittingBelowFloor = candidate(140, {
      routingQuality: quality({ fitsViewport: true, viewportOverflowPx: 0, minBendAngle: 141 }),
    })
    const overflowAboveFloor = candidate(240, {
      routingQuality: quality({ viewportOverflowPx: 80, minBendAngle: 150 }),
    })
    expect(
      selectPreferredCircularArcRadius([overflowAboveFloor, fittingBelowFloor], {
        preferredRadius: 168,
        minimumOverflowRadius: 168,
      })?.radius,
    ).toBe(140)
  })

  it('includes the overflow floor radius and falls back when every probe is below it', () => {
    const atFloor = candidate(168, {
      routingQuality: quality({ viewportOverflowPx: 220, minBendAngle: 142 }),
    })
    const above = candidate(240, {
      routingQuality: quality({ viewportOverflowPx: 400, minBendAngle: 142 }),
    })
    expect(
      selectPreferredCircularArcRadius([above, atFloor], {
        preferredRadius: 168,
        minimumOverflowRadius: 168,
      })?.radius,
    ).toBe(168)

    const below = [144, 140].map((radius) =>
      candidate(radius, {
        routingQuality: quality({ viewportOverflowPx: radius * 2, minBendAngle: 142 }),
      }),
    )
    expect(
      selectPreferredCircularArcRadius(below, {
        preferredRadius: 168,
        minimumOverflowRadius: 168,
      })?.radius,
    ).toBe(140)
  })

  it('picks compact overflow among all-invalid elliptic probes instead of the first/largest', () => {
    const largest = {
      radius: 480,
      strictInvalid: true,
      routingQuality: quality({ viewportOverflowPx: 860, minBendAngle: 143 }),
    }
    const compact = {
      radius: preferredRadius,
      strictInvalid: true,
      routingQuality: quality({ viewportOverflowPx: 190, minBendAngle: 141 }),
    }
    expect(selectPreferredCircularArcRadius([largest, compact], { preferredRadius })?.radius).toBe(
      preferredRadius,
    )
  })
})
