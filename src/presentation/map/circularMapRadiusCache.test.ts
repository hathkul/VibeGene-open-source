import { afterEach, describe, expect, it } from 'vitest'
import {
  buildViewportKey,
  circularLayoutKey,
  clearPersistedRadiusCache,
  clearWarmRadiusCache,
  readPersistedRadius,
  readPersistedStandardFeasible,
  readWarmRadius,
  writePersistedRadius,
  writeWarmRadius,
} from './circularMapRadiusCache'

afterEach(() => {
  clearPersistedRadiusCache()
  clearWarmRadiusCache()
})

describe('circularMapRadiusCache', () => {
  it('keeps viewport/layout keys stable and explicit', () => {
    expect(buildViewportKey(800, 600, 500, false)).toBe('800x600x500x0')
    expect(buildViewportKey(800, 600, 500, true)).toBe('800x600x500x1')
    expect(circularLayoutKey('radius-key', '800x600x500x0')).toBe('radius-key|viewport=800x600x500x0')
  })

  it('refreshes hits and evicts the least recently updated entry', () => {
    for (let index = 0; index < 40; index += 1) writePersistedRadius(`key-${index}`, index, true, index)
    expect(readPersistedRadius('key-0', 100)).toBe(0)
    writePersistedRadius('key-new', 41, true, 101)
    expect(readPersistedRadius('key-1', 102)).toBeNull()
    expect(readPersistedRadius('key-0', 103)).toBe(0)
  })

  it('round-trips warm radius hints and ignores other keys', () => {
    writeWarmRadius('alpha', 240, true)
    expect(readWarmRadius('alpha')).toBe(240)
    expect(readWarmRadius('beta')).toBeNull()
  })

  it('preserves feasible status and revalidates stale infeasible status', () => {
    writePersistedRadius('feasible', 300, true, 0)
    writePersistedRadius('infeasible', 280, false, 0)
    expect(readPersistedStandardFeasible('feasible', 14_999)).toBe(true)
    expect(readPersistedStandardFeasible('infeasible', 14_999)).toBe(false)
    expect(readPersistedStandardFeasible('infeasible', 15_000)).toBeNull()
    expect(readPersistedStandardFeasible('infeasible', 15_001)).toBeNull()
  })
})
