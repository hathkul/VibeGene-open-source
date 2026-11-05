import {
  GUIDESCAN_DEFAULT_TOP_N,
  guidescanApiBase,
} from './organisms'
import { guidescanFetchJson, sleep } from './http'
import type {
  GuideScanAwaitOptions,
  GuideScanClientOptions,
  GuideScanCoordinateTarget,
  GuideScanDesignRequest,
  GuideScanJobStatus,
  GuideScanJobStatusValue,
  GuideScanResultType,
  GuideScanSubmitResult,
  GuideScanSupportedInfo,
  GuideScanSupportedPair,
} from './types'
import { GuideScanError } from './types'

type RawSupportedResponse = {
  version?: string
  'cli-version'?: string | null
  available?: Array<{ organism?: string; enzyme?: string }>
  'available-organisms'?: string[]
  'available-enzymes'?: string[]
}

type RawSubmitResponse = {
  'job-id'?: string | number
  job_id?: string | number
}

type RawStatusResponse = {
  'job-status'?: string
  status?: string
  failure?: string | null
  'result-type'?: string | null
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

function clientBase(options?: GuideScanClientOptions) {
  return guidescanApiBase(options?.baseUrl)
}

function normalizeSupported(raw: RawSupportedResponse): GuideScanSupportedInfo {
  const available: GuideScanSupportedPair[] = (raw.available ?? [])
    .map((entry) => ({
      organism: String(entry.organism ?? '').trim(),
      enzyme: String(entry.enzyme ?? '').trim(),
    }))
    .filter((entry) => entry.organism && entry.enzyme)

  const organisms = [...new Set([
    ...available.map((entry) => entry.organism),
    ...(raw['available-organisms'] ?? []),
  ])].filter(Boolean).sort()

  const enzymes = [...new Set([
    ...available.map((entry) => entry.enzyme),
    ...(raw['available-enzymes'] ?? []),
  ])].filter(Boolean).sort()

  return {
    version: raw.version ?? '',
    cliVersion: raw['cli-version'] ?? null,
    available,
    organisms,
    enzymes,
  }
}

function normalizeStatus(jobId: string, raw: RawStatusResponse): GuideScanJobStatus {
  const statusRaw = (raw['job-status'] ?? raw.status ?? '').toLowerCase()
  let status: GuideScanJobStatusValue
  if (statusRaw === 'completed' || statusRaw === 'success') status = 'completed'
  else if (statusRaw === 'failed' || statusRaw === 'failure') status = 'failed'
  else status = 'pending'

  return {
    jobId,
    status,
    failure: raw.failure ?? null,
    resultType: (raw['result-type'] ?? null) as GuideScanResultType | null,
  }
}

export function formatGuideScanCoordinate(target: GuideScanCoordinateTarget): string {
  const chromosome = target.chromosome.trim()
  if (!chromosome) throw new GuideScanError('invalid_request', 'Chromosome is required for genomic coordinates.')
  if (!Number.isFinite(target.start) || !Number.isFinite(target.end)) {
    throw new GuideScanError('invalid_request', 'Genomic start and end must be finite numbers.')
  }
  const start = Math.trunc(target.start)
  const end = Math.trunc(target.end)
  if (start < 1 || end < 1) {
    throw new GuideScanError('invalid_request', 'GuideScan genomic coordinates are 1-based and must be ≥ 1.')
  }
  if (end < start) {
    throw new GuideScanError('invalid_request', 'Genomic end must be greater than or equal to start.')
  }
  return `${chromosome}:${start}-${end}`
}

export function buildGuideScanQueryText(request: GuideScanDesignRequest): string {
  const explicit = request.queryText?.replace(/\r\n/g, '\n').trim()
  if (explicit) return explicit

  if (request.kind === 'gene') {
    const gene = request.geneName?.trim()
    if (!gene) throw new GuideScanError('invalid_request', 'Enter a gene symbol or Entrez Gene ID.')
    return gene
  }

  if (request.kind === 'coordinates' || request.kind === 'selection') {
    if (!request.coordinates) {
      throw new GuideScanError(
        'invalid_request',
        request.kind === 'selection'
          ? 'Select a genomic feature or stretch with chromosome coordinates.'
          : 'Provide genomic coordinates as chromosome:start-end.',
      )
    }
    return formatGuideScanCoordinate(request.coordinates)
  }

  throw new GuideScanError(
    'invalid_request',
    `Unsupported GuideScan query kind: ${String(request.kind)}. Design uses gene / Entrez ID or genomic coordinates; validate individual guides with the gRNA API.`,
  )
}

export function buildGuideScanQueryForm(request: GuideScanDesignRequest): FormData {
  const organism = request.organism.trim()
  const enzyme = String(request.enzyme).trim()
  if (!organism) throw new GuideScanError('invalid_request', 'Choose a GuideScan reference genome.')
  if (!enzyme) throw new GuideScanError('invalid_request', 'Choose a Cas enzyme supported by GuideScan2.')

  const topN = request.topN ?? GUIDESCAN_DEFAULT_TOP_N
  if (!Number.isInteger(topN) || topN < 1) {
    throw new GuideScanError('invalid_request', 'Result count (topN) must be a positive integer.')
  }

  const form = new FormData()
  form.append('organism', organism)
  form.append('enzyme', enzyme)
  form.append('query-text', buildGuideScanQueryText(request))
  form.append('filter-annotated', String(Boolean(request.filterAnnotated)))
  form.append('topn', String(topN))

  if (request.flanking != null && request.flanking > 0) {
    form.append('mode', 'flanking')
    form.append('flanking', String(Math.trunc(request.flanking)))
  } else {
    form.append('mode', 'within')
  }

  if (request.specificityMin != null) {
    form.append('s-bounds-l', String(request.specificityMin))
    form.append('s-bounds-u', '1')
  }
  if (request.cuttingEfficiencyMin != null) {
    form.append('ce-bounds-l', String(request.cuttingEfficiencyMin))
    form.append('ce-bounds-u', '1')
  }

  return form
}

export async function fetchGuideScanSupported(
  options?: GuideScanClientOptions & { signal?: AbortSignal },
): Promise<GuideScanSupportedInfo> {
  const raw = await guidescanFetchJson<RawSupportedResponse>(
    joinUrl(clientBase(options), 'info/supported'),
    { signal: options?.signal },
    options,
  )
  return normalizeSupported(raw)
}

export async function submitGuideScanQuery(
  request: GuideScanDesignRequest,
  options?: GuideScanClientOptions & { signal?: AbortSignal },
): Promise<GuideScanSubmitResult> {
  const form = buildGuideScanQueryForm(request)
  const raw = await guidescanFetchJson<RawSubmitResponse>(
    joinUrl(clientBase(options), 'query'),
    { method: 'POST', body: form, signal: options?.signal },
    options,
  )
  const jobId = raw['job-id'] ?? raw.job_id
  if (jobId == null || String(jobId).trim() === '') {
    throw new GuideScanError('parse', 'GuideScan did not return a job id.')
  }
  return { jobId: String(jobId) }
}

export async function fetchGuideScanJobStatus(
  jobId: string,
  options?: GuideScanClientOptions & { signal?: AbortSignal },
): Promise<GuideScanJobStatus> {
  const id = jobId.trim()
  if (!id) throw new GuideScanError('invalid_request', 'Job id is required.')
  const raw = await guidescanFetchJson<RawStatusResponse>(
    joinUrl(clientBase(options), `job/status/${encodeURIComponent(id)}`),
    { signal: options?.signal },
    options,
  )
  return normalizeStatus(id, raw)
}

export async function fetchGuideScanJobResultJson(
  jobId: string,
  options?: GuideScanClientOptions & { signal?: AbortSignal },
): Promise<unknown> {
  const id = jobId.trim()
  if (!id) throw new GuideScanError('invalid_request', 'Job id is required.')
  return guidescanFetchJson<unknown>(
    joinUrl(clientBase(options), `job/result/json/${encodeURIComponent(id)}`),
    { signal: options?.signal },
    options,
  )
}

export async function pollGuideScanJob(
  jobId: string,
  options?: GuideScanAwaitOptions,
): Promise<GuideScanJobStatus> {
  const pollIntervalMs = Math.max(200, options?.pollIntervalMs ?? 1_000)
  const overallTimeoutMs = options?.overallTimeoutMs ?? 180_000
  const started = Date.now()

  let lastReportedStatus: GuideScanJobStatusValue | null = null

  while (true) {
    if (options?.signal?.aborted) {
      throw new GuideScanError('cancelled', 'The GuideScan request was cancelled.')
    }
    if (Date.now() - started > overallTimeoutMs) {
      throw new GuideScanError('timeout', `GuideScan job ${jobId} timed out after ${Math.round(overallTimeoutMs / 1000)}s.`)
    }

    const status = await fetchGuideScanJobStatus(jobId, options)
    if (status.status !== lastReportedStatus) {
      lastReportedStatus = status.status
      options?.onProgress?.(`GuideScan2 job status: ${status.status}`)
    }
    if (status.status === 'completed') return status
    if (status.status === 'failed') {
      const reason = status.failure || `GuideScan job ${jobId} failed.`
      options?.onProgress?.(`Job failed: ${reason}`)
      throw new GuideScanError('job_failed', reason)
    }

    await sleep(pollIntervalMs, options?.signal)
  }
}
