import { linearCutPosition } from './mapLayout'
import type { Box, Point } from './mapLayout'
import type { RestrictionSite } from './types'

export type SequenceLabelSide = 'above' | 'below'
export type SequenceLabelHalf = 'left' | 'right'

export type SequenceLabelCallout = {
  site: RestrictionSite
  index: number
  label: string
  side: SequenceLabelSide
  half: SequenceLabelHalf
  textAnchor: 'start' | 'end'
  cutPosition: number
  /** Row within the routed lane (0 = closest to sequence). */
  laneRow: number
  /** Shared leader group for co-cut stacks. */
  stackId: string
  stackIndex: number
  stackSize: number
  /** Only the bottom stack label draws the leader. */
  isStackLeader: boolean
  anchorX: number
  anchorY: number
  labelX: number
  labelY: number
  box: Box
  /** Symmetric padding around measured label text (for hover frame). */
  frameBox: Box
  segments: [Point, Point][]
}

export type SequenceRowLabelLayout = {
  rowIndex: number
  rowStart: number
  rowLength: number
  trackLeft: number
  trackRight: number
  enzymeCallouts: SequenceLabelCallout[]
  primerCallouts: SequenceLabelCallout[]
  enzymeLaneRows: number
  primerLaneRows: number
}

export type SequenceRowSegment = {
  rowStart: number
  rowLength: number
}

export type SequencePrimerClearanceSpan = {
  left: number
  right: number
  /** Legacy: number of primer lanes stacked here (multiplied by forwardPrimerClearanceRows). */
  rows?: number
  /**
   * Actual vertical extent (px) the primer stack occupies above the sequence at this span.
   * When set, the enzyme push is derived from this real height (converted to enzyme lane rows),
   * so compact primers no longer reserve the maximum primer height. Takes precedence over `rows`.
   */
  heightPx?: number
}

export type SequenceLabelRouterInput = {
  enzymeSites: RestrictionSite[]
  primerSites: RestrictionSite[]
  sequenceLength: number
  basesPerRow: number
  /** When set (Sequence tab), route each visual row using these exact bounds instead of recomputing from basesPerRow. */
  rowSegments?: ReadonlyArray<SequenceRowSegment>
  baseStepPx: number
  /** Distance from row-content left edge to the first base column. */
  trackInsetPx?: number
  /** Minimum horizontal clearance between label anchors (px). */
  collisionUnitPx?: number
  /** Forward-primer spans (px within row) that enzyme labels must clear above. */
  forwardPrimerClearanceSpans?: ReadonlyArray<SequencePrimerClearanceSpan>
  /** Extra lane rows reserved above enzymes for forward primer frames. */
  forwardPrimerClearanceRows?: number
  leaderStubPx?: number
  labelForSite?: (site: RestrictionSite) => string
  textHeight?: number
  textWidth?: number
  labelPadding?: number
  labelWidthForSite?: (site: RestrictionSite, label: string) => number
  textHeightForSite?: (site: RestrictionSite) => number
  labelPaddingForSite?: (site: RestrictionSite) => number
}

type Half = SequenceLabelHalf

const PRIMARY_HALF: Half = 'left'
const FOLDED_HALF: Half = 'right'

type Item = {
  site: RestrictionSite
  index: number
  label: string
  labelWidth: number
  textWidth: number
  textHeight: number
  cutPosition: number
  anchorX: number
}

type CutStackUnit = {
  stackId: string
  cutPosition: number
  anchorX: number
  labelWidth: number
  stackSize: number
  items: Item[]
}

const COLLISION_GAP = 1
const LABEL_PADDING = 3

function featureWidth(input: SequenceLabelRouterInput) {
  return input.collisionUnitPx ?? 48
}

function itemForSite(
  site: RestrictionSite,
  index: number,
  rowStart: number,
  rowLength: number,
  input: SequenceLabelRouterInput,
): Item | null {
  const cutPosition = linearCutPosition(site)
  const rowEnd = rowStart + rowLength
  const isBeforeSequence = cutPosition < 0 && rowStart === 0
  const isAfterSequence = cutPosition > input.sequenceLength && rowEnd === input.sequenceLength
  if (cutPosition < rowStart && !isBeforeSequence) return null
  if (cutPosition > rowEnd && !isAfterSequence) return null
  const displayCutPosition = Math.max(rowStart, Math.min(rowEnd, cutPosition))

  const label = input.labelForSite ? input.labelForSite(site) : site.enzyme.name
  const textHeight = input.textHeightForSite ? input.textHeightForSite(site) : (input.textHeight ?? 12)
  const textWidth = input.textWidth ?? 6
  const labelPadding = input.labelPaddingForSite ? input.labelPaddingForSite(site) : (input.labelPadding ?? 6)
  const measuredWidth = input.labelWidthForSite ? input.labelWidthForSite(site, label) : label.length * textWidth
  const trackInset = input.trackInsetPx ?? 28
  const anchorX = trackInset + (displayCutPosition - rowStart) * input.baseStepPx

  return {
    site,
    index,
    label,
    textWidth: measuredWidth,
    labelWidth: measuredWidth + labelPadding,
    textHeight,
    cutPosition: displayCutPosition,
    anchorX,
  }
}

