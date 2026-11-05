import { describe, expect, it } from 'vitest'
import { parseCircularMapDebugOptions } from './circularMapDebugOptions'

describe('parseCircularMapDebugOptions', () => {
  it('keeps diagnostics opt-in and defaults soft ring floors on', () => {
    expect(parseCircularMapDebugOptions('')).toMatchObject({
      useWasmRouter: false,
      routerProfileEnabled: false,
      ellipticOvoidK: 0,
      softRingFloorEnabled: true,
    })
  })

  it('parses router flags and clamps the ovoid asymmetry', () => {
    expect(parseCircularMapDebugOptions('?wasmRouter=1&wasmRouterRender=1&routerProfile=1&circularRouterCompare=1&ovoidK=2&softRingFloor=0')).toMatchObject({
      useWasmRouter: true,
      useWasmRouterRender: true,
      routerProfileEnabled: true,
      circularRouterCompareEnabled: true,
      ellipticOvoidK: 0.85,
      softRingFloorEnabled: false,
    })
  })

  it('treats malformed ovoid values as the neutral ellipse', () => {
    expect(parseCircularMapDebugOptions('?ovoidK=not-a-number').ellipticOvoidK).toBe(0)
  })
})
