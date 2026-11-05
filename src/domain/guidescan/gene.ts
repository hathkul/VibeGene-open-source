import { normalizeSequenceRecord } from '../constructProperties'
import { fetchEnsemblRecord, lookupEnsemblId, searchEnsembl } from '../externalSequences/ensembl'
import { databaseImportError, fetchJson, fetchText } from '../externalSequences/http'
import {
  fetchNcbiGeneEntry,
  fetchNcbiGeneGenomicSummary,
  ncbiEutilsUrl,
  searchNcbiGenes,
  type NcbiGeneGenomicSummary,
} from '../externalSequences/ncbi'
import { parseSequenceFile } from '../parsers'
import { addOperation, nowIso } from '../sequence'
import type { ExternalSequenceSource, SequenceRecord } from '../types'
import {
  anchorFromEnsemblGene,
  chromosomeFromRefSeqAccession,
  formatChromosomeForGuideScan,
  genomicAnchorFromRefSeqGeneEnds,
  ncbiFastaWindowIndexToGenomic,
  uniqueDnaSubstringIndex,
  withGenomicAnchor,
} from './anchor'
import { isLikelyEntrezGeneId } from './geneIdentity'
import { ensemblSpeciesForGuideScanOrganism, guidescanOrganismMeta } from './organisms'
import type { GuideScanGeneSequenceResult, GuideScanGeneSuggestion } from './types'
import { GuideScanError } from './types'

export type GuideScanGeneLookupOptions = {
  signal?: AbortSignal
  /** Max suggestions to return after exact-first ranking. Defaults to 12. */
  limit?: number
  /** Optional side-effect-free progress hook for UI activity logs. */
  onProgress?: (message: string) => void
  /** Optional hook when gene suggestions switch data sources (e.g. Ensembl → NCBI). */
  onSourceNote?: (note: string) => void
}

export type GuideScanGeneAutocompleteSource = 'ensembl' | 'ncbi'

export type GuideScanGeneAutocompleteResult = {
  suggestions: GuideScanGeneSuggestion[]
  source: GuideScanGeneAutocompleteSource
  note?: string
}

const ENSEMBL_GENE_AUTOCOMPLETE_TIMEOUT_MS = 8_000

export type GuideScanGeneSequenceOptions = GuideScanGeneLookupOptions & {
  includeAnnotations?: boolean
  /** Skip symbol re-resolution when the caller already resolved the gene. */
  resolved?: GuideScanGeneSuggestion
}

const NCBI_REGION_ORGANISMS = new Set(['hg38', 'hg38_no_alt', 'mm39'])
const REFSEQ_GENE_FLANK_BP = 25_000
const REFSEQ_GENE_END_PROBE_BP = 50

type NcbiELinkResponse = {
  linksets?: Array<{
    linksetdbs?: Array<{
      linkname?: string
      links?: string[]
    }>
  }>
}

function ncbiRegionFetchAllowed(organism: string): boolean {
  return NCBI_REGION_ORGANISMS.has(organism)
}

function guideScanAssemblyLabel(organism: string): string {
  if (organism === 'mm39') return 'GRCm39'
  if (organism === 'hg38' || organism === 'hg38_no_alt') return 'GRCh38'
  return ''
}

function ncbiAssemblyMatchesGuideScanOrganism(organism: string, assemblyaccver: string | undefined): boolean {
  if (!ncbiRegionFetchAllowed(organism)) return false
  if (!assemblyaccver?.trim()) return true
  const value = assemblyaccver.toLowerCase()
  if (organism === 'mm39') return value.includes('grcm39') || value.includes('mm39')
  return value.includes('grch38') || value.includes('hg38')
}

function requestAborted(signal: AbortSignal | undefined): boolean {
  return Boolean(signal?.aborted)
}

function progressMessage(options: GuideScanGeneLookupOptions | undefined, text: string) {
  options?.onProgress?.(text)
}

function errorProgressMessage(_options: GuideScanGeneLookupOptions | undefined, error: unknown): string {
  const message = databaseImportError(error)
  return message.trim() || 'Unknown error'
}