function stackTopRow(baseRow: number, stackSize: number) {
  return baseRow + stackSize - 1
}

/** Left-half row rule: outward limit from previous anchor. */
function rowLimitX(prevAnchorX: number, featureW: number) {
  return prevAnchorX + featureW
}

/** Left-half row rule: inward span edge from current anchor. */
function rowSpanX(nextAnchorX: number, labelWidth: number) {
  return nextAnchorX - labelWidth
}

type RowHistoryEntry = {
  index: number
  row: number
  xlim: number
}

function spanCrossesLimit(xspan: number, xlim: number) {
  return xspan < xlim
}

function priorCrossedBySpan(xspan: number, history: RowHistoryEntry[]) {
  return history.filter((entry) => spanCrossesLimit(xspan, entry.xlim))
}

function exactCrossedLabel(crossed: RowHistoryEntry[]) {
  if (!crossed.length) return undefined
  return crossed.toSorted((a, b) => b.row - a.row)[0]
}

function rowFromSpanCompare(
  xspan: number,
  previousXlim: number,
  previousTopRow: number,
  history: RowHistoryEntry[],
) {
  const crossed = priorCrossedBySpan(xspan, history)
  const exact = exactCrossedLabel(crossed)
  let row = exact ? exact.row + 1 : 0

  if (spanCrossesLimit(xspan, previousXlim)) {
    row = Math.max(row, previousTopRow + 1)
  }

  return row
}

type XSpan = { start: number; end: number }

function labelSpan(anchorX: number, labelWidth: number, half: Half): XSpan {
  if (half === 'left') return { start: anchorX - labelWidth, end: anchorX }
  return { start: anchorX, end: anchorX + labelWidth }
}

function spansOverlap(a: XSpan, b: XSpan) {
  return a.start < b.end && b.start < a.end
}

/** Folded label may extend into the row/track margin by this much beyond the leader or row-end anchor. */
function foldClearanceLimit(nextLeaderX: number, featureW: number, foldMarginPx: number) {
  return nextLeaderX + foldMarginPx - featureW
}

/** Folded label must clear the next stack's leader anchor (plus row margin slack). */
function fitsBeforeNextLeader(
  anchorX: number,
  labelWidth: number,
  half: Half,
  nextLeaderX: number,
  featureW: number,
  foldMarginPx: number,
) {
  const span = labelSpan(anchorX, labelWidth, half)
  return span.end <= foldClearanceLimit(nextLeaderX, featureW, foldMarginPx)
}

type StackAssignment = {
  baseRow: number
  half: Half
}

function sortedSweepUnits(units: CutStackUnit[]) {
  return units.toSorted((a, b) => a.cutPosition - b.cutPosition || (a.stackId < b.stackId ? -1 : a.stackId > b.stackId ? 1 : 0))
}

type OccupiedSpan = { span: XSpan; half: Half }

function addOccupiedSpan(
  occupiedByRow: Map<number, OccupiedSpan[]>,
  row: number,
  span: XSpan,
  half: Half,
) {
  const occupied = occupiedByRow.get(row) ?? []
  occupiedByRow.set(row, [...occupied, { span, half }])
}

function stackOccupiedRows(baseRow: number, stackSize: number) {
  const rows: number[] = []
  for (let row = baseRow; row <= stackTopRow(baseRow, stackSize); row += 1) {
    rows.push(row)
  }
  return rows
}

function addStackOccupiedSpan(
  occupiedByRow: Map<number, OccupiedSpan[]>,
  baseRow: number,
  stackSize: number,
  span: XSpan,
  half: Half,
) {
  stackOccupiedRows(baseRow, stackSize).forEach((row) => addOccupiedSpan(occupiedByRow, row, span, half))
}

function stackSpanFits(
  occupiedByRow: Map<number, OccupiedSpan[]>,
  baseRow: number,
  stackSize: number,
  span: XSpan,
  half: Half,
) {
  return stackOccupiedRows(baseRow, stackSize).every((row) => {
    const occupied = occupiedByRow.get(row) ?? []
    return !occupied.some((entry) => entry.half === half && spansOverlap(entry.span, span))
  })
}

function assignmentSpan(unit: CutStackUnit, assignment: StackAssignment): XSpan {
  return labelSpan(unit.anchorX, unit.labelWidth, assignment.half)
}

function buildOccupiedByRow(
  ordered: CutStackUnit[],
  assignments: Map<string, StackAssignment>,
  excludeStackIds: Set<string> = new Set(),
  throughIndex: number = ordered.length - 1,
  halfFilter?: Half,
) {
  const occupiedByRow = new Map<number, OccupiedSpan[]>()
  ordered.forEach((unit, orderIndex) => {
    if (orderIndex > throughIndex) return
    if (excludeStackIds.has(unit.stackId)) return
    const assignment = assignments.get(unit.stackId)
    if (!assignment) return
    if (halfFilter && assignment.half !== halfFilter) return
    addStackOccupiedSpan(
      occupiedByRow,
      assignment.baseRow,
      unit.stackSize,
      assignmentSpan(unit, assignment),
      assignment.half,
    )
  })
  return occupiedByRow
}

