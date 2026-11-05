import type { CommonFeatureTemplate } from '../domain/commonFeatures'

const USER_COMMON_FEATURES_KEY = 'vibegene.userCommonFeatures'

export function readUserCommonFeatures(): CommonFeatureTemplate[] {
  try {
    const raw = localStorage.getItem(USER_COMMON_FEATURES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CommonFeatureTemplate[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeUserCommonFeatures(templates: CommonFeatureTemplate[]) {
  localStorage.setItem(USER_COMMON_FEATURES_KEY, JSON.stringify(templates))
}

export function mergeUserCommonFeatures(incoming: CommonFeatureTemplate[]) {
  if (!incoming.length) return readUserCommonFeatures()
  const current = readUserCommonFeatures()
  const byId = new Map(current.map((entry) => [entry.id, entry]))
  for (const entry of incoming) {
    byId.set(entry.id, entry)
  }
  const merged = [...byId.values()]
  writeUserCommonFeatures(merged)
  return merged
}
