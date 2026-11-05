import type { StoredProjectSummary } from '../../application/ports/projectPersistence'
import type { RecentFileEntry } from '../../application/ports/recentFiles'
import type { NativeAppMenuAction } from '../../application/ports/nativeMenu'
import type { EnzymePreferences, SavedEnzymeSet } from '../../domain/enzymePreferences'
import type { EnzymeManufacturerId } from '../../domain/types'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import type { MoleculeCapabilities } from '../../domain/moleculeCapabilities'
import type { WorkspaceViewProjection } from '../workspace/useWorkspaceViewProjection'
import { DocumentActionsMenu, DocumentToolsMenu } from './DocumentActionMenus'
import { DocumentCrisprMenu } from './DocumentCrisprMenu'
import { DocumentEditMenu, DocumentProteinEditMenu, DocumentProteinMenu, DocumentViewMenu } from './DocumentEditMenus'
import { DocumentEnzymesMenu } from './DocumentEnzymesMenu'
import { DocumentFeaturesMenu, DocumentProteinFeaturesMenu } from './DocumentFeatureMenus'
import { DocumentFileMenu } from './DocumentFileMenu'
import { DocumentPrimersMenu } from './DocumentPrimersMenu'
import { DocumentDesktopAppMenu, DocumentHelpMenu, DocumentSettingsMenu } from './DocumentUtilityMenus'
import type { DocumentPrimersMenuProps } from './DocumentPrimersMenu'
import type { NativeMenuState } from './useNativeAppMenuController'
import {
  commonPrimersDetectNativeAction,
  enzymeSetNativeAction,
  gatewayCloningNativeAction,
  gibsonAssemblyNativeAction,
  taGcCloningNativeAction,
  tryViewTabNativeAction,
} from './workspaceDocumentMenuDispatchMaps'
import type { WorkspaceTab } from '../sequence'

export type WorkspaceDocumentMenuResiduals = {
  onOpenRecent: (entry: RecentFileEntry) => void
  onRestoreDraft: (draftId: string) => void
  onDiscardDraft: (draftId: string) => void
  onOpenFromUrl?: () => void
  onGenerateLink: () => void
  onSelectSupplier: (supplierId: EnzymeManufacturerId) => void
  onSelectSavedSet: (savedSetId: string) => void
  onSelectFileSet: (savedSetId: string) => void
  onOpenAsProtein: () => void
  onSaveAsFile: () => void | Promise<void>
  onOpenDoubleDigest: () => void
  loadCommonPrimers: DocumentPrimersMenuProps['loadCommonPrimers']
  loadPrimerTagMap: DocumentPrimersMenuProps['loadPrimerTagMap']
  onSelectTab: (tab: WorkspaceTab) => void
  onSetOrigin: (origin: number) => void
}

export type WorkspaceDocumentMenusProps = {
  dispatch: (action: NativeAppMenuAction) => void
  menuState: NativeMenuState
  availableTabs: readonly WorkspaceTab[]
  moleculeCapabilities: Pick<MoleculeCapabilities, 'nucleotideStrands' | 'restrictionEnzymes' | 'primers' | 'cloning'>
  workspaceFeatures: Pick<WorkspaceViewProjection['features'], 'canOpenAsProtein' | 'selected'>
  workspaceEnzymes: Pick<WorkspaceViewProjection['enzymes'], 'parentalRestrictionSites'>
  workspacePrimers: Pick<WorkspaceViewProjection['primers'], 'selectedSgRnasForCloning' | 'selectedSgRnasForExport'>
  recentFiles: RecentFileEntry[]
  sessionDrafts: StoredProjectSummary[]
  enzymePreferences: EnzymePreferences
  fileEnzymeSets: SavedEnzymeSet[]
  canAddCleavageSite: boolean
  showBrowserOnlyMenus: boolean
  residuals: WorkspaceDocumentMenuResiduals
}