function spanCrossesLeader(span: XSpan, leaderX: number) {
  return span.start < leaderX && leaderX < span.end
}

function rowRangesOverlap(aBase: number, aSize: number, bBase: number, bSize: number) {
  return aBase <= stackTopRow(bBase, bSize) && bBase <= stackTopRow(aBase, aSize)
}

/** Next ladder foot and cluster followers stay on the left slope only. */
function resolveLeftPlacement(
  unit: CutStackUnit,
  startRow: number,
  occupiedByRow: Map<number, OccupiedSpan[]>,
): StackAssignment {
  for (let row = startRow; row < startRow + 12; row += 1) {
    const span = labelSpan(unit.anchorX, unit.labelWidth, PRIMARY_HALF)
    if (stackSpanFits(occupiedByRow, row, unit.stackSize, span, PRIMARY_HALF)) {
      return { baseRow: row, half: PRIMARY_HALF }
    }
  }
  return { baseRow: startRow, half: PRIMARY_HALF }
}

function rowAssignForSweep(ordered: CutStackUnit[], featureW: number): Map<string, StackAssignment> {
  const assignments = new Map<string, StackAssignment>()
  const history: RowHistoryEntry[] = []
  let previousUnit: CutStackUnit | undefined
  let previousBaseRow = 0

  ordered.forEach((unit, orderIndex) => {
    if (orderIndex === 0 || previousUnit == null) {
      assignments.set(unit.stackId, { baseRow: 0, half: PRIMARY_HALF })
      history.push({
        index: orderIndex,
        row: stackTopRow(0, unit.stackSize),
        xlim: rowLimitX(unit.anchorX, featureW),
      })
      previousUnit = unit
      previousBaseRow = 0
      return
    }

    const previousTopRow = stackTopRow(previousBaseRow, previousUnit.stackSize)
    const previousXlim = rowLimitX(previousUnit.anchorX, featureW)
    const xspan = rowSpanX(unit.anchorX, unit.labelWidth)
    const baseRow = rowFromSpanCompare(xspan, previousXlim, previousTopRow, history)

    assignments.set(unit.stackId, { baseRow, half: PRIMARY_HALF })
    history.push({
      index: orderIndex,
      row: stackTopRow(baseRow, unit.stackSize),
      xlim: rowLimitX(unit.anchorX, featureW),
    })
    previousUnit = unit
    previousBaseRow = baseRow
  })

  return assignments
}

function hasRealClimb(climb: CutStackUnit[], initial: Map<string, StackAssignment>) {
  if (climb.length < 2) return false
  return climb.some((unit) => (initial.get(unit.stackId)?.baseRow ?? 0) >= 2)
}

function hasRowEndClimb(climb: CutStackUnit[], initial: Map<string, StackAssignment>) {
  return climb.some((unit) => (initial.get(unit.stackId)?.baseRow ?? 0) >= 2)
}

function lowestLowerFoldRow(
  unit: CutStackUnit,
  original: StackAssignment,
  occupiedByRow: Map<number, OccupiedSpan[]>,
  minRow: number,
  maxFoldedTopRow: number,
) {
  const originalTop = stackTopRow(original.baseRow, unit.stackSize)
  const maxTop = Math.min(originalTop - 1, maxFoldedTopRow)
  for (let row = minRow; stackTopRow(row, unit.stackSize) <= maxTop; row += 1) {
    const span = labelSpan(unit.anchorX, unit.labelWidth, FOLDED_HALF)
    if (stackSpanFits(occupiedByRow, row, unit.stackSize, span, FOLDED_HALF)) return row
  }
  return undefined
}

function opposingPlacementsConflict(
  rightUnit: CutStackUnit,
  rightRow: number,
  leftUnit: CutStackUnit,
  leftRow: number,
) {
  if (!rowRangesOverlap(rightRow, rightUnit.stackSize, leftRow, leftUnit.stackSize)) return false

  const rightSpan = labelSpan(rightUnit.anchorX, rightUnit.labelWidth, FOLDED_HALF)
  const leftSpan = labelSpan(leftUnit.anchorX, leftUnit.labelWidth, PRIMARY_HALF)
  return (
    spansOverlap(rightSpan, leftSpan) ||
    spanCrossesLeader(leftSpan, rightUnit.anchorX) ||
    spanCrossesLeader(rightSpan, leftUnit.anchorX)
  )
}

function canFoldAtRow(
  unit: CutStackUnit,
  row: number,
  assignments: Map<string, StackAssignment>,
  occupiedByRow: Map<number, OccupiedSpan[]>,
) {
  const original = assignments.get(unit.stackId)
  if (!original) return false
  if (!foldCanStillImprove(unit, row, original)) return false

  const span = labelSpan(unit.anchorX, unit.labelWidth, FOLDED_HALF)
  return stackSpanFits(occupiedByRow, row, unit.stackSize, span, FOLDED_HALF)
}

