import type { EnzymeCallout, LinearEnzymeCalloutLayoutInput } from './mapLayout'
import { linearCutPosition } from './mapLayout'
import type { RestrictionSite } from './types'

type Half = 'left' | 'right'
type Item = {
  site: RestrictionSite
  index: number
  label: string
  labelWidth: number
  textHeight: number
  anchorX: number
  anchorY: number
}

const COLLISION_GAP = 1
const LABEL_PADDING = 3

function featureHeight(input: LinearEnzymeCalloutLayoutInput) {
  return input.featureHeight ?? 24
}

function itemForSite(site: RestrictionSite, index: number, input: LinearEnzymeCalloutLayoutInput): Item {
  const label = input.labelForSite ? input.labelForSite(site) : `${site.enzyme.name} (${site.start + 1})`
  const textHeight = input.textHeightForSite ? input.textHeightForSite(site) : (input.textHeight ?? 12)
  const textWidth = input.textWidth ?? 6
  const labelPadding = input.labelPaddingForSite ? input.labelPaddingForSite(site) : (input.labelPadding ?? 6)
  const measuredWidth = input.labelWidthForSite ? input.labelWidthForSite(site, label) : label.length * textWidth
  const span = Math.max(1, input.trackRight - input.trackLeft)
  const cut = Math.max(0, Math.min(input.sequenceLength, linearCutPosition(site)))
  const anchorX = input.trackLeft + (cut / input.sequenceLength) * span
  return {
    site,
    index,
    label,
    labelWidth: measuredWidth + labelPadding,
    textHeight,
    anchorX,
    anchorY: input.strandY ?? input.backboneY ?? 52,
  }
}

function halfForSite(site: RestrictionSite, sequenceLength: number): Half {
  return linearCutPosition(site) / sequenceLength < 0.5 ? 'left' : 'right'
}

/** Outward-side limit from previous site anchor. */
function rowLimitX(prevAnchorX: number, half: Half, featureW: number) {
  return half === 'left' ? prevAnchorX + featureW : prevAnchorX - featureW
}

/** Outward span extent from next site anchor and measured label width. */
function rowSpanX(nextAnchorX: number, labelWidth: number, half: Half) {
  return half === 'left' ? nextAnchorX - labelWidth : nextAnchorX + labelWidth
}

type RowHistoryEntry = {
  index: number
  row: number
  xlim: number
}

/** True when Xspan extends outward past Xlim. */
function spanCrossesLimit(xspan: number, xlim: number, half: Half) {
  return half === 'left' ? xspan < xlim : xspan > xlim
}

/** Priors whose Xlim is crossed by the current label's Xspan (half-aware). */
function priorCrossedBySpan(xspan: number, history: RowHistoryEntry[], half: Half) {
  return history.filter((entry) => spanCrossesLimit(xspan, entry.xlim, half))
}

/** Among crossed priors, the one already on the highest row. */
function exactCrossedLabel(crossed: RowHistoryEntry[]) {
  if (!crossed.length) return undefined
  return crossed.toSorted((a, b) => b.row - a.row)[0]
}

function rowFromSpanCompare(
  xspan: number,
  previousXlim: number,
  previousRow: number,
  history: RowHistoryEntry[],
  half: Half,
) {
  const crossed = priorCrossedBySpan(xspan, history, half)
  const exact = exactCrossedLabel(crossed)
  let row = exact ? exact.row + 1 : 0

  if (spanCrossesLimit(xspan, previousXlim, half)) {
    row = Math.max(row, previousRow + 1)
  }

  return row
}

function sortedHalfItems(items: Item[], half: Half) {
  return half === 'left'
    ? items.toSorted((a, b) => linearCutPosition(a.site) - linearCutPosition(b.site) || a.site.start - b.site.start)
    : items.toSorted((a, b) => linearCutPosition(b.site) - linearCutPosition(a.site) || b.site.start - a.site.start)
}

