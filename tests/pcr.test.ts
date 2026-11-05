import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { defaultDnaEnds } from '../src/domain/dnaEnds'
import {
  ampliconRangeForFacingPrimerSelection,
  createPcrProductRecord,
  designPcrPrimerPair,
  listPcrAmplicons,
} from '../src/domain/pcr'
import { reverseComplement } from '../src/domain/sequence'
import type { SequenceRecord } from '../src/domain/types'
import { resolveDisplayableLayoutsForPrimer } from '../src/domain/primerSequenceLayout'
import { createRestrictionCloningProductLibrary } from '../src/domain/restrictionCloningBatch'
import { sequenceRecordFromLibraryMember } from '../src/domain/libraryMemberRecord'

function template(sequence: string): SequenceRecord {
  return {
    id: 'template',
    name: 'Template',
    description: '',
    molecule: 'dna',
    topology: 'circular',
    sequence,
    features: [
      {
        id: 'feat1',
        name: 'CDS1',
        type: 'CDS',
        color: '#f00',
        locations: [{ start: 20, end: 80, strand: 'forward' }],
      },
    ],
    primers: [
      {
        id: 'parent-primer',
        name: 'ParentPrimer',
        sequence: 'ACGTACGTACGTACGTACGT',
        color: '#0af',
        bindings: [{ strand: 'forward', templateStart: 30, templateEnd: 50, components: [{ primerBases: 'ACGTACGTACGTACGTACGT', templateStart: 30, templateEnd: 50 }] }],
      },
    ],
    operations: [],
    history: {
      id: 'hist-parent',
      name: 'Template.dna',
      seqLen: sequence.length,
      circular: true,
      operation: 'invalid',
      resurrectable: true,
      hideHistory: false,
      oligos: [],
      regeneratedSites: [],
      inputSummaries: [],
      features: [],
      children: [],
    },
    construct: { ...defaultConstructProperties },
    dnaEnds: defaultDnaEnds(),
    createdAt: '',
    updatedAt: '',
  }
}

