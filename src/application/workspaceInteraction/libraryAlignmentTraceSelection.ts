import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { isLibraryConsensusEnabled } from '../../domain/libraryMemberFeatures'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SequenceRecord } from '../../domain/types'

export function selectedAlignmentTraceExists(
  selectedAlignmentTraceId: string | null,
  traceFiles: readonly Pick<TraceFileRecord, 'id'>[],
): boolean {
  return traceFiles.some((trace) => trace.id === selectedAlignmentTraceId)
}

export function shouldClearSelectedAlignmentTraceId(
  selectedAlignmentTraceId: string | null,
  traceFiles: readonly Pick<TraceFileRecord, 'id'>[],
): boolean {
  return !selectedAlignmentTraceExists(selectedAlignmentTraceId, traceFiles)
}

export function defaultLibraryMemberAlignmentTraceId(
  record: Pick<SequenceRecord, 'molecule' | 'dna'>,
  traceFiles: readonly Pick<TraceFileRecord, 'id' | 'enabled' | 'sequence'>[],
): string | null {
  if (!isDnaLibraryRecord(record) || isLibraryConsensusEnabled(record)) return null
  const first = traceFiles.find((trace) => trace.enabled && trace.sequence.length > 0)
  return first?.id ?? null
}