function baseRowGeometry(input: LinearEnzymeCalloutLayoutInput, items: Item[]) {
  const minTextHeight = items.reduce((min, item) => Math.min(min, item.textHeight), items[0]?.textHeight ?? 12)
  const rowGap = minTextHeight + LABEL_PADDING * 2 + COLLISION_GAP * 2 + 1
  const stubHeight = input.featureStubHeight ?? 18
  const rowLift = input.labelRowLift ?? 0
  let baseLabelY =
    (input.strandY ?? input.backboneY ?? 52) - stubHeight - minTextHeight / 2 - COLLISION_GAP - rowLift
  if (input.labelCeilingY != null) {
    const maxCenterY = input.labelCeilingY - COLLISION_GAP - minTextHeight / 2
    baseLabelY = Math.min(baseLabelY, maxCenterY)
  }
  return { rowGap, baseLabelY, stubHeight }
}

/**
 * Right half: Xlim = Xprev − fw, Xspan = Xnext + width.
 * Left half mirror: Xlim = Xprev + fw, Xspan = Xnext − width.
 * Among all prior labels whose Xlim is crossed by Xspan, take the highest row and place one row above.
 * If Xspan also crosses the immediate previous Xlim, floor at previous row + 1.
 */
function rowAssignForHalf(ordered: Item[], half: Half, input: LinearEnzymeCalloutLayoutInput) {
  const rows = new Map<number, number>()
  const featureW = featureHeight(input)
  const history: RowHistoryEntry[] = []
  let previousItem: Item | undefined
  let previousRow = 0

  ordered.forEach((item, orderIndex) => {
    if (orderIndex === 0 || previousItem == null) {
      rows.set(item.index, 0)
      history.push({
        index: item.index,
        row: 0,
        xlim: rowLimitX(item.anchorX, half, featureW),
      })
      previousItem = item
      previousRow = 0
      input.debugLog?.({
        event: 'row_assign',
        half,
        orderIndex,
        enzyme: item.site.enzyme.name,
        cutTop: linearCutPosition(item.site),
        row: 0,
        reason: 'first_in_half',
      })
      return
    }

    const previousXlim = rowLimitX(previousItem.anchorX, half, featureW)
    const xspan = rowSpanX(item.anchorX, item.labelWidth, half)
    const crossed = priorCrossedBySpan(xspan, history, half)
    const exact = exactCrossedLabel(crossed)
    const row = rowFromSpanCompare(xspan, previousXlim, previousRow, history, half)

    rows.set(item.index, row)
    input.debugLog?.({
      event: 'row_assign',
      half,
      orderIndex,
      enzyme: item.site.enzyme.name,
      cutTop: linearCutPosition(item.site),
      xPrev: Number(previousItem.anchorX.toFixed(2)),
      xNext: Number(item.anchorX.toFixed(2)),
      labelWidth: Number(item.labelWidth.toFixed(2)),
      previousXlim: Number(previousXlim.toFixed(2)),
      xspan: Number(xspan.toFixed(2)),
      featureWidth: featureW,
      crossesImmediate: spanCrossesLimit(xspan, previousXlim, half),
      crossedHistoryCount: crossed.length,
      exactCrossedIndex: exact?.index,
      exactCrossedXlim: exact ? Number(exact.xlim.toFixed(2)) : undefined,
      exactCrossedRow: exact?.row,
      row,
    })

    history.push({
      index: item.index,
      row,
      xlim: rowLimitX(item.anchorX, half, featureW),
    })
    previousItem = item
    previousRow = row
  })

  return rows
}

/** Xlim.2 — site before ladder ± ½ feature width outward (mirrors Xlim, half width). */
function ladderXlim2(anchorX: number, half: Half, halfFeature: number) {
  return half === 'left' ? anchorX - halfFeature : anchorX + halfFeature
}

/** Xspan.2 — inward end of spread zone; label width only used when an after-ladder site exists. */
function ladderXspan2(
  after: Item | undefined,
  lastInLadder: Item,
  half: Half,
  halfFeature: number,
  xlim2: number,
) {
  const fromLast =
    half === 'left'
      ? lastInLadder.anchorX + halfFeature
      : lastInLadder.anchorX - halfFeature

  if (!after) return fromLast

  const fromAfter =
    half === 'left'
      ? after.anchorX - after.labelWidth + halfFeature
      : after.anchorX + after.labelWidth - halfFeature

  // Wide after-ladder labels can place Xspan.2 outward of Xlim.2; ignore that and fall back.
  if (half === 'left') {
    return fromAfter >= xlim2 ? fromAfter : Math.max(fromLast, xlim2)
  }
  return fromAfter <= xlim2 ? fromAfter : Math.min(fromLast, xlim2)
}

