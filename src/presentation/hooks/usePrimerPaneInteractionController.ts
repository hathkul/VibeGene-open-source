import { useCallback } from 'react'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { groupSgRNAFeatures, type SgRNAAnnotation } from '../../domain/sgrna'
import { isSgRnaCloningOligo } from '../../domain/sgrnaOligoPrimers'
import { resolveDisplayableLayoutsForPrimer } from '../../domain/primerSequenceLayout'
import type { Primer, SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { PrimerHybridizationParams } from '../../domain/primerHybridization'
import type { PrimerPanePrimerRow, PrimerPaneSgRnaRow } from '../../domain/primerPaneEntries'
import type { SelectionRange } from '../sequence'
import { selectPrimerRowCommand } from './usePrimerManagementController'

type PaneEvent = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
type SelectionAnchor = { kind: 'primer'; forward: SelectionRange; reverse: SelectionRange } | null

export type PrimerPaneInteractionOptions = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  primerRows: PrimerPanePrimerRow[]
  sgRnaRows: PrimerPaneSgRnaRow[]
  selectedAlignmentTraceId: string | null
  selectedPrimerId: string | null
  selectedPrimerIds: string[]
  primerTabAnchorId: string | null
  featureVisibilityTargetIds: string[]
  hybridization: PrimerHybridizationParams
  getPrimerBindings: () => Array<{ primer: Primer; start: number; end: number; strand: 'forward' | 'reverse' }>
  setSelectedAlignmentTraceId: (id: string | null) => void
  setPrimerTabAnchorId: (id: string | null) => void
  setSelectedPrimerId: (id: string | null) => void
  setSelectedPrimerIds: (ids: string[]) => void
  setSelectedFeatureId: (id: string | null) => void
  setSelectedFeatureIds: (ids: string[]) => void
  setSelectionFocus: (focus: 'dna' | 'feature' | 'primer' | 'bond') => void
  setCutSelectionAnchor: (value: null) => void
  setCutStrandSelection: (value: null) => void
  setCutSelectionEnzymes: (value: null) => void
  setSelectedRange: (range: SelectionRange | null) => void
  setSelectionAnchor: (anchor: SelectionAnchor) => void
  setStatus: (status: string) => void
  setVisibility: (ids: string[], visible: boolean, memberId: string | null) => void
  setSgRnaVisibility: (annotations: readonly SgRNAAnnotation[], visible: boolean, memberId: string | null) => void
  setSingleVisibility: (primerId: string, visible: boolean, memberId: string | null) => void
  facingAmpliconRange: (selectedIds: string[]) => SelectionRange | null
}

