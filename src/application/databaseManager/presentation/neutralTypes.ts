import type { DatabaseBrowseMode, DatabaseViewMode } from '../browsePresentation'

export type { DatabaseBrowseMode, DatabaseViewMode }

/** Minimal construct row for pick/toolbar derivation without storage project types. */
export type DatabaseManagerConstructSelectionRow = {
  id: string
  name: string
  eligible: boolean
}

export type DatabaseManagerTableEmptyState =
  | { kind: 'loading'; message: string }
  | { kind: 'empty'; message: string; hint?: string }

export type DatabaseManagerPaginationWindow = {
  page: number
  pageCount: number
  start: number
  end: number
}

export type DatabaseManagerPaginationModel = DatabaseManagerPaginationWindow & {
  total: number
  pageSize: number
  visible: boolean
}
