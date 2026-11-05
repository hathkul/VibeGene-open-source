import { describe, expect, it } from 'vitest'
import { defaultEnzymePreferences } from '../../domain/enzymePreferences'
import { defaultDisplaySettings } from '../sequence'
import { createChooseEnzymesDraft, enzymeSetModeLabel, resolveActiveEnzymeSetExport } from './enzymeHelpers'

describe('Type IIS set presentation', () => {
  it('keeps the selected set when opening the chooser and exporting', () => {
    const settings = { ...defaultDisplaySettings.enzymes, set: 'type-iis' as const }
    expect(enzymeSetModeLabel(settings.set, 0, null)).toBe('Type IIS')
    const draft = createChooseEnzymesDraft(settings)
    expect(draft.criteriaEnabled).toBe(false)
    expect(draft.selectedNames).toContain('BsaI')
    expect(draft.selectedNames).not.toContain('EcoRI')
    const exported = resolveActiveEnzymeSetExport({ settings, preferences: defaultEnzymePreferences, parentalCounts: {} })
    expect(exported.name).toBe('Type IIS')
    expect(exported.enzymeNames).toEqual(draft.selectedNames)
  })
})
