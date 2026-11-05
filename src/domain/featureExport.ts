import { directionalityFromFeature } from './featureQualifiers'
import { featureBounds, featureLength, formatRange } from './sequence'
import type { SequenceFeature } from './types'

export type FeatureExportField = 'name' | 'location' | 'size' | 'directionality' | 'type'

export const FEATURE_EXPORT_FIELD_OPTIONS: Array<{ id: FeatureExportField; label: string }> = [
  { id: 'name', label: 'Feature name' },
  { id: 'location', label: 'Location' },
  { id: 'size', label: 'Size (bp)' },
  { id: 'directionality', label: 'Directionality' },
  { id: 'type', label: 'Type' },
]

export const DEFAULT_FEATURE_EXPORT_FIELDS: FeatureExportField[] = ['name', 'location']

function directionalitySymbol(feature: SequenceFeature): string {
  const directionality = directionalityFromFeature(feature)
  if (directionality === 'none') return ''
  if (directionality === 'reverse') return '<='
  if (directionality === 'both') return '<=>'
  return '=>'
}

export function formatFeatureExportRow(
  feature: SequenceFeature,
  sequenceLength: number,
  fields: FeatureExportField[],
): string {
  const bounds = featureBounds(feature)
  const values: string[] = []
  for (const field of fields) {
    if (field === 'name') values.push(feature.name)
    else if (field === 'location') values.push(formatRange(bounds.start, bounds.end))
    else if (field === 'size') values.push(String(featureLength(feature, sequenceLength)))
    else if (field === 'directionality') values.push(directionalitySymbol(feature))
    else if (field === 'type') values.push(feature.type)
  }
  return values.join('\t')
}

/** Tab-separated feature export (no trailing newline — matches SnapGene single-row style). */
export function exportFeatureDataTsv(
  features: SequenceFeature[],
  sequenceLength: number,
  fields: FeatureExportField[],
): string {
  if (!fields.length || !features.length) return ''
  return features.map((feature) => formatFeatureExportRow(feature, sequenceLength, fields)).join('\n')
}
