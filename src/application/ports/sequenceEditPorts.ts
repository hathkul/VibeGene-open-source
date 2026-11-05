import type { SelectionRange } from '../selectionEditing/selectionEditing'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'

export type SequenceRangeCommitOptions = {
  collapsed?: boolean
  sequenceLength?: number
}

export type DnaSequenceEditHistoryPort = {
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord, options?: { recordHistory?: boolean }) => void
  pushDocumentHistorySnapshot: () => void
}

export type DnaSequenceEditSelectionPort = {
  setSequenceRange: (range: SelectionRange, options?: SequenceRangeCommitOptions) => void
}

export type DnaSequenceEditProfilerPort = {
  markSequenceEditStart: (expectedSequence: string, detail?: string) => void
  actionProfileSync: (label: string, category: string, fn: () => void, detail?: string) => void
}

export type DnaSequenceEditTracePort = {
  onTraceFilesChange: (updater: (current: TraceFileRecord[]) => TraceFileRecord[]) => void
}

export type DnaSequenceEditStatusPort = {
  setStatus: (message: string) => void
}

/** Narrow adapter surface for main-record and library-member DNA sequence edits. */
export type DnaSequenceEditPorts = {
  history: DnaSequenceEditHistoryPort
  selection: DnaSequenceEditSelectionPort
  profiler: DnaSequenceEditProfilerPort
  traces: DnaSequenceEditTracePort
  status: DnaSequenceEditStatusPort
}
