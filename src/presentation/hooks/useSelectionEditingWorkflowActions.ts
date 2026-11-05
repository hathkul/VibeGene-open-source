import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { StrandPairSelection } from '../sequence'
import type { RestrictionSite, SequenceRecord } from '../../domain/types'
import type { SelectionRange } from '../../application/selectionEditing/selectionEditing'
import {
  invertSelectionRange,
  invertStrandPairSelection,
  redoTransition,
  transformSequenceCase,
  undoTransition,
} from '../../application/selectionEditing/selectionEditing'
import type { DocumentHistorySnapshot } from './useSelectionEditingController'

type WorkflowOptions = {
  record: SequenceRecord
  selectedRange: SelectionRange | null
  cutStrandSelection: StrandPairSelection | null
  undoStack: DocumentHistorySnapshot[]
  redoStack: DocumentHistorySnapshot[]
  maxHistoryEntries: number
  captureSnapshot: () => DocumentHistorySnapshot
  restoreSnapshot: (snapshot: DocumentHistorySnapshot) => void
  setUndoStack: (stack: DocumentHistorySnapshot[]) => void
  setRedoStack: (stack: DocumentHistorySnapshot[]) => void
  setCutSelectionAnchor: (value: null) => void
  setCutStrandSelection: (value: StrandPairSelection | null) => void
  setCutSelectionEnzymes: Dispatch<SetStateAction<{ upstream: RestrictionSite; downstream: RestrictionSite } | null>>
  setSelectedFeatureId: (value: string | null) => void
  setSelectedFeatureIds: (value: string[]) => void
  setSelectedPrimerId: (value: string | null) => void
  setSelectedPrimerIds: (value: string[]) => void
  setSelectionFocus: (value: 'dna' | 'feature' | 'primer' | 'bond') => void
  setSelectedRange: (value: SelectionRange | null) => void
  updateRecord: (updater: (record: SequenceRecord) => SequenceRecord) => void
  addOperation: (record: SequenceRecord, type: string, summary: string) => SequenceRecord
  formatRange: (range: SelectionRange) => string
  formatSticky: (selection: StrandPairSelection) => string
  selectionLength: (range: SelectionRange) => number
  setStatus: (message: string) => void
}

export function useSelectionEditingWorkflowActions(options: WorkflowOptions) {
  const invertSelection = useCallback(() => {
    const { record, cutStrandSelection, selectedRange } = options
    if (cutStrandSelection) {
      const inverted = invertStrandPairSelection(cutStrandSelection, record.sequence.length)
      options.setCutSelectionAnchor(null)
      options.setSelectedFeatureId(null)
      options.setSelectedFeatureIds([])
      options.setSelectedPrimerId(null)
      options.setSelectedPrimerIds([])
      options.setSelectionFocus('dna')
      options.setSelectedRange(null)
      options.setCutSelectionEnzymes((current) => current ? { upstream: current.downstream, downstream: current.upstream } : current)
      options.setCutStrandSelection(inverted)
      options.setStatus(`Inverted selection: ${options.formatSticky(inverted)}.`)
      return
    }
    if (!selectedRange || selectedRange.start === selectedRange.end) {
      options.setStatus('Select a sequence range before inverting the selection.')
      return
    }
    const inverted = invertSelectionRange(selectedRange, record.sequence.length)
    options.setCutSelectionAnchor(null)
    options.setCutStrandSelection(null)
    options.setCutSelectionEnzymes(null)
    options.setSelectedFeatureId(null)
    options.setSelectedFeatureIds([])
    options.setSelectedPrimerId(null)
    options.setSelectedPrimerIds([])
    options.setSelectionFocus('dna')
    options.setSelectedRange(inverted)
    options.setStatus(`Inverted selection: ${options.formatRange(inverted)} (${options.selectionLength(inverted)} bp).`)
  }, [options])

  const changeSelectionCase = useCallback((toUpperCase: boolean) => {
    const { selectedRange, cutStrandSelection } = options
    if (!selectedRange || cutStrandSelection || selectedRange.start === selectedRange.end) {
      options.setStatus('Select a sequence range before changing case.')
      return
    }
    options.updateRecord((current) => options.addOperation(
      { ...current, sequence: transformSequenceCase(current.sequence, selectedRange, toUpperCase) },
      'case-change',
      `Made selection ${toUpperCase ? 'uppercase' : 'lowercase'}`,
    ))
    options.setStatus(`Made selection ${toUpperCase ? 'uppercase' : 'lowercase'}.`)
  }, [options])

  const handleUndo = useCallback(() => {
    // Preserve the previous empty-stack behavior: do not capture a document
    // snapshot merely to report that there is nothing to undo.
    if (options.undoStack.length === 0) return options.setStatus('Nothing to undo.')
    const transition = undoTransition(options.undoStack, options.redoStack, options.captureSnapshot())
    if (!transition) return options.setStatus('Nothing to undo.')
    options.setUndoStack(transition.nextUndo)
    options.setRedoStack(transition.nextRedo.slice(-options.maxHistoryEntries))
    options.restoreSnapshot(transition.snapshot)
    options.setStatus('Undid last change.')
  }, [options])
  const handleRedo = useCallback(() => {
    // As with undo, an empty redo stack is a status-only action.
    if (options.redoStack.length === 0) return options.setStatus('Nothing to redo.')
    const transition = redoTransition(options.undoStack, options.redoStack, options.captureSnapshot())
    if (!transition) return options.setStatus('Nothing to redo.')
    options.setRedoStack(transition.nextRedo)
    options.setUndoStack(transition.nextUndo.slice(-options.maxHistoryEntries))
    options.restoreSnapshot(transition.snapshot)
    options.setStatus('Redid change.')
  }, [options])

  return { invertSelection, changeSelectionCase, handleUndo, handleRedo }
}
