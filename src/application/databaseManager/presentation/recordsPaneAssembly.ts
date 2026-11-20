import type { DatabaseBrowseMode } from '../browsePresentation'
import type { DatabaseViewMode } from '../browsePresentation'
import {
  buildDatabaseManagerBuiltinEmptyMessage,
  buildDatabaseManagerFilesEmptyState,
  buildDatabaseManagerPaginationModel,
  buildDatabaseManagerPrimersEmptyState,
  buildDatabaseManagerProteinsEmptyState,
} from './recordsModel'
import {
  buildAppDatabaseManagerFilesPickChromeSlice,
} from './recordsFilePickModel'
import type {
  DatabaseManagerConstructPickContext,
  DatabaseManagerLibraryMemberPickContext,
} from './pickContext'

export type DatabaseManagerRecordsPaneAssemblyInput = {
  viewMode: DatabaseViewMode
  browse: DatabaseBrowseMode
  searching?: boolean
  constructPick: DatabaseManagerConstructPickContext | null
  libraryMemberPick: DatabaseManagerLibraryMemberPickContext | null
  primerScanBusy: boolean
  primerHitCount: number
  visiblePrimerCount: number
  proteinScanBusy: boolean
  proteinHitCount: number
  visibleProteinCount: number
  visibleBuiltInCount: number
  projectPageLoading: boolean
  visibleProjectCount: number
  paginationTotal: number
  paginationPage: number
  pageSize: number
  primers: {
    rows: unknown
    tableWidth: number
    viewportWidth: number
    checkColWidth: number
    columnOrder: unknown
    columnWidths: unknown
    sortColumn: unknown
    sortDirection: unknown
    selection: { allVisibleSelected: boolean; someVisibleSelected: boolean }
    selectedKeys: string[]
    columnReorder: { dragColumnId: string | null; dropTargetId: string | null }
  }
  proteins: {
    rows: unknown
    tableWidth: number
    viewportWidth: number
    checkColWidth: number
    columnOrder: unknown
    columnWidths: unknown
    sortColumn: unknown
    sortDirection: unknown
    selection: { allVisibleSelected: boolean; someVisibleSelected: boolean }
    selectedKeys: string[]
    columnReorder: { dragColumnId: string | null; dropTargetId: string | null }
  }
  builtin: { rows: unknown }
  files: {
    rows: unknown
    tableWidth: number
    viewportWidth: number
    checkColWidth: number
    columnOrder: unknown
    columnWidths: unknown
    sortColumn: unknown
    sortDirection: unknown
    selection: { allVisibleSelected: boolean; someVisibleSelected: boolean }
    selectedIds: string[]
    columnReorder: { dragColumnId: string | null; dropTargetId: string | null }
  }
}

export function assembleDatabaseManagerRecordsPaneModels(input: DatabaseManagerRecordsPaneAssemblyInput) {
  const filesPickChrome = buildAppDatabaseManagerFilesPickChromeSlice({
    constructPick: input.constructPick,
    libraryMemberPick: input.libraryMemberPick,
  })
  return {
    viewMode: input.viewMode,
    browseKind: input.browse.kind === 'builtin' ? ('builtin' as const) : ('files' as const),
    primersModel: {
      empty: input.searching && !input.primerScanBusy && input.visiblePrimerCount === 0 ? { kind: 'empty' as const, message: 'No matching primers.' } : buildDatabaseManagerPrimersEmptyState({
        primerScanBusy: input.primerScanBusy,
        primerHitCount: input.primerHitCount,
        visiblePrimerCount: input.visiblePrimerCount,
        browse: input.browse,
      }),
      rows: input.primers.rows,
      tableWidth: input.primers.tableWidth,
      viewportWidth: input.primers.viewportWidth,
      checkColWidth: input.primers.checkColWidth,
      columnOrder: input.primers.columnOrder,
      columnWidths: input.primers.columnWidths,
      sortColumn: input.primers.sortColumn,
      sortDirection: input.primers.sortDirection,
      selection: input.primers.selection,
      selectedKeys: input.primers.selectedKeys,
      columnReorder: input.primers.columnReorder,
    },
    proteinsModel: {
      empty: input.searching && !input.proteinScanBusy && input.visibleProteinCount === 0 ? { kind: 'empty' as const, message: 'No matching translated CDSes.' } : buildDatabaseManagerProteinsEmptyState({
        proteinScanBusy: input.proteinScanBusy,
        proteinHitCount: input.proteinHitCount,
        visibleProteinCount: input.visibleProteinCount,
      }),
      rows: input.proteins.rows,
      tableWidth: input.proteins.tableWidth,
      viewportWidth: input.proteins.viewportWidth,
      checkColWidth: input.proteins.checkColWidth,
      columnOrder: input.proteins.columnOrder,
      columnWidths: input.proteins.columnWidths,
      sortColumn: input.proteins.sortColumn,
      sortDirection: input.proteins.sortDirection,
      selection: input.proteins.selection,
      selectedKeys: input.proteins.selectedKeys,
      columnReorder: input.proteins.columnReorder,
    },
    builtinModel: {
      emptyMessage: input.searching && input.visibleBuiltInCount === 0 ? 'No matching built-in plasmids.' : buildDatabaseManagerBuiltinEmptyMessage(input.visibleBuiltInCount),
      rows: input.builtin.rows,
    },
    filesModel: {
      empty: input.searching && !input.projectPageLoading && input.paginationTotal === 0 ? { kind: 'empty' as const, message: 'No matching files.' } : buildDatabaseManagerFilesEmptyState({
        projectPageLoading: input.projectPageLoading,
        visibleProjectCount: input.visibleProjectCount,
        paginationTotal: input.paginationTotal,
      }),
      rows: input.files.rows,
      tableWidth: input.files.tableWidth,
      viewportWidth: input.files.viewportWidth,
      checkColWidth: input.files.checkColWidth,
      columnOrder: input.files.columnOrder,
      columnWidths: input.files.columnWidths,
      sortColumn: input.files.sortColumn,
      sortDirection: input.files.sortDirection,
      selection: input.files.selection,
      selectedIds: input.files.selectedIds,
      columnReorder: input.files.columnReorder,
      pickRowToggleMode: filesPickChrome.pickRowToggleMode,
      fileCheckboxReplaceSelection: filesPickChrome.fileCheckboxReplaceSelection,
      showHeaderSelectAll: filesPickChrome.showHeaderSelectAll,
    },
    paginationModel: buildDatabaseManagerPaginationModel({
      total: input.paginationTotal,
      requestedPage: input.paginationPage,
      pageSize: input.pageSize,
    }),
  }
}
