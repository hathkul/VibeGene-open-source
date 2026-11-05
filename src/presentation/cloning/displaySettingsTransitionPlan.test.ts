import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_PREFERENCES } from '../../domain/appPreferences'
import { defaultDisplaySettings, type DisplaySettings } from '../sequence'
import {
  applyDisplaySectionPatch,
  planBootDisplaySettings,
  planDefaultMapViewForTopology,
  planToggleProteinVisualControls,
} from './displaySettingsTransitionPlan'

describe('displaySettingsTransitionPlan', () => {
  it('merges a display section patch without dropping sibling sections', () => {
    const current: DisplaySettings = {
      ...defaultDisplaySettings,
      enzymes: { ...defaultDisplaySettings.enzymes, visible: true, set: 'custom', selectedNames: ['EcoRI'] },
    }
    const next = applyDisplaySectionPatch(current, 'enzymes', { visible: false })
    expect(next.enzymes.visible).toBe(false)
    expect(next.enzymes.set).toBe('custom')
    expect(next.enzymes.selectedNames).toEqual(['EcoRI'])
    expect(next.features).toEqual(current.features)
  })

  it('applies topology linear map defaults and enzyme visibility from app preferences', () => {
    const current: DisplaySettings = {
      ...defaultDisplaySettings,
      mapView: { ...defaultDisplaySettings.mapView, linear: false },
      enzymes: { ...defaultDisplaySettings.enzymes, visible: true },
    }
    const next = planDefaultMapViewForTopology(current, 'linear', 200_000, {
      ...DEFAULT_APP_PREFERENCES,
      skipEnzymeScanForLongSequences: true,
      enzymeScanMaxBp: 100_000,
    })
    expect(next.mapView.linear).toBe(true)
    expect(next.enzymes.visible).toBe(false)
  })

  it('keeps enzymes visible for short sequences when topology defaults apply', () => {
    const current = defaultDisplaySettings
    const next = planDefaultMapViewForTopology(current, 'circular', 5_000, DEFAULT_APP_PREFERENCES)
    expect(next.mapView.linear).toBe(false)
    expect(next.enzymes.visible).toBe(true)
  })

  it('boot handoff hides enzymes for long sequences using default app preferences', () => {
    const boot = planBootDisplaySettings('circular', { openedFromHandoff: true, sequenceLength: 250_000 })
    expect(boot.enzymes.visible).toBe(false)
  })

  it('toggles protein visual controls on the active surface', () => {
    const current: DisplaySettings = {
      ...defaultDisplaySettings,
      alignments: { ...defaultDisplaySettings.alignments, visible: false },
      proteinMapVisual: { ...defaultDisplaySettings.proteinMapVisual, panelOpen: false },
    }
    const next = planToggleProteinVisualControls(current, 'Map')
    expect(next.proteinMapVisual.panelOpen).toBe(true)
  })
})
