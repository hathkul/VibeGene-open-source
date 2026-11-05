import { Fragment, useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { enzymeLabelDisplayStyle, type EnzymePreferences } from '../../domain/enzymePreferences'
import { useEnzymeHoverTooltip } from '../map/useEnzymeHoverTooltip'
import { traceAnnotationSlotVisible } from '../../domain/traceAnnotationView'
import { type HorizontalBandsSnapshot } from '../../components/alignmentBandsTypes'
import { alignmentProfileEnabled, alignmentProfileMark, alignmentProfileMeasure, profileSync } from '../../domain/alignmentProfiler'
import { BELOW_FEATURE_LABEL_LINE_HEIGHT_PX, BELOW_FEATURE_LABEL_STACK_STEP_PX, compressBelowLabelBodyHeights, computeFloatingFeatureLabelPlacements } from '../../domain/sequenceFeatureLabels'
import { isFeatureNoColor } from '../../domain/featureAppearance'
import { computeVisibleTemplateRangeForMergedLayout, mergedLayoutContentWidthPx, mergedTemplateSpanPx, buildTraceSlotLookup, resolveTraceColumnAtMergedSlotFromLookup, traceBaseForColumn, isVariantErrorColumn, templateBoundaryAtMergedX, insertionGapLeftPx, templateIndexLeftPx, visibleMergedLayoutEntries, type MergedInsertionLayout } from '../../domain/traceDisplay'
import { type TraceTemplateAlignment } from '../../domain/traceTypes'
import { groupSgRNAFeatures, sgRnaCas12aIllustrativeCuts, sgRnaNominalCut } from '../../domain/sgrna'
import { SG_RNA_SEQUENCE_FRAME_BODY_HEIGHT_PX, SG_RNA_SEQUENCE_FRAME_CORNER_RADIUS_PX, SG_RNA_SEQUENCE_LANE_HEIGHT_PX, sgRnaForwardClearanceSpans, sgRnaGuidePamBoundaryBasePair, sgRnaGuidePamBoundaryX, sgRnaRowLaneHeightPx, sgRnaRowLanes, sgRnaSegmentsForRow, sgRnaSequenceFrameHorizontalBounds, sgRnaSequenceFrameTop, sgRnaSequenceNameLabelX, sgRnaSequenceNameLabelY, sgRnaSequenceShowsNameLabel, sgRnaSharedBoundaryFillPath, sgRnaSharedBoundaryOutlinePath, sgRnaVisualSegments } from '../../domain/sgrnaVisualLayout'
import { buildCdsTranslationByFeatureId, buildCdsTranslationRowGroups, buildIndexedTranslationCellsByGroup, type AnnotatedTranslationCell, type CdsTranslationRowGroup } from '../../domain/cdsTranslationFrame'
import { packSequenceRowFeatureAndReversePrimerPlacements, reversePrimerPlacementsAtSharedTops, sequenceRowVisibleBandHeights, sortTranslationCellsForRuler, translationCellsForRow, translationContiguousSpansOnRow, translationRulerRuns, type TranslationGroupPackInput } from '../../domain/sequencePaneTranslationLayout'
import { indexIntervalsBySequenceRow } from '../../domain/sequenceRowIntervalIndex'
import { featureTranslationExtensionSpans, formatAminoAcidCode, transcriptionStrandFromReadingFrame, translationCellDisplayFragments, type FeatureTranslationCell, type FeatureTranslationExtensionSpan } from '../../domain/geneticCode'
import { isOrfFeature } from '../../domain/orfPrediction'
import { aminoAcidInfo } from '../../domain/protein'
import { useTranslationCodonHover } from './useTranslationCodonHover'
import { useHorizontalRowHeight } from './useHorizontalRowHeight'
import { SequenceCutOverlay } from './SequenceCutOverlay'
import { formatEnzymeLabelName } from '../../domain/methylation'
import { recognitionPositions } from '../../domain/restrictionSiteFilters'
import { restrictionSiteCutsOutsideSequence } from '../../domain/enzymes'
import { sequenceEnzymeCalloutClassName, sequenceEnzymeLabelRows, isOutsideLinearSequence, recognitionHighlightClassFor } from './sequenceEnzymeLabels'
import { isPrimerCalloutSite, linearCutPosition } from '../../domain/mapLayout'
import { assignPrimerPlacementLanes, primerPackingRangeForRow as calculatePrimerPackingRange, reversePrimerFrameOffsets } from '../../domain/primerRowPlacement'
import { PRIMER_DISPLAY_ROWS, glyphY, primerFrameBackgroundFillPath, primerFrameBounds, primerFramePaths, primerFramePathsNeedBackgroundFill, primerFrameMetricsForDisplay, primerLaneStackHeight, primerLabelMetrics, primerLabelStackOverflow, primerFirstAnnealedTemplateIndex, primerGlyphX, primerGlyphVisibleInRow, primerVisualSpanForRow, templateX, type PrimerFrameDisplay } from '../../domain/primerSequenceLayout'
import { layoutSequenceRowChunk, offsetSequenceLabelCallout, sequenceRowLaneMetrics, type SequenceLabelCallout, type SequencePrimerClearanceSpan, type SequenceRowSegment } from '../../domain/sequenceLabelRouter'
import { featureDrawableSegments, featurePriority } from '../map'
import { cleavageArrowsOnSegment, contrastTextColor, darkThemePrimerColor, enzymeSiteCounts, featureDisplayName, measureTextWidthPx, openEnzymeInfoFromCalloutGroup, restrictionSiteFromCalloutClick, restrictionSiteIsSelected, siteKey, sgRnaVisualParts } from '../map/mapPrimitives'
import { CleavageArrowMark, EnzymeCalloutLabelText, SelectedMapCalloutLabel } from '../map/mapComponents'
import { strandColorAtPosition } from '../../domain/snapgeneStrandColors'
import { isDnaEndBaseVisible, resolveDnaEnds } from '../../domain/dnaEnds'
import { calculateAnnealTemperature } from '../../domain/primerThermodynamics'
import { complementDnaBase, extractRange, formatRange } from '../../domain/sequence'
import { type RestrictionSite, type SequenceFeature, type SequenceRecord } from '../../domain/types'
import {
  alignmentLabelChunkBasesPerRow,
  computeHorizontalVisibleRange,
  emptySequenceRowLabelLayout,
  inFrameExtensionSegmentId,
  inFrameWithLabel,
  inFrameLabelOffsets,
  isMobileShellViewport,
  measureSequenceRowLayout,
  resolveSequenceScrollHost,
  sequenceBaseFontPx,
  sequenceBaseLineHeight,
  sequenceFeatureArrowSizePx,
  sequenceFeatureBodyOutlinePath,
  sequenceLabelCollisionPx,
  sequenceEnzymeLabelFontSizePx,
  sequenceRulerHeightPx,
  sequenceFeatureArrowDirection,
  MOBILE_SEQUENCE_LAYOUT_MAX_WIDTH,
  sequenceRowEndIndexGapPx,
  sequenceRowEndIndexPx,
  sequenceRowElementAt,
  sequenceRowLayoutMetrics,
  sequenceTrackInsetPx,
  shiftSequenceRowScrollAnchor,
  captureSequenceRowScrollAnchor,
  type DnaColorPalette,
  type PrimerRowPlacement,
  type RestrictionSiteList,
  type SequenceRowScrollAnchor,
  type SelectionRange,
  type StrandPairSelection,
  type DisplaySettings,
} from './sequenceShared'
import {
  assignSequencePaneRowFeatureLanes,
  chunkSequence,
  formatThermoGc,
  formatThermoTemperature,
  isPositionInRange,
  selectionLength,
  thermoMethodLabel,
} from './sequenceRenderingHelpers'
import {
  estimateSequenceRowHeights,
  planSequenceVirtualWindowTransition,
  syncSequenceRowHeightFloors,
} from './sequenceRowVirtualization'
import { useTranslationDragSelection } from './useTranslationDragSelection'
import { useTranslationCopyAction } from './useTranslationCopyAction'

export function SequenceRows({
  record,
  motifHits,
  motifQueryLength = 0,
  restrictionSites,
  primerFrameDisplays,
  annotationFeatures,
  orfTranslationByFeatureId,
  translationByFeatureIdOverride,
  displaySettings,
  enzymePreferences,
  hoveredRestrictionSiteKey,
  cutStrandSelection,
  selectedRange,
  selectedFeatureId,
  selectedFeatureIds = [],
  selectedPrimerId,
  selectedPrimerIds = [],
  selectedRestrictionSites = [],
  layoutActive,
  onFeatureSelect,
  onFeatureEdit,
  onPrimerSelect,
  onRestrictionSelect,
  onRestrictionHover,
  onRangeSelect,
  onExtendToBase,
  onPrimerEdit,
  onEnzymeInfo,
  onStatus,
  horizontalMode = false,
  compactAlignmentAnnotations = false,
  horizontalViewport,
  horizontalVisibleRangeOverride = null,
  alignmentMergedLayout,
  onHorizontalBandsSnapshot,
  onHorizontalRowHeight,
  horizontalRenderFullSequence = false,
  singleRowMode = false,
  maxFeatureRows,
  alignmentTraceDisplay,
  viewRange = null,
  showInFrameTranslationExtensions = true,
  highlightMutagenicDnaBases = false,
}: {
  record: SequenceRecord
  motifHits: number[]
  /** Length of the active find-query match; used to paint the full hit, not only the start base. */
  motifQueryLength?: number
  restrictionSites: RestrictionSiteList
  primerFrameDisplays: PrimerFrameDisplay[]
  annotationFeatures: SequenceFeature[]
  orfTranslationByFeatureId?: Map<string, FeatureTranslationCell[]>
  /** When set (trace annotation rows), replaces reference-based CDS/ORF translation cells. */
  translationByFeatureIdOverride?: Map<string, FeatureTranslationCell[]>
  displaySettings: DisplaySettings
  enzymePreferences: EnzymePreferences
  hoveredRestrictionSiteKey: string | null
  cutStrandSelection: StrandPairSelection | null
  selectedRange: SelectionRange | null
  selectedFeatureId?: string | null
  selectedFeatureIds?: string[]
  selectedPrimerId: string | null
  selectedPrimerIds?: string[]
  selectedRestrictionSites?: RestrictionSite[]
  layoutActive: boolean
  onFeatureSelect: (id: string, extendSelection?: boolean) => void
  onFeatureEdit: (id: string) => void
  onPrimerSelect: (primerId: string, extendSelection?: boolean) => void
  onRestrictionSelect: (site: RestrictionSite, extendSelection?: boolean) => void
  onRestrictionHover: (siteKey: string | null) => void
  onRangeSelect: (range: SelectionRange, options?: { collapsed?: boolean; isExtend?: boolean }) => void
  onExtendToBase?: (position: number) => void
  onPrimerEdit: (primerId: string) => void
  onEnzymeInfo: (enzymeName: string) => void
  onStatus?: (message: string) => void
  horizontalMode?: boolean
  /** Pack only the visible part of an annotated library member's horizontal row. */
  compactAlignmentAnnotations?: boolean
  horizontalViewport?: { scrollLeft: number; width: number }
  /** Expand-only virt window while alignment scrollbar is dragged (avoids remount jerks). */
  horizontalVisibleRangeOverride?: { start: number; end: number } | null
  alignmentMergedLayout?: MergedInsertionLayout
  onHorizontalBandsSnapshot?: (snapshot: HorizontalBandsSnapshot) => void
  onHorizontalRowHeight?: (heightPx: number) => void
  /** Trace reads are short; render the full horizontal row without viewport culling. */
  horizontalRenderFullSequence?: boolean
  /** Keep a focused view range in one ordinary sequence row, with horizontal overflow. */
  singleRowMode?: boolean
  /** Cap the visible annotation band in compact previews. */
  maxFeatureRows?: number
  /** When set with alignmentMergedLayout, render trace read bases in template alignment columns. */
  alignmentTraceDisplay?: {
    alignment: TraceTemplateAlignment
    baseCalls: string[]
  }
  /**
   * Magnifier zoom window (absolute half-open bp). When set, only this substring is
   * chunked into rows; row offsets stay absolute so selections/labels stay consistent.
   * Ignored in horizontal/alignment mode.
   */
  viewRange?: SelectionRange | null
  /** Dashed “(in frame with …)” continuation overlays past annotated CDS ends. */
  showInFrameTranslationExtensions?: boolean
  /** Paint mismatch/template-gap DNA bases red (Mutagenesis preview only). */
  highlightMutagenicDnaBases?: boolean
}) {
  const virtualRowEstimatePx = 160
  const sgRnaParts = useMemo(() => sgRnaVisualParts(annotationFeatures), [annotationFeatures])
  const sgRnaSegments = useMemo(
    () => sgRnaVisualSegments(groupSgRNAFeatures(annotationFeatures), record.sequence),
    [annotationFeatures, record.sequence],
  )
  const virtualRowOverscan = 4
  const aminoAcidCodeFormat = displaySettings.sequenceView?.aminoAcidCodeFormat ?? 'one-letter'
  const threeLetterAminoAcids = aminoAcidCodeFormat === 'three-letter'
  const sequenceVisual = displaySettings.sequenceVisual ?? {
    panelOpen: false,
    sequenceFontSizePx: 14,
    sequenceFontWeight: 500,
    sequenceBaseSpacingPx: 10,
    enzymeLabelFontSizePx: 12,
    enzymeFontWeight: 400,
    uniqueEnzymeFontWeight: 700,
    primerLabelFontSizePx: 12,
    primerLabelFontWeight: 500,
    featureBodyFontSizePx: 12,
    featureBodyFontWeight: 400,
    featureBodyFrame: true,
    translationFontSizePx: 12,
    translationFontWeight: 500,
  }
  const sequenceFontSizePx = sequenceVisual.sequenceFontSizePx ?? sequenceBaseFontPx
  const sequenceFontWeight = sequenceVisual.sequenceFontWeight ?? 500
  // Shadow module default so all SequenceRows layout uses the live spacing control.
  const sequenceBaseStepPx = Math.max(6, Math.min(20, sequenceVisual.sequenceBaseSpacingPx ?? 10))
  const enzymeLabelFontSizePx = sequenceVisual.enzymeLabelFontSizePx ?? sequenceEnzymeLabelFontSizePx
  const enzymeFontWeight = sequenceVisual.enzymeFontWeight ?? 400
  const uniqueEnzymeFontWeight = sequenceVisual.uniqueEnzymeFontWeight ?? 700
  const primerLabelFontSizePx = sequenceVisual.primerLabelFontSizePx ?? 12
  const primerLabelFontWeight = sequenceVisual.primerLabelFontWeight ?? 500
  const featureBodyFontSizePx = sequenceVisual.featureBodyFontSizePx ?? 12
  const featureBodyFontWeight = sequenceVisual.featureBodyFontWeight ?? 400
  const featureBodyFrame = sequenceVisual.featureBodyFrame !== false
  const translationFontSizePx = sequenceVisual.translationFontSizePx ?? 12
  const translationFontWeight = sequenceVisual.translationFontWeight ?? 500
  // Baked-in vertical gap between the translation ruler and amino acids (px). Negative pulls the AAs
  // closer to the ruler. Tuned to -6 after in-app review.
  const translationRulerGapPx = -6
  const featureLaneStepPx = Math.max(18, featureBodyFontSizePx + 8, translationFontSizePx + 8)
  const featureBodyHeightPx = Math.max(16, featureBodyFontSizePx + 6)
  const translationAaHeightPx = Math.max(14, translationFontSizePx + 6)
  // Ruler row (14px) + adjustable ruler-to-AA gap + translation-block margin-bottom (2px).
  const translationBlockHeightPx = translationAaHeightPx + 16 + translationRulerGapPx
  const sequenceStrandRowHeightPx = sequenceFontSizePx * sequenceBaseLineHeight
  const enzymeLabelFont = `${enzymeLabelFontSizePx}px system-ui, "Segoe UI", Roboto, sans-serif`
  const sequenceVisualStyle = {
    '--sequence-font-size': `${sequenceFontSizePx}px`,
    '--sequence-font-weight': String(sequenceFontWeight),
    '--base-step': `${sequenceBaseStepPx}px`,
    '--enzyme-label-font-size': `${enzymeLabelFontSizePx}px`,
    '--enzyme-label-font-weight': String(enzymeFontWeight),
    '--unique-enzyme-label-font-weight': String(uniqueEnzymeFontWeight),
    '--primer-label-font-size': `${primerLabelFontSizePx}px`,
    '--primer-label-font-weight': String(primerLabelFontWeight),
    '--feature-body-font-size': `${featureBodyFontSizePx}px`,
    '--feature-body-font-weight': String(featureBodyFontWeight),
    '--feature-lane-step': `${featureLaneStepPx}px`,
    '--feature-body-height': `${featureBodyHeightPx}px`,
    '--translation-font-size': `${translationFontSizePx}px`,
    '--translation-font-weight': String(translationFontWeight),
    '--translation-aa-height': `${translationAaHeightPx}px`,
    '--translation-ruler-gap': `${translationRulerGapPx}px`,
  } as CSSProperties
  const linearDnaEnds = record.topology === 'linear' ? resolveDnaEnds(record) : null
  const [translationContextMenu, setTranslationContextMenu] = useState<{
    x: number
    y: number
    featureId: string
  } | null>(null)
  const [translationAaAnchor, setTranslationAaAnchor] = useState<{
    featureId: string
    number: number
    position0: number
  } | null>(null)
  const [hoveredFeatureId, setHoveredFeatureId] = useState<string | null>(null)
  const [hoveredTranslationCodon, setHoveredTranslationCodon] = useTranslationCodonHover()
  const [hoveredSgRnaId, setHoveredSgRnaId] = useState<string | null>(null)
  const translationContextMenuRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const alignmentProfileScope = useId().replace(/:/g, '')
  const dragMovedRef = useRef(false)
  const extendSelectionRef = useRef(false)
  const dragOriginClientRef = useRef<{ x: number; y: number } | null>(null)
  /** Latest pointer client coords while a sequence drag is active (for edge auto-scroll). */
  const dragClientRef = useRef<{ x: number; y: number } | null>(null)
  const autoScrollRafRef = useRef(0)
  const tickSelectionAutoScrollRef = useRef<() => void>(() => {})
  const [basesPerRow, setBasesPerRow] = useState(90)
  const [alignmentCaretEdge, setAlignmentCaretEdge] = useState<{ boundary: number; edge: 'left' | 'right' } | null>(null)
  // The caret edge is pointer-only state; clear it when the controlled range changes externally.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize this ephemeral pointer detail with its controlled selection.
    setAlignmentCaretEdge((current) => current && selectedRange?.start === current.boundary && selectedRange.end === current.boundary ? current : null)
  }, [selectedRange?.start, selectedRange?.end])
  const [sequenceContentWidthPx, setSequenceContentWidthPx] = useState(956)
  const [compactRowLayout, setCompactRowLayout] = useState(false)
  const [fontMetricsEpoch, setFontMetricsEpoch] = useState(0)
  const [virtualRowWindow, setVirtualRowWindow] = useState({ start: 0, end: 18 })
  const translationDrag = useTranslationDragSelection({
    containerRef,
    translationAaAnchor,
    setTranslationAaAnchor,
    onRangeSelect,
    topology: record.topology,
    sequenceLength: record.sequence.length,
  })
  const sequenceLabelDebugCut = useMemo(() => {
    if (typeof window === 'undefined') return NaN
    const raw = new URLSearchParams(window.location.search).get('sequenceLabelDebug')
    if (raw === null || raw === '') return NaN
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : NaN
  }, [])
  const layoutMetrics = useMemo(
    () => sequenceRowLayoutMetrics(compactRowLayout && !horizontalMode),
    [compactRowLayout, horizontalMode],
  )
  const rowTrackInsetPx = horizontalMode ? sequenceTrackInsetPx : layoutMetrics.trackInsetPx
  const rowEndIndexWidthPx = horizontalMode ? sequenceRowEndIndexPx : layoutMetrics.endIndexPx
  const rowEndIndexGapPx = horizontalMode ? sequenceRowEndIndexGapPx : layoutMetrics.endIndexGapPx
  // Magnifier crop (sequence pane only — not used in horizontal/alignment mode).
  const viewStart = !horizontalMode && viewRange ? viewRange.start : 0
  const viewEnd = !horizontalMode && viewRange ? viewRange.end : record.sequence.length
  const viewLength = Math.max(0, viewEnd - viewStart)
  const displayBasesPerRow = horizontalMode
    ? Math.max(1, record.sequence.length)
    : singleRowMode
      ? Math.max(1, viewLength)
      : basesPerRow
  const displaySequence = useMemo(() => {
    if (horizontalMode || !viewRange) return record.sequence
    return record.sequence.slice(viewStart, viewEnd)
  }, [horizontalMode, record.sequence, viewEnd, viewRange, viewStart])
  const labelRouterBasesPerRow = useMemo(() => {
    if (!horizontalMode) return basesPerRow
    const viewportWidth = horizontalViewport?.width ?? 800
    return measureSequenceRowLayout(viewportWidth, sequenceBaseStepPx)?.basesPerRow ?? alignmentLabelChunkBasesPerRow
  }, [basesPerRow, horizontalMode, horizontalViewport?.width, sequenceBaseStepPx])
  const alignmentLabelJointBeltBp = 40
  const horizontalVisibleRange = useMemo(() => {
    if (!horizontalMode) return { start: 0, end: record.sequence.length }
    if (horizontalRenderFullSequence) {
      return { start: 0, end: record.sequence.length }
    }
    const viewport = horizontalViewport ?? { scrollLeft: 0, width: 800 }
    const computed = alignmentMergedLayout
      ? computeVisibleTemplateRangeForMergedLayout(
          alignmentMergedLayout,
          viewport.scrollLeft,
          viewport.width,
        )
      : computeHorizontalVisibleRange(
          viewport.scrollLeft,
          viewport.width,
          record.sequence.length,
          sequenceBaseStepPx,
        )
    // While the alignment scrollbar is dragged, keep an expand-only window so leading
    // virtualized DOM is not removed (WebKit scroll-anchoring jerks by ~one viewport).
    if (horizontalVisibleRangeOverride) {
      return {
        start: Math.min(horizontalVisibleRangeOverride.start, computed.start),
        end: Math.max(horizontalVisibleRangeOverride.end, computed.end),
      }
    }
    return computed
  }, [
    alignmentMergedLayout,
    horizontalMode,
    horizontalRenderFullSequence,
    horizontalViewport,
    horizontalVisibleRangeOverride,
    record.sequence.length,
    sequenceBaseStepPx,
  ])
  // Member annotations are packed for the visible region, rather than reserving
  // lanes for unrelated features elsewhere on the full-length alignment row.
  const memberAnnotationRange = useMemo(() => horizontalMode && compactAlignmentAnnotations && alignmentTraceDisplay
    ? { start: Math.max(0, horizontalVisibleRange.start - 20), end: Math.min(record.sequence.length, horizontalVisibleRange.end + 20) }
    : null, [alignmentTraceDisplay, compactAlignmentAnnotations, horizontalMode, horizontalVisibleRange.start, horizontalVisibleRange.end, record.sequence.length])
  const useAlignmentMergedLayout = horizontalMode && alignmentMergedLayout
  const alignmentTraceLookup = useMemo(
    () => (alignmentTraceDisplay ? buildTraceSlotLookup(alignmentTraceDisplay.alignment) : null),
    [alignmentTraceDisplay],
  )
  const alignmentVisibleEntries = useMemo(() => {
    if (!useAlignmentMergedLayout || !alignmentMergedLayout) return null
    return profileSync(
      'visibleMergedLayoutEntries',
      'sequence-rows',
      () =>
        visibleMergedLayoutEntries(
          alignmentMergedLayout,
          horizontalVisibleRange.start,
          horizontalVisibleRange.end,
        ),
      `${horizontalVisibleRange.start}-${horizontalVisibleRange.end}`,
    )
  }, [
    alignmentMergedLayout,
    horizontalVisibleRange.end,
    horizontalVisibleRange.start,
    useAlignmentMergedLayout,
  ])
  const rows = useMemo(
    () =>
      profileSync(
        'chunkSequence',
        'sequence-rows',
        () => chunkSequence(displaySequence, displayBasesPerRow),
        `${displaySequence.length} bp`,
      ),
    [displayBasesPerRow, displaySequence],
  )
  const labelRowSegments = useMemo((): SequenceRowSegment[] => {
    const spanLength = horizontalMode ? record.sequence.length : viewLength
    const spanStart = horizontalMode ? 0 : viewStart
    const rowCount = Math.ceil(spanLength / Math.max(1, labelRouterBasesPerRow))
    return Array.from({ length: rowCount }, (_, rowIndex) => {
      const rowStart = spanStart + rowIndex * labelRouterBasesPerRow
      const rowLength = Math.min(labelRouterBasesPerRow, spanStart + spanLength - rowStart)
      return { rowStart, rowLength }
    })
  }, [horizontalMode, labelRouterBasesPerRow, record.sequence.length, viewLength, viewStart])
  const hitSet = useMemo(() => {
    const queryLen = Math.max(0, motifQueryLength)
    if (queryLen <= 1) return new Set(motifHits)
    const positions = new Set<number>()
    for (const start of motifHits) {
      for (let offset = 0; offset < queryLen; offset += 1) {
        positions.add(start + offset)
      }
    }
    return positions
  }, [motifHits, motifQueryLength])
  const mutagenicDnaPositions = useMemo(() => {
    if (!highlightMutagenicDnaBases) return new Set<number>()
    const positions = new Set<number>()
    for (const display of primerFrameDisplays) {
      for (const glyph of display.glyphs) {
        if (glyph.templateIndex === undefined) continue
        if (glyph.kind === 'mismatch' || glyph.kind === 'template-gap') {
          positions.add(glyph.templateIndex)
        }
      }
    }
    return positions
  }, [highlightMutagenicDnaBases, primerFrameDisplays])
  const enzymeCounts = useMemo(() => enzymeSiteCounts(restrictionSites), [restrictionSites])
  const enzymeTooltip = useEnzymeHoverTooltip()
  const featureSegments = useMemo(
    () =>
      profileSync(
        'featureDrawableSegments',
        'sequence-rows',
        () => featureDrawableSegments(annotationFeatures.filter((feature) => !sgRnaParts.has(feature.id)), record.sequence.length),
        `${annotationFeatures.length} features`,
      ),
    [annotationFeatures, record.sequence.length, sgRnaParts],
  )
  const translationByFeatureId = useMemo(() => {
    if (translationByFeatureIdOverride) return translationByFeatureIdOverride
    const map = buildCdsTranslationByFeatureId(
      annotationFeatures.filter((feature) => !isOrfFeature(feature)),
      record.sequence,
      record.topology,
    )
    orfTranslationByFeatureId?.forEach((cells, featureId) => {
      map.set(featureId, cells)
    })
    return map
  }, [annotationFeatures, orfTranslationByFeatureId, record.sequence, record.topology, translationByFeatureIdOverride])

  const annotationFeatureById = useMemo(
    () => new Map(annotationFeatures.map((feature) => [feature.id, feature])),
    [annotationFeatures],
  )
  const cdsInFrameExtensionsByFeatureId = useMemo(() => {
    const map = new Map<string, FeatureTranslationExtensionSpan[]>()
    if (!showInFrameTranslationExtensions) return map
    annotationFeatures
      .filter((feature) => feature.translateInSequenceView && feature.translation && !isOrfFeature(feature))
      .forEach((feature) => {
        const cells = translationByFeatureId.get(feature.id)
        if (!cells?.length) return
        const spans = featureTranslationExtensionSpans(feature, cells, record.sequence.length)
        if (spans.length) map.set(feature.id, spans)
      })
    return map
  }, [annotationFeatures, record.sequence.length, showInFrameTranslationExtensions, translationByFeatureId])

  useEffect(() => {
    if (!translationContextMenu) return
    function dismissPointer(event: PointerEvent) {
      if (translationContextMenuRef.current?.contains(event.target as Node)) return
      setTranslationContextMenu(null)
    }
    function dismissScroll(event: Event) {
      // Internal layout reconciliation dispatches synthetic scroll events while
      // row geometry settles. Only a user scroll should dismiss this menu.
      if (!event.isTrusted) return
      setTranslationContextMenu(null)
    }
    function dismissKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setTranslationContextMenu(null)
    }
    window.addEventListener('pointerdown', dismissPointer)
    window.addEventListener('keydown', dismissKey)
    window.addEventListener('scroll', dismissScroll, true)
    return () => {
      window.removeEventListener('pointerdown', dismissPointer)
      window.removeEventListener('keydown', dismissKey)
      window.removeEventListener('scroll', dismissScroll, true)
    }
  }, [translationContextMenu])

  useLayoutEffect(() => {
    if (!translationContextMenu) return
    const menu = translationContextMenuRef.current
    if (!menu) return
    const viewport = window.visualViewport
    const viewWidth = viewport?.width ?? window.innerWidth
    const viewHeight = viewport?.height ?? window.innerHeight
    const offsetLeft = viewport?.offsetLeft ?? 0
    const offsetTop = viewport?.offsetTop ?? 0
    const rect = menu.getBoundingClientRect()
    const inset = 8
    let x = translationContextMenu.x
    let y = translationContextMenu.y
    if (x + rect.width > offsetLeft + viewWidth - inset) {
      x = offsetLeft + viewWidth - rect.width - inset
    }
    if (y + rect.height > offsetTop + viewHeight - inset) {
      y = offsetTop + viewHeight - rect.height - inset
    }
    if (x < offsetLeft + inset) x = offsetLeft + inset
    if (y < offsetTop + inset) y = offsetTop + inset
    if (x === translationContextMenu.x && y === translationContextMenu.y) return
    setTranslationContextMenu({ ...translationContextMenu, x, y })
  }, [translationContextMenu])

  function openTranslationContextMenu(event: React.MouseEvent, featureId: string) {
    event.preventDefault()
    event.stopPropagation()
    if (!translationByFeatureId.get(featureId)?.length) return
    setTranslationContextMenu({ x: event.clientX, y: event.clientY, featureId })
  }

  const translationRowGroups = useMemo(
    () =>
      buildCdsTranslationRowGroups(annotationFeatures.filter((feature) => !isOrfFeature(feature))).filter((group) =>
        group.features.some((feature) => translationByFeatureId.has(feature.id)),
      ),
    [annotationFeatures, translationByFeatureId],
  )
  const indexedTranslationCellsByGroup = useMemo(
    () => buildIndexedTranslationCellsByGroup(translationRowGroups, translationByFeatureId),
    [translationRowGroups, translationByFeatureId],
  )

  const copyFeatureTranslation = useTranslationCopyAction({
    translationByFeatureId,
    translationRowGroups,
    annotationFeatures,
    selectedRange,
    hasCutStrandSelection: Boolean(cutStrandSelection),
    onStatus,
    onCopied: () => setTranslationContextMenu(null),
  })
  const translationGroupsForRow = useCallback(
    (rowStart: number, rowEnd: number): TranslationGroupPackInput[] => {
      if (!displaySettings.features.visible || !indexedTranslationCellsByGroup.length) return []
      return indexedTranslationCellsByGroup.flatMap(({ group, cells }) => {
        const rowCells = translationCellsForRow(cells, rowStart, rowEnd)
        const ranges = translationContiguousSpansOnRow(rowCells, rowStart, rowEnd)
        if (!ranges.length) return []
        return [
          {
            id: group.id,
            featureIds: group.features.map((feature) => feature.id),
            ranges,
          },
        ]
      })
    },
    [displaySettings.features.visible, indexedTranslationCellsByGroup],
  )
  const [dragStart, setDragStart] = useState<number | null>(null)
  const dragStartRef = useRef<number | null>(null)
  const dragEndRef = useRef<number | null>(null)
  const [baseHover, setBaseHover] = useState<{
    x: number
    y: number
    position: number
    strand: 'forward' | 'reverse'
  } | null>(null)
  const hoverFrameRef = useRef<number | null>(null)
  const hoverPendingRef = useRef<{
    x: number
    y: number
    position: number
    strand: 'forward' | 'reverse'
  } | null>(null)
  const hoveredSite = useMemo(
    () => restrictionSites.find((site) => siteKey(site) === hoveredRestrictionSiteKey) ?? null,
    [hoveredRestrictionSiteKey, restrictionSites],
  )
  const hoveredEnzymeName =
    hoveredSite && !isPrimerCalloutSite(hoveredSite) ? hoveredSite.enzyme.name : null
  const hoveredRecognitionPositions = useMemo(() => {
    if (!hoveredSite || isPrimerCalloutSite(hoveredSite)) return null
    return recognitionPositions([hoveredSite], record.sequence.length, record.topology)
  }, [hoveredSite, record.sequence.length, record.topology])
  const recognitionHighlightPositions = useMemo(() => {
    if (!hoveredEnzymeName) return null
    return recognitionPositions(
      restrictionSites.filter((site) => !isPrimerCalloutSite(site) && site.enzyme.name === hoveredEnzymeName),
      record.sequence.length,
      record.topology,
    )
  }, [hoveredEnzymeName, record.sequence.length, record.topology, restrictionSites])
  const hoveredEnzymeStackId = useMemo(() => {
    if (!hoveredSite || isPrimerCalloutSite(hoveredSite)) return null
    return `cut-${linearCutPosition(hoveredSite)}`
  }, [hoveredSite])
  const sequenceWidthPx = sequenceContentWidthPx
  const selectedSequenceThermo = useMemo(() => {
    if (!selectedRange || cutStrandSelection || selectedRange.start === selectedRange.end) return null
    const selectionSequence = extractRange(record.sequence, selectedRange.start, selectedRange.end)
    return calculateAnnealTemperature(selectionSequence)
  }, [cutStrandSelection, record.sequence, selectedRange])

  const cutFragmentLengthBp = useMemo(() => {
    if (!cutStrandSelection) return null
    const seqLen = record.sequence.length
    const spanLength = (range: SelectionRange) =>
      range.end >= range.start ? range.end - range.start : seqLen - range.start + range.end
    const topSpan = spanLength(cutStrandSelection.forward)
    const bottomSpan = spanLength(cutStrandSelection.reverse)
    // Single-site cut anchors span a single base on each strand; only real fragments get a length.
    if (topSpan <= 1 && bottomSpan <= 1) return null
    return Math.max(topSpan, bottomSpan)
  }, [cutStrandSelection, record.sequence.length])

  const primersVisible = displaySettings.primers.visible

  function scheduleBaseHover(
    next: {
      x: number
      y: number
      position: number
      strand: 'forward' | 'reverse'
    } | null,
  ) {
    hoverPendingRef.current = next
    if (hoverFrameRef.current !== null) return
    hoverFrameRef.current = window.requestAnimationFrame(() => {
      hoverFrameRef.current = null
      const pending = hoverPendingRef.current
      setBaseHover((current) => {
        if (!pending) return current === null ? current : null
        if (current && current.position === pending.position && current.strand === pending.strand && current.x === pending.x && current.y === pending.y) {
          return current
        }
        return pending
      })
    })
  }

  useEffect(() => () => {
    if (hoverFrameRef.current !== null) {
      window.cancelAnimationFrame(hoverFrameRef.current)
      hoverFrameRef.current = null
    }
  }, [])

  const mergedPrimerLayoutCoords = useCallback(
    (rowSequenceWidthPx: number) => {
      if (!useAlignmentMergedLayout || !alignmentMergedLayout) return undefined
      return {
        templateCenterX: (templateIndex: number) =>
          templateIndexLeftPx(alignmentMergedLayout, templateIndex) + sequenceBaseStepPx / 2,
        trackWidthPx: rowSequenceWidthPx,
      }
    },
    [useAlignmentMergedLayout, alignmentMergedLayout, sequenceBaseStepPx],
  )

  const primerSpanForRow = useCallback(
    (display: PrimerFrameDisplay, rowStart: number, rowEnd: number): { left: number; right: number } => {
      const layout = mergedPrimerLayoutCoords(
        (rowEnd - rowStart) * sequenceBaseStepPx + rowTrackInsetPx * 2,
      )
      const span = primerVisualSpanForRow(
        display,
        rowStart,
        rowEnd,
        display.strand === 'reverse' && !useAlignmentMergedLayout ? 0 : rowTrackInsetPx,
        sequenceBaseStepPx,
        layout,
      )
      if (span) return span
      if (useAlignmentMergedLayout && alignmentMergedLayout) {
        const spanStart = Math.max(rowStart, display.templateSpanStart)
        const spanEnd = Math.min(rowEnd, display.templateSpanEnd)
        if (spanEnd <= spanStart) return { left: 0, right: 0 }
        return {
          left: templateIndexLeftPx(alignmentMergedLayout, spanStart),
          right: templateIndexLeftPx(alignmentMergedLayout, spanEnd - 1) + sequenceBaseStepPx,
        }
      }
      return { left: 0, right: 0 }
    },
    [mergedPrimerLayoutCoords, rowTrackInsetPx, sequenceBaseStepPx, useAlignmentMergedLayout, alignmentMergedLayout],
  )

  const primerPackingRangeForRow = useCallback((placement: PrimerRowPlacement, rowStart: number, rowEnd: number) => {
    // Reverse primer frames use the sequence track's zero-based SVG coordinate
    // system in ordinary sequence view. The normal 28px track inset belongs to
    // the base/feature layers and must not be subtracted from reverse frames.
    const frameInset = useAlignmentMergedLayout ? rowTrackInsetPx : 0
    return calculatePrimerPackingRange(placement.left, placement.right, rowStart, rowEnd, sequenceBaseStepPx, frameInset)
  }, [rowTrackInsetPx, sequenceBaseStepPx, useAlignmentMergedLayout])

  const reversePrimerPlacementsWithPackingRanges = useCallback((
    placements: readonly PrimerRowPlacement[],
    rowStart: number,
    rowEnd: number,
  ) => {
    return placements.map((placement) => {
      const range = primerPackingRangeForRow(placement, rowStart, rowEnd)
      return { ...placement, packingStart: range.start, packingEnd: range.end }
    })
  }, [primerPackingRangeForRow])

  function mapTraceAnnotationBase(
    base: string,
    position: number,
    mapBase: (base: string, position: number) => string,
  ) {
    if (base === '-' || base === '·') return base
    return mapBase(base, position)
  }

  function alignmentBaseClassName(presentationClassName: string, extra = '') {
    return ['sequence-base', presentationClassName, extra].filter(Boolean).join(' ')
  }

  const assignPrimerRows = useCallback((
    displays: PrimerFrameDisplay[],
    rowStart: number,
    rowEnd: number,
    strand: 'forward' | 'reverse',
    candidates: PrimerFrameDisplay[] = displays,
  ) => {
    const placements = candidates
      .filter((display) => display.strand === strand && display.templateSpanEnd > rowStart && display.templateSpanStart < rowEnd)
      .map((display) => ({ display, ...primerSpanForRow(display, rowStart, rowEnd) }))
      .map((placement) => {
        const metrics = primerFrameMetricsForDisplay(placement.display, sequenceFontSizePx, sequenceBaseLineHeight)
        // Reverse arrows hang below the frame (unlike forward arrows which rise into the
        // reserved label band). Reserve that overhang so flaps are not cropped by the row
        // divider and do not collide with a lower reverse primer's name.
        const showArrow =
          strand === 'forward'
            ? placement.display.templateSpanEnd <= rowEnd
            : placement.display.templateSpanStart >= rowStart
        const baseStackHeight = primerLaneStackHeight(metrics, {
          reverseArrow: strand === 'reverse' && showArrow,
          reverseLabelBelow: strand === 'reverse',
        })
        const bounds = primerFrameBounds(
          placement.display,
          rowStart,
          rowEnd - rowStart,
          strand === 'reverse' && !useAlignmentMergedLayout ? 0 : rowTrackInsetPx,
          sequenceBaseStepPx,
          metrics,
          strand,
          {
            layout: mergedPrimerLayoutCoords((rowEnd - rowStart) * sequenceBaseStepPx + rowTrackInsetPx * 2),
            showArrow,
            labelFontSizePx: primerLabelFontSizePx,
          },
        )
        const firstAnnealedIndex = primerFirstAnnealedTemplateIndex(placement.display)
        const showName = firstAnnealedIndex !== undefined && firstAnnealedIndex >= rowStart && firstAnnealedIndex < rowEnd
        const labelOverflow = bounds && showName
          ? primerLabelStackOverflow(
              bounds,
              primerLabelMetrics(placement.display.name, primerLabelFontSizePx),
              strand,
              baseStackHeight,
            )
          : 0
        return {
          ...placement,
          // Forward labels that are raised by internal mismatches use the
          // space between this lane and the lane above it. Keeping that
          // overflow out of the primer's own lane keeps its body anchored to
          // the sequence. Reverse labels remain inside their own lane.
          stackHeight: baseStackHeight + (strand === 'reverse' ? labelOverflow : 0),
          labelOverflow,
        }
      })
    return assignPrimerPlacementLanes(placements, strand, sequenceBaseStepPx, primerLabelFontSizePx)
  }, [mergedPrimerLayoutCoords, primerSpanForRow, primerLabelFontSizePx, rowTrackInsetPx, sequenceBaseStepPx, sequenceFontSizePx, useAlignmentMergedLayout])

  function primerStrandLaneHeight(placements: PrimerRowPlacement[]) {
    if (!placements.length) return 0
    return placements.reduce((max, placement) => Math.max(max, placement.yOffset + placement.stackHeight), 0)
  }

  const rowSegments = useMemo(
    () =>
      rows.map((row, rowIndex) => ({
        rowStart: viewStart + rowIndex * displayBasesPerRow,
        rowLength: row.length,
      })),
    [displayBasesPerRow, rows, viewStart],
  )
  const [virtualRowWindowOwner, setVirtualRowWindowOwner] = useState({
    spanKey: `${record.sequence.length}|${viewEnd}|${viewStart}`,
    rowCount: rowSegments.length,
    layoutActive,
    horizontalMode,
  })
  const featureSegmentsByRow = useMemo(
    () => indexIntervalsBySequenceRow(featureSegments, rowSegments, (segment) => segment),
    [featureSegments, rowSegments],
  )
  const primerDisplaysBySequenceRow = useMemo(
    () => indexIntervalsBySequenceRow(primerFrameDisplays, rowSegments, (display) => ({
      start: display.templateSpanStart,
      end: display.templateSpanEnd,
    })),
    [primerFrameDisplays, rowSegments],
  )
  const primerDisplaysByLabelRow = useMemo(
    () => indexIntervalsBySequenceRow(primerFrameDisplays, labelRowSegments, (display) => ({
      start: display.templateSpanStart,
      end: display.templateSpanEnd,
    })),
    [labelRowSegments, primerFrameDisplays],
  )
  const sgRnaLanesByRow = useMemo(() => new Map(rowSegments.map((row, index) => {
    const start = memberAnnotationRange?.start ?? row.rowStart
    const end = memberAnnotationRange?.end ?? row.rowStart + row.rowLength
    const forward = sgRnaSegmentsForRow(sgRnaSegments, start, end, 'forward')
    const reverse = sgRnaSegmentsForRow(sgRnaSegments, start, end, 'reverse')
    return [index, { forward, reverse, forwardLanes: sgRnaRowLanes(forward), reverseLanes: sgRnaRowLanes(reverse) }]
  })), [memberAnnotationRange, rowSegments, sgRnaSegments])

  const rowFeatureBandHeightByRow = useMemo(
    () =>
      profileSync('rowFeatureBandHeightByRow', 'sequence-rows', () =>
        rowSegments.map((segment, rowIndex) => {
          const layoutStart = memberAnnotationRange?.start ?? segment.rowStart
          const rowEnd = memberAnnotationRange?.end ?? segment.rowStart + segment.rowLength
          const translationGroups = displaySettings.features.visible ? indexedTranslationCellsByGroup.flatMap(({ group, cells }) => {
            const rowCells = translationCellsForRow(cells, layoutStart, rowEnd)
            const ranges = translationContiguousSpansOnRow(rowCells, layoutStart, rowEnd)
            if (!ranges.length) return []
            return [
              {
                id: group.id,
                featureIds: group.features.map((feature) => feature.id),
                ranges,
              },
            ]
          }) : []
          const rowFeatures = displaySettings.features.visible ? assignSequencePaneRowFeatureLanes(
            layoutStart,
            rowEnd,
            featureSegments,
            cdsInFrameExtensionsByFeatureId,
            annotationFeatureById,
            undefined,
            featureSegmentsByRow[rowIndex] ?? [],
          ) : []
          const featureToGroupId = new Map<string, string>()
          translationGroups.forEach((group) => {
            group.featureIds.forEach((featureId) => {
              if (!featureToGroupId.has(featureId)) featureToGroupId.set(featureId, group.id)
            })
          })
          const translatedBandHeight = translationBlockHeightPx + featureLaneStepPx
          const bandItems = [
            ...translationGroups.map((group) => ({
              id: `tg:${group.id}`,
              ranges: group.ranges,
              height: translatedBandHeight,
              priority: -1000,
            })),
            ...rowFeatures
              .filter((entry) => !featureToGroupId.has(entry.feature.id))
              .map((entry) => ({
                id: entry.segmentId,
                ranges: [{ start: entry.start, end: entry.end }],
                height: featureLaneStepPx,
                priority: featurePriority(entry.feature.type),
              })),
          ]
          const reversePlacements = primersVisible
            ? assignPrimerRows(
                primerFrameDisplays,
                segment.rowStart,
                rowEnd,
                'reverse',
                (primerDisplaysBySequenceRow[rowIndex] ?? []).filter((display) => !memberAnnotationRange || (display.templateSpanEnd > layoutStart && display.templateSpanStart < rowEnd)),
              )
            : []
          const layout = packSequenceRowFeatureAndReversePrimerPlacements(
            bandItems,
            reversePrimerPlacementsWithPackingRanges(reversePlacements, segment.rowStart, rowEnd),
            featureLaneStepPx,
            displaySettings.features.visible,
          )
          return sequenceRowVisibleBandHeights(layout, maxFeatureRows, featureLaneStepPx).bandHeightPx
        }),
      `${rowSegments.length} rows`),
    [
      annotationFeatureById,
      cdsInFrameExtensionsByFeatureId,
      displaySettings.features.visible,
      featureLaneStepPx,
      featureSegments,
      featureSegmentsByRow,
      assignPrimerRows,
      primerDisplaysBySequenceRow,
      primerFrameDisplays,
      primersVisible,
      indexedTranslationCellsByGroup,
      maxFeatureRows,
      memberAnnotationRange,
      rowSegments,
      reversePrimerPlacementsWithPackingRanges,
      translationBlockHeightPx,
    ],
  )

  // Index sites for every row (not just the virtual window). Filtering by the visible window
  // made off-screen row heights collapse when scrolling, which shifted scroll geometry and could
  // feedback into virtual-window updates until the tab hung.
  const restrictionSitesByLabelRow = useMemo(() => {
    return profileSync('restrictionSitesByLabelRow', 'sequence-rows', () => {
      return !layoutActive || !displaySettings.enzymes.visible ? new Map<number, RestrictionSite[]>()
        : sequenceEnzymeLabelRows(restrictionSites, record.sequence.length, viewStart, viewLength, horizontalMode, labelRouterBasesPerRow, labelRowSegments)
    }, `${restrictionSites.length} sites`)
  }, [
    displaySettings.enzymes.visible,
    horizontalMode,
    labelRouterBasesPerRow,
    labelRowSegments,
    layoutActive,
    record.sequence.length,
    restrictionSites,
    viewLength,
    viewStart,
  ])

  const labelPrimerPlacementsByIndex = useMemo(
    () =>
      new Map(
        labelRowSegments.map((segment, rowIndex) => {
          const rowEnd = segment.rowStart + segment.rowLength
          const forward = primersVisible
            ? assignPrimerRows(primerFrameDisplays, segment.rowStart, rowEnd, 'forward', primerDisplaysByLabelRow[rowIndex] ?? [])
            : []
          const reverse = primersVisible
            ? assignPrimerRows(primerFrameDisplays, segment.rowStart, rowEnd, 'reverse', primerDisplaysByLabelRow[rowIndex] ?? [])
            : []
          const forwardLaneHeight = primerStrandLaneHeight(forward)
          const primerClearanceSpans: SequencePrimerClearanceSpan[] = forward.map((placement) => ({
            left: placement.left,
            right: placement.right,
            heightPx: forwardLaneHeight - placement.yOffset,
          }))
          const sgForward = sgRnaSegmentsForRow(sgRnaSegments, segment.rowStart, rowEnd, 'forward')
          const sgClearanceSpans = sgRnaForwardClearanceSpans(
            sgRnaSegments,
            segment.rowStart,
            rowEnd,
            rowTrackInsetPx,
            sequenceBaseStepPx,
            sgRnaRowLanes(sgForward),
          )
          return [
            rowIndex,
            {
              forward,
              reverse,
              forwardLaneCount: forward.reduce((count, placement) => Math.max(count, placement.lane + 1), 0),
              reverseLaneCount: reverse.reduce((count, placement) => Math.max(count, placement.lane + 1), 0),
              forwardLaneHeight,
              reverseLaneHeight: primerStrandLaneHeight(reverse),
              clearanceSpans: [...primerClearanceSpans, ...sgClearanceSpans],
            },
          ]
        }),
      ),
    [
      assignPrimerRows,
      labelRowSegments,
      primerDisplaysByLabelRow,
      primerFrameDisplays,
      primersVisible,
      rowTrackInsetPx,
      sequenceBaseStepPx,
      sgRnaSegments,
    ],
  )

  const rowPrimerPlacementsByIndex = useMemo(
    () =>
      new Map(
        rowSegments.map((segment, rowIndex) => {
          const rowEnd = segment.rowStart + segment.rowLength
          const candidates = (primerDisplaysBySequenceRow[rowIndex] ?? []).filter((display) => !memberAnnotationRange || (display.templateSpanEnd > memberAnnotationRange.start && display.templateSpanStart < memberAnnotationRange.end))
          const forward = primersVisible
            ? assignPrimerRows(primerFrameDisplays, segment.rowStart, rowEnd, 'forward', candidates)
            : []
          const reverse = primersVisible
            ? assignPrimerRows(primerFrameDisplays, segment.rowStart, rowEnd, 'reverse', candidates)
            : []
          const forwardLaneHeight = primerStrandLaneHeight(forward)
          const primerClearanceSpans: SequencePrimerClearanceSpan[] = forward.map((placement) => ({
            left: placement.left,
            right: placement.right,
            heightPx: forwardLaneHeight - placement.yOffset,
          }))
          const sgForward = sgRnaSegmentsForRow(sgRnaSegments, segment.rowStart, rowEnd, 'forward')
          const sgClearanceSpans = sgRnaForwardClearanceSpans(
            sgRnaSegments,
            segment.rowStart,
            rowEnd,
            rowTrackInsetPx,
            sequenceBaseStepPx,
            sgRnaRowLanes(sgForward),
          )
          return [
            rowIndex,
            {
              forward,
              reverse,
              forwardLaneCount: forward.reduce((count, placement) => Math.max(count, placement.lane + 1), 0),
              reverseLaneCount: reverse.reduce((count, placement) => Math.max(count, placement.lane + 1), 0),
              forwardLaneHeight,
              reverseLaneHeight: primerStrandLaneHeight(reverse),
              clearanceSpans: [...primerClearanceSpans, ...sgClearanceSpans],
            },
          ]
        }),
      ),
    [
      assignPrimerRows,
      memberAnnotationRange,
      primerFrameDisplays,
      primerDisplaysBySequenceRow,
      primersVisible,
      rowSegments,
      rowTrackInsetPx,
      sequenceBaseStepPx,
      sgRnaSegments,
    ],
  )

  const labelRouterBase = useMemo(
    () => ({
      enzymeSites: [] as RestrictionSite[],
      primerSites: [] as RestrictionSite[],
      sequenceLength: record.sequence.length,
      basesPerRow: labelRouterBasesPerRow,
      rowSegments: labelRowSegments,
      baseStepPx: sequenceBaseStepPx,
      trackInsetPx: rowTrackInsetPx,
      collisionUnitPx: sequenceLabelCollisionPx,
      labelForSite: (site: RestrictionSite) =>
        `${formatEnzymeLabelName(site.enzyme.name, site.methylationDisplay ?? 'normal')}${record.topology === 'linear' && restrictionSiteCutsOutsideSequence(site, record.sequence.length) ? ` (${site.cutTop + 1})` : ''}`,
      textHeight: enzymeLabelFontSizePx + 2,
      labelPadding: 6,
      labelWidthForSite: (_site: RestrictionSite, label: string) =>
        (void fontMetricsEpoch, measureTextWidthPx(label, enzymeLabelFont, 6)),
    }),
    [enzymeLabelFont, enzymeLabelFontSizePx, fontMetricsEpoch, labelRouterBasesPerRow, labelRowSegments, record.sequence.length, record.topology, rowTrackInsetPx, sequenceBaseStepPx],
  )

  const labelRowIndexesToRoute = useMemo(() => {
    if (!layoutActive) return []
    if (!horizontalMode) {
      const start = Math.max(0, virtualRowWindow.start)
      const end = Math.min(labelRowSegments.length - 1, virtualRowWindow.end)
      return end < start ? [] : Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
    }
    if (!displaySettings.enzymes.visible) return []
    const overscan = labelRouterBasesPerRow
    const rangeStart = Math.max(0, horizontalVisibleRange.start - overscan)
    const rangeEnd = Math.min(record.sequence.length, horizontalVisibleRange.end + overscan)
    return labelRowSegments.flatMap((segment, index) =>
      segment.rowStart < rangeEnd && segment.rowStart + segment.rowLength > rangeStart ? [index] : [],
    )
  }, [
    displaySettings.enzymes.visible,
    horizontalMode,
    horizontalVisibleRange.end,
    horizontalVisibleRange.start,
    labelRouterBasesPerRow,
    labelRowSegments,
    layoutActive,
    record.sequence.length,
    virtualRowWindow.end,
    virtualRowWindow.start,
  ])

  const labelRowLayouts = useMemo(
    () =>
      profileSync(
        'rowLabelLayouts (layoutSequenceRow)',
        'sequence-rows',
        () => {
          const routed = new Map<number, ReturnType<typeof layoutSequenceRowChunk>>()
          for (const rowIndex of labelRowIndexesToRoute) {
            const segment = labelRowSegments[rowIndex]
            if (!segment) continue
            const clearanceSpans = labelPrimerPlacementsByIndex.get(rowIndex)?.clearanceSpans ?? []
            const enzymeSites = restrictionSitesByLabelRow.get(rowIndex) ?? []
            routed.set(
              rowIndex,
              layoutSequenceRowChunk(
                rowIndex,
                segment,
                {
                  ...labelRouterBase,
                  enzymeSites,
                  forwardPrimerClearanceSpans: clearanceSpans,
                  forwardPrimerClearanceRows: clearanceSpans.length ? PRIMER_DISPLAY_ROWS + 1 : 0,
                },
                horizontalMode ? { jointBeltBp: alignmentLabelJointBeltBp } : undefined,
              ),
            )
          }
          return labelRowSegments.map((segment, rowIndex) =>
            routed.get(rowIndex) ?? emptySequenceRowLabelLayout(rowIndex, segment),
          )
        },
        `${labelRowIndexesToRoute.length}/${labelRowSegments.length} label rows, ${restrictionSites.length} enzyme sites`,
      ),
    [
      alignmentLabelJointBeltBp,
      horizontalMode,
      labelPrimerPlacementsByIndex,
      labelRouterBase,
      labelRowIndexesToRoute,
      labelRowSegments,
      restrictionSites.length,
      restrictionSitesByLabelRow,
    ],
  )

  const horizontalMergedLabelLayout = useMemo(() => {
    if (!horizontalMode || !labelRowLayouts.length) return null
    const enzymeLaneRows = labelRowLayouts.reduce((max, layout) => Math.max(max, layout.enzymeLaneRows), 0)
    const routedLaneRows = labelRowIndexesToRoute.reduce((max, rowIndex) => {
      const layout = labelRowLayouts[rowIndex]
      return layout ? Math.max(max, layout.enzymeLaneRows) : max
    }, 0)
    const first = labelRowLayouts[0]
    return {
      ...first,
      rowStart: 0,
      rowLength: record.sequence.length,
      enzymeCallouts: [],
      enzymeLaneRows: Math.max(enzymeLaneRows, routedLaneRows),
    }
  }, [horizontalMode, labelRowIndexesToRoute, labelRowLayouts, record.sequence.length])

  const rowLabelLayouts = useMemo(() => {
    if (!horizontalMode) return labelRowLayouts
    if (horizontalMergedLabelLayout) return [horizontalMergedLabelLayout]
    if (labelRowSegments.length === 0) return []
    return [emptySequenceRowLabelLayout(0, labelRowSegments[0]!)]
  }, [horizontalMergedLabelLayout, horizontalMode, labelRowLayouts, labelRowSegments])

  const visibleHorizontalEnzymeCallouts = useMemo(() => {
    if (!horizontalMode) return null
    const overscanBp = labelRouterBasesPerRow
    const start = Math.max(0, horizontalVisibleRange.start - overscanBp)
    const end = Math.min(record.sequence.length, horizontalVisibleRange.end + overscanBp)
    const anchorXForCut = (cutPosition: number) =>
      alignmentMergedLayout
        ? templateIndexLeftPx(alignmentMergedLayout, cutPosition)
        : rowTrackInsetPx + cutPosition * sequenceBaseStepPx

    return labelRowLayouts.flatMap((layout, index) => {
      const segment = labelRowSegments[index]
      if (!segment) return []
      if (segment.rowStart >= end || segment.rowStart + segment.rowLength <= start) return []
      return layout.enzymeCallouts
        .filter((callout) => callout.cutPosition >= start && callout.cutPosition < end)
        .filter((callout) => {
          if (!alignmentTraceDisplay) return true
          const { templateStart, templateEnd } = alignmentTraceDisplay.alignment
          return callout.cutPosition >= templateStart && callout.cutPosition < templateEnd
        })
        .map((callout) => offsetSequenceLabelCallout(callout, anchorXForCut(callout.cutPosition) - callout.anchorX))
    })
  }, [
    alignmentMergedLayout,
    alignmentTraceDisplay,
    horizontalMode,
    horizontalVisibleRange.end,
    horizontalVisibleRange.start,
    labelRouterBasesPerRow,
    labelRowLayouts,
    labelRowSegments,
    record.sequence.length,
    rowTrackInsetPx,
    sequenceBaseStepPx,
  ])

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.ready) return
    void document.fonts.ready.then(() => {
      setFontMetricsEpoch((epoch) => epoch + 1)
    })
  }, [record.sequence.length])

  useEffect(() => {
    if (!Number.isFinite(sequenceLabelDebugCut)) return
    const row = labelRowLayouts.find(
      (layout) =>
        sequenceLabelDebugCut >= layout.rowStart &&
        sequenceLabelDebugCut <= layout.rowStart + layout.rowLength,
    )
    if (!row) {
      console.info(`[sequence-label-debug] cut ${sequenceLabelDebugCut} is not in any row chunk`)
      return
    }
    console.groupCollapsed(
      `[sequence-label-debug] row ${row.rowStart}–${row.rowStart + row.rowLength} (cut ${sequenceLabelDebugCut})`,
    )
    console.info('basesPerRow', basesPerRow, 'rowSegments', rowSegments[row.rowIndex])
    row.enzymeCallouts
      .toSorted((a, b) => linearCutPosition(a.site) - linearCutPosition(b.site) || a.laneRow - b.laneRow)
      .forEach((callout) => {
        console.info(
          linearCutPosition(callout.site),
          callout.site.enzyme.name,
          `laneRow ${callout.laneRow}`,
          callout.half,
          callout.stackId,
          callout.isStackLeader ? 'leader' : '',
        )
      })
    console.groupEnd()
  }, [basesPerRow, labelRowLayouts, labelRowSegments, rowSegments, sequenceLabelDebugCut])

  const rowLayoutByIndex = useMemo(
    () => new Map(rowLabelLayouts.map((layout) => [layout.rowIndex, layout])),
    [rowLabelLayouts],
  )
  const computeHorizontalRowTranslationLayout = useEffectEvent(computeRowTranslationLayout)
  useLayoutEffect(() => {
    if (!horizontalMode || !onHorizontalBandsSnapshot) return
    const rowIndex = 0
    const offset = 0
    const rowEnd = record.sequence.length
    const rowSequenceWidthPx =
      useAlignmentMergedLayout && alignmentMergedLayout
        ? mergedLayoutContentWidthPx(alignmentMergedLayout)
        : rowTrackInsetPx * 2 + record.sequence.length * sequenceBaseStepPx
    const rowFeatures = assignSequencePaneRowFeatureLanes(
      offset,
      rowEnd,
      featureSegments,
      cdsInFrameExtensionsByFeatureId,
      annotationFeatureById,
      translationGroupsForRow(offset, rowEnd),
    )
    const assignedFeatures = rowFeatures.filter((segment) => !segment.isInFrameExtension)
    const rowPrimerPlacements = rowPrimerPlacementsByIndex.get(rowIndex)
    const reversePrimerLaneHeight = sgRnaRowLaneHeightPx(sgRnaLanesByRow.get(rowIndex)?.reverseLanes.count ?? 0)
    const rowTranslationLayout = computeHorizontalRowTranslationLayout(offset, rowEnd, rowFeatures, rowPrimerPlacements?.reverse ?? [])
    const rowLayout = rowLayoutByIndex.get(rowIndex)
    let enzymeLaneHeight = 0
    if (rowLayout) {
      const stubHeight = 8
      enzymeLaneHeight = Math.max(
        18,
        rowLayout.enzymeLaneRows > 0 ? rowLayout.enzymeLaneRows * 17 + stubHeight : 0,
      )
    }
    const featureLaneHeight = rowTranslationLayout.totalHeightPx
    const enzymeCallouts =
      horizontalMode && visibleHorizontalEnzymeCallouts ? visibleHorizontalEnzymeCallouts : (rowLayout?.enzymeCallouts ?? [])
    const heightPx = enzymeLaneHeight + featureLaneHeight + reversePrimerLaneHeight
    onHorizontalBandsSnapshot({
      heightPx,
      rowSequenceWidthPx,
      enzymeLaneHeight: displaySettings.enzymes.visible ? enzymeLaneHeight : 0,
      enzymeCallouts: displaySettings.enzymes.visible ? enzymeCallouts : [],
      featureLaneHeight,
      rowFeatures: displaySettings.features.visible ? assignedFeatures : [],
      reversePrimerLaneHeight,
      rowKey: rowIndex,
    })
  }, [
    alignmentMergedLayout,
    annotationFeatureById,
    cdsInFrameExtensionsByFeatureId,
    displaySettings.enzymes.visible,
    displaySettings.features.visible,
    featureLaneStepPx,
    featureSegments,
    horizontalMode,
    onHorizontalBandsSnapshot,
    record.sequence.length,
    rowLayoutByIndex,
    rowPrimerPlacementsByIndex,
    rowTrackInsetPx,
    sequenceBaseStepPx,
    sgRnaLanesByRow,
    translationGroupsForRow,
    useAlignmentMergedLayout,
    visibleHorizontalEnzymeCallouts,
  ])

  const [rowHeightFloorByIndex, setRowHeightFloorByIndex] = useState<Record<number, number>>({})
  const [rowMeasuredHeightsByIndex, setRowMeasuredHeightsByIndex] = useState<Record<number, number>>({})
  const sequenceRowHeightMeasureKey = `${basesPerRow}|${record.sequence.length}|${viewEnd}|${viewStart}|${primersVisible}|${primerFrameDisplays.length}`
  const [rowHeightFloorMeasureKey, setRowHeightFloorMeasureKey] = useState(sequenceRowHeightMeasureKey)
  const rowStartOffsetsRef = useRef<number[]>([])
  const rowEstimatedHeightsRef = useRef<number[]>([])
  /** Row at the scroll host's top edge, kept pinned across row-height changes (e.g. new primer lanes). */
  const rowScrollAnchorRef = useRef<SequenceRowScrollAnchor | null>(null)
  const restrictionSiteCountByLabelRow = useMemo(() => new Map(Array.from(restrictionSitesByLabelRow, ([rowIndex, sites]) => [rowIndex, sites.length])), [restrictionSitesByLabelRow])
  const rowEstimatedHeightsRaw = useMemo(
    () => estimateSequenceRowHeights({
      rowSegments,
      rowPrimerPlacementsByIndex,
      sgRnaLanesByRow,
      rowLayoutByIndex,
      restrictionSiteCountByLabelRow,
      rowFeatureBandHeightByRow,
      horizontalMode,
      featuresVisible: displaySettings.features.visible,
      featureLaneStepPx,
      sequenceStrandRowHeightPx,
      sequenceRulerHeightPx,
      virtualRowEstimatePx,
      labelRouterBase,
    }),
    [
      displaySettings.features.visible,
      featureLaneStepPx,
      horizontalMode,
      labelRouterBase,
      restrictionSiteCountByLabelRow,
      rowFeatureBandHeightByRow,
      rowLayoutByIndex,
      rowPrimerPlacementsByIndex,
      rowSegments,
      sgRnaLanesByRow,
      sequenceStrandRowHeightPx,
      virtualRowEstimatePx,
    ],
  )

  const floorSync = syncSequenceRowHeightFloors(sequenceRowHeightMeasureKey, rowHeightFloorMeasureKey, rowHeightFloorByIndex, rowEstimatedHeightsRaw)
  if (floorSync.nextMeasureKey !== rowHeightFloorMeasureKey) setRowHeightFloorMeasureKey(floorSync.nextMeasureKey)
  if (floorSync.resetMeasured) setRowMeasuredHeightsByIndex({})
  if (floorSync.nextFloors !== rowHeightFloorByIndex) setRowHeightFloorByIndex(floorSync.nextFloors)
  const virtualWindowTransition = planSequenceVirtualWindowTransition(virtualRowWindow, virtualRowWindowOwner, `${record.sequence.length}|${viewEnd}|${viewStart}`, rowSegments.length, layoutActive, horizontalMode)
  if (virtualWindowTransition.nextWindow) setVirtualRowWindow(virtualWindowTransition.nextWindow)
  if (virtualWindowTransition.nextOwner) setVirtualRowWindowOwner(virtualWindowTransition.nextOwner)

  const rowEstimatedHeights = useMemo(
    () =>
      rowEstimatedHeightsRaw.map((height, rowIndex) => {
        // Prefer last measured DOM height so placeholders match reality after primers
        // change lane sizes. Fall back to max(estimate, soft floor) before first paint.
        const measured = rowMeasuredHeightsByIndex[rowIndex]
        if (measured && measured > 0) return measured
        return Math.max(height, rowHeightFloorByIndex[rowIndex] ?? 0)
      }),
    [rowEstimatedHeightsRaw, rowHeightFloorByIndex, rowMeasuredHeightsByIndex],
  )

  useHorizontalRowHeight(containerRef, horizontalMode, compactAlignmentAnnotations, layoutActive, rowEstimatedHeights, virtualRowEstimatePx, onHorizontalRowHeight)

  const rowStartOffsets = useMemo(() => {
    let cursor = 0
    return rowEstimatedHeights.map((height) => {
      const start = cursor
      cursor += height
      return start
    })
  }, [rowEstimatedHeights])

  rowEstimatedHeightsRef.current = rowEstimatedHeights
  rowStartOffsetsRef.current = rowStartOffsets

  // Keep the top-edge row pinned when rows above it change height (primer/feature lanes,
  // placeholders swapped for measured rows). Native overflow-anchor is disabled on the scroll
  // host so this is the only correction; it is relative to the row's live DOM position, so
  // re-running it is a no-op.
  const pinRowScrollAnchor = useCallback(() => {
    if (horizontalMode || !layoutActive) return
    const container = containerRef.current
    if (!container) return
    const scrollHost = resolveSequenceScrollHost(container)
    let anchor = rowScrollAnchorRef.current
    if (anchor && anchor.scrollTop !== scrollHost.scrollTop) {
      anchor = shiftSequenceRowScrollAnchor(
        container,
        anchor,
        scrollHost.scrollTop,
        rowEstimatedHeightsRef.current,
        virtualRowEstimatePx,
      )
    }
    const row = anchor ? sequenceRowElementAt(container, anchor.rowIndex) : null
    if (!anchor || !row || Number(row.dataset.rowStart ?? 0) !== anchor.rowStart) {
      rowScrollAnchorRef.current = captureSequenceRowScrollAnchor(container, scrollHost, rowStartOffsetsRef.current)
      return
    }
    const rowRect = row.getBoundingClientRect()
    const offsetPx = Math.min(anchor.offsetPx, rowRect.height)
    const delta = rowRect.top + offsetPx - scrollHost.getBoundingClientRect().top
    if (Math.abs(delta) >= 1) scrollHost.scrollTop += delta
    rowScrollAnchorRef.current =
      captureSequenceRowScrollAnchor(container, scrollHost, rowStartOffsetsRef.current)
      ?? { ...anchor, offsetPx, scrollTop: scrollHost.scrollTop }
  }, [horizontalMode, layoutActive, virtualRowEstimatePx])

  useLayoutEffect(() => {
    pinRowScrollAnchor()
  }, [pinRowScrollAnchor, rowStartOffsets, virtualRowWindow.end, virtualRowWindow.start])

  // After measured heights replace inflated estimates, re-evaluate which rows belong in view
  // without waiting for the next user scroll (otherwise empty placeholders linger).
  useEffect(() => {
    if (horizontalMode || !layoutActive) return
    const container = containerRef.current
    if (!container) return
    resolveSequenceScrollHost(container).dispatchEvent(new Event('scroll'))
  }, [horizontalMode, layoutActive, rowEstimatedHeights, rowStartOffsets])

  useLayoutEffect(() => {
    if (!horizontalMode || !alignmentProfileEnabled()) return
    const paintMark = `sequence-rows-paint-${alignmentProfileScope}`
    alignmentProfileMark(paintMark)
    const frameId = window.requestAnimationFrame(() => {
      alignmentProfileMeasure(
        'sequence-rows-first-paint',
        paintMark,
        'render',
        alignmentTraceDisplay ? 'trace' : 'reference',
      )
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [alignmentProfileScope, alignmentMergedLayout, alignmentTraceDisplay, horizontalMode, record.sequence.length, rowLabelLayouts])

  useEffect(() => {
    if (horizontalMode) return

    const container = containerRef.current
    if (!container || !layoutActive || !rowSegments.length) return
    const scrollHost = resolveSequenceScrollHost(container)

    const locateRowIndex = (targetOffset: number) => {
      const offsets = rowStartOffsetsRef.current
      const heights = rowEstimatedHeightsRef.current
      for (let rowIndex = 0; rowIndex < rowSegments.length; rowIndex += 1) {
        const rowTop = offsets[rowIndex] ?? 0
        const rowBottom = rowTop + (heights[rowIndex] ?? virtualRowEstimatePx)
        if (rowBottom >= targetOffset) return rowIndex
      }
      return Math.max(0, rowSegments.length - 1)
    }

    const recalculateVirtualWindow = () => {
      const hostRect = scrollHost.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const rowsTopWithinHost = containerRect.top - hostRect.top + scrollHost.scrollTop
      const viewportTop = Math.max(0, scrollHost.scrollTop - rowsTopWithinHost)
      const viewportBottom = viewportTop + scrollHost.clientHeight
      const visibleStart = locateRowIndex(viewportTop)
      const visibleEnd = locateRowIndex(viewportBottom)
      // If height estimates are inflated (common after adding primers), estimate-based
      // visibleEnd stays too low and the viewport fills with empty placeholders. Always
      // mount enough rows to cover the viewport under a conservative min row height.
      const minRowsForViewport = Math.max(1, Math.ceil(scrollHost.clientHeight / 96))
      const filledEnd = Math.min(
        rowSegments.length - 1,
        Math.max(visibleEnd, visibleStart + minRowsForViewport - 1),
      )
      const start = Math.max(0, visibleStart - virtualRowOverscan)
      const end = Math.min(rowSegments.length - 1, filledEnd + virtualRowOverscan)
      setVirtualRowWindow((current) => (current.start === start && current.end === end ? current : { start, end }))
    }

    const captureScrollAnchor = () => {
      rowScrollAnchorRef.current = captureSequenceRowScrollAnchor(container, scrollHost, rowStartOffsetsRef.current)
    }

    let raf = 0
    const scheduleRecalculate = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        recalculateVirtualWindow()
      })
    }

    // Rows above the viewport may already have grown in the DOM without a pin yet; reading
    // geometry here would record the shifted position as the anchor, so shift arithmetically.
    const handleScroll = () => {
      const anchor = rowScrollAnchorRef.current
      if (anchor) {
        rowScrollAnchorRef.current = shiftSequenceRowScrollAnchor(
          container,
          anchor,
          scrollHost.scrollTop,
          rowEstimatedHeightsRef.current,
          virtualRowEstimatePx,
        )
      } else {
        captureScrollAnchor()
      }
      scheduleRecalculate()
    }

    recalculateVirtualWindow()
    captureScrollAnchor()
    scrollHost.addEventListener('scroll', handleScroll, { passive: true })
    const resizeObserver = new ResizeObserver(scheduleRecalculate)
    resizeObserver.observe(scrollHost)
    resizeObserver.observe(container)
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      scrollHost.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
    }
    // Heights/offsets are read from refs so this effect does not re-bind (and immediately
    // recalculate) on every virtual-window-driven height change — that feedback hung tabs.
  }, [horizontalMode, layoutActive, rowSegments.length, virtualRowEstimatePx, virtualRowOverscan])

  useLayoutEffect(() => {
    if (horizontalMode) return
    const container = containerRef.current
    if (!container || !layoutActive) return

    const observer = new ResizeObserver((entries) => {
      // Runs after layout but before paint; waiting for the re-render would show a shifted frame.
      pinRowScrollAnchor()
      setRowMeasuredHeightsByIndex((previous) => {
        let changed = false
        const next = { ...previous }
        for (const entry of entries) {
          const element = entry.target
          if (!(element instanceof HTMLElement)) continue
          if (element.classList.contains('sequence-row-placeholder')) continue
          const rowIndex = Number(entry.target.getAttribute('data-row-index'))
          if (!Number.isFinite(rowIndex) || rowIndex < 0) continue
          const borderBox = entry.borderBoxSize?.[0]?.blockSize
          const height = Math.ceil(borderBox ?? entry.contentRect.height)
          if (height <= 0) continue
          if (next[rowIndex] === height) continue
          next[rowIndex] = height
          changed = true
        }
        return changed ? next : previous
      })
    })

    const rows = container.querySelectorAll<HTMLElement>('.sequence-row:not(.sequence-row-placeholder)')
    rows.forEach((row) => observer.observe(row))
    return () => observer.disconnect()
  }, [horizontalMode, layoutActive, pinRowScrollAnchor, rowSegments.length, virtualRowWindow.end, virtualRowWindow.start])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !layoutActive) return

    const applyWidth = (containerWidth: number) => {
      if (horizontalMode) {
        const width =
          alignmentMergedLayout !== undefined
            ? mergedLayoutContentWidthPx(alignmentMergedLayout)
            : rowTrackInsetPx * 2 + record.sequence.length * sequenceBaseStepPx
        setSequenceContentWidthPx((current) => (current === width ? current : width))
        setCompactRowLayout(false)
        return
      }
      const compact = containerWidth <= MOBILE_SEQUENCE_LAYOUT_MAX_WIDTH && isMobileShellViewport()
      const metrics = sequenceRowLayoutMetrics(compact)
      const layout = measureSequenceRowLayout(containerWidth, sequenceBaseStepPx, metrics)
      if (!layout) return
      setCompactRowLayout((current) => (current === compact ? current : compact))
      setBasesPerRow((current) => (current === layout.basesPerRow ? current : layout.basesPerRow))
      setSequenceContentWidthPx((current) => (current === layout.sequenceContentWidthPx ? current : layout.sequenceContentWidthPx))
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width <= 0) return
      applyWidth(entry.contentRect.width)
    })

    applyWidth(container.getBoundingClientRect().width)
    observer.observe(container)
    return () => observer.disconnect()
  }, [alignmentMergedLayout, horizontalMode, layoutActive, record.sequence.length, rowTrackInsetPx, sequenceBaseStepPx])

  function isSelected(position: number, strand: 'forward' | 'reverse') {
    if (cutStrandSelection) {
      // A single clicked enzyme is an anchor, not a nucleotide selection. Its actual
      // top/bottom cut boundaries are drawn by renderCutOverlay below.
      if (selectedRestrictionSites.length === 1) return false
      const range = strand === 'forward' ? cutStrandSelection.forward : cutStrandSelection.reverse
      return isPositionInRange(position, range)
    }
    return isPositionInRange(position, selectedRange)
  }

  function overlappingFeatures(rowStart: number, rowEnd: number) {
    if (!displaySettings.features.visible) return []
    return assignSequencePaneRowFeatureLanes(
      rowStart,
      rowEnd,
      featureSegments,
      cdsInFrameExtensionsByFeatureId,
      annotationFeatureById,
      translationGroupsForRow(rowStart, rowEnd),
    )
  }
  type RowTranslationBlock = {
    group: CdsTranslationRowGroup
    rowCells: AnnotatedTranslationCell[]
    allGroupCells: AnnotatedTranslationCell[]
    lane: number
    topPx: number
  }
  type RowTranslationLayout = {
    laneCount: number
    /** Feature-body top (px) keyed by segment id — supports mid-row vertical reuse. */
    bodyTopPxBySegmentId: Map<string, number>
    /** Fallback tops by synthetic lane index for callers that still key by lane. */
    laneBodyTopPx: number[]
    blocks: RowTranslationBlock[]
    reversePrimerTopPxByIndex: number[]
    featureHeightPx: number
    reversePrimerHeightPx: number
    totalHeightPx: number
  }

  function bodyTopPxForSegment(
    layout: RowTranslationLayout,
    segmentId: string,
    lane: number,
  ) {
    return layout.bodyTopPxBySegmentId.get(segmentId) ?? layout.laneBodyTopPx[lane] ?? lane * featureLaneStepPx
  }

  // Skyline-pack translation+CDS bands so a finished CDS frees its upper strip for
  // later features on the same sequence row, while keeping each AA row adjacent to its body.
  function computeRowTranslationLayout(
    rowStart: number,
    rowEnd: number,
    rowFeatures: ReturnType<typeof assignSequencePaneRowFeatureLanes>,
    reversePrimerPlacements: PrimerRowPlacement[] = [],
    packingRowStart = rowStart,
    packingRowEnd = rowEnd,
  ): RowTranslationLayout {
    const translationGroups = translationGroupsForRow(rowStart, rowEnd)
    const featureToGroupId = new Map<string, string>()
    translationGroups.forEach((group) => {
      group.featureIds.forEach((featureId) => {
        if (!featureToGroupId.has(featureId)) featureToGroupId.set(featureId, group.id)
      })
    })

    const translatedBandHeight = translationBlockHeightPx + featureLaneStepPx
    const bandItems = displaySettings.features.visible ? [
      ...translationGroups.map((group) => ({
        id: `tg:${group.id}`,
        ranges: group.ranges,
        height: translatedBandHeight,
        priority: -1000,
      })),
      ...rowFeatures
        .filter((segment) => !featureToGroupId.has(segment.feature.id))
        .map((segment) => ({
          id: segment.segmentId,
          ranges: [{ start: segment.start, end: segment.end }],
          height: featureLaneStepPx,
          priority: featurePriority(segment.feature.type),
        })),
    ] : []
    const combinedLayout = packSequenceRowFeatureAndReversePrimerPlacements(
      bandItems,
      reversePrimerPlacementsWithPackingRanges(reversePrimerPlacements, packingRowStart, packingRowEnd),
      featureLaneStepPx,
      displaySettings.features.visible,
    )
    const topPxByBandId = combinedLayout.featureTopPxById

    const bodyTopPxBySegmentId = new Map<string, number>()
    rowFeatures.forEach((segment) => {
      const groupId = featureToGroupId.get(segment.feature.id)
      if (groupId) {
        const groupTop = topPxByBandId.get(`tg:${groupId}`) ?? 0
        bodyTopPxBySegmentId.set(segment.segmentId, groupTop + translationBlockHeightPx)
        return
      }
      bodyTopPxBySegmentId.set(segment.segmentId, topPxByBandId.get(segment.segmentId) ?? 0)
    })

    const uniqueBodyTops = [...new Set(bodyTopPxBySegmentId.values())].toSorted((a, b) => a - b)
    const laneFromBodyTop = new Map(uniqueBodyTops.map((top, index) => [top, index]))
    const laneBodyTopPx = uniqueBodyTops
    const laneCount = Math.max(1, uniqueBodyTops.length)

    // Keep segment.lane in sync for label/ORF code paths that still read it.
    rowFeatures.forEach((segment) => {
      const top = bodyTopPxBySegmentId.get(segment.segmentId) ?? 0
      segment.lane = laneFromBodyTop.get(top) ?? 0
    })

    const rawBlocks =
      displaySettings.features.visible && translationGroups.length
        ? indexedTranslationCellsByGroup.flatMap(({ group, cells }) => {
            const rowCells = translationCellsForRow(cells, rowStart, rowEnd)
            if (!rowCells.length) return []
            const groupTop = topPxByBandId.get(`tg:${group.id}`)
            if (groupTop === undefined) return []
            const bodyTop = groupTop + translationBlockHeightPx
            const lane = laneFromBodyTop.get(bodyTop) ?? 0
            return [{ group, rowCells, allGroupCells: cells, lane, topPx: groupTop }]
          })
        : []

    const featureHeightPx = Math.max(combinedLayout.featureHeightPx, ...rawBlocks.map((block) => block.topPx + translationBlockHeightPx + featureLaneStepPx))
    const totalHeightPx = Math.max(featureHeightPx, combinedLayout.reversePrimerHeightPx)

    return {
      laneCount,
      bodyTopPxBySegmentId,
      laneBodyTopPx,
      blocks: rawBlocks,
      reversePrimerTopPxByIndex: combinedLayout.reversePrimerTopPx,
      featureHeightPx,
      reversePrimerHeightPx: combinedLayout.reversePrimerHeightPx,
      totalHeightPx,
    }
  }

  function renderFloatingFeatureLabels(
    rowStart: number,
    rowEnd: number,
    rowFeatures: ReturnType<typeof assignSequencePaneRowFeatureLanes>,
    featuresById: Map<string, SequenceFeature>,
    layout: RowTranslationLayout,
  ) {
    if (!displaySettings.features.visible || !displaySettings.features.labelsVisible) {
      return {
        labels: null,
        featureIds: new Set<string>(),
        belowLabelSpans: [] as Array<{ left: number; right: number; bottom: number }>,
        bodyHeightByFeatureId: new Map<string, number>(),
      }
    }

    const visibleStart = Math.max(rowStart, horizontalVisibleRange.start)
    const visibleEnd = Math.min(rowEnd, horizontalVisibleRange.end)
    if (visibleEnd <= visibleStart) {
      return {
        labels: null,
        featureIds: new Set<string>(),
        belowLabelSpans: [] as Array<{ left: number; right: number; bottom: number }>,
        bodyHeightByFeatureId: new Map<string, number>(),
      }
    }

    const spanPx = (overlapStart: number, overlapEnd: number) => {
      if (useAlignmentMergedLayout && alignmentMergedLayout) {
        const span = mergedTemplateSpanPx(alignmentMergedLayout, overlapStart, overlapEnd)
        if (!span) return null
        const originLeft = templateIndexLeftPx(alignmentMergedLayout, rowStart)
        return { left: span.left - originLeft, width: span.width }
      }
      return {
        left: (overlapStart - rowStart) * sequenceBaseStepPx,
        width: (overlapEnd - overlapStart) * sequenceBaseStepPx,
      }
    }

    const labelSegments = rowFeatures
      .filter((segment) => !segment.isInFrameExtension && !isOrfFeature(segment.feature))
      .map((segment) => ({
        featureId: segment.feature.id,
        start: segment.start,
        end: segment.end,
        lane: segment.lane,
      }))
    const labelByFeatureId = new Map<string, string>()
    labelSegments.forEach((segment) => {
      if (labelByFeatureId.has(segment.featureId)) return
      const feature = featuresById.get(segment.featureId)
      if (feature) labelByFeatureId.set(segment.featureId, featureDisplayName(feature))
    })

    const placements = computeFloatingFeatureLabelPlacements(
      labelSegments,
      labelByFeatureId,
      visibleStart,
      visibleEnd,
      spanPx,
      {
        rowWidthPx: useAlignmentMergedLayout && alignmentMergedLayout
          ? mergedLayoutContentWidthPx(alignmentMergedLayout)
          : (visibleEnd - visibleStart) * sequenceBaseStepPx,
      },
    )
    if (!placements.length) {
      return {
        labels: null,
        featureIds: new Set<string>(),
        belowLabelSpans: [] as Array<{ left: number; right: number; bottom: number }>,
        bodyHeightByFeatureId: new Map<string, number>(),
      }
    }

    const bodyLayouts = rowFeatures
      .filter((segment) => !segment.isInFrameExtension && !isOrfFeature(segment.feature))
      .map((segment) => {
        const left =
          useAlignmentMergedLayout && alignmentMergedLayout
            ? (mergedTemplateSpanPx(alignmentMergedLayout, segment.start, segment.end)?.left ??
              (segment.start - rowStart) * sequenceBaseStepPx)
            : (segment.start - rowStart) * sequenceBaseStepPx
        const width =
          useAlignmentMergedLayout && alignmentMergedLayout
            ? (mergedTemplateSpanPx(alignmentMergedLayout, segment.start, segment.end)?.width ??
              Math.max(1, segment.end - segment.start) * sequenceBaseStepPx)
            : Math.max(1, segment.end - segment.start) * sequenceBaseStepPx
        return {
          featureId: segment.feature.id,
          bodyTopPx: bodyTopPxForSegment(layout, segment.segmentId, segment.lane),
          bodyLeftPx: left,
          bodyRightPx: left + width,
        }
      })

    const translationObstacles = layout.blocks.map((block) => {
      const positions = block.rowCells.flatMap((cell) => cell.positions)
      const start = positions.length ? Math.min(...positions) : rowStart
      const end = positions.length ? Math.max(...positions) + 1 : rowStart + 1
      const left = (Math.max(start, rowStart) - rowStart) * sequenceBaseStepPx
      const right = (Math.min(end, rowEnd) - rowStart) * sequenceBaseStepPx
      return { topPx: block.topPx, leftPx: left, rightPx: right }
    })

    const bodyHeightByFeatureId = compressBelowLabelBodyHeights(
      placements,
      bodyLayouts,
      translationObstacles,
      featureBodyHeightPx,
    )

    const featureIds = new Set(placements.map((placement) => placement.featureId))
    // Feature-lane coords omit the track inset; primer SVG coords include it.
    const belowLabelSpans = placements
      .filter((placement) => placement.below)
      .map((placement) => {
        const segmentId = rowFeatures.find(
          (segment) => segment.feature.id === placement.featureId && !segment.isInFrameExtension,
        )?.segmentId ?? ''
        const bodyTopPx = bodyTopPxForSegment(layout, segmentId, placement.lane)
        const bodyHeightPx = bodyHeightByFeatureId.get(placement.featureId) ?? featureBodyHeightPx
        const labelTopPx =
          bodyTopPx +
          1 +
          bodyHeightPx +
          2 +
          placement.belowLevel * BELOW_FEATURE_LABEL_STACK_STEP_PX
        return {
          left: rowTrackInsetPx + placement.leftPx,
          right: rowTrackInsetPx + placement.leftPx + placement.maxWidthPx,
          bottom: labelTopPx + Math.max(BELOW_FEATURE_LABEL_LINE_HEIGHT_PX, featureBodyFontSizePx * 1.1),
        }
      })
    return {
      featureIds,
      belowLabelSpans,
      bodyHeightByFeatureId,
      labels: placements.map((placement) => {
        const feature = featuresById.get(placement.featureId)
        const background = feature?.color ?? '#666'
        const below = placement.below
        const noColor = isFeatureNoColor(feature?.color)
        const bodyHeightPx = bodyHeightByFeatureId.get(placement.featureId) ?? featureBodyHeightPx
        return (
          <span
            key={`floating-label-${placement.featureId}-${rowStart}`}
            className={`sequence-feature-floating-label${below ? ' is-below' : ''}${noColor && !below ? ' is-nocolor' : ''}`}
            style={
              ({
                left: `${placement.leftPx}px`,
                maxWidth: `${placement.maxWidthPx}px`,
                ...(below
                  ? {
                      '--below-level': placement.belowLevel,
                    }
                  : noColor
                    ? {
                        background: 'var(--map-surface, #fbf7ed)',
                        color: 'var(--vg-text)',
                      }
                    : {
                        background,
                        color: contrastTextColor(background),
                      }),
                '--feature-lane': placement.lane,
                '--feature-lane-top': `${
                  bodyTopPxForSegment(
                    layout,
                    rowFeatures.find(
                      (segment) => segment.feature.id === placement.featureId && !segment.isInFrameExtension,
                    )?.segmentId ?? '',
                    placement.lane,
                  )
                }px`,
                '--feature-body-height': `${bodyHeightPx}px`,
              } as CSSProperties & Record<string, string | number>)
            }
          >
            {placement.label}
          </span>
        )
      }),
    }
  }

  function renderInFrameExtensions(
    rowStart: number,
    rowEnd: number,
    rowFeatures: ReturnType<typeof assignSequencePaneRowFeatureLanes>,
    layout: RowTranslationLayout,
  ) {
    if (!displaySettings.features.visible || useAlignmentMergedLayout) return null

    const items = [...cdsInFrameExtensionsByFeatureId.entries()].flatMap(([featureId, spans]) => {
      const feature = annotationFeatureById.get(featureId)
      if (!feature) return []

      return spans.flatMap((span, spanIndex) => {
        const overlapStart = Math.max(span.start, rowStart)
        const overlapEnd = Math.min(span.end, rowEnd)
        if (overlapEnd <= overlapStart) return []

        const segmentId = inFrameExtensionSegmentId(featureId, span, spanIndex)
        const lane = rowFeatures.find((entry) => entry.segmentId === segmentId)?.lane ?? 0
        const left = (overlapStart - rowStart) * sequenceBaseStepPx
        const width = (overlapEnd - overlapStart) * sequenceBaseStepPx
        const label = inFrameWithLabel(feature)
        const labelOffsets = inFrameLabelOffsets(width, label)

        return (
          <div
            key={segmentId}
            className={`sequence-feature-in-frame-extension${span.strand === 'reverse' ? ' reverse' : ''}`}
            style={{
              '--feature-lane': lane,
              '--feature-lane-top': `${bodyTopPxForSegment(layout, segmentId, lane)}px`,
              left: `${left}px`,
              width: `${width}px`,
            } as CSSProperties}
            title={`Translation continues in frame with ${featureDisplayName(feature)}`}
          >
            <span className="sequence-feature-in-frame-line" aria-hidden />
            {labelOffsets.map((offset, labelIndex) => (
              <span
                key={`${segmentId}-label-${labelIndex}`}
                className="sequence-feature-in-frame-label"
                style={{ left: `${offset}px` }}
              >
                {label}
              </span>
            ))}
            <span className="sequence-feature-in-frame-arrow" aria-hidden />
          </div>
        )
      })
    })

    if (!items.length) return null
    return items
  }

  function orfRowCells(feature: SequenceFeature, rowStart: number, rowEnd: number) {
    const cells = translationByFeatureId.get(feature.id)
    if (!cells?.length) return []
    return cells.filter((cell) => {
      const minPos = Math.min(...cell.positions)
      const maxPos = Math.max(...cell.positions)
      return maxPos >= rowStart && minPos < rowEnd
    })
  }

  function codonSpanInRow(
    cell: FeatureTranslationCell,
    rowStart: number,
    rowEnd: number,
    options?: { mergedLayoutOrigin?: 'segment' | 'track' },
  ) {
    if (cell.layoutSpan) {
      const { leftPx, widthPx } = cell.layoutSpan
      const minPos = Math.min(...cell.positions)
      const maxPos = Math.max(...cell.positions)
      return { left: leftPx, width: widthPx, minPos, maxPos, center: leftPx + widthPx / 2 }
    }
    const minPos = Math.max(rowStart, Math.min(...cell.positions))
    const maxPos = Math.min(rowEnd - 1, Math.max(...cell.positions))
    if (useAlignmentMergedLayout && alignmentMergedLayout) {
      const minLeft = templateIndexLeftPx(alignmentMergedLayout, minPos)
      const maxLeft = templateIndexLeftPx(alignmentMergedLayout, maxPos) + sequenceBaseStepPx
      const originLeft =
        options?.mergedLayoutOrigin === 'track'
          ? 0
          : templateIndexLeftPx(alignmentMergedLayout, rowStart)
      const left = minLeft - originLeft
      const width = maxLeft - minLeft
      return { left, width, minPos, maxPos, center: left + width / 2 }
    }
    const left = (minPos - rowStart) * sequenceBaseStepPx
    const width = (maxPos - minPos + 1) * sequenceBaseStepPx
    return { left, width, minPos, maxPos, center: left + width / 2 }
  }

  function renderFeatureTranslationLane(
    blocks: RowTranslationBlock[],
    rowStart: number,
    rowEnd: number,
    rowSequenceWidthPx: number,
  ) {
    if (!blocks.length) return null

    const mergedLayoutOrigin = useAlignmentMergedLayout ? ('track' as const) : undefined

    return (
      <>
        {blocks.map(({ group, rowCells, allGroupCells, topPx }) => {
          const translationRulerHeightPx = 8
          const translationRulerMidY = translationRulerHeightPx / 2
          const codonSpan = (cell: FeatureTranslationCell) =>
            codonSpanInRow(cell, rowStart, rowEnd, { mergedLayoutOrigin })
          const sortedCells = sortTranslationCellsForRuler(rowCells)
          const displayCells = sortTranslationCellsForRuler(sortedCells.flatMap((cell) =>
            (cell.layoutSpan ? [{ positions: cell.positions }] : translationCellDisplayFragments(cell, rowStart, rowEnd)).map((fragment, fragmentIndex) => ({ ...cell, canonicalCell: cell, fragmentIndex, positions: fragment.positions })),
          ))
          const rulerRuns = translationRulerRuns(displayCells)
          const featureById = new Map(group.features.map((feature) => [feature.id, feature]))
          const orderedGroupCells = allGroupCells

          return (
          <div
            className="sequence-translation-block"
            key={group.id}
            style={{ position: 'absolute', top: `${topPx}px`, left: 0, width: `${rowSequenceWidthPx}px` }}
          >
            <div className="sequence-translation-ruler-row">
              <div className="sequence-translation-ruler-labels" aria-hidden>
                {displayCells
                  .filter((cell) => cell.number % 5 === 0)
                  .map((cell) => {
                    const { center } = codonSpan(cell)
                    return (
                      <span className="sequence-translation-ruler-label" key={`label-${cell.featureId}-${cell.number}`} style={{ left: `${center}px` }}>
                        {cell.number}
                      </span>
                    )
                  })}
              </div>
              <svg className="sequence-translation-ruler" width={rowSequenceWidthPx} height={translationRulerHeightPx} aria-hidden>
                {rulerRuns.map((run) => {
                  const runCells = displayCells.slice(run.startIndex, run.endIndex)
                  if (!runCells.length) return null
                  const runSpans = runCells.map(codonSpan)
                  const lineLeft = Math.min(...runSpans.map((span) => span.left))
                  const lineRight = Math.max(...runSpans.map((span) => span.left + span.width))
                  if (!(lineRight > lineLeft)) return null
                  return (
                    <g key={`ruler-run-${group.id}-${run.startIndex}`}>
                      <line
                        x1={lineLeft}
                        y1={translationRulerMidY}
                        x2={lineRight}
                        y2={translationRulerMidY}
                        className="sequence-translation-ruler-line"
                      />
                      {runCells.map((cell) => {
                        const { center } = codonSpan(cell)
                        const major = cell.number % 5 === 0
                        const half = major ? 3 : 1.5
                        return (
                          <line
                            key={`tick-${cell.featureId}-${cell.number}-${cell.positions[0]}`}
                            x1={center}
                            y1={translationRulerMidY}
                            x2={center}
                            y2={translationRulerMidY + half}
                            className={major ? 'sequence-translation-ruler-tick-major' : 'sequence-translation-ruler-tick-minor'}
                          />
                        )
                      })}
                    </g>
                  )
                })}
              </svg>
            </div>
            <div
              className={`sequence-translation-aa${threeLetterAminoAcids ? ' is-three-letter' : ''}`}
              style={{
                fontSize: `${translationFontSizePx}px`,
                fontWeight: translationFontWeight,
                height: `${translationAaHeightPx}px`,
                lineHeight: `${translationAaHeightPx}px`,
              }}
            >
              {displayCells.map((displayCell) => {
                const { canonicalCell, fragmentIndex, ...cell } = displayCell
                const { left, width } = codonSpan(cell)
                if (!(width > 0)) return null
                const feature = featureById.get(canonicalCell.featureId)
                const translationStrand = feature?.translation
                  ? transcriptionStrandFromReadingFrame(feature.translation.readingFrame, feature.locations[0]?.strand)
                  : feature?.locations[0]?.strand ?? 'forward'
                const residue = formatAminoAcidCode(canonicalCell.aa, aminoAcidCodeFormat)
                return (
                  <button
                    type="button"
                    className={`sequence-translation-residue${translationStrand === 'reverse' ? ' is-reverse' : ''}${canonicalCell.aa === '*' ? ' is-stop' : ''}${translationDrag.isFragmentSelected(cell.positions, selectedRange, Boolean(cutStrandSelection)) ? ' selected' : ''}`}
                    key={`aa-${canonicalCell.featureId}-${canonicalCell.number}-${fragmentIndex}-${left}`}
                    style={{ left: `${left}px`, width: `${width}px` }}
                    title={`${feature ? featureDisplayName(feature) : group.id}\n${aminoAcidInfo(canonicalCell.aa).name} ${canonicalCell.number}`}
                    onContextMenu={(event) => openTranslationContextMenu(event, canonicalCell.featureId)}
                    onPointerDown={(event) => translationDrag.begin(canonicalCell, event, orderedGroupCells, cell.positions)}
                    onPointerEnter={(event) => {
                      setHoveredTranslationCodon({ positions: canonicalCell.positions, strand: translationStrand })
                      translationDrag.continueDrag(canonicalCell, event)
                    }}
                    onPointerLeave={() => setHoveredTranslationCodon(null)}
                    onPointerUp={translationDrag.finish}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (translationDrag.consumeSuppressedClick()) return
                      translationDrag.selectClick(canonicalCell, event, orderedGroupCells, cell.positions)
                    }}
                  >
                    {canonicalCell.aa === '*'
                      ? <span className="sequence-translation-stop-mark">{residue}</span>
                      : <span className="sequence-translation-residue-label">{residue}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )})}
      </>
    )
  }

  /** X at the boundary between template bases (cut happens between letters). */
  function rowCutX(cutPosition: number, rowStart: number) {
    if (useAlignmentMergedLayout && alignmentMergedLayout) {
      return templateIndexLeftPx(alignmentMergedLayout, cutPosition) + sequenceBaseStepPx / 2
    }
    return rowTrackInsetPx + (cutPosition - rowStart) * sequenceBaseStepPx
  }

  const recognitionHighlightClass = recognitionHighlightClassFor(hoveredRecognitionPositions, recognitionHighlightPositions)

  function renderSequenceEnzymeCallouts(
    callouts: SequenceLabelCallout[],
    laneHeight: number,
    rowSequenceWidthPx: number,
  ) {
    if (!callouts.length || laneHeight <= 0) return null
    return (
      <svg
        className="sequence-label-overlay sequence-label-overlay-above"
        width={rowSequenceWidthPx}
        height={laneHeight}
        aria-hidden={false}
      >
        <g className="sequence-enzyme-leaders" transform={`translate(0, ${laneHeight})`}>
          {callouts.map((callout) => {
            const selectedStack = selectedRestrictionSites.some(
              (site) => linearCutPosition(site) === linearCutPosition(callout.site),
            )
            const isLeaderHighlighted =
              callout.isStackLeader &&
              (selectedStack ||
                hoveredEnzymeStackId === callout.stackId ||
                (hoveredEnzymeName !== null &&
                  callout.site.enzyme.name === hoveredEnzymeName))
            if (!callout.isStackLeader) return null
            const outsideSequence = isOutsideLinearSequence(callout.site, record.topology, record.sequence.length)
            return callout.segments.map(([start, end], segmentIndex) => (
              <line
                key={`${callout.stackId}-${segmentIndex}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                className={`sequence-label-leader${selectedStack ? ' is-selected' : ''}${isLeaderHighlighted ? ' is-hovered' : ''}${outsideSequence ? ' is-outside-sequence' : ''}`}
              />
            ))
          })}
        </g>
        <g className="sequence-enzyme-labels" transform={`translate(0, ${laneHeight})`}>
          {callouts.map((callout) => {
            const isLabelHovered =
              hoveredEnzymeName !== null && callout.site.enzyme.name === hoveredEnzymeName
            const isLeaderHighlighted =
              callout.isStackLeader &&
              hoveredEnzymeName !== null &&
              (callout.site.enzyme.name === hoveredEnzymeName || hoveredEnzymeStackId === callout.stackId)
            const labelStyle = enzymeLabelDisplayStyle(callout.site, enzymePreferences, enzymeCounts)
            const selected = restrictionSiteIsSelected(callout.site, selectedRestrictionSites)
            return (
              <g
                key={`${callout.side}-${callout.index}-${callout.site.start}-${callout.stackIndex}`}
                className={sequenceEnzymeCalloutClassName(callout.site, record.topology, record.sequence.length, isLabelHovered, isLeaderHighlighted, labelStyle.bold, selected)}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault()
                  onRestrictionSelect(
                    restrictionSiteFromCalloutClick(
                      event,
                      callout.label,
                      callout.site,
                      restrictionSites,
                    ),
                    event.ctrlKey || event.metaKey || event.shiftKey,
                  )
                  onRestrictionHover(null)
                }}
                onDoubleClick={(event) => {
                  openEnzymeInfoFromCalloutGroup(
                    event,
                    callout.label,
                    callout.site.enzyme.name,
                    onEnzymeInfo,
                  )
                }}
                onPointerEnter={() => onRestrictionHover(siteKey(callout.site))}
                onPointerLeave={() => onRestrictionHover(null)}
              >
                <g onPointerMove={(event) => {
                  const hoveredSite = restrictionSiteFromCalloutClick(event, callout.label, callout.site, restrictionSites)
                  const labelBounds = event.currentTarget.closest('.sequence-enzyme-callout')?.getBoundingClientRect()
                  const row = event.currentTarget.closest('.sequence-row')
                  const strandBlockBounds = row?.querySelector('.sequence-strand-block')?.getBoundingClientRect()
                  const rowBounds = row?.getBoundingClientRect()
                  const sequenceBounds = labelBounds && strandBlockBounds && rowBounds
                    ? { labelTop: labelBounds.top, labelBottom: labelBounds.bottom, rowTop: strandBlockBounds.top, rowBottom: rowBounds.bottom }
                    : undefined
                  enzymeTooltip.hover(hoveredSite, enzymeCounts[hoveredSite.enzyme.name] ?? 0, event.clientX, event.clientY, 'above', isOutsideLinearSequence(hoveredSite, record.topology, record.sequence.length), sequenceBounds)
                }} onPointerLeave={enzymeTooltip.dismiss} onPointerDown={enzymeTooltip.dismiss}>
                {selected ? (
                  <SelectedMapCalloutLabel
                    label={callout.label}
                    x={callout.labelX}
                    y={callout.labelY}
                    textAnchor={callout.textAnchor}
                    fontSize={enzymeLabelFontSizePx}
                    fontWeight={labelStyle.bold ? uniqueEnzymeFontWeight : enzymeFontWeight}
                  />
                ) : (
                  <EnzymeCalloutLabelText
                    label={callout.label}
                    x={callout.labelX}
                    y={callout.labelY}
                    textAnchor={callout.textAnchor}
                    labelStyle={labelStyle}
                    fontSize={enzymeLabelFontSizePx}
                    fontWeight={labelStyle.bold ? uniqueEnzymeFontWeight : enzymeFontWeight}
                    onEnzymeInfo={onEnzymeInfo}
                  />
                )}
                </g>
              </g>
            )
          })}
        </g>
      </svg>
    )
  }

  function renderSequencePrimerFrames(
    placements: PrimerRowPlacement[],
    rowStart: number,
    rowLength: number,
    rowSequenceWidthPx: number,
    strand: 'forward' | 'reverse',
    laneHeight: number,
    _laneCount: number,
    rowKey: number,
    frameYOffset: number | ((placement: PrimerRowPlacement) => number) = 0,
  ) {
    if (!primersVisible || !placements.length || laneHeight <= 0) return null

    const frameOffsets = new Map<PrimerRowPlacement, number>()
    if (typeof frameYOffset === 'function') {
      // Placements are already packed against feature bands and one another by
      // computeRowTranslationLayout. Re-stacking reverse frames here would
      // count the same primer height twice and can push a row-spanning primer
      // into the next sequence row. The callback is still needed for clearance
      // below floating feature labels and for the outer enzyme-lane alignment.
      if (strand === 'reverse') {
        // A clearance adjustment is applied after the skyline has packed the
        // reverse lanes. If it moves an upper primer down, preserve the
        // already-reserved lane separation for every lower primer whose body
        // overlaps it horizontally; otherwise the lower body can enter the
        // upper primer's label band.
        reversePrimerFrameOffsets(placements, frameYOffset).forEach((offset, placement) => {
          frameOffsets.set(placement, offset)
        })
      } else {
        placements.forEach((placement) => frameOffsets.set(placement, frameYOffset(placement)))
      }
    }

    return (
      <svg
        className={`sequence-primer-overlay sequence-primer-overlay-${strand}`}
        width={rowSequenceWidthPx}
        height={laneHeight}
        aria-hidden={false}
      >
        {placements.map((placement) => {
          const { display } = placement
          const primerMetrics = primerFrameMetricsForDisplay(
            display,
            sequenceFontSizePx,
            sequenceBaseLineHeight,
          )
          const rowEnd = rowStart + rowLength
          const showArrow =
            strand === 'forward'
              ? display.templateSpanEnd <= rowEnd
              : display.templateSpanStart >= rowStart
          const bounds = primerFrameBounds(
            display,
            rowStart,
            rowLength,
            strand === 'reverse' && !useAlignmentMergedLayout ? 0 : rowTrackInsetPx,
            sequenceBaseStepPx,
            primerMetrics,
            strand,
            {
              layout: mergedPrimerLayoutCoords(rowSequenceWidthPx),
              showArrow,
              labelFontSizePx: primerLabelFontSizePx,
            },
          )
          if (!bounds) return null
          const integratedArrow = showArrow
          const frameLayers = primerFramePaths(
            display,
            rowStart,
            rowLength,
            strand === 'reverse' && !useAlignmentMergedLayout ? 0 : rowTrackInsetPx,
            sequenceBaseStepPx,
            primerMetrics,
            bounds,
            {
              strand,
              integrateArrow: integratedArrow,
              integrateHairpin: true,
              baseStepPx: sequenceBaseStepPx,
              layout: mergedPrimerLayoutCoords(rowSequenceWidthPx),
            },
          )
          const backgroundFillPath = primerFramePathsNeedBackgroundFill(frameLayers)
            ? primerFrameBackgroundFillPath(bounds, primerMetrics, strand, {
                left: placement.left,
                right: placement.right,
              })
            : null
          const firstAnnealedTemplateIndex = primerFirstAnnealedTemplateIndex(display)
          const showName =
            firstAnnealedTemplateIndex !== undefined &&
            firstAnnealedTemplateIndex >= rowStart &&
            firstAnnealedTemplateIndex < rowStart + rowLength
          const nameLabel = showName ? primerLabelMetrics(display.name, primerLabelFontSizePx) : null
          const laneYOffset =
            (typeof frameYOffset === 'function' ? (frameOffsets.get(placement) ?? 0) : frameYOffset) +
            placement.yOffset +
            (strand === 'forward' ? placement.laneHeight - placement.stackHeight : 0)
          return (
            <g
              key={`${display.primerId}-${display.strand}-${rowKey}-${placement.lane}`}
              className={`sequence-primer-frame${selectedPrimerIds.includes(display.primerId) || display.primerId === selectedPrimerId ? ' is-selected' : ''}`}
              style={{
                color: display.color,
                '--primer-dark-contrast-color': darkThemePrimerColor(display.color),
              } as CSSProperties}
              transform={laneYOffset ? `translate(0, ${laneYOffset})` : undefined}
              onPointerDown={(event) => {
                // Keep shift/ctrl multi-select from creating a native text selection across DNA/CDS.
                event.stopPropagation()
                event.preventDefault()
                window.getSelection()?.removeAllRanges()
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                event.preventDefault()
                onPrimerEdit(display.primerId)
              }}
              onClick={(event) => {
                event.stopPropagation()
                event.preventDefault()
                onPrimerSelect(display.primerId, event.ctrlKey || event.metaKey || event.shiftKey)
              }}
            >
              {backgroundFillPath && (
                <path key="frame-bg-fill" className="sequence-primer-frame-background" d={backgroundFillPath} />
              )}
              {frameLayers.fills.map((path, pathIndex) => (
                <path key={`frame-bg-${pathIndex}`} className="sequence-primer-frame-background" d={path} />
              ))}
              {frameLayers.outlines.map((path, pathIndex) => (
                <path key={`frame-${pathIndex}`} className="sequence-primer-frame-outline" d={path} />
              ))}
              {display.glyphs.map((glyph, glyphIndex) => {
                if (glyph.kind === 'template-gap') {
                  return null
                }
                if (!primerGlyphVisibleInRow(display, glyph, glyphIndex, rowStart, rowStart + rowLength)) return null

                const mergedLayoutCoords = mergedPrimerLayoutCoords(rowSequenceWidthPx)
                const x =
                  glyph.templateIndex !== undefined
                    ? mergedLayoutCoords
                      ? mergedLayoutCoords.templateCenterX(glyph.templateIndex)
                      : templateX(glyph.templateIndex, rowStart, strand === 'reverse' && !useAlignmentMergedLayout ? 0 : rowTrackInsetPx, sequenceBaseStepPx)
                    : primerGlyphX(
                        display,
                        glyph,
                        glyphIndex,
                        rowStart,
                        strand === 'reverse' && !useAlignmentMergedLayout ? 0 : rowTrackInsetPx,
                        sequenceBaseStepPx,
                        bounds,
                        mergedLayoutCoords,
                      )
                const y = glyphY(glyph, primerMetrics, strand, bounds.top)
                return (
                  <text
                    key={`${glyphIndex}-${glyph.char}-${glyph.kind}`}
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={`sequence-primer-base sequence-primer-base-${glyph.kind}`}
                  >
                    {glyph.char}
                  </text>
                )
              })}
              {showName && nameLabel && (
                <>
                  <rect
                    className="sequence-primer-name-background"
                    x={bounds.labelX - nameLabel.halfWidth}
                    y={bounds.labelY - nameLabel.halfHeight}
                    width={nameLabel.width}
                    height={nameLabel.height}
                    rx={2}
                  />
                  <text
                    x={bounds.labelX}
                    y={bounds.labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={`sequence-primer-name${contrastTextColor(display.color) === '#fff' ? ' primer-label-needs-light-ink' : ''}`}
                    style={{ fontSize: primerLabelFontSizePx, fontWeight: primerLabelFontWeight }}
                    onDoubleClick={(event) => {
                      event.stopPropagation()
                      onPrimerEdit(display.primerId)
                    }}
                  >
                    {display.name}
                  </text>
                </>
              )}
            </g>
          )
        })}
      </svg>
    )
  }

  function renderSequenceSgRnas(
    rowStart: number,
    rowSequenceWidthPx: number,
    strand: 'forward' | 'reverse',
    rowIndex: number,
  ) {
    const rowData = sgRnaLanesByRow.get(rowIndex)
    const segments = rowData?.[strand] ?? []
    const laneMap = strand === 'forward' ? rowData?.forwardLanes : rowData?.reverseLanes
    if (!segments.length || !laneMap) return null
    const height = sgRnaRowLaneHeightPx(laneMap.count)
    const merged = mergedPrimerLayoutCoords(rowSequenceWidthPx)
    const templateCenterX = merged?.templateCenterX
    const baseX = (position: number) => merged
      ? merged.templateCenterX(position)
      : rowTrackInsetPx + (position - rowStart + 0.5) * sequenceBaseStepPx
    const frameHeight = SG_RNA_SEQUENCE_FRAME_BODY_HEIGHT_PX
    const sgRnaLabelFontSizePx = 11
    return <svg
      className={`sequence-sgrna-overlay is-${strand}`}
      width={rowSequenceWidthPx}
      height={height}
      style={{ bottom: strand === 'forward' ? 0 : undefined, top: strand === 'reverse' ? 0 : undefined }}
      aria-label={`${strand} strand sgRNA mappings`}
    >
      {segments.map((segment, index) => {
        const lane = laneMap.lanes.get(segment.annotation.id) ?? 0
        const laneTop = lane * SG_RNA_SEQUENCE_LANE_HEIGHT_PX
        const frameTop = sgRnaSequenceFrameTop(laneTop, strand)
        const pamSegment = segment.annotation.pam
          ? segments.find((other) => other.annotation.id === segment.annotation.id && other.part === 'pam')
          : undefined
        const guideSegment = segments.find((other) => other.annotation.id === segment.annotation.id && other.part === 'guide')
        const guideLoc = segment.annotation.guide.locations[0]
        const pamLoc = segment.annotation.pam?.locations[0]
        const boundaryBp = guideLoc && pamLoc
          ? sgRnaGuidePamBoundaryBasePair(
              { start: guideLoc.start, end: guideLoc.end },
              { start: pamLoc.start, end: pamLoc.end },
            )
          : null
        const guideLeftOfPam = Boolean(
          boundaryBp !== null && guideSegment && pamSegment && guideSegment.end === pamSegment.start,
        )
        const pamLeftOfGuide = Boolean(
          boundaryBp !== null && guideSegment && pamSegment && pamSegment.end === guideSegment.start,
        )
        const sharesBoundaryInRow = guideLeftOfPam || pamLeftOfGuide
        const omitPadLeft = sharesBoundaryInRow && (
          (segment.part === 'guide' && pamLeftOfGuide) || (segment.part === 'pam' && guideLeftOfPam)
        )
        const omitPadRight = sharesBoundaryInRow && (
          (segment.part === 'guide' && guideLeftOfPam) || (segment.part === 'pam' && pamLeftOfGuide)
        )
        const frameBounds = sgRnaSequenceFrameHorizontalBounds(
          segment.start,
          segment.end,
          rowStart,
          rowTrackInsetPx,
          sequenceBaseStepPx,
          { omitPadLeft, omitPadRight },
        )
        const frameLeft = merged
          ? merged.templateCenterX(segment.start) - sequenceBaseStepPx / 2 - frameBounds.padLeft
          : frameBounds.left
        const frameRight = merged
          ? merged.templateCenterX(segment.end - 1) + sequenceBaseStepPx / 2 + frameBounds.padRight
          : frameBounds.right
        const boundaryX = boundaryBp !== null && sharesBoundaryInRow
          ? sgRnaGuidePamBoundaryX(
              boundaryBp,
              rowStart,
              rowTrackInsetPx,
              sequenceBaseStepPx,
              templateCenterX,
            )
          : null
        const selected = selectedFeatureId === segment.annotation.guide.id
          || selectedFeatureIds.includes(segment.annotation.guide.id)
          || (segment.annotation.pam && (selectedFeatureId === segment.annotation.pam.id || selectedFeatureIds.includes(segment.annotation.pam.id)))
        const showName = sgRnaSequenceShowsNameLabel(segment, segment.annotation)
        const nameLabel = showName ? primerLabelMetrics(segment.annotation.guide.name, sgRnaLabelFontSizePx) : null
        const guideNameBounds = guideSegment
          ? sgRnaSequenceFrameHorizontalBounds(
              guideSegment.start,
              guideSegment.end,
              rowStart,
              rowTrackInsetPx,
              sequenceBaseStepPx,
            )
          : null
        const guideNameLeft = guideNameBounds && guideSegment
          ? (merged
            ? merged.templateCenterX(guideSegment.start) - sequenceBaseStepPx / 2 - guideNameBounds.padLeft
            : guideNameBounds.left)
          : 0
        const guideNameRight = guideNameBounds && guideSegment
          ? (merged
            ? merged.templateCenterX(guideSegment.end - 1) + sequenceBaseStepPx / 2 + guideNameBounds.padRight
            : guideNameBounds.right)
          : 0
        const nameLabelX = showName && guideNameBounds ? sgRnaSequenceNameLabelX(guideNameLeft, guideNameRight) : 0
        const nameLabelY = sgRnaSequenceNameLabelY(strand, laneTop, frameTop)
        const drawSharedBoundary = boundaryX !== null && (
          (segment.part === 'guide' && guideLeftOfPam) || (segment.part === 'pam' && pamLeftOfGuide)
        )
        const frameBottom = frameTop + frameHeight
        const sharedBoundaryFrame = sharesBoundaryInRow && boundaryX !== null
          ? {
              segmentPart: segment.part,
              guideLeftOfPam,
              pamLeftOfGuide,
              frameLeft,
              frameRight,
              frameTop,
              frameBottom,
              boundaryX,
            }
          : null
        const fillPath = sharedBoundaryFrame ? sgRnaSharedBoundaryFillPath(sharedBoundaryFrame) : null
        const outlinePath = sharedBoundaryFrame ? sgRnaSharedBoundaryOutlinePath(sharedBoundaryFrame) : null
        return <g
          key={`${segment.annotation.id}-${segment.part}-${segment.start}-${index}`}
          className={`sequence-sgrna-frame${segment.part === 'pam' ? ' is-pam' : ''}${selected ? ' is-selected' : ''}`}
          onPointerEnter={() => setHoveredSgRnaId(segment.annotation.id)}
          onPointerLeave={() => setHoveredSgRnaId((current) => current === segment.annotation.id ? null : current)}
          onClick={(event) => { event.stopPropagation(); onFeatureSelect(segment.annotation.guide.id, event.shiftKey || event.ctrlKey || event.metaKey) }}
          onDoubleClick={(event) => { event.stopPropagation(); onFeatureEdit(segment.annotation.guide.id) }}
          onPointerDown={(event) => { event.stopPropagation(); event.preventDefault() }}
        >
          {showName && nameLabel && (
            <>
              <rect
                className="sequence-sgrna-name-background"
                x={nameLabelX - nameLabel.halfWidth}
                y={nameLabelY - nameLabel.halfHeight}
                width={nameLabel.width}
                height={nameLabel.height}
                rx={2}
              />
              <text
                x={nameLabelX}
                y={nameLabelY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="sequence-sgrna-name"
              >{segment.annotation.guide.name}</text>
            </>
          )}
          {sharesBoundaryInRow ? (
            <>
              {fillPath && (
                <path
                  className="sequence-sgrna-frame-fill"
                  d={fillPath}
                />
              )}
              {outlinePath && (
                <path
                  className="sequence-sgrna-frame-outline"
                  d={outlinePath}
                />
              )}
              {drawSharedBoundary && boundaryX !== null && (
                <line
                  className="sequence-sgrna-guide-pam-boundary"
                  x1={boundaryX}
                  y1={frameTop}
                  x2={boundaryX}
                  y2={frameBottom}
                />
              )}
            </>
          ) : (
            <rect
              className="sequence-sgrna-frame-closed"
              x={frameLeft}
              y={frameTop}
              width={Math.max(1, frameRight - frameLeft)}
              height={frameHeight}
              rx={SG_RNA_SEQUENCE_FRAME_CORNER_RADIUS_PX}
              ry={SG_RNA_SEQUENCE_FRAME_CORNER_RADIUS_PX}
            />
          )}
          {[...segment.bases].map((base, baseIndex) => <text
            key={baseIndex}
            x={baseX(segment.start + baseIndex)}
            y={frameTop + frameHeight / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="sequence-sgrna-base"
          >{base}</text>)}
          <title>{`${segment.annotation.guide.name} · ${segment.part === 'pam' ? `PAM ${segment.annotation.observedPam}` : 'guide'} · ${segment.annotation.nuclease}`}</title>
        </g>
      })}
    </svg>
  }

  function renderSequenceRuler(
    rowStart: number,
    rowLength: number,
    rowSequenceWidthPx: number,
    tickStart = rowStart,
    tickEnd = rowStart + rowLength,
    mergedLayout?: MergedInsertionLayout,
  ) {
    const midY = sequenceRulerHeightPx / 2
    const start = Math.max(rowStart, tickStart)
    const end = Math.min(rowStart + rowLength, tickEnd)
    const isLinear = record.topology === 'linear'
    const sequenceLength = record.sequence.length

    if (mergedLayout) {
      const firstTickX = templateIndexLeftPx(mergedLayout, start) + 0.5 * sequenceBaseStepPx
      const lastTickX =
        templateIndexLeftPx(mergedLayout, Math.max(start, end - 1)) + 0.5 * sequenceBaseStepPx
      const rulerLeft = isLinear ? firstTickX : templateIndexLeftPx(mergedLayout, rowStart)
      const lastTemplateIndex = Math.min(rowStart + rowLength - 1, mergedLayout.templateLength - 1)
      const rulerRight = isLinear
        ? lastTickX
        : templateIndexLeftPx(mergedLayout, Math.max(rowStart, lastTemplateIndex)) + sequenceBaseStepPx

      return (
        <svg className="sequence-ruler" width={rowSequenceWidthPx} height={sequenceRulerHeightPx} aria-hidden>
          <line x1={rulerLeft} y1={midY} x2={rulerRight} y2={midY} className="sequence-ruler-line" />
          {Array.from({ length: Math.max(0, end - start) }, (_, index) => {
            const position = start + index
            const x = templateIndexLeftPx(mergedLayout, position) + 0.5 * sequenceBaseStepPx
            const atLinearStart = isLinear && position === 0
            const atLinearEnd = isLinear && position === sequenceLength - 1
            const major = atLinearStart || atLinearEnd || (position + 1) % 5 === 0
            const half = major ? 5 : 2.5
            return (
              <line
                key={position}
                x1={x}
                y1={midY - half}
                x2={x}
                y2={midY + half}
                className={major ? 'sequence-ruler-tick-major' : 'sequence-ruler-tick-minor'}
              />
            )
          })}
        </svg>
      )
    }

    const firstTickX = rowTrackInsetPx + 0.5 * sequenceBaseStepPx
    const lastTickX = rowTrackInsetPx + (rowLength - 0.5) * sequenceBaseStepPx
    // Linear: line runs tick-to-tick (no leading/trailing stub that reads as circular continuity).
    const rulerLeft = isLinear ? firstTickX : rowTrackInsetPx
    const rulerRight = isLinear ? lastTickX : rowTrackInsetPx + rowLength * sequenceBaseStepPx

    return (
      <svg className="sequence-ruler" width={rowSequenceWidthPx} height={sequenceRulerHeightPx} aria-hidden>
        <line x1={rulerLeft} y1={midY} x2={Math.max(rulerLeft, rulerRight)} y2={midY} className="sequence-ruler-line" />
        {Array.from({ length: Math.max(0, end - start) }, (_, index) => {
          const position = start + index
          const baseIndex = position - rowStart
          const x = rowTrackInsetPx + (baseIndex + 0.5) * sequenceBaseStepPx
          const atLinearStart = isLinear && position === 0
          const atLinearEnd = isLinear && position === sequenceLength - 1
          const major = atLinearStart || atLinearEnd || (position + 1) % 5 === 0
          const half = major ? 5 : 2.5
          return (
            <line
              key={position}
              x1={x}
              y1={midY - half}
              x2={x}
              y2={midY + half}
              className={major ? 'sequence-ruler-tick-major' : 'sequence-ruler-tick-minor'}
            />
          )
        })}
      </svg>
    )
  }

  function renderSequenceBaseSpans(
    row: string,
    offset: number,
    rowEnd: number,
    strand: 'forward' | 'reverse',
    mapBase: (base: string, position: number) => string,
    rowSequenceWidthPx: number,
  ) {
    if (useAlignmentMergedLayout && alignmentVisibleEntries) {
      const traceOrientation = alignmentTraceDisplay?.alignment.orientation ?? 'forward'
      const traceBaseCalls = alignmentTraceDisplay?.baseCalls
      const traceAlignment = alignmentTraceDisplay?.alignment
      return (
        <span
          className={`sequence-bases sequence-bases-alignment-layout${alignmentTraceDisplay ? ' sequence-bases-trace-annotation' : ''}`}
          style={{ position: 'relative', width: rowSequenceWidthPx, height: sequenceStrandRowHeightPx, display: 'block' }}
        >
          {alignmentVisibleEntries.map((entry) => {
            if (traceAlignment && !traceAnnotationSlotVisible(entry.slot, traceAlignment)) {
              return null
            }
            if (entry.slot.kind === 'insertion-gap') {
              if (alignmentTraceDisplay && alignmentTraceLookup && traceBaseCalls) {
                const traceColumn = resolveTraceColumnAtMergedSlotFromLookup(alignmentTraceLookup, entry.slot)
                if (traceColumn) {
                  const renderedBase = traceBaseForColumn(traceColumn, traceBaseCalls, traceOrientation)
                  const mappedBase = mapTraceAnnotationBase(renderedBase, entry.slot.anchorTemplateIndex, mapBase)
                  const isError = isVariantErrorColumn(traceColumn)
                  const presentation = basePresentation(
                    mappedBase,
                    entry.slot.anchorTemplateIndex,
                    strand,
                    isError ? 'is-variant-error' : '',
                  )
                  return (
                    <span
                      key={`trace-gap-${entry.slot.anchorTemplateIndex}-${entry.slot.slotIndex}`}
                      className={alignmentBaseClassName(presentation.className)}
                      style={{ ...presentation.style, position: 'absolute', left: entry.leftPx, width: sequenceBaseStepPx, top: 0 }}
                    >
                      {mappedBase || '\u00a0'}
                    </span>
                  )
                }
              }
              return (
                <span
                  key={`gap-${entry.slot.anchorTemplateIndex}-${entry.slot.slotIndex}`}
                  className="sequence-base alignment-gap-base"
                  style={{ position: 'absolute', left: entry.leftPx, width: sequenceBaseStepPx, top: 0 }}
                >
                  {'\u00a0'}
                </span>
              )
            }
            const position = entry.slot.templateIndex
            if (position < offset || position >= rowEnd) return null
            let base: string
            let variantError = false
            if (alignmentTraceDisplay && alignmentTraceLookup && traceBaseCalls) {
              const traceColumn = resolveTraceColumnAtMergedSlotFromLookup(alignmentTraceLookup, entry.slot)
              if (traceColumn) {
                base = traceBaseForColumn(traceColumn, traceBaseCalls, traceOrientation)
                variantError = isVariantErrorColumn(traceColumn)
              } else {
                base = '·'
              }
            } else {
              base = row[position - offset]
            }
            const renderedBase = mapTraceAnnotationBase(base, position, mapBase)
            const recognitionClass = recognitionHighlightClass(position)
            const presentation = basePresentation(
              renderedBase,
              position,
              strand,
              `${recognitionClass}${variantError ? ' is-variant-error' : ''}`.trim(),
            )
            return (
              <span
                key={position}
                className={alignmentBaseClassName(presentation.className)}
                style={{ ...presentation.style, position: 'absolute', left: entry.leftPx, width: sequenceBaseStepPx, top: 0 }}
              >
                {renderedBase}
              </span>
            )
          })}
          {strand === 'forward' && !cutStrandSelection && alignmentCaretEdge && selectedRange?.start === selectedRange?.end && selectedRange?.start === alignmentCaretEdge.boundary && alignmentMergedLayout && (alignmentMergedLayout.anchorInsertionCounts.get(alignmentCaretEdge.boundary - 1) ?? 0) > 0 ? (
            <span className="sequence-caret-marker" style={{ position: 'absolute', top: 0, height: sequenceStrandRowHeightPx, left: insertionGapLeftPx(alignmentMergedLayout, alignmentCaretEdge.boundary - 1, alignmentCaretEdge.edge === 'left' ? 0 : (alignmentMergedLayout.anchorInsertionCounts.get(alignmentCaretEdge.boundary - 1) ?? 0)) }} />
          ) : null}
        </span>
      )
    }

    const visibleStart = horizontalMode ? horizontalVisibleRange.start : offset
    const visibleEnd = horizontalMode ? horizontalVisibleRange.end : rowEnd
    const sliceStart = Math.max(offset, visibleStart)
    const sliceEnd = Math.min(rowEnd, visibleEnd)
    const bases = row.slice(sliceStart - offset, sliceEnd - offset)
    return (
      <span
        className={`sequence-bases${horizontalMode ? ' sequence-bases-horizontal-virtual' : ''}`}
        style={
          horizontalMode
            ? ({
                paddingLeft: `${sliceStart * sequenceBaseStepPx}px`,
                width: `${row.length * sequenceBaseStepPx}px`,
                boxSizing: 'border-box',
              } as CSSProperties)
            : undefined
        }
      >
        {bases.split('').map((base, baseIndex) => {
          const position = sliceStart + baseIndex
          const renderedBase = mapBase(base, position)
          const recognitionClass = recognitionHighlightClass(position)
          const presentation = basePresentation(renderedBase, position, strand, recognitionClass)
          const endVisible =
            !linearDnaEnds || isDnaEndBaseVisible(position, strand, linearDnaEnds, record.sequence.length)
          return (
            <span
              key={position}
              className={`${presentation.className}${endVisible ? '' : ' dna-end-base-hidden'}`.trim()}
              style={presentation.style}
            >
              {endVisible ? renderedBase : '\u00a0'}
            </span>
          )
        })}
      </span>
    )
  }

  function renderFeatureHoverBrackets(rowStart: number, rowEnd: number) {
    const feature = hoveredFeatureId ? annotationFeatureById.get(hoveredFeatureId) : undefined
    if (!feature || !feature.locations.length) return null
    const start = Math.min(...feature.locations.map((location) => location.start))
    const end = Math.max(...feature.locations.map((location) => location.end))
    const showLeft = start >= rowStart && start < rowEnd
    const showRight = end > rowStart && end <= rowEnd
    if (!showLeft && !showRight) return null
    return (
      <div className="sequence-feature-hover-brackets" aria-hidden="true">
        {showLeft ? (
          <span
            className="sequence-feature-hover-bracket is-left"
            style={{ left: rowTrackInsetPx + (start - rowStart) * sequenceBaseStepPx }}
          />
        ) : null}
        {showRight ? (
          <span
            className="sequence-feature-hover-bracket is-right"
            style={{ left: rowTrackInsetPx + (end - rowStart) * sequenceBaseStepPx }}
          />
        ) : null}
      </div>
    )
  }

  function pointerInfoFromRowEvent(
    event: ReactPointerEvent<HTMLDivElement>,
    rowStart: number,
    rowLength: number,
  ) {
    const block = event.currentTarget
    const blockRect = block.getBoundingClientRect()
    const localY = event.clientY - blockRect.top
    const strand: 'forward' | 'reverse' =
      localY <= sequenceStrandRowHeightPx + sequenceRulerHeightPx ? 'forward' : 'reverse'

    if (useAlignmentMergedLayout && alignmentMergedLayout) {
      const localX = event.clientX - blockRect.left
      const hit = templateBoundaryAtMergedX(
        alignmentMergedLayout,
        localX,
        horizontalVisibleRange.start,
        horizontalVisibleRange.end,
      )
      if (!hit) return null
      return {
        x: event.clientX,
        y: event.clientY,
        position: hit.boundary,
        hoverBase: hit.hoverBase,
        gapEdge: hit.gapEdge,
        strand,
      }
    }

    // Hit-test against the rendered bases strip (not strand-block + assumed label inset).
    // Fixed inset math drifts from CSS grid/gaps and makes boundaries feel shifted sideways.
    const basesEls = block.querySelectorAll<HTMLElement>('.sequence-bases')
    const basesEl =
      strand === 'forward'
        ? basesEls.item(0)
        : basesEls.item(Math.max(0, basesEls.length - 1))
    if (!basesEl || rowLength <= 0) return null

    const basesRect = basesEl.getBoundingClientRect()
    const x = event.clientX - basesRect.left
    if (x < 0) return null

    const firstCell = basesEl.querySelector(':scope > span')
    const measuredStep = firstCell?.getBoundingClientRect().width ?? 0
    const step = measuredStep > 0.5 ? measuredStep : sequenceBaseStepPx
    // Nearest inter-base boundary: aim between letters. Right half of letter N → seam after N
    // (drag right does not include N); left half of letter N → seam before N (drag left does not include N).
    const boundaryIndex = Math.max(0, Math.min(rowLength, Math.round(x / step)))
    const hoverIndex = Math.max(0, Math.min(rowLength - 1, Math.floor(x / step)))

    return {
      x: event.clientX,
      y: event.clientY,
      position: rowStart + boundaryIndex,
      hoverBase: rowStart + hoverIndex,
      strand,
    }
  }

  /** Hit-test from viewport coords — used when the pointer leaves a strand row (edge auto-scroll). */
  function pointerInfoFromClientPoint(clientX: number, clientY: number) {
    const container = containerRef.current
    if (!container) return null

    const rows = container.querySelectorAll<HTMLElement>('.sequence-row')
    if (!rows.length) return null

    let bestRow: HTMLElement | null = null
    let bestDist = Infinity
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      if (clientY >= rect.top && clientY <= rect.bottom) {
        bestRow = row
        break
      }
      const dist = clientY < rect.top ? rect.top - clientY : clientY - rect.bottom
      if (dist < bestDist) {
        bestDist = dist
        bestRow = row
      }
    }
    if (!bestRow) return null

    const rowStart = Number(bestRow.dataset.rowStart ?? 0)
    const rowEnd = Number(bestRow.dataset.rowEnd ?? rowStart)
    const rowLength = Math.max(0, rowEnd - rowStart)
    if (rowLength <= 0) {
      return {
        x: clientX,
        y: clientY,
        position: Math.max(0, Math.min(record.sequence.length, rowStart)),
        hoverBase: Math.max(0, Math.min(record.sequence.length - 1, rowStart)),
        strand: 'forward' as const,
      }
    }

    if (useAlignmentMergedLayout && alignmentMergedLayout) {
      const rowRect = bestRow.getBoundingClientRect()
      const localX = clientX - rowRect.left
      const hit =
        templateBoundaryAtMergedX(
          alignmentMergedLayout,
          localX,
          horizontalVisibleRange.start,
          horizontalVisibleRange.end,
        )
      const fallback = Math.max(0, Math.min(record.sequence.length - 1, rowStart))
      return { x: clientX, y: clientY, position: hit?.boundary ?? fallback, hoverBase: hit?.hoverBase ?? fallback, strand: 'forward' as const }
    }

    const basesEl = bestRow.querySelector<HTMLElement>('.sequence-bases')
    if (basesEl) {
      const basesRect = basesEl.getBoundingClientRect()
      const x = clientX - basesRect.left
      const firstCell = basesEl.querySelector(':scope > span')
      const measuredStep = firstCell?.getBoundingClientRect().width ?? 0
      const step = measuredStep > 0.5 ? measuredStep : sequenceBaseStepPx
      const boundaryIndex = Math.max(0, Math.min(rowLength, Math.round(x / step)))
      const hoverIndex = Math.max(0, Math.min(rowLength - 1, Math.floor(Math.max(0, x) / step)))
      const strandBlock = bestRow.querySelector<HTMLElement>('.sequence-strand-block')
      let strand: 'forward' | 'reverse' = 'forward'
      if (strandBlock) {
        const blockRect = strandBlock.getBoundingClientRect()
        const localY = clientY - blockRect.top
        if (localY > sequenceStrandRowHeightPx + sequenceRulerHeightPx) strand = 'reverse'
      }
      return {
        x: clientX,
        y: clientY,
        position: rowStart + boundaryIndex,
        hoverBase: rowStart + hoverIndex,
        strand,
      }
    }

    // Placeholder / unscrolled virtual row: estimate from track inset + base step.
    const rowRect = bestRow.getBoundingClientRect()
    const x = clientX - rowRect.left - rowTrackInsetPx
    const boundaryIndex = Math.max(0, Math.min(rowLength, Math.round(x / sequenceBaseStepPx)))
    const hoverIndex = Math.max(0, Math.min(rowLength - 1, Math.floor(Math.max(0, x) / sequenceBaseStepPx)))
    return {
      x: clientX,
      y: clientY,
      position: rowStart + boundaryIndex,
      hoverBase: rowStart + hoverIndex,
      strand: 'forward' as const,
    }
  }

  function stopSelectionAutoScroll() {
    if (autoScrollRafRef.current) {
      window.cancelAnimationFrame(autoScrollRafRef.current)
      autoScrollRafRef.current = 0
    }
  }

  function syncDragSelectionFromClient(clientX: number, clientY: number) {
    if (dragStartRef.current === null) return

    const origin = dragOriginClientRef.current
    const pixelTravel = origin ? Math.hypot(clientX - origin.x, clientY - origin.y) : 0
    const POINTER_CLICK_SLOP_PX = 4
    if (pixelTravel <= POINTER_CLICK_SLOP_PX) return

    const pointer = pointerInfoFromClientPoint(clientX, clientY)
    if (!pointer) return

    scheduleBaseHover({
      x: pointer.x,
      y: pointer.y,
      position: pointer.hoverBase,
      strand: pointer.strand,
    })

    if (pointer.position === dragStartRef.current && !dragMovedRef.current) return

    dragMovedRef.current = true
    dragEndRef.current = pointer.position
    window.getSelection()?.removeAllRanges()
    updateSelection(dragStartRef.current, pointer.position)
  }

  function selectionDragScrollHost(container: HTMLElement) {
    let node: HTMLElement | null = container
    while (node) {
      const style = window.getComputedStyle(node)
      const canY = style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay'
      const canX = style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowX === 'overlay'
      if (canY || canX) return node
      node = node.parentElement
    }
    return resolveSequenceScrollHost(container)
  }

  function tickSelectionAutoScroll() {
    autoScrollRafRef.current = 0
    if (dragStartRef.current === null) return
    const client = dragClientRef.current
    const container = containerRef.current
    if (!client || !container) return

    const scrollHost = selectionDragScrollHost(container)
    const rect = scrollHost.getBoundingClientRect()
    const EDGE_PX = 40
    const MAX_STEP_PX = 32
    const { x, y } = client

    let dy = 0
    let dx = 0
    if (y < rect.top + EDGE_PX) {
      const t = Math.min(1, (rect.top + EDGE_PX - y) / EDGE_PX)
      dy = -Math.ceil(MAX_STEP_PX * t * t)
    } else if (y > rect.bottom - EDGE_PX) {
      const t = Math.min(1, (y - (rect.bottom - EDGE_PX)) / EDGE_PX)
      dy = Math.ceil(MAX_STEP_PX * t * t)
    }
    if (x < rect.left + EDGE_PX) {
      const t = Math.min(1, (rect.left + EDGE_PX - x) / EDGE_PX)
      dx = -Math.ceil(MAX_STEP_PX * t * t)
    } else if (x > rect.right - EDGE_PX) {
      const t = Math.min(1, (x - (rect.right - EDGE_PX)) / EDGE_PX)
      dx = Math.ceil(MAX_STEP_PX * t * t)
    }

    let scrolled = false
    const maxTop = Math.max(0, scrollHost.scrollHeight - scrollHost.clientHeight)
    const maxLeft = Math.max(0, scrollHost.scrollWidth - scrollHost.clientWidth)
    if (dy !== 0) {
      const nextTop = Math.max(0, Math.min(maxTop, scrollHost.scrollTop + dy))
      if (nextTop !== scrollHost.scrollTop) {
        scrollHost.scrollTop = nextTop
        scrolled = true
      }
    }
    if (dx !== 0) {
      const nextLeft = Math.max(0, Math.min(maxLeft, scrollHost.scrollLeft + dx))
      if (nextLeft !== scrollHost.scrollLeft) {
        scrollHost.scrollLeft = nextLeft
        scrolled = true
      }
    }

    // Content moves under a held pointer at the edge — re-hit-test every frame.
    syncDragSelectionFromClient(x, y)

    const canScrollMore =
      (dy < 0 && scrollHost.scrollTop > 0) ||
      (dy > 0 && scrollHost.scrollTop < maxTop) ||
      (dx < 0 && scrollHost.scrollLeft > 0) ||
      (dx > 0 && scrollHost.scrollLeft < maxLeft)
    if (dragStartRef.current !== null && (scrolled || canScrollMore)) {
      autoScrollRafRef.current = window.requestAnimationFrame(() => {
        tickSelectionAutoScrollRef.current()
      })
    }
  }

  function ensureSelectionAutoScroll() {
    if (autoScrollRafRef.current || dragStartRef.current === null || !dragClientRef.current) return
    const container = containerRef.current
    if (!container) return
    const scrollHost = selectionDragScrollHost(container)
    const rect = scrollHost.getBoundingClientRect()
    const EDGE_PX = 40
    const { x, y } = dragClientRef.current
    const inEdge =
      y < rect.top + EDGE_PX ||
      y > rect.bottom - EDGE_PX ||
      x < rect.left + EDGE_PX ||
      x > rect.right - EDGE_PX
    if (!inEdge) return
    autoScrollRafRef.current = window.requestAnimationFrame(() => {
      tickSelectionAutoScrollRef.current()
    })
  }

  function finishRowPointerDrag(endPosition: number | null) {
    stopSelectionAutoScroll()
    dragClientRef.current = null
    const start = dragStartRef.current
    if (start === null) return
    const end = endPosition ?? dragEndRef.current ?? start
    const extendSelection = extendSelectionRef.current
    dragStartRef.current = null
    dragEndRef.current = null
    dragOriginClientRef.current = null
    extendSelectionRef.current = false
    const moved = dragMovedRef.current
    dragMovedRef.current = false
    setDragStart(null)
    // commitPointerSelection reads dragMovedRef; restore the value for this commit.
    dragMovedRef.current = moved
    commitPointerSelection(start, end, extendSelection)
    dragMovedRef.current = false
  }

  useEffect(() => {
    tickSelectionAutoScrollRef.current = tickSelectionAutoScroll
  })

  const onWindowPointerMoveDuringDrag = useEffectEvent((event: PointerEvent) => {
    if (dragStartRef.current === null) return
    dragClientRef.current = { x: event.clientX, y: event.clientY }
    // Prefer the live strand-row hit-test when the pointer is still over a row;
    // fall back to geometry-based lookup when it leaves (past viewport / chrome).
    const target = event.target
    if (!(target instanceof Element) || !target.closest('.sequence-strand-block')) {
      syncDragSelectionFromClient(event.clientX, event.clientY)
    }
    ensureSelectionAutoScroll()
  })

  const onWindowPointerUpDuringDrag = useEffectEvent(() => {
    finishRowPointerDrag(null)
  })

  useEffect(() => {
    if (dragStart === null) return
    function onWindowPointerMove(event: PointerEvent) {
      onWindowPointerMoveDuringDrag(event)
    }
    function onWindowPointerUp() {
      onWindowPointerUpDuringDrag()
    }
    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerUp)
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointercancel', onWindowPointerUp)
      stopSelectionAutoScroll()
    }
  }, [dragStart])

  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const blockNativeSelect = (event: Event) => {
      event.preventDefault()
    }
    root.addEventListener('selectstart', blockNativeSelect)
    return () => root.removeEventListener('selectstart', blockNativeSelect)
  }, [])

  function handleRowPointerMove(
    event: ReactPointerEvent<HTMLDivElement>,
    rowStart: number,
    rowLength: number,
  ) {
    const pointer = pointerInfoFromRowEvent(event, rowStart, rowLength)
    if (pointer) {
      scheduleBaseHover({
        x: pointer.x,
        y: pointer.y,
        position: pointer.hoverBase,
        strand: pointer.strand,
      })
    } else {
      scheduleBaseHover(null)
    }
    if (dragStartRef.current === null || event.buttons !== 1) return

    dragClientRef.current = { x: event.clientX, y: event.clientY }
    ensureSelectionAutoScroll()

    if (!pointer) {
      syncDragSelectionFromClient(event.clientX, event.clientY)
      return
    }

    const origin = dragOriginClientRef.current
    const pixelTravel = origin
      ? Math.hypot(event.clientX - origin.x, event.clientY - origin.y)
      : 0
    // Ignore sub-cell jitter so a click near a letter boundary does not become a 2-base selection.
    const POINTER_CLICK_SLOP_PX = 4
    if (pixelTravel <= POINTER_CLICK_SLOP_PX) return
    if (pointer.position === dragStartRef.current && !dragMovedRef.current) return

    dragMovedRef.current = true
    dragEndRef.current = pointer.position
    // Native selection can still grow across feature/enzyme text while dragging.
    window.getSelection()?.removeAllRanges()
    updateSelection(dragStartRef.current, pointer.position)
  }

  function handleRowPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    rowStart: number,
    rowLength: number,
  ) {
    containerRef.current?.focus()
    const pointer = pointerInfoFromRowEvent(event, rowStart, rowLength)
    if (!pointer) return
    setAlignmentCaretEdge('gapEdge' in pointer && pointer.gapEdge ? { boundary: pointer.position, edge: pointer.gapEdge } : null)
    // Stop OS/browser text selection of bases + neighboring labels while dragging.
    event.preventDefault()
    window.getSelection()?.removeAllRanges()
    containerRef.current?.focus()
    dragMovedRef.current = false
    extendSelectionRef.current = event.shiftKey || event.ctrlKey || event.metaKey
    dragOriginClientRef.current = { x: event.clientX, y: event.clientY }
    dragClientRef.current = { x: event.clientX, y: event.clientY }
    dragEndRef.current = pointer.position
    dragStartRef.current = pointer.position
    setDragStart(pointer.position)
    scheduleBaseHover({
      x: pointer.x,
      y: pointer.y,
      position: pointer.hoverBase,
      strand: pointer.strand,
    })
  }

  function handleRowPointerUp(
    event: ReactPointerEvent<HTMLDivElement>,
    rowStart: number,
    rowLength: number,
  ) {
    if (dragStartRef.current === null) return
    const pointer = pointerInfoFromRowEvent(event, rowStart, rowLength)
    // Clicks that never left the slop zone commit the original boundary (caret).
    const end = dragMovedRef.current ? (pointer?.position ?? null) : dragStartRef.current
    finishRowPointerDrag(end)
  }

  function renderCutOverlay(rowStart: number, rowEnd: number) {
    return <SequenceCutOverlay
      rowStart={rowStart}
      rowEnd={rowEnd}
      sequenceWidthPx={sequenceWidthPx}
      sequenceFontSizePx={sequenceFontSizePx}
      sequenceStrandRowHeightPx={sequenceStrandRowHeightPx}
      sequenceRulerHeightPx={sequenceRulerHeightPx}
      selectedRestrictionSites={selectedRestrictionSites}
      hoveredSite={hoveredSite}
      hoveredEnzymeStackId={hoveredEnzymeStackId}
      rowCutX={rowCutX}
    />
  }

  function renderSgRnaCuts(rowStart: number, rowEnd: number) {
    const boundaryX = (position: number) => useAlignmentMergedLayout && alignmentMergedLayout
      ? templateIndexLeftPx(alignmentMergedLayout, position)
      : rowCutX(position, rowStart)
    const annotations = [...new Map(sgRnaSegments.map((segment) => [segment.annotation.id, segment.annotation])).values()]
    const active = annotations.filter((annotation) => hoveredSgRnaId === annotation.id ||
      selectedFeatureId === annotation.guide.id || selectedFeatureIds.includes(annotation.guide.id) ||
      (annotation.pam && (selectedFeatureId === annotation.pam.id || selectedFeatureIds.includes(annotation.pam.id))))
    return <>
      {active.map((annotation) => {
        const cas12 = sgRnaCas12aIllustrativeCuts(annotation, record.sequence.length, record.topology)
        if (cas12) {
          const forward = annotation.guide.locations[0]?.strand === 'forward'
          return (['nonTarget', 'target'] as const).map((kind) => {
            const cut = cas12[kind]
            if (cut === null || cut < rowStart || cut > rowEnd || (cut === rowEnd && rowEnd < record.sequence.length)) return null
            const top = kind === 'nonTarget' ? forward : !forward
            return <span key={`${annotation.id}-${kind}`} className="sequence-sgrna-cut" style={{ left: boundaryX(cut), top: top ? 0 : '50%', bottom: top ? '50%' : 0 }} aria-label={`Illustrative Cas12a ${kind === 'target' ? 'target' : 'non-target'} strand cut`} />
          })
        }
        const cut = sgRnaNominalCut(annotation, record.sequence.length, record.topology)
        if (cut === null || cut < rowStart || cut >= rowEnd) return null
        return <span key={annotation.id} className="sequence-sgrna-cut" style={{ left: boundaryX(cut) }} aria-label={`Nominal ${annotation.nuclease} cleavage position`} />
      })}
    </>
  }

  function renderSgRnaPopover(rowStart: number, rowSequenceWidthPx: number, strand: 'forward' | 'reverse', rowIndex: number) {
    const annotations = [...new Map(sgRnaSegments.map((segment) => [segment.annotation.id, segment.annotation])).values()]
    const active = annotations.filter((annotation) => hoveredSgRnaId === annotation.id ||
      selectedFeatureId === annotation.guide.id || selectedFeatureIds.includes(annotation.guide.id) ||
      (annotation.pam && (selectedFeatureId === annotation.pam.id || selectedFeatureIds.includes(annotation.pam.id))))
    const details = active.find((annotation) => annotation.id === hoveredSgRnaId) ?? active[0]
    const rowData = sgRnaLanesByRow.get(rowIndex)
    const laneMap = strand === 'forward' ? rowData?.forwardLanes : rowData?.reverseLanes
    const segment = rowData?.[strand].find((item) => item.annotation.id === details?.id && sgRnaSequenceShowsNameLabel(item, item.annotation))
    if (!details || !segment || !laneMap) return null
    const laneTop = (laneMap.lanes.get(details.id) ?? 0) * SG_RNA_SEQUENCE_LANE_HEIGHT_PX
    const frameTop = sgRnaSequenceFrameTop(laneTop, strand)
    const labelY = sgRnaSequenceNameLabelY(strand, laneTop, frameTop)
    const labelMetrics = primerLabelMetrics(details.guide.name, 11)
    const bounds = sgRnaSequenceFrameHorizontalBounds(segment.start, segment.end, rowStart, rowTrackInsetPx, sequenceBaseStepPx)
    const merged = mergedPrimerLayoutCoords(rowSequenceWidthPx)
    const left = merged ? merged.templateCenterX(segment.start) - sequenceBaseStepPx / 2 - bounds.padLeft : bounds.left
    const right = merged ? merged.templateCenterX(segment.end - 1) + sequenceBaseStepPx / 2 + bounds.padRight : bounds.right
    const x = sgRnaSequenceNameLabelX(left, right)
    const cut = sgRnaNominalCut(details, record.sequence.length, record.topology)
    const cas12Cuts = sgRnaCas12aIllustrativeCuts(details, record.sequence.length, record.topology)
    const vertical = strand === 'forward'
      ? { bottom: sgRnaRowLaneHeightPx(laneMap.count) - labelY + labelMetrics.halfHeight + 4 }
      : { top: labelY + labelMetrics.halfHeight + 4 }
    return <div className={`sequence-sgrna-cut-popover is-${strand}`} style={{ left: x, ...vertical }} role="note">
          <strong>{details.guide.name} · {details.nuclease}</strong>
          {cut !== null ? <>
            <div>Nominal cut: 3 bp upstream of PAM</div>
            <div>Cas9 breaks can be blunt or staggered; the exact strand cuts can vary.</div>
            <div>Break probabilities are not calculated.</div>
          </> : cas12Cuts ? <>
            <div>Illustrative staggered cuts: 18 nt on the non-target strand and 23 nt on the target strand from the PAM.</div>
            <div>Positions vary by Cas12a variant and target; cuts outside the sequence are not shown.</div>
            {details.observedPam.toUpperCase() === 'TTTT' && <div>TTTT is a non-canonical PAM; activity depends on the Cas12a variant and may be lower.</div>}
            <div>Break probabilities are not calculated.</div>
          </> : <>
            <div>A nominal cut position and break probabilities are not available for this nuclease or target.</div>
          </>}
        </div>
  }

  function basePresentation(base: string, position: number, strand: 'forward' | 'reverse', extraClass = '') {
    let style: CSSProperties | undefined
    const customStrandColor = strandColorAtPosition(
      record.strandColors,
      position,
      strand,
      record.sequence.length,
      record.topology,
    )
    if (displaySettings.dnaColors.enabled) {
      if (displaySettings.dnaColors.mode === 'user') {
        if (customStrandColor) style = { color: customStrandColor }
      } else if (customStrandColor) {
        style = { color: customStrandColor }
      } else if (displaySettings.dnaColors.mode === 'history') {
        style = { color: strand === 'forward' ? '#2563eb' : '#dc2626' }
      } else {
        const normalized = base.toUpperCase() as keyof DnaColorPalette
        style = { color: displaySettings.dnaColors.palette[normalized] ?? 'var(--vg-text)' }
      }
    }
    const showCaret =
      strand === 'forward' &&
      !cutStrandSelection &&
      selectedRange !== null &&
      selectedRange.start === selectedRange.end &&
      !(useAlignmentMergedLayout && alignmentCaretEdge?.boundary === selectedRange.start) &&
      position === selectedRange.start
    return {
      className: `${hitSet.has(position) ? 'motif-hit' : ''} ${mutagenicDnaPositions.has(position) ? 'sequence-mutagenic-base' : ''} ${isSelected(position, strand) ? 'sequence-selected' : ''} ${hoveredTranslationCodon?.strand === strand && hoveredTranslationCodon.positions.includes(position) ? 'sequence-codon-hover' : ''} ${showCaret ? 'sequence-caret-marker' : ''} ${extraClass}`.trim(),
      style,
    }
  }

  function updateSelection(startBound: number, endBound: number) {
    // start/end are inter-base boundaries (half-open range). No +1 — the pointer
    // already snapped to seams, so min..max is the selected span.
    if (startBound === endBound) {
      onRangeSelect({ start: startBound, end: startBound }, { collapsed: true })
      return
    }
    onRangeSelect({
      start: Math.min(startBound, endBound),
      end: Math.max(startBound, endBound),
    })
  }

  function commitPointerSelection(start: number, end: number, extendSelection = false) {
    if (start === end && !dragMovedRef.current) {
      if (extendSelection) {
        if (onExtendToBase) {
          // Sequence pane passes an inter-base boundary (caret index / exclusive end).
          onExtendToBase(start)
          return
        }
        if (selectedRange) {
          const anchor = selectedRange.start
          if (anchor === start) {
            onRangeSelect({ start, end: start }, { collapsed: true })
          } else {
            updateSelection(anchor, start)
          }
          return
        }
      }
      onRangeSelect({ start, end: start }, { collapsed: true })
      return
    }
    updateSelection(start, end)
  }

  return (
    <div
      className={`sequence-rows${horizontalMode ? ' sequence-rows-horizontal' : ''}${singleRowMode ? ' sequence-rows-single-row' : ''}${useAlignmentMergedLayout ? ' sequence-rows-alignment-coords' : ''}${compactRowLayout ? ' sequence-rows-compact' : ''}`}
      ref={containerRef}
      tabIndex={0}
      role="textbox"
      aria-label="DNA sequence"
      aria-multiline="true"
      onPointerDown={() => {
        // Feature/enzyme chrome sits outside the strand block; clear any native
        // selection started there so drag stays an app sequence selection.
        window.getSelection()?.removeAllRanges()
      }}
      onPointerLeave={() => {
        scheduleBaseHover(null)
        // Keep an in-progress drag alive when the pointer briefly leaves a row
        // (feature lanes, past the last base). Window pointerup finishes it.
        if (dragStartRef.current !== null) return
        setDragStart(null)
        dragStartRef.current = null
        dragEndRef.current = null
        dragOriginClientRef.current = null
        extendSelectionRef.current = false
        dragMovedRef.current = false
      }}
    >
      {enzymeTooltip.portal}
      {selectedSequenceThermo ? (
        <div className="sequence-selection-popup-anchor">
          <div className="sequence-selection-popup" role="status" aria-live="polite">
            <strong>{selectionLength(selectedRange!, record.sequence.length).toLocaleString()} bp selection</strong>
            <span>Tm {formatThermoTemperature(selectedSequenceThermo)}</span>
            <span>GC {formatThermoGc(selectedSequenceThermo)}</span>
            <small>{thermoMethodLabel(selectedSequenceThermo.method)}</small>
            {selectedSequenceThermo.note && <small>{selectedSequenceThermo.note}</small>}
          </div>
        </div>
      ) : cutFragmentLengthBp !== null ? (
        <div className="sequence-selection-popup-anchor">
          <div className="sequence-selection-popup" role="status" aria-live="polite">
            <strong>{cutFragmentLengthBp.toLocaleString()} bp fragment</strong>
          </div>
        </div>
      ) : null}
      {rows.map((row, rowIndex) => {
        const rowIsRendered = rowIndex >= virtualRowWindow.start && rowIndex <= virtualRowWindow.end
        const offset = viewStart + rowIndex * displayBasesPerRow
        const rowEnd = offset + row.length
        const placeholderHeight = rowEstimatedHeights[rowIndex] ?? virtualRowEstimatePx
        if (!rowIsRendered) {
          return (
            <div
              className="sequence-row sequence-row-placeholder"
              key={offset}
              style={{ height: placeholderHeight }}
              data-row-index={rowIndex}
              data-row-start={offset}
              data-row-end={rowEnd}
            />
          )
        }
        const rowSequenceWidthPx =
          useAlignmentMergedLayout && alignmentMergedLayout
            ? mergedLayoutContentWidthPx(alignmentMergedLayout)
            : rowTrackInsetPx * 2 + row.length * sequenceBaseStepPx
        const layoutStart = memberAnnotationRange?.start ?? offset
        const layoutEnd = memberAnnotationRange?.end ?? rowEnd
        const rowFeatures = overlappingFeatures(layoutStart, layoutEnd)
        const primerPlacements = rowPrimerPlacementsByIndex.get(rowIndex)
        const translationLayout = computeRowTranslationLayout(layoutStart, layoutEnd, rowFeatures, primerPlacements?.reverse ?? [], offset, rowEnd)
        const { featureContentHeightPx: featureContentHeight, bandHeightPx: featureBandHeight } = sequenceRowVisibleBandHeights(translationLayout, maxFeatureRows, featureLaneStepPx)
        const floatingFeatureLabels = renderFloatingFeatureLabels(
          offset,
          rowEnd,
          rowFeatures.filter((segment) => !sgRnaParts.has(segment.feature.id)),
          annotationFeatureById,
          translationLayout,
        )
        const rowLayout = rowLayoutByIndex.get(rowIndex)
        const rowSgRnas = sgRnaLanesByRow.get(rowIndex)
        const forwardSgRnaHeight = sgRnaRowLaneHeightPx(rowSgRnas?.forwardLanes.count ?? 0)
        const reverseSgRnaHeight = sgRnaRowLaneHeightPx(rowSgRnas?.reverseLanes.count ?? 0)
        const forwardPrimerLaneCount = primerPlacements?.forwardLaneCount ?? 0
        const sharedReversePrimerPlacements = reversePrimerPlacementsAtSharedTops(primerPlacements?.reverse ?? [], translationLayout.reversePrimerTopPxByIndex)
        const forwardPrimerLaneHeight = (primerPlacements?.forwardLaneHeight ?? 0) + forwardSgRnaHeight
        const reversePrimerFrameYOffset = (placement: PrimerRowPlacement) => {
          const primerStart = placement.display.templateSpanStart
          const primerEnd = placement.display.templateSpanEnd
          const overlapsFeature = rowFeatures.some(
            (segment) => segment.start < primerEnd && primerStart < segment.end,
          )
          const labelBottom = floatingFeatureLabels.belowLabelSpans
            .filter((span) => {
              const left = placement.left
              const right = placement.right
              return left < span.right && span.left < right
            })
            .reduce((bottom, span) => Math.max(bottom, span.bottom), 0)
          const labelClearance = labelBottom > 0
            ? Math.max(0, labelBottom + 2 - placement.yOffset)
            : 0
          return Math.max(overlapsFeature ? 2 : 0, labelClearance)
        }
        const reversePrimerOffsets = reversePrimerFrameOffsets(
          sharedReversePrimerPlacements,
          reversePrimerFrameYOffset,
        )
        const reversePrimerLaneHeight = Math.max(
          featureBandHeight,
          // Below-body labels are absolutely positioned and do not grow their
          // parent. Capped feature previews intentionally clip that parent.
          ...(maxFeatureRows ? [] : floatingFeatureLabels.belowLabelSpans.map((span) => span.bottom)),
          ...sharedReversePrimerPlacements.map((placement) =>
            placement.yOffset + (reversePrimerOffsets.get(placement) ?? 0) + placement.stackHeight,
          ),
        )
        let enzymeLaneHeight: number
        if (horizontalMode && rowLayout) {
          const stubHeight = 8
          enzymeLaneHeight = Math.max(
            18,
            rowLayout.enzymeLaneRows > 0 ? rowLayout.enzymeLaneRows * 17 + stubHeight : 0,
            forwardPrimerLaneHeight,
          )
        } else {
          const laneMetrics = rowLayout
            ? sequenceRowLaneMetrics(rowLayout, labelRouterBase, forwardPrimerLaneHeight, reversePrimerLaneHeight)
            : { enzymeLaneHeight: 0, forwardPrimerLaneHeight: 0, primerLaneHeight: 0 }
          enzymeLaneHeight = Math.max(18, laneMetrics.enzymeLaneHeight, forwardPrimerLaneHeight)
        }
        const enzymeCalloutsToRender =
          horizontalMode && visibleHorizontalEnzymeCallouts ? visibleHorizontalEnzymeCallouts : (rowLayout?.enzymeCallouts ?? [])

        return (
          <div className="sequence-row" key={offset} data-row-index={rowIndex} data-row-start={offset} data-row-end={rowEnd}>
            <div
              className="sequence-row-content"
              style={
                {
                  '--bases-per-row': row.length,
                  '--base-step': `${sequenceBaseStepPx}px`,
                  '--sequence-width': `${rowSequenceWidthPx}px`,
                  '--sequence-track-inset': `${rowTrackInsetPx}px`,
                  '--sequence-end-index-width': `${rowEndIndexWidthPx}px`,
                  '--sequence-end-index-gap': `${rowEndIndexGapPx}px`,
                  '--enzyme-lane-height': `${enzymeLaneHeight}px`,
                  '--forward-primer-lane-height': `0px`,
                  '--primer-lane-height': `${reverseSgRnaHeight}px`,
                  ...sequenceVisualStyle,
                } as CSSProperties
              }
            >
              <div className="sequence-enzyme-lane">
                {rowLayout && enzymeCalloutsToRender.length > 0 && renderSequenceEnzymeCallouts(enzymeCalloutsToRender, enzymeLaneHeight, rowSequenceWidthPx)}
                {renderSequencePrimerFrames(
                  primerPlacements?.forward ?? [],
                  offset,
                  row.length,
                  rowSequenceWidthPx,
                  'forward',
                  enzymeLaneHeight,
                  forwardPrimerLaneCount,
                  rowIndex,
                  () => Math.max(0, enzymeLaneHeight - forwardPrimerLaneHeight),
                )}
                {renderSequenceSgRnas(offset, rowSequenceWidthPx, 'forward', rowIndex)}
                {renderSgRnaPopover(offset, rowSequenceWidthPx, 'forward', rowIndex)}
              </div>
              <div
                className={`sequence-strand-block${linearDnaEnds ? ' has-dna-ends' : ''}`}
                onPointerDown={(event) => handleRowPointerDown(event, offset, row.length)}
                onPointerMove={(event) => handleRowPointerMove(event, offset, row.length)}
                onPointerUp={(event) => handleRowPointerUp(event, offset, row.length)}
                onPointerCancel={() => finishRowPointerDrag(null)}
                onPointerLeave={() => scheduleBaseHover(null)}
              >
                {renderCutOverlay(offset, rowEnd)}
                {renderSgRnaCuts(offset, rowEnd)}
                {renderFeatureHoverBrackets(offset, rowEnd)}
                {linearDnaEnds && offset === 0 && linearDnaEnds.upstream.modification === 'covalentlyClosed' ? (
                  <span className="dna-end-marker covalent left" aria-label="Covalently closed" />
                ) : null}
                {linearDnaEnds &&
                rowEnd >= record.sequence.length &&
                linearDnaEnds.downstream.modification === 'covalentlyClosed' ? (
                  <span className="dna-end-marker covalent right" aria-label="Covalently closed" />
                ) : null}
                {linearDnaEnds &&
                offset === 0 &&
                linearDnaEnds.upstream.modification === 'fivePrimePhosphorylated' ? (
                  <span className="dna-end-marker p left-top" title="5′ phosphorylated" aria-label="5′ phosphorylated">
                    P
                  </span>
                ) : null}
                {linearDnaEnds &&
                rowEnd >= record.sequence.length &&
                linearDnaEnds.downstream.modification === 'fivePrimePhosphorylated' ? (
                  <span className="dna-end-marker p right-bottom" title="5′ phosphorylated" aria-label="5′ phosphorylated">
                    P
                  </span>
                ) : null}
                <div className="strand-line">
                  <span className="strand-label">5'</span>
                  {renderSequenceBaseSpans(row, offset, rowEnd, 'forward', (base) => base, rowSequenceWidthPx)}
                  <span className="strand-label">3'</span>
                </div>
                <div className="sequence-ruler-row">
                  {renderSequenceRuler(
                    offset,
                    row.length,
                    rowSequenceWidthPx,
                    horizontalVisibleRange.start,
                    horizontalVisibleRange.end,
                    useAlignmentMergedLayout ? alignmentMergedLayout : undefined,
                  )}
                  <span className="sequence-row-end-index sequence-row-end-index-inline">{(offset + row.length).toLocaleString()}</span>
                </div>
                <div className="strand-line complement">
                  <span className="strand-label">3'</span>
                  {renderSequenceBaseSpans(row, offset, rowEnd, 'reverse', (base) => complementDnaBase(base), rowSequenceWidthPx)}
                  <span className="strand-label">5'</span>
                </div>
              </div>
              <div
                className="sequence-feature-lane"
                style={{
                  '--feature-lanes': translationLayout.laneCount,
                  height: `${reversePrimerLaneHeight}px`,
                } as CSSProperties}
              >
                {renderSequencePrimerFrames(
                  sharedReversePrimerPlacements,
                  offset,
                  row.length,
                  rowSequenceWidthPx,
                  'reverse',
                  featureBandHeight,
                  sharedReversePrimerPlacements.length,
                  rowIndex,
                  reversePrimerFrameYOffset,
                )}
                <div style={{ position: 'relative', height: `${featureContentHeight}px`, overflow: maxFeatureRows ? 'hidden' : undefined }}>
                {renderFeatureTranslationLane(translationLayout.blocks, offset, rowEnd, rowSequenceWidthPx)}
                {rowFeatures.filter((segment) => !segment.isInFrameExtension).map((segment) => {
                  const { feature, segmentId, start, end, lane, isFeatureStart, strand, segmentStart, segmentEnd } = segment
                  const mergedSpan =
                    useAlignmentMergedLayout && alignmentMergedLayout
                      ? mergedTemplateSpanPx(alignmentMergedLayout, start, end)
                      : null
                  const orfFeature = isOrfFeature(feature)
                  const orfCells = orfFeature ? orfRowCells(feature, start, end) : []
                  const orderedOrfCells = orfFeature
                    ? (translationByFeatureId.get(feature.id) ?? []).map((entry) => ({
                        ...entry,
                        featureId: feature.id,
                      }))
                    : []
                  const segmentWidthPx = mergedSpan ? mergedSpan.width : Math.max(1, end - start) * sequenceBaseStepPx
                  const arrowDirection = strand !== undefined && segmentStart !== undefined && segmentEnd !== undefined
                    ? sequenceFeatureArrowDirection({
                      feature,
                      strand,
                      start,
                      end,
                      isFeatureStart: isFeatureStart ?? false,
                      isFeatureEnd: segment.isFeatureEnd ?? false,
                      segmentStart,
                      segmentEnd,
                    })
                    : 'none'
                  const showArrow = arrowDirection !== 'none' && segmentWidthPx > sequenceFeatureArrowSizePx * 2
                  const segmentClassName = `sequence-feature-segment${orfFeature ? ' orf-segment' : ''}${orfFeature && threeLetterAminoAcids ? ' is-three-letter' : ''}${showArrow ? ` has-arrow${arrowDirection === 'reverse' ? ' reverse' : arrowDirection === 'both' ? ' both' : ''}` : ''}${selectedFeatureIds.includes(feature.id) || feature.id === selectedFeatureId ? ' is-selected' : ''}${isFeatureNoColor(feature.color) ? ' is-nocolor' : ''}`
                  const laneTopPx = bodyTopPxForSegment(translationLayout, segmentId, lane)
                  const segmentBodyHeightPx =
                    floatingFeatureLabels.bodyHeightByFeatureId.get(feature.id) ?? featureBodyHeightPx
                  const segmentStyle = mergedSpan
                    ? ({
                        left: `${mergedSpan.left}px`,
                        width: `${mergedSpan.width}px`,
                        top: `${laneTopPx + 1}px`,
                        height: `${segmentBodyHeightPx}px`,
                        '--feature-lane': lane,
                        '--feature-lane-top': `${laneTopPx}px`,
                        '--feature-body-height': `${segmentBodyHeightPx}px`,
                        backgroundColor: isFeatureNoColor(feature.color) ? 'transparent' : feature.color,
                        color: isFeatureNoColor(feature.color) ? 'var(--vg-text)' : contrastTextColor(feature.color),
                        position: 'absolute',
                      } as CSSProperties)
                    : ({
                        '--segment-start': start - offset,
                        '--segment-size': Math.max(1, end - start),
                        '--feature-lane': lane,
                        '--feature-lane-top': `${laneTopPx}px`,
                        '--feature-body-height': `${segmentBodyHeightPx}px`,
                        backgroundColor: isFeatureNoColor(feature.color) ? 'transparent' : feature.color,
                        color: isFeatureNoColor(feature.color) ? 'var(--vg-text)' : contrastTextColor(feature.color),
                      } as CSSProperties)
                  const outlineArrow = showArrow ? arrowDirection : 'none'
                  const outlineStyle = mergedSpan
                    ? ({
                        left: `${mergedSpan.left}px`,
                        width: `${mergedSpan.width}px`,
                        top: `${laneTopPx + 1}px`,
                        height: `${segmentBodyHeightPx}px`,
                      } as CSSProperties)
                    : ({
                        left: `calc(${start - offset} * var(--base-step))`,
                        width: `calc(${Math.max(1, end - start)} * var(--base-step))`,
                        top: `${laneTopPx + 1}px`,
                        height: `${segmentBodyHeightPx}px`,
                      } as CSSProperties)

                  return (
                  <Fragment key={`${segmentId}-${offset}`}>
                  {featureBodyFrame && !orfFeature && !isFeatureNoColor(feature.color) ? (
                    <svg
                      className="sequence-feature-body-frame"
                      style={outlineStyle}
                      viewBox={`0 0 ${Math.max(1, segmentWidthPx)} ${segmentBodyHeightPx}`}
                      preserveAspectRatio="none"
                      aria-hidden
                    >
                      <path
                        d={sequenceFeatureBodyOutlinePath(
                          Math.max(1, segmentWidthPx),
                          segmentBodyHeightPx,
                          outlineArrow,
                        )}
                      />
                    </svg>
                  ) : null}
                  <button
                    type="button"
                    className={segmentClassName}
                    style={segmentStyle}
                    onPointerEnter={() => setHoveredFeatureId(feature.id)}
                    onPointerLeave={() => setHoveredFeatureId((current) => current === feature.id ? null : current)}
                    onClick={(event) => onFeatureSelect(feature.id, event.shiftKey || event.ctrlKey || event.metaKey)}
                    onDoubleClick={(event) => {
                      event.stopPropagation()
                      if (!orfFeature) onFeatureEdit(feature.id)
                    }}
                    title={
                      orfFeature
                        ? `${featureDisplayName(feature)} ${formatRange(start, end)}`
                        : displaySettings.features.labelsVisible
                          ? `${featureDisplayName(feature)} ${formatRange(start, end)} — double-click for feature properties`
                          : 'Double-click for feature properties'
                    }
                  >
                    {orfFeature ? (
                      orfCells.flatMap((cell) => {
                        const displayFragments = cell.layoutSpan ? [{ positions: cell.positions }] : translationCellDisplayFragments(cell, start, end)
                        const residue = formatAminoAcidCode(cell.aa, aminoAcidCodeFormat)
                        const annotatedCell = { ...cell, featureId: feature.id }
                        return displayFragments.flatMap((fragment, fragmentIndex) => {
                          const { left, width } = codonSpanInRow({ ...cell, positions: fragment.positions }, start, end)
                          if (!(width > 0)) return []
                          return (
                          <span
                            key={`orf-aa-${cell.number}-${fragmentIndex}-${left}`}
                            className={`sequence-orf-residue${strand === 'reverse' ? ' is-reverse' : ''}${cell.aa === '*' ? ' is-stop' : ''}${translationDrag.isFragmentSelected(fragment.positions, selectedRange, Boolean(cutStrandSelection)) ? ' selected' : ''}`}
                            style={{ left: `${left}px`, width: `${width}px` }}
                            title={`${featureDisplayName(feature)}\n${aminoAcidInfo(cell.aa).name} ${cell.number}`}
                            onContextMenu={(event) => openTranslationContextMenu(event, feature.id)}
                            onPointerDown={(event) => translationDrag.begin(annotatedCell, event, orderedOrfCells, fragment.positions)}
                            onPointerEnter={(event) => {
                              setHoveredTranslationCodon({ positions: cell.positions, strand: strand === 'reverse' ? 'reverse' : 'forward' })
                              translationDrag.continueDrag(annotatedCell, event)
                            }}
                            onPointerLeave={() => setHoveredTranslationCodon(null)}
                            onPointerUp={translationDrag.finish}
                            onClick={(event) => {
                              event.stopPropagation()
                              if (translationDrag.consumeSuppressedClick()) return
                              translationDrag.selectClick(annotatedCell, event, orderedOrfCells, fragment.positions)
                            }}
                          >
                            {cell.aa === '*'
                              ? <span className="sequence-orf-stop-mark">{residue}</span>
                              : residue}
                          </span>
                          )
                        })
                      })
                    ) : (
                      displaySettings.features.labelsVisible && isFeatureStart && !floatingFeatureLabels.featureIds.has(feature.id)
                        ? (
                            isFeatureNoColor(feature.color) ? (
                              <span className="sequence-feature-nocolor-label">{featureDisplayName(feature)}</span>
                            ) : (
                              featureDisplayName(feature)
                            )
                          )
                        : null
                    )}
                  </button>
                  {!orfFeature &&
                    cleavageArrowsOnSegment(feature, start, end).map((cleavagePos) => {
                      let arrowX: number
                      if (useAlignmentMergedLayout && alignmentMergedLayout) {
                        const span = mergedTemplateSpanPx(alignmentMergedLayout, cleavagePos, cleavagePos + 1)
                        // Left edge of the base = boundary between this base and the previous one.
                        arrowX = span ? span.left : (cleavagePos - offset) * sequenceBaseStepPx
                      } else {
                        arrowX = (cleavagePos - offset) * sequenceBaseStepPx
                      }
                      const arrowY = laneTopPx + 1 + segmentBodyHeightPx / 2
                      return (
                        <svg
                          key={`${segmentId}-cleavage-${cleavagePos}`}
                          className="sequence-cleavage-arrow-layer"
                          aria-hidden
                        >
                          <CleavageArrowMark
                            transform={`translate(${arrowX} ${arrowY})`}
                            title={`Cleavage site ${cleavagePos + 1}`}
                          />
                        </svg>
                      )
                    })}
                  </Fragment>
                )})}
                {floatingFeatureLabels.labels}
                {renderInFrameExtensions(offset, rowEnd, rowFeatures, translationLayout)}
                </div>
              </div>
              <div className="sequence-primer-lane">
                {renderSequenceSgRnas(offset, rowSequenceWidthPx, 'reverse', rowIndex)}
                {renderSgRnaPopover(offset, rowSequenceWidthPx, 'reverse', rowIndex)}
              </div>
              <span className="sequence-row-end-index sequence-row-end-index-below" aria-hidden={!compactRowLayout}>
                {(offset + row.length).toLocaleString()}
              </span>
            </div>
          </div>
        )
      })}
      {translationContextMenu ? (
        <div
          ref={translationContextMenuRef}
          className="sequence-translation-context-menu"
          role="menu"
          style={{ left: translationContextMenu.x, top: translationContextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => copyFeatureTranslation(translationContextMenu.featureId)}
          >
            Copy translation
          </button>
        </div>
      ) : null}
      {baseHover && (
        <div
          className={`sequence-base-tooltip sequence-base-tooltip-${baseHover.strand}`}
          style={{
            left: baseHover.x + 10,
            top: baseHover.strand === 'forward' ? baseHover.y - 28 : baseHover.y + 10,
          }}
        >
          {(baseHover.position + 1).toLocaleString()}
        </div>
      )}
    </div>
  )
}
