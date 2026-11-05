import { useEffect, useLayoutEffect, useRef } from 'react'
import type {
  DatabaseAlignmentPick,
  DatabaseLibraryMemberPick,
  HybridWindowResult,
  PrimerPropertiesPayload,
} from '../../application/ports/hybridWindows'

type DatabaseHybridResultsOptions = {
  enabled: boolean
  recordId: string
  libraryMemberPick: DatabaseLibraryMemberPick | null
  subscribeResults: (
    handler: (result: HybridWindowResult) => void | Promise<void>,
  ) => Promise<() => void>
  openPrimerProperties: (primer: PrimerPropertiesPayload) => Promise<boolean>
  setStatus: (message: string) => void
  addDatabasePrimers: (primers: Extract<HybridWindowResult, { kind: 'database'; type: 'add-primers' }>['primers']) => void
  addToAlignment: (mode: DatabaseAlignmentPick['mode'], constructs: Extract<HybridWindowResult, { kind: 'database'; type: 'add-to-alignment' }>['constructs']) => void | Promise<void>
  addLibraryMembers: (projectIds: string[]) => void | Promise<void>
  convertToLibrary: (projectIds: string[]) => void | Promise<void>
  setLibraryPrimer: (primer: PrimerPropertiesPayload) => void
}

/** Routes Database hybrid-window results to the current document without stale callbacks. */
export function useDatabaseHybridResults({
  enabled,
  recordId,
  libraryMemberPick,
  subscribeResults,
  openPrimerProperties,
  setStatus,
  addDatabasePrimers,
  addToAlignment,
  addLibraryMembers,
  convertToLibrary,
  setLibraryPrimer,
}: DatabaseHybridResultsOptions): void {
  const callbacksRef = useRef({
    recordId,
    libraryMemberPick,
    setStatus,
    addDatabasePrimers,
    addToAlignment,
    addLibraryMembers,
    convertToLibrary,
    openPrimerProperties,
    setLibraryPrimer,
  })
  // Update before paint rather than in a passive effect: desktop events arriving
  // immediately after a record/pick change still use the current callbacks.
  useLayoutEffect(() => {
    callbacksRef.current = {
      recordId,
      libraryMemberPick,
      setStatus,
      addDatabasePrimers,
      addToAlignment,
      addLibraryMembers,
      convertToLibrary,
      openPrimerProperties,
      setLibraryPrimer,
    }
  }, [addDatabasePrimers, addLibraryMembers, addToAlignment, convertToLibrary, libraryMemberPick, openPrimerProperties, recordId, setLibraryPrimer, setStatus])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void subscribeResults(async (result) => {
      if (cancelled) return
      const callbacks = callbacksRef.current
      if (result.kind === 'database' && result.type === 'status') {
        callbacks.setStatus(result.message)
        return
      }
      if (result.kind === 'database' && result.type === 'add-primers') {
        if (result.targetRecordId && result.targetRecordId !== callbacks.recordId) return
        callbacks.addDatabasePrimers(result.primers)
        return
      }
      if (result.kind === 'database' && result.type === 'add-to-alignment') {
        if (result.targetRecordId !== callbacks.recordId) return
        await callbacks.addToAlignment(result.mode, result.constructs)
        return
      }
      if (result.kind === 'database' && result.type === 'add-library-members') {
        if (result.targetRecordId !== callbacks.recordId) return
        if (callbacks.libraryMemberPick?.purpose === 'convert') {
          await callbacks.convertToLibrary(result.projectIds)
          return
        }
        await callbacks.addLibraryMembers(result.projectIds)
        return
      }
      if (result.kind === 'database' && result.type === 'open-primer-properties') {
        const opened = await callbacks.openPrimerProperties(result.primer)
        if (!opened) callbacks.setLibraryPrimer(result.primer)
        return
      }
      if (
        (result.kind === 'new-dna-file' || result.kind === 'new-protein-file')
        && result.type === 'status'
      ) {
        callbacks.setStatus(result.message)
      }
    }).then((stop) => {
      if (cancelled) stop()
      else unlisten = stop
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [enabled, subscribeResults])

}
