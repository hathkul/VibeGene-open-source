import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchEnsemblRecord, searchEnsembl } from '../src/domain/externalSequences/ensembl'
import {
  fetchNcbiGeneSequences,
  fetchNcbiRecord,
  searchNcbi,
  searchNcbiGenes,
} from '../src/domain/externalSequences/ncbi'
import { recordFromUniProtEntry } from '../src/domain/externalSequences/uniprot'
import type { SequenceSearchResult } from '../src/domain/externalSequences'

afterEach(() => vi.unstubAllGlobals())

describe('public sequence database import adapters', () => {
  it('uses NCBI taxonomy syntax for numeric organism IDs', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      esearchresult: { count: '0', idlist: [] },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await searchNcbi({ term: 'TP53', organism: '9606', molecule: 'nucleotide' })

    const requested = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(requested.searchParams.get('term')).toBe('(TP53) AND txid9606[Organism:exp]')
  })

  it('searches NCBI Gene by symbol and returns gene metadata', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const requested = new URL(String(input))
      const body = requested.pathname.endsWith('/esearch.fcgi')
        ? { esearchresult: { count: '1', idlist: ['7157'] } }
        : {
            result: {
              uids: ['7157'],
              7157: {
                uid: '7157', name: 'TP53', description: 'tumor protein p53', chromosome: '17', maplocation: '17p13.1',
                organism: { scientificname: 'Homo sapiens', taxid: 9606 },
              },
            },
          }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const page = await searchNcbiGenes({ term: 'TP53', organism: '9606', molecule: 'all' })

    expect(page.results[0]).toMatchObject({ geneId: '7157', symbol: 'TP53', chromosome: '17', organism: 'Homo sapiens' })
    const requested = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(requested.searchParams.get('db')).toBe('gene')
    expect(requested.searchParams.get('term')).toContain('txid9606[Organism:exp]')
  })

  it('resolves and ranks linked RefSeq molecules for an NCBI Gene record', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const requested = new URL(String(input))
      const database = requested.searchParams.get('db')
      if (requested.pathname.endsWith('/elink.fcgi')) {
        const linksetdbs = database === 'protein'
          ? [{ dbto: 'protein', linkname: 'gene_protein_refseq', links: ['301', '302'] }]
          : [{ dbto: 'nuccore', linkname: 'gene_nuccore_refseqrna', links: ['201', '202'] }]
        return new Response(JSON.stringify({ linksets: [{ linksetdbs }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      const result = database === 'protein'
        ? {
            uids: ['301', '302'],
            301: { accessionversion: 'XP_000001.1', caption: 'XP_000001', title: 'predicted protein', organism: 'Homo sapiens', slen: 300 },
            302: { accessionversion: 'NP_000001.2', caption: 'NP_000001', title: 'curated protein', organism: 'Homo sapiens', slen: 300 },
          }
        : {
            uids: ['201', '202'],
            201: { accessionversion: 'XM_000001.1', caption: 'XM_000001', title: 'predicted transcript', organism: 'Homo sapiens', slen: 1000 },
            202: { accessionversion: 'NM_000001.2', caption: 'NM_000001', title: 'curated transcript', organism: 'Homo sapiens', slen: 1000 },
          }
      return new Response(JSON.stringify({ result }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    const results = await fetchNcbiGeneSequences('7157')

    expect(results.map((result) => result.accession)).toEqual(['NM_000001.2', 'NP_000001.2', 'XM_000001.1', 'XP_000001.1'])
    expect(results.map((result) => result.objectType)).toEqual([
      'Curated transcript', 'Curated protein', 'Predicted transcript', 'Predicted protein',
    ])
    expect(results.every((result) => result.organism === 'Homo sapiens')).toBe(true)
  })

  it('offers and imports the genomic gene locus from NCBI Gene coordinates', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const requested = new URL(String(input))
      const database = requested.searchParams.get('db')
      if (requested.pathname.endsWith('/elink.fcgi')) {
        return new Response(JSON.stringify({ linksets: [{ linksetdbs: [{
          dbto: 'nuccore', linkname: 'gene_nuccore_refseqrna', links: ['202'],
        }] }] }), { headers: { 'content-type': 'application/json' } })
      }
      if (requested.pathname.endsWith('/efetch.fcgi')) {
        return new Response(`LOCUS       NC_000010               101 bp    DNA     linear
DEFINITION  Human chromosome segment.
ACCESSION   NC_000010
VERSION     NC_000010.11
FEATURES             Location/Qualifiers
     gene            1..101
                     /gene="PDLIM1"
ORIGIN
        1 atgcgtacgtaatgcgtacgtaatgcgtacgtaatgcgtacgtaatgcgtacgtaatgcgtacgtaatgcgtacgtaatgcgtacgtaatgcgtacgta
//
`, { headers: { 'content-type': 'text/plain' } })
      }
      if (database === 'gene') {
        return new Response(JSON.stringify({ result: {
          uids: ['9124'],
          9124: {
            uid: '9124', name: 'PDLIM1', description: 'PDZ and LIM domain 1',
            organism: { scientificname: 'Homo sapiens', taxid: 9606 },
            genomicinfo: [{ chraccver: 'NC_000010.11', chrstart: 97_012_300, chrstop: 97_012_200, assemblyaccver: 'GCF_000001405.40' }],
          },
        } }), { headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ result: {
        uids: ['202'],
        202: { accessionversion: 'NM_020992.4', caption: 'NM_020992', title: 'PDLIM1 mRNA', organism: 'Homo sapiens', slen: 1800 },
      } }), { headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await fetchNcbiGeneSequences('9124', 'nucleotide')

    expect(results.map((result) => result.objectType)).toEqual(['Genomic gene locus', 'Curated transcript'])
    expect(results[0]).toMatchObject({
      accession: 'NC_000010.11',
      name: 'PDLIM1',
      length: 101,
      sourceGeneId: '9124',
      sequenceRange: { start: 97_012_200, end: 97_012_301, strand: 'reverse' },
    })

    const record = await fetchNcbiRecord(results[0]!)
    const efetchRequest = new URL(String(fetchMock.mock.calls.find(([input]) => String(input).includes('/efetch.fcgi'))?.[0]))
    expect(efetchRequest.searchParams.get('id')).toBe('NC_000010.11')
    expect(efetchRequest.searchParams.get('seq_start')).toBe('97012201')
    expect(efetchRequest.searchParams.get('seq_stop')).toBe('97012301')
    expect(efetchRequest.searchParams.get('strand')).toBe('2')
    expect(record).toMatchObject({
      name: 'PDLIM1',
      externalSource: { provider: 'ncbi', database: 'gene', accession: '9124' },
    })
  })

  it('adds RefSeq records resolved through an old NCBI Gene alias to sequence results', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const requested = new URL(String(input))
      const database = requested.searchParams.get('db')
      if (requested.pathname.endsWith('/esearch.fcgi')) {
        return new Response(JSON.stringify(database === 'gene'
          ? { esearchresult: { count: '1', idlist: ['4035'] } }
          : { esearchresult: { count: '0', idlist: [] } }), { headers: { 'content-type': 'application/json' } })
      }
      if (requested.pathname.endsWith('/elink.fcgi')) {
        const linksetdbs = database === 'protein'
          ? [{ dbto: 'protein', linkname: 'gene_protein_refseq', links: ['302'] }]
          : [{ dbto: 'nuccore', linkname: 'gene_nuccore_refseqrna', links: ['202'] }]
        return new Response(JSON.stringify({ linksets: [{ linksetdbs }] }), { headers: { 'content-type': 'application/json' } })
      }
      if (database === 'gene') {
        return new Response(JSON.stringify({ result: {
          uids: ['4035'],
          4035: {
            uid: '4035', name: 'LRP1', description: 'LDL receptor related protein 1', otheraliases: 'A2MR, APOER, CD91',
            organism: { scientificname: 'Homo sapiens', taxid: 9606 },
          },
        } }), { headers: { 'content-type': 'application/json' } })
      }
      const result = database === 'protein'
        ? { uids: ['302'], 302: { accessionversion: 'NP_002323.2', caption: 'NP_002323', title: 'LRP1 protein', organism: 'Homo sapiens', slen: 4544 } }
        : { uids: ['202'], 202: { accessionversion: 'NM_002332.3', caption: 'NM_002332', title: 'LRP1 transcript', organism: 'Homo sapiens', slen: 14900 } }
      return new Response(JSON.stringify({ result }), { headers: { 'content-type': 'application/json' } })
    }))

    const page = await searchNcbi({ term: 'A2MR', organism: '9606', molecule: 'all', pageSize: 25 })

    expect(page.results.map((result) => result.accession)).toEqual(['NM_002332.3', 'NP_002323.2'])
    expect(page.results.every((result) => result.sourceGeneId === '4035')).toBe(true)
    expect(page.results.every((result) => result.sourceGeneSymbol === 'LRP1')).toBe(true)
    expect(page.results.every((result) => result.sourceGeneMatch === 'alias')).toBe(true)
    expect(page.results.every((result) => result.sourceGeneQuery === 'A2MR')).toBe(true)
  })

  it('maps a common taxonomy ID to an Ensembl species name', async () => {
    const fetchMock = vi.fn(async () => new Response('[]', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await searchEnsembl({ term: 'TP53', organism: '9606', molecule: 'all' })

    expect(String(fetchMock.mock.calls[0]![0])).toContain('/xrefs/symbol/homo_sapiens/TP53')
  })

  it('maps UniProt sequence features, bonds, and provenance to a protein record', () => {
    const record = recordFromUniProtEntry({
      primaryAccession: 'P04637',
      uniProtkbId: 'P53_HUMAN',
      entryType: 'UniProtKB reviewed (Swiss-Prot)',
      entryAudit: { sequenceVersion: 4 },
      proteinDescription: { recommendedName: { fullName: { value: 'Cellular tumor antigen p53' } } },
      genes: [{ geneName: { value: 'TP53' } }],
      organism: { scientificName: 'Homo sapiens', taxonId: 9606 },
      sequence: { value: 'MEEPQSDPSVEPPLSQETFSDLWKLLPEN', length: 30 },
      features: [
        { type: 'Domain', description: 'DNA-binding', location: { start: { value: 5 }, end: { value: 20 } } },
        { type: 'Disulfide bond', description: 'test bond', location: { start: { value: 2 }, end: { value: 25 } } },
      ],
    })

    expect(record.molecule).toBe('protein')
    expect(record.name).toBe('TP53')
    expect(record.features[0]).toMatchObject({ type: 'domain', locations: [{ start: 4, end: 20 }] })
    expect(record.protein?.bonds[0]).toMatchObject({ type: 'disulfide', endpoints: [{ residue: 1 }, { residue: 24 }] })
    expect(record.externalSource).toMatchObject({ provider: 'uniprot', accession: 'P04637', version: '4' })
  })

  it('reuses GenBank parsing for annotated NCBI nucleotide records', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`LOCUS       TEST0001                  12 bp    DNA     linear
DEFINITION  Example imported molecule.
ACCESSION   TEST0001
FEATURES             Location/Qualifiers
     gene            1..12
                     /gene="example"
ORIGIN
        1 atgcgtacgtaa
//
`, { status: 200, headers: { 'content-type': 'text/plain' } })))
    const result: SequenceSearchResult = {
      provider: 'ncbi', id: 'TEST0001.1', accession: 'TEST0001.1', name: 'TEST0001',
      description: '', molecule: 'dna', database: 'nuccore', version: '1',
    }
    const record = await fetchNcbiRecord(result)
    expect(record.sequence).toBe('ATGCGTACGTAA')
    expect(record.features).toHaveLength(1)
    expect(record.externalSource).toMatchObject({ provider: 'ncbi', accession: 'TEST0001.1', version: '1' })
  })

  it('imports an Ensembl canonical transcript as annotated cDNA', async () => {
    const lookup = {
      id: 'ENSG_TEST', object_type: 'Gene', display_name: 'GENE1', description: 'Example gene',
      species: 'homo_sapiens', assembly_name: 'GRCh38', start: 100, end: 199, strand: 1,
      canonical_transcript: 'ENST_TEST.1',
      Transcript: [{
        id: 'ENST_TEST', object_type: 'Transcript', biotype: 'protein_coding', start: 100, end: 199, strand: 1,
        Exon: [{ id: 'ENSE_A', start: 100, end: 104 }, { id: 'ENSE_B', start: 150, end: 154 }],
        Translation: { id: 'ENSP_TEST' },
      }],
    }
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const requested = String(input)
      const body = requested.includes('/lookup/') ? lookup : { id: 'ENST_TEST', seq: 'ACGTATGCAT' }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    const result: SequenceSearchResult = {
      provider: 'ensembl', id: 'ENSG_TEST', accession: 'ENSG_TEST', name: 'GENE1',
      description: '', molecule: 'dna', database: 'Ensembl', availableSequenceTypes: ['genomic', 'cdna', 'cds', 'protein'],
    }
    const record = await fetchEnsemblRecord(result, { sequenceType: 'cdna', includeAnnotations: true })
    expect(record.molecule).toBe('dna')
    expect(record.sequence).toBe('ACGTATGCAT')
    expect(record.features.map((feature) => feature.locations[0])).toEqual([
      { start: 0, end: 5, strand: 'forward' },
      { start: 5, end: 10, strand: 'forward' },
    ])
    expect(record.externalSource).toMatchObject({ provider: 'ensembl', accession: 'ENST_TEST', assembly: 'GRCh38' })
  })
})
