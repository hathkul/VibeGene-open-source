import type { DatabaseManagerConstructSelectionRow } from './neutralTypes'
import type {
  DatabaseManagerConstructPickContext,
  DatabaseManagerLibraryMemberPickContext,
} from './pickContext'

export type AppDatabaseManagerPickToolbarSlice = {
  libraryMember: {
    visible: boolean
    label: string
    countSuffix: string
    disabled: boolean
    title: string
  } | null
  construct: {
    visible: boolean
    confirmLabel: string
    disabled: boolean
    title: string
    cancelVisible: boolean
    cancelLabel: string
  } | null
}

export type AppDatabaseManagerPickToolbarInput = {
  libraryMemberPick: DatabaseManagerLibraryMemberPickContext | null
  onAddLibraryMembersHandler: boolean
  constructPick: DatabaseManagerConstructPickContext | null
  onAddConstructHandlers: boolean
  onCancelConstructPickHandler: boolean
  selectedConstructs: DatabaseManagerConstructSelectionRow[]
  busy: boolean
}

function libraryMemberPickTitle(
  pick: DatabaseManagerLibraryMemberPickContext,
  selectedConstructs: DatabaseManagerConstructSelectionRow[],
): string {
  if (
    selectedConstructs.length >= 1
    && selectedConstructs.every((row) => row.eligible)
  ) {
    return pick.purpose === 'convert'
      ? `Convert the open construct to a library using the selected construct${selectedConstructs.length === 1 ? '' : 's'}`
      : `Add the selected construct${selectedConstructs.length === 1 ? '' : 's'} as members of the current library`
  }
  return 'Select one or more DNA constructs'
}

function constructPickTitle(
  pick: DatabaseManagerConstructPickContext,
  selectedConstructs: DatabaseManagerConstructSelectionRow[],
): string {
  const confirmLabel = pick.confirmLabel ?? 'Add to cloning'
  if (
    selectedConstructs.length >= 1
    && (pick.multiple || selectedConstructs.length === 1)
    && selectedConstructs.every((row) => row.eligible)
  ) {
    return `${confirmLabel}: ${
      selectedConstructs.length === 1
        ? selectedConstructs[0]!.name
        : `${selectedConstructs.length} files`
    }`
  }
  if (pick.topology) {
    return `Select ${pick.multiple ? 'one or more' : 'one'} ${pick.topology} DNA construct${pick.multiple ? 's' : ''}`
  }
  return `Select ${pick.multiple ? 'one or more' : 'one'} file${pick.multiple ? 's' : ''}`
}

export function buildAppDatabaseManagerPickToolbarSlice(
  input: AppDatabaseManagerPickToolbarInput,
): AppDatabaseManagerPickToolbarSlice {
  const { libraryMemberPick, constructPick, selectedConstructs, busy } = input

  const libraryMember =
    libraryMemberPick && input.onAddLibraryMembersHandler
      ? {
          visible: true as const,
          label: libraryMemberPick.purpose === 'convert' ? 'Convert' : 'Add',
          countSuffix: selectedConstructs.length > 1 ? ` (${selectedConstructs.length})` : '',
          disabled:
            busy
            || selectedConstructs.length < 1
            || selectedConstructs.some((row) => !row.eligible),
          title: libraryMemberPickTitle(libraryMemberPick, selectedConstructs),
        }
      : null

  const construct =
    constructPick && input.onAddConstructHandlers
      ? {
          visible: true as const,
          confirmLabel: constructPick.confirmLabel ?? 'Add to cloning',
          disabled:
            busy
            || selectedConstructs.length < 1
            || (!constructPick.multiple && selectedConstructs.length !== 1)
            || selectedConstructs.some((row) => !row.eligible),
          title: constructPickTitle(constructPick, selectedConstructs),
          cancelVisible: Boolean(constructPick && input.onCancelConstructPickHandler),
          cancelLabel: constructPick.cancelLabel ?? 'Cancel cloning selection',
        }
      : null

  return { libraryMember, construct }
}
