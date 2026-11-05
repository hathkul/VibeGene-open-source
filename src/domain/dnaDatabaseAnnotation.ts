import { fetchNcbiRecord } from './externalSequences/ncbi'
import { fetchSequenceResource } from './externalSequences/http'
import type { SequenceSearchResult } from './externalSequences/types'
import { createId, normalizeDna } from './sequence'
import type { SequenceFeature, SequenceRecord, Strand } from './types'
import { parseEmbl } from './parsers'
import { abortableDelay, numericTag, retrieveNcbiBlastXml2, submitNcbiBlast, waitForNcbiBlast, xmlDecode, xmlTag } from './ncbiBlast'

const EBI_BLAST_REST = 'https://www.ebi.ac.uk/Tools/services/rest/ncbiblast'
const EBI_DBFETCH_REST = 'https://www.ebi.ac.uk/Tools/dbfetch/dbfetch'

export type DnaAnnotationDatabase = 'ena_synthetic' | 'ena' | 'refseq_genomic' | 'core_nt'

export type DnaSimilarityHit = {
  provider: 'ena' | 'ncbi'
  accession: string
  title: string
  subjectLength: number
  bitScore: number
  eValue: number
  identityPercent: number
  queryCoveragePercent: number
  queryStart: number
  queryEnd: number
  subjectStart: number
  subjectEnd: number
  queryAligned: string
  subjectAligned: string
}

export type ProjectedDnaAnnotation = {
  id: string
  name: string
  type: string
  sourceRange: string
  targetRange?: string
  coveragePercent: number
  identityPercent: number
  transferable: boolean
  selectedByDefault: boolean
  warning?: string
  feature?: SequenceFeature
}

export type DnaAnnotationPlan = {
  hit: DnaSimilarityHit
  sourceRecord: SequenceRecord
  organism?: string
  annotations: ProjectedDnaAnnotation[]
}

export function parseNcbiBlastXml2(xml: string, queryLength: number): DnaSimilarityHit[] {
  return [...xml.matchAll(/<(?:\w+:)?Hit>([\s\S]*?)<\/(?:\w+:)?Hit>/gi)].flatMap((match) => {
    const block = match[1]!
    const accession = xmlTag(block, 'accession') || xmlTag(block, 'id').split('|').at(-2) || ''
    const hsp = block.match(/<(?:\w+:)?Hsp>([\s\S]*?)<\/(?:\w+:)?Hsp>/i)?.[1]
    if (!accession || !hsp) return []
    const queryStart = numericTag(hsp, 'query-from') || numericTag(hsp, 'query_from')
    const queryEnd = numericTag(hsp, 'query-to') || numericTag(hsp, 'query_to')
    const subjectStart = numericTag(hsp, 'hit-from') || numericTag(hsp, 'hit_from')
    const subjectEnd = numericTag(hsp, 'hit-to') || numericTag(hsp, 'hit_to')
    const alignmentLength = Math.max(1, numericTag(hsp, 'align-len') || numericTag(hsp, 'align_len'))
    return [{
      provider: 'ncbi',
      accession: accession.replace(/\.\d+$/, (version) => version),
      title: xmlTag(block, 'title') || accession,
      subjectLength: numericTag(block, 'len'),
      bitScore: numericTag(hsp, 'bit-score') || numericTag(hsp, 'bit_score'),
      eValue: numericTag(hsp, 'evalue'),
      identityPercent: numericTag(hsp, 'identity') / alignmentLength * 100,
      queryCoveragePercent: (Math.abs(queryEnd - queryStart) + 1) / Math.max(1, queryLength) * 100,
      queryStart,
      queryEnd,
      subjectStart,
      subjectEnd,
      queryAligned: xmlTag(hsp, 'qseq'),
      subjectAligned: xmlTag(hsp, 'hseq'),
    }]
  })
}

function xmlAttribute(attributes: string, name: string) {
  const match = attributes.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, 'i'))
  return xmlDecode((match?.[1] ?? match?.[2] ?? '').trim())
}

