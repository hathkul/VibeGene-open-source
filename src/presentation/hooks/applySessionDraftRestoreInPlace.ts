import { featureBounds } from '../../domain/sequence'
import { hydrateLibraryTracesFromDocument } from '../../domain/libraryMemberFeatures'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SelectionFocus, WorkspaceTab } from '../sequence'

export type SessionDraftRestoreInPlacePorts = {
  setRecord: (record: SequenceRecord) => void
  setLibraryFolderId: (folderId: string | undefined) => void
  setWorkspaceDiskPath: (path: string | null) => void
  applyDefaultMapViewForTopology: (topology: SequenceRecord['topology'], sequenceLength: number) => void
  setTraceFilesForRecord: (recordId: string, traces: TraceFileRecord[]) => void
  setSelectedFeatureId: (id: string | null) => void
  setSelectedPrimerId: (id: string | null) => void
  setSelectionFocus: (focus: SelectionFocus) => void
  setSelectedRange: (range: { start: number; end: number } | null) => void
  setActiveTab: (tab: WorkspaceTab) => void
  markNeverSaved: () => void
}

/** Applies a restored session draft to the active workspace without opening a new tab. */
export function applySessionDraftRestoreInPlace(
  normalized: SequenceRecord,
  ports: SessionDraftRestoreInPlacePorts,
): void {
  const loadedTraces = hydrateLibraryTracesFromDocument(normalized, normalized.traceFiles ?? [])
  const firstFeature = normalized.features[0]
  ports.setRecord(normalized)
  ports.setLibraryFolderId(undefined)
  ports.setWorkspaceDiskPath(null)
  ports.applyDefaultMapViewForTopology(normalized.topology, normalized.sequence.length)
  ports.setTraceFilesForRecord(normalized.id, loadedTraces)
  ports.setSelectedFeatureId(firstFeature?.id ?? null)
  ports.setSelectedPrimerId(null)
  ports.setSelectionFocus(firstFeature ? 'feature' : 'dna')
  ports.setSelectedRange(
    firstFeature ? { start: featureBounds(firstFeature).start, end: featureBounds(firstFeature).end } : null,
  )
  ports.setActiveTab('Map')
  ports.markNeverSaved()
}
