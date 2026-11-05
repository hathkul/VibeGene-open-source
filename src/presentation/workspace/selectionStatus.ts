import { formatRange } from '../../domain/sequence'
import { formatSequenceLength } from '../../domain/moleculeCapabilities'
import type { RestrictionSiteScanState } from '../../domain/restrictionSiteScan'
import type { Primer, ProteinBond, SequenceFeature, SequenceRecord } from '../../domain/types'
import { featureDisplayName } from '../map/mapPrimitives'
import { selectionLength } from '../sequence/sequenceRenderingHelpers'
import type { SelectionFocus, SelectionRange, StrandPairSelection } from '../sequence'
import { isSelectionBarEchoStatus } from '../sequence/sequenceShared'

function formatStrandPairSelection(selection: StrandPairSelection) {
  const forward = `${formatRange(selection.forward.start, selection.forward.end)} (+)`
  const reverse = `${formatRange(selection.reverse.start, selection.reverse.end)} (-)`
  return `${forward}, ${reverse}`
}

/** Longer of the two strand spans (sticky fragments may differ by overhang). */
function strandPairSelectionLength(selection: StrandPairSelection, sequenceLength: number) {
  return Math.max(
    selectionLength(selection.forward, sequenceLength),
    selectionLength(selection.reverse, sequenceLength),
  )
}

export function formatStrandPairSelectionWithLength(selection: StrandPairSelection, sequenceLength: number) {
  return `${formatStrandPairSelection(selection)} (${strandPairSelectionLength(selection, sequenceLength).toLocaleString()} bp)`
}

export type SelectionStatusSummaryInput = {
  molecule: SequenceRecord['molecule']
  sequenceLength: number
  cutStrandSelection: StrandPairSelection | null
  selectionFocus: SelectionFocus
  selectedFeatureIds: readonly string[]
  selectedFeature: SequenceFeature | null
  selectedPrimerIds: readonly string[]
  selectedPrimerId: string | null
  primers: readonly Primer[]
  selectedProteinBond: ProteinBond | null
  selectedRange: SelectionRange | null
  selectedAnnotation: { name: string } | null
}

/**
 * Selection-bar summary precedence, preserved exactly from the inline App.tsx
 * chain: sticky/cut selection, multiple features, multiple primers (with PCR
 * range when a non-empty range exists), caret, ordinary range (with annotation
 * name), single feature, protein bond, single primer, then "Selected: None".
 */
export function buildSelectionStatusSummary(input: SelectionStatusSummaryInput): string {
  const {
    molecule,
    sequenceLength,
    cutStrandSelection,
    selectionFocus,
    selectedFeatureIds,
    selectedFeature,
    selectedPrimerIds,
    selectedPrimerId,
    primers,
    selectedProteinBond,
    selectedRange,
    selectedAnnotation,
  } = input
  if (cutStrandSelection) {
    return `Selected: ${formatStrandPairSelectionWithLength(cutStrandSelection, sequenceLength)}`
  }
  if (selectedFeatureIds.length >= 2 && selectionFocus === 'feature') {
    return `Selected: ${selectedFeatureIds.length} features`
  }
  if (selectedPrimerIds.length >= 2 && selectionFocus === 'primer') {
    if (selectedRange && selectedRange.start !== selectedRange.end) {
      return `Selected: ${selectedPrimerIds.length} primers · ${formatRange(selectedRange.start, selectedRange.end)} (${formatSequenceLength(selectionLength(selectedRange, sequenceLength), molecule)})`
    }
    return `Selected: ${selectedPrimerIds.length} primers`
  }
  if (selectedRange && selectedRange.start === selectedRange.end) {
    return `Caret: ${(selectedRange.start + 1).toLocaleString()}`
  }
  if (selectedRange) {
    return `Selected: ${formatRange(selectedRange.start, selectedRange.end)} (${formatSequenceLength(selectionLength(selectedRange, sequenceLength), molecule)})${selectedAnnotation ? ` - ${selectedAnnotation.name}` : ''}`
  }
  if (selectionFocus === 'feature' && selectedFeature) {
    return `Selected: ${featureDisplayName(selectedFeature)}`
  }
  if (selectionFocus === 'bond' && selectedProteinBond) {
    return `Selected: ${selectedProteinBond.name || 'Bond'}`
  }
  if (selectionFocus === 'primer' && selectedPrimerId) {
    return `Selected: ${primers.find((primer) => primer.id === selectedPrimerId)?.name ?? 'Primer'}`
  }
  return 'Selected: None'
}

export type SelectionBarStatusInput = {
  status: string
  enzymeScan: RestrictionSiteScanState
  isDirty: boolean
}

/** Joins the status-echo fragments with the existing ' · ' separator. */
export function buildSelectionBarStatusEcho({ status, enzymeScan, isDirty }: SelectionBarStatusInput): string {
  return [
    isSelectionBarEchoStatus(status) ? '' : status,
    enzymeScan.pending ? 'Scanning restriction sites…' : '',
    enzymeScan.stage === 'error' ? `Enzyme scan failed: ${enzymeScan.error ?? 'unknown error'}` : '',
    isDirty ? 'Unsaved changes' : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
