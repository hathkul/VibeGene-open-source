import { describe, expect, it } from 'vitest'
import { primerAnnealedSequence, primerWarnings } from '../src/domain/cloning'
import type { Primer } from '../src/domain/types'

describe('primerWarnings', () => {
  it('evaluates the annealed region, not 5-prime overhangs', () => {
    const primer: Primer = {
      id: 'p1',
      name: 'overhang',
      sequence: 'GGGGGACCACCATGTCAACGTTGG',
      color: '#000',
      bindings: [
        {
          strand: 'forward',
          templateStart: 10,
          templateEnd: 32,
          components: [
            { primerBases: 'GGGG' },
            { primerBases: 'GACCACCATGTCAACGTTGG', templateStart: 10, templateEnd: 32 },
          ],
        },
      ],
    }
    expect(primerAnnealedSequence(primer)).toBe('GACCACCATGTCAACGTTGG')
    expect(primerWarnings(primer)).toEqual([])
  })

  it('does not warn on high annealed Tm', () => {
    const primer: Primer = {
      id: 'p2',
      name: 'high tm',
      sequence: 'GCGCGCGCGCGCGCGCGCGCGCGCGCGC',
      color: '#000',
    }
    expect(primerWarnings(primer).some((warning) => warning.includes('Tm'))).toBe(false)
  })

  it('warns when annealed Tm is below 38 C', () => {
    const primer: Primer = {
      id: 'p3',
      name: 'low tm',
      sequence: 'ATGC',
      color: '#000',
    }
    expect(primerWarnings(primer)).toContain('Annealed Tm below common 38 C minimum')
  })
})
