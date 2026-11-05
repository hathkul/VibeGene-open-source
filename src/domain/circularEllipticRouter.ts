import type {
  Box,
  EnzymeCallout,
  EnzymeCalloutLayoutInput,
  EnzymeCalloutLayoutResult,
  Point,
} from './mapLayout'
import { circularMapAngle } from './circularMapGeometry'
import {
  distancePointToBox,
  collectLayoutViolations,
  hasNonBoundsLayoutViolations,
  leaderBendAngleDegrees,
  paddedBox,
  polarPoint,
  segmentIntersectsBox,
} from './mapLayout'
import type { RestrictionSite, Topology } from './types'
import { compareCircularRoutingCandidates } from './circularRoutingPolicy'
import {
  arcCurvatureUsableOnPoles,
  cubicArcCurvatureForPole,
  cubicArcPoint,
  curvePointAtPolar,
} from './circularEllipticCurve'
import {
  arcCandidateIsBetter,
  arcHalfBendQuality,
  arcOverflowCandidateIsBetter,
  arcSideBendQuality,
  circularRoutingQualityIsBetter,
} from './circularEllipticCandidateQuality'
export { circularRoutingQualityIsBetter } from './circularEllipticCandidateQuality'
export {
  cubicArcMaintainsRadialClearance,
  cubicArcPoint,
  curveRadiusAtPolarAngle,
  maxCubicArcCurvatureForRadialClearance,
} from './circularEllipticCurve'

/**
 * SnapGene-style elliptic / ovoid label router.
 *
 * Labels sit on a closed curve around the ring. By default that curve is the ellipse
 * x²/a² + y²/b² = 1 (tight at 3h/9h, taller at 12h/6h). Optional `ovoidK` switches to
 * the egg curve x²/a² + y²/(b(1+λx))² = 1 with λ = ovoidK/a. `labelCurveShape='arcs'`
 * instead uses mirrored arcs through the shared equators (±a,0) and independently sized poles
 * (0,-bTop)/(0,bBottom). Manual geometry uses circular quarters; automatic geometry may select
 * cubic quarters with independent mid-arc curvature, preserving pointed poles without coupling
 * both halves. Cubic candidates that bow inside the nearer endpoint radius are rejected so
 * mid-arc labels cannot sit closer to the ring than both 12/6h and 3/9h.
 *
 * Pipeline:
 *   1. Ideal = curve ∩ polar ray through each cut.
 *   2. Near 12h/6h, let labels borrow the less-loaded text side when both sides of that pole
 *      are populated; the sequence divide is not a hard packing wall.
 *   3. Pack each resulting side in polar angle on the oval (AABB non-overlap), try every label
 *      as the radial pivot, then translate remaining collision-connected runs to minimize
 *      squared signed leader deflection. This lets nearby sparse labels move with a dense run
 *      and distributes forward/back bends instead of pinning one end.
 *   4. Ensure the left/right pair nearest each pole (12h/6h) keeps ≥1-letter gap on X.
 *      When both optional movement modes are off, a conservative angular inset supplies this
 *      gap while keeping every connector exactly on the placement curve.
 *   5. Lift each off-ray label off the oval and slide it horizontally (fixed Y) toward its
 *      site ray in polar→equator order, keeping a horizontal gap from the more polar neighbor,
 *      without entering the already-placed ring (skipped when raySlideEnabled is false).
 *   6. Optionally implode labels radially toward the ring (equator→pole order), stopping for
 *      other labels, leaders, or the ring (radialImplodeEnabled).
 *   7. Move the ring center to the point furthest from all label boxes (maximin in a local
 *      neighborhood) and re-anchor leaders; label positions stay fixed.
 */

type Side = 'left' | 'right'
type Quarter = 'upper-left' | 'upper-right' | 'lower-right' | 'lower-left'
type LabelCurveShape = NonNullable<EnzymeCalloutLayoutInput['labelCurveShape']>

type Item = {
  site: RestrictionSite
  index: number
  label: string
  labelWidth: number
  textHeight: number
  side: Side
  quarter: Quarter
  shape: LabelCurveShape
  /** Bézier curvature for this text side; ellipse mode uses the shared ovoid lambda. */
  curveLambda: number
  curveBBottom: number
  /** Cut angle, 0 at 3 o'clock, +π/2 at 6 o'clock (screen y-down). */
  theta: number
  /** Packed placement angle on the oval (equals theta when unblocked). */
  packedTheta: number
  idealY: number
  /** Packed vertical center (filled in during packing). */
  y: number
  /** Label attachment; starts on the oval, may leave it during horizontal ray-slide. */
  connector: Point
  /** Reuses exact curve evaluations across pivot candidates and collision checks. */
  curvePointCache: Map<number, Point>
}

type PreparedSite = {
  site: RestrictionSite
  index: number
  label: string
  labelWidth: number
  textHeight: number
  side: Side
  quarter: Quarter
  theta: number
}

const PREPARED_SITES = Symbol('circularEllipticPreparedSites')
type PreparedLayoutInput = EnzymeCalloutLayoutInput & {
  [PREPARED_SITES]?: { sites: RestrictionSite[]; entries: PreparedSite[] }
}

const TEXT_HEIGHT = 12
const TEXT_WIDTH = 6
const VIEW_PADDING = 4
const FEATURE_WIDTH = 15.5
const RADIAL_STUB_LENGTH = FEATURE_WIDTH * 1.2
const LABEL_GAP = 4
const RING_CLEARANCE = 1.5
/** One-letter horizontal clearance between left/right connectors meeting at 12h/6h. */
const LETTER_CLEARANCE = TEXT_WIDTH
/** Firm horizontal budget so side labels never force horizontal scroll. */
const MIN_SIDE_BUDGET = 64
/** Vertical budget reserved at the poles (half a text row). */
const POLE_BUDGET = 14
/** Labels this close to 12h/6h may use either text side to share pole space. */
const POLE_SIDE_FLEX_RADIANS = (18 * Math.PI) / 180
/** Cost of crossing a pole, expressed as rows of load-balancing improvement. */
const POLE_SIDE_TRANSFER_PENALTY_ROWS = 0.75
/** Prevent bend optimization from buying a small angular gain with an excessively tall map. */
const AUTO_TIP_MAX_EXTRA_RADIUS_RATIO = 0.4
const ROUTING_QUALITY_TOLERANCE = 0.25
const ROUTING_BEND_TARGET_DEGREES = 120

/**
 * Angular inset from ±π/2 so left and right never share the tip point (x=cx).
 * At the pole, x ≈ ρ·δ for small δ; need ρ·δ ≥ LETTER_CLEARANCE/2 on each side.
 */
function poleAngleInset(a: number, b: number) {
  // The smaller axis is conservative: using the larger one can underestimate the angle and
  // force the later clearance pass to pull a connector horizontally off the curve.
  const rho = Math.min(a, b)
  return Math.max(0.01, LETTER_CLEARANCE / 2 / Math.max(rho, 1))
}

function sideAngleRange(side: Side, a: number, bTop: number, bBottom = bTop) {
  const topInset = poleAngleInset(a, bTop)
  const bottomInset = poleAngleInset(a, bBottom)
  if (side === 'right') {
    return { thetaMin: -Math.PI / 2 + topInset, thetaMax: Math.PI / 2 - bottomInset }
  }
  return { thetaMin: Math.PI / 2 + bottomInset, thetaMax: Math.PI * 1.5 - topInset }
}

function thetaForSide(theta: number, side: Side) {
  let normalized = Math.atan2(Math.sin(theta), Math.cos(theta))
  if (side === 'left' && normalized < 0) normalized += Math.PI * 2
  return normalized
}

function circularAngleDistance(left: number, right: number) {
  let delta = Math.abs(left - right) % (Math.PI * 2)
  if (delta > Math.PI) delta = Math.PI * 2 - delta
  return delta
}

/** Use both text sides near each pole instead of treating the sequence divide as a hard wall. */
function sharePoleLabelsAcrossSides(
  items: Item[],
  arcLeftCurvature?: number,
  arcRightCurvature?: number,
  allowOneSided = false,
) {
  for (const pole of [-Math.PI / 2, Math.PI / 2]) {
    const upper = pole < 0
    const halfItems = items.filter((item) => (upper ? Math.sin(item.theta) < 0 : Math.sin(item.theta) >= 0))
    const load = (side: Side) =>
      halfItems.filter((item) => item.side === side).reduce((sum, item) => sum + item.textHeight + LABEL_GAP, 0)

    for (let iteration = 0; iteration < halfItems.length; iteration += 1) {
      const leftLoad = load('left')
      const rightLoad = load('right')
      // Preserve a genuinely one-sided pole cluster; crossing is only used to redistribute
      // an already two-sided pole shelf.
      if ((leftLoad === 0 || rightLoad === 0) && (!allowOneSided || halfItems.length < 6)) break
      const heavy: Side = leftLoad > rightLoad ? 'left' : 'right'
      const light: Side = heavy === 'left' ? 'right' : 'left'
      const difference = Math.abs(leftLoad - rightLoad)
      const candidate = halfItems
        .filter((item) => item.side === heavy && circularAngleDistance(item.theta, pole) <= POLE_SIDE_FLEX_RADIANS)
        .toSorted(
          (first, second) =>
            circularAngleDistance(first.theta, pole) - circularAngleDistance(second.theta, pole) ||
            first.labelWidth - second.labelWidth ||
            first.index - second.index,
        )[0]
      if (!candidate) break
      const row = candidate.textHeight + LABEL_GAP
      const improvedDifference = Math.abs(difference - row * 2)
      const loadImprovement = difference - improvedDifference
      const poleDistanceRatio =
        circularAngleDistance(candidate.theta, pole) / POLE_SIDE_FLEX_RADIANS
      const transferPenaltyRows = POLE_SIDE_TRANSFER_PENALTY_ROWS + poleDistanceRatio
      // Crossing the pole is visually expensive. Only borrow the other text side when doing so
      // removes substantially more crowding than keeping the label on its natural side. Labels
      // farther from the pole pay an additional penalty because their crossing leader is worse.
      if (loadImprovement <= row * transferPenaltyRows) break
      candidate.side = light
      if (candidate.shape === 'arcs') {
        candidate.curveLambda = light === 'left'
          ? arcLeftCurvature ?? candidate.curveLambda
          : arcRightCurvature ?? candidate.curveLambda
      }
    }
  }
}

function resolvedCenter(input: EnzymeCalloutLayoutInput): Point {
  return { x: input.centerX ?? input.center, y: input.centerY ?? input.center }
}

function layoutMapExtents(input: EnzymeCalloutLayoutInput) {
  return { width: input.mapWidth ?? input.mapSize, height: input.mapHeight ?? input.mapSize }
}

function normalizedStart(site: RestrictionSite, sequenceLength: number) {
  return (((site.start % sequenceLength) + sequenceLength) % sequenceLength) / sequenceLength
}

function quarterForNorm(normalized: number): { quarter: Quarter; side: Side } {
  if (normalized <= 0.25) return { quarter: 'upper-right', side: 'right' }
  if (normalized <= 0.5) return { quarter: 'lower-right', side: 'right' }
  if (normalized <= 0.75) return { quarter: 'lower-left', side: 'left' }
  return { quarter: 'upper-left', side: 'left' }
}

/** orderKey ranges kept for callers/tests: 0 at 9h, increasing 9→12→3→6→9. */
export function quarterOrderBounds(quarter: Quarter): { min: number; max: number } {
  switch (quarter) {
    case 'upper-left':
      return { min: 0, max: Math.PI / 2 }
    case 'upper-right':
      return { min: Math.PI / 2, max: Math.PI }
    case 'lower-right':
      return { min: Math.PI, max: Math.PI * 1.5 }
    case 'lower-left':
      return { min: Math.PI * 1.5, max: Math.PI * 2 }
  }
}

function labelMetrics(site: RestrictionSite, input: EnzymeCalloutLayoutInput) {
  const label = input.labelForSite ? input.labelForSite(site) : `${site.enzyme.name} (${site.start + 1})`
  const textWidth = input.textWidthForSite ? input.textWidthForSite(site) : (input.textWidth ?? TEXT_WIDTH)
  const labelPadding = input.labelPaddingForSite ? input.labelPaddingForSite(site) : (input.labelPadding ?? 6)
  const measuredWidth = input.labelWidthForSite ? input.labelWidthForSite(site, label) : label.length * textWidth
  const textHeight = input.textHeightForSite ? input.textHeightForSite(site) : (input.textHeight ?? TEXT_HEIGHT)
  return { label, labelWidth: measuredWidth + labelPadding, textHeight }
}

function preparedSites(input: EnzymeCalloutLayoutInput) {
  const preparedInput = input as PreparedLayoutInput
  const cached = preparedInput[PREPARED_SITES]
  if (cached?.sites === input.sites) return cached.entries
  return input.sites.map((site, index): PreparedSite => {
    const normalized = normalizedStart(site, input.sequenceLength)
    const { quarter, side } = quarterForNorm(normalized)
    const { label, labelWidth, textHeight } = labelMetrics(site, input)
    return {
      site,
      index,
      label,
      labelWidth,
      textHeight,
      side,
      quarter,
      theta: circularMapAngle(site.start, input.sequenceLength, input.topology),
    }
  })
}

function withPreparedSites(input: EnzymeCalloutLayoutInput): PreparedLayoutInput {
  const existing = (input as PreparedLayoutInput)[PREPARED_SITES]
  if (existing?.sites === input.sites) return input as PreparedLayoutInput
  return {
    ...input,
    [PREPARED_SITES]: { sites: input.sites, entries: preparedSites(input) },
  }
}

function maxLabelWidth(input: EnzymeCalloutLayoutInput, prepared = preparedSites(input)) {
  let max = 0
  for (const { labelWidth } of prepared) {
    if (labelWidth > max) max = labelWidth
  }
  return max
}

/**
 * Total vertical room the denser side needs to stack its labels (box heights + gaps).
 * The oval height is 2b, so capacity asks for b >= need/2.
 */
function sideStackNeed(input: EnzymeCalloutLayoutInput, prepared = preparedSites(input)) {
  const need = { left: 0, right: 0 }
  prepared.forEach(({ side, textHeight }) => {
    need[side] += textHeight + LABEL_GAP
  })
  return Math.max(need.left, need.right)
}

/** Vertical stacks needed above and below the equator after penalized pole sharing. */
function halfSideStackNeeds(input: EnzymeCalloutLayoutInput, prepared = preparedSites(input)) {
  const items = buildItems(input, 1, 1, 0, 'ellipse', 1, 0, 0, prepared)
  if (input.raySlideEnabled === false && input.radialImplodeEnabled === false) {
    sharePoleLabelsAcrossSides(items, undefined, undefined, input.allowOneSidedPoleSharing === true)
  }
  const need = new Map<string, number>()
  for (const item of items) {
    const half = Math.sin(item.theta) < 0 ? 'upper' : 'lower'
    const key = `${half}-${item.side}`
    need.set(key, (need.get(key) ?? 0) + item.textHeight + LABEL_GAP)
  }
  return {
    upper: Math.max(0, need.get('upper-left') ?? 0, need.get('upper-right') ?? 0),
    lower: Math.max(0, need.get('lower-left') ?? 0, need.get('lower-right') ?? 0),
  }
}

