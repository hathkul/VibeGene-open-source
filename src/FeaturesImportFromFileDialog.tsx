import { useEffect, useMemo, useRef, useState } from 'react'
import type { SequenceFeature, SequenceRecord } from './domain/types'
import type { CommonFeatureMatch, CommonFeatureTemplate } from './domain/commonFeatures'
import { useCommonFeatureDetection } from './presentation/hooks/commonFeatureDetectionContext'
import { buildProteinFeatureImportMatches } from './domain/proteinLibraryFeatureImport'
import { CommonFeaturesDetectDialog } from './CommonFeaturesDetectDialog'
import { DatabaseConstructPickerDialog } from './cloning/DatabaseConstructPickerDialog'
import { templateFromRecordFeature } from './storage/userCommonFeatures'
import {
  isSnapGeneBytes,
  parseProjectJson,
  parseSequenceBytes,
  parseSnapGene,
} from './domain/parsers'
import type { TraceFileRecord } from './domain/traceTypes'
import { ImportSourcePicker, type ImportSourceTab } from './presentation/dialogs/ImportSourcePicker'

type FeaturesImportFromFileDialogProps = {
  currentRecord: SequenceRecord
  openTabs?: ImportSourceTab[]
  /** DNA library members — used to match protein imports against member CDS translations. */
  libraryMembers?: readonly TraceFileRecord[]
  onLoadOpenTab?: (tabId: string) => Promise<SequenceRecord | null>
  onCancel: () => void
  onAdd: (features: SequenceFeature[]) => void
}

async function parseSourceRecord(file: File): Promise<SequenceRecord> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  if (isSnapGeneBytes(bytes)) {
    return parseSnapGene(bytes, file.name, { skipTraces: true })
  }

  const text = new TextDecoder().decode(bytes)
  if (file.name.toLowerCase().endsWith('.json') && text.trim().startsWith('{')) {
    const project = parseProjectJson(text)
    return project.record
  }

  return parseSequenceBytes(buffer, file.name)
}

