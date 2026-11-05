import { describe, expect, it } from 'vitest'
import { layoutLinearEnzymeCalloutsSimple } from '../src/domain/linearSimpleRouter'
import type { LinearEnzymeCalloutLayoutInput } from '../src/domain/mapLayout'
import { linearCutPosition } from '../src/domain/mapLayout'
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

function linearInput(starts: number[]): LinearEnzymeCalloutLayoutInput {
  return {
    sites: starts.map((start, index) => site(`E${index + 1}`, start)),
    sequenceLength: 900,
    mapWidth: 1200,
    mapHeight: 900,
    trackLeft: 16,
    trackRight: 884,
    strandY: 28,
    featureHeight: 24,
    featureStubHeight: 18,
  }
}

function rowIndices(callouts: ReturnType<typeof layoutLinearEnzymeCalloutsSimple>, input: LinearEnzymeCalloutLayoutInput) {
  const rowGap = 12 + 6 + 2 + 1
  const baseLabelY = input.strandY! - input.featureStubHeight! - 6 - 1
  return callouts
    .toSorted((a, b) => a.site.cutTop - b.site.cutTop)
    .map((callout) => Math.round((baseLabelY - (callout.box.top + callout.box.bottom) / 2) / rowGap))
}

function leftHalfCallouts(callouts: ReturnType<typeof layoutLinearEnzymeCalloutsSimple>, sequenceLength: number) {
  return callouts
    .filter((c) => linearCutPosition(c.site) / sequenceLength < 0.5)
    .toSorted((a, b) => a.site.cutTop - b.site.cutTop)
}

describe('layoutLinearEnzymeCalloutsSimple geometry', () => {
  it('attaches leaders at the inner bottom corner of the label box', () => {
    const input = linearInput([44])
    const [callout] = layoutLinearEnzymeCalloutsSimple(input)
    expect(callout.connectorEnd.y).toBe(callout.box.bottom)
    expect(callout.connectorEnd.x).toBe(callout.box.right)
  })

  it('clamps an off-sequence cut anchor to the sequence edge without changing the site coordinate', () => {
    const input = linearInput([])
    const outside = { ...site('NmeAIII', 8), cutTop: -11, cutBottom: -13 }
    input.sites = [outside]
    input.labelForSite = (candidate) => `${candidate.enzyme.name} (${candidate.cutTop + 1})`
    const [callout] = layoutLinearEnzymeCalloutsSimple(input)

    expect(callout.anchor.x).toBe(input.trackLeft)
    expect(callout.site.cutTop).toBe(-11)
    expect(callout.label).toContain('-10')
  })
})

describe('layoutLinearEnzymeCalloutsSimple row assignment', () => {
  it('stacks dense sites when Xspan crosses Xlim', () => {
    const input = linearInput([44, 46, 48])
    const callouts = layoutLinearEnzymeCalloutsSimple(input)
    expect(rowIndices(callouts, input)).toEqual([0, 1, 2])
  })

  it('stacks a wide next label when Xspan crosses Xlim', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      ...linearInput([44, 62]),
      labelWidthForSite: (_site, label) => (label === 'E1 (45)' ? 16 : 120),
      labelPaddingForSite: () => 0,
    }
    const rows = rowIndices(layoutLinearEnzymeCalloutsSimple(input), input)

    expect(rows).toEqual([0, 1])
  })

  it('stacks a wide left-half label above a distant high-row prior when Xspan crosses that prior Xlim', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      ...linearInput([44, 46, 48, 80]),
      labelWidthForSite: (site) => (site.cutTop === 81 ? 200 : 66),
      labelPaddingForSite: () => 0,
    }
    const rows = rowIndices(layoutLinearEnzymeCalloutsSimple(input), input)
    expect(rows.slice(0, 3)).toEqual([0, 1, 2])
    expect(rows[3]).toBe(3)
  })

  it('resets to row 1 on the left half when Xspan does not cross any prior Xlim', () => {
    const input = linearInput([44, 400])
    const rows = rowIndices(layoutLinearEnzymeCalloutsSimple(input), input)
    expect(rows).toEqual([0, 0])
  })

  it('resets to row 1 on the left half after a ladder when a distant site does not cross prior limits', () => {
    const input = linearInput([44, 46, 48, 400])
    const rows = rowIndices(layoutLinearEnzymeCalloutsSimple(input), input)
    expect(rows.slice(0, 3)).toEqual([0, 1, 2])
    expect(rows[3]).toBe(0)
  })

  it('stacks a long label above a distant high-row prior, not only the immediate previous row', () => {
    const starts = [858, 813, 786, 583, 555]
    const input: LinearEnzymeCalloutLayoutInput = {
      ...linearInput(starts),
      labelWidthForSite: (site) => (site.cutTop === 556 ? 312 : 66),
      labelPaddingForSite: () => 0,
    }
    const rows = rowIndices(layoutLinearEnzymeCalloutsSimple(input), input)
    expect(rows).toEqual([3, 0, 2, 1, 0])
  })
})

