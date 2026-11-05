import { assignIntervalLanes } from '../../domain/intervalLanes'
import { isTypeIisEnzyme } from '../../domain/typeIisEnzymes'
import { featurePriority, type FeatureRenderInfo } from '../map'
import { assignSequencePaneLanesWithTranslations, type TranslationGroupPackInput } from '../../domain/sequencePaneTranslationLayout'
import type { AnnealTemperatureResult } from '../../domain/primerThermodynamics'
import { enzymeSiteCounts } from '../map/mapPrimitives'
import type {
  DisplaySettings,
  RestrictionSiteList,
  SelectionRange,
} from './sequenceShared'
import { inFrameExtensionSegmentId } from './sequenceShared'
import type { FeatureTranslationExtensionSpan } from '../../domain/geneticCode'
import type { SequenceFeature, Strand } from '../../domain/types'
export function chunkSequence(sequence: string, basesPerRow: number) {
  const rows: string[] = []
  for (let index = 0; index < sequence.length; index += basesPerRow) {
    rows.push(sequence.slice(index, index + basesPerRow))
  }
  return rows
}

export function assignRowFeatureLanes(
  segments: Array<{
    feature: SequenceFeature
    segmentId: string
    start: number
    end: number
    strand?: Strand
    segmentStart?: number
    segmentEnd?: number
    isFeatureStart?: boolean
    isFeatureEnd?: boolean
    isInFrameExtension?: boolean
  }>,
  translationGroups?: TranslationGroupPackInput[],
) {
  if (translationGroups?.length) {
    const laneBySegmentId = assignSequencePaneLanesWithTranslations(
      segments.map((segment) => ({
        segmentId: segment.segmentId,
        featureId: segment.feature.id,
        start: segment.start,
        end: segment.end,
        priority: featurePriority(segment.feature.type),
      })),
      translationGroups,
    )
    return segments.map((segment) => ({
      ...segment,
      lane: laneBySegmentId.get(segment.segmentId) ?? 0,
    }))
  }
  const laned = assignIntervalLanes(
    segments.map((segment) => ({
      id: segment.segmentId,
      start: segment.start,
      end: segment.end,
      priority: featurePriority(segment.feature.type),
    })),
  )
  const laneBySegmentId = new Map(laned.map((entry) => [entry.id, entry.lane]))
  return segments.map((segment) => ({
    ...segment,
    lane: laneBySegmentId.get(segment.segmentId) ?? 0,
  }))
}

export function sequencePaneRowLaneSegments(
  rowStart: number,
  rowEnd: number,
  drawableSegments: Omit<FeatureRenderInfo, 'level'>[],
  inFrameExtensionsByFeatureId: Map<string, FeatureTranslationExtensionSpan[]>,
  featuresById: Map<string, SequenceFeature>,
) {
  const bodySegments = drawableSegments.flatMap((segment) => {
    const start = Math.max(segment.start, rowStart)
    const end = Math.min(segment.end, rowEnd)
    if (end <= rowStart || start >= rowEnd || end <= start) return []
    return [{
      feature: segment.feature,
      segmentId: segment.segmentId,
      start,
      end,
      strand: segment.strand,
      segmentStart: segment.start,
      segmentEnd: segment.end,
      isFeatureStart: segment.isFeatureStart,
      isFeatureEnd: segment.isFeatureEnd,
    }]
  })

  const extensionSegments = [...inFrameExtensionsByFeatureId.entries()].flatMap(([featureId, spans]) => {
    const feature = featuresById.get(featureId)
    if (!feature) return []
    return spans.flatMap((span, spanIndex) => {
      const start = Math.max(span.start, rowStart)
      const end = Math.min(span.end, rowEnd)
      if (end <= rowStart || start >= rowEnd || end <= start) return []
      return [{
        feature,
        segmentId: inFrameExtensionSegmentId(featureId, span, spanIndex),
        start,
        end,
        isInFrameExtension: true as const,
      }]
    })
  })

  return [...bodySegments, ...extensionSegments]
}

export function assignSequencePaneRowFeatureLanes(
  rowStart: number,
  rowEnd: number,
  drawableSegments: Omit<FeatureRenderInfo, 'level'>[],
  inFrameExtensionsByFeatureId: Map<string, FeatureTranslationExtensionSpan[]>,
  featuresById: Map<string, SequenceFeature>,
  translationGroups?: TranslationGroupPackInput[],
  drawableCandidates: Omit<FeatureRenderInfo, 'level'>[] = drawableSegments,
) {
  return assignRowFeatureLanes(
    sequencePaneRowLaneSegments(rowStart, rowEnd, drawableCandidates, inFrameExtensionsByFeatureId, featuresById),
    translationGroups,
  )
}

export function selectionLength(range: SelectionRange, sequenceLength: number) {
  if (range.end === range.start) return 1
  return range.end > range.start ? range.end - range.start : sequenceLength - range.start + range.end
}

export function formatThermoTemperature(result: AnnealTemperatureResult) {
  if (result.tmC === null || result.tmMinC === null || result.tmMaxC === null) return 'Tm unavailable'
  if (Math.abs(result.tmMaxC - result.tmMinC) < 0.05) return `${result.tmC.toFixed(1)} C`
  return `${result.tmMinC.toFixed(1)}-${result.tmMaxC.toFixed(1)} C`
}

export function formatThermoGc(result: AnnealTemperatureResult) {
  if (Math.abs(result.gcPercentMax - result.gcPercentMin) < 0.05) return `${result.gcPercent.toFixed(1)}%`
  return `${result.gcPercentMin.toFixed(1)}-${result.gcPercentMax.toFixed(1)}%`
}

export function thermoMethodLabel(method: AnnealTemperatureResult['method']) {
  if (method === 'primd-santalucia-1998') return 'primd SL98'
  if (method === 'santalucia-hicks-2004') return 'SL2004'
  if (method === 'santalucia-hicks-2004-degenerate-range') return 'SL2004 range'
  return 'unsupported'
}

export function isPositionInRange(position: number, range: SelectionRange | null) {
  if (!range) return false
  if (range.start <= range.end) return position >= range.start && position < range.end
  return position >= range.start || position < range.end
}

export function filterRestrictionSitesForEnzymeSet(sites: RestrictionSiteList, settings: DisplaySettings['enzymes']) {
  const counts = enzymeSiteCounts(sites)
  return sites.filter((site) => {
    const count = counts[site.enzyme.name] ?? 0
    if (settings.set === 'unique') return count === 1
    if (settings.set === 'unique-dual') return count === 1 || count === 2
    if (settings.set === 'six-plus') return site.enzyme.recognition.length >= 6
    if (settings.set === 'unique-six-plus') return site.enzyme.recognition.length >= 6 && count === 1
    if (settings.set === 'type-iis') return isTypeIisEnzyme(site.enzyme)
    if (settings.set === 'custom') return settings.selectedNames.includes(site.enzyme.name)
    return true
  })
}

export function filterRestrictionSitesForDisplay(sites: RestrictionSiteList, settings: DisplaySettings['enzymes']) {
  if (!settings.visible) return []
  const hiddenNames = new Set(settings.hiddenNames ?? [])
  return filterRestrictionSitesForEnzymeSet(sites, settings).filter((site) => !hiddenNames.has(site.enzyme.name))
}
