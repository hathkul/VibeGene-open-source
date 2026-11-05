import type { EnsemblLookup } from '../externalSequences/ensembl'
import type { GenomicReferenceAnchor } from '../dnaComparisonTypes'
import type { SequenceFeature, SequenceRecord, Strand } from '../types'
import { featureBounds } from '../sequence'

/** RefSeq reference chromosome accessions (human, mouse GRCm39, mitochondria). */
export function chromosomeFromRefSeqAccession(accession: string): string | null {
  const match = /^NC_(\d{6})(?:\.\d+)?$/i.exec(accession.trim())
  if (!match) return null
  const index = Number(match[1])

  if (index === 12_920) return 'chrM' // NC_012920 — Homo sapiens mitochondrion
  if (index === 5089) return 'chrM' // NC_005089 — Mus musculus mitochondrion

  if (index >= 1 && index <= 22) return `chr${index}` // NC_000001..NC_000022 — human autosomes
  if (index === 23) return 'chrX' // NC_000023
  if (index === 24) return 'chrY' // NC_000024

  if (index >= 67 && index <= 85) return `chr${index - 66}` // NC_000067..NC_000085 — mouse chr1..19
  if (index === 86) return 'chrX' // NC_000086
  if (index === 87) return 'chrY' // NC_000087

  return null
}

export function formatChromosomeForGuideScan(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return trimmed
  const fromRefSeq = chromosomeFromRefSeqAccession(trimmed)
  if (fromRefSeq) return fromRefSeq
  return /^chr/i.test(trimmed) ? trimmed : `chr${trimmed}`
}

export function chromosomesMatch(left: string, right: string): boolean {
  const normalize = (value: string) => value.trim().replace(/^chr/i, '').toLowerCase()
  return normalize(left) === normalize(right)
}

export function withGenomicAnchor(record: SequenceRecord, anchor: GenomicReferenceAnchor): SequenceRecord {
  return {
    ...record,
    dna: { ...record.dna, genomicAnchor: anchor },
  }
}

export function getGenomicAnchor(record: SequenceRecord): GenomicReferenceAnchor | null {
  const stored = record.dna?.genomicAnchor
  if (stored?.chromosome && stored.start > 0 && stored.end >= stored.start) return stored

  const accession = record.externalSource?.accession?.trim() ?? ''
  if (/^NC_/i.test(accession) && record.sequence.length > 0) {
    return {
      organism: inferOrganismFromAssembly(record.externalSource?.assembly) ?? '',
      chromosome: formatChromosomeForGuideScan(accession),
      start: 1,
      end: record.sequence.length,
      strand: 'forward',
    }
  }
  return null
}

function inferOrganismFromAssembly(assembly: string | undefined): string | null {
  const value = (assembly ?? '').toLowerCase()
  if (value.includes('grch38') || value.includes('hg38')) return 'hg38'
  if (value.includes('grch37') || value.includes('hg19')) return 'hg19'
  if (value.includes('grcm39') || value.includes('mm39')) return 'mm39'
  if (value.includes('grcm38') || value.includes('mm10')) return 'mm10'
  return null
}

export function anchorFromEnsemblGene(
  lookup: EnsemblLookup,
  organism: string,
  sequenceLength: number,
): GenomicReferenceAnchor | null {
  const region = lookup.seq_region_name?.trim()
  const start = Number(lookup.start)
  const end = Number(lookup.end)
  if (!region || !Number.isFinite(start) || !Number.isFinite(end) || sequenceLength <= 0) return null
  const strand: Strand = lookup.strand === -1 ? 'reverse' : 'forward'
  const genomicStart = Math.min(start, end)
  const genomicEnd = Math.max(start, end)
  return {
    organism,
    chromosome: formatChromosomeForGuideScan(region),
    start: genomicStart,
    end: genomicEnd,
    strand,
  }
}

