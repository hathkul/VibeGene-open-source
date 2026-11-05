import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { displayableRecordFeatures } from '../../domain/primerPaneEntries'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SequenceFeature, SequenceRecord } from '../../domain/types'
import type { FeatureTabSortDirection, FeatureTabSortMode, SelectionFocus, WorkspaceTab } from '../sequence'
import {
  buildFeatureTabEntries,
  type FeatureTabEntry,
  type FeatureTabFeatureRow,
} from './featureTabModel'

export type FeaturePaneDisplayVisibility = {
  featuresVisible: boolean
  orfsVisible: boolean
  sgRnasVisible: boolean
}

function isPrimerBindFeature(feature: SequenceFeature): boolean {
  return feature.type === 'primer_bind'
}

function isRulerMapTrackFeature(feature: SequenceFeature): boolean {
  return feature.mapTrack === 'ruler'
}

export function buildDisplayAnnotationFeatures(
  recordFeatures: readonly SequenceFeature[],
  visibility: FeaturePaneDisplayVisibility,
  orfFeatures: readonly SequenceFeature[],
): SequenceFeature[] {
  const visibleRecordFeatures = displayableRecordFeatures(recordFeatures, {
    featuresVisible: visibility.featuresVisible,
    sgRnasVisible: visibility.sgRnasVisible,
  })
  return visibility.orfsVisible ? [...visibleRecordFeatures, ...orfFeatures] : visibleRecordFeatures
}

export function buildMapAnnotationFeatures(
  displayAnnotationFeatures: readonly SequenceFeature[],
  recordFeatures: readonly SequenceFeature[],
  featuresVisible: boolean,
): SequenceFeature[] {
  return [
    ...displayAnnotationFeatures.filter((feature) => !isPrimerBindFeature(feature)),
    ...(featuresVisible ? recordFeatures.filter(isRulerMapTrackFeature) : []),
  ]
}

export function buildSelectableAnnotations(
  record: SequenceRecord,
  traceFiles: readonly TraceFileRecord[],
  alignmentsVisible: boolean,
  orfFeatures: readonly SequenceFeature[],
): SequenceFeature[] {
  const memberFeatures =
    !alignmentsVisible && isDnaLibraryRecord(record)
      ? traceFiles.flatMap((trace) => trace.features ?? [])
      : []
  return [...record.features, ...memberFeatures, ...orfFeatures]
}

export function resolveSelectedLibraryMember(
  record: SequenceRecord,
  traceFiles: readonly TraceFileRecord[],
  selectedAlignmentTraceId: string | null,
): TraceFileRecord | null {
  if (!selectedAlignmentTraceId || !isDnaLibraryRecord(record)) return null
  return traceFiles.find((trace) => trace.id === selectedAlignmentTraceId) ?? null
}

export function resolveFeatureSelectionMember(
  record: SequenceRecord,
  traceFiles: readonly TraceFileRecord[],
  activeTab: WorkspaceTab,
  selectionFocus: SelectionFocus,
  featureTabSelectionMemberId: string | null,
  selectedLibraryMember: TraceFileRecord | null,
): TraceFileRecord | null {
  if (!isDnaLibraryRecord(record)) return null
  if (activeTab === 'Features' || selectionFocus === 'feature') {
    if (!featureTabSelectionMemberId) return null
    return traceFiles.find((trace) => trace.id === featureTabSelectionMemberId) ?? null
  }
  return selectedLibraryMember
}

export function resolveSelectedFeature(
  record: SequenceRecord,
  traceFiles: readonly TraceFileRecord[],
  selectedFeatureId: string | null,
  featureSelectionMember: TraceFileRecord | null,
): SequenceFeature | null {
  if (!selectedFeatureId) return null
  return (
    featureSelectionMember?.features?.find((feature) => feature.id === selectedFeatureId)
    ?? record.features.find((feature) => feature.id === selectedFeatureId)
    ?? traceFiles.flatMap((trace) => trace.features ?? []).find((feature) => feature.id === selectedFeatureId)
    ?? null
  )
}

