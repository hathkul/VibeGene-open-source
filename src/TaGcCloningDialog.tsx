import { useTraceAlignment } from './presentation/hooks/traceAlignmentContext'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { exportPrimerDataTsv } from './domain/primerExport'
import { calculateAnnealTemperature } from './domain/primerThermodynamics'
import { defaultPrimerHybridizationParams } from './domain/primerHybridization'
import type { PrimerHybridizationParams } from './domain/primerHybridization'
import { resolveDisplayableLayoutsForPrimer } from './domain/primerSequenceLayout'
import { normalizeDna, reverseComplement } from './domain/sequence'
import {
  analyzeTaGcAssembly,
  assembleTaGcProduct,
  defaultTaGcInsertConfig,
  defaultTaGcVectorConfig,
  formatTaGcStickyPreview,
  loadTaGcCommercialVector,
  loadTaGcVectorCatalog,
  resolveTaGcInsert,
  resolveTaGcVector,
  TA_GC_METHODS,
  taGcMethodLabel,
  taGcPreviewRecord,
  taGcPrimerDraftFromPrimer,
  formatTaGcProductJunctions,
  type TaGcCloningMethod,
  type TaGcInsertConfig,
  type TaGcInsertPolymerase,
  type TaGcJunctionGlyph,
  type TaGcPrimerDraft,
  type TaGcVectorCatalog,
  type TaGcVectorCatalogEntry,
  type TaGcVectorConfig,
  type ResolvedTaGcPart,
} from './domain/taGcCloning'
import {
  defaultTaGcPrimerDesignOptions,
  designTaGcPrimersForInsert,
  listTaGcAssemblySelectedPrimers,
  listTaGcPrimerTargets,
  mergeTaGcDesignedPrimersOntoRecord,
  minTaGcAmplifyBp,
  type TaGcPrimerDesignOptions,
} from './domain/taGcOverlapPrimers'
import { pickDesktopDirectory, saveTextAs, writeUniqueBytesToDirectory } from './desktop/fileIo'
import type { Primer, SequenceRecord } from './domain/types'
import { useClampDialogToViewport } from './ui/useClampDialogToViewport'
import {
  MASS_INSERT_NAME_TOKEN,
  MASS_VECTOR_NAME_TOKEN,
  constructNameStem,
  createRestrictionCloningProductLibraryAsync,
  expandRestrictionInsertSources,
  renderMassRestrictionProductName,
  restrictionBatchPairs,
  type RestrictionBatchSourceChoice,
} from './domain/restrictionCloningBatch'
import { isTauriRuntime } from './desktop/tauriRuntime'
import { normalizeProjectFileName, saveProject } from './storage/projects'

type ActivePartId = 'insert' | 'vector' | 'product'