/**
 * Oval semi-axes.
 *
 * `a` (horizontal) is capped by the side-label budget supplied by the responsive policy.
 * Auto/configured budgets keep the widest side label inside the map box; a deliberately
 * relieved budget trades some horizontal label room for the small-pane ring floor.
 *
 * Ellipse `b` is sized to hold the denser side's stack across the full oval height. Arc mode
 * instead computes `bTop` and `bBottom` from the densest side shelf in each half. When either
 * exceeds the viewport it GROWS past the box (the caller expands the SVG for vertical scroll)
 * rather than forcing the ring to shrink.
 */
export function computeEllipticRadii(input: EnzymeCalloutLayoutInput) {
  const prepared = preparedSites(input)
  const r = input.radius
  const n = Math.max(1, input.sites.length)
  const center = resolvedCenter(input)
  const { width: mapWidth, height: mapHeight } = layoutMapExtents(input)
  const perQuarter = Math.ceil(n / 4)
  const arcNeed = perQuarter * 17
  const sideClearance = Math.max(48, Math.min(180, Math.round(r * 0.14 + arcNeed * 0.18)))
  const topClearance = Math.max(sideClearance + 64, Math.min(380, Math.round(r * 0.36 + arcNeed * 0.4)))

  const sideBudget =
    input.sideBudget !== undefined
      ? Math.max(0, Math.round(input.sideBudget))
      : Math.max(MIN_SIDE_BUDGET, maxLabelWidth(input, prepared))
  const maxA = Math.max(r + 16, Math.min(center.x, mapWidth - center.x) - sideBudget - VIEW_PADDING)
  const maxBTop = Math.max(r + 16, center.y - POLE_BUDGET - VIEW_PADDING)
  const maxBBottom = Math.max(
    r + 16,
    mapHeight - center.y - POLE_BUDGET - VIEW_PADDING - (input.bottomReservedPx ?? 0),
  )
  const maxB = Math.min(maxBTop, maxBBottom)

  // Keep the oval at least `ringGap` outside the ring (same preset as radius search) so
  // later horizontal ray-slides have room before they hit the disk.
  const ringGap = Math.max(0, input.ringGap ?? 56)
  const shape: LabelCurveShape = input.labelCurveShape ?? 'ellipse'
  const configuredHorizontalGap =
    shape === 'arcs' ? input.arcHorizontalGapPx : input.ellipticHorizontalGapPx
  const horizontalClearance =
    configuredHorizontalGap === undefined
      ? sideClearance
      : Math.max(16, Math.round(configuredHorizontalGap))
  const outerClearance = Math.max(horizontalClearance, ringGap)
  const a = Math.min(r + outerClearance, maxA)
  const sideCapacityB = sideStackNeed(input, prepared) / 2 + POLE_BUDGET
  const halfNeeds = shape === 'arcs' ? halfSideStackNeeds(input, prepared) : null
  const capacityTopB = (halfNeeds?.upper ?? sideCapacityB - POLE_BUDGET) + POLE_BUDGET
  const capacityBottomB = (halfNeeds?.lower ?? sideCapacityB - POLE_BUDGET) + POLE_BUDGET
  const normalizeTipAngle = (angle: number | undefined) =>
    angle === undefined ? null : Math.max(70, Math.min(175, angle))
  const upperTipAngleDegrees = normalizeTipAngle(input.arcUpperTipAngleDegrees)
  const lowerTipAngleDegrees = normalizeTipAngle(input.arcLowerTipAngleDegrees)
  const tipHeight = (angle: number | null) =>
    angle === null ? 0 : a / Math.tan(((angle * Math.PI) / 180) / 4)
  const automaticPolarFloor = r + Math.max(16, ringGap)

  let bTop: number
  let bBottom: number
  if (shape === 'arcs') {
    const upperGapFloor =
      input.arcUpperVerticalGapPx === undefined
        ? automaticPolarFloor
        : r + Math.max(16, ringGap, Math.round(input.arcUpperVerticalGapPx))
    const lowerGapFloor =
      input.arcLowerVerticalGapPx === undefined
        ? automaticPolarFloor
        : r + Math.max(16, ringGap, Math.round(input.arcLowerVerticalGapPx))
    const upperCapacity = input.arcAutoFitUpper
      ? Math.min(capacityTopB, maxBTop)
      : capacityTopB
    const lowerCapacity = input.arcAutoFitLower
      ? Math.min(capacityBottomB, maxBBottom)
      : capacityBottomB
    bTop = Math.max(upperCapacity, upperGapFloor, tipHeight(upperTipAngleDegrees))
    bBottom = Math.max(lowerCapacity, lowerGapFloor, tipHeight(lowerTipAngleDegrees))
  } else {
    const roomCap = Math.max(maxB, sideCapacityB)
    const automaticB = Math.min(Math.max(a + 24, r + topClearance), roomCap)
    const preferredB =
      input.ellipticVerticalGapPx === undefined
        ? automaticB
        : r + Math.max(16, Math.round(input.ellipticVerticalGapPx))
    const ellipseB = Math.max(sideCapacityB, preferredB)
    bTop = ellipseB
    bBottom = ellipseB
  }
  const b = Math.max(bTop, bBottom)
  const capacityB = Math.max(capacityTopB, capacityBottomB)
  const ovoidK = shape === 'ellipse' ? Math.max(-0.85, Math.min(0.85, input.ovoidK ?? 0)) : 0
  const clampCurvature = (value: number | undefined) => Math.max(0, Math.min(0.8, value ?? 0))
  const arcCurvature = shape === 'arcs' ? clampCurvature(input.arcCurvature) : 0
  const arcLeftCurvature = shape === 'arcs'
    ? clampCurvature(input.arcLeftCurvature ?? arcCurvature)
    : 0
  const arcRightCurvature = shape === 'arcs'
    ? clampCurvature(input.arcRightCurvature ?? arcCurvature)
    : 0
  const lambda = shape === 'arcs' ? arcCurvature : ovoidK / Math.max(a, 1)
  const actualTipAngle = (poleRadius: number) => {
    const left = cubicArcCurvatureForPole(a, poleRadius, arcLeftCurvature)
    const right = cubicArcCurvatureForPole(a, poleRadius, arcRightCurvature)
    if (left > 0 || right > 0) {
      const circularReflexAngle = 4 * Math.atan(a / poleRadius)
      const circularHalfAngle = Math.min(circularReflexAngle, Math.PI * 2 - circularReflexAngle) / 2
      const sideHalfAngle = (curvature: number) =>
        curvature > 0
          ? Math.atan((a * 0.28) / Math.max(1e-6, poleRadius * curvature))
          : circularHalfAngle
      return ((sideHalfAngle(left) + sideHalfAngle(right)) * 180) / Math.PI
    }
    const reflexAngle = (4 * Math.atan(a / poleRadius) * 180) / Math.PI
    return Math.min(reflexAngle, 360 - reflexAngle)
  }
  const actualUpperTipAngleDegrees = shape === 'arcs' ? actualTipAngle(bTop) : null
  const actualLowerTipAngleDegrees = shape === 'arcs' ? actualTipAngle(bBottom) : null
  return {
    a,
    b,
    bTop,
    bBottom,
    sideClearance,
    topClearance,
    maxA,
    maxB,
    maxBTop,
    maxBBottom,
    capacityB,
    capacityTopB,
    capacityBottomB,
    shape,
    upperTipAngleDegrees,
    lowerTipAngleDegrees,
    actualUpperTipAngleDegrees,
    actualLowerTipAngleDegrees,
    ovoidK,
    arcCurvature,
    arcLeftCurvature,
    arcRightCurvature,
    lambda,
  }
}

function buildItems(
  input: EnzymeCalloutLayoutInput,
  a: number,
  bTop: number,
  lambda: number,
  shape: LabelCurveShape,
  bBottom = bTop,
  arcLeftCurvature = lambda,
  arcRightCurvature = lambda,
  prepared = preparedSites(input),
): Item[] {
  const center = resolvedCenter(input)
  return prepared.map(({ site, index, label, labelWidth, textHeight, quarter, side, theta }) => {
    const curveLambda = shape === 'arcs'
      ? side === 'left' ? arcLeftCurvature : arcRightCurvature
      : lambda
    const point = curvePointAtPolar(a, bTop, center, theta, curveLambda, shape, bBottom)
    return {
      site,
      index,
      label,
      labelWidth,
      textHeight,
      side,
      quarter,
      shape,
      curveLambda,
      curveBBottom: bBottom,
      theta,
      packedTheta: theta,
      idealY: point.y,
      y: point.y,
      connector: { x: point.x, y: point.y },
      curvePointCache: new Map([[theta, point]]),
    }
  })
}

function curvePointForItem(item: Item, a: number, b: number, center: Point, theta: number, lambda: number) {
  const cached = item.curvePointCache.get(theta)
  if (cached) return cached
  const point = curvePointAtPolar(
    a,
    b,
    center,
    theta,
    item.shape === 'arcs' ? item.curveLambda : lambda,
    item.shape,
    item.curveBBottom,
  )
  item.curvePointCache.set(theta, point)
  return point
}

function syncConnectorFromOval(item: Item, a: number, b: number, center: Point, lambda: number) {
  const point = curvePointForItem(item, a, b, center, item.packedTheta, lambda)
  item.connector = { x: point.x, y: point.y }
  item.y = point.y
}

function boxAtTheta(item: Item, a: number, b: number, center: Point, theta: number, lambda: number): { point: Point; box: Box } {
  const point = curvePointForItem(item, a, b, center, theta, lambda)
  const half = item.textHeight / 2
  const box: Box =
    item.side === 'right'
      ? { left: point.x, right: point.x + item.labelWidth, top: point.y - half, bottom: point.y + half }
      : { left: point.x - item.labelWidth, right: point.x, top: point.y - half, bottom: point.y + half }
  return { point, box }
}

function boxesConflict(left: Box, right: Box) {
  const g = LABEL_GAP / 2
  return left.left < right.right + g && left.right + g > right.left && left.top < right.bottom + g && left.bottom + g > right.top
}

/**
 * Side packing cannot see collisions between independently packed shelves, and later balancing
 * may move an otherwise valid shelf into another one. Treat the finished label set as the source
 * of truth: a candidate is feasible only when every pair retains the router's normal label gap.
 */
function calloutsHaveLabelConflicts(callouts: EnzymeCallout[]) {
  const byTop = callouts.toSorted(
    (left, right) => left.box.top - right.box.top || left.box.left - right.box.left,
  )
  const verticalGap = LABEL_GAP / 2
  for (let index = 0; index < byTop.length; index += 1) {
    const current = byTop[index]
    for (let otherIndex = index + 1; otherIndex < byTop.length; otherIndex += 1) {
      const other = byTop[otherIndex]
      if (other.box.top >= current.box.bottom + verticalGap) break
      if (boxesConflict(current.box, other.box)) return true
    }
  }
  return false
}

function placementAt(item: Item, a: number, b: number, center: Point, theta: number, lambda: number) {
  const { point, box } = boxAtTheta(item, a, b, center, theta, lambda)
  return { point, box, theta }
}

function placementsConflict(
  left: { box: Box; point: Point; theta: number },
  right: { box: Box; point: Point; theta: number },
) {
  return boxesConflict(left.box, right.box)
}

/**
 * Smallest angle toward 6 o'clock (from `start`) that clears `prevBox`, within the side range.
 * Right side pushes θ up; left side pushes θ down.
 */
function clearTowardSix(
  item: Item,
  prev: { box: Box; point: Point; theta: number },
  start: number,
  side: Side,
  a: number,
  b: number,
  center: Point,
  thetaMin: number,
  thetaMax: number,
  lambda: number,
) {
  if (!placementsConflict(prev, placementAt(item, a, b, center, start, lambda))) return start

  if (side === 'right') {
    let lo = start
    let hi = thetaMax
    if (placementsConflict(prev, placementAt(item, a, b, center, hi, lambda))) return hi
    for (let i = 0; i < 28; i += 1) {
      const mid = (lo + hi) / 2
      if (placementsConflict(prev, placementAt(item, a, b, center, mid, lambda))) lo = mid
      else hi = mid
    }
    return hi
  }

  let lo = thetaMin
  let hi = start
  if (placementsConflict(prev, placementAt(item, a, b, center, lo, lambda))) return lo
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2
    if (placementsConflict(prev, placementAt(item, a, b, center, mid, lambda))) hi = mid
    else lo = mid
  }
  return lo
}

/**
 * Smallest angle toward 12 o'clock (from the 6h-constrained end) that clears `next`.
 */
function clearTowardTwelve(
  item: Item,
  next: { box: Box; point: Point; theta: number },
  start: number,
  side: Side,
  a: number,
  b: number,
  center: Point,
  thetaMin: number,
  thetaMax: number,
  lambda: number,
) {
  if (!placementsConflict(next, placementAt(item, a, b, center, start, lambda))) return start

  if (side === 'right') {
    let lo = thetaMin
    let hi = start
    if (placementsConflict(next, placementAt(item, a, b, center, lo, lambda))) return lo
    for (let i = 0; i < 28; i += 1) {
      const mid = (lo + hi) / 2
      if (placementsConflict(next, placementAt(item, a, b, center, mid, lambda))) hi = mid
      else lo = mid
    }
    return lo
  }

  let lo = start
  let hi = thetaMax
  if (placementsConflict(next, placementAt(item, a, b, center, hi, lambda))) return hi
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2
    if (placementsConflict(next, placementAt(item, a, b, center, mid, lambda))) lo = mid
    else hi = mid
  }
  return hi
}

function clearTowardSixPastAll(
  item: Item,
  blockers: Array<{ box: Box; point: Point; theta: number }>,
  start: number,
  side: Side,
  a: number,
  b: number,
  center: Point,
  thetaMin: number,
  thetaMax: number,
  lambda: number,
) {
  let theta = start
  for (let pass = 0; pass <= blockers.length; pass += 1) {
    let moved = false
    for (const blocker of blockers) {
      if (!placementsConflict(blocker, placementAt(item, a, b, center, theta, lambda))) continue
      const next = clearTowardSix(item, blocker, theta, side, a, b, center, thetaMin, thetaMax, lambda)
      if (Math.abs(next - theta) > 1e-9) moved = true
      theta = next
    }
    if (!moved) break
  }
  return theta
}

function clearTowardTwelvePastAll(
  item: Item,
  blockers: Array<{ box: Box; point: Point; theta: number }>,
  start: number,
  side: Side,
  a: number,
  b: number,
  center: Point,
  thetaMin: number,
  thetaMax: number,
  lambda: number,
) {
  let theta = start
  for (let pass = 0; pass <= blockers.length; pass += 1) {
    let moved = false
    for (const blocker of blockers.toReversed()) {
      if (!placementsConflict(blocker, placementAt(item, a, b, center, theta, lambda))) continue
      const next = clearTowardTwelve(item, blocker, theta, side, a, b, center, thetaMin, thetaMax, lambda)
      if (Math.abs(next - theta) > 1e-9) moved = true
      theta = next
    }
    if (!moved) break
  }
  return theta
}

/** Same packing collision test, with a small extra tolerance for finding touching runs. */
function boxesNearlyConflict(left: Box, right: Box, tolerance = 0.75) {
  const g = (LABEL_GAP + Math.max(0, tolerance)) / 2
  return left.left < right.right + g && left.right + g > right.left && left.top < right.bottom + g && left.bottom + g > right.top
}

/**
 * Find the polar angle on one side of the curve at a requested screen Y. Along either side,
 * traversal from 12h to 6h is monotonic in Y, including for the supported ovoid range.
 */
