import { useMemo } from 'react'
import type { PrimerWorkflowContext, PrimerWorkflowResult } from '../../application/primerWorkflow/primerWorkflow'
import {
  hasRegularPrimerPaneSelection as hasRegularPrimerPaneSelectionProjection,
  selectedPrimersForMenu as selectedPrimersForMenuProjection,
  selectedPrimersInPaneMember as selectedPrimersInPaneMemberProjection,
  selectedSgRnasInPaneMember as selectedSgRnasInPaneMemberProjection,
} from '../../application/primerWorkflow/primerPaneProjection'
import { ampliconRangeForFacingPrimerSelection } from '../../domain/pcr'
import type { PrimerHybridizationParams } from '../../domain/primerHybridization'
import type { PrimerPanePrimerRow, PrimerPaneSgRnaRow } from '../../domain/primerPaneEntries'
import type { SgRNAAnnotation } from '../../domain/sgrna'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { Primer, SequenceRecord } from '../../domain/types'
import type { SelectionRange } from '../sequence'
import { usePrimerPaneInteractionController } from './usePrimerPaneInteractionController'

type PrimerSelectionWorkflowPorts = {
  context: () => PrimerWorkflowContext
  apply: (result: PrimerWorkflowResult) => void
  setStatus: (status: string) => void
}

export type PrimerSelectionControllerOptions = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  selectedLibraryMember: TraceFileRecord | null
  selectedAlignmentTraceId: string | null
  selectedPrimerId: string | null
  selectedPrimerIds: string[]
  primerTabAnchorId: string | null
  featureVisibilityTargetIds: string[]
  primerRows: PrimerPanePrimerRow[]
  sgRnaRows: PrimerPaneSgRnaRow[]
  hybridization: PrimerHybridizationParams
  getPrimerBindings: () => Array<{ primer: Primer; start: number; end: number; strand: 'forward' | 'reverse' }>
  visibilityPrimerCommand: (primerIds: readonly string[], visible: boolean, memberId: string | null, ports: PrimerSelectionWorkflowPorts) => void
  singleVisibilityPrimerCommand: (primerId: string, visible: boolean, memberId: string | null, selectedIds: readonly string[], selectedMemberId: string | null, ports: PrimerSelectionWorkflowPorts) => void
  context: () => PrimerWorkflowContext
  apply: (result: PrimerWorkflowResult) => void
  setSgRnaVisibility: (annotations: readonly SgRNAAnnotation[], visible: boolean, memberId: string | null) => void
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
  setSelectionAnchor: (anchor: { kind: 'primer'; forward: SelectionRange; reverse: SelectionRange } | null) => void
  setStatus: (status: string) => void
}

