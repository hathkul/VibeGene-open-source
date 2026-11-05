import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { AlignmentTraceFileList, alignmentSidebarWidthPx } from './AlignmentTraceFileList'
import { DnaLibraryToolbar } from './DnaLibraryToolbar'
import type { LibraryMemberRead, TraceFileRecord } from '../domain/traceTypes'
import { selectedAlignedTraceSequence } from '../domain/traceAlignmentSelection'
import { writeClipboardText } from '../desktop/clipboard'
import { startLibraryMemberGroupPointerDrag, LIBRARY_MEMBER_DROP_ATTR } from '../domain/libraryMemberGroupDrag'
import {
  assemblyConflictTemplateIndices,
  findAssemblyConflicts,
  nestedReadAsConsensusTrace,
} from '../domain/libraryMemberReads'
import {
  alignmentOverlapsTemplateRange,
  alignmentStatsLabel,
  buildReferenceReplacementFromTrace,
} from '../domain/traceAlignment'
import { alignmentViewportTemplateIndex } from '../domain/traceFileWorkflow'
import {
  alignmentProfileEnabled,
  alignmentProfileMeasure,
  profileSync,
} from '../domain/alignmentProfiler'
import {
  alignmentBaseStepPx,
  alignmentTrackInsetPx,
  buildChromatogramPaths,
  buildMergedInsertionLayout,
  buildTraceSlotLookup,
  computeVisibleTemplateRangeForMergedLayout,
  isVariantErrorColumn,
  mergedAlignmentTrackWidthPx,
  mergedLayoutContentWidthPx,
  nearestHoverSample,
  resolveTraceColumnAtMergedSlotFromLookup,
  rulerTicksForMergedTraceLayout,
  templateRangeFromColumnSpan,
  templateIndexLeftPx,
  traceBaseForColumn,
  tracePeakColors,
  tracePeakFillColors,
  visibleMergedLayoutEntries,
  type ChromatogramBase,
  type MergedInsertionLayout,
  type MergedLayoutColumn,
  type MergedLayoutEntry,
  type TraceSlotLookup,
} from '../domain/traceDisplay'

type SelectionRange = { start: number; end: number }
const sequenceTrackInsetPx = alignmentTrackInsetPx
const templateDuplicateRowPx = 22
const traceBaseRowPx = 22
const chromatogramHeightPx = 56
const alignmentRulerTickHeightPx = 8
const alignmentRulerLabelHeightPx = 12
const alignmentRulerHeightPx = alignmentRulerTickHeightPx + alignmentRulerLabelHeightPx
const traceRowPaddingPx = 4
const sequenceStripHeightPx = templateDuplicateRowPx + traceBaseRowPx + traceRowPaddingPx
const detailsHeightPx = chromatogramHeightPx + alignmentRulerHeightPx
const sequenceRowEndIndexPx = 56
const listActionBandPx = 22
const sequenceRowEndIndexGapPx = 10
const alignmentSplitterHeightPx = 6
const alignmentTopMinHeightPx = 100
const alignmentBottomMinHeightPx = 120
const traceAnnotationRowEstimatePx = 160
// Keep the sidebar's title, actions and metadata readable alongside a compact member row.
const libraryAnnotationMinRowHeightPx = 100

const sequenceBaseStepPx = alignmentBaseStepPx

function alignmentTrackWidthPx(mergedLayout: MergedInsertionLayout) {
  const hasGaps = mergedLayout.anchorInsertionCounts.size > 0
  if (hasGaps) {
    return mergedAlignmentTrackWidthPx(mergedLayout)
  }
  const sequenceWidth = sequenceTrackInsetPx * 2 + mergedLayout.templateLength * sequenceBaseStepPx
  return sequenceWidth + sequenceRowEndIndexGapPx + sequenceRowEndIndexPx
}

export type HorizontalViewport = {
  scrollLeft: number
  width: number
}

function templateX(templateIndex: number) {
  return sequenceTrackInsetPx + templateIndex * sequenceBaseStepPx
}

function templateContentWidthPx(mergedLayout: MergedInsertionLayout) {
  return mergedLayoutContentWidthPx(mergedLayout)
}

/** Custom H-scrollbar: drives scroll programmatically like the minimap (avoids WKWebView native-thumb jerks). */
function AlignmentHorizontalScrollbar({
  scrollLeft,
  viewportWidth,
  contentWidth,
  onScrollTo,
}: {
  scrollLeft: number
  viewportWidth: number
  contentWidth: number
  onScrollTo: (scrollLeft: number) => void
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ pointerId: number; grabOffsetX: number } | null>(null)
  const pendingScrollRef = useRef<number | null>(null)
  const dragFrameRef = useRef<number | null>(null)
  const maxScroll = Math.max(0, contentWidth - viewportWidth)
  if (maxScroll <= 0 || viewportWidth <= 0 || contentWidth <= 0) return null

  const thumbWidthRatio = Math.min(1, viewportWidth / contentWidth)
  const thumbLeftRatio = scrollLeft / contentWidth

  function scrollLeftFromClientX(clientX: number, grabOffsetX = 0) {
    const track = trackRef.current
    if (!track) return scrollLeft
    const rect = track.getBoundingClientRect()
    const trackWidth = Math.max(1, rect.width)
    const thumbWidthPx = Math.max(24, thumbWidthRatio * trackWidth)
    const rawLeft = clientX - rect.left - grabOffsetX
    const maxThumbLeft = Math.max(0, trackWidth - thumbWidthPx)
    const ratio = maxThumbLeft <= 0 ? 0 : Math.max(0, Math.min(1, rawLeft / maxThumbLeft))
    return ratio * maxScroll
  }

  function emitScrollLeft(next: number) {
    pendingScrollRef.current = next
    if (dragFrameRef.current !== null) return
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null
      const pending = pendingScrollRef.current
      pendingScrollRef.current = null
      if (pending === null) return
      onScrollTo(pending)
    })
  }

  function handleTrackPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const trackWidth = Math.max(1, rect.width)
    const thumbWidthPx = Math.max(24, thumbWidthRatio * trackWidth)
    const thumbLeftPx = thumbLeftRatio * trackWidth
    const localX = event.clientX - rect.left
    const hitThumb = localX >= thumbLeftPx && localX <= thumbLeftPx + thumbWidthPx
    const grabOffsetX = hitThumb ? localX - thumbLeftPx : thumbWidthPx / 2
    dragRef.current = { pointerId: event.pointerId, grabOffsetX }
    event.currentTarget.setPointerCapture(event.pointerId)
    emitScrollLeft(scrollLeftFromClientX(event.clientX, grabOffsetX))
  }

  function handleTrackPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    emitScrollLeft(scrollLeftFromClientX(event.clientX, drag.grabOffsetX))
  }

  function handleTrackPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  return (
    <div
      className="alignment-h-scrollbar"
      ref={trackRef}
      role="scrollbar"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={Math.round(maxScroll)}
      aria-valuenow={Math.round(scrollLeft)}
      aria-label="Alignment horizontal scroll"
      onPointerDown={handleTrackPointerDown}
      onPointerMove={handleTrackPointerMove}
      onPointerUp={handleTrackPointerUp}
      onPointerCancel={handleTrackPointerUp}
    >
      <div
        className="alignment-h-scrollbar-thumb"
        style={{
          width: `${thumbWidthRatio * 100}%`,
          left: `${thumbLeftRatio * 100}%`,
        }}
      />
    </div>
  )
}

function traceAnnotationBodyHeightPx(annotationSequenceRowHeightPx = 0, compact = false) {
  if (compact && annotationSequenceRowHeightPx > 0) return annotationSequenceRowHeightPx
  return Math.max(traceAnnotationRowEstimatePx, annotationSequenceRowHeightPx)
}

function hasChromatogramPeaks(trace: Pick<TraceFileRecord, 'chromatogram'>) {
  return trace.chromatogram.aTrace.length > 0
}

/**
 * Shared left/right row height. `hideTemplateStrip` only blanks the template band —
 * it must not change height, or library member rows desync between panes.
 */
function traceRowHeight(
  trace: TraceFileRecord,
  annotationSequenceRowHeightPx = 0,
) {
  if (trace.showAnnotations) {
    return listActionBandPx + traceAnnotationBodyHeightPx(annotationSequenceRowHeightPx)
  }
  const details = trace.expanded && hasChromatogramPeaks(trace) ? detailsHeightPx : 0
  return sequenceStripHeightPx + details
}

function alignmentPairRowHeight(
  trace: TraceFileRecord,
  annotationSequenceRowHeightPx = 0,
  isLibrary = false,
) {
  if (trace.showAnnotations) {
    if (isLibrary) return Math.max(libraryAnnotationMinRowHeightPx, traceAnnotationBodyHeightPx(annotationSequenceRowHeightPx, true) + 1)
    return templateDuplicateRowPx + listActionBandPx + traceAnnotationBodyHeightPx(annotationSequenceRowHeightPx)
  }
  return traceRowHeight(trace) + listActionBandPx
}