function sortGuideScanGeneSuggestions(
  suggestions: GuideScanGeneSuggestion[],
): GuideScanGeneSuggestion[] {
  const deduped = dedupeGuideScanGeneSuggestionsBySymbol(suggestions)
  deduped.sort((left, right) => {
    if (left.exactSymbolMatch !== right.exactSymbolMatch) return left.exactSymbolMatch ? -1 : 1
    return left.symbol.localeCompare(right.symbol)
  })
  return deduped
}

function ncbiGeneResultsToGuideScanSuggestions(
  organism: string,
  query: string,
  results: Awaited<ReturnType<typeof searchNcbiGenes>>['results'],
): GuideScanGeneSuggestion[] {
  return results.map((result) => ({
    symbol: result.symbol || result.geneId,
    ensemblId: '',
    description: result.description,
    species: result.organism || organism,
    biotype: 'gene',
    exactSymbolMatch: result.geneId === query || symbolsMatchExactly(result.symbol, query),
    entrezId: result.geneId,
  }))
}

async function autocompleteGuideScanGenesFromEnsembl(
  organism: string,
  query: string,
  options: GuideScanGeneLookupOptions | undefined,
): Promise<GuideScanGeneSuggestion[]> {
  const species = ensemblSpeciesForGuideScanOrganism(organism)
  if (!species) {
    throw new GuideScanError(
      'unsupported',
      `Gene autocomplete is not available for GuideScan organism "${organism}" via Ensembl.`,
    )
  }

  const page = await searchEnsembl({
    term: query,
    organism: species,
    molecule: 'nucleotide',
    page: 0,
    pageSize: Math.max(1, Math.min(50, options?.limit ?? 12)),
  }, options?.signal, {
    timeoutMs: ENSEMBL_GENE_AUTOCOMPLETE_TIMEOUT_MS,
    attempts: 1,
  })

  const suggestions: GuideScanGeneSuggestion[] = page.results
    .filter((result) => !isLocusReferenceGenomicId(result.accession))
    .map((result) => {
      const symbol = result.name || result.accession
      const exact = symbol.localeCompare(query, undefined, { sensitivity: 'accent' }) === 0
      return {
        symbol,
        ensemblId: result.accession,
        description: result.description,
        species: result.organism || species,
        assembly: result.assembly,
        biotype: result.objectType,
        exactSymbolMatch: exact,
      }
    })

  return sortGuideScanGeneSuggestions(suggestions)
}

async function autocompleteGuideScanGenesFromNcbi(
  organism: string,
  query: string,
  options: GuideScanGeneLookupOptions | undefined,
): Promise<GuideScanGeneSuggestion[]> {
  const taxonId = guidescanOrganismMeta(organism)?.taxonId
  const page = await searchNcbiGenes({
    term: query,
    organism: taxonId ?? undefined,
    molecule: 'all',
    page: 0,
    pageSize: Math.max(1, Math.min(50, options?.limit ?? 12)),
  }, options?.signal)
  return sortGuideScanGeneSuggestions(ncbiGeneResultsToGuideScanSuggestions(organism, query, page.results))
}

function isLocusReferenceGenomicId(id: string): boolean {
  return /^LRG_/i.test(id.trim())
}

function isEnsemblGeneStableId(id: string): boolean {
  const base = id.trim().split('.')[0] ?? ''
  return /^ENS[A-Z]{0,4}G\d+/i.test(base)
}

function guideScanGeneSuggestionRank(suggestion: GuideScanGeneSuggestion): number {
  let rank = 0
  if (suggestion.exactSymbolMatch) rank += 2
  if (isEnsemblGeneStableId(suggestion.ensemblId)) rank += 4
  return rank
}

function dedupeGuideScanGeneSuggestionsBySymbol(
  suggestions: GuideScanGeneSuggestion[],
): GuideScanGeneSuggestion[] {
  const order: string[] = []
  const bySymbol = new Map<string, GuideScanGeneSuggestion>()
  for (const suggestion of suggestions) {
    const key = suggestion.symbol.toLowerCase()
    const existing = bySymbol.get(key)
    if (!existing) {
      bySymbol.set(key, suggestion)
      order.push(key)
      continue
    }
    if (guideScanGeneSuggestionRank(suggestion) > guideScanGeneSuggestionRank(existing)) {
      bySymbol.set(key, suggestion)
    }
  }
  return order.map((key) => bySymbol.get(key)!)
}

