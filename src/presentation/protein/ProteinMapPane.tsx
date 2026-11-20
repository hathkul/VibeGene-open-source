import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { BinderStructureControl } from '../../components/BinderStructureControl'
import { ProteinAlignmentMapTracks } from '../../components/ProteinAlignmentMapTracks'
import { type BinderNumbering, type BinderStructure } from '../../domain/binderStructure'
import { computeLinearTrackLayout, estimateLinearMapHeightForRows, fitLinearMapViewBox, linearCalloutLadderHeightAboveStrand } from '../../domain/mapLayout'
import { layoutLinearEnzymeCalloutsSimple } from '../../domain/linearSimpleRouter'
import { aminoAcidInfo, proteinDisplayNumberAt } from '../../domain/protein'
import { type ProteinComparisonAlignmentCacheEntry, type ProteinComparisonSource, type ProteinComparisonVariableRegion } from '../../domain/proteinAlignmentTypes'
import { defaultProteinBondColor, proteinBondDescription, proteinBondStrokeWidth, proteinBondToCalloutSite, proteinMapBondLabelAttachX } from '../../domain/proteinBonds'
import { layoutProteinMapBonds, layoutProteinMapFeatures, proteinMapBondPath, proteinMapBoundaryAtFraction, proteinMapTickStep } from '../../domain/proteinMap'
import { formatRange, sanitizeProtein } from '../../domain/sequence'
import { strandColorAtPosition } from '../../domain/snapgeneStrandColors'
import { type ProteinTranslationSource, type SequenceRecord } from '../../domain/types'
import { estimateLinearInlineFeatureLabelWidthPx } from '../../domain/linearFeatureLabels'
import { formatSequenceLength } from '../../domain/moleculeCapabilities'
import { MOBILE_PROTEIN_MAP_TOUCH_HINT, MOBILE_PROTEIN_MAP_ZOOMED_TOUCH_HINT } from '../../ui/mobilePairSelection'
import { matchesMobileShellViewport, useMobileShellViewport } from '../../ui/mobileShellMedia'
import { proteinMapBaseWidthFromScrollViewport, proteinMapViewRangeAfterHorizontalDrag } from '../../ui/proteinMapViewport'
import { useProteinComparisonAlignments } from '../hooks/useProteinComparisonAlignments'
import { clampMapZoomRange, featureTypeHasArrow, mapZoomCaretPosition, MapZoomStrip } from '../map'
import { LINEAR_FEATURE_ARROW_PX, contrastTextColor, featureDisplayName, linearFeatureBandPath, measureTextWidthPx } from '../map/mapPrimitives'
import {
  defaultProteinClassColorPalette,
  defaultProteinResidueColorPalette,
  normalizeProteinColorMode,
  type DisplaySettings,
  type ProteinColorCode,
  type SelectionRange,
} from '../sequence'
import { ProteinTranslationOrigin } from './ProteinTranslationOrigin'

const emptyProteinComparisonSources: ProteinComparisonSource[] = []
const emptyProteinComparisonVariableRegions: ProteinComparisonVariableRegion[] = []

export function ProteinMapVisualControlsPanel({
  settings,
  onChange,
  onSave,
  onRevert,
}: {
  settings: DisplaySettings['proteinMapVisual']
  onChange: (patch: Partial<DisplaySettings['proteinMapVisual']>) => void
  onSave?: () => void
  onRevert?: () => void
}) {
  const rangeControl = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    ariaLabel: string,
    patch: (value: number) => Partial<DisplaySettings['proteinMapVisual']>,
  ) => (
    <label>
      <span className="elliptic-ring-gap-label">{label} {value}{label.includes('weight') ? '' : 'px'}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(patch(Number(event.target.value)))}
      />
    </label>
  )

  return (
    <div className="elliptic-ring-gap-control protein-map-visual-controls" onPointerDown={(event) => event.stopPropagation()}>
      <strong className="protein-map-visual-controls-title">Protein map</strong>
      {rangeControl('Title size', settings.titleFontSizePx, 12, 24, 1, 'Protein map title font size', (value) => ({ titleFontSizePx: value }))}
      {rangeControl('Title weight', settings.titleFontWeight, 400, 800, 100, 'Protein map title font weight', (value) => ({ titleFontWeight: value }))}
      {rangeControl('Ruler size', settings.rulerFontSizePx, 7, 14, 1, 'Protein map ruler font size', (value) => ({ rulerFontSizePx: value }))}
      <div className="elliptic-ring-gap-divider" />
      {rangeControl('Backbone height', settings.backboneHeightPx, 6, 20, 1, 'Protein map backbone height', (value) => ({ backboneHeightPx: value }))}
      {rangeControl('Feature height', settings.featureHeightPx, 10, 30, 1, 'Protein map feature height', (value) => ({ featureHeightPx: value }))}
      {rangeControl('Feature name size', settings.featureLabelFontSizePx, 8, 18, 1, 'Protein map feature label font size', (value) => ({ featureLabelFontSizePx: value }))}
      {rangeControl('Feature name weight', settings.featureLabelFontWeight, 400, 800, 50, 'Protein map feature label font weight', (value) => ({ featureLabelFontWeight: value }))}
      <div className="elliptic-ring-gap-divider" />
      {rangeControl('Bond label size', settings.bondLabelFontSizePx, 8, 16, 1, 'Protein bond label font size', (value) => ({ bondLabelFontSizePx: value }))}
      {rangeControl('Bond label weight', settings.bondLabelFontWeight, 400, 800, 50, 'Protein bond label font weight', (value) => ({ bondLabelFontWeight: value }))}
      <div className="elliptic-ring-gap-divider" />
      {rangeControl('Alignment label size', settings.alignmentLabelFontSizePx, 7, 14, 1, 'Protein alignment map label font size', (value) => ({ alignmentLabelFontSizePx: value }))}
      {rangeControl('Alignment label weight', settings.alignmentLabelFontWeight, 400, 800, 50, 'Protein alignment map label font weight', (value) => ({ alignmentLabelFontWeight: value }))}
      {rangeControl('Alignment track height', settings.alignmentTrackHeightPx, 8, 24, 1, 'Protein alignment map track height', (value) => ({ alignmentTrackHeightPx: value }))}
      {onSave || onRevert ? (
        <div className="visual-controls-footer">
          {onRevert ? <button type="button" className="visual-controls-revert" onClick={onRevert}>Revert to defaults</button> : null}
          {onSave ? <button type="button" className="visual-controls-save" onClick={onSave}>Save</button> : null}
        </div>
      ) : null}
    </div>
  )
}

