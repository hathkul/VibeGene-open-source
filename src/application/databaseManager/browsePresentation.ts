import { builtInGroupTitle, type BuiltInPlasmidGroupId } from '../../domain/builtInPlasmids'

export type DatabaseBrowseMode =
  | { kind: 'all' }
  | { kind: 'unfiled' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'builtin'; group: BuiltInPlasmidGroupId }
  | { kind: 'common' }

export type DatabaseViewMode = 'dna' | 'primers' | 'proteins' | 'cdses'

export function browseLocationLabel(
  browse: DatabaseBrowseMode,
  resolveFolderPathLabel: (folderId: string) => string,
): string {
  if (browse.kind === 'all') return 'All DNA'
  if (browse.kind === 'unfiled') return 'Unfiled'
  if (browse.kind === 'tag') return browse.tag
  if (browse.kind === 'common') return 'Common primers'
  if (browse.kind === 'builtin') return builtInGroupTitle(browse.group)
  return resolveFolderPathLabel(browse.folderId)
}

export function allBrowseLabel(viewMode: DatabaseViewMode): string {
  if (viewMode === 'primers') return 'All primers'
  if (viewMode === 'proteins') return 'All proteins'
  if (viewMode === 'cdses') return 'All CDSes'
  return 'All DNA'
}

export function databaseWindowTitle(
  browse: DatabaseBrowseMode,
  resolveFolderPathLabel: (folderId: string) => string,
  itemCount: number,
  selectedCount: number,
  viewMode: DatabaseViewMode,
  activityStatus?: string | null,
): string {
  const trimmed = activityStatus?.trim()
  if (trimmed) return `${trimmed} — Database`
  const location = browseLocationLabel(browse, resolveFolderPathLabel)
  const locationLabel =
    browse.kind === 'all'
      ? allBrowseLabel(viewMode)
      : viewMode === 'primers' && browse.kind === 'common'
        ? 'Common primers'
        : location
  const selection = selectedCount > 0 ? ` · ${selectedCount} selected` : ''
  return `${locationLabel} (${itemCount})${selection} — Database`
}