export function resolveSelectedAnnotation(
  selectableAnnotations: readonly SequenceFeature[],
  selectedFeatureId: string | null,
): SequenceFeature | null {
  if (!selectedFeatureId) return null
  return selectableAnnotations.find((feature) => feature.id === selectedFeatureId) ?? null
}

export function canOpenSelectedFeatureAsProtein(
  record: SequenceRecord,
  selectedAnnotation: SequenceFeature | null,
): boolean {
  return Boolean(
    record.molecule !== 'protein'
      && selectedAnnotation?.translateInSequenceView
      && selectedAnnotation.translation,
  )
}

export function resolveFeaturePaneSourceFeatures(
  record: SequenceRecord,
  traceFiles: readonly TraceFileRecord[],
  featureTabSelectionMemberId: string | null,
  selectedLibraryMember: TraceFileRecord | null,
): SequenceFeature[] {
  if (featureTabSelectionMemberId) {
    return traceFiles.find((trace) => trace.id === featureTabSelectionMemberId)?.features ?? []
  }
  return selectedLibraryMember?.features ?? record.features
}

export function buildFeatureVisibilityTargetIds(input: {
  activeTab: WorkspaceTab
  selectedFeature: SequenceFeature | null
  selectedFeatureIds: readonly string[]
  selectionFocus: SelectionFocus
  sourceFeatures: readonly SequenceFeature[]
}): string[] {
  const validIds = (ids: readonly string[]) =>
    ids.filter((id) => input.sourceFeatures.some((feature) => feature.id === id))
  if (input.selectionFocus === 'feature' || input.activeTab === 'Features') {
    const fromMulti = validIds(input.selectedFeatureIds)
    if (fromMulti.length > 0) return fromMulti
    return input.selectedFeature ? [input.selectedFeature.id] : []
  }
  return []
}

export function buildSelectedFeaturesForMenu(
  sourceFeatures: readonly SequenceFeature[],
  featureVisibilityTargetIds: readonly string[],
  selectedFeature: SequenceFeature | null,
): SequenceFeature[] {
  const ids = featureVisibilityTargetIds
  if (!ids.length && selectedFeature) return [selectedFeature]
  return ids
    .map((id) => sourceFeatures.find((feature) => feature.id === id))
    .filter((feature): feature is SequenceFeature => Boolean(feature))
}

export type FeatureSelectionMenuGates = {
  hasFeatureSelected: boolean
  canMergeSelectedFeatures: boolean
  canShowSelectedFeatures: boolean
  canHideSelectedFeatures: boolean
}

export function buildFeatureSelectionMenuGates(
  record: SequenceRecord,
  featureTabSelectionMemberId: string | null,
  selectedFeaturesForMenu: readonly SequenceFeature[],
): FeatureSelectionMenuGates {
  return {
    hasFeatureSelected: selectedFeaturesForMenu.length > 0,
    canMergeSelectedFeatures:
      record.molecule === 'dna' && featureTabSelectionMemberId === null && selectedFeaturesForMenu.length >= 2,
    canShowSelectedFeatures: selectedFeaturesForMenu.some((feature) => feature.visible === false),
    canHideSelectedFeatures: selectedFeaturesForMenu.some((feature) => feature.visible !== false),
  }
}

export function buildFeatureTabProjection(
  record: SequenceRecord,
  traceFiles: readonly TraceFileRecord[],
  sortMode: FeatureTabSortMode,
  sortDirection: FeatureTabSortDirection,
): { entries: FeatureTabEntry[]; featureRows: FeatureTabFeatureRow[] } {
  const entries = buildFeatureTabEntries(record, traceFiles, sortMode, sortDirection)
  const featureRows = entries.filter((entry): entry is FeatureTabFeatureRow => entry.kind === 'feature')
  return { entries, featureRows }
}
