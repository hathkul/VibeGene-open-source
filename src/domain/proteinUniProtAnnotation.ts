import { alignProteinToProtein } from './proteinAlignment'
import type { ProteinComparisonSource } from './proteinAlignmentTypes'
import { createId, sanitizeProtein } from './sequence'
import type { ProteinBond, SequenceFeature } from './types'
import { fetchSequenceResource } from './externalSequences/http'
import { jobDispatcherEmail } from './jobDispatcher'
import {
  fetchUniProtEntries,
  recordFromUniProtEntry,
  type UniProtEntry,
} from './externalSequences/uniprot'

const NCBI_BLAST_REST = 'https://www.ebi.ac.uk/Tools/services/rest/ncbiblast'

export type UniProtBlastDatabase = 'uniprotkb_swissprot' | 'uniprotkb'

export type UniProtSimilarityHit = {
  accession: string
  description: string
  subjectLength: number
  bitScore: number
  eValue: number
  identityPercent: number
  positivesPercent: number
  queryCoveragePercent: number
  queryStart: number
  queryEnd: number
  subjectStart: number
  subjectEnd: number
  reviewed: boolean
  organism?: string
  proteinName?: string
  featureCount: number
  bondCount: number
  entry: UniProtEntry
}

export type ProjectedUniProtAnnotation = {
  id: string
  kind: 'feature' | 'bond'
  name: string
  type: string
  sourceRange: string
  targetRange?: string
  coveragePercent: number
  identityPercent: number
  experimentalEvidence: boolean
  transferable: boolean
  selectedByDefault: boolean
  warning?: string
  feature?: SequenceFeature
  bond?: ProteinBond
}

export type UniProtAnnotationPlan = {
  hit: UniProtSimilarityHit
  queryOffset: number
  queryLength: number
  alignmentIdentityPercent: number
  alignmentCoveragePercent: number
  annotations: ProjectedUniProtAnnotation[]
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, ms)
    const abort = () => {
      globalThis.clearTimeout(timer)
      reject(new DOMException('The similarity search was cancelled.', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}

function xmlDecode(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function xmlTag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))
  return match ? xmlDecode(match[1]!.trim()) : ''
}

function numericTag(block: string, name: string) {
  const value = Number(xmlTag(block, name))
  return Number.isFinite(value) ? value : 0
}

function xmlAttribute(attributes: string, name: string) {
  const match = attributes.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, 'i'))
  return xmlDecode((match?.[1] ?? match?.[2] ?? '').trim())
}

