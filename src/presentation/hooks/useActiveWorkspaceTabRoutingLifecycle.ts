import { useEffect } from 'react'
import { resolveActiveWorkspaceTabTransition } from '../../application/workspaceInteraction/activeWorkspaceTabRouting'
import type { MoleculeCapabilities } from '../../domain/moleculeCapabilities'
import type { SequenceRecord } from '../../domain/types'
import type { WorkspaceTab } from '../sequence'

export type ActiveWorkspaceTabRoutingLifecycleInput = {
  activeTab: WorkspaceTab
  setActiveTab: (tab: WorkspaceTab) => void
  record: SequenceRecord
  traceDocument: unknown
  moleculeCapabilities: Pick<MoleculeCapabilities, 'defaultWorkspaceTab' | 'workspaceTabs'>
}

/** Keeps workspace tab selection valid for trace documents and molecule capabilities. */
export function useActiveWorkspaceTabRoutingLifecycle(input: ActiveWorkspaceTabRoutingLifecycleInput) {
  const {
    activeTab,
    setActiveTab,
    record,
    traceDocument,
    moleculeCapabilities,
  } = input

  useEffect(() => {
    const nextTab = resolveActiveWorkspaceTabTransition({
      activeTab,
      record,
      traceDocument: Boolean(traceDocument),
    })
    if (nextTab) setActiveTab(nextTab)
  }, [
    activeTab,
    moleculeCapabilities.defaultWorkspaceTab,
    moleculeCapabilities.workspaceTabs,
    record,
    setActiveTab,
    traceDocument,
  ])
}
