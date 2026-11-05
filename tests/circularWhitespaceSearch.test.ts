import { describe, expect, it } from 'vitest'
import { proposeCircularWhitespaceCenter } from '../src/domain/circularWhitespaceSearch'

describe('proposeCircularWhitespaceCenter', () => {
  it('shifts downward when the callout bounds have substantially more room below', () => {
    const input = {
      center: { x: 990, y: 594 },
      radius: 269,
      width: 1980,
      height: 1188,
      bottomReservedPx: 0,
      bounds: { left: 433, right: 1463, top: 27, bottom: 989 },
    }
    const proposal = proposeCircularWhitespaceCenter(input)
    expect(proposal?.x).toBe(990)
    expect(proposal?.y).toBeCloseTo(714.4)
  })

  it('returns no proposal when horizontal and vertical slack are balanced', () => {
    expect(proposeCircularWhitespaceCenter({
      center: { x: 500, y: 500 },
      radius: 100,
      width: 1000,
      height: 1000,
      bottomReservedPx: 0,
      bounds: { left: 100, right: 900, top: 100, bottom: 900 },
    })).toBeUndefined()
  })

  it('moves horizontally toward the side with more space in either direction', () => {
    const base = {
      center: { x: 500, y: 500 },
      radius: 100,
      width: 1000,
      height: 1000,
      bottomReservedPx: 0,
      bounds: { left: 100, right: 850, top: 350, bottom: 650 },
    }
    expect(proposeCircularWhitespaceCenter(base)).toEqual({ x: 535, y: 500 })
    expect(proposeCircularWhitespaceCenter({
      ...base,
      bounds: { left: 150, right: 900, top: 350, bottom: 650 },
    })).toEqual({ x: 465, y: 500 })
  })

  it('clamps the proposed center so the ring stays within viewport padding', () => {
    const proposal = proposeCircularWhitespaceCenter({
      center: { x: 870, y: 500 },
      radius: 100,
      width: 1000,
      height: 1000,
      bottomReservedPx: 0,
      bounds: { left: 50, right: 850, top: 350, bottom: 650 },
    })
    expect(proposal).toEqual({ x: 890, y: 500 })
  })

  it('respects the reserved bottom area while clamping vertical movement', () => {
    const proposal = proposeCircularWhitespaceCenter({
      center: { x: 500, y: 750 },
      radius: 100,
      width: 1000,
      height: 1000,
      bottomReservedPx: 100,
      bounds: { left: 350, right: 650, top: 100, bottom: 600 },
    })
    expect(proposal).toEqual({ x: 500, y: 790 })
    expect(proposeCircularWhitespaceCenter({
      center: { x: 500, y: 750 },
      radius: 100,
      width: 1000,
      height: 1000,
      bottomReservedPx: 100,
      bounds: { left: 350, right: 650, top: 100, bottom: 600 },
    })).toEqual(proposal)
  })
})