function normalizeLadderZone(xlim2: number, xspan2: number, half: Half) {
  if (half === 'left') {
    return { outwardX: Math.min(xlim2, xspan2), inwardX: Math.max(xlim2, xspan2) }
  }
  return { outwardX: Math.max(xlim2, xspan2), inwardX: Math.min(xlim2, xspan2) }
}

function firstLadderOutwardMin(anchorX: number, half: Half, featureW: number) {
  return half === 'left' ? anchorX - featureW : anchorX + featureW
}

type OutwardBlockerLimits = {
  ladder: Item[]
  half: Half
  halfFeature: number
  featureW: number
  /** Outward edge of the ladder spread zone (Xlim.2 side). */
  zoneOutwardX: number
  /** Tightest Xlim.2 among outward non-ladder labels; undefined at the half edge. */
  blockerXlim2?: number
}

/**
 * Outward-safe attach floor for the ladder’s outermost member only.
 * Width-based blocker floors must not run on interior rungs: a long primer mid-ladder
 * would get shoved onto its site while shorter neighbors keep the fan, inverting attach
 * order and crossing leaders.
 */
function outwardAttachFloor(index: number, limits: OutwardBlockerLimits) {
  const { ladder, half, halfFeature, featureW, zoneOutwardX, blockerXlim2 } = limits
  if (index !== 0) {
    return half === 'left' ? -Infinity : Infinity
  }

  const item = ladder[0]
  let floor = firstLadderOutwardMin(ladder[0].anchorX, half, featureW)
  floor = half === 'left' ? Math.max(floor, zoneOutwardX) : Math.min(floor, zoneOutwardX)

  if (blockerXlim2 !== undefined) {
    const blockerFloor =
      half === 'left'
        ? blockerXlim2 + item.labelWidth - halfFeature
        : blockerXlim2 - item.labelWidth + halfFeature
    floor = half === 'left' ? Math.max(floor, blockerFloor) : Math.min(floor, blockerFloor)
  }

  return floor
}

function clampOutwardBlockerLimits(attach: number[], limits: OutwardBlockerLimits) {
  for (let i = 0; i < limits.ladder.length; i += 1) {
    const floor = outwardAttachFloor(i, limits)
    if (limits.half === 'left') {
      attach[i] = Math.max(attach[i], floor)
    } else {
      attach[i] = Math.min(attach[i], floor)
    }
  }
}

/** Keep fan order: higher ranks sit at or inward of lower ranks (no crossed leaders). */
function enforceRankMonotonicAttach(
  attach: number[],
  ladder: Item[],
  rowIndices: number[],
  half: Half,
) {
  const ranks = denseLadderRanks(rowIndices)
  const byRank = ranks
    .map((rank, index) => ({ rank, index }))
    .toSorted((a, b) => a.rank - b.rank || a.index - b.index)

  for (let i = 1; i < byRank.length; i += 1) {
    const prev = byRank[i - 1].index
    const cur = byRank[i].index
    if (half === 'left') {
      if (attach[cur] < attach[prev]) attach[cur] = attach[prev]
      attach[cur] = Math.min(attach[cur], ladder[cur].anchorX)
    } else {
      if (attach[cur] > attach[prev]) attach[cur] = attach[prev]
      attach[cur] = Math.max(attach[cur], ladder[cur].anchorX)
    }
  }
}

function tightestOutwardBlockerXlim2(ordered: Item[], ladderStart: number, half: Half, halfFeature: number) {
  if (ladderStart <= 0) return undefined
  const xlim2s = ordered.slice(0, ladderStart).map((item) => ladderXlim2(item.anchorX, half, halfFeature))
  return half === 'left' ? Math.max(...xlim2s) : Math.min(...xlim2s)
}

function mapCenterX(input: LinearEnzymeCalloutLayoutInput) {
  return (input.trackLeft + input.trackRight) / 2
}

