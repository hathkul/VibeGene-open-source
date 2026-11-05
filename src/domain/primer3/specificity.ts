import { normalizeDna } from '../sequence'
import { numericTag, retrieveNcbiBlastXml2, submitNcbiBlast, waitForNcbiBlast, xmlTag } from '../ncbiBlast'

export type SpecificityDatabase = 'refseq_rna' | 'refseq_representative_genomes' | 'core_nt'

export const SPECIFICITY_DATABASES: readonly { id: SpecificityDatabase; label: string }[] = [
  { id: 'refseq_rna', label: 'RefSeq mRNA' },
  { id: 'refseq_representative_genomes', label: 'RefSeq representative genomes' },
  { id: 'core_nt', label: 'Core nucleotide (core_nt)' },
]

export const SPECIFICITY_ORGANISMS: readonly { taxId: string; label: string }[] = [
  { taxId: '9606', label: 'Homo sapiens' },
  { taxId: '10090', label: 'Mus musculus' },
  { taxId: '10116', label: 'Rattus norvegicus' },
  { taxId: '7955', label: 'Danio rerio' },
  { taxId: '7227', label: 'Drosophila melanogaster' },
  { taxId: '6239', label: 'Caenorhabditis elegans' },
  { taxId: '4932', label: 'Saccharomyces cerevisiae' },
  { taxId: '3702', label: 'Arabidopsis thaliana' },
  { taxId: '562', label: 'Escherichia coli' },
  { taxId: '2759', label: 'Eukaryota' },
  { taxId: '2', label: 'Bacteria' },
]

/** Empty organism means no organism restriction. */
export type SpecificitySearchSet = { database: SpecificityDatabase; organism: string }

const BROAD_ORGANISMS = new Set(['', '2759', '2'])

/** Unrestricted or kingdom-level searches cover most of a collection and run very slowly at NCBI. */
export function isBroadSpecificitySearch(searchSet: SpecificitySearchSet) {
  return BROAD_ORGANISMS.has(searchSet.organism.trim())
}

/** Broad searches and whole-genome collections are the ones NCBI can take many minutes to finish. */
export function recommendFastSpecificitySearch(searchSet: SpecificitySearchSet) {
  return isBroadSpecificitySearch(searchSet) || searchSet.database === 'refseq_representative_genomes'
}

/** BLAST seed length: 7 finds sites with several mismatches; 11 is far faster on large searches. */
export const SPECIFICITY_WORD_SIZE = { full: 7, fast: 11 } as const

export const SPECIFICITY_MAX_WAIT_MS = 10 * 60_000

export type SpecificityThresholds = {
  /** Sites with at least this many mismatches to the primer are ignored. */
  ignoreMismatches: number
  /** Sites with at least this many mismatches in the 3′ window are treated as non-priming. */
  threePrimeMismatches: number
  threePrimeWindow: number
  maxProductSize: number
}

export const DEFAULT_SPECIFICITY_THRESHOLDS: SpecificityThresholds = {
  ignoreMismatches: 6,
  threePrimeMismatches: 2,
  threePrimeWindow: 5,
  maxProductSize: 4000,
}

export type SpecificityPairInput = { key: string; left: string; right: string; productSize?: number }

export type PrimerRole = 'left' | 'right'

export type PrimerBindingSite = {
  accession: string
  title: string
  subjectLength: number
  /** Primer footprint on the subject, 1-based inclusive. */
  low: number
  high: number
  /** 'plus' primes toward higher subject coordinates. */
  strand: 'plus' | 'minus'
  mismatches: number
  threePrimeMismatches: number
}

/**
 * exact: perfect primer matches at the Primer3 product size.
 * similar: left+right amplicon within the size tolerance, e.g. the same locus in a related
 * sequence with tolerated primer mismatches or small indels.
 * offtarget: any other size or primer orientation (including left+left and right+right).
 */
export type SpecificityProductKind = 'exact' | 'similar' | 'offtarget'

