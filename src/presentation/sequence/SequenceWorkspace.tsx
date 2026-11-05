import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type CSSProperties, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { findRestrictionSites } from '../../domain/enzymes'
import { type EnzymePreferences } from '../../domain/enzymePreferences'
import { SequenceAlignmentPane } from '../../components/SequenceAlignmentPane'
import { LibrarySequenceStack } from '../../components/LibrarySequenceStack'
import { DnaLibraryToolbar } from '../../components/DnaLibraryToolbar'
import { enabledAlignmentCoverageSpans } from '../../domain/traceFileWorkflow'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { getLibraryReferenceMemberId, isLibraryConsensusEnabled } from '../../domain/libraryMemberFeatures'
import { libraryMemberHeaderMeta, sequenceRecordFromLibraryMember } from '../../domain/libraryMemberRecord'
import { estimateLibraryMemberPlaceholderHeight, libraryBrowseNearViewportKeys, libraryBrowseNavKeys, libraryBrowseViewportKey, stepLibraryBrowseNavKey } from '../../domain/libraryBrowseViewport'
import { buildTraceAnnotationRenderContext } from '../../domain/traceAnnotationView'
import { type HorizontalBandsSnapshot } from '../../components/alignmentBandsTypes'
import { alignmentProfileEnabled, alignmentProfileMeasure, alignmentProfileReport } from '../../domain/alignmentProfiler'
import { type TraceFileRecord } from '../../domain/traceTypes'
import { isSgRNAFeature } from '../../domain/sgrna'
import { matchesMobileShellViewport } from '../../ui/mobileShellMedia'
import { MOBILE_SEQUENCE_TOUCH_HINT } from '../../ui/mobilePairSelection'
import { type FeatureTranslationCell } from '../../domain/geneticCode'
import { getCachedOrfFeatures, getCachedOrfTranslations, type OrfPredictionSettings } from '../../domain/orfPrediction'
import { resolveDisplayablePrimerSites, type PrimerFrameDisplay } from '../../domain/primerSequenceLayout'
import { MapZoomSliderGroup } from '../map'
import { type RestrictionEnzyme, type RestrictionSite, type SequenceFeature, type SequenceRecord } from '../../domain/types'
import {
  computeSequenceMinimapVisibleRange,
  sequenceMinimapAlignmentExtraHeightPx,
  sequenceMinimapHeightPx,
  sequenceMinimapOligoTracksHeightPx,
  scrollSequenceViewToPosition,
  type DisplaySettings,
  type RestrictionSiteList,
  type SelectionRange,
  type StrandPairSelection,
} from './sequenceShared'
import { filterRestrictionSitesForDisplay } from './sequenceRenderingHelpers'
import { SequenceMinimap } from './SequenceMinimap'
import { sequenceMinimapOligoSpans } from './sequenceMinimapOligos'
import { SequenceRows } from './SequenceRows'
import { SequenceVisualControlsPanel } from './SequenceVisualControlsPanel'
import { PrimerRefinedSequenceRows } from './PrimerRefinedSequenceRows'
import { tracePrimerDisplaysEligibleForRefinement } from './tracePrimerRefinement'
import { usePrimer3PrimerFrameDisplays } from '../primers/usePrimer3PrimerFrameDisplays'

const emptyStringSet: ReadonlySet<string> = new Set()

