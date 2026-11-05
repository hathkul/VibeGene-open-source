import type { AppPreferences } from '../../domain/appPreferences'

export type ApplySavedAppPreferencesPorts = {
  setAppPreferences: (preferences: AppPreferences) => void
  trimSessionDraftsToLimit: (limit: number) => Promise<void>
  refreshSessionDrafts: () => Promise<void>
  trimRecentFilesToLimit: (limit: number) => void
  refreshRecentFiles: () => void
}

/**
 * Applies preference saves and keeps draft/recent limits in sync with the new caps.
 * Draft trimming runs fire-and-forget; recent-file trimming runs immediately regardless
 * of draft trim/refresh outcome (matches legacy PreferencesDialog onSave sequencing).
 */
export function applySavedAppPreferences(
  preferences: AppPreferences,
  ports: ApplySavedAppPreferencesPorts,
): void {
  ports.setAppPreferences(preferences)
  void ports
    .trimSessionDraftsToLimit(preferences.maxUnsavedDrafts)
    .then(() => ports.refreshSessionDrafts())
    .catch(() => {})
  ports.trimRecentFilesToLimit(preferences.maxRecentFiles)
  ports.refreshRecentFiles()
}
