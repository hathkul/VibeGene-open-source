import type { MoleculeWorkspaceTab } from '../../domain/moleculeCapabilities'

export type WorkspaceTabSelectPorts = {
  setActiveTab: (tab: MoleculeWorkspaceTab) => void
  setMobileSearchOpen: (open: boolean | ((open: boolean) => boolean)) => void
}

/** App composition-root wiring for tab changes: activate tab, then close mobile search. */
export function createWorkspaceTabSelectHandler(ports: WorkspaceTabSelectPorts) {
  return (tab: MoleculeWorkspaceTab) => {
    ports.setActiveTab(tab)
    ports.setMobileSearchOpen(false)
  }
}
