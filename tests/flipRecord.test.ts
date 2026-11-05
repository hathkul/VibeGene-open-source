import { describe, expect, it } from 'vitest'
import { defaultConstructProperties } from '../src/domain/constructProperties'
import { flipRecord } from '../src/domain/flipRecord'
import { reverseComplement } from '../src/domain/sequence'
import type { SequenceRecord } from '../src/domain/types'

function makeRecord(sequence: string): SequenceRecord {
  return {
    id: 'rec',
    name: 'demo',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [
      {
        id: 'f1',
        name: 'gene',
        type: 'CDS',
        color: '#ff0000',
        locations: [{ start: 2, end: 6, strand: 'forward' }],
      },
    ],
    primers: [
      {
        id: 'p1',
        name: 'fwd',
        sequence: 'ACGT',
        color: '#0000ff',
        bindings: [
          {
            strand: 'forward',
            templateStart: 1,
            templateEnd: 5,
            components: [{ primerBases: 'ACGT', templateStart: 1, templateEnd: 5 }],
          },
        ],
      },
    ],
    operations: [],
    strandColors: {
      topStrand: [{ start: 0, end: 3, color: 'red' }],
      bottomStrand: [{ start: 7, end: 10, color: 'blue' }],
    },
    dnaEnds: {
      upstream: { modification: 'unmodified', stickiness: 4, enzymeName: 'EcoRI' },
      downstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
    },
    construct: defaultConstructProperties,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }
}

describe('flipRecord', () => {
  it('reverse-complements the sequence', () => {
    const record = makeRecord('AAACCCGGGT')
    expect(flipRecord(record).sequence).toBe(reverseComplement('AAACCCGGGT'))
  })

  it('maps feature spans to the opposite strand and mirrored coordinates', () => {
    const record = makeRecord('AAACCCGGGT') // length 10
    const flipped = flipRecord(record)
    // [2,6) forward -> [10-6, 10-2) = [4,8) reverse
    expect(flipped.features[0].locations).toEqual([{ start: 4, end: 8, strand: 'reverse' }])
  })

  it('keeps multi-segment feature locations sorted ascending after flipping', () => {
    const record = makeRecord('AAACCCGGGTAAACCCGGGT') // length 20
    record.features = [
      {
        id: 'multi',
        name: 'joined',
        type: 'CDS',
        color: '#00ff00',
        locations: [
          { start: 2, end: 6, strand: 'forward' },
          { start: 10, end: 15, strand: 'forward' },
        ],
      },
    ]
    const flipped = flipRecord(record)
    // [2,6) -> [14,18); [10,15) -> [5,10); stored ascending by coordinate.
    expect(flipped.features[0].locations).toEqual([
      { start: 5, end: 10, strand: 'reverse' },
      { start: 14, end: 18, strand: 'reverse' },
    ])
    // Flipping again restores the original ordering and spans.
    expect(flipRecord(flipped).features[0].locations).toEqual(record.features[0].locations)
  })

  it('flips primer bindings and keeps the oligo sequence unchanged', () => {
    const record = makeRecord('AAACCCGGGT')
    const flipped = flipRecord(record)
    const binding = flipped.primers[0].bindings![0]
    expect(flipped.primers[0].sequence).toBe('ACGT')
    expect(binding.strand).toBe('reverse')
    expect(binding.templateStart).toBe(5) // 10 - 5
    expect(binding.templateEnd).toBe(9) // 10 - 1
    expect(binding.components[0]).toMatchObject({ templateStart: 5, templateEnd: 9 })
  })

  it('swaps painted strand colors between strands with mirrored coordinates', () => {
    const record = makeRecord('AAACCCGGGT')
    const flipped = flipRecord(record)
    expect(flipped.strandColors?.topStrand).toEqual([{ start: 0, end: 3, color: 'blue' }])
    expect(flipped.strandColors?.bottomStrand).toEqual([{ start: 7, end: 10, color: 'red' }])
  })

  it('swaps upstream and downstream DNA ends', () => {
    const record = makeRecord('AAACCCGGGT')
    const flipped = flipRecord(record)
    expect(flipped.dnaEnds?.upstream).toEqual({ modification: 'fivePrimePhosphorylated', stickiness: 0 })
    expect(flipped.dnaEnds?.downstream).toEqual({ modification: 'unmodified', stickiness: 4, enzymeName: 'EcoRI' })
  })

  it('is an involution for sequence, features, and primer bindings', () => {
    const record = makeRecord('AAACCCGGGT')
    const twice = flipRecord(flipRecord(record))
    expect(twice.sequence).toBe(record.sequence)
    expect(twice.features).toEqual(record.features)
    expect(twice.primers).toEqual(record.primers)
  })
})
