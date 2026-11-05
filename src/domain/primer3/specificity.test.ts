import { describe, expect, it, vi } from 'vitest'

const ncbi = vi.hoisted(() => ({
  submitNcbiBlast: vi.fn<typeof import('../ncbiBlast').submitNcbiBlast>().mockResolvedValue({ rid: 'RID1', rtoeSeconds: 30 }),
  waitForNcbiBlast: vi.fn(async () => false),
  retrieveNcbiBlastXml2: vi.fn(async () => ''),
}))

vi.mock('../ncbiBlast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ncbiBlast')>()),
  submitNcbiBlast: ncbi.submitNcbiBlast,
  waitForNcbiBlast: ncbi.waitForNcbiBlast,
  retrieveNcbiBlastXml2: ncbi.retrieveNcbiBlastXml2,
}))

import {
  SPECIFICITY_MAX_WAIT_MS,
  checkPrimerPairSpecificity,
  checkSinglePrimerSpecificity,
  evaluatePairSpecificity,
  isBroadSpecificitySearch,
  parsePrimerBlastXml2,
  recommendFastSpecificitySearch,
  predictPairProducts,
  primerSiteFromHsp,
  productRoles,
  specificityEntrezQuery,
  specificityQueries,
  specificitySearchSetLabel,
} from './specificity'

const LEFT = 'GTCTCCTCTGACTTCAACAGCG'
const RIGHT = 'ACCACCCTGTTGCTGTAGCCAA'
const SEARCH_SET = { database: 'refseq_rna' as const, organism: '9606' }

type TestHsp = { qFrom: number; qTo: number; hFrom: number; hTo: number; qseq: string; hseq: string }

function hspXml(hsp: TestHsp) {
  return `<Hsp><num>1</num><query-from>${hsp.qFrom}</query-from><query-to>${hsp.qTo}</query-to><hit-from>${hsp.hFrom}</hit-from><hit-to>${hsp.hTo}</hit-to><qseq>${hsp.qseq}</qseq><hseq>${hsp.hseq}</hseq></Hsp>`
}

function hitXml(accession: string, length: number, hsps: TestHsp[]) {
  return `<Hit><num>1</num><description><HitDescr><id>ref|${accession}|</id><accession>${accession.split('.')[0]}</accession><title>Homo sapiens test gene ${accession}, mRNA</title><taxid>9606</taxid></HitDescr></description><len>${length}</len><hsps>${hsps.map(hspXml).join('')}</hsps></Hit>`
}

function searchXml(queryId: string, queryLength: number, hits: string[]) {
  return `<BlastOutput2><report><Report><results><Results><search><Search><query-id>Query_${queryId.slice(3)}</query-id><query-title>${queryId}</query-title><query-len>${queryLength}</query-len><hits>${hits.join('')}</hits></Search></search></Results></results></Report></report></BlastOutput2>`
}

function withMismatch(sequence: string, index: number) {
  const base = sequence[index] === 'A' ? 'C' : 'A'
  return sequence.slice(0, index) + base + sequence.slice(index + 1)
}

function fixture() {
  const left = [
    hitXml('NM_000001.1', 1000, [
      { qFrom: 1, qTo: 22, hFrom: 101, hTo: 122, qseq: LEFT, hseq: LEFT },
      { qFrom: 1, qTo: 22, hFrom: 600, hTo: 579, qseq: LEFT, hseq: LEFT },
    ]),
    hitXml('NM_000002.3', 900, [{ qFrom: 1, qTo: 22, hFrom: 50, hTo: 71, qseq: LEFT, hseq: withMismatch(LEFT, 8) }]),
    hitXml('NM_000003.1', 900, [
      { qFrom: 1, qTo: 22, hFrom: 10, hTo: 31, qseq: LEFT, hseq: withMismatch(withMismatch(LEFT, 21), 19) },
    ]),
  ]
  const right = [
    hitXml('NM_000001.1', 1000, [{ qFrom: 1, qTo: 22, hFrom: 322, hTo: 301, qseq: RIGHT, hseq: RIGHT }]),
    hitXml('NM_000002.3', 900, [{ qFrom: 1, qTo: 22, hFrom: 400, hTo: 379, qseq: RIGHT, hseq: RIGHT }]),
    hitXml('NM_000003.1', 900, [{ qFrom: 1, qTo: 22, hFrom: 200, hTo: 179, qseq: RIGHT, hseq: RIGHT }]),
  ]
  return `<?xml version="1.0"?><BlastXML2>${searchXml('vgq1', 22, left)}${searchXml('vgq2', 22, right)}</BlastXML2>`
}

