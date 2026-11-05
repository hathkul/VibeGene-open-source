import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { parsePrimerDataTsv, type PrimerImportCandidate } from '../../domain/primerExport'
import { mergeIdenticalPrimers, primerNameConflicts } from '../../domain/primerNames'
import type { PrimerMerge, PrimerNameConflict } from '../../domain/primerNames'
import type { SequenceRecord } from '../../domain/types'
import type { PrimerPropertiesPayload } from '../../application/ports/hybridWindows'
import type { PrimerEditorState, SelectionRange, StrandPairSelection } from '../sequence'
import { formatThermoTemperature, selectionLength } from '../sequence'
import {
  primerAnnealedLength,
  preserveBindingsForFivePrimeInsertion,
  inferPrimerEditorAnneal,
} from '../primers/PrimerEditorDialog'
import { createId, extractRange, normalizeDna, reverseComplement } from '../../domain/sequence'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { sequenceRecordFromLibraryMember } from '../../domain/libraryMemberRecord'
import { recordFromHistoryNode } from '../../domain/historyRecord'
import { presentAnnealedInsert } from '../../domain/annealedOligos'
import { sgRnaOligoDescription } from '../../domain/sgrnaOligoPrimers'
import {
  hasComplexPrimerBindings,
  primerBindingLayoutRange,
  resolveDisplayableLayoutsForPrimer,
} from '../../domain/primerSequenceLayout'
import { calculateAnnealTemperature } from '../../domain/primerThermodynamics'
import { primerLengthError } from '../../domain/primerLimits'
import { isPrimerNameTaken } from '../../domain/primerNames'
import type { HistoryNode, HistoryOligo } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import {
  annealedOligoPairForSelection,
  newPrimerEditorName,
  primerEditingMemberId,
  sgRnaGuideOligoPair,
  sgRnaRecipeGuideForSenseSequence,
} from '../../application/primerWorkflow/primerEditing'
import {
  addPrimers as addPrimerTransition,
  deletePrimers as deletePrimerTransition,
  duplicatePrimers as duplicatePrimerTransition,
  refreshPrimerHybridization as refreshPrimerHybridizationTransition,
  savePrimer as savePrimerTransition,
  setPrimerColor as setPrimerColorTransition,
  setPrimerVisibility as setPrimerVisibilityTransition,
  exportPrimers as exportPrimersTransition,
  preparePrimerImport as preparePrimerImportTransition,
  type PrimerWorkflowContext,
  type PrimerWorkflowResult,
  type PrimerMutationResult,
} from '../../application/primerWorkflow/primerWorkflow'
import type { Primer } from '../../domain/types'
import type { PrimerListEntry } from '../../domain/primerExport'
import { normalizePrimerHybridizationParams, type PrimerHybridizationParams } from '../../domain/primerHybridization'

const DEFAULT_PRIMER_EDITOR_COLOR = '#7c3aed'

export type PrimerManagementCommandPorts = {
  getTraceFiles: () => TraceFileRecord[]
  getAlignmentsVisible: () => boolean
  getSelectedLibraryMember: () => TraceFileRecord | null
  getSelectedPrimers: () => Primer[]
  getPrimerBindings: () => Array<{ primer: Primer; start: number; end: number; strand: 'forward' | 'reverse' }>
  openUnsavedRecordsInNewTabs: (records: SequenceRecord[]) => void
  setSequenceScrollTarget: (position: number | null) => void
  selectedAlignmentTraceId: string | null
  setSelectedAlignmentTraceId: (id: string | null) => void
  selectedRange: SelectionRange | null
  selectionFocus: 'dna' | 'feature' | 'primer' | 'bond'
  cutStrandSelection: StrandPairSelection | null
  activeTab: string
  hybridization: PrimerHybridizationParams
  context: (hybridization?: PrimerHybridizationParams) => PrimerWorkflowContext
  apply: (result: PrimerWorkflowResult) => void
  setStatus: (status: string) => void
  setSelectedPrimerId: (id: string | null) => void
  setSelectedPrimerIds: (ids: string[]) => void
  setSelectionFocus: (focus: 'dna' | 'feature' | 'primer' | 'bond') => void
  setSelectedFeatureId: (id: string | null) => void
  setSelectedFeatureIds: (ids: string[]) => void
  setCutSelectionAnchor: (value: null) => void
  setCutStrandSelection: (value: null) => void
  setCutSelectionEnzymes: (value: null) => void
  setSelectedRange: (range: SelectionRange | null) => void
  setSelectionAnchor: (anchor: { kind: 'primer'; forward: SelectionRange; reverse: SelectionRange } | null) => void
}

