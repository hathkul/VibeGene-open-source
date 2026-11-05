import type { RestrictionSite, Topology } from './types'
import { circularMapAngle, circularMapPolarPoint } from './circularMapGeometry'

export type Point = { x: number; y: number }
export type Box = { left: number; right: number; top: number; bottom: number }
export type Segment = [Point, Point]
export type EnzymeCallout = {
  site: RestrictionSite
  index: number
  anchor: Point
  elbow: Point
  connectorEnd: Point
  x: number
  y: number
  label: string
  textAnchor: 'start' | 'end' | 'middle'
  box: Box
  segments: Segment[]
  /** Horizontal label offset from anchor (linear map layout). */
  labelOffsetX?: number
}

export type EnzymeCalloutLayoutInput = {
  sites: RestrictionSite[]
  sequenceLength: number
  /** Circular map ring topology; linear sequences use a horseshoe (open at top). */
  topology?: Topology
  mapSize: number
  /** Viewport width for label bounds; defaults to mapSize. */
  mapWidth?: number
  /** Viewport height for label bounds; defaults to mapSize. */
  mapHeight?: number
  /** Bottom viewport space reserved for content drawn below the routed callouts (e.g. map title). */
  bottomReservedPx?: number
  center: number
  radius: number
  outerFeatureOffset: number
  labelForSite?: (site: RestrictionSite) => string
  textHeight?: number
  textWidth?: number
  labelPadding?: number
  labelWidthForSite?: (site: RestrictionSite, label: string) => number
  textHeightForSite?: (site: RestrictionSite) => number
  textWidthForSite?: (site: RestrictionSite) => number
  labelPaddingForSite?: (site: RestrictionSite) => number
  rulerContactOffset?: number
  /** Already-placed callouts (e.g. enzymes) that primer labels must avoid. */
  initialPlaced?: EnzymeCallout[]
  debugLog?: (entry: Record<string, unknown>) => void
  /** Optional diagnostic hook, called once for each elliptic core candidate evaluation. */
  onEllipticCandidate?: () => void
  /** Optional, side-effect-free diagnostic for final center-search decisions. */
  onCenterSearchDebug?: (entry: Record<string, unknown>) => void
  centerX?: number
  centerY?: number
  /**
   * Dimensionless ovoid asymmetry for the elliptic router.
   * Curve: x²/a² + y²/(b(1+λx))² = 1 with λ = ovoidK/a (x,y relative to center).
   * 0 → true ellipse; positive fattens the 3 o'clock side; negative fattens 9 o'clock.
   * Clamped to about ±0.85.
   */
  ovoidK?: number
  /** Label-placement curve used by the elliptic router. Default: ellipse. */
  labelCurveShape?: 'ellipse' | 'arcs'
  /**
   * Elliptic: when false, skip horizontal travel toward each site's polar ray (labels stay on
   * the packed oval). Default true.
   */
  raySlideEnabled?: boolean
  /**
   * Elliptic: minimum horizontal gap (px) between a sliding label and its more polar-close
   * neighbor when the slide stops. Default 4.
   */
  raySlideClearancePx?: number
  /**
   * Elliptic: when false, skip radial implosion toward the ring after ray-slide. Default true.
   */
  radialImplodeEnabled?: boolean
  /**
   * Elliptic: min gap (px) to other labels / leaders when imploding radially. Default 4.
   */
  radialImplodeClearancePx?: number
  /**
   * Elliptic: min distance (px) from the ring edge to a label box when imploding. Default 24.
   */
  radialImplodeMinRingDistancePx?: number
  /**
   * Elliptic: preferred clearance between ring and oval at 3h/9h (mirrors the ring-gap slider).
   * Keeps the label curve outside the ring before horizontal ray-slides move connectors inward.
   */
  ringGap?: number
  /**
   * Elliptic: horizontal px reserved for side labels when sizing the oval (`a`).
   * When omitted, uses max(64, widest label). Pass 0 to prefer a larger ring (labels may
   * overflow horizontally / scroll).
   */
  sideBudget?: number
  /** Internal: the side budget was estimated automatically and may be relaxed for an overflow candidate. */
  adaptiveSideBudget?: boolean
  /** Internal: permit pole sharing for an invalid opposing-cluster fallback. */
  allowOneSidedPoleSharing?: boolean
  /**
   * Elliptic: explicit horizontal distance (px) from the ring to the label oval at 3h/9h.
   * When omitted, the router derives it from ring radius and label count.
   */
  ellipticHorizontalGapPx?: number
  /**
   * Elliptic: explicit vertical distance (px) from the ring to the label oval at 12h/6h.
   * The router may grow beyond it when the label stack needs more vertical capacity.
   */
  ellipticVerticalGapPx?: number
  /** Two-arcs mode: explicit horizontal ring-to-arc gap at 3h/9h. */
  arcHorizontalGapPx?: number
  /** Two-arcs mode: minimum vertical ring-to-tip gap at 12h. */
  arcUpperVerticalGapPx?: number
  /** Two-arcs mode: minimum vertical ring-to-tip gap at 6h. */
  arcLowerVerticalGapPx?: number
  /** Two-arcs mode: bluntest allowed 12h tip angle. Omit for density- and bend-optimized sizing. */
  arcUpperTipAngleDegrees?: number
  /** Two-arcs mode: bluntest allowed 6h tip angle. Omit for density- and bend-optimized sizing. */
  arcLowerTipAngleDegrees?: number
  /**
   * Two-arcs overflow mode: after preserving the best minimum bend angle, prefer geometry
   * that keeps labels and leaders closer to the ring instead of maximizing mean bend.
   */
  arcCompactOverflowLabels?: boolean
  /** Internal: cap automatic upper/lower arc height to the current viewport before packing. */
  arcAutoFitUpper?: boolean
  arcAutoFitLower?: boolean
  /** Internal automatic two-arc Bézier curvature; omitted/zero preserves circular arcs. */
  arcCurvature?: number
  /** Internal automatic Bézier curvature for the left/right arc sides. */
  arcLeftCurvature?: number
  arcRightCurvature?: number
  /** Internal: use the inexpensive placement pass while comparing radius/arc candidates. */
  optimizationPass?: 'coarse' | 'final'
  /** Internal arc-overflow pass: viewport bounds are scrollable, not placement failures. */
  allowViewportOverflow?: boolean
  /** Internal: compact curve packing while preserving this global leader-bend floor. */
  arcCompactMinimumBendAngle?: number
  /**
   * Elliptic: when true (default), nudge the ring center toward the emptiest pocket among
   * label boxes after placement and re-anchor leaders.
   */
  balanceRing?: boolean
}

function resolvedCenter(input: EnzymeCalloutLayoutInput) {
  const x = input.centerX ?? input.center
  const y = input.centerY ?? input.center
  return { x, y }
}

function layoutMapExtents(input: EnzymeCalloutLayoutInput) {
  const width = input.mapWidth ?? input.mapSize
  const height = input.mapHeight ?? input.mapSize
  return { width, height }
}

export type EnzymeCalloutRadiusInput = Omit<EnzymeCalloutLayoutInput, 'radius'> & {
  minRadius?: number
  maxRadius?: number
}

type Side = 'right' | 'left'
type Quarter = 'upper-right' | 'lower-right' | 'upper-left' | 'lower-left'
type Candidate = Omit<EnzymeCallout, 'site' | 'index' | 'label'>
type LayoutItem = {
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
}

export type EnzymeCalloutLayoutResult = {
  callouts: EnzymeCallout[]
  hasPlacementFailure: boolean
  /** Arc router intentionally expanded beyond the viewport and expects a scrollable canvas. */
  overflowMode?: boolean
  /**
   * Elliptic: ring center after maximin recentering among label boxes.
   * When set, the plasmid backbone / polar geometry should use this instead of the layout midpoint.
   */
  ringCenter?: Point
  /** Optional quality metrics produced by circular outside-label routers. */
  routingQuality?: {
    fitsViewport: boolean
    viewportOverflowPx: number
    /** Extra content extent outside the viewport, independent of the number of labels. */
    canvasGrowthHorizontalPx?: number
    canvasGrowthVerticalPx?: number
    minBendAngle: number
    meanBendAngle: number
    /** Number of leaders below the routing target angle. */
    belowTargetBendCount: number
    /** Sum of each leader's shortfall from the routing target angle. */
    belowTargetBendSeverity: number
    maxLeaderLength: number
    meanLeaderLength: number
  }
}

const FEATURE_WIDTH = 15.5
const TEXT_HEIGHT = 12
const TEXT_WIDTH = 6
const COLLISION_GAP = 1
const VIEW_PADDING = 1
const RADIAL_STUB_LENGTH = FEATURE_WIDTH * 1.2
const MIN_LEADER_LENGTH = FEATURE_WIDTH * 3

export function enzymeLabelBudget(siteCount: number, outerFeatureOffset: number, mapSize: number) {
  if (!siteCount) return outerFeatureOffset + 88
  const denseLabelReserve = 205 + Math.min(190, siteCount * 4)
  return Math.min(mapSize * 0.64, outerFeatureOffset + denseLabelReserve)
}

export function chooseCircularMapRadius(input: EnzymeCalloutRadiusInput) {
  const maxRadius = input.maxRadius ?? input.center - VIEW_PADDING - 32
  const minRadius = Math.min(input.minRadius ?? 44, maxRadius)
  if (!input.sites.length) return Math.max(minRadius, maxRadius)

  for (let radius = maxRadius; radius >= minRadius; radius -= 3) {
    const layoutInput = { ...input, radius }
    const { callouts, hasPlacementFailure } = layoutEnzymeCalloutsStrict(layoutInput)
    if (!hasPlacementFailure && !collectLayoutViolations(callouts, layoutInput).length) return radius
  }

  return minRadius
}

export function polarPoint(
  position: number,
  sequenceLength: number,
  centerX: number,
  centerY: number,
  radius: number,
  offset = 0,
  topology: Topology = 'circular',
) {
  return circularMapPolarPoint(position, sequenceLength, centerX, centerY, radius, offset, topology)
}

export function paddedBox(box: Box, padding = COLLISION_GAP): Box {
  return {
    left: box.left - padding,
    right: box.right + padding,
    top: box.top - padding,
    bottom: box.bottom + padding,
  }
}

export function boxesOverlap(a: Box, b: Box) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

export function boxInBounds(box: Box, width: number, height = width, padding = VIEW_PADDING) {
  return box.left >= padding && box.right <= width - padding && box.top >= padding && box.bottom <= height - padding
}

