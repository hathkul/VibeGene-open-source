import type { DatabaseViewMode } from '../browsePresentation'
import type {
  DatabaseManagerConstructPickContext,
  DatabaseManagerLibraryMemberPickContext,
} from './pickContext'

export type AppDatabaseManagerViewModeToolbarSlice = {
  active: DatabaseViewMode
  busy: boolean
  dnaDisabled: boolean
  primersDisabled: boolean
  proteinsDisabled: boolean
  cdsesDisabled: boolean
}

export type AppDatabaseManagerViewModeToolbarInput = {
  viewMode: DatabaseViewMode
  busy: boolean
  constructPick: DatabaseManagerConstructPickContext | null
  libraryMemberPick: DatabaseManagerLibraryMemberPickContext | null
}

export function buildAppDatabaseManagerViewModeToolbarSlice(
  input: AppDatabaseManagerViewModeToolbarInput,
): AppDatabaseManagerViewModeToolbarSlice {
  const { constructPick, libraryMemberPick, viewMode, busy } = input
  return {
    active: viewMode,
    busy,
    dnaDisabled:
      Boolean(libraryMemberPick)
      || (Boolean(constructPick) && !constructPick?.molecules?.length)
      || Boolean(constructPick?.molecules && !constructPick.molecules.includes('dna')),
    primersDisabled: Boolean(constructPick || libraryMemberPick),
    proteinsDisabled:
      Boolean(libraryMemberPick)
      || (Boolean(constructPick) && !constructPick?.molecules?.length)
      || Boolean(constructPick && !constructPick.molecules?.includes('protein')),
    cdsesDisabled: Boolean(constructPick || libraryMemberPick),
  }
}
