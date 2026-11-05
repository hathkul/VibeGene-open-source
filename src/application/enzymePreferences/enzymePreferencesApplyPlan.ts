import type { EnzymePreferences } from '../../domain/enzymePreferences'

export type EnzymePreferencesApplyPlan = {
  preferences: EnzymePreferences
  tabPositionMode: EnzymePreferences['defaultTab']
}

/** Normalized enzyme preferences plus the tab position mode derived from defaultTab. */
export function planEnzymePreferencesApply(preferences: EnzymePreferences): EnzymePreferencesApplyPlan {
  return {
    preferences,
    tabPositionMode: preferences.defaultTab,
  }
}

export function pickRandomEnzymeName(enzymeNames: readonly string[]): string | null {
  if (!enzymeNames.length) return null
  return enzymeNames[Math.floor(Math.random() * enzymeNames.length)] ?? null
}
