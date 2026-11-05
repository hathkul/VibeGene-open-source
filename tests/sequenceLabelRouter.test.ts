import { describe, expect, it } from 'vitest'
import { layoutSequenceViewLabels } from '../src/domain/sequenceLabelRouter'
import type { SequenceLabelRouterInput } from '../src/domain/sequenceLabelRouter'
import { linearCutPosition } from '../src/domain/mapLayout'
import type { RestrictionSite } from '../src/domain/types'
import { labPlasmid } from '../src/domain/fixtures'
import { findRestrictionSites } from '../src/domain/enzymes'
import { SEQUENCE_ENZYME_LABEL_FONT, sequenceRouterInputDefaults, measureSequenceEnzymeLabelWidthPx } from './sequenceLabelTestUtils'
import { PRIMER_DISPLAY_ROWS } from '../src/domain/primerSequenceLayout'
import { sequenceEnzymeLabelRows } from '../src/presentation/sequence/sequenceEnzymeLabels'

function site(name: string, start: number, cutTop = start + 1): RestrictionSite {
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
    cutTop,
    cutBottom: start + 5,
  }
}

function routerInput(
  enzymeSites: RestrictionSite[],
  overrides: Partial<SequenceLabelRouterInput> = {},
): SequenceLabelRouterInput {
  return {
    enzymeSites,
    primerSites: [],
    sequenceLength: 900,
    basesPerRow: 90,
    baseStepPx: 9,
    trackInsetPx: 28,
    collisionUnitPx: 48,
    ...overrides,
  }
}