export function similarSizeTolerance(expectedSize: number) {
  return Math.max(5, Math.round(expectedSize * 0.02))
}

export type SpecificityProduct = {
  accession: string
  title: string
  subjectLength: number
  /** 1-based inclusive product coordinates on the subject. */
  start: number
  end: number
  size: number
  forward: { role: PrimerRole; site: PrimerBindingSite }
  reverse: { role: PrimerRole; site: PrimerBindingSite }
  kind: SpecificityProductKind
}

export type PairSpecificity = {
  key: string
  searchSet: SpecificitySearchSet
  products: SpecificityProduct[]
  truncated: boolean
  leftSites: number
  rightSites: number
  verdict: 'specific' | 'offtarget' | 'none'
  /** Searched with the faster, less sensitive seed length. */
  fastSearch: boolean
}

/** BLAST binding-site evidence for one oligo; this does not predict PCR products. */
export type SinglePrimerSpecificity = {
  searchSet: SpecificitySearchSet
  sequenceLength: number
  sites: PrimerBindingSite[]
  truncated: boolean
  fastSearch: boolean
}

/** A completed search and the exact primer and query it describes. */
export type SavedPrimerSpecificity = {
  primerSequence: string
  searchedSequence: string
  completedAt: string
  result: SinglePrimerSpecificity
}

type ParsedHsp = {
  queryFrom: number
  queryTo: number
  hitFrom: number
  hitTo: number
  qseq: string
  hseq: string
}

export type ParsedPrimerHit = {
  accession: string
  title: string
  subjectLength: number
  hsps: ParsedHsp[]
}

const MAX_PRODUCTS_PER_PAIR = 200

export function specificityEntrezQuery(organism: string) {
  const value = organism.trim()
  if (!value) return ''
  if (/^\d+$/.test(value)) return `txid${value}[Organism:exp]`
  return `"${value.replace(/"/g, '')}"[Organism]`
}

export function specificitySearchSetLabel(searchSet: SpecificitySearchSet) {
  const database = SPECIFICITY_DATABASES.find((entry) => entry.id === searchSet.database)?.label ?? searchSet.database
  const organism = searchSet.organism.trim()
  if (!organism) return database
  const known = SPECIFICITY_ORGANISMS.find((entry) => entry.taxId === organism)
  return `${database} · ${known?.label ?? (/^\d+$/.test(organism) ? `taxid ${organism}` : organism)}`
}

function accessionFromHit(block: string) {
  const id = xmlTag(block, 'id')
  const versioned = id.split('|').find((part) => /^[A-Z]{1,6}_?\d+\.\d+$/i.test(part))
  return versioned || xmlTag(block, 'accession') || id
}

/** Parse NCBI BLAST XML2 (single-file) into per-query hit lists, in query order. */
export function parsePrimerBlastXml2(xml: string, queryIds: readonly string[]): Map<string, ParsedPrimerHit[]> {
  const byQuery = new Map<string, ParsedPrimerHit[]>(queryIds.map((id) => [id, []]))
  const searches = [...xml.matchAll(/<(?:\w+:)?Search>([\s\S]*?)<\/(?:\w+:)?Search>/g)].map((match) => match[1]!)
  searches.forEach((search, index) => {
    const title = `${xmlTag(search, 'query-title')} ${xmlTag(search, 'query-id')}`
    const queryId = queryIds.find((id) => new RegExp(`\\b${id}\\b`).test(title)) ?? queryIds[index]
    if (!queryId) return
    const hits = [...search.matchAll(/<(?:\w+:)?Hit>([\s\S]*?)<\/(?:\w+:)?Hit>/g)].flatMap((hitMatch) => {
      const block = hitMatch[1]!
      const description = block.match(/<(?:\w+:)?HitDescr>([\s\S]*?)<\/(?:\w+:)?HitDescr>/)?.[1] ?? block
      const accession = accessionFromHit(description)
      if (!accession) return []
      const hsps = [...block.matchAll(/<(?:\w+:)?Hsp>([\s\S]*?)<\/(?:\w+:)?Hsp>/g)].map((hspMatch) => {
        const hsp = hspMatch[1]!
        return {
          queryFrom: numericTag(hsp, 'query-from'),
          queryTo: numericTag(hsp, 'query-to'),
          hitFrom: numericTag(hsp, 'hit-from'),
          hitTo: numericTag(hsp, 'hit-to'),
          qseq: xmlTag(hsp, 'qseq').toUpperCase(),
          hseq: xmlTag(hsp, 'hseq').toUpperCase(),
        }
      })
      const lengthMatch = block.match(/<\/(?:\w+:)?description>\s*<(?:\w+:)?len>(\d+)</)
      return [{
        accession,
        title: xmlTag(description, 'title') || accession,
        subjectLength: Number(lengthMatch?.[1] ?? 0),
        hsps,
      }]
    })
    byQuery.set(queryId, [...(byQuery.get(queryId) ?? []), ...hits])
  })
  return byQuery
}

