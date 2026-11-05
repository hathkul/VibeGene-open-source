import type {
  DatabaseManagerConstructPickContext,
  DatabaseManagerLibraryMemberPickContext,
} from './pickContext'

export type AppDatabaseManagerFilesPickChromeInput = {
  constructPick: DatabaseManagerConstructPickContext | null
  libraryMemberPick: DatabaseManagerLibraryMemberPickContext | null
}

export type AppDatabaseManagerFilesPickChromeSlice = {
  pickRowToggleMode: boolean
  fileCheckboxReplaceSelection: boolean
  showHeaderSelectAll: boolean
}

export function buildAppDatabaseManagerFilesPickChromeSlice(
  input: AppDatabaseManagerFilesPickChromeInput,
): AppDatabaseManagerFilesPickChromeSlice {
  const { constructPick, libraryMemberPick } = input
  return {
    pickRowToggleMode: Boolean(constructPick?.multiple || libraryMemberPick),
    fileCheckboxReplaceSelection: Boolean(constructPick && !constructPick.multiple),
    showHeaderSelectAll: !constructPick || Boolean(constructPick.multiple),
  }
}

export type AppDatabaseManagerFilesRowActionInput = {
  constructPick: DatabaseManagerConstructPickContext | null
  libraryMemberPick: DatabaseManagerLibraryMemberPickContext | null
  selected: boolean
  eligible: boolean
}

export type AppDatabaseManagerFilesRowActionSlice = {
  rowActionLabel: string
  rowActionDisabled: boolean
}

export function buildAppDatabaseManagerFilesRowActionSlice(
  input: AppDatabaseManagerFilesRowActionInput,
): AppDatabaseManagerFilesRowActionSlice {
  const { constructPick, libraryMemberPick, selected, eligible } = input
  const rowActionLabel =
    constructPick?.multiple || libraryMemberPick
      ? selected
        ? 'Remove'
        : 'Select'
      : constructPick
        ? 'Add'
        : 'Open'
  return {
    rowActionLabel,
    rowActionDisabled: Boolean((constructPick || libraryMemberPick) && !eligible),
  }
}