function curveThetaAtY(
  side: Side,
  shape: LabelCurveShape,
  targetY: number,
  a: number,
  b: number,
  center: Point,
  thetaMin: number,
  thetaMax: number,
  lambda: number,
  bBottom = b,
) {
  if (shape === 'ellipse' && Math.abs(lambda) < 1e-12) {
    const relativeY = Math.max(-b, Math.min(b, targetY - center.y))
    const relativeX = a * Math.sqrt(Math.max(0, 1 - (relativeY * relativeY) / (b * b)))
    let theta = Math.atan2(relativeY, side === 'right' ? relativeX : -relativeX)
    if (side === 'left' && theta < 0) theta += Math.PI * 2
    return Math.max(thetaMin, Math.min(thetaMax, theta))
  }
  if (shape === 'arcs') {
    const relativeY = targetY - center.y
    const poleRadius = relativeY < 0 ? b : bBottom
    const signedY = Math.max(-poleRadius, Math.min(poleRadius, relativeY))
    const absoluteY = Math.abs(signedY)
    let relativeX: number

    const curvature = cubicArcCurvatureForPole(a, poleRadius, lambda)
    if (curvature > 1e-9) {
      let lo = 0
      let hi = 1
      for (let iteration = 0; iteration < 18; iteration += 1) {
        const mid = (lo + hi) / 2
        if (cubicArcPoint(a, poleRadius, curvature, mid).y > absoluteY) lo = mid
        else hi = mid
      }
      relativeX = cubicArcPoint(a, poleRadius, curvature, (lo + hi) / 2).x
    } else {
      const circleCenter = (a * a - poleRadius * poleRadius) / (2 * a)
      const circleRadius = (a * a + poleRadius * poleRadius) / (2 * a)
      relativeX = circleCenter + Math.sqrt(Math.max(0, circleRadius * circleRadius - absoluteY * absoluteY))
    }

    let theta = Math.atan2(signedY, side === 'right' ? relativeX : -relativeX)
    if (side === 'left' && theta < 0) theta += Math.PI * 2
    return Math.max(thetaMin, Math.min(thetaMax, theta))
  }

  const thetaAt = (progress: number) =>
    side === 'right'
      ? thetaMin + (thetaMax - thetaMin) * progress
      : thetaMax - (thetaMax - thetaMin) * progress

  let lo = 0
  let hi = 1
  for (let i = 0; i < 36; i += 1) {
    const mid = (lo + hi) / 2
    const y = curvePointAtPolar(a, b, center, thetaAt(mid), lambda, shape, bBottom).y
    if (y < targetY) lo = mid
    else hi = mid
  }
  return thetaAt((lo + hi) / 2)
}

/** Signed turn from the site's outward radial direction to its final leader segment. */
function signedLeaderDeflection(item: Item, connector: Point, center: Point, ringRadius: number) {
  const elbow = elbowForItem(item, center, ringRadius, connector)
  const radialX = Math.cos(item.theta)
  const radialY = Math.sin(item.theta)
  const leaderX = connector.x - elbow.x
  const leaderY = connector.y - elbow.y
  return Math.atan2(radialX * leaderY - radialY * leaderX, radialX * leaderX + radialY * leaderY)
}

/**
 * Repack a whole side around the best radial pivot instead of always anchoring its 12h end.
 * Labels before the pivot pack toward 12h; labels after it pack toward 6h. Trying every pivot
 * lets a dense run pull nearby sparse blockers along and exploits true 2D box clearance near
 * a pole, where labels can share nearly the same Y when their horizontal spans do not overlap.
 * Large arc shelves first sample pivots, then exhaustively refine the winning neighborhood; this
 * avoids the old all-pivots polynomial cost without reducing precision around the best basin.
 */
function optimizeSidePivotPacking(
  items: Item[],
  a: number,
  b: number,
  curveCenter: Point,
  lambda: number,
  ringRadius: number,
  leaderCenter = curveCenter,
  collisionItems = items,
  compactMinimumBendAngle?: number,
) {
  if (items.length < 2) return
  const side = items[0].side
  const { thetaMin, thetaMax } = sideAngleRange(side, a, b, items[0].curveBBottom)
  const currentPlacements = items.map((item) => placementAt(item, a, b, curveCenter, item.packedTheta, lambda))
  if (!currentPlacements.some((placement, index) => index > 0 && boxesNearlyConflict(currentPlacements[index - 1].box, placement.box))) {
    return
  }

  const runIndices = new Set(items.map((item) => item.index))
  const externalItems = collisionItems.filter((item) => !runIndices.has(item.index))

  const evaluate = (angles: number[]) => {
    const placements = items.map((item, index) => placementAt(item, a, b, curveCenter, angles[index], lambda))
    let turnCost = 0
    let maximumLeaderLength = 0
    let totalLeaderLength = 0
    for (let i = 0; i < placements.length; i += 1) {
      const placement = placements[i]
      const item = items[i]
      const elbow = elbowForItem(item, leaderCenter, ringRadius, placement.point)
      if (leaderCrossesRing(elbow, placement.point, leaderCenter, ringRadius)) return null
      if (distancePointToBox(leaderCenter, placement.box) < ringRadius - RING_CLEARANCE) return null
      if (externalItems.some((other) => boxesConflict(placement.box, buildBox(other, other.connector)))) return null
      for (let j = 0; j < i; j += 1) {
        if (boxesConflict(placement.box, placements[j].box)) return null
      }
      const turn = signedLeaderDeflection(item, placement.point, leaderCenter, ringRadius)
      const bendAngle = 180 - (Math.abs(turn) * 180) / Math.PI
      if (
        compactMinimumBendAngle !== undefined &&
        bendAngle < compactMinimumBendAngle - 1e-6
      ) return null
      turnCost += turn * turn
      const leaderLength = Math.hypot(
        placement.point.x - elbow.x,
        placement.point.y - elbow.y,
      )
      maximumLeaderLength = Math.max(maximumLeaderLength, leaderLength)
      totalLeaderLength += leaderLength
    }
    const cost = compactMinimumBendAngle === undefined
      ? turnCost
      : maximumLeaderLength * 1_000_000 + totalLeaderLength
    return { cost, placements }
  }

  const currentAngles = items.map((item) => item.packedTheta)
  const current = evaluate(currentAngles)
  if (!current) return
  let best = { ...current, angles: currentAngles }
  let bestPivot = -1

  const tryPivot = (pivot: number) => {
    const angles = items.map((item) => Math.max(thetaMin, Math.min(thetaMax, thetaForSide(item.theta, side))))

    for (let i = pivot + 1; i < items.length; i += 1) {
      const blockers = items
        .slice(pivot, i)
        .map((item, offset) => placementAt(item, a, b, curveCenter, angles[pivot + offset], lambda))
      let theta = side === 'right' ? Math.max(angles[i], angles[i - 1]) : Math.min(angles[i], angles[i - 1])
      theta = clearTowardSixPastAll(items[i], blockers, theta, side, a, b, curveCenter, thetaMin, thetaMax, lambda)
      angles[i] = theta
    }

    for (let i = pivot - 1; i >= 0; i -= 1) {
      const blockers = items
        .slice(i + 1, pivot + 1)
        .map((item, offset) => placementAt(item, a, b, curveCenter, angles[i + 1 + offset], lambda))
      let theta = side === 'right' ? Math.min(angles[i], angles[i + 1]) : Math.max(angles[i], angles[i + 1])
      theta = clearTowardTwelvePastAll(items[i], blockers, theta, side, a, b, curveCenter, thetaMin, thetaMax, lambda)
      angles[i] = theta
    }

    const candidate = evaluate(angles)
    if (candidate && candidate.cost < best.cost - 1e-10) {
      best = { ...candidate, angles }
      bestPivot = pivot
    }
  }

  const attempted = new Set<number>()
  const tryOnce = (pivot: number) => {
    if (attempted.has(pivot)) return
    attempted.add(pivot)
    tryPivot(pivot)
  }
  const pivotStride =
    items[0].shape !== 'arcs' || items.length <= 40
      ? 1
      : Math.max(2, Math.floor(items.length / 16))
  for (let pivot = 0; pivot < items.length; pivot += pivotStride) tryOnce(pivot)
  tryOnce(items.length - 1)

  if (pivotStride > 1 && bestPivot >= 0) {
    const refineStart = Math.max(0, bestPivot - pivotStride + 1)
    const refineEnd = Math.min(items.length - 1, bestPivot + pivotStride - 1)
    for (let pivot = refineStart; pivot <= refineEnd; pivot += 1) tryOnce(pivot)
  }

  if (best.cost >= current.cost - 1e-10) return
  items.forEach((item, index) => {
    item.packedTheta = best.angles[index]
    item.connector = best.placements[index].point
    item.y = best.placements[index].point.y
  })
}

/**
 * Center every collision-connected dense run around its source sites.
 *
 * The first packing pass gives a run its compact, collision-free shape but normally pins its
 * 12h-most member to the ideal ray. Moving every member by the same screen-Y delta preserves
 * the vertical spacing of that shape. We search the legal delta range and minimize squared
 * signed leader deflection, which produces back-bends at one end, near-radial leaders in the
 * middle, and forward-bends at the other end instead of accumulating all drift at one end.
 */
function balanceDenseRuns(
  items: Item[],
  a: number,
  b: number,
  curveCenter: Point,
  lambda: number,
  ringRadius: number,
  leaderCenter = curveCenter,
  collisionItems = items,
  compactMinimumBendAngle?: number,
) {
  if (items.length < 2) return
  const side = items[0].side
  const shape = items[0].shape
  const bBottom = items[0].curveBBottom
  const { thetaMin, thetaMax } = sideAngleRange(side, a, b, bBottom)
  const topY = curvePointAtPolar(
    a,
    b,
    curveCenter,
    side === 'right' ? thetaMin : thetaMax,
    lambda,
    shape,
    bBottom,
  ).y
  const bottomY = curvePointAtPolar(
    a,
    b,
    curveCenter,
    side === 'right' ? thetaMax : thetaMin,
    lambda,
    shape,
    bBottom,
  ).y

  const runs: Item[][] = []
  let runStart = -1
  for (let i = 1; i < items.length; i += 1) {
    const previous = placementAt(items[i - 1], a, b, curveCenter, items[i - 1].packedTheta, lambda)
    const current = placementAt(items[i], a, b, curveCenter, items[i].packedTheta, lambda)
    if (boxesNearlyConflict(previous.box, current.box)) {
      if (runStart < 0) runStart = i - 1
      continue
    }
    if (runStart >= 0) {
      runs.push(items.slice(runStart, i))
      runStart = -1
    }
  }
  if (runStart >= 0) runs.push(items.slice(runStart))

  for (const run of runs) {
    const runIndices = new Set(run.map((item) => item.index))
    const others = collisionItems.filter((item) => !runIndices.has(item.index))
    const minY = Math.min(...run.map((item) => item.connector.y))
    const maxY = Math.max(...run.map((item) => item.connector.y))
    const deltaMin = topY - minY
    const deltaMax = bottomY - maxY

    const placementsForDelta = (deltaY: number) =>
      run.map((item) => {
        const theta = curveThetaAtY(
          side,
          shape,
          item.connector.y + deltaY,
          a,
          b,
          curveCenter,
          thetaMin,
          thetaMax,
          lambda,
          bBottom,
        )
        const point = curvePointForItem(item, a, b, curveCenter, theta, lambda)
        return { item, theta, point, box: buildBox(item, point) }
      })

    const feasible = (deltaY: number) => {
      const placements = placementsForDelta(deltaY)
      for (let i = 0; i < placements.length; i += 1) {
        const current = placements[i]
        const elbow = elbowForItem(current.item, leaderCenter, ringRadius, current.point)
        if (leaderCrossesRing(elbow, current.point, leaderCenter, ringRadius)) return false
        if (distancePointToBox(leaderCenter, current.box) < ringRadius - RING_CLEARANCE) return false
        if (others.some((other) => boxesConflict(current.box, buildBox(other, other.connector)))) return false
        for (let j = 0; j < i; j += 1) {
          if (boxesConflict(current.box, placements[j].box)) return false
        }
      }
      return true
    }

    // Find the contiguous legal interval around the already-valid packed position.
    const legalExtent = (bound: number) => {
      if (Math.abs(bound) < 1e-6 || feasible(bound)) return bound
      let legal = 0
      let blocked = 1
      for (let i = 0; i < 36; i += 1) {
        const mid = (legal + blocked) / 2
        if (feasible(bound * mid)) legal = mid
        else blocked = mid
      }
      return bound * legal
    }
    const lo = legalExtent(deltaMin)
    const hi = legalExtent(deltaMax)
    if (hi - lo < 0.05) continue

    const cost = (deltaY: number) => {
      const placements = placementsForDelta(deltaY)
      let maximumLeaderLength = 0
      let totalLeaderLength = 0
      let turnCost = 0
      for (const placement of placements) {
        const turn = signedLeaderDeflection(placement.item, placement.point, leaderCenter, ringRadius)
        const bendAngle = 180 - (Math.abs(turn) * 180) / Math.PI
        if (
          compactMinimumBendAngle !== undefined &&
          bendAngle < compactMinimumBendAngle - 1e-6
        ) return Number.POSITIVE_INFINITY
        turnCost += turn * turn
        const elbow = elbowForItem(placement.item, leaderCenter, ringRadius, placement.point)
        const leaderLength = Math.hypot(
          placement.point.x - elbow.x,
          placement.point.y - elbow.y,
        )
        maximumLeaderLength = Math.max(maximumLeaderLength, leaderLength)
        totalLeaderLength += leaderLength
      }
      return compactMinimumBendAngle === undefined
        ? turnCost
        : maximumLeaderLength * 1_000_000 + totalLeaderLength
    }

    // Golden-section search is deterministic and sufficient for this smooth one-dimensional
    // objective. Keep zero as a candidate so balancing can never worsen a run.
    const ratio = (Math.sqrt(5) - 1) / 2
    let left = lo
    let right = hi
    let x1 = right - ratio * (right - left)
    let x2 = left + ratio * (right - left)
    let f1 = cost(x1)
    let f2 = cost(x2)
    for (let i = 0; i < 40; i += 1) {
      if (f1 <= f2) {
        right = x2
        x2 = x1
        f2 = f1
        x1 = right - ratio * (right - left)
        f1 = cost(x1)
      } else {
        left = x1
        x1 = x2
        f1 = f2
        x2 = left + ratio * (right - left)
        f2 = cost(x2)
      }
    }

    const candidates = [0, lo, hi, (left + right) / 2]
      .filter((deltaY) => feasible(deltaY))
      .map((deltaY) => ({ deltaY, cost: cost(deltaY) }))
      .toSorted((first, second) => first.cost - second.cost || Math.abs(first.deltaY) - Math.abs(second.deltaY))
    const best = candidates[0]
    if (!best || best.cost >= cost(0) - 1e-10 || Math.abs(best.deltaY) < 0.01) continue

    for (const placement of placementsForDelta(best.deltaY)) {
      placement.item.packedTheta = placement.theta
      placement.item.connector = placement.point
      placement.item.y = placement.point.y
    }
  }
}

/**
 * Pull every label on a scrollable arc shelf toward its equator-side neighbor. Dense-run
 * balancing alone cannot do this for sparse polar labels because they have no colliding partner
 * and therefore remain at their long, perfectly radial tip position. This pass preserves text
 * side and sequence order, follows the curve, stops at the first collision/ring violation, and
 * treats the completed normal layout's global minimum bend as a hard floor.
 */
