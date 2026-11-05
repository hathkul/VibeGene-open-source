import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import {
  buildAgaroseGelLibraryPlan,
  sequenceRecordForAgaroseGel,
  slimAgaroseGelDnaSource,
  type AgaroseGelDnaSource,
} from '../../domain/agaroseGelLibrary'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SequenceRecord } from '../../domain/types'

export type AgaroseGelDialogSnapshot = {
  currentRecord: SequenceRecord
  currentTabId: string
  openedAt: number
  initialSamples: AgaroseGelDnaSource[]
  libraryMemberSources: AgaroseGelDnaSource[]
  currentSourceLabel: string
}

export type AgaroseGelDialogOpenOverrides = {
  currentRecord?: SequenceRecord
  initialSamples?: AgaroseGelDnaSource[]
  libraryMemberSources?: AgaroseGelDnaSource[]
  currentSourceLabel?: string
}

export type PlanAgaroseGelDialogSnapshotInput = {
  workspaceRecord: SequenceRecord
  currentTabId: string
  openedAt: number
  traceFiles?: TraceFileRecord[]
  selectedLibraryMemberIds?: string[]
  overrides?: AgaroseGelDialogOpenOverrides
}

/** Builds the in-app / hybrid agarose gel open payload from workspace context and optional overrides. */
export function planAgaroseGelDialogSnapshot(input: PlanAgaroseGelDialogSnapshotInput): AgaroseGelDialogSnapshot {
  const liveRecord = input.overrides?.currentRecord ?? input.workspaceRecord
  const sourceRecord = sequenceRecordForAgaroseGel(liveRecord)
  const useWorkspaceLibraryContext =
    liveRecord === input.workspaceRecord && isDnaLibraryRecord(input.workspaceRecord)
  const plan = buildAgaroseGelLibraryPlan({
    record: liveRecord,
    members: useWorkspaceLibraryContext ? input.traceFiles : undefined,
    selectedMemberIds: useWorkspaceLibraryContext ? input.selectedLibraryMemberIds : undefined,
  })
  return {
    currentRecord: sourceRecord,
    currentTabId: input.currentTabId,
    openedAt: input.openedAt,
    initialSamples: (input.overrides?.initialSamples ?? plan.initialSamples).map(slimAgaroseGelDnaSource),
    libraryMemberSources: (input.overrides?.libraryMemberSources ?? plan.memberSources).map(slimAgaroseGelDnaSource),
    currentSourceLabel: input.overrides?.currentSourceLabel ?? plan.currentSource.label,
  }
}
