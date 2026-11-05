import { buildSnakeFrame, type SnakeLetter } from './lettersnakeFramePath'
import {
  PRIMER_FRAME_EDGE_PAD_RATIO,
  PRIMER_ROW_HALF_SHIFT,
  PRIMER_ROW_INSERT_SHIFT,
  type FrameBounds,
  type PrimerClearanceSpan,
  type PrimerFrameDisplay,
  type PrimerFrameMetrics,
  type PrimerFramePathLayers,
  type PrimerFramePathOptions,
  type PrimerFrameSegment,
  type PrimerGlyph,
  type PrimerTrackLayout,
} from './primerLayoutTypes'
import {
  glyphCenterX,
  glyphY,
  primerArrowFlapPoints,
  primerGlyphVisibleInRow,
  primerGlyphX,
} from './primerFrameProjection'
import type { Strand } from './types'

const FRAME_EPS = 0.001

export function primerFramePathsNeedBackgroundFill(layers: PrimerFramePathLayers) {
  // LetterSnake fills are closed union paths that mask enzyme leaders on their own.
  return layers.fills.length === 0
}

function rectanglePath(segment: Pick<PrimerFrameSegment, 'left' | 'right' | 'top' | 'bottom'>) {
  const width = segment.right - segment.left
  const height = segment.bottom - segment.top
  const radius = Math.min(width, height) * 0.14
  if (radius <= 0.01) {
    return [
      `M ${segment.left} ${segment.bottom}`,
      `L ${segment.left} ${segment.top}`,
      `L ${segment.right} ${segment.top}`,
      `L ${segment.right} ${segment.bottom}`,
      'Z',
    ].join(' ')
  }
  const r = Math.min(radius, width / 2 - 0.01, height / 2 - 0.01)
  const { left, right, top, bottom } = segment
  return [
    `M ${left} ${bottom - r}`,
    `Q ${left} ${bottom} ${left + r} ${bottom}`,
    `L ${right - r} ${bottom}`,
    `Q ${right} ${bottom} ${right} ${bottom - r}`,
    `L ${right} ${top + r}`,
    `Q ${right} ${top} ${right - r} ${top}`,
    `L ${left + r} ${top}`,
    `Q ${left} ${top} ${left} ${top + r}`,
    'Z',
  ].join(' ')
}

function primerAnnealedBand(bounds: FrameBounds, metrics: PrimerFrameMetrics, strand: Strand) {
  const annealedCenterY = glyphY({ char: '', kind: 'annealed', row: 0 }, metrics, strand, bounds.top)
  const halfHeight = metrics.rowHeight * 0.5
  return {
    top: annealedCenterY - halfHeight,
    bottom: annealedCenterY + halfHeight,
  }
}

/** Solid fill on the annealed band to mask intersecting enzyme leaders (matches simple primer boxes). */
export function primerFrameBackgroundFillPath(
  bounds: FrameBounds,
  metrics: PrimerFrameMetrics,
  strand: Strand,
  horizontalExtent?: PrimerClearanceSpan,
) {
  const band = primerAnnealedBand(bounds, metrics, strand)
  const left = horizontalExtent ? Math.min(bounds.left, horizontalExtent.left) : bounds.left
  const right = horizontalExtent ? Math.max(bounds.right, horizontalExtent.right) : bounds.right
  return rectanglePath({ left, right, top: band.top, bottom: band.bottom })
}

function runsAdjacent(left: PrimerFrameSegment, right: PrimerFrameSegment, baseStepPx: number) {
  return right.left - left.right <= baseStepPx * 0.55
}

function runJoinX(left: PrimerFrameSegment, right: PrimerFrameSegment) {
  if (right.left < left.right) {
    if (left.row < right.row) return left.right
    if (left.row > right.row) return right.left
  }
  return (left.right + right.left) / 2
}

type RunBoundary = {
  prev: PrimerFrameSegment | null
  next: PrimerFrameSegment | null
  joinLeft: number | null
  joinRight: number | null
}