export function recordIndexToGenomic(anchor: GenomicReferenceAnchor, index0: number): number {
  if (anchor.strand === 'forward') return anchor.start + index0
  return anchor.end - index0
}

export function genomicToRecordIndex(anchor: GenomicReferenceAnchor, genomic1: number): number {
  if (anchor.strand === 'forward') return genomic1 - anchor.start
  return anchor.end - genomic1
}

export function genomicRangeForRecordSpan(
  anchor: GenomicReferenceAnchor,
  start0: number,
  endExclusive: number,
): { start: number; end: number } | null {
  if (endExclusive <= start0) return null
  const lastIndex = endExclusive - 1
  const genomicStart = recordIndexToGenomic(anchor, start0)
  const genomicEnd = recordIndexToGenomic(anchor, lastIndex)
  return {
    start: Math.min(genomicStart, genomicEnd),
    end: Math.max(genomicStart, genomicEnd),
  }
}

export function genomicTargetForSelection(
  record: SequenceRecord,
  selection: { start: number; end: number },
): { chromosome: string; start: number; end: number; name?: string } | null {
  const anchor = getGenomicAnchor(record)
  if (!anchor) return null
  const range = genomicRangeForRecordSpan(anchor, selection.start, selection.end)
  if (!range) return null
  return {
    chromosome: anchor.chromosome,
    ...range,
    name: `${anchor.chromosome}:${range.start}-${range.end}`,
  }
}

export function genomicTargetForFeature(
  record: SequenceRecord,
  feature: SequenceFeature,
): { chromosome: string; start: number; end: number; name?: string } | null {
  const anchor = getGenomicAnchor(record)
  if (!anchor) return null
  const bounds = featureBounds(feature)
  const range = genomicRangeForRecordSpan(anchor, bounds.start, bounds.end)
  if (!range) return null
  return {
    chromosome: anchor.chromosome,
    ...range,
    name: feature.name?.trim() || `${anchor.chromosome}:${range.start}-${range.end}`,
  }
}

export function genomicAnchorHint(record: SequenceRecord): string {
  if (getGenomicAnchor(record)) return ''
  return 'No reference genomic coordinates on this sequence; feature and selection modes use raw DNA lookup in the chosen genome.'
}

/** Index of `needle` in `haystack`, or null when there is not exactly one match. */
export function uniqueDnaSubstringIndex(haystack: string, needle: string): number | null {
  if (!needle.length || haystack.length < needle.length) return null
  let first = -1
  let count = 0
  let searchFrom = 0
  while (searchFrom <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, searchFrom)
    if (index === -1) break
    if (count === 0) first = index
    count += 1
    if (count > 1) return null
    searchFrom = index + 1
  }
  return count === 1 ? first : null
}

/** NCBI efetch FASTA `strand=1|2` orientation for window → 1-based genomic coordinate. */
export function ncbiFastaWindowIndexToGenomic(
  windowStart1: number,
  windowEnd1: number,
  index0InWindow: number,
  fetchedStrand: 'forward' | 'reverse',
): number {
  if (fetchedStrand === 'forward') return windowStart1 + index0InWindow
  return windowEnd1 - index0InWindow
}

/**
 * Build a genomic anchor when RefSeqGene 5′/3′ ends are placed on the reference.
 * Returns null unless the genomic span length matches the record length exactly.
 */
export function genomicAnchorFromRefSeqGeneEnds(
  organism: string,
  chromosome: string,
  recordLength: number,
  fivePrimeGenomic1: number,
  threePrimeGenomic1: number,
): GenomicReferenceAnchor | null {
  if (recordLength <= 0) return null
  const low = Math.min(fivePrimeGenomic1, threePrimeGenomic1)
  const high = Math.max(fivePrimeGenomic1, threePrimeGenomic1)
  if (high - low + 1 !== recordLength) return null
  const strand: Strand = fivePrimeGenomic1 <= threePrimeGenomic1 ? 'forward' : 'reverse'
  return { organism, chromosome, start: low, end: high, strand }
}
