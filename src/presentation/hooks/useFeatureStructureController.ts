import { useState, type Dispatch, type SetStateAction } from 'react'
import {
  addCleavageSite as addCleavageSiteTransition,
  createFeatureSegment as createFeatureSegmentTransition,
  deleteFeatureSegment as deleteFeatureSegmentTransition,
  featureIntersectsRange,
  mergeFeatureSegments as mergeFeatureSegmentsTransition,
  removeCleavageSite as removeCleavageSiteTransition,
  splicedSequenceForFeature,
} from '../../application/featureEditing/featureEditing'
import { defaultConstructProperties } from '../../domain/constructProperties'
import { defaultDnaEnds } from '../../domain/dnaEnds'
import { featureEditorFromFeature, type FeatureEditorState } from '../../domain/featureQualifiers'
import { createId, formatRange, nowIso } from '../../domain/sequence'
import type { SequenceFeature, SequenceRecord } from '../../domain/types'
import { featureContainsPosition, featureDisplayName } from '../map/mapPrimitives'
import type { SelectionAnchor, SelectionRange } from '../sequence'

type SegmentTargetDialog = {
  range: SelectionRange
  mode: 'split' | 'assign'
  features: SequenceFeature[]
}

type CleavageChooser = {
  position: number
  mode: 'add' | 'remove'
  features: SequenceFeature[]
}

export type FeatureStructureControllerOptions = {
  record: SequenceRecord
  selectedRange: SelectionRange | null
  hasCutStrandSelection: boolean
  selectedFeature: SequenceFeature | null
  selectedFeatureId: string | null
  selectedFeaturesForMenu: SequenceFeature[]
  featureTabSelectionMemberId: string | null
  setFeatureEditor: Dispatch<SetStateAction<FeatureEditorState | null>>
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord) => void
  setStatus: (status: string) => void
  setCutSelectionAnchor: (value: null) => void
  setCutStrandSelection: (value: null) => void
  setCutSelectionEnzymes: (value: null) => void
  setSelectedPrimerId: (id: string | null) => void
  setSelectionFocus: (focus: 'feature') => void
  setSelectedFeatureId: (featureId: string) => void
  setSelectedRange: (range: SelectionRange) => void
  setSelectionAnchor: (anchor: SelectionAnchor) => void
  selectFeatureById: (featureId: string) => void
  openSplicedRecord: (record: SequenceRecord) => void
}

