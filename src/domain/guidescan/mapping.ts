import { groupSgRNAFeatures, findSgRNATargets, type SgRNATargetHit } from '../sgrna'
import type { GenomicReferenceAnchor } from '../dnaComparisonTypes'
import type { SequenceRecord, Strand } from '../types'
import { enzymePamInfo } from './organisms'
import {
  chromosomesMatch,
  getGenomicAnchor,
  recordIndexToGenomic,
} from './anchor'
import type { GuideScanGuideCandidate, GuideScanOffTargetCounts } from './types'

/** Brief copy for design-table and validation metric (i) controls. */
export const GUIDESCAN_METRIC_HELP = {
  specificity:
    'Specificity (Spec.): 0–1 aggregate CFD-based uniqueness vs the genome; higher means fewer or weaker predicted off-targets. Defined for 20-nt guides.',
  cuttingEfficiency:
    'Cutting efficiency (Cut): 0–1 predicted on-target cutting (Doench Rule Set 2); higher means more likely to cut the intended site.',
  offTargets:
    'Off-targets: counts of other genomic sites by mismatch distance (0 = perfect match, 1–3 = mismatches, 4+ = ≥4). Shown as “N at 0, …”. GuideScan2 includes the intended on-target in the distance-0 API count; Vibegene subtracts that one match so “0” here means no other perfect matches.',
} as const

/**
 * GuideScan2 `distance-0-off-targets` includes the intended on-target perfect match
 * (see sample payloads: distance-0 is 1 while the detailed off-target list has no distance-0 hits).
 */
export function guideScanOffTargetCountsForDisplay(counts: GuideScanOffTargetCounts): GuideScanOffTargetCounts {
  return {
    ...counts,
    distance0: counts.distance0 > 0 ? counts.distance0 - 1 : 0,
  }
}

function formatOffTargetCountParts(counts: GuideScanOffTargetCounts): string[] {
  return [
    counts.distance0 ? `${counts.distance0} at 0` : '',
    counts.distance1 ? `${counts.distance1} at 1` : '',
    counts.distance2 ? `${counts.distance2} at 2` : '',
    counts.distance3 ? `${counts.distance3} at 3` : '',
    counts.distance4 ? `${counts.distance4} at 4+` : '',
  ].filter(Boolean)
}

export function guideScanPamSide(enzyme: string): '3prime' | '5prime' {
  return enzymePamInfo(enzyme).pamSide
}

/** Human-readable nuclease label for GuideScan enzyme ids. */
export function guideScanNucleaseLabel(enzyme: string): string {
  if (enzyme === 'cpf1') return 'Cas12a / Cpf1'
  if (enzyme === 'cas9') return 'SpCas9'
  return enzyme
}

/** Preset id stored on sgRNA drafts/features so edit/validation can rematch SpCas9 / Cas12a. */
export function guideScanNucleasePresetId(enzyme: string): string {
  if (enzyme === 'cpf1') return 'Cas12a'
  if (enzyme === 'cas9') return 'SpCas9'
  return enzyme
}

export function formatGuideScanMappingSummary(mapped: number, total: number, targetLabel: string): string {
  const name = targetLabel.trim() || 'the opened sequence'
  return `${mapped} of ${total} candidates map to ${name}`
}

export function formatGuideScanOffTargetSummary(counts: GuideScanGuideCandidate['offTargetCounts']): string {
  const parts = formatOffTargetCountParts(guideScanOffTargetCountsForDisplay(counts))
  return parts.length ? parts.join(', ') : 'none reported'
}

function flipStrand(strand: Strand): Strand {
  return strand === 'forward' ? 'reverse' : 'forward'
}

/** GuideScan reports reference-genome strand; stored gene DNA may be reverse-oriented. */
export function genomicStrandToRecordStrand(
  anchor: GenomicReferenceAnchor,
  genomicStrand: Strand,
): Strand {
  return anchor.strand === 'reverse' ? flipStrand(genomicStrand) : genomicStrand
}

function recordStrandToGenomicStrand(
  anchor: GenomicReferenceAnchor,
  recordStrand: Strand,
): Strand {
  return genomicStrandToRecordStrand(anchor, recordStrand)
}

function hitGenomicTarget(
  anchor: GenomicReferenceAnchor,
  hit: SgRNATargetHit,
): { start: number; end: number; strand: Strand } | null {
  const indices: number[] = []
  for (const segment of [...hit.guideLocations, ...hit.pamLocations]) {
    for (let index = segment.start; index < segment.end; index += 1) {
      indices.push(index)
    }
  }
  if (!indices.length) return null
  const genomicCoords = indices.map((index) => recordIndexToGenomic(anchor, index))
  return {
    start: Math.min(...genomicCoords),
    end: Math.max(...genomicCoords),
    strand: recordStrandToGenomicStrand(anchor, hit.strand),
  }
}

function genomicTargetMatchesCandidate(
  candidate: GuideScanGuideCandidate,
  target: { start: number; end: number; strand: Strand },
): boolean {
  return (
    target.start === candidate.start
    && target.end === candidate.end
    && target.strand === candidate.strand
  )
}

export function mapGuideScanCandidateToHit(
  candidate: GuideScanGuideCandidate,
  record: SequenceRecord,
  enzyme: string,
): SgRNATargetHit | null {
  const pam = enzymePamInfo(enzyme)
  const hits = findSgRNATargets(record.sequence, candidate.spacer, record.topology, {
    pamMotif: pam.pam,
    pamSide: pam.pamSide,
    guideMinLength: candidate.spacer.length,
    guideMaxLength: candidate.spacer.length,
  })

  const anchor = getGenomicAnchor(record)
  const recordStrand = anchor
    ? genomicStrandToRecordStrand(anchor, candidate.strand)
    : candidate.strand
  const strandHits = hits.filter((hit) => hit.strand === recordStrand)

  if (anchor && chromosomesMatch(anchor.chromosome, candidate.chromosome)) {
    const coordinateMatches = strandHits.filter((hit) => {
      const target = hitGenomicTarget(anchor, hit)
      return target && genomicTargetMatchesCandidate(candidate, target)
    })
    if (coordinateMatches.length === 1) return coordinateMatches[0]!
    if (coordinateMatches.length > 1) return null
  }

  if (anchor) {
    if (strandHits.length === 1) return strandHits[0]!
    return null
  }

  if (strandHits.length === 1) return strandHits[0]!
  if (strandHits.length > 1) return null
  const oppositeHits = hits.filter((hit) => hit.strand === flipStrand(recordStrand))
  if (oppositeHits.length === 1) return oppositeHits[0]!
  return null
}

export function sgRNAAnnotationExists(record: SequenceRecord, hit: SgRNATargetHit, spacer: string): boolean {
  return groupSgRNAFeatures(record.features).some((entry) => {
    if (entry.spacer !== spacer) return false
    return entry.guide.locations.some((location) =>
      hit.guideLocations.some((part) =>
        part.start === location.start && part.end === location.end && part.strand === location.strand,
      ),
    )
  })
}

export function defaultGuideScanGuideName(
  candidate: GuideScanGuideCandidate,
  index: number,
  existingCount: number,
  enzyme: string,
): string {
  const base = candidate.regionName?.trim() || `GuideScan ${candidate.rank || index + 1}`
  return `sgRNA ${existingCount + index + 1} (${base}, ${guideScanNucleasePresetId(enzyme)})`
}
