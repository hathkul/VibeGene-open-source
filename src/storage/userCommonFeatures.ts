import {
  loadBuiltInCommonFeatures,
  type CommonFeatureTemplate,
} from '../domain/commonFeatures'
import { readUserCommonFeatures, writeUserCommonFeatures } from './userCommonFeaturesStore'
import { MIN_COMMON_FEATURE_LENGTH_BP } from '../application/commonFeatures'

export { readUserCommonFeatures, writeUserCommonFeatures, mergeUserCommonFeatures } from './userCommonFeaturesStore'

export { isFeatureLongEnoughForCommonLibrary, MIN_COMMON_FEATURE_LENGTH_BP, templateFromRecordFeature } from '../application/commonFeatures'

export function listUserCommonFeatures(): CommonFeatureTemplate[] {
  return readUserCommonFeatures()
}

export async function getAllCommonFeatures(): Promise<CommonFeatureTemplate[]> {
  const builtIn = await loadBuiltInCommonFeatures()
  return [...builtIn, ...readUserCommonFeatures()]
}


export function addUserCommonFeature(template: CommonFeatureTemplate) {
  const current = readUserCommonFeatures()
  writeUserCommonFeatures([...current, template])
}

export function addUserCommonFeatures(templates: CommonFeatureTemplate[]) {
  const eligible = templates.filter((template) => template.sequence.length >= MIN_COMMON_FEATURE_LENGTH_BP)
  if (!eligible.length) return
  writeUserCommonFeatures([...readUserCommonFeatures(), ...eligible])
}

export function removeUserCommonFeature(id: string) {
  writeUserCommonFeatures(readUserCommonFeatures().filter((entry) => entry.id !== id))
}
