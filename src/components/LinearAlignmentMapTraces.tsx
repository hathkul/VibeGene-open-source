import { useMemo, useState } from 'react'
import {
  LINEAR_ALIGNMENT_BAND_PADDING,
  LINEAR_ALIGNMENT_BAR_HEIGHT,
  LINEAR_ALIGNMENT_MATCH_FILL,
  LINEAR_ALIGNMENT_ROW_PITCH,
  LINEAR_ALIGNMENT_SELECTED_FILL,
  assignLinearAlignmentLevels,
  formatLinearAlignmentHoverLabel,
  linearAlignmentArrowPath,
  linearAlignmentMismatchMarkX,
  linearAlignmentSegmentWidthPx,
  type LinearAlignmentRenderInfo,
} from '../domain/linearAlignmentMap'
import type { TraceFileRecord } from '../domain/traceTypes'

type LinearAlignmentMapTracesProps = {
  traceFiles: TraceFileRecord[]
  alignmentsVisible: boolean
  bandTop: number
  bandHeight: number
  trackLeft: number
  trackRight: number
  selectedTraceId: string | null
  sequenceX: (position: number) => number
  onSelectTrace: (traceId: string) => void
}

function LinearAlignmentTraceShape({
  info,
  y,
  barHeight,
  selected,
  sequenceX,
  onSelect,
  onHover,
}: {
  info: LinearAlignmentRenderInfo
  y: number
  barHeight: number
  selected: boolean
  sequenceX: (position: number) => number
  onSelect: () => void
  onHover: (active: boolean, point?: { x: number; y: number }) => void
}) {
  const fill = selected ? LINEAR_ALIGNMENT_SELECTED_FILL : LINEAR_ALIGNMENT_MATCH_FILL
  const barStartX = sequenceX(info.templateStart)
  const barEndX = sequenceX(info.templateEnd)
  const x = barStartX
  const width = Math.max(1, barEndX - barStartX)
  const arrowPath = linearAlignmentArrowPath(info.orientation, y, barHeight, barStartX, barEndX)

  return (
    <g
      className={`linear-alignment-trace${selected ? ' is-selected' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onMouseEnter={(event) => {
        onHover(true, { x: event.clientX, y: event.clientY })
      }}
      onMouseMove={(event) => {
        onHover(true, { x: event.clientX, y: event.clientY })
      }}
      onMouseLeave={() => onHover(false)}
    >
      {info.segments.map((segment) => {
        if (!segment.isExact) return null
        const segmentStartX = sequenceX(segment.start)
        const segmentEndX = sequenceX(segment.end)
        return (
          <rect
            key={`${segment.start}-${segment.end}`}
            x={segmentStartX}
            y={y}
            width={linearAlignmentSegmentWidthPx(segmentStartX, segmentEndX, true)}
            height={barHeight}
            fill={fill}
            className="linear-alignment-trace-segment"
          />
        )
      })}
      {info.segments.map((segment) => {
        if (segment.isExact) return null
        const mark = linearAlignmentMismatchMarkX(sequenceX(segment.start), sequenceX(segment.end))
        return (
          <rect
            key={`mismatch-${segment.start}-${segment.end}`}
            x={mark.x}
            y={y}
            width={mark.width}
            height={barHeight}
            className="linear-alignment-trace-mismatch"
          />
        )
      })}
      <rect
        x={x}
        y={y}
        width={width}
        height={barHeight}
        fill="none"
        stroke={fill}
        strokeWidth={1}
        rx={1}
        className="linear-alignment-trace-outline"
      />
      <path d={arrowPath} fill={fill} className="linear-alignment-trace-arrow" />
      <title>{formatLinearAlignmentHoverLabel(info)}</title>
    </g>
  )
}

export function LinearAlignmentMapTraces({
  traceFiles,
  alignmentsVisible,
  bandTop,
  bandHeight,
  trackLeft,
  trackRight,
  selectedTraceId,
  sequenceX,
  onSelectTrace,
}: LinearAlignmentMapTracesProps) {
  const [hoveredInfo, setHoveredInfo] = useState<LinearAlignmentRenderInfo | null>(null)
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null)

  const alignmentTraces = useMemo(
    () => (alignmentsVisible ? assignLinearAlignmentLevels(traceFiles) : []),
    [alignmentsVisible, traceFiles],
  )

  if (!alignmentsVisible || bandHeight <= 0) return null

  return (
    <>
      <rect x={trackLeft} y={bandTop} width={Math.max(1, trackRight - trackLeft)} height={bandHeight} className="linear-alignment-band-bg" />
      {alignmentTraces.map((info) => {
        const y = bandTop + LINEAR_ALIGNMENT_BAND_PADDING / 2 + info.level * LINEAR_ALIGNMENT_ROW_PITCH
        return (
          <LinearAlignmentTraceShape
            key={info.traceId}
            info={info}
            y={y}
            barHeight={LINEAR_ALIGNMENT_BAR_HEIGHT}
            selected={selectedTraceId === info.traceId}
            sequenceX={sequenceX}
            onSelect={() => onSelectTrace(info.traceId)}
            onHover={(active, point) => {
              setHoveredInfo(active ? info : null)
              setHoverPoint(active && point ? point : null)
            }}
          />
        )
      })}
      {hoveredInfo && hoverPoint && (
        <foreignObject x={0} y={0} width={1} height={1} className="linear-alignment-hover-layer">
          <div
            className="linear-alignment-hover-tooltip"
            style={{ position: 'fixed', left: hoverPoint.x + 12, top: hoverPoint.y + 12 }}
          >
            {formatLinearAlignmentHoverLabel(hoveredInfo)
              .split('\n')
              .map((line) => (
                <div key={line}>{line}</div>
              ))}
          </div>
        </foreignObject>
      )}
    </>
  )
}