/** Owns feature-segment focus, cleavage-site, merge, and splice orchestration. */
export function useFeatureStructureController(options: FeatureStructureControllerOptions) {
  const [segmentTargetDialog, setSegmentTargetDialog] = useState<SegmentTargetDialog | null>(null)
  const [featureMergeTemplateDialog, setFeatureMergeTemplateDialog] = useState<SequenceFeature[] | null>(null)
  const [pendingFeatureMergeIds, setPendingFeatureMergeIds] = useState<string[] | null>(null)
  const [cleavageChooser, setCleavageChooser] = useState<CleavageChooser | null>(null)

  const cleavageCaretPosition = options.selectedRange
    && !options.hasCutStrandSelection
    && options.selectedRange.start === options.selectedRange.end
    ? options.selectedRange.start
    : null

  const featuresCoveringPosition = (position: number) => options.record.features
    .filter((feature) => featureContainsPosition(feature, position, options.record.sequence.length))
  const featuresWithCleavageAt = (position: number) => options.record.features
    .filter((feature) => feature.cleavageArrows?.includes(position))

  const canAddCleavageSite = cleavageCaretPosition !== null
    && featuresCoveringPosition(cleavageCaretPosition).length > 0
  const canRemoveCleavageSite = (
    cleavageCaretPosition !== null && featuresWithCleavageAt(cleavageCaretPosition).length > 0
  ) || Boolean(options.selectedFeature?.cleavageArrows?.length)

  function focusFeatureSegment(featureId: string, range: SelectionRange) {
    options.setCutSelectionAnchor(null)
    options.setCutStrandSelection(null)
    options.setCutSelectionEnzymes(null)
    options.setSelectedPrimerId(null)
    options.setSelectionFocus('feature')
    options.setSelectedFeatureId(featureId)
    options.setSelectedRange({ ...range })
    options.setSelectionAnchor({ kind: 'feature', forward: { ...range }, reverse: { ...range } })
  }

  function createSegmentOnFeature(featureId: string, range: SelectionRange) {
    const result = createFeatureSegmentTransition(
      options.record.features,
      featureId,
      range,
      options.record.sequence.length,
    )
    if (result.kind === 'missing') return
    if (result.kind === 'whole-feature') {
      options.setStatus('Selection already matches the whole feature. Select a sub-range inside it to create a segment.')
      return
    }
    options.updateRecord((current) => {
      const currentResult = createFeatureSegmentTransition(current.features, featureId, range, current.sequence.length)
      return currentResult.kind === 'updated' ? { ...current, features: currentResult.features } : current
    })
    focusFeatureSegment(featureId, range)
    options.setStatus(result.overlaps
      ? `Split ${featureDisplayName(result.feature)} at ${formatRange(range.start, range.end)}.`
      : `Added segment ${formatRange(range.start, range.end)} to ${featureDisplayName(result.feature)}.`)
  }

  function createFeatureSegment() {
    const range = options.selectedRange
    if (!range || options.hasCutStrandSelection || range.start === range.end) {
      options.setStatus('Select a sequence range to create a feature segment.')
      return
    }
    const overlapping = options.record.features.filter((feature) =>
      featureIntersectsRange(feature, range, options.record.sequence.length))
    if (!overlapping.length) {
      if (!options.record.features.length) {
        options.setStatus('There are no features to add a segment to.')
        return
      }
      setSegmentTargetDialog({ range: { ...range }, mode: 'assign', features: [...options.record.features] })
      return
    }
    if (overlapping.length > 1) {
      setSegmentTargetDialog({ range: { ...range }, mode: 'split', features: overlapping })
      return
    }
    createSegmentOnFeature(overlapping[0]!.id, range)
  }

  function addCleavageToFeature(featureId: string, position: number) {
    const target = options.record.features.find((feature) => feature.id === featureId)
    if (!target) return
    if (target.cleavageArrows?.includes(position)) {
      options.setStatus(`${featureDisplayName(target)} already has a cleavage site at ${position + 1}.`)
      return
    }
    options.updateRecord((current) => {
      const features = addCleavageSiteTransition(current.features, featureId, position)
      return features ? { ...current, features } : current
    })
    options.setSelectedFeatureId(featureId)
    options.setSelectionFocus('feature')
    options.setStatus(`Added cleavage site at ${position + 1} on ${featureDisplayName(target)}.`)
  }

  function removeCleavageFromFeature(featureId: string, position: number | 'all') {
    const target = options.record.features.find((feature) => feature.id === featureId)
    if (!target?.cleavageArrows?.length) return
    options.updateRecord((current) => {
      const features = removeCleavageSiteTransition(current.features, featureId, position)
      return features ? { ...current, features } : current
    })
    options.setSelectedFeatureId(featureId)
    options.setSelectionFocus('feature')
    options.setStatus(position === 'all'
      ? `Removed all cleavage sites from ${featureDisplayName(target)}.`
      : `Removed cleavage site at ${position + 1} from ${featureDisplayName(target)}.`)
  }

  function addCleavageSite() {
    if (cleavageCaretPosition === null) {
      options.setStatus('To add a cleavage site, first place the caret at the desired position.')
      return
    }
    const covering = featuresCoveringPosition(cleavageCaretPosition)
    if (!covering.length) {
      options.setStatus('Place the caret inside a feature to add a cleavage site.')
      return
    }
    if (covering.length > 1) {
      setCleavageChooser({ position: cleavageCaretPosition, mode: 'add', features: covering })
      return
    }
    addCleavageToFeature(covering[0]!.id, cleavageCaretPosition)
  }

  function removeCleavageSite() {
    if (cleavageCaretPosition !== null) {
      const matches = featuresWithCleavageAt(cleavageCaretPosition)
      if (matches.length > 1) {
        setCleavageChooser({ position: cleavageCaretPosition, mode: 'remove', features: matches })
        return
      }
      if (matches.length === 1) {
        removeCleavageFromFeature(matches[0]!.id, cleavageCaretPosition)
        return
      }
    }
    if (options.selectedFeature?.cleavageArrows?.length) {
      removeCleavageFromFeature(options.selectedFeature.id, 'all')
      return
    }
    options.setStatus('Place the caret on a cleavage site, or select a feature that has cleavage sites.')
  }

  function deleteFeatureSegment() {
    const range = options.selectedRange && !options.hasCutStrandSelection ? options.selectedRange : null
    if (!range) {
      options.setStatus('Place the selection inside a feature segment to delete it.')
      return
    }
    const result = deleteFeatureSegmentTransition(
      options.record.features,
      range,
      options.record.sequence.length,
      options.selectedFeatureId,
    )
    if (result.kind === 'not-found') {
      options.setStatus('No feature segment found at the current selection.')
      return
    }
    if (result.kind === 'single-segment') {
      options.setStatus(`${featureDisplayName(result.feature)} has a single segment — use Remove Features to delete it.`)
      return
    }
    options.updateRecord((current) => {
      const currentResult = deleteFeatureSegmentTransition(
        current.features,
        range,
        current.sequence.length,
        result.feature.id,
      )
      return currentResult.kind === 'updated' ? { ...current, features: currentResult.features } : current
    })
    options.selectFeatureById(result.feature.id)
    options.setStatus(`Deleted a segment from ${featureDisplayName(result.feature)}.`)
  }

  function mergeFeatureSegments() {
    const range = options.selectedRange
    if (!range || options.hasCutStrandSelection || range.start === range.end) {
      options.setStatus('Select a range covering the segments you want to merge.')
      return
    }
    const result = mergeFeatureSegmentsTransition(
      options.record.features,
      range,
      options.record.sequence.length,
      options.selectedFeature?.id ?? null,
    )
    if (result.kind === 'not-found') {
      options.setStatus('Select a range that spans at least two segments of a feature.')
      return
    }
    options.updateRecord((current) => {
      const currentResult = mergeFeatureSegmentsTransition(
        current.features,
        range,
        current.sequence.length,
        result.feature.id,
      )
      return currentResult.kind === 'updated' ? { ...current, features: currentResult.features } : current
    })
    options.selectFeatureById(result.feature.id)
    options.setStatus(`Merged ${result.mergedCount} segments of ${featureDisplayName(result.feature)}.`)
  }

  function openFeatureMergeTemplateDialog() {
    if (options.selectedFeaturesForMenu.length < 2) {
      options.setStatus('Select two or more features to merge.')
      return
    }
    if (options.featureTabSelectionMemberId !== null) {
      options.setStatus('Merge features on the consensus sequence, not a library member.')
      return
    }
    setFeatureMergeTemplateDialog(options.selectedFeaturesForMenu)
  }

  function openFeatureMergeEditor(templateId: string) {
    const features = featureMergeTemplateDialog
    if (!features) return
    const template = features.find((feature) => feature.id === templateId)
    if (!template) return
    const draft = featureEditorFromFeature(template, options.record.sequence, options.record.topology)
    const segments = features.flatMap((feature) => feature.locations.map((location, index) => ({
      start: location.start,
      end: location.end,
      strand: location.strand,
      color: template.color,
      name: `${template.name} (${index + 1})`,
    }))).sort((left, right) => left.start - right.start || left.end - right.end)
    setPendingFeatureMergeIds(features.map((feature) => feature.id))
    options.setFeatureEditor({ ...draft, segments, libraryMemberId: null })
    setFeatureMergeTemplateDialog(null)
  }

  function spliceToRemoveIntrons() {
    const feature = options.selectedFeature
    if (!feature) {
      options.setStatus('Select a gene feature to splice.')
      return
    }
    const sequence = splicedSequenceForFeature(feature, options.record.sequence)
    if (!sequence.length) {
      options.setStatus('Could not build a spliced sequence for this feature.')
      return
    }
    const timestamp = nowIso()
    const displayName = featureDisplayName(feature)
    const next: SequenceRecord = {
      id: createId('seq'),
      name: `${displayName} spliced`,
      description: `Spliced (introns removed) from ${options.record.name} / ${displayName}.`,
      molecule: 'dna',
      topology: 'linear',
      sequence,
      features: [{
        id: createId('feature'),
        name: feature.name,
        type: feature.type,
        color: feature.color,
        notes: feature.notes,
        locations: [{ start: 0, end: sequence.length, strand: 'forward' }],
      }],
      primers: [],
      operations: [{
        id: createId('op'),
        type: 'spliceIntrons',
        summary: `Spliced ${displayName} (${feature.locations.length} segments → ${sequence.length} bp)`,
        createdAt: timestamp,
      }],
      dnaEnds: defaultDnaEnds(),
      construct: { ...defaultConstructProperties, syntheticDna: true },
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    options.openSplicedRecord(next)
    options.setStatus(`Opened spliced sequence: ${next.name} (${sequence.length} bp).`)
  }

  return {
    segmentTargetDialog,
    setSegmentTargetDialog,
    featureMergeTemplateDialog,
    setFeatureMergeTemplateDialog,
    pendingFeatureMergeIds,
    setPendingFeatureMergeIds,
    cleavageChooser,
    setCleavageChooser,
    canAddCleavageSite,
    canRemoveCleavageSite,
    createSegmentOnFeature,
    createFeatureSegment,
    addCleavageToFeature,
    removeCleavageFromFeature,
    addCleavageSite,
    removeCleavageSite,
    deleteFeatureSegment,
    mergeFeatureSegments,
    openFeatureMergeTemplateDialog,
    openFeatureMergeEditor,
    spliceToRemoveIntrons,
  }
}