/** Never lean attach past the site toward the map centerline — bound is the anchor itself. */
function inwardAttachBound(
  anchorX: number,
  _rowIndex: number,
  _half: Half,
  _featureW: number,
  _centerX: number,
) {
  void _rowIndex
  void _half
  void _featureW
  void _centerX
  return anchorX
}

type InwardLimits = {
  ladder: Item[]
  rowIndices: number[]
  half: Half
  featureW: number
  centerX: number
}

function clampLadderInwardLimits(attach: number[], limits: InwardLimits) {
  for (let i = 0; i < limits.ladder.length; i += 1) {
    const bound = inwardAttachBound(
      limits.ladder[i].anchorX,
      limits.rowIndices[i],
      limits.half,
      limits.featureW,
      limits.centerX,
    )
    if (limits.half === 'left') {
      attach[i] = Math.min(attach[i], bound)
    } else {
      attach[i] = Math.max(attach[i], bound)
    }
  }
}

/** Hard rule: attach may fan outward, never inward of its own site toward centerline. */
function clampAttachNotInwardOfAnchor(attach: number[], ladder: Item[], half: Half) {
  for (let i = 0; i < ladder.length; i += 1) {
    if (half === 'left') {
      attach[i] = Math.min(attach[i], ladder[i].anchorX)
    } else {
      attach[i] = Math.max(attach[i], ladder[i].anchorX)
    }
  }
}

/**
 * Evenly space row attaches between x0 (row r0) and x1 (row r1) in leftish coordinates
 * (outward = smaller X). Each row has an upper cap (site anchor). When a cap binds
 * before the uniform fan reaches it, split there and re-spread each side — so a dense
 * prefix (row0 outward, row2 stuck on its site) still places row1 between them instead
 * of clamping row1 onto a vertical stack with row2.
 */
function placeEvenWithUpperCaps(
  posByRow: Map<number, number>,
  capByRow: Map<number, number>,
  r0: number,
  r1: number,
  x0: number,
  x1: number,
) {
  const cap0 = capByRow.get(r0) ?? x0
  const cap1 = capByRow.get(r1) ?? x1
  const xStart = Math.min(x0, cap0)
  const xEnd = Math.max(Math.min(x1, cap1), xStart)
  posByRow.set(r0, xStart)
  posByRow.set(r1, xEnd)
  if (r1 - r0 <= 1) return

  const rowSpan = r1 - r0
  const uniformStep = (xEnd - xStart) / rowSpan

  let bindRow: number | null = null
  let bindSlope = uniformStep
  for (let r = r0 + 1; r < r1; r += 1) {
    const cap = capByRow.get(r)
    if (cap == null) continue
    const slope = (cap - xStart) / (r - r0)
    if (slope < bindSlope - 1e-9) {
      bindSlope = slope
      bindRow = r
    }
  }

  if (bindRow == null) {
    for (let r = r0; r <= r1; r += 1) {
      posByRow.set(r, xStart + (r - r0) * uniformStep)
    }
    return
  }

  const bindX = Math.min(capByRow.get(bindRow) ?? xEnd, xEnd)
  const bindAttach = Math.max(bindX, xStart)
  posByRow.set(bindRow, bindAttach)
  placeEvenWithUpperCaps(posByRow, capByRow, r0, bindRow, xStart, bindAttach)
  placeEvenWithUpperCaps(posByRow, capByRow, bindRow, r1, bindAttach, xEnd)
}

/**
 * Map absolute row numbers onto dense ranks 0..n-1 so a gapped climb
 * (e.g. 0,4,5,6 after an uncleared prior ladder) still fans evenly across members.
 */
function denseLadderRanks(rowIndices: number[]) {
  const order = rowIndices
    .map((row, index) => ({ row, index }))
    .toSorted((a, b) => a.row - b.row || a.index - b.index)
  const ranks = new Array<number>(rowIndices.length)
  order.forEach((entry, rank) => {
    ranks[entry.index] = rank
  })
  return ranks
}

/**
 * Spread ladder labels by row:
 * - Row 0 leans outward by a fixed modest amount (½ feature width).
 * - Higher rows fan evenly toward the highest label’s site.
 * - Site caps are applied with split-and-respread so dense early rungs still separate
 *   (no pair of near-vertical leaders stacked on top of each other).
 * - No label may move inward of its own site toward the centerline.
 * - Gapped absolute rows are remapped to dense ranks so the fan stays even.
 */