describe('primer specificity', () => {
  it('builds organism Entrez queries and labels', () => {
    expect(specificityEntrezQuery('9606')).toBe('txid9606[Organism:exp]')
    expect(specificityEntrezQuery('Bos taurus')).toBe('"Bos taurus"[Organism]')
    expect(specificityEntrezQuery('  ')).toBe('')
    expect(specificitySearchSetLabel(SEARCH_SET)).toBe('RefSeq mRNA · Homo sapiens')
    expect(specificitySearchSetLabel({ database: 'core_nt', organism: '' })).toBe('Core nucleotide (core_nt)')
  })

  it('queries each distinct primer once', () => {
    const { queries, idBySequence } = specificityQueries([
      { key: 'a', left: LEFT, right: RIGHT },
      { key: 'b', left: 'AAAACCCCGGGGTTTTAAAA', right: RIGHT.toLowerCase() },
    ])
    expect(queries.map((query) => query.id)).toEqual(['vgq1', 'vgq2', 'vgq3'])
    expect(idBySequence.get(RIGHT)).toBe('vgq2')
  })

  it('extends partial HSPs to the full primer footprint and counts 3′ mismatches', () => {
    const hit = { accession: 'NM_1.1', title: 't', subjectLength: 1000 }
    const plus = primerSiteFromHsp(hit, { queryFrom: 1, queryTo: 20, hitFrom: 101, hitTo: 120, qseq: LEFT.slice(0, 20), hseq: LEFT.slice(0, 20) }, 22)
    expect(plus).toMatchObject({ low: 101, high: 122, strand: 'plus', mismatches: 2, threePrimeMismatches: 2 })
    const minus = primerSiteFromHsp(hit, { queryFrom: 3, queryTo: 22, hitFrom: 320, hitTo: 301, qseq: LEFT.slice(2), hseq: LEFT.slice(2) }, 22)
    expect(minus).toMatchObject({ low: 301, high: 322, strand: 'minus', mismatches: 2, threePrimeMismatches: 0 })
    const gapped = primerSiteFromHsp(hit, { queryFrom: 1, queryTo: 22, hitFrom: 1, hitTo: 23, qseq: `${LEFT.slice(0, 10)}-${LEFT.slice(10)}`, hseq: `${LEFT.slice(0, 10)}A${LEFT.slice(10)}` }, 22)
    expect(gapped).toMatchObject({ mismatches: 1, threePrimeMismatches: 0 })
  })

  it('predicts intended and unintended amplicons from BLAST XML2', () => {
    const { idBySequence } = specificityQueries([{ key: 'p', left: LEFT, right: RIGHT }])
    const hits = parsePrimerBlastXml2(fixture(), ['vgq1', 'vgq2'])
    expect(hits.get('vgq1')).toHaveLength(3)
    expect(hits.get('vgq1')![0]).toMatchObject({ accession: 'NM_000001.1', subjectLength: 1000 })
    const [spec] = evaluatePairSpecificity([{ key: 'p', left: LEFT, right: RIGHT, productSize: 222 }], hits, idBySequence, SEARCH_SET)
    expect(spec!.leftSites).toBe(3)
    expect(spec!.rightSites).toBe(3)
    expect(spec!.verdict).toBe('offtarget')
    const summary = spec!.products.map((product) => [product.accession, productRoles(product), product.size, product.kind])
    expect(summary).toEqual([
      ['NM_000001.1', 'L+L', 500, 'offtarget'],
      ['NM_000002.3', 'L+R', 351, 'offtarget'],
      ['NM_000001.1', 'L+R', 222, 'exact'],
    ])
    expect(spec!.products[1]!.forward.site).toMatchObject({ mismatches: 1, threePrimeMismatches: 0 })
  })

  it('reports specific pairs and missing templates', () => {
    const { idBySequence } = specificityQueries([{ key: 'p', left: LEFT, right: RIGHT }])
    const hits = parsePrimerBlastXml2(fixture(), ['vgq1', 'vgq2'])
    hits.set('vgq1', hits.get('vgq1')!.slice(0, 1).map((hit) => ({ ...hit, hsps: hit.hsps.slice(0, 1) })))
    const [specific] = evaluatePairSpecificity([{ key: 'p', left: LEFT, right: RIGHT, productSize: 222 }], hits, idBySequence, SEARCH_SET)
    expect(specific!.verdict).toBe('specific')
    const [none] = evaluatePairSpecificity([{ key: 'p', left: LEFT, right: RIGHT }], new Map(), idBySequence, SEARCH_SET)
    expect(none!.verdict).toBe('none')
    expect(none!.products).toEqual([])
  })

  it('treats near-expected-size amplicons with tolerated mismatches as similar, not off-target', () => {
    const site = (low: number, high: number, strand: 'plus' | 'minus', mismatches: number) => ({
      accession: 'KX1.1', title: 't', subjectLength: 5000, low, high, strand, mismatches, threePrimeMismatches: 0,
    })
    const [spec] = evaluatePairSpecificity(
      [{ key: 'p', left: LEFT, right: RIGHT, productSize: 222 }],
      new Map([
        ['vgq1', [{ accession: 'KX1.1', title: 't', subjectLength: 5000, hsps: [] }]],
      ]),
      new Map(),
      SEARCH_SET,
    )
    expect(spec!.verdict).toBe('none')
    const { products } = predictPairProducts(
      { key: 'p', left: LEFT, right: RIGHT, productSize: 222 },
      [site(101, 122, 'plus', 1), site(1001, 1022, 'plus', 0)],
      [site(301, 322, 'minus', 0), site(1201, 1225, 'minus', 0), site(1301, 1322, 'minus', 0)],
    )
    expect(products.map((product) => [product.start, product.size, product.kind])).toEqual([
      [1001, 322, 'offtarget'],
      [101, 1125, 'offtarget'],
      [101, 1222, 'offtarget'],
      [1001, 225, 'similar'],
      [101, 222, 'similar'],
    ])
  })

  it('uses faster seeds and a bounded wait for unrestricted or kingdom-level searches', async () => {
    expect(isBroadSpecificitySearch({ database: 'core_nt', organism: '' })).toBe(true)
    expect(isBroadSpecificitySearch({ database: 'refseq_rna', organism: '2759' })).toBe(true)
    expect(isBroadSpecificitySearch({ database: 'core_nt', organism: '9606' })).toBe(false)
    expect(isBroadSpecificitySearch({ database: 'core_nt', organism: 'Mus musculus' })).toBe(false)

    const pair = [{ key: 'p', left: LEFT, right: RIGHT, productSize: 222 }]
    const [narrow] = await checkPrimerPairSpecificity(pair, SEARCH_SET)
    const [broad] = await checkPrimerPairSpecificity(pair, { database: 'core_nt', organism: '' })

    const submitted = ncbi.submitNcbiBlast.mock.calls.map((call) => (call as unknown as [Record<string, string>])[0])
    expect(submitted.map((params) => params.WORD_SIZE)).toEqual(['7', '11'])
    expect(submitted[1]!.ENTREZ_QUERY).toBeUndefined()
    expect(narrow!.fastSearch).toBe(false)
    expect(broad!.fastSearch).toBe(true)
    const waitOptions = ncbi.waitForNcbiBlast.mock.calls.map(
      (call) => (call as unknown as [string, number, unknown, unknown, { maxWaitMs: number; timeoutMessage: string }])[4],
    )
    expect(waitOptions.every((options) => options.maxWaitMs === SPECIFICITY_MAX_WAIT_MS)).toBe(true)
    expect(waitOptions[1]!.timeoutMessage).toContain('choose an organism')
  })

  it('lets the caller choose fast or full seeds regardless of the recommendation', async () => {
    ncbi.submitNcbiBlast.mockClear()
    ncbi.waitForNcbiBlast.mockClear()
    const genomes = { database: 'refseq_representative_genomes', organism: '9606' } as const
    expect(recommendFastSpecificitySearch(genomes)).toBe(true)
    expect(recommendFastSpecificitySearch(SEARCH_SET)).toBe(false)

    const pair = [{ key: 'p', left: LEFT, right: RIGHT, productSize: 222 }]
    const [full] = await checkPrimerPairSpecificity(pair, genomes, { fast: false })
    const [fast] = await checkPrimerPairSpecificity(pair, SEARCH_SET, { fast: true })

    const submitted = ncbi.submitNcbiBlast.mock.calls.map((call) => (call as unknown as [Record<string, string>])[0])
    expect(submitted.map((params) => params.WORD_SIZE)).toEqual(['7', '11'])
    expect(full!.fastSearch).toBe(false)
    expect(fast!.fastSearch).toBe(true)
    const timeout = (ncbi.waitForNcbiBlast.mock.calls[0] as unknown as [string, number, unknown, unknown, { timeoutMessage: string }])[4]
      .timeoutMessage
    expect(timeout).toContain('turn on Fast search')
  })

  it('returns individual single-primer hits with strand, coordinates, and 3′ mismatch evidence', async () => {
    ncbi.submitNcbiBlast.mockClear()
    ncbi.waitForNcbiBlast.mockClear()
    ncbi.waitForNcbiBlast.mockResolvedValue(true)
    ncbi.retrieveNcbiBlastXml2.mockResolvedValue(searchXml('vgq1', LEFT.length, [
      hitXml('NM_000001.1', 1000, [
        { qFrom: 1, qTo: LEFT.length, hFrom: 101, hTo: 122, qseq: LEFT, hseq: LEFT },
        { qFrom: 1, qTo: LEFT.length, hFrom: 600, hTo: 579, qseq: LEFT, hseq: LEFT },
        { qFrom: 1, qTo: LEFT.length, hFrom: 300, hTo: 321, qseq: LEFT, hseq: withMismatch(LEFT, LEFT.length - 1) },
      ]),
    ]))

    const result = await checkSinglePrimerSpecificity(LEFT, SEARCH_SET, { fast: false })
    expect(result).toMatchObject({ sequenceLength: LEFT.length, fastSearch: false })
    expect(result.sites).toMatchObject([
      { accession: 'NM_000001.1', low: 101, high: 122, strand: 'plus', mismatches: 0, threePrimeMismatches: 0 },
      { accession: 'NM_000001.1', low: 579, high: 600, strand: 'minus', mismatches: 0, threePrimeMismatches: 0 },
      { accession: 'NM_000001.1', low: 300, high: 321, strand: 'plus', mismatches: 1, threePrimeMismatches: 1 },
    ])
    expect(result).not.toHaveProperty('products')
    expect(ncbi.submitNcbiBlast.mock.calls[0]?.[0]).toMatchObject({ QUERY: `>vgq1\n${LEFT}`, WORD_SIZE: '7' })
  })

  it('rejects ambiguous or too-short single-primer queries instead of silently changing the query', async () => {
    await expect(checkSinglePrimerSpecificity('ACGTNACGT', SEARCH_SET)).rejects.toThrow('unambiguous')
    await expect(checkSinglePrimerSpecificity('ACGTAC', SEARCH_SET)).rejects.toThrow('at least 7')
  })

  it('uses a valid 7-base seed for a short primer even when fast mode is requested', async () => {
    ncbi.submitNcbiBlast.mockClear()
    ncbi.waitForNcbiBlast.mockResolvedValue(false)
    const result = await checkSinglePrimerSpecificity('ACGTACGT', SEARCH_SET, { fast: true })
    expect(ncbi.submitNcbiBlast.mock.calls[0]?.[0]).toMatchObject({ WORD_SIZE: '7' })
    expect(result.fastSearch).toBe(false)
  })
})
