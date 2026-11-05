import {
  ENZYME_PREFERENCES_STORAGE_KEY,
  loadEnzymePreferences,
  normalizeEnzymePreferences,
  saveEnzymePreferences,
  type EnzymePreferences,
} from './domain/enzymePreferences'

export const ENZYME_PREFERENCES_CHANGED_EVENT = 'vg-enzyme-preferences-changed'

/** Persists enzyme preferences and broadcasts same-tab updates for workspace sync listeners. */
export function persistWorkspaceEnzymePreferences(preferences: EnzymePreferences): void {
  const normalized = normalizeEnzymePreferences(preferences)
  saveEnzymePreferences(normalized)
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(ENZYME_PREFERENCES_CHANGED_EVENT, { detail: normalized }))
  } catch {
    // ignore
  }
}

/** Subscribes to cross-window enzyme preference updates from custom and storage events. */
export function createEnzymePreferencesExternalSync() {
  return (apply: (preferences: EnzymePreferences) => void) => {
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<EnzymePreferences>).detail
      if (detail) apply(normalizeEnzymePreferences(detail))
      else apply(loadEnzymePreferences())
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ENZYME_PREFERENCES_STORAGE_KEY) return
      apply(loadEnzymePreferences())
    }
    window.addEventListener(ENZYME_PREFERENCES_CHANGED_EVENT, onCustom)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(ENZYME_PREFERENCES_CHANGED_EVENT, onCustom)
      window.removeEventListener('storage', onStorage)
    }
  }
}