/**
 * Gene-name autocomplete via Ensembl REST (GuideScan2 does not expose a public
 * gene-suggest endpoint). Prefers exact canonical `display_name` / xref matches.
 * Falls back to NCBI Gene when Ensembl is unavailable.
 */
export async function autocompleteGuideScanGenesDetailed(
  organism: string,
  term: string,
  options?: GuideScanGeneLookupOptions,
): Promise<GuideScanGeneAutocompleteResult> {
  const query = term.trim()
  if (!query) return { suggestions: [], source: 'ensembl' }

  if (isLikelyEntrezGeneId(query)) {
    const suggestions = await autocompleteGuideScanGenesFromNcbi(organism, query, { ...options, limit: 5 })
    return { suggestions, source: 'ncbi' }
  }

  try {
    const suggestions = await autocompleteGuideScanGenesFromEnsembl(organism, query, options)
    return { suggestions, source: 'ensembl' }
  } catch (ensemblError) {
    if (requestAborted(options?.signal)) throw ensemblError
    const ensemblReason = errorProgressMessage(options, ensemblError)
    options?.onSourceNote?.('Ensembl slow; trying NCBI…')
    try {
      const suggestions = await autocompleteGuideScanGenesFromNcbi(organism, query, options)
      const note = `Ensembl unavailable (${ensemblReason}); showing NCBI Gene results`
      options?.onSourceNote?.(note)
      return { suggestions, source: 'ncbi', note }
    } catch (ncbiError) {
      if (requestAborted(options?.signal)) throw ncbiError
      const ncbiReason = errorProgressMessage(options, ncbiError)
      throw new GuideScanError(
        'network',
        `Gene suggestions failed — Ensembl: ${ensemblReason.replace(/\.$/, '')}; NCBI: ${ncbiReason}`,
      )
    }
  }
}

export async function autocompleteGuideScanGenes(
  organism: string,
  term: string,
  options?: GuideScanGeneLookupOptions,
): Promise<GuideScanGeneSuggestion[]> {
  const { suggestions } = await autocompleteGuideScanGenesDetailed(organism, term, options)
  return suggestions
}

function symbolsMatchExactly(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
}

async function resolveExactNcbiGene(
  organism: string,
  symbol: string,
  options?: GuideScanGeneLookupOptions,
): Promise<{ entrezId: string; symbol: string } | undefined> {
  const query = symbol.trim()
  if (!query || isLikelyEntrezGeneId(query)) return undefined
  const taxonId = guidescanOrganismMeta(organism)?.taxonId
  if (!taxonId) return undefined

  try {
    const official = await searchNcbiGenes({
      term: query,
      organism: taxonId,
      molecule: 'all',
      page: 0,
      pageSize: 20,
      officialSymbolOnly: true,
    }, options?.signal)
    const exactOfficial = official.results.filter((result) => symbolsMatchExactly(result.symbol, query))
    const uniqueOfficial = [...new Set(exactOfficial.map((result) => result.geneId))]
    if (uniqueOfficial.length === 1) {
      const hit = exactOfficial.find((result) => result.geneId === uniqueOfficial[0])!
      return { entrezId: hit.geneId, symbol: hit.symbol }
    }

    const fallback = await searchNcbiGenes({
      term: query,
      organism: taxonId,
      molecule: 'all',
      page: 0,
      pageSize: 20,
    }, options?.signal)
    const exactFallback = fallback.results.filter((result) => symbolsMatchExactly(result.symbol, query))
    const uniqueFallback = [...new Set(exactFallback.map((result) => result.geneId))]
    if (uniqueFallback.length === 1) {
      const hit = exactFallback.find((result) => result.geneId === uniqueFallback[0])!
      return { entrezId: hit.geneId, symbol: hit.symbol }
    }
  } catch {
    return undefined
  }
  return undefined
}

/**
 * Map an exact canonical symbol to its NCBI Entrez Gene ID for the GuideScan organism.
 * Returns undefined when NCBI is unavailable, unconstrained, or the official symbol does not match.
 */
