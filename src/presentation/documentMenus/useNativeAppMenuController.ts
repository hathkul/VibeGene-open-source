import { useCallback, useEffect, useRef } from 'react'
import type { NativeAppMenuAction, NativeAppMenuEnabledState } from '../../application/ports/nativeMenu'
import { isTraceDocumentMutationAction } from '../../application/traceDocument'
import type { DisplaySettings, EnzymeSetMode, SelectionRange, WorkspaceTab } from '../sequence'
import type { NativeMenuEnabledInputs } from './nativeMenuEnabledState'
import { buildNativeMenuEnabledState } from './nativeMenuEnabledState'

type AsyncCommand = () => void | Promise<unknown>
type Setter<T> = (value: T | ((current: T) => T)) => void

export type NativeMenuState = NativeMenuEnabledInputs & {
  nucleotideStrands: boolean
  selectedRange: SelectionRange | null
  enzymeTabCaretPosition: number
}

export type NativeMenuCommands = {
  setStatus: (status: string) => void
  restoreDraftAt: (index: number) => void
  openRecentAt: (index: number) => void
  requestNativeQuit: () => void
  setWhatsNewOpen: (open: boolean) => void
  setAboutOpen: (open: boolean) => void
  setDnaLibraryHelpOpen: (open: boolean) => void
  setHistoryDerivedWorkflowsHelpOpen: (open: boolean) => void
  setDatabaseHelpOpen: (open: boolean) => void
  setCrisprWorkflowHelpOpen: (open: boolean) => void
  setAlignmentsHelpOpen: (open: boolean) => void
  setKeyboardShortcutsOpen: (open: boolean) => void
  openKofiSupport: () => void
  openSourceRepository: () => void
  openTelegramGroup: () => void
  setBugReportOpen: (open: boolean) => void
  openFilePicker: () => void
  handleSave: AsyncCommand
  handleSaveToDatabase: AsyncCommand
  openRenameFileDialog: () => void
  openNewDnaFileWindow: () => void
  openNewDnaLibraryPicker: () => void
  openConvertToLibraryPicker: () => void
  openNewProteinFileDialog: () => void
  setSequenceDatabaseImportOpen: (open: boolean) => void
  handleNewFileFromSelection: () => void
  handleExportSnapGene: AsyncCommand
  handleSaveDiskFile: (options: { forceDialog: boolean }) => void | Promise<unknown>
  handleExportGenBank: AsyncCommand
  handleExportFasta: AsyncCommand
  openNewVibegeneWindow: () => void
  openDatabaseWindow: () => void
  openPreferencesWindow: () => void
  handleUndo: () => void
  handleRedo: () => void
  writeClipboardText: (text: string) => void | Promise<void>
  copyTopStrand: () => void
  copyBottomStrand53: () => void
  copyBottomStrand35: () => void
  copyTranslation: () => void
  setSelectRangeOpen: (open: boolean) => void
  invertSelection: () => void
  cropDnaLibraryToSelection: () => void
  changeSelectionCase: (upper: boolean) => void
  activateUserDnaColors: () => void
  handleToggleTopologyAtOrigin: () => void
  handleFlipSequence: () => void
  setDnaEndsEditorOpen: (open: boolean) => void
  handleSetOrigin: (position: number) => void
  setActiveTab: (tab: WorkspaceTab) => void
  setEditMapLabelOpen: (open: boolean) => void
  toggleAlignments: () => void
  setDescriptionPanelVisible: Setter<boolean>
  setDisplaySettings: Setter<DisplaySettings>
  openFeatureEditorFromSelection: () => void
  addProteinBond: () => void
  openProteinUniProtAnnotation: (scope: 'whole' | 'selection') => void
  markSelectedProteinVariable: () => void
  clearProteinVariableRegions: () => void
  annotateAutoProteinBinder: (scheme: 'imgt' | 'kabat') => void
  openTranslationOptions: () => void
  enzymeMenuOpenChoose: () => void
  enzymeMenuSelectSet: (mode: EnzymeSetMode) => void
  enzymeMenuToggleVisibility: () => void
  enzymeMenuOpenSaveSet: () => void
  enzymeMenuExportSet: () => void
  setManageEnzymeSetsOpen: (open: boolean) => void
  setEnzymePrioritiesOpen: (open: boolean) => void
  setEnzymeMenuNoncuttersOpen: (open: boolean) => void
  openRandomEnzymeInfo: () => void
  addFeature: () => void
  editSelectedFeature: () => void
  duplicateSelectedFeature: () => void
  deleteSelectedFeature: () => void
  createFeatureSegment: () => void
  deleteFeatureSegment: () => void
  mergeFeatureSegments: () => void
  openFeatureMergeTemplateDialog: () => void
  addCleavageSite: () => void
  removeCleavageSite: () => void
  openFeatureColorEditor: () => void
  showSelectedFeatures: () => void
  hideSelectedFeatures: () => void
  setFeaturesImportFromFileOpen: (open: boolean) => void
  setExportFeatureDataOpen: (open: boolean) => void
  spliceToRemoveIntrons: () => void
  detectCommonFeaturesInDocument: AsyncCommand
  detectCrisprInDocument: AsyncCommand
  openAddSgRna: () => void
  openCloneSgRna: () => void
  openCrisprExcision?: () => void
  openSangerAlleles?: () => void
  exportSelectedSgRnas: () => void
  openGuideScanDesign: () => void
  openDnaDatabaseAnnotation: (scope: 'whole' | 'selection') => void
  setTranslatedOrfAnnotationRange: (range: SelectionRange) => void
  addSelectedFeatureToCommonFeatures: () => void
  openCommonFeaturesBrowser: AsyncCommand
  openAddPrimerFromMenu: () => void
  openEditSelectedPrimers: () => void
  duplicateSelectedPrimers: () => void
  removeSelectedPrimers: () => void
  openPrimerColorPicker: () => void
  setHybridizationParamsOpen: (open: boolean) => void
  openPickPrimers: () => void
  showSelectedPrimers: () => void
  hideSelectedPrimers: () => void
  setPrimersImportFromFileOpen: (open: boolean) => void
  openPrimerListPicker: () => void
  detectCommonPrimersInDocument: (scope: 'all' | { tag: string }) => void | Promise<void>
  addSelectedPrimersToCommonLibrary: AsyncCommand
  exportSelectedPrimers: () => void
  openRestrictionCloning: (mode: 'insert' | 'delete-fragment' | 'destroy-site' | 'linear-ligation') => void
  openGibsonAssembly: (mode: 'classic-gibson' | 'nebuilder-hifi' | 'infusion') => void
  openTaGcCloning: (mode: 'ta' | 'gc') => void
  openGatewayCloning: (mode: 'bp' | 'lr') => void
  openRetainedPcr: () => void
  openRetainedMutagenesis: () => void
  openAgaroseGelWindow: AsyncCommand
  setDnaMwOpen: (open: boolean) => void
  openLetterCodesWindow: () => void
  openGeneticCodeTablesWindow: () => void
  handleDownloadSettingsFile: () => void
  openSettingsFilePicker: () => void
}

