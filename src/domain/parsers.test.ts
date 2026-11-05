import { themeFixturePalette } from '../test-support/themeFixturePalette'
// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { defaultConstructProperties } from './constructProperties'
import { exportFasta, exportGenBank, exportProjectJson, inferProteinSequence, isVibeGeneConstructJson, parseEmbl, parseFasta, parseGenBank, parseProjectJson, parseSequenceFile, rejectedSequenceDocumentReason, exportSnapGene, parseSnapGene } from './parsers'
import { initSnapGeneLzma } from './snapgeneLzma'
import { snapGeneExportOptionsFromEnzymeDisplay, vibegeneEnzymeDisplayFromSnapGeneRecord } from './snapgeneEnzymeData'
import type { SequenceRecord } from './types'

describe('sequence molecule classification', () => {
  it('keeps an HSP70 promoter GenBank record as DNA from LOCUS metadata', () => {
    const record = parseGenBank(`LOCUS       HSP70promoter       24 bp    DNA     linear   SYN 01-JAN-2026
DEFINITION  HSP70 promoter.
ORIGIN
        1 acgtrymkbdhvnacgtacgtacg
//`, 'HSP70promoter.gb')
    expect(record.molecule).toBe('dna')
    expect(record.sequence).toBe('ACGTRYMKBDHVNACGTACGTACG')
  })

  it('keeps a nucleotide .seq file as DNA rather than trusting a weak suffix', () => {
    expect(parseSequenceFile('ACGTRYMKBDHVN\nACGT', 'nucleotide.seq').molecule).toBe('dna')
    expect(inferProteinSequence('ACGTRYMKBDHVNACGT', 'misleading.faa')).toBe(false)
  })

  it('recognizes actual proteins while honoring explicit FASTA molecule metadata', () => {
    expect(parseFasta('>HSP70 protein\nMKTIIALSYIFCLVFA', 'HSP70.fasta').molecule).toBe('protein')
    expect(parseFasta('>promoter molecule=DNA\nACGTACGT', 'promoter.faa').molecule).toBe('dna')
    expect(parseFasta('>short molecule=protein\nACGT', 'short.fna').molecule).toBe('protein')
  })
})

describe('native DNA persistence', () => {
  beforeAll(async () => {
    await initSnapGeneLzma()
  })

  it('round-trips a large library document and all member records without dropping the role', () => {
    const members = Array.from({ length: 120 }, (_, index) => ({
      id: `trace-${index}`,
      fileName: `member-${index}.ab1`,
      sequence: 'ACGT'.repeat(60),
      chromatogram: { aTrace: [], tTrace: [], gTrace: [], cTrace: [], basePos: [], baseCalls: [] },
      enabled: index % 7 !== 0,
      expanded: false,
      showAnnotations: false,
      alignment: null,
    }))
    const record = {
      id: 'large-library',
      name: 'Large library',
      description: '',
      molecule: 'dna',
      topology: 'linear',
      sequence: 'ACGT'.repeat(60),
      features: [],
      primers: [],
      operations: [],
      construct: defaultConstructProperties,
      createdAt: '2026-10-06T00:00:00.000Z',
      updatedAt: '2026-10-06T00:00:00.000Z',
      dna: {
        documentRole: 'library',
        comparisonSources: [{ id: 'comparison-1', name: 'Reference', sequence: 'ACGT', enabled: true }],
      },
      dnaEnds: {
        upstream: { modification: 'covalentlyClosed', stickiness: 4, enzymeName: 'BsaI' },
        downstream: { modification: 'fivePrimePhosphorylated', stickiness: -2, enzymeName: 'BsaI' },
      },
      dnaEndsProvenance: 'user-defined',
      strandColors: {
        type: 'Product',
        topStrand: [{ start: 1, end: 4, color: themeFixturePalette.red }],
        bottomStrand: [{ start: 5, end: 8, color: themeFixturePalette.blueDark }],
      },
      fileEnzymeSets: [{ id: 'set-1', name: 'Assembly set', enzymeNames: ['BamHI', 'EcoRI'] }],
      traceFiles: members,
    } as SequenceRecord

    const bytes = exportSnapGene(record)
    const loaded = parseSnapGene(bytes, 'large-library.dna')
    expect(loaded.dna?.documentRole).toBe('library')
    expect(loaded.traceFiles).toHaveLength(members.length)
    expect(loaded.traceFiles?.map((trace) => trace.fileName)).toEqual(members.map((trace) => trace.fileName))
    expect(loaded.traceFiles?.filter((trace) => trace.enabled)).toHaveLength(
      members.filter((trace) => trace.enabled).length,
    )
    expect(loaded.dna?.comparisonSources?.[0]?.name).toBe('Reference')
    expect(loaded.dnaEnds).toEqual(record.dnaEnds)
    expect(loaded.dnaEndsProvenance).toBe('snapgene-block8')
    expect(loaded.strandColors).toEqual(record.strandColors)
    expect(loaded.fileEnzymeSets?.[0]).toMatchObject({ name: 'Assembly set', enzymeNames: ['BamHI', 'EcoRI'] })
  })

  it('round-trips hidden enzyme names through SnapGene visibility packet 0x1c', () => {
    const record = parseFasta('>visibility test\nACGTACGTACGT', 'visibility.fasta')
    record.snapGeneEnzymes = { hiddenEnzymeNames: ['BseYI', 'BclI', 'Eco&RI'] }

    const loaded = parseSnapGene(exportSnapGene(record), 'visibility.dna')

    expect(loaded.snapGeneEnzymes?.hiddenEnzymeNames).toEqual(['BseYI', 'BclI', 'Eco&RI'])
  })

  it('round-trips a named file set and the active custom selection in SnapGene packets', () => {
    const record = parseFasta('>custom set\nACGTACGTACGT', 'custom.fasta')
    record.fileEnzymeSets = [{ id: 'file-set', name: 'My set', enzymeNames: ['EcoRI', 'AasI'] }]
    const options = snapGeneExportOptionsFromEnzymeDisplay({ set: 'custom', supplierSetId: null, selectedNames: ['EcoRI', 'AasI'] }, record)
    const loaded = parseSnapGene(exportSnapGene(record, options), 'custom.dna')
    expect(loaded.snapGeneEnzymes?.enzymeSetName).toBe('Unsaved Enzyme Set')
    expect(loaded.fileEnzymeSets?.map(({ name, enzymeNames }) => ({ name, enzymeNames }))).toEqual([
      { name: 'My set', enzymeNames: ['AasI', 'EcoRI'] },
      { name: 'Unsaved Enzyme Set', enzymeNames: ['AasI', 'EcoRI'] },
    ])
    expect(vibegeneEnzymeDisplayFromSnapGeneRecord(loaded)).toMatchObject({ set: 'custom', selectedNames: ['AasI', 'EcoRI'], unavailableNames: ['AasI'] })
  })
})

