import type { DatabaseViewMode } from '../browsePresentation'

export type AppDatabaseManagerPrimerSelectionRow = {
  isCommon: boolean
}

export type AppDatabaseManagerPrimerSelectionToolbarInput = {
  viewMode: DatabaseViewMode
  selectedPrimers: AppDatabaseManagerPrimerSelectionRow[]
  busy: boolean
  currentRecordId: string | null
}

export type AppDatabaseManagerPrimerSelectionToolbarSlice = {
  visible: boolean
  count: number
  renameDisabled: boolean
  renameTitle: string
  tagsLabel: string
  addToCurrentDisabled: boolean
  addToCurrentTitle: string
  addToCommonDisabled: boolean
  addToCommonTitle: string
  showRemoveCommon: boolean
  busy: boolean
}

export function buildAppDatabaseManagerPrimerSelectionToolbarSlice(
  input: AppDatabaseManagerPrimerSelectionToolbarInput,
): AppDatabaseManagerPrimerSelectionToolbarSlice {
  const count = input.selectedPrimers.length
  const single = count === 1 ? input.selectedPrimers[0] : null
  const allCommon = count > 0 && input.selectedPrimers.every((primer) => primer.isCommon)
  return {
    visible: input.viewMode === 'primers' && count > 0,
    count,
    renameDisabled: input.busy || count !== 1 || !single || !single.isCommon,
    renameTitle:
      count === 1 && single && single.isCommon
        ? 'Rename this common primer'
        : 'Rename is only available for a single common primer',
    tagsLabel: count === 1 ? 'Tags' : `Tags (${count})`,
    addToCurrentDisabled: input.busy || !input.currentRecordId,
    addToCurrentTitle: input.currentRecordId
      ? 'Import selected primers into the currently active sequence'
      : 'Open a sequence file to add primers',
    addToCommonDisabled: input.busy || allCommon,
    addToCommonTitle: allCommon
      ? 'Selected primers are already in Common primers'
      : 'Save selected primers to the Common primers library',
    showRemoveCommon: input.selectedPrimers.some((primer) => primer.isCommon),
    busy: input.busy,
  }
}
