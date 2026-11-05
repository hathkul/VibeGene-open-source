import { describe, expect, it } from 'vitest'
import { horizontalWheelDelta } from '../src/preventOverscrollNavigation'

describe('horizontalWheelDelta', () => {
  it('returns deltaX when horizontal movement dominates', () => {
    const event = { deltaX: 12, deltaY: 2, shiftKey: false } as WheelEvent
    expect(horizontalWheelDelta(event)).toBe(12)
  })

  it('returns deltaY when shift is held', () => {
    const event = { deltaX: 0, deltaY: 8, shiftKey: true } as WheelEvent
    expect(horizontalWheelDelta(event)).toBe(8)
  })

  it('returns zero for vertical-only wheel', () => {
    const event = { deltaX: 0, deltaY: 16, shiftKey: false } as WheelEvent
    expect(horizontalWheelDelta(event)).toBe(0)
  })
})
