import { describe, expect, it } from 'vitest'
import { alignTraceToTemplate, alignmentStatsLabel } from './traceAlignment'
import { reverseComplement } from './sequence'

// Reference window and embedded base calls from the deletion example.
const reference = 'TTTTTTGTACAATGAGACTGTACAAAAGTTCTTGATTTAACTCCATTGTAGCCTTTAAGTTGGGCTAGTAAGTTAGGATTAATGAATAAAGATCAATGTATTAGATTTTGGGACAAGAATCTTGAACGGACCAATCTTGATGCATTTTCAGTGGGGCATCCTCTCTCTTAATAGGCAATATAACATGTAGTCCCGACGAGTTCACCTGCTCCAGTGGCCGCTGCATCTCCAGGAACTTTGTATGCAATGGCCAGGATGACTGCAGCGATGGCAGTGATGAGCTGGACTGTGCCCCGCCAACCTGTGGCGCCCATGAGTTCCAGTGCAGCACCTCCTCCTGCATCCCCATCAGCTGGGTATGCGACGATGATGCAGACTGCTCCGACCAATCTGATGAGTCCCTGGAGCAGTGTGGCCGTCAGCCAGTCATACACACCAAGTGTCCAGCCAGCGAAATCCAGTGCGGCTCTGGCGAGTGCATCCATAAGAAGTGGCGATGTGATGGGGACCCTGACTGCAAGGATGGCAGTGATGAGGTCAACTGTCGTAAGTAGCTTTCTAGCATGGCATGTTCAGTTCTCTTCCCTGTATCAACTGGGACAATTTGCTGGCTTCATTCCATGGTGTTTCCTCCCTTTGTAGCCTCTCGAACTTGCCGACCTGACCAATTTGAATGTGAGGATGGCAGCTGCATCCATGGCAGCAGGCAGTGTAATGGTATCCGAGACTGTGTCGATGGTTCCGATGAAGTCAACTGCAAAAATGGTAAGGGTTTCTTCTTGTTGGTTAAGCAATGGATT'
const read = 'ACATCGAGAGGCTACAAGGGAGGAACACCATGGAATGAAGCCAGCAAATTGTCCCAGTTGATACAGGGAAGAGAACTGAACATGCCATGCTAGAAAGCTACTTACGACAGTTGACCTCATCACTGCCATCCTTGCAGTCAGGGTCCCCATCACATCGCCACTTCTTATGGATGCACTCGCCAGAGCCGCACTGGATTTCGCTGGCTGGACACTTGGTGTGTATGACTGGCTGACGGCCACACTGCTCCAGGGACTACATGTTATATTGCCTATTAAGAGAGAGGATGCCCCACTGAAAATGCATCAAGATTGGTCGCAACTTACTAGCCCAACTTAGGGGTAAAACAATGGGAA'

describe('split trace alignment', () => {
  it('recovers the deletion junction in the reverse trace', () => {
    const alignment = alignTraceToTemplate(read, reference)!
    expect(alignment.orientation).toBe('reverse')
    const gaps = alignment.columns.filter(c => c.kind === 'templateGap')
    expect(gaps.length).toBeGreaterThanOrEqual(208)
    expect(alignmentStatsLabel(alignment)).toContain('candidate deletion 208 bp')
    expect(alignment.columns.filter(c => c.kind === 'match').length).toBeGreaterThan(285)
  })
  it('recovers the same junction in forward orientation', () => {
    const alignment = alignTraceToTemplate(reverseComplement(read), reference)!
    expect(alignment.orientation).toBe('forward')
    expect(alignmentStatsLabel(alignment)).toContain('candidate deletion 208 bp')
  })
  it('recovers a junction when the reference requires seeded alignment', () => {
    let state = 12345
    const flank = Array.from({ length: 44000 }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return 'ACGT'[(state >>> 24) & 3]
    }).join('')
    const longReference = flank.slice(0, 22000) + reference + flank.slice(22000)
    const alignment = alignTraceToTemplate(read, longReference)!
    expect(alignment.orientation).toBe('reverse')
    expect(alignmentStatsLabel(alignment)).toContain('candidate deletion 208 bp')
  })
  it('does not turn an unrelated clipped end into a deletion', () => {
    const alignment = alignTraceToTemplate('A'.repeat(60) + reference.slice(396, 628), reference)!
    expect(alignmentStatsLabel(alignment)).not.toContain('candidate deletion')
  })
  it('does not join a repeated clipped block', () => {
    const left = reference.slice(128, 188)
    const right = reference.slice(396, 628)
    const repeatedReference = left + 'A'.repeat(300) + reference + 'C'.repeat(300) + left
    const alignment = alignTraceToTemplate(left + right, repeatedReference)!
    expect(alignment.columns.filter(c => c.kind === 'templateGap').length).toBe(0)
  })
})

describe('large partial DNA alignment', () => {
  it('aligns shared sequence in either reference direction and reverse orientation', () => {
    let state = 987654321
    const randomDna = (length: number) => Array.from({ length }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return 'ACGT'[(state >>> 24) & 3]
    }).join('')
    const shared = randomDna(3300)
    const shorter = randomDna(300) + shared + randomDna(300)
    const longer = randomDna(700) + shared.slice(0, 1650) + randomDna(90) + shared.slice(1650) + randomDna(700)

    for (const [query, template, orientation] of [
      [longer, shorter, 'forward'],
      [shorter, longer, 'forward'],
      [reverseComplement(longer), shorter, 'reverse'],
    ] as const) {
      const alignment = alignTraceToTemplate(query, template, { topology: 'linear' })
      expect(alignment?.orientation).toBe(orientation)
      expect(alignment?.columns.filter((column) => column.kind === 'match' && column.match).length).toBeGreaterThanOrEqual(3300)
      expect(alignment?.gapCount).toBeGreaterThanOrEqual(90)
    }
  })

  it('does not report short chance matches between unrelated large sequences', () => {
    let state = 1701
    const randomDna = (length: number) => Array.from({ length }, () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return 'ACGT'[(state >>> 24) & 3]
    }).join('')
    expect(alignTraceToTemplate(randomDna(3900), randomDna(5000))).toBeNull()
  })
})
