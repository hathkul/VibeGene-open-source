import { useTraceAlignment } from './presentation/hooks/traceAlignmentContext'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { DatabaseConstructPickerDialog } from './cloning/DatabaseConstructPickerDialog'
import {
  MassRestrictionLibraryMembersDialog,
  MassRestrictionLibraryOutputControls,
  MassRestrictionNamesDialog,
  MassRestrictionSourceNavigator,
  type MassRestrictionBatchResult,
} from './cloning/MassRestrictionCloningDialogs'
import { constructSourceOptionValue, useConstructSources, type ConstructSourceOption } from './cloning/useConstructSources'
import { ConstructSourceSelect } from './cloning/ConstructSourceOptions'
import { ProductNameInput } from './cloning/ProductNameInput'
import type { CloningWorkspaceRenderArgs } from './cloningWorkspaceTypes'
import { MobileCloningLayout } from './MobileCloningLayout'
import { PcrPrimerPairPanel } from './PrimerStructuresPanel'
import { SaveToDatabaseDialog } from './SaveToDatabaseDialog'
import {
  defaultConstructProperties,
  methylationForStrain,
  transformationStrainOptions,
} from './domain/constructProperties'
import {
  defaultEnzymePreferences,
  enzymePoolForSettings,
  loadEnzymePreferences,
} from './domain/enzymePreferences'
import { findRestrictionSites } from './domain/enzymes'
import { SEQUENCE_OPEN_ACCEPT } from './domain/fileFormats'
import {
  analyzeGibsonAssembly,
  assembleGibsonProduct,
  assignGibsonCutSite,
  defaultGibsonLinearizationMode,
  defaultGibsonPartConfig,
  defaultGibsonPrimerDraft,
  formatGibsonOverlapRecommendationHint,
  GIBSON_ASSEMBLY_METHODS,
  gibsonMethodLabel,
  gibsonMethodThresholds,
  gibsonPreviewRecord,
  gibsonPrimerDraftFromPrimer,
  listGibsonAssemblySelectedPrimers,
  minGibsonAmplifyBp,
  resolveGibsonPart,
  suggestGibsonFragmentOrder,
  type GibsonAssemblyMethod,
  type GibsonAssemblyMode,
  type GibsonLinearizationMode,
  type GibsonOverlapGradeLevel,
  type GibsonOverlapRecommendation,
  type GibsonPartConfig,
  type GibsonPrimerDraft,
  type ResolvedGibsonPart,
} from './domain/gibsonAssembly'
import { exportSnapGene, isSnapGeneBytes, parseSequenceBytes, parseSnapGene } from './domain/parsers'
import { exportPrimerDataTsv } from './domain/primerExport'
import { defaultPrimerHybridizationParams } from './domain/primerHybridization'
import type { PrimerHybridizationParams } from './domain/primerHybridization'
import { resolveDisplayableLayoutsForPrimer } from './domain/primerSequenceLayout'
import { calculateAnnealTemperature } from './domain/primerThermodynamics'
import {
  dedupeRestrictionSites,
  filterRestrictionSitesForEnzymeSet,
} from './domain/restrictionSiteFilters'
import { pickDesktopDirectory, saveTextAs, writeUniqueBytesToDirectory } from './desktop/fileIo'
import {
  defaultDigestFragmentId,
  digestFragmentDisplayLabel,
  listDigestFragmentsBetweenCuts,
} from './domain/restrictionCloning'
import {
  defaultGibsonOverlapPrimerOptions,
  designGibsonOverlapPrimersForAssembly,
  listGibsonOverlapPrimerTargets,
  mergeGibsonDesignedPrimersOntoRecord,
  type GibsonOverlapPrimerDesignOptions,
} from './domain/gibsonOverlapPrimers'
import { addOperation, normalizeDna, reverseComplement } from './domain/sequence'
import type { Primer, RestrictionSite, SequenceRecord } from './domain/types'
import { useClampDialogToViewport } from './ui/useClampDialogToViewport'
import {
  GIBSON_PART_NAMES_TOKEN,
  deduplicateGibsonBatchPrimers,
  expandGibsonBatchSources,
  gibsonBatchCombinations,
  remapGibsonPartConfig,
  renderMassGibsonProductName,
  type GibsonBatchSourceChoice,
} from './domain/gibsonAssemblyBatch'
import { createRestrictionCloningProductLibraryAsync } from './domain/restrictionCloningBatch'
import { isTauriRuntime } from './desktop/tauriRuntime'
import { normalizeProjectFileName, saveProject } from './storage/projects'

type ActivePartId = 'vector' | `fragment-${number}` | 'product'

type GibsonAssemblyDialogProps = {
  primerHybridization?: PrimerHybridizationParams
  active?: boolean
  currentRecord: SequenceRecord
  currentTabId: string
  /** Homology chemistry that drives overlap / Tm grading. */
  assemblyMethod?: GibsonAssemblyMethod
  onCancel: () => void
  onAssemble: (
    records: SequenceRecord[],
    method: GibsonAssemblyMethod,
    options?: { open?: boolean; statusMessage?: string; batchResult?: MassRestrictionBatchResult },
  ) => void
  renderWorkspace: (args: CloningWorkspaceRenderArgs) => ReactNode
}

function partIndexFromId(id: ActivePartId): number | null {
  if (id === 'vector' || id === 'product') return null
  return Number(id.replace('fragment-', ''))
}

function applyDesignedGibsonPrimers(
  vector: GibsonPartConfig,
  fragments: GibsonPartConfig[],
  designed: ReturnType<typeof designGibsonOverlapPrimersForAssembly>,
  assemblyMode: GibsonAssemblyMode,
  options: GibsonOverlapPrimerDesignOptions,
) {
  if (!designed) return { vector, fragments }
  const byIndex = new Map(
    designed.inserts
      .filter((entry) => entry.fragmentIndex !== null)
      .map((entry) => [entry.fragmentIndex as number, entry]),
  )
  const primary = designed.inserts.find((entry) => entry.fragmentIndex === null) ?? null
  const nextFragments = fragments.map((config, index) => {
    const entry = byIndex.get(index)
    if (!entry || !config.record) return config
    return {
      ...config,
      record: mergeGibsonDesignedPrimersOntoRecord(config.record, entry.insertPrimers),
      linearizationMode: 'pcr' as const,
      amplifyRange: entry.amplifyRange,
      forwardPrimer: entry.insertForward,
      reversePrimer: entry.insertReverse,
      selectedAmpliconId: null,
    }
  })
  let nextVector = vector
  if (primary && vector.record) {
    nextVector = {
      ...vector,
      record: mergeGibsonDesignedPrimersOntoRecord(vector.record, primary.insertPrimers),
      linearizationMode: 'pcr',
      amplifyRange: primary.amplifyRange,
      forwardPrimer: primary.insertForward,
      reversePrimer: primary.insertReverse,
      selectedAmpliconId: null,
    }
  } else if (
    assemblyMode === 'cloning' &&
    !options.amplifyVectorWithoutExtensions &&
    designed.vectorForward &&
    designed.vectorReverse
  ) {
    nextVector = {
      ...vector,
      linearizationMode: 'pcr',
      forwardPrimer: designed.vectorForward,
      reversePrimer: designed.vectorReverse,
      selectedAmpliconId: null,
    }
  }
  return { vector: nextVector, fragments: nextFragments }
}

function formatOverlapTm(tmC: number | null) {
  if (tmC === null || !Number.isFinite(tmC)) return '—'
  return `${tmC.toFixed(1)} °C`
}

function gibsonGradeClass(level: GibsonOverlapGradeLevel | null | undefined) {
  if (!level) return ''
  return `is-grade-${level}`
}

function gibsonAnalysisStatusClass(ready: boolean, gradeLevel: GibsonOverlapGradeLevel | null | undefined) {
  if (!ready) return 'is-invalid'
  if (gradeLevel === 'suboptimal' || gradeLevel === 'insufficient') return `is-ready is-warning ${gibsonGradeClass(gradeLevel)}`
  return `is-ready ${gibsonGradeClass(gradeLevel)}`
}

function JunctionGradeBadge({
  level,
  label,
  detail,
  hint,
}: {
  level: GibsonOverlapGradeLevel
  label: string
  detail: string
  hint?: string | null
}) {
  return (
    <span className="gibson-schema-grade-block">
      <span className={`gibson-schema-grade ${gibsonGradeClass(level)}`} title={detail}>
        {label}
      </span>
      {hint ? (
        <span className="gibson-schema-hint" title={detail}>
          {hint}
        </span>
      ) : null}
    </span>
  )
}

function formatPrimerTm(sequence: string) {
  const result = calculateAnnealTemperature(sequence)
  if (result.tmC !== null) return `${result.tmC.toFixed(1)} C`
  if (result.tmMinC !== null && result.tmMaxC !== null) {
    return `${result.tmMinC.toFixed(1)}-${result.tmMaxC.toFixed(1)} C`
  }
  return 'Tm n/a'
}

