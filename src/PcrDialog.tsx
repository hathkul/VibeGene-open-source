import { useTraceAlignment } from './presentation/hooks/traceAlignmentContext'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { ConstructSourceSelect } from './cloning/ConstructSourceOptions'
import { ProductNameInput } from './cloning/ProductNameInput'
import { DatabaseConstructPickerDialog } from './cloning/DatabaseConstructPickerDialog'
import {
  MassRestrictionLibraryMembersDialog,
  MassRestrictionLibraryOutputControls,
  MassRestrictionNamesDialog,
  MassRestrictionSourceNavigator,
  type MassRestrictionBatchResult,
  type MassRestrictionSourceChoice,
} from './cloning/MassRestrictionCloningDialogs'
import { constructSourceOptionValue, useConstructSources, type ConstructSourceOption } from './cloning/useConstructSources'
import { MobileCloningLayout } from './MobileCloningLayout'
import { PcrPrimerPairPanel } from './PrimerStructuresPanel'
import { SaveToDatabaseDialog } from './SaveToDatabaseDialog'
import {
  BRIDGE_FRAGMENT_COLORS,
  annotateBridgeFusion,
  createBridgeFragmentRecords,
  createBridgePcrProductRecord,
  designExternalBridgePrimers,
  resolveBridgeFusion,
  type BridgeFragmentProduct,
  type BridgeFusionResult,
} from './domain/bridgePcr'
import {
  defaultBridgeOverlapPrimerOptions,
  designBridgeOverlapPrimersForFragments,
  exportBridgeSelectedPrimersTsv,
  listBridgeAssemblySelectedPrimers,
  listBridgeOverlapPrimerTargets,
  mergeBridgeDesignedPrimersOntoRecord,
  minBridgeAmplifyBp,
  type BridgeFragmentPrimerInput,
  type BridgeOverlapPrimerDesignOptions,
} from './domain/bridgeOverlapPrimers'
import { defaultConstructProperties } from './domain/constructProperties'
import { pickDesktopDirectory, saveTextAs, writeUniqueBytesToDirectory } from './desktop/fileIo'
import { defaultDnaEnds } from './domain/dnaEnds'
import {
  createPcrProductRecord,
  designPcrPrimerPair,
  listPcrAmplicons,
  pcrProductAcknowledgementMessage,
  type PcrAmplicon,
  type PcrPolymeraseMode,
  type PcrPrimerInput,
} from './domain/pcr'
import { effectivePcrAmpliconId } from './application/pcr/effectivePcrAmpliconSelection'
import { SEQUENCE_OPEN_ACCEPT } from './domain/fileFormats'
import { exportSnapGene, isSnapGeneBytes, parseSequenceBytes, parseSnapGene } from './domain/parsers'
import { calculateAnnealTemperature } from './domain/primerThermodynamics'
import { defaultPrimerHybridizationParams } from './domain/primerHybridization'
import type { PrimerHybridizationParams } from './domain/primerHybridization'
import { resolveDisplayableLayoutsForPrimer } from './domain/primerSequenceLayout'
import { addOperation, createId, normalizeDna, reverseComplement } from './domain/sequence'
import type { Primer, SequenceRecord } from './domain/types'
import type { PcrWorkspaceRenderArgs } from './pcrWorkspaceTypes'
import {
  constructNameStem,
  createRestrictionCloningProductLibraryAsync,
  expandRestrictionInsertSources,
} from './domain/restrictionCloningBatch'
import { isTauriRuntime } from './desktop/tauriRuntime'
import { normalizeProjectFileName, saveProject } from './storage/projects'

/** Main map/sequence content pane (excludes sidebar, tabs, search, description). */
const MAIN_VIEW_PANE_SELECTOR = '.snapgene-body .workspace .tab-content .view-main'
const PCR_DIALOG_INSET_FROM_MAIN_PANE_PX = 20

function findVisibleMainViewPane(): HTMLElement | null {
  const panes = document.querySelectorAll(MAIN_VIEW_PANE_SELECTOR)
  for (const pane of panes) {
    if (!(pane instanceof HTMLElement)) continue
    if (pane.closest('.tab-panel-hidden')) continue
    const rect = pane.getBoundingClientRect()
    if (rect.width < 40 || rect.height < 40) continue
    return pane
  }
  return null
}

function sizePcrDialogToMainPane(dialog: HTMLElement) {
  const pane = findVisibleMainViewPane()
  if (!pane) return
  const rect = pane.getBoundingClientRect()
  const maxWidth = Math.max(320, window.innerWidth - 32)
  const maxHeight = Math.max(240, window.innerHeight - 32)
  const width = Math.min(maxWidth, Math.max(480, Math.round(rect.width) - PCR_DIALOG_INSET_FROM_MAIN_PANE_PX))
  const height = Math.min(maxHeight, Math.max(360, Math.round(rect.height) - PCR_DIALOG_INSET_FROM_MAIN_PANE_PX))
  dialog.style.width = `${width}px`
  dialog.style.height = `${height}px`
}

type PcrDialogProps = {
  primerHybridization?: PrimerHybridizationParams
  active?: boolean
  currentRecord: SequenceRecord
  currentTabId: string
  initialSelectedRange: { start: number; end: number } | null
  initialPrimerIds?: string[]
  onCancel: () => void
  onPcr: (
    products: SequenceRecord[],
    options?: {
      open?: boolean
      statusMessage?: string
      batchResult?: MassRestrictionBatchResult
    },
  ) => void
  renderWorkspace: (args: PcrWorkspaceRenderArgs) => ReactNode
}

type PrimerDraft = PcrPrimerInput & {
  sourcePrimerId: string | null
}

type PcrFragmentState = {
  id: string
  templateRecord: SequenceRecord | null
  selectedRange: { start: number; end: number } | null
  forwardPrimer: PrimerDraft
  reversePrimer: PrimerDraft
  polymerase: PcrPolymeraseMode
  selectedAmpliconId: string | null
  makeFile: boolean
  makeFileName: string
}

type ActivePartId = `fragment-${number}` | 'fused'

const MASS_PCR_TEMPLATE_NAME_TOKEN = '<template_name>'

function addMassPcrNameToken(template: string) {
  if (/<template_name>/i.test(template)) return template
  if (template === 'Amplified.dna') return `Amplified ${MASS_PCR_TEMPLATE_NAME_TOKEN}.dna`
  return /\.dna$/i.test(template)
    ? template.replace(/\.dna$/i, ` ${MASS_PCR_TEMPLATE_NAME_TOKEN}.dna`)
    : `${template} ${MASS_PCR_TEMPLATE_NAME_TOKEN}`
}

function renderMassPcrName(template: string, sourceName: string) {
  return template.replace(
    /<template_name>/gi,
    constructNameStem(sourceName, 'Template'),
  )
}

function removeMassPcrNameToken(template: string) {
  const next = template.replace(/\s*<template_name>/gi, '').trim()
  return next || 'Amplified.dna'
}

function formatTm(sequence: string) {
  const result = calculateAnnealTemperature(sequence)
  if (result.tmC !== null) return `${result.tmC.toFixed(1)} C`
  if (result.tmMinC !== null && result.tmMaxC !== null) return `${result.tmMinC.toFixed(1)}-${result.tmMaxC.toFixed(1)} C`
  return 'Tm n/a'
}

function formatRange(start: number, end: number) {
  return `${start + 1} .. ${end}`
}

function defaultPrimerDraft(label: string): PrimerDraft {
  return { sourcePrimerId: null, name: label, sequence: '', phosphorylated: false }
}

function primerDraftFromPrimer(primer: Primer, fallbackName: string): PrimerDraft {
  return {
    sourcePrimerId: primer.id,
    name: primer.name || fallbackName,
    sequence: primer.sequence,
    phosphorylated: false,
  }
}

function createFragmentState(
  index: number,
  template: SequenceRecord | null,
  options?: {
    selectedRange?: { start: number; end: number } | null
    forwardPrimer?: PrimerDraft
    reversePrimer?: PrimerDraft
  },
): PcrFragmentState {
  return {
    id: createId('pcr-frag'),
    templateRecord: template,
    selectedRange: options?.selectedRange ?? null,
    forwardPrimer: options?.forwardPrimer ?? defaultPrimerDraft('Primer 1'),
    reversePrimer: options?.reversePrimer ?? defaultPrimerDraft('Primer 2'),
    polymerase: 'blunt',
    selectedAmpliconId: null,
    makeFile: false,
    makeFileName: `Fragment ${index + 1}.dna`,
  }
}

function buildPreviewRecord(template: SequenceRecord | null, forward: PrimerDraft, reverse: PrimerDraft): SequenceRecord | null {
  if (!template) return null
  const extras: Primer[] = []
  if (normalizeDna(forward.sequence)) {
    const source = forward.sourcePrimerId
      ? template.primers.find((primer) => primer.id === forward.sourcePrimerId)
      : undefined
    extras.push({
      id: forward.sourcePrimerId ?? 'pcr-forward-preview',
      name: forward.name || 'Primer 1',
      sequence: normalizeDna(forward.sequence),
      color: '#2563eb',
      bindings: source?.bindings,
    })
  }
  if (normalizeDna(reverse.sequence)) {
    const source = reverse.sourcePrimerId
      ? template.primers.find((primer) => primer.id === reverse.sourcePrimerId)
      : undefined
    extras.push({
      id: reverse.sourcePrimerId ?? 'pcr-reverse-preview',
      name: reverse.name || 'Primer 2',
      sequence: normalizeDna(reverse.sequence),
      color: '#db2777',
      bindings: source?.bindings,
    })
  }
  const retained = template.primers.filter(
    (primer) => primer.id !== forward.sourcePrimerId && primer.id !== reverse.sourcePrimerId,
  )
  return { ...template, primers: [...retained, ...extras] }
}

function buildFusedPreviewRecord(
  fusion: BridgeFusionResult,
  fragmentProducts: BridgeFragmentProduct[],
  forward: PrimerDraft,
  reverse: PrimerDraft,
): SequenceRecord | null {
  if (!fusion.fusedSequence) return null
  const annotated = annotateBridgeFusion(fusion, fragmentProducts, forward, reverse)
  return {
    id: 'pcr-bridge-preview',
    name: fusion.ready ? 'Fused template' : 'Partial fused template',
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence: fusion.fusedSequence,
    features: annotated.features,
    primers: annotated.primers,
    operations: [],
    construct: { ...defaultConstructProperties, syntheticDna: true },
    dnaEnds: defaultDnaEnds(),
    createdAt: '',
    updatedAt: '',
  }
}

