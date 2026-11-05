export type TableSelectionModifierEvent = {
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}

export type TableRangeSelectionInput = {
  rowId: string
  anchorId: string | null
  visibleRowIds: readonly string[]
  event: TableSelectionModifierEvent
}

export type TableRangeSelectionResult =
  | { kind: 'range'; selectedIds: string[] }
  | { kind: 'toggle'; selectedIds: string[]; anchorId: string }
  | { kind: 'single'; selectedIds: string[]; anchorId: string }
  | { kind: 'noop' }

export function planTableRangeSelection(input: TableRangeSelectionInput): TableRangeSelectionResult {
  const { rowId, anchorId, visibleRowIds, event } = input
  if (event.shiftKey && anchorId) {
    const start = visibleRowIds.indexOf(anchorId)
    const end = visibleRowIds.indexOf(rowId)
    if (start >= 0 && end >= 0) {
      const [lo, hi] = start < end ? [start, end] : [end, start]
      return { kind: 'range', selectedIds: visibleRowIds.slice(lo, hi + 1) as string[] }
    }
  }
  if (event.metaKey || event.ctrlKey) {
    return { kind: 'toggle', selectedIds: [rowId], anchorId: rowId }
  }
  return { kind: 'single', selectedIds: [rowId], anchorId: rowId }
}

export function applyToggleToSelection(current: readonly string[], rowId: string): string[] {
  return current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]
}

export function planConstructSinglePickSelection(projectId: string): TableRangeSelectionResult {
  return { kind: 'single', selectedIds: [projectId], anchorId: projectId }
}
