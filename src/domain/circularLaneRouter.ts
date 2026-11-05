import type {
  Box,
  EnzymeCallout,
  EnzymeCalloutLayoutInput,
  EnzymeCalloutLayoutResult,
  Point,
  Segment,
} from './mapLayout'
import {
  boxInBounds,
  boxIntersectsFeatureRing,
  boxesOverlap,
  hasNonAcuteBend,
  paddedBox,
  pointInBounds,
  polarPoint,
  segmentEntersFeatureRing,
  segmentIntersectsBox,
  segmentsStrictlyCross,
} from './mapLayout'
import type { RestrictionSite } from './types'

type Side = 'right' | 'left'
type Quarter = 'upper-right' | 'lower-right' | 'upper-left' | 'lower-left'

type LaneItem = {
  site: RestrictionSite
  index: number
  label: string
  labelWidth: number
  textHeight: number
  quarter: Quarter
  side: Side
  anchor: Point
  elbow: Point
  progress: number
  angleNorm: number
  congestion: number
  preferredLane: number
}

type Candidate = Omit<EnzymeCallout, 'site' | 'index' | 'label'>

const TEXT_HEIGHT = 12
const TEXT_WIDTH = 6
const COLLISION_GAP = 1
const VIEW_PADDING = 1
const FEATURE_WIDTH = 15.5
const RADIAL_STUB_LENGTH = FEATURE_WIDTH * 1.2
const MIN_LEADER_LENGTH = FEATURE_WIDTH * 3

/** Nested radial/horizontal lanes per quadrant (inner → outer). */
const LANE_COUNT = 6
/** Extra clearance beyond ring for lane 0, then +LANE_STEP per lane. */
const LANE_BASE_CLEARANCE = 4
const LANE_STEP_PX = 16
/** Tangential freerange steps for dense clusters (far fewer than classic 15×17). */
const MAX_Y_STEPS = 6
/** Angular window (fraction of circle) for local congestion. */
const CONGESTION_WINDOW = 0.06
/** Only validate against this many recent same-side placements. */
const NEIGHBOR_FRONTIER = 14

function resolvedCenter(input: EnzymeCalloutLayoutInput) {
  return { x: input.centerX ?? input.center, y: input.centerY ?? input.center }
}

function layoutMapExtents(input: EnzymeCalloutLayoutInput) {
  return { width: input.mapWidth ?? input.mapSize, height: input.mapHeight ?? input.mapSize }
}

function quarterForNorm(normalized: number): { quarter: Quarter; progress: number } {
  if (normalized <= 0.25) return { quarter: 'upper-right', progress: (0.25 - normalized) / 0.25 }
  if (normalized <= 0.5) return { quarter: 'lower-right', progress: (normalized - 0.25) / 0.25 }
  if (normalized <= 0.75) return { quarter: 'lower-left', progress: (0.75 - normalized) / 0.25 }
  return { quarter: 'upper-left', progress: (normalized - 0.75) / 0.25 }
}

function itemForSite(site: RestrictionSite, index: number, input: EnzymeCalloutLayoutInput): LaneItem {
  const normalized = ((site.start % input.sequenceLength) + input.sequenceLength) % input.sequenceLength / input.sequenceLength
  const { quarter, progress } = quarterForNorm(normalized)
  const side: Side = quarter === 'upper-right' || quarter === 'lower-right' ? 'right' : 'left'
  const label = input.labelForSite ? input.labelForSite(site) : `${site.enzyme.name} (${site.start + 1})`
  const textHeight = input.textHeightForSite ? input.textHeightForSite(site) : (input.textHeight ?? TEXT_HEIGHT)
  const textWidth = input.textWidthForSite ? input.textWidthForSite(site) : (input.textWidth ?? TEXT_WIDTH)
  const labelPadding = input.labelPaddingForSite ? input.labelPaddingForSite(site) : (input.labelPadding ?? 6)
  const measuredWidth = input.labelWidthForSite ? input.labelWidthForSite(site, label) : label.length * textWidth
  const { x: centerX, y: centerY } = resolvedCenter(input)
  const anchorOffset = input.rulerContactOffset ?? 3
  const elbowOffset = anchorOffset + RADIAL_STUB_LENGTH

  return {
    site,
    index,
    label,
    labelWidth: measuredWidth + labelPadding,
    textHeight,
    quarter,
    side,
    anchor: polarPoint(site.start, input.sequenceLength, centerX, centerY, input.radius, anchorOffset, input.topology),
    elbow: polarPoint(site.start, input.sequenceLength, centerX, centerY, input.radius, elbowOffset, input.topology),
    progress,
    angleNorm: normalized,
    congestion: 0,
    preferredLane: 0,
  }
}

