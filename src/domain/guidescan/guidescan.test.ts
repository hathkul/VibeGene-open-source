import { themeFixturePalette } from '../../test-support/themeFixturePalette'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defaultConstructProperties, normalizeSequenceRecord } from '../constructProperties'
import { featureQualifierValues, parseFeatureQualifiers } from '../featureQualifiers'
import { exportGenBank, exportSnapGene, parseGenBank, parseSequenceFile, parseSnapGene } from '../parsers'
import { defaultSnapGeneExportOptions } from '../snapgeneEnzymeExport'
import { createId } from '../sequence'
import type { SequenceRecord } from '../types'
import {
  GUIDESCAN_DEFAULT_TOP_N,
  GUIDESCAN_GUIDE_MAX_LENGTH,
  GUIDESCAN_GUIDE_MIN_LENGTH,
  autocompleteGuideScanGenes,
  autocompleteGuideScanGenesDetailed,
  buildGuideScanGuideValidationForm,
  buildGuideScanQueryForm,
  buildGuideScanQueryText,
  designGuidesWithGuideScan,
  anchorRefSeqGeneOnReference,
  fetchGuideScanGeneSequence,
  chromosomeFromRefSeqAccession,
  fetchNcbiGeneRegionRecord,
  genomicAnchorFromRefSeqGeneEnds,
  ncbiFastaWindowIndexToGenomic,
  uniqueDnaSubstringIndex,
  fetchGuideScanSupported,
  guideScanGeneFetchUsesNcbiFirst,
  mapGuideScanCandidateToHit,
  formatGuideScanCoordinate,
  formatGuideScanMappingSummary,
  formatGuideScanOffTargetSummary,
  guideScanDesignEligibilityForRecord,
  normalizeGuideScanGuideValidationJson,
  normalizeGuideScanResultJson,
  pollGuideScanJob,
  prepareGuideScanDesignRequest,
  resolveGuideScanGeneSymbol,
  startGuideScanDesign,
  submitGuideScanQuery,
  validateGuideScanGuideQuery,
  validateGuideWithGuideScan,
  GuideScanError,
  buildGuideScanDesignCacheEntry,
  compactGuideScanGuideCandidate,
  expandGuideScanDesignResult,
  guideScanDesignCacheMatchesRecord,
  guideScanDesignRunContextKey,
  normalizeGuideScanDesignCache,
  defaultGuideScanGuideName,
} from './index'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('defaultGuideScanGuideName', () => {
  it('names the target and the Cas enzyme the guide was designed for', () => {
    const candidate = { regionName: 'VLDLR', rank: 1 } as Parameters<typeof defaultGuideScanGuideName>[0]
    expect(defaultGuideScanGuideName(candidate, 0, 0, 'cas9')).toBe('sgRNA 1 (VLDLR, SpCas9)')
    expect(defaultGuideScanGuideName(candidate, 1, 2, 'cpf1')).toBe('sgRNA 4 (VLDLR, Cas12a)')
  })
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function textResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } })
}

function minimalGenbank(sequence: string, accession = 'NC_000017.11') {
  const lines = sequence.match(/.{1,60}/g) ?? []
  const origin = lines.map((chunk, index) => {
    const start = index * 60 + 1
    return `${String(start).padStart(9)} ${chunk.toLowerCase()}`
  }).join('\n')
  return `LOCUS       REGION    ${sequence.length} bp    DNA     linear
DEFINITION  Synthetic gene region.
ACCESSION   ${accession}
ORIGIN
${origin}
//
`
}

function refSeqGeneGenbank(
  sequence: string,
  options: {
    accession?: string
    symbol: string
    entrezId: string
    geneStart?: number
    geneEnd?: number
  },
) {
  const accession = options.accession ?? 'NG_017013.2'
  const geneStart = options.geneStart ?? 51
  const geneEnd = options.geneEnd ?? sequence.length - 50
  const lines = sequence.match(/.{1,60}/g) ?? []
  const origin = lines.map((chunk, index) => {
    const start = index * 60 + 1
    return `${String(start).padStart(9)} ${chunk.toLowerCase()}`
  }).join('\n')
  return `LOCUS       ${options.symbol}    ${sequence.length} bp    DNA     linear
DEFINITION  Homo sapiens ${options.symbol} (${options.symbol}), RefSeqGene on chromosome 17.
ACCESSION   ${accession}
FEATURES             Location/Qualifiers
     gene            ${geneStart}..${geneEnd}
                     /gene="${options.symbol}"
                     /db_xref="GeneID:${options.entrezId}"
ORIGIN
${origin}
//
`
}

function fastaResponse(sequence: string, accession = 'NC_000017.11') {
  return `>${accession} synthetic\n${sequence.match(/.{1,70}/g)?.join('\n') ?? sequence}\n`
}

function emptyRefSeqGeneElinkResponse() {
  return jsonResponse({
    linksets: [{ linksetdbs: [{ linkname: 'gene_nuccore_refseqgene', links: [] }] }],
  })
}

function ncbiGeneRegionSummaryResponse(
  geneId: string,
  row: {
    symbol: string
    description: string
    chraccver: string
    chrstart: number
    chrstop: number
    assemblyaccver?: string
  },
) {
  return jsonResponse({
    result: {
      uids: [geneId],
      [geneId]: {
        uid: geneId,
        name: row.symbol,
        description: row.description,
        organism: { scientificname: 'Homo sapiens', taxid: 9606 },
        genomicinfo: [{
          chraccver: row.chraccver,
          chrstart: row.chrstart,
          chrstop: row.chrstop,
          assemblyaccver: row.assemblyaccver ?? 'GRCh38',
        }],
      },
    },
  })
}

function baseRecord(overrides: Partial<SequenceRecord> = {}): SequenceRecord {
  return {
    id: createId('seq'),
    name: 'test',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: 'ATGC',
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  }
}

describe('GuideScan2 query builders', () => {
  it('formats 1-based genomic coordinates for GuideScan query-text', () => {
    expect(formatGuideScanCoordinate({ chromosome: 'chr17', start: 100, end: 200 }))
      .toBe('chr17:100-200')
  })

  it('builds gene, coordinates, and selection query text', () => {
    expect(buildGuideScanQueryText({
      organism: 'hg38', enzyme: 'cas9', kind: 'gene', geneName: 'BRCA1',
    })).toBe('BRCA1')

    expect(buildGuideScanQueryText({
      organism: 'hg38',
      enzyme: 'cas9',
      kind: 'coordinates',
      coordinates: { chromosome: 'chr17', start: 43044295, end: 43125364 },
    })).toBe('chr17:43044295-43125364')

    expect(buildGuideScanQueryText({
      organism: 'hg38',
      enzyme: 'cas9',
      kind: 'selection',
      coordinates: { chromosome: 'chr17', start: 10, end: 20, name: 'exon2' },
    })).toBe('chr17:10-20')
  })

  it('rejects unsupported sequence design kind', () => {
    expect(() => buildGuideScanQueryText({
      organism: 'hg38',
      enzyme: 'cas9',
      // @ts-expect-error sequence design removed
      kind: 'sequence',
      sequence: 'ACGTACGTACGT',
    })).toThrow(GuideScanError)
  })

  it('defaults topN to 20 and encodes frontend FormData fields', () => {
    const form = buildGuideScanQueryForm({
      organism: 'hg38',
      enzyme: 'cas9',
      kind: 'gene',
      geneName: 'TP53',
      flanking: 1000,
      filterAnnotated: true,
      specificityMin: 0.2,
      cuttingEfficiencyMin: 0.1,
    })

    expect(form.get('organism')).toBe('hg38')
    expect(form.get('enzyme')).toBe('cas9')
    expect(form.get('query-text')).toBe('TP53')
    expect(form.get('topn')).toBe(String(GUIDESCAN_DEFAULT_TOP_N))
    expect(form.get('mode')).toBe('flanking')
    expect(form.get('flanking')).toBe('1000')
    expect(form.get('filter-annotated')).toBe('true')
    expect(form.get('s-bounds-l')).toBe('0.2')
    expect(form.get('ce-bounds-l')).toBe('0.1')
  })

  it('rejects invalid coordinate ranges', () => {
    expect(() => formatGuideScanCoordinate({ chromosome: 'chr1', start: 50, end: 10 }))
      .toThrow(GuideScanError)
  })
})

