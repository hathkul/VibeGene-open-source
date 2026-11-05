import type { NativeAppMenuEnabledState } from '../../application/ports/nativeMenu'
import type { DisplaySettings, WorkspaceTab } from '../sequence'
import type { SequenceRecord } from '../../domain/types'
import type { WorkspaceDocumentBinding } from '../../domain/projectSaveSemantics'

export type NativeMenuEnabledInputs = {
  record: Pick<SequenceRecord, 'name' | 'molecule' | 'sequence' | 'topology' | 'protein'>
  documentSaveBinding: WorkspaceDocumentBinding
  canCreateFromSelection: boolean
  canConvertToLibrary: boolean
  canUndo: boolean
  canRedo: boolean
  canCopySelection: boolean
  canCopyTranslation: boolean
  hasSelection: boolean
  canInvertSelection: boolean
  canCropLibrary: boolean
  canRenameFile: boolean
  enzymesVisible: boolean
  canSaveEnzymeSet: boolean
  hasFeatureSelected: boolean
  canMergeFeatures: boolean
  canCloneSgRna: boolean
  canExciseSgRnaRegion?: boolean
  canExportSgRnas: boolean
  hasSelectionRange: boolean
  hasSelectionPoint: boolean
  canRemoveCleavageSite: boolean
  canShowSelectedFeatures: boolean
  canHideSelectedFeatures: boolean
  hasPrimerSelected: boolean
  canShowSelectedPrimers: boolean
  canHideSelectedPrimers: boolean
  activeTab: WorkspaceTab
  displaySettings: DisplaySettings
  effectiveDescriptionPanelVisible: boolean
  traceDocument: boolean
}

export function buildNativeMenuEnabledState(input: NativeMenuEnabledInputs): NativeAppMenuEnabledState {
  const { record, displaySettings } = input
  return {
    canCreateFromSelection: input.canCreateFromSelection,
    canConvertToLibrary: input.canConvertToLibrary,
    canUndo: input.canUndo,
    canRedo: input.canRedo,
    canCopySelection: input.canCopySelection,
    canCopyTranslation: input.canCopyTranslation,
    hasSequence: record.sequence.length > 0,
    hasSelection: input.hasSelection,
    canInvertSelection: input.canInvertSelection,
    canCropLibrary: input.canCropLibrary,
    isCircular: record.topology === 'circular',
    isLinear: record.topology === 'linear',
    isProteinDocument: record.molecule === 'protein',
    workspaceDocumentBinding: input.documentSaveBinding,
    canRenameFile: input.canRenameFile,
    enzymesVisible: input.enzymesVisible,
    canSaveEnzymeSet: input.canSaveEnzymeSet,
    hasFeatureSelected: input.hasFeatureSelected,
    canMergeFeatures: input.canMergeFeatures,
    canCloneSgRna: input.canCloneSgRna,
    canExciseSgRnaRegion: input.canExciseSgRnaRegion,
    canExportSgRnas: input.canExportSgRnas,
    hasSelectionRange: input.hasSelectionRange,
    hasSelectionPoint: input.hasSelectionPoint,
    canRemoveCleavageSite: input.canRemoveCleavageSite,
    canShowSelectedFeatures: input.canShowSelectedFeatures,
    canHideSelectedFeatures: input.canHideSelectedFeatures,
    hasPrimerSelected: input.hasPrimerSelected,
    canShowSelectedPrimers: input.canShowSelectedPrimers,
    canHideSelectedPrimers: input.canHideSelectedPrimers,
    activeTab: input.activeTab,
    alignmentsVisible: displaySettings.alignments.visible,
    descriptionPanelVisible: input.effectiveDescriptionPanelVisible,
    canToggleDescriptionPanel: !input.traceDocument,
    featuresVisible: displaySettings.features.visible,
    featureLabelsVisible: displaySettings.features.labelsVisible,
    proteinColorsVisible: displaySettings.proteinColors.enabled,
    proteinVisualControlsVisible: displaySettings.alignments.visible
      ? displaySettings.proteinAlignmentVisual.panelOpen
      : input.activeTab === 'Map'
        ? displaySettings.proteinMapVisual.panelOpen
        : displaySettings.proteinSequenceVisual.panelOpen,
    hasProteinVariableRegions: (record.protein?.comparisonVariableRegions?.length ?? 0) > 0,
    isReadOnlyDocument: input.traceDocument,
  }
}
