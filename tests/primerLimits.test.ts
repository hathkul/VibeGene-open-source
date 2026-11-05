import { describe, expect, it } from 'vitest'
import { MAX_PRIMER_LENGTH, primerLengthError } from '../src/domain/primerLimits'

describe('primer length limits', () => {
  it('allows primers through the supported maximum', () => {
    expect(primerLengthError(MAX_PRIMER_LENGTH)).toBeNull()
  })

  it('rejects construct-sized primer input with an actionable limit', () => {
    expect(primerLengthError(8_421)).toBe(
      `Primers can contain at most ${MAX_PRIMER_LENGTH} bases (this sequence contains ${(8421).toLocaleString()}).`,
    )
  })
})
