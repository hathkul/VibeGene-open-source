import { buildAlignmentDisplayColumns } from './traceDisplay'
import { alignmentStatsLabel } from './traceAlignment'
import type { TraceFileRecord, TraceTemplateAlignment } from './traceTypes'

export const LINEAR_ALIGNMENT_BAR_HEIGHT = 8
export const LINEAR_ALIGNMENT_ROW_PITCH = 16
export const LINEAR_ALIGNMENT_BAND_PADDING = 8
export const LINEAR_ALIGNMENT_MATCH_FILL = '#7c4a2d'
export const LINEAR_ALIGNMENT_SELECTED_FILL = '#1e3a8a'
export const LINEAR_ALIGNMENT_MISMATCH_MIN_WIDTH = 2

export type LinearAlignmentFillSegment = {
  start: number
  end: number
  isExact: boolean
}

export type LinearAlignmentRenderInfo = {
  traceId: string
  level: number
  templateStart: number
  templateEnd: number
  orientation: TraceTemplateAlignment['orientation']
  segments: LinearAlignmentFillSegment[]
  fileName: string
  statsLabel: string
  baseCount: number
  fileLastModified?: number
  alignmentPurpose?: TraceFileRecord['alignmentPurpose']
}

function columnForTemplateIndex(alignment: TraceTemplateAlignment, templateIndex: number) {
  for (const column of alignment.columns) {
    if (column.kind === 'match' && column.templateIndex === templateIndex) return column
    if (column.kind === 'templateGap' && column.templateIndex === templateIndex) return column
  }
  return null
}

export function isTemplateIndexExact(alignment: TraceTemplateAlignment, templateIndex: number) {
  const column = columnForTemplateIndex(alignment, templateIndex)
  if (!column) return false
  if (column.kind === 'templateGap') return false
  return column.match
}

export function buildLinearAlignmentFillSegments(alignment: TraceTemplateAlignment): LinearAlignmentFillSegment[] {
  if (alignment.templateStart >= alignment.templateEnd) return []

  const segments: LinearAlignmentFillSegment[] = []
  let currentExact: boolean | null = null
  let segmentStart = alignment.templateStart

  for (let templateIndex = alignment.templateStart; templateIndex < alignment.templateEnd; templateIndex += 1) {
    const exact = isTemplateIndexExact(alignment, templateIndex)
    if (currentExact === null) {
      currentExact = exact
      segmentStart = templateIndex
      continue
    }
    if (exact !== currentExact) {
      segments.push({ start: segmentStart, end: templateIndex, isExact: currentExact })
      currentExact = exact
      segmentStart = templateIndex
    }
  }

  if (currentExact !== null) {
    segments.push({ start: segmentStart, end: alignment.templateEnd, isExact: currentExact })
  }

  return segments
}

export function linearAlignmentArrowPath(
  orientation: 'forward' | 'reverse',
  y: number,
  barHeight: number,
  barStartX: number,
  barEndX: number,
) {
  const wing = barHeight / 4
  const topY = y - wing
  const bottomY = y + barHeight + wing
  const midY = y + barHeight / 2
  const arrowLength = barHeight * 1.5
  if (orientation === 'forward') {
    const tipX = barEndX + arrowLength
    const baseX = barEndX
    return `M ${tipX} ${midY} L ${baseX} ${topY} L ${baseX} ${bottomY} Z`
  }
  const tipX = barStartX - arrowLength
  const baseX = barStartX
  return `M ${tipX} ${midY} L ${baseX} ${topY} L ${baseX} ${bottomY} Z`
}

export function linearAlignmentSegmentWidthPx(
  startX: number,
  endX: number,
  isExact: boolean,
) {
  const width = endX - startX
  if (isExact) return Math.max(0, width)
  return Math.max(LINEAR_ALIGNMENT_MISMATCH_MIN_WIDTH, width)
}

/** Mismatch/indel mark, widened around its centre so single-base events stay visible at any zoom. */
export function linearAlignmentMismatchMarkX(startX: number, endX: number) {
  const width = linearAlignmentSegmentWidthPx(startX, endX, false)
  const centre = (startX + endX) / 2
  return { x: centre - width / 2, width }
}

export function assignLinearAlignmentLevels(traceFiles: TraceFileRecord[]): LinearAlignmentRenderInfo[] {
  const candidates = traceFiles.filter((trace) => trace.enabled && trace.alignment && !trace.parseError)
  const sorted = candidates.toSorted(
    (a, b) =>
      a.alignment!.templateStart - b.alignment!.templateStart ||
      a.alignment!.templateEnd - b.alignment!.templateEnd ||
      a.fileName.localeCompare(b.fileName),
  )

  const levelOccupancy: Array<Array<{ start: number; end: number }>> = []

  return sorted.map((trace) => {
    const alignment = trace.alignment!
    const start = alignment.templateStart
    const end = alignment.templateEnd
    const level = levelOccupancy.findIndex((ranges) => !ranges.some((range) => start < range.end && range.start < end))
    const resolvedLevel = level === -1 ? levelOccupancy.length : level
    if (resolvedLevel === levelOccupancy.length) levelOccupancy.push([])
    levelOccupancy[resolvedLevel].push({ start, end })

    return {
      traceId: trace.id,
      level: resolvedLevel,
      templateStart: start,
      templateEnd: end,
      orientation: alignment.orientation,
      segments: buildLinearAlignmentFillSegments(alignment),
      fileName: trace.fileName,
      statsLabel: alignmentStatsLabel(alignment),
      baseCount: trace.sequence.length,
      fileLastModified: trace.fileLastModified,
      alignmentPurpose: trace.alignmentPurpose,
    }
  })
}

export function linearAlignmentBandHeight(maxLevel: number, visible: boolean) {
  if (!visible || maxLevel < 0) return 0
  return LINEAR_ALIGNMENT_BAND_PADDING + (maxLevel + 1) * LINEAR_ALIGNMENT_ROW_PITCH
}

export function linearAlignmentMaxLevel(traceFiles: TraceFileRecord[], alignmentsVisible: boolean) {
  if (!alignmentsVisible) return -1
  const traces = assignLinearAlignmentLevels(traceFiles)
  if (!traces.length) return -1
  return Math.max(...traces.map((trace) => trace.level))
}

export function linearMapAlignmentYOffset(maxLevel: number, visible: boolean) {
  const bandHeight = linearAlignmentBandHeight(maxLevel, visible)
  return bandHeight > 0 ? bandHeight + 2 : 0
}

export function formatLinearAlignmentHoverLabel(info: LinearAlignmentRenderInfo) {
  const modified = info.fileLastModified
    ? new Date(info.fileLastModified).toLocaleString()
    : 'Date unavailable'
  const lines = [info.fileName]
  if (info.alignmentPurpose !== 'comparative') lines.push(modified)
  lines.push(
    info.statsLabel,
    `${info.baseCount.toLocaleString()} bases in ${info.alignmentPurpose === 'comparative' ? 'comparison sequence' : 'trace file'}`,
  )
  return lines.join('\n')
}

/** Sanity check helper for tests — display columns should cover the template span. */
export function alignmentDisplayColumnCount(alignment: TraceTemplateAlignment) {
  return buildAlignmentDisplayColumns(alignment).length
}
