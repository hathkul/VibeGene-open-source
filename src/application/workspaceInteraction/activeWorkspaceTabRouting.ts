import {
  isWorkspaceTabAvailable,
  preferredDefaultWorkspaceTab,
  type MoleculeWorkspaceTab,
} from '../../domain/moleculeCapabilities'
import type { SequenceRecord } from '../../domain/types'

export type ActiveWorkspaceTabRecord = Pick<SequenceRecord, 'molecule' | 'dna' | 'sequence' | 'features'>

/** Next workspace tab when routing is required, or null when activeTab should stay. */
export function resolveActiveWorkspaceTabTransition(input: {
  activeTab: MoleculeWorkspaceTab
  record: ActiveWorkspaceTabRecord
  traceDocument: boolean
}): MoleculeWorkspaceTab | null {
  if (input.traceDocument) {
    return input.activeTab !== 'Sequence' ? 'Sequence' : null
  }
  if (!isWorkspaceTabAvailable(input.activeTab, input.record)) {
    return preferredDefaultWorkspaceTab(input.record)
  }
  return null
}
