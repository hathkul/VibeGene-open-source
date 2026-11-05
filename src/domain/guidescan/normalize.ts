import type { Strand } from '../types'
import { enzymePamInfo } from './organisms'
import type {
  GuideScanDesignResult,
  GuideScanGuideCandidate,
  GuideScanOffTarget,
  GuideScanOffTargetCounts,
  GuideScanQueryRegion,
} from './types'
import { GuideScanError } from './types'

type RawRegion = {
  'region-name'?: string
  'chromosome-name'?: string
  coords?: unknown
  organism?: string
}

type RawOffTarget = {
  accession?: string
  chromosome?: string
  direction?: string
  distance?: number
  position?: number
}

type RawGuide = {
  sequence?: string
  start?: number
  end?: number
  direction?: string
  organism?: string
  specificity?: number | null
  'cutting-efficiency'?: number | null
  annotations?: unknown
  'off-targets'?: RawOffTarget[]
  'off-target-summary'?: Record<string, number> | string
  'distance-0-off-targets'?: number
  'distance-1-off-targets'?: number
  'distance-2-off-targets'?: number
  'distance-3-off-targets'?: number
  'distance-4-off-targets'?: number
  'gc-content'?: number
  'region-string'?: string
  coordinate?: string
}

function asStrand(value: string | undefined): Strand {
  const normalized = (value ?? '').toLowerCase()
  if (normalized === 'negative' || normalized === '-' || normalized === 'reverse') return 'reverse'
  return 'forward'
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function splitSpacerPam(sequence: string, enzyme: string): { spacer: string; pam: string } {
  const seq = sequence.toUpperCase().replace(/\s/g, '')
  const info = enzymePamInfo(enzyme)
  if (info.pamSide === '5prime') {
    const pamLength = info.pam.length
    return { pam: seq.slice(0, pamLength), spacer: seq.slice(pamLength) }
  }
  const pamLength = info.pam.length
  return { spacer: seq.slice(0, Math.max(0, seq.length - pamLength)), pam: seq.slice(Math.max(0, seq.length - pamLength)) }
}

function parseCoords(raw: unknown): [string, number, number] {
  if (!Array.isArray(raw) || raw.length < 3) {
    throw new GuideScanError('parse', 'GuideScan region coords were missing or malformed.')
  }
  const chrom = String(raw[0] ?? '')
  const start = asNumber(raw[1])
  const end = asNumber(raw[2])
  if (!chrom || start == null || end == null) {
    throw new GuideScanError('parse', 'GuideScan region coords were missing or malformed.')
  }
  return [chrom, start, end]
}

/** Raw API counts; distance-0 includes the intended on-target match (see mapping.guideScanOffTargetCountsForDisplay). */
function offTargetCounts(guide: RawGuide): GuideScanOffTargetCounts {
  const summary = guide['off-target-summary']
  const fromSummary = (distance: number) => {
    if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
      const value = asNumber(summary[String(distance)])
      if (value != null) return value
    }
    return null
  }
  return {
    distance0: asNumber(guide['distance-0-off-targets']) ?? fromSummary(0) ?? 0,
    distance1: asNumber(guide['distance-1-off-targets']) ?? fromSummary(1) ?? 0,
    distance2: asNumber(guide['distance-2-off-targets']) ?? fromSummary(2) ?? 0,
    distance3: asNumber(guide['distance-3-off-targets']) ?? fromSummary(3) ?? 0,
    distance4: asNumber(guide['distance-4-off-targets']) ?? fromSummary(4) ?? 0,
  }
}

function normalizeOffTargets(raw: RawOffTarget[] | undefined): GuideScanOffTarget[] {
  return (raw ?? [])
    .map((entry) => {
      const position = asNumber(entry.position)
      const distance = asNumber(entry.distance)
      if (position == null || distance == null) return null
      return {
        accession: String(entry.accession ?? ''),
        chromosome: String(entry.chromosome ?? ''),
        direction: asStrand(entry.direction),
        distance,
        position,
      } satisfies GuideScanOffTarget
    })
    .filter((entry): entry is GuideScanOffTarget => entry != null)
}

function annotationsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry) => String(entry)).filter(Boolean)
}

function normalizeRegion(raw: RawRegion): GuideScanQueryRegion {
  const coords = parseCoords(raw.coords)
  return {
    regionName: String(raw['region-name'] ?? ''),
    chromosomeName: String(raw['chromosome-name'] ?? coords[0]),
    coords,
    organism: String(raw.organism ?? ''),
  }
}

function normalizeGuide(
  raw: RawGuide,
  context: { region: GuideScanQueryRegion; enzyme: string; rank: number },
): GuideScanGuideCandidate {
  return normalizeGuideScanGuideCandidateFields(raw, {
    regionName: context.region.regionName,
    chromosomeName: context.region.chromosomeName,
    coords: context.region.coords,
    organism: context.region.organism,
    enzyme: context.enzyme,
    rank: context.rank,
  })
}

