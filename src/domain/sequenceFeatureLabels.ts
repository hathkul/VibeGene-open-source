export type FeatureSegmentForLabel = {
  featureId: string
  start: number
  end: number
  lane: number
}

export type FeatureLabelSpanPx = {
  left: number
  width: number
  lane: number
}

export type FloatingFeatureLabelPlacement = {
  featureId: string
  lane: number
  leftPx: number
  maxWidthPx: number
  label: string
  /** When true, the name sits below a body that is too narrow to hold it. */
  below: boolean
  /**
   * Vertical stack index for below-body labels (0 = just under the body).
   * Used only after horizontal separation cannot clear a collision.
   */
  belowLevel: number
}

export type FeatureLabelSpanPxResolver = (
  start: number,
  end: number,
) => { left: number; width: number } | null

/** Horizontal gap kept between adjacent below-body labels. */
export const BELOW_FEATURE_LABEL_GAP_PX = 4

/** Vertical step between stacked below-body label rows. */
export const BELOW_FEATURE_LABEL_STACK_STEP_PX = 12

type BelowLabelRouteItem = {
  featureId: string
  lane: number
  leftPx: number
  widthPx: number
  bodyLeftPx: number
  bodyRightPx: number
  label: string
}

export function estimateFeatureLabelWidthPx(label: string): number {
  return label.length * 6.1 + 8
}

export function minFeatureLabelRunWidthPx(label: string): number {
  return estimateFeatureLabelWidthPx(label) + 16
}

export function visibleFeatureBodyRuns(
  segments: FeatureSegmentForLabel[],
  visibleStart: number,
  visibleEnd: number,
  spanPx: FeatureLabelSpanPxResolver,
): FeatureLabelSpanPx[] {
  const runs: FeatureLabelSpanPx[] = []
  for (const segment of segments) {
    const overlapStart = Math.max(segment.start, visibleStart)
    const overlapEnd = Math.min(segment.end, visibleEnd)
    if (overlapEnd <= overlapStart) continue
    const px = spanPx(overlapStart, overlapEnd)
    if (!px || px.width <= 0) continue
    runs.push({ ...px, lane: segment.lane })
  }
  return runs
}

export function pickFeatureLabelRun(runs: FeatureLabelSpanPx[], label: string): FeatureLabelSpanPx | null {
  const minWidth = minFeatureLabelRunWidthPx(label)
  let best: FeatureLabelSpanPx | null = null
  for (const run of runs) {
    if (run.width < minWidth) continue
    if (!best || run.width > best.width) best = run
  }
  return best
}

/** Widest visible run, regardless of whether it can hold the label text. */
export function pickWidestFeatureLabelRun(runs: FeatureLabelSpanPx[]): FeatureLabelSpanPx | null {
  let best: FeatureLabelSpanPx | null = null
  for (const run of runs) {
    if (!best || run.width > best.width) best = run
  }
  return best
}

export function floatingFeatureLabelLeftPx(run: FeatureLabelSpanPx, label: string): number {
  const labelWidth = estimateFeatureLabelWidthPx(label)
  return run.left + Math.max(4, (run.width - labelWidth) / 2)
}

/** Left edge for a below-body label: left-aligned to the body with a small inset. */
export function belowFeatureLabelLeftPx(run: FeatureLabelSpanPx): number {
  return run.left + 2
}

function rangesOverlapHorizontally(
  leftA: number,
  rightA: number,
  leftB: number,
  rightB: number,
  gapPx: number,
): boolean {
  return leftA < rightB + gapPx && rightA + gapPx > leftB
}

/**
 * Clamp a below-body label so it still overlaps its feature body horizontally.
 * That keeps a vertical connection between the name and the body after sliding.
 */
export function clampBelowLabelLeftPx(
  leftPx: number,
  widthPx: number,
  bodyLeftPx: number,
  bodyRightPx: number,
): number {
  const minOverlapPx = Math.min(4, Math.max(1, bodyRightPx - bodyLeftPx))
  const lo = bodyLeftPx - widthPx + minOverlapPx
  const hi = bodyRightPx - minOverlapPx
  if (hi < lo) {
    return bodyLeftPx + (bodyRightPx - bodyLeftPx) / 2 - widthPx / 2
  }
  return Math.min(hi, Math.max(lo, leftPx))
}

/**
 * Nudge overlapping below-body labels apart horizontally while each label keeps
 * overlapping its feature body. Returns updated left positions (same order as input).
 */