export function shouldUseSelectedPrimerRange(
  selectedRange: SelectionRange | null,
  selectionFocus: PrimerManagementCommandPorts['selectionFocus'],
  cutStrandSelection: StrandPairSelection | null,
): selectedRange is SelectionRange {
  return selectionFocus === 'dna'
    && selectedRange !== null
    && cutStrandSelection === null
    && selectedRange.start !== selectedRange.end
}

export type PrimerWorkflowActionPorts = {
  context: () => PrimerWorkflowContext
  apply: (result: PrimerWorkflowResult) => void
  setStatus: (status: string) => void
  select?: (primers: readonly Primer[]) => void
  clearSelection?: () => void
}

export type PrimerRowSelectionInput = {
  rowIds: readonly string[]
  primerId: string
  memberId: string | null
  anchorId: string | null
  selectedIds: readonly string[]
  selectedMemberId: string | null
  selectedPrimerId: string | null
  shiftKey: boolean
  additive: boolean
}

export type PrimerRowSelectionResult = {
  kind: 'select' | 'clear'
  selectedIds: string[]
  focusedId: string | null
  anchorId: string | null
  memberId: string | null
  status: string
}

export function selectPrimerRowCommand(input: PrimerRowSelectionInput): PrimerRowSelectionResult | null {
  const clickedIndex = input.rowIds.indexOf(input.primerId)
  if (clickedIndex < 0) return null
  if (input.shiftKey && input.anchorId) {
    const anchorIndex = input.rowIds.indexOf(input.anchorId)
    if (anchorIndex >= 0) {
      const [lo, hi] = anchorIndex < clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex]
      const selectedIds = input.rowIds.slice(lo, hi + 1)
      return { kind: 'select', selectedIds, focusedId: input.primerId, anchorId: input.primerId, memberId: input.memberId, status: `Selected ${selectedIds.length} primers.` }
    }
  }
  if (input.additive) {
    const alreadySelected = input.selectedIds.includes(input.primerId) && input.selectedMemberId === input.memberId
    const selectedIds = alreadySelected
      ? input.selectedIds.filter((id) => id !== input.primerId)
      : input.selectedMemberId === input.memberId ? [...input.selectedIds, input.primerId] : [input.primerId]
    if (!selectedIds.length) return { kind: 'clear', selectedIds: [], focusedId: null, anchorId: input.primerId, memberId: input.memberId, status: 'Cleared primer selection.' }
    const focusedId = alreadySelected
      ? selectedIds.includes(input.selectedPrimerId ?? '')
        ? input.selectedPrimerId!
        : selectedIds[selectedIds.length - 1]!
      : input.primerId
    const anchorId = input.anchorId && input.selectedMemberId === input.memberId
      ? input.anchorId
      : input.primerId
    return { kind: 'select', selectedIds, focusedId, anchorId, memberId: input.memberId, status: `Selected ${selectedIds.length} primers.` }
  }
  const sole = input.selectedMemberId === input.memberId
    && ((input.selectedIds.length === 1 && input.selectedIds[0] === input.primerId)
      || (input.selectedIds.length === 0 && input.selectedPrimerId === input.primerId))
  if (sole) return { kind: 'clear', selectedIds: [], focusedId: null, anchorId: null, memberId: input.memberId, status: 'Cleared primer selection.' }
  return { kind: 'select', selectedIds: [input.primerId], focusedId: input.primerId, anchorId: input.primerId, memberId: input.memberId, status: '' }
}

function duplicatePrimerCommand(
  primers: readonly Primer[],
  selectedMemberId: string | null,
  ports: PrimerWorkflowActionPorts,
  createId: () => string,
) {
  if (!primers.length) {
    ports.setStatus('Select a primer to duplicate.')
    return
  }
  const result = duplicatePrimerTransition(ports.context(), primers, createId, selectedMemberId)
  ports.apply(result)
  ports.select?.(result.added)
  ports.setStatus(result.added.length === 1
    ? `Duplicated primer ${result.added[0]!.name}.`
    : `Duplicated ${result.added.length} primers.`)
}

function deletePrimerCommand(
  primers: readonly Primer[],
  editingMemberId: string | null,
  ports: PrimerWorkflowActionPorts,
) {
  if (!primers.length) {
    ports.setStatus('Select a primer to remove.')
    return
  }
  ports.apply(deletePrimerTransition(ports.context(), primers, editingMemberId))
  ports.clearSelection?.()
  ports.setStatus(primers.length === 1
    ? `Deleted primer ${primers[0]!.name}.`
    : `Deleted ${primers.length} primers.`)
}

