import { dnaSequenceDigest } from '../proteinTranslationProvenance'
import type { SequenceRecord } from '../types'
import type {
  GuideScanDesignResult,
  GuideScanGeneSuggestion,
  GuideScanGuideCandidate,
  GuideScanQueryRegion,
} from './types'

/** Persisted on `DnaComparisonDocumentData.guideScanDesignCache` (vibegene.json / .dna attachment). GenBank export does not carry this attachment. */
export const GUIDESCAN_DESIGN_CACHE_VERSION = 1 as const

export type GuideScanDesignInputMode = 'gene' | 'current_record' | 'selection'

export type GuideScanDesignCacheResolvedGene = {
  symbol: string
  ensemblId: string
  description: string
  species: string
  assembly?: string
  biotype?: string
  exactSymbolMatch: boolean
  entrezId?: string
}

export type GuideScanDesignCacheGuide = Omit<GuideScanGuideCandidate, 'offTargets'>

export type GuideScanDesignCachePayload = {
  jobId: string
  resultType: GuideScanDesignResult['resultType']
  organism: string
  enzyme: string
  regions: GuideScanQueryRegion[]
  guides: GuideScanDesignCacheGuide[]
}

export type GuideScanDesignCacheEntry = {
  version: typeof GUIDESCAN_DESIGN_CACHE_VERSION
  capturedAt: string
  hostRecordId: string
  sequenceDigest: string
  inputMode: GuideScanDesignInputMode
  queryText: string
  organism: string
  enzyme: string
  topN: number
  resolvedGene?: GuideScanDesignCacheResolvedGene
  statusMessage?: string
  designResult: GuideScanDesignCachePayload
}

function clampTopN(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 20
  return Math.max(1, Math.min(100, Math.trunc(parsed)))
}

function normalizeResolvedGene(raw: unknown): GuideScanDesignCacheResolvedGene | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const entry = raw as Partial<GuideScanDesignCacheResolvedGene>
  const symbol = typeof entry.symbol === 'string' ? entry.symbol.trim() : ''
  if (!symbol) return undefined
  return {
    symbol,
    ensemblId: typeof entry.ensemblId === 'string' ? entry.ensemblId : '',
    description: typeof entry.description === 'string' ? entry.description : '',
    species: typeof entry.species === 'string' ? entry.species : '',
    ...(typeof entry.assembly === 'string' && entry.assembly.trim() ? { assembly: entry.assembly.trim() } : {}),
    ...(typeof entry.biotype === 'string' && entry.biotype.trim() ? { biotype: entry.biotype.trim() } : {}),
    exactSymbolMatch: entry.exactSymbolMatch === true,
    ...(typeof entry.entrezId === 'string' && entry.entrezId.trim() ? { entrezId: entry.entrezId.trim() } : {}),
  }
}