function runBoundaries(runs: PrimerFrameSegment[], baseStepPx: number): RunBoundary[] {
  return runs.map((run, index) => {
    const prev = index > 0 ? runs[index - 1]! : null
    const next = index < runs.length - 1 ? runs[index + 1]! : null
    const prevAdjacent = prev !== null && runsAdjacent(prev, run, baseStepPx)
    const nextAdjacent = next !== null && runsAdjacent(run, next, baseStepPx)
    return {
      prev: prevAdjacent ? prev : null,
      next: nextAdjacent ? next : null,
      joinLeft: prevAdjacent ? runJoinX(prev!, run) : null,
      joinRight: nextAdjacent ? runJoinX(run, next!) : null,
    }
  })
}

/** Horizontal bridge only (for background masking); vertical steps live in frame outlines. */
function junctionConnectorPath(left: PrimerFrameSegment, right: PrimerFrameSegment, joinX: number) {
  if (left.row === right.row) return null
  if (left.row < right.row) return null

  const westX = left.right
  if (westX < joinX - 0.001) {
    return `M ${westX} ${left.top} L ${joinX} ${left.top}`
  }

  return null
}

function lowerRunJoinStem(joinX: number, lowerRun: PrimerFrameSegment, upperRun: PrimerFrameSegment) {
  const stemTop = Math.max(lowerRun.top, upperRun.bottom)
  if (stemTop >= lowerRun.bottom) return null
  return `M ${joinX} ${stemTop} L ${joinX} ${lowerRun.bottom}`
}

function integratedFrameArrowPath(
  segment: PrimerFrameSegment,
  strand: Strand,
  baseStepPx: number,
  topStopX?: number,
  upperNeighbor?: PrimerFrameSegment,
): string | string[] {
  const { left, right, top, bottom } = segment
  const boxHeight = bottom - top

  if (strand === 'forward') {
    const { p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y } = primerArrowFlapPoints(right, top, -1, -1, baseStepPx, boxHeight)
    const topWestX = topStopX !== undefined ? Math.max(left, Math.min(topStopX, p3x)) : left
    const hairpinJoin = topStopX !== undefined
    const segments = [`M ${p3x} ${p3y}`]
    if (topWestX < p3x) {
      segments.push(`L ${topWestX} ${top}`)
    }
    if (!hairpinJoin) {
      if (topWestX <= left) {
        segments.push(`L ${left} ${top}`, `L ${left} ${bottom}`)
      } else {
        segments.push(`L ${right} ${top}`)
      }
      segments.push(`L ${right} ${bottom}`)
    } else {
      segments.push(`M ${right} ${bottom}`)
    }
    segments.push(
      `L ${p0x} ${p0y}`,
      `L ${p1x} ${p1y}`,
      `L ${p2x} ${p2y}`,
      `L ${p3x} ${p3y}`,
    )
    const flapBody = segments.join(' ')

    if (hairpinJoin) {
      const paths = [
        `M ${left} ${bottom} L ${right} ${bottom}`,
        flapBody,
        `M ${right} ${top} L ${right} ${bottom}`,
      ]
      if (upperNeighbor && upperNeighbor.row > segment.row && upperNeighbor.row <= PRIMER_ROW_HALF_SHIFT) {
        const joinStem = lowerRunJoinStem(topWestX, segment, upperNeighbor)
        if (joinStem) paths.push(joinStem)
      }
      return paths
    }

    return `${flapBody} Z`
  }

  const { p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y } = primerArrowFlapPoints(left, bottom, 1, 1, baseStepPx, boxHeight)
  const bottomEastX = topStopX !== undefined ? Math.min(right, Math.max(topStopX, p3x)) : right
  const hairpinJoin = topStopX !== undefined
  const segments = [`M ${p3x} ${p3y}`]
  if (bottomEastX > p3x) {
    segments.push(`L ${bottomEastX} ${bottom}`)
  }
  segments.push(`L ${right} ${bottom}`, `L ${right} ${top}`)
  segments.push(`L ${left} ${top}`, `L ${p0x} ${p0y}`, `L ${p1x} ${p1y}`, `L ${p2x} ${p2y}`, `L ${p3x} ${p3y}`)
  const flapBody = segments.join(' ')

  if (hairpinJoin) {
    const paths = [
      `M ${left} ${bottom} L ${right} ${bottom}`,
      flapBody,
      `M ${right} ${bottom} L ${right} ${top}`,
    ]
    if (upperNeighbor && upperNeighbor.row > segment.row && upperNeighbor.row <= PRIMER_ROW_HALF_SHIFT) {
      const joinStem = lowerRunJoinStem(bottomEastX, segment, upperNeighbor)
      if (joinStem) paths.push(joinStem)
    }
    return paths
  }

  return `${flapBody} Z`
}

