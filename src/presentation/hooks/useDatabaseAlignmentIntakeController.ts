import { useTraceAlignment } from './traceAlignmentContext'
import { useCallback } from 'react'
import {
  databaseAlignmentTraceAddedStatus,
  planDatabaseAlignmentIntake,
  type DatabaseAlignmentIntakeConstruct,
} from '../../application/databaseLibrary/databaseAlignmentIntakePlan'
import type { DatabaseAlignmentPickMode } from '../../application/ports/hybridWindows'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import type { AppendAlignedTraceFilesResult } from '../../domain/traceFileWorkflow'
import { appendAlignedTracesFromSequences } from '../../domain/traceFileWorkflow'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { DnaComparisonSource } from '../../domain/dnaComparisonTypes'
import type { ProteinComparisonSource } from '../../domain/proteinAlignmentTypes'
import type { SequenceRecord } from '../../domain/types'
import type { StoredProject } from '../../application/ports/projectPersistence'

type DatabaseAlignmentIntakePorts = {
  getRecord: () => SequenceRecord
  getTraceFiles: () => TraceFileRecord[]
  dnaAlignmentMode: 'comparative' | 'trace'
  updateDnaComparisonSources: (sources: DnaComparisonSource[]) => void
  updateProteinComparisonSources: (sources: ProteinComparisonSource[]) => void
  onTraceFilesChange: (traces: TraceFileRecord[]) => void
  onAlignmentTracesAdded: (result: {
    scrollTemplateIndex?: number
    scrollToTraceId?: string
  }) => void
  setStatus: (message: string) => void
  appendAlignedTracesFromSequences?: (
    entries: readonly { name: string; sequence: string }[],
    templateSequence: string,
    current: TraceFileRecord[],
    options?: { topology?: 'circular' | 'linear'; alignPending?: import('../../domain/traceFileWorkflow').AlignPendingTraces },
  ) => Promise<AppendAlignedTraceFilesResult>
  getProject: (projectId: string) => Promise<StoredProject | null>
  openProject: (project: StoredProject) => void | Promise<void>
  requestDocumentExit: (action: () => void | Promise<void>) => void
  alignmentsVisible: boolean
}

/** Applies Database construct picks to DNA/protein alignment workflows. */
export function useDatabaseAlignmentIntakeController({
  getRecord,
  getTraceFiles,
  dnaAlignmentMode,
  updateDnaComparisonSources,
  updateProteinComparisonSources,
  onTraceFilesChange,
  onAlignmentTracesAdded,
  setStatus,
  appendAlignedTracesFromSequences: appendAlignedTraces = appendAlignedTracesFromSequences,
  getProject,
  openProject,
  requestDocumentExit,
  alignmentsVisible,
}: DatabaseAlignmentIntakePorts) {
  const alignPending = useTraceAlignment()
  const applyDatabaseConstructsToAlignment = useCallback(async (
    mode: DatabaseAlignmentPickMode,
    constructs: DatabaseAlignmentIntakeConstruct[],
  ) => {
    const record = getRecord()
    const plan = planDatabaseAlignmentIntake({
      mode,
      constructs,
      dnaAlignmentMode,
    })

    if (plan.kind === 'status') {
      setStatus(plan.message)
      return
    }

    if (plan.kind === 'dna-comparative-append') {
      updateDnaComparisonSources([
        ...(record.dna?.comparisonSources ?? []),
        ...plan.sources,
      ])
      setStatus(plan.message)
      return
    }

    if (plan.kind === 'dna-trace-align') {
      setStatus(plan.progressMessage)
      const isLibrary = isDnaLibraryRecord(record)
      const result = await appendAlignedTraces(
        plan.entries,
        record.sequence,
        getTraceFiles(),
        { topology: record.topology, alignPending },
      )
      onTraceFilesChange(result.traces)
      onAlignmentTracesAdded({
        scrollTemplateIndex: result.scrollTemplateIndex,
        scrollToTraceId: result.scrollToTraceId,
      })
      setStatus(databaseAlignmentTraceAddedStatus(result.addedCount, isLibrary))
      return
    }

    const current = record.protein?.comparisonSources ?? []
    updateProteinComparisonSources([...current, ...plan.sources])
    setStatus(plan.message)
  }, [
    appendAlignedTraces,
    alignPending,
    dnaAlignmentMode,
    getRecord,
    getTraceFiles,
    onAlignmentTracesAdded,
    onTraceFilesChange,
    setStatus,
    updateDnaComparisonSources,
    updateProteinComparisonSources,
  ])

  const handleDatabaseProjectDrop = useCallback(async (projectIds: string[]) => {
    const loaded = (await Promise.all(projectIds.map((projectId) => getProject(projectId))))
      .filter((project): project is StoredProject => Boolean(project))
    if (!loaded.length) {
      setStatus('The dropped Database constructs are no longer available.')
      return
    }
    if (!alignmentsVisible) {
      const project = projectIds[0] ? await getProject(projectIds[0]) : null
      if (!project) {
        setStatus('The dropped Database construct is no longer available.')
        return
      }
      requestDocumentExit(() => openProject(project))
      setStatus(`Loaded ${project.name} from Database.`)
      return
    }
    await applyDatabaseConstructsToAlignment(
      getRecord().molecule === 'protein' ? 'protein' : 'dna',
      loaded.map((project) => ({ name: project.record.name, sequence: project.record.sequence, molecule: project.record.molecule })),
    )
  }, [alignmentsVisible, applyDatabaseConstructsToAlignment, getProject, getRecord, openProject, requestDocumentExit, setStatus])

  return { applyDatabaseConstructsToAlignment, handleDatabaseProjectDrop }
}