/**
 * Extend an HSP to the full primer footprint and count mismatches: unaligned primer
 * ends, substitutions and gaps each count once; gaps in the primer count against the
 * preceding primer base.
 */
export function primerSiteFromHsp(
  hit: Pick<ParsedPrimerHit, 'accession' | 'title' | 'subjectLength'>,
  hsp: ParsedHsp,
  primerLength: number,
  threePrimeWindow = DEFAULT_SPECIFICITY_THRESHOLDS.threePrimeWindow,
): PrimerBindingSite | null {
  if (!hsp.queryFrom || !hsp.queryTo || !hsp.hitFrom || !hsp.hitTo || hsp.queryFrom > hsp.queryTo) return null
  const mismatchAt = new Array<number>(primerLength + 1).fill(0)
  for (let position = 1; position < hsp.queryFrom; position += 1) mismatchAt[position] = 1
  for (let position = hsp.queryTo + 1; position <= primerLength; position += 1) mismatchAt[position] = 1
  let queryPosition = hsp.queryFrom - 1
  const columns = Math.max(hsp.qseq.length, hsp.hseq.length)
  for (let column = 0; column < columns; column += 1) {
    const queryBase = hsp.qseq[column] ?? '-'
    const subjectBase = hsp.hseq[column] ?? '-'
    if (queryBase !== '-') queryPosition += 1
    const position = Math.min(primerLength, Math.max(1, queryPosition))
    if (queryBase === '-' || subjectBase === '-' || queryBase !== subjectBase) mismatchAt[position]! += 1
  }
  const mismatches = mismatchAt.reduce((sum, value) => sum + value, 0)
  let threePrimeMismatches = 0
  for (let position = Math.max(1, primerLength - threePrimeWindow + 1); position <= primerLength; position += 1) {
    threePrimeMismatches += mismatchAt[position]!
  }
  const plus = hsp.hitTo >= hsp.hitFrom
  const fivePrime = plus ? hsp.hitFrom - (hsp.queryFrom - 1) : hsp.hitFrom + (hsp.queryFrom - 1)
  const threePrime = plus ? hsp.hitTo + (primerLength - hsp.queryTo) : hsp.hitTo - (primerLength - hsp.queryTo)
  const clamp = (value: number) => (hit.subjectLength > 0 ? Math.min(hit.subjectLength, Math.max(1, value)) : Math.max(1, value))
  return {
    accession: hit.accession,
    title: hit.title,
    subjectLength: hit.subjectLength,
    low: clamp(Math.min(fivePrime, threePrime)),
    high: clamp(Math.max(fivePrime, threePrime)),
    strand: plus ? 'plus' : 'minus',
    mismatches,
    threePrimeMismatches,
  }
}

