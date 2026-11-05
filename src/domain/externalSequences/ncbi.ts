import { normalizeSequenceRecord } from '../constructProperties'
import { parseSequenceFile } from '../parsers'
import { addOperation, nowIso } from '../sequence'
import type { ExternalSequenceSource, SequenceRecord } from '../types'
import { fetchJson, fetchText } from './http'
import type { SequenceProvider, SequenceSearchPage, SequenceSearchQuery, SequenceSearchResult } from './types'

const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const NCBI_TOOL = 'VibeGene'
const NCBI_EMAIL = 'support@vibe-gene.com'

type ESearchResponse = {
  esearchresult?: { count?: string; idlist?: string[] }
}

type ESummaryResponse = {
  result?: Record<string, unknown> & { uids?: string[] }
}

type NCBISummary = {
  uid?: string
  accessionversion?: string
  caption?: string
  title?: string
  taxname?: string
  organism?: string
  slen?: number
  biomol?: string
}

type NCBIGeneGenomicInfoRow = {
  chraccver?: string
  chrstart?: string | number
  chrstop?: string | number
  assemblyaccver?: string
}

type NCBIGeneSummary = {
  uid?: string
  name?: string
  description?: string
  chromosome?: string
  maplocation?: string
  otheraliases?: string
  genomicinfo?: NCBIGeneGenomicInfoRow[]
  organism?: {
    scientificname?: string
    commonname?: string
    taxid?: number
  }
}

export type NcbiGeneGenomicSummary = {
  geneId: string
  symbol: string
  description: string
  scientificName?: string
  chraccver: string
  chrstart: number
  chrstop: number
  assemblyaccver?: string
}

export async function fetchNcbiGeneEntry(
  geneId: string,
  signal?: AbortSignal,
): Promise<NcbiGeneSearchResult | null> {
  const id = geneId.trim()
  if (!id || !/^\d+$/.test(id)) return null
  const summaries = await fetchJson<ESummaryResponse>(url('esummary.fcgi', {
    db: 'gene',
    id,
    retmode: 'json',
    version: '2.0',
  }), { signal })
  const uid = summaries.result?.uids?.[0] ?? id
  const row = summaries.result?.[uid] as NCBIGeneSummary | undefined
  if (!row) return null
  return {
    geneId: row.uid || id,
    symbol: row.name?.trim() || id,
    description: row.description?.trim() || '',
    organism: row.organism?.scientificname,
    taxonId: row.organism?.taxid,
    chromosome: row.chromosome,
    mapLocation: row.maplocation,
    aliases: row.otheraliases,
  }
}

export async function fetchNcbiGeneGenomicSummary(
  geneId: string,
  signal?: AbortSignal,
): Promise<NcbiGeneGenomicSummary | null> {
  const id = geneId.trim()
  if (!id) return null
  const summaries = await fetchJson<ESummaryResponse>(url('esummary.fcgi', {
    db: 'gene',
    id,
    retmode: 'json',
    version: '2.0',
  }), { signal })
  const uid = summaries.result?.uids?.[0] ?? id
  const row = summaries.result?.[uid] as NCBIGeneSummary | undefined
  if (!row) return null
  const genomic = row.genomicinfo?.[0]
  const chraccver = genomic?.chraccver?.trim()
  const chrstart = Number(genomic?.chrstart)
  const chrstop = Number(genomic?.chrstop)
  if (!chraccver || !Number.isFinite(chrstart) || !Number.isFinite(chrstop)) return null
  return {
    geneId: row.uid || id,
    symbol: row.name?.trim() || id,
    description: row.description?.trim() || '',
    scientificName: row.organism?.scientificname,
    chraccver,
    chrstart,
    chrstop,
    assemblyaccver: genomic?.assemblyaccver?.trim() || undefined,
  }
}

type ELinkResponse = {
  linksets?: Array<{
    linksetdbs?: Array<{
      dbto?: string
      linkname?: string
      links?: string[]
    }>
  }>
}

