import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { cloneTraceFilesForHistory } from '../../application/documentHistory/cloneTraceFilesForHistory'
import { normalizeSequenceRecord } from '../../domain/constructProperties'
import { nowIso } from '../../domain/sequence'
import { serializeProjectSnapshot } from '../../domain/projectSnapshot'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SequenceRecord } from '../../domain/types'
import type { TraceDocumentState } from './useDocumentImportController'
import type { DocumentHistorySnapshot } from './useSelectionEditingController'

export type DocumentHistoryStateBootstrap = {
  initialRecord: SequenceRecord
  initialTraceFiles: TraceFileRecord[]
  initiallyUnsaved: boolean
}

export type DocumentHistoryStatePorts = {
  maxHistoryEntries: number
  setUndoStack: Dispatch<SetStateAction<DocumentHistorySnapshot[]>>
  setRedoStack: Dispatch<SetStateAction<DocumentHistorySnapshot[]>>
  actionProfileSync: <T>(name: string, category: string, run: () => T, detail: string) => T
  onHistorySnapshotRestored: (snapshot: DocumentHistorySnapshot) => void
  clearSessionDraftForRecord: (recordId: string) => Promise<void>
  refreshSessionDraftsRef: { current: () => void | Promise<void> }
}

/** Owns the editable record, trace map, saved baseline, dirty state, and undo snapshot push/restore. */
export function useDocumentHistoryState(
  bootstrap: DocumentHistoryStateBootstrap,
  traceDocument: TraceDocumentState | null,
  ports: DocumentHistoryStatePorts,
) {
  const {
    maxHistoryEntries,
    setUndoStack,
    setRedoStack,
    actionProfileSync,
    onHistorySnapshotRestored,
    clearSessionDraftForRecord,
    refreshSessionDraftsRef,
  } = ports

  const [record, setRecord] = useState<SequenceRecord>(() => bootstrap.initialRecord)
  const [traceFilesByRecordId, setTraceFilesByRecordId] = useState<Record<string, TraceFileRecord[]>>(() => {
    if (bootstrap.initialTraceFiles.length) {
      return { [bootstrap.initialRecord.id]: bootstrap.initialTraceFiles }
    }
    return {}
  })
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    bootstrap.initiallyUnsaved
      ? '__vibegene:never-saved__'
      : serializeProjectSnapshot(bootstrap.initialRecord, bootstrap.initialTraceFiles),
  )
  const [savedRecord, setSavedRecord] = useState<SequenceRecord | null>(
    bootstrap.initiallyUnsaved ? null : bootstrap.initialRecord,
  )
  const [savedTraceFiles, setSavedTraceFiles] = useState<TraceFileRecord[]>(
    bootstrap.initiallyUnsaved ? [] : bootstrap.initialTraceFiles,
  )

  const traceFiles = useMemo(
    () => traceFilesByRecordId[record.id] ?? [],
    [traceFilesByRecordId, record.id],
  )
  const traceFilesRef = useRef(traceFiles)
  const recordRef = useRef(record)
  const isDirtyRef = useRef(false)

  useLayoutEffect(() => {
    traceFilesRef.current = traceFiles
    recordRef.current = record
  })

  const isDirty = useMemo(
    () => {
      if (traceDocument) return false
      const tracesAreUnchanged = traceFiles === savedTraceFiles
        || (traceFiles.length === 0 && savedTraceFiles.length === 0)
      if (record === savedRecord && tracesAreUnchanged) return false
      return actionProfileSync(
        'serializeProjectSnapshot',
        'persistence',
        () => serializeProjectSnapshot(record, traceFiles) !== savedSnapshot,
        `${traceFiles.length} traces`,
      )
    },
    [actionProfileSync, traceDocument, record, traceFiles, savedRecord, savedTraceFiles, savedSnapshot],
  )

  useLayoutEffect(() => {
    isDirtyRef.current = isDirty
  })

  const markNeverSaved = useCallback(() => {
    setSavedSnapshot('__vibegene:never-saved__')
    setSavedRecord(null)
    setSavedTraceFiles([])
  }, [])

  const applySavedBaseline = useCallback((nextRecord: SequenceRecord, nextTraceFiles: TraceFileRecord[]) => {
    setSavedSnapshot(serializeProjectSnapshot(nextRecord, nextTraceFiles))
    setSavedRecord(nextRecord)
    setSavedTraceFiles(nextTraceFiles)
  }, [])

  const markClean = useCallback((nextRecord: SequenceRecord, nextTraceFiles: TraceFileRecord[]) => {
    applySavedBaseline(nextRecord, nextTraceFiles)
    void clearSessionDraftForRecord(nextRecord.id).then(() => refreshSessionDraftsRef.current())
  }, [applySavedBaseline, clearSessionDraftForRecord, refreshSessionDraftsRef])

  const setTraceFilesForRecord = useCallback((recordId: string, updater: SetStateAction<TraceFileRecord[]>) => {
    setTraceFilesByRecordId((current) => {
      const existing = current[recordId] ?? []
      const next = typeof updater === 'function' ? updater(existing) : updater
      return { ...current, [recordId]: next }
    })
  }, [])

  const onTraceFilesChange = useCallback(
    (updater: SetStateAction<TraceFileRecord[]>) => {
      setTraceFilesForRecord(record.id, updater)
    },
    [record.id, setTraceFilesForRecord],
  )

  const captureDocumentHistorySnapshot = useCallback((): DocumentHistorySnapshot => ({
    record,
    traceFiles: cloneTraceFilesForHistory(traceFiles),
  }), [record, traceFiles])

  const pushDocumentHistorySnapshot = useCallback(() => {
    setUndoStack((stack) => [...stack, captureDocumentHistorySnapshot()].slice(-maxHistoryEntries))
    setRedoStack([])
  }, [captureDocumentHistorySnapshot, maxHistoryEntries, setRedoStack, setUndoStack])

  const restoreDocumentHistorySnapshot = useCallback((snapshot: DocumentHistorySnapshot) => {
    setRecord(snapshot.record)
    setTraceFilesForRecord(snapshot.record.id, snapshot.traceFiles)
    onHistorySnapshotRestored(snapshot)
  }, [onHistorySnapshotRestored, setTraceFilesForRecord])

  const updateRecord = useCallback((
    updater: (current: SequenceRecord) => SequenceRecord,
    options?: { recordHistory?: boolean },
  ) => {
    if (options?.recordHistory !== false) pushDocumentHistorySnapshot()
    setRecord((current) => {
      const updated = normalizeSequenceRecord(updater(current))
      return { ...updated, updatedAt: nowIso() }
    })
  }, [pushDocumentHistorySnapshot])

  useEffect(() => {
    setUndoStack([])
    setRedoStack([])
  }, [record.id, setRedoStack, setUndoStack])

  return {
    record,
    setRecord,
    traceFiles,
    traceFilesRef,
    recordRef,
    isDirty,
    isDirtyRef,
    applySavedBaseline,
    markClean,
    markNeverSaved,
    setTraceFilesForRecord,
    onTraceFilesChange,
    updateRecord,
    captureDocumentHistorySnapshot,
    restoreDocumentHistorySnapshot,
    pushDocumentHistorySnapshot,
  }
}
