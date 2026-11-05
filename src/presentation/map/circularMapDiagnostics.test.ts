import { describe, expect, it, vi } from 'vitest'
import { elapsedMs } from './circularMapDiagnostics'

describe('circularMapDiagnostics', () => {
  it('returns zero elapsed time when clock is null without calling now', () => {
    const now = vi.fn()
    expect(elapsedMs(null, 100)).toBe(0)
    expect(now).not.toHaveBeenCalled()
  })

  it('records delta when clock is provided', () => {
    const now = vi.fn().mockReturnValue(137.5)
    expect(elapsedMs({ now }, 100)).toBe(37.5)
    expect(now).toHaveBeenCalledTimes(1)
  })
})