export async function resolveExactEntrezGeneId(
  organism: string,
  symbol: string,
  options?: GuideScanGeneLookupOptions,
): Promise<string | undefined> {
  const resolved = await resolveExactNcbiGene(organism, symbol, options)
  return resolved?.entrezId
}

/**
 * Resolve an exact canonical gene symbol for the organism, or throw.
 * Numeric Entrez Gene IDs are accepted as-is for GuideScan query-text.
 */
export async function resolveGuideScanGeneSymbol(
  organism: string,
  term: string,
  options?: GuideScanGeneLookupOptions,
): Promise<GuideScanGeneSuggestion> {
  const query = term.trim()
  if (!query) throw new GuideScanError('invalid_request', 'Enter a gene symbol.')

  if (isLikelyEntrezGeneId(query)) {
    const matches = await autocompleteGuideScanGenes(organism, query, { ...options, limit: 5 })
    const hit = matches[0]
    if (hit) return hit

    const taxonId = guidescanOrganismMeta(organism)?.taxonId
    try {
      const entry = await fetchNcbiGeneEntry(query, options?.signal)
      if (entry && taxonId && entry.taxonId === Number(taxonId)) {
        return {
          symbol: entry.symbol,
          ensemblId: '',
          description: entry.description || `Entrez Gene ${query}`,
          species: entry.organism || organism,
          exactSymbolMatch: true,
          entrezId: entry.geneId,
        }
      }
    } catch (error) {
      if (requestAborted(options?.signal)) throw error
    }

    return {
      symbol: query,
      ensemblId: '',
      description: `Entrez Gene ${query}`,
      species: organism,
      exactSymbolMatch: true,
      entrezId: query,
    }
  }

  let suggestions: GuideScanGeneSuggestion[]
  try {
    suggestions = await autocompleteGuideScanGenes(organism, query, { ...options, limit: 20 })
  } catch (error) {
    if (requestAborted(options?.signal)) throw error
    progressMessage(options, `Ensembl unavailable (${errorProgressMessage(options, error)}); trying NCBI`)
    const ncbiGene = await resolveExactNcbiGene(organism, query, options)
    if (!ncbiGene) throw error
    return {
      symbol: ncbiGene.symbol,
      ensemblId: '',
      description: `Entrez Gene ${ncbiGene.entrezId}`,
      species: organism,
      exactSymbolMatch: true,
      entrezId: ncbiGene.entrezId,
    }
  }

  const exact = suggestions.find((entry) => entry.exactSymbolMatch)
  if (exact) {
    const entrezId = exact.entrezId || await resolveExactEntrezGeneId(organism, exact.symbol, options)
    return entrezId ? { ...exact, entrezId } : exact
  }
  if (suggestions.length === 1) return { ...suggestions[0]!, exactSymbolMatch: false }
  if (suggestions.length === 0) {
    throw new GuideScanError('not_found', `No Ensembl gene matched "${query}" for ${organism}.`)
  }
  throw new GuideScanError(
    'invalid_request',
    `Ambiguous gene name "${query}". Choose an exact canonical symbol such as ${suggestions.slice(0, 3).map((entry) => entry.symbol).join(', ')}.`,
  )
}

async function entrezIdForSuggestion(
  organism: string,
  suggestion: GuideScanGeneSuggestion,
  options?: GuideScanGeneLookupOptions,
): Promise<string | undefined> {
  if (suggestion.entrezId) return suggestion.entrezId
  if (isLikelyEntrezGeneId(suggestion.symbol)) return suggestion.symbol.trim()
  return resolveExactEntrezGeneId(organism, suggestion.symbol, options)
}

function genomicStrandLabel(reverse: boolean): string {
  return reverse ? 'minus strand' : 'plus strand'
}

/**
 * Fetch the GuideScan-relevant genomic interval for an Entrez Gene via NCBI esummary + efetch.
 */