export function usePrimerPaneInteractionController(options: PrimerPaneInteractionOptions) {
  const primersForMember = useCallback((memberId: string | null) => memberId ? (options.traceFiles.find((trace) => trace.id === memberId)?.primers ?? []) : options.record.primers, [options])
  const selectedPrimersInMember = useCallback((memberId: string | null, oligosOnly: boolean) => primersForMember(memberId)
    .filter((primer) => oligosOnly ? isSgRnaCloningOligo(primer) : !isSgRnaCloningOligo(primer))
    .filter((primer) => options.selectedAlignmentTraceId === memberId && (options.selectedPrimerIds.includes(primer.id) || options.selectedPrimerId === primer.id)), [options, primersForMember])
  const sgRnasForMember = useCallback((memberId: string | null) => groupSgRNAFeatures(memberId ? (options.traceFiles.find((trace) => trace.id === memberId)?.features ?? []) : options.record.features), [options])
  const selectedSgRnasInMember = useCallback((memberId: string | null) => {
    const ids = new Set(options.featureVisibilityTargetIds)
    return sgRnasForMember(memberId).filter((annotation) => ids.has(annotation.guide.id) || Boolean(annotation.pam && ids.has(annotation.pam.id)))
  }, [options, sgRnasForMember])
  const memberIds = useCallback(() => [null, ...(isDnaLibraryRecord(options.record) ? options.traceFiles.map((trace) => trace.id) : [])], [options])

  const setPrimersVisibilityForMember = useCallback((ids: string[], visible: boolean, memberId: string | null) => {
    if (ids.length) options.setVisibility(ids, visible, memberId)
  }, [options])
  const setOligoGroupPaneVisibility = useCallback((memberId: string | null, visible: boolean) => {
    const selected = selectedPrimersInMember(memberId, true)
    const targets = selected.length ? selected : primersForMember(memberId).filter(isSgRnaCloningOligo)
    setPrimersVisibilityForMember(targets.map((primer) => primer.id), visible, memberId)
  }, [primersForMember, selectedPrimersInMember, setPrimersVisibilityForMember])
  const setRegularPrimerGroupPaneVisibility = useCallback((visible: boolean) => {
    const selectedOnly = memberIds().some((memberId) => selectedPrimersInMember(memberId, false).length > 0)
    for (const memberId of memberIds()) {
      const targets = selectedOnly ? selectedPrimersInMember(memberId, false) : primersForMember(memberId).filter((primer) => !isSgRnaCloningOligo(primer))
      setPrimersVisibilityForMember(targets.map((primer) => primer.id), visible, memberId)
    }
  }, [memberIds, primersForMember, selectedPrimersInMember, setPrimersVisibilityForMember])
  const setSgRnaGroupPaneVisibility = useCallback((memberId: string | null, visible: boolean) => {
    const selected = selectedSgRnasInMember(memberId)
    const targets = selected.length ? selected : sgRnasForMember(memberId)
    if (targets.length) options.setSgRnaVisibility(targets, visible, memberId)
  }, [options, selectedSgRnasInMember, sgRnasForMember])
  const setPrimerVisibility = useCallback((primerId: string, visible: boolean, memberId: string | null = null) => options.setSingleVisibility(primerId, visible, memberId), [options])

  const focusPrimerTabSelection = useCallback((primerId: string, selectedIds: string[], memberId: string | null = null) => {
    const member = memberId ? options.traceFiles.find((trace) => trace.id === memberId) : null
    const sourcePrimers = member ? (member.primers ?? []) : options.record.primers
    const primer = sourcePrimers.find((entry) => entry.id === primerId)
    if (!primer) return
    const memberLayout = member ? resolveDisplayableLayoutsForPrimer(member.sequence, primer, options.hybridization)[0] : undefined
    const binding = member ? (memberLayout ? { start: memberLayout.templateStart, end: memberLayout.templateEnd, strand: memberLayout.strand } : null) : (options.getPrimerBindings().find((entry) => entry.primer.id === primerId) ?? null)
    options.setSelectedAlignmentTraceId(memberId); options.setCutSelectionAnchor(null); options.setCutStrandSelection(null); options.setCutSelectionEnzymes(null)
    options.setSelectedFeatureId(null); options.setSelectedFeatureIds([]); options.setSelectedPrimerId(primerId); options.setSelectedPrimerIds(selectedIds); options.setSelectionFocus('primer')
    if (selectedIds.length >= 2) {
      options.setSelectedRange(memberId ? null : options.facingAmpliconRange(selectedIds))
      if (binding) options.setSelectionAnchor({ kind: 'primer', forward: { start: binding.start, end: binding.end }, reverse: { start: binding.start, end: binding.end } })
      return
    }
    if (binding) {
      options.setSelectedRange({ start: binding.start, end: binding.end })
      options.setSelectionAnchor({ kind: 'primer', forward: { start: binding.start, end: binding.end }, reverse: { start: binding.start, end: binding.end } })
    } else {
      options.setSelectedRange(null); options.setSelectionAnchor(null)
    }
  }, [options])

  const selectPrimerTabRow = useCallback((entry: PrimerPanePrimerRow, event: PaneEvent) => {
    const groupRows = options.primerRows.filter((row) => row.memberId === entry.memberId)
    const selection = selectPrimerRowCommand({ rowIds: groupRows.map((row) => row.row.primer.id), primerId: entry.row.primer.id, memberId: entry.memberId, anchorId: options.primerTabAnchorId, selectedIds: options.selectedPrimerIds, selectedMemberId: options.selectedAlignmentTraceId, selectedPrimerId: options.selectedPrimerId, shiftKey: event.shiftKey, additive: event.metaKey || event.ctrlKey })
    if (!selection) return
    options.setPrimerTabAnchorId(selection.anchorId)
    if (selection.kind === 'clear') {
      options.setPrimerTabAnchorId(event.metaKey || event.ctrlKey ? selection.anchorId : null); options.setSelectedPrimerIds([]); options.setSelectedPrimerId(null); options.setSelectedAlignmentTraceId(selection.memberId); options.setSelectionFocus('dna')
      if (!event.shiftKey && !event.metaKey && !event.ctrlKey) { options.setSelectedRange(null); options.setSelectionAnchor(null) }
      options.setStatus(selection.status); return
    }
    focusPrimerTabSelection(selection.focusedId ?? entry.row.primer.id, selection.selectedIds, entry.memberId)
    if (selection.status) options.setStatus(selection.status)
  }, [focusPrimerTabSelection, options])

  return { setPrimersVisibilityForMember, setOligoGroupPaneVisibility, setRegularPrimerGroupPaneVisibility, setSgRnaGroupPaneVisibility, setPrimerVisibility, focusPrimerTabSelection, selectPrimerTabRow }
}
