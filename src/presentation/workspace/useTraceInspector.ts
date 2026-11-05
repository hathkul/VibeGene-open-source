import { useCallback, useState } from 'react'
import { traceInspectorTemplateRange, type TraceOrdinalRange } from '../../domain/traceAlignmentSelection'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { TraceInspectorTarget } from './TraceInspectorOverlay'

export type TraceInspectorArea = TraceOrdinalRange

/**
 * Owns the standalone Trace Viewer overlay used to inspect one aligned read with
 * its alignment context. Opening another read replaces the current target.
 */
export function useTraceInspector(input: {
  traceFiles: readonly TraceFileRecord[]
  /** Workspace selection; only carried when it is in template coordinates. */
  selectedRange: TraceOrdinalRange | null
  alignmentsVisible: boolean
  recordIsDnaLibrary: boolean
  focusedTraceId: string | null
}): {
  target: TraceInspectorTarget | null
  openTraceInspector: (traceId: string) => void
  closeTraceInspector: () => void
} {
  const { traceFiles, selectedRange, alignmentsVisible, recordIsDnaLibrary, focusedTraceId } = input
  const [target, setTarget] = useState<TraceInspectorTarget | null>(null)
  const openTraceInspector = useCallback((traceId: string) => {
    const trace = traceFiles.find((item) => item.id === traceId)
    if (!trace || trace.parseError || !trace.sequence.length) return
    const templateRange = traceInspectorTemplateRange({
      selectedRange,
      alignmentsVisible,
      recordIsDnaLibrary,
      focusedTraceId,
    })
    setTarget({ trace, templateRange })
  }, [alignmentsVisible, focusedTraceId, recordIsDnaLibrary, selectedRange, traceFiles])
  const closeTraceInspector = useCallback(() => setTarget(null), [])
  return { target, openTraceInspector, closeTraceInspector }
}
