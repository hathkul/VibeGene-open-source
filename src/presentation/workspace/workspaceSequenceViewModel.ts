import type { ComponentProps } from 'react'
import { DnaComparisonPane } from '../../components/DnaComparisonPane'
import { ProteinAlignmentPane } from '../../components/ProteinAlignmentPane'
import { TraceViewer } from '../../TraceViewer'
import { ProteinSequencePane, ProteinViewSidebar } from '../protein'
import { ViewSidebar } from '../dnaViewControls/ViewSidebar'
import { SequenceWorkspace } from '../sequence'
import type { WorkspaceSequenceHostProps } from './WorkspaceSequenceHost'
import { isDnaLibraryRecord } from '../../domain/dnaLibrary'
import { dnaSequenceDigest } from '../../domain/proteinTranslationProvenance'
import { isBinderNumberingForSequence } from '../../domain/binderStructure'

type ProteinSidebarProps = ComponentProps<typeof ProteinViewSidebar>
type ProteinAlignmentProps = ComponentProps<typeof ProteinAlignmentPane>
type ProteinSequenceProps = ComponentProps<typeof ProteinSequencePane>
type DnaSidebarProps = ComponentProps<typeof ViewSidebar>
type ComparisonProps = ComponentProps<typeof DnaComparisonPane>
type SequenceProps = ComponentProps<typeof SequenceWorkspace>
type TraceProps = ComponentProps<typeof TraceViewer>