describe('layoutLinearEnzymeCalloutsSimple ladder spread', () => {
  it('forms a ladder at row 3 and keeps later stacked labels in that ladder', () => {
    const input = linearInput([44, 46, 48, 50, 52, 54])
    const rows = rowIndices(layoutLinearEnzymeCalloutsSimple(input), input)
    expect(rows).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('limits outward ladder spread so each label Xspan.2 does not cross outward non-ladder Xlim.2', () => {
    const input = linearInput([44, 400, 402, 404, 406])
    const callouts = layoutLinearEnzymeCalloutsSimple(input)
    const left = leftHalfCallouts(callouts, input.sequenceLength)
    const halfFeature = input.featureHeight! / 2
    const before = left[0]
    const beforeXlim2 = before.anchor.x - halfFeature

    left.slice(1).forEach((callout) => {
      const attach = callout.connectorEnd.x
      const width = callout.box.right - callout.box.left
      const labelXspan2 = attach - width + halfFeature
      expect(labelXspan2).toBeGreaterThanOrEqual(beforeXlim2 - 0.5)
    })
  })

  it('leans row 0 outward by a modest fixed amount and spreads higher rows evenly toward the top site', () => {
    const input = linearInput([44, 46, 48, 50, 52])
    const callouts = layoutLinearEnzymeCalloutsSimple(input)
    const left = leftHalfCallouts(callouts, input.sequenceLength)
    const featureW = input.featureHeight!
    const rowGap = 12 + 6 + 2 + 1
    const baseLabelY = input.strandY! - input.featureStubHeight! - 6 - 1
    const rowOf = (callout: (typeof callouts)[number]) =>
      Math.round((baseLabelY - (callout.box.top + callout.box.bottom) / 2) / rowGap)

    const byRow = left
      .map((callout) => ({
        row: rowOf(callout),
        attach: callout.connectorEnd.x,
        anchor: callout.anchor.x,
        outward: callout.anchor.x - callout.connectorEnd.x,
      }))
      .toSorted((a, b) => a.row - b.row)

    expect(byRow[0]?.row).toBe(0)
    // Row 0 leans out by about ½ feature width — not stacked past the ladder.
    expect(byRow[0]?.outward ?? 0).toBeGreaterThan(0.5)
    expect(byRow[0]?.outward ?? 0).toBeLessThanOrEqual(featureW / 2 + 0.5)

    const top = byRow[byRow.length - 1]
    expect(top?.row).toBeGreaterThan(0)
    // Highest label stays on (or very near) its site; fan runs toward that inward end.
    expect(Math.abs((top?.outward ?? 0))).toBeLessThanOrEqual(0.5)

    // Attach X increases with row (outward → inward), evenly spaced.
    const attaches = byRow.map((item) => item.attach)
    for (let i = 1; i < attaches.length; i += 1) {
      expect(attaches[i]).toBeGreaterThanOrEqual(attaches[i - 1] - 0.5)
    }
    if (byRow.length >= 3) {
      const span = attaches[attaches.length - 1] - attaches[0]
      const step = span / (byRow[byRow.length - 1].row - byRow[0].row)
      for (let i = 1; i < byRow.length - 1; i += 1) {
        const expected = attaches[0] + byRow[i].row * step
        expect(Math.abs(attaches[i] - expected)).toBeLessThanOrEqual(1)
      }
    }

    left.forEach((callout) => {
      expect(callout.connectorEnd.x).toBeLessThanOrEqual(callout.anchor.x + 0.5)
    })
  })

  it('fans a dense ladder prefix so row 1 sits between row 0 outward lean and row 2 site', () => {
    // Long ladder that starts with three close sites: naive global lerp + clamp would leave
    // rows 1 and 2 both vertical on nearly the same X; cap-aware re-spread must separate them.
    const input = linearInput([44, 46, 48, 120, 200, 280, 360])
    const callouts = layoutLinearEnzymeCalloutsSimple(input)
    const left = leftHalfCallouts(callouts, input.sequenceLength)
    const rowGap = 12 + 6 + 2 + 1
    const baseLabelY = input.strandY! - input.featureStubHeight! - 6 - 1
    const rowOf = (callout: (typeof callouts)[number]) =>
      Math.round((baseLabelY - (callout.box.top + callout.box.bottom) / 2) / rowGap)

    const byRow = new Map<number, (typeof callouts)[number]>()
    left.forEach((callout) => {
      byRow.set(rowOf(callout), callout)
    })

    const row0 = byRow.get(0)
    const row1 = byRow.get(1)
    const row2 = byRow.get(2)
    expect(row0 && row1 && row2).toBeTruthy()
    if (!row0 || !row1 || !row2) return

    expect(row0.anchor.x - row0.connectorEnd.x).toBeGreaterThan(0.5)
    expect(row2.anchor.x - row2.connectorEnd.x).toBeLessThanOrEqual(0.5)
    // Row 1 must lean out into the gap — not stack vertically next to row 2.
    expect(row1.anchor.x - row1.connectorEnd.x).toBeGreaterThan(0.5)
    expect(row1.connectorEnd.x).toBeGreaterThan(row0.connectorEnd.x + 0.5)
    expect(row1.connectorEnd.x).toBeLessThan(row2.connectorEnd.x - 0.5)
    const mid = (row0.connectorEnd.x + row2.connectorEnd.x) / 2
    expect(Math.abs(row1.connectorEnd.x - mid)).toBeLessThanOrEqual(1)
  })

  it('spreads dense ladder labels without leaning past site anchors', () => {
    const input = linearInput([44, 46, 48, 50, 52])
    const callouts = layoutLinearEnzymeCalloutsSimple(input)
    const left = leftHalfCallouts(callouts, input.sequenceLength)

    left.forEach((callout) => {
      expect(callout.connectorEnd.x).toBeLessThanOrEqual(callout.anchor.x + 0.5)
    })
  })

  it('keeps labels from leaning inward of their sites when an after-ladder label is wide', () => {
    const input: LinearEnzymeCalloutLayoutInput = {
      ...linearInput([44, 46, 48, 136]),
      labelWidthForSite: (site) => (site.cutTop === 137 ? 220 : 66),
      labelPaddingForSite: () => 0,
    }
    const callouts = layoutLinearEnzymeCalloutsSimple(input)
    const left = leftHalfCallouts(callouts, input.sequenceLength)

    left.forEach((callout) => {
      expect(callout.connectorEnd.x).toBeLessThanOrEqual(callout.anchor.x + 0.5)
    })
  })

  it('does not lean ladder labels inward of their site toward the centerline', () => {
    const input = linearInput([44, 46, 48, 50, 52])
    const callouts = layoutLinearEnzymeCalloutsSimple(input)
    const left = leftHalfCallouts(callouts, input.sequenceLength)

    left.forEach((callout) => {
      // Left half: attach/connector must stay at or outward (≤) of the site.
      expect(callout.connectorEnd.x).toBeLessThanOrEqual(callout.anchor.x + 0.5)
      expect(callout.labelOffsetX ?? 0).toBeLessThanOrEqual(0.5)
    })
  })

  it('does not place ladder attach points past map center or inward of anchors', () => {
    const input = linearInput([430, 432, 434, 466, 468, 470])
    const callouts = layoutLinearEnzymeCalloutsSimple(input)
    const centerX = (input.trackLeft! + input.trackRight!) / 2

    callouts.forEach((callout) => {
      const half = linearCutPosition(callout.site) / input.sequenceLength < 0.5 ? 'left' : 'right'
      if (half === 'left') {
        expect(callout.connectorEnd.x).toBeLessThanOrEqual(centerX + 0.5)
        expect(callout.connectorEnd.x).toBeLessThanOrEqual(callout.anchor.x + 0.5)
      } else {
        expect(callout.connectorEnd.x).toBeGreaterThanOrEqual(centerX - 0.5)
        expect(callout.connectorEnd.x).toBeGreaterThanOrEqual(callout.anchor.x - 0.5)
      }
    })
  })

  it('keeps higher-row attaches inward of row 0 on dense ladders (fan toward top site)', () => {
    const input = linearInput([44, 46, 80, 140])
    const callouts = layoutLinearEnzymeCalloutsSimple(input)
    const left = leftHalfCallouts(callouts, input.sequenceLength)
    const rowGap = 12 + 6 + 2 + 1
    const baseLabelY = input.strandY! - input.featureStubHeight! - 6 - 1
    const rowOf = (callout: (typeof callouts)[number]) =>
      Math.round((baseLabelY - (callout.box.top + callout.box.bottom) / 2) / rowGap)

    left.forEach((callout) => {
      expect(callout.connectorEnd.x).toBeLessThanOrEqual(callout.anchor.x + 0.5)
    })
    const attachByRow = new Map<number, number>()
    left.forEach((callout) => {
      const row = rowOf(callout)
      const prev = attachByRow.get(row)
      if (prev == null || callout.connectorEnd.x < prev) attachByRow.set(row, callout.connectorEnd.x)
    })
    const rows = [...attachByRow.keys()].toSorted((a, b) => a - b)
    for (let i = 1; i < rows.length; i += 1) {
      // Left half: higher row → attach at or inward (larger X) of lower row.
      expect(attachByRow.get(rows[i]) ?? 0).toBeGreaterThanOrEqual((attachByRow.get(rows[i - 1]) ?? 0) - 0.5)
    }
  })

  it('fans a gapped climb after row-0 reset (skips 0,1,2 detector)', () => {
    // First ladder → distant row 0 → follow-on whose Xspan jumps over rows 1–2 via prior history.
    // Old detector required consecutive 0,1,2 and left this second climb unspread (offset 0).
    const input: LinearEnzymeCalloutLayoutInput = {
      ...linearInput([44, 46, 48, 50, 52, 200, 210, 220, 230, 240]),
      labelWidthForSite: (site) => (site.cutTop === 211 ? 250 : 66),
      labelPaddingForSite: () => 0,
    }
    const callouts = layoutLinearEnzymeCalloutsSimple(input)
    const left = leftHalfCallouts(callouts, input.sequenceLength)
    const rows = rowIndices(callouts, input)
    expect(rows.slice(0, 6)).toEqual([0, 1, 2, 3, 4, 0])
    expect(rows[6]).toBeGreaterThan(1)

    const secondClimb = left.slice(5)
    expect(secondClimb.length).toBeGreaterThanOrEqual(3)

    const attachXs = secondClimb.map((c) => Math.round(c.connectorEnd.x * 10) / 10)
    expect(new Set(attachXs).size).toBeGreaterThanOrEqual(3)

    const outward = secondClimb.map((c) => c.anchor.x - c.connectorEnd.x)
    expect(outward[0]).toBeGreaterThan(0.5)
    expect(Math.max(...outward.slice(1))).toBeGreaterThan(1)
    secondClimb.forEach((callout) => {
      expect(callout.connectorEnd.x).toBeLessThanOrEqual(callout.anchor.x + 0.5)
    })
  })

  it('does not pin a wide mid-ladder primer inward of shorter neighbors (no crossed leaders)', () => {
    // Long primer among dense sites: width-based outward blocker used to shove only that
    // label onto its site while shorter neighbors kept the fan — attach order inverted.
    const starts = [44, 46, 48, 120, 130, 140, 150, 160]
    const input: LinearEnzymeCalloutLayoutInput = {
      ...linearInput(starts),
      labelWidthForSite: (site) => (site.cutTop === 141 ? 220 : 50),
      labelPaddingForSite: () => 0,
    }
    const callouts = layoutLinearEnzymeCalloutsSimple(input)
    const left = leftHalfCallouts(callouts, input.sequenceLength)
    const rowGap = 12 + 6 + 2 + 1
    const baseLabelY = input.strandY! - input.featureStubHeight! - 6 - 1
    const rowOf = (callout: (typeof callouts)[number]) =>
      Math.round((baseLabelY - (callout.box.top + callout.box.bottom) / 2) / rowGap)

    const byCut = left.toSorted((a, b) => a.site.cutTop - b.site.cutTop)
    const wide = byCut.find((callout) => callout.site.cutTop === 141)
    expect(wide).toBeTruthy()
    expect(wide!.anchor.x - wide!.connectorEnd.x).toBeGreaterThan(1)

    // Within this single left climb, attach must be non-decreasing with row.
    const byRow = byCut
      .map((callout) => ({
        row: rowOf(callout),
        attach: callout.connectorEnd.x,
      }))
      .toSorted((a, b) => a.row - b.row)
    for (let i = 1; i < byRow.length; i += 1) {
      expect(byRow[i].attach).toBeGreaterThanOrEqual(byRow[i - 1].attach - 0.5)
    }
  })
})
