import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { attachProteinSourceRecords } from '../../domain/proteinSourceHandoff'
import { normalizeSequenceRecord } from '../../domain/constructProperties'
import type { SequenceRecord } from '../../domain/types'
import type { TraceFileRecord } from '../../domain/traceTypes'
import { formatSequenceLength } from '../../domain/moleculeCapabilities'

export type BootHandoffMountLifecycleBootInput = {
  bootOpenedFromHandoff: boolean
  bootSourceHydrationPending: boolean
  pendingIdbHandoffKey: string | null
  bootRecord: SequenceRecord
  bootInitiallyUnsaved: boolean
}

export type BootHandoffMountLifecyclePorts = {
  hydrateProteinSources: () => Promise<
    import('../../domain/proteinSourceHandoff').DetachedProteinSourceRecord[]
  >
  clearHistoryBootQueryParams: () => void
  setStatus: (status: string) => void
}

export type BootHandoffMountLifecycleRefs = {
  recordRef: MutableRefObject<SequenceRecord>
  setRecordRef: MutableRefObject<(record: SequenceRecord) => void>
  applySavedBaselineRef: MutableRefObject<(record: SequenceRecord, traces: TraceFileRecord[]) => void>
}

/** Post-mount history query cleanup and lazy protein source hydration after boot handoff. */
export function useBootHandoffMountLifecycle(
  bootInput: BootHandoffMountLifecycleBootInput,
  refs: BootHandoffMountLifecycleRefs,
  ports: BootHandoffMountLifecyclePorts,
) {
  const portsRef = useRef(ports)
  useLayoutEffect(() => {
    portsRef.current = ports
  })

  const {
    bootOpenedFromHandoff,
    bootSourceHydrationPending,
    pendingIdbHandoffKey,
    bootRecord,
    bootInitiallyUnsaved,
  } = bootInput
  const { recordRef, setRecordRef, applySavedBaselineRef } = refs

  useEffect(() => {
    if (!bootOpenedFromHandoff) return

    portsRef.current.clearHistoryBootQueryParams()

    if (!bootSourceHydrationPending || !pendingIdbHandoffKey) return

    let cancelled = false
    let timeoutId: ReturnType<typeof window.setTimeout> | undefined
    const loaded = bootRecord

    const rafId = window.requestAnimationFrame(() => {
      if (cancelled) return
      timeoutId = window.setTimeout(() => {
        if (cancelled) return
        void portsRef.current
          .hydrateProteinSources()
          .then((detached) => {
            if (cancelled) return
            const current = recordRef.current.id === loaded.id ? recordRef.current : loaded
            const hydrated = normalizeSequenceRecord(attachProteinSourceRecords(current, detached))
            setRecordRef.current(hydrated)
            if (!bootInitiallyUnsaved) {
              applySavedBaselineRef.current(hydrated, hydrated.traceFiles ?? [])
            }
            portsRef.current.setStatus(
              `Opened ${hydrated.name} (${formatSequenceLength(hydrated.sequence.length, hydrated.molecule)}).`,
            )
          })
          .catch((error) => {
            if (!cancelled) {
              portsRef.current.setStatus(
                error instanceof Error ? error.message : 'Source DNA history could not be loaded.',
              )
            }
          })
      }, 0)
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(rafId)
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [
    applySavedBaselineRef,
    bootInitiallyUnsaved,
    bootOpenedFromHandoff,
    bootRecord,
    bootSourceHydrationPending,
    pendingIdbHandoffKey,
    recordRef,
    setRecordRef,
  ])
}
