import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent } from 'react'
import { Upload, X } from 'lucide-react'
import { BinderStructureControl } from './BinderStructureControl'
import { buildProteinComparisonLayout, proteinFrameShiftKey } from '../domain/proteinAlignment'
import type { BinderNumbering, BinderStructure } from '../domain/binderStructure'
import {
  addProteinComparisonVariableRegion,
  residueIsInVariableRegion,
  selectionOverlapsVariableRegion,
  subtractProteinComparisonVariableRegion,
  type ProteinReferenceSelection,
} from '../domain/proteinComparisonVariableRegions'
import { parseProteinComparisonFile, parseProteinComparisonText, type ProteinComparisonInputKind } from '../domain/proteinComparisonImport'
import { useProteinComparisonAlignments } from '../presentation/hooks/useProteinComparisonAlignments'
import { createId } from '../domain/sequence'
import { SEQUENCE_OPEN_ACCEPT } from '../domain/fileFormats'
import { bytesToFile, subscribeDesktopFileDrops } from '../desktop/fileIo'
import { desktopDropHitsElement } from '../desktop/desktopDropTarget'
import { isTauriRuntime } from '../desktop/tauriRuntime'
import type {
  ProteinAlignmentColumn,
  ProteinComparisonAlignmentCacheEntry,
  ProteinComparisonLayoutSlot,
  ProteinComparisonSource,
  ProteinComparisonVariableRegion,
  ProteinGuidedAlignment,
} from '../domain/proteinAlignmentTypes'
import type { SequenceRecord } from '../domain/types'
import {
  ProteinAlignmentVisualControlsPanel,
} from '../presentation/protein/ProteinVisualControls'
import type { ProteinAlignmentVisualSettings } from '../presentation/protein/proteinVisualSettings'

const comparisonFileAccept = `.ab1,${SEQUENCE_OPEN_ACCEPT}`

type FrameShiftContextMenuState = {
  x: number
  y: number
  sourceId: string
  sourceName: string
  frameShiftKey: string
}

type OpenSourceContextMenuState = {
  x: number
  y: number
  source: ProteinComparisonSource
  alignment: ProteinGuidedAlignment
}

export type OpenAlignedProteinComparisonSourceRequest = {
  source: ProteinComparisonSource
  as: 'dna' | 'protein'
  alignment: ProteinGuidedAlignment
}

const proteinComparisonStickyNameWidthPx = 280
const proteinComparisonMetaColumnWidthPx = 92
const proteinComparisonMetaColumnCount = 7
const proteinComparisonCodonCellWidthPx = 28
const proteinComparisonCompactCellWidthPx = 20

function alignmentIdentityPercent(alignment: ProteinGuidedAlignment) {
  const compared = alignment.identityCount + alignment.similarCount + alignment.mismatchCount
  return compared ? (alignment.identityCount / compared) * 100 : 0
}

function alignmentSimilarityPercent(alignment: ProteinGuidedAlignment) {
  const compared = alignment.identityCount + alignment.similarCount + alignment.mismatchCount
  return compared ? ((alignment.identityCount + alignment.similarCount) / compared) * 100 : 0
}

type ProteinOverlayNumbering = {
  schemeLabel: string
  positions: Array<string | null>
}

function columnTitle(
  column: ProteinAlignmentColumn | undefined,
  source: ProteinComparisonSource,
  numbering?: ProteinOverlayNumbering | null,
) {
  if (!column) return `${source.name}: not aligned at this reference position`
  const parts = [source.name]
  if (column.referenceIndex !== null) {
    const numberedPosition = numbering?.positions[column.referenceIndex]
    parts.push(numberedPosition
      ? `reference residue ${numbering.schemeLabel} ${numberedPosition} (sequence ${column.referenceIndex + 1})`
      : `reference residue ${column.referenceIndex + 1}`)
  }
  if (column.sourceIndex !== undefined) parts.push(`source residue ${column.sourceIndex + 1}`)
  if (column.nucleotideStart !== undefined && column.nucleotideEnd !== undefined) {
    parts.push(`nucleotides ${column.nucleotideStart + 1}–${column.nucleotideEnd}`)
  }
  if (column.codon) parts.push(`codon ${column.codon}`)
  if (column.frame) parts.push(`frame ${column.frame > 0 ? '+' : ''}${column.frame}`)
  if (column.frameShift) parts.push(`${column.frameShift > 0 ? '+' : '−'}${Math.abs(column.frameShift)} nt frameshift`)
  parts.push(column.event.replace('-', ' '))
  return parts.join(' · ')
}

function columnsForLayout(
  slots: ProteinComparisonLayoutSlot[],
  alignment: ProteinGuidedAlignment,
): Array<ProteinAlignmentColumn | undefined> {
  const referenceColumns = new Map<number, ProteinAlignmentColumn>()
  const insertionColumns = new Map<number, ProteinAlignmentColumn[]>()
  alignment.columns.forEach((column) => {
    if (column.referenceIndex !== null) {
      referenceColumns.set(column.referenceIndex, column)
      return
    }
    const existing = insertionColumns.get(column.referenceBoundary) ?? []
    existing.push(column)
    insertionColumns.set(column.referenceBoundary, existing)
  })
  return slots.map((slot) => slot.kind === 'reference'
    ? referenceColumns.get(slot.referenceIndex)
    : insertionColumns.get(slot.referenceBoundary)?.[slot.insertionIndex])
}

