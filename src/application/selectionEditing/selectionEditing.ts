export type SelectionRange = { start: number; end: number }

export type StrandPairRangeSelection = { forward: SelectionRange; reverse: SelectionRange }

export type CaretDeletionPlan = {
  start: number
  end: number
  nextRange: SelectionRange
}

export type HistoryTransition<T> = {
  snapshot: T
  nextUndo: T[]
  nextRedo: T[]
}

export function clampSelectionRange(
  range: SelectionRange,
  sequenceLength: number,
  options: { collapsed?: boolean } = {},
): SelectionRange {
  const length = Math.max(0, sequenceLength)
  const maxStart = options.collapsed ? length : Math.max(0, length - 1)
  const start = Math.max(0, Math.min(maxStart, range.start))
  let end = Math.max(0, Math.min(length, range.end))
  if (!options.collapsed && end === start) end = Math.min(length, start + 1)
  return { start, end }
}

export function selectionRangeFromOneBased(
  startOneBased: number,
  endOneBased: number,
  sequenceLength: number,
): SelectionRange | null {
  if (sequenceLength <= 0) return null
  return {
    start: Math.max(0, Math.min(sequenceLength, startOneBased - 1)),
    end: Math.max(0, Math.min(sequenceLength, endOneBased)),
  }
}

export function directionalSelectionSpan(
  fromStart: number,
  toEnd: number,
  topology: 'linear' | 'circular',
): SelectionRange {
  if (topology === 'circular') return { start: fromStart, end: toEnd }
  return { start: Math.min(fromStart, toEnd), end: Math.max(fromStart, toEnd) }
}

export function invertSelectionRange(range: SelectionRange, sequenceLength: number): SelectionRange {
  return { start: range.end % sequenceLength, end: range.start }
}

export function invertStrandPairSelection(
  selection: StrandPairRangeSelection,
  sequenceLength: number,
): StrandPairRangeSelection {
  return {
    forward: invertSelectionRange(selection.forward, sequenceLength),
    reverse: invertSelectionRange(selection.reverse, sequenceLength),
  }
}

export function transformSequenceCase(
  sequence: string,
  range: SelectionRange,
  toUpperCase: boolean,
): string {
  const transform = (segment: string) => toUpperCase ? segment.toUpperCase() : segment.toLowerCase()
  if (range.start <= range.end) {
    return sequence.slice(0, range.start) + transform(sequence.slice(range.start, range.end)) + sequence.slice(range.end)
  }
  return transform(sequence.slice(0, range.end))
    + sequence.slice(range.end, range.start)
    + transform(sequence.slice(range.start))
}

export function planCaretDeletion(
  caret: number,
  sequenceLength: number,
  backspace: boolean,
): CaretDeletionPlan | null {
  if (backspace) {
    if (caret === 0) return null
    return { start: caret - 1, end: caret, nextRange: { start: caret - 1, end: caret - 1 } }
  }
  if (caret >= sequenceLength) return null
  return { start: caret, end: caret + 1, nextRange: { start: caret, end: caret } }
}

export function replaceSequenceRange(
  sequence: string,
  start: number,
  end: number,
  insert: string,
): string {
  return sequence.slice(0, start) + insert + sequence.slice(end)
}

export function undoTransition<T>(
  undoStack: readonly T[],
  redoStack: readonly T[],
  current: T,
): HistoryTransition<T> | null {
  const snapshot = undoStack[undoStack.length - 1]
  if (snapshot === undefined) return null
  return {
    snapshot,
    nextUndo: undoStack.slice(0, -1),
    nextRedo: [...redoStack, current],
  }
}

export function redoTransition<T>(
  undoStack: readonly T[],
  redoStack: readonly T[],
  current: T,
): HistoryTransition<T> | null {
  const snapshot = redoStack[redoStack.length - 1]
  if (snapshot === undefined) return null
  return {
    snapshot,
    nextUndo: [...undoStack, current],
    nextRedo: redoStack.slice(0, -1),
  }
}