function foldCanStillImprove(unit: CutStackUnit, row: number, original: StackAssignment) {
  return stackTopRow(row, unit.stackSize) < stackTopRow(original.baseRow, unit.stackSize)
}

function canPlaceForwardAtRow(
  unit: CutStackUnit,
  row: number,
  occupiedByRow: Map<number, OccupiedSpan[]>,
) {
  const span = labelSpan(unit.anchorX, unit.labelWidth, PRIMARY_HALF)
  return stackSpanFits(occupiedByRow, row, unit.stackSize, span, PRIMARY_HALF)
}

function placeStack(
  unit: CutStackUnit,
  row: number,
  half: Half,
  assignments: Map<string, StackAssignment>,
  occupiedByRow: Map<number, OccupiedSpan[]>,
) {
  assignments.set(unit.stackId, { baseRow: row, half })
  addStackOccupiedSpan(occupiedByRow, row, unit.stackSize, labelSpan(unit.anchorX, unit.labelWidth, half), half)
}

function placeFoldAndForwardCompetition(
  climb: CutStackUnit[],
  forward: CutStackUnit[],
  assignments: Map<string, StackAssignment>,
  leftOccupiedByRow: Map<number, OccupiedSpan[]>,
  rightOccupiedByRow: Map<number, OccupiedSpan[]>,
): boolean {
  const reverse = climb.filter((unit) => assignments.get(unit.stackId)?.half === PRIMARY_HALF).toReversed()
  if (!reverse.length) return false

  let reverseIndex = 0
  let forwardIndex = 0
  let row = 0
  let lastWinner: 'fold' | 'forward' | undefined
  let placedAny = false

  while (reverseIndex < reverse.length || forwardIndex < forward.length) {
    let reverseUnit: CutStackUnit | undefined = reverse[reverseIndex]
    const forwardUnit = forward[forwardIndex]
    if (reverseUnit) {
      const original = assignments.get(reverseUnit.stackId)
      if (!original || !foldCanStillImprove(reverseUnit, row, original)) {
        reverseIndex = reverse.length
        reverseUnit = undefined
      }
    }
    const reverseCan = Boolean(
      reverseUnit && canFoldAtRow(reverseUnit, row, assignments, rightOccupiedByRow),
    )
    const forwardCan = Boolean(
      forwardUnit && canPlaceForwardAtRow(forwardUnit, row, leftOccupiedByRow),
    )

    if (!reverseCan && !forwardCan) {
      row += 1
      continue
    }

    if (reverseCan && forwardCan && reverseUnit && forwardUnit) {
      const conflict = opposingPlacementsConflict(reverseUnit, row, forwardUnit, row)
      if (!conflict) {
        placeStack(reverseUnit, row, FOLDED_HALF, assignments, rightOccupiedByRow)
        placeStack(forwardUnit, row, PRIMARY_HALF, assignments, leftOccupiedByRow)
        placedAny = true
        reverseIndex += 1
        forwardIndex += 1
        row = Math.max(
          stackTopRow(row, reverseUnit.stackSize),
          stackTopRow(row, forwardUnit.stackSize),
        ) + 1
        continue
      }

      const isInitialBoundaryConflict = row === 0 && reverseIndex === 0 && forwardIndex === 0
      const foldHasPriority = !isInitialBoundaryConflict && lastWinner !== 'fold'
      if (foldHasPriority) {
        placeStack(reverseUnit, row, FOLDED_HALF, assignments, rightOccupiedByRow)
        placedAny = true
        reverseIndex += 1
        lastWinner = 'fold'
        row = stackTopRow(row, reverseUnit.stackSize) + 1
      } else {
        placeStack(forwardUnit, row, PRIMARY_HALF, assignments, leftOccupiedByRow)
        placedAny = true
        forwardIndex += 1
        lastWinner = 'forward'
        row = stackTopRow(row, forwardUnit.stackSize) + 1
      }
      continue
    }

    if (reverseCan && reverseUnit) {
      placeStack(reverseUnit, row, FOLDED_HALF, assignments, rightOccupiedByRow)
      placedAny = true
      reverseIndex += 1
      lastWinner = 'fold'
      row = stackTopRow(row, reverseUnit.stackSize) + 1
      continue
    }

    if (forwardCan && forwardUnit) {
      placeStack(forwardUnit, row, PRIMARY_HALF, assignments, leftOccupiedByRow)
      placedAny = true
      forwardIndex += 1
      lastWinner = 'forward'
      row = stackTopRow(row, forwardUnit.stackSize) + 1
    }
  }
  return placedAny
}

/**
 * Fold a completed left ladder from its last climb member back toward the foot.
 * The last climb member must clear the boundary first; then members fold while
 * they can land on a lower row than their current left placement. The first
 * member that cannot improve stops the fold.
 */
