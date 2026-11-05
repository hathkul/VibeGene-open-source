import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { ClipboardCopy, ClipboardPaste, Redo2, Undo2 } from 'lucide-react'
import {
  addThreePrimeBase,
  canDeleteSingleStrand,
  canMakeDoubleStranded,
  deleteAtSelection,
  deleteSingleStrand,
  DNA_ENDS_TERMINAL_BASES,
  insertBasesAtSelection,
  isDnaEndBaseVisible,
  makeDoubleStranded,
  modificationLabel,
  normalizeDnaEnds,
  resolveDnaEnds,
  setEndModification,
  terminalRange,
  type DnaEndModification,
  type DnaEndSide,
  type DnaEndsEditorDraft,
  type DnaEndsEditorSelection,
} from './domain/dnaEnds'
import { formatAminoAcidCode, type AminoAcidCodeFormat } from './domain/geneticCode'
import { isOrfFeature } from './domain/orfPrediction'
import { complementDnaBase, formatRange } from './domain/sequence'
import {
  layoutSequenceRow,
  sequenceRowLaneMetrics,
  type SequenceLabelCallout,
} from './domain/sequenceLabelRouter'
import type { RestrictionSite, SequenceFeature, SequenceRecord, Strand } from './domain/types'

type DnaEndsEditorDialogProps = {
  record: SequenceRecord
  restrictionSites?: RestrictionSite[]
  orfFeatures?: SequenceFeature[]
  onCancel: () => void
  onSave: (draft: Pick<DnaEndsEditorDraft, 'sequence' | 'features' | 'dnaEnds'>) => void
}

type ViewToggles = {
  features: boolean
  enzymes: boolean
  primers: boolean
  orfs: boolean
}

const BASE_STEP = 10
const LEFT_LABEL_COL_PX = 28
const RIGHT_LABEL_COL_PX = 40
const STRAND_GAP_PX = 6
/** Left edge of the bases column inside the strand grid (label + gap). */
const BASES_INSET_PX = LEFT_LABEL_COL_PX + STRAND_GAP_PX
const RULER_HEIGHT_PX = 14
const STRAND_GRID_EXTRA_PX = LEFT_LABEL_COL_PX + RIGHT_LABEL_COL_PX + STRAND_GAP_PX * 2

function draftFromRecord(record: SequenceRecord): DnaEndsEditorDraft {
  return {
    sequence: record.sequence,
    features: record.features.map((feature) => ({
      ...feature,
      locations: feature.locations.map((location) => ({ ...location })),
    })),
    dnaEnds: resolveDnaEnds(record),
    selection: null,
  }
}

function EndModificationControls({
  side,
  value,
  addBase,
  onModificationChange,
  onAddBaseChange,
  onAddThreePrime,
}: {
  side: DnaEndSide
  value: DnaEndModification
  addBase: string
  onModificationChange: (modification: DnaEndModification) => void
  onAddBaseChange: (base: string) => void
  onAddThreePrime: () => void
}) {
  const options: DnaEndModification[] = ['unmodified', 'fivePrimePhosphorylated', 'covalentlyClosed']
  return (
    <div className="dna-ends-controls">
      <div className="dna-ends-mod-options">
        {options.map((option) => (
          <label key={option} className="dna-ends-mod-option">
            <input
              type="radio"
              name={`dna-end-mod-${side}`}
              checked={value === option}
              onChange={() => onModificationChange(option)}
            />
            {modificationLabel(option)}
          </label>
        ))}
      </div>
      <div className="dna-ends-add-row">
        <span>Add a single 3′</span>
        <select
          aria-label="Base to add"
          value={addBase}
          onChange={(event) => onAddBaseChange(event.target.value)}
          className="dna-ends-add-select"
        >
          {['A', 'C', 'G', 'T'].map((base) => (
            <option key={base} value={base}>
              {base}
            </option>
          ))}
        </select>
        <button type="button" onClick={onAddThreePrime}>
          Add
        </button>
      </div>
    </div>
  )
}