describe('flat-file façade formats', () => {
  it('keeps FASTA export wrapping and metadata through the public parser path', () => {
    const record = parseFasta('>construct promoter\n' + 'ACGT'.repeat(20), 'construct.fasta')
    expect(record.name).toBe('construct')
    expect(record.description).toBe('promoter')
    expect(exportFasta(record)).toBe(`>construct promoter\n${'ACGT'.repeat(17)}AC\nGTACGTACGT\n`)
  })

  it('preserves EMBL topology, feature locations, and imported metadata', () => {
    const record = parseEmbl(`ID   TEST; SV 1; linear; genomic DNA; STD; UNC; 12 BP.\nDE   Example construct\nAC   X12345;\nOS   Escherichia coli\nFT   gene            complement(2..6)\nFT                   /label="gene"\nSQ   Sequence 12 BP;\n     acgtacgtacgt\n//`, 'test.embl')
    expect(record.name).toBe('TEST')
    expect(record.topology).toBe('linear')
    expect(record.construct.accessionNumber).toBe('X12345')
    expect(record.features[0]?.locations).toEqual([{ start: 1, end: 6, strand: 'reverse' }])
  })

  it('retains GenBank export qualifiers and circular location semantics', () => {
    const record = parseGenBank(`LOCUS       test                 8 bp    DNA     circular\nDEFINITION  Test.\nFEATURES             Location/Qualifiers\n     misc_feature    complement(2..5)\n                     /label="binding"\n                     /note="kept"\nORIGIN\n        1 acgtacgt\n//`, 'test.gb')
    const exported = exportGenBank(record)
    expect(exported).toContain('complement(2..5)')
    expect(exported).toContain('/label="binding"')
    expect(exported).toContain('/note="kept"')
  })
})

describe('VibeGene project JSON façade', () => {
  it('keeps schema metadata and legacy record detection behind the public path', () => {
    const record = parseFasta('>project\nACGT', 'project.fasta')
    const json = exportProjectJson(record, { displaySettings: { showFeatures: false } })
    expect(isVibeGeneConstructJson(JSON.parse(json))).toBe(true)
    expect(parseProjectJson(json).displaySettings).toEqual({ showFeatures: false })
    expect(JSON.parse(json).schemaVersion).toBe(6)
  })

  it('retains the exact invalid-project error', () => {
    expect(() => parseProjectJson('{"not":"a construct"}')).toThrow('Not a VibeGene construct file')
  })
})

describe('sequence dispatch guard façade', () => {
  it('retains BOM, RTF, and OLE rejection behavior', () => {
    const bomText = new TextEncoder().encode('\uFEFFACGT')
    expect(rejectedSequenceDocumentReason(bomText)).toBeNull()
    expect(rejectedSequenceDocumentReason(new TextEncoder().encode('{\\rtf1 test'))).toBe('Rich Text (RTF) is not a sequence file')
    expect(rejectedSequenceDocumentReason(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe('Microsoft Office document is not a sequence file')
    expect(() => parseSequenceFile('{\\rtf1 test', 'notes.seq')).toThrow('Rich Text (RTF) is not a sequence file')
  })
})