function assignCongestionAndLanes(items: LaneItem[], mapHeight: number) {
  for (let i = 0; i < items.length; i += 1) {
    let sum = items[i].textHeight
    for (let j = 0; j < items.length; j += 1) {
      if (i === j) continue
      let delta = Math.abs(items[i].angleNorm - items[j].angleNorm)
      if (delta > 0.5) delta = 1 - delta
      if (delta <= CONGESTION_WINDOW) sum += items[j].textHeight
    }
    items[i].congestion = sum
    const capacity = Math.max(48, mapHeight * 0.22)
    items[i].preferredLane = Math.max(0, Math.min(LANE_COUNT - 1, Math.floor(sum / capacity)))
  }
}

function candidateAt(item: LaneItem, input: EnzymeCalloutLayoutInput, edgeX: number, edgeY: number): Candidate {
  const { width: mapWidth } = layoutMapExtents(input)
  const textHeight = item.textHeight
  if (item.side === 'right') {
    const clampedX = Math.min(mapWidth - item.labelWidth - VIEW_PADDING, Math.max(VIEW_PADDING, edgeX))
    const box: Box = {
      left: clampedX,
      right: clampedX + item.labelWidth,
      top: edgeY - textHeight / 2,
      bottom: edgeY + textHeight / 2,
    }
    return {
      anchor: item.anchor,
      elbow: item.elbow,
      connectorEnd: { x: clampedX, y: edgeY },
      x: clampedX,
      y: edgeY + textHeight / 2 - 3,
      textAnchor: 'start',
      box,
      segments: [
        [item.anchor, item.elbow],
        [item.elbow, { x: clampedX, y: edgeY }],
      ],
    }
  }

  const clampedX = Math.max(item.labelWidth + VIEW_PADDING, Math.min(mapWidth - VIEW_PADDING, edgeX))
  const box: Box = {
    left: clampedX - item.labelWidth,
    right: clampedX,
    top: edgeY - textHeight / 2,
    bottom: edgeY + textHeight / 2,
  }
  return {
    anchor: item.anchor,
    elbow: item.elbow,
    connectorEnd: { x: clampedX, y: edgeY },
    x: clampedX,
    y: edgeY + textHeight / 2 - 3,
    textAnchor: 'end',
    box,
    segments: [
      [item.anchor, item.elbow],
      [item.elbow, { x: clampedX, y: edgeY }],
    ],
  }
}

function conflictsWith(
  candidate: Candidate,
  neighbors: EnzymeCallout[],
  _input: EnzymeCalloutLayoutInput,
  protectedRadius: number,
  mapCenter: Point,
  mapWidth: number,
  mapHeight: number,
) {
  if (!pointInBounds(candidate.anchor, mapWidth, mapHeight) || !pointInBounds(candidate.elbow, mapWidth, mapHeight) || !pointInBounds(candidate.connectorEnd, mapWidth, mapHeight)) {
    return true
  }
  if (!boxInBounds(candidate.box, mapWidth, mapHeight)) return true
  if (!hasNonAcuteBend(candidate.anchor, candidate.elbow, candidate.connectorEnd)) return true
  if (boxIntersectsFeatureRing(candidate.box, mapCenter, protectedRadius)) return true
  if (segmentEntersFeatureRing(candidate.segments[1], mapCenter, protectedRadius)) return true

  const paddedCandidate = paddedBox(candidate.box)
  return neighbors.some((other) => {
    if (boxesOverlap(paddedCandidate, paddedBox(other.box))) return true
    if (other.segments.some((segment) => segmentIntersectsBox(segment[0], segment[1], paddedCandidate))) return true
    if (candidate.segments.some((segment) => segmentIntersectsBox(segment[0], segment[1], paddedBox(other.box)))) return true
    return candidate.segments.some((candidateSegment) =>
      other.segments.some((otherSegment) => segmentsStrictlyCross(candidateSegment[0], candidateSegment[1], otherSegment[0], otherSegment[1])),
    )
  })
}

function laneOrder(preferred: number): number[] {
  const order: number[] = [preferred]
  for (let delta = 1; delta < LANE_COUNT; delta += 1) {
    if (preferred + delta < LANE_COUNT) order.push(preferred + delta)
    if (preferred - delta >= 0) order.push(preferred - delta)
  }
  return order
}

