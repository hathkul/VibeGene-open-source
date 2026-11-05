import {
  fetchGuideScanJobResultJson,
  pollGuideScanJob,
} from './client'
import { buildGuideScanGuideValidationForm } from './guideQuery'
import { guidescanApiBase } from './organisms'
import { guidescanFetchJson } from './http'
import { normalizeGuideScanGuideCandidateFields } from './normalize'
import type {
  GuideScanAwaitOptions,
  GuideScanClientOptions,
  GuideScanGuideCandidate,
  GuideScanGuideValidationRequest,
  GuideScanGuideValidationResult,
  GuideScanSubmitResult,
} from './types'
import { GuideScanError } from './types'

type RawSubmitResponse = {
  'job-id'?: string | number
  job_id?: string | number
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

export async function submitGuideScanGuideValidation(
  request: GuideScanGuideValidationRequest,
  options?: GuideScanClientOptions & { signal?: AbortSignal },
): Promise<GuideScanSubmitResult & { querySequence: string }> {
  const form = buildGuideScanGuideValidationForm(request)
  const querySequence = String(form.get('query-text') ?? '')
  const base = guidescanApiBase(options?.baseUrl)
  const raw = await guidescanFetchJson<RawSubmitResponse>(
    joinUrl(base, 'query'),
    { method: 'POST', body: form, signal: options?.signal },
    options,
  )
  const jobId = raw['job-id'] ?? raw.job_id
  if (jobId == null || String(jobId).trim() === '') {
    throw new GuideScanError('parse', 'GuideScan did not return a job id.')
  }
  return { jobId: String(jobId), querySequence }
}

type RawGuideValidationEntry = {
  error?: { message?: string } | string
  message?: string
  grna?: string
  sequence?: string
  start?: number
  end?: number
  direction?: string
  organism?: string
  specificity?: number | null
  'cutting-efficiency'?: number | null
  annotations?: unknown
  'off-targets'?: unknown
  'off-target-summary'?: Record<string, number> | string
  'distance-0-off-targets'?: number
  'distance-1-off-targets'?: number
  'distance-2-off-targets'?: number
  'distance-3-off-targets'?: number
  'distance-4-off-targets'?: number
  'genomic-region'?: {
    'region-name'?: string
    'chromosome-name'?: string
    coords?: unknown
    organism?: string
  }
  genomic_region?: {
    'region-name'?: string
    'chromosome-name'?: string
    coords?: unknown
    organism?: string
  }
}

function errorMessageOf(entry: RawGuideValidationEntry): string | null {
  if (entry.error == null) return null
  if (typeof entry.error === 'string') return entry.error
  if (typeof entry.error === 'object' && entry.error.message) return String(entry.error.message)
  if (entry.message) return String(entry.message)
  return 'Guide not found in GuideScan2 database.'
}

/**
 * Normalize GuideScan2 `query-type=grna` JSON results.
 * Live render returns a flat array of guide maps or `{ error, grna }` entries.
 */
export function normalizeGuideScanGuideValidationJson(
  raw: unknown,
  context: {
    jobId: string
    organism: string
    enzyme: string
    querySequence: string
    resultType?: string | null
  },
): GuideScanGuideValidationResult {
  const entries: RawGuideValidationEntry[] = Array.isArray(raw)
    ? raw as RawGuideValidationEntry[]
    : raw && typeof raw === 'object' && Array.isArray((raw as { result?: unknown }).result)
      ? (raw as { result: RawGuideValidationEntry[] }).result
      : []

  if (!Array.isArray(raw) && !(raw && typeof raw === 'object' && Array.isArray((raw as { result?: unknown }).result))) {
    if (raw == null) {
      return {
        jobId: context.jobId,
        resultType: context.resultType ?? 'grna',
        organism: context.organism,
        enzyme: context.enzyme,
        querySequence: context.querySequence,
        found: false,
        guide: null,
        errorMessage: 'GuideScan returned an empty gRNA validation result.',
      }
    }
  }

  const preferred = entries.find((entry) => {
    const query = String(entry.grna ?? '').toUpperCase()
    return !errorMessageOf(entry) && (!query || query === context.querySequence)
  }) ?? entries[0]

  if (!preferred) {
    return {
      jobId: context.jobId,
      resultType: context.resultType ?? 'grna',
      organism: context.organism,
      enzyme: context.enzyme,
      querySequence: context.querySequence,
      found: false,
      guide: null,
      errorMessage: 'Guide not found in GuideScan2 database.',
    }
  }

  const failure = errorMessageOf(preferred)
  if (failure || !preferred.sequence) {
    return {
      jobId: context.jobId,
      resultType: context.resultType ?? 'grna',
      organism: context.organism,
      enzyme: context.enzyme,
      querySequence: context.querySequence,
      found: false,
      guide: null,
      errorMessage: failure || 'Guide not found in GuideScan2 database.',
    }
  }

  const region = preferred['genomic-region'] ?? preferred.genomic_region
  const chromosome = String(
    region?.['chromosome-name']
    ?? (Array.isArray(region?.coords) ? region?.coords[0] : '')
    ?? '',
  )
  const regionName = String(region?.['region-name'] ?? context.querySequence)

  let guide: GuideScanGuideCandidate
  try {
    guide = normalizeGuideScanGuideCandidateFields(
      preferred as Parameters<typeof normalizeGuideScanGuideCandidateFields>[0],
      {
      regionName,
      chromosomeName: chromosome,
      coords: Array.isArray(region?.coords) && region.coords.length >= 3
        ? [String(region.coords[0]), Number(region.coords[1]), Number(region.coords[2])] as [string, number, number]
        : [chromosome || regionName, Number(preferred.start) || 0, Number(preferred.end) || 0],
      organism: String(region?.organism ?? preferred.organism ?? context.organism),
      enzyme: context.enzyme,
      rank: 1,
    })
  } catch (error) {
    const message = error instanceof GuideScanError
      ? error.message
      : 'GuideScan returned a malformed gRNA validation hit.'
    return {
      jobId: context.jobId,
      resultType: context.resultType ?? 'grna',
      organism: context.organism,
      enzyme: context.enzyme,
      querySequence: context.querySequence,
      found: false,
      guide: null,
      errorMessage: message,
    }
  }

  return {
    jobId: context.jobId,
    resultType: context.resultType ?? 'grna',
    organism: context.organism,
    enzyme: context.enzyme,
    querySequence: context.querySequence,
    found: true,
    guide,
    errorMessage: null,
  }
}

/**
 * Submit → poll → normalize a single-guide GuideScan2 validation query.
 */
export async function validateGuideWithGuideScan(
  request: GuideScanGuideValidationRequest,
  options?: GuideScanAwaitOptions,
): Promise<GuideScanGuideValidationResult> {
  const submitted = await submitGuideScanGuideValidation(request, options)
  const status = await pollGuideScanJob(submitted.jobId, options)
  const raw = await fetchGuideScanJobResultJson(submitted.jobId, options)
  return normalizeGuideScanGuideValidationJson(raw, {
    jobId: submitted.jobId,
    organism: request.organism.trim(),
    enzyme: String(request.enzyme).trim(),
    querySequence: submitted.querySequence,
    resultType: status.resultType,
  })
}