/**
 * Shared guide-field normalization for design hits and gRNA validation hits.
 * Spacer vs PAM is taken from the returned GuideScan sequence + enzyme PAM side —
 * bases are never invented client-side.
 */
export function normalizeGuideScanGuideCandidateFields(
  raw: RawGuide,
  context: {
    regionName: string
    chromosomeName: string
    coords: [string, number, number]
    organism: string
    enzyme: string
    rank: number
  },
): GuideScanGuideCandidate {
  const sequence = String(raw.sequence ?? '').toUpperCase().replace(/\s/g, '')
  if (!sequence) throw new GuideScanError('parse', 'GuideScan returned a guide without a sequence.')
  const start = asNumber(raw.start)
  const end = asNumber(raw.end)
  if (start == null || end == null) {
    throw new GuideScanError('parse', 'GuideScan returned a guide without start/end coordinates.')
  }
  const { spacer, pam } = splitSpacerPam(sequence, context.enzyme)
  const chromosome = context.chromosomeName
    || String(raw.coordinate ?? '').split(':')[0]
    || context.coords[0]
  return {
    id: `${context.regionName || 'region'}.${context.rank}:${chromosome}:${start}-${end}:${asStrand(raw.direction)}`,
    rank: context.rank,
    regionName: context.regionName,
    organism: String(raw.organism ?? context.organism),
    enzyme: context.enzyme,
    chromosome,
    start,
    end,
    strand: asStrand(raw.direction),
    sequence,
    spacer,
    pam,
    specificity: asNumber(raw.specificity),
    cuttingEfficiency: asNumber(raw['cutting-efficiency']),
    annotations: annotationsOf(raw.annotations),
    offTargetCounts: offTargetCounts(raw),
    offTargets: normalizeOffTargets(raw['off-targets']),
  }
}

/**
 * Normalize GuideScan2 JSON job results.
 * Live `/backend/job/result/json/:id` returns the guidescan-web shape:
 * `[[region, guides[]], ...]`
 * Newer guidescanpy may return `{ organism, enzyme, queries: { name: { region, hits } } }`.
 */
export function normalizeGuideScanResultJson(
  raw: unknown,
  context: { jobId: string; organism: string; enzyme: string; resultType?: string | null },
): GuideScanDesignResult {
  if (Array.isArray(raw)) {
    const regions: GuideScanQueryRegion[] = []
    const guides: GuideScanGuideCandidate[] = []
    for (const entry of raw) {
      if (!Array.isArray(entry) || entry.length < 2) {
        throw new GuideScanError('parse', 'GuideScan JSON result entries were malformed.')
      }
      const region = normalizeRegion(entry[0] as RawRegion)
      regions.push(region)
      const hits = Array.isArray(entry[1]) ? entry[1] as RawGuide[] : []
      hits.forEach((hit, index) => {
        guides.push(normalizeGuide(hit, { region, enzyme: context.enzyme, rank: index + 1 }))
      })
    }
    return {
      jobId: context.jobId,
      resultType: context.resultType ?? 'standard',
      organism: context.organism || regions[0]?.organism || '',
      enzyme: context.enzyme,
      regions,
      guides,
    }
  }

  if (raw && typeof raw === 'object') {
    const payload = raw as {
      organism?: string
      enzyme?: string
      queries?: Record<string, { region?: string; hits?: RawGuide[] }>
    }
    const organism = String(payload.organism ?? context.organism)
    const enzyme = String(payload.enzyme ?? context.enzyme)
    const regions: GuideScanQueryRegion[] = []
    const guides: GuideScanGuideCandidate[] = []
    for (const [name, value] of Object.entries(payload.queries ?? {})) {
      const region: GuideScanQueryRegion = {
        regionName: name,
        chromosomeName: String(value.region ?? '').split(':')[0] ?? '',
        coords: [String(value.region ?? name), 0, 0],
        organism,
      }
      regions.push(region)
      ;(value.hits ?? []).forEach((hit, index) => {
        const start = asNumber(hit.start) ?? 0
        const end = asNumber(hit.end) ?? 0
        const chromosome = region.chromosomeName || String(hit.coordinate ?? '').split(':')[0] || ''
        regions[regions.length - 1] = {
          ...region,
          chromosomeName: chromosome,
          coords: [chromosome || name, start, end],
        }
        guides.push(normalizeGuide(hit, {
          region: regions[regions.length - 1]!,
          enzyme,
          rank: index + 1,
        }))
      })
    }
    return {
      jobId: context.jobId,
      resultType: context.resultType ?? 'standard',
      organism,
      enzyme,
      regions,
      guides,
    }
  }

  throw new GuideScanError('parse', 'Unrecognized GuideScan JSON result shape.')
}
