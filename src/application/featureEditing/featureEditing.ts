import type { FeatureSegment, SequenceFeature } from '../../domain/types'
import { extractRange, reverseComplement } from '../../domain/sequence'

export type SelectionRange = { start: number; end: number }

export function locationIntersectsRange(
  location: FeatureSegment,
  range: SelectionRange,
  sequenceLength: number,
): boolean {
  if (range.end === range.start) {
    if (location.end > location.start) return range.start >= location.start && range.start < location.end
    if (location.end === location.start) return false
    return range.start >= location.start || range.start < location.end
  }
  const rangeWraps = range.end < range.start
  const locationWraps = location.end < location.start
  if (!rangeWraps && !locationWraps) return location.start < range.end && range.start < location.end
  if (!rangeWraps && locationWraps) {
    return (location.start < range.end && range.start < sequenceLength)
      || (range.start < location.end && range.end > 0)
  }
  if (rangeWraps && !locationWraps) {
    return (range.start < location.end && location.start < sequenceLength)
      || (location.start < range.end && location.end > 0)
  }
  return true
}

export function featureIntersectsRange(
  feature: SequenceFeature,
  range: SelectionRange,
  sequenceLength: number,
): boolean {
  return feature.locations.some((location) => locationIntersectsRange(location, range, sequenceLength))
}

function locationIntervals(location: FeatureSegment, sequenceLength: number): SelectionRange[] {
  if (location.end > location.start) return [{ start: location.start, end: location.end }]
  if (location.end === location.start) return []
  return [{ start: location.start, end: sequenceLength }, { start: 0, end: location.end }]
}

function selectionIntervals(range: SelectionRange, sequenceLength: number): SelectionRange[] {
  if (range.end > range.start) return [{ start: range.start, end: range.end }]
  if (range.end === range.start) return []
  return [{ start: range.start, end: sequenceLength }, { start: 0, end: range.end }]
}

function subtractInterval(interval: SelectionRange, cut: SelectionRange): SelectionRange[] {
  if (interval.end <= cut.start || interval.start >= cut.end) return [interval]
  const parts: SelectionRange[] = []
  if (interval.start < cut.start) parts.push({ start: interval.start, end: cut.start })
  if (interval.end > cut.end) parts.push({ start: cut.end, end: interval.end })
  return parts.filter((part) => part.end > part.start)
}

function intervalsOutsideSelection(
  interval: SelectionRange,
  range: SelectionRange,
  sequenceLength: number,
): SelectionRange[] {
  let remaining = [interval]
  for (const cut of selectionIntervals(range, sequenceLength)) {
    remaining = remaining.flatMap((part) => subtractInterval(part, cut))
  }
  return remaining
}

export type CreateFeatureSegmentResult =
  | { kind: 'missing' }
  | { kind: 'whole-feature'; feature: SequenceFeature }
  | { kind: 'updated'; features: SequenceFeature[]; feature: SequenceFeature; overlaps: boolean }

export function createFeatureSegment(
  features: readonly SequenceFeature[],
  featureId: string,
  range: SelectionRange,
  sequenceLength: number,
): CreateFeatureSegmentResult {
  const target = features.find((feature) => feature.id === featureId)
  if (!target) return { kind: 'missing' }
  const overlaps = featureIntersectsRange(target, range, sequenceLength)
  if (overlaps && target.locations.length === 1
    && target.locations[0]!.start === range.start && target.locations[0]!.end === range.end) {
    return { kind: 'whole-feature', feature: target }
  }
  const strand = target.locations[0]?.strand ?? 'forward'
  const next = features.map((feature) => {
    if (feature.id !== featureId) return feature
    if (!overlaps) {
      return {
        ...feature,
        locations: [...feature.locations, { start: range.start, end: range.end, strand }]
          .sort((left, right) => left.start - right.start),
      }
    }
    const outside: FeatureSegment[] = []
    for (const location of feature.locations) {
      for (const interval of locationIntervals(location, sequenceLength)) {
        for (const part of intervalsOutsideSelection(interval, range, sequenceLength)) {
          outside.push({ ...part, strand: location.strand })
        }
      }
    }
    return {
      ...feature,
      locations: [...outside, { start: range.start, end: range.end, strand }]
        .sort((left, right) => left.start - right.start),
    }
  })
  return { kind: 'updated', features: next, feature: target, overlaps }
}