export function separateBelowFeatureLabelsHorizontally(
  items: BelowLabelRouteItem[],
  gapPx = BELOW_FEATURE_LABEL_GAP_PX,
  maxIterations = 32,
): BelowLabelRouteItem[] {
  if (items.length <= 1) return items.map((item) => ({ ...item }))

  const next = items.map((item) => ({
    ...item,
    leftPx: clampBelowLabelLeftPx(item.leftPx, item.widthPx, item.bodyLeftPx, item.bodyRightPx),
  }))

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = false
    const order = next
      .map((item, index) => ({ item, index }))
      .sort(
        (a, b) =>
          a.item.lane - b.item.lane ||
          a.item.leftPx - b.item.leftPx ||
          a.item.bodyLeftPx - b.item.bodyLeftPx ||
          a.item.featureId.localeCompare(b.item.featureId),
      )

    for (let i = 0; i < order.length; i += 1) {
      for (let j = i + 1; j < order.length; j += 1) {
        const leftEntry = order[i]!
        const rightEntry = order[j]!
        const a = next[leftEntry.index]!
        const b = next[rightEntry.index]!
        if (a.lane !== b.lane) continue

        const aRight = a.leftPx + a.widthPx
        const bRight = b.leftPx + b.widthPx
        if (!rangesOverlapHorizontally(a.leftPx, aRight, b.leftPx, bRight, gapPx)) continue

        const needed = aRight + gapPx - b.leftPx
        if (needed <= 0) continue
        const push = needed / 2
        const aTarget = clampBelowLabelLeftPx(
          a.leftPx - push,
          a.widthPx,
          a.bodyLeftPx,
          a.bodyRightPx,
        )
        const bTarget = clampBelowLabelLeftPx(
          b.leftPx + push,
          b.widthPx,
          b.bodyLeftPx,
          b.bodyRightPx,
        )
        if (aTarget !== a.leftPx || bTarget !== b.leftPx) {
          a.leftPx = aTarget
          b.leftPx = bTarget
          changed = true
        }
      }
    }

    if (!changed) break
  }

  return next
}

/**
 * Route below-body labels: first slide them apart horizontally (keeping each
 * overlapping its body), then stack any remaining collisions vertically.
 */
export function routeBelowFeatureLabels(
  items: BelowLabelRouteItem[],
  gapPx = BELOW_FEATURE_LABEL_GAP_PX,
): Array<BelowLabelRouteItem & { belowLevel: number }> {
  const separated = separateBelowFeatureLabelsHorizontally(items, gapPx)
  const sorted = separated
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        a.item.lane - b.item.lane ||
        a.item.leftPx - b.item.leftPx ||
        a.item.bodyLeftPx - b.item.bodyLeftPx ||
        a.item.featureId.localeCompare(b.item.featureId),
    )

  const occupied: { lane: number; left: number; right: number; level: number }[] = []
  const routed: Array<BelowLabelRouteItem & { belowLevel: number }> = separated.map((item) => ({
    ...item,
    belowLevel: 0,
  }))

  for (const entry of sorted) {
    const item = routed[entry.index]!
    const left = item.leftPx
    const right = left + item.widthPx
    let level = 0
    while (
      occupied.some(
        (slot) =>
          slot.lane === item.lane &&
          slot.level === level &&
          rangesOverlapHorizontally(left, right, slot.left, slot.right, gapPx),
      )
    ) {
      level += 1
    }
    occupied.push({ lane: item.lane, left, right, level })
    item.belowLevel = level
  }

  return routed
}

/** @deprecated Prefer routeBelowFeatureLabels with body anchors. */
export function routeBelowFeatureLabelLevels(
  placements: FloatingFeatureLabelPlacement[],
  gapPx = BELOW_FEATURE_LABEL_GAP_PX,
): FloatingFeatureLabelPlacement[] {
  const belowItems: BelowLabelRouteItem[] = placements
    .filter((placement) => placement.below)
    .map((placement) => {
      const widthPx = estimateFeatureLabelWidthPx(placement.label)
      return {
        featureId: placement.featureId,
        lane: placement.lane,
        leftPx: placement.leftPx,
        widthPx,
        // Without an explicit body span, treat preferred left as a point body so
        // horizontal sliding still has a connection anchor.
        bodyLeftPx: placement.leftPx,
        bodyRightPx: placement.leftPx + Math.max(4, Math.min(widthPx, 12)),
        label: placement.label,
      }
    })

  const routed = routeBelowFeatureLabels(belowItems, gapPx)
  const byId = new Map(routed.map((item) => [item.featureId, item]))

  return placements.map((placement) => {
    if (!placement.below) return { ...placement, belowLevel: 0 }
    const item = byId.get(placement.featureId)
    if (!item) return { ...placement, belowLevel: 0, maxWidthPx: estimateFeatureLabelWidthPx(placement.label) }
    return {
      ...placement,
      leftPx: item.leftPx,
      belowLevel: item.belowLevel,
      maxWidthPx: item.widthPx,
    }
  })
}

/**
 * Place feature names on the widest visible body run that fits the label text.
 * When no visible run is wide enough, place the name below the body instead so
 * short features still show a readable label. Nearby below-body names are first
 * slid apart horizontally (while staying under their bodies), then stacked
 * vertically if they still collide.
 */
