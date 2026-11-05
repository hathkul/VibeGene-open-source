import { describe, expect, it } from 'vitest'
import { parseEmbl, parseGenBank, parseSequenceFile, rejectedSequenceDocumentReason } from '../src/domain/parsers'
import { detectEmblTopology, importRequiresTopologyChoice, opensAsLinearDnaFileName } from '../src/domain/sequenceTopology'
import { SEQUENCE_OPEN_EXTENSIONS, inferProjectFileFormat, isFolderScopedPrimerListFileName, isFolderScopedSyncFileName, isSequenceOpenFileName } from '../src/domain/fileFormats'
import { isAb1Bytes, parseAb1BytesToSequenceRecord } from '../src/domain/ab1Parser'

const emblSample = `ID   TESTPL; SV 1; circular; genomic DNA; STD; UNC; 36 BP.
XX
AC   TESTPL;
XX
DE   Tiny circular test plasmid.
XX
OS   Escherichia coli
XX
FT   rep_origin      1..12
FT                   /note="ori"
FT   CDS             complement(13..24)
FT                   /gene="tet"
FT                   /product="tetracycline resistance"
XX
SQ   Sequence 36 BP; 9 A; 9 C; 9 G; 9 T; 0 other;
     atgcatgcatg catgcatgca tgcatgcatg catgca                    36
//
`

const apeLikeGenBank = `LOCUS       APEPLASMID                24 bp    DNA     circular SYN 26-JUL-2026
DEFINITION  ApE-style GenBank file.
ACCESSION   .
FEATURES             Location/Qualifiers
     promoter        1..8
                     /label="P1"
ORIGIN
        1 atgcatgc atgcatgcat gcat
//
`

const genPeptSample = `LOCUS       TESTPROT                 40 aa            linear   PRI 18-AUG-2026
DEFINITION  Tiny annotated protein.
ACCESSION   P01234
FEATURES             Location/Qualifiers
     source          1..40
                     /organism="Homo sapiens"
     Region          2..20
                     /region_name="Catalytic domain"
     Site            8
                     /site_type="active"
                     /note="Catalytic residue"
     Bond            bond(4,18)
                     /bond_type="disulfide"
                     /note="Cys bridge"
ORIGIN
        1 mkwvtfisll flfssaysrg vfrtmdetie qkarrkq
//
`