function ebiSequenceTag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)<\\/${name}>`, 'i'))
  return match ? {
    start: Number(xmlAttribute(match[1]!, 'start')) || 0,
    end: Number(xmlAttribute(match[1]!, 'end')) || 0,
  } : { start: 0, end: 0 }
}

function accessionFromHit(hit: string) {
  const accession = xmlTag(hit, 'Hit_accession')
  if (accession && !/^gnl\|/i.test(accession)) return accession.replace(/\.\d+$/, '')
  const id = xmlTag(hit, 'Hit_id')
  const pipe = id.match(/(?:sp|tr)\|([^|]+)\|/i)
  return (pipe?.[1] ?? id.split(/\s+/)[0] ?? '').replace(/\.\d+$/, '')
}

export function parseUniProtBlastXml(xml: string, queryLength: number) {
  // Job Dispatcher currently returns its EBIApplicationResult schema for the
  // `xml` result type (lower-case hit/alignment elements with identifiers and
  // coordinates in attributes), not NCBI BlastOutput's Hit/Hsp elements.
  if (/<SequenceSimilaritySearchResult\b/i.test(xml)) {
    return [...xml.matchAll(/<hit\b([^>]*)>([\s\S]*?)<\/hit>/gi)].flatMap((match) => {
      const hitAttributes = match[1]!
      const hit = match[2]!
      const alignment = hit.match(/<alignment\b[^>]*>([\s\S]*?)<\/alignment>/i)?.[1]
      const accession = xmlAttribute(hitAttributes, 'ac').replace(/\.\d+$/, '')
      if (!accession || !alignment) return []
      const query = ebiSequenceTag(alignment, 'querySeq')
      const subject = ebiSequenceTag(alignment, 'matchSeq')
      return [{
        accession,
        description: xmlAttribute(hitAttributes, 'description'),
        subjectLength: Number(xmlAttribute(hitAttributes, 'length')) || 0,
        bitScore: numericTag(alignment, 'bits'),
        eValue: numericTag(alignment, 'expectation'),
        identityPercent: numericTag(alignment, 'identity'),
        positivesPercent: numericTag(alignment, 'positives'),
        queryCoveragePercent: Math.max(0, query.end - query.start + 1) / Math.max(1, queryLength) * 100,
        queryStart: query.start,
        queryEnd: query.end,
        subjectStart: subject.start,
        subjectEnd: subject.end,
      }]
    })
  }

  return [...xml.matchAll(/<Hit>([\s\S]*?)<\/Hit>/gi)].flatMap((match) => {
    const hit = match[1]!
    const accession = accessionFromHit(hit)
    const hsp = hit.match(/<Hsp>([\s\S]*?)<\/Hsp>/i)?.[1]
    if (!accession || !hsp) return []
    const alignmentLength = Math.max(1, numericTag(hsp, 'Hsp_align-len'))
    const queryStart = numericTag(hsp, 'Hsp_query-from')
    const queryEnd = numericTag(hsp, 'Hsp_query-to')
    return [{
      accession,
      description: xmlTag(hit, 'Hit_def'),
      subjectLength: numericTag(hit, 'Hit_len'),
      bitScore: numericTag(hsp, 'Hsp_bit-score'),
      eValue: numericTag(hsp, 'Hsp_evalue'),
      identityPercent: numericTag(hsp, 'Hsp_identity') / alignmentLength * 100,
      positivesPercent: numericTag(hsp, 'Hsp_positive') / alignmentLength * 100,
      queryCoveragePercent: Math.max(0, queryEnd - queryStart + 1) / Math.max(1, queryLength) * 100,
      queryStart,
      queryEnd,
      subjectStart: numericTag(hsp, 'Hsp_hit-from'),
      subjectEnd: numericTag(hsp, 'Hsp_hit-to'),
    }]
  })
}

async function textResponse(url: string, init: RequestInit, signal?: AbortSignal) {
  const response = await fetchSequenceResource(url, { ...init, signal }, { attempts: 1, timeoutMs: 30_000 })
  return response.text()
}

async function submitBlastJob(
  sequence: string,
  database: UniProtBlastDatabase,
  maxHits: number,
  signal?: AbortSignal,
) {
  const shortQuery = sequence.length < 30
  const body = new URLSearchParams({
    email: jobDispatcherEmail(),
    title: 'VibeGene UniProt annotation search',
    program: 'blastp',
    matrix: shortQuery ? 'PAM30' : 'BLOSUM62',
    alignments: String(maxHits),
    scores: String(maxHits),
    exp: shortQuery ? '1000' : '1e-5',
    filter: shortQuery ? 'F' : 'T',
    gapopen: shortQuery ? '9' : '11',
    gapext: '1',
    stype: 'protein',
    database,
    sequence: `>VibeGene_query\n${sequence}`,
  })
  const jobId = (await textResponse(`${NCBI_BLAST_REST}/run`, {
    method: 'POST',
    headers: { Accept: 'text/plain', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }, signal)).trim()
  if (!jobId || /\s/.test(jobId) || /error/i.test(jobId)) {
    throw new Error(jobId || 'EMBL-EBI did not return a similarity-search job ID.')
  }
  return jobId
}

async function waitForBlastJob(
  jobId: string,
  onStatus?: (status: string) => void,
  signal?: AbortSignal,
) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = (await textResponse(`${NCBI_BLAST_REST}/status/${encodeURIComponent(jobId)}`, {
      headers: { Accept: 'text/plain' },
    }, signal)).trim().toUpperCase()
    onStatus?.(status)
    if (status === 'FINISHED') return
    if (['ERROR', 'FAILURE', 'NOT_FOUND'].includes(status)) {
      throw new Error(`EMBL-EBI similarity search ended with status ${status}.`)
    }
    await delay(1_500, signal)
  }
  throw new Error('The similarity search did not finish within three minutes.')
}

async function blastResultXml(jobId: string, signal?: AbortSignal) {
  const resultTypes = await textResponse(`${NCBI_BLAST_REST}/resulttypes/${encodeURIComponent(jobId)}`, {
    headers: { Accept: 'application/xml, text/xml' },
  }, signal)
  const identifiers = [...resultTypes.matchAll(/<identifier>([^<]+)<\/identifier>/gi)].map((match) => match[1]!.trim())
  const resultType = identifiers.includes('xml')
    ? 'xml'
    : identifiers.find((identifier) => /xml/i.test(identifier))
  if (!resultType) throw new Error('EMBL-EBI did not provide BLAST XML output for this job.')
  return textResponse(`${NCBI_BLAST_REST}/result/${encodeURIComponent(jobId)}/${encodeURIComponent(resultType)}`, {
    headers: { Accept: 'application/xml, text/xml' },
  }, signal)
}

function entryProteinName(entry: UniProtEntry) {
  return entry.proteinDescription?.recommendedName?.fullName?.value
    || entry.proteinDescription?.submissionNames?.[0]?.fullName?.value
    || entry.uniProtkbId
    || entry.primaryAccession
    || 'UniProt protein'
}

export async function searchUniProtBySimilarity(
  sequenceInput: string,
  options?: {
    database?: UniProtBlastDatabase
    maxHits?: number
    organism?: string
    onStatus?: (status: string) => void
    signal?: AbortSignal
  },
): Promise<UniProtSimilarityHit[]> {
  const sequence = sanitizeProtein(sequenceInput).toUpperCase().replace(/\*/g, '')
  if (sequence.length < 5) throw new Error('Select at least 5 amino acids for a similarity search.')
  const maxHits = Math.max(5, Math.min(50, options?.maxHits ?? 20))
  const organism = options?.organism?.trim().toLowerCase() ?? ''
  const retrievalLimit = organism ? 50 : maxHits
  options?.onStatus?.('SUBMITTING')
  const jobId = await submitBlastJob(sequence, options?.database ?? 'uniprotkb_swissprot', retrievalLimit, options?.signal)
  await waitForBlastJob(jobId, options?.onStatus, options?.signal)
  options?.onStatus?.('RETRIEVING')
  const parsed = parseUniProtBlastXml(await blastResultXml(jobId, options?.signal), sequence.length).slice(0, retrievalLimit)
  const entries = await fetchUniProtEntries(parsed.map((hit) => hit.accession), options?.signal)
  const byAccession = new Map(entries.map((entry) => [entry.primaryAccession, entry]))
  return parsed.flatMap((hit) => {
    const entry = byAccession.get(hit.accession)
    if (!entry) return []
    const annotated = recordFromUniProtEntry(entry)
    return [{
      ...hit,
      reviewed: /reviewed/i.test(entry.entryType ?? ''),
      organism: entry.organism?.scientificName,
      proteinName: entryProteinName(entry),
      featureCount: annotated.features.length,
      bondCount: annotated.protein?.bonds.length ?? 0,
      entry,
    }]
  }).filter((hit) => !organism || hit.organism?.toLowerCase() === organism).slice(0, maxHits)
}

function percent(value: number) {
  return `${Math.round(value * 10) / 10}%`
}

function appendInference(notes: string | undefined, inference: string) {
  const safe = inference.replace(/"/g, "'")
  return `${notes?.trim() ? `${notes.trim()} ` : ''}/inference="${safe}"`
}

function rangeLabel(start: number, end: number) {
  return start === end - 1 ? String(start + 1) : `${start + 1}–${end}`
}

export function buildUniProtAnnotationPlan(
  querySequenceInput: string,
  queryOffset: number,
  hit: UniProtSimilarityHit,
): UniProtAnnotationPlan {
  const querySequence = sanitizeProtein(querySequenceInput).toUpperCase()
  const sourceSequence = sanitizeProtein(hit.entry.sequence?.value ?? '').toUpperCase()
  const source: ProteinComparisonSource = {
    id: `uniprot:${hit.accession}`,
    name: hit.proteinName || hit.accession,
    kind: 'protein',
    sequence: sourceSequence,
    enabled: true,
  }
  const alignment = alignProteinToProtein(querySequence, source)
  if (!alignment) throw new Error(`Could not align ${hit.accession} to the submitted sequence.`)
  const residueColumns = alignment.columns.filter((column) => column.referenceIndex !== null && column.sourceIndex !== undefined)
  const alignmentIdentityPercent = alignment.identityCount / Math.max(1, residueColumns.length) * 100
  const coveredQuery = new Set(residueColumns.map((column) => column.referenceIndex!)).size
  const alignmentCoveragePercent = coveredQuery / Math.max(1, querySequence.length) * 100
  const sourceToQuery = new Map<number, { queryIndex: number; identity: boolean; sourceResidue?: string; queryResidue?: string }>()
  residueColumns.forEach((column) => {
    sourceToQuery.set(column.sourceIndex!, {
      queryIndex: column.referenceIndex!,
      identity: column.similarity === 'identity',
      sourceResidue: column.sourceResidue,
      queryResidue: column.referenceResidue,
    })
  })
  const sourceRecord = recordFromUniProtEntry(hit.entry)
  const inference = `Transferred by sequence similarity from UniProtKB:${hit.accession}; ${percent(alignmentIdentityPercent)} identity; ${percent(alignmentCoveragePercent)} query coverage`
  const pointTypes = new Set(['active site', 'binding site', 'metal binding', 'modified residue', 'glycosylation', 'lipidation', 'site'])

  const featureAnnotations = sourceRecord.features.flatMap((sourceFeature): ProjectedUniProtAnnotation[] => {
    const location = sourceFeature.locations[0]
    if (!location) return []
    const sourceLength = Math.max(1, location.end - location.start)
    const mapped = Array.from({ length: sourceLength }, (_, index) => {
      const sourceIndex = location.start + index
      const entry = sourceToQuery.get(sourceIndex)
      return entry ? { ...entry, sourceIndex } : null
    }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    if (!mapped.length) return []
    const coveragePercent = mapped.length / sourceLength * 100
    const identityPercent = mapped.filter((entry) => entry.identity).length / mapped.length * 100
    const identical = mapped.filter((entry) => entry.identity).sort((left, right) => left.queryIndex - right.queryIndex)
    const targetLocations = identical.reduce<SequenceFeature['locations']>((segments, entry, index) => {
      const previousEntry = identical[index - 1]
      const previousSegment = segments.at(-1)
      if (previousEntry && previousSegment && entry.queryIndex === previousEntry.queryIndex + 1 && entry.sourceIndex === previousEntry.sourceIndex + 1) {
        previousSegment.end = queryOffset + entry.queryIndex + 1
      } else {
        segments.push({ start: queryOffset + entry.queryIndex, end: queryOffset + entry.queryIndex + 1, strand: 'forward' })
      }
      return segments
    }, [])
    const isPoint = sourceLength <= 2 || pointTypes.has(sourceFeature.type)
    const residueConserved = mapped.length === sourceLength && mapped.every((entry) => entry.identity)
    const transferable = identical.length > 0 && (isPoint ? residueConserved : coveragePercent >= 50)
    const selectedByDefault = transferable && (isPoint
      ? residueConserved
      : coveragePercent >= 80 && identityPercent >= 40)
    const warning = !identical.length
      ? 'No amino acids in this annotation are identical in the query.'
      : !transferable
      ? `Only ${percent(coveragePercent)} of this annotation aligns.`
      : isPoint && !residueConserved
        ? 'The annotated residue is not identical in the query.'
        : identityPercent < 100
          ? `${mapped.length - identical.length} differing amino acid${mapped.length - identical.length === 1 ? '' : 's'} omitted from the feature.`
          : coveragePercent < 80
          ? 'This annotation is only partially aligned.'
          : undefined
    const feature: SequenceFeature | undefined = targetLocations.length ? {
      ...sourceFeature,
      id: createId('feature'),
      notes: `${appendInference(sourceFeature.notes, `${inference}; source residues ${rangeLabel(location.start, location.end)}`)}${identityPercent < 100 ? ` /note="Transferred as ${targetLocations.length} exact-match segment${targetLocations.length === 1 ? '' : 's'}; differing amino acids omitted"` : ''}`,
      locations: targetLocations,
    } : undefined
    return [{
      id: `feature:${sourceFeature.id}`,
      kind: 'feature',
      name: sourceFeature.name,
      type: sourceFeature.type,
      sourceRange: rangeLabel(location.start, location.end),
      targetRange: targetLocations.map((target) => rangeLabel(target.start, target.end)).join(', ') || undefined,
      coveragePercent,
      identityPercent,
      experimentalEvidence: /ECO:0000269/.test(sourceFeature.notes ?? ''),
      transferable,
      selectedByDefault,
      warning,
      feature,
    }]
  })

  const bondAnnotations = (sourceRecord.protein?.bonds ?? []).flatMap((sourceBond): ProjectedUniProtAnnotation[] => {
    const left = sourceToQuery.get(sourceBond.endpoints[0].residue)
    const right = sourceToQuery.get(sourceBond.endpoints[1].residue)
    if (!left && !right) return []
    const bothMapped = Boolean(left && right && left.queryIndex !== right.queryIndex)
    const cysteinesConserved = sourceBond.type !== 'disulfide'
      || (left?.queryResidue === 'C' && right?.queryResidue === 'C')
    const residuesConserved = Boolean(left?.identity && right?.identity)
    const transferable = bothMapped && cysteinesConserved
    const warning = !bothMapped
      ? 'One bond endpoint is outside the aligned region.'
      : !cysteinesConserved
        ? 'Both disulfide endpoints do not map to cysteines.'
        : !residuesConserved
          ? 'One or both bond residues differ in the query.'
          : undefined
    const sourceRange = `${sourceBond.endpoints[0].residue + 1} ↔ ${sourceBond.endpoints[1].residue + 1}`
    const targetRange = left && right ? `${queryOffset + left.queryIndex + 1} ↔ ${queryOffset + right.queryIndex + 1}` : undefined
    const bond: ProteinBond | undefined = left && right ? {
      ...sourceBond,
      id: createId('protein-bond'),
      endpoints: [
        { residue: queryOffset + left.queryIndex },
        { residue: queryOffset + right.queryIndex },
      ],
      notes: appendInference(sourceBond.notes, `${inference}; source residues ${sourceRange}`),
    } : undefined
    return [{
      id: `bond:${sourceBond.id}`,
      kind: 'bond',
      name: sourceBond.name,
      type: sourceBond.type,
      sourceRange,
      targetRange,
      coveragePercent: bothMapped ? 100 : 50,
      identityPercent: [left, right].filter((entry) => entry?.identity).length / 2 * 100,
      experimentalEvidence: /ECO:0000269/.test(sourceBond.notes ?? ''),
      transferable,
      selectedByDefault: transferable && residuesConserved,
      warning,
      bond,
    }]
  })

  return {
    hit,
    queryOffset,
    queryLength: querySequence.length,
    alignmentIdentityPercent,
    alignmentCoveragePercent,
    annotations: [...featureAnnotations, ...bondAnnotations],
  }
}
