import type { ChromatogramData, TraceTemplateAlignment } from './traceTypes'

export type TemplateBaseVariant = 'match' | 'mismatch' | 'deletion' | 'insertion' | 'empty'

export type TemplateBaseCell = {
  char: string
  variant: TemplateBaseVariant
  insertions: string
}

export type AlignmentDisplayColumn =
  | { kind: 'match'; templateIndex: number; traceIndex: number; match: boolean }
  | { kind: 'deletion'; templateIndex: number }
  | { kind: 'insertion'; traceIndex: number }

export type ChromatogramBase = 'A' | 'T' | 'G' | 'C'

export type ChromatogramHoverSample = {
  x: number
  scan: number
  templateIndex: number
  /** Called base at this alignment column (matches the trace sequence row). */
  dominantBase: ChromatogramBase
}

export type ChromatogramPathLayer = {
  base: ChromatogramBase
  stroke: string
  fill: string
}

export const tracePeakColors: Record<ChromatogramBase, string> = {
  A: '#16a34a',
  T: '#dc2626',
  G: '#171717',
  C: '#2563eb',
}

export const tracePeakFillColors: Record<ChromatogramBase, string> = {
  A: 'rgba(22, 163, 74, 0.28)',
  T: 'rgba(220, 38, 38, 0.28)',
  G: 'rgba(23, 23, 23, 0.2)',
  C: 'rgba(37, 99, 235, 0.28)',
}

export type LayoutDisplayColumn = {
  column: AlignmentDisplayColumn
  columnIndex: number
  leftPx: number
}

export const alignmentTrackInsetPx = 28
export const alignmentBaseStepPx = 10

function previousTemplateIndex(columns: AlignmentDisplayColumn[], index: number) {
  for (let columnIndex = index - 1; columnIndex >= 0; columnIndex -= 1) {
    const column = columns[columnIndex]
    if (column.kind !== 'insertion') return column.templateIndex
  }
  return 0
}

export function columnLeftPx(
  columns: AlignmentDisplayColumn[],
  columnIndex: number,
  inset = alignmentTrackInsetPx,
  step = alignmentBaseStepPx,
) {
  const insertionsBefore = columns.slice(0, columnIndex).filter((column) => column.kind === 'insertion').length
  const column = columns[columnIndex]
  if (column.kind === 'insertion') {
    const anchorTemplate = previousTemplateIndex(columns, columnIndex)
    return inset + anchorTemplate * step + step + insertionsBefore * step
  }
  return inset + column.templateIndex * step + insertionsBefore * step
}

export function layoutVisibleColumns(
  allColumns: AlignmentDisplayColumn[],
  templateStart: number,
  templateEnd: number,
  inset = alignmentTrackInsetPx,
  step = alignmentBaseStepPx,
): LayoutDisplayColumn[] {
  const visible = visibleDisplayColumns(allColumns, templateStart, templateEnd)
  const visibleSet = new Set(visible)
  return allColumns
    .map((column, columnIndex) => ({
      column,
      columnIndex,
      leftPx: columnLeftPx(allColumns, columnIndex, inset, step),
    }))
    .filter((entry) => visibleSet.has(entry.column))
}

export function tracePositionForColumn(column: AlignmentDisplayColumn, alignment: TraceTemplateAlignment) {
  if (column.kind === 'deletion') return null
  if (alignment.orientation === 'reverse') {
    // Reverse alignments are laid out in template order, so their raw trace
    // indices decrease from left to right. Number from the rightmost aligned
    // trace base (1) back toward the left instead of producing 1, 0, -1….
    return column.traceIndex - alignment.traceEnd + 2
  }
  return column.traceIndex - alignment.traceStart + 1
}

export function buildAlignmentDisplayColumns(alignment: TraceTemplateAlignment): AlignmentDisplayColumn[] {
  return alignment.columns.map((column) => {
    if (column.kind === 'match') {
      return { kind: 'match', templateIndex: column.templateIndex, traceIndex: column.traceIndex, match: column.match }
    }
    if (column.kind === 'templateGap') {
      return { kind: 'deletion', templateIndex: column.templateIndex }
    }
    return { kind: 'insertion', traceIndex: column.traceIndex }
  })
}

