import { useTraceAlignment } from './presentation/hooks/traceAlignmentContext'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react'
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
} from './cloning/MassRestrictionCloningDialogs'
import { constructSourceOptionValue, groupConstructSourceOptions, useConstructSources, type ConstructSourceOption } from './cloning/useConstructSources'
import type { CloningWorkspaceRenderArgs } from './cloningWorkspaceTypes'
import { MobileCloningLayout } from './MobileCloningLayout'
import { PcrPrimerPairPanel } from './PrimerStructuresPanel'
import { SaveToDatabaseDialog } from './SaveToDatabaseDialog'
import {
  defaultConstructProperties,
  methylationForStrain,
  transformationStrainOptions,
} from './domain/constructProperties'
import { SEQUENCE_OPEN_ACCEPT } from './domain/fileFormats'
import { exportSnapGene, isSnapGeneBytes, parseSequenceBytes, parseSnapGene } from './domain/parsers'
import { calculateAnnealTemperature } from './domain/primerThermodynamics'
import { defaultPrimerHybridizationParams } from './domain/primerHybridization'
import type { PrimerHybridizationParams } from './domain/primerHybridization'
import { resolveDisplayableLayoutsForPrimer } from './domain/primerSequenceLayout'
import { normalizeDna, reverseComplement } from './domain/sequence'
import { GatewayLrAssemblyDiagramView, GatewayLrEndsPanel } from './GatewayLrEndsPanel'
import {
  analyzeGatewayAssembly,
  analyzeGatewayLrAssembly,
  assembleGatewayLrProduct,
  assembleGatewayProduct,
  attBPrimerSubtypesFromDonor,
  buildGatewayLrAssemblyDiagram,
  defaultGatewayEntryConfig,
  defaultGatewayInsertConfig,
  defaultGatewayVectorConfig,
  formatAttBSiteLabel,
  GATEWAY_DESTINATION_ENDS_COLOR,
  gatewayLrPreviewRecord,
  gatewayMethodLabel,
  GATEWAY_METHODS,
  loadGatewayVectorCatalog,
  loadGatewayStandardVector,
  MAX_GATEWAY_LR_ENTRIES,
  preferDefaultDestinationId,
  resolveGatewayDestination,
  resolveGatewayEntry,
  resolveGatewayInsert,
  resolveGatewayDonor,
  gatewayPreviewRecord,
  gatewayPrimerDraftFromPrimer,
  type GatewayCloningMethod,
  type GatewayEntryConfig,
  type GatewayInsertConfig,
  type GatewayPrimerDraft,
  type GatewayVectorCatalog,
  type GatewayVectorCatalogEntry,
  type GatewayVectorConfig,
  type ResolvedGatewayDestination,
  type ResolvedGatewayDonor,
  type ResolvedGatewayEntry,
  type ResolvedGatewayInsert,
} from './domain/gatewayBpCloning'
import {
  defaultGatewayPrimerDesignOptions,
  designGatewayAttBPrimers,
  exportGatewaySelectedPrimersTsv,
  listGatewayAssemblySelectedPrimers,
  listGatewayPrimerTargets,
  mergeGatewayDesignedPrimersOntoRecord,
  minGatewayAmplifyBp,
  normalizeGatewayAmplifyRange,
  type GatewayPrimerDesignOptions,
} from './domain/gatewayBpPrimers'
import { pickDesktopDirectory, saveTextAs, writeUniqueBytesToDirectory } from './desktop/fileIo'
import type { Primer, SequenceRecord } from './domain/types'
import { useClampDialogToViewport } from './ui/useClampDialogToViewport'
import {
  GATEWAY_DESTINATION_NAME_TOKEN,
  GATEWAY_DONOR_NAME_TOKEN,
  GATEWAY_ENTRY_NAMES_TOKEN,
  GATEWAY_INSERT_NAME_TOKEN,
  deduplicateGatewayBatchPrimers,
  expandGatewayBatchSources,
  gatewayBatchCombinationCount,
  gatewayBatchCombinations,
  remapGatewayInsertConfig,
  renderGatewayBpBatchName,
  renderGatewayLrBatchName,
  type GatewayBatchSourceChoice,
} from './domain/gatewayCloningBatch'
import { createRestrictionCloningProductLibraryAsync } from './domain/restrictionCloningBatch'
import { isTauriRuntime } from './desktop/tauriRuntime'
import { normalizeProjectFileName, saveProject } from './storage/projects'

type EntryPartId = `entry-${0 | 1 | 2 | 3}`
type ActivePartId = 'insert' | 'donor' | 'product' | 'destination' | EntryPartId
type GatewayMassSlot = Exclude<ActivePartId, 'product'>

const MAX_GATEWAY_BATCH_COMBINATIONS = 10_000

type FileTarget =
  | { kind: 'insert' }
  | { kind: 'donor-custom' }
  | { kind: 'destination-custom' }
  | { kind: 'entry'; index: number }

function isEntryPart(part: ActivePartId): part is EntryPartId {
  return part.startsWith('entry-')
}

function entryIndexFromPart(part: ActivePartId): number | null {
  if (!isEntryPart(part)) return null
  const index = Number(part.slice('entry-'.length))
  return Number.isFinite(index) ? index : null
}

function entryPartId(index: number): EntryPartId {
  return `entry-${index}` as EntryPartId
}

type GatewayCloningDialogProps = {
  primerHybridization?: PrimerHybridizationParams
  active?: boolean
  currentRecord: SequenceRecord
  currentTabId: string
  cloningMethod?: GatewayCloningMethod
  /** Contiguous map/sequence selection to seed as the default PCR amplify range. */
  initialSelectedRange?: { start: number; end: number } | null
  onCancel: () => void
  onClone: (
    records: SequenceRecord[],
    method: GatewayCloningMethod,
    options?: {
      statusMessage?: string
      activate?: boolean
      open?: boolean
      batchResult?: MassRestrictionBatchResult
      proceedToLrEntries?: SequenceRecord[]
    },
  ) => void
  renderWorkspace: (args: CloningWorkspaceRenderArgs) => ReactNode
}

function formatPrimerTm(sequence: string) {
  const result = calculateAnnealTemperature(sequence)
  if (result.tmC !== null) return `${result.tmC.toFixed(1)} C`
  if (result.tmMinC !== null && result.tmMaxC !== null) {
    return `${result.tmMinC.toFixed(1)}-${result.tmMaxC.toFixed(1)} C`
  }
  return 'Tm n/a'
}

function ChooseGatewayAttBPrimersDialog({
  sourceName,
  donorLabel,
  regions,
  initialOptions,
  mode = 'choose',
  onCancel,
  onConfirm,
}: {
  sourceName: string
  donorLabel: string | null
  regions: Array<{ label: string; amplifyRange: { start: number; end: number } }>
  initialOptions: GatewayPrimerDesignOptions
  mode?: 'choose' | 'regenerate'
  onCancel: () => void
  onConfirm: (options: GatewayPrimerDesignOptions) => void
}) {
  const [options, setOptions] = useState<GatewayPrimerDesignOptions>(initialOptions)
  const dialogTitle =
    mode === 'regenerate' ? 'Regenerate attB PCR primers' : 'Choose attB PCR primers'
  const confirmLabel = mode === 'regenerate' ? 'Regenerate Primers' : 'Choose Primers'
  const leftLabel = formatAttBSiteLabel(options.leftSubtype)
  const rightLabel = formatAttBSiteLabel(options.rightSubtype)

  return (
    <div className="restriction-cloning-dntp-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="restriction-cloning-dntp-modal pcr-design-modal gibson-overlap-primers-modal gateway-attb-primers-modal"
        role="dialog"
        aria-modal="true"
        aria-label={dialogTitle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="restriction-cloning-dntp-modal-header">
          <strong>{dialogTitle}</strong>
          <span className="muted">{sourceName}</span>
        </header>
        <div className="restriction-cloning-dntp-modal-body gibson-overlap-primers-body">
          <div className="gibson-overlap-primers-row gibson-overlap-primers-regions">
            <span className="gibson-overlap-primers-label">Region to amplify:</span>
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

          <p className="restriction-cloning-hint gateway-attb-donor-hint">
            {donorLabel
              ? `Overhangs match the selected donor (${donorLabel}): ${leftLabel} / ${rightLabel}.`
              : `No donor selected — using ${leftLabel} / ${rightLabel}. Choose a donor vector to match its attP sites.`}
          </p>

          <fieldset className="gateway-attb-orientation-fieldset">
            <legend>attB site orientation</legend>
            <label className="restriction-cloning-checkbox gateway-attb-orientation-option">
              <input
                type="radio"
                name="gateway-attb-orientation"
                checked={options.siteOrientation === 'forward'}
                onChange={() =>
                  setOptions((current) => ({ ...current, siteOrientation: 'forward' }))
                }
              />
              <span>
                {leftLabel} → Insert → {rightLabel}
              </span>
            </label>
            <label className="restriction-cloning-checkbox gateway-attb-orientation-option">
              <input
                type="radio"
                name="gateway-attb-orientation"
                checked={options.siteOrientation === 'reverse'}
                onChange={() =>
                  setOptions((current) => ({ ...current, siteOrientation: 'reverse' }))
                }
              />
              <span>
                {rightLabel} ← Insert ← {leftLabel}
              </span>
            </label>
          </fieldset>

          <label className="gibson-overlap-primers-row">
            <span className="gibson-overlap-primers-label">Target Tm for PCR primers:</span>
            <span className="gibson-overlap-primers-controls">
              <input
                type="number"
                min={40}
                max={80}
                value={options.geneTmC}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    geneTmC: Number(event.target.value) || 60,
                  }))
                }
              />
              <span>°C</span>
            </span>
          </label>

          <label className="restriction-cloning-checkbox gateway-attb-adapter-option">
            <input
              type="checkbox"
              checked={options.useAdapterPrimers}
              onChange={(event) =>
                setOptions((current) => ({
                  ...current,
                  useAdapterPrimers: event.target.checked,
                }))
              }
            />
            <span>
              Use {leftLabel} and {rightLabel} adapter primers
            </span>
          </label>

          <div className="gateway-attb-adapter-help" role="note">
            {options.useAdapterPrimers ? (
              <>
                <p>
                  Gene-specific primers get short 5′ {leftLabel}/{rightLabel} <strong>stubs</strong>,
                  not the full attB overhangs. Run a first PCR with these oligos, then a second PCR
                  with universal {leftLabel}/{rightLabel} <strong>adapter primers</strong> to extend
                  the stubs to complete attB sites (Thermo Fisher two-step / adapter protocol).
                </p>
                <p>
                  Shorter gene primers are cheaper and often easier to synthesize; the adapters are
                  reusable across many inserts. VibeGene still models the completed attB product for
                  the BP reaction after design.
                </p>
              </>
            ) : (
              <>
                <p>
                  Gene-specific primers receive full 5′ <strong>{leftLabel}/{rightLabel}</strong>{' '}
                  overhangs matched to the selected donor vector. One PCR yields an attB-flanked
                  insert ready for BP Clonase.
                </p>
                <p>
                  Check <strong>Use {leftLabel} and {rightLabel} adapter primers</strong> to switch
                  to the two-step Thermo protocol: short attB stubs on the gene primers, then
                  universal adapter oligos add the remaining attB sequence in a second PCR.
                </p>
              </>
            )}
          </div>
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

