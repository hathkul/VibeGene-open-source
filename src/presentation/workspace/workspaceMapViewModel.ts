import type { ComponentProps, ReactNode } from 'react'
import { AlignmentTraceFileList } from '../../components/AlignmentTraceFileList'
import { DnaComparisonSourceList } from '../../components/DnaComparisonPane'
import { ProteinMapPane, ProteinViewSidebar } from '../protein'
import { ViewSidebar } from '../dnaViewControls/ViewSidebar'
import { MapZoomStrip } from '../map/MapZoomStrip'
import { TrackMap } from '../map/TrackMap'
import { CircularMapStage } from '../map'
import type { DisplaySettings } from '../sequence'
import type { WorkspaceMapHostProps } from './WorkspaceMapHost'
import { dnaSequenceDigest } from '../../domain/proteinTranslationProvenance'
import { isBinderNumberingForSequence } from '../../domain/binderStructure'

type ProteinSidebarProps = ComponentProps<typeof ProteinViewSidebar>
type ProteinPaneProps = ComponentProps<typeof ProteinMapPane>
type DnaSidebarProps = ComponentProps<typeof ViewSidebar>
type ZoomStripProps = ComponentProps<typeof MapZoomStrip>
type ComparisonProps = ComponentProps<typeof DnaComparisonSourceList>
type TraceListProps = ComponentProps<typeof AlignmentTraceFileList>
type TrackMapProps = ComponentProps<typeof TrackMap>
type CircularMapProps = ComponentProps<typeof CircularMapStage<DisplaySettings>>

type ProteinInput = {
  record: ProteinPaneProps['record']
  selectedRange: ProteinPaneProps['selectedRange']
  motifHits: ProteinPaneProps['motifHits']
  activeHitIndex: ProteinPaneProps['activeHitIndex']
  searchQuery: ProteinPaneProps['searchQuery']
  selectedFeatureId: ProteinPaneProps['selectedFeatureId']
  displaySettings: ProteinPaneProps['displaySettings']
  mapZoomRange: ProteinPaneProps['viewRange']
  mapZoomSlider: ProteinPaneProps['zoomSliderValue']
  actions: Pick<ProteinSidebarProps, 'onPaintColor' | 'onToggleMapZoom' | 'onChange'>
    & Pick<ProteinPaneProps,
      'onRangeSelect' | 'onFeatureSelect' | 'onFeatureEdit' | 'onAnnotateBinder' | 'onAlignmentCacheEntry'
      | 'onBinderNumberingChange'
      | 'onBinderStructureChange'
      | 'onBondEdit' | 'onStatus' | 'onDisplaySettingsChange' | 'onSaveVisualSettings'
      | 'onRevertVisualSettings' | 'onZoomSliderValueChange' | 'onViewRangeChange'
    >
}

