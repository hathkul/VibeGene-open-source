import { describe, expect, it } from 'vitest'
import { assignIntervalLanes } from '../src/domain/intervalLanes'

describe('assignIntervalLanes', () => {
  it('keeps non-overlapping earlier features on lane 0 even when a later feature has higher priority', () => {
    // pDemo-style: MCS (misc, low priority), promoter, then CDS (highest priority).
    const lanes = assignIntervalLanes([
      { id: 'mcs', start: 1, end: 64, priority: 30 },
      { id: 'promoter', start: 67, end: 145, priority: 2 },
      { id: 'cds', start: 146, end: 200, priority: 0 },
    ])
    const byId = Object.fromEntries(lanes.map((entry) => [entry.id, entry.lane]))
    expect(byId).toEqual({ mcs: 0, promoter: 0, cds: 0 })
  })

  it('stacks overlapping intervals onto successive lanes from the top', () => {
    const lanes = assignIntervalLanes([
      { id: 'a', start: 0, end: 100, priority: 30 },
      { id: 'b', start: 50, end: 150, priority: 0 },
      { id: 'c', start: 60, end: 80, priority: 2 },
    ])
    const byId = Object.fromEntries(lanes.map((entry) => [entry.id, entry.lane]))
    expect(byId.a).toBe(0)
    expect(byId.b).toBe(1)
    expect(byId.c).toBe(2)
  })

  it('reuses a lower lane after an earlier interval ends', () => {
    const lanes = assignIntervalLanes([
      { id: 'a', start: 0, end: 40, priority: 0 },
      { id: 'b', start: 10, end: 30, priority: 0 },
      { id: 'c', start: 50, end: 80, priority: 0 },
    ])
    const byId = Object.fromEntries(lanes.map((entry) => [entry.id, entry.lane]))
    expect(byId).toEqual({ a: 0, b: 1, c: 0 })
  })
})