const DNA_ONLY_PREFIXES = ['enzymes.', 'primers.', 'actions.']

function isDnaOnlyNativeAction(action: NativeAppMenuAction): boolean {
  return DNA_ONLY_PREFIXES.some((prefix) => action.startsWith(prefix)) || [
    'edit.copy-bottom-53', 'edit.copy-bottom-35', 'edit.set-dna-color', 'edit.toggle-topology',
    'edit.flip-sequence', 'edit.edit-dna-ends', 'edit.set-origin-caret', 'view.tab.enzymes',
    'view.tab.primers', 'view.translation-options', 'tools.agarose-gel', 'tools.dna-mw',
  ].includes(action)
}

const DRAFT_RESTORE_ACTION = /^drafts\.restore\.(\d+)$/
const RECENT_OPEN_ACTION = /^recent\.open\.(\d+)$/

export function dispatchNativeMenuAction(action: NativeAppMenuAction, state: NativeMenuState, commands: NativeMenuCommands): void {
  const draftRestoreMatch = DRAFT_RESTORE_ACTION.exec(action)
  if (draftRestoreMatch) {
    commands.restoreDraftAt(Number(draftRestoreMatch[1]))
    return
  }
  const recentOpenMatch = RECENT_OPEN_ACTION.exec(action)
  if (recentOpenMatch) {
    commands.openRecentAt(Number(recentOpenMatch[1]))
    return
  }
  if (state.traceDocument && isTraceDocumentMutationAction(action)) {
    commands.setStatus('Trace documents are read-only. Open as sequence before editing or saving.')
    return
  }
  if (!state.nucleotideStrands && isDnaOnlyNativeAction(action)) {
    commands.setStatus(`That command is not available for ${state.record.molecule} documents.`)
    return
  }
  switch (action) {
    case 'app.quit': commands.requestNativeQuit(); break
    case 'app.whats-new': commands.setWhatsNewOpen(true); break
    case 'app.about': case 'help.about': commands.setAboutOpen(true); break
    case 'help.dna-library-format': commands.setDnaLibraryHelpOpen(true); break
    case 'help.history-derived-workflows': commands.setHistoryDerivedWorkflowsHelpOpen(true); break
    case 'help.database': commands.setDatabaseHelpOpen(true); break
    case 'help.crispr-workflow': commands.setCrisprWorkflowHelpOpen(true); break
    case 'help.alignments': commands.setAlignmentsHelpOpen(true); break
    case 'help.keyboard-shortcuts': commands.setKeyboardShortcutsOpen(true); break
    case 'help.support': commands.openKofiSupport(); break
    case 'help.source-code': commands.openSourceRepository(); break
    case 'help.telegram-group': commands.openTelegramGroup(); break
    case 'help.report-bug': commands.setBugReportOpen(true); break
    case 'file.open': commands.openFilePicker(); break
    case 'file.save': void commands.handleSave(); break
    case 'file.save-to': void commands.handleSaveToDatabase(); break
    case 'file.rename': commands.openRenameFileDialog(); break
    case 'file.new-dna': commands.openNewDnaFileWindow(); break
    case 'file.new-dna-library': commands.openNewDnaLibraryPicker(); break
    case 'file.convert-to-library': commands.openConvertToLibraryPicker(); break
    case 'file.new-protein': commands.openNewProteinFileDialog(); break
    case 'file.import-database': commands.setSequenceDatabaseImportOpen(true); break
    case 'file.new-from-selection': commands.handleNewFileFromSelection(); break
    case 'file.save-dna':
      if (state.documentSaveBinding === 'database') void commands.handleExportSnapGene()
      else void commands.handleSaveDiskFile({ forceDialog: true })
      break
    case 'file.save-genbank': void commands.handleExportGenBank(); break
    case 'file.save-fasta': void commands.handleExportFasta(); break
    case 'file.new-window': commands.openNewVibegeneWindow(); break
    case 'file.database': commands.openDatabaseWindow(); break
    case 'file.preferences': commands.openPreferencesWindow(); break
    case 'edit.undo': commands.handleUndo(); break
    case 'edit.redo': commands.handleRedo(); break
    case 'edit.copy-top': {
      if (state.record.molecule === 'protein') {
        const range = state.selectedRange && state.selectedRange.end > state.selectedRange.start
          ? state.selectedRange
          : { start: 0, end: state.record.sequence.length }
        void commands.writeClipboardText(state.record.sequence.slice(range.start, range.end))
        commands.setStatus(`Copied ${(range.end - range.start).toLocaleString()} aa.`)
      } else commands.copyTopStrand()
      break
    }
    case 'edit.copy-bottom-53': commands.copyBottomStrand53(); break
    case 'edit.copy-bottom-35': commands.copyBottomStrand35(); break
    case 'edit.copy-translation': {
      if (state.record.molecule === 'protein') {
        const range = state.selectedRange && state.selectedRange.end > state.selectedRange.start
          ? state.selectedRange
          : { start: 0, end: state.record.sequence.length }
        const sequence = state.record.sequence.slice(range.start, range.end)
        void commands.writeClipboardText(`>${state.record.name}\n${sequence.match(/.{1,70}/g)?.join('\n') ?? ''}`)
        commands.setStatus(`Copied ${sequence.length.toLocaleString()} aa as FASTA.`)
      } else commands.copyTranslation()
      break
    }
    case 'edit.select-range': commands.setSelectRangeOpen(true); break
    case 'edit.invert-selection': commands.invertSelection(); break
    case 'edit.crop-library': commands.cropDnaLibraryToSelection(); break
    case 'edit.uppercase': commands.changeSelectionCase(true); break
    case 'edit.lowercase': commands.changeSelectionCase(false); break
    case 'edit.set-dna-color': commands.activateUserDnaColors(); break
    case 'edit.toggle-topology': commands.handleToggleTopologyAtOrigin(); break
    case 'edit.flip-sequence': commands.handleFlipSequence(); break
    case 'edit.edit-dna-ends': commands.setDnaEndsEditorOpen(true); break
    case 'edit.set-origin-caret': commands.handleSetOrigin(Math.min(state.enzymeTabCaretPosition, Math.max(state.record.sequence.length - 1, 0))); break
    case 'view.tab.map': commands.setActiveTab('Map'); break
    case 'view.tab.sequence': commands.setActiveTab('Sequence'); break
    case 'view.tab.properties': case 'protein.properties': case 'tools.protein-properties': commands.setActiveTab('Properties'); break
    case 'view.tab.enzymes': commands.setActiveTab('Enzymes'); break
    case 'view.tab.features': commands.setActiveTab('Features'); break
    case 'view.tab.primers': commands.setActiveTab('Primers'); break
    case 'view.tab.history': commands.setActiveTab('History'); break
    case 'view.edit-map-label': commands.setEditMapLabelOpen(true); break
    case 'view.toggle-alignments': commands.toggleAlignments(); break
    case 'view.toggle-description': if (!state.traceDocument) commands.setDescriptionPanelVisible((visible) => !visible); break
    case 'view.toggle-features': commands.setDisplaySettings((current) => ({ ...current, features: { ...current.features, visible: !current.features.visible } })); break
    case 'view.toggle-feature-labels': commands.setDisplaySettings((current) => ({ ...current, features: { ...current.features, labelsVisible: !current.features.labelsVisible } })); break
    case 'view.toggle-protein-colors': commands.setDisplaySettings((current) => ({ ...current, proteinColors: { ...current.proteinColors, enabled: !current.proteinColors.enabled } })); break
    case 'view.toggle-protein-visual-controls': commands.setDisplaySettings((current) => ({
      ...current,
      ...(current.alignments.visible
        ? { proteinAlignmentVisual: { ...current.proteinAlignmentVisual, panelOpen: !current.proteinAlignmentVisual.panelOpen } }
        : state.activeTab === 'Map'
          ? { proteinMapVisual: { ...current.proteinMapVisual, panelOpen: !current.proteinMapVisual.panelOpen } }
          : { proteinSequenceVisual: { ...current.proteinSequenceVisual, panelOpen: !current.proteinSequenceVisual.panelOpen } }),
    })); break
    case 'protein.add-feature': commands.openFeatureEditorFromSelection(); break
    case 'protein.add-bond': case 'features.add-bond': commands.addProteinBond(); break
    case 'protein.comparative-alignment': if (state.activeTab !== 'Map' && state.activeTab !== 'Sequence') commands.setActiveTab('Sequence'); if (!state.displaySettings.alignments.visible) commands.toggleAlignments(); break
    case 'protein.annotate-uniprot-whole': commands.openProteinUniProtAnnotation('whole'); break
    case 'protein.annotate-uniprot-selection': commands.openProteinUniProtAnnotation('selection'); break
    case 'protein.mark-variable': commands.markSelectedProteinVariable(); break
    case 'protein.clear-variable': commands.clearProteinVariableRegions(); break
    case 'protein.annotate-imgt-auto': case 'protein.annotate-kabat-auto': commands.annotateAutoProteinBinder(action === 'protein.annotate-kabat-auto' ? 'kabat' : 'imgt'); break
    case 'view.translation-options': commands.openTranslationOptions(); break
    case 'enzymes.choose': commands.enzymeMenuOpenChoose(); break
    case 'enzymes.set.all': commands.enzymeMenuSelectSet('all'); break
    case 'enzymes.set.nonredundant': commands.enzymeMenuSelectSet('nonredundant'); break
    case 'enzymes.set.type-iis': commands.enzymeMenuSelectSet('type-iis'); break
    case 'enzymes.set.unique': commands.enzymeMenuSelectSet('unique'); break
    case 'enzymes.set.unique-dual': commands.enzymeMenuSelectSet('unique-dual'); break
    case 'enzymes.set.six-plus': commands.enzymeMenuSelectSet('six-plus'); break
    case 'enzymes.set.unique-six-plus': commands.enzymeMenuSelectSet('unique-six-plus'); break
    case 'enzymes.toggle-visibility': commands.enzymeMenuToggleVisibility(); break
    case 'enzymes.save-set': commands.enzymeMenuOpenSaveSet(); break
    case 'enzymes.export-set': commands.enzymeMenuExportSet(); break
    case 'enzymes.manage-sets': commands.setManageEnzymeSetsOpen(true); break
    case 'enzymes.priorities': commands.setEnzymePrioritiesOpen(true); break
    case 'enzymes.noncutters': commands.setEnzymeMenuNoncuttersOpen(true); break
    case 'enzymes.restriction-tab': commands.setActiveTab('Enzymes'); break
    case 'enzymes.database': commands.openRandomEnzymeInfo(); break
    case 'features.add': commands.addFeature(); break
    case 'features.edit': commands.editSelectedFeature(); break
    case 'features.duplicate': commands.duplicateSelectedFeature(); break
    case 'features.remove': commands.deleteSelectedFeature(); break
    case 'features.create-segment': commands.createFeatureSegment(); break
    case 'features.delete-segment': commands.deleteFeatureSegment(); break
    case 'features.merge-segments': commands.mergeFeatureSegments(); break
    case 'features.merge': commands.openFeatureMergeTemplateDialog(); break
    case 'features.add-cleavage': commands.addCleavageSite(); break
    case 'features.remove-cleavage': commands.removeCleavageSite(); break
    case 'features.color': commands.openFeatureColorEditor(); break
    case 'features.show-selected': commands.showSelectedFeatures(); break
    case 'features.hide-selected': commands.hideSelectedFeatures(); break
    case 'features.import-file': commands.setFeaturesImportFromFileOpen(true); break
    case 'features.export-data': commands.setExportFeatureDataOpen(true); break
    case 'features.splice-introns': commands.spliceToRemoveIntrons(); break
    case 'features.detect-common': void commands.detectCommonFeaturesInDocument(); break
    case 'crispr.detect': void commands.detectCrisprInDocument(); break
    case 'crispr.add-sgrna': commands.openAddSgRna(); break
    case 'crispr.clone-sgrna': commands.openCloneSgRna(); break
    case 'crispr.excise-region': commands.openCrisprExcision?.(); break
    case 'crispr.sanger-alleles': commands.openSangerAlleles?.(); break
    case 'crispr.export-sgrnas': commands.exportSelectedSgRnas(); break
    case 'crispr.design-sgrna': commands.openGuideScanDesign(); break
    case 'features.annotate-databases-whole': commands.openDnaDatabaseAnnotation('whole'); break
    case 'features.annotate-databases-selection': commands.openDnaDatabaseAnnotation('selection'); break
    case 'features.annotate-translated-orfs': commands.setTranslatedOrfAnnotationRange({ start: 0, end: state.record.sequence.length }); break
    case 'features.annotate-translated-orfs-selection': if (state.selectedRange && state.selectedRange.end > state.selectedRange.start) commands.setTranslatedOrfAnnotationRange(state.selectedRange); break
    case 'features.add-to-common': commands.addSelectedFeatureToCommonFeatures(); break
    case 'features.browse-common': void commands.openCommonFeaturesBrowser(); break
    case 'primers.add': commands.openAddPrimerFromMenu(); break
    case 'primers.edit': commands.openEditSelectedPrimers(); break
    case 'primers.duplicate': commands.duplicateSelectedPrimers(); break
    case 'primers.remove': commands.removeSelectedPrimers(); break
    case 'primers.color': commands.openPrimerColorPicker(); break
    case 'primers.hybridization': commands.setHybridizationParamsOpen(true); break
    case 'primers.pick': commands.openPickPrimers(); break
    case 'primers.show-selected': commands.showSelectedPrimers(); break
    case 'primers.hide-selected': commands.hideSelectedPrimers(); break
    case 'primers.import-file': commands.setPrimersImportFromFileOpen(true); break
    case 'primers.import-list': commands.openPrimerListPicker(); break
    case 'primers.export': commands.exportSelectedPrimers(); break
    case 'primers.detect-common': void commands.detectCommonPrimersInDocument('all'); break
    case 'primers.add-to-common': void commands.addSelectedPrimersToCommonLibrary(); break
    case 'actions.restriction-cloning': commands.openRestrictionCloning('insert'); break
    case 'actions.delete-fragment': commands.openRestrictionCloning('delete-fragment'); break
    case 'actions.destroy-site': commands.openRestrictionCloning('destroy-site'); break
    case 'actions.linear-ligation': commands.openRestrictionCloning('linear-ligation'); break
    case 'actions.gibson.classic': commands.openGibsonAssembly('classic-gibson'); break
    case 'actions.gibson.nebuilder': commands.openGibsonAssembly('nebuilder-hifi'); break
    case 'actions.gibson.infusion': commands.openGibsonAssembly('infusion'); break
    case 'actions.tagc.ta': commands.openTaGcCloning('ta'); break
    case 'actions.tagc.gc': commands.openTaGcCloning('gc'); break
    case 'actions.gateway.bp': commands.openGatewayCloning('bp'); break
    case 'actions.gateway.lr': commands.openGatewayCloning('lr'); break
    case 'actions.pcr': commands.openRetainedPcr(); break
    case 'actions.mutagenesis': commands.openRetainedMutagenesis(); break
    case 'tools.agarose-gel': void commands.openAgaroseGelWindow(); break
    case 'tools.dna-mw': commands.setDnaMwOpen(true); break
    case 'tools.letter-codes': commands.openLetterCodesWindow(); break
    case 'tools.genetic-code': commands.openGeneticCodeTablesWindow(); break
    case 'settings.download': commands.handleDownloadSettingsFile(); break
    case 'settings.load': commands.openSettingsFilePicker(); break
    default:
      if (action.startsWith('primers.detect-common.tag:')) {
        const tag = action.slice('primers.detect-common.tag:'.length)
        if (tag) void commands.detectCommonPrimersInDocument({ tag })
      }
  }
}

