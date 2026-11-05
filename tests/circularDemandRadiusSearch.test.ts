import { describe, expect, it } from 'vitest'
import { planCircularDemandRadiusSearch } from '../src/domain/circularDemandRadiusSearch'

const severeInput = {
  selectedRadius: 164,
  hardMinRadius: 52,
  featureReadabilityFloor: 80,
  demand: { minBendAngle: 93, belowTargetBendSeverity: 335 },
}

describe('circular demand radius search planner', () => {
  it('includes a nearby probe and a bounded set of wider probes for severe demand', () => {
    const planned = planCircularDemandRadiusSearch(severeInput)
    expect(planned[0]).toBe(160)
    expect(planned.length).toBeLessThanOrEqual(3)
    expect(planned.every((radius) => radius < severeInput.selectedRadius)).toBe(true)
  })

  it('does not search when the measured route quality is acceptable', () => {
    expect(planCircularDemandRadiusSearch({
      ...severeInput,
      demand: { minBendAngle: 117, belowTargetBendSeverity: 3 },
    })).toEqual([])
    expect(planCircularDemandRadiusSearch({
      ...severeInput,
      demand: { minBendAngle: 120, belowTargetBendSeverity: 200 },
    })).toEqual([])
  })

  it('is deterministic, integer-valued, deduplicated, and bounded by both floors', () => {
    const input = { ...severeInput, featureReadabilityFloor: 158 }
    const first = planCircularDemandRadiusSearch(input)
    expect(planCircularDemandRadiusSearch(input)).toEqual(first)
    expect(first).toEqual([160, 158])
    expect(new Set(first).size).toBe(first.length)
    expect(first.every((radius) => Number.isInteger(radius) && radius >= 158 && radius >= input.hardMinRadius)).toBe(true)
  })

  it('respects a hard minimum higher than the feature readability floor', () => {
    const planned = planCircularDemandRadiusSearch({
      ...severeInput,
      hardMinRadius: 162,
      featureReadabilityFloor: 100,
    })
    expect(planned).toEqual([162])
  })

  it('returns no candidate when selected radius leaves no legal smaller integer radius', () => {
    expect(planCircularDemandRadiusSearch({
      ...severeInput,
      hardMinRadius: 164,
      featureReadabilityFloor: 100,
    })).toEqual([])
  })
})