function clearEdgeX(
  side: Side,
  edgeY: number,
  labelWidth: number,
  lane: number,
  mapCenter: Point,
  protectedRadius: number,
  mapWidth: number,
) {
  const dy = edgeY - mapCenter.y
  const clearHalfWidth = Math.sqrt(Math.max(0, protectedRadius * protectedRadius - dy * dy)) + COLLISION_GAP
  const laneExtra = LANE_BASE_CLEARANCE + lane * LANE_STEP_PX
  if (side === 'right') return Math.min(mapWidth - labelWidth - VIEW_PADDING, mapCenter.x + clearHalfWidth + laneExtra)
  return Math.max(labelWidth + VIEW_PADDING, mapCenter.x - clearHalfWidth - laneExtra)
}

function cheapCapacityOk(items: LaneItem[], mapHeight: number) {
  if (!items.length) return true
  const totalHeight = items.reduce((sum, item) => sum + item.textHeight + COLLISION_GAP * 2 + 1, 0)
  // Multi-lane capacity: roughly LANE_COUNT independent columns share the vertical budget.
  return totalHeight <= mapHeight * LANE_COUNT * 0.92
}

function placeQuarter(
  group: LaneItem[],
  input: EnzymeCalloutLayoutInput,
  placed: EnzymeCallout[],
  layout: Array<EnzymeCallout | undefined>,
  options: { allowFallbackCandidate: boolean },
): boolean {
  if (!group.length) return true
  const mapCenter = resolvedCenter(input)
  const { width: mapWidth, height: mapHeight } = layoutMapExtents(input)
  const protectedRadius = input.radius + (input.rulerContactOffset ?? 3) + COLLISION_GAP
  const minSecondSegment = MIN_LEADER_LENGTH - RADIAL_STUB_LENGTH
  const minLabelOffset = (input.rulerContactOffset ?? 3) + RADIAL_STUB_LENGTH + minSecondSegment
  const movesUp = group[0].quarter === 'upper-right' || group[0].quarter === 'upper-left'
  const direction = movesUp ? -1 : 1
  const laneCursor = new Array<number | null>(LANE_COUNT).fill(null)
  let anyFailure = false

  if (!cheapCapacityOk(group, mapHeight) && !options.allowFallbackCandidate) {
    return false
  }

  for (const item of group) {
    const idealY = polarPoint(item.site.start, input.sequenceLength, mapCenter.x, mapCenter.y, input.radius, minLabelOffset, input.topology).y
    const neighbors = placed.length > NEIGHBOR_FRONTIER ? placed.slice(-NEIGHBOR_FRONTIER) : placed
    const candidates: Array<{ candidate: Candidate; score: number; lane: number }> = []

    for (const lane of laneOrder(item.preferredLane)) {
      const previousY = laneCursor[lane]
      const rowGap = item.textHeight + COLLISION_GAP * 2 + 1
      let packedY = idealY
      if (previousY !== null) {
        packedY = movesUp ? Math.min(idealY, previousY - rowGap) : Math.max(idealY, previousY + rowGap)
      }

      for (let yStep = 0; yStep <= MAX_Y_STEPS; yStep += 1) {
        const edgeY = packedY + direction * yStep * rowGap
        if (edgeY - item.textHeight / 2 < VIEW_PADDING || edgeY + item.textHeight / 2 > mapHeight - VIEW_PADDING) continue

        const clearX = clearEdgeX(item.side, edgeY, item.labelWidth, lane, mapCenter, protectedRadius, mapWidth)
        const minimumLengthX = item.side === 'right' ? item.elbow.x + minSecondSegment : item.elbow.x - minSecondSegment
        const baseX = item.side === 'right' ? Math.max(clearX, minimumLengthX) : Math.min(clearX, minimumLengthX)

        // At most 3 horizontal nudges per (lane, y) — structured depth, not a 17-wide grid.
        for (let h = 0; h <= 2; h += 1) {
          const edgeX = item.side === 'right' ? baseX + h * LANE_STEP_PX : baseX - h * LANE_STEP_PX
          const candidate = candidateAt(item, input, edgeX, edgeY)
          if (conflictsWith(candidate, neighbors, input, protectedRadius, mapCenter, mapWidth, mapHeight)) continue

          const connectorLength = Math.hypot(candidate.connectorEnd.x - candidate.elbow.x, candidate.connectorEnd.y - candidate.elbow.y)
          const totalLength = RADIAL_STUB_LENGTH + connectorLength
          const belowMin = Math.max(0, MIN_LEADER_LENGTH - totalLength) * 1000
          const score =
            belowMin +
            Math.abs(edgeY - idealY) * 2 +
            lane * 18 +
            yStep * 24 +
            h * 10 +
            Math.abs(totalLength - MIN_LEADER_LENGTH) * 4
          candidates.push({ candidate, score, lane })
        }
      }
    }

    candidates.sort((a, b) => a.score - b.score)
    const chosen = candidates[0]

    if (!chosen) {
      anyFailure = true
      if (!options.allowFallbackCandidate) continue

      // Soft fallback: place at idealY on outermost lane without collision guarantee.
      const lane = LANE_COUNT - 1
      const clearX = clearEdgeX(item.side, idealY, item.labelWidth, lane, mapCenter, protectedRadius, mapWidth)
      const fallback = candidateAt(item, input, clearX, idealY)
      const callout: EnzymeCallout = {
        ...fallback,
        site: item.site,
        index: item.index,
        label: item.label,
      }
      placed.push(callout)
      layout[item.index] = callout
      laneCursor[lane] = idealY
      continue
    }

    const callout: EnzymeCallout = {
      ...chosen.candidate,
      site: item.site,
      index: item.index,
      label: item.label,
    }
    placed.push(callout)
    layout[item.index] = callout
    laneCursor[chosen.lane] = chosen.candidate.connectorEnd.y
    input.debugLog?.({
      algorithm: 'lane',
      index: item.index,
      label: item.label,
      quarter: item.quarter,
      lane: chosen.lane,
      preferredLane: item.preferredLane,
      congestion: Number(item.congestion.toFixed(1)),
      score: Number(chosen.score.toFixed(1)),
      edgeY: Number(chosen.candidate.connectorEnd.y.toFixed(1)),
      idealY: Number(idealY.toFixed(1)),
    })
  }

  return !anyFailure
}

