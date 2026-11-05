import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { groupSgRNAFeatures, type SgRNAAnnotation } from '../../domain/sgrna'
import { isSgRnaCloningOligo } from '../../domain/sgrnaOligoPrimers'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { Primer, SequenceRecord } from '../../domain/types'

export type PrimerPaneSelectionState = {
  selectedAlignmentTraceId: string | null
  selectedPrimerId: string | null
  selectedPrimerIds: readonly string[]
}

export function primersForPrimerPaneMember(
  record: SequenceRecord,
  traceFiles: readonly TraceFileRecord[],
  memberId: string | null,
): readonly Primer[] {
  return memberId
    ? (traceFiles.find((trace) => trace.id === memberId)?.primers ?? [])
    : record.primers
}

export function sgRnaAnnotationsForPrimerPaneMember(
  record: SequenceRecord,
  traceFiles: readonly TraceFileRecord[],
  memberId: string | null,
): SgRNAAnnotation[] {
  const features = memberId
    ? (traceFiles.find((trace) => trace.id === memberId)?.features ?? [])
    : record.features
  return groupSgRNAFeatures(features)
}

export function selectedPrimersInPaneMember(
  record: SequenceRecord,
  traceFiles: readonly TraceFileRecord[],
  memberId: string | null,
  oligosOnly: boolean,
  selection: PrimerPaneSelectionState,
): Primer[] {
  const primers = primersForPrimerPaneMember(record, traceFiles, memberId).filter((primer) =>
    oligosOnly ? isSgRnaCloningOligo(primer) : !isSgRnaCloningOligo(primer),
  )
  return primers.filter((primer) =>
    selection.selectedAlignmentTraceId === memberId
    && (selection.selectedPrimerIds.includes(primer.id) || selection.selectedPrimerId === primer.id),
  )
}

export function selectedSgRnasInPaneMember(
  record: SequenceRecord,
  traceFiles: readonly TraceFileRecord[],
  memberId: string | null,
  visibilityTargetIds: readonly string[],
): SgRNAAnnotation[] {
  const ids = new Set(visibilityTargetIds)
  return sgRnaAnnotationsForPrimerPaneMember(record, traceFiles, memberId).filter((annotation) =>
    ids.has(annotation.guide.id) || Boolean(annotation.pam && ids.has(annotation.pam.id)),
  )
}

export function paneMemberIdsWithPrimers(
  record: SequenceRecord,
  traceFiles: readonly TraceFileRecord[],
): (string | null)[] {
  return [null, ...(isDnaLibraryRecord(record) ? traceFiles.map((trace) => trace.id) : [])]
}

export function hasRegularPrimerPaneSelection(
  record: SequenceRecord,
  traceFiles: readonly TraceFileRecord[],
  selection: PrimerPaneSelectionState,
): boolean {
  return paneMemberIdsWithPrimers(record, traceFiles)
    .some((memberId) => selectedPrimersInPaneMember(record, traceFiles, memberId, false, selection).length > 0)
}

export function selectedPrimersForMenu(
  record: SequenceRecord,
  selectedMember: TraceFileRecord | null,
  selection: Pick<PrimerPaneSelectionState, 'selectedPrimerId' | 'selectedPrimerIds'>,
): Primer[] {
  const sourcePrimers = selectedMember?.primers ?? record.primers
  const fromMulti = selection.selectedPrimerIds
    .map((id) => sourcePrimers.find((primer) => primer.id === id))
    .filter((primer): primer is NonNullable<typeof primer> => Boolean(primer))
  if (fromMulti.length > 0) return fromMulti
  if (selection.selectedPrimerId) {
    const primer = sourcePrimers.find((entry) => entry.id === selection.selectedPrimerId)
    return primer ? [primer] : []
  }
  return []
}