export function pointInBounds(point: Point, width: number, height = width, padding = VIEW_PADDING) {
  return point.x >= padding && point.x <= width - padding && point.y >= padding && point.y <= height - padding
}

export function pointInsideBox(point: Point, box: Box) {
  return point.x > box.left && point.x < box.right && point.y > box.top && point.y < box.bottom
}

function orientation(a: Point, b: Point, c: Point) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)
}

function pointOnSegment(point: Point, start: Point, end: Point) {
  const epsilon = 1e-6
  return (
    point.x >= Math.min(start.x, end.x) - epsilon &&
    point.x <= Math.max(start.x, end.x) + epsilon &&
    point.y >= Math.min(start.y, end.y) - epsilon &&
    point.y <= Math.max(start.y, end.y) + epsilon
  )
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  const epsilon = 1e-6
  if (Math.abs(o1) <= epsilon && pointOnSegment(c, a, b)) return true
  if (Math.abs(o2) <= epsilon && pointOnSegment(d, a, b)) return true
  if (Math.abs(o3) <= epsilon && pointOnSegment(a, c, d)) return true
  if (Math.abs(o4) <= epsilon && pointOnSegment(b, c, d)) return true
  return o1 * o2 < 0 && o3 * o4 < 0
}

/**
 * Circular router uses a looser leader-leader intersection rule.
 * Endpoint touching (or near-collinear contact) should not force packed fallback.
 */
export function segmentsStrictlyCross(a: Point, b: Point, c: Point, d: Point) {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  const epsilon = 1e-6
  return o1 * o2 < -epsilon && o3 * o4 < -epsilon
}

export function segmentIntersectsBox(start: Point, end: Point, box: Box) {
  if (pointInsideBox(start, box) || pointInsideBox(end, box)) return true
  const topLeft = { x: box.left, y: box.top }
  const topRight = { x: box.right, y: box.top }
  const bottomRight = { x: box.right, y: box.bottom }
  const bottomLeft = { x: box.left, y: box.bottom }
  return (
    segmentsIntersect(start, end, topLeft, topRight) ||
    segmentsIntersect(start, end, topRight, bottomRight) ||
    segmentsIntersect(start, end, bottomRight, bottomLeft) ||
    segmentsIntersect(start, end, bottomLeft, topLeft)
  )
}

export function distancePointToBox(point: Point, box: Box) {
  const dx = Math.max(box.left - point.x, 0, point.x - box.right)
  const dy = Math.max(box.top - point.y, 0, point.y - box.bottom)
  return Math.hypot(dx, dy)
}

export function distancePointToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

export function hasNonAcuteBend(anchor: Point, elbow: Point, connectorEnd: Point) {
  const incoming = { x: anchor.x - elbow.x, y: anchor.y - elbow.y }
  const outgoing = { x: connectorEnd.x - elbow.x, y: connectorEnd.y - elbow.y }
  return incoming.x * outgoing.x + incoming.y * outgoing.y <= 0.001
}

export type LeaderBendAngleStats = {
  count: number
  min: number
  mean: number
  max: number
}

/**
 * Interior angle at the leader elbow: 180° is straight/radial, 90° is a right-angle bend,
 * and values below 90° bend back toward the ring.
 */
export function leaderBendAngleDegrees(
  leader: Pick<EnzymeCallout, 'anchor' | 'elbow' | 'connectorEnd'>,
) {
  const inwardX = leader.anchor.x - leader.elbow.x
  const inwardY = leader.anchor.y - leader.elbow.y
  const outwardX = leader.connectorEnd.x - leader.elbow.x
  const outwardY = leader.connectorEnd.y - leader.elbow.y
  const inwardLength = Math.hypot(inwardX, inwardY)
  const outwardLength = Math.hypot(outwardX, outwardY)
  if (inwardLength < 1e-6 || outwardLength < 1e-6) return null
  const cosine = Math.max(
    -1,
    Math.min(1, (inwardX * outwardX + inwardY * outwardY) / (inwardLength * outwardLength)),
  )
  return (Math.acos(cosine) * 180) / Math.PI
}

export function summarizeLeaderBendAngles(
  leaders: Array<Pick<EnzymeCallout, 'anchor' | 'elbow' | 'connectorEnd'>>,
): LeaderBendAngleStats | null {
  let count = 0
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let total = 0
  leaders.forEach((leader) => {
    const angle = leaderBendAngleDegrees(leader)
    if (angle === null) return
    count += 1
    min = Math.min(min, angle)
    max = Math.max(max, angle)
    total += angle
  })
  return count ? { count, min, mean: total / count, max } : null
}

export function segmentEntersFeatureRing(segment: Segment, center: Point, protectedRadius: number) {
  return distancePointToSegment(center, segment[0], segment[1]) < protectedRadius
}

export function boxIntersectsFeatureRing(box: Box, center: Point, protectedRadius: number) {
  return distancePointToBox(center, box) < protectedRadius
}

function itemForSite(site: RestrictionSite, index: number, input: EnzymeCalloutLayoutInput): LayoutItem {
  const normalized = site.start / input.sequenceLength
  let quarter: Quarter
  let progress: number
  if (normalized <= 0.25) {
    quarter = 'upper-right'
    progress = (0.25 - normalized) / 0.25
  } else if (normalized <= 0.5) {
    quarter = 'lower-right'
    progress = (normalized - 0.25) / 0.25
  } else if (normalized <= 0.75) {
    quarter = 'lower-left'
    progress = (0.75 - normalized) / 0.25
  } else {
    quarter = 'upper-left'
    progress = (normalized - 0.75) / 0.25
  }

  const anchorOffset = input.rulerContactOffset ?? 3
  const elbowOffset = anchorOffset + RADIAL_STUB_LENGTH
  const side: Side = quarter === 'upper-right' || quarter === 'lower-right' ? 'right' : 'left'
  const label = input.labelForSite ? input.labelForSite(site) : `${site.enzyme.name} (${site.start + 1})`
  const textHeight = input.textHeightForSite ? input.textHeightForSite(site) : input.textHeight ?? TEXT_HEIGHT
  const textWidth = input.textWidthForSite ? input.textWidthForSite(site) : input.textWidth ?? TEXT_WIDTH
  const labelPadding = input.labelPaddingForSite ? input.labelPaddingForSite(site) : input.labelPadding ?? 6
  const measuredWidth = input.labelWidthForSite ? input.labelWidthForSite(site, label) : label.length * textWidth
  const { x: centerX, y: centerY } = resolvedCenter(input)

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
  }
}

