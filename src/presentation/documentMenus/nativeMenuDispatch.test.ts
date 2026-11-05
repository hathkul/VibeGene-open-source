import { describe, expect, it, vi } from 'vitest'
import { defaultDisplaySettings } from '../sequence'
import type { NativeAppMenuAction } from '../../application/ports/nativeMenu'
import type { SelectionRange } from '../sequence'
import type { NativeMenuCommands, NativeMenuState } from './useNativeAppMenuController'
import { dispatchNativeMenuAction } from './useNativeAppMenuController'

function state(overrides: Partial<NativeMenuState> = {}): NativeMenuState {
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
    nucleotideStrands: true,
    selectedRange: null,
    enzymeTabCaretPosition: 0,
    ...overrides,
  }
}

function commands(overrides: Partial<NativeMenuCommands> = {}): NativeMenuCommands {
  const noop = () => undefined
  const asyncNoop = async () => undefined
  return {
    setStatus: noop,
    restoreDraftAt: noop,
    openRecentAt: noop,
    requestNativeQuit: noop,
    setWhatsNewOpen: noop,
    setAboutOpen: noop,
    setDnaLibraryHelpOpen: noop,
    setHistoryDerivedWorkflowsHelpOpen: noop,
    setDatabaseHelpOpen: noop,
    setCrisprWorkflowHelpOpen: noop,
    setAlignmentsHelpOpen: noop,
    setKeyboardShortcutsOpen: noop,
    openKofiSupport: noop,
    openSourceRepository: noop,
    openTelegramGroup: noop,
    setBugReportOpen: noop,
    openFilePicker: noop,
    handleSave: asyncNoop,
    handleSaveToDatabase: asyncNoop,
    openRenameFileDialog: noop,
    openNewDnaFileWindow: noop,
    openNewDnaLibraryPicker: noop,
    openConvertToLibraryPicker: noop,
    openNewProteinFileDialog: noop,
    setSequenceDatabaseImportOpen: noop,
    handleNewFileFromSelection: noop,
    handleExportSnapGene: asyncNoop,
    handleSaveDiskFile: asyncNoop,
    handleExportGenBank: asyncNoop,
    handleExportFasta: asyncNoop,
    openNewVibegeneWindow: noop,
    openDatabaseWindow: noop,
    openPreferencesWindow: noop,
    handleUndo: noop,
    handleRedo: noop,
    writeClipboardText: asyncNoop,
    copyTopStrand: noop,
    copyBottomStrand53: noop,
    copyBottomStrand35: noop,
    copyTranslation: noop,
    setSelectRangeOpen: noop,
    invertSelection: noop,
    cropDnaLibraryToSelection: noop,
    changeSelectionCase: noop,
    activateUserDnaColors: noop,
    handleToggleTopologyAtOrigin: noop,
    handleFlipSequence: noop,
    setDnaEndsEditorOpen: noop,
    handleSetOrigin: noop,
    setActiveTab: noop,
    setEditMapLabelOpen: noop,
    toggleAlignments: noop,
    setDescriptionPanelVisible: noop,
    setDisplaySettings: noop,
    openFeatureEditorFromSelection: noop,
    addProteinBond: noop,
    openProteinUniProtAnnotation: noop,
    markSelectedProteinVariable: noop,
    clearProteinVariableRegions: noop,
    annotateAutoProteinBinder: noop,
    openTranslationOptions: noop,
    enzymeMenuOpenChoose: noop,
    enzymeMenuSelectSet: noop,
    enzymeMenuToggleVisibility: noop,
    enzymeMenuOpenSaveSet: noop,
    enzymeMenuExportSet: noop,
    setManageEnzymeSetsOpen: noop,
    setEnzymePrioritiesOpen: noop,
    setEnzymeMenuNoncuttersOpen: noop,
    openRandomEnzymeInfo: noop,
    addFeature: noop,
    editSelectedFeature: noop,
    duplicateSelectedFeature: noop,
    deleteSelectedFeature: noop,
    createFeatureSegment: noop,
    deleteFeatureSegment: noop,
    mergeFeatureSegments: noop,
    openFeatureMergeTemplateDialog: noop,
    addCleavageSite: noop,
    removeCleavageSite: noop,
    openFeatureColorEditor: noop,
    showSelectedFeatures: noop,
    hideSelectedFeatures: noop,
    setFeaturesImportFromFileOpen: noop,
    setExportFeatureDataOpen: noop,
    spliceToRemoveIntrons: noop,
    detectCommonFeaturesInDocument: asyncNoop,
    detectCrisprInDocument: asyncNoop,
    openAddSgRna: noop,
    openCloneSgRna: noop,
    exportSelectedSgRnas: noop,
    openGuideScanDesign: noop,
    openDnaDatabaseAnnotation: noop,
    setTranslatedOrfAnnotationRange: noop,
    addSelectedFeatureToCommonFeatures: noop,
    openCommonFeaturesBrowser: asyncNoop,
    openAddPrimerFromMenu: noop,
    openEditSelectedPrimers: noop,
    duplicateSelectedPrimers: noop,
    removeSelectedPrimers: noop,
    openPrimerColorPicker: noop,
    setHybridizationParamsOpen: noop,
    openPickPrimers: noop,
    showSelectedPrimers: noop,
    hideSelectedPrimers: noop,
    setPrimersImportFromFileOpen: noop,
    openPrimerListPicker: noop,
    detectCommonPrimersInDocument: asyncNoop,
    addSelectedPrimersToCommonLibrary: asyncNoop,
    exportSelectedPrimers: noop,
    openRestrictionCloning: noop,
    openGibsonAssembly: noop,
    openTaGcCloning: noop,
    openGatewayCloning: noop,
    openRetainedPcr: noop,
    openRetainedMutagenesis: noop,
    openAgaroseGelWindow: asyncNoop,
    setDnaMwOpen: noop,
    openLetterCodesWindow: noop,
    openGeneticCodeTablesWindow: noop,
    handleDownloadSettingsFile: noop,
    openSettingsFilePicker: noop,
    ...overrides,
  }
}

