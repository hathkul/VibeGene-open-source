import { featureBounds, formatRange } from '../sequence'
import type { SequenceRecord } from '../types'

export type GuideScanDesignRegionSelection = {
  kind: 'feature' | 'range'
  start: number
  end: number
  label: string
  featureId?: string
}

export type GuideScanSelectionFailureCopy = {
  headline: string
  instructions: string
  logLine: string
}

function selectionSpanLength(
  start: number,
  end: number,
  sequenceLength: number,
): number {
  if (end === start) return 0
  return end > start ? end - start : sequenceLength - start + end
}

export function isNonEmptyDnaSelection(
  range: { start: number; end: number },
  sequenceLength: number,
): boolean {
  return selectionSpanLength(range.start, range.end, sequenceLength) > 0
}

export function formatGuideScanSelectionRangeLabel(
  start: number,
  end: number,
  sequenceLength: number,
  featureName?: string,
): string {
  const rangeText = formatRange(start, end)
    .replace(/^(\d+)\.\.(\d+)$/, (_, from, to) => `${Number(from).toLocaleString('en-US')}..${Number(to).toLocaleString('en-US')}`)
  const bp = selectionSpanLength(start, end, sequenceLength)
  if (featureName?.trim()) {
    return `${featureName.trim()} (${rangeText})`
  }
  return `${rangeText} (${bp.toLocaleString('en-US')} bp)`
}

export function guideScanDesignRegionSelectionForWorkspace(input: {
  record: SequenceRecord
  selectionFocus: 'dna' | 'feature' | 'primer' | 'bond'
  selectedFeatureId: string | null
  selectedRange: { start: number; end: number } | null
}): GuideScanDesignRegionSelection | null {
  const { record, selectionFocus, selectedFeatureId, selectedRange } = input
  const sequenceLength = record.sequence.length
  if (!sequenceLength) return null

  if (selectionFocus === 'feature' && selectedFeatureId) {
    const feature = record.features.find((entry) => entry.id === selectedFeatureId)
    if (feature?.locations.length) {
      const bounds = featureBounds(feature)
      return {
        kind: 'feature',
        start: bounds.start,
        end: bounds.end,
        featureId: feature.id,
        label: formatGuideScanSelectionRangeLabel(
          bounds.start,
          bounds.end,
          sequenceLength,
          feature.name?.trim() || feature.type,
        ),
      }
    }
  }

  if (selectedRange && isNonEmptyDnaSelection(selectedRange, sequenceLength)) {
    return {
      kind: 'range',
      start: selectedRange.start,
      end: selectedRange.end,
      label: formatGuideScanSelectionRangeLabel(
        selectedRange.start,
        selectedRange.end,
        sequenceLength,
      ),
    }
  }

  return null
}

export function buildGuideScanSelectionFailureCopy(input: {
  recordName: string
  organismLabel: string
  detail: string
}): GuideScanSelectionFailureCopy {
  const recordName = input.recordName.trim() || 'this sequence'
  const detail = input.detail.trim()
  const headline =
    `The selected region can't be used as a GuideScan target: "${recordName}" is not linked to the ${input.organismLabel} reference genome (no genome coordinates, and its sequence could not be placed on the genome). GuideScan2 only designs guides for regions of a reference genome.`
  const instructions =
    'To continue: 1) switch Target to "Gene / Entrez ID", enter the gene and press Design; 2) press "Open <gene> and add…" (or download the gene via Database) to open its genomic record; 3) in that record select the stretch, reopen Design sgRNA and choose "Selected region".'
  const logLine = detail
    ? `The selected region can't be used as a GuideScan target: ${detail}`
    : headline
  return { headline, instructions, logLine }
}
