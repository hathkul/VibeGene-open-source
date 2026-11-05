import { useMemo, useState } from 'react'
import type { Primer, SequenceRecord } from './domain/types'
import type { PrimerHybridizationParams } from './domain/primerHybridization'
import {
  isPrimerListTabText,
  parsePrimerDataTsv,
  resolvePrimerImportCandidates,
  type PrimerImportCandidate,
  type PrimerListEntry,
} from './domain/primerExport'
import { normalizeDna } from './domain/sequence'
import { PrimersImportDialog } from './PrimersImportDialog'
import { DatabaseConstructPickerDialog } from './cloning/DatabaseConstructPickerDialog'
import {
  isSnapGeneBytes,
  parseProjectJson,
  parseSequenceBytes,
  parseSnapGene,
} from './domain/parsers'
import { ImportSourcePicker, type ImportSourceTab } from './presentation/dialogs/ImportSourcePicker'

type PrimersImportFromFileDialogProps = {
  currentRecord: SequenceRecord
  hybridization: PrimerHybridizationParams
  /** Other live workspaces; their unsaved session snapshot is loaded on selection. */
  openTabs?: ImportSourceTab[]
  onLoadOpenTab?: (tabId: string) => Promise<SequenceRecord | null>
  /** DNA library members — primers may anneal to members even when consensus does not. */
  libraryMemberSequences?: readonly string[]
  libraryMemberPrimers?: readonly Primer[]
  onCancel: () => void
  onAdd: (primers: Primer[]) => void
}

type ImportScanResult = {
  candidates: PrimerImportCandidate[]
  skipped: number
}

function primerEntriesFromRecord(sourceRecord: SequenceRecord): PrimerListEntry[] {
  return sourceRecord.primers
    .map((primer) => {
      const sequence = normalizeDna(primer.sequence)
      if (!sequence) return null
      return {
        name: primer.name || 'Primer',
        sequence,
        color: primer.color || undefined,
        description: primer.description,
      } satisfies PrimerListEntry
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}

function looksLikePrimerListFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return lower.endsWith('.txt') || lower.endsWith('.tsv') || lower.endsWith('.csv')
}

/**
 * Load primer oligos from a construct file (.dna / GenBank / …) or a name/sequence list (.txt).
 * List formats are accepted here so “from another file” still works when the user picks a list.
 */
async function loadPrimerEntriesFromFile(file: File): Promise<PrimerListEntry[]> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  if (isSnapGeneBytes(bytes)) {
    return primerEntriesFromRecord(parseSnapGene(bytes, file.name, { skipTraces: true }))
  }

  const text = new TextDecoder().decode(bytes)
  const preferList = looksLikePrimerListFileName(file.name) || isPrimerListTabText(text)
  if (preferList) {
    const listEntries = parsePrimerDataTsv(text)
    if (listEntries.length) return listEntries
  }

  if (file.name.toLowerCase().endsWith('.json') && text.trim().startsWith('{')) {
    return primerEntriesFromRecord(parseProjectJson(text).record)
  }

  try {
    const fromRecord = primerEntriesFromRecord(parseSequenceBytes(buffer, file.name))
    if (fromRecord.length) return fromRecord
  } catch {
    // Fall through to list parsing for misc text exports.
  }

  return parsePrimerDataTsv(text)
}

export function PrimersImportFromFileDialog({
  currentRecord,
  hybridization,
  openTabs = [],
  onLoadOpenTab,
  libraryMemberSequences = [],
  libraryMemberPrimers = [],
  onCancel,
  onAdd,
}: PrimersImportFromFileDialogProps) {
  const [result, setResult] = useState<ImportScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [databasePickerOpen, setDatabasePickerOpen] = useState(false)
  const recordName = useMemo(
    () => (currentRecord.name.endsWith('.dna') ? currentRecord.name : `${currentRecord.name}.dna`),
    [currentRecord.name],
  )
  const visibleOpenTabs = useMemo<ImportSourceTab[]>(
    () => openTabs.filter((tab) => tab.molecule === 'dna'),
    [openTabs],
  )

  async function buildCandidatesFromEntries(entries: PrimerListEntry[]) {
    setError(null)
    setLoading(true)
    try {
      if (!entries.length) {
        throw new Error(
          'No primers found in that file (expected a construct with primers, or name\\tsequence list lines).',
        )
      }
      const { candidates, skipped } = resolvePrimerImportCandidates(
        currentRecord.sequence,
        entries,
        currentRecord.primers,
        hybridization,
        {
          additionalTemplates: libraryMemberSequences,
          additionalExistingPrimers: libraryMemberPrimers,
        },
      )
      setResult({ candidates, skipped })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function buildCandidatesFromSourceRecord(sourceRecord: SequenceRecord) {
    await buildCandidatesFromEntries(primerEntriesFromRecord(sourceRecord))
  }

  async function buildCandidatesFromOpenTab(tab: ImportSourceTab) {
    if (!onLoadOpenTab) return
    setError(null)
    setLoading(true)
    try {
      const sourceRecord = await onLoadOpenTab(tab.tabId)
      if (!sourceRecord) throw new Error(`Could not load open tab ${tab.name}.`)
      await buildCandidatesFromSourceRecord(sourceRecord)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setLoading(false)
    }
  }

  if (result) {
    return (
      <PrimersImportDialog
        recordName={recordName}
        candidates={result.candidates}
        skippedCount={result.skipped}
        emptyMessage="No hybridizing primers were found in that file under the current hybridization parameters."
        onCancel={() => setResult(null)}
        onAdd={(primers) => {
          onAdd(primers)
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
        molecules={['dna']}
        onCancel={() => setDatabasePickerOpen(false)}
        onSelect={(record) => {
          setDatabasePickerOpen(false)
          void buildCandidatesFromSourceRecord(record)
        }}
      />
    )
  }

  return (
    <ImportSourcePicker
          title="Import Primers from Another File"
          hint="Choose a DNA construct or a primer list from disk, or a construct from the Database. Supported: SnapGene .dna, GenBank .gbk, FASTA, Vibegene .json, and name/sequence .txt lists."
          openTabs={visibleOpenTabs}
          onOpenTab={onLoadOpenTab ? (tab) => void buildCandidatesFromOpenTab(tab) : undefined}
          onChooseFile={(file) => {
            void (async () => {
              try {
                setError(null)
                await buildCandidatesFromEntries(await loadPrimerEntriesFromFile(file))
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e))
              }
            })()
          }}
          onChooseDatabase={() => setDatabasePickerOpen(true)}
          onCancel={onCancel}
          loading={loading}
        >
        {loading && <p className="features-import-loading">Scanning for hybridizing primers…</p>}
        {error && <p className="features-import-error">{error}</p>}
        </ImportSourcePicker>
  )
}