export function primingSites(
  hits: readonly ParsedPrimerHit[],
  primerLength: number,
  thresholds: SpecificityThresholds = DEFAULT_SPECIFICITY_THRESHOLDS,
): PrimerBindingSite[] {
  const seen = new Set<string>()
  return hits.flatMap((hit) => hit.hsps.flatMap((hsp) => {
    const site = primerSiteFromHsp(hit, hsp, primerLength, thresholds.threePrimeWindow)
    if (!site) return []
    if (site.mismatches >= thresholds.ignoreMismatches) return []
    if (site.threePrimeMismatches >= thresholds.threePrimeMismatches) return []
    const id = `${site.accession}:${site.strand}:${site.low}:${site.high}`
    if (seen.has(id)) return []
    seen.add(id)
    return [site]
  }))
}

export function predictPairProducts(
  pair: SpecificityPairInput,
  leftSites: readonly PrimerBindingSite[],
  rightSites: readonly PrimerBindingSite[],
  thresholds: SpecificityThresholds = DEFAULT_SPECIFICITY_THRESHOLDS,
): { products: SpecificityProduct[]; truncated: boolean } {
  const tagged = [
    ...leftSites.map((site) => ({ role: 'left' as const, site })),
    ...rightSites.map((site) => ({ role: 'right' as const, site })),
  ]
  const bySubject = new Map<string, typeof tagged>()
  for (const entry of tagged) {
    const list = bySubject.get(entry.site.accession) ?? []
    list.push(entry)
    bySubject.set(entry.site.accession, list)
  }
  const products: SpecificityProduct[] = []
  for (const entries of bySubject.values()) {
    const forwards = entries.filter((entry) => entry.site.strand === 'plus')
    const reverses = entries.filter((entry) => entry.site.strand === 'minus')
    for (const forward of forwards) {
      for (const reverse of reverses) {
        if (forward.site.low >= reverse.site.low || forward.site.high >= reverse.site.high) continue
        const size = reverse.site.high - forward.site.low + 1
        if (size > thresholds.maxProductSize) continue
        const perfect = forward.site.mismatches === 0 && reverse.site.mismatches === 0
        const pairOrientation = forward.role !== reverse.role
        const sizeDelta = pair.productSize == null ? 0 : Math.abs(size - pair.productSize)
        const kind: SpecificityProductKind = !pairOrientation || sizeDelta > similarSizeTolerance(pair.productSize ?? 0)
          ? 'offtarget'
          : perfect && sizeDelta === 0 ? 'exact' : 'similar'
        products.push({
          accession: forward.site.accession,
          title: forward.site.title,
          subjectLength: forward.site.subjectLength,
          start: forward.site.low,
          end: reverse.site.high,
          size,
          forward,
          reverse,
          kind,
        })
      }
    }
  }
  const kindOrder: Record<SpecificityProductKind, number> = { offtarget: 0, exact: 1, similar: 2 }
  products.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]
    || a.forward.site.mismatches + a.reverse.site.mismatches - (b.forward.site.mismatches + b.reverse.site.mismatches)
    || a.size - b.size)
  return { products: products.slice(0, MAX_PRODUCTS_PER_PAIR), truncated: products.length > MAX_PRODUCTS_PER_PAIR }
}

export function productRoles(product: SpecificityProduct) {
  const label = (role: PrimerRole) => (role === 'left' ? 'L' : 'R')
  return `${label(product.forward.role)}+${label(product.reverse.role)}`
}

export function specificityQueries(pairs: readonly SpecificityPairInput[]) {
  const idBySequence = new Map<string, string>()
  for (const pair of pairs) {
    for (const sequence of [pair.left, pair.right].map(normalizeDna)) {
      if (sequence && !idBySequence.has(sequence)) idBySequence.set(sequence, `vgq${idBySequence.size + 1}`)
    }
  }
  const queries = [...idBySequence].map(([sequence, id]) => ({ id, sequence }))
  return { idBySequence, queries, fasta: queries.map((query) => `>${query.id}\n${query.sequence}`).join('\n') }
}

