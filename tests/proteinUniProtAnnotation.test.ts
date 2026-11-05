import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildUniProtAnnotationPlan,
  parseUniProtBlastXml,
  searchUniProtBySimilarity,
  type UniProtSimilarityHit,
} from '../src/domain/proteinUniProtAnnotation'
import type { UniProtEntry } from '../src/domain/externalSequences/uniprot'

const blastXml = `<?xml version="1.0"?>
<BlastOutput>
  <BlastOutput_iterations><Iteration><Iteration_hits>
    <Hit>
      <Hit_id>sp|P12345|EXAMPLE_HUMAN</Hit_id>
      <Hit_def>Example annotated protein OS=Homo sapiens</Hit_def>
      <Hit_accession>P12345</Hit_accession>
      <Hit_len>10</Hit_len>
      <Hit_hsps><Hsp>
        <Hsp_bit-score>80.5</Hsp_bit-score><Hsp_evalue>1e-20</Hsp_evalue>
        <Hsp_query-from>1</Hsp_query-from><Hsp_query-to>10</Hsp_query-to>
        <Hsp_hit-from>1</Hsp_hit-from><Hsp_hit-to>10</Hsp_hit-to>
        <Hsp_identity>9</Hsp_identity><Hsp_positive>10</Hsp_positive><Hsp_align-len>10</Hsp_align-len>
      </Hsp></Hit_hsps>
    </Hit>
  </Iteration_hits></Iteration></BlastOutput_iterations>
</BlastOutput>`

const entry: UniProtEntry = {
  primaryAccession: 'P12345',
  uniProtkbId: 'EXAMPLE_HUMAN',
  entryType: 'UniProtKB reviewed (Swiss-Prot)',
  proteinDescription: { recommendedName: { fullName: { value: 'Example annotated protein' } } },
  organism: { scientificName: 'Homo sapiens', taxonId: 9606 },
  sequence: { value: 'MKTCCAAAGG', length: 10 },
  features: [
    { type: 'Domain', description: 'Central domain', location: { start: { value: 2 }, end: { value: 8 } } },
    { type: 'Active site', description: 'Catalytic residue', location: { start: { value: 6 }, end: { value: 6 } } },
    { type: 'Disulfide bond', description: 'Cys pair', location: { start: { value: 4 }, end: { value: 5 } } },
  ],
}

function similarityHit(overrides: Partial<UniProtSimilarityHit> = {}): UniProtSimilarityHit {
  return {
    accession: 'P12345', description: 'Example', subjectLength: 10, bitScore: 80.5, eValue: 1e-20,
    identityPercent: 100, positivesPercent: 100, queryCoveragePercent: 100,
    queryStart: 1, queryEnd: 10, subjectStart: 1, subjectEnd: 10,
    reviewed: true, organism: 'Homo sapiens', proteinName: 'Example annotated protein',
    featureCount: 2, bondCount: 1, entry, ...overrides,
  }
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('UniProt similarity annotation', () => {
  it('parses ranked BLAST hit statistics', () => {
    expect(parseUniProtBlastXml(blastXml, 10)).toEqual([expect.objectContaining({
      accession: 'P12345',
      bitScore: 80.5,
      eValue: 1e-20,
      identityPercent: 90,
      positivesPercent: 100,
      queryCoveragePercent: 100,
    })])
  })

  it('runs the asynchronous BLAST lifecycle and enriches hits from UniProt', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/run')) return new Response('job-123', { status: 200 })
      if (url.includes('/status/')) return new Response('FINISHED', { status: 200 })
      if (url.includes('/resulttypes/')) return new Response('<types><type><identifier>xml</identifier></type></types>', { status: 200 })
      if (url.includes('/result/')) return new Response(blastXml, { status: 200, headers: { 'content-type': 'application/xml' } })
      if (url.includes('rest.uniprot.org')) return new Response(JSON.stringify({ results: [entry] }), { status: 200, headers: { 'content-type': 'application/json' } })
      throw new Error(`Unexpected request: ${url} ${init?.method ?? 'GET'}`)
    })
    vi.stubEnv('VITE_EMBL_EBI_EMAIL', 'vibegene@example.org')
    vi.stubGlobal('fetch', fetchMock)

    const hits = await searchUniProtBySimilarity('MKTCCAAAGG', { organism: 'Homo sapiens', maxHits: 5 })

    expect(hits[0]).toMatchObject({ accession: 'P12345', reviewed: true, featureCount: 2, bondCount: 1 })
    const submission = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/run'))
    expect(submission?.[1]?.method).toBe('POST')
    expect(String(submission?.[1]?.body)).toContain('database=uniprotkb_swissprot')
    expect(String(submission?.[1]?.body)).toContain('email=vibegene%40example.org')
    expect(String(submission?.[1]?.body)).toContain('MKTCCAAAGG')
    expect(String(submission?.[1]?.body)).toContain('alignments=50')
    expect(await searchUniProtBySimilarity('MKTCCAAAGG', { organism: 'Mus musculus' })).toEqual([])
  })

  it('projects features and bonds into the selected-range coordinate system', () => {
    const plan = buildUniProtAnnotationPlan('MKTCCAAAGG', 25, similarityHit())
    const domain = plan.annotations.find((annotation) => annotation.name === 'Central domain')
    const activeSite = plan.annotations.find((annotation) => annotation.name === 'Catalytic residue')
    const bond = plan.annotations.find((annotation) => annotation.kind === 'bond')

    expect(domain?.feature?.locations[0]).toEqual({ start: 26, end: 33, strand: 'forward' })
    expect(activeSite?.feature?.locations[0]).toEqual({ start: 30, end: 31, strand: 'forward' })
    expect(bond?.bond?.endpoints).toEqual([{ residue: 28 }, { residue: 29 }])
    expect(plan.annotations.every((annotation) => annotation.selectedByDefault)).toBe(true)
    expect(domain?.feature?.notes).toContain('UniProtKB:P12345')
  })

  it('does not recommend a site whose aligned residue changed', () => {
    const plan = buildUniProtAnnotationPlan('MKTCCVAAGG', 0, similarityHit())
    const activeSite = plan.annotations.find((annotation) => annotation.name === 'Catalytic residue')

    expect(activeSite).toMatchObject({ transferable: false, selectedByDefault: false, feature: undefined })
    expect(activeSite?.warning).toContain('No amino acids')
  })

  it('rejects a disulfide when a mapped endpoint is not cysteine', () => {
    const plan = buildUniProtAnnotationPlan('MKTCVAAAGG', 0, similarityHit())
    const bond = plan.annotations.find((annotation) => annotation.kind === 'bond')

    expect(bond).toMatchObject({ transferable: false, selectedByDefault: false })
    expect(bond?.warning).toContain('cysteines')
  })
})