export function visibleDisplayColumns(
  columns: AlignmentDisplayColumn[],
  templateStart: number,
  templateEnd: number,
): AlignmentDisplayColumn[] {
  const visible: AlignmentDisplayColumn[] = []
  let pendingInsertions: AlignmentDisplayColumn[] = []

  columns.forEach((column) => {
    if (column.kind === 'insertion') {
      pendingInsertions.push(column)
      return
    }
    const inRange = column.templateIndex >= templateStart && column.templateIndex < templateEnd
    if (inRange) {
      visible.push(...pendingInsertions, column)
    }
    pendingInsertions = []
  })

  return visible
}

export function templateBaseForColumn(column: AlignmentDisplayColumn, templateSequence: string) {
  if (column.kind === 'insertion') return ''
  return templateSequence[column.templateIndex]?.toUpperCase() ?? ''
}

const traceComplementBase: Record<string, string> = {
  A: 'T',
  C: 'G',
  G: 'C',
  T: 'A',
  N: 'N',
}

export function complementTraceCallBase(base: string) {
  return traceComplementBase[base.toUpperCase()] ?? 'N'
}

export function traceBaseForColumn(
  column: AlignmentDisplayColumn,
  baseCalls: string[],
  orientation: TraceTemplateAlignment['orientation'] = 'forward',
) {
  const raw = column.kind === 'deletion' ? '-' : baseCalls[column.traceIndex]?.toUpperCase() ?? ''
  if (orientation === 'reverse' && raw && raw !== '-') {
    return complementTraceCallBase(raw)
  }
  return raw
}

export function isVariantErrorColumn(column: AlignmentDisplayColumn) {
  if (column.kind === 'insertion' || column.kind === 'deletion') return true
  return !column.match
}

