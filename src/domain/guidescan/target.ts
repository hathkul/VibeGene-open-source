import { extractRange } from '../sequence'
import type { SequenceFeature, SequenceRecord } from '../types'
import {
  genomicTargetForFeature,
  genomicTargetForSelection,
  getGenomicAnchor,
} from './anchor'
import type { GuideScanCoordinateTarget } from './types'

/**
 * Design targets resolved to GuideScan genomic coordinates only.
 * Raw DNA genome-lookup design is unsupported; use gene/Entrez design or gRNA validation.
 */
export type GuideScanResolvedTarget = {
  delivery: 'coordinates'
  coordinates: GuideScanCoordinateTarget
}

export type GuideScanTargetAvailability =
  | { available: true; resolved: GuideScanResolvedTarget }
  | { available: false; reason: string }

const NO_COORDS_REASON =
  'GuideScan design needs genomic coordinates or a gene symbol / Entrez ID. Raw DNA lookup is not supported.'

export function guideScanTargetForSelection(
  record: SequenceRecord,
  selection: { start: number; end: number },
): GuideScanTargetAvailability {
  if (selection.end <= selection.start) {
    return { available: false, reason: 'Select a non-empty DNA stretch on the sequence.' }
  }

  const coordinates = genomicTargetForSelection(record, selection)
  if (!coordinates) {
    return { available: false, reason: NO_COORDS_REASON }
  }
  return {
    available: true,
    resolved: { delivery: 'coordinates', coordinates },
  }
}

export function guideScanTargetForFeature(
  record: SequenceRecord,
  feature: SequenceFeature,
): GuideScanTargetAvailability {
  if (!feature.locations.length) {
    return { available: false, reason: 'Selected feature has no location.' }
  }

  const coordinates = genomicTargetForFeature(record, feature)
  if (!coordinates) {
    return { available: false, reason: NO_COORDS_REASON }
  }
  return {
    available: true,
    resolved: { delivery: 'coordinates', coordinates },
  }
}

/** @deprecated Kept for UI compile; raw DNA design is unsupported. */
export function guideScanSequenceResolutionHint(record: SequenceRecord): string {
  if (getGenomicAnchor(record)) return ''
  return NO_COORDS_REASON
}

/** @deprecated Prefer genomicTargetForFeature; retained for callers extracting feature DNA locally. */
export function extractFeatureReferenceDna(
  record: SequenceRecord,
  feature: SequenceFeature,
): { ok: true; sequence: string } | { ok: false; reason: string } {
  if (!feature.locations.length) {
    return { ok: false, reason: 'Selected feature has no location.' }
  }
  if (feature.locations.length !== 1) {
    return { ok: false, reason: 'Gapped or multi-segment features cannot be reduced to one DNA span.' }
  }
  const location = feature.locations[0]!
  if (location.end <= location.start && record.topology !== 'circular') {
    return { ok: false, reason: 'Origin-spanning features require a circular sequence.' }
  }
  return { ok: true, sequence: extractRange(record.sequence, location.start, location.end) }
}
