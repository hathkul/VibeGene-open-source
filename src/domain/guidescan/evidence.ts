import type { Strand } from '../types'
import { formatGuideScanOffTargetSummary } from './mapping'
import type {
  GuideScanGuideCandidate,
  GuideScanGuideValidationResult,
  GuideScanOffTargetCounts,
} from './types'

/** Qualifier key written on the guide feature (canonical). PAM may carry a copy for grouping tolerance. */
export const GUIDESCAN_EVIDENCE_QUALIFIER = 'vibegene_guidescan'

export const GUIDESCAN_EVIDENCE_VERSION = 1 as const

export type GuideScanEvidenceSource = 'design' | 'validation'

/** Validation (and rare design failures) outcome; designed hits are always `found`. */
export type GuideScanEvidenceOutcome = 'found' | 'not_found' | 'error'

/**
 * Compact, versioned GuideScan2 evidence retained on an sgRNA annotation.
 * Off-target hit lists are summarized as counts only — never the full array.
 */
export type GuideScanEvidence = {
  version: typeof GUIDESCAN_EVIDENCE_VERSION
  source: GuideScanEvidenceSource
  /** ISO-8601 capture time when meaningful. */
  capturedAt: string
  organism: string
  enzyme: string
  jobId?: string
  /** Query / spacer sequence sent to or returned by GuideScan. */
  querySequence?: string
  rank?: number
  chromosome?: string
  /** GuideScan genomic coordinates (1-based inclusive). */
  start?: number
  end?: number
  strand?: Strand
  specificity?: number | null
  cuttingEfficiency?: number | null
  offTargetCounts?: GuideScanOffTargetCounts
  /** Short annotations list (truncated); empty array means none. */
  annotations?: string[]
  outcome: GuideScanEvidenceOutcome
  message?: string | null
}

const MAX_ANNOTATIONS = 8
const MAX_ANNOTATION_CHARS = 80
const MAX_MESSAGE_CHARS = 240