describe('GuideScan2 gRNA validation', () => {
  it('builds multipart grna form fields', () => {
    const form = buildGuideScanGuideValidationForm({
      organism: 'hg38',
      enzyme: 'cas9',
      guideSequence: 'actgcccttgcacactgggg',
    })
    expect(form.get('query-type')).toBe('grna')
    expect(form.get('query-text')).toBe('ACTGCCCTTGCACACTGGGG')
    expect(form.get('organism')).toBe('hg38')
    expect(form.get('enzyme')).toBe('cas9')
  })

  it('rejects 19, 24, and invalid alphabet before network', () => {
    expect(() => validateGuideScanGuideQuery('A'.repeat(19))).toThrow(/20–23/)
    expect(() => validateGuideScanGuideQuery('A'.repeat(24))).toThrow(/20–23/)
    expect(() => validateGuideScanGuideQuery(`${'A'.repeat(20)}X`)).toThrow(/A, C, G, T, or N/)
    expect(GUIDESCAN_GUIDE_MIN_LENGTH).toBe(20)
    expect(GUIDESCAN_GUIDE_MAX_LENGTH).toBe(23)
  })

  it('normalizes successful gRNA validation hits', () => {
    const result = normalizeGuideScanGuideValidationJson([{
      sequence: 'ACTGCCCTTGCACACTGGGGNGG',
      start: 150,
      end: 172,
      direction: 'positive',
      specificity: 0.55,
      'cutting-efficiency': 0.4,
      annotations: ['exon'],
      'distance-0-off-targets': 1,
      'distance-1-off-targets': 0,
      'distance-2-off-targets': 2,
      'distance-3-off-targets': 0,
      'distance-4-off-targets': 5,
      'off-targets': [{
        position: 100,
        chromosome: '1',
        direction: 'negative',
        distance: 2,
        accession: 'NC_000001.11',
      }],
      'genomic-region': {
        'region-name': 'ACTGCCCTTGCACACTGGGG',
        'chromosome-name': 'chr17',
        coords: ['NC_000017.11', 150, 172],
        organism: 'hg38',
      },
    }], {
      jobId: 'g-1',
      organism: 'hg38',
      enzyme: 'cas9',
      querySequence: 'ACTGCCCTTGCACACTGGGG',
      resultType: 'grna',
    })

    expect(result.found).toBe(true)
    expect(result.errorMessage).toBeNull()
    expect(result.guide).toMatchObject({
      chromosome: 'chr17',
      start: 150,
      end: 172,
      strand: 'forward',
      spacer: 'ACTGCCCTTGCACACTGGGG',
      pam: 'NGG',
      specificity: 0.55,
      cuttingEfficiency: 0.4,
      annotations: ['exon'],
      offTargetCounts: {
        distance0: 1,
        distance1: 0,
        distance2: 2,
        distance3: 0,
        distance4: 5,
      },
    })
    expect(result.guide?.offTargets[0]).toMatchObject({ chromosome: '1', distance: 2, direction: 'reverse' })
  })

  it('surfaces GuideScan per-guide error messages', () => {
    const result = normalizeGuideScanGuideValidationJson([{
      error: {
        message: 'Guide not found in Guidescan2 database. This is because it has multiple off-targets at distance 1.',
      },
      grna: 'ACTGCCCTTGCACACTGGGG',
    }], {
      jobId: 'g-2',
      organism: 'hg38',
      enzyme: 'cas9',
      querySequence: 'ACTGCCCTTGCACACTGGGG',
      resultType: 'grna',
    })

    expect(result.found).toBe(false)
    expect(result.guide).toBeNull()
    expect(result.errorMessage).toMatch(/multiple off-targets/)
  })

  it('submits, polls, and returns validation results (mocked)', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/query') && init?.method === 'POST') {
        const body = init.body as FormData
        expect(body.get('query-type')).toBe('grna')
        expect(body.get('query-text')).toBe('ACTGCCCTTGCACACTGGGG')
        return jsonResponse({ 'job-id': 'val-1' })
      }
      if (url.includes('/job/status/val-1')) {
        statusCalls += 1
        if (statusCalls < 2) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'grna', failure: null })
      }
      if (url.includes('/job/result/json/val-1')) {
        return jsonResponse([{
          sequence: 'ACTGCCCTTGCACACTGGGGNGG',
          start: 10,
          end: 32,
          direction: 'positive',
          specificity: 0.9,
          'cutting-efficiency': 0.8,
          annotations: [],
          'distance-0-off-targets': 1,
          'distance-1-off-targets': 0,
          'distance-2-off-targets': 0,
          'distance-3-off-targets': 0,
          'distance-4-off-targets': 0,
          'off-targets': [],
          'genomic-region': {
            'region-name': 'ACTGCCCTTGCACACTGGGG',
            'chromosome-name': 'chr1',
            coords: ['chr1', 10, 32],
          },
        }])
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const pending = validateGuideWithGuideScan({
      organism: 'hg38',
      enzyme: 'cas9',
      guideSequence: 'actgcccttgcacactgggg',
    }, {
      baseUrl: 'https://guidescan.test/backend',
      pollIntervalMs: 50,
    })
    await vi.advanceTimersByTimeAsync(200)
    const result = await pending
    expect(result.found).toBe(true)
    expect(result.guide?.spacer).toBe('ACTGCCCTTGCACACTGGGG')
  })

  it('honours abort during gRNA validation polling', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/query') && init?.method === 'POST') {
        return jsonResponse({ 'job-id': 'abort-me' })
      }
      return jsonResponse({ 'job-status': 'pending', failure: null })
    }))

    const pending = validateGuideWithGuideScan({
      organism: 'hg38',
      enzyme: 'cas9',
      guideSequence: 'A'.repeat(20),
    }, {
      baseUrl: 'https://guidescan.test/backend',
      pollIntervalMs: 20,
      overallTimeoutMs: 10_000,
      signal: controller.signal,
    })
    const assertion = expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    controller.abort()
    await assertion
  })
})