function ChoosePcrPrimersDialog({
  title = 'Choose PCR Primers',
  sequenceLength,
  initialRange,
  initialTm,
  onCancel,
  onConfirm,
}: {
  title?: string
  sequenceLength: number
  initialRange: { start: number; end: number } | null
  initialTm: number
  onCancel: () => void
  onConfirm: (range: { start: number; end: number }, desiredTm: number) => void
}) {
  const [start, setStart] = useState((initialRange?.start ?? 0) + 1)
  const [end, setEnd] = useState(initialRange?.end ?? Math.min(sequenceLength, 500))
  const [desiredTm, setDesiredTm] = useState(initialTm)

  return (
    <div className="restriction-cloning-dntp-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div className="restriction-cloning-dntp-modal pcr-design-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="restriction-cloning-dntp-modal-header">
          <strong>{title}</strong>
        </header>
        <div className="restriction-cloning-dntp-modal-body">
          <label className="restriction-cloning-field">
            <span>Amplify from</span>
            <input type="number" min={1} max={sequenceLength} value={start} onChange={(event) => setStart(Number(event.target.value))} />
          </label>
          <label className="restriction-cloning-field">
            <span>Amplify to</span>
            <input type="number" min={1} max={sequenceLength} value={end} onChange={(event) => setEnd(Number(event.target.value))} />
          </label>
          <label className="restriction-cloning-field">
            <span>Desired Tm (C)</span>
            <input type="number" min={20} max={90} value={desiredTm} onChange={(event) => setDesiredTm(Number(event.target.value))} />
          </label>
        </div>
        <footer className="restriction-cloning-dntp-modal-footer">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="is-primary"
            onClick={() =>
              onConfirm(
                {
                  start: Math.max(0, Math.min(sequenceLength - 1, Math.round(start) - 1)),
                  end: Math.max(1, Math.min(sequenceLength, Math.round(end))),
                },
                Math.max(20, Math.min(90, Math.round(desiredTm))),
              )
            }
          >
            OK
          </button>
        </footer>
      </div>
    </div>
  )
}

