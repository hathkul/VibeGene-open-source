import { useCallback } from 'react'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { clampSelectionRange, directionalSelectionSpan, type SelectionRange } from '../../application/selectionEditing/selectionEditing'
import type { RestrictionSite, SequenceRecord, Topology } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SelectionAnchor, SelectionFocus, StrandPairSelection, StrandSpanPair } from '../sequence'

type RangeOptions = {
  collapsed?: boolean
  isExtend?: boolean
  sequenceLength?: number
  libraryMemberId?: string | null
}

type SelectionRangeControllerOptions = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  alignmentsVisible: boolean
  selectedAlignmentTraceId: string | null
  selectedRange: SelectionRange | null
  selectionFocus: SelectionFocus
  selectedFeatureId: string | null
  selectedFeatureIds: string[]
  selectedPrimerId: string | null
  selectedPrimerIds: string[]
  selectionAnchor: SelectionAnchor | null
  cutSelectionAnchor: RestrictionSite | null
  setSelectedAlignmentTraceId: (id: string | null) => void
  setCutSelectionAnchor: (value: RestrictionSite | null) => void
  setCutStrandSelection: (value: StrandPairSelection | null) => void
  setCutSelectionEnzymes: (value: { upstream: RestrictionSite; downstream: RestrictionSite } | null) => void
  setSelectedFeatureId: (value: string | null) => void
  setSelectedFeatureIds: (value: string[]) => void
  setSelectedProteinBondId: (value: string | null) => void
  setSelectedPrimerId: (value: string | null) => void
  setSelectedPrimerIds: (value: string[]) => void
  setSelectionFocus: (value: SelectionFocus) => void
  setSequenceHoverSiteKey: (value: string | null) => void
  setSelectedRange: (value: SelectionRange | null) => void
  setSelectionAnchor: (value: SelectionAnchor | null) => void
  setSequenceScrollTarget: (value: number | null) => void
  mapZoomCaretPosition: (range: SelectionRange, sequenceLength: number) => number
  formatRange: (range: SelectionRange) => string
  formatSequenceLength: (length: number) => string
  formatStickySelection: (selection: StrandPairSelection) => string
  selectionLength: (range: SelectionRange, sequenceLength: number) => number
  setStatus: (message: string) => void
  resolveMobileEnzymeCutPairExtend: (
    extendFromModifier: boolean,
    cutSelectionAnchor: RestrictionSite | null,
    nextSiteKey: string,
    anchorSiteKey: string | null,
  ) => boolean
  siteKey: (site: RestrictionSite) => string
  restrictionFragmentStrandSelection: (
    anchor: RestrictionSite,
    second: RestrictionSite,
    topology: Topology,
  ) => StrandPairSelection
  restrictionCutAnchorStrandSelection: (site: RestrictionSite) => StrandPairSelection
  formatEnzymeCutAnchorStatus: (site: RestrictionSite) => string
}

