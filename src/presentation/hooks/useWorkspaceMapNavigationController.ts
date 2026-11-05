import { useCallback } from 'react'
import { nextLibraryMapBrowseIndex } from '../../application/workspaceInteraction/mapNavigation'
import type { SequencePendingRevealTarget } from '../../application/sequenceTab/sequenceEnterTabRevealPosition'
import { alignmentViewportTemplateIndex } from '../../domain/traceFileWorkflow'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SelectionRange } from '../sequence'

type LibraryMember = { id: string; fileName: string; sequence: string }
type SelectionOptions = { collapsed?: boolean; libraryMemberId?: string | null; sequenceLength?: number }

type WorkspaceMapNavigationOptions = {
  libraryMapBrowseActive: boolean
  libraryMapBrowseKeys: Array<string | null>
  libraryMapBrowseIndex: number
  libraryMapMembers: LibraryMember[]
  libraryMapBrowseMemberId: string | null
  mapViewSequenceLength: number
  recordSequenceLength: number
  queueRevealTarget: (target: SequencePendingRevealTarget) => void
  traceFiles: readonly TraceFileRecord[]
  setSelectedAlignmentTraceId: (traceId: string) => void
  traceAlignmentMode: boolean
  setSequenceRange: (range: SelectionRange, options?: SelectionOptions) => void
  setStatus: (status: string) => void
  selectFeatureById: (featureId: string, extendSelection: boolean, allowToggle: boolean, options: { libraryMemberId: string | null; scrollPosition?: number }) => void
  openFeatureEditorForFeature: (featureId: string, options: { libraryMemberId: string | null }) => void
  selectPrimerById: (primerId: string, extendSelection: boolean, options: { libraryMemberId: string | null }) => void
  openPrimerEditorForPrimer: (primerId: string, memberId: string | null) => void
}

/** Owns library-map browse cycling plus map-originated selection and editor routing. */
export function useWorkspaceMapNavigationController(options: WorkspaceMapNavigationOptions) {
  const {
    libraryMapBrowseActive,
    libraryMapBrowseKeys,
    libraryMapBrowseIndex,
    libraryMapMembers,
    libraryMapBrowseMemberId,
    mapViewSequenceLength,
    recordSequenceLength,
    queueRevealTarget,
    traceFiles,
    setSelectedAlignmentTraceId,
    traceAlignmentMode,
    setSequenceRange,
    setStatus,
    selectFeatureById,
    openFeatureEditorForFeature,
    selectPrimerById,
    openPrimerEditorForPrimer,
  } = options

  const navigateLibraryMap = useCallback((delta: number) => {
    const nextIndex = nextLibraryMapBrowseIndex(libraryMapBrowseIndex, delta, libraryMapBrowseKeys.length)
    if (!libraryMapBrowseActive || nextIndex === null) return
    const nextId = libraryMapBrowseKeys[nextIndex] ?? null
    const member = nextId ? libraryMapMembers.find((entry) => entry.id === nextId) ?? null : null
    setSequenceRange({ start: 0, end: 0 }, {
      collapsed: true,
      libraryMemberId: nextId,
      sequenceLength: member?.sequence.length ?? recordSequenceLength,
    })
    setStatus(member ? `Map: ${member.fileName}` : 'Map: Consensus')
  }, [
    libraryMapBrowseActive,
    libraryMapBrowseIndex,
    libraryMapBrowseKeys,
    libraryMapMembers,
    recordSequenceLength,
    setSequenceRange,
    setStatus,
  ])

  const navigatePreviousLibraryMap = useCallback(() => {
    navigateLibraryMap(-1)
  }, [navigateLibraryMap])

  const navigateNextLibraryMap = useCallback(() => {
    navigateLibraryMap(1)
  }, [navigateLibraryMap])

  const selectMapRange = useCallback((range: SelectionRange) => {
    queueRevealTarget({ kind: 'selection', viewport: traceAlignmentMode ? 'alignment' : 'sequence' })
    setSequenceRange(range, {
      libraryMemberId: libraryMapBrowseMemberId,
      sequenceLength: mapViewSequenceLength,
    })
  }, [libraryMapBrowseMemberId, mapViewSequenceLength, queueRevealTarget, setSequenceRange, traceAlignmentMode])

  const selectMapFeature = useCallback((featureId: string, extendSelection = false, position?: number) => {
    queueRevealTarget({ kind: 'selection', viewport: traceAlignmentMode ? 'alignment' : 'sequence' })
    selectFeatureById(featureId, extendSelection, false, { libraryMemberId: libraryMapBrowseMemberId, scrollPosition: position })
  }, [libraryMapBrowseMemberId, queueRevealTarget, selectFeatureById, traceAlignmentMode])

  const selectAlignmentTraceFromMap = useCallback((traceId: string) => {
    setSelectedAlignmentTraceId(traceId)
    const trace = traceFiles.find((item) => item.id === traceId)
    if (!trace?.alignment) return
    const templateIndex = alignmentViewportTemplateIndex(trace.alignment)
    queueRevealTarget(traceAlignmentMode
      ? { kind: 'alignment', templateIndex }
      : { kind: 'sequence', position: templateIndex })
  }, [queueRevealTarget, setSelectedAlignmentTraceId, traceAlignmentMode, traceFiles])

  const editMapFeature = useCallback((featureId: string) => {
    openFeatureEditorForFeature(featureId, { libraryMemberId: libraryMapBrowseMemberId })
  }, [libraryMapBrowseMemberId, openFeatureEditorForFeature])

  const selectMapPrimer = useCallback((primerId: string, extendSelection = false) => {
    queueRevealTarget({ kind: 'selection', viewport: traceAlignmentMode ? 'alignment' : 'sequence' })
    selectPrimerById(primerId, extendSelection, { libraryMemberId: libraryMapBrowseMemberId })
  }, [libraryMapBrowseMemberId, queueRevealTarget, selectPrimerById, traceAlignmentMode])

  const editMapPrimer = useCallback((primerId: string) => {
    openPrimerEditorForPrimer(primerId, libraryMapBrowseMemberId)
  }, [libraryMapBrowseMemberId, openPrimerEditorForPrimer])

  return {
    navigatePreviousLibraryMap,
    navigateNextLibraryMap,
    selectMapRange,
    selectMapFeature,
    selectAlignmentTraceFromMap,
    editMapFeature,
    selectMapPrimer,
    editMapPrimer,
  }
}
