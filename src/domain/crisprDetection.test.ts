import { themeFixturePalette } from '../test-support/themeFixturePalette'
import { describe, expect, it } from 'vitest'
import { detectCrispr } from './crisprDetection'
import { enzymes } from './enzymes'
import type { CommonFeatureTemplate } from './commonFeatures'
import type { DnaEnds, SequenceFeature, SequenceRecord } from './types'
import { defaultConstructProperties } from './constructProperties'
import { reverseComplement } from './sequence'
import { flipRecord } from './flipRecord'
import crisprReferences from '../data/crisprReferences.json'

function dna(length: number, seed: number): string {
  let state = seed >>> 0
  let result = ''
  const bases = ['A', 'C', 'G', 'T']
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    result += bases[(state >>> 30) & 3]
  }
  return result
}

function template(name: string, sequence: string, notes = ''): CommonFeatureTemplate {
  return {
    id: name.toLowerCase().replaceAll(' ', '-'),
    fileName: `${name}.dna`,
    name,
    type: sequence.length > 700 ? 'CDS' : 'misc_RNA',
    color: themeFixturePalette.grayLong,
    sequence,
    notes,
    qualifiers: [],
    locations: [{ start: 0, end: sequence.length, strand: 'forward' }],
  }
}

function record(sequence: string, features: SequenceFeature[] = [], topology: SequenceRecord['topology'] = 'linear'): SequenceRecord {
  return {
    id: 'crispr-test',
    name: 'CRISPR test plasmid',
    description: '',
    molecule: 'dna',
    topology,
    sequence,
    features,
    primers: [],
    operations: [],
    construct: defaultConstructProperties,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const BsmBI = enzymes.find((enzyme) => enzyme.name === 'BsmBI')!
const enzyme = (name: string) => enzymes.find((candidate) => candidate.name === name)!

describe('detectCrispr', () => {
  it('recognizes an already-linearized guide backbone from opposite terminal promoter and scaffold', () => {
    const scaffold = 'GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC'
    const promoter = dna(120, 201)
    const sequence = `${scaffold}${dna(2500, 203)}${promoter}A`
    const features: SequenceFeature[] = [
      { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: 0, end: scaffold.length, strand: 'forward' }] },
      { id: 'promoter', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: sequence.length - promoter.length - 1, end: sequence.length - 1, strand: 'forward' }] },
    ]
    const backbone = record(sequence, features)
    backbone.dnaEnds = {
      upstream: { modification: 'fivePrimePhosphorylated', stickiness: 4 },
      downstream: { modification: 'fivePrimePhosphorylated', stickiness: 4 },
    }
    backbone.dnaEndsProvenance = 'snapgene-block8'
    const result = detectCrispr(backbone, { commonFeatures: [], restrictionEnzymes: [] })

    expect(result.cassetteFindings).toHaveLength(1)
    expect(result.cassetteFindings[0]?.architecture).toBe('pre-linearized')
    expect(result.cassetteFindings[0]?.nearbyTypeIisSites).toEqual([])
    expect(result.cassetteFindings[0]?.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining('4 nt 5′ overhang'),
      expect.stringContaining('Terminal enzyme identities are not recorded'),
    ]))
    expect(result.recommendations.some((item) => item.title === 'Pre-linearized sgRNA backbone')).toBe(true)
  })

  it('recognizes reverse-strand terminal guide junctions and maps recorded enzyme ends correctly', () => {
    const scaffold = dna(76, 205)
    const promoter = dna(120, 207)
    const sequence = reverseComplement(`${scaffold}${dna(2500, 209)}${promoter}`)
    const features: SequenceFeature[] = [
      { id: 'promoter', name: 'H1 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: 0, end: promoter.length, strand: 'reverse' }] },
      { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: sequence.length - scaffold.length, end: sequence.length, strand: 'reverse' }] },
    ]
    const backbone = record(sequence, features)
    backbone.dnaEnds = {
      upstream: { modification: 'unmodified', stickiness: -5, enzymeName: 'Esp3I' },
      downstream: { modification: 'unmodified', stickiness: -5, enzymeName: 'BsmBI' },
    }
    backbone.dnaEndsProvenance = 'snapgene-block8'
    const result = detectCrispr(backbone, { commonFeatures: [], restrictionEnzymes: [] })

    expect(result.cassetteFindings[0]?.architecture).toBe('pre-linearized')
    expect(result.cassetteFindings[0]?.strand).toBe('reverse')
    expect(result.cassetteFindings[0]?.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining('promoter side 5 nt 3′ overhang'),
      expect.stringContaining('promoter side BsmBI/Esp3I; scaffold side BsmBI/Esp3I'),
    ]))
  })

  it.each([
    { label: 'missing end metadata', ends: undefined },
    {
      label: 'default blunt ends',
      ends: {
        upstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
        downstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
      } satisfies DnaEnds,
    },
    {
      label: 'only one enzyme name',
      ends: {
        upstream: { modification: 'fivePrimePhosphorylated', stickiness: 0, enzymeName: 'BsmBI' },
        downstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
      } satisfies DnaEnds,
    },
  ])('detects a pre-linearized backbone with $label without inventing its end chemistry', ({ ends }) => {
    const scaffold = dna(76, 219)
    const promoter = dna(120, 221)
    const sequence = `${scaffold}${dna(2500, 223)}${promoter}`
    const backbone = record(sequence, [
      { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: 0, end: scaffold.length, strand: 'forward' }] },
      { id: 'promoter', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: sequence.length - promoter.length, end: sequence.length, strand: 'forward' }] },
    ])
    backbone.dnaEnds = ends

    const result = detectCrispr(backbone, { commonFeatures: [], restrictionEnzymes: [] })
    expect(result.cassetteFindings).toHaveLength(1)
    expect(result.cassetteFindings[0]?.architecture).toBe('pre-linearized')
    expect(result.cassetteFindings[0]?.nearbyTypeIisSites).toEqual([])
    expect(result.cassetteFindings[0]?.evidence.some((item) => item.startsWith('Recorded DNA ends:'))).toBe(false)
    expect(result.cassetteFindings[0]?.evidence.some((item) => item.startsWith('Recorded terminal enzymes:'))).toBe(false)
    expect(result.cassetteFindings[0]?.evidence).toContain('Terminal enzyme identities are not recorded; verify the vector-specific overhang sequences and cloning protocol before designing oligos')
    const recommendation = result.recommendations.find((item) => item.title === 'Pre-linearized sgRNA backbone')
    expect(recommendation?.detail).toContain('Terminal chemistry and overhang sequences are not recorded')
    expect(recommendation?.detail).toContain('terminal enzyme identities cannot be inferred')
  })

  it.each([
    {
      name: 'GeneArt-style', upstream: -5, downstream: -5,
      first: 'GTTTT', last: 'CACCG', promoterBases: 'CACCG', scaffoldBases: 'AAAAC',
      sense: '5′-[19–20 nt target]-GTTTT-3′', antisense: '5′-[reverse complement of target]-CGGTG-3′',
    },
    {
      name: 'Guide-it sgRNA1-style', upstream: 4, downstream: 4,
      first: 'GTTT', last: 'CACC', promoterBases: 'GGTG', scaffoldBases: 'GTTT',
      sense: '5′-CACC-[20 nt spacer]-3′', antisense: '5′-AAAC-[reverse complement of spacer]-3′',
    },
    {
      name: 'Guide-it CCGG-style', upstream: 4, downstream: 4,
      first: 'GTTT', last: 'CCGG', promoterBases: 'CCGG', scaffoldBases: 'GTTT',
      sense: '5′-CCGG-[20 nt spacer]-3′', antisense: '5′-AAAC-[reverse complement of spacer]-3′',
    },
  ])('uses the exact $name end signature for templates in either guide orientation', ({ name, upstream, downstream, first, last, promoterBases, scaffoldBases, sense, antisense }) => {
    const scaffold = 'GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC'
    const promoter = dna(120, 201)
    const sequence = `${first}${scaffold.slice(first.length)}${dna(2500, 203)}${promoter}${last}`
    const features: SequenceFeature[] = [
      { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: 0, end: scaffold.length, strand: 'forward' }] },
      { id: 'promoter', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: sequence.length - promoter.length - last.length, end: sequence.length - last.length, strand: 'forward' }] },
    ]
    const backbone = record(sequence, features)
    backbone.dnaEnds = {
      upstream: { modification: 'fivePrimePhosphorylated', stickiness: upstream },
      downstream: { modification: 'unmodified', stickiness: downstream },
    }
    backbone.dnaEndsProvenance = 'snapgene-block8'
    for (const candidate of [backbone, flipRecord(backbone)]) {
      const result = detectCrispr(candidate, { commonFeatures: [], restrictionEnzymes: [] })
      const cassette = result.cassetteFindings.find((item) => item.architecture === 'pre-linearized')
      expect(cassette?.oligoTemplate?.recipe).toBe(name)
      expect(cassette?.oligoTemplate?.sense).toBe(sense)
      expect(cassette?.oligoTemplate?.antisense).toBe(antisense)
      expect(cassette?.terminalEnds?.promoterSide.bases5to3).toBe(promoterBases)
      expect(cassette?.terminalEnds?.scaffoldSide.bases5to3).toBe(scaffoldBases)
      expect(result.recommendations.find((item) => item.title === 'Pre-linearized sgRNA backbone')?.detail).toContain(sense)
    }
    for (const provenance of ['legacy-defined', 'user-defined', 'snapgene-history'] as const) {
      const geometryMatched = detectCrispr({ ...backbone, dnaEndsProvenance: provenance }, { commonFeatures: [], restrictionEnzymes: [] }).cassetteFindings[0]
      expect(geometryMatched?.oligoTemplate?.recipe).toBe(name)
      expect(geometryMatched?.oligoTemplate?.matchBasis).toBe('geometry-matched')
      expect(geometryMatched?.oligoTemplate?.note).toContain('verify the source protocol and end chemistry')
    }
    expect(detectCrispr({ ...backbone, dnaEndsProvenance: undefined }, { commonFeatures: [], restrictionEnzymes: [] }).cassetteFindings[0]?.oligoTemplate).toBeUndefined()
  })

  it('shows unmatched CGGT/GTTT ends but suppresses vendor oligo templates', () => {
    const scaffold = 'GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC'
    const promoter = dna(120, 251)
    const sequence = `${scaffold}${dna(2500, 253)}${promoter}ACCG`
    const backbone = record(sequence, [
      { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: 0, end: scaffold.length, strand: 'forward' }] },
      { id: 'promoter', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: sequence.length - promoter.length - 4, end: sequence.length - 4, strand: 'forward' }] },
    ])
    backbone.dnaEnds = {
      upstream: { modification: 'fivePrimePhosphorylated', stickiness: 4 },
      downstream: { modification: 'fivePrimePhosphorylated', stickiness: 4 },
    }
    backbone.dnaEndsProvenance = 'snapgene-block8'
    const cassette = detectCrispr(backbone, { commonFeatures: [], restrictionEnzymes: [] }).cassetteFindings[0]
    expect(cassette?.terminalEnds?.promoterSide.bases5to3).toBe('CGGT')
    expect(cassette?.terminalEnds?.scaffoldSide.bases5to3).toBe('GTTT')
    expect(cassette?.oligoTemplate).toBeUndefined()
  })

  it('recognizes CGGT/GTTT as the AAVpro SaCas9 recipe only with a SaCas9 scaffold', () => {
    const scaffold = crisprReferences.scaffolds.find((entry) => entry.name === 'SaCas9 sgRNA scaffold')!.sequence
    const promoter = dna(120, 261)
    const sequence = `${scaffold}${dna(2500, 263)}${promoter}ACCG`
    const backbone = record(sequence, [
      { id: 'scaffold', name: 'SaCas9 sgRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: 0, end: scaffold.length, strand: 'forward' }] },
      { id: 'promoter', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: sequence.length - promoter.length - 4, end: sequence.length - 4, strand: 'forward' }] },
    ])
    backbone.dnaEnds = {
      upstream: { modification: 'unmodified', stickiness: 4 },
      downstream: { modification: 'unmodified', stickiness: 4 },
    }
    backbone.dnaEndsProvenance = 'snapgene-block8'
    for (const candidate of [backbone, flipRecord(backbone)]) {
      const cassette = detectCrispr(candidate, { commonFeatures: [], restrictionEnzymes: [] }).cassetteFindings[0]
      expect(cassette?.oligoTemplate?.recipeId).toBe('aavpro-sacas9')
      expect(cassette?.oligoTemplate?.sense).toBe('5′-ACCG-[20–22 nt guide]-3′')
      expect(cassette?.likelyGuideLengthRange).toEqual({ min: 20, max: 22 })
    }
  })

  it('rejects short fragments, circular DNA, reversed terminal order, and non-terminal guide features', () => {
    const scaffold = dna(76, 211)
    const promoter = dna(120, 213)
    const base = `${scaffold}${dna(2500, 215)}${promoter}`
    const features: SequenceFeature[] = [
      { id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.gray, locations: [{ start: 0, end: scaffold.length, strand: 'forward' }] },
      { id: 'promoter', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.gray, locations: [{ start: base.length - promoter.length, end: base.length, strand: 'forward' }] },
    ]
    const options = { commonFeatures: [], restrictionEnzymes: [] }
    expect(detectCrispr(record(base, features, 'circular'), options).cassetteFindings).toEqual([])
    expect(detectCrispr(record(`${scaffold}${dna(100, 217)}${promoter}`, features), options).cassetteFindings).toEqual([])
    const wrongOrder = [
      { ...features[0]!, locations: [{ start: base.length - scaffold.length, end: base.length, strand: 'forward' as const }] },
      { ...features[1]!, locations: [{ start: 0, end: promoter.length, strand: 'forward' as const }] },
    ]
    expect(detectCrispr(record(base, wrongOrder), options).cassetteFindings).toEqual([])
    expect(detectCrispr(record(`${'A'.repeat(30)}${base}`, features), options).cassetteFindings).toEqual([])
  })

  it('recognizes locally curated scaffold variants without requiring the common-feature database', () => {
    const sequence = crisprReferences.scaffolds.map((reference) => reference.sequence).join('')
    const result = detectCrispr(record(sequence), { commonFeatures: [], restrictionEnzymes: [] })

    expect(result.guideScaffoldFindings.map((finding) => finding.name)).toEqual(expect.arrayContaining([
      'SpCas9 standard sgRNA scaffold',
      'SpCas9 MS2-loop sgRNA scaffold',
      'SaCas9 sgRNA scaffold',
    ]))
  })

  it('detects the real pX330 BbsI spacer cassette from a compact local SnapGene fixture', () => {
    // Exact 343 nt cassette context sliced from CRISPR Plasmids/pX330.dna (nt 7688–8030).
    // The fixture is cassette-only; the source plasmid file is not bundled or changed.
    const sequence = 'GAGGGCCTATTTCCCATGATTCCTTCATATTTGCATATACGATACAAGGCTGTTAGAGAGATAATTGGAATTAATTTGACTGTAAACACAAAGATATTAGTACAAAATACGTGACGTAGAAAGTAATAATTTCTTGGGTAGTTTGCAGTTTTAAAATTATGTTTTAAAATGGACTATCATATGCTTACCGTAACTTGAAAGTATTTCGATTTCTTGGCTTTATATATCTTGTGGAAAGGACGAAACACCGGGTCTTCGAGAAGACCTGTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC'
    const features: SequenceFeature[] = [{
      id: 'px330-scaffold',
      name: 'gRNA scaffold',
      type: 'misc_RNA',
      color: themeFixturePalette.teal,
      locations: [{ start: 267, end: 343, strand: 'forward' }],
    }]
    const result = detectCrispr(record(sequence, features), { commonFeatures: [], restrictionEnzymes: [enzymes.find((enzyme) => enzyme.name === 'BbsI')!] })

    expect(result.cassetteFindings).toHaveLength(1)
    expect(result.cassetteFindings[0]?.architecture).toBe('direct-spacer')
    expect(result.cassetteFindings[0]?.nearbyTypeIisSites.map((site) => site.enzymeName)).toEqual(['BbsI', 'BbsI'])
    expect(result.cassetteFindings[0]?.evidence.some((item) => item.includes('pX330'))).toBe(true)
  })

  it('recognizes a Cas9 coding sequence and a matching guide scaffold', () => {
    const cas9 = dna(900, 17)
    const scaffold = dna(76, 29)
    const templates = [
      template('SpCas9', cas9, 'CRISPR endonuclease'),
      template('gRNA scaffold', scaffold, 'guide RNA scaffold for the CRISPR/Cas9 system'),
    ]
    const result = detectCrispr(record(`${dna(80, 3)}${cas9}${dna(35, 4)}${scaffold}`), {
      commonFeatures: templates,
      restrictionEnzymes: [],
    })

    expect(result.nucleaseFindings.some((finding) => finding.name === 'SpCas9' && finding.family === 'SpCas9')).toBe(true)
    expect(result.guideScaffoldFindings.some((finding) => finding.name === 'gRNA scaffold')).toBe(true)
    expect(result.recommendations.some((recommendation) => recommendation.title === 'SpCas9 guide design')).toBe(true)
  })

  it('preserves an annotated non-SpCas9 ortholog classification over a broad sequence-template match', () => {
    const nuclease = dna(900, 17)
    const result = detectCrispr(record(nuclease, [{
      id: 'nmcas9',
      name: 'NmCas9',
      type: 'CDS',
      color: themeFixturePalette.grayLong,
      locations: [{ start: 0, end: nuclease.length, strand: 'forward' }],
    }]), {
      commonFeatures: [template('SpCas9', nuclease, 'CRISPR endonuclease')],
      restrictionEnzymes: [],
    })

    expect(result.nucleaseFindings).toHaveLength(1)
    expect(result.nucleaseFindings[0]?.name).toBe('NmCas9')
    expect(result.nucleaseFindings[0]?.family).toBe('other')
  })

  it('calls a same-enzyme Type IIS pair beside a promoter/scaffold a plausible cassette', () => {
    const promoter = dna(100, 41)
    const scaffold = dna(76, 53)
    const u6 = template('U6 promoter', promoter, 'RNA polymerase III promoter')
    const guide = template('gRNA scaffold', scaffold, 'guide RNA scaffold')
    const bbsI = enzymes.find((enzyme) => enzyme.name === 'BbsI')!
    // pX330/pX459-like direct cassette: BbsI recognition starts are 22 bp apart,
    // and the downstream cut boundary abuts the scaffold 5′ junction.
    const sequence = `${dna(30, 7)}${promoter}${'T'.repeat(4)}GAAGAC${'A'.repeat(16)}GAAGAC${'T'.repeat(8)}${scaffold}${dna(40, 9)}`
    const result = detectCrispr(record(sequence), { commonFeatures: [u6, guide], restrictionEnzymes: [bbsI] })

    expect(result.cassetteFindings).toHaveLength(1)
    expect(result.cassetteFindings[0]?.promoterName).toBe('U6 promoter')
    expect(result.cassetteFindings[0]?.architecture).toBe('direct-spacer')
    expect(result.cassetteFindings[0]?.nearbyTypeIisSites.filter((site) => site.enzymeName === 'BbsI')).toHaveLength(2)
  })

  it('detects a lentiCRISPR-like long removable stuffer bounded by promoter and guide', () => {
    const promoter = dna(100, 117)
    const scaffold = dna(76, 119)
    const u6 = template('U6 promoter', promoter, 'RNA polymerase III promoter')
    const guide = template('gRNA scaffold', scaffold, 'guide RNA scaffold')
    // Synthetic geometry calibrated to lentiCRISPRv2: paired BsmBI sites remove
    // ~1.9 kb of stuffer, with one cut pair adjacent to the scaffold.
    const innerSite = `${'T'.repeat(8)}CGTCTC`
    const outerSite = `${'T'.repeat(8)}CGTCTC`
    const sequence = `${dna(25, 121)}${promoter}${'T'.repeat(30)}${outerSite}${'A'.repeat(1800)}${innerSite}${'T'.repeat(8)}${scaffold}${dna(100, 123)}`
    const result = detectCrispr(record(sequence), { commonFeatures: [u6, guide], restrictionEnzymes: [BsmBI] })

    expect(result.cassetteFindings).toHaveLength(1)
    expect(result.cassetteFindings[0]?.architecture).toBe('removable-stuffer')
    expect(result.cassetteFindings[0]?.evidence.some((item) => /removable stuffer/.test(item))).toBe(true)
    expect(result.cassetteFindings[0]?.nearbyTypeIisSites).toHaveLength(2)
  })

  it('uses an annotated U6 promoter and ignores a long filler annotation as a scaffold', () => {
    const promoter = dna(100, 137)
    const scaffold = dna(76, 139)
    const prefix = dna(25, 141)
    const cassetteTail = `${'T'.repeat(30)}${'T'.repeat(8)}CGTCTC${'A'.repeat(1800)}${'T'.repeat(8)}CGTCTC${'T'.repeat(8)}`
    const sequence = `${prefix}${promoter}${cassetteTail}${scaffold}${dna(100, 143)}`
    const promoterStart = prefix.length
    const scaffoldStart = promoterStart + promoter.length + cassetteTail.length
    const features: SequenceFeature[] = [
      {
        id: 'annotated-u6',
        name: 'U6 promoter',
        type: 'promoter',
        color: themeFixturePalette.grayLong,
        locations: [{ start: promoterStart, end: promoterStart + promoter.length, strand: 'forward' }],
      },
      {
        id: 'long-filler',
        name: 'filler',
        type: 'misc_feature',
        color: themeFixturePalette.grayLong,
        notes: 'guide RNA scaffold placeholder region',
        locations: [{ start: promoterStart + promoter.length, end: scaffoldStart, strand: 'forward' }],
      },
      {
        id: 'annotated-scaffold',
        name: 'gRNA scaffold',
        type: 'misc_RNA',
        color: themeFixturePalette.grayLong,
        locations: [{ start: scaffoldStart, end: scaffoldStart + scaffold.length, strand: 'forward' }],
      },
    ]
    const result = detectCrispr(record(sequence, features), { commonFeatures: [], restrictionEnzymes: [BsmBI] })

    expect(result.guideScaffoldFindings.map((finding) => finding.name)).toEqual(['gRNA scaffold'])
    expect(result.cassetteFindings).toHaveLength(1)
    expect(result.cassetteFindings[0]?.architecture).toBe('removable-stuffer')
    expect(result.cassetteFindings[0]?.promoterName).toBe('U6 promoter')
  })

  it('does not call an arbitrary internal Type IIS pair a removable stuffer', () => {
    const promoter = dna(100, 127)
    const scaffold = dna(76, 129)
    const u6 = template('U6 promoter', promoter, 'RNA polymerase III promoter')
    const guide = template('gRNA scaffold', scaffold, 'guide RNA scaffold')
    const sequence = `${dna(25, 131)}${promoter}${'T'.repeat(600)}CGTCTC${'A'.repeat(700)}CGTCTC${'T'.repeat(8)}${scaffold}${dna(100, 133)}`
    const result = detectCrispr(record(sequence), { commonFeatures: [u6, guide], restrictionEnzymes: [BsmBI] })

    expect(result.cassetteFindings).toEqual([])
  })

  it('rejects enzymes with more than two sites anywhere in the plasmid', () => {
    const scaffold = dna(76, 83)
    const guide = template('gRNA scaffold', scaffold, 'guide RNA scaffold')
    const sequence = `${'A'.repeat(12)}CGTCTC${'A'.repeat(20)}CGTCTC${'T'.repeat(20)}${scaffold}${'A'.repeat(80)}CGTCTC`
    const result = detectCrispr(record(sequence), { commonFeatures: [guide], restrictionEnzymes: [BsmBI] })

    expect(result.cassetteFindings).toEqual([])
  })

  it('rejects nearby recognition sites when their cuts leave an implausibly long spacer slot', () => {
    const scaffold = dna(76, 89)
    const guide = template('gRNA scaffold', scaffold, 'guide RNA scaffold')
    const sequence = `${'A'.repeat(12)}CGTCTC${'A'.repeat(55)}CGTCTC${'T'.repeat(20)}${scaffold}`
    const result = detectCrispr(record(sequence), { commonFeatures: [guide], restrictionEnzymes: [BsmBI] })

    expect(result.cassetteFindings).toEqual([])
  })

  it('returns only the paired enzyme sites that cut a plausible spacer slot', () => {
    const scaffold = dna(76, 97)
    const guide = template('gRNA scaffold', scaffold, 'guide RNA scaffold')
    const bbsI = enzymes.find((enzyme) => enzyme.name === 'BbsI')!
    const sequence = `${'A'.repeat(12)}CGTCTC${'A'.repeat(20)}CGTCTC${'T'.repeat(20)}${scaffold}${'A'.repeat(100)}GAAGAC`
    const result = detectCrispr(record(sequence), { commonFeatures: [guide], restrictionEnzymes: [BsmBI, bbsI] })

    expect(result.cassetteFindings).toHaveLength(1)
    expect(result.cassetteFindings[0]?.nearbyTypeIisSites.map((site) => site.enzymeName)).toEqual(['BsmBI', 'BsmBI'])
    expect(result.cassetteFindings[0]?.evidence.some((item) => item.includes('spacer slot'))).toBe(true)
  })

  it('detects a reverse-strand spacer cassette from its cut geometry', () => {
    const scaffold = dna(76, 101)
    const promoter = dna(100, 103)
    const guide = template('gRNA scaffold', scaffold, 'guide RNA scaffold')
    const u6 = template('U6 promoter', promoter, 'RNA polymerase III promoter')
    const forwardOriented = `${promoter}${'T'.repeat(4)}GAAGAC${'A'.repeat(16)}GAAGAC${'T'.repeat(8)}${scaffold}`
    const result = detectCrispr(record(reverseComplement(forwardOriented)), {
      commonFeatures: [guide, u6],
      restrictionEnzymes: [enzymes.find((enzyme) => enzyme.name === 'BbsI')!],
    })

    expect(result.guideScaffoldFindings[0]?.strand).toBe('reverse')
    expect(result.cassetteFindings).toHaveLength(1)
    expect(result.cassetteFindings[0]?.strand).toBe('reverse')
  })

  it('detects the OriGene pCas-Guide BamHI+BsmBI spacer cassette even when BsmBI cuts into the scaffold', () => {
    const promoter = 'A'.repeat(100)
    const scaffold = 'GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC'
    // Exact junction context from pCas-Guide-P2A-tagRFP: BamHI bounds the
    // promoter side and BsmBI/Esp3I cuts into the initial scaffold bases.
    const cloningRegion = 'GCGGGATCCACTGGACCAGGCAGCAGCGTCAGAAGACTTTTTTGGAACGTCTC'
    const sequence = `${'C'.repeat(25)}${promoter}${cloningRegion}${scaffold}${'C'.repeat(50)}`
    const promoterStart = 25
    const scaffoldStart = promoterStart + promoter.length + cloningRegion.length
    const features: SequenceFeature[] = [
      {
        id: 'u6', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.grayLong,
        locations: [{ start: promoterStart, end: promoterStart + promoter.length, strand: 'forward' }],
      },
      {
        id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.grayLong,
        locations: [{ start: scaffoldStart, end: scaffoldStart + scaffold.length, strand: 'forward' }],
      },
    ]
    const result = detectCrispr(record(sequence, features), {
      commonFeatures: [],
      restrictionEnzymes: [enzyme('BamHI'), enzyme('BsmBI'), enzyme('Esp3I')],
    })

    expect(result.cassetteFindings).toHaveLength(1)
    expect(result.cassetteFindings[0]?.architecture).toBe('direct-spacer')
    expect(result.cassetteFindings[0]?.cloningPair).toBe('BamHI + BsmBI/Esp3I')
    expect(result.cassetteFindings[0]?.nearbyTypeIisSites.map((site) => site.enzymeName)).toEqual(['BsmBI', 'BamHI'])
    expect(result.cassetteFindings[0]?.evidence.some((item) => item.includes('50 nt cleavage span'))).toBe(true)
    expect(result.recommendations.find((item) => item.title === 'BamHI + BsmBI/Esp3I spacer cloning')?.detail).toContain('20 nt spacer')
  })

  it.each([
    {
      pairName: 'BlpI + BstXI',
      upstreamSite: 'CCACCTTGTTGG',
      downstreamSite: 'GCTAAGC',
      enzymeNames: ['BlpI', 'BstXI'],
      guideSequence: 'GACCAGGATGGGCACCACCC',
      scaffoldPrefix: 'GTTTAAGAGC',
    },
    {
      pairName: 'BclI + SwaI',
      upstreamSite: 'TGATCA',
      downstreamSite: 'ATTTAAAT',
      enzymeNames: ['BclI', 'SwaI'],
      guideSequence: 'C'.repeat(20),
      scaffoldPrefix: 'GCTAGAAATAGCAAGTTAAA',
    },
  ])('detects the explicit $pairName spacer-cloning recipe', ({ pairName, upstreamSite, downstreamSite, enzymeNames, guideSequence, scaffoldPrefix }) => {
    const promoter = 'A'.repeat(100)
    const scaffoldSuffix = 'GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC'
    const gap = `${upstreamSite}${guideSequence}${scaffoldPrefix}${downstreamSite}`
    const scaffold = `${scaffoldPrefix}${downstreamSite}${scaffoldSuffix}`
    const sequence = `${'C'.repeat(25)}${promoter}${gap}${scaffoldSuffix}${'C'.repeat(40)}`
    const promoterStart = 25
    const scaffoldStart = promoterStart + promoter.length + upstreamSite.length + guideSequence.length
    const features: SequenceFeature[] = [
      {
        id: 'u6', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.grayLong,
        locations: [{ start: promoterStart, end: promoterStart + promoter.length, strand: 'forward' }],
      },
      {
        id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.grayLong,
        locations: [{ start: scaffoldStart, end: scaffoldStart + scaffold.length, strand: 'forward' }],
      },
    ]
    const result = detectCrispr(record(sequence, features), {
      commonFeatures: [],
      restrictionEnzymes: enzymeNames.map(enzyme),
    })

    const mixedFinding = result.cassetteFindings.find((finding) => finding.cloningPair === pairName)
    expect(mixedFinding).toBeDefined()
    expect(mixedFinding?.architecture).toBe('direct-spacer')
  })

  it.each([
    ['BamHI', 'NotI', 'GGATCC', 'GCGGCCGC'],
    ['BamHI', 'EcoRI', 'GGATCC', 'GAATTC'],
    ['BglII', 'BamHI', 'AGATCT', 'GGATCC'],
  ])('does not reinterpret the %s+%s cassette-transfer pair as spacer cloning', (firstName, secondName, firstSite, secondSite) => {
    const promoter = 'A'.repeat(100)
    const scaffold = 'GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC'
    const gap = `${firstSite}${'C'.repeat(20)}${secondSite}`
    const sequence = `${'C'.repeat(25)}${promoter}${gap}${scaffold}`
    const promoterStart = 25
    const scaffoldStart = promoterStart + promoter.length + gap.length
    const features: SequenceFeature[] = [
      {
        id: 'u6', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.grayLong,
        locations: [{ start: promoterStart, end: promoterStart + promoter.length, strand: 'forward' }],
      },
      {
        id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.grayLong,
        locations: [{ start: scaffoldStart, end: scaffoldStart + scaffold.length, strand: 'forward' }],
      },
    ]
    const result = detectCrispr(record(sequence, features), {
      commonFeatures: [],
      restrictionEnzymes: [enzyme(firstName), enzyme(secondName)],
    })

    expect(result.cassetteFindings).toEqual([])
  })

  it('rejects a supported mixed pair when either enzyme cuts more than twice in the plasmid', () => {
    const promoter = 'A'.repeat(100)
    const scaffold = 'GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC'
    const gap = `GGATCC${'C'.repeat(24)}CGTCTC`
    const sequence = `GGATCC${'C'.repeat(20)}GGATCC${'C'.repeat(25)}${promoter}${gap}${scaffold}`
    const promoterStart = 57
    const scaffoldStart = promoterStart + promoter.length + gap.length
    const features: SequenceFeature[] = [
      {
        id: 'u6', name: 'U6 promoter', type: 'promoter', color: themeFixturePalette.grayLong,
        locations: [{ start: promoterStart, end: promoterStart + promoter.length, strand: 'forward' }],
      },
      {
        id: 'scaffold', name: 'gRNA scaffold', type: 'misc_RNA', color: themeFixturePalette.grayLong,
        locations: [{ start: scaffoldStart, end: scaffoldStart + scaffold.length, strand: 'forward' }],
      },
    ]
    const result = detectCrispr(record(sequence, features), {
      commonFeatures: [],
      restrictionEnzymes: [enzyme('BamHI'), enzyme('BsmBI')],
    })

    expect(result.cassetteFindings.some((finding) => finding.cloningPair === 'BamHI + BsmBI/Esp3I')).toBe(false)
  })

  it('returns explanatory recommendations and no findings when there is no CRISPR evidence', () => {
    const result = detectCrispr(record('C'.repeat(1200)), { commonFeatures: [], restrictionEnzymes: [] })

    expect(result.nucleaseFindings).toEqual([])
    expect(result.guideScaffoldFindings).toEqual([])
    expect(result.cassetteFindings).toEqual([])
    expect(result.recommendations.some((recommendation) => recommendation.title === 'Nuclease not identified')).toBe(true)
  })

  it('does not promote short Cas labels, but reports a unique adjacent Type IIS insertion junction', () => {
    const scaffold = dna(76, 67)
    const features: SequenceFeature[] = [
      {
        id: 'short-cas-label',
        name: 'Cas9',
        type: 'misc_feature',
        color: themeFixturePalette.grayLong,
        locations: [{ start: 0, end: 12, strand: 'forward' }],
      },
    ]
    const sequence = `${dna(40, 71)}GAAGAC${'T'.repeat(18)}${scaffold}${dna(40, 73)}`
    const result = detectCrispr(record(sequence, features), {
      commonFeatures: [template('gRNA scaffold', scaffold, 'guide RNA scaffold')],
      restrictionEnzymes: [enzymes.find((enzyme) => enzyme.name === 'BbsI')!],
    })

    expect(result.nucleaseFindings).toEqual([])
    expect(result.guideScaffoldFindings).toHaveLength(1)
    expect(result.cassetteFindings).toHaveLength(1)
    expect(result.cassetteFindings[0]?.nearbyTypeIisSites).toHaveLength(1)
    expect(result.cassetteFindings[0]?.confidence).toBe('low')
    expect(result.cassetteFindings[0]?.evidence.some((item) => item.includes('Single-cut insertion junction'))).toBe(true)
    expect(result.recommendations.find((item) => item.title === 'Check the cloning sites')?.detail).toContain('second junction')
  })

  it('resolves a circular overhang that crosses the sequence origin', () => {
    const scaffold = dna(76, 107)
    const sequence = dna(100, 109).split('')
    sequence.splice(10, scaffold.length, ...scaffold)
    for (const [offset, base] of 'GAAGAC'.split('').entries()) sequence[(90 + offset) % sequence.length] = base
    sequence[98] = 'A'
    sequence[99] = 'C'
    sequence[0] = 'G'
    sequence[1] = 'T'
    const guide = template('gRNA scaffold', scaffold, 'guide RNA scaffold')
    const result = detectCrispr(record(sequence.join(''), [], 'circular'), {
      commonFeatures: [guide],
      restrictionEnzymes: [enzymes.find((enzyme) => enzyme.name === 'BbsI')!],
    })

    expect(result.cassetteFindings).toHaveLength(1)
    expect(result.cassetteFindings[0]?.nearbyTypeIisSites[0]?.overhangSequence).toBe('ACGT')
  })
})
