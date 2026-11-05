import { describe, expect, it } from 'vitest'
import { dnaComparisonCacheSignature } from '../src/domain/dnaComparisonCache'

const source = { id: 'source', name: 'Source', sequence: 'ATGC', enabled: true }

describe('DNA comparison cache signature', () => {
  it('changes when reference, source, or topology changes', () => {
    const base = dnaComparisonCacheSignature('ATGC', source, 'linear')
    expect(dnaComparisonCacheSignature('ATGA', source, 'linear')).not.toBe(base)
    expect(dnaComparisonCacheSignature('ATGC', { ...source, sequence: 'ATGA' }, 'linear')).not.toBe(base)
    expect(dnaComparisonCacheSignature('ATGC', source, 'circular')).not.toBe(base)
  })

  it('does not change for visibility-only updates', () => {
    expect(dnaComparisonCacheSignature('ATGC', source, 'linear')).toBe(
      dnaComparisonCacheSignature('ATGC', { ...source, enabled: false }, 'linear'),
    )
  })
})
