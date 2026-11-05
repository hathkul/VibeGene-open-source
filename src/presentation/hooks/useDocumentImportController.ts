import { useCallback } from 'react'
import { alignTraceToTemplate } from '../../domain/traceAlignment'
import { traceForSequenceConversion } from '../../application/traceDocument'
import { createId } from '../../domain/sequence'
import { normalizeSequenceRecord } from '../../domain/constructProperties'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { importedTraceSequenceName, planImportedRecordSelection, planUnsavedDownloadedRecordSelection } from '../../application/documentImport/documentImport'

export type TraceDocumentState = { trace: TraceFileRecord; fileName: string; path: string | null }

export type DocumentImportControllerOptions = {
  record: SequenceRecord
  traceDocument: TraceDocumentState | null
  setTraceDocument: (value: TraceDocumentState | null) => void
  setRecord: (value: SequenceRecord) => void
  setTraceFiles: (recordId: string, traces: TraceFileRecord[]) => void
  setLibraryFolderId: (value: string | null | undefined) => void
  setWorkspaceDiskPath: (value: string | null) => void
  clearDocumentSelection: () => void
  setActiveTab: (tab: 'Sequence' | 'Map' | 'Features' | 'Primers' | 'Enzymes' | 'History' | 'Properties') => void
  setActiveTabForRecord: (record: SequenceRecord) => void
  applyDefaultMapViewForTopology: (topology: SequenceRecord['topology'], sequenceLength?: number) => void
  setAlignmentsVisible: () => void
  setLastAlignedSequence: (sequence: string) => void
  setTracesNeedRealign: (value: boolean) => void
  setNeverSaved: () => void
  markClean: (record: SequenceRecord, traces: TraceFileRecord[]) => void
  touchRecentLocalFile: (path: string, fileName: string) => void
  setStatus: (status: string) => void
  addImportOperation: (record: SequenceRecord, fileName: string) => SequenceRecord
  parseTrace: (bytes: Uint8Array, fileName: string) => Promise<TraceFileRecord>
  parseTraceShell: (bytes: Uint8Array, fileName: string) => SequenceRecord | null
  createTraceFallback: (fileName: string) => SequenceRecord
  openTraceInNewWorkspace: (file: File, bytes: Uint8Array, localPath?: string) => Promise<void>
  setPendingTopologyImport: (value: { fileName: string; record: SequenceRecord; localPath?: string } | null) => void
}

export function useDocumentImportController(options: DocumentImportControllerOptions) {
  const commitImportedRecord = useCallback((imported: SequenceRecord, fileName: string, localPath?: string) => {
    const plan = planImportedRecordSelection(imported, fileName)
    options.setRecord(imported)
    options.setLibraryFolderId(undefined)
    options.setWorkspaceDiskPath(localPath ?? null)
    options.applyDefaultMapViewForTopology(imported.topology, imported.sequence.length)
    options.setTraceFiles(imported.id, imported.traceFiles ?? [])
    options.clearDocumentSelection()
    options.setActiveTabForRecord(imported)
    if (plan.showLibraryAlignments) options.setAlignmentsVisible()
    options.setStatus(plan.status)
    options.markClean(imported, imported.traceFiles ?? [])
    if (localPath) options.touchRecentLocalFile(localPath, fileName)
  }, [options])

  const commitUnsavedDownloadedRecord = useCallback((imported: SequenceRecord) => {
    const plan = planUnsavedDownloadedRecordSelection(imported)
    const loadedTraces = imported.traceFiles ?? []
    options.setLastAlignedSequence(imported.sequence)
    options.setTracesNeedRealign(false)
    options.setRecord(imported)
    options.setLibraryFolderId(undefined)
    options.setWorkspaceDiskPath(null)
    options.applyDefaultMapViewForTopology(imported.topology, imported.sequence.length)
    options.setTraceFiles(imported.id, loadedTraces)
    options.clearDocumentSelection()
    options.setActiveTabForRecord(imported)
    if (plan.showLibraryAlignments) options.setAlignmentsVisible()
    options.setNeverSaved()
  }, [options])

  const openTraceDocument = useCallback(async (file: File, bytes: Uint8Array, localPath?: string, preparedTrace?: TraceFileRecord) => {
    const trace = preparedTrace ?? await options.parseTrace(bytes, file.name)
    const shellRecord = options.parseTraceShell(bytes, file.name) ?? options.createTraceFallback(file.name)
    options.setTraceDocument({ trace, fileName: file.name, path: localPath ?? null })
    options.setRecord(shellRecord)
    options.setTraceFiles(shellRecord.id, [])
    options.setLibraryFolderId(undefined)
    options.setWorkspaceDiskPath(localPath ?? null)
    options.clearDocumentSelection(); options.setActiveTab('Sequence')
    options.markClean(shellRecord, [])
    if (localPath) options.touchRecentLocalFile(localPath, file.name)
    options.setStatus(trace.parseError ? `Could not parse ${file.name}.` : `Opened ${file.name} as a trace.`)
  }, [options])

  const openTraceDocumentInNewWorkspace = useCallback(async (file: File, bytes: Uint8Array, localPath?: string) => {
    await options.openTraceInNewWorkspace(file, bytes, localPath)
  }, [options])

  const openTraceAsSequence = useCallback((direction: 'forward' | 'reverse') => {
    const source = options.traceDocument
    if (!source || source.trace.parseError || !source.trace.sequence.length) return
    const orientedTrace = traceForSequenceConversion(source.trace, direction)
    const converted = normalizeSequenceRecord({
      ...options.record,
      id: createId('seq'),
      name: importedTraceSequenceName(source.fileName, options.record.name),
      sequence: orientedTrace.sequence,
      topology: 'linear', features: [], primers: [], operations: [],
    })
    const alignment = alignTraceToTemplate(orientedTrace.sequence, converted.sequence, { topology: 'linear' })
    const alignedTrace = { ...orientedTrace, alignment, expanded: true }
    options.setTraceDocument(null); options.setRecord(converted); options.setTraceFiles(converted.id, [alignedTrace])
    options.setLibraryFolderId(undefined); options.setWorkspaceDiskPath(null); options.setActiveTab('Sequence'); options.setAlignmentsVisible()
    options.setNeverSaved()
    options.setStatus(`Created an unsaved ${direction} linear sequence from ${source.fileName}.`)
  }, [options])

  return { commitImportedRecord, commitUnsavedDownloadedRecord, openTraceDocument, openTraceDocumentInNewWorkspace, openTraceAsSequence }
}
