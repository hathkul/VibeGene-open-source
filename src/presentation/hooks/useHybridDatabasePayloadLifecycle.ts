import { useEffect, useLayoutEffect, useRef } from 'react'
import type { HybridDatabasePayloadLifecycleAdapters } from '../../application/ports/lifecycle'

export type HybridDatabasePayloadLifecyclePorts = HybridDatabasePayloadLifecycleAdapters & {
  isNativeDesktop: boolean
  currentRecordId: string
  alignmentPick: unknown
  libraryMemberPick: unknown
}

/** Mirrors the open workspace record and database picks into hybrid window storage. */
export function useHybridDatabasePayloadLifecycle(ports: HybridDatabasePayloadLifecyclePorts) {
  const portsRef = useRef(ports)
  useLayoutEffect(() => {
    portsRef.current = ports
  }, [ports])

  const { currentRecordId, alignmentPick, libraryMemberPick } = ports

  useEffect(() => {
    const currentPorts = portsRef.current
    if (!currentPorts.isNativeDesktop) return
    currentPorts.writeHybridDatabasePayload({
      currentRecordId,
      alignmentPick,
      libraryMemberPick,
      constructPick: currentPorts.readHybridDatabaseConstructPick() ?? null,
    })
    void currentPorts.notifyHybridDatabasePayloadUpdated()
  }, [currentRecordId, alignmentPick, libraryMemberPick])
}