describe('GuideScan record design eligibility', () => {
  it('accepts Ensembl gene records with symbol and assembly mapping', () => {
    const eligibility = guideScanDesignEligibilityForRecord(baseRecord({
      name: 'BRCA2',
      externalSource: {
        provider: 'ensembl',
        accession: 'ENSG00000139618',
        assembly: 'GRCh38',
        retrievedAt: new Date(0).toISOString(),
        sourceUrl: 'https://www.ensembl.org/id/ENSG00000139618',
        database: 'Ensembl',
      },
    }))
    expect(eligibility).toMatchObject({
      eligible: true,
      queryText: 'BRCA2',
      organism: 'hg38',
      identity: { kind: 'ensembl_gene', ensemblId: 'ENSG00000139618', symbol: 'BRCA2' },
    })
  })

  it('accepts Entrez Gene ID on externalSource', () => {
    const eligibility = guideScanDesignEligibilityForRecord(baseRecord({
      name: 'BRCA1',
      description: 'Homo sapiens',
      externalSource: {
        provider: 'ncbi',
        accession: '672',
        database: 'gene',
        retrievedAt: new Date(0).toISOString(),
        sourceUrl: 'https://www.ncbi.nlm.nih.gov/gene/672',
      },
    }))
    expect(eligibility).toMatchObject({
      eligible: true,
      queryText: '672',
      organism: 'hg38',
      identity: { kind: 'entrez_gene', entrezId: '672' },
    })
  })

  it('rejects Entrez Gene records when reference genome cannot be inferred', () => {
    const eligibility = guideScanDesignEligibilityForRecord(baseRecord({
      name: 'BRCA1',
      description: '',
      externalSource: {
        provider: 'ncbi',
        accession: '672',
        database: 'gene',
        retrievedAt: new Date(0).toISOString(),
        sourceUrl: 'https://www.ncbi.nlm.nih.gov/gene/672',
      },
    }))
    expect(eligibility.eligible).toBe(false)
    if (!eligibility.eligible) {
      expect(eligibility.reason).toMatch(/reference genome cannot be determined/i)
    }
  })

  it('rejects Ensembl genes when species maps to no supported GuideScan reference', () => {
    const eligibility = guideScanDesignEligibilityForRecord(baseRecord({
      name: 'myc',
      externalSource: {
        provider: 'ensembl',
        accession: 'ENSDARG00000069684',
        assembly: 'GRCz11',
        retrievedAt: new Date(0).toISOString(),
        sourceUrl: 'https://www.ensembl.org/id/ENSDARG00000069684',
        database: 'Ensembl',
      },
    }))
    expect(eligibility.eligible).toBe(false)
    if (!eligibility.eligible) {
      expect(eligibility.reason).toMatch(/reference genome cannot be determined/i)
    }
  })

  it('rejects arbitrary plasmids without gene identity', () => {
    const eligibility = guideScanDesignEligibilityForRecord(baseRecord({
      name: 'pUC19',
      description: 'cloning vector with ampR gene cassette',
      sequence: 'A'.repeat(2686),
    }))
    expect(eligibility.eligible).toBe(false)
    if (!eligibility.eligible) {
      expect(eligibility.reason).toMatch(/no external database accession|lacks an Ensembl gene ID|Entrez/i)
    }
  })

  it('accepts NCBI RefSeqGene NG_ records with an explicit GeneID db_xref', () => {
    const eligibility = guideScanDesignEligibilityForRecord(baseRecord({
      name: 'NG_016444.2',
      description: 'Homo sapiens LDL receptor related protein 1 (LRP1), RefSeqGene (LRG_1016) on chromosome 12',
      construct: {
        ...defaultConstructProperties,
        sourceOrganism: 'homo-sapiens',
      },
      externalSource: {
        provider: 'ncbi',
        accession: 'NG_016444.2',
        database: 'nuccore',
        retrievedAt: new Date(0).toISOString(),
        sourceUrl: 'https://www.ncbi.nlm.nih.gov/nuccore/NG_016444.2',
      },
      features: [
        {
          id: 'src',
          name: 'source',
          type: 'source',
          color: themeFixturePalette.gray,
          notes: '/organism="Homo sapiens" /mol_type="genomic DNA" /db_xref="taxon:9606" /chromosome="12"',
          locations: [{ start: 0, end: 4, strand: 'forward' }],
        },
        {
          id: 'gene',
          name: 'LRP1',
          type: 'gene',
          color: themeFixturePalette.blue,
          notes: '/gene="LRP1" /gene_synonym="A2MR; APOER; APR; CD91" /db_xref="GeneID:4035" /db_xref="HGNC:HGNC:6692" /db_xref="MIM:107770"',
          locations: [{ start: 0, end: 4, strand: 'forward' }],
        },
      ],
    }))
    expect(eligibility).toMatchObject({
      eligible: true,
      queryText: '4035',
      organism: 'hg38',
      identity: { kind: 'entrez_gene', entrezId: '4035', symbol: 'LRP1' },
    })
  })

  it('selects the primary RefSeqGene GeneID when secondary genes are also annotated', () => {
    const eligibility = guideScanDesignEligibilityForRecord(baseRecord({
      name: 'NG_016444.2',
      description: 'Homo sapiens LDL receptor related protein 1 (LRP1), RefSeqGene on chromosome 12.',
      construct: {
        ...defaultConstructProperties,
        sourceOrganism: 'homo-sapiens',
      },
      externalSource: {
        provider: 'ncbi',
        accession: 'NG_016444.2',
        database: 'nuccore',
        retrievedAt: new Date(0).toISOString(),
        sourceUrl: 'https://www.ncbi.nlm.nih.gov/nuccore/NG_016444.2',
      },
      features: [
        {
          id: 'src',
          name: 'source',
          type: 'source',
          color: themeFixturePalette.gray,
          notes: '/organism="Homo sapiens" /mol_type="genomic DNA" /db_xref="taxon:9606" /chromosome="12"',
          locations: [{ start: 0, end: 4, strand: 'forward' }],
        },
        {
          id: 'gene-as',
          name: 'LRP1-AS',
          type: 'gene',
          color: themeFixturePalette.green,
          notes: '/gene="LRP1-AS" /db_xref="GeneID:105751187"',
          locations: [{ start: 0, end: 1, strand: 'reverse' }],
        },
        {
          id: 'gene-mir',
          name: 'MIR1228',
          type: 'gene',
          color: themeFixturePalette.magenta,
          notes: '/gene="MIR1228" /db_xref="GeneID:100302201"',
          locations: [{ start: 2, end: 3, strand: 'forward' }],
        },
        {
          id: 'gene-lrp1',
          name: 'LRP1',
          type: 'gene',
          color: themeFixturePalette.blue,
          notes: '/gene="LRP1" /gene_synonym="A2MR; APOER; APR; CD91" /db_xref="GeneID:4035" /db_xref="HGNC:HGNC:6692"',
          locations: [{ start: 0, end: 4, strand: 'forward' }],
        },
      ],
    }))
    expect(eligibility).toMatchObject({
      eligible: true,
      queryText: '4035',
      organism: 'hg38',
      identity: { kind: 'entrez_gene', entrezId: '4035', symbol: 'LRP1' },
    })
  })

  it('does not pick a secondary RefSeqGene gene when the DEFINITION has no (SYMBOL), RefSeqGene match', () => {
    const eligibility = guideScanDesignEligibilityForRecord(baseRecord({
      name: 'NG_016444.2',
      description: 'Homo sapiens genomic region on chromosome 12 containing LRP1 and LRP1-AS',
      externalSource: {
        provider: 'ncbi',
        accession: 'NG_016444.2',
        database: 'nuccore',
        retrievedAt: new Date(0).toISOString(),
        sourceUrl: 'https://www.ncbi.nlm.nih.gov/nuccore/NG_016444.2',
      },
      features: [
        {
          id: 'gene-as',
          name: 'LRP1-AS',
          type: 'gene',
          color: themeFixturePalette.green,
          notes: '/gene="LRP1-AS" /db_xref="GeneID:105751187"',
          locations: [{ start: 0, end: 1, strand: 'reverse' }],
        },
        {
          id: 'gene-lrp1',
          name: 'LRP1',
          type: 'gene',
          color: themeFixturePalette.blue,
          notes: '/gene="LRP1" /db_xref="GeneID:4035"',
          locations: [{ start: 0, end: 4, strand: 'forward' }],
        },
      ],
    }))
    expect(eligibility.eligible).toBe(false)
  })

  it('does not treat GeneID mentioned only in free text as RefSeqGene identity', () => {
    const eligibility = guideScanDesignEligibilityForRecord(baseRecord({
      name: 'NG_016444.2',
      description: 'Homo sapiens LRP1 RefSeqGene; see also GeneID:4035 in documentation',
      externalSource: {
        provider: 'ncbi',
        accession: 'NG_016444.2',
        database: 'nuccore',
        retrievedAt: new Date(0).toISOString(),
        sourceUrl: 'https://www.ncbi.nlm.nih.gov/nuccore/NG_016444.2',
      },
      features: [{
        id: 'gene',
        name: 'LRP1',
        type: 'gene',
        color: themeFixturePalette.blue,
        notes: '/gene="LRP1" /note="LDL receptor related protein 1"',
        locations: [{ start: 0, end: 4, strand: 'forward' }],
      }],
    }))
    expect(eligibility.eligible).toBe(false)
    if (!eligibility.eligible) {
      expect(eligibility.reason).toMatch(/GeneID/i)
    }
  })

  it('accepts RefSeqGene NG_ opened from disk without externalSource', () => {
    const genbank = `LOCUS       NG_012741              120 bp    DNA     linear   PRI
DEFINITION  Homo sapiens very low density lipoprotein receptor (VLDLR),
            RefSeqGene on chromosome 9.
ACCESSION   NG_012741
VERSION     NG_012741.2
KEYWORDS    RefSeq; RefSeqGene.
SOURCE      Homo sapiens (human)
  ORGANISM  Homo sapiens
FEATURES             Location/Qualifiers
     source          1..120
                     /organism="Homo sapiens"
                     /mol_type="genomic DNA"
                     /db_xref="taxon:9606"
                     /chromosome="9"
     gene            complement(<1..40)
                     /gene="VLDLR-AS1"
                     /db_xref="GeneID:401491"
     gene            41..120
                     /gene="VLDLR"
                     /db_xref="GeneID:7436"
ORIGIN
        1 gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg
       61 gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg
//
`
    const record = normalizeSequenceRecord(parseSequenceFile(genbank, 'NG_012741.gb'))
    expect(record.externalSource).toBeUndefined()
    expect(record.construct?.accessionNumber).toBe('NG_012741')
    expect(guideScanDesignEligibilityForRecord(record)).toMatchObject({
      eligible: true,
      queryText: '7436',
      organism: 'hg38',
      identity: { kind: 'entrez_gene', entrezId: '7436', symbol: 'VLDLR' },
    })
  })

  it('accepts RefSeqGene NG_ records with legacy split GeneID qualifier notes', () => {
    const eligibility = guideScanDesignEligibilityForRecord(baseRecord({
      name: 'NG_012741.2',
      description: 'Homo sapiens very low density lipoprotein receptor (VLDLR), RefSeqGene on chromosome 9.',
      construct: { ...defaultConstructProperties, accessionNumber: 'NG_012741' },
      features: [{
        id: 'gene-vldlr',
        name: 'VLDLR',
        type: 'gene',
        color: themeFixturePalette.blue,
        notes: 'gene: VLDLR db_xref: MIM:192977 GeneID: 7436" HGNC: HGNC:12698',
        locations: [{ start: 40, end: 120, strand: 'forward' }],
      }],
    }))
    expect(eligibility).toMatchObject({
      eligible: true,
      queryText: '7436',
      identity: { kind: 'entrez_gene', entrezId: '7436', symbol: 'VLDLR' },
    })
  })

  function vldlrRefSeqGeneLostAccessionRecord(
    constructOverrides: Partial<typeof defaultConstructProperties> = {},
  ): SequenceRecord {
    return baseRecord({
      name: 'NG_012741.2',
      description: 'Homo sapiens very low density lipoprotein receptor (VLDLR), RefSeqGene on chromosome 9.',
      construct: {
        ...defaultConstructProperties,
        accessionNumber: '',
        syntheticDna: true,
        laboratoryHostOrganism: 'escherichia-coli',
        sourceOrganism: null,
        comments: 'NG_012741',
        ...constructOverrides,
      },
      features: [
        {
          id: 'src',
          name: 'source',
          type: 'source',
          color: themeFixturePalette.gray,
          notes: 'organism: Homo sapiens mol_type: genomic DNA db_xref: taxon:9606 chromosome: 9 map: 9p24.2 taxon: 9606',
          locations: [{ start: 0, end: 120, strand: 'forward' }],
        },
        {
          id: 'gene-vldlr-as1',
          name: 'VLDLR-AS1',
          type: 'gene',
          color: themeFixturePalette.blue,
          notes: 'gene: VLDLR-AS1 gene_synonym: linc-VLDLR; lincRNA-VLDLR note: VLDLR antisense RNA 1 db_xref: HGNC:HGNC:49621 GeneID: 401491" HGNC: HGNC:49621',
          locations: [{ start: 0, end: 40, strand: 'reverse' }],
        },
        {
          id: 'gene-vldlr',
          name: 'VLDLR',
          type: 'gene',
          color: themeFixturePalette.blue,
          notes: 'gene: VLDLR gene_synonym: CAMRQ1; CARMQ1; CHRMQ1; VLDL-R; VLDLRCH note: very low density lipoprotein receptor db_xref: MIM:192977 GeneID: 7436" HGNC: HGNC:12698" MIM: 192977',
          locations: [{ start: 40, end: 120, strand: 'forward' }],
        },
      ],
    })
  }

  it('accepts RefSeqGene-shaped records with no accession (legacy VLDLR save)', () => {
    const eligibility = guideScanDesignEligibilityForRecord(vldlrRefSeqGeneLostAccessionRecord())
    expect(eligibility).toMatchObject({
      eligible: true,
      queryText: '7436',
      organism: 'hg38',
      identity: { kind: 'entrez_gene', entrezId: '7436', symbol: 'VLDLR' },
    })
  })

  it('rejects RefSeqGene-shaped records when construct carries a non-NG accession', () => {
    const eligibility = guideScanDesignEligibilityForRecord(vldlrRefSeqGeneLostAccessionRecord({
      accessionNumber: 'NM_001018056',
    }))
    expect(eligibility.eligible).toBe(false)
  })
})