function spreadLadderByRow(
  attach: number[],
  ladder: Item[],
  rowIndices: number[],
  half: Half,
  featureW: number,
  xlim2: number,
  xspan2: number,
) {
  const count = ladder.length
  if (count <= 0) return

  const { outwardX } = normalizeLadderZone(xlim2, xspan2, half)
  const ranks = denseLadderRanks(rowIndices)
  const maxRank = ranks.reduce((max, rank) => Math.max(max, rank), 0)
  if (maxRank <= 0) {
    for (let i = 0; i < count; i += 1) attach[i] = ladder[i].anchorX
    return
  }

  let row0Index = 0
  let highIndex = 0
  for (let i = 0; i < count; i += 1) {
    if (ranks[i] === 0) row0Index = i
    if (ranks[i] >= ranks[highIndex]) highIndex = i
  }

  const fixedOut = featureW / 2
  let row0Attach =
    half === 'left' ? ladder[row0Index].anchorX - fixedOut : ladder[row0Index].anchorX + fixedOut
  if (half === 'left') {
    row0Attach = Math.max(row0Attach, outwardX, firstLadderOutwardMin(ladder[0].anchorX, half, featureW))
    row0Attach = Math.min(row0Attach, ladder[row0Index].anchorX)
  } else {
    row0Attach = Math.min(row0Attach, outwardX, firstLadderOutwardMin(ladder[0].anchorX, half, featureW))
    row0Attach = Math.max(row0Attach, ladder[row0Index].anchorX)
  }

  let highAttach = ladder[highIndex].anchorX
  if (half === 'left') {
    highAttach = Math.max(highAttach, row0Attach)
  } else {
    highAttach = Math.min(highAttach, row0Attach)
  }

  // Work in leftish coords (outward = smaller) so left/right share the cap solver.
  const toL = (x: number) => (half === 'left' ? x : -x)
  const fromL = (x: number) => (half === 'left' ? x : -x)
  const capByRank = new Map<number, number>()
  for (let i = 0; i < count; i += 1) {
    capByRank.set(ranks[i], toL(ladder[i].anchorX))
  }

  const posByRank = new Map<number, number>()
  placeEvenWithUpperCaps(posByRank, capByRank, 0, maxRank, toL(row0Attach), toL(highAttach))

  for (let i = 0; i < count; i += 1) {
    const pos = posByRank.get(ranks[i])
    attach[i] = pos == null ? ladder[i].anchorX : fromL(pos)
  }
  clampAttachNotInwardOfAnchor(attach, ladder, half)
}

function spreadLadder(
  attach: number[],
  ladder: Item[],
  ladderRows: number[],
  half: Half,
  featureW: number,
  xlim2: number,
  xspan2: number,
  centerX: number,
  outwardBlockerXlim2: number | undefined,
) {
  if (ladder.length < 2) return

  const halfFeature = featureW / 2
  const { outwardX } = normalizeLadderZone(xlim2, xspan2, half)
  const inwardLimits: InwardLimits = { ladder, rowIndices: ladderRows, half, featureW, centerX }
  const outwardLimits: OutwardBlockerLimits = {
    ladder,
    half,
    halfFeature,
    featureW,
    zoneOutwardX: outwardX,
    blockerXlim2: outwardBlockerXlim2,
  }

  spreadLadderByRow(attach, ladder, ladderRows, half, featureW, xlim2, xspan2)
  clampOutwardBlockerLimits(attach, outwardLimits)
  clampLadderInwardLimits(attach, inwardLimits)
  clampAttachNotInwardOfAnchor(attach, ladder, half)
  enforceRankMonotonicAttach(attach, ladder, ladderRows, half)
}