function integratedFrameArrowFillPaths(segment: PrimerFrameSegment, strand: Strand, baseStepPx: number) {
  const { left, right, top, bottom } = segment
  const boxHeight = bottom - top
  const flap =
    strand === 'forward'
      ? primerArrowFlapPoints(right, top, -1, -1, baseStepPx, boxHeight)
      : primerArrowFlapPoints(left, bottom, 1, 1, baseStepPx, boxHeight)

  return [
    `M ${flap.p0x} ${flap.p0y}`,
    `L ${flap.p1x} ${flap.p1y}`,
    `L ${flap.p2x} ${flap.p2y}`,
    `L ${flap.p3x} ${flap.p3y}`,
    'Z',
  ].join(' ')
}

function arrowIntegrateRunIndex(runs: PrimerFrameSegment[], strand: Strand) {
  const rowZeroRuns = runs.map((run, index) => ({ run, index })).filter(({ run }) => run.row === 0)
  if (!rowZeroRuns.length) return null
  if (strand === 'forward') {
    return rowZeroRuns.reduce((best, current) => (current.run.right > best.run.right ? current : best)).index
  }
  return rowZeroRuns.reduce((best, current) => (current.run.left < best.run.left ? current : best)).index
}

type IndexedPrimerFrameRun = PrimerFrameSegment & {
  glyphStart: number
  glyphEnd: number
}

function buildIndexedPrimerFrameRuns(
  display: PrimerFrameDisplay,
  rowStart: number,
  rowLength: number,
  trackInsetPx: number,
  baseStepPx: number,
  metrics: PrimerFrameMetrics,
  bounds: FrameBounds,
  layout?: PrimerTrackLayout,
) {
  const runs: IndexedPrimerFrameRun[] = []
  const rowEnd = rowStart + rowLength

  display.glyphs.forEach((glyph, glyphIndex) => {
    if (!primerGlyphVisibleInRow(display, glyph, glyphIndex, rowStart, rowEnd)) return
    const segment = segmentForGlyph(display, glyph, glyphIndex, rowStart, trackInsetPx, baseStepPx, metrics, bounds, layout)
    const previous = runs[runs.length - 1]
    if (
      previous &&
      previous.kind === segment.kind &&
      previous.row === segment.row &&
      Math.abs(segment.left - previous.right) <= baseStepPx * 0.45
    ) {
      previous.right = Math.max(previous.right, segment.right)
      previous.top = Math.min(previous.top, segment.top)
      previous.bottom = Math.max(previous.bottom, segment.bottom)
      previous.glyphEnd = glyphIndex
      return
    }
    runs.push({ ...segment, glyphStart: glyphIndex, glyphEnd: glyphIndex })
  })

  return runs
}

function buildPrimerFrameRuns(
  display: PrimerFrameDisplay,
  rowStart: number,
  rowLength: number,
  trackInsetPx: number,
  baseStepPx: number,
  metrics: PrimerFrameMetrics,
  bounds: FrameBounds,
) {
  return buildIndexedPrimerFrameRuns(display, rowStart, rowLength, trackInsetPx, baseStepPx, metrics, bounds)
}

function buildPrimerLetterCenters(
  display: PrimerFrameDisplay,
  rowStart: number,
  rowLength: number,
  trackInsetPx: number,
  baseStepPx: number,
  metrics: PrimerFrameMetrics,
  bounds: FrameBounds,
  layout?: PrimerTrackLayout,
  excludeGlyphIndices?: Set<number>,
) {
  const rowEnd = rowStart + rowLength
  const centers: SnakeLetter[] = []

  display.glyphs.forEach((glyph, glyphIndex) => {
    if (!primerGlyphVisibleInRow(display, glyph, glyphIndex, rowStart, rowEnd)) return
    if (excludeGlyphIndices?.has(glyphIndex)) return
    const x =
      glyph.templateIndex !== undefined
        ? glyphCenterX(glyph.templateIndex, rowStart, trackInsetPx, baseStepPx, layout)
        : primerGlyphX(display, glyph, glyphIndex, rowStart, trackInsetPx, baseStepPx, bounds, layout)
    const y = glyphY(glyph, metrics, display.strand, bounds.top)
    const portal =
      glyph.kind === 'overhang' && glyph.row + FRAME_EPS >= PRIMER_ROW_INSERT_SHIFT
    centers.push({ x, y, portal })
  })

  return centers
}

