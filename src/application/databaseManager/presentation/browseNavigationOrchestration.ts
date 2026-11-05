import type { DatabaseBrowseMode } from '../browsePresentation'

/** Side effects applied when the user picks a sidebar or tag browse target. */
export type DatabaseManagerBrowseNavigationEffect = {
  browse: DatabaseBrowseMode
  clearSelection: true
}

export function databaseManagerBrowseNavigationEffect(
  browse: DatabaseBrowseMode,
): DatabaseManagerBrowseNavigationEffect {
  return { browse, clearSelection: true }
}
