import { useTraceAlignment } from './presentation/hooks/traceAlignmentContext'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { DatabaseConstructPickerDialog } from './cloning/DatabaseConstructPickerDialog'
import {
  MassRestrictionNamesDialog,
  MassRestrictionLibraryMembersDialog,
  MassRestrictionLibraryOutputControls,
  MassRestrictionSourceNavigator,
  type MassRestrictionBatchResult,
  type MassInsertChoice,
  type MassRestrictionSourceChoice,
} from './cloning/MassRestrictionCloningDialogs'
import { constructSourceOptionValue, useConstructSources, type ConstructSourceOption } from './cloning/useConstructSources'
import { ConstructSourceSelect } from './cloning/ConstructSourceOptions'
import { ProductNameInput } from './cloning/ProductNameInput'
import { CloningSchemaPanel } from './CloningSchemaPanel'
import { MobileCloningLayout } from './MobileCloningLayout'
import { SaveToDatabaseDialog } from './SaveToDatabaseDialog'
import type { CloningWorkspaceEnzymeSet, CloningWorkspaceRenderArgs } from './cloningWorkspaceTypes'
import { enzymes, findRestrictionSites } from './domain/enzymes'
import {
  defaultEnzymePreferences,
  enzymePoolForSettings,
  loadEnzymePreferences,
} from './domain/enzymePreferences'
import {
  analyzeCloningOrientationAmbiguity,
  applyCutEndTreatment,
  assembleRestrictionCloningProduct,
  buildDntpFillPreview,
  canResolveFromExistingEnds,
  cloningDntpLabel,
  cloningInsertColor,
  CLONING_DNTP_BASES,
  cutEndOverhangPolarity,
  defaultCloningDntpSet,
  defaultCloningPartConfig,
  defaultDigestFragmentId,
  digestFragmentDisplayLabel,
  endsShareOverhangPolarity,
  fragmentById,
  listDigestFragmentsBetweenCuts,
  analyzePartialDigestWarning,
  resolveCloningPart,
  sortDigestFragmentsForDisplay,
  synchronizeSamePolarityTreatments,
  validateCloningAssembly,
  validateFragmentDeletion,
  validateLinearLigation,
  validateSiteDestruction,
  type CloningAssemblyMode,
  type CloningCutEnd,
  type CloningDntpSet,
  type CloningEndTreatment,
  type CloningPartConfig,
  type DntpFillGlyph,
  type DntpFillPreview,
  type PartialDigestWarning,
  type ResolvedCloningPart,
} from './domain/restrictionCloning'
import {
  MASS_INSERT_NAME_TOKEN,
  MASS_VECTOR_NAME_TOKEN,
  createRestrictionCloningProductLibraryAsync,
  describeMissingRestrictionSites,
  expandRestrictionInsertSources,
  formatSkippedRestrictionProducts,
  hasMassInsertNameToken,
  hasMassVectorNameToken,
  initialRestrictionOperationBatchSources,
  remapRestrictionPartConfig,
  renderMassRestrictionProductName,
  restrictionBatchPairs,
} from './domain/restrictionCloningBatch'
import {
  dedupeRestrictionSites,
  filterRestrictionSitesForEnzymeSet,
} from './domain/restrictionSiteFilters'
import {
  defaultConstructProperties,
  methylationForStrain,
  transformationStrainOptions,
} from './domain/constructProperties'
import { SEQUENCE_OPEN_ACCEPT } from './domain/fileFormats'
import { exportSnapGene, isSnapGeneBytes, parseSequenceBytes, parseSnapGene } from './domain/parsers'
import { addOperation, restrictionFragmentStrandSelection } from './domain/sequence'
import type { RestrictionSite, SequenceRecord } from './domain/types'
import { pickDesktopDirectory, writeUniqueBytesToDirectory } from './desktop/fileIo'
import { isTauriRuntime } from './desktop/tauriRuntime'
import { normalizeProjectFileName, saveProject } from './storage/projects'
import { useClampDialogToViewport } from './ui/useClampDialogToViewport'
import { calculateRestrictionValidation } from './application/cloning/restrictionValidation'

function enzymeSetFromKey(key: string): CloningWorkspaceEnzymeSet {
  return JSON.parse(key) as CloningWorkspaceEnzymeSet
}

type ActivePartId = 'vector' | `insert-${number}` | 'product'

type RestrictionCloningDialogProps = {
  active?: boolean
  currentRecord: SequenceRecord
  currentTabId: string
  initialEnzymeSet?: CloningWorkspaceEnzymeSet
  initialVectorSites?: RestrictionSite[]
  /** Opens the dialog already in delete-fragment / destroy-site / linear-ligation / insert mode. */
  initialMode?: CloningAssemblyMode
  onCancel: () => void
  onClone: (
    records: SequenceRecord[],
    options?: {
      open?: boolean
      statusMessage?: string
      batchResult?: MassRestrictionBatchResult
    },
  ) => void
  renderWorkspace: (args: CloningWorkspaceRenderArgs) => ReactNode
}

function partIndexFromId(id: ActivePartId): number | null {
  if (id === 'vector' || id === 'product') return null
  return Number(id.replace('insert-', ''))
}

function createInitialInserts(count: number): CloningPartConfig[] {
  return Array.from({ length: count }, () => defaultCloningPartConfig('insert', null))
}

function createInitialVectorConfig(
  record: SequenceRecord,
  initialVectorSites: RestrictionSite[],
  mode: CloningAssemblyMode = 'insert',
): CloningPartConfig {
  const config = defaultCloningPartConfig('vector', record)
  if (mode === 'destroy-site') {
    const site = initialVectorSites[0] ?? initialVectorSites[1] ?? null
    if (!site) return config
    return {
      ...config,
      leftCut: {
        ...config.leftCut,
        enzymeName: site.enzyme.name,
        site,
      },
      rightCut: {
        ...config.rightCut,
        enzymeName: site.enzyme.name,
        site,
      },
      selectedFragmentId: 'linearized',
    }
  }
  if (initialVectorSites.length !== 2) return config
  const [leftSite, rightSite] = initialVectorSites
  if (!leftSite || !rightSite) return config
  const fragments = listDigestFragmentsBetweenCuts(record, leftSite, rightSite)
  return {
    ...config,
    leftCut: {
      ...config.leftCut,
      enzymeName: leftSite.enzyme.name,
      site: leftSite,
    },
    rightCut: {
      ...config.rightCut,
      enzymeName: rightSite.enzyme.name,
      site: rightSite,
    },
    selectedFragmentId: defaultDigestFragmentId(config.role, fragments, record.sequence.length),
  }
}

function DntpFillStrand({ glyphs }: { glyphs: DntpFillGlyph[] }) {
  return (
    <div className="restriction-cloning-dntp-strand">
      {glyphs.map((glyph, index) => (
        <span
          key={`${glyph.role}-${index}-${glyph.char}`}
          className={`restriction-cloning-dntp-base is-${glyph.role}`}
        >
          {glyph.char === ' ' ? '\u00a0' : glyph.char}
        </span>
      ))}
    </div>
  )
}

function DntpFillPreviewPanel({ preview }: { preview: DntpFillPreview }) {
  return (
    <div className="restriction-cloning-dntp-preview" aria-label="Sticky-end fill preview">
      <div className="restriction-cloning-dntp-end">
        <DntpFillStrand glyphs={preview.leftTop} />
        <DntpFillStrand glyphs={preview.leftBottom} />
      </div>
      <div className="restriction-cloning-dntp-end">
        <DntpFillStrand glyphs={preview.rightTop} />
        <DntpFillStrand glyphs={preview.rightBottom} />
      </div>
    </div>
  )
}

