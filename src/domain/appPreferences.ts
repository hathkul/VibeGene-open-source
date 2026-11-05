import {
  DEFAULT_PCR_MIX_SETTINGS,
  normalizePcrMixSettings,
  type PcrMixSettings,
} from './pcrRecipe'

const STORAGE_KEY = 'vibegene:app-preferences'
export const APP_PREFERENCES_CHANGED_EVENT = 'vg-app-preferences-changed'

export type AppPreferences = {
  /** Skip automatic RE-site scanning for long sequences (toolbar starts OFF). */
  skipEnzymeScanForLongSequences: boolean
  /** Length threshold in base pairs when skip is enabled. */
  enzymeScanMaxBp: number
  /** Anonymous install heartbeat; users can disable it in Preferences. */
  shareAnonymousUsage: boolean
  /** Maximum auto-saved unsaved drafts kept in the Drafts menu. */
  maxUnsavedDrafts: number
  /** Maximum entries shown in File → Open Recent. */
  maxRecentFiles: number
  /** When true, constructs open with the description panel visible (desktop). */
  descriptionPanelDefaultVisible: boolean
  /** Defaults for the History PCR recipe calculator. */
  pcr: PcrMixSettings
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  skipEnzymeScanForLongSequences: true,
  enzymeScanMaxBp: 100_000,
  shareAnonymousUsage: true,
  maxUnsavedDrafts: 10,
  maxRecentFiles: 10,
  descriptionPanelDefaultVisible: true,
  pcr: DEFAULT_PCR_MIX_SETTINGS,
}

function clampEnzymeScanMaxBp(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_APP_PREFERENCES.enzymeScanMaxBp
  return Math.max(1_000, Math.min(50_000_000, Math.round(n)))
}

function clampMaxUnsavedDrafts(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_APP_PREFERENCES.maxUnsavedDrafts
  return Math.max(1, Math.min(50, Math.round(n)))
}

function clampMaxRecentFiles(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_APP_PREFERENCES.maxRecentFiles
  return Math.max(1, Math.min(100, Math.round(n)))
}

export function normalizeAppPreferences(
  partial?: (Partial<Omit<AppPreferences, 'pcr'>> & { pcr?: Partial<PcrMixSettings> | null }) | null,
): AppPreferences {
  return {
    skipEnzymeScanForLongSequences:
      partial?.skipEnzymeScanForLongSequences ?? DEFAULT_APP_PREFERENCES.skipEnzymeScanForLongSequences,
    enzymeScanMaxBp: clampEnzymeScanMaxBp(
      partial?.enzymeScanMaxBp ?? DEFAULT_APP_PREFERENCES.enzymeScanMaxBp,
    ),
    shareAnonymousUsage: partial?.shareAnonymousUsage ?? DEFAULT_APP_PREFERENCES.shareAnonymousUsage,
    maxUnsavedDrafts: clampMaxUnsavedDrafts(
      partial?.maxUnsavedDrafts ?? DEFAULT_APP_PREFERENCES.maxUnsavedDrafts,
    ),
    maxRecentFiles: clampMaxRecentFiles(partial?.maxRecentFiles ?? DEFAULT_APP_PREFERENCES.maxRecentFiles),
    descriptionPanelDefaultVisible:
      partial?.descriptionPanelDefaultVisible ?? DEFAULT_APP_PREFERENCES.descriptionPanelDefaultVisible,
    pcr: normalizePcrMixSettings(partial?.pcr ?? DEFAULT_APP_PREFERENCES.pcr),
  }
}

export function readAppPreferences(): AppPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_APP_PREFERENCES }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_APP_PREFERENCES }
    return normalizeAppPreferences(JSON.parse(raw) as Partial<AppPreferences>)
  } catch {
    return { ...DEFAULT_APP_PREFERENCES }
  }
}

export function writeAppPreferences(preferences: AppPreferences): AppPreferences {
  const normalized = normalizeAppPreferences(preferences)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    } catch {
      // ignore quota / private mode
    }
    try {
      window.dispatchEvent(
        new CustomEvent(APP_PREFERENCES_CHANGED_EVENT, { detail: normalized }),
      )
    } catch {
      // ignore
    }
  }
  return normalized
}

/** Whether a newly opened construct should show the description panel (desktop). */
export function shouldShowDescriptionPanelOnOpen(
  preferences: AppPreferences = readAppPreferences(),
): boolean {
  return preferences.descriptionPanelDefaultVisible
}

/** Whether newly loaded sequences should keep the enzyme toolbar OFF (no RE scan yet). */
export function shouldStartWithEnzymesHidden(
  sequenceLength: number,
  preferences: AppPreferences = readAppPreferences(),
): boolean {
  if (!preferences.skipEnzymeScanForLongSequences) return false
  return sequenceLength > preferences.enzymeScanMaxBp
}
