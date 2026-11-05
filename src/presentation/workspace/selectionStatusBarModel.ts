import { formatSequenceLength } from '../../domain/moleculeCapabilities'
import type { RestrictionSiteScanState } from '../../domain/restrictionSiteScan'
import { gcContent } from '../../domain/sequence'
import type { SequenceRecord } from '../../domain/types'
import { formatMapZoomRange } from '../map'
import type { SelectionRange } from '../sequence'
import {
  buildSelectionBarStatusEcho,
  buildSelectionStatusSummary,
  type SelectionStatusSummaryInput,
} from './selectionStatus'

export type SelectionStatusBarModel = {
  isDirty: boolean
  /** Present when the map zoom readout is visible; hides length/GC spans. */
  zoom: { zoomedLengthLabel: string; rangeLabel: string } | null
  summary: string
  sequenceLengthLabel: string
  gcLabel: string | null
  /** Present only for the Sequence workspace on DNA records. */
  counts: { features: number; primerBindings: number; visibleEnzymeSites: number } | null
  statusEcho: string
}

export type SelectionStatusBarModelInput = {
  isDirty: boolean
  mapViewZoomEnabled: boolean
  mapZoomRange: SelectionRange | null
  molecule: SequenceRecord['molecule']
  sequence: string
  summary: SelectionStatusSummaryInput
  showWorkspaceCounts: boolean
  featureCount: number
  primerBindingCount: number
  visibleEnzymeSiteCount: number
  status: string
  enzymeScan: RestrictionSiteScanState
}

/**
 * Deterministic view-model for the selection/status bar, preserving the exact
 * inline App.tsx derivations: zoom readout gating, sequence-length/GC labels,
 * Sequence-tab workspace counts, selection-summary precedence, and status echo.
 */
export function buildSelectionStatusBarModel(
  input: SelectionStatusBarModelInput,
): SelectionStatusBarModel {
  const zoom = input.mapViewZoomEnabled && input.mapZoomRange
    ? {
        zoomedLengthLabel: formatSequenceLength(
          input.mapZoomRange.end - input.mapZoomRange.start,
          input.molecule,
        ),
        rangeLabel: formatMapZoomRange(input.mapZoomRange),
      }
    : null
  return {
    isDirty: input.isDirty,
    zoom,
    summary: buildSelectionStatusSummary(input.summary),
    sequenceLengthLabel: formatSequenceLength(input.sequence.length, input.molecule),
    gcLabel: input.molecule === 'dna' ? `${gcContent(input.sequence).toFixed(1)}% GC` : null,
    counts: input.showWorkspaceCounts
      ? {
          features: input.featureCount,
          primerBindings: input.primerBindingCount,
          visibleEnzymeSites: input.visibleEnzymeSiteCount,
        }
      : null,
    statusEcho: buildSelectionBarStatusEcho({
      status: input.status,
      enzymeScan: input.enzymeScan,
      isDirty: input.isDirty,
    }),
  }
}
