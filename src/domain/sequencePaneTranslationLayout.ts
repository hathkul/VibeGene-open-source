import { assignIntervalLanes } from './intervalLanes'

/**
 * Lane that should host each feature's translation block on a sequence row.
 * Prefers the solid feature-body lane; falls back to the in-frame extension
 * placeholder lane so continuation/wrap rows keep amino acids above the dashed line.
 */
export function sequencePaneTranslationLanesByFeatureId(
  rowFeatures: Array<{ feature: { id: string }; lane: number; isInFrameExtension?: boolean }>,
): Map<string, number> {
  const laneByFeatureId = new Map<string, number>()
  rowFeatures.forEach((segment) => {
    if (segment.isInFrameExtension) return
    if (!laneByFeatureId.has(segment.feature.id)) laneByFeatureId.set(segment.feature.id, segment.lane)
  })
  rowFeatures.forEach((segment) => {
    if (!segment.isInFrameExtension) return
    if (!laneByFeatureId.has(segment.feature.id)) laneByFeatureId.set(segment.feature.id, segment.lane)
  })
  return laneByFeatureId
}

export type SequencePaneLaneSegment = {
  segmentId: string
  featureId: string
  start: number
  end: number
  /** Lower packs first when starts are equal. Default 0. */
  priority?: number
}

export type GenomicRange = {
  /** Inclusive genomic start. */
  start: number
  /** Exclusive genomic end. */
  end: number
}

export type TranslationGroupPackInput = {
  id: string
  featureIds: string[]
  /**
   * Contiguous codon coverage on this row. Gaps between runs stay free so other
   * features can pack into empty strips after short / non-extended CDSes.
   */
  ranges: GenomicRange[]
}

export type SkylineBandItem = {
  id: string
  /** One or more X ranges occupied at the same vertical band. */
  ranges: GenomicRange[]
  height: number
  priority?: number
  /**
   * Placement precedence. Items in a lower layer are placed first, so a later
   * layer can never claim a strip that an overlapping earlier-layer item
   * occupies. Feature bodies use layer 0, primer bodies layer 1.
   */
  layer?: number
}

export type ReversePrimerBodyBand = {
  id: string
  start: number
  end: number
  height: number
  priority?: number
}

export type CombinedSequenceRowBandLayout = {
  featureTopPxById: Map<string, number>
  reversePrimerTopPxById: Map<string, number>
  reversePrimerTopPx: number[]
  featureHeightPx: number
  reversePrimerHeightPx: number
  totalHeightPx: number
}

export function sequenceRowVisibleBandHeights(
  layout: Pick<CombinedSequenceRowBandLayout, 'featureHeightPx' | 'reversePrimerHeightPx'>,
  maxFeatureRows: number | undefined,
  featureLaneStepPx: number,
) {
  const featureContentHeightPx = maxFeatureRows
    ? Math.min(layout.featureHeightPx, maxFeatureRows * featureLaneStepPx)
    : layout.featureHeightPx
  return {
    featureContentHeightPx,
    bandHeightPx: Math.max(featureContentHeightPx, layout.reversePrimerHeightPx),
  }
}

type ReversePrimerPlacementLike = {
  display: { primerId: string; templateSpanStart: number; templateSpanEnd: number }
  stackHeight: number
  /** Rendered visual span for this row, including 5′/3′ overhang glyphs. */
  packingStart?: number
  packingEnd?: number
}

function reversePrimerBandId(placement: ReversePrimerPlacementLike, index: number) {
  return `reverse-primer:${placement.display.primerId}:${placement.display.templateSpanStart}:${placement.display.templateSpanEnd}:${index}`
}

/**
 * Clip translation cells to a sequence row and return the occupied genomic span.
 * Prefer {@link translationContiguousSpansOnRow} for packing so gaps stay free.
 */
export function translationSpanOnRow(
  cells: Array<{ positions: number[] }>,
  rowStart: number,
  rowEnd: number,
): GenomicRange | null {
  const spans = translationContiguousSpansOnRow(cells, rowStart, rowEnd)
  if (!spans.length) return null
  return {
    start: Math.min(...spans.map((span) => span.start)),
    end: Math.max(...spans.map((span) => span.end)),
  }
}

/** True when any codon base overlaps the row window. */
export function translationCellOverlapsRow(
  cell: { positions: number[] },
  rowStart: number,
  rowEnd: number,
): boolean {
  if (!cell.positions.length) return false
  const minPos = Math.min(...cell.positions)
  const maxPos = Math.max(...cell.positions)
  return maxPos >= rowStart && minPos < rowEnd
}