describe('PCR product creation', () => {
  it('keeps an IUPAC-degenerate PCR primer visibly annealed in product libraries', () => {
    const forwardSequence = 'GAACAGACCACCATGTCTAGASARKTGCRRSTSGTRGAGWCYGKGGGRGG'
    const reverseSequence = 'GGTACCGGTACCGGTACC'
    const productSequence = `${forwardSequence}${'A'.repeat(60)}${reverseComplement(reverseSequence)}`
    const record = template(productSequence)
    record.topology = 'linear'
    record.features = []
    record.primers = []
    const product = createPcrProductRecord({
      template: record,
      amplicon: {
        id: 'degenerate-amplicon',
        regionStart: 0,
        regionEnd: productSequence.length,
        productSize: productSequence.length,
        sequence: productSequence,
        forwardAnnealStart: 0,
        forwardAnnealEnd: forwardSequence.length,
        reverseAnnealStart: productSequence.length - reverseSequence.length,
        reverseAnnealEnd: productSequence.length,
      },
      name: 'Degenerate product',
      forwardPrimer: {
        name: 'Degenerate forward',
        sequence: forwardSequence,
        phosphorylated: false,
      },
      reversePrimer: {
        name: 'Reverse',
        sequence: reverseSequence,
        phosphorylated: false,
      },
      polymerase: 'blunt',
    })
    const library = createRestrictionCloningProductLibrary([product], 'PCR products')
    const member = sequenceRecordFromLibraryMember(library.traceFiles![0]!, {
      topology: library.topology,
    })

    for (const candidate of [product, library, member]) {
      const primer = candidate.primers.find((entry) => entry.name === 'Degenerate forward')
      expect(primer).toBeDefined()
      expect(resolveDisplayableLayoutsForPrimer(candidate.sequence, primer!)).not.toHaveLength(0)
    }
  })

  it('inherits clipped features, primers, and parental history', () => {
    const record = template(`${'GATC'.repeat(80)}${'ACGT'.repeat(80)}`)
    const pair = designPcrPrimerPair(record, 10, 120, 45)
    const forwardLen = pair.forward.sequence.length
    const reverseLen = pair.reverse.sequence.length
    const middle = 'A'.repeat(90)
    const product = createPcrProductRecord({
      template: record,
      amplicon: {
        id: 'amp1',
        regionStart: 10,
        regionEnd: 120,
        productSize: forwardLen + middle.length + reverseLen,
        sequence: `${pair.forward.sequence}${middle}${pair.reverse.sequence}`,
        forwardAnnealStart: 10,
        forwardAnnealEnd: 10 + forwardLen,
        reverseAnnealStart: 120 - reverseLen,
        reverseAnnealEnd: 120,
      },
      name: 'Amplified.dna',
      forwardPrimer: pair.forward,
      reversePrimer: pair.reverse,
      polymerase: 'a-overhang',
    })

    expect(product.name).toBe('Amplified')
    expect(product.topology).toBe('linear')
    expect(product.features.some((feature) => feature.name === 'CDS1')).toBe(true)
    expect(product.features.find((feature) => feature.name === 'CDS1')!.locations[0]!.start).toBeGreaterThanOrEqual(0)
    expect(product.primers.some((primer) => primer.name === 'ParentPrimer')).toBe(true)
    expect(product.primers.some((primer) => primer.name === pair.forward.name)).toBe(true)
    expect(product.history?.operation).toBe('amplifyFragment')
    expect(product.history?.children[0]?.id).toBe('hist-parent')
    // Live template features/primers must be snapshotted even when history XML was empty.
    expect(product.history?.children[0]?.features.some((feature) => feature.name === 'CDS1')).toBe(true)
    expect(product.history?.children[0]?.primers?.some((primer) => primer.name === 'ParentPrimer')).toBe(true)
    expect(product.history?.children[0]?.sequence).toBe(record.sequence)
    expect(product.history?.oligos).toHaveLength(2)
    expect(product.traceFiles).toBeUndefined()
  })

  it('clips parental primers that only partially overlap the amplicon', () => {
    // Build a template where a known oligo anneals across the amplicon boundary.
    const left = 'GATC'.repeat(5) // 0..20
    const oligo = 'ACGTACGTACGTACGTACGT' // 20 bp
    const mid = 'TTTT'.repeat(20)
    const right = 'GATC'.repeat(40)
    const sequence = `${left}${oligo}${mid}${right}`
    const record = template(sequence)
    // Binding starts 5 bp before amplicon start (25), ends inside: partial overlap.
    record.primers = [
      {
        id: 'partial',
        name: 'PartialPrimer',
        sequence: oligo,
        color: '#0af',
        bindings: [
          {
            strand: 'forward',
            templateStart: 15,
            templateEnd: 35,
            components: [{ primerBases: oligo, templateStart: 15, templateEnd: 35 }],
          },
        ],
      },
    ]
    const ampliconStart = 25
    const ampliconEnd = 25 + oligo.length + mid.length
    const pair = designPcrPrimerPair(record, ampliconStart, ampliconEnd, 45)
    const forwardLen = pair.forward.sequence.length
    const reverseLen = pair.reverse.sequence.length
    const product = createPcrProductRecord({
      template: record,
      amplicon: {
        id: 'amp1',
        regionStart: ampliconStart,
        regionEnd: ampliconEnd,
        productSize: forwardLen + (ampliconEnd - ampliconStart) + reverseLen,
        sequence: `${pair.forward.sequence}${sequence.slice(ampliconStart, ampliconEnd)}${pair.reverse.sequence}`,
        forwardAnnealStart: ampliconStart,
        forwardAnnealEnd: ampliconStart + forwardLen,
        reverseAnnealStart: ampliconEnd - reverseLen,
        reverseAnnealEnd: ampliconEnd,
      },
      name: 'Amplified.dna',
      forwardPrimer: pair.forward,
      reversePrimer: pair.reverse,
      polymerase: 'a-overhang',
    })

    const inherited = product.primers.find((primer) => primer.name === 'PartialPrimer')
    expect(inherited).toBeTruthy()
    expect(inherited!.bindings?.length).toBeGreaterThan(0)
  })

  it('preserves parental primer colors for PCR primers matched on the template', () => {
    const anneal = 'GACCACCATGTCAACGTTGG'
    const mid = 'ATGC'.repeat(15)
    const revAnneal = 'CCAACGTTGACATGGTGGTC'
    const record = template(`N`.repeat(20) + anneal + mid + reverseComplement(revAnneal) + `N`.repeat(20))
    record.primers = [
      {
        id: 'pf',
        name: 'CustomFwd',
        sequence: anneal,
        color: '#16a34a',
        bindings: [
          {
            strand: 'forward',
            templateStart: 20,
            templateEnd: 40,
            components: [{ primerBases: anneal, templateStart: 20, templateEnd: 40 }],
          },
        ],
      },
      {
        id: 'pr',
        name: 'CustomRev',
        sequence: revAnneal,
        color: '#ca8a04',
        bindings: [
          {
            strand: 'reverse',
            templateStart: 20 + anneal.length + mid.length,
            templateEnd: 20 + anneal.length + mid.length + revAnneal.length,
            components: [
              {
                primerBases: revAnneal,
                templateStart: 20 + anneal.length + mid.length,
                templateEnd: 20 + anneal.length + mid.length + revAnneal.length,
              },
            ],
          },
        ],
      },
    ]
    const amplicons = listPcrAmplicons(
      record,
      { name: 'CustomFwd', sequence: anneal, phosphorylated: false },
      { name: 'CustomRev', sequence: revAnneal, phosphorylated: false },
    )
    expect(amplicons.length).toBeGreaterThan(0)
    const product = createPcrProductRecord({
      template: record,
      amplicon: amplicons[0]!,
      name: 'Colored',
      forwardPrimer: { name: 'CustomFwd', sequence: anneal, phosphorylated: false },
      reversePrimer: { name: 'CustomRev', sequence: revAnneal, phosphorylated: false },
      polymerase: 'blunt',
    })
    expect(product.primers.find((primer) => primer.name === 'CustomFwd')?.color).toBe('#16a34a')
    expect(product.primers.find((primer) => primer.name === 'CustomRev')?.color).toBe('#ca8a04')
  })

  it('designs a forward primer and a reverse-complement reverse primer', () => {
    const ampliconCore = 'ATGAAACCCGGGTTTAAAACCCGGGTTT'
    const record = template(`${'C'.repeat(40)}${ampliconCore}${'G'.repeat(40)}`)
    const start = 40
    const end = start + ampliconCore.length
    const pair = designPcrPrimerPair(record, start, end, 40)

    expect(pair.forward.sequence).toBe(ampliconCore.slice(0, pair.forward.sequence.length))
    expect(pair.reverse.sequence).not.toBe(ampliconCore.slice(0, pair.reverse.sequence.length))
    // Reverse primer is the RC of the amplicon 3′ end.
    const expectedReverse = reverseComplement(ampliconCore.slice(-pair.reverse.sequence.length))
    expect(pair.reverse.sequence).toBe(expectedReverse)

    const amplicons = listPcrAmplicons(record, pair.forward, pair.reverse)
    expect(amplicons.length).toBeGreaterThan(0)
  })

  it('detects amplicons for reverse mutagenesis primers with internal mismatches', () => {
    // Template region with a single-base mutagenesis site (C) flanked by matching arms.
    const left = 'ACTTTGCTTATGAAA'
    const site = 'C'
    const right = 'TGGAGGCAAGG'
    const core = `${left}${site}${right}`
    const flank = 'GATC'.repeat(30)
    const record = template(`${flank}${core}${flank}`)
    const start = flank.length
    const end = start + core.length

    // Mutagenesis primers introduce A at the site (mismatch vs template C).
    const forwardSeq = `${left}A${right}`
    const reverseSeq = reverseComplement(forwardSeq)
    record.primers = [
      {
        id: 'mut-fwd',
        name: 'Mut fwd',
        sequence: forwardSeq,
        color: '#2563eb',
        bindings: [
          {
            strand: 'forward',
            templateStart: start,
            templateEnd: end,
            components: [
              { primerBases: left, templateStart: start, templateEnd: start + left.length },
              { primerBases: 'A' },
              { primerBases: right, templateStart: start + left.length + 1, templateEnd: end },
            ],
          },
        ],
      },
      {
        id: 'mut-rev',
        name: 'Mut rev',
        sequence: reverseSeq,
        color: '#db2777',
        bindings: [
          {
            strand: 'reverse',
            templateStart: start,
            templateEnd: end,
            components: [
              { primerBases: reverseComplement(right), templateStart: start + left.length + 1, templateEnd: end },
              { primerBases: 'T' },
              { primerBases: reverseComplement(left), templateStart: start, templateEnd: start + left.length },
            ],
          },
        ],
      },
    ]

    const withStoredBindings = listPcrAmplicons(
      record,
      { name: 'Mut fwd', sequence: forwardSeq, phosphorylated: false },
      { name: 'Mut rev', sequence: reverseSeq, phosphorylated: false },
    )
    expect(withStoredBindings.length).toBeGreaterThan(0)

    // Bare sequences (no bindings on a copy of the template) must still resolve via alignment.
    const bareTemplate = { ...record, primers: [] }
    const bareAmplicons = listPcrAmplicons(
      bareTemplate,
      { name: 'Mut fwd', sequence: forwardSeq, phosphorylated: false },
      { name: 'Mut rev', sequence: reverseSeq, phosphorylated: false },
    )
    expect(bareAmplicons.length).toBeGreaterThan(0)
  })

  it('returns no amplicons when either primer sequence is empty', () => {
    const record = template('ATGAAACCCGGGTTTAAAACCCGGGTTT')
    expect(
      listPcrAmplicons(
        record,
        { name: 'Fwd', sequence: '', phosphorylated: false },
        { name: 'Rev', sequence: 'AAACCCGGGTTT', phosphorylated: false },
      ),
    ).toEqual([])
    expect(
      listPcrAmplicons(
        record,
        { name: 'Fwd', sequence: 'ATGAAACCCGGG', phosphorylated: false },
        { name: 'Rev', sequence: '', phosphorylated: false },
      ),
    ).toEqual([])
  })
})