function normalizeOffTargetCounts(raw: unknown): GuideScanGuideCandidate['offTargetCounts'] {
  const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const pick = (key: string) => {
    const value = entry[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }
  return {
    distance0: pick('distance0'),
    distance1: pick('distance1'),
    distance2: pick('distance2'),
    distance3: pick('distance3'),
    distance4: pick('distance4'),
  }
}

function normalizeCacheGuide(raw: unknown): GuideScanDesignCacheGuide | null {
  if (!raw || typeof raw !== 'object') return null
  const guide = raw as Partial<GuideScanDesignCacheGuide>
  const id = typeof guide.id === 'string' ? guide.id : ''
  const spacer = typeof guide.spacer === 'string' ? guide.spacer : ''
  if (!id || !spacer) return null
  const rank = typeof guide.rank === 'number' && Number.isFinite(guide.rank) ? guide.rank : 0
  const start = typeof guide.start === 'number' && Number.isFinite(guide.start) ? guide.start : 0
  const end = typeof guide.end === 'number' && Number.isFinite(guide.end) ? guide.end : 0
  const strand = guide.strand === 'reverse' ? 'reverse' : 'forward'
  return {
    id,
    rank,
    regionName: typeof guide.regionName === 'string' ? guide.regionName : '',
    organism: typeof guide.organism === 'string' ? guide.organism : '',
    enzyme: typeof guide.enzyme === 'string' ? guide.enzyme : '',
    chromosome: typeof guide.chromosome === 'string' ? guide.chromosome : '',
    start,
    end,
    strand,
    sequence: typeof guide.sequence === 'string' ? guide.sequence : spacer,
    spacer,
    pam: typeof guide.pam === 'string' ? guide.pam : '',
    specificity: typeof guide.specificity === 'number' && Number.isFinite(guide.specificity) ? guide.specificity : null,
    cuttingEfficiency: typeof guide.cuttingEfficiency === 'number' && Number.isFinite(guide.cuttingEfficiency)
      ? guide.cuttingEfficiency
      : null,
    annotations: Array.isArray(guide.annotations)
      ? guide.annotations.filter((entry): entry is string => typeof entry === 'string')
      : [],
    offTargetCounts: normalizeOffTargetCounts(guide.offTargetCounts),
  }
}

function normalizeRegion(raw: unknown): GuideScanQueryRegion | null {
  if (!raw || typeof raw !== 'object') return null
  const region = raw as Partial<GuideScanQueryRegion>
  const coords = region.coords
  if (!Array.isArray(coords) || coords.length < 3) return null
  const chrom = String(coords[0] ?? '')
  const start = typeof coords[1] === 'number' ? coords[1] : Number(coords[1])
  const end = typeof coords[2] === 'number' ? coords[2] : Number(coords[2])
  if (!chrom || !Number.isFinite(start) || !Number.isFinite(end)) return null
  return {
    regionName: typeof region.regionName === 'string' ? region.regionName : '',
    chromosomeName: typeof region.chromosomeName === 'string' ? region.chromosomeName : chrom,
    coords: [chrom, start, end],
    organism: typeof region.organism === 'string' ? region.organism : '',
  }
}

function normalizeDesignPayload(raw: unknown): GuideScanDesignCachePayload | null {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as Partial<GuideScanDesignCachePayload>
  const jobId = typeof payload.jobId === 'string' ? payload.jobId.trim() : ''
  if (!jobId) return null
  const guides = (payload.guides ?? [])
    .map((entry) => normalizeCacheGuide(entry))
    .filter((entry): entry is GuideScanDesignCacheGuide => entry != null)
  if (!guides.length) return null
  const regions = (payload.regions ?? [])
    .map((entry) => normalizeRegion(entry))
    .filter((entry): entry is GuideScanQueryRegion => entry != null)
  return {
    jobId,
    resultType: payload.resultType ?? null,
    organism: typeof payload.organism === 'string' ? payload.organism : '',
    enzyme: typeof payload.enzyme === 'string' ? payload.enzyme : '',
    regions,
    guides,
  }
}

export function normalizeGuideScanDesignCache(raw: unknown): GuideScanDesignCacheEntry | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const entry = raw as Partial<GuideScanDesignCacheEntry>
  if (entry.version !== GUIDESCAN_DESIGN_CACHE_VERSION) return undefined
  const hostRecordId = typeof entry.hostRecordId === 'string' ? entry.hostRecordId.trim() : ''
  const sequenceDigest = typeof entry.sequenceDigest === 'string' ? entry.sequenceDigest.trim() : ''
  const capturedAt = typeof entry.capturedAt === 'string' ? entry.capturedAt.trim() : ''
  const inputMode = entry.inputMode === 'current_record' ? 'current_record' : entry.inputMode === 'gene' ? 'gene' : null
  const queryText = typeof entry.queryText === 'string' ? entry.queryText : ''
  const organism = typeof entry.organism === 'string' ? entry.organism.trim() : ''
  const enzyme = typeof entry.enzyme === 'string' ? entry.enzyme.trim() : ''
  const designResult = normalizeDesignPayload(entry.designResult)
  if (!hostRecordId || !sequenceDigest || !capturedAt || !inputMode || !organism || !enzyme || !designResult) {
    return undefined
  }
  return {
    version: GUIDESCAN_DESIGN_CACHE_VERSION,
    capturedAt,
    hostRecordId,
    sequenceDigest,
    inputMode,
    queryText,
    organism,
    enzyme,
    topN: clampTopN(entry.topN),
    ...(normalizeResolvedGene(entry.resolvedGene) ? { resolvedGene: normalizeResolvedGene(entry.resolvedGene) } : {}),
    ...(typeof entry.statusMessage === 'string' && entry.statusMessage.trim()
      ? { statusMessage: entry.statusMessage.trim() }
      : {}),
    designResult,
  }
}