export type NcbiGeneSearchResult = {
  geneId: string
  symbol: string
  description: string
  organism?: string
  taxonId?: number
  chromosome?: string
  mapLocation?: string
  aliases?: string
}

export type NcbiGeneSearchPage = {
  results: NcbiGeneSearchResult[]
  total: number
  page: number
  pageSize: number
}

function normalizedGeneTerm(value: string) {
  return value.trim().toLocaleLowerCase()
}

function geneAliases(gene: Pick<NcbiGeneSearchResult, 'aliases'>) {
  return (gene.aliases ?? '')
    .split(/[,;|]/)
    .map((alias) => normalizedGeneTerm(alias))
    .filter(Boolean)
}

function geneMatchKind(
  gene: NcbiGeneSearchResult,
  queryTerm: string,
): 'symbol' | 'alias' | 'related' {
  const normalizedQuery = normalizedGeneTerm(queryTerm)
  if (normalizedGeneTerm(gene.symbol) === normalizedQuery) return 'symbol'
  if (geneAliases(gene).includes(normalizedQuery)) return 'alias'
  return 'related'
}

function geneMatchRank(gene: NcbiGeneSearchResult, queryTerm: string) {
  const kind = geneMatchKind(gene, queryTerm)
  return kind === 'symbol' ? 0 : kind === 'alias' ? 1 : 2
}

function commonParams() {
  return { tool: NCBI_TOOL, email: NCBI_EMAIL }
}

export function ncbiEutilsUrl(path: string, params: Record<string, string | number>) {
  const query = new URLSearchParams()
  Object.entries({ ...commonParams(), ...params }).forEach(([key, value]) => query.set(key, String(value)))
  return `${NCBI_BASE}/${path}?${query}`
}

function url(path: string, params: Record<string, string | number>) {
  return ncbiEutilsUrl(path, params)
}

function searchDatabase(query: SequenceSearchQuery): Array<'nuccore' | 'protein'> {
  if (query.molecule === 'nucleotide') return ['nuccore']
  if (query.molecule === 'protein') return ['protein']
  return ['nuccore', 'protein']
}

function organismTerm(organism: string | undefined) {
  const value = organism?.trim()
  if (!value) return ''
  return /^\d+$/.test(value)
    ? `txid${value}[Organism:exp]`
    : `"${value.replace(/"/g, '')}"[Organism]`
}

function ncbiDatabaseLabel(database: 'nuccore' | 'protein') {
  return database === 'protein' ? 'NCBI Protein' : 'NCBI Nucleotide'
}

async function searchOne(
  database: 'nuccore' | 'protein',
  query: SequenceSearchQuery,
  signal?: AbortSignal,
): Promise<{ results: SequenceSearchResult[]; total: number }> {
  const pageSize = Math.max(1, Math.min(50, query.pageSize ?? 20))
  const page = Math.max(0, query.page ?? 0)
  const taxonTerm = organismTerm(query.organism)
  const term = taxonTerm ? `(${query.term}) AND ${taxonTerm}` : query.term
  const dbLabel = ncbiDatabaseLabel(database)
  query.onProgress?.(`Querying ${dbLabel} (esearch) for "${query.term.trim()}"…`)
  const search = await fetchJson<ESearchResponse>(url('esearch.fcgi', {
    db: database,
    term,
    retmode: 'json',
    retstart: page * pageSize,
    retmax: pageSize,
    idtype: 'acc',
  }), { signal })
  const ids = search.esearchresult?.idlist ?? []
  const total = Number(search.esearchresult?.count ?? 0) || 0
  if (!ids.length) return { results: [], total }
  query.onProgress?.(`${dbLabel}: ${total.toLocaleString()} matches; fetching summaries for ${ids.length}…`)
  const summaries = await fetchJson<ESummaryResponse>(url('esummary.fcgi', {
    db: database,
    id: ids.join(','),
    retmode: 'json',
    version: '2.0',
  }), { signal })
  const rows = (summaries.result?.uids ?? ids).flatMap((id) => {
    const row = summaries.result?.[id] as NCBISummary | undefined
    if (!row) return []
    const accession = row.accessionversion || row.caption || id
    return [{
      provider: 'ncbi' as const,
      id: accession,
      accession,
      name: row.caption || accession,
      description: row.title || '',
      organism: row.organism || row.taxname,
      molecule: database === 'protein' ? 'protein' as const : 'dna' as const,
      length: Number(row.slen) || undefined,
      database,
      version: accession.includes('.') ? accession.split('.').at(-1) : undefined,
    }]
  })
  return { results: rows, total: total || rows.length }
}

