export type LinearFeatureLabelRect = {
  left: number
  right: number
  top: number
  bottom: number
}

export type LinearFeatureLabelInput = {
  segmentId: string
  featureId: string
  name: string
  priority: number
  spanBp: number
  /** Only row-0 features may use enzyme-style external labels. Defaults to true. */
  allowExternal?: boolean
  /** Feature body in map pixels. */
  body: LinearFeatureLabelRect
  /** Width used for in-body fit (may exclude arrow tip). Defaults to body width. */
  usableBodyWidth?: number
  /** When set with arrowLengthPx, inline placement also enforces blunt-edge clearance. */
  strand?: 'forward' | 'reverse'
  arrowLengthPx?: number
  labelWidth: number
  textHeight: number
}

export type LinearFeatureLabelPlacement =
  | { segmentId: string; kind: 'inline' }
  | {
      segmentId: string
      kind: 'belowHalf'
      /** Text anchor (center). */
      x: number
      y: number
      width: number
      height: number
    }
  | {
      segmentId: string
      kind: 'belowFull'
      /** Vertical leader X (touches label top edge). */
      leaderX: number
      leaderTopY: number
      labelCenterX: number
      labelTop: number
      width: number
      height: number
    }
  | { segmentId: string; kind: 'external' }

const COLLISION_GAP = 2

function rectsOverlap(a: LinearFeatureLabelRect, b: LinearFeatureLabelRect, gap = COLLISION_GAP) {
  return !(
    a.right + gap <= b.left ||
    b.right + gap <= a.left ||
    a.bottom + gap <= b.top ||
    b.bottom + gap <= a.top
  )
}

function labelRect(centerX: number, top: number, width: number, height: number): LinearFeatureLabelRect {
  const half = width / 2
  return {
    left: centerX - half,
    right: centerX + half,
    top,
    bottom: top + height,
  }
}

/** Estimate inline feature name width (matches circular `featureLabelFitsAtRadius` char model). */
export function estimateLinearInlineFeatureLabelWidthPx(name: string, fontSizePx: number) {
  return estimateLinearInlineFeatureTextWidthPx(name, fontSizePx) + 12
}

/** Approximate only the rendered glyph width; callers add their own visual padding. */
export function estimateLinearInlineFeatureTextWidthPx(name: string, fontSizePx: number) {
  return Math.max(1, name.length * fontSizePx * 0.56)
}

/** Body width available for an in-body label; directional arrows reserve the full tip. */
export function linearFeatureUsableLabelWidthPx(
  bodyWidthPx: number,
  hasArrow: boolean,
  arrowLengthPx: number,
) {
  if (!hasArrow || arrowLengthPx <= 0) return bodyWidthPx
  const arrowPx = Math.min(arrowLengthPx, Math.max(0, bodyWidthPx / 2))
  return Math.max(0, bodyWidthPx - arrowPx)
}

export function linearFeatureLabelFitsInBody(bodyWidthPx: number, labelWidthPx: number) {
  return bodyWidthPx >= labelWidthPx && bodyWidthPx > 28
}

/** Horizontal center for an in-body label, accounting for arrow tip reserve. */
export function linearFeatureInlineLabelCenterX(
  bodyLeft: number,
  bodyWidthPx: number,
  hasArrow: boolean,
  arrowLengthPx: number,
  strand: 'forward' | 'reverse',
) {
  const arrowPx = hasArrow ? Math.min(arrowLengthPx, Math.max(0, bodyWidthPx / 2)) : 0
  const usable = linearFeatureUsableLabelWidthPx(bodyWidthPx, hasArrow, arrowPx)
  if (!hasArrow || arrowPx <= 0) return bodyLeft + bodyWidthPx / 2
  if (strand === 'reverse') return bodyLeft + bodyWidthPx - usable / 2
  return bodyLeft + usable / 2
}

/**
 * True when an inline label centered in the usable (non-tip) strip stays inside the
 * flat body — especially clear of the blunt edge. Otherwise the caller must demote.
 */
export function linearFeatureInlineLabelFitsDirectionalBody(
  bodyLeft: number,
  bodyWidthPx: number,
  labelWidthPx: number,
  hasArrow: boolean,
  arrowLengthPx: number,
  strand: 'forward' | 'reverse',
  edgePadPx = 1,
) {
  const arrowPx = hasArrow ? Math.min(arrowLengthPx, Math.max(0, bodyWidthPx / 2)) : 0
  const usable = linearFeatureUsableLabelWidthPx(bodyWidthPx, hasArrow, arrowPx)
  if (!linearFeatureLabelFitsInBody(usable, labelWidthPx + edgePadPx * 2)) return false

  const center = linearFeatureInlineLabelCenterX(bodyLeft, bodyWidthPx, hasArrow, arrowPx, strand)
  const half = labelWidthPx / 2
  const bodyRight = bodyLeft + bodyWidthPx
  const flatLeft = hasArrow && strand === 'reverse' ? bodyLeft + arrowPx : bodyLeft
  const flatRight = hasArrow && strand === 'forward' ? bodyRight - arrowPx : bodyRight
  return center - half >= flatLeft - 1e-6 && center + half <= flatRight + 1e-6
}

