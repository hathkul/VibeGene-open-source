import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useEnzymeHoverTooltip } from './useEnzymeHoverTooltip'
import { LinearAlignmentMapTraces } from '../../components/LinearAlignmentMapTraces'
import { linearAlignmentBandHeight, linearAlignmentMaxLevel, linearMapAlignmentYOffset } from '../../domain/linearAlignmentMap'
import { linearRulerMarkPositions } from '../../domain/mapRulerMarks'
import {
  computeLinearTrackLayout,
  estimateLinearMapHeightForRows,
  fitLinearMapViewBox,
} from '../../domain/mapLayout'
import { layoutLinearEnzymeCalloutsSimple } from '../../domain/linearSimpleRouter'
import {
  estimateLinearInlineFeatureLabelWidthPx,
  estimateLinearInlineFeatureTextWidthPx,
  layoutLinearFeatureLabels,
  linearFeatureInlineLabelCenterX,
  linearFeatureInlineLabelFitsDirectionalBody,
  linearFeatureUsableLabelWidthPx,
  type LinearFeatureLabelPlacement,
} from '../../domain/linearFeatureLabels'
import { preferredFeatureLabelSegmentIds } from '../../domain/featureLabelPlacement'
import { isFeatureNoColor } from '../../domain/featureAppearance'
import { isOrfFeature } from '../../domain/orfPrediction'
import {
  groupSgRNAFeatures,
} from '../../domain/sgrna'
import {
  isSgRnaCalloutSite,
  sgRnaGuideAnchorBp,
  sgRnaLinearBindingY,
  sgRnaLinearCalloutTextPlacement,
  sgRnaMapCalloutTextWidth,
  sgRnaMapDisplaySegments,
  sgRnaMapPamArrowSpan,
  sgRnaVisualSegments,
  SG_RNA_MAP_LABEL_FONT_SIZE_PX,
  SG_RNA_MAP_LABEL_FONT_WEIGHT,
  SG_RNA_MAP_PAM_ARROW_HALF_WIDTH_PX,
} from '../../domain/sgrnaVisualLayout'
import {
  formatRange,
  primerAnneal3PrimePosition,
  primerAnneal5PrimePosition,
  primerBindingToCalloutSite, type StrandPairSelection,
} from '../../domain/sequence'
import { dnaStrandVisibleRanges, resolveDnaEnds } from '../../domain/dnaEnds'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { EnzymePreferences } from '../../domain/enzymePreferences'
import type { PrimerBinding, RestrictionSite, SequenceFeature, SequenceRecord } from '../../domain/types'
import {
  assignFeatureLevels,
  featureDrawableSegments,
  featureGapConnectors,
  featureLevelBand,
  featurePriority,
  isRulerTrackFeature,
} from './featureRendering'
import { clampMapZoomRange } from './mapZoom'
import {
  LINEAR_FEATURE_ARROW_PX,
  LINEAR_FEATURE_HALF_WIDTH,
  sgRnaCalloutSite,
} from './mapPrimitives'
import { featureArrowForPiece } from '../../domain/featureDirectionality'
import {
  contrastTextColor,
  darkThemePrimerColor,
  enzymeSiteCounts,
  featureDisplayName,
  linearFeatureBandPath,
  linearFeatureShowsArrow,
  linearSelectionSegments,
  measureTextWidthPx,
  openEnzymeInfoFromCalloutGroup,
  orfCoreColor,
  orfGlowColor,
  primerIsSelectedOnMap,
  primerMapAccentColor,
  restrictionSiteFromCalloutClick,
  restrictionSiteIsSelected,
  resolveEnzymeLabelBudget,
  siteKey,
  sgRnaVisualParts,
  visibleLinearFeatureLevelLimit,
  cleavageArrowsOnSegment,
  type RestrictionSiteList,
  type SelectionRange,
} from './mapPrimitives'
import {
  CleavageArrowMark,
  EnzymeCalloutLabelText,
  MapCalloutLabelContent,
  LinearSelectionCutBoundaries,
  LinearNoColorFeatureBody,
  SelectedMapCalloutLabel,
  SelectedPrimerMapLabel,
} from './mapComponents'
import { enzymeCalloutMatchesHover, mapCalloutLabelParts, mapCalloutLabelWidth } from './mapCalloutLabel'
import { selectEnzymeSitesAllOrNone } from '../../domain/enzymeLabelBudget'
import { enzymeLabelDisplayStyle } from '../../domain/enzymePreferences'
import { enzymeSiteDisplayName } from '../../domain/methylation'
import { restrictionSiteCutsOutsideSequence } from '../../domain/enzymes'
import { computeZoomTrackLayout } from './zoomTrackLayout'

type PrimerCalloutMeta = {
  primerId: string
  color: string
  strand: 'forward' | 'reverse'
  start: number
  end: number
  length: number
  anneal5Prime: number
  anneal3Prime: number
}

type TrackMapDisplaySettings = {
  enzymes: {
    visible: boolean
    showPositions: boolean
  }
  features: {
    labelsVisible: boolean
    externalLabels: boolean
  }
  primers: {
    visible: boolean
  }
  labelRouting: {
    maxEnzymeSiteLabels: number | null
    maxPrimerSiteLabels: number | null
    showAllPrimers: boolean
  }
  circularVisual: {
    outsideLabelFontSizePx: number
    enzymeFontWeight: number
    uniqueEnzymeFontWeight: number
    primerFontWeight: number
    featureInlineFontSizePx: number
    featureInlineFontWeight: number
  }
}

const MAX_SEQUENCE_FOR_OUTER_FEATURE_LABELS = 20_000

const LINEAR_TRACK_SIDE_PADDING = 16
const LINEAR_BASE_RULER_TOP = 10
const LINEAR_BASE_BACKBONE_Y = 52
/** Enzyme/primer anchors sit on the duplex midline (circular ring contact). */
const LINEAR_BASE_STRAND_Y = LINEAR_BASE_BACKBONE_Y
const LINEAR_FEATURE_HEIGHT = LINEAR_FEATURE_HALF_WIDTH * 2
/** Match circular primer annealed offset from backbone midline. */
const LINEAR_PRIMER_RULER_OFFSET_PX = 8
/** Match circular duplex rings at r±3. */
const LINEAR_BACKBONE_HALF_WIDTH = 3
/** Colored Vector/Insert (and similar) bands centered on the linear duplex — thicker than the ruler. */
const LINEAR_RULER_SEGMENT_HALF_WIDTH = 10
/** Size ticks point down from the duplex; labels sit under them. */
const LINEAR_RULER_TICK_LENGTH = 6
const LINEAR_RULER_LABEL_CLEARANCE = 14
/** Extra space below ruler labels before row-0 features (half of prior 16). */
const LINEAR_FEATURE_GAP_BELOW_RULER = 8
const LINEAR_BASE_FEATURE_BASE_Y =
  LINEAR_BASE_BACKBONE_Y +
  Math.max(LINEAR_BACKBONE_HALF_WIDTH, LINEAR_RULER_SEGMENT_HALF_WIDTH) +
  LINEAR_RULER_TICK_LENGTH +
  LINEAR_RULER_LABEL_CLEARANCE +
  LINEAR_FEATURE_GAP_BELOW_RULER
const LINEAR_FEATURE_ROW_HEIGHT = 26
const LINEAR_FEATURE_HALO_EXTRA = 4
const LINEAR_LEADER_STUB_HEIGHT = 18
const LINEAR_LABEL_ROW_LIFT = 18
/**
 * Alignment band Y: previously 4 with an ~8px gap to the shifted ruler.
 * Sit halfway closer to the ruler (4px gap).
 */
const LINEAR_ALIGNMENT_BAND_TOP = 8
/** Origin marks: half prior length, 2× tick stroke; circular topology only. */
const LINEAR_ORIGIN_NOTCH_LENGTH = (3.2 * 8) / 2



function computeTrackMapYLayout(alignmentsVisible: boolean, maxAlignmentLevel: number) {
  const alignmentBandHeight = linearAlignmentBandHeight(maxAlignmentLevel, alignmentsVisible)
  const yShift = linearMapAlignmentYOffset(maxAlignmentLevel, alignmentsVisible)
  return {
    alignmentBandTop: LINEAR_ALIGNMENT_BAND_TOP,
    alignmentBandHeight,
    yShift,
    rulerTop: LINEAR_BASE_RULER_TOP + yShift,
    strandY: LINEAR_BASE_STRAND_Y + yShift,
    featureBaseY: LINEAR_BASE_FEATURE_BASE_Y + yShift,
    backboneY: LINEAR_BASE_BACKBONE_Y + yShift,
  }
}

