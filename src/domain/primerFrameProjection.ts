import {
  PRIMER_DISPLAY_ROWS,
  PRIMER_FRAME_EDGE_PAD_RATIO,
  PRIMER_ROW_HALF_SHIFT,
  type FrameBounds,
  type PrimerArrowFlapPoints,
  type PrimerClearanceSpan,
  type PrimerFrameBoundsOptions,
  type PrimerFrameDisplay,
  type PrimerFrameMetrics,
  type PrimerGlyph,
  type PrimerLabelMetrics,
  type PrimerTrackLayout,
} from './primerLayoutTypes'
import type { Strand } from './types'

export function primerDisplayRowSpan(display: PrimerFrameDisplay): number {
  let maxRow = 0
  for (const glyph of display.glyphs) {
    if (glyph.row > maxRow) maxRow = glyph.row
  }
  return Math.max(1, maxRow + 1)
}

export function primerFrameMetrics(baseFontPx: number, baseLineHeight: number): PrimerFrameMetrics {
  const rowHeight = baseFontPx * baseLineHeight
  return {
    rowHeight,
    halfShift: rowHeight * PRIMER_ROW_HALF_SHIFT,
    frameHeight: rowHeight * PRIMER_DISPLAY_ROWS + 4,
    labelGap: PRIMER_LABEL_BODY_GAP,
    displayRows: PRIMER_DISPLAY_ROWS,
  }
}

/** Compact metrics sized to the primer's raised glyphs (mismatches / inserts / hairpins). */
export function primerFrameMetricsForDisplay(
  display: PrimerFrameDisplay,
  baseFontPx: number,
  baseLineHeight: number,
): PrimerFrameMetrics {
  const rowHeight = baseFontPx * baseLineHeight
  const maxGlyphRow = display.glyphs.reduce((maxRow, glyph) => Math.max(maxRow, glyph.row), 0)
  // Half-shifted glyphs and the normal row-1 insert fit within the shared
  // arrow/label envelope. Only a larger row-1.5 protrusion needs another
  // reserved body row.
  const displayRows = Math.max(1, Math.ceil(maxGlyphRow))
  return {
    rowHeight,
    halfShift: rowHeight * PRIMER_ROW_HALF_SHIFT,
    frameHeight: rowHeight * displayRows + 4,
    labelGap: PRIMER_LABEL_BODY_GAP,
    displayRows,
  }
}

/**
 * Vertical extent of the terminal arrow flap beyond the annealed-band edge.
 * Forward flaps rise into the reserved label band; reverse flaps hang below it.
 */
export function primerArrowFlapHeightPx(metrics: PrimerFrameMetrics): number {
  return metrics.rowHeight
}

/**
 * Extra stack pad below a reverse primer when its arrow is drawn in this row.
 * Compact (single-row) frames need the full flap + label gap; taller frames that
 * already enclose the flap return 0.
 */
export function primerReverseArrowStackPad(metrics: PrimerFrameMetrics): number {
  return Math.max(0, primerLaneStackHeight(metrics, { reverseArrow: true }) - primerLaneStackHeight(metrics))
}

/** Vertical pitch for one stacked primer lane, including label pad and a small gap. */
export function primerLaneStackHeight(
  metrics: PrimerFrameMetrics,
  options?: { reverseArrow?: boolean; reverseLabelBelow?: boolean },
): number {
  const base = metrics.rowHeight + metrics.frameHeight + 2
  if (!options?.reverseArrow && !options?.reverseLabelBelow) return base
  // Reverse labels live below the frame, so the frame starts at the top of the
  // lane. Forward frames reserve the top sequence-row band for their label.
  const frameTop = options?.reverseLabelBelow ? 0 : metrics.rowHeight
  const annealedBottom = frameTop + 2 + metrics.rowHeight
  const flapTip = options?.reverseArrow
    ? annealedBottom + primerArrowFlapHeightPx(metrics)
    : annealedBottom
  if (!options?.reverseLabelBelow) return Math.max(base, flapTip + metrics.labelGap)
  // Put the name immediately below the deepest body row. The terminal arrow may
  // extend alongside it, so reserve whichever reaches farther rather than stacking
  // the name below the arrow as well. With the reverse frame starting at zero,
  // both the label and the arrow fit inside the normal lane pitch.
  return Math.max(base, flapTip + 2)
}