function isMergedSlotSelected(slot: MergedLayoutColumn, selectedRange: SelectionRange | null) {
  if (!selectedRange || slot.kind === 'insertion-gap') return false
  return slot.templateIndex >= selectedRange.start && slot.templateIndex < selectedRange.end
}

function TraceChromatogram({
  trace,
  mergedLayout,
  visibleEntries,
  contentWidth,
  templateStart,
  templateEnd,
  onHover,
}: {
  trace: TraceFileRecord
  mergedLayout: MergedInsertionLayout
  visibleEntries: MergedLayoutEntry[]
  contentWidth: number
  templateStart: number
  templateEnd: number
  onHover: (templateIndex: number | null, dominantBase: ChromatogramBase | null) => void
}) {
  const alignment = trace.alignment
  const svgRef = useRef<SVGSVGElement | null>(null)

  const geometry = useMemo(() => {
    if (!alignment) return null
    return buildChromatogramPaths({
      chromatogram: trace.chromatogram,
      alignment,
      templateStart,
      templateEnd,
      height: chromatogramHeightPx,
      mergedLayout,
      visibleEntries,
    })
  }, [alignment, mergedLayout, templateEnd, templateStart, trace.chromatogram, visibleEntries])

  if (!alignment || !geometry) return null

  return (
    <svg
      ref={svgRef}
      className="alignment-trace-svg"
      width={contentWidth}
      height={chromatogramHeightPx}
      onPointerMove={(event) => {
        const rect = svgRef.current?.getBoundingClientRect()
        if (!rect) return
        const localX = event.clientX - rect.left
        const sample = nearestHoverSample(geometry.hoverSamples, localX)
        onHover(sample ? Math.round(sample.templateIndex) : null, sample?.dominantBase ?? null)
      }}
      onPointerLeave={() => onHover(null, null)}
    >
      {geometry.paths.map(({ base, stroke, fill }) => (
        <g key={base}>
          {fill ? (
            <path
              d={fill}
              fill={base === 'G' ? 'var(--vg-trace-g-fill)' : tracePeakFillColors[base]}
              stroke="none"
            />
          ) : null}
          {stroke ? (
            <path
              d={stroke}
              fill="none"
              stroke={base === 'G' ? 'var(--vg-trace-g-line)' : tracePeakColors[base]}
              strokeWidth={1.1}
              opacity={0.95}
            />
          ) : null}
        </g>
      ))}
    </svg>
  )
}