function ebiSequence(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)<\\/${name}>`, 'i'))
  return match ? {
    start: Number(xmlAttribute(match[1]!, 'start')) || 0,
    end: Number(xmlAttribute(match[1]!, 'end')) || 0,
    sequence: xmlDecode(match[2]!).replace(/\s+/g, ''),
  } : { start: 0, end: 0, sequence: '' }
}

/** Parse EMBL-EBI Job Dispatcher nucleotide BLAST XML. */
export function parseEbiDnaBlastXml(xml: string, queryLength: number): DnaSimilarityHit[] {
  return [...xml.matchAll(/<hit\b([^>]*)>([\s\S]*?)<\/hit>/gi)].flatMap((match) => {
    const attributes = match[1]!
    const block = match[2]!
    const alignment = block.match(/<alignment\b[^>]*>([\s\S]*?)<\/alignment>/i)?.[1]
    const accession = xmlAttribute(attributes, 'ac').replace(/^.*\|([^|]+)\|?$/, '$1')
    if (!alignment || !accession) return []
    const query = ebiSequence(alignment, 'querySeq')
    const subject = ebiSequence(alignment, 'matchSeq')
    if (!query.sequence || !subject.sequence) return []
    return [{
      provider: 'ena' as const,
      accession,
      title: xmlAttribute(attributes, 'description') || accession,
      subjectLength: Number(xmlAttribute(attributes, 'length')) || 0,
      bitScore: numericTag(alignment, 'bits'),
      eValue: numericTag(alignment, 'expectation'),
      identityPercent: numericTag(alignment, 'identity'),
      queryCoveragePercent: (Math.abs(query.end - query.start) + 1) / Math.max(1, queryLength) * 100,
      queryStart: query.start,
      queryEnd: query.end,
      subjectStart: subject.start,
      subjectEnd: subject.end,
      queryAligned: query.sequence,
      subjectAligned: subject.sequence,
    }]
  })
}

function delay(ms: number, signal?: AbortSignal) {
  return abortableDelay(ms, signal, 'The DNA database search was cancelled.')
}

async function submitBlast(sequence: string, database: DnaAnnotationDatabase, maxHits: number, signal?: AbortSignal) {
  return submitNcbiBlast({
    PROGRAM: 'blastn',
    DATABASE: database,
    QUERY: `>VibeGene_query\n${sequence}`,
    MEGABLAST: 'on',
    EXPECT: '1e-10',
    FILTER: 'mL',
    HITLIST_SIZE: String(maxHits),
    FORMAT_TYPE: 'XML2_S',
  }, signal)
}

async function ebiTextResponse(url: string, init: RequestInit = {}, signal?: AbortSignal) {
  const response = await fetchSequenceResource(url, { ...init, signal }, { attempts: 2, timeoutMs: 45_000 })
  return response.text()
}

async function submitEnaBlast(sequence: string, database: 'ena_synthetic' | 'ena', maxHits: number, signal?: AbortSignal) {
  const body = new URLSearchParams({
    email: 'support@vibe-gene.com',
    title: 'VibeGene ENA DNA annotation search',
    program: 'blastn',
    task: 'megablast',
    alignments: String(maxHits),
    scores: String(maxHits),
    exp: '1e-10',
    filter: 'T',
    stype: 'dna',
    database: database === 'ena_synthetic' ? 'em_std_syn' : 'em_all',
    sequence: `>VibeGene_query\n${sequence}`,
  })
  const jobId = (await ebiTextResponse(`${EBI_BLAST_REST}/run`, {
    method: 'POST',
    headers: { Accept: 'text/plain', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }, signal)).trim()
  if (!jobId || /\s/.test(jobId) || /error/i.test(jobId)) throw new Error(jobId || 'EMBL-EBI did not return a DNA similarity-search job ID.')
  return jobId
}

async function waitForEnaBlast(jobId: string, onStatus?: (status: string) => void, signal?: AbortSignal) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const status = (await ebiTextResponse(`${EBI_BLAST_REST}/status/${encodeURIComponent(jobId)}`, {
      headers: { Accept: 'text/plain' },
    }, signal)).trim().toUpperCase()
    onStatus?.(status)
    if (status === 'FINISHED') return
    if (['ERROR', 'FAILURE', 'NOT_FOUND'].includes(status)) throw new Error(`EMBL-EBI DNA similarity search ended with status ${status}.`)
    await delay(3_000, signal)
  }
  throw new Error('The EMBL-EBI DNA similarity search did not finish within ten minutes.')
}

async function enaBlastResult(jobId: string, signal?: AbortSignal) {
  const resultTypes = await ebiTextResponse(`${EBI_BLAST_REST}/resulttypes/${encodeURIComponent(jobId)}`, {
    headers: { Accept: 'application/xml, text/xml' },
  }, signal)
  const identifiers = [...resultTypes.matchAll(/<identifier>([^<]+)<\/identifier>/gi)].map((match) => match[1]!.trim())
  const resultType = identifiers.includes('xml') ? 'xml' : identifiers.find((identifier) => /xml/i.test(identifier))
  if (!resultType) throw new Error('EMBL-EBI did not provide nucleotide BLAST XML output.')
  return ebiTextResponse(`${EBI_BLAST_REST}/result/${encodeURIComponent(jobId)}/${encodeURIComponent(resultType)}`, {
    headers: { Accept: 'application/xml, text/xml' },
  }, signal)
}

async function fetchEnaRecord(accession: string, signal?: AbortSignal) {
  const text = await ebiTextResponse(`${EBI_DBFETCH_REST}/ena_sequence/${encodeURIComponent(accession)}/embl?style=raw`, {
    headers: { Accept: 'text/plain' },
  }, signal)
  if (/^ERROR\s/i.test(text.trim())) throw new Error(text.trim())
  return parseEmbl(text, `${accession}.embl`)
}

async function searchEnaAnnotations(sequence: string, database: 'ena_synthetic' | 'ena', maxHits: number, queryOffset: number, onStatus?: (status: string) => void, signal?: AbortSignal) {
  onStatus?.('SUBMITTING')
  const jobId = await submitEnaBlast(sequence, database, maxHits, signal)
  await waitForEnaBlast(jobId, onStatus, signal)
  onStatus?.('RETRIEVING')
  const hits = parseEbiDnaBlastXml(await enaBlastResult(jobId, signal), sequence.length).slice(0, maxHits)
  const plans: DnaAnnotationPlan[] = []
  for (const hit of hits) {
    try {
      plans.push(buildDnaAnnotationPlan(hit, await fetchEnaRecord(hit.accession, signal), queryOffset))
    } catch {
      // Ignore hits whose annotated source record is unavailable from ENA.
    }
  }
  return plans
}

function searchResult(hit: DnaSimilarityHit): SequenceSearchResult {
  return {
    provider: 'ncbi',
    id: hit.accession,
    accession: hit.accession,
    name: hit.accession,
    description: hit.title,
    molecule: 'dna',
    length: hit.subjectLength,
    database: 'nuccore',
  }
}

export async function searchDnaDatabaseAnnotations(
  sequenceInput: string,
  options: { database: DnaAnnotationDatabase; maxHits?: number; queryOffset?: number; onStatus?: (status: string) => void; signal?: AbortSignal },
) {
  const sequence = normalizeDna(sequenceInput)
  if (sequence.length < 30) throw new Error('Select at least 30 bp for a DNA database annotation search.')
  const maxHits = Math.max(5, Math.min(20, options.maxHits ?? 10))
  if (options.database === 'ena' || options.database === 'ena_synthetic') {
    return searchEnaAnnotations(sequence, options.database, maxHits, options.queryOffset ?? 0, options.onStatus, options.signal)
  }
  options.onStatus?.('SUBMITTING')
  const { rid, rtoeSeconds } = await submitBlast(sequence, options.database, maxHits, options.signal)
  if (!await waitForNcbiBlast(rid, rtoeSeconds, options.onStatus, options.signal)) return []
  options.onStatus?.('RETRIEVING')
  const hits = parseNcbiBlastXml2(await retrieveNcbiBlastXml2(rid, options.signal), sequence.length).slice(0, maxHits)
  const plans: DnaAnnotationPlan[] = []
  for (const hit of hits) {
    try {
      const sourceRecord = await fetchNcbiRecord(searchResult(hit), { includeAnnotations: true }, options.signal)
      plans.push(buildDnaAnnotationPlan(hit, sourceRecord, options.queryOffset ?? 0))
    } catch {
      // Some BLAST database entries are not retrievable from nuccore; retain usable records only.
    }
    if (plans.length < hits.length) await delay(350, options.signal)
  }
  return plans
}

function rangeLabel(start: number, end: number) {
  return start === end - 1 ? String(start + 1) : `${start + 1}–${end}`
}

function appendInference(notes: string | undefined, inference: string) {
  return `${notes?.trim() ? `${notes.trim()} ` : ''}/inference="${inference.replace(/"/g, "'")}"`
}