function colorPrimerCommand(
  primerIds: readonly string[],
  color: string,
  memberId: string | null,
  ports: PrimerWorkflowActionPorts,
) {
  if (!primerIds.length) {
    ports.setStatus('Select a primer to change its color.')
    return
  }
  ports.apply(setPrimerColorTransition(ports.context(), primerIds, color, memberId))
  ports.setStatus(primerIds.length === 1 ? 'Updated primer color.' : `Updated color for ${primerIds.length} primers.`)
}

function visibilityPrimerCommand(
  primerIds: readonly string[],
  visible: boolean,
  memberId: string | null,
  ports: PrimerWorkflowActionPorts,
) {
  if (!primerIds.length) return
  ports.apply(setPrimerVisibilityTransition(ports.context(), primerIds, visible, memberId))
}

function singleVisibilityPrimerCommand(
  primerId: string,
  visible: boolean,
  memberId: string | null,
  selectedIds: readonly string[],
  selectedMemberId: string | null,
  ports: PrimerWorkflowActionPorts,
) {
  const source = memberId
    ? ports.context().members.find((member) => member.id === memberId)?.primers ?? []
    : ports.context().record.primers
  const scopedSelectedIds = selectedIds.filter((id) => source.some((primer) => primer.id === id))
  const ids = scopedSelectedIds.length > 1 && scopedSelectedIds.includes(primerId) && selectedMemberId === memberId
    ? scopedSelectedIds
    : [primerId]
  visibilityPrimerCommand(ids, visible, memberId, ports)
}

function refreshPrimerCommand(
  hybridization: PrimerHybridizationParams,
  templates: readonly string[],
  ports: PrimerWorkflowActionPorts,
) {
  const context = ports.context()
  const result = refreshPrimerHybridizationTransition({ ...context, hybridization }, templates)
  if (result.dropped.length > 0 || context.isLibrary) {
    ports.apply(result)
  }
  if (result.dropped.length) ports.clearSelection?.()
  ports.setStatus(result.dropped.length
    ? `Updated hybridization parameters. Removed ${result.dropped.length} primer${result.dropped.length === 1 ? '' : 's'} that no longer hybridize.`
    : 'Updated primer hybridization parameters (applies to all primers).')
}

function addImportedPrimerCommand(
  primers: readonly Primer[],
  ports: PrimerWorkflowActionPorts & { closeDialog: () => void },
) {
  if (!primers.length) {
    ports.closeDialog()
    return
  }
  const result = addPrimerTransition(ports.context(), primers)
  if (result.added.length || result.removed.length) ports.apply(result)
  if (result.added.length) ports.select?.(result.added)
  else if (result.removed.length) ports.clearSelection?.()
  ports.closeDialog()
  const addedNote = result.added.length === 1
    ? `Imported primer ${result.added[0]!.name}.`
    : `Imported ${result.added.length} primers.`
  const droppedNote = result.removed.length > 0
    ? ` Removed ${result.removed.length} previously stored primer${result.removed.length === 1 ? '' : 's'} that do not hybridize.`
    : ''
  ports.setStatus(`${addedNote}${droppedNote}`)
}

function addPickedPrimerCommand(
  primers: readonly Primer[],
  ports: PrimerWorkflowActionPorts & { closePicker: () => void },
) {
  ports.closePicker()
  if (!primers.length) return
  const result = addPrimerTransition(ports.context(), primers, { refreshExisting: false })
  if (result.added.length || result.removed.length) ports.apply(result)
  if (result.added.length) ports.select?.(result.added)
  const skipped = primers.length - result.added.length
  const addedNote = result.added.length === 1
    ? `Added picked primer ${result.added[0]!.name}.`
    : `Added ${result.added.length} picked primers.`
  const skippedNote = skipped > 0
    ? ` Skipped ${skipped} already present or not binding under the current hybridization parameters.`
    : ''
  ports.setStatus(`${addedNote}${skippedNote}`)
}

function addDatabasePrimerCommand(
  primers: readonly Primer[],
  listCount: number,
  skippedPresent: number,
  skippedNoHybrid: number,
  ports: PrimerWorkflowActionPorts,
) {
  const result = addPrimerTransition(ports.context(), primers)
  if (result.added.length || result.removed.length) ports.apply(result)
  if (result.added.length) ports.select?.(result.added)
  else if (result.removed.length) ports.clearSelection?.()
  const addedNote = result.added.length === 1
    ? `Added primer ${result.added[0]!.name} to the current sequence.`
    : `Added ${result.added.length} of ${listCount} primer${listCount === 1 ? '' : 's'} that hybridize under current parameters.`
  const presentNote = skippedPresent > 0 ? ` Skipped ${skippedPresent} already present.` : ''
  const hybridNote = skippedNoHybrid > 0 ? ` Discarded ${skippedNoHybrid} that did not hybridize.` : ''
  const droppedNote = result.removed.length > 0
    ? ` Removed ${result.removed.length} previously stored primer${result.removed.length === 1 ? '' : 's'} that do not hybridize.`
    : ''
  if (!result.added.length && skippedPresent && !skippedNoHybrid && !result.removed.length) {
    ports.setStatus('All selected primers are already on the current sequence.')
  } else if (!result.added.length && skippedNoHybrid && !skippedPresent && !result.removed.length) {
    ports.setStatus(`None of ${listCount} primer(s) hybridized under the current hybridization parameters.`)
  } else if (!result.added.length) {
    ports.setStatus(skippedNoHybrid || result.removed.length
      ? `No new primers added.${presentNote}${hybridNote}${droppedNote}`
      : 'No primers to add.')
  } else {
    ports.setStatus(`${addedNote}${presentNote}${hybridNote}${droppedNote}`)
  }
}

