import type { LibraryDeduplicatePlanGroup } from '../../domain/libraryMemberDeduplicate'
import { collapseDnaLibraryToConstruct, isDnaLibraryRecord } from '../../domain/dnaLibrary'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'

export type LibraryMemberCommitPlan =
  | { kind: 'members'; members: TraceFileRecord[] }
  | { kind: 'collapse'; record: SequenceRecord }

/** Chooses the deterministic member-list/collapse transition; UI owns its ports and status. */
export function planLibraryMemberCommit(record: SequenceRecord, members: TraceFileRecord[]): LibraryMemberCommitPlan {
  if (!isDnaLibraryRecord(record) || members.length > 1) return { kind: 'members', members }
  return { kind: 'collapse', record: collapseDnaLibraryToConstruct(record, members).record }
}

export type MemberSelectionInput = {
  rowIds: readonly string[]
  selectedIds: readonly string[]
  anchorId: string | null
  memberId: string
  shiftKey: boolean
  additive: boolean
}

export type MemberSelectionResult = {
  selectedIds: string[]
  anchorId: string
  focusedId: string | null
  message: string
}

/** Computes member-table selection without depending on React or DOM events. */
export function selectLibraryMember(input: MemberSelectionInput): MemberSelectionResult | null {
  const clickedIndex = input.rowIds.indexOf(input.memberId)
  if (clickedIndex < 0) return null

  if (input.shiftKey && input.anchorId) {
    const anchorIndex = input.rowIds.indexOf(input.anchorId)
    if (anchorIndex >= 0) {
      const [lo, hi] = anchorIndex < clickedIndex
        ? [anchorIndex, clickedIndex]
        : [clickedIndex, anchorIndex]
      const selectedIds = input.rowIds.slice(lo, hi + 1)
      return {
        selectedIds,
        anchorId: input.memberId,
        focusedId: input.memberId,
        message: `Selected ${selectedIds.length} members.`,
      }
    }
  }

  if (input.additive) {
    const alreadySelected = input.selectedIds.includes(input.memberId)
    const selectedIds = alreadySelected
      ? input.selectedIds.filter((id) => id !== input.memberId)
      : [...input.selectedIds, input.memberId]
    return {
      selectedIds,
      anchorId: input.memberId,
      focusedId: selectedIds.length
        ? (selectedIds.includes(input.memberId) ? input.memberId : selectedIds[selectedIds.length - 1]!)
        : null,
      message: selectedIds.length ? `Selected ${selectedIds.length} members.` : 'Cleared member selection.',
    }
  }

  return {
    selectedIds: [input.memberId],
    anchorId: input.memberId,
    focusedId: input.memberId,
    message: '',
  }
}

export function selectedLibraryMemberIdsForDelete(
  selectedIds: readonly string[],
  focusedId: string | null,
): string[] {
  return selectedIds.length ? [...selectedIds] : focusedId ? [focusedId] : []
}

export function dedupeReferenceReplacement(
  groups: readonly LibraryDeduplicatePlanGroup[],
  removedIds: ReadonlySet<string>,
  referenceId: string | null | undefined,
): string | null | undefined {
  if (!referenceId || !removedIds.has(referenceId)) return referenceId
  return groups.find((group) => group.memberIds.includes(referenceId))?.keepMemberId ?? null
}

export function dedupeFocusedMemberReplacement(
  groups: readonly LibraryDeduplicatePlanGroup[],
  focusedId: string | null,
  keepIds: ReadonlySet<string>,
): string | null {
  if (!focusedId) return null
  return groups.find((group) => group.memberIds.includes(focusedId))?.keepMemberId
    ?? [...keepIds][0]
    ?? null
}

export function referenceSelectionState(
  nextReferenceId: string | null,
): { referenceId: string | null; consensusEnabled: boolean } {
  return {
    referenceId: nextReferenceId,
    consensusEnabled: nextReferenceId == null,
  }
}
