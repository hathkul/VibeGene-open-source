import { pickChangedDeep } from './settingsFile'

const DISPLAY_VISUAL_STORAGE_KEY = 'vibegene.displayVisualSettings'

const VISUAL_TOP_LEVEL_KEYS = [
  'circularVisual',
  'proteinMapVisual',
  'proteinSequenceVisual',
  'proteinAlignmentVisual',
  'proteinColors',
  'sequenceVisual',
  'labelRouting',
] as const

export type PersistedVisualSettings = {
  circularVisual?: Record<string, unknown>
  proteinMapVisual?: Record<string, unknown>
  proteinSequenceVisual?: Record<string, unknown>
  proteinAlignmentVisual?: Record<string, unknown>
  proteinColors?: Record<string, unknown>
  sequenceVisual?: Record<string, unknown>
  labelRouting?: Record<string, unknown>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Keep only map/sequence visual preference branches from a display-settings patch. */
export function pickVisualSettingsPatch(partial: unknown): PersistedVisualSettings | undefined {
  if (!isPlainObject(partial)) return undefined
  const next: PersistedVisualSettings = {}
  for (const key of VISUAL_TOP_LEVEL_KEYS) {
    const value = partial[key]
    if (isPlainObject(value) && Object.keys(value).length > 0) {
      next[key] = value
    }
  }
  return Object.keys(next).length ? next : undefined
}

export function loadPersistedVisualSettings(): PersistedVisualSettings | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(DISPLAY_VISUAL_STORAGE_KEY)
    if (!raw) return undefined
    return pickVisualSettingsPatch(JSON.parse(raw) as unknown)
  } catch {
    return undefined
  }
}

/**
 * Persist durable visual preferences (fonts, frames, label routing).
 * `scope` limits which branches are updated so Map Save does not wipe Sequence prefs.
 */
export function savePersistedVisualSettings(
  displaySettings: unknown,
  defaultDisplaySettings: unknown,
  scope: 'map' | 'sequence' | 'all' = 'all',
): PersistedVisualSettings | undefined {
  if (typeof window === 'undefined') return undefined
  const changed = pickChangedDeep(displaySettings, defaultDisplaySettings)
  const fromCurrent = pickVisualSettingsPatch(changed) ?? {}
  const existing = loadPersistedVisualSettings() ?? {}
  const next: PersistedVisualSettings = { ...existing }

  if (scope === 'map' || scope === 'all') {
    if (fromCurrent.circularVisual) next.circularVisual = fromCurrent.circularVisual
    else delete next.circularVisual
    if (fromCurrent.proteinMapVisual) next.proteinMapVisual = fromCurrent.proteinMapVisual
    else delete next.proteinMapVisual
    if (fromCurrent.labelRouting) next.labelRouting = fromCurrent.labelRouting
    else delete next.labelRouting
  }
  if (scope === 'sequence' || scope === 'all') {
    if (fromCurrent.sequenceVisual) next.sequenceVisual = fromCurrent.sequenceVisual
    else delete next.sequenceVisual
    if (fromCurrent.proteinSequenceVisual) next.proteinSequenceVisual = fromCurrent.proteinSequenceVisual
    else delete next.proteinSequenceVisual
    if (fromCurrent.proteinAlignmentVisual) next.proteinAlignmentVisual = fromCurrent.proteinAlignmentVisual
    else delete next.proteinAlignmentVisual
  }

  const cleaned = pickVisualSettingsPatch(next)
  if (!cleaned) {
    window.localStorage.removeItem(DISPLAY_VISUAL_STORAGE_KEY)
    return undefined
  }
  window.localStorage.setItem(DISPLAY_VISUAL_STORAGE_KEY, JSON.stringify(cleaned))
  return cleaned
}

/** Clear persisted visual prefs for a scope (does not change other scopes). */
export function clearPersistedVisualSettings(scope: 'map' | 'sequence' | 'all' = 'all') {
  if (typeof window === 'undefined') return
  if (scope === 'all') {
    window.localStorage.removeItem(DISPLAY_VISUAL_STORAGE_KEY)
    return
  }
  const existing = loadPersistedVisualSettings() ?? {}
  const next: PersistedVisualSettings = { ...existing }
  if (scope === 'map') {
    delete next.circularVisual
    delete next.proteinMapVisual
    delete next.labelRouting
  } else {
    delete next.sequenceVisual
    delete next.proteinSequenceVisual
    delete next.proteinAlignmentVisual
  }
  const cleaned = pickVisualSettingsPatch(next)
  if (!cleaned) {
    window.localStorage.removeItem(DISPLAY_VISUAL_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(DISPLAY_VISUAL_STORAGE_KEY, JSON.stringify(cleaned))
}

/** Merge imported/exported visual settings into localStorage (full visual patch). */
export function persistVisualSettingsFromPatch(
  partial: unknown,
  options: { replaceProteinColors?: boolean } = {},
): PersistedVisualSettings | undefined {
  if (typeof window === 'undefined') return undefined
  const visual = pickVisualSettingsPatch(partial)
  if (!visual) return loadPersistedVisualSettings()
  const existing = loadPersistedVisualSettings() ?? {}
  const mergeBranch = (
    key: keyof PersistedVisualSettings,
  ): Record<string, unknown> | undefined => {
    const left = existing[key]
    const right = visual[key]
    if (isPlainObject(left) || isPlainObject(right)) {
      return { ...(left ?? {}), ...(right ?? {}) }
    }
    return undefined
  }
  const merged = pickVisualSettingsPatch({
    ...existing,
    ...visual,
    circularVisual: mergeBranch('circularVisual'),
    proteinMapVisual: mergeBranch('proteinMapVisual'),
    proteinSequenceVisual: mergeBranch('proteinSequenceVisual'),
    proteinAlignmentVisual: mergeBranch('proteinAlignmentVisual'),
    proteinColors: options.replaceProteinColors
      ? visual.proteinColors
      : mergeBranch('proteinColors'),
    sequenceVisual: mergeBranch('sequenceVisual'),
    labelRouting: mergeBranch('labelRouting'),
  })
  if (!merged) {
    window.localStorage.removeItem(DISPLAY_VISUAL_STORAGE_KEY)
    return undefined
  }
  window.localStorage.setItem(DISPLAY_VISUAL_STORAGE_KEY, JSON.stringify(merged))
  return merged
}