export function computeFloatingFeatureLabelPlacements(
  segments: FeatureSegmentForLabel[],
  labels: Map<string, string>,
  visibleStart: number,
  visibleEnd: number,
  spanPx: FeatureLabelSpanPxResolver,
  options?: { rowWidthPx?: number },
): FloatingFeatureLabelPlacement[] {
  void options
  const byFeature = new Map<string, FeatureSegmentForLabel[]>()
  segments.forEach((segment) => {
    const list = byFeature.get(segment.featureId) ?? []
    list.push(segment)
    byFeature.set(segment.featureId, list)
  })

  const onBodyPlacements: FloatingFeatureLabelPlacement[] = []
  const belowItems: BelowLabelRouteItem[] = []

  byFeature.forEach((featureSegments, featureId) => {
    const label = labels.get(featureId)
    if (!label) return
    const runs = visibleFeatureBodyRuns(featureSegments, visibleStart, visibleEnd, spanPx)
    const onBody = pickFeatureLabelRun(runs, label)
    if (onBody) {
      onBodyPlacements.push({
        featureId,
        lane: onBody.lane,
        leftPx: floatingFeatureLabelLeftPx(onBody, label),
        maxWidthPx: Math.max(0, onBody.width - 8),
        label,
        below: false,
        belowLevel: 0,
      })
      return
    }

    const belowRun = pickWidestFeatureLabelRun(runs)
    if (!belowRun) return
    const widthPx = estimateFeatureLabelWidthPx(label)
    const preferredLeft = belowFeatureLabelLeftPx(belowRun)
    belowItems.push({
      featureId,
      lane: belowRun.lane,
      leftPx: preferredLeft,
      widthPx,
      bodyLeftPx: belowRun.left,
      bodyRightPx: belowRun.left + belowRun.width,
      label,
    })
  })

  const routedBelow = routeBelowFeatureLabels(belowItems)
  const belowPlacements: FloatingFeatureLabelPlacement[] = routedBelow.map((item) => ({
    featureId: item.featureId,
    lane: item.lane,
    leftPx: item.leftPx,
    maxWidthPx: item.widthPx,
    label: item.label,
    below: true,
    belowLevel: item.belowLevel,
  }))

  return [...onBodyPlacements, ...belowPlacements]
}

export type BelowLabelBodyLayout = {
  featureId: string
  /** Top of this feature's body in feature-lane coordinates (px). */
  bodyTopPx: number
  bodyLeftPx: number
  bodyRightPx: number
}

export type BelowLabelObstacle = {
  /** Top edge of the obstacle in feature-lane coordinates (px). */
  topPx: number
  leftPx: number
  rightPx: number
}

export const BELOW_FEATURE_LABEL_LINE_HEIGHT_PX = 11
export const MIN_COMPRESSED_FEATURE_BODY_HEIGHT_PX = 8

/**
 * When a below-body label would collide with a feature or translation under it,
 * shrink that short feature's body so the label sits higher and clears the obstacle.
 */
export function compressBelowLabelBodyHeights(
  placements: FloatingFeatureLabelPlacement[],
  bodies: BelowLabelBodyLayout[],
  obstacles: BelowLabelObstacle[],
  defaultBodyHeightPx: number,
  options?: {
    minBodyHeightPx?: number
    labelHeightPx?: number
    gapPx?: number
  },
): Map<string, number> {
  const minBodyHeightPx = options?.minBodyHeightPx ?? MIN_COMPRESSED_FEATURE_BODY_HEIGHT_PX
  const labelHeightPx = options?.labelHeightPx ?? BELOW_FEATURE_LABEL_LINE_HEIGHT_PX
  const gapPx = options?.gapPx ?? 2
  const bodyByFeatureId = new Map(bodies.map((body) => [body.featureId, body]))
  const heights = new Map<string, number>()

  for (const placement of placements) {
    if (!placement.below) continue
    const body = bodyByFeatureId.get(placement.featureId)
    if (!body) continue

    const labelLeft = placement.leftPx
    const labelRight = placement.leftPx + placement.maxWidthPx
    let nearestTop: number | null = null

    for (const obstacle of obstacles) {
      if (obstacle.topPx <= body.bodyTopPx) continue
      if (!rangesOverlapHorizontally(labelLeft, labelRight, obstacle.leftPx, obstacle.rightPx, 0)) continue
      nearestTop = nearestTop === null ? obstacle.topPx : Math.min(nearestTop, obstacle.topPx)
    }

    for (const other of bodies) {
      if (other.featureId === placement.featureId) continue
      if (other.bodyTopPx <= body.bodyTopPx) continue
      if (!rangesOverlapHorizontally(labelLeft, labelRight, other.bodyLeftPx, other.bodyRightPx, 0)) continue
      nearestTop = nearestTop === null ? other.bodyTopPx : Math.min(nearestTop, other.bodyTopPx)
    }

    if (nearestTop === null) {
      heights.set(placement.featureId, defaultBodyHeightPx)
      continue
    }

    // labelTop = bodyTop + 1 + bodyHeight + 2 + belowLevel * stackStep
    const overheadPx = 1 + 2 + placement.belowLevel * BELOW_FEATURE_LABEL_STACK_STEP_PX + labelHeightPx
    const maxBodyHeight = nearestTop - gapPx - overheadPx - body.bodyTopPx
    const compressed = Math.min(defaultBodyHeightPx, Math.max(minBodyHeightPx, Math.floor(maxBodyHeight)))
    heights.set(placement.featureId, compressed)
  }

  return heights
}
