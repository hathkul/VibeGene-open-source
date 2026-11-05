import { themeFixturePalette } from '../test-support/themeFixturePalette'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  featureFromInterProMatch,
  groupInterProMatches,
  parseInterProScanTsv,
  searchInterProPfam,
} from './proteinInterProAnnotation'

const tsv = [
  'query\tmd5\t320\tPfam\tPF00069\tProtein kinase domain\t42\t297\t1.2E-48\tT\t28-08-2026\tIPR000719\tProtein kinase domain\tGO:0004672|GO:0005524\tReactome:R-HSA-9006925',
  'query\tmd5\t320\tPfam\tPF07714\tProtein tyrosine kinase\t58\t290\t3.1E-36\tT\t28-08-2026\tIPR000719\tProtein kinase domain\tGO:0004672\t-',
].join('\n')

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('InterProScan/Pfam annotation', () => {
  it('parses TSV matches and converts coordinates to zero-based half-open ranges', () => {
    const matches = parseInterProScanTsv(tsv)
    expect(matches).toHaveLength(2)
    expect(matches[0]).toMatchObject({
      analysis: 'Pfam',
      signatureAccession: 'PF00069',
      start: 41,
      end: 297,
      score: 1.2e-48,
      interProAccession: 'IPR000719',
      goTerms: ['GO:0004672', 'GO:0005524'],
    })
  })

  it('groups signatures under their integrated InterPro entry', () => {
    const groups = groupInterProMatches(parseInterProScanTsv(tsv))
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      accession: 'IPR000719',
      name: 'Protein kinase domain',
      analysis: 'Pfam',
    })
    expect(groups[0]?.matches).toHaveLength(2)
  })

  it('creates a mapped protein feature with database provenance', () => {
    const match = parseInterProScanTsv(tsv)[0]!
    const feature = featureFromInterProMatch(match, 100)
    expect(feature).toMatchObject({
      name: 'Protein kinase domain',
      type: 'domain',
      color: themeFixturePalette.bluePrimary,
      locations: [{ start: 141, end: 397, strand: 'forward' }],
    })
    expect(feature.notes).toContain('Pfam:PF00069')
    expect(feature.notes).toContain('InterPro:IPR000719')
  })

  it('submits a valid VibeGene contact address to EMBL-EBI', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/run')) return new Response('iprscan-job-123')
      if (url.includes('/status/')) return new Response('FINISHED')
      if (url.includes('/resulttypes/')) return new Response('<types><type><identifier>tsv</identifier></type></types>')
      if (url.includes('/result/')) return new Response(tsv)
      throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    })
    vi.stubEnv('VITE_EMBL_EBI_EMAIL', 'vibegene@example.org')
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchInterProPfam('MKTCCAAAGG')).resolves.toHaveLength(1)

    const submission = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/run'))
    expect(String(submission?.[1]?.body)).toContain('email=vibegene%40example.org')
    expect(String(submission?.[1]?.body)).toContain('appl=PfamA')
  })
})