describe('RefSeqGene NG_012741 export round trip', () => {
  // @vitest-environment jsdom
  const ng012741Genbank = `LOCUS       NG_012741              120 bp    DNA     linear   PRI
DEFINITION  Homo sapiens very low density lipoprotein receptor (VLDLR),
            RefSeqGene on chromosome 9.
ACCESSION   NG_012741
VERSION     NG_012741.2
KEYWORDS    RefSeq; RefSeqGene.
SOURCE      Homo sapiens (human)
  ORGANISM  Homo sapiens
FEATURES             Location/Qualifiers
     source          1..120
                     /organism="Homo sapiens"
                     /mol_type="genomic DNA"
                     /db_xref="taxon:9606"
                     /chromosome="9"
     gene            complement(<1..40)
                     /gene="VLDLR-AS1"
                     /db_xref="GeneID:401491"
     gene            41..120
                     /gene="VLDLR"
                     /gene_synonym="CAMRQ1"
                     /note="very low density lipoprotein receptor"
                     /db_xref="GeneID:7436"
                     /db_xref="HGNC:HGNC:12698"
                     /db_xref="MIM:192977"
ORIGIN
        1 gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg
       61 gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg
//
`

  beforeAll(async () => {
    const { initSnapGeneLzma } = await import('../snapgeneLzma')
    await initSnapGeneLzma()
  })

  function vldlrDbXrefs(record: SequenceRecord) {
    const gene = record.features.find((feature) => (
      feature.type.toLowerCase() === 'gene'
      && featureQualifierValues(parseFeatureQualifiers(feature.notes).gene)[0] === 'VLDLR'
    ))
    expect(gene).toBeDefined()
    return featureQualifierValues(parseFeatureQualifiers(gene!.notes).db_xref)
  }

  it('stays GuideScan-eligible after SnapGene and GenBank round trips', () => {
    const original = normalizeSequenceRecord(parseSequenceFile(ng012741Genbank, 'NG_012741.gb'))
    const expectedDbXrefs = ['GeneID:7436', 'HGNC:HGNC:12698', 'MIM:192977']

    for (const reopened of [
      normalizeSequenceRecord(parseSnapGene(exportSnapGene(original, defaultSnapGeneExportOptions()), 'NG_012741.dna')),
      normalizeSequenceRecord(parseGenBank(exportGenBank(original), 'NG_012741.gb')),
    ]) {
      expect(vldlrDbXrefs(reopened)).toEqual(expectedDbXrefs)
      expect(guideScanDesignEligibilityForRecord(reopened)).toMatchObject({
        eligible: true,
        queryText: '7436',
        organism: 'hg38',
        identity: { kind: 'entrez_gene', entrezId: '7436', symbol: 'VLDLR' },
      })
    }
  })
})

describe('GuideScan Entrez gene autocomplete (mocked NCBI)', () => {
  it('resolves numeric Entrez IDs via NCBI uid search', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const requested = new URL(String(input))
      if (requested.pathname.endsWith('/esearch.fcgi') && requested.searchParams.get('db') === 'gene') {
        const term = requested.searchParams.get('term') ?? ''
        expect(term).toContain('7157[uid]')
        expect(term).toContain('txid9606[Organism:exp]')
        return jsonResponse({ esearchresult: { count: '1', idlist: ['7157'] } })
      }
      if (requested.pathname.endsWith('/esummary.fcgi') && requested.searchParams.get('db') === 'gene') {
        return jsonResponse({
          result: {
            uids: ['7157'],
            7157: {
              uid: '7157',
              name: 'TP53',
              description: 'tumor protein p53',
              organism: { scientificname: 'Homo sapiens', taxid: 9606 },
            },
          },
        })
      }
      throw new Error(String(input))
    }))

    const suggestions = await autocompleteGuideScanGenes('hg38', '7157')
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      symbol: 'TP53',
      entrezId: '7157',
      exactSymbolMatch: true,
    })
  })

  it('resolves numeric Entrez IDs via esummary when autocomplete is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const requested = new URL(String(input))
      if (requested.pathname.endsWith('/esearch.fcgi')) {
        return jsonResponse({ esearchresult: { count: '0', idlist: [] } })
      }
      if (requested.pathname.endsWith('/esummary.fcgi') && requested.searchParams.get('db') === 'gene') {
        return jsonResponse({
          result: {
            uids: ['7157'],
            7157: {
              uid: '7157',
              name: 'TP53',
              description: 'tumor protein p53',
              organism: { scientificname: 'Homo sapiens', taxid: 9606 },
            },
          },
        })
      }
      throw new Error(String(input))
    }))

    const resolved = await resolveGuideScanGeneSymbol('hg38', '7157')
    expect(resolved).toMatchObject({
      symbol: 'TP53',
      entrezId: '7157',
      exactSymbolMatch: true,
    })
    const prepared = await prepareGuideScanDesignRequest({
      organism: 'hg38',
      enzyme: 'cas9',
      kind: 'gene',
      geneName: '7157',
    })
    expect(prepared.queryText).toBe('7157')
    expect(prepared.resolvedGene?.symbol).toBe('TP53')
  })
})

describe('GuideScan2 result normalization', () => {
  it('normalizes the live guidescan-web [[region, guides]] JSON shape', () => {
    const result = normalizeGuideScanResultJson([[
      {
        'region-name': 'BRCA1',
        'chromosome-name': 'chr17',
        coords: ['NC_000017.11', 43044295, 43125364],
        organism: 'hg38',
      },
      [{
        sequence: 'GCGTAAGGCGTTGTGAACCCNGG',
        start: 43125122,
        end: 43125144,
        direction: 'positive',
        organism: 'hg38',
        specificity: 0.9,
        'cutting-efficiency': 0.5,
        annotations: ['exon'],
        'distance-0-off-targets': 1,
        'distance-1-off-targets': 0,
        'distance-2-off-targets': 1,
        'distance-3-off-targets': 2,
        'distance-4-off-targets': 40,
        'off-target-summary': { 2: 1, 3: 2, 4: 40 },
        'off-targets': [{
          position: 29241172,
          chromosome: '2',
          direction: 'positive',
          distance: 2,
          accession: 'NC_000002.12',
        }],
      }],
    ]], { jobId: 'job-1', organism: 'hg38', enzyme: 'cas9', resultType: 'standard' })

    expect(result.guides).toHaveLength(1)
    expect(result.guides[0]).toMatchObject({
      rank: 1,
      regionName: 'BRCA1',
      chromosome: 'chr17',
      start: 43125122,
      end: 43125144,
      strand: 'forward',
      sequence: 'GCGTAAGGCGTTGTGAACCCNGG',
      spacer: 'GCGTAAGGCGTTGTGAACCC',
      pam: 'NGG',
      specificity: 0.9,
      cuttingEfficiency: 0.5,
      enzyme: 'cas9',
      offTargetCounts: {
        distance0: 1,
        distance1: 0,
        distance2: 1,
        distance3: 2,
        distance4: 40,
      },
    })
    expect(result.guides[0]!.offTargets[0]).toMatchObject({
      chromosome: '2',
      distance: 2,
      direction: 'forward',
    })
  })

  it('splits cpf1 PAM on the 5′ side', () => {
    const result = normalizeGuideScanResultJson([[
      {
        'region-name': 'region',
        'chromosome-name': 'chr1',
        coords: ['chr1', 1, 100],
        organism: 'hg38',
      },
      [{
        sequence: 'TTTNACGTACGTACGTACGTAC',
        start: 10,
        end: 32,
        direction: 'negative',
      }],
    ]], { jobId: 'j', organism: 'hg38', enzyme: 'cpf1' })

    expect(result.guides[0]).toMatchObject({
      pam: 'TTTN',
      spacer: 'ACGTACGTACGTACGTAC',
      strand: 'reverse',
    })
  })
})

describe('GuideScan2 HTTP client (mocked)', () => {
  it('loads supported organism/enzyme pairs from /info/supported', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('/info/supported')
      return jsonResponse({
        version: '1.0',
        'cli-version': 'v2.1.8',
        available: [
          { organism: 'hg38', enzyme: 'cas9' },
          { organism: 'hg38', enzyme: 'cpf1' },
          { organism: 'mm39', enzyme: 'cas9' },
        ],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const info = await fetchGuideScanSupported({ baseUrl: 'https://guidescan.test/backend' })
    expect(info.organisms).toEqual(['hg38', 'mm39'])
    expect(info.enzymes).toEqual(['cas9', 'cpf1'])
    expect(info.available).toHaveLength(3)
  })

  it('submits multipart query and returns job-id', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      expect(init?.body).toBeInstanceOf(FormData)
      const body = init?.body as FormData
      expect(body.get('query-text')).toBe('chr17:100-200')
      expect(body.get('topn')).toBe('5')
      return jsonResponse({ 'job-id': 'abc-123' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const submitted = await submitGuideScanQuery({
      organism: 'hg38',
      enzyme: 'cas9',
      kind: 'coordinates',
      coordinates: { chromosome: 'chr17', start: 100, end: 200 },
      topN: 5,
    }, { baseUrl: 'https://guidescan.test/backend' })

    expect(submitted.jobId).toBe('abc-123')
  })

  it('polls until completed, then designGuidesWithGuideScan returns normalized guides', async () => {
    vi.useFakeTimers()
    let statusCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/query') && init?.method === 'POST') {
        return jsonResponse({ 'job-id': 'job-42' })
      }
      if (url.includes('/job/status/job-42')) {
        statusCalls += 1
        if (statusCalls < 3) return jsonResponse({ 'job-status': 'pending', failure: null })
        return jsonResponse({ 'job-status': 'completed', 'result-type': 'standard', failure: null })
      }
      if (url.includes('/job/result/json/job-42')) {
        return jsonResponse([[
          {
            'region-name': 'chr17:100-200',
            'chromosome-name': 'chr17',
            coords: ['chr17', 100, 200],
            organism: 'hg38',
          },
          [{
            sequence: 'ACTGCCCTTGCACACTGGGGNGG',
            start: 150,
            end: 172,
            direction: 'positive',
            specificity: 0.2,
            'cutting-efficiency': 0.4,
            annotations: [],
            'distance-0-off-targets': 1,
            'distance-1-off-targets': 0,
            'distance-2-off-targets': 0,
            'distance-3-off-targets': 0,
            'distance-4-off-targets': 0,
            'off-targets': [],
          }],
        ]])
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const pending = designGuidesWithGuideScan({
      organism: 'hg38',
      enzyme: 'cas9',
      kind: 'coordinates',
      coordinates: { chromosome: 'chr17', start: 100, end: 200 },
      topN: 2,
    }, {
      baseUrl: 'https://guidescan.test/backend',
      pollIntervalMs: 100,
      resolveGeneSymbol: false,
    })

    await vi.advanceTimersByTimeAsync(500)
    const result = await pending
    expect(result.jobId).toBe('job-42')
    expect(result.guides[0]?.spacer).toBe('ACTGCCCTTGCACACTGGGG')
    expect(statusCalls).toBeGreaterThanOrEqual(3)
  })

  it('surfaces job failure messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      'job-status': 'failed',
      failure: 'Region too large',
    })))

    await expect(pollGuideScanJob('bad', {
      baseUrl: 'https://guidescan.test/backend',
      pollIntervalMs: 10,
      overallTimeoutMs: 1000,
    })).rejects.toMatchObject({ code: 'job_failed', message: 'Region too large' })
  })

  it('honours AbortSignal cancellation while polling', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ 'job-status': 'pending', failure: null })))

    const pending = pollGuideScanJob('slow', {
      baseUrl: 'https://guidescan.test/backend',
      pollIntervalMs: 20,
      overallTimeoutMs: 10_000,
      signal: controller.signal,
    })
    const assertion = expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    controller.abort()
    await assertion
  })
})