function lowerBoundMaxPos<T extends { maxPos: number }>(cells: readonly T[], rowStart: number): number {
  let lo = 0
  let hi = cells.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cells[mid]!.maxPos < rowStart) lo = mid + 1
    else hi = mid
  }
  return lo
}

function upperBoundMinPos<T extends { minPos: number }>(cells: readonly T[], rowEnd: number): number {
  let lo = 0
  let hi = cells.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cells[mid]!.minPos < rowEnd) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Return translation cells overlapping a row from a minPos-sorted index (O(log n) + slice). */
export function translationCellsForRow<T extends { minPos: number; maxPos: number }>(
  cells: readonly T[],
  rowStart: number,
  rowEnd: number,
): T[] {
  if (!cells.length || rowEnd <= rowStart) return []
  const start = lowerBoundMaxPos(cells, rowStart)
  const end = upperBoundMinPos(cells, rowEnd)
  if (start >= end) return []
  return cells.slice(start, end) as T[]
}

/**
 * Split translation cells into contiguous ruler runs (indices into a
 * genomically sorted cell list from {@link sortTranslationCellsForRuler}).
 * Breaks on genomic gaps and after stop codons so a same-frame restart on the
 * same sequence row does not draw one continuous ruler through the gap.
 */
export function translationRulerRuns(
  sortedCells: Array<{ aa: string; positions: number[] }>,
): Array<{ startIndex: number; endIndex: number }> {
  if (!sortedCells.length) return []

  const runs: Array<{ startIndex: number; endIndex: number }> = []
  let runStart = 0
  for (let i = 1; i < sortedCells.length; i += 1) {
    const prev = sortedCells[i - 1]!
    const curr = sortedCells[i]!
    const prevEnd = Math.max(...prev.positions) + 1
    const currStart = Math.min(...curr.positions)
    if (currStart > prevEnd || prev.aa === '*') {
      runs.push({ startIndex: runStart, endIndex: i })
      runStart = i
    }
  }
  runs.push({ startIndex: runStart, endIndex: sortedCells.length })
  return runs
}

/** Cells sorted in genomic order for ruler segmentation. */
export function sortTranslationCellsForRuler<T extends { positions: number[] }>(cells: T[]): T[] {
  return [...cells].toSorted((a, b) => {
    const aStart = Math.min(...a.positions)
    const bStart = Math.min(...b.positions)
    if (aStart !== bStart) return aStart - bStart
    return Math.max(...a.positions) - Math.max(...b.positions)
  })
}

/**
 * Contiguous codon coverage on a row. Gaps (and post-stop restarts) become separate
 * ranges so packing does not reserve empty mid-row strips.
 */
export function translationContiguousSpansOnRow(
  cells: Array<{ aa?: string; positions: number[] }>,
  rowStart: number,
  rowEnd: number,
): GenomicRange[] {
  const overlapping = cells.filter((cell) => translationCellOverlapsRow(cell, rowStart, rowEnd))
  if (!overlapping.length) return []
  const sorted = sortTranslationCellsForRuler(
    overlapping.map((cell) => ({
      aa: cell.aa ?? 'X',
      positions: cell.positions,
    })),
  )
  return translationRulerRuns(sorted).flatMap((run) => {
    const runCells = sorted.slice(run.startIndex, run.endIndex)
    let start = Number.POSITIVE_INFINITY
    let end = Number.NEGATIVE_INFINITY
    for (const cell of runCells) {
      for (const position of cell.positions) {
        if (position < rowStart || position >= rowEnd) continue
        start = Math.min(start, position)
        end = Math.max(end, position + 1)
      }
    }
    if (!Number.isFinite(start) || end <= start) return []
    return [{ start, end }]
  })
}

function normalizeRanges(ranges: GenomicRange[]): GenomicRange[] {
  return ranges
    .map((range) => ({
      start: range.start,
      end: Math.max(range.end, range.start + 1),
    }))
    .filter((range) => range.end > range.start)
    .toSorted((a, b) => a.start - b.start || a.end - b.end)
}

function rangesOverlap(a: GenomicRange[], b: GenomicRange[]): boolean {
  for (const left of a) {
    for (const right of b) {
      if (left.start < right.end && right.start < left.end) return true
    }
  }
  return false
}

