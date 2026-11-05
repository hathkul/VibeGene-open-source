import { describe, expect, it } from 'vitest'
import { primer3ThalAlign } from './adapter'
import { reverseComplement } from '../../domain/sequence'

describe('Primer3 thal adapter', () => {
  it('preserves native Tm and structure and distinguishes ANY from END1 anchoring', async () => {
    // seq1 is 5' AACCGGTA 3'. seq2 is deliberately chosen so its reverse
    // complement mismatches seq1 at its final base but matches the preceding run.
    const sequence1 = 'AACCGGTA'
    const sequence2 = 'GACCGGTT'
    const any = await primer3ThalAlign({ sequence1, sequence2, mode: 'any' })
    const end1 = await primer3ThalAlign({ sequence1, sequence2, mode: 'end1' })

    expect(any.alignEnd1).toBe(7)
    expect(end1.alignEnd1).toBe(sequence1.length)
    expect(end1.mode).toBe('end1')
    expect(end1.tmC).toBeLessThan(any.tmC - 100)
    expect(end1.structure).toContain("5' AACCGGTA 3'")
    expect(end1.structure).toContain('Tm: -289.1&deg;C')
    // THL_STRUCT marks the forced terminal position with one column even though
    // it is a mismatch (A opposite G in the rendered strand orientation).
    expect(end1.structure).toContain('\\n          |\\n')
  })

  it('matches an independent Primer3 2.6.1 ntthal reference vector', async () => {
    const primer = 'GCGATTGGCACTTTGGTGAAC'
    // Reference target is specified 3′→5′, so pass its reversed 5′→3′ form to THAL.
    const target3to5 = 'CGCTACATATGAAACCACTTG'
    const result = await primer3ThalAlign({
      sequence1: primer,
      sequence2: [...target3to5].reverse().join(''),
      mode: 'any',
      chemistry: { mvMmol: 1000, dvMmol: 0, dntpMmol: 0.8, dnaNmol: 100000 },
    })
    expect(result.tmC).toBeCloseTo(59.9003, 3)
    expect(result.structure).toContain(primer)
    expect(result.structure).toContain('\\n')
  })

  it('keeps 5′ tails and internal insertions in the native structural drawing', async () => {
    const annealing = 'ACGTACGTACGT'
    const tail = await primer3ThalAlign({
      sequence1: `GGG${annealing}`,
      sequence2: reverseComplement(annealing),
      mode: 'end1',
    })
    expect(tail.structure).toContain(`GGG${annealing}`)
    expect(tail.alignEnd1).toBe(annealing.length + 3)

    const templateTop = 'ACGTACGTACGT'
    const insertedPrimer = 'ACGTAAACGTACGT'
    const insertion = await primer3ThalAlign({
      sequence1: insertedPrimer,
      sequence2: reverseComplement(templateTop),
      mode: 'end1',
    })
    expect(insertion.structure).toContain(insertedPrimer)
    expect(insertion.alignEnd1).toBe(insertedPrimer.length)
    expect(insertion.structure).toContain('-')
  })
})
