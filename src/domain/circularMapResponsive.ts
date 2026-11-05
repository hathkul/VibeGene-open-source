import { circularRadiusBounds } from './enzymeLabelBudget'

export type CircularMapRouterAlgorithm = 'classic' | 'lane' | 'elliptic'

export const CIRCULAR_FEATURE_TRACK_START_PX = 36
export const CIRCULAR_FEATURE_HALF_WIDTH_PX = 7.75

const ELLIPTIC_DEFAULT_RING_GAP_PX = 56
const ELLIPTIC_MIN_SIDE_BUDGET_PX = 64

export type CircularMapResponsivePolicyInput = {
  viewportWidth: number
  viewportHeight: number
  mapSize: number
  algorithm: CircularMapRouterAlgorithm
  maxLabelWidth: number
  ringGap?: number
  configuredSideBudget?: number
  minMapRadiusRatio: number
  /** Preferred minimum ring diameter as a fraction of the viewport short side. */
  softRingFloorDiameterRatio: number
  /** User ceiling applied to the automatically derived maximum radius. Default 1. */
  autoRingScaleRatio?: number
  softRingFloorEnabled: boolean
}

export type CircularMapResponsivePolicy = {
  shortSide: number
  hardMinRadius: number
  searchMinRadius: number
  maxRadius: number
  /** Readable radius the search should not drop below. Non-null whenever the floor is armed. */
  softFloorRadius: number | null
  softTargetRadius: number
  desiredSoftFloor: number
  sideBudgetRelieved: boolean
  /**
   * Label band handed to the elliptic router (undefined outside elliptic mode).
   *
   * This is always the real measured/configured band, never the relieved one: in the router a
   * SMALLER budget raises `maxA`, which grows the oval and pushes side labels off-screen. Relief
   * only raises the radius ceiling (see `maxRadius`).
   */
  sideBudgetOverride: number | undefined
  /** Row cap safe to use before the exact radius has been selected. */
  featureLevelLimit: number
}

export type CircularContentViewport = {
  left: number
  top: number
  width: number
  height: number
  pixelWidth: number
  pixelHeight: number
}

/** Reserve the stable vertical scrollbar gutter's thickness for a possible horizontal bar.
 * This prevents the route itself from changing the height used to select that route.
 */
export function stableCircularScrollportHeight(input: {
  clientHeight: number
  offsetHeight: number
  clientWidth: number
  offsetWidth: number
  horizontalBorders: number
  verticalBorders: number
}): number {
  const verticalGutter = Math.max(0, input.offsetWidth - input.clientWidth - input.horizontalBorders)
  const horizontalBar = Math.max(0, input.offsetHeight - input.clientHeight - input.verticalBorders)
  return Math.max(0, input.clientHeight - Math.max(0, verticalGutter - horizontalBar))
}

/**
 * Build a one-CSS-pixel-per-viewBox-unit viewport containing both the nominal canvas and every
 * routed callout. If compact content is shifted past an edge, move the viewBox only far enough to
 * reveal it; if content is larger, grow the SVG so the scroll host gets real overflow.
 */
export function fitCircularContentViewport(input: {
  contentLeft: number
  contentTop: number
  contentWidth: number
  contentHeight: number
  layoutWidth: number
  layoutHeight: number
}): CircularContentViewport {
  const width = Math.max(1, input.layoutWidth, input.contentWidth)
  const height = Math.max(1, input.layoutHeight, input.contentHeight)

  const fitAxis = (contentStart: number, contentSize: number, viewSize: number) => {
    const minimumStart = contentStart + contentSize - viewSize
    const maximumStart = contentStart
    return Math.min(maximumStart, Math.max(minimumStart, 0))
  }

  return {
    left: fitAxis(input.contentLeft, input.contentWidth, width),
    top: fitAxis(input.contentTop, input.contentHeight, height),
    width,
    height,
    pixelWidth: Math.ceil(width),
    pixelHeight: Math.ceil(height),
  }
}

/** Feature rows allowed by the actual pane size. */
export function circularFeatureLevelLimitForViewport(shortSide: number) {
  // Dialog panes (restriction cloning, PCR, …) are often ~400–550px. A hard 0
  // here used to clamp every overlapping feature onto the outer ring.
  if (shortSide < 320) return 1
  if (shortSide < 560) return 2
  if (shortSide < 780) return 3
  if (shortSide < 980) return 4
  if (shortSide < 1180) return 6
  return Number.POSITIVE_INFINITY
}

/** Feature rows allowed by the ring's clear inner area. */
export function circularFeatureLevelLimitForRadius(radius: number) {
  if (radius < 120) return 1
  if (radius < 180) return 2
  if (radius < 240) return 3
  if (radius < 320) return 4
  if (radius < 400) return 6
  return Number.POSITIVE_INFINITY
}

export function circularFeatureLevelLimit(shortSide: number, radius: number) {
  return Math.min(
    circularFeatureLevelLimitForViewport(shortSide),
    circularFeatureLevelLimitForRadius(radius),
  )
}

/**
 * Resolve all viewport-dependent radius inputs once.
 *
 * The side-label budget plays two opposite roles, so it is resolved twice:
 *
 *  - For the radius BOUND, a smaller budget permits a larger ring. When the normal budget would
 *    hold the ring below the readable soft floor, it is relieved just enough to reach the floor,
 *    and `maxRadius` is capped at that floor so the largest-first search cannot inflate the ring
 *    toward a ~90% viewport diameter.
 *  - For the ROUTER, a smaller budget raises `maxA` and grows the oval, pushing side labels
 *    off-screen. So `sideBudgetOverride` always reports the real measured/configured band.
 *
 * Feeding the relieved budget to the router used to make the floor unreachable: the oval expanded
 * past the ring and labels overflowed horizontally, so the search rejected every radius near the
 * floor and settled far below it.
 */