export function usePrimerSelectionController(options: PrimerSelectionControllerOptions) {
  const { record, traceFiles } = options

  const selectedPrimersForMenu = useMemo(
    () => selectedPrimersForMenuProjection(record, options.selectedLibraryMember, {
      selectedPrimerId: options.selectedPrimerId,
      selectedPrimerIds: options.selectedPrimerIds,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirrors the pre-extraction memo granularity (record.primers only)
    [record.primers, options.selectedLibraryMember, options.selectedPrimerId, options.selectedPrimerIds],
  )

  const hasPrimerSelected = selectedPrimersForMenu.length > 0
  const canShowSelectedPrimers = useMemo(
    () => selectedPrimersForMenu.some((primer) => primer.visible === false),
    [selectedPrimersForMenu],
  )
  const canHideSelectedPrimers = useMemo(
    () => selectedPrimersForMenu.some((primer) => primer.visible !== false),
    [selectedPrimersForMenu],
  )

  function selectedPrimersInPaneMember(memberId: string | null, oligosOnly: boolean) {
    return selectedPrimersInPaneMemberProjection(record, traceFiles, memberId, oligosOnly, {
      selectedAlignmentTraceId: options.selectedAlignmentTraceId,
      selectedPrimerId: options.selectedPrimerId,
      selectedPrimerIds: options.selectedPrimerIds,
    })
  }

  function selectedSgRnasInPaneMember(memberId: string | null) {
    return selectedSgRnasInPaneMemberProjection(record, traceFiles, memberId, options.featureVisibilityTargetIds)
  }

  function hasRegularPrimerPaneSelection() {
    return hasRegularPrimerPaneSelectionProjection(record, traceFiles, {
      selectedAlignmentTraceId: options.selectedAlignmentTraceId,
      selectedPrimerId: options.selectedPrimerId,
      selectedPrimerIds: options.selectedPrimerIds,
    })
  }

  function setPrimersVisibility(primerIds: string[], visible: boolean) {
    if (!primerIds.length) return
    options.visibilityPrimerCommand(primerIds, visible, options.selectedLibraryMember?.id ?? null, {
      context: options.context,
      apply: options.apply,
      setStatus: options.setStatus,
    })
  }

  function showSelectedPrimers() {
    setPrimersVisibility(
      selectedPrimersForMenu.map((primer) => primer.id),
      true,
    )
  }

  function hideSelectedPrimers() {
    setPrimersVisibility(
      selectedPrimersForMenu.map((primer) => primer.id),
      false,
    )
  }

  function facingPrimerAmpliconRange(selectedIds: string[]) {
    return ampliconRangeForFacingPrimerSelection(
      record.topology,
      record.sequence.length,
      selectedIds,
      options.getPrimerBindings().map((entry) => ({
        primerId: entry.primer.id,
        strand: entry.strand,
        start: entry.start,
        end: entry.end,
      })),
    )
  }

  const {
    setOligoGroupPaneVisibility,
    setRegularPrimerGroupPaneVisibility,
    setSgRnaGroupPaneVisibility,
    setPrimerVisibility,
    focusPrimerTabSelection,
    selectPrimerTabRow,
  } = usePrimerPaneInteractionController({
    record,
    traceFiles,
    primerRows: options.primerRows,
    sgRnaRows: options.sgRnaRows,
    selectedAlignmentTraceId: options.selectedAlignmentTraceId,
    selectedPrimerId: options.selectedPrimerId,
    selectedPrimerIds: options.selectedPrimerIds,
    primerTabAnchorId: options.primerTabAnchorId,
    featureVisibilityTargetIds: options.featureVisibilityTargetIds,
    hybridization: options.hybridization,
    getPrimerBindings: options.getPrimerBindings,
    setSelectedAlignmentTraceId: options.setSelectedAlignmentTraceId,
    setPrimerTabAnchorId: options.setPrimerTabAnchorId,
    setSelectedPrimerId: options.setSelectedPrimerId,
    setSelectedPrimerIds: options.setSelectedPrimerIds,
    setSelectedFeatureId: options.setSelectedFeatureId,
    setSelectedFeatureIds: options.setSelectedFeatureIds,
    setSelectionFocus: options.setSelectionFocus,
    setCutSelectionAnchor: options.setCutSelectionAnchor,
    setCutStrandSelection: options.setCutStrandSelection,
    setCutSelectionEnzymes: options.setCutSelectionEnzymes,
    setSelectedRange: options.setSelectedRange,
    setSelectionAnchor: options.setSelectionAnchor,
    setStatus: options.setStatus,
    setVisibility: (ids, visible, memberId) => options.visibilityPrimerCommand(ids, visible, memberId, { context: options.context, apply: options.apply, setStatus: options.setStatus }),
    setSingleVisibility: (primerId, visible, memberId) => options.singleVisibilityPrimerCommand(primerId, visible, memberId, options.selectedPrimerIds, options.selectedAlignmentTraceId, { context: options.context, apply: options.apply, setStatus: options.setStatus }),
    setSgRnaVisibility: options.setSgRnaVisibility,
    facingAmpliconRange: facingPrimerAmpliconRange,
  })

  return {
    selectedPrimersForMenu,
    hasPrimerSelected,
    canShowSelectedPrimers,
    canHideSelectedPrimers,
    selectedPrimersInPaneMember,
    selectedSgRnasInPaneMember,
    hasRegularPrimerPaneSelection,
    showSelectedPrimers,
    hideSelectedPrimers,
    facingPrimerAmpliconRange,
    setOligoGroupPaneVisibility,
    setRegularPrimerGroupPaneVisibility,
    setSgRnaGroupPaneVisibility,
    setPrimerVisibility,
    focusPrimerTabSelection,
    selectPrimerTabRow,
  }
}
