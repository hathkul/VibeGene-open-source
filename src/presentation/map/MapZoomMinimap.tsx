import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { SequenceFeature } from '../../domain/types'
import { isFeatureNoColor } from '../../domain/featureAppearance'
import { assignFeatureLevels, featureDrawableSegments, isRulerTrackFeature, minimapFeaturePath } from './featureRendering'
import { clampMapZoomRange, mapZoomRangeAroundCaret, type MapSelectionRange } from './mapZoom'

const sequenceMinimapHeightPx = 24
const sequenceMinimapMarginPx = 6

export function MapZoomMinimap({
  sequenceLength,
  annotationFeatures,
  viewRange,
  caretPosition,
  onViewRangeChange,
}: {
  sequenceLength: number
  annotationFeatures: SequenceFeature[]
  viewRange: MapSelectionRange
  caretPosition: number | null
  onViewRangeChange: (range: MapSelectionRange) => void
}) {
  const minimapRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ pointerId: number; originX: number; originStart: number; windowLen: number } | null>(null)
  const dragFrameRef = useRef<number | null>(null)
  const pendingDragRangeRef = useRef<MapSelectionRange | null>(null)
  const lastEmittedDragRangeRef = useRef<MapSelectionRange | null>(null)
  const [mapWidth, setMapWidth] = useState(400)

  const levelZeroFeatures = useMemo(
    () =>
      assignFeatureLevels(
        annotationFeatures.filter((feature) => !isRulerTrackFeature(feature)),
        sequenceLength,
      ).filter((feature) => feature.level === 0),
    [annotationFeatures, sequenceLength],
  )
  const rulerTrackSegments = useMemo(
    () => featureDrawableSegments(annotationFeatures.filter(isRulerTrackFeature), sequenceLength),
    [annotationFeatures, sequenceLength],
  )

  useEffect(() => {
    const minimap = minimapRef.current
    if (!minimap) return
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.max(80, entry.contentRect.width)
      setMapWidth((current) => (current === nextWidth ? current : nextWidth))
    })
    observer.observe(minimap)
    return () => observer.disconnect()
  }, [])

  useEffect(() => () => {
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current)
  }, [])

  if (sequenceLength <= 0) return null

  const viewportStartX = (viewRange.start / sequenceLength) * mapWidth
  const viewportEndX = (viewRange.end / sequenceLength) * mapWidth
  const viewportWidth = Math.max(4, viewportEndX - viewportStartX)
  const caretX =
    caretPosition === null ? null : (caretPosition / sequenceLength) * mapWidth
  // Match sequence-pane feature band (inset within the 24px track).
  const featureY = sequenceMinimapMarginPx
  const featureHeight = sequenceMinimapHeightPx - sequenceMinimapMarginPx * 2

  function positionFromClientX(clientX: number) {
    const minimap = minimapRef.current
    if (!minimap) return 0
    const rect = minimap.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, mapWidth)))
    return Math.max(0, Math.min(sequenceLength, Math.round(ratio * sequenceLength)))
  }

  function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (sequenceLength <= 0) return
    event.preventDefault()
    event.stopPropagation()
    const windowLen = Math.max(1, viewRange.end - viewRange.start)
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originStart: viewRange.start,
      windowLen,
    }
    pendingDragRangeRef.current = null
    lastEmittedDragRangeRef.current = viewRange
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function emitPendingDragRange() {
    dragFrameRef.current = null
    const next = pendingDragRangeRef.current
    pendingDragRangeRef.current = null
    const previous = lastEmittedDragRangeRef.current
    if (!next || (previous?.start === next.start && previous.end === next.end)) return
    lastEmittedDragRangeRef.current = next
    onViewRangeChange(next)
  }

  function handleViewportPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const minimap = minimapRef.current
    if (!minimap) return
    const rect = minimap.getBoundingClientRect()
    const dxBp = ((event.clientX - drag.originX) / Math.max(1, rect.width)) * sequenceLength
    const nextStart = drag.originStart + dxBp
    const next = clampMapZoomRange({ start: nextStart, end: nextStart + drag.windowLen }, sequenceLength)
    const pending = pendingDragRangeRef.current
    const emitted = lastEmittedDragRangeRef.current
    if (
      (pending?.start === next.start && pending.end === next.end) ||
      (!pending && emitted?.start === next.start && emitted.end === next.end)
    ) return
    pendingDragRangeRef.current = next
    if (dragFrameRef.current === null) dragFrameRef.current = requestAnimationFrame(emitPendingDragRange)
  }

  function handleViewportPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }
    emitPendingDragRange()
  }

  function handleTrackPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (sequenceLength <= 0 || dragRef.current) return
    if ((event.target as Element).closest?.('.zoom-minimap-frame')) return
    event.preventDefault()
    const center = positionFromClientX(event.clientX)
    const windowLen = Math.max(1, viewRange.end - viewRange.start)
    onViewRangeChange(mapZoomRangeAroundCaret(center, windowLen, sequenceLength))
  }

  return (
    <div
      className="map-zoom-minimap"
      ref={minimapRef}
      aria-label="Map zoom overview"
      onPointerDown={handleTrackPointerDown}
    >
      {/* Light fill behind the SVG so padding margins match the window; does not tint features. */}
      <div
        className="zoom-minimap-frame-fill"
        style={{
          left: `${(viewportStartX / mapWidth) * 100}%`,
          width: `${(viewportWidth / mapWidth) * 100}%`,
        }}
        aria-hidden
      />
      <svg
        width={mapWidth}
        height={sequenceMinimapHeightPx}
        viewBox={`0 0 ${mapWidth} ${sequenceMinimapHeightPx}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Map zoom minimap"
      >
        <rect x={0} y={0} width={mapWidth} height={sequenceMinimapHeightPx} className="map-zoom-minimap-track" />
        {/* Opaque lighter gray under features — lightens the track without changing feature colors. */}
        <rect
          x={viewportStartX}
          y={0}
          width={viewportWidth}
          height={sequenceMinimapHeightPx}
          className="zoom-minimap-frame-track"
          pointerEvents="none"
        />
        <line
          x1={0}
          y1={sequenceMinimapHeightPx / 2}
          x2={mapWidth}
          y2={sequenceMinimapHeightPx / 2}
          className="zoom-minimap-baseline"
          pointerEvents="none"
        />
        {rulerTrackSegments.map((segment) => {
          const x = (segment.start / sequenceLength) * mapWidth
          const width = Math.max(1, ((segment.end - segment.start) / sequenceLength) * mapWidth)
          return (
            <rect
              key={`ruler-${segment.segmentId}`}
              x={x}
              y={sequenceMinimapHeightPx / 2 - 1.5}
              width={width}
              height={3}
              fill={segment.feature.color}
              pointerEvents="none"
            />
          )
        })}
        {levelZeroFeatures.map((info) => (
          <path
            key={info.segmentId}
            d={minimapFeaturePath(info, 0, mapWidth, sequenceLength, featureY, featureHeight)}
            fill={isFeatureNoColor(info.feature.color) ? 'none' : info.feature.color}
            stroke={isFeatureNoColor(info.feature.color) ? 'var(--vg-scientific-outline-ink)' : undefined}
            strokeWidth={isFeatureNoColor(info.feature.color) ? 1 : undefined}
            className={`sequence-minimap-feature${isFeatureNoColor(info.feature.color) ? ' is-nocolor' : ''}`}
            pointerEvents="none"
          />
        ))}
        {caretX !== null && (
          <line
            x1={caretX}
            y1={2}
            x2={caretX}
            y2={sequenceMinimapHeightPx - 2}
            className="sequence-minimap-caret"
            pointerEvents="none"
          />
        )}
      </svg>
      {/* Border-only overlay on top: equal frame on all sides; drag handle. */}
      <div
        className="zoom-minimap-frame"
        style={{
          left: `${(viewportStartX / mapWidth) * 100}%`,
          width: `${(viewportWidth / mapWidth) * 100}%`,
        }}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerCancel={handleViewportPointerUp}
      />
    </div>
  )
}