describe('GuideScan gene autocomplete via Ensembl (mocked)', () => {
  it('ranks exact canonical symbols first', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/xrefs/symbol/')) {
        return jsonResponse([
          { id: 'ENSG1', display_id: 'BRCA1' },
          { id: 'ENSG2', display_id: 'BRCA1P1' },
        ])
      }
      if (url.includes('/lookup/id/ENSG1')) {
        return jsonResponse({
          id: 'ENSG1',
          display_name: 'BRCA1',
          description: 'BRCA1 DNA repair associated',
          object_type: 'Gene',
          species: 'homo_sapiens',
          assembly_name: 'GRCh38',
        })
      }
      if (url.includes('/lookup/id/ENSG2')) {
        return jsonResponse({
          id: 'ENSG2',
          display_name: 'BRCA1P1',
          description: 'BRCA1 pseudogene 1',
          object_type: 'Gene',
          species: 'homo_sapiens',
        })
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const suggestions = await autocompleteGuideScanGenes('hg38', 'BRCA1')
    expect(suggestions[0]).toMatchObject({ symbol: 'BRCA1', exactSymbolMatch: true, ensemblId: 'ENSG1' })
    expect(suggestions.some((entry) => entry.symbol === 'BRCA1P1')).toBe(true)
  })

  it('drops LRG xref ids and dedupes symbol matches to one Ensembl gene', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/xrefs/symbol/')) {
        return jsonResponse([
          { id: 'ENSG00000012048', type: 'gene' },
          { type: 'gene', id: 'LRG_292' },
        ])
      }
      if (url.includes('/lookup/id/ENSG00000012048')) {
        return jsonResponse({
          id: 'ENSG00000012048',
          display_name: 'BRCA1',
          description: 'BRCA1 DNA repair associated',
          object_type: 'Gene',
          species: 'homo_sapiens',
          assembly_name: 'GRCh38',
        })
      }
      if (url.includes('/lookup/id/LRG_292')) {
        return jsonResponse({
          id: 'LRG_292',
          display_name: 'BRCA1',
          description: 'BRCA1 LRG',
          object_type: 'Gene',
          species: 'homo_sapiens',
        })
      }
      throw new Error(url)
    }))

    const suggestions = await autocompleteGuideScanGenes('hg38', 'BRCA1')
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      symbol: 'BRCA1',
      ensemblId: 'ENSG00000012048',
      exactSymbolMatch: true,
    })
  })

  it('falls back to NCBI Gene when Ensembl autocomplete fails', async () => {
    const notes: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const requested = new URL(String(input))
      if (requested.host.includes('rest.ensembl.org')) {
        return new Response('Internal Server Error', { status: 500 })
      }
      if (requested.pathname.endsWith('/esearch.fcgi') && requested.searchParams.get('db') === 'gene') {
        expect(requested.searchParams.get('term')).toContain('LDLR')
        return jsonResponse({ esearchresult: { count: '1', idlist: ['3949'] } })
      }
      if (requested.pathname.endsWith('/esummary.fcgi') && requested.searchParams.get('db') === 'gene') {
        return jsonResponse({
          result: {
            uids: ['3949'],
            3949: {
              uid: '3949',
              name: 'LDLR',
              description: 'low density lipoprotein receptor',
              organism: { scientificname: 'Homo sapiens', taxid: 9606 },
            },
          },
        })
      }
      throw new Error(String(input))
    }))

    const result = await autocompleteGuideScanGenesDetailed('hg38', 'LDLR', {
      onSourceNote: (note) => notes.push(note),
    })
    expect(result.source).toBe('ncbi')
    expect(result.suggestions[0]).toMatchObject({
      symbol: 'LDLR',
      entrezId: '3949',
      exactSymbolMatch: true,
    })
    expect(result.note).toMatch(/Ensembl unavailable \(.*\); showing NCBI Gene results/)
    expect(notes.some((note) => note.includes('trying NCBI'))).toBe(true)
  })

  it('reports both failures when Ensembl and NCBI autocomplete fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const requested = new URL(String(input))
      if (requested.host.includes('rest.ensembl.org')) {
        return new Response('Internal Server Error', { status: 500 })
      }
      if (requested.pathname.endsWith('/esearch.fcgi')) {
        return Promise.reject(new Error('NCBI esearch offline'))
      }
      throw new Error(String(input))
    }))

    await expect(autocompleteGuideScanGenes('hg38', 'LDLR')).rejects.toMatchObject({
      message: expect.stringMatching(/Gene suggestions failed — Ensembl:.*NCBI:.*NCBI esearch offline/s),
    })
  })

  it('requires an exact canonical name when multiple partial matches exist', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/xrefs/symbol/')) {
        return jsonResponse([{ id: 'ENSG1' }, { id: 'ENSG2' }])
      }
      if (url.includes('/lookup/id/ENSG1')) {
        return jsonResponse({ id: 'ENSG1', display_name: 'CDK1', object_type: 'Gene', species: 'homo_sapiens' })
      }
      return jsonResponse({ id: 'ENSG2', display_name: 'CDK11A', object_type: 'Gene', species: 'homo_sapiens' })
    }))

    await expect(resolveGuideScanGeneSymbol('hg38', 'CDK'))
      .rejects.toMatchObject({ code: 'invalid_request' })
  })

  it('fetches an Ensembl genomic SequenceRecord for gene-name mode', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/xrefs/symbol/')) return jsonResponse([{ id: 'ENSG00000139618' }])
      if (url.includes('/lookup/id/')) {
        return jsonResponse({
          id: 'ENSG00000139618',
          display_name: 'BRCA2',
          description: 'BRCA2 DNA repair associated',
          object_type: 'Gene',
          species: 'homo_sapiens',
          assembly_name: 'GRCh38',
          start: 1,
          end: 12,
          strand: 1,
          seq_region_name: '13',
        })
      }
      if (url.includes('/sequence/id/')) {
        return jsonResponse({ id: 'ENSG00000139618', seq: 'ATGCATGCATGC', molecule: 'dna' })
      }
      throw new Error(url)
    }))

    const { fetchGuideScanGeneSequence } = await import('./gene')
    const opened = await fetchGuideScanGeneSequence('hg38', 'BRCA2')
    expect(opened.suggestion.symbol).toBe('BRCA2')
    expect(opened.record.sequence).toBe('ATGCATGCATGC')
    expect(opened.record.molecule).toBe('dna')
    expect(opened.record.externalSource?.provider).toBe('ensembl')
  })

  function ncbiGeneJson(input: RequestInfo | URL) {
    const requested = new URL(String(input))
    const database = requested.searchParams.get('db')
    if (requested.pathname.endsWith('/esearch.fcgi') && database === 'gene') {
      const term = requested.searchParams.get('term') ?? ''
      const officialOnly = /\[Gene Name\]/.test(term) && !/\[All Fields\]/.test(term)
      if (!/LRP1/i.test(term)) return jsonResponse({ esearchresult: { count: '0', idlist: [] } })
      if (officialOnly) return jsonResponse({ esearchresult: { count: '1', idlist: ['4035'] } })
      return jsonResponse({ esearchresult: { count: '2', idlist: ['10438', '4035'] } })
    }
    if (requested.pathname.endsWith('/esummary.fcgi') && database === 'gene') {
      const ids = (requested.searchParams.get('id') ?? '').split(',').filter(Boolean)
      const rows: Record<string, unknown> = {
        10438: {
          uid: '10438',
          name: 'C1D',
          description: 'C1D nuclear receptor corepressor',
          chromosome: '2',
          otheraliases: 'LRP1, SUNCOR, hC1D',
          organism: { scientificname: 'Homo sapiens', taxid: 9606 },
        },
        4035: {
          uid: '4035',
          name: 'LRP1',
          description: 'LDL receptor related protein 1',
          chromosome: '12',
          organism: { scientificname: 'Homo sapiens', taxid: 9606 },
        },
      }
      const uids = ids.filter((id) => id in rows)
      return jsonResponse({
        result: {
          uids,
          ...Object.fromEntries(uids.map((id) => [id, rows[id]])),
        },
      })
    }
    return null
  }

  it('resolves exact symbol LRP1 to Entrez 4035 and does not take the C1D alias', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const ncbi = ncbiGeneJson(input)
      if (ncbi) return ncbi
      if (url.includes('/xrefs/symbol/')) return jsonResponse([{ id: 'ENSG00000123384' }])
      if (url.includes('/lookup/id/')) {
        return jsonResponse({
          id: 'ENSG00000123384',
          display_name: 'LRP1',
          description: 'LDL receptor related protein 1',
          object_type: 'Gene',
          species: 'homo_sapiens',
          assembly_name: 'GRCh38',
          seq_region_name: '12',
          start: 57128483,
          end: 57213361,
          strand: 1,
        })
      }
      throw new Error(url)
    }))

    const resolved = await resolveGuideScanGeneSymbol('hg38', 'LRP1')
    expect(resolved).toMatchObject({
      symbol: 'LRP1',
      ensemblId: 'ENSG00000123384',
      exactSymbolMatch: true,
      entrezId: '4035',
    })
    expect(resolved.symbol).not.toBe('C1D')
  })

  it('submits GuideScan query-text as Entrez 4035 while opening the NCBI LRP1 gene region', async () => {
    let submittedQueryText = ''
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const requested = url.startsWith('http') ? new URL(url) : null
      if (requested?.pathname.endsWith('/elink.fcgi')) return emptyRefSeqGeneElinkResponse()
      if (requested?.pathname.endsWith('/esummary.fcgi')
        && requested.searchParams.get('db') === 'gene'
        && requested.searchParams.get('id') === '4035') {
        return ncbiGeneRegionSummaryResponse('4035', {
          symbol: 'LRP1',
          description: 'LDL receptor related protein 1',
          chraccver: 'NC_000012.12',
          chrstart: 100,
          chrstop: 111,
        })
      }
      const ncbi = ncbiGeneJson(input)
      if (ncbi) return ncbi
      if (requested?.pathname.endsWith('/efetch.fcgi') && requested.searchParams.get('db') === 'nuccore') {
        return textResponse(minimalGenbank('ATGCATGCATGC', 'NC_000012.12'))
      }
      if (url.includes('/xrefs/symbol/')) return jsonResponse([{ id: 'ENSG00000123384' }])
      if (url.includes('/lookup/id/')) {
        return jsonResponse({
          id: 'ENSG00000123384',
          display_name: 'LRP1',
          description: 'LDL receptor related protein 1',
          object_type: 'Gene',
          species: 'homo_sapiens',
          assembly_name: 'GRCh38',
          seq_region_name: '12',
          start: 57128483,
          end: 57213361,
          strand: 1,
        })
      }
      if (url.endsWith('/query') && init?.method === 'POST') {
        submittedQueryText = String((init.body as FormData).get('query-text') ?? '')
        return jsonResponse({ 'job-id': 'job-lrp1' })
      }
      throw new Error(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const prepared = await prepareGuideScanDesignRequest({
      organism: 'hg38',
      enzyme: 'cas9',
      kind: 'gene',
      geneName: 'LRP1',
    })
    expect(prepared.geneName).toBe('LRP1')
    expect(prepared.queryText).toBe('4035')
    expect(prepared.resolvedGene).toMatchObject({ symbol: 'LRP1', entrezId: '4035', ensemblId: 'ENSG00000123384' })
    expect(guideScanGeneFetchUsesNcbiFirst('hg38', prepared.resolvedGene)).toBe(true)

    await startGuideScanDesign({
      organism: 'hg38',
      enzyme: 'cas9',
      kind: 'gene',
      geneName: 'LRP1',
    }, { baseUrl: 'https://guidescan.test/backend' })
    expect(submittedQueryText).toBe('4035')

    const opened = await fetchGuideScanGeneSequence('hg38', 'LRP1', { resolved: prepared.resolvedGene })
    expect(opened.suggestion.symbol).toBe('LRP1')
    expect(opened.suggestion.entrezId).toBe('4035')
    expect(opened.record.name).toBe('LRP1')
    expect(opened.record.externalSource).toMatchObject({
      provider: 'ncbi',
      database: 'gene',
      accession: '4035',
      assembly: 'GRCh38',
    })
    expect(opened.record.dna?.genomicAnchor).toMatchObject({
      chromosome: 'chr12',
      start: 101,
      end: 112,
      strand: 'forward',
    })
  })

  it('maps RefSeq accessions to GuideScan chromosome names', () => {
    expect(chromosomeFromRefSeqAccession('NC_000067.7')).toBe('chr1')
    expect(chromosomeFromRefSeqAccession('NC_000086.8')).toBe('chrX')
    expect(chromosomeFromRefSeqAccession('NC_012920.1')).toBe('chrM')
    expect(chromosomeFromRefSeqAccession('NC_000030.1')).toBeNull()
  })

  it('falls back to Ensembl when NCBI RefSeq accession is unrecognized', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const requested = url.startsWith('http') ? new URL(url) : null
      if (requested?.pathname.endsWith('/esummary.fcgi')
        && requested.searchParams.get('db') === 'gene'
        && requested.searchParams.get('id') === '99999') {
        return ncbiGeneRegionSummaryResponse('99999', {
          symbol: 'TESTGENE',
          description: 'test',
          chraccver: 'NC_000030.1',
          chrstart: 1,
          chrstop: 20,
        })
      }
      if (url.includes('/xrefs/symbol/')) return jsonResponse([{ id: 'ENSG00000000001' }])
      if (url.includes('/lookup/id/')) {
        return jsonResponse({
          id: 'ENSG00000000001',
          display_name: 'TESTGENE',
          object_type: 'Gene',
          species: 'homo_sapiens',
          assembly_name: 'GRCh38',
          seq_region_name: '1',
          start: 1,
          end: 12,
          strand: 1,
        })
      }
      if (url.includes('/sequence/id/')) {
        return jsonResponse({ id: 'ENSG00000000001', seq: 'ATGCATGCATGC', molecule: 'dna' })
      }
      throw new Error(url)
    }))

    const opened = await fetchGuideScanGeneSequence('hg38', 'TESTGENE', {
      resolved: {
        symbol: 'TESTGENE',
        ensemblId: 'ENSG00000000001',
        description: '',
        species: 'homo_sapiens',
        exactSymbolMatch: true,
        entrezId: '99999',
      },
    })
    expect(opened.record.externalSource?.provider).toBe('ensembl')
    expect(opened.record.dna?.genomicAnchor?.chromosome).toBe('chr1')
  })

  it('loads minus-strand NCBI gene regions with reverse genomic anchors and eligibility', async () => {
    const prefix = 'A'.repeat(50)
    const guide = 'ACTGCCCTTGCACACTGGGG'
    const suffix = 'AGG' + 'T'.repeat(28)
    const sequence = prefix + guide + suffix
    expect(sequence.length).toBe(101)
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const requested = new URL(String(input))
      if (requested.pathname.endsWith('/esummary.fcgi') && requested.searchParams.get('db') === 'gene') {
        return ncbiGeneRegionSummaryResponse('7157', {
          symbol: 'TP53',
          description: 'tumor protein p53',
          chraccver: 'NC_000017.11',
          chrstart: 150,
          chrstop: 50,
        })
      }
      if (requested.pathname.endsWith('/efetch.fcgi') && requested.searchParams.get('db') === 'nuccore') {
        expect(requested.searchParams.get('seq_start')).toBe('51')
        expect(requested.searchParams.get('seq_stop')).toBe('151')
        expect(requested.searchParams.get('strand')).toBe('2')
        return textResponse(minimalGenbank(sequence))
      }
      throw new Error(String(input))
    }))

    const record = await fetchNcbiGeneRegionRecord('hg38', '7157', { includeAnnotations: false })
    expect(record.name).toBe('TP53')
    expect(record.externalSource).toMatchObject({ provider: 'ncbi', database: 'gene', accession: '7157' })
    expect(record.dna?.genomicAnchor).toEqual({
      organism: 'hg38',
      chromosome: 'chr17',
      start: 51,
      end: 151,
      strand: 'reverse',
    })
    expect(guideScanDesignEligibilityForRecord(record)).toMatchObject({
      eligible: true,
      organism: 'hg38',
      queryText: '7157',
    })

    const anchorEnd = 151
    const guideStartIndex = prefix.length
    const genomicGuideStart = anchorEnd - guideStartIndex
    const candidate = {
      id: 'tp53-reverse',
      rank: 1,
      regionName: 'TP53',
      organism: 'hg38',
      enzyme: 'cas9',
      chromosome: 'chr17',
      start: genomicGuideStart - (guide.length + suffix.slice(0, 3).length - 1),
      end: genomicGuideStart,
      strand: 'reverse' as const,
      sequence: `${guide}NGG`,
      spacer: guide,
      pam: 'NGG',
      specificity: 0.5,
      cuttingEfficiency: 0.5,
      annotations: [],
      offTargetCounts: { distance0: 0, distance1: 0, distance2: 0, distance3: 0, distance4: 0 },
      offTargets: [],
    }
    const hit = mapGuideScanCandidateToHit(candidate, record, 'cas9')
    expect(hit?.guideStart).toBe(guideStartIndex)
  })

  it('maps minus-strand GuideScan hits on RefSeqGene-oriented records without a genomic anchor', () => {
    const prefix = 'A'.repeat(50)
    const guide = 'ACTGCCCTTGCACACTGGGG'
    const suffix = 'AGG' + 'T'.repeat(127)
    const record = normalizeSequenceRecord({
      ...baseRecord({ sequence: prefix + guide + suffix }),
      description: 'Homo sapiens TP53 (TP53), RefSeqGene on chromosome 17.',
      construct: {
        ...defaultConstructProperties,
        accessionNumber: 'NG_017013',
        sourceOrganism: 'homo-sapiens',
      },
    })
    expect(record.dna?.genomicAnchor).toBeUndefined()
    const guideStartIndex = prefix.length
    const candidate = {
      id: 'tp53-reverse-unanchored',
      rank: 1,
      regionName: 'TP53',
      organism: 'hg38',
      enzyme: 'cas9',
      chromosome: 'chr17',
      start: 100,
      end: 122,
      strand: 'reverse' as const,
      sequence: `${guide}NGG`,
      spacer: guide,
      pam: 'NGG',
      specificity: 0.5,
      cuttingEfficiency: 0.5,
      annotations: [],
      offTargetCounts: { distance0: 0, distance1: 0, distance2: 0, distance3: 0, distance4: 0 },
      offTargets: [],
    }
    const hit = mapGuideScanCandidateToHit(candidate, record, 'cas9')
    expect(hit?.guideStart).toBe(guideStartIndex)
    expect(hit?.strand).toBe('forward')
  })

  describe('RefSeqGene anchoring helpers', () => {
    it('maps FASTA window indices to genomic coordinates on both strands', () => {
      expect(ncbiFastaWindowIndexToGenomic(100, 200, 10, 'forward')).toBe(110)
      expect(ncbiFastaWindowIndexToGenomic(100, 200, 10, 'reverse')).toBe(190)
    })

    it('builds forward and reverse anchors when span length matches the record', () => {
      expect(genomicAnchorFromRefSeqGeneEnds('hg38', 'chr17', 100, 1000, 1099)).toEqual({
        organism: 'hg38',
        chromosome: 'chr17',
        start: 1000,
        end: 1099,
        strand: 'forward',
      })
      expect(genomicAnchorFromRefSeqGeneEnds('hg38', 'chr17', 100, 1099, 1000)).toEqual({
        organism: 'hg38',
        chromosome: 'chr17',
        start: 1000,
        end: 1099,
        strand: 'reverse',
      })
    })

    it('returns null when genomic span length does not match the record', () => {
      expect(genomicAnchorFromRefSeqGeneEnds('hg38', 'chr17', 100, 1000, 1098)).toBeNull()
    })

    it('requires a unique substring match', () => {
      expect(uniqueDnaSubstringIndex('AAATTTAAATTT', 'AAA')).toBeNull()
      expect(uniqueDnaSubstringIndex('XXAAATTTYYY', 'AAA')).toBe(2)
    })

    it('anchors TP53 NG_017013.2 using the 3′ probe last base on minus strand', async () => {
      const ngLength = 32_772
      const fivePrimeProbe = `TP53FIVE${'A'.repeat(42)}`
      const threePrimeProbe = `TP53THREE${'C'.repeat(41)}`
      const ngSequence = `${fivePrimeProbe}${'G'.repeat(ngLength - 100)}${threePrimeProbe}`
      expect(ngSequence.length).toBe(ngLength)

      const fiveWindow = { start: 7_662_490, end: 7_712_490 }
      const threeWindow = { start: 7_643_421, end: 7_693_421 }
      const fiveProbeIndex = 19_940
      const threeProbeStartIndex = 33_593

      function embedProbe(windowLength: number, index: number, probe: string): string {
        const windowSeq = 'T'.repeat(windowLength)
        return `${windowSeq.slice(0, index)}${probe}${windowSeq.slice(index + probe.length)}`
      }

      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const requested = new URL(String(input))
        if (requested.pathname.endsWith('/efetch.fcgi') && requested.searchParams.get('rettype') === 'fasta') {
          const seqStart = Number(requested.searchParams.get('seq_start'))
          const seqStop = Number(requested.searchParams.get('seq_stop'))
          expect(requested.searchParams.get('strand')).toBe('2')
          const len = seqStop - seqStart + 1
          if (seqStart === fiveWindow.start && seqStop === fiveWindow.end) {
            return textResponse(fastaResponse(embedProbe(len, fiveProbeIndex, fivePrimeProbe)))
          }
          if (seqStart === threeWindow.start && seqStop === threeWindow.end) {
            return textResponse(fastaResponse(embedProbe(len, threeProbeStartIndex, threePrimeProbe)))
          }
          throw new Error(`unexpected fasta window: ${requested.href}`)
        }
        throw new Error(String(input))
      }))

      const summary = {
        geneId: '7157',
        symbol: 'TP53',
        description: 'tumor protein p53',
        chraccver: 'NC_000017.11',
        chrstart: 7_687_489,
        chrstop: 7_668_420,
        assemblyaccver: 'GRCh38',
      }
      const anchor = await anchorRefSeqGeneOnReference(summary, ngSequence, 'hg38')
      expect(anchor).toEqual({
        organism: 'hg38',
        chromosome: 'chr17',
        start: 7_659_779,
        end: 7_692_550,
        strand: 'reverse',
      })
    })
  })

  it('prefers anchored RefSeqGene over the NC_ gene region when elink resolves', async () => {
    const prefix = 'G'.repeat(50)
    const guide = 'ACTGCCCTTGCACACTGGGG'
    const suffix = 'AGG' + 'T'.repeat(28)
    const sequence = prefix + guide + suffix
    expect(sequence.length).toBe(101)
    const fivePrimeGenomic = 151
    const threePrimeGenomic = 51
    const fiveWindowEnd = fivePrimeGenomic + 25_000
    const threeWindowEnd = threePrimeGenomic + 25_000

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const requested = new URL(String(input))
      if (requested.pathname.endsWith('/elink.fcgi')) {
        return jsonResponse({
          linksets: [{
            linksetdbs: [{ linkname: 'gene_nuccore_refseqgene', links: ['383209646'] }],
          }],
        })
      }
      if (requested.pathname.endsWith('/esummary.fcgi') && requested.searchParams.get('db') === 'gene') {
        return ncbiGeneRegionSummaryResponse('7157', {
          symbol: 'TP53',
          description: 'tumor protein p53',
          chraccver: 'NC_000017.11',
          chrstart: 150,
          chrstop: 50,
        })
      }
      if (requested.pathname.endsWith('/efetch.fcgi') && requested.searchParams.get('db') === 'nuccore') {
        const rettype = requested.searchParams.get('rettype')
        if (rettype === 'gbwithparts' && requested.searchParams.get('id') === '383209646') {
          return textResponse(refSeqGeneGenbank(sequence, {
            symbol: 'TP53',
            entrezId: '7157',
            geneStart: prefix.length + 1,
            geneEnd: prefix.length + guide.length,
          }))
        }
        if (rettype === 'fasta') {
          const seqStart = Number(requested.searchParams.get('seq_start'))
          const seqStop = Number(requested.searchParams.get('seq_stop'))
          expect(requested.searchParams.get('strand')).toBe('2')
          const len = seqStop - seqStart + 1
          let windowSeq = 'N'.repeat(len)
          if (seqStop === fiveWindowEnd) {
            const insertAt = seqStop - fivePrimeGenomic
            windowSeq = `${windowSeq.slice(0, insertAt)}${sequence.slice(0, 50)}${windowSeq.slice(insertAt + 50)}`
          } else if (seqStop === threeWindowEnd) {
            const lastBaseIndex = seqStop - threePrimeGenomic
            const insertAt = lastBaseIndex - 49
            windowSeq = `${windowSeq.slice(0, insertAt)}${sequence.slice(-50)}${windowSeq.slice(insertAt + 50)}`
          } else {
            throw new Error(`unexpected fasta window: ${requested.href}`)
          }
          return textResponse(fastaResponse(windowSeq))
        }
        throw new Error(`unexpected nuccore efetch: ${requested.href}`)
      }
      throw new Error(String(input))
    }))

    const opened = await fetchGuideScanGeneSequence('hg38', '7157', {
      resolved: {
        symbol: 'TP53',
        ensemblId: '',
        description: '',
        species: 'Homo sapiens',
        exactSymbolMatch: true,
        entrezId: '7157',
      },
    })
    expect(opened.record.externalSource?.accession).toMatch(/^NG_/)
    expect(opened.record.features.some((feature) => feature.type.toLowerCase() === 'gene')).toBe(true)
    expect(opened.record.dna?.genomicAnchor).toEqual({
      organism: 'hg38',
      chromosome: 'chr17',
      start: 51,
      end: 151,
      strand: 'reverse',
    })
    expect(guideScanDesignEligibilityForRecord(opened.record)).toMatchObject({
      eligible: true,
      organism: 'hg38',
      queryText: '7157',
    })

    const anchorEnd = 151
    const guideStartIndex = prefix.length
    const genomicGuideStart = anchorEnd - guideStartIndex
    const candidate = {
      id: 'tp53-ng-reverse',
      rank: 1,
      regionName: 'TP53',
      organism: 'hg38',
      enzyme: 'cas9',
      chromosome: 'chr17',
      start: genomicGuideStart - (guide.length + suffix.slice(0, 3).length - 1),
      end: genomicGuideStart,
      strand: 'reverse' as const,
      sequence: `${guide}NGG`,
      spacer: guide,
      pam: 'NGG',
      specificity: 0.5,
      cuttingEfficiency: 0.5,
      annotations: [],
      offTargetCounts: { distance0: 0, distance1: 0, distance2: 0, distance3: 0, distance4: 0 },
      offTargets: [],
    }
    expect(mapGuideScanCandidateToHit(candidate, opened.record, 'cas9')?.guideStart).toBe(guideStartIndex)
  })

  it('falls back to the NC_ gene region when RefSeqGene elink is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const requested = new URL(String(input))
      if (requested.pathname.endsWith('/elink.fcgi')) return emptyRefSeqGeneElinkResponse()
      if (requested.pathname.endsWith('/esummary.fcgi') && requested.searchParams.get('db') === 'gene') {
        return ncbiGeneRegionSummaryResponse('7157', {
          symbol: 'TP53',
          description: 'tumor protein p53',
          chraccver: 'NC_000017.11',
          chrstart: 100,
          chrstop: 111,
        })
      }
      if (requested.pathname.endsWith('/efetch.fcgi') && requested.searchParams.get('db') === 'nuccore') {
        return textResponse(minimalGenbank('ATGCATGCATGC'))
      }
      throw new Error(String(input))
    }))

    const opened = await fetchGuideScanGeneSequence('hg38', '7157', {
      resolved: {
        symbol: 'TP53',
        ensemblId: '',
        description: '',
        species: 'Homo sapiens',
        exactSymbolMatch: true,
        entrezId: '7157',
      },
    })
    expect(opened.record.externalSource).toMatchObject({
      provider: 'ncbi',
      database: 'gene',
      accession: '7157',
    })
  })

  it('falls back to NCBI Entrez resolution when Ensembl autocomplete fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/xrefs/symbol/')) throw new Error('Ensembl timeout')
      const ncbi = ncbiGeneJson(input)
      if (ncbi) return ncbi
      throw new Error(url)
    }))

    const resolved = await resolveGuideScanGeneSymbol('hg38', 'LRP1')
    expect(resolved).toMatchObject({
      symbol: 'LRP1',
      entrezId: '4035',
      ensemblId: '',
      exactSymbolMatch: true,
    })
  })

  it('returns NCBI official symbol casing when Ensembl autocomplete fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/xrefs/symbol/')) throw new Error('Ensembl timeout')
      const requested = new URL(String(input))
      if (requested.pathname.endsWith('/esearch.fcgi') && requested.searchParams.get('db') === 'gene') {
        const term = requested.searchParams.get('term') ?? ''
        if (!/tp53/i.test(term)) return jsonResponse({ esearchresult: { count: '0', idlist: [] } })
        return jsonResponse({ esearchresult: { count: '1', idlist: ['7157'] } })
      }
      if (requested.pathname.endsWith('/esummary.fcgi') && requested.searchParams.get('db') === 'gene') {
        return jsonResponse({
          result: {
            uids: ['7157'],
            7157: {
              uid: '7157',
              name: 'TP53',
              description: 'tumor protein p53',
              organism: { scientificname: 'Homo sapiens', taxid: 9606 },
            },
          },
        })
      }
      throw new Error(url)
    }))

    const resolved = await resolveGuideScanGeneSymbol('hg38', 'tp53')
    expect(resolved).toMatchObject({
      symbol: 'TP53',
      entrezId: '7157',
      ensemblId: '',
      exactSymbolMatch: true,
    })
  })

  it('keeps the canonical symbol for GuideScan when NCBI only returns an alias hit', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const requested = url.startsWith('http') ? new URL(url) : null
      if (requested?.pathname.endsWith('/esearch.fcgi') && requested.searchParams.get('db') === 'gene') {
        return jsonResponse({ esearchresult: { count: '1', idlist: ['10438'] } })
      }
      if (requested?.pathname.endsWith('/esummary.fcgi') && requested.searchParams.get('db') === 'gene') {
        return jsonResponse({
          result: {
            uids: ['10438'],
            10438: {
              uid: '10438',
              name: 'C1D',
              description: 'C1D nuclear receptor corepressor',
              otheraliases: 'LRP1',
              organism: { scientificname: 'Homo sapiens', taxid: 9606 },
            },
          },
        })
      }
      if (url.includes('/xrefs/symbol/')) return jsonResponse([{ id: 'ENSG00000123384' }])
      if (url.includes('/lookup/id/')) {
        return jsonResponse({
          id: 'ENSG00000123384',
          display_name: 'LRP1',
          object_type: 'Gene',
          species: 'homo_sapiens',
        })
      }
      throw new Error(url)
    }))

    const prepared = await prepareGuideScanDesignRequest({
      organism: 'hg38',
      enzyme: 'cas9',
      kind: 'gene',
      geneName: 'LRP1',
    })
    expect(prepared.geneName).toBe('LRP1')
    expect(prepared.queryText).toBe('LRP1')
    expect(prepared.resolvedGene?.entrezId).toBeUndefined()
    expect(prepared.resolvedGene?.symbol).toBe('LRP1')
  })
})