export type WorkspaceSequenceModelContext = {
  mounted: boolean
  activeTab: string
  layoutClassName: string
  protein: {
    record: ProteinSequenceProps['record']
    displaySettings: ProteinSequenceProps['displaySettings']
    selectedRange: ProteinSequenceProps['selectedRange']
    motifHits: ProteinSequenceProps['motifHits']
    activeHitIndex: ProteinSequenceProps['activeHitIndex']
    searchQuery: ProteinSequenceProps['searchQuery']
    selectedFeatureId: ProteinSequenceProps['selectedFeatureId']
    selectedBondId: ProteinSequenceProps['selectedBondId']
    mapZoomRange: ProteinSequenceProps['viewRange']
    mapZoomSlider: ProteinSequenceProps['zoomSliderValue']
    comparisonSources: ProteinAlignmentProps['sources']
    variableRegions: ProteinAlignmentProps['variableRegions']
    actions: Pick<ProteinSidebarProps,
      'onPaintColor' | 'onToggleMapZoom' | 'onChange'
    > & Pick<ProteinAlignmentProps,
      'onSourcesChange' | 'onVariableRegionsChange' | 'onAlignmentCacheEntry' | 'onAnnotateBinder'
      | 'onBinderNumberingChange'
      | 'onBinderStructureChange'
      | 'onStatus' | 'onSaveVisualSettings' | 'onRevertVisualSettings' | 'onPickFromDatabase' | 'onOpenAlignedSource'
    > & Pick<ProteinSequenceProps,
      'onRangeSelect' | 'onSequenceEdit' | 'onStatus' | 'onUndo' | 'onRedo' | 'onFeatureSelect'
      | 'onFeatureEdit' | 'onAnnotateBinder' | 'onBondSelect' | 'onBondEdit' | 'onDisplaySettingsChange'
      | 'onBinderNumberingChange'
      | 'onBinderStructureChange'
      | 'onSaveVisualSettings' | 'onRevertVisualSettings' | 'onZoomSliderValueChange' | 'onViewRangeChange' | 'onOpenTranslationSourceDna'
    >
    onAlignmentDisplaySettingsChange: ProteinAlignmentProps['onDisplaySettingsChange']
  } | null
  dna: {
    record: SequenceProps['record']
    displaySettings: SequenceProps['displaySettings']
    enzymePreferences: SequenceProps['enzymePreferences']
    fileEnzymeSets: DnaSidebarProps['fileEnzymeSets']
    restrictionSites: DnaSidebarProps['restrictionSites']
    parentalRestrictionSites: DnaSidebarProps['parentalRestrictionSites']
    selectedRange: SequenceProps['selectedRange']
    selectedFeatureId: SequenceProps['selectedFeatureId']
    selectedFeatureIds: SequenceProps['selectedFeatureIds']
    selectedPrimerId: SequenceProps['selectedPrimerId']
    selectedPrimerIds: SequenceProps['selectedPrimerIds']
    selectedRestrictionSites: SequenceProps['selectedRestrictionSites']
    displayAnnotationFeatures: SequenceProps['displayAnnotationFeatures']
    orfTranslationByFeatureId: SequenceProps['orfTranslationByFeatureId']
    displayedRestrictionSites: SequenceProps['displayedRestrictionSites']
    cutStrandSelection: SequenceProps['cutStrandSelection']
    sequenceHoverSiteKey: SequenceProps['initialHoveredRestrictionSiteKey']
    motifHits: SequenceProps['motifHits']
    motifQueryLength: SequenceProps['motifQueryLength']
    displayablePrimerSites: SequenceProps['primerFrameDisplays']
    activeEnzymePool: SequenceProps['traceAnnotationEnzymePool']
    traceFiles: SequenceProps['traceFiles']
    traceAlignBusy: SequenceProps['traceAlignBusy']
    selectedAlignmentTraceId: SequenceProps['selectedAlignmentTraceId']
    dnaComparisonSources: ComparisonProps['sources']
    dnaComparisonEntries: ComparisonProps['entries']
    dnaComparisonPending: ComparisonProps['pending']
    dnaAlignmentMode: 'comparative' | 'trace'
    libraryComparativeMemberIds: ComparisonProps['lockedSourceIds'] | null
    mapZoomRange: SequenceProps['viewRange']
    mapZoomSlider: SequenceProps['zoomSliderValue']
    canCropLibrary: SequenceProps['canCropLibrary']
    trace: TraceProps | null
    actions: Pick<DnaSidebarProps,
      'onChange' | 'onToggleMapZoom' | 'onEnzymeInfo' | 'onPreferencesChange' | 'onFileEnzymeSetsChange' | 'onPaintStrandColor'
    > & Pick<ComparisonProps, 'onSourcesChange' | 'onStatus' | 'onPickFromDatabase'> & {
      onNavigate: SequenceProps['onNavigate']
      onTraceFilesChange: SequenceProps['onTraceFilesChange']
      onSelectAlignmentTrace: SequenceProps['onSelectAlignmentTrace']
      onViewTrace: SequenceProps['onViewTrace']
      onTracesAdded: SequenceProps['onTracesAdded']
      onRebuildLibraryConsensus: SequenceProps['onRebuildLibraryConsensus']
      onFlipLibrary: SequenceProps['onFlipLibrary']
      onFlipLibraryMember: SequenceProps['onFlipLibraryMember']
      onOpenLibraryMemberAsConstruct: SequenceProps['onOpenLibraryMemberAsConstruct']
      onOpenCombineLibraryReads: SequenceProps['onOpenCombineLibraryReads']
      onCropLibrary: SequenceProps['onCropLibrary']
      onGroupLibraryMembers: SequenceProps['onGroupLibraryMembers']
      onReassembleLibraryMember: SequenceProps['onReassembleLibraryMember']
      onDetachLibraryMemberRead: SequenceProps['onDetachLibraryMemberRead']
      onAcceptReadBaseAtTemplate: SequenceProps['onAcceptReadBaseAtTemplate']
      onFeatureSelect: SequenceProps['onFeatureSelect']
      onFeatureEdit: SequenceProps['onFeatureEdit']
      onPrimerSelect: SequenceProps['onPrimerSelect']
      onRestrictionSelect: SequenceProps['onRestrictionSelect']
      onRangeSelect: SequenceProps['onRangeSelect']
      onExtendToBase: SequenceProps['onExtendToBase']
      onPrimerEdit: SequenceProps['onPrimerEdit']
      onStatus: SequenceProps['onStatus']
      onApplyReferenceReplacement: SequenceProps['onApplyReferenceReplacement']
      onDisplaySettingsChange: SequenceProps['onDisplaySettingsChange']
      onSaveVisualSettings: SequenceProps['onSaveVisualSettings']
      onRevertVisualSettings: SequenceProps['onRevertVisualSettings']
      onRegisterTemplateNavigator: SequenceProps['onRegisterTemplateNavigator']
      onViewRangeChange: SequenceProps['onViewRangeChange']
      onZoomSliderValueChange: SequenceProps['onZoomSliderValueChange']
    }
  } | null
}

