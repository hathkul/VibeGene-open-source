import { useCallback, useMemo } from 'react'
import {
  executeSharedFragmentDismiss,
  executeSharedFragmentInsert,
  type PendingSharedFragmentRef,
} from '../../application/workspaceBrowserSupport/sharedFragmentCommandPlan'
import {
  isNativeNewWorkspaceWindowOpened,
  NEW_VIBEGENE_WINDOW_OPENED_STATUS,
  planKofiSupportErrorStatus,
  planKofiSupportOpenedStatus,
  planNewVibegeneWindowBrowserStatus,
  planNewWorkspaceBrowserUrl,
} from '../../application/workspaceBrowserSupport/workspaceBrowserSupportPlan'
import type { SharedFragment } from '../../crossTab/types'

export type WorkspaceBrowserSupportPorts = {
  openExternalUrl: (url: string) => Promise<boolean>
  tryOpenNativeNewWindow: () => Promise<false | 'focused' | 'opened'>
  openBrowserTab: (url: string) => boolean
  readBrowserLocation: () => { origin: string; pathname: string }
  clearSharedFragmentStorage: (fragmentId: string) => void
}

export type WorkspaceBrowserSupportInput = {
  kofiSupportUrl: string
  pendingSharedFragment: SharedFragment | null
  setPendingSharedFragment: (fragment: SharedFragment | null) => void
  selectedRange: { start: number; end: number } | null
  cutStrandSelection: unknown
  insertSequenceBases: (sequence: string) => boolean
  setStatus: (status: string) => void
}

function toPendingRef(fragment: SharedFragment): PendingSharedFragmentRef {
  return {
    id: fragment.id,
    fromRecordName: fragment.fromRecordName,
    sequence: fragment.sequence,
  }
}

/** Ko-fi support, browser/native new-window commands, and shared-fragment insert/dismiss. */
export function useWorkspaceBrowserSupportController(
  input: WorkspaceBrowserSupportInput,
  ports: WorkspaceBrowserSupportPorts,
) {
  const {
    kofiSupportUrl,
    pendingSharedFragment,
    setPendingSharedFragment,
    selectedRange,
    cutStrandSelection,
    insertSequenceBases,
    setStatus,
  } = input

  const canInsertSharedFragment = useMemo(
    () => Boolean(pendingSharedFragment && selectedRange && !cutStrandSelection),
    [cutStrandSelection, pendingSharedFragment, selectedRange],
  )

  const fragmentPorts = useMemo(
    () => ({
      insertSequence: insertSequenceBases,
      clearPending: () => setPendingSharedFragment(null),
      clearStorage: ports.clearSharedFragmentStorage,
      setStatus,
    }),
    [insertSequenceBases, setPendingSharedFragment, setStatus, ports.clearSharedFragmentStorage],
  )

  const openKofiSupport = useCallback(() => {
    void ports
      .openExternalUrl(kofiSupportUrl)
      .then((opened) => {
        setStatus(planKofiSupportOpenedStatus(opened))
      })
      .catch((error) => {
        setStatus(planKofiSupportErrorStatus(error))
      })
  }, [kofiSupportUrl, setStatus, ports])

  const openNewVibegeneWindow = useCallback(() => {
    void ports.tryOpenNativeNewWindow().then((openedNative) => {
      if (isNativeNewWorkspaceWindowOpened(openedNative)) {
        setStatus(NEW_VIBEGENE_WINDOW_OPENED_STATUS)
        return
      }
      const { origin, pathname } = ports.readBrowserLocation()
      const url = planNewWorkspaceBrowserUrl(origin, pathname)
      const opened = ports.openBrowserTab(url)
      setStatus(planNewVibegeneWindowBrowserStatus(opened))
    })
  }, [setStatus, ports])

  const insertPendingSharedFragment = useCallback(() => {
    executeSharedFragmentInsert(
      pendingSharedFragment ? toPendingRef(pendingSharedFragment) : null,
      fragmentPorts,
    )
  }, [fragmentPorts, pendingSharedFragment])

  const dismissPendingSharedFragment = useCallback(() => {
    executeSharedFragmentDismiss(
      pendingSharedFragment ? toPendingRef(pendingSharedFragment) : null,
      fragmentPorts,
    )
  }, [fragmentPorts, pendingSharedFragment])

  return {
    canInsertSharedFragment,
    openKofiSupport,
    openNewVibegeneWindow,
    insertPendingSharedFragment,
    dismissPendingSharedFragment,
  }
}