describe('facing primer selection amplicon range', () => {
  const bindings = [
    { primerId: 'fwd', strand: 'forward' as const, start: 10, end: 30 },
    { primerId: 'rev', strand: 'reverse' as const, start: 100, end: 120 },
    { primerId: 'fwd2', strand: 'forward' as const, start: 200, end: 220 },
  ]

  it('selects the F→R stretch for a facing pair', () => {
    expect(
      ampliconRangeForFacingPrimerSelection('linear', 500, ['fwd', 'rev'], bindings),
    ).toEqual({ start: 10, end: 120 })
  })

  it('returns null for same-strand or reverse-facing linear pairs', () => {
    expect(
      ampliconRangeForFacingPrimerSelection('linear', 500, ['fwd', 'fwd2'], bindings),
    ).toBeNull()
    expect(
      ampliconRangeForFacingPrimerSelection(
        'linear',
        500,
        ['rev', 'fwd2'],
        [
          { primerId: 'rev', strand: 'reverse', start: 100, end: 120 },
          { primerId: 'fwd2', strand: 'forward', start: 200, end: 220 },
        ],
      ),
    ).toBeNull()
  })

  it('allows wrapping F→R pairs on circular templates', () => {
    expect(
      ampliconRangeForFacingPrimerSelection(
        'circular',
        500,
        ['fwd', 'rev'],
        [
          { primerId: 'fwd', strand: 'forward', start: 450, end: 470 },
          { primerId: 'rev', strand: 'reverse', start: 20, end: 40 },
        ],
      ),
    ).toEqual({ start: 450, end: 40 })
  })

  it('requires exactly two selected primers', () => {
    expect(ampliconRangeForFacingPrimerSelection('linear', 500, ['fwd'], bindings)).toBeNull()
    expect(
      ampliconRangeForFacingPrimerSelection('linear', 500, ['fwd', 'rev', 'fwd2'], bindings),
    ).toBeNull()
  })
})