function ChooseGibsonOverlapPrimersDialog({
  method,
  assemblyMode,
  regions,
  vectorEnzymeNames,
  initialOptions,
  mode = 'choose',
  batchCombinationCount = 0,
  onCancel,
  onConfirm,
}: {
  method: GibsonAssemblyMethod
  assemblyMode: GibsonAssemblyMode
  regions: Array<{ label: string; amplifyRange: { start: number; end: number } }>
  vectorEnzymeNames: string[]
  initialOptions: GibsonOverlapPrimerDesignOptions
  mode?: 'choose' | 'regenerate'
  batchCombinationCount?: number
  onCancel: () => void
  onConfirm: (options: GibsonOverlapPrimerDesignOptions) => void
}) {
  const [options, setOptions] = useState<GibsonOverlapPrimerDesignOptions>(initialOptions)
  const dialogTitle =
    mode === 'regenerate' ? 'Regenerate PCR primers' : 'Choose PCR primers'
  const confirmLabel = mode === 'regenerate' ? 'Regenerate primers' : 'Design primers'
  const regenerateLabelNodes =
    vectorEnzymeNames.length > 0 ? (
      <>
        Regenerate the{' '}
        {vectorEnzymeNames.map((name, index) => (
          <span key={name}>
            {index > 0 ? (index === vectorEnzymeNames.length - 1 ? ' and ' : ', ') : null}
            <span className="gibson-overlap-enzyme-pill">{name}</span>
          </span>
        ))}{' '}
        site{vectorEnzymeNames.length === 1 ? '' : 's'} from the Vector
      </>
    ) : (
      <>Regenerate restriction sites from the Vector</>
    )

  function patch(partial: Partial<GibsonOverlapPrimerDesignOptions>) {
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
          <span className="muted">{gibsonMethodLabel(method)}</span>
        </header>
        <div className="restriction-cloning-dntp-modal-body gibson-overlap-primers-body">
          {batchCombinationCount > 0 && (
            <p className="restriction-cloning-hint">
              Primers will be designed against each of the {batchCombinationCount} exact source combinations. Identical oligos will be reused and exported only once; combinations that cannot be amplified or assembled will be skipped and reported.
            </p>
          )}
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
                name="gibson-overlap-mode"
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
                name="gibson-overlap-mode"
                checked={options.overlapMode === 'tm-range'}
                onChange={() => patch({ overlapMode: 'tm-range' })}
                disabled={method === 'infusion'}
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
                disabled={options.overlapMode !== 'tm-range' || method === 'infusion'}
                onChange={(event) =>
                  patch({ overlapTargetTmC: Number(event.target.value) || 50 })
                }
              />
              <span>°C</span>
            </label>
            {assemblyMode === 'cloning' && (
              <label className="restriction-cloning-checkbox">
                <input
                  type="checkbox"
                  checked={options.amplifyVectorWithoutExtensions}
                  onChange={(event) =>
                    patch({ amplifyVectorWithoutExtensions: event.target.checked })
                  }
                />
                Leave Vector as linearized fragment (homology only on insert primers)
              </label>
            )}
          </fieldset>

          {assemblyMode === 'cloning' && (
            <label className="restriction-cloning-checkbox">
              <input
                type="checkbox"
                checked={options.regenerateEnzymeSites}
                disabled={vectorEnzymeNames.length === 0}
                onChange={(event) => patch({ regenerateEnzymeSites: event.target.checked })}
              />
              {regenerateLabelNodes}
            </label>
          )}
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

function GibsonMultipleSourceDialog({
  options,
  onCancel,
  onConfirm,
}: {
  options: ConstructSourceOption[]
  onCancel: () => void
  onConfirm: (options: ConstructSourceOption[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  return (
    <div className="translation-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <div
        className="translation-dialog mass-restriction-library-members-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gibson-multiple-source-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 id="gibson-multiple-source-title">Choose constructs for this assembly slot</h3>
        <div className="mass-restriction-library-members-list">
          {options.map((option) => {
            const key = constructSourceOptionValue(option)
            return (
              <label key={key} className="mass-restriction-library-member-row">
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={(event) => setSelected((current) =>
                    event.target.checked
                      ? [...current, key]
                      : current.filter((entry) => entry !== key),
                  )}
                />
                <span>{option.label}</span>
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
              disabled={selected.length === 0}
              onClick={() => onConfirm(options.filter((option) => selected.includes(constructSourceOptionValue(option))))}
            >
              Use selected
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
  draft: GibsonPrimerDraft
  disabled?: boolean
  onChange: (next: GibsonPrimerDraft) => void
}) {
  const length = normalizeDna(draft.sequence).length
  const longestNameChars = Math.max(
    'Choose primer…'.length,
    draft.name?.length ?? 0,
    ...primers.map((primer) => (primer.name || '').length),
    1,
  )
  return (
    <section className={`pcr-primer-editor${disabled ? ' is-disabled' : ''}`}>
      <div className="pcr-primer-editor-header">
        <strong>{label}</strong>
        <select
          className="pcr-primer-name-select"
          style={{ width: `calc(${longestNameChars}ch + 2.25rem)` }}
          value={draft.sourcePrimerId ?? ''}
          disabled={disabled}
          onChange={(event) => {
            const primer = primers.find((entry) => entry.id === event.target.value)
            if (!primer) {
              onChange({ ...draft, sourcePrimerId: null })
              return
            }
            onChange(gibsonPrimerDraftFromPrimer(primer, label))
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
          5' Phosphorylated
        </label>
      </div>
      <div className="pcr-primer-sequence-row">
        <span className="pcr-primer-end-label">5'</span>
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
        <span className="pcr-primer-end-label">3'</span>
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

function GibsonSchemaPanel({
  parts,
  fragmentOrder,
  analysisReady,
  analysisMessage,
  productLength,
  closed,
  assemblyMode,
  junctions,
  designGrade,
  recommendation,
  activePart,
  onSelectPart,
  onReorderFragments,
}: {
  parts: ResolvedGibsonPart[]
  fragmentOrder: number[]
  analysisReady: boolean
  analysisMessage: string
  productLength: number | null
  closed: boolean
  assemblyMode: GibsonAssemblyMode
  junctions: ReturnType<typeof analyzeGibsonAssembly>['junctions']
  designGrade: ReturnType<typeof analyzeGibsonAssembly>['designGrade']
  recommendation: GibsonOverlapRecommendation | null
  activePart: ActivePartId
  onSelectPart: (part: ActivePartId) => void
  onReorderFragments: (nextOrder: number[]) => void
}) {
  const dragIndexRef = useRef<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  function handleDrop(targetOrderIndex: number) {
    const from = dragIndexRef.current
    if (from === null || from === targetOrderIndex) {
      dragIndexRef.current = null
      setDragIndex(null)
      setDropIndex(null)
      return
    }
    // Schema shows vector at 0, then fragments. Only fragment cards are reorderable.
    const next = [...fragmentOrder]
    const [moved] = next.splice(from, 1)
    next.splice(targetOrderIndex, 0, moved!)
    onReorderFragments(next)
    dragIndexRef.current = null
    setDragIndex(null)
    setDropIndex(null)
  }

  function junctionBetween(leftOrder: number, rightOrder: number) {
    return junctions.find(
      (junction) => junction.leftOrderIndex === leftOrder && junction.rightOrderIndex === rightOrder,
    )
  }

  function selectPart(part: ResolvedGibsonPart, isPrimarySlot: boolean) {
    // Primary schema slot is always ActivePartId "vector" (Vector in cloning / Fragment 1 in linear).
    // Do not use configIndex here — in linear mode primary also has configIndex 0 like fragments[0].
    onSelectPart(isPrimarySlot ? 'vector' : `fragment-${part.configIndex}`)
  }

  function endLabels(part: ResolvedGibsonPart) {
    if (!part.ready) return { left: '—', right: '—' }
    if (part.linearizationMode === 'restriction') {
      const digest = part.selectedDigest
      if (digest) {
        const match = digest.label.match(/^(.+?)\s+[–-]\s+(.+)$/)
        if (match) return { left: match[1]!.trim(), right: match[2]!.trim() }
        if (digest.id === 'linearized') {
          const enzyme = digest.label.replace(/\s+linearized$/i, '').trim()
          return { left: enzyme || '—', right: enzyme || '—' }
        }
      }
      return { left: 'RE', right: 'RE' }
    }
    if (part.linearizationMode === 'pcr') return { left: 'PCR', right: 'PCR' }
    return { left: '5′', right: '3′' }
  }

  function insertCardPresentation(part: ResolvedGibsonPart) {
    const isPartialStretch =
      part.role !== 'vector' &&
      !part.ready &&
      part.selectedStretchBp != null &&
      part.selectedStretchBp > 0
    return {
      isPartialStretch,
      showConfiguredLook: part.ready || isPartialStretch,
      lengthLabel: part.ready
        ? `${part.sequence.length.toLocaleString()} bp`
        : isPartialStretch
          ? `${part.selectedStretchBp!.toLocaleString()} bp`
          : 'Not configured',
      modeLabel: part.ready
        ? part.linearizationMode === 'pcr'
          ? 'PCR'
          : part.linearizationMode === 'restriction'
            ? 'RE'
            : 'Direct'
        : isPartialStretch
          ? 'Linearization not configured'
          : null,
    }
  }

  return (
    <section className="cloning-schema-panel gibson-schema-panel" aria-label="Gibson assembly schema">
      <div className="cloning-schema-row">
        {parts.map((part, orderIndex) => {
          // First ordered part is the primary slot (vector state), even when role is "fragment" in linear mode.
          const isPrimarySlot = orderIndex === 0
          const showVectorArc = part.role === 'vector' && assemblyMode === 'cloning'
          const fragmentOrderIndex = isPrimarySlot ? -1 : orderIndex - 1
          const selected =
            (isPrimarySlot && activePart === 'vector') ||
            (!isPrimarySlot && activePart === `fragment-${part.configIndex}`)
          const junction = orderIndex > 0 ? junctionBetween(orderIndex - 1, orderIndex) : null
          const ends = endLabels(part)
          const insertPresentation = insertCardPresentation(part)
          // Cloning vector uses the arc graphic; linear Fragment 1 is an insert-style card.
          const showConfiguredLook = showVectorArc
            ? part.ready
            : insertPresentation.showConfiguredLook
          return (
            <div key={`schema-${part.configIndex}-${orderIndex}`} className="cloning-schema-insert-wrap">
              {orderIndex > 0 && (
                <div
                  className={`gibson-schema-junction${junction ? '' : ' is-missing'} ${
                    junction ? gibsonGradeClass(junction.grade.level) : ''
                  }`}
                >
                  {junction ? (
                    <>
                      <span className="gibson-schema-overlap">{junction.overlapLength} bp</span>
                      <span className="gibson-schema-tm">{formatOverlapTm(junction.tmC)}</span>
                      <JunctionGradeBadge
                        level={junction.grade.level}
                        label={junction.grade.label}
                        detail={junction.grade.detail}
                        hint={
                          recommendation
                            ? formatGibsonOverlapRecommendationHint(
                                junction.overlapLength,
                                recommendation,
                                junction.tmC,
                              )
                            : null
                        }
                      />
                    </>
                  ) : (
                    <span className="gibson-schema-overlap">no overlap</span>
                  )}
                </div>
              )}
              <div
                className={`cloning-schema-part${showVectorArc ? ' cloning-schema-vector' : ' cloning-schema-insert'}${
                  !showConfiguredLook ? ' is-empty' : ''
                }${selected ? ' is-selected' : ''}${
                  dragIndex === fragmentOrderIndex ? ' is-dragging' : ''
                }${
                  dropIndex === fragmentOrderIndex &&
                  dragIndex !== null &&
                  dragIndex !== fragmentOrderIndex
                    ? ' is-drop-target'
                    : ''
                }`}
                draggable={!isPrimarySlot && part.ready}
                onClick={() => selectPart(part, isPrimarySlot)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectPart(part, isPrimarySlot)
                  }
                }}
                role="button"
                tabIndex={0}
                onDragStart={(event: DragEvent<HTMLDivElement>) => {
                  if (isPrimarySlot) return
                  dragIndexRef.current = fragmentOrderIndex
                  setDragIndex(fragmentOrderIndex)
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event: DragEvent<HTMLDivElement>) => {
                  if (isPrimarySlot) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropIndex(fragmentOrderIndex)
                }}
                onDrop={(event: DragEvent<HTMLDivElement>) => {
                  if (isPrimarySlot) return
                  event.preventDefault()
                  handleDrop(fragmentOrderIndex)
                }}
                onDragEnd={() => {
                  dragIndexRef.current = null
                  setDragIndex(null)
                  setDropIndex(null)
                }}
                style={
                  !showVectorArc && showConfiguredLook ? { borderColor: part.color } : undefined
                }
              >
                {showVectorArc ? (
                  <div className="cloning-schema-vector-card">
                    <div
                      className={`cloning-schema-vector-graphic${!part.ready ? ' cloning-schema-empty-graphic' : ''}`}
                    >
                      <svg viewBox="0 0 160 72" aria-hidden>
                        <path
                          d="M 28 58 A 52 52 0 1 1 132 58"
                          fill="none"
                          stroke={part.ready ? part.color || 'var(--vg-cloning-diagram-ink)' : 'var(--vg-cloning-diagram-ink)'}
                          strokeWidth={10}
                          strokeLinecap="round"
                        />
                        <line
                          x1="28"
                          y1="58"
                          x2="28"
                          y2="42"
                          stroke="var(--vg-cloning-diagram-ink)"
                          strokeWidth={1.5}
                        />
                        <line
                          x1="132"
                          y1="58"
                          x2="132"
                          y2="42"
                          stroke="var(--vg-cloning-diagram-ink)"
                          strokeWidth={1.5}
                        />
                      </svg>
                      <span className="gibson-schema-arc-label">{part.label}</span>
                      {part.ready && (
                        <>
                          <span className="cloning-schema-arc-end is-left" title="Left (5′) end">
                            {ends.left}
                          </span>
                          <span className="cloning-schema-arc-end is-right" title="Right (3′) end">
                            {ends.right}
                          </span>
                        </>
                      )}
                    </div>
                    <div
                      className={`cloning-schema-part-meta cloning-schema-vector-meta${
                        !part.ready ? ' cloning-schema-empty-meta' : ''
                      }`}
                    >
                      <span className="gibson-schema-card-details">
                        {part.ready ? `${part.sequence.length.toLocaleString()} bp` : 'Not configured'}
                        {part.ready && (
                          <>
                            <span aria-hidden> · </span>
                            {part.linearizationMode === 'pcr'
                              ? 'PCR'
                              : part.linearizationMode === 'restriction'
                                ? 'RE'
                                : 'Direct'}
                            {part.orientation === 'reverse' ? ' · RC' : ''}
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    {showConfiguredLook ? (
                      <div
                        className="cloning-schema-insert-bar"
                        style={{ background: part.color }}
                      />
                    ) : (
                      <div className="cloning-schema-empty-graphic">
                        <div className="cloning-schema-insert-bar" style={{ background: 'var(--vg-cloning-diagram-ink)' }} />
                      </div>
                    )}
                    <div
                      className={`cloning-schema-part-meta${
                        !showConfiguredLook ? ' cloning-schema-empty-meta' : ''
                      }`}
                    >
                      <strong>{part.label}</strong>
                      <span className="gibson-schema-card-details">
                        {insertPresentation.lengthLabel}
                        {insertPresentation.modeLabel && (
                          <>
                            <span aria-hidden> · </span>
                            {insertPresentation.modeLabel}
                            {part.ready && part.orientation === 'reverse' ? ' · RC' : ''}
                          </>
                        )}
                      </span>
                      {!isPrimarySlot && part.ready && (
                        <span className="cloning-schema-drag-hint">Drag to reorder</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
        {assemblyMode === 'cloning' && parts.length >= 2 && (() => {
          const closing = junctionBetween(parts.length - 1, 0)
          return (
            <div
              className={`gibson-schema-circular${closing ? '' : ' is-missing'} ${
                closing ? gibsonGradeClass(closing.grade.level) : ''
              }`}
              title="First and last parts share terminal homology for circular closure"
            >
              {closing ? (
                <>
                  <span className="gibson-schema-overlap">
                    {closing.overlapLength} bp circular
                  </span>
                  <span className="gibson-schema-tm">{formatOverlapTm(closing.tmC)}</span>
                  <JunctionGradeBadge
                    level={closing.grade.level}
                    label={closing.grade.label}
                    detail={closing.grade.detail}
                    hint={
                      recommendation
                        ? formatGibsonOverlapRecommendationHint(
                            closing.overlapLength,
                            recommendation,
                            closing.tmC,
                          )
                        : null
                    }
                  />
                </>
              ) : (
                <span className="gibson-schema-overlap">no overlap</span>
              )}
            </div>
          )
        })()}
        <span className="cloning-schema-arrow" aria-hidden>
          →
        </span>
        <button
          type="button"
          className={`cloning-schema-part cloning-schema-product${analysisReady ? '' : ' is-empty'}${
            activePart === 'product' ? ' is-selected' : ''
          }${analysisReady && closed ? ' is-closed' : ' is-open'}`}
          onClick={() => onSelectPart('product')}
        >
          <div className="cloning-schema-part-meta">
            <strong>Product</strong>
            <span>
              {analysisReady && productLength !== null
                ? `${productLength.toLocaleString()} bp${closed ? ' circular' : ' linear'}`
                : analysisMessage}
            </span>
            {analysisReady && designGrade && (
              <span
                className={`gibson-schema-grade ${gibsonGradeClass(designGrade.level)}`}
                title={designGrade.detail}
              >
                {designGrade.label}
              </span>
            )}
          </div>
        </button>
      </div>
    </section>
  )
}

export function GibsonAssemblyDialog({
  active = true,
  currentRecord,
  currentTabId,
  assemblyMethod: initialAssemblyMethod = 'nebuilder-hifi',
  onCancel,
  onAssemble,
  renderWorkspace,
  primerHybridization = defaultPrimerHybridizationParams,
}: GibsonAssemblyDialogProps) {
  const alignPending = useTraceAlignment()
  const titleId = useId()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const massFileInputRef = useRef<HTMLInputElement | null>(null)
  const massFileTargetRef = useRef<ActivePartId>('vector')
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const methodMenuRef = useRef<HTMLDivElement | null>(null)
  const assembleMenuRef = useRef<HTMLDivElement | null>(null)
  useClampDialogToViewport(dialogRef)
  const [selectedMethod, setSelectedMethod] = useState<GibsonAssemblyMethod>(initialAssemblyMethod)
  const [methodMenuOpen, setMethodMenuOpen] = useState(false)
  const methodThresholds = useMemo(() => gibsonMethodThresholds(selectedMethod), [selectedMethod])
  /** In-Fusion is circular cloning chemistry; linear multi-fragment assembly is not offered. */
  const supportsLinearAssembly = selectedMethod !== 'infusion'
  const initialMassSources = currentRecord.dna?.documentRole === 'library'
    ? expandGibsonBatchSources([{ key: `current:${currentRecord.id}`, record: currentRecord }])
    : []
  const [assemblyMode, setAssemblyMode] = useState<GibsonAssemblyMode>(() =>
    initialAssemblyMethod === 'infusion' ? 'cloning' : 'linear',
  )
  const [activePart, setActivePart] = useState<ActivePartId>('vector')
  const [vector, setVector] = useState<GibsonPartConfig>(() =>
    defaultGibsonPartConfig(
      initialAssemblyMethod === 'infusion' ? 'vector' : 'fragment',
      initialMassSources[0]?.record ?? currentRecord,
    ),
  )
  const [fragments, setFragments] = useState<GibsonPartConfig[]>(() => [
    defaultGibsonPartConfig('fragment', null),
  ])
  const [fragmentOrder, setFragmentOrder] = useState<number[]>([0])
  const [databasePickerOpen, setDatabasePickerOpen] = useState(false)
  const [massDatabasePickerTarget, setMassDatabasePickerTarget] = useState<ActivePartId | null>(null)
  const [massSourcePickerTarget, setMassSourcePickerTarget] = useState<ActivePartId | null>(null)
  const [massSourcesBySlot, setMassSourcesBySlot] = useState<Record<string, GibsonBatchSourceChoice[]>>(
    () => initialMassSources.length
      ? { vector: initialMassSources }
      : ({} as Record<string, GibsonBatchSourceChoice[]>),
  )
  const [massPreviewBySlot, setMassPreviewBySlot] = useState<Record<string, number>>({})
  const [massExcludedBySlot, setMassExcludedBySlot] = useState<Record<string, string[]>>({})
  const [massExclusionSlot, setMassExclusionSlot] = useState<ActivePartId | null>(null)
  const [massNamesOpen, setMassNamesOpen] = useState(false)
  const [massProductNames, setMassProductNames] = useState<Record<string, string>>({})
  const [massPrimerOptions, setMassPrimerOptions] = useState<GibsonOverlapPrimerDesignOptions | null>(null)
  const [massOutputAsLibrary, setMassOutputAsLibrary] = useState(false)
  const [massOutputLibraryName, setMassOutputLibraryName] = useState('Gibson assembly products')
  const [assembleMenuOpen, setAssembleMenuOpen] = useState(false)
  const [batchSaveProducts, setBatchSaveProducts] = useState<SequenceRecord[] | null>(null)
  const [batchSaveLibrary, setBatchSaveLibrary] = useState<SequenceRecord | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchStatus, setBatchStatus] = useState('')
  const [productName, setProductName] = useState(
    initialMassSources.length ? `Assembled ${GIBSON_PART_NAMES_TOKEN}.dna` : 'Assembled.dna',
  )
  const [productStrainId, setProductStrainId] = useState(
    () =>
      currentRecord.construct.bacterialTransformationStrain ??
      defaultConstructProperties.bacterialTransformationStrain ??
      '',
  )
  const [productAuthor, setProductAuthor] = useState(
    () => currentRecord.construct.sequenceAuthor || defaultConstructProperties.sequenceAuthor,
  )
  const [enzymePickerSites, setEnzymePickerSites] = useState<RestrictionSite[]>([])
  const [overlapPrimersOpen, setOverlapPrimersOpen] = useState(false)
  const enzymePreferences = useMemo(() => {
    try {
      return loadEnzymePreferences()
    } catch {
      return defaultEnzymePreferences
    }
  }, [])
  const enzymePool = useMemo(
    () =>
      enzymePoolForSettings(
        { set: 'unique-six-plus', selectedNames: [], supplierSetId: null },
        enzymePreferences,
      ),
    [enzymePreferences],
  )

  const { groups: sourceGroups, options: sourceOptions, refresh: refreshSourceOptions } = useConstructSources({
    active,
    currentRecord,
    currentTabId,
  })

  useEffect(() => {
    if (
      !active ||
      databasePickerOpen ||
      massDatabasePickerTarget ||
      massSourcePickerTarget ||
      massNamesOpen ||
      massExclusionSlot ||
      batchSaveProducts ||
      batchSaveLibrary ||
      overlapPrimersOpen
    ) return
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        if (methodMenuOpen) {
          setMethodMenuOpen(false)
          return
        }
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [
    active,
    batchSaveLibrary,
    batchSaveProducts,
    databasePickerOpen,
    massDatabasePickerTarget,
    massExclusionSlot,
    massNamesOpen,
    massSourcePickerTarget,
    methodMenuOpen,
    onCancel,
    overlapPrimersOpen,
  ])

  // Bubble phase: capture-phase listeners were closing the menu before item clicks.
  useEffect(() => {
    if (!active || (!methodMenuOpen && !assembleMenuOpen)) return
    const onPointerDown = (event: PointerEvent) => {
      if (!methodMenuRef.current?.contains(event.target as Node)) setMethodMenuOpen(false)
      if (!assembleMenuRef.current?.contains(event.target as Node)) setAssembleMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [active, assembleMenuOpen, methodMenuOpen])

  function enterCloningMode() {
    setAssemblyMode('cloning')
    setVector((current) => {
      const next = { ...current, role: 'vector' as const }
      if (
        !current.record ||
        current.linearizationMode !== 'restriction' ||
        !current.leftCut.site ||
        !current.rightCut.site
      ) {
        return next
      }
      const digestFragments = listDigestFragmentsBetweenCuts(
        current.record,
        current.leftCut.site,
        current.rightCut.site,
      )
      return {
        ...next,
        selectedFragmentId: defaultDigestFragmentId(
          'vector',
          digestFragments,
          current.record.sequence.length,
        ),
      }
    })
  }

  function selectAssemblyMethod(method: GibsonAssemblyMethod) {
    setSelectedMethod(method)
    setMethodMenuOpen(false)
    if (method === 'infusion') enterCloningMode()
  }

  const fragmentIndex = partIndexFromId(activePart)
  const activeConfig =
    activePart === 'vector'
      ? vector
      : fragmentIndex !== null
        ? fragments[fragmentIndex] ?? null
        : null
  const activeMassSources = activePart === 'product' ? [] : massSourcesBySlot[activePart] ?? []
  const activeMassPreviewIndex = activePart === 'product' ? 0 : massPreviewBySlot[activePart] ?? 0
  const activeLibrarySources = activeMassSources.filter((choice) => Boolean(choice.librarySource))

  const resolvedVector = useMemo(
    () => resolveGibsonPart({ ...vector, role: assemblyMode === 'cloning' ? 'vector' : 'fragment' }, 0, 0, 0),
    [assemblyMode, vector],
  )
  const resolvedFragments = useMemo(
    () =>
      fragments.map((config, index) =>
        resolveGibsonPart(
          config,
          index,
          // Label: cloning Fragment 1..N; linear Fragment 2..N (slot 0 is Fragment 1).
          assemblyMode === 'linear' ? index + 1 : index,
          // Color: never collide with the first schema slot (vector / Fragment 1).
          index + 1,
        ),
      ),
    [assemblyMode, fragments],
  )
  const orderedResolved = useMemo(() => {
    const orderedFrags = fragmentOrder
      .map((index) => resolvedFragments[index])
      .filter((part): part is ResolvedGibsonPart => Boolean(part))
    return [resolvedVector, ...orderedFrags]
  }, [fragmentOrder, resolvedFragments, resolvedVector])

  const analysis = useMemo(
    () => analyzeGibsonAssembly(orderedResolved, { mode: assemblyMode, method: selectedMethod }),
    [assemblyMode, orderedResolved, selectedMethod],
  )
  const massMode = Object.values(massSourcesBySlot).some(
    (choices) => choices.length > 1 || choices.some((choice) => choice.librarySource),
  )
  const massPreparedCandidates = useMemo(() => {
    if (!massMode) return []
    const slots: ActivePartId[] = ['vector', ...fragments.map((_, index) => `fragment-${index}` as const)]
    const configs = [vector, ...fragments]
    const choiceSets = slots.map((slot, index) => {
      const excluded = new Set(massExcludedBySlot[slot] ?? [])
      const configuredMass = massSourcesBySlot[slot]
      if (configuredMass) {
        return configuredMass.filter((choice) => !excluded.has(choice.key))
      }
      const record = configs[index]?.record
      return record ? [{ key: `single:${slot}:${record.id}`, record }] : []
    })

    return gibsonBatchCombinations(choiceSets).map((choices) => {
      let candidateVector = remapGibsonPartConfig(vector, choices[0]!.record)
      let candidateFragments = fragments.map((config, index) =>
        remapGibsonPartConfig(config, choices[index + 1]!.record),
      )

      let candidateResolvedVector = resolveGibsonPart(
        { ...candidateVector, role: assemblyMode === 'cloning' ? 'vector' : 'fragment' },
        0,
        0,
        0,
      )
      let candidateResolvedFragments = candidateFragments.map((config, index) =>
        resolveGibsonPart(config, index, assemblyMode === 'linear' ? index + 1 : index, index + 1),
      )

      if (massPrimerOptions) {
        const designed = designGibsonOverlapPrimersForAssembly({
          mode: assemblyMode,
          vector: candidateResolvedVector,
          primaryConfig: candidateVector,
          fragments: candidateFragments,
          fragmentOrder,
          resolvedFragments: candidateResolvedFragments,
          vectorLeftSite: candidateVector.leftCut.site,
          vectorRightSite: candidateVector.rightCut.site,
          options: {
            ...massPrimerOptions,
            method: selectedMethod,
            ...(assemblyMode === 'linear'
              ? { amplifyVectorWithoutExtensions: true, regenerateEnzymeSites: false }
              : {}),
          },
          includeReadyInserts: true,
        })
        const prepared = applyDesignedGibsonPrimers(
          candidateVector,
          candidateFragments,
          designed,
          assemblyMode,
          massPrimerOptions,
        )
        candidateVector = prepared.vector
        candidateFragments = prepared.fragments
        candidateResolvedVector = resolveGibsonPart(
          { ...candidateVector, role: assemblyMode === 'cloning' ? 'vector' : 'fragment' },
          0,
          0,
          0,
        )
        candidateResolvedFragments = candidateFragments.map((config, index) =>
          resolveGibsonPart(config, index, assemblyMode === 'linear' ? index + 1 : index, index + 1),
        )
      }

      const ordered = [
        candidateResolvedVector,
        ...fragmentOrder.map((index) => candidateResolvedFragments[index]!),
      ]
      const candidateAnalysis = analyzeGibsonAssembly(ordered, {
        mode: assemblyMode,
        method: selectedMethod,
      })
      const orderedChoices = [choices[0]!, ...fragmentOrder.map((index) => choices[index + 1]!)]
      const key = orderedChoices.map((choice) => choice.key).join('|')
      const names = orderedChoices.map((choice) => choice.record.name)
      return {
        key,
        choices: orderedChoices,
        parts: ordered,
        vectorConfig: candidateVector,
        fragmentConfigs: candidateFragments,
        analysis: candidateAnalysis,
        sourceNames: names,
        vectorName: names[0] ?? '',
        insertName: names.slice(1).join(' + '),
        primers: listGibsonAssemblySelectedPrimers(
          assemblyMode === 'cloning'
            ? [candidateVector, ...fragmentOrder.map((index) => candidateFragments[index]!)]
            : [candidateVector, ...fragmentOrder.map((index) => candidateFragments[index]!)],
        ),
      }
    })
  }, [
    assemblyMode,
    fragmentOrder,
    fragments,
    massExcludedBySlot,
    massMode,
    massPrimerOptions,
    massSourcesBySlot,
    selectedMethod,
    vector,
  ])
  const massCandidates = useMemo(
    () => massPreparedCandidates.map((candidate) => ({
      ...candidate,
      name: (
        massProductNames[candidate.key] ??
        renderMassGibsonProductName(productName, candidate.sourceNames)
      ).trim(),
    })),
    [massPreparedCandidates, massProductNames, productName],
  )
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
  const uniqueMassPrimers = useMemo(() => {
    return deduplicateGibsonBatchPrimers(cloneableMassCandidates)
  }, [cloneableMassCandidates])
  const activePreviewChoice = activePart === 'product'
    ? null
    : activeMassSources[activeMassPreviewIndex] ?? activeMassSources[0] ?? null
  const displayMassCandidate = (
    activePreviewChoice
      ? cloneableMassCandidates.find((candidate) =>
          candidate.choices.some((choice) => choice.key === activePreviewChoice.key),
        ) ?? massCandidates.find((candidate) =>
          candidate.choices.some((choice) => choice.key === activePreviewChoice.key),
        )
      : null
  ) ?? cloneableMassCandidates[0] ?? massCandidates[0] ?? null
  const displayAnalysis = massMode && displayMassCandidate ? displayMassCandidate.analysis : analysis
  const displayParts = massMode && displayMassCandidate ? displayMassCandidate.parts : orderedResolved
  const displayActiveConfig = massMode && massPrimerOptions && displayMassCandidate && activePart !== 'product'
    ? activePart === 'vector'
      ? displayMassCandidate.vectorConfig
      : displayMassCandidate.fragmentConfigs[partIndexFromId(activePart) ?? 0] ?? activeConfig
    : activeConfig
  const previewRecord = useMemo(
    () => gibsonPreviewRecord(displayAnalysis, productName),
    [displayAnalysis, productName],
  )

  const activeResolved =
    activePart === 'product'
      ? null
      : activePart === 'vector'
        ? resolvedVector
        : fragmentIndex !== null
          ? resolvedFragments[fragmentIndex] ?? null
          : null
  const displayActiveResolved = massMode && massPrimerOptions && activePart !== 'product'
    ? activePart === 'vector'
      ? displayParts[0] ?? null
      : displayParts[fragmentOrder.indexOf(partIndexFromId(activePart) ?? -1) + 1] ?? null
    : activeResolved

  const activeRecord =
    activePart === 'product' ? previewRecord : activeConfig?.record ?? null

  const selectedSourceOption = activeRecord
    ? sourceOptions.find((option) => option.record === activeRecord) ??
      sourceOptions.find((option) => option.record.id === activeRecord.id)
    : undefined
  const selectedSourceKey = selectedSourceOption
    ? constructSourceOptionValue(selectedSourceOption)
    : ''

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restriction-site overlays belong to the previously displayed construct
    setEnzymePickerSites([])
  }, [activeRecord?.id, activePart])

  const availableCutSites = useMemo(() => {
    const source =
      enzymePickerSites.length > 0
        ? enzymePickerSites
        : activeRecord?.sequence
          ? filterRestrictionSitesForEnzymeSet(
              findRestrictionSites(activeRecord.sequence, enzymePool, {
                construct: activeRecord.construct,
                topology: activeRecord.topology,
                annotateMethylation: true,
              }),
              { set: 'unique-six-plus', selectedNames: [] },
            )
          : []
    const selectedExtras = [activeConfig?.leftCut.site, activeConfig?.rightCut.site].filter(
      (site): site is RestrictionSite => Boolean(site),
    )
    return dedupeRestrictionSites([...source, ...selectedExtras]).sort(
      (left, right) =>
        left.enzyme.name.localeCompare(right.enzyme.name) || left.start - right.start,
    )
  }, [
    activeConfig?.leftCut.site,
    activeConfig?.rightCut.site,
    activeRecord,
    enzymePickerSites,
    enzymePool,
  ])

  function siteOptionValue(site: RestrictionSite) {
    return `${site.enzyme.name}@${site.start}`
  }

  function findSiteByOptionValue(value: string): RestrictionSite | null {
    return availableCutSites.find((site) => siteOptionValue(site) === value) ?? null
  }

  function updateActiveConfig(updater: (config: GibsonPartConfig) => GibsonPartConfig) {
    if (activePart === 'vector') {
      setVector((current) => updater(current))
      return
    }
    if (fragmentIndex === null) return
    setFragments((current) =>
      current.map((config, index) => (index === fragmentIndex ? updater(config) : config)),
    )
  }

  function navigateMassSlot(target: ActivePartId, index: number) {
    if (target === 'product') return
    const choices = massSourcesBySlot[target] ?? []
    const safeIndex = Math.min(Math.max(0, index), Math.max(0, choices.length - 1))
    const choice = choices[safeIndex]
    if (!choice) return
    setMassPreviewBySlot((current) => ({ ...current, [target]: safeIndex }))
    if (target === 'vector') {
      setVector((config) => remapGibsonPartConfig(config, choice.record))
      return
    }
    const configIndex = partIndexFromId(target)
    if (configIndex === null) return
    setFragments((current) => current.map((config, index) =>
      index === configIndex ? remapGibsonPartConfig(config, choice.record) : config,
    ))
  }

  function resetActiveSource(record: SequenceRecord) {
    updateActiveConfig((config) => ({
      ...config,
      record,
      linearizationMode: defaultGibsonLinearizationMode(record),
      selectedAmpliconId: null,
      selectedFragmentId: null,
      amplifyRange: null,
      leftCut: { ...config.leftCut, enzymeName: null, site: null },
      rightCut: { ...config.rightCut, enzymeName: null, site: null },
      forwardPrimer: defaultGibsonPrimerDraft('Primer 1'),
      reversePrimer: defaultGibsonPrimerDraft('Primer 2'),
    }))
  }

  function chooseMassSources(choices: GibsonBatchSourceChoice[], target: ActivePartId) {
    if (target === 'product') return
    const expanded = expandGibsonBatchSources(choices)
    const unique = expanded.filter(
      (choice, index) => expanded.findIndex((candidate) => candidate.key === choice.key) === index,
    )
    if (!unique.length) {
      setBatchStatus('The selected DNA library does not contain any members to assemble.')
      return
    }
    setActivePart(target)
    if (target === activePart) resetActiveSource(unique[0]!.record)
    else if (target === 'vector') {
      setVector((config) => ({
        ...defaultGibsonPartConfig(config.role, unique[0]!.record),
        role: config.role,
      }))
    } else {
      const index = partIndexFromId(target)
      if (index !== null) {
        setFragments((current) => current.map((config, configIndex) =>
          configIndex === index
            ? defaultGibsonPartConfig(config.role, unique[0]!.record)
            : config,
        ))
      }
    }
    const keepBatch = unique.length > 1 || unique.some((choice) => choice.librarySource)
    setMassSourcesBySlot((current) => {
      const next = { ...current }
      if (keepBatch) next[target] = unique
      else delete next[target]
      return next
    })
    setMassPreviewBySlot((current) => ({ ...current, [target]: 0 }))
    setMassExcludedBySlot((current) => ({ ...current, [target]: [] }))
    setMassProductNames({})
    setMassPrimerOptions(null)
    setProductName((current) =>
      keepBatch && !/<part_names>/i.test(current)
        ? current === 'Assembled.dna'
          ? `Assembled ${GIBSON_PART_NAMES_TOKEN}.dna`
          : current.replace(/\.dna$/i, ` ${GIBSON_PART_NAMES_TOKEN}.dna`)
        : current,
    )
    setBatchStatus(keepBatch ? `${unique.length} sources selected for ${target === 'vector' ? firstPartLabel : `Fragment ${(partIndexFromId(target) ?? 0) + (assemblyMode === 'linear' ? 2 : 1)}`}.` : '')
  }

  function assignSource(option: ConstructSourceOption) {
    if (option.record.dna?.documentRole === 'library') {
      chooseMassSources(
        [{ key: constructSourceOptionValue(option), record: option.record }],
        activePart,
      )
      return
    }
    setMassSourcesBySlot((current) => {
      const next = { ...current }
      delete next[activePart]
      return next
    })
    setMassExcludedBySlot((current) => {
      const next = { ...current }
      delete next[activePart]
      return next
    })
    setMassProductNames({})
    setMassPrimerOptions(null)
    resetActiveSource(option.record)
  }

  async function handleImportFile(file: File) {
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      const parsed = isSnapGeneBytes(bytes)
        ? parseSnapGene(bytes, file.name)
        : parseSequenceBytes(buffer, file.name)
      const imported = addOperation(parsed, 'import', `Imported ${file.name} for Gibson assembly.`)
      assignSource({ kind: 'current', label: imported.name, record: imported })
    } catch (error) {
      window.alert(
        `Could not import construct: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleImportFiles(files: FileList) {
    const target = massFileTargetRef.current
    const imported: GibsonBatchSourceChoice[] = []
    for (const file of Array.from(files)) {
      try {
        const buffer = await file.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        const parsed = isSnapGeneBytes(bytes)
          ? parseSnapGene(bytes, file.name)
          : parseSequenceBytes(buffer, file.name)
        imported.push({
          key: `file:${file.name}:${file.size}:${file.lastModified}`,
          record: addOperation(parsed, 'import', `Imported ${file.name} for Gibson assembly.`),
        })
      } catch (error) {
        setBatchStatus(`Could not import ${file.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (imported.length) chooseMassSources(imported, target)
    if (massFileInputRef.current) massFileInputRef.current.value = ''
  }

  function setLinearizationMode(mode: GibsonLinearizationMode) {
    if (mode === 'direct' && activeConfig?.record?.topology !== 'linear') return
    updateActiveConfig((config) => ({ ...config, linearizationMode: mode }))
  }

  function addFragment() {
    const nextIndex = fragments.length
    setFragments((current) => [...current, defaultGibsonPartConfig('fragment', null)])
    setFragmentOrder((current) => [...current, nextIndex])
    setActivePart(`fragment-${nextIndex}`)
  }

  function removeFragment() {
    if (fragments.length <= 1) return
    const index = fragmentIndex ?? fragments.length - 1
    setFragments((current) => current.filter((_, configIndex) => configIndex !== index))
    setFragmentOrder((current) =>
      current
        .filter((orderIndex) => orderIndex !== index)
        .map((orderIndex) => (orderIndex > index ? orderIndex - 1 : orderIndex)),
    )
    const shiftSlots = <T,>(current: Record<string, T>) => {
      const next: Record<string, T> = {}
      for (const [key, value] of Object.entries(current)) {
        if (key === 'vector') next.vector = value
        else {
          const slotIndex = partIndexFromId(key as ActivePartId)
          if (slotIndex === null || slotIndex === index) continue
          next[`fragment-${slotIndex > index ? slotIndex - 1 : slotIndex}`] = value
        }
      }
      return next
    }
    setMassSourcesBySlot(shiftSlots)
    setMassPreviewBySlot(shiftSlots)
    setMassExcludedBySlot(shiftSlots)
    setMassPrimerOptions(null)
    setMassProductNames({})
    setActivePart(index === 0 ? 'fragment-0' : `fragment-${Math.max(0, index - 1)}`)
  }

  function applySuggestedOrder() {
    const suggestion = suggestGibsonFragmentOrder(resolvedVector, resolvedFragments, {
      minOverlap: methodThresholds.minBp,
    })
    if (!suggestion) {
      window.alert(
        `Could not find a chain of terminal overlaps (≥${methodThresholds.minBp} bp) covering all fragments for ${gibsonMethodLabel(selectedMethod)}.`,
      )
      return
    }
    setFragmentOrder(suggestion.fragmentOrder)
    setFragments((current) =>
      current.map((config, index) => {
        const orientationIndex = suggestion.fragmentOrder.indexOf(index)
        if (orientationIndex < 0) return config
        return {
          ...config,
          orientation: suggestion.orientations[orientationIndex] ?? config.orientation,
        }
      }),
    )
  }

  function handleAssemble() {
    if (!analysis.ready) return
    const record = assembleGibsonProduct({
      parts: orderedResolved,
      analysis,
      productName,
      constructOverrides: {
        bacterialTransformationStrain: productStrainId || null,
        hostMethylation: methylationForStrain(productStrainId || null),
        sequenceAuthor: productAuthor,
      },
    })
    onAssemble([record], selectedMethod)
  }

  const massBatchResult = useMemo<MassRestrictionBatchResult | null>(() =>
    massMode
      ? {
          action: 'gibson',
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
        }
      : null,
  [cloneableMassCandidates, failedMassCandidates, massMode])

  function buildMassProducts() {
    if (!massReady) return []
    return cloneableMassCandidates.flatMap((candidate) => {
      try {
        return [assembleGibsonProduct({
          parts: candidate.parts,
          analysis: candidate.analysis,
          productName: candidate.name,
          constructOverrides: {
            bacterialTransformationStrain: productStrainId || null,
            hostMethylation: methylationForStrain(productStrainId || null),
            sequenceAuthor: productAuthor,
          },
        })]
      } catch {
        return []
      }
    })
  }

  async function handleMassAssembleOpenAll() {
    if (batchBusy) return
    const products = buildMassProducts()
    if (!products.length) return
    setAssembleMenuOpen(false)
    setBatchBusy(true)
    setBatchStatus(massOutputAsLibrary ? 'Preparing library members…' : '')
    try {
      const records = massOutputAsLibrary
        ? [await createRestrictionCloningProductLibraryAsync(products, massOutputLibraryName, alignPending)]
        : products
      onAssemble(records, selectedMethod, {
        statusMessage: massOutputAsLibrary
          ? `Mass Gibson-style assembly finished: opened ${records[0]!.name} with ${products.length} members; ${failedMassCandidates.length} not assembled.`
          : `Mass Gibson-style assembly finished: ${products.length} products opened; ${failedMassCandidates.length} not assembled.`,
        batchResult: massBatchResult ?? undefined,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not prepare library: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  async function handleMassAssembleToDatabase() {
    if (batchBusy) return
    const products = buildMassProducts()
    if (!products.length) return
    setAssembleMenuOpen(false)
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

  async function saveMassProductsToDatabase(folderId: string | null) {
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
      onAssemble([], selectedMethod, {
        open: false,
        statusMessage: `Mass Gibson-style assembly finished: ${count} products saved to Database; ${failedMassCandidates.length} not assembled.`,
        batchResult: massBatchResult ?? undefined,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not save assembly batch: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  async function saveMassLibraryToDatabase(folderId: string | null) {
    if (!batchSaveLibrary || batchBusy) return
    setBatchBusy(true)
    try {
      await saveProject(batchSaveLibrary, {
        folderId,
        fileName: normalizeProjectFileName(null, batchSaveLibrary.name, 'dna'),
      })
      const count = batchSaveLibrary.traceFiles?.length ?? 0
      setBatchSaveLibrary(null)
      onAssemble([], selectedMethod, {
        open: false,
        statusMessage: `Mass Gibson-style assembly finished: ${count} products saved as a library to Database; ${failedMassCandidates.length} not assembled.`,
        batchResult: massBatchResult ?? undefined,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not save assembly library: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  async function handleMassAssembleToFolder() {
    const products = buildMassProducts()
    if (!products.length || batchBusy) return
    setAssembleMenuOpen(false)
    if (!isTauriRuntime()) {
      setBatchStatus('Saving a batch to a folder is available in the desktop app.')
      return
    }
    const directory = await pickDesktopDirectory(
      massOutputAsLibrary ? 'Choose folder for Gibson product library' : 'Choose folder for Gibson products',
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
      onAssemble([], selectedMethod, {
        open: false,
        statusMessage: `Mass Gibson-style assembly finished: ${products.length} products saved${massOutputAsLibrary ? ' as a library' : ' to folder'}; ${failedMassCandidates.length} not assembled.`,
        batchResult: massBatchResult ?? undefined,
      })
      onCancel()
    } catch (error) {
      setBatchStatus(`Could not save assembly batch: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  const handleEnzymeSelect = useCallback(
    (site: RestrictionSite, extendSelection: boolean) => {
      if (!activeConfig || activePart === 'product') return
      updateActiveConfig((config) => {
        const switching = config.linearizationMode !== 'restriction'
        const next = { ...config, linearizationMode: 'restriction' as const }
        if (switching || !extendSelection || !config.leftCut.site) {
          return assignGibsonCutSite(next, 'left', site)
        }
        return assignGibsonCutSite(next, 'right', site)
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateActiveConfig closes over activePart
    [activeConfig, activePart, fragmentIndex],
  )

  const handlePrimerSelect = useCallback(
    (primerId: string) => {
      if (!activeConfig?.record || activePart === 'product') return
      const primer = activeConfig.record.primers.find((entry) => entry.id === primerId)
      if (!primer) return
      const draft = gibsonPrimerDraftFromPrimer(primer, primer.name || 'Primer')
      const layouts = resolveDisplayableLayoutsForPrimer(
        activeConfig.record.sequence,
        primer,
        primerHybridization,
      )
      const prefersReverse =
        layouts.some((layout) => layout.strand === 'reverse') &&
        !layouts.some((layout) => layout.strand === 'forward')
      const prefersForward =
        layouts.some((layout) => layout.strand === 'forward') &&
        !layouts.some((layout) => layout.strand === 'reverse')

      updateActiveConfig((config) => {
        const next = {
          ...config,
          linearizationMode: 'pcr' as const,
          selectedAmpliconId: null,
        }
        if (prefersReverse) return { ...next, reversePrimer: draft }
        if (prefersForward) return { ...next, forwardPrimer: draft }
        if (
          !normalizeDna(config.forwardPrimer.sequence) ||
          config.forwardPrimer.sourcePrimerId === primer.id
        ) {
          return { ...next, forwardPrimer: draft }
        }
        return { ...next, reversePrimer: draft }
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateActiveConfig closes over activePart
    [activeConfig, activePart, fragmentIndex, primerHybridization],
  )

  const digestFragments = useMemo(() => {
    if (
      !activeConfig?.record ||
      !activeConfig.leftCut.site ||
      !activeConfig.rightCut.site ||
      activeConfig.linearizationMode !== 'restriction'
    ) {
      return []
    }
    return listDigestFragmentsBetweenCuts(
      activeConfig.record,
      activeConfig.leftCut.site,
      activeConfig.rightCut.site,
    )
  }, [activeConfig])

  const pcrEnabled = activeConfig?.linearizationMode === 'pcr'
  const restrictionEnabled = activeConfig?.linearizationMode === 'restriction'
  const directEnabled = activeConfig?.record?.topology === 'linear'
  const firstPartLabel = assemblyMode === 'cloning' ? 'Vector' : 'Fragment 1'
  const fragmentTabLabel = (index: number) =>
    resolvedFragments[index]?.label ??
    (assemblyMode === 'cloning' ? `Fragment ${index + 1}` : `Fragment ${index + 2}`)
  const partNoun =
    activePart === 'vector'
      ? firstPartLabel
      : fragmentTabLabel(fragmentIndex ?? 0)
  const workspaceTitle =
    activePart === 'product' ? 'Product' : partNoun

  const selectedSites = useMemo(() => {
    if (!restrictionEnabled || !activeConfig) return []
    return [activeConfig.leftCut.site, activeConfig.rightCut.site].filter(
      (site): site is RestrictionSite => Boolean(site),
    )
  }, [activeConfig, restrictionEnabled])

  const workspaceSelectedRange = useMemo(() => {
    if (activePart === 'product' || !activeRecord || !activeConfig) return null
    if (activeConfig.linearizationMode === 'restriction') {
      const fragment = activeResolved?.selectedDigest
      if (fragment) {
        if (
          fragment.id === 'linearized' ||
          (fragment.wraps && fragment.start === fragment.end)
        ) {
          return { start: 0, end: activeRecord.sequence.length }
        }
        return { start: fragment.start, end: fragment.end }
      }
    }
    if (activeConfig.linearizationMode === 'pcr') {
      const amplicon = activeResolved?.selectedAmplicon
      if (amplicon) {
        return { start: amplicon.regionStart, end: amplicon.regionEnd }
      }
    }
    return activeConfig.amplifyRange
  }, [activeConfig, activePart, activeRecord, activeResolved])

  const shortAmplifyWarnings = useMemo(() => {
    const minBp = minGibsonAmplifyBp(selectedMethod)
    const warnings: string[] = []
    const consider = (config: GibsonPartConfig, label: string) => {
      if (!config.amplifyRange || !config.record) return
      const length = config.amplifyRange.end - config.amplifyRange.start
      if (length > 0 && length < minBp) {
        warnings.push(
          `${label}: selected stretch is ${length} bp (need ≥${minBp} bp for ${methodThresholds.shortLabel} overlapping PCR).`,
        )
      }
    }
    if (assemblyMode === 'linear') {
      consider(vector, resolvedVector.label)
    }
    fragments.forEach((config, index) => {
      consider(config, resolvedFragments[index]?.label ?? `Fragment ${index + 1}`)
    })
    return warnings
  }, [
    assemblyMode,
    fragments,
    methodThresholds.shortLabel,
    resolvedFragments,
    resolvedVector.label,
    selectedMethod,
    vector,
  ])

  const overlapPrimerTargets = useMemo(
    () =>
      listGibsonOverlapPrimerTargets({
        mode: assemblyMode,
        vector: resolvedVector,
        primaryConfig: vector,
        fragments,
        fragmentOrder,
        resolvedFragments,
        assemblyReady: analysis.ready,
        method: selectedMethod,
        includeReadyInserts: false,
      }),
    [
      analysis.ready,
      assemblyMode,
      fragmentOrder,
      fragments,
      resolvedFragments,
      resolvedVector,
      selectedMethod,
      vector,
    ],
  )

  const overlapPrimerRegenTargets = useMemo(
    () =>
      listGibsonOverlapPrimerTargets({
        mode: assemblyMode,
        vector: resolvedVector,
        primaryConfig: vector,
        fragments,
        fragmentOrder,
        resolvedFragments,
        assemblyReady: analysis.ready,
        method: selectedMethod,
        includeReadyInserts: true,
      }),
    [
      analysis.ready,
      assemblyMode,
      fragmentOrder,
      fragments,
      resolvedFragments,
      resolvedVector,
      selectedMethod,
      vector,
    ],
  )

  const overlapPrimerAction: 'choose' | 'regenerate' | null =
    overlapPrimerTargets.length > 0
      ? 'choose'
      : overlapPrimerRegenTargets.length > 0
        ? 'regenerate'
        : null

  const activeOverlapPrimerTargets =
    overlapPrimerAction === 'regenerate' ? overlapPrimerRegenTargets : overlapPrimerTargets

  const orderedAssemblyConfigs = useMemo(() => {
    const configs: GibsonPartConfig[] = []
    if (assemblyMode === 'cloning') configs.push(vector)
    for (const index of fragmentOrder) {
      const config = fragments[index]
      if (config) configs.push(config)
    }
    return configs
  }, [assemblyMode, fragmentOrder, fragments, vector])

  const selectedAssemblyPrimers = useMemo(
    () => listGibsonAssemblySelectedPrimers(orderedAssemblyConfigs),
    [orderedAssemblyConfigs],
  )

  async function handleExportSelectedPrimers() {
    const primers = massMode ? uniqueMassPrimers.map((entry) => entry.primer) : selectedAssemblyPrimers
    if (primers.length === 0) return
    const baseName = productName.replace(/\.[^.]+$/u, '').trim() || 'Assembled'
    await saveTextAs(
      `Primers from ${baseName}.txt`,
      massMode
        ? [
            'Primer\tSequence\tUsed by products',
            ...uniqueMassPrimers.map((entry) => {
              const products = entry.productKeys
                .map((key) => massCandidates.find((candidate) => candidate.key === key)?.name)
                .filter((name): name is string => Boolean(name))
              return `${entry.primer.name}\t${entry.primer.sequence}\t${products.join('; ')}`
            }),
          ].join('\n')
        : exportPrimerDataTsv(primers),
      'text/plain',
    )
  }

  const vectorLinearizationEnzymeNames = useMemo(() => {
    const digest = resolvedVector.selectedDigest
    if (digest && vector.leftCut.site && vector.rightCut.site) {
      const startSite = digest.followsLeftToRight ? vector.leftCut.site : vector.rightCut.site
      const endSite = digest.followsLeftToRight ? vector.rightCut.site : vector.leftCut.site
      const names = [startSite.enzyme.name, endSite.enzyme.name].filter(Boolean)
      return [...new Set(names)]
    }
    return [vector.leftCut.enzymeName, vector.rightCut.enzymeName].filter(
      (name): name is string => Boolean(name),
    )
  }, [
    resolvedVector.selectedDigest,
    vector.leftCut.enzymeName,
    vector.leftCut.site,
    vector.rightCut.enzymeName,
    vector.rightCut.site,
  ])

  function handleAmplifyRangeSelect(range: { start: number; end: number }) {
    if (activePart === 'product') return
    const start = Math.min(range.start, range.end)
    const end = Math.max(range.start, range.end)
    if (end - start < 2) return
    updateActiveConfig((config) => ({
      ...config,
      amplifyRange: { start, end },
    }))
  }

  function applyOverlapPrimerDesign(options: GibsonOverlapPrimerDesignOptions) {
    if (activeOverlapPrimerTargets.length === 0) return
    if (massMode) {
      setMassPrimerOptions({ ...options, method: selectedMethod })
      setMassProductNames({})
      setOverlapPrimersOpen(false)
      setActivePart('product')
      return
    }
    const designed = designGibsonOverlapPrimersForAssembly({
      mode: assemblyMode,
      vector: resolvedVector,
      primaryConfig: vector,
      fragments,
      fragmentOrder,
      resolvedFragments,
      vectorLeftSite: vector.leftCut.site,
      vectorRightSite: vector.rightCut.site,
      options: {
        ...options,
        method: selectedMethod,
        ...(assemblyMode === 'linear'
          ? { amplifyVectorWithoutExtensions: true, regenerateEnzymeSites: false }
          : {}),
      },
      includeReadyInserts: overlapPrimerAction === 'regenerate',
    })
    if (!designed || designed.inserts.length === 0) {
      window.alert('Could not design PCR primers for this selection.')
      return
    }

    const byIndex = new Map(
      designed.inserts
        .filter((entry) => entry.fragmentIndex !== null)
        .map((entry) => [entry.fragmentIndex as number, entry]),
    )
    const primaryDesign = designed.inserts.find((entry) => entry.fragmentIndex === null) ?? null

    setFragments((current) =>
      current.map((config, index) => {
        const entry = byIndex.get(index)
        if (!entry || !config.record) return config
        return {
          ...config,
          record: mergeGibsonDesignedPrimersOntoRecord(config.record, entry.insertPrimers),
          linearizationMode: 'pcr',
          forwardPrimer: entry.insertForward,
          reversePrimer: entry.insertReverse,
          selectedAmpliconId: null,
        }
      }),
    )

    if (primaryDesign && vector.record) {
      setVector((current) => ({
        ...current,
        record: mergeGibsonDesignedPrimersOntoRecord(current.record!, primaryDesign.insertPrimers),
        linearizationMode: 'pcr',
        forwardPrimer: primaryDesign.insertForward,
        reversePrimer: primaryDesign.insertReverse,
        selectedAmpliconId: null,
      }))
    } else if (
      assemblyMode === 'cloning' &&
      !options.amplifyVectorWithoutExtensions &&
      designed.vectorForward &&
      designed.vectorReverse
    ) {
      setVector((current) => ({
        ...current,
        linearizationMode: 'pcr',
        forwardPrimer: designed.vectorForward!,
        reversePrimer: designed.vectorReverse!,
        selectedAmpliconId: null,
      }))
    }

    setOverlapPrimersOpen(false)
    setActivePart('product')
  }

  const statusMessage =
    activePart === 'product' || displayAnalysis.ready
      ? displayAnalysis.message
      : (displayActiveResolved?.message ?? displayAnalysis.message)
  const exclusionChoices = massExclusionSlot
    ? (massSourcesBySlot[massExclusionSlot] ?? []).filter((choice) => Boolean(choice.librarySource))
    : []
  const exclusionCloneableKeys = exclusionChoices
    .filter((choice) => massCandidates.some(
      (candidate) => candidate.analysis.ready && candidate.choices.some((entry) => entry.key === choice.key),
    ))
    .map((choice) => choice.key)
  const exclusionFailureReasons = Object.fromEntries(exclusionChoices.map((choice) => {
    const failures = massCandidates.filter(
      (candidate) => candidate.choices.some((entry) => entry.key === choice.key) && !candidate.analysis.ready,
    )
    return [choice.key, failures[0]?.analysis.message ?? 'No compatible assembly was found.']
  }))

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className="translation-dialog restriction-cloning-dialog gibson-assembly-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="restriction-cloning-header">
          {supportsLinearAssembly && (
            <div className="gibson-mode-toggle" role="group" aria-label="Gibson-style assembly mode">
              <button
                type="button"
                className={assemblyMode === 'linear' ? 'is-active' : undefined}
                onClick={() => {
                  setAssemblyMode('linear')
                  setVector((current) => ({ ...current, role: 'fragment' }))
                }}
              >
                Linear Assembly
              </button>
              <button
                type="button"
                className={assemblyMode === 'cloning' ? 'is-active' : undefined}
                onClick={enterCloningMode}
              >
                Cloning
              </button>
            </div>
          )}
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
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  setMethodMenuOpen((open) => !open)
                }}
              >
                {gibsonMethodLabel(selectedMethod)}
                <span className="sidebar-enzyme-caret" aria-hidden>
                  ▾
                </span>
              </button>
              {methodMenuOpen && (
                <div
                  className="toolbar-edit-dropdown gibson-method-dropdown"
                  role="menu"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  {GIBSON_ASSEMBLY_METHODS.map((method) => (
                    <button
                      key={method}
                      type="button"
                      role="menuitem"
                      className="toolbar-edit-item"
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        selectAssemblyMethod(method)
                      }}
                    >
                      <span className="toolbar-edit-check" aria-hidden>
                        {selectedMethod === method ? '✓' : ''}
                      </span>
                      {gibsonMethodLabel(method)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {assemblyMode === 'cloning' ? ' Cloning' : ''}
          </h3>
          <div className="restriction-cloning-part-strip">
            <button
              type="button"
              className={activePart === 'vector' ? 'is-active' : undefined}
              onClick={() => setActivePart('vector')}
            >
              {firstPartLabel}
            </button>
            {fragments.map((_, index) => (
              <button
                key={`fragment-tab-${index}`}
                type="button"
                className={activePart === `fragment-${index}` ? 'is-active' : undefined}
                onClick={() => setActivePart(`fragment-${index}`)}
              >
                {fragmentTabLabel(index)}
              </button>
            ))}
            <button
              type="button"
              className={activePart === 'product' ? 'is-active' : undefined}
              onClick={() => setActivePart('product')}
            >
              Product
            </button>
            <div className="restriction-cloning-part-actions">
              <button type="button" onClick={addFragment}>
                Add fragment
              </button>
              <button type="button" onClick={removeFragment} disabled={fragments.length <= 1}>
                Remove fragment
              </button>
              <button type="button" onClick={applySuggestedOrder}>
                Suggest order
              </button>
            </div>
          </div>
        </header>

        <MobileCloningLayout designLabel="Primers & schema">
          <div className="restriction-cloning-main">
            {renderWorkspace({
              record: activeRecord,
              title: workspaceTitle,
              selectedRange: workspaceSelectedRange,
              cutStrandSelection: null,
              selectedSites: activePart === 'product' ? [] : selectedSites,
              segmentHighlights: undefined,
              allowEnzymeSelect: activePart !== 'product',
              includePrimersTab: pcrEnabled && activePart !== 'product',
              allowPrimerSelect: pcrEnabled && activePart !== 'product',
              selectedPrimerIds:
                activePart === 'product' || !pcrEnabled
                  ? []
                  : [
                      displayActiveConfig?.forwardPrimer.sourcePrimerId,
                      displayActiveConfig?.reversePrimer.sourcePrimerId,
                    ].filter((id): id is string => Boolean(id)),
              onRestrictionSelect: activePart !== 'product' ? handleEnzymeSelect : undefined,
              onPrimerSelect:
                pcrEnabled && activePart !== 'product' ? handlePrimerSelect : undefined,
              onRangeSelect: activePart !== 'product' ? handleAmplifyRangeSelect : undefined,
              onEnzymePickerSitesChange: setEnzymePickerSites,
            })}
            {pcrEnabled && activePart !== 'product' && (
              <PcrPrimerPairPanel
                forwardSequence={displayActiveConfig?.forwardPrimer.sequence ?? ''}
                reverseSequence={displayActiveConfig?.reversePrimer.sequence ?? ''}
                forwardLabel="Primer 1"
                reverseLabel="Primer 2"
              >
                <PrimerSelector
                  label="Primer 1"
                  primers={displayActiveConfig?.record?.primers ?? []}
                  draft={displayActiveConfig?.forwardPrimer ?? defaultGibsonPrimerDraft('Primer 1')}
                  onChange={(draft) =>
                    updateActiveConfig((config) => ({
                      ...config,
                      forwardPrimer: draft,
                      selectedAmpliconId: null,
                    }))
                  }
                />
                <PrimerSelector
                  label="Primer 2"
                  primers={displayActiveConfig?.record?.primers ?? []}
                  draft={displayActiveConfig?.reversePrimer ?? defaultGibsonPrimerDraft('Primer 2')}
                  onChange={(draft) =>
                    updateActiveConfig((config) => ({
                      ...config,
                      reversePrimer: draft,
                      selectedAmpliconId: null,
                    }))
                  }
                />
              </PcrPrimerPairPanel>
            )}
            <GibsonSchemaPanel
              parts={displayParts}
              fragmentOrder={fragmentOrder}
              analysisReady={displayAnalysis.ready}
              analysisMessage={displayAnalysis.message}
              productLength={displayAnalysis.productLength}
              closed={displayAnalysis.closed}
              assemblyMode={assemblyMode}
              junctions={displayAnalysis.junctions}
              designGrade={displayAnalysis.designGrade}
              recommendation={displayAnalysis.recommendation}
              activePart={activePart}
              onSelectPart={setActivePart}
              onReorderFragments={setFragmentOrder}
            />
          </div>

          <aside className="restriction-cloning-sidebar">
            <div className="restriction-cloning-sidebar-body">
            {activePart === 'product' ? (
              <div className="pcr-sidebar-fused">
                {shortAmplifyWarnings.length > 0 && (
                  <div className="restriction-cloning-status is-invalid" role="status">
                    {shortAmplifyWarnings.join(' ')}
                  </div>
                )}

                {displayAnalysis.issues.length > 0 && (
                  <div
                    className={`restriction-cloning-status ${
                      displayAnalysis.ready ? 'is-ready is-warning' : 'is-invalid'
                    }`}
                    role="status"
                  >
                    {displayAnalysis.issues.map((issue) => issue.message).join(' ')}
                  </div>
                )}

                {overlapPrimerAction && (
                  <button type="button" onClick={() => setOverlapPrimersOpen(true)}>
                    {overlapPrimerAction === 'regenerate'
                      ? 'Regenerate primers'
                      : 'Choose PCR primers'}
                  </button>
                )}

                <label className="restriction-cloning-field">
                  <span>Bacterial transformation strain</span>
                  <select
                    value={productStrainId}
                    onChange={(event) => setProductStrainId(event.target.value)}
                  >
                    {transformationStrainOptions.map((strain) => (
                      <option key={strain.id || 'unspecified'} value={strain.id}>
                        {strain.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="restriction-cloning-field">
                  <span>Sequence author</span>
                  <input
                    value={productAuthor}
                    onChange={(event) => setProductAuthor(event.target.value)}
                  />
                </label>

                <div className="pcr-bridge-fragment-list" aria-label="Product components">
                  {displayParts.map((part) => {
                    const stretchBp =
                      !part.ready && part.role !== 'vector' ? part.selectedStretchBp : null
                    return (
                    <div key={`product-${part.configIndex}`} className="pcr-bridge-fragment-card">
                      <div className="pcr-bridge-fragment-card-header">
                        <strong style={{ color: part.color }}>{part.label}</strong>
                        <span>
                          {part.ready
                            ? `${part.sequence.length.toLocaleString()} bp`
                            : stretchBp != null
                              ? `${stretchBp.toLocaleString()} bp`
                              : '—'}
                        </span>
                      </div>
                      <div className="muted">Source: {part.name}</div>
                      <div className="muted">
                        {part.ready
                          ? part.linearizationMode === 'pcr'
                            ? 'Linearized by PCR'
                            : part.linearizationMode === 'restriction'
                              ? 'Linearized with restriction enzymes'
                              : 'Used directly'
                          : stretchBp != null
                            ? 'Linearization not configured'
                            : 'Not configured'}
                      </div>
                    </div>
                    )
                  })}
                </div>

                <div className="pcr-bridge-footer-block">
                  <div
                    className={`restriction-cloning-status ${gibsonAnalysisStatusClass(
                      displayAnalysis.ready,
                      displayAnalysis.designGrade?.level,
                    )}`}
                  >
                    {massMode
                      ? cloneableMassCandidates.length === 0
                        ? `None of the ${massCandidates.length} combinations can be assembled.`
                        : !massNamesValid
                          ? `Add ${GIBSON_PART_NAMES_TOKEN} to the product name or choose unique names.`
                          : `${cloneableMassCandidates.length} of ${massCandidates.length} combinations can be assembled${failedMassCandidates.length ? `; ${failedMassCandidates.length} will be skipped` : ''}.`
                      : analysis.message}
                  </div>
                  {massMode && massPrimerOptions && (
                    <>
                      <div className="restriction-cloning-hint">
                        Exact batch design uses {uniqueMassPrimers.length} unique primer{uniqueMassPrimers.length === 1 ? '' : 's'} across {cloneableMassCandidates.length} product{cloneableMassCandidates.length === 1 ? '' : 's'}; identical oligos are reused automatically.
                      </div>
                      <details className="gibson-mass-primer-plan">
                        <summary>Primer usage</summary>
                        <div className="gibson-mass-primer-plan-table-wrap">
                          <table className="data-table">
                            <thead><tr><th>Primer</th><th>Sequence</th><th>Products</th></tr></thead>
                            <tbody>
                              {uniqueMassPrimers.map((entry) => {
                                const productNames = entry.productKeys
                                  .map((key) => massCandidates.find((candidate) => candidate.key === key)?.name)
                                  .filter((name): name is string => Boolean(name))
                                return (
                                  <tr key={entry.primer.sequence}>
                                    <td>{entry.primer.name}</td>
                                    <td className="gibson-mass-primer-sequence">{entry.primer.sequence}</td>
                                    <td title={productNames.join('\n')}>{productNames.length}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </>
                  )}
                  {batchStatus && <div className="mass-insert-dialog-status" role="status">{batchStatus}</div>}
                  <button
                    type="button"
                    disabled={(massMode ? uniqueMassPrimers.length : selectedAssemblyPrimers.length) === 0}
                    onClick={() => void handleExportSelectedPrimers()}
                  >
                    Export selected primers
                  </button>
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
                        Use {GIBSON_PART_NAMES_TOKEN} to include all source names.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                {activeMassSources.length > 0 && (
                  <MassRestrictionSourceNavigator
                    kind={activePart === 'vector' && assemblyMode === 'cloning' ? 'vector' : 'insert'}
                    choices={activeMassSources}
                    index={activeMassPreviewIndex}
                    onChange={(index) => navigateMassSlot(activePart, index)}
                    onExclude={activeLibrarySources.length ? () => setMassExclusionSlot(activePart) : undefined}
                    excludedCount={(massExcludedBySlot[activePart] ?? []).length}
                  />
                )}
                <label className="restriction-cloning-field">
                  <span>Source of {partNoun}</span>
                  <ConstructSourceSelect
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
                </label>

                <button type="button" onClick={() => fileInputRef.current?.click()}>
                  Add construct…
                </button>
                <button type="button" onClick={() => setDatabasePickerOpen(true)}>
                  Database…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    massFileTargetRef.current = activePart
                    massFileInputRef.current?.click()
                  }}
                >
                  Multiple files…
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void refreshSourceOptions()
                    setMassSourcePickerTarget(activePart)
                  }}
                >
                  Multiple open constructs…
                </button>
                <button type="button" onClick={() => setMassDatabasePickerTarget(activePart)}>
                  Multiple from Database…
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={SEQUENCE_OPEN_ACCEPT}
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void handleImportFile(file)
                  }}
                />
                <input
                  ref={massFileInputRef}
                  type="file"
                  accept={SEQUENCE_OPEN_ACCEPT}
                  multiple
                  hidden
                  onChange={(event) => {
                    if (event.target.files?.length) void handleImportFiles(event.target.files)
                  }}
                />

                <hr />

                <fieldset className="gibson-linearization-fieldset">
                  <legend>Linearization</legend>
                  <label className="restriction-cloning-checkbox">
                    <input
                      type="radio"
                      name={`gibson-lin-${activePart}`}
                      checked={activeConfig?.linearizationMode === 'pcr'}
                      onChange={() => setLinearizationMode('pcr')}
                    />
                    Linearize by PCR
                  </label>
                  <label className="restriction-cloning-checkbox">
                    <input
                      type="radio"
                      name={`gibson-lin-${activePart}`}
                      checked={activeConfig?.linearizationMode === 'restriction'}
                      onChange={() => setLinearizationMode('restriction')}
                    />
                    Linearize with restriction enzymes
                  </label>
                  <label
                    className={`restriction-cloning-checkbox${directEnabled ? '' : ' is-disabled'}`}
                  >
                    <input
                      type="radio"
                      name={`gibson-lin-${activePart}`}
                      checked={activeConfig?.linearizationMode === 'direct'}
                      disabled={!directEnabled}
                      onChange={() => setLinearizationMode('direct')}
                    />
                    Use directly as the linearized {activePart === 'vector' ? firstPartLabel : 'Fragment'}
                  </label>
                </fieldset>

                {pcrEnabled && (
                  <>
                    <label className="restriction-cloning-field">
                      <span>Polymerase for making linearized {partNoun}</span>
                      <select
                        value={activeConfig?.polymerase ?? 'blunt'}
                        onChange={(event) =>
                          updateActiveConfig((config) => ({
                            ...config,
                            polymerase: event.target.value as GibsonPartConfig['polymerase'],
                          }))
                        }
                      >
                        <option value="blunt">Creates Blunt Ends</option>
                        <option value="a-overhang">Creates 3' A overhangs</option>
                        <option value="g-overhang">Creates 3' G overhangs</option>
                      </select>
                    </label>
                    <p className="restriction-cloning-hint">
                      Choose PCR primers below, or click primers on the map/sequence (switches to PCR
                      linearization). Primer overhangs introduce the homology needed for Gibson
                      assembly.
                    </p>
                    {activeResolved && activeResolved.amplicons.length > 1 && (
                      <label className="restriction-cloning-field">
                        <span>Amplicon</span>
                        <select
                          value={activeResolved.selectedAmplicon?.id ?? ''}
                          onChange={(event) =>
                            updateActiveConfig((config) => ({
                              ...config,
                              selectedAmpliconId: event.target.value || null,
                            }))
                          }
                        >
                          {activeResolved.amplicons.map((amplicon) => (
                            <option key={amplicon.id} value={amplicon.id}>
                              {amplicon.productSize.toLocaleString()} bp (
                              {amplicon.regionStart + 1}–{amplicon.regionEnd})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </>
                )}

                {restrictionEnabled && (
                  <>
                    <div className="restriction-cloning-cut-group">
                      <label className="restriction-cloning-field">
                        <span>Cut 5′ end with</span>
                        <select
                          value={
                            activeConfig?.leftCut.site
                              ? siteOptionValue(activeConfig.leftCut.site)
                              : ''
                          }
                          onChange={(event) =>
                            updateActiveConfig((config) =>
                              assignGibsonCutSite(
                                config,
                                'left',
                                findSiteByOptionValue(event.target.value),
                              ),
                            )
                          }
                        >
                          <option value="">Select enzyme…</option>
                          {availableCutSites.map((site) => (
                            <option
                              key={`left-${siteOptionValue(site)}`}
                              value={siteOptionValue(site)}
                            >
                              {site.enzyme.name} ({site.start + 1})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="restriction-cloning-field">
                        <span>Cut 3′ end with</span>
                        <select
                          value={
                            activeConfig?.rightCut.site
                              ? siteOptionValue(activeConfig.rightCut.site)
                              : ''
                          }
                          onChange={(event) =>
                            updateActiveConfig((config) =>
                              assignGibsonCutSite(
                                config,
                                'right',
                                findSiteByOptionValue(event.target.value),
                              ),
                            )
                          }
                        >
                          <option value="">Select enzyme…</option>
                          {availableCutSites.map((site) => (
                            <option
                              key={`right-${siteOptionValue(site)}`}
                              value={siteOptionValue(site)}
                            >
                              {site.enzyme.name} ({site.start + 1})
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="restriction-cloning-hint">
                        Click enzymes on the map/sequence to switch to restriction linearization.
                        Shift/Ctrl-click a second enzyme for the other end. Use the same site for both
                        ends to linearize a circular plasmid.
                      </p>
                    </div>
                    {digestFragments.length > 0 && (
                      <div className="restriction-cloning-fragments">
                        <strong>Fragment to assemble</strong>
                        <div className="restriction-cloning-fragment-list" role="listbox">
                          {digestFragments.map((fragment) => (
                            <button
                              key={fragment.id}
                              type="button"
                              role="option"
                              aria-selected={activeConfig?.selectedFragmentId === fragment.id}
                              className={
                                activeConfig?.selectedFragmentId === fragment.id
                                  ? 'is-selected'
                                  : undefined
                              }
                              onClick={() =>
                                updateActiveConfig((config) => ({
                                  ...config,
                                  selectedFragmentId: fragment.id,
                                }))
                              }
                            >
                              {digestFragmentDisplayLabel(
                                fragment,
                                activeRecord?.sequence.length ?? fragment.length,
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activeConfig?.linearizationMode === 'direct' && (
                  <p className="restriction-cloning-hint">
                    This linear DNA will be used as-is in the assembly.
                  </p>
                )}

                <div className="restriction-cloning-orientation">
                  <strong>Orientation</strong>
                  <div className="restriction-cloning-orientation-buttons">
                    <button
                      type="button"
                      className={activeConfig?.orientation === 'forward' ? 'is-active' : undefined}
                      onClick={() =>
                        updateActiveConfig((config) => ({ ...config, orientation: 'forward' }))
                      }
                      aria-label="Forward orientation"
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className={activeConfig?.orientation === 'reverse' ? 'is-active' : undefined}
                      onClick={() =>
                        updateActiveConfig((config) => ({ ...config, orientation: 'reverse' }))
                      }
                      aria-label="Reverse orientation"
                    >
                      ←
                    </button>
                  </div>
                </div>

                <div
                  className={`restriction-cloning-status ${
                    displayAnalysis.ready
                      ? gibsonAnalysisStatusClass(displayAnalysis.ready, displayAnalysis.designGrade?.level)
                      : displayActiveResolved?.ready
                        ? 'is-ready'
                        : 'is-invalid'
                  }`}
                >
                  {statusMessage}
                </div>

                <label className="restriction-cloning-field">
                  <span>Create product</span>
                  <ProductNameInput
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                  />
                </label>
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
                  ref={assembleMenuRef}
                  className={`restriction-cloning-clone-split${assembleMenuOpen ? ' is-open' : ''}`}
                >
                  <button
                    type="button"
                    className="primary restriction-cloning-clone-main"
                    disabled={!massOutputReady || batchBusy}
                    onClick={handleMassAssembleOpenAll}
                  >
                    Assemble and open all
                  </button>
                  <button
                    type="button"
                    className="primary restriction-cloning-clone-chevron"
                    disabled={!massOutputReady || batchBusy}
                    aria-label="Choose destination for mass Gibson-style assembly"
                    aria-haspopup="menu"
                    aria-expanded={assembleMenuOpen}
                    onClick={() => setAssembleMenuOpen((open) => !open)}
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {assembleMenuOpen && (
                    <div className="restriction-cloning-clone-menu" role="menu">
                      <button type="button" role="menuitem" onClick={handleMassAssembleOpenAll}>
                        Assemble and open all
                      </button>
                      <button type="button" role="menuitem" onClick={handleMassAssembleToDatabase}>
                        Assemble and save to Database…
                      </button>
                      <button type="button" role="menuitem" onClick={() => void handleMassAssembleToFolder()}>
                        Assemble and save to folder…
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={!analysis.ready}
                  onClick={handleAssemble}
                >
                  Assemble
                </button>
              )}
            </div>
          </aside>
        </MobileCloningLayout>
      </div>
      {active && overlapPrimersOpen && activeOverlapPrimerTargets.length > 0 && overlapPrimerAction && (
        <ChooseGibsonOverlapPrimersDialog
          method={selectedMethod}
          assemblyMode={assemblyMode}
          mode={overlapPrimerAction}
          batchCombinationCount={massMode ? massCandidates.length : 0}
          regions={activeOverlapPrimerTargets.map((target) => ({
            label: target.label,
            amplifyRange: target.config.amplifyRange!,
          }))}
          vectorEnzymeNames={vectorLinearizationEnzymeNames}
          initialOptions={defaultGibsonOverlapPrimerOptions(selectedMethod, orderedResolved.length, {
            maxFragmentBp: Math.max(
              0,
              ...orderedResolved.map((part) => (part.ready ? part.sequence.length : 0)),
              ...activeOverlapPrimerTargets.map((target) =>
                target.config.amplifyRange
                  ? target.config.amplifyRange.end - target.config.amplifyRange.start
                  : 0,
              ),
            ),
            productBp:
              orderedResolved.reduce(
                (sum, part) => sum + (part.ready ? part.sequence.length : 0),
                0,
              ) +
              activeOverlapPrimerTargets.reduce(
                (sum, target) =>
                  sum +
                  (target.config.amplifyRange
                    ? target.config.amplifyRange.end - target.config.amplifyRange.start
                    : 0),
                0,
              ),
          })}
          onCancel={() => setOverlapPrimersOpen(false)}
          onConfirm={applyOverlapPrimerDesign}
        />
      )}
      {active && databasePickerOpen && (
        <DatabaseConstructPickerDialog
          excludeRecordId={currentRecord.id}
          onCancel={() => setDatabasePickerOpen(false)}
          onSelect={(record, project) => {
            assignSource({
              kind: 'database',
              label: project.name,
              projectId: project.id,
              record,
            })
            setDatabasePickerOpen(false)
          }}
        />
      )}
      {active && massDatabasePickerTarget && (
        <DatabaseConstructPickerDialog
          multiple
          onCancel={() => setMassDatabasePickerTarget(null)}
          onSelectMany={(choices) => {
            chooseMassSources(
              choices.map(({ record, project }) => ({ key: `database:${project.id}`, record })),
              massDatabasePickerTarget,
            )
            setMassDatabasePickerTarget(null)
          }}
        />
      )}
      {active && massSourcePickerTarget && (
        <GibsonMultipleSourceDialog
          options={sourceOptions}
          onCancel={() => setMassSourcePickerTarget(null)}
          onConfirm={(options) => {
            chooseMassSources(
              options.map((option) => ({ key: constructSourceOptionValue(option), record: option.record })),
              massSourcePickerTarget,
            )
            setMassSourcePickerTarget(null)
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
          recordName={`${batchSaveProducts.length} Gibson-style products`}
          initialFileName="products.dna"
          title="Save Gibson-style products to Database"
          confirmLabel="Save here"
          allowCreateFolder
          status={batchStatus}
          busy={batchBusy}
          onCancel={() => {
            if (!batchBusy) setBatchSaveProducts(null)
          }}
          onConfirm={(folderId) => saveMassProductsToDatabase(folderId)}
        />
      )}
      {active && batchSaveLibrary && (
        <SaveToDatabaseDialog
          recordName={`${batchSaveLibrary.name} (${batchSaveLibrary.traceFiles?.length ?? 0} members)`}
          initialFileName={`${batchSaveLibrary.name}.dna`}
          title="Save Gibson-style product library to Database"
          confirmLabel="Save here"
          allowCreateFolder
          status={batchStatus}
          busy={batchBusy}
          onCancel={() => {
            if (!batchBusy) setBatchSaveLibrary(null)
          }}
          onConfirm={(folderId) => saveMassLibraryToDatabase(folderId)}
        />
      )}
    </div>
  )
}
