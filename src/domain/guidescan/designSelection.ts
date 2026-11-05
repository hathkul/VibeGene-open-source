import { fetchNcbiGeneGenomicSummary } from '../externalSequences/ncbi'
import type { GenomicReferenceAnchor } from '../dnaComparisonTypes'
import type { SequenceRecord } from '../types'
import {
  formatChromosomeForGuideScan,
  getGenomicAnchor,
  withGenomicAnchor,
} from './anchor'
import { formatGuideScanCoordinate } from './client'
import {
  buildGuideScanSelectionFailureCopy,
  type GuideScanDesignRegionSelection,
  type GuideScanSelectionFailureCopy,
} from './designRegionSelection'
import { guideScanDesignEligibilityForRecord } from './eligibility'
import { anchorRefSeqGeneOnReference, resolveGuideScanGeneSymbol } from './gene'
import { isLikelyEntrezGeneId } from './geneIdentity'
import { guideScanTargetForFeature, guideScanTargetForSelection } from './target'
import type { GuideScanCoordinateTarget } from './types'

/** True when selection mode can attempt genomic placement (anchor or gene identity). */
export function selectionModeHasGenomicPlacementPath(record: SequenceRecord): boolean {
  if (getGenomicAnchor(record)) return true
  return guideScanDesignEligibilityForRecord(record).eligible
}

function ncbiAssemblyMatchesGuideScanOrganism(organism: string, assemblyaccver: string | undefined): boolean {
  if (!assemblyaccver?.trim()) return true
  const value = assemblyaccver.toLowerCase()
  if (organism === 'mm39') return value.includes('grcm39') || value.includes('mm39')
  return value.includes('grch38') || value.includes('hg38')
}

async function entrezIdForSelectionAnchor(
  record: SequenceRecord,
  organism: string,
  signal: AbortSignal | undefined,
): Promise<string | null> {
  const eligibility = guideScanDesignEligibilityForRecord(record)
  if (eligibility.eligible) {
    if (eligibility.identity.kind === 'entrez_gene') {
      return eligibility.identity.entrezId
    }
    if (isLikelyEntrezGeneId(eligibility.queryText)) {
      return eligibility.queryText.trim()
    }
    try {
      const resolved = await resolveGuideScanGeneSymbol(organism, eligibility.queryText, { signal })
      if (resolved.entrezId?.trim()) return resolved.entrezId.trim()
    } catch {
      return null
    }
  }
  return null
}

export type GuideScanSelectionCoordinateResult =
  | {
      ok: true
      coordinates: GuideScanCoordinateTarget
      coordinateQuery: string
      anchor: GenomicReferenceAnchor
      logLines: string[]
    }
  | { ok: false; failure: GuideScanSelectionFailureCopy }

export async function resolveGuideScanSelectionCoordinates(input: {
  record: SequenceRecord
  selection: GuideScanDesignRegionSelection
  organism: string
  organismLabel: string
  signal?: AbortSignal
  onProgress?: (message: string) => void
  /** Session anchor from an earlier placement in this dialog run. */
  sessionAnchor?: GenomicReferenceAnchor | null
}): Promise<GuideScanSelectionCoordinateResult> {
  const { record, selection, organism, organismLabel, signal, onProgress } = input
  const logLines: string[] = []

  const effectiveAnchor = input.sessionAnchor ?? getGenomicAnchor(record)
  if (effectiveAnchor) {
    const anchoredRecord = withGenomicAnchor(record, effectiveAnchor)
    const coordinates = guideScanSelectionCoordinateForAnchoredRecord(anchoredRecord, selection)
    if (coordinates) {
      const coordinateQuery = formatGuideScanCoordinate(coordinates)
      logLines.push(`Using stored genome coordinates: ${coordinateQuery}`)
      return {
        ok: true,
        coordinates,
        coordinateQuery,
        anchor: effectiveAnchor,
        logLines,
      }
    }
  }

  const entrezId = await entrezIdForSelectionAnchor(record, organism, signal)
  if (!entrezId) {
    return {
      ok: false,
      failure: buildGuideScanSelectionFailureCopy({
        recordName: record.name,
        organismLabel,
        detail: 'no genome coordinates and no Entrez Gene identity on this record',
      }),
    }
  }

  onProgress?.(`Locating ${record.name} on ${organismLabel}…`)
  try {
    const summary = await fetchNcbiGeneGenomicSummary(entrezId, signal)
    if (!summary) {
      return {
        ok: false,
        failure: buildGuideScanSelectionFailureCopy({
          recordName: record.name,
          organismLabel,
          detail: `NCBI has no genome location for Entrez ${entrezId}`,
        }),
      }
    }
    if (!ncbiAssemblyMatchesGuideScanOrganism(organism, summary.assemblyaccver)) {
      return {
        ok: false,
        failure: buildGuideScanSelectionFailureCopy({
          recordName: record.name,
          organismLabel,
          detail: `NCBI assembly ${summary.assemblyaccver ?? 'unknown'} does not match ${organismLabel}`,
        }),
      }
    }

    const resolvedAnchor = await anchorRefSeqGeneOnReference(
      summary,
      record.sequence,
      organism,
      signal,
    )
    if (!resolvedAnchor) {
      const chrLabel = /^NC_/i.test(summary.chraccver)
        ? formatChromosomeForGuideScan(summary.chraccver)
        : summary.chraccver
      return {
        ok: false,
        failure: buildGuideScanSelectionFailureCopy({
          recordName: record.name,
          organismLabel,
          detail: `sequence ends could not be placed on ${chrLabel}`,
        }),
      }
    }

    const placedRecord = withGenomicAnchor(record, resolvedAnchor)
    const coordinates = guideScanSelectionCoordinateForAnchoredRecord(placedRecord, selection)
    if (!coordinates) {
      return {
        ok: false,
        failure: buildGuideScanSelectionFailureCopy({
          recordName: record.name,
          organismLabel,
          detail: 'placed anchor could not map the selected span',
        }),
      }
    }
    const coordinateQuery = formatGuideScanCoordinate(coordinates)
    logLines.push(`Located ${record.name} on ${organismLabel}: ${coordinateQuery}`)
    return {
      ok: true,
      coordinates,
      coordinateQuery,
      anchor: resolvedAnchor,
      logLines,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      failure: buildGuideScanSelectionFailureCopy({
        recordName: record.name,
        organismLabel,
        detail,
      }),
    }
  }
}

export function guideScanSelectionCoordinateForAnchoredRecord(
  record: SequenceRecord,
  selection: GuideScanDesignRegionSelection,
): GuideScanCoordinateTarget | null {
  const span = { start: selection.start, end: selection.end }
  if (selection.kind === 'feature' && selection.featureId) {
    const feature = record.features.find((entry) => entry.id === selection.featureId)
    if (feature) {
      const target = guideScanTargetForFeature(record, feature)
      if (target.available) return target.resolved.coordinates
    }
  }
  const target = guideScanTargetForSelection(record, span)
  return target.available ? target.resolved.coordinates : null
}