function referenceRulerMarks(
  slots: ProteinComparisonLayoutSlot[],
  numbering?: ProteinOverlayNumbering | null,
) {
  return slots.map((slot) => {
    if (slot.kind !== 'reference') return ''
    return numbering?.positions[slot.referenceIndex] ?? String(slot.referenceIndex + 1)
  })
}

function alignmentNotesLabel(alignment: ProteinGuidedAlignment) {
  if (alignment.gapCount === 0 && alignment.frameShiftCount === 0) return 'clean'
  if (alignment.frameShiftCount === 0) return `${alignment.gapCount} gaps`
  if (alignment.gapCount === 0) return `${alignment.frameShiftCount} fs`
  return `${alignment.gapCount} gaps · ${alignment.frameShiftCount} fs`
}

function sourceKindLabel(source: ProteinComparisonSource) {
  return source.kind === 'protein' ? 'protein' : 'translated DNA'
}

function sourceLengthLabel(source: ProteinComparisonSource) {
  return `${source.sequence.length.toLocaleString()} ${source.kind === 'protein' ? 'aa' : 'nt'}`
}

function sourceOrientationLabel(source: ProteinComparisonSource, alignment?: ProteinGuidedAlignment) {
  if (source.kind === 'protein' || !alignment) return '—'
  return alignment.orientation === 'reverse' ? 'reverse' : 'forward'
}

function ColumnHeaderRow() {
  return (
    <div className="protein-comparison-row is-column-header" role="row">
      <div className="protein-comparison-row-label" role="columnheader">Source</div>
      {['Kind', 'Length', 'Orientation', 'Identity', 'Similarity', 'Score', 'Notes'].map((label) => (
        <div className="protein-comparison-row-meta" role="columnheader" key={label}>{label}</div>
      ))}
      <div className="protein-comparison-column-track" role="columnheader">Reference positions</div>
    </div>
  )
}

