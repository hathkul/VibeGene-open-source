import { describe, expect, it } from 'vitest'
import { effectivePcrAmpliconId } from './effectivePcrAmpliconSelection'

describe('effectivePcrAmpliconId', () => {
  const amplicons = [{ id: 'first' }, { id: 'second' }]

  it('keeps an existing selected amplicon', () => {
    expect(effectivePcrAmpliconId(amplicons, 'second')).toBe('second')
  })

  it('selects the first available amplicon when selection is null or stale', () => {
    expect(effectivePcrAmpliconId(amplicons, null)).toBe('first')
    expect(effectivePcrAmpliconId(amplicons, 'missing')).toBe('first')
  })

  it('returns no selection for an empty amplicon list', () => {
    expect(effectivePcrAmpliconId([], 'missing')).toBeNull()
  })
})
