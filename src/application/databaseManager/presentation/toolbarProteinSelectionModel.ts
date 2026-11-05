import type { DatabaseViewMode } from '../browsePresentation'
import type { DatabaseManagerAlignmentPickContext } from './pickContext'

export type AppDatabaseManagerProteinSelectionToolbarInput = {
  viewMode: DatabaseViewMode
  selectedProteinCount: number
  alignmentPick: DatabaseManagerAlignmentPickContext | null
  onAddToAlignmentHandler: boolean
  busy: boolean
}

export type AppDatabaseManagerProteinSelectionToolbarSlice = {
  visible: boolean
  count: number
  showAlignment: boolean
  busy: boolean
}

export function buildAppDatabaseManagerProteinSelectionToolbarSlice(
  input: AppDatabaseManagerProteinSelectionToolbarInput,
): AppDatabaseManagerProteinSelectionToolbarSlice {
  const count = input.selectedProteinCount
  return {
    visible: input.viewMode === 'cdses' && count > 0,
    count,
    showAlignment: Boolean(input.alignmentPick?.mode === 'protein' && input.onAddToAlignmentHandler),
    busy: input.busy,
  }
}