export type NcbiGeneSearchQuery = SequenceSearchQuery & {
  /**
   * Restrict symbol searches to NCBI's official Gene Name field.
   * Avoids alias hits (e.g. C1D aliased as LRP1) when resolving an exact symbol.
   */
  officialSymbolOnly?: boolean
}

export async function searchNcbiGenes(
  query: NcbiGeneSearchQuery,
  signal?: AbortSignal,
): Promise<NcbiGeneSearchPage> {
  const pageSize = Math.max(1, Math.min(50, query.pageSize ?? 20))
  const page = Math.max(0, query.page ?? 0)
  const rawTerm = query.term.trim()
  const quotedSymbol = `"${rawTerm.replace(/"/g, '')}"`
  // NCBI translates `[Gene ID]` to `[Gene]`, which does not match Entrez numeric IDs; `[uid]` works.
  const geneTerm = /^\d+$/.test(rawTerm)
    ? `${rawTerm}[uid]`
    : query.officialSymbolOnly
      ? `${quotedSymbol}[Gene Name]`
      : `(${rawTerm}[Gene Name] OR ${rawTerm}[All Fields])`
  const taxonTerm = organismTerm(query.organism)
  const term = taxonTerm ? `(${geneTerm}) AND ${taxonTerm}` : geneTerm
  query.onProgress?.(`Querying NCBI Gene for "${rawTerm}"…`)
  const search = await fetchJson<ESearchResponse>(url('esearch.fcgi', {
    db: 'gene',
    term,
    retmode: 'json',
    retstart: page * pageSize,
    retmax: pageSize,
    sort: 'relevance',
  }), { signal })
  const ids = search.esearchresult?.idlist ?? []
  const total = Number(search.esearchresult?.count ?? 0) || 0
  if (!ids.length) return { results: [], total, page, pageSize }
  query.onProgress?.(`NCBI Gene: ${total.toLocaleString()} matches; fetching gene summaries for ${ids.length}…`)
  const summaries = await fetchJson<ESummaryResponse>(url('esummary.fcgi', {
    db: 'gene',
    id: ids.join(','),
    retmode: 'json',
    version: '2.0',
  }), { signal })
  const results = (summaries.result?.uids ?? ids).flatMap((id) => {
    const row = summaries.result?.[id] as NCBIGeneSummary | undefined
    if (!row) return []
    return [{
      geneId: row.uid || id,
      symbol: row.name || `Gene ${id}`,
      description: row.description || '',
      organism: row.organism?.scientificname,
      taxonId: row.organism?.taxid,
      chromosome: row.chromosome,
      mapLocation: row.maplocation,
      aliases: row.otheraliases,
    } satisfies NcbiGeneSearchResult]
  })
  results.sort((left, right) => geneMatchRank(left, rawTerm) - geneMatchRank(right, rawTerm))
  return { results, total: total || results.length, page, pageSize }
}

function linkedIds(response: ELinkResponse, database: 'nuccore' | 'protein') {
  const groups = response.linksets?.flatMap((set) => set.linksetdbs ?? []) ?? []
  const preferred = groups.filter((group) => database === 'protein'
    ? group.linkname === 'gene_protein_refseq'
    : group.linkname === 'gene_nuccore_refseqrna' || group.linkname === 'gene_nuccore_refseqgene')
  const selected = preferred.length ? preferred : groups.filter((group) => group.dbto === database)
  return [...new Set(selected.flatMap((group) => group.links ?? []))]
}

