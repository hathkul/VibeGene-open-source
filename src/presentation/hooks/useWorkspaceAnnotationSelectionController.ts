import { useCallback } from 'react'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { contiguousSelectionRangeForFeature, featureBounds, featureLength } from '../../domain/sequence'
import { featureSelectionSpan } from '../../domain/featureSelectionSpan'
import { featureDisplayName } from '../map/mapPrimitives'
import { mapZoomCaretPosition } from '../map'
import type { Primer, SequenceFeature, SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SelectionAnchor, SelectionFocus, SelectionRange } from '../sequence'

type SelectionOptions = { scroll?: boolean; libraryMemberId?: string | null; scrollPosition?: number }

export type WorkspaceAnnotationSelectionOptions = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  selectableAnnotations: SequenceFeature[]
  alignmentsVisible: boolean
  selectedAlignmentTraceId: string | null
  selectionFocus: SelectionFocus
  selectionAnchor: SelectionAnchor | null
  selectedFeatureId: string | null
  selectedFeatureIds: string[]
  selectedPrimerIds: string[]
  selectedRange: SelectionRange | null
  featureTabSelectionMemberId: string | null
  primerBindings: Array<{ primer: Primer; start: number; end: number; strand: 'forward' | 'reverse' }>
  setSelectedAlignmentTraceId: (id: string | null) => void
  setSelectedProteinBondId: (id: string | null) => void
  setCutSelectionAnchor: (value: null) => void
  setCutStrandSelection: (value: null) => void
  setCutSelectionEnzymes: (value: null) => void
  setSelectedPrimerId: (id: string | null) => void
  setSelectedPrimerIds: (ids: string[]) => void
  setSelectedFeatureId: (id: string | null) => void
  setSelectedFeatureIds: (ids: string[]) => void
  setFeatureTabSelectionMemberId: (id: string | null) => void
  setFeatureTabAnchor: (value: { featureId: string; memberId: string | null } | null) => void
  setSelectionFocus: (focus: SelectionFocus) => void
  setSelectedRange: (range: SelectionRange | null) => void
  setSelectionAnchor: (anchor: SelectionAnchor | null) => void
  setSequenceScrollTarget: (position: number | null) => void
  scrollAlignmentToTemplate: (position: number) => void
  setStatus: (status: string) => void
  extendSelectionToEndpoint: (range: { forward: SelectionRange; reverse: SelectionRange }, options: { describe: string; directional: boolean }) => void
  focusPrimerTabSelection: (primerId: string, selectedIds: string[], memberId: string | null) => void
  resolveMobilePrimerPairExtend: (extend: boolean, anchor: SelectionAnchor | null, focus: SelectionFocus) => boolean
  matchesMobileShellViewport: () => boolean
  mobilePrimerAnchorStatus: (name: string, range?: string) => string
  facingPrimerAmpliconRange: (selectedIds: string[]) => SelectionRange | null
  selectionLength: (range: SelectionRange, length: number) => number
  formatRange: (start: number, end: number) => string
}

