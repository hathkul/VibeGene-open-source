import { describe, expect, it } from 'vitest'
import { defaultDisplaySettings } from '../sequence'
import { buildNativeMenuEnabledState, type NativeMenuEnabledInputs } from './nativeMenuEnabledState'

function inputs(overrides: Partial<NativeMenuEnabledInputs> = {}): NativeMenuEnabledInputs {
  return {
    record: { name: 'DNA', molecule: 'dna', sequence: 'ACGT', topology: 'circular', protein: undefined },
    documentSaveBinding: 'disk',
    canCreateFromSelection: false,
    canConvertToLibrary: false,
    canUndo: false,
    canRedo: false,
    canCopySelection: false,
    canCopyTranslation: false,
    hasSelection: false,
    canInvertSelection: false,
    canCropLibrary: false,
    canRenameFile: false,
    enzymesVisible: true,
    canSaveEnzymeSet: false,
    hasFeatureSelected: false,
    canMergeFeatures: false,
    canCloneSgRna: false,
    canExportSgRnas: false,
    hasSelectionRange: false,
    hasSelectionPoint: false,
    canRemoveCleavageSite: false,
    canShowSelectedFeatures: false,
    canHideSelectedFeatures: false,
    hasPrimerSelected: false,
    canShowSelectedPrimers: false,
    canHideSelectedPrimers: false,
    activeTab: 'Map',
    displaySettings: defaultDisplaySettings,
    effectiveDescriptionPanelVisible: true,
    traceDocument: false,
    ...overrides,
  }
}

describe('buildNativeMenuEnabledState', () => {
  it('derives DNA topology, sequence and display state from explicit inputs', () => {
    const state = buildNativeMenuEnabledState(inputs({ hasSelection: true, canUndo: true }))
    expect(state).toMatchObject({
      hasSequence: true,
      hasSelection: true,
      canUndo: true,
      isCircular: true,
      isLinear: false,
      isProteinDocument: false,
      alignmentsVisible: defaultDisplaySettings.alignments.visible,
    })
  })

  it('derives protein-variable and active visual-panel state', () => {
    const displaySettings = {
      ...defaultDisplaySettings,
      alignments: { ...defaultDisplaySettings.alignments, visible: true },
      proteinAlignmentVisual: { ...defaultDisplaySettings.proteinAlignmentVisual, panelOpen: true },
    }
    const state = buildNativeMenuEnabledState(inputs({
      record: {
        name: 'Protein',
        molecule: 'protein',
        sequence: 'MPEPTIDE',
        topology: 'linear',
        protein: { numberingStart: 1, numberingRegions: [], bonds: [], comparisonVariableRegions: [{ id: 'region-1', start: 1, end: 3 }] },
      },
      activeTab: 'Sequence',
      displaySettings,
    }))
    expect(state).toMatchObject({
      isProteinDocument: true,
      isLinear: true,
      isCircular: false,
      hasProteinVariableRegions: true,
      proteinVisualControlsVisible: true,
    })
  })

  it('disables description toggling for trace documents', () => {
    const state = buildNativeMenuEnabledState(inputs({ traceDocument: true }))
    expect(state).toMatchObject({ isReadOnlyDocument: true, canToggleDescriptionPanel: false })
  })

  it('forwards every native command guard from the App-supplied inputs', () => {
    const state = buildNativeMenuEnabledState(inputs({
      documentSaveBinding: 'database', canCreateFromSelection: true, canConvertToLibrary: true,
      canUndo: true, canRedo: true, canCopySelection: true, canCopyTranslation: true,
      hasSelection: true, canInvertSelection: true, canCropLibrary: true, canRenameFile: true,
      enzymesVisible: false, canSaveEnzymeSet: true, hasFeatureSelected: true, canMergeFeatures: true,
      canCloneSgRna: true, canExportSgRnas: true, hasSelectionRange: true, hasSelectionPoint: true,
      canRemoveCleavageSite: true, canShowSelectedFeatures: true, canHideSelectedFeatures: true,
      hasPrimerSelected: true, canShowSelectedPrimers: true, canHideSelectedPrimers: true,
      activeTab: 'History', effectiveDescriptionPanelVisible: false,
    }))
    expect(state).toMatchObject({
      workspaceDocumentBinding: 'database', canCreateFromSelection: true, canConvertToLibrary: true,
      canUndo: true, canRedo: true, canCopySelection: true, canCopyTranslation: true, hasSelection: true,
      canInvertSelection: true, canCropLibrary: true, canRenameFile: true, enzymesVisible: false,
      canSaveEnzymeSet: true, hasFeatureSelected: true, canMergeFeatures: true, canCloneSgRna: true,
      canExportSgRnas: true, hasSelectionRange: true, hasSelectionPoint: true, canRemoveCleavageSite: true,
      canShowSelectedFeatures: true, canHideSelectedFeatures: true, hasPrimerSelected: true,
      canShowSelectedPrimers: true, canHideSelectedPrimers: true, activeTab: 'History',
      descriptionPanelVisible: false,
    })
  })
})