export function templateX(templateIndex: number, rowStart: number, trackInsetPx: number, baseStepPx: number) {
  return trackInsetPx + (templateIndex - rowStart + 0.5) * baseStepPx
}

function isFlankingAnchorGlyph(glyph: PrimerGlyph): boolean {
  return glyph.templateIndex !== undefined && glyph.kind !== 'template-gap'
}

function flankingTemplateAnchorGlyph(
  display: PrimerFrameDisplay,
  fromIndex: number,
  direction: 'previous' | 'next',
): PrimerGlyph | undefined {
  if (direction === 'previous') {
    return display.glyphs.slice(0, fromIndex).toReversed().find(isFlankingAnchorGlyph)
  }
  return display.glyphs.slice(fromIndex).find(isFlankingAnchorGlyph)
}

export function glyphCenterX(
  templateIndex: number,
  rowStart: number,
  trackInsetPx: number,
  baseStepPx: number,
  layout?: PrimerTrackLayout,
) {
  return layout
    ? layout.templateCenterX(templateIndex)
    : templateX(templateIndex, rowStart, trackInsetPx, baseStepPx)
}

function flankingTemplateAnchorX(
  display: PrimerFrameDisplay,
  fromIndex: number,
  direction: 'previous' | 'next',
  rowStart: number,
  trackInsetPx: number,
  baseStepPx: number,
  layout?: PrimerTrackLayout,
): number | undefined {
  const anchor = flankingTemplateAnchorGlyph(display, fromIndex, direction)
  return anchor?.templateIndex !== undefined
    ? glyphCenterX(anchor.templateIndex, rowStart, trackInsetPx, baseStepPx, layout)
    : undefined
}

export function glyphY(
  glyph: PrimerGlyph,
  metrics: PrimerFrameMetrics,
  strand: Strand,
  frameTop: number,
) {
  const innerTop = frameTop + 2
  const displayRows = metrics.displayRows
  if (strand === 'forward') {
    return innerTop + (displayRows - glyph.row - 0.5) * metrics.rowHeight
  }
  return innerTop + (glyph.row + 0.5) * metrics.rowHeight
}

/**
 * Sign of oligo 5′→3′ progress along increasing template X.
 * Forward / annealer reverse (top-strand projection): +1.
 * SnapGene reverse oligos (template indices decrease along the oligo): -1.
 */
function annealedWalkSign(display: PrimerFrameDisplay): 1 | -1 {
  const annealed = display.glyphs.filter(
    (glyph) => glyph.templateIndex !== undefined && glyph.kind !== 'template-gap',
  )
  if (annealed.length < 2) return display.strand === 'forward' ? 1 : -1
  const first = annealed[0]!.templateIndex!
  const second = annealed[1]!.templateIndex!
  if (second === first) return display.strand === 'forward' ? 1 : -1
  return second > first ? 1 : -1
}

export function primerGlyphX(
  display: PrimerFrameDisplay,
  glyph: PrimerGlyph,
  glyphIndex: number,
  rowStart: number,
  trackInsetPx: number,
  baseStepPx: number,
  bounds: FrameBounds,
  layout?: PrimerTrackLayout,
) {
  if (glyph.templateIndex !== undefined) {
    return glyphCenterX(glyph.templateIndex, rowStart, trackInsetPx, baseStepPx, layout)
  }

  let runStart = glyphIndex
  while (runStart > 0 && display.glyphs[runStart - 1]?.kind === glyph.kind) runStart -= 1
  let runEnd = glyphIndex
  while (runEnd < display.glyphs.length - 1 && display.glyphs[runEnd + 1]?.kind === glyph.kind) runEnd += 1

  const runLength = runEnd - runStart + 1
  const runOffset = glyphIndex - runStart
  const previousX = flankingTemplateAnchorX(display, runStart, 'previous', rowStart, trackInsetPx, baseStepPx, layout)
  const nextX = flankingTemplateAnchorX(display, runEnd + 1, 'next', rowStart, trackInsetPx, baseStepPx, layout)
  if (previousX !== undefined && nextX !== undefined) {
    const available = Math.abs(nextX - previousX)
    const direction = nextX >= previousX ? 1 : -1
    if (glyph.row > PRIMER_ROW_HALF_SHIFT) {
      const runCenter = (previousX + nextX) / 2
      return runCenter + direction * baseStepPx * (runOffset - (runLength - 1) / 2)
    }
    if (available > baseStepPx * (runLength + 1)) {
      return previousX + direction * (available * (runOffset + 1)) / (runLength + 1)
    }
    return previousX + direction * baseStepPx * (runOffset + 1)
  }

  if (nextX !== undefined) {
    // 5′ overhang before anneal: extend opposite the oligo walk so the run meets nextX.
    const walkSign = annealedWalkSign(display)
    return nextX - walkSign * baseStepPx * (runLength - runOffset)
  }

  if (previousX !== undefined) {
    // 3′ overhang after anneal: continue the oligo walk away from the body.
    const walkSign = annealedWalkSign(display)
    return previousX + walkSign * baseStepPx * (runOffset + 1)
  }

  return bounds.left + baseStepPx * (runOffset + 0.5)
}

