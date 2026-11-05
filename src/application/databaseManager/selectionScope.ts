type RequestPick = { requestId: string } | null | undefined
type TargetPick = { targetRecordId: string } | null | undefined

export function databaseManagerPickSelectionScope(
  constructPick: RequestPick,
  libraryMemberPick: TargetPick,
  alignmentPick: TargetPick,
): string | null {
  if (constructPick) return `construct:${constructPick.requestId}`
  if (libraryMemberPick) return `library:${libraryMemberPick.targetRecordId}`
  if (alignmentPick) return `alignment:${alignmentPick.targetRecordId}`
  return null
}

export function databaseManagerSelectionIsCurrent(
  activeScope: string | null,
  selectedScope: string | null,
): boolean {
  return activeScope === null || activeScope === selectedScope
}

export function filterDatabaseManagerSelection(
  selectedIds: readonly string[],
  visibleIds: readonly string[],
  activeScope: string | null,
  selectedScope: string | null,
): string[] {
  if (!databaseManagerSelectionIsCurrent(activeScope, selectedScope)) return []
  const visible = new Set(visibleIds)
  return selectedIds.filter((id) => visible.has(id))
}
