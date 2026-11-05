import { describe, expect, it } from 'vitest'
import { nextSearchHitIndex, searchHitRange } from './searchNavigation'

describe('workspace search navigation', () => {
  it('clamps a DNA or protein hit to the record length', () => {
    expect(searchHitRange({ molecule: 'dna', sequence: 'ACGT' }, 'CG', 1)).toEqual({ start: 1, end: 3 })
    expect(searchHitRange({ molecule: 'protein', sequence: 'MKW' }, 'KW', 1)).toEqual({ start: 1, end: 3 })
    expect(searchHitRange({ molecule: 'dna', sequence: 'ACGT' }, 'AC', 4)).toBeNull()
  })

  it('wraps next and previous hit indexes while handling an empty result', () => {
    expect(nextSearchHitIndex(0, -1, 3)).toBe(2)
    expect(nextSearchHitIndex(2, 1, 3)).toBe(0)
    expect(nextSearchHitIndex(0, 1, 0)).toBeNull()
  })
})
