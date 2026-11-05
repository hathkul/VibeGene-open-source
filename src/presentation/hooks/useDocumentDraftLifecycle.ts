import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { normalizeSequenceRecord } from '../../domain/constructProperties'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { DocumentDraftLifecycleAdapters } from '../../application/ports/lifecycle'
import type { StoredProjectSummary } from '../../application/ports/projectPersistence'

export type DocumentDraftLifecyclePorts = DocumentDraftLifecycleAdapters & {
  tabId: string
  record: SequenceRecord
  traceFiles: TraceFileRecord[]
  isDirty: boolean
  recordRef: { current: SequenceRecord }
  traceFilesRef: { current: TraceFileRecord[] }
  isDirtyRef: { current: boolean }
  maxUnsavedDrafts: number
  requestExit: (action: () => void | Promise<void>) => void
  shouldOpenInNewWindow: () => boolean
  openRecordInNewTab: (record: SequenceRecord, options: { initiallyUnsaved: boolean }) => void
  restoreInPlace: (record: SequenceRecord) => void
  setStatus: (status: string) => void
}

/**
 * Owns crash-recovery drafts and their open-tab lifetime. The host supplies
 * document mutations; persistence/race invalidation stays outside App.tsx.
 */
export function useDocumentDraftLifecycle(ports: DocumentDraftLifecyclePorts) {
  const portsRef = useRef(ports)
  const [sessionDrafts, setSessionDrafts] = useState<StoredProjectSummary[]>([])
  const writeGenerationRef = useRef(0)
  const suppressPageHideDraftSaveRef = useRef(false)
  const previousStateRef = useRef<{ recordId: string; isDirty: boolean } | null>(null)
  const sessionDraftsRef = useRef(sessionDrafts)

  const refreshSessionDrafts = useCallback(async () => {
    setSessionDrafts(await portsRef.current.listSessionDrafts())
  }, [])

  const refreshSessionDraftsRef = useRef(refreshSessionDrafts)
  const suppressDraftSaveBeforeClose = useCallback(() => {
    suppressPageHideDraftSaveRef.current = true
    // Invalidate a queued save and make any in-flight save's completion clear
    // its draft rather than treating it as the current recovery snapshot.
    writeGenerationRef.current += 1
  }, [])
  useLayoutEffect(() => {
    portsRef.current = ports
    sessionDraftsRef.current = sessionDrafts
    refreshSessionDraftsRef.current = refreshSessionDrafts
  }, [ports, sessionDrafts, refreshSessionDrafts])

  useEffect(() => {
    const generation = ++writeGenerationRef.current
    const draftRecordId = ports.record.id
    const previous = previousStateRef.current
    const becameClean = Boolean(
      previous && previous.recordId === draftRecordId && previous.isDirty && !ports.isDirty,
    )
    previousStateRef.current = { recordId: draftRecordId, isDirty: ports.isDirty }
    if (!ports.isDirty) {
      // Opening a saved source must not erase a recoverable draft. Only the
      // actual dirty -> clean transition invalidates it.
      if (!becameClean) return
      void portsRef.current.clearSessionDraftForRecord(draftRecordId).then(() => {
        if (writeGenerationRef.current === generation) return refreshSessionDraftsRef.current()
      })
      return
    }

    const timer = window.setTimeout(() => {
      if (
        writeGenerationRef.current !== generation
        || !ports.isDirtyRef.current
        || ports.recordRef.current.id !== draftRecordId
      ) return
      // Alignment coordinates are intentionally stale while alignment mode is
      // off; recovery should re-align them when the user enables it.
      const draftTraces = ports.traceFilesRef.current.map((trace) =>
        trace.alignment ? { ...trace, alignment: null } : trace,
      )
      void portsRef.current.saveSessionDraft(
        { ...ports.recordRef.current, traceFiles: draftTraces },
        ports.maxUnsavedDrafts,
      ).then(() => {
        if (
          writeGenerationRef.current === generation
          && ports.isDirtyRef.current
          && ports.recordRef.current.id === draftRecordId
        ) return refreshSessionDraftsRef.current()
        return portsRef.current.clearSessionDraftForRecord(draftRecordId).then(() => refreshSessionDraftsRef.current())
      })
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [ports.isDirty, ports.maxUnsavedDrafts, ports.record, ports.traceFiles, ports.recordRef, ports.isDirtyRef, ports.traceFilesRef])

  useEffect(() => {
    const onPageHide = () => {
      if (!suppressPageHideDraftSaveRef.current && ports.isDirtyRef.current) {
        const draftTraces = ports.traceFilesRef.current.map((trace) =>
          trace.alignment ? { ...trace, alignment: null } : trace,
        )
        void portsRef.current.saveSessionDraft(
          { ...ports.recordRef.current, traceFiles: draftTraces },
          portsRef.current.getMaxUnsavedDrafts(),
        )
      }
      // Deliberately fire-and-forget to preserve unload semantics.
      void portsRef.current.removeOpenTab(ports.tabId)
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [ports.tabId, ports.recordRef, ports.traceFilesRef, ports.isDirtyRef])

  const restoreSessionDraft = useCallback((draftId: string) => {
    if (portsRef.current.shouldOpenInNewWindow()) {
      void (async () => {
        const draft = await portsRef.current.getSessionDraft(draftId)
        if (!draft) {
          portsRef.current.setStatus('That draft is no longer available.')
          await refreshSessionDraftsRef.current()
          return
        }
        const normalized = normalizeSequenceRecord(draft.record)
        portsRef.current.openRecordInNewTab(normalized, { initiallyUnsaved: true })
        portsRef.current.setStatus(`Opened unsaved work on ${normalized.name} in a new window.`)
      })()
      return
    }
    portsRef.current.requestExit(async () => {
      const draft = await portsRef.current.getSessionDraft(draftId)
      if (!draft) {
        portsRef.current.setStatus('That draft is no longer available.')
        await refreshSessionDraftsRef.current()
        return
      }
      const normalized = normalizeSequenceRecord(draft.record)
      portsRef.current.restoreInPlace(normalized)
      portsRef.current.setStatus(`Recovered unsaved work on ${normalized.name}.`)
    })
  }, [])

  const discardSessionDraft = useCallback((draftId: string) => {
    void portsRef.current.deleteSessionDraft(draftId).then(async () => {
      await refreshSessionDraftsRef.current()
      portsRef.current.setStatus('Discarded auto-saved draft.')
    })
  }, [])

  return {
    sessionDrafts,
    sessionDraftsRef,
    refreshSessionDrafts,
    refreshSessionDraftsRef,
    restoreSessionDraft,
    discardSessionDraft,
    suppressDraftSaveBeforeClose,
  }
}