export function templateRangeFromColumnSpan(columns: AlignmentDisplayColumn[], startColumn: number, endColumn: number) {
  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY
  const from = Math.min(startColumn, endColumn)
  const to = Math.max(startColumn, endColumn)
  for (let index = from; index <= to; index += 1) {
    const column = columns[index]
    if (!column || column.kind === 'insertion') continue
    start = Math.min(start, column.templateIndex)
    end = Math.max(end, column.templateIndex + 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return { start, end }
}

export function templateIndicesForVisibleColumns(columns: AlignmentDisplayColumn[]) {
  const indices: number[] = []
  columns.forEach((column) => {
    if (column.kind !== 'insertion') indices.push(column.templateIndex)
  })
  return indices
}

export type MergedLayoutColumn =
  | { kind: 'template'; templateIndex: number }
  | { kind: 'insertion-gap'; anchorTemplateIndex: number; slotIndex: number }

export type MergedInsertionLayout = {
  anchorInsertionCounts: Map<number, number>
  templateLength: number
  // Prefix sum of insertion counts for anchors [0, templateIndex)
  // to make templateIndex->x mapping O(1).
  insertionPrefixByTemplate: Uint32Array | null
}

export type MergedLayoutEntry = {
  slot: MergedLayoutColumn
  slotIndex: number
  leftPx: number
}

function insertionCountsAfterAnchors(alignment: TraceTemplateAlignment) {
  const counts = new Map<number, number>()
  const columns = buildAlignmentDisplayColumns(alignment)
  let anchor = -1
  let runLength = 0
  columns.forEach((column) => {
    if (column.kind === 'insertion') {
      runLength += 1
      return
    }
    if (runLength > 0) {
      counts.set(anchor, Math.max(counts.get(anchor) ?? 0, runLength))
      runLength = 0
    }
    anchor = column.templateIndex
  })
  if (runLength > 0) {
    counts.set(anchor, Math.max(counts.get(anchor) ?? 0, runLength))
  }
  return counts
}

export function buildMergedInsertionLayout(
  alignments: TraceTemplateAlignment[],
  templateLength: number,
): MergedInsertionLayout {
  const anchorInsertionCounts = new Map<number, number>()
  alignments.forEach((alignment) => {
    insertionCountsAfterAnchors(alignment).forEach((count, anchor) => {
      anchorInsertionCounts.set(anchor, Math.max(anchorInsertionCounts.get(anchor) ?? 0, count))
    })
  })
  if (anchorInsertionCounts.size === 0) {
    return { anchorInsertionCounts, templateLength, insertionPrefixByTemplate: null }
  }

  const insertionPrefixByTemplate = new Uint32Array(templateLength + 1)
  for (let templateIndex = 0; templateIndex < templateLength; templateIndex += 1) {
    insertionPrefixByTemplate[templateIndex + 1] =
      insertionPrefixByTemplate[templateIndex] + (anchorInsertionCounts.get(templateIndex) ?? 0)
  }
  return { anchorInsertionCounts, templateLength, insertionPrefixByTemplate }
}

function totalInsertionGaps(anchorInsertionCounts: Map<number, number>) {
  let total = 0
  anchorInsertionCounts.forEach((count) => {
    total += count
  })
  return total
}

function insertionOffsetBefore(layout: MergedInsertionLayout, templateIndex: number) {
  let offset = layout.anchorInsertionCounts.get(-1) ?? 0
  if (layout.insertionPrefixByTemplate) {
    const safeIndex = Math.max(0, Math.min(layout.templateLength, templateIndex))
    offset += layout.insertionPrefixByTemplate[safeIndex] ?? 0
    return offset
  }
  return offset
}

export function templateIndexLeftPx(layout: MergedInsertionLayout, templateIndex: number) {
  return (
    alignmentTrackInsetPx +
    templateIndex * alignmentBaseStepPx +
    insertionOffsetBefore(layout, templateIndex) * alignmentBaseStepPx
  )
}

function templateIndexForViewportX(layout: MergedInsertionLayout, viewportX: number) {
  if (layout.templateLength <= 1) return 0
  if (viewportX <= templateIndexLeftPx(layout, 0)) return 0
  if (viewportX >= templateIndexLeftPx(layout, layout.templateLength - 1)) return layout.templateLength - 1
  let low = 0
  let high = layout.templateLength - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const midLeft = templateIndexLeftPx(layout, mid)
    if (midLeft <= viewportX) low = mid
    else high = mid - 1
  }
  return low
}

export function computeVisibleTemplateRangeForMergedLayout(
  layout: MergedInsertionLayout,
  scrollLeft: number,
  viewportWidth: number,
) {
  if (layout.templateLength === 0) return { start: 0, end: 0 }
  const leftIndex = templateIndexForViewportX(layout, scrollLeft)
  const rightIndex = templateIndexForViewportX(layout, scrollLeft + viewportWidth)
  const overscan = 4
  const start = Math.max(0, leftIndex - overscan)
  const end = Math.min(layout.templateLength, rightIndex + overscan + 1)
  return { start, end }
}

export function insertionGapLeftPx(
  layout: MergedInsertionLayout,
  anchorTemplateIndex: number,
  slotIndex: number,
) {
  if (anchorTemplateIndex < 0) {
    return alignmentTrackInsetPx + slotIndex * alignmentBaseStepPx
  }
  return (
    templateIndexLeftPx(layout, anchorTemplateIndex) +
    alignmentBaseStepPx +
    slotIndex * alignmentBaseStepPx
  )
}

export function mergedLayoutContentWidthPx(layout: MergedInsertionLayout) {
  const gapColumns = totalInsertionGaps(layout.anchorInsertionCounts)
  const totalColumns = layout.templateLength + gapColumns
  return alignmentTrackInsetPx * 2 + totalColumns * alignmentBaseStepPx
}

export function mergedAlignmentTrackWidthPx(layout: MergedInsertionLayout) {
  const sequenceRowEndIndexPx = 56
  const sequenceRowEndIndexGapPx = 10
  return mergedLayoutContentWidthPx(layout) + sequenceRowEndIndexGapPx + sequenceRowEndIndexPx
}

export function visibleMergedLayoutEntries(
  layout: MergedInsertionLayout,
  templateStart: number,
  templateEnd: number,
): MergedLayoutEntry[] {
  const boundedStart = Math.max(0, Math.min(layout.templateLength, templateStart))
  const boundedEnd = Math.max(boundedStart, Math.min(layout.templateLength, templateEnd))
  const entries: MergedLayoutEntry[] = []
  let slotIndex = 0

  // Show insertion gaps immediately before the first visible template base.
  const beforeAnchor = boundedStart === 0 ? -1 : boundedStart - 1
  const leadingVisibleGapCount = layout.anchorInsertionCounts.get(beforeAnchor) ?? 0
  for (let gapIndex = 0; gapIndex < leadingVisibleGapCount; gapIndex += 1) {
    entries.push({
      slot: { kind: 'insertion-gap', anchorTemplateIndex: beforeAnchor, slotIndex: gapIndex },
      slotIndex,
      leftPx: insertionGapLeftPx(layout, beforeAnchor, gapIndex),
    })
    slotIndex += 1
  }

  for (let templateIndex = boundedStart; templateIndex < boundedEnd; templateIndex += 1) {
    entries.push({
      slot: { kind: 'template', templateIndex },
      slotIndex,
      leftPx: templateIndexLeftPx(layout, templateIndex),
    })
    slotIndex += 1

    const gapCount = layout.anchorInsertionCounts.get(templateIndex) ?? 0
    for (let gapIndex = 0; gapIndex < gapCount; gapIndex += 1) {
      entries.push({
        slot: { kind: 'insertion-gap', anchorTemplateIndex: templateIndex, slotIndex: gapIndex },
        slotIndex,
        leftPx: insertionGapLeftPx(layout, templateIndex, gapIndex),
      })
      slotIndex += 1
    }
  }

  return entries
}

export function templateIndexAtMergedX(layout: MergedInsertionLayout, localX: number, templateStart: number, templateEnd: number) {
  const entries = visibleMergedLayoutEntries(layout, templateStart, templateEnd)
  const hit = entries.find(
    (entry) =>
      entry.slot.kind === 'template' &&
      localX >= entry.leftPx &&
      localX < entry.leftPx + alignmentBaseStepPx,
  )
  return hit && hit.slot.kind === 'template' ? hit.slot.templateIndex : null
}

/** Resolve insertion columns to their shared reference boundary and nearest visual edge. */
export function templateBoundaryAtMergedX(layout: MergedInsertionLayout, localX: number, templateStart: number, templateEnd: number) {
  const entry = visibleMergedLayoutEntries(layout, templateStart, templateEnd).find(
    (candidate) => localX >= candidate.leftPx && localX < candidate.leftPx + alignmentBaseStepPx,
  )
  if (!entry) return null
  if (entry.slot.kind === 'insertion-gap') {
    const anchor = entry.slot.anchorTemplateIndex
    const count = layout.anchorInsertionCounts.get(anchor) ?? 0
    const gapLeft = insertionGapLeftPx(layout, anchor, 0)
    return {
      boundary: Math.max(0, Math.min(layout.templateLength, anchor + 1)),
      hoverBase: Math.max(0, Math.min(layout.templateLength - 1, anchor + 1)),
      gapEdge: localX < gapLeft + count * alignmentBaseStepPx / 2 ? 'left' as const : 'right' as const,
    }
  }
  const index = entry.slot.templateIndex
  const boundary = localX >= entry.leftPx + alignmentBaseStepPx / 2 ? index + 1 : index
  const gapCount = layout.anchorInsertionCounts.get(boundary - 1) ?? 0
  return {
    boundary,
    hoverBase: index,
    gapEdge: gapCount ? (boundary === index ? 'right' as const : 'left' as const) : null,
  }
}

export function mergedTemplateSpanPx(
  layout: MergedInsertionLayout,
  templateStart: number,
  templateEnd: number,
) {
  const boundedStart = Math.max(0, Math.min(layout.templateLength, templateStart))
  const boundedEnd = Math.max(boundedStart, Math.min(layout.templateLength, templateEnd))
  if (boundedStart >= boundedEnd) return null

  const left = templateIndexLeftPx(layout, boundedStart)
  const templateSpanColumns = boundedEnd - boundedStart
  const insertionSpanColumns = layout.insertionPrefixByTemplate
    ? layout.insertionPrefixByTemplate[boundedEnd] - layout.insertionPrefixByTemplate[boundedStart]
    : 0
  const width = (templateSpanColumns + insertionSpanColumns) * alignmentBaseStepPx
  return { left, width }
}

/** @deprecated Use buildMergedInsertionLayout — kept as alias for tests */
export function buildMergedLayoutColumns(
  alignments: TraceTemplateAlignment[],
  templateLength: number,
): MergedInsertionLayout {
  return buildMergedInsertionLayout(alignments, templateLength)
}

export type TraceSlotLookup = {
  templateColumns: Map<number, AlignmentDisplayColumn>
  insertionColumnsByAnchor: Map<number, AlignmentDisplayColumn[]>
}

export function buildTraceSlotLookup(alignment: TraceTemplateAlignment): TraceSlotLookup {
  const templateColumns = new Map<number, AlignmentDisplayColumn>()
  const insertionColumnsByAnchor = new Map<number, AlignmentDisplayColumn[]>()
  let anchorTemplateIndex = -1

  alignment.columns.forEach((column) => {
    if (column.kind === 'match') {
      templateColumns.set(column.templateIndex, {
        kind: 'match',
        templateIndex: column.templateIndex,
        traceIndex: column.traceIndex,
        match: column.match,
      })
      anchorTemplateIndex = column.templateIndex
      return
    }
    if (column.kind === 'templateGap') {
      templateColumns.set(column.templateIndex, {
        kind: 'deletion',
        templateIndex: column.templateIndex,
      })
      anchorTemplateIndex = column.templateIndex
      return
    }
    const list = insertionColumnsByAnchor.get(anchorTemplateIndex) ?? []
    list.push({ kind: 'insertion', traceIndex: column.traceIndex })
    insertionColumnsByAnchor.set(anchorTemplateIndex, list)
  })

  return { templateColumns, insertionColumnsByAnchor }
}

export function resolveTraceColumnAtMergedSlotFromLookup(
  lookup: TraceSlotLookup,
  slot: MergedLayoutColumn,
): AlignmentDisplayColumn | null {
  if (slot.kind === 'template') {
    return lookup.templateColumns.get(slot.templateIndex) ?? null
  }
  const insertions = lookup.insertionColumnsByAnchor.get(slot.anchorTemplateIndex)
  return insertions?.[slot.slotIndex] ?? null
}

export function resolveTraceColumnAtMergedSlot(
  alignment: TraceTemplateAlignment,
  slot: MergedLayoutColumn,
): AlignmentDisplayColumn | null {
  const lookup = buildTraceSlotLookup(alignment)
  return resolveTraceColumnAtMergedSlotFromLookup(lookup, slot)
}

export function buildTemplateBaseCells(
  alignment: TraceTemplateAlignment,
  baseCalls: string[],
  templateStart: number,
  templateEnd: number,
): Map<number, TemplateBaseCell> {
  const cells = new Map<number, TemplateBaseCell>()
  let lastTemplateIndex = -1

  const ensureCell = (templateIndex: number) => {
    if (!cells.has(templateIndex)) {
      cells.set(templateIndex, { char: '', variant: 'empty', insertions: '' })
    }
    return cells.get(templateIndex)!
  }

  alignment.columns.forEach((column) => {
    if (column.kind === 'traceInsert') {
      const traceBase = baseCalls[column.traceIndex] ?? ''
      if (lastTemplateIndex >= 0) {
        const cell = ensureCell(lastTemplateIndex)
        cell.insertions += traceBase
      }
      return
    }
    if (column.kind === 'templateGap') {
      cells.set(column.templateIndex, { char: '-', variant: 'deletion', insertions: '' })
      lastTemplateIndex = column.templateIndex
      return
    }
    const traceBase = baseCalls[column.traceIndex] ?? ''
    cells.set(column.templateIndex, {
      char: traceBase,
      variant: column.match ? 'match' : 'mismatch',
      insertions: '',
    })
    lastTemplateIndex = column.templateIndex
  })

  for (let templateIndex = templateStart; templateIndex < templateEnd; templateIndex += 1) {
    if (!cells.has(templateIndex)) {
      cells.set(templateIndex, { char: '·', variant: 'empty', insertions: '' })
    }
  }

  return cells
}

type ChromatogramColumnPoint = {
  x: number
  scan: number
  templateIndex: number
  traceIndex: number
  calledBase: ChromatogramBase
}

type ChromatogramSamplePoint = {
  x: number
  scan: number
}

function calledBaseForColumn(
  column: AlignmentDisplayColumn,
  baseCalls: string[],
  orientation: TraceTemplateAlignment['orientation'],
): ChromatogramBase | null {
  const raw = traceBaseForColumn(column, baseCalls, orientation)
  if (raw === 'A' || raw === 'T' || raw === 'G' || raw === 'C') return raw
  return null
}

function chromatogramColumnPoints({
  chromatogram,
  alignment,
  templateStart,
  templateEnd,
  entries,
}: {
  chromatogram: ChromatogramData
  alignment: TraceTemplateAlignment
  templateStart: number
  templateEnd: number
  entries: MergedLayoutEntry[]
}) {
  const lookup = buildTraceSlotLookup(alignment)
  const points: ChromatogramColumnPoint[] = []

  for (const entry of entries) {
    const column = resolveTraceColumnAtMergedSlotFromLookup(lookup, entry.slot)
    if (!column || column.kind === 'deletion') continue

    const calledBase = calledBaseForColumn(column, chromatogram.baseCalls, alignment.orientation)
    if (!calledBase) continue

    const scan = chromatogram.basePos[column.traceIndex]
    if (scan === undefined || scan < 0 || scan >= chromatogram.aTrace.length) continue

    const templateIndex = entry.slot.kind === 'template' ? entry.slot.templateIndex : entry.slot.anchorTemplateIndex
    if (column.kind === 'match' && (templateIndex < templateStart || templateIndex >= templateEnd)) continue

    points.push({
      x: entry.leftPx + alignmentBaseStepPx / 2,
      scan,
      templateIndex,
      traceIndex: column.traceIndex,
      calledBase,
    })
  }

  return points.toSorted((left, right) => left.traceIndex - right.traceIndex)
}

const chromatogramGapBreakPx = alignmentBaseStepPx * 1.25

function interpolationSteps(scanDelta: number) {
  // Plot every intermediate scan between two aligned base columns so the trace
  // stays smooth; sub-sampling here produces jagged, artificially peaky curves.
  return Math.abs(scanDelta)
}

function chromatogramSampleSegments(columnPoints: ChromatogramColumnPoint[]) {
  if (!columnPoints.length) return [] as ChromatogramSamplePoint[][]
  if (columnPoints.length === 1) {
    const only = columnPoints[0]!
    return [[{ x: only.x, scan: only.scan }]]
  }

  const ordered = columnPoints.toSorted((left, right) => left.traceIndex - right.traceIndex)
  const segments: ChromatogramSamplePoint[][] = []
  let segment: ChromatogramSamplePoint[] = [{ x: ordered[0]!.x, scan: ordered[0]!.scan }]

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = ordered[index]!
    const right = ordered[index + 1]!
    const xSpan = right.x - left.x

    if (Math.abs(xSpan) > chromatogramGapBreakPx) {
      // The calls on either side are adjacent in the trace, even though the
      // reference has intervening bases. Preserve each peak to the midpoint
      // between their scans without stretching those samples across the gap.
      const midpoint = Math.round((left.scan + right.scan) / 2)
      const direction = Math.sign(xSpan)
      const halfStep = alignmentBaseStepPx / 2
      const leftSteps = Math.abs(midpoint - left.scan)
      for (let step = 1; step <= leftSteps; step += 1) {
        segment.push({ x: left.x + direction * halfStep * step / leftSteps, scan: left.scan + Math.sign(midpoint - left.scan) * step })
      }
      segments.push(segment)
      segment = []
      const rightSteps = Math.abs(right.scan - midpoint)
      for (let step = 0; step <= rightSteps; step += 1) {
        const offset = rightSteps ? step / rightSteps : 1
        segment.push({ x: right.x - direction * halfStep * (1 - offset), scan: midpoint + Math.sign(right.scan - midpoint) * step })
      }
      continue
    }

    const scanDelta = right.scan - left.scan
    const steps = interpolationSteps(scanDelta)
    for (let step = 1; step <= steps; step += 1) {
      const offset = step / steps
      segment.push({
        x: left.x + xSpan * offset,
        scan: Math.round(left.scan + scanDelta * offset),
      })
    }
  }

  segments.push(segment)
  return segments
}

