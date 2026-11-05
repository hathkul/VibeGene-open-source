/** Desktop / Tauri protein map scroll host — matches historical 760px floor in ProteinMapPane. */
export const DESKTOP_PROTEIN_MAP_MIN_VIEWPORT_WIDTH = 760

/** Touch-phone shell floor; aligns with computeLinearTrackLayout mapWidth minimum. */
export const MOBILE_PROTEIN_MAP_MIN_VIEWPORT_WIDTH = 320

/** Smallest zoom window when magnifier mode is active (matches MAP_ZOOM_MIN_WINDOW_BP). */
export const PROTEIN_MAP_ZOOM_MIN_WINDOW = 50

export type ProteinMapViewRange = {
  start: number
  end: number
}

/**
 * Width passed into protein linear layout from the scroll host's client width.
 * Mobile shell uses the real viewport (≥320px); desktop keeps the 760px minimum.
 */
export function proteinMapBaseWidthFromScrollViewport(
  scrollClientWidth: number,
  isMobileShell: boolean,
): number {
  const floor = isMobileShell
    ? MOBILE_PROTEIN_MAP_MIN_VIEWPORT_WIDTH
    : DESKTOP_PROTEIN_MAP_MIN_VIEWPORT_WIDTH
  const measured = Math.floor(scrollClientWidth)
  if (!Number.isFinite(measured) || measured <= 0) return floor
  return Math.max(floor, measured)
}

function proteinMapZoomMinWindow(sequenceLength: number): number {
  const length = Math.max(1, sequenceLength)
  return Math.max(1, Math.min(length, PROTEIN_MAP_ZOOM_MIN_WINDOW))
}

/** Clamp a magnifier view range to sequence bounds while preserving window length. */
export function clampProteinMapViewRange(
  range: ProteinMapViewRange,
  sequenceLength: number,
): ProteinMapViewRange {
  const length = Math.max(1, sequenceLength)
  const minWindow = proteinMapZoomMinWindow(length)
  const rawLen = Math.max(1, Math.round(range.end - range.start))
  const windowLen = Math.max(minWindow, Math.min(length, rawLen))
  const start = Math.max(0, Math.min(length - windowLen, Math.round(range.start)))
  return { start, end: start + windowLen }
}

/**
 * Shift the visible residue window from a horizontal pointer drag on the map track.
 * Positive dragDeltaPx (finger/content moves right) shows earlier residues.
 */
export function proteinMapViewRangeAfterHorizontalDrag(
  viewRange: ProteinMapViewRange,
  sequenceLength: number,
  dragDeltaPx: number,
  trackSpanPx: number,
): ProteinMapViewRange {
  if (!Number.isFinite(dragDeltaPx) || dragDeltaPx === 0) return viewRange
  const visibleLength = Math.max(1, viewRange.end - viewRange.start)
  const spanPx = Math.max(1, trackSpanPx)
  const shift = -Math.round((dragDeltaPx / spanPx) * visibleLength)
  if (shift === 0) return viewRange
  return clampProteinMapViewRange(
    { start: viewRange.start + shift, end: viewRange.end + shift },
    sequenceLength,
  )
}
