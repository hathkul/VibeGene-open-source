import {
  allBrowseLabel,
  browseLocationLabel,
  databaseWindowTitle,
  type DatabaseBrowseMode,
  type DatabaseViewMode,
} from '../browsePresentation'
import type { DatabaseManagerConstructPickContext, DatabaseManagerLibraryMemberPickContext } from './pickContext'

export type AppDatabaseManagerHeaderModelInput = {
  constructPick: DatabaseManagerConstructPickContext | null
  libraryMemberPick: DatabaseManagerLibraryMemberPickContext | null
  browse: DatabaseBrowseMode
  resolveFolderPathLabel: (folderId: string) => string
  viewMode: DatabaseViewMode
  itemCount: number
  selectedCount: number
  busy: boolean
  headerStatus: string | null
}

export type AppDatabaseManagerHeaderActivity = {
  visible: boolean
  label: string | null
  title: string | null
  isBusy: boolean
}

export type AppDatabaseManagerHeaderPresentationSlice = {
  title: string
  browsePathLabel: string
  contextAllLabel: string | null
  contextUnfiledLabel: 'Unfiled' | null
  contextCommonPrimersLabel: 'Common primers' | null
  contextTag: string | null
  contextFolderPathLabel: string | null
  contextBuiltinGroupTitle: string | null
  itemCount: number
  selectedCount: number
  busy: boolean
  headerStatus: string | null
  activity: AppDatabaseManagerHeaderActivity
  nativeWindowTitle: string
}

export function databaseManagerHeaderTitle(
  constructPick: DatabaseManagerConstructPickContext | null,
  libraryMemberPick: DatabaseManagerLibraryMemberPickContext | null,
): string {
  if (constructPick) {
    return (
      constructPick.title
      ?? `Choose construct${constructPick.multiple ? 's' : ''} from Database`
    )
  }
  if (libraryMemberPick) {
    return libraryMemberPick.purpose === 'convert'
      ? 'Convert to library from Database'
      : 'Choose members from Database'
  }
  return 'Database'
}

export function databaseManagerHeaderItemCount(input: {
  viewMode: DatabaseViewMode
  browse: DatabaseBrowseMode
  visiblePrimerCount: number
  visibleProteinCount: number
  visibleBuiltInCount: number
  paginationTotal: number
}): number {
  if (input.viewMode === 'primers') return input.visiblePrimerCount
  if (input.viewMode === 'cdses') return input.visibleProteinCount
  if (input.browse.kind === 'builtin') return input.visibleBuiltInCount
  return input.paginationTotal
}

export function databaseManagerHeaderSelectedCount(input: {
  viewMode: DatabaseViewMode
  selectedPrimerCount: number
  selectedProteinCount: number
  selectedProjectCount: number
}): number {
  if (input.viewMode === 'primers') return input.selectedPrimerCount
  if (input.viewMode === 'cdses') return input.selectedProteinCount
  return input.selectedProjectCount
}

export function buildAppDatabaseManagerHeaderActivity(input: {
  busy: boolean
  headerStatus: string | null
}): AppDatabaseManagerHeaderActivity {
  const visible = input.busy || Boolean(input.headerStatus)
  if (!visible) {
    return { visible: false, label: null, title: null, isBusy: input.busy }
  }
  const label = input.headerStatus ?? 'Working...'
  return {
    visible: true,
    label,
    title: input.headerStatus ?? 'Working...',
    isBusy: input.busy,
  }
}

export function buildAppDatabaseManagerHeaderPresentationSlice(
  input: AppDatabaseManagerHeaderModelInput,
): AppDatabaseManagerHeaderPresentationSlice {
  const browsePathLabel =
    input.browse.kind === 'folder'
      ? input.resolveFolderPathLabel(input.browse.folderId)
      : browseLocationLabel(input.browse, input.resolveFolderPathLabel)

  return {
    title: databaseManagerHeaderTitle(input.constructPick, input.libraryMemberPick),
    browsePathLabel,
    contextAllLabel: input.browse.kind === 'all' ? allBrowseLabel(input.viewMode) : null,
    contextUnfiledLabel: input.browse.kind === 'unfiled' ? 'Unfiled' : null,
    contextCommonPrimersLabel: input.browse.kind === 'common' ? 'Common primers' : null,
    contextTag: input.browse.kind === 'tag' ? input.browse.tag : null,
    contextFolderPathLabel: input.browse.kind === 'folder' ? browsePathLabel : null,
    contextBuiltinGroupTitle:
      input.browse.kind === 'builtin'
        ? browseLocationLabel(input.browse, input.resolveFolderPathLabel)
        : null,
    itemCount: input.itemCount,
    selectedCount: input.selectedCount,
    busy: input.busy,
    headerStatus: input.headerStatus,
    activity: buildAppDatabaseManagerHeaderActivity({
      busy: input.busy,
      headerStatus: input.headerStatus,
    }),
    nativeWindowTitle: databaseWindowTitle(
      input.browse,
      input.resolveFolderPathLabel,
      input.itemCount,
      input.selectedCount,
      input.viewMode,
      input.headerStatus,
    ),
  }
}