/**
 * Pack axis-aligned bands with a skyline so shorter bands can reuse vertical
 * space freed after a taller (translation+CDS) band ends mid-row.
 * Items may occupy multiple X ranges at the same Y; gaps between ranges stay free.
 * Returns the top Y (px) for each item id.
 */
export function packSkylineBands(items: SkylineBandItem[]): Map<string, number> {
  const placed: Array<{ ranges: GenomicRange[]; top: number; bottom: number; layer: number }> = []
  const result = new Map<string, number>()

  const sorted = items
    .map((item) => ({
      ...item,
      ranges: normalizeRanges(item.ranges),
    }))
    .filter((item) => item.ranges.length)
    .toSorted(
      (a, b) =>
        (a.layer ?? 0) - (b.layer ?? 0) ||
        a.ranges[0]!.start - b.ranges[0]!.start ||
        (a.priority ?? 0) - (b.priority ?? 0) ||
        b.ranges.reduce((sum, range) => sum + (range.end - range.start), 0) -
          a.ranges.reduce((sum, range) => sum + (range.end - range.start), 0) ||
        b.height - a.height ||
        a.id.localeCompare(b.id),
    )

  for (const item of sorted) {
    const height = Math.max(1, item.height)
    // Apply layer precedence before collision checking: moving an item below a
    // feature afterwards could put it on top of an already placed primer.
    let y = item.layer ? minimumTopBelowLowerLayers(item, placed) : 0
    for (;;) {
      const bottom = y + height
      const blockers = placed.filter(
        (entry) => rangesOverlap(item.ranges, entry.ranges) && y < entry.bottom && entry.top < bottom,
      )
      if (!blockers.length) break
      y = Math.min(...blockers.map((entry) => entry.bottom))
    }
    placed.push({ ranges: item.ranges, top: y, bottom: y + height, layer: item.layer ?? 0 })
    result.set(item.id, y)
  }
  return result
}

/**
 * Lowest top offset a layered item may take: below every overlapping item of a
 * lower layer. The lower-layer item's own bottom edge is the bound, so the
 * layered item sits directly beneath it instead of jumping into a horizontal
 * gap that happens to sit higher up.
 */
function minimumTopBelowLowerLayers(
  item: SkylineBandItem,
  placed: Array<{ ranges: GenomicRange[]; top: number; bottom: number; layer: number }>,
): number {
  let bound = 0
  for (const entry of placed) {
    if (entry.layer >= (item.layer ?? 0)) continue
    if (!rangesOverlap(item.ranges, entry.ranges)) continue
    bound = Math.max(bound, entry.bottom)
  }
  return bound
}

/**
 * Pack feature/translation bodies and reverse-primer bodies into the same row
 * skyline. A primer can reuse a feature's vertical strip as soon as their
 * horizontal intervals stop overlapping.
 */
export function packSequenceRowFeatureAndReversePrimerBands(
  featureBands: SkylineBandItem[],
  reversePrimerBands: ReversePrimerBodyBand[],
  minimumHeight = 1,
): CombinedSequenceRowBandLayout {
  const featureIds = new Set(featureBands.map((band) => band.id))
  const primerIds = new Set(reversePrimerBands.map((band) => band.id))
  if ([...featureIds].some((id) => primerIds.has(id))) {
    throw new Error('Feature and reverse-primer band ids must be unique across a row.')
  }
  const primerItems: SkylineBandItem[] = reversePrimerBands.map((band) => ({
    id: band.id,
    ranges: [{ start: band.start, end: band.end }],
    height: band.height,
    priority: band.priority,
    // Primers are placed after the feature bodies, so a primer that overlaps a
    // feature can only take a strip below it.
    layer: 1,
  }))
  const topPxById = packSkylineBands([...featureBands, ...primerItems])
  const featureTopPxById = new Map<string, number>()
  const reversePrimerTopPxById = new Map<string, number>()
  for (const id of featureIds) {
    const top = topPxById.get(id)
    if (top !== undefined) featureTopPxById.set(id, top)
  }
  const reversePrimerTopPx = reversePrimerBands.map((band) => topPxById.get(band.id) ?? 0)
  for (const id of primerIds) {
    const top = topPxById.get(id)
    if (top !== undefined) reversePrimerTopPxById.set(id, top)
  }
  const featureHeightPx = Math.max(
    minimumHeight,
    ...featureBands.map((band) => (topPxById.get(band.id) ?? 0) + band.height),
  )
  const reversePrimerHeightPx = Math.max(
    0,
    ...primerItems.map((band) => (topPxById.get(band.id) ?? 0) + band.height),
  )
  return {
    featureTopPxById,
    reversePrimerTopPxById,
    reversePrimerTopPx,
    featureHeightPx,
    reversePrimerHeightPx,
    totalHeightPx: Math.max(featureHeightPx, reversePrimerHeightPx),
  }
}

