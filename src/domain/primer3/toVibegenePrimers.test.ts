import { themeFixturePalette } from '../../test-support/themeFixturePalette'
import { describe, expect, it, vi } from 'vitest'
import type { Primer3Result } from './types'
import { toVibegenePrimers } from './toVibegenePrimers'

vi.mock('./index', () => ({
  PRIMER3_VERSION: '2.6.1',
}))

function sampleResult(): Primer3Result {
  return {
    pairs: [
      {
        rank: 0,
        penalty: 0.4,
        productSize: 245,
        left: {
          kind: 'left',
          rank: 0,
          sequence: 'ACGTACGTACGTACGT',
          length: 16,
          templateStart: 10,
          templateEnd: 26,
          recordStart: 10,
          recordEnd: 26,
          tm: 59.8,
          gcPercent: 50,
          penalty: 0.1,
          extra: {},
        },
        right: {
          kind: 'right',
          rank: 0,
          sequence: 'TGCATGCATGCATGCA',
          length: 16,
          templateStart: 240,
          templateEnd: 256,
          recordStart: 240,
          recordEnd: 256,
          tm: 60.1,
          gcPercent: 48,
          penalty: 0.2,
          extra: {},
        },
        extra: {},
      },
    ],
    lefts: [],
    rights: [],
    internals: [],
    explain: {},
    warnings: [],
    errors: [],
    raw: {},
    input: '',
    output: '',
  }
}

describe('toVibegenePrimers', () => {
  it('names primers and includes Primer3 metadata', () => {
    const primers = toVibegenePrimers('MyConstruct.dna', sampleResult(), { mode: 'pairs', ranks: [0] })
    expect(primers).toHaveLength(2)
    expect(primers[0]?.name).toBe('MyConstruct_P3_1_F')
    expect(primers[1]?.name).toBe('MyConstruct_P3_1_R')
    expect(primers[0]?.color).toBe(themeFixturePalette.purple)
    expect(primers[0]?.description).toContain('Primer3 2.6.1')
    expect(primers[0]?.description).toContain('product 245 bp')
    expect(primers[0]?.id).toMatch(/^primer_/)
  })
})