function foldClimbUntilNotLower(
  climb: CutStackUnit[],
  boundary: CutStackUnit,
  assignments: Map<string, StackAssignment>,
  featureW: number,
  foldMarginPx: number,
  maxFoldedTopRow = Number.POSITIVE_INFINITY,
  existingRightOccupancy = new Map<number, OccupiedSpan[]>(),
) {
  const climbMembers = climb.filter((unit) => assignments.get(unit.stackId)?.half === PRIMARY_HALF)
  if (!climbMembers.length) return

  const last = climbMembers[climbMembers.length - 1]
  if (
    !fitsBeforeNextLeader(last.anchorX, last.labelWidth, FOLDED_HALF, boundary.anchorX, featureW, foldMarginPx)
  ) {
    return
  }

  const occupiedByRow = new Map(
    [...existingRightOccupancy.entries()].map(([row, spans]) => [row, [...spans]]),
  )
  let nextFoldRow = 0

  for (const unit of climbMembers.toReversed()) {
    const original = assignments.get(unit.stackId)
    if (!original) break

    const row = lowestLowerFoldRow(unit, original, occupiedByRow, nextFoldRow, maxFoldedTopRow)
    if (row == null) break

    const span = labelSpan(unit.anchorX, unit.labelWidth, FOLDED_HALF)
    assignments.set(unit.stackId, { baseRow: row, half: FOLDED_HALF })
    addStackOccupiedSpan(occupiedByRow, row, unit.stackSize, span, FOLDED_HALF)
    nextFoldRow = stackTopRow(row, unit.stackSize) + 1
  }
}

function buildHistoryThrough(
  ordered: CutStackUnit[],
  assignments: Map<string, StackAssignment>,
  throughIdx: number,
  featureW: number,
): RowHistoryEntry[] {
  const history: RowHistoryEntry[] = []
  for (let index = 0; index <= throughIdx; index += 1) {
    const unit = ordered[index]
    const assignment = assignments.get(unit.stackId)
    if (!assignment) continue
    history.push({
      index,
      row: stackTopRow(assignment.baseRow, unit.stackSize),
      xlim: rowLimitX(unit.anchorX, featureW),
    })
  }
  return history
}

function assignLeftLadderFollower(
  unit: CutStackUnit,
  previousUnit: CutStackUnit,
  previousBaseRow: number,
  history: RowHistoryEntry[],
  featureW: number,
): number {
  const previousTopRow = stackTopRow(previousBaseRow, previousUnit.stackSize)
  const previousXlim = rowLimitX(previousUnit.anchorX, featureW)
  const xspan = rowSpanX(unit.anchorX, unit.labelWidth)
  const rowFromHistory = rowFromSpanCompare(xspan, previousXlim, previousTopRow, history)
  return Math.max(rowFromHistory, previousTopRow + 1)
}

/** After a folded ladder, followers climb up from the foot — never reuse initial row 1 below the foot. */
function continueLeftLadderFromFoot(
  ordered: CutStackUnit[],
  assignments: Map<string, StackAssignment>,
  initial: Map<string, StackAssignment>,
  footIdx: number,
  featureW: number,
) {
  const foot = ordered[footIdx]
  const footAssignment = assignments.get(foot.stackId)
  if (!footAssignment) return

  let previousUnit = foot
  let previousBaseRow = footAssignment.baseRow
  const history = buildHistoryThrough(ordered, assignments, footIdx, featureW)

  for (let idx = footIdx + 1; idx < ordered.length; idx += 1) {
    const unit = ordered[idx]
    if ((initial.get(unit.stackId)?.baseRow ?? 0) === 0) break

    const baseRow = assignLeftLadderFollower(unit, previousUnit, previousBaseRow, history, featureW)
    assignments.set(unit.stackId, { baseRow, half: PRIMARY_HALF })
    history.push({
      index: idx,
      row: stackTopRow(baseRow, unit.stackSize),
      xlim: rowLimitX(unit.anchorX, featureW),
    })
    previousUnit = unit
    previousBaseRow = baseRow
  }
}