export function primerClearanceSpansForRow(
  displays: PrimerFrameDisplay[],
  rowStart: number,
  rowEnd: number,
  trackInsetPx: number,
  baseStepPx: number,
): PrimerClearanceSpan[] {
  return displays
    .filter((display) => display.strand === 'forward')
    .map((display) => primerVisualSpanForRow(display, rowStart, rowEnd, trackInsetPx, baseStepPx))
    .filter((span): span is { left: number; right: number } => Boolean(span))
}

/** Normal gap between primer name and annealed body top. */
const PRIMER_LABEL_BODY_GAP = 4

type LabelObstacle = {
  left: number
  right: number
  top: number
  bottom: number
}

export function primerLabelMetrics(name: string, fontSizePx = 11): PrimerLabelMetrics {
  const width = Math.max(56, name.length * fontSizePx * 0.66)
  const height = Math.max(15, fontSizePx + 4)
  return {
    fontSizePx,
    width,
    height,
    halfWidth: width / 2,
    halfHeight: Math.max(8, fontSizePx * 0.75),
  }
}

/** Extra lane height needed when a placed primer label is pushed outside its body lane. */
export function primerLabelStackOverflow(
  bounds: FrameBounds,
  label: PrimerLabelMetrics,
  strand: Strand,
  stackHeight: number,
) {
  if (strand === 'forward') {
    return Math.max(0, label.halfHeight - bounds.labelY)
  }
  return Math.max(0, bounds.labelY + label.halfHeight - stackHeight)
}

function rectsOverlap(a: LabelObstacle, b: LabelObstacle, pad = 0.5) {
  return a.left < b.right - pad && a.right > b.left + pad && a.top < b.bottom - pad && a.bottom > b.top + pad
}

function labelRectAt(labelX: number, labelY: number, label: PrimerLabelMetrics): LabelObstacle {
  return {
    left: labelX - label.halfWidth,
    right: labelX + label.halfWidth,
    top: labelY - label.halfHeight,
    bottom: labelY + label.halfHeight,
  }
}

function clampLabelX(labelX: number, minCenter: number, maxCenter: number) {
  if (maxCenter < minCenter) return (minCenter + maxCenter) / 2
  return Math.max(minCenter, Math.min(maxCenter, labelX))
}

/**
 * Place the primer name near the annealed body. Prefer the body-adjacent Y; if raised
 * mismatches / overhangs / the forward arrow block that slot, nudge sideways; only raise
 * the label when no horizontal gap fits.
 */