export function useSelectionRangeController(options: SelectionRangeControllerOptions) {
  const setRange = useCallback((range: SelectionRange) => {
    const {
      record,
      selectedRange,
      selectionFocus,
      selectedFeatureId,
      selectedFeatureIds,
      selectedPrimerId,
      selectedPrimerIds,
    } = options
    const { start, end } = clampSelectionRange(range, record.sequence.length)
    if (
      selectedRange?.start === start && selectedRange.end === end
      && selectionFocus === 'dna'
      && selectedFeatureId === null && selectedFeatureIds.length === 0
      && selectedPrimerId === null && selectedPrimerIds.length === 0
    ) return
    options.setCutSelectionAnchor(null)
    options.setCutStrandSelection(null)
    options.setCutSelectionEnzymes(null)
    options.setSelectedFeatureId(null)
    options.setSelectedFeatureIds([])
    options.setSelectedProteinBondId(null)
    options.setSelectedPrimerId(null)
    options.setSelectedPrimerIds([])
    options.setSelectionFocus('dna')
    options.setSelectedRange({ start, end })
    options.setSelectionAnchor({ kind: 'base', forward: { start, end }, reverse: { start, end } })
    options.setSequenceScrollTarget(options.mapZoomCaretPosition({ start, end }, record.sequence.length))
    options.setStatus(`Selected ${options.formatRange({ start, end })} (${options.selectionLength({ start, end }, record.sequence.length)} bp).`)
  }, [options])

  const setSequenceRange = useCallback((range: SelectionRange, rangeOptions?: RangeOptions) => {
    const {
      record, traceFiles, alignmentsVisible, selectedAlignmentTraceId,
      selectedRange, selectionFocus, selectedFeatureId, selectedFeatureIds,
      selectedPrimerId, selectedPrimerIds,
    } = options
    if (rangeOptions && 'libraryMemberId' in rangeOptions) {
      const nextMemberId = rangeOptions.libraryMemberId ?? null
      if (nextMemberId !== selectedAlignmentTraceId) options.setSelectedAlignmentTraceId(nextMemberId)
    }
    const focusMemberId = rangeOptions && 'libraryMemberId' in rangeOptions
      ? (rangeOptions.libraryMemberId ?? null)
      : (!alignmentsVisible && isDnaLibraryRecord(record) ? selectedAlignmentTraceId : null)
    const focusMember = focusMemberId && !alignmentsVisible && isDnaLibraryRecord(record)
      ? traceFiles.find((trace) => trace.id === focusMemberId)
      : null
    const sequenceLength = rangeOptions?.sequenceLength ?? (focusMember ? focusMember.sequence.length : record.sequence.length)
    const { start, end } = clampSelectionRange(range, sequenceLength, { collapsed: rangeOptions?.collapsed })
    if (
      selectedRange?.start === start && selectedRange.end === end
      && selectionFocus === 'dna'
      && selectedFeatureId === null && selectedFeatureIds.length === 0
      && selectedPrimerId === null && selectedPrimerIds.length === 0
      && !(rangeOptions && 'libraryMemberId' in rangeOptions && rangeOptions.libraryMemberId !== selectedAlignmentTraceId)
    ) return
    options.setCutSelectionAnchor(null)
    options.setCutStrandSelection(null)
    options.setCutSelectionEnzymes(null)
    options.setSelectedFeatureId(null)
    options.setSelectedFeatureIds([])
    options.setSelectedProteinBondId(null)
    options.setSelectedPrimerId(null)
    options.setSelectedPrimerIds([])
    options.setSelectionFocus('dna')
    options.setSequenceHoverSiteKey(null)
    options.setSelectedRange({ start, end })
    if (!rangeOptions?.isExtend) options.setSelectionAnchor({ kind: 'base', forward: { start, end }, reverse: { start, end } })
    if (start === end) return options.setStatus(`Caret at position ${start + 1}.`)
    options.setStatus(`Selected ${options.formatRange({ start, end })} (${options.formatSequenceLength(options.selectionLength({ start, end }, sequenceLength))}).`)
  }, [options])

  const extendSelectionToEndpoint = useCallback((target: StrandSpanPair, extendOptions?: { describe?: string; directional?: boolean }) => {
    const { record, selectionAnchor } = options
    if (!selectionAnchor) return setSequenceRange(target.forward)
    const span = (fromStart: number, toEnd: number) => extendOptions?.directional
      ? directionalSelectionSpan(fromStart, toEnd, record.topology)
      : { start: Math.min(fromStart, toEnd), end: Math.max(fromStart, toEnd) }
    const forward = span(selectionAnchor.forward.start, target.forward.end)
    const reverse = span(selectionAnchor.reverse.start, target.reverse.end)
    if (forward.start === reverse.start && forward.end === reverse.end) return setSequenceRange(forward, { isExtend: true })
    options.setSelectedFeatureId(null)
    options.setSelectedFeatureIds([])
    options.setSelectedPrimerId(null)
    options.setSelectedPrimerIds([])
    options.setSelectionFocus('dna')
    options.setCutSelectionAnchor(null)
    options.setCutSelectionEnzymes(null)
    options.setSelectedRange(null)
    options.setCutStrandSelection({ forward, reverse })
    options.setSequenceScrollTarget(forward.start)
    options.setStatus(`${extendOptions?.describe ? `${extendOptions.describe}: ` : 'Selected '}${options.formatStickySelection({ forward, reverse })}.`)
  }, [options, setSequenceRange])

  const extendSelectionToBase = useCallback((boundary: number) => {
    if (!options.selectionAnchor) return setSequenceRange({ start: boundary, end: boundary }, { collapsed: true })
    extendSelectionToEndpoint({ forward: { start: boundary, end: boundary }, reverse: { start: boundary, end: boundary } }, { directional: options.selectionAnchor.kind !== 'base' })
  }, [extendSelectionToEndpoint, options.selectionAnchor, setSequenceRange])

  const selectRestrictionCutFromLabel = useCallback((site: RestrictionSite, requestedExtendSelection = false, selectionOptions?: { scroll?: boolean }) => {
    const {
      record,
      cutSelectionAnchor,
      selectionAnchor,
      setSelectedFeatureId,
      setSelectedFeatureIds,
      setSelectedPrimerId,
      setSelectedPrimerIds,
      setSelectionFocus,
      setCutStrandSelection,
      setCutSelectionEnzymes,
      setSelectedRange,
      setCutSelectionAnchor,
      setSelectionAnchor,
      setSequenceScrollTarget,
      setStatus,
    } = options
    const extendSelection = options.resolveMobileEnzymeCutPairExtend(
      requestedExtendSelection,
      cutSelectionAnchor,
      options.siteKey(site),
      cutSelectionAnchor ? options.siteKey(cutSelectionAnchor) : null,
    )
    setSelectedFeatureId(null)
    setSelectedFeatureIds([])
    setSelectedPrimerId(null)
    setSelectedPrimerIds([])
    setSelectionFocus('dna')
    if (extendSelection && cutSelectionAnchor) {
      const selection = options.restrictionFragmentStrandSelection(cutSelectionAnchor, site, record.topology)
      const leftIsFirst =
        Math.min(cutSelectionAnchor.cutTop, cutSelectionAnchor.cutBottom) <= Math.min(site.cutTop, site.cutBottom)
      setCutStrandSelection(selection)
      setCutSelectionEnzymes(
        leftIsFirst
          ? { upstream: cutSelectionAnchor, downstream: site }
          : { upstream: site, downstream: cutSelectionAnchor },
      )
      setSelectedRange(null)
      setCutSelectionAnchor(null)
      setStatus(
        `Selected fragment between ${cutSelectionAnchor.enzyme.name} and ${site.enzyme.name} cuts: ${options.formatStickySelection(selection)}.`,
      )
      return
    }

    if (extendSelection && selectionAnchor) {
      extendSelectionToEndpoint(
        {
          forward: { start: site.cutTop, end: site.cutTop },
          reverse: { start: site.cutBottom, end: site.cutBottom },
        },
        { describe: `Extended selection to ${site.enzyme.name} cut`, directional: true },
      )
      return
    }

    setCutSelectionAnchor(site)
    setCutSelectionEnzymes(null)
    const selection = options.restrictionCutAnchorStrandSelection(site)
    setCutStrandSelection(selection)
    setSelectedRange(null)
    setSelectionAnchor({
      kind: 'enzyme',
      forward: { start: site.cutTop, end: site.cutTop },
      reverse: { start: site.cutBottom, end: site.cutBottom },
      site,
    })
    if (selectionOptions?.scroll !== false) setSequenceScrollTarget(site.start)
    setStatus(options.formatEnzymeCutAnchorStatus(site))
  }, [extendSelectionToEndpoint, options])

  const navigateDnaSequenceCaret = useCallback((position: number) => {
    setSequenceRange({ start: position, end: position }, { collapsed: true })
  }, [setSequenceRange])

  const selectDnaSequenceRestriction = useCallback((
    site: RestrictionSite,
    extendSelection = false,
  ) => {
    selectRestrictionCutFromLabel(site, extendSelection, { scroll: false })
  }, [selectRestrictionCutFromLabel])

  return {
    setRange,
    setSequenceRange,
    extendSelectionToEndpoint,
    extendSelectionToBase,
    selectRestrictionCutFromLabel,
    navigateDnaSequenceCaret,
    selectDnaSequenceRestriction,
  }
}
