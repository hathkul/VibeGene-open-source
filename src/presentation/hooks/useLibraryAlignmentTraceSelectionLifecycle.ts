import { useEffect } from 'react'
import {
  defaultLibraryMemberAlignmentTraceId,
  shouldClearSelectedAlignmentTraceId,
} from '../../application/workspaceInteraction/libraryAlignmentTraceSelection'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SequenceRecord } from '../../domain/types'

export type LibraryAlignmentTraceSelectionLifecycleInput = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  selectedAlignmentTraceId: string | null
  setSelectedAlignmentTraceId: (value: string | null) => void
}

/** Clears invalid library alignment trace ids and applies member default selection. */
export function useLibraryAlignmentTraceSelectionLifecycle(
  input: LibraryAlignmentTraceSelectionLifecycleInput,
) {
  const { record, traceFiles, selectedAlignmentTraceId, setSelectedAlignmentTraceId } = input

  useEffect(() => {
    if (shouldClearSelectedAlignmentTraceId(selectedAlignmentTraceId, traceFiles)) {
      setSelectedAlignmentTraceId(null)
    }
  }, [selectedAlignmentTraceId, traceFiles, setSelectedAlignmentTraceId])

  useEffect(() => {
    if (selectedAlignmentTraceId) return
    const defaultId = defaultLibraryMemberAlignmentTraceId(record, traceFiles)
    if (defaultId) setSelectedAlignmentTraceId(defaultId)
  }, [record, selectedAlignmentTraceId, traceFiles, setSelectedAlignmentTraceId])
}