describe('dispatchNativeMenuAction', () => {
  it('routes the source repository action', () => {
    const openSourceRepository = vi.fn()
    dispatchNativeMenuAction('help.source-code', state(), commands({ openSourceRepository }))
    expect(openSourceRepository).toHaveBeenCalledOnce()
  })
  it('routes the Telegram group action', () => {
    const openTelegramGroup = vi.fn()
    dispatchNativeMenuAction('help.telegram-group', state(), commands({ openTelegramGroup }))
    expect(openTelegramGroup).toHaveBeenCalledOnce()
  })
  it('routes indexed and tagged dynamic actions', () => {
    const restoreDraftAt = vi.fn()
    const openRecentAt = vi.fn()
    const detectCommonPrimersInDocument = vi.fn()
    const base = commands({ restoreDraftAt, openRecentAt, detectCommonPrimersInDocument })
    dispatchNativeMenuAction('drafts.restore.2', state(), base)
    dispatchNativeMenuAction('recent.open.4', state(), base)
    dispatchNativeMenuAction('primers.detect-common.tag:screening', state(), base)
    expect(restoreDraftAt).toHaveBeenCalledWith(2)
    expect(openRecentAt).toHaveBeenCalledWith(4)
    expect(detectCommonPrimersInDocument).toHaveBeenCalledWith({ tag: 'screening' })
  })

  it('ignores malformed indexed actions instead of coercing them', () => {
    const restoreDraftAt = vi.fn()
    const openRecentAt = vi.fn()
    const base = commands({ restoreDraftAt, openRecentAt })
    for (const action of ['drafts.restore.', 'drafts.restore.-1', 'drafts.restore.2.extra', 'recent.open.', 'recent.open.+1']) {
      dispatchNativeMenuAction(action as NativeAppMenuAction, state(), base)
    }
    expect(restoreDraftAt).not.toHaveBeenCalled()
    expect(openRecentAt).not.toHaveBeenCalled()
  })

  it('guards trace mutation and non-nucleotide actions', () => {
    const setStatus = vi.fn()
    const handleSave = vi.fn()
    const base = commands({ setStatus, handleSave })
    dispatchNativeMenuAction('file.save', state({ traceDocument: true }), base)
    expect(handleSave).not.toHaveBeenCalled()
    expect(setStatus).toHaveBeenCalledWith(expect.stringContaining('read-only'))
    setStatus.mockClear()
    dispatchNativeMenuAction('edit.flip-sequence', state({ nucleotideStrands: false, record: { name: 'Protein', molecule: 'protein', sequence: 'M', topology: 'linear', protein: undefined } }), base)
    expect(setStatus).toHaveBeenCalledWith(expect.stringContaining('protein'))
  })

  it('dispatches CRISPR excision and blocks it for read-only traces', () => {
    const openCrisprExcision = vi.fn()
    const base = commands({ openCrisprExcision })
    dispatchNativeMenuAction('crispr.excise-region', state(), base)
    dispatchNativeMenuAction('crispr.excise-region', state({ traceDocument: true }), base)
    expect(openCrisprExcision).toHaveBeenCalledTimes(1)
  })

  it('copies the selected protein range as raw sequence and FASTA', () => {
    const writeClipboardText = vi.fn()
    const setStatus = vi.fn()
    const base = commands({ writeClipboardText, setStatus })
    const protein = state({
      record: { name: 'Protein', molecule: 'protein', sequence: 'MPEPTIDE', topology: 'linear', protein: undefined },
      nucleotideStrands: false,
      selectedRange: { start: 1, end: 4 } satisfies SelectionRange,
    })
    dispatchNativeMenuAction('edit.copy-top', protein, base)
    dispatchNativeMenuAction('edit.copy-translation', protein, base)
    expect(writeClipboardText).toHaveBeenNthCalledWith(1, 'PEP')
    expect(writeClipboardText).toHaveBeenNthCalledWith(2, '>Protein\nPEP')
    expect(setStatus).toHaveBeenLastCalledWith('Copied 3 aa as FASTA.')
  })

  it('routes tabs and async file commands', () => {
    const setActiveTab = vi.fn()
    const handleExportFasta = vi.fn(async () => undefined)
    const base = commands({ setActiveTab, handleExportFasta })
    dispatchNativeMenuAction('view.tab.sequence', state(), base)
    dispatchNativeMenuAction('file.save-fasta', state(), base)
    expect(setActiveTab).toHaveBeenCalledWith('Sequence')
    expect(handleExportFasta).toHaveBeenCalled()
  })
})