/** When a left ladder ends (initial row-0 successor), fold the climb and start the next left ladder. */
function applyChristmasTreeFolds(
  ordered: CutStackUnit[],
  assignments: Map<string, StackAssignment>,
  initial: Map<string, StackAssignment>,
  featureW: number,
  rowEndAnchorX: number,
  rowEndFoldMarginPx: number,
) {
  let lastFootIdx = 0

  for (let afterIdx = 1; afterIdx < ordered.length; afterIdx += 1) {
    const after = ordered[afterIdx]
    if ((initial.get(after.stackId)?.baseRow ?? 0) !== 0) continue

    const ladderEnd = afterIdx - 1
    const ladder = ordered.slice(lastFootIdx, ladderEnd + 1)
    const climb = ladder.slice(1)
    let placedTransition = false

    if (hasRealClimb(climb, initial)) {
      let nextFootIdx = afterIdx + 1
      while (
        nextFootIdx < ordered.length &&
        (initial.get(ordered[nextFootIdx].stackId)?.baseRow ?? 0) !== 0
      ) {
        nextFootIdx += 1
      }
      const forward = ordered.slice(afterIdx, nextFootIdx)
      const excluded = new Set([...climb, ...forward].map((unit) => unit.stackId))
      const leftOccupiedByRow = buildOccupiedByRow(
        ordered,
        assignments,
        excluded,
        ladderEnd,
        PRIMARY_HALF,
      )
      const rightOccupiedByRow = buildOccupiedByRow(
        ordered,
        assignments,
        excluded,
        ladderEnd,
        FOLDED_HALF,
      )
      placedTransition = placeFoldAndForwardCompetition(
        climb,
        forward,
        assignments,
        leftOccupiedByRow,
        rightOccupiedByRow,
      )
    }

    if (!placedTransition) {
      const occupiedByRow = buildOccupiedByRow(
        ordered,
        assignments,
        new Set([after.stackId]),
        afterIdx - 1,
        PRIMARY_HALF,
      )
      assignments.set(after.stackId, resolveLeftPlacement(after, 0, occupiedByRow))
      continueLeftLadderFromFoot(ordered, assignments, initial, afterIdx, featureW)
    }
    lastFootIdx = afterIdx
  }

  if (ordered.length === 0) return

  const lastIdx = ordered.length - 1
  if (lastIdx <= lastFootIdx) return

  const trailingClimb = ordered.slice(lastFootIdx + 1, lastIdx + 1)
  if (!hasRowEndClimb(trailingClimb, initial)) return

  const rowEndAfter: CutStackUnit = {
    stackId: '__row-end__',
    cutPosition: ordered[lastIdx].cutPosition,
    anchorX: rowEndAnchorX,
    labelWidth: 0,
    stackSize: 1,
    items: [],
  }
  const existingRightOccupancy = buildOccupiedByRow(
    ordered,
    assignments,
    new Set(trailingClimb.map((unit) => unit.stackId)),
    lastIdx,
    FOLDED_HALF,
  )
  foldClimbUntilNotLower(
    trailingClimb,
    rowEndAfter,
    assignments,
    featureW,
    rowEndFoldMarginPx,
    Number.POSITIVE_INFINITY,
    existingRightOccupancy,
  )
}

function assignStackRows(
  units: CutStackUnit[],
  featureW: number,
  _rowStart: number,
  rowLength: number,
  input: SequenceLabelRouterInput,
): Map<string, StackAssignment> {
  const ordered = sortedSweepUnits(units)
  const initial = rowAssignForSweep(ordered, featureW)
  const assignments = new Map(initial)
  const trackInset = input.trackInsetPx ?? 28
  const labelPadding = input.labelPadding ?? LABEL_PADDING
  const rowEndAnchorX = trackInset + rowLength * input.baseStepPx
  const rowEndFoldMarginPx = trackInset * 2 + labelPadding
  applyChristmasTreeFolds(ordered, assignments, initial, featureW, rowEndAnchorX, rowEndFoldMarginPx)
  return assignments
}

function buildCutStackUnits(items: Item[]): CutStackUnit[] {
  const byCut = new Map<number, Item[]>()
  items.forEach((item) => {
    const list = byCut.get(item.cutPosition) ?? []
    list.push(item)
    byCut.set(item.cutPosition, list)
  })

  return [...byCut.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([cutPosition, stackItems]) => {
      const sortedItems = stackItems.toSorted(
        (a, b) => (a.site.enzyme.name < b.site.enzyme.name ? -1 : a.site.enzyme.name > b.site.enzyme.name ? 1 : 0) || a.index - b.index,
      )
      return {
        stackId: `cut-${cutPosition}`,
        cutPosition,
        anchorX: sortedItems[0].anchorX,
        labelWidth: Math.max(...sortedItems.map((entry) => entry.labelWidth)),
        stackSize: sortedItems.length,
        items: sortedItems,
      }
    })
}

function baseRowGeometry(items: Item[], input: SequenceLabelRouterInput) {
  const minTextHeight = items.reduce((min, item) => Math.min(min, item.textHeight), items[0]?.textHeight ?? 12)
  const rowGap = minTextHeight + LABEL_PADDING * 2 + COLLISION_GAP * 2 + 1
  const stubHeight = input.leaderStubPx ?? 8
  return { rowGap, stubHeight, minTextHeight }
}

function halfAwareBox(anchorX: number, centerY: number, labelWidth: number, textHeight: number, half: Half): Box {
  if (half === 'left') {
    return {
      right: anchorX,
      left: anchorX - labelWidth,
      top: centerY - textHeight / 2,
      bottom: centerY + textHeight / 2,
    }
  }
  return {
    left: anchorX,
    right: anchorX + labelWidth,
    top: centerY - textHeight / 2,
    bottom: centerY + textHeight / 2,
  }
}

function labelFrameBox(
  labelX: number,
  labelY: number,
  textWidth: number,
  textHeight: number,
  textAnchor: 'start' | 'end',
  pad = LABEL_PADDING,
): Box {
  if (textAnchor === 'end') {
    return {
      left: labelX - textWidth - pad,
      right: labelX + pad,
      top: labelY - textHeight / 2 - pad,
      bottom: labelY + textHeight / 2 + pad,
    }
  }
  return {
    left: labelX - pad,
    right: labelX + textWidth + pad,
    top: labelY - textHeight / 2 - pad,
    bottom: labelY + textHeight / 2 + pad,
  }
}