function placePrimerNameLabel(args: {
  preferredX: number
  preferredY: number
  label: PrimerLabelMetrics
  obstacles: LabelObstacle[]
  minCenterX: number
  maxCenterX: number
  labelGap: number
  direction?: 'above' | 'below'
}): { labelX: number; labelY: number } {
  const { preferredX, preferredY, label, obstacles, minCenterX, maxCenterX, labelGap, direction = 'above' } = args
  const centerX = clampLabelX(preferredX, minCenterX, maxCenterX)

  const blockedAt = (labelX: number, labelY: number) => {
    const rect = labelRectAt(labelX, labelY, label)
    return obstacles.filter((obstacle) => rectsOverlap(rect, obstacle))
  }

  if (!blockedAt(centerX, preferredY).length) {
    return { labelX: centerX, labelY: preferredY }
  }

  const candidates = new Set<number>([centerX])
  for (const obstacle of obstacles) {
    candidates.add(obstacle.left - label.halfWidth - 1)
    candidates.add(obstacle.right + label.halfWidth + 1)
  }
  const sorted = [...candidates]
    .map((x) => clampLabelX(x, minCenterX, maxCenterX))
    .filter((x, index, all) => all.indexOf(x) === index)
    .sort((a, b) => Math.abs(a - preferredX) - Math.abs(b - preferredX) || a - b)

  for (const candidateX of sorted) {
    if (!blockedAt(candidateX, preferredY).length) {
      return { labelX: candidateX, labelY: preferredY }
    }
  }

  const verticalHits = blockedAt(centerX, preferredY)
  return {
    labelX: centerX,
    labelY: direction === 'below'
      ? Math.max(...verticalHits.map((obstacle) => obstacle.bottom), preferredY) + labelGap + label.halfHeight
      : Math.min(...verticalHits.map((obstacle) => obstacle.top), preferredY) - labelGap - label.halfHeight,
  }
}

function templateIndexInRow(templateIndex: number | undefined, rowStart: number, rowEnd: number) {
  return templateIndex !== undefined && templateIndex >= rowStart && templateIndex < rowEnd
}

function nearestTemplateIndexBefore(display: PrimerFrameDisplay, glyphIndex: number) {
  return display.glyphs
    .slice(0, glyphIndex)
    .toReversed()
    .find((entry) => entry.templateIndex !== undefined)?.templateIndex
}

function nearestTemplateIndexAfter(display: PrimerFrameDisplay, glyphIndex: number) {
  return display.glyphs.slice(glyphIndex + 1).find((entry) => entry.templateIndex !== undefined)?.templateIndex
}

export function primerGlyphVisibleInRow(
  display: PrimerFrameDisplay,
  glyph: PrimerGlyph,
  glyphIndex: number,
  rowStart: number,
  rowEnd: number,
) {
  if (glyph.templateIndex !== undefined) return templateIndexInRow(glyph.templateIndex, rowStart, rowEnd)
  return (
    templateIndexInRow(nearestTemplateIndexBefore(display, glyphIndex), rowStart, rowEnd) ||
    templateIndexInRow(nearestTemplateIndexAfter(display, glyphIndex), rowStart, rowEnd)
  )
}

/**
 * Painted X span of a primer on one sequence row, including 5′/3′ overhang letters.
 * Internal insert overhangs sit between annealed anchors and do not inflate the sides.
 */
export function primerVisualSpanForRow(
  display: PrimerFrameDisplay,
  rowStart: number,
  rowEnd: number,
  trackInsetPx: number,
  baseStepPx: number,
  layout?: PrimerTrackLayout,
): { left: number; right: number } | null {
  if (display.templateSpanEnd <= rowStart || display.templateSpanStart >= rowEnd) return null
  const rowLength = rowEnd - rowStart
  const trackWidthPx = layout?.trackWidthPx ?? trackInsetPx + rowLength * baseStepPx
  const templatedXs = display.glyphs.flatMap((glyph) => {
    if (glyph.templateIndex !== undefined && templateIndexInRow(glyph.templateIndex, rowStart, rowEnd)) {
      return [glyphCenterX(glyph.templateIndex, rowStart, trackInsetPx, baseStepPx, layout)]
    }
    return []
  })
  if (!templatedXs.length) return null

  const draft: FrameBounds = {
    left: Math.max(0, Math.min(...templatedXs) - baseStepPx * 0.55),
    right: Math.min(trackWidthPx, Math.max(...templatedXs) + baseStepPx * 0.55),
    top: 0,
    bottom: 0,
    labelX: 0,
    labelY: 0,
  }
  const xs = [...templatedXs]
  display.glyphs.forEach((glyph, index) => {
    if (glyph.templateIndex !== undefined) return
    if (glyph.kind === 'template-gap') return
    if (!primerGlyphVisibleInRow(display, glyph, index, rowStart, rowEnd)) return
    xs.push(primerGlyphX(display, glyph, index, rowStart, trackInsetPx, baseStepPx, draft, layout))
  })

  return {
    left: Math.max(0, Math.min(...xs) - baseStepPx * 0.55),
    right: Math.min(trackWidthPx, Math.max(...xs) + baseStepPx * 0.55),
  }
}

