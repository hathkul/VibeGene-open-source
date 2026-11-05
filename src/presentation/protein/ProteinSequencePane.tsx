import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { BinderStructureControl } from '../../components/BinderStructureControl'
import { type BinderNumbering, type BinderStructure } from '../../domain/binderStructure'
import { formatProteinMass, aminoAcidInfo, proteinDisplayNumberAt, proteinResiduesPerRow, proteinRulerMarks } from '../../domain/protein'
import { proteinFeaturesOverlappingRange } from '../../domain/proteinFeatures'
import { assignProteinAnnotationLanes, defaultProteinBondColor, proteinBondDescription, proteinBondDisplayLabel, proteinBondLabelCenterOffsets, proteinBondLaneMetrics, proteinBondSegmentsForRow, proteinBondStrokeWidth, type ProteinBondRowSegment } from '../../domain/proteinBonds'
import { formatRange, sanitizeProtein } from '../../domain/sequence'
import { strandColorAtPosition } from '../../domain/snapgeneStrandColors'
import { type SequenceRecord } from '../../domain/types'
import { formatSequenceLength } from '../../domain/moleculeCapabilities'
import { proteinResidueBoundaryAtClientX, proteinResidueBoundaryFromPointer } from '../../domain/proteinSequenceSelection'
import { shouldHandleProteinSequenceEditorKey } from '../../domain/proteinSequenceKeyboard'
import { MOBILE_PROTEIN_SEQUENCE_TOUCH_HINT } from '../../ui/mobilePairSelection'
import { matchesMobileShellViewport } from '../../ui/mobileShellMedia'
import { MapZoomStrip, mapZoomCaretPosition } from '../map'
import { contrastTextColor, featureDisplayName } from '../map/mapPrimitives'
import { SequenceMinimap } from '../sequence'
import {
  defaultProteinClassColorPalette,
  defaultProteinResidueColorPalette,
  normalizeProteinColorMode,
  type DisplaySettings,
  type ProteinColorCode,
  type SelectionRange,
} from '../sequence'
import { ProteinSequenceVisualControlsPanel } from './ProteinVisualControls'
import type { ProteinSequenceVisualSettings } from './proteinVisualSettings'
import { proteinTranslationOriginLabel } from './proteinShared'