/** Adapter for the row renderer's primer placements; keeps stable ids and top offsets in one result. */
export function packSequenceRowFeatureAndReversePrimerPlacements(
  featureBands: SkylineBandItem[],
  placements: readonly ReversePrimerPlacementLike[],
  featureLaneStepPx: number,
  featuresVisible = true,
): CombinedSequenceRowBandLayout {
  return packSequenceRowFeatureAndReversePrimerBands(
    featureBands,
    placements.map((placement, index) => ({
      id: reversePrimerBandId(placement, index),
      start: placement.packingStart ?? placement.display.templateSpanStart,
      end: placement.packingEnd ?? placement.display.templateSpanEnd,
      height: placement.stackHeight,
    })),
    featuresVisible ? featureLaneStepPx : 0,
  )
}

export function reversePrimerPlacementsAtSharedTops<T extends { yOffset: number }>(
  placements: readonly T[],
  topOffsets: readonly number[],
) {
  return placements.map((placement, index) => ({ ...placement, yOffset: topOffsets[index] ?? placement.yOffset }))
}

/**
 * Assign sequence-pane feature lanes so each translation group keeps its amino-acid
 * row directly above its feature bodies.
 *
 * Translation groups pack by contiguous codon runs (gaps stay free). Features that
 * belong to a group inherit that group's lane. Non-translated segments pack into
 * the remaining gaps.
 *
 * Prefer {@link packSkylineBands} when vertical reuse after mid-row CDS ends is needed.
 */
export function assignSequencePaneLanesWithTranslations(
  segments: SequencePaneLaneSegment[],
  translationGroups: TranslationGroupPackInput[],
): Map<string, number> {
  const featureToGroupId = new Map<string, string>()
  for (const group of translationGroups) {
    for (const featureId of group.featureIds) {
      if (!featureToGroupId.has(featureId)) featureToGroupId.set(featureId, group.id)
    }
  }

  // Multi-range groups must share one lane: pack a synthetic union only to choose a
  // lane key, then also reserve each contiguous run so gaps can host other features.
  const packIntervals = [
    ...translationGroups.flatMap((group) => {
      const ranges = normalizeRanges(group.ranges)
      if (!ranges.length) return []
      return ranges.map((range, index) => ({
        id: `tg:${group.id}:${index}`,
        start: range.start,
        end: range.end,
        priority: -1000,
        groupId: group.id,
      }))
    }),
    ...segments
      .filter((segment) => !featureToGroupId.has(segment.featureId))
      .map((segment) => ({
        id: segment.segmentId,
        start: segment.start,
        end: segment.end,
        priority: segment.priority ?? 0,
        groupId: null as string | null,
      })),
  ]

  const laned = assignIntervalLanes(
    packIntervals.map(({ id, start, end, priority }) => ({ id, start, end, priority })),
  )
  const laneByPackId = new Map(laned.map((entry) => [entry.id, entry.lane]))

  // Collapse per-run lanes onto the minimum lane used by any run of the group so all
  // members of a translation group stay vertically aligned.
  const laneByGroupId = new Map<string, number>()
  for (const group of translationGroups) {
    const runLanes = normalizeRanges(group.ranges)
      .map((_, index) => laneByPackId.get(`tg:${group.id}:${index}`))
      .filter((lane): lane is number => lane !== undefined)
    if (runLanes.length) laneByGroupId.set(group.id, Math.min(...runLanes))
  }

  // If runs of the same group landed on different lanes, pull them to the shared min.
  // (assignIntervalLanes can't express multi-range same-lane constraints directly.)
  const laneBySegmentId = new Map<string, number>()
  for (const segment of segments) {
    const groupId = featureToGroupId.get(segment.featureId)
    if (groupId) {
      laneBySegmentId.set(segment.segmentId, laneByGroupId.get(groupId) ?? 0)
      continue
    }
    laneBySegmentId.set(segment.segmentId, laneByPackId.get(segment.segmentId) ?? 0)
  }
  return laneBySegmentId
}
