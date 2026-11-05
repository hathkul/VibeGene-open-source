import {
  buildPrimerPaneEntries,
  type PrimerPaneEntry,
  type PrimerPanePrimerRow,
  type PrimerPaneSgRnaRow,
  type PrimerPaneSortDirection,
  type SgRnaPaneSortMode,
} from '../../domain/primerPaneEntries'
import type { PrimerTabSortMode } from '../../domain/primerExport'
import type { PrimerHybridizationParams } from '../../domain/primerHybridization'
import { selectedSgRnasInPaneMember } from '../../application/primerWorkflow/primerPaneProjection'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { Primer, SequenceRecord } from '../../domain/types'
import type { SelectionFocus } from '../sequence'

export type PrimerTabProjectionSorts = {
  primerSort: { mode: PrimerTabSortMode; direction: PrimerPaneSortDirection }
  oligoSort: { mode: PrimerTabSortMode; direction: PrimerPaneSortDirection }
  sgRnaSort: { mode: SgRnaPaneSortMode; direction: PrimerPaneSortDirection }
}

export type BuildPrimerTabProjectionInput = {
  record: SequenceRecord
  traceFiles: readonly TraceFileRecord[]
  hybridization: PrimerHybridizationParams
  sorts: PrimerTabProjectionSorts
  warningsFor: (primer: Primer) => string
}

export type PrimerTabProjection = {
  entries: PrimerPaneEntry[]
  primerRows: PrimerPanePrimerRow[]
  sgRnaRows: PrimerPaneSgRnaRow[]
}

export function buildPrimerTabProjection(input: BuildPrimerTabProjectionInput): PrimerTabProjection {
  const entries = buildPrimerPaneEntries(input.record, input.traceFiles, {
    hybridization: input.hybridization,
    primerSort: input.sorts.primerSort,
    oligoSort: input.sorts.oligoSort,
    sgRnaSort: input.sorts.sgRnaSort,
    warningsFor: input.warningsFor,
  })
  return {
    entries,
    primerRows: entries.filter((entry): entry is PrimerPanePrimerRow => entry.kind === 'primer'),
    sgRnaRows: entries.filter((entry): entry is PrimerPaneSgRnaRow => entry.kind === 'sgrna'),
  }
}

export function resolveSelectedPrimerPaneSgRna(
  primerTabEntries: readonly PrimerPaneEntry[],
  selectionFocus: SelectionFocus,
  featureTabSelectionMemberId: string | null,
  selectedFeatureId: string | null,
): PrimerPaneSgRnaRow | undefined {
  return primerTabEntries.find((entry): entry is PrimerPaneSgRnaRow =>
    entry.kind === 'sgrna'
    && selectionFocus === 'feature'
    && entry.memberId === featureTabSelectionMemberId
    && entry.annotation.guide.id === selectedFeatureId)
}

export function buildSelectedSgRnasForExport(
  record: SequenceRecord,
  traceFiles: readonly TraceFileRecord[],
  featureTabSelectionMemberId: string | null,
  selectedLibraryMember: TraceFileRecord | null,
  featureVisibilityTargetIds: readonly string[],
): ReturnType<typeof selectedSgRnasInPaneMember> {
  if (record.molecule !== 'dna') return []
  const memberId = featureTabSelectionMemberId ?? selectedLibraryMember?.id ?? null
  return selectedSgRnasInPaneMember(record, traceFiles, memberId, featureVisibilityTargetIds)
}

export function buildSelectedSgRnasForCloning(
  selectedSgRnasForExport: ReturnType<typeof selectedSgRnasInPaneMember>,
) {
  return selectedSgRnasForExport.filter((annotation) => Boolean(annotation.pam))
}
