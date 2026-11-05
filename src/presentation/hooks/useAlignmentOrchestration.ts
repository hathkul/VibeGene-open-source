import { useTraceAlignment } from './traceAlignmentContext'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { actionProfileAsync } from '../../domain/actionProfiler'
import { beginOperationProgress } from '../../domain/operationProgress'
import { dnaComparisonCacheSignature, type DnaComparisonAlignmentCacheEntry } from '../../domain/dnaComparisonCache'
import { dnaComparisonAlignmentFromTraceAlignment } from '../../domain/dnaComparisonAlignment'
import { mergeLibraryMembersIntoDnaComparisonSources } from '../../domain/dnaComparisonImport'
import type { DnaComparisonSource } from '../../domain/dnaComparisonTypes'
import { emptyChromatogramForSequence } from '../../domain/sequenceTraceFactory'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { realignTraceFileRecordsAsync } from '../../domain/traceFileWorkflow'
import { useDnaComparisonAlignments } from './useDnaComparisonAlignments'
import type { DisplaySettings, WorkspaceTab } from '../sequence'

const emptyDnaComparisonSources: DnaComparisonSource[] = []

type UseAlignmentOrchestrationOptions = {
  record: SequenceRecord
  setRecord: Dispatch<SetStateAction<SequenceRecord>>
  traceFiles: TraceFileRecord[]
  traceFilesRef: MutableRefObject<TraceFileRecord[]>
  displaySettings: DisplaySettings
  alignmentsSupported: boolean
  activeTab: WorkspaceTab
  onTraceFilesChange: (updater: SetStateAction<TraceFileRecord[]>) => void
  alignmentScrollToTemplateRef: MutableRefObject<(templateIndex: number) => void>
}