function chromatogramChannelsForOrientation(
  chromatogram: ChromatogramData,
  orientation: TraceTemplateAlignment['orientation'],
): Record<ChromatogramBase, number[]> {
  if (orientation === 'reverse') {
    return {
      A: chromatogram.tTrace,
      T: chromatogram.aTrace,
      G: chromatogram.cTrace,
      C: chromatogram.gTrace,
    }
  }
  return {
    A: chromatogram.aTrace,
    T: chromatogram.tTrace,
    G: chromatogram.gTrace,
    C: chromatogram.cTrace,
  }
}

export function buildChromatogramPaths({
  chromatogram,
  alignment,
  templateStart,
  templateEnd,
  height,
  mergedLayout,
  visibleEntries,
}: {
  chromatogram: ChromatogramData
  alignment: TraceTemplateAlignment
  templateStart: number
  templateEnd: number
  height: number
  mergedLayout: MergedInsertionLayout
  visibleEntries?: MergedLayoutEntry[]
}) {
  const entries = visibleEntries ?? visibleMergedLayoutEntries(mergedLayout, templateStart, templateEnd)
  const columnPoints = chromatogramColumnPoints({
    chromatogram,
    alignment,
    templateStart,
    templateEnd,
    entries,
  })

  if (!columnPoints.length) {
    const width = entries.length ? Math.max(...entries.map((entry) => entry.leftPx)) + alignmentBaseStepPx : alignmentBaseStepPx
    return { paths: [], width, hoverSamples: [] }
  }

  const sampleSegments = chromatogramSampleSegments(columnPoints)
  const samplePoints = sampleSegments.flat()
  const traces = chromatogramChannelsForOrientation(chromatogram, alignment.orientation)

  let max = 1
  for (const point of samplePoints) {
    const scan = point.scan
    max = Math.max(max, traces.A[scan] ?? 0, traces.T[scan] ?? 0, traces.G[scan] ?? 0, traces.C[scan] ?? 0)
  }

  const hoverSamples: ChromatogramHoverSample[] = columnPoints.map((point) => ({
    x: point.x,
    scan: point.scan,
    templateIndex: point.templateIndex,
    dominantBase: point.calledBase,
  }))

  const paths = (['A', 'T', 'G', 'C'] as const).map((base) => {
    const strokeParts: string[] = []
    const fillParts: string[] = []

    for (const segment of sampleSegments) {
      const points: Array<{ x: number; y: number }> = []
      for (const samplePoint of segment) {
        const peak = traces[base][samplePoint.scan] ?? 0
        const y = height - (peak / max) * (height - 6) - 3
        points.push({ x: samplePoint.x, y })
      }
      if (!points.length) continue
      strokeParts.push(`M ${points.map((point) => `${point.x},${point.y}`).join(' L ')}`)
      if (points.length > 1) {
        fillParts.push(
          `M ${points[0].x},${height} L ${points.map((point) => `${point.x},${point.y}`).join(' L ')} L ${points[points.length - 1].x},${height} Z`,
        )
      }
    }

    return { base, stroke: strokeParts.join(' '), fill: fillParts.join(' ') }
  })

  const width = entries.length ? Math.max(...entries.map((entry) => entry.leftPx)) + alignmentBaseStepPx : alignmentBaseStepPx
  return { paths, width, hoverSamples }
}

