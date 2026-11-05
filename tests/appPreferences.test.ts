// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_PREFERENCES,
  normalizeAppPreferences,
  readAppPreferences,
  shouldShowDescriptionPanelOnOpen,
  shouldStartWithEnzymesHidden,
} from '../src/domain/appPreferences'

describe('appPreferences', () => {
  it('defaults long-sequence skip to on at 100 kb', () => {
    expect(normalizeAppPreferences(null)).toEqual(DEFAULT_APP_PREFERENCES)
    expect(DEFAULT_APP_PREFERENCES.skipEnzymeScanForLongSequences).toBe(true)
    expect(DEFAULT_APP_PREFERENCES.enzymeScanMaxBp).toBe(100_000)
    expect(DEFAULT_APP_PREFERENCES.maxUnsavedDrafts).toBe(10)
    expect(DEFAULT_APP_PREFERENCES.maxRecentFiles).toBe(10)
    expect(DEFAULT_APP_PREFERENCES.descriptionPanelDefaultVisible).toBe(true)
    expect(DEFAULT_APP_PREFERENCES.pcr.reactionVolumeUl).toBe(20)
    expect(DEFAULT_APP_PREFERENCES.pcr.primerStockuM).toBe(10)
    expect(DEFAULT_APP_PREFERENCES.pcr.bufferFold).toBe(10)
    expect(DEFAULT_APP_PREFERENCES.pcr.dntpStockmM).toBe(10)
    expect(DEFAULT_APP_PREFERENCES.pcr.polymeraseUl).toBe(0.5)
    expect(DEFAULT_APP_PREFERENCES.pcr.templateUl).toBe(1)
  })

  it('ignores the retired syncDatabaseOnExit preference persisted by older versions', () => {
    window.localStorage.setItem(
      'vibegene:app-preferences',
      JSON.stringify({ syncDatabaseOnExit: false }),
    )

    const normalized = readAppPreferences()

    expect(normalized).toEqual(DEFAULT_APP_PREFERENCES)
    expect('syncDatabaseOnExit' in normalized).toBe(false)
    window.localStorage.clear()
  })

  it('fills PCR mix defaults when the preference object omits them', () => {
    expect(normalizeAppPreferences({}).pcr).toEqual(DEFAULT_APP_PREFERENCES.pcr)
    expect(normalizeAppPreferences({ pcr: { bufferFold: 5 } }).pcr.bufferFold).toBe(5)
    expect(normalizeAppPreferences({ pcr: { bufferFold: 5 } }).pcr.polymeraseUl).toBe(0.5)
    expect(normalizeAppPreferences({ pcr: { bufferFold: 5 } }).pcr.templateUl).toBe(1)
    expect(normalizeAppPreferences({ pcr: { bufferFold: 0 } }).pcr.bufferFold).toBe(1)
  })

  it('keeps description panel on by default when the preference is omitted', () => {
    expect(normalizeAppPreferences({}).descriptionPanelDefaultVisible).toBe(true)
    expect(normalizeAppPreferences({ descriptionPanelDefaultVisible: false }).descriptionPanelDefaultVisible).toBe(
      false,
    )
  })

  it('hides enzymes on load only when skip is enabled and length exceeds the threshold', () => {
    const prefs = normalizeAppPreferences({
      skipEnzymeScanForLongSequences: true,
      enzymeScanMaxBp: 100_000,
    })
    expect(shouldStartWithEnzymesHidden(100_000, prefs)).toBe(false)
    expect(shouldStartWithEnzymesHidden(100_001, prefs)).toBe(true)
    expect(
      shouldStartWithEnzymesHidden(1_000_000, {
        ...prefs,
        skipEnzymeScanForLongSequences: false,
      }),
    ).toBe(false)
  })

  it('opens the description panel unless the preference is off', () => {
    expect(shouldShowDescriptionPanelOnOpen(DEFAULT_APP_PREFERENCES)).toBe(true)
    expect(
      shouldShowDescriptionPanelOnOpen({
        ...DEFAULT_APP_PREFERENCES,
        descriptionPanelDefaultVisible: false,
      }),
    ).toBe(false)
  })
})