export function ProteinSequenceBondLayer({
  rowStart,
  rowLength,
  segments,
  annotationLaneHeightPx,
  bondSpacingPx,
  bondLabelFontSizePx,
  cellWidthEm,
  residueFontSizePx,
  selectedBondId,
  onBondSelect,
  onBondEdit,
}: {
  rowStart: number
  rowLength: number
  segments: Array<ProteinBondRowSegment & { lane: number }>
  annotationLaneHeightPx: number
  bondSpacingPx: number
  bondLabelFontSizePx: number
  cellWidthEm: number
  residueFontSizePx: number
  selectedBondId: string | null
  onBondSelect: (bondId: string) => void
  onBondEdit: (bondId: string) => void
}) {
  const bondTracksRef = useRef<HTMLDivElement | null>(null)
  const [stackHeightPx, setStackHeightPx] = useState(0)
  const labeledSegments = segments
  const cellWidthPx = Math.max(1, residueFontSizePx * cellWidthEm)
  const laneMetrics = useMemo(
    () => proteinBondLaneMetrics(bondSpacingPx, bondLabelFontSizePx),
    [bondLabelFontSizePx, bondSpacingPx],
  )
  const labelOffsets = useMemo(
    () => proteinBondLabelCenterOffsets(labeledSegments, rowStart, rowLength, {
      fontSizePx: bondLabelFontSizePx,
      cellWidthPx,
    }),
    [bondLabelFontSizePx, cellWidthPx, labeledSegments, rowLength, rowStart],
  )

  useLayoutEffect(() => {
    const host = bondTracksRef.current?.closest('.protein-annotation-stack') as HTMLElement | null
    if (!host || typeof ResizeObserver === 'undefined') return
    const update = () => setStackHeightPx(host.clientHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    return () => observer.disconnect()
  }, [annotationLaneHeightPx, labeledSegments.length, rowLength])

  if (!labeledSegments.length) return null

  const { gapPx, barOffsetPx } = laneMetrics
  const laneHeightPx = annotationLaneHeightPx
  const viewHeight = Math.max(0.5, stackHeightPx / cellWidthPx)

  return (
    <>
      {stackHeightPx > 0 ? (
        <svg
          className="protein-bond-connectors"
          viewBox={`0 0 ${rowLength} ${viewHeight}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {labeledSegments.map((segment) => {
            const localStart = segment.start - rowStart
            const localEnd = segment.end - rowStart
            const span = Math.max(1, localEnd - localStart)
            const startX = localStart + (segment.continuesBefore ? 0.7 : 0.5)
            const hasSecondLocalEndpoint = segment.localEndpointCount === 2 && !segment.continuesAfter
            const endX = localStart + (hasSecondLocalEndpoint ? span - 0.5 : span - 0.7)
            const barYPx = segment.lane * laneHeightPx + barOffsetPx
            const barY = Math.max(barYPx / cellWidthPx, 0.05)
            const cornerR = Math.min(
              0.35,
              Math.max(0.15, (endX - startX) / 5),
              Math.max(0.12, barY * 0.15),
            )
            let connectorPath: string
            if (!segment.continuesBefore && hasSecondLocalEndpoint && endX - startX < cornerR * 2) {
              connectorPath = `M ${startX} 0 V ${barY}`
            } else if (!segment.continuesBefore && hasSecondLocalEndpoint) {
              connectorPath = `M ${startX} 0 V ${barY - cornerR} Q ${startX} ${barY} ${startX + cornerR} ${barY} H ${endX - cornerR} Q ${endX} ${barY} ${endX} ${barY - cornerR} V 0`
            } else if (!segment.continuesBefore) {
              connectorPath = `M ${startX} 0 V ${barY - cornerR} Q ${startX} ${barY} ${startX + cornerR} ${barY} H ${endX}`
            } else if (hasSecondLocalEndpoint) {
              connectorPath = `M ${startX} ${barY} H ${endX - cornerR} Q ${endX} ${barY} ${endX} ${barY - cornerR} V 0`
            } else {
              connectorPath = `M ${startX} ${barY} H ${endX}`
            }
            const continuesAfter = segment.continuesAfter || segment.localEndpointCount === 1
            const color = segment.bond.color || defaultProteinBondColor(segment.bond.type)
            return (
              <g
                key={segment.bond.id}
                className={`protein-bond-connector is-${segment.bond.type}${selectedBondId === segment.bond.id ? ' is-selected' : ''}`}
                style={{ color, ['--protein-bond-stroke' as string]: `${proteinBondStrokeWidth(segment.bond)}px` }}
              >
                <path d={connectorPath} vectorEffect="non-scaling-stroke" />
                {segment.continuesBefore && [0.1, 0.3, 0.5].map((x) => (
                  <line
                    className="protein-bond-continuation-dot"
                    key={`before-${x}`}
                    x1={localStart + x}
                    y1={barY}
                    x2={localStart + x}
                    y2={barY + 0.01}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {continuesAfter && [span - 0.5, span - 0.3, span - 0.1].map((x) => (
                  <line
                    className="protein-bond-continuation-dot"
                    key={`after-${x}`}
                    x1={localStart + x}
                    y1={barY}
                    x2={localStart + x}
                    y2={barY + 0.01}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )
          })}
        </svg>
      ) : null}
      <div
        ref={bondTracksRef}
        className="protein-bond-tracks"
        style={{
          ['--protein-bond-track-height' as string]: `${laneHeightPx}px`,
          ['--protein-bond-label-gap' as string]: `${gapPx}px`,
        }}
      >
        {labeledSegments.map((segment) => {
          const localStart = segment.start - rowStart
          const localEnd = segment.end - rowStart
          const centerOffsetCells = labelOffsets.get(segment.bond.id) ?? 0
          const centerOffsetPx = centerOffsetCells * cellWidthPx
          return (
            <button
              type="button"
              key={segment.bond.id}
              className={`protein-bond-track is-${segment.bond.type}${selectedBondId === segment.bond.id ? ' is-selected' : ''}`}
              style={{
                gridColumn: `${localStart + 1} / ${localEnd + 1}`,
                gridRow: segment.lane + 1,
                color: segment.bond.color || defaultProteinBondColor(segment.bond.type),
              }}
              title={proteinBondDescription(segment.bond)}
              aria-label={proteinBondDescription(segment.bond)}
              onClick={() => onBondSelect(segment.bond.id)}
              onDoubleClick={() => onBondEdit(segment.bond.id)}
            >
              {segment.bond.showLabel !== false && !segment.continuesBefore ? (
                <span
                  className="protein-bond-track-label"
                  style={{ transform: `translateX(calc(-50% + ${centerOffsetPx}px))` }}
                >
                  {proteinBondDisplayLabel(segment.bond)}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </>
  )
}

export function ProteinSequencePane({
  record,
  selectedRange,
  motifHits,
  activeHitIndex,
  searchQuery,
  onRangeSelect,
  onSequenceEdit,
  onStatus,
  onUndo,
  onRedo,
  selectedFeatureId,
  selectedBondId,
  onFeatureSelect,
  onFeatureEdit,
  onAnnotateBinder,
  binderNumbering,
  binderStructure,
  onBinderNumberingChange,
  onBinderStructureChange,
  onBondSelect,
  onBondEdit,
  showFeatures,
  showColors,
  showFeatureLabels,
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
  selectedRange: SelectionRange | null
  motifHits: number[]
  activeHitIndex: number
  searchQuery: string
  onRangeSelect: (range: SelectionRange, options?: { collapsed?: boolean }) => void
  onSequenceEdit: (
    sequence: string,
    nextRange: SelectionRange,
    replacement: { start: number; end: number; insertedLength: number },
    detail: string,
  ) => void
  onStatus: (message: string) => void
  onUndo: () => void
  onRedo: () => void
  selectedFeatureId: string | null
  selectedBondId: string | null
  onFeatureSelect: (featureId: string) => void
  onFeatureEdit: (featureId: string) => void
  onAnnotateBinder: (numbering: BinderNumbering) => void
  binderNumbering?: BinderNumbering | null
  binderStructure?: BinderStructure | null
  onBinderNumberingChange?: (numbering: BinderNumbering | null) => void
  onBinderStructureChange?: (structure: BinderStructure | null) => void
  onBondSelect: (bondId: string) => void
  onBondEdit: (bondId: string) => void
  showFeatures: boolean
  showColors: boolean
  showFeatureLabels: boolean
  displaySettings: DisplaySettings
  onDisplaySettingsChange: (updater: (current: DisplaySettings) => DisplaySettings) => void
  onSaveVisualSettings?: () => void
  onRevertVisualSettings?: () => void
  viewRange?: SelectionRange | null
  zoomSliderValue?: number
  onZoomSliderValueChange?: (value: number) => void
  onViewRangeChange?: (range: SelectionRange) => void
}) {
  const visual = displaySettings.proteinSequenceVisual
  const proteinColorMode = normalizeProteinColorMode(displaySettings.proteinColors.mode)
  const proteinClassPalette = displaySettings.proteinColors.classPalette ?? defaultProteinClassColorPalette
  const proteinResiduePalette = displaySettings.proteinColors.residuePalette ?? defaultProteinResidueColorPalette
  const [editing, setEditing] = useState(false)
  const effectiveEditing = editing && !selectedFeatureId && !selectedBondId
  const selectFeature = useCallback((featureId: string) => {
    setEditing(false)
    onFeatureSelect(featureId)
  }, [onFeatureSelect])
  const selectBond = useCallback((bondId: string) => {
    setEditing(false)
    onBondSelect(bondId)
  }, [onBondSelect])
  const [residuesPerRow, setResiduesPerRow] = useState(50)
  const [sequenceOverflowing, setSequenceOverflowing] = useState(false)
  const [localBinderApplication, setLocalBinderApplication] = useState<{
    referenceSequence: string
    numbering: BinderNumbering
  } | null>(null)
  const sequenceViewRef = useRef<HTMLDivElement | null>(null)
  const selectionAnchorRef = useRef<number | null>(null)
  const selectionDragAnchorRef = useRef<number | null>(null)
  const selectionDraggingRef = useRef(false)
  const selectionPointerIdRef = useRef<number | null>(null)
  const selectionCaptureHostRef = useRef<HTMLElement | null>(null)
  const sequenceViewRefCallback = useCallback((node: HTMLDivElement | null) => {
    sequenceViewRef.current = node
    if (node && (selectedFeatureId || selectedBondId)) setEditing(false)
  }, [selectedBondId, selectedFeatureId])
  const queryLength = sanitizeProtein(searchQuery).length
  const hitPositions = useMemo(() => new Set(motifHits), [motifHits])
  const localNumbering = localBinderApplication && localBinderApplication.referenceSequence === record.sequence
    ? localBinderApplication.numbering
    : null
  const numbering = binderNumbering ?? localNumbering
  const numberingSchemeLabel = numbering?.schemeLabel ?? null
  const numberingNeedsAngledLabels = Boolean(
    numbering
    && visual.rulerLabelOrientation === 'horizontal'
    && numbering.positions.some((position) => {
      if (!position) return false
      const estimatedLabelWidth = position.length * visual.rulerFontSizePx * 0.62
      const residueCellWidth = visual.residueFontSizePx * visual.residueCellWidthEm
      return estimatedLabelWidth > residueCellWidth
    }),
  )
  const translationOrigin = proteinTranslationOriginLabel(record)
  const rows = useMemo(() => {
    const result: Array<{ start: number; residues: string[] }> = []
    const rangeStart = viewRange?.start ?? 0
    const rangeEnd = viewRange?.end ?? record.sequence.length
    for (let start = rangeStart; start < rangeEnd; start += residuesPerRow) {
      result.push({ start, residues: [...record.sequence.slice(start, Math.min(rangeEnd, start + residuesPerRow))] })
    }
    return result
  }, [record.sequence, residuesPerRow, viewRange])

  const sequenceVisualStyle = {
    fontSize: `${visual.residueFontSizePx}px`,
    fontWeight: visual.residueFontWeight,
    '--protein-residue-size': `${visual.residueFontSizePx}px`,
    '--protein-residue-weight': String(visual.residueFontWeight),
    '--protein-cell-width': `${visual.residueCellWidthEm}em`,
    '--protein-cell-height': `${visual.residueCellHeightEm}em`,
    '--protein-number-size': `${visual.numberingFontSizePx}px`,
    '--protein-number-weight': String(visual.numberingFontWeight),
    '--protein-number-gutter': `${visual.numberingGutterPx}px`,
    '--protein-ruler-size': `${visual.rulerFontSizePx}px`,
    '--protein-ruler-weight': String(visual.rulerFontWeight),
    '--protein-ruler-label-space': `${
      visual.rulerLabelOrientation === 'vertical'
        ? Math.max(40, visual.rulerFontSizePx * 5.5)
        : visual.rulerLabelOrientation === 'angled'
          ? Math.max(34, visual.rulerFontSizePx * 4.2)
          : 14
    }px`,
    '--protein-feature-track-height': `${visual.featureTrackHeightPx}px`,
    '--protein-feature-label-size': `${visual.featureLabelFontSizePx}px`,
    '--protein-feature-label-weight': String(visual.featureLabelFontWeight),
    '--protein-bond-label-size': `${visual.bondLabelFontSizePx}px`,
    '--protein-bond-label-weight': String(visual.bondLabelFontWeight),
    '--protein-legend-size': `${visual.legendFontSizePx}px`,
  } as CSSProperties

  useLayoutEffect(() => {
    const view = sequenceViewRef.current
    if (!view || typeof ResizeObserver === 'undefined') return
    const updateRows = () => {
      const styles = window.getComputedStyle(view)
      const contentWidth = view.clientWidth
        - Number.parseFloat(styles.paddingLeft || '0')
        - Number.parseFloat(styles.paddingRight || '0')
      const next = proteinResiduesPerRow(
        contentWidth,
        visual.residueFontSizePx,
        10,
        200,
        visual.residueCellWidthEm,
        visual.showNumbering ? visual.numberingGutterPx * 2 : 24,
      )
      setResiduesPerRow((current) => current === next ? current : next)
    }
    updateRows()
    const observer = new ResizeObserver(updateRows)
    observer.observe(view)
    return () => observer.disconnect()
  }, [effectiveEditing, visual.residueCellWidthEm, visual.residueFontSizePx, visual.numberingGutterPx, visual.showNumbering])

  useEffect(() => {
    const view = sequenceViewRef.current
    if (!view) return
    let frame = 0
    const update = () => {
      frame = 0
      const next = view.scrollHeight > view.clientHeight + 1
      setSequenceOverflowing((current) => current === next ? current : next)
    }
    const scheduleUpdate = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }
    scheduleUpdate()
    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(view)
    const mutationObserver = new MutationObserver(scheduleUpdate)
    mutationObserver.observe(view, { childList: true, subtree: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [record.sequence, residuesPerRow, viewRange])

  function patchProteinSequenceVisual(patch: Partial<ProteinSequenceVisualSettings>) {
    onDisplaySettingsChange((current) => ({
      ...current,
      proteinSequenceVisual: { ...current.proteinSequenceVisual, ...patch },
    }))
  }

  useEffect(() => {
    const finishPointerSelection = (event: PointerEvent) => {
      if (selectionPointerIdRef.current === null || event.pointerId !== selectionPointerIdRef.current) return
      selectionDraggingRef.current = false
      selectionPointerIdRef.current = null
      const host = selectionCaptureHostRef.current
      selectionCaptureHostRef.current = null
      if (host?.hasPointerCapture(event.pointerId)) {
        try {
          host.releasePointerCapture(event.pointerId)
        } catch {
          // ignore
        }
      }
    }
    const trackPointerSelection = (event: PointerEvent) => {
      if (!selectionDraggingRef.current) return
      if (selectionPointerIdRef.current === null || event.pointerId !== selectionPointerIdRef.current) return
      const view = sequenceViewRef.current
      if (!view) return
      const boundary = proteinResidueBoundaryFromPointer(event.clientX, event.clientY, view)
      if (boundary === null) return
      const anchor = selectionDragAnchorRef.current ?? boundary
      if (anchor === boundary) {
        onRangeSelect({ start: boundary, end: boundary }, { collapsed: true })
        return
      }
      onRangeSelect({ start: Math.min(anchor, boundary), end: Math.max(anchor, boundary) })
    }
    const cancelPointerSelection = () => {
      selectionDraggingRef.current = false
      selectionPointerIdRef.current = null
      selectionCaptureHostRef.current = null
    }
    window.addEventListener('pointermove', trackPointerSelection)
    window.addEventListener('pointerup', finishPointerSelection)
    window.addEventListener('pointercancel', finishPointerSelection)
    window.addEventListener('blur', cancelPointerSelection)
    return () => {
      window.removeEventListener('pointermove', trackPointerSelection)
      window.removeEventListener('pointerup', finishPointerSelection)
      window.removeEventListener('pointercancel', finishPointerSelection)
      window.removeEventListener('blur', cancelPointerSelection)
    }
  }, [onRangeSelect])

  useEffect(() => {
    if (!effectiveEditing || !selectedRange || selectedRange.end <= record.sequence.length) return
    const position = Math.min(selectedRange.start, record.sequence.length)
    selectionAnchorRef.current = position
    onRangeSelect({ start: position, end: position }, { collapsed: true })
  }, [effectiveEditing, onRangeSelect, record.sequence.length, selectedRange])

  const selectThroughBoundary = useCallback((anchor: number, boundary: number) => {
    if (anchor === boundary) {
      onRangeSelect({ start: boundary, end: boundary }, { collapsed: true })
      return
    }
    onRangeSelect({
      start: Math.min(anchor, boundary),
      end: Math.max(anchor, boundary),
    })
  }, [onRangeSelect])

  const handleResiduePointerDown = useCallback((index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    setEditing(true)
    sequenceViewRef.current?.focus()
    const cell = event.currentTarget
    const rect = cell.getBoundingClientRect()
    const position = proteinResidueBoundaryAtClientX(index, rect.left, rect.width, event.clientX)
    if (event.shiftKey) {
      const anchor = selectionAnchorRef.current ?? selectedRange?.start ?? position
      selectionAnchorRef.current = anchor
      selectThroughBoundary(anchor, position)
    } else {
      selectionAnchorRef.current = position
      onRangeSelect({ start: position, end: position }, { collapsed: true })
    }
    selectionDragAnchorRef.current = position
    selectionDraggingRef.current = true
    selectionPointerIdRef.current = event.pointerId
    const residuesHost = cell.closest('.protein-residues') as HTMLElement | null
    selectionCaptureHostRef.current = residuesHost
    if (residuesHost) {
      try {
        residuesHost.setPointerCapture(event.pointerId)
      } catch {
        // ignore
      }
    }
  }, [onRangeSelect, selectThroughBoundary, selectedRange?.start])

  const handleResidueKeyDown = useCallback((index: number, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setEditing(true)
    selectionAnchorRef.current = index
    onRangeSelect({ start: index, end: index }, { collapsed: true })
    requestAnimationFrame(() => sequenceViewRef.current?.focus())
  }, [onRangeSelect])

  const copySelection = async () => {
    if (!selectedRange || selectedRange.end <= selectedRange.start) {
      onStatus('Select one or more residues first.')
      return
    }
    const selected = record.sequence.slice(selectedRange.start, selectedRange.end)
    try {
      await navigator.clipboard.writeText(selected)
      onStatus(`Copied ${selected.length.toLocaleString()} aa.`)
    } catch {
      onStatus('Could not copy the selected residues.')
    }
  }

  const editRange = () => {
    const start = Math.max(0, Math.min(record.sequence.length, selectedRange?.start ?? 0))
    const end = Math.max(start, Math.min(record.sequence.length, selectedRange?.end ?? start))
    return { start, end }
  }

  const replaceSelection = (input: string) => {
    const insert = sanitizeProtein(input).toUpperCase()
    if (!insert) {
      onStatus('Enter valid one-letter amino-acid codes.')
      return false
    }
    const range = editRange()
    const sequence = record.sequence.slice(0, range.start) + insert + record.sequence.slice(range.end)
    const caret = range.start + insert.length
    onSequenceEdit(
      sequence,
      { start: caret, end: caret },
      { start: range.start, end: range.end, insertedLength: insert.length },
      range.end > range.start
        ? `Replaced ${range.end - range.start} aa with ${insert.length} aa.`
        : `Inserted ${insert.length} aa.`,
    )
    return true
  }

  const deleteAtSelection = (backspace: boolean) => {
    const range = editRange()
    let start = range.start
    let end = range.end
    if (start === end) {
      if (backspace) {
        if (start === 0) return false
        start -= 1
      } else {
        if (end >= record.sequence.length) return false
        end += 1
      }
    }
    if (record.sequence.length - (end - start) <= 0) {
      onStatus('A protein sequence must contain at least one amino acid.')
      return false
    }
    const sequence = record.sequence.slice(0, start) + record.sequence.slice(end)
    onSequenceEdit(
      sequence,
      { start, end: start },
      { start, end, insertedLength: 0 },
      `Deleted ${end - start} aa.`,
    )
    return true
  }

  const moveCaret = (target: number, extend: boolean) => {
    const position = Math.max(0, Math.min(record.sequence.length, target))
    if (!extend) {
      selectionAnchorRef.current = position
      onRangeSelect({ start: position, end: position }, { collapsed: true })
      return
    }
    const range = editRange()
    const anchor = selectionAnchorRef.current ?? range.start
    selectionAnchorRef.current = anchor
    onRangeSelect({ start: Math.min(anchor, position), end: Math.max(anchor, position) })
  }

  const handleInlineEditKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!shouldHandleProteinSequenceEditorKey(effectiveEditing, selectedFeatureId, selectedBondId)) return
    event.stopPropagation()
    const key = event.key
    const command = event.ctrlKey || event.metaKey
    if (command && key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) onRedo()
      else onUndo()
      return
    }
    if (command && key.toLowerCase() === 'y') {
      event.preventDefault()
      onRedo()
      return
    }
    if (command && key.toLowerCase() === 'c') {
      event.preventDefault()
      void copySelection()
      return
    }
    if (command && key.toLowerCase() === 'v') {
      event.preventDefault()
      void navigator.clipboard.readText()
        .then((text) => replaceSelection(text))
        .catch(() => onStatus('Could not read clipboard.'))
      return
    }
    if (command && key.toLowerCase() === 'a') {
      event.preventDefault()
      selectionAnchorRef.current = 0
      onRangeSelect({ start: 0, end: record.sequence.length })
      return
    }
    if (key === 'Escape') {
      event.preventDefault()
      setEditing(false)
      return
    }
    if (key === 'Backspace' || key === 'Delete') {
      if (deleteAtSelection(key === 'Backspace')) event.preventDefault()
      return
    }
    const range = editRange()
    const caretForDirection = key === 'ArrowLeft' || key === 'ArrowUp' ? range.start : range.end
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault()
      const delta = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : key === 'ArrowUp' ? -residuesPerRow : residuesPerRow
      moveCaret(caretForDirection + delta, event.shiftKey)
      return
    }
    if (key === 'Home' || key === 'End') {
      event.preventDefault()
      const rowStart = Math.floor(caretForDirection / residuesPerRow) * residuesPerRow
      moveCaret(key === 'Home' ? rowStart : Math.min(record.sequence.length, rowStart + residuesPerRow), event.shiftKey)
      return
    }
    if (!command && !event.altKey && key.length === 1 && sanitizeProtein(key)) {
      event.preventDefault()
      replaceSelection(key)
    }
  }

  const displayNumberAt = (index: number) => (
    numbering?.positions[index] ?? String(proteinDisplayNumberAt(index, record.protein, record.features))
  )

  const residuePositionDescription = (index: number) => {
    const numberedPosition = numbering?.positions[index]
    return numberedPosition && numberingSchemeLabel
      ? `${numberingSchemeLabel} ${numberedPosition} (sequence ${index + 1})`
      : String(proteinDisplayNumberAt(index, record.protein, record.features))
  }

  const rulerMarksForRow = (rowStart: number, rowLength: number) => (
    proteinRulerMarks(rowStart, rowLength, record.protein, record.features).map((mark) => {
      const numberedPosition = numbering?.positions[mark.index]
      if (!numberedPosition) return { ...mark, label: String(mark.number) }
      const numericPosition = Number.parseInt(numberedPosition.replace(/^[A-Za-z]*\.?/, ''), 10)
      return {
        ...mark,
        label: numberedPosition,
        major: /[A-Za-z]/.test(numberedPosition) || (!Number.isNaN(numericPosition) && numericPosition % 5 === 0),
      }
    })
  )

  const caretPosition = effectiveEditing && selectedRange && selectedRange.start === selectedRange.end
    ? selectedRange.start
    : null

  return (
    <div className={`protein-foundation-pane${viewRange ? ' is-zoomed' : ''}${sequenceOverflowing ? ' has-sequence-minimap' : ''}`}>
      {visual.panelOpen ? (
        <ProteinSequenceVisualControlsPanel
          settings={visual}
          onChange={patchProteinSequenceVisual}
          onSave={onSaveVisualSettings}
          onRevert={onRevertVisualSettings}
        />
      ) : null}
      <div className="protein-foundation-header">
        <div className="protein-summary" aria-label="Protein summary">
          <strong>{record.name}</strong>
          <span>{formatSequenceLength(record.sequence.length, record.molecule)}</span>
          <span>Average mass: {formatProteinMass(record.sequence)}</span>
          <span>{record.features.length.toLocaleString()} features</span>
          <span>{(record.protein?.bonds.length ?? 0).toLocaleString()} bonds</span>
          {translationOrigin ? <span>{translationOrigin}</span> : null}
        </div>
        <BinderStructureControl
          sequence={record.sequence}
                numbering={numbering}
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
          sequenceLength={record.sequence.length}
          annotationFeatures={record.features}
          viewRange={viewRange}
          caretPosition={mapZoomCaretPosition(selectedRange, record.sequence.length)}
          sliderValue={zoomSliderValue}
          onSliderValueChange={onZoomSliderValueChange}
          onViewRangeChange={onViewRangeChange}
        />
      ) : null}
      {!viewRange && sequenceOverflowing ? (
        <SequenceMinimap
          sequenceLength={record.sequence.length}
          annotationFeatures={showFeatures ? record.features : []}
          restrictionSites={[]}
          selectedRange={selectedRange}
          cutStrandSelection={null}
          hoveredRestrictionSiteKey={null}
          scrollHostRef={sequenceViewRef}
          onNavigate={(position) => onRangeSelect({ start: position, end: position }, { collapsed: true })}
        />
      ) : null}
      {matchesMobileShellViewport() ? (
        <p className="sequence-mobile-touch-hint" role="note">
          {MOBILE_PROTEIN_SEQUENCE_TOUCH_HINT}
        </p>
      ) : null}
      <div
          ref={sequenceViewRefCallback}
          className={`protein-sequence-view${effectiveEditing ? ' is-editing' : ''}${showColors ? '' : ' hide-protein-colors'}${showColors && proteinColorMode === 'user' ? ' protein-user-colors' : ''}${
            visual.rulerLabelOrientation === 'angled' || numberingNeedsAngledLabels
              ? ' is-ruler-angled'
              : visual.rulerLabelOrientation === 'vertical'
                ? ' is-ruler-vertical'
                : ''
          }`}
          style={sequenceVisualStyle}
          aria-label={effectiveEditing ? 'Edit protein sequence' : 'Protein sequence'}
          tabIndex={effectiveEditing ? 0 : -1}
          onKeyDown={handleInlineEditKeyDown}
        >
          {rows.length ? rows.map((row) => (
            <div
              className="protein-sequence-row"
              key={row.start}
              data-row-start={row.start}
              data-row-end={row.start + row.residues.length}
              style={{ gridTemplateColumns: visual.showNumbering
                ? `${visual.numberingGutterPx}px max-content ${visual.numberingGutterPx}px`
                : 'max-content' }}
            >
              {visual.showNumbering ? <span className="protein-row-number">{displayNumberAt(row.start)}</span> : null}
              <div
                className="protein-row-content"
                style={{ ['--protein-row-columns' as string]: row.residues.length } as CSSProperties}
              >
                {visual.showRuler ? (
                  <div className="sequence-translation-ruler-row protein-sequence-ruler-row">
                  <div className="sequence-translation-ruler-labels" aria-hidden>
                    {rulerMarksForRow(row.start, row.residues.length)
                      .filter((mark) => numbering !== null || mark.major)
                      .map((mark) => (
                        <span
                          className="sequence-translation-ruler-label"
                          key={`protein-ruler-label-${mark.index}`}
                          style={{ left: `${((mark.offset + 0.5) / row.residues.length) * 100}%` }}
                        >
                          {mark.label}
                        </span>
                      ))}
                  </div>
                  <svg
                    className="sequence-translation-ruler"
                    width="100%"
                    height="8"
                    viewBox={`0 0 ${row.residues.length} 8`}
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    <line
                      x1="0.5"
                      y1="4"
                      x2={Math.max(0.5, row.residues.length - 0.5)}
                      y2="4"
                      className="sequence-translation-ruler-line"
                      vectorEffect="non-scaling-stroke"
                    />
                    {rulerMarksForRow(row.start, row.residues.length).map((mark) => {
                      const half = mark.major ? 3 : 1.5
                      return (
                        <line
                          key={`protein-ruler-tick-${mark.index}`}
                          x1={mark.offset + 0.5}
                          y1={4 - half}
                          x2={mark.offset + 0.5}
                          y2={4 + half}
                          className={mark.major ? 'sequence-translation-ruler-tick-major' : 'sequence-translation-ruler-tick-minor'}
                          vectorEffect="non-scaling-stroke"
                        />
                      )
                    })}
                  </svg>
                  </div>
                ) : null}
                <div className="protein-residues">
                {row.residues.map((residue, offset) => {
                  const index = row.start + offset
                  const info = aminoAcidInfo(residue)
                  const selected = Boolean(selectedRange && index >= selectedRange.start && index < selectedRange.end)
                  const hit = motifHits.some((start) => index >= start && index < start + queryLength)
                  const activeHitStart = motifHits[activeHitIndex]
                  const activeHit = activeHitStart !== undefined && index >= activeHitStart && index < activeHitStart + queryLength
                  const caretBefore = caretPosition === index
                  const caretAfter = caretPosition === record.sequence.length && index === record.sequence.length - 1
                  const paintedColor = proteinColorMode === 'user'
                    ? strandColorAtPosition(record.protein?.userColors, index, 'forward', record.sequence.length, record.topology)
                    : undefined
                  const customColor = showColors
                    ? (proteinColorMode === 'class'
                        ? proteinClassPalette[info.className]
                        : proteinColorMode === 'residue'
                          ? proteinResiduePalette[(residue.toUpperCase() in proteinResiduePalette ? residue.toUpperCase() : 'X') as ProteinColorCode]
                          : paintedColor)
                    : undefined
                  return (
                    <button
                      type="button"
                      key={index}
                      tabIndex={effectiveEditing ? -1 : 0}
                      className={`protein-residue is-${info.className}${customColor ? ' has-custom-color' : ''}${selected ? ' is-selected' : ''}${hit ? ' is-search-hit' : ''}${activeHit ? ' is-active-hit' : ''}${caretBefore ? ' is-caret-before' : ''}${caretAfter ? ' is-caret-after' : ''}`}
                      style={customColor ? ({
                        ['--protein-residue-color' as string]: customColor,
                        ['--protein-residue-ink' as string]: contrastTextColor(customColor),
                      } as CSSProperties) : undefined}
                      title={`${info.name} (${info.threeLetter}) · residue ${residuePositionDescription(index)}`}
                      aria-label={`${info.name}, residue ${residuePositionDescription(index)}`}
                      data-residue-index={index}
                      data-hit-start={hitPositions.has(index) || undefined}
                      onPointerDown={(event) => handleResiduePointerDown(index, event)}
                      onKeyDown={(event) => handleResidueKeyDown(index, event)}
                    >
                      {residue}
                    </button>
                  )
                })}
                </div>
                {(() => {
                  const rowEnd = row.start + row.residues.length
                  const featureSpans = proteinFeaturesOverlappingRange(showFeatures ? record.features : [], row.start, rowEnd)
                    .flatMap((feature) => feature.locations
                      .map((location, locationIndex) => ({ feature, location, locationIndex }))
                      .filter(({ location }) => location.start < rowEnd && row.start < location.end)
                      .map((item) => ({
                        ...item,
                        kind: 'feature' as const,
                        start: Math.max(row.start, item.location.start),
                        end: Math.min(rowEnd, item.location.end),
                      })))
                  const bondSpans = displaySettings.proteinBonds.visible
                    ? proteinBondSegmentsForRow(
                        (record.protein?.bonds ?? []).filter((bond) => bond.visible !== false),
                        row.start,
                        rowEnd,
                      ).map((segment) => ({ ...segment, kind: 'bond' as const }))
                    : []
                  const packed = assignProteinAnnotationLanes([...featureSpans, ...bondSpans])
                  const packedFeatures = packed.filter((item) => item.kind === 'feature')
                  const packedBonds = packed.filter((item) => item.kind === 'bond')
                  const laneCount = packed.reduce((max, item) => Math.max(max, item.lane + 1), 0)
                  const bondMetrics = proteinBondLaneMetrics(visual.bondTrackHeightPx, visual.bondLabelFontSizePx)
                  const annotationLaneHeightPx = Math.max(visual.featureTrackHeightPx + 2, bondMetrics.laneHeightPx)

                  return (
                    <div
                      className="protein-annotation-stack"
                      style={{
                        minHeight: laneCount ? `${laneCount * annotationLaneHeightPx}px` : undefined,
                        ['--protein-annotation-lane-height' as string]: `${annotationLaneHeightPx}px`,
                      }}
                    >
                      <div className="protein-feature-tracks">
                        {packedFeatures.map(({ feature, location, locationIndex, start, end, lane }) => {
                          const localStart = start - row.start
                          const localEnd = end - row.start
                          const noColor = feature.color === 'nocolor'
                          return (
                            <button
                              type="button"
                              key={`${feature.id}-${locationIndex}`}
                              className={`protein-feature-track${noColor ? ' is-nocolor' : ''}${visual.featureBodyFrame && !noColor ? ' has-frame' : ''}${selectedFeatureId === feature.id ? ' is-selected' : ''}`}
                              style={{
                                gridColumn: `${localStart + 1} / ${localEnd + 1}`,
                                gridRow: lane + 1,
                                ...(noColor
                                  ? {}
                                  : {
                                      backgroundColor: feature.color,
                                      color: contrastTextColor(feature.color),
                                    }),
                              }}
                              title={`${featureDisplayName(feature)} · ${formatRange(location.start, location.end)} — double-click for feature properties`}
                              onClick={() => selectFeature(feature.id)}
                              onDoubleClick={() => onFeatureEdit(feature.id)}
                            >
                              {showFeatureLabels && localEnd - localStart >= 4 ? (
                                noColor
                                  ? <span className="protein-feature-nocolor-label">{featureDisplayName(feature)}</span>
                                  : featureDisplayName(feature)
                              ) : ''}
                            </button>
                          )
                        })}
                      </div>
                      <ProteinSequenceBondLayer
                        rowStart={row.start}
                        rowLength={row.residues.length}
                        segments={packedBonds}
                        annotationLaneHeightPx={annotationLaneHeightPx}
                        bondSpacingPx={visual.bondTrackHeightPx}
                        bondLabelFontSizePx={visual.bondLabelFontSizePx}
                        cellWidthEm={visual.residueCellWidthEm}
                        residueFontSizePx={visual.residueFontSizePx}
                        selectedBondId={selectedBondId}
                        onBondSelect={selectBond}
                        onBondEdit={onBondEdit}
                      />
                    </div>
                  )
                })()}
              </div>
              {visual.showNumbering ? (
                <span className="protein-row-number is-end">
                  {displayNumberAt(Math.min(record.sequence.length - 1, row.start + row.residues.length - 1))}
                </span>
              ) : null}
            </div>
          )) : <p className="muted">This protein has no residues.</p>}
      </div>
      {showColors && proteinColorMode === 'class' && visual.showLegend ? (
        <div
          className="protein-color-legend"
          style={{ fontSize: `${visual.legendFontSizePx}px` }}
          aria-label="Amino acid color legend"
        >
          {(['nonpolar', 'polar', 'acidic', 'basic', 'special', 'unknown'] as const).map((className) => (
            <span key={className}><i className={`is-${className}`} style={{ background: proteinClassPalette[className] }} />{className}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Linear sequences open on the linear map; circular sequences keep the circular map. */