export type NativeMenuLifecycle = {
  isNativeDesktopApp: () => boolean
  installMenu: (dispatch: (action: NativeAppMenuAction) => void, options: { reclaim: boolean; isProteinDocument: boolean; initial?: boolean }) => Promise<void>
  subscribeActions: (dispatch: (action: NativeAppMenuAction) => void) => Promise<() => void>
  syncEnabled: (state: NativeAppMenuEnabledState) => Promise<void>
  rememberFocusedWindow: () => Promise<void>
  takePendingMenuAction: () => Promise<NativeAppMenuAction | null>
  focus: {
    subscribe: (onFocused: () => void) => Promise<() => void>
    isFocused: () => Promise<boolean>
    isVisible: () => Promise<boolean>
    showAndFocus: () => Promise<void>
  }
}

export function useNativeAppMenuController(
  state: NativeMenuState,
  commands: NativeMenuCommands,
  lifecycle: NativeMenuLifecycle,
) {
  const stateRef = useRef(state)
  const commandsRef = useRef(commands)
  const lifecycleRef = useRef(lifecycle)
  // Keep menu callbacks current during the commit-to-effect window as well as in events.
  // eslint-disable-next-line react-hooks/refs
  stateRef.current = state
  // eslint-disable-next-line react-hooks/refs
  commandsRef.current = commands
  // eslint-disable-next-line react-hooks/refs
  lifecycleRef.current = lifecycle
  const dispatch = useCallback((action: NativeAppMenuAction) => {
    dispatchNativeMenuAction(action, stateRef.current, commandsRef.current)
  }, [])
  const enabledState = buildNativeMenuEnabledState(state)
  const enabledRef = useRef<NativeAppMenuEnabledState>(enabledState)
  // eslint-disable-next-line react-hooks/refs
  enabledRef.current = enabledState

  useEffect(() => {
    const native = lifecycleRef.current
    if (!native || !native.isNativeDesktopApp()) return
    let cancelled = false
    let initialMenuInstallInProgress = false
    let unlistenFocus: (() => void) | undefined
    let unlistenActions: (() => void) | undefined
    const claimMenu = async (reclaim: boolean, initial = false) => {
      try {
        await native.installMenu(dispatch, {
          reclaim,
          isProteinDocument: stateRef.current.record.molecule === 'protein',
          ...(initial ? { initial: true } : {}),
        })
        if (!cancelled) {
          await native.syncEnabled(enabledRef.current)
          if (initial) await native.rememberFocusedWindow()
        }
      } catch (error) {
        console.error('Could not install native application menu', error)
        if (initial) {
          // Do not strand the initial hidden window if native menu creation fails.
          try {
            await native.focus.showAndFocus()
          } catch {
            // Keep the original menu error as the useful diagnostic.
          }
        }
      } finally {
        if (initial) initialMenuInstallInProgress = false
      }
    }
    void native.subscribeActions(dispatch).then((unlisten) => {
      if (cancelled) unlisten()
      else unlistenActions = unlisten
    })
    let pendingTimer: number | undefined
    void native.takePendingMenuAction().then((pending) => {
      if (!pending || cancelled) return
      pendingTimer = window.setTimeout(() => { if (!cancelled) dispatch(pending) }, 80)
    })
    void (async () => {
      try {
        const stopFocus = await native.focus.subscribe(() => {
          if (cancelled) return
          if (initialMenuInstallInProgress) return
          void native.rememberFocusedWindow()
          void claimMenu(true)
        })
        if (cancelled) { stopFocus(); return }
        unlistenFocus = stopFocus
        const visible = await native.focus.isVisible()
        if (!visible) {
          initialMenuInstallInProgress = true
          // Initial windows are created hidden by Tauri. Install the native
          // menu before revealing them; installNativeAppMenu shows the window
          // only after the native menu has been assigned.
          void claimMenu(true, true)
        } else if (await native.focus.isFocused()) {
          if (cancelled) return
          void native.rememberFocusedWindow()
          claimMenu(true)
        }
      } catch (error) {
        if (!cancelled && native.isNativeDesktopApp()) {
          console.error('Could not resolve window focus before installing native menu', error)
          initialMenuInstallInProgress = true
          void claimMenu(true, true)
          return
        }
        // Browser and non-Tauri hosts use the install-once fallback.
      }
    })()
    return () => {
      cancelled = true
      if (pendingTimer !== undefined) window.clearTimeout(pendingTimer)
      unlistenFocus?.()
      unlistenActions?.()
    }
  }, [dispatch, state.record.molecule])

  const previousEnabledRef = useRef<NativeAppMenuEnabledState | null>(null)
  useEffect(() => {
    const native = lifecycleRef.current
    if (!native || !native.isNativeDesktopApp()) return
    const previous = previousEnabledRef.current
    previousEnabledRef.current = enabledState
    if (previous && JSON.stringify(previous) === JSON.stringify(enabledState)) return
    void native.syncEnabled(enabledState)
  }, [enabledState])

  return { dispatch, enabledState }
}
