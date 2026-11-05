import { primerGlyphVisibleInRow, primerGlyphX, templateX, type PrimerFrameDisplay } from '../../domain/primerSequenceLayout'

/** Reserve real scrollable space for primer letters beyond the cropped template. */
export function primerPreviewWindow(
  display: PrimerFrameDisplay | null,
  annealRange: { start: number; end: number },
  sequenceLength: number,
  visibleBases: number,
) {
  const annealLength = Math.max(1, annealRange.end - annealRange.start)
  const rangeWithPadding = (padding: number) => ({
    start: Math.max(0, annealRange.start - padding),
    end: Math.min(sequenceLength, annealRange.end + padding),
  })
  const gutters = (range: { start: number; end: number }) => {
    if (!display) return { left: 0, right: 0 }
    const bounds = { left: 0, right: range.end - range.start, top: 0, bottom: 0, labelX: 0, labelY: 0 }
    const positions = display.glyphs.flatMap((glyph, index) => {
      if (glyph.kind === 'template-gap' || !primerGlyphVisibleInRow(display, glyph, index, range.start, range.end)) return []
      return [glyph.templateIndex === undefined
        ? primerGlyphX(display, glyph, index, range.start, 0, 1, bounds)
        : templateX(glyph.templateIndex, range.start, 0, 1)]
    })
    if (!positions.length) return { left: 0, right: 0 }
    // One extra cell covers frame edges and the arrow flap.
    return {
      left: Math.max(0, Math.ceil(1.5 - Math.min(...positions))),
      right: Math.max(0, Math.ceil(Math.max(...positions) + 1.5 - (range.end - range.start))),
    }
  }
  const initialPadding = Math.max(0, Math.min(120, Math.floor((visibleBases - annealLength) / 2)))
  const initialGutters = gutters(rangeWithPadding(initialPadding))
  const padding = Math.max(0, Math.min(120, Math.floor((visibleBases - annealLength - initialGutters.left - initialGutters.right) / 2)))
  const range = rangeWithPadding(padding)
  return { range, ...gutters(range) }
}