export function organismFromDnaSourceRecord(record: SequenceRecord) {
  for (const feature of record.features) {
    if (feature.type.toLowerCase() !== 'source') continue
    const match = feature.notes?.match(/(?:^|\s)\/organism=(?:"([^"]+)"|([^\s/]+))/i)
    const organism = (match?.[1] ?? match?.[2] ?? '').trim()
    if (organism) return organism
  }
  return undefined
}

export function buildDnaAnnotationPlan(hit: DnaSimilarityHit, sourceRecord: SequenceRecord, queryOffset: number): DnaAnnotationPlan {
  const subjectStep = hit.subjectEnd >= hit.subjectStart ? 1 : -1
  const queryStep = hit.queryEnd >= hit.queryStart ? 1 : -1
  let subjectIndex = hit.subjectStart - 1
  let queryIndex = hit.queryStart - 1
  const sourceToQuery = new Map<number, { sourceIndex: number; queryIndex: number; identity: boolean }>()
  const length = Math.max(hit.queryAligned.length, hit.subjectAligned.length)
  for (let column = 0; column < length; column += 1) {
    const queryBase = hit.queryAligned[column]
    const subjectBase = hit.subjectAligned[column]
    if (queryBase !== '-' && subjectBase !== '-') {
      sourceToQuery.set(subjectIndex, { sourceIndex: subjectIndex, queryIndex, identity: queryBase?.toUpperCase() === subjectBase?.toUpperCase() })
    }
    if (queryBase !== '-') queryIndex += queryStep
    if (subjectBase !== '-') subjectIndex += subjectStep
  }
  const flipsStrand = subjectStep !== queryStep
  const annotations = sourceRecord.features.flatMap((sourceFeature): ProjectedDnaAnnotation[] => {
    if (sourceFeature.type.toLowerCase() === 'source') return []
    const sourcePositions = sourceFeature.locations.flatMap((location) => {
      const positions: number[] = []
      for (let position = location.start; position < location.end; position += 1) positions.push(position)
      return positions
    })
    if (!sourcePositions.length) return []
    const mapped = sourcePositions.flatMap((position) => {
      const entry = sourceToQuery.get(position)
      return entry ? [entry] : []
    })
    if (!mapped.length) return []
    const coveragePercent = mapped.length / sourcePositions.length * 100
    const identityPercent = mapped.filter((entry) => entry.identity).length / mapped.length * 100
    const transferable = mapped.some((entry) => entry.identity) && coveragePercent >= 60
    const selectedByDefault = transferable && coveragePercent >= 90 && identityPercent >= 85
    const sourceStrand = sourceFeature.locations[0]?.strand ?? 'forward'
    const strand: Strand = flipsStrand ? (sourceStrand === 'reverse' ? 'forward' : 'reverse') : sourceStrand
    const identicalInQueryOrder = mapped.filter((entry) => entry.identity).sort((left, right) => left.queryIndex - right.queryIndex)
    const targetLocations = identicalInQueryOrder.reduce<Array<{ start: number; end: number; strand: Strand }>>((segments, entry, index) => {
      const previousEntry = identicalInQueryOrder[index - 1]
      const previousSegment = segments.at(-1)
      const continues = previousEntry
        && previousSegment
        && entry.queryIndex === previousEntry.queryIndex + 1
        && Math.abs(entry.sourceIndex - previousEntry.sourceIndex) === 1
      if (continues) previousSegment.end = queryOffset + entry.queryIndex + 1
      else segments.push({ start: queryOffset + entry.queryIndex, end: queryOffset + entry.queryIndex + 1, strand })
      return segments
    }, [])
    const sourceStart = Math.min(...sourcePositions)
    const sourceEnd = Math.max(...sourcePositions) + 1
    const partial = mapped.length < sourcePositions.length || identicalInQueryOrder.length < mapped.length || targetLocations.length > sourceFeature.locations.length
    const warning = !identicalInQueryOrder.length ? 'No bases in this feature are identical in the query.'
      : !transferable ? `Only ${coveragePercent.toFixed(1)}% of this feature maps to the query.`
      : coveragePercent < 90 ? 'This feature maps only partially.'
        : identityPercent < 85 ? 'The mapped feature has substantial sequence differences.' : undefined
    const inference = `Transferred by nucleotide similarity from ${hit.provider === 'ena' ? 'ENA' : 'NCBI'}:${hit.accession}; ${identityPercent.toFixed(1)}% feature identity; ${coveragePercent.toFixed(1)}% feature coverage`
    return [{
      id: `${hit.accession}:${sourceFeature.id}`,
      name: sourceFeature.name,
      type: sourceFeature.type,
      sourceRange: rangeLabel(sourceStart, sourceEnd),
      targetRange: targetLocations.map((location) => rangeLabel(location.start, location.end)).join(', '),
      coveragePercent,
      identityPercent,
      transferable,
      selectedByDefault,
      warning,
      feature: {
        ...sourceFeature,
        id: createId('feature'),
        notes: `${appendInference(sourceFeature.notes, inference)}${partial ? ` /note="Partial match transferred as ${targetLocations.length} exact-match segment${targetLocations.length === 1 ? '' : 's'}; unmapped and differing bases omitted"` : ''}`,
        locations: targetLocations,
      },
    }]
  })
  return { hit, sourceRecord, organism: organismFromDnaSourceRecord(sourceRecord), annotations }
}