function compactPolarLabelsTowardEquator(
  items: Item[],
  a: number,
  b: number,
  curveCenter: Point,
  ringRadius: number,
  leaderCenter: Point,
  minimumBendAngle: number,
) {
  const boxes = new Map(items.map((item) => [item.index, buildBox(item, item.connector)]))

  const compactHalf = (sideItems: Item[], half: 'upper' | 'lower') => {
    const members = sideItems
      .filter((item) => half === 'upper'
        ? item.connector.y < curveCenter.y - 1e-6
        : item.connector.y > curveCenter.y + 1e-6)
      .toSorted((left, right) => half === 'upper'
        ? right.connector.y - left.connector.y
        : left.connector.y - right.connector.y)

    for (const item of members) {
      const currentTheta = item.packedTheta
      const equatorTheta = item.side === 'right' ? 0 : Math.PI
      const blockersTowardEquator = sideItems.filter((other) =>
        other.index !== item.index &&
        (half === 'upper'
          ? other.connector.y > item.connector.y + 1e-6
          : other.connector.y < item.connector.y - 1e-6),
      )
      const targetY = half === 'upper'
        ? Math.min(
            curveCenter.y,
            ...blockersTowardEquator.map((other) => other.connector.y),
          )
        : Math.max(
            curveCenter.y,
            ...blockersTowardEquator.map((other) => other.connector.y),
          )
      const targetTheta = blockersTowardEquator.length
        ? (() => {
            const { thetaMin, thetaMax } = sideAngleRange(
              item.side,
              a,
              b,
              item.curveBBottom,
            )
            return curveThetaAtY(
              item.side,
              item.shape,
              targetY,
              a,
              b,
              curveCenter,
              thetaMin,
              thetaMax,
              item.curveLambda,
              item.curveBBottom,
            )
          })()
        : equatorTheta

      const placementAtProgress = (progress: number) =>
        placementAt(
          item,
          a,
          b,
          curveCenter,
          currentTheta + (targetTheta - currentTheta) * progress,
          item.curveLambda,
        )
      const feasible = (progress: number) => {
        const placement = placementAtProgress(progress)
        const elbow = elbowForItem(item, leaderCenter, ringRadius, placement.point)
        if (leaderCrossesRing(elbow, placement.point, leaderCenter, ringRadius)) return false
        if (distancePointToBox(leaderCenter, placement.box) < ringRadius - RING_CLEARANCE) return false
        for (const [index, box] of boxes) {
          if (index !== item.index && boxesConflict(placement.box, box)) return false
        }
        const bendAngle = 180 - (
          Math.abs(signedLeaderDeflection(item, placement.point, leaderCenter, ringRadius)) * 180
        ) / Math.PI
        return bendAngle >= minimumBendAngle - 1e-6
      }

      let maximumProgress = 1
      if (!feasible(maximumProgress)) {
        let low = 0
        let high = 1
        for (let iteration = 0; iteration < 36; iteration += 1) {
          const middle = (low + high) / 2
          if (feasible(middle)) low = middle
          else high = middle
        }
        maximumProgress = low
      }
      if (maximumProgress < 1e-5) continue

      const placement = placementAtProgress(maximumProgress)
      item.packedTheta = currentTheta + (targetTheta - currentTheta) * maximumProgress
      item.connector = placement.point
      item.y = placement.point.y
      boxes.set(item.index, placement.box)
    }
  }

  for (const side of ['left', 'right'] as const) {
    const sideItems = items.filter((item) => item.side === side)
    compactHalf(sideItems, 'upper')
    compactHalf(sideItems, 'lower')
  }
}

/**
 * Order-preserving polar-angle pack on one side of the oval (12h → 6h).
 * Unblocked labels keep their site angle (radial at the poles); collisions slide in angle.
 * Near the poles, connectors also keep ≥1-letter horizontal separation.
 */
function packSide(
  items: Item[],
  a: number,
  b: number,
  center: Point,
  lambda: number,
  ringRadius: number,
  refine = true,
  compactMinimumBendAngle?: number,
): boolean {
  if (!items.length) return true
  const side = items[0].side
  const { thetaMin, thetaMax } = sideAngleRange(side, a, b, items[0].curveBBottom)

  // Walk the oval from 12h toward 6h.
  if (side === 'right') {
    items.sort((left, right) => thetaForSide(left.theta, side) - thetaForSide(right.theta, side) || left.index - right.index)
  } else {
    items.sort((left, right) => thetaForSide(right.theta, side) - thetaForSide(left.theta, side) || left.index - right.index)
  }

  for (const item of items) {
    item.packedTheta = Math.max(thetaMin, Math.min(thetaMax, thetaForSide(item.theta, side)))
  }

  // Forward: honor ideal angle; push toward 6h only when the previous label blocks.
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    let theta = item.packedTheta
    if (i > 0) {
      const prev = items[i - 1]
      const prevPlace = placementAt(prev, a, b, center, prev.packedTheta, lambda)
      theta = side === 'right' ? Math.max(theta, prev.packedTheta) : Math.min(theta, prev.packedTheta)
      theta = clearTowardSix(item, prevPlace, theta, side, a, b, center, thetaMin, thetaMax, lambda)
    }
    item.packedTheta = theta
    syncConnectorFromOval(item, a, b, center, lambda)
  }

  const last = items[items.length - 1]
  const overflow =
    side === 'right'
      ? last.packedTheta > thetaMax + 1e-6 ||
        (items.length > 1 &&
          placementsConflict(
            placementAt(items[items.length - 2], a, b, center, items[items.length - 2].packedTheta, lambda),
            placementAt(last, a, b, center, last.packedTheta, lambda),
          ))
      : last.packedTheta < thetaMin - 1e-6 ||
        (items.length > 1 &&
          placementsConflict(
            placementAt(items[items.length - 2], a, b, center, items[items.length - 2].packedTheta, lambda),
            placementAt(last, a, b, center, last.packedTheta, lambda),
          ))

  if (!overflow) {
    if (refine) {
      optimizeSidePivotPacking(
        items, a, b, center, lambda, ringRadius, center, items, compactMinimumBendAngle,
      )
      balanceDenseRuns(
        items, a, b, center, lambda, ringRadius, center, items, compactMinimumBendAngle,
      )
    }
    return true
  }

  // Overflow: pull from the 6h end back toward 12h, keeping order.
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    let theta = side === 'right' ? Math.min(item.packedTheta, thetaMax) : Math.max(item.packedTheta, thetaMin)
    if (i < items.length - 1) {
      const next = items[i + 1]
      const nextPlace = placementAt(next, a, b, center, next.packedTheta, lambda)
      theta = side === 'right' ? Math.min(theta, next.packedTheta) : Math.max(theta, next.packedTheta)
      theta = clearTowardTwelve(item, nextPlace, theta, side, a, b, center, thetaMin, thetaMax, lambda)
    }
    item.packedTheta = theta
    syncConnectorFromOval(item, a, b, center, lambda)
  }

  if (refine) {
    optimizeSidePivotPacking(
      items, a, b, center, lambda, ringRadius, center, items, compactMinimumBendAngle,
    )
    balanceDenseRuns(
      items, a, b, center, lambda, ringRadius, center, items, compactMinimumBendAngle,
    )
  }
  const first = items[0]
  if (side === 'right') return first.packedTheta >= thetaMin - 1e-6
  return first.packedTheta <= thetaMax + 1e-6
}

/**
 * Ensure the polar-most left/right pair at 12h and at 6h keep ≥1-letter horizontal gap.
 * Nudges connector X (works on- or off-oval).
 */
function enforceAcrossPoleHorizClearance(left: Item[], right: Item[], center: Point) {
  function separate(leftItem: Item | undefined, rightItem: Item | undefined) {
    if (!leftItem || !rightItem) return

    const others = (item: Item) =>
      [...left, ...right].filter((other) => other.index !== item.index)

    for (let iter = 0; iter < 48; iter += 1) {
      if (Math.abs(leftItem.connector.x - rightItem.connector.x) >= LETTER_CLEARANCE) return

      const tryMove = (item: Item, deltaX: number) => {
        const trial = { x: item.connector.x + deltaX, y: item.connector.y }
        if (item.side === 'right' && trial.x < center.x + LETTER_CLEARANCE / 2) return false
        if (item.side === 'left' && trial.x > center.x - LETTER_CLEARANCE / 2) return false
        const box = buildBox(item, trial)
        if (others(item).some((other) => boxesConflict(box, buildBox(other, other.connector)))) return false
        item.connector = trial
        return true
      }

      // Push each connector away from the vertical axis.
      if (!tryMove(leftItem, -1) && !tryMove(rightItem, 1)) return
    }
  }

  const twelve = polarMostPair(left, right, true)
  separate(twelve.leftItem, twelve.rightItem)
  const six = polarMostPair(left, right, false)
  separate(six.leftItem, six.rightItem)
}

/** Pick the true polar-most label on each side (closest connector to the tip). */
function polarMostPair(left: Item[], right: Item[], atTwelve: boolean) {
  const score = (item: Item) => (atTwelve ? item.connector.y : -item.connector.y)
  const leftItem = left.length ? left.reduce((best, item) => (score(item) < score(best) ? item : best)) : undefined
  const rightItem = right.length ? right.reduce((best, item) => (score(item) < score(best) ? item : best)) : undefined
  return { leftItem, rightItem }
}

function leaderLen(elbow: Point, connector: Point) {
  return Math.hypot(connector.x - elbow.x, connector.y - elbow.y)
}

function elbowForItem(item: Item, center: Point, ringRadius: number, connector: Point) {
  const connectorDist = Math.hypot(connector.x - center.x, connector.y - center.y)
  const elbowOffset = Math.min(RADIAL_STUB_LENGTH, Math.max(2, connectorDist - ringRadius - 2))
  return {
    x: center.x + Math.cos(item.theta) * (ringRadius + elbowOffset),
    y: center.y + Math.sin(item.theta) * (ringRadius + elbowOffset),
  }
}

/** X on the site's polar ray at a fixed Y. */
function rayXAtY(center: Point, theta: number, y: number) {
  const s = Math.sin(theta)
  if (Math.abs(s) < 1e-4) return center.x + Math.cos(theta) * Math.abs(y - center.y)
  return center.x + ((y - center.y) / s) * Math.cos(theta)
}

/** How far the connector is off the site's polar ray (px). */
function rayCrossOffset(item: Item, center: Point) {
  const dx = item.connector.x - center.x
  const dy = item.connector.y - center.y
  return Math.abs(Math.cos(item.theta) * dy - Math.sin(item.theta) * dx)
}

/**
 * Lift off-ray labels off the oval and slide them horizontally (Y fixed) toward their site
 * rays. Process each pole half from the tip outward so order is preserved; stop when the
 * leader would lengthen, the ray is reached, a hard AABB overlap appears, or the connector
 * would come within `clearancePx` horizontally of the more polar-close neighbor.
 */
function slideHorizontallyTowardRays(
  items: Item[],
  center: Point,
  ringRadius: number,
  mapWidth: number,
  clearancePx: number,
  poleOnlyRadians?: number,
) {
  const clearance = Math.max(0, clearancePx)

  function slideOne(item: Item, polarNeighbor: Item | undefined) {
    if (
      poleOnlyRadians !== undefined &&
      Math.min(
        circularAngleDistance(item.theta, -Math.PI / 2),
        circularAngleDistance(item.theta, Math.PI / 2),
      ) > poleOnlyRadians
    ) return
    if (Math.abs(Math.sin(item.theta)) <= 0.2) return
    const startX = item.connector.x
    const y = item.connector.y
    let targetX = rayXAtY(center, item.theta, y)
    if (item.side === 'right') targetX = Math.max(center.x + LETTER_CLEARANCE / 2, targetX)
    else targetX = Math.min(center.x - LETTER_CLEARANCE / 2, targetX)
    if (Math.abs(startX - targetX) < 0.5) return

    const others = items.filter((other) => other.index !== item.index)
    const startLen = leaderLen(elbowForItem(item, center, ringRadius, item.connector), item.connector)
    const startCross = rayCrossOffset(item, center)
    const polarX = polarNeighbor?.connector.x

    const respectsPolarGap = (trialX: number) => {
      if (polarX === undefined) return true
      // Horizontal-only gap to the more polar-close label (not 2D AABB padding).
      if (item.side === 'right') return trialX >= polarX + clearance
      return trialX <= polarX - clearance
    }

    // Ring + stub are placed before this slide; never walk a connector into the disk.
    const minConnectorRho = ringRadius + RADIAL_STUB_LENGTH + 2

    const trialOk = (trialX: number) => {
      if (!respectsPolarGap(trialX)) return false
      const trial = { x: trialX, y }
      if (Math.hypot(trial.x - center.x, trial.y - center.y) < minConnectorRho) return false
      const box = buildBox(item, trial)
      if (box.left < VIEW_PADDING || box.right > mapWidth - VIEW_PADDING) return false
      // Hard overlap only vs everyone else (packing gap); clearance is horizontal vs polar neighbor.
      if (others.some((other) => boxesConflict(box, buildBox(other, other.connector)))) return false
      const trialElbow = elbowForItem(item, center, ringRadius, trial)
      if (leaderCrossesRing(trialElbow, trial, center, ringRadius)) return false
      if (leaderLen(trialElbow, trial) > startLen + 0.05) return false
      if (rayCrossOffset({ ...item, connector: trial }, center) > startCross + 0.05) return false
      return true
    }

    let lo = 0
    let hi = 1
    if (!trialOk(targetX)) {
      for (let i = 0; i < 28; i += 1) {
        const mid = (lo + hi) / 2
        const trialX = startX + (targetX - startX) * mid
        if (trialOk(trialX)) lo = mid
        else hi = mid
      }
    } else {
      lo = 1
    }

    item.connector = { x: startX + (targetX - startX) * lo, y }
  }

  // Per side, per pole half: tip → equator so each label sees its more polar neighbor already placed.
  for (const side of ['right', 'left'] as Side[]) {
    const sideItems = items.filter((item) => item.side === side)
    const upper = sideItems.filter((item) => item.connector.y <= center.y).toSorted((a, b) => a.connector.y - b.connector.y || a.index - b.index)
    const lower = sideItems.filter((item) => item.connector.y > center.y).toSorted((a, b) => b.connector.y - a.connector.y || a.index - b.index)

    for (const band of [upper, lower]) {
      for (let i = 0; i < band.length; i += 1) {
        slideOne(band[i], i > 0 ? band[i - 1] : undefined)
      }
    }
  }
}

function boxesConflictWithGap(left: Box, right: Box, gap: number) {
  const g = Math.max(0, gap)
  return left.left < right.right + g && left.right + g > right.left && left.top < right.bottom + g && left.bottom + g > right.top
}

/**
 * After ray-slide, pull labels inward toward the ring along each site's polar ray.
 * Process equator-first (3h/9h → poles) so side labels settle before polar ones.
 * Stop `clearancePx` before other labels/leaders, and keep at least `minRingDistancePx`
 * between the ring edge and each label box. Moving on the site ray keeps the leader radial
 * so polarmost labels are not blocked by crossing neighboring spokes.
 */
