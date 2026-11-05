import { useCallback } from 'react'
import { contiguousSelectionRangeForFeature } from '../../domain/sequence'
import { featureDisplayName } from '../map/mapPrimitives'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { getLibraryReferenceMemberId } from '../../domain/libraryMemberFeatures'
import type { SgRNAAnnotation } from '../../domain/sgrna'
import { withSgRnaVisibility } from '../../domain/primerPaneEntries'
import { paneRangeIds } from '../../application/paneInteractions/paneInteractions'
import type { SequenceFeature, SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { PrimerPaneSgRnaRow } from '../../domain/primerPaneEntries'

type PaneEvent = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
type Anchor = { featureId: string; memberId: string | null }
type SelectionAnchor = { kind: 'feature'; forward: { start: number; end: number }; reverse: { start: number; end: number } } | { kind: 'base'; forward: { start: number; end: number }; reverse: { start: number; end: number } } | { kind: 'primer'; forward: { start: number; end: number }; reverse: { start: number; end: number } }
type FeatureRow = { memberId: string | null; feature: SequenceFeature }

export type FeaturePaneInteractionOptions = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  featureRows: FeatureRow[]
  sgRnaRows: PrimerPaneSgRnaRow[]
  featureTabSelectionMemberId: string | null
  featureTabAnchor: Anchor | null
  selectedFeatureId: string | null
  selectedFeatureIds: string[]
  selectedAlignmentTraceId: string | null
  selectionFocus: 'dna' | 'feature' | 'primer' | 'bond'
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord) => void
  onTraceFilesChange: (updater: (current: TraceFileRecord[]) => TraceFileRecord[]) => void
  setStatus: (status: string) => void
  setFeatureTabSelectionMemberId: (id: string | null) => void
  setFeatureTabAnchor: (value: Anchor | null) => void
  setSelectedAlignmentTraceId: (id: string | null) => void
  setSelectedFeatureId: (id: string | null) => void
  setSelectedFeatureIds: (ids: string[]) => void
  setSelectedPrimerId: (id: string | null) => void
  setSelectedPrimerIds: (ids: string[]) => void
  setCutSelectionAnchor: (value: null) => void
  setCutStrandSelection: (value: null) => void
  setCutSelectionEnzymes: (value: null) => void
  setSelectionFocus: (focus: 'dna' | 'feature' | 'primer' | 'bond') => void
  setSelectedRange: (range: { start: number; end: number } | null) => void
  setSelectionAnchor: (anchor: SelectionAnchor | null) => void
  getVisibilityTargetIds: () => string[]
}

