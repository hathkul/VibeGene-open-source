import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ConstructSourceSelect } from './cloning/ConstructSourceOptions'
import { ProductNameInput } from './cloning/ProductNameInput'
import { DatabaseConstructPickerDialog } from './cloning/DatabaseConstructPickerDialog'
import { constructSourceOptionValue, useConstructSources } from './cloning/useConstructSources'
import type { CloningWorkspaceRenderArgs } from './cloningWorkspaceTypes'
import { MobileCloningLayout } from './MobileCloningLayout'
import {
  defaultConstructProperties,
  methylationForStrain,
  transformationStrainOptions,
} from './domain/constructProperties'
import { SEQUENCE_OPEN_ACCEPT } from './domain/fileFormats'
import {
  analyzeMutagenesis,
  assembleMutagenesisProduct,
  mutagenesisPreviewRecord,
  type MutagenesisAnalysis,
} from './domain/mutagenesis'
import {
  defaultPrimerHybridizationParams,
  normalizePrimerHybridizationParams,
  type PrimerHybridizationParams,
} from './domain/primerHybridization'
import { isSnapGeneBytes, parseSequenceBytes, parseSnapGene } from './domain/parsers'
import { addOperation } from './domain/sequence'
import type { Primer, SequenceRecord } from './domain/types'
import { HybridizationParametersDialog } from './HybridizationParametersDialog'
import { useClampDialogToViewport } from './ui/useClampDialogToViewport'

type MutagenesisDialogProps = {
  primerHybridization?: PrimerHybridizationParams
  active?: boolean
  currentRecord: SequenceRecord
  currentTabId: string
  onCancel: () => void
  onMutagenize: (record: SequenceRecord) => void
  renderWorkspace: (args: CloningWorkspaceRenderArgs) => ReactNode
}

function primerOptionLabel(primer: Primer) {
  return primer.name || 'Unnamed primer'
}

function primerLengthLabel(sequence: string) {
  const length = sequence.replace(/\s/g, '').length
  return `${length}-mer`
}

