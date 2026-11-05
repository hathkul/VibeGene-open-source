import type { DatabaseBrowseMode } from '../../application/databaseManager/browsePresentation'
import type { DbSortDirection, DatabaseManagerFileColumnId, DatabaseManagerPrimerColumnId, DatabaseManagerProteinColumnId, DatabaseManagerViewMode } from './types'

export type DatabaseManagerBrowseState = DatabaseBrowseMode

export type DatabaseManagerPrimerTableRow = {
  key: string
  name: string
  sequence: string
  color: string
  fileLabel: string
  fileTitle: string
  tags: string[]
}

export type DatabaseManagerProteinTableRow = {
  key: string
  name: string
  sequence: string
  color: string
  massLabel: string
  product: string
  fileLabel: string
  fileTitle: string
}

export type DatabaseManagerBuiltInTableRow = {
  id: string
  label: string
  kindLabel: string
  length: number
}

export type DatabaseManagerLibraryMemberRow = {
  id: string
  fileName: string
  parentFileName: string
  sequenceLengthLabel: string
  parseError?: string
  enabled: boolean
  openDisabled: boolean
  openTitle: string
}

export type DatabaseManagerProjectTableRow = {
  id: string
  fileName: string
  showConstructName: boolean
  constructName: string
  formatLabel: string
  folderLabel: string
  tags: string[]
  updatedLabel: string
  sequenceLengthLabel: string
  fileSizeLabel: string
  isCurrent: boolean
  isLibrary: boolean
  libraryExpanded: boolean
  libraryMembersLoading: boolean
  libraryMembers: DatabaseManagerLibraryMemberRow[] | null
  selected: boolean
  rowActionLabel: string
  rowActionDisabled: boolean
}

export type DatabaseManagerFileSortColumn = Exclude<DatabaseManagerFileColumnId, 'actions'>
export type DatabaseManagerPrimerSortColumn = Exclude<DatabaseManagerPrimerColumnId, 'actions'>
export type DatabaseManagerProteinSortColumn = Exclude<DatabaseManagerProteinColumnId, 'actions'>

export type DatabaseManagerColumnReorderState = {
  dragColumnId: string | null
  dropTargetId: string | null
}

export type DatabaseManagerSelectionSummary = {
  allVisibleSelected: boolean
  someVisibleSelected: boolean
}

export type DatabaseManagerPaginationModel = {
  total: number
  page: number
  pageCount: number
  start: number
  end: number
  pageSize: number
}

export type DatabaseManagerTableEmptyState =
  | { kind: 'loading'; message: string }
  | { kind: 'empty'; message: string; hint?: string }

export type DatabaseManagerPrimersPaneModel = {
  empty: DatabaseManagerTableEmptyState | null
  rows: DatabaseManagerPrimerTableRow[]
  tableWidth: number
  viewportWidth: number
  checkColWidth: number
  columnOrder: DatabaseManagerPrimerColumnId[]
  columnWidths: Record<DatabaseManagerPrimerColumnId, number>
  sortColumn: DatabaseManagerPrimerSortColumn
  sortDirection: DbSortDirection
  selection: DatabaseManagerSelectionSummary
  selectedKeys: string[]
  columnReorder: DatabaseManagerColumnReorderState
}

export type DatabaseManagerProteinsPaneModel = {
  empty: DatabaseManagerTableEmptyState | null
  rows: DatabaseManagerProteinTableRow[]
  tableWidth: number
  viewportWidth: number
  checkColWidth: number
  columnOrder: DatabaseManagerProteinColumnId[]
  columnWidths: Record<DatabaseManagerProteinColumnId, number>
  sortColumn: DatabaseManagerProteinSortColumn
  sortDirection: DbSortDirection
  selection: DatabaseManagerSelectionSummary
  selectedKeys: string[]
  columnReorder: DatabaseManagerColumnReorderState
}

export type DatabaseManagerBuiltInPaneModel = {
  emptyMessage: string | null
  rows: DatabaseManagerBuiltInTableRow[]
}

export type DatabaseManagerFilesPaneModel = {
  empty: DatabaseManagerTableEmptyState | null
  rows: DatabaseManagerProjectTableRow[]
  tableWidth: number
  viewportWidth: number
  checkColWidth: number
  columnOrder: DatabaseManagerFileColumnId[]
  columnWidths: Record<DatabaseManagerFileColumnId, number>
  sortColumn: DatabaseManagerFileSortColumn
  sortDirection: DbSortDirection
  selection: DatabaseManagerSelectionSummary
  selectedIds: string[]
  columnReorder: DatabaseManagerColumnReorderState
  /** Row primary action toggles pick membership (multi construct / library member). */
  pickRowToggleMode: boolean
  /** Single-select construct pick: checkbox replaces selection instead of accumulating. */
  fileCheckboxReplaceSelection: boolean
  showHeaderSelectAll: boolean
}

export type { DatabaseManagerViewMode }
