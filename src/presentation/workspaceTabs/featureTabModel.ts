import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { featureBounds, featureLength } from '../../domain/sequence'
import { featureDisplayName } from '../map/mapPrimitives'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SequenceFeature, SequenceRecord } from '../../domain/types'
import type { FeatureTabSortDirection, FeatureTabSortMode } from '../sequence'

export type FeatureTabHeading = {
  kind: 'heading'
  key: string
  label: string
  memberId: string | null
}

export type FeatureTabFeatureRow = {
  kind: 'feature'
  key: string
  memberId: string | null
  feature: SequenceFeature
  sequenceLength: number
}

export type FeatureTabEntry = FeatureTabHeading | FeatureTabFeatureRow

function sortFeatureTabRows(
  features: SequenceFeature[],
  mode: FeatureTabSortMode,
  direction: FeatureTabSortDirection,
  sequenceLength: number,
) {
  const sign = direction === 'asc' ? 1 : -1
  return [...features].sort((left, right) => {
    const leftBounds = featureBounds(left)
    const rightBounds = featureBounds(right)
    let cmp: number
    if (mode === 'name') cmp = featureDisplayName(left).localeCompare(featureDisplayName(right))
    else if (mode === 'location') cmp = leftBounds.start - rightBounds.start || leftBounds.end - rightBounds.end
    else if (mode === 'size') cmp = featureLength(left, sequenceLength) - featureLength(right, sequenceLength)
    else if (mode === 'strand') cmp = leftBounds.strand.localeCompare(rightBounds.strand)
    else if (mode === 'type') cmp = left.type.localeCompare(right.type)
    else cmp = (left.notes ?? '').localeCompare(right.notes ?? '')
    return sign * cmp || featureDisplayName(left).localeCompare(featureDisplayName(right))
  })
}

export function buildFeatureTabEntries(
  record: SequenceRecord,
  members: readonly TraceFileRecord[],
  mode: FeatureTabSortMode,
  direction: FeatureTabSortDirection,
): FeatureTabEntry[] {
  const consensusSorted = sortFeatureTabRows(
    record.features,
    mode,
    direction,
    record.sequence.length,
  )
  if (!isDnaLibraryRecord(record)) {
    return consensusSorted.map((feature) => ({
      kind: 'feature' as const,
      key: feature.id,
      memberId: null,
      feature,
      sequenceLength: record.sequence.length,
    }))
  }

  const entries: FeatureTabEntry[] = [
    {
      kind: 'heading',
      key: 'heading:consensus',
      label: 'Consensus',
      memberId: null,
    },
  ]
  for (const feature of consensusSorted) {
    entries.push({
      kind: 'feature',
      key: `c:${feature.id}`,
      memberId: null,
      feature,
      sequenceLength: record.sequence.length,
    })
  }

  for (const member of members) {
    const memberFeatures = member.features ?? []
    if (!memberFeatures.length) continue
    entries.push({
      kind: 'heading',
      key: `heading:${member.id}`,
      label: member.fileName,
      memberId: member.id,
    })
    for (const feature of sortFeatureTabRows(
      memberFeatures,
      mode,
      direction,
      member.sequence.length,
    )) {
      entries.push({
        kind: 'feature',
        key: `m:${member.id}:${feature.id}`,
        memberId: member.id,
        feature,
        sequenceLength: member.sequence.length,
      })
    }
  }
  return entries
}
