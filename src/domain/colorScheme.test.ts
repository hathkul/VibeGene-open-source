import { describe, expect, it } from 'vitest'
import { normalizeColorScheme } from './colorScheme'

describe('normalizeColorScheme', () => {
  it('accepts the supported schemes', () => {
    expect(normalizeColorScheme('beige')).toBe('beige')
    expect(normalizeColorScheme('bright')).toBe('bright')
    expect(normalizeColorScheme('dark')).toBe('dark')
  })

  it('uses beige for malformed or unknown stored values', () => {
    expect(normalizeColorScheme(null)).toBe('beige')
    expect(normalizeColorScheme('night')).toBe('beige')
    expect(normalizeColorScheme(4)).toBe('beige')
  })
})