export type DeleteFeatureSegmentResult =
  | { kind: 'not-found' }
  | { kind: 'single-segment'; feature: SequenceFeature }
  | { kind: 'updated'; features: SequenceFeature[]; feature: SequenceFeature }

export function deleteFeatureSegment(
  features: readonly SequenceFeature[],
  range: SelectionRange,
  sequenceLength: number,
  preferredFeatureId: string | null,
): DeleteFeatureSegmentResult {
  const matches: Array<{ feature: SequenceFeature; index: number }> = []
  for (const feature of features) {
    feature.locations.forEach((location, index) => {
      if (locationIntersectsRange(location, range, sequenceLength)) matches.push({ feature, index })
    })
  }
  if (!matches.length) return { kind: 'not-found' }
  const chosen = matches.find((match) => match.feature.id === preferredFeatureId) ?? matches[0]!
  if (chosen.feature.locations.length <= 1) return { kind: 'single-segment', feature: chosen.feature }
  return {
    kind: 'updated',
    feature: chosen.feature,
    features: features.map((feature) => feature.id === chosen.feature.id
      ? { ...feature, locations: feature.locations.filter((_, index) => index !== chosen.index) }
      : feature),
  }
}

export type MergeFeatureSegmentsResult =
  | { kind: 'not-found' }
  | { kind: 'updated'; features: SequenceFeature[]; feature: SequenceFeature; mergedCount: number }

export function mergeFeatureSegments(
  features: readonly SequenceFeature[],
  range: SelectionRange,
  sequenceLength: number,
  preferredFeatureId: string | null,
): MergeFeatureSegmentsResult {
  const ordered = preferredFeatureId
    ? [
      ...features.filter((feature) => feature.id === preferredFeatureId),
      ...features.filter((feature) => feature.id !== preferredFeatureId),
    ]
    : [...features]
  const target = ordered.find((feature) => feature.locations
    .filter((location) => locationIntersectsRange(location, range, sequenceLength)).length >= 2)
  if (!target) return { kind: 'not-found' }
  const mergedCount = target.locations
    .filter((location) => locationIntersectsRange(location, range, sequenceLength)).length
  return {
    kind: 'updated',
    feature: target,
    mergedCount,
    features: features.map((feature) => {
      if (feature.id !== target.id) return feature
      const inside = feature.locations.filter((location) => locationIntersectsRange(location, range, sequenceLength))
      const outside = feature.locations.filter((location) => !locationIntersectsRange(location, range, sequenceLength))
      const merged: FeatureSegment = {
        start: Math.min(...inside.map((location) => location.start)),
        end: Math.max(...inside.map((location) => location.end)),
        strand: inside[0]!.strand,
      }
      return { ...feature, locations: [...outside, merged].sort((left, right) => left.start - right.start) }
    }),
  }
}

export function addCleavageSite(
  features: readonly SequenceFeature[],
  featureId: string,
  position: number,
): SequenceFeature[] | null {
  const target = features.find((feature) => feature.id === featureId)
  if (!target || target.cleavageArrows?.includes(position)) return null
  return features.map((feature) => feature.id === featureId
    ? { ...feature, cleavageArrows: [...(feature.cleavageArrows ?? []), position].sort((a, b) => a - b) }
    : feature)
}

export function removeCleavageSite(
  features: readonly SequenceFeature[],
  featureId: string,
  position: number | 'all',
): SequenceFeature[] | null {
  const target = features.find((feature) => feature.id === featureId)
  if (!target?.cleavageArrows?.length) return null
  return features.map((feature) => {
    if (feature.id !== featureId) return feature
    if (position === 'all') return { ...feature, cleavageArrows: undefined }
    const cleavageArrows = (feature.cleavageArrows ?? []).filter((entry) => entry !== position)
    return { ...feature, cleavageArrows: cleavageArrows.length ? cleavageArrows : undefined }
  })
}

export function splicedSequenceForFeature(feature: SequenceFeature, sequence: string): string {
  if (!feature.locations.length) return ''
  const strand = feature.locations[0]!.strand
  const ordered = [...feature.locations].sort((left, right) =>
    strand === 'reverse' ? right.start - left.start : left.start - right.start)
  return ordered.map((location) => {
    const exon = extractRange(sequence, location.start, location.end)
    return strand === 'reverse' ? reverseComplement(exon) : exon
  }).join('')
}