export async function fetchNcbiGeneRegionRecord(
  organism: string,
  entrezId: string,
  options?: { signal?: AbortSignal; includeAnnotations?: boolean },
): Promise<SequenceRecord> {
  if (!ncbiRegionFetchAllowed(organism)) {
    throw new GuideScanError(
      'unsupported',
      `NCBI gene-region import is not configured for GuideScan organism "${organism}".`,
    )
  }

  const summary = await fetchNcbiGeneGenomicSummary(entrezId, options?.signal)
  if (!summary) {
    throw new GuideScanError('not_found', `No NCBI genomic coordinates for Entrez Gene ${entrezId}.`)
  }
  if (!ncbiAssemblyMatchesGuideScanOrganism(organism, summary.assemblyaccver)) {
    throw new GuideScanError(
      'unsupported',
      `Entrez Gene ${entrezId} is not on the ${guideScanAssemblyLabel(organism)} assembly expected for ${organism}.`,
    )
  }

  const chraccver = summary.chraccver.trim()
  let chromosome: string
  if (/^NC_/i.test(chraccver)) {
    const mapped = chromosomeFromRefSeqAccession(chraccver)
    if (!mapped) {
      throw new GuideScanError(
        'unsupported',
        `Unrecognized RefSeq chromosome accession ${chraccver} for GuideScan anchoring.`,
      )
    }
    chromosome = mapped
  } else {
    chromosome = /^chr/i.test(chraccver) ? chraccver : `chr${chraccver}`
  }

  const reverse = summary.chrstart > summary.chrstop
  const seqStart = Math.min(summary.chrstart, summary.chrstop) + 1
  const seqStop = Math.max(summary.chrstart, summary.chrstop) + 1
  const anchorStart = seqStart
  const anchorEnd = seqStop
  const text = await fetchText(ncbiEutilsUrl('efetch.fcgi', {
    db: 'nuccore',
    id: summary.chraccver,
    seq_start: seqStart,
    seq_stop: seqStop,
    strand: reverse ? 2 : 1,
    rettype: 'gbwithparts',
    retmode: 'text',
  }), { signal: options?.signal, headers: { Accept: 'text/plain' } })
  if (!/^LOCUS\s+/m.test(text)) {
    throw new Error('NCBI did not return a GenBank sequence record for the gene region.')
  }

  const retrievedAt = nowIso()
  const assembly = guideScanAssemblyLabel(organism)
  const externalSource: ExternalSequenceSource = {
    provider: 'ncbi',
    database: 'gene',
    accession: summary.geneId,
    assembly,
    retrievedAt,
    sourceUrl: `https://www.ncbi.nlm.nih.gov/gene/${encodeURIComponent(summary.geneId)}`,
  }
  const regionLabel = `${summary.chraccver}:${anchorStart}-${anchorEnd} (${genomicStrandLabel(reverse)})`
  const organismLabel = summary.scientificName?.trim() || guidescanOrganismMeta(organism)?.label || organism
  const description = summary.description
    ? `${organismLabel} ${summary.description} (${summary.symbol}), genomic region ${regionLabel}`
    : `${organismLabel} ${summary.symbol}, genomic region ${regionLabel}`

  let record = normalizeSequenceRecord({
    ...parseSequenceFile(text, `${summary.chraccver}.gb`),
    name: summary.symbol,
    description,
    externalSource,
  })
  if (options?.includeAnnotations === false) {
    record = normalizeSequenceRecord({
      ...record,
      features: [],
      protein: record.protein ? { ...record.protein, bonds: [] } : undefined,
    })
  }
  record = addOperation(record, 'databaseImport', `Imported ${summary.symbol} gene region from NCBI (Entrez ${summary.geneId}).`)
  const anchor = {
    organism,
    chromosome,
    start: anchorStart,
    end: anchorEnd,
    strand: reverse ? 'reverse' as const : 'forward' as const,
  }
  return withGenomicAnchor(record, anchor)
}

function parseFastaSequence(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('>'))
    .join('')
    .replace(/\s/g, '')
    .toUpperCase()
}

async function fetchNcbiRefSeqGeneNuccoreUid(
  entrezId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const payload = await fetchJson<NcbiELinkResponse>(ncbiEutilsUrl('elink.fcgi', {
    dbfrom: 'gene',
    db: 'nuccore',
    id: entrezId,
    linkname: 'gene_nuccore_refseqgene',
    retmode: 'json',
  }), { signal })
  const links = payload.linksets?.[0]?.linksetdbs?.find(
    (entry) => entry.linkname === 'gene_nuccore_refseqgene',
  )?.links
    ?? payload.linksets?.[0]?.linksetdbs?.[0]?.links
  const uid = links?.[0]?.trim()
  return uid || null
}

