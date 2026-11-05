import type { SequenceRecord, Strand } from '../types'

/** GuideScan2 enzymes exposed by the live `/backend/info/supported` catalog. */
export type GuideScanEnzyme = 'cas9' | 'cpf1'

/**
 * How the caller wants to target the genome for design.
 * - `gene`: organism-appropriate gene symbol / Entrez ID (GuideScan resolves it)
 * - `coordinates`: explicit `chr:start-end` genomic stretch
 * - `selection`: selected feature/stretch already resolved to genomic coordinates by the UI
 *
 * Long raw DNA target stretches are not supported for design; validate individual
 * guides with the gRNA validation API instead.
 */
export type GuideScanQueryKind = 'gene' | 'coordinates' | 'selection'

export type GuideScanJobStatusValue = 'pending' | 'completed' | 'failed'

export type GuideScanResultType = 'standard' | 'library' | 'grna' | string

export type GuideScanSupportedPair = {
  organism: string
  enzyme: GuideScanEnzyme | string
}

export type GuideScanSupportedInfo = {
  version: string
  cliVersion: string | null
  available: GuideScanSupportedPair[]
  organisms: string[]
  enzymes: string[]
}

export type GuideScanOffTarget = {
  accession: string
  chromosome: string
  direction: Strand
  distance: number
  position: number
}

export type GuideScanOffTargetCounts = {
  distance0: number
  distance1: number
  distance2: number
  distance3: number
  distance4: number
}

/** Normalized scored guide candidate for future UI consumption. */
export type GuideScanGuideCandidate = {
  id: string
  rank: number
  regionName: string
  organism: string
  enzyme: string
  chromosome: string
  /** GuideScan genomic coordinates (1-based inclusive). */
  start: number
  end: number
  strand: Strand
  /** Full GuideScan sequence (spacer + PAM placeholder bases as returned). */
  sequence: string
  spacer: string
  pam: string
  specificity: number | null
  cuttingEfficiency: number | null
  annotations: string[]
  offTargetCounts: GuideScanOffTargetCounts
  offTargets: GuideScanOffTarget[]
}

export type GuideScanQueryRegion = {
  regionName: string
  chromosomeName: string
  /** `[accessionOrChrom, start, end]` as returned by GuideScan. */
  coords: [string, number, number]
  organism: string
}

export type GuideScanDesignResult = {
  jobId: string
  resultType: GuideScanResultType | null
  organism: string
  enzyme: string
  regions: GuideScanQueryRegion[]
  guides: GuideScanGuideCandidate[]
}

export type GuideScanGeneSuggestion = {
  /** Exact canonical symbol suitable for GuideScan `query-text`. */
  symbol: string
  ensemblId: string
  description: string
  species: string
  assembly?: string
  biotype?: string
  /** Exact symbol match preferred for autocomplete ranking. */
  exactSymbolMatch: boolean
  /** Present when the query was resolved as an Entrez Gene ID. */
  entrezId?: string
}

export type GuideScanGeneSequenceResult = {
  suggestion: GuideScanGeneSuggestion
  record: SequenceRecord
}

export type GuideScanCoordinateTarget = {
  chromosome: string
  /** 1-based inclusive genomic start (GuideScan convention). */
  start: number
  /** 1-based inclusive genomic end. */
  end: number
  /** Optional display name for the region (defaults to `chr:start-end`). */
  name?: string
}

export type GuideScanDesignRequest = {
  organism: string
  enzyme: GuideScanEnzyme | string
  kind: GuideScanQueryKind
  /** Required for `gene` queries. */
  geneName?: string
  /** Required for `coordinates` / `selection` unless `queryText` is supplied. */
  coordinates?: GuideScanCoordinateTarget
  /**
   * Optional raw GuideScan query text (newline-separated gene symbols / Entrez IDs /
   * `chr:start-end` lines). When set, it is sent as-is and overrides kind-specific builders.
   */
  queryText?: string
  /** Keep only this many best gRNAs per region. Defaults to 20. */
  topN?: number
  /** Search this many bases around the region when flanking mode is enabled. */
  flanking?: number
  filterAnnotated?: boolean
  specificityMin?: number
  cuttingEfficiencyMin?: number
}

/** Single-guide validation against the GuideScan2 gRNA index (`query-type=grna`). */
export type GuideScanGuideValidationRequest = {
  organism: string
  enzyme: GuideScanEnzyme | string
  /**
   * Guide DNA as accepted by GuideScan2: 20–23 nt, A/C/G/T/N.
   * Do not invent PAM bases; send spacer-only or spacer+PAM exactly as available.
   */
  guideSequence: string
}

export type GuideScanGuideValidationResult = {
  jobId: string
  resultType: GuideScanResultType | null
  organism: string
  enzyme: string
  /** Normalized query sequence sent to GuideScan. */
  querySequence: string
  found: boolean
  /** Present when GuideScan located the guide in its index. */
  guide: GuideScanGuideCandidate | null
  /** GuideScan or client message when the guide was not found / failed. */
  errorMessage: string | null
}

export type GuideScanSubmitResult = {
  jobId: string
}

export type GuideScanJobStatus = {
  jobId: string
  status: GuideScanJobStatusValue
  failure: string | null
  resultType: GuideScanResultType | null
}

export type GuideScanClientOptions = {
  /** Override API root. Defaults to Vite proxy in DEV, else `https://guidescan.com/backend`. */
  baseUrl?: string
  /** Per-request timeout for individual HTTP calls (not the full poll loop). */
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export type GuideScanAwaitOptions = GuideScanClientOptions & {
  signal?: AbortSignal
  pollIntervalMs?: number
  /** Overall wall-clock timeout for submit + poll + result. */
  overallTimeoutMs?: number
  /** Optional side-effect-free progress hook for UI activity logs. */
  onProgress?: (message: string) => void
}

export type GuideScanErrorCode =
  | 'cancelled'
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid_request'
  | 'job_failed'
  | 'unsupported'
  | 'not_found'
  | 'parse'

export class GuideScanError extends Error {
  readonly code: GuideScanErrorCode
  readonly status?: number

  constructor(code: GuideScanErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'GuideScanError'
    this.code = code
    this.status = status
  }
}

/** Human-readable message for any error thrown by the GuideScan client stack. */
export function guidescanErrorMessage(error: unknown): string {
  if (error instanceof GuideScanError) {
    if (error.code === 'cancelled') return 'The GuideScan request was cancelled.'
    return error.message.trim() || `${error.name} (no details)`
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'A network request was interrupted before it finished.'
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') return error.message
  if (error instanceof Error) {
    return error.message.trim() || `${error.name || 'Error'} (no details)`
  }
  return String(error) || 'Unknown error'
}