/** Owns map/sequence selection navigation for feature and primer annotations. */
export function useWorkspaceAnnotationSelectionController(options: WorkspaceAnnotationSelectionOptions) {
  const selectFeatureById = useCallback((
    featureId: string,
    extendSelection = false,
    allowToggle = false,
    selectionOptions?: SelectionOptions,
  ) => {
    const scopedMemberId = selectionOptions && 'libraryMemberId' in selectionOptions
      ? (selectionOptions.libraryMemberId ?? null)
      : undefined
    const memberFeature = scopedMemberId
      ? options.traceFiles.find((trace) => trace.id === scopedMemberId)?.features?.find((entry) => entry.id === featureId)
      : undefined
    const feature = memberFeature
      ?? (scopedMemberId === null ? options.record.features.find((candidate) => candidate.id === featureId) : undefined)
      ?? options.selectableAnnotations.find((candidate) => candidate.id === featureId)
    if (!feature) return
    if (!options.alignmentsVisible && isDnaLibraryRecord(options.record)) {
      if (scopedMemberId !== undefined) {
        if (options.selectedAlignmentTraceId !== scopedMemberId) options.setSelectedAlignmentTraceId(scopedMemberId)
      } else {
        const onConsensus = options.record.features.some((entry) => entry.id === featureId)
        if (!onConsensus) {
          const owner = options.traceFiles.find((trace) => trace.features?.some((entry) => entry.id === featureId))
          if (owner) {
            if (options.selectedAlignmentTraceId !== owner.id) options.setSelectedAlignmentTraceId(owner.id)
          } else if (options.selectedAlignmentTraceId !== null) options.setSelectedAlignmentTraceId(null)
        }
      }
    }
    options.setSelectedProteinBondId(null)
    const bounds = featureBounds(feature)
    const selectionRange = contiguousSelectionRangeForFeature(feature)
    const isRecordFeature = options.record.features.some((entry) => entry.id === feature.id) && !memberFeature
    const shouldScroll = selectionOptions?.scroll !== false
    if (extendSelection && options.selectionAnchor) {
      const sameFeatureScope = options.selectionAnchor.kind === 'feature'
        && options.selectionFocus === 'feature'
        && (isRecordFeature || Boolean(memberFeature))
      if (sameFeatureScope) {
        const scopeMemberId = memberFeature ? (scopedMemberId ?? null) : null
        const sourceFeatures = memberFeature && scopeMemberId
          ? (options.traceFiles.find((trace) => trace.id === scopeMemberId)?.features ?? [])
          : options.record.features
        const sameSection = !isDnaLibraryRecord(options.record)
          || options.featureTabSelectionMemberId === scopeMemberId
          || (options.selectedFeatureIds.length <= 1 && (memberFeature
            ? options.selectedAlignmentTraceId === scopeMemberId
            : options.selectedAlignmentTraceId === null || options.featureTabSelectionMemberId === null))
        options.setCutSelectionAnchor(null)
        options.setCutStrandSelection(null)
        options.setCutSelectionEnzymes(null)
        options.setSelectedPrimerId(null)
        options.setSelectedPrimerIds([])
        options.setSelectionFocus('feature')
        options.setFeatureTabSelectionMemberId(scopeMemberId)
        options.setFeatureTabAnchor({ featureId: feature.id, memberId: scopeMemberId })
        if (scopeMemberId !== null && options.selectedAlignmentTraceId !== scopeMemberId) options.setSelectedAlignmentTraceId(scopeMemberId)
        if (scopeMemberId === null && options.selectedAlignmentTraceId !== null && isDnaLibraryRecord(options.record)) options.setSelectedAlignmentTraceId(null)
        const base = sameSection ? options.selectedFeatureIds.filter((id) => sourceFeatures.some((entry) => entry.id === id)) : []
        const nextIds = base.includes(feature.id)
          ? base.length > 1 ? base.filter((id) => id !== feature.id) : base
          : [...base, feature.id]
        options.setSelectedFeatureIds(nextIds.length ? nextIds : [feature.id])
        const resolvedIds = nextIds.length ? nextIds : [feature.id]
        const focusedId = resolvedIds.includes(feature.id) ? feature.id : resolvedIds[resolvedIds.length - 1]!
        options.setSelectedFeatureId(focusedId)
        if (resolvedIds.length === 2) {
          const selectedFeatures = sourceFeatures.filter((entry) => resolvedIds.includes(entry.id))
          const memberLength = scopeMemberId ? options.traceFiles.find((trace) => trace.id === scopeMemberId)?.sequence.length : undefined
          options.setSelectedRange(featureSelectionSpan(selectedFeatures, memberLength ?? options.record.sequence.length, scopeMemberId ? 'linear' : options.record.topology))
        } else if (resolvedIds.length > 2) {
          options.setSelectedRange(null)
        } else {
          const focus = sourceFeatures.find((entry) => entry.id === resolvedIds[0]) ?? feature
          const focusRange = contiguousSelectionRangeForFeature(focus)
          options.setSelectedRange(focusRange ? { start: focusRange.start, end: focusRange.end } : null)
        }
        options.setSelectionAnchor({ kind: 'feature', forward: { start: bounds.start, end: bounds.end }, reverse: { start: bounds.start, end: bounds.end } })
        options.setStatus(resolvedIds.length === 1 ? `Selected feature ${featureDisplayName(feature)}.` : `Selected ${resolvedIds.length} features.`)
        return
      }
      options.extendSelectionToEndpoint(
        { forward: { start: bounds.start, end: bounds.end }, reverse: { start: bounds.start, end: bounds.end } },
        { describe: `Extended selection to ${featureDisplayName(feature)}`, directional: true },
      )
      return
    }
    const soleSelected = options.selectedFeatureId === feature.id
      && options.selectionFocus === 'feature'
      && (options.selectedFeatureIds.length === 0 || (options.selectedFeatureIds.length === 1 && options.selectedFeatureIds[0] === feature.id))
      && (selectionRange === null
        ? options.selectedRange === null
        : options.selectedRange !== null && options.selectedRange.start === selectionRange.start && options.selectedRange.end === selectionRange.end)
    if (allowToggle && soleSelected) {
      options.setCutSelectionAnchor(null); options.setCutStrandSelection(null); options.setCutSelectionEnzymes(null)
      options.setSelectedPrimerId(null); options.setSelectedPrimerIds([]); options.setSelectedFeatureId(null); options.setSelectedFeatureIds([])
      options.setFeatureTabAnchor(null); options.setFeatureTabSelectionMemberId(null); options.setSelectionFocus('dna'); options.setSelectedRange(null); options.setSelectionAnchor(null)
      options.setStatus('Cleared feature selection.')
      return
    }
    options.setCutSelectionAnchor(null); options.setCutStrandSelection(null); options.setCutSelectionEnzymes(null)
    options.setSelectedPrimerId(null); options.setSelectedPrimerIds([]); options.setSelectionFocus('feature'); options.setSelectedFeatureId(feature.id)
    if (isRecordFeature || memberFeature) {
      const scopeMemberId = memberFeature ? (scopedMemberId ?? null) : null
      options.setSelectedFeatureIds([feature.id]); options.setFeatureTabSelectionMemberId(scopeMemberId); options.setFeatureTabAnchor({ featureId: feature.id, memberId: scopeMemberId })
    } else {
      options.setSelectedFeatureIds([]); options.setFeatureTabAnchor(null); options.setFeatureTabSelectionMemberId(null)
    }
    if (selectionRange) {
      options.setSelectedRange({ start: selectionRange.start, end: selectionRange.end })
      options.setSelectionAnchor({ kind: 'feature', forward: { start: selectionRange.start, end: selectionRange.end }, reverse: { start: selectionRange.start, end: selectionRange.end } })
    } else {
      options.setSelectedRange(null)
      options.setSelectionAnchor({ kind: 'feature', forward: { start: bounds.start, end: bounds.end }, reverse: { start: bounds.start, end: bounds.end } })
    }
    if (shouldScroll) {
      const revealPosition = selectionOptions?.scrollPosition ?? bounds.start
      if (options.alignmentsVisible) options.scrollAlignmentToTemplate(revealPosition)
      else options.setSequenceScrollTarget(revealPosition)
    }
    const lengthForStatus = memberFeature && scopedMemberId
      ? (options.traceFiles.find((trace) => trace.id === scopedMemberId)?.sequence.length ?? options.record.sequence.length)
      : options.record.sequence.length
    options.setStatus(`Selected feature ${featureDisplayName(feature)}: ${options.formatRange(bounds.start, bounds.end)} (${featureLength(feature, lengthForStatus)} bp).`)
  }, [options])

  const selectPrimerById = useCallback((
    primerId: string,
    requestedExtendSelection = false,
    selectionOptions?: SelectionOptions,
  ) => {
    const extendSelection = options.resolveMobilePrimerPairExtend(requestedExtendSelection, options.selectionAnchor, options.selectionFocus)
    const memberId = selectionOptions && 'libraryMemberId' in selectionOptions
      ? (selectionOptions.libraryMemberId ?? null)
      : (!options.alignmentsVisible && isDnaLibraryRecord(options.record) ? options.selectedAlignmentTraceId : null)
    if (memberId) {
      const memberPrimers = options.traceFiles.find((trace) => trace.id === memberId)?.primers ?? []
      if (memberPrimers.some((entry) => entry.id === primerId)) {
        if (extendSelection && options.selectedAlignmentTraceId === memberId && options.selectionFocus === 'primer') {
          const base = options.selectedPrimerIds.filter((id) => memberPrimers.some((entry) => entry.id === id))
          const nextIds = base.includes(primerId) ? base.length > 1 ? base.filter((id) => id !== primerId) : base : [...base, primerId]
          options.focusPrimerTabSelection(nextIds.includes(primerId) ? primerId : (nextIds[nextIds.length - 1] ?? primerId), nextIds, memberId)
          options.setStatus(nextIds.length > 1 ? `Selected ${nextIds.length} primers.` : 'Selected primer.')
          return
        }
        options.focusPrimerTabSelection(primerId, [primerId], memberId)
        const primer = memberPrimers.find((entry) => entry.id === primerId)
        options.setStatus(primer && options.matchesMobileShellViewport() ? options.mobilePrimerAnchorStatus(primer.name) : primer ? `Selected primer ${primer.name}.` : 'Selected primer.')
        return
      }
    }
    const primer = options.record.primers.find((candidate) => candidate.id === primerId)
    if (!primer) return
    if (memberId === null && options.selectedAlignmentTraceId !== null && isDnaLibraryRecord(options.record) && !options.alignmentsVisible) options.setSelectedAlignmentTraceId(null)
    const binding = options.primerBindings.find((entry) => entry.primer.id === primerId)
    const shouldScroll = selectionOptions?.scroll !== false
    if (extendSelection && options.selectionAnchor) {
      if (options.selectionAnchor.kind === 'primer' && options.selectionFocus === 'primer') {
        options.setCutSelectionAnchor(null); options.setCutStrandSelection(null); options.setCutSelectionEnzymes(null); options.setSelectedFeatureId(null); options.setSelectedFeatureIds([]); options.setSelectionFocus('primer'); options.setSelectedPrimerId(primerId)
        const base = options.selectedPrimerIds.filter((id) => options.record.primers.some((entry) => entry.id === id))
        const nextIds = base.includes(primerId) ? base.length > 1 ? base.filter((id) => id !== primerId) : base : [...base, primerId]
        options.setSelectedPrimerIds(nextIds)
        if (nextIds.length >= 2) {
          const amplicon = options.facingPrimerAmpliconRange(nextIds); options.setSelectedRange(amplicon)
          options.setStatus(amplicon ? `Selected ${nextIds.length} primers · PCR amplicon ${options.selectionLength(amplicon, options.record.sequence.length).toLocaleString()} bp.` : `Selected ${nextIds.length} primers.`)
        } else if (binding) {
          options.setSelectedRange({ start: binding.start, end: binding.end })
          if (shouldScroll) options.setSequenceScrollTarget(mapZoomCaretPosition({ start: binding.start, end: binding.end }, options.record.sequence.length))
          options.setStatus(`Selected primer ${primer.name}.`)
        } else { options.setSelectedRange(null); options.setStatus(`Selected primer ${primer.name}.`) }
        if (binding) options.setSelectionAnchor({ kind: 'primer', forward: { start: binding.start, end: binding.end }, reverse: { start: binding.start, end: binding.end } })
        return
      }
      if (binding) options.extendSelectionToEndpoint({ forward: { start: binding.start, end: binding.end }, reverse: { start: binding.start, end: binding.end } }, { describe: `Extended selection to primer ${primer.name}`, directional: true })
      return
    }
    options.setCutSelectionAnchor(null); options.setCutStrandSelection(null); options.setCutSelectionEnzymes(null); options.setSelectedFeatureId(null); options.setSelectedFeatureIds([]); options.setSelectedPrimerId(primerId); options.setSelectedPrimerIds([primerId]); options.setSelectionFocus('primer')
    if (binding) {
      options.setSelectedRange({ start: binding.start, end: binding.end }); options.setSelectionAnchor({ kind: 'primer', forward: { start: binding.start, end: binding.end }, reverse: { start: binding.start, end: binding.end } })
      if (shouldScroll) options.setSequenceScrollTarget(mapZoomCaretPosition({ start: binding.start, end: binding.end }, options.record.sequence.length))
      options.setStatus(options.matchesMobileShellViewport() ? options.mobilePrimerAnchorStatus(primer.name, options.formatRange(binding.start, binding.end)) : `Selected primer ${primer.name}: ${options.formatRange(binding.start, binding.end)}.`)
      return
    }
    options.setSelectedRange(null); options.setSelectionAnchor(null); options.setStatus(`Selected primer ${primer.name}.`)
  }, [options])

  const selectProteinSequenceFeature = useCallback((featureId: string) => {
    selectFeatureById(featureId, false, true, { scroll: false })
  }, [selectFeatureById])

  const selectDnaSequenceFeature = useCallback((
    featureId: string,
    extendSelection = false,
    libraryMemberId?: string | null,
  ) => {
    selectFeatureById(featureId, extendSelection, true, {
      scroll: false,
      ...(libraryMemberId !== undefined ? { libraryMemberId } : {}),
    })
  }, [selectFeatureById])

  const selectDnaSequencePrimer = useCallback((
    primerId: string,
    extendSelection = false,
    libraryMemberId?: string | null,
  ) => {
    selectPrimerById(primerId, extendSelection, { scroll: false, libraryMemberId })
  }, [selectPrimerById])

  return {
    selectFeatureById,
    selectPrimerById,
    selectProteinSequenceFeature,
    selectDnaSequenceFeature,
    selectDnaSequencePrimer,
  }
}