export type WorkspaceSequenceVariant = 'hidden' | 'protein-alignment' | 'protein-sequence' | 'trace' | 'dna-comparison' | 'dna-sequence'

export function selectWorkspaceSequenceVariant(context: {
  mounted: boolean
  activeTab: string
  protein: { alignmentsVisible: boolean } | null
  dna: { trace: unknown | null; comparisonVisible: boolean } | null
}): WorkspaceSequenceVariant {
  if (!context.mounted && context.activeTab !== 'Sequence') return 'hidden'
  if (context.protein) return context.protein.alignmentsVisible ? 'protein-alignment' : 'protein-sequence'
  if (context.dna?.trace) return 'trace'
  if (context.dna) return context.dna.comparisonVisible ? 'dna-comparison' : 'dna-sequence'
  return 'hidden'
}

export function createWorkspaceSequenceModel(context: WorkspaceSequenceModelContext): Omit<WorkspaceSequenceHostProps, 'sequenceScrollHostRef'> {
  const { protein, dna } = context
  const persistedBinderNumbering = protein?.record.protein?.binderNumbering
  const persistedBinderStructure = protein?.record.protein?.binderStructure
  const binderNumbering = persistedBinderNumbering
    && persistedBinderNumbering.sequenceDigest === dnaSequenceDigest(protein.record.sequence)
    && isBinderNumberingForSequence(persistedBinderNumbering.numbering, protein.record.sequence)
    ? persistedBinderNumbering.numbering
    : null
  const binderStructure = persistedBinderStructure
    && persistedBinderStructure.sequenceDigest === dnaSequenceDigest(protein.record.sequence)
    ? persistedBinderStructure.structure
    : null
  return {
    mounted: context.mounted,
    activeTab: context.activeTab,
    layoutClassName: context.layoutClassName,
    protein: protein ? {
      sidebar: {
        id: context.activeTab === 'Sequence' ? 'mobile-side-panel' : undefined,
        recordName: protein.record.name, settings: protein.displaySettings, selectedRange: protein.selectedRange,
        sequenceLength: protein.record.sequence.length, onPaintColor: protein.actions.onPaintColor,
        showSequenceVisualControls: !protein.displaySettings.alignments.visible,
        showAlignmentVisualControls: protein.displaySettings.alignments.visible,
        onToggleMapZoom: protein.actions.onToggleMapZoom, onChange: protein.actions.onChange,
      },
      alignmentsVisible: protein.displaySettings.alignments.visible,
      alignment: {
        record: protein.record, sources: protein.comparisonSources, variableRegions: protein.variableRegions,
        onSourcesChange: protein.actions.onSourcesChange, onVariableRegionsChange: protein.actions.onVariableRegionsChange,
        onAlignmentCacheEntry: protein.actions.onAlignmentCacheEntry, onAnnotateBinder: protein.actions.onAnnotateBinder,
        binderNumbering,
        binderStructure,
        onBinderNumberingChange: protein.actions.onBinderNumberingChange,
        onBinderStructureChange: protein.actions.onBinderStructureChange,
        onStatus: protein.actions.onStatus, displaySettings: protein.displaySettings,
        onDisplaySettingsChange: protein.onAlignmentDisplaySettingsChange,
        onSaveVisualSettings: protein.actions.onSaveVisualSettings, onRevertVisualSettings: protein.actions.onRevertVisualSettings,
        onPickFromDatabase: protein.actions.onPickFromDatabase, onOpenAlignedSource: protein.actions.onOpenAlignedSource,
        acceptOsFileDrops: false,
      },
      sequence: {
        record: protein.record, selectedRange: protein.selectedRange, motifHits: protein.motifHits,
        activeHitIndex: protein.activeHitIndex, searchQuery: protein.searchQuery,
        onRangeSelect: protein.actions.onRangeSelect, onSequenceEdit: protein.actions.onSequenceEdit,
        onStatus: protein.actions.onStatus, onUndo: protein.actions.onUndo, onRedo: protein.actions.onRedo,
        selectedFeatureId: protein.selectedFeatureId, selectedBondId: protein.selectedBondId,
        onFeatureSelect: protein.actions.onFeatureSelect, onFeatureEdit: protein.actions.onFeatureEdit,
        onAnnotateBinder: protein.actions.onAnnotateBinder, onOpenTranslationSourceDna: protein.actions.onOpenTranslationSourceDna, onBinderNumberingChange: protein.actions.onBinderNumberingChange,
        binderNumbering, onBondSelect: protein.actions.onBondSelect,
        binderStructure, onBinderStructureChange: protein.actions.onBinderStructureChange,
        onBondEdit: protein.actions.onBondEdit, showFeatures: protein.displaySettings.features.visible,
        showColors: protein.displaySettings.proteinColors.enabled,
        showFeatureLabels: protein.displaySettings.features.labelsVisible, displaySettings: protein.displaySettings,
        onDisplaySettingsChange: protein.actions.onDisplaySettingsChange,
        onSaveVisualSettings: protein.actions.onSaveVisualSettings, onRevertVisualSettings: protein.actions.onRevertVisualSettings,
        viewRange: protein.displaySettings.mapView.zoom ? protein.mapZoomRange : null,
        zoomSliderValue: protein.mapZoomSlider, onZoomSliderValueChange: protein.actions.onZoomSliderValueChange,
        onViewRangeChange: protein.actions.onViewRangeChange,
      },
    } : null,
    dna: dna ? {
      sidebar: {
        id: context.activeTab === 'Sequence' ? 'mobile-side-panel' : undefined,
        settings: dna.displaySettings, enzymePreferences: dna.enzymePreferences, fileEnzymeSets: dna.fileEnzymeSets,
        restrictionSites: dna.restrictionSites, parentalRestrictionSites: dna.parentalRestrictionSites,
        recordName: dna.record.name, sequence: dna.record.sequence, topology: dna.record.topology,
        construct: dna.record.construct, selectedRange: dna.selectedRange, sequenceLength: dna.record.sequence.length,
        sequencePane: true, showSequenceVisualControls: true, onChange: dna.actions.onChange,
        onToggleMapZoom: dna.actions.onToggleMapZoom, onEnzymeInfo: dna.actions.onEnzymeInfo,
        onPreferencesChange: dna.actions.onPreferencesChange, onFileEnzymeSetsChange: dna.actions.onFileEnzymeSetsChange,
        onPaintStrandColor: dna.actions.onPaintStrandColor,
      },
      comparisonVisible: dna.displaySettings.alignments.visible && dna.dnaAlignmentMode === 'comparative',
      comparison: {
        recordName: dna.record.name, reference: dna.record.sequence, sources: dna.dnaComparisonSources,
        entries: dna.dnaComparisonEntries, pending: dna.dnaComparisonPending, sequenceVisual: dna.displaySettings.sequenceVisual,
        annotationFeatures: dna.displayAnnotationFeatures,
        lockedSourceIds: dna.libraryComparativeMemberIds ?? undefined,
        emptyHint: isDnaLibraryRecord(dna.record) ? {
          title: 'No library members to compare', body: 'Add members in sequence-trace alignment, or import extra homologous DNA sequences here.',
        } : undefined,
        onSourcesChange: dna.actions.onSourcesChange, onStatus: dna.actions.onStatus,
        onPickFromDatabase: dna.actions.onPickFromDatabase,
      },
      sequence: {
        record: dna.record, displayAnnotationFeatures: dna.displayAnnotationFeatures,
        orfTranslationByFeatureId: dna.orfTranslationByFeatureId, displayedRestrictionSites: dna.displayedRestrictionSites,
        selectedRange: dna.selectedRange, cutStrandSelection: dna.cutStrandSelection,
        selectedFeatureId: dna.selectedFeatureId, selectedFeatureIds: dna.selectedFeatureIds,
        selectedPrimerId: dna.selectedPrimerId, selectedPrimerIds: dna.selectedPrimerIds,
        selectedRestrictionSites: dna.selectedRestrictionSites, initialHoveredRestrictionSiteKey: dna.sequenceHoverSiteKey,
        onNavigate: dna.actions.onNavigate, motifHits: dna.motifHits,
        motifQueryLength: dna.motifQueryLength,
        primerFrameDisplays: dna.displaySettings.primers.visible ? dna.displayablePrimerSites : [],
        displaySettings: dna.displaySettings, enzymePreferences: dna.enzymePreferences,
        layoutActive: context.activeTab === 'Sequence', traceAnnotationEnzymePool: dna.activeEnzymePool,
        traceFiles: dna.traceFiles, onTraceFilesChange: dna.actions.onTraceFilesChange,
        traceAlignBusy: dna.traceAlignBusy, selectedAlignmentTraceId: dna.selectedAlignmentTraceId,
        onSelectAlignmentTrace: dna.actions.onSelectAlignmentTrace, onTracesAdded: dna.actions.onTracesAdded,
        onViewTrace: dna.actions.onViewTrace,
        onPickFromDatabase: dna.actions.onPickFromDatabase, onRebuildLibraryConsensus: dna.actions.onRebuildLibraryConsensus,
        onFlipLibrary: dna.actions.onFlipLibrary, onFlipLibraryMember: dna.actions.onFlipLibraryMember,
        onOpenLibraryMemberAsConstruct: dna.actions.onOpenLibraryMemberAsConstruct,
        onOpenCombineLibraryReads: dna.actions.onOpenCombineLibraryReads, onCropLibrary: dna.actions.onCropLibrary,
        onGroupLibraryMembers: dna.actions.onGroupLibraryMembers, onReassembleLibraryMember: dna.actions.onReassembleLibraryMember,
        onDetachLibraryMemberRead: dna.actions.onDetachLibraryMemberRead, onAcceptReadBaseAtTemplate: dna.actions.onAcceptReadBaseAtTemplate,
        canCropLibrary: dna.canCropLibrary,
        viewRange: dna.displaySettings.mapView.zoom && !dna.displaySettings.alignments.visible ? dna.mapZoomRange : null,
        onViewRangeChange: dna.actions.onViewRangeChange, zoomSliderValue: dna.mapZoomSlider,
        onZoomSliderValueChange: dna.actions.onZoomSliderValueChange, onFeatureSelect: dna.actions.onFeatureSelect,
        onFeatureEdit: dna.actions.onFeatureEdit, onPrimerSelect: dna.actions.onPrimerSelect,
        onRestrictionSelect: dna.actions.onRestrictionSelect, onRangeSelect: dna.actions.onRangeSelect,
        onExtendToBase: dna.actions.onExtendToBase, onPrimerEdit: dna.actions.onPrimerEdit,
        onEnzymeInfo: dna.actions.onEnzymeInfo, onStatus: dna.actions.onStatus,
        onApplyReferenceReplacement: dna.actions.onApplyReferenceReplacement,
        onDisplaySettingsChange: dna.actions.onDisplaySettingsChange,
        onSaveVisualSettings: dna.actions.onSaveVisualSettings, onRevertVisualSettings: dna.actions.onRevertVisualSettings,
        onRegisterTemplateNavigator: dna.actions.onRegisterTemplateNavigator,
      },
      trace: dna.trace,
    } : null,
  }
}
