import { describe, expect, it, vi } from 'vitest'
import { defaultEnzymePreferences, normalizeEnzymePreferences } from '../../domain/enzymePreferences'
import { pickRandomEnzymeName, planEnzymePreferencesApply } from './enzymePreferencesApplyPlan'

describe('planEnzymePreferencesApply', () => {
  it('derives tab position mode from defaultTab', () => {
    const normalized = normalizeEnzymePreferences({ ...defaultEnzymePreferences, defaultTab: 'lines' })
    expect(planEnzymePreferencesApply(normalized)).toEqual({
      preferences: normalized,
      tabPositionMode: 'lines',
    })
  })
})

describe('pickRandomEnzymeName', () => {
  it('returns null for an empty catalog', () => {
    expect(pickRandomEnzymeName([])).toBeNull()
  })

  it('returns a name from the supplied catalog', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    expect(pickRandomEnzymeName(['EcoRI', 'BamHI'])).toBe('BamHI')
    vi.restoreAllMocks()
  })
})
