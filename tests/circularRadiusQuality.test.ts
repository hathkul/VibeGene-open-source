import { describe, expect, it } from 'vitest'
import { planInvalidRadiusRecovery } from '../src/domain/circularRadiusQuality'

describe('finished circular radius selection', () => {
  it('plans up to two spaced, untried recovery radii below the soft floor', () => {
    expect(planInvalidRadiusRecovery(100, 110, [])).toEqual([103, 106])
    expect(planInvalidRadiusRecovery(100, 105, [100, 102])).toEqual([103])
  })

  it('handles short intervals and returns no radii when the interval has no integer room', () => {
    expect(planInvalidRadiusRecovery(10, 12, [])).toEqual([10, 11])
    expect(planInvalidRadiusRecovery(10, 11, [])).toEqual([10])
    expect(planInvalidRadiusRecovery(10.2, 10.9, [])).toEqual([])
    expect(planInvalidRadiusRecovery(12, 12, [])).toEqual([])
  })

  it('returns no duplicate recovery radii when all candidates were already tried', () => {
    expect(planInvalidRadiusRecovery(10, 12, [10, 11])).toEqual([])
    expect(planInvalidRadiusRecovery(10, 14, [10, 11, 12, 13])).toEqual([])
  })

})