export function nearestHoverSample(samples: ChromatogramHoverSample[], localX: number) {
  if (!samples.length) return null
  let best = samples[0]
  let bestDistance = Math.abs(samples[0].x - localX)
  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index]
    const distance = Math.abs(sample.x - localX)
    if (distance < bestDistance) {
      best = sample
      bestDistance = distance
    }
  }
  return bestDistance <= alignmentBaseStepPx ? best : null
}

export function rulerTicksForDisplayColumns(
  layout: Array<{ leftPx: number; column: AlignmentDisplayColumn }>,
  alignment: TraceTemplateAlignment,
) {
  const ticks: Array<{ x: number; major: boolean; label: string | null }> = []
  layout.forEach(({ column, leftPx }) => {
    const tracePosition = tracePositionForColumn(column, alignment)
    if (tracePosition === null) return
    const major = tracePosition % 10 === 0
    ticks.push({
      x: leftPx + alignmentBaseStepPx / 2,
      major,
      label: major ? String(tracePosition) : null,
    })
  })
  return ticks
}

export function rulerTicksForMergedTraceLayout(
  entries: MergedLayoutEntry[],
  alignment: TraceTemplateAlignment,
  lookup?: TraceSlotLookup,
) {
  const effectiveLookup = lookup ?? buildTraceSlotLookup(alignment)
  const ticks: Array<{ x: number; major: boolean; label: string | null }> = []
  entries.forEach((entry) => {
    const column = resolveTraceColumnAtMergedSlotFromLookup(effectiveLookup, entry.slot)
    if (!column) return
    const tracePosition = tracePositionForColumn(column, alignment)
    if (tracePosition === null) return
    const major = tracePosition % 10 === 0
    ticks.push({
      x: entry.leftPx + alignmentBaseStepPx / 2,
      major,
      label: major ? String(tracePosition) : null,
    })
  })
  return ticks
}