export function useAlignmentOrchestration({
  record,
  setRecord,
  traceFiles,
  traceFilesRef,
  displaySettings,
  alignmentsSupported,
  activeTab,
  onTraceFilesChange,
  alignmentScrollToTemplateRef,
}: UseAlignmentOrchestrationOptions) {
  const alignPending = useTraceAlignment()
  const [traceAlignBusy, setTraceAlignBusy] = useState(false)
  /** Sequence changed since traces were last aligned — realign only when alignment mode is on. */
  const [tracesNeedRealign, setTracesNeedRealign] = useState(false)
  const lastAlignedSequenceRef = useRef(record.sequence)
  const traceRealignTimerRef = useRef<number | null>(null)
  const traceRealignAbortRef = useRef<AbortController | null>(null)
  const pendingSequenceAlignmentScrollRef = useRef<number | null>(null)

  const tracesNeedingAlign = useMemo(
    () => traceFiles.some((trace) => trace.enabled && !trace.parseError && !trace.alignment),
    [traceFiles],
  )
  const alignmentsVisible = alignmentsSupported
    && displaySettings.alignments.visible
    && (displaySettings.alignments.mode ?? 'trace') === 'trace'
  const alignmentsShown = displaySettings.alignments.visible
  const dnaAlignmentMode = displaySettings.alignments.mode ?? 'trace'
  const dnaLibraryComparativeActive = record.molecule === 'dna'
    && isDnaLibraryRecord(record)
    && displaySettings.alignments.visible
    && dnaAlignmentMode === 'comparative'
  const libraryComparativeMemberIds = useMemo(
    () => (dnaLibraryComparativeActive
      ? new Set(traceFiles.filter((trace) => trace.sequence.length > 0 && !trace.parseError).map((trace) => trace.id))
      : null),
    [dnaLibraryComparativeActive, traceFiles],
  )
  const dnaComparisonSources = useMemo(() => {
    if (!(record.molecule === 'dna' && displaySettings.alignments.visible && dnaAlignmentMode === 'comparative')) {
      return emptyDnaComparisonSources
    }
    const homologs = record.dna?.comparisonSources ?? emptyDnaComparisonSources
    if (!isDnaLibraryRecord(record)) return homologs
    return mergeLibraryMembersIntoDnaComparisonSources(traceFiles, homologs)
  }, [displaySettings.alignments.visible, dnaAlignmentMode, record, traceFiles])
  const dnaComparisonAlignmentCache = useMemo(() => {
    const persisted = record.dna?.comparisonAlignmentCache ?? []
    if (!dnaLibraryComparativeActive) return persisted
    const topology = record.topology === 'circular' ? 'circular' : 'linear'
    const memberEntries = traceFiles.flatMap((trace) => {
      if (!trace.alignment || !trace.sequence.length || trace.parseError) return []
      const source = {
        id: trace.id,
        name: trace.fileName,
        fileName: trace.fileName,
        sequence: trace.sequence,
        enabled: trace.enabled,
      }
      return [{
        sourceId: trace.id,
        signature: dnaComparisonCacheSignature(record.sequence, source, topology),
        alignment: dnaComparisonAlignmentFromTraceAlignment(trace.id, trace.alignment),
      }]
    })
    if (!memberEntries.length) return persisted
    const memberIds = new Set(memberEntries.map((entry) => entry.sourceId))
    return [...persisted.filter((entry) => !memberIds.has(entry.sourceId)), ...memberEntries]
  }, [dnaLibraryComparativeActive, record.dna?.comparisonAlignmentCache, record.sequence, record.topology, traceFiles])

  const updateDnaComparisonAlignmentCacheEntry = useCallback((entry: DnaComparisonAlignmentCacheEntry) => {
    // Library members keep alignments on traceFiles; do not mirror into comparison cache.
    if (libraryComparativeMemberIds?.has(entry.sourceId)) return
    // Cache refreshes are persistence metadata, not user-edit operations; keep them out of Undo/Redo.
    setRecord((current) => {
      if (current.molecule !== 'dna') return current
      const existing = current.dna?.comparisonAlignmentCache ?? []
      const previous = existing.find((candidate) => candidate.sourceId === entry.sourceId)
      if (previous?.signature === entry.signature
        && previous.alignment === entry.alignment
        && previous.error === entry.error) return current
      return {
        ...current,
        dna: {
          ...current.dna,
          comparisonSources: current.dna?.comparisonSources ?? [],
          comparisonAlignmentCache: [
            ...existing.filter((candidate) => candidate.sourceId !== entry.sourceId),
            entry,
          ],
        },
      }
    })
  }, [libraryComparativeMemberIds, setRecord])

  const { entries: dnaComparisonEntries, pending: dnaComparisonPending } = useDnaComparisonAlignments(
    record.sequence,
    dnaComparisonSources,
    record.topology,
    dnaComparisonAlignmentCache,
    updateDnaComparisonAlignmentCacheEntry,
  )
  const dnaComparisonMapFiles = useMemo<TraceFileRecord[]>(
    () => dnaComparisonEntries.flatMap((entry) => entry.source.enabled && entry.alignment ? [{
      id: entry.source.id,
      fileName: entry.source.fileName ?? entry.source.name,
      sequence: entry.source.sequence,
      chromatogram: emptyChromatogramForSequence(entry.source.sequence),
      enabled: true,
      expanded: false,
      showAnnotations: false,
      alignment: entry.alignment,
      alignmentPurpose: 'comparative' as const,
      ...(entry.error ? { parseError: entry.error } : {}),
    }] : []),
    [dnaComparisonEntries],
  )

  const requestAlignmentSequenceScroll = useCallback(
    (templateIndex: number) => {
      if (activeTab === 'Sequence' && alignmentsShown) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            alignmentScrollToTemplateRef.current(templateIndex)
          })
        })
        return
      }
      pendingSequenceAlignmentScrollRef.current = templateIndex
    },
    [activeTab, alignmentsShown, alignmentScrollToTemplateRef],
  )

  useEffect(() => {
    if (activeTab !== 'Sequence' || !alignmentsShown) return
    const templateIndex = pendingSequenceAlignmentScrollRef.current
    if (templateIndex === null) return
    pendingSequenceAlignmentScrollRef.current = null
    let innerFrame = 0
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        alignmentScrollToTemplateRef.current(templateIndex)
      })
    })
    return () => {
      window.cancelAnimationFrame(outerFrame)
      if (innerFrame) window.cancelAnimationFrame(innerFrame)
    }
  }, [activeTab, alignmentsShown, alignmentScrollToTemplateRef])

  useEffect(() => {
    if (lastAlignedSequenceRef.current === record.sequence) return
    if (!traceFilesRef.current.length) {
      lastAlignedSequenceRef.current = record.sequence
      setTracesNeedRealign(false)
      return
    }
    setTracesNeedRealign(true)
  }, [record.sequence, traceFilesRef])

  useEffect(() => {
    const needsWork = alignmentsVisible
      && traceFilesRef.current.length > 0
      && (tracesNeedRealign || tracesNeedingAlign)
    if (!needsWork) return

    const sequence = record.sequence
    const topology = record.topology
    const force = tracesNeedRealign || lastAlignedSequenceRef.current !== sequence
    // Debounce only while typing with alignments visible; turning the mode on runs promptly.
    const delayMs = force && lastAlignedSequenceRef.current !== sequence ? 400 : 0

    if (traceRealignTimerRef.current != null) {
      window.clearTimeout(traceRealignTimerRef.current)
      traceRealignTimerRef.current = null
    }
    traceRealignAbortRef.current?.abort()
    const controller = new AbortController()
    traceRealignAbortRef.current = controller

    traceRealignTimerRef.current = window.setTimeout(() => {
      traceRealignTimerRef.current = null
      void (async () => {
        setTraceAlignBusy(true)
        const pendingCount = traceFilesRef.current.filter(
          (trace) => !trace.parseError && (force || !trace.alignment),
        ).length
        const progress = beginOperationProgress(
          force ? 'Realigning sequence traces' : 'Aligning library members',
          pendingCount,
          { onCancel: () => controller.abort() },
        )
        try {
          const aligned = await actionProfileAsync(
            force ? 'realignTracesOnSequenceChange' : 'realignTraces',
            'alignment',
            () => realignTraceFileRecordsAsync(traceFilesRef.current, sequence, {
              force,
              topology,
              alignPending,
              signal: controller.signal,
              onProgress: (completed, total) => progress.update(
                completed,
                total,
                `${completed} of ${total} members aligned`,
              ),
            }),
            `${traceFilesRef.current.length} files · ${sequence.length} bp`,
          )
          if (controller.signal.aborted) return
          lastAlignedSequenceRef.current = sequence
          setTracesNeedRealign(false)
          onTraceFilesChange(aligned)
        } catch (error) {
          if (controller.signal.aborted) return
          throw error
        } finally {
          progress.finish()
          if (!controller.signal.aborted) setTraceAlignBusy(false)
        }
      })()
    }, delayMs)

    return () => {
      if (traceRealignTimerRef.current != null) {
        window.clearTimeout(traceRealignTimerRef.current)
        traceRealignTimerRef.current = null
      }
      controller.abort()
      if (traceRealignAbortRef.current === controller) traceRealignAbortRef.current = null
    }
  }, [alignPending, alignmentsVisible, onTraceFilesChange, record.sequence, record.topology, traceFilesRef, tracesNeedRealign, tracesNeedingAlign])

  return {
    alignmentsVisible,
    dnaAlignmentMode,
    dnaLibraryComparativeActive,
    libraryComparativeMemberIds,
    dnaComparisonSources,
    dnaComparisonEntries,
    dnaComparisonPending,
    dnaComparisonMapFiles,
    traceAlignBusy,
    setTraceAlignBusy,
    tracesNeedRealign,
    setTracesNeedRealign,
    lastAlignedSequenceRef,
    requestAlignmentSequenceScroll,
  }
}
