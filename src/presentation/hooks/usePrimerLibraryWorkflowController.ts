import { useState } from 'react'
import { detectCommonPrimers, type CommonPrimerMatch } from '../../domain/commonPrimers'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import type { PrimerImportCandidate, PrimerListEntry } from '../../domain/primerExport'
import { normalizePrimerHybridizationParams, type PrimerHybridizationParams } from '../../domain/primerHybridization'
import type { LibraryPrimer } from '../../domain/libraryPrimer'
import type { Primer, SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import {
  countSkippedPresentPrimers,
  databasePrimerListEntries,
  libraryHybridizationTemplates,
  validLibraryMemberSequences,
} from '../../application/primerWorkflow/primerLibraryOps'
import type {
  PrimerWorkflowContext,
  PrimerWorkflowResult,
} from '../../application/primerWorkflow/primerWorkflow'
import type { PrimerWorkflowActionPorts } from './usePrimerManagementController'

/** Minimal common-library primer shape exchanged with storage ports. */
export type CommonPrimerLibraryEntry = {
  name: string
  sequence: string
  color?: string
  description?: string
}

export type LibraryPrimerImportOptions = {
  additionalTemplates: string[]
  additionalExistingPrimers: Primer[]
}

export type PrimerLibraryWorkflowPorts = {
  getTraceFiles: () => TraceFileRecord[]
  getSelectedPrimers: () => Primer[]
  hybridization: PrimerHybridizationParams
  listCommonPrimers: () => Promise<CommonPrimerLibraryEntry[]>
  loadPrimerTagMap: () => Promise<Map<string, string[]>>
  filterPrimersByTag: <T extends { name: string; sequence: string }>(
    primers: T[],
    tagMap: Map<string, string[]>,
    tag: string,
  ) => T[]
  addCommonPrimers: (
    drafts: CommonPrimerLibraryEntry[],
  ) => Promise<{ added: CommonPrimerLibraryEntry[]; skipped: number }>
  libraryPrimerImportOptions: () => LibraryPrimerImportOptions | undefined
  setPrimerHybridization: (hybridization: PrimerHybridizationParams) => void
  setHybridizationParamsOpen: (open: boolean) => void
  context: (hybridization?: PrimerHybridizationParams) => PrimerWorkflowContext
  apply: (result: PrimerWorkflowResult) => void
  setStatus: (status: string) => void
  setSelectedPrimerId: (id: string | null) => void
  setSelectedPrimerIds: (ids: string[]) => void
  setSelectionFocus: (focus: 'dna' | 'feature' | 'primer' | 'bond') => void
  preparePrimerImport: (
    template: string,
    entries: readonly PrimerListEntry[],
    existing: readonly Primer[],
    hybridization: PrimerHybridizationParams,
    options?: LibraryPrimerImportOptions,
  ) => { candidates: PrimerImportCandidate[]; skipped: number }
  refreshPrimerCommand: (
    hybridization: PrimerHybridizationParams,
    templates: readonly string[],
    ports: PrimerWorkflowActionPorts,
  ) => void
  addDatabasePrimerCommand: (
    primers: readonly Primer[],
    listCount: number,
    skippedPresent: number,
    skippedNoHybrid: number,
    ports: PrimerWorkflowActionPorts,
  ) => void
}

/**
 * Owns the common-primer / database-primer / hybridization-parameter workflow: detection of
 * common-library primers on the open document, adding the selection to the common library,
 * inserting database primers onto the record, and re-checking stored primers after the
 * hybridization parameters change.
 */
export function usePrimerLibraryWorkflowController(
  record: SequenceRecord,
  ports: PrimerLibraryWorkflowPorts,
) {
  const [commonPrimerMatches, setCommonPrimerMatches] = useState<
    CommonPrimerMatch<CommonPrimerLibraryEntry>[] | null
  >(null)

  function recordHybridizationTemplates(): string[] {
    const isLibrary = isDnaLibraryRecord(record)
    return libraryHybridizationTemplates(
      isLibrary,
      record.sequence,
      isLibrary ? validLibraryMemberSequences(ports.getTraceFiles()) : [],
    )
  }

  async function detectCommonPrimersInDocument(scope: 'all' | { tag: string } = 'all') {
    const tagLabel = scope === 'all' ? null : scope.tag.trim()
    ports.setStatus(
      tagLabel
        ? `Detecting common primers tagged “${tagLabel}”…`
        : 'Detecting common primers…',
    )
    try {
      const library = await ports.listCommonPrimers()
      if (!library.length) {
        setCommonPrimerMatches([])
        ports.setStatus('No common primers in the library yet.')
        return
      }
      const tagMap = tagLabel ? await ports.loadPrimerTagMap() : null
      const scoped =
        tagLabel && tagMap ? ports.filterPrimersByTag(library, tagMap, tagLabel) : library
      if (!scoped.length) {
        setCommonPrimerMatches([])
        ports.setStatus(
          tagLabel
            ? `No common primers are tagged “${tagLabel}”.`
            : 'No common primers in the library yet.',
        )
        return
      }
      const matches = detectCommonPrimers(
        record.sequence,
        scoped,
        record.primers ?? [],
        ports.hybridization,
        isDnaLibraryRecord(record)
          ? validLibraryMemberSequences(ports.getTraceFiles())
          : [],
      )
      setCommonPrimerMatches(matches)
      ports.setStatus(
        matches.length === 0
          ? tagLabel
            ? `No common primers tagged “${tagLabel}” hybridize to this sequence.`
            : 'No common primers hybridize to this sequence.'
          : tagLabel
            ? `Detected ${matches.length} common primer${matches.length === 1 ? '' : 's'} tagged “${tagLabel}”.`
            : `Detected ${matches.length} common primer${matches.length === 1 ? '' : 's'}.`,
      )
    } catch (error) {
      ports.setStatus(`Common primer detection failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async function addSelectedPrimersToCommonLibrary() {
    const primers = ports.getSelectedPrimers()
    if (!primers.length) {
      ports.setStatus('Select a primer to add to Common primers.')
      return
    }
    const { added, skipped } = await ports.addCommonPrimers(
      primers.map((primer) => ({
        name: primer.name,
        sequence: primer.sequence,
        color: primer.color,
        description: primer.description,
      })),
    )
    const addedNote =
      added.length === 1
        ? `Added “${added[0]!.name}” to Common primers.`
        : `Added ${added.length} primer${added.length === 1 ? '' : 's'} to Common primers.`
    const skippedNote = skipped > 0 ? ` Skipped ${skipped} already in the library.` : ''
    if (!added.length && skipped) {
      ports.setStatus('Selected primer(s) are already in Common primers.')
      return
    }
    ports.setStatus(`${addedNote}${skippedNote}`)
  }

  function addDatabasePrimers(entries: LibraryPrimer[]) {
    const listEntries = databasePrimerListEntries(entries)
    const { candidates, skipped: skippedNoHybrid } = ports.preparePrimerImport(
      record.sequence,
      listEntries,
      record.primers ?? [],
      ports.hybridization,
      ports.libraryPrimerImportOptions(),
    )
    const skippedPresent = countSkippedPresentPrimers(
      candidates.map((candidate) => candidate.primer.sequence),
      record.primers,
    )
    ports.addDatabasePrimerCommand(candidates.map((candidate) => candidate.primer), listEntries.length, skippedPresent, skippedNoHybrid, {
      context: ports.context,
      apply: ports.apply,
      setStatus: ports.setStatus,
      clearSelection: () => {
        ports.setSelectedPrimerId(null)
        ports.setSelectedPrimerIds([])
      },
      select: (added) => {
        ports.setSelectedPrimerId(added[0]!.id)
        ports.setSelectedPrimerIds(added.map((primer) => primer.id))
        ports.setSelectionFocus('primer')
      },
    })
  }

  function saveHybridizationParameters(next: PrimerHybridizationParams) {
    const hybridization = normalizePrimerHybridizationParams(next)
    ports.setPrimerHybridization(hybridization)
    ports.refreshPrimerCommand(hybridization, recordHybridizationTemplates(), {
      context: ports.context,
      apply: ports.apply,
      setStatus: ports.setStatus,
      clearSelection: () => {
        ports.setSelectedPrimerId(null)
        ports.setSelectedPrimerIds([])
      },
    })
    ports.setHybridizationParamsOpen(false)
  }

  return {
    commonPrimerMatches,
    setCommonPrimerMatches,
    detectCommonPrimersInDocument,
    addSelectedPrimersToCommonLibrary,
    addDatabasePrimers,
    saveHybridizationParameters,
  }
}