describe('layoutSequenceViewLabels', () => {
  it('indexes outside-linear cuts on the first or last sequence label row', () => {
    const before = { ...site('Before', 8), cutTop: -11, cutBottom: -13 }
    const after = { ...site('After', 8), cutTop: 22, cutBottom: 24 }
    const rows = [{ rowStart: 0, rowLength: 10 }, { rowStart: 10, rowLength: 10 }]
    const indexed = sequenceEnzymeLabelRows([before, after], 20, 0, 20, false, 10, rows)

    expect(indexed.get(0)).toEqual([before])
    expect(indexed.get(1)).toEqual([after])
  })

  it('uses a bundled font for reproducible label geometry', () => {
    expect(SEQUENCE_ENZYME_LABEL_FONT).toBe('11px "VibeGene Test Sans"')
    expect(measureSequenceEnzymeLabelWidthPx('FaiI')).toBeCloseTo(18.34, 2)
  })

  it('keeps vertical leaders at the cut anchor X', () => {
    const input = routerInput([site('EcoRI', 44)])
    const [rowLayout] = layoutSequenceViewLabels(input, 10)
    const [callout] = rowLayout.enzymeCallouts
    expect(callout.segments).toHaveLength(1)
    expect(callout.segments[0][0].x).toBe(callout.segments[0][1].x)
    expect(callout.segments[0][1].y).toBe(0)
    expect(callout.anchorX).toBeCloseTo(28 + linearCutPosition(callout.site) * 9, 4)
  })

  it('routes an outside-linear cut to the sequence edge while preserving its true cut coordinate', () => {
    const outside = { ...site('NmeAIII', 8), cutTop: -11, cutBottom: -13 }
    const [rowLayout] = layoutSequenceViewLabels(routerInput([outside]), 10)
    const callout = rowLayout!.enzymeCallouts[0]!

    expect(callout.anchorX).toBe(28)
    expect(callout.cutPosition).toBe(0)
    expect(callout.site.cutTop).toBe(-11)
  })

  it('stacks co-cut enzymes with one shared leader', () => {
    const input = routerInput([site('EcoRI', 44, 45), site('BamHI', 44, 45)])
    const [rowLayout] = layoutSequenceViewLabels(input, 10)
    expect(rowLayout.enzymeCallouts).toHaveLength(2)
    expect(rowLayout.enzymeCallouts.every((callout) => callout.stackSize === 2)).toBe(true)
    expect(rowLayout.enzymeCallouts.filter((callout) => callout.isStackLeader)).toHaveLength(1)
    expect(rowLayout.enzymeCallouts.every((callout) => callout.anchorX === rowLayout.enzymeCallouts[0].anchorX)).toBe(true)
  })

  it('orders co-cut labels independently of the host locale and input order', () => {
    const labelsFor = (enzymeSites: RestrictionSite[]) =>
      layoutSequenceViewLabels(routerInput(enzymeSites), 10)[0]!.enzymeCallouts.map((callout) => [callout.label, callout.laneRow])

    expect(labelsFor([site('a', 44, 45), site('A', 44, 45)])).toEqual([
      ['A', 0],
      ['a', 1],
    ])
    expect(labelsFor([site('A', 44, 45), site('a', 44, 45)])).toEqual([
      ['A', 0],
      ['a', 1],
    ])
  })

  it('only shifts enzyme labels whose label span intersects forward primer space', () => {
    const input = routerInput([site('Overlap', 19, 20), site('Clear', 39, 40)], {
      baseStepPx: 10,
      trackInsetPx: 0,
      labelWidthForSite: () => 50,
      forwardPrimerClearanceSpans: [{ left: 160, right: 170 }],
      forwardPrimerClearanceRows: 3,
    })
    const [rowLayout] = layoutSequenceViewLabels(input, 10)
    const overlap = rowLayout.enzymeCallouts.find((callout) => callout.label === 'Overlap')!
    const clear = rowLayout.enzymeCallouts.find((callout) => callout.label === 'Clear')!

    expect(overlap.anchorX).toBe(200)
    expect(overlap.laneRow).toBe(3)
    expect(clear.laneRow).toBe(0)
  })

  it('pushes enzyme labels by the primer stack height (px) rather than a fixed lane count', () => {
    // rowGap for the default 12px text height is 21px, so 42px of primer = 2 enzyme rows.
    const compact = routerInput([site('Overlap', 19, 20), site('Clear', 39, 40)], {
      baseStepPx: 10,
      trackInsetPx: 0,
      labelWidthForSite: () => 50,
      forwardPrimerClearanceSpans: [{ left: 160, right: 170, heightPx: 42 }],
      forwardPrimerClearanceRows: PRIMER_DISPLAY_ROWS + 1,
    })
    const [compactLayout] = layoutSequenceViewLabels(compact, 10)
    expect(compactLayout.enzymeCallouts.find((c) => c.label === 'Overlap')!.laneRow).toBe(2)
    expect(compactLayout.enzymeCallouts.find((c) => c.label === 'Clear')!.laneRow).toBe(0)

    // A taller stack pushes further, still derived from its real height (84px -> 4 rows).
    const tall = routerInput([site('Overlap', 19, 20), site('Clear', 39, 40)], {
      baseStepPx: 10,
      trackInsetPx: 0,
      labelWidthForSite: () => 50,
      forwardPrimerClearanceSpans: [{ left: 160, right: 170, heightPx: 84 }],
      forwardPrimerClearanceRows: PRIMER_DISPLAY_ROWS + 1,
    })
    const [tallLayout] = layoutSequenceViewLabels(tall, 10)
    expect(tallLayout.enzymeCallouts.find((c) => c.label === 'Overlap')!.laneRow).toBe(4)
  })

  it('stacks dense labels on higher rows without horizontal spread', () => {
    const input = routerInput([site('A', 10), site('B', 12), site('C', 14)])
    const [rowLayout] = layoutSequenceViewLabels(input, 10)
    const rows = rowLayout.enzymeCallouts
      .toSorted((a, b) => linearCutPosition(a.site) - linearCutPosition(b.site))
      .map((callout) => callout.laneRow)
    expect(rows).toEqual([0, 1, 0])
    expect(rowLayout.enzymeCallouts.find((c) => c.site.enzyme.name === 'C')!.half).toBe('right')
    expect(rowLayout.enzymeCallouts.every((callout) => callout.segments.every(([a, b]) => a.x === b.x))).toBe(true)
  })

  it('routes labels only within their sequence row chunk', () => {
    const input = routerInput([site('Near', 10), site('Far', 120)], { basesPerRow: 90 })
    const layouts = layoutSequenceViewLabels(input, 2)
    expect(layouts[0].enzymeCallouts).toHaveLength(1)
    expect(layouts[1].enzymeCallouts).toHaveLength(1)
    expect(layouts[0].enzymeCallouts[0].site.enzyme.name).toBe('Near')
    expect(layouts[1].enzymeCallouts[0].site.enzyme.name).toBe('Far')
  })

  it('extends all labels leftward from the anchor by default', () => {
    const input = routerInput([site('EcoRI', 10)])
    const leftCallout = layoutSequenceViewLabels(input, 10)[0].enzymeCallouts[0]
    expect(leftCallout.half).toBe('left')
    expect(leftCallout.box.right).toBeCloseTo(leftCallout.anchorX, 4)
    expect(leftCallout.textAnchor).toBe('end')

    const rightSiteInput = routerInput([site('EcoRI', 60)])
    const rightCallout = layoutSequenceViewLabels(rightSiteInput, 10)[0].enzymeCallouts[0]
    expect(rightCallout.half).toBe('left')
    expect(rightCallout.box.right).toBeCloseTo(rightCallout.anchorX, 4)
  })

  it('uses one ascending sweep with left-half row rules for the whole row', () => {
    const input = routerInput(
      [site('L1', 10), site('L2', 12), site('L3', 14), site('R1', 50), site('R2', 52), site('R3', 54)],
      { collisionUnitPx: 48 },
    )
    const callouts = layoutSequenceViewLabels(input, 10)[0].enzymeCallouts.toSorted(
      (a, b) => linearCutPosition(a.site) - linearCutPosition(b.site),
    )
    expect(callouts.map((callout) => [callout.laneRow, callout.half])).toEqual([
      [0, 'left'],
      [1, 'left'],
      [0, 'right'],
      [0, 'left'],
      [1, 'left'],
      [0, 'right'],
    ])
  })

  it('accounts for co-cut stack height when placing the next neighbor', () => {
    const input = routerInput([site('A', 10, 11), site('B', 10, 11), site('C', 12, 13)])
    const rows = layoutSequenceViewLabels(input, 10)[0].enzymeCallouts
      .toSorted((a, b) => linearCutPosition(a.site) - linearCutPosition(b.site))
      .map((callout) => callout.laneRow)
    expect(rows).toEqual([0, 1, 0])
  })

  it('folds a completed ladder into a christmas tree when the next label returns to row 1', () => {
    const input = routerInput([site('A', 10), site('B', 12), site('C', 14), site('D', 60)])
    const callouts = layoutSequenceViewLabels(input, 10)[0].enzymeCallouts.toSorted(
      (a, b) => linearCutPosition(a.site) - linearCutPosition(b.site),
    )

    const a = callouts.find((callout) => callout.site.enzyme.name === 'A')!
    const b = callouts.find((callout) => callout.site.enzyme.name === 'B')!
    const c = callouts.find((callout) => callout.site.enzyme.name === 'C')!
    const d = callouts.find((callout) => callout.site.enzyme.name === 'D')!

    expect(d.laneRow).toBe(0)
    expect(d.half).toBe('left')
    expect(a.laneRow).toBe(0)
    expect(a.half).toBe('left')
    expect(c.laneRow).toBe(0)
    expect(c.half).toBe('right')
    expect(b.laneRow).toBe(1)
    expect(b.half).toBe('left')
  })

  it('moves the next left foot to row 1 when its row-0 label overlaps the folded row-0 label', () => {
    const input = routerInput(
      [site('A', 0, 1), site('B', 1, 2), site('C', 2, 3), site('D', 9, 10)],
      {
        baseStepPx: 10,
        trackInsetPx: 0,
        collisionUnitPx: 0,
        labelPadding: 0,
        labelWidthForSite: (_site, label) =>
          ({ A: 10, B: 30, C: 30, D: 60 })[label as 'A' | 'B' | 'C' | 'D'],
      },
    )
    const callouts = layoutSequenceViewLabels(input, 10)[0].enzymeCallouts
    const c = callouts.find((callout) => callout.site.enzyme.name === 'C')!
    const d = callouts.find((callout) => callout.site.enzyme.name === 'D')!

    expect(c.half).toBe('right')
    expect(c.laneRow).toBe(1)
    expect(d.half).toBe('left')
    expect(d.laneRow).toBe(0)
  })

  it('folds a completed left ladder when a row-0 successor follows after a climb', () => {
    const input = routerInput([
      site('A', 10),
      site('B', 12),
      site('C', 14),
      site('D', 16),
      site('E', 18),
      site('F', 20),
      site('G', 22),
      site('H', 60),
    ])
    const callouts = layoutSequenceViewLabels(input, 10)[0].enzymeCallouts.toSorted(
      (a, b) => linearCutPosition(a.site) - linearCutPosition(b.site),
    )

    const b = callouts.find((callout) => callout.site.enzyme.name === 'B')!
    const c = callouts.find((callout) => callout.site.enzyme.name === 'C')!
    const d = callouts.find((callout) => callout.site.enzyme.name === 'D')!
    const e = callouts.find((callout) => callout.site.enzyme.name === 'E')!
    const f = callouts.find((callout) => callout.site.enzyme.name === 'F')!
    const g = callouts.find((callout) => callout.site.enzyme.name === 'G')!
    const h = callouts.find((callout) => callout.site.enzyme.name === 'H')!

    expect(c.laneRow).toBe(2)
    expect(c.half).toBe('left')
    expect(b.laneRow).toBe(1)
    expect(b.half).toBe('left')
    expect(d.laneRow).toBe(3)
    expect(d.half).toBe('left')
    expect(e.laneRow).toBe(2)
    expect(e.half).toBe('right')
    expect(f.laneRow).toBe(1)
    expect(f.half).toBe('right')
    expect(g.laneRow).toBe(0)
    expect(g.half).toBe('right')
    expect(h.laneRow).toBe(0)
    expect(h.half).toBe('left')
  })

  it('advances christmas-tree fold rows by co-cut stack height', () => {
    const input = routerInput([
      site('A', 10),
      site('B', 12),
      site('C', 14),
      site('D', 16),
      site('E', 18),
      site('F', 20),
      site('W', 22),
      site('X', 24),
      site('Y', 24),
      site('Z', 24),
      site('GAP', 60),
    ])
    const callouts = layoutSequenceViewLabels(input, 10)[0].enzymeCallouts.toSorted(
      (a, b) => linearCutPosition(a.site) - linearCutPosition(b.site),
    )

    const w = callouts.find((callout) => callout.site.enzyme.name === 'W')!
    const x = callouts.find((callout) => callout.site.enzyme.name === 'X')!
    const y = callouts.find((callout) => callout.site.enzyme.name === 'Y')!
    const z = callouts.find((callout) => callout.site.enzyme.name === 'Z')!

    expect(x.laneRow).toBe(0)
    expect(x.half).toBe('right')
    expect(y.laneRow).toBe(1)
    expect(y.half).toBe('right')
    expect(z.laneRow).toBe(2)
    expect(z.half).toBe('right')
    expect(w.laneRow).toBe(3)
    expect(w.half).toBe('right')
  })

  it('keeps the next ladder foot on the left after christmas-tree folds (pDemo MCS)', () => {
    const sites = findRestrictionSites(labPlasmid.sequence)
    const input: SequenceLabelRouterInput = {
      enzymeSites: sites,
      primerSites: [],
      sequenceLength: labPlasmid.sequence.length,
      basesPerRow: 79,
      ...sequenceRouterInputDefaults(),
    }
    const row = layoutSequenceViewLabels(input, Math.ceil(labPlasmid.sequence.length / 79)).find(
      (layout) => layout.rowStart + layout.rowLength === 395,
    )!
    const calloutsAt = (cut: number) =>
      row.enzymeCallouts.filter((callout) => linearCutPosition(callout.site) === cut)

    expect(calloutsAt(374).some((callout) => callout.half === 'left' && callout.laneRow === 0)).toBe(true)
    expect(calloutsAt(376).some((callout) => callout.half === 'left' && callout.laneRow === 2)).toBe(true)
    expect(calloutsAt(366).some((callout) => callout.half === 'right' && callout.laneRow === 0)).toBe(true)
    expect(calloutsAt(364).some((callout) => callout.half === 'right' && callout.laneRow === 2)).toBe(true)
  })

  it('routes each row chunk using explicit rowSegments from the sequence view', () => {
    const sites = findRestrictionSites(labPlasmid.sequence)
    const rowStart = 212
    const rowLength = 212
    const input: SequenceLabelRouterInput = {
      enzymeSites: sites,
      primerSites: [],
      sequenceLength: labPlasmid.sequence.length,
      basesPerRow: 212,
      rowSegments: [{ rowStart, rowLength }],
      ...sequenceRouterInputDefaults(),
    }
    const [row] = layoutSequenceViewLabels(input)
    expect(row.rowStart).toBe(rowStart)
    expect(row.rowLength).toBe(rowLength)
    expect(row.rowStart + row.rowLength).toBe(424)

    const calloutsAt = (cut: number) =>
      row.enzymeCallouts.filter((callout) => linearCutPosition(callout.site) === cut)

    expect(calloutsAt(407).some((callout) => callout.half === 'left' && callout.laneRow === 0)).toBe(true)
    expect(calloutsAt(412).some((callout) => callout.half === 'right' && callout.laneRow === 0)).toBe(true)
    expect(calloutsAt(412).some((callout) => callout.half === 'right' && callout.laneRow === 1)).toBe(true)
    expect(calloutsAt(411).some((callout) => callout.half === 'right' && callout.laneRow === 2)).toBe(true)
    expect(row.enzymeCallouts.some((callout) => linearCutPosition(callout.site) === 426)).toBe(false)
  })

  it('does not treat later stacks as occupied when placing a ladder foot', () => {
    const sites = findRestrictionSites(labPlasmid.sequence)
    const rowStart = 636
    const rowLength = 212
    const input: SequenceLabelRouterInput = {
      enzymeSites: sites,
      primerSites: [],
      sequenceLength: labPlasmid.sequence.length,
      basesPerRow: 212,
      rowSegments: [{ rowStart, rowLength }],
      ...sequenceRouterInputDefaults(),
      labelWidthForSite: (_site, label) => measureSequenceEnzymeLabelWidthPx(label) * 1.15,
    }
    const [row] = layoutSequenceViewLabels(input)
    const calloutsAt = (cut: number) =>
      row.enzymeCallouts.filter((callout) => linearCutPosition(callout.site) === cut)

    expect(calloutsAt(808).some((callout) => callout.half === 'left' && callout.laneRow === 0)).toBe(true)
    expect(calloutsAt(810).some((callout) => callout.half === 'left' && callout.laneRow === 2)).toBe(true)
    expect(calloutsAt(812).some((callout) => callout.half === 'right')).toBe(true)
  })

  it('folds left-ladder followers using their current rows when the top member clears the successor leader', () => {
    const sites = findRestrictionSites(labPlasmid.sequence)
    const rowStart = 636
    const rowLength = 212
    const input: SequenceLabelRouterInput = {
      enzymeSites: sites,
      primerSites: [],
      sequenceLength: labPlasmid.sequence.length,
      basesPerRow: 212,
      rowSegments: [{ rowStart, rowLength }],
      ...sequenceRouterInputDefaults(),
    }
    const [row] = layoutSequenceViewLabels(input)
    const calloutAt = (cut: number) =>
      row.enzymeCallouts.find((callout) => linearCutPosition(callout.site) === cut)!

    expect(calloutAt(846).half).toBe('left')
    expect(calloutAt(846).laneRow).toBe(0)
  })

  it('allows trailing row-end folds to extend into row margin slack', () => {
    const sites = findRestrictionSites(labPlasmid.sequence)
    const input: SequenceLabelRouterInput = {
      enzymeSites: sites,
      primerSites: [],
      sequenceLength: labPlasmid.sequence.length,
      basesPerRow: 185,
      rowSegments: [{ rowStart: 555, rowLength: 185 }],
      ...sequenceRouterInputDefaults(),
    }
    const [row739] = layoutSequenceViewLabels(input)
    const calloutAt = (cut: number) =>
      row739.enzymeCallouts.find((callout) => linearCutPosition(callout.site) === cut)!

    expect(calloutAt(739).half).toBe('right')
  })

  it('places the next ladder foot above the folded tree and avoids partial folds in row 740–901', () => {
    const sites = findRestrictionSites(labPlasmid.sequence)
    const measureTextWidthPx = (label: string) => measureSequenceEnzymeLabelWidthPx(label) + 6
    const input: SequenceLabelRouterInput = {
      enzymeSites: sites,
      primerSites: [],
      sequenceLength: labPlasmid.sequence.length,
      basesPerRow: 185,
      rowSegments: [{ rowStart: 740, rowLength: 161 }],
      ...sequenceRouterInputDefaults(),
      labelWidthForSite: (_site, label) => measureTextWidthPx(label),
    }
    const [row] = layoutSequenceViewLabels(input)
    const leaderAt = (cut: number) =>
      row.enzymeCallouts.find((callout) => linearCutPosition(callout.site) === cut && callout.isStackLeader)!

    expect(leaderAt(829).half).toBe('left')
    expect(leaderAt(833).half).toBe('right')
    expect(leaderAt(833).laneRow).toBe(2)
    expect(leaderAt(788).half).toBe('right')
    expect(leaderAt(788).laneRow).toBe(3)
    expect(leaderAt(795).half).toBe('left')
    expect(leaderAt(795).laneRow).toBe(0)
    expect(leaderAt(808).laneRow).toBe(0)
    expect(leaderAt(898).half).toBe('right')
    expect(leaderAt(888).half).toBe('right')
    expect(leaderAt(898).laneRow).toBeLessThan(10)

    for (const cut of [824, 826, 828, 829, 833, 835, 837, 839, 842]) {
      const callouts = row.enzymeCallouts.filter(
        (callout) => linearCutPosition(callout.site) === cut && callout.isStackLeader,
      )
      const leftRows = callouts.filter((callout) => callout.half === 'left').map((callout) => callout.laneRow)
      const rightRows = callouts.filter((callout) => callout.half === 'right').map((callout) => callout.laneRow)
      for (const laneRow of leftRows) {
        expect(rightRows).not.toContain(laneRow)
      }
    }
  })

  it('does not fold lower ladder members when the top member cannot clear even with margin slack', () => {
    const sites = findRestrictionSites(labPlasmid.sequence)
    const input: SequenceLabelRouterInput = {
      enzymeSites: sites,
      primerSites: [],
      sequenceLength: labPlasmid.sequence.length,
      basesPerRow: 133,
      rowSegments: [{ rowStart: 0, rowLength: 133 }],
      ...sequenceRouterInputDefaults(),
      trackInsetPx: 0,
      labelPadding: 0,
    }
    const [row] = layoutSequenceViewLabels(input)
    const calloutAt = (cut: number) =>
      row.enzymeCallouts.find((callout) => linearCutPosition(callout.site) === cut)!

    expect(calloutAt(133).half).toBe('left')
    expect(calloutAt(133).laneRow).toBe(1)
    expect(calloutAt(130).half).toBe('left')
    expect(calloutAt(130).laneRow).toBe(0)
  })
})
