import { useEffect, useMemo, useRef, useState } from 'react'
import { type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { isFeatureNoColor } from '../../domain/featureAppearance'
import { isPrimerCalloutSite } from '../../domain/mapLayout'
import { isSgRNAFeature } from '../../domain/sgrna'
import type { MinimapOligoSpan } from './sequenceMinimapOligos'
import { assignFeatureLevels, clampMapZoomRange, isRulerTrackFeature, minimapFeaturePath } from '../map'
import { siteKey } from '../map/mapPrimitives'
import { type RestrictionSite, type SequenceFeature } from '../../domain/types'
import {
  compactSequenceMinimapTrackLayout,
  computeSequenceMinimapVisibleRange,
  desktopSequenceMinimapTrackLayout,
  sequenceMinimapAlignmentExtraHeightPx,
  sequenceMinimapHeightPx,
  sequenceMinimapOligoTracksHeightPx,
  sequenceMinimapMarginPx,
  sequenceScrollHostFromViewMain,
  scrollSequenceViewToPosition,
  type SequenceMinimapTrackLayout,
  type SelectionRange,
  type StrandPairSelection,
} from './sequenceShared'
export function SequenceMinimap({
  sequenceLength,
  annotationFeatures,
  restrictionSites,
  selectedRange,
  cutStrandSelection,
  hoveredRestrictionSiteKey,
  scrollHostRef,
  onNavigate,
  visibleRange: visibleRangeOverride,
  onMinimapNavigate,
  onMinimapViewportNavigate,
  oligoSpans,
  alignmentCoverageSpans,
  zoomRange = null,
  onZoomRangeChange,
}: {
  sequenceLength: number
  annotationFeatures: SequenceFeature[]
  restrictionSites: RestrictionSite[]
  selectedRange: SelectionRange | null
  cutStrandSelection: StrandPairSelection | null
  hoveredRestrictionSiteKey: string | null
  scrollHostRef: RefObject<HTMLDivElement | null>
  onNavigate: (position: number) => void
  /** When set (alignment mode), use template range from the horizontal reference scroller. */
  visibleRange?: { start: number; end: number }
  /** When set, jump via alignment scroll instead of vertical sequence row scroll. */
  onMinimapNavigate?: (position: number) => void
  onMinimapViewportNavigate?: (start: number, atEnd: boolean) => void
  oligoSpans?: readonly MinimapOligoSpan[]
  /** Template regions covered by enabled alignment reads (alignment mode minimap strip). */
  alignmentCoverageSpans?: Array<{ start: number; end: number }>
  /**
   * Magnifier window (black frame). When set the scroll viewport moves to a red frame nested
   * inside it, so the two roles stay distinguishable.
   */
  zoomRange?: SelectionRange | null
  onZoomRangeChange?: (range: SelectionRange) => void
}) {
  const minimapRef = useRef<HTMLDivElement | null>(null)
  const trackLayoutRef = useRef<SequenceMinimapTrackLayout>(desktopSequenceMinimapTrackLayout(600))
  const dragRef = useRef<
    { pointerId: number; originX: number; originStart: number; windowLen: number; target: 'zoom' | 'viewport' } | null
  >(null)
  const [trackLayout, setTrackLayout] = useState<SequenceMinimapTrackLayout>(() =>
    desktopSequenceMinimapTrackLayout(600),
  )
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: sequenceLength })
  const levelZeroFeatures = useMemo(
    () =>
      assignFeatureLevels(
        annotationFeatures.filter((feature) => !isRulerTrackFeature(feature) && (oligoSpans === undefined || !isSgRNAFeature(feature))),
        sequenceLength,
      ).filter((feature) => feature.level === 0),
    [annotationFeatures, sequenceLength, oligoSpans],
  )

  const caretPosition =
    !cutStrandSelection && selectedRange && selectedRange.start === selectedRange.end ? selectedRange.start : null

  useEffect(() => {
    const minimap = minimapRef.current
    if (!minimap) return

    const updateLayout = () => {
      const viewMain = scrollHostRef.current
      const rows = viewMain?.querySelector<HTMLElement>('.sequence-rows')
      const useCompact = Boolean(rows?.classList.contains('sequence-rows-compact'))
      const next =
        useCompact
          ? compactSequenceMinimapTrackLayout(minimap.clientWidth)
          : desktopSequenceMinimapTrackLayout(minimap.clientWidth)
      trackLayoutRef.current = next
      setTrackLayout((current) =>
        current.insetLeft === next.insetLeft &&
        current.insetRight === next.insetRight &&
        current.mapWidth === next.mapWidth &&
        current.compact === next.compact
          ? current
          : next,
      )
    }

    updateLayout()
    const resizeObserver = new ResizeObserver(updateLayout)
    resizeObserver.observe(minimap)
    const viewMain = scrollHostRef.current
    if (viewMain) {
      resizeObserver.observe(viewMain)
      const rows = viewMain.querySelector<HTMLElement>('.sequence-rows')
      if (rows) {
        resizeObserver.observe(rows)
        const rowContent = rows.querySelector('.sequence-row:not(.sequence-row-placeholder) .sequence-row-content')
        if (rowContent) resizeObserver.observe(rowContent)
      }
    }
    const mutationObserver = new MutationObserver(updateLayout)
    if (viewMain) {
      mutationObserver.observe(viewMain, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'data-row-start', 'data-row-end'],
      })
    }
    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [scrollHostRef])

  useEffect(() => {
    if (visibleRangeOverride) return
    const viewMain = scrollHostRef.current
    if (!viewMain) return
    const scrollHost = sequenceScrollHostFromViewMain(viewMain)

    let frame = 0
    const updateVisibleRange = () => {
      frame = 0
      setVisibleRange(computeSequenceMinimapVisibleRange(scrollHost, sequenceLength))
    }
    const scheduleUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(updateVisibleRange)
    }

    scheduleUpdate()
    scrollHost.addEventListener('scroll', scheduleUpdate, { passive: true })
    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(scrollHost)
    const mutationObserver = new MutationObserver(scheduleUpdate)
    mutationObserver.observe(viewMain, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-row-start', 'data-row-end'] })

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      scrollHost.removeEventListener('scroll', scheduleUpdate)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [scrollHostRef, sequenceLength, visibleRangeOverride])

  function positionFromPointer(event: ReactPointerEvent<SVGSVGElement>) {
    const { insetLeft, insetRight, mapWidth, compact } = trackLayoutRef.current
    const rect = event.currentTarget.getBoundingClientRect()
    if (compact) {
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)))
      return Math.max(0, Math.min(sequenceLength, Math.round(ratio * sequenceLength)))
    }
    const svgWidth = mapWidth + insetLeft + insetRight
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * svgWidth - insetLeft
    const ratio = Math.max(0, Math.min(1, x / Math.max(1, mapWidth)))
    return Math.max(0, Math.min(sequenceLength, Math.round(ratio * sequenceLength)))
  }

  function handlePointerNavigate(event: ReactPointerEvent<SVGSVGElement>) {
    if (sequenceLength <= 0) return
    const position = positionFromPointer(event)
    if (onMinimapNavigate) {
      onMinimapNavigate(position)
      return
    }
    const viewMain = scrollHostRef.current
    if (viewMain) {
      scrollSequenceViewToPosition(viewMain, position)
      viewMain.querySelector<HTMLElement>('.sequence-rows')?.focus()
    }
    onNavigate(position)
  }

  function scrollViewportToStart(start: number, atEnd: boolean) {
    const position = Math.max(0, Math.round(start))
    if (onMinimapViewportNavigate) {
      onMinimapViewportNavigate(position, atEnd)
      return
    }
    if (onMinimapNavigate) {
      onMinimapNavigate(position + (dragRef.current?.windowLen ?? 0) / 2)
      return
    }
    const viewMain = scrollHostRef.current
    if (!viewMain) return
    scrollSequenceViewToPosition(viewMain, position, undefined, { viewportAnchorFraction: 0, interpolateWithinRow: true, atEnd })
  }

  function beginFrameDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    target: 'zoom' | 'viewport',
    range: { start: number; end: number },
  ) {
    if (sequenceLength <= 0) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originStart: range.start,
      windowLen: Math.max(1, range.end - range.start),
      target,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveFrameDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const { mapWidth, insetLeft, insetRight, compact } = trackLayoutRef.current
    const svg = minimapRef.current?.querySelector('svg')
    const svgWidth = compact ? mapWidth : mapWidth + insetLeft + insetRight
    const renderedWidth = svg?.getBoundingClientRect().width ?? svgWidth
    const renderedTrackWidth = mapWidth * renderedWidth / Math.max(1, svgWidth)
    const dxBp = ((event.clientX - drag.originX) / Math.max(1, renderedTrackWidth)) * sequenceLength
    if (dxBp === 0) return
    const nextStart = drag.originStart + dxBp
    if (drag.target === 'zoom' && onZoomRangeChange) {
      onZoomRangeChange(clampMapZoomRange({ start: nextStart, end: nextStart + drag.windowLen }, sequenceLength))
      return
    }
    const bounds = zoomRange ?? { start: 0, end: sequenceLength }
    const maxStart = Math.max(bounds.start, bounds.end - drag.windowLen)
    scrollViewportToStart(Math.max(bounds.start, Math.min(maxStart, nextStart)), nextStart >= maxStart)
  }

  function endFrameDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  const hoveredSite = useMemo(() => {
    if (!hoveredRestrictionSiteKey) return null
    return restrictionSites.find((site) => siteKey(site) === hoveredRestrictionSiteKey) ?? null
  }, [hoveredRestrictionSiteKey, restrictionSites])

  const hoveredEnzymeName =
    hoveredSite && !isPrimerCalloutSite(hoveredSite) ? hoveredSite.enzyme.name : null

  const hoveredEnzymeSites = useMemo(() => {
    if (!hoveredEnzymeName) return []
    return restrictionSites
      .filter((site) => !isPrimerCalloutSite(site) && site.enzyme.name === hoveredEnzymeName)
      .toSorted((a, b) => a.start - b.start)
  }, [hoveredEnzymeName, restrictionSites])

  if (sequenceLength <= 0) return null

  const { insetLeft, insetRight, mapWidth, compact: compactMinimap } = trackLayout
  const mapLeft = compactMinimap ? 0 : insetLeft
  const hasAlignmentCoverage = alignmentCoverageSpans !== undefined
  const oligoTrackInset = oligoSpans?.length ? sequenceMinimapOligoTracksHeightPx / 2 : 0
  const minimapHeightPx = (hasAlignmentCoverage
    ? sequenceMinimapHeightPx + sequenceMinimapAlignmentExtraHeightPx
    : sequenceMinimapHeightPx) + oligoTrackInset * 2
  const coverageBandHeightPx = 8
  const featureY = oligoTrackInset + sequenceMinimapMarginPx
  const featureHeight = hasAlignmentCoverage
    ? minimapHeightPx - oligoTrackInset * 2 - sequenceMinimapMarginPx - coverageBandHeightPx
    : minimapHeightPx - oligoTrackInset * 2 - sequenceMinimapMarginPx * 2
  const effectiveVisibleRange = visibleRangeOverride ?? visibleRange
  const outerFrameRange = zoomRange ?? effectiveVisibleRange
  const redFrameRange = zoomRange ? effectiveVisibleRange : null
  const viewportStartX = mapLeft + (outerFrameRange.start / sequenceLength) * mapWidth
  const viewportEndX = mapLeft + (outerFrameRange.end / sequenceLength) * mapWidth
  const viewportWidth = Math.max(4, viewportEndX - viewportStartX)
  const redStartX = redFrameRange === null ? 0 : mapLeft + (redFrameRange.start / sequenceLength) * mapWidth
  const redEndX = redFrameRange === null ? 0 : mapLeft + (redFrameRange.end / sequenceLength) * mapWidth
  const redWidth = Math.max(3, redEndX - redStartX)
  const caretX =
    caretPosition === null ? null : mapLeft + (caretPosition / sequenceLength) * mapWidth
  const svgWidth = compactMinimap ? mapWidth : mapWidth + insetLeft + insetRight
  const overlayDenominator = compactMinimap ? mapWidth : svgWidth
  const baselineY = (minimapHeightPx - oligoTrackInset * 2) / 2 + oligoTrackInset
  const coverageStripHeight = 3
  const coverageStripY = minimapHeightPx - oligoTrackInset - coverageStripHeight - 1
  const frameFillStyle = {
    left: `${(viewportStartX / overlayDenominator) * 100}%`,
    width: `${(viewportWidth / overlayDenominator) * 100}%`,
  }
  const frameBorderStyle = frameFillStyle
  const redFrameStyle = {
    left: `${(redStartX / overlayDenominator) * 100}%`,
    width: `${(redWidth / overlayDenominator) * 100}%`,
  }
  const trackShellStyle = compactMinimap
    ? ({
        marginLeft: insetLeft,
        marginRight: insetRight,
        width: mapWidth,
      } as CSSProperties)
    : undefined

  return (
    <div
      className={`sequence-minimap${compactMinimap ? ' sequence-minimap-compact' : ''}${hasAlignmentCoverage ? ' sequence-minimap-has-alignment-coverage' : ''}`}
      ref={minimapRef}
      aria-hidden={sequenceLength === 0}
      style={
        hasAlignmentCoverage || oligoTrackInset > 0
          ? ({ '--sequence-minimap-height': `${minimapHeightPx}px` } as CSSProperties)
          : undefined
      }
    >
      <div
        className={compactMinimap ? 'sequence-minimap-track-shell' : undefined}
        style={trackShellStyle}
      >
        <div
          className="zoom-minimap-frame-fill"
          style={frameFillStyle}
          aria-hidden
          {...(compactMinimap
            ? {
                onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) =>
                  beginFrameDrag(event, zoomRange ? 'zoom' : 'viewport', outerFrameRange),
                onPointerMove: moveFrameDrag,
                onPointerUp: endFrameDrag,
                onPointerCancel: endFrameDrag,
              }
            : {})}
        />
        <svg
          width={svgWidth}
          height={minimapHeightPx}
          viewBox={`0 0 ${svgWidth} ${minimapHeightPx}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Sequence overview"
          onPointerDown={(event) => {
            event.preventDefault()
            handlePointerNavigate(event)
          }}
        >
          {!compactMinimap ? (
            <rect x={0} y={0} width={svgWidth} height={minimapHeightPx} className="sequence-minimap-backdrop" />
          ) : null}
          <rect
            x={compactMinimap ? 0 : mapLeft}
            y={0}
            width={mapWidth}
            height={minimapHeightPx}
            className="sequence-minimap-track"
          />
          <rect
            x={viewportStartX}
            y={0}
            width={viewportWidth}
            height={minimapHeightPx}
            className="zoom-minimap-frame-track"
            pointerEvents="none"
          />
          <line
            x1={mapLeft}
            y1={baselineY}
            x2={mapLeft + mapWidth}
            y2={baselineY}
            className="zoom-minimap-baseline"
            pointerEvents="none"
          />
          {levelZeroFeatures.map((info) => (
            <path
              key={info.segmentId}
              d={minimapFeaturePath(info, mapLeft, mapWidth, sequenceLength, featureY, featureHeight)}
              fill={isFeatureNoColor(info.feature.color) ? 'none' : info.feature.color}
              stroke={isFeatureNoColor(info.feature.color) ? 'var(--vg-scientific-outline-ink)' : undefined}
              strokeWidth={isFeatureNoColor(info.feature.color) ? 1 : undefined}
              className={`sequence-minimap-feature${isFeatureNoColor(info.feature.color) ? ' is-nocolor' : ''}`}
            />
          ))}
          {oligoSpans?.map((span) => {
            const start = Math.max(0, Math.min(sequenceLength, span.start))
            const end = Math.max(0, Math.min(sequenceLength, span.end))
            if (end <= start) return null
            const center = mapLeft + ((start + end) / 2 / sequenceLength) * mapWidth
            const width = Math.min(mapWidth, Math.max(3, ((end - start) / sequenceLength) * mapWidth))
            const left = Math.max(mapLeft, Math.min(mapLeft + mapWidth - width, center - width / 2))
            const y = span.strand === 'forward' ? oligoTrackInset / 2 : minimapHeightPx - oligoTrackInset / 2
            return <line key={`${span.kind}:${span.id}`} className={`sequence-minimap-oligo sequence-minimap-oligo-${span.kind}`}
              x1={left} x2={left + width} y1={y} y2={y} stroke={span.color} strokeWidth={3} pointerEvents="none" />
          })}
          {alignmentCoverageSpans?.map((span) => {
            const x = mapLeft + (span.start / sequenceLength) * mapWidth
            const width = Math.max(1, ((span.end - span.start) / sequenceLength) * mapWidth)
            return (
              <rect
                key={`coverage-${span.start}-${span.end}`}
                x={x}
                y={coverageStripY}
                width={width}
                height={coverageStripHeight}
                className="sequence-minimap-alignment-coverage"
                pointerEvents="none"
              />
            )
          })}
          {hoveredEnzymeSites.map((site) => {
            const x = mapLeft + (site.start / sequenceLength) * mapWidth
            const isCurrent = hoveredRestrictionSiteKey !== null && siteKey(site) === hoveredRestrictionSiteKey
            return (
              <line
                key={`enzyme-tick-${siteKey(site)}`}
                x1={x}
                x2={x}
                y1={0}
                y2={minimapHeightPx}
                className={`sequence-minimap-enzyme-tick${isCurrent ? ' is-current' : ''}`}
                pointerEvents="none"
              />
            )
          })}
          {caretX !== null && (
            <line
              x1={caretX}
              y1={2}
              x2={caretX}
              y2={minimapHeightPx - 2}
              className="sequence-minimap-caret"
              pointerEvents="none"
            />
          )}
        </svg>
        {/* Black frame: zoom window when zoomed, otherwise the scroll viewport. */}
        <div
          className="zoom-minimap-frame"
          style={frameBorderStyle}
          onPointerDown={(event) => beginFrameDrag(event, zoomRange ? 'zoom' : 'viewport', outerFrameRange)}
          onPointerMove={moveFrameDrag}
          onPointerUp={endFrameDrag}
          onPointerCancel={endFrameDrag}
        />
        {redFrameRange !== null ? (
          <div
            className="zoom-minimap-frame is-viewport"
            style={redFrameStyle}
            onPointerDown={(event) => beginFrameDrag(event, 'viewport', redFrameRange)}
            onPointerMove={moveFrameDrag}
            onPointerUp={endFrameDrag}
            onPointerCancel={endFrameDrag}
          />
        ) : null}
      </div>
    </div>
  )
}