export function FeaturesImportFromFileDialog({
  currentRecord,
  openTabs = [],
  libraryMembers,
  onLoadOpenTab,
  onCancel,
  onAdd,
}: FeaturesImportFromFileDialogProps) {
  const detectCommonFeaturesAsync = useCommonFeatureDetection()
  const scanAbortRef = useRef<AbortController | null>(null)

  const [matches, setMatches] = useState<CommonFeatureMatch[] | null>(null)
  const [importCaption, setImportCaption] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanProgress, setScanProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [databasePickerOpen, setDatabasePickerOpen] = useState(false)
  const recordName = useMemo(() => {
    if (currentRecord.molecule === 'protein') {
      return currentRecord.name.endsWith('.prot') ? currentRecord.name : `${currentRecord.name}.prot`
    }
    return currentRecord.name.endsWith('.dna') ? currentRecord.name : `${currentRecord.name}.dna`
  }, [currentRecord.molecule, currentRecord.name])

  const visibleOpenTabs = useMemo<ImportSourceTab[]>(() => {
    if (currentRecord.molecule === 'dna') {
      return openTabs.filter((tab) => tab.molecule === 'protein' || tab.molecule === 'dna')
    }
    return openTabs.filter((tab) => tab.molecule === 'dna')
  }, [currentRecord.molecule, openTabs])

  const databaseMolecules = useMemo((): Array<'dna' | 'protein'> => {
    return currentRecord.molecule === 'dna' ? ['dna', 'protein'] : ['dna']
  }, [currentRecord.molecule])

  useEffect(() => () => scanAbortRef.current?.abort(), [])

  async function buildMatchesFromSourceRecord(sourceRecord: SequenceRecord) {
    scanAbortRef.current?.abort()
    const controller = new AbortController()
    scanAbortRef.current = controller
    setError(null)
    setLoading(true)
    setScanProgress(null)
    setImportCaption(null)
    try {
      if (currentRecord.molecule === 'dna' && sourceRecord.molecule === 'protein') {
        const { matches: proteinMatches, cds, skipped } = buildProteinFeatureImportMatches(
          sourceRecord,
          currentRecord,
          { libraryMembers },
        )
        if (!proteinMatches.length) {
          throw new Error(
            skipped[0]?.reason
              ?? `No importable features on ${sourceRecord.name} mapped onto CDS “${cds.name}”.`,
          )
        }
        setImportCaption(
          `Mapped onto CDS “${cds.name}”`
          + (skipped.length ? ` · ${skipped.length} skipped` : ''),
        )
        setMatches(proteinMatches)
        return
      }

      if (sourceRecord.molecule === 'protein') {
        throw new Error('Protein features can only be imported into a DNA construct that has a matching CDS.')
      }

      const templates: CommonFeatureTemplate[] = sourceRecord.features
        .map((feature) => templateFromRecordFeature(sourceRecord, feature))
        .filter((template): template is CommonFeatureTemplate => Boolean(template))
      const detected = await detectCommonFeaturesAsync(currentRecord, templates, {
        signal: controller.signal,
        onProgress: (completed, total) => setScanProgress(
          `${completed.toLocaleString()} of ${total.toLocaleString()} source features scanned`,
        ),
      })
      if (controller.signal.aborted) return
      setMatches(detected)
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      if (scanAbortRef.current === controller) {
        scanAbortRef.current = null
        setLoading(false)
        setScanProgress(null)
      }
    }
  }

async function buildMatchesFromOpenTab(tab: ImportSourceTab) {
    if (!onLoadOpenTab) return
    setError(null)
    setLoading(true)
    try {
      const sourceRecord = await onLoadOpenTab(tab.tabId)
      if (!sourceRecord) throw new Error(`Could not load open tab ${tab.name}.`)
      await buildMatchesFromSourceRecord(sourceRecord)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setLoading(false)
    }
  }

  if (matches) {
    return (
      <CommonFeaturesDetectDialog
        recordName={recordName}
        record={currentRecord}
        matches={matches}
        minimumIdentityPercent={100}
        onMinimumIdentityChange={() => {}}
        showMatchOptions={false}
        emptyMessage={
          importCaption
            ? `No protein annotations could be mapped onto this DNA. ${importCaption}.`
            : 'No matching features were detected in this sequence.'
        }
        onCancel={() => {
          setMatches(null)
          setImportCaption(null)
        }}
        onAdd={(features) => {
          onAdd(features)
          onCancel()
        }}
      />
    )
  }

  if (databasePickerOpen) {
    return (
      <DatabaseConstructPickerDialog
        excludeRecordId={currentRecord.id}
        confirmLabel="Choose"
        cancelLabel="Cancel"
        title="Choose file from Database"
        molecules={databaseMolecules}
        onCancel={() => setDatabasePickerOpen(false)}
        onSelect={(record) => {
          setDatabasePickerOpen(false)
          void buildMatchesFromSourceRecord(record)
        }}
      />
    )
  }

  return (
    <ImportSourcePicker
          title="Import Features from Another File"
          hint={currentRecord.molecule === 'dna'
            ? `DNA sources are matched by sequence. Protein sources map annotations onto a CDS whose translation matches that protein${libraryMembers?.length ? ' (consensus or any library member).' : '.'}`
            : 'Choose a DNA source from disk or the Database. Supported files: SnapGene .dna/.protein, GenBank/GenPept, FASTA, and Vibegene project .json.'}
          openTabs={visibleOpenTabs}
          onOpenTab={onLoadOpenTab ? (tab) => void buildMatchesFromOpenTab(tab) : undefined}
          onChooseFile={(file) => {
            void (async () => {
              try {
                setError(null)
                await buildMatchesFromSourceRecord(await parseSourceRecord(file))
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : String(caught))
              }
            })()
          }}
          onChooseDatabase={() => setDatabasePickerOpen(true)}
          onCancel={() => {
            scanAbortRef.current?.abort()
            onCancel()
          }}
          loading={loading}
        >
        {loading && <p className="features-import-loading">{scanProgress ?? 'Scanning for matching sequences…'}</p>}
        {error && <p className="features-import-error">{error}</p>}
        </ImportSourcePicker>
  )
}