export function TrackMap({
  record,
  restrictionSites,
  primerBindings,
  annotationFeatures,
  displaySettings,
  enzymePreferences,
  selectedRange,
  selectionCutStrandPair,
  selectedFeatureId,
  selectedFeatureIds = [],
  selectedPrimerId,
  selectedPrimerIds = [],
  selectedRestrictionSites = [],
  traceFiles,
  alignmentsVisible,
  selectedAlignmentTraceId,
  onSelectAlignmentTrace,
  onSelect,
  onRangeSelect,
  onExtendToBase,
  onPrimerSelect,
  onRestrictionSelect,
  onEnzymeInfo,
  onFeatureEdit,
  onFeatureOpenAsProtein,
  onPrimerEdit,
  onRenameRecord,
  onEditMapLabel,
  viewRange = null,
  onViewRangeChange,
}: {
  record: SequenceRecord
  restrictionSites: RestrictionSiteList
  primerBindings: PrimerBinding[]
  annotationFeatures: SequenceFeature[]
  displaySettings: TrackMapDisplaySettings
  enzymePreferences: EnzymePreferences
  selectedRange: SelectionRange | null
  selectionCutStrandPair?: StrandPairSelection | null
  selectedFeatureId: string | null
  selectedFeatureIds?: string[]
  selectedPrimerId: string | null
  selectedPrimerIds?: string[]
  selectedRestrictionSites?: RestrictionSite[]
  traceFiles: TraceFileRecord[]
  alignmentsVisible: boolean
  selectedAlignmentTraceId: string | null
  onSelectAlignmentTrace: (traceId: string) => void
  onSelect: (id: string, extendSelection?: boolean, position?: number) => void
  onRangeSelect: (range: SelectionRange) => void
  onExtendToBase?: (position: number) => void
  onPrimerSelect: (primerId: string, extendSelection?: boolean) => void
  onRestrictionSelect: (site: RestrictionSite, extendSelection?: boolean) => void
  onEnzymeInfo: (enzymeName: string) => void
  onFeatureEdit: (id: string) => void
  onFeatureOpenAsProtein?: (id: string) => void
  onPrimerEdit?: (primerId: string) => void
  onRenameRecord?: (name: string) => void
  onEditMapLabel?: (label: string) => void
  /** When set, map only this half-open window (magnifier zoom). */
  viewRange?: SelectionRange | null
  onViewRangeChange?: (range: SelectionRange) => void
}) {
  const customMapLabel = record.mapLabel?.trim() ? record.mapLabel : ''
  const sgRnaParts = useMemo(() => sgRnaVisualParts(annotationFeatures), [annotationFeatures])
  const sgRnaMapSegments = useMemo(
    () => sgRnaVisualSegments(groupSgRNAFeatures(annotationFeatures), record.sequence),
    [annotationFeatures, record.sequence],
  )
  const displayedMapLabel = customMapLabel || record.name
  const mapSubtitle = `${record.sequence.length.toLocaleString()} bp ${record.topology}`
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(displayedMapLabel)
  const beginTitleEdit = () => {
    if (!onRenameRecord && !onEditMapLabel) return
    setTitleDraft(displayedMapLabel)
    setEditingTitle(true)
  }
  const commitTitleEdit = () => {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== displayedMapLabel) {
      if (customMapLabel && onEditMapLabel) onEditMapLabel(trimmed)
      else if (onRenameRecord) onRenameRecord(trimmed)
    }
    setEditingTitle(false)
  }
  const cancelTitleEdit = () => setEditingTitle(false)
  useEffect(() => {
    // The draft is intentionally reset when the record/map label changes outside the editor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitleDraft(displayedMapLabel)
  }, [displayedMapLabel])
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [trackWidth, setTrackWidth] = useState(900)
  const sequenceLength = Math.max(1, record.sequence.length)
  const viewStart = viewRange ? Math.max(0, Math.min(sequenceLength, viewRange.start)) : 0
  const viewEnd = viewRange
    ? Math.max(viewStart + 1, Math.min(sequenceLength, viewRange.end))
    : sequenceLength
  const viewLength = Math.max(1, viewEnd - viewStart)
  const zoomTrackLayout = useMemo(
    () => (viewRange ? computeZoomTrackLayout(trackWidth) : null),
    [trackWidth, viewRange],
  )
  const sidePadding = zoomTrackLayout?.sidePadding ?? LINEAR_TRACK_SIDE_PADDING
  const maxAlignmentLevel = useMemo(
    () => linearAlignmentMaxLevel(traceFiles, alignmentsVisible),
    [alignmentsVisible, traceFiles],
  )
  const yLayout = useMemo(
    () => computeTrackMapYLayout(alignmentsVisible, maxAlignmentLevel),
    [alignmentsVisible, maxAlignmentLevel],
  )
  const rulerTrackFeatures = useMemo(
    () => annotationFeatures.filter(isRulerTrackFeature),
    [annotationFeatures],
  )
  const standardAnnotationFeatures = useMemo(
    () => annotationFeatures.filter((feature) => !isOrfFeature(feature) && !isRulerTrackFeature(feature) && !sgRnaParts.has(feature.id)),
    [annotationFeatures, sgRnaParts],
  )
  const orfAnnotationFeatures = useMemo(
    () => annotationFeatures.filter((feature) => isOrfFeature(feature) && !isRulerTrackFeature(feature)),
    [annotationFeatures],
  )
  const allRenderedFeatures = useMemo(
    () => assignFeatureLevels([...standardAnnotationFeatures, ...orfAnnotationFeatures], record.sequence.length),
    [orfAnnotationFeatures, record.sequence.length, standardAnnotationFeatures],
  )
  const visibleLevelLimit = visibleLinearFeatureLevelLimit(trackWidth)
  const renderedFeatures = useMemo(
    () =>
      allRenderedFeatures.filter(
        (feature) => !isOrfFeature(feature.feature) && featureLevelBand(feature.level) <= visibleLevelLimit,
      ),
    [allRenderedFeatures, visibleLevelLimit],
  )
  const orfRenderedFeatures = useMemo(
    () =>
      allRenderedFeatures.filter(
        (feature) => isOrfFeature(feature.feature) && featureLevelBand(feature.level) <= visibleLevelLimit,
      ),
    [allRenderedFeatures, visibleLevelLimit],
  )
  const linearMapDisplayFeatures = useMemo(
    () => [...renderedFeatures, ...orfRenderedFeatures],
    [orfRenderedFeatures, renderedFeatures],
  )
  const featureGapLinks = useMemo(
    () =>
      rulerTrackFeatures.length > 0
        ? []
        : featureGapConnectors(renderedFeatures.filter((feature) => !sgRnaParts.has(feature.feature.id)), record.sequence.length),
    [record.sequence.length, renderedFeatures, rulerTrackFeatures.length, sgRnaParts],
  )
  const maxFeatureLevel = Math.max(
    0,
    ...renderedFeatures.map((feature) => feature.level),
    ...orfRenderedFeatures.map((feature) => feature.level),
  )
  const featureLevelRows = Math.floor(maxFeatureLevel) + 1
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)
  const liveRange =
    dragStart !== null && dragEnd !== null
      ? dragStart <= dragEnd
        ? { start: dragStart, end: dragEnd }
        : { start: dragEnd, end: dragStart }
      : selectedRange
  const enzymeCounts = useMemo(() => enzymeSiteCounts(restrictionSites), [restrictionSites])
  const enzymeTooltip = useEnzymeHoverTooltip()
  const outsideLabelFontSizePx = displaySettings.circularVisual?.outsideLabelFontSizePx ?? 12
  const enzymeFontWeight = displaySettings.circularVisual?.enzymeFontWeight ?? 500
  const uniqueEnzymeFontWeight = displaySettings.circularVisual?.uniqueEnzymeFontWeight ?? 800
  const primerFontWeight = displaySettings.circularVisual?.primerFontWeight ?? 600
  const featureInlineFontSizePx = displaySettings.circularVisual?.featureInlineFontSizePx ?? 12
  const featureInlineFontWeight = displaySettings.circularVisual?.featureInlineFontWeight ?? 400
  const allowLinearOuterFeatureLabels =
    displaySettings.features.labelsVisible &&
    displaySettings.features.externalLabels &&
    record.sequence.length <= MAX_SEQUENCE_FOR_OUTER_FEATURE_LABELS
  const linearRulerMarks = useMemo(() => {
    const relativeMarks = linearRulerMarkPositions(viewLength)
    return relativeMarks.map((offset) => viewStart + offset)
  }, [viewLength, viewStart])
  const linearRulerStrands = useMemo(() => {
    const length = record.sequence.length
    if (length <= 0) return { forward: [] as Array<{ start: number; end: number }>, reverse: [] as Array<{ start: number; end: number }> }
    if (record.topology !== 'linear') {
      return {
        forward: [{ start: viewStart, end: viewEnd }],
        reverse: [{ start: viewStart, end: viewEnd }],
      }
    }
    const ends = resolveDnaEnds(record)
    const clip = (spans: Array<{ start: number; end: number }>) =>
      spans
        .map((span) => ({
          start: Math.max(span.start, viewStart),
          end: Math.min(span.end, viewEnd),
        }))
        .filter((span) => span.end > span.start)
    return {
      forward: clip(dnaStrandVisibleRanges('forward', ends, length)),
      reverse: clip(dnaStrandVisibleRanges('reverse', ends, length)),
    }
  // The fields listed below are the record inputs read by this projection; the whole record object is intentionally not a dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.dnaEnds, record.sequence.length, record.topology, viewEnd, viewStart])
  const resolvedEnzymeLabelBudget = useMemo(
    () => displaySettings.labelRouting.maxEnzymeSiteLabels ?? resolveEnzymeLabelBudget(trackWidth),
    [displaySettings.labelRouting.maxEnzymeSiteLabels, trackWidth],
  )

  const provisionalTrackLeft = zoomTrackLayout?.trackLeft ?? sidePadding
  const provisionalTrackRight =
    zoomTrackLayout?.trackRight ?? Math.max(provisionalTrackLeft + 1, trackWidth - sidePadding)

  const linearFeatureLabelPlan = useMemo(() => {
    const empty = {
      placements: [] as LinearFeatureLabelPlacement[],
      bySegmentId: new Map<string, LinearFeatureLabelPlacement>(),
      externalInfos: [] as typeof renderedFeatures,
      gapLabelLinks: [] as Array<{ gap: (typeof featureGapLinks)[number]; feature: SequenceFeature }>,
      contentBottom: yLayout.featureBaseY + featureLevelRows * LINEAR_FEATURE_ROW_HEIGHT,
    }
    if (!displaySettings.features.labelsVisible) return empty

    const spanPx = Math.max(1, provisionalTrackRight - provisionalTrackLeft)
    const xOf = (position: number) => provisionalTrackLeft + ((position - viewStart) / viewLength) * spanPx
    const labelable = renderedFeatures.filter(
      (info) =>
        !isOrfFeature(info.feature) &&
        info.end > viewStart &&
        info.start < viewEnd,
    )
    const fittingFeatureIds = new Set<string>()
    const preferredIds = preferredFeatureLabelSegmentIds(
      labelable.map((info) => ({
        feature: info.feature,
        segmentId: info.segmentId,
        start: info.start,
        end: info.end,
        span: Math.max(1, info.end - info.start),
      })),
      (candidate) => {
        const info = labelable.find((item) => item.segmentId === candidate.segmentId)!
        const bodyWidth = Math.max(1, xOf(candidate.end) - xOf(candidate.start))
        const hasArrow =
          linearFeatureShowsArrow(info) && bodyWidth >= LINEAR_FEATURE_ARROW_PX * 2
        const arrowPx = hasArrow ? Math.min(LINEAR_FEATURE_ARROW_PX, bodyWidth / 2) : 0
        const name = featureDisplayName(info.feature)
        const fits = linearFeatureInlineLabelFitsDirectionalBody(
          xOf(candidate.start),
          bodyWidth,
          estimateLinearInlineFeatureLabelWidthPx(name, featureInlineFontSizePx),
          hasArrow,
          arrowPx,
          info.strand === 'reverse' ? 'reverse' : 'forward',
        )
        if (fits) fittingFeatureIds.add(info.feature.id)
        return fits
      },
    )

    const gapLabelLinks: Array<{ gap: (typeof featureGapLinks)[number]; feature: SequenceFeature }> = []
    featureGapLinks.forEach((gap) => {
      if (gap.start < viewStart || gap.end > viewEnd) return
      if (fittingFeatureIds.has(gap.featureId) || gapLabelLinks.some((item) => item.feature.id === gap.featureId)) return
      const feature = labelable.find((info) => info.feature.id === gap.featureId)?.feature
      if (!feature) return
      const gapWidth = xOf(gap.end) - xOf(gap.start)
      const labelWidth = estimateLinearInlineFeatureLabelWidthPx(featureDisplayName(feature), featureInlineFontSizePx) + 8
      if (gapWidth < labelWidth) return
      const overlapsOtherBody = labelable.some(
        (info) =>
          info.feature.id !== gap.featureId &&
          info.level === gap.level &&
          info.start < gap.end &&
          gap.start < info.end,
      )
      if (!overlapsOtherBody) gapLabelLinks.push({ gap, feature })
    })

    const gapLabeledFeatureIds = new Set(gapLabelLinks.map((item) => item.feature.id))
    const preferredInfos = labelable.filter(
      (info) => preferredIds.has(info.segmentId) && !gapLabeledFeatureIds.has(info.feature.id),
    )
    const inputs = preferredInfos.map((info) => {
      const name = featureDisplayName(info.feature)
      const left = xOf(info.start)
      const right = Math.max(left + 1, xOf(info.end))
      const bodyWidth = right - left
      const top = yLayout.featureBaseY + info.level * LINEAR_FEATURE_ROW_HEIGHT
      const hasArrow =
        linearFeatureShowsArrow(info) && bodyWidth >= LINEAR_FEATURE_ARROW_PX * 2
      const arrowPx = hasArrow ? Math.min(LINEAR_FEATURE_ARROW_PX, bodyWidth / 2) : 0
      const strand = info.strand === 'reverse' ? ('reverse' as const) : ('forward' as const)
      return {
        segmentId: info.segmentId,
        featureId: info.feature.id,
        name,
        priority: featurePriority(info.feature.type),
        spanBp: Math.max(1, info.end - info.start),
        allowExternal: info.level === 0,
        body: { left, right, top, bottom: top + LINEAR_FEATURE_HEIGHT },
        usableBodyWidth: linearFeatureUsableLabelWidthPx(bodyWidth, hasArrow, arrowPx),
        strand,
        arrowLengthPx: arrowPx,
        labelWidth: estimateLinearInlineFeatureLabelWidthPx(name, featureInlineFontSizePx),
        textHeight: featureInlineFontSizePx + 2,
      }
    })

    const obstacles = linearMapDisplayFeatures
      .filter((info) => info.end > viewStart && info.start < viewEnd)
      .map((info) => {
      const left = xOf(info.start)
      const right = Math.max(left + 1, xOf(info.end))
      const top = yLayout.featureBaseY + info.level * LINEAR_FEATURE_ROW_HEIGHT
      const height = isOrfFeature(info.feature) ? 8 : LINEAR_FEATURE_HEIGHT
      return { left, right, top, bottom: top + height }
    })

    const { placements, contentBottom } = layoutLinearFeatureLabels(inputs, {
      rowHeight: LINEAR_FEATURE_ROW_HEIGHT,
      allowExternal: allowLinearOuterFeatureLabels,
      obstacles,
      mapLeft: provisionalTrackLeft - 40,
      mapRight: provisionalTrackRight + 40,
    })

    const bySegmentId = new Map(placements.map((placement) => [placement.segmentId, placement]))
    const externalInfos = preferredInfos.filter((info) => bySegmentId.get(info.segmentId)?.kind === 'external')
    return { placements, bySegmentId, externalInfos, gapLabelLinks, contentBottom }
  }, [
    allowLinearOuterFeatureLabels,
    displaySettings.features.labelsVisible,
    featureInlineFontSizePx,
    featureGapLinks,
    featureLevelRows,
    linearMapDisplayFeatures,
    provisionalTrackLeft,
    provisionalTrackRight,
    renderedFeatures,
    viewEnd,
    viewLength,
    viewStart,
    yLayout.featureBaseY,
  ])

  const linearExternalFeatureSites = useMemo(() => {
    return linearFeatureLabelPlan.externalInfos.map((info) => {
      const midpoint = Math.round((info.start + info.end) / 2) % Math.max(1, record.sequence.length)
      return {
        enzyme: {
          name: featureDisplayName(info.feature),
          notation: '',
          recognition: '',
          cutTop: 0,
          cutBottom: 0,
          type: 'II' as const,
          overhang: { type: 'blunt' as const, sequence: null, length: 0 },
          manufacturers: [],
          notes: [],
        },
        start: midpoint,
        end: midpoint,
        match: '__feature_callout__',
        cutTop: midpoint,
        cutBottom: midpoint,
      }
    })
  }, [linearFeatureLabelPlan.externalInfos, record.sequence.length])

  const linearExternalFeatureSiteKeys = useMemo(() => {
    const map = new Map<string, (typeof linearFeatureLabelPlan.externalInfos)[number]>()
    linearExternalFeatureSites.forEach((site, index) => {
      const info = linearFeatureLabelPlan.externalInfos[index]
      if (info) map.set(siteKey(site), info)
    })
    return map
  }, [linearExternalFeatureSites, linearFeatureLabelPlan])

  const mergedEnzymeSitesFull = useMemo(() => {
    const byCutTop = new Map<number, RestrictionSite[]>()
    const prioritized = selectEnzymeSitesAllOrNone(restrictionSites, resolvedEnzymeLabelBudget, {
      priorityOrder: enzymePreferences.priorityOrder,
    })

    prioritized.forEach((site) => {
      const list = byCutTop.get(site.cutTop) ?? []
      list.push(site)
      byCutTop.set(site.cutTop, list)
    })

    const uniqueKeys = new Set<string>()
    const merged = [...byCutTop.entries()]
      .map(([, sitesAtCut]) => {
        const sorted = sitesAtCut.toSorted((a, b) => a.enzyme.name.localeCompare(b.enzyme.name))
        const primary = sorted[0]
        const mergedSite: RestrictionSite = {
          ...primary,
          enzyme: {
            ...primary.enzyme,
            name: sorted.map((site) => site.enzyme.name).join(', '),
          },
          match: '__enzyme_callout__',
        }
        if (sorted.every((site) => (enzymeCounts[site.enzyme.name] ?? 0) === 1)) uniqueKeys.add(siteKey(mergedSite))
        return mergedSite
      })
      .toSorted((a, b) => a.cutTop - b.cutTop || a.enzyme.name.localeCompare(b.enzyme.name))
    return { sites: merged, uniqueKeys }
  }, [enzymeCounts, enzymePreferences.priorityOrder, resolvedEnzymeLabelBudget, restrictionSites])

  const mergedEnzymeSites = useMemo(() => {
    if (!viewRange) return mergedEnzymeSitesFull
    const byCutTop = new Map<number, RestrictionSite[]>()
    // When zoomed, apply the pixel budget to sites inside the window only so denser
    // labeling is allowed for the visible stretch (same budget, smaller sequence span).
    const sitesForBudget = restrictionSites.filter((site) => site.cutTop >= viewStart && site.cutTop <= viewEnd)
    const prioritized = selectEnzymeSitesAllOrNone(sitesForBudget, resolvedEnzymeLabelBudget, {
      priorityOrder: enzymePreferences.priorityOrder,
    })

    prioritized.forEach((site) => {
      const list = byCutTop.get(site.cutTop) ?? []
      list.push(site)
      byCutTop.set(site.cutTop, list)
    })

    const uniqueKeys = new Set<string>()
    const merged = [...byCutTop.entries()]
      .map(([, sitesAtCut]) => {
        const sorted = sitesAtCut.toSorted((a, b) => a.enzyme.name.localeCompare(b.enzyme.name))
        const primary = sorted[0]
        const mergedSite: RestrictionSite = {
          ...primary,
          enzyme: {
            ...primary.enzyme,
            name: sorted.map((site) => site.enzyme.name).join(', '),
          },
          match: '__enzyme_callout__',
        }
        if (sorted.every((site) => (enzymeCounts[site.enzyme.name] ?? 0) === 1)) uniqueKeys.add(siteKey(mergedSite))
        return mergedSite
      })
      .toSorted((a, b) => a.cutTop - b.cutTop || a.enzyme.name.localeCompare(b.enzyme.name))
    return { sites: merged, uniqueKeys }
  }, [
    enzymeCounts,
    enzymePreferences.priorityOrder,
    mergedEnzymeSitesFull,
    resolvedEnzymeLabelBudget,
    restrictionSites,
    viewEnd,
    viewRange,
    viewStart,
  ])

  const mergedEnzymeCalloutSites = mergedEnzymeSites.sites
  const uniqueEnzymeCalloutKeys = mergedEnzymeSites.uniqueKeys

  const primerCalloutBundle = useMemo(() => {
    if (!displaySettings.primers.visible) {
      return { sites: [] as RestrictionSite[], meta: new Map<string, PrimerCalloutMeta>() }
    }
    const primerSites: RestrictionSite[] = []
    const meta = new Map<string, PrimerCalloutMeta>()
    const primerLimit = displaySettings.labelRouting.showAllPrimers
      ? Number.POSITIVE_INFINITY
      : displaySettings.labelRouting.maxPrimerSiteLabels ?? Number.POSITIVE_INFINITY

    primerBindings.slice(0, primerLimit).forEach((binding, index) => {
      const site = primerBindingToCalloutSite(binding, index)
      primerSites.push(site)
      meta.set(siteKey(site), {
        primerId: binding.primer.id,
        color: binding.primer.color || '#a020f0',
        strand: binding.strand,
        start: binding.start,
        end: binding.end,
        length: Math.max(1, binding.end - binding.start),
        anneal5Prime: primerAnneal5PrimePosition(binding),
        anneal3Prime: primerAnneal3PrimePosition(binding),
      })
    })

    return { sites: primerSites, meta }
  }, [
    displaySettings.labelRouting.maxPrimerSiteLabels,
    displaySettings.labelRouting.showAllPrimers,
    displaySettings.primers.visible,
    primerBindings,
  ])
  const sgRnaCalloutBundle = useMemo(() => {
    const annotations = groupSgRNAFeatures(annotationFeatures)
    const sites = annotations.map(sgRnaCalloutSite)
    return { sites, meta: new Map(sites.map((site, index) => [siteKey(site), annotations[index]!])) }
  }, [annotationFeatures])
  const sgRnaCalloutMeta = sgRnaCalloutBundle.meta
  const primerCalloutSites = useMemo(
    () => [...primerCalloutBundle.sites, ...sgRnaCalloutBundle.sites],
    [primerCalloutBundle.sites, sgRnaCalloutBundle.sites],
  )
  const primerCalloutMeta = primerCalloutBundle.meta
  const linearCalloutSites = useMemo(() => {
    const all = [
      ...(displaySettings.enzymes.visible ? mergedEnzymeCalloutSites : []),
      ...primerCalloutSites,
      ...linearExternalFeatureSites,
    ]
    // When zoomed, only label sites inside the window. Remapping out-of-view cuts to
    // extreme X positions makes computeLinearTrackLayout squeeze the track and cancel zoom.
    if (!viewRange) return all
    return all.filter((site) => {
      const position = site.cutTop ?? site.start
      return position >= viewStart && position <= viewEnd
    })
  }, [
    displaySettings.enzymes.visible,
    linearExternalFeatureSites,
    mergedEnzymeCalloutSites,
    primerCalloutSites,
    viewEnd,
    viewRange,
    viewStart,
  ])

  const trackClipId = useId().replace(/:/g, '')
  const featureBandBottom = Math.max(
    yLayout.featureBaseY + featureLevelRows * LINEAR_FEATURE_ROW_HEIGHT + 8,
    linearFeatureLabelPlan.contentBottom + 8,
  )
  const alignmentLabelCeilingY =
    alignmentsVisible && yLayout.alignmentBandHeight > 0
      ? // Same stub+lift gap as row-0 labels normally keep above the duplex/ruler.
        yLayout.alignmentBandTop - LINEAR_LEADER_STUB_HEIGHT - LINEAR_LABEL_ROW_LIFT
      : undefined
  const protectedBandTop = yLayout.featureBaseY

  const linearRouterDebugEnabled = useMemo(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('linearRouterDebug') === '1' : false),
    [],
  )

  /** When zoomed: fixed margins from computeZoomTrackLayout (200px or 20% viewport). */
  const zoomFixedTrackLayout = zoomTrackLayout

  const linearLayout = useMemo(() => {
    const fixedZoomTrack = zoomFixedTrackLayout
    if (!linearCalloutSites.length) {
      if (fixedZoomTrack) {
        return { callouts: [] as ReturnType<typeof layoutLinearEnzymeCalloutsSimple>, ...fixedZoomTrack }
      }
      const trackLeft = sidePadding
      const trackRight = Math.max(trackLeft + 1, trackWidth - sidePadding)
      return {
        callouts: [] as ReturnType<typeof layoutLinearEnzymeCalloutsSimple>,
        mapWidth: trackWidth,
        trackLeft,
        trackRight,
      }
    }

    const labelForSite = (site: RestrictionSite) => {
      const absoluteSite =
        viewStart === 0
          ? site
          : {
              ...site,
              start: site.start + viewStart,
              end: site.end + viewStart,
              cutTop: site.cutTop + viewStart,
              cutBottom: site.cutBottom + viewStart,
            }
      if (absoluteSite.match === '__feature_callout__') return absoluteSite.enzyme.name
      if (absoluteSite.match.startsWith('__primer_callout__')) return absoluteSite.enzyme.name
      const label = enzymeSiteDisplayName(absoluteSite, displaySettings.enzymes.showPositions, 'cut')
      return restrictionSiteCutsOutsideSequence(site, record.sequence.length) && !displaySettings.enzymes.showPositions
        ? `${label} (${site.cutTop + 1})`
        : label
    }
    const textHeightForSite = (site: RestrictionSite) =>
      site.match === '__feature_callout__'
        ? outsideLabelFontSizePx + 14
        : isSgRnaCalloutSite(site)
          ? 14
          : site.match.startsWith('__primer_callout__')
            ? 14
            : 12
    const labelPaddingForSite = (site: RestrictionSite) =>
      site.match === '__feature_callout__'
        ? 18
        : isSgRnaCalloutSite(site)
          ? 6
          : site.match.startsWith('__primer_callout__')
            ? 12
            : 6
    const labelWidthForSite = (site: RestrictionSite, label: string) => {
      if (site.match === '__feature_callout__') {
        return measureTextWidthPx(
          label,
          `750 ${outsideLabelFontSizePx + 2}px system-ui, -apple-system, "Segoe UI", sans-serif`,
          6.8,
        )
      }
      if (isSgRnaCalloutSite(site)) {
        return sgRnaMapCalloutTextWidth(label, measureTextWidthPx)
      }
      const isPrimer = site.match.startsWith('__primer_callout__')
      const weight = isPrimer ? primerFontWeight : (enzymeLabelDisplayStyle(site, enzymePreferences, enzymeCounts).bold ? uniqueEnzymeFontWeight : enzymeFontWeight)
      return mapCalloutLabelWidth(label, isPrimer ? 'primer' : 'enzyme', (text) => measureTextWidthPx(
        text,
        `${Math.max(400, weight)} ${outsideLabelFontSizePx}px system-ui, -apple-system, "Segoe UI", sans-serif`,
        isPrimer ? 7 : 6,
      ))
    }

    const heightBase = {
      strandY: yLayout.strandY,
      featureStubHeight: LINEAR_LEADER_STUB_HEIGHT,
      featureHeight: LINEAR_FEATURE_HEIGHT,
      labelRowLift: LINEAR_LABEL_ROW_LIFT,
      protectedBandBottom: featureBandBottom,
      labelCeilingY: alignmentLabelCeilingY,
    }
    const leftCount = linearCalloutSites.filter((site) => (site.cutTop - viewStart) / viewLength < 0.5).length
    const rowsPerHalf = Math.max(leftCount, linearCalloutSites.length - leftCount)
    const layoutHeight = Math.max(
      estimateLinearMapHeightForRows(rowsPerHalf + 4, { ...heightBase, textHeight: 14 }),
      featureBandBottom + 80 + rowsPerHalf * 28,
    )

    const layoutInputBase = {
      sites: linearCalloutSites.map((site) => ({
        ...site,
        start: site.start - viewStart,
        end: site.end - viewStart,
        cutTop: site.cutTop - viewStart,
        cutBottom: site.cutBottom - viewStart,
      })),
      sequenceLength: viewLength,
      mapHeight: layoutHeight,
      strandY: yLayout.strandY,
      protectedBandTop,
      protectedBandBottom: featureBandBottom,
      labelCeilingY: alignmentLabelCeilingY,
      featureHeight: LINEAR_FEATURE_HEIGHT,
      featureStubHeight: LINEAR_LEADER_STUB_HEIGHT,
      labelRowLift: LINEAR_LABEL_ROW_LIFT,
      labelForSite,
      textHeightForSite,
      labelPaddingForSite,
      labelWidthForSite,
      rulerContactOffset: 1,
    }

    const layoutTrackLeft = fixedZoomTrack?.trackLeft ?? provisionalTrackLeft
    const layoutTrackRight = fixedZoomTrack?.trackRight ?? provisionalTrackRight
    const layoutMapWidth = fixedZoomTrack?.mapWidth ?? trackWidth
    const debugEntries: Array<Record<string, unknown>> = []
    const layoutOnce = (mapWidth: number, trackLeft: number, trackRight: number) =>
      layoutLinearEnzymeCalloutsSimple({
        ...layoutInputBase,
        mapWidth,
        trackLeft,
        trackRight,
        debugLog: linearRouterDebugEnabled ? (entry) => debugEntries.push(entry) : undefined,
      })

    const provisionalCallouts = layoutOnce(layoutMapWidth, layoutTrackLeft, layoutTrackRight)
    const trackLayout = fixedZoomTrack
      ? fixedZoomTrack
      : computeLinearTrackLayout(trackWidth, provisionalCallouts, sidePadding)
    const callouts = layoutOnce(trackLayout.mapWidth, trackLayout.trackLeft, trackLayout.trackRight).map((callout) => ({
      ...callout,
      // Layout used view-relative site coords; restore absolute sites for selection / keys.
      site: linearCalloutSites[callout.index] ?? callout.site,
    }))

    if (linearRouterDebugEnabled && debugEntries.length) {
      console.groupCollapsed(`[linear-router] ${record.name} labels=${callouts.length}/${linearCalloutSites.length}`)
      debugEntries.forEach((entry) => {
        if (entry.event === 'row_jump') console.warn(entry)
        else console.log(entry)
      })
      console.groupEnd()
    }

    return { callouts, ...trackLayout }
  }, [
    alignmentLabelCeilingY,
    displaySettings.enzymes.showPositions,
    enzymeCounts,
    enzymeFontWeight,
    enzymePreferences,
    featureBandBottom,
    linearCalloutSites,
    linearRouterDebugEnabled,
    outsideLabelFontSizePx,
    primerFontWeight,
    protectedBandTop,
    provisionalTrackLeft,
    provisionalTrackRight,
    record.name,
    record.sequence.length,
    sidePadding,
    trackWidth,
    uniqueEnzymeFontWeight,
    viewLength,
    viewStart,
    yLayout.strandY,
    zoomFixedTrackLayout,
  ])

  const { callouts: linearCallouts, mapWidth: linearMapWidth, trackLeft, trackRight } = linearLayout

  const hasHiddenFeatureLevels =
    Number.isFinite(visibleLevelLimit) &&
    allRenderedFeatures.some((feature) => featureLevelBand(feature.level) > visibleLevelLimit)

  /** Bottom of map graphics (features, below-labels, callouts) — title always sits below this. */
  const linearContentBottom = useMemo(() => {
    let bottom = featureBandBottom
    if (hasHiddenFeatureLevels) bottom = Math.max(bottom, featureBandBottom + 28)
    for (const callout of linearCallouts) {
      bottom = Math.max(
        bottom,
        callout.box.bottom,
        callout.anchor.y,
        callout.elbow.y,
        callout.connectorEnd.y,
      )
    }
    return bottom
  }, [featureBandBottom, hasHiddenFeatureLevels, linearCallouts])

  /** Match circular map: title + subtitle block below content. */
  const LINEAR_MAP_TITLE_BLOCK = 54

  const fittedView = useMemo(() => {
    const base = fitLinearMapViewBox(
      linearCallouts,
      trackLeft,
      trackRight,
      yLayout.strandY,
      featureBandBottom,
      10,
      linearMapWidth,
      alignmentsVisible && yLayout.alignmentBandHeight > 0 ? yLayout.alignmentBandTop : undefined,
    )
    const titleBottom = linearContentBottom + LINEAR_MAP_TITLE_BLOCK
    const height = Math.max(base.height, titleBottom + 10 - base.top, 360)
    return { ...base, height, contentBottom: linearContentBottom }
  }, [
    alignmentsVisible,
    featureBandBottom,
    linearCallouts,
    linearContentBottom,
    linearMapWidth,
    trackLeft,
    trackRight,
    yLayout.alignmentBandHeight,
    yLayout.alignmentBandTop,
    yLayout.strandY,
  ])

  const svgWidth = Math.ceil(linearMapWidth)
  const svgHeight = Math.ceil(fittedView.height)
  const linearScrollLayoutKey = useMemo(
    () => `${linearCallouts.length}:${svgHeight}:${Math.round(fittedView.top)}`,
    [fittedView.top, linearCallouts.length, svgHeight],
  )

  useEffect(() => {
    const scrollHost = trackRef.current
    if (!scrollHost) return
    const maxScrollTop = Math.max(0, scrollHost.scrollHeight - scrollHost.clientHeight)
    if (viewRange) {
      // Zoomed map hugs the bottom of the viewport.
      scrollHost.scrollTop = maxScrollTop
      return
    }
    const trackViewportTop = yLayout.rulerTop - fittedView.top - 12
    scrollHost.scrollTop = Math.max(0, Math.min(trackViewportTop, maxScrollTop))
  }, [fittedView.top, linearScrollLayoutKey, viewRange, yLayout.rulerTop])

  useEffect(() => {
    if (!viewRange || !zoomTrackLayout) return
    const scrollHost = trackRef.current
    if (!scrollHost) return
    if (svgWidth <= scrollHost.clientWidth + 1) {
      scrollHost.scrollLeft = 0
      return
    }
    // Center the sequence track; side margins are reachable by horizontal scroll.
    const trackMid = (zoomTrackLayout.trackLeft + zoomTrackLayout.trackRight) / 2
    const maxScrollLeft = Math.max(0, scrollHost.scrollWidth - scrollHost.clientWidth)
    scrollHost.scrollLeft = Math.max(0, Math.min(maxScrollLeft, trackMid - scrollHost.clientWidth / 2))
  }, [linearScrollLayoutKey, svgWidth, viewRange, zoomTrackLayout])

  useEffect(() => {
    if (!viewRange || !onViewRangeChange) return
    const host = trackRef.current
    if (!host) return
    const onWheel = (event: WheelEvent) => {
      // Pan the zoom window; prefer deltaX, fall back to deltaY (typical mouse wheel).
      const deltaPx = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (deltaPx === 0) return
      event.preventDefault()
      const trackSpanPx = Math.max(1, trackRight - trackLeft)
      const shiftBp = Math.round((deltaPx / trackSpanPx) * viewLength)
      if (shiftBp === 0) return
      onViewRangeChange(
        clampMapZoomRange({ start: viewStart + shiftBp, end: viewEnd + shiftBp }, sequenceLength),
      )
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [onViewRangeChange, sequenceLength, trackLeft, trackRight, viewEnd, viewLength, viewRange, viewStart])

  useEffect(() => {
    if (!selectedAlignmentTraceId) return
    const trace = traceFiles.find((item) => item.id === selectedAlignmentTraceId)
    if (!trace?.alignment) return
    const scrollHost = trackRef.current
    if (!scrollHost) return
    const targetLeft = sequenceX(trace.alignment.templateStart) - scrollHost.clientWidth * 0.2
    scrollHost.scrollLeft = Math.max(0, targetLeft)
  // sequenceX is derived solely from the scalar geometry dependencies already listed here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAlignmentTraceId, traceFiles, trackLeft, trackRight, record.sequence.length])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const observer = new ResizeObserver(([entry]) => {
      // Floor to the grid so width never rounds above the scrollport (phantom H scrollbar).
      const nextWidth = Math.max(320, Math.floor(entry.contentRect.width / 24) * 24)
      setTrackWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth))
    })
    observer.observe(track)
    return () => observer.disconnect()
  }, [])

  function sequenceX(position: number) {
    return trackLeft + ((position - viewStart) / viewLength) * (trackRight - trackLeft)
  }

  function positionFromPointer(svg: SVGSVGElement, clientX: number) {
    const rect = svg.getBoundingClientRect()
    const svgX = fittedView.left + ((clientX - rect.left) / rect.width) * fittedView.width
    const ratio = Math.max(0, Math.min(1, (svgX - trackLeft) / (trackRight - trackLeft)))
    return Math.round(viewStart + ratio * viewLength)
  }

  function selectFromDrag(start: number, end: number) {
    if (start === end) {
      onRangeSelect({ start: Math.max(0, start - 1), end: start })
      return
    }
    onRangeSelect(start < end ? { start, end } : { start: end, end: start })
  }

  const linearRulerBandHalf = Math.max(LINEAR_BACKBONE_HALF_WIDTH, LINEAR_RULER_SEGMENT_HALF_WIDTH)
  const linearRulerSelectY = yLayout.backboneY - linearRulerBandHalf
  const linearRulerSelectHeight = linearRulerBandHalf * 2 + LINEAR_RULER_TICK_LENGTH

  return (
    <div ref={trackRef} className={`track-map-scroll${viewRange ? ' is-map-zoomed' : ''}`}>
      {enzymeTooltip.portal}
      <svg
        className="track-map is-min-locked"
        width={svgWidth}
        height={svgHeight}
        viewBox={`${fittedView.left} ${fittedView.top} ${fittedView.width} ${fittedView.height}`}
        role="img"
        aria-label="Gene and protein track map"
      >
        {viewRange ? (
          <defs>
            <clipPath id={`map-zoom-track-clip-${trackClipId}`}>
              <rect
                x={trackLeft}
                y={fittedView.top}
                width={Math.max(1, trackRight - trackLeft)}
                height={Math.max(1, fittedView.height)}
              />
            </clipPath>
          </defs>
        ) : null}
        <g
          className="track-map-sequence-layer"
          clipPath={viewRange ? `url(#map-zoom-track-clip-${trackClipId})` : undefined}
        >
        <g className="ruler-track">
          {/* Duplex backbone: for linear topology, omit strand segments in overhangs; ssDNA draws one line. */}
          {linearRulerStrands.forward.map((span) => (
            <line
              key={`fwd-${span.start}-${span.end}`}
              x1={sequenceX(span.start)}
              y1={yLayout.backboneY - LINEAR_BACKBONE_HALF_WIDTH}
              x2={sequenceX(span.end)}
              y2={yLayout.backboneY - LINEAR_BACKBONE_HALF_WIDTH}
              className="map-backbone linear-backbone-line"
            />
          ))}
          {linearRulerStrands.reverse.map((span) => (
            <line
              key={`rev-${span.start}-${span.end}`}
              x1={sequenceX(span.start)}
              y1={yLayout.backboneY + LINEAR_BACKBONE_HALF_WIDTH}
              x2={sequenceX(span.end)}
              y2={yLayout.backboneY + LINEAR_BACKBONE_HALF_WIDTH}
              className="map-backbone linear-backbone-line"
            />
          ))}
          {/* Origin notches: circular plasmids only (linearized view), both ends, facing down. */}
          {record.topology === 'circular' && (
            <>
              {viewStart <= 0 && viewEnd > 0 ? (
                <line
                  x1={sequenceX(0)}
                  y1={yLayout.backboneY + LINEAR_BACKBONE_HALF_WIDTH}
                  x2={sequenceX(0)}
                  y2={yLayout.backboneY + LINEAR_BACKBONE_HALF_WIDTH + LINEAR_ORIGIN_NOTCH_LENGTH}
                  className="linear-origin-notch"
                />
              ) : null}
              {viewStart < record.sequence.length && viewEnd >= record.sequence.length ? (
                <line
                  x1={sequenceX(record.sequence.length)}
                  y1={yLayout.backboneY + LINEAR_BACKBONE_HALF_WIDTH}
                  x2={sequenceX(record.sequence.length)}
                  y2={yLayout.backboneY + LINEAR_BACKBONE_HALF_WIDTH + LINEAR_ORIGIN_NOTCH_LENGTH}
                  className="linear-origin-notch"
                />
              ) : null}
            </>
          )}
          {linearRulerMarks.map((position) => {
            const x = sequenceX(position)
            const tickTop = yLayout.backboneY + LINEAR_BACKBONE_HALF_WIDTH
            return (
              <g key={position}>
                <line
                  x1={x}
                  y1={tickTop}
                  x2={x}
                  y2={tickTop + LINEAR_RULER_TICK_LENGTH}
                  className="map-tick"
                />
                <text
                  x={x}
                  y={tickTop + LINEAR_RULER_TICK_LENGTH + 11}
                  textAnchor="middle"
                  className="map-ruler-label"
                >
                  {`${position.toLocaleString()} bp`}
                </text>
              </g>
            )
          })}
          <rect
            className="map-select-target"
            x={trackLeft}
            y={linearRulerSelectY}
            width={Math.max(1, trackRight - trackLeft)}
            height={linearRulerSelectHeight}
            aria-label="Drag on the ruler to select sequence positions"
            onPointerDown={(event) => {
              const svg = event.currentTarget.ownerSVGElement
              if (!svg) return
              event.preventDefault()
              event.stopPropagation()
              const position = positionFromPointer(svg, event.clientX)
              if ((event.shiftKey || event.ctrlKey || event.metaKey) && onExtendToBase) {
                onExtendToBase(position)
                return
              }
              setDragStart(position)
              setDragEnd(position)
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (dragStart === null) return
              const svg = event.currentTarget.ownerSVGElement
              if (!svg) return
              event.preventDefault()
              setDragEnd(positionFromPointer(svg, event.clientX))
            }}
            onPointerUp={(event) => {
              const svg = event.currentTarget.ownerSVGElement
              if (!svg) return
              event.preventDefault()
              const start = dragStart
              const end = positionFromPointer(svg, event.clientX)
              setDragStart(null)
              setDragEnd(null)
              if (start === null) return
              selectFromDrag(start, end)
              try {
                event.currentTarget.releasePointerCapture(event.pointerId)
              } catch {
                // ignore
              }
            }}
            onPointerCancel={() => {
              setDragStart(null)
              setDragEnd(null)
            }}
          />
        </g>
        {linearSelectionSegments(liveRange, record.sequence.length, record.topology).map((segment) => (
            <rect
              key={`${segment.start}-${segment.end}`}
              className="linear-selection"
              x={sequenceX(segment.start)}
              y={yLayout.rulerTop + 20}
              width={Math.max(1, sequenceX(segment.end) - sequenceX(segment.start))}
              height={featureBandBottom - (yLayout.rulerTop + 20)}
            />
          ))}
        <LinearSelectionCutBoundaries selection={liveRange ? selectionCutStrandPair : null} sequenceX={sequenceX} y1={yLayout.rulerTop + 20} y2={featureBandBottom} />
        {linearMapDisplayFeatures.map((info) => {
          const x = sequenceX(info.start)
          const width = Math.max(1, sequenceX(info.end) - x)
          const y = yLayout.featureBaseY + info.level * LINEAR_FEATURE_ROW_HEIGHT
          const isOrf = isOrfFeature(info.feature)
          const labelColor = contrastTextColor(info.feature.color)
          const orfGlow = orfGlowColor(info.feature)
          const orfCore = orfCoreColor(info.feature)
          const orfY = y + LINEAR_FEATURE_HEIGHT / 2
          const isSelected =
            selectedFeatureIds.includes(info.feature.id) || info.feature.id === selectedFeatureId
          const bandArrow: 'none' | 'forward' | 'reverse' | 'both' =
            width < LINEAR_FEATURE_ARROW_PX * 2
              ? 'none'
              : linearFeatureShowsArrow(info)
                ? featureArrowForPiece(info)
                : 'none'
          const arrowWidth = isOrf && bandArrow !== 'none' ? 4 : 0
          const haloY = y - LINEAR_FEATURE_HALO_EXTRA
          const haloHeight = LINEAR_FEATURE_HEIGHT + LINEAR_FEATURE_HALO_EXTRA * 2
          return (
            <g
              key={info.segmentId}
              className={`linear-feature-group ${isSelected ? 'is-selected' : ''}${isOrf ? ' linear-orf-group' : ''}${isSelected && selectedFeatureIds.length >= 3 ? ' is-multi-feature-selection' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(info.feature.id, event.shiftKey || event.ctrlKey || event.metaKey, info.start)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                if (!isOrf) onFeatureEdit(info.feature.id)
              }}
              onContextMenu={isOrf && onFeatureOpenAsProtein ? (event) => {
                event.preventDefault()
                event.stopPropagation()
                onSelect(info.feature.id)
                onFeatureOpenAsProtein(info.feature.id)
              } : undefined}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
            >
              {isOrf ? (
                <>
                  <line x1={x} y1={orfY} x2={x + width} y2={orfY} stroke={orfGlow} className="linear-orf-glow" />
                  <line x1={x + (bandArrow === 'reverse' || bandArrow === 'both' ? arrowWidth : 0)} y1={orfY} x2={x + width - (bandArrow === 'forward' || bandArrow === 'both' ? arrowWidth : 0)} y2={orfY} stroke={orfCore} className="linear-orf-core" />
                  {(bandArrow === 'forward' || bandArrow === 'both') && (
                    <polygon
                      points={`${x + width},${orfY} ${x + width - arrowWidth},${orfY - 2} ${x + width - arrowWidth},${orfY + 2}`}
                      fill={orfCore}
                      className="linear-orf-arrow"
                    />
                  )}
                  {(bandArrow === 'reverse' || bandArrow === 'both') && (
                    <polygon
                      points={`${x},${orfY} ${x + arrowWidth},${orfY - 2} ${x + arrowWidth},${orfY + 2}`}
                      fill={orfCore}
                      className="linear-orf-arrow"
                    />
                  )}
                </>
              ) : (
                <>
                  {isSelected && selectedFeatureIds.length < 3 && !isFeatureNoColor(info.feature.color) && (
                    <path
                      d={linearFeatureBandPath(x, haloY, width, haloHeight, bandArrow)}
                      className="selected-feature-halo"
                    />
                  )}
                  {isFeatureNoColor(info.feature.color) ? (
                    <LinearNoColorFeatureBody
                      x={x}
                      y={y}
                      width={width}
                      height={LINEAR_FEATURE_HEIGHT}
                      selected={isSelected}
                      arrow={bandArrow}
                    />
                  ) : (
                    <path
                      d={linearFeatureBandPath(x, y, width, LINEAR_FEATURE_HEIGHT, bandArrow)}
                      style={{ fill: info.feature.color }}
                      className="map-feature-shape linear-feature-shape"
                    />
                  )}
                  {displaySettings.features.labelsVisible &&
                    linearFeatureLabelPlan.bySegmentId.get(info.segmentId)?.kind === 'inline' && (
                    (() => {
                      const label = featureDisplayName(info.feature)
                      const labelX = linearFeatureInlineLabelCenterX(
                        x,
                        width,
                        bandArrow !== 'none' && !isFeatureNoColor(info.feature.color),
                        Math.min(LINEAR_FEATURE_ARROW_PX, width / 2),
                        info.strand === 'reverse' ? 'reverse' : 'forward',
                      )
                      const labelY = y + LINEAR_FEATURE_HEIGHT / 2
                      const noColor = isFeatureNoColor(info.feature.color)
                      const textWidth = estimateLinearInlineFeatureTextWidthPx(label, featureInlineFontSizePx)
                      const padX = 3
                      const padY = 1
                      return (
                        <g
                          className="linear-feature-label-group"
                          onClick={(event) => {
                            event.stopPropagation()
                            onSelect(info.feature.id, event.shiftKey || event.ctrlKey || event.metaKey, info.start)
                          }}
                          onDoubleClick={(event) => {
                            event.stopPropagation()
                            if (!isOrf) onFeatureEdit(info.feature.id)
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          onPointerUp={(event) => event.stopPropagation()}
                        >
                          {noColor && (
                            <rect
                              x={labelX - textWidth / 2 - padX}
                              y={labelY - featureInlineFontSizePx / 2 - padY}
                              width={textWidth + padX * 2}
                              height={featureInlineFontSizePx + padY * 2}
                              rx={3}
                              ry={3}
                              className="feature-nocolor-label-backdrop"
                            />
                          )}
                          <text
                            x={labelX}
                            y={labelY}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={labelColor}
                            className={`linear-feature-label${noColor ? ' linear-feature-label-nocolor' : ''}`}
                            style={{
                              fontSize: featureInlineFontSizePx,
                              fontWeight: featureInlineFontWeight,
                            }}
                          >
                            {label}
                          </text>
                        </g>
                      )
                    })()
                  )}
                  {cleavageArrowsOnSegment(info.feature, info.start, info.end).map((cleavagePos) => (
                    <CleavageArrowMark
                      key={`${info.segmentId}-cleavage-${cleavagePos}`}
                      transform={`translate(${sequenceX(cleavagePos)} ${y + LINEAR_FEATURE_HEIGHT / 2})`}
                      title={`Cleavage site ${cleavagePos + 1}`}
                    />
                  ))}
                </>
              )}
              <title>{`${featureDisplayName(info.feature)} ${formatRange(info.start, info.end)}`}</title>
            </g>
          )
        })}
        {linearFeatureLabelPlan.placements.map((placement) => {
          if (placement.kind !== 'belowHalf' && placement.kind !== 'belowFull') return null
          const info = renderedFeatures.find((feature) => feature.segmentId === placement.segmentId)
          if (!info) return null
          if (sgRnaParts.has(info.feature.id)) return null
          const midX = (sequenceX(info.start) + sequenceX(info.end)) / 2
          const bodyBottom = yLayout.featureBaseY + info.level * LINEAR_FEATURE_ROW_HEIGHT + LINEAR_FEATURE_HEIGHT
          if (placement.kind === 'belowHalf') {
            return (
              <text
                key={`feature-label-half-${placement.segmentId}`}
                x={midX}
                y={bodyBottom + 2 + placement.height / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                className={`linear-feature-label linear-feature-label-below${selectedFeatureIds.length >= 3 && selectedFeatureIds.includes(info.feature.id) ? ' is-multi-feature-selection' : ''}`}
                style={{ fontSize: featureInlineFontSizePx, fontWeight: featureInlineFontWeight, fill: 'var(--vg-map-ink)' }}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(info.feature.id, event.shiftKey || event.ctrlKey || event.metaKey, info.start)
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  if (!isOrfFeature(info.feature)) onFeatureEdit(info.feature.id)
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
              >
                {featureDisplayName(info.feature)}
              </text>
            )
          }
          const provisionalMid = (placement.leaderX)
          const offset = placement.labelCenterX - provisionalMid
          const leaderX = midX
          const labelCenterX = leaderX + offset
          const labelTop = bodyBottom + LINEAR_FEATURE_ROW_HEIGHT - placement.height / 2
          return (
            <g
              key={`feature-label-full-${placement.segmentId}`}
              className={`feature-callout linear-feature-callout-below${selectedFeatureIds.length >= 3 && selectedFeatureIds.includes(info.feature.id) ? ' is-multi-feature-selection' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(info.feature.id, event.shiftKey || event.ctrlKey || event.metaKey, info.start)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                if (!isOrfFeature(info.feature)) onFeatureEdit(info.feature.id)
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
            >
              <line x1={leaderX} y1={bodyBottom} x2={leaderX} y2={labelTop} />
              <text
                x={labelCenterX}
                y={labelTop + placement.height / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                className="linear-feature-label linear-feature-label-below"
                style={{ fontSize: featureInlineFontSizePx, fontWeight: featureInlineFontWeight, fill: 'var(--vg-map-ink)' }}
              >
                {featureDisplayName(info.feature)}
              </text>
            </g>
          )
        })}
        {featureGapLinks.map((gap) => {
          const y = yLayout.featureBaseY + gap.level * LINEAR_FEATURE_ROW_HEIGHT + LINEAR_FEATURE_HEIGHT / 2
          const gapLabel = linearFeatureLabelPlan.gapLabelLinks.find(
            (item) => item.gap.featureId === gap.featureId && item.gap.start === gap.start && item.gap.end === gap.end,
          )
          const label = gapLabel ? featureDisplayName(gapLabel.feature) : null
          const labelX = (sequenceX(gap.start) + sequenceX(gap.end)) / 2
          const labelWidth = label ? estimateLinearInlineFeatureTextWidthPx(label, featureInlineFontSizePx) + 8 : 0
          const noColor = gapLabel ? isFeatureNoColor(gapLabel.feature.color) : false
          return (
            <g key={`${gap.featureId}:${gap.start}-${gap.end}`} className={selectedFeatureIds.length >= 3 && selectedFeatureIds.includes(gap.featureId) ? 'is-multi-feature-selection' : undefined}>
              <line
                x1={sequenceX(gap.start)}
                y1={y}
                x2={sequenceX(gap.end)}
                y2={y}
                className="linear-feature-gap-connector"
              />
              {gapLabel && label && (
                <g
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(gapLabel.feature.id, event.shiftKey || event.ctrlKey || event.metaKey, gap.start)
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    onFeatureEdit(gapLabel.feature.id)
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                >
                  <rect
                    x={labelX - labelWidth / 2}
                    y={y - featureInlineFontSizePx / 2 - 2}
                    width={labelWidth}
                    height={featureInlineFontSizePx + 4}
                    rx={2}
                    className="linear-feature-gap-label-backdrop"
                  />
                  <text
                    x={labelX}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={`linear-feature-label linear-feature-gap-label${noColor ? ' linear-feature-label-nocolor' : ''}`}
                    style={{
                      fontSize: featureInlineFontSizePx,
                      fontWeight: featureInlineFontWeight,
                      fill: noColor ? 'var(--vg-scientific-label-ink)' : contrastTextColor(gapLabel.feature.color),
                    }}
                  >
                    {label}
                  </text>
                </g>
              )}
            </g>
          )
        })}
        </g>
        {viewRange ? (
          <g className="map-zoom-overflow-ellipsis" pointerEvents="none">
            {/* Three backbone-weight dots outside the zoom window when more sequence lies beyond. */}
            {viewStart > 0
              ? [0, 1, 2].map((index) => (
                  <circle
                    key={`zoom-overflow-start-${index}`}
                    className="map-zoom-overflow-dot"
                    cx={trackLeft - 6 - index * 8}
                    cy={yLayout.backboneY}
                    r={2.8}
                  />
                ))
              : null}
            {viewEnd < record.sequence.length
              ? [0, 1, 2].map((index) => (
                  <circle
                    key={`zoom-overflow-end-${index}`}
                    className="map-zoom-overflow-dot"
                    cx={trackRight + 6 + index * 8}
                    cy={yLayout.backboneY}
                    r={2.8}
                  />
                ))
              : null}
          </g>
        ) : null}
        {sgRnaMapDisplaySegments(
          sgRnaMapSegments,
          (trackRight - trackLeft) / viewLength,
          { minPosition: 0, maxPosition: record.sequence.length },
        ).map((segment, index) => {
          const start = Math.max(viewStart, segment.start)
          const end = Math.min(viewEnd, segment.end)
          if (end <= start) return null
          const guideId = segment.annotation.guide.id
          const selected = selectedFeatureId === guideId || selectedFeatureIds.includes(guideId)
          const y = sgRnaLinearBindingY(yLayout.strandY, segment.strand)
          return <g
            key={`linear-sgrna-${segment.annotation.id}-${segment.part}-${index}`}
            className={`sgrna-map-callout${selected ? ' is-selected' : ''}${selected && selectedFeatureIds.length >= 3 ? ' is-multi-feature-selection' : ''}`}
            onClick={(event) => { event.stopPropagation(); onSelect(guideId, event.shiftKey || event.ctrlKey || event.metaKey) }}
            onDoubleClick={(event) => { event.stopPropagation(); onFeatureEdit(guideId) }}
          >
            {segment.part === 'pam' ? (() => {
              const arrow = sgRnaMapPamArrowSpan({ strand: segment.strand, start, end }, (trackRight - trackLeft) / viewLength)
              const tipX = sequenceX(arrow.tipBp)
              const baseX = sequenceX(arrow.baseBp)
              return <polygon
                points={`${tipX},${y} ${baseX},${y - SG_RNA_MAP_PAM_ARROW_HALF_WIDTH_PX} ${baseX},${y + SG_RNA_MAP_PAM_ARROW_HALF_WIDTH_PX}`}
                className="sgrna-map-pam-arrow"
              />
            })() : <line x1={sequenceX(start)} x2={sequenceX(end)} y1={y} y2={y} className="sgrna-map-binding" />}
            <title>{`${segment.annotation.guide.name} ${segment.part === 'pam' ? `PAM ${segment.annotation.observedPam}` : 'guide'} · ${segment.annotation.nuclease}`}</title>
          </g>
        })}
        {linearCallouts.map((callout) => {
          const { site, index, anchor, elbow, connectorEnd, x, y, label, textAnchor, box } = callout
          const primerMeta = primerCalloutMeta.get(siteKey(site))
          const sgRnaMeta = sgRnaCalloutMeta.get(siteKey(site))
          if (sgRnaMeta) {
            const guideId = sgRnaMeta.guide.id
            const selected = selectedFeatureId === guideId || selectedFeatureIds.includes(guideId)
            const strand = sgRnaMeta.guide.locations[0]?.strand ?? 'forward'
            const guideY = sgRnaLinearBindingY(yLayout.strandY, strand)
            const leaderX = sequenceX(sgRnaGuideAnchorBp(sgRnaMeta))
            const labelPlacement = sgRnaLinearCalloutTextPlacement(x, connectorEnd.x, textAnchor)
            return <g
              key={`sgrna-${site.start}-${index}`}
              className={`enzyme-callout sgrna-map-callout${selected ? ' is-selected' : ''}${selected && selectedFeatureIds.length >= 3 ? ' is-multi-feature-selection' : ''}`}
              onClick={(event) => { event.stopPropagation(); onSelect(guideId, event.shiftKey || event.ctrlKey || event.metaKey) }}
              onDoubleClick={(event) => { event.stopPropagation(); onFeatureEdit(guideId) }}
            >
              <polyline points={`${leaderX},${guideY} ${elbow.x},${elbow.y} ${connectorEnd.x},${connectorEnd.y}`} className="sgrna-map-leader" />
              {selected
                ? <SelectedMapCalloutLabel
                    label={label}
                    x={labelPlacement.x}
                    y={y}
                    textAnchor={labelPlacement.textAnchor}
                    fontSize={SG_RNA_MAP_LABEL_FONT_SIZE_PX}
                    fontWeight={SG_RNA_MAP_LABEL_FONT_WEIGHT}
                    textClassName="sgrna-map-name"
                  />
                : <text x={labelPlacement.x} y={y} textAnchor={labelPlacement.textAnchor} dominantBaseline="middle" className="sgrna-map-name">{label}</text>}
            </g>
          }
          if (primerMeta) {
            // Parallel annealed segment beside the duplex (circular uses ±8px); no 3′ end notches.
            const annealY =
              primerMeta.strand === 'forward'
                ? yLayout.strandY - LINEAR_PRIMER_RULER_OFFSET_PX
                : yLayout.strandY + LINEAR_PRIMER_RULER_OFFSET_PX
            const leaderX = sequenceX(primerMeta.anneal5Prime)
            const selected = primerIsSelectedOnMap(primerMeta.primerId, selectedPrimerId, selectedPrimerIds)
            const accent = primerMapAccentColor(primerMeta.color, selected)
            const primerStroke = { stroke: accent }
            // Left-routed callouts are laid out with their box ending at the
            // leader. Anchor the text at that same end instead of rendering
            // from the box's far edge and leaving a label-width gap.
            const labelPlacement = sgRnaLinearCalloutTextPlacement(x, connectorEnd.x, textAnchor)
            return (
              <g
                key={`${site.enzyme.name}-${site.start}-${index}`}
                className={`enzyme-callout primer-callout linear-primer-callout${selected ? ' is-selected' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onPrimerSelect(primerMeta.primerId, event.shiftKey || event.ctrlKey || event.metaKey)
                }}
                onDoubleClick={(event) => {
                  if (!onPrimerEdit) return
                  event.stopPropagation()
                  event.preventDefault()
                  onPrimerEdit(primerMeta.primerId)
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
              >
                <line
                  x1={sequenceX(primerMeta.start)}
                  y1={annealY}
                  x2={sequenceX(primerMeta.end)}
                  y2={annealY}
                  className={`linear-primer-annealed${!selected && contrastTextColor(primerMeta.color) === '#fff' ? ' primer-dark-color-leader' : ''}`}
                  style={{
                    ...primerStroke,
                    '--primer-dark-contrast-color': darkThemePrimerColor(primerMeta.color),
                  } as CSSProperties}
                />
                <polyline
                  points={`${leaderX},${annealY} ${elbow.x},${elbow.y} ${connectorEnd.x},${connectorEnd.y}`}
                  className={!selected && contrastTextColor(primerMeta.color) === '#fff' ? 'primer-dark-color-leader' : undefined}
                  style={{
                    ...primerStroke,
                    '--primer-dark-contrast-color': darkThemePrimerColor(primerMeta.color),
                  } as CSSProperties}
                />
                {selected ? (
                  <SelectedPrimerMapLabel
                    label={label}
                    x={labelPlacement.x}
                    y={y}
                    textAnchor={labelPlacement.textAnchor}
                    fontSize={outsideLabelFontSizePx}
                    fontWeight={primerFontWeight}
                  />
                ) : (
                  <text
                    x={labelPlacement.x}
                    y={y}
                    textAnchor={labelPlacement.textAnchor}
                    dominantBaseline="alphabetic"
                    dy="0.35em"
                    className={contrastTextColor(primerMeta.color) === '#fff' ? 'primer-label-needs-light-ink' : undefined}
                    style={{
                      fontSize: outsideLabelFontSizePx,
                      fontWeight: primerFontWeight,
                      fill: primerMeta.color,
                      '--primer-dark-contrast-color': darkThemePrimerColor(primerMeta.color),
                    } as CSSProperties}
                  >
                    <MapCalloutLabelContent label={label} kind="primer" anchor={labelPlacement.textAnchor} />
                  </text>
                )}
              </g>
            )
          }
          if (site.match === '__feature_callout__') {
            const featureInfo = linearExternalFeatureSiteKeys.get(siteKey(site))
            return (
              <g
                key={`feature-callout-${site.enzyme.name}-${site.start}-${index}`}
                className={`feature-callout feature-callout-external linear-feature-callout-external${featureInfo && selectedFeatureIds.length >= 3 && selectedFeatureIds.includes(featureInfo.feature.id) ? ' is-multi-feature-selection' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (featureInfo) onSelect(featureInfo.feature.id, event.shiftKey || event.ctrlKey || event.metaKey, featureInfo.start)
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  event.preventDefault()
                  if (featureInfo && !isOrfFeature(featureInfo.feature)) onFeatureEdit(featureInfo.feature.id)
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
              >
                <polyline
                  points={`${anchor.x},${anchor.y} ${elbow.x},${elbow.y} ${connectorEnd.x},${connectorEnd.y}`}
                />
                <rect
                  x={box.left}
                  y={box.top}
                  width={box.right - box.left}
                  height={box.bottom - box.top}
                  rx="6"
                  ry="6"
                />
                <text
                  x={(box.left + box.right) / 2}
                  y={(box.top + box.bottom) / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ fontSize: outsideLabelFontSizePx + 2, fontWeight: 750 }}
                >
                  {label}
                </text>
              </g>
            )
          }
          const labelStyle = enzymeLabelDisplayStyle(site, enzymePreferences, enzymeCounts)
          const isUnique =
            enzymePreferences.boldUniqueCutters && uniqueEnzymeCalloutKeys.has(siteKey(site))
          const selected = restrictionSiteIsSelected(site, selectedRestrictionSites)
          const weight = labelStyle.bold ? uniqueEnzymeFontWeight : enzymeFontWeight
          const labelPlacement = sgRnaLinearCalloutTextPlacement(x, connectorEnd.x, textAnchor)
          const displayedLabel = mapCalloutLabelParts(label, 'enzyme', labelPlacement.textAnchor).text
          const hovered = enzymeCalloutMatchesHover(displayedLabel, enzymeTooltip.hoveredEnzymeName)
          return (
            <g
              key={`${site.enzyme.name}-${site.start}-${index}`}
              className={`enzyme-callout linear-enzyme-callout${restrictionSiteCutsOutsideSequence(site, record.sequence.length) ? ' is-outside-sequence' : ''}${isUnique ? ' is-unique' : ''}${selected ? ' is-selected' : ''}${hovered ? ' is-enzyme-hovered' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                onRestrictionSelect(
                  restrictionSiteFromCalloutClick(event, displayedLabel, site, restrictionSites),
                  event.shiftKey || event.ctrlKey || event.metaKey,
                )
              }}
              onDoubleClick={(event) => {
                openEnzymeInfoFromCalloutGroup(event, displayedLabel, site.enzyme.name, onEnzymeInfo)
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
            >
              <line x1={anchor.x} y1={anchor.y - 5} x2={anchor.x} y2={anchor.y + 5} className="linear-cut-tick" />
              <polyline points={`${anchor.x},${anchor.y} ${elbow.x},${elbow.y} ${connectorEnd.x},${connectorEnd.y}`} />
              <g onPointerMove={(event) => {
                const hoveredSite = restrictionSiteFromCalloutClick(event, displayedLabel, site, restrictionSites)
                enzymeTooltip.hover(hoveredSite, enzymeCounts[hoveredSite.enzyme.name] ?? 0, event.clientX, event.clientY, 'pointer', restrictionSiteCutsOutsideSequence(hoveredSite, record.sequence.length))
              }} onPointerLeave={enzymeTooltip.dismiss} onPointerDown={enzymeTooltip.dismiss}>
              {selected ? (
                <SelectedMapCalloutLabel
                  label={label}
                  mapCalloutKind="enzyme"
                  x={labelPlacement.x}
                  y={y}
                  textAnchor={labelPlacement.textAnchor}
                  fontSize={outsideLabelFontSizePx}
                  fontWeight={weight}
                />
              ) : (
                <EnzymeCalloutLabelText
                  label={label}
                  mapCalloutKind="enzyme"
                  x={labelPlacement.x}
                  y={y}
                  textAnchor={labelPlacement.textAnchor}
                  labelStyle={labelStyle}
                  fontSize={outsideLabelFontSizePx}
                  fontWeight={weight}
                  onEnzymeInfo={onEnzymeInfo}
                />
              )}
              </g>
            </g>
          )
        })}
        {/* Product Vector/Insert bands above enzyme leaders so cut ticks tuck under the temp features. */}
        {featureDrawableSegments(rulerTrackFeatures, record.sequence.length).map((segment) => {
          const x = sequenceX(segment.start)
          const width = Math.max(1, sequenceX(segment.end) - x)
          const label = segment.feature.name.trim()
          const showLabel = label.length > 0 && width >= Math.max(28, label.length * 6)
          return (
            <g key={`ruler-${segment.segmentId}`} className="linear-ruler-segment-group" pointerEvents="none">
              <rect
                className="linear-ruler-segment"
                x={x}
                y={yLayout.backboneY - LINEAR_RULER_SEGMENT_HALF_WIDTH}
                width={width}
                height={LINEAR_RULER_SEGMENT_HALF_WIDTH * 2}
                fill={segment.feature.color}
              />
              {showLabel ? (
                <text
                  x={x + width / 2}
                  y={yLayout.backboneY}
                  className="linear-ruler-segment-label"
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fill: contrastTextColor(segment.feature.color) }}
                >
                  {label}
                </text>
              ) : null}
            </g>
          )
        })}
        {Number.isFinite(visibleLevelLimit) &&
          allRenderedFeatures.some((feature) => featureLevelBand(feature.level) > visibleLevelLimit) && (
          <text x={trackRight} y={featureBandBottom + 18} textAnchor="end" className="hidden-feature-levels">
            Inner feature levels hidden at this width
          </text>
        )}
        {(() => {
          const titleX = (trackLeft + trackRight) / 2
          const titleY = fittedView.contentBottom + 20
          const subtitleY = fittedView.contentBottom + 40
          const titleTextWidthEstimate = Math.max(displayedMapLabel.length * 7.4, mapSubtitle.length * 6.4)
          const editorWidth = Math.max(160, titleTextWidthEstimate + 40)
          return (
            <>
              {editingTitle ? (
                <foreignObject
                  x={titleX - editorWidth / 2}
                  y={titleY - 20}
                  width={editorWidth}
                  height={30}
                >
                  <input
                    className="map-title-input"
                    autoFocus
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={commitTitleEdit}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitTitleEdit()
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelTitleEdit()
                      }
                      event.stopPropagation()
                    }}
                  />
                </foreignObject>
              ) : (
                <text
                  x={titleX}
                  y={titleY}
                  textAnchor="middle"
                  className={`map-title${onRenameRecord || onEditMapLabel ? ' is-editable' : ''}`}
                  onPointerDown={onRenameRecord || onEditMapLabel ? (event) => event.stopPropagation() : undefined}
                  onPointerUp={onRenameRecord || onEditMapLabel ? (event) => event.stopPropagation() : undefined}
                  onDoubleClick={onRenameRecord || onEditMapLabel ? beginTitleEdit : undefined}
                >
                  {onRenameRecord || onEditMapLabel ? <title>Double-click to edit</title> : null}
                  {displayedMapLabel}
                </text>
              )}
              <text x={titleX} y={subtitleY} textAnchor="middle" className="map-subtitle">
                {mapSubtitle}
              </text>
            </>
          )
        })()}
        <LinearAlignmentMapTraces
          traceFiles={traceFiles}
          alignmentsVisible={alignmentsVisible}
          bandTop={yLayout.alignmentBandTop}
          bandHeight={yLayout.alignmentBandHeight}
          trackLeft={trackLeft}
          trackRight={trackRight}
          selectedTraceId={selectedAlignmentTraceId}
          sequenceX={sequenceX}
          onSelectTrace={onSelectAlignmentTrace}
        />
      </svg>
    </div>
  )
}
