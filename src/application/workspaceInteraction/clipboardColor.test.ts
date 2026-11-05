import { describe, expect, it } from 'vitest'
import { clipboardStrands } from './clipboardColor'

describe('clipboardStrands', () => {
  it('uses the two strand spans for a sticky fragment', () => {
    const forward = { start: 8, end: 2 }
    const reverse = { start: 3, end: 9 }
    expect(clipboardStrands(null, { forward, reverse }, true)).toEqual({ top: forward, bottom: reverse })
  })

  it('uses one range for both strands and rejects collapsed selections', () => {
    const range = { start: 1, end: 5 }
    expect(clipboardStrands(range, null, false)).toEqual({ top: range, bottom: range })
    expect(clipboardStrands({ start: 2, end: 2 }, null, false)).toBeNull()
  })
})