function buildCallout(
  item: Item,
  laneRow: number,
  stack: CutStackUnit,
  stackIndex: number,
  side: SequenceLabelSide,
  half: Half,
  anchorY: number,
  rowGap: number,
  stubHeight: number,
  minTextHeight: number,
): SequenceLabelCallout {
  const labelY =
    side === 'above'
      ? anchorY - stubHeight - minTextHeight / 2 - COLLISION_GAP - laneRow * rowGap
      : anchorY + stubHeight + minTextHeight / 2 + COLLISION_GAP + laneRow * rowGap

  const box = halfAwareBox(item.anchorX, labelY, item.labelWidth, item.textHeight, half)
  const labelX = half === 'left' ? box.right : box.left
  const textAnchor = half === 'left' ? 'end' : 'start'
  const frameBox = labelFrameBox(labelX, labelY, item.textWidth, item.textHeight, textAnchor)
  const leaderAttachY = side === 'above' ? box.bottom : box.top
  const isStackLeader = stackIndex === 0
  const segments: [Point, Point][] = isStackLeader
    ? [
        [
          { x: item.anchorX, y: leaderAttachY },
          { x: item.anchorX, y: anchorY },
        ],
      ]
    : []

  return {
    site: item.site,
    index: item.index,
    label: item.label,
    side,
    half,
    textAnchor,
    cutPosition: item.cutPosition,
    laneRow,
    stackId: stack.stackId,
    stackIndex,
    stackSize: stack.stackSize,
    isStackLeader,
    anchorX: item.anchorX,
    anchorY,
    labelX,
    labelY,
    box,
    frameBox,
    segments,
  }
}

/**
 * Extra enzyme lane rows required to clear the forward primer stack that overlaps a label.
 * Prefers each span's real pixel height (converted to enzyme rows via `rowGap`) so compact
 * primers only push labels up by the space they actually occupy; falls back to the legacy
 * `rows * legacyRowsPerLane` product for spans that don't carry a height.
 */
function clearanceRowsForLabel(
  anchorX: number,
  labelWidth: number,
  half: Half,
  spans: ReadonlyArray<SequencePrimerClearanceSpan>,
  rowGap: number,
  legacyRowsPerLane: number,
) {
  const span = labelSpan(anchorX, labelWidth, half)
  let rows = 0
  for (const zone of spans) {
    if (!(span.start < zone.right && zone.left < span.end)) continue
    const zoneRows =
      zone.heightPx !== undefined
        ? Math.max(1, Math.ceil(zone.heightPx / rowGap))
        : (zone.rows ?? 1) * (legacyRowsPerLane || 1)
    if (zoneRows > rows) rows = zoneRows
  }
  return rows
}

function layoutRowSideCallouts(
  items: Item[],
  side: SequenceLabelSide,
  rowStart: number,
  rowLength: number,
  input: SequenceLabelRouterInput,
  anchorY: number,
): { callouts: SequenceLabelCallout[]; laneRows: number } {
  if (!items.length) return { callouts: [], laneRows: 0 }

  const featureW = featureWidth(input)
  const { rowGap, stubHeight, minTextHeight } = baseRowGeometry(items, input)
  const units = buildCutStackUnits(items)
  const assignments = assignStackRows(units, featureW, rowStart, rowLength, input)
  const clearanceSpans = side === 'above' ? (input.forwardPrimerClearanceSpans ?? []) : []
  const clearanceRows = side === 'above' ? (input.forwardPrimerClearanceRows ?? 0) : 0

  const callouts: SequenceLabelCallout[] = []
  let maxLaneRow = 0

  units.forEach((stack) => {
    const assignment = assignments.get(stack.stackId) ?? { baseRow: 0, half: PRIMARY_HALF }
    stack.items.forEach((item, stackIndex) => {
      let laneRow = assignment.baseRow + stackIndex
      const clearanceRowCount = clearanceSpans.length
        ? clearanceRowsForLabel(item.anchorX, item.labelWidth, assignment.half, clearanceSpans, rowGap, clearanceRows)
        : 0
      if (clearanceRowCount > 0) laneRow += clearanceRowCount
      maxLaneRow = Math.max(maxLaneRow, laneRow)
      callouts.push(
        buildCallout(
          item,
          laneRow,
          stack,
          stackIndex,
          side,
          assignment.half,
          anchorY,
          rowGap,
          stubHeight,
          minTextHeight,
        ),
      )
    })
  })

  return { callouts, laneRows: maxLaneRow + 1 }
}