function GatewayMultipleSourceDialog({
  options,
  onCancel,
  onConfirm,
}: {
  options: ConstructSourceOption[]
  onCancel: () => void
  onConfirm: (options: ConstructSourceOption[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])
  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog mass-restriction-library-members-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Choose multiple constructs"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3>Choose multiple constructs</h3>
        <div className="mass-restriction-library-members-list">
          {options.map((option) => {
            const key = constructSourceOptionValue(option)
            return (
              <label key={key} className="mass-restriction-library-member-row">
                <input
                  type="checkbox"
                  checked={selected.has(key)}
                  onChange={(event) => setSelected((current) => {
                    const next = new Set(current)
                    if (event.target.checked) next.add(key)
                    else next.delete(key)
                    return next
                  })}
                />
                <span><strong>{option.record.name}</strong><small>{option.label}</small></span>
              </label>
            )
          })}
        </div>
        <footer className="translation-dialog-footer">
          <div className="translation-actions">
            <button type="button" onClick={onCancel}>Cancel</button>
            <button
              type="button"
              className="primary"
              disabled={selected.size === 0}
              onClick={() => onConfirm(options.filter((option) => selected.has(constructSourceOptionValue(option))))}
            >
              Add to cloning
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function GatewayStandardVectorBatchDialog({
  title,
  entries,
  onCancel,
  onConfirm,
}: {
  title: string
  entries: GatewayVectorCatalogEntry[]
  onCancel: () => void
  onConfirm: (entries: GatewayVectorCatalogEntry[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div className="translation-dialog mass-restriction-library-members-dialog" role="dialog" aria-modal="true" aria-label={title} onPointerDown={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        <div className="mass-restriction-library-members-list">
          {entries.map((entry) => (
            <label key={entry.id} className="mass-restriction-library-member-row">
              <input
                type="checkbox"
                checked={selected.has(entry.id)}
                onChange={(event) => setSelected((current) => {
                  const next = new Set(current)
                  if (event.target.checked) next.add(entry.id)
                  else next.delete(entry.id)
                  return next
                })}
              />
              <span><strong>{entry.label}</strong><small>{entry.length.toLocaleString()} bp</small></span>
            </label>
          ))}
        </div>
        <footer className="translation-dialog-footer"><div className="translation-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" disabled={!selected.size} onClick={() => onConfirm(entries.filter((entry) => selected.has(entry.id)))}>Add to cloning</button>
        </div></footer>
      </div>
    </div>
  )
}

function PrimerSelector({
  label,
  primers,
  draft,
  disabled,
  onChange,
}: {
  label: string
  primers: Primer[]
  draft: GatewayPrimerDraft
  disabled?: boolean
  onChange: (next: GatewayPrimerDraft) => void
}) {
  const length = normalizeDna(draft.sequence).length
  const longestNameChars = Math.max(
    'Choose primer…'.length,
    ...primers.map((primer) => (primer.name || '').length),
    1,
  )
  return (
    <section className={`pcr-primer-editor${disabled ? ' is-disabled' : ''}`}>
      <div className="pcr-primer-editor-header">
        <strong>{label}</strong>
        <select
          className="pcr-primer-name-select"
          style={{ width: `min(100%, calc(${longestNameChars}ch + 2.25rem))` }}
          value={draft.sourcePrimerId ?? ''}
          disabled={disabled}
          onChange={(event) => {
            const primer = primers.find((entry) => entry.id === event.target.value)
            if (!primer) {
              onChange({ ...draft, sourcePrimerId: null })
              return
            }
            onChange(gatewayPrimerDraftFromPrimer(primer, label))
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
          {length ? `${length}-mer` : '0-mer'} / {formatPrimerTm(draft.sequence)}
        </span>
        <label className="restriction-cloning-checkbox pcr-primer-phosphorylated">
          <input
            type="checkbox"
            checked={draft.phosphorylated}
            disabled={disabled}
            onChange={(event) => onChange({ ...draft, phosphorylated: event.target.checked })}
          />
          5&apos; Phosphorylated
        </label>
      </div>
      <div className="pcr-primer-sequence-row">
        <span className="pcr-primer-end-label">5&apos;</span>
        <input
          className="pcr-primer-sequence"
          value={draft.sequence}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...draft,
              sequence: normalizeDna(event.target.value),
              sourcePrimerId: null,
            })
          }
          placeholder="Primer sequence"
          spellCheck={false}
        />
        <span className="pcr-primer-end-label">3&apos;</span>
        <button
          type="button"
          className="pcr-primer-rc-button"
          disabled={disabled || !draft.sequence}
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

type GatewayProductInsertSegment = { length: number; color: string }

function gatewayRingSegmentPath(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = {
    x: cx + radius * Math.cos(startAngle),
    y: cy + radius * Math.sin(startAngle),
  }
  const end = {
    x: cx + radius * Math.cos(endAngle),
    y: cy + radius * Math.sin(endAngle),
  }
  let delta = endAngle - startAngle
  while (delta < 0) delta += Math.PI * 2
  while (delta >= Math.PI * 2) delta -= Math.PI * 2
  if (delta < 0.001) return ''
  const largeArc = delta > Math.PI ? 1 : 0
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

/** Circular plasmid ring with one accent sector (insert or ccdB cassette). */
function GatewayPlasmidRingGraphic({
  ready,
  backboneColor,
  accentColor,
  accentFraction,
}: {
  ready: boolean
  backboneColor: string
  accentColor: string
  accentFraction: number
}) {
  const cx = 80
  const cy = 46
  const r = 34
  const strokeWidth = 11
  const fraction = ready ? Math.min(0.85, Math.max(0.12, accentFraction)) : 0.28
  const start = -Math.PI / 2 - (fraction * Math.PI * 2) / 2
  const mid = start + fraction * Math.PI * 2
  const end = start + Math.PI * 2
  const accentPath = gatewayRingSegmentPath(cx, cy, r, start, mid)
  const backbonePath = gatewayRingSegmentPath(cx, cy, r, mid, end)

  return (
    <div className="gateway-lr-plasmid-graphic">
      <svg viewBox="0 0 160 92" aria-hidden>
        {backbonePath && (
          <path
            d={backbonePath}
            fill="none"
            stroke={ready ? backboneColor : 'var(--vg-cloning-diagram-ink)'}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />
        )}
        {accentPath && (
          <path
            d={accentPath}
            fill="none"
            stroke={ready ? accentColor : 'var(--vg-cloning-diagram-ink)'}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />
        )}
      </svg>
    </div>
  )
}

function gatewayEntryAccentFraction(entry: ResolvedGatewayEntry) {
  if (!entry.ready || !entry.left || !entry.right || entry.sequence.length <= 0) return 0.32
  const payload = Math.max(1, entry.right.start - entry.left.end)
  return Math.min(0.75, Math.max(0.15, payload / entry.sequence.length))
}

function gatewayDestinationAccentFraction(destination: ResolvedGatewayDestination) {
  if (!destination.ready || !destination.left || !destination.right || destination.sequence.length <= 0) {
    return 0.22
  }
  const cassette = Math.max(1, destination.right.start - destination.left.end)
  return Math.min(0.55, Math.max(0.12, cassette / destination.sequence.length))
}

/** Sole non-att feature fully contained between an entry's flanking att sites. */
function gatewayEntryPayloadFeatureName(entry: ResolvedGatewayEntry): string | null {
  if (!entry.ready || !entry.left || !entry.right) return null
  const rangeStart = Math.min(entry.left.end, entry.right.start)
  const rangeEnd = Math.max(entry.left.end, entry.right.start)
  if (rangeEnd <= rangeStart) return null

  const matches: string[] = []
  for (const feature of entry.features) {
    const name = feature.name?.trim()
    if (!name || /^att[BPLR]/i.test(name)) continue
    const contained = feature.locations.some(
      (location) => location.start >= rangeStart && location.end <= rangeEnd,
    )
    if (contained) matches.push(name)
  }
  return matches.length === 1 ? matches[0]! : null
}

function GatewayProductGraphic({
  insertLength,
  donorLength,
  insertColor,
  donorColor,
  insertSegments,
  productLength,
  ready,
  productLabel = 'Entry Clone',
}: {
  insertLength: number
  donorLength: number
  insertColor: string
  donorColor: string
  insertSegments?: GatewayProductInsertSegment[]
  productLength: number | null
  ready: boolean
  productLabel?: string
}) {
  const cx = 110
  const cy = 48
  const r = 38
  const circumference = 2 * Math.PI * r

  const inserts =
    insertSegments && insertSegments.length > 0
      ? insertSegments.filter((segment) => segment.length > 0)
      : insertLength > 0
        ? [{ length: insertLength, color: insertColor }]
        : []
  const insertTotal = inserts.reduce((sum, segment) => sum + segment.length, 0)

  if (!ready || insertTotal <= 0 || donorLength <= 0) {
    return (
      <div className="gateway-product-graphic cloning-schema-empty-graphic">
        <svg viewBox="0 0 220 96" aria-hidden>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--vg-cloning-diagram-ink)"
            strokeWidth={10}
            strokeDasharray={`${circumference * 0.42} ${circumference * 0.08}`}
          />
        </svg>
      </div>
    )
  }

  const segments: GatewayProductInsertSegment[] = [
    ...inserts,
    { length: donorLength, color: donorColor },
  ]
  const total = segments.reduce((sum, segment) => sum + segment.length, 0)
  let angle = -Math.PI / 2

  return (
    <div className="gateway-product-graphic">
      <svg viewBox="0 0 220 96" aria-hidden>
        {segments.map((segment, index) => {
          const sweep = (segment.length / total) * Math.PI * 2
          const startAngle = angle
          const endAngle = angle + sweep
          angle = endAngle
          const d = gatewayRingSegmentPath(cx, cy, r, startAngle, endAngle)
          if (!d) return null
          return (
            <path
              key={`gateway-product-seg-${index}-${segment.color}`}
              d={d}
              fill="none"
              stroke={segment.color}
              strokeWidth={10}
              strokeLinecap="butt"
            />
          )
        })}
      </svg>
      <div className="gateway-product-badge">
        <strong>{productLabel}</strong>
        <span>{productLength != null ? `${productLength.toLocaleString()} bp` : ''}</span>
      </div>
    </div>
  )
}

function featureNameForExactRange(
  record: SequenceRecord | null | undefined,
  range: { start: number; end: number } | null | undefined,
): string | null {
  if (!record || !range) return null
  const start = Math.min(range.start, range.end)
  const end = Math.max(range.start, range.end)
  for (const feature of record.features) {
    for (const location of feature.locations) {
      if (location.start === start && location.end === end) {
        const name = feature.name?.trim()
        if (name) return name
      }
    }
  }
  return null
}

function GatewaySchemaPanel({
  insert,
  donor,
  insertFeatureName,
  analysisReady,
  analysisMessage,
  productLength,
  insertSpanLength,
  donorSpanLength,
  activePart,
  onSelectPart,
}: {
  insert: ResolvedGatewayInsert
  donor: ResolvedGatewayDonor
  insertFeatureName: string | null
  analysisReady: boolean
  analysisMessage: string
  productLength: number | null
  insertSpanLength: number
  donorSpanLength: number
  activePart: ActivePartId
  onSelectPart: (part: ActivePartId) => void
}) {
  const donorTitle =
    donor.source?.sequence && donor.name && donor.name !== 'Donor Vector' ? donor.name : null

  return (
    <section className="cloning-schema-panel gateway-schema-panel" aria-label="Gateway cloning schema">
      <div className="cloning-schema-row">
        <button
          type="button"
          className={`cloning-schema-part cloning-schema-insert${activePart === 'insert' ? ' is-selected' : ''}${
            insert.ready ? '' : ' is-empty'
          }`}
          onClick={() => onSelectPart('insert')}
        >
          <div className="cloning-schema-part-meta">
            {insertFeatureName ? (
              <>
                <strong className="gateway-schema-entity-name">{insertFeatureName}</strong>
                <span className="gateway-schema-role">attB Insert</span>
              </>
            ) : (
              <strong>attB Insert</strong>
            )}
            <span>{insert.ready ? `${insert.sequence.length.toLocaleString()} bp` : insert.message}</span>
          </div>
          {insert.ready && (
            <div className="cloning-schema-insert-bar" style={{ background: insert.color }} />
          )}
        </button>

        <span className="cloning-schema-plus" aria-hidden>
          +
        </span>

        <button
          type="button"
          className={`cloning-schema-part cloning-schema-vector${activePart === 'donor' ? ' is-selected' : ''}${
            donor.ready ? '' : ' is-empty'
          }`}
          onClick={() => onSelectPart('donor')}
        >
          <div className="cloning-schema-vector-card">
            <div className={`cloning-schema-vector-graphic${donor.ready ? '' : ' cloning-schema-empty-graphic'}`}>
              <svg viewBox="0 0 160 72" aria-hidden>
                <path
                  d="M 28 58 A 52 52 0 1 1 132 58"
                  fill="none"
                  stroke={donor.ready ? donor.color : 'var(--vg-cloning-diagram-ink)'}
                  strokeWidth={10}
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="cloning-schema-part-meta cloning-schema-vector-meta">
              {donorTitle ? (
                <>
                  <strong className="gateway-schema-entity-name">{donorTitle}</strong>
                  <span className="gateway-schema-role">Donor Vector</span>
                </>
              ) : (
                <strong>Donor Vector</strong>
              )}
              <span>{donor.ready ? `${donor.sequence.length.toLocaleString()} bp` : donor.message}</span>
            </div>
          </div>
        </button>

        <span className="cloning-schema-arrow" aria-hidden>
          →
        </span>

        <button
          type="button"
          className={`cloning-schema-part cloning-schema-product gateway-schema-product${
            analysisReady ? '' : ' is-empty'
          }${activePart === 'product' ? ' is-selected' : ''} is-closed`}
          onClick={() => onSelectPart('product')}
        >
          <GatewayProductGraphic
            insertLength={insertSpanLength}
            donorLength={donorSpanLength}
            insertColor={insert.color}
            donorColor={donor.color}
            productLength={productLength}
            ready={analysisReady}
          />
          {!analysisReady && (
            <div className="cloning-schema-part-meta">
              <strong>Entry Clone</strong>
              <span>{analysisMessage}</span>
            </div>
          )}
        </button>
      </div>
    </section>
  )
}

function GatewayLrSchemaPanel({
  entries,
  destination,
  analysisReady,
  analysisMessage,
  productLength,
  activePart,
  onSelectPart,
  onRemoveEntry,
  onReorderEntries,
}: {
  entries: ResolvedGatewayEntry[]
  destination: ResolvedGatewayDestination
  analysisReady: boolean
  analysisMessage: string
  productLength: number | null
  activePart: ActivePartId
  onSelectPart: (part: ActivePartId) => void
  onRemoveEntry: (index: number) => void
  onReorderEntries: (fromIndex: number, toIndex: number) => void
}) {
  const destinationTitle =
    destination.source?.sequence && destination.name && destination.name !== 'Destination Vector'
      ? destination.name
      : null
  const assemblyModel = buildGatewayLrAssemblyDiagram(entries, destination)
  const dragIndexRef = useRef<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const canReorder = entries.length > 1

  function handleDrop(targetIndex: number) {
    const from = dragIndexRef.current
    dragIndexRef.current = null
    setDragIndex(null)
    setDropIndex(null)
    if (from == null || from === targetIndex) return
    onReorderEntries(from, targetIndex)
  }

  return (
    <section
      className="cloning-schema-panel gateway-schema-panel gateway-lr-schema-panel"
      aria-label="Gateway LR cloning schema"
    >
      <div className="cloning-schema-row">
        {entries.map((entry, index) => {
          const payloadFeatureName = gatewayEntryPayloadFeatureName(entry)
          return (
          <span key={entryPartId(index)} className="gateway-lr-schema-entry-group">
            {index > 0 && (
              <span className="cloning-schema-plus" aria-hidden>
                +
              </span>
            )}
            <div
              className={`gateway-lr-schema-entry-shell${
                dragIndex === index ? ' is-dragging' : ''
              }${
                dropIndex === index && dragIndex !== null && dragIndex !== index
                  ? ' is-drop-target'
                  : ''
              }`}
              draggable={canReorder}
              title={canReorder ? 'Drag to reorder Entry clones' : undefined}
              onDragStart={(event: DragEvent<HTMLDivElement>) => {
                if (!canReorder) return
                if ((event.target as HTMLElement).closest('.gateway-lr-schema-entry-remove')) {
                  event.preventDefault()
                  return
                }
                dragIndexRef.current = index
                setDragIndex(index)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', String(index))
              }}
              onDragOver={(event: DragEvent<HTMLDivElement>) => {
                if (!canReorder) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDropIndex(index)
              }}
              onDrop={(event: DragEvent<HTMLDivElement>) => {
                if (!canReorder) return
                event.preventDefault()
                handleDrop(index)
              }}
              onDragEnd={() => {
                dragIndexRef.current = null
                setDragIndex(null)
                setDropIndex(null)
              }}
            >
              <div
                role="button"
                tabIndex={0}
                className={`cloning-schema-part cloning-schema-insert gateway-lr-schema-entry${
                  activePart === entryPartId(index) ? ' is-selected' : ''
                }${entry.ready ? '' : ' is-empty'}${dragIndex === index ? ' is-dragging' : ''}${
                  dropIndex === index && dragIndex !== null && dragIndex !== index
                    ? ' is-drop-target'
                    : ''
                }`}
                onClick={() => onSelectPart(entryPartId(index))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectPart(entryPartId(index))
                  }
                }}
              >
                <div className="cloning-schema-part-meta">
                  {entry.ready ? (
                    <>
                      <strong className="gateway-schema-entity-name">
                        {entry.name !== `Entry ${index + 1}` ? entry.name : `Entry ${index + 1}`}
                      </strong>
                      {entry.left && entry.right && (
                        <span className="gateway-schema-role">
                          {entry.left.name} … {entry.right.name}
                        </span>
                      )}
                      {payloadFeatureName && (
                        <span className="gateway-lr-schema-feature-name">{payloadFeatureName}</span>
                      )}
                      <span>{entry.sequence.length.toLocaleString()} bp</span>
                    </>
                  ) : (
                    <>
                      <strong>Entry {index + 1}</strong>
                      <span>{entry.message}</span>
                    </>
                  )}
                </div>
                <div className="gateway-lr-schema-entry-graphic">
                  <GatewayPlasmidRingGraphic
                    ready={entry.ready}
                    backboneColor="#2f2a23"
                    accentColor={entry.color}
                    accentFraction={gatewayEntryAccentFraction(entry)}
                  />
                </div>
              </div>
              <button
                type="button"
                className="gateway-lr-schema-entry-remove"
                draggable={false}
                aria-label={`Remove Entry ${index + 1}`}
                title={`Remove Entry ${index + 1}`}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onRemoveEntry(index)
                }}
              >
                ×
              </button>
            </div>
          </span>
          )
        })}

        <span className="cloning-schema-plus" aria-hidden>
          +
        </span>

        <button
          type="button"
          className={`cloning-schema-part cloning-schema-vector${
            activePart === 'destination' ? ' is-selected' : ''
          }${destination.ready ? '' : ' is-empty'}`}
          onClick={() => onSelectPart('destination')}
        >
          <div className="cloning-schema-vector-card">
            <div
              className={`cloning-schema-vector-graphic${
                destination.ready ? '' : ' cloning-schema-empty-graphic'
              }`}
            >
              <GatewayPlasmidRingGraphic
                ready={destination.ready}
                backboneColor={destination.color}
                accentColor={GATEWAY_DESTINATION_ENDS_COLOR}
                accentFraction={gatewayDestinationAccentFraction(destination)}
              />
            </div>
            <div className="cloning-schema-part-meta cloning-schema-vector-meta">
              {destinationTitle ? (
                <>
                  <strong className="gateway-schema-entity-name">{destinationTitle}</strong>
                  <span className="gateway-schema-role">Destination Vector</span>
                </>
              ) : (
                <strong>Destination Vector</strong>
              )}
              <span>
                {destination.ready
                  ? `${destination.sequence.length.toLocaleString()} bp`
                  : destination.message}
              </span>
            </div>
          </div>
        </button>

        <span className="cloning-schema-arrow" aria-hidden>
          →
        </span>

        <button
          type="button"
          className={`cloning-schema-part cloning-schema-product gateway-schema-product gateway-lr-schema-product${
            analysisReady ? '' : ' is-empty'
          }${activePart === 'product' ? ' is-selected' : ''} is-closed`}
          onClick={() => onSelectPart('product')}
        >
          <div className="cloning-schema-part-meta">
            <strong className="gateway-schema-entity-name">Expression Clone</strong>
            <span>
              {analysisReady && productLength != null
                ? `${productLength.toLocaleString()} bp`
                : analysisMessage}
            </span>
          </div>
          <GatewayLrAssemblyDiagramView model={assemblyModel} compact />
        </button>
      </div>
    </section>
  )
}

function preferDefaultDonorId(list: GatewayVectorCatalogEntry[]): string | null {
  const p221 =
    list.find((entry) => entry.fileName === 'pDONR221.json') ??
    list.find((entry) => /pDONR221/i.test(entry.label) && !/\sP\d/i.test(entry.label))
  if (p221) return p221.id
  const p207 =
    list.find((entry) => entry.fileName === 'pDONR207.json') ??
    list.find((entry) => /pDONR207/i.test(entry.label))
  if (p207) return p207.id
  return list[0]?.id ?? null
}

export function GatewayCloningDialog({
  active = true,
  currentRecord,
  currentTabId,
  cloningMethod: initialMethod = 'bp',
  initialSelectedRange = null,
  onCancel,
  onClone,
  renderWorkspace,
  primerHybridization = defaultPrimerHybridizationParams,
}: GatewayCloningDialogProps) {
  const alignPending = useTraceAlignment()
  const titleId = useId()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const massFileInputRef = useRef<HTMLInputElement | null>(null)
  const massFileTargetRef = useRef<GatewayMassSlot>('insert')
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const methodMenuRef = useRef<HTMLDivElement | null>(null)
  const cloneMenuRef = useRef<HTMLDivElement | null>(null)
  useClampDialogToViewport(dialogRef)

  const initialLibrarySources = currentRecord.dna?.documentRole === 'library'
    ? expandGatewayBatchSources([{ key: `current:${currentRecord.id}`, record: currentRecord }])
    : []

  const [selectedMethod, setSelectedMethod] = useState<GatewayCloningMethod>(initialMethod)
  const [methodMenuOpen, setMethodMenuOpen] = useState(false)
  const [activePart, setActivePart] = useState<ActivePartId>(
    initialMethod === 'lr' ? 'entry-0' : 'insert',
  )
  const [insert, setInsert] = useState<GatewayInsertConfig>(() =>
    defaultGatewayInsertConfig(initialLibrarySources[0]?.record ?? currentRecord, {
      selectedRange: initialSelectedRange
        ? normalizeGatewayAmplifyRange(currentRecord, initialSelectedRange)
        : null,
    }),
  )
  const [vector, setVector] = useState<GatewayVectorConfig>(() => defaultGatewayVectorConfig())
  const [entries, setEntries] = useState<GatewayEntryConfig[]>(() => [
    defaultGatewayEntryConfig(
      initialMethod === 'lr'
        ? initialLibrarySources[0]?.record ?? (currentRecord.topology === 'circular' ? currentRecord : null)
        : null,
    ),
  ])
  const [destination, setDestination] = useState<GatewayVectorConfig>(() => defaultGatewayVectorConfig())
  const [catalog, setCatalog] = useState<GatewayVectorCatalog | null>(null)
  const [standardRecord, setStandardRecord] = useState<SequenceRecord | null>(null)
  const [standardDestinationRecord, setStandardDestinationRecord] = useState<SequenceRecord | null>(
    null,
  )
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [databasePickerOpen, setDatabasePickerOpen] = useState(false)
  const [productName, setProductName] = useState(
    initialLibrarySources.length
      ? initialMethod === 'lr'
        ? `Expression ${GATEWAY_ENTRY_NAMES_TOKEN}.dna`
        : `Entry ${GATEWAY_INSERT_NAME_TOKEN}.dna`
      : initialMethod === 'lr' ? 'Expression Clone.dna' : 'Entry Clone.dna',
  )
  const [closeOnClone, setCloseOnClone] = useState(true)
  const [productStrainId, setProductStrainId] = useState(
    () =>
      currentRecord.construct.bacterialTransformationStrain ??
      defaultConstructProperties.bacterialTransformationStrain ??
      '',
  )
  const [fileTarget, setFileTarget] = useState<FileTarget>({ kind: 'insert' })
  const [attBPrimersOpen, setAttBPrimersOpen] = useState(false)
  /** BP clones queued as Entry clones for a later / immediate LR session. */
  const [lrHandoffEntries, setLrHandoffEntries] = useState<SequenceRecord[]>([])
  const [massSourcesBySlot, setMassSourcesBySlot] = useState<Record<string, GatewayBatchSourceChoice[]>>(() =>
    initialLibrarySources.length
      ? { [initialMethod === 'lr' ? 'entry-0' : 'insert']: initialLibrarySources }
      : {},
  )
  const [massPreviewBySlot, setMassPreviewBySlot] = useState<Record<string, number>>({})
  const [massExcludedBySlot, setMassExcludedBySlot] = useState<Record<string, string[]>>({})
  const [massExclusionSlot, setMassExclusionSlot] = useState<GatewayMassSlot | null>(null)
  const [massDatabaseSlot, setMassDatabaseSlot] = useState<GatewayMassSlot | null>(null)
  const [massOpenSlot, setMassOpenSlot] = useState<GatewayMassSlot | null>(null)
  const [massStandardSlot, setMassStandardSlot] = useState<'donor' | 'destination' | null>(null)
  const [massNamesOpen, setMassNamesOpen] = useState(false)
  const [massProductNames, setMassProductNames] = useState<Record<string, string>>({})
  const [massPrimerOptions, setMassPrimerOptions] = useState<GatewayPrimerDesignOptions | null>(null)
  const [massOutputAsLibrary, setMassOutputAsLibrary] = useState(false)
  const [massOutputLibraryName, setMassOutputLibraryName] = useState('Gateway cloning products')
  const [cloneMenuOpen, setCloneMenuOpen] = useState(false)
  const [batchSaveProducts, setBatchSaveProducts] = useState<SequenceRecord[] | null>(null)
  const [batchSaveLibrary, setBatchSaveLibrary] = useState<SequenceRecord | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchStatus, setBatchStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const next = await loadGatewayVectorCatalog()
        if (cancelled) return
        setCatalog(next)
        setCatalogError(null)
        const preferredId = preferDefaultDonorId(next.donor)
        if (preferredId) {
          setVector((current) =>
            current.standardId ? current : { ...current, standardId: preferredId },
          )
        }
        const preferredDestinationId = preferDefaultDestinationId(next.destination ?? [])
        if (preferredDestinationId) {
          setDestination((current) =>
            current.standardId ? current : { ...current, standardId: preferredDestinationId },
          )
        }
      } catch (error) {
        if (!cancelled) setCatalogError(error instanceof Error ? error.message : String(error))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!catalog || !vector.standardId || vector.source !== 'standard') {
        setStandardRecord(null)
        return
      }
      const entry = catalog.donor.find((item) => item.id === vector.standardId)
      if (!entry) {
        setStandardRecord(null)
        return
      }
      try {
        const record = await loadGatewayStandardVector(entry)
        if (!cancelled) setStandardRecord(record)
      } catch (error) {
        if (!cancelled) {
          setStandardRecord(null)
          setCatalogError(error instanceof Error ? error.message : String(error))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [catalog, vector.standardId, vector.source])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!catalog || !destination.standardId || destination.source !== 'standard') {
        setStandardDestinationRecord(null)
        return
      }
      const entry = (catalog.destination ?? []).find((item) => item.id === destination.standardId)
      if (!entry) {
        setStandardDestinationRecord(null)
        return
      }
      try {
        const record = await loadGatewayStandardVector(entry)
        if (!cancelled) setStandardDestinationRecord(record)
      } catch (error) {
        if (!cancelled) {
          setStandardDestinationRecord(null)
          setCatalogError(error instanceof Error ? error.message : String(error))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [catalog, destination.standardId, destination.source])

  const { options: sourceOptions, refresh: refreshSourceOptions } = useConstructSources({ active, currentRecord, currentTabId })

  useEffect(() => {
    if (
      !active || databasePickerOpen || massDatabaseSlot || massOpenSlot || massStandardSlot || massNamesOpen ||
      massExclusionSlot || batchSaveProducts || batchSaveLibrary
    ) return
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        if (attBPrimersOpen) {
          setAttBPrimersOpen(false)
          return
        }
        if (methodMenuOpen || cloneMenuOpen) {
          setMethodMenuOpen(false)
          setCloneMenuOpen(false)
          return
        }
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [active, attBPrimersOpen, batchSaveLibrary, batchSaveProducts, cloneMenuOpen, databasePickerOpen, massDatabaseSlot, massExclusionSlot, massNamesOpen, massOpenSlot, massStandardSlot, methodMenuOpen, onCancel])

  useEffect(() => {
    if (!active || (!methodMenuOpen && !cloneMenuOpen)) return
    const onPointerDown = (event: PointerEvent) => {
      if (!methodMenuRef.current?.contains(event.target as Node)) setMethodMenuOpen(false)
      if (!cloneMenuRef.current?.contains(event.target as Node)) setCloneMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [active, cloneMenuOpen, methodMenuOpen])

  /** Custom donor accepts circular sequences; include all sources plus open tabs. */
  const donorSourceOptions = useMemo(() => sourceOptions, [sourceOptions])
  const sourceGroups = useMemo(() => groupConstructSourceOptions(sourceOptions), [sourceOptions])
  const donorSourceGroups = useMemo(
    () => groupConstructSourceOptions(donorSourceOptions),
    [donorSourceOptions],
  )

  const resolvedInsert = useMemo(() => resolveGatewayInsert(insert), [insert])
  const resolvedDonor = useMemo(
    () => resolveGatewayDonor(vector, standardRecord),
    [vector, standardRecord],
  )
  const resolvedEntries = useMemo(
    () => entries.map((entry, index) => resolveGatewayEntry(entry, index)),
    [entries],
  )
  const resolvedDestination = useMemo(
    () => resolveGatewayDestination(destination, standardDestinationRecord),
    [destination, standardDestinationRecord],
  )

  useEffect(() => {
    if (selectedMethod !== 'bp') return
    if (!resolvedDonor.ready) return
    const subtypes = attBPrimerSubtypesFromDonor(resolvedDonor)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the selected donor defines the compatible attB subtype pair
    setInsert((current) => {
      if (
        current.attBLeftSubtype === subtypes.left &&
        current.attBRightSubtype === subtypes.right
      ) {
        return current
      }
      return {
        ...current,
        attBLeftSubtype: subtypes.left,
        attBRightSubtype: subtypes.right,
      }
    })
  }, [resolvedDonor, selectedMethod])

  const analysis = useMemo(() => {
    if (selectedMethod === 'lr') {
      return analyzeGatewayLrAssembly(resolvedEntries, resolvedDestination)
    }
    return analyzeGatewayAssembly(resolvedInsert, resolvedDonor, 'bp')
  }, [resolvedDestination, resolvedDonor, resolvedEntries, resolvedInsert, selectedMethod])
  const massMode = Object.values(massSourcesBySlot).some((choices) => choices.length > 0)
  const massBatch = useMemo(() => {
    if (!massMode) return { projectedCount: 0, candidates: [] }
    const choicesFor = (slot: GatewayMassSlot, fallback: SequenceRecord | null) => {
      const configured = massSourcesBySlot[slot]
      if (configured) {
        const excluded = new Set(massExcludedBySlot[slot] ?? [])
        return configured.filter((choice) => !excluded.has(choice.key))
      }
      return fallback ? [{ key: `single:${slot}:${fallback.id}`, record: fallback }] : []
    }

    if (selectedMethod === 'bp') {
      const insertChoices = choicesFor('insert', insert.record)
      const donorChoices = choicesFor('donor', resolvedDonor.ready ? resolvedDonor.source : null)
      const sets = [insertChoices, donorChoices]
      const projectedCount = gatewayBatchCombinationCount(sets)
      const combinations = gatewayBatchCombinations(sets, MAX_GATEWAY_BATCH_COMBINATIONS)
      const primerDesignCache = new Map<string, ReturnType<typeof designGatewayAttBPrimers>>()
      const candidates = combinations.map(([insertChoice, donorChoice]) => {
        let candidateInsert = remapGatewayInsertConfig(insert, insertChoice!.record)
        const candidateDonorConfig: GatewayVectorConfig = {
          source: 'custom',
          standardId: null,
          customRecord: donorChoice!.record,
        }
        const candidateDonor = resolveGatewayDonor(candidateDonorConfig, null)
        if (
          massPrimerOptions && candidateInsert.mode === 'pcr' && candidateInsert.selectedRange &&
          candidateDonor.ready
        ) {
          const subtypes = attBPrimerSubtypesFromDonor(candidateDonor)
          const options: GatewayPrimerDesignOptions = {
            ...massPrimerOptions,
            method: 'bp',
            leftSubtype: subtypes.left,
            rightSubtype: subtypes.right,
          }
          const designKey = [
            insertChoice!.key,
            candidateInsert.selectedRange.start,
            candidateInsert.selectedRange.end,
            options.geneTmC,
            options.siteOrientation,
            options.useAdapterPrimers,
            options.leftSubtype,
            options.rightSubtype,
          ].join('|')
          let designed = primerDesignCache.get(designKey)
          if (designed === undefined) {
            designed = designGatewayAttBPrimers({
              insertRecord: insertChoice!.record,
              amplifyRange: candidateInsert.selectedRange,
              options,
            })
            primerDesignCache.set(designKey, designed)
          }
          if (designed) {
            candidateInsert = {
              ...candidateInsert,
              siteOrientation: options.siteOrientation,
              attBLeftSubtype: options.leftSubtype,
              attBRightSubtype: options.rightSubtype,
              useAdapterPrimers: options.useAdapterPrimers,
              record: mergeGatewayDesignedPrimersOntoRecord(insertChoice!.record, designed.insertPrimers),
              forwardPrimer: designed.insertForward,
              reversePrimer: designed.insertReverse,
              selectedAmpliconId: null,
              selectedRange: designed.amplifyRange,
            }
          }
        }
        const candidateResolvedInsert = resolveGatewayInsert(candidateInsert)
        const candidateAnalysis = analyzeGatewayAssembly(candidateResolvedInsert, candidateDonor, 'bp')
        const key = `insert:${insertChoice!.key}|donor:${donorChoice!.key}`
        return {
          kind: 'bp' as const,
          key,
          choices: [insertChoice!, donorChoice!],
          insertChoice: insertChoice!,
          donorChoice: donorChoice!,
          insertConfig: candidateInsert,
          resolvedInsert: candidateResolvedInsert,
          resolvedDonor: candidateDonor,
          analysis: candidateAnalysis,
          primers: listGatewayAssemblySelectedPrimers(candidateInsert),
          vectorName: donorChoice!.record.name,
          insertName: insertChoice!.record.name,
        }
      })
      return { projectedCount, candidates }
    }

    const entrySets = entries.map((entry, index) =>
      choicesFor(entryPartId(index), entry.record),
    )
    const destinationChoices = choicesFor(
      'destination',
      resolvedDestination.ready ? resolvedDestination.source : null,
    )
    const sets = [...entrySets, destinationChoices]
    const projectedCount = gatewayBatchCombinationCount(sets)
    const combinations = gatewayBatchCombinations(sets, MAX_GATEWAY_BATCH_COMBINATIONS)
    const candidates = combinations.map((combination) => {
      const entryChoices = combination.slice(0, entries.length)
      const destinationChoice = combination[entries.length]!
      const candidateEntries = entryChoices.map((choice, index) =>
        resolveGatewayEntry(defaultGatewayEntryConfig(choice.record), index),
      )
      const candidateDestination = resolveGatewayDestination({
        source: 'custom',
        standardId: null,
        customRecord: destinationChoice.record,
      }, null)
      const candidateAnalysis = analyzeGatewayLrAssembly(candidateEntries, candidateDestination)
      const key = [
        ...entryChoices.map((choice, index) => `entry-${index}:${choice.key}`),
        `destination:${destinationChoice.key}`,
      ].join('|')
      return {
        kind: 'lr' as const,
        key,
        choices: [...entryChoices, destinationChoice],
        entryChoices,
        destinationChoice,
        resolvedEntries: candidateEntries,
        resolvedDestination: candidateDestination,
        analysis: candidateAnalysis,
        primers: candidateEntries.flatMap((entry) => entry.primers),
        vectorName: destinationChoice.record.name,
        insertName: entryChoices.map((choice) => choice.record.name).join(' + '),
      }
    })
    return { projectedCount, candidates }
  }, [entries, insert, massExcludedBySlot, massMode, massPrimerOptions, massSourcesBySlot, resolvedDestination, resolvedDonor, selectedMethod])
  const massCandidates = useMemo(() => massBatch.candidates.map((candidate) => ({
    ...candidate,
    name: (
      massProductNames[candidate.key] ?? (candidate.kind === 'bp'
        ? renderGatewayBpBatchName(
            productName,
            candidate.insertChoice.record.name,
            candidate.donorChoice.record.name,
          )
        : renderGatewayLrBatchName(
            productName,
            candidate.entryChoices.map((choice) => choice.record.name),
            candidate.destinationChoice.record.name,
          ))
    ).trim(),
  })), [massBatch.candidates, massProductNames, productName])
  const cloneableMassCandidates = useMemo(
    () => massCandidates.filter((candidate) => candidate.analysis.ready && Boolean(candidate.name)),
    [massCandidates],
  )
  const failedMassCandidates = useMemo(
    () => massCandidates.filter((candidate) => !candidate.analysis.ready),
    [massCandidates],
  )
  const massNamesValid = useMemo(() => {
    const names = cloneableMassCandidates.map((candidate) => candidate.name.toLocaleLowerCase())
    return names.length > 0 && new Set(names).size === names.length
  }, [cloneableMassCandidates])
  const massTooLarge = massBatch.projectedCount > MAX_GATEWAY_BATCH_COMBINATIONS
  const massReady = massMode && !massTooLarge && massNamesValid && cloneableMassCandidates.length > 0
  const massOutputReady = massReady && (!massOutputAsLibrary || Boolean(massOutputLibraryName.trim()))
  const uniqueMassPrimers = useMemo(
    () => deduplicateGatewayBatchPrimers(cloneableMassCandidates),
    [cloneableMassCandidates],
  )
  const activeMassSlot = activePart === 'product' ? null : activePart
  const activeMassSources = activeMassSlot ? massSourcesBySlot[activeMassSlot] ?? [] : []
  const activeMassIndex = activeMassSlot ? massPreviewBySlot[activeMassSlot] ?? 0 : 0
  const activeMassChoice = activeMassSources[activeMassIndex] ?? activeMassSources[0] ?? null
  const displayMassCandidate = (
    activeMassChoice
      ? cloneableMassCandidates.find((candidate) => candidate.choices.some((choice) => choice.key === activeMassChoice.key))
        ?? massCandidates.find((candidate) => candidate.choices.some((choice) => choice.key === activeMassChoice.key))
      : null
  ) ?? cloneableMassCandidates[0] ?? massCandidates[0] ?? null
  const displayAnalysis = massMode && displayMassCandidate ? displayMassCandidate.analysis : analysis
  const displayResolvedInsert = displayMassCandidate?.kind === 'bp' ? displayMassCandidate.resolvedInsert : resolvedInsert
  const displayInsertConfig = displayMassCandidate?.kind === 'bp' && massPrimerOptions
    ? displayMassCandidate.insertConfig
    : insert
  const displayResolvedDonor = displayMassCandidate?.kind === 'bp' ? displayMassCandidate.resolvedDonor : resolvedDonor
  const displayResolvedEntries = displayMassCandidate?.kind === 'lr' ? displayMassCandidate.resolvedEntries : resolvedEntries
  const displayResolvedDestination = displayMassCandidate?.kind === 'lr' ? displayMassCandidate.resolvedDestination : resolvedDestination
  const preview = useMemo(() => {
    if (selectedMethod === 'lr') {
      return gatewayLrPreviewRecord(displayAnalysis, displayResolvedEntries, displayResolvedDestination)
    }
    return gatewayPreviewRecord(displayAnalysis, displayResolvedInsert, displayResolvedDonor)
  }, [displayAnalysis, displayResolvedDestination, displayResolvedDonor, displayResolvedEntries, displayResolvedInsert, selectedMethod])

  const standardList: GatewayVectorCatalogEntry[] = catalog?.donor ?? []
  const destinationList: GatewayVectorCatalogEntry[] = catalog?.destination ?? []
  const activeEntryIndex = entryIndexFromPart(activePart)
  const isLrMode = selectedMethod === 'lr'
  const pcrEnabled = !isLrMode && insert.mode === 'pcr' && activePart === 'insert'
  const cloneDisabled = !analysis.ready

  const activeRecord =
    activePart === 'product'
      ? preview
      : isLrMode
          ? activePart === 'destination'
          ? displayResolvedDestination.ready
            ? displayResolvedDestination.source
            : destination.source === 'custom'
              ? destination.customRecord
              : standardDestinationRecord
          : activeEntryIndex != null
            ? displayResolvedEntries[activeEntryIndex]?.source ?? entries[activeEntryIndex]?.record ?? null
            : null
        : activePart === 'donor'
          ? displayResolvedDonor.ready
            ? displayResolvedDonor.source
            : vector.source === 'custom'
              ? vector.customRecord
              : standardRecord
          : displayInsertConfig.record

  const includePrimersTab =
    activePart === 'product' ||
    Boolean(activeRecord?.primers?.length) ||
    (!isLrMode && activePart === 'insert')

  const workspaceSelectedRange =
    activePart === 'insert'
      ? displayInsertConfig.selectedRange ??
        (displayInsertConfig.mode === 'pcr' && displayResolvedInsert.selectedAmplicon
          ? {
              start: displayResolvedInsert.selectedAmplicon.regionStart,
              end: displayResolvedInsert.selectedAmplicon.regionEnd,
            }
          : null)
      : null

  const insertAmplifyRange = useMemo(() => {
    if (insert.selectedRange) return insert.selectedRange
    if (insert.mode === 'pcr' && resolvedInsert.selectedAmplicon) {
      return {
        start: resolvedInsert.selectedAmplicon.regionStart,
        end: resolvedInsert.selectedAmplicon.regionEnd,
      }
    }
    return null
  }, [insert.mode, insert.selectedRange, resolvedInsert.selectedAmplicon])

  const insertFeatureName = useMemo(
    () => featureNameForExactRange(insert.record, insertAmplifyRange),
    [insert.record, insertAmplifyRange],
  )

  const shortAmplifyWarnings = useMemo(() => {
    if (!insert.selectedRange || !insert.record) return [] as string[]
    const length = insert.selectedRange.end - insert.selectedRange.start
    const minBp = minGatewayAmplifyBp()
    if (length > 0 && length < minBp) {
      return [
        `attB Insert: selected stretch is ${length} bp (need ≥${minBp} bp for attB PCR primer design).`,
      ]
    }
    return []
  }, [insert.record, insert.selectedRange])

  const attBPrimerTargets = useMemo(
    () =>
      listGatewayPrimerTargets({
        insert,
        insertReady: resolvedInsert.ready,
        assemblyReady: analysis.ready,
        includeReadyInsert: false,
      }),
    [analysis.ready, insert, resolvedInsert.ready],
  )

  const attBPrimerRegenTargets = useMemo(
    () =>
      listGatewayPrimerTargets({
        insert,
        insertReady: resolvedInsert.ready,
        assemblyReady: analysis.ready,
        includeReadyInsert: true,
      }),
    [analysis.ready, insert, resolvedInsert.ready],
  )

  const attBPrimerAction: 'choose' | 'regenerate' | null =
    attBPrimerTargets.length > 0
      ? 'choose'
      : attBPrimerRegenTargets.length > 0
        ? 'regenerate'
        : null

  const activeAttBPrimerTargets =
    attBPrimerAction === 'regenerate' ? attBPrimerRegenTargets : attBPrimerTargets

  const selectedAssemblyPrimers = useMemo(() => listGatewayAssemblySelectedPrimers(insert), [insert])

  const insertSpanLength =
    displayAnalysis.partSpans.find((span) => span.role === 'insert')?.end != null
      ? (displayAnalysis.partSpans.find((span) => span.role === 'insert')!.end -
          displayAnalysis.partSpans.find((span) => span.role === 'insert')!.start)
      : displayResolvedInsert.sequence.length

  const donorSpanLength =
    displayAnalysis.partSpans.find((span) => span.role === 'donor')?.end != null
      ? (displayAnalysis.partSpans.find((span) => span.role === 'donor')!.end -
          displayAnalysis.partSpans.find((span) => span.role === 'donor')!.start)
      : isLrMode
        ? displayResolvedDestination.sequence.length
        : displayResolvedDonor.sequence.length

  function massNameTemplate(method: GatewayCloningMethod, slots: Record<string, GatewayBatchSourceChoice[]>) {
    if (method === 'bp') {
      const inserts = Boolean(slots.insert?.length)
      const donors = Boolean(slots.donor?.length)
      if (inserts && donors) return `Entry ${GATEWAY_DONOR_NAME_TOKEN} + ${GATEWAY_INSERT_NAME_TOKEN}.dna`
      if (donors) return `Entry ${GATEWAY_DONOR_NAME_TOKEN}.dna`
      return `Entry ${GATEWAY_INSERT_NAME_TOKEN}.dna`
    }
    const destinations = Boolean(slots.destination?.length)
    return destinations
      ? `Expression ${GATEWAY_DESTINATION_NAME_TOKEN} + ${GATEWAY_ENTRY_NAMES_TOKEN}.dna`
      : `Expression ${GATEWAY_ENTRY_NAMES_TOKEN}.dna`
  }

  function assignRecordToSlot(slot: GatewayMassSlot, record: SequenceRecord) {
    if (slot === 'insert') {
      setInsert((current) => remapGatewayInsertConfig(current, record))
      setActivePart('insert')
    } else if (slot === 'donor') {
      setVector({ source: 'custom', standardId: null, customRecord: record })
      setActivePart('donor')
    } else if (slot === 'destination') {
      setDestination({ source: 'custom', standardId: null, customRecord: record })
      setActivePart('destination')
    } else {
      const index = entryIndexFromPart(slot)
      if (index == null) return
      setEntries((current) => current.map((entry, entryIndex) =>
        entryIndex === index ? defaultGatewayEntryConfig(record) : entry,
      ))
      setActivePart(slot)
    }
  }

  function chooseMassSources(rawChoices: GatewayBatchSourceChoice[], slot: GatewayMassSlot) {
    const expanded = expandGatewayBatchSources(rawChoices)
    const choices = expanded.filter(
      (choice, index) => expanded.findIndex((candidate) => candidate.key === choice.key) === index,
    )
    if (!choices.length) {
      setBatchStatus('The selected DNA library does not contain any members.')
      return
    }
    const keepBatch = choices.length > 1 || choices.some((choice) => choice.librarySource)
    assignRecordToSlot(slot, choices[0]!.record)
    const next = { ...massSourcesBySlot }
    if (keepBatch) next[slot] = choices
    else delete next[slot]
    setMassSourcesBySlot(next)
    setMassPreviewBySlot((current) => ({ ...current, [slot]: 0 }))
    setMassExcludedBySlot((current) => ({ ...current, [slot]: [] }))
    setMassProductNames({})
    setMassPrimerOptions(null)
    setProductName((current) =>
      /<insert_name>|<donor_name>|<destination_name>|<entry(?:_names|\d+_name)>/i.test(current) ||
      current === 'Entry Clone.dna' || current === 'Expression Clone.dna'
        ? massNameTemplate(selectedMethod, next)
        : current,
    )
    setBatchStatus(keepBatch ? `${choices.length} sources selected for ${slot}.` : '')
  }

  function clearMassSlot(slot: GatewayMassSlot) {
    const next = { ...massSourcesBySlot }
    delete next[slot]
    setMassSourcesBySlot(next)
    setMassExcludedBySlot((current) => {
      const updated = { ...current }
      delete updated[slot]
      return updated
    })
    setMassProductNames({})
    setMassPrimerOptions(null)
    setProductName((current) =>
      /<insert_name>|<donor_name>|<destination_name>|<entry(?:_names|\d+_name)>/i.test(current)
        ? Object.values(next).some((choices) => choices.length)
          ? massNameTemplate(selectedMethod, next)
          : selectedMethod === 'lr' ? 'Expression Clone.dna' : 'Entry Clone.dna'
        : current,
    )
  }

  function navigateMassSlot(slot: GatewayMassSlot, index: number) {
    const choices = massSourcesBySlot[slot] ?? []
    if (!choices.length) return
    const safeIndex = Math.min(Math.max(0, index), choices.length - 1)
    setMassPreviewBySlot((current) => ({ ...current, [slot]: safeIndex }))
    assignRecordToSlot(slot, choices[safeIndex]!.record)
  }

  async function handleMassFiles(files: FileList) {
    const slot = massFileTargetRef.current
    const choices: GatewayBatchSourceChoice[] = []
    for (const file of Array.from(files)) {
      try {
        const buffer = await file.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        const record = isSnapGeneBytes(bytes)
          ? parseSnapGene(bytes, file.name)
          : parseSequenceBytes(buffer, file.name)
        choices.push({ key: `file:${file.name}:${file.size}:${file.lastModified}`, record })
      } catch (error) {
        setBatchStatus(`Could not import ${file.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (choices.length) chooseMassSources(choices, slot)
    if (massFileInputRef.current) massFileInputRef.current.value = ''
  }

  function seedLrEntriesFromRecords(records: SequenceRecord[]) {
    const seeded =
      records.length > 0
        ? records
            .slice(0, MAX_GATEWAY_LR_ENTRIES)
            .map((record) => defaultGatewayEntryConfig(record))
        : [
            defaultGatewayEntryConfig(
              currentRecord.topology === 'circular' ? currentRecord : null,
            ),
          ]
    setEntries(seeded)
    setDestination((current) => ({
      ...defaultGatewayVectorConfig(),
      source: 'standard',
      standardId:
        current.standardId ??
        preferDefaultDestinationId(catalog?.destination ?? []) ??
        null,
    }))
    setProductName('Expression Clone.dna')
    setActivePart('entry-0')
  }

  function appendLrHandoff(record: SequenceRecord): SequenceRecord[] {
    const next = [...lrHandoffEntries.filter((entry) => entry.id !== record.id), record].slice(
      -MAX_GATEWAY_LR_ENTRIES,
    )
    setLrHandoffEntries(next)
    return next
  }

  function resetGatewayStateForMethod(method: GatewayCloningMethod) {
    setMassSourcesBySlot(
      initialLibrarySources.length
        ? { [method === 'lr' ? 'entry-0' : 'insert']: initialLibrarySources }
        : {},
    )
    setMassExcludedBySlot({})
    setMassPreviewBySlot({})
    setMassProductNames({})
    setMassPrimerOptions(null)
    if (method === 'lr') {
      seedLrEntriesFromRecords(
        lrHandoffEntries.length ? lrHandoffEntries : initialLibrarySources.slice(0, 1).map((choice) => choice.record),
      )
      if (initialLibrarySources.length && !lrHandoffEntries.length) {
        setProductName(`Expression ${GATEWAY_ENTRY_NAMES_TOKEN}.dna`)
      }
      return
    }
    setInsert(
      defaultGatewayInsertConfig(currentRecord, {
        selectedRange: initialSelectedRange
          ? normalizeGatewayAmplifyRange(currentRecord, initialSelectedRange)
          : null,
      }),
    )
    setVector((current) => ({
      ...defaultGatewayVectorConfig(),
      source: 'standard',
      standardId: current.standardId ?? preferDefaultDonorId(catalog?.donor ?? []) ?? null,
    }))
    setProductName(initialLibrarySources.length ? `Entry ${GATEWAY_INSERT_NAME_TOKEN}.dna` : 'Entry Clone.dna')
    setActivePart('insert')
  }

  function buildCloneProduct(): SequenceRecord | null {
    if (!analysis.ready) return null
    const constructOverrides = {
      bacterialTransformationStrain: productStrainId || null,
      hostMethylation: methylationForStrain(productStrainId || null),
    }
    if (selectedMethod === 'lr') {
      return assembleGatewayLrProduct({
        entries: resolvedEntries,
        destination: resolvedDestination,
        analysis,
        productName,
        constructOverrides,
      })
    }
    return assembleGatewayProduct({
      insert: resolvedInsert,
      donor: resolvedDonor,
      analysis,
      productName,
      constructOverrides,
    })
  }

  function handleClone() {
    const record = buildCloneProduct()
    if (!record) return
    onClone([record], selectedMethod)
    if (closeOnClone) onCancel()
  }

  function handleCloneAndSendToLr() {
    if (isLrMode || cloneDisabled) return
    const record = buildCloneProduct()
    if (!record) return
    const queued = appendLrHandoff(record)
    onClone([record], 'bp', {
      activate: false,
      statusMessage: `Sent ${record.name} to LR cloning (${queued.length}/${MAX_GATEWAY_LR_ENTRIES} entr${
        queued.length === 1 ? 'y' : 'ies'
      } queued). Ready for the next BP clone.`,
    })
  }

  function handleCloneAndProceedToLr() {
    if (isLrMode || cloneDisabled) return
    const record = buildCloneProduct()
    if (!record) return
    const queued = appendLrHandoff(record)
    onClone([record], 'bp', { activate: false })
    setSelectedMethod('lr')
    seedLrEntriesFromRecords(queued)
  }

  const massBatchResult: MassRestrictionBatchResult | null = massMode ? {
    action: 'gateway',
    cloned: cloneableMassCandidates.map((candidate) => ({
      vectorName: candidate.vectorName,
      insertName: candidate.insertName,
      productName: candidate.name,
    })),
    notCloned: failedMassCandidates.map((candidate) => ({
      vectorName: candidate.vectorName,
      insertName: candidate.insertName,
      reason: candidate.analysis.message,
    })),
  } : null

  function buildMassProducts() {
    if (!massReady) return []
    const constructOverrides = {
      bacterialTransformationStrain: productStrainId || null,
      hostMethylation: methylationForStrain(productStrainId || null),
    }
    return cloneableMassCandidates.map((candidate) => candidate.kind === 'bp'
      ? assembleGatewayProduct({
          insert: candidate.resolvedInsert,
          donor: candidate.resolvedDonor,
          analysis: candidate.analysis,
          productName: candidate.name,
          constructOverrides,
        })
      : assembleGatewayLrProduct({
          entries: candidate.resolvedEntries,
          destination: candidate.resolvedDestination,
          analysis: candidate.analysis,
          productName: candidate.name,
          constructOverrides,
        }),
    )
  }

  async function handleMassCloneOpenAll() {
    if (batchBusy) return
    const products = buildMassProducts()
    if (!products.length) return
    setCloneMenuOpen(false)
    setBatchBusy(true)
    setBatchStatus(massOutputAsLibrary ? 'Preparing library members…' : '')
    try {
      const records = massOutputAsLibrary
        ? [await createRestrictionCloningProductLibraryAsync(products, massOutputLibraryName, alignPending)]
        : products
      onClone(records, selectedMethod, {
        batchResult: massBatchResult ?? undefined,
        statusMessage: massOutputAsLibrary
          ? `Mass ${gatewayMethodLabel(selectedMethod)} finished: opened ${records[0]!.name} with ${products.length} members; ${failedMassCandidates.length} skipped.`
          : `Mass ${gatewayMethodLabel(selectedMethod)} finished: ${products.length} products opened; ${failedMassCandidates.length} skipped.`,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not prepare library: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  function handleMassBpProceedToLr() {
    if (selectedMethod !== 'bp') return
    const products = buildMassProducts()
    if (!products.length) return
    onClone([], 'bp', {
      open: false,
      batchResult: massBatchResult ?? undefined,
      proceedToLrEntries: products,
      statusMessage: `${products.length} Entry clones sent to LR cloning as alternatives in Entry slot 1.`,
    })
    setSelectedMethod('lr')
    setEntries([defaultGatewayEntryConfig(products[0]!)])
    setDestination((current) => ({
      ...defaultGatewayVectorConfig(),
      source: 'standard',
      standardId: current.standardId ?? preferDefaultDestinationId(catalog?.destination ?? []) ?? null,
    }))
    setMassSourcesBySlot({
      'entry-0': products.map((record) => ({ key: `bp-product:${record.id}`, record })),
    })
    setMassExcludedBySlot({})
    setMassPreviewBySlot({ 'entry-0': 0 })
    setMassProductNames({})
    setMassPrimerOptions(null)
    setProductName(`Expression ${GATEWAY_ENTRY_NAMES_TOKEN}.dna`)
    setActivePart('entry-0')
  }

  async function handleMassCloneToDatabase() {
    if (batchBusy) return
    const products = buildMassProducts()
    if (!products.length) return
    setCloneMenuOpen(false)
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
    } else setBatchSaveProducts(products)
  }

  async function saveMassProductsToDatabase(folderId: string | null) {
    if (!batchSaveProducts?.length || batchBusy) return
    setBatchBusy(true)
    try {
      for (let index = 0; index < batchSaveProducts.length; index += 1) {
        const product = batchSaveProducts[index]!
        setBatchStatus(`Saving ${index + 1} of ${batchSaveProducts.length} to Database…`)
        await saveProject(product, { folderId, fileName: normalizeProjectFileName(null, product.name, 'dna') })
      }
      const count = batchSaveProducts.length
      setBatchSaveProducts(null)
      onClone([], selectedMethod, {
        open: false,
        batchResult: massBatchResult ?? undefined,
        statusMessage: `Mass ${gatewayMethodLabel(selectedMethod)} finished: ${count} products saved to Database; ${failedMassCandidates.length} skipped.`,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not save Gateway batch: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  async function saveMassLibraryToDatabase(folderId: string | null) {
    if (!batchSaveLibrary || batchBusy) return
    setBatchBusy(true)
    try {
      await saveProject(batchSaveLibrary, { folderId, fileName: normalizeProjectFileName(null, batchSaveLibrary.name, 'dna') })
      const count = batchSaveLibrary.traceFiles?.length ?? 0
      setBatchSaveLibrary(null)
      onClone([], selectedMethod, {
        open: false,
        batchResult: massBatchResult ?? undefined,
        statusMessage: `Mass ${gatewayMethodLabel(selectedMethod)} finished: ${count} products saved as a library to Database; ${failedMassCandidates.length} skipped.`,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not save Gateway library: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  async function handleMassCloneToFolder() {
    const products = buildMassProducts()
    if (!products.length || batchBusy) return
    setCloneMenuOpen(false)
    if (!isTauriRuntime()) {
      setBatchStatus('Saving a batch to a folder is available in the desktop app.')
      return
    }
    const directory = await pickDesktopDirectory(`Choose folder for ${gatewayMethodLabel(selectedMethod)} products`)
    if (!directory) return
    setBatchBusy(true)
    try {
      if (massOutputAsLibrary) {
        setBatchStatus('Preparing library members…')
        const library = await createRestrictionCloningProductLibraryAsync(products, massOutputLibraryName, alignPending)
        await writeUniqueBytesToDirectory(directory, normalizeProjectFileName(null, library.name, 'dna'), exportSnapGene(library))
      } else {
        for (let index = 0; index < products.length; index += 1) {
          const product = products[index]!
          setBatchStatus(`Saving ${index + 1} of ${products.length} to folder…`)
          await writeUniqueBytesToDirectory(directory, normalizeProjectFileName(null, product.name, 'dna'), exportSnapGene(product))
        }
      }
      onClone([], selectedMethod, {
        open: false,
        batchResult: massBatchResult ?? undefined,
        statusMessage: `Mass ${gatewayMethodLabel(selectedMethod)} finished: ${products.length} products saved${massOutputAsLibrary ? ' as a library' : ' to folder'}; ${failedMassCandidates.length} skipped.`,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not save Gateway batch: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  function addEntryClone() {
    setEntries((current) => {
      if (current.length >= MAX_GATEWAY_LR_ENTRIES) return current
      const next = [...current, defaultGatewayEntryConfig()]
      setActivePart(entryPartId(next.length - 1))
      return next
    })
  }

  function removeEntryClone() {
    if (entries.length <= 1) return
    const removedIndex = entries.length - 1
    setEntries((current) => {
      if (current.length <= 1) return current
      const next = current.slice(0, -1)
      setActivePart((part) => {
        const index = entryIndexFromPart(part)
        if (index == null || index < next.length) return part
        return entryPartId(next.length - 1)
      })
      return next
    })
    clearMassSlot(entryPartId(removedIndex))
  }

  function removeEntryAt(index: number) {
    setEntries((current) => {
      if (index < 0 || index >= current.length) return current
      const removed = current[index]
      if (removed?.record) {
        setLrHandoffEntries((queue) => queue.filter((record) => record.id !== removed.record!.id))
      }
      if (current.length <= 1) {
        setActivePart('entry-0')
        return [defaultGatewayEntryConfig()]
      }
      const next = current.filter((_, entryIndex) => entryIndex !== index)
      setActivePart((part) => {
        const activeIndex = entryIndexFromPart(part)
        if (activeIndex == null) return part
        if (activeIndex === index) return entryPartId(Math.min(index, next.length - 1))
        if (activeIndex > index) return entryPartId(activeIndex - 1)
        return part
      })
      return next
    })
    const shiftSlots = <T,>(current: Record<string, T>) => {
      const next: Record<string, T> = {}
      Object.entries(current).forEach(([key, value]) => {
        const entryIndex = entryIndexFromPart(key as ActivePartId)
        if (entryIndex == null) next[key] = value
        else if (entryIndex < index) next[key] = value
        else if (entryIndex > index) next[entryPartId(entryIndex - 1)] = value
      })
      return next
    }
    setMassSourcesBySlot(shiftSlots)
    setMassExcludedBySlot(shiftSlots)
    setMassPreviewBySlot(shiftSlots)
    setMassProductNames({})
  }

  function reorderEntries(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    setEntries((current) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.length ||
        toIndex >= current.length
      ) {
        return current
      }
      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved!)
      setLrHandoffEntries((queue) => {
        if (queue.length === 0) return queue
        const queueIds = new Set(queue.map((record) => record.id))
        const ordered = next
          .map((entry) => entry.record)
          .filter((record): record is SequenceRecord => !!record && queueIds.has(record.id))
        const orderedIds = new Set(ordered.map((record) => record.id))
        const leftovers = queue.filter((record) => !orderedIds.has(record.id))
        return [...ordered, ...leftovers]
      })
      setActivePart((part) => {
        const activeIndex = entryIndexFromPart(part)
        if (activeIndex == null) return part
        if (activeIndex === fromIndex) return entryPartId(toIndex)
        if (fromIndex < toIndex) {
          if (activeIndex > fromIndex && activeIndex <= toIndex) {
            return entryPartId(activeIndex - 1)
          }
        } else if (activeIndex >= toIndex && activeIndex < fromIndex) {
          return entryPartId(activeIndex + 1)
        }
        return part
      })
      return next
    })
    const order = entries.map((_, index) => index)
    const [movedIndex] = order.splice(fromIndex, 1)
    order.splice(toIndex, 0, movedIndex!)
    const reorderSlots = <T,>(current: Record<string, T>) => {
      const next = { ...current }
      entries.forEach((_, index) => delete next[entryPartId(index)])
      order.forEach((oldIndex, newIndex) => {
        const value = current[entryPartId(oldIndex)]
        if (value !== undefined) next[entryPartId(newIndex)] = value
      })
      return next
    }
    setMassSourcesBySlot(reorderSlots)
    setMassExcludedBySlot(reorderSlots)
    setMassPreviewBySlot(reorderSlots)
    setMassProductNames({})
  }

  function handleAmplifyRangeSelect(range: { start: number; end: number }) {
    if (activePart !== 'insert') return
    const start = Math.min(range.start, range.end)
    const end = Math.max(range.start, range.end)
    if (end - start < 2) return
    setInsert((current) => ({
      ...current,
      mode: 'pcr',
      selectedRange: { start, end },
    }))
  }

  function applyAttBPrimerDesign(options: GatewayPrimerDesignOptions) {
    if (!insert.record || activeAttBPrimerTargets.length === 0) return
    const target = activeAttBPrimerTargets[0]!
    const designed = designGatewayAttBPrimers({
      insertRecord: insert.record,
      amplifyRange: target.amplifyRange,
      options: { ...options, method: selectedMethod },
    })
    if (!designed) {
      window.alert('Could not design attB PCR primers for this selection.')
      return
    }
    setInsert((current) => ({
      ...current,
      mode: 'pcr',
      siteOrientation: options.siteOrientation,
      attBLeftSubtype: options.leftSubtype,
      attBRightSubtype: options.rightSubtype,
      useAdapterPrimers: options.useAdapterPrimers,
      record: mergeGatewayDesignedPrimersOntoRecord(current.record!, designed.insertPrimers),
      forwardPrimer: designed.insertForward,
      reversePrimer: designed.insertReverse,
      selectedAmpliconId: null,
      selectedRange: designed.amplifyRange,
    }))
    if (massMode) setMassPrimerOptions({ ...options, method: 'bp' })
    setAttBPrimersOpen(false)
    setActivePart('product')
  }

  async function handleExportSelectedPrimers() {
    if ((massMode ? uniqueMassPrimers.length : selectedAssemblyPrimers.length) === 0) return
    const baseName = productName.replace(/\.[^.]+$/u, '').trim() || 'Entry Clone'
    await saveTextAs(
      `Primers from ${baseName}.txt`,
      massMode
        ? [
            'Primer\tSequence\tUsed by products',
            ...uniqueMassPrimers.map((entry) => `${entry.primer.name}\t${entry.primer.sequence}\t${entry.productKeys.map((key) => massCandidates.find((candidate) => candidate.key === key)?.name).filter(Boolean).join('; ')}`),
          ].join('\n')
        : exportGatewaySelectedPrimersTsv(insert),
      'text/plain',
    )
  }

  async function handleFile(file: File) {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const record = isSnapGeneBytes(bytes)
      ? parseSnapGene(bytes, file.name)
      : parseSequenceBytes(buffer, file.name)
    const slot: GatewayMassSlot = fileTarget.kind === 'entry'
      ? entryPartId(fileTarget.index)
      : fileTarget.kind === 'donor-custom'
        ? 'donor'
        : fileTarget.kind === 'destination-custom'
          ? 'destination'
          : 'insert'
    if (record.dna?.documentRole === 'library') {
      chooseMassSources([{ key: `file:${file.name}:${file.size}:${file.lastModified}`, record }], slot)
      return
    }
    clearMassSlot(slot)
    if (fileTarget.kind === 'insert') {
      setInsert((current) => ({
        ...defaultGatewayInsertConfig(record),
        useAdapterPrimers: current.useAdapterPrimers,
        siteOrientation: current.siteOrientation,
        attBLeftSubtype: current.attBLeftSubtype,
        attBRightSubtype: current.attBRightSubtype,
      }))
      setActivePart('insert')
    } else if (fileTarget.kind === 'donor-custom') {
      setVector({
        source: 'custom',
        standardId: null,
        customRecord: record,
      })
      setActivePart('donor')
    } else if (fileTarget.kind === 'destination-custom') {
      setDestination({
        source: 'custom',
        standardId: null,
        customRecord: record,
      })
      setActivePart('destination')
    } else {
      setEntries((current) =>
        current.map((entry, index) =>
          index === fileTarget.index ? defaultGatewayEntryConfig(record) : entry,
        ),
      )
      setActivePart(entryPartId(fileTarget.index))
    }
  }

  function selectSource(optionValue: string) {
    const option =
      activePart === 'donor' || activePart === 'destination'
        ? donorSourceOptions.find((entry) => constructSourceOptionValue(entry) === optionValue)
        : sourceOptions.find((entry) => constructSourceOptionValue(entry) === optionValue)
    if (!option) return
    const slot: GatewayMassSlot = activePart === 'product' ? 'insert' : activePart
    if (option.record.dna?.documentRole === 'library') {
      chooseMassSources([{ key: constructSourceOptionValue(option), record: option.record }], slot)
      return
    }
    clearMassSlot(slot)
    if (activePart === 'insert') {
      setInsert((current) => ({
        ...defaultGatewayInsertConfig(option.record),
        mode: current.mode,
        useAdapterPrimers: current.useAdapterPrimers,
        siteOrientation: current.siteOrientation,
        attBLeftSubtype: current.attBLeftSubtype,
        attBRightSubtype: current.attBRightSubtype,
      }))
    } else if (activePart === 'donor') {
      setVector({
        source: 'custom',
        standardId: null,
        customRecord: option.record,
      })
    } else if (activePart === 'destination') {
      setDestination({
        source: 'custom',
        standardId: null,
        customRecord: option.record,
      })
    } else if (activeEntryIndex != null) {
      setEntries((current) =>
        current.map((entry, index) =>
          index === activeEntryIndex ? defaultGatewayEntryConfig(option.record) : entry,
        ),
      )
    }
  }

  const statusMessage = isLrMode
    ? activePart === 'product'
      ? displayAnalysis.message
      : activePart === 'destination'
        ? displayResolvedDestination.message
        : activeEntryIndex != null
          ? displayResolvedEntries[activeEntryIndex]?.message ?? 'Choose an Entry Clone.'
          : displayAnalysis.message
    : activePart === 'insert'
      ? displayResolvedInsert.message
      : activePart === 'donor'
        ? displayResolvedDonor.message
        : displayAnalysis.message

  const workspaceTitle = isLrMode
    ? activePart === 'product'
      ? 'Expression Clone'
      : activePart === 'destination'
        ? 'Destination Vector'
        : activeEntryIndex != null
          ? `Entry ${activeEntryIndex + 1}`
          : 'Entry Clone'
    : activePart === 'product'
      ? 'Entry Clone'
      : activePart === 'donor'
        ? 'Donor Vector'
        : 'attB Insert'

  const productSidebarLabel = isLrMode ? 'Expression Clone' : 'Entry Clone'
  const exclusionChoices = massExclusionSlot
    ? (massSourcesBySlot[massExclusionSlot] ?? []).filter((choice) => Boolean(choice.librarySource))
    : []
  const exclusionCloneableKeys = exclusionChoices
    .filter((choice) => cloneableMassCandidates.some((candidate) =>
      candidate.choices.some((candidateChoice) => candidateChoice.key === choice.key),
    ))
    .map((choice) => choice.key)
  const exclusionFailureReasons = Object.fromEntries(exclusionChoices.map((choice) => {
    const candidate = massCandidates.find((entry) =>
      entry.choices.some((candidateChoice) => candidateChoice.key === choice.key),
    )
    return [choice.key, candidate?.analysis.message ?? 'Not compatible with this Gateway setup']
  }))

  function renderMassSourceControls(slot: GatewayMassSlot) {
    const choices = massSourcesBySlot[slot] ?? []
    const kind = slot === 'donor' || slot === 'destination' ? 'vector' : 'insert'
    return (
      <>
        {choices.length > 0 && (
          <MassRestrictionSourceNavigator
            kind={kind}
            choices={choices}
            index={massPreviewBySlot[slot] ?? 0}
            onChange={(index) => navigateMassSlot(slot, index)}
            onExclude={choices.some((choice) => choice.librarySource) ? () => setMassExclusionSlot(slot) : undefined}
            excludedCount={(massExcludedBySlot[slot] ?? []).length}
          />
        )}
        <button type="button" onClick={() => {
          massFileTargetRef.current = slot
          massFileInputRef.current?.click()
        }}>Multiple files…</button>
        <button type="button" onClick={() => {
          void refreshSourceOptions()
          setMassOpenSlot(slot)
        }}>Multiple open constructs…</button>
        <button type="button" onClick={() => setMassDatabaseSlot(slot)}>Multiple from Database…</button>
      </>
    )
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className="translation-dialog restriction-cloning-dialog ta-gc-cloning-dialog gateway-cloning-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="restriction-cloning-header">
          <h3 id={titleId} className="gibson-method-title">
            <div
              className={`toolbar-edit-menu gibson-method-picker${methodMenuOpen ? ' menu-open' : ''}`}
              ref={methodMenuRef}
            >
              <button
                type="button"
                className="gibson-method-trigger"
                aria-expanded={methodMenuOpen}
                aria-haspopup="menu"
                onClick={() => setMethodMenuOpen((open) => !open)}
              >
                {gatewayMethodLabel(selectedMethod)}
                <span className="sidebar-enzyme-caret" aria-hidden>
                  ▾
                </span>
              </button>
              {methodMenuOpen && (
                <div className="toolbar-edit-dropdown gibson-method-dropdown" role="menu">
                  {GATEWAY_METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      role="menuitem"
                      className="toolbar-edit-item"
                      onClick={() => {
                        if (method !== selectedMethod) {
                          resetGatewayStateForMethod(method)
                        }
                        setSelectedMethod(method)
                        setMethodMenuOpen(false)
                      }}
                    >
                      <span className="toolbar-edit-check" aria-hidden>
                        {selectedMethod === method ? '✓' : ''}
                      </span>
                      {gatewayMethodLabel(method)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </h3>
          <div className="restriction-cloning-part-strip">
            {isLrMode ? (
              <>
                {entries.map((_, index) => (
                  <button
                    key={entryPartId(index)}
                    type="button"
                    className={activePart === entryPartId(index) ? 'is-active' : undefined}
                    onClick={() => setActivePart(entryPartId(index))}
                  >
                    Entry {index + 1}
                  </button>
                ))}
                <button
                  type="button"
                  className={activePart === 'destination' ? 'is-active' : undefined}
                  onClick={() => setActivePart('destination')}
                >
                  Destination Vector
                </button>
                <button
                  type="button"
                  className={activePart === 'product' ? 'is-active' : undefined}
                  onClick={() => setActivePart('product')}
                >
                  Expression Clone
                </button>
                <div className="restriction-cloning-part-actions">
                  <button
                    type="button"
                    onClick={addEntryClone}
                    disabled={entries.length >= MAX_GATEWAY_LR_ENTRIES}
                  >
                    Add Entry Clone
                  </button>
                  <button type="button" onClick={removeEntryClone} disabled={entries.length <= 1}>
                    Remove Entry Clone
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={activePart === 'insert' ? 'is-active' : undefined}
                  onClick={() => setActivePart('insert')}
                >
                  attB Insert
                </button>
                <button
                  type="button"
                  className={activePart === 'donor' ? 'is-active' : undefined}
                  onClick={() => setActivePart('donor')}
                >
                  Donor Vector
                </button>
                <button
                  type="button"
                  className={activePart === 'product' ? 'is-active' : undefined}
                  onClick={() => setActivePart('product')}
                >
                  Entry Clone
                </button>
              </>
            )}
          </div>
        </header>

        <MobileCloningLayout designLabel="Primers & schema">
          <div className="restriction-cloning-main">
            {activeRecord ? (
              renderWorkspace({
                record: activeRecord,
                title: workspaceTitle,
                selectedRange: activePart === 'insert' ? workspaceSelectedRange : null,
                cutStrandSelection: null,
                selectedSites: [],
                segmentHighlights: undefined,
                allowEnzymeSelect: false,
                includePrimersTab,
                allowPrimerSelect: pcrEnabled,
                selectedPrimerIds: [],
                onPrimerSelect: pcrEnabled
                  ? (primerId) => {
                      const primer = insert.record?.primers.find((entry) => entry.id === primerId)
                      if (!primer) return
                      const draft = gatewayPrimerDraftFromPrimer(primer, primer.name || 'Primer')
                      const layouts = resolveDisplayableLayoutsForPrimer(
                        insert.record!.sequence,
                        primer,
                        primerHybridization,
                      )
                      const prefersReverse =
                        layouts.some((layout) => layout.strand === 'reverse') &&
                        !layouts.some((layout) => layout.strand === 'forward')
                      setInsert((current) => {
                        if (prefersReverse) return { ...current, reversePrimer: draft }
                        if (!normalizeDna(current.forwardPrimer.sequence)) {
                          return { ...current, forwardPrimer: draft }
                        }
                        return { ...current, reversePrimer: draft }
                      })
                    }
                  : undefined,
                onRangeSelect:
                  activePart === 'insert' ? handleAmplifyRangeSelect : undefined,
              })
            ) : (
              <div className="cloning-preview-empty">Choose a source sequence.</div>
            )}

            {pcrEnabled && (
              <PcrPrimerPairPanel
                forwardSequence={displayInsertConfig.forwardPrimer.sequence}
                reverseSequence={displayInsertConfig.reversePrimer.sequence}
                forwardLabel="Primer 1"
                reverseLabel="Primer 2"
              >
                <PrimerSelector
                  label="Primer 1"
                  primers={displayInsertConfig.record?.primers ?? []}
                  draft={displayInsertConfig.forwardPrimer}
                  onChange={(draft) =>
                    setInsert((current) => ({
                      ...current,
                      forwardPrimer: draft,
                      selectedAmpliconId: null,
                    }))
                  }
                />
                <PrimerSelector
                  label="Primer 2"
                  primers={displayInsertConfig.record?.primers ?? []}
                  draft={displayInsertConfig.reversePrimer}
                  onChange={(draft) =>
                    setInsert((current) => ({
                      ...current,
                      reversePrimer: draft,
                      selectedAmpliconId: null,
                    }))
                  }
                />
              </PcrPrimerPairPanel>
            )}

            {isLrMode && (
              <GatewayLrEndsPanel
                activePart={activePart}
                entries={displayResolvedEntries}
                destination={displayResolvedDestination}
              />
            )}
            {!isLrMode ? (
              <GatewaySchemaPanel
                insert={displayResolvedInsert}
                donor={displayResolvedDonor}
                insertFeatureName={insertFeatureName}
                analysisReady={displayAnalysis.ready}
                analysisMessage={displayAnalysis.message}
                productLength={displayAnalysis.productLength}
                insertSpanLength={insertSpanLength}
                donorSpanLength={donorSpanLength}
                activePart={activePart}
                onSelectPart={setActivePart}
              />
            ) : (
              <GatewayLrSchemaPanel
                entries={displayResolvedEntries}
                destination={displayResolvedDestination}
                analysisReady={displayAnalysis.ready}
                analysisMessage={displayAnalysis.message}
                productLength={displayAnalysis.productLength}
                activePart={activePart}
                onSelectPart={setActivePart}
                onRemoveEntry={removeEntryAt}
                onReorderEntries={reorderEntries}
              />
            )}
          </div>

          <aside className="restriction-cloning-sidebar">
            <div className="restriction-cloning-sidebar-body">
              {!isLrMode && activePart === 'insert' && (
                <>
                  {renderMassSourceControls('insert')}
                  <label className="restriction-cloning-field">
                    <span>Source of attB Insert</span>
                    <ConstructSourceSelect
                      value={
                        (() => {
                          const option = sourceOptions.find((entry) => entry.record === insert.record)
                          return option ? constructSourceOptionValue(option) : ''
                        })()
                      }
                      groups={sourceGroups}
                      placeholder="Choose…"
                      onOpen={refreshSourceOptions}
                      onChange={(event) => selectSource(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setFileTarget({ kind: 'insert' })
                      fileInputRef.current?.click()
                    }}
                  >
                    Open File…
                  </button>
                  <button type="button" onClick={() => setDatabasePickerOpen(true)}>Database…</button>
                  <label className="restriction-cloning-checkbox">
                    <input
                      type="radio"
                      checked={insert.mode === 'pcr'}
                      onChange={() => setInsert((current) => ({ ...current, mode: 'pcr' }))}
                    />
                    Use as a template for PCR
                  </label>
                  <label className="restriction-cloning-checkbox">
                    <input
                      type="radio"
                      checked={insert.mode === 'direct'}
                      onChange={() => setInsert((current) => ({ ...current, mode: 'direct' }))}
                    />
                    Use directly as the attB Insert
                  </label>
                  {insert.mode === 'pcr' && (
                    <>
                      <label className="restriction-cloning-field">
                        <span>Polymerase for making attB Insert</span>
                        <select value="blunt" disabled>
                          <option value="blunt">Creates Blunt Ends</option>
                        </select>
                      </label>
                      <label className="restriction-cloning-checkbox">
                        <input
                          type="checkbox"
                          checked={insert.useAdapterPrimers}
                          onChange={(event) =>
                            setInsert((current) => ({
                              ...current,
                              useAdapterPrimers: event.target.checked,
                            }))
                          }
                        />
                        <span>
                          Use {formatAttBSiteLabel(insert.attBLeftSubtype)} and{' '}
                          {formatAttBSiteLabel(insert.attBRightSubtype)} adapter primers
                        </span>
                      </label>
                    </>
                  )}
                  {insert.mode === 'pcr' && displayResolvedInsert.amplicons.length > 0 && (
                    <div className="restriction-cloning-fragments">
                      <strong>Amplified Region</strong>
                      <div className="restriction-cloning-fragment-list" role="listbox">
                        {displayResolvedInsert.amplicons.map((amplicon) => (
                          <button
                            key={amplicon.id}
                            type="button"
                            className={
                              displayResolvedInsert.selectedAmplicon?.id === amplicon.id
                                ? 'is-selected'
                                : undefined
                            }
                            onClick={() =>
                              setInsert((current) => ({
                                ...current,
                                selectedAmpliconId: amplicon.id,
                              }))
                            }
                          >
                            {amplicon.regionStart + 1} .. {amplicon.regionEnd} (
                            {amplicon.productSize} bp)
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="restriction-cloning-hint">
                    To choose PCR primers automatically: (1) select region on Insert tab (2) select
                    Donor Vector (3) on Entry Clone press Choose attB PCR Primers
                  </p>
                </>
              )}

              {!isLrMode && activePart === 'donor' && (
                <>
                  {renderMassSourceControls('donor')}
                  <label className="restriction-cloning-checkbox">
                    <input
                      type="radio"
                      checked={vector.source === 'custom'}
                      onChange={() =>
                        setVector((current) => ({
                          ...current,
                          source: 'custom',
                        }))
                      }
                    />
                    Custom Donor Vector (circular OK)
                  </label>
                  {vector.source === 'custom' && (
                    <>
                      <label className="restriction-cloning-field">
                        <span>Source</span>
                        <ConstructSourceSelect
                          value={
                            (() => {
                              const option = donorSourceOptions.find(
                                (entry) => entry.record === vector.customRecord,
                              )
                              return option ? constructSourceOptionValue(option) : ''
                            })()
                          }
                          groups={donorSourceGroups}
                          placeholder="Choose…"
                          onOpen={refreshSourceOptions}
                          onChange={(event) => selectSource(event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setFileTarget({ kind: 'donor-custom' })
                          fileInputRef.current?.click()
                        }}
                      >
                        Open File…
                      </button>
                      <button type="button" onClick={() => setDatabasePickerOpen(true)}>Database…</button>
                    </>
                  )}
                  <label className="restriction-cloning-checkbox">
                    <input
                      type="radio"
                      checked={vector.source === 'standard'}
                      onChange={() => {
                        clearMassSlot('donor')
                        setVector((current) => ({
                          ...current,
                          source: 'standard',
                        }))
                      }}
                    />
                    Standard Donor Vector
                  </label>
                  {vector.source === 'standard' && (
                    <div className="ta-gc-vector-list" role="listbox" aria-label="Standard donor vectors">
                      {catalogError && <p className="restriction-cloning-hint">{catalogError}</p>}
                      {!catalog && !catalogError && (
                        <p className="restriction-cloning-hint">Loading vectors…</p>
                      )}
                      {standardList.length > 1 && (
                        <button type="button" onClick={() => setMassStandardSlot('donor')}>
                          Select multiple standard donor vectors…
                        </button>
                      )}
                      {standardList.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className={vector.standardId === entry.id ? 'is-selected' : undefined}
                          onClick={() => {
                            clearMassSlot('donor')
                            setVector({
                              source: 'standard',
                              standardId: entry.id,
                              customRecord: null,
                            })
                          }}
                        >
                          {entry.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {isLrMode && activeEntryIndex != null && (
                <>
                  {renderMassSourceControls(entryPartId(activeEntryIndex))}
                  <label className="restriction-cloning-field">
                    <span>Source of Entry {activeEntryIndex + 1}</span>
                    <ConstructSourceSelect
                      value={
                        (() => {
                          const option = sourceOptions.find(
                            (entry) => entry.record === entries[activeEntryIndex]?.record,
                          )
                          return option ? constructSourceOptionValue(option) : ''
                        })()
                      }
                      groups={sourceGroups}
                      placeholder="Choose…"
                      onOpen={refreshSourceOptions}
                      onChange={(event) => selectSource(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setFileTarget({ kind: 'entry', index: activeEntryIndex })
                      fileInputRef.current?.click()
                    }}
                  >
                    Open File…
                  </button>
                  <button type="button" onClick={() => setDatabasePickerOpen(true)}>Database…</button>
                  <p className="restriction-cloning-hint">
                    Entry Clones must be circular plasmids with a compatible pair of attL/attR sites.
                  </p>
                </>
              )}

              {isLrMode && activePart === 'destination' && (
                <>
                  {renderMassSourceControls('destination')}
                  <label className="restriction-cloning-checkbox">
                    <input
                      type="radio"
                      checked={destination.source === 'custom'}
                      onChange={() =>
                        setDestination((current) => ({
                          ...current,
                          source: 'custom',
                        }))
                      }
                    />
                    Custom Destination Vector (circular OK)
                  </label>
                  {destination.source === 'custom' && (
                    <>
                      <label className="restriction-cloning-field">
                        <span>Source</span>
                        <ConstructSourceSelect
                          value={
                            (() => {
                              const option = donorSourceOptions.find(
                                (entry) => entry.record === destination.customRecord,
                              )
                              return option ? constructSourceOptionValue(option) : ''
                            })()
                          }
                          groups={donorSourceGroups}
                          placeholder="Choose…"
                          onOpen={refreshSourceOptions}
                          onChange={(event) => selectSource(event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setFileTarget({ kind: 'destination-custom' })
                          fileInputRef.current?.click()
                        }}
                      >
                        Open File…
                      </button>
                      <button type="button" onClick={() => setDatabasePickerOpen(true)}>Database…</button>
                    </>
                  )}
                  <label className="restriction-cloning-checkbox">
                    <input
                      type="radio"
                      checked={destination.source === 'standard'}
                      onChange={() => {
                        clearMassSlot('destination')
                        setDestination((current) => ({
                          ...current,
                          source: 'standard',
                        }))
                      }}
                    />
                    Standard Destination Vector
                  </label>
                  {destination.source === 'standard' && (
                    <div
                      className="ta-gc-vector-list"
                      role="listbox"
                      aria-label="Standard destination vectors"
                    >
                      {catalogError && <p className="restriction-cloning-hint">{catalogError}</p>}
                      {!catalog && !catalogError && (
                        <p className="restriction-cloning-hint">Loading vectors…</p>
                      )}
                      {destinationList.length > 1 && (
                        <button type="button" onClick={() => setMassStandardSlot('destination')}>
                          Select multiple standard destination vectors…
                        </button>
                      )}
                      {destinationList.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className={destination.standardId === entry.id ? 'is-selected' : undefined}
                          onClick={() => {
                            clearMassSlot('destination')
                            setDestination({
                              source: 'standard',
                              standardId: entry.id,
                              customRecord: null,
                            })
                          }}
                        >
                          {entry.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activePart === 'product' && (
                <>
                  {shortAmplifyWarnings.length > 0 && (
                    <div className="restriction-cloning-status is-invalid" role="status">
                      {shortAmplifyWarnings.join(' ')}
                    </div>
                  )}
                  {selectedMethod === 'bp' && attBPrimerAction && (
                    <button type="button" onClick={() => setAttBPrimersOpen(true)}>
                      {attBPrimerAction === 'regenerate'
                        ? 'Regenerate attB PCR Primers'
                        : 'Choose attB PCR Primers…'}
                    </button>
                  )}
                  <div
                    className={`restriction-cloning-status ${
                      displayAnalysis.ready ? 'is-ready' : 'is-invalid'
                    }`}
                    role="status"
                  >
                    {massMode
                      ? massTooLarge
                        ? `${massBatch.projectedCount.toLocaleString()} combinations exceed the ${MAX_GATEWAY_BATCH_COMBINATIONS.toLocaleString()}-product batch limit. Narrow the selections.`
                        : cloneableMassCandidates.length === 0
                          ? `None of the ${massCandidates.length} combinations can be cloned.`
                          : !massNamesValid
                            ? 'Add source-name tokens to the product name or choose unique names.'
                            : `${cloneableMassCandidates.length} of ${massBatch.projectedCount} combinations can be cloned${failedMassCandidates.length ? `; ${failedMassCandidates.length} will be skipped` : ''}.`
                      : statusMessage}
                  </div>
                  <label className="restriction-cloning-field">
                    <span>Bacterial Transformation Strain</span>
                    <select
                      value={productStrainId}
                      onChange={(event) => setProductStrainId(event.target.value)}
                    >
                      <option value="">Unspecified</option>
                      {transformationStrainOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!isLrMode && (
                    <button
                      type="button"
                      disabled={(massMode ? uniqueMassPrimers.length : selectedAssemblyPrimers.length) === 0}
                      onClick={() => void handleExportSelectedPrimers()}
                    >
                      Export Selected Primers
                    </button>
                  )}
                  {massMode && massPrimerOptions && !isLrMode && (
                    <p className="restriction-cloning-hint">
                      Exact donor-aware design uses {uniqueMassPrimers.length} unique primer{uniqueMassPrimers.length === 1 ? '' : 's'} across {cloneableMassCandidates.length} Entry clone{cloneableMassCandidates.length === 1 ? '' : 's'}; identical oligos and adapter primers are reused.
                    </p>
                  )}
                  {batchStatus && <div className="mass-insert-dialog-status" role="status">{batchStatus}</div>}
                </>
              )}

              {activePart !== 'product' && (
                <div
                  className={`restriction-cloning-status ${
                    isLrMode
                      ? activePart === 'destination'
                        ? displayResolvedDestination.ready
                          ? 'is-ready'
                          : 'is-invalid'
                        : activeEntryIndex != null
                          ? displayResolvedEntries[activeEntryIndex]?.ready
                            ? 'is-ready'
                            : 'is-invalid'
                          : 'is-invalid'
                      : activePart === 'insert'
                        ? displayResolvedInsert.ready
                          ? 'is-ready'
                          : 'is-invalid'
                        : displayResolvedDonor.ready
                          ? 'is-ready'
                          : 'is-invalid'
                  }`}
                  role="status"
                >
                  {statusMessage}
                </div>
              )}

              <label className="restriction-cloning-field">
                <span>{massMode ? 'Product name template' : `Create ${productSidebarLabel.toLowerCase()}`}</span>
                <ProductNameInput
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                />
              </label>
              {massMode && (
                <div className="mass-restriction-naming-actions">
                  <button type="button" onClick={() => setMassNamesOpen(true)}>Choose names…</button>
                  <span className="restriction-cloning-hint">
                    {isLrMode
                      ? `Use ${GATEWAY_ENTRY_NAMES_TOKEN}, ${GATEWAY_DESTINATION_NAME_TOKEN}, or per-slot <entry1_name> tokens.`
                      : `Use ${GATEWAY_INSERT_NAME_TOKEN} and ${GATEWAY_DONOR_NAME_TOKEN}.`}
                  </span>
                </div>
              )}
            </div>
            <div className="restriction-cloning-sidebar-actions">
              {massMode ? (
                <MassRestrictionLibraryOutputControls
                  checked={massOutputAsLibrary}
                  name={massOutputLibraryName}
                  onCheckedChange={setMassOutputAsLibrary}
                  onNameChange={setMassOutputLibraryName}
                />
              ) : (
                <label className="restriction-cloning-checkbox">
                  <input
                    type="checkbox"
                    checked={closeOnClone}
                    onChange={(event) => setCloseOnClone(event.target.checked)}
                  />
                  Close
                </label>
              )}
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
              {!massMode && !isLrMode && (
                <>
                  <button
                    type="button"
                    disabled={cloneDisabled}
                    onClick={handleCloneAndSendToLr}
                    title="Clone this Entry and queue it for LR cloning without leaving BP"
                  >
                    Clone and send to LR cloning
                  </button>
                  <button
                    type="button"
                    disabled={cloneDisabled}
                    onClick={handleCloneAndProceedToLr}
                    title="Clone this Entry and open LR cloning with queued entries"
                  >
                    Clone and proceed to LR cloning
                  </button>
                </>
              )}
              {massMode ? (
                <>
                  {!isLrMode && (
                    <button type="button" disabled={!massReady || batchBusy} onClick={handleMassBpProceedToLr}>
                      Clone batch and proceed to LR
                    </button>
                  )}
                  <div ref={cloneMenuRef} className={`restriction-cloning-clone-split${cloneMenuOpen ? ' is-open' : ''}`}>
                    <button type="button" className="primary restriction-cloning-clone-main" disabled={!massOutputReady || batchBusy} onClick={handleMassCloneOpenAll}>
                      Clone and open all
                    </button>
                    <button
                      type="button"
                      className="primary restriction-cloning-clone-chevron"
                      disabled={!massOutputReady || batchBusy}
                      aria-label="Choose destination for mass Gateway cloning"
                      aria-haspopup="menu"
                      aria-expanded={cloneMenuOpen}
                      onClick={() => setCloneMenuOpen((open) => !open)}
                    ><ChevronDown size={14} aria-hidden="true" /></button>
                    {cloneMenuOpen && (
                      <div className="restriction-cloning-clone-menu" role="menu">
                        <button type="button" role="menuitem" onClick={handleMassCloneOpenAll}>Clone and open all</button>
                        <button type="button" role="menuitem" onClick={handleMassCloneToDatabase}>Clone and save to Database…</button>
                        <button type="button" role="menuitem" onClick={() => void handleMassCloneToFolder()}>Clone and save to folder…</button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <button type="button" className="is-primary" disabled={cloneDisabled} onClick={handleClone}>
                  Clone
                </button>
              )}
            </div>
          </aside>
        </MobileCloningLayout>

        <input
          ref={fileInputRef}
          type="file"
          accept={SEQUENCE_OPEN_ACCEPT}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void handleFile(file)
          }}
        />
        <input
          ref={massFileInputRef}
          type="file"
          accept={SEQUENCE_OPEN_ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files?.length) void handleMassFiles(event.target.files)
          }}
        />
      </div>
      {active &&
        !isLrMode &&
        attBPrimersOpen &&
        activeAttBPrimerTargets.length > 0 &&
        attBPrimerAction && (
        <ChooseGatewayAttBPrimersDialog
          sourceName={insert.record?.name ?? 'attB Insert'}
          donorLabel={resolvedDonor.ready ? resolvedDonor.name : null}
          mode={attBPrimerAction}
          regions={activeAttBPrimerTargets.map((target) => ({
            label: target.label,
            amplifyRange: target.amplifyRange,
          }))}
          initialOptions={defaultGatewayPrimerDesignOptions(
            selectedMethod,
            insert,
            resolvedDonor,
          )}
          onCancel={() => setAttBPrimersOpen(false)}
          onConfirm={applyAttBPrimerDesign}
        />
      )}
      {active && databasePickerOpen && (
        <DatabaseConstructPickerDialog
          excludeRecordId={currentRecord.id}
          onCancel={() => setDatabasePickerOpen(false)}
          onSelect={(record) => {
            const slot: GatewayMassSlot = activePart === 'product' ? 'insert' : activePart
            if (record.dna?.documentRole === 'library') {
              chooseMassSources([{ key: `database:${record.id}`, record }], slot)
            } else if (activePart === 'insert') {
              clearMassSlot('insert')
              setInsert((current) => ({
                ...defaultGatewayInsertConfig(record),
                mode: current.mode,
                useAdapterPrimers: current.useAdapterPrimers,
                siteOrientation: current.siteOrientation,
                attBLeftSubtype: current.attBLeftSubtype,
                attBRightSubtype: current.attBRightSubtype,
              }))
            } else if (activePart === 'donor') {
              clearMassSlot('donor')
              setVector({ source: 'custom', standardId: null, customRecord: record })
            } else if (activePart === 'destination') {
              clearMassSlot('destination')
              setDestination({ source: 'custom', standardId: null, customRecord: record })
            } else if (activeEntryIndex != null) {
              clearMassSlot(entryPartId(activeEntryIndex))
              setEntries((current) => current.map((entry, index) =>
                index === activeEntryIndex ? defaultGatewayEntryConfig(record) : entry,
              ))
            }
            setDatabasePickerOpen(false)
          }}
        />
      )}
      {active && massDatabaseSlot && (
        <DatabaseConstructPickerDialog
          multiple
          title={`Choose sources for ${massDatabaseSlot}`}
          onCancel={() => setMassDatabaseSlot(null)}
          onSelectMany={(choices) => {
            chooseMassSources(
              choices.map(({ record, project }) => ({ key: `database:${project.id}`, record })),
              massDatabaseSlot,
            )
            setMassDatabaseSlot(null)
          }}
        />
      )}
      {active && massOpenSlot && (
        <GatewayMultipleSourceDialog
          options={sourceOptions}
          onCancel={() => setMassOpenSlot(null)}
          onConfirm={(options) => {
            chooseMassSources(
              options.map((option) => ({ key: constructSourceOptionValue(option), record: option.record })),
              massOpenSlot,
            )
            setMassOpenSlot(null)
          }}
        />
      )}
      {active && massStandardSlot && (
        <GatewayStandardVectorBatchDialog
          title={`Choose standard ${massStandardSlot} vectors`}
          entries={massStandardSlot === 'donor' ? standardList : destinationList}
          onCancel={() => setMassStandardSlot(null)}
          onConfirm={(selected) => {
            const slot = massStandardSlot
            setMassStandardSlot(null)
            setBatchStatus(`Loading ${selected.length} standard vectors…`)
            void Promise.all(selected.map(async (entry) => ({
              key: `standard:${entry.id}`,
              record: await loadGatewayStandardVector(entry),
            }))).then(
              (choices) => chooseMassSources(choices, slot),
              (error) => setBatchStatus(`Could not load standard vectors: ${error instanceof Error ? error.message : String(error)}`),
            )
          }}
        />
      )}
      {active && massNamesOpen && massMode && (
        <MassRestrictionNamesDialog
          choices={massCandidates.map((candidate) => ({
            key: candidate.key,
            vectorName: candidate.vectorName,
            insertName: candidate.insertName,
          }))}
          initialNames={Object.fromEntries(massCandidates.map((candidate) => [candidate.key, candidate.name]))}
          eligibleChoiceKeys={cloneableMassCandidates.map((candidate) => candidate.key)}
          failureReasons={Object.fromEntries(failedMassCandidates.map((candidate) => [candidate.key, candidate.analysis.message]))}
          vectorLabel={isLrMode ? 'Destination' : 'Donor'}
          insertLabel={isLrMode ? 'Entry clones' : 'attB Insert'}
          onCancel={() => setMassNamesOpen(false)}
          onConfirm={(names) => {
            setMassProductNames(names)
            setMassNamesOpen(false)
          }}
        />
      )}
      {active && massExclusionSlot && exclusionChoices.length > 0 && (
        <MassRestrictionLibraryMembersDialog
          choices={exclusionChoices}
          cloneableChoiceKeys={exclusionCloneableKeys}
          excludedChoiceKeys={massExcludedBySlot[massExclusionSlot] ?? []}
          failureReasons={exclusionFailureReasons}
          onCancel={() => setMassExclusionSlot(null)}
          onConfirm={(excluded) => {
            setMassExcludedBySlot((current) => ({ ...current, [massExclusionSlot]: excluded }))
            setMassProductNames({})
            setMassExclusionSlot(null)
          }}
        />
      )}
      {active && batchSaveProducts && (
        <SaveToDatabaseDialog
          recordName={`${batchSaveProducts.length} Gateway products`}
          initialFileName="products.dna"
          title="Save Gateway products to Database"
          confirmLabel="Save here"
          allowCreateFolder
          status={batchStatus}
          busy={batchBusy}
          onCancel={() => { if (!batchBusy) setBatchSaveProducts(null) }}
          onConfirm={saveMassProductsToDatabase}
        />
      )}
      {active && batchSaveLibrary && (
        <SaveToDatabaseDialog
          recordName={`${batchSaveLibrary.name} (${batchSaveLibrary.traceFiles?.length ?? 0} members)`}
          initialFileName={`${batchSaveLibrary.name}.dna`}
          title="Save Gateway product library to Database"
          confirmLabel="Save here"
          allowCreateFolder
          status={batchStatus}
          busy={batchBusy}
          onCancel={() => { if (!batchBusy) setBatchSaveLibrary(null) }}
          onConfirm={saveMassLibraryToDatabase}
        />
      )}
    </div>
  )
}
