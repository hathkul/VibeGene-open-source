import { useCallback, useState } from 'react'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { RestrictionSite, SequenceRecord } from '../../domain/types'
import type {
  SelectionAnchor,
  SelectionFocus,
  SelectionRange,
  StrandPairSelection,
  WorkspaceTab,
} from '../sequence'

export type DocumentHistorySnapshot = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
}

/** Owns document selection and undo/redo UI state; App supplies mutation workflows. */
export function useSelectionEditingController(
  _initialRecord: SequenceRecord,
  initialTab: WorkspaceTab,
) {
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([])
  const [featureTabSelectionMemberId, setFeatureTabSelectionMemberId] = useState<string | null>(null)
  const [featureTabAnchor, setFeatureTabAnchor] = useState<{ featureId: string; memberId: string | null } | null>(
    null,
  )
  const [primerTabAnchorId, setPrimerTabAnchorId] = useState<string | null>(null)
  const [selectedPrimerId, setSelectedPrimerId] = useState<string | null>(null)
  const [selectedPrimerIds, setSelectedPrimerIds] = useState<string[]>([])
  const [selectionFocus, setSelectionFocus] = useState<SelectionFocus>('dna')
  const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab)
  const [cutSelectionAnchor, setCutSelectionAnchor] = useState<RestrictionSite | null>(null)
  const [cutStrandSelection, setCutStrandSelection] = useState<StrandPairSelection | null>(null)
  const [cutSelectionEnzymes, setCutSelectionEnzymes] = useState<{
    upstream: RestrictionSite
    downstream: RestrictionSite
  } | null>(null)
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null)
  const [undoStack, setUndoStack] = useState<DocumentHistorySnapshot[]>([])
  const [redoStack, setRedoStack] = useState<DocumentHistorySnapshot[]>([])

  /** Clears selection-only state when a different persisted document takes over this workspace. */
  const clearDocumentSelection = useCallback(() => {
    setSelectedFeatureId(null)
    setSelectedFeatureIds([])
    setFeatureTabSelectionMemberId(null)
    setFeatureTabAnchor(null)
    setPrimerTabAnchorId(null)
    setSelectedPrimerId(null)
    setSelectedPrimerIds([])
    setSelectionFocus('dna')
    setSelectedRange(null)
    setCutSelectionAnchor(null)
    setCutStrandSelection(null)
    setCutSelectionEnzymes(null)
    setSelectionAnchor(null)
  }, [])

  return {
    selectedFeatureId,
    setSelectedFeatureId,
    selectedFeatureIds,
    setSelectedFeatureIds,
    featureTabSelectionMemberId,
    setFeatureTabSelectionMemberId,
    featureTabAnchor,
    setFeatureTabAnchor,
    primerTabAnchorId,
    setPrimerTabAnchorId,
    selectedPrimerId,
    setSelectedPrimerId,
    selectedPrimerIds,
    setSelectedPrimerIds,
    selectionFocus,
    setSelectionFocus,
    selectedRange,
    setSelectedRange,
    activeTab,
    setActiveTab,
    cutSelectionAnchor,
    setCutSelectionAnchor,
    cutStrandSelection,
    setCutStrandSelection,
    cutSelectionEnzymes,
    setCutSelectionEnzymes,
    selectionAnchor,
    setSelectionAnchor,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
    clearDocumentSelection,
  }
}

// Related workflow hooks are re-exported from the selection controller boundary so
// App composes one cohesive selection/editing surface, while each port remains small
// and independently testable.
export { useSequenceEditingActions } from './useSequenceEditingActions'
export { useSequenceClipboardController } from './useSequenceClipboardController'
export { useSelectionEditingWorkflowActions } from './useSelectionEditingWorkflowActions'
export { useSelectionRangeController } from './useSelectionRangeController'
export { useDnaSequenceEditController } from './useDnaSequenceEditController'