describe('GuideScan design cache', () => {
  it('compacts guides without off-target lists and round-trips through normalize', () => {
    const guide = {
      id: 'BRCA1.1:17:43044295-43044314:forward',
      rank: 1,
      regionName: 'BRCA1',
      organism: 'hg38',
      enzyme: 'cas9',
      chromosome: '17',
      start: 43044295,
      end: 43044314,
      strand: 'forward' as const,
      sequence: 'GCTAGCTAGCTAGCTAGCTAGNGG',
      spacer: 'GCTAGCTAGCTAGCTAGCTAG',
      pam: 'NGG',
      specificity: 0.91,
      cuttingEfficiency: 0.55,
      annotations: [],
      offTargetCounts: { distance0: 1, distance1: 0, distance2: 0, distance3: 0, distance4: 3 },
      offTargets: [{ accession: '17', chromosome: '17', direction: 'forward' as const, distance: 0, position: 43044295 }],
    }
    const compact = compactGuideScanGuideCandidate(guide)
    expect(compact).not.toHaveProperty('offTargets')
    expect(compact.spacer).toBe(guide.spacer)

    const host = baseRecord({ sequence: 'ATGCATGC' })
    const entry = buildGuideScanDesignCacheEntry({
      record: host,
      inputMode: 'gene',
      queryText: 'BRCA1',
      organism: 'hg38',
      enzyme: 'cas9',
      topN: 20,
      designResult: {
        jobId: 'job-1',
        resultType: 'standard',
        organism: 'hg38',
        enzyme: 'cas9',
        regions: [],
        guides: [guide],
      },
    })
    const normalized = normalizeGuideScanDesignCache(entry)
    expect(normalized?.designResult.guides[0]?.spacer).toBe(guide.spacer)
    expect(normalized?.designResult.guides[0]).not.toHaveProperty('offTargets')

    const expanded = expandGuideScanDesignResult(normalized!.designResult)
    expect(expanded.guides[0]?.offTargets).toEqual([])

    expect(guideScanDesignCacheMatchesRecord(normalized, host)).toBe(true)
    expect(guideScanDesignCacheMatchesRecord(normalized, { ...host, sequence: 'AAAA' })).toBe(false)

    expect(guideScanDesignRunContextKey({
      inputMode: 'gene',
      queryText: 'brca1',
      organism: 'hg38',
      enzyme: 'cas9',
      topN: 20,
    })).toBe('gene|BRCA1|hg38|cas9|20')
  })
})