export function primerFramePaths(
  display: PrimerFrameDisplay,
  rowStart: number,
  rowLength: number,
  trackInsetPx: number,
  baseStepPx: number,
  metrics: PrimerFrameMetrics,
  bounds: FrameBounds,
  options?: PrimerFramePathOptions,
): PrimerFramePathLayers {
  const layout = options?.layout
  const indexedRuns = buildIndexedPrimerFrameRuns(
    display,
    rowStart,
    rowLength,
    trackInsetPx,
    baseStepPx,
    metrics,
    bounds,
    layout,
  )
  const runs = indexedRuns
  const integrateFrame = options?.integrateHairpin && options.baseStepPx > 0

  if (!integrateFrame) {
    const fills = runs.map((run) => rectanglePath(run))
    return { fills, outlines: fills }
  }

  const arrowIntegrateIndex =
    options?.integrateArrow && options.baseStepPx > 0
      ? arrowIntegrateRunIndex(runs, options.strand)
      : null
  const halfW = baseStepPx * 0.5
  const halfH = metrics.rowHeight * 0.5
  const edgePad = baseStepPx * PRIMER_FRAME_EDGE_PAD_RATIO
  const centers = buildPrimerLetterCenters(
    display,
    rowStart,
    rowLength,
    trackInsetPx,
    baseStepPx,
    metrics,
    bounds,
    layout,
  )
  // Resolve the arrow flap first so its base can open a matching mouth in the body
  // outline (removing the border that would otherwise separate flap from frame).
  const arrowRun =
    arrowIntegrateIndex !== null
      ? options!.strand === 'forward'
        ? { ...runs[arrowIntegrateIndex]!, right: runs[arrowIntegrateIndex]!.right + edgePad }
        : { ...runs[arrowIntegrateIndex]!, left: runs[arrowIntegrateIndex]!.left - edgePad }
      : null

  const arrowMouth =
    arrowRun !== null
      ? options!.strand === 'forward'
        ? { side: 'top' as const, y: arrowRun.top, x0: arrowRun.right - baseStepPx * 1.5, x1: arrowRun.right }
        : { side: 'bottom' as const, y: arrowRun.bottom, x0: arrowRun.left, x1: arrowRun.left + baseStepPx * 1.5 }
      : undefined

  const snake = buildSnakeFrame(centers, halfW, halfH, edgePad, baseStepPx, { arrowMouth })
  const notchCenters =
    arrowIntegrateIndex !== null
      ? buildPrimerLetterCenters(
          display,
          rowStart,
          rowLength,
          trackInsetPx,
          baseStepPx,
          metrics,
          bounds,
          layout,
        )
      : centers
  const portalNotchMarks = buildSnakeFrame(notchCenters, halfW, halfH, edgePad, baseStepPx, {
    includePortalNotches: true,
  }).marks
  const fills = [...snake.fills]
  const outlines = [...snake.outlines, ...portalNotchMarks]

  if (arrowRun !== null) {
    const flapFill = integratedFrameArrowFillPaths(arrowRun, options!.strand, options!.baseStepPx)
    const flapOutline =
      options!.strand === 'forward'
        ? primerArrowFlapPath(arrowRun.right, arrowRun.top, -1, -1, options!.baseStepPx, arrowRun.bottom - arrowRun.top)
        : primerArrowFlapPath(arrowRun.left, arrowRun.bottom, 1, 1, options!.baseStepPx, arrowRun.bottom - arrowRun.top)
    fills.push(flapFill)
    outlines.push(flapOutline)
  }

  return { fills, outlines }
}