type TaGcCloningDialogProps = {
  primerHybridization?: PrimerHybridizationParams
  active?: boolean
  currentRecord: SequenceRecord
  currentTabId: string
  cloningMethod?: TaGcCloningMethod
  onCancel: () => void
  onClone: (
    records: SequenceRecord[],
    method: TaGcCloningMethod,
    options?: { open?: boolean; statusMessage?: string; batchResult?: MassRestrictionBatchResult },
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

function remapTaGcInsertConfig(template: TaGcInsertConfig, record: SequenceRecord): TaGcInsertConfig {
  const selectedRange = template.selectedRange
    ? {
        start: Math.min(template.selectedRange.start, record.sequence.length),
        end: Math.min(template.selectedRange.end, record.sequence.length),
      }
    : null
  return {
    ...template,
    record,
    selectedRange: selectedRange && selectedRange.end > selectedRange.start ? selectedRange : null,
    selectedAmpliconId: null,
    forwardPrimer: { ...template.forwardPrimer, sourcePrimerId: null },
    reversePrimer: { ...template.reversePrimer, sourcePrimerId: null },
  }
}

function ChooseTaGcPrimersDialog({
  method,
  regions,
  initialOptions,
  mode = 'choose',
  onCancel,
  onConfirm,
}: {
  method: TaGcCloningMethod
  regions: Array<{ label: string; amplifyRange: { start: number; end: number } }>
  initialOptions: TaGcPrimerDesignOptions
  mode?: 'choose' | 'regenerate'
  onCancel: () => void
  onConfirm: (options: TaGcPrimerDesignOptions) => void
}) {
  const [options, setOptions] = useState<TaGcPrimerDesignOptions>(initialOptions)
  const dialogTitle =
    mode === 'regenerate' ? 'Regenerate PCR primers' : 'Choose PCR primers'
  const confirmLabel = mode === 'regenerate' ? 'Regenerate primers' : 'Design primers'

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
          <span className="muted">{taGcMethodLabel(method)}</span>
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

          <p className="restriction-cloning-hint">
            Primers are gene-specific (anneal-only). 3′ {method === 'gc' ? 'G' : 'A'} overhangs for{' '}
            {taGcMethodLabel(method)} come from the insert polymerase.
          </p>
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

function TaGcMultipleSourceDialog({
  options,
  topology,
  onCancel,
  onConfirm,
}: {
  options: ConstructSourceOption[]
  topology?: SequenceRecord['topology']
  onCancel: () => void
  onConfirm: (options: ConstructSourceOption[]) => void
}) {
  const available = topology ? options.filter((option) => option.record.topology === topology) : options
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
          {available.map((option) => {
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
              onClick={() => onConfirm(available.filter((option) => selected.has(constructSourceOptionValue(option))))}
            >
              Add to cloning
            </button>
          </div>
        </footer>
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
  draft: TaGcPrimerDraft
  disabled?: boolean
  onChange: (next: TaGcPrimerDraft) => void
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
            onChange(taGcPrimerDraftFromPrimer(primer, label))
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

function capsulePerimeterPath(cx: number, cy: number, halfWidth: number, halfHeight: number) {
  const r = halfHeight
  const left = cx - halfWidth + r
  const right = cx + halfWidth - r
  const top = cy - halfHeight
  const bottom = cy + halfHeight
  return [
    `M ${cx} ${top}`,
    `L ${right} ${top}`,
    `A ${r} ${r} 0 0 1 ${right} ${bottom}`,
    `L ${left} ${bottom}`,
    `A ${r} ${r} 0 0 1 ${left} ${top}`,
    `L ${cx} ${top}`,
  ].join(' ')
}

function TaGcProductGraphic({
  insertLength,
  vectorLength,
  insertColor,
  vectorColor,
  productLength,
  ready,
}: {
  insertLength: number
  vectorLength: number
  insertColor: string
  vectorColor: string
  productLength: number | null
  ready: boolean
}) {
  const cx = 110
  const cy = 48
  const halfWidth = 98
  const halfHeight = 34
  const r = halfHeight
  const straight = Math.max(0, 2 * (halfWidth - r))
  const perimeter = straight * 2 + 2 * Math.PI * r

  if (!ready || insertLength <= 0 || vectorLength <= 0) {
    return (
      <div className="ta-gc-product-graphic cloning-schema-empty-graphic">
        <svg viewBox="0 0 220 96" aria-hidden>
          <path
            d={capsulePerimeterPath(cx, cy, halfWidth, halfHeight)}
            fill="none"
            stroke="var(--vg-cloning-diagram-ink)"
            strokeWidth={10}
            strokeLinecap="butt"
            strokeDasharray={`${perimeter * 0.42} ${perimeter * 0.08}`}
          />
        </svg>
      </div>
    )
  }

  const total = insertLength + vectorLength
  const insertDash = Math.max(8, (insertLength / total) * perimeter)
  const vectorDash = Math.max(8, perimeter - insertDash)
  // Start red insert segment at top-center, then black vector for the rest.
  const dashOffset = insertDash / 2

  return (
    <div className="ta-gc-product-graphic">
      <svg viewBox="0 0 220 96" aria-hidden>
        <path
          d={capsulePerimeterPath(cx, cy, halfWidth, halfHeight)}
          fill="none"
          stroke={vectorColor}
          strokeWidth={10}
          strokeLinecap="butt"
          strokeDasharray={`${vectorDash} ${insertDash}`}
          strokeDashoffset={-insertDash + dashOffset}
        />
        <path
          d={capsulePerimeterPath(cx, cy, halfWidth, halfHeight)}
          fill="none"
          stroke={insertColor}
          strokeWidth={10}
          strokeLinecap="butt"
          strokeDasharray={`${insertDash} ${vectorDash}`}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="ta-gc-product-badge">
        <strong>Product</strong>
        <span>{productLength != null ? `${productLength.toLocaleString()} bp` : ''}</span>
      </div>
    </div>
  )
}

function JunctionStrand({ glyphs }: { glyphs: TaGcJunctionGlyph[] }) {
  return (
    <div className="ta-gc-junction-strand" aria-hidden>
      {glyphs.map((glyph, index) => (
        <span
          key={`${glyph.role}-${index}-${glyph.char}`}
          className={`ta-gc-junction-base is-${glyph.role}`}
        >
          {glyph.char}
        </span>
      ))}
    </div>
  )
}

function StickyPreview({ part, side }: { part: ResolvedTaGcPart; side: 'upstream' | 'downstream' }) {
  if (!part.ready) return null
  const preview = formatTaGcStickyPreview(part, side)
  return (
    <div className="cloning-schema-sticky-end" style={{ borderColor: part.color }}>
      <pre className="cloning-schema-sticky-seq">{preview.top}</pre>
      <pre className="cloning-schema-sticky-seq">{preview.bottom}</pre>
    </div>
  )
}

function TaGcSchemaPanel({
  insert,
  vector,
  analysisReady,
  analysisMessage,
  productLength,
  fusedSequence,
  insertSpanEnd,
  insertSpanLength,
  vectorSpanLength,
  overhangLen,
  activePart,
  onSelectPart,
}: {
  insert: ResolvedTaGcPart
  vector: ResolvedTaGcPart
  analysisReady: boolean
  analysisMessage: string
  productLength: number | null
  fusedSequence: string
  insertSpanEnd: number
  insertSpanLength: number
  vectorSpanLength: number
  overhangLen: number
  activePart: ActivePartId
  onSelectPart: (part: ActivePartId) => void
}) {
  const junctions =
    analysisReady && fusedSequence
      ? formatTaGcProductJunctions(fusedSequence, insertSpanEnd, {
          contextBases: 6,
          overhangLen,
        })
      : null

  return (
    <section className="cloning-schema-panel ta-gc-schema-panel" aria-label="AT/GC cloning schema">
      <div className="cloning-schema-row">
        <button
          type="button"
          className={`cloning-schema-part cloning-schema-insert${activePart === 'insert' ? ' is-selected' : ''}${
            insert.ready ? '' : ' is-empty'
          }`}
          onClick={() => onSelectPart('insert')}
        >
          <div className="cloning-schema-part-meta">
            <strong>Insert</strong>
            <span>{insert.ready ? `${insert.sequence.length.toLocaleString()} bp` : insert.message}</span>
          </div>
          {insert.ready && (
            <div className="cloning-schema-insert-bar" style={{ background: insert.color }} />
          )}
          <div className="ta-gc-schema-ends">
            <StickyPreview part={insert} side="upstream" />
            <StickyPreview part={insert} side="downstream" />
          </div>
        </button>

        <span className="cloning-schema-plus" aria-hidden>
          +
        </span>

        <button
          type="button"
          className={`cloning-schema-part cloning-schema-vector${activePart === 'vector' ? ' is-selected' : ''}${
            vector.ready ? '' : ' is-empty'
          }`}
          onClick={() => onSelectPart('vector')}
        >
          <div className="cloning-schema-vector-card">
            <div className={`cloning-schema-vector-graphic${vector.ready ? '' : ' cloning-schema-empty-graphic'}`}>
              <svg viewBox="0 0 160 72" aria-hidden>
                <path
                  d="M 28 58 A 52 52 0 1 1 132 58"
                  fill="none"
                  stroke={vector.ready ? vector.color : 'var(--vg-cloning-diagram-ink)'}
                  strokeWidth={10}
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="cloning-schema-part-meta cloning-schema-vector-meta">
              <strong>Linearized Vector</strong>
              <span>{vector.ready ? `${vector.sequence.length.toLocaleString()} bp` : vector.message}</span>
            </div>
          </div>
          <div className="ta-gc-schema-ends">
            <StickyPreview part={vector} side="upstream" />
            <StickyPreview part={vector} side="downstream" />
          </div>
        </button>

        <span className="cloning-schema-arrow" aria-hidden>
          →
        </span>

        <button
          type="button"
          className={`cloning-schema-part cloning-schema-product ta-gc-schema-product${
            analysisReady ? '' : ' is-empty'
          }${activePart === 'product' ? ' is-selected' : ''} is-closed`}
          onClick={() => onSelectPart('product')}
        >
          <TaGcProductGraphic
            insertLength={insertSpanLength}
            vectorLength={vectorSpanLength}
            insertColor={insert.color}
            vectorColor={vector.color}
            productLength={productLength}
            ready={analysisReady}
          />
          {!analysisReady && (
            <div className="cloning-schema-part-meta">
              <strong>Product</strong>
              <span>{analysisMessage}</span>
            </div>
          )}
          {junctions && (
            <div className="ta-gc-junction-preview" aria-label="Sequence junctions">
              <div className="cloning-schema-sticky-end ta-gc-junction-end">
                <JunctionStrand glyphs={junctions.left.top} />
                <JunctionStrand glyphs={junctions.left.bottom} />
              </div>
              <div className="cloning-schema-sticky-end ta-gc-junction-end">
                <JunctionStrand glyphs={junctions.right.top} />
                <JunctionStrand glyphs={junctions.right.bottom} />
              </div>
            </div>
          )}
        </button>
      </div>
    </section>
  )
}

export function TaGcCloningDialog({
  active = true,
  currentRecord,
  currentTabId,
  cloningMethod: initialMethod = 'ta',
  onCancel,
  onClone,
  renderWorkspace,
  primerHybridization = defaultPrimerHybridizationParams,
}: TaGcCloningDialogProps) {
  const alignPending = useTraceAlignment()
  const titleId = useId()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const massFileInputRef = useRef<HTMLInputElement | null>(null)
  const massFileTargetRef = useRef<'insert' | 'vector'>('insert')
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const methodMenuRef = useRef<HTMLDivElement | null>(null)
  const cloneMenuRef = useRef<HTMLDivElement | null>(null)
  useClampDialogToViewport(dialogRef)

  const initialMassInserts = currentRecord.dna?.documentRole === 'library'
    ? expandRestrictionInsertSources([{ key: `current:${currentRecord.id}`, record: currentRecord }], { topology: 'source' })
    : []

  const [selectedMethod, setSelectedMethod] = useState<TaGcCloningMethod>(initialMethod)
  const [methodMenuOpen, setMethodMenuOpen] = useState(false)
  const [activePart, setActivePart] = useState<ActivePartId>('insert')
  const [insert, setInsert] = useState<TaGcInsertConfig>(() =>
    defaultTaGcInsertConfig(initialMassInserts[0]?.record ?? currentRecord),
  )
  const [vector, setVector] = useState<TaGcVectorConfig>(() => defaultTaGcVectorConfig())
  const [catalog, setCatalog] = useState<TaGcVectorCatalog | null>(null)
  const [commercialRecord, setCommercialRecord] = useState<SequenceRecord | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [databasePickerOpen, setDatabasePickerOpen] = useState(false)
  const [massDatabaseTarget, setMassDatabaseTarget] = useState<'insert' | 'vector' | null>(null)
  const [massOpenTarget, setMassOpenTarget] = useState<'insert' | 'vector' | null>(null)
  const [massSources, setMassSources] = useState<Record<'insert' | 'vector', RestrictionBatchSourceChoice[]>>(() => ({
    insert: initialMassInserts,
    vector: [],
  }))
  const [massPreview, setMassPreview] = useState<Record<'insert' | 'vector', number>>({ insert: 0, vector: 0 })
  const [massExcluded, setMassExcluded] = useState<Record<'insert' | 'vector', string[]>>({ insert: [], vector: [] })
  const [massExclusionTarget, setMassExclusionTarget] = useState<'insert' | 'vector' | null>(null)
  const [massNamesOpen, setMassNamesOpen] = useState(false)
  const [massProductNames, setMassProductNames] = useState<Record<string, string>>({})
  const [massPrimerOptions, setMassPrimerOptions] = useState<TaGcPrimerDesignOptions | null>(null)
  const [massOutputAsLibrary, setMassOutputAsLibrary] = useState(false)
  const [massOutputLibraryName, setMassOutputLibraryName] = useState('AT-GC cloning products')
  const [cloneMenuOpen, setCloneMenuOpen] = useState(false)
  const [batchSaveProducts, setBatchSaveProducts] = useState<SequenceRecord[] | null>(null)
  const [batchSaveLibrary, setBatchSaveLibrary] = useState<SequenceRecord | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchStatus, setBatchStatus] = useState('')
  const [productName, setProductName] = useState(
    initialMassInserts.length ? `Cloned ${MASS_INSERT_NAME_TOKEN}.dna` : 'Cloned.dna',
  )
  const [productStrainId, setProductStrainId] = useState(
    () =>
      currentRecord.construct.bacterialTransformationStrain ??
      defaultConstructProperties.bacterialTransformationStrain ??
      '',
  )
  const [fileTarget, setFileTarget] = useState<'insert' | 'vector-custom'>('insert')
  const [overlapPrimersOpen, setOverlapPrimersOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const next = await loadTaGcVectorCatalog()
        if (cancelled) return
        setCatalog(next)
        setCatalogError(null)
        const list = next[selectedMethod]
        const preferred =
          list.find((entry) => entry.label.includes('pcDNA™5/FRT/V5-His-TOPO')) ?? list[0] ?? null
        if (preferred) {
          setVector((current) =>
            current.commercialId ? current : { ...current, commercialId: preferred.id },
          )
        }
      } catch (error) {
        if (!cancelled) setCatalogError(error instanceof Error ? error.message : String(error))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedMethod])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!catalog || !vector.commercialId || vector.source !== 'commercial') {
        setCommercialRecord(null)
        return
      }
      const entry = catalog[selectedMethod].find((item) => item.id === vector.commercialId)
      if (!entry) {
        setCommercialRecord(null)
        return
      }
      try {
        const record = await loadTaGcCommercialVector(entry)
        if (!cancelled) setCommercialRecord(record)
      } catch (error) {
        if (!cancelled) {
          setCommercialRecord(null)
          setCatalogError(error instanceof Error ? error.message : String(error))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [catalog, selectedMethod, vector.commercialId, vector.source])

  const { options: sourceOptions, refresh: refreshSourceOptions } = useConstructSources({ active, currentRecord, currentTabId })

  useEffect(() => {
    if (
      !active || databasePickerOpen || massDatabaseTarget || massOpenTarget ||
      massNamesOpen || massExclusionTarget || batchSaveProducts || batchSaveLibrary || overlapPrimersOpen
    ) return
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
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
  }, [active, batchSaveLibrary, batchSaveProducts, cloneMenuOpen, databasePickerOpen, massDatabaseTarget, massExclusionTarget, massNamesOpen, massOpenTarget, methodMenuOpen, onCancel, overlapPrimersOpen])

  useEffect(() => {
    if (!active || (!methodMenuOpen && !cloneMenuOpen)) return
    const onPointerDown = (event: PointerEvent) => {
      if (!methodMenuRef.current?.contains(event.target as Node)) setMethodMenuOpen(false)
      if (!cloneMenuRef.current?.contains(event.target as Node)) setCloneMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [active, cloneMenuOpen, methodMenuOpen])

  const linearSourceOptions = useMemo(
    () => sourceOptions.filter((option) => option.record.topology === 'linear'),
    [sourceOptions],
  )
  const sourceGroups = useMemo(() => groupConstructSourceOptions(sourceOptions), [sourceOptions])
  const linearSourceGroups = useMemo(
    () => groupConstructSourceOptions(linearSourceOptions),
    [linearSourceOptions],
  )

  const resolvedInsert = useMemo(
    () => resolveTaGcInsert(insert, selectedMethod),
    [insert, selectedMethod],
  )
  const resolvedVector = useMemo(
    () => resolveTaGcVector(vector, selectedMethod, commercialRecord),
    [vector, selectedMethod, commercialRecord],
  )
  const analysis = useMemo(
    () => analyzeTaGcAssembly(resolvedInsert, resolvedVector, selectedMethod),
    [resolvedInsert, resolvedVector, selectedMethod],
  )
  const massMode = massSources.insert.length > 0 || massSources.vector.length > 0
  const massCandidates = useMemo(() => {
    if (!massMode) return []
    const insertChoices = (massSources.insert.length
      ? massSources.insert.filter((choice) => !massExcluded.insert.includes(choice.key))
      : insert.record
        ? [{ key: `single-insert:${insert.record.id}`, record: insert.record }]
        : [])
    const vectorChoices = (massSources.vector.length
      ? massSources.vector.filter((choice) => !massExcluded.vector.includes(choice.key))
      : resolvedVector.ready
        ? [{ key: `single-vector:${resolvedVector.source.id}`, record: resolvedVector.source }]
        : [])
    return restrictionBatchPairs(vectorChoices, insertChoices).map((pair) => {
      let candidateInsert = remapTaGcInsertConfig(insert, pair.insert.record)
      if (massPrimerOptions && candidateInsert.mode === 'pcr' && candidateInsert.selectedRange) {
        const designed = designTaGcPrimersForInsert({
          insertRecord: pair.insert.record,
          amplifyRange: candidateInsert.selectedRange,
          options: { ...massPrimerOptions, method: selectedMethod },
        })
        if (designed) {
          candidateInsert = {
            ...candidateInsert,
            record: mergeTaGcDesignedPrimersOntoRecord(pair.insert.record, designed.insertPrimers),
            forwardPrimer: designed.insertForward,
            reversePrimer: designed.insertReverse,
            selectedRange: designed.amplifyRange,
            selectedAmpliconId: null,
            polymerase: 'a-or-g-overhang',
          }
        }
      }
      const candidateVectorConfig: TaGcVectorConfig = {
        source: 'custom',
        commercialId: null,
        customRecord: pair.vector.record,
      }
      const candidateResolvedInsert = resolveTaGcInsert(candidateInsert, selectedMethod)
      const candidateResolvedVector = resolveTaGcVector(candidateVectorConfig, selectedMethod, null)
      const candidateAnalysis = analyzeTaGcAssembly(
        candidateResolvedInsert,
        candidateResolvedVector,
        selectedMethod,
      )
      const key = pair.key
      return {
        key,
        insertChoice: pair.insert,
        vectorChoice: pair.vector,
        insertConfig: candidateInsert,
        resolvedInsert: candidateResolvedInsert,
        resolvedVector: candidateResolvedVector,
        analysis: candidateAnalysis,
        name: (
          massProductNames[key] ??
          renderMassRestrictionProductName(productName, pair.insert.record.name, pair.vector.record.name)
        ).trim(),
      }
    })
  }, [insert, massExcluded.insert, massExcluded.vector, massMode, massPrimerOptions, massProductNames, massSources.insert, massSources.vector, productName, resolvedVector, selectedMethod])
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
  const massReady = massMode && cloneableMassCandidates.length > 0 && massNamesValid
  const massOutputReady = massReady && (!massOutputAsLibrary || Boolean(massOutputLibraryName.trim()))
  const activeMassChoices = activePart === 'insert'
    ? massSources.insert
    : activePart === 'vector'
      ? massSources.vector
      : []
  const activeMassIndex = activePart === 'insert' || activePart === 'vector' ? massPreview[activePart] : 0
  const activeMassChoice = activeMassChoices[activeMassIndex] ?? activeMassChoices[0] ?? null
  const displayMassCandidate = (
    activeMassChoice
      ? cloneableMassCandidates.find((candidate) =>
          candidate.insertChoice.key === activeMassChoice.key || candidate.vectorChoice.key === activeMassChoice.key,
        ) ?? massCandidates.find((candidate) =>
          candidate.insertChoice.key === activeMassChoice.key || candidate.vectorChoice.key === activeMassChoice.key,
        )
      : null
  ) ?? cloneableMassCandidates[0] ?? massCandidates[0] ?? null
  const displayResolvedInsert = massMode && displayMassCandidate ? displayMassCandidate.resolvedInsert : resolvedInsert
  const displayResolvedVector = massMode && displayMassCandidate ? displayMassCandidate.resolvedVector : resolvedVector
  const displayAnalysis = massMode && displayMassCandidate ? displayMassCandidate.analysis : analysis
  const displayInsert = massMode && massPrimerOptions && displayMassCandidate
    ? displayMassCandidate.insertConfig
    : insert
  const preview = useMemo(
    () => taGcPreviewRecord(displayAnalysis, displayResolvedInsert, displayResolvedVector),
    [displayAnalysis, displayResolvedInsert, displayResolvedVector],
  )

  const commercialList: TaGcVectorCatalogEntry[] = catalog?.[selectedMethod] ?? []
  const pcrEnabled = displayInsert.mode === 'pcr' && activePart === 'insert'

  const activeRecord =
    activePart === 'product'
      ? preview
      : activePart === 'vector'
        ? displayResolvedVector.ready
          ? displayResolvedVector.source
          : vector.source === 'custom'
            ? vector.customRecord
            : commercialRecord
        : displayInsert.record

  const workspaceSelectedRange =
    activePart === 'insert'
      ? displayInsert.selectedRange ??
        (displayInsert.mode === 'pcr' && displayResolvedInsert.selectedAmplicon
          ? {
              start: displayResolvedInsert.selectedAmplicon.regionStart,
              end: displayResolvedInsert.selectedAmplicon.regionEnd,
            }
          : null)
      : null

  const shortAmplifyWarnings = useMemo(() => {
    if (!insert.selectedRange || !insert.record) return [] as string[]
    const length = insert.selectedRange.end - insert.selectedRange.start
    const minBp = minTaGcAmplifyBp()
    if (length > 0 && length < minBp) {
      return [
        `Insert: selected stretch is ${length} bp (need ≥${minBp} bp for ${taGcMethodLabel(selectedMethod)} PCR primer design).`,
      ]
    }
    return []
  }, [insert.record, insert.selectedRange, selectedMethod])

  const overlapPrimerTargets = useMemo(
    () =>
      listTaGcPrimerTargets({
        insert,
        insertReady: resolvedInsert.ready,
        assemblyReady: analysis.ready,
        includeReadyInsert: false,
      }),
    [analysis.ready, insert, resolvedInsert.ready],
  )

  const overlapPrimerRegenTargets = useMemo(
    () =>
      listTaGcPrimerTargets({
        insert,
        insertReady: resolvedInsert.ready,
        assemblyReady: analysis.ready,
        includeReadyInsert: true,
      }),
    [analysis.ready, insert, resolvedInsert.ready],
  )

  const overlapPrimerAction: 'choose' | 'regenerate' | null =
    overlapPrimerTargets.length > 0
      ? 'choose'
      : overlapPrimerRegenTargets.length > 0
        ? 'regenerate'
        : null

  const activeOverlapPrimerTargets =
    overlapPrimerAction === 'regenerate' ? overlapPrimerRegenTargets : overlapPrimerTargets

  const selectedAssemblyPrimers = useMemo(() => listTaGcAssemblySelectedPrimers(insert), [insert])
  const uniqueMassPrimers = useMemo(() => {
    const bySequence = new Map<string, { primer: Primer; productKeys: string[] }>()
    cloneableMassCandidates.forEach((candidate) => {
      listTaGcAssemblySelectedPrimers(candidate.insertConfig).forEach((primer) => {
        const sequence = normalizeDna(primer.sequence)
        if (!sequence) return
        const existing = bySequence.get(sequence)
        if (existing) existing.productKeys.push(candidate.key)
        else bySequence.set(sequence, { primer, productKeys: [candidate.key] })
      })
    })
    return [...bySequence.values()]
  }, [cloneableMassCandidates])
  const exclusionChoices = massExclusionTarget
    ? massSources[massExclusionTarget].filter((choice) => Boolean(choice.librarySource))
    : []
  const exclusionCloneableKeys = exclusionChoices
    .filter((choice) => cloneableMassCandidates.some((candidate) =>
      candidate.insertChoice.key === choice.key || candidate.vectorChoice.key === choice.key,
    ))
    .map((choice) => choice.key)
  const exclusionFailureReasons = Object.fromEntries(exclusionChoices.map((choice) => {
    const candidate = massCandidates.find((entry) =>
      entry.insertChoice.key === choice.key || entry.vectorChoice.key === choice.key,
    )
    return [choice.key, candidate?.analysis.message ?? 'Not compatible with this cloning setup']
  }))

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

  function applyOverlapPrimerDesign(options: TaGcPrimerDesignOptions) {
    if (!insert.record || activeOverlapPrimerTargets.length === 0) return
    const target = activeOverlapPrimerTargets[0]!
    const designed = designTaGcPrimersForInsert({
      insertRecord: insert.record,
      amplifyRange: target.amplifyRange,
      options: { ...options, method: selectedMethod },
    })
    if (!designed) {
      window.alert('Could not design PCR primers for this selection.')
      return
    }
    setInsert((current) => ({
      ...current,
      mode: 'pcr',
      record: mergeTaGcDesignedPrimersOntoRecord(current.record!, designed.insertPrimers),
      forwardPrimer: designed.insertForward,
      reversePrimer: designed.insertReverse,
      selectedAmpliconId: null,
      selectedRange: designed.amplifyRange,
      polymerase: 'a-or-g-overhang',
    }))
    if (massMode) setMassPrimerOptions({ ...options, method: selectedMethod })
    setOverlapPrimersOpen(false)
    setActivePart('product')
  }

  async function handleExportSelectedPrimers() {
    const primers = massMode ? uniqueMassPrimers.map((entry) => entry.primer) : selectedAssemblyPrimers
    if (primers.length === 0) return
    const baseName = productName.replace(/\.[^.]+$/u, '').trim() || 'Cloned'
    await saveTextAs(
      `Primers from ${baseName}.txt`,
      massMode && uniqueMassPrimers.length
        ? [
            'Primer\tSequence\tUsed by products',
            ...uniqueMassPrimers.map((entry) => `${entry.primer.name}\t${entry.primer.sequence}\t${entry.productKeys.map((key) => massCandidates.find((candidate) => candidate.key === key)?.name).filter(Boolean).join('; ')}`),
          ].join('\n')
        : exportPrimerDataTsv(primers),
      'text/plain',
    )
  }

  async function handleFile(file: File) {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const record = isSnapGeneBytes(bytes)
      ? parseSnapGene(bytes, file.name)
      : parseSequenceBytes(buffer, file.name)
    if (fileTarget === 'insert') {
      if (record.dna?.documentRole === 'library') {
        chooseMassSources([{ key: `file:${file.name}:${file.size}:${file.lastModified}`, record }], 'insert')
        return
      }
      clearMassSource('insert')
      setInsert((current) => ({ ...defaultTaGcInsertConfig(record), polymerase: current.polymerase }))
      setActivePart('insert')
    } else {
      if (record.dna?.documentRole === 'library') {
        chooseMassSources([{ key: `file:${file.name}:${file.size}:${file.lastModified}`, record }], 'vector')
        return
      }
      clearMassSource('vector')
      setVector({
        source: 'custom',
        commercialId: null,
        // Keep topology as-is; circular files are rejected by resolveTaGcVector.
        customRecord: record,
      })
      setActivePart('vector')
    }
  }

  function defaultMassProductTemplate(next: Record<'insert' | 'vector', RestrictionBatchSourceChoice[]>) {
    const inserts = next.insert.length > 0
    const vectors = next.vector.length > 0
    if (inserts && vectors) return `Cloned ${MASS_VECTOR_NAME_TOKEN} with ${MASS_INSERT_NAME_TOKEN}.dna`
    if (vectors) return `Cloned ${MASS_VECTOR_NAME_TOKEN}.dna`
    return `Cloned ${MASS_INSERT_NAME_TOKEN}.dna`
  }

  function clearMassSource(target: 'insert' | 'vector') {
    const next = { ...massSources, [target]: [] }
    setMassSources(next)
    setProductName((name) => /<insert_name>|<vector_name>/i.test(name)
      ? next.insert.length || next.vector.length
        ? defaultMassProductTemplate(next)
        : 'Cloned.dna'
      : name)
    setMassExcluded((current) => ({ ...current, [target]: [] }))
    setMassProductNames({})
    setMassPrimerOptions(null)
  }

  function chooseMassSources(
    rawChoices: RestrictionBatchSourceChoice[],
    target: 'insert' | 'vector',
  ) {
    let choices = expandRestrictionInsertSources(rawChoices, { topology: 'source' })
    if (target === 'vector') choices = choices.filter((choice) => choice.record.topology === 'linear')
    choices = choices.filter(
      (choice, index) => choices.findIndex((candidate) => candidate.key === choice.key) === index,
    )
    if (!choices.length) {
      setBatchStatus(target === 'vector'
        ? 'No linear DNA constructs were found in that selection.'
        : 'The selected DNA library does not contain any members.')
      return
    }
    const keepBatch = choices.length > 1 || choices.some((choice) => choice.librarySource)
    const first = choices[0]!.record
    if (target === 'insert') {
      setInsert((current) => remapTaGcInsertConfig(current, first))
      setActivePart('insert')
    } else {
      setVector({ source: 'custom', commercialId: null, customRecord: first })
      setActivePart('vector')
    }
    const next = { ...massSources, [target]: keepBatch ? choices : [] }
    setMassSources(next)
    setProductName((name) => name === 'Cloned.dna' || /<insert_name>|<vector_name>/i.test(name)
      ? defaultMassProductTemplate(next)
      : name)
    setMassPreview((current) => ({ ...current, [target]: 0 }))
    setMassExcluded((current) => ({ ...current, [target]: [] }))
    setMassProductNames({})
    setMassPrimerOptions(null)
    setBatchStatus(keepBatch ? `${choices.length} ${target}s selected.` : '')
  }

  function navigateMassSource(target: 'insert' | 'vector', index: number) {
    const choices = massSources[target]
    if (!choices.length) return
    const safeIndex = Math.min(Math.max(index, 0), choices.length - 1)
    const record = choices[safeIndex]!.record
    setMassPreview((current) => ({ ...current, [target]: safeIndex }))
    if (target === 'insert') setInsert((current) => remapTaGcInsertConfig(current, record))
    else setVector({ source: 'custom', commercialId: null, customRecord: record })
  }

  async function handleMassFiles(files: FileList) {
    const target = massFileTargetRef.current
    const choices: RestrictionBatchSourceChoice[] = []
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
    if (choices.length) chooseMassSources(choices, target)
    if (massFileInputRef.current) massFileInputRef.current.value = ''
  }

  function handleClone() {
    if (!analysis.ready) return
    const record = assembleTaGcProduct({
      insert: resolvedInsert,
      vector: resolvedVector,
      analysis,
      productName,
      constructOverrides: {
        bacterialTransformationStrain: productStrainId || null,
        hostMethylation: methylationForStrain(productStrainId || null),
      },
    })
    onClone([record], selectedMethod)
  }

  const massBatchResult = massMode ? {
    action: 'ta-gc' as const,
    cloned: cloneableMassCandidates.map((candidate) => ({
      vectorName: candidate.vectorChoice.record.name,
      insertName: candidate.insertChoice.record.name,
      productName: candidate.name,
    })),
    notCloned: failedMassCandidates.map((candidate) => ({
      vectorName: candidate.vectorChoice.record.name,
      insertName: candidate.insertChoice.record.name,
      reason: candidate.analysis.message,
    })),
  } : null

  function buildMassProducts() {
    if (!massReady) return []
    return cloneableMassCandidates.map((candidate) => assembleTaGcProduct({
      insert: candidate.resolvedInsert,
      vector: candidate.resolvedVector,
      analysis: candidate.analysis,
      productName: candidate.name,
      constructOverrides: {
        bacterialTransformationStrain: productStrainId || null,
        hostMethylation: methylationForStrain(productStrainId || null),
      },
    }))
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
          ? `${taGcMethodLabel(selectedMethod)} batch finished: opened ${records[0]!.name} with ${products.length} members; ${failedMassCandidates.length} skipped.`
          : `${taGcMethodLabel(selectedMethod)} batch finished: ${products.length} products opened; ${failedMassCandidates.length} skipped.`,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not prepare library: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
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
        statusMessage: `${taGcMethodLabel(selectedMethod)} batch finished: ${count} products saved to Database; ${failedMassCandidates.length} skipped.`,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not save cloning batch: ${error instanceof Error ? error.message : String(error)}`)
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
        statusMessage: `${taGcMethodLabel(selectedMethod)} batch finished: ${count} products saved as a library to Database; ${failedMassCandidates.length} skipped.`,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not save cloning library: ${error instanceof Error ? error.message : String(error)}`)
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
    const directory = await pickDesktopDirectory(`Choose folder for ${taGcMethodLabel(selectedMethod)} products`)
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
        statusMessage: `${taGcMethodLabel(selectedMethod)} batch finished: ${products.length} products saved${massOutputAsLibrary ? ' as a library' : ' to folder'}; ${failedMassCandidates.length} skipped.`,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not save cloning batch: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  function selectSource(optionValue: string) {
    const option =
      activePart === 'vector'
        ? linearSourceOptions.find((entry) => constructSourceOptionValue(entry) === optionValue)
        : sourceOptions.find((entry) => constructSourceOptionValue(entry) === optionValue)
    if (!option) return
    if (option.record.dna?.documentRole === 'library') {
      chooseMassSources(
        [{ key: constructSourceOptionValue(option), record: option.record }],
        activePart === 'vector' ? 'vector' : 'insert',
      )
      return
    }
    if (activePart === 'insert') {
      clearMassSource('insert')
      setInsert((current) => ({
        ...defaultTaGcInsertConfig(option.record),
        mode: current.mode,
        polymerase: current.polymerase,
      }))
    } else if (activePart === 'vector') {
      if (option.record.topology !== 'linear') return
      clearMassSource('vector')
      setVector({
        source: 'custom',
        commercialId: null,
        customRecord: option.record,
      })
    }
    setMassProductNames({})
    setMassPrimerOptions(null)
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className="translation-dialog restriction-cloning-dialog ta-gc-cloning-dialog"
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
                {taGcMethodLabel(selectedMethod)}
                <span className="sidebar-enzyme-caret" aria-hidden>
                  ▾
                </span>
              </button>
              {methodMenuOpen && (
                <div className="toolbar-edit-dropdown gibson-method-dropdown" role="menu">
                  {TA_GC_METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      role="menuitem"
                      className="toolbar-edit-item"
                      onClick={() => {
                        setSelectedMethod(method)
                        setMassPrimerOptions(null)
                        setMethodMenuOpen(false)
                        setVector((current) => ({ ...current, commercialId: null }))
                        setCommercialRecord(null)
                      }}
                    >
                      <span className="toolbar-edit-check" aria-hidden>
                        {selectedMethod === method ? '✓' : ''}
                      </span>
                      {taGcMethodLabel(method)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </h3>
          <div className="restriction-cloning-part-strip">
            <button
              type="button"
              className={activePart === 'insert' ? 'is-active' : undefined}
              onClick={() => setActivePart('insert')}
            >
              Insert
            </button>
            <button
              type="button"
              className={activePart === 'vector' ? 'is-active' : undefined}
              onClick={() => setActivePart('vector')}
            >
              Linearized Vector
            </button>
            <button
              type="button"
              className={activePart === 'product' ? 'is-active' : undefined}
              onClick={() => setActivePart('product')}
            >
              Product
            </button>
          </div>
        </header>

        <MobileCloningLayout designLabel="Primers & schema">
          <div className="restriction-cloning-main">
            {activeRecord ? (
              renderWorkspace({
                record: activeRecord,
                title:
                  activePart === 'product'
                    ? 'Product'
                    : activePart === 'vector'
                      ? 'Linearized Vector'
                      : 'Insert',
                selectedRange: activePart === 'insert' ? workspaceSelectedRange : null,
                cutStrandSelection: null,
                selectedSites: [],
                segmentHighlights: undefined,
                allowEnzymeSelect: false,
                includePrimersTab: pcrEnabled,
                allowPrimerSelect: pcrEnabled,
                selectedPrimerIds: [],
                onPrimerSelect: pcrEnabled
                  ? (primerId) => {
                      const primer = insert.record?.primers.find((entry) => entry.id === primerId)
                      if (!primer) return
                      const draft = taGcPrimerDraftFromPrimer(primer, primer.name || 'Primer')
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
                forwardSequence={displayInsert.forwardPrimer.sequence}
                reverseSequence={displayInsert.reversePrimer.sequence}
                forwardLabel="Primer 1"
                reverseLabel="Primer 2"
              >
                <PrimerSelector
                  label="Primer 1"
                  primers={displayInsert.record?.primers ?? []}
                  draft={displayInsert.forwardPrimer}
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
                  primers={displayInsert.record?.primers ?? []}
                  draft={displayInsert.reversePrimer}
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

            <TaGcSchemaPanel
              insert={displayResolvedInsert}
              vector={displayResolvedVector}
              analysisReady={displayAnalysis.ready}
              analysisMessage={displayAnalysis.message}
              productLength={displayAnalysis.productLength}
              fusedSequence={displayAnalysis.fusedSequence}
              insertSpanEnd={displayAnalysis.partSpans.find((span) => span.role === 'insert')?.end ?? 0}
              insertSpanLength={
                (displayAnalysis.partSpans.find((span) => span.role === 'insert')?.end ??
                  displayResolvedInsert.sequence.length) -
                (displayAnalysis.partSpans.find((span) => span.role === 'insert')?.start ?? 0)
              }
              vectorSpanLength={
                (displayAnalysis.partSpans.find((span) => span.role === 'vector')?.end ??
                  displayResolvedVector.sequence.length) -
                (displayAnalysis.partSpans.find((span) => span.role === 'vector')?.start ?? 0)
              }
              overhangLen={
                Math.abs(displayResolvedInsert.dnaEnds?.downstream.stickiness ?? 0) > 0 ||
                displayResolvedInsert.schemaOverhangBase
                  ? 1
                  : 0
              }
              activePart={activePart}
              onSelectPart={setActivePart}
            />
          </div>

          <aside className="restriction-cloning-sidebar">
            <div className="restriction-cloning-sidebar-body">
              {activePart === 'insert' && (
                <>
                  {massSources.insert.length > 0 && (
                    <MassRestrictionSourceNavigator
                      kind="insert"
                      choices={massSources.insert}
                      index={massPreview.insert}
                      onChange={(index) => navigateMassSource('insert', index)}
                      onExclude={massSources.insert.some((choice) => choice.librarySource) ? () => setMassExclusionTarget('insert') : undefined}
                      excludedCount={massExcluded.insert.length}
                    />
                  )}
                  <label className="restriction-cloning-field">
                    <span>Source of Insert</span>
                    <ConstructSourceSelect
                      value={(() => {
                        const option = sourceOptions.find((entry) => entry.record === insert.record)
                        return option ? constructSourceOptionValue(option) : ''
                      })()}
                      groups={sourceGroups}
                      placeholder="Choose…"
                      onOpen={refreshSourceOptions}
                      onChange={(event) => selectSource(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setFileTarget('insert')
                      fileInputRef.current?.click()
                    }}
                  >
                    Open File…
                  </button>
                  <button type="button" onClick={() => setDatabasePickerOpen(true)}>Database…</button>
                  <button type="button" onClick={() => {
                    massFileTargetRef.current = 'insert'
                    massFileInputRef.current?.click()
                  }}>Multiple files…</button>
                  <button type="button" onClick={() => {
                    void refreshSourceOptions()
                    setMassOpenTarget('insert')
                  }}>Multiple open constructs…</button>
                  <button type="button" onClick={() => setMassDatabaseTarget('insert')}>Multiple from Database…</button>
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
                    Use directly as the Insert
                  </label>
                  {insert.mode === 'pcr' && (
                    <label className="restriction-cloning-field">
                      <span>Polymerase for making Insert</span>
                      <select
                        value={insert.polymerase}
                        onChange={(event) =>
                          setInsert((current) => ({
                            ...current,
                            polymerase: event.target.value as TaGcInsertPolymerase,
                          }))
                        }
                      >
                        <option value="a-or-g-overhang">Creates 3&apos; A or G Overhangs</option>
                        <option value="blunt">Creates blunt ends</option>
                      </select>
                    </label>
                  )}
                  {insert.mode === 'pcr' && resolvedInsert.amplicons.length > 0 && (
                    <div className="restriction-cloning-fragments">
                      <strong>Amplified Region</strong>
                      <div className="restriction-cloning-fragment-list" role="listbox">
                        {resolvedInsert.amplicons.map((amplicon) => (
                          <button
                            key={amplicon.id}
                            type="button"
                            className={
                              resolvedInsert.selectedAmplicon?.id === amplicon.id
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
                  <div className="restriction-cloning-orientation">
                    <strong>Orientation of Insert</strong>
                    <div className="restriction-cloning-orientation-buttons">
                      <button
                        type="button"
                        className={insert.orientation === 'forward' ? 'is-active' : undefined}
                        onClick={() =>
                          setInsert((current) => ({ ...current, orientation: 'forward' }))
                        }
                      >
                        →
                      </button>
                      <button
                        type="button"
                        className={insert.orientation === 'reverse' ? 'is-active' : undefined}
                        onClick={() =>
                          setInsert((current) => ({ ...current, orientation: 'reverse' }))
                        }
                      >
                        ←
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activePart === 'vector' && (
                <>
                  {massSources.vector.length > 0 && (
                    <MassRestrictionSourceNavigator
                      kind="vector"
                      choices={massSources.vector}
                      index={massPreview.vector}
                      onChange={(index) => navigateMassSource('vector', index)}
                      onExclude={massSources.vector.some((choice) => choice.librarySource) ? () => setMassExclusionTarget('vector') : undefined}
                      excludedCount={massExcluded.vector.length}
                    />
                  )}
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
                    Custom Linearized Vector
                  </label>
                  {vector.source === 'custom' && (
                    <>
                      <label className="restriction-cloning-field">
                        <span>Source</span>
                        <ConstructSourceSelect
                          value={
                            (() => {
                              const option = linearSourceOptions.find(
                                (entry) => entry.record === vector.customRecord,
                              )
                              return option ? constructSourceOptionValue(option) : ''
                            })()
                          }
                          groups={linearSourceGroups}
                          placeholder="Choose…"
                          onOpen={refreshSourceOptions}
                          onChange={(event) => selectSource(event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setFileTarget('vector-custom')
                          fileInputRef.current?.click()
                        }}
                      >
                        Open File…
                      </button>
                      <button type="button" onClick={() => setDatabasePickerOpen(true)}>Database…</button>
                      <button type="button" onClick={() => {
                        massFileTargetRef.current = 'vector'
                        massFileInputRef.current?.click()
                      }}>Multiple files…</button>
                      <button type="button" onClick={() => {
                        void refreshSourceOptions()
                        setMassOpenTarget('vector')
                      }}>Multiple open constructs…</button>
                      <button type="button" onClick={() => setMassDatabaseTarget('vector')}>Multiple from Database…</button>
                    </>
                  )}
                  <label className="restriction-cloning-checkbox">
                    <input
                      type="radio"
                      checked={vector.source === 'commercial'}
                      onChange={() => {
                        clearMassSource('vector')
                        setVector((current) => ({
                          ...current,
                          source: 'commercial',
                        }))
                      }}
                    />
                    Commercial Linearized Vector
                  </label>
                  {vector.source === 'commercial' && (
                    <div className="ta-gc-vector-list" role="listbox" aria-label="Commercial vectors">
                      {catalogError && <p className="restriction-cloning-hint">{catalogError}</p>}
                      {!catalog && !catalogError && (
                        <p className="restriction-cloning-hint">Loading vectors…</p>
                      )}
                      {commercialList.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className={vector.commercialId === entry.id ? 'is-selected' : undefined}
                          onClick={() => {
                            clearMassSource('vector')
                            setVector({
                              source: 'commercial',
                              commercialId: entry.id,
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
                  {displayAnalysis.orientationCompatibleEitherWay && (
                    <p className="restriction-cloning-hint">
                      The insert is compatible in either orientation.
                    </p>
                  )}
                  {shortAmplifyWarnings.length > 0 && (
                    <div className="restriction-cloning-status is-invalid" role="status">
                      {shortAmplifyWarnings.join(' ')}
                    </div>
                  )}
                  {overlapPrimerAction && (
                    <button type="button" onClick={() => setOverlapPrimersOpen(true)}>
                      {overlapPrimerAction === 'regenerate'
                        ? 'Regenerate primers'
                        : 'Choose PCR primers'}
                    </button>
                  )}
                  <div
                    className={`restriction-cloning-status ${
                      displayAnalysis.ready ? 'is-ready' : 'is-invalid'
                    }`}
                  >
                    {massMode
                      ? cloneableMassCandidates.length === 0
                        ? `None of the ${massCandidates.length} combinations can be cloned.`
                        : !massNamesValid
                          ? `Add ${MASS_INSERT_NAME_TOKEN} and/or ${MASS_VECTOR_NAME_TOKEN} to the product name, or choose unique names.`
                          : `${cloneableMassCandidates.length} of ${massCandidates.length} combinations can be cloned${failedMassCandidates.length ? `; ${failedMassCandidates.length} will be skipped` : ''}.`
                      : displayAnalysis.message}
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
                  <button
                    type="button"
                    disabled={(massMode ? uniqueMassPrimers.length : selectedAssemblyPrimers.length) === 0}
                    onClick={() => void handleExportSelectedPrimers()}
                  >
                    Export selected primers
                  </button>
                  {massMode && massPrimerOptions && (
                    <p className="restriction-cloning-hint">
                      Exact batch design uses {uniqueMassPrimers.length} unique primer{uniqueMassPrimers.length === 1 ? '' : 's'} across {cloneableMassCandidates.length} product{cloneableMassCandidates.length === 1 ? '' : 's'}; identical oligos are reused automatically.
                    </p>
                  )}
                  {batchStatus && <div className="mass-insert-dialog-status" role="status">{batchStatus}</div>}
                </>
              )}

              {activePart !== 'product' && (
                <div
                  className={`restriction-cloning-status ${
                    displayAnalysis.ready ? 'is-ready' : 'is-invalid'
                  }`}
                >
                  {activePart === 'insert' ? displayResolvedInsert.message : displayResolvedVector.message}
                </div>
              )}

              <label className="restriction-cloning-field">
                <span>{massMode ? 'Product name template' : 'Create product'}</span>
                <ProductNameInput
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                />
              </label>
              {massMode && (
                <div className="mass-restriction-naming-actions">
                  <button type="button" onClick={() => setMassNamesOpen(true)}>Choose names…</button>
                  <span className="restriction-cloning-hint">
                    Use {MASS_INSERT_NAME_TOKEN} and {MASS_VECTOR_NAME_TOKEN} in the template.
                  </span>
                </div>
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
                <div ref={cloneMenuRef} className={`restriction-cloning-clone-split${cloneMenuOpen ? ' is-open' : ''}`}>
                  <button type="button" className="primary restriction-cloning-clone-main" disabled={!massOutputReady || batchBusy} onClick={handleMassCloneOpenAll}>
                    Clone and open all
                  </button>
                  <button
                    type="button"
                    className="primary restriction-cloning-clone-chevron"
                    disabled={!massOutputReady || batchBusy}
                    aria-label="Choose destination for mass AT/GC cloning"
                    aria-haspopup="menu"
                    aria-expanded={cloneMenuOpen}
                    onClick={() => setCloneMenuOpen((open) => !open)}
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {cloneMenuOpen && (
                    <div className="restriction-cloning-clone-menu" role="menu">
                      <button type="button" role="menuitem" onClick={handleMassCloneOpenAll}>Clone and open all</button>
                      <button type="button" role="menuitem" onClick={handleMassCloneToDatabase}>Clone and save to Database…</button>
                      <button type="button" role="menuitem" onClick={() => void handleMassCloneToFolder()}>Clone and save to folder…</button>
                    </div>
                  )}
                </div>
              ) : (
                <button type="button" className="is-primary" disabled={!analysis.ready} onClick={handleClone}>
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
      {active && overlapPrimersOpen && activeOverlapPrimerTargets.length > 0 && overlapPrimerAction && (
        <ChooseTaGcPrimersDialog
          method={selectedMethod}
          mode={overlapPrimerAction}
          regions={activeOverlapPrimerTargets.map((target) => ({
            label: target.label,
            amplifyRange: target.amplifyRange,
          }))}
          initialOptions={defaultTaGcPrimerDesignOptions(selectedMethod)}
          onCancel={() => setOverlapPrimersOpen(false)}
          onConfirm={applyOverlapPrimerDesign}
        />
      )}
      {active && databasePickerOpen && (
        <DatabaseConstructPickerDialog
          excludeRecordId={currentRecord.id}
          topology={activePart === 'vector' ? 'linear' : undefined}
          onCancel={() => setDatabasePickerOpen(false)}
          onSelect={(record) => {
            if (activePart === 'insert') {
              if (record.dna?.documentRole === 'library') {
                chooseMassSources([{ key: `database:${record.id}`, record }], 'insert')
              } else {
                clearMassSource('insert')
                setInsert((current) => ({
                  ...defaultTaGcInsertConfig(record),
                  mode: current.mode,
                  polymerase: current.polymerase,
                }))
              }
            } else if (record.dna?.documentRole === 'library') {
              chooseMassSources([{ key: `database:${record.id}`, record }], 'vector')
            } else if (record.topology === 'linear') {
              clearMassSource('vector')
              setVector((current) => ({ ...current, source: 'custom', customRecord: record }))
            }
            setDatabasePickerOpen(false)
          }}
        />
      )}
      {active && massDatabaseTarget && (
        <DatabaseConstructPickerDialog
          multiple
          topology={massDatabaseTarget === 'vector' ? 'linear' : undefined}
          title={`Choose ${massDatabaseTarget}s for ${taGcMethodLabel(selectedMethod)}`}
          onCancel={() => setMassDatabaseTarget(null)}
          onSelectMany={(choices) => {
            chooseMassSources(
              choices.map(({ record, project }) => ({ key: `database:${project.id}`, record })),
              massDatabaseTarget,
            )
            setMassDatabaseTarget(null)
          }}
        />
      )}
      {active && massOpenTarget && (
        <TaGcMultipleSourceDialog
          options={sourceOptions}
          topology={massOpenTarget === 'vector' ? 'linear' : undefined}
          onCancel={() => setMassOpenTarget(null)}
          onConfirm={(options) => {
            chooseMassSources(
              options.map((option) => ({ key: constructSourceOptionValue(option), record: option.record })),
              massOpenTarget,
            )
            setMassOpenTarget(null)
          }}
        />
      )}
      {active && massNamesOpen && massMode && (
        <MassRestrictionNamesDialog
          choices={massCandidates.map((candidate) => ({
            key: candidate.key,
            vectorName: constructNameStem(candidate.vectorChoice.record.name, 'Vector'),
            insertName: constructNameStem(candidate.insertChoice.record.name, 'Insert'),
          }))}
          initialNames={Object.fromEntries(massCandidates.map((candidate) => [candidate.key, candidate.name]))}
          eligibleChoiceKeys={cloneableMassCandidates.map((candidate) => candidate.key)}
          failureReasons={Object.fromEntries(failedMassCandidates.map((candidate) => [candidate.key, candidate.analysis.message]))}
          onCancel={() => setMassNamesOpen(false)}
          onConfirm={(names) => {
            setMassProductNames(names)
            setMassNamesOpen(false)
          }}
        />
      )}
      {active && massExclusionTarget && exclusionChoices.length > 0 && (
        <MassRestrictionLibraryMembersDialog
          choices={exclusionChoices}
          cloneableChoiceKeys={exclusionCloneableKeys}
          excludedChoiceKeys={massExcluded[massExclusionTarget]}
          failureReasons={exclusionFailureReasons}
          onCancel={() => setMassExclusionTarget(null)}
          onConfirm={(excluded) => {
            setMassExcluded((current) => ({ ...current, [massExclusionTarget]: excluded }))
            setMassProductNames({})
            setMassExclusionTarget(null)
          }}
        />
      )}
      {active && batchSaveProducts && (
        <SaveToDatabaseDialog
          recordName={`${batchSaveProducts.length} ${taGcMethodLabel(selectedMethod)} products`}
          initialFileName="products.dna"
          title={`Save ${taGcMethodLabel(selectedMethod)} products to Database`}
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
          title={`Save ${taGcMethodLabel(selectedMethod)} product library to Database`}
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