export function useFeaturePaneInteractionController(options: FeaturePaneInteractionOptions) {
  const focusFeatureTabSelection = useCallback((featureId: string, selectedIds: string[], memberId: string | null = null) => {
    options.setFeatureTabSelectionMemberId(memberId)
    options.setSelectedAlignmentTraceId(memberId)
    options.setSelectedFeatureIds(selectedIds)
    options.setSelectedFeatureId(featureId)
    options.setSelectionFocus('feature')
    options.setSelectedPrimerId(null)
    options.setSelectedPrimerIds([])
    options.setCutSelectionAnchor(null)
    options.setCutStrandSelection(null)
    options.setCutSelectionEnzymes(null)
    const focusFeature = memberId
      ? options.traceFiles.find((trace) => trace.id === memberId)?.features?.find((feature) => feature.id === featureId)
      : options.record.features.find((feature) => feature.id === featureId)
    if (selectedIds.length >= 2) {
      options.setSelectedRange(null)
      if (focusFeature) {
        const range = contiguousSelectionRangeForFeature(focusFeature)
        if (range) options.setSelectionAnchor({ kind: 'feature', forward: { ...range }, reverse: { ...range } })
      }
      return
    }
    if (!focusFeature) return
    const range = contiguousSelectionRangeForFeature(focusFeature)
    if (range) {
      options.setSelectedRange({ start: range.start, end: range.end })
      options.setSelectionAnchor({ kind: 'feature', forward: { ...range }, reverse: { ...range } })
    } else {
      options.setSelectedRange(null)
      options.setSelectionAnchor({ kind: 'feature', forward: { start: 0, end: 0 }, reverse: { start: 0, end: 0 } })
    }
  }, [options])

  const selectFeatureTabRow = useCallback((entry: FeatureRow, event: PaneEvent) => {
    const groupRows = options.featureRows.filter((row) => row.memberId === entry.memberId)
    const rowIds = groupRows.map((row) => row.feature.id)
    const clickedIndex = rowIds.indexOf(entry.feature.id)
    if (clickedIndex < 0) return
    if (event.shiftKey && options.featureTabAnchor?.memberId === entry.memberId) {
      const anchorIndex = rowIds.indexOf(options.featureTabAnchor.featureId)
      if (anchorIndex >= 0) {
        const rangeIds = paneRangeIds(rowIds, options.featureTabAnchor.featureId, entry.feature.id)
        if (rangeIds) {
          focusFeatureTabSelection(entry.feature.id, rangeIds, entry.memberId)
          options.setStatus(`Selected ${rangeIds.length} features.`)
          return
        }
      }
    }
    if (event.metaKey || event.ctrlKey) {
      const sameSection = options.featureTabSelectionMemberId === entry.memberId
      const alreadySelected = sameSection && options.selectedFeatureIds.includes(entry.feature.id)
      const nextIds = alreadySelected
        ? options.selectedFeatureIds.filter((id) => id !== entry.feature.id)
        : sameSection ? [...options.selectedFeatureIds, entry.feature.id] : [entry.feature.id]
      if (!nextIds.length) {
        options.setFeatureTabAnchor({ featureId: entry.feature.id, memberId: entry.memberId })
        options.setFeatureTabSelectionMemberId(entry.memberId)
        options.setSelectedFeatureIds([]); options.setSelectedFeatureId(null)
        options.setSelectedAlignmentTraceId(entry.memberId); options.setSelectionFocus('dna')
        options.setStatus('Cleared feature selection.')
        return
      }
      if (!options.featureTabAnchor || options.featureTabAnchor.memberId !== entry.memberId) options.setFeatureTabAnchor({ featureId: entry.feature.id, memberId: entry.memberId })
      const focusId = alreadySelected
        ? (nextIds.includes(options.selectedFeatureId ?? '') ? options.selectedFeatureId! : nextIds[nextIds.length - 1]!)
        : entry.feature.id
      focusFeatureTabSelection(focusId, nextIds, entry.memberId)
      options.setStatus(`Selected ${nextIds.length} features.`)
      return
    }
    options.setFeatureTabAnchor({ featureId: entry.feature.id, memberId: entry.memberId })
    focusFeatureTabSelection(entry.feature.id, [entry.feature.id], entry.memberId)
  }, [focusFeatureTabSelection, options])

  const selectSgRnaPaneRow = useCallback((entry: PrimerPaneSgRnaRow, event: PaneEvent) => {
    const rowIds = options.sgRnaRows.filter((row) => row.memberId === entry.memberId).map((row) => row.annotation.guide.id)
    const guideId = entry.annotation.guide.id
    const clickedIndex = rowIds.indexOf(guideId)
    if (clickedIndex < 0) return
    if (event.shiftKey && options.featureTabAnchor?.memberId === entry.memberId) {
      const anchorIndex = rowIds.indexOf(options.featureTabAnchor.featureId)
      if (anchorIndex >= 0) {
        const rangeIds = paneRangeIds(rowIds, options.featureTabAnchor.featureId, guideId)
        if (rangeIds) {
          focusFeatureTabSelection(guideId, rangeIds, entry.memberId)
          options.setStatus(`Selected ${rangeIds.length} sgRNAs.`)
          return
        }
      }
    }
    if (event.metaKey || event.ctrlKey) {
      const sameSection = options.selectionFocus === 'feature' && options.featureTabSelectionMemberId === entry.memberId
      const currentIds = sameSection
        ? (options.selectedFeatureIds.length ? options.selectedFeatureIds : options.selectedFeatureId ? [options.selectedFeatureId] : []).filter((id) => rowIds.includes(id))
        : []
      const alreadySelected = currentIds.includes(guideId)
      const nextIds = alreadySelected ? currentIds.filter((id) => id !== guideId) : [...currentIds, guideId]
      if (!nextIds.length) {
        options.setFeatureTabAnchor({ featureId: guideId, memberId: entry.memberId }); options.setSelectedFeatureIds([]); options.setSelectedFeatureId(null); options.setSelectionFocus('dna'); options.setStatus('Cleared sgRNA selection.')
        return
      }
      if (!options.featureTabAnchor || options.featureTabAnchor.memberId !== entry.memberId) options.setFeatureTabAnchor({ featureId: guideId, memberId: entry.memberId })
      const focusId = alreadySelected ? (nextIds.includes(options.selectedFeatureId ?? '') ? options.selectedFeatureId! : nextIds[nextIds.length - 1]!) : guideId
      focusFeatureTabSelection(focusId, nextIds, entry.memberId)
      options.setStatus(`Selected ${nextIds.length} sgRNA${nextIds.length === 1 ? '' : 's'}.`)
      return
    }
    options.setFeatureTabAnchor({ featureId: guideId, memberId: entry.memberId })
    focusFeatureTabSelection(guideId, [guideId], entry.memberId)
  }, [focusFeatureTabSelection, options])

  const setFeatureVisibility = useCallback((featureId: string, visible: boolean, memberId: string | null = null) => {
    if (memberId) {
      options.onTraceFilesChange((current) => current.map((trace) => trace.id !== memberId || !trace.features?.some((feature) => feature.id === featureId) ? trace : { ...trace, features: trace.features.map((feature) => feature.id === featureId ? { ...feature, visible: visible ? undefined : false } : feature) }))
      return
    }
    options.updateRecord((current) => ({ ...current, features: current.features.map((feature) => feature.id === featureId ? { ...feature, visible: visible ? undefined : false } : feature) }))
  }, [options])

  const setSgRnasVisibility = useCallback((annotations: readonly SgRNAAnnotation[], visible: boolean, memberId: string | null) => {
    if (!annotations.length) return
    const guideIds = new Set(annotations.map((annotation) => annotation.guide.id))
    const updateFeatures = (features: SequenceFeature[]) => withSgRnaVisibility(features, visible, guideIds)
    if (memberId) {
      options.onTraceFilesChange((current) => current.map((member) => member.id === memberId ? { ...member, features: updateFeatures(member.features ?? []) } : member))
      if (getLibraryReferenceMemberId(options.record) === memberId) options.updateRecord((current) => ({ ...current, features: updateFeatures(current.features) }))
    } else options.updateRecord((current) => ({ ...current, features: updateFeatures(current.features) }))
  }, [options])

  const setFeaturesVisibility = useCallback((featureIds: string[], visible: boolean) => {
    if (!featureIds.length) return
    const idSet = new Set(featureIds)
    const scopedMemberId = options.featureTabSelectionMemberId
    const sourceFeatures = scopedMemberId ? (options.traceFiles.find((trace) => trace.id === scopedMemberId)?.features ?? []) : options.record.features
    const named = featureIds.length === 1 ? sourceFeatures.find((feature) => feature.id === featureIds[0]) : undefined
    if (scopedMemberId) options.onTraceFilesChange((current) => current.map((trace) => trace.id !== scopedMemberId || !trace.features ? trace : { ...trace, features: trace.features.map((feature) => idSet.has(feature.id) ? { ...feature, visible: visible ? undefined : false } : feature) }))
    else options.updateRecord((current) => ({ ...current, features: current.features.map((feature) => idSet.has(feature.id) ? { ...feature, visible: visible ? undefined : false } : feature) }))
    const label = named ? featureDisplayName(named) : `${featureIds.length} features`
    options.setStatus(visible ? `Showed ${label} on map and sequence.` : `Hid ${label} on map and sequence.`)
  }, [options])

  const setAllFeaturesVisibility = useCallback((visible: boolean) => {
    options.updateRecord((current) => ({ ...current, features: current.features.map((feature) => ({ ...feature, visible: visible ? undefined : false })), ...(current.molecule === 'protein' && current.protein ? { protein: { ...current.protein, bonds: current.protein.bonds.map((bond) => ({ ...bond, visible: visible ? undefined : false })) } } : {}) }))
    if (isDnaLibraryRecord(options.record)) options.onTraceFilesChange((current) => current.map((trace) => !trace.features?.length ? trace : { ...trace, features: trace.features.map((feature) => ({ ...feature, visible: visible ? undefined : false })) }))
    options.setStatus(visible ? 'Showed all annotations on map and sequence.' : 'Hid all annotations on map and sequence.')
  }, [options])

  const showSelectedFeatures = useCallback(() => {
    setFeaturesVisibility(options.getVisibilityTargetIds(), true)
  }, [options, setFeaturesVisibility])

  const hideSelectedFeatures = useCallback(() => {
    setFeaturesVisibility(options.getVisibilityTargetIds(), false)
  }, [options, setFeaturesVisibility])

  return {
    focusFeatureTabSelection,
    selectFeatureTabRow,
    selectSgRnaPaneRow,
    setFeatureVisibility,
    setSgRnasVisibility,
    setFeaturesVisibility,
    setAllFeaturesVisibility,
    showSelectedFeatures,
    hideSelectedFeatures,
  }
}