type DnaInput = {
  record: TrackMapProps['record']
  displaySettings: DnaSidebarProps['settings']
  enzymePreferences: DnaSidebarProps['enzymePreferences']
  fileEnzymeSets: DnaSidebarProps['fileEnzymeSets']
  restrictionSites: DnaSidebarProps['restrictionSites']
  parentalRestrictionSites: DnaSidebarProps['parentalRestrictionSites']
  mapViewSequenceLength: DnaSidebarProps['sequenceLength']
  mapViewRecord: TrackMapProps['record']
  mapViewRestrictionSites: TrackMapProps['restrictionSites']
  mapViewPrimerBindings: TrackMapProps['primerBindings']
  mapViewAnnotationFeatures: TrackMapProps['annotationFeatures']
  mapViewSelectedRange: TrackMapProps['selectedRange']
  mapZoomRange: TrackMapProps['viewRange']
  mapZoomSlider: ZoomStripProps['sliderValue']
  mapZoomCaretPosition: ZoomStripProps['caretPosition']
  mapAnnotationFeatures: TrackMapProps['annotationFeatures']
  displayedRestrictionSites: TrackMapProps['restrictionSites']
  primerBindings: TrackMapProps['primerBindings']
  selectedRange: DnaSidebarProps['selectedRange']
  mapSelectedRange: TrackMapProps['selectedRange']
  selectedFeatureId: TrackMapProps['selectedFeatureId']
  selectedFeatureIds: TrackMapProps['selectedFeatureIds']
  selectedPrimerId: TrackMapProps['selectedPrimerId']
  selectedPrimerIds: TrackMapProps['selectedPrimerIds']
  selectedRestrictionSites: TrackMapProps['selectedRestrictionSites']
  traceFiles: TraceListProps['traceFiles']
  dnaComparisonSources: ComparisonProps['sources']
  libraryComparativeMemberIds: ComparisonProps['lockedSourceIds'] | null
  dnaAlignmentMode: 'comparative' | 'trace'
  dnaComparisonMapFiles: TrackMapProps['traceFiles']
  mapAlignmentSidebarWidthPx: number
  selectedAlignmentTraceId: TrackMapProps['selectedAlignmentTraceId']
  traceAlignBusy: TraceListProps['traceAlignBusy']
  isLibrary: TraceListProps['isLibrary']
  libraryNavigator: ReactNode
  libraryMemberBrowse: boolean
  actions: Pick<DnaSidebarProps,
    'onChange' | 'onToggleMapZoom' | 'onEnzymeInfo' | 'onPreferencesChange' | 'onFileEnzymeSetsChange' | 'onPaintStrandColor'
  > & {
    openDatabaseForAlignment: () => void
    updateDnaComparisonSources: ComparisonProps['onSourcesChange']
    setStatus: ComparisonProps['onStatus']
    onTraceFilesChange: TraceListProps['onTraceFilesChange']
    handleAlignmentTracesAdded: TraceListProps['onTracesAdded']
    selectAlignmentTraceFromMap: NonNullable<TraceListProps['onTraceNavigate']>
    viewAlignmentTraceFromMap: TraceListProps['onViewTrace']
    setSelectedAlignmentTraceId: NonNullable<TrackMapProps['onSelectAlignmentTrace']>
    startMapAlignmentSplitDrag: ComponentProps<'div'>['onPointerDown']
    groupLibraryMembers: TraceListProps['onGroupLibraryMembers']
    selectFeatureById: TrackMapProps['onSelect']
    setRange: TrackMapProps['onRangeSelect']
    extendSelectionToBase: TrackMapProps['onExtendToBase']
    selectPrimerById: TrackMapProps['onPrimerSelect']
    selectRestrictionCutFromLabel: TrackMapProps['onRestrictionSelect']
    openFeatureEditorForFeature: TrackMapProps['onFeatureEdit']
    openFeatureAsProtein: TrackMapProps['onFeatureOpenAsProtein']
    openPrimerEditorForPrimer: TrackMapProps['onPrimerEdit']
    updateRecord: (updater: (record: TrackMapProps['record']) => TrackMapProps['record']) => void
    selectMapFeature: TrackMapProps['onSelect']
    selectMapRange: TrackMapProps['onRangeSelect']
    selectMapPrimer: TrackMapProps['onPrimerSelect']
    editMapFeature: TrackMapProps['onFeatureEdit']
    editMapPrimer: TrackMapProps['onPrimerEdit']
    saveMapVisualSettings: CircularMapProps['onSaveVisualSettings']
    revertMapVisualSettings: CircularMapProps['onRevertVisualSettings']
    handleMapZoomSliderChange: ZoomStripProps['onSliderValueChange']
    handleMapZoomRangeChange: ZoomStripProps['onViewRangeChange']
  }
}

export type WorkspaceMapModelContext = {
  activeTab: string
  mapAvailable: boolean
  protein: ProteinInput | null
  dna: DnaInput | null
}

export type WorkspaceMapVariant = 'hidden' | 'protein' | 'dna-alignment' | 'dna-library'