function ncbiSequenceKind(accession: string, database: 'nuccore' | 'protein') {
  if (/^NM_/i.test(accession)) return { label: 'Curated transcript', rank: 0 }
  if (/^NP_/i.test(accession)) return { label: 'Curated protein', rank: 1 }
  if (/^NR_/i.test(accession)) return { label: 'Curated non-coding RNA', rank: 2 }
  if (/^XM_/i.test(accession)) return { label: 'Predicted transcript', rank: 3 }
  if (/^XP_/i.test(accession)) return { label: 'Predicted protein', rank: 4 }
  if (/^XR_/i.test(accession)) return { label: 'Predicted non-coding RNA', rank: 5 }
  if (/^NG_/i.test(accession)) return { label: 'RefSeqGene genomic', rank: 6 }
  if (/^NC_/i.test(accession)) return { label: 'Reference genomic', rank: 7 }
  return { label: database === 'protein' ? 'Protein' : 'Nucleotide', rank: 8 }
}

async function linkedSequenceResults(
  geneId: string,
  database: 'nuccore' | 'protein',
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
) {
  const dbLabel = ncbiDatabaseLabel(database)
  onProgress?.(`Fetching RefSeq links for GeneID ${geneId} (${dbLabel})…`)
  const links = await fetchJson<ELinkResponse>(url('elink.fcgi', {
    dbfrom: 'gene',
    db: database,
    id: geneId,
    retmode: 'json',
    idtype: 'acc',
  }), { signal })
  const ids = linkedIds(links, database)
    .sort((left, right) => ncbiSequenceKind(left, database).rank - ncbiSequenceKind(right, database).rank || left.localeCompare(right))
    .slice(0, 100)
  if (!ids.length) return []
  onProgress?.(`Downloading summaries for ${ids.length} linked ${database === 'protein' ? 'protein' : 'nucleotide'} record${ids.length === 1 ? '' : 's'}…`)
  const summaries = await fetchJson<ESummaryResponse>(url('esummary.fcgi', {
    db: database,
    id: ids.join(','),
    retmode: 'json',
    version: '2.0',
  }), { signal })
  return (summaries.result?.uids ?? ids).flatMap((id) => {
    const row = summaries.result?.[id] as NCBISummary | undefined
    if (!row) return []
    const accession = row.accessionversion || row.caption || id
    const kind = ncbiSequenceKind(accession, database)
    return [{
      provider: 'ncbi' as const,
      id: accession,
      accession,
      name: row.caption || accession,
      description: row.title || '',
      organism: row.organism || row.taxname,
      molecule: database === 'protein' ? 'protein' as const : 'dna' as const,
      length: Number(row.slen) || undefined,
      database,
      version: accession.includes('.') ? accession.split('.').at(-1) : undefined,
      objectType: kind.label,
      relevanceRank: kind.rank,
    }]
  })
}