function truncateText(value: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, Math.max(0, max - 1))}…`
}

function sanitizeAnnotations(annotations: readonly string[] | undefined): string[] | undefined {
  if (!annotations?.length) return annotations ? [] : undefined
  return annotations
    .map((entry) => truncateText(String(entry), MAX_ANNOTATION_CHARS))
    .filter(Boolean)
    .slice(0, MAX_ANNOTATIONS)
}

function sanitizeCounts(counts: GuideScanOffTargetCounts | undefined): GuideScanOffTargetCounts | undefined {
  if (!counts) return undefined
  return {
    distance0: Math.max(0, Math.floor(counts.distance0 || 0)),
    distance1: Math.max(0, Math.floor(counts.distance1 || 0)),
    distance2: Math.max(0, Math.floor(counts.distance2 || 0)),
    distance3: Math.max(0, Math.floor(counts.distance3 || 0)),
    distance4: Math.max(0, Math.floor(counts.distance4 || 0)),
  }
}

function candidateFields(guide: GuideScanGuideCandidate | null | undefined): Partial<GuideScanEvidence> {
  if (!guide) return {}
  return {
    querySequence: guide.spacer || guide.sequence || undefined,
    rank: guide.rank > 0 ? guide.rank : undefined,
    chromosome: guide.chromosome || undefined,
    start: Number.isFinite(guide.start) ? guide.start : undefined,
    end: Number.isFinite(guide.end) ? guide.end : undefined,
    strand: guide.strand,
    specificity: guide.specificity ?? null,
    cuttingEfficiency: guide.cuttingEfficiency ?? null,
    offTargetCounts: sanitizeCounts(guide.offTargetCounts),
    annotations: sanitizeAnnotations(guide.annotations),
  }
}

export function evidenceFromDesignCandidate(
  candidate: GuideScanGuideCandidate,
  options?: { jobId?: string | null; capturedAt?: string },
): GuideScanEvidence {
  return {
    version: GUIDESCAN_EVIDENCE_VERSION,
    source: 'design',
    capturedAt: options?.capturedAt ?? new Date().toISOString(),
    organism: candidate.organism,
    enzyme: candidate.enzyme,
    jobId: options?.jobId?.trim() || undefined,
    outcome: 'found',
    message: null,
    ...candidateFields(candidate),
  }
}

export function evidenceFromValidationResult(
  result: GuideScanGuideValidationResult,
  options?: { capturedAt?: string; outcome?: GuideScanEvidenceOutcome; message?: string | null },
): GuideScanEvidence {
  const outcome = options?.outcome
    ?? (result.found ? 'found' : 'not_found')
  const message = options?.message !== undefined
    ? options.message
    : (result.errorMessage ?? (outcome === 'found' ? null : 'Guide not found in GuideScan2 database.'))
  return {
    version: GUIDESCAN_EVIDENCE_VERSION,
    source: 'validation',
    capturedAt: options?.capturedAt ?? new Date().toISOString(),
    organism: result.organism,
    enzyme: result.enzyme,
    jobId: result.jobId || undefined,
    querySequence: result.querySequence || result.guide?.spacer || undefined,
    outcome,
    message: message == null ? null : truncateText(String(message), MAX_MESSAGE_CHARS),
    ...candidateFields(result.guide),
  }
}

export function evidenceFromValidationError(input: {
  organism: string
  enzyme: string
  querySequence: string
  message: string
  jobId?: string | null
  capturedAt?: string
}): GuideScanEvidence {
  return {
    version: GUIDESCAN_EVIDENCE_VERSION,
    source: 'validation',
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    organism: input.organism,
    enzyme: input.enzyme,
    jobId: input.jobId?.trim() || undefined,
    querySequence: input.querySequence || undefined,
    outcome: 'error',
    message: truncateText(input.message, MAX_MESSAGE_CHARS),
  }
}

/** True when evidence still matches the current spacer / nuclease enzyme / reference genome. */
export function guideScanEvidenceMatchesContext(
  evidence: GuideScanEvidence | null | undefined,
  context: { spacer: string; enzyme: string; organism: string },
): boolean {
  if (!evidence) return false
  const spacer = context.spacer.trim().toUpperCase()
  const enzyme = context.enzyme.trim().toLowerCase()
  const organism = context.organism.trim()
  if (!spacer || !enzyme || !organism) return false
  if (evidence.organism !== organism) return false
  if (evidence.enzyme.trim().toLowerCase() !== enzyme) return false
  const query = (evidence.querySequence ?? '').trim().toUpperCase()
  if (query && query !== spacer) return false
  return true
}

export function formatGuideScanEvidenceSourceLabel(evidence: GuideScanEvidence): string {
  return evidence.source === 'design' ? 'Designed' : 'Validated'
}

export function formatGuideScanEvidenceLocation(evidence: GuideScanEvidence): string {
  if (!evidence.chromosome || evidence.start == null || evidence.end == null) return '—'
  const strand = evidence.strand === 'reverse' ? '−' : evidence.strand === 'forward' ? '+' : ''
  return `${evidence.chromosome}:${evidence.start}-${evidence.end}${strand ? ` · ${strand}` : ''}`
}

export function formatGuideScanEvidenceOffTargets(evidence: GuideScanEvidence): string {
  if (!evidence.offTargetCounts) return '—'
  return formatGuideScanOffTargetSummary(evidence.offTargetCounts)
}

export function formatGuideScanEvidenceStatus(evidence: GuideScanEvidence): string {
  if (evidence.outcome === 'found') return 'Found'
  if (evidence.outcome === 'not_found') return 'Not found'
  return 'Error'
}

export function formatGuideScanEvidenceNotes(evidence: GuideScanEvidence): string {
  if (evidence.outcome !== 'found') {
    return evidence.message?.trim() || (evidence.outcome === 'not_found'
      ? 'Guide not found in GuideScan2 database.'
      : 'GuideScan2 validation failed.')
  }
  if (evidence.annotations?.length) return `${evidence.annotations.length} annotation(s)`
  return 'No extra annotations'
}

type WirePayloadV1 = {
  v: 1
  src: GuideScanEvidenceSource
  at: string
  org: string
  enz: string
  job?: string
  q?: string
  rank?: number
  chr?: string
  start?: number
  end?: number
  str?: 'f' | 'r'
  spec?: number | null
  ce?: number | null
  ot?: [number, number, number, number, number]
  ann?: string[]
  out: GuideScanEvidenceOutcome
  msg?: string | null
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const encoded = btoa(binary)
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (padded.length % 4)) % 4
  const base64 = padded + '='.repeat(padLength)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function toWire(evidence: GuideScanEvidence): WirePayloadV1 {
  const counts = sanitizeCounts(evidence.offTargetCounts)
  return {
    v: 1,
    src: evidence.source,
    at: evidence.capturedAt,
    org: evidence.organism,
    enz: evidence.enzyme,
    job: evidence.jobId || undefined,
    q: evidence.querySequence || undefined,
    rank: evidence.rank,
    chr: evidence.chromosome,
    start: evidence.start,
    end: evidence.end,
    str: evidence.strand === 'reverse' ? 'r' : evidence.strand === 'forward' ? 'f' : undefined,
    spec: evidence.specificity ?? null,
    ce: evidence.cuttingEfficiency ?? null,
    ot: counts
      ? [counts.distance0, counts.distance1, counts.distance2, counts.distance3, counts.distance4]
      : undefined,
    ann: sanitizeAnnotations(evidence.annotations),
    out: evidence.outcome,
    msg: evidence.message == null ? undefined : truncateText(evidence.message, MAX_MESSAGE_CHARS),
  }
}

function fromWire(payload: WirePayloadV1): GuideScanEvidence | null {
  if (payload.v !== 1) return null
  if (payload.src !== 'design' && payload.src !== 'validation') return null
  if (payload.out !== 'found' && payload.out !== 'not_found' && payload.out !== 'error') return null
  if (!payload.org?.trim() || !payload.enz?.trim() || !payload.at?.trim()) return null
  const ot = payload.ot
  return {
    version: GUIDESCAN_EVIDENCE_VERSION,
    source: payload.src,
    capturedAt: payload.at,
    organism: payload.org,
    enzyme: payload.enz,
    jobId: payload.job,
    querySequence: payload.q,
    rank: payload.rank,
    chromosome: payload.chr,
    start: payload.start,
    end: payload.end,
    strand: payload.str === 'r' ? 'reverse' : payload.str === 'f' ? 'forward' : undefined,
    specificity: payload.spec ?? null,
    cuttingEfficiency: payload.ce ?? null,
    offTargetCounts: ot
      ? {
        distance0: ot[0] ?? 0,
        distance1: ot[1] ?? 0,
        distance2: ot[2] ?? 0,
        distance3: ot[3] ?? 0,
        distance4: ot[4] ?? 0,
      }
      : undefined,
    annotations: sanitizeAnnotations(payload.ann),
    outcome: payload.out,
    message: payload.msg ?? null,
  }
}

/** Compact versioned encoding safe for GenBank/SnapGene qualifier values (no `"`). */
export function serializeGuideScanEvidence(evidence: GuideScanEvidence): string {
  const json = JSON.stringify(toWire(evidence))
  return `v1.${toBase64Url(encodeUtf8(json))}`
}

export function parseGuideScanEvidence(raw: string | undefined | null): GuideScanEvidence | null {
  if (!raw?.trim()) return null
  const trimmed = raw.trim()
  const match = /^v1\.([A-Za-z0-9_-]+)$/.exec(trimmed)
  if (!match) return null
  try {
    const json = decodeUtf8(fromBase64Url(match[1]!))
    const payload = JSON.parse(json) as WirePayloadV1
    return fromWire(payload)
  } catch {
    return null
  }
}

/** Read evidence from guide qualifiers, falling back to PAM when grouping a legacy/partial pair. */
export function readGuideScanEvidenceFromQualifiers(
  guideQualifiers: Record<string, string>,
  pamQualifiers?: Record<string, string>,
): GuideScanEvidence | null {
  return parseGuideScanEvidence(guideQualifiers[GUIDESCAN_EVIDENCE_QUALIFIER])
    ?? parseGuideScanEvidence(pamQualifiers?.[GUIDESCAN_EVIDENCE_QUALIFIER])
}

export function guideScanEvidenceQualifierValue(
  evidence: GuideScanEvidence | null | undefined,
): string | undefined {
  if (!evidence) return undefined
  return serializeGuideScanEvidence(evidence)
}
