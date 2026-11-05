export type DatabaseManagerFolderLink = {
  id: string
  parentId: string | null
}

export function folderAncestorIds(
  folders: readonly DatabaseManagerFolderLink[],
  folderId: string | null,
): string[] {
  if (!folderId) return []
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const ancestors: string[] = []
  let cursor: string | null | undefined = folderId
  const guard = new Set<string>()
  while (cursor && !guard.has(cursor)) {
    guard.add(cursor)
    const folder = byId.get(cursor)
    if (!folder) break
    if (folder.parentId) ancestors.push(folder.parentId)
    cursor = folder.parentId
  }
  return ancestors
}

export function addFolderAncestors(
  expandedFolderIds: Set<string>,
  folders: readonly DatabaseManagerFolderLink[],
  folderId: string,
): Set<string> {
  const next = new Set(expandedFolderIds)
  let changed = false
  for (const id of folderAncestorIds(folders, folderId)) {
    if (next.has(id)) continue
    next.add(id)
    changed = true
  }
  return changed ? next : expandedFolderIds
}
