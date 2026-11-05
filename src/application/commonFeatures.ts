import { parseFeatureQualifiers, serializeFeatureQualifiers, syncTranslationQualifiers } from '../domain/featureQualifiers'
import { createId, featureLength, normalizeDna } from '../domain/sequence'
import type { CommonFeatureTemplate } from '../domain/commonFeatures'
import type { SequenceFeature, SequenceRecord } from '../domain/types'

/** Features shorter than this cannot enter Common Features or import-from-file matching. */
export const MIN_COMMON_FEATURE_LENGTH_BP = 5

export function isFeatureLongEnoughForCommonLibrary(
  feature: Pick<SequenceFeature, 'locations'>,
  sequenceLength: number,
): boolean {
  return featureLength(feature, sequenceLength) >= MIN_COMMON_FEATURE_LENGTH_BP
}

function qualifierListFromMap(qualifiers: Record<string, string>): CommonFeatureTemplate['qualifiers'] {
  return Object.entries(qualifiers)
    .filter(([, value]) => value.trim())
    .map(([name, value]) => ({ name, value: value.trim() }))
}

export function templateFromRecordFeature(
  record: SequenceRecord,
  feature: SequenceFeature,
): CommonFeatureTemplate | null {
  const sequence = normalizeDna(record.sequence)
  if (!sequence || !feature.locations.length) return null
  const pieces: string[] = []
  for (const location of feature.locations) {
    if (location.end > location.start) {
      pieces.push(sequence.slice(location.start, location.end))
    } else if (location.end < location.start) {
      pieces.push(sequence.slice(location.start) + sequence.slice(0, location.end))
    }
  }
  const featureSequence = pieces.join('')
  if (!featureSequence || featureSequence.length < MIN_COMMON_FEATURE_LENGTH_BP) return null
  let cursor = 0
  const locations = feature.locations.map((location) => {
    const length =
      location.end > location.start
        ? location.end - location.start
        : location.end < location.start
          ? sequence.length - location.start + location.end
          : 0
    const mapped = { start: cursor, end: cursor + length, strand: location.strand as 'forward' | 'reverse' }
    cursor += length
    return mapped
  })
  const baseStart = feature.locations[0]?.start ?? 0
  const cleavageArrows = feature.cleavageArrows
    ?.map((absolute) => absolute - baseStart)
    .filter((value) => value >= 0 && value <= featureSequence.length)
  let qualifiers = parseFeatureQualifiers(feature.notes)
  const translated = Boolean(feature.translateInSequenceView)
  // Translated CDS (or CDS fragments) should carry /product in the common-feature library.
  if (translated && !qualifiers.product?.trim()) {
    qualifiers = { ...qualifiers, product: feature.name.trim() || 'unnamed' }
  }
  if (translated && feature.translation) {
    qualifiers = syncTranslationQualifiers(
      qualifiers,
      {
        locations,
        translateInSequenceView: true,
        translation: feature.translation,
      },
      featureSequence,
      'linear',
    )
  }
  const notes = serializeFeatureQualifiers(qualifiers) || feature.notes
  return {
    id: createId('user-common'),
    fileName: `${feature.name}.dna`,
    name: feature.name,
    type: feature.type,
    color: feature.color,
    sequence: featureSequence,
    notes,
    qualifiers: qualifierListFromMap(qualifiers),
    locations,
    ...(cleavageArrows?.length ? { cleavageArrows } : {}),
    ...(translated ? { translateInSequenceView: true } : {}),
    ...(feature.translation ? { translation: feature.translation } : {}),
    ...(feature.prioritizeDisplay ? { prioritizeDisplay: true } : {}),
  }
}