export function resolveCircularMapResponsivePolicy(
  input: CircularMapResponsivePolicyInput,
): CircularMapResponsivePolicy {
  const normalSideBudget =
    input.algorithm === 'elliptic'
      ? input.configuredSideBudget ??
        Math.max(ELLIPTIC_MIN_SIDE_BUDGET_PX, Math.round(input.maxLabelWidth))
      : input.configuredSideBudget
  const normalBounds = circularRadiusBounds(input.viewportWidth, input.viewportHeight, {
    algorithm: input.algorithm,
    maxLabelWidth: input.maxLabelWidth,
    ringGap: input.ringGap,
    sideBudget: normalSideBudget,
  })
  const softTargetRadius = Math.max(
    normalBounds.hardMinRadius,
    Math.round((input.mapSize * input.minMapRadiusRatio) / 2),
  )
  const softFloorDiameterRatio = Math.max(
    input.minMapRadiusRatio,
    Math.min(0.9, input.softRingFloorDiameterRatio),
  )
  const desiredSoftFloor = Math.max(
    softTargetRadius,
    Math.round((normalBounds.shortSide * softFloorDiameterRatio) / 2),
  )
  const sideBudgetRelieved =
    input.softRingFloorEnabled &&
    input.algorithm === 'elliptic' &&
    normalBounds.maxRadius < desiredSoftFloor

  // Relieved budget exists only to lift the radius ceiling; it is never handed to the router.
  let relievedRadiusSideBudget = normalSideBudget
  if (sideBudgetRelieved) {
    const ringGap = Math.max(
      0,
      Math.round(input.ringGap ?? ELLIPTIC_DEFAULT_RING_GAP_PX),
    )
    const sideBudgetAtFloor = Math.floor(
      input.viewportWidth / 2 - ringGap - desiredSoftFloor,
    )
    relievedRadiusSideBudget = Math.max(
      0,
      Math.min(normalSideBudget ?? ELLIPTIC_MIN_SIDE_BUDGET_PX, sideBudgetAtFloor),
    )
  }

  const effectiveBounds = sideBudgetRelieved
    ? circularRadiusBounds(input.viewportWidth, input.viewportHeight, {
        algorithm: input.algorithm,
        maxLabelWidth: input.maxLabelWidth,
        ringGap: input.ringGap,
        sideBudget: relievedRadiusSideBudget,
      })
    : normalBounds
  const unscaledMaxRadius = sideBudgetRelieved
    ? Math.min(effectiveBounds.maxRadius, desiredSoftFloor)
    : effectiveBounds.maxRadius
  const autoRingScaleRatio = Math.max(0.4, Math.min(1, input.autoRingScaleRatio ?? 1))
  const maxRadius = Math.max(
    effectiveBounds.hardMinRadius,
    Math.floor(unscaledMaxRadius * autoRingScaleRatio),
  )
  // Arm the floor whenever it is enabled, not only when relief happened. Previously a viewport
  // whose normal budget already cleared the floor got no floor at all, so the search was free to
  // collapse the ring toward hardMinRadius with nothing to pull it back.
  const softFloorRadius =
    input.softRingFloorEnabled && input.algorithm === 'elliptic'
      ? Math.min(maxRadius, desiredSoftFloor)
      : null
  // Soft floor grows the ring for readability only. Feature-track unlock must stay tied to the
  // pre-relief max — otherwise soft-floor relief can jump featureLevelLimit (e.g. 0→1) and stall
  // first paint on dense constructs while the boot splash is still up.
  const featureLevelRadius = Math.min(
    maxRadius,
    sideBudgetRelieved ? normalBounds.maxRadius : maxRadius,
  )

  return {
    shortSide: effectiveBounds.shortSide,
    hardMinRadius: effectiveBounds.hardMinRadius,
    searchMinRadius: Math.min(maxRadius, effectiveBounds.searchMinRadius),
    maxRadius,
    softFloorRadius,
    softTargetRadius,
    desiredSoftFloor,
    sideBudgetRelieved,
    sideBudgetOverride: normalSideBudget,
    featureLevelLimit: circularFeatureLevelLimit(effectiveBounds.shortSide, featureLevelRadius),
  }
}

/**
 * Decide whether the plasmid name fits inside the ring's clear central disk.
 *
 * This is deliberately a pure geometry test: it depends only on the ring size and the feature
 * rows actually drawn (`innerContentRadius` is the distance from the ring center to the innermost
 * drawn feature body / inward label). It must NOT depend on viewport height — shrinking the window
 * vertically without changing the ring or its feature rows must not move the title out of center.
 */
export function circularMapTitleFitsInsideRing(input: {
  /** Distance from the ring center to the innermost drawn content (feature body or inward label). */
  innerContentRadius: number
  titleWidth: number
  padding?: number
  minClearRadius?: number
}) {
  const padding = input.padding ?? 16
  const minClearRadius = input.minClearRadius ?? 36
  const clearRadius = input.innerContentRadius - padding
  return clearRadius >= minClearRadius && input.titleWidth <= clearRadius * 2
}
