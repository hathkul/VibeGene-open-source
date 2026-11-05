import type { TraceTemplateAlignment } from './traceTypes'
import { buildAlignmentDisplayColumns, traceBaseForColumn } from './traceDisplay'

export type TraceOrdinalRange = { start: number; end: number }

/** Trace calls in visual alignment order, including insertions and excluding deletions. */
export function selectedAlignedTraceSequence(
  alignment: TraceTemplateAlignment,
  baseCalls: string[],
  firstTraceIndex: number,
  lastTraceIndex: number,
): string {
  const low = Math.min(firstTraceIndex, lastTraceIndex)
  const high = Math.max(firstTraceIndex, lastTraceIndex)
  return buildAlignmentDisplayColumns(alignment)
    .filter((column) => column.kind !== 'deletion' && column.traceIndex >= low && column.traceIndex <= high)
    .map((column) => traceBaseForColumn(column, baseCalls, alignment.orientation))
    .join('')
}

/**
 * Stored call indices (positions in `trace.sequence` / `alignment.traceIndex` space)
 * whose template columns fall inside a template-coordinate span.
 *
 * The alignment already stores one column per template base with its `traceIndex`,
 * so this is a projection of existing columns, not a second alignment.
 */
export function traceStoredIndicesForTemplateRange(
  alignment: TraceTemplateAlignment | null,
  templateStart: number,
  templateEnd: number,
): number[] {
  if (!alignment) return []
  const low = Math.min(templateStart, templateEnd)
  const high = Math.max(templateStart, templateEnd)
  const indices: number[] = []
  for (const column of alignment.columns) {
    if (column.kind !== 'match') continue
    if (column.templateIndex < low || column.templateIndex >= high) continue
    indices.push(column.traceIndex)
  }
  return indices
}

/** Ordinal of one stored call in the viewer's displayed sequence for `direction`. */
export function displayedTraceOrdinal(
  storedOrdinal: number,
  traceLength: number,
  direction: 'forward' | 'reverse',
): number {
  return direction === 'reverse' ? Math.max(0, traceLength - 1 - storedOrdinal) : storedOrdinal
}

/**
 * Direction that shows the aligned read running left-to-right with the template:
 * a read stored forward displays forward; a read aligned as a reverse complement
 * displays reversed so its bases read in template order.
 */
export function initialDirectionForAlignment(
  alignment: TraceTemplateAlignment | null,
): 'forward' | 'reverse' {
  return alignment?.orientation === 'reverse' ? 'reverse' : 'forward'
}

/**
 * Contiguous displayed-ordinal selection for an aligned trace opened at a
 * template span. Combines projection and orientation mirroring so callers cannot
 * pair them inconsistently. Gaps and insertions inside the span widen the
 * selection to the covering range, which is what a single selection highlight
 * can show.
 */
export function displayedTraceSelectionForTemplateRange(
  alignment: TraceTemplateAlignment | null,
  traceLength: number,
  templateStart: number,
  templateEnd: number,
): { direction: 'forward' | 'reverse'; selection: TraceOrdinalRange } | null {
  const stored = traceStoredIndicesForTemplateRange(alignment, templateStart, templateEnd)
  if (!stored.length || traceLength <= 0) return null
  const direction = initialDirectionForAlignment(alignment)
  const displayed = stored.map((index) => displayedTraceOrdinal(index, traceLength, direction))
  const start = Math.min(...displayed)
  const end = Math.max(...displayed)
  if (start >= traceLength || end < 0) return null
  return {
    direction,
    selection: {
      start: Math.max(0, start),
      end: Math.min(traceLength - 1, end),
    },
  }
}

/**
 * Template-coordinate span that should seed the Trace Viewer, or null when the
 * workspace selection is not in template coordinates.
 *
 * `selectedRange` is template-coordinate whenever alignments are shown; it only
 * becomes member-native in library browse mode (alignments hidden with a focused
 * member), which is the same condition sequence edits use to pick a coordinate
 * space. Dropping the span whenever a trace is focused would discard exactly the
 * selection this handoff exists to carry.
 */
export function traceInspectorTemplateRange(input: {
  selectedRange: TraceOrdinalRange | null
  alignmentsVisible: boolean
  recordIsDnaLibrary: boolean
  focusedTraceId: string | null
}): TraceOrdinalRange | null {
  if (!input.selectedRange) return null
  const memberNative = !input.alignmentsVisible && input.recordIsDnaLibrary && Boolean(input.focusedTraceId)
  return memberNative ? null : input.selectedRange
}