export function SequenceWorkspace({
  record,
  displayAnnotationFeatures,
  orfTranslationByFeatureId,
  displayedRestrictionSites,
  selectedRange,
  cutStrandSelection,
  selectedFeatureId = null,
  selectedFeatureIds = [],
  selectedPrimerId,
  selectedPrimerIds = [],
  selectedRestrictionSites = [],
  initialHoveredRestrictionSiteKey,
  scrollHostRef,
  onNavigate,
  motifHits,
  motifQueryLength = 0,
  primerFrameDisplays,
  primerFramesAreThermodynamic = false,
  disablePrimer3PrimerFrameRefinement = false,
  displaySettings,
  enzymePreferences,
  layoutActive,
  traceAnnotationEnzymePool,
  onFeatureSelect,
  onFeatureEdit,
  onPrimerSelect,
  onRestrictionSelect,
  onRangeSelect,
  onExtendToBase,
  onPrimerEdit,
  onEnzymeInfo,
  onStatus,
  onApplyReferenceReplacement,
  onRegisterTemplateNavigator,
  onDisplaySettingsChange,
  onSaveVisualSettings,
  onRevertVisualSettings,
  traceFiles,
  onTraceFilesChange,
  traceAlignBusy = false,
  selectedAlignmentTraceId,
  onSelectAlignmentTrace,
  onViewTrace,
  onTracesAdded,
  onPickFromDatabase,
  onRebuildLibraryConsensus,
  onFlipLibrary,
  onFlipLibraryMember,
  onOpenLibraryMemberAsConstruct,
  onOpenCombineLibraryReads,
  onCropLibrary,
  onGroupLibraryMembers,
  onReassembleLibraryMember,
  onDetachLibraryMemberRead,
  onAcceptReadBaseAtTemplate,
  canCropLibrary = false,
  viewRange = null,
  onViewRangeChange,
  zoomSliderValue = 0,
  onZoomSliderValueChange,
  showInFrameTranslationExtensions = true,
  highlightMutagenicDnaBases = false,
  hideMinimap = false,
  singleRowSequence = false,
}: {
  record: SequenceRecord
  displayAnnotationFeatures: SequenceFeature[]
  orfTranslationByFeatureId?: Map<string, FeatureTranslationCell[]>
  displayedRestrictionSites: RestrictionSiteList
  selectedRange: SelectionRange | null
  cutStrandSelection: StrandPairSelection | null
  selectedFeatureId?: string | null
  selectedFeatureIds?: string[]
  selectedPrimerId: string | null
  selectedPrimerIds?: string[]
  selectedRestrictionSites?: RestrictionSite[]
  initialHoveredRestrictionSiteKey: string | null
  scrollHostRef: RefObject<HTMLDivElement | null>
  onNavigate: (position: number) => void
  motifHits: number[]
  motifQueryLength?: number
  primerFrameDisplays: PrimerFrameDisplay[]
  /** Caller already supplied Primer3-derived glyphs under its own live conditions. */
  primerFramesAreThermodynamic?: boolean
  /** Suppress default-condition THAL while a caller owns preview/fallback display state. */
  disablePrimer3PrimerFrameRefinement?: boolean
  displaySettings: DisplaySettings
  enzymePreferences: EnzymePreferences
  layoutActive: boolean
  traceAnnotationEnzymePool: RestrictionEnzyme[]
  traceFiles: TraceFileRecord[]
  onTraceFilesChange: Dispatch<SetStateAction<TraceFileRecord[]>>
  traceAlignBusy?: boolean
  selectedAlignmentTraceId: string | null
  onSelectAlignmentTrace: (traceId: string | null) => void
  /** Open one alignment in the dedicated Trace Viewer with its alignment context. */
  onViewTrace?: (traceId: string) => void
  onTracesAdded: (result: { scrollTemplateIndex?: number; scrollToTraceId?: string }) => void
  onPickFromDatabase?: () => void
  onRebuildLibraryConsensus?: () => void
  onFlipLibrary?: () => void
  onFlipLibraryMember?: (memberId: string) => void
  onOpenLibraryMemberAsConstruct?: (memberId: string) => void
  onOpenCombineLibraryReads?: () => void
  onCropLibrary?: () => void
  onGroupLibraryMembers?: (memberIds: string[], options?: { keepMemberId?: string }) => void
  onReassembleLibraryMember?: (memberId: string) => void
  onDetachLibraryMemberRead?: (memberId: string, readId: string) => void
  onAcceptReadBaseAtTemplate?: (memberId: string, templateIndex: number, displayBase: string) => void
  canCropLibrary?: boolean
  onFeatureSelect: (id: string, extendSelection?: boolean, libraryMemberId?: string | null) => void
  onFeatureEdit: (id: string, libraryMemberId?: string | null) => void
  onPrimerSelect: (primerId: string, extendSelection?: boolean, libraryMemberId?: string | null) => void
  onRestrictionSelect: (site: RestrictionSite, extendSelection?: boolean) => void
  onRangeSelect: (range: SelectionRange, options?: {
    collapsed?: boolean
    isExtend?: boolean
    sequenceLength?: number
    libraryMemberId?: string | null
  }) => void
  onExtendToBase?: (position: number) => void
  onPrimerEdit: (primerId: string, libraryMemberId?: string | null) => void
  onEnzymeInfo: (enzymeName: string) => void
  onStatus?: (message: string) => void
  onApplyReferenceReplacement: (templateStart: number, templateEnd: number, replacement: string) => void
  onRegisterTemplateNavigator?: (navigator: { scrollToTemplate: (templateIndex: number) => void }) => void
  onDisplaySettingsChange?: (updater: (current: DisplaySettings) => DisplaySettings) => void
  onSaveVisualSettings?: () => void
  onRevertVisualSettings?: () => void
  /** Shared magnifier window with the map tab; when set, sequence rows show only this range. */
  viewRange?: SelectionRange | null
  onViewRangeChange?: (range: SelectionRange) => void
  /** Authoritative zoom slider thumb (shared with the map strip). */
  zoomSliderValue?: number
  onZoomSliderValueChange?: (value: number) => void
  /** Dashed “(in frame with …)” continuation overlays past annotated CDS ends. */
  showInFrameTranslationExtensions?: boolean
  /** Paint mismatch/template-gap DNA bases red (Mutagenesis preview only). */
  highlightMutagenicDnaBases?: boolean
  /** Hide the whole-construct overview while retaining the focused sequence rows. */
  hideMinimap?: boolean
  /** Keep the focused sequence window on one horizontally scrollable row. */
  singleRowSequence?: boolean
}) {
  const [hoveredRestrictionSiteKey, setHoveredRestrictionSiteKey] = useState<string | null>(null)
  const [, setHorizontalBandsSnapshot] = useState<HorizontalBandsSnapshot | null>(null)
  const effectiveHoveredRestrictionSiteKey = initialHoveredRestrictionSiteKey ?? hoveredRestrictionSiteKey

  const alignmentMode = displaySettings.alignments.visible
  const alignmentScrollToTemplateRef = useRef<(templateIndex: number) => void>(() => {})
  const alignmentScrollToViewportStartRef = useRef<(templateIndex: number, atEnd: boolean) => void>(() => {})
  const [alignmentMinimapRange, setAlignmentMinimapRange] = useState<{ start: number; end: number } | null>(null)

  const effectiveAlignmentMinimapRange = alignmentMode ? alignmentMinimapRange : null

  const registerTemplateNavigator = useCallback(
    (navigator: { scrollToTemplate: (templateIndex: number) => void; scrollToViewportStart: (templateIndex: number, atEnd: boolean) => void }) => {
      alignmentScrollToTemplateRef.current = navigator.scrollToTemplate
      alignmentScrollToViewportStartRef.current = navigator.scrollToViewportStart
      onRegisterTemplateNavigator?.(navigator)
    },
    [onRegisterTemplateNavigator],
  )

  const handleAlignmentMinimapNavigate = useCallback(
    (position: number) => {
      alignmentScrollToTemplateRef.current(position)
      onNavigate(position)
    },
    [onNavigate],
  )

  useEffect(() => {
    if (!alignmentMode || !alignmentProfileEnabled()) return
    let innerFrame = 0
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        alignmentProfileMeasure('alignment-toggle-total', 'alignment-toggle-start', 'session')
        alignmentProfileReport('Show alignments')
      })
    })
    return () => {
      window.cancelAnimationFrame(outerFrame)
      if (innerFrame) window.cancelAnimationFrame(innerFrame)
    }
  }, [alignmentMode])

  const alignmentLayoutActive = layoutActive || alignmentMode
  const alignmentCoverageSpans = useMemo(
    () => (alignmentMode ? enabledAlignmentCoverageSpans(traceFiles, record.sequence.length) : undefined),
    [alignmentMode, record.sequence.length, traceFiles],
  )
  const sequenceVisual = displaySettings.sequenceVisual
  const visualControlsOpen = sequenceVisual.panelOpen === true

  const libraryBrowseMembers = useMemo(
    () => (!alignmentMode && isDnaLibraryRecord(record)
      ? traceFiles.filter((member) => member.enabled && member.sequence.length > 0)
      : []),
    [alignmentMode, record, traceFiles],
  )
  const libraryConsensusVisible = isDnaLibraryRecord(record) && isLibraryConsensusEnabled(record)
  const libraryBrowseActive = libraryBrowseMembers.length > 0
  const thermodynamicPrimerFrameDisplays = usePrimer3PrimerFrameDisplays(
    record,
    primerFrameDisplays,
    (!libraryBrowseActive || libraryConsensusVisible) && displaySettings.primers.visible &&
      !primerFramesAreThermodynamic && !disablePrimer3PrimerFrameRefinement,
  )
  const libraryBrowseKeys = useMemo(
    () => libraryBrowseNavKeys(libraryBrowseMembers.map((member) => member.id), {
      includeConsensus: libraryConsensusVisible,
    }),
    [libraryBrowseMembers, libraryConsensusVisible],
  )
  const [libraryViewportMemberId, setLibraryViewportMemberId] = useState<string | null>(null)
  const [libraryMinimapRange, setLibraryMinimapRange] = useState<{ start: number; end: number } | null>(null)
  const visibleLibraryViewportMemberId = libraryBrowseActive ? libraryViewportMemberId : null
  const visibleLibraryMinimapRange = libraryBrowseActive ? libraryMinimapRange : null
  const libraryPreparationScope = `${record.id}:${alignmentMode ? 'alignment' : 'sequence'}`
  const [preparedLibraryMemberState, setPreparedLibraryMemberState] = useState<{
    scope: string
    ids: ReadonlySet<string>
  }>(() => ({ scope: libraryPreparationScope, ids: new Set() }))
  const preparedLibraryMemberIds = preparedLibraryMemberState.scope === libraryPreparationScope
    ? preparedLibraryMemberState.ids
    : emptyStringSet
  const [libraryMemberBodyHeights, setLibraryMemberBodyHeights] = useState<Map<string, number>>(() => new Map())

  const libraryMemberOrfSettings = useMemo<OrfPredictionSettings>(
    () => ({
      mode: displaySettings.orfs.mode,
      minimumLengthAa: displaySettings.orfs.minimumLengthAa,
      requireStartCodon: displaySettings.orfs.requireStartCodon,
      startCodon: displaySettings.orfs.startCodon,
      geneticCode: displaySettings.orfs.geneticCode,
    }),
    [
      displaySettings.orfs.geneticCode,
      displaySettings.orfs.minimumLengthAa,
      displaySettings.orfs.mode,
      displaySettings.orfs.requireStartCodon,
      displaySettings.orfs.startCodon,
    ],
  )

  const libraryMemberViews = useMemo(() => {
    if (!libraryBrowseActive) return []
    const enzymesVisible = displaySettings.enzymes.visible
    const orfsVisible = displaySettings.orfs.visible
    const featuresVisible = displaySettings.features.visible
    const primersVisible = displaySettings.primers.visible
    const sgRnasVisible = displaySettings.primers.sgRnasVisible
    const hybridization = displaySettings.primers.hybridization
    return libraryBrowseMembers.flatMap((member, index) => {
      // The stack keeps lightweight placeholders for distant members. Preparing
      // all member views here would still perform every restriction/primer scan.
      if (
        !preparedLibraryMemberIds.has(member.id)
        && !(index === 0 && !libraryConsensusVisible)
        && member.id !== selectedAlignmentTraceId
      ) return []
      const memberRecord = sequenceRecordFromLibraryMember(member)
      const restrictionSites = enzymesVisible
        ? filterRestrictionSitesForDisplay(
          findRestrictionSites(member.sequence, traceAnnotationEnzymePool, {
            construct: record.construct,
            topology: 'linear',
            annotateMethylation: true,
          }),
          displaySettings.enzymes,
        )
        : []
      const storedFeatures = (member.features ?? []).filter((feature) =>
        feature.visible !== false && (isSgRNAFeature(feature) ? sgRnasVisible : featuresVisible),
      )
      const orfFeatures = orfsVisible
        ? getCachedOrfFeatures(member.sequence, libraryMemberOrfSettings)
        : []
      const orfTranslations = orfsVisible
        ? getCachedOrfTranslations(member.sequence, libraryMemberOrfSettings)
        : undefined
      const primerFrameDisplays = primersVisible
        ? resolveDisplayablePrimerSites(memberRecord, hybridization).displays
        : []
      return [{
        member,
        memberRecord,
        restrictionSites,
        annotationFeatures: [...storedFeatures, ...orfFeatures],
        orfTranslations,
        primerFrameDisplays,
      }]
    })
  }, [
    displaySettings.enzymes,
    displaySettings.features.visible,
    displaySettings.orfs.visible,
    displaySettings.primers.hybridization,
    displaySettings.primers.sgRnasVisible,
    displaySettings.primers.visible,
    libraryBrowseActive,
    libraryBrowseMembers,
    libraryConsensusVisible,
    libraryMemberOrfSettings,
    preparedLibraryMemberIds,
    record.construct,
    selectedAlignmentTraceId,
    traceAnnotationEnzymePool,
  ])

  const libraryViewportView = useMemo(
    () => (
      visibleLibraryViewportMemberId
        ? (libraryMemberViews.find((entry) => entry.member.id === visibleLibraryViewportMemberId) ?? null)
        : null
    ),
    [libraryMemberViews, visibleLibraryViewportMemberId],
  )
  const libraryMinimapSequenceLength = libraryViewportView?.member.sequence.length ?? record.sequence.length
  const libraryMinimapFeatures = libraryViewportView?.annotationFeatures ?? displayAnnotationFeatures
  const libraryMinimapSites = libraryViewportView?.restrictionSites ?? displayedRestrictionSites
  const libraryMinimapSelectedRange =
    (selectedAlignmentTraceId ?? null) === visibleLibraryViewportMemberId
      ? selectedRange
      : null
  const minimapFeatures = libraryBrowseActive ? libraryMinimapFeatures : displayAnnotationFeatures
  const minimapPrimerDisplays = libraryBrowseActive && libraryViewportView ? libraryViewportView.primerFrameDisplays : thermodynamicPrimerFrameDisplays
  const minimapOligoSpans = useMemo(() => sequenceMinimapOligoSpans(
    displaySettings.primers.visible ? minimapPrimerDisplays : [],
    minimapFeatures,
    displaySettings.primers.sgRnasVisible,
  ), [displaySettings.primers.visible, displaySettings.primers.sgRnasVisible, minimapFeatures, minimapPrimerDisplays])

  useEffect(() => {
    if (!libraryBrowseActive) return
    const viewMain = scrollHostRef.current
    if (!viewMain) return
    const stack = viewMain.querySelector<HTMLElement>('.library-sequence-stack')
    if (!stack) return

    let frame = 0
    const update = () => {
      frame = 0
      const nearKeys = libraryBrowseNearViewportKeys(stack, Math.max(400, stack.clientHeight))
      setPreparedLibraryMemberState((current) => {
        const next = new Set(nearKeys)
        const currentIds = current.scope === libraryPreparationScope ? current.ids : emptyStringSet
        return next.size === currentIds.size && [...next].every((key) => currentIds.has(key))
          ? current
          : { scope: libraryPreparationScope, ids: next }
      })
      const nextId = libraryBrowseViewportKey(stack)
      setLibraryViewportMemberId((current) => (current === nextId ? current : nextId))
      const key = nextId ?? 'consensus'
      const block = stack.querySelector<HTMLElement>(`[data-library-key="${CSS.escape(key)}"]`)
      const rowsRoot = block?.querySelector<HTMLElement>('.sequence-rows') ?? block ?? stack
      const length = nextId
        ? (libraryBrowseMembers.find((member) => member.id === nextId)?.sequence.length ?? record.sequence.length)
        : record.sequence.length
      setLibraryMinimapRange(computeSequenceMinimapVisibleRange(stack, length, rowsRoot))
    }
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    schedule()
    stack.addEventListener('scroll', schedule, { passive: true })
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(stack)
    const blockResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const block = entry.target as HTMLElement
        const key = block.dataset.libraryKey
        const body = block.querySelector<HTMLElement>('.sequence-rows')
        if (key && body) {
          const height = Math.ceil(body.getBoundingClientRect().height)
          if (height > 0) {
            const scopedKey = `${record.id}:${key}`
            setLibraryMemberBodyHeights((current) => {
              if (current.get(scopedKey) === height) return current
              const next = new Map(current)
              next.set(scopedKey, height)
              return next
            })
          }
        }
      }
      schedule()
    })
    stack.querySelectorAll<HTMLElement>('[data-library-key]').forEach((block) => blockResizeObserver.observe(block))
    const mutationObserver = new MutationObserver(schedule)
    mutationObserver.observe(stack, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-library-key', 'data-row-start', 'data-row-end'],
    })
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      stack.removeEventListener('scroll', schedule)
      resizeObserver.disconnect()
      blockResizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [libraryBrowseActive, libraryBrowseMembers, libraryPreparationScope, record.id, record.sequence.length, scrollHostRef])

  function activateLibraryBrowseKey(nextId: string | null) {
    if (nextId === null) {
      onSelectAlignmentTrace(null)
      onRangeSelect({ start: 0, end: 0 }, {
        collapsed: true,
        libraryMemberId: null,
        sequenceLength: record.sequence.length,
      })
    } else {
      const member = libraryBrowseMembers.find((entry) => entry.id === nextId)
      if (!member) return
      setPreparedLibraryMemberState((current) => {
        const currentIds = current.scope === libraryPreparationScope ? current.ids : emptyStringSet
        return currentIds.has(member.id)
          ? current
          : { scope: libraryPreparationScope, ids: new Set([...currentIds, member.id]) }
      })
      onRangeSelect({ start: 0, end: 0 }, {
        collapsed: true,
        libraryMemberId: member.id,
        sequenceLength: member.sequence.length,
      })
    }
    setLibraryViewportMemberId(nextId)
    const viewMain = scrollHostRef.current
    const stack = viewMain?.querySelector<HTMLElement>('.library-sequence-stack')
    const key = nextId ?? 'consensus'
    window.requestAnimationFrame(() => {
      stack?.querySelector<HTMLElement>(`[data-library-key="${CSS.escape(key)}"]`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }

  function navigateLibraryBrowse(delta: number) {
    if (!libraryBrowseActive || libraryBrowseKeys.length < 2) return
    activateLibraryBrowseKey(stepLibraryBrowseNavKey(libraryBrowseKeys, visibleLibraryViewportMemberId, delta))
  }

  function handleLibraryMinimapNavigate(position: number) {
    const viewMain = scrollHostRef.current
    if (!viewMain) return
    const key = visibleLibraryViewportMemberId ?? 'consensus'
    const block = viewMain.querySelector<HTMLElement>(`[data-library-key="${CSS.escape(key)}"]`)
    const rowsRoot = block?.querySelector<HTMLElement>('.sequence-rows') ?? block ?? viewMain
    scrollSequenceViewToPosition(viewMain, position, rowsRoot)
    onNavigate(position)
  }

  function handleLibraryMinimapViewportNavigate(position: number, atEnd: boolean) {
    const viewMain = scrollHostRef.current
    if (!viewMain) return
    const key = visibleLibraryViewportMemberId ?? 'consensus'
    const block = viewMain.querySelector<HTMLElement>(`[data-library-key="${CSS.escape(key)}"]`)
    const rowsRoot = block?.querySelector<HTMLElement>('.sequence-rows') ?? block ?? viewMain
    scrollSequenceViewToPosition(viewMain, position, rowsRoot, { viewportAnchorFraction: 0, interpolateWithinRow: true, atEnd })
  }

  function patchSequenceVisual(patch: Partial<DisplaySettings['sequenceVisual']>) {
    onDisplaySettingsChange?.((current) => ({
      ...current,
      sequenceVisual: {
        ...current.sequenceVisual,
        ...patch,
      },
    }))
  }

  return (
    <div
      className={`view-main${alignmentMode ? ' view-main-alignment-mode' : ''}${!alignmentMode && libraryBrowseActive ? ' view-main-library-browse' : ''}`}
      ref={scrollHostRef}
      style={
        {
          '--sequence-minimap-height': `${
            (alignmentMode
              ? sequenceMinimapHeightPx + sequenceMinimapAlignmentExtraHeightPx
              : sequenceMinimapHeightPx) + (minimapOligoSpans.length ? sequenceMinimapOligoTracksHeightPx : 0)
          }px`,
        } as CSSProperties
      }
    >
      {visualControlsOpen && onDisplaySettingsChange ? (
        <div className="sequence-visual-controls-anchor">
          <SequenceVisualControlsPanel
            settings={sequenceVisual}
            onChange={patchSequenceVisual}
            onSave={onSaveVisualSettings}
            onRevert={onRevertVisualSettings}
          />
        </div>
      ) : null}
      {!hideMinimap && (() => {
        const minimap = (
          <SequenceMinimap
            sequenceLength={libraryBrowseActive ? libraryMinimapSequenceLength : record.sequence.length}
            annotationFeatures={minimapFeatures}
            oligoSpans={minimapOligoSpans}
            restrictionSites={libraryBrowseActive ? libraryMinimapSites : displayedRestrictionSites}
            selectedRange={libraryBrowseActive ? libraryMinimapSelectedRange : selectedRange}
            cutStrandSelection={libraryBrowseActive ? null : cutStrandSelection}
            hoveredRestrictionSiteKey={libraryBrowseActive ? null : effectiveHoveredRestrictionSiteKey}
            scrollHostRef={scrollHostRef}
            onNavigate={onNavigate}
            visibleRange={
              alignmentMode
                ? (effectiveAlignmentMinimapRange ?? undefined)
                : libraryBrowseActive
                  ? (visibleLibraryMinimapRange ?? undefined)
                  : undefined
            }
            onMinimapNavigate={
              alignmentMode
                ? handleAlignmentMinimapNavigate
                : libraryBrowseActive
                  ? handleLibraryMinimapNavigate
                  : undefined
            }
            onMinimapViewportNavigate={alignmentMode
              ? (position, atEnd) => alignmentScrollToViewportStartRef.current(position, atEnd)
              : libraryBrowseActive ? handleLibraryMinimapViewportNavigate : undefined}
            alignmentCoverageSpans={alignmentCoverageSpans}
            zoomRange={!alignmentMode && !libraryBrowseActive ? viewRange : null}
            onZoomRangeChange={libraryBrowseActive ? undefined : onViewRangeChange}
          />
        )
        const minimapWithLibraryNav = libraryBrowseActive ? (
          <div className="library-sequence-minimap-row" role="toolbar" aria-label="Library sequence overview">
            {minimap}
            <div className="library-sequence-minimap-nav" role="group" aria-label="Switch library sequence">
              <button type="button" aria-label="Previous member" onClick={() => navigateLibraryBrowse(-1)}>
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <button type="button" aria-label="Next member" onClick={() => navigateLibraryBrowse(1)}>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : minimap
        if (alignmentMode || libraryBrowseActive || !viewRange || !onViewRangeChange || !onZoomSliderValueChange) {
          return minimapWithLibraryNav
        }
        return (
          <div className="map-zoom-strip" role="toolbar" aria-label="Sequence zoom controls">
            <MapZoomSliderGroup
              sequenceLength={record.sequence.length}
              sliderValue={zoomSliderValue}
              onSliderValueChange={onZoomSliderValueChange}
            />
            {minimap}
          </div>
        )
      })()}
      {matchesMobileShellViewport() ? (
        <p className="sequence-mobile-touch-hint" role="note">
          {MOBILE_SEQUENCE_TOUCH_HINT}
        </p>
      ) : null}
      {alignmentMode ? (
        <SequenceAlignmentPane
          key={record.id}
          templateSequence={record.sequence}
          topology={record.topology}
          layoutActive={alignmentLayoutActive}
          traceFiles={traceFiles}
          onTraceFilesChange={onTraceFilesChange}
          traceAlignBusy={traceAlignBusy}
          selectedTraceId={selectedAlignmentTraceId}
          onSelectTrace={onSelectAlignmentTrace}
          selectedRange={selectedRange}
          onRangeSelect={onRangeSelect}
          onApplyReferenceReplacement={onApplyReferenceReplacement}
          onRegisterTemplateNavigator={registerTemplateNavigator}
          onVisibleTemplateRangeChange={setAlignmentMinimapRange}
          onTracesAdded={onTracesAdded}
          onPickFromDatabase={onPickFromDatabase}
          acceptOsFileDrops={false}
          mode={displaySettings.alignments.mode ?? 'trace'}
          isLibrary={isDnaLibraryRecord(record)}
          annotationReferenceName={
            isDnaLibraryRecord(record)
              ? (() => {
                const refId = getLibraryReferenceMemberId(record)
                if (!refId) return 'consensus'
                return traceFiles.find((trace) => trace.id === refId)?.fileName ?? 'consensus'
              })()
              : null
          }
          onRebuildConsensus={isDnaLibraryRecord(record) ? onRebuildLibraryConsensus : undefined}
          onFlipLibrary={isDnaLibraryRecord(record) ? onFlipLibrary : undefined}
          onFlipLibraryMember={isDnaLibraryRecord(record) ? onFlipLibraryMember : undefined}
          onOpenLibraryMemberAsConstruct={isDnaLibraryRecord(record) ? onOpenLibraryMemberAsConstruct : undefined}
          onOpenCombineLibraryReads={isDnaLibraryRecord(record) ? onOpenCombineLibraryReads : undefined}
          onCropLibrary={isDnaLibraryRecord(record) ? onCropLibrary : undefined}
          onGroupLibraryMembers={isDnaLibraryRecord(record) ? onGroupLibraryMembers : undefined}
          onReassembleLibraryMember={isDnaLibraryRecord(record) ? onReassembleLibraryMember : undefined}
          onDetachLibraryMemberRead={isDnaLibraryRecord(record) ? onDetachLibraryMemberRead : undefined}
          onAcceptReadBaseAtTemplate={isDnaLibraryRecord(record) ? onAcceptReadBaseAtTemplate : undefined}
          canCropLibrary={canCropLibrary}
          onFocusReference={() => onSelectAlignmentTrace(null)}
          onViewTrace={onViewTrace}
          renderReferenceRow={(horizontalViewport, mergedLayout, { onRowHeight, visibleRangeOverride }) => (
            <SequenceRows
              record={record}
              motifHits={motifHits}
              motifQueryLength={motifQueryLength}
              restrictionSites={displayedRestrictionSites}
              primerFrameDisplays={thermodynamicPrimerFrameDisplays}
              annotationFeatures={displayAnnotationFeatures}
              orfTranslationByFeatureId={orfTranslationByFeatureId}
              displaySettings={displaySettings}
              enzymePreferences={enzymePreferences}
              hoveredRestrictionSiteKey={effectiveHoveredRestrictionSiteKey}
              cutStrandSelection={cutStrandSelection}
              selectedRange={selectedRange}
              selectedFeatureId={selectedFeatureId}
              selectedFeatureIds={selectedFeatureIds}
              selectedPrimerId={selectedPrimerId}
              selectedPrimerIds={selectedPrimerIds}
              selectedRestrictionSites={selectedRestrictionSites}
              layoutActive={alignmentLayoutActive}
              horizontalMode
              horizontalViewport={horizontalViewport}
              horizontalVisibleRangeOverride={visibleRangeOverride}
              alignmentMergedLayout={mergedLayout}
              onHorizontalBandsSnapshot={setHorizontalBandsSnapshot}
              onHorizontalRowHeight={onRowHeight}
              showInFrameTranslationExtensions={showInFrameTranslationExtensions}
              highlightMutagenicDnaBases={highlightMutagenicDnaBases}
              onFeatureSelect={onFeatureSelect}
              onFeatureEdit={onFeatureEdit}
              onPrimerSelect={onPrimerSelect}
              onRestrictionSelect={onRestrictionSelect}
              onRestrictionHover={setHoveredRestrictionSiteKey}
              onRangeSelect={onRangeSelect}
              onPrimerEdit={onPrimerEdit}
              onEnzymeInfo={onEnzymeInfo}
              onStatus={onStatus}
            />
          )}
          renderTraceAnnotationRow={(trace, { horizontalViewport, mergedLayout, onRowHeight, visibleRangeOverride }) => {
            if (!trace.alignment) return null
            const traceContext = buildTraceAnnotationRenderContext(
              record,
              trace,
              mergedLayout,
              traceAnnotationEnzymePool,
              displayAnnotationFeatures,
              displaySettings.primers.hybridization,
            )
            if (!traceContext) return null
            const traceRestrictionSites = filterRestrictionSitesForDisplay(
              traceContext.restrictionSites,
              displaySettings.enzymes,
            )
            const tracePrimerFrames = displaySettings.primers.visible ? traceContext.primerFrameDisplays : []
            const eligibleTracePrimerFrames = tracePrimerDisplaysEligibleForRefinement(
              tracePrimerFrames,
              trace.alignment,
            )
            return (
              <PrimerRefinedSequenceRows
                record={record}
                refinementSequence={traceContext.templateSequence}
                eligiblePrimerFrameDisplays={eligibleTracePrimerFrames}
                refine={displaySettings.primers.visible}
                motifHits={[]}
                restrictionSites={traceRestrictionSites}
                primerFrameDisplays={tracePrimerFrames}
                annotationFeatures={displayAnnotationFeatures}
                translationByFeatureIdOverride={traceContext.translationByFeatureId}
                displaySettings={displaySettings}
                enzymePreferences={enzymePreferences}
                  hoveredRestrictionSiteKey={effectiveHoveredRestrictionSiteKey}
                cutStrandSelection={null}
                selectedRange={selectedRange}
                selectedFeatureId={selectedFeatureId}
              selectedFeatureIds={selectedFeatureIds}
              selectedPrimerId={selectedPrimerId}
              selectedPrimerIds={selectedPrimerIds}
              selectedRestrictionSites={selectedRestrictionSites}
                layoutActive={alignmentLayoutActive}
                horizontalMode
                compactAlignmentAnnotations={isDnaLibraryRecord(record)}
                horizontalViewport={horizontalViewport}
                horizontalVisibleRangeOverride={visibleRangeOverride}
                alignmentMergedLayout={mergedLayout}
                alignmentTraceDisplay={{
                  alignment: trace.alignment,
                  baseCalls: trace.chromatogram.baseCalls,
                }}
                onHorizontalRowHeight={onRowHeight}
                showInFrameTranslationExtensions={showInFrameTranslationExtensions}
                highlightMutagenicDnaBases={highlightMutagenicDnaBases}
                onFeatureSelect={onFeatureSelect}
                onFeatureEdit={onFeatureEdit}
                onPrimerSelect={onPrimerSelect}
                onRestrictionSelect={onRestrictionSelect}
                onRestrictionHover={setHoveredRestrictionSiteKey}
                onRangeSelect={onRangeSelect}
                onPrimerEdit={onPrimerEdit}
                onEnzymeInfo={onEnzymeInfo}
                onStatus={onStatus}
              />
            )
          }}
        />
      ) : libraryBrowseActive ? (
        <div className="dna-library-browse-shell">
          <DnaLibraryToolbar
            consensusLength={record.sequence.length}
            memberCount={libraryBrowseMembers.length}
            selectedMemberName={
              selectedAlignmentTraceId
                ? (libraryBrowseMembers.find((member) => member.id === selectedAlignmentTraceId)?.fileName ?? 'selected')
                : null
            }
            annotationReferenceName={
              (() => {
                const refId = getLibraryReferenceMemberId(record)
                if (!refId) return 'consensus'
                return libraryBrowseMembers.find((member) => member.id === refId)?.fileName
                  ?? traceFiles.find((trace) => trace.id === refId)?.fileName
                  ?? 'consensus'
              })()
            }
            onRebuildConsensus={onRebuildLibraryConsensus}
            onFlipLibrary={onFlipLibrary}
            onOpenCombineLibraryReads={onOpenCombineLibraryReads}
            onCropLibrary={onCropLibrary}
            canCropLibrary={canCropLibrary}
            busy={traceAlignBusy}
          />
          <LibrarySequenceStack
          activeKey={
            selectedAlignmentTraceId
              ?? (libraryConsensusVisible ? 'consensus' : (libraryBrowseMembers[0]?.id ?? 'consensus'))
          }
          onActivate={(key) => {
            activateLibraryBrowseKey(key === 'consensus' ? null : key)
          }}
          blocks={[
            ...(libraryConsensusVisible
              ? [{
              key: 'consensus',
              title: 'Consensus',
              meta: `${record.sequence.length.toLocaleString()} bp · ${libraryBrowseMembers.length} member${libraryBrowseMembers.length === 1 ? '' : 's'}`,
              isConsensus: true as const,
              body: (
                <SequenceRows
                  record={record}
                  motifHits={motifHits}
                  motifQueryLength={motifQueryLength}
                  restrictionSites={displayedRestrictionSites}
                  primerFrameDisplays={thermodynamicPrimerFrameDisplays}
                  annotationFeatures={displayAnnotationFeatures}
                  orfTranslationByFeatureId={orfTranslationByFeatureId}
                  displaySettings={displaySettings}
                  enzymePreferences={enzymePreferences}
                  hoveredRestrictionSiteKey={effectiveHoveredRestrictionSiteKey}
                  cutStrandSelection={selectedAlignmentTraceId ? null : cutStrandSelection}
                  selectedRange={selectedAlignmentTraceId ? null : selectedRange}
                  selectedFeatureId={selectedAlignmentTraceId ? null : selectedFeatureId}
                  selectedFeatureIds={selectedAlignmentTraceId ? [] : selectedFeatureIds}
                  selectedPrimerId={selectedAlignmentTraceId ? null : selectedPrimerId}
                  selectedPrimerIds={selectedAlignmentTraceId ? [] : selectedPrimerIds}
                  selectedRestrictionSites={selectedAlignmentTraceId ? [] : selectedRestrictionSites}
                  layoutActive={layoutActive}
                  singleRowMode={singleRowSequence}
                  maxFeatureRows={singleRowSequence ? 3 : undefined}
                  viewRange={viewRange}
                  showInFrameTranslationExtensions={showInFrameTranslationExtensions}
                  highlightMutagenicDnaBases={highlightMutagenicDnaBases}
                  onFeatureSelect={(id, extend) => {
                    onSelectAlignmentTrace(null)
                    onFeatureSelect(id, extend, null)
                  }}
                  onFeatureEdit={(id) => {
                    onSelectAlignmentTrace(null)
                    onFeatureEdit(id, null)
                  }}
                  onPrimerSelect={onPrimerSelect}
                  onRestrictionSelect={onRestrictionSelect}
                  onRestrictionHover={setHoveredRestrictionSiteKey}
                  onRangeSelect={(range, options) => onRangeSelect(range, {
                    ...options,
                    libraryMemberId: null,
                    sequenceLength: record.sequence.length,
                  })}
                  onExtendToBase={onExtendToBase}
                  onPrimerEdit={onPrimerEdit}
                  onEnzymeInfo={onEnzymeInfo}
                  onStatus={onStatus}
                />
              ),
            }] : []),
            ...libraryBrowseMembers.map((member) => {
              const prepared = libraryMemberViews.find((view) => view.member.id === member.id)
              const isFocused = selectedAlignmentTraceId === member.id
              return {
                key: member.id,
                title: member.fileName,
                meta: libraryMemberHeaderMeta(member),
                actions: (onFlipLibraryMember || onOpenLibraryMemberAsConstruct) ? (
                  <>
                    {onOpenLibraryMemberAsConstruct ? (
                      <button
                        type="button"
                        className="alignment-list-action"
                        title="Open this member as a single construct"
                        disabled={Boolean(member.parseError) || member.sequence.length === 0}
                        onClick={() => onOpenLibraryMemberAsConstruct(member.id)}
                      >
                        Open
                      </button>
                    ) : null}
                    {onFlipLibraryMember ? (
                      <button
                        type="button"
                        className="alignment-list-action"
                        title="Reverse-complement this member and realign to consensus"
                        onClick={() => onFlipLibraryMember(member.id)}
                      >
                        Flip
                      </button>
                    ) : null}
                  </>
                ) : undefined,
                body: prepared ? (
                  <PrimerRefinedSequenceRows
                    record={prepared.memberRecord}
                    refine={displaySettings.primers.visible && (
                      preparedLibraryMemberIds.has(member.id) || isFocused ||
                      (!libraryConsensusVisible && member.id === libraryBrowseMembers[0]?.id)
                    )}
                    motifHits={[]}
                    restrictionSites={prepared.restrictionSites}
                    primerFrameDisplays={prepared.primerFrameDisplays}
                    annotationFeatures={prepared.annotationFeatures}
                    orfTranslationByFeatureId={prepared.orfTranslations}
                    displaySettings={displaySettings}
                    enzymePreferences={enzymePreferences}
                    hoveredRestrictionSiteKey={null}
                    cutStrandSelection={null}
                    selectedRange={isFocused ? selectedRange : null}
                    selectedFeatureId={isFocused ? selectedFeatureId : null}
                    selectedFeatureIds={isFocused ? selectedFeatureIds : []}
                    selectedPrimerId={isFocused ? selectedPrimerId : null}
                    selectedPrimerIds={isFocused ? selectedPrimerIds : []}
                    selectedRestrictionSites={[]}
                    layoutActive={layoutActive}
                    singleRowMode={singleRowSequence}
                    maxFeatureRows={singleRowSequence ? 3 : undefined}
                    viewRange={null}
                    showInFrameTranslationExtensions={showInFrameTranslationExtensions}
                    highlightMutagenicDnaBases={false}
                    onFeatureSelect={(id, extend) => {
                      onSelectAlignmentTrace(member.id)
                      onFeatureSelect(id, extend, member.id)
                    }}
                    onFeatureEdit={(id) => {
                      onSelectAlignmentTrace(member.id)
                      onFeatureEdit(id, member.id)
                    }}
                    onPrimerSelect={(id, extend) => {
                      onSelectAlignmentTrace(member.id)
                      onPrimerSelect(id, extend, member.id)
                    }}
                    onRestrictionSelect={() => {}}
                    onRestrictionHover={() => {}}
                    onRangeSelect={(range, options) => onRangeSelect(range, {
                      ...options,
                      libraryMemberId: member.id,
                      sequenceLength: member.sequence.length,
                    })}
                    onPrimerEdit={(id) => {
                      onSelectAlignmentTrace(member.id)
                      onPrimerEdit(id, member.id)
                    }}
                    onEnzymeInfo={onEnzymeInfo}
                    onStatus={onStatus}
                  />
                ) : (
                  <div
                    className="library-sequence-block-placeholder"
                    style={{ height: libraryMemberBodyHeights.get(`${record.id}:${member.id}`)
                      ?? estimateLibraryMemberPlaceholderHeight(member.sequence.length) }}
                    aria-hidden="true"
                  />
                ),
              }
            }),
          ]}
        />
        </div>
      ) : (
        <SequenceRows
          record={record}
          motifHits={motifHits}
          motifQueryLength={motifQueryLength}
          restrictionSites={displayedRestrictionSites}
          primerFrameDisplays={thermodynamicPrimerFrameDisplays}
          annotationFeatures={displayAnnotationFeatures}
          orfTranslationByFeatureId={orfTranslationByFeatureId}
          displaySettings={displaySettings}
          enzymePreferences={enzymePreferences}
          hoveredRestrictionSiteKey={effectiveHoveredRestrictionSiteKey}
          cutStrandSelection={cutStrandSelection}
          selectedRange={selectedRange}
          selectedFeatureId={selectedFeatureId}
          selectedFeatureIds={selectedFeatureIds}
          selectedPrimerId={selectedPrimerId}
          selectedPrimerIds={selectedPrimerIds}
          selectedRestrictionSites={selectedRestrictionSites}
          layoutActive={layoutActive}
          singleRowMode={singleRowSequence}
          maxFeatureRows={singleRowSequence ? 3 : undefined}
          viewRange={viewRange}
          showInFrameTranslationExtensions={showInFrameTranslationExtensions}
          highlightMutagenicDnaBases={highlightMutagenicDnaBases}
          onFeatureSelect={onFeatureSelect}
          onFeatureEdit={onFeatureEdit}
          onPrimerSelect={onPrimerSelect}
          onRestrictionSelect={onRestrictionSelect}
          onRestrictionHover={setHoveredRestrictionSiteKey}
          onRangeSelect={onRangeSelect}
          onExtendToBase={onExtendToBase}
          onPrimerEdit={onPrimerEdit}
          onEnzymeInfo={onEnzymeInfo}
          onStatus={onStatus}
        />
      )}
    </div>
  )
}
