import { allBrowseLabel, type DatabaseBrowseMode, type DatabaseViewMode } from '../browsePresentation'

export type AppDatabaseManagerSidebarChromeInput = {
  viewMode: DatabaseViewMode
  browse: DatabaseBrowseMode
  selectedProjectCount: number
  sidebarTagCount: number
  busy: boolean
}

export type AppDatabaseManagerSidebarChromeSlice = {
  foldersHeading: 'Folders'
  allBrowseLabel: string
  unfiledLabel: 'Unfiled'
  newFolderTitle: string
  newFolderAriaLabel: string
  newFolderDisabled: boolean
  builtinSection: {
    heading: 'Built-in'
    allBuiltinLabel: 'All built-in plasmids'
    visible: boolean
  }
  librarySection: {
    heading: 'Library'
    commonPrimersLabel: 'Common primers'
    visible: boolean
  }
  tagsSection: {
    heading: string
    emptyMessage: string
    visible: boolean
    showEmptyMessage: boolean
  }
}

export function databaseManagerSidebarNewFolderTitle(selectedProjectCount: number): string {
  if (selectedProjectCount <= 0) return 'New folder'
  return `New folder with ${selectedProjectCount} selected file${selectedProjectCount === 1 ? '' : 's'}`
}

export function databaseManagerSidebarNewFolderAriaLabel(selectedProjectCount: number): string {
  if (selectedProjectCount <= 0) return 'New folder'
  return `New folder with ${selectedProjectCount} selected files`
}

export function databaseManagerSidebarTagsHeading(viewMode: DatabaseViewMode): string {
  return viewMode === 'primers' ? 'Primer tags' : 'Tags'
}

export function databaseManagerSidebarTagsEmptyMessage(viewMode: DatabaseViewMode): string {
  return viewMode === 'primers' ? 'No primer tags yet.' : 'No tags yet.'
}

export function buildAppDatabaseManagerSidebarChromeSlice(
  input: AppDatabaseManagerSidebarChromeInput,
): AppDatabaseManagerSidebarChromeSlice {
  const tagsVisible = input.viewMode !== 'cdses'
  return {
    foldersHeading: 'Folders',
    allBrowseLabel: allBrowseLabel(input.viewMode),
    unfiledLabel: 'Unfiled',
    newFolderTitle: databaseManagerSidebarNewFolderTitle(input.selectedProjectCount),
    newFolderAriaLabel: databaseManagerSidebarNewFolderAriaLabel(input.selectedProjectCount),
    newFolderDisabled: input.busy,
    builtinSection: {
      heading: 'Built-in',
      allBuiltinLabel: 'All built-in plasmids',
      visible: input.viewMode === 'dna',
    },
    librarySection: {
      heading: 'Library',
      commonPrimersLabel: 'Common primers',
      visible: input.viewMode === 'primers',
    },
    tagsSection: {
      heading: databaseManagerSidebarTagsHeading(input.viewMode),
      emptyMessage: databaseManagerSidebarTagsEmptyMessage(input.viewMode),
      visible: tagsVisible,
      showEmptyMessage: tagsVisible && input.sidebarTagCount === 0,
    },
  }
}
