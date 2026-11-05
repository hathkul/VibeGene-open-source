import type { CommonFeatureTemplate } from './commonFeatures'
import {
  defaultEnzymePreferences,
  normalizeEnzymePreferences,
  type EnzymePreferences,
} from './enzymePreferences'
import type { MwLadder } from './mwLadders'
import { DEFAULT_MW_LADDER_ID } from './mwLadders'
import type { MwLadderFavorites } from './mwLadderFavorites'

export const SETTINGS_FILE_KIND = 'vibegene-settings' as const

export type SettingsEnvelope = {
  schemaVersion: 1
  kind: typeof SETTINGS_FILE_KIND
  /** Only fields that differ from app defaults (deep partial). */
  displaySettings?: unknown
  enzymePreferences?: Partial<EnzymePreferences>
  userCommonFeatures?: CommonFeatureTemplate[]
  customMwLadders?: MwLadder[]
  mwLadderFavorites?: MwLadderFavorites
  /** Adapter-owned database UI settings, retained as validated JSON object data. */
  databaseUi?: Record<string, unknown>
}

const EPHEMERAL_DISPLAY_PATHS = new Set([
  'circularVisual.panelOpen',
  'circularVisual.manualLabelPlacement',
  'proteinMapVisual.panelOpen',
  'proteinSequenceVisual.panelOpen',
  'proteinAlignmentVisual.panelOpen',
  'sequenceVisual.panelOpen',
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    return left.every((entry, index) => valuesEqual(entry, right[index]))
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false
    return leftKeys.every((key) => valuesEqual(left[key], right[key]))
  }
  return false
}

/** Deep-diff `value` against `defaults`, omitting unchanged branches and ephemeral UI flags. */
export function pickChangedDeep(
  value: unknown,
  defaults: unknown,
  path = '',
): unknown | undefined {
  if (path && EPHEMERAL_DISPLAY_PATHS.has(path)) return undefined
  if (valuesEqual(value, defaults)) return undefined
  if (Array.isArray(value) || Array.isArray(defaults) || !isPlainObject(value) || !isPlainObject(defaults)) {
    return value
  }

  const patch: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(value), ...Object.keys(defaults)])
  for (const key of keys) {
    const childPath = path ? `${path}.${key}` : key
    if (EPHEMERAL_DISPLAY_PATHS.has(childPath)) continue
    if (!(key in value)) continue
    const child = pickChangedDeep(value[key], defaults[key], childPath)
    if (child !== undefined) patch[key] = child
  }
  return Object.keys(patch).length ? patch : undefined
}

export function pickChangedEnzymePreferences(
  preferences: EnzymePreferences,
  defaults: EnzymePreferences = defaultEnzymePreferences,
): Partial<EnzymePreferences> | undefined {
  const patch: Partial<EnzymePreferences> = {}
  if (preferences.italicizeNames !== defaults.italicizeNames) {
    patch.italicizeNames = preferences.italicizeNames
  }
  if (preferences.boldUniqueCutters !== defaults.boldUniqueCutters) {
    patch.boldUniqueCutters = preferences.boldUniqueCutters
  }
  if (preferences.greenBluntCutters !== defaults.greenBluntCutters) {
    patch.greenBluntCutters = preferences.greenBluntCutters
  }
  if (preferences.defaultTab !== defaults.defaultTab) {
    patch.defaultTab = preferences.defaultTab
  }
  if (preferences.menuSupplierCount !== defaults.menuSupplierCount) {
    patch.menuSupplierCount = preferences.menuSupplierCount
  }
  if (preferences.parentalSet !== defaults.parentalSet) {
    patch.parentalSet = preferences.parentalSet
  }
  if (!valuesEqual(preferences.supplierOrder, defaults.supplierOrder)) {
    patch.supplierOrder = preferences.supplierOrder
  }
  if (!valuesEqual(preferences.savedEnzymeSets, defaults.savedEnzymeSets)) {
    patch.savedEnzymeSets = preferences.savedEnzymeSets
  }
  if (!valuesEqual(preferences.priorityOrder, defaults.priorityOrder)) {
    patch.priorityOrder = preferences.priorityOrder
  }
  return Object.keys(patch).length ? patch : undefined
}

export function exportSettingsJson(options: {
  displaySettings: unknown
  defaultDisplaySettings: unknown
  enzymePreferences: EnzymePreferences
  userCommonFeatures?: CommonFeatureTemplate[]
  customMwLadders?: MwLadder[]
  mwLadderFavorites?: MwLadderFavorites
  databaseUi?: Record<string, unknown>
}): string {
  const displaySettings = pickChangedDeep(options.displaySettings, options.defaultDisplaySettings)
  const enzymePreferences = pickChangedEnzymePreferences(options.enzymePreferences)
  const userCommonFeatures = options.userCommonFeatures?.length ? options.userCommonFeatures : undefined
  const customMwLadders = options.customMwLadders?.length ? options.customMwLadders : undefined
  const favorites = options.mwLadderFavorites
  const mwLadderFavorites =
    favorites &&
    favorites.favoriteIds.length > 0 &&
    !(favorites.favoriteIds.length === 1 && favorites.favoriteIds[0] === DEFAULT_MW_LADDER_ID)
      ? favorites
      : undefined
  const databaseUi = options.databaseUi

  const envelope: SettingsEnvelope = {
    schemaVersion: 1,
    kind: SETTINGS_FILE_KIND,
    ...(displaySettings !== undefined ? { displaySettings } : {}),
    ...(enzymePreferences ? { enzymePreferences } : {}),
    ...(userCommonFeatures ? { userCommonFeatures } : {}),
    ...(customMwLadders ? { customMwLadders } : {}),
    ...(mwLadderFavorites ? { mwLadderFavorites } : {}),
    ...(databaseUi ? { databaseUi } : {}),
  }
  return JSON.stringify(envelope, null, 2)
}

export function isSettingsFile(parsed: unknown): parsed is SettingsEnvelope {
  if (!isPlainObject(parsed)) return false
  return parsed.kind === SETTINGS_FILE_KIND && parsed.schemaVersion === 1
}

export function parseSettingsJson(text: string): SettingsEnvelope {
  const parsed = JSON.parse(text) as unknown
  if (!isSettingsFile(parsed)) {
    throw new Error('Not a VibeGene settings file (expected kind "vibegene-settings").')
  }
  const databaseUi = isPlainObject(parsed.databaseUi) ? parsed.databaseUi : undefined
  return {
    schemaVersion: 1,
    kind: SETTINGS_FILE_KIND,
    ...(parsed.displaySettings != null ? { displaySettings: parsed.displaySettings } : {}),
    ...(parsed.enzymePreferences != null
      ? { enzymePreferences: normalizeEnzymePreferences(parsed.enzymePreferences) }
      : {}),
    ...(Array.isArray(parsed.userCommonFeatures) && parsed.userCommonFeatures.length
      ? { userCommonFeatures: parsed.userCommonFeatures as CommonFeatureTemplate[] }
      : {}),
    ...(Array.isArray(parsed.customMwLadders) && parsed.customMwLadders.length
      ? { customMwLadders: parsed.customMwLadders as MwLadder[] }
      : {}),
    ...(parsed.mwLadderFavorites && isPlainObject(parsed.mwLadderFavorites)
      ? {
          mwLadderFavorites: {
            favoriteIds: Array.isArray(parsed.mwLadderFavorites.favoriteIds)
              ? parsed.mwLadderFavorites.favoriteIds.filter((id): id is string => typeof id === 'string')
              : [],
          },
        }
      : {}),
    ...(databaseUi ? { databaseUi } : {}),
  }
}