function AlignmentTraceRuler({
  entries,
  contentWidth,
  alignment,
  traceLookup,
}: {
  entries: MergedLayoutEntry[]
  contentWidth: number
  alignment: NonNullable<TraceFileRecord['alignment']>
  traceLookup: TraceSlotLookup
}) {
  const ticks = useMemo(
    () => rulerTicksForMergedTraceLayout(entries, alignment, traceLookup),
    [alignment, entries, traceLookup],
  )
  const tickLineY = alignmentRulerTickHeightPx - 1

  return (
    <svg className="alignment-trace-ruler" width={contentWidth} height={alignmentRulerHeightPx} aria-hidden="true">
      <line x1={0} y1={tickLineY} x2={contentWidth} y2={tickLineY} className="alignment-trace-ruler-line" />
      {ticks.map((tick) => {
        const x = tick.x
        const half = tick.major ? 4 : 2
        return (
          <g key={`${tick.x}-${tick.label ?? 'minor'}`}>
            <line
              x1={x}
              y1={tickLineY - half}
              x2={x}
              y2={tickLineY}
              className={tick.major ? 'alignment-trace-ruler-tick-major' : 'alignment-trace-ruler-tick-minor'}
            />
            {tick.label && (
              <text
                x={x}
                y={alignmentRulerTickHeightPx + alignmentRulerLabelHeightPx - 2}
                textAnchor="middle"
                className="alignment-trace-ruler-label"
              >
                {tick.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function TraceAnnotationSequenceRow({
  trace,
  isFocused,
  annotationRowHeightPx,
  scrollLeft,
  horizontalViewport,
  mergedLayout,
  visibleRangeOverride = null,
  renderTraceAnnotationRow,
  isLibrary,
  onFocus,
  onRowHeight,
}: {
  trace: TraceFileRecord
  isFocused: boolean
  annotationRowHeightPx: number
  scrollLeft: number
  horizontalViewport: HorizontalViewport
  mergedLayout: MergedInsertionLayout
  visibleRangeOverride?: { start: number; end: number } | null
  renderTraceAnnotationRow: SequenceAlignmentPaneProps['renderTraceAnnotationRow']
  isLibrary: boolean
  onFocus: () => void
  onRowHeight: (traceId: string, heightPx: number) => void
}) {
  const rowHeight = alignmentPairRowHeight(trace, annotationRowHeightPx, isLibrary)
  const bodyHeight = isLibrary ? rowHeight : traceAnnotationBodyHeightPx(annotationRowHeightPx)
  const alignment = trace.alignment

  if (!alignment) {
    return (
      <div className="alignment-trace-row alignment-trace-row-empty" style={{ height: rowHeight }}>
        <div className="alignment-trace-row-message">Could not align {trace.fileName}</div>
      </div>
    )
  }

  return (
    <div
      className={`alignment-trace-row alignment-trace-annotation-row${isFocused ? ' is-focused' : ''}`}
      style={{ height: rowHeight, minHeight: rowHeight, maxHeight: rowHeight }}
      onPointerDown={onFocus}
    >
      {!isLibrary && <div style={{ height: templateDuplicateRowPx, flexShrink: 0 }} aria-hidden="true" />}
      {!isLibrary && <div className="alignment-trace-action-spacer" style={{ height: listActionBandPx, flexShrink: 0 }} aria-hidden="true" />}
      <div className="alignment-trace-annotation-body" style={{ height: bodyHeight, minHeight: bodyHeight }}>
        <div className="alignment-horizontal-track" data-alignment-pan-track style={{ marginLeft: -scrollLeft }}>
          {renderTraceAnnotationRow(trace, {
            horizontalViewport,
            mergedLayout,
            visibleRangeOverride,
            onRowHeight: (heightPx) => onRowHeight(trace.id, heightPx),
          })}
        </div>
      </div>
    </div>
  )
}

export function TraceAlignmentRow({
  trace,
  templateSequence,
  mergedLayout,
  visibleEntries,
  visibleStart,
  visibleEnd,
  selectedRange,
  isFocused,
  peakHoverTemplateIndex,
  peakHoverBase,
  hideTemplateStrip = false,
  conflictTemplateIndices,
  onFocus,
  onRangeSelect,
  onPeakHover,
  onTemplateBaseActivate,
}: {
  trace: TraceFileRecord
  templateSequence: string
  mergedLayout: MergedInsertionLayout
  visibleEntries: MergedLayoutEntry[]
  visibleStart: number
  visibleEnd: number
  selectedRange: SelectionRange | null
  isFocused: boolean
  peakHoverTemplateIndex: number | null
  peakHoverBase: ChromatogramBase | null
  hideTemplateStrip?: boolean
  conflictTemplateIndices?: ReadonlySet<number>
  onFocus: () => void
  onRangeSelect: (range: SelectionRange, options?: { collapsed?: boolean }) => void
  onPeakHover: (templateIndex: number | null, dominantBase: ChromatogramBase | null) => void
  /** Click a consensus-mapped base (e.g. accept a nested read base into the member). */
  onTemplateBaseActivate?: (templateIndex: number, displayBase: string) => void
}) {
  const alignment = trace.alignment
  const rowHeight = alignmentPairRowHeight(trace)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const dragStartLayoutIndexRef = useRef<number | null>(null)
  const traceDragRef = useRef<{ start: number; clientX: number; moved: boolean } | null>(null)
  const [storedTraceSelection, setTraceSelection] = useState<{ start: number; end: number; alignment: TraceFileRecord['alignment']; baseCalls: string[] } | null>(null)
  const traceLookup = useMemo(() => (alignment ? buildTraceSlotLookup(alignment) : null), [alignment])
  const traceSelection = isFocused && storedTraceSelection?.alignment === alignment && storedTraceSelection.baseCalls === trace.chromatogram.baseCalls ? storedTraceSelection : null
  const layout = visibleEntries

  const contentWidth = templateContentWidthPx(mergedLayout)
  const interactiveHeight = (trace.expanded && hasChromatogramPeaks(trace) ? sequenceStripHeightPx + detailsHeightPx : sequenceStripHeightPx) - traceRowPaddingPx

  const selectionBand = useMemo(() => {
    if (traceSelection || !selectedRange || !isFocused || !layout.length) return null
    let startLeft = Number.POSITIVE_INFINITY
    let endRight = Number.NEGATIVE_INFINITY
    layout.forEach((entry) => {
      if (entry.slot.kind === 'insertion-gap') return
      if (entry.slot.templateIndex >= selectedRange.start && entry.slot.templateIndex < selectedRange.end) {
        startLeft = Math.min(startLeft, entry.leftPx)
        endRight = Math.max(endRight, entry.leftPx + sequenceBaseStepPx)
      }
    })
    if (!Number.isFinite(startLeft)) return null
    return { left: startLeft, width: endRight - startLeft }
  }, [isFocused, layout, selectedRange, traceSelection])

  function traceIndexFromEvent(event: { clientX: number }) {
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect || !traceLookup) return null
    const localX = event.clientX - rect.left
    let closest: { index: number; distance: number } | null = null
    for (const entry of layout) {
      const column = resolveTraceColumnAtMergedSlotFromLookup(traceLookup, entry.slot)
      if (!column || column.kind === 'deletion' || column.traceIndex < 0) continue
      const distance = Math.abs(localX - (entry.leftPx + sequenceBaseStepPx / 2))
      if (!closest || distance < closest.distance) closest = { index: column.traceIndex, distance }
    }
    return closest?.index ?? null
  }

  function layoutIndexFromEvent(event: { clientX: number }) {
    const rect = stripRef.current?.getBoundingClientRect()
    if (!rect) return null
    const localX = event.clientX - rect.left
    const hitIndex = layout.findIndex((entry) => localX >= entry.leftPx && localX < entry.leftPx + sequenceBaseStepPx)
    return hitIndex >= 0 ? hitIndex : null
  }

  function commitLayoutSelection(startLayoutIndex: number, endLayoutIndex: number, collapsed = false) {
    if (!traceLookup) return
    const columns = layout.map((entry) => {
      const traceColumn = resolveTraceColumnAtMergedSlotFromLookup(traceLookup, entry.slot)
      if (traceColumn) return traceColumn
      if (entry.slot.kind === 'template') {
        return { kind: 'match' as const, templateIndex: entry.slot.templateIndex, traceIndex: -1, match: true }
      }
      return { kind: 'insertion' as const, traceIndex: -1 }
    })
    const range = templateRangeFromColumnSpan(columns, startLayoutIndex, endLayoutIndex)
    if (!range) return
    onRangeSelect(range, collapsed ? { collapsed: true } : undefined)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    onFocus()
    if ((event.target as Element).closest('.alignment-trace-bases')) {
      const index = traceIndexFromEvent(event)
      if (index === null) return
      event.preventDefault()
      event.currentTarget.focus()
      window.getSelection()?.removeAllRanges()
      setTraceSelection(null)
      traceDragRef.current = { start: index, clientX: event.clientX, moved: false }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      return
    }
    setTraceSelection(null)
    const layoutIndex = layoutIndexFromEvent(event)
    if (layoutIndex === null) return
    event.preventDefault()
    dragStartLayoutIndexRef.current = layoutIndex
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (traceDragRef.current && event.buttons === 1) {
      const drag = traceDragRef.current
      if (Math.abs(event.clientX - drag.clientX) > 4) drag.moved = true
      const index = traceIndexFromEvent(event)
      if (drag.moved && index !== null) setTraceSelection({ start: drag.start, end: index, alignment, baseCalls: trace.chromatogram.baseCalls })
      return
    }
    if (dragStartLayoutIndexRef.current === null || event.buttons !== 1) return
    const layoutIndex = layoutIndexFromEvent(event)
    if (layoutIndex === null) return
    commitLayoutSelection(dragStartLayoutIndexRef.current, layoutIndex)
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (traceDragRef.current) {
      const drag = traceDragRef.current
      const index = traceIndexFromEvent(event)
      if ((drag.moved || Math.abs(event.clientX - drag.clientX) > 4) && index !== null) {
        setTraceSelection({ start: drag.start, end: index, alignment, baseCalls: trace.chromatogram.baseCalls })
      }
      traceDragRef.current = null
      return
    }
    if (dragStartLayoutIndexRef.current === null) return
    const layoutIndex = layoutIndexFromEvent(event)
    if (layoutIndex === null) {
      dragStartLayoutIndexRef.current = null
      return
    }
    const collapsed = dragStartLayoutIndexRef.current === layoutIndex
    commitLayoutSelection(dragStartLayoutIndexRef.current, layoutIndex, collapsed)
    dragStartLayoutIndexRef.current = null
  }

  if (!alignment) {
    return (
      <div className="alignment-trace-row alignment-trace-row-empty" style={{ height: rowHeight, width: contentWidth }}>
        <div className="alignment-trace-row-message">{trace.parseError ?? `Could not align ${trace.fileName}`}</div>
      </div>
    )
  }

  function renderBaseCell(entry: MergedLayoutEntry, row: 'template' | 'trace') {
    const { slot, leftPx } = entry
    const traceColumn = traceLookup ? resolveTraceColumnAtMergedSlotFromLookup(traceLookup, slot) : null
    const char =
      row === 'template'
        ? slot.kind === 'template'
          ? templateSequence[slot.templateIndex]?.toUpperCase() ?? ''
          : ''
        : traceColumn
          ? traceBaseForColumn(traceColumn, trace.chromatogram.baseCalls, alignment!.orientation)
          : ''
    const isError =
      row === 'trace' &&
      (traceColumn
        ? isVariantErrorColumn(traceColumn)
        : slot.kind === 'template' &&
          slot.templateIndex >= alignment!.templateStart &&
          slot.templateIndex < alignment!.templateEnd)
    const isConflict =
      row === 'trace'
      && slot.kind === 'template'
      && Boolean(conflictTemplateIndices?.has(slot.templateIndex))
    const isSelected = row === 'trace' && traceSelection
      ? Boolean(traceColumn && traceColumn.kind !== 'deletion' && traceColumn.traceIndex >= Math.min(traceSelection.start, traceSelection.end) && traceColumn.traceIndex <= Math.max(traceSelection.start, traceSelection.end))
      : isMergedSlotSelected(slot, isFocused && !traceSelection ? selectedRange : null)
    const isPeakHover =
      row === 'trace' &&
      slot.kind === 'template' &&
      peakHoverTemplateIndex !== null &&
      slot.templateIndex === peakHoverTemplateIndex &&
      peakHoverBase !== null
    const peakClass = isPeakHover ? ` is-peak-hover is-peak-hover-${peakHoverBase}` : ''
    const canActivate =
      row === 'trace'
      && onTemplateBaseActivate
      && slot.kind === 'template'
      && Boolean(char)
      && char !== '-'

    return (
      <span
        key={`${row}-${slot.kind === 'template' ? `t${slot.templateIndex}` : `g${slot.anchorTemplateIndex}-${slot.slotIndex}`}`}
        className={`alignment-base${isError ? ' is-variant-error' : ''}${isConflict ? ' is-assembly-conflict' : ''}${isSelected ? ' is-selected' : ''}${canActivate ? ' is-activatable' : ''}${peakClass}`}
        style={{ position: 'absolute', left: leftPx, width: sequenceBaseStepPx, top: 0 }}
        title={
          canActivate
            ? `Double-click to set member base to ${char} at consensus ${slot.templateIndex + 1}`
            : isConflict
              ? 'Assembly conflict — expand reads and double-click a base to resolve'
              : undefined
        }
        onDoubleClick={
          canActivate
            ? (event) => {
                event.preventDefault()
                event.stopPropagation()
                onTemplateBaseActivate(slot.templateIndex, char)
              }
            : undefined
        }
      >
        {char || '\u00a0'}
      </span>
    )
  }

  return (
    <div
      className={`alignment-trace-row${isFocused ? ' is-focused' : ''}`}
      style={{ height: rowHeight, minHeight: rowHeight, maxHeight: rowHeight, width: contentWidth }}
      onPointerDown={onFocus}
    >
      <div className="alignment-trace-action-spacer" style={{ height: listActionBandPx, flexShrink: 0 }} aria-hidden="true" />
      <div
        ref={stripRef}
        className="alignment-trace-interactive"
        tabIndex={0}
        style={{ position: 'relative', width: contentWidth, height: interactiveHeight }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => { if (!traceDragRef.current) dragStartLayoutIndexRef.current = null }}
        onPointerCancel={() => { traceDragRef.current = null; dragStartLayoutIndexRef.current = null }}
        onBlur={() => { traceDragRef.current = null; setTraceSelection(null) }}
        onCopy={(event) => {
          if (!traceSelection || !alignment) return
          event.preventDefault()
          event.stopPropagation()
          event.clipboardData.setData('text/plain', selectedAlignedTraceSequence(alignment, trace.chromatogram.baseCalls, traceSelection.start, traceSelection.end))
        }}
        onKeyDown={(event) => {
          if (!traceSelection || !alignment || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'c') return
          event.preventDefault()
          event.stopPropagation()
          void writeClipboardText(selectedAlignedTraceSequence(alignment, trace.chromatogram.baseCalls, traceSelection.start, traceSelection.end))
            .catch((error) => console.error('Could not copy trace sequence', error))
        }}
      >
        {selectionBand && (
          <div
            className="alignment-trace-selection-band"
            style={{ left: selectionBand.left, width: selectionBand.width }}
          />
        )}
        {!hideTemplateStrip ? (
          <div
            className="alignment-base-strip alignment-template-strip"
            style={{ position: 'relative', height: templateDuplicateRowPx, width: contentWidth }}
          >
            {layout.map((entry) => renderBaseCell(entry, 'template'))}
          </div>
        ) : (
          <div
            className="alignment-base-strip alignment-template-strip is-spacer"
            style={{ height: templateDuplicateRowPx, width: contentWidth }}
            aria-hidden="true"
          />
        )}
        <div
          className="alignment-base-strip alignment-trace-bases"
          style={{ position: 'relative', height: traceBaseRowPx, width: contentWidth }}
        >
          {layout.map((entry) => renderBaseCell(entry, 'trace'))}
        </div>
        {trace.expanded && hasChromatogramPeaks(trace) && (
          <>
            <div className="alignment-trace-chart">
              <TraceChromatogram
                trace={trace}
                mergedLayout={mergedLayout}
                visibleEntries={visibleEntries}
                contentWidth={contentWidth}
                templateStart={visibleStart}
                templateEnd={visibleEnd}
                onHover={onPeakHover}
              />
            </div>
            <div className="alignment-trace-ruler-row">
              <AlignmentTraceRuler
                entries={layout}
                contentWidth={contentWidth}
                alignment={alignment}
                traceLookup={traceLookup!}
              />
            </div>
          </>
        )}
      </div>
      <div className="alignment-trace-row-spacer" style={{ height: traceRowPaddingPx }} aria-hidden="true" />
    </div>
  )
}

function AlignedSequenceListRow({
  trace,
  onToggleExpanded,
  onToggleEnabled,
  onToggleAnnotations,
  onReplaceInReference,
  canReplaceInReference,
  annotationSequenceRowHeightPx,
  isFocused,
  onFocus,
  isLibrary,
  isDropTarget,
  canGroupDrag,
  onGroupDragTargetChange,
  onGroupMembers,
  onReassemble,
  onFlipMember,
  onOpenAsConstruct,
  conflictCount = 0,
}: {
  trace: TraceFileRecord
  onToggleExpanded: (traceId: string) => void
  onToggleEnabled: (traceId: string) => void
  onToggleAnnotations: (traceId: string) => void
  onReplaceInReference: (traceId: string) => void
  canReplaceInReference: boolean
  annotationSequenceRowHeightPx: number
  isFocused: boolean
  onFocus: () => void
  isLibrary?: boolean
  isDropTarget?: boolean
  canGroupDrag?: boolean
  onGroupDragTargetChange?: (targetId: string | null) => void
  onGroupMembers?: (targetId: string, sourceId: string) => void
  onReassemble?: () => void
  onFlipMember?: () => void
  onOpenAsConstruct?: () => void
  conflictCount?: number
}) {
  const readCount = trace.reads?.length ?? 0
  const rowHeight = alignmentPairRowHeight(trace, annotationSequenceRowHeightPx, isLibrary)
  const bodyHeight = traceAnnotationBodyHeightPx(annotationSequenceRowHeightPx)
  const statsLabel = trace.alignment ? alignmentStatsLabel(trace.alignment) : null
  const annotationBodyHeight = isLibrary ? Math.max(0, rowHeight - templateDuplicateRowPx - listActionBandPx) : bodyHeight
  const suppressClickRef = useRef(false)

  function handleNameClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onFocus()
    if (trace.showAnnotations) onToggleAnnotations(trace.id)
    else onToggleExpanded(trace.id)
  }

  function handleNamePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!canGroupDrag || !onGroupMembers || !onGroupDragTargetChange) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onFocus()
    startLibraryMemberGroupPointerDrag({
      sourceId: trace.id,
      clientX: event.clientX,
      clientY: event.clientY,
      onDropTargetChange: onGroupDragTargetChange,
      onActivated: () => {
        suppressClickRef.current = true
      },
      onGroup: onGroupMembers,
    })
  }

  return (
    <div
      className={`alignment-list-row${isFocused ? ' is-focused' : ''}${trace.showAnnotations ? ' is-annotation-mode' : ''}${isLibrary ? ' is-library' : ''}${isDropTarget ? ' is-drop-target' : ''}${canGroupDrag ? ' is-draggable' : ''}`}
      style={{ height: rowHeight, minHeight: rowHeight, maxHeight: rowHeight }}
      {...{ [LIBRARY_MEMBER_DROP_ATTR]: trace.id }}
      onPointerDown={onFocus}
    >
      <div className="alignment-list-band alignment-list-band-title" style={{ height: templateDuplicateRowPx }}>
        <label className="alignment-list-enable" title={`Show ${trace.fileName} alignment`}>
          <input
            type="checkbox"
            checked={trace.enabled}
            onChange={() => onToggleEnabled(trace.id)}
            aria-label={`Show ${trace.fileName} alignment`}
            onPointerDown={(event) => event.stopPropagation()}
          />
        </label>
        {!trace.showAnnotations && (
          <button
            type="button"
            className="alignment-spoiler"
            onClick={() => onToggleExpanded(trace.id)}
            aria-expanded={trace.expanded}
            aria-label={trace.expanded ? 'Collapse trace details' : 'Expand trace details'}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {trace.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        {canGroupDrag ? (
          <span
            className="alignment-list-name"
            role="button"
            tabIndex={0}
            onPointerDown={handleNamePointerDown}
            onClick={handleNameClick}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              handleNameClick()
            }}
            title="Drag onto another member to group as one clone · click to select/expand"
          >
            {trace.fileName}
            {trace.sequenceEdited ? ' •' : ''}
            {readCount > 1 ? ` (${readCount} reads)` : ''}
            {conflictCount > 0 ? ` · ${conflictCount} conflicts` : ''}
          </span>
        ) : (
          <button
            type="button"
            className="alignment-list-name"
            onClick={handleNameClick}
          >
            {trace.fileName}
            {trace.sequenceEdited ? ' •' : ''}
            {readCount > 1 ? ` (${readCount} reads)` : ''}
            {conflictCount > 0 ? ` · ${conflictCount} conflicts` : ''}
          </button>
        )}
      </div>
      <div className="alignment-list-band alignment-list-band-actions" style={{ height: listActionBandPx }}>
        <button
          type="button"
          className={`alignment-list-action${trace.showAnnotations ? ' is-active' : ''}`}
          onClick={() => onToggleAnnotations(trace.id)}
          title={trace.showAnnotations ? 'Hide trace sequence view' : 'Show trace sequence with reference annotations'}
          onPointerDown={(event) => event.stopPropagation()}
        >
          Annotations
        </button>
        <button
          type="button"
          className="alignment-list-action"
          disabled={!canReplaceInReference}
          onClick={() => onReplaceInReference(trace.id)}
          title={
            isLibrary
              ? 'Replace selected consensus region with selected member bases'
              : 'Replace selected region in reference with selected trace bases'
          }
          onPointerDown={(event) => event.stopPropagation()}
        >
          {isLibrary ? 'Replace in consensus' : 'Replace in original'}
        </button>
        {isLibrary && onOpenAsConstruct ? (
          <button
            type="button"
            className="alignment-list-action"
            onClick={onOpenAsConstruct}
            title="Open this member as a single construct"
            disabled={Boolean(trace.parseError) || trace.sequence.length === 0}
            onPointerDown={(event) => event.stopPropagation()}
          >
            Open
          </button>
        ) : null}
        {isLibrary && onFlipMember ? (
          <button
            type="button"
            className="alignment-list-action"
            onClick={onFlipMember}
            title="Reverse-complement this member and realign to consensus"
            disabled={Boolean(trace.parseError) || trace.sequence.length === 0}
            onPointerDown={(event) => event.stopPropagation()}
          >
            Flip
          </button>
        ) : null}
        {isLibrary && readCount > 1 && onReassemble ? (
          <button
            type="button"
            className="alignment-list-action"
            onClick={onReassemble}
            title="Rebuild this member sequence from its nested reads"
            onPointerDown={(event) => event.stopPropagation()}
          >
            Assemble
          </button>
        ) : null}
      </div>
      {trace.showAnnotations ? (
        <div className="alignment-list-band alignment-list-band-annotation-meta" style={{ height: annotationBodyHeight }}>
          {trace.alignment ? (
            <div className="alignment-list-meta">
              <div>{trace.sequence.length.toLocaleString()} bases in {isLibrary ? 'member' : 'trace'}</div>
              <div title={statsLabel ?? undefined}>{statsLabel}</div>
              {trace.alignment.orientation === 'reverse' && <div>Reverse-complement alignment</div>}
              {readCount > 1 && conflictCount > 0 ? (
                <div>Expand to inspect reads and double-click a base to resolve conflicts</div>
              ) : null}
            </div>
          ) : (
            <div className="alignment-list-error">{trace.parseError ?? 'Could not align to reference sequence'}</div>
          )}
        </div>
      ) : (
        <>
          <div className="alignment-list-band alignment-list-band-stats" style={{ height: traceBaseRowPx }}>
            {trace.alignment ? (
              <div className="alignment-list-meta-inline">
                {statsLabel}
                {readCount > 1 && !trace.expanded ? ' · expand to verify reads' : ''}
                {conflictCount > 0 ? ` · ${conflictCount} conflicts` : ''}
              </div>
            ) : (
              <div className="alignment-list-error">{trace.parseError ?? 'Could not align to reference sequence'}</div>
            )}
          </div>
          {trace.expanded && trace.alignment && hasChromatogramPeaks(trace) && (
            <div
              className="alignment-list-band alignment-list-band-details"
              style={{ height: chromatogramHeightPx + alignmentRulerHeightPx }}
            >
              <div className="alignment-list-meta">
                <div>{trace.sequence.length.toLocaleString()} bases in trace file</div>
                {trace.alignment.orientation === 'reverse' && <div>Reverse-complement alignment</div>}
              </div>
            </div>
          )}
          <div className="alignment-list-row-spacer" style={{ height: traceRowPaddingPx }} aria-hidden="true" />
        </>
      )}
    </div>
  )
}

function AlignedNestedReadListRow({
  parent,
  read,
  synthetic,
  isFocused,
  onFocus,
  onDetachRead,
}: {
  parent: TraceFileRecord
  read: LibraryMemberRead
  synthetic: TraceFileRecord
  isFocused: boolean
  onFocus: () => void
  onDetachRead?: (readId: string) => void
}) {
  const rowHeight = alignmentPairRowHeight(synthetic)
  const statsLabel = synthetic.alignment ? alignmentStatsLabel(synthetic.alignment) : null
  return (
    <div
      className={`alignment-list-row alignment-list-row-nested-read${isFocused ? ' is-focused' : ''}`}
      style={{ height: rowHeight, minHeight: rowHeight, maxHeight: rowHeight }}
      onPointerDown={onFocus}
    >
      <div className="alignment-list-band alignment-list-band-title" style={{ height: templateDuplicateRowPx }}>
        <span className="alignment-nested-read-indent" aria-hidden="true" />
        <span className="alignment-list-name" title={`${read.fileName} · nested read of ${parent.fileName}`}>
          {read.fileName}
          {synthetic.alignment?.orientation === 'reverse' ? ' (RC)' : ''}
        </span>
      </div>
      <div className="alignment-list-band alignment-list-band-actions" style={{ height: listActionBandPx }}>
        {onDetachRead ? (
          <button
            type="button"
            className="alignment-list-action"
            onClick={() => onDetachRead(read.id)}
            title="Detach this read into its own library member"
            onPointerDown={(event) => event.stopPropagation()}
          >
            Detach
          </button>
        ) : null}
        <span className="alignment-mode-hint">
          Double-click a base on the right to set the member sequence
        </span>
      </div>
      <div className="alignment-list-band alignment-list-band-stats" style={{ height: traceBaseRowPx }}>
        {synthetic.alignment ? (
          <div className="alignment-list-meta-inline">
            {read.sequence.length.toLocaleString()} bp
            {statsLabel ? ` · ${statsLabel}` : ''}
          </div>
        ) : (
          <div className="alignment-list-error">{synthetic.parseError ?? 'Could not align read'}</div>
        )}
      </div>
      {hasChromatogramPeaks(synthetic) ? (
        <div
          className="alignment-list-band alignment-list-band-details"
          style={{ height: chromatogramHeightPx + alignmentRulerHeightPx }}
        >
          <div className="alignment-list-meta">
            <div>Chromatogram for verification</div>
            {!hasChromatogramPeaks(synthetic) ? <div>No peak data for this read</div> : null}
          </div>
        </div>
      ) : null}
      <div className="alignment-list-row-spacer" style={{ height: traceRowPaddingPx }} aria-hidden="true" />
    </div>
  )
}

type SequenceAlignmentPaneProps = {
  templateSequence: string
  topology?: 'circular' | 'linear'
  layoutActive: boolean
  traceFiles: TraceFileRecord[]
  onTraceFilesChange: Dispatch<SetStateAction<TraceFileRecord[]>>
  traceAlignBusy?: boolean
  selectedTraceId: string | null
  onSelectTrace: (traceId: string | null) => void
  renderReferenceRow: (
    viewport: HorizontalViewport,
    mergedLayout: MergedInsertionLayout,
    options: {
      onRowHeight: (heightPx: number) => void
      visibleRangeOverride?: { start: number; end: number } | null
    },
  ) => ReactNode
  renderTraceAnnotationRow: (
    trace: TraceFileRecord,
    options: {
      horizontalViewport: HorizontalViewport
      mergedLayout: MergedInsertionLayout
      onRowHeight: (heightPx: number) => void
      visibleRangeOverride?: { start: number; end: number } | null
    },
  ) => ReactNode
  selectedRange: SelectionRange | null
  onRangeSelect: (range: SelectionRange, options?: { collapsed?: boolean }) => void
  onApplyReferenceReplacement: (templateStart: number, templateEnd: number, replacement: string) => void
  onRegisterTemplateNavigator?: (navigator: { scrollToTemplate: (templateIndex: number) => void; scrollToViewportStart: (templateIndex: number, atEnd: boolean) => void }) => void
  onVisibleTemplateRangeChange?: (range: { start: number; end: number }) => void
  onTracesAdded?: (result: { scrollTemplateIndex?: number; scrollToTraceId?: string }) => void
  onPickFromDatabase?: () => void
  acceptOsFileDrops?: boolean
  mode?: 'trace' | 'comparative'
  isLibrary?: boolean
  /** Label for library annotation reference (consensus or member name). */
  annotationReferenceName?: string | null
  onRebuildConsensus?: () => void
  onFlipLibrary?: () => void
  onFlipLibraryMember?: (memberId: string) => void
  onOpenLibraryMemberAsConstruct?: (memberId: string) => void
  onOpenCombineLibraryReads?: () => void
  onCropLibrary?: () => void
  canCropLibrary?: boolean
  onGroupLibraryMembers?: (memberIds: string[], options?: { keepMemberId?: string }) => void
  onReassembleLibraryMember?: (memberId: string) => void
  onDetachLibraryMemberRead?: (memberId: string, readId: string) => void
  /** Apply a nested-read display base at a consensus index onto the parent member sequence. */
  onAcceptReadBaseAtTemplate?: (memberId: string, templateIndex: number, displayBase: string) => void
  onFocusReference?: () => void; onViewTrace?: (traceId: string) => void
}

export function SequenceAlignmentPane({
  templateSequence,
  topology = 'linear',
  layoutActive,
  traceFiles,
  onTraceFilesChange,
  traceAlignBusy = false,
  selectedTraceId,
  onSelectTrace,
  renderReferenceRow,
  renderTraceAnnotationRow,
  selectedRange,
  onRangeSelect,
  onApplyReferenceReplacement,
  onRegisterTemplateNavigator,
  onVisibleTemplateRangeChange,
  onTracesAdded,
  onPickFromDatabase,
  acceptOsFileDrops = true,
  mode = 'trace',
  isLibrary = false,
  annotationReferenceName = null,
  onRebuildConsensus,
  onFlipLibrary,
  onFlipLibraryMember,
  onOpenLibraryMemberAsConstruct,
  onOpenCombineLibraryReads,
  onCropLibrary,
  canCropLibrary = false,
  onGroupLibraryMembers,
  onReassembleLibraryMember,
  onDetachLibraryMemberRead,
  onAcceptReadBaseAtTemplate,
  onFocusReference, onViewTrace,
}: SequenceAlignmentPaneProps) {
  const layoutRef = useRef<HTMLDivElement | null>(null)
  const referenceScrollRef = useRef<HTMLDivElement | null>(null)
  const tracesScrollRef = useRef<HTMLDivElement | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const pendingVerticalScrollRef = useRef(new WeakMap<HTMLDivElement, number>())
  const lastScrollColumnRef = useRef<number>(-1)
  /** Live scrollLeft; survives WKWebView remounts that briefly reset the DOM to 0. */
  const expectedScrollLeftRef = useRef(0)
  const scrollStateRafRef = useRef<number | null>(null)
  /** Minimap / custom scrollbar / navigator programmatic scrolls. */
  const programmaticScrollRef = useRef(false)
  const splitDragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const sidebarSplitDragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(800)
  const [topSectionHeightPx, setTopSectionHeightPx] = useState(240)
  const [sidebarWidthPx, setSidebarWidthPx] = useState(alignmentSidebarWidthPx)
  const [status, setStatus] = useState<string | null>(null)
  const [peakHover, setPeakHover] = useState<{ traceId: string; templateIndex: number; base: ChromatogramBase } | null>(null)
  const [traceAnnotationRowHeights, setTraceAnnotationRowHeights] = useState<Record<string, number>>({})
  const [referenceRowHeightPx, setReferenceRowHeightPx] = useState(0)
  const [dropTargetMemberId, setDropTargetMemberId] = useState<string | null>(null)

  const setTraceAnnotationRowHeight = useCallback((traceId: string, heightPx: number) => {
    setTraceAnnotationRowHeights((current) => (current[traceId] === heightPx ? current : { ...current, [traceId]: heightPx }))
  }, [])

  const horizontalViewport = useMemo(
    () => ({ scrollLeft, width: viewportWidth }),
    [scrollLeft, viewportWidth],
  )

  const enabledTraces = useMemo(
    () => traceFiles.filter((trace) => trace.enabled),
    [traceFiles],
  )

  const alignedTraces = useMemo(
    () => enabledTraces.filter((trace) => !trace.parseError && trace.alignment),
    [enabledTraces],
  )

  const pendingAlignmentCount = useMemo(
    () => enabledTraces.filter((trace) => !trace.parseError && !trace.alignment).length,
    [enabledTraces],
  )

  const mergedLayout = useMemo(() => {
    return profileSync('buildMergedInsertionLayout', 'alignment-pane', () => {
      if (alignedTraces.length === 0) {
        return buildMergedInsertionLayout([], templateSequence.length)
      }
      return buildMergedInsertionLayout(
        alignedTraces.map((trace) => trace.alignment!),
        templateSequence.length,
      )
    }, `${alignedTraces.length} traces`)
  }, [alignedTraces, templateSequence.length])

  useLayoutEffect(() => {
    if (!alignmentProfileEnabled()) return
    alignmentProfileMeasure('alignment-pane-mount', 'alignment-toggle-start', 'mount')
  }, [])

  const visibleRange = useMemo(
    () => computeVisibleTemplateRangeForMergedLayout(mergedLayout, scrollLeft, viewportWidth),
    [mergedLayout, scrollLeft, viewportWidth],
  )
  const renderRange = visibleRange

  useEffect(() => {
    onVisibleTemplateRangeChange?.(visibleRange)
  }, [onVisibleTemplateRangeChange, visibleRange])

  const displayedTraces = useMemo(() => {
    // Cull by a padded window so rows are not remounted at exact alignment edges.
    const padBp = Math.max(256, Math.ceil(viewportWidth / sequenceBaseStepPx))
    const start = Math.max(0, renderRange.start - padBp)
    const end = Math.min(mergedLayout.templateLength, renderRange.end + padBp)
    return enabledTraces.filter((trace) => {
      if (trace.parseError) return true
      if (!trace.alignment) return false
      return alignmentOverlapsTemplateRange(trace.alignment, start, end)
    })
  }, [enabledTraces, mergedLayout.templateLength, renderRange.end, renderRange.start, viewportWidth])

  type AlignmentDisplayRow =
    | { kind: 'member'; trace: TraceFileRecord; conflictCount: number; conflictTemplateIndices: ReadonlySet<number> }
    | {
        kind: 'read'
        parent: TraceFileRecord
        read: LibraryMemberRead
        synthetic: TraceFileRecord
        conflictTemplateIndices: ReadonlySet<number>
      }

  const displayRows = useMemo((): AlignmentDisplayRow[] => {
    const rows: AlignmentDisplayRow[] = []
    for (const trace of displayedTraces) {
      const conflicts = isLibrary && (trace.reads?.length ?? 0) > 1 ? findAssemblyConflicts(trace) : []
      const conflictTemplateIndices = new Set(
        isLibrary && (trace.reads?.length ?? 0) > 1 ? assemblyConflictTemplateIndices(trace) : [],
      )
      rows.push({
        kind: 'member',
        trace,
        conflictCount: conflicts.length,
        conflictTemplateIndices,
      })
      if (!isLibrary || !trace.expanded || (trace.reads?.length ?? 0) <= 1) continue
      for (const read of trace.reads ?? []) {
        rows.push({
          kind: 'read',
          parent: trace,
          read,
          synthetic: nestedReadAsConsensusTrace(read, trace, templateSequence, topology),
          conflictTemplateIndices,
        })
      }
    }
    return rows
  }, [displayedTraces, isLibrary, templateSequence, topology])

  const visibleEntries = useMemo(
    () =>
      profileSync(
        'visibleMergedLayoutEntries (traces)',
        'alignment-pane',
        () => visibleMergedLayoutEntries(mergedLayout, renderRange.start, renderRange.end),
        `${renderRange.start}-${renderRange.end}`,
      ),
    [mergedLayout, renderRange.end, renderRange.start],
  )

  const trackWidthPx = useMemo(() => alignmentTrackWidthPx(mergedLayout), [mergedLayout])

  const centerReferenceStrandVertically = useCallback(() => {
    const host = referenceScrollRef.current
    if (!host) return
    const strandBlock = host.querySelector('.sequence-strand-block')
    if (!strandBlock) return
    const hostRect = host.getBoundingClientRect()
    const strandRect = strandBlock.getBoundingClientRect()
    const strandTop = strandRect.top - hostRect.top + host.scrollTop
    const strandHeight = strandRect.height
    const viewportHeight = host.clientHeight
    if (viewportHeight <= 0 || strandHeight <= 0) return
    const maxScroll = Math.max(0, host.scrollHeight - viewportHeight)
    host.scrollTop = Math.max(0, Math.min(strandTop - (viewportHeight - strandHeight) / 2, maxScroll))
  }, [])

  useEffect(() => {
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const drag = sidebarSplitDragRef.current
      const layout = layoutRef.current
      if (!drag || !layout) return
      // Keep enough room for the reference / alignment grid even in narrow windows.
      const maxWidth = Math.max(220, layout.clientWidth - 220)
      setSidebarWidthPx(Math.max(220, Math.min(maxWidth, drag.startWidth + (event.clientX - drag.startX))))
    }

    const onPointerUp = () => {
      sidebarSplitDragRef.current = null
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  const scheduleCenterReferenceStrand = useCallback(() => {
    centerReferenceStrandVertically()
    window.requestAnimationFrame(centerReferenceStrandVertically)
  }, [centerReferenceStrandVertically])

  const applyTracePanOffset = useCallback((nextScrollLeft: number) => {
    const tracesHost = tracesScrollRef.current
    if (!tracesHost) return
    const offset = `${-nextScrollLeft}px`
    tracesHost.querySelectorAll<HTMLElement>('[data-alignment-pan-track]').forEach((track) => {
      if (track.style.marginLeft !== offset) track.style.marginLeft = offset
    })
  }, [])

  const restoreReferenceScrollLeft = useCallback(() => {
    const referenceHost = referenceScrollRef.current
    if (!referenceHost) return
    const expected = expectedScrollLeftRef.current
    if (Math.abs(referenceHost.scrollLeft - expected) > 0.5) {
      referenceHost.scrollLeft = expected
    }
  }, [])

  /** Same path as minimap frame drag: set scrollLeft ourselves, then sync React virt. */
  const scrollToScrollLeft = useCallback((nextScrollLeft: number) => {
    const referenceHost = referenceScrollRef.current
    if (!referenceHost) return
    const maxScroll = Math.max(0, referenceHost.scrollWidth - referenceHost.clientWidth)
    const clamped = Math.max(0, Math.min(nextScrollLeft, maxScroll))
    programmaticScrollRef.current = true
    expectedScrollLeftRef.current = clamped
    referenceHost.scrollLeft = clamped
    applyTracePanOffset(clamped)
    setViewportWidth(referenceHost.clientWidth)
    const nextColumn = Math.floor(Math.max(0, clamped - sequenceTrackInsetPx) / sequenceBaseStepPx)
    lastScrollColumnRef.current = nextColumn
    setScrollLeft(clamped)
    window.requestAnimationFrame(() => {
      programmaticScrollRef.current = false
    })
  }, [applyTracePanOffset])

  const scrollToTemplatePosition = useCallback((templateIndex: number) => {
    const referenceHost = referenceScrollRef.current
    if (!referenceHost) return
    const targetLeft = templateX(templateIndex) - referenceHost.clientWidth * 0.25
    scrollToScrollLeft(targetLeft)
    window.requestAnimationFrame(() => scrollToScrollLeft(targetLeft))
  }, [scrollToScrollLeft])

  const scrollToViewportStart = useCallback((templateIndex: number, atEnd: boolean) => {
    const referenceHost = referenceScrollRef.current
    if (!referenceHost) return
    // The visible-range calculation includes four bases of overscan.
    const targetLeft = atEnd
      ? referenceHost.scrollWidth - referenceHost.clientWidth
      : templateIndexLeftPx(mergedLayout, templateIndex === 0 ? 0 : templateIndex + 4)
    scrollToScrollLeft(targetLeft)
    window.requestAnimationFrame(() => scrollToScrollLeft(targetLeft))
  }, [mergedLayout, scrollToScrollLeft])

  useEffect(() => {
    onRegisterTemplateNavigator?.({ scrollToTemplate: scrollToTemplatePosition, scrollToViewportStart })
    return () => onRegisterTemplateNavigator?.({ scrollToTemplate: () => {}, scrollToViewportStart: () => {} })
  }, [onRegisterTemplateNavigator, scrollToTemplatePosition, scrollToViewportStart])

  const navigateTraceFromList = useCallback(
    (traceId: string) => {
      onSelectTrace(traceId)
      const trace = traceFiles.find((item) => item.id === traceId)
      if (!trace?.alignment) return
      scrollToTemplatePosition(alignmentViewportTemplateIndex(trace.alignment))
    },
    [onSelectTrace, scrollToTemplatePosition, traceFiles],
  )

  const commitReferenceViewport = useCallback((referenceHost: HTMLDivElement, nextScrollLeft: number) => {
    const nextWidth = referenceHost.clientWidth
    const nextColumn = Math.floor(Math.max(0, nextScrollLeft - sequenceTrackInsetPx) / sequenceBaseStepPx)
    const columnChanged = nextColumn !== lastScrollColumnRef.current
    lastScrollColumnRef.current = nextColumn
    setViewportWidth((current) => (current === nextWidth ? current : nextWidth))
    if (columnChanged) setScrollLeft(nextScrollLeft)
  }, [])

  const updateReferenceViewport = useCallback((referenceHost: HTMLDivElement) => {
    let nextScrollLeft = referenceHost.scrollLeft
    const expected = expectedScrollLeftRef.current
    if (nextScrollLeft < 1 && expected > sequenceBaseStepPx && !programmaticScrollRef.current) {
      referenceHost.scrollLeft = expected
      nextScrollLeft = expected
    } else {
      expectedScrollLeftRef.current = nextScrollLeft
    }
    applyTracePanOffset(nextScrollLeft)
    commitReferenceViewport(referenceHost, nextScrollLeft)
  }, [applyTracePanOffset, commitReferenceViewport])

  const syncVerticalScroll = useCallback((source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target) return
    const pending = pendingVerticalScrollRef.current
    const expected = pending.get(source)
    pending.delete(source)
    // Ignore the event caused by our own update, but never suppress a newer
    // user scroll from the same panel while that event is still pending.
    if (expected !== undefined && Math.abs(source.scrollTop - expected) < 1) return
    if (Math.abs(target.scrollTop - source.scrollTop) < 1) return
    target.scrollTop = source.scrollTop
    pending.set(target, target.scrollTop)
  }, [])

  useEffect(() => {
    const referenceHost = referenceScrollRef.current
    const tracesHost = tracesScrollRef.current
    const listHost = listScrollRef.current
    if (!referenceHost || !tracesHost || !listHost || !layoutActive) return

    const handleReferenceScroll = () => {
      const nextScrollLeft = referenceHost.scrollLeft
      const expected = expectedScrollLeftRef.current
      // Ignore transient origin resets from content remounts (wheel path only — custom
      // scrollbar / minimap go through scrollToScrollLeft and set expected first).
      if (
        !programmaticScrollRef.current &&
        nextScrollLeft < 1 &&
        expected > sequenceBaseStepPx * 4
      ) {
        referenceHost.scrollLeft = expected
        applyTracePanOffset(expected)
        return
      }
      expectedScrollLeftRef.current = nextScrollLeft
      applyTracePanOffset(nextScrollLeft)
      if (scrollStateRafRef.current !== null) return
      scrollStateRafRef.current = window.requestAnimationFrame(() => {
        scrollStateRafRef.current = null
        commitReferenceViewport(referenceHost, expectedScrollLeftRef.current)
      })
    }

    const handleTracesScroll = () => {
      syncVerticalScroll(tracesHost, listHost)
    }

    const handleListScroll = () => {
      syncVerticalScroll(listHost, tracesHost)
    }

    updateReferenceViewport(referenceHost)
    referenceHost.addEventListener('scroll', handleReferenceScroll, { passive: true })
    tracesHost.addEventListener('scroll', handleTracesScroll, { passive: true })
    listHost.addEventListener('scroll', handleListScroll, { passive: true })
    const observer = new ResizeObserver(() => {
      restoreReferenceScrollLeft()
      updateReferenceViewport(referenceHost)
      scheduleCenterReferenceStrand()
    })
    observer.observe(referenceHost)
    return () => {
      referenceHost.removeEventListener('scroll', handleReferenceScroll)
      tracesHost.removeEventListener('scroll', handleTracesScroll)
      listHost.removeEventListener('scroll', handleListScroll)
      observer.disconnect()
      if (scrollStateRafRef.current !== null) {
        window.cancelAnimationFrame(scrollStateRafRef.current)
        scrollStateRafRef.current = null
      }
    }
  }, [
    applyTracePanOffset,
    commitReferenceViewport,
    layoutActive,
    restoreReferenceScrollLeft,
    scheduleCenterReferenceStrand,
    syncVerticalScroll,
    updateReferenceViewport,
  ])

  useLayoutEffect(() => {
    restoreReferenceScrollLeft()
    applyTracePanOffset(expectedScrollLeftRef.current)
  }, [applyTracePanOffset, displayedTraces, restoreReferenceScrollLeft, scrollLeft, visibleEntries, renderRange.end, renderRange.start])

  useLayoutEffect(() => {
    if (!layoutActive) return
    scheduleCenterReferenceStrand()
  }, [layoutActive, referenceRowHeightPx, scheduleCenterReferenceStrand, topSectionHeightPx])

  useEffect(() => {
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const drag = splitDragRef.current
      const layout = layoutRef.current
      if (!drag || !layout) return
      const maxTop = layout.clientHeight - alignmentBottomMinHeightPx - alignmentSplitterHeightPx
      const nextHeight = Math.max(
        alignmentTopMinHeightPx,
        Math.min(maxTop, drag.startHeight + (event.clientY - drag.startY)),
      )
      setTopSectionHeightPx(nextHeight)
    }

    const onPointerUp = () => {
      splitDragRef.current = null
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  function toggleEnabled(traceId: string) {
    const target = traceFiles.find((trace) => trace.id === traceId)
    const enabling = Boolean(target && !target.enabled)
    onTraceFilesChange((current) =>
      current.map((trace) => (trace.id === traceId ? { ...trace, enabled: !trace.enabled } : trace)),
    )
    if (enabling && target?.alignment) {
      navigateTraceFromList(traceId)
    }
  }

  function handleReplaceWithTrace(traceId: string) {
    const trace = traceFiles.find((item) => item.id === traceId)
    if (!trace?.alignment || !selectedRange || selectedRange.start === selectedRange.end) return
    const replacement = buildReferenceReplacementFromTrace(
      trace.alignment,
      trace.chromatogram.baseCalls,
      selectedRange.start,
      selectedRange.end,
    )
    if (!replacement) return
    onApplyReferenceReplacement(selectedRange.start, selectedRange.end, replacement)
  }

  function toggleShowAnnotations(traceId: string) {
    onTraceFilesChange((current) =>
      current.map((trace) => (trace.id === traceId ? { ...trace, showAnnotations: !trace.showAnnotations } : trace)),
    )
  }

  function toggleExpanded(traceId: string) {
    onTraceFilesChange((current) =>
      current.map((trace) => (trace.id === traceId ? { ...trace, expanded: !trace.expanded } : trace)),
    )
  }

  function startSplitDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    splitDragRef.current = { startY: event.clientY, startHeight: topSectionHeightPx }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function startSidebarSplitDrag(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    sidebarSplitDragRef.current = { startX: event.clientX, startWidth: sidebarWidthPx }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  return (
    <div className="alignment-mode">
      {isLibrary ? (
        <DnaLibraryToolbar
          consensusLength={templateSequence.length}
          memberCount={traceFiles.filter((trace) => trace.enabled).length}
          alignedMemberCount={alignedTraces.length}
          pendingAlignCount={pendingAlignmentCount}
          selectedMemberName={
            selectedTraceId
              ? (traceFiles.find((trace) => trace.id === selectedTraceId)?.fileName ?? 'selected')
              : null
          }
          annotationReferenceName={annotationReferenceName}
          onRebuildConsensus={onRebuildConsensus}
          onFlipLibrary={onFlipLibrary}
          onOpenCombineLibraryReads={onOpenCombineLibraryReads}
          onCropLibrary={onCropLibrary}
          canCropLibrary={canCropLibrary}
          showGroupHint={Boolean(onGroupLibraryMembers)}
          status={status}
          busy={traceAlignBusy}
        />
      ) : (
        <div className="alignment-mode-header">
          <div className="dna-library-toolbar-group dna-library-toolbar-stats">
            <span>{`Alignment mode: ${templateSequence.length.toLocaleString()} bp reference`}</span>
            <span>
              {alignedTraces.length} aligned sequence{alignedTraces.length === 1 ? '' : 's'}
              {pendingAlignmentCount > 0 ? ` (${pendingAlignmentCount} aligning)` : ''}
            </span>
          </div>
          <div className="dna-library-toolbar-group dna-library-toolbar-status">
            {status ? <span className="dna-library-toolbar-message" title={status}>{status}</span> : null}
            {traceAlignBusy ? <span className="dna-library-toolbar-busy">Working…</span> : null}
          </div>
        </div>
      )}
      <div
        ref={layoutRef}
        className="alignment-layout"
        data-horizontal-wheel-root=".alignment-reference-host"
        style={{
          ['--alignment-sidebar-width' as string]: `${sidebarWidthPx}px`,
          ['--alignment-track-width' as string]: `${trackWidthPx}px`,
        }}
      >
        <div className="alignment-top-section" style={{ height: topSectionHeightPx }}>
          <AlignmentTraceFileList
            className="alignment-top-left"
            templateSequence={templateSequence}
            topology={topology}
            traceFiles={traceFiles}
            onTraceFilesChange={onTraceFilesChange}
            onTracesAdded={onTracesAdded}
            onTraceNavigate={navigateTraceFromList}
            selectedTraceId={selectedTraceId}
            onPickFromDatabase={onPickFromDatabase}
            onStatus={setStatus}
            traceAlignBusy={traceAlignBusy}
            acceptOsFileDrops={acceptOsFileDrops}
            mode={mode}
            isLibrary={isLibrary}
            onGroupLibraryMembers={onGroupLibraryMembers} onViewTrace={onViewTrace}
          />

          <div
            className="alignment-column-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize alignment source list"
            onPointerDown={startSidebarSplitDrag}
          />

          <div className="alignment-reference-column">
            <div
              className="alignment-reference-host"
              ref={referenceScrollRef}
              onPointerDownCapture={() => onFocusReference?.()}
            >
              <div className="alignment-horizontal-track">
                {renderReferenceRow(horizontalViewport, mergedLayout, {
                  onRowHeight: setReferenceRowHeightPx,
                })}
              </div>
            </div>
            <AlignmentHorizontalScrollbar
              scrollLeft={scrollLeft}
              viewportWidth={viewportWidth}
              contentWidth={trackWidthPx}
              onScrollTo={scrollToScrollLeft}
            />
          </div>
        </div>

        <div
          className="alignment-row-splitter"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize reference and alignment panels"
          onPointerDown={startSplitDrag}
        />

        <div className="alignment-bottom-section">
          <div className="alignment-bottom-left">
            <div className="alignment-panel-title">{isLibrary ? 'Library members' : 'Aligned Sequences'}</div>
            <div className="alignment-list-scroll" ref={listScrollRef}>
              {enabledTraces.length === 0 && <div className="alignment-empty-note">Enable alignments above</div>}
              {enabledTraces.length > 0 && displayedTraces.length === 0 && (
                <div className="alignment-empty-note">
                  {traceAlignBusy || pendingAlignmentCount > 0
                    ? 'Aligning…'
                    : alignedTraces.length > 0
                      ? 'Scroll to an aligned region'
                      : 'No alignments yet'}
                </div>
              )}
              {displayRows.map((row) => {
                if (row.kind === 'read') {
                  return (
                    <AlignedNestedReadListRow
                      key={row.synthetic.id}
                      parent={row.parent}
                      read={row.read}
                      synthetic={row.synthetic}
                      isFocused={selectedTraceId === row.parent.id}
                      onFocus={() => onSelectTrace(row.parent.id)}
                      onDetachRead={
                        onDetachLibraryMemberRead
                          ? (readId) => onDetachLibraryMemberRead(row.parent.id, readId)
                          : undefined
                      }
                    />
                  )
                }
                const { trace } = row
                return (
                  <AlignedSequenceListRow
                    key={trace.id}
                    trace={trace}
                    isFocused={selectedTraceId === trace.id}
                    isLibrary={isLibrary}
                    isDropTarget={dropTargetMemberId === trace.id}
                    canGroupDrag={Boolean(isLibrary && onGroupLibraryMembers)}
                    onGroupDragTargetChange={setDropTargetMemberId}
                    onGroupMembers={
                      isLibrary && onGroupLibraryMembers
                        ? (targetId, sourceId) => onGroupLibraryMembers([targetId, sourceId], { keepMemberId: targetId })
                        : undefined
                    }
                    onFocus={() => onSelectTrace(trace.id)}
                    annotationSequenceRowHeightPx={traceAnnotationRowHeights[trace.id] ?? 0}
                    conflictCount={row.conflictCount}
                    canReplaceInReference={
                      selectedTraceId === trace.id &&
                      selectedRange !== null &&
                      selectedRange.start !== selectedRange.end &&
                      trace.alignment !== null
                    }
                    onToggleExpanded={toggleExpanded}
                    onToggleEnabled={toggleEnabled}
                    onToggleAnnotations={toggleShowAnnotations}
                    onReplaceInReference={handleReplaceWithTrace}
                    onReassemble={
                      isLibrary && onReassembleLibraryMember
                        ? () => onReassembleLibraryMember(trace.id)
                        : undefined
                    }
                    onFlipMember={
                      isLibrary && onFlipLibraryMember
                        ? () => onFlipLibraryMember(trace.id)
                        : undefined
                    }
                    onOpenAsConstruct={
                      isLibrary && onOpenLibraryMemberAsConstruct
                        ? () => onOpenLibraryMemberAsConstruct(trace.id)
                        : undefined
                    }
                  />
                )
              })}
            </div>
          </div>

          <div
            className="alignment-column-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize aligned sequence list"
            onPointerDown={startSidebarSplitDrag}
          />

          <div className="alignment-bottom-right">
            <div className="alignment-panel-title alignment-panel-title-spacer" aria-hidden="true">
              Aligned Sequences
            </div>
            <div className="alignment-traces-host" ref={tracesScrollRef}>
              <div className="alignment-traces-scroll">
                {displayRows.map((row) => {
                  if (row.kind === 'read') {
                    const { synthetic, parent, conflictTemplateIndices } = row
                    return (
                      <div key={synthetic.id} className="alignment-trace-pan-clip">
                        <div
                          className="alignment-horizontal-track"
                          data-alignment-pan-track
                          style={{ marginLeft: -scrollLeft }}
                        >
                          <TraceAlignmentRow
                            trace={synthetic}
                            templateSequence={templateSequence}
                            mergedLayout={mergedLayout}
                            visibleEntries={visibleEntries}
                            visibleStart={renderRange.start}
                            visibleEnd={renderRange.end}
                            selectedRange={selectedRange}
                            isFocused={selectedTraceId === parent.id}
                            hideTemplateStrip={isLibrary}
                            conflictTemplateIndices={conflictTemplateIndices}
                            peakHoverTemplateIndex={peakHover?.traceId === synthetic.id ? peakHover.templateIndex : null}
                            peakHoverBase={peakHover?.traceId === synthetic.id ? peakHover.base : null}
                            onFocus={() => onSelectTrace(parent.id)}
                            onRangeSelect={onRangeSelect}
                            onPeakHover={(templateIndex, dominantBase) => {
                              if (templateIndex === null || dominantBase === null) {
                                setPeakHover((current) => (current?.traceId === synthetic.id ? null : current))
                                return
                              }
                              setPeakHover({ traceId: synthetic.id, templateIndex, base: dominantBase })
                            }}
                            onTemplateBaseActivate={
                              onAcceptReadBaseAtTemplate
                                ? (templateIndex, displayBase) => {
                                    onAcceptReadBaseAtTemplate(parent.id, templateIndex, displayBase)
                                  }
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    )
                  }
                  const { trace, conflictTemplateIndices } = row
                  return trace.showAnnotations ? (
                    <TraceAnnotationSequenceRow
                      key={trace.id}
                      trace={trace}
                      isLibrary={isLibrary}
                      isFocused={selectedTraceId === trace.id}
                      annotationRowHeightPx={traceAnnotationRowHeights[trace.id] ?? 0}
                      scrollLeft={scrollLeft}
                      horizontalViewport={horizontalViewport}
                      mergedLayout={mergedLayout}
                      renderTraceAnnotationRow={renderTraceAnnotationRow}
                      onFocus={() => onSelectTrace(trace.id)}
                      onRowHeight={setTraceAnnotationRowHeight}
                    />
                  ) : (
                    <div key={trace.id} className="alignment-trace-pan-clip">
                      <div
                        className="alignment-horizontal-track"
                        data-alignment-pan-track
                        style={{ marginLeft: -scrollLeft }}
                      >
                        <TraceAlignmentRow
                          trace={trace}
                          templateSequence={templateSequence}
                          mergedLayout={mergedLayout}
                          visibleEntries={visibleEntries}
                          visibleStart={renderRange.start}
                          visibleEnd={renderRange.end}
                          selectedRange={selectedRange}
                          isFocused={selectedTraceId === trace.id}
                          hideTemplateStrip={isLibrary}
                          conflictTemplateIndices={conflictTemplateIndices}
                          peakHoverTemplateIndex={peakHover?.traceId === trace.id ? peakHover.templateIndex : null}
                          peakHoverBase={peakHover?.traceId === trace.id ? peakHover.base : null}
                          onFocus={() => onSelectTrace(trace.id)}
                          onRangeSelect={onRangeSelect}
                          onPeakHover={(templateIndex, dominantBase) => {
                            if (templateIndex === null || dominantBase === null) {
                              setPeakHover((current) => (current?.traceId === trace.id ? null : current))
                              return
                            }
                            setPeakHover({ traceId: trace.id, templateIndex, base: dominantBase })
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
