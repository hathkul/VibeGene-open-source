export type SortDirection = 'asc' | 'desc'

export function nextSortState<T extends string>(
  currentMode: T,
  currentDirection: SortDirection,
  nextMode: T,
  newModeDirection: SortDirection = 'asc',
): { mode: T; direction: SortDirection } {
  return currentMode === nextMode
    ? { mode: currentMode, direction: currentDirection === 'asc' ? 'desc' : 'asc' }
    : { mode: nextMode, direction: newModeDirection }
}

export function paneRangeIds<T>(rowIds: readonly T[], anchor: T | null, clicked: T): T[] | null {
  const clickedIndex = rowIds.indexOf(clicked)
  const anchorIndex = anchor === null ? -1 : rowIds.indexOf(anchor)
  if (clickedIndex < 0 || anchorIndex < 0) return null
  const [lo, hi] = anchorIndex < clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex]
  return rowIds.slice(lo, hi + 1)
}