function implodeLabelsRadially(
  items: Item[],
  center: Point,
  ringRadius: number,
  mapWidth: number,
  clearancePx: number,
  minRingDistancePx: number,
) {
  const clearance = Math.max(0, clearancePx)
  const minRing = Math.max(0, minRingDistancePx)
  const ordered = [...items].toSorted((a, b) => {
    const da = Math.abs(a.connector.y - center.y)
    const db = Math.abs(b.connector.y - center.y)
    return da - db || a.index - b.index
  })

  function implodeOne(item: Item) {
    const cosT = Math.cos(item.theta)
    const sinT = Math.sin(item.theta)
    const start = item.connector
    const currentRho = Math.hypot(start.x - center.x, start.y - center.y)
    // Use the larger of current rho and the projection on the site ray so we never jump outward.
    const projected = (start.x - center.x) * cosT + (start.y - center.y) * sinT
    const startRho = Math.max(currentRho, projected)
    if (startRho < 1) return
    const minRho = ringRadius + Math.max(minRing, 2)
    if (startRho <= minRho + 0.5) return

    const others = items.filter((other) => other.index !== item.index)
    const onRay = (rho: number): Point => ({ x: center.x + cosT * rho, y: center.y + sinT * rho })

    const trialOk = (rho: number, labelGap: number) => {
      const trial = onRay(rho)
      // Site rays through 12h/6h sit on the midline; keep connectors on their packed side.
      if (item.side === 'right') trial.x = Math.max(trial.x, center.x + LETTER_CLEARANCE / 2)
      else trial.x = Math.min(trial.x, center.x - LETTER_CLEARANCE / 2)
      const box = buildBox(item, trial)
      if (box.left < VIEW_PADDING || box.right > mapWidth - VIEW_PADDING) return false
      if (distancePointToBox(center, box) < ringRadius + minRing) return false
      const trialElbow = elbowForItem(item, center, ringRadius, trial)
      if (leaderCrossesRing(trialElbow, trial, center, ringRadius)) return false

      const pad = Math.max(0, labelGap)
      const paddedSelf = {
        left: box.left - pad,
        right: box.right + pad,
        top: box.top - pad,
        bottom: box.bottom + pad,
      }

      for (const other of others) {
        const otherBox = buildBox(other, other.connector)
        if (boxesConflictWithGap(box, otherBox, labelGap)) return false
        const otherElbow = elbowForItem(other, center, ringRadius, other.connector)
        if (segmentIntersectsBox(otherElbow, other.connector, paddedSelf)) return false
        if (
          segmentIntersectsBox(trialElbow, trial, {
            left: otherBox.left - pad,
            right: otherBox.right + pad,
            top: otherBox.top - pad,
            bottom: otherBox.bottom + pad,
          })
        ) {
          return false
        }
      }
      return true
    }

    const placeAt = (rho: number) => {
      const trial = onRay(rho)
      if (item.side === 'right') trial.x = Math.max(trial.x, center.x + LETTER_CLEARANCE / 2)
      else trial.x = Math.min(trial.x, center.x - LETTER_CLEARANCE / 2)
      item.connector = trial
    }

    // Snap onto the site ray at the largest legal rho ≤ startRho (keeps leaders radial).
    let fromRho = startRho
    if (!trialOk(startRho, 0)) {
      let lo = minRho
      let hi = startRho
      let found = false
      for (let i = 0; i < 28; i += 1) {
        const mid = (lo + hi) / 2
        if (trialOk(mid, 0)) {
          found = true
          lo = mid
        } else {
          hi = mid
        }
      }
      if (!found) return
      fromRho = lo
    }
    placeAt(fromRho)
    if (fromRho <= minRho + 0.5) return

    const preferClearance = trialOk(fromRho, clearance)
    let lo = minRho
    let hi = fromRho
    const ok = (rho: number) => trialOk(rho, preferClearance ? clearance : 0)
    if (!ok(minRho)) {
      for (let i = 0; i < 28; i += 1) {
        const mid = (lo + hi) / 2
        if (ok(mid)) hi = mid
        else lo = mid
      }
    } else {
      hi = minRho
    }

    if (hi < fromRho - 0.5) {
      placeAt(hi)
    }
  }

  for (const item of ordered) implodeOne(item)
}

function buildBox(item: Item, connector: Point): Box {
  const half = item.textHeight / 2
  return item.side === 'right'
    ? { left: connector.x, right: connector.x + item.labelWidth, top: connector.y - half, bottom: connector.y + half }
    : { left: connector.x - item.labelWidth, right: connector.x, top: connector.y - half, bottom: connector.y + half }
}

/** Minimum distance from point C to segment AB. */
function segmentDistanceToPoint(a: Point, b: Point, c: Point) {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lengthSq = abx * abx + aby * aby
  if (lengthSq < 1e-9) return Math.hypot(c.x - a.x, c.y - a.y)
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * abx + (c.y - a.y) * aby) / lengthSq))
  return Math.hypot(c.x - (a.x + abx * t), c.y - (a.y + aby * t))
}

/** True when the elbow→label leader would cut through the plasmid disk. */
export function leaderCrossesRing(elbow: Point, connectorEnd: Point, center: Point, radius: number) {
  return segmentDistanceToPoint(elbow, connectorEnd, center) < radius - RING_CLEARANCE
}

/**
 * Find the point that maximizes the minimum distance to every label box (furthest from all
 * labels), constrained to a neighborhood of the layout center so a ring of `radius` still
 * fits. Re-anchor leaders to that center; leave label boxes / connectors fixed in place.
 */
export function balanceRingAmongLabels(
  callouts: EnzymeCallout[],
  layoutCenter: Point,
  radius: number,
  sequenceLength: number,
  mapWidth: number,
  mapHeight: number,
  rulerContactOffset = 3,
  topology: Topology = 'circular',
  bottomReservedPx = 0,
): { callouts: EnzymeCallout[]; ringCenter: Point } {
  if (!callouts.length) return { callouts, ringCenter: layoutCenter }

  const pad = radius + 8
  const maxShift = Math.min(80, Math.max(24, radius * 0.35))
  const minX = Math.max(pad, layoutCenter.x - maxShift)
  const maxX = Math.min(mapWidth - pad, layoutCenter.x + maxShift)
  const minY = Math.max(pad, layoutCenter.y - maxShift)
  const maxY = Math.min(mapHeight - pad - bottomReservedPx, layoutCenter.y + maxShift)
  if (minX > maxX || minY > maxY) return { callouts, ringCenter: layoutCenter }

  const scoreAt = (cx: number, cy: number) => {
    let min = Number.POSITIVE_INFINITY
    for (const callout of callouts) {
      const d = distancePointToBox({ x: cx, y: cy }, callout.box)
      if (d < min) min = d
    }
    return min
  }

  let bestX = Math.max(minX, Math.min(maxX, layoutCenter.x))
  let bestY = Math.max(minY, Math.min(maxY, layoutCenter.y))
  let bestScore = scoreAt(bestX, bestY)

  const coarse = 10
  for (let ix = 0; ix <= coarse; ix += 1) {
    for (let iy = 0; iy <= coarse; iy += 1) {
      const x = minX + ((maxX - minX) * ix) / coarse
      const y = minY + ((maxY - minY) * iy) / coarse
      const s = scoreAt(x, y)
      if (s > bestScore) {
        bestScore = s
        bestX = x
        bestY = y
      }
    }
  }

  for (let iter = 0; iter < 10; iter += 1) {
    const span = Math.max(2, (Math.max(maxX - minX, maxY - minY) / coarse) / 2 ** iter)
    let improved = false
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const x = Math.max(minX, Math.min(maxX, bestX + dx * span))
      const y = Math.max(minY, Math.min(maxY, bestY + dy * span))
      const s = scoreAt(x, y)
      if (s > bestScore + 1e-6) {
        bestScore = s
        bestX = x
        bestY = y
        improved = true
      }
    }
    if (!improved) break
  }

  const ringCenter = { x: bestX, y: bestY }
  if (Math.hypot(ringCenter.x - layoutCenter.x, ringCenter.y - layoutCenter.y) < 0.5) {
    return { callouts, ringCenter: layoutCenter }
  }

  const reanchored: EnzymeCallout[] = []
  for (const callout of callouts) {
    const connectorEnd = callout.connectorEnd
    const anchor = polarPoint(callout.site.start, sequenceLength, ringCenter.x, ringCenter.y, radius, rulerContactOffset, topology)
    const connectorDist = Math.hypot(connectorEnd.x - ringCenter.x, connectorEnd.y - ringCenter.y)
    const elbowOffset = Math.min(RADIAL_STUB_LENGTH, Math.max(2, connectorDist - radius - 2))
    const elbow = polarPoint(callout.site.start, sequenceLength, ringCenter.x, ringCenter.y, radius, elbowOffset, topology)
    if (leaderCrossesRing(elbow, connectorEnd, ringCenter, radius)) {
      return { callouts, ringCenter: layoutCenter }
    }
    // Reject if the ring disk would overlap a label box.
    if (distancePointToBox(ringCenter, callout.box) < radius - RING_CLEARANCE) {
      return { callouts, ringCenter: layoutCenter }
    }
    reanchored.push({
      ...callout,
      anchor,
      elbow,
      segments: [
        [anchor, elbow],
        [elbow, connectorEnd],
      ],
    })
  }

  return { callouts: reanchored, ringCenter }
}

/** A tiny center-search seed aimed away from the aggregate label demand. */
function labelDemandCenterCandidates(
  callouts: EnzymeCallout[],
  layoutCenter: Point,
  radius: number,
  mapWidth: number,
  mapHeight: number,
  bottomReservedPx: number,
): Point[] {
  // Small/symmetric layouts do not have enough directional demand to justify another route.
  if (callouts.length < 5) return []
  const demand = callouts.reduce(
    (sum, callout) => ({
      x: sum.x + (callout.box.left + callout.box.right) / 2,
      y: sum.y + (callout.box.top + callout.box.bottom) / 2,
    }),
    { x: 0, y: 0 },
  )
  const dx = demand.x / callouts.length - layoutCenter.x
  const dy = demand.y / callouts.length - layoutCenter.y
  const length = Math.hypot(dx, dy)
  if (length < 18) return []

  const pad = radius + 8
  const maxShift = Math.min(40, Math.max(24, radius * 0.2))
  const minX = Math.max(pad, layoutCenter.x - maxShift)
  const maxX = Math.min(mapWidth - pad, layoutCenter.x + maxShift)
  const minY = Math.max(pad, layoutCenter.y - maxShift)
  const maxY = Math.min(mapHeight - pad - bottomReservedPx, layoutCenter.y + maxShift)
  if (minX > maxX || minY > maxY) return []

  const awayX = -dx / length
  const awayY = -dy / length
  const candidates: Point[] = []
  // Two reroutes cap the extra final-pass work while allowing the quality comparator to choose
  // whether the expected shift is better at a modest or stronger displacement.
  for (const distance of [24, maxShift]) {
    const point = {
      x: Math.max(minX, Math.min(maxX, layoutCenter.x + awayX * distance)),
      y: Math.max(minY, Math.min(maxY, layoutCenter.y + awayY * distance)),
    }
    if (
      Math.hypot(point.x - layoutCenter.x, point.y - layoutCenter.y) >= 4 &&
      !candidates.some((candidate) => Math.hypot(point.x - candidate.x, point.y - candidate.y) < 2)
    ) candidates.push(point)
  }
  return candidates
}

function hasManualCurveGeometry(input: EnzymeCalloutLayoutInput) {
  return (input.ovoidK !== undefined && Math.abs(input.ovoidK) > 1e-6) ||
    input.ellipticHorizontalGapPx !== undefined ||
    input.ellipticVerticalGapPx !== undefined ||
    input.arcHorizontalGapPx !== undefined ||
    input.arcUpperVerticalGapPx !== undefined ||
    input.arcLowerVerticalGapPx !== undefined ||
    input.arcUpperTipAngleDegrees !== undefined ||
    input.arcLowerTipAngleDegrees !== undefined ||
    input.arcCurvature !== undefined ||
    input.arcLeftCurvature !== undefined ||
    input.arcRightCurvature !== undefined
}