describe('guidescanFetch timeout handling', () => {
  it('treats AbortError from timeout as GuideScanError timeout, not cancelled', async () => {
    const { guidescanFetch } = await import('./http')
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'))
      }, { once: true })
    }))
    await expect(guidescanFetch('https://guidescan.com/backend/query', {}, {
      timeoutMs: 20,
      fetchImpl,
    })).rejects.toMatchObject({
      code: 'timeout',
      message: 'GuideScan2 did not respond within 0 s.',
    })
  })
})

describe('guidescanErrorMessage', () => {
  it('never returns an empty string for common failures', async () => {
    const { guidescanErrorMessage } = await import('./types')
    expect(guidescanErrorMessage(new GuideScanError('cancelled', 'The GuideScan request was cancelled.'))).toBe(
      'The GuideScan request was cancelled.',
    )
    expect(guidescanErrorMessage(new DOMException('aborted', 'AbortError'))).toBe(
      'A network request was interrupted before it finished.',
    )
    expect(guidescanErrorMessage(new Error(''))).toBe('Error (no details)')
  })
})

describe('fetchSequenceResource timeout handling', () => {
  it('does not retry after a timeout and rejects with TimeoutError', async () => {
    const { fetchSequenceResource } = await import('../externalSequences/http')
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'))
      }, { once: true })
    }))
    vi.stubGlobal('fetch', fetchImpl)
    await expect(fetchSequenceResource('https://rest.ensembl.org/lookup/id/ENSG1', {}, {
      timeoutMs: 20,
      attempts: 3,
    })).rejects.toMatchObject({
      name: 'TimeoutError',
      message: 'rest.ensembl.org did not respond within 0 s.',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('GuideScan mapping summary', () => {
  it('reports how many candidates map onto the annotation target', () => {
    expect(formatGuideScanMappingSummary(0, 20, 'LRP1')).toBe('0 of 20 candidates map to LRP1')
    expect(formatGuideScanMappingSummary(4, 20, 'NG_016444.2')).toBe('4 of 20 candidates map to NG_016444.2')
  })

  it('formats off-target counts without counting the intended on-target at distance 0', () => {
    expect(formatGuideScanOffTargetSummary({
      distance0: 1,
      distance1: 0,
      distance2: 1,
      distance3: 2,
      distance4: 40,
    })).toBe('1 at 2, 2 at 3, 40 at 4+')
    expect(formatGuideScanOffTargetSummary({
      distance0: 2,
      distance1: 0,
      distance2: 0,
      distance3: 0,
      distance4: 0,
    })).toBe('1 at 0')
  })
})
