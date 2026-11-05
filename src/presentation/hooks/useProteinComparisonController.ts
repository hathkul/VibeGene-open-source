import { useCallback } from 'react'
import type { DnaComparisonSource } from '../../domain/dnaComparisonTypes'
import { proteinSequenceFromGuidedAlignment } from '../../domain/proteinAlignment'
import type { ProteinComparisonAlignmentCacheEntry, ProteinComparisonVariableRegion } from '../../domain/proteinAlignmentTypes'
import type { OpenAlignedProteinComparisonSourceRequest } from '../../components/ProteinAlignmentPane'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { normalizeSequenceRecord } from '../../domain/constructProperties'
import { nowIso, createId, formatRange } from '../../domain/sequence'
import { dnaSequenceDigest } from '../../domain/proteinTranslationProvenance'
import { replaceProteinComparisonAlignmentCacheEntry, replaceProteinComparisonSources, replaceProteinComparisonVariableRegions } from '../../application/proteinWorkflow/proteinWorkflow'
import type { ProteinTranslationSource, SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SelectionRange } from '../sequence'

type SetRecord = (updater: (current: SequenceRecord) => SequenceRecord) => void

export type ProteinComparisonControllerOptions = {
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  selectedRange: SelectionRange | null
  updateRecord: (updater: (current: SequenceRecord) => SequenceRecord) => void
  setRecord: SetRecord
  onTraceFilesChange: (updater: (current: TraceFileRecord[]) => TraceFileRecord[]) => void
  setStatus: (status: string) => void
  writeClipboardText: (text: string) => Promise<void>
  openRecordInNewTab: (record: SequenceRecord, options?: { initiallyUnsaved?: boolean }) => void
  createDnaRecord: (input: { sequence: string; topology: 'linear'; fileName: string }) => SequenceRecord
  createProteinRecord: (input: { sequence: string; fileName: string }) => SequenceRecord
  getProject: (projectId: string) => Promise<{ record: SequenceRecord } | null>
}