function exportPrimerCommand(
  primers: readonly Primer[],
  recordName: string,
  ports: Pick<PrimerWorkflowActionPorts, 'setStatus'> & {
    download: (fileName: string, contents: string, mimeType: string) => void
  },
) {
  if (!primers.length) {
    ports.setStatus('Select a primer to export.')
    return
  }
  const baseName = recordName.replace(/\.dna$/i, '')
  ports.download(`Primers from ${baseName}.txt`, exportPrimersTransition(primers), 'text/plain')
  ports.setStatus(primers.length === 1
    ? `Exported primer ${primers[0]!.name}.`
    : `Exported ${primers.length} primers.`)
}

function importPrimerListCommand(
  text: string,
  input: {
    template: string
    existing: readonly Primer[]
    hybridization: PrimerHybridizationParams
    options?: { additionalTemplates?: readonly string[]; additionalExistingPrimers?: readonly Primer[] }
  },
  ports: Pick<PrimerWorkflowActionPorts, 'setStatus'> & {
    openDialog: (state: PrimerImportDialogState) => void
  },
) {
  const entries = parsePrimerDataTsv(text)
  if (!entries.length) {
    ports.setStatus('No primers found in that list (expected name\\tsequence lines).')
    return
  }
  const { candidates, skipped } = preparePrimerImportTransition(
    input.template,
    entries,
    input.existing,
    input.hybridization,
    input.options,
  )
  if (!candidates.length) {
    ports.setStatus(`None of ${entries.length} primer(s) hybridized under the current hybridization parameters.`)
    return
  }
  ports.openDialog({ candidates, skipped })
  ports.setStatus(skipped > 0
    ? `Found ${candidates.length} hybridizing primer(s); ${skipped} skipped.`
    : `Found ${candidates.length} hybridizing primer(s).`)
}

function savePrimerEditorCommand(
  input: {
    mode: PrimerEditorState['mode']
    primerId?: string
    name: string
    sequence: string
    color: string
    description: string
    visible?: boolean
    bindings?: Primer['bindings']
    specificity?: Primer['specificity']
    thermoLabel: string
  },
  context: PrimerWorkflowContext,
  editingMemberId: string | null,
  ports: PrimerWorkflowActionPorts & { createId: () => string; onSaved: (primerId: string) => void },
) {
  const primer: Primer = {
    id: input.mode === 'edit' && input.primerId ? input.primerId : ports.createId(),
    name: input.name.trim(),
    sequence: input.sequence,
    color: input.color,
    description: input.description,
    visible: input.visible,
    bindings: input.bindings,
    specificity: input.specificity,
  }
  ports.apply(savePrimerTransition(context, primer, editingMemberId))
  ports.onSaved(primer.id)
  ports.setStatus(`${input.mode === 'edit' ? 'Updated primer' : 'Added primer'} ${primer.name}; Tm ${input.thermoLabel}.`)
}

export type PrimerImportDialogState = {
  candidates: PrimerImportCandidate[]
  skipped: number
}