function segmentForGlyph(
  display: PrimerFrameDisplay,
  glyph: PrimerGlyph,
  glyphIndex: number,
  rowStart: number,
  trackInsetPx: number,
  baseStepPx: number,
  metrics: PrimerFrameMetrics,
  bounds: FrameBounds,
  layout?: PrimerTrackLayout,
): PrimerFrameSegment {
  const x = primerGlyphX(display, glyph, glyphIndex, rowStart, trackInsetPx, baseStepPx, bounds, layout)
  const y = glyphY(glyph, metrics, display.strand, bounds.top)
  const halfWidth = baseStepPx * 0.5
  const halfHeight = metrics.rowHeight * 0.5
  return {
    kind: glyph.kind,
    row: glyph.row,
    left: x - halfWidth,
    right: x + halfWidth,
    top: y - halfHeight,
    bottom: y + halfHeight,
  }
}

export function primerHasIntegratedHairpinFrame(display: PrimerFrameDisplay) {
  return display.glyphs.length > 0
}

export function primerJunctionConnectorPaths(
  display: PrimerFrameDisplay,
  rowStart: number,
  rowLength: number,
  trackInsetPx: number,
  baseStepPx: number,
  metrics: PrimerFrameMetrics,
  bounds: FrameBounds,
): string[] {
  const runs = buildPrimerFrameRuns(display, rowStart, rowLength, trackInsetPx, baseStepPx, metrics, bounds)
  const boundaries = runBoundaries(runs, baseStepPx)
  const paths: string[] = []

  for (let index = 0; index < runs.length - 1; index += 1) {
    const joinX = boundaries[index]?.joinRight
    if (joinX === null || joinX === undefined) continue
    const connector = junctionConnectorPath(runs[index]!, runs[index + 1]!, joinX)
    if (connector) paths.push(connector)
  }

  return paths
}

function primerArrowFlapPath(
  cornerX: number,
  cornerY: number,
  horizontalSign: number,
  verticalSign: number,
  step: number,
  boxHeight: number,
) {
  const { p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y } = primerArrowFlapPoints(
    cornerX,
    cornerY,
    horizontalSign,
    verticalSign,
    step,
    boxHeight,
  )
  return [`M ${p0x} ${p0y}`, `L ${p1x} ${p1y}`, `L ${p2x} ${p2y}`, `L ${p3x} ${p3y}`].join(' ')
}

export function previewIntegratedPrimerFramePath(
  bounds: FrameBounds,
  metrics: PrimerFrameMetrics,
  strand: Strand,
  baseStepPx: number,
): string {
  const annealedCenterY = glyphY({ char: '', kind: 'annealed', row: 0 }, metrics, strand, bounds.top)
  const halfHeight = metrics.rowHeight * 0.5
  const path = integratedFrameArrowPath(
    {
      kind: 'annealed',
      row: 0,
      left: bounds.left,
      right: bounds.right,
      top: annealedCenterY - halfHeight,
      bottom: annealedCenterY + halfHeight,
    },
    strand,
    baseStepPx,
  )
  return Array.isArray(path) ? path.join(' ') : path
}

export function primerArrowFramePath(bounds: FrameBounds, strand: Strand, metrics: PrimerFrameMetrics, baseStepPx: number) {
  const { left, right, top } = bounds
  const annealedCenterY = glyphY({ char: '', kind: 'annealed', row: 0 }, metrics, strand, top)
  const halfHeight = metrics.rowHeight * 0.5
  const boxHeight = halfHeight * 2
  const topY = annealedCenterY - halfHeight
  const bottomY = annealedCenterY + halfHeight

  if (strand === 'forward') {
    return primerArrowFlapPath(right, topY, -1, -1, baseStepPx, boxHeight)
  }

  return primerArrowFlapPath(left, bottomY, 1, 1, baseStepPx, boxHeight)
}

export function hairpinLoopPath(
  display: PrimerFrameDisplay,
  bounds: FrameBounds,
  rowStart: number,
  trackInsetPx: number,
  baseStepPx: number,
  metrics: PrimerFrameMetrics,
  rowLength = Number.POSITIVE_INFINITY,
) {
  const connectors = primerJunctionConnectorPaths(
    display,
    rowStart,
    rowLength,
    trackInsetPx,
    baseStepPx,
    metrics,
    bounds,
  )
  if (!connectors.length) return null
  return connectors.join(' ')
}
