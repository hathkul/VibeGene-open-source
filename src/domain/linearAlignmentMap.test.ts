import { describe, expect, it } from 'vitest'
import { LINEAR_ALIGNMENT_MISMATCH_MIN_WIDTH, linearAlignmentMismatchMarkX } from './linearAlignmentMap'

describe('linear alignment mismatch marks', () => {
  it('widens sub-pixel mismatches around their centre', () => {
    const mark = linearAlignmentMismatchMarkX(100, 100.4)
    expect(mark.width).toBe(LINEAR_ALIGNMENT_MISMATCH_MIN_WIDTH)
    expect(mark.x + mark.width / 2).toBeCloseTo(100.2)
  })

  it('keeps wide mismatch runs at their true extent', () => {
    expect(linearAlignmentMismatchMarkX(10, 30)).toEqual({ x: 10, width: 20 })
  })
})