function ChooseDntpsDialog({
  enzymeName,
  site,
  sequence,
  initialFillWith,
  onCancel,
  onConfirm,
}: {
  enzymeName: string
  site: RestrictionSite
  sequence: string
  initialFillWith: CloningDntpSet
  onCancel: () => void
  onConfirm: (fillWith: CloningDntpSet) => void
}) {
  const [draft, setDraft] = useState<CloningDntpSet>(() => ({ ...initialFillWith }))
  const preview = useMemo(
    () => buildDntpFillPreview(site, sequence, draft),
    [site, sequence, draft],
  )

  useEffect(() => {
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div className="restriction-cloning-dntp-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="restriction-cloning-dntp-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Choose dNTPs"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="restriction-cloning-dntp-modal-header">
          <strong>Choose dNTPs</strong>
        </header>
        <div className="restriction-cloning-dntp-modal-body">
          <div className="restriction-cloning-dntp-modal-row">
            <p className="restriction-cloning-dntp-prompt">
              Fill in <span className="restriction-cloning-dntp-enzyme">{enzymeName}</span> overhangs
              with:
            </p>
            <div className="restriction-cloning-dntp-list">
              {CLONING_DNTP_BASES.map((base) => (
                <label key={base} className="restriction-cloning-checkbox">
                  <input
                    type="checkbox"
                    checked={draft[base]}
                    onChange={() => setDraft((prev) => ({ ...prev, [base]: !prev[base] }))}
                  />
                  d{base}TP
                </label>
              ))}
            </div>
          </div>
          <DntpFillPreviewPanel preview={preview} />
          {preview.overhangType === "3'" && (
            <p className="restriction-cloning-hint">
              3′ overhangs are not filled by dNTPs; the sticky ends are shown untreated.
            </p>
          )}
          {preview.overhangType === 'blunt' && (
            <p className="restriction-cloning-hint">This site is blunt; there is nothing to fill.</p>
          )}
        </div>
        <footer className="restriction-cloning-dntp-modal-footer">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="is-primary" onClick={() => onConfirm(draft)}>
            OK
          </button>
        </footer>
      </div>
    </div>
  )
}

function CutEndTreatmentControls({
  cut,
  site,
  sequence,
  linkedPolarity = null,
  onChange,
}: {
  cut: CloningCutEnd
  site: RestrictionSite | null
  sequence: string | null
  /** When set, this end shares chemistry with the other fragment end of the same polarity. */
  linkedPolarity?: "5'" | "3'" | null
  onChange: (next: CloningCutEnd) => void
}) {
  const [dntpOpen, setDntpOpen] = useState(false)
  const [preferredAction, setPreferredAction] = useState<Exclude<CloningEndTreatment, 'none'>>(
    () => (cut.treatment === 'remove' ? 'remove' : 'fill'),
  )
  const enabled = cut.treatment !== 'none'
  const action: Exclude<CloningEndTreatment, 'none'> = enabled
    ? cut.treatment === 'remove'
      ? 'remove'
      : 'fill'
    : preferredAction
  const enzymeName = site?.enzyme.name ?? cut.enzymeName ?? 'enzyme'

  function setEnabled(checked: boolean) {
    onChange({
      ...cut,
      treatment: checked ? preferredAction : 'none',
      fillWith: cut.fillWith ?? defaultCloningDntpSet(),
    })
  }

  function setAction(next: Exclude<CloningEndTreatment, 'none'>) {
    setPreferredAction(next)
    onChange({
      ...cut,
      treatment: enabled ? next : 'none',
      fillWith:
        next === 'fill' && !Object.values(cut.fillWith).some(Boolean)
          ? defaultCloningDntpSet()
          : cut.fillWith,
    })
    if (next !== 'fill') setDntpOpen(false)
  }

  const fillIsInert = enabled && action === 'fill' && site?.enzyme.overhang.type === "3'"

  return (
    <div className="restriction-cloning-treatment">
      <label className="restriction-cloning-checkbox">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        <span>and</span>
      </label>
      <select
        className="restriction-cloning-treatment-action"
        value={action}
        disabled={!enabled}
        aria-label="Overhang treatment"
        onChange={(event) =>
          setAction(event.target.value === 'remove' ? 'remove' : 'fill')
        }
      >
        <option value="fill">fill overhangs</option>
        <option value="remove">remove overhangs</option>
      </select>
      {enabled && action === 'fill' && (
        <>
          <button
            type="button"
            className="restriction-cloning-dntp-button"
            disabled={!site || !sequence}
            aria-haspopup="dialog"
            onClick={() => setDntpOpen(true)}
          >
            with {cloningDntpLabel(cut.fillWith)}
          </button>
          {dntpOpen && site && sequence && (
            <ChooseDntpsDialog
              enzymeName={enzymeName}
              site={site}
              sequence={sequence}
              initialFillWith={cut.fillWith}
              onCancel={() => setDntpOpen(false)}
              onConfirm={(fillWith) => {
                onChange({ ...cut, treatment: 'fill', fillWith })
                setDntpOpen(false)
              }}
            />
          )}
        </>
      )}
      {linkedPolarity && (
        <p className="restriction-cloning-hint">
          Both {linkedPolarity} ends share this treatment — fill-in and chew-back each act on every{' '}
          {linkedPolarity} overhang of the fragment.
        </p>
      )}
      {fillIsInert && (
        <p className="restriction-cloning-hint">
          {enzymeName} leaves a 3′ overhang, which polymerase cannot fill. Choose “remove
          overhangs” to blunt this end.
        </p>
      )}
    </div>
  )
}

export function RestrictionCloningDialog({
  active = true,
  currentRecord,
  currentTabId,
  initialEnzymeSet,
  initialVectorSites = [],
  initialMode = 'insert',
  onCancel,
  onClone,
  renderWorkspace,
}: RestrictionCloningDialogProps) {
  const alignPending = useTraceAlignment()
  const titleId = useId()
  const sourceSelectId = `${titleId}-source-select`
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const massFileInputRef = useRef<HTMLInputElement | null>(null)
  const massFileTargetRef = useRef<ActivePartId>('insert-0')
  const massSourceMenuRef = useRef<HTMLDivElement | null>(null)
  const cloneMenuRef = useRef<HTMLDivElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  useClampDialogToViewport(dialogRef)
  const initialMassVectorChoices = initialRestrictionOperationBatchSources(
    currentRecord,
    initialMode,
  )
  const initialMassLigationChoices =
    initialMode === 'linear-ligation' && currentRecord.dna?.documentRole === 'library'
      ? expandRestrictionInsertSources([
          { key: `current:${currentRecord.id}`, record: currentRecord },
        ])
      : []
  const initialUnaryLibraryBatch = initialMassVectorChoices.length > 0
  const [mode, setMode] = useState<CloningAssemblyMode>(initialMode)
  const ligatingInitial = initialMode === 'linear-ligation'
  const [activePart, setActivePart] = useState<ActivePartId>(() =>
    ligatingInitial ? 'insert-0' : 'vector',
  )
  const [vector, setVector] = useState<CloningPartConfig>(() =>
    createInitialVectorConfig(currentRecord, initialVectorSites, initialMode),
  )
  const [inserts, setInserts] = useState<CloningPartConfig[]>(() =>
    ligatingInitial
      ? [defaultCloningPartConfig('insert', currentRecord), defaultCloningPartConfig('insert', null)]
      : createInitialInserts(1),
  )
  const [insertOrder, setInsertOrder] = useState<number[]>(() =>
    ligatingInitial ? [0, 1] : [0],
  )
  const [databasePickerOpen, setDatabasePickerOpen] = useState(false)
  const [massDatabasePickerTarget, setMassDatabasePickerTarget] = useState<ActivePartId | null>(null)
  const [massSourceMenuOpen, setMassSourceMenuOpen] = useState(false)
  const [massVectorChoices, setMassVectorChoices] =
    useState<MassRestrictionSourceChoice[]>(initialMassVectorChoices)
  const [massVectorPreviewIndex, setMassVectorPreviewIndex] = useState(0)
  const [massInsertSlot, setMassInsertSlot] = useState<number | null>(
    initialMassLigationChoices.length ? 0 : null,
  )
  const [massInsertChoices, setMassInsertChoices] = useState<MassInsertChoice[]>(
    initialMassLigationChoices,
  )
  const [massInsertPreviewIndex, setMassInsertPreviewIndex] = useState(0)
  const [massMemberExclusionTarget, setMassMemberExclusionTarget] = useState<'vector' | 'insert' | null>(null)
  const [excludedMassVectorKeys, setExcludedMassVectorKeys] = useState<string[]>([])
  const [excludedMassInsertKeys, setExcludedMassInsertKeys] = useState<string[]>([])
  const [massNamesOpen, setMassNamesOpen] = useState(false)
  const [massProductNames, setMassProductNames] = useState<Record<string, string>>({})
  const [cloneMenuOpen, setCloneMenuOpen] = useState(false)
  const [batchSaveProducts, setBatchSaveProducts] = useState<SequenceRecord[] | null>(null)
  const [massOutputAsLibrary, setMassOutputAsLibrary] = useState(false)
  const [massOutputLibraryName, setMassOutputLibraryName] = useState('Restriction cloning products')
  const [batchSaveLibrary, setBatchSaveLibrary] = useState<SequenceRecord | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchStatus, setBatchStatus] = useState('')
  const [productName, setProductName] = useState(() =>
    initialMode === 'delete-fragment'
      ? initialUnaryLibraryBatch
        ? `Deleted ${MASS_VECTOR_NAME_TOKEN}.dna`
        : 'Deleted.dna'
      : initialMode === 'destroy-site'
        ? initialUnaryLibraryBatch
          ? `Destroyed ${MASS_VECTOR_NAME_TOKEN}.dna`
          : 'Destroyed.dna'
        : initialMode === 'linear-ligation'
          ? initialMassLigationChoices.length
            ? `Ligated ${MASS_INSERT_NAME_TOKEN}.dna`
            : 'Ligated.dna'
          : 'Cloned.dna',
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
  const [cutAnchor, setCutAnchor] = useState<RestrictionSite | null>(null)
  const [enzymePickerSelection, setEnzymePickerSelection] = useState<{
    activePart: ActivePartId
    recordId: string | null
    sites: RestrictionSite[]
  }>(() => ({ activePart: 'vector', recordId: currentRecord.id, sites: [] }))
  const enzymePreferences = useMemo(() => {
    try {
      return loadEnzymePreferences()
    } catch {
      return defaultEnzymePreferences
    }
  }, [])
  const { groups: sourceGroups, options: sourceOptions, refresh: refreshSourceOptions } = useConstructSources({
    active,
    currentRecord,
    currentTabId,
  })

  useEffect(() => {
    if (!massSourceMenuOpen && !cloneMenuOpen) return
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (massSourceMenuOpen && !massSourceMenuRef.current?.contains(target)) {
        setMassSourceMenuOpen(false)
      }
      if (cloneMenuOpen && !cloneMenuRef.current?.contains(target)) setCloneMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [cloneMenuOpen, massSourceMenuOpen])

  const deleting = mode === 'delete-fragment'
  const destroying = mode === 'destroy-site'
  const ligating = mode === 'linear-ligation'
  const noInserts = deleting || destroying
  const partNoun = ligating ? 'Fragment' : 'Insert'

  const configuredActiveConfig = useMemo(() => {
    if (activePart === 'product') return null
    if (ligating) {
      const index = partIndexFromId(activePart)
      return index === null ? null : inserts[index] ?? null
    }
    if (activePart === 'vector') return vector
    if (noInserts) return vector
    const index = partIndexFromId(activePart)
    return index === null ? null : inserts[index] ?? null
  }, [activePart, inserts, ligating, noInserts, vector])

  const activeMassPreviewRecord = useMemo(() => {
    if (activePart === 'vector' && massVectorChoices.length > 0) {
      return massVectorChoices[massVectorPreviewIndex]?.record ?? massVectorChoices[0]?.record ?? null
    }
    const insertIndex = partIndexFromId(activePart)
    if (insertIndex !== null && insertIndex === massInsertSlot && massInsertChoices.length > 0) {
      return massInsertChoices[massInsertPreviewIndex]?.record ?? massInsertChoices[0]?.record ?? null
    }
    return null
  }, [activePart, massInsertChoices, massInsertPreviewIndex, massInsertSlot, massVectorChoices, massVectorPreviewIndex])

  const activeConfig = useMemo(
    () =>
      configuredActiveConfig && activeMassPreviewRecord
        ? remapRestrictionPartConfig(configuredActiveConfig, activeMassPreviewRecord)
        : configuredActiveConfig,
    [activeMassPreviewRecord, configuredActiveConfig],
  )

  const activeRecord = activeConfig?.record ?? null
  const selectedSourceOption = activeRecord
    ? sourceOptions.find((option) => option.record === activeRecord) ??
      sourceOptions.find((option) => option.record.id === activeRecord.id)
    : undefined
  const activeEnzymeSet = selectedSourceOption?.kind === 'open-tab'
    ? selectedSourceOption.enzymeSet ?? initialEnzymeSet
    : initialEnzymeSet
  const activeEnzymeSetKey = JSON.stringify(activeEnzymeSet ?? {
    set: 'unique-six-plus', selectedNames: [], supplierSetId: null,
  })
  const enzymePool = useMemo(
    () => enzymePoolForSettings(
      enzymeSetFromKey(activeEnzymeSetKey),
      enzymePreferences,
    ),
    [activeEnzymeSetKey, enzymePreferences],
  )
  const enzymePickerSites = useMemo(
    () =>
      enzymePickerSelection.activePart === activePart &&
      enzymePickerSelection.recordId === (activeRecord?.id ?? null)
        ? enzymePickerSelection.sites
        : [],
    [activePart, activeRecord?.id, enzymePickerSelection],
  )
  const handleEnzymePickerSitesChange = useCallback(
    (sites: RestrictionSite[]) => {
      setEnzymePickerSelection({ activePart, recordId: activeRecord?.id ?? null, sites })
    },
    [activePart, activeRecord?.id],
  )

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
              enzymeSetFromKey(activeEnzymeSetKey),
            )
          : []
    const selectedExtras = [activeConfig?.leftCut.site, activeConfig?.rightCut.site].filter(
      (site): site is RestrictionSite => Boolean(site),
    )
    return dedupeRestrictionSites([...source, ...selectedExtras]).sort(
      (left, right) =>
        left.enzyme.name.localeCompare(right.enzyme.name) || left.start - right.start,
    )
  }, [activeConfig?.leftCut.site, activeConfig?.rightCut.site, activeEnzymeSetKey, activeRecord, enzymePickerSites, enzymePool])

  function siteOptionValue(site: RestrictionSite) {
    return `${site.enzyme.name}@${site.start}`
  }

  function findSiteByOptionValue(value: string): RestrictionSite | null {
    return availableCutSites.find((site) => siteOptionValue(site) === value) ?? null
  }

  function assignCutSide(side: 'left' | 'right', site: RestrictionSite | null) {
    updateActiveConfig((config) => {
      if (side === 'left') {
        return synchronizeSamePolarityTreatments({
          ...config,
          leftCut: {
            ...config.leftCut,
            enzymeName: site?.enzyme.name ?? null,
            site,
          },
          selectedFragmentId:
            site && config.rightCut.site
              ? defaultDigestFragmentId(
                  config.role,
                  listDigestFragmentsBetweenCuts(config.record!, site, config.rightCut.site),
                  config.record!.sequence.length,
                )
              : null,
        })
      }
      return synchronizeSamePolarityTreatments({
        ...config,
        rightCut: {
          ...config.rightCut,
          enzymeName: site?.enzyme.name ?? null,
          site,
        },
        selectedFragmentId:
          site && config.leftCut.site
            ? defaultDigestFragmentId(
                config.role,
                listDigestFragmentsBetweenCuts(config.record!, config.leftCut.site, site),
                config.record!.sequence.length,
              )
            : null,
      })
    })
    setCutAnchor(null)
  }

  const digestFragments = useMemo(() => {
    if (!activeRecord || !activeConfig?.leftCut.site || !activeConfig.rightCut.site) return []
    return sortDigestFragmentsForDisplay(
      listDigestFragmentsBetweenCuts(
        activeRecord,
        activeConfig.leftCut.site,
        activeConfig.rightCut.site,
      ),
    )
  }, [activeConfig, activeRecord])

  const selectedFragment = useMemo(
    () =>
      fragmentById(
        digestFragments,
        activeConfig?.selectedFragmentId ??
          defaultDigestFragmentId(
            activeConfig?.role ?? 'insert',
            digestFragments,
            activeRecord?.sequence.length,
          ),
      ),
    [activeConfig, activeRecord?.sequence.length, digestFragments],
  )

  const resolvedVector = useMemo(
    () => resolveCloningPart(vector, '#222222'),
    [vector],
  )
  const resolvedInserts = useMemo(
    () => inserts.map((config, index) => resolveCloningPart(config, cloningInsertColor(index))),
    [inserts],
  )
  // Deletion / site-destruction re-ligate the vector onto itself, so inserts are
  // ignored end to end without discarding their configs.
  const activeInserts = useMemo(() => (noInserts ? [] : resolvedInserts), [noInserts, resolvedInserts])
  const resolvedActiveInserts = useMemo(
    () => activeInserts.filter((part): part is ResolvedCloningPart => Boolean(part)),
    [activeInserts],
  )
  const activeInsertOrder = useMemo(() => (noInserts ? [] : insertOrder), [insertOrder, noInserts])
  const validation = useMemo(
    () => calculateRestrictionValidation(
      destroying,
      deleting,
      ligating,
      resolvedVector,
      vector,
      resolvedInserts,
      insertOrder,
      inserts,
      activeInserts,
      activeInsertOrder,
    ),
    [
      activeInsertOrder,
      activeInserts,
      deleting,
      destroying,
      insertOrder,
      inserts,
      ligating,
      resolvedInserts,
      resolvedVector,
      vector,
    ],
  )
  const massVectorMode =
    !ligating &&
    (massVectorChoices.length > 1 || massVectorChoices.some((choice) => choice.librarySource))
  const massInsertMode =
    (mode === 'insert' || ligating) &&
    massInsertSlot !== null &&
    (massInsertChoices.length > 1 || massInsertChoices.some((choice) => choice.librarySource)) &&
    inserts[massInsertSlot]?.role === 'insert'
  const massMode = massVectorMode || massInsertMode
  const massBatchUnit = ligating
    ? 'fragment combinations'
    : noInserts
      ? 'constructs'
      : 'vector–insert combinations'
  const massActionLabel = deleting
    ? 'Delete fragments'
    : destroying
      ? 'Destroy sites'
      : ligating
        ? 'Ligate'
        : 'Clone'
  const massFinishedLabel = deleting
    ? 'Restriction fragment deletion finished'
    : destroying
      ? 'Restriction site destruction finished'
      : ligating
        ? 'Linear ligation finished'
        : 'Restriction cloning finished'

  const massCandidates = useMemo(() => {
    if (!massMode || !vector.record) return []
    const insertTemplate = massInsertMode && massInsertSlot !== null
      ? inserts[massInsertSlot]
      : null
    if (massInsertMode && !insertTemplate) return []
    const vectorVariants = massVectorMode
      ? massVectorChoices
      : [{ key: `single-vector:${vector.record.id}`, record: vector.record }]
    const fixedInsertName = insertOrder
      .map((index) => inserts[index]?.record?.name)
      .filter((name): name is string => Boolean(name))
      .join(' + ') || 'Insert'
    const insertVariants: Array<{
      key: string
      choice: MassInsertChoice | null
      name: string
    }> = massInsertMode
      ? massInsertChoices.map((choice) => ({
          key: choice.key,
          choice,
          name: choice.record.name,
        }))
      : [{ key: 'fixed-inserts', choice: null, name: fixedInsertName }]

    return restrictionBatchPairs(vectorVariants, insertVariants).map(({ key, vector: vectorChoice, insert: insertVariant }) => {
      const mappedVector = massVectorMode
        ? remapRestrictionPartConfig(vector, vectorChoice.record)
        : vector
      const candidateVector = resolveCloningPart(mappedVector, '#222222')
      const mappedInserts = inserts.map((config, index) =>
        massInsertMode && index === massInsertSlot && insertVariant.choice
          ? remapRestrictionPartConfig(insertTemplate!, insertVariant.choice.record)
          : config,
      )
      const resolved = mappedInserts.map((config, index) =>
        resolveCloningPart(config, cloningInsertColor(index)),
      )
      const rowValidation = ligating
        ? validateLinearLigation(resolved, insertOrder)
        : destroying
          ? validateSiteDestruction(candidateVector, mappedVector)
          : deleting
            ? validateFragmentDeletion(candidateVector, mappedVector)
            : validateCloningAssembly(candidateVector, resolved, insertOrder)
      const name = (
        massProductNames[key] ??
        renderMassRestrictionProductName(
          productName,
          insertVariant.name,
          vectorChoice.record.name,
        )
      ).trim()
      const mappedMassInsert = massInsertSlot === null ? null : mappedInserts[massInsertSlot]
      const failureReason =
        describeMissingRestrictionSites(vector, mappedVector) ??
        (insertTemplate && mappedMassInsert
          ? describeMissingRestrictionSites(insertTemplate, mappedMassInsert)
          : null) ??
        rowValidation.message
      return {
        key,
        vectorChoice,
        vectorName: ligating
          ? mappedInserts
              .map((config) => config.record?.name)
              .filter((name): name is string => Boolean(name))
              .join(' + ')
          : vectorChoice.record.name,
        vectorChoiceKey: vectorChoice.key,
        insertChoiceKey: insertVariant.choice?.key ?? null,
        insertName: noInserts || ligating ? '' : insertVariant.name,
        mappedVector,
        resolvedVector: candidateVector,
        mappedInserts,
        resolved,
        validation: rowValidation,
        ready:
          rowValidation.ready &&
          (ligating || Boolean(candidateVector)) &&
          (noInserts || resolved.every((part) => Boolean(part))),
        name,
        failureReason,
      }
    })
  }, [
    insertOrder,
    inserts,
    deleting,
    destroying,
    ligating,
    massInsertChoices,
    massInsertMode,
    massInsertSlot,
    massMode,
    massProductNames,
    massVectorChoices,
    massVectorMode,
    noInserts,
    productName,
    vector,
  ])

  const includedMassCandidates = useMemo(
    () =>
      massCandidates.filter(
        (candidate) =>
          !excludedMassVectorKeys.includes(candidate.vectorChoiceKey) &&
          (!candidate.insertChoiceKey || !excludedMassInsertKeys.includes(candidate.insertChoiceKey)),
      ),
    [excludedMassInsertKeys, excludedMassVectorKeys, massCandidates],
  )

  const cloneableMassCandidates = useMemo(
    () =>
      includedMassCandidates.filter(
        (candidate) => candidate.ready,
      ),
    [includedMassCandidates],
  )
  const failedMassCandidates = useMemo(
    () =>
      includedMassCandidates.filter(
        (candidate) => !candidate.ready,
      ),
    [includedMassCandidates],
  )
  const libraryMassInsertChoices = useMemo(
    () => massInsertChoices.filter((choice) => Boolean(choice.librarySource)),
    [massInsertChoices],
  )
  const libraryMassVectorChoices = useMemo(
    () => massVectorChoices.filter((choice) => Boolean(choice.librarySource)),
    [massVectorChoices],
  )
  const activeLibraryMassChoices = massMemberExclusionTarget === 'vector'
    ? libraryMassVectorChoices
    : libraryMassInsertChoices
  const cloneableLibraryChoiceKeys = useMemo(
    () =>
      activeLibraryMassChoices
        .filter((choice) =>
          massCandidates.some(
            (candidate) =>
              (massMemberExclusionTarget === 'vector'
                ? candidate.vectorChoiceKey === choice.key
                : candidate.insertChoiceKey === choice.key) &&
              candidate.ready,
          ),
        )
        .map((choice) => choice.key),
    [activeLibraryMassChoices, massCandidates, massMemberExclusionTarget],
  )
  const libraryMemberFailureReasons = useMemo(
    () =>
      Object.fromEntries(
        activeLibraryMassChoices.map((choice) => {
          const reasons = massCandidates
            .filter((candidate) =>
              massMemberExclusionTarget === 'vector'
                ? candidate.vectorChoiceKey === choice.key
                : candidate.insertChoiceKey === choice.key,
            )
            .map((candidate) => candidate.failureReason)
            .filter((reason, index, all) => Boolean(reason) && all.indexOf(reason) === index)
          return [
            choice.key,
            reasons.join('; ') ||
              (noInserts
                ? 'Not processable with the selected enzymes'
                : 'Not cloneable with the selected enzymes'),
          ]
        }),
      ),
    [activeLibraryMassChoices, massCandidates, massMemberExclusionTarget, noInserts],
  )
  const skippedMassProductMessage = useMemo(
    () =>
      formatSkippedRestrictionProducts(
        failedMassCandidates.map((candidate) => ({
          vectorName: candidate.vectorName,
          insertName: candidate.insertName,
          reason: candidate.failureReason,
        })),
        deleting
          ? 'processed by restriction fragment deletion'
          : destroying
            ? 'processed by restriction site destruction'
            : ligating
              ? 'ligated'
              : 'cloned',
      ),
    [deleting, destroying, failedMassCandidates, ligating],
  )
  const massBatchResult = useMemo<MassRestrictionBatchResult | null>(
    () =>
      massMode
        ? {
            action: deleting
              ? 'delete-fragment'
              : destroying
                ? 'destroy-site'
                : ligating
                  ? 'linear-ligation'
                  : 'clone',
            cloned: cloneableMassCandidates.map((candidate) => ({
              vectorName: candidate.vectorName,
              insertName: candidate.insertName,
              productName: candidate.name,
            })),
            notCloned: failedMassCandidates.map((candidate) => ({
              vectorName: candidate.vectorName,
              insertName: candidate.insertName,
              reason: candidate.failureReason,
            })),
          }
        : null,
    [cloneableMassCandidates, deleting, destroying, failedMassCandidates, ligating, massMode],
  )

  const massNamesAreValid = useMemo(() => {
    if (!massMode) return true
    const names = cloneableMassCandidates.map((candidate) =>
      candidate.name.replace(/\.dna$/i, '').trim(),
    )
    return names.every(Boolean) && new Set(names.map((name) => name.toLocaleLowerCase())).size === names.length
  }, [cloneableMassCandidates, massMode])

  const massValidationMessage = useMemo(() => {
    if (!massMode) return ''
    if (!includedMassCandidates.length) {
      return 'Select at least one library member to include in the cloning batch.'
    }
    if (!cloneableMassCandidates.length) {
      return `None of the ${includedMassCandidates.length} ${massBatchUnit} can be processed. ${skippedMassProductMessage}`
    }
    if (!massNamesAreValid) {
      const requiredTokens = [
        massVectorMode && !hasMassVectorNameToken(productName) ? MASS_VECTOR_NAME_TOKEN : null,
        massInsertMode && !hasMassInsertNameToken(productName) ? MASS_INSERT_NAME_TOKEN : null,
      ].filter((token): token is string => Boolean(token))
      const namingMessage = requiredTokens.length === 0
        ? 'Every generated product name must be non-empty and unique.'
        : `Add ${requiredTokens.join(' and ')} to the template or use Choose names.`
      return failedMassCandidates.length
        ? `${cloneableMassCandidates.length} of ${includedMassCandidates.length} ${massBatchUnit} can be processed. ${skippedMassProductMessage} ${namingMessage}`
        : namingMessage
    }
    if (failedMassCandidates.length) {
      return `${cloneableMassCandidates.length} of ${includedMassCandidates.length} ${massBatchUnit} are ready and will be processed. ${skippedMassProductMessage}`
    }
    return `${cloneableMassCandidates.length} ${massBatchUnit} are ready with the configured enzymes.`
  }, [
    cloneableMassCandidates.length,
    failedMassCandidates.length,
    includedMassCandidates.length,
    massMode,
    massNamesAreValid,
    massInsertMode,
    massBatchUnit,
    massVectorMode,
    productName,
    skippedMassProductMessage,
  ])

  const cloneReady = massMode
    ? cloneableMassCandidates.length > 0 && massNamesAreValid
    : validation.ready
  const cloneOutputReady = cloneReady && (!massOutputAsLibrary || Boolean(massOutputLibraryName.trim()))

  const orientationAmbiguity = useMemo(() => {
    if (ligating || noInserts || !validation.ready || !resolvedVector) return null
    const ordered = insertOrder
      .map((index) => resolvedInserts[index])
      .filter((part): part is ResolvedCloningPart => Boolean(part))
    if (ordered.length !== insertOrder.length) return null
    return analyzeCloningOrientationAmbiguity(resolvedVector, ordered)
  }, [insertOrder, ligating, noInserts, resolvedInserts, resolvedVector, validation.ready])

  const partialDigestWarnings = useMemo(() => {
      const assemblyConfigured = ligating
      ? resolvedInserts.filter((part): part is ResolvedCloningPart => Boolean(part)).length >= 2
      : Boolean(resolvedVector) && (noInserts || resolvedInserts.some(Boolean))
    if (!assemblyConfigured) return [] as PartialDigestWarning[]

    const parts: Array<{ label: string; config: CloningPartConfig }> = []
    if (!ligating) parts.push({ label: 'Vector', config: vector })
    inserts.forEach((config, index) => {
      parts.push({
        label: ligating ? `Fragment ${index + 1}` : `Insert ${index + 1}`,
        config,
      })
    })

    const warnings: PartialDigestWarning[] = []
    for (const { label, config } of parts) {
      if (!config.record || !config.leftCut.site || !config.rightCut.site) continue
      const enzymeNames = new Set(
        [config.leftCut.site.enzyme.name, config.rightCut.site.enzyme.name].filter(Boolean),
      )
      const pool = enzymes.filter((enzyme) => enzymeNames.has(enzyme.name))
      const sites = findRestrictionSites(config.record.sequence, pool, {
        construct: config.record.construct,
        topology: config.record.topology,
        annotateMethylation: true,
      })
      const warning = analyzePartialDigestWarning(label, config, sites)
      if (warning) warnings.push(warning)
    }
    return warnings
  }, [inserts, ligating, noInserts, resolvedInserts, resolvedVector, vector])

  const activeEndsLinkedPolarity = useMemo(() => {
    if (!activeConfig || destroying) return null
    if (!endsShareOverhangPolarity(activeConfig.leftCut, activeConfig.rightCut)) return null
    return cutEndOverhangPolarity(activeConfig.leftCut)
  }, [activeConfig, destroying])

  const vectorDigestFragments = useMemo(() => {
    if (!vector.record || !vector.leftCut.site || !vector.rightCut.site) return []
    return sortDigestFragmentsForDisplay(
      listDigestFragmentsBetweenCuts(vector.record, vector.leftCut.site, vector.rightCut.site),
    )
  }, [vector.leftCut.site, vector.record, vector.rightCut.site])

  const vectorSelectedFragmentId =
    vector.selectedFragmentId ??
    defaultDigestFragmentId('vector', vectorDigestFragments, vector.record?.sequence.length)

  const productAssembly = useMemo(() => {
    if (activePart !== 'product' || !validation.productLength) return null
    if (ligating) {
      if (resolvedActiveInserts.length < 2 || resolvedActiveInserts.length !== activeInserts.length) return null
      return assembleRestrictionCloningProduct({
        inserts: resolvedActiveInserts,
        insertOrder: activeInsertOrder,
        productName,
        mode: 'linear-ligation',
      })
    }
    const productVector = massMode ? includedMassCandidates[0]?.resolvedVector : resolvedVector
    if (!productVector) return null
    return assembleRestrictionCloningProduct({
      vector: productVector,
      inserts: resolvedActiveInserts,
      insertOrder: activeInsertOrder,
      productName: massMode ? (includedMassCandidates[0]?.name ?? productName) : productName,
      mode,
    })
  }, [
    activeInsertOrder,
    activeInserts,
    activePart,
    ligating,
    mode,
    includedMassCandidates,
    massMode,
    productName,
    resolvedActiveInserts,
    resolvedVector,
    validation.productLength,
  ])

  const previewRecord = useMemo(() => {
    if (activePart === 'product') {
      if (!productAssembly) return null
      return {
        ...productAssembly.record,
        id: 'cloning-product-preview',
        name: (massMode ? (includedMassCandidates[0]?.name ?? productName) : productName).replace(/\.dna$/i, ''),
        features: productAssembly.record.features.map((feature) => ({
          ...feature,
          // Product preview: do not continue CDS translation past annotated bounds.
          translateInSequenceView: false,
          translation: undefined,
        })),
      } satisfies SequenceRecord
    }
    return activeRecord
  }, [activePart, activeRecord, includedMassCandidates, massMode, productAssembly, productName])

  const productHighlights = useMemo(() => {
    if (activePart !== 'product' || !productAssembly) return []
    return productAssembly.partSpans.map((span) => ({
      start: span.start,
      end: span.end,
      color: span.color,
      label: span.label,
    }))
  }, [activePart, productAssembly])

  // Deletion mode: paint the arc that will disappear so the map reads at a glance.
  const deletedRegionHighlights = useMemo(() => {
    if (!deleting || activePart === 'product') return []
    const sourceLength = vector.record?.sequence.length ?? 0
    if (sourceLength <= 0) return []
    return vectorDigestFragments
      .filter((fragment) => fragment.id !== vectorSelectedFragmentId)
      .flatMap((fragment) => {
        const spans = fragment.wraps
          ? [
              { start: fragment.start, end: sourceLength },
              { start: 0, end: fragment.end },
            ]
          : [{ start: fragment.start, end: fragment.end }]
        return spans
          .filter((span) => span.end > span.start)
          .map((span) => ({ ...span, color: '#c0392b', label: 'Deleted' }))
      })
  }, [activePart, deleting, vector.record, vectorDigestFragments, vectorSelectedFragmentId])

  function updateActiveConfig(updater: (config: CloningPartConfig) => CloningPartConfig) {
    if (activePart === 'product' || !activeConfig) return
    if (ligating) {
      const index = partIndexFromId(activePart)
      if (index === null) return
      setInserts((current) =>
        current.map((config, configIndex) => (configIndex === index ? updater(activeConfig) : config)),
      )
      return
    }
    if (activePart === 'vector' || noInserts) {
      setVector(() => updater(activeConfig))
      return
    }
    const index = partIndexFromId(activePart)
    if (index === null) return
    setInserts((current) =>
      current.map((config, configIndex) => (configIndex === index ? updater(activeConfig) : config)),
    )
  }

  function assignSource(option: ConstructSourceOption) {
    const activeInsertIndex = partIndexFromId(activePart)
    if (activePart === 'vector') {
      setMassVectorChoices([])
      setMassVectorPreviewIndex(0)
      setExcludedMassVectorKeys([])
      setMassMemberExclusionTarget(null)
      setMassProductNames({})
      setProductName((current) =>
        renderMassRestrictionProductName(
          current,
          inserts[massInsertSlot ?? 0]?.record?.name ?? 'Insert',
          option.record.name,
        ),
      )
    }
    if (activeInsertIndex !== null && activeInsertIndex === massInsertSlot) {
      setMassInsertSlot(null)
      setMassInsertChoices([])
      setMassInsertPreviewIndex(0)
      setExcludedMassInsertKeys([])
      setMassMemberExclusionTarget(null)
      setMassProductNames({})
      setProductName((current) =>
        renderMassRestrictionProductName(
          current,
          option.record.name,
          vector.record?.name ?? 'Vector',
        ),
      )
    }
    updateActiveConfig((config) => ({
      ...config,
      record: option.record,
      selectedFragmentId: null,
      leftCut: { ...config.leftCut, enzymeName: null, site: null },
      rightCut: { ...config.rightCut, enzymeName: null, site: null },
    }))
    setCutAnchor(null)
  }

  function assignSelectedSource(option: ConstructSourceOption) {
    const insertIndex = partIndexFromId(activePart)
    const libraryBatchTarget =
      option.record.dna?.documentRole === 'library' &&
      (((mode === 'insert' || ligating) && insertIndex !== null) ||
        (noInserts && activePart === 'vector'))
    if (libraryBatchTarget) {
      chooseMassSources(
        [{ key: constructSourceOptionValue(option), record: option.record }],
        activePart,
      )
      return
    }
    assignSource(option)
  }

  function handleEnzymeSelect(site: RestrictionSite, extendSelection: boolean) {
    if (!activeConfig || activePart === 'product') return
    // Destroy-site: one click is enough — both termini are the same cut.
    if (destroying) {
      updateActiveConfig((config) => ({
        ...config,
        leftCut: {
          ...config.leftCut,
          enzymeName: site.enzyme.name,
          site,
        },
        rightCut: {
          ...config.rightCut,
          enzymeName: site.enzyme.name,
          site,
        },
        selectedFragmentId: 'linearized',
      }))
      setCutAnchor(null)
      return
    }
    // First click = 5′ (left) cut; second click = 3′ (right) cut — preserve click order
    // so Acc65I then BamHI vs BamHI then Acc65I yield different default fragments.
    if (extendSelection && cutAnchor) {
      const leftSite = cutAnchor
      const rightSite = site
      const fragments = listDigestFragmentsBetweenCuts(activeRecord!, leftSite, rightSite)
      const defaultId = defaultDigestFragmentId(
        activeConfig.role,
        fragments,
        activeRecord!.sequence.length,
      )
      updateActiveConfig((config) =>
        synchronizeSamePolarityTreatments({
          ...config,
          leftCut: {
            ...config.leftCut,
            enzymeName: leftSite.enzyme.name,
            site: leftSite,
          },
          rightCut: {
            ...config.rightCut,
            enzymeName: rightSite.enzyme.name,
            site: rightSite,
          },
          selectedFragmentId: defaultId,
        }),
      )
      setCutAnchor(null)
      return
    }
    setCutAnchor(site)
    updateActiveConfig((config) => ({
      ...config,
      leftCut: { ...config.leftCut, enzymeName: site.enzyme.name, site },
      rightCut: { ...config.rightCut, enzymeName: null, site: null },
      selectedFragmentId: null,
    }))
  }

  async function importConstruct(file: File) {
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      const parsed = isSnapGeneBytes(bytes)
        ? parseSnapGene(bytes, file.name)
        : parseSequenceBytes(buffer, file.name)
      const imported = addOperation(parsed, 'import', `Imported ${file.name} for cloning.`)
      assignSelectedSource({ kind: 'current', label: imported.name, record: imported })
    } catch (error) {
      window.alert(`Could not import construct: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function addMassNameToken(template: string, token: string) {
    const matcher = token === MASS_VECTOR_NAME_TOKEN ? /<vector_name>/i : /<insert_name>/i
    if (matcher.test(template)) return template
    if (template === 'Cloned.dna') return `Cloned ${token}.dna`
    return /\.dna$/i.test(template)
      ? template.replace(/\.dna$/i, ` ${token}.dna`)
      : `${template} ${token}`
  }

  function chooseMassVectors(choices: MassRestrictionSourceChoice[]) {
    if (ligating || choices.length === 0) return
    setActivePart('vector')
    const unique = choices.filter(
      (choice, index) => choices.findIndex((candidate) => candidate.key === choice.key) === index,
    )
    const first = unique[0]!
    setVector((config) => remapRestrictionPartConfig(config, first.record))
    const keepBatch = unique.length > 1 || unique.some((choice) => choice.librarySource)
    setMassVectorChoices(keepBatch ? unique : [])
    setMassVectorPreviewIndex(0)
    setExcludedMassVectorKeys([])
    setMassMemberExclusionTarget(null)
    setMassProductNames({})
    if (keepBatch) {
      setProductName((current) => addMassNameToken(current, MASS_VECTOR_NAME_TOKEN))
      setBatchStatus(`${unique.length} mass ${noInserts ? 'constructs' : 'vectors'} selected.`)
    } else {
      setBatchStatus('')
    }
    setCutAnchor(null)
    setMassSourceMenuOpen(false)
  }

  function chooseMassSources(choices: MassRestrictionSourceChoice[], target: ActivePartId) {
    if (target === 'vector') {
      const expanded = noInserts
        ? expandRestrictionInsertSources(choices, { topology: 'source' })
        : choices
      if (!expanded.length) {
        setBatchStatus('The selected DNA library does not contain any members to process.')
        setMassSourceMenuOpen(false)
        return
      }
      chooseMassVectors(expanded)
      return
    }
    const insertIndex = partIndexFromId(target)
    if (insertIndex === null) return
    setActivePart(target)
    const expanded = expandRestrictionInsertSources(choices)
    if (!expanded.length) {
      setBatchStatus('The selected DNA library does not contain any members to clone.')
      setMassSourceMenuOpen(false)
      return
    }
    chooseMassInsertsForSlot(expanded, insertIndex)
  }

  function chooseMassInsertsForSlot(choices: MassInsertChoice[], insertIndex: number) {
    setActivePart(`insert-${insertIndex}`)
    const unique = choices.filter(
      (choice, index) => choices.findIndex((candidate) => candidate.key === choice.key) === index,
    )
    if (!unique.length || (mode !== 'insert' && !ligating)) return
    const first = unique[0]!
    setInserts((current) =>
      current.map((config, index) =>
        index === insertIndex ? remapRestrictionPartConfig(config, first.record) : config,
      ),
    )
    if (unique.length > 1 || unique.some((choice) => choice.librarySource)) {
      setMassInsertSlot(insertIndex)
      setMassInsertChoices(unique)
      setMassInsertPreviewIndex(0)
      setExcludedMassInsertKeys([])
      setMassMemberExclusionTarget(null)
      setMassProductNames({})
      setProductName((current) => addMassNameToken(current, MASS_INSERT_NAME_TOKEN))
      setBatchStatus(`${unique.length} mass inserts selected.`)
    } else {
      setMassInsertSlot(null)
      setMassInsertChoices([])
      setMassInsertPreviewIndex(0)
      setExcludedMassInsertKeys([])
      setMassProductNames({})
      setBatchStatus('')
    }
    setCutAnchor(null)
    setMassSourceMenuOpen(false)
  }

  async function importMassConstructs(files: File[]) {
    const imported: MassInsertChoice[] = []
    const errors: string[] = []
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]!
      try {
        const buffer = await file.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        const parsed = isSnapGeneBytes(bytes)
          ? parseSnapGene(bytes, file.name)
          : parseSequenceBytes(buffer, file.name)
        imported.push({
          key: `file:${file.name}:${file.size}:${file.lastModified}:${index}`,
          record: addOperation(parsed, 'import', `Imported ${file.name} for mass cloning.`),
        })
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (imported.length) chooseMassSources(imported, massFileTargetRef.current)
    if (errors.length) window.alert(`Could not import ${errors.length} construct(s):\n${errors.join('\n')}`)
    if (massFileInputRef.current) massFileInputRef.current.value = ''
  }

  function addInsert() {
    const nextIndex = inserts.length
    setInserts((current) => [...current, defaultCloningPartConfig('insert', null)])
    setInsertOrder((current) => [...current, nextIndex])
    setActivePart(`insert-${nextIndex}`)
  }

  function removeInsert() {
    const minParts = ligating ? 2 : 1
    if (inserts.length <= minParts) return
    const index = partIndexFromId(activePart)
    const removeIndex = index ?? inserts.length - 1
    setInserts((current) => current.filter((_, configIndex) => configIndex !== removeIndex))
    setInsertOrder((current) =>
      current
        .filter((orderIndex) => orderIndex !== removeIndex)
        .map((orderIndex) => (orderIndex > removeIndex ? orderIndex - 1 : orderIndex)),
    )
    if (massInsertSlot === removeIndex) {
      setMassInsertSlot(null)
      setMassInsertChoices([])
      setMassInsertPreviewIndex(0)
      setExcludedMassInsertKeys([])
      setMassProductNames({})
    } else if (massInsertSlot !== null && massInsertSlot > removeIndex) {
      setMassInsertSlot(massInsertSlot - 1)
    }
    setActivePart(ligating ? 'insert-0' : 'vector')
  }

  function setCloningMode(next: CloningAssemblyMode) {
    const previous = mode
    const nextUnaryLibraryChoices = initialRestrictionOperationBatchSources(
      vector.record ?? currentRecord,
      next,
    )
    const nextLigationChoices =
      next === 'linear-ligation' && currentRecord.dna?.documentRole === 'library'
        ? expandRestrictionInsertSources([
            { key: `current:${currentRecord.id}`, record: currentRecord },
          ])
        : []
    setMode(next)
    if (next === 'linear-ligation') {
      setActivePart('insert-0')
    } else if (next !== 'insert' && activePart !== 'vector' && activePart !== 'product') {
      setActivePart('vector')
    }
    setCutAnchor(null)
    if (next !== previous) {
      setMassVectorChoices(nextUnaryLibraryChoices)
      setMassVectorPreviewIndex(0)
      setExcludedMassVectorKeys([])
      setMassInsertSlot(nextLigationChoices.length ? 0 : null)
      setMassInsertChoices(nextLigationChoices)
      setMassInsertPreviewIndex(0)
      setExcludedMassInsertKeys([])
      setMassMemberExclusionTarget(null)
      setMassProductNames({})
      setCloneMenuOpen(false)
    }
    setProductName((current) => {
      const defaults = new Set([
        'Cloned.dna',
        'Deleted.dna',
        'Destroyed.dna',
        'Ligated.dna',
        `Deleted ${MASS_VECTOR_NAME_TOKEN}.dna`,
        `Destroyed ${MASS_VECTOR_NAME_TOKEN}.dna`,
        `Ligated ${MASS_INSERT_NAME_TOKEN}.dna`,
      ])
      if (!defaults.has(current) && current !== '') return current
      if (next === 'delete-fragment') {
        return nextUnaryLibraryChoices.length > 0
          ? `Deleted ${MASS_VECTOR_NAME_TOKEN}.dna`
          : 'Deleted.dna'
      }
      if (next === 'destroy-site') {
        return nextUnaryLibraryChoices.length > 0
          ? `Destroyed ${MASS_VECTOR_NAME_TOKEN}.dna`
          : 'Destroyed.dna'
      }
      if (next === 'linear-ligation') {
        return nextLigationChoices.length
          ? `Ligated ${MASS_INSERT_NAME_TOKEN}.dna`
          : 'Ligated.dna'
      }
      return 'Cloned.dna'
    })
    // Entering destroy-site: collapse any two-cut selection to a single site.
    if (next === 'destroy-site') {
      setVector((config) => {
        const site = config.leftCut.site ?? config.rightCut.site
        if (!site) {
          return {
            ...config,
            leftCut: { ...config.leftCut, enzymeName: null, site: null },
            rightCut: { ...config.rightCut, enzymeName: null, site: null },
            selectedFragmentId: null,
          }
        }
        return {
          ...config,
          leftCut: { ...config.leftCut, enzymeName: site.enzyme.name, site },
          rightCut: { ...config.rightCut, enzymeName: site.enzyme.name, site },
          selectedFragmentId: 'linearized',
        }
      })
    } else if (previous === 'destroy-site' && next === 'insert') {
      // Leave cuts as-is when returning to insert mode.
    }
  }

  function assignDestroySite(site: RestrictionSite | null) {
    updateActiveConfig((config) => ({
      ...config,
      leftCut: {
        ...config.leftCut,
        enzymeName: site?.enzyme.name ?? null,
        site,
      },
      rightCut: {
        ...config.rightCut,
        enzymeName: site?.enzyme.name ?? null,
        site,
      },
      selectedFragmentId: site ? 'linearized' : null,
    }))
    setCutAnchor(null)
  }

  function setSharedEndTreatment(next: CloningCutEnd) {
    // Both termini of a single-site linearization share the same overhang chemistry.
    updateActiveConfig((config) => ({
      ...config,
      leftCut: {
        ...config.leftCut,
        treatment: next.treatment,
        fillWith: next.fillWith,
      },
      rightCut: {
        ...config.rightCut,
        treatment: next.treatment,
        fillWith: next.fillWith,
      },
    }))
  }

  function buildCloneProducts(): SequenceRecord[] {
    if (!cloneReady) return []
    const constructOverrides = {
      bacterialTransformationStrain: productStrainId || null,
      hostMethylation: methylationForStrain(productStrainId || null),
      sequenceAuthor: productAuthor,
    }
    if (massMode) {
      return cloneableMassCandidates.flatMap((candidate) => {
        if (!ligating && !candidate.resolvedVector) return []
        const resolved = candidate.resolved.filter(
          (part): part is ResolvedCloningPart => Boolean(part),
        )
        if (!candidate.ready || (!noInserts && resolved.length !== candidate.resolved.length)) return []
        return [
          assembleRestrictionCloningProduct({
            vector: ligating ? undefined : candidate.resolvedVector,
            inserts: noInserts ? [] : resolved,
            insertOrder,
            productName: candidate.name,
            mode,
            constructOverrides,
          }).record,
        ]
      })
    }
    if (ligating) {
      if (resolvedActiveInserts.length < 2 || resolvedActiveInserts.length !== activeInserts.length) return []
      const result = assembleRestrictionCloningProduct({
        inserts: resolvedActiveInserts,
        insertOrder: activeInsertOrder,
        productName,
        mode: 'linear-ligation',
        constructOverrides,
      })
      return [result.record]
    }
    if (!resolvedVector) return []
    const result = assembleRestrictionCloningProduct({
      vector: resolvedVector,
      inserts: resolvedActiveInserts,
      insertOrder: activeInsertOrder,
      productName,
      mode,
      constructOverrides,
    })
    return [result.record]
  }

  async function handleCloneAndOpenAll() {
    if (batchBusy) return
    const products = buildCloneProducts()
    if (!products.length) return
    setCloneMenuOpen(false)
    setBatchBusy(true)
    setBatchStatus(massOutputAsLibrary ? 'Preparing library members…' : '')
    try {
      const records = massOutputAsLibrary
        ? [await createRestrictionCloningProductLibraryAsync(products, massOutputLibraryName, alignPending)]
        : products
      onClone(records, {
        statusMessage: massOutputAsLibrary
          ? `${massFinishedLabel}: opened ${records[0]!.name} with ${products.length} members, ${massBatchResult?.notCloned.length ?? 0} not processed.`
          : massBatchResult
            ? `${massFinishedLabel}: ${records.length} opened, ${massBatchResult.notCloned.length} not processed.`
            : undefined,
        batchResult: massBatchResult ?? undefined,
      })
    } catch (error) {
      setBatchStatus(`Could not prepare library: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  async function handleCloneToDatabase() {
    if (batchBusy) return
    const products = buildCloneProducts()
    if (!products.length) return
    setCloneMenuOpen(false)
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

  async function saveBatchToDatabase(folderId: string | null) {
    if (!batchSaveProducts?.length || batchBusy) return
    setBatchBusy(true)
    try {
      for (let index = 0; index < batchSaveProducts.length; index += 1) {
        const record = batchSaveProducts[index]!
        setBatchStatus(`Saving ${index + 1} of ${batchSaveProducts.length} to Database…`)
        await saveProject(record, {
          folderId,
          fileName: normalizeProjectFileName(null, record.name, 'dna'),
        })
      }
      const count = batchSaveProducts.length
      setBatchSaveProducts(null)
      onClone([], {
        open: false,
        statusMessage: `${massFinishedLabel}: ${count} saved to Database, ${massBatchResult?.notCloned.length ?? 0} not processed.`,
        batchResult: massBatchResult ?? undefined,
      })
    } catch (error) {
      setBatchStatus(`Could not save batch: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  async function handleCloneToFolder() {
    const products = buildCloneProducts()
    if (!products.length || batchBusy) return
    setCloneMenuOpen(false)
    setBatchStatus('')
    if (!isTauriRuntime()) {
      setBatchStatus('Saving a batch to a folder is available in the desktop app.')
      return
    }
    const directory = await pickDesktopDirectory(
      massOutputAsLibrary
        ? 'Choose folder for cloning product library'
        : 'Choose folder for cloning products',
    )
    if (!directory) return
    setBatchBusy(true)
    try {
      if (massOutputAsLibrary) {
        setBatchStatus('Preparing library members…')
        const library = await createRestrictionCloningProductLibraryAsync(products, massOutputLibraryName, alignPending)
        setBatchStatus(`Saving ${library.name} to folder…`)
        const fileName = normalizeProjectFileName(null, library.name, 'dna')
        await writeUniqueBytesToDirectory(directory, fileName, exportSnapGene(library))
      } else {
        for (let index = 0; index < products.length; index += 1) {
          const record = products[index]!
          setBatchStatus(`Saving ${index + 1} of ${products.length} to folder…`)
          const fileName = normalizeProjectFileName(null, record.name, 'dna')
          await writeUniqueBytesToDirectory(directory, fileName, exportSnapGene(record))
        }
      }
      onClone([], {
        open: false,
        statusMessage: massOutputAsLibrary
          ? `${massFinishedLabel}: ${products.length} products saved as library ${massOutputLibraryName.trim().replace(/\.dna$/i, '')}, ${massBatchResult?.notCloned.length ?? 0} not processed.`
          : `${massFinishedLabel}: ${products.length} saved to folder, ${massBatchResult?.notCloned.length ?? 0} not processed.`,
        batchResult: massBatchResult ?? undefined,
      })
    } catch (error) {
      setBatchStatus(`Could not save batch: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  async function saveBatchLibraryToDatabase(folderId: string | null) {
    if (!batchSaveLibrary || batchBusy) return
    setBatchBusy(true)
    try {
      setBatchStatus(`Saving ${batchSaveLibrary.name} to Database…`)
      await saveProject(batchSaveLibrary, {
        folderId,
        fileName: normalizeProjectFileName(null, batchSaveLibrary.name, 'dna'),
      })
      const memberCount = batchSaveLibrary.traceFiles?.length ?? 0
      const libraryName = batchSaveLibrary.name
      setBatchSaveLibrary(null)
      onClone([], {
        open: false,
        statusMessage: `${massFinishedLabel}: ${memberCount} products saved as library ${libraryName}, ${massBatchResult?.notCloned.length ?? 0} not processed.`,
        batchResult: massBatchResult ?? undefined,
      })
    } catch (error) {
      setBatchStatus(`Could not save library: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBatchBusy(false)
    }
  }

  const selectedSourceKey = selectedSourceOption
    ? constructSourceOptionValue(selectedSourceOption)
    : ''

  const selectedSites = useMemo(() => {
    if (destroying) {
      return activeConfig?.leftCut.site ? [activeConfig.leftCut.site] : []
    }
    return [activeConfig?.leftCut.site, activeConfig?.rightCut.site].filter(
      (site): site is RestrictionSite => Boolean(site),
    )
  }, [activeConfig, destroying])

  const usesExistingEnds =
    Boolean(activeConfig?.record) &&
    !activeConfig?.leftCut.site &&
    !activeConfig?.rightCut.site &&
    canResolveFromExistingEnds(activeConfig?.record)

  const activePartIndex = partIndexFromId(activePart)
  const activeResolvedPart =
    activePart === 'vector' || (noInserts && !ligating)
      ? resolvedVector
      : activePartIndex !== null
        ? resolvedInserts[activePartIndex] ?? null
        : null

  const workspaceSelectedRange = useMemo(() => {
    if (activePart === 'product') return null
    if (!selectedFragment || !activeRecord) return null
    // Single-site linearization covers the whole circular molecule.
    if (
      selectedFragment.id === 'linearized' ||
      (selectedFragment.wraps && selectedFragment.start === selectedFragment.end)
    ) {
      return { start: 0, end: activeRecord.sequence.length }
    }
    // Circular wrap convention: start > end means the arc through the origin.
    return { start: selectedFragment.start, end: selectedFragment.end }
  }, [activePart, activeRecord, selectedFragment])

  const workspaceCutStrandSelection = useMemo(() => {
    if (!activeRecord || activePart === 'product' || !selectedFragment) return null
    const leftSite = activeConfig?.leftCut.site
    const rightSite = activeConfig?.rightCut.site
    if (!leftSite || !rightSite || selectedFragment.id === 'linearized') return null
    const boundarySite = (position: number): RestrictionSite => ({
      ...leftSite,
      start: position,
      end: position,
      cutTop: position,
      cutBottom: position,
    })
    if (selectedFragment.id === 'left-flank') {
      return restrictionFragmentStrandSelection(boundarySite(0), leftSite, activeRecord.topology)
    }
    if (selectedFragment.id === 'right-flank') {
      return restrictionFragmentStrandSelection(rightSite, boundarySite(activeRecord.sequence.length), activeRecord.topology)
    }
    if (selectedFragment.id === 'reverse') {
      return restrictionFragmentStrandSelection(rightSite, leftSite, activeRecord.topology)
    }
    return restrictionFragmentStrandSelection(leftSite, rightSite, activeRecord.topology)
  }, [activeConfig?.leftCut, activeConfig?.rightCut, activePart, activeRecord, selectedFragment])

  const workspaceTitle =
    activePart === 'product'
      ? 'Product'
      : activePart === 'vector'
        ? 'Vector'
        : `${partNoun} ${(partIndexFromId(activePart) ?? 0) + 1}`

  return (
    <div
      className="translation-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        className="translation-dialog restriction-cloning-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="restriction-cloning-header">
          <h3 id={titleId}>
            {ligating
              ? 'Linear Ligation'
              : deleting
                ? 'Restriction Cloning — Delete Fragment'
                : destroying
                  ? 'Restriction Cloning — Destroy Site'
                  : 'Restriction Cloning'}
          </h3>
          <div className="restriction-cloning-part-strip">
            {!ligating && (
              <button
                type="button"
                className={activePart === 'vector' ? 'is-active' : undefined}
                onClick={() => setActivePart('vector')}
              >
                Vector
              </button>
            )}
            {!noInserts &&
              inserts.map((_, index) => (
                <button
                  key={`insert-tab-${index}`}
                  type="button"
                  className={activePart === `insert-${index}` ? 'is-active' : undefined}
                  onClick={() => setActivePart(`insert-${index}`)}
                >
                  {partNoun} {index + 1}
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
              <button type="button" onClick={addInsert} disabled={noInserts}>
                Add {ligating ? 'fragment' : 'insert'}
              </button>
              <button
                type="button"
                onClick={removeInsert}
                disabled={noInserts || inserts.length <= (ligating ? 2 : 1)}
              >
                Remove {ligating ? 'fragment' : 'insert'}
              </button>
              {!ligating && (
                <>
                  <button
                    type="button"
                    className={deleting ? 'is-active' : undefined}
                    aria-pressed={deleting}
                    title="Cut the vector with two enzymes and re-ligate it without the excised fragment"
                    onClick={() =>
                      setCloningMode(deleting ? 'insert' : 'delete-fragment')
                    }
                  >
                    Delete restriction fragment
                  </button>
                  <button
                    type="button"
                    className={destroying ? 'is-active' : undefined}
                    aria-pressed={destroying}
                    title="Cut at one site, fill or remove overhangs, and re-ligate to destroy the recognition site"
                    onClick={() => setCloningMode(destroying ? 'insert' : 'destroy-site')}
                  >
                    Destroy restriction site
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        <MobileCloningLayout designLabel="Schema">
          <div className="restriction-cloning-main">
            {renderWorkspace({
              workspaceKey: `${active ? 'active' : 'inactive'}:${activeEnzymeSet?.set ?? ''}:${activeEnzymeSet?.supplierSetId ?? ''}:${activeEnzymeSet?.selectedNames.join('\u001f') ?? ''}`,
              record: previewRecord,
              title: workspaceTitle,
              selectedRange: workspaceSelectedRange,
              cutStrandSelection: workspaceCutStrandSelection,
              selectedSites: activePart === 'product' ? [] : selectedSites,
              segmentHighlights:
                activePart === 'product'
                  ? productHighlights
                  : deletedRegionHighlights.length > 0
                    ? deletedRegionHighlights
                    : undefined,
              allowEnzymeSelect: activePart !== 'product',
              initialEnzymeSet: activeEnzymeSet,
              onRestrictionSelect: activePart === 'product' ? undefined : handleEnzymeSelect,
              onEnzymePickerSitesChange: handleEnzymePickerSitesChange,
            })}
            <CloningSchemaPanel
              vector={resolvedVector}
              inserts={resolvedActiveInserts}
              insertOrder={insertOrder}
              validation={validation}
              activePart={activePart}
              mode={mode}
              digestFragments={vectorDigestFragments}
              selectedFragmentId={vectorSelectedFragmentId}
              sourceLength={vector.record?.sequence.length ?? 0}
              sourceCircular={vector.record?.topology !== 'linear'}
              partialDigestWarnings={partialDigestWarnings}
              onSelectPart={setActivePart}
              onReorderInserts={setInsertOrder}
              onSelectFragment={(fragmentId) =>
                setVector((current) => ({ ...current, selectedFragmentId: fragmentId }))
              }
            />
          </div>

          <aside className="restriction-cloning-sidebar">
            <div className="restriction-cloning-sidebar-body">
            {activePart === 'product' ? (
              <div className="pcr-sidebar-fused">
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
                  {!ligating &&
                    (resolvedVector ? (
                      <div className="pcr-bridge-fragment-card">
                        <div className="pcr-bridge-fragment-card-header">
                          <strong style={{ color: resolvedVector.color }}>
                            {destroying
                              ? 'Linearized vector'
                              : deleting
                                ? 'Kept fragment'
                                : 'Vector'}
                          </strong>
                          <span>{resolvedVector.length.toLocaleString()} bp</span>
                        </div>
                        <div className="muted">Source: {resolvedVector.name}</div>
                        <div className="muted">
                          {destroying
                            ? resolvedVector.leftEnzymeLabel || 'Site not set'
                            : [resolvedVector.leftEnzymeLabel, resolvedVector.rightEnzymeLabel]
                                .filter(Boolean)
                                .join(' · ') || 'Cuts not set'}
                        </div>
                      </div>
                    ) : (
                      <div className="pcr-bridge-fragment-card">
                        <div className="pcr-bridge-fragment-card-header">
                          <strong>Vector</strong>
                          <span>—</span>
                        </div>
                        <div className="muted">Source: Not set</div>
                      </div>
                    ))}
                  {!noInserts &&
                    insertOrder.map((insertIndex) => {
                      const part = resolvedInserts[insertIndex]
                      const color = cloningInsertColor(insertIndex)
                      return (
                        <div key={`product-insert-${insertIndex}`} className="pcr-bridge-fragment-card">
                          <div className="pcr-bridge-fragment-card-header">
                            <strong style={{ color }}>
                              {partNoun} {insertIndex + 1}
                            </strong>
                            <span>{part ? `${part.length.toLocaleString()} bp` : '—'}</span>
                          </div>
                          <div className="muted">Source: {part?.name ?? 'Not set'}</div>
                          <div className="muted">
                            {part
                              ? [part.leftEnzymeLabel, part.rightEnzymeLabel]
                                  .filter(Boolean)
                                  .join(' · ') || 'Cuts not set'
                              : 'Not configured'}
                          </div>
                        </div>
                      )
                    })}
                </div>

                <div className="pcr-bridge-footer-block">
                  <div
                    className={`restriction-cloning-status${cloneReady ? ' is-ready' : ' is-invalid'}${cloneReady && failedMassCandidates.length ? ' is-warning' : ''}`}
                  >
                    {massMode ? massValidationMessage : validation.message}
                  </div>
                  {orientationAmbiguity && (
                    <div className="restriction-cloning-ambiguity" role="status">
                      <strong>
                        Chance of configured product:{' '}
                        {orientationAmbiguity.intendedProbability >= 0.01
                          ? `${(orientationAmbiguity.intendedProbability * 100).toFixed(
                              Number.isInteger(100 / orientationAmbiguity.variantCount) ? 0 : 1,
                            )}%`
                          : `≈${(orientationAmbiguity.intendedProbability * 100).toFixed(2)}%`}{' '}
                        (1 in {orientationAmbiguity.variantCount})
                      </strong>
                      <p>
                        {orientationAmbiguity.variantCount} circular products can include the vector
                        (equal-weight combinatorial model
                        {orientationAmbiguity.includesVectorSelfLigation ||
                        orientationAmbiguity.singleInsertVariantCount > 0
                          ? '; intramolecular self-ligation is often favored in practice'
                          : ''}
                        ):
                      </p>
                      <ul>
                        {orientationAmbiguity.includesVectorSelfLigation && (
                          <li>Vector self-ligation</li>
                        )}
                        {orientationAmbiguity.singleInsertVariantCount > 0 && (
                          <li>
                            {orientationAmbiguity.singleInsertVariantCount} single-insert product
                            {orientationAmbiguity.singleInsertVariantCount === 1 ? '' : 's'} (each
                            insert alone, either orientation)
                          </li>
                        )}
                        {orientationAmbiguity.partialAssemblyVariantCount > 0 && (
                          <li>
                            {orientationAmbiguity.partialAssemblyVariantCount} partial multi-insert
                            product
                            {orientationAmbiguity.partialAssemblyVariantCount === 1 ? '' : 's'}
                          </li>
                        )}
                        {orientationAmbiguity.fullAssemblyVariantCount > 0 && (
                          <li>
                            {orientationAmbiguity.fullAssemblyVariantCount} assembly
                            {orientationAmbiguity.fullAssemblyVariantCount === 1 ? '' : 'ies'} of all
                            inserts (order/orientation)
                          </li>
                        )}
                      </ul>
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
                        Use {[massVectorMode ? MASS_VECTOR_NAME_TOKEN : null, massInsertMode ? MASS_INSERT_NAME_TOKEN : null].filter(Boolean).join(' and ')} in generated names.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="mass-insert-source-row">
                  <label className="mass-insert-source-heading" htmlFor={sourceSelectId}>
                    Source of{' '}
                    {ligating
                      ? `${partNoun} ${(partIndexFromId(activePart) ?? 0) + 1}`
                      : noInserts || activePart === 'vector'
                        ? noInserts ? 'Construct' : 'Vector'
                        : `Insert ${(partIndexFromId(activePart) ?? 0) + 1}`}
                  </label>
                  <ConstructSourceSelect
                    id={sourceSelectId}
                    value={selectedSourceKey}
                    groups={sourceGroups}
                    onOpen={() => refreshSourceOptions(true)}
                    onChange={(event) => {
                      const option = sourceOptions.find(
                        (entry) => constructSourceOptionValue(entry) === event.target.value,
                      )
                      if (option) assignSelectedSource(option)
                    }}
                  />
                  {(
                    ((mode === 'insert' || ligating) &&
                      (activePart === 'vector' || activeConfig?.role === 'insert')) ||
                    (noInserts && activePart === 'vector')
                  ) && (
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
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              massFileTargetRef.current = activePart
                              massFileInputRef.current?.click()
                            }}
                          >
                            Choose files…
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMassSourceMenuOpen(false)
                              setMassDatabasePickerTarget(activePart)
                            }}
                          >
                            Choose from Database…
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {massVectorMode && activePart === 'vector' && (
                  <MassRestrictionSourceNavigator
                    kind={noInserts ? 'construct' : 'vector'}
                    choices={massVectorChoices}
                    index={massVectorPreviewIndex}
                    onChange={setMassVectorPreviewIndex}
                    onExclude={
                      libraryMassVectorChoices.length
                        ? () => setMassMemberExclusionTarget('vector')
                        : undefined
                    }
                    excludedCount={excludedMassVectorKeys.length}
                  />
                )}
                {massInsertMode && massInsertSlot === partIndexFromId(activePart) && (
                  <MassRestrictionSourceNavigator
                    kind={ligating ? 'construct' : 'insert'}
                    choices={massInsertChoices}
                    index={massInsertPreviewIndex}
                    onChange={setMassInsertPreviewIndex}
                    onExclude={
                      libraryMassInsertChoices.length
                        ? () => setMassMemberExclusionTarget('insert')
                        : undefined
                    }
                    excludedCount={excludedMassInsertKeys.length}
                  />
                )}
                <button type="button" onClick={() => fileInputRef.current?.click()}>
                  Add construct…
                </button>
                <button type="button" onClick={() => setDatabasePickerOpen(true)}>
                  Database…
                </button>
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
                    const files = Array.from(event.target.files ?? [])
                    if (files.length) void importMassConstructs(files)
                  }}
                />

                <hr />
                {destroying ? (
                  <div className="restriction-cloning-cut-group">
                    <label className="restriction-cloning-field">
                      <span>Cut with</span>
                      <select
                        value={
                          activeConfig?.leftCut.site
                            ? siteOptionValue(activeConfig.leftCut.site)
                            : ''
                        }
                        onChange={(event) =>
                          assignDestroySite(findSiteByOptionValue(event.target.value))
                        }
                      >
                        <option value="">Select enzyme…</option>
                        {availableCutSites.map((site) => (
                          <option
                            key={`destroy-${siteOptionValue(site)}`}
                            value={siteOptionValue(site)}
                          >
                            {site.enzyme.name} ({site.start + 1})
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="restriction-cloning-hint">
                      Click an enzyme on the map, or pick one below. Fill in or remove the overhangs,
                      then re-ligate to destroy the site.
                    </p>
                    <CutEndTreatmentControls
                      cut={
                        activeConfig?.leftCut ?? defaultCloningPartConfig('vector', null).leftCut
                      }
                      site={activeConfig?.leftCut.site ?? null}
                      sequence={activeRecord?.sequence ?? null}
                      onChange={setSharedEndTreatment}
                    />
                  </div>
                ) : usesExistingEnds ? (
                  <div className="restriction-cloning-cut-group">
                    <p className="restriction-cloning-hint">
                      This linear fragment already has sticky ends
                      {activeResolvedPart?.leftEnzyme || activeResolvedPart?.rightEnzyme
                        ? ` (${[activeResolvedPart.leftEnzyme, activeResolvedPart.rightEnzyme]
                            .filter(Boolean)
                            .join(' / ')})`
                        : ''}
                      . No enzyme selection is needed — it will ligate when those ends match the
                      vector. Click enzymes on the map only if you want to re-digest instead.
                    </p>
                    <div className="restriction-cloning-orientation">
                      <strong>Orientation</strong>
                      <div className="restriction-cloning-orientation-buttons">
                        <button
                          type="button"
                          className={
                            activeConfig?.orientation === 'forward' ? 'is-active' : undefined
                          }
                          onClick={() =>
                            updateActiveConfig((config) => ({
                              ...config,
                              orientation: 'forward',
                            }))
                          }
                        >
                          Forward
                        </button>
                        <button
                          type="button"
                          className={
                            activeConfig?.orientation === 'reverse' ? 'is-active' : undefined
                          }
                          onClick={() =>
                            updateActiveConfig((config) => ({
                              ...config,
                              orientation: 'reverse',
                            }))
                          }
                        >
                          Reverse
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
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
                            assignCutSide('left', findSiteByOptionValue(event.target.value))
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
                      <p className="restriction-cloning-hint">
                        Or Shift/Ctrl-click enzymes on the map.
                      </p>
                      <CutEndTreatmentControls
                        cut={
                          activeConfig?.leftCut ?? defaultCloningPartConfig('vector', null).leftCut
                        }
                        site={activeConfig?.leftCut.site ?? null}
                        sequence={activeRecord?.sequence ?? null}
                        linkedPolarity={activeEndsLinkedPolarity}
                        onChange={(leftCut) =>
                          updateActiveConfig((config) =>
                            applyCutEndTreatment(config, 'left', leftCut),
                          )
                        }
                      />
                    </div>
                    <div className="restriction-cloning-cut-group">
                      <label className="restriction-cloning-field">
                        <span>Cut 3′ end with</span>
                        <select
                          value={
                            activeConfig?.rightCut.site
                              ? siteOptionValue(activeConfig.rightCut.site)
                              : ''
                          }
                          onChange={(event) =>
                            assignCutSide('right', findSiteByOptionValue(event.target.value))
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
                      <CutEndTreatmentControls
                        cut={
                          activeConfig?.rightCut ??
                          defaultCloningPartConfig('vector', null).rightCut
                        }
                        site={activeConfig?.rightCut.site ?? null}
                        sequence={activeRecord?.sequence ?? null}
                        onChange={(rightCut) =>
                          updateActiveConfig((config) =>
                            applyCutEndTreatment(config, 'right', rightCut),
                          )
                        }
                      />
                    </div>

                    <div className="restriction-cloning-fragments">
                      <strong>
                        {deleting
                          ? 'Fragment to keep (re-ligated)'
                          : ligating
                            ? 'Fragment to ligate'
                            : activeConfig?.role === 'vector'
                              ? 'Fragment to keep'
                              : 'Fragment to insert'}
                      </strong>
                      {digestFragments.length === 0 ? (
                        <p className="restriction-cloning-hint">
                          Shift/Ctrl-click two enzymes on the map (in 5′ then 3′ order), or use the
                          dropdowns, then pick the major or minor arc below. For a single cutter,
                          choose the same site for both ends to linearize.
                        </p>
                      ) : (
                        <div className="restriction-cloning-fragment-list" role="listbox">
                          {digestFragments.map((fragment) => (
                            <button
                              key={fragment.id}
                              type="button"
                              role="option"
                              aria-selected={selectedFragment?.id === fragment.id}
                              className={
                                selectedFragment?.id === fragment.id ? 'is-selected' : undefined
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
                      )}
                    </div>

                    {activeConfig?.role === 'insert' && (
                      <div className="restriction-cloning-orientation">
                        <strong>Orientation of insert</strong>
                        <div className="restriction-cloning-orientation-buttons">
                          <button
                            type="button"
                            className={
                              activeConfig.orientation === 'forward' ? 'is-active' : undefined
                            }
                            onClick={() =>
                              updateActiveConfig((config) => ({
                                ...config,
                                orientation: 'forward',
                              }))
                            }
                            aria-label="Forward orientation"
                          >
                            →
                          </button>
                          <button
                            type="button"
                            className={
                              activeConfig.orientation === 'reverse' ? 'is-active' : undefined
                            }
                            onClick={() =>
                              updateActiveConfig((config) => ({
                                ...config,
                                orientation: 'reverse',
                              }))
                            }
                            aria-label="Reverse orientation"
                          >
                            ←
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div
                  className={`restriction-cloning-status${cloneReady ? ' is-ready' : ' is-invalid'}${cloneReady && failedMassCandidates.length ? ' is-warning' : ''}`}
                >
                  {massMode ? massValidationMessage : validation.message}
                </div>

                {batchStatus && <div className="mass-insert-dialog-status" role="status">{batchStatus}</div>}

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
                      Use {[massVectorMode ? MASS_VECTOR_NAME_TOKEN : null, massInsertMode ? MASS_INSERT_NAME_TOKEN : null].filter(Boolean).join(' and ')} in generated names.
                    </span>
                  </div>
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
                  ref={cloneMenuRef}
                  className={`restriction-cloning-clone-split${cloneMenuOpen ? ' is-open' : ''}`}
                >
                  <button
                    type="button"
                    className="primary restriction-cloning-clone-main"
                    disabled={!cloneOutputReady || batchBusy}
                    onClick={handleCloneAndOpenAll}
                  >
                    {massActionLabel} and open all
                  </button>
                  <button
                    type="button"
                    className="primary restriction-cloning-clone-chevron"
                    disabled={!cloneOutputReady || batchBusy}
                    aria-label={`Choose destination for mass ${massActionLabel.toLowerCase()}`}
                    aria-haspopup="menu"
                    aria-expanded={cloneMenuOpen}
                    onClick={() => setCloneMenuOpen((open) => !open)}
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {cloneMenuOpen && (
                    <div className="restriction-cloning-clone-menu" role="menu">
                      <button type="button" role="menuitem" onClick={handleCloneAndOpenAll}>
                        {massActionLabel} and open all
                      </button>
                      <button type="button" role="menuitem" onClick={handleCloneToDatabase}>
                        {massActionLabel} and save to Database…
                      </button>
                      <button type="button" role="menuitem" onClick={() => void handleCloneToFolder()}>
                        {massActionLabel} and save to folder…
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={!cloneReady}
                  onClick={handleCloneAndOpenAll}
                >
                  {destroying ? 'Destroy site' : deleting ? 'Delete fragment' : ligating ? 'Ligate' : 'Clone'}
                </button>
              )}
            </div>
          </aside>
        </MobileCloningLayout>
      </div>
      {active && databasePickerOpen && (
        <DatabaseConstructPickerDialog
          excludeRecordId={currentRecord.id}
          onCancel={() => setDatabasePickerOpen(false)}
          onSelect={(record, project) => {
            const insertIndex = partIndexFromId(activePart)
            if (
              record.dna?.documentRole === 'library' &&
              (((mode === 'insert' || ligating) && insertIndex !== null) ||
                (noInserts && activePart === 'vector'))
            ) {
              chooseMassSources(
                [{ key: `database:${project.id}`, record }],
                activePart,
              )
            } else {
              assignSource({ kind: 'database', label: project.name, projectId: project.id, record })
            }
            setDatabasePickerOpen(false)
          }}
        />
      )}
      {active && massDatabasePickerTarget && (
        <DatabaseConstructPickerDialog
          excludeRecordId={massDatabasePickerTarget === 'vector' ? undefined : currentRecord.id}
          multiple
          onCancel={() => setMassDatabasePickerTarget(null)}
          onSelectMany={(choices) => {
            chooseMassSources(
              choices.map(({ record, project }) => ({
                key: `database:${project.id}`,
                record,
              })),
              massDatabasePickerTarget,
            )
            setMassDatabasePickerTarget(null)
          }}
        />
      )}
      {massNamesOpen && massMode && (
        <MassRestrictionNamesDialog
          choices={includedMassCandidates.map((candidate) => ({
            key: candidate.key,
            vectorName: candidate.vectorName,
            insertName: candidate.insertName,
          }))}
          initialNames={Object.fromEntries(
            includedMassCandidates.map((candidate) => [candidate.key, candidate.name]),
          )}
          eligibleChoiceKeys={cloneableMassCandidates.map((candidate) => candidate.key)}
          failureReasons={Object.fromEntries(
            failedMassCandidates.map((candidate) => [
              candidate.key,
              candidate.failureReason,
            ]),
          )}
          onCancel={() => setMassNamesOpen(false)}
          onConfirm={(names) => {
            setMassProductNames(names)
            setMassNamesOpen(false)
          }}
        />
      )}
      {massMemberExclusionTarget && activeLibraryMassChoices.length > 0 && (
        <MassRestrictionLibraryMembersDialog
          choices={activeLibraryMassChoices}
          cloneableChoiceKeys={cloneableLibraryChoiceKeys}
          excludedChoiceKeys={
            massMemberExclusionTarget === 'vector'
              ? excludedMassVectorKeys
              : excludedMassInsertKeys
          }
          failureReasons={libraryMemberFailureReasons}
          onCancel={() => setMassMemberExclusionTarget(null)}
          onConfirm={(excluded) => {
            if (massMemberExclusionTarget === 'vector') setExcludedMassVectorKeys(excluded)
            else setExcludedMassInsertKeys(excluded)
            setMassProductNames({})
            setMassMemberExclusionTarget(null)
          }}
        />
      )}
      {batchSaveProducts && (
        <SaveToDatabaseDialog
          recordName={`${batchSaveProducts.length} restriction-cloning products`}
          initialFileName="products.dna"
          title="Save cloning products to Database"
          confirmLabel="Save here"
          allowCreateFolder
          status={batchStatus}
          busy={batchBusy}
          onCancel={() => {
            if (!batchBusy) setBatchSaveProducts(null)
          }}
          onConfirm={(folderId) => saveBatchToDatabase(folderId)}
        />
      )}
      {batchSaveLibrary && (
        <SaveToDatabaseDialog
          recordName={`${batchSaveLibrary.name} (${batchSaveLibrary.traceFiles?.length ?? 0} members)`}
          initialFileName={`${batchSaveLibrary.name}.dna`}
          title="Save cloning product library to Database"
          confirmLabel="Save here"
          allowCreateFolder
          status={batchStatus}
          busy={batchBusy}
          onCancel={() => {
            if (!batchBusy) setBatchSaveLibrary(null)
          }}
          onConfirm={(folderId) => saveBatchLibraryToDatabase(folderId)}
        />
      )}
    </div>
  )
}