function layoutEllipticWithResultCore(
  input: EnzymeCalloutLayoutInput,
  allowCenterSearch = !hasManualCurveGeometry(input),
): EnzymeCalloutLayoutResult {
  input.onEllipticCandidate?.()
  if (!input.sites.length) {
    const center = resolvedCenter(input)
    const { height } = layoutMapExtents(input)
    const bottomOverflow = Math.max(
      0,
      center.y + input.radius + 3 + VIEW_PADDING + (input.bottomReservedPx ?? 0) - height,
    )
    return {
      callouts: [],
      hasPlacementFailure: false,
      routingQuality: {
        fitsViewport: bottomOverflow <= 0.5,
        viewportOverflowPx: bottomOverflow,
        minBendAngle: 180,
        meanBendAngle: 180,
        belowTargetBendCount: 0,
        belowTargetBendSeverity: 0,
        maxLeaderLength: 0,
        meanLeaderLength: 0,
      },
    }
  }

  const center = resolvedCenter(input)
  const refine = input.optimizationPass !== 'coarse'
  const keepOnCurve = input.raySlideEnabled === false && input.radialImplodeEnabled === false
  const { width: mapWidth, height: mapHeight } = layoutMapExtents(input)
  const {
    a,
    b,
    bTop,
    bBottom,
    lambda,
    ovoidK,
    shape,
    actualUpperTipAngleDegrees,
    actualLowerTipAngleDegrees,
    arcLeftCurvature,
    arcRightCurvature,
  } = computeEllipticRadii(input)
  const items = buildItems(
    input,
    a,
    bTop,
    lambda,
    shape,
    bBottom,
    arcLeftCurvature,
    arcRightCurvature,
  )
  if (input.raySlideEnabled === false && input.radialImplodeEnabled === false) {
    sharePoleLabelsAcrossSides(items, arcLeftCurvature, arcRightCurvature, input.allowOneSidedPoleSharing === true)
  }

  let hasPlacementFailure = false
  const bySide = new Map<Side, Item[]>()
  items.forEach((item) => {
    const list = bySide.get(item.side) ?? []
    list.push(item)
    bySide.set(item.side, list)
  })

  bySide.forEach((list) => {
    const sideLambda = list[0]?.curveLambda ?? lambda
    if (
      !packSide(
        list,
        a,
        bTop,
        center,
        sideLambda,
        input.radius,
        refine,
        input.arcCompactMinimumBendAngle,
      )
    ) hasPlacementFailure = true
  })

  if (
    input.arcCompactMinimumBendAngle !== undefined &&
    (input.balanceRing === false || !refine || !keepOnCurve)
  ) {
    compactPolarLabelsTowardEquator(
      items,
      a,
      bTop,
      center,
      input.radius,
      center,
      input.arcCompactMinimumBendAngle,
    )
  }

  const left = bySide.get('left') ?? []
  const right = bySide.get('right') ?? []
  // When both optional movement modes are disabled, curve placement is a hard contract.
  // The side-angle pole inset supplies the cross-pole gap without moving connectors in X.
  if (!keepOnCurve) enforceAcrossPoleHorizClearance(left, right, center)
  if (input.raySlideEnabled !== false) {
    slideHorizontallyTowardRays(items, center, input.radius, mapWidth, input.raySlideClearancePx ?? LABEL_GAP)
    enforceAcrossPoleHorizClearance(left, right, center)
  }
  if (input.radialImplodeEnabled !== false) {
    implodeLabelsRadially(
      items,
      center,
      input.radius,
      mapWidth,
      input.radialImplodeClearancePx ?? LABEL_GAP,
      input.radialImplodeMinRingDistancePx ?? 24,
    )
    enforceAcrossPoleHorizClearance(left, right, center)
  }

  const anchorOffset = input.rulerContactOffset ?? 3

  const callouts: EnzymeCallout[] = []
  items.forEach((item) => {
    const connectorEnd = item.connector
    const box = buildBox(item, connectorEnd)
    item.y = connectorEnd.y
    const anchor = polarPoint(item.site.start, input.sequenceLength, center.x, center.y, input.radius, anchorOffset, input.topology)
    // Keep the radial stub inside the connector so the leader never bends back on itself
    // (happens when the viewport cap pulls the oval very close to the ring).
    const connectorDist = Math.hypot(connectorEnd.x - center.x, connectorEnd.y - center.y)
    const elbowOffset = Math.min(RADIAL_STUB_LENGTH, Math.max(2, connectorDist - input.radius - 2))
    const elbow = polarPoint(item.site.start, input.sequenceLength, center.x, center.y, input.radius, elbowOffset, input.topology)

    if (leaderCrossesRing(elbow, connectorEnd, center, input.radius)) hasPlacementFailure = true

    // Horizontal overflow means the ring is too wide for the label band → the search
    // must shrink it (no horizontal scroll). Vertical overflow is allowed: the oval
    // grows up/down and the caller expands the SVG for a vertical scroll instead.
    if (
      input.allowViewportOverflow !== true &&
      (box.left < VIEW_PADDING || box.right > mapWidth - VIEW_PADDING)
    ) {
      hasPlacementFailure = true
    }

    const connectorTheta = Math.atan2(connectorEnd.y - center.y, connectorEnd.x - center.x)
    const itemPoleRadius = Math.sin(item.theta) < 0 ? bTop : bBottom
    input.debugLog?.({
      algorithm: 'elliptic',
      index: item.index,
      label: item.label,
      quarter: item.quarter,
      a: Number(a.toFixed(1)),
      b: Number(b.toFixed(1)),
      bTop: Number(bTop.toFixed(1)),
      bBottom: Number(bBottom.toFixed(1)),
      curveShape: shape,
      arcUpperTipAngleDegrees:
        actualUpperTipAngleDegrees === null ? null : Number(actualUpperTipAngleDegrees.toFixed(1)),
      arcLowerTipAngleDegrees:
        actualLowerTipAngleDegrees === null ? null : Number(actualLowerTipAngleDegrees.toFixed(1)),
      arcLeftCurvature: Number(cubicArcCurvatureForPole(a, itemPoleRadius, arcLeftCurvature).toFixed(3)),
      arcRightCurvature: Number(cubicArcCurvatureForPole(a, itemPoleRadius, arcRightCurvature).toFixed(3)),
      ovoidK: Number(ovoidK.toFixed(3)),
      lambda: Number(lambda.toFixed(6)),
      idealTheta: Number(item.theta.toFixed(4)),
      packedTheta: Number(item.packedTheta.toFixed(4)),
      driftDeg: Number((((connectorTheta - item.theta) * 180) / Math.PI).toFixed(2)),
    })

    callouts.push({
      site: item.site,
      index: item.index,
      anchor,
      elbow,
      connectorEnd,
      x: connectorEnd.x,
      y: connectorEnd.y + item.textHeight / 2 - 3,
      label: item.label,
      textAnchor: item.side === 'right' ? 'start' : 'end',
      box,
      segments: [
        [anchor, elbow],
        [elbow, connectorEnd],
      ],
    })
  })

  callouts.sort((left, right) => left.index - right.index)

  if (calloutsHaveLabelConflicts(callouts)) hasPlacementFailure = true
  // Candidate scoring needs only packing, bounds and bend quality. Ring recentering and the
  // post-center dense-run pass are final-layout refinements and used to dominate auto search.
  if (input.balanceRing === false || !refine) {
    return {
      callouts,
      hasPlacementFailure,
      ringCenter: center,
      routingQuality: circularRoutingQuality(callouts, input),
    }
  }

  const balanced = balanceRingAmongLabels(
    callouts,
    center,
    input.radius,
    input.sequenceLength,
    mapWidth,
    mapHeight,
    anchorOffset,
    input.topology ?? 'circular',
    input.bottomReservedPx ?? 0,
  )

  const drawCenter = balanced.ringCenter
  let finalCallouts = balanced.callouts

  // Ring recentering changes the leader directions after oval packing. When labels have stayed
  // on the oval, give dense runs one final balancing pass against the actual draw center.
  if (keepOnCurve) {
    if (Math.hypot(drawCenter.x - center.x, drawCenter.y - center.y) >= 0.5) {
      bySide.forEach((list) => {
        const sideLambda = list[0]?.curveLambda ?? lambda
        optimizeSidePivotPacking(
          list,
          a,
          bTop,
          center,
          sideLambda,
          input.radius,
          drawCenter,
          items,
          input.arcCompactMinimumBendAngle,
        )
        balanceDenseRuns(
          list,
          a,
          bTop,
          center,
          sideLambda,
          input.radius,
          drawCenter,
          items,
          input.arcCompactMinimumBendAngle,
        )
      })
    }
    if (input.arcCompactMinimumBendAngle !== undefined) {
      compactPolarLabelsTowardEquator(
        items,
        a,
        bTop,
        center,
        input.radius,
        drawCenter,
        input.arcCompactMinimumBendAngle,
      )
    }
    const itemByIndex = new Map(items.map((item) => [item.index, item]))
    finalCallouts = balanced.callouts.map((callout) => {
      const item = itemByIndex.get(callout.index)
      if (!item) return callout
      const connectorEnd = item.connector
      const box = buildBox(item, connectorEnd)
      const anchor = polarPoint(
        item.site.start,
        input.sequenceLength,
        drawCenter.x,
        drawCenter.y,
        input.radius,
        anchorOffset,
        input.topology,
      )
      const elbow = elbowForItem(item, drawCenter, input.radius, connectorEnd)
      return {
        ...callout,
        anchor,
        elbow,
        connectorEnd,
        x: connectorEnd.x,
        y: connectorEnd.y + item.textHeight / 2 - 3,
        box,
        segments: [
          [anchor, elbow],
          [elbow, connectorEnd],
        ],
      }
    })
  }

  // Re-check leaders against the (possibly shifted) ring center.
  for (const callout of finalCallouts) {
    if (leaderCrossesRing(callout.elbow, callout.connectorEnd, drawCenter, input.radius)) hasPlacementFailure = true
    if (
      input.allowViewportOverflow !== true &&
      (callout.box.left < VIEW_PADDING || callout.box.right > mapWidth - VIEW_PADDING)
    ) hasPlacementFailure = true
  }
  if (calloutsHaveLabelConflicts(finalCallouts)) hasPlacementFailure = true

  const baselineResult: EnzymeCalloutLayoutResult = {
    callouts: finalCallouts,
    hasPlacementFailure,
    ringCenter: balanced.ringCenter,
    routingQuality: circularRoutingQuality(finalCallouts, input, balanced.ringCenter),
  }

  // Re-run the actual router at a couple of bounded centers when the placed labels show a
  // clear directional load. The original center remains the baseline, while each candidate
  // packs and routes from its own center; translating finished labels would leave stale leaders
  // and miss geometry changes that can improve crowded sectors.
  if (!allowCenterSearch) return baselineResult
  const coarseBaseline = layoutEllipticWithResultCore({ ...input, optimizationPass: 'coarse', debugLog: undefined }, false)
  let bestCoarse = coarseBaseline
  let bestCenter: Point | undefined
  const summarizeCenter = (result: EnzymeCalloutLayoutResult) => ({
    center: result.ringCenter,
    quality: result.routingQuality,
    placementFailure: result.hasPlacementFailure,
    callouts: result.callouts.length,
    violations: collectLayoutViolations(result.callouts, {
      ...input, centerX: result.ringCenter?.x ?? center.x, centerY: result.ringCenter?.y ?? center.y,
    }).filter((violation) => !violation.includes('out of bounds') && !violation.includes('out-of-bounds')),
  })
  input.onCenterSearchDebug?.({ event: 'baseline', proposedCenter: center,
    coarse: summarizeCenter(coarseBaseline), final: summarizeCenter(baselineResult) })
  for (const candidateCenter of labelDemandCenterCandidates(
    finalCallouts,
    center,
    input.radius,
    mapWidth,
    mapHeight,
    input.bottomReservedPx ?? 0,
  )) {
    const candidate = layoutEllipticWithResultCore({
      ...input,
      centerX: candidateCenter.x,
      centerY: candidateCenter.y,
      optimizationPass: 'coarse',
      debugLog: undefined,
    }, false)
    const better = arcCandidateIsBetter(candidate, bestCoarse)
    input.onCenterSearchDebug?.({ event: 'coarse-candidate', proposedCenter: candidateCenter,
      result: summarizeCenter(candidate), accepted: better })
    if (input.onCenterSearchDebug) {
      // Diagnostic-only: the production search finalizes just its coarse winner.
      const evaluated = layoutEllipticWithResultCore({
        ...input, centerX: candidateCenter.x, centerY: candidateCenter.y,
        optimizationPass: 'final', debugLog: undefined, onCenterSearchDebug: undefined,
        onEllipticCandidate: undefined,
      }, false)
      input.onCenterSearchDebug({ event: 'diagnostic-final-candidate', proposedCenter: candidateCenter,
        result: summarizeCenter(evaluated), becameCoarseLeader: better })
    }
    if (better) {
      bestCoarse = candidate
      bestCenter = candidateCenter
    }
  }
  if (!bestCenter) {
    input.onCenterSearchDebug?.({ event: 'center-decision', reason: 'no-coarse-winner', selected: summarizeCenter(baselineResult) })
    return baselineResult
  }
  const finalist = layoutEllipticWithResultCore({
    ...input, centerX: bestCenter.x, centerY: bestCenter.y, debugLog: undefined,
  }, false)
  // Center movement is a final refinement of already selected curve geometry. It must not
  // trade away the weakest bend from the unshifted, fully refined result merely to reduce
  // aggregate box overflow; keep that result as the finished-geometry guardrail.
  if (
    finalist.routingQuality && baselineResult.routingQuality &&
    finalist.routingQuality.minBendAngle < baselineResult.routingQuality.minBendAngle - ROUTING_QUALITY_TOLERANCE
  ) {
    input.onCenterSearchDebug?.({ event: 'center-decision', proposedCenter: bestCenter,
      candidate: summarizeCenter(finalist), reason: 'final-minimum-bend-guard', selected: summarizeCenter(baselineResult) })
    return baselineResult
  }
  const betterFinal = arcCandidateIsBetter(finalist, baselineResult)
  input.onCenterSearchDebug?.({ event: 'center-decision', proposedCenter: bestCenter,
    candidate: summarizeCenter(finalist), reason: betterFinal ? 'accepted' : 'final-comparison',
    selected: summarizeCenter(betterFinal ? finalist : baselineResult) })
  return betterFinal ? finalist : baselineResult
}

function circularRoutingQuality(
  callouts: EnzymeCallout[],
  input: EnzymeCalloutLayoutInput,
  ringCenter = resolvedCenter(input),
): NonNullable<EnzymeCalloutLayoutResult['routingQuality']> {
  const { width, height } = layoutMapExtents(input)
  const bottomLimit = height - VIEW_PADDING - (input.bottomReservedPx ?? 0)
  let overflow = 0
  const bends: number[] = []
  const leaderLengths: number[] = []
  let left = ringCenter.x - input.radius
  let right = ringCenter.x + input.radius
  let top = ringCenter.y - input.radius
  let bottom = ringCenter.y + input.radius

  for (const callout of callouts) {
    left = Math.min(left, callout.box.left, callout.anchor.x, callout.elbow.x, callout.connectorEnd.x)
    right = Math.max(right, callout.box.right, callout.anchor.x, callout.elbow.x, callout.connectorEnd.x)
    top = Math.min(top, callout.box.top, callout.anchor.y, callout.elbow.y, callout.connectorEnd.y)
    bottom = Math.max(bottom, callout.box.bottom, callout.anchor.y, callout.elbow.y, callout.connectorEnd.y)
    overflow += Math.max(0, VIEW_PADDING - callout.box.left)
    overflow += Math.max(0, callout.box.right - (width - VIEW_PADDING))
    overflow += Math.max(0, VIEW_PADDING - callout.box.top)
    overflow += Math.max(0, callout.box.bottom - bottomLimit)
    const bend = leaderBendAngleDegrees(callout)
    if (bend !== null) bends.push(bend)
    leaderLengths.push(Math.hypot(
      callout.connectorEnd.x - callout.elbow.x,
      callout.connectorEnd.y - callout.elbow.y,
    ))
  }

  // The name/length block is placed after the lowest ring or callout content, so even a map
  // with no lower labels must leave enough room below the ring itself.
  overflow += Math.max(0, ringCenter.y + input.radius + 3 - bottomLimit)

  return {
    fitsViewport: overflow <= 0.5,
    viewportOverflowPx: overflow,
    canvasGrowthHorizontalPx: Math.max(0, -left) + Math.max(0, right - width),
    canvasGrowthVerticalPx: Math.max(0, -top) + Math.max(0, bottom + (input.bottomReservedPx ?? 0) - height),
    minBendAngle: bends.length ? Math.min(...bends) : 180,
    meanBendAngle: bends.length
      ? bends.reduce((sum, angle) => sum + angle, 0) / bends.length
      : 180,
    belowTargetBendCount: bends.filter((angle) => angle < ROUTING_BEND_TARGET_DEGREES).length,
    belowTargetBendSeverity: bends.reduce(
      (sum, angle) => sum + Math.max(0, ROUTING_BEND_TARGET_DEGREES - angle),
      0,
    ),
    maxLeaderLength: leaderLengths.length ? Math.max(...leaderLengths) : 0,
    meanLeaderLength: leaderLengths.length
      ? leaderLengths.reduce((sum, length) => sum + length, 0) / leaderLengths.length
      : 0,
  }
}