const CODON_TABLE: Record<string, string> = {
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L',
  CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M',
  GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
  TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S',
  CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T',
  GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*',
  CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K',
  GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W',
  CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R',
  GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
}

function codonToAa(codon: string) {
  return CODON_TABLE[codon.toUpperCase()] ?? 'X'
}

function FeatureTranslationStrip({
  feature,
  sequence,
  rangeStart,
  rangeEnd,
  aminoAcidCodeFormat,
}: {
  feature: SequenceFeature
  sequence: string
  rangeStart: number
  rangeEnd: number
  aminoAcidCodeFormat: AminoAcidCodeFormat
}) {
  const location = feature.locations.find((item) => item.start < rangeEnd && item.end > rangeStart)
  if (!location) return null
  const codonStart = location.strand === 'reverse' ? location.end : location.start
  const residues: Array<{ left: number; label: string }> = []
  for (let position = Math.max(rangeStart, location.start); position < Math.min(rangeEnd, location.end); position += 1) {
    const frameOffset = (((position - codonStart) % 3) + 3) % 3
    if (frameOffset !== 0) continue
    const codon = sequence.slice(position, position + 3)
    if (codon.length < 3) continue
    residues.push({
      left: position - rangeStart,
      label: formatAminoAcidCode(codonToAa(codon), aminoAcidCodeFormat),
    })
  }
  return (
    <div className="dna-ends-aa-row" title={feature.name}>
      {residues.map((residue) => (
        <span
          key={`${feature.id}-${residue.left}`}
          className={`dna-ends-aa${aminoAcidCodeFormat === 'three-letter' ? ' is-three-letter' : ''}`}
          style={{ left: `${residue.left * BASE_STEP}px` }}
        >
          {residue.label}
        </span>
      ))}
    </div>
  )
}