function candidateAt(item: LayoutItem, input: EnzymeCalloutLayoutInput, edgeX: number, edgeY: number): Candidate {
  const { width: mapWidth } = layoutMapExtents(input)
  const textHeight = item.textHeight
  if (item.side === 'right') {
    const clampedX = Math.min(mapWidth - item.labelWidth - VIEW_PADDING, Math.max(VIEW_PADDING, edgeX))
    const box = {
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
  const box = {
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

function candidateViolations(candidate: Candidate, placed: EnzymeCallout[], input: EnzymeCalloutLayoutInput, protectedRadius: number) {
  const mapCenter = resolvedCenter(input)
  const { width: mapWidth, height: mapHeight } = layoutMapExtents(input)
  if (!pointInBounds(candidate.anchor, mapWidth, mapHeight) || !pointInBounds(candidate.elbow, mapWidth, mapHeight) || !pointInBounds(candidate.connectorEnd, mapWidth, mapHeight)) {
    return true
  }
  if (!boxInBounds(candidate.box, mapWidth, mapHeight)) return true
  if (!hasNonAcuteBend(candidate.anchor, candidate.elbow, candidate.connectorEnd)) return true
  if (boxIntersectsFeatureRing(candidate.box, mapCenter, protectedRadius)) return true
  if (segmentEntersFeatureRing(candidate.segments[1], mapCenter, protectedRadius)) return true

  const paddedCandidate = paddedBox(candidate.box)
  return placed.some((other) => {
    if (boxesOverlap(paddedCandidate, paddedBox(other.box))) return true
    if (other.segments.some((segment) => segmentIntersectsBox(segment[0], segment[1], paddedCandidate))) return true
    if (candidate.segments.some((segment) => segmentIntersectsBox(segment[0], segment[1], paddedBox(other.box)))) return true
    return candidate.segments.some((candidateSegment) =>
      other.segments.some((otherSegment) => segmentsStrictlyCross(candidateSegment[0], candidateSegment[1], otherSegment[0], otherSegment[1])),
    )
  })
}

export function layoutEnzymeCallouts(input: EnzymeCalloutLayoutInput): EnzymeCallout[] {
  return layoutEnzymeCalloutsWithResult(input, { allowFallbackCandidate: true }).callouts
}

export function layoutEnzymeCalloutsStrict(input: EnzymeCalloutLayoutInput): EnzymeCalloutLayoutResult {
  return layoutEnzymeCalloutsWithResult(input, { allowFallbackCandidate: false })
}

function layoutEnzymeCalloutsWithResult(input: EnzymeCalloutLayoutInput, options: { allowFallbackCandidate: boolean }): EnzymeCalloutLayoutResult {
  const { allowFallbackCandidate } = options
  const mapCenter = resolvedCenter(input)
  const { width: mapWidth, height: mapHeight } = layoutMapExtents(input)
  const protectedRadius = input.radius + (input.rulerContactOffset ?? 3) + COLLISION_GAP
  const minSecondSegment = MIN_LEADER_LENGTH - RADIAL_STUB_LENGTH
  const minLabelOffset = (input.rulerContactOffset ?? 3) + RADIAL_STUB_LENGTH + minSecondSegment
  const placed: EnzymeCallout[] = [...(input.initialPlaced ?? [])]
  const layout: Array<EnzymeCallout | undefined> = []
  let hasPlacementFailure = false
  const items = input.sites.map((site, index) => itemForSite(site, index, input))

  function clearEdgeX(side: Side, edgeY: number, labelWidth: number) {
    const dy = edgeY - mapCenter.y
    const clearHalfWidth = Math.sqrt(Math.max(0, protectedRadius * protectedRadius - dy * dy)) + COLLISION_GAP
    if (side === 'right') return Math.min(mapWidth - labelWidth - VIEW_PADDING, mapCenter.x + clearHalfWidth)
    return Math.max(labelWidth + VIEW_PADDING, mapCenter.x - clearHalfWidth)
  }

  function desiredYFor(item: LayoutItem) {
    return polarPoint(item.site.start, input.sequenceLength, mapCenter.x, mapCenter.y, input.radius, minLabelOffset, input.topology).y
  }

  function rowGapBetween(a: LayoutItem, b: LayoutItem) {
    return a.textHeight / 2 + b.textHeight / 2 + COLLISION_GAP * 2 + 1
  }

  ;(['upper-right', 'lower-right', 'upper-left', 'lower-left'] as const).forEach((quarter) => {
    const group = items.filter((item) => item.quarter === quarter).sort((a, b) => a.progress - b.progress || a.site.start - b.site.start)
    const movesUp = quarter === 'upper-right' || quarter === 'upper-left'
    const direction = movesUp ? -1 : 1
    const rows: Array<{ item: LayoutItem; edgeY: number }> = []
    group.forEach((item, index) => {
      const desiredY = desiredYFor(item)
      if (index === 0) {
        rows.push({ item, edgeY: desiredY })
        return
      }
      const previous = rows[index - 1]
      const rowGap = rowGapBetween(previous.item, item)
      rows.push({ item, edgeY: movesUp ? Math.min(desiredY, previous.edgeY - rowGap) : Math.max(desiredY, previous.edgeY + rowGap) })
    })

    if (rows.length) {
      const topOverflow = Math.max(0, VIEW_PADDING - Math.min(...rows.map((row) => row.edgeY - row.item.textHeight / 2)))
      const bottomOverflow = Math.max(0, Math.max(...rows.map((row) => row.edgeY + row.item.textHeight / 2)) - (mapHeight - VIEW_PADDING))
      const shift = topOverflow ? topOverflow : bottomOverflow ? -bottomOverflow : 0
      rows.forEach((row) => {
        row.edgeY += shift
      })
    }

    rows.toReversed().forEach(({ item, edgeY }) => {
      const candidates: Array<{ candidate: Candidate; score: number }> = []
      const rowGap = item.textHeight + COLLISION_GAP * 2 + 1

      for (let rowIndex = 0; rowIndex <= 14; rowIndex += 1) {
        const candidateY = edgeY + direction * rowIndex * rowGap
        const clearX = clearEdgeX(item.side, candidateY, item.labelWidth)
        const minimumLengthX = item.side === 'right' ? item.elbow.x + minSecondSegment : item.elbow.x - minSecondSegment
        const baseX = item.side === 'right' ? Math.max(clearX, minimumLengthX) : Math.min(clearX, minimumLengthX)
        for (let horizontalIndex = 0; horizontalIndex <= 16; horizontalIndex += 1) {
          const edgeX = item.side === 'right' ? baseX + horizontalIndex * 12 : baseX - horizontalIndex * 12
          const candidate = candidateAt(item, input, edgeX, candidateY)
          const connectorLength = Math.hypot(candidate.connectorEnd.x - candidate.elbow.x, candidate.connectorEnd.y - candidate.elbow.y)
          const totalLength = RADIAL_STUB_LENGTH + connectorLength
          const belowMinimumPenalty = Math.max(0, MIN_LEADER_LENGTH - totalLength) * 1000
          candidates.push({
            candidate,
            score: belowMinimumPenalty + Math.abs(totalLength - MIN_LEADER_LENGTH) * 8 + rowIndex * 28 + horizontalIndex * 8,
          })
        }
      }

      const valid = candidates
        .filter(({ candidate }) => !candidateViolations(candidate, placed, input, protectedRadius))
        .sort((a, b) => a.score - b.score)[0]
      const fallback = candidates
        .filter(({ candidate }) => boxInBounds(candidate.box, mapWidth, mapHeight))
        .sort((a, b) => a.score - b.score)[0] ?? candidates[0]
      const selectedCandidate = valid?.candidate ?? (allowFallbackCandidate ? fallback?.candidate : undefined)
      if (!selectedCandidate) {
        hasPlacementFailure = true
        return
      }
      const callout = {
        ...selectedCandidate,
        site: item.site,
        index: item.index,
        label: item.label,
      }

      placed.push(callout)
      layout[item.index] = callout
    })
  })

  return {
    callouts: layout.filter((item): item is EnzymeCallout => Boolean(item)),
    hasPlacementFailure,
  }
}

export function layoutEnzymeCalloutsPacked(input: EnzymeCalloutLayoutInput): EnzymeCallout[] {
  const items = input.sites.map((site, index) => itemForSite(site, index, input))
  const layout: Array<EnzymeCallout | undefined> = []
  const mapCenter = resolvedCenter(input)
  const { width: mapWidth, height: mapHeight } = layoutMapExtents(input)
  // Short radial leaders to an outer circular orbit. Dense sites spill to outer lanes
  // instead of sliding far around the orbit (which created ~R-long connectors).
  const basePad = Math.max(24, Math.min(56, Math.round(input.radius * 0.06)))
  const laneStep = Math.max(16, Math.min(28, Math.round(basePad * 0.55)))
  const maxLanes = 4
  const maxAngleDrift = (12 * Math.PI) / 180

  function clampBoxToViewport(box: Box): Box {
    const width = box.right - box.left
    const height = box.bottom - box.top
    const left = Math.max(VIEW_PADDING, Math.min(mapWidth - VIEW_PADDING - width, box.left))
    const top = Math.max(VIEW_PADDING, Math.min(mapHeight - VIEW_PADDING - height, box.top))
    return { left, right: left + width, top, bottom: top + height }
  }

  ;(['upper-right', 'upper-left', 'lower-right', 'lower-left'] as const).forEach((quarter) => {
    const group = items
      .filter((item) => item.quarter === quarter)
      .toSorted((a, b) => a.progress - b.progress || a.site.start - b.site.start)
    if (!group.length) return

    const isRight = quarter === 'upper-right' || quarter === 'lower-right'
    const laneCursors = Array.from({ length: maxLanes }, () => [] as Array<{ angle: number; halfSpan: number }>)

    group.forEach((item) => {
      const idealAngle = circularMapAngle(item.site.start, input.sequenceLength, input.topology)
      let chosenLane = 0
      let placedAngle = idealAngle
      for (let lane = 0; lane < maxLanes; lane += 1) {
        const orbit = input.radius + basePad + lane * laneStep
        const span = Math.max(0.01, (item.labelWidth / 2 + 3) / Math.max(1, orbit))
        let angle = idealAngle
        const occupied = laneCursors[lane]
        // Resolve against already-placed labels on this lane (ordered by angle).
        for (const other of occupied) {
          const minDelta = other.halfSpan + span
          if (Math.abs(angle - other.angle) < minDelta) {
            angle = other.angle + (angle >= other.angle ? minDelta : -minDelta)
          }
        }
        if (Math.abs(angle - idealAngle) <= maxAngleDrift || lane === maxLanes - 1) {
          chosenLane = lane
          placedAngle = angle
          laneCursors[lane].push({ angle: placedAngle, halfSpan: span })
          laneCursors[lane].sort((a, b) => a.angle - b.angle)
          break
        }
      }

      const orbit = input.radius + basePad + chosenLane * laneStep
      const attach = {
        x: mapCenter.x + Math.cos(idealAngle) * orbit,
        y: mapCenter.y + Math.sin(idealAngle) * orbit,
      }
      // Keep the leader radial (to the site angle). Offset only the text box tangentially.
      const tangent = { x: -Math.sin(idealAngle), y: Math.cos(idealAngle) }
      const drift = placedAngle - idealAngle
      const tangentPx = drift * orbit
      const outward = Math.max(4, Math.min(14, basePad * 0.3 + chosenLane * 2))
      const textCenter = {
        x: attach.x + Math.cos(idealAngle) * outward + tangent.x * tangentPx,
        y: attach.y + Math.sin(idealAngle) * outward + tangent.y * tangentPx,
      }
      let box: Box = isRight
        ? {
            left: textCenter.x,
            right: textCenter.x + item.labelWidth,
            top: textCenter.y - item.textHeight / 2,
            bottom: textCenter.y + item.textHeight / 2,
          }
        : {
            left: textCenter.x - item.labelWidth,
            right: textCenter.x,
            top: textCenter.y - item.textHeight / 2,
            bottom: textCenter.y + item.textHeight / 2,
          }
      box = clampBoxToViewport(box)
      // Leader ends at the radial attach point — short by construction (~basePad + lane).
      const connectorEnd = attach
      const connectorLen = Math.hypot(connectorEnd.x - item.elbow.x, connectorEnd.y - item.elbow.y)
      input.debugLog?.({
        kind: 'packed',
        quarter,
        siteBp: item.site.start,
        label: item.label,
        lane: chosenLane,
        angleDriftDeg: (drift * 180) / Math.PI,
        connectorLen,
        orbit,
        boxLeft: box.left,
        boxTop: box.top,
      })
      layout[item.index] = {
        site: item.site,
        index: item.index,
        anchor: item.anchor,
        elbow: item.elbow,
        connectorEnd,
        x: isRight ? box.left : box.right,
        y: (box.top + box.bottom) / 2 + item.textHeight / 2 - 3,
        label: item.label,
        textAnchor: isRight ? 'start' : 'end',
        box,
        segments: [
          [item.anchor, item.elbow],
          [item.elbow, connectorEnd],
        ],
      }
    })
  })

  return layout.filter((item): item is EnzymeCallout => Boolean(item))
}

export function collectLayoutViolations(callouts: EnzymeCallout[], input: EnzymeCalloutLayoutInput) {
  const protectedRadius = input.radius + (input.rulerContactOffset ?? 3) + COLLISION_GAP
  const mapCenter = resolvedCenter(input)
  const { width: mapWidth, height: mapHeight } = layoutMapExtents(input)
  const errors: string[] = []

  callouts.forEach((callout, index) => {
    if (!pointInBounds(callout.anchor, mapWidth, mapHeight) || !pointInBounds(callout.elbow, mapWidth, mapHeight) || !pointInBounds(callout.connectorEnd, mapWidth, mapHeight)) {
      errors.push(`callout ${index} has an out-of-bounds leader point`)
    }
    if (!boxInBounds(callout.box, mapWidth, mapHeight)) errors.push(`callout ${index} is out of bounds`)
    if (!hasNonAcuteBend(callout.anchor, callout.elbow, callout.connectorEnd)) errors.push(`callout ${index} has an acute bend`)
    if (boxIntersectsFeatureRing(callout.box, mapCenter, protectedRadius)) errors.push(`callout ${index} label intersects feature ring`)
    if (segmentEntersFeatureRing(callout.segments[1], mapCenter, protectedRadius)) errors.push(`callout ${index} connector intersects feature ring`)

    callouts.slice(index + 1).forEach((other, otherOffset) => {
      const otherIndex = index + 1 + otherOffset
      if (boxesOverlap(paddedBox(callout.box), paddedBox(other.box))) errors.push(`callout ${index} label overlaps callout ${otherIndex}`)
      callout.segments.forEach((segment, segmentIndex) => {
        if (segmentIntersectsBox(segment[0], segment[1], paddedBox(other.box))) errors.push(`callout ${index} segment ${segmentIndex} intersects callout ${otherIndex} label`)
      })
      other.segments.forEach((segment, segmentIndex) => {
        if (segmentIntersectsBox(segment[0], segment[1], paddedBox(callout.box))) errors.push(`callout ${otherIndex} segment ${segmentIndex} intersects callout ${index} label`)
      })
      callout.segments.forEach((segment, segmentIndex) => {
        other.segments.forEach((otherSegment, otherSegmentIndex) => {
          if (segmentsStrictlyCross(segment[0], segment[1], otherSegment[0], otherSegment[1])) {
            errors.push(`callout ${index} segment ${segmentIndex} intersects callout ${otherIndex} segment ${otherSegmentIndex}`)
          }
        })
      })
    })
  })

  return errors
}

export function hasNonBoundsLayoutViolations(callouts: EnzymeCallout[], input: EnzymeCalloutLayoutInput) {
  const protectedRadius = input.radius + (input.rulerContactOffset ?? 3) + COLLISION_GAP
  const center = resolvedCenter(input)

  for (let index = 0; index < callouts.length; index += 1) {
    const callout = callouts[index]
    if (!hasNonAcuteBend(callout.anchor, callout.elbow, callout.connectorEnd)) return true
    if (boxIntersectsFeatureRing(callout.box, center, protectedRadius)) return true
    if (segmentEntersFeatureRing(callout.segments[1], center, protectedRadius)) return true

    const paddedCallout = paddedBox(callout.box)
    for (let otherIndex = index + 1; otherIndex < callouts.length; otherIndex += 1) {
      const other = callouts[otherIndex]
      if (boxesOverlap(paddedCallout, paddedBox(other.box))) return true
      if (callout.segments.some((segment) => segmentIntersectsBox(segment[0], segment[1], paddedBox(other.box)))) return true
      if (other.segments.some((segment) => segmentIntersectsBox(segment[0], segment[1], paddedCallout))) return true
      if (callout.segments.some((segment) => other.segments.some((otherSegment) => segmentsStrictlyCross(segment[0], segment[1], otherSegment[0], otherSegment[1])))) {
        return true
      }
    }
  }

  return false
}

export function segmentLength(segment: Segment) {
  return Math.hypot(segment[1].x - segment[0].x, segment[1].y - segment[0].y)
}

export function calloutLeaderLength(callout: EnzymeCallout) {
  return callout.segments.reduce((total, segment) => total + segmentLength(segment), 0)
}

export function layoutLengthMetrics(callouts: EnzymeCallout[]) {
  const perCallout = callouts.map((callout) => ({
    label: callout.label,
    index: callout.index,
    start: callout.site.start,
    firstSegment: segmentLength(callout.segments[0]),
    secondSegment: segmentLength(callout.segments[1]),
    total: calloutLeaderLength(callout),
  }))
  const total = perCallout.reduce((sum, metric) => sum + metric.total, 0)
  return {
    total,
    average: perCallout.length ? total / perCallout.length : 0,
    longest: perCallout.toSorted((a, b) => b.total - a.total)[0] ?? null,
    perCallout,
  }
}

const LINEAR_LABEL_PADDING = 3

export function isPrimerCalloutSite(site: RestrictionSite) {
  return site.match.startsWith('__primer_callout__')
}

export type LinearEnzymeCalloutLayoutInput = {
  sites: RestrictionSite[]
  sequenceLength: number
  mapWidth: number
  mapHeight: number
  trackLeft: number
  trackRight: number
  /** Y of the rendered DNA strand / linear ruler line where cuts are marked. */
  strandY: number
  /** Legacy alias; only used when strandY is omitted. */
  backboneY?: number
  /** When set, label boxes must sit entirely above this Y (e.g. alignment trace band top). */
  labelCeilingY?: number
  protectedBandTop: number
  protectedBandBottom: number
  featureHeight?: number
  featureStubHeight?: number
  /** Extra clearance above the stub before row 1; does not change row-to-row spacing. */
  labelRowLift?: number
  labelForSite?: (site: RestrictionSite) => string
  textHeight?: number
  textWidth?: number
  labelPadding?: number
  labelWidthForSite?: (site: RestrictionSite, label: string) => number
  textHeightForSite?: (site: RestrictionSite) => number
  labelPaddingForSite?: (site: RestrictionSite) => number
  rulerContactOffset?: number
  /** @deprecated Use per-site primer routing; primers always guarantee placement when mapHeight allows. */
  guaranteePlacement?: boolean
  debugLog?: (entry: Record<string, unknown>) => void
}

function linearTrackPoint(position: number, sequenceLength: number, trackLeft: number, trackRight: number, y: number) {
  const span = Math.max(1, trackRight - trackLeft)
  return {
    x: trackLeft + (position / sequenceLength) * span,
    y,
  }
}

function linearStrandY(input: LinearEnzymeCalloutLayoutInput) {
  return input.strandY ?? input.backboneY ?? 52
}

function linearItemForSite(site: RestrictionSite, index: number, input: LinearEnzymeCalloutLayoutInput): LayoutItem {
  const label = input.labelForSite ? input.labelForSite(site) : `${site.enzyme.name} (${site.start + 1})`
  const textHeight = input.textHeightForSite ? input.textHeightForSite(site) : input.textHeight ?? TEXT_HEIGHT
  const textWidth = input.textWidth ?? TEXT_WIDTH
  const labelPadding = input.labelPaddingForSite ? input.labelPaddingForSite(site) : input.labelPadding ?? 6
  const measuredWidth = input.labelWidthForSite ? input.labelWidthForSite(site, label) : label.length * textWidth
  const displayCutPosition = Math.max(0, Math.min(input.sequenceLength, linearCutPosition(site)))
  const anchor = linearTrackPoint(displayCutPosition, input.sequenceLength, input.trackLeft, input.trackRight, linearStrandY(input))

  return {
    site,
    index,
    label,
    labelWidth: measuredWidth + labelPadding,
    textHeight,
    quarter: 'upper-right',
    side: 'right',
    anchor,
    elbow: anchor,
    progress: 0,
  }
}

function linearFeatureStubHeight(input: LinearEnzymeCalloutLayoutInput) {
  return input.featureStubHeight ?? (input.featureHeight ?? 24) * 2
}

type LinearHalf = 'left' | 'right'

export function linearCutPosition(site: RestrictionSite) {
  return site.cutTop ?? site.start
}

function linearHalfForSite(site: RestrictionSite, sequenceLength: number): LinearHalf {
  return linearCutPosition(site) / sequenceLength < 0.5 ? 'left' : 'right'
}

export type LinearSiteClusterInfo = {
  clusterId: number
  clusterSize: number
  indexInCluster: number
}

export function linearSiteClusterProximityPx(input: LinearEnzymeCalloutLayoutInput) {
  return (input.featureHeight ?? 24) / 2
}

function linearClusterTiltStepPx(input: LinearEnzymeCalloutLayoutInput) {
  return input.featureHeight ?? 24
}

/** Tilt by placement order in the cluster sweep: first placed fans outward, later placements fan inward. */
export function linearClusterPreferredLabelOffset(
  placementIndexInCluster: number,
  clusterSize: number,
  half: LinearHalf,
  input: LinearEnzymeCalloutLayoutInput,
) {
  const tiltStep = linearClusterTiltStepPx(input)
  const firstHalfCount = Math.ceil(clusterSize / 2)
  const inFirstHalf = placementIndexInCluster < firstHalfCount

  const tier =
    half === 'left'
      ? inFirstHalf
        ? firstHalfCount - 1 - placementIndexInCluster
        : placementIndexInCluster - firstHalfCount
      : inFirstHalf
        ? placementIndexInCluster
        : clusterSize - 1 - placementIndexInCluster
  const magnitude = Math.min((tier + 1) * tiltStep, tiltStep * 3)

  const outwardOffset = half === 'left' ? -magnitude : magnitude
  const inwardOffset = half === 'left' ? magnitude : -magnitude
  return inFirstHalf ? outwardOffset : inwardOffset
}

/** How far a label sits laterally from its anchor (larger = more outward on this half). */
export function linearClusterOutwardExtent(box: Box, anchorX: number, half: LinearHalf) {
  return half === 'left' ? anchorX - box.left : box.right - anchorX
}

/** Effective connector-side lateral shift from the anchor. */
export function linearClusterConnectorOutwardShift(box: Box, anchorX: number, half: LinearHalf) {
  return half === 'left' ? anchorX - box.right : box.left - anchorX
}

/** Leader-to-label attach point (connector meets label). */
export function linearLeaderAttachOutwardShift(attach: Point, anchorX: number, half: LinearHalf) {
  return half === 'left' ? anchorX - attach.x : attach.x - anchorX
}

export function linearLabelOutermostEdge(box: Box, half: LinearHalf) {
  return half === 'left' ? box.left : box.right
}

export function linearLeaderLateralSegment(callout: Pick<EnzymeCallout, 'segments'>) {
  const horizontal = callout.segments[2]
  if (!horizontal || Math.abs(horizontal[1].x - horizontal[0].x) <= 1.5) return undefined
  return horizontal
}

function linearContinuesLadder(item: LayoutItem, previous: EnzymeCallout | undefined, input: LinearEnzymeCalloutLayoutInput) {
  if (!previous) return false
  return Math.abs(item.anchor.x - previous.anchor.x) <= linearSiteClusterProximityPx(input)
}

/** Row indices to try for the next label in a half sweep (1-based row 1 = index 0). */
export function linearSweepRowsToTry(previousRowIndex: number | undefined, continueLadder = false) {
  if (previousRowIndex === undefined) return [0]
  if (continueLadder) {
    const rows = [previousRowIndex + 1]
    if (previousRowIndex > 0) rows.push(0)
    return rows
  }
  if (previousRowIndex > 0) return [0, previousRowIndex + 1]
  return [previousRowIndex + 1]
}

export function linearSweepRowTransitionAllowed(nextRowIndex: number, previousRowIndex: number | undefined) {
  if (previousRowIndex === undefined) return nextRowIndex === 0
  return nextRowIndex === previousRowIndex + 1 || (previousRowIndex > 0 && nextRowIndex === 0)
}

/** Horizontal gap between a label outer edge and a previous leader's lateral segment. */
export function linearGapToLateralLeader(outerEdge: number, leaderMin: number, leaderMax: number) {
  if (outerEdge < leaderMin) return leaderMin - outerEdge
  if (outerEdge > leaderMax) return outerEdge - leaderMax
  return 0
}

export function linearRowDropClearanceOk(
  candidate: Pick<Candidate, 'box' | 'connectorEnd'>,
  previous: Pick<EnzymeCallout, 'connectorEnd' | 'segments'>,
  half: LinearHalf,
  input: LinearEnzymeCalloutLayoutInput,
) {
  const clearance = (input.featureHeight ?? 24) / 2
  const outerEdge = linearLabelOutermostEdge(candidate.box, half)
  const lateral = linearLeaderLateralSegment(previous)
  if (!lateral) {
    const leaderX = previous.connectorEnd.x
    const gap = half === 'left' ? leaderX - outerEdge : outerEdge - leaderX
    return gap >= clearance
  }
  const leaderMin = Math.min(lateral[0].x, lateral[1].x)
  const leaderMax = Math.max(lateral[0].x, lateral[1].x)
  return linearGapToLateralLeader(outerEdge, leaderMin, leaderMax) >= clearance
}

export type LinearLadderGroupInfo = {
  anchorStart: number
  spreadEnd: number
  labelCount: number
  indexInGroup: number
}

/** Proximity chains in sweep order with at least two sites (a ladder). */
export function buildLinearLadderGroupMap(sorted: LayoutItem[], input: LinearEnzymeCalloutLayoutInput, half: LinearHalf) {
  const map = new Map<number, LinearLadderGroupInfo>()
  const proximity = linearSiteClusterProximityPx(input)
  const forwardClearance = (input.featureHeight ?? 24) / 2
  let groupStart = 0

  while (groupStart < sorted.length) {
    let groupEnd = groupStart
    while (groupEnd + 1 < sorted.length && Math.abs(sorted[groupEnd + 1].anchor.x - sorted[groupEnd].anchor.x) <= proximity) {
      groupEnd += 1
    }

    const labelCount = groupEnd - groupStart + 1
    if (labelCount >= 2) {
      const anchorStart = sorted[groupStart].anchor.x
      const fallbackEnd = sorted[groupEnd].anchor.x
      const nextItem = sorted[groupEnd + 1]
      const candidateSpreadEnd = nextItem
        ? half === 'left'
          ? nextItem.anchor.x - (nextItem.labelWidth + forwardClearance)
          : nextItem.anchor.x + (nextItem.labelWidth + forwardClearance)
        : fallbackEnd
      const spreadEnd = half === 'left' ? Math.max(fallbackEnd, candidateSpreadEnd) : Math.min(fallbackEnd, candidateSpreadEnd)
      for (let index = groupStart; index <= groupEnd; index += 1) {
        map.set(sorted[index].index, {
          anchorStart,
          spreadEnd,
          labelCount,
          indexInGroup: index - groupStart,
        })
      }
    }

    groupStart = groupEnd + 1
  }

  return map
}

/** Evenly spaced attach X: ladder span / label count per rung index. */
export function linearLadderTargetAttachX(group: LinearLadderGroupInfo) {
  const span = group.spreadEnd - group.anchorStart
  const step = span / group.labelCount
  return group.anchorStart + group.indexInGroup * step
}

export function linearIdealLabelOffsetForAttachX(item: LayoutItem, half: LinearHalf, targetAttachX: number) {
  const attachGap = COLLISION_GAP + 1
  if (half === 'right') {
    return targetAttachX - item.anchor.x - attachGap
  }
  return targetAttachX - item.anchor.x + attachGap
}

/** Signed offset magnitude in the outward direction for this half. */
export function linearClusterOutwardShift(labelOffsetX: number, half: LinearHalf) {
  return half === 'left' ? -labelOffsetX : labelOffsetX
}

/** Last placed site in the same cluster sweep step (immediate predecessor). */
function linearPreviousClusterMateInSweep(
  item: LayoutItem,
  placed: EnzymeCallout[],
  cluster: LinearSiteClusterInfo,
  clusterMap: Map<number, LinearSiteClusterInfo>,
  input: LinearEnzymeCalloutLayoutInput,
) {
  const proximity = linearSiteClusterProximityPx(input)

  for (let index = placed.length - 1; index >= 0; index -= 1) {
    const other = placed[index]
    if (clusterMap.get(other.index)?.clusterId !== cluster.clusterId) continue
    if (Math.abs(other.anchor.x - item.anchor.x) > proximity) return undefined
    return other
  }

  return undefined
}

function linearOffsetsForPlacement(
  item: LayoutItem,
  cluster: LinearSiteClusterInfo | undefined,
  half: LinearHalf,
  input: LinearEnzymeCalloutLayoutInput,
  maxHorizontalIndex: number,
  preferredLabelOffsetX: number,
  placed: EnzymeCallout[],
  clusterMap: Map<number, LinearSiteClusterInfo>,
  ladderGroup: LinearLadderGroupInfo | undefined,
  rowIndex: number,
  labelY: number,
) {
  const offsets = linearLabelOffsetsToTry(item, cluster, half, input, maxHorizontalIndex, preferredLabelOffsetX, placed, clusterMap)
  if (!ladderGroup || ladderGroup.labelCount < 2 || rowIndex <= 0) return offsets

  const targetAttachX = linearLadderTargetAttachX(ladderGroup)
  const idealOffset = cluster
    ? linearClampClusterLabelOffset(item, linearIdealLabelOffsetForAttachX(item, half, targetAttachX), half, input)
    : linearIdealLabelOffsetForAttachX(item, half, targetAttachX)
  const ranked = linearRankOffsetsByTargetAttach(offsets, item, input, labelY, half, targetAttachX)
  if (ranked.includes(idealOffset)) return ranked
  return [idealOffset, ...ranked]
}

/** Next label attach point must not be further outward than the previous label in the half sweep. */
function linearSweepAttachViolates(
  candidate: Pick<Candidate, 'anchor' | 'connectorEnd'>,
  previous: EnzymeCallout | undefined,
  half: LinearHalf,
) {
  if (!previous) return false
  const prevShift = linearLeaderAttachOutwardShift(previous.connectorEnd, previous.anchor.x, half)
  const nextShift = linearLeaderAttachOutwardShift(candidate.connectorEnd, candidate.anchor.x, half)
  return nextShift > prevShift + 0.5
}

function linearRankOffsetsByTargetAttach(
  offsets: number[],
  item: LayoutItem,
  input: LinearEnzymeCalloutLayoutInput,
  labelY: number,
  half: LinearHalf,
  targetAttachX: number,
) {
  return offsets.toSorted((a, b) => {
    const attachA = linearCandidateAt(item, input, labelY, half, a).connectorEnd.x
    const attachB = linearCandidateAt(item, input, labelY, half, b).connectorEnd.x
    return Math.abs(attachA - targetAttachX) - Math.abs(attachB - targetAttachX)
  })
}

/** Keep cluster fan offsets inside the map edges for the active half. */
export function linearClampClusterLabelOffset(
  item: LayoutItem,
  preferredOffset: number,
  half: LinearHalf,
  input: LinearEnzymeCalloutLayoutInput,
) {
  const attachGap = COLLISION_GAP + 1
  const edgePadding = VIEW_PADDING + COLLISION_GAP + 4

  if (half === 'right') {
    const maxLabelRight = input.mapWidth - edgePadding
    const attachEdge = Math.max(item.anchor.x + preferredOffset + attachGap, item.anchor.x + attachGap)
    const labelRight = attachEdge + item.labelWidth
    if (labelRight <= maxLabelRight) return preferredOffset
    return preferredOffset - (labelRight - maxLabelRight)
  }

  const minLabelLeft = input.trackLeft + edgePadding
  const attachEdge = Math.min(item.anchor.x + preferredOffset - attachGap, item.anchor.x - attachGap)
  const labelLeft = attachEdge - item.labelWidth
  if (labelLeft >= minLabelLeft) return preferredOffset
  return preferredOffset + (minLabelLeft - labelLeft)
}

export function buildLinearSiteClusterMap(items: LayoutItem[], input: LinearEnzymeCalloutLayoutInput): Map<number, LinearSiteClusterInfo> {
  const proximity = linearSiteClusterProximityPx(input)
  const sorted = items.toSorted((a, b) => a.anchor.x - b.anchor.x)
  const clusterMap = new Map<number, LinearSiteClusterInfo>()
  let clusterId = 0

  let clusterStart = 0
  while (clusterStart < sorted.length) {
    let clusterEnd = clusterStart
    while (clusterEnd + 1 < sorted.length && sorted[clusterEnd + 1].anchor.x - sorted[clusterEnd].anchor.x <= proximity) {
      clusterEnd += 1
    }

    const clusterSize = clusterEnd - clusterStart + 1
    if (clusterSize >= 2) {
      for (let indexInCluster = 0; indexInCluster < clusterSize; indexInCluster += 1) {
        const item = sorted[clusterStart + indexInCluster]
        clusterMap.set(item.index, {
          clusterId,
          clusterSize,
          indexInCluster,
        })
      }
      clusterId += 1
    }

    clusterStart = clusterEnd + 1
  }

  return clusterMap
}

/** Shared row ladder for a half — same vertical pitch for every label (avoids per-site row gaps). */
function linearUniformRowLadder(input: LinearEnzymeCalloutLayoutInput, items: LayoutItem[]) {
  const ladderTextHeight = items.reduce((min, item) => Math.min(min, item.textHeight), items[0]?.textHeight ?? TEXT_HEIGHT)
  // Must clear padded label boxes (text + LINEAR_LABEL_PADDING on each side), not just raw text height.
  const rowGap = linearCalloutLadderRowGap(ladderTextHeight)
  const stubHeight = linearFeatureStubHeight(input)
  const baseLabelY = linearStrandY(input) - stubHeight - ladderTextHeight / 2 - COLLISION_GAP
  return { baseLabelY, rowGap, ladderTextHeight }
}

function linearLabelOffsetsToTry(
  item: LayoutItem,
  cluster: LinearSiteClusterInfo | undefined,
  half: LinearHalf,
  input: LinearEnzymeCalloutLayoutInput,
  maxHorizontalIndex: number,
  preferredLabelOffsetX: number,
  placed: EnzymeCallout[],
  clusterMap: Map<number, LinearSiteClusterInfo>,
) {
  const offsets: number[] = []
  const seen = new Set<number>()
  const previousMate = cluster ? linearPreviousClusterMateInSweep(item, placed, cluster, clusterMap, input) : undefined

  const add = (value: number) => {
    const offset = cluster ? linearClampClusterLabelOffset(item, value, half, input) : value
    if (seen.has(offset)) return
    seen.add(offset)
    offsets.push(offset)
  }

  if (cluster) {
    const step = linearClusterTiltStepPx(input)
    add(preferredLabelOffsetX)
    add(0)
    for (let delta = 1; delta <= 2; delta += 1) {
      add(preferredLabelOffsetX + step * delta)
      add(preferredLabelOffsetX - step * delta)
    }
  } else {
    add(0)
  }

  for (let horizontalIndex = 0; horizontalIndex <= maxHorizontalIndex; horizontalIndex += 1) {
    for (const offset of linearHorizontalOffsets(horizontalIndex, half)) add(offset)
  }

  if (!cluster) return offsets

  return offsets.toSorted((a, b) => {
    const delta = linearClusterOutwardShift(a, half) - linearClusterOutwardShift(b, half)
    return previousMate ? delta : -delta
  })
}

function linearHorizontalOffsets(index: number, half: LinearHalf) {
  if (index === 0) return [0]
  const step = index * 8
  return half === 'left' ? [-step] : [step]
}

function linearCandidateAt(
  item: LayoutItem,
  input: LinearEnzymeCalloutLayoutInput,
  labelY: number,
  half: LinearHalf,
  labelOffsetX: number,
): Candidate {
  const textHeight = item.textHeight
  const stubHeight = linearFeatureStubHeight(input)
  const attachGap = COLLISION_GAP + 1
  const anchor = item.anchor
  const knee = { x: anchor.x, y: anchor.y - stubHeight }
  const labelAnchorX = anchor.x + labelOffsetX
  const box =
    half === 'left'
      ? {
          right: Math.min(labelAnchorX - attachGap, anchor.x - attachGap),
          left: Math.min(labelAnchorX - attachGap, anchor.x - attachGap) - item.labelWidth,
          top: labelY - textHeight / 2,
          bottom: labelY + textHeight / 2,
        }
      : {
          left: Math.max(labelAnchorX + attachGap, anchor.x + attachGap),
          right: Math.max(labelAnchorX + attachGap, anchor.x + attachGap) + item.labelWidth,
          top: labelY - textHeight / 2,
          bottom: labelY + textHeight / 2,
        }

  const connectorEnd =
    knee.y >= box.bottom - 0.5
      ? half === 'left'
        ? { x: box.right, y: box.bottom }
        : { x: box.left, y: box.bottom }
      : half === 'left'
        ? { x: box.right, y: box.top }
        : { x: box.left, y: box.top }
  const riseEnd = { x: anchor.x, y: connectorEnd.y }

  return {
    anchor,
    elbow: knee,
    connectorEnd,
    x: box.left,
    y: labelY,
    textAnchor: 'start',
    box,
    segments: [
      [anchor, knee],
      [knee, riseEnd],
      [riseEnd, connectorEnd],
    ],
  }
}

function linearProtectedBand(input: LinearEnzymeCalloutLayoutInput): Box {
  return {
    left: input.trackLeft - COLLISION_GAP,
    right: input.trackRight + COLLISION_GAP,
    top: input.protectedBandTop - COLLISION_GAP,
    bottom: input.protectedBandBottom + COLLISION_GAP,
  }
}

function segmentIntersectsProtectedBand(segment: Segment, band: Box) {
  return segmentIntersectsBox(segment[0], segment[1], band)
}

function linearPointInBounds(point: Point, input: LinearEnzymeCalloutLayoutInput, padding = VIEW_PADDING) {
  return point.y <= input.mapHeight - padding
}

function linearAnchorOnTrack(point: Point, input: LinearEnzymeCalloutLayoutInput) {
  return point.x >= input.trackLeft - 1 && point.x <= input.trackRight + 1
}

function linearLabelOverflowPadding(input: LinearEnzymeCalloutLayoutInput) {
  return Math.max(160, Math.min(420, input.mapWidth * 0.35), (input.featureHeight ?? 24) * 6)
}

function linearBoxInBounds(box: Box, input: LinearEnzymeCalloutLayoutInput, half: LinearHalf, padding = VIEW_PADDING) {
  const overflow = linearLabelOverflowPadding(input)
  const leftLimit = input.trackLeft - overflow - padding
  const rightLimit = Math.max(input.mapWidth, input.trackRight) + overflow + padding
  const withinX = half === 'left' ? box.right <= rightLimit && box.left >= leftLimit : box.left >= leftLimit && box.right <= rightLimit
  return withinX && box.bottom <= input.protectedBandTop - COLLISION_GAP
}

function linearSegmentIsHorizontal(segment: Segment) {
  return Math.abs(segment[1].y - segment[0].y) <= 1.5
}

function linearPaddedLabelBox(box: Box) {
  return paddedBox(box, LINEAR_LABEL_PADDING)
}

function linearSegmentHitsLabelBox(segment: Segment, box: Box) {
  return segmentIntersectsBox(segment[0], segment[1], linearPaddedLabelBox(box))
}

function linearConnectorReachSegment(segments: Segment[]) {
  return segments[2] ?? segments[1]
}

function linearCalloutWidth(callout: Pick<EnzymeCallout, 'box'>) {
  return callout.box.right - callout.box.left
}

function linearCalloutOutermostEdgeX(callout: EnzymeCallout, half: LinearHalf) {
  return half === 'left' ? callout.box.left : callout.box.right
}

function linearRetargetCalloutAttachX(callout: EnzymeCallout, nextAttachX: number, half: LinearHalf): EnzymeCallout {
  const width = linearCalloutWidth(callout)
  const box =
    half === 'left'
      ? {
          ...callout.box,
          right: nextAttachX,
          left: nextAttachX - width,
        }
      : {
          ...callout.box,
          left: nextAttachX,
          right: nextAttachX + width,
        }
  const connectorEnd = { x: nextAttachX, y: callout.connectorEnd.y }
  const riseEnd = { x: callout.anchor.x, y: connectorEnd.y }
  return {
    ...callout,
    x: box.left,
    box,
    connectorEnd,
    segments: [
      [callout.anchor, callout.elbow],
      [callout.elbow, riseEnd],
      [riseEnd, connectorEnd],
    ],
  }
}

function linearPostSpreadLadders(
  sortedItems: LayoutItem[],
  rowByIndex: Map<number, number>,
  layout: Array<EnzymeCallout | undefined>,
  placed: EnzymeCallout[],
  input: LinearEnzymeCalloutLayoutInput,
  half: LinearHalf,
  ladderGroupMap: Map<number, LinearLadderGroupInfo>,
) {
  if (sortedItems.length < 2) return
  const halfFeature = (input.featureHeight ?? 24) / 2
  const placedIndex = new Map<number, number>()
  placed.forEach((callout, index) => placedIndex.set(callout.index, index))
  const ordered = sortedItems
    .map((item) => layout[item.index])
    .filter((callout): callout is EnzymeCallout => Boolean(callout))

  let cursor = 0
  while (cursor < ordered.length - 1) {
    const current = ordered[cursor]
    const currentRow = rowByIndex.get(current.index)
    const next = ordered[cursor + 1]
    const nextRow = next ? rowByIndex.get(next.index) : undefined
    if (currentRow !== 0 || nextRow !== 1 || !next) {
      cursor += 1
      continue
    }
    const currentLadder = ladderGroupMap.get(current.index)
    const nextLadder = ladderGroupMap.get(next.index)
    if (
      !currentLadder ||
      !nextLadder ||
      currentLadder.anchorStart !== nextLadder.anchorStart ||
      currentLadder.spreadEnd !== nextLadder.spreadEnd ||
      currentLadder.labelCount !== nextLadder.labelCount
    ) {
      cursor += 1
      continue
    }

    let end = cursor + 1
    while (end + 1 < ordered.length) {
      const previous = ordered[end]
      const candidate = ordered[end + 1]
      const prevRow = rowByIndex.get(previous.index)
      const candidateRow = rowByIndex.get(candidate.index)
      const previousLadder = ladderGroupMap.get(previous.index)
      const candidateLadder = ladderGroupMap.get(candidate.index)
      if (prevRow == null || candidateRow == null) break
      if (
        !previousLadder ||
        !candidateLadder ||
        previousLadder.anchorStart !== currentLadder.anchorStart ||
        candidateLadder.anchorStart !== currentLadder.anchorStart ||
        previousLadder.spreadEnd !== currentLadder.spreadEnd ||
        candidateLadder.spreadEnd !== currentLadder.spreadEnd ||
        previousLadder.labelCount !== currentLadder.labelCount ||
        candidateLadder.labelCount !== currentLadder.labelCount
      ) {
        break
      }
      if (candidateRow !== prevRow + 1) break
      end += 1
    }

    const ladder = ordered.slice(cursor, end + 1)
    if (ladder.length < 2) {
      cursor = end + 1
      continue
    }

    const nextAfterLadder = ordered[end + 1]
    const spreadEnd = nextAfterLadder
      ? half === 'left'
        ? linearCalloutOutermostEdgeX(nextAfterLadder, half) + halfFeature
        : linearCalloutOutermostEdgeX(nextAfterLadder, half) - halfFeature
      : ladder[ladder.length - 1].anchor.x
    const startAttach = ladder[0].anchor.x
    const boundedEnd =
      half === 'left' ? Math.max(spreadEnd, startAttach + 1) : Math.min(spreadEnd, startAttach - 1)
    const step = (boundedEnd - startAttach) / ladder.length

    ladder.forEach((callout, indexInLadder) => {
      if (indexInLadder === 0) {
        return
      }
      let targetAttachX = Number((startAttach + indexInLadder * step).toFixed(2))
      if (half === 'left') {
        targetAttachX = Math.min(targetAttachX, callout.connectorEnd.x)
      } else {
        targetAttachX = Math.max(targetAttachX, callout.connectorEnd.x)
        const previousAdjusted = ordered[cursor + indexInLadder - 1]
        if (previousAdjusted) {
          const maxShift = linearLeaderAttachOutwardShift(previousAdjusted.connectorEnd, previousAdjusted.anchor.x, half) + 0.5
          const nextShift = linearLeaderAttachOutwardShift({ x: targetAttachX, y: callout.connectorEnd.y }, callout.anchor.x, half)
          if (nextShift > maxShift) {
            targetAttachX = Math.floor((callout.anchor.x + maxShift) * 100) / 100
          }
        }
      }
      const adjusted = linearRetargetCalloutAttachX(callout, targetAttachX, half)
      layout[adjusted.index] = adjusted
      const position = placedIndex.get(adjusted.index)
      if (position != null) {
        placed[position] = adjusted
      }
      ordered[cursor + indexInLadder] = adjusted
    })

    cursor = end + 1
  }
}

/** Vertical pitch between linear callout ladder rows (padded label boxes). */
export function linearCalloutLadderRowGap(textHeight = TEXT_HEIGHT) {
  return textHeight + LINEAR_LABEL_PADDING * 2 + COLLISION_GAP * 2 + 1
}

/**
 * Space above `strandY` needed so `rowCount` ladder rows stay fully drawn
 * (matches {@link layoutLinearEnzymeCalloutsSimple} / guaranteePlacement pitch).
 */
export function linearCalloutLadderHeightAboveStrand(
  rowCount: number,
  textHeight = TEXT_HEIGHT,
  stubHeight = 48,
  labelRowLift = 0,
) {
  const rows = Math.max(1, rowCount)
  const rowGap = linearCalloutLadderRowGap(textHeight)
  return stubHeight + textHeight + COLLISION_GAP + labelRowLift + (rows - 1) * rowGap + VIEW_PADDING
}

/** Minimum map height so `guaranteePlacement` labels up to rowCount rows fit in bounds. */
export function estimateLinearMapHeightForRows(
  rowCount: number,
  input: Pick<
    LinearEnzymeCalloutLayoutInput,
    'strandY' | 'featureStubHeight' | 'featureHeight' | 'protectedBandBottom' | 'textHeight' | 'labelRowLift' | 'labelCeilingY'
  >,
  ladderTextHeight = input.textHeight ?? TEXT_HEIGHT,
) {
  const stubHeight = input.featureStubHeight ?? (input.featureHeight ?? 24) * 2
  const rowLift = input.labelRowLift ?? 0
  const rowGap = linearCalloutLadderRowGap(ladderTextHeight)
  const strandY = input.strandY ?? 52
  let baseLabelY = strandY - stubHeight - ladderTextHeight / 2 - COLLISION_GAP - rowLift
  if (input.labelCeilingY != null) {
    baseLabelY = Math.min(baseLabelY, input.labelCeilingY - COLLISION_GAP - ladderTextHeight / 2)
  }
  const rows = Math.max(1, rowCount)
  const topLabelCenterY = baseLabelY - (rows - 1) * rowGap
  const topExtent = topLabelCenterY - ladderTextHeight / 2 - VIEW_PADDING
  return Math.max(400, input.protectedBandBottom + 96, Math.ceil(input.protectedBandBottom + stubHeight + rows * rowGap + 48), Math.ceil(-topExtent + 40))
}

function linearLeaderSegmentsIntersect(a: Pick<Candidate, 'segments'>, b: Pick<Candidate, 'segments'>) {
  return a.segments.some((aSegment) => b.segments.some((bSegment) => segmentsIntersect(aSegment[0], aSegment[1], bSegment[0], bSegment[1])))
}

function linearLeaderHitsLabelBox(segments: Segment[], box: Box) {
  return segments.some((segment) => linearSegmentHitsLabelBox(segment, box))
}

/** Full leader geometry vs padded label boxes in both directions. */
function linearSegmentLabelCollisions(candidate: Candidate, placed: EnzymeCallout[]) {
  return placed.some((other) => {
    return linearLeaderHitsLabelBox(candidate.segments, other.box) || linearLeaderHitsLabelBox(other.segments, candidate.box)
  })
}

function linearCandidateViolations(candidate: Candidate, placed: EnzymeCallout[], input: LinearEnzymeCalloutLayoutInput, half: LinearHalf) {
  const band = linearProtectedBand(input)
  if (!linearAnchorOnTrack(candidate.anchor, input) || !linearPointInBounds(candidate.elbow, input) || !linearPointInBounds(candidate.connectorEnd, input)) return true
  if (!linearBoxInBounds(candidate.box, input, half)) return true
  if (candidate.box.bottom > band.top - COLLISION_GAP) return true
  if (candidate.segments.some((segment) => linearSegmentIsHorizontal(segment) && segmentIntersectsProtectedBand(segment, band))) return true
  if (linearSegmentLabelCollisions(candidate, placed)) return true

  const paddedCandidate = linearPaddedLabelBox(candidate.box)
  return placed.some((other) => {
    if (boxesOverlap(paddedCandidate, linearPaddedLabelBox(other.box))) return true
    return linearLeaderSegmentsIntersect(candidate, other)
  })
}

function layoutLinearEnzymeCalloutsWithResult(input: LinearEnzymeCalloutLayoutInput, options: { allowFallbackCandidate: boolean }): EnzymeCalloutLayoutResult {
  const { allowFallbackCandidate } = options
  const placed: EnzymeCallout[] = []
  const layout: Array<EnzymeCallout | undefined> = []
  let hasPlacementFailure = false
  const items = input.sites.map((site, index) => linearItemForSite(site, index, input))

  function placeGroup(group: LayoutItem[], half: LinearHalf, order: 'asc' | 'desc') {
    const sorted =
      order === 'asc'
        ? group.toSorted((a, b) => linearCutPosition(a.site) - linearCutPosition(b.site) || a.site.start - b.site.start)
        : group.toSorted((a, b) => linearCutPosition(b.site) - linearCutPosition(a.site) || b.site.start - a.site.start)
    const clusterMap = buildLinearSiteClusterMap(sorted, input)
    const ladderGroupMap = buildLinearLadderGroupMap(sorted, input, half)
    const clusterPlacementIndex = new Map<number, number>()
    const rowByIndex = new Map<number, number>()
    const { baseLabelY, rowGap } = linearUniformRowLadder(input, sorted)
    let previousPlacement:
      | { enzyme: string; cutTop: number; rowIndex: number; labelY: number }
      | undefined
    let previousSweepCallout: EnzymeCallout | undefined

    sorted.forEach((item, placementOrder) => {
      const guaranteesPlacement = isPrimerCalloutSite(item.site) || (input.guaranteePlacement ?? false)
      const cluster = clusterMap.get(item.index)
      const placementIndexInCluster = cluster ? (clusterPlacementIndex.get(cluster.clusterId) ?? 0) : 0
      const rawPreferredLabelOffsetX = cluster
        ? linearClusterPreferredLabelOffset(placementIndexInCluster, cluster.clusterSize, half, input)
        : 0
      const preferredLabelOffsetX = cluster
        ? linearClampClusterLabelOffset(item, rawPreferredLabelOffsetX, half, input)
        : 0
      if (cluster) clusterPlacementIndex.set(cluster.clusterId, placementIndexInCluster + 1)

      const rowsToTry = linearSweepRowsToTry(
        previousPlacement?.rowIndex,
        linearContinuesLadder(item, previousSweepCallout, input),
      )
      const startRowIndex = rowsToTry[0] ?? 0
      let selectedCandidate: Candidate | undefined
      let chosenRowIndex = startRowIndex
      let chosenLabelOffsetX = 0

      const acceptCandidate = (candidate: Candidate, rowIndex: number) => {
        if (!linearSweepRowTransitionAllowed(rowIndex, previousPlacement?.rowIndex)) return false
        if (
          rowIndex === 0 &&
          previousPlacement &&
          previousPlacement.rowIndex > 0 &&
          previousSweepCallout &&
          !linearRowDropClearanceOk(candidate, previousSweepCallout, half, input)
        ) {
          return false
        }
        if (linearCandidateViolations(candidate, placed, input, half)) return false
        if (linearSweepAttachViolates(candidate, previousSweepCallout, half)) return false
        return true
      }

      const tryRows = (rowIndices: number[]) => {
        for (const rowIndex of rowIndices) {
          if (selectedCandidate) break
          const labelY = baseLabelY - rowIndex * rowGap
          const labelOffsets = linearOffsetsForPlacement(
            item,
            cluster,
            half,
            input,
            cluster ? 2 : 4,
            preferredLabelOffsetX,
            placed,
            clusterMap,
            ladderGroupMap.get(item.index),
            rowIndex,
            labelY,
          )
          for (const labelOffsetX of labelOffsets) {
            const candidate = linearCandidateAt(item, input, labelY, half, labelOffsetX)
            if (acceptCandidate(candidate, rowIndex)) {
              selectedCandidate = candidate
              chosenRowIndex = rowIndex
              chosenLabelOffsetX = labelOffsetX
              break
            }
          }
        }
      }

      tryRows(rowsToTry)

      if (!selectedCandidate && allowFallbackCandidate) {
        const candidates: Array<{ candidate: Candidate; score: number; labelOffsetX: number; rowIndex: number }> = []
        for (const rowIndex of rowsToTry) {
          const labelY = baseLabelY - rowIndex * rowGap
          const labelOffsets = linearOffsetsForPlacement(
            item,
            cluster,
            half,
            input,
            cluster ? 2 : 4,
            preferredLabelOffsetX,
            placed,
            clusterMap,
            ladderGroupMap.get(item.index),
            rowIndex,
            labelY,
          )
          for (const labelOffsetX of labelOffsets) {
            const candidate = linearCandidateAt(item, input, labelY, half, labelOffsetX)
            if (!acceptCandidate(candidate, rowIndex)) continue
            const reach = linearConnectorReachSegment(candidate.segments)
            const connectorTilt = reach ? Math.abs(reach[1].x - reach[0].x) : 0
            const clusterTiltPenalty = cluster
              ? Math.abs(labelOffsetX - preferredLabelOffsetX) * 10 + (connectorTilt < 1 ? 18 : 0)
              : connectorTilt * 4 + Math.abs(labelOffsetX) * 2
            const rowPenalty = rowIndex === rowsToTry[0] ? 0 : rowIndex === 0 ? 6 : 12
            candidates.push({
              candidate,
              score: rowIndex * 4 + clusterTiltPenalty + rowPenalty,
              labelOffsetX,
              rowIndex,
            })
          }
        }
        const best = candidates.toSorted((a, b) => a.score - b.score)[0]
        selectedCandidate = best?.candidate
        if (best) {
          chosenRowIndex = best.rowIndex
          chosenLabelOffsetX = best.labelOffsetX
        }
      }

      if (!selectedCandidate && guaranteesPlacement) {
        const forcedRows = rowsToTry
        for (const rowIndex of forcedRows) {
          if (selectedCandidate) break
          const labelY = baseLabelY - rowIndex * rowGap
          const labelOffsets = linearOffsetsForPlacement(
            item,
            cluster,
            half,
            input,
            cluster ? 2 : 4,
            preferredLabelOffsetX,
            placed,
            clusterMap,
            ladderGroupMap.get(item.index),
            rowIndex,
            labelY,
          )
          for (const labelOffsetX of labelOffsets.length ? labelOffsets : [0]) {
            const candidate = linearCandidateAt(item, input, labelY, half, labelOffsetX)
            const band = linearProtectedBand(input)
            const withinGeometry =
              linearAnchorOnTrack(candidate.anchor, input) &&
              linearPointInBounds(candidate.elbow, input) &&
              linearPointInBounds(candidate.connectorEnd, input) &&
              linearBoxInBounds(candidate.box, input, half) &&
              candidate.box.bottom <= band.top - COLLISION_GAP &&
              !candidate.segments.some((segment) => linearSegmentIsHorizontal(segment) && segmentIntersectsProtectedBand(segment, band)) &&
              !linearSweepAttachViolates(candidate, previousSweepCallout, half) &&
              (rowIndex !== 0 ||
                !previousPlacement ||
                previousPlacement.rowIndex === 0 ||
                !previousSweepCallout ||
                linearRowDropClearanceOk(candidate, previousSweepCallout, half, input))
            if (withinGeometry) {
              selectedCandidate = candidate
              chosenRowIndex = rowIndex
              chosenLabelOffsetX = labelOffsetX
              break
            }
          }
        }
      }

      if (!selectedCandidate) {
        hasPlacementFailure = true
        input.debugLog?.({
          event: 'placement_failed',
          half,
          placementOrder,
          enzyme: item.site.enzyme.name,
          cutTop: linearCutPosition(item.site),
          anchorX: item.anchor.x,
          preferredLabelOffsetX,
          rawPreferredLabelOffsetX: cluster ? rawPreferredLabelOffsetX : 0,
          guaranteesPlacement,
        })
        return
      }

      const callout = {
        ...selectedCandidate,
        site: item.site,
        index: item.index,
        label: item.label,
        labelOffsetX: chosenLabelOffsetX,
      }
      placed.push(callout)
      layout[item.index] = callout
      rowByIndex.set(item.index, chosenRowIndex)

      const rowJump = previousPlacement ? chosenRowIndex - previousPlacement.rowIndex : 0
      input.debugLog?.({
        event: 'placed',
        half,
        placementOrder,
        enzyme: item.site.enzyme.name,
        cutTop: linearCutPosition(item.site),
        anchorX: Number(item.anchor.x.toFixed(2)),
        rowIndex: chosenRowIndex,
        rowsToTry,
        rowGap: Number(rowGap.toFixed(2)),
        preferredLabelOffsetX,
        rawPreferredLabelOffsetX: cluster ? rawPreferredLabelOffsetX : 0,
        clusterId: cluster?.clusterId,
        indexInCluster: cluster?.indexInCluster,
        labelOffsetX: chosenLabelOffsetX,
        placementIndexInCluster: cluster ? placementIndexInCluster : undefined,
        labelY: Number(((callout.box.top + callout.box.bottom) / 2).toFixed(2)),
        rowJump,
        attachOutwardShift: Number(linearLeaderAttachOutwardShift(callout.connectorEnd, callout.anchor.x, half).toFixed(2)),
      })
      if (previousPlacement && !linearSweepRowTransitionAllowed(chosenRowIndex, previousPlacement.rowIndex)) {
        input.debugLog?.({
          event: 'row_transition_violation',
          half,
          enzyme: item.site.enzyme.name,
          cutTop: linearCutPosition(item.site),
          previous: previousPlacement,
          rowJump,
        })
      }
      previousPlacement = {
        enzyme: item.site.enzyme.name,
        cutTop: linearCutPosition(item.site),
        rowIndex: chosenRowIndex,
        labelY: (callout.box.top + callout.box.bottom) / 2,
      }
      previousSweepCallout = callout
    })

    linearPostSpreadLadders(sorted, rowByIndex, layout, placed, input, half, ladderGroupMap)
  }

  const leftItems = items.filter((item) => linearHalfForSite(item.site, input.sequenceLength) === 'left')
  const rightItems = items.filter((item) => linearHalfForSite(item.site, input.sequenceLength) === 'right')
  placeGroup(leftItems, 'left', 'asc')
  placeGroup(rightItems, 'right', 'desc')

  return {
    callouts: layout.filter((item): item is EnzymeCallout => Boolean(item)),
    hasPlacementFailure,
  }
}

export function layoutLinearEnzymeCallouts(input: LinearEnzymeCalloutLayoutInput): EnzymeCallout[] {
  return layoutLinearEnzymeCalloutsWithResult(input, { allowFallbackCandidate: true }).callouts
}

/** Throws when {@link collectLinearLayoutViolations} finds any issue (for tests and debug). */
export function assertLinearLayoutValid(callouts: EnzymeCallout[], input: LinearEnzymeCalloutLayoutInput) {
  const errors = collectLinearLayoutViolations(callouts, input)
  if (errors.length) throw new Error(errors.join('\n'))
}

export function layoutLinearEnzymeCalloutsStrict(input: LinearEnzymeCalloutLayoutInput): EnzymeCalloutLayoutResult {
  return layoutLinearEnzymeCalloutsWithResult(input, { allowFallbackCandidate: false })
}

export function collectLinearLayoutViolations(callouts: EnzymeCallout[], input: LinearEnzymeCalloutLayoutInput) {
  const band = linearProtectedBand(input)
  const errors: string[] = []

  callouts.forEach((callout, index) => {
    if (!linearAnchorOnTrack(callout.anchor, input) || !linearPointInBounds(callout.elbow, input) || !linearPointInBounds(callout.connectorEnd, input)) {
      errors.push(`callout ${index} has an out-of-bounds leader point`)
    }
    const half = linearHalfForSite(callout.site, input.sequenceLength)
    if (!linearBoxInBounds(callout.box, input, half)) errors.push(`callout ${index} is out of bounds`)
    if (callout.box.bottom > band.top - COLLISION_GAP) errors.push(`callout ${index} label intersects protected band`)
    if (callout.segments.some((segment) => linearSegmentIsHorizontal(segment) && segmentIntersectsProtectedBand(segment, band))) {
      errors.push(`callout ${index} connector intersects protected band`)
    }

    callouts.slice(index + 1).forEach((other, otherOffset) => {
      const otherIndex = index + 1 + otherOffset
      if (boxesOverlap(linearPaddedLabelBox(callout.box), linearPaddedLabelBox(other.box))) {
        errors.push(`callout ${index} label overlaps callout ${otherIndex}`)
      }
      callout.segments.forEach((segment, segmentIndex) => {
        if (linearSegmentHitsLabelBox(segment, other.box)) {
          errors.push(`callout ${index} leader segment ${segmentIndex} intersects callout ${otherIndex} label`)
        }
      })
      other.segments.forEach((segment, segmentIndex) => {
        if (linearSegmentHitsLabelBox(segment, callout.box)) {
          errors.push(`callout ${otherIndex} leader segment ${segmentIndex} intersects callout ${index} label`)
        }
      })
      callout.segments.forEach((segment, segmentIndex) => {
        other.segments.forEach((otherSegment, otherSegmentIndex) => {
          if (segmentsIntersect(segment[0], segment[1], otherSegment[0], otherSegment[1])) {
            errors.push(`callout ${index} leader segment ${segmentIndex} intersects callout ${otherIndex} leader segment ${otherSegmentIndex}`)
          }
        })
      })
    })
  })

  return errors
}

function linearCalloutHorizontalExtent(callout: EnzymeCallout) {
  return {
    minX: Math.min(callout.box.left, callout.anchor.x, callout.elbow.x, callout.connectorEnd.x),
    maxX: Math.max(callout.box.right, callout.anchor.x, callout.elbow.x, callout.connectorEnd.x),
  }
}

/**
 * After routing, inset the sequence track so outward edge labels fit inside `mapWidth`
 * (usually the viewport width) without widening the SVG past the panel.
 */
export function computeLinearTrackLayout(
  viewportWidth: number,
  callouts: EnzymeCallout[],
  sidePadding: number,
  minTrackSpan = 240,
  labelEdgePadding = VIEW_PADDING + COLLISION_GAP + 4,
) {
  const mapWidth = Math.max(320, viewportWidth)
  const defaultTrackLeft = sidePadding
  const defaultTrackRight = Math.max(defaultTrackLeft + minTrackSpan, mapWidth - sidePadding)

  if (!callouts.length) {
    return { mapWidth, trackLeft: defaultTrackLeft, trackRight: defaultTrackRight }
  }

  let minX = Infinity
  let maxX = -Infinity
  callouts.forEach((callout) => {
    const extent = linearCalloutHorizontalExtent(callout)
    minX = Math.min(minX, extent.minX)
    maxX = Math.max(maxX, extent.maxX)
  })

  const leftOverflow = Math.max(0, defaultTrackLeft + labelEdgePadding - minX)
  const rightOverflow = Math.max(0, maxX - (defaultTrackRight - labelEdgePadding))
  let trackLeft = defaultTrackLeft + leftOverflow
  let trackRight = defaultTrackRight - rightOverflow

  if (trackRight - trackLeft >= minTrackSpan) {
    return { mapWidth, trackLeft, trackRight }
  }

  const expandedMapWidth = Math.max(
    mapWidth,
    Math.ceil(leftOverflow + minTrackSpan + rightOverflow + sidePadding * 2 + labelEdgePadding * 2),
  )
  trackLeft = sidePadding + leftOverflow
  trackRight = trackLeft + minTrackSpan
  return { mapWidth: expandedMapWidth, trackLeft, trackRight }
}

export function fitLinearMapViewBox(
  callouts: EnzymeCallout[],
  trackLeft: number,
  trackRight: number,
  backboneY: number,
  featureBandBottom: number,
  padding = 10,
  mapWidth?: number,
  minTop?: number,
) {
  let left = trackLeft
  let right = trackRight
  let top = minTop ?? 10
  let bottom = Math.max(featureBandBottom, backboneY + 12)

  callouts.forEach((callout) => {
    const extent = linearCalloutHorizontalExtent(callout)
    left = Math.min(left, extent.minX)
    right = Math.max(right, extent.maxX)
    top = Math.min(top, callout.box.top, callout.anchor.y, callout.elbow.y, callout.connectorEnd.y)
    bottom = Math.max(bottom, callout.box.bottom, callout.anchor.y, callout.elbow.y, callout.connectorEnd.y)
  })

  top -= padding
  bottom += padding

  if (mapWidth != null) {
    return {
      left: 0,
      top,
      width: mapWidth,
      height: Math.max(360, bottom - top),
    }
  }

  left -= padding
  right += padding

  return {
    left,
    top,
    width: Math.max(320, right - left),
    height: Math.max(360, bottom - top),
  }
}