function layoutCircularLaneCalloutsWithResult(
  input: EnzymeCalloutLayoutInput,
  options: { allowFallbackCandidate: boolean },
): EnzymeCalloutLayoutResult {
  const { height: mapHeight } = layoutMapExtents(input)
  const items = input.sites.map((site, index) => itemForSite(site, index, input))
  assignCongestionAndLanes(items, mapHeight)

  const placed: EnzymeCallout[] = [...(input.initialPlaced ?? [])]
  const layout: Array<EnzymeCallout | undefined> = []
  let hasPlacementFailure = false

  ;(['upper-right', 'lower-right', 'upper-left', 'lower-left'] as const).forEach((quarter) => {
    const group = items
      .filter((item) => item.quarter === quarter)
      .toSorted((a, b) => a.progress - b.progress || a.site.start - b.site.start)
    const ok = placeQuarter(group, input, placed, layout, options)
    if (!ok) hasPlacementFailure = true
  })

  return {
    callouts: layout.filter((item): item is EnzymeCallout => Boolean(item)),
    hasPlacementFailure,
  }
}

/** Multi-lane ordered packing: structured radial lanes + limited tangential freerange. */
export function layoutCircularLaneCallouts(input: EnzymeCalloutLayoutInput): EnzymeCallout[] {
  return layoutCircularLaneCalloutsWithResult(input, { allowFallbackCandidate: true }).callouts
}

export function layoutCircularLaneCalloutsStrict(input: EnzymeCalloutLayoutInput): EnzymeCalloutLayoutResult {
  return layoutCircularLaneCalloutsWithResult(input, { allowFallbackCandidate: false })
}

export type CircularRouterAlgorithm = 'classic' | 'lane' | 'elliptic'

export function parseCircularRouterAlgorithm(raw: string | null | undefined): CircularRouterAlgorithm {
  if (raw === 'classic') return 'classic'
  if (raw === 'lane') return 'lane'
  if (raw === 'elliptic') return 'elliptic'
  return 'elliptic'
}

/** Metrics useful when comparing classic vs lane aesthetics/performance. */
export function summarizeCircularLayout(callouts: EnzymeCallout[], input: EnzymeCalloutLayoutInput) {
  let leaderTotal = 0
  let maxLeader = 0
  let labelArea = 0
  callouts.forEach((callout) => {
    const len = callout.segments.reduce((sum, segment: Segment) => sum + Math.hypot(segment[1].x - segment[0].x, segment[1].y - segment[0].y), 0)
    leaderTotal += len
    maxLeader = Math.max(maxLeader, len)
    labelArea += Math.max(0, callout.box.right - callout.box.left) * Math.max(0, callout.box.bottom - callout.box.top)
  })
  return {
    labels: callouts.length,
    leaderTotal: Number(leaderTotal.toFixed(1)),
    leaderAverage: callouts.length ? Number((leaderTotal / callouts.length).toFixed(1)) : 0,
    leaderMax: Number(maxLeader.toFixed(1)),
    labelArea: Number(labelArea.toFixed(1)),
    radius: input.radius,
    mapSize: input.mapSize,
  }
}