export function selectWorkspaceMapVariant(context: {
  activeTab: string
  mapAvailable: boolean
  protein: unknown | null
  dna: { alignment: unknown | null } | null
}): WorkspaceMapVariant {
  if (context.activeTab !== 'Map' || (context.protein === null && (!context.mapAvailable || context.dna === null))) return 'hidden'
  if (context.protein) return 'protein'
  return context.dna?.alignment ? 'dna-alignment' : 'dna-library'
}

export function createWorkspaceMapModel(context: WorkspaceMapModelContext): WorkspaceMapHostProps {
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
    activeTab: context.activeTab,
    mapAvailable: context.mapAvailable,
    protein: protein ? {
      sidebar: {
        id: 'mobile-side-panel', recordName: protein.record.name, settings: protein.displaySettings,
        selectedRange: protein.selectedRange, sequenceLength: protein.record.sequence.length,
        onPaintColor: protein.actions.onPaintColor, showMapVisualControls: true,
        onToggleMapZoom: protein.actions.onToggleMapZoom, onChange: protein.actions.onChange,
      },
      pane: {
        record: protein.record, selectedRange: protein.selectedRange, motifHits: protein.motifHits,
        activeHitIndex: protein.activeHitIndex, searchQuery: protein.searchQuery,
        selectedFeatureId: protein.selectedFeatureId, onRangeSelect: protein.actions.onRangeSelect,
        onFeatureSelect: protein.actions.onFeatureSelect, onFeatureEdit: protein.actions.onFeatureEdit,
        onAnnotateBinder: protein.actions.onAnnotateBinder, onBinderNumberingChange: protein.actions.onBinderNumberingChange,
        binderNumbering, onAlignmentCacheEntry: protein.actions.onAlignmentCacheEntry,
        binderStructure, onBinderStructureChange: protein.actions.onBinderStructureChange,
        onBondEdit: protein.actions.onBondEdit, onStatus: protein.actions.onStatus,
        showFeatures: protein.displaySettings.features.visible, showColors: protein.displaySettings.proteinColors.enabled,
        showFeatureLabels: protein.displaySettings.features.labelsVisible, showAlignments: protein.displaySettings.alignments.visible,
        displaySettings: protein.displaySettings, onDisplaySettingsChange: protein.actions.onDisplaySettingsChange,
        onSaveVisualSettings: protein.actions.onSaveVisualSettings, onRevertVisualSettings: protein.actions.onRevertVisualSettings,
        viewRange: protein.displaySettings.mapView.zoom && !protein.displaySettings.alignments.visible ? protein.mapZoomRange : null,
        zoomSliderValue: protein.mapZoomSlider, onZoomSliderValueChange: protein.actions.onZoomSliderValueChange,
        onViewRangeChange: protein.actions.onViewRangeChange,
      },
    } : null,
    dna: dna ? {
      sidebar: {
        id: 'mobile-side-panel', settings: dna.displaySettings, enzymePreferences: dna.enzymePreferences,
        fileEnzymeSets: dna.fileEnzymeSets, restrictionSites: dna.restrictionSites,
        parentalRestrictionSites: dna.parentalRestrictionSites, recordName: dna.record.name,
        sequence: dna.record.sequence, topology: dna.record.topology, construct: dna.record.construct,
        selectedRange: dna.selectedRange, sequenceLength: dna.mapViewSequenceLength,
        showCircularVisualControls: !dna.displaySettings.mapView.linear && !dna.displaySettings.alignments.visible,
        onChange: dna.actions.onChange, onToggleMapZoom: dna.actions.onToggleMapZoom,
        onEnzymeInfo: dna.actions.onEnzymeInfo, onPreferencesChange: dna.actions.onPreferencesChange,
        onFileEnzymeSetsChange: dna.actions.onFileEnzymeSetsChange, onPaintStrandColor: dna.actions.onPaintStrandColor,
      },
      zoomStrip: dna.displaySettings.mapView.zoom && dna.mapZoomRange && !dna.displaySettings.alignments.visible ? {
        sequenceLength: dna.mapViewSequenceLength, annotationFeatures: dna.mapViewAnnotationFeatures,
        viewRange: dna.mapZoomRange, caretPosition: dna.mapZoomCaretPosition, sliderValue: dna.mapZoomSlider,
        onSliderValueChange: dna.actions.handleMapZoomSliderChange, onViewRangeChange: dna.actions.handleMapZoomRangeChange,
      } : null,
      alignment: dna.displaySettings.alignments.visible ? {
        comparative: {
          className: 'map-alignment-trace-list', sources: dna.dnaComparisonSources,
          lockedSourceIds: dna.libraryComparativeMemberIds ?? undefined,
          onSourcesChange: dna.actions.updateDnaComparisonSources, onStatus: dna.actions.setStatus,
          onPickFromDatabase: dna.actions.openDatabaseForAlignment,
        },
        trace: {
          className: 'map-alignment-trace-list', templateSequence: dna.record.sequence, topology: dna.record.topology,
          traceFiles: dna.traceFiles, onTraceFilesChange: dna.actions.onTraceFilesChange,
          onTracesAdded: dna.actions.handleAlignmentTracesAdded, onTraceNavigate: dna.actions.selectAlignmentTraceFromMap,
          onViewTrace: dna.actions.viewAlignmentTraceFromMap,
          selectedTraceId: dna.selectedAlignmentTraceId, onPickFromDatabase: dna.actions.openDatabaseForAlignment,
          traceAlignBusy: dna.traceAlignBusy, acceptOsFileDrops: false, mode: 'trace' as const,
          isLibrary: dna.isLibrary, onGroupLibraryMembers: dna.isLibrary ? dna.actions.groupLibraryMembers : undefined,
        },
        comparativeMode: dna.dnaAlignmentMode === 'comparative', sidebarWidthPx: dna.mapAlignmentSidebarWidthPx,
        onResize: dna.actions.startMapAlignmentSplitDrag,
        map: {
          record: dna.record, restrictionSites: dna.displayedRestrictionSites, primerBindings: dna.primerBindings,
          annotationFeatures: dna.mapAnnotationFeatures, displaySettings: dna.displaySettings,
          enzymePreferences: dna.enzymePreferences, selectedRange: dna.mapSelectedRange,
          selectedFeatureId: dna.selectedFeatureId, selectedFeatureIds: dna.selectedFeatureIds,
          selectedPrimerId: dna.selectedPrimerId, selectedPrimerIds: dna.selectedPrimerIds,
          selectedRestrictionSites: dna.selectedRestrictionSites,
          traceFiles: dna.dnaAlignmentMode === 'comparative' ? dna.dnaComparisonMapFiles : dna.traceFiles,
          alignmentsVisible: dna.displaySettings.alignments.visible, selectedAlignmentTraceId: dna.selectedAlignmentTraceId,
          onSelectAlignmentTrace: dna.dnaAlignmentMode === 'comparative'
            ? dna.actions.setSelectedAlignmentTraceId : dna.actions.selectAlignmentTraceFromMap,
          onSelect: dna.actions.selectMapFeature, onRangeSelect: dna.actions.selectMapRange,
          onExtendToBase: dna.actions.extendSelectionToBase, onPrimerSelect: dna.actions.selectMapPrimer,
          onRestrictionSelect: dna.actions.selectRestrictionCutFromLabel, onEnzymeInfo: dna.actions.onEnzymeInfo,
          onFeatureEdit: dna.actions.openFeatureEditorForFeature, onFeatureOpenAsProtein: dna.actions.openFeatureAsProtein,
          onPrimerEdit: dna.actions.openPrimerEditorForPrimer,
          onRenameRecord: (name) => dna.actions.updateRecord((record) => ({ ...record, name })),
          onEditMapLabel: (label) => dna.actions.updateRecord((record) => ({ ...record, mapLabel: label })),
        },
      } : null,
      library: {
        navigator: dna.libraryNavigator,
        linearMode: dna.displaySettings.mapView.linear,
        zoomed: dna.displaySettings.mapView.zoom,
        linear: {
          record: dna.mapViewRecord, restrictionSites: dna.mapViewRestrictionSites, primerBindings: dna.mapViewPrimerBindings,
          annotationFeatures: dna.mapViewAnnotationFeatures, displaySettings: dna.displaySettings,
          enzymePreferences: dna.enzymePreferences, selectedRange: dna.mapViewSelectedRange,
          selectedFeatureId: dna.selectedFeatureId, selectedFeatureIds: dna.selectedFeatureIds,
          selectedPrimerId: dna.selectedPrimerId, selectedPrimerIds: dna.selectedPrimerIds,
          selectedRestrictionSites: dna.libraryMemberBrowse ? [] : dna.selectedRestrictionSites,
          traceFiles: dna.traceFiles,
          alignmentsVisible: false, selectedAlignmentTraceId: dna.selectedAlignmentTraceId,
          onSelectAlignmentTrace: dna.actions.setSelectedAlignmentTraceId, onSelect: dna.actions.selectMapFeature,
          onRangeSelect: dna.actions.selectMapRange, onExtendToBase: dna.actions.extendSelectionToBase,
          onPrimerSelect: dna.actions.selectMapPrimer, onRestrictionSelect: dna.actions.selectRestrictionCutFromLabel,
          onEnzymeInfo: dna.actions.onEnzymeInfo, onFeatureEdit: dna.actions.editMapFeature,
          onFeatureOpenAsProtein: dna.libraryMemberBrowse ? undefined : dna.actions.openFeatureAsProtein,
          onPrimerEdit: dna.actions.editMapPrimer,
          viewRange: dna.displaySettings.mapView.zoom ? dna.mapZoomRange : null,
          onViewRangeChange: dna.actions.handleMapZoomRangeChange,
          onRenameRecord: dna.libraryMemberBrowse ? undefined : (name) => dna.actions.updateRecord((record) => ({ ...record, name })),
          onEditMapLabel: dna.libraryMemberBrowse ? undefined : (label) => dna.actions.updateRecord((record) => ({ ...record, mapLabel: label })),
        },
        circular: {
          record: dna.mapViewRecord, restrictionSites: dna.mapViewRestrictionSites, primerBindings: dna.mapViewPrimerBindings,
          annotationFeatures: dna.mapViewAnnotationFeatures, displaySettings: dna.displaySettings,
          enzymePreferences: dna.enzymePreferences, selectedRange: dna.mapViewSelectedRange,
          selectedFeatureId: dna.selectedFeatureId, selectedFeatureIds: dna.selectedFeatureIds,
          selectedPrimerId: dna.selectedPrimerId, selectedPrimerIds: dna.selectedPrimerIds,
          selectedRestrictionSites: dna.libraryMemberBrowse ? [] : dna.selectedRestrictionSites,
          onSelect: dna.actions.selectMapFeature, onRangeSelect: dna.actions.selectMapRange,
          onExtendToBase: dna.actions.extendSelectionToBase, onPrimerSelect: dna.actions.selectMapPrimer,
          onRestrictionSelect: dna.actions.selectRestrictionCutFromLabel, onEnzymeInfo: dna.actions.onEnzymeInfo,
          onFeatureEdit: dna.actions.editMapFeature,
          onFeatureOpenAsProtein: dna.libraryMemberBrowse ? undefined : dna.actions.openFeatureAsProtein,
          onPrimerEdit: dna.actions.editMapPrimer, onDisplaySettingsChange: dna.actions.onChange,
          onSaveVisualSettings: dna.actions.saveMapVisualSettings, onRevertVisualSettings: dna.actions.revertMapVisualSettings,
          onRenameRecord: dna.libraryMemberBrowse ? undefined : (name) => dna.actions.updateRecord((record) => ({ ...record, name })),
          onEditMapLabel: dna.libraryMemberBrowse ? undefined : (label) => dna.actions.updateRecord((record) => ({ ...record, mapLabel: label })),
        },
      },
    } : null,
  }
}
