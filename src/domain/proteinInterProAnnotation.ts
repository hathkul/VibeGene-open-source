import { PROTEIN_FEATURE_COLORS, type ProteinFeatureType } from './proteinFeatures'
import { createId, sanitizeProtein } from './sequence'
import type { SequenceFeature } from './types'
import { fetchSequenceResource } from './externalSequences/http'
import { jobDispatcherEmail } from './jobDispatcher'

const INTERPROSCAN_REST = 'https://www.ebi.ac.uk/Tools/services/rest/iprscan5'

export type InterProScanMatch = {
  id: string
  analysis: string
  signatureAccession: string
  signatureDescription: string
  start: number
  end: number
  score?: number
  status: string
  interProAccession?: string
  interProDescription?: string
  goTerms: string[]
  pathways: string[]
}

export type InterProAnnotationGroup = {
  id: string
  accession: string
  name: string
  description: string
  analysis: string
  matches: InterProScanMatch[]
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, ms)
    const abort = () => {
      globalThis.clearTimeout(timer)
      reject(new DOMException('The InterProScan search was cancelled.', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}

async function textResponse(url: string, init: RequestInit, signal?: AbortSignal) {
  const response = await fetchSequenceResource(url, { ...init, signal }, { attempts: 1, timeoutMs: 30_000 })
  return response.text()
}

function splitList(value: string | undefined) {
  return (value ?? '').split('|').map((item) => item.trim()).filter((item) => Boolean(item) && item !== '-')
}

/** Parse the documented InterProScan TSV output (15 columns, 1-based inclusive coordinates). */
export function parseInterProScanTsv(tsv: string): InterProScanMatch[] {
  const seen = new Set<string>()
  return tsv.split(/\r?\n/).flatMap((line) => {
    if (!line.trim() || line.startsWith('#')) return []
    const columns = line.split('\t')
    if (columns.length < 11) return []
    const analysis = columns[3]?.trim() ?? ''
    const signatureAccession = columns[4]?.trim() ?? ''
    const signatureDescription = columns[5]?.trim() ?? ''
    const startOneBased = Number(columns[6])
    const endOneBased = Number(columns[7])
    if (!analysis || !signatureAccession || !Number.isFinite(startOneBased) || !Number.isFinite(endOneBased)) return []
    const start = Math.max(0, Math.trunc(startOneBased) - 1)
    const end = Math.max(start + 1, Math.trunc(endOneBased))
    const interProAccession = columns[11]?.trim() || undefined
    const interProDescription = columns[12]?.trim() || undefined
    const id = `${analysis}:${signatureAccession}:${start}:${end}`
    if (seen.has(id)) return []
    seen.add(id)
    const score = Number(columns[8])
    return [{
      id,
      analysis,
      signatureAccession,
      signatureDescription,
      start,
      end,
      score: Number.isFinite(score) ? score : undefined,
      status: columns[9]?.trim() ?? '',
      interProAccession,
      interProDescription,
      goTerms: splitList(columns[13]),
      pathways: splitList(columns[14]),
    }]
  })
}

export function groupInterProMatches(matches: readonly InterProScanMatch[]): InterProAnnotationGroup[] {
  const groups = new Map<string, InterProAnnotationGroup>()
  for (const match of matches) {
    const accession = match.interProAccession || match.signatureAccession
    const id = `${match.analysis}:${accession}`
    const existing = groups.get(id)
    if (existing) {
      existing.matches.push(match)
      continue
    }
    groups.set(id, {
      id,
      accession,
      name: match.interProDescription || match.signatureDescription || accession,
      description: match.interProAccession && match.signatureDescription
        ? `${match.analysis} signature ${match.signatureAccession}: ${match.signatureDescription}`
        : `${match.analysis} signature ${match.signatureAccession}`,
      analysis: match.analysis,
      matches: [match],
    })
  }
  return [...groups.values()].sort((left, right) => {
    const leftStart = Math.min(...left.matches.map((match) => match.start))
    const rightStart = Math.min(...right.matches.map((match) => match.start))
    return leftStart - rightStart || left.name.localeCompare(right.name)
  })
}

async function submitInterProScanJob(sequence: string, signal?: AbortSignal) {
  const body = new URLSearchParams({
    email: jobDispatcherEmail(),
    title: 'VibeGene InterPro Pfam annotation',
    goterms: 'true',
    pathways: 'true',
    stype: 'p',
    appl: 'PfamA',
    sequence: `>VibeGene_query\n${sequence}`,
  })
  const jobId = (await textResponse(`${INTERPROSCAN_REST}/run`, {
    method: 'POST',
    headers: { Accept: 'text/plain', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }, signal)).trim()
  if (!jobId || /\s/.test(jobId) || /error/i.test(jobId)) {
    throw new Error(jobId || 'EMBL-EBI did not return an InterProScan job ID.')
  }
  return jobId
}

async function waitForInterProScanJob(jobId: string, onStatus?: (status: string) => void, signal?: AbortSignal) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const status = (await textResponse(`${INTERPROSCAN_REST}/status/${encodeURIComponent(jobId)}`, {
      headers: { Accept: 'text/plain' },
    }, signal)).trim().toUpperCase()
    onStatus?.(status)
    if (status === 'FINISHED') return
    if (['ERROR', 'FAILURE', 'NOT_FOUND'].includes(status)) {
      throw new Error(`EMBL-EBI InterProScan ended with status ${status}.`)
    }
    await delay(2_000, signal)
  }
  throw new Error('InterProScan did not finish within six minutes.')
}

async function interProScanResultTsv(jobId: string, signal?: AbortSignal) {
  const resultTypes = await textResponse(`${INTERPROSCAN_REST}/resulttypes/${encodeURIComponent(jobId)}`, {
    headers: { Accept: 'application/xml, text/xml' },
  }, signal)
  const identifiers = [...resultTypes.matchAll(/<identifier>([^<]+)<\/identifier>/gi)].map((match) => match[1]!.trim())
  const resultType = identifiers.includes('tsv') ? 'tsv' : identifiers.find((identifier) => /tsv/i.test(identifier))
  if (!resultType) throw new Error('EMBL-EBI did not provide InterProScan TSV output for this job.')
  return textResponse(`${INTERPROSCAN_REST}/result/${encodeURIComponent(jobId)}/${encodeURIComponent(resultType)}`, {
    headers: { Accept: 'text/tab-separated-values, text/plain' },
  }, signal)
}

export async function searchInterProPfam(
  sequenceInput: string,
  options?: { onStatus?: (status: string) => void; signal?: AbortSignal },
): Promise<InterProAnnotationGroup[]> {
  const sequence = sanitizeProtein(sequenceInput).toUpperCase().replace(/\*/g, '')
  if (sequence.length < 10) throw new Error('Select at least 10 amino acids for an InterPro/Pfam search.')
  options?.onStatus?.('SUBMITTING')
  const jobId = await submitInterProScanJob(sequence, options?.signal)
  await waitForInterProScanJob(jobId, options?.onStatus, options?.signal)
  options?.onStatus?.('RETRIEVING')
  return groupInterProMatches(parseInterProScanTsv(await interProScanResultTsv(jobId, options?.signal)))
}

function featureType(match: InterProScanMatch): ProteinFeatureType {
  const label = `${match.interProDescription ?? ''} ${match.signatureDescription}`.toLowerCase()
  if (label.includes('repeat')) return 'repeat'
  if (label.includes('motif')) return 'motif'
  return 'domain'
}

function quoted(value: string) {
  return value.replace(/"/g, "'")
}

export function featureFromInterProMatch(match: InterProScanMatch, queryOffset: number): SequenceFeature {
  const type = featureType(match)
  const name = match.interProDescription || match.signatureDescription || match.interProAccession || match.signatureAccession
  const sourceRefs = [
    `Pfam:${match.signatureAccession}`,
    match.interProAccession ? `InterPro:${match.interProAccession}` : '',
  ].filter(Boolean).join('; ')
  const details = [
    match.signatureDescription,
    match.score !== undefined ? `score ${match.score}` : '',
    match.goTerms.length ? `GO ${match.goTerms.join(', ')}` : '',
    match.pathways.length ? `pathways ${match.pathways.join(', ')}` : '',
  ].filter(Boolean).join('; ')
  return {
    id: createId('feature'),
    name,
    type,
    color: PROTEIN_FEATURE_COLORS[type],
    notes: [
      `/inference="Predicted by InterProScan (${quoted(sourceRefs)})"`,
      `/db_xref="${quoted(sourceRefs)}"`,
      details ? `/note="${quoted(details)}"` : '',
    ].filter(Boolean).join(' '),
    locations: [{ start: queryOffset + match.start, end: queryOffset + match.end, strand: 'forward' }],
  }
}