/** Move a few obstructed connectors outward, accepting only a fully valid result. */
function repairLeaderLabelConflicts(
  result: EnzymeCalloutLayoutResult,
  input: EnzymeCalloutLayoutInput,
): EnzymeCalloutLayoutResult | null {
  const center = result.ringCenter ?? resolvedCenter(input)
  const validationInput = { ...input, centerX: center.x, centerY: center.y }
  let callouts = result.callouts
  const errors = (items: EnzymeCallout[]) => collectLayoutViolations(items, validationInput)
    .filter((error) => !error.includes('out of bounds') && !error.includes('out-of-bounds'))
  let remaining = errors(callouts).length
  for (let pass = 0; remaining && pass < 3; pass += 1) {
    let best: EnzymeCallout[] | null = null
    let bestCount = remaining
    let attempts = 0
    for (const callout of callouts) {
      const obstructed = callouts.some((other) => other !== callout &&
        segmentIntersectsBox(callout.elbow, callout.connectorEnd, paddedBox(other.box)))
      const acute = (leaderBendAngleDegrees(callout) ?? 180) < 90
      if ((!obstructed && !acute) || callout.textAnchor === 'middle') continue
      const direction = callout.textAnchor === 'end' ? -1 : 1
      for (const [distance, dy] of [[16, 0], [32, 0], [48, 0], [64, 0], [16, 16], [16, -16], [32, 16], [32, -16]] as const) {
        if (attempts++ >= 24) break
        const dx = direction * distance
        const end = { x: callout.connectorEnd.x + dx, y: callout.connectorEnd.y + dy }
        const moved: EnzymeCallout = {
          ...callout, connectorEnd: end, x: callout.x + dx, y: callout.y + dy,
          box: { left: callout.box.left + dx, right: callout.box.right + dx,
            top: callout.box.top + dy, bottom: callout.box.bottom + dy },
          segments: [callout.segments[0], [callout.elbow, end]],
        }
        const candidate = callouts.map((item) => item === callout ? moved : item)
        const count = errors(candidate).length
        if (count < bestCount) { best = candidate; bestCount = count }
        if (!count) break
      }
      if (!bestCount || attempts >= 24) break
    }
    if (!best) break
    callouts = best
    remaining = bestCount
  }
  if (!remaining && !hasNonBoundsLayoutViolations(callouts, validationInput)) {
    return { ...result, callouts, routingQuality: circularRoutingQuality(callouts, input, center) }
  }

  // Preserve the original leader-repair budget above. Only when it cannot clear all
  // conflicts, test up to 24 separate moves of labels whose boxes geometrically block a leader.
  const blockerIndexes = new Set<number>()
  for (const leader of callouts) {
    for (const [index, blocker] of callouts.entries()) {
      if (blocker !== leader && leader.segments.some((segment) =>
        segmentIntersectsBox(segment[0], segment[1], paddedBox(blocker.box)))) blockerIndexes.add(index)
    }
  }
  let blockerAttempts = 0
  let bestValid: { callouts: EnzymeCallout[]; quality: NonNullable<EnzymeCalloutLayoutResult['routingQuality']>; movement: number } | null = null
  const baselineQuality = circularRoutingQuality(callouts, input, center)
  for (const blockerIndex of blockerIndexes) {
    const callout = callouts[blockerIndex]!
    if (callout.textAnchor === 'middle') continue
    const step = callout.box.bottom - callout.box.top + LABEL_GAP
    for (const direction of [1, -1]) {
      for (const multiple of [1, 2, 3]) {
        if (blockerAttempts++ >= 24) break
        const dy = direction * step * multiple
        const end = { x: callout.connectorEnd.x, y: callout.connectorEnd.y + dy }
        const moved: EnzymeCallout = {
          ...callout,
          y: callout.y + dy,
          connectorEnd: end,
          box: { ...callout.box, top: callout.box.top + dy, bottom: callout.box.bottom + dy },
          segments: [callout.segments[0], [callout.elbow, end]],
        }
        const candidate = callouts.map((item, index) => index === blockerIndex ? moved : item)
        if (hasNonBoundsLayoutViolations(candidate, validationInput)) continue
        const quality = circularRoutingQuality(candidate, input, center)
        const movement = Math.abs(dy)
        const noQualityRegression =
          quality.minBendAngle >= baselineQuality.minBendAngle - ROUTING_QUALITY_TOLERANCE &&
          quality.belowTargetBendSeverity <= baselineQuality.belowTargetBendSeverity + ROUTING_QUALITY_TOLERANCE
        if (!noQualityRegression) continue
        if (!bestValid || movement < bestValid.movement ||
          (movement === bestValid.movement && circularRoutingQualityIsBetter(quality, bestValid.quality))) {
          bestValid = { callouts: candidate, quality, movement }
        }
      }
      if (blockerAttempts >= 24) break
    }
    if (blockerAttempts >= 24) break
  }
  if (bestValid) {
    input.onCenterSearchDebug?.({ event: 'blocker-repair', center, movement: bestValid.movement,
      attempts: blockerAttempts, quality: bestValid.quality })
    return { ...result, callouts: bestValid.callouts, routingQuality: bestValid.quality }
  }
  return null
}

/** Extra space needed outside the viewport, measured by content extent rather than per-label sum. */
function contentGrowth(result: EnzymeCalloutLayoutResult, input: EnzymeCalloutLayoutInput) {
  const { width, height } = layoutMapExtents(input)
  const center = result.ringCenter ?? resolvedCenter(input)
  const boxes = result.callouts.map((callout) => callout.box)
  const points = result.callouts.flatMap((callout) => [callout.anchor, callout.elbow, callout.connectorEnd])
  return {
    horizontal: Math.max(0, -Math.min(center.x - input.radius, ...boxes.map((box) => box.left), ...points.map((point) => point.x))) +
      Math.max(0, Math.max(center.x + input.radius, ...boxes.map((box) => box.right), ...points.map((point) => point.x)) - width),
    vertical: Math.max(0, -Math.min(center.y - input.radius, ...boxes.map((box) => box.top), ...points.map((point) => point.y))) +
      Math.max(0, Math.max(center.y + input.radius, ...boxes.map((box) => box.bottom), ...points.map((point) => point.y)) + (input.bottomReservedPx ?? 0) - height),
  }
}

