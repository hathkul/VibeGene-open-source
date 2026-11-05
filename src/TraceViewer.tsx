import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { tracePeakColors, tracePeakFillColors } from './domain/traceDisplay'
import { reverseComplement } from './domain/sequence'
import {
  findTraceSearchHits,
  nextTraceSearchHitIndex,
  traceSearchHitRange,
} from './domain/traceSearch'
import {
  buildTraceViewerGeometry,
  orientTraceChromatogram,
  traceViewerMirroredScrollLeft,
  TRACE_VIEWER_DETAIL_HEIGHT,
  TRACE_VIEWER_SEQUENCE_HEIGHT,
} from './domain/traceViewerGeometry'
import type { TraceViewerChromatogram, TraceViewerMode } from './domain/traceViewerGeometry'
import type { TraceFileRecord } from './domain/traceTypes'
import './TraceViewer.css'

export type TraceViewerProps = {
  trace: TraceFileRecord | null
  onClose?: () => void
  status?: 'loading' | 'ready' | 'empty' | 'error'
  onOpenAsSequence?: (direction: 'forward' | 'reverse') => void
  /** Opening orientation; a reverse-aligned read opens in the direction it was aligned. */
  initialDirection?: 'forward' | 'reverse'
  /** Opening selection in displayed-ordinal space, e.g. the current workspace selection. */
  initialSelection?: { start: number; end: number } | null
}

const channelOrder = ['A', 'T', 'G', 'C'] as const
const modes: { id: TraceViewerMode; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'autoscaled', label: 'Autoscaled' },
  { id: 'raw', label: 'Raw' },
]

/**
 * Standalone chromatogram inspector. It intentionally ignores trace.alignment:
 * alignment context is resolved by the caller, which passes the opening
 * orientation and selection already mapped into this viewer's ordinal space.
 */