export function compactGuideScanGuideCandidate(guide: GuideScanGuideCandidate): GuideScanDesignCacheGuide {
  const { offTargets, ...rest } = guide
  void offTargets
  return rest
}

export function compactGuideScanDesignResult(result: GuideScanDesignResult): GuideScanDesignCachePayload {
  return {
    jobId: result.jobId,
    resultType: result.resultType,
    organism: result.organism,
    enzyme: result.enzyme,
    regions: result.regions,
    guides: result.guides.map(compactGuideScanGuideCandidate),
  }
}

export function expandGuideScanDesignResult(payload: GuideScanDesignCachePayload): GuideScanDesignResult {
  return {
    jobId: payload.jobId,
    resultType: payload.resultType,
    organism: payload.organism,
    enzyme: payload.enzyme,
    regions: payload.regions,
    guides: payload.guides.map((guide) => ({ ...guide, offTargets: [] })),
  }
}

export function guideScanDesignRunContextKey(input: {
  inputMode: GuideScanDesignInputMode
  queryText: string
  organism: string
  enzyme: string
  topN: number
}): string {
  const query = input.queryText.trim().toUpperCase()
  return `${input.inputMode}|${query}|${input.organism}|${input.enzyme}|${input.topN}`
}

export function guideScanDesignCacheMatchesRecord(
  cache: GuideScanDesignCacheEntry | undefined,
  record: Pick<SequenceRecord, 'id' | 'sequence'>,
): boolean {
  if (!cache) return false
  if (cache.hostRecordId !== record.id) return false
  return cache.sequenceDigest === dnaSequenceDigest(record.sequence)
}

export function buildGuideScanDesignCacheEntry(input: {
  record: Pick<SequenceRecord, 'id' | 'sequence'>
  inputMode: GuideScanDesignInputMode
  queryText: string
  organism: string
  enzyme: string
  topN: number
  resolvedGene?: GuideScanGeneSuggestion | null
  statusMessage?: string
  designResult: GuideScanDesignResult
  capturedAt?: string
}): GuideScanDesignCacheEntry {
  return {
    version: GUIDESCAN_DESIGN_CACHE_VERSION,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    hostRecordId: input.record.id,
    sequenceDigest: dnaSequenceDigest(input.record.sequence),
    inputMode: input.inputMode,
    queryText: input.queryText,
    organism: input.organism,
    enzyme: input.enzyme,
    topN: clampTopN(input.topN),
    ...(input.resolvedGene
      ? {
          resolvedGene: {
            symbol: input.resolvedGene.symbol,
            ensemblId: input.resolvedGene.ensemblId,
            description: input.resolvedGene.description,
            species: input.resolvedGene.species,
            ...(input.resolvedGene.assembly ? { assembly: input.resolvedGene.assembly } : {}),
            ...(input.resolvedGene.biotype ? { biotype: input.resolvedGene.biotype } : {}),
            exactSymbolMatch: input.resolvedGene.exactSymbolMatch,
            ...(input.resolvedGene.entrezId ? { entrezId: input.resolvedGene.entrezId } : {}),
          },
        }
      : {}),
    ...(input.statusMessage?.trim() ? { statusMessage: input.statusMessage.trim() } : {}),
    designResult: compactGuideScanDesignResult(input.designResult),
  }
}

export function resolvedGeneFromDesignCache(
  cache: GuideScanDesignCacheEntry,
): GuideScanGeneSuggestion | null {
  if (!cache.resolvedGene) return null
  return { ...cache.resolvedGene }
}