export function ProteinMapPane({
  record,
  onOpenTranslationSourceDna,
  selectedRange,
  motifHits,
  activeHitIndex,
  searchQuery,
  selectedFeatureId,
  onRangeSelect,
  onFeatureSelect,
  onFeatureEdit,
  onAnnotateBinder,
  binderNumbering,
  binderStructure,
  onBinderNumberingChange,
  onBinderStructureChange,
  onAlignmentCacheEntry,
  onBondEdit,
  onStatus,
  showFeatures,
  showColors,
  showFeatureLabels,
  showAlignments,
  displaySettings,
  onDisplaySettingsChange,
  onSaveVisualSettings,
  onRevertVisualSettings,
  viewRange = null,
  zoomSliderValue = 0,
  onZoomSliderValueChange,
  onViewRangeChange,
}: {
  record: SequenceRecord
  onOpenTranslationSourceDna?: (source: ProteinTranslationSource) => void
  selectedRange: SelectionRange | null
  motifHits: number[]
  activeHitIndex: number
  searchQuery: string
  selectedFeatureId: string | null
  onRangeSelect: (range: SelectionRange) => void
  onFeatureSelect: (featureId: string) => void
  onFeatureEdit: (featureId: string) => void
  onAnnotateBinder: (numbering: BinderNumbering) => void
  binderNumbering?: BinderNumbering | null
  binderStructure?: BinderStructure | null
  onBinderNumberingChange?: (numbering: BinderNumbering | null) => void
  onBinderStructureChange?: (structure: BinderStructure | null) => void
  onAlignmentCacheEntry: (entry: ProteinComparisonAlignmentCacheEntry) => void
  onBondEdit: (bondId: string) => void
  onStatus: (message: string) => void
  showFeatures: boolean
  showColors: boolean
  showFeatureLabels: boolean
  showAlignments: boolean
  displaySettings: DisplaySettings
  onDisplaySettingsChange: (updater: (current: DisplaySettings) => DisplaySettings) => void
  onSaveVisualSettings?: () => void
  onRevertVisualSettings?: () => void
  viewRange?: SelectionRange | null
  zoomSliderValue?: number
  onZoomSliderValueChange?: (value: number) => void
  onViewRangeChange?: (range: SelectionRange) => void
}) {
  const sequenceLength = record.sequence.length
  const viewStart = viewRange?.start ?? 0
  const viewEnd = viewRange?.end ?? sequenceLength
  const visibleSequenceLength = Math.max(1, viewEnd - viewStart)
  const proteinMapVisual = displaySettings.proteinMapVisual
  const proteinColorMode = normalizeProteinColorMode(displaySettings.proteinColors.mode)
  const proteinClassPalette = displaySettings.proteinColors.classPalette ?? defaultProteinClassColorPalette
  const proteinResiduePalette = displaySettings.proteinColors.residuePalette ?? defaultProteinResidueColorPalette
  const [localBinderApplication, setLocalBinderApplication] = useState<{
    referenceSequence: string
    numbering: BinderNumbering
  } | null>(null)
  const localNumbering = localBinderApplication && localBinderApplication.referenceSequence === record.sequence
    ? localBinderApplication.numbering
    : null
  const appliedBinderNumbering = binderNumbering ?? localNumbering
  const titleFontSizePx = proteinMapVisual.titleFontSizePx
  const titleFontWeight = proteinMapVisual.titleFontWeight
  const rulerFontSizePx = proteinMapVisual.rulerFontSizePx
  const backboneHeightPx = proteinMapVisual.backboneHeightPx
  const featureHeightPx = proteinMapVisual.featureHeightPx
  const featureLabelFontSizePx = proteinMapVisual.featureLabelFontSizePx
  const featureLabelFontWeight = proteinMapVisual.featureLabelFontWeight
  const bondLabelFontSizePx = proteinMapVisual.bondLabelFontSizePx
  const bondLabelFontWeight = proteinMapVisual.bondLabelFontWeight
  const alignmentLabelFontSizePx = proteinMapVisual.alignmentLabelFontSizePx
  const alignmentLabelFontWeight = proteinMapVisual.alignmentLabelFontWeight
  const alignmentTrackHeightPx = proteinMapVisual.alignmentTrackHeightPx
  const alignmentRowPitch = Math.max(28, alignmentLabelFontSizePx + alignmentTrackHeightPx + 9)
  const comparisonSources = showAlignments
    ? record.protein?.comparisonSources ?? emptyProteinComparisonSources
    : emptyProteinComparisonSources
  const comparisonVariableRegions = showAlignments
    ? record.protein?.comparisonVariableRegions ?? emptyProteinComparisonVariableRegions
    : emptyProteinComparisonVariableRegions
  const { entries: comparisonEntries, pending: comparisonPending } = useProteinComparisonAlignments(
    record.sequence,
    comparisonSources,
    comparisonVariableRegions,
    'Standard',
    record.protein?.comparisonAlignmentCache ?? [],
    onAlignmentCacheEntry,
  )
  const visibleComparisonEntries = useMemo(
    () => comparisonEntries.filter((entry) => entry.source.enabled),
    [comparisonEntries],
  )
  const alignedComparisonCount = visibleComparisonEntries.filter((entry) => entry.alignment).length
  const featureSegments = useMemo(
    () => layoutProteinMapFeatures(showFeatures ? record.features : [], sequenceLength)
      .filter((segment) => segment.start < viewEnd && viewStart < segment.end),
    [record.features, sequenceLength, showFeatures, viewEnd, viewStart],
  )
  const laneCount = Math.max(1, ...featureSegments.map((segment) => segment.lane + 1))
  const mapScrollRef = useRef<HTMLDivElement | null>(null)
  const isMobileShell = useMobileShellViewport()
  const [mapViewportWidth, setMapViewportWidth] = useState(0)
  const baseMapWidth = mapViewportWidth > 0
    ? proteinMapBaseWidthFromScrollViewport(mapViewportWidth, isMobileShell)
    : isMobileShell
      ? proteinMapBaseWidthFromScrollViewport(0, true)
      : 1120
  const sidePadding = 56
  const titleBottom = 8
  const bondLaneStep = 14
  const bondBarRise = 18
  const bondCornerRadius = 7
  const bondLabelStubHeight = 8
  const selectionAnchorRef = useRef<number | null>(null)
  const selectionDraggingRef = useRef(false)
  const selectionPointerIdRef = useRef<number | null>(null)
  const MOBILE_PROTEIN_MAP_PAN_THRESHOLD_PX = 8
  const mobileMapPanRef = useRef<{
    pointerId: number
    originX: number
    originY: number
    originScrollLeft: number
    originScrollTop: number
    originViewStart: number
    windowLen: number
  } | null>(null)
  const mobileMapPanActiveRef = useRef(false)
  const suppressMobileMapFeatureClickRef = useRef(false)

  useLayoutEffect(() => {
    const scrollHost = mapScrollRef.current
    if (!scrollHost || typeof ResizeObserver === 'undefined') return
    const updateWidth = (width: number) => {
      const nextWidth = Math.floor(width)
      setMapViewportWidth((currentWidth) => currentWidth === nextWidth ? currentWidth : nextWidth)
    }
    updateWidth(scrollHost.clientWidth)
    const observer = new ResizeObserver(([entry]) => updateWidth(entry.contentRect.width))
    observer.observe(scrollHost)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!viewRange || !onViewRangeChange) return
    const host = mapScrollRef.current
    if (!host) return
    const onWheel = (event: WheelEvent) => {
      const deltaPx = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (deltaPx === 0) return
      event.preventDefault()
      const shift = Math.round((deltaPx / Math.max(1, host.clientWidth)) * visibleSequenceLength)
      if (shift === 0) return
      onViewRangeChange(clampMapZoomRange({ start: viewStart + shift, end: viewEnd + shift }, sequenceLength))
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [onViewRangeChange, sequenceLength, viewEnd, viewRange, viewStart, visibleSequenceLength])

  const tickStep = proteinMapTickStep(visibleSequenceLength)
  const ticks: number[] = []
  const firstTick = Math.ceil(viewStart / tickStep) * tickStep
  if (viewStart < firstTick) ticks.push(viewStart)
  for (let position = firstTick; position <= viewEnd; position += tickStep) ticks.push(position)
  if (ticks.at(-1) !== viewEnd) ticks.push(viewEnd)
  const queryLength = sanitizeProtein(searchQuery).length
  const activeHit = motifHits[activeHitIndex]
  const bonds = useMemo(
    () => {
      if (!displaySettings.proteinBonds.visible) return []
      return (record.protein?.bonds ?? []).filter((bond) => (
        bond.visible !== false &&
        bond.endpoints.every(
          (endpoint) => !endpoint.chainId && endpoint.residue >= 0 && endpoint.residue < sequenceLength,
        )
      ))
    },
    [displaySettings.proteinBonds.visible, record.protein?.bonds, sequenceLength],
  )
  const bondLayouts = useMemo(
    () => layoutProteinMapBonds(bonds, sequenceLength),
    [bonds, sequenceLength],
  )
  const visibleBondLayouts = useMemo(
    () => bondLayouts.filter((layout) => layout.start < viewEnd && viewStart < layout.end),
    [bondLayouts, viewEnd, viewStart],
  )
  const bondLaneCount = Math.max(1, ...visibleBondLayouts.map((layout) => layout.lane + 1), 1)
  const bondStackHeight = bondBarRise + Math.max(0, bondLaneCount - 1) * bondLaneStep
  const bondCalloutBundle = useMemo(() => {
    const labeled = visibleBondLayouts.filter((layout) => layout.bond.showLabel !== false)
    const sites: NonNullable<ReturnType<typeof proteinBondToCalloutSite>>[] = []
    const bondBySiteKey = new Map<string, (typeof labeled)[number]>()
    labeled.forEach((layout, index) => {
      const sourceSite = proteinBondToCalloutSite(layout.bond, index)
      if (!sourceSite || sourceSite.cutTop < viewStart || sourceSite.cutTop >= viewEnd) return
      const site = {
        ...sourceSite,
        start: sourceSite.start - viewStart,
        end: sourceSite.end - viewStart,
        cutTop: sourceSite.cutTop - viewStart,
        cutBottom: sourceSite.cutBottom - viewStart,
      }
      sites.push(site)
      bondBySiteKey.set(`${site.match}:${site.cutTop}`, layout)
    })
    return { sites, bondBySiteKey }
  }, [viewEnd, viewStart, visibleBondLayouts])

  const bondLabelLayout = useMemo(() => {
    // Protein zoom changes the visible residue range; it should not also apply
    // DNA's oversized 1000px zoom track and introduce horizontal scrolling.
    const defaultTrack = computeLinearTrackLayout(baseMapWidth, [], sidePadding)
    if (!visibleSequenceLength || !bondCalloutBundle.sites.length) {
      return {
        backboneY: Math.max(64, titleBottom + bondStackHeight + 36),
        callouts: [] as ReturnType<typeof layoutLinearEnzymeCalloutsSimple>,
        ...defaultTrack,
      }
    }

    const leftCount = bondCalloutBundle.sites.filter((site) => site.cutTop / visibleSequenceLength < 0.5).length
    // Dense overlapping bonds often climb past a pure left/right count — reserve extra ladder rows.
    const rowsPerHalf = Math.max(1, leftCount, bondCalloutBundle.sites.length - leftCount) + 2
    const titleClearance = titleBottom + 10
    const labelBandHeight = linearCalloutLadderHeightAboveStrand(
      rowsPerHalf,
      bondLabelFontSizePx,
      bondLabelStubHeight,
    )
    let backboneY = titleClearance + labelBandHeight + bondStackHeight + 3

    const layoutAtBackbone = (backbone: number, mapWidth: number, trackLeft: number, trackRight: number) => {
      const strandY = backbone - 3 - bondStackHeight
      const protectedBandTop = strandY - 2
      const protectedBandBottom = backbone + 20
      const layoutHeight = Math.max(
        backbone + 120,
        estimateLinearMapHeightForRows(rowsPerHalf + 2, {
          strandY,
          featureStubHeight: bondLabelStubHeight,
          featureHeight: 26,
          protectedBandBottom,
          textHeight: bondLabelFontSizePx,
        }),
      )
      return layoutLinearEnzymeCalloutsSimple({
        sites: bondCalloutBundle.sites,
        sequenceLength: visibleSequenceLength,
        mapWidth,
        mapHeight: layoutHeight,
        trackLeft,
        trackRight,
        strandY,
        protectedBandTop,
        protectedBandBottom,
        featureHeight: 26,
        featureStubHeight: bondLabelStubHeight,
        labelRowLift: 0,
        labelForSite: (site) => site.enzyme.name,
        textHeightForSite: () => bondLabelFontSizePx,
        labelPaddingForSite: () => 4,
        labelWidthForSite: (_site, label) => measureTextWidthPx(
          label,
          `${bondLabelFontWeight} ${bondLabelFontSizePx}px system-ui, -apple-system, "Segoe UI", sans-serif`,
          6.4,
        ),
        rulerContactOffset: 1,
        guaranteePlacement: true,
      })
    }

    const provisionalCallouts = layoutAtBackbone(
      backboneY,
      defaultTrack.mapWidth,
      defaultTrack.trackLeft,
      defaultTrack.trackRight,
    )
    // Inset the backbone so end-bond labels keep side margins inside the map, matching DNA linear routing.
    const trackLayout = viewRange
      ? defaultTrack
      : computeLinearTrackLayout(baseMapWidth, provisionalCallouts, sidePadding, 240, 12)
    let callouts = layoutAtBackbone(backboneY, trackLayout.mapWidth, trackLayout.trackLeft, trackLayout.trackRight)

    // If the ladder still climbs into the title band, push the backbone down and re-route once.
    let minLabelTop = Infinity
    for (const callout of callouts) {
      minLabelTop = Math.min(minLabelTop, callout.box.top, callout.y, callout.elbow.y, callout.connectorEnd.y)
    }
    if (Number.isFinite(minLabelTop) && minLabelTop < titleClearance) {
      backboneY += titleClearance - minLabelTop
      callouts = layoutAtBackbone(backboneY, trackLayout.mapWidth, trackLayout.trackLeft, trackLayout.trackRight)
    }

    return {
      backboneY,
      callouts,
      ...trackLayout,
    }
  }, [baseMapWidth, bondCalloutBundle.sites, bondLabelFontSizePx, bondLabelFontWeight, bondStackHeight, viewRange, visibleSequenceLength])

  const mapWidth = bondLabelLayout.mapWidth
  const trackLeft = bondLabelLayout.trackLeft
  const trackRight = bondLabelLayout.trackRight
  const trackWidth = Math.max(1, trackRight - trackLeft)
  const toX = (position: number) =>
    trackLeft + ((Math.max(viewStart, Math.min(viewEnd, position)) - viewStart) / visibleSequenceLength) * trackWidth

  const backboneY = bondLabelLayout.backboneY
  const bondBaseY = backboneY - 3
  const featureTop = backboneY + backboneHeightPx / 2 + 25
  const laneHeight = featureHeightPx + 10
  const featureBandBottom = featureTop + laneCount * laneHeight
  const comparisonTop = featureBandBottom + 30
  const comparisonRowCount = showAlignments ? Math.max(1, visibleComparisonEntries.length) : 0
  const mapContentBottom = Math.max(
    250,
    showAlignments
      ? comparisonTop + comparisonRowCount * alignmentRowPitch + 44
      : featureBandBottom + 54,
  )
  const fittedMapView = useMemo(() => {
    const base = fitLinearMapViewBox(
      bondLabelLayout.callouts,
      trackLeft,
      trackRight,
      backboneY,
      mapContentBottom,
      10,
      mapWidth,
      8,
    )
    const top = Math.min(base.top, 8)
    const bottom = Math.max(base.top + base.height, mapContentBottom + 10)
    return {
      left: 0,
      top,
      width: mapWidth,
      height: Math.max(250, bottom - top),
    }
  }, [backboneY, bondLabelLayout.callouts, mapContentBottom, mapWidth, trackLeft, trackRight])
  const svgWidth = Math.ceil(fittedMapView.width)
  const svgHeight = Math.ceil(fittedMapView.height)

  useEffect(() => {
    if (!viewRange) return
    const scrollHost = mapScrollRef.current
    if (!scrollHost) return
    if (svgWidth <= scrollHost.clientWidth + 1) {
      scrollHost.scrollLeft = 0
      return
    }
    // Match DNA zoom: keep the oversized sequence track centered instead of
    // exposing its side-padding gutter when the zoom level changes.
    const trackMid = (trackLeft + trackRight) / 2
    const maxScrollLeft = Math.max(0, scrollHost.scrollWidth - scrollHost.clientWidth)
    scrollHost.scrollLeft = Math.max(0, Math.min(maxScrollLeft, trackMid - scrollHost.clientWidth / 2))
  }, [svgWidth, trackLeft, trackRight, viewRange])

  const residueRuns = useMemo(() => {
    const runs: Array<{ start: number; end: number; color: string }> = []
    for (let index = viewStart; index < viewEnd; index += 1) {
      const residue = record.sequence[index]!
      const info = aminoAcidInfo(residue)
      const code = (residue.toUpperCase() in proteinResiduePalette
        ? residue.toUpperCase()
        : 'X') as ProteinColorCode
      const color = !showColors
        ? '#e2e8f0'
        : proteinColorMode === 'class'
          ? proteinClassPalette[info.className]
          : proteinColorMode === 'residue'
            ? proteinResiduePalette[code]
            : strandColorAtPosition(record.protein?.userColors, index, 'forward', record.sequence.length, record.topology) ?? '#e2e8f0'
      const previous = runs.at(-1)
      if (previous?.color === color) previous.end = index + 1
      else runs.push({ start: index, end: index + 1, color })
    }
    return runs
  }, [proteinClassPalette, proteinColorMode, proteinResiduePalette, record.protein?.userColors, record.sequence, record.topology, showColors, viewEnd, viewStart])

  const residueBoundaryAtPointer = (event: ReactPointerEvent<SVGRectElement>) => {
    if (!sequenceLength) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)))
    return viewStart + proteinMapBoundaryAtFraction(visibleSequenceLength, fraction)
  }

  const extendMapSelection = (boundary: number) => {
    const anchor = selectionAnchorRef.current ?? boundary
    if (anchor === boundary) {
      onRangeSelect({ start: boundary, end: boundary })
      return
    }
    onRangeSelect({ start: Math.min(anchor, boundary), end: Math.max(anchor, boundary) })
  }

  const bondBarYForLane = (lane: number) => bondBaseY - bondBarRise - lane * bondLaneStep
  const proteinMapStyle = {
    '--protein-map-title-font-size': `${titleFontSizePx}px`,
    '--protein-map-title-font-weight': titleFontWeight,
    '--protein-map-ruler-font-size': `${rulerFontSizePx}px`,
    '--protein-map-feature-label-font-size': `${featureLabelFontSizePx}px`,
    '--protein-map-feature-label-font-weight': featureLabelFontWeight,
    '--protein-map-bond-label-font-size': `${bondLabelFontSizePx}px`,
    '--protein-map-bond-label-font-weight': bondLabelFontWeight,
    '--protein-map-alignment-label-font-size': `${alignmentLabelFontSizePx}px`,
    '--protein-map-alignment-label-font-weight': alignmentLabelFontWeight,
  } as CSSProperties

  function patchProteinMapVisual(patch: Partial<DisplaySettings['proteinMapVisual']>) {
    onDisplaySettingsChange((current) => ({
      ...current,
      proteinMapVisual: {
        ...current.proteinMapVisual,
        ...patch,
      },
    }))
  }

  function finishMobileMapPan(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = mobileMapPanRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (mobileMapPanActiveRef.current) {
      suppressMobileMapFeatureClickRef.current = true
      event.preventDefault()
    }
    mobileMapPanRef.current = null
    mobileMapPanActiveRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }
    }
  }

  function handleMobileMapPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!isMobileShell || event.button !== 0) return
    if ((event.target as Element).closest('.protein-map-select-target')) return
    const scrollHost = mapScrollRef.current
    if (!scrollHost) return
    // A click synthesized after the previous drag has already had its chance to
    // fire. Do not let stale suppression consume a later, intentional tap.
    suppressMobileMapFeatureClickRef.current = false
    mobileMapPanRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      originScrollLeft: scrollHost.scrollLeft,
      originScrollTop: scrollHost.scrollTop,
      originViewStart: viewStart,
      windowLen: Math.max(1, viewEnd - viewStart),
    }
    mobileMapPanActiveRef.current = false
  }

  function handleMobileMapPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = mobileMapPanRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.originX
    const dy = event.clientY - drag.originY
    if (!mobileMapPanActiveRef.current) {
      if (Math.hypot(dx, dy) < MOBILE_PROTEIN_MAP_PAN_THRESHOLD_PX) return
      mobileMapPanActiveRef.current = true
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // ignore
      }
    }
    event.preventDefault()
    const scrollHost = mapScrollRef.current
    if (!scrollHost) return
    if (viewRange && onViewRangeChange) {
      onViewRangeChange(proteinMapViewRangeAfterHorizontalDrag(
        { start: drag.originViewStart, end: drag.originViewStart + drag.windowLen },
        sequenceLength,
        dx,
        trackWidth,
      ))
      const maxScrollTop = Math.max(0, scrollHost.scrollHeight - scrollHost.clientHeight)
      scrollHost.scrollTop = Math.max(0, Math.min(maxScrollTop, drag.originScrollTop - dy))
      return
    }
    const maxScrollLeft = Math.max(0, scrollHost.scrollWidth - scrollHost.clientWidth)
    const maxScrollTop = Math.max(0, scrollHost.scrollHeight - scrollHost.clientHeight)
    scrollHost.scrollLeft = Math.max(0, Math.min(maxScrollLeft, drag.originScrollLeft - dx))
    scrollHost.scrollTop = Math.max(0, Math.min(maxScrollTop, drag.originScrollTop - dy))
  }

  return (
    <div className={`protein-map-pane${viewRange ? ' is-zoomed' : ''}`} style={proteinMapStyle}>
      {proteinMapVisual.panelOpen ? (
        <ProteinMapVisualControlsPanel
          settings={proteinMapVisual}
          onChange={patchProteinMapVisual}
          onSave={onSaveVisualSettings}
          onRevert={onRevertVisualSettings}
        />
      ) : null}
      <div className="protein-map-header">
        <div>
          <strong>{record.name}</strong>
          <span>{formatSequenceLength(sequenceLength, 'protein')}</span>
          <span>{record.features.length.toLocaleString()} features</span>
          <span>{(record.protein?.bonds.length ?? 0).toLocaleString()} bonds</span>
          <ProteinTranslationOrigin record={record} onOpenSource={onOpenTranslationSourceDna} />
          {showAlignments ? (
            <span>{alignedComparisonCount} alignment{alignedComparisonCount === 1 ? '' : 's'}{comparisonPending ? ' · aligning…' : ''}</span>
          ) : null}
        </div>
        <BinderStructureControl
          sequence={record.sequence}
                numbering={appliedBinderNumbering}
                structure={binderStructure}
                onStructureChange={onBinderStructureChange}
                onNumberingChange={(nextNumbering) => {
                  setLocalBinderApplication(nextNumbering ? { referenceSequence: record.sequence, numbering: nextNumbering } : null)
                  onBinderNumberingChange?.(nextNumbering)
                }}
          onAnnotate={onAnnotateBinder}
          onStatus={onStatus}
        />
      </div>
      {viewRange && onViewRangeChange && onZoomSliderValueChange ? (
        <MapZoomStrip
          sequenceLength={sequenceLength}
          annotationFeatures={record.features}
          viewRange={viewRange}
          caretPosition={mapZoomCaretPosition(selectedRange, sequenceLength)}
          sliderValue={zoomSliderValue}
          onSliderValueChange={onZoomSliderValueChange}
          onViewRangeChange={onViewRangeChange}
        />
      ) : null}
      {matchesMobileShellViewport() ? (
        <p className="sequence-mobile-touch-hint" role="note">
          {viewRange ? MOBILE_PROTEIN_MAP_ZOOMED_TOUCH_HINT : MOBILE_PROTEIN_MAP_TOUCH_HINT}
        </p>
      ) : null}
      <div ref={mapScrollRef} className="protein-map-scroll">
        {sequenceLength ? (
          <svg
            className="protein-map-svg"
            width={svgWidth}
            height={svgHeight}
            viewBox={`${fittedMapView.left} ${fittedMapView.top} ${fittedMapView.width} ${fittedMapView.height}`}
            role="img"
            aria-label={`Linear protein map for ${record.name}`}
            onPointerDown={isMobileShell ? handleMobileMapPointerDown : undefined}
            onPointerMove={isMobileShell ? handleMobileMapPointerMove : undefined}
            onPointerUp={isMobileShell ? finishMobileMapPan : undefined}
            onPointerCancel={isMobileShell ? finishMobileMapPan : undefined}
            onClickCapture={isMobileShell ? (event) => {
              if (!suppressMobileMapFeatureClickRef.current) return
              suppressMobileMapFeatureClickRef.current = false
              event.preventDefault()
              event.stopPropagation()
            } : undefined}
          >
            {visibleBondLayouts.map((layout) => {
              const x1 = toX(layout.start + 0.5)
              const x2 = toX(Math.max(layout.start, layout.end - 1) + 0.5)
              const barY = bondBarYForLane(layout.lane)
              const path = proteinMapBondPath(x1, x2, bondBaseY, barY, bondCornerRadius)
              return (
                <g
                  key={layout.bond.id}
                  className={`protein-map-bond is-${layout.bond.type}`}
                  style={{
                    color: layout.bond.color || defaultProteinBondColor(layout.bond.type),
                    '--protein-bond-stroke': `${proteinBondStrokeWidth(layout.bond)}px`,
                  } as CSSProperties}
                  onDoubleClick={() => onBondEdit(layout.bond.id)}
                >
                  <title>{proteinBondDescription(layout.bond)}</title>
                  <path d={path} />
                  <circle cx={x1} cy={bondBaseY} r={3.5} />
                  <circle cx={x2} cy={bondBaseY} r={3.5} />
                </g>
              )
            })}

            {bondLabelLayout.callouts.map((callout) => {
              const layout = bondCalloutBundle.bondBySiteKey.get(`${callout.site.match}:${callout.site.cutTop}`)
              if (!layout) return null
              const color = layout.bond.color || defaultProteinBondColor(layout.bond.type)
              const x1 = toX(layout.start + 0.5)
              const x2 = toX(Math.max(layout.start, layout.end - 1) + 0.5)
              const barY = bondBarYForLane(layout.lane)
              // Keep the vertical rise on the bond bar even when the router spreads the label sideways.
              const riseX = Math.max(Math.min(x1, x2), Math.min(Math.max(x1, x2), callout.anchor.x))
              const attachAtRight = Math.abs(callout.connectorEnd.x - callout.box.right) <= Math.abs(callout.connectorEnd.x - callout.box.left)
              const preferredAttachX = attachAtRight ? callout.box.right : callout.box.left
              const labelX = proteinMapBondLabelAttachX(
                riseX,
                preferredAttachX,
                attachAtRight ? 'left' : 'right',
              )
              const textAnchor = attachAtRight ? 'end' : 'start'
              return (
                <g
                  key={`bond-callout-${layout.bond.id}`}
                  className="protein-map-bond-callout"
                  style={{ color }}
                  onDoubleClick={() => onBondEdit(layout.bond.id)}
                >
                  <title>{proteinBondDescription(layout.bond)}</title>
                  <polyline
                    points={`${riseX},${barY} ${riseX},${callout.y} ${labelX},${callout.y}`}
                  />
                  <text
                    x={labelX}
                    y={callout.y}
                    textAnchor={textAnchor}
                    dominantBaseline="middle"
                  >
                    {callout.label}
                  </text>
                </g>
              )
            })}

            {motifHits.filter((start) => start < viewEnd && viewStart < start + queryLength).map((start) => (
              <rect
                key={`hit-${start}`}
                className={`protein-map-hit${start === activeHit ? ' is-active' : ''}`}
                x={toX(start)}
                y={backboneY + 9}
                width={Math.max(2, toX(Math.min(sequenceLength, start + queryLength)) - toX(start))}
                height={5}
              />
            ))}
            {selectedRange && selectedRange.end > selectedRange.start ? (
              <rect
                className="protein-map-selection"
                x={toX(selectedRange.start)}
                y={backboneY - backboneHeightPx / 2 - 7}
                width={Math.max(2, toX(selectedRange.end) - toX(selectedRange.start))}
                height={backboneHeightPx + 14}
              />
            ) : null}

            <rect
              x={trackLeft}
              y={backboneY - backboneHeightPx / 2}
              width={trackWidth}
              height={backboneHeightPx}
              rx={Math.min(4, backboneHeightPx / 2)}
              className="protein-map-backbone"
            />
            {residueRuns.map((run) => (
              <rect
                key={`${run.start}-${run.color}`}
                x={toX(run.start)}
                y={backboneY - Math.max(2, backboneHeightPx - 2) / 2}
                width={Math.max(1, toX(run.end) - toX(run.start))}
                height={Math.max(2, backboneHeightPx - 2)}
                fill={run.color}
              />
            ))}
            <rect
              x={trackLeft}
              y={backboneY - Math.max(14, backboneHeightPx / 2 + 7)}
              width={trackWidth}
              height={Math.max(28, backboneHeightPx + 14)}
              className="protein-map-select-target"
              aria-label="Drag to select amino acids on the protein map"
              onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                event.stopPropagation()
                const boundary = residueBoundaryAtPointer(event)
                if (boundary === undefined) return
                if (!event.shiftKey || selectionAnchorRef.current === null) selectionAnchorRef.current = boundary
                selectionDraggingRef.current = true
                selectionPointerIdRef.current = event.pointerId
                event.currentTarget.setPointerCapture(event.pointerId)
                extendMapSelection(boundary)
              }}
              onPointerMove={(event) => {
                if (!selectionDraggingRef.current) return
                if (selectionPointerIdRef.current !== event.pointerId) return
                const boundary = residueBoundaryAtPointer(event)
                if (boundary !== undefined) extendMapSelection(boundary)
              }}
              onPointerUp={(event) => {
                if (selectionPointerIdRef.current !== event.pointerId) return
                selectionDraggingRef.current = false
                selectionPointerIdRef.current = null
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }
              }}
              onPointerCancel={(event) => {
                if (selectionPointerIdRef.current !== event.pointerId) return
                selectionDraggingRef.current = false
                selectionPointerIdRef.current = null
              }}
            />

            {ticks.map((position) => {
              const residueIndex = Math.max(0, Math.min(sequenceLength - 1, position === viewEnd ? position - 1 : position))
              return (
                <g key={position} className="protein-map-tick">
                  <line x1={toX(position)} x2={toX(position)} y1={backboneY + backboneHeightPx / 2 + 2} y2={backboneY + backboneHeightPx / 2 + 8} />
                  <text x={toX(position)} y={backboneY + backboneHeightPx / 2 + rulerFontSizePx + 10} textAnchor="middle">
                    {proteinDisplayNumberAt(residueIndex, record.protein, record.features)}
                  </text>
                </g>
              )
            })}

            {featureSegments.map((segment) => {
              const x = toX(segment.start)
              const width = Math.max(3, toX(segment.end) - x)
              const y = featureTop + segment.lane * laneHeight
              const selected = selectedFeatureId === segment.feature.id
              const label = featureDisplayName(segment.feature)
              const featureColor = segment.feature.color === 'nocolor' ? '#94a3b8' : segment.feature.color
              const strand = segment.feature.locations[segment.locationIndex]?.strand ?? 'forward'
              const bandArrow: 'none' | 'forward' | 'reverse' =
                !featureTypeHasArrow(segment.feature.type) || width < Math.max(24, featureHeightPx * 2)
                  ? 'none'
                  : strand === 'reverse'
                    ? 'reverse'
                    : 'forward'
              const labelFits = width >= estimateLinearInlineFeatureLabelWidthPx(label, featureLabelFontSizePx)
              const labelArrowOffset = Math.min(LINEAR_FEATURE_ARROW_PX, width / 2) / 4
              const labelX = x + width / 2 + (bandArrow === 'reverse' ? labelArrowOffset : bandArrow === 'forward' ? -labelArrowOffset : 0)
              return (
                <g
                  key={`${segment.feature.id}-${segment.locationIndex}`}
                  className={`protein-map-feature${selected ? ' is-selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${label}, residues ${proteinDisplayNumberAt(segment.start, record.protein, record.features)} to ${proteinDisplayNumberAt(segment.end - 1, record.protein, record.features)}`}
                  onClick={() => onFeatureSelect(segment.feature.id)}
                  onDoubleClick={() => onFeatureEdit(segment.feature.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onFeatureSelect(segment.feature.id)
                  }}
                >
                  <title>{`${label} · ${formatRange(segment.start, segment.end)} — double-click for feature properties`}</title>
                  <path
                    d={linearFeatureBandPath(x, y, width, featureHeightPx, bandArrow)}
                    fill={featureColor}
                    className="protein-map-feature-shape"
                  />
                  {showFeatureLabels && labelFits ? (
                    <text
                      x={labelX}
                      y={y + featureHeightPx / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ fill: contrastTextColor(featureColor) }}
                    >
                      {label}
                    </text>
                  ) : null}
                </g>
              )
            })}
            {showAlignments ? (
              <g className="protein-alignment-map-band">
                <text x={trackLeft} y={comparisonTop - 9} className="protein-alignment-map-heading">
                  Comparative alignment
                </text>
                {visibleComparisonEntries.length ? (
                  <ProteinAlignmentMapTracks
                    entries={visibleComparisonEntries}
                    top={comparisonTop}
                    trackLeft={trackLeft}
                    trackRight={trackRight}
                    sequenceX={toX}
                    rowPitch={alignmentRowPitch}
                    labelFontSizePx={alignmentLabelFontSizePx}
                    labelFontWeight={alignmentLabelFontWeight}
                    trackHeightPx={alignmentTrackHeightPx}
                  />
                ) : (
                  <text x={trackLeft} y={comparisonTop + 22} className="protein-alignment-map-empty">
                    No enabled comparisons. Add or enable comparison sequences in Sequence view.
                  </text>
                )}
              </g>
            ) : null}
            {visibleBondLayouts.map((layout) => {
              const x1 = toX(layout.start + 0.5)
              const x2 = toX(Math.max(layout.start, layout.end - 1) + 0.5)
              const barY = bondBarYForLane(layout.lane)
              return (
                <path
                  key={`bond-hit-${layout.bond.id}`}
                  className="protein-map-bond-hit"
                  d={proteinMapBondPath(x1, x2, bondBaseY, barY, bondCornerRadius)}
                  aria-label={`${proteinBondDescription(layout.bond)} — double-click for bond properties`}
                  onDoubleClick={() => onBondEdit(layout.bond.id)}
                />
              )
            })}
          </svg>
        ) : <p className="muted">This protein has no residues.</p>}
      </div>
      <div className="protein-map-footer">
        <span>Drag across the backbone to select amino acids; Shift-drag extends from the previous anchor.</span>
        {showAlignments ? (
          <div className="protein-alignment-map-legend" aria-label="Comparative alignment legend">
            <span><i className="is-identity" />identity</span>
            <span><i className="is-similar" />similar</span>
            <span><i className="is-mismatch" />mismatch</span>
            <span><i className="is-gap" />gap/insertion</span>
            <span><i className="is-frameshift" />frameshift</span>
          </div>
        ) : null}
        {showColors && proteinColorMode === 'class' ? <div className="protein-color-legend" aria-label="Amino acid color legend">
          {(['nonpolar', 'polar', 'acidic', 'basic', 'special', 'unknown'] as const).map((className) => (
            <span key={className}><i className={`is-${className}`} style={{ background: proteinClassPalette[className] }} />{className}</span>
          ))}
        </div> : null}
      </div>
    </div>
  )
}
