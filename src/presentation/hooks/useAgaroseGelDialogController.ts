import { useCallback, useState } from 'react'
import {
  planAgaroseGelDialogSnapshot,
  type AgaroseGelDialogOpenOverrides,
  type AgaroseGelDialogSnapshot,
} from '../../application/agaroseGel/agaroseGelDialogOpenPlan'
import { nowMs } from '../../domain/sequence'
import type { TraceFileRecord } from '../../domain/traceTypes'
import type { SequenceRecord } from '../../domain/types'

export type AgaroseGelDialogHybridPort = {
  tryOpenAgaroseGelHybridWindow: (snapshot: AgaroseGelDialogSnapshot) => Promise<boolean>
}

export type AgaroseGelDialogControllerInput = {
  record: SequenceRecord
  tabId: string
  traceFiles: TraceFileRecord[]
  selectedLibraryMemberIds: string[]
}

/** Agarose gel dialog retained snapshot, hybrid-first open, and close. */
export function useAgaroseGelDialogController(
  input: AgaroseGelDialogControllerInput,
  ports: AgaroseGelDialogHybridPort,
) {
  const [agaroseGelOpen, setAgaroseGelOpen] = useState(false)
  const [agaroseGelSnapshot, setAgaroseGelSnapshot] = useState<AgaroseGelDialogSnapshot | null>(null)

  const openAgaroseGelWindow = useCallback((overrides?: AgaroseGelDialogOpenOverrides) => {
    const snapshot = planAgaroseGelDialogSnapshot({
      workspaceRecord: input.record,
      currentTabId: input.tabId,
      openedAt: nowMs(),
      traceFiles: input.traceFiles,
      selectedLibraryMemberIds: input.selectedLibraryMemberIds,
      overrides,
    })
    void ports.tryOpenAgaroseGelHybridWindow(snapshot).then((opened) => {
      if (!opened) {
        setAgaroseGelSnapshot(snapshot)
        setAgaroseGelOpen(true)
      }
    })
  }, [input.record, input.tabId, input.traceFiles, input.selectedLibraryMemberIds, ports])

  const closeAgaroseGel = useCallback(() => {
    setAgaroseGelOpen(false)
    setAgaroseGelSnapshot(null)
  }, [])

  return {
    agaroseGelOpen,
    agaroseGelSnapshot,
    openAgaroseGelWindow,
    closeAgaroseGel,
  }
}
