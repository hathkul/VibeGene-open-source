import { useCallback } from 'react'
import { circularizeLinearRecord, linearizeCircularAtOrigin, setCircularOrigin, addOperation } from '../../domain/sequence'
import { applyDnaEndsEditorResult, createDnaEndsEditOperation, dnaEndsEditSummary, dnaEndsEqual, resolveDnaEnds } from '../../domain/dnaEnds'
import { recordDnaEndsEditInHistory } from '../../domain/snapgeneHistoryExport'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { flipRecord } from '../../domain/flipRecord'
import type { SequenceRecord } from '../../domain/types'
import type { OrfTranslationDraft } from '../dnaViewControls'
import type { DisplaySettings, SelectionRange } from '../sequence'

type DnaEndsDraft = { sequence: string; features: SequenceRecord['features']; dnaEnds: NonNullable<SequenceRecord['dnaEnds']> }
type MapLabelResult = { fileName: string; mapLabel: string | null }

type WorkspaceTopologyDisplayOptions = {
  record: SequenceRecord
  displaySettings: DisplaySettings
  translationOptionsDraft: OrfTranslationDraft | null
  setTranslationOptionsDraft: (draft: OrfTranslationDraft | null) => void
  setDnaEndsEditorOpen: (open: boolean) => void
  setEditMapLabelOpen: (open: boolean) => void
  setSelectRangeOpen: (open: boolean) => void
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord) => void
  updateDisplaySection: (key: 'orfs', patch: OrfTranslationDraft) => void
  setDisplaySettings: (updater: (current: DisplaySettings) => DisplaySettings) => void
  withAlignmentsVisibility: (settings: DisplaySettings, visible: boolean) => DisplaySettings
  setSelectedFeatureId: (id: string | null) => void
  setSelectedPrimerId: (id: string | null) => void
  setCutStrandSelection: (value: null) => void
  setCutSelectionEnzymes: (value: null) => void
  setCutSelectionAnchor: (value: null) => void
  setSelectionFocus: (focus: 'dna' | 'feature' | 'primer' | 'bond') => void
  setSelectedRange: (range: SelectionRange | null) => void
  setSequenceRange: (range: SelectionRange) => void
  selectionRangeFromOneBased: (start: number, end: number, length: number) => SelectionRange | null
  setStatus: (status: string) => void
  flipDnaLibraryOrientation: () => Promise<void>
  flipLibraryMemberOrientation: (memberId: string) => void
  openLibraryMemberAsConstruct: (memberId: string) => void
  normalizeConstructFileName: (value: string, fallback: string) => string
}

/** Owns topology/origin, DNA-end, orientation, alignment, map-label, and translation-display commands. */
export function useWorkspaceTopologyDisplayController(options: WorkspaceTopologyDisplayOptions) {
  const handleToggleTopologyAtOrigin = useCallback(() => {
    const message = options.record.topology === 'circular' ? 'Linearized sequence at origin.' : 'Made sequence circular.'
    options.updateRecord((current) => addOperation(current.topology === 'circular' ? linearizeCircularAtOrigin(current) : circularizeLinearRecord(current), 'topology', message))
    options.setStatus(message)
  }, [options])

  const handleSetOrigin = useCallback((origin: number) => {
    options.updateRecord((current) => addOperation(setCircularOrigin(current, origin), 'set-origin', `Set sequence origin to position ${origin + 1}.`))
    options.setSelectedRange({ start: 0, end: 0 })
    options.setSelectionFocus('dna')
    options.setStatus(`Set sequence origin to position ${origin + 1}.`)
  }, [options])

  const handleSaveDnaEnds = useCallback((draft: DnaEndsDraft) => {
    options.updateRecord((current) => {
      const beforeEnds = resolveDnaEnds(current)
      const edited = applyDnaEndsEditorResult(current, draft)
      const sequenceChanged = edited.sequence !== current.sequence
      const endsChanged = !dnaEndsEqual(beforeEnds, resolveDnaEnds(edited))
      if (!sequenceChanged && !endsChanged) return current
      const summary = dnaEndsEditSummary(beforeEnds, resolveDnaEnds(edited), sequenceChanged)
      return { ...edited, history: recordDnaEndsEditInHistory(current.history, current, edited), operations: [createDnaEndsEditOperation(summary), ...edited.operations] }
    })
    options.setDnaEndsEditorOpen(false)
    options.setStatus('Updated DNA ends.')
  }, [options])

  const applySelectRange = useCallback((startOneBased: number, endOneBased: number) => {
    const range = options.selectionRangeFromOneBased(startOneBased, endOneBased, options.record.sequence.length)
    if (!range) return
    options.setSequenceRange(range)
    options.setSelectRangeOpen(false)
  }, [options])

  const handleFlipSequence = useCallback(() => {
    if (options.record.sequence.length === 0) { options.setStatus('Nothing to flip.'); return }
    if (isDnaLibraryRecord(options.record)) { void options.flipDnaLibraryOrientation(); return }
    options.updateRecord((current) => addOperation(flipRecord(current), 'flip', 'Reverse-complemented the sequence'))
    options.setSelectedFeatureId(null)
    options.setSelectedPrimerId(null)
    options.setCutStrandSelection(null)
    options.setCutSelectionEnzymes(null)
    options.setCutSelectionAnchor(null)
    options.setSelectionFocus('dna')
    options.setSelectedRange(null)
    options.setStatus('Flipped sequence (reverse complement) with features and primers.')
  }, [options])

  const toggleAlignments = useCallback(() => {
    options.setDisplaySettings((current) => options.withAlignmentsVisibility(current, !current.alignments.visible))
  }, [options])

  const applyEditMapLabel = useCallback((result: MapLabelResult) => {
    const nextName = options.normalizeConstructFileName(result.fileName, options.record.name)
    options.updateRecord((current) => ({ ...current, name: nextName, mapLabel: result.mapLabel ?? undefined }))
    options.setEditMapLabelOpen(false)
    options.setStatus(result.mapLabel ? `File named “${nextName}”; map label set to “${result.mapLabel}”.` : `File named “${nextName}”; map label uses the file name.`)
  }, [options])

  const openTranslationOptions = useCallback(() => {
    options.setTranslationOptionsDraft({
      minimumLengthAa: options.displaySettings.orfs.minimumLengthAa,
      requireStartCodon: options.displaySettings.orfs.requireStartCodon,
      startCodon: options.displaySettings.orfs.startCodon,
      geneticCode: options.displaySettings.orfs.geneticCode,
      applyToExistingFeatures: options.displaySettings.orfs.applyToExistingFeatures,
      preview: options.displaySettings.orfs.preview,
    })
  }, [options])

  const confirmTranslationOptions = useCallback(() => {
    if (!options.translationOptionsDraft) return
    options.updateDisplaySection('orfs', options.translationOptionsDraft)
    options.setTranslationOptionsDraft(null)
  }, [options])

  return { handleToggleTopologyAtOrigin, handleSetOrigin, handleSaveDnaEnds, applySelectRange, handleFlipSequence, flipDnaLibraryOrientation: options.flipDnaLibraryOrientation, flipLibraryMemberOrientation: options.flipLibraryMemberOrientation, openLibraryMemberAsConstruct: options.openLibraryMemberAsConstruct, toggleAlignments, applyEditMapLabel, openTranslationOptions, confirmTranslationOptions }
}
