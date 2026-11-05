/** A half-open sequence range used by map selection and magnifier controls. */
export type MapSelectionRange = {
  start: number
  end: number
}

const MAP_ZOOM_MIN_WINDOW_BP = 50
/** Initial window size as a fraction of the full sequence when entering zoom. */
const MAP_ZOOM_DEFAULT_FRACTION = 0.35
const MAP_ZOOM_SLIDER_STEPS = 1000

export function mapZoomMinWindow(sequenceLength: number) {
  return Math.max(1, Math.min(Math.max(1, sequenceLength), MAP_ZOOM_MIN_WINDOW_BP))
}

export function mapZoomCaretPosition(selectedRange: MapSelectionRange | null, sequenceLength: number) {
  const length = Math.max(0, sequenceLength)
  if (length <= 0) return 0
  if (!selectedRange) return Math.floor(length / 2)
  if (selectedRange.end === selectedRange.start) return selectedRange.start
  if (selectedRange.end > selectedRange.start) return Math.floor((selectedRange.start + selectedRange.end) / 2)
  return selectedRange.start
}

export function clampMapZoomRange(range: MapSelectionRange, sequenceLength: number): MapSelectionRange {
  const length = Math.max(1, sequenceLength)
  const minWindow = mapZoomMinWindow(length)
  const rawLen = Math.max(1, Math.round(range.end - range.start))
  const windowLen = Math.max(minWindow, Math.min(length, rawLen))
  const start = Math.max(0, Math.min(length - windowLen, Math.round(range.start)))
  return { start, end: start + windowLen }
}

/** Keep a zoom window inside the sequence without expanding it to the magnifier minimum. */
export function clampMapZoomRangeToSequence(range: MapSelectionRange, sequenceLength: number): MapSelectionRange {
  const length = Math.max(1, sequenceLength)
  const start = Math.max(0, Math.min(length - 1, Math.round(range.start)))
  const end = Math.max(start + 1, Math.min(length, Math.round(range.end)))
  return { start, end }
}

export function mapZoomRangeAroundCaret(caret: number, windowLen: number, sequenceLength: number): MapSelectionRange {
  const length = Math.max(1, sequenceLength)
  const minWindow = mapZoomMinWindow(length)
  const clampedLen = Math.max(minWindow, Math.min(length, Math.round(windowLen)))
  const half = Math.floor(clampedLen / 2)
  let start = Math.round(caret) - half
  if (start < 0) start = 0
  if (start + clampedLen > length) start = Math.max(0, length - clampedLen)
  return { start, end: start + clampedLen }
}

/** Linear zoom window when entering magnifier mode. A non-wrapping range is used exactly. */
export function initialMapZoomState(
  selectedRange: MapSelectionRange | null,
  sequenceLength: number,
): { range: MapSelectionRange; slider: number } {
  const length = Math.max(1, sequenceLength)
  if (selectedRange && selectedRange.end > selectedRange.start) {
    const start = Math.max(0, Math.min(length, selectedRange.start))
    const end = Math.max(start + 1, Math.min(length, selectedRange.end))
    const range = { start, end }
    return { range, slider: mapZoomSliderValueFromWindow(end - start, length) }
  }
  const caret = mapZoomCaretPosition(selectedRange, length)
  const windowLen = Math.max(mapZoomMinWindow(length), Math.round(length * MAP_ZOOM_DEFAULT_FRACTION))
  const range = mapZoomRangeAroundCaret(caret, windowLen, length)
  return { range, slider: mapZoomSliderValueFromWindow(windowLen, length) }
}

export function mapZoomSliderSteps(sequenceLength: number) {
  const length = Math.max(1, sequenceLength)
  const minWindow = mapZoomMinWindow(length)
  const span = Math.max(0, length - minWindow)
  return Math.max(1, Math.min(MAP_ZOOM_SLIDER_STEPS, span))
}

export function mapZoomWindowFromSlider(sliderValue: number, sequenceLength: number) {
  const length = Math.max(1, sequenceLength)
  const minWindow = mapZoomMinWindow(length)
  const span = length - minWindow
  if (span <= 0) return length
  const steps = mapZoomSliderSteps(length)
  const v = Math.max(0, Math.min(steps, Math.round(sliderValue)))
  if (v <= 0) return length
  if (v >= steps) return minWindow
  const shrink = Math.max(1, Math.round((v / steps) * span))
  return Math.max(minWindow, length - shrink)
}

export function mapZoomSliderValueFromWindow(windowLen: number, sequenceLength: number) {
  const length = Math.max(1, sequenceLength)
  const minWindow = mapZoomMinWindow(length)
  const span = length - minWindow
  if (span <= 0) return 0
  const steps = mapZoomSliderSteps(length)
  const w = Math.max(minWindow, Math.min(length, Math.round(windowLen)))
  if (w >= length) return 0
  if (w <= minWindow) return steps
  const shrink = length - w
  return Math.max(1, Math.min(steps, Math.round((shrink / span) * steps)))
}

export function mapZoomRangeFromSlider(
  sliderValue: number,
  caret: number,
  sequenceLength: number,
): MapSelectionRange {
  const length = Math.max(1, sequenceLength)
  const steps = mapZoomSliderSteps(length)
  const v = Math.max(0, Math.min(steps, Math.round(sliderValue)))
  if (v <= 0) return { start: 0, end: length }
  return mapZoomRangeAroundCaret(caret, mapZoomWindowFromSlider(v, length), length)
}

export function formatMapZoomRange(range: MapSelectionRange) {
  return `${(range.start + 1).toLocaleString()} .... ${Math.max(range.start + 1, range.end).toLocaleString()}`
}