export function offsetSequenceLabelCallout(callout: SequenceLabelCallout, xOffset: number): SequenceLabelCallout {
  if (xOffset === 0) return callout
  const shiftX = (x: number) => x + xOffset
  const shiftBox = (box: Box): Box => ({
    left: shiftX(box.left),
    right: shiftX(box.right),
    top: box.top,
    bottom: box.bottom,
  })
  return {
    ...callout,
    anchorX: shiftX(callout.anchorX),
    labelX: shiftX(callout.labelX),
    box: shiftBox(callout.box),
    frameBox: shiftBox(callout.frameBox),
    segments: callout.segments.map(([start, end]) => [
      { x: shiftX(start.x), y: start.y },
      { x: shiftX(end.x), y: end.y },
    ]),
  }
}

/** Route one visual row chunk; optionally widen the routing window for joint-aware collision at boundaries. */
export function layoutSequenceRowChunk(
  rowIndex: number,
  segment: SequenceRowSegment,
  input: SequenceLabelRouterInput,
  options?: { jointBeltBp?: number },
): SequenceRowLabelLayout {
  const belt = options?.jointBeltBp ?? 0
  const expandedStart = Math.max(0, segment.rowStart - belt)
  const expandedEnd = Math.min(input.sequenceLength, segment.rowStart + segment.rowLength + belt)
  const expandedLength = expandedEnd - expandedStart
  const layout = layoutSequenceRow(rowIndex, expandedStart, expandedLength, input)
  const enzymeCallouts = layout.enzymeCallouts.filter(
    (callout) => callout.cutPosition >= segment.rowStart && callout.cutPosition < segment.rowStart + segment.rowLength,
  )
  return {
    ...layout,
    rowStart: segment.rowStart,
    rowLength: segment.rowLength,
    enzymeCallouts,
    enzymeLaneRows: enzymeCallouts.length
      ? Math.max(...enzymeCallouts.map((callout) => callout.laneRow)) + 1
      : 0,
  }
}

export function mergeSequenceLabelRowLayouts(
  layouts: SequenceRowLabelLayout[],
  anchorXForCut: (cutPosition: number) => number,
): Pick<SequenceRowLabelLayout, 'enzymeCallouts' | 'enzymeLaneRows'> {
  const callouts = layouts.flatMap((layout) =>
    layout.enzymeCallouts.map((callout) => {
      const globalAnchorX = anchorXForCut(callout.cutPosition)
      return offsetSequenceLabelCallout(callout, globalAnchorX - callout.anchorX)
    }),
  )
  const enzymeLaneRows = layouts.reduce((max, layout) => Math.max(max, layout.enzymeLaneRows), 0)
  return { enzymeCallouts: callouts, enzymeLaneRows }
}

export function layoutSequenceRow(
  rowIndex: number,
  rowStart: number,
  rowLength: number,
  input: SequenceLabelRouterInput,
): SequenceRowLabelLayout {
  const trackInset = input.trackInsetPx ?? 28
  const trackLeft = trackInset
  const trackRight = trackInset + rowLength * input.baseStepPx

  const enzymeItems = input.enzymeSites
    .map((site, index) => itemForSite(site, index, rowStart, rowLength, input))
    .filter((item): item is Item => Boolean(item))

  const enzyme = layoutRowSideCallouts(enzymeItems, 'above', rowStart, rowLength, input, 0)

  return {
    rowIndex,
    rowStart,
    rowLength,
    trackLeft,
    trackRight,
    enzymeCallouts: enzyme.callouts,
    primerCallouts: [],
    enzymeLaneRows: enzyme.laneRows,
    primerLaneRows: 0,
  }
}

function rowSegmentsForInput(input: SequenceLabelRouterInput, rowCount?: number): SequenceRowSegment[] {
  if (input.rowSegments?.length) return [...input.rowSegments]

  const segments: SequenceRowSegment[] = []
  const count = rowCount ?? Math.ceil(input.sequenceLength / input.basesPerRow)
  for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
    const rowStart = rowIndex * input.basesPerRow
    const rowLength = Math.min(input.basesPerRow, input.sequenceLength - rowStart)
    if (rowLength <= 0) continue
    segments.push({ rowStart, rowLength })
  }
  return segments
}

export function layoutSequenceViewLabels(
  input: SequenceLabelRouterInput,
  rowCount?: number,
): SequenceRowLabelLayout[] {
  return rowSegmentsForInput(input, rowCount).map((segment, rowIndex) =>
    layoutSequenceRow(rowIndex, segment.rowStart, segment.rowLength, input),
  )
}

export function sequenceRowLaneMetrics(
  layout: SequenceRowLabelLayout,
  input: SequenceLabelRouterInput,
  forwardPrimerLaneHeight = 0,
  reversePrimerLaneHeight = 0,
) {
  const stubHeight = input.leaderStubPx ?? 8
  const enzymeExtent = layout.enzymeCallouts.reduce((min, callout) => Math.min(min, callout.box.top), 0)
  const enzymeLaneHeight = layout.enzymeLaneRows > 0 ? Math.ceil(-enzymeExtent + stubHeight) : 0
  return {
    stubHeight,
    enzymeLaneHeight,
    forwardPrimerLaneHeight,
    primerLaneHeight: reversePrimerLaneHeight,
  }
}