/** React document toolbar menus wired through native menu action dispatch. */
export function WorkspaceDocumentMenus({
  dispatch,
  menuState,
  availableTabs,
  moleculeCapabilities,
  workspaceFeatures,
  workspaceEnzymes,
  workspacePrimers,
  recentFiles,
  sessionDrafts,
  enzymePreferences,
  fileEnzymeSets,
  canAddCleavageSite,
  showBrowserOnlyMenus,
  residuals,
}: WorkspaceDocumentMenusProps) {
  const { record, displaySettings, traceDocument, nucleotideStrands } = menuState
  const d = dispatch

  return (
    <>
      <DocumentFileMenu
        nucleotideDocument={nucleotideStrands}
        canCreateFromSelection={menuState.canCreateFromSelection}
        onOpen={() => d('file.open')}
        onOpenFromUrl={showBrowserOnlyMenus ? residuals.onOpenFromUrl : undefined}
        onGenerateLink={residuals.onGenerateLink}
        recentFiles={recentFiles}
        onOpenRecent={residuals.onOpenRecent}
        drafts={sessionDrafts}
        onRestoreDraft={residuals.onRestoreDraft}
        onDiscardDraft={residuals.onDiscardDraft}
        onNewDnaFile={() => d('file.new-dna')}
        onNewDnaLibrary={() => d('file.new-dna-library')}
        onConvertToLibrary={() => d('file.convert-to-library')}
        canConvertToLibrary={menuState.canConvertToLibrary}
        onNewProteinFile={() => d('file.new-protein')}
        onImportFromDatabase={() => d('file.import-database')}
        onNewFileFromSelection={() => d('file.new-from-selection')}
        onSave={() => void d('file.save')}
        onSaveTo={() => void d('file.save-to')}
        onRenameFile={() => d('file.rename')}
        onSaveAsFile={() => void residuals.onSaveAsFile()}
        onSaveToDatabase={() => void d('file.save-to')}
        onSaveDna={async () => { await d('file.save-dna') }}
        onSaveGenBank={() => void d('file.save-genbank')}
        onSaveFasta={() => void d('file.save-fasta')}
        onPreferences={() => d('file.preferences')}
        saveBinding={menuState.documentSaveBinding}
        canRenameFile={menuState.canRenameFile && !traceDocument}
        readOnlyDocument={traceDocument}
      />
      {!traceDocument && nucleotideStrands && <DocumentEditMenu
        topology={record.topology}
        caretPosition={menuState.enzymeTabCaretPosition}
        sequenceLength={record.sequence.length}
        canUndo={menuState.canUndo}
        canRedo={menuState.canRedo}
        hasSelection={menuState.hasSelection}
        canInvertSelection={menuState.canInvertSelection}
        canCopySelection={menuState.canCopySelection}
        canCopyTranslation={menuState.canCopyTranslation}
        onUndo={() => d('edit.undo')}
        onRedo={() => d('edit.redo')}
        onCopyTopStrand={() => d('edit.copy-top')}
        onCopyBottomStrand53={() => d('edit.copy-bottom-53')}
        onCopyBottomStrand35={() => d('edit.copy-bottom-35')}
        onCopyTranslation={() => d('edit.copy-translation')}
        onSelectRange={() => d('edit.select-range')}
        onInvertSelection={() => d('edit.invert-selection')}
        onMakeUppercase={() => d('edit.uppercase')}
        onMakeLowercase={() => d('edit.lowercase')}
        onSetDnaColor={() => d('edit.set-dna-color')}
        onToggleTopology={() => d('edit.toggle-topology')}
        onFlipSequence={() => d('edit.flip-sequence')}
        onSetOrigin={residuals.onSetOrigin}
        onEditDnaEnds={() => d('edit.edit-dna-ends')}
        isDnaLibrary={isDnaLibraryRecord(record)}
        canCropLibrary={menuState.canCropLibrary}
        onCropLibrary={() => d('edit.crop-library')}
      />}
      {record.molecule === 'protein' && <DocumentProteinEditMenu
        canUndo={menuState.canUndo}
        canRedo={menuState.canRedo}
        hasSelection={menuState.hasSelection}
        canInvertSelection={menuState.canInvertSelection}
        sequenceLength={record.sequence.length}
        onUndo={() => d('edit.undo')}
        onRedo={() => d('edit.redo')}
        onCopySequence={() => d('edit.copy-top')}
        onCopyFasta={() => d('edit.copy-translation')}
        onSelectRange={() => d('edit.select-range')}
        onInvertSelection={() => d('edit.invert-selection')}
        onMakeUppercase={() => d('edit.uppercase')}
        onMakeLowercase={() => d('edit.lowercase')}
      />}
      <DocumentViewMenu
        activeTab={menuState.activeTab}
        availableTabs={availableTabs}
        dnaTools={!traceDocument && nucleotideStrands}
        proteinTools={record.molecule === 'protein'}
        alignmentsVisible={displaySettings.alignments.visible}
        descriptionPanelVisible={menuState.effectiveDescriptionPanelVisible}
        descriptionPanelAvailable={!traceDocument}
        featuresVisible={displaySettings.features.visible}
        featureLabelsVisible={displaySettings.features.labelsVisible}
        proteinColorsVisible={displaySettings.proteinColors.enabled}
        proteinVisualControlsVisible={displaySettings.alignments.visible
          ? displaySettings.proteinAlignmentVisual.panelOpen
          : menuState.activeTab === 'Map'
            ? displaySettings.proteinMapVisual.panelOpen
            : displaySettings.proteinSequenceVisual.panelOpen}
        onSelectTab={(tab) => {
          const action = tryViewTabNativeAction(tab)
          if (action) d(action)
          else residuals.onSelectTab(tab)
        }}
        onEditMapLabel={() => d('view.edit-map-label')}
        onToggleAlignments={() => d('view.toggle-alignments')}
        onToggleDescriptionPanel={() => d('view.toggle-description')}
        onTranslationOptions={() => d('view.translation-options')}
        onToggleFeatures={() => d('view.toggle-features')}
        onToggleFeatureLabels={() => d('view.toggle-feature-labels')}
        onToggleProteinColors={() => d('view.toggle-protein-colors')}
        onToggleProteinVisualControls={() => d('view.toggle-protein-visual-controls')}
      />
      {record.molecule === 'protein' && <DocumentProteinMenu
        hasSelection={menuState.hasSelection}
        hasVariableRegions={(record.protein?.comparisonVariableRegions?.length ?? 0) > 0}
        onAddFeature={() => d('protein.add-feature')}
        onAddBond={() => d('protein.add-bond')}
        onMarkVariable={() => d('protein.mark-variable')}
        onClearVariable={() => d('protein.clear-variable')}
        onComparativeAlignment={() => d('protein.comparative-alignment')}
        onProperties={() => d('protein.properties')}
        onAnnotateUniProtWhole={() => d('protein.annotate-uniprot-whole')}
        onAnnotateUniProtSelection={() => d('protein.annotate-uniprot-selection')}
        onAnnotateImgt={() => d('protein.annotate-imgt-auto')}
        onAnnotateKabat={() => d('protein.annotate-kabat-auto')}
      />}
      {!traceDocument && moleculeCapabilities.restrictionEnzymes && <DocumentEnzymesMenu
        settings={displaySettings}
        preferences={enzymePreferences}
        fileEnzymeSets={fileEnzymeSets}
        parentalRestrictionSites={workspaceEnzymes.parentalRestrictionSites}
        enzymesVisible={menuState.enzymesVisible}
        canSaveEnzymeSet={menuState.canSaveEnzymeSet}
        onSelectSet={(set) => d(enzymeSetNativeAction(set))}
        onSelectSupplier={residuals.onSelectSupplier}
        onSelectSavedSet={residuals.onSelectSavedSet}
        onSelectFileSet={residuals.onSelectFileSet}
        onChooseEnzymes={() => d('enzymes.choose')}
        onToggleVisibility={() => d('enzymes.toggle-visibility')}
        onShowNoncutters={() => d('enzymes.noncutters')}
        onSaveEnzymeSet={() => d('enzymes.save-set')}
        onExportEnzymeSet={() => d('enzymes.export-set')}
        onManageEnzymeSets={() => d('enzymes.manage-sets')}
        onOpenEnzymePriorities={() => d('enzymes.priorities')}
        onOpenRestrictionEnzymes={() => d('enzymes.restriction-tab')}
        onOpenEnzymeDatabase={() => d('enzymes.database')}
      />}
      {!traceDocument && nucleotideStrands && <DocumentFeaturesMenu
        hasFeatureSelected={menuState.hasFeatureSelected}
        canOpenAsProtein={workspaceFeatures.canOpenAsProtein}
        hasSelectionRange={menuState.hasSelectionRange}
        hasSelectionPoint={menuState.hasSelectionPoint}
        canAddCleavageSite={canAddCleavageSite}
        canRemoveCleavageSite={menuState.canRemoveCleavageSite}
        canShowSelectedFeatures={menuState.canShowSelectedFeatures}
        canHideSelectedFeatures={menuState.canHideSelectedFeatures}
        onAddFeature={() => d('features.add')}
        onEditFeature={() => d('features.edit')}
        onOpenAsProtein={residuals.onOpenAsProtein}
        onDuplicateFeature={() => d('features.duplicate')}
        onRemoveFeature={() => d('features.remove')}
        onCreateSegment={() => d('features.create-segment')}
        onDeleteSegment={() => d('features.delete-segment')}
        onMergeSegments={() => d('features.merge-segments')}
        canMergeFeatures={menuState.canMergeFeatures}
        onMergeFeatures={() => d('features.merge')}
        onAddCleavageSite={() => d('features.add-cleavage')}
        onRemoveCleavageSite={() => d('features.remove-cleavage')}
        onFeatureColor={() => d('features.color')}
        onShowSelectedFeatures={() => d('features.show-selected')}
        onHideSelectedFeatures={() => d('features.hide-selected')}
        onSpliceIntrons={() => d('features.splice-introns')}
        onDetectCommonFeatures={() => void d('features.detect-common')}
        onAnnotateDatabasesWhole={() => d('features.annotate-databases-whole')}
        onAnnotateDatabasesSelection={() => d('features.annotate-databases-selection')}
        onAnnotateTranslatedOrfsWhole={() => d('features.annotate-translated-orfs')}
        onAnnotateTranslatedOrfsSelection={() => d('features.annotate-translated-orfs-selection')}
        onAddToCommonFeatures={() => d('features.add-to-common')}
        onBrowseCommonFeatures={() => void d('features.browse-common')}
        onImportFeaturesFromAnotherFile={() => d('features.import-file')}
        onExportFeatureData={() => d('features.export-data')}
      />}
      {record.molecule === 'protein' && <DocumentProteinFeaturesMenu
        hasFeatureSelected={menuState.hasFeatureSelected}
        onAddFeature={() => d('features.add')}
        onAddBond={() => d('features.add-bond')}
        onEditFeature={() => d('features.edit')}
        onDuplicateFeature={() => d('features.duplicate')}
        onRemoveFeature={() => d('features.remove')}
        onFeatureColor={() => d('features.color')}
        onShowSelectedFeatures={() => d('features.show-selected')}
        onHideSelectedFeatures={() => d('features.hide-selected')}
        onImportFeatures={() => d('features.import-file')}
        onExportFeatureData={() => d('features.export-data')}
      />}
      {!traceDocument && moleculeCapabilities.primers && <DocumentPrimersMenu
        hasPrimerSelected={menuState.hasPrimerSelected}
        hasSelectionRange={menuState.hasSelectionRange}
        canShowSelectedPrimers={menuState.canShowSelectedPrimers}
        canHideSelectedPrimers={menuState.canHideSelectedPrimers}
        onAddPrimer={() => d('primers.add')}
        onPickPrimers={() => d('primers.pick')}
        onEditPrimers={() => d('primers.edit')}
        onDuplicatePrimers={() => d('primers.duplicate')}
        onRemovePrimers={() => d('primers.remove')}
        onPrimerColor={() => d('primers.color')}
        onHybridizationParameters={() => d('primers.hybridization')}
        onShowSelectedPrimers={() => d('primers.show-selected')}
        onHideSelectedPrimers={() => d('primers.hide-selected')}
        onImportPrimersFromAnotherFile={() => d('primers.import-file')}
        onImportPrimersFromList={() => d('primers.import-list')}
        onDetectCommonPrimers={(scope) => void d(commonPrimersDetectNativeAction(scope))}
        onAddToCommonPrimers={() => void d('primers.add-to-common')}
        loadCommonPrimers={residuals.loadCommonPrimers}
        onExportPrimers={() => d('primers.export')}
        loadPrimerTagMap={residuals.loadPrimerTagMap}
      />}
      {!traceDocument && nucleotideStrands && <DocumentCrisprMenu
        canAddSgRna={record.molecule === 'dna' && record.sequence.length > 0}
        canCloneSgRna={workspacePrimers.selectedSgRnasForCloning.length > 0}
        canExciseSgRnaRegion={Boolean(menuState.canExciseSgRnaRegion)}
        canExportSgRnas={workspacePrimers.selectedSgRnasForExport.length > 0}
        onDetectCrispr={() => void d('crispr.detect')}
        onAddSgRna={() => d('crispr.add-sgrna')}
        onDesignSgRna={() => d('crispr.design-sgrna')}
        onCloneSgRna={() => d('crispr.clone-sgrna')}
        onExciseSgRnaRegion={() => d('crispr.excise-region')}
        onSangerAlleles={() => d('crispr.sanger-alleles')}
        onExportSgRnas={() => d('crispr.export-sgrnas')}
      />}
      {!traceDocument && moleculeCapabilities.cloning && <DocumentActionsMenu
        onRestrictionCloning={() => d('actions.restriction-cloning')}
        onDeleteRestrictionFragment={() => d('actions.delete-fragment')}
        onDestroyRestrictionSite={() => d('actions.destroy-site')}
        onLinearLigation={() => d('actions.linear-ligation')}
        onGibsonAssembly={(method) => d(gibsonAssemblyNativeAction(method))}
        onTaGcCloning={(method) => d(taGcCloningNativeAction(method))}
        onGatewayCloning={(method) => d(gatewayCloningNativeAction(method))}
        onMutagenesis={() => d('actions.mutagenesis')}
        onPcr={() => d('actions.pcr')}
      />}
      <DocumentToolsMenu
        dnaTools={!traceDocument && nucleotideStrands}
        proteinTools={record.molecule === 'protein'}
        onSimulateAgaroseGel={() => void d('tools.agarose-gel')}
        onDoubleDigest={residuals.onOpenDoubleDigest}
        onShowDnaMolecularWeight={() => d('tools.dna-mw')}
        onLetterCodes={() => d('tools.letter-codes')}
        onGeneticCodeTables={() => d('tools.genetic-code')}
        onProteinProperties={() => d('tools.protein-properties')}
      />
      <DocumentSettingsMenu
        onDownloadSettings={() => d('settings.download')}
        onLoadSettings={() => d('settings.load')}
      />
      <DocumentHelpMenu
        onDnaLibraryFormat={() => d('help.dna-library-format')}
        onHistoryDerivedWorkflows={() => d('help.history-derived-workflows')}
        onDatabase={() => d('help.database')}
        onCrisprWorkflow={() => d('help.crispr-workflow')}
        onAlignments={() => d('help.alignments')}
        onKeyboardShortcuts={() => d('help.keyboard-shortcuts')}
        onAbout={() => d('help.about')}
        onReportBug={() => d('help.report-bug')}
        onSupport={() => d('help.support')}
        onSourceCode={() => d('help.source-code')}
        onTelegramGroup={() => d('help.telegram-group')}
      />
      {showBrowserOnlyMenus && <DocumentDesktopAppMenu />}
    </>
  )
}