// Kept local to avoid importing the much larger trace-file record shape into this controller.
export function useProteinComparisonController(options: ProteinComparisonControllerOptions) {
  const updateProteinComparisonSources = useCallback((
    sources: NonNullable<SequenceRecord['protein']>['comparisonSources'] | null,
  ) => {
    options.updateRecord((current) => replaceProteinComparisonSources(current, sources ?? []))
  }, [options])

  const updateDnaComparisonSources = useCallback((sources: DnaComparisonSource[]) => {
    if (isDnaLibraryRecord(options.record)) {
      const memberIds = new Set(options.traceFiles.map((trace) => trace.id))
      const enabledByMemberId = new Map(
        sources.filter((source) => memberIds.has(source.id)).map((source) => [source.id, source.enabled]),
      )
      if (enabledByMemberId.size) {
        options.onTraceFilesChange((current) => current.map((trace) => {
          if (!enabledByMemberId.has(trace.id)) return trace
          const enabled = enabledByMemberId.get(trace.id)!
          return trace.enabled === enabled ? trace : { ...trace, enabled }
        }))
      }
      const homologs = sources.filter((source) => !memberIds.has(source.id))
      const sourceIds = new Set(homologs.map((source) => source.id))
      options.updateRecord((current) => current.molecule !== 'dna'
        ? current
        : {
            ...current,
            dna: {
              ...current.dna,
              comparisonSources: homologs,
              comparisonAlignmentCache: (current.dna?.comparisonAlignmentCache ?? [])
                .filter((entry) => sourceIds.has(entry.sourceId) && !memberIds.has(entry.sourceId)),
            },
          })
      return
    }
    const sourceIds = new Set(sources.map((source) => source.id))
    options.updateRecord((current) => current.molecule !== 'dna'
      ? current
      : {
          ...current,
          dna: {
            ...current.dna,
            comparisonSources: sources,
            comparisonAlignmentCache: (current.dna?.comparisonAlignmentCache ?? [])
              .filter((entry) => sourceIds.has(entry.sourceId)),
          },
        })
  }, [options])

  const updateProteinComparisonAlignmentCacheEntry = useCallback((entry: ProteinComparisonAlignmentCacheEntry) => {
    // Cache refreshes are persistence metadata, not user-edit operations; keep them out of Undo/Redo.
    options.setRecord((current) => {
      const next = replaceProteinComparisonAlignmentCacheEntry(current, entry)
      if (next === current) return current
      return normalizeSequenceRecord({ ...next, updatedAt: nowIso() })
    })
  }, [options])

  const updateProteinComparisonVariableRegions = useCallback((
    regions: NonNullable<SequenceRecord['protein']>['comparisonVariableRegions'] | null,
  ) => {
    options.updateRecord((current) => replaceProteinComparisonVariableRegions(current, regions ?? []))
  }, [options])

  const copySelectedProtein = useCallback((asFasta = false) => {
    if (options.record.molecule !== 'protein' || !options.selectedRange || options.selectedRange.end <= options.selectedRange.start) return
    const sequence = options.record.sequence.slice(options.selectedRange.start, options.selectedRange.end)
    const text = asFasta
      ? `>${options.record.name}\n${sequence.match(/.{1,70}/g)?.join('\n') ?? ''}`
      : sequence
    // Preserve the prior command's immediate success feedback; clipboard I/O is
    // deliberately a port so this controller remains presentation-independent.
    void options.writeClipboardText(text)
    options.setStatus(`Copied ${sequence.length.toLocaleString()} aa${asFasta ? ' as FASTA' : ''}.`)
  }, [options])

  const markSelectedProteinVariable = useCallback(() => {
    if (options.record.molecule !== 'protein' || !options.selectedRange || options.selectedRange.end <= options.selectedRange.start) return
    const nextRegion: ProteinComparisonVariableRegion = {
      id: createId('protein-variable'),
      start: options.selectedRange.start,
      end: options.selectedRange.end,
    }
    updateProteinComparisonVariableRegions([...(options.record.protein?.comparisonVariableRegions ?? []), nextRegion])
    options.setStatus(`Marked ${formatRange(nextRegion.start, nextRegion.end)} as a variable protein region.`)
  }, [options, updateProteinComparisonVariableRegions])

  const clearProteinVariableRegions = useCallback(() => {
    updateProteinComparisonVariableRegions([])
    options.setStatus('Cleared protein variability regions.')
  }, [options, updateProteinComparisonVariableRegions])

  const openAlignedProteinComparisonSource = useCallback((request: OpenAlignedProteinComparisonSourceRequest) => {
    const { source, as, alignment } = request
    if (as === 'dna') {
      if (source.kind !== 'dna') {
        options.setStatus(`${source.name} is a protein comparison source.`)
        return
      }
      const next = options.createDnaRecord({
        sequence: source.sequence,
        topology: 'linear',
        fileName: source.fileName ?? `${source.name}.dna`,
      })
      options.openRecordInNewTab(next, { initiallyUnsaved: true })
      options.setStatus(`Opened ${source.name} as DNA.`)
      return
    }
    const sequence = source.kind === 'protein' ? source.sequence : proteinSequenceFromGuidedAlignment(alignment)
    if (!sequence.trim()) {
      options.setStatus(`Could not open ${source.name} as protein.`)
      return
    }
    const next = options.createProteinRecord({ sequence, fileName: source.fileName ?? source.name })
    options.openRecordInNewTab(next, { initiallyUnsaved: true })
    options.setStatus(`Opened ${source.name} as protein.`)
  }, [options])

  const openTranslationSourceDna = useCallback(async (source: ProteinTranslationSource) => {
    if (source.sourceRecord) {
      options.openRecordInNewTab(source.sourceRecord)
      options.setStatus(`Opened source DNA ${source.projectName}.`)
      return
    }
    if (!source.projectId) {
      options.setStatus(`Source DNA for ${source.projectName} has no embedded construct or database reference.`)
      return
    }
    if (!source.sequenceDigest) {
      options.setStatus(`Database source DNA ${source.projectName} cannot be verified because its sequence fingerprint is missing.`)
      return
    }
    try {
      const project = await options.getProject(source.projectId)
      if (!project || project.record.molecule === 'protein') {
        options.setStatus(`Database source DNA ${source.projectName} is unavailable.`)
        return
      }
      if (dnaSequenceDigest(project.record.sequence) !== source.sequenceDigest) {
        options.setStatus(`Database source ${source.projectName} no longer matches the sequence used for this protein.`)
        return
      }
      options.openRecordInNewTab(project.record)
      options.setStatus(`Opened verified database source DNA ${source.projectName}.`)
    } catch (error) {
      options.setStatus(error instanceof Error ? error.message : `Could not open database source ${source.projectName}.`)
    }
  }, [options])

  return {
    updateProteinComparisonSources,
    updateDnaComparisonSources,
    updateProteinComparisonAlignmentCacheEntry,
    updateProteinComparisonVariableRegions,
    copySelectedProtein,
    markSelectedProteinVariable,
    clearProteinVariableRegions,
    openAlignedProteinComparisonSource,
    openTranslationSourceDna,
  }
}