export async function fetchNcbiGeneSequences(
  geneId: string,
  molecule: SequenceSearchQuery['molecule'] = 'all',
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<SequenceSearchResult[]> {
  const databases = molecule === 'nucleotide'
    ? ['nuccore'] as const
    : molecule === 'protein'
      ? ['protein'] as const
      : ['nuccore', 'protein'] as const
  const genomicPromise = molecule === 'protein'
    ? Promise.resolve(null)
    : (() => {
        onProgress?.('Fetching genomic locus summary from NCBI Gene…')
        return fetchNcbiGeneGenomicSummary(geneId, signal)
      })()
  const [linkedRows, genomicSummary] = await Promise.all([
    Promise.all(databases.map((database) => linkedSequenceResults(geneId, database, signal, onProgress))),
    genomicPromise,
  ])
  const rows: SequenceSearchResult[] = linkedRows.flat()
  if (genomicSummary) {
    const start = Math.min(genomicSummary.chrstart, genomicSummary.chrstop)
    const end = Math.max(genomicSummary.chrstart, genomicSummary.chrstop) + 1
    const strand = genomicSummary.chrstart > genomicSummary.chrstop ? 'reverse' as const : 'forward' as const
    const locus = `${genomicSummary.chraccver}:${start + 1}-${end} (${strand} strand)`
    rows.push({
      provider: 'ncbi',
      id: `${genomicSummary.chraccver}:${start + 1}-${end}:${strand}`,
      accession: genomicSummary.chraccver,
      name: genomicSummary.symbol,
      description: genomicSummary.description
        ? `${genomicSummary.description} — genomic gene locus ${locus}`
        : `${genomicSummary.symbol} genomic gene locus ${locus}`,
      organism: genomicSummary.scientificName,
      molecule: 'dna',
      length: end - start,
      database: 'nuccore',
      version: genomicSummary.chraccver.includes('.') ? genomicSummary.chraccver.split('.').at(-1) : undefined,
      assembly: genomicSummary.assemblyaccver,
      objectType: 'Genomic gene locus',
      relevanceRank: -1,
      sourceGeneId: genomicSummary.geneId,
      sourceGeneSymbol: genomicSummary.symbol,
      sourceGeneMatch: 'symbol',
      sequenceRange: { start, end, strand },
    })
  }
  return rows
    .sort((left, right) => (left.relevanceRank ?? 99) - (right.relevanceRank ?? 99) || left.accession.localeCompare(right.accession))
}

async function geneExpandedSequenceResults(
  query: SequenceSearchQuery,
  directResults: readonly SequenceSearchResult[],
  signal?: AbortSignal,
) {
  if ((query.page ?? 0) > 0 || !query.term.trim()) return []
  let genes: NcbiGeneSearchResult[]
  try {
    query.onProgress?.(`Looking up NCBI Gene names and aliases for "${query.term.trim()}"…`)
    const page = await searchNcbiGenes({
      ...query,
      page: 0,
      pageSize: 10,
    }, signal)
    const exact = page.results.filter((gene) => geneMatchKind(gene, query.term) !== 'related')
    // NCBI Gene relevance is the useful fallback when an historical name is
    // indexed but is not repeated in the compact ESummary alias field.
    genes = (exact.length ? exact : directResults.length ? [] : page.results).slice(0, 3)
  } catch (error) {
    if (signal?.aborted) throw error
    return []
  }

  const expanded: SequenceSearchResult[] = []
  for (const gene of genes) {
    const match = geneMatchKind(gene, query.term)
    try {
      query.onProgress?.(`Fetching linked sequences for ${gene.symbol} (GeneID ${gene.geneId})…`)
      const linked = await fetchNcbiGeneSequences(gene.geneId, query.molecule, signal)
      expanded.push(...linked.map((result) => ({
        ...result,
        sourceGeneId: gene.geneId,
        sourceGeneSymbol: gene.symbol,
        sourceGeneMatch: match,
        sourceGeneQuery: query.term.trim(),
      })))
    } catch (error) {
      if (signal?.aborted) throw error
    }
  }
  return expanded
}

function mergeNcbiSequenceResults(
  expanded: readonly SequenceSearchResult[],
  direct: readonly SequenceSearchResult[],
  pageSize: number,
) {
  const merged = new Map<string, SequenceSearchResult>()
  for (const result of expanded) merged.set(`${result.database}:${result.accession}`, result)
  for (const result of direct) {
    const key = `${result.database}:${result.accession}`
    const resolved = merged.get(key)
    merged.set(key, resolved ? { ...result, ...resolved } : result)
  }
  return [...merged.values()].slice(0, pageSize)
}

export async function searchNcbi(query: SequenceSearchQuery, signal?: AbortSignal): Promise<SequenceSearchPage> {
  const pageSize = Math.max(1, Math.min(50, query.pageSize ?? 20))
  const page = Math.max(0, query.page ?? 0)
  const databases = searchDatabase(query)
  if (databases.length > 1) {
    query.onProgress?.('Searching NCBI Nucleotide and Protein…')
  }
  const searches = await Promise.all(databases.map((database) => searchOne(database, query, signal)))
  const directResults = searches.flatMap((result) => result.results)
  const expandedResults = await geneExpandedSequenceResults(query, directResults, signal)
  const results = mergeNcbiSequenceResults(expandedResults, directResults, pageSize)
  const appendedCount = results.filter((result) =>
    result.sourceGeneId && !directResults.some((direct) => direct.database === result.database && direct.accession === result.accession)).length
  return {
    results,
    total: Math.max(results.length, searches.reduce((sum, result) => sum + result.total, 0) + appendedCount),
    page,
    pageSize,
  }
}

function ncbiSource(result: SequenceSearchResult, retrievedAt: string): ExternalSequenceSource {
  const database = result.database === 'protein' ? 'protein' : 'nuccore'
  return {
    provider: 'ncbi',
    accession: result.accession,
    version: result.version,
    retrievedAt,
    database,
    sourceUrl: `https://www.ncbi.nlm.nih.gov/${database}/${encodeURIComponent(result.accession)}`,
  }
}

function ncbiGeneLocusSource(result: SequenceSearchResult, retrievedAt: string): ExternalSequenceSource {
  return {
    provider: 'ncbi',
    accession: result.sourceGeneId!,
    retrievedAt,
    database: 'gene',
    assembly: result.assembly,
    sourceUrl: `https://www.ncbi.nlm.nih.gov/gene/${encodeURIComponent(result.sourceGeneId!)}`,
  }
}

export async function fetchNcbiRecord(
  result: SequenceSearchResult,
  options?: { includeAnnotations?: boolean; onProgress?: (message: string) => void },
  signal?: AbortSignal,
): Promise<SequenceRecord> {
  const database = result.database === 'protein' || result.molecule === 'protein' ? 'protein' : 'nuccore'
  const rettype = database === 'protein' ? 'gp' : 'gbwithparts'
  const fetchParams: Record<string, string | number> = {
    db: database,
    id: result.accession,
    rettype,
    retmode: 'text',
  }
  if (database === 'nuccore' && result.sequenceRange) {
    fetchParams.seq_start = result.sequenceRange.start + 1
    fetchParams.seq_stop = result.sequenceRange.end
    fetchParams.strand = result.sequenceRange.strand === 'reverse' ? 2 : 1
  }
  const formatLabel = database === 'protein' ? 'GenPept' : 'GenBank'
  options?.onProgress?.(`Downloading ${formatLabel} record ${result.accession} from NCBI…`)
  const text = await fetchText(url('efetch.fcgi', fetchParams), { signal, headers: { Accept: 'text/plain' } })
  if (!/^LOCUS\s+/m.test(text)) throw new Error('NCBI did not return a GenBank/GenPept sequence record.')
  const retrievedAt = nowIso()
  const geneLocus = Boolean(result.sequenceRange && result.sourceGeneId)
  let record = normalizeSequenceRecord({
    ...parseSequenceFile(text, database === 'protein' ? `${result.accession}.gp` : `${result.accession}.gb`),
    ...(geneLocus ? {
      name: result.sourceGeneSymbol || result.name,
      description: result.description,
    } : {}),
    externalSource: geneLocus ? ncbiGeneLocusSource(result, retrievedAt) : ncbiSource(result, retrievedAt),
  })
  const lengthUnit = record.molecule === 'protein' ? 'aa' : 'bp'
  options?.onProgress?.(`Parsed ${formatLabel} record (${record.sequence.length.toLocaleString()} ${lengthUnit})`)
  if (options?.includeAnnotations === false) {
    record = normalizeSequenceRecord({
      ...record,
      features: [],
      protein: record.protein ? { ...record.protein, bonds: [] } : undefined,
    })
  }
  if (record.molecule === 'protein') {
    record = normalizeSequenceRecord({
      ...record,
      protein: {
        ...record.protein!,
        sourceDatabase: 'NCBI Protein',
        sourceAccession: result.accession,
        retrievedAt,
      },
    })
  }
  return addOperation(record, 'databaseImport', geneLocus
    ? `Imported ${result.sourceGeneSymbol || result.sourceGeneId} genomic gene locus from NCBI Gene.`
    : `Imported ${result.accession} from NCBI.`)
}

export const ncbiProvider: SequenceProvider = {
  id: 'ncbi',
  label: 'NCBI',
  search: searchNcbi,
  fetch: fetchNcbiRecord,
}