export function TraceViewer({ trace, onClose, status, onOpenAsSequence, initialDirection, initialSelection }: TraceViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sequenceBandRef = useRef<HTMLDivElement>(null)
  const sequenceTextRef = useRef<HTMLSpanElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const restoreSearchFocus = useRef(false)
  const selectionAnchor = useRef<number | null>(null)
  const pendingSelectionReveal = useRef<{ start: number; end: number } | null>(initialSelection ?? null)
  const pendingHorizontalAnchor = useRef<{ scrollLeft: number; viewportWidth: number; previousZoom: number } | null>(null)
  const pendingDirectionAnchor = useRef<{ scrollLeft: number; viewportWidth: number; previousWidth: number } | null>(null)
  const [direction, setDirection] = useState<'forward' | 'reverse'>(initialDirection ?? 'forward')
  const [mode, setMode] = useState<TraceViewerMode>('standard')
  const [peakZoom, setPeakZoom] = useState(1)
  const [horizontalZoom, setHorizontalZoom] = useState(1)
  const [plotHeight, setPlotHeight] = useState(360)
  const [showQuality, setShowQuality] = useState(true)
  const [hoveredBase, setHoveredBase] = useState<number | null>(null)
  const [selectedBases, setSelectedBases] = useState<{ start: number; end: number } | null>(initialSelection ?? null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHitIndex, setSearchHitIndex] = useState(0)
  const resolvedStatus = status ?? (trace?.parseError ? 'error' : trace ? 'ready' : 'empty')
  const chromatogram = trace?.chromatogram as TraceViewerChromatogram | undefined
  const orientedData = useMemo(
    () => chromatogram ? orientTraceChromatogram(chromatogram, direction) : null,
    [chromatogram, direction],
  )
  const hasRaw = Boolean(chromatogram?.raw && [chromatogram.raw.aTrace, chromatogram.raw.tTrace, chromatogram.raw.gTrace, chromatogram.raw.cTrace].every((channel) => channel.length > 0))
  const viewerMode: TraceViewerMode = mode === 'raw' && !hasRaw ? 'standard' : mode
  const geometry = useMemo(
    () => orientedData ? buildTraceViewerGeometry(orientedData, { sampleScale: 0.8 * horizontalZoom, mode: viewerMode, peakZoom, height: plotHeight }) : null,
    [orientedData, viewerMode, peakZoom, horizontalZoom, plotHeight],
  )
  const signalSampleCount = chromatogram
    ? Math.max(chromatogram.aTrace.length, chromatogram.tTrace.length, chromatogram.gTrace.length, chromatogram.cTrace.length)
    : 0
  const dataReady = Boolean(trace && !trace.parseError && trace.chromatogram.baseCalls.length && signalSampleCount)
  const hasQuality = Boolean(chromatogram?.qualNums?.length)
  const showSequence = viewerMode !== 'raw'
  const activeHit = geometry?.hitSegments.find((segment) => segment.index === hoveredBase)
  const activeMarker = geometry?.activeMarkers.find((marker) => marker.index === hoveredBase)
  const activeBase = geometry?.bases.find((base) => base.index === hoveredBase)
  const calledSequence = geometry?.bases.map((base) => base.base).join('') ?? ''
  const searchHits = useMemo(
    () => findTraceSearchHits(calledSequence, searchQuery),
    [calledSequence, searchQuery],
  )
  const clearOwnedSequenceSelection = useCallback(() => {
    const textLayer = sequenceTextRef.current
    const selection = window.getSelection()
    if (!textLayer || !selection) return
    for (let index = 0; index < selection.rangeCount; index += 1) {
      const range = selection.getRangeAt(index)
      const belongsToSelectionText = (node: Node) => textLayer.contains(node)
        || (node.nodeType === Node.TEXT_NODE && (node as Text).parentElement?.classList.contains('trace-viewer__selection-text') === true)
      if (belongsToSelectionText(range.startContainer) || belongsToSelectionText(range.endContainer)) {
        selection.removeAllRanges()
        return
      }
    }
  }, [])

  useLayoutEffect(() => clearOwnedSequenceSelection(), [calledSequence, clearOwnedSequenceSelection])

  useLayoutEffect(() => {
    const viewport = scrollRef.current
    if (!viewport) return
    const measureHeight = () => setPlotHeight(Math.max(80, viewport.clientHeight - (showSequence ? TRACE_VIEWER_SEQUENCE_HEIGHT : 0) - TRACE_VIEWER_DETAIL_HEIGHT))
    measureHeight()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measureHeight)
      return () => window.removeEventListener('resize', measureHeight)
    }
    const observer = new ResizeObserver(measureHeight)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [dataReady, showSequence])

  useLayoutEffect(() => {
    const viewport = scrollRef.current
    const anchor = pendingHorizontalAnchor.current
    if (!viewport || !anchor) return
    const centeredScan = (anchor.scrollLeft + anchor.viewportWidth / 2) * horizontalZoom / anchor.previousZoom
    viewport.scrollLeft = Math.max(0, centeredScan - anchor.viewportWidth / 2)
    pendingHorizontalAnchor.current = null
  }, [horizontalZoom])

  useLayoutEffect(() => {
    const viewport = scrollRef.current
    const anchor = pendingDirectionAnchor.current
    if (!viewport || !anchor || !geometry) return
    viewport.scrollLeft = traceViewerMirroredScrollLeft(anchor.previousWidth, geometry.width, anchor.scrollLeft, anchor.viewportWidth)
    pendingDirectionAnchor.current = null
  }, [direction, geometry])

  const moveViewport = (amount: number) => {
    const viewport = scrollRef.current
    if (viewport) viewport.scrollBy({ left: amount * viewport.clientWidth * 0.75, behavior: 'smooth' })
  }
  const changeDirection = (nextDirection: 'forward' | 'reverse') => {
    const viewport = scrollRef.current
    if (viewport && geometry && nextDirection !== direction) {
      pendingDirectionAnchor.current = {
        scrollLeft: viewport.scrollLeft,
        viewportWidth: viewport.clientWidth,
        previousWidth: geometry.width,
      }
    }
    setDirection(nextDirection)
    setHoveredBase(null)
    setSelectedBases(null)
    setSearchHitIndex(0)
    if (nextDirection !== direction && searchQuery.trim()) {
      // Either flip re-renders the reverse complement of the currently displayed calls.
      const nextSequence = reverseComplement(calledSequence)
      pendingSelectionReveal.current = searchHitRangeIn(searchQuery, nextSequence)
    }
    selectionAnchor.current = null
    clearOwnedSequenceSelection()
  }
  const changeHorizontalZoom = (nextZoom: number) => {
    const viewport = scrollRef.current
    if (viewport && nextZoom !== horizontalZoom) {
      pendingHorizontalAnchor.current = {
        scrollLeft: viewport.scrollLeft,
        viewportWidth: viewport.clientWidth,
        previousZoom: horizontalZoom,
      }
    }
    setHorizontalZoom(nextZoom)
  }

  const hitOrdinalAtPointer = (clientX: number) => {
    const bounds = sequenceBandRef.current?.getBoundingClientRect()
    if (!geometry || !bounds || geometry.hitSegments.length === 0) return -1
    const x = clientX - bounds.left
    const hit = geometry.hitSegments.find((segment) => x >= segment.start && x < segment.end)
      ?? geometry.hitSegments.reduce((nearest, segment) => Math.abs(segment.center - x) < Math.abs(nearest.center - x) ? segment : nearest)
    return geometry.bases.findIndex((base) => base.index === hit.index)
  }

  const setNativeSequenceRange = useCallback((anchor: number, focus: number, selectSingleBase = false) => {
    const safeAnchor = Math.max(0, Math.min(calledSequence.length, anchor))
    const safeFocus = Math.max(0, Math.min(calledSequence.length, focus))
    const start = Math.min(safeAnchor, safeFocus)
    const end = Math.max(safeAnchor, safeFocus) + 1
    if (safeAnchor === safeFocus && !selectSingleBase) {
      setSelectedBases(null)
    } else {
      setSelectedBases({ start, end: Math.min(calledSequence.length - 1, end - 1) })
    }

    const textNode = sequenceTextRef.current?.firstChild
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    const range = document.createRange()
    if (safeAnchor === safeFocus && !selectSingleBase) {
      range.setStart(textNode, safeFocus)
      range.collapse(true)
    } else {
      range.setStart(textNode, start)
      range.setEnd(textNode, Math.min(calledSequence.length, end))
    }
    selection.addRange(range)
  }, [calledSequence.length])

  const handleSequencePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const ordinal = hitOrdinalAtPointer(event.clientX)
    if (ordinal < 0) return
    event.currentTarget.focus({ preventScroll: true })
    event.preventDefault()
    selectionAnchor.current = ordinal
    const capture = event.currentTarget.setPointerCapture
    if (typeof capture === 'function' && event.pointerId !== undefined) capture.call(event.currentTarget, event.pointerId)
    setHoveredBase(geometry?.bases[ordinal]?.index ?? null)
    setNativeSequenceRange(ordinal, ordinal)
  }

  const handleSequencePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const ordinal = hitOrdinalAtPointer(event.clientX)
    if (ordinal < 0) return
    const base = geometry?.bases[ordinal]
    if (base) setHoveredBase(base.index)
    if (selectionAnchor.current !== null && ordinal !== selectionAnchor.current) {
      setNativeSequenceRange(selectionAnchor.current, ordinal)
    }
  }

  const handleSequencePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    selectionAnchor.current = null
    const release = event.currentTarget.releasePointerCapture
    if (typeof release === 'function' && event.pointerId !== undefined) {
      try { release.call(event.currentTarget, event.pointerId) } catch { /* capture may already have ended */ }
    }
  }

  /** Reveal a displayed-ordinal selection and mirror it as a real text selection. */
  const selectAndRevealOrdinalRange = useCallback((start: number, end: number) => {
    if (!geometry || geometry.hitSegments.length === 0) return
    const length = calledSequence.length
    const clampedStart = Math.max(0, Math.min(length - 1, Math.min(start, end)))
    const clampedEnd = Math.max(0, Math.min(length - 1, Math.max(start, end)))
    const startHit = geometry.hitSegments[clampedStart]
    const endHit = geometry.hitSegments[clampedEnd]
    const searchInputIsFocused = searchInputRef.current === document.activeElement
    if (searchInputIsFocused) {
      setSelectedBases({ start: clampedStart, end: clampedEnd })
    } else {
      setNativeSequenceRange(clampedStart, clampedEnd, true)
    }
    const viewport = scrollRef.current
    if (viewport && startHit && endHit) {
      const center = (startHit.start + endHit.end) / 2
      viewport.scrollLeft = Math.max(0, center - viewport.clientWidth / 2)
    }
  }, [calledSequence.length, geometry, setNativeSequenceRange])

  useLayoutEffect(() => {
    const pending = pendingSelectionReveal.current
    if (!pending || !geometry || !dataReady) return
    pendingSelectionReveal.current = null
    selectAndRevealOrdinalRange(pending.start, pending.end)
  }, [dataReady, direction, geometry, searchQuery, selectAndRevealOrdinalRange])

  useLayoutEffect(() => {
    if (!restoreSearchFocus.current) return
    restoreSearchFocus.current = false
    searchInputRef.current?.focus({ preventScroll: true })
  }, [searchQuery])

  const clearTraceSelection = () => {
    setSelectedBases(null)
    clearOwnedSequenceSelection()
  }

  /** Query edits are event-driven; no-hit results clear the highlight immediately. */
  const searchHitRangeIn = (query: string, sequence: string, index = 0) => {
    const hits = findTraceSearchHits(sequence, query)
    const hit = hits.length ? hits[Math.min(index, hits.length - 1)] : undefined
    return hit === undefined ? null : traceSearchHitRange(hit, query, sequence.length)
  }

  const changeSearchQuery = (nextQuery: string) => {
    setSearchQuery(nextQuery)
    setSearchHitIndex(0)
    if (!nextQuery.trim()) return
    const range = searchHitRangeIn(nextQuery, calledSequence)
    if (range) pendingSelectionReveal.current = range
    else clearTraceSelection()
  }

  const stepSearchHit = (step: -1 | 1) => {
    const next = nextTraceSearchHitIndex(searchHitIndex, step, searchHits.length)
    if (next === null) return
    setSearchHitIndex(next)
    const hit = searchHits[next]
    const range = hit === undefined ? null : traceSearchHitRange(hit, searchQuery, calledSequence.length)
    if (range) selectAndRevealOrdinalRange(range.start, range.end)
  }

  const handleSequenceKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && calledSequence.length > 0) {
      event.preventDefault()
      selectionAnchor.current = null
      setNativeSequenceRange(0, calledSequence.length - 1)
    } else if (event.key === 'Escape') {
      window.getSelection()?.removeAllRanges()
      setSelectedBases(null)
      selectionAnchor.current = null
    }
  }
  const selectedStartHit = selectedBases && geometry ? geometry.hitSegments[selectedBases.start] : null
  const selectedEndHit = selectedBases && geometry ? geometry.hitSegments[selectedBases.end] : null

  return (
    <section className="trace-viewer" aria-label="Trace viewer">
      <header className="trace-viewer__header">
        <div className="trace-viewer__title-wrap">
          <div className="trace-viewer__filename" title={trace?.fileName ?? 'Trace viewer'}>{trace?.fileName ?? 'Trace viewer'}</div>
          {trace && dataReady && <div className="trace-viewer__subtitle">{trace.chromatogram.baseCalls.length.toLocaleString()} bases</div>}
        </div>
        <div className="trace-viewer__header-actions">
          {onOpenAsSequence && <button type="button" className="trace-viewer__open-sequence" onClick={() => onOpenAsSequence(direction)} disabled={!dataReady}>Open as sequence</button>}
          <div className="trace-viewer__direction" role="group" aria-label="Trace direction">
            <button type="button" className={`trace-viewer__direction-button${direction === 'forward' ? ' is-active' : ''}`} aria-pressed={direction === 'forward'} onClick={() => changeDirection('forward')} disabled={!dataReady} title="Show forward direction"><ArrowRight size={15} /><span>Forward</span></button>
            <button type="button" className={`trace-viewer__direction-button${direction === 'reverse' ? ' is-active' : ''}`} aria-pressed={direction === 'reverse'} onClick={() => changeDirection('reverse')} disabled={!dataReady} title="Reverse complement direction"><ArrowLeft size={15} /><span>Reverse</span></button>
          </div>
          <div className="trace-viewer__search" role="search">
            <input
              type="search"
              aria-label="Find bases in trace sequence"
              placeholder="Find bases"
              value={searchQuery}
              ref={searchInputRef}
              onChange={(event) => {
                restoreSearchFocus.current = true
                changeSearchQuery(event.target.value)
              }}
              disabled={!dataReady}
            />
            <span className="trace-viewer__search-count" role="status">
              {searchQuery.trim()
                ? searchHits.length
                  ? `${Math.min(searchHitIndex + 1, searchHits.length)}/${searchHits.length}`
                  : 'No hits'
                : ''}
            </span>
            <button type="button" className="trace-viewer__search-nav" aria-label="Previous search hit" onClick={() => stepSearchHit(-1)} disabled={searchHits.length === 0}>Previous</button>
            <button type="button" className="trace-viewer__search-nav" aria-label="Next search hit" onClick={() => stepSearchHit(1)} disabled={searchHits.length === 0}>Next</button>
          </div>
          <button type="button" className="trace-viewer__icon-button" aria-label="Previous view" title="Scroll left" onClick={() => moveViewport(-1)} disabled={!dataReady}><ChevronLeft size={17} /></button>
          <button type="button" className="trace-viewer__icon-button" aria-label="Next view" title="Scroll right" onClick={() => moveViewport(1)} disabled={!dataReady}><ChevronRight size={17} /></button>
          {onClose && <button type="button" className="trace-viewer__icon-button" aria-label="Close trace viewer" onClick={onClose}><X size={17} /></button>}
        </div>
      </header>

      <main className="trace-viewer__main">
        {resolvedStatus === 'loading' ? (
          <div className="trace-viewer__message" role="status">Loading trace…</div>
        ) : resolvedStatus === 'empty' || !trace ? (
          <div className="trace-viewer__message">Open an AB1 or chromatogram file to view its trace.</div>
        ) : trace.parseError || resolvedStatus === 'error' ? (
          <div className="trace-viewer__message trace-viewer__message--error" role="alert">{trace.parseError ?? 'This trace could not be read.'}</div>
        ) : !dataReady || !geometry || !orientedData ? (
          <div className="trace-viewer__message">No chromatogram signal is available for this file.</div>
        ) : (
          <>
            <div className="trace-viewer__scroll" ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'hidden' }} onMouseLeave={() => setHoveredBase(null)}>
              <svg className={`trace-viewer__chart trace-viewer__chart--${viewerMode}`} width={Math.max(geometry.width, 1)} height={geometry.height} viewBox={`0 0 ${Math.max(geometry.width, 1)} ${geometry.height}`} role="img" aria-label={viewerMode === 'raw' ? `${direction} raw chromatogram scan signals with signed amplitudes` : `${direction} chromatogram with ${geometry.bases.length} called bases`}>
                {geometry.channels.map((channel) => (
                  <g key={channel.base} className={`trace-viewer__channel trace-viewer__channel--${channel.base}`} aria-hidden="true">
                    {viewerMode !== 'raw' && <path d={channel.areaPath} fill={channel.base === 'G' ? 'var(--vg-trace-g-fill)' : tracePeakFillColors[channel.base]} stroke="none" className="trace-viewer__fill" />}
                    <path d={channel.linePath} fill="none" stroke={channel.base === 'G' ? 'var(--vg-trace-g-line)' : tracePeakColors[channel.base]} strokeWidth="1.1" opacity={0.95} className="trace-viewer__signal" />
                  </g>
                ))}
                {viewerMode === 'raw' && <line className="trace-viewer__raw-zero" x1="0" x2={geometry.width} y1={geometry.baseline} y2={geometry.baseline} />}
                {activeMarker && <rect className="trace-viewer__active-marker" x={activeMarker.start} y="0" width={activeMarker.end - activeMarker.start} height={geometry.height} />}
                {geometry.hitSegments.map((segment) => (
                  <rect key={`hit-${segment.index}`} className="trace-viewer__hit-segment" data-index={segment.index} x={segment.start} y="0" width={segment.end - segment.start} height={geometry.height} onMouseEnter={() => setHoveredBase(segment.index)} />
                ))}
                {activeBase && activeHit && (
                  <g className="trace-viewer__tooltip" pointerEvents="none">
                    <rect x={Math.max(2, Math.min(geometry.width - 122, (activeMarker?.center ?? activeHit.center) - 60))} y="12" width="120" height="23" rx="5" />
                    <text x={Math.max(8, Math.min(geometry.width - 116, (activeMarker?.center ?? activeHit.center) - 54))} y="28">{activeBase.base}{activeBase.index + 1} · Quality: {activeBase.quality ?? '—'}</text>
                  </g>
                )}
              </svg>
              {showSequence && <div
                className="trace-viewer__base-sequence"
                ref={sequenceBandRef}
                aria-label="Called base sequence"
                role="textbox"
                aria-readonly="true"
                tabIndex={0}
                style={{ width: geometry.width, height: TRACE_VIEWER_SEQUENCE_HEIGHT }}
                onPointerDown={handleSequencePointerDown}
                onPointerMove={handleSequencePointerMove}
                onPointerUp={handleSequencePointerEnd}
                onPointerCancel={handleSequencePointerEnd}
                onKeyDown={handleSequenceKeyDown}
              >
                <span ref={sequenceTextRef} className="trace-viewer__selection-text" data-selection-layer="native" style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, overflow: 'hidden', opacity: 0, clipPath: 'inset(50%)', contain: 'strict' }}>{calledSequence}</span>
                {selectedStartHit && selectedEndHit && <span className="trace-viewer__selection-highlight" data-selection-visual="custom" data-selection-start={selectedBases?.start} data-selection-end={selectedBases?.end} style={{ left: selectedStartHit.start, width: selectedEndHit.end - selectedStartHit.start }} aria-hidden="true" />}
                {activeMarker && <span className="trace-viewer__sequence-marker" style={{ left: activeMarker.start, width: activeMarker.end - activeMarker.start }} aria-hidden="true" />}
                <span className="trace-viewer__glyph-layer" aria-hidden="true">
                  {geometry.bases.map((base) => (
                    <span key={`glyph-${base.index}`} className={`trace-viewer__base-glyph trace-viewer__base-glyph--${base.base}`} data-base-index={base.index} data-base-x={base.x} style={{ left: base.x }}>{base.base}</span>
                  ))}
                </span>
              </div>}
              <svg className="trace-viewer__detail-band" width={Math.max(geometry.width, 1)} height={geometry.detailHeight} viewBox={`0 0 ${Math.max(geometry.width, 1)} ${geometry.detailHeight}`} aria-label={viewerMode === 'raw' ? 'Raw scan ruler' : 'Quality values and base ruler'}>
                {activeMarker && <rect className="trace-viewer__active-marker" x={activeMarker.start} y="0" width={activeMarker.end - activeMarker.start} height={geometry.detailHeight} />}
                {showSequence && showQuality && geometry.qualityBars.map((bar) => (
                  <rect key={`quality-${bar.index}`} className="trace-viewer__quality-bar" data-index={bar.index} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx="1" />
                ))}
                <line className="trace-viewer__ruler-line" x1="0" x2={geometry.width} y1={geometry.rulerY} y2={geometry.rulerY} />
                {geometry.ruler.map((tick) => (
                  <g key={`tick-${tick.index}`}>
                    <line className={`trace-viewer__ruler-tick${tick.major ? ' is-major' : ''}`} x1={tick.x} x2={tick.x} y1={geometry.rulerY} y2={geometry.rulerY + (tick.major ? 8 : 4)} />
                    {tick.major && <text className="trace-viewer__ruler-label" x={tick.x} y={geometry.detailHeight - 2} textAnchor="middle">{tick.label ?? tick.index + 1}</text>}
                  </g>
                ))}
              </svg>
            </div>
            <div className="trace-viewer__peak-zoom" aria-label="Peak height zoom">
              <span>Peak zoom</span>
              <input aria-label="Peak height zoom" type="range" min="0.5" max="2.5" step="0.1" value={peakZoom} onChange={(event) => setPeakZoom(Number(event.target.value))} />
              <output>{peakZoom.toFixed(1)}×</output>
            </div>
          </>
        )}
      </main>

      <footer className="trace-viewer__footer">
        <div className="trace-viewer__mode-selector" role="group" aria-label="Peak representation">
          {modes.map((item) => <button key={item.id} type="button" className={viewerMode === item.id ? 'is-active' : ''} aria-pressed={viewerMode === item.id} aria-describedby={item.id === 'raw' && !hasRaw ? 'trace-viewer-raw-unavailable' : undefined} title={item.id === 'raw' && !hasRaw ? 'Raw mode unavailable: raw DATA1–4 traces are not present in this file.' : undefined} onClick={() => setMode(item.id)} disabled={!dataReady || (item.id === 'raw' && !hasRaw)}>{item.label}</button>)}
        </div>
        <div className="trace-viewer__legend" aria-label="Signal channel colors">
          {channelOrder.map((base) => <span key={base} className="trace-viewer__legend-item"><i style={{ backgroundColor: base === 'G' ? 'var(--vg-trace-g-line)' : tracePeakColors[base] }} />{base}</span>)}
        </div>
        {showSequence && <label className="trace-viewer__quality-toggle"><input type="checkbox" checked={showQuality} onChange={(event) => setShowQuality(event.target.checked)} disabled={!dataReady || !hasQuality} /> Show quality values</label>}
        {!hasRaw && <span id="trace-viewer-raw-unavailable" className="trace-viewer__sr-only">Raw mode is unavailable because raw DATA1–4 trace samples are not present.</span>}
        <div className="trace-viewer__horizontal-zoom">
          <input aria-label="Horizontal zoom" type="range" min="0.5" max="2.5" step="0.1" value={horizontalZoom} onChange={(event) => changeHorizontalZoom(Number(event.target.value))} disabled={!dataReady} />
          <output>{horizontalZoom.toFixed(1)}×</output>
        </div>
      </footer>
    </section>
  )
}

export default TraceViewer
