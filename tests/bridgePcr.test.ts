import { describe, expect, it } from 'vitest'
import {
  createBridgePcrProductRecord,
  designExternalBridgePrimers,
  findBestSequenceJunction,
  longestEndOverlap,
  resolveBridgeFusion,
  type BridgeFragmentProduct,
} from '../src/domain/bridgePcr'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultDnaEnds } from '../src/domain/dnaEnds'
import type { PcrAmplicon } from '../src/domain/pcr'
import type { SequenceRecord } from '../src/domain/types'

function stubTemplate(name: string, sequence: string): SequenceRecord {
  return {
    id: name,
    name,
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    dnaEnds: defaultDnaEnds(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function stubAmplicon(sequence: string): PcrAmplicon {
  return {
    id: 'amp',
    regionStart: 0,
    regionEnd: sequence.length,
    productSize: sequence.length,
    sequence,
    forwardAnnealStart: 0,
    forwardAnnealEnd: 20,
    reverseAnnealStart: sequence.length - 20,
    reverseAnnealEnd: sequence.length,
  }
}

function fragment(index: number, sequence: string, sourceName: string): BridgeFragmentProduct {
  const template = stubTemplate(sourceName, sequence + 'NNNN')
  return {
    index,
    sequence,
    sourceName,
    productSize: sequence.length,
    amplicon: stubAmplicon(sequence),
    template,
    forwardPrimer: { name: `F${index}`, sequence: sequence.slice(0, 20), phosphorylated: false },
    reversePrimer: { name: `R${index}`, sequence: sequence.slice(-20), phosphorylated: false },
    polymerase: 'blunt',
  }
}

describe('bridge / overlap-extension PCR', () => {
  it('finds suffix/prefix overlaps', () => {
    const left = 'AAAAAAAAAAGGGGGGGGGGTTTTTTTTTT'
    const right = 'GGGGGGGGGGTTTTTTTTTTCCCCCCCCCC'
    expect(longestEndOverlap(left, right)).toBe(20)
  })

  it('finds large internal overlaps behind primer-like flanks', () => {
    const shared = 'ACGTACGTACGTACGTACGT'.repeat(15) // 300 bp
    const frag1 = 'TTTTTTTTTTTTTTTTTTTT' + shared + 'GGGGGGGGGGGGGGGGGGGG'
    const frag2 = 'AAAAAAAAAAAAAAAAAAAA' + shared + 'CCCCCCCCCCCCCCCCCCCC'
    const junction = findBestSequenceJunction(frag1, frag2)
    expect(junction?.overlapLength).toBe(300)
    expect(resolveBridgeFusion([fragment(0, frag1, 'A'), fragment(1, frag2, 'B')]).ready).toBe(true)
    expect(resolveBridgeFusion([fragment(0, frag1, 'A'), fragment(1, frag2, 'B')]).junctions[0]?.overlapLength).toBe(
      300,
    )
  })

  it('arranges two overlapping fragments and reports overlap Tm', () => {
    const overlap = 'ACGTACGTACGTACGTACGTACGTACGTAC' // 30 bp
    const frag1 = 'ATCGATCGATCGATCG' + overlap
    const frag2 = overlap + 'GGTTAACCGGTTAACC'
    const fusion = resolveBridgeFusion([fragment(0, frag1, 'SourceA.dna'), fragment(1, frag2, 'SourceB.dna')])
    expect(fusion.ready).toBe(true)
    expect(fusion.ordered.map((part) => part.originalIndex)).toEqual([0, 1])
    expect(fusion.junctions[0]?.overlapLength).toBe(30)
    expect(fusion.productSize).toBe(frag1.length + frag2.length - 30)
    expect(fusion.fusedSequence).toBe('ATCGATCGATCGATCG' + overlap + 'GGTTAACCGGTTAACC')
  })

  it('flips order when fragment 2 should be on the left', () => {
    const overlap = 'ACGTACGTACGTACGTACGTACGTACGTAC'
    const frag1 = overlap + 'T'.repeat(200)
    const frag2 = 'G'.repeat(200) + overlap
    const fusion = resolveBridgeFusion([fragment(0, frag1, 'A'), fragment(1, frag2, 'B')])
    expect(fusion.ready).toBe(true)
    expect(fusion.ordered.map((part) => part.originalIndex)).toEqual([1, 0])
  })

  it('designs external primers and builds a fused product record', () => {
    const overlap = 'ACGTACGTACGTACGTACGTACGTACGTAC'
    const frag1 = 'ATCGATCGATCGATCGATCGATCGATCGAT' + overlap
    const frag2 = overlap + 'GGTTAACCGGTTAACCGGTTAACCGGTTAA'
    const products = [fragment(0, frag1, 'SourceA'), fragment(1, frag2, 'SourceB')]
    const fusion = resolveBridgeFusion(products)
    expect(fusion.ready).toBe(true)
    const primers = designExternalBridgePrimers(fusion.fusedSequence, 55, 'Bridge')
    expect(primers.forward.sequence.length).toBeGreaterThanOrEqual(18)
    expect(primers.reverse.sequence.length).toBeGreaterThanOrEqual(18)
    const record = createBridgePcrProductRecord({
      fusion,
      fragmentProducts: products,
      name: 'Amplified.dna',
      forwardPrimer: primers.forward,
      reversePrimer: primers.reverse,
      polymerase: 'blunt',
    })
    expect(record.sequence).toBe(fusion.fusedSequence)
    expect(record.topology).toBe('linear')
    expect(record.history?.operation).toBe('overlapAndAmplify')
    expect(record.features.some((feature) => feature.name === 'Fragment 1')).toBe(false)
    expect(record.features.some((feature) => feature.name === 'Fragment 2')).toBe(false)
  })

  it('keeps Fragment 1→2 forward order for same-template overlapping products', () => {
    const overlap = 'ACGTACGTACGTACGTACGT'.repeat(10)
    const frag1 = 'TTTTTTTTTTTTTTTTTTTT'.repeat(3) + overlap
    const frag2 = overlap + 'GGGGGGGGGGGGGGGGGGGG'.repeat(3)
    const template = stubTemplate('Same.dna', frag1 + 'NNNN' + frag2)
    const products = [
      { ...fragment(0, frag1, 'Same.dna'), template },
      { ...fragment(1, frag2, 'Same.dna'), template },
    ]
    const fusion = resolveBridgeFusion(products)
    expect(fusion.ready).toBe(true)
    expect(fusion.ordered.map((part) => part.originalIndex)).toEqual([0, 1])
    expect(fusion.ordered.every((part) => part.orientation === 'forward')).toBe(true)
    expect(fusion.fusedSequence.startsWith('TTTTTTTTTTTTTTTTTTTT')).toBe(true)
  })

  it('joins same-template features split across the overlap instead of duplicating them', () => {
    const leftUnique = 'A'.repeat(80)
    const overlap = 'ACGTACGTACGTACGTACGT'.repeat(5) // 100 bp
    const rightUnique = 'G'.repeat(80)
    const templateSequence = leftUnique + overlap + rightUnique
    const template = stubTemplate('Same.dna', templateSequence)
    template.features = [
      {
        id: 'gene-x',
        name: 'GeneX',
        type: 'CDS',
        color: '#cc0000',
        locations: [{ start: 40, end: 220, strand: 'forward' }],
      },
    ]

    const frag1Start = 0
    const frag1End = leftUnique.length + overlap.length
    const frag2Start = leftUnique.length
    const frag2End = templateSequence.length
    const frag1Seq = templateSequence.slice(frag1Start, frag1End)
    const frag2Seq = templateSequence.slice(frag2Start, frag2End)

    const products: BridgeFragmentProduct[] = [
      {
        ...fragment(0, frag1Seq, 'Same.dna'),
        template,
        amplicon: {
          id: 'amp0',
          regionStart: frag1Start,
          regionEnd: frag1End,
          productSize: frag1Seq.length,
          sequence: frag1Seq,
          forwardAnnealStart: frag1Start,
          forwardAnnealEnd: frag1Start + 20,
          reverseAnnealStart: frag1End - 20,
          reverseAnnealEnd: frag1End,
        },
      },
      {
        ...fragment(1, frag2Seq, 'Same.dna'),
        template,
        amplicon: {
          id: 'amp1',
          regionStart: frag2Start,
          regionEnd: frag2End,
          productSize: frag2Seq.length,
          sequence: frag2Seq,
          forwardAnnealStart: frag2Start,
          forwardAnnealEnd: frag2Start + 20,
          reverseAnnealStart: frag2End - 20,
          reverseAnnealEnd: frag2End,
        },
      },
    ]

    const fusion = resolveBridgeFusion(products)
    expect(fusion.ready).toBe(true)
    const primers = designExternalBridgePrimers(fusion.fusedSequence, 55, 'Bridge')
    const record = createBridgePcrProductRecord({
      fusion,
      fragmentProducts: products,
      name: 'Fused.dna',
      forwardPrimer: primers.forward,
      reversePrimer: primers.reverse,
      polymerase: 'blunt',
    })

    const geneFeatures = record.features.filter((feature) => feature.name === 'GeneX')
    expect(geneFeatures).toHaveLength(1)
    expect(geneFeatures[0]?.color).toBe('#cc0000')
    expect(geneFeatures[0]?.locations).toEqual([{ start: 40, end: 220, strand: 'forward' }])
    expect(record.features.some((feature) => /^Fragment \d+$/.test(feature.name))).toBe(false)
  })

  it('keeps a CDS frame anchored when OE-PCR joins UTR and downstream CDS pieces', () => {
    const overlap = 'ACGT'.repeat(10)
    const templateSequence = 'A'.repeat(80) + overlap + 'G'.repeat(80)
    const template = stubTemplate('framed.dna', templateSequence)
    template.features = [{
      id: 'cds-source',
      name: 'CDS',
      type: 'CDS',
      color: '#2563eb',
      translateInSequenceView: true,
      locations: [{ start: 20, end: 180, strand: 'forward' }],
      translation: {
        geneticCode: 'Standard',
        firstCodonAsMet: false,
        readingFrame: 1,
        consecutiveNumbering: true,
        segmentNumbering: [{ startAt: 1, skip: false }],
      },
    }]
    const left = templateSequence.slice(0, 120)
    const right = templateSequence.slice(80)
    const products: BridgeFragmentProduct[] = [
      {
        ...fragment(0, left, 'framed.dna'),
        template,
        amplicon: {
          id: 'framed-left', regionStart: 0, regionEnd: 120, productSize: 120, sequence: left,
          forwardAnnealStart: 0, forwardAnnealEnd: 20, reverseAnnealStart: 100, reverseAnnealEnd: 120,
        },
      },
      {
        ...fragment(1, right, 'framed.dna'),
        template,
        amplicon: {
          id: 'framed-right', regionStart: 80, regionEnd: 200, productSize: 120, sequence: right,
          forwardAnnealStart: 80, forwardAnnealEnd: 100, reverseAnnealStart: 180, reverseAnnealEnd: 200,
        },
      },
    ]
    const fusion = resolveBridgeFusion(products)
    const primers = designExternalBridgePrimers(fusion.fusedSequence, 55, 'Bridge')
    const record = createBridgePcrProductRecord({
      fusion, fragmentProducts: products, name: 'Framed.dna',
      forwardPrimer: primers.forward, reversePrimer: primers.reverse, polymerase: 'blunt',
    })
    const cds = record.features.find((feature) => feature.name === 'CDS')
    expect(cds?.locations).toEqual([{ start: 20, end: 180, strand: 'forward' }])
    expect(cds?.sourceTranslationAnchor).toBe(20)
    expect(cds?.translation?.readingFrame).toBe(1)
    expect(cds?.color).toBe('#2563eb')
  })

  it('keeps a partial fusion schema when only middle fragments overlap', () => {
    const overlap = 'ACGTACGTACGTACGTACGT'.repeat(8)
    const frag1 = 'ATATCTCTAGAGCGCGCGAT'.repeat(6)
    const frag2 = 'GGTACCGGTTAACCATGCAA'.repeat(4) + overlap
    const frag3 = overlap + 'TTGCGCAATTGGCCGGATTA'.repeat(4)
    const frag4 = 'CCTTAAGGAATTCCCGGGAT'.repeat(6)
    const fusion = resolveBridgeFusion(
      [
        fragment(0, frag1, 'A'),
        fragment(1, frag2, 'B'),
        fragment(2, frag3, 'C'),
        fragment(3, frag4, 'D'),
      ],
      { allFragmentIndices: [0, 1, 2, 3] },
    )
    expect(fusion.ready).toBe(false)
    expect(fusion.ordered.map((part) => part.originalIndex)).toEqual([1, 2])
    expect(fusion.junctions).toHaveLength(1)
    expect(fusion.fusedSequence.length).toBeGreaterThan(0)
    expect(fusion.unfusedIndices).toEqual([0, 3])
    expect(fusion.message).toMatch(/Partial fusion/)
    expect(fusion.message).toMatch(/Fragment 1/)
    expect(fusion.message).toMatch(/Fragment 4/)
  })

  it('recovers a reordered chain when tab order is 2→1→4→3', () => {
    const o12 = 'AAAACCCCGGGGTTTTAAAA'.repeat(4)
    const o23 = 'GGGGTTTTAAAACCCCGGGG'.repeat(4)
    const o34 = 'TTTTAAAACCCCGGGGTTTT'.repeat(4)
    const u1 = 'ATAT'.repeat(30)
    const u2 = 'GCGC'.repeat(30)
    const u3 = 'TTAA'.repeat(30)
    const u4 = 'CCGG'.repeat(30)
    const genome1 = u1 + o12
    const genome2 = o12 + u2 + o23
    const genome3 = o23 + u3 + o34
    const genome4 = o34 + u4
    // Tabs filled out of genome order: Fragment1=g2, Fragment2=g1, Fragment3=g4, Fragment4=g3
    const products = [
      fragment(0, genome2, 'Same.dna'),
      fragment(1, genome1, 'Same.dna'),
      fragment(2, genome4, 'Same.dna'),
      fragment(3, genome3, 'Same.dna'),
    ]
    const template = stubTemplate('Same.dna', genome1 + genome2 + genome3 + genome4)
    for (const product of products) product.template = template

    const withoutFragment3 = resolveBridgeFusion(
      [products[0]!, products[1]!, products[3]!],
      { allFragmentIndices: [0, 1, 2, 3] },
    )
    expect(withoutFragment3.ordered.map((part) => part.originalIndex)).toEqual([1, 0, 3])
    expect(withoutFragment3.fusedSequence.length).toBeGreaterThan(0)

    const all = resolveBridgeFusion(products, { allFragmentIndices: [0, 1, 2, 3] })
    expect(all.ready).toBe(true)
    expect(all.ordered.map((part) => part.originalIndex)).toEqual([1, 0, 3, 2])
    expect(all.junctions).toHaveLength(3)
  })

  it('fuses same-template SOE fragments even when tabs are shuffled 2→1→4→3', () => {
    // Synthetic overlaps on one template.
    const o12 = 'ATAAAGGTCCCCTACGTGTTGACACAGGTAGT' // 32
    const o23 = 'ACGAGGTCTTGGCGAGAGGACGTATTG' // 27
    const o34 = 'AGAGCTAAGTTTCCATTACAAGTGTTTAGCAAAGCGCTCA' // 40
    const u1 = 'GCACGTGAGATCTGAATTCAACAG'.repeat(20)
    const u2 = 'TTCTTCTCAGAGGACGGAGCTG'.repeat(3)
    const u3 = 'CCTGCAAAATGC'.repeat(30)
    const u4 = 'GCAGGTTTTTATTACAAC'.repeat(25)
    const seg1 = u1 + o12
    const seg2 = o12 + u2 + o23
    const seg3 = o23 + u3 + o34
    const seg4 = o34 + u4
    const template = stubTemplate('example.dna', seg1 + 'N' + seg2 + 'N' + seg3 + 'N' + seg4)
    const products = [
      { ...fragment(0, seg2, 'example.dna'), template },
      { ...fragment(1, seg1, 'example.dna'), template },
      { ...fragment(2, seg4, 'example.dna'), template },
      { ...fragment(3, seg3, 'example.dna'), template },
    ]

    const fusion = resolveBridgeFusion(products, { allFragmentIndices: [0, 1, 2, 3] })
    expect(fusion.ready).toBe(true)
    expect(fusion.ordered.map((part) => part.originalIndex)).toEqual([1, 0, 3, 2])
    expect(fusion.junctions.map((junction) => junction.overlapLength)).toEqual([32, 27, 40])
  })
})