function ChooseBridgeOverlapPrimersDialog({
  regions,
  initialOptions,
  mode = 'choose',
  onCancel,
  onConfirm,
}: {
  regions: Array<{ label: string; amplifyRange: { start: number; end: number } }>
  initialOptions: BridgeOverlapPrimerDesignOptions
  mode?: 'choose' | 'regenerate'
  onCancel: () => void
  onConfirm: (options: BridgeOverlapPrimerDesignOptions) => void
}) {
  const [options, setOptions] = useState(initialOptions)
  const dialogTitle = mode === 'regenerate' ? 'Regenerate PCR primers' : 'Choose PCR primers'
  const confirmLabel = mode === 'regenerate' ? 'Regenerate primers' : 'Design primers'

  function patch(partial: Partial<BridgeOverlapPrimerDesignOptions>) {
    setOptions((current) => ({ ...current, ...partial }))
  }

  return (
    <div className="restriction-cloning-dntp-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="restriction-cloning-dntp-modal pcr-design-modal gibson-overlap-primers-modal"
        role="dialog"
        aria-modal="true"
        aria-label={dialogTitle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="restriction-cloning-dntp-modal-header">
          <strong>{dialogTitle}</strong>
          <span className="muted">Overlap extension PCR</span>
        </header>
        <div className="restriction-cloning-dntp-modal-body gibson-overlap-primers-body">
          <div className="gibson-overlap-primers-row gibson-overlap-primers-regions">
            <span className="gibson-overlap-primers-label">Regions to amplify:</span>
            <div className="gibson-overlap-regions-list">
              {regions.map((region) => {
                const length = region.amplifyRange.end - region.amplifyRange.start
                return (
                  <span key={`${region.label}-${region.amplifyRange.start}-${region.amplifyRange.end}`}>
                    {region.label}: {region.amplifyRange.start + 1} .. {region.amplifyRange.end} ={' '}
                    {length.toLocaleString()} bp
                  </span>
                )
              })}
            </div>
          </div>

          <label className="gibson-overlap-primers-row">
            <span className="gibson-overlap-primers-label">Target Tm for PCR primers:</span>
            <span className="gibson-overlap-primers-controls">
              <input
                type="number"
                min={40}
                max={80}
                value={options.geneTmC}
                onChange={(event) => patch({ geneTmC: Number(event.target.value) || 60 })}
              />
              <span>°C</span>
            </span>
          </label>

          <fieldset className="gibson-overlap-ends-fieldset">
            <legend>Overlapping ends</legend>
            <label className="gibson-overlap-primers-row">
              <input
                type="radio"
                name="oe-overlap-mode"
                checked={options.overlapMode === 'fixed'}
                onChange={() => patch({ overlapMode: 'fixed' })}
              />
              <input
                type="number"
                min={12}
                max={80}
                value={options.fixedOverlapBp}
                disabled={options.overlapMode !== 'fixed'}
                onChange={(event) => patch({ fixedOverlapBp: Number(event.target.value) || 20 })}
              />
              <span>overlapping bases</span>
            </label>
            <label className="gibson-overlap-primers-row">
              <input
                type="radio"
                name="oe-overlap-mode"
                checked={options.overlapMode === 'tm-range'}
                onChange={() => patch({ overlapMode: 'tm-range' })}
              />
              <input
                type="number"
                min={12}
                max={80}
                value={options.overlapMinBp}
                disabled={options.overlapMode !== 'tm-range'}
                onChange={(event) => patch({ overlapMinBp: Number(event.target.value) || 15 })}
              />
              <span>to</span>
              <input
                type="number"
                min={12}
                max={80}
                value={options.overlapMaxBp}
                disabled={options.overlapMode !== 'tm-range'}
                onChange={(event) => patch({ overlapMaxBp: Number(event.target.value) || 25 })}
              />
              <span>overlapping bases</span>
            </label>
            <label className="gibson-overlap-primers-row gibson-overlap-primers-indent">
              <span>with a target Tm for overlap of</span>
              <input
                type="number"
                min={40}
                max={80}
                value={options.overlapTargetTmC}
                disabled={options.overlapMode !== 'tm-range'}
                onChange={(event) => patch({ overlapTargetTmC: Number(event.target.value) || 50 })}
              />
              <span>°C</span>
            </label>
          </fieldset>
        </div>
        <footer className="restriction-cloning-dntp-modal-footer">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="is-primary" onClick={() => onConfirm(options)}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  )
}

function PrimerSelector({
  label,
  primers,
  draft,
  onChange,
}: {
  label: string
  primers: Primer[]
  draft: PrimerDraft
  onChange: (next: PrimerDraft) => void
}) {
  const length = normalizeDna(draft.sequence).length
  const longestNameChars = Math.max(
    'Choose primer…'.length,
    ...primers.map((primer) => (primer.name || '').length),
    1,
  )
  return (
    <section className="pcr-primer-editor">
      <div className="pcr-primer-editor-header">
        <strong>{label}</strong>
        <select
          className="pcr-primer-name-select"
          style={{ width: `calc(${longestNameChars}ch + 2.25rem)` }}
          value={draft.sourcePrimerId ?? ''}
          onChange={(event) => {
            const primer = primers.find((entry) => entry.id === event.target.value)
            if (!primer) {
              onChange({ ...draft, sourcePrimerId: null })
              return
            }
            onChange(primerDraftFromPrimer(primer, label))
          }}
        >
          <option value="">Choose primer…</option>
          {primers.map((primer) => (
            <option key={primer.id} value={primer.id}>
              {primer.name}
            </option>
          ))}
        </select>
        <span className="pcr-primer-meta">
          {length ? `${length}-mer` : '0-mer'} / {formatTm(draft.sequence)}
        </span>
        <label className="restriction-cloning-checkbox pcr-primer-phosphorylated">
          <input
            type="checkbox"
            checked={draft.phosphorylated}
            onChange={(event) => onChange({ ...draft, phosphorylated: event.target.checked })}
          />
          5' Phosphorylated
        </label>
      </div>
      <div className="pcr-primer-sequence-row">
        <span className="pcr-primer-end-label">5'</span>
        <input
          className="pcr-primer-sequence"
          value={draft.sequence}
          onChange={(event) =>
            onChange({ ...draft, sequence: normalizeDna(event.target.value), sourcePrimerId: null })
          }
          placeholder="Primer sequence"
          spellCheck={false}
        />
        <span className="pcr-primer-end-label">3'</span>
        <button
          type="button"
          className="pcr-primer-rc-button"
          disabled={!draft.sequence}
          onClick={() =>
            onChange({
              ...draft,
              sequence: reverseComplement(draft.sequence),
              sourcePrimerId: null,
            })
          }
        >
          Reverse Complement
        </button>
      </div>
    </section>
  )
}

function BridgeSchemaDiagram({ fusion }: { fusion: BridgeFusionResult }) {
  if (!fusion.ordered.length) {
    return <div className="pcr-bridge-schema-empty">Configure overlapping fragments to preview the fusion.</div>
  }

  // Soft-compress bp→visual weight so long fragments stay only somewhat longer.
  function softWeight(bp: number) {
    return Math.pow(Math.max(1, bp), 0.42)
  }

  // Atomic fusion intervals shared by every lane so overlaps stay column-aligned.
  // Layout: [unique0][overlap0][unique1][overlap1]…[uniqueN]
  type FusionInterval = {
    kind: 'unique' | 'overlap'
    bp: number
    weight: number
    color: string
    partIndex: number
    meta?: { length: number; tmC: number | null }
  }

  const intervals: FusionInterval[] = []
  fusion.ordered.forEach((part, orderIndex) => {
    const prevOverlap = orderIndex > 0 ? fusion.junctions[orderIndex - 1]?.overlapLength ?? 0 : 0
    const nextJunction = fusion.junctions[orderIndex]
    const nextOverlap = nextJunction?.overlapLength ?? 0
    const unique = Math.max(1, part.sequence.length - prevOverlap - nextOverlap)
    intervals.push({
      kind: 'unique',
      bp: unique,
      weight: softWeight(unique),
      color: part.color,
      partIndex: orderIndex,
    })
    if (nextJunction && nextOverlap > 0) {
      intervals.push({
        kind: 'overlap',
        bp: nextOverlap,
        weight: softWeight(nextOverlap),
        color: part.color,
        partIndex: orderIndex,
        meta: { length: nextJunction.overlapLength, tmC: nextJunction.tmC },
      })
    }
  })

  const avgFragmentVisual =
    fusion.ordered.reduce((sum, part) => sum + softWeight(part.sequence.length), 0) /
    Math.max(1, fusion.ordered.length)
  const minOverlapVisual = avgFragmentVisual / 10
  for (const interval of intervals) {
    if (interval.kind === 'overlap') {
      interval.weight = Math.max(interval.weight, minOverlapVisual)
    }
  }

  function weightSum(from: number, to: number) {
    let sum = 0
    for (let i = from; i < to; i += 1) sum += intervals[i]!.weight
    return sum
  }

  // Fragment i shows its preceding overlap (stacked), unique region, and following overlap.
  // intervals: u0, o0, u1, o1, u2  → lane0 [u0,o0), lane1 [o0,u1,o1), lane2 [o1,u2)
  function fragmentIntervalRange(orderIndex: number): { start: number; end: number } {
    let uniqueIndex = 0
    for (let i = 0; i < orderIndex; i += 1) {
      uniqueIndex += 1
      if (fusion.junctions[i]) uniqueIndex += 1
    }
    const start = orderIndex > 0 && fusion.junctions[orderIndex - 1] ? uniqueIndex - 1 : uniqueIndex
    const end = uniqueIndex + 1 + (fusion.junctions[orderIndex] ? 1 : 0)
    return { start, end }
  }

  type LaneSeg =
    | { kind: 'spacer'; weight: number }
    | { kind: 'unique' | 'overlap'; weight: number; color: string; title: string; meta?: FusionInterval['meta'] }

  const laneModels = fusion.ordered.map((part, orderIndex) => {
    const { start, end } = fragmentIntervalRange(orderIndex)
    const segs: LaneSeg[] = []
    const before = weightSum(0, start)
    if (before > 0) segs.push({ kind: 'spacer', weight: before })
    for (let i = start; i < end; i += 1) {
      const interval = intervals[i]!
      segs.push({
        kind: interval.kind,
        weight: interval.weight,
        color: interval.kind === 'overlap' ? part.color : interval.color,
        title:
          interval.kind === 'overlap'
            ? `Overlap ${interval.bp} bp`
            : `Fragment ${part.originalIndex + 1}`,
        // Label once, under the left fragment’s trailing overlap.
        meta: interval.meta && interval.partIndex === orderIndex ? interval.meta : undefined,
      })
    }
    const after = weightSum(end, intervals.length)
    if (after > 0) segs.push({ kind: 'spacer', weight: after })
    return { part, orderIndex, segs }
  })

  return (
    <div className="pcr-bridge-schema">
      <div className="pcr-bridge-schema-lanes">
        {laneModels.map(({ part, orderIndex, segs }) => {
          const isFirst = orderIndex === 0
          const isLast = orderIndex === fusion.ordered.length - 1
          const hasOverlapMeta = segs.some((seg) => seg.kind !== 'spacer' && seg.meta)
          return (
            <div key={`lane-${part.originalIndex}`} className="pcr-bridge-schema-lane">
              <span className="pcr-bridge-schema-lane-label" style={{ color: part.color }}>
                {part.originalIndex + 1}
              </span>
              <div className="pcr-bridge-schema-lane-body">
                {isFirst ? (
                  <div className="pcr-bridge-schema-primer-row is-above">
                    <span className="pcr-bridge-primer-arrow is-forward" title="Primer A">
                      A
                    </span>
                  </div>
                ) : null}
                <div className="pcr-bridge-schema-lane-bars">
                  {segs.map((seg, segIndex) =>
                    seg.kind === 'spacer' ? (
                      <div
                        key={`sp-${segIndex}`}
                        className="pcr-bridge-schema-spacer"
                        style={{ flexGrow: seg.weight }}
                      />
                    ) : (
                      <div
                        key={`bar-${segIndex}`}
                        className={`pcr-bridge-schema-bar${seg.kind === 'overlap' ? ' is-overlap-lane' : ''}`}
                        style={{ background: seg.color, flexGrow: seg.weight }}
                        title={seg.title}
                      />
                    ),
                  )}
                </div>
                {hasOverlapMeta ? (
                  <div className="pcr-bridge-schema-lane-bars pcr-bridge-schema-overlap-meta-row">
                    {segs.map((seg, segIndex) =>
                      seg.kind !== 'spacer' && seg.meta ? (
                        <div
                          key={`meta-${segIndex}`}
                          className="pcr-bridge-schema-overlap-label"
                          style={{ flexGrow: seg.weight }}
                        >
                          <span>{seg.meta.length} bp</span>
                          <span>Tm = {seg.meta.tmC != null ? `${Math.round(seg.meta.tmC)}°C` : 'n/a'}</span>
                        </div>
                      ) : (
                        <div
                          key={`meta-sp-${segIndex}`}
                          className="pcr-bridge-schema-spacer"
                          style={{ flexGrow: seg.weight }}
                        />
                      ),
                    )}
                  </div>
                ) : null}
                {isLast ? (
                  <div className="pcr-bridge-schema-primer-row is-below">
                    <span className="pcr-bridge-primer-arrow is-reverse" title="Primer B">
                      B
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
      <div className="pcr-bridge-schema-caption">
        {fusion.ordered.map((part) => part.originalIndex + 1).join(' → ')}
        {fusion.productSize ? ` · ${fusion.productSize.toLocaleString()} bp fused` : ''}
        {!fusion.ready && fusion.unfusedIndices.length > 0
          ? ` · ${
              fusion.unfusedIndices.length === 1
                ? `Fragment ${fusion.unfusedIndices[0]! + 1} is not fused`
                : fusion.unfusedIndices.length === 2
                  ? `Fragments ${fusion.unfusedIndices[0]! + 1} and ${fusion.unfusedIndices[1]! + 1} are not fused`
                  : `Fragments ${fusion.unfusedIndices
                      .slice(0, -1)
                      .map((index) => String(index + 1))
                      .join(', ')}, and ${fusion.unfusedIndices[fusion.unfusedIndices.length - 1]! + 1} are not fused`
            }`
          : ''}
      </div>
    </div>
  )
}

function fragmentAmplicons(fragment: PcrFragmentState): PcrAmplicon[] {
  if (!fragment.templateRecord) return []
  if (!normalizeDna(fragment.forwardPrimer.sequence) || !normalizeDna(fragment.reversePrimer.sequence)) return []
  return listPcrAmplicons(fragment.templateRecord, fragment.forwardPrimer, fragment.reversePrimer)
}

function selectedAmpliconFor(fragment: PcrFragmentState): PcrAmplicon | null {
  const amplicons = fragmentAmplicons(fragment)
  const selectedId = effectivePcrAmpliconId(amplicons, fragment.selectedAmpliconId)
  return amplicons.find((amplicon) => amplicon.id === selectedId) ?? null
}

function selectedAmpliconIdFor(fragment: PcrFragmentState): string | null {
  return effectivePcrAmpliconId(fragmentAmplicons(fragment), fragment.selectedAmpliconId)
}

function acknowledgeLargePcrProducts(productSizes: readonly number[]): boolean {
  const message = pcrProductAcknowledgementMessage(productSizes)
  return !message || window.confirm(message)
}

function fragmentAmplifyRange(fragment: PcrFragmentState): { start: number; end: number } | null {
  if (fragment.selectedRange) return fragment.selectedRange
  const amplicon = selectedAmpliconFor(fragment)
  if (amplicon) return { start: amplicon.regionStart, end: amplicon.regionEnd }
  return null
}

export function PcrDialog({
  active = true,
  currentRecord,
  currentTabId,
  initialSelectedRange,
  initialPrimerIds = [],
  onCancel,
  onPcr,
  renderWorkspace,
  primerHybridization = defaultPrimerHybridizationParams,
}: PcrDialogProps) {
  const alignPending = useTraceAlignment()
  const sourceSelectId = `${useId()}-pcr-template-source`
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const massFileInputRef = useRef<HTMLInputElement | null>(null)
  const massSourceMenuRef = useRef<HTMLDivElement | null>(null)
  const pcrMenuRef = useRef<HTMLDivElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const initialMassTemplateChoices =
    currentRecord.dna?.documentRole === 'library'
      ? expandRestrictionInsertSources(
          [{ key: `current:${currentRecord.id}`, record: currentRecord }],
          { topology: 'source' },
        )
      : []
  const [databasePickerOpen, setDatabasePickerOpen] = useState(false)
  const [massDatabasePickerOpen, setMassDatabasePickerOpen] = useState(false)
  const [massSourceMenuOpen, setMassSourceMenuOpen] = useState(false)
  const [massTemplateSlot, setMassTemplateSlot] = useState<number | null>(
    initialMassTemplateChoices.length ? 0 : null,
  )
  const [massTemplateChoices, setMassTemplateChoices] = useState<MassRestrictionSourceChoice[]>(
    initialMassTemplateChoices,
  )
  const [massTemplatePreviewIndex, setMassTemplatePreviewIndex] = useState(0)
  const [excludedMassTemplateKeys, setExcludedMassTemplateKeys] = useState<string[]>([])
  const [massMemberExclusionsOpen, setMassMemberExclusionsOpen] = useState(false)
  const [massNamesOpen, setMassNamesOpen] = useState(false)
  const [massProductNames, setMassProductNames] = useState<Record<string, string>>({})
  const [pcrMenuOpen, setPcrMenuOpen] = useState(false)
  const [massOutputAsLibrary, setMassOutputAsLibrary] = useState(false)
  const [massOutputLibraryName, setMassOutputLibraryName] = useState('PCR products')
  const [batchSaveProducts, setBatchSaveProducts] = useState<SequenceRecord[] | null>(null)
  const [batchSaveLibrary, setBatchSaveLibrary] = useState<SequenceRecord | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchStatus, setBatchStatus] = useState('')
  const [overlapMode, setOverlapMode] = useState(false)
  const [activePart, setActivePart] = useState<ActivePartId>('fragment-0')
  const [fragments, setFragments] = useState<PcrFragmentState[]>(() => {
    const forward = currentRecord.primers.find((entry) => entry.id === initialPrimerIds[0])
    const reverse = currentRecord.primers.find((entry) => entry.id === initialPrimerIds[1])
    return [
      createFragmentState(0, currentRecord, {
        selectedRange: initialSelectedRange,
        forwardPrimer: forward ? primerDraftFromPrimer(forward, 'Primer 1') : defaultPrimerDraft('Primer 1'),
        reversePrimer: reverse ? primerDraftFromPrimer(reverse, 'Primer 2') : defaultPrimerDraft('Primer 2'),
      }),
    ]
  })
  const [fusedForwardPrimerState, setFusedForwardPrimerState] = useState(() => ({
    sourceKey: '',
    value: defaultPrimerDraft('Primer A'),
  }))
  const [fusedReversePrimerState, setFusedReversePrimerState] = useState(() => ({
    sourceKey: '',
    value: defaultPrimerDraft('Primer B'),
  }))
  const [fusedPolymerase, setFusedPolymerase] = useState<PcrPolymeraseMode>('blunt')
  const [productName, setProductName] = useState(
    initialMassTemplateChoices.length
      ? `Amplified ${MASS_PCR_TEMPLATE_NAME_TOKEN}.dna`
      : 'Amplified.dna',
  )
  const [designOpen, setDesignOpen] = useState(false)
  const [desiredTm, setDesiredTm] = useState(60)
  const [oeOverlapOpen, setOeOverlapOpen] = useState(false)
  const [oeOverlapOptions, setOeOverlapOptions] = useState(() => defaultBridgeOverlapPrimerOptions())

  const activeFragmentIndex = activePart === 'fused' ? -1 : Number(activePart.replace('fragment-', ''))
  const configuredActiveFragment =
    activeFragmentIndex >= 0 ? fragments[activeFragmentIndex] ?? null : null
  const activeMassTemplate =
    activeFragmentIndex === massTemplateSlot
      ? massTemplateChoices[massTemplatePreviewIndex] ?? massTemplateChoices[0] ?? null
      : null
  const activeFragment = useMemo(
    () => {
      const configured = configuredActiveFragment && activeMassTemplate
        ? {
            ...configuredActiveFragment,
            templateRecord: activeMassTemplate.record,
            selectedAmpliconId: null,
          }
        : configuredActiveFragment
      if (!configured) return null
      const amplicon = selectedAmpliconFor(configured)
      return amplicon
        ? { ...configured, selectedRange: { start: amplicon.regionStart, end: amplicon.regionEnd } }
        : configured
    },
    [activeMassTemplate, configuredActiveFragment],
  )

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const syncSize = () => sizePcrDialogToMainPane(dialog)
    syncSize()

    window.addEventListener('resize', syncSize)
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncSize) : null
    const workspace = document.querySelector('.snapgene-body .workspace .tab-content')
    if (workspace && resizeObserver) resizeObserver.observe(workspace)
    const pane = findVisibleMainViewPane()
    if (pane && resizeObserver) resizeObserver.observe(pane)

    return () => {
      window.removeEventListener('resize', syncSize)
      resizeObserver?.disconnect()
    }
  }, [])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (massSourceMenuOpen && !massSourceMenuRef.current?.contains(target)) {
        setMassSourceMenuOpen(false)
      }
      if (pcrMenuOpen && !pcrMenuRef.current?.contains(target)) setPcrMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [massSourceMenuOpen, pcrMenuOpen])

  const { groups: sourceGroups, options: sourceOptions, refresh: refreshSourceOptions } = useConstructSources({
    active,
    currentRecord,
    currentTabId,
  })

  const updateFragment = useCallback((index: number, patch: Partial<PcrFragmentState> | ((current: PcrFragmentState) => PcrFragmentState)) => {
    setFragments((current) =>
      current.map((fragment, fragmentIndex) => {
        if (fragmentIndex !== index) return fragment
        return typeof patch === 'function' ? patch(fragment) : { ...fragment, ...patch }
      }),
    )
  }, [])

  const fragmentProducts = useMemo(() => {
    const products: BridgeFragmentProduct[] = []
    fragments.forEach((fragment, index) => {
      const amplicon = selectedAmpliconFor(fragment)
      if (!fragment.templateRecord || !amplicon) return
      products.push({
        index,
        sequence: amplicon.sequence,
        sourceName: fragment.templateRecord.name,
        productSize: amplicon.productSize,
        amplicon,
        template: fragment.templateRecord,
        forwardPrimer: fragment.forwardPrimer,
        reversePrimer: fragment.reversePrimer,
        polymerase: fragment.polymerase,
      })
    })
    return products
  }, [fragments])

  const fusion = useMemo(
    () =>
      resolveBridgeFusion(fragmentProducts, {
        allFragmentIndices: fragments.map((_, index) => index),
      }),
    [fragmentProducts, fragments],
  )

  // Prefill external primers from the outermost fragment ends whenever arrangement changes.
  const fusionPrimerKey =
    fusion.ordered.length >= 2
      ? `${fusion.ordered.map((part) => `${part.originalIndex}:${part.orientation}`).join('|')}::${fragmentProducts
          .map(
            (product) =>
              `${product.index}:${normalizeDna(product.forwardPrimer.sequence)}:${normalizeDna(product.reversePrimer.sequence)}`,
          )
          .join(';')}`
      : ''

  const automaticFusedPrimers = useMemo(() => {
    if (fusion.ordered.length < 2 || !fusionPrimerKey) return { forward: null, reverse: null }
    const left = fusion.ordered[0]!
    const right = fusion.ordered[fusion.ordered.length - 1]!
    const leftProduct = fragmentProducts.find((product) => product.index === left.originalIndex)
    const rightProduct = fragmentProducts.find((product) => product.index === right.originalIndex)
    if (!leftProduct || !rightProduct) return { forward: null, reverse: null }
    const forward = left.orientation === 'forward' ? leftProduct.forwardPrimer : leftProduct.reversePrimer
    const reverse = right.orientation === 'forward' ? rightProduct.reversePrimer : rightProduct.forwardPrimer
    return {
      forward: normalizeDna(forward.sequence)
        ? {
            sourcePrimerId: `frag-${left.originalIndex}-${left.orientation === 'forward' ? 'f' : 'r'}`,
            name: forward.name || 'Primer A',
            sequence: normalizeDna(forward.sequence),
            phosphorylated: forward.phosphorylated,
          }
        : null,
      reverse: normalizeDna(reverse.sequence)
        ? {
            sourcePrimerId: `frag-${right.originalIndex}-${right.orientation === 'forward' ? 'r' : 'f'}`,
            name: reverse.name || 'Primer B',
            sequence: normalizeDna(reverse.sequence),
            phosphorylated: reverse.phosphorylated,
          }
        : null,
    }
  }, [fragmentProducts, fusion.ordered, fusionPrimerKey])
  const fusedForwardPrimer = fusedForwardPrimerState.sourceKey === fusionPrimerKey
    ? fusedForwardPrimerState.value
    : automaticFusedPrimers.forward ?? fusedForwardPrimerState.value
  const fusedReversePrimer = fusedReversePrimerState.sourceKey === fusionPrimerKey
    ? fusedReversePrimerState.value
    : automaticFusedPrimers.reverse ?? fusedReversePrimerState.value
  const setFusedForwardPrimer = useCallback((next: PrimerDraft | ((current: PrimerDraft) => PrimerDraft)) => {
    setFusedForwardPrimerState((current) => ({
      sourceKey: fusionPrimerKey,
      value: typeof next === 'function' ? next(current.value) : next,
    }))
  }, [fusionPrimerKey])
  const setFusedReversePrimer = useCallback((next: PrimerDraft | ((current: PrimerDraft) => PrimerDraft)) => {
    setFusedReversePrimerState((current) => ({
      sourceKey: fusionPrimerKey,
      value: typeof next === 'function' ? next(current.value) : next,
    }))
  }, [fusionPrimerKey])

  const fusedPrimerChoices = useMemo(() => {
    const choices: Primer[] = []
    const seen = new Set<string>()
    const pushChoice = (id: string, name: string, sequence: string, color: string) => {
      const normalized = normalizeDna(sequence)
      if (!normalized) return
      const key = `${name}::${normalized}`
      if (seen.has(key)) return
      seen.add(key)
      choices.push({ id, name: name || id, sequence: normalized, color })
    }
    for (const product of fragmentProducts) {
      pushChoice(
        `frag-${product.index}-f`,
        product.forwardPrimer.name || `Fragment ${product.index + 1} F`,
        product.forwardPrimer.sequence,
        '#2563eb',
      )
      pushChoice(
        `frag-${product.index}-r`,
        product.reversePrimer.name || `Fragment ${product.index + 1} R`,
        product.reversePrimer.sequence,
        '#db2777',
      )
      for (const primer of product.template.primers) {
        pushChoice(primer.id, primer.name, primer.sequence, primer.color || '#2563eb')
      }
    }
    return choices
  }, [fragmentProducts])

  const fusedPreview = useMemo(
    () => buildFusedPreviewRecord(fusion, fragmentProducts, fusedForwardPrimer, fusedReversePrimer),
    [fusion, fragmentProducts, fusedForwardPrimer, fusedReversePrimer],
  )

  const activeAmplicons = activeFragment ? fragmentAmplicons(activeFragment) : []
  const activeSelectedAmplicon = activeFragment ? selectedAmpliconFor(activeFragment) : null

  const selectedSourceOption =
    activePart === 'fused' || !activeFragment?.templateRecord
      ? undefined
      : sourceOptions.find((option) => option.record === activeFragment.templateRecord) ??
        sourceOptions.find((option) => option.record.id === activeFragment.templateRecord!.id)
  const selectedSourceKey = selectedSourceOption
    ? constructSourceOptionValue(selectedSourceOption)
    : ''

  const fragmentPreview = useMemo(() => {
    if (!activeFragment) return null
    return buildPreviewRecord(activeFragment.templateRecord, activeFragment.forwardPrimer, activeFragment.reversePrimer)
  }, [activeFragment])

  const workspaceRecord = activePart === 'fused' ? fusedPreview : fragmentPreview
  const workspaceSelectedPrimerIds =
    activePart === 'fused'
      ? ['pcr-bridge-forward', 'pcr-bridge-reverse'].filter((_, index) =>
          index === 0 ? normalizeDna(fusedForwardPrimer.sequence) : normalizeDna(fusedReversePrimer.sequence),
        )
      : activeFragment
        ? [
            activeFragment.forwardPrimer.sourcePrimerId ?? 'pcr-forward-preview',
            activeFragment.reversePrimer.sourcePrimerId ?? 'pcr-reverse-preview',
          ]
        : []

  function enableOverlapMode() {
    setOverlapMode(true)
    setFragments((current) => {
      if (current.length >= 2) return current
      return [...current, createFragmentState(1, null)]
    })
    setActivePart('fragment-0')
  }

  function addFragment() {
    setFragments((current) => {
      const next = [...current, createFragmentState(current.length, null)]
      setActivePart(`fragment-${next.length - 1}`)
      return next
    })
  }

  function removeFragment() {
    if (fragments.length < 2) return
    if (fragments.length === 2) {
      // Leave overlap-extension mode; keep Fragment 1 as a normal PCR setup.
      const kept = fragments[0]!
      setFragments([
        {
          ...kept,
          makeFileName: kept.makeFileName.match(/^Fragment \d+\.dna$/) ? 'Fragment 1.dna' : kept.makeFileName,
        },
      ])
      setOverlapMode(false)
      setActivePart('fragment-0')
      setFusedForwardPrimer(defaultPrimerDraft('Primer A'))
      setFusedReversePrimer(defaultPrimerDraft('Primer B'))
      if (massTemplateSlot === 1) {
        setMassTemplateSlot(null)
        setMassTemplateChoices([])
        setMassTemplatePreviewIndex(0)
        setExcludedMassTemplateKeys([])
        setMassProductNames({})
        setProductName((current) => removeMassPcrNameToken(current))
      }
      return
    }
    const removeIndex =
      activePart === 'fused' ? fragments.length - 1 : Math.min(activeFragmentIndex, fragments.length - 1)
    setFragments((current) =>
      current
        .filter((_, index) => index !== removeIndex)
        .map((fragment, index) => ({
          ...fragment,
          makeFileName: fragment.makeFileName.match(/^Fragment \d+\.dna$/)
            ? `Fragment ${index + 1}.dna`
            : fragment.makeFileName,
        })),
    )
    if (massTemplateSlot === removeIndex) {
      setMassTemplateSlot(null)
      setMassTemplateChoices([])
      setMassTemplatePreviewIndex(0)
      setExcludedMassTemplateKeys([])
      setMassProductNames({})
      setProductName((current) => removeMassPcrNameToken(current))
    } else if (massTemplateSlot !== null && massTemplateSlot > removeIndex) {
      setMassTemplateSlot(massTemplateSlot - 1)
    }
    setActivePart('fragment-0')
  }

  function chooseMassTemplates(
    choices: MassRestrictionSourceChoice[],
    fragmentIndex = activeFragmentIndex,
  ) {
    if (fragmentIndex < 0) return
    const expanded = expandRestrictionInsertSources(choices, { topology: 'source' })
    const unique = expanded.filter(
      (choice, index) => expanded.findIndex((candidate) => candidate.key === choice.key) === index,
    )
    if (!unique.length) {
      setBatchStatus('The selected DNA library does not contain any members to amplify.')
      setMassSourceMenuOpen(false)
      return
    }
    const first = unique[0]!
    updateFragment(fragmentIndex, {
      templateRecord: first.record,
      selectedRange: null,
      selectedAmpliconId: null,
    })
    const keepBatch = unique.length > 1 || unique.some((choice) => choice.librarySource)
    setMassTemplateSlot(keepBatch ? fragmentIndex : null)
    setMassTemplateChoices(keepBatch ? unique : [])
    setMassTemplatePreviewIndex(0)
    setExcludedMassTemplateKeys([])
    setMassProductNames({})
    setMassMemberExclusionsOpen(false)
    setProductName((current) =>
      keepBatch ? addMassPcrNameToken(current) : renderMassPcrName(current, first.record.name),
    )
    setBatchStatus(keepBatch ? `${unique.length} PCR templates selected.` : '')
    setMassSourceMenuOpen(false)
  }

  function assignSource(option: ConstructSourceOption) {
    if (activeFragmentIndex < 0) return
    if (option.record.dna?.documentRole === 'library') {
      chooseMassTemplates(
        [{ key: constructSourceOptionValue(option), record: option.record }],
        activeFragmentIndex,
      )
      return
    }
    if (activeFragmentIndex === massTemplateSlot) {
      setMassTemplateSlot(null)
      setMassTemplateChoices([])
      setMassTemplatePreviewIndex(0)
      setExcludedMassTemplateKeys([])
      setMassProductNames({})
      setProductName((current) => renderMassPcrName(current, option.record.name))
    }
    updateFragment(activeFragmentIndex, {
      templateRecord: option.record,
      selectedRange: null,
      forwardPrimer: defaultPrimerDraft('Primer 1'),
      reversePrimer: defaultPrimerDraft('Primer 2'),
      selectedAmpliconId: null,
    })
  }

  const handleWorkspacePrimerSelect = useCallback(
    (primerId: string) => {
      if (activePart === 'fused') {
        // External primers are designed for the fused template; map clicks are not used.
        return
      }
      if (!activeFragment?.templateRecord || activeFragmentIndex < 0) return
      const primer = activeFragment.templateRecord.primers.find((entry) => entry.id === primerId)
      if (!primer) return
      const draft = primerDraftFromPrimer(primer, primer.name || 'Primer')
      const layouts = resolveDisplayableLayoutsForPrimer(
        activeFragment.templateRecord.sequence,
        primer,
        primerHybridization,
      )
      const prefersReverse =
        layouts.some((layout) => layout.strand === 'reverse') &&
        !layouts.some((layout) => layout.strand === 'forward')

      if (prefersReverse) {
        updateFragment(activeFragmentIndex, { reversePrimer: draft })
        return
      }
      if (
        layouts.some((layout) => layout.strand === 'forward') &&
        !layouts.some((layout) => layout.strand === 'reverse')
      ) {
        updateFragment(activeFragmentIndex, { forwardPrimer: draft })
        return
      }
      if (
        !normalizeDna(activeFragment.forwardPrimer.sequence) ||
        activeFragment.forwardPrimer.sourcePrimerId === primer.id
      ) {
        updateFragment(activeFragmentIndex, { forwardPrimer: draft })
        return
      }
      updateFragment(activeFragmentIndex, { reversePrimer: draft })
    },
    [activeFragment, activeFragmentIndex, activePart, primerHybridization, updateFragment],
  )

  async function importConstruct(file: File) {
    if (activeFragmentIndex < 0) return
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      const parsed = isSnapGeneBytes(bytes)
        ? parseSnapGene(bytes, file.name)
        : parseSequenceBytes(buffer, file.name)
      const imported = addOperation(parsed, 'import', `Imported ${file.name} for PCR template.`)
      if (imported.dna?.documentRole === 'library') {
        chooseMassTemplates(
          [{ key: `file:${file.name}:${file.size}:${file.lastModified}`, record: imported }],
          activeFragmentIndex,
        )
      } else {
        if (activeFragmentIndex === massTemplateSlot) {
          setMassTemplateSlot(null)
          setMassTemplateChoices([])
          setMassTemplatePreviewIndex(0)
          setExcludedMassTemplateKeys([])
          setMassProductNames({})
          setProductName((current) => renderMassPcrName(current, imported.name))
        }
        updateFragment(activeFragmentIndex, {
          templateRecord: imported,
          selectedRange: null,
          selectedAmpliconId: null,
        })
      }
    } catch (error) {
      window.alert(`Could not import construct: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function importMassConstructs(files: FileList | File[]) {
    if (activeFragmentIndex < 0) return
    const imported: MassRestrictionSourceChoice[] = []
    for (const [index, file] of Array.from(files).entries()) {
      try {
        const buffer = await file.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        const parsed = isSnapGeneBytes(bytes)
          ? parseSnapGene(bytes, file.name)
          : parseSequenceBytes(buffer, file.name)
        imported.push({
          key: `file:${file.name}:${file.size}:${file.lastModified}:${index}`,
          record: addOperation(parsed, 'import', `Imported ${file.name} for mass PCR.`),
        })
      } catch (error) {
        setBatchStatus(`Could not import ${file.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (imported.length) chooseMassTemplates(imported, activeFragmentIndex)
    if (massFileInputRef.current) massFileInputRef.current.value = ''
  }

  function designExternalPrimers(_range: { start: number; end: number }, tm: number) {
    if (!fusion.fusedSequence) return
    const fullPair = designExternalBridgePrimers(fusion.fusedSequence, tm, 'Bridge')
    setFusedForwardPrimer({ ...fullPair.forward, sourcePrimerId: null })
    setFusedReversePrimer({ ...fullPair.reverse, sourcePrimerId: null })
    setDesiredTm(tm)
    setDesignOpen(false)
  }

  const bridgePrimerInputs = useMemo((): BridgeFragmentPrimerInput[] => {
    const inputs: BridgeFragmentPrimerInput[] = []
    fragments.forEach((fragment, index) => {
      if (!fragment.templateRecord) return
      inputs.push({
        index,
        template: fragment.templateRecord,
        selectedRange: fragmentAmplifyRange(fragment),
        forwardPrimer: fragment.forwardPrimer,
        reversePrimer: fragment.reversePrimer,
        ready: Boolean(selectedAmpliconFor(fragment)),
      })
    })
    return inputs
  }, [fragments])

  const shortAmplifyWarnings = useMemo(() => {
    const minBp = minBridgeAmplifyBp()
    const warnings: string[] = []
    for (const fragment of fragments) {
      const range = fragmentAmplifyRange(fragment)
      if (!range || !fragment.templateRecord) continue
      const length = range.end - range.start
      if (length > 0 && length < minBp) {
        const label = `Fragment ${fragments.indexOf(fragment) + 1}`
        warnings.push(
          `${label}: selected stretch is ${length} bp (need ≥${minBp} bp for OE PCR primers).`,
        )
      }
    }
    return warnings
  }, [fragments])

  const oeOverlapPrimerTargets = useMemo(
    () =>
      listBridgeOverlapPrimerTargets({
        fragments: bridgePrimerInputs,
        fusionReady: fusion.ready,
        includeReadyFragments: false,
      }),
    [bridgePrimerInputs, fusion.ready],
  )

  const oeOverlapPrimerRegenTargets = useMemo(
    () =>
      listBridgeOverlapPrimerTargets({
        fragments: bridgePrimerInputs,
        fusionReady: fusion.ready,
        includeReadyFragments: true,
      }),
    [bridgePrimerInputs, fusion.ready],
  )

  const oeOverlapPrimerAction: 'choose' | 'regenerate' | null =
    oeOverlapPrimerTargets.length > 0
      ? 'choose'
      : oeOverlapPrimerRegenTargets.length > 0
        ? 'regenerate'
        : null

  const activeOeOverlapPrimerTargets =
    oeOverlapPrimerAction === 'regenerate' ? oeOverlapPrimerRegenTargets : oeOverlapPrimerTargets

  const selectedAssemblyPrimers = useMemo(
    () => listBridgeAssemblySelectedPrimers(fragments),
    [fragments],
  )

  async function handleExportSelectedPrimers() {
    if (selectedAssemblyPrimers.length === 0) return
    const baseName = productName.replace(/\.[^.]+$/u, '').trim() || 'Bridge'
    await saveTextAs(`Primers from ${baseName}.txt`, exportBridgeSelectedPrimersTsv(fragments), 'text/plain')
  }

  function applyOeOverlapPrimerDesign(options: BridgeOverlapPrimerDesignOptions) {
    if (activeOeOverlapPrimerTargets.length === 0) return
    const designed = designBridgeOverlapPrimersForFragments({
      fragments: bridgePrimerInputs,
      options,
      includeReadyFragments: oeOverlapPrimerAction === 'regenerate',
    })
    if (!designed || designed.fragments.length === 0) {
      window.alert(
        'Could not design OE PCR primers. Select amplify ranges (≥60 bp) on every fragment in the chain.',
      )
      return
    }

    const byIndex = new Map(designed.fragments.map((entry) => [entry.fragmentIndex, entry]))
    setFragments((current) =>
      current.map((fragment, index) => {
        const entry = byIndex.get(index)
        if (!entry || !fragment.templateRecord) return fragment
        return {
          ...fragment,
          templateRecord: mergeBridgeDesignedPrimersOntoRecord(
            fragment.templateRecord,
            entry.insertPrimers,
          ),
          selectedRange: entry.amplifyRange,
          forwardPrimer: {
            sourcePrimerId: entry.insertForward.sourcePrimerId,
            name: entry.insertForward.name,
            sequence: entry.insertForward.sequence,
            phosphorylated: entry.insertForward.phosphorylated,
          },
          reversePrimer: {
            sourcePrimerId: entry.insertReverse.sourcePrimerId,
            name: entry.insertReverse.name,
            sequence: entry.insertReverse.sequence,
            phosphorylated: entry.insertReverse.phosphorylated,
          },
          selectedAmpliconId: null,
        }
      }),
    )
    setOeOverlapOptions(options)
    setOeOverlapOpen(false)
    setActivePart('fused')
  }

  const simpleReady = Boolean(activeFragment?.templateRecord && activeSelectedAmplicon)
  const bridgeReady =
    fusion.ready &&
    normalizeDna(fusedForwardPrimer.sequence) &&
    normalizeDna(fusedReversePrimer.sequence) &&
    fragmentProducts.length >= 2

  const massMode =
    massTemplateSlot !== null &&
    (massTemplateChoices.length > 1 || massTemplateChoices.some((choice) => choice.librarySource))
  const includedMassTemplateChoices = useMemo(
    () => massTemplateChoices.filter((choice) => !excludedMassTemplateKeys.includes(choice.key)),
    [excludedMassTemplateKeys, massTemplateChoices],
  )
  const massCandidates = useMemo(() => {
    if (!massMode || massTemplateSlot === null) return []
    return includedMassTemplateChoices.map((choice) => {
      const candidateFragments = fragments.map((fragment, index) =>
        index === massTemplateSlot
          ? { ...fragment, templateRecord: choice.record, selectedAmpliconId: null }
          : fragment,
      )
      const candidateFragmentProducts: BridgeFragmentProduct[] = []
      candidateFragments.forEach((fragment, index) => {
        const amplicon = selectedAmpliconFor(fragment)
        if (!fragment.templateRecord || !amplicon) return
        candidateFragmentProducts.push({
          index,
          sequence: amplicon.sequence,
          sourceName: fragment.templateRecord.name,
          productSize: amplicon.productSize,
          amplicon,
          template: fragment.templateRecord,
          forwardPrimer: fragment.forwardPrimer,
          reversePrimer: fragment.reversePrimer,
          polymerase: fragment.polymerase,
        })
      })
      const candidateFusion = overlapMode
        ? resolveBridgeFusion(candidateFragmentProducts, {
            allFragmentIndices: candidateFragments.map((_, index) => index),
          })
        : null
      const simpleFragment = candidateFragments[massTemplateSlot]
      const simpleAmplicon = simpleFragment ? selectedAmpliconFor(simpleFragment) : null
      const ready = overlapMode
        ? Boolean(
            candidateFusion?.ready &&
            normalizeDna(fusedForwardPrimer.sequence) &&
            normalizeDna(fusedReversePrimer.sequence) &&
            candidateFragmentProducts.length >= 2,
          )
        : Boolean(simpleFragment?.templateRecord && simpleAmplicon)
      const failureReason = overlapMode
        ? candidateFusion?.message || 'The overlap-extension product could not be resolved.'
        : !normalizeDna(simpleFragment?.forwardPrimer.sequence ?? '') ||
            !normalizeDna(simpleFragment?.reversePrimer.sequence ?? '')
          ? 'Choose or design both primers.'
          : 'No amplicons found for the chosen primer pair.'
      const name = (
        massProductNames[choice.key] ??
        renderMassPcrName(productName, choice.record.name)
      ).trim()
      return {
        key: choice.key,
        choice,
        candidateFragments,
        fragmentProducts: candidateFragmentProducts,
        fusion: candidateFusion,
        simpleFragment,
        simpleAmplicon,
        ready,
        failureReason,
        name,
      }
    })
  }, [
    fragments,
    fusedForwardPrimer.sequence,
    fusedReversePrimer.sequence,
    includedMassTemplateChoices,
    massMode,
    massProductNames,
    massTemplateSlot,
    overlapMode,
    productName,
  ])
  const cloneableMassCandidates = useMemo(
    () => massCandidates.filter((candidate) => candidate.ready),
    [massCandidates],
  )
  const failedMassCandidates = useMemo(
    () => massCandidates.filter((candidate) => !candidate.ready),
    [massCandidates],
  )
  const massNamesAreValid = useMemo(() => {
    if (!massMode || !cloneableMassCandidates.length) return false
    const names = cloneableMassCandidates.map((candidate) => candidate.name)
    return names.every(Boolean) && new Set(names.map((name) => name.toLocaleLowerCase())).size === names.length
  }, [cloneableMassCandidates, massMode])
  const massReady = massMode && cloneableMassCandidates.length > 0 && massNamesAreValid
  const massOutputReady = massReady && (!massOutputAsLibrary || Boolean(massOutputLibraryName.trim()))
  const massPcrProductSizes = useMemo(
    () => cloneableMassCandidates.flatMap((candidate) => {
      const productSize = overlapMode ? candidate.fusion?.productSize : candidate.simpleAmplicon?.productSize
      return typeof productSize === 'number' ? [productSize] : []
    }),
    [cloneableMassCandidates, overlapMode],
  )
  const libraryMassTemplateChoices = useMemo(
    () => massTemplateChoices.filter((choice) => Boolean(choice.librarySource)),
    [massTemplateChoices],
  )
  const cloneableLibraryChoiceKeys = useMemo(
    () => libraryMassTemplateChoices
      .filter((choice) => massCandidates.some((candidate) => candidate.key === choice.key && candidate.ready))
      .map((choice) => choice.key),
    [libraryMassTemplateChoices, massCandidates],
  )
  const massFailureReasons = useMemo(
    () => Object.fromEntries(massCandidates.map((candidate) => [candidate.key, candidate.failureReason])),
    [massCandidates],
  )
  const massBatchResult = useMemo<MassRestrictionBatchResult | null>(
    () => massMode
      ? {
          action: 'pcr',
          cloned: cloneableMassCandidates.map((candidate) => ({
            vectorName: candidate.choice.record.name,
            insertName: '',
            productName: candidate.name,
          })),
          notCloned: failedMassCandidates.map((candidate) => ({
            vectorName: candidate.choice.record.name,
            insertName: '',
            reason: candidate.failureReason,
          })),
        }
      : null,
    [cloneableMassCandidates, failedMassCandidates, massMode],
  )
  const massReadinessMessage = massMode
    ? cloneableMassCandidates.length === 0
      ? `None of the ${massCandidates.length} templates can be amplified.`
      : !massNamesAreValid
        ? `Add ${MASS_PCR_TEMPLATE_NAME_TOKEN} to the product name or use Choose names.`
        : failedMassCandidates.length
          ? `${cloneableMassCandidates.length} of ${massCandidates.length} templates will be amplified; ${failedMassCandidates.length} cannot be amplified.`
          : `${cloneableMassCandidates.length} templates are ready for PCR.`
    : ''

  const readinessMessage =
    activePart === 'fused'
      ? !fusion.ready
        ? fusion.message
        : !normalizeDna(fusedForwardPrimer.sequence) || !normalizeDna(fusedReversePrimer.sequence)
          ? 'Design or enter external primers A and B.'
          : fusion.message
      : !activeFragment?.templateRecord
        ? 'Choose a template construct.'
        : !normalizeDna(activeFragment.forwardPrimer.sequence) || !normalizeDna(activeFragment.reversePrimer.sequence)
          ? 'Choose or design both primers.'
          : !activeAmplicons.length
            ? 'No amplicons found for the chosen primer pair.'
            : 'Ready for PCR.'

  const ready = massMode ? massReady : activePart === 'fused' ? Boolean(bridgeReady) : simpleReady

  function buildMassPcrProducts(): SequenceRecord[] {
    if (!massReady) return []
    return cloneableMassCandidates.flatMap((candidate) => {
      try {
        if (overlapMode) {
          if (!candidate.fusion?.ready) return []
          return [
            createBridgePcrProductRecord({
              fusion: candidate.fusion,
              fragmentProducts: candidate.fragmentProducts,
              name: candidate.name,
              forwardPrimer: fusedForwardPrimer,
              reversePrimer: fusedReversePrimer,
              polymerase: fusedPolymerase,
            }),
          ]
        }
        if (!candidate.simpleFragment?.templateRecord || !candidate.simpleAmplicon) return []
        return [
          createPcrProductRecord({
            template: candidate.simpleFragment.templateRecord,
            amplicon: candidate.simpleAmplicon,
            name: candidate.name,
            forwardPrimer: candidate.simpleFragment.forwardPrimer,
            reversePrimer: candidate.simpleFragment.reversePrimer,
            polymerase: candidate.simpleFragment.polymerase,
          }),
        ]
      } catch {
        return []
      }
    })
  }

  async function handleMassPcrOpenAll() {
    if (batchBusy) return
    if (!acknowledgeLargePcrProducts(massPcrProductSizes)) return
    const products = buildMassPcrProducts()
    if (!products.length) return
    setPcrMenuOpen(false)
    setBatchBusy(true)
    setBatchStatus(massOutputAsLibrary ? 'Preparing library members…' : '')
    try {
      const records = massOutputAsLibrary
        ? [await createRestrictionCloningProductLibraryAsync(products, massOutputLibraryName, alignPending)]
        : products
      onPcr(records, {
        statusMessage: massOutputAsLibrary
          ? `Mass PCR finished: opened ${records[0]!.name} with ${products.length} members, ${failedMassCandidates.length} not amplified.`
          : `Mass PCR finished: ${records.length} opened, ${failedMassCandidates.length} not amplified.`,
        batchResult: massBatchResult ?? undefined,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not prepare library: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  async function handleMassPcrToDatabase() {
    if (batchBusy) return
    if (!acknowledgeLargePcrProducts(massPcrProductSizes)) return
    const products = buildMassPcrProducts()
    if (!products.length) return
    setPcrMenuOpen(false)
    setBatchStatus('')
    if (massOutputAsLibrary) {
      setBatchBusy(true)
      setBatchStatus('Preparing library members…')
      try {
        setBatchSaveLibrary(await createRestrictionCloningProductLibraryAsync(products, massOutputLibraryName, alignPending))
        setBatchStatus('')
      } catch (error) {
        setBatchStatus(`Could not prepare library: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        setBatchBusy(false)
      }
    } else {
      setBatchSaveProducts(products)
    }
  }

  async function saveMassPcrProductsToDatabase(folderId: string | null) {
    if (!batchSaveProducts?.length || batchBusy) return
    setBatchBusy(true)
    try {
      for (let index = 0; index < batchSaveProducts.length; index += 1) {
        const product = batchSaveProducts[index]!
        setBatchStatus(`Saving ${index + 1} of ${batchSaveProducts.length} to Database…`)
        await saveProject(product, {
          folderId,
          fileName: normalizeProjectFileName(null, product.name, 'dna'),
        })
      }
      const count = batchSaveProducts.length
      setBatchSaveProducts(null)
      onPcr([], {
        open: false,
        statusMessage: `Mass PCR finished: ${count} saved to Database, ${failedMassCandidates.length} not amplified.`,
        batchResult: massBatchResult ?? undefined,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not save PCR batch: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  async function saveMassPcrLibraryToDatabase(folderId: string | null) {
    if (!batchSaveLibrary || batchBusy) return
    setBatchBusy(true)
    try {
      setBatchStatus(`Saving ${batchSaveLibrary.name} to Database…`)
      await saveProject(batchSaveLibrary, {
        folderId,
        fileName: normalizeProjectFileName(null, batchSaveLibrary.name, 'dna'),
      })
      const memberCount = batchSaveLibrary.traceFiles?.length ?? 0
      const name = batchSaveLibrary.name
      setBatchSaveLibrary(null)
      onPcr([], {
        open: false,
        statusMessage: `Mass PCR finished: ${memberCount} products saved as library ${name}, ${failedMassCandidates.length} not amplified.`,
        batchResult: massBatchResult ?? undefined,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not save PCR library: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  async function handleMassPcrToFolder() {
    if (!acknowledgeLargePcrProducts(massPcrProductSizes)) return
    const products = buildMassPcrProducts()
    if (!products.length || batchBusy) return
    setPcrMenuOpen(false)
    if (!isTauriRuntime()) {
      setBatchStatus('Saving a batch to a folder is available in the desktop app.')
      return
    }
    const directory = await pickDesktopDirectory(
      massOutputAsLibrary ? 'Choose folder for PCR product library' : 'Choose folder for PCR products',
    )
    if (!directory) return
    setBatchBusy(true)
    try {
      if (massOutputAsLibrary) {
        setBatchStatus('Preparing library members…')
        const library = await createRestrictionCloningProductLibraryAsync(products, massOutputLibraryName, alignPending)
        await writeUniqueBytesToDirectory(
          directory,
          normalizeProjectFileName(null, library.name, 'dna'),
          exportSnapGene(library),
        )
      } else {
        for (let index = 0; index < products.length; index += 1) {
          const product = products[index]!
          setBatchStatus(`Saving ${index + 1} of ${products.length} to folder…`)
          await writeUniqueBytesToDirectory(
            directory,
            normalizeProjectFileName(null, product.name, 'dna'),
            exportSnapGene(product),
          )
        }
      }
      onPcr([], {
        open: false,
        statusMessage: `Mass PCR finished: ${products.length} products saved${massOutputAsLibrary ? ' as a library' : ' to folder'}, ${failedMassCandidates.length} not amplified.`,
        batchResult: massBatchResult ?? undefined,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not save PCR batch: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className="translation-dialog restriction-cloning-dialog pcr-dialog"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="restriction-cloning-header">
          <h3>PCR</h3>
          <div className="restriction-cloning-part-strip">
            {!overlapMode ? (
              <button type="button" onClick={enableOverlapMode}>
                Overlap extension PCR
              </button>
            ) : (
              <>
                {fragments.map((_, index) => (
                  <button
                    key={`fragment-tab-${index}`}
                    type="button"
                    className={activePart === `fragment-${index}` ? 'is-active' : undefined}
                    onClick={() => setActivePart(`fragment-${index}`)}
                  >
                    Fragment {index + 1}
                  </button>
                ))}
                <button
                  type="button"
                  className={activePart === 'fused' ? 'is-active' : undefined}
                  onClick={() => setActivePart('fused')}
                >
                  Fused template
                </button>
                <div className="restriction-cloning-part-actions">
                  <button type="button" onClick={addFragment}>
                    Add fragment
                  </button>
                  <button type="button" onClick={removeFragment} disabled={fragments.length < 2}>
                    Remove fragment
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <MobileCloningLayout designLabel="Primers">
          <div className="restriction-cloning-main pcr-main">
            {renderWorkspace({
              record: workspaceRecord,
              title:
                activePart === 'fused'
                  ? fusion.ready
                    ? 'Fused template'
                    : 'Fused template (incomplete)'
                  : activeFragment?.templateRecord
                    ? `Fragment ${activeFragmentIndex + 1} template`
                    : undefined,
              selectedRange: activePart === 'fused' ? null : activeFragment?.selectedRange ?? null,
              selectedPrimerIds: workspaceSelectedPrimerIds,
              primerHybridization,
              onRangeSelect:
                activePart === 'fused' || activeFragmentIndex < 0
                  ? undefined
                  : (range) => updateFragment(activeFragmentIndex, { selectedRange: range }),
              onPrimerSelect: handleWorkspacePrimerSelect,
            })}
            {activePart === 'fused' ? (
                <PcrPrimerPairPanel
                  forwardSequence={fusedForwardPrimer.sequence}
                  reverseSequence={fusedReversePrimer.sequence}
                  forwardLabel="Primer A"
                  reverseLabel="Primer B"
                >
                  <PrimerSelector
                    label="Primer A"
                    primers={fusedPrimerChoices}
                    draft={fusedForwardPrimer}
                    onChange={setFusedForwardPrimer}
                  />
                  <PrimerSelector
                    label="Primer B"
                    primers={fusedPrimerChoices}
                    draft={fusedReversePrimer}
                    onChange={setFusedReversePrimer}
                  />
                  <p className="restriction-cloning-hint">
                    External primers amplify the fused template (forward from the leftmost fragment, reverse from
                    the rightmost).
                  </p>
                </PcrPrimerPairPanel>
              ) : (
                <PcrPrimerPairPanel
                  forwardSequence={activeFragment?.forwardPrimer.sequence ?? ''}
                  reverseSequence={activeFragment?.reversePrimer.sequence ?? ''}
                  forwardLabel="Primer 1"
                  reverseLabel="Primer 2"
                >
                  <PrimerSelector
                    label="Primer 1"
                    primers={activeFragment?.templateRecord?.primers ?? []}
                    draft={activeFragment?.forwardPrimer ?? defaultPrimerDraft('Primer 1')}
                    onChange={(draft) => activeFragmentIndex >= 0 && updateFragment(activeFragmentIndex, { forwardPrimer: draft })}
                  />
                  <PrimerSelector
                    label="Primer 2"
                    primers={activeFragment?.templateRecord?.primers ?? []}
                    draft={activeFragment?.reversePrimer ?? defaultPrimerDraft('Primer 2')}
                    onChange={(draft) => activeFragmentIndex >= 0 && updateFragment(activeFragmentIndex, { reversePrimer: draft })}
                  />
                  <p className="restriction-cloning-hint">
                    Click primers on the map, sequence, or Primers tab to fill Primer 1 (forward) and Primer 2
                    (reverse).
                  </p>
                </PcrPrimerPairPanel>
              )}
          </div>

          <aside className="restriction-cloning-sidebar pcr-sidebar">
            <div className="restriction-cloning-sidebar-body">
            {batchStatus && <div className="mass-insert-dialog-status" role="status">{batchStatus}</div>}
            {activePart === 'fused' ? (
              <div className="pcr-sidebar-fused">
                {shortAmplifyWarnings.length > 0 && (
                  <div className="restriction-cloning-status is-invalid" role="status">
                    {shortAmplifyWarnings.join(' ')}
                  </div>
                )}

                {oeOverlapPrimerAction && (
                  <button type="button" onClick={() => setOeOverlapOpen(true)}>
                    {oeOverlapPrimerAction === 'regenerate'
                      ? 'Regenerate primers'
                      : 'Choose PCR primers'}
                  </button>
                )}

                <button type="button" disabled={!fusion.fusedSequence} onClick={() => setDesignOpen(true)}>
                  Choose external PCR primers…
                </button>

                <label className="restriction-cloning-field">
                  <span>Polymerase for amplifying Fused Template:</span>
                  <select
                    value={fusedPolymerase}
                    onChange={(event) => setFusedPolymerase(event.target.value as PcrPolymeraseMode)}
                  >
                    <option value="blunt">Creates blunt ends</option>
                    <option value="a-overhang">Creates 3&apos; A overhangs</option>
                    <option value="g-overhang">Creates 3&apos; G overhangs</option>
                  </select>
                </label>

                <div className="pcr-bridge-fragment-list">
                  {fragments.map((fragment, index) => {
                    const product = fragmentProducts.find((entry) => entry.index === index)
                    const color = BRIDGE_FRAGMENT_COLORS[index % BRIDGE_FRAGMENT_COLORS.length]
                    return (
                      <div key={fragment.id} className="pcr-bridge-fragment-card">
                        <div className="pcr-bridge-fragment-card-header">
                          <strong style={{ color }}>Fragment {index + 1}</strong>
                          <span>{product ? `${product.productSize.toLocaleString()} bp` : '—'}</span>
                        </div>
                        <div className="muted">Source: {fragment.templateRecord?.name ?? 'Not set'}</div>
                        {massMode ? (
                          <div className="muted">Mass PCR creates final fused products only.</div>
                        ) : (
                          <div className="pcr-bridge-make-file">
                            <label className="pcr-bridge-make-file-row">
                              <input
                                type="checkbox"
                                checked={fragment.makeFile}
                                onChange={(event) => updateFragment(index, { makeFile: event.target.checked })}
                              />
                              Make file:
                            </label>
                            <input
                              className="pcr-bridge-make-file-name"
                              value={fragment.makeFileName}
                              disabled={!fragment.makeFile}
                              onChange={(event) => updateFragment(index, { makeFileName: event.target.value })}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="pcr-bridge-footer-block">
                  <BridgeSchemaDiagram fusion={fusion} />

                  <div className={`restriction-cloning-status${ready ? ' is-ready' : ' is-invalid'}`}>
                    {massMode ? massReadinessMessage : readinessMessage}
                    {fusion.fusedSequence ? ` Product: ${fusion.productSize.toLocaleString()} bp` : ''}
                  </div>

                  <button
                    type="button"
                    disabled={selectedAssemblyPrimers.length === 0}
                    onClick={() => void handleExportSelectedPrimers()}
                  >
                    Export selected primers
                  </button>

                  <label className="restriction-cloning-field">
                    <span>{massMode ? 'Product name template:' : 'Create product:'}</span>
                    <ProductNameInput value={productName} onChange={(event) => setProductName(event.target.value)} />
                  </label>
                  {massMode && (
                    <div className="mass-restriction-naming-actions">
                      <button type="button" onClick={() => setMassNamesOpen(true)}>Choose names…</button>
                      <span className="restriction-cloning-hint">
                        Use {MASS_PCR_TEMPLATE_NAME_TOKEN} in generated names.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="mass-insert-source-row">
                  <label className="mass-insert-source-heading" htmlFor={sourceSelectId}>
                    Template
                  </label>
                  <ConstructSourceSelect
                    id={sourceSelectId}
                    value={selectedSourceKey}
                    groups={sourceGroups}
                    onOpen={refreshSourceOptions}
                    onChange={(event) => {
                      const option = sourceOptions.find(
                        (entry) => constructSourceOptionValue(entry) === event.target.value,
                      )
                      if (option) assignSource(option)
                    }}
                  />
                  <div
                    ref={massSourceMenuRef}
                    className={`mass-insert-source-menu${massSourceMenuOpen ? ' is-open' : ''}`}
                  >
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={massSourceMenuOpen}
                      onClick={() => setMassSourceMenuOpen((open) => !open)}
                    >
                      Multiple… <ChevronDown size={13} aria-hidden="true" />
                    </button>
                    {massSourceMenuOpen && (
                      <div className="mass-insert-source-dropdown" role="menu">
                        <button type="button" role="menuitem" onClick={() => massFileInputRef.current?.click()}>
                          Choose files…
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMassSourceMenuOpen(false)
                            setMassDatabasePickerOpen(true)
                          }}
                        >
                          Choose from Database…
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {massMode && activeFragmentIndex === massTemplateSlot && (
                  <MassRestrictionSourceNavigator
                    kind="construct"
                    choices={massTemplateChoices}
                    index={massTemplatePreviewIndex}
                    onChange={setMassTemplatePreviewIndex}
                    onExclude={
                      libraryMassTemplateChoices.length
                        ? () => setMassMemberExclusionsOpen(true)
                        : undefined
                    }
                    excludedCount={excludedMassTemplateKeys.length}
                  />
                )}
                <button type="button" onClick={() => fileInputRef.current?.click()}>
                  Load external file…
                </button>
                <button type="button" onClick={() => setDatabasePickerOpen(true)}>Database…</button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={SEQUENCE_OPEN_ACCEPT}
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void importConstruct(file)
                  }}
                />
                <input
                  ref={massFileInputRef}
                  type="file"
                  accept={SEQUENCE_OPEN_ACCEPT}
                  multiple
                  hidden
                  onChange={(event) => {
                    if (event.target.files?.length) void importMassConstructs(event.target.files)
                  }}
                />

                <button
                  type="button"
                  disabled={!activeFragment?.templateRecord}
                  onClick={() => setDesignOpen(true)}
                >
                  Choose PCR Primers…
                </button>

                <label className="restriction-cloning-field">
                  <span>Polymerase</span>
                  <select
                    value={activeFragment?.polymerase ?? 'blunt'}
                    onChange={(event) =>
                      activeFragmentIndex >= 0 &&
                      updateFragment(activeFragmentIndex, {
                        polymerase: event.target.value as PcrPolymeraseMode,
                      })
                    }
                  >
                    <option value="blunt">Creates blunt ends</option>
                    <option value="a-overhang">Creates 3&apos; A overhangs</option>
                    <option value="g-overhang">Creates 3&apos; G overhangs</option>
                  </select>
                </label>

                <div className="pcr-amplicon-table-wrap">
                  <table className="data-table pcr-amplicon-table">
                    <thead>
                      <tr>
                        <th>Amplified Region</th>
                        <th>Product Size (bp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeAmplicons.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="muted">
                            No amplicons yet.
                          </td>
                        </tr>
                      ) : (
                        activeAmplicons.map((amplicon) => (
                          <tr
                            key={amplicon.id}
                            className={activeFragment && selectedAmpliconIdFor(activeFragment) === amplicon.id ? 'is-selected' : ''}
                            onClick={() =>
                              activeFragmentIndex >= 0 &&
                              updateFragment(activeFragmentIndex, {
                                selectedAmpliconId: amplicon.id,
                                selectedRange: { start: amplicon.regionStart, end: amplicon.regionEnd },
                              })
                            }
                          >
                            <td>{formatRange(amplicon.regionStart, amplicon.regionEnd)}</td>
                            <td>{amplicon.productSize.toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className={`restriction-cloning-status${ready ? ' is-ready' : ' is-invalid'}`}>
                  {massMode ? massReadinessMessage : readinessMessage}
                  {activeSelectedAmplicon ? ` Product: ${activeSelectedAmplicon.productSize.toLocaleString()} bp` : ''}
                </div>

                {!overlapMode && (
                  <>
                    <label className="restriction-cloning-field">
                      <span>{massMode ? 'Product name template' : 'Create product'}</span>
                      <ProductNameInput value={productName} onChange={(event) => setProductName(event.target.value)} />
                    </label>
                    {massMode && (
                      <div className="mass-restriction-naming-actions">
                        <button type="button" onClick={() => setMassNamesOpen(true)}>Choose names…</button>
                        <span className="restriction-cloning-hint">
                          Use {MASS_PCR_TEMPLATE_NAME_TOKEN} in generated names.
                        </span>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            </div>
            <div className="restriction-cloning-sidebar-actions">
              {massMode && (
                <MassRestrictionLibraryOutputControls
                  checked={massOutputAsLibrary}
                  name={massOutputLibraryName}
                  onCheckedChange={setMassOutputAsLibrary}
                  onNameChange={setMassOutputLibraryName}
                />
              )}
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
              {massMode ? (
                <div
                  ref={pcrMenuRef}
                  className={`restriction-cloning-clone-split${pcrMenuOpen ? ' is-open' : ''}`}
                >
                  <button
                    type="button"
                    className="primary restriction-cloning-clone-main"
                    disabled={!massOutputReady || batchBusy}
                    onClick={handleMassPcrOpenAll}
                  >
                    PCR and open all
                  </button>
                  <button
                    type="button"
                    className="primary restriction-cloning-clone-chevron"
                    disabled={!massOutputReady || batchBusy}
                    aria-label="Choose mass PCR destination"
                    aria-haspopup="menu"
                    aria-expanded={pcrMenuOpen}
                    onClick={() => setPcrMenuOpen((open) => !open)}
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {pcrMenuOpen && (
                    <div className="restriction-cloning-clone-menu" role="menu">
                      <button type="button" role="menuitem" onClick={handleMassPcrOpenAll}>
                        PCR and open all
                      </button>
                      <button type="button" role="menuitem" onClick={handleMassPcrToDatabase}>
                        PCR and save to Database…
                      </button>
                      <button type="button" role="menuitem" onClick={() => void handleMassPcrToFolder()}>
                        PCR and save to folder…
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                type="button"
                className="primary"
                disabled={
                  overlapMode
                    ? activePart === 'fused'
                      ? !bridgeReady
                      : true
                    : !simpleReady
                }
                onClick={() => {
                  try {
                    const productSize = overlapMode
                      ? fusion.productSize
                      : activeSelectedAmplicon?.productSize
                    if (!acknowledgeLargePcrProducts(typeof productSize === 'number' ? [productSize] : [])) return
                    if (overlapMode) {
                      if (!bridgeReady) return
                      const intermediates = createBridgeFragmentRecords(
                        fragmentProducts,
                        fragments.map((fragment, index) => ({
                          index,
                          name: fragment.makeFileName,
                          enabled: fragment.makeFile,
                        })),
                      )
                      const fused = createBridgePcrProductRecord({
                        fusion,
                        fragmentProducts,
                        name: productName,
                        forwardPrimer: fusedForwardPrimer,
                        reversePrimer: fusedReversePrimer,
                        polymerase: fusedPolymerase,
                      })
                      onPcr([...intermediates, fused])
                      onCancel()
                      return
                    }
                    if (!activeFragment?.templateRecord || !activeSelectedAmplicon) return
                    const product = createPcrProductRecord({
                      template: activeFragment.templateRecord,
                      amplicon: activeSelectedAmplicon,
                      name: productName,
                      forwardPrimer: activeFragment.forwardPrimer,
                      reversePrimer: activeFragment.reversePrimer,
                      polymerase: activeFragment.polymerase,
                    })
                    onPcr([product])
                    onCancel()
                  } catch (error) {
                    window.alert(
                      `Could not create PCR product: ${error instanceof Error ? error.message : String(error)}`,
                    )
                  }
                }}
              >
                PCR
                </button>
              )}
            </div>
          </aside>
        </MobileCloningLayout>

        {designOpen && activePart !== 'fused' && activeFragment?.templateRecord && (
          <ChoosePcrPrimersDialog
            sequenceLength={activeFragment.templateRecord.sequence.length}
            initialRange={activeFragment.selectedRange}
            initialTm={desiredTm}
            onCancel={() => setDesignOpen(false)}
            onConfirm={(range, tm) => {
              if (!activeFragment.templateRecord || activeFragmentIndex < 0) return
              const pair = designPcrPrimerPair(activeFragment.templateRecord, range.start, range.end, tm)
              updateFragment(activeFragmentIndex, {
                forwardPrimer: { ...pair.forward, sourcePrimerId: null },
                reversePrimer: { ...pair.reverse, sourcePrimerId: null },
                selectedRange: range,
              })
              setDesiredTm(tm)
              setDesignOpen(false)
            }}
          />
        )}

        {designOpen && activePart === 'fused' && Boolean(fusion.fusedSequence) && (
          <ChoosePcrPrimersDialog
            title="Choose external PCR primers"
            sequenceLength={fusion.productSize}
            initialRange={{ start: 0, end: fusion.productSize }}
            initialTm={desiredTm}
            onCancel={() => setDesignOpen(false)}
            onConfirm={designExternalPrimers}
          />
        )}

        {oeOverlapOpen && activeOeOverlapPrimerTargets.length > 0 && oeOverlapPrimerAction && (
          <ChooseBridgeOverlapPrimersDialog
            regions={activeOeOverlapPrimerTargets.map((target) => ({
              label: target.label,
              amplifyRange: target.amplifyRange,
            }))}
            initialOptions={oeOverlapOptions}
            mode={oeOverlapPrimerAction}
            onCancel={() => setOeOverlapOpen(false)}
            onConfirm={applyOeOverlapPrimerDesign}
          />
        )}
        {databasePickerOpen && (
          <DatabaseConstructPickerDialog
            excludeRecordId={currentRecord.id}
            onCancel={() => setDatabasePickerOpen(false)}
            onSelect={(record, project) => {
              assignSource({ kind: 'database', label: project.name, projectId: project.id, record })
              setDatabasePickerOpen(false)
            }}
          />
        )}
        {massDatabasePickerOpen && (
          <DatabaseConstructPickerDialog
            multiple
            onCancel={() => setMassDatabasePickerOpen(false)}
            onSelectMany={(choices) => {
              chooseMassTemplates(
                choices.map(({ record, project }) => ({
                  key: `database:${project.id}`,
                  record,
                })),
              )
              setMassDatabasePickerOpen(false)
            }}
          />
        )}
        {massNamesOpen && massMode && (
          <MassRestrictionNamesDialog
            choices={massCandidates.map((candidate) => ({
              key: candidate.key,
              vectorName: candidate.choice.record.name,
              insertName: '',
            }))}
            initialNames={Object.fromEntries(
              massCandidates.map((candidate) => [candidate.key, candidate.name]),
            )}
            eligibleChoiceKeys={cloneableMassCandidates.map((candidate) => candidate.key)}
            failureReasons={massFailureReasons}
            onCancel={() => setMassNamesOpen(false)}
            onConfirm={(names) => {
              setMassProductNames(names)
              setMassNamesOpen(false)
            }}
          />
        )}
        {massMemberExclusionsOpen && libraryMassTemplateChoices.length > 0 && (
          <MassRestrictionLibraryMembersDialog
            choices={libraryMassTemplateChoices}
            cloneableChoiceKeys={cloneableLibraryChoiceKeys}
            excludedChoiceKeys={excludedMassTemplateKeys}
            failureReasons={massFailureReasons}
            onCancel={() => setMassMemberExclusionsOpen(false)}
            onConfirm={(excluded) => {
              setExcludedMassTemplateKeys(excluded)
              setMassProductNames({})
              setMassMemberExclusionsOpen(false)
            }}
          />
        )}
        {batchSaveProducts && (
          <SaveToDatabaseDialog
            recordName={`${batchSaveProducts.length} PCR products`}
            initialFileName="products.dna"
            title="Save PCR products to Database"
            confirmLabel="Save here"
            allowCreateFolder
            status={batchStatus}
            busy={batchBusy}
            onCancel={() => {
              if (!batchBusy) setBatchSaveProducts(null)
            }}
            onConfirm={(folderId) => saveMassPcrProductsToDatabase(folderId)}
          />
        )}
        {batchSaveLibrary && (
          <SaveToDatabaseDialog
            recordName={batchSaveLibrary.name}
            initialFileName={normalizeProjectFileName(null, batchSaveLibrary.name, 'dna')}
            title="Save PCR product library to Database"
            confirmLabel="Save here"
            allowCreateFolder
            status={batchStatus}
            busy={batchBusy}
            onCancel={() => {
              if (!batchBusy) setBatchSaveLibrary(null)
            }}
            onConfirm={(folderId) => saveMassPcrLibraryToDatabase(folderId)}
          />
        )}
      </div>
    </div>
  )
}
