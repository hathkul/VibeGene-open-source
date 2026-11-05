import type { MoleculeWorkspaceTab } from '../../domain/moleculeCapabilities'
import type { SequenceRecord } from '../../domain/types'

export type WorkspaceTabBarModel = {
  tabs: readonly MoleculeWorkspaceTab[]
  activeTab: MoleculeWorkspaceTab
  mobileSearchOpen: boolean
  searchQuery: string
  searchPlaceholder: string
  searchHitCountLabel: string
  searchHitPositionLabel: string
  searchNavDisabled: boolean
  showSearchNavigation: boolean
  /** Trace-only documents render search controls inside TraceViewer. */
  showSearch: boolean
  showDescriptionPanelToggle: boolean
  descriptionPanelVisible: boolean
}

export type WorkspaceTabBarModelInput = {
  tabs: readonly MoleculeWorkspaceTab[]
  activeTab: MoleculeWorkspaceTab
  mobileSearchOpen: boolean
  searchQuery: string
  molecule: SequenceRecord['molecule']
  traceDocument: boolean
  descriptionPanelVisible: boolean
  searchHitCount: number
  searchHitLabel: string
  searchHitIndex: number
}

function workspaceSearchPlaceholder(
  activeTab: MoleculeWorkspaceTab,
  molecule: SequenceRecord['molecule'],
): string {
  if (activeTab === 'Primers') return 'Find primer name or sequence'
  if (activeTab === 'Enzymes') return 'Find enzyme name or cut sequence'
  if (molecule === 'protein') return 'Find amino acid sequence'
  return 'Find sequence or enzyme'
}

export function buildWorkspaceTabBarModel(input: WorkspaceTabBarModelInput): WorkspaceTabBarModel {
  return {
    tabs: input.tabs,
    activeTab: input.activeTab,
    mobileSearchOpen: input.mobileSearchOpen,
    searchQuery: input.searchQuery,
    searchPlaceholder: workspaceSearchPlaceholder(input.activeTab, input.molecule),
    searchHitCountLabel: `${input.searchHitCount} ${input.searchHitLabel}`,
    searchHitPositionLabel: input.activeTab !== 'Enzymes' && input.searchHitCount > 0
      ? ` · ${input.searchHitIndex + 1}/${input.searchHitCount}`
      : '',
    searchNavDisabled: input.searchHitCount === 0,
    showSearchNavigation: input.activeTab !== 'Enzymes',
    showSearch: !input.traceDocument,
    showDescriptionPanelToggle: !input.traceDocument,
    descriptionPanelVisible: input.descriptionPanelVisible,
  }
}