describe('sequence open formats', () => {
  it('lists common SnapGene interchange extensions', () => {
    expect(isSequenceOpenFileName('plasmid.dna')).toBe(true)
    expect(isSequenceOpenFileName('plasmid.ape')).toBe(true)
    expect(isSequenceOpenFileName('plasmid.embl')).toBe(true)
    expect(isSequenceOpenFileName('plasmid.fna')).toBe(true)
    expect(isSequenceOpenFileName('plasmid.gbff')).toBe(true)
    expect(isSequenceOpenFileName('protein.gp')).toBe(true)
    expect(isSequenceOpenFileName('protein.gpff')).toBe(true)
    expect(isSequenceOpenFileName('read.ab1')).toBe(true)
    expect(isSequenceOpenFileName('fragment.seq')).toBe(true)
    expect(inferProjectFileFormat('protein.gp')).toBe('genpept')
    expect(inferProjectFileFormat('read.ab1')).toBe('ab1')
    expect(SEQUENCE_OPEN_EXTENSIONS).toContain('.gp')
    expect(SEQUENCE_OPEN_EXTENSIONS).toContain('.ab1')
    expect(SEQUENCE_OPEN_EXTENSIONS).toContain('.json')
    expect(isSequenceOpenFileName('plasmid.json')).toBe(true)
    expect(isFolderScopedSyncFileName('plasmid.dna')).toBe(true)
    expect(isFolderScopedSyncFileName('plasmid.gbk')).toBe(true)
    expect(isFolderScopedSyncFileName('plasmid.seq')).toBe(true)
    expect(isFolderScopedSyncFileName('read.ab1')).toBe(true)
    expect(isFolderScopedSyncFileName('info.json')).toBe(false)
    expect(isFolderScopedSyncFileName('notes.txt')).toBe(false)
    expect(isFolderScopedSyncFileName('vibegene-database.json')).toBe(false)
    expect(isFolderScopedPrimerListFileName('Primers/demo.txt')).toBe(true)
    expect(isFolderScopedPrimerListFileName('info.json')).toBe(false)
    expect(isFolderScopedPrimerListFileName('plasmid.dna')).toBe(false)
  })

  it('opens .seq as linear DNA without a topology prompt', () => {
    const record = parseSequenceFile('ATGCGTACGTAA', 'fragment.seq')
    expect(record.topology).toBe('linear')
    expect(record.molecule).toBe('dna')
    expect(record.sequence).toBe('ATGCGTACGTAA')
    expect(importRequiresTopologyChoice('ATGCGTACGTAA', 'fragment.seq')).toBe(false)
    expect(opensAsLinearDnaFileName('fragment.seq')).toBe(true)
  })

  it('opens AB1 magic bytes as linear DNA', () => {
    // Minimal non-ABIF buffer rejected; use isAb1Bytes / opensAsLinear helpers here.
    expect(isAb1Bytes(new TextEncoder().encode('ABIF....'))).toBe(true)
    expect(isAb1Bytes(new TextEncoder().encode('ATGC'))).toBe(false)
    expect(opensAsLinearDnaFileName('trace.ab1')).toBe(true)
    expect(importRequiresTopologyChoice('ignored', 'trace.ab1')).toBe(false)
    expect(() => parseAb1BytesToSequenceRecord(new TextEncoder().encode('ABIF'), 'empty.ab1')).toThrow(
      /chromatogram|base calls/i,
    )
  })

  it('parses GenPept .gp records as proteins with features and bonds', () => {
    const record = parseSequenceFile(genPeptSample, 'test.gp')
    expect(record.molecule).toBe('protein')
    expect(record.topology).toBe('linear')
    expect(record.sequence).toBe('MKWVTFISLLFLFSSAYSRGVFRTMDETIEQKARRKQ')
    expect(record.protein).toMatchObject({
      sourceDatabase: 'NCBI Protein',
      sourceAccession: 'P01234',
      bonds: [{
        name: 'Cys bridge',
        type: 'disulfide',
        endpoints: [{ residue: 3 }, { residue: 17 }],
      }],
    })
    expect(record.features).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Catalytic domain',
        type: 'domain',
        locations: [{ start: 1, end: 20, strand: 'forward' }],
      }),
      expect.objectContaining({
        name: 'active site',
        type: 'active site',
        locations: [{ start: 7, end: 8, strand: 'forward' }],
      }),
    ]))
    expect(record.features.some((feature) => feature.type === 'Bond')).toBe(false)
    expect(record.primers).toEqual([])
  })

  it('recognizes GenPept content from an amino-acid LOCUS even with a .gb name', () => {
    expect(parseSequenceFile(genPeptSample, 'test.gb').molecule).toBe('protein')
  })

  it('parses EMBL DNA with features and circular topology', () => {
    const record = parseEmbl(emblSample)
    expect(record.name).toBe('TESTPL')
    expect(record.topology).toBe('circular')
    expect(record.sequence).toBe('ATGCATGCATGCATGCATGCATGCATGCATGCATGCA')
    expect(record.features).toHaveLength(2)
    expect(record.features[0]?.type).toBe('rep_origin')
    expect(record.features[1]?.locations[0]?.strand).toBe('reverse')
    expect(detectEmblTopology(emblSample)).toBe('circular')
    expect(importRequiresTopologyChoice(emblSample)).toBe(false)
  })

  it('routes EMBL and ApE GenBank text through parseSequenceFile', () => {
    expect(parseSequenceFile(emblSample, 'x.embl').name).toBe('TESTPL')
    const ape = parseSequenceFile(apeLikeGenBank, 'map.ape')
    expect(ape.name).toBe('APEPLASMID')
    expect(ape.topology).toBe('circular')
    expect(ape.features[0]?.type).toBe('promoter')
    expect(parseGenBank(apeLikeGenBank).sequence).toBe('ATGCATGCATGCATGCATGCAT')
  })

  it('rejects Word/RTF documents saved with a sequence extension', () => {
    const rtf = '{\\rtf1\\ansi >Hdelta18-aa\\par MGSRIVINREHL}'
    expect(() => parseSequenceFile(rtf, 'H proteins.fasta')).toThrow(
      'Rich Text (RTF) is not a sequence file',
    )
    expect(rejectedSequenceDocumentReason(new TextEncoder().encode(rtf))).toBe(
      'Rich Text (RTF) is not a sequence file',
    )
    expect(
      rejectedSequenceDocumentReason(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0x00])),
    ).toBe('Microsoft Office document is not a sequence file')
  })

  it('rejects SnapGene files that have a cookie but no sequence packet', () => {
    const cookie = new Uint8Array(19)
    cookie[0] = 0x09
    new DataView(cookie.buffer).setUint32(1, 14, false)
    cookie.set(new TextEncoder().encode('SnapGene'), 5)
    const flagsOnly = new Uint8Array(6)
    flagsOnly[4] = 1
    flagsOnly[5] = 0x1e
    const bytes = new Uint8Array(cookie.length + flagsOnly.length)
    bytes.set(cookie)
    bytes.set(flagsOnly, cookie.length)
    expect(rejectedSequenceDocumentReason(bytes)).toBe(
      'Unsupported SnapGene file: no readable sequence block was found.',
    )
  })
})