function refSeqGeneWindowBounds(genomic1: number): { start: number; end: number } {
  return {
    start: Math.max(1, genomic1 - REFSEQ_GENE_FLANK_BP),
    end: genomic1 + REFSEQ_GENE_FLANK_BP,
  }
}

async function fetchNcbiChromosomeFastaWindow(
  chraccver: string,
  window: { start: number; end: number },
  fetchedStrand: 'forward' | 'reverse',
  signal?: AbortSignal,
): Promise<string> {
  const text = await fetchText(ncbiEutilsUrl('efetch.fcgi', {
    db: 'nuccore',
    id: chraccver,
    seq_start: window.start,
    seq_stop: window.end,
    strand: fetchedStrand === 'reverse' ? 2 : 1,
    rettype: 'fasta',
    retmode: 'text',
  }), { signal, headers: { Accept: 'text/plain' } })
  return parseFastaSequence(text)
}

export async function anchorRefSeqGeneOnReference(
  summary: NcbiGeneGenomicSummary,
  ngSequence: string,
  organism: string,
  signal?: AbortSignal,
): Promise<ReturnType<typeof genomicAnchorFromRefSeqGeneEnds>> {
  const chraccver = summary.chraccver.trim()
  let chromosome: string
  if (/^NC_/i.test(chraccver)) {
    const mapped = chromosomeFromRefSeqAccession(chraccver)
    if (!mapped) return null
    chromosome = mapped
  } else {
    chromosome = formatChromosomeForGuideScan(chraccver)
  }

  const reverse = summary.chrstart > summary.chrstop
  const fivePrimeGenomic = reverse
    ? summary.chrstart + 1
    : Math.min(summary.chrstart, summary.chrstop) + 1
  const threePrimeGenomic = reverse
    ? summary.chrstop + 1
    : Math.max(summary.chrstart, summary.chrstop) + 1
  const fetchedStrand: 'forward' | 'reverse' = reverse ? 'reverse' : 'forward'

  const sequence = ngSequence.toUpperCase()
  if (sequence.length < REFSEQ_GENE_END_PROBE_BP) return null
  const fivePrimeProbe = sequence.slice(0, REFSEQ_GENE_END_PROBE_BP)
  const threePrimeProbe = sequence.slice(-REFSEQ_GENE_END_PROBE_BP)

  const fiveWindow = refSeqGeneWindowBounds(fivePrimeGenomic)
  const threeWindow = refSeqGeneWindowBounds(threePrimeGenomic)

  const [fiveFasta, threeFasta] = await Promise.all([
    fetchNcbiChromosomeFastaWindow(chraccver, fiveWindow, fetchedStrand, signal),
    fetchNcbiChromosomeFastaWindow(chraccver, threeWindow, fetchedStrand, signal),
  ])

  const fiveIndex = uniqueDnaSubstringIndex(fiveFasta, fivePrimeProbe)
  const threeIndex = uniqueDnaSubstringIndex(threeFasta, threePrimeProbe)
  if (fiveIndex === null || threeIndex === null) return null

  const fivePrimePlaced = ncbiFastaWindowIndexToGenomic(
    fiveWindow.start,
    fiveWindow.end,
    fiveIndex,
    fetchedStrand,
  )
  const threePrimePlaced = ncbiFastaWindowIndexToGenomic(
    threeWindow.start,
    threeWindow.end,
    threeIndex + REFSEQ_GENE_END_PROBE_BP - 1,
    fetchedStrand,
  )

  return genomicAnchorFromRefSeqGeneEnds(
    organism,
    chromosome,
    sequence.length,
    fivePrimePlaced,
    threePrimePlaced,
  )
}

/**
 * Fetch the NCBI RefSeqGene (NG_) record for an Entrez Gene, with an exact genomic anchor.
 * Returns null when no RefSeqGene link exists or ends cannot be placed uniquely on the reference.
 */