export function evaluatePairSpecificity(
  pairs: readonly SpecificityPairInput[],
  hitsByQuery: Map<string, ParsedPrimerHit[]>,
  idBySequence: Map<string, string>,
  searchSet: SpecificitySearchSet,
  thresholds: SpecificityThresholds = DEFAULT_SPECIFICITY_THRESHOLDS,
  fastSearch = false,
): PairSpecificity[] {
  const sitesFor = (sequence: string) => {
    const normalized = normalizeDna(sequence)
    return primingSites(hitsByQuery.get(idBySequence.get(normalized) ?? '') ?? [], normalized.length, thresholds)
  }
  return pairs.map((pair) => {
    const leftSites = sitesFor(pair.left)
    const rightSites = sitesFor(pair.right)
    const { products, truncated } = predictPairProducts(pair, leftSites, rightSites, thresholds)
    const verdict = !products.length ? 'none' : products.some((product) => product.kind === 'offtarget') ? 'offtarget' : 'specific'
    return {
      key: pair.key,
      searchSet,
      products,
      truncated,
      leftSites: leftSites.length,
      rightSites: rightSites.length,
      verdict,
      fastSearch,
    }
  })
}

export async function checkPrimerPairSpecificity(
  pairs: readonly SpecificityPairInput[],
  searchSet: SpecificitySearchSet,
  options: {
    onStatus?: (status: string) => void
    signal?: AbortSignal
    thresholds?: SpecificityThresholds
    /** Use the faster, less sensitive seed length; defaults to the recommendation for the search set. */
    fast?: boolean
  } = {},
): Promise<PairSpecificity[]> {
  const { idBySequence, queries, fasta } = specificityQueries(pairs)
  if (!queries.length) return []
  options.onStatus?.('SUBMITTING')
  const entrezQuery = specificityEntrezQuery(searchSet.organism)
  const broad = isBroadSpecificitySearch(searchSet)
  const heavy = recommendFastSpecificitySearch(searchSet)
  const fast = options.fast ?? heavy
  const { rid, rtoeSeconds } = await submitNcbiBlast({
    PROGRAM: 'blastn',
    DATABASE: searchSet.database,
    QUERY: fasta,
    ...(entrezQuery ? { ENTREZ_QUERY: entrezQuery } : {}),
    WORD_SIZE: String(fast ? SPECIFICITY_WORD_SIZE.fast : SPECIFICITY_WORD_SIZE.full),
    EXPECT: '1000',
    FILTER: 'F',
    NUCL_REWARD: '1',
    NUCL_PENALTY: '-3',
    GAPCOSTS: '5 2',
    HITLIST_SIZE: '250',
    FORMAT_TYPE: 'XML2_S',
  }, options.signal)
  options.onStatus?.(`RID:${rid}`)
  const hasHits = await waitForNcbiBlast(rid, rtoeSeconds, options.onStatus, options.signal, {
    maxWaitMs: SPECIFICITY_MAX_WAIT_MS,
    timeoutMessage: specificityTimeoutMessage(rid, searchSet, { broad, heavy, fast }),
  })
  const hitsByQuery = hasHits
    ? parsePrimerBlastXml2(await (options.onStatus?.('RETRIEVING'), retrieveNcbiBlastXml2(rid, options.signal)), queries.map((query) => query.id))
    : new Map<string, ParsedPrimerHit[]>()
  return evaluatePairSpecificity(pairs, hitsByQuery, idBySequence, searchSet, options.thresholds, fast)
}