export function primerFirstAnnealedTemplateIndex(display: PrimerFrameDisplay) {
  return display.glyphs.find((glyph) => glyph.templateIndex !== undefined)?.templateIndex
}

export function primerFrameBounds(
  display: PrimerFrameDisplay,
  rowStart: number,
  rowLength: number,
  trackInsetPx: number,
  baseStepPx: number,
  metrics: PrimerFrameMetrics,
  strand: Strand,
  layoutOrOptions?: PrimerTrackLayout | PrimerFrameBoundsOptions,
): FrameBounds | null {
  const options: PrimerFrameBoundsOptions =
    layoutOrOptions && 'templateCenterX' in layoutOrOptions
      ? { layout: layoutOrOptions }
      : ((layoutOrOptions as PrimerFrameBoundsOptions | undefined) ?? {})
  const layout = options.layout
  const rowEnd = rowStart + rowLength
  const span = primerVisualSpanForRow(display, rowStart, rowEnd, trackInsetPx, baseStepPx, layout)
  if (!span) return null

  const glyphCenterXAt = (templateIndex: number) =>
    glyphCenterX(templateIndex, rowStart, trackInsetPx, baseStepPx, layout)
  const trackWidthPx = layout?.trackWidthPx ?? trackInsetPx + rowLength * baseStepPx

  const frameTop = strand === 'reverse' ? 0 : metrics.rowHeight
  const boundedLeft = span.left
  const boundedRight = span.right
  const bottom = frameTop + metrics.frameHeight
  const firstVisibleAnnealedIndex = display.glyphs.findIndex((glyph) => templateIndexInRow(glyph.templateIndex, rowStart, rowEnd))
  const visibleAnnealedRunXs: number[] = []
  if (firstVisibleAnnealedIndex !== -1) {
    for (let index = firstVisibleAnnealedIndex; index < display.glyphs.length; index += 1) {
      const glyph = display.glyphs[index]
      if (glyph.kind === 'template-gap' || glyph.templateIndex === undefined) break
      if (!templateIndexInRow(glyph.templateIndex, rowStart, rowEnd)) break
      visibleAnnealedRunXs.push(glyphCenterXAt(glyph.templateIndex))
    }
  }

  const label = primerLabelMetrics(display.name, options.labelFontSizePx)
  const annealedLeft = visibleAnnealedRunXs.length
    ? Math.min(...visibleAnnealedRunXs) - baseStepPx * 0.5
    : boundedLeft
  const annealedRight = visibleAnnealedRunXs.length
    ? Math.max(...visibleAnnealedRunXs) + baseStepPx * 0.5
    : boundedRight
  const preferredX = visibleAnnealedRunXs.length
    ? (Math.min(...visibleAnnealedRunXs) + Math.max(...visibleAnnealedRunXs)) / 2
    : (boundedLeft + boundedRight) / 2

  const halfHeight = metrics.rowHeight * 0.5
  const annealedCenterY = glyphY({ char: '', kind: 'annealed', row: 0 }, metrics, strand, frameTop)
  const annealedTop = annealedCenterY - halfHeight
  const annealedBottom = annealedCenterY + halfHeight
  const preferredY = strand === 'reverse'
    ? annealedBottom + metrics.labelGap + label.halfHeight
    : annealedTop - metrics.labelGap - label.halfHeight

  const draftBounds: FrameBounds = {
    left: boundedLeft,
    right: boundedRight,
    top: frameTop,
    bottom,
    labelX: preferredX,
    labelY: preferredY,
  }

  // Raised frame segments pad their vertical borders outward by this amount (see
  // primerFramePaths), so obstacles must include it or a sideways-dodged label can
  // overlap the padded border it was meant to clear.
  const framePad = baseStepPx * PRIMER_FRAME_EDGE_PAD_RATIO

  const obstacles: LabelObstacle[] = []
  display.glyphs.forEach((glyph, glyphIndex) => {
    if (glyph.kind === 'template-gap') return
    if (glyph.row <= 0) return
    if (!primerGlyphVisibleInRow(display, glyph, glyphIndex, rowStart, rowEnd)) return
    const x = primerGlyphX(display, glyph, glyphIndex, rowStart, trackInsetPx, baseStepPx, draftBounds, layout)
    const y = glyphY(glyph, metrics, strand, frameTop)
    const glyphTop = y - halfHeight
    const glyphBottom = y + halfHeight
    // Only glyphs extending toward the preferred label band are obstacles.
    if (strand === 'forward' && glyphTop >= preferredY + label.halfHeight - 0.5) return
    if (strand === 'reverse' && glyphBottom <= preferredY - label.halfHeight + 0.5) return
    obstacles.push({
      left: x - baseStepPx * 0.5 - framePad,
      right: x + baseStepPx * 0.5 + framePad,
      top: glyphTop,
      bottom: glyphBottom,
    })
  })

  if (options.showArrow) {
    const annealedBandTop = annealedTop
    const annealedBandBottom = annealedBottom
    // The integrated arrow flap seats on the padded terminal edge.
    const arrow = strand === 'forward'
      ? primerArrowFlapPoints(
          boundedRight + framePad,
          annealedBandTop,
          -1,
          -1,
          baseStepPx,
          annealedBandBottom - annealedBandTop,
        )
      : primerArrowFlapPoints(
          boundedLeft - framePad,
          annealedBandBottom,
          1,
          1,
          baseStepPx,
          annealedBandBottom - annealedBandTop,
        )
    obstacles.push({
      left: Math.min(arrow.p0x, arrow.p1x, arrow.p2x, arrow.p3x),
      right: Math.max(arrow.p0x, arrow.p1x, arrow.p2x, arrow.p3x),
      top: Math.min(arrow.p0y, arrow.p1y, arrow.p2y, arrow.p3y),
      bottom: Math.max(arrow.p0y, arrow.p1y, arrow.p2y, arrow.p3y),
    })
  }

  const minCenterX = Math.max(label.halfWidth, boundedLeft + label.halfWidth * 0.15)
  const maxCenterX = Math.min(trackWidthPx - label.halfWidth, boundedRight - label.halfWidth * 0.15)
  // Prefer staying over the annealed span when it is wide enough; otherwise use the full frame.
  const annealedMinCenter =
    annealedRight - annealedLeft >= label.width
      ? annealedLeft + label.halfWidth
      : minCenterX
  const annealedMaxCenter =
    annealedRight - annealedLeft >= label.width
      ? annealedRight - label.halfWidth
      : maxCenterX

  const placed = placePrimerNameLabel({
    preferredX,
    preferredY,
    label,
    obstacles,
    minCenterX: Math.max(minCenterX, Math.min(annealedMinCenter, annealedMaxCenter)),
    maxCenterX: Math.min(maxCenterX, Math.max(annealedMinCenter, annealedMaxCenter)),
    labelGap: metrics.labelGap,
    direction: strand === 'reverse' ? 'below' : 'above',
  })

  // If the annealed span could not host a sideways dodge, retry across the full primer frame.
  const movedVertically = strand === 'reverse'
    ? placed.labelY > preferredY + 0.5
    : placed.labelY < preferredY - 0.5
  const blockedInAnnealed =
    obstacles.length > 0 &&
    movedVertically &&
    annealedRight - annealedLeft >= label.width
  const finalPlacement = blockedInAnnealed
    ? placePrimerNameLabel({
        preferredX,
        preferredY,
        label,
        obstacles,
        minCenterX,
        maxCenterX,
        labelGap: metrics.labelGap,
        direction: strand === 'reverse' ? 'below' : 'above',
      })
    : placed

  return {
    left: boundedLeft,
    right: boundedRight,
    top: frameTop,
    bottom,
    labelX: finalPlacement.labelX,
    labelY: finalPlacement.labelY,
  }
}

export function primerArrowFlapPoints(
  cornerX: number,
  cornerY: number,
  horizontalSign: number,
  verticalSign: number,
  step: number,
  boxHeight: number,
): PrimerArrowFlapPoints {
  const p1x = cornerX + horizontalSign * step * 1.5
  const p1y = cornerY + verticalSign * boxHeight
  const p2x = cornerX + horizontalSign * step * 3
  const p2y = p1y
  const p3x = cornerX + horizontalSign * step * 1.5
  const p3y = cornerY
  return { p0x: cornerX, p0y: cornerY, p1x, p1y, p2x, p2y, p3x, p3y }
}
