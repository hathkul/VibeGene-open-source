import { useEffect } from 'react'
import type { WorkspaceTab } from '../sequence'

export type MembersTabCloseLifecycleInput = {
  activeTab: WorkspaceTab
  setMembersAddMenuOpen: (open: boolean) => void
  setEditingMemberNameId: (id: string | null) => void
}

/** Resets Members-pane transient UI when leaving the Members tab. */
export function useMembersTabCloseLifecycle(input: MembersTabCloseLifecycleInput) {
  const { activeTab, setMembersAddMenuOpen, setEditingMemberNameId } = input
  useEffect(() => {
    if (activeTab === 'Members') return
    setMembersAddMenuOpen(false)
    setEditingMemberNameId(null)
  }, [activeTab, setEditingMemberNameId, setMembersAddMenuOpen])
}