/** Owns primer-editor and import-dialog state plus record-level primer normalization notices. */
export function usePrimerManagementController(
  record: SequenceRecord,
  setRecord: Dispatch<SetStateAction<SequenceRecord>>,
  commands: PrimerManagementCommandPorts,
) {
  const [primerEditor, setPrimerEditor] = useState<PrimerEditorState | null>(null)
  const [primerMergeNotice, setPrimerMergeNotice] = useState<PrimerMerge[] | null>(null)
  const [primerNameWarning, setPrimerNameWarning] = useState<PrimerNameConflict[] | null>(null)
  const warnedPrimerNameRecordRef = useRef<string | null>(null)
  const mergedPrimerStateRef = useRef<string | null>(null)
  const [libraryPrimer, setLibraryPrimer] = useState<PrimerPropertiesPayload | null>(null)
  const [primerOrientationOpen, setPrimerOrientationOpen] = useState(false)
  const [primerColorPickerOpen, setPrimerColorPickerOpen] = useState(false)
  const [hybridizationParamsOpen, setHybridizationParamsOpen] = useState(false)
  const [pickPrimersRange, setPickPrimersRange] = useState<SelectionRange | null>(null)
  const [primerImportDialog, setPrimerImportDialog] = useState<PrimerImportDialogState | null>(null)
  const [primersImportFromFileOpen, setPrimersImportFromFileOpen] = useState(false)

  useEffect(() => {
    const primerStateKey = `${record.id}\0${record.primers.map((primer) => `${primer.id}\0${primer.name}\0${primer.sequence}`).join('\u0001')}`
    if (mergedPrimerStateRef.current === primerStateKey) return
    mergedPrimerStateRef.current = primerStateKey
    const result = mergeIdenticalPrimers(record.primers)
    if (!result.merges.length) return
    setRecord((current) => current.id === record.id ? { ...current, primers: result.primers } : current)
    // Extracted legacy synchronization: the notice must accompany the automatic merge.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrimerMergeNotice(result.merges)
  }, [record.id, record.primers, setRecord])

  useEffect(() => {
    if (warnedPrimerNameRecordRef.current === record.id) return
    warnedPrimerNameRecordRef.current = record.id
    const conflicts = primerNameConflicts(record.primers)
    // Extracted legacy synchronization: warn once when a newly opened record has conflicts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (conflicts.length) setPrimerNameWarning(conflicts)
  }, [record.id, record.primers])

  function openPrimerEditorForPrimer(primerId: string, memberId?: string | null) {
    const traceFiles = commands.getTraceFiles()
    const resolvedMemberId =
      memberId !== undefined
        ? memberId
        : (!commands.getAlignmentsVisible() && isDnaLibraryRecord(record) ? commands.selectedAlignmentTraceId : null)
    const sourcePrimers = resolvedMemberId
      ? (traceFiles.find((trace) => trace.id === resolvedMemberId)?.primers ?? [])
      : record.primers
    const templateSequence = resolvedMemberId
      ? (traceFiles.find((trace) => trace.id === resolvedMemberId)?.sequence ?? record.sequence)
      : record.sequence
    const primer = sourcePrimers.find((candidate) => candidate.id === primerId)
    if (!primer) return
    if (resolvedMemberId !== commands.selectedAlignmentTraceId) commands.setSelectedAlignmentTraceId(resolvedMemberId)
    const exactBinding = resolvedMemberId
      ? undefined
      : commands.getPrimerBindings().find((binding) => binding.primer.id === primer.id)
    const displayableLayouts = resolveDisplayableLayoutsForPrimer(
      templateSequence,
      primer,
      commands.hybridization,
    )
    setPrimerEditor({
      mode: 'edit',
      primerId: primer.id,
      name: primer.name,
      sequence: primer.sequence,
      color: primer.color || DEFAULT_PRIMER_EDITOR_COLOR,
      description: primer.description ?? '',
      specificity: primer.specificity,
      phosphorylated: false,
      annealedLength: primerAnnealedLength(primer),
      strand: exactBinding?.strand ?? displayableLayouts[0]?.strand ?? primer.bindings?.[0]?.strand,
      bindings: primer.bindings,
    })
  }

  function inspectHistoryOligo(oligo: HistoryOligo) {
    const sequence = normalizeDna(oligo.sequence)
    setPrimerEditor({
      mode: 'create',
      name: oligo.name,
      sequence,
      color: DEFAULT_PRIMER_EDITOR_COLOR,
      description: oligo.description ?? '',
      phosphorylated: false,
      annealedLength: sequence.length,
    })
  }

  function openPrimerEditorFromSelection(strand: 'forward' | 'reverse') {
    const selectedRange = commands.selectedRange
    if (!selectedRange || commands.cutStrandSelection || selectedRange.start === selectedRange.end) {
      commands.setStatus('Select a sequence range before creating a primer.')
      return
    }
    const selectedLength = selectionLength(selectedRange, record.sequence.length)
    const lengthError = primerLengthError(selectedLength)
    if (lengthError) {
      setPrimerOrientationOpen(false)
      commands.setStatus(`${lengthError} Select a shorter range or use Actions → PCR to design primers for this region.`)
      return
    }
    const directSequence = extractRange(record.sequence, selectedRange.start, selectedRange.end)
    const sequence = strand === 'forward' ? directSequence : reverseComplement(directSequence)
    setPrimerOrientationOpen(false)
    setPrimerEditor({
      mode: 'create',
      name: newPrimerEditorName(strand, record.primers.length),
      sequence,
      color: DEFAULT_PRIMER_EDITOR_COLOR,
      description: '',
      phosphorylated: false,
      annealedLength: sequence.length,
      strand,
      sourceRange: selectedRange,
    })
  }

  function openAddPrimerFromMenu() {
    const selectedRange = commands.selectedRange
    if (shouldUseSelectedPrimerRange(selectedRange, commands.selectionFocus, commands.cutStrandSelection)) {
      const selectedLength = selectionLength(selectedRange, record.sequence.length)
      const lengthError = primerLengthError(selectedLength)
      if (lengthError) {
        commands.setStatus(`${lengthError} Select a shorter range or use Actions → PCR to design primers for this region.`)
        return
      }
      setPrimerOrientationOpen(true)
      return
    }
    setPrimerOrientationOpen(false)
    setPrimerEditor({
      mode: 'create',
      name: newPrimerEditorName(null, record.primers.length),
      sequence: '',
      color: DEFAULT_PRIMER_EDITOR_COLOR,
      description: '',
      phosphorylated: false,
      annealedLength: 0,
    })
  }

  function openEditSelectedPrimers() {
    const primer = commands.getSelectedPrimers()[0]
    if (!primer) {
      commands.setStatus('Select a primer to edit.')
      return
    }
    openPrimerEditorForPrimer(primer.id, commands.getSelectedLibraryMember()?.id ?? null)
  }

  function duplicateSelectedPrimers() {
    const primers = commands.getSelectedPrimers()
    duplicatePrimerCommand(primers, commands.getSelectedLibraryMember()?.id ?? null, {
      context: commands.context,
      apply: commands.apply,
      setStatus: commands.setStatus,
      clearSelection: () => {
        commands.setSelectedPrimerId(null)
        commands.setSelectedPrimerIds([])
      },
      select: (added) => {
        commands.setSelectedPrimerId(added[0]?.id ?? null)
        commands.setSelectedPrimerIds(added.map((primer) => primer.id))
        commands.setSelectionFocus('primer')
      },
    }, () => createId('primer'))
  }

  function removeSelectedPrimers() {
    const primers = commands.getSelectedPrimers()
    const editingMemberId = primerEditingMemberId({
      activeTab: commands.activeTab,
      alignmentsVisible: commands.getAlignmentsVisible(),
      isLibrary: isDnaLibraryRecord(record),
      selectedAlignmentTraceId: commands.selectedAlignmentTraceId,
    })
    deletePrimerCommand(primers, editingMemberId, {
      context: commands.context,
      apply: commands.apply,
      setStatus: commands.setStatus,
      clearSelection: () => {
        commands.setSelectedPrimerId(null)
        commands.setSelectedPrimerIds([])
        commands.setSelectionFocus('dna')
      },
    })
  }

  function openPrimerColorPicker() {
    if (!commands.getSelectedPrimers().length) {
      commands.setStatus('Select a primer to change its color.')
      return
    }
    setPrimerColorPickerOpen(true)
  }

  function applyPrimerColor(color: string) {
    const ids = new Set(commands.getSelectedPrimers().map((primer) => primer.id))
    colorPrimerCommand([...ids], color, commands.getSelectedLibraryMember()?.id ?? null, {
      context: commands.context,
      apply: commands.apply,
      setStatus: commands.setStatus,
    })
    setPrimerColorPickerOpen(false)
  }

  function openAnnealedInsert(insert: ReturnType<typeof presentAnnealedInsert>) {
    if (!insert) {
      commands.setStatus('These oligos do not form one double-stranded piece.')
      return
    }
    commands.openUnsavedRecordsInNewTabs([insert])
    commands.setStatus(`Opened ${insert.name}.`)
  }

  function openAnnealedHistoryInsert(node: HistoryNode, guideId: string) {
    const pair = sgRnaGuideOligoPair(node.sgRnaCloning, guideId)
    if (!pair) {
      commands.setStatus('This guide does not have both a sense and an antisense oligo.')
      return
    }
    const parent = node.id === record.history?.id ? record : recordFromHistoryNode(node)
    openAnnealedInsert(presentAnnealedInsert({
      parent,
      sense: { name: pair.sense.name, sequence: pair.sense.sequence, description: sgRnaOligoDescription('sense') },
      antisense: { name: pair.antisense.name, sequence: pair.antisense.sequence, description: sgRnaOligoDescription('antisense') },
      guide: {
        id: pair.guide.sourceGuideId,
        name: pair.guide.name,
        spacer: pair.guide.targetSpacer,
        expressedGuide: pair.guide.expressedGuide,
        nuclease: pair.guide.nuclease,
      },
    }))
  }

  function openSelectedAnnealedOligos() {
    const selectedLibraryMember = commands.getSelectedLibraryMember()
    const sourcePrimers = selectedLibraryMember?.primers ?? record.primers
    const pair = annealedOligoPairForSelection(commands.getSelectedPrimers(), sourcePrimers)
    if (!pair) {
      commands.setStatus('Select a complementary oligo pair to open as double-stranded DNA.')
      return
    }
    const parent = selectedLibraryMember
      ? sequenceRecordFromLibraryMember(selectedLibraryMember, { topology: record.topology })
      : record
    const recipeGuide = sgRnaRecipeGuideForSenseSequence(record.history?.sgRnaCloning, pair.sense.sequence)
    openAnnealedInsert(presentAnnealedInsert({
      parent,
      sense: { name: pair.sense.name, sequence: pair.sense.sequence, description: pair.sense.description },
      antisense: { name: pair.antisense.name, sequence: pair.antisense.sequence, description: pair.antisense.description },
      guide: recipeGuide ? {
        id: recipeGuide.sourceGuideId,
        name: recipeGuide.name,
        spacer: recipeGuide.targetSpacer,
        expressedGuide: recipeGuide.expressedGuide,
        nuclease: recipeGuide.nuclease,
      } : undefined,
    }))
  }

  function savePrimerEditor(next: PrimerEditorState) {
    const editingMemberId = primerEditingMemberId({
      activeTab: commands.activeTab,
      alignmentsVisible: commands.getAlignmentsVisible(),
      isLibrary: isDnaLibraryRecord(record),
      selectedAlignmentTraceId: commands.selectedAlignmentTraceId,
    })
    const traceFiles = commands.getTraceFiles()
    const editingMember = editingMemberId
      ? traceFiles.find((trace) => trace.id === editingMemberId)
      : null
    const templateSequence = editingMember?.sequence ?? record.sequence
    const normalizedSequence = normalizeDna(next.sequence)
    const lengthError = primerLengthError(normalizedSequence.length)
    if (lengthError) {
      commands.setStatus(lengthError)
      return
    }
    const primerNameScope = editingMember?.primers ?? record.primers
    if (isPrimerNameTaken(primerNameScope, next.name, next.mode === 'edit' ? next.primerId : null)) {
      commands.setStatus(`A primer named “${next.name.trim()}” already exists in this file. Choose a unique name.`)
      return
    }
    const annealInfo = inferPrimerEditorAnneal(
      normalizeDna(templateSequence),
      normalizedSequence,
      next.strand,
      next.bindings,
    )
    const thermo = calculateAnnealTemperature(annealInfo.terminalSequence)
    const hybridization = normalizePrimerHybridizationParams(commands.hybridization)
    const revealBinding = annealInfo.bindings?.[0]
    const revealRange = revealBinding ? primerBindingLayoutRange(revealBinding) : next.sourceRange
    const revealStart = revealRange?.start ?? null
    const revealEnd = revealRange?.end ?? null

    const existing = next.mode === 'edit' && next.primerId
      ? (editingMember?.primers ?? record.primers).find((primer) => primer.id === next.primerId)
      : undefined
    const preservedBindings = existing?.bindings?.length && hasComplexPrimerBindings(existing.bindings)
      ? existing.sequence === normalizedSequence
        ? existing.bindings
        : preserveBindingsForFivePrimeInsertion(existing, normalizedSequence) ?? annealInfo.bindings
      : undefined
    let savedPrimerId: string | null = null
    savePrimerEditorCommand({
      mode: next.mode,
      primerId: next.primerId,
      name: next.name,
      sequence: normalizedSequence,
      color: next.color,
      description: next.description,
      specificity: next.specificity,
      visible: existing?.visible,
      bindings: preservedBindings,
      thermoLabel: formatThermoTemperature(thermo),
    }, commands.context(hybridization), editingMemberId, {
      context: commands.context,
      apply: commands.apply,
      setStatus: commands.setStatus,
      createId: () => createId('primer'),
      onSaved: (primerId) => { savedPrimerId = primerId },
    })

    setPrimerEditor(null)

    // Keep the primer in view: closing the dialog + new primer lanes reflow row heights, which
    // would otherwise leave scrollTop unchanged and drift the genomic viewport away.
    if (revealStart !== null) {
      if (savedPrimerId) {
        commands.setSelectedFeatureId(null)
        commands.setSelectedFeatureIds([])
        commands.setCutSelectionAnchor(null)
        commands.setCutStrandSelection(null)
        commands.setCutSelectionEnzymes(null)
        commands.setSelectedPrimerId(savedPrimerId)
        commands.setSelectedPrimerIds([savedPrimerId])
        commands.setSelectionFocus('primer')
      }
      if (revealEnd !== null && revealEnd > revealStart) {
        commands.setSelectedRange({ start: revealStart, end: revealEnd })
        commands.setSelectionAnchor({
          kind: 'primer',
          forward: { start: revealStart, end: revealEnd },
          reverse: { start: revealStart, end: revealEnd },
        })
      }
      commands.setSequenceScrollTarget(null)
      queueMicrotask(() => commands.setSequenceScrollTarget(revealStart))
    }
  }

  function savePrimerSpecificity(specificity: Primer['specificity']) {
    if (!primerEditor?.primerId) return
    const memberId = primerEditingMemberId({
      activeTab: commands.activeTab,
      alignmentsVisible: commands.getAlignmentsVisible(),
      isLibrary: isDnaLibraryRecord(record),
      selectedAlignmentTraceId: commands.selectedAlignmentTraceId,
    })
    const member = memberId ? commands.getTraceFiles().find((entry) => entry.id === memberId) : undefined
    const primer = (member?.primers ?? record.primers).find((entry) => entry.id === primerEditor.primerId)
    if (!primer) return
    commands.apply(savePrimerTransition(commands.context(), { ...primer, specificity }, memberId))
  }

  return {
    primerEditor,
    setPrimerEditor,
    primerMergeNotice,
    setPrimerMergeNotice,
    primerNameWarning,
    setPrimerNameWarning,
    libraryPrimer,
    setLibraryPrimer,
    primerOrientationOpen,
    setPrimerOrientationOpen,
    primerColorPickerOpen,
    setPrimerColorPickerOpen,
    hybridizationParamsOpen,
    setHybridizationParamsOpen,
    pickPrimersRange,
    setPickPrimersRange,
    primerImportDialog,
    setPrimerImportDialog,
    primersImportFromFileOpen,
    setPrimersImportFromFileOpen,
    duplicatePrimers: (
      context: PrimerWorkflowContext,
      primers: readonly Primer[],
      createId: () => string,
      selectedMemberId: string | null,
    ): PrimerMutationResult => duplicatePrimerTransition(context, primers, createId, selectedMemberId),
    deletePrimers: (
      context: PrimerWorkflowContext,
      primers: readonly Primer[],
      editingMemberId: string | null,
    ): PrimerMutationResult => deletePrimerTransition(context, primers, editingMemberId),
    setPrimerVisibility: (
      context: PrimerWorkflowContext,
      primerIds: readonly string[],
      visible: boolean,
      memberId: string | null,
    ): PrimerWorkflowResult => setPrimerVisibilityTransition(context, primerIds, visible, memberId),
    setPrimerColor: (
      context: PrimerWorkflowContext,
      primerIds: readonly string[],
      color: string,
      memberId: string | null,
    ): PrimerWorkflowResult => setPrimerColorTransition(context, primerIds, color, memberId),
    savePrimer: (
      context: PrimerWorkflowContext,
      primer: Primer,
      editingMemberId: string | null,
    ): PrimerWorkflowResult => savePrimerTransition(context, primer, editingMemberId),
    addPrimers: (
      context: PrimerWorkflowContext,
      incoming: readonly Primer[],
    ): PrimerMutationResult => addPrimerTransition(context, incoming),
    refreshPrimerHybridization: (
      context: PrimerWorkflowContext,
      templates: readonly string[],
    ) => refreshPrimerHybridizationTransition(context, templates),
    exportPrimers: (primers: readonly Primer[]): string => exportPrimersTransition(primers),
    preparePrimerImport: (
      template: string,
      entries: readonly PrimerListEntry[],
      existing: readonly Primer[],
      hybridization: PrimerHybridizationParams,
      options?: { additionalTemplates?: readonly string[]; additionalExistingPrimers?: readonly Primer[] },
    ) => preparePrimerImportTransition(template, entries, existing, hybridization, options),
    duplicatePrimerCommand,
    deletePrimerCommand,
    colorPrimerCommand,
    visibilityPrimerCommand,
    singleVisibilityPrimerCommand,
    refreshPrimerCommand,
    addImportedPrimerCommand,
    addPickedPrimerCommand,
    addDatabasePrimerCommand,
    exportPrimerCommand,
    importPrimerListCommand,
    savePrimerEditorCommand,
    savePrimerSpecificity,
    selectPrimerRowCommand,
    openPrimerEditorForPrimer,
    inspectHistoryOligo,
    openPrimerEditorFromSelection,
    openAddPrimerFromMenu,
    openEditSelectedPrimers,
    duplicateSelectedPrimers,
    removeSelectedPrimers,
    openPrimerColorPicker,
    applyPrimerColor,
    openAnnealedInsert,
    openAnnealedHistoryInsert,
    openSelectedAnnealedOligos,
    savePrimerEditor,
  }
}