/**
 * Place feature names that do not fit in-body:
 * 1. half row below, no leader
 * 2. full row below with a vertical leader (label may shift horizontally but must keep
 *    the leader touching its top edge)
 * 3. external (caller routes like enzyme/primer callouts)
 */
export function layoutLinearFeatureLabels(
  inputs: LinearFeatureLabelInput[],
  options: {
    rowHeight: number
    allowExternal: boolean
    /** Segment ids that must stay external (e.g. after track reflow). */
    forcedExternalIds?: ReadonlySet<string>
    /** Extra rectangles that block placement (feature bodies, etc.). */
    obstacles?: LinearFeatureLabelRect[]
    mapLeft?: number
    mapRight?: number
  },
): {
  placements: LinearFeatureLabelPlacement[]
  occupied: LinearFeatureLabelRect[]
  contentBottom: number
} {
  const rowHeight = Math.max(1, options.rowHeight)
  const halfRow = rowHeight / 2
  const mapLeft = options.mapLeft ?? -Infinity
  const mapRight = options.mapRight ?? Infinity
  const forcedExternal = options.forcedExternalIds ?? new Set<string>()

  const occupied: LinearFeatureLabelRect[] = [
    ...(options.obstacles ?? []).map((rect) => ({ ...rect })),
    ...inputs.map((item) => ({ ...item.body })),
  ]
  const placements: LinearFeatureLabelPlacement[] = []
  let contentBottom = [...occupied, ...inputs.map((item) => item.body)].reduce(
    (max, rect) => Math.max(max, rect.bottom),
    0,
  )

  const ranked = [...inputs].toSorted(
    (a, b) => a.priority - b.priority || b.spanBp - a.spanBp || a.name.localeCompare(b.name),
  )

  for (const item of ranked) {
    const bodyWidth = item.body.right - item.body.left
    const usableWidth = item.usableBodyWidth ?? bodyWidth
    const midX = (item.body.left + item.body.right) / 2

    if (forcedExternal.has(item.segmentId)) {
      placements.push({ segmentId: item.segmentId, kind: 'external' })
      continue
    }

    const fitsInline =
      item.strand != null && item.arrowLengthPx != null
        ? linearFeatureInlineLabelFitsDirectionalBody(
            item.body.left,
            bodyWidth,
            item.labelWidth,
            item.arrowLengthPx > 0,
            item.arrowLengthPx,
            item.strand,
          )
        : linearFeatureLabelFitsInBody(usableWidth, item.labelWidth)

    if (fitsInline) {
      placements.push({ segmentId: item.segmentId, kind: 'inline' })
      continue
    }

    // 1. Half row below, centered, no leader.
    const halfTop = item.body.bottom + COLLISION_GAP
    const halfCenterY = halfTop + item.textHeight / 2
    const halfBox = labelRect(midX, halfTop, item.labelWidth, item.textHeight)
    if (
      halfCenterY <= item.body.bottom + halfRow + 1e-6 &&
      halfBox.left >= mapLeft - 1e-6 &&
      halfBox.right <= mapRight + 1e-6 &&
      !occupied.some((rect) => rectsOverlap(halfBox, rect))
    ) {
      occupied.push(halfBox)
      contentBottom = Math.max(contentBottom, halfBox.bottom)
      placements.push({
        segmentId: item.segmentId,
        kind: 'belowHalf',
        x: midX,
        y: halfCenterY,
        width: item.labelWidth,
        height: item.textHeight,
      })
      continue
    }

    // 2. Full row below with vertical leader; slide label horizontally while keeping leader under it.
    const fullTop = item.body.bottom + rowHeight - item.textHeight / 2
    const leaderTopY = item.body.bottom
    const leaderX = midX
    const maxShift = Math.max(item.labelWidth, bodyWidth, 48)
    const step = Math.max(6, item.labelWidth * 0.25)
    let placedFull: LinearFeatureLabelPlacement | null = null

    const tryCenter = (centerX: number) => {
      const box = labelRect(centerX, fullTop, item.labelWidth, item.textHeight)
      if (box.left < mapLeft - 1e-6 || box.right > mapRight + 1e-6) return false
      // Leader must touch the label's top edge (X within the label span).
      if (leaderX < box.left - 1e-6 || leaderX > box.right + 1e-6) return false
      if (occupied.some((rect) => rectsOverlap(box, rect))) return false
      occupied.push(box)
      contentBottom = Math.max(contentBottom, box.bottom)
      placedFull = {
        segmentId: item.segmentId,
        kind: 'belowFull',
        leaderX,
        leaderTopY,
        labelCenterX: centerX,
        labelTop: fullTop,
        width: item.labelWidth,
        height: item.textHeight,
      }
      return true
    }

    if (tryCenter(midX)) {
      placements.push(placedFull!)
      continue
    }

    let found = false
    for (let k = 1; k * step <= maxShift + 1e-6; k += 1) {
      if (tryCenter(midX + k * step) || tryCenter(midX - k * step)) {
        found = true
        break
      }
    }
    if (found && placedFull) {
      placements.push(placedFull)
      continue
    }

    // 3. External callout (enzyme/primer style).
    if (options.allowExternal && item.allowExternal !== false) {
      placements.push({ segmentId: item.segmentId, kind: 'external' })
      continue
    }

    // No room and external disabled — leave unlabeled.
  }

  return { placements, occupied, contentBottom }
}