export function MutagenesisDialog({
  active = true,
  currentRecord,
  currentTabId,
  primerHybridization = defaultPrimerHybridizationParams,
  onCancel,
  onMutagenize,
  renderWorkspace,
}: MutagenesisDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const primerFileInputRef = useRef<HTMLInputElement | null>(null)
  useClampDialogToViewport(dialogRef)

  const [databaseTarget, setDatabaseTarget] = useState<'template' | 'primer' | null>(null)

  const [template, setTemplate] = useState<SequenceRecord>(currentRecord)
  const [usePcrProduct, setUsePcrProduct] = useState(false)
  const [selectedPrimerId, setSelectedPrimerId] = useState<string>(() => {
    const first = currentRecord.primers[0]
    return first?.id ?? ''
  })
  const [pcrPrimerSource, setPcrPrimerSource] = useState<SequenceRecord | null>(null)
  const [productName, setProductName] = useState('Mutagenized.dna')
  const [productStrainId, setProductStrainId] = useState(
    () =>
      currentRecord.construct.bacterialTransformationStrain ??
      defaultConstructProperties.bacterialTransformationStrain ??
      '',
  )
  const [localHybridizationOverride, setLocalHybridizationOverride] = useState<PrimerHybridizationParams | null>(null)
  const {
    minContinuousMatchLen: externalMinContinuousMatchLen,
    allowMismatch: externalAllowMismatch,
    minMeltingTemperature: externalMinMeltingTemperature,
  } = primerHybridization
  const externalHybridization = useMemo(
    () => normalizePrimerHybridizationParams({
      minContinuousMatchLen: externalMinContinuousMatchLen,
      allowMismatch: externalAllowMismatch,
      minMeltingTemperature: externalMinMeltingTemperature,
    }),
    [
      externalMinContinuousMatchLen,
      externalAllowMismatch,
      externalMinMeltingTemperature,
    ],
  )
  const hybridization = localHybridizationOverride ?? externalHybridization
  const [hybridizationOpen, setHybridizationOpen] = useState(false)

  const { groups: sourceGroups, options: sourceOptions, refresh: refreshSourceOptions } = useConstructSources({
    active,
    currentRecord,
    currentTabId,
  })

  const selectedTemplateOption =
    sourceOptions.find((option) => option.record === template) ??
    sourceOptions.find((option) => option.record.id === template.id)
  const selectedTemplateKey = selectedTemplateOption
    ? constructSourceOptionValue(selectedTemplateOption)
    : ''

  const constructPrimers = useMemo(
    () => template.primers.filter((primer) => primer.visible !== false),
    [template.primers],
  )

  const selectedConstructPrimer = useMemo(
    () => constructPrimers.find((primer) => primer.id === selectedPrimerId) ?? null,
    [constructPrimers, selectedPrimerId],
  )

  const analysis = useMemo<MutagenesisAnalysis | null>(() => {
    if (usePcrProduct) {
      if (!pcrPrimerSource?.sequence) return null
      return analyzeMutagenesis(
        template,
        pcrPrimerSource.sequence,
        pcrPrimerSource.name || 'PCR product',
        null,
        hybridization,
      )
    }
    if (!selectedConstructPrimer?.sequence) return null
    const preferred = selectedConstructPrimer.bindings?.[0] ?? null
    return analyzeMutagenesis(
      template,
      selectedConstructPrimer.sequence,
      selectedConstructPrimer.name || 'Mutagenic primer',
      preferred,
      hybridization,
    )
  }, [hybridization, pcrPrimerSource, selectedConstructPrimer, template, usePcrProduct])

  const previewRecord = useMemo(() => {
    if (!analysis) {
      return { ...template, primers: [] }
    }
    return mutagenesisPreviewRecord(template, analysis)
  }, [analysis, template])

  const selectedRange = useMemo(() => {
    if (!analysis || analysis.annealedCount <= 0) return null
    const { templateStart, templateEnd } = analysis.anneal.layout
    if (templateEnd > templateStart) return { start: templateStart, end: templateEnd }
    return { start: templateStart, end: templateStart + Math.max(1, analysis.oligo.length) }
  }, [analysis])

  const sequenceViewRange = useMemo(() => {
    if (!selectedRange) return null
    const len = template.sequence.length
    if (len <= 0) return null
    const pad = 100
    const { start, end } = selectedRange
    if (end > start) {
      return {
        start: Math.max(0, start - pad),
        end: Math.min(len, end + pad),
      }
    }
    // Anneal wraps the origin — sequence pane needs a contiguous window.
    const span = end + (len - start)
    if (span + 2 * pad >= len) return { start: 0, end: len }
    return { start: 0, end: len }
  }, [selectedRange, template.sequence.length])

  async function importConstruct(file: File, target: 'template' | 'primer') {
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      const parsed = isSnapGeneBytes(bytes)
        ? parseSnapGene(bytes, file.name, { skipTraces: true })
        : parseSequenceBytes(buffer, file.name)
      const imported = addOperation(parsed, 'import', `Imported ${file.name} for mutagenesis.`)
      if (target === 'template') {
        setTemplate(imported)
        setSelectedPrimerId(imported.primers[0]?.id ?? '')
      } else {
        setPcrPrimerSource(imported)
      }
    } catch (error) {
      window.alert(`Could not import: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (target === 'template' && fileInputRef.current) fileInputRef.current.value = ''
      if (target === 'primer' && primerFileInputRef.current) primerFileInputRef.current.value = ''
    }
  }

  function handleMutagenize() {
    if (!analysis || analysis.status !== 'ready') return
    const product = assembleMutagenesisProduct({
      template,
      analysis,
      productName,
      constructOverrides: {
        bacterialTransformationStrain: productStrainId || null,
        hostMethylation: methylationForStrain(productStrainId || null),
      },
    })
    onMutagenize(product)
  }

  const ready = analysis?.status === 'ready'
  const statusClass =
    analysis?.status === 'ready'
      ? 'is-ready'
      : analysis
        ? 'is-invalid'
        : 'is-invalid'

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className="translation-dialog restriction-cloning-dialog mutagenesis-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mutagenesis-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="restriction-cloning-header mutagenesis-header">
          <h3 id="mutagenesis-title">Mutagenesis</h3>
          <div className="mutagenesis-header-row">
            <label className="restriction-cloning-field mutagenesis-template-field">
              <span>Template:</span>
              <ConstructSourceSelect
                value={selectedTemplateKey}
                groups={sourceGroups}
                placeholder={false}
                onOpen={refreshSourceOptions}
                onChange={(event) => {
                  const option = sourceOptions.find(
                    (entry) => constructSourceOptionValue(entry) === event.target.value,
                  )
                  if (!option) return
                  setTemplate(option.record)
                  setSelectedPrimerId(option.record.primers[0]?.id ?? '')
                }}
              />
              <span className="mutagenesis-template-length">
                {template.sequence.length.toLocaleString()} bp
              </span>
            </label>
            <button type="button" onClick={() => setDatabaseTarget('template')}>Database…</button>
            <button
              type="button"
              className="mutagenesis-link-button"
              onClick={() => setHybridizationOpen(true)}
            >
              Hybridization Parameters
            </button>
          </div>
        </header>

        <MobileCloningLayout designLabel="Primers" className="mutagenesis-layout">
          <div className="restriction-cloning-main">
            <div className="mutagenesis-controls">
              <label className="restriction-cloning-checkbox">
                <input
                  type="checkbox"
                  checked={usePcrProduct}
                  onChange={(event) => setUsePcrProduct(event.target.checked)}
                />
                <span>Use a PCR product as the mutagenic primer</span>
              </label>

              {!usePcrProduct ? (
                <div className="mutagenesis-primer-block">
                  <label className="restriction-cloning-field">
                    <span>Mutagenic Primer</span>
                    <div className="mutagenesis-primer-select-row">
                      <select
                        value={selectedPrimerId}
                        onChange={(event) => setSelectedPrimerId(event.target.value)}
                      >
                        <option value="">Choose primer…</option>
                        {constructPrimers.map((primer) => (
                          <option key={primer.id} value={primer.id}>
                            {primerOptionLabel(primer)}
                          </option>
                        ))}
                      </select>
                      {analysis && analysis.status === 'ready' && (
                        <span className="mutagenesis-primer-ok" aria-hidden>
                          ✓
                        </span>
                      )}
                      {analysis && (
                        <span className="mutagenesis-mer-badge">{primerLengthLabel(analysis.oligo)}</span>
                      )}
                    </div>
                  </label>
                  {analysis && (
                    <div
                      className="mutagenesis-primer-sequence"
                      aria-label="Mutagenic primer sequence"
                    >
                      <span className="mutagenesis-end-label">5′</span>
                      <div className="mutagenesis-primer-bases">
                        {analysis.glyphs.map((glyph, index) => (
                          <span
                            key={`${glyph.char}-${index}`}
                            className={`mutagenesis-base is-${glyph.role}`}
                          >
                            {glyph.char}
                          </span>
                        ))}
                      </div>
                      <span className="mutagenesis-end-label">3′</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mutagenesis-primer-block">
                  <label className="restriction-cloning-field">
                    <span>Linear DNA (mutagenic primer)</span>
                    <ConstructSourceSelect
                      value={
                        pcrPrimerSource
                          ? (() => {
                              const option =
                                sourceOptions.find((entry) => entry.record === pcrPrimerSource) ??
                                sourceOptions.find((entry) => entry.record.id === pcrPrimerSource.id)
                              return option ? constructSourceOptionValue(option) : ''
                            })()
                          : ''
                      }
                      groups={sourceGroups}
                      placeholder="Choose linear DNA…"
                      onOpen={refreshSourceOptions}
                      onChange={(event) => {
                        const option = sourceOptions.find(
                          (entry) => constructSourceOptionValue(entry) === event.target.value,
                        )
                        setPcrPrimerSource(option?.record ?? null)
                      }}
                    />
                  </label>
                  <button type="button" onClick={() => primerFileInputRef.current?.click()}>
                    Choose file…
                  </button>
                  <button type="button" onClick={() => setDatabaseTarget('primer')}>Database…</button>
                  <input
                    ref={primerFileInputRef}
                    type="file"
                    accept={SEQUENCE_OPEN_ACCEPT}
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void importConstruct(file, 'primer')
                    }}
                  />
                  {pcrPrimerSource && (
                    <div className="muted">
                      {pcrPrimerSource.name} · {pcrPrimerSource.sequence.length.toLocaleString()} bp
                      {pcrPrimerSource.topology === 'circular' ? ' (circular — will use full sequence)' : ''}
                    </div>
                  )}
                  {analysis && (
                    <div
                      className="mutagenesis-primer-sequence"
                      aria-label="Mutagenic primer sequence"
                    >
                      <span className="mutagenesis-end-label">5′</span>
                      <div className="mutagenesis-primer-bases">
                        {analysis.glyphs.map((glyph, index) => (
                          <span
                            key={`${glyph.char}-${index}`}
                            className={`mutagenesis-base is-${glyph.role}`}
                          >
                            {glyph.char}
                          </span>
                        ))}
                      </div>
                      <span className="mutagenesis-end-label">3′</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {renderWorkspace({
              record: previewRecord,
              title: 'Template',
              selectedRange,
              cutStrandSelection: null,
              selectedSites: [],
              allowEnzymeSelect: false,
              includePrimersTab: true,
              allowPrimerSelect: false,
              selectedPrimerIds: analysis ? ['mutagenesis-primer'] : [],
              sequenceOnly: true,
              sequenceViewRange,
              primerHybridization: hybridization,
              highlightMutagenicDnaBases: true,
            })}
            <div className={`restriction-cloning-status mutagenesis-status ${statusClass}`}>
              <strong>{analysis?.message ?? 'Choose a mutagenic primer.'}</strong>
              {analysis?.detailLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </div>

          <aside className="restriction-cloning-sidebar">
            <div className="restriction-cloning-sidebar-body">
              {analysis && analysis.annealedCount > 0 && (
                <div className="mutagenesis-tm">
                  {analysis.annealedCount} annealed bases
                  {analysis.tmC !== null ? ` / Tm = ${Math.round(analysis.tmC)}°C` : ''}
                </div>
              )}
              <div className="mutagenesis-sidebar-fields">
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
                  <span>Product name</span>
                  <ProductNameInput
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="restriction-cloning-sidebar-actions">
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="primary" disabled={!ready} onClick={handleMutagenize}>
                Mutagenize
              </button>
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
            if (file) void importConstruct(file, 'template')
          }}
        />
      </div>
      {hybridizationOpen && (
        <HybridizationParametersDialog
          initial={hybridization}
          onCancel={() => setHybridizationOpen(false)}
          onConfirm={(next) => {
            setLocalHybridizationOverride(normalizePrimerHybridizationParams(next))
            setHybridizationOpen(false)
          }}
        />
      )}
      {databaseTarget && (
        <DatabaseConstructPickerDialog
          excludeRecordId={currentRecord.id}
          onCancel={() => setDatabaseTarget(null)}
          onSelect={(record) => {
            if (databaseTarget === 'template') {
              setTemplate(record)
              setSelectedPrimerId(record.primers[0]?.id ?? '')
            } else {
              setPcrPrimerSource(record)
            }
            setDatabaseTarget(null)
          }}
        />
      )}
    </div>
  )
}