function spreadLadders(
  ordered: Item[],
  rows: Map<number, number>,
  half: Half,
  input: LinearEnzymeCalloutLayoutInput,
  attachByIndex: Map<number, number>,
) {
  const halfFeature = featureHeight(input) / 2
  const featureW = featureHeight(input)
  const rowAt = (i: number) => rows.get(ordered[i].index) ?? 0

  // Any row-0 restart that climbs before the next row 0 is a ladder — including gapped
  // climbs like 0,4,5,… when uncleared prior history skips rows 1–2.
  let i = 0
  while (i < ordered.length) {
    if (rowAt(i) !== 0) {
      i += 1
      continue
    }

    let ladderEnd = i
    while (ladderEnd + 1 < ordered.length && rowAt(ladderEnd + 1) !== 0) {
      ladderEnd += 1
    }

    const ladderRows = []
    for (let j = i; j <= ladderEnd; j += 1) ladderRows.push(rowAt(j))
    const climbs = ladderEnd > i && ladderRows.some((row) => row > 0)
    if (!climbs) {
      i = ladderEnd + 1
      continue
    }

    const ladderStart = i
    const before = ordered[ladderStart - 1]
    const after = ordered[ladderEnd + 1]
    const ladder = ordered.slice(ladderStart, ladderEnd + 1)
    const xlim2 = ladderXlim2(before?.anchorX ?? ladder[0].anchorX, half, halfFeature)
    const xspan2 = ladderXspan2(after, ladder[ladder.length - 1], half, halfFeature, xlim2)
    const outwardBlockerXlim2 = tightestOutwardBlockerXlim2(ordered, ladderStart, half, halfFeature)
    const attach = ladder.map((item) => item.anchorX)
    spreadLadder(attach, ladder, ladderRows, half, featureW, xlim2, xspan2, mapCenterX(input), outwardBlockerXlim2)

    ladder.forEach((item, ladderIndex) => {
      attachByIndex.set(item.index, attach[ladderIndex])
    })

    i = ladderEnd + 1
  }
}

function buildCallout(
  item: Item,
  rowIndex: number,
  attachX: number,
  _input: LinearEnzymeCalloutLayoutInput,
  half: Half,
  rowGap: number,
  baseLabelY: number,
  stubHeight: number,
): EnzymeCallout {
  const labelY = baseLabelY - rowIndex * rowGap
  const box =
    half === 'left'
      ? {
          right: attachX,
          left: attachX - item.labelWidth,
          top: labelY - item.textHeight / 2,
          bottom: labelY + item.textHeight / 2,
        }
      : {
          left: attachX,
          right: attachX + item.labelWidth,
          top: labelY - item.textHeight / 2,
          bottom: labelY + item.textHeight / 2,
        }
  const anchor = { x: item.anchorX, y: item.anchorY }
  const elbow = { x: item.anchorX, y: item.anchorY - stubHeight }
  const connectorEnd =
    half === 'left' ? { x: box.right, y: box.bottom } : { x: box.left, y: box.bottom }
  const riseEnd = { x: item.anchorX, y: connectorEnd.y }

  return {
    site: item.site,
    index: item.index,
    anchor,
    elbow,
    connectorEnd,
    x: box.left,
    y: labelY,
    label: item.label,
    textAnchor: 'start',
    box,
    segments: [
      [anchor, elbow],
      [elbow, riseEnd],
      [riseEnd, connectorEnd],
    ],
    labelOffsetX: attachX - item.anchorX,
  }
}

export function layoutLinearEnzymeCalloutsSimple(input: LinearEnzymeCalloutLayoutInput): EnzymeCallout[] {
  const items = input.sites.map((site, index) => itemForSite(site, index, input))
  if (!items.length) return []

  const { rowGap, baseLabelY, stubHeight } = baseRowGeometry(input, items)
  const layout: Array<EnzymeCallout | undefined> = []

  for (const half of ['left', 'right'] as const) {
    const group = items.filter((item) => halfForSite(item.site, input.sequenceLength) === half)
    const ordered = sortedHalfItems(group, half)
    if (!ordered.length) continue

    const rows = rowAssignForHalf(ordered, half, input)
    const attachByIndex = new Map<number, number>(ordered.map((item) => [item.index, item.anchorX]))

    spreadLadders(ordered, rows, half, input, attachByIndex)

    for (const item of ordered) {
      const rowIndex = rows.get(item.index) ?? 0
      const attachX = attachByIndex.get(item.index) ?? item.anchorX
      layout[item.index] = buildCallout(item, rowIndex, attachX, input, half, rowGap, baseLabelY, stubHeight)
    }
  }

  return layout.filter((callout): callout is EnzymeCallout => Boolean(callout))
}