function layoutEllipticWithResult(input: EnzymeCalloutLayoutInput): EnzymeCalloutLayoutResult {
  input = withPreparedSites(input)
  if ((input.labelCurveShape ?? 'ellipse') !== 'arcs') {
    return layoutEllipticWithResultCore(input)
  }

  const autoHorizontal = input.arcHorizontalGapPx === undefined
  const autoUpper =
    input.arcUpperVerticalGapPx === undefined && input.arcUpperTipAngleDegrees === undefined
  const autoLower =
    input.arcLowerVerticalGapPx === undefined && input.arcLowerTipAngleDegrees === undefined
  if (!autoHorizontal && !autoUpper && !autoLower) {
    const result = layoutEllipticWithResultCore(input)
    if (result.hasPlacementFailure || result.routingQuality?.fitsViewport === false) {
      const overflowInput: EnzymeCalloutLayoutInput = {
        ...input,
        arcAutoFitUpper: false,
        arcAutoFitLower: false,
        allowViewportOverflow: true,
      }
      let overflowResult = layoutEllipticWithResultCore(overflowInput)
      if (input.arcCompactOverflowLabels === true && overflowResult.routingQuality) {
        const compactResult = layoutEllipticWithResultCore({
          ...overflowInput,
          debugLog: undefined,
          arcCompactMinimumBendAngle: overflowResult.routingQuality.minBendAngle,
        })
        if (arcOverflowCandidateIsBetter(compactResult, overflowResult, true)) {
          overflowResult = input.debugLog
            ? layoutEllipticWithResultCore({
                ...overflowInput,
                arcCompactMinimumBendAngle: overflowResult.routingQuality.minBendAngle,
              })
            : compactResult
        }
      }
      return { ...overflowResult, overflowMode: true }
    }
    return {
      ...result,
      overflowMode: false,
    }
  }

  const coarseInput: EnzymeCalloutLayoutInput = {
    ...input,
    debugLog: undefined,
    optimizationPass: 'coarse',
    arcAutoFitUpper: autoUpper,
    arcAutoFitLower: autoLower,
  }
  let selectedInput = coarseInput
  let selectedResult = layoutEllipticWithResultCore(selectedInput)

  const tryCandidate = (candidateInput: EnzymeCalloutLayoutInput) => {
    const candidateResult = layoutEllipticWithResultCore(candidateInput)
    if (!arcCandidateIsBetter(candidateResult, selectedResult)) return
    selectedInput = candidateInput
    selectedResult = candidateResult
  }

  if (autoHorizontal) {
    const radii = computeEllipticRadii(selectedInput)
    const automaticGap = Math.max(16, radii.a - input.radius)
    const minimumGap = Math.max(16, input.ringGap ?? 0)
    const gaps = [automaticGap, (automaticGap + minimumGap) / 2, minimumGap]
    const seen = new Set<number>()
    for (const rawGap of gaps) {
      const gap = Math.round(rawGap)
      if (seen.has(gap)) continue
      seen.add(gap)
      tryCandidate({ ...selectedInput, arcHorizontalGapPx: gap })
    }
  }

  // Circular quarters are only one member of the arc family. Seed with symmetric cubics, then
  // optimize the left and right Bézier sides independently. Combined with independent upper and
  // lower pole radii, this gives all four quarters their own effective geometry.
  const autoSideCurvature =
    input.arcCurvature === undefined &&
    input.arcLeftCurvature === undefined &&
    input.arcRightCurvature === undefined
  let lowerTip175SurvivedPoleCap = false
  if (autoSideCurvature) {
    const curvatureRadii = computeEllipticRadii(selectedInput)
    const curvatureUsable = (curvature: number) =>
      arcCurvatureUsableOnPoles(
        curvatureRadii.a,
        curvatureRadii.bTop,
        curvatureRadii.bBottom,
        curvature,
      )
    for (const arcCurvature of [0.22, 0.5]) {
      if (!curvatureUsable(arcCurvature)) continue
      tryCandidate({ ...selectedInput, arcCurvature })
    }

    for (const side of ['left', 'right'] as const) {
      const inputKey = side === 'left' ? 'arcLeftCurvature' : 'arcRightCurvature'
      for (const curvature of [0.12, 0.35, 0.65]) {
        if (!curvatureUsable(curvature)) continue
        const candidateInput = { ...selectedInput, [inputKey]: curvature }
        const candidateResult = layoutEllipticWithResultCore(candidateInput)
        const candidateSide = arcSideBendQuality(candidateResult, side)
        const selectedSide = arcSideBendQuality(selectedResult, side)
        const candidateQuality = candidateResult.routingQuality
        const selectedQuality = selectedResult.routingQuality
        const preservesGlobalMinimum =
          candidateQuality !== undefined &&
          selectedQuality !== undefined &&
          candidateQuality.minBendAngle >= selectedQuality.minBendAngle - 0.25
        const improvesThisSide =
          candidateSide !== null &&
          selectedSide !== null &&
          (candidateSide.min > selectedSide.min + 0.25 ||
            (Math.abs(candidateSide.min - selectedSide.min) <= 0.25 &&
              candidateSide.mean > selectedSide.mean + 0.25))
        const sameFeasibilityClass =
          candidateResult.hasPlacementFailure === selectedResult.hasPlacementFailure &&
          candidateQuality?.fitsViewport === selectedQuality?.fitsViewport
        if (
          arcCandidateIsBetter(candidateResult, selectedResult) ||
          (sameFeasibilityClass && preservesGlobalMinimum && improvesThisSide)
        ) {
          selectedInput = candidateInput
          selectedResult = candidateResult
        }
      }
    }
  }

  for (const half of ['upper', 'lower'] as const) {
    const inputKey = half === 'upper' ? 'arcUpperTipAngleDegrees' : 'arcLowerTipAngleDegrees'
    if (half === 'upper' ? !autoUpper : !autoLower) continue

    const baselineRadii = computeEllipticRadii(selectedInput)
    const baselineTip = half === 'upper'
      ? baselineRadii.actualUpperTipAngleDegrees
      : baselineRadii.actualLowerTipAngleDegrees
    if (baselineTip === null) continue

    const candidateTips = [
      175,
      baselineTip - 8,
      baselineTip - 16,
      baselineTip - 24,
    ].map((angle) => Math.max(70, Math.min(175, Math.round(angle))))
    const baselinePoleRadius = half === 'upper' ? baselineRadii.bTop : baselineRadii.bBottom
    const maximumPoleRadius = baselinePoleRadius + input.radius * AUTO_TIP_MAX_EXTRA_RADIUS_RATIO
    const seen = new Set<number>()

    for (const candidateTip of candidateTips) {
      if (seen.has(candidateTip)) continue
      seen.add(candidateTip)
      const candidateInput = { ...selectedInput, [inputKey]: candidateTip }
      const radii = computeEllipticRadii(candidateInput)
      const poleRadius = half === 'upper' ? radii.bTop : radii.bBottom
      if (poleRadius > maximumPoleRadius + 0.5) continue
      if (half === 'lower' && candidateTip === 175) lowerTip175SurvivedPoleCap = true
      const candidateResult = layoutEllipticWithResultCore(candidateInput)
      const candidateHalf = arcHalfBendQuality(candidateResult, input, half)
      const selectedHalf = arcHalfBendQuality(selectedResult, input, half)
      const candidateQuality = candidateResult.routingQuality
      const selectedQuality = selectedResult.routingQuality
      const preservesGlobalMinimum =
        candidateQuality !== undefined &&
        selectedQuality !== undefined &&
        candidateQuality.minBendAngle >= selectedQuality.minBendAngle - 0.25
      const improvesThisHalf =
        candidateHalf !== null &&
        selectedHalf !== null &&
        (candidateHalf.min > selectedHalf.min + 0.25 ||
          (Math.abs(candidateHalf.min - selectedHalf.min) <= 0.25 &&
            candidateHalf.mean > selectedHalf.mean + 0.25))
      const sameFeasibilityClass =
        candidateResult.hasPlacementFailure === selectedResult.hasPlacementFailure &&
        candidateQuality?.fitsViewport === selectedQuality?.fitsViewport
      if (
        arcCandidateIsBetter(candidateResult, selectedResult) ||
        (sameFeasibilityClass && preservesGlobalMinimum && improvesThisHalf)
      ) {
        selectedInput = candidateInput
        selectedResult = candidateResult
      }
    }

  }

  // A viewport-capped curve cannot represent an arbitrarily large label shelf. Once every
  // normal candidate still fails or overflows, stop distorting the pole geometry and rerun with
  // uncapped half heights. In this phase validity and bend angles outrank canvas dimensions;
  // the caller expands the SVG to the resulting content bounds and supplies scrolling.
  const overflowMode =
    selectedResult.hasPlacementFailure || selectedResult.routingQuality?.fitsViewport === false
  if (overflowMode) {
    const uncapped = (candidate: EnzymeCalloutLayoutInput): EnzymeCalloutLayoutInput => ({
      ...candidate,
      debugLog: undefined,
      optimizationPass: 'coarse',
      arcAutoFitUpper: false,
      arcAutoFitLower: false,
      allowViewportOverflow: true,
    })
    let overflowInput = uncapped(selectedInput)
    let overflowResult = layoutEllipticWithResultCore(overflowInput)
    const tryOverflowCandidate = (candidateInput: EnzymeCalloutLayoutInput) => {
      const normalizedInput = uncapped(candidateInput)
      const candidateResult = layoutEllipticWithResultCore(normalizedInput)
      if (
        !arcOverflowCandidateIsBetter(
          candidateResult,
          overflowResult,
          input.arcCompactOverflowLabels === true,
        )
      ) return
      overflowInput = normalizedInput
      overflowResult = candidateResult
    }

    // Also consider the original automatic geometry: normal-mode tip refinements were selected
    // under a viewport constraint that no longer applies.
    tryOverflowCandidate(coarseInput)

    if (autoHorizontal) {
      const radii = computeEllipticRadii(overflowInput)
      const automaticGap = Math.max(16, radii.a - input.radius)
      const minimumGap = Math.max(16, input.ringGap ?? 0)
      for (const gap of [automaticGap, (automaticGap + minimumGap) / 2, minimumGap]) {
        tryOverflowCandidate({ ...overflowInput, arcHorizontalGapPx: Math.round(gap) })
      }
    }

    if (autoSideCurvature) {
      const overflowRadii = computeEllipticRadii(overflowInput)
      for (const side of ['left', 'right'] as const) {
        const inputKey = side === 'left' ? 'arcLeftCurvature' : 'arcRightCurvature'
        for (const curvature of [0, 0.18, 0.4, 0.7]) {
          if (
            !arcCurvatureUsableOnPoles(
              overflowRadii.a,
              overflowRadii.bTop,
              overflowRadii.bBottom,
              curvature,
            )
          ) continue
          tryOverflowCandidate({ ...overflowInput, [inputKey]: curvature })
        }
      }
    }

    selectedInput = overflowInput
    selectedResult = { ...overflowResult, overflowMode: true }
  }

  // Radius search consumes the cheap result directly. A rendered/final evaluation performs
  // the expensive pivot, dense-run and ring-center refinement exactly once for the winning
  // geometry instead of once for every automatic arc candidate.
  if (input.optimizationPass === 'coarse') return selectedResult
  const finalInput: EnzymeCalloutLayoutInput = {
    ...selectedInput,
    optimizationPass: 'final',
    debugLog: input.debugLog,
  }
  // Shape search may have filled in automatic arc values. Decide whether geometry is manual
  // from the caller's original controls, before those automatic values are materialized.
  const allowCenterSearch = !hasManualCurveGeometry(input)
  let selectedFinalInput = finalInput
  let finalResult = layoutEllipticWithResultCore(finalInput, allowCenterSearch)

  // Coarse packing can occasionally overestimate an asymmetric side curvature before dense-run
  // balancing. Keep the symmetric candidate as a final-pass guardrail; asymmetric Béziers must
  // actually improve the finished layout, not merely its cheap proxy.
  if (
    autoSideCurvature &&
    (finalInput.arcLeftCurvature !== undefined || finalInput.arcRightCurvature !== undefined)
  ) {
    const symmetricInput = {
      ...finalInput,
      arcLeftCurvature: undefined,
      arcRightCurvature: undefined,
      debugLog: undefined,
    }
    const symmetricResult = layoutEllipticWithResultCore(symmetricInput, allowCenterSearch)
    const symmetricIsBetter = overflowMode
      ? arcOverflowCandidateIsBetter(
          symmetricResult,
          finalResult,
          input.arcCompactOverflowLabels === true,
        )
      : arcCandidateIsBetter(symmetricResult, finalResult)
    if (symmetricIsBetter) {
      selectedFinalInput = symmetricInput
      finalResult = input.debugLog
        ? layoutEllipticWithResultCore({ ...symmetricInput, debugLog: input.debugLog }, allowCenterSearch)
        : symmetricResult
    }
  }

  // Compact only after the symmetric final-pass guard has chosen the actual finished geometry.
  // Otherwise the guard can replace a successfully compacted asymmetric layout with an
  // uncompacted symmetric one, which made the checkbox appear to do nothing at wide/short
  // overflow viewports.
  if (
    overflowMode &&
    input.arcCompactOverflowLabels === true &&
    finalResult.routingQuality
  ) {
    const minimumBendAngle = finalResult.routingQuality.minBendAngle
    const compactResult = layoutEllipticWithResultCore({
      ...selectedFinalInput,
      debugLog: undefined,
      arcCompactMinimumBendAngle: minimumBendAngle,
    }, allowCenterSearch)
    if (arcOverflowCandidateIsBetter(compactResult, finalResult, true)) {
      finalResult = input.debugLog
        ? layoutEllipticWithResultCore({
            ...selectedFinalInput,
            arcCompactMinimumBendAngle: minimumBendAngle,
          }, allowCenterSearch)
        : compactResult
    }
  }

  // A large automatically estimated side band can clamp the arc so tightly that a crowded
  // quarter has no useful horizontal room. Try one wider envelope after normal search, then
  // accept it only if the finished route is valid and its actual canvas growth buys a material
  // reduction in severe bends. Explicit geometry and configured side budgets stay authoritative.
  if (
    overflowMode && autoHorizontal && !hasManualCurveGeometry(input) &&
    (input.adaptiveSideBudget === true || input.sideBudget === undefined) &&
    input.arcCompactOverflowLabels !== true &&
    finalResult.routingQuality && finalResult.routingQuality.minBendAngle < 110 &&
    input.sites.length >= 12
  ) {
    const originalBudget = input.sideBudget ?? Math.max(MIN_SIDE_BUDGET, maxLabelWidth(input))
    const expandedInput: EnzymeCalloutLayoutInput = {
      ...input,
      adaptiveSideBudget: false,
      sideBudget: Math.max(0, originalBudget - input.radius * 0.82),
      arcHorizontalGapPx: Math.max(32, input.radius * 0.84),
      debugLog: undefined,
    }
    const overflowInput: EnzymeCalloutLayoutInput = {
      ...expandedInput, arcAutoFitUpper: false, arcAutoFitLower: false,
      allowViewportOverflow: true, optimizationPass: 'final',
    }
    // Screen a small fixed set cheaply and run the expensive finishing pass on one finalist.
    let bestExpandedInput: EnzymeCalloutLayoutInput | null = null
    let bestExpandedCoarse: EnzymeCalloutLayoutResult | null = null
    for (const [left, right] of [[0, 0], [0, 0.4], [0.4, 0], [0.4, 0.4]] as const) {
      const shapeInput = { ...overflowInput, arcLeftCurvature: left, arcRightCurvature: right }
      const coarse = layoutEllipticWithResultCore({ ...shapeInput, optimizationPass: 'coarse' }, false)
      input.onCenterSearchDebug?.({ event: 'recovery-coarse', left, right, center: coarse.ringCenter,
        quality: coarse.routingQuality, placementFailure: coarse.hasPlacementFailure })
      if (!bestExpandedCoarse || arcOverflowCandidateIsBetter(coarse, bestExpandedCoarse)) {
        bestExpandedCoarse = coarse
        bestExpandedInput = shapeInput
      }
    }
    if (bestExpandedInput) {
      const expanded = layoutEllipticWithResultCore(bestExpandedInput, false)
      const repaired = !expanded.hasPlacementFailure ? repairLeaderLabelConflicts(expanded, expandedInput) : null
      input.onCenterSearchDebug?.({ event: 'recovery-final', selectedShape: {
        left: bestExpandedInput.arcLeftCurvature, right: bestExpandedInput.arcRightCurvature,
      }, center: expanded.ringCenter, quality: expanded.routingQuality,
        placementFailure: expanded.hasPlacementFailure, repaired: Boolean(repaired),
        violations: collectLayoutViolations(expanded.callouts, { ...input,
          centerX: expanded.ringCenter?.x ?? input.centerX, centerY: expanded.ringCenter?.y ?? input.centerY,
        }).filter((violation) => !violation.includes('out of bounds') && !violation.includes('out-of-bounds')) })
      if (repaired?.routingQuality && finalResult.routingQuality) {
        const originalGrowth = contentGrowth(finalResult, input)
        const expandedGrowth = contentGrowth(repaired, input)
        const growthLimit = Math.max(24, input.radius * 0.4)
        const bendGain = repaired.routingQuality.minBendAngle - finalResult.routingQuality.minBendAngle
        const growthAllowed = expandedGrowth.horizontal <= originalGrowth.horizontal + growthLimit &&
          expandedGrowth.vertical <= originalGrowth.vertical + growthLimit
        const qualityImproved = bendGain >= 5 &&
          repaired.routingQuality.belowTargetBendSeverity < finalResult.routingQuality.belowTargetBendSeverity - 2
        const accepted = growthAllowed && qualityImproved
        input.onCenterSearchDebug?.({ event: 'recovery-comparison', originalCenter: finalResult.ringCenter,
          candidateCenter: repaired.ringCenter, originalQuality: finalResult.routingQuality,
          candidateQuality: repaired.routingQuality, originalGrowth, expandedGrowth, growthLimit, bendGain,
          accepted, reason: accepted ? 'accepted' : !growthAllowed ? 'growth-limit' : 'quality-threshold' })
        if (accepted) finalResult = repaired
      }
    }
    // If the ordinary result is still geometrically invalid, a narrower widened envelope may
    // avoid a problematic pole transfer. This fallback runs only for that invalid case.
    const finalCenter = finalResult.ringCenter ?? resolvedCenter(input)
    if (hasNonBoundsLayoutViolations(finalResult.callouts, {
      ...input, centerX: finalCenter.x, centerY: finalCenter.y,
    })) {
      const alternativeInput = { ...expandedInput,
        sideBudget: Math.max(0, originalBudget - input.radius * 1.5),
        arcHorizontalGapPx: Math.max(32, input.radius * 0.4) }
      const alternative = layoutEllipticWithResult(alternativeInput)
      const repaired = !alternative.hasPlacementFailure ? repairLeaderLabelConflicts(alternative, alternativeInput) : null
      if (repaired?.routingQuality && finalResult.routingQuality) {
        const oldGrowth = contentGrowth(finalResult, input)
        const newGrowth = contentGrowth(repaired, input)
        const limit = Math.max(24, input.radius * 0.4)
        if (newGrowth.horizontal <= oldGrowth.horizontal + limit &&
          newGrowth.vertical <= oldGrowth.vertical + limit &&
          repaired.routingQuality.minBendAngle >= finalResult.routingQuality.minBendAngle - 0.25) {
          finalResult = repaired
        }
      }
    }
    const remainingCenter = finalResult.ringCenter ?? resolvedCenter(input)
    const poleCount = (pole: number) => input.sites.filter((site) =>
      circularAngleDistance(circularMapAngle(site.start, input.sequenceLength, input.topology), pole) <= POLE_SIDE_FLEX_RADIANS).length
    if (autoUpper && autoLower && poleCount(-Math.PI / 2) >= 6 && poleCount(Math.PI / 2) >= 6 &&
      hasNonBoundsLayoutViolations(finalResult.callouts, {
        ...input, centerX: remainingCenter.x, centerY: remainingCenter.y,
      })) {
      const opposingInput: EnzymeCalloutLayoutInput = {
        ...input,
        allowOneSidedPoleSharing: true,
        adaptiveSideBudget: false,
        arcUpperVerticalGapPx: input.radius * 1.05,
        arcLowerVerticalGapPx: input.radius * 1.05,
        debugLog: undefined,
      }
      const opposing = layoutEllipticWithResult(opposingInput)
      const repaired = !opposing.hasPlacementFailure ? repairLeaderLabelConflicts(opposing, opposingInput) : null
      if (repaired?.routingQuality && finalResult.routingQuality) {
        const oldGrowth = contentGrowth(finalResult, input)
        const newGrowth = contentGrowth(repaired, input)
        const limit = Math.max(24, input.radius * 0.4)
        if (newGrowth.horizontal <= oldGrowth.horizontal + limit &&
          newGrowth.vertical <= oldGrowth.vertical + limit &&
          repaired.routingQuality.minBendAngle >= finalResult.routingQuality.minBendAngle - 0.25) {
          finalResult = repaired
        }
      }
    }
  }

  // The coarse automatic search may discard a 175° lower tip whose finished packing is
  // substantially better. Re-evaluate that single previously generated finalist against the
  // finished result, preserving the selected curve shape and the caller's routing options.
  if (
    overflowMode &&
    input.arcCompactOverflowLabels !== true &&
    lowerTip175SurvivedPoleCap &&
    input.arcLowerTipAngleDegrees === undefined &&
    input.arcLowerVerticalGapPx === undefined &&
    selectedFinalInput.arcLowerTipAngleDegrees !== 175 &&
    finalResult.routingQuality?.minBendAngle !== undefined &&
    finalResult.routingQuality.minBendAngle < 110 &&
    finalResult.routingQuality.belowTargetBendSeverity > 30
  ) {
    const finalistDebugEntries: Array<Record<string, unknown>> = []
    const candidateInput: EnzymeCalloutLayoutInput = {
      ...selectedFinalInput,
      arcLowerTipAngleDegrees: 175,
      // Hold candidate diagnostics until the candidate wins, so a rejected route does not
      // append misleading entries after the selected result's debug trace.
      debugLog: input.debugLog ? (entry) => finalistDebugEntries.push(entry) : undefined,
    }
    // Keep this to one finished route. Center search is already part of the selected baseline;
    // rerunning it here would turn this bounded finalist into another search branch.
    const candidate = layoutEllipticWithResultCore(candidateInput, false)
    const baselineCenter = finalResult.ringCenter ?? resolvedCenter(input)
    const candidateCenter = candidate.ringCenter ?? resolvedCenter(candidateInput)
    const baselineHasViolations = hasNonBoundsLayoutViolations(finalResult.callouts, {
      ...input, centerX: baselineCenter.x, centerY: baselineCenter.y,
    })
    const candidateHasViolations = hasNonBoundsLayoutViolations(candidate.callouts, {
      ...candidateInput, centerX: candidateCenter.x, centerY: candidateCenter.y,
    })
    const measuredGrowth = (result: EnzymeCalloutLayoutResult, layoutInput: EnzymeCalloutLayoutInput) => {
      const fallback = contentGrowth(result, layoutInput)
      return {
        horizontal: result.routingQuality?.canvasGrowthHorizontalPx ?? fallback.horizontal,
        vertical: result.routingQuality?.canvasGrowthVerticalPx ?? fallback.vertical,
      }
    }
    const baselineGrowth = measuredGrowth(finalResult, input)
    const candidateGrowth = measuredGrowth(candidate, candidateInput)
    const completeBaseline = finalResult.callouts.length === input.sites.length
    const completeCandidate = candidate.callouts.length === input.sites.length
    const validBaseline = !finalResult.hasPlacementFailure && !baselineHasViolations
    const validCandidate = !candidate.hasPlacementFailure && !candidateHasViolations
    const toPolicyCandidate = (
      result: EnzymeCalloutLayoutResult,
      growth: { horizontal: number; vertical: number },
      valid: boolean,
      complete: boolean,
    ) => {
      const quality = result.routingQuality
      if (!quality) return null
      return {
        valid,
        complete,
        quality: {
          minBendAngle: quality.minBendAngle,
          meanBendAngle: quality.meanBendAngle,
          belowTargetBendCount: quality.belowTargetBendCount,
          belowTargetBendSeverity: quality.belowTargetBendSeverity,
          canvasGrowthHorizontalPx: quality.canvasGrowthHorizontalPx ?? growth.horizontal,
          canvasGrowthVerticalPx: quality.canvasGrowthVerticalPx ?? growth.vertical,
          maxLeaderLength: quality.maxLeaderLength,
          meanLeaderLength: quality.meanLeaderLength,
        },
      }
    }
    const policyCandidate = toPolicyCandidate(candidate, candidateGrowth, validCandidate, completeCandidate)
    const policyBaseline = toPolicyCandidate(finalResult, baselineGrowth, validBaseline, completeBaseline)
    const accepted = Boolean(
      policyCandidate && policyBaseline &&
      completeCandidate && validCandidate &&
      compareCircularRoutingCandidates(policyCandidate, policyBaseline, {
        baselineGrowth,
        maxAdditionalGrowth: { horizontal: 32, vertical: 32 },
        angleTarget: ROUTING_BEND_TARGET_DEGREES,
      }) < 0,
    )
    input.onCenterSearchDebug?.({
      event: 'lower-tip-finalist-comparison',
      selectedTip: selectedFinalInput.arcLowerTipAngleDegrees,
      candidateTip: 175,
      baselineQuality: finalResult.routingQuality,
      candidateQuality: candidate.routingQuality,
      baselineGrowth,
      candidateGrowth,
      baselineValid: validBaseline,
      candidateValid: validCandidate,
      completeBaseline,
      completeCandidate,
      accepted,
    })
    if (accepted) {
      finalResult = candidate
      for (const entry of finalistDebugEntries) input.debugLog?.(entry)
    }
  }

  input.onCenterSearchDebug?.({ event: 'final-result', center: finalResult.ringCenter,
    quality: finalResult.routingQuality, placementFailure: finalResult.hasPlacementFailure, callouts: finalResult.callouts.length })
  return { ...finalResult, overflowMode }
}

/** Non-strict: emits every label (vertical overflow allowed → caller may scroll). */
export function layoutCircularEllipticCallouts(input: EnzymeCalloutLayoutInput): EnzymeCallout[] {
  return layoutEllipticWithResult(input).callouts
}

/**
 * Strict: same placement, but reports `hasPlacementFailure` when the ring is too wide
 * horizontally or a leader crosses the disk, so the radius search can react. Labels are
 * never dropped here — vertical crowding is absorbed by the oval, not by dropping.
 */
export function layoutCircularEllipticCalloutsStrict(input: EnzymeCalloutLayoutInput): EnzymeCalloutLayoutResult {
  return layoutEllipticWithResult(input)
}