/** Search one primer and return its individual genomic/transcript binding hits. */
export async function checkSinglePrimerSpecificity(
  sequenceInput: string,
  searchSet: SpecificitySearchSet,
  options: {
    onStatus?: (status: string) => void
    signal?: AbortSignal
    thresholds?: SpecificityThresholds
    fast?: boolean
  } = {},
): Promise<SinglePrimerSpecificity> {
  const sequence = sequenceInput.toUpperCase().replace(/\s/g, '')
  if (!sequence || !/^[ACGT]+$/.test(sequence)) {
    throw new Error('Specificity search requires an unambiguous A, C, G, or T primer sequence.')
  }
  if (sequence.length < 7) throw new Error('Enter at least 7 bases for a primer specificity search.')

  const queryId = 'vgq1'
  const fasta = `>${queryId}\n${sequence}`
  options.onStatus?.('SUBMITTING')
  const entrezQuery = specificityEntrezQuery(searchSet.organism)
  const broad = isBroadSpecificitySearch(searchSet)
  const heavy = recommendFastSpecificitySearch(searchSet)
  const fast = options.fast ?? heavy
  const { rid, rtoeSeconds } = await submitNcbiBlast({
    PROGRAM: 'blastn',
    DATABASE: searchSet.database,
    QUERY: fasta,
    ...(entrezQuery ? { ENTREZ_QUERY: entrezQuery } : {}),
    WORD_SIZE: String(fast && sequence.length >= SPECIFICITY_WORD_SIZE.fast ? SPECIFICITY_WORD_SIZE.fast : SPECIFICITY_WORD_SIZE.full),
    EXPECT: '1000',
    FILTER: 'F',
    NUCL_REWARD: '1',
    NUCL_PENALTY: '-3',
    GAPCOSTS: '5 2',
    HITLIST_SIZE: '250',
    FORMAT_TYPE: 'XML2_S',
  }, options.signal)
  options.onStatus?.(`RID:${rid}`)
  const hasHits = await waitForNcbiBlast(rid, rtoeSeconds, options.onStatus, options.signal, {
    maxWaitMs: SPECIFICITY_MAX_WAIT_MS,
    timeoutMessage: specificityTimeoutMessage(rid, searchSet, { broad, heavy, fast }),
  })
  const hits = hasHits
    ? parsePrimerBlastXml2(await (options.onStatus?.('RETRIEVING'), retrieveNcbiBlastXml2(rid, options.signal)), [queryId]).get(queryId) ?? []
    : []
  const thresholds = options.thresholds ?? DEFAULT_SPECIFICITY_THRESHOLDS
  const sites: PrimerBindingSite[] = []
  const seen = new Set<string>()
  for (const hit of hits) {
    for (const hsp of hit.hsps) {
      const site = primerSiteFromHsp(hit, hsp, sequence.length, thresholds.threePrimeWindow)
      if (!site) continue
      const key = `${site.accession}:${site.strand}:${site.low}:${site.high}`
      if (seen.has(key)) continue
      seen.add(key)
      sites.push(site)
    }
  }
  sites.sort((a, b) => a.mismatches - b.mismatches || a.threePrimeMismatches - b.threePrimeMismatches
    || a.accession.localeCompare(b.accession) || a.low - b.low)
  // NCBI's HITLIST_SIZE is 250, so a response is never an exhaustive database scan.
  return {
    searchSet,
    sequenceLength: sequence.length,
    sites: sites.slice(0, 500),
    truncated: sites.length > 500,
    fastSearch: fast && sequence.length >= SPECIFICITY_WORD_SIZE.fast,
  }
}

function specificityTimeoutMessage(
  rid: string,
  searchSet: SpecificitySearchSet,
  { broad, heavy, fast }: { broad: boolean; heavy: boolean; fast: boolean },
) {
  const prefix = `NCBI had not finished after ${SPECIFICITY_MAX_WAIT_MS / 60_000} min (RID ${rid}).`
  const label = specificitySearchSetLabel(searchSet)
  if (heavy && !fast) return `${prefix} ${label} is a very large search; turn on Fast search${broad ? ' or choose an organism' : ''} and check again.`
  if (heavy) return `${prefix} Even in fast mode, ${label} is a very large search at NCBI; ${broad ? 'choose an organism' : 'check fewer pairs at a time'} or try again later.`
  return `${prefix} Its queue is probably busy. Try again later, or pick RefSeq mRNA or a narrower organism.`
}