function ReferenceRow({
  sequence,
  slots,
  numbering,
  variableRegions,
  selection,
  onResiduePointerDown,
  onResiduePointerEnter,
}: {
  sequence: string
  slots: ProteinComparisonLayoutSlot[]
  numbering: ProteinOverlayNumbering | null
  variableRegions: ProteinComparisonVariableRegion[]
  selection: ProteinReferenceSelection | null
  onResiduePointerDown: (referenceIndex: number, event: React.PointerEvent<HTMLDivElement>) => void
  onResiduePointerEnter: (referenceIndex: number) => void
}) {
  const rulerMarks = useMemo(() => referenceRulerMarks(slots, numbering), [numbering, slots])
  return (
    <div className="protein-comparison-row is-reference">
      <div className="protein-comparison-row-label">
        <div className="protein-comparison-row-visibility" aria-hidden="true" />
        <div className="protein-comparison-row-name">
          <strong>Reference</strong>
        </div>
      </div>
      <div className="protein-comparison-row-meta">protein</div>
      <div className="protein-comparison-row-meta">{sequence.length.toLocaleString()} aa</div>
      <div className="protein-comparison-row-meta">—</div>
      <div className="protein-comparison-row-meta">100.0%</div>
      <div className="protein-comparison-row-meta">100.0%</div>
      <div className="protein-comparison-row-meta">—</div>
      <div className="protein-comparison-row-meta">clean</div>
      <div className="protein-comparison-track">
        <div className="protein-comparison-ruler" style={{ ['--protein-comparison-columns' as string]: slots.length }} aria-hidden="true">
          {rulerMarks.map((label, index) => {
            const slot = slots[index]
            const isVariable = slot.kind === 'reference'
              && residueIsInVariableRegion(slot.referenceIndex, variableRegions)
            return (
              <div className={`protein-comparison-ruler-cell${isVariable ? ' is-variable-region' : ''}`} key={`reference-ruler-${index}`}>
                {label ? <span>{label}</span> : null}
              </div>
            )
          })}
        </div>
        <div className="protein-comparison-cells" style={{ ['--protein-comparison-columns' as string]: slots.length }}>
          {slots.map((slot) => {
            if (slot.kind !== 'reference') return (
              <div className="protein-comparison-cell is-insertion-slot" key={`reference-insertion-${slot.referenceBoundary}-${slot.insertionIndex}`} title="Insertion column">
                <span className="protein-comparison-residue">·</span>
              </div>
            )
            const isVariable = residueIsInVariableRegion(slot.referenceIndex, variableRegions)
            const numberedPosition = numbering?.positions[slot.referenceIndex]
            const isSelected = selection !== null
              && slot.referenceIndex >= selection.start
              && slot.referenceIndex < selection.end
            return (
              <div
                className={`protein-comparison-cell is-reference${isVariable ? ' is-variable-region' : ''}${isSelected ? ' is-reference-selected' : ''}`}
                data-reference-index={slot.referenceIndex}
                key={`reference-${slot.referenceIndex}`}
                title={`Reference residue ${numberedPosition ? `${numbering.schemeLabel} ${numberedPosition} · sequence ${slot.referenceIndex + 1}` : slot.referenceIndex + 1}${isVariable ? ' · variability region' : ''}`}
                onPointerDown={(event) => onResiduePointerDown(slot.referenceIndex, event)}
                onPointerEnter={() => onResiduePointerEnter(slot.referenceIndex)}
              >
                <span className="protein-comparison-residue">{sequence[slot.referenceIndex]}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AlignmentRow({
  source,
  alignment,
  enabled,
  slots,
  showCodons,
  numbering,
  onDisableFrameShift,
  onOpenSource,
  onToggleEnabled,
  onRemove,
}: {
  source: ProteinComparisonSource
  alignment: ProteinGuidedAlignment
  enabled: boolean
  slots: ProteinComparisonLayoutSlot[]
  showCodons: boolean
  numbering: ProteinOverlayNumbering | null
  onDisableFrameShift: (event: React.MouseEvent, frameShiftKey: string, source: ProteinComparisonSource) => void
  onOpenSource: (event: React.MouseEvent, source: ProteinComparisonSource, alignment: ProteinGuidedAlignment) => void
  onToggleEnabled: () => void
  onRemove: () => void
}) {
  const columns = useMemo(() => columnsForLayout(slots, alignment), [alignment, slots])
  const identity = alignmentIdentityPercent(alignment)
  const similarity = alignmentSimilarityPercent(alignment)
  const openTitle = source.kind === 'dna'
    ? 'Open as DNA or protein'
    : 'Open as protein'
  return (
    <div className={`protein-comparison-row${enabled ? '' : ' is-disabled'}`}>
      <div className="protein-comparison-row-label">
        <button
          type="button"
          className="protein-comparison-row-remove"
          aria-label={`Remove ${source.name}`}
          title={`Remove ${source.name}`}
          onClick={onRemove}
        >
          <X size={13} />
        </button>
        <label className="protein-comparison-row-visibility">
          <input
            type="checkbox"
            checked={enabled}
            aria-label={`Show ${source.name}`}
            onChange={onToggleEnabled}
          />
        </label>
        <div className="protein-comparison-row-name">
          <button
            type="button"
            className="protein-comparison-row-open"
            title={`${source.fileName ?? source.name} — ${openTitle}`}
            onClick={(event) => onOpenSource(event, source, alignment)}
          >
            <strong>{source.name}</strong>
          </button>
        </div>
      </div>
      <div className="protein-comparison-row-meta">{sourceKindLabel(source)}</div>
      <div className="protein-comparison-row-meta">{sourceLengthLabel(source)}</div>
      <div className="protein-comparison-row-meta">{sourceOrientationLabel(source, alignment)}</div>
      <div className="protein-comparison-row-meta">{identity.toFixed(1)}%</div>
      <div className="protein-comparison-row-meta">{similarity.toFixed(1)}%</div>
      <div className="protein-comparison-row-meta">{alignment.score}</div>
      <div className="protein-comparison-row-meta">{alignmentNotesLabel(alignment)}</div>
      <div className="protein-comparison-cells" style={{ ['--protein-comparison-columns' as string]: slots.length }}>
        {columns.map((column, index) => {
          const slot = slots[index]
          const residue = column?.sourceResidue ?? (column?.event === 'reference-gap' ? '–' : '')
          const frameShiftKey = column ? proteinFrameShiftKey(alignment, column) : null
          return (
            <div
              className={`protein-comparison-cell${column ? ` is-${column.similarity}` : ' is-unaligned'}${slot.kind === 'insertion' ? ' is-insertion-slot' : ''}${showCodons && source.kind === 'dna' && column?.codon ? ' has-codon' : ''}`}
              key={`${source.id}-${index}`}
              title={columnTitle(column, source, numbering)}
              onContextMenu={frameShiftKey ? (event) => onDisableFrameShift(event, frameShiftKey, source) : undefined}
            >
              <span className="protein-comparison-residue">{residue}</span>
              {showCodons && source.kind === 'dna' && column?.codon ? <small className="protein-comparison-codon">{column.codon}</small> : null}
              {column?.frameShift ? <i>{column.frameShift > 0 ? '+' : '−'}{Math.abs(column.frameShift)}</i> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ProteinAlignmentPane({
  record,
  sources,
  variableRegions,
  onSourcesChange,
  onVariableRegionsChange,
  onAlignmentCacheEntry,
  onAnnotateBinder,
  binderNumbering,
  binderStructure,
  onBinderNumberingChange,
  onBinderStructureChange,
  onStatus,
  displaySettings,
  onDisplaySettingsChange,
  onSaveVisualSettings,
  onRevertVisualSettings,
  onPickFromDatabase,
  onOpenAlignedSource,
  acceptOsFileDrops = true,
}: {
  record: SequenceRecord
  sources: ProteinComparisonSource[]
  variableRegions: ProteinComparisonVariableRegion[]
  onSourcesChange: (sources: ProteinComparisonSource[]) => void
  onVariableRegionsChange: (regions: ProteinComparisonVariableRegion[]) => void
  onAlignmentCacheEntry: (entry: ProteinComparisonAlignmentCacheEntry) => void
  onAnnotateBinder: (numbering: BinderNumbering) => void
  binderNumbering?: BinderNumbering | null
  binderStructure?: BinderStructure | null
  onBinderNumberingChange?: (numbering: BinderNumbering | null) => void
  onBinderStructureChange?: (structure: BinderStructure | null) => void
  onStatus: (message: string) => void
  displaySettings?: {
    proteinAlignmentVisual: ProteinAlignmentVisualSettings
  }
  onDisplaySettingsChange?: (
    updater: (current: { proteinAlignmentVisual: ProteinAlignmentVisualSettings }) => {
      proteinAlignmentVisual: ProteinAlignmentVisualSettings
    },
  ) => void
  onSaveVisualSettings?: () => void
  onRevertVisualSettings?: () => void
  onPickFromDatabase?: () => void
  onOpenAlignedSource?: (request: OpenAlignedProteinComparisonSourceRequest) => void
  /** When false, parent workspace owns OS / HTML5 file drops (browse still works). */
  acceptOsFileDrops?: boolean
}) {
  const visual = displaySettings?.proteinAlignmentVisual
  const [pasteText, setPasteText] = useState('')
  const [pasteKind, setPasteKind] = useState<ProteinComparisonInputKind>('auto')
  const [dragActive, setDragActive] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [showHiddenRows, setShowHiddenRows] = useState(false)
  const [showCodons, setShowCodons] = useState(true)
  const [localBinderApplication, setLocalBinderApplication] = useState<{
    referenceSequence: string
    numbering: BinderNumbering
  } | null>(null)
  const [referenceSelection, setReferenceSelection] = useState<ProteinReferenceSelection | null>(null)
  const [frameShiftContextMenu, setFrameShiftContextMenu] = useState<FrameShiftContextMenuState | null>(null)
  const [openSourceContextMenu, setOpenSourceContextMenu] = useState<OpenSourceContextMenuState | null>(null)
  const dropTargetRef = useRef<HTMLDivElement | null>(null)
  const pasteInputRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollHostRef = useRef<HTMLDivElement | null>(null)
  const frameShiftContextMenuRef = useRef<HTMLDivElement | null>(null)
  const openSourceContextMenuRef = useRef<HTMLDivElement | null>(null)
  const referenceSelectionAnchorRef = useRef<number | null>(null)
  const [horizontalViewport, setHorizontalViewport] = useState({ scrollLeft: 0, width: 0 })
  const localNumbering = localBinderApplication && localBinderApplication.referenceSequence === record.sequence
    ? localBinderApplication.numbering
    : null
  const appliedBinderNumbering = binderNumbering ?? localNumbering
  const numbering: ProteinOverlayNumbering | null = binderNumbering
    ? { schemeLabel: binderNumbering.schemeLabel, positions: binderNumbering.positions }
    : null

  const { entries, pending: alignmentPending } = useProteinComparisonAlignments(
    record.sequence,
    sources,
    variableRegions,
    'Standard',
    record.protein?.comparisonAlignmentCache ?? [],
    onAlignmentCacheEntry,
  )
  const alignments = useMemo(
    () => entries.flatMap((entry) => entry.source.enabled && entry.alignment ? [entry.alignment] : []),
    [entries],
  )
  const slots = useMemo(
    () => buildProteinComparisonLayout(record.sequence.length, alignments),
    [alignments, record.sequence.length],
  )
  const allChecked = sources.length > 0 && sources.every((source) => source.enabled)
  const selectionOverlapsVariability = referenceSelection !== null
    && selectionOverlapsVariableRegion(referenceSelection, variableRegions)
  const visibleEntries = useMemo(
    () => entries.filter((entry) => showHiddenRows || entry.source.enabled),
    [entries, showHiddenRows],
  )
  const stickyNameWidthPx = visual?.stickyNameWidthPx ?? proteinComparisonStickyNameWidthPx
  const showMetaColumns = visual?.showMetaColumns !== false
  const metaColumnCount = showMetaColumns ? proteinComparisonMetaColumnCount : 0
  const trackLeftPx = stickyNameWidthPx + proteinComparisonMetaColumnWidthPx * metaColumnCount
  const cellWidthPx = showCodons
    ? (visual?.cellWidthCodonPx ?? proteinComparisonCodonCellWidthPx)
    : (visual?.cellWidthCompactPx ?? proteinComparisonCompactCellWidthPx)
  const visibleSlotRange = useMemo(() => {
    const visibleTrackStartPx = horizontalViewport.scrollLeft + stickyNameWidthPx - trackLeftPx
    const visibleTrackEndPx = horizontalViewport.scrollLeft + horizontalViewport.width - trackLeftPx
    const start = Math.max(0, Math.floor(visibleTrackStartPx / cellWidthPx))
    const end = Math.max(start, Math.min(slots.length, Math.ceil(visibleTrackEndPx / cellWidthPx)))
    return { start, end }
  }, [cellWidthPx, horizontalViewport, slots.length, stickyNameWidthPx, trackLeftPx])

  const alignmentVisualStyle = {
    '--protein-comparison-name-width': `${stickyNameWidthPx}px`,
    '--protein-comparison-meta-count': String(metaColumnCount),
    '--protein-comparison-meta-width': `${proteinComparisonMetaColumnWidthPx}px`,
    '--protein-comparison-row-height': `${visual?.rowHeightPx ?? 22}px`,
    '--protein-comparison-header-title-size': `${visual?.headerTitleFontSizePx ?? 14}px`,
    '--protein-comparison-header-title-weight': String(visual?.headerTitleFontWeight ?? 700),
    '--protein-comparison-header-subtitle-size': `${visual?.headerSubtitleFontSizePx ?? 10}px`,
    '--protein-comparison-row-name-size': `${visual?.rowNameFontSizePx ?? 11}px`,
    '--protein-comparison-row-name-weight': String(visual?.rowNameFontWeight ?? 600),
    '--protein-comparison-meta-size': `${visual?.metaFontSizePx ?? 8}px`,
    '--protein-comparison-meta-weight': String(visual?.metaFontWeight ?? 600),
    '--protein-comparison-column-header-size': `${visual?.columnHeaderFontSizePx ?? 8}px`,
    '--protein-comparison-column-header-weight': String(visual?.columnHeaderFontWeight ?? 700),
    '--protein-comparison-ruler-size': `${visual?.rulerFontSizePx ?? 7}px`,
    '--protein-comparison-ruler-weight': String(visual?.rulerFontWeight ?? 600),
    '--protein-comparison-residue-size': `${visual?.residueFontSizePx ?? 12}px`,
    '--protein-comparison-residue-weight': String(visual?.residueFontWeight ?? 700),
    '--protein-comparison-codon-size': `${visual?.codonFontSizePx ?? 9}px`,
    '--protein-comparison-codon-weight': String(visual?.codonFontWeight ?? 600),
    '--protein-comparison-frameshift-size': `${visual?.frameshiftBadgeFontSizePx ?? 6}px`,
    '--protein-comparison-legend-size': `${visual?.legendFontSizePx ?? 9}px`,
    '--protein-comparison-cell-width': `${cellWidthPx}px`,
  } as CSSProperties

  function patchAlignmentVisual(patch: Partial<NonNullable<typeof visual>>) {
    if (!onDisplaySettingsChange || !visual) return
    onDisplaySettingsChange((current) => ({
      ...current,
      proteinAlignmentVisual: { ...current.proteinAlignmentVisual, ...patch },
    }))
  }

  function setSourceEnabled(sourceId: string, enabled: boolean) {
    onSourcesChange(sources.map((source) => source.id === sourceId ? { ...source, enabled } : source))
  }

  function disableFrameShift(sourceId: string, frameShiftKey: string) {
    onSourcesChange(sources.map((source) => {
      if (source.id !== sourceId) return source
      const disabledFrameShiftKeys = new Set(source.disabledFrameShiftKeys ?? [])
      disabledFrameShiftKeys.add(frameShiftKey)
      return { ...source, disabledFrameShiftKeys: [...disabledFrameShiftKeys] }
    }))
  }

  function toggleAllSources() {
    const next = !allChecked
    onSourcesChange(sources.map((source) => ({ ...source, enabled: next })))
  }

  function toggleHiddenRows() {
    setShowHiddenRows((current) => !current)
  }

  function beginReferenceSelection(referenceIndex: number, event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const anchor = event.shiftKey && referenceSelection
      ? referenceSelection.start
      : referenceIndex
    referenceSelectionAnchorRef.current = anchor
    setReferenceSelection({
      start: Math.min(anchor, referenceIndex),
      end: Math.max(anchor, referenceIndex) + 1,
    })
  }

  function extendReferenceSelection(referenceIndex: number) {
    const anchor = referenceSelectionAnchorRef.current
    if (anchor === null) return
    setReferenceSelection({
      start: Math.min(anchor, referenceIndex),
      end: Math.max(anchor, referenceIndex) + 1,
    })
  }

  function markReferenceSelectionVariable() {
    if (!referenceSelection) return
    onVariableRegionsChange(addProteinComparisonVariableRegion(
      variableRegions,
      referenceSelection,
      createId('protein-variable-region'),
      record.sequence.length,
    ))
    onStatus(`Marked reference residues ${referenceSelection.start + 1}–${referenceSelection.end} as variable.`)
    setReferenceSelection(null)
  }

  function clearReferenceSelectionVariability() {
    if (!referenceSelection) return
    onVariableRegionsChange(subtractProteinComparisonVariableRegion(
      variableRegions,
      referenceSelection,
      () => createId('protein-variable-region'),
      record.sequence.length,
    ))
    onStatus(`Cleared variability from reference residues ${referenceSelection.start + 1}–${referenceSelection.end}.`)
    setReferenceSelection(null)
  }

  function rowHasVisibleAlignedColumns(alignment: ProteinGuidedAlignment) {
    if (visibleSlotRange.end <= visibleSlotRange.start) return true
    const columns = columnsForLayout(slots, alignment)
    for (let index = visibleSlotRange.start; index < visibleSlotRange.end; index += 1) {
      if (columns[index]) return true
    }
    return false
  }

  const appendSources = useCallback((next: ProteinComparisonSource[]) => {
    if (!next.length) return
    onSourcesChange([...sources, ...next])
    onStatus(`Added ${next.length} comparison sequence${next.length === 1 ? '' : 's'}.`)
  }, [onSourcesChange, onStatus, sources])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    if (importBusy) return
    setImportBusy(true)
    try {
      const parsed: ProteinComparisonSource[] = []
      const failures: string[] = []
      for (const file of Array.from(files)) {
        try {
          parsed.push(await parseProteinComparisonFile(file))
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : 'could not parse'}`)
        }
      }
      appendSources(parsed)
      if (failures.length) onStatus(failures.join(' · '))
    } finally {
      setImportBusy(false)
    }
  }, [appendSources, importBusy, onStatus])

  const addFilesRef = useRef(addFiles)
  useEffect(() => {
    addFilesRef.current = addFiles
  }, [addFiles])

  useEffect(() => {
    if (!acceptOsFileDrops || !isTauriRuntime()) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void subscribeDesktopFileDrops({
      onHoverChange: (active, position) => {
        if (cancelled) return
        if (!active) {
          setDragActive(false)
          return
        }
        setDragActive(desktopDropHitsElement(dropTargetRef.current, position))
      },
      onFiles: async (opened, position) => {
        if (!desktopDropHitsElement(dropTargetRef.current, position)) return
        const files = opened.map((file) => bytesToFile(file.name, file.bytes))
        if (files.length) await addFilesRef.current(files)
      },
    }).then((stop) => {
      if (cancelled) {
        stop()
        return
      }
      unlisten = stop
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [acceptOsFileDrops])

  useLayoutEffect(() => {
    const textarea = pasteInputRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(140, Math.max(30, textarea.scrollHeight))}px`
  }, [pasteText])

  useEffect(() => {
    const referenceIndexAtPointer = (event: PointerEvent) => {
      const cell = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-reference-index]')
      if (!cell || !dropTargetRef.current?.contains(cell)) return null
      const referenceIndex = Number(cell.dataset.referenceIndex)
      return Number.isInteger(referenceIndex) ? referenceIndex : null
    }
    const trackReferenceSelection = (event: PointerEvent) => {
      const anchor = referenceSelectionAnchorRef.current
      if (anchor === null) return
      const referenceIndex = referenceIndexAtPointer(event)
      if (referenceIndex === null) return
      setReferenceSelection({
        start: Math.min(anchor, referenceIndex),
        end: Math.max(anchor, referenceIndex) + 1,
      })
    }
    const finishReferenceSelection = (event: PointerEvent) => {
      trackReferenceSelection(event)
      referenceSelectionAnchorRef.current = null
    }
    const cancelReferenceSelection = () => {
      referenceSelectionAnchorRef.current = null
    }
    window.addEventListener('pointermove', trackReferenceSelection)
    window.addEventListener('pointerup', finishReferenceSelection)
    window.addEventListener('blur', cancelReferenceSelection)
    return () => {
      window.removeEventListener('pointermove', trackReferenceSelection)
      window.removeEventListener('pointerup', finishReferenceSelection)
      window.removeEventListener('blur', cancelReferenceSelection)
    }
  }, [])

  useEffect(() => {
    if (!frameShiftContextMenu) return
    const dismissPointer = (event: PointerEvent) => {
      if (frameShiftContextMenuRef.current?.contains(event.target as Node)) return
      setFrameShiftContextMenu(null)
    }
    const dismissScroll = () => setFrameShiftContextMenu(null)
    const dismissKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFrameShiftContextMenu(null)
    }
    window.addEventListener('pointerdown', dismissPointer)
    window.addEventListener('keydown', dismissKey)
    window.addEventListener('scroll', dismissScroll, true)
    return () => {
      window.removeEventListener('pointerdown', dismissPointer)
      window.removeEventListener('keydown', dismissKey)
      window.removeEventListener('scroll', dismissScroll, true)
    }
  }, [frameShiftContextMenu])

  useEffect(() => {
    if (!openSourceContextMenu) return
    const dismissPointer = (event: PointerEvent) => {
      if (openSourceContextMenuRef.current?.contains(event.target as Node)) return
      setOpenSourceContextMenu(null)
    }
    const dismissScroll = () => setOpenSourceContextMenu(null)
    const dismissKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenSourceContextMenu(null)
    }
    window.addEventListener('pointerdown', dismissPointer)
    window.addEventListener('keydown', dismissKey)
    window.addEventListener('scroll', dismissScroll, true)
    return () => {
      window.removeEventListener('pointerdown', dismissPointer)
      window.removeEventListener('keydown', dismissKey)
      window.removeEventListener('scroll', dismissScroll, true)
    }
  }, [openSourceContextMenu])

  useEffect(() => {
    const host = scrollHostRef.current
    if (!host) return
    const updateViewport = () => {
      setHorizontalViewport({
        scrollLeft: host.scrollLeft,
        width: host.clientWidth,
      })
    }
    updateViewport()
    host.addEventListener('scroll', updateViewport, { passive: true })
    const resizeObserver = new ResizeObserver(updateViewport)
    resizeObserver.observe(host)
    return () => {
      host.removeEventListener('scroll', updateViewport)
      resizeObserver.disconnect()
    }
  }, [])

  function addPastedSequence() {
    try {
      const source = parseProteinComparisonText(pasteText, 'Pasted sequence', pasteKind)
      if (!source) {
        onStatus('Paste a protein or nucleotide sequence first.')
        return
      }
      appendSources([source])
      setPasteText('')
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Could not parse the pasted sequence.')
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) void addFiles(event.target.files)
    event.target.value = ''
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setDragActive(false)
    if (!acceptOsFileDrops || isTauriRuntime()) return
    if (event.dataTransfer.files?.length) void addFiles(event.dataTransfer.files)
  }

  function openFrameShiftContextMenu(event: React.MouseEvent, frameShiftKey: string, source: ProteinComparisonSource) {
    event.preventDefault()
    event.stopPropagation()
    setOpenSourceContextMenu(null)
    setFrameShiftContextMenu({
      x: event.clientX,
      y: event.clientY,
      sourceId: source.id,
      sourceName: source.name,
      frameShiftKey,
    })
  }

  function openAlignedSourceMenu(event: React.MouseEvent, source: ProteinComparisonSource, alignment: ProteinGuidedAlignment) {
    event.preventDefault()
    event.stopPropagation()
    setFrameShiftContextMenu(null)
    if (!onOpenAlignedSource) return
    if (source.kind === 'protein') {
      onOpenAlignedSource({ source, as: 'protein', alignment })
      return
    }
    setOpenSourceContextMenu({
      x: event.clientX,
      y: event.clientY,
      source,
      alignment,
    })
  }

  return (
    <div
      ref={dropTargetRef}
      className={`protein-comparison-pane${dragActive ? ' is-drag-active' : ''}${showMetaColumns ? '' : ' hide-meta-columns'}${visual?.showRuler === false ? ' hide-ruler' : ''}`}
      style={alignmentVisualStyle}
      onDragEnter={(event) => {
        if (!acceptOsFileDrops || isTauriRuntime()) return
        event.preventDefault()
        setDragActive(true)
      }}
      onDragOver={(event) => {
        if (!acceptOsFileDrops || isTauriRuntime()) return
        event.preventDefault()
      }}
      onDragLeave={(event) => {
        if (!acceptOsFileDrops || isTauriRuntime()) return
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setDragActive(false)
      }}
      onDrop={handleDrop}
    >
      {visual?.panelOpen && onDisplaySettingsChange ? (
        <ProteinAlignmentVisualControlsPanel
          settings={visual}
          onChange={patchAlignmentVisual}
          onSave={onSaveVisualSettings}
          onRevert={onRevertVisualSettings}
        />
      ) : null}
      <section className="protein-comparison-workspace">
        {visual?.showHeader !== false ? (
        <header className="protein-comparison-header">
          <div className="protein-comparison-header-copy">
            <strong>Comparative alignment</strong>
            <span>{record.name} is the fixed protein anchor</span>
            <span className="protein-comparison-header-stats">
              {alignments.length} aligned · {sources.length} loaded · {variableRegions.length} variable region{variableRegions.length === 1 ? '' : 's'}{alignmentPending ? ' · aligning…' : ''}
            </span>
            <div className="protein-comparison-header-toggles">
              {sources.length ? (
                <>
                  <button type="button" className="protein-comparison-toggle-all" onClick={toggleAllSources}>
                    {allChecked ? 'Uncheck all' : 'Check all'}
                  </button>
                  <button type="button" className="protein-comparison-toggle-all" onClick={toggleHiddenRows}>
                    {showHiddenRows ? 'Hide' : 'Unhide'}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="protein-comparison-toggle-all"
                disabled={!referenceSelection}
                onClick={markReferenceSelectionVariable}
              >
                Mark variability
              </button>
              <button
                type="button"
                className="protein-comparison-toggle-all"
                disabled={!selectionOverlapsVariability}
                onClick={clearReferenceSelectionVariability}
              >
                Clear variability
              </button>
              <button
                type="button"
                className="protein-comparison-toggle-all"
                aria-pressed={showCodons}
                onClick={() => setShowCodons((current) => !current)}
              >
                Codons {showCodons ? 'on' : 'off'}
              </button>
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
                targetLabel="reference"
              />
              {referenceSelection ? (
                <span>{referenceSelection.start + 1}–{referenceSelection.end} selected</span>
              ) : <span>Drag reference residues to select</span>}
            </div>
          </div>
          <div className="protein-comparison-header-controls">
            <div className="protein-comparison-header-buttons">
              <label className="protein-comparison-header-upload">
                <Upload size={14} />
                <span>{importBusy ? 'Reading files…' : 'Browse files'}</span>
                <input type="file" hidden multiple accept={comparisonFileAccept} onChange={handleFileInput} />
              </label>
              {onPickFromDatabase ? (
                <button type="button" disabled={importBusy} onClick={onPickFromDatabase}>
                  From Database…
                </button>
              ) : null}
              <button type="button" disabled={!pasteText.trim()} onClick={addPastedSequence}>Add comparison</button>
              <select value={pasteKind} onChange={(event) => setPasteKind(event.target.value as ProteinComparisonInputKind)} aria-label="Pasted sequence type">
                <option value="auto">Detect type</option>
                <option value="protein">Protein</option>
                <option value="dna">DNA</option>
              </select>
            </div>
            <textarea
              ref={pasteInputRef}
              className="protein-comparison-header-input"
              value={pasteText}
              placeholder="Paste protein, DNA, or FASTA"
              spellCheck={false}
              rows={1}
              onChange={(event) => setPasteText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  addPastedSequence()
                }
              }}
            />
          </div>
        </header>
        ) : null}
        {sources.length === 0 ? (
          <div className="protein-comparison-empty">
            <strong>Add homologous proteins or coding DNA</strong>
            <p>Drop files anywhere in this window, browse for files, pick from Database, or paste a sequence above the table.</p>
            {onPickFromDatabase ? (
              <button type="button" disabled={importBusy} onClick={onPickFromDatabase}>
                From Database…
              </button>
            ) : null}
          </div>
        ) : (
          <div ref={scrollHostRef} className="protein-comparison-scroll">
            <div
              className="protein-comparison-grid"
              style={{ '--protein-comparison-cell-width': `${cellWidthPx}px` } as CSSProperties}
            >
              <ColumnHeaderRow />
              <ReferenceRow
                sequence={record.sequence}
                slots={slots}
                numbering={numbering}
                variableRegions={variableRegions}
                selection={referenceSelection}
                onResiduePointerDown={beginReferenceSelection}
                onResiduePointerEnter={extendReferenceSelection}
              />
              {visibleEntries.map((entry) => entry.alignment ? (
                rowHasVisibleAlignedColumns(entry.alignment) ? (
                  <AlignmentRow
                    key={entry.source.id}
                    source={entry.source}
                    alignment={entry.alignment}
                    enabled={entry.source.enabled}
                    slots={slots}
                    showCodons={showCodons}
                    numbering={numbering}
                    onDisableFrameShift={openFrameShiftContextMenu}
                    onOpenSource={openAlignedSourceMenu}
                    onToggleEnabled={() => setSourceEnabled(entry.source.id, !entry.source.enabled)}
                    onRemove={() => onSourcesChange(sources.filter((candidate) => candidate.id !== entry.source.id))}
                  />
                ) : null
              ) : (
                <div className="protein-comparison-row is-error" key={entry.source.id}>
                  <div className="protein-comparison-row-label">
                    <button
                      type="button"
                      className="protein-comparison-row-remove"
                      aria-label={`Remove ${entry.source.name}`}
                      title={`Remove ${entry.source.name}`}
                      onClick={() => onSourcesChange(sources.filter((candidate) => candidate.id !== entry.source.id))}
                    >
                      <X size={13} />
                    </button>
                    <label className="protein-comparison-row-visibility">
                      <input
                        type="checkbox"
                        checked={entry.source.enabled}
                        aria-label={`Show ${entry.source.name}`}
                        onChange={() => setSourceEnabled(entry.source.id, !entry.source.enabled)}
                      />
                    </label>
                    <div className="protein-comparison-row-name">
                      <strong>{entry.source.name}</strong>
                    </div>
                  </div>
                  <div className="protein-comparison-row-meta">{sourceKindLabel(entry.source)}</div>
                  <div className="protein-comparison-row-meta">{sourceLengthLabel(entry.source)}</div>
                  <div className="protein-comparison-row-meta">—</div>
                  <div className="protein-comparison-row-meta">—</div>
                  <div className="protein-comparison-row-meta">—</div>
                  <div className="protein-comparison-row-meta">—</div>
                  <div className="protein-comparison-row-meta">
                    {entry.pending
                      ? 'aligning…'
                      : 'error'}
                  </div>
                  <div className="protein-comparison-error">
                    {entry.error ?? (entry.pending ? 'Aligning in background…' : 'No statistically useful local alignment found.')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {visual?.showLegend !== false ? (
          <footer className="protein-comparison-legend">
            <span><i className="is-identity" /> identity</span>
            <span><i className="is-similar" /> conservative substitution</span>
            <span><i className="is-mismatch" /> mismatch</span>
            <span><i className="is-gap" /> gap/insertion</span>
            <span><i className="is-frameshift" /> frameshift</span>
            <span><i className="is-variable-region" /> reference variability</span>
          </footer>
        ) : null}
        {frameShiftContextMenu ? (
          <div
            ref={frameShiftContextMenuRef}
            className="sequence-translation-context-menu"
            role="menu"
            style={{ left: frameShiftContextMenu.x, top: frameShiftContextMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                disableFrameShift(frameShiftContextMenu.sourceId, frameShiftContextMenu.frameShiftKey)
                onStatus(`Disabled frameshift for ${frameShiftContextMenu.sourceName}.`)
                setFrameShiftContextMenu(null)
              }}
            >
              Disable
            </button>
          </div>
        ) : null}
        {openSourceContextMenu && onOpenAlignedSource ? (
          <div
            ref={openSourceContextMenuRef}
            className="sequence-translation-context-menu"
            role="menu"
            style={{ left: openSourceContextMenu.x, top: openSourceContextMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenAlignedSource({
                  source: openSourceContextMenu.source,
                  as: 'dna',
                  alignment: openSourceContextMenu.alignment,
                })
                setOpenSourceContextMenu(null)
              }}
            >
              Open as DNA
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenAlignedSource({
                  source: openSourceContextMenu.source,
                  as: 'protein',
                  alignment: openSourceContextMenu.alignment,
                })
                setOpenSourceContextMenu(null)
              }}
            >
              Open as protein
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