export async function fetchNcbiRefSeqGeneRecord(
  organism: string,
  entrezId: string,
  options?: { signal?: AbortSignal; includeAnnotations?: boolean },
): Promise<SequenceRecord | null> {
  if (!ncbiRegionFetchAllowed(organism)) return null

  const nuccoreUid = await fetchNcbiRefSeqGeneNuccoreUid(entrezId, options?.signal)
  if (!nuccoreUid) return null

  const summary = await fetchNcbiGeneGenomicSummary(entrezId, options?.signal)
  if (!summary || !ncbiAssemblyMatchesGuideScanOrganism(organism, summary.assemblyaccver)) {
    return null
  }

  const text = await fetchText(ncbiEutilsUrl('efetch.fcgi', {
    db: 'nuccore',
    id: nuccoreUid,
    rettype: 'gbwithparts',
    retmode: 'text',
  }), { signal: options?.signal, headers: { Accept: 'text/plain' } })
  if (!/^LOCUS\s+/m.test(text)) return null

  const parsed = parseSequenceFile(text, `${nuccoreUid}.gb`)
  const anchor = await anchorRefSeqGeneOnReference(
    summary,
    parsed.sequence,
    organism,
    options?.signal,
  )
  if (!anchor) return null

  const retrievedAt = nowIso()
  const assembly = guideScanAssemblyLabel(organism)
  const accession = parsed.construct?.accessionNumber?.trim()
    || text.match(/^ACCESSION\s+(\S+)/m)?.[1]?.trim()
    || nuccoreUid
  const externalSource: ExternalSequenceSource = {
    provider: 'ncbi',
    database: 'nuccore',
    accession,
    assembly,
    retrievedAt,
    sourceUrl: `https://www.ncbi.nlm.nih.gov/nuccore/${encodeURIComponent(accession.split('.')[0] ?? accession)}`,
  }

  let record = normalizeSequenceRecord({
    ...parsed,
    name: summary.symbol,
    description: parsed.description?.trim() || text.match(/^DEFINITION\s+(.+)$/m)?.[1]?.trim() || '',
    externalSource,
  })
  if (options?.includeAnnotations === false) {
    record = normalizeSequenceRecord({
      ...record,
      features: [],
      protein: record.protein ? { ...record.protein, bonds: [] } : undefined,
    })
  }
  record = addOperation(
    record,
    'databaseImport',
    `Imported ${summary.symbol} RefSeqGene ${accession} from NCBI (Entrez ${summary.geneId}).`,
  )
  return withGenomicAnchor(record, anchor)
}

async function tryFetchNcbiRefSeqGene(
  organism: string,
  suggestion: GuideScanGeneSuggestion,
  options?: GuideScanGeneSequenceOptions,
): Promise<SequenceRecord | null> {
  if (!ncbiRegionFetchAllowed(organism)) return null
  const geneId = await entrezIdForSuggestion(organism, suggestion, options)
  if (!geneId) return null
  try {
    return await fetchNcbiRefSeqGeneRecord(organism, geneId, {
      signal: options?.signal,
      includeAnnotations: options?.includeAnnotations,
    })
  } catch (error) {
    if (requestAborted(options?.signal)) throw error
    return null
  }
}

async function fetchEnsemblGenomicRecord(
  organism: string,
  suggestion: GuideScanGeneSuggestion,
  options?: GuideScanGeneSequenceOptions,
): Promise<SequenceRecord> {
  if (!suggestion.ensemblId) {
    throw new GuideScanError('not_found', `No Ensembl id resolved for gene "${suggestion.symbol}".`)
  }

  const record: SequenceRecord = await fetchEnsemblRecord(
    {
      provider: 'ensembl',
      id: suggestion.ensemblId,
      accession: suggestion.ensemblId,
      name: suggestion.symbol,
      description: suggestion.description,
      organism: suggestion.species,
      molecule: 'dna',
      assembly: suggestion.assembly,
      objectType: 'Gene',
      availableSequenceTypes: ['genomic', 'cdna', 'cds', 'protein'],
    },
    { sequenceType: 'genomic', includeAnnotations: options?.includeAnnotations },
    options?.signal,
  )
  try {
    const lookup = await lookupEnsemblId(suggestion.ensemblId, options?.signal, false)
    const anchor = anchorFromEnsemblGene(lookup, organism, record.sequence.length)
    return anchor ? withGenomicAnchor(record, anchor) : record
  } catch {
    return record
  }
}