function TerminalRuler({
  side,
  rangeStart,
  length,
  widthPx,
}: {
  side: DnaEndSide
  rangeStart: number
  length: number
  widthPx: number
}) {
  const midY = RULER_HEIGHT_PX / 2
  if (length <= 0) {
    return <svg className="sequence-ruler dna-ends-ruler-svg" width={widthPx} height={RULER_HEIGHT_PX} aria-hidden />
  }
  const firstTickX = 0.5 * BASE_STEP
  const lastTickX = (length - 0.5) * BASE_STEP
  // Same as sequence-view linear ruler: line runs tick-to-tick (no leading/trailing stub).
  return (
    <svg className="sequence-ruler dna-ends-ruler-svg" width={widthPx} height={RULER_HEIGHT_PX} aria-hidden>
      <line x1={firstTickX} y1={midY} x2={lastTickX} y2={midY} className="sequence-ruler-line" />
      {Array.from({ length }, (_, index) => {
        const position = rangeStart + index
        const x = (index + 0.5) * BASE_STEP
        const atPaneStart = index === 0
        const atPaneEnd = index === length - 1
        // Left pane: sequence start is a major terminus. Right pane: sequence end is a major terminus.
        const atSequenceTerminus =
          (side === 'upstream' && atPaneStart) || (side === 'downstream' && atPaneEnd)
        const major = atSequenceTerminus || atPaneStart || atPaneEnd || (position + 1) % 5 === 0
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

function TerminalEnzymeCallouts({
  callouts,
  laneHeight,
  widthPx,
  sideKey,
}: {
  callouts: SequenceLabelCallout[]
  laneHeight: number
  widthPx: number
  sideKey: string
}) {
  if (!callouts.length || laneHeight <= 0) return null
  return (
    <svg
      className="sequence-label-overlay sequence-label-overlay-above dna-ends-enzyme-overlay"
      width={widthPx}
      height={laneHeight}
      aria-hidden={false}
    >
      <g className="sequence-enzyme-leaders" transform={`translate(0, ${laneHeight})`}>
        {callouts.map((callout) => {
          if (!callout.isStackLeader) return null
          return callout.segments.map(([start, end], segmentIndex) => (
            <line
              key={`${callout.stackId}-${segmentIndex}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              className="sequence-label-leader"
            />
          ))
        })}
      </g>
      <g className="sequence-enzyme-labels" transform={`translate(0, ${laneHeight})`}>
        {callouts.map((callout) => (
          <g
            key={`${sideKey}-${callout.side}-${callout.index}-${callout.site.start}-${callout.stackIndex}`}
            className="sequence-label-callout sequence-enzyme-callout"
          >
            <title>{`${callout.site.enzyme.name} ${callout.site.start + 1}`}</title>
            <text
              className="enzyme-callout-name"
              x={callout.labelX}
              y={callout.labelY}
              textAnchor={callout.textAnchor}
              dominantBaseline="alphabetic"
            >
              {callout.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}

function TerminalPane({
  side,
  draft,
  toggles,
  aminoAcidCodeFormat,
  addBase,
  restrictionSites,
  orfFeatures,
  onAddBaseChange,
  onSelect,
  onModification,
  onAddThreePrime,
}: {
  side: DnaEndSide
  draft: DnaEndsEditorDraft
  toggles: ViewToggles
  aminoAcidCodeFormat: AminoAcidCodeFormat
  addBase: string
  restrictionSites: RestrictionSite[]
  orfFeatures: SequenceFeature[]
  onAddBaseChange: (base: string) => void
  onSelect: (selection: DnaEndsEditorSelection | null) => void
  onModification: (modification: DnaEndModification) => void
  onAddThreePrime: () => void
}) {
  const length = draft.sequence.length
  const range = terminalRange(side, length, DNA_ENDS_TERMINAL_BASES)
  const slice = draft.sequence.slice(range.start, range.end)
  const dnaEnds = normalizeDnaEnds(draft.dnaEnds)
  const endState = side === 'upstream' ? dnaEnds.upstream : dnaEnds.downstream
  const selection = draft.selection?.side === side ? draft.selection : null
  const [drag, setDrag] = useState<{ strand: Strand; anchor: number } | null>(null)
  const forwardBasesRef = useRef<HTMLSpanElement | null>(null)
  const reverseBasesRef = useRef<HTMLSpanElement | null>(null)

  const displayFeatures = useMemo(() => {
    const base = toggles.features ? draft.features : []
    const orfs = toggles.orfs ? orfFeatures : []
    return [...base, ...orfs].filter((feature) =>
      feature.locations.some((location) => location.start < range.end && location.end > range.start),
    )
  }, [draft.features, orfFeatures, range.end, range.start, toggles.features, toggles.orfs])

  const translationFeatures = useMemo(
    () => displayFeatures.filter((feature) => feature.translateInSequenceView || isOrfFeature(feature)),
    [displayFeatures],
  )

  const visibleSites = useMemo(() => {
    if (!toggles.enzymes) return []
    return restrictionSites.filter((site) => site.start < range.end && site.end > range.start)
  }, [range.end, range.start, restrictionSites, toggles.enzymes])

  const enzymeRouterInput = useMemo(
    () => ({
      enzymeSites: visibleSites,
      primerSites: [] as RestrictionSite[],
      sequenceLength: Math.max(length, range.end),
      basesPerRow: Math.max(1, slice.length),
      baseStepPx: BASE_STEP,
      trackInsetPx: 0,
      // Match sequence view so labels pack to lane 0 whenever they do not overlap.
      collisionUnitPx: 0,
      leaderStubPx: 8,
      textHeight: 12,
      labelPadding: 6,
      labelWidthForSite: (_site: RestrictionSite, label: string) => label.length * 6,
    }),
    [length, range.end, slice.length, visibleSites],
  )

  const enzymeLayout = useMemo(() => {
    if (!toggles.enzymes || visibleSites.length === 0 || slice.length === 0) return null
    return layoutSequenceRow(0, range.start, slice.length, enzymeRouterInput)
  }, [enzymeRouterInput, range.start, slice.length, toggles.enzymes, visibleSites.length])

  const enzymeLaneHeight = enzymeLayout
    ? sequenceRowLaneMetrics(enzymeLayout, enzymeRouterInput).enzymeLaneHeight
    : 0

  function positionFromEvent(event: ReactPointerEvent<HTMLElement>, strand: Strand): number | null {
    const basesEl = strand === 'forward' ? forwardBasesRef.current : reverseBasesRef.current
    if (!basesEl) return null
    const rect = basesEl.getBoundingClientRect()
    const x = event.clientX - rect.left
    if (slice.length === 0) return range.start
    const firstCell = basesEl.querySelector('.dna-ends-base')
    const measuredStep = firstCell?.getBoundingClientRect().width ?? 0
    const step = measuredStep > 0.5 ? measuredStep : BASE_STEP
    // Round so the right half of the last base places the caret after it (tip),
    // which is required for single-strand overhang typing at the 3′ end.
    const index = Math.max(0, Math.min(slice.length, Math.round(x / step)))
    return range.start + index
  }

  function isSelected(position: number, strand: Strand) {
    if (!selection || selection.strand !== strand) return false
    if (selection.end <= selection.start) return false
    return position >= selection.start && position < selection.end
  }

  function caretAt(position: number, strand: Strand) {
    return Boolean(selection && selection.strand === strand && selection.start === selection.end && selection.start === position)
  }

  function renderBases(strand: Strand, mapBase: (base: string) => string) {
    const nodes: ReactNode[] = []
    if (caretAt(range.start, strand)) {
      nodes.push(<span key={`${strand}-caret-${range.start}`} className="dna-ends-caret" />)
    }
    slice.split('').forEach((base, index) => {
      const position = range.start + index
      const visible = isDnaEndBaseVisible(position, strand, dnaEnds, length)
      const selected = isSelected(position, strand)
      nodes.push(
        <span
          key={`${strand}-${position}`}
          className={`dna-ends-base${selected ? ' is-selected' : ''}${visible ? '' : ' is-hidden'}`}
        >
          {visible ? mapBase(base) : '\u00a0'}
        </span>,
      )
      if (caretAt(position + 1, strand)) {
        nodes.push(<span key={`${strand}-caret-${position + 1}`} className="dna-ends-caret" />)
      }
    })
    return nodes
  }

  function beginSelect(event: ReactPointerEvent<HTMLElement>, strand: Strand) {
    const position = positionFromEvent(event, strand)
    if (position === null) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ strand, anchor: position })
    onSelect({ side, strand, start: position, end: position })
  }

  function moveSelect(event: ReactPointerEvent<HTMLElement>, strand: Strand) {
    if (!drag || event.buttons !== 1 || drag.strand !== strand) return
    const position = positionFromEvent(event, strand)
    if (position === null) return
    const anchor = drag.anchor
    if (position === anchor) {
      onSelect({ side, strand, start: position, end: position })
      return
    }
    if (position > anchor) {
      onSelect({
        side,
        strand,
        start: anchor,
        end: position === range.end ? position : position + 1,
      })
      return
    }
    onSelect({
      side,
      strand,
      start: position,
      end: anchor === range.end ? anchor : anchor + 1,
    })
  }

  const sequenceWidthPx = Math.max(BASE_STEP, slice.length * BASE_STEP)

  return (
    <div className={`dna-ends-pane dna-ends-pane-${side}`}>
      <EndModificationControls
        side={side}
        value={endState.modification}
        addBase={addBase}
        onModificationChange={onModification}
        onAddBaseChange={onAddBaseChange}
        onAddThreePrime={onAddThreePrime}
      />

      <div className="dna-ends-sequence">
        <div className="dna-ends-sequence-center" style={{ width: `${STRAND_GRID_EXTRA_PX + sequenceWidthPx}px` }}>
          <div className="dna-ends-caption">
            {side === 'upstream' ? `Start (${range.start})` : `End (${length})`}
          </div>

          {toggles.enzymes ? (
            <div
              className="dna-ends-enzyme-lane"
              style={{ marginLeft: BASES_INSET_PX, width: sequenceWidthPx, height: Math.max(16, enzymeLaneHeight) }}
            >
              {enzymeLayout ? (
                <TerminalEnzymeCallouts
                  callouts={enzymeLayout.enzymeCallouts}
                  laneHeight={enzymeLaneHeight}
                  widthPx={sequenceWidthPx}
                  sideKey={side}
                />
              ) : null}
            </div>
          ) : null}

          <div className="dna-ends-strand-block">
            {endState.modification === 'covalentlyClosed' ? (
              <span
                className={`dna-end-marker covalent ${side === 'upstream' ? 'left' : 'right'}`}
                aria-label="Covalently closed"
              />
            ) : null}
            {side === 'upstream' && endState.modification === 'fivePrimePhosphorylated' ? (
              <span className="dna-end-marker p left-top" title="5′ phosphorylated" aria-label="5′ phosphorylated">
                P
              </span>
            ) : null}
            {side === 'downstream' && endState.modification === 'fivePrimePhosphorylated' ? (
              <span className="dna-end-marker p right-bottom" title="5′ phosphorylated" aria-label="5′ phosphorylated">
                P
              </span>
            ) : null}

            <div className="dna-ends-strand forward">
              <span className="strand-label">5′</span>
              <span
                ref={forwardBasesRef}
                className="dna-ends-bases"
                onPointerDown={(event) => beginSelect(event, 'forward')}
                onPointerMove={(event) => moveSelect(event, 'forward')}
                onPointerUp={() => setDrag(null)}
              >
                {renderBases('forward', (base) => base)}
              </span>
              <span className="strand-label">3′</span>
            </div>
            <div className="dna-ends-ruler" style={{ marginLeft: BASES_INSET_PX, width: sequenceWidthPx }}>
              <TerminalRuler side={side} rangeStart={range.start} length={slice.length} widthPx={sequenceWidthPx} />
            </div>
            <div className="dna-ends-strand reverse">
              <span className="strand-label">3′</span>
              <span
                ref={reverseBasesRef}
                className="dna-ends-bases"
                onPointerDown={(event) => beginSelect(event, 'reverse')}
                onPointerMove={(event) => moveSelect(event, 'reverse')}
                onPointerUp={() => setDrag(null)}
              >
                {renderBases('reverse', complementDnaBase)}
              </span>
              <span className="strand-label">5′</span>
            </div>
          </div>

          {translationFeatures.length > 0 ? (
            <div className="dna-ends-translation" style={{ marginLeft: BASES_INSET_PX, width: sequenceWidthPx }}>
              {translationFeatures.map((feature) => (
                <FeatureTranslationStrip
                  key={feature.id}
                  feature={feature}
                  sequence={draft.sequence}
                  rangeStart={range.start}
                  rangeEnd={range.end}
                  aminoAcidCodeFormat={aminoAcidCodeFormat}
                />
              ))}
            </div>
          ) : null}

          {toggles.features || toggles.orfs ? (
            <div className="dna-ends-features" style={{ marginLeft: BASES_INSET_PX, width: sequenceWidthPx }}>
              {displayFeatures.map((feature) =>
                feature.locations
                  .filter((location) => location.start < range.end && location.end > range.start)
                  .map((location, index) => {
                    const left = Math.max(location.start, range.start)
                    const right = Math.min(location.end, range.end)
                    return (
                      <div
                        key={`${feature.id}-${index}`}
                        className={`dna-ends-feature${isOrfFeature(feature) ? ' is-orf' : ''}`}
                        style={{
                          left: `${(left - range.start) * BASE_STEP}px`,
                          width: `${Math.max(1, right - left) * BASE_STEP}px`,
                          background: feature.color,
                        }}
                        title={`${feature.name} ${formatRange(location.start, location.end)}`}
                      >
                        {feature.name}
                      </div>
                    )
                  }),
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function sanitizeClipboardDna(text: string) {
  return text.toUpperCase().replace(/[^ACGT]/g, '')
}

export function DnaEndsEditorDialog({
  record,
  restrictionSites = [],
  orfFeatures = [],
  onCancel,
  onSave,
}: DnaEndsEditorDialogProps) {
  const [history, setHistory] = useState<DnaEndsEditorDraft[]>(() => [draftFromRecord(record)])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [addBaseLeft, setAddBaseLeft] = useState('A')
  const [addBaseRight, setAddBaseRight] = useState('A')
  const [toggles, setToggles] = useState<ViewToggles>({
    features: true,
    enzymes: true,
    primers: true,
    orfs: true,
  })
  const [aminoAcidCodeFormat, setAminoAcidCodeFormat] = useState<AminoAcidCodeFormat>('one-letter')
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const draft = history[historyIndex]!
  const draftRef = useRef(draft)
  draftRef.current = draft
  const historyIndexRef = useRef(historyIndex)
  historyIndexRef.current = historyIndex

  function pushDraft(next: DnaEndsEditorDraft) {
    setHistory((current) => [...current.slice(0, historyIndexRef.current + 1), next])
    setHistoryIndex((index) => index + 1)
  }

  const updateDraft = useCallback((updater: (current: DnaEndsEditorDraft) => DnaEndsEditorDraft) => {
    const next = updater(draftRef.current)
    setHistory((current) => [...current.slice(0, historyIndexRef.current + 1), next])
    setHistoryIndex((index) => index + 1)
  }, [])

  function setSelection(selection: DnaEndsEditorSelection | null) {
    setHistory((current) => {
      const copy = [...current]
      const index = historyIndexRef.current
      copy[index] = { ...copy[index]!, selection }
      return copy
    })
  }

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1
  const canDelete = canDeleteSingleStrand(draft)
  const canFill = canMakeDoubleStranded(draft)
  const threeLetter = aminoAcidCodeFormat === 'three-letter'

  const pasteSelection = useCallback(async () => {
    const text = sanitizeClipboardDna(await navigator.clipboard.readText())
    if (!text || !draftRef.current.selection) return
    updateDraft((current) => insertBasesAtSelection(current, text))
  }, [updateDraft])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCancel()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault()
        event.stopPropagation()
        setHistoryIndex((index) => Math.max(0, index - 1))
        return
      }

      if (
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z')
      ) {
        event.preventDefault()
        event.stopPropagation()
        setHistoryIndex((index) => Math.min(history.length - 1, index + 1))
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        event.stopPropagation()
        void copySelection()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        event.stopPropagation()
        void pasteSelection()
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        event.stopPropagation()
        const current = draftRef.current
        if (!current.selection) return
        pushDraft(deleteAtSelection(current, event.key === 'Backspace'))
        return
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && /^[acgtACGT]$/.test(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        const current = draftRef.current
        if (!current.selection) return
        pushDraft(insertBasesAtSelection(current, event.key))
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [history.length, onCancel, pasteSelection])

  async function copySelection() {
    const selection = draftRef.current.selection
    if (!selection || selection.end <= selection.start) return
    const text = draftRef.current.sequence.slice(selection.start, selection.end)
    const payload =
      selection.strand === 'reverse' ? [...text].map(complementDnaBase).reverse().join('') : text
    await navigator.clipboard.writeText(payload)
  }

  return (
    <div className="translation-dialog-backdrop dna-ends-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        ref={dialogRef}
        className="translation-dialog dna-ends-dialog"
        role="dialog"
        aria-labelledby="dna-ends-title"
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="dna-ends-toolbar">
          <strong id="dna-ends-title">Edit DNA ends</strong>
          <div className="dna-ends-toolbar-actions">
            <button type="button" title="Undo" disabled={!canUndo} onClick={() => setHistoryIndex((index) => index - 1)}>
              <Undo2 size={16} />
            </button>
            <button type="button" title="Redo" disabled={!canRedo} onClick={() => setHistoryIndex((index) => index + 1)}>
              <Redo2 size={16} />
            </button>
            <button type="button" title="Copy" onClick={() => void copySelection()}>
              <ClipboardCopy size={16} />
            </button>
            <button type="button" title="Paste" onClick={() => void pasteSelection()}>
              <ClipboardPaste size={16} />
            </button>
          </div>
        </div>

        <div className="dna-ends-body">
          <aside className="dna-ends-view-sidebar" aria-label="Display controls">
            <button
              type="button"
              className={`sidebar-tool-button ${toggles.enzymes ? 'is-active' : ''}`}
              title={toggles.enzymes ? 'Hide enzymes' : 'Show enzymes'}
              aria-pressed={toggles.enzymes}
              onClick={() => setToggles((current) => ({ ...current, enzymes: !current.enzymes }))}
            >
              <img src="/enzyme-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
            </button>
            <button
              type="button"
              className={`sidebar-tool-button ${toggles.features ? 'is-active' : ''}`}
              title={toggles.features ? 'Hide features' : 'Show features'}
              aria-pressed={toggles.features}
              onClick={() => setToggles((current) => ({ ...current, features: !current.features }))}
            >
              <img src="/feature-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
            </button>
            <button
              type="button"
              className={`sidebar-tool-button ${toggles.primers ? 'is-active' : ''}`}
              title={toggles.primers ? 'Hide primers' : 'Show primers'}
              aria-pressed={toggles.primers}
              onClick={() => setToggles((current) => ({ ...current, primers: !current.primers }))}
            >
              <img src="/primer-icon.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
            </button>
            <button
              type="button"
              className={`sidebar-tool-button ${toggles.orfs ? 'is-active' : ''}`}
              title={toggles.orfs ? 'Hide ORFs' : 'Show ORFs'}
              aria-pressed={toggles.orfs}
              onClick={() => setToggles((current) => ({ ...current, orfs: !current.orfs }))}
            >
              <img src="/orf-mode-orfs-only.png" alt="" className="sidebar-tool-icon" width={22} height={22} />
            </button>
            <button
              type="button"
              className={`sidebar-tool-button sidebar-amino-acid-button ${threeLetter ? 'is-active' : ''}`}
              title={threeLetter ? 'Show 1-letter amino acid codes' : 'Show 3-letter amino acid codes'}
              aria-pressed={threeLetter}
              onClick={() => setAminoAcidCodeFormat(threeLetter ? 'one-letter' : 'three-letter')}
            >
              <img
                src={threeLetter ? '/amino-acid-three-letter.png' : '/amino-acid-one-letter.png'}
                alt=""
                className="sidebar-tool-icon"
                width={22}
                height={22}
              />
            </button>
          </aside>

          <div className="dna-ends-panes">
            <TerminalPane
              side="upstream"
              draft={draft}
              toggles={toggles}
              aminoAcidCodeFormat={aminoAcidCodeFormat}
              addBase={addBaseLeft}
              restrictionSites={restrictionSites}
              orfFeatures={orfFeatures}
              onAddBaseChange={setAddBaseLeft}
              onSelect={setSelection}
              onModification={(modification) => updateDraft((current) => setEndModification(current, 'upstream', modification))}
              onAddThreePrime={() => updateDraft((current) => addThreePrimeBase(current, 'upstream', addBaseLeft))}
            />
            <TerminalPane
              side="downstream"
              draft={draft}
              toggles={toggles}
              aminoAcidCodeFormat={aminoAcidCodeFormat}
              addBase={addBaseRight}
              restrictionSites={restrictionSites}
              orfFeatures={orfFeatures}
              onAddBaseChange={setAddBaseRight}
              onSelect={setSelection}
              onModification={(modification) => updateDraft((current) => setEndModification(current, 'downstream', modification))}
              onAddThreePrime={() => updateDraft((current) => addThreePrimeBase(current, 'downstream', addBaseRight))}
            />
          </div>
        </div>

        <div className="dna-ends-footer">
          <div className="dna-ends-selection-actions">
            <span>Selection:</span>
            <button
              type="button"
              disabled={!canDelete}
              onClick={() => updateDraft((current) => deleteSingleStrand(current))}
            >
              Delete Single Strand
            </button>
            <button
              type="button"
              disabled={!canFill}
              onClick={() => updateDraft((current) => makeDoubleStranded(current))}
            >
              Make Double-Stranded
            </button>
          </div>
          <div className="dna-ends-dialog-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() =>
                onSave({
                  sequence: draft.sequence,
                  features: draft.features,
                  dnaEnds: draft.dnaEnds,
                })
              }
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
