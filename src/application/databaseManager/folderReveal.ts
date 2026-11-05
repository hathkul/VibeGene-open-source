type FolderNode = { id: string; parentId?: string | null }

export function revealedFolderIds(
  folders: readonly FolderNode[],
  expandedIds: ReadonlySet<string>,
  revealFolderId: string | null | undefined,
  excludedIds?: ReadonlySet<string>,
): Set<string> {
  if (!revealFolderId || excludedIds?.has(revealFolderId)) return new Set(expandedIds)
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const next = new Set(expandedIds)
  const visited = new Set<string>()
  let cursor: string | null | undefined = revealFolderId
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor)
    if (!excludedIds?.has(cursor)) next.add(cursor)
    cursor = byId.get(cursor)?.parentId
  }
  return next
}
