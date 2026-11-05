import type { PrimerFrameDisplay } from '../../domain/primerSequenceLayout'
import type { TraceTemplateAlignment } from '../../domain/traceTypes'

/**
 * Keep all displays for fallback rendering, but only calculate sites wholly observed by
 * the trace. Trace insertions have no reference base in the derived template sequence, so
 * a site spanning one must also stay on its existing alignment-derived fallback.
 */
export function tracePrimerDisplaysEligibleForRefinement(
  displays: PrimerFrameDisplay[],
  alignment: TraceTemplateAlignment,
): PrimerFrameDisplay[] {
  const insertionAnchors = alignment.columns.flatMap((column, index) => {
    if (column.kind !== 'traceInsert') return []
    let previous: number | undefined
    let next: number | undefined
    for (let cursor = index - 1; cursor >= 0 && previous === undefined; cursor -= 1) {
      const candidate = alignment.columns[cursor]!
      if (candidate.kind !== 'traceInsert') previous = candidate.templateIndex
    }
    for (let cursor = index + 1; cursor < alignment.columns.length && next === undefined; cursor += 1) {
      const candidate = alignment.columns[cursor]!
      if (candidate.kind !== 'traceInsert') next = candidate.templateIndex
    }
    if (previous !== undefined && next !== undefined) return [Math.min(previous, next)]
    if (previous !== undefined) return [previous]
    return next === undefined ? [] : [next]
  })

  return displays.filter((display) => {
    const { start, end } = display.selectRange
    if (start >= end || start < alignment.templateStart || end > alignment.templateEnd) return false
    return !insertionAnchors.some((anchor) => anchor >= start && anchor < end)
  })
}
