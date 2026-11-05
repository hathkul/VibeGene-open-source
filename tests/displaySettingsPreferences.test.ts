/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearPersistedVisualSettings,
  loadPersistedVisualSettings,
  persistVisualSettingsFromPatch,
  pickVisualSettingsPatch,
  savePersistedVisualSettings,
} from '../src/domain/displaySettingsPreferences'

const STORAGE_KEY = 'vibegene.displayVisualSettings'

const defaults = {
  circularVisual: {
    panelOpen: false,
    manualLabelPlacement: false,
    outsideLabelFontSizePx: 12,
    enzymeFontWeight: 500,
  },
  proteinMapVisual: {
    panelOpen: false,
    featureHeightPx: 16,
    featureLabelFontSizePx: 12,
  },
  proteinSequenceVisual: {
    panelOpen: false,
    residueFontSizePx: 14,
  },
  proteinAlignmentVisual: {
    panelOpen: false,
    residueFontSizePx: 12,
  },
  proteinColors: {
    enabled: true,
    mode: 'class',
    classPalette: { nonpolar: '#dbeafe', polar: '#dcfce7' },
    residuePalette: { A: '#dbeafe', R: '#ede9fe' },
  },
  sequenceVisual: {
    panelOpen: false,
    sequenceFontSizePx: 12,
    featureBodyFrame: false,
  },
  labelRouting: {
    ellipticRingGap: 0,
    ellipticBalanceRing: true,
  },
  enzymes: { visible: true },
}

afterEach(() => {
  window.localStorage.removeItem(STORAGE_KEY)
})

describe('displaySettingsPreferences', () => {
  it('picks only visual branches from a patch', () => {
    expect(
      pickVisualSettingsPatch({
        circularVisual: { outsideLabelFontSizePx: 14 },
        proteinMapVisual: { featureHeightPx: 18 },
        enzymes: { visible: false },
        sequenceVisual: { featureBodyFrame: true },
      }),
    ).toEqual({
      circularVisual: { outsideLabelFontSizePx: 14 },
      proteinMapVisual: { featureHeightPx: 18 },
      sequenceVisual: { featureBodyFrame: true },
    })
  })

  it('saves map visual settings without wiping sequence prefs', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sequenceVisual: { sequenceFontSizePx: 16 } }),
    )
    const current = {
      ...defaults,
      circularVisual: { ...defaults.circularVisual, panelOpen: true, outsideLabelFontSizePx: 15 },
      proteinMapVisual: { ...defaults.proteinMapVisual, panelOpen: true, featureHeightPx: 20 },
      sequenceVisual: { ...defaults.sequenceVisual, sequenceFontSizePx: 16 },
    }
    const saved = savePersistedVisualSettings(current, defaults, 'map')
    expect(saved?.circularVisual).toEqual({ outsideLabelFontSizePx: 15 })
    expect(saved?.proteinMapVisual).toEqual({ featureHeightPx: 20 })
    expect(saved?.sequenceVisual).toEqual({ sequenceFontSizePx: 16 })
    expect(loadPersistedVisualSettings()?.circularVisual).toEqual({ outsideLabelFontSizePx: 15 })
    expect(loadPersistedVisualSettings()?.proteinMapVisual).toEqual({ featureHeightPx: 20 })
  })

  it('merges imported settings patches into localStorage', () => {
    persistVisualSettingsFromPatch({
      sequenceVisual: { featureBodyFrame: true, panelOpen: true },
    })
    const loaded = loadPersistedVisualSettings()
    expect(loaded?.sequenceVisual).toEqual({ featureBodyFrame: true, panelOpen: true })
  })

  it('persists exact imported protein color settings and replaces older palettes', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        proteinColors: {
          mode: 'class',
          classPalette: { nonpolar: '#aaaaaa', polar: '#bbbbbb' },
        },
      }),
    )
    persistVisualSettingsFromPatch({
      proteinColors: {
        mode: 'residue',
        residuePalette: { A: '#111111' },
      },
    }, { replaceProteinColors: true })
    expect(loadPersistedVisualSettings()?.proteinColors).toEqual({
      mode: 'residue',
      residuePalette: { A: '#111111' },
    })
  })

  it('saves protein sequence and alignment visual settings under sequence scope', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ circularVisual: { outsideLabelFontSizePx: 15 } }),
    )
    const current = {
      ...defaults,
      proteinSequenceVisual: { panelOpen: true, residueFontSizePx: 18 },
      proteinAlignmentVisual: { panelOpen: false, residueFontSizePx: 14 },
      sequenceVisual: { ...defaults.sequenceVisual, sequenceFontSizePx: 16 },
    }
    const withDefaults = {
      ...defaults,
      proteinSequenceVisual: { panelOpen: false, residueFontSizePx: 14 },
      proteinAlignmentVisual: { panelOpen: false, residueFontSizePx: 12 },
    }
    const saved = savePersistedVisualSettings(current, withDefaults, 'sequence')
    expect(saved?.proteinSequenceVisual).toEqual({ residueFontSizePx: 18 })
    expect(saved?.proteinAlignmentVisual).toEqual({ residueFontSizePx: 14 })
    expect(saved?.sequenceVisual).toEqual({ sequenceFontSizePx: 16 })
    expect(saved?.circularVisual).toEqual({ outsideLabelFontSizePx: 15 })
  })

  it('clears map prefs without removing sequence prefs', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        circularVisual: { outsideLabelFontSizePx: 15 },
        proteinMapVisual: { featureLabelFontSizePx: 14 },
        sequenceVisual: { sequenceFontSizePx: 16 },
      }),
    )
    clearPersistedVisualSettings('map')
    expect(loadPersistedVisualSettings()).toEqual({ sequenceVisual: { sequenceFontSizePx: 16 } })
  })
})