async function tryFetchNcbiGeneRegion(
  organism: string,
  suggestion: GuideScanGeneSuggestion,
  options?: GuideScanGeneSequenceOptions,
): Promise<SequenceRecord | null> {
  if (!ncbiRegionFetchAllowed(organism)) return null
  const geneId = await entrezIdForSuggestion(organism, suggestion, options)
  if (!geneId) return null
  try {
    return await fetchNcbiGeneRegionRecord(organism, geneId, {
      signal: options?.signal,
      includeAnnotations: options?.includeAnnotations,
    })
  } catch (error) {
    if (requestAborted(options?.signal)) throw error
    return null
  }
}

/**
 * Fetch genomic DNA for a gene as a Vibegene `SequenceRecord`.
 * GuideScan itself only returns guide hits, not the gene sequence — NCBI (Entrez IDs,
 * whitelisted assemblies) or Ensembl provide the openable record.
 */
export async function fetchGuideScanGeneSequence(
  organism: string,
  term: string,
  options?: GuideScanGeneSequenceOptions,
): Promise<GuideScanGeneSequenceResult> {
  const suggestion = options?.resolved ?? await resolveGuideScanGeneSymbol(organism, term, options)
  const entrezId = await entrezIdForSuggestion(organism, suggestion, options)
  const enriched = entrezId && !suggestion.entrezId ? { ...suggestion, entrezId } : suggestion
  const preferNcbi = Boolean(entrezId && ncbiRegionFetchAllowed(organism))

  if (preferNcbi) {
    progressMessage(options, 'Downloading gene record from NCBI…')
    const refSeqGene = await tryFetchNcbiRefSeqGene(organism, enriched, options)
    if (refSeqGene) {
      progressMessage(options, `Downloaded ${enriched.symbol} gene record (${refSeqGene.sequence.length} bp) from NCBI`)
      return { suggestion: enriched, record: refSeqGene }
    }
    const ncbiRecord = await tryFetchNcbiGeneRegion(organism, enriched, options)
    if (ncbiRecord) {
      progressMessage(options, `Downloaded ${enriched.symbol} gene record (${ncbiRecord.sequence.length} bp) from NCBI`)
      return { suggestion: enriched, record: ncbiRecord }
    }
    progressMessage(options, 'NCBI gene record unavailable; trying Ensembl…')
  }

  if (enriched.ensemblId) {
    try {
      progressMessage(options, 'Downloading gene record from Ensembl…')
      const record = await fetchEnsemblGenomicRecord(organism, enriched, options)
      progressMessage(options, `Downloaded ${enriched.symbol} gene record (${record.sequence.length} bp) from Ensembl`)
      return { suggestion: enriched, record }
    } catch (error) {
      if (requestAborted(options?.signal)) throw error
      if (!preferNcbi) {
        progressMessage(options, `Ensembl unavailable (${errorProgressMessage(options, error)}); trying NCBI`)
        const ncbiRecord = await tryFetchNcbiGeneRegion(organism, enriched, options)
        if (ncbiRecord) {
          progressMessage(options, `Downloaded ${enriched.symbol} gene record (${ncbiRecord.sequence.length} bp) from NCBI`)
          return { suggestion: enriched, record: ncbiRecord }
        }
      }
      throw error
    }
  }

  progressMessage(options, 'Downloading gene record from NCBI…')
  const ncbiRecord = await tryFetchNcbiGeneRegion(organism, enriched, options)
  if (ncbiRecord) {
    progressMessage(options, `Downloaded ${enriched.symbol} gene record (${ncbiRecord.sequence.length} bp) from NCBI`)
    return { suggestion: enriched, record: ncbiRecord }
  }

  throw new GuideScanError('not_found', `No genomic sequence could be loaded for gene "${enriched.symbol}".`)
}

/** Whether gene-mode fetch will try NCBI first for this resolved suggestion. */
export function guideScanGeneFetchUsesNcbiFirst(
  organism: string,
  suggestion: Pick<GuideScanGeneSuggestion, 'entrezId' | 'symbol'> | null | undefined,
): boolean {
  if (!suggestion || !ncbiRegionFetchAllowed(organism)) return false
  if (suggestion.entrezId) return true
  return isLikelyEntrezGeneId(suggestion.symbol)
}
