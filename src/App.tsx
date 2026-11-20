import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type CSSProperties } from 'react'
import { X } from 'lucide-react'
import { enzymes } from './domain/enzymes'
import { loadEnzymePreferences, normalizeEnzymePreferences, type EnzymePreferences } from './domain/enzymePreferences'

import { type DnaComparisonSource } from './domain/dnaComparisonTypes'
import { sgRnaOligoDirectionFromName } from './domain/annealedOligos'
import { alignmentSidebarWidthPx } from './components/AlignmentTraceFileList'
import { isDnaLibraryRecord } from './domain/dnaLibrary'
import { beginOperationProgress } from './domain/operationProgress'
import { parseAlignmentTraceFiles } from './domain/alignmentTraceImport'
import { getLibraryReferenceMemberId, withPackedLibraryMemberFeatures } from './domain/libraryMemberFeatures'
import { buildLibraryMemberTabRow, sortLibraryMemberTabRows } from './domain/libraryMemberTab'
import { saveMountedDocument } from './documentSave'
import { prepareMountedDocumentImport } from './mountedDocumentImport'
import { ActionProfileOverlay } from './components/ActionProfileOverlay'
import { AlignmentProfileOverlay } from './components/AlignmentProfileOverlay'
import { actionProfileAsync, actionProfileSync, flushSequenceEditLatency, markSequenceEditStart } from './domain/actionProfiler'
import { type TraceFileRecord } from './domain/traceTypes'
import { createSequenceRecordFromNewDnaFile } from './domain/newDnaFile'
import { createSequenceRecordFromNewProteinFile } from './domain/newProteinFile'
import type { BinderNumbering, BinderStructure } from './domain/binderStructure'
import { dnaSequenceDigest } from './domain/proteinTranslationProvenance'
import { normalizeConstructFileName } from './domain/constructFileName'
import { matchesMobileShellViewport } from './ui/mobileShellMedia'
import { desktopEnzymeCutAnchorStatus, mobileEnzymeCutAnchorStatus, mobilePrimerAnchorStatus, resolveMobileEnzymeCutPairExtend, resolveMobilePrimerPairExtend } from './ui/mobilePairSelection'
import { shouldShowDescriptionPanelOnOpen, type AppPreferences } from './domain/appPreferences'
import { buildBugReportAppSnapshot } from './domain/bugReportDiagnostics'
import { type FeatureEditorState } from './domain/featureQualifiers'
import { addUserCommonFeatures, getAllCommonFeatures, listUserCommonFeatures, mergeUserCommonFeatures } from './storage/userCommonFeatures'
import { addCommonPrimers, listCommonPrimers } from './storage/commonPrimers'
import { filterPrimersByTag, loadPrimerTagMap } from './storage/databasePrimers'
import { listCustomMwLadders, mergeCustomMwLadders } from './storage/customMwLadders'
import { cloneFixture } from './domain/fixtures'
import { normalizePrimerHybridizationParams } from './domain/primerHybridization'
import { requestDocumentExit as requestDocumentExitWorkflow, resolveDocumentExit as resolveDocumentExitWorkflow, type PendingDocumentExit } from './application/documentExit/documentExit'
import { selectionRangeFromOneBased } from './application/selectionEditing/selectionEditing'
import { CrisprExcisionDialog } from './CrisprExcisionDialog'
import { SangerAllelesDialog } from './SangerAllelesDialog'
import { buildFeatureSelectionMenuGates } from './presentation/workspaceTabs/featurePaneProjection'
import { useWorkspaceViewProjection } from './presentation/workspace/useWorkspaceViewProjection'
import { useDocumentDraftLifecycle } from './presentation/hooks/useDocumentDraftLifecycle'
import { useDocumentHistoryState } from './presentation/hooks/useDocumentHistoryState'
import { useBootHandoffMountLifecycle } from './presentation/hooks/useBootHandoffMountLifecycle'
import { useRecentDocumentLifecycle } from './presentation/hooks/useRecentDocumentLifecycle'
import { useDesktopWindowLifecycle } from './presentation/hooks/useDesktopWindowLifecycle'
import { useDesktopFileDropLifecycle } from './presentation/hooks/useDesktopFileDropLifecycle'
import { useOpenTabSessionLifecycle } from './presentation/hooks/useOpenTabSessionLifecycle'
import { useWorkspaceDocumentRegistryLifecycle } from './presentation/hooks/useWorkspaceDocumentRegistryLifecycle'
import { useLibraryAlignmentTraceSelectionLifecycle } from './presentation/hooks/useLibraryAlignmentTraceSelectionLifecycle'
import { useMembersTabCloseLifecycle } from './presentation/hooks/useMembersTabCloseLifecycle'
import { useActiveWorkspaceTabRoutingLifecycle } from './presentation/hooks/useActiveWorkspaceTabRoutingLifecycle'
import { useProjectRefreshLifecycle } from './presentation/hooks/useProjectRefreshLifecycle'
import { useSaveToolbarModePersistenceLifecycle } from './presentation/hooks/useSaveToolbarModePersistenceLifecycle'
import { useWorkspaceDocumentTitleLifecycle } from './presentation/hooks/useWorkspaceDocumentTitleLifecycle'
import { browserDocumentTitle } from './presentation/browserDocumentTitle'
import { useHybridDatabasePayloadLifecycle } from './presentation/hooks/useHybridDatabasePayloadLifecycle'
import { useRegisteredAppKeyboardShortcutLifecycle } from './presentation/hooks/useRegisteredAppKeyboardShortcutLifecycle'
import { useCloseOnOutsidePointer } from './presentation/hooks/useCloseOnOutsidePointer'
import { useAlignmentOrchestration } from './presentation/hooks/useAlignmentOrchestration'
import {
  useSequenceTabMountScrollLifecycleEffects,
  useSequenceTabScrollHost,
} from './presentation/hooks/useSequenceTabMountScrollLifecycle'
import { useEnzymeSetWorkflowController } from './presentation/hooks/useEnzymeSetWorkflowController'
import { useCloningWorkspaceController } from './presentation/hooks/useCloningWorkspaceController'
import { useCloningCompletionHandlers } from './presentation/hooks/useCloningCompletionHandlers'
import { useHelpDialogsController } from './presentation/hooks/useHelpDialogsController'
import { useUtilityDialogsController } from './presentation/hooks/useUtilityDialogsController'
import type { AgaroseGelDialogSnapshot } from './application/agaroseGel/agaroseGelDialogOpenPlan'
import { useAnalysisToolDialogsController } from './presentation/hooks/useAnalysisToolDialogsController'
import { useAgaroseGelDialogController } from './presentation/hooks/useAgaroseGelDialogController'
import { createAppPreferencesExternalSync } from './presentation/appPreferences/createAppPreferencesExternalSync'
import {
  createEnzymePreferencesExternalSync,
  persistWorkspaceEnzymePreferences,
} from './workspaceEnzymePreferences'
import { useWorkspaceDisplaySettingsController } from './presentation/hooks/useWorkspaceDisplaySettingsController'
import { useWorkspaceEnzymePreferencesController } from './presentation/hooks/useWorkspaceEnzymePreferencesController'
import { useDatabaseLibraryController } from './presentation/hooks/useDatabaseLibraryController'
import { useDatabaseLibraryMemberActions } from './presentation/hooks/useDatabaseLibraryMemberActions'
import { useDatabaseHybridResults } from './presentation/hooks/useDatabaseHybridResults'
import { useDatabaseAlignmentIntakeController } from './presentation/hooks/useDatabaseAlignmentIntakeController'
import {
  useDatabaseHybridWorkflowCallbacks,
  useDatabaseManagerDialogController,
  useSequenceDatabaseImportDialogController,
} from './presentation/hooks/useDatabaseDialogsWorkflow'
import { usePrimerManagementController } from './presentation/hooks/usePrimerManagementController'
import {
  useSelectionEditingController,
  useSequenceClipboardController,
  useSequenceEditingActions,
  useSelectionEditingWorkflowActions,
  useSelectionRangeController,
  useDnaSequenceEditController,
  type DocumentHistorySnapshot,
} from './presentation/hooks/useSelectionEditingController'
import { CloningRecordWorkspace } from './presentation/cloning/CloningRecordWorkspace'
import { mergeDisplaySettingsFromProject } from './presentation/cloning/displaySettings'
import { planBootDisplaySettings } from './presentation/cloning/displaySettingsTransitionPlan'
import { PcrRecordWorkspace } from './presentation/pcr/PcrRecordWorkspace'
import {
  DEFAULT_PRIMER_COLUMN_WIDTHS,
  PRIMER_COLUMN_ORDER,
} from './presentation/primers/PrimerTablePresentation'
export { CloningRecordWorkspace }
import { DescriptionPanel } from './presentation/document/DescriptionPanel'
import {
  KOFI_SUPPORT_URL,
  recentFileDetail,
  WorkspaceDocumentMenus,
} from './presentation/documentMenus'
import {
  ProteinPropertiesPane,
} from './presentation/protein'
import {
  withAlignmentsVisibility,
  type OrfTranslationDraft,
} from './presentation/dnaViewControls'
import { mapZoomCaretPosition } from './presentation/map'
import { featureDisplayName, siteKey } from './presentation/map/mapPrimitives'
import {
  defaultDisplaySettings,
  isMobileShellViewport,
  selectionLength,
  type DisplaySettings,
  type EnzymeTabPositionMode,
  type MemberColumnId,
  type PrimerColumnId,
  type SelectionRange,
  type WorkspaceTab,
} from './presentation/sequence'
import { exportFasta, exportGenBank } from './domain/parsers'
import { parseAb1BytesToSequenceRecord, parseAb1File } from './domain/ab1Parser'
import { capabilitiesForRecord, formatSequenceLength, preferredDefaultWorkspaceTab, retainedOrDefaultWorkspaceTab } from './domain/moleculeCapabilities'
import { SEQUENCE_OPEN_ACCEPT, serializeProjectFile } from './domain/fileFormats'
import { nativeOverwriteAvailability, saveToolbarModeOptions, snapGeneExtensionForMolecule, snapGeneFormatForMolecule, workspaceTitleName as resolveWorkspaceTitleName, workspaceWindowTitle } from './domain/projectSaveSemantics'
import { workspaceDocumentBindingForOrigin, type WorkspaceDocumentOrigin } from './domain/workspaceDocumentOrigin'
import { exportSettingsJson, isSettingsFile, parseSettingsJson } from './domain/settingsFile'
import { clearPersistedVisualSettings, loadPersistedVisualSettings, persistVisualSettingsFromPatch, savePersistedVisualSettings } from './domain/displaySettingsPreferences'
import { snapGeneExportOptionsFromEnzymeDisplay } from './domain/snapgeneEnzymeData'
import { loadMwLadderFavorites, saveMwLadderFavorites } from './storage/mwLadderFavorites'
import { richClipboardMatchesPasteText } from './domain/richClipboard'
import { addOperation, createId, restrictionCutAnchorStrandSelection, restrictionFragmentStrandSelection, formatRange } from './domain/sequence'
import { type ProteinBond, type SequenceFeature, type SequenceRecord } from './domain/types'
import { deleteProject, getProject, listProjectSummaries, normalizeProjectFileName, saveProject, type StoredProject, type StoredProjectSummary } from './storage/projects'
import { resolveMappedFolderDefaultSavePath } from './storage/databaseExport'
import { subscribeLibraryChanged } from './storage/libraryEvents'
import { clearSessionDraftForRecord, trimSessionDraftsToLimit } from './storage/sessionDraft'
import { removeRecentDatabaseProject, touchRecentDatabaseProject, touchRecentLocalFile, trimRecentFilesToLimit } from './storage/recentFiles'
import { subscribeCrossTabMessages } from './crossTab/channel'
import { clearOtherOpenTabs, getFreshOpenTabSession, getOpenTabSession, listOtherOpenTabs, pruneStaleOpenTabs, removeOpenTab, removeOpenTabs, upsertOpenTab } from './crossTab/openTabs'
import { clearSharedFragment, getSharedFragment, shareFragment } from './crossTab/sharedFragment'
import { getRichClipboardForPaste, storeRichClipboard } from './crossTab/richClipboard'
import { getTabId } from './crossTab/tabId'
import { type OpenTabSummary, type SharedFragment } from './crossTab/types'
import { readSaveToolbarMode, writeSaveToolbarMode, type SaveToolbarMode } from './storage/saveToolbarPrefs'
import { folderPathLabel, listFolders, renameProjectFileName } from './storage/projectLibrary'
import { PrimerDialogsHost } from './presentation/dialogs/PrimerDialogsHost'
import { AnnotationDialogsHost } from './presentation/dialogs/AnnotationDialogsHost'
import { HelpDialogsRegion, UtilityBugReportDialogsRegion } from './presentation/dialogs/HelpUtilityDialogsRegion'
import { DocumentLifecycleDialogsHost } from './presentation/dialogs/DocumentLifecycleDialogsHost'
import { CloningWorkflowDialogsHost } from './presentation/dialogs/CloningWorkflowDialogsHost'
import { CloningAssemblyDialogsHost } from './presentation/dialogs/CloningAssemblyDialogsHost'
import { EnzymeDialogsHost } from './presentation/dialogs/EnzymeDialogsHost'
import { DatabaseDialogsHost } from './presentation/dialogs/DatabaseDialogsHost'
import { HistoryDialogsHost } from './presentation/dialogs/HistoryDialogsHost'
import { CrisprWorkflowDialogsHost } from './presentation/dialogs/CrisprWorkflowDialogsHost'
import { FeatureEditingDialogsHost } from './presentation/dialogs/FeatureEditingDialogsHost'
import { DatabaseAnnotationDialogsHost } from './presentation/dialogs/DatabaseAnnotationDialogsHost'
import { SelectionTranslationDialogsHost } from './presentation/dialogs/SelectionTranslationDialogsHost'
import { useFeatureStructureController } from './presentation/hooks/useFeatureStructureController'
import { useFeatureAnnotationController } from './presentation/hooks/useFeatureAnnotationController'
import { useCrisprFeatureController } from './presentation/hooks/useCrisprFeatureController'
import { useFeatureEditorController } from './presentation/hooks/useFeatureEditorController'
import { useDnaLibraryWorkflowController } from './presentation/hooks/useDnaLibraryWorkflowController'
import { useProteinComparisonController } from './presentation/hooks/useProteinComparisonController'
import { useProteinAnnotationController } from './presentation/hooks/useProteinAnnotationController'
import { useProteinBondController } from './presentation/hooks/useProteinBondController'
import { usePaneSortController } from './presentation/hooks/usePaneSortController'
import { useFeaturePaneInteractionController } from './presentation/hooks/useFeaturePaneInteractionController'
import { usePrimerSelectionController } from './presentation/hooks/usePrimerSelectionController'
import { usePrimerOrSgRnaDeleteCommand } from './presentation/hooks/usePrimerOrSgRnaDeleteCommand'
import { useFeatureOrProteinBondCommands } from './presentation/hooks/useFeatureOrProteinBondCommands'
import { usePrimerLibraryWorkflowController } from './presentation/hooks/usePrimerLibraryWorkflowController'
import { usePrimerImportExportController } from './presentation/hooks/usePrimerImportExportController'
import { useRestrictionSiteNavigationController } from './presentation/hooks/useRestrictionSiteNavigationController'
import { useDocumentImportController, type TraceDocumentState } from './presentation/hooks/useDocumentImportController'
import { useDocumentImportCommitController } from './presentation/hooks/useDocumentImportCommitController'
import { useDocumentFileImportController } from './presentation/hooks/useDocumentFileImportController'
import { useWorkspaceFileDragController } from './presentation/hooks/useWorkspaceFileDragController'
import { useWorkspaceFileDropController } from './presentation/hooks/useWorkspaceFileDropController'
import { useDocumentDiskPersistenceController } from './presentation/hooks/useDocumentDiskPersistenceController'
import { useDatabasePersistenceController } from './presentation/hooks/useDatabasePersistenceController'
import { useDocumentHandoffController } from './presentation/hooks/useDocumentHandoffController'
import { useDocumentHistoryOpenController } from './presentation/hooks/useDocumentHistoryOpenController'
import { useNewDocumentWorkflowController } from './presentation/hooks/useNewDocumentWorkflowController'
import { useSettingsPersistenceController } from './presentation/hooks/useSettingsPersistenceController'
import { useProjectPersistenceController } from './presentation/hooks/useProjectPersistenceController'
import { useDocumentSaveCoordinator } from './presentation/hooks/useDocumentSaveCoordinator'
import { useSharedTabController } from './presentation/hooks/useSharedTabController'
import type { WorkspaceBrowserSupportPorts } from './presentation/hooks/useWorkspaceBrowserSupportController'
import { useWorkspaceBrowserSupportController } from './presentation/hooks/useWorkspaceBrowserSupportController'
import type { HistoryRetentionFeatureExportPorts } from './presentation/hooks/useHistoryRetentionFeatureExportController'
import { useHistoryRetentionFeatureExportController } from './presentation/hooks/useHistoryRetentionFeatureExportController'
import { applyImportedTopology } from './application/documentImport/documentImport'
import { useWorkspaceSearchController } from './presentation/hooks/useWorkspaceSearchController'
import { useWorkspacePanelLayoutController } from './presentation/hooks/useWorkspacePanelLayoutController'
import { useWorkspaceClipboardColorController } from './presentation/hooks/useWorkspaceClipboardColorController'
import { useMobileShellBehavior } from './presentation/hooks/useMobileShellBehavior'
import { useSelectionStatusAttention } from './presentation/hooks/useSelectionStatusAttention'
import { useWorkspaceMapInteractionController } from './presentation/hooks/useWorkspaceMapInteractionController'
import { useWorkspaceMapNavigationController } from './presentation/hooks/useWorkspaceMapNavigationController'
import { useWorkspaceTopologyDisplayController } from './presentation/hooks/useWorkspaceTopologyDisplayController'
import { useWorkspaceDocumentOriginState } from './presentation/hooks/useWorkspaceDocumentOriginState'
import { useWorkspaceAnnotationSelectionController } from './presentation/hooks/useWorkspaceAnnotationSelectionController'
import { MobileAppBar, MobileDocumentMenu, MobileMenuActions } from './presentation/mobileShell'
import { WorkspaceFileInput } from './presentation/workspace/WorkspaceFileInput'
import { WorkspaceMapHost } from './presentation/workspace/WorkspaceMapHost'
import { WorkspaceSequenceHost } from './presentation/workspace/WorkspaceSequenceHost'
import { SelectionStatusBar } from './presentation/workspace/SelectionStatusBar'
import { WorkspaceHistoryTab } from './presentation/workspace/WorkspaceHistoryTab'
import { buildWorkspaceHistoryTabModel } from './presentation/workspace/workspaceHistoryTabViewModel'
import { WorkspaceTabBar } from './presentation/workspace/WorkspaceTabBar'
import { createWorkspaceTabSelectHandler } from './presentation/workspace/workspaceTabBarCommands'
import { buildWorkspaceTabBarModel } from './presentation/workspace/workspaceTabBarViewModel'
import { buildSelectionStatusBarModel } from './presentation/workspace/selectionStatusBarModel'
import {
  formatStrandPairSelectionWithLength,
} from './presentation/workspace/selectionStatus'
import { createWorkspaceMapModel } from './presentation/workspace/workspaceMapViewModel'
import { createWorkspaceSequenceModel } from './presentation/workspace/workspaceSequenceViewModel'
import {
  DEFAULT_MEMBER_COLUMN_WIDTHS,
  EnzymesTabPane,
  FeaturesTabPane,
  MembersTabPane,
  MEMBER_COLUMN_ORDER,
  PrimersTabPane,
} from './presentation/workspaceTabs'
import { useProteinSequenceEditController } from './presentation/hooks/useProteinSequenceEditController'
import { useNativeAppMenuController, type NativeMenuCommands, type NativeMenuLifecycle, type NativeMenuState } from './presentation/documentMenus/useNativeAppMenuController'
import { createDocumentBrowserHandoffAdapters } from './documentBrowserHandoff'
import {
  appDocumentBoot,
  clearBootFileQueryParams,
  clearBootHistoryQueryParams,
  compactHandoffRecordAtLoad,
  hydrateAppBootProteinSources,
  prepareAppDocumentBootstrap,
} from './appDocumentBootstrap'
import type { DnaLibraryCreationCommands, DnaLibraryConvertCommands } from './application/ports/dnaLibraryCommandPorts'
import { WHATS_NEW_VERSION } from './domain/whatsNew'
import { downloadRemoteSequenceDocument, REMOTE_SEQUENCE_QUERY_PARAM } from './remoteSequence'
import { bytesToFile, renameDesktopFile, saveBytesAs, saveTextAs } from './desktop/fileIo'
import { traceDocumentDescriptionPanelVisible, traceDocumentSequenceLayoutClass } from './desktop/traceDocument'
import { notifyHybridPayloadUpdated, openOrFocusHybridWindow, readHybridPayload, subscribeDatabasePrimersDrag, subscribeDatabaseProjectsDrag, subscribeHybridResults, writeHybridPayload } from './desktop/hybridWindows'
import { isNativeDesktopApp, syncNativeAppMenuDrafts, syncNativeAppMenuRecent } from './desktop/nativeAppMenu'
import { nativeMenuLifecycleAdapters } from './desktop/nativeMenuLifecycleAdapters'
import { readClipboardText, setCopyEventText, writeClipboardText } from './desktop/clipboard'
import { isTauriRuntime } from './desktop/tauriRuntime'
import { syncNativeWindowTitle } from './desktop/windowTitle'
import {
  canHandleAppShortcut,
  getShortcutPlatform,
  isEditableShortcutTarget,
  isKeyboardShortcutAvailable,
  matchKeyboardShortcut,
} from './desktop/keyboardShortcuts'
import { pickNativeConvertToLibraryMemberFiles } from './desktop/dnaLibraryNativePickerAdapters'
import { createDnaLibraryInNewWindow, pickAndCreateDnaLibraryInNewWindow } from './desktop/newFileActions'
import { useDnaLibraryCommandController } from './presentation/hooks/useDnaLibraryCommandController'
import { scheduleDatabaseBackgroundSync } from './desktop/syncOnExit'
import type { DatabaseExitSyncProgress } from './application/ports/lifecycle'
import { shouldOpenMenuDocumentInNewWindow } from './application/documentLifecycle/pristineDemoWorkspace'
import { openTraceDocumentInNewWorkspace } from './traceDocumentWorkspaceOpen'
import { applySessionDraftRestoreInPlace } from './presentation/hooks/applySessionDraftRestoreInPlace'
import { DatabaseExitSyncOverlay } from './presentation/workspace/DatabaseExitSyncOverlay'
import { TraceInspectorOverlay } from './presentation/workspace/TraceInspectorOverlay'
import { useTraceInspector } from './presentation/workspace/useTraceInspector'
import { LibraryMapNavigator } from './presentation/map/LibraryMapNavigator'
import { applyDatabaseUiSettings, parseDatabaseUiSettings, readDatabaseUiSettingsForExport } from './storage/databaseUiPrefs'
import { openNewWorkspaceWindow, openWorkspaceWindowWithHandoff } from './desktop/workspaceWindow'
import { claimWorkspaceDocument, releaseWorkspaceDocument } from './desktop/workspaceDocumentRegistry'
import { documentDraftLifecycleAdapters, desktopFileDropLifecycleAdapters, desktopWindowLifecycleAdapters, recentDocumentLifecycleAdapters } from './desktop/documentLifecycleAdapters'
import { openExternalUrl } from './desktop/openExternalUrl'
import { SOURCE_REPOSITORY_URL } from './domain/externalLinks'
import { dataTransferHasFiles } from './domain/workspaceFileDrop'
import './App.css'
const emptyDnaComparisonSources: DnaComparisonSource[] = []

async function downloadText(
  fileName: string,
  contents: string,
  type = 'text/plain',
  options?: { defaultPath?: string },
) {
  return saveTextAs(fileName, contents, type, options)
}

async function downloadBytes(
  fileName: string,
  contents: Uint8Array,
  type = 'application/octet-stream',
  options?: { defaultPath?: string },
) {
  return saveBytesAs(fileName, contents, type, options)
}

const MAX_HISTORY_ENTRIES = 100

function applyBrowserDocumentTitle(title: string) {
  document.title = browserDocumentTitle(title, isTauriRuntime())
}

function App() {
  const tabId = useMemo(() => getTabId(), [])
  const [traceDocument, setTraceDocument] = useState<TraceDocumentState | null>(() => appDocumentBoot.traceDocument)
  const onHistorySnapshotRestoredRef = useRef<(snapshot: DocumentHistorySnapshot) => void>(() => {})
  const sessionDraftRefreshRef = useRef<() => void | Promise<void>>(async () => {})
  const databaseProjectDropHandlerRef = useRef<(projectIds: string[]) => void>(() => {})
  const databasePrimerDropHandlerRef = useRef<(primers: import('./domain/libraryPrimer').LibraryPrimer[]) => void>(() => {})

  const {
    selectedFeatureId,
    setSelectedFeatureId,
    selectedFeatureIds,
    setSelectedFeatureIds,
    featureTabSelectionMemberId,
    setFeatureTabSelectionMemberId,
    featureTabAnchor,
    setFeatureTabAnchor,
    primerTabAnchorId,
    setPrimerTabAnchorId,
    selectedPrimerId,
    setSelectedPrimerId,
    selectedPrimerIds,
    setSelectedPrimerIds,
    selectionFocus,
    setSelectionFocus,
    selectedRange,
    setSelectedRange,
    activeTab,
    setActiveTab,
    cutSelectionAnchor,
    setCutSelectionAnchor,
    cutStrandSelection,
    setCutStrandSelection,
    cutSelectionEnzymes,
    setCutSelectionEnzymes,
    selectionAnchor,
    setSelectionAnchor,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
    clearDocumentSelection,
  } = useSelectionEditingController(
    appDocumentBoot.record,
    appDocumentBoot.traceDocument ? 'Sequence' : preferredDefaultWorkspaceTab(appDocumentBoot.record),
  )
  const documentHistoryPorts = useMemo(
    () => ({
      maxHistoryEntries: MAX_HISTORY_ENTRIES,
      setUndoStack,
      setRedoStack,
      actionProfileSync,
      onHistorySnapshotRestored: (snapshot: DocumentHistorySnapshot) => onHistorySnapshotRestoredRef.current(snapshot),
      clearSessionDraftForRecord,
      refreshSessionDraftsRef: sessionDraftRefreshRef,
    }),
    [setRedoStack, setUndoStack],
  )
  const {
    record,
    setRecord,
    traceFiles,
    traceFilesRef,
    recordRef,
    isDirty,
    isDirtyRef,
    applySavedBaseline,
    markClean,
    markNeverSaved,
    setTraceFilesForRecord,
    onTraceFilesChange,
    updateRecord,
    captureDocumentHistorySnapshot,
    restoreDocumentHistorySnapshot,
    pushDocumentHistorySnapshot,
  } = useDocumentHistoryState(
    {
      initialRecord: appDocumentBoot.record,
      initialTraceFiles: appDocumentBoot.traceFiles,
      initiallyUnsaved: appDocumentBoot.initiallyUnsaved,
    },
    traceDocument,
    documentHistoryPorts,
  )
  const applySavedBaselineRef = useRef(applySavedBaseline)
  const setRecordRef = useRef(setRecord)
  useLayoutEffect(() => {
    applySavedBaselineRef.current = applySavedBaseline
    setRecordRef.current = setRecord
  }, [applySavedBaseline, setRecord])
  const [importedTitleFile, setImportedTitleFile] = useState<{ recordId: string; fileName: string } | null>(null)
  const moleculeCapabilities = useMemo(
    () => capabilitiesForRecord(record),
    [record],
  )
  const availableTabs = useMemo(
    (): readonly WorkspaceTab[] => (traceDocument ? ['Sequence'] : moleculeCapabilities.workspaceTabs),
    [traceDocument, moleculeCapabilities.workspaceTabs],
  )
  const {
    projects,
    setProjects,
    libraryFolderId,
    setLibraryFolderId,
    databaseSaveBusy,
    setDatabaseSaveBusy,
    databaseSaveAsCopyRef,
    selectedLibraryMemberIds,
    setSelectedLibraryMemberIds,
    memberTabAnchorId,
    setMemberTabAnchorId,
    memberTabSortMode,
    setMemberTabSortMode,
    memberTabSortDirection,
    setMemberTabSortDirection,
    membersAddBusy,
    setMembersAddBusy,
    membersAddMenuOpen,
    setMembersAddMenuOpen,
    editingMemberNameId,
    setEditingMemberNameId,
    memberNameDraft,
    setMemberNameDraft,
    combineLibraryReadsOpen,
    setCombineLibraryReadsOpen,
    dedupeLibraryMembersGroups,
    setDedupeLibraryMembersGroups,
    databaseOpen,
    setDatabaseOpen,
    databaseAlignmentPick,
    setDatabaseAlignmentPick,
    databaseLibraryMemberPick,
    setDatabaseLibraryMemberPick,
    convertToLibrarySourceOpen,
    setConvertToLibrarySourceOpen,
    openDatabaseWindow,
    openDatabaseForAlignment,
    openDatabaseForLibraryMembers,
  } = useDatabaseLibraryController({
    initialFolderId: appDocumentBoot.libraryFolderId,
    currentRecordId: record.id,
    openDatabaseWindow: (payload) => openOrFocusHybridWindow('database', payload),
  })
  const agaroseGelHybridPort = useMemo(
    () => ({
      tryOpenAgaroseGelHybridWindow: (snapshot: AgaroseGelDialogSnapshot) =>
        openOrFocusHybridWindow('agarose-gel', snapshot),
    }),
    [],
  )
  const {
    agaroseGelOpen,
    agaroseGelSnapshot,
    openAgaroseGelWindow,
    closeAgaroseGel,
  } = useAgaroseGelDialogController(
    { record, tabId, traceFiles, selectedLibraryMemberIds },
    agaroseGelHybridPort,
  )
  const { workspaceDiskPath, documentOrigin, setDocumentOrigin, setWorkspaceDiskPathWithOrigin } = useWorkspaceDocumentOriginState(appDocumentBoot.workspaceDiskPath, appDocumentBoot.documentOrigin)
  const workspaceTitleName = resolveWorkspaceTitleName({
    constructName: record.name,
    traceFileName: traceDocument?.fileName,
    diskPath: documentOrigin.kind === 'disk' ? documentOrigin.path : null,
    databaseFileName: documentOrigin.kind === 'database'
      ? projects.find(project => project.id === documentOrigin.projectId)?.fileName
      : null,
    importedFileName: importedTitleFile?.recordId === record.id ? importedTitleFile.fileName : null,
  })
  const documentSaveBinding = useMemo(() => isTauriRuntime() ? workspaceDocumentBindingForOrigin(documentOrigin) : 'database', [documentOrigin])
  const saveToolbarOptions = useMemo(
    () => saveToolbarModeOptions(documentSaveBinding, record.molecule),
    [documentSaveBinding, record.molecule],
  )
  const [saveToolbarMode, setSaveToolbarMode] = useState<SaveToolbarMode>(() => readSaveToolbarMode())
  const [saveToDialogOpen, setSaveToDialogOpen] = useState(() => appDocumentBoot.query.openSaveToDatabase)
  const [renameFileDialogOpen, setRenameFileDialogOpen] = useState(false)
  const [nativeFormatSaveProject, setNativeFormatSaveProject] =
    useState<StoredProjectSummary | null>(null)
  const pendingSaveCompletionRef = useRef<(() => void | Promise<void>) | null>(null)
  const [saveMenuOpen, setSaveMenuOpen] = useState(false)
  const [sequenceHoverSiteKey, setSequenceHoverSiteKey] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [enzymePreferences, setEnzymePreferences] = useState<EnzymePreferences>(() => loadEnzymePreferences())
  const [enzymeTabPositionMode, setEnzymeTabPositionMode] = useState<EnzymeTabPositionMode>(
    () => loadEnzymePreferences().defaultTab,
  )
  const [expandedMobileEnzymeLocations, setExpandedMobileEnzymeLocations] = useState<Set<string>>(() => new Set())
  const {
    enzymeTabSortMode, enzymeTabSortDirection,
    featureTabSortMode, featureTabSortDirection,
    primerTabSortMode, primerTabSortDirection,
    oligoTabSortMode, oligoTabSortDirection,
    sgRnaTabSortMode, sgRnaTabSortDirection,
    toggleEnzymeTabSort, toggleFeatureTabSort, togglePrimerTabSort,
    toggleOligoTabSort, toggleSgRnaTabSort,
  } = usePaneSortController()
  const [memberReorderDropBeforeId, setMemberReorderDropBeforeId] = useState<string | null | undefined>(undefined)
  const [memberReorderSourceId, setMemberReorderSourceId] = useState<string | null>(null)
  const memberReorderDragActiveRef = useRef(false)
  const [primerColumnWidths, setPrimerColumnWidths] = useState<Record<PrimerColumnId, number>>(
    () => ({ ...DEFAULT_PRIMER_COLUMN_WIDTHS }),
  )
  const primerTableMinWidthPx = useMemo(
    () => PRIMER_COLUMN_ORDER.reduce((sum, id) => sum + primerColumnWidths[id], 0),
    [primerColumnWidths],
  )
  const [memberColumnWidths, setMemberColumnWidths] = useState<Record<MemberColumnId, number>>(
    () => ({ ...DEFAULT_MEMBER_COLUMN_WIDTHS }),
  )
  const memberTableMinWidthPx = useMemo(
    () => MEMBER_COLUMN_ORDER.reduce((sum, id) => sum + memberColumnWidths[id], 0),
    [memberColumnWidths],
  )
  const [searchHitIndex, setSearchHitIndex] = useState(0)
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() =>
    planBootDisplaySettings(appDocumentBoot.record.topology, {
      openedFromHandoff: appDocumentBoot.openedFromHandoff,
      sequenceLength: appDocumentBoot.record.sequence.length,
    }),
  )
  const {
    updateDisplaySection,
    applyDefaultMapViewForTopology,
    hideAlignmentsForMemberSequenceView,
    applyProteinAlignmentDisplayPatch,
  } = useWorkspaceDisplaySettingsController({
    setDisplaySettings,
    activeTab,
  })
  const [mapZoomRange, setMapZoomRange] = useState<SelectionRange | null>(null)
  /** Slider thumb position is source of truth; window length is derived from it (avoids round-trip shiver). */
  const [mapZoomSlider, setMapZoomSlider] = useState(0)
  const mapZoomLinearBeforeRef = useRef<boolean | null>(null)
  const [selectRangeOpen, setSelectRangeOpen] = useState(false)
  const [sangerAlleles, setSangerAlleles] = useState<{ record: SequenceRecord; traces: TraceFileRecord[] } | null>(null)
  const [editMapLabelOpen, setEditMapLabelOpen] = useState(false)
  const [translationOptionsDraft, setTranslationOptionsDraft] = useState<OrfTranslationDraft | null>(null)
  const [pendingDocumentExit, setPendingDocumentExit] = useState<PendingDocumentExit | null>(null)
  const pendingDocumentExitRef = useRef<PendingDocumentExit | null>(null)
  useLayoutEffect(() => {
    pendingDocumentExitRef.current = pendingDocumentExit
  })
  const [databaseExitSyncProgress, setDatabaseExitSyncProgress] =
    useState<DatabaseExitSyncProgress | null>(null)
  const desktopCloseInProgressRef = useRef(false)
  const [otherOpenTabs, setOtherOpenTabs] = useState<OpenTabSummary[]>([])
  const [pendingSharedFragment, setPendingSharedFragment] = useState<SharedFragment | null>(null)
  const [selectedAlignmentTraceId, setSelectedAlignmentTraceId] = useState<string | null>(null)
  const [initialDescriptionPanelWidthPx] = useState(() => {
    try {
      const raw = window.localStorage.getItem('vibegene:description-panel-width')
      const parsed = raw ? Number(raw) : NaN
      if (Number.isFinite(parsed)) return Math.max(220, Math.min(560, parsed))
    } catch {
      /* ignore */
    }
    return 270
  })
  const workspacePanelLayout = useWorkspacePanelLayoutController({
    recordId: record.id,
    traceDocument: Boolean(traceDocument),
    initialMapAlignmentSidebarWidthPx: alignmentSidebarWidthPx,
    initialDescriptionPanelWidthPx,
    initiallyDescriptionVisible: !isMobileShellViewport() && shouldShowDescriptionPanelOnOpen(),
    isMobileShell: isMobileShellViewport,
    shouldShowDescriptionPanelOnOpen,
    persistDescriptionPanelWidth: (width) => {
      try { window.localStorage.setItem('vibegene:description-panel-width', String(width)) } catch { /* ignore */ }
    },
    pointerTarget: window,
    bodyClassList: document.body.classList,
  })
  const {
    mapAlignmentSidebarWidthPx,
    descriptionPanelVisible,
    setDescriptionPanelVisible,
    descriptionPanelWidthPx,
    startMapAlignmentSplitDrag,
    startDescriptionPanelSplitDrag,
  } = workspacePanelLayout
  const effectiveDescriptionPanelVisible = traceDocumentDescriptionPanelVisible(
    descriptionPanelVisible,
    Boolean(traceDocument),
  )
  const {
    isMobileShell,
    mobileMenuOpen,
    setMobileMenuOpen,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    mobileSearchOpen,
    setMobileSearchOpen,
    mobileMenuButtonRef,
    mobileSidebarButtonRef,
    mobileDescriptionButtonRef,
  } = useMobileShellBehavior({
    descriptionPanel: {
      visible: effectiveDescriptionPanelVisible,
      setVisible: setDescriptionPanelVisible,
    },
  })
  const [status, setStatus] = useState(() =>
    appDocumentBoot.openError
      ? `Could not open file: ${appDocumentBoot.openError}`
      : appDocumentBoot.openedFromHandoff
      ? appDocumentBoot.sourceHydrationPending
        ? `Opened ${appDocumentBoot.record.name}; loading source DNA history…`
        : appDocumentBoot.remoteSourceUrl
          ? `Opened ${appDocumentBoot.record.name} from ${new URL(appDocumentBoot.remoteSourceUrl).host} (${formatSequenceLength(appDocumentBoot.record.sequence.length, appDocumentBoot.record.molecule)}).`
          : `Opened ${appDocumentBoot.record.name} (${formatSequenceLength(appDocumentBoot.record.sequence.length, appDocumentBoot.record.molecule)}).`
      : 'Loaded representative research-lab plasmid fixture.',
  )
  const { statusAttentionKey, statusHistory } = useSelectionStatusAttention(status)
  const [featureEditor, setFeatureEditor] = useState<FeatureEditorState | null>(null)
  const [proteinFeatureEditor, setProteinFeatureEditor] = useState<SequenceFeature | null>(null)
  const [selectedProteinBondId, setSelectedProteinBondId] = useState<string | null>(null)
  const [featuresImportFromFileOpen, setFeaturesImportFromFileOpen] = useState(false)
  const [commonFeaturesBrowseOpen, setCommonFeaturesBrowseOpen] = useState(false)
  const {
    restrictionCloningOpen,
    setRestrictionCloningOpen,
    restrictionCloningMode,
    massRestrictionResult,
    setMassRestrictionResult,
    blockedBatchOpen,
    setBlockedBatchOpen,
    gibsonAssemblyOpen,
    setGibsonAssemblyOpen,
    gibsonAssemblyMethod,
    taGcCloningOpen,
    setTaGcCloningOpen,
    taGcCloningMethod,
    gatewayCloningOpen,
    gatewayCloningMethod,
    mutagenesisOpen,
    setMutagenesisOpen,
    pcrOpen,
    setPcrOpen,
    pcrInvocation,
    retainedCloningDialogs,
    discardCloningDialog,
    cloningDialogLifecycle,
    openRestrictionCloning,
    openGibsonAssembly,
    openTaGcCloning,
    openGatewayCloning,
    openRetainedPcr,
    openRetainedMutagenesis,
  } = useCloningWorkspaceController({ reportLazyLoadFailure: setStatus })
  const subscribeAppPreferencesExternalSync = useMemo(
    () => createAppPreferencesExternalSync({
      isTauriRuntime,
      listenTauriPreferencesChanged: async (handler) => {
        const { listen } = await import('@tauri-apps/api/event')
        return listen<AppPreferences>('vg-app-preferences-changed', (event) => {
          handler(event.payload)
        })
      },
    }),
    [],
  )
  const preferenceSavePortsRef = useRef({
    trimSessionDraftsToLimit: async (limit: number) => { await trimSessionDraftsToLimit(limit) },
    refreshSessionDrafts: async () => {},
    trimRecentFilesToLimit: (limit: number) => { trimRecentFilesToLimit(limit) },
    refreshRecentFiles: () => {},
  })
  const preferenceSavePorts = useMemo(() => ({
    trimSessionDraftsToLimit: (limit: number) => preferenceSavePortsRef.current.trimSessionDraftsToLimit(limit),
    refreshSessionDrafts: async () => { await preferenceSavePortsRef.current.refreshSessionDrafts() },
    trimRecentFilesToLimit: (limit: number) => { preferenceSavePortsRef.current.trimRecentFilesToLimit(limit) },
    refreshRecentFiles: () => { preferenceSavePortsRef.current.refreshRecentFiles() },
  }), [])
  const initialRemoteSequenceOpenError =
    appDocumentBoot.openError && new URLSearchParams(window.location.search).has(REMOTE_SEQUENCE_QUERY_PARAM)
      ? { message: appDocumentBoot.openError }
      : null
  const helpDialogs = useHelpDialogsController()
  const analysisToolDialogs = useAnalysisToolDialogsController()
  const utilityDialogs = useUtilityDialogsController({
    initialRemoteSequenceOpenError,
    whatsNewVersion: WHATS_NEW_VERSION,
    subscribeAppPreferencesExternalSync,
    preferenceSavePorts,
  })
  const {
    appPreferences,
    setGenerateLinkOpen,
    setOpenSequenceUrlOpen,
    remoteSequenceOpenError,
    setRemoteSequenceOpenError,
    setPreferencesOpen,
    setBugReportOpen,
    saveAppPreferences,
    openPreferencesWindow: openPreferencesHybrid,
  } = utilityDialogs
  const {
    setDnaMwOpen,
    setDoubleDigestOpen,
    openLetterCodesWindow: openLetterCodesHybrid,
  } = analysisToolDialogs
  const hybridDialogPort = useMemo(
    () => ({
      tryOpenHybridWindow: (kind: 'preferences' | 'genetic-code-tables') => openOrFocusHybridWindow(kind),
    }),
    [],
  )
  const letterCodesHybridPort = useMemo(
    () => ({ tryOpenLetterCodesHybridWindow: () => openOrFocusHybridWindow('letter-codes') }),
    [],
  )
  const openLetterCodesWindow = useCallback(() => {
    openLetterCodesHybrid(letterCodesHybridPort)
  }, [openLetterCodesHybrid, letterCodesHybridPort])
  const openPreferencesWindow = useCallback(() => {
    openPreferencesHybrid(hybridDialogPort)
  }, [openPreferencesHybrid, hybridDialogPort])
  const openGeneticCodeTablesWindow = useCallback(() => {
    helpDialogs.openGeneticCodeTablesWindow(hybridDialogPort)
  }, [helpDialogs, hybridDialogPort])
  const [exportFeatureDataOpen, setExportFeatureDataOpen] = useState(false)
  const [dnaEndsEditorOpen, setDnaEndsEditorOpen] = useState(false)
  const [historyManagerOpen, setHistoryManagerOpen] = useState(false)
  const [proteinSourceHistoryManagerOpen, setProteinSourceHistoryManagerOpen] = useState(false)
  const [sequenceDatabaseImportOpen, setSequenceDatabaseImportOpen] = useState(false)
  const [proteinBondEditor, setProteinBondEditor] = useState<ProteinBond | null>(null)
  const [workspaceFileDragActive, setWorkspaceFileDragActive] = useState(false)
  const [pendingTopologyImport, setPendingTopologyImport] = useState<{
    fileName: string
    record: SequenceRecord
    localPath?: string
  } | null>(null)
  const [enzymeInfoName, setEnzymeInfoName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const settingsFileInputRef = useRef<HTMLInputElement | null>(null)
  const primerListInputRef = useRef<HTMLInputElement | null>(null)
  const saveMenuRef = useRef<HTMLDivElement | null>(null)
  const sequenceScrollHost = useSequenceTabScrollHost()
  const {
    sequenceScrollRef,
    sequencePaneMounted,
    sequenceScrollTarget,
    setSequenceScrollTarget,
    queueRevealTarget,
    alignmentScrollToTemplateRef,
    registerTemplateNavigator: handleRegisterTemplateNavigator,
  } = sequenceScrollHost

  const requestDocumentExitRef = useRef<(
    action: () => void | Promise<void>,
    options?: { context?: 'document' | 'window-close' | 'app-quit'; onCancel?: () => void },
  ) => void>(() => {})
  const loadProjectRef = useRef<(project: StoredProject) => Promise<void>>(async () => {})
  const handleFileRef = useRef<(file: File, localPath?: string) => Promise<void>>(async () => {})
  const openRecordInNewTabRef = useRef<typeof openRecordInNewTab>(() => {})
  const restoreDraftInPlaceRef = useRef<(draft: SequenceRecord) => void>(() => {})
  const openDraftInNewTabRef = useRef<(draft: SequenceRecord) => void>(() => {})

  useCloseOnOutsidePointer(saveMenuOpen, saveMenuRef, setSaveMenuOpen)

  useSaveToolbarModePersistenceLifecycle({
    saveToolbarMode,
    writeSaveToolbarMode,
  })
  useWorkspaceDocumentTitleLifecycle({
    workspaceTitleName,
    isDirty,
    documentSaveBinding,
    showSource: isTauriRuntime(),
    setDocumentTitle: applyBrowserDocumentTitle,
    syncNativeWindowTitle,
  })
  const draftLifecycle = useDocumentDraftLifecycle({
    ...documentDraftLifecycleAdapters,
    tabId, record, traceFiles,
    isDirty,
    recordRef,
    traceFilesRef,
    isDirtyRef,
    maxUnsavedDrafts: appPreferences.maxUnsavedDrafts,
    requestExit: (action) => requestDocumentExitRef.current(action),
    shouldOpenInNewWindow: () => shouldOpenMenuDocumentInNewWindow(isTauriRuntime(), recordRef.current, workspaceDiskPath, libraryFolderId, isDirtyRef.current),
    openRecordInNewTab: (draft) => openDraftInNewTabRef.current(draft),
    restoreInPlace: (draft) => restoreDraftInPlaceRef.current(draft),
    setStatus,
  })
  const {
    sessionDrafts,
    sessionDraftsRef,
    refreshSessionDrafts,
    refreshSessionDraftsRef,
    restoreSessionDraft,
    discardSessionDraft, suppressDraftSaveBeforeClose,
  } = draftLifecycle

  const requestDocumentExit = useCallback(
    (
      action: () => void | Promise<void>,
      options?: { context?: 'document' | 'window-close' | 'app-quit'; onCancel?: () => void },
    ) => {
      requestDocumentExitWorkflow(action, {
        isDirty: () => isDirtyRef.current,
        stage: setPendingDocumentExit,
      }, options)
    },
    [isDirtyRef],
  )
  const refreshOtherOpenTabs = useCallback(async () => {
    await pruneStaleOpenTabs(tabId)
    const tabs = await listOtherOpenTabs(tabId)
    setOtherOpenTabs(tabs)
  }, [tabId])
  const {
    alignmentsVisible,
    dnaAlignmentMode,
    libraryComparativeMemberIds,
    dnaComparisonSources,
    dnaComparisonEntries,
    dnaComparisonPending,
    dnaComparisonMapFiles,
    traceAlignBusy,
    setTraceAlignBusy,
    tracesNeedRealign,
    setTracesNeedRealign,
    lastAlignedSequenceRef,
    requestAlignmentSequenceScroll,
  } = useAlignmentOrchestration({
    record,
    setRecord,
    traceFiles,
    traceFilesRef,
    displaySettings,
    alignmentsSupported: moleculeCapabilities.alignments,
    activeTab,
    onTraceFilesChange,
    alignmentScrollToTemplateRef,
  })
  // Trace handoff carries the workspace selection into the viewer only when that
  // selection is template-coordinate; member-native library browse passes none.
  const { target: traceInspectorTarget, openTraceInspector, closeTraceInspector } = useTraceInspector({
    traceFiles, selectedRange, alignmentsVisible, recordIsDnaLibrary: isDnaLibraryRecord(record), focusedTraceId: selectedAlignmentTraceId })
  useLayoutEffect(() => {
    onHistorySnapshotRestoredRef.current = (snapshot) => {
      lastAlignedSequenceRef.current = snapshot.record.sequence
      setTracesNeedRealign(false)
    }
  }, [lastAlignedSequenceRef, setTracesNeedRealign])
  useLayoutEffect(() => {
    sessionDraftRefreshRef.current = refreshSessionDraftsRef.current
  }, [refreshSessionDraftsRef])
  const sharedTabController = useSharedTabController({
    tabId,
    record,
    selectedRange,
    cutStrandSelection,
    otherOpenTabs,
    requestDocumentExit: (action) => requestDocumentExit(action),
    shareFragment: async (fragment) => { await shareFragment(fragment) },
    getOpenTabSession,
    removeOpenTab,
    removeOpenTabs: async (ids) => { await removeOpenTabs(ids) },
    clearOtherOpenTabs,
    refreshOtherOpenTabs,
    setRecord,
    setActiveTabMap: () => setActiveTab('Map'),
    setTraceFiles: (recordId, traces) => setTraceFilesForRecord(recordId, traces),
    setSelectedFeatureId,
    setSelectedPrimerId,
    setSelectionFocus,
    setSelectedRange,
    setLastAlignedSequence: (sequence) => { lastAlignedSequenceRef.current = sequence },
    setTracesNeedRealign,
    applyDefaultMapViewForTopology,
    markClean,
    setStatus,
  })

  const documentImportController = useDocumentImportController({
    record,
    traceDocument,
    setTraceDocument,
    setRecord,
    setTraceFiles: (recordId, traces) => setTraceFilesForRecord(recordId, traces),
    setLibraryFolderId,
    setWorkspaceDiskPath: setWorkspaceDiskPathWithOrigin,
    clearDocumentSelection,
    setActiveTab,
    setActiveTabForRecord: (nextRecord) => setActiveTab((current) => retainedOrDefaultWorkspaceTab(current, nextRecord)),
    applyDefaultMapViewForTopology,
    setAlignmentsVisible: () => setDisplaySettings((current) => ({
      ...current,
      alignments: { ...current.alignments, visible: true, mode: 'trace' },
    })),
    setLastAlignedSequence: (sequence) => { lastAlignedSequenceRef.current = sequence },
    setTracesNeedRealign,
    setNeverSaved: markNeverSaved,
    markClean,
    touchRecentLocalFile,
    setStatus,
    addImportOperation: (nextRecord, fileName) => addOperation(nextRecord, 'import', `Imported ${fileName}.`),
    parseTrace: (bytes, fileName) => parseAb1File(bytesToFile(fileName, bytes)),
    parseTraceShell: (bytes, fileName) => {
      try {
        return parseAb1BytesToSequenceRecord(bytes, fileName)
      } catch {
        return null
      }
    },
    createTraceFallback: (fileName) => ({
      ...cloneFixture(),
      id: createId('trace-doc'),
      name: fileName.replace(/\.ab1$/i, '') || fileName,
    }),
    openTraceInNewWorkspace: openTraceDocumentInNewWorkspace,
    setPendingTopologyImport,
  })
  const { openTraceAsSequence, commitImportedRecord, commitUnsavedDownloadedRecord } = documentImportController
  const settingsController = useSettingsPersistenceController({
    record,
    displaySettings,
    defaultDisplaySettings,
    setDisplaySettings: (updater) => setDisplaySettings(updater),
    enzymePreferences,
    setEnzymePreferences,
    setEnzymeTabPositionMode,
    normalizeEnzymePreferences,
    saveEnzymePreferences: persistWorkspaceEnzymePreferences,
    mergeDisplaySettingsFromProject,
    persistVisualSettingsFromPatch,
    savePersistedVisualSettings,
    clearPersistedVisualSettings,
    mergeUserCommonFeatures,
    mergeCustomMwLadders,
    listCustomMwLadders,
    saveMwLadderFavorites,
    listUserCommonFeatures,
    loadMwLadderFavorites,
    readDatabaseUiSettingsForExport,
    parseDatabaseUiSettings: (settings) => parseDatabaseUiSettings(settings as never),
    applyDatabaseUiSettings: (settings) => applyDatabaseUiSettings(settings as never),
    exportSettingsJson,
    downloadText,
    readFileText: (file) => file.text(),
    parseSettingsJson,
    setStatus,
  })
  const {
    handleDownloadSettingsFile,
    saveMapVisualSettings,
    saveSequenceVisualSettings,
    revertMapVisualSettings,
    revertSequenceVisualSettings,
    handleLoadSettingsFile,
  } = settingsController
  const refreshProjectsPortRef = useRef<() => Promise<void>>(async () => {})
  const documentImportCommitController = useDocumentImportCommitController({
    setDisplaySettings: (updater) => setDisplaySettings(updater),
    setRecord,
    setLibraryFolderId,
    setWorkspaceDiskPath: setWorkspaceDiskPathWithOrigin,
    applyDefaultMapViewForTopology,
    setTraceFiles: (recordId, traces) => setTraceFilesForRecord(recordId, traces),
    clearDocumentSelection,
    setActiveTabForRecord: (nextRecord) => setActiveTab((current) => retainedOrDefaultWorkspaceTab(current, nextRecord)),
    setAlignmentsVisible: () => setDisplaySettings((current) => ({ ...current, alignments: { ...current.alignments, visible: true, mode: 'trace' } })),
    setLastAlignedSequence: (sequence) => { lastAlignedSequenceRef.current = sequence },
    setTracesNeedRealign,
    markClean,
    touchRecentLocalFile,
    setStatus,
    addImportOperation: (nextRecord, fileName) => addOperation(nextRecord, 'import', `Imported ${fileName}.`),
    mergeUserCommonFeatures,
    mergeCustomMwLadders,
    mergeDisplaySettingsFromProject,
    loadPersistedVisualSettings,
    persistVisualSettingsFromPatch,
  })
  const documentFileImportController = useDocumentFileImportController({
    prepareFile: prepareMountedDocumentImport,
    actionProfileAsync: (name, category, run, detail) => actionProfileAsync(name, category, run, detail),
    actionProfileSync: (name, category, run, detail) => actionProfileSync(name, category, run, detail),
    setTraceDocument: (value) => setTraceDocument(value),
    setStatus,
    addImportOperation: (nextRecord, fileName) => addOperation(nextRecord, 'import', `Imported ${fileName}.`),
    onTraceImport: (file, bytes, localPath, trace) => documentImportController.openTraceDocument(file, bytes, localPath, trace),
    onSnapGeneImport: (prepared, fileName, localPath) => {
      setImportedTitleFile({ recordId: prepared.record.id, fileName })
      documentImportCommitController.commitSnapGeneImport(prepared, fileName, localPath)
    },
    onSettingsImport: (settings, fileName) => settingsController.applyLoadedSettings(settings, fileName),
    onProjectImport: (prepared, fileName, localPath) => {
      setImportedTitleFile({ recordId: prepared.project.record.id, fileName })
      documentImportCommitController.commitProjectImport(prepared, fileName, localPath)
    },
    onSequenceImport: (nextRecord, fileName, localPath, needsTopologyChoice) => {
      if (needsTopologyChoice) {
        setPendingTopologyImport({ fileName, record: nextRecord, localPath })
      } else {
        setImportedTitleFile({ recordId: nextRecord.id, fileName })
        documentImportController.commitImportedRecord(nextRecord, fileName, localPath)
      }
    },
    readFileText: (file) => file.text(),
    isSettingsFile,
    parseSettingsJson,
    applyLoadedSettings: (settings, fileName) => settingsController.applyLoadedSettings(settings, fileName),
    requestDocumentExit,
  })
  const documentBrowserHandoff = useMemo(
    () => createDocumentBrowserHandoffAdapters({
      setStatus,
      getActiveLibraryFolderId: () => libraryFolderId,
      canReuseCurrentTab: () => (
        !appDocumentBoot.openedFromHandoff
        && !appDocumentBoot.openedFromDiskFile
        && !appDocumentBoot.initiallyUnsaved
        && documentOrigin.kind === 'new'
        && record.id === appDocumentBoot.record.id
        && !isDirty
      ),
    }),
    [documentOrigin.kind, isDirty, libraryFolderId, record.id, setStatus],
  )
  const handoffController = useDocumentHandoffController({
    libraryFolderId,
    isNativeDesktop: isTauriRuntime,
    storeHandoffRecord: documentBrowserHandoff.storeHandoffRecord,
    openNativeHandoff: async (key, options) => Boolean(await openWorkspaceWindowWithHandoff(key, options)),
    focusExistingDocument: async ({ projectId, diskPath }) => {
      const { focusExistingWorkspaceDocument } = await import('./desktop/workspaceDocumentRegistry')
      if (projectId) return focusExistingWorkspaceDocument({ kind: 'database', projectId })
      if (diskPath) return focusExistingWorkspaceDocument({ kind: 'file', path: diskPath })
      return false
    },
    restoreNativeFocus: (active) => {
      if (active) return
      try { window.focus() } catch { /* ignore */ }
    },
    openBrowserHandoff: documentBrowserHandoff.openBrowserHandoff,
    setStatus,
    setBlockedBatchOpen,
  })
  const { openUnsavedRecordsInNewTabs } = handoffController
  const newDocumentWorkflow = useNewDocumentWorkflowController(
    {
      record,
      selectedRange,
      cutStrandSelection,
      cutEnzymes: cutSelectionEnzymes,
    },
    {
      normalizeConstructFileName,
      createDnaRecord: createSequenceRecordFromNewDnaFile,
      createProteinRecord: createSequenceRecordFromNewProteinFile,
      openRecordInNewTab: handoffController.openRecordInNewTab,
      setStatus,
    },
  )
  const {
    newDnaFileOpen,
    setNewDnaFileOpen,
    newProteinFileOpen,
    setNewProteinFileOpen,
    pendingNewFileFromSelection,
    setPendingNewFileFromSelection,
    handleNewFileFromSelection,
    confirmNewFileFromSelection,
    handleCreateNewDnaFile,
    handleCreateNewProteinFile,
  } = newDocumentWorkflow
  const { openHistoryConstruct, openHistoryRestrictionGel } = useDocumentHistoryOpenController(
    { record },
    {
      openRecordInNewTab: handoffController.openRecordInNewTab,
      openAgaroseGelWindow,
    },
  )
  const projectPersistenceController = useProjectPersistenceController({
    setTraceDocument: (value) => setTraceDocument(value),
    mergeCustomMwLadders,
    actionProfileSync,
    setRecord,
    setLibraryFolderId,
    setWorkspaceDiskPath: setWorkspaceDiskPathWithOrigin, setDocumentOrigin,
    applyDefaultMapViewForTopology,
    setTraceFiles: (recordId, traces) => setTraceFilesForRecord(recordId, traces),
    clearDocumentSelection,
    setActiveTabForRecord: (nextRecord) => setActiveTab((current) => retainedOrDefaultWorkspaceTab(current, nextRecord)),
    setAlignmentsVisible: () => setDisplaySettings((current) => ({ ...current, alignments: { ...current.alignments, visible: true, mode: 'trace' } })),
    setLastAlignedSequence: (sequence) => { lastAlignedSequenceRef.current = sequence },
    setTracesNeedRealign,
    markClean,
    touchRecentDatabaseProject,
    setStatus,
    getProject,
    deleteProject,
    removeRecentDatabaseProject,
    refreshProjects: () => refreshProjectsPortRef.current(),
  })
  useLayoutEffect(() => {
    loadProjectRef.current = projectPersistenceController.loadProject
  }, [projectPersistenceController.loadProject])
  const completeDatabaseSaveRef = useRef<() => Promise<void>>(async () => {})
  const {
    handleExportSnapGene,
    handleSaveDiskFile,
    handleExportGenBank,
    handleExportFasta,
    exportSnapGeneFile,
  } = useDocumentDiskPersistenceController({
    record,
    traceDocument: Boolean(traceDocument),
    displaySettings,
    workspaceDiskPath,
    documentSaveBinding,
    traceFilesWithFreshAlignments,
    withPackedLibraryMemberFeatures,
    snapGeneExtensionForMolecule,
    snapGeneFormatForMolecule,
    snapGeneExportOptions: (settings, nextRecord) => snapGeneExportOptionsFromEnzymeDisplay(settings.enzymes, nextRecord),
    serializeProjectFile,
    saveMountedDocument,
    mappedFolderDefaultSavePath: async (fileName) => {
      if (!isTauriRuntime() || documentSaveBinding !== 'database') return undefined
      return (await resolveMappedFolderDefaultSavePath({ projectId: record.id, fileName })) ?? undefined
    },
    downloadBytes,
    downloadText,
    exportGenBank,
    exportFasta,
    isNativeDesktop: isTauriRuntime,
    setRecord: (updater) => setRecord(updater),
    setWorkspaceDiskPath: setWorkspaceDiskPathWithOrigin,
    markClean,
    touchRecentLocalFile,
    setStatus,
    completeDatabaseSave: () => completeDatabaseSaveRef.current(),
    actionProfileSync,
  })
  const {
    completeDatabaseSave,
    cancelDatabaseSaveFlow,
    saveNativeFormatDecision,
    handleSaveToFolder,
    handleSaveToDatabase,
    currentDocumentFileName,
    canRenameCurrentFile,
    handleRenameFile,
    handleSave,
    resolvedLibraryFolderId,
  } = useDatabasePersistenceController({
    record,
    projects,
    displaySettings,
    libraryFolderId,
    documentSaveBinding, documentOrigin,
    traceDocument: Boolean(traceDocument),
    workspaceDiskPath,
    databaseSaveBusy,
    nativeFormatSaveProject,
    databaseSaveAsCopyRef,
    pendingSaveCompletionRef,
    traceFilesForSave: () => {
      const tracesForSave = traceFilesWithFreshAlignments()
      if (tracesForSave !== traceFiles) onTraceFilesChange(tracesForSave)
      return tracesForSave
    },
    onTraceFilesChange,
    setRecord,
    setTraceFiles: (recordId, traces) => setTraceFilesForRecord(recordId, traces),
    setLibraryFolderId,
    setWorkspaceDiskPath: setWorkspaceDiskPathWithOrigin, setDocumentOrigin,
    setRenameFileDialogOpen,
    setSaveToDialogOpen,
    setNativeFormatSaveProject,
    setDatabaseSaveBusy,
    markClean,
    refreshProjects: () => refreshProjectsPortRef.current(),
    touchRecentDatabaseProject,
    touchRecentLocalFile,
    setStatus,
    getProject,
    listProjectSummaries,
    listFolders,
    folderPathLabel: (folders, folderId) => folderPathLabel(folders as Parameters<typeof folderPathLabel>[0], folderId),
    saveProject,
    renameProjectFileName,
    renameDesktopFile,
    customMwLadders: listCustomMwLadders,
    normalizeProjectFileName,
    serializeProjectFile,
    snapGeneExportOptions: (settings, nextRecord) => snapGeneExportOptionsFromEnzymeDisplay(settings.enzymes, nextRecord),
    actionProfileAsync,
    saveDiskFile: handleSaveDiskFile,
    isNativeDesktop: isTauriRuntime,
    writeHybridPayload: (surface, payload) => writeHybridPayload(surface as 'database', payload as never),
    notifyHybridPayloadUpdated: (surface) => notifyHybridPayloadUpdated(surface as 'database'),
  })
  useLayoutEffect(() => {
    completeDatabaseSaveRef.current = completeDatabaseSave
  })
  const {
    runSaveToolbarMode,
    resolveDocumentExit,
  } = useDocumentSaveCoordinator({
    traceDocument: Boolean(traceDocument),
    documentSaveBinding,
    pendingDocumentExit,
    pendingSaveCompletionRef,
    refreshSessionDraftsRef,
    recordId: () => recordRef.current.id,
    setStatus,
    setPendingDocumentExit,
    saveDiskFile: handleSaveDiskFile,
    save: handleSave,
    saveToDatabase: handleSaveToDatabase,
    handleExportSnapGene,
    exportSnapGeneFile,
    completeDatabaseSave,
    clearSessionDraftForRecord,
    suppressPageHideDraftSave: suppressDraftSaveBeforeClose,
    resolveDocumentExitWorkflow,
    isNativeDesktop: isTauriRuntime,
  })

  useBootHandoffMountLifecycle(
    {
      bootOpenedFromHandoff: appDocumentBoot.openedFromHandoff,
      bootSourceHydrationPending: appDocumentBoot.sourceHydrationPending,
      pendingIdbHandoffKey: appDocumentBoot.pendingIdbHandoffKey,
      bootRecord: appDocumentBoot.record,
      bootInitiallyUnsaved: appDocumentBoot.initiallyUnsaved,
    },
    { recordRef, setRecordRef, applySavedBaselineRef },
    {
      hydrateProteinSources: hydrateAppBootProteinSources,
      clearHistoryBootQueryParams: clearBootHistoryQueryParams,
      setStatus,
    },
  )

  useOpenTabSessionLifecycle({
    tabId,
    record,
    traceFiles,
    recordRef,
    traceFilesRef,
    enzymeSet: displaySettings.enzymes,
    refreshOtherOpenTabs,
    subscribeCrossTabMessages,
    upsertOpenTab,
    getSharedFragment,
    onSharedFragment: setPendingSharedFragment,
  })

  useLayoutEffect(() => {
    requestDocumentExitRef.current = requestDocumentExit
  })

  useEffect(() => {
    if (!isTauriRuntime()) return
    let cancelled = false
    let stop: (() => void) | undefined
    void import('./desktop/updateCloseProtocol').then(({ subscribeUpdateCloseRequests }) =>
      subscribeUpdateCloseRequests({
        isBusy: () => Boolean(pendingDocumentExitRef.current),
        requestExit: (approved, onCancel) => requestDocumentExitRef.current(approved, { context: 'window-close', onCancel }),
        closeWindow: async () => {
          const { destroyCurrentDesktopWindow } = await import('./desktop/windowCloseGuard')
          await destroyCurrentDesktopWindow()
          void removeOpenTab(tabId).catch(console.warn)
        },
      }),
    ).then((unlisten) => { if (cancelled) unlisten(); else stop = unlisten }).catch(console.error)
    return () => { cancelled = true; stop?.() }
  }, [tabId])

  useWorkspaceDocumentRegistryLifecycle({
    isNativeDesktop: isTauriRuntime(),
    documentSaveBinding,
    workspaceDiskPath,
    recordId: record.id, documentOrigin,
    resolveCurrentWindowLabel: async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      return getCurrentWindow().label
    },
    claimWorkspaceDocument,
    releaseWorkspaceDocument,
  })

  useLibraryAlignmentTraceSelectionLifecycle({
    record,
    traceFiles,
    selectedAlignmentTraceId,
    setSelectedAlignmentTraceId,
  })

  const handleAlignmentTracesAdded = ({ scrollTemplateIndex, scrollToTraceId }: { scrollTemplateIndex?: number; scrollToTraceId?: string }) => {
    if (scrollToTraceId) setSelectedAlignmentTraceId(scrollToTraceId)
    if (scrollTemplateIndex !== undefined) requestAlignmentSequenceScroll(scrollTemplateIndex)
  }

  const libraryMemberTabRows = useMemo(() => {
    if (!isDnaLibraryRecord(record)) return []
    return sortLibraryMemberTabRows(
      traceFiles.map(buildLibraryMemberTabRow),
      memberTabSortMode,
      memberTabSortDirection,
    )
  }, [memberTabSortDirection, memberTabSortMode, record, traceFiles])

  const dnaLibraryConvertCommandsRef = useRef<DnaLibraryConvertCommands>({
    convertOpenConstructToLibraryFromFiles: async () => {},
    convertOpenConstructToLibraryFromDatabase: async () => {},
  })
  const dnaLibraryCreationCommandsRef = useRef<DnaLibraryCreationCommands>({
    createDnaLibraryFromFiles: async () => {},
  })
  const dnaLibraryNativePickerPort = useMemo(
    () => ({
      nativeRuntime: isTauriRuntime(),
      pickCreateLibraryInNewWindow: pickAndCreateDnaLibraryInNewWindow,
      pickConvertToLibraryMemberFiles: pickNativeConvertToLibraryMemberFiles,
    }),
    [],
  )
  const {
    canConvertToLibrary,
    libraryFileInputRef,
    convertToLibraryFileInputRef,
    openNewDnaLibraryPicker,
    openConvertToLibraryPicker,
    openConvertToLibraryFromFiles,
    openDatabaseForConvertToLibrary,
    createDnaLibraryFromFiles,
    convertOpenConstructToLibraryFromFiles,
    convertOpenConstructToLibraryFromDatabase,
    commitLibraryMembersOrCollapse,
  } = useDnaLibraryCommandController({
    record,
    recordRef,
    nativePicker: dnaLibraryNativePickerPort,
    createCommandsRef: dnaLibraryCreationCommandsRef,
    convertCommandsRef: dnaLibraryConvertCommandsRef,
    setStatus,
    setConvertToLibrarySourceOpen,
    openDatabaseForLibraryMembers,
    onTraceFilesChange,
    updateRecord,
    pushDocumentHistorySnapshot,
    setSelectedLibraryMemberIds,
    setMemberTabAnchorId,
    setSelectedAlignmentTraceId,
  })

  const {
    selectLibraryMemberTabRow,
    setLibraryMemberEnabled,
    setAllLibraryMembersEnabled,
    beginLibraryMemberNameEdit,
    commitLibraryMemberNameEdit,
    cancelLibraryMemberNameEdit,
    removeLibraryMembers,
    deleteSelectedLibraryMembers,
    openDeduplicateLibraryMembers,
    confirmDeduplicateLibraryMembers,
    setLibraryAnnotationReference,
    setLibraryConsensusEnabled,
    toggleMemberTabSort,
    membersAddMenuRef,
  } = useDatabaseLibraryMemberActions({
    selectedLibraryMemberIds,
    setSelectedLibraryMemberIds,
    memberTabAnchorId,
    setMemberTabAnchorId,
    memberTabSortMode,
    setMemberTabSortMode,
    setMemberTabSortDirection,
    memberName: {
      editingMemberNameId,
      setEditingMemberNameId,
      memberNameDraft,
      setMemberNameDraft,
    },
    setDedupeLibraryMembersGroups,
    getRecord: () => recordRef.current,
    getTraceFiles: () => traceFilesRef.current,
    getSelectedAlignmentTraceId: () => selectedAlignmentTraceId,
    onTraceFilesChange,
    updateRecord,
    pushDocumentHistorySnapshot,
    commitLibraryMembersOrCollapse,
    setSelectedAlignmentTraceId,
    setStatus,
    membersAddMenuOpen,
    setMembersAddMenuOpen,
  })

  async function addLibraryMembersFromFiles(files: FileList | File[]) {
    await addLibraryMembersFromFilesCommand(files)
  }

  async function addLibraryMembersFromDatabase(projectIds: string[]) {
    await addLibraryMembersFromDatabaseCommand(projectIds)
  }

  useMembersTabCloseLifecycle({
    activeTab,
    setMembersAddMenuOpen,
    setEditingMemberNameId,
  })

  useLayoutEffect(() => {
    flushSequenceEditLatency(record.sequence)
  }, [record.sequence])

  const workspaceView = useWorkspaceViewProjection({
    record,
    traceFiles,
    displaySettings,
    enzymePreferences,
    moleculeCapabilities,
    alignmentsVisible,
    activeTab,
    selectionFocus,
    selectedRange,
    cutStrandSelection,
    cutSelectionAnchor,
    cutSelectionEnzymes,
    selectedFeatureId,
    selectedFeatureIds,
    selectedAlignmentTraceId,
    featureTabSelectionMemberId,
    selectedProteinBondId,
    enzymeTabSortMode,
    enzymeTabSortDirection,
    featureTabSortMode,
    featureTabSortDirection,
    primerTabSortMode,
    primerTabSortDirection,
    oligoTabSortMode,
    oligoTabSortDirection,
    sgRnaTabSortMode,
    sgRnaTabSortDirection,
  })

  const historyRetentionFeatureExportPorts = useMemo(
    (): HistoryRetentionFeatureExportPorts => ({
      download: downloadText,
      updateRecord,
      setStatus,
      setHistoryManagerOpen,
      setProteinSourceHistoryManagerOpen,
      setExportFeatureDataOpen,
    }),
    [
      updateRecord,
      setStatus,
      setHistoryManagerOpen,
      setProteinSourceHistoryManagerOpen,
      setExportFeatureDataOpen,
    ],
  )

  const {
    applyManagedHistoryRetention,
    applyManagedProteinSourceRetention,
    confirmExportFeatureData,
  } = useHistoryRetentionFeatureExportController(
    {
      record,
      traceFiles,
      selectedFeatures: workspaceView.features.menuSelection,
      featureTabSelectionMemberId,
    },
    historyRetentionFeatureExportPorts,
  )

  const {
    hasFeatureSelected,
    canMergeSelectedFeatures,
    canShowSelectedFeatures,
    canHideSelectedFeatures,
  } = buildFeatureSelectionMenuGates(record, featureTabSelectionMemberId, workspaceView.features.menuSelection)

  const {
    focusFeatureTabSelection,
    selectFeatureTabRow,
    selectSgRnaPaneRow: selectSgRnaPaneRowCommand,
    setFeatureVisibility,
    setSgRnasVisibility,
    setAllFeaturesVisibility,
    showSelectedFeatures,
    hideSelectedFeatures,
  } = useFeaturePaneInteractionController({
    record,
    traceFiles,
    featureRows: workspaceView.features.tabRows,
    sgRnaRows: workspaceView.primers.tabSgRnaRows,
    featureTabSelectionMemberId,
    featureTabAnchor,
    selectedFeatureId,
    selectedFeatureIds,
    selectedAlignmentTraceId,
    selectionFocus,
    updateRecord,
    onTraceFilesChange,
    setStatus,
    setFeatureTabSelectionMemberId,
    setFeatureTabAnchor,
    setSelectedAlignmentTraceId,
    setSelectedFeatureId,
    setSelectedFeatureIds,
    setSelectedPrimerId,
    setSelectedPrimerIds,
    setCutSelectionAnchor,
    setCutStrandSelection,
    setCutSelectionEnzymes,
    setSelectionFocus,
    setSelectedRange,
    setSelectionAnchor,
    getVisibilityTargetIds: () => workspaceView.features.visibilityTargetIds,
  })

  const {
    primerEditor,
    setPrimerEditor,
    primerMergeNotice,
    setPrimerMergeNotice,
    primerNameWarning,
    setPrimerNameWarning,
    libraryPrimer,
    setLibraryPrimer,
    primerOrientationOpen,
    setPrimerOrientationOpen,
    primerColorPickerOpen,
    setPrimerColorPickerOpen,
    hybridizationParamsOpen,
    setHybridizationParamsOpen,
    pickPrimersRange,
    setPickPrimersRange,
    primerImportDialog,
    setPrimerImportDialog,
    primersImportFromFileOpen,
    setPrimersImportFromFileOpen,
    visibilityPrimerCommand,
    singleVisibilityPrimerCommand,
    preparePrimerImport: runPreparePrimerImport,
    refreshPrimerCommand,
    addImportedPrimerCommand,
    addPickedPrimerCommand,
    addDatabasePrimerCommand,
    exportPrimerCommand,
    importPrimerListCommand,
    openPrimerEditorForPrimer,
    inspectHistoryOligo,
    openPrimerEditorFromSelection,
    openAddPrimerFromMenu,
    openEditSelectedPrimers,
    duplicateSelectedPrimers,
    removeSelectedPrimers,
    openPrimerColorPicker,
    applyPrimerColor,
    openAnnealedInsert,
    openAnnealedHistoryInsert,
    openSelectedAnnealedOligos,
    savePrimerEditor,
    savePrimerSpecificity,
  } = usePrimerManagementController(record, setRecord, {
    getTraceFiles: () => traceFiles,
    getAlignmentsVisible: () => alignmentsVisible,
    getSelectedLibraryMember: () => workspaceView.features.libraryMember,
    getSelectedPrimers: () => selectedPrimersForMenu,
    getPrimerBindings: () => workspaceView.primers.bindings,
    openUnsavedRecordsInNewTabs: (records) => openUnsavedRecordsInNewTabs(records),
    setSequenceScrollTarget: (position) => setSequenceScrollTarget(position),
    selectedAlignmentTraceId,
    setSelectedAlignmentTraceId,
    selectedRange,
    selectionFocus,
    cutStrandSelection,
    activeTab,
    hybridization: displaySettings.primers.hybridization,
    context: primerWorkflowContext,
    apply: applyPrimerWorkflowResult,
    setStatus,
    setSelectedPrimerId,
    setSelectedPrimerIds,
    setSelectionFocus,
    setSelectedFeatureId,
    setSelectedFeatureIds,
    setCutSelectionAnchor,
    setCutStrandSelection,
    setCutSelectionEnzymes,
    setSelectedRange,
    setSelectionAnchor,
  })

  const {
    selectedPrimersForMenu,
    hasPrimerSelected,
    canShowSelectedPrimers,
    canHideSelectedPrimers,
    selectedPrimersInPaneMember,
    selectedSgRnasInPaneMember,
    hasRegularPrimerPaneSelection,
    showSelectedPrimers,
    hideSelectedPrimers,
    facingPrimerAmpliconRange,
    setOligoGroupPaneVisibility,
    setRegularPrimerGroupPaneVisibility,
    setSgRnaGroupPaneVisibility,
    setPrimerVisibility,
    focusPrimerTabSelection,
    selectPrimerTabRow,
  } = usePrimerSelectionController({
    record,
    traceFiles,
    selectedLibraryMember: workspaceView.features.libraryMember,
    selectedAlignmentTraceId,
    selectedPrimerId,
    selectedPrimerIds,
    primerTabAnchorId,
    featureVisibilityTargetIds: workspaceView.features.visibilityTargetIds,
    primerRows: workspaceView.primers.tabPrimerRows,
    sgRnaRows: workspaceView.primers.tabSgRnaRows,
    hybridization: displaySettings.primers.hybridization,
    getPrimerBindings: () => workspaceView.primers.bindings,
    visibilityPrimerCommand,
    singleVisibilityPrimerCommand,
    context: primerWorkflowContext,
    apply: applyPrimerWorkflowResult,
    setSgRnaVisibility: setSgRnasVisibility,
    setSelectedAlignmentTraceId,
    setPrimerTabAnchorId,
    setSelectedPrimerId,
    setSelectedPrimerIds,
    setSelectedFeatureId,
    setSelectedFeatureIds,
    setSelectionFocus,
    setCutSelectionAnchor,
    setCutStrandSelection,
    setCutSelectionEnzymes,
    setSelectedRange,
    setSelectionAnchor,
    setStatus,
  })

  const {
    setRange,
    setSequenceRange,
    extendSelectionToEndpoint,
    extendSelectionToBase,
    selectRestrictionCutFromLabel,
    navigateDnaSequenceCaret,
    selectDnaSequenceRestriction,
  } = useSelectionRangeController({
    record,
    traceFiles,
    alignmentsVisible,
    selectedAlignmentTraceId,
    selectedRange,
    selectionFocus,
    selectedFeatureId,
    selectedFeatureIds,
    selectedPrimerId,
    selectedPrimerIds,
    selectionAnchor,
    cutSelectionAnchor,
    setSelectedAlignmentTraceId,
    setCutSelectionAnchor,
    setCutStrandSelection,
    setCutSelectionEnzymes,
    setSelectedFeatureId,
    setSelectedFeatureIds,
    setSelectedProteinBondId,
    setSelectedPrimerId,
    setSelectedPrimerIds,
    setSelectionFocus,
    setSequenceHoverSiteKey,
    setSelectedRange,
    setSelectionAnchor,
    setSequenceScrollTarget,
    mapZoomCaretPosition,
    formatRange: (range) => formatRange(range.start, range.end),
    formatSequenceLength: (length) => formatSequenceLength(length, record.molecule),
    formatStickySelection: (selection) => formatStrandPairSelectionWithLength(selection, record.sequence.length),
    selectionLength,
    setStatus,
    resolveMobileEnzymeCutPairExtend,
    siteKey,
    restrictionFragmentStrandSelection,
    restrictionCutAnchorStrandSelection,
    formatEnzymeCutAnchorStatus: (site) =>
      matchesMobileShellViewport()
        ? mobileEnzymeCutAnchorStatus(site.enzyme.name, site.cutTop, site.cutBottom)
        : desktopEnzymeCutAnchorStatus(site.enzyme.name, site.cutTop, site.cutBottom),
  })

  const {
    selectFeatureById,
    selectPrimerById,
    selectProteinSequenceFeature,
    selectDnaSequenceFeature,
    selectDnaSequencePrimer,
  } = useWorkspaceAnnotationSelectionController({
    record,
    traceFiles,
    selectableAnnotations: workspaceView.annotations.selectable,
    alignmentsVisible,
    selectedAlignmentTraceId,
    selectionFocus,
    selectionAnchor,
    selectedFeatureId,
    selectedFeatureIds,
    selectedPrimerIds,
    selectedRange,
    featureTabSelectionMemberId,
    primerBindings: workspaceView.primers.bindings,
    setSelectedAlignmentTraceId,
    setSelectedProteinBondId,
    setCutSelectionAnchor,
    setCutStrandSelection,
    setCutSelectionEnzymes,
    setSelectedPrimerId,
    setSelectedPrimerIds,
    setSelectedFeatureId,
    setSelectedFeatureIds,
    setFeatureTabSelectionMemberId,
    setFeatureTabAnchor,
    setSelectionFocus,
    setSelectedRange,
    setSelectionAnchor,
    setSequenceScrollTarget,
    scrollAlignmentToTemplate: (position) => alignmentScrollToTemplateRef.current(position),
    setStatus,
    extendSelectionToEndpoint,
    focusPrimerTabSelection,
    resolveMobilePrimerPairExtend,
    matchesMobileShellViewport,
    mobilePrimerAnchorStatus,
    facingPrimerAmpliconRange,
    selectionLength,
    formatRange,
  })

  const {
    libraryPrimerImportOptions,
    importPrimersFromListFile,
    addImportedPrimers,
    exportSelectedPrimers,
    exportSelectedSgRnas,
    openPickPrimers,
    addPickedPrimers,
  } = usePrimerImportExportController(record, {
    getTraceFiles: () => traceFilesRef.current,
    getSelectedPrimers: () => selectedPrimersForMenu,
    getSelectedSgRnas: () => workspaceView.primers.selectedSgRnasForExport,
    hybridization: displaySettings.primers.hybridization,
    selectedRange,
    setPrimerImportDialog,
    setPickPrimersRange,
    context: primerWorkflowContext,
    apply: applyPrimerWorkflowResult,
    setStatus,
    setSelectedPrimerId,
    setSelectedPrimerIds,
    setSelectionFocus,
    download: downloadText,
    readFileText: (file) => file.text(),
    importPrimerListCommand,
    addImportedPrimerCommand,
    addPickedPrimerCommand,
    exportPrimerCommand,
  })

  const {
    commonPrimerMatches,
    setCommonPrimerMatches,
    detectCommonPrimersInDocument,
    addSelectedPrimersToCommonLibrary,
    addDatabasePrimers,
    saveHybridizationParameters,
  } = usePrimerLibraryWorkflowController(record, {
    getTraceFiles: () => traceFilesRef.current,
    getSelectedPrimers: () => selectedPrimersForMenu,
    hybridization: displaySettings.primers.hybridization,
    listCommonPrimers,
    loadPrimerTagMap,
    filterPrimersByTag,
    addCommonPrimers,
    libraryPrimerImportOptions,
    setPrimerHybridization: (hybridization) => setDisplaySettings((current) => ({
      ...current,
      primers: { ...current.primers, hybridization },
    })),
    setHybridizationParamsOpen,
    context: primerWorkflowContext,
    apply: applyPrimerWorkflowResult,
    setStatus,
    setSelectedPrimerId,
    setSelectedPrimerIds,
    setSelectionFocus,
    preparePrimerImport: runPreparePrimerImport,
    refreshPrimerCommand,
    addDatabasePrimerCommand,
  })

  function resizePrimerColumn(columnId: PrimerColumnId, nextWidth: number) {
    setPrimerColumnWidths((current) =>
      current[columnId] === nextWidth ? current : { ...current, [columnId]: nextWidth },
    )
  }

  function resizeMemberColumn(columnId: MemberColumnId, nextWidth: number) {
    setMemberColumnWidths((current) =>
      current[columnId] === nextWidth ? current : { ...current, [columnId]: nextWidth },
    )
  }





  function openEnzymeInfo(name: string) {
    void openOrFocusHybridWindow('enzyme-database', { initialEnzymeName: name }).then((opened) => {
      if (!opened) setEnzymeInfoName(name)
    })
  }

  const subscribeEnzymePreferencesExternalSync = useMemo(
    () => createEnzymePreferencesExternalSync(),
    [],
  )
  const {
    handleEnzymePreferencesChange,
    openRandomEnzymeInfo,
    enzymePrioritiesOpen,
    setEnzymePrioritiesOpen,
    saveEnzymePriorityOrder,
  } = useWorkspaceEnzymePreferencesController({
    enzymePreferences,
    setEnzymePreferences,
    setEnzymeTabPositionMode,
    normalizeEnzymePreferences,
    saveEnzymePreferences: persistWorkspaceEnzymePreferences,
    subscribeExternalSync: subscribeEnzymePreferencesExternalSync,
    enzymeNames: enzymes.map((enzyme) => enzyme.name),
    openEnzymeInfo,
    setStatus,
  })

  function openNewDnaFileWindow() {
    void openOrFocusHybridWindow('new-dna-file').then((opened) => {
      if (!opened) setNewDnaFileOpen(true)
    })
  }

  function openNewProteinFileDialog() {
    void openOrFocusHybridWindow('new-protein-file').then((opened) => {
      if (!opened) setNewProteinFileOpen(true)
    })
  }

  useSequenceTabMountScrollLifecycleEffects(
    sequenceScrollHost,
    {
      activeTab,
      sequenceLength: record.sequence.length,
      sequenceScrollTarget,
      setSequenceScrollTarget,
      selectionFocus,
      selectedFeature: workspaceView.features.selected,
      selectedPrimerId,
      selectedRange,
      primerBindings: workspaceView.primers.bindings,
      cutSelectionEnzymes,
      cutSelectionAnchor,
      cutStrandSelection,
    },
  )

  const {
    toggleMapZoom,
    handleMapZoomSliderChange,
    handleMapZoomRangeChange,
  } = useWorkspaceMapInteractionController({
    record,
    displaySettings,
    mapViewSelectedRange: workspaceView.map.selectedRange,
    mapViewSequenceLength: workspaceView.map.sequenceLength,
    setMapZoomRange,
    setMapZoomSlider,
    setDisplaySettings,
    mapZoomLinearBeforeRef,
  })

  const refreshProjects = useCallback(async () => {
    setProjects(await listProjectSummaries())
  }, [setProjects])
  useLayoutEffect(() => {
    refreshProjectsPortRef.current = refreshProjects
  })

  useProjectRefreshLifecycle({
    refreshProjects,
    subscribeLibraryChanged,
    scheduleDatabaseBackgroundSync,
  })

  useActiveWorkspaceTabRoutingLifecycle({
    activeTab,
    setActiveTab,
    record,
    traceDocument,
    moleculeCapabilities,
  })

  const enzymeSets = useEnzymeSetWorkflowController(
    {
      displaySection: displaySettings.enzymes,
      preferences: enzymePreferences,
      parentalCounts: workspaceView.enzymes.parentalSiteCounts,
      fileSets: record.fileEnzymeSets ?? [],
    },
    {
      applyDisplayPatch: (patch) => updateDisplaySection('enzymes', patch),
      applyPreferences: handleEnzymePreferencesChange,
      commitFileSets: (sets) => updateRecord((current) => ({ ...current, fileEnzymeSets: sets })),
      status: setStatus,
      download: (fileName, content) => void downloadText(fileName, content),
    },
  )

  const handleProteinSequenceEdit = useProteinSequenceEditController({
    updateRecord,
    setCutSelectionAnchor,
    setCutStrandSelection,
    setCutSelectionEnzymes,
    setSelectedFeatureId,
    setSelectedFeatureIds,
    setSelectedPrimerId,
    setSelectedPrimerIds,
    setSelectionFocus,
    setSelectedRange,
    setSelectionAnchor,
    setStatus,
  })

  const {
    updateProteinComparisonSources,
    updateDnaComparisonSources,
    updateProteinComparisonAlignmentCacheEntry,
    updateProteinComparisonVariableRegions,
    markSelectedProteinVariable,
    clearProteinVariableRegions,
    openAlignedProteinComparisonSource,
    openTranslationSourceDna: openTranslationSourceDnaCommand,
  } = useProteinComparisonController({
    record,
    traceFiles,
    selectedRange,
    updateRecord,
    setRecord,
    onTraceFilesChange,
    setStatus,
    writeClipboardText,
    openRecordInNewTab,
    createDnaRecord: createSequenceRecordFromNewDnaFile,
    createProteinRecord: createSequenceRecordFromNewProteinFile,
    getProject,
  })

  const {
    annotateProteinBinder,
    annotateAutoProteinBinder,
  } = useProteinAnnotationController({ record, updateRecord, setStatus })

  const updateProteinBinderNumbering = useCallback((numbering: BinderNumbering | null) => {
    updateRecord((current) => current.molecule === 'protein' && current.protein
      ? {
          ...current,
          protein: {
            ...current.protein,
            binderNumbering: numbering
              ? { sequenceDigest: dnaSequenceDigest(current.sequence), numbering }
              : undefined,
          },
        }
      : current)
  }, [updateRecord])
  const updateProteinBinderStructure = useCallback((structure: BinderStructure | null) => {
    updateRecord((current) => current.molecule === 'protein' && current.protein
      ? {
          ...current,
          protein: {
            ...current.protein,
            binderStructure: structure
              ? { sequenceDigest: dnaSequenceDigest(current.sequence), structure }
              : undefined,
          },
        }
      : current)
  }, [updateRecord])

  const {
    addProteinBond,
    openProteinBondEditor,
    selectProteinBondById,
    selectProteinBondRow,
    setProteinBondVisibility,
    saveProteinBond,
    deleteProteinBond,
  } = useProteinBondController({
    record,
    selectedRange,
    setProteinBondEditor,
    setSelectedProteinBondId,
    setSelectionFocus,
    setSelectedRange,
    setSelectionAnchor,
    setCutSelectionAnchor,
    setCutStrandSelection,
    setCutSelectionEnzymes,
    setSelectedFeatureId,
    setSelectedFeatureIds,
    setSelectedPrimerId,
    setSelectedPrimerIds,
    updateRecord,
    setStatus,
  })

  const canUndo = undoStack.length > 0
  const canRedo = redoStack.length > 0

  const { handleUndo, handleRedo, invertSelection, changeSelectionCase } = useSelectionEditingWorkflowActions({
    record,
    selectedRange,
    cutStrandSelection,
    undoStack,
    redoStack,
    maxHistoryEntries: MAX_HISTORY_ENTRIES,
    captureSnapshot: captureDocumentHistorySnapshot,
    restoreSnapshot: restoreDocumentHistorySnapshot,
    setUndoStack,
    setRedoStack,
    setCutSelectionAnchor,
    setCutStrandSelection,
    setCutSelectionEnzymes,
    setSelectedFeatureId,
    setSelectedFeatureIds,
    setSelectedPrimerId,
    setSelectedPrimerIds,
    setSelectionFocus,
    setSelectedRange,
    updateRecord,
    addOperation,
    formatRange: (range) => formatRange(range.start, range.end),
    formatSticky: (selection) => formatStrandPairSelectionWithLength(selection, record.sequence.length),
    selectionLength: (range) => selectionLength(range, record.sequence.length),
    setStatus,
  })

  const {
    segmentTargetDialog,
    setSegmentTargetDialog,
    featureMergeTemplateDialog,
    setFeatureMergeTemplateDialog,
    pendingFeatureMergeIds,
    setPendingFeatureMergeIds,
    cleavageChooser,
    setCleavageChooser,
    canAddCleavageSite,
    canRemoveCleavageSite,
    createSegmentOnFeature,
    createFeatureSegment,
    addCleavageToFeature,
    removeCleavageFromFeature,
    addCleavageSite,
    removeCleavageSite,
    deleteFeatureSegment,
    mergeFeatureSegments,
    openFeatureMergeTemplateDialog,
    openFeatureMergeEditor,
    spliceToRemoveIntrons,
  } = useFeatureStructureController({
    record,
    selectedRange,
    hasCutStrandSelection: Boolean(cutStrandSelection),
    selectedFeature: workspaceView.features.selected,
    selectedFeatureId,
    selectedFeaturesForMenu: workspaceView.features.menuSelection,
    featureTabSelectionMemberId,
    setFeatureEditor,
    updateRecord,
    setStatus,
    setCutSelectionAnchor,
    setCutStrandSelection,
    setCutSelectionEnzymes,
    setSelectedPrimerId,
    setSelectionFocus,
    setSelectedFeatureId,
    setSelectedRange,
    setSelectionAnchor,
    selectFeatureById,
    openSplicedRecord: (next) => openRecordInNewTab(next, { initiallyUnsaved: true }),
  })

  const {
    commonFeatureDetection,
    setCommonFeatureDetection,
    crisprDetection,
    setCrisprDetection,
    proteinUniProtAnnotationRange,
    setProteinUniProtAnnotationRange,
    dnaDatabaseAnnotationRange,
    setDnaDatabaseAnnotationRange,
    translatedOrfAnnotationRange,
    setTranslatedOrfAnnotationRange,
    detectCommonFeaturesInDocument,
    redetectCommonFeatures,
    detectCrisprInDocument,
    openProteinUniProtAnnotation,
    openDnaDatabaseAnnotation,
    applyDnaDatabaseAnnotations,
    applyTranslatedOrfAnnotations,
    applyProteinUniProtAnnotations,
    applyProteinInterProAnnotations,
    addSelectedFeatureToCommonFeatures,
    addDetectedCommonFeatures,
    openCommonFeaturesBrowser,
  } = useFeatureAnnotationController({
    record,
    updateRecord,
    setStatus,
    loadCommonFeatures: getAllCommonFeatures,
    addUserCommonFeatures,
    selectedRange,
    selectedFeaturesForMenu: workspaceView.features.menuSelection,
    setSelectedFeatureId,
    setSelectedFeatureIds,
    setFeatureTabSelectionMemberId,
    setFeatureTabAnchor,
    setSelectionFocus,
    setSelectedRange,
    tryOpenCommonFeaturesBrowser: () => openOrFocusHybridWindow('common-features-browse'),
    openLocalCommonFeaturesBrowser: () => setCommonFeaturesBrowseOpen(true),
  })




  const {
    sgRnaDialog,
    setSgRnaDialog,
    sgRnaCloningSnapshot,
    setSgRnaCloningSnapshot,
    guideScanDesignDialog,
    setGuideScanDesignDialog,
    openAddSgRna,
    openCloneSgRna,
    openGuideScanDesign,
    guideScanDesignAddSelected,
    persistGuideScanDesignCache,
    saveSgRna,
    crisprExcision,
    setCrisprExcision,
    crisprExcisionPlan,
    openCrisprExcision,
    exciseCrisprRegion,
  } = useCrisprFeatureController({
    record,
    traceFiles,
    alignmentsVisible,
    selectedAlignmentTraceId,
    selectedRange,
    cutStrandSelection,
    selectedSgRnasForCloning: workspaceView.primers.selectedSgRnasForCloning,
    featureTabSelectionMemberId,
    selectedLibraryMemberId: workspaceView.features.libraryMember?.id ?? null,
    updateRecord,
    onTraceFilesChange,
    pushDocumentHistorySnapshot,
    setSelectedAlignmentTraceId,
    setSelectedFeatureId,
    setSelectedFeatureIds,
    setSelectionFocus,
    setStatus,
    requestDocumentExit,
    commitUnsavedDownloadedRecord,
    traceDocument: Boolean(traceDocument),
    selectedSgRnasForExport: workspaceView.primers.selectedSgRnasForExport,
    getCurrentRecord: () => recordRef.current,
    setSequenceRange,
  })

  const {
    addFeature,
    addImportedFeatures,
    deleteSelectedFeature,
    duplicateSelectedFeature,
    openFeatureEditorFromSelection,
    openFeatureEditorForFeature,
    editProteinSequenceFeature,
    editDnaSequenceFeature,
    openFeatureColorEditor,
    saveFeatureEditor,
    saveProteinFeatureEditor,
    openFeatureDraftAsProtein,
    openFeatureAsProtein,
    openSelectedFeatureAsProtein,
  } = useFeatureEditorController({
    record,
    getCurrentRecord: () => recordRef.current,
    traceFiles,
    activeTab,
    alignmentsVisible,
    selectedAlignmentTraceId,
    featureTabSelectionMemberId,
    selectedRange,
    selectionFocus,
    selectedPrimerIds,
    facingPrimerAmpliconRange,
    cutStrandSelection,
    selectedFeatureId,
    selectedFeature: workspaceView.features.selected,
    selectedFeatureIds,
    selectableAnnotations: workspaceView.annotations.selectable,
    featureSelectionMember: workspaceView.features.selectionMember,
    selectedAnnotation: workspaceView.annotations.selected,
    pendingFeatureMergeIds,
    setPendingFeatureMergeIds,
    setFeatureEditor,
    setProteinFeatureEditor,
    setSelectedAlignmentTraceId,
    setSelectedFeatureId,
    setSelectedFeatureIds,
    setFeatureTabSelectionMemberId,
    setFeatureTabAnchor,
    setSelectionFocus,
    setSelectedRange,
    setSequenceRange,
    setTraceAlignBusy,
    selectFeatureById,
    openSgRnaEditor: (memberId, featureId) => setSgRnaDialog({ memberId, editingId: featureId, selection: null }),
    libraryFolderId: libraryFolderId ?? null,
    openRecordInNewTab,
    updateRecord,
    onTraceFilesChange,
    pushDocumentHistorySnapshot,
    setStatus,
    geneticCode: displaySettings.orfs.geneticCode,
  })

  const {
    navigatePreviousLibraryMap,
    navigateNextLibraryMap,
    selectMapRange,
    selectMapFeature,
    selectAlignmentTraceFromMap,
    editMapFeature,
    selectMapPrimer,
    editMapPrimer,
  } = useWorkspaceMapNavigationController({
    libraryMapBrowseActive: workspaceView.map.browseActive,
    libraryMapBrowseKeys: workspaceView.map.browseKeys,
    libraryMapBrowseIndex: workspaceView.map.browseIndex,
    libraryMapMembers: workspaceView.map.members,
    libraryMapBrowseMemberId: workspaceView.map.browseMemberId,
    mapViewSequenceLength: workspaceView.map.sequenceLength,
    recordSequenceLength: record.sequence.length,
    setSequenceRange,
    queueRevealTarget,
    traceFiles,
    setSelectedAlignmentTraceId,
    traceAlignmentMode: displaySettings.alignments.visible && (displaySettings.alignments.mode ?? 'trace') === 'trace',
    setStatus,
    selectFeatureById,
    openFeatureEditorForFeature,
    selectPrimerById,
    openPrimerEditorForPrimer,
  })

  const deleteSelectedPrimerOrSgRna = usePrimerOrSgRnaDeleteCommand({
    selectedPaneSgRna: workspaceView.primers.selectedPaneSgRna,
    deleteSelectedFeature,
    removeSelectedPrimers,
  })

  const { deleteSelectedFeatureOrBond, editSelectedFeatureProperties } = useFeatureOrProteinBondCommands({
    selectedProteinBondId,
    selectedFeature: workspaceView.features.selected,
    recordIsDnaLibrary: isDnaLibraryRecord(record),
    featureTabSelectionMemberId,
    deleteProteinBond,
    deleteSelectedFeature,
    openProteinBondEditor,
    openFeatureEditorForFeature,
  })

  const { applyDatabaseConstructsToAlignment, handleDatabaseProjectDrop } = useDatabaseAlignmentIntakeController({
    getRecord: () => recordRef.current,
    getTraceFiles: () => traceFilesRef.current,
    dnaAlignmentMode,
    updateDnaComparisonSources,
    updateProteinComparisonSources,
    onTraceFilesChange,
    onAlignmentTracesAdded: handleAlignmentTracesAdded,
    setStatus,
    getProject,
    openProject: (project) => loadProjectRef.current(project),
    requestDocumentExit: (action) => requestDocumentExitRef.current(action),
    alignmentsVisible: displaySettings.alignments.visible,
  })

  useLayoutEffect(() => {
    databaseProjectDropHandlerRef.current = (projectIds) => { void handleDatabaseProjectDrop(projectIds) }
  }, [handleDatabaseProjectDrop])

  useLayoutEffect(() => {
    databasePrimerDropHandlerRef.current = (primers) => addDatabasePrimers(primers)
  }, [addDatabasePrimers])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void subscribeDatabaseProjectsDrag((projectIds) => databaseProjectDropHandlerRef.current(projectIds)).then((stop) => {
      if (cancelled) stop()
      else unlisten = stop
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void subscribeDatabasePrimersDrag((primers) => databasePrimerDropHandlerRef.current(primers)).then((stop) => {
      if (cancelled) stop()
      else unlisten = stop
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  function openRecordInNewTab(
    source: SequenceRecord,
    options?: {
      activate?: boolean
      folderId?: string | null | undefined
      initiallyUnsaved?: boolean
      /** Focus an existing window for this Database project instead of opening another. */
      projectId?: string
      /** Focus an existing window for this disk file instead of opening another. */
      diskPath?: string
      documentOrigin?: WorkspaceDocumentOrigin; openSaveToDatabase?: boolean
      onOpenResult?: (opened: boolean) => void
      suppressFailureStatus?: boolean
      reservedTab?: Window
    },
  ) {
    return handoffController.openRecordInNewTab(source, options)
  }

  const { cloningAssemblyHandlers, cloningWorkflowHandlers } = useCloningCompletionHandlers(
    {
      setRestrictionCloningOpen,
      setGibsonAssemblyOpen,
      setTaGcCloningOpen,
      setMutagenesisOpen,
      discardCloningDialog,
      setMassRestrictionResult,
      setBlockedBatchOpen,
    },
    {
      openUnsavedRecordsInNewTabs,
      openRecordInNewTab,
      setStatus,
    },
  )

  function primerWorkflowContext(hybridization = displaySettings.primers.hybridization) {
    const current = recordRef.current
    return {
      record: current,
      members: traceFilesRef.current,
      isLibrary: isDnaLibraryRecord(current),
      referenceMemberId: isDnaLibraryRecord(current) ? getLibraryReferenceMemberId(current) : null,
      hybridization,
    }
  }

  function applyPrimerWorkflowResult(result: { record: SequenceRecord; members: TraceFileRecord[] }) {
    if (result.record !== recordRef.current) updateRecord(() => result.record)
    if (result.members !== traceFilesRef.current) onTraceFilesChange(() => result.members)
  }

  const {
    applySequenceEdit,
    applyMemberSequenceEdit,
    applyReferenceReplacementFromTrace,
  } = useDnaSequenceEditController({
    record,
    traceFiles,
    selectedAlignmentTraceId,
    alignmentsVisible,
    ports: {
      history: { updateRecord, pushDocumentHistorySnapshot },
      selection: { setSequenceRange },
      profiler: { markSequenceEditStart, actionProfileSync },
      traces: { onTraceFilesChange },
      status: { setStatus },
    },
  })

  const { deleteSequenceSelection, deleteSequenceAtCaret, insertSequenceBases } = useSequenceEditingActions({
    record,
    traceFiles,
    selectedRange,
    selectionFocus,
    cutStrandSelection,
    selectedAlignmentTraceId,
    alignmentsVisible,
    applyMemberSequenceEdit,
    applySequenceEdit,
    setStatus,
  })

  const workspaceBrowserSupportPorts = useMemo(
    (): WorkspaceBrowserSupportPorts => ({
      openExternalUrl,
      tryOpenNativeNewWindow: openNewWorkspaceWindow,
      openBrowserTab: (url) => window.open(url, '_blank') !== null,
      readBrowserLocation: () => ({
        origin: window.location.origin,
        pathname: window.location.pathname,
      }),
      clearSharedFragmentStorage: (fragmentId) => {
        void clearSharedFragment(fragmentId)
      },
    }),
    [],
  )

  const {
    canInsertSharedFragment,
    openKofiSupport,
    openNewVibegeneWindow,
    insertPendingSharedFragment,
    dismissPendingSharedFragment,
  } = useWorkspaceBrowserSupportController(
    {
      kofiSupportUrl: KOFI_SUPPORT_URL,
      pendingSharedFragment,
      setPendingSharedFragment,
      selectedRange,
      cutStrandSelection,
      insertSequenceBases,
      setStatus,
    },
    workspaceBrowserSupportPorts,
  )

  const {
    addLibraryMembersFromFiles: addLibraryMembersFromFilesCommand,
    addLibraryMembersFromDatabase: addLibraryMembersFromDatabaseCommand,
    beginLibraryMemberReorderDrag,
    createDnaLibraryFromDroppedOrPickedFiles: createDnaLibraryFromDroppedOrPickedFilesCommand,
    rebuildLibraryConsensusFromMembers: rebuildLibraryConsensusFromMembersCommand,
    groupLibraryMembers: groupLibraryMembersCommand,
    combineLibraryMembersFromGroups,
    reassembleSelectedLibraryMember,
    detachReadFromLibraryMember,
    acceptLibraryReadBaseAtTemplate,
    cropDnaLibraryToSelection,
    flipDnaLibraryOrientation: flipDnaLibraryOrientationCommand,
    flipLibraryMemberOrientation: flipLibraryMemberOrientationCommand,
    openLibraryMemberAsConstruct: openLibraryMemberAsConstructCommand,
    convertOpenConstructToLibraryFromFiles: convertOpenConstructToLibraryFromFilesCommand,
    convertOpenConstructToLibraryFromDatabase: convertOpenConstructToLibraryFromDatabaseCommand,
  } = useDnaLibraryWorkflowController({
    record,
    traceFiles,
    recordRef,
    traceFilesRef,
    selectedRange,
    cutStrandSelection,
    membersAddBusy,
    setMembersAddBusy,
    setStatus,
    setSelectedLibraryMemberIds,
    setMemberTabAnchorId,
    setSelectedAlignmentTraceId,
    setSelectedFeatureId,
    setSelectedPrimerId,
    setCutStrandSelection,
    setCutSelectionEnzymes,
    setCutSelectionAnchor,
    setSelectionFocus,
    setSelectedRange,
    setSequenceRange,
    setTracesNeedRealign,
    lastAlignedSequenceRef,
    onTraceFilesChange,
    updateRecord,
    pushDocumentHistorySnapshot,
    commitLibraryMembersOrCollapse,
    requestAlignmentSequenceScroll,
    createLibraryInNewWindow: async (files) => {
      return createDnaLibraryInNewWindow(files)
    },
    nativeRuntime: isTauriRuntime(), documentOrigin,
    openRecordInNewTab,
    loadProjects: async (ids) => (await Promise.all(ids.map(async (id) => (await getProject(id))?.record))).filter((entry): entry is SequenceRecord => Boolean(entry)),
    parseMemberFiles: parseAlignmentTraceFiles,
    beginProgress: (label, total) => beginOperationProgress(label, total),
    applyConsensusReplacement: (consensus, previousLength) => applySequenceEdit(consensus, { start: 0, end: 0 }, { start: 0, end: previousLength, insertedLength: consensus.length }, null, { recordHistory: false }),
    libraryMemberTabRows,
    memberTabSortMode,
    setMemberTabSortMode,
    memberReorderDragActiveRef,
    setMemberReorderDropBeforeId,
    setMemberReorderSourceId,
    canConvertToLibrary,
    setDatabaseLibraryMemberPick,
    setDatabaseOpen,
    setActiveTab,
    setCombineLibraryReadsOpen,
  })
  useLayoutEffect(() => {
    dnaLibraryConvertCommandsRef.current = {
      convertOpenConstructToLibraryFromFiles: convertOpenConstructToLibraryFromFilesCommand,
      convertOpenConstructToLibraryFromDatabase: convertOpenConstructToLibraryFromDatabaseCommand,
    }
    dnaLibraryCreationCommandsRef.current = {
      createDnaLibraryFromFiles: createDnaLibraryFromDroppedOrPickedFilesCommand,
    }
  })
  const {
    handleToggleTopologyAtOrigin,
    handleSetOrigin,
    handleSaveDnaEnds,
    applySelectRange,
    handleFlipSequence,
    flipLibraryMemberOrientation,
    openLibraryMemberAsConstruct,
    toggleAlignments,
    applyEditMapLabel,
    openTranslationOptions,
    confirmTranslationOptions,
    flipDnaLibraryOrientation,
  } = useWorkspaceTopologyDisplayController({
    record,
    displaySettings,
    translationOptionsDraft,
    setTranslationOptionsDraft,
    setDnaEndsEditorOpen,
    setEditMapLabelOpen,
    setSelectRangeOpen,
    updateRecord,
    updateDisplaySection: (key, patch) => updateDisplaySection(key, patch),
    setDisplaySettings,
    withAlignmentsVisibility,
    setSelectedFeatureId,
    setSelectedPrimerId,
    setCutStrandSelection,
    setCutSelectionEnzymes,
    setCutSelectionAnchor,
    setSelectionFocus,
    setSelectedRange,
    setSequenceRange,
    selectionRangeFromOneBased,
    setStatus,
    flipDnaLibraryOrientation: flipDnaLibraryOrientationCommand,
    flipLibraryMemberOrientation: flipLibraryMemberOrientationCommand,
    openLibraryMemberAsConstruct: openLibraryMemberAsConstructCommand,
    normalizeConstructFileName,
  })

  const {
    copySequenceSelection,
    pasteSequenceFromClipboard,
    hasSequenceSelection,
    hasStickyFragmentSelection,
    canCopySelection,
    toolsMwSelection,
  } = useSequenceClipboardController({
    record,
    selectedRange,
    cutStrandSelection,
    cutSelectionEnzymes,
    alignmentsVisible,
    selectedAlignmentTraceId,
    traceFiles,
    primerHybridization: displaySettings.primers.hybridization,
    tabId,
    getRichClipboardForPaste,
    readClipboardText,
    richClipboardMatchesPasteText,
    insertSequenceBases,
    writeClipboardText,
    setCopyEventText,
    storeRichClipboard,
    setStatus,
  })

  const {
    copyTopStrand,
    copyBottomStrand53,
    copyBottomStrand35,
    copyTranslation,
    activateUserDnaColors,
    paintUserStrandColor,
    paintUserProteinColor,
  } = useWorkspaceClipboardColorController({
    record,
    selectedRange,
    cutStrandSelection,
    selectedFeature: workspaceView.features.selected,
    updateRecord,
    setDisplaySection: (key, patch) => updateDisplaySection(key, patch),
    featureDisplayName,
    writeClipboardText,
    setStatus,
  })
  const canInvertSelection = hasSequenceSelection || hasStickyFragmentSelection
  // The map view highlights a single duplex range; represent a cut/sticky selection by its top strand
  // so enzyme, primer, and cross-type selections made in the map are visible there.
  const mapSelectedRange = selectedRange ?? cutStrandSelection?.forward ?? null

  const canCopyTranslation = Boolean(workspaceView.features.selected)

  const canShareSelectionToOtherTabs = Boolean(
    selectedRange && !cutStrandSelection && selectedRange.start !== selectedRange.end,
  )

  async function shareSelectionToOtherTabs() {
    await sharedTabController.shareSelectionToOtherTabs()
  }


  async function unloadOpenTab(openTabId: string) {
    await sharedTabController.unloadOpenTab(openTabId)
  }

  async function unloadOrphanedOpenTabs() {
    await sharedTabController.unloadOrphanedOpenTabs()
  }

  const {
    motifHits,
    primerSearchHitIds,
    primerSearchHitSet,
    motifQueryLength,
    searchHitCount,
    searchHitLabel,
    goToSearchHit,
  } = useWorkspaceSearchController({
    record,
    activeTab,
    searchQuery,
    primers: workspaceView.primers.tabPrimerRows
      .filter((entry) => entry.memberId === null)
      .map((entry) => entry.row.primer),
    enzymeRows: workspaceView.enzymes.tabRows,
    searchHitIndex,
    setSearchHitIndex,
    setPrimerTabAnchorId,
    selectPrimerById,
    setSequenceRange,
    setSequenceScrollTarget,
    actionProfileSync,
  })

  const workspaceHistoryTabModel = useMemo(
    () => buildWorkspaceHistoryTabModel({ record, traceFiles }),
    [record, traceFiles],
  )
  const workspaceTabBarModel = useMemo(
    () => buildWorkspaceTabBarModel({
      tabs: availableTabs,
      activeTab,
      mobileSearchOpen,
      searchQuery,
      molecule: record.molecule,
      traceDocument: Boolean(traceDocument),
      descriptionPanelVisible,
      searchHitCount,
      searchHitLabel,
      searchHitIndex,
    }),
    [
      activeTab,
      availableTabs,
      descriptionPanelVisible,
      mobileSearchOpen,
      record.molecule,
      searchHitCount,
      searchHitIndex,
      searchHitLabel,
      searchQuery,
      traceDocument,
    ],
  )
  const {
    navigateToEnzymeSite,
  } = useRestrictionSiteNavigationController({
    record,
    alignmentsVisible: displaySettings.alignments.visible,
    setSelectedFeatureId,
    setSelectedFeatureIds,
    setSelectedPrimerId,
    setSelectedPrimerIds,
    setSelectionFocus,
    setCutStrandSelection,
    setCutSelectionEnzymes,
    setCutSelectionAnchor,
    setSelectedRange,
    setSequenceScrollTarget,
    setSequenceHoverSiteKey,
    scrollAlignmentToTemplate: (position) => alignmentScrollToTemplateRef.current(position),
    setStatus,
    formatRange: (range) => formatRange(range.start, range.end),
  })


  function traceFilesWithFreshAlignments() {
    // Alignments are a view cache. If the sequence changed while alignment mode was off,
    // do not persist stale coordinates in either a database or .dna export.
    const tracesStale =
      tracesNeedRealign || lastAlignedSequenceRef.current !== record.sequence
    return tracesStale
      ? traceFiles.map((trace) => (trace.alignment ? { ...trace, alignment: null } : trace))
      : traceFiles
  }

  function openRenameFileDialog() {
    if (!canRenameCurrentFile()) {
      setStatus('Save the file before renaming it.')
      return
    }
    setRenameFileDialogOpen(true)
  }

  async function handleLoadProject(project: StoredProject) {
    await projectPersistenceController.loadProject(project)
  }

  async function handleLoadProjectSummary(summary: StoredProjectSummary) {
    await projectPersistenceController.loadProjectSummary(summary)
  }

  async function handleDeleteProject(project: { id: string; name: string }) {
    await projectPersistenceController.deleteProject(project)
  }

  useLayoutEffect(() => {
    handleFileRef.current = documentFileImportController.handleFile
  })

  useLayoutEffect(() => {
    openDraftInNewTabRef.current = (draft) => openRecordInNewTab(draft, { folderId: undefined, initiallyUnsaved: true })
  })
  useLayoutEffect(() => {
    restoreDraftInPlaceRef.current = (normalized) => {
      applySessionDraftRestoreInPlace(normalized, {
        setRecord,
        setLibraryFolderId,
        setWorkspaceDiskPath: setWorkspaceDiskPathWithOrigin,
        applyDefaultMapViewForTopology,
        setTraceFilesForRecord,
        setSelectedFeatureId,
        setSelectedPrimerId,
        setSelectionFocus,
        setSelectedRange,
        setActiveTab,
        markNeverSaved,
      })
    }
  })

  const recentLifecycle = useRecentDocumentLifecycle({
    ...recentDocumentLifecycleAdapters,
    handoffRecord: compactHandoffRecordAtLoad,
    maxRecentFiles: appPreferences.maxRecentFiles,
    sessionDrafts,
    syncNativeDrafts: (drafts) => { void syncNativeAppMenuDrafts(drafts) },
    syncNativeRecent: (entries) => { void syncNativeAppMenuRecent(entries) },
    recentDetail: recentFileDetail,
    bootOpenedFromHandoff: appDocumentBoot.openedFromHandoff,
    bootOpenedFromDiskFile: appDocumentBoot.openedFromDiskFile,
    clearBootFileQueryParams,
    shouldOpenInNewWindow: () => shouldOpenMenuDocumentInNewWindow(isTauriRuntime(), recordRef.current, workspaceDiskPath, libraryFolderId, isDirtyRef.current),
    requestExit: (action) => requestDocumentExitRef.current(action),
    handleFile: documentFileImportController.handleFile,
    loadProject: handleLoadProject,
    openRecordInNewTab,
    setStatus,
    refreshDrafts: refreshSessionDrafts,
  })
  const { recentFiles, recentFilesRef, refreshRecentFiles, openRecentFile } = recentLifecycle
  useLayoutEffect(() => {
    preferenceSavePortsRef.current = {
      trimSessionDraftsToLimit: async (limit) => { await trimSessionDraftsToLimit(limit) },
      refreshSessionDrafts,
      trimRecentFilesToLimit,
      refreshRecentFiles,
    }
  }, [refreshSessionDrafts, refreshRecentFiles])
  useLayoutEffect(() => {
    openRecordInNewTabRef.current = openRecordInNewTab
  })

  const handleAlignmentTracesAddedRef = useRef(handleAlignmentTracesAdded)
  useLayoutEffect(() => {
    handleAlignmentTracesAddedRef.current = handleAlignmentTracesAdded
  })
  const updateProteinComparisonSourcesRef = useRef(updateProteinComparisonSources)
  const updateDnaComparisonSourcesRef = useRef(updateDnaComparisonSources)
  useLayoutEffect(() => {
    updateProteinComparisonSourcesRef.current = updateProteinComparisonSources
    updateDnaComparisonSourcesRef.current = updateDnaComparisonSources
  })
  const workspaceFileDropContextRef = useRef({
    blocked: false,
    alignmentsVisible: false,
    alignmentMode: dnaAlignmentMode,
    molecule: record.molecule,
    sequence: record.sequence,
    topology: record.topology,
    traceFiles,
    dnaComparisonSources: record.dna?.comparisonSources ?? emptyDnaComparisonSources,
  })
  const workspaceFileDropBlocked = databaseOpen || agaroseGelOpen
  useLayoutEffect(() => {
    workspaceFileDropContextRef.current = {
      blocked: workspaceFileDropBlocked,
      alignmentsVisible: displaySettings.alignments.visible,
      alignmentMode: dnaAlignmentMode,
      molecule: record.molecule,
      sequence: record.sequence,
      topology: record.topology,
      traceFiles,
      dnaComparisonSources: record.dna?.comparisonSources ?? emptyDnaComparisonSources,
    }
  })

  const workspaceFileDropController = useWorkspaceFileDropController({
    contextRef: workspaceFileDropContextRef,
    setStatus,
    createDnaLibrary: createDnaLibraryFromFiles,
    updateDnaComparisonSources: (sources) => updateDnaComparisonSourcesRef.current(sources),
    updateProteinComparisonSources: (sources) => {
      updateProteinComparisonSourcesRef.current([
        ...(recordRef.current.protein?.comparisonSources ?? []),
        ...sources,
      ])
    },
    onTraceFilesChange,
    onAlignmentTracesAdded: (result) => handleAlignmentTracesAddedRef.current(result),
    requestDocumentExit: (action) => requestDocumentExitRef.current(action),
    handleFile: (file, path) => handleFileRef.current(file, path),
    openTraceInNewWorkspace: openTraceDocumentInNewWorkspace,
    openRecordInNewTab: (nextRecord, path) => openRecordInNewTabRef.current(nextRecord, { diskPath: path }),
    addImportOperation: (nextRecord, fileName) => addOperation(nextRecord, 'import', `Imported ${fileName}.`),
    readFileBytes: async (file) => new Uint8Array(await file.arrayBuffer()),
    decodeText: (bytes) => new TextDecoder().decode(bytes),
  })
  const handleDroppedWorkspaceFilesRef = useRef(workspaceFileDropController.handleFiles)
  useLayoutEffect(() => {
    handleDroppedWorkspaceFilesRef.current = workspaceFileDropController.handleFiles
  })

  useDesktopFileDropLifecycle({
    ...desktopFileDropLifecycleAdapters,
    blockedRef: {
      get current() {
        return workspaceFileDropContextRef.current.blocked
      },
    },
    setDragActive: setWorkspaceFileDragActive,
    onFiles: (files, paths) => handleDroppedWorkspaceFilesRef.current(files, paths),
  })
  const {
    onDragEnter: onWorkspaceFileDragEnter,
    onDragOver: onWorkspaceFileDragOver,
    onDragLeave: onWorkspaceFileDragLeave,
    onDrop: onWorkspaceFileDrop,
  } = useWorkspaceFileDragController({
    isNativeDesktop: isTauriRuntime(),
    blocked: workspaceFileDropBlocked,
    hasFiles: dataTransferHasFiles,
    setDragActive: setWorkspaceFileDragActive,
    onFiles: (files) => { void handleDroppedWorkspaceFilesRef.current(files) },
    onDatabaseProjects: (projectIds) => databaseProjectDropHandlerRef.current(projectIds),
    onDatabasePrimers: (primers) => databasePrimerDropHandlerRef.current(primers),
  })

  const clearDatabasePicks = useCallback(() => {
    setDatabaseAlignmentPick(null)
    setDatabaseLibraryMemberPick(null)
  }, [setDatabaseAlignmentPick, setDatabaseLibraryMemberPick])

  const databaseHybridCallbacks = useDatabaseHybridWorkflowCallbacks({
    addDatabasePrimers,
    applyDatabaseConstructsToAlignment,
    addLibraryMembersFromDatabase,
    convertOpenConstructToLibraryFromDatabase,
  })

  const { databaseManagerProps, onDatabaseClose } = useDatabaseManagerDialogController({
    projects,
    currentRecordId: record.id,
    alignmentPick: databaseAlignmentPick,
    libraryMemberPick: databaseLibraryMemberPick,
    refreshProjects,
    focusExistingDatabaseProject: async (projectId) => {
      const { focusExistingWorkspaceDocument } = await import('./desktop/workspaceDocumentRegistry')
      return focusExistingWorkspaceDocument({ kind: 'database', projectId })
    },
    openDatabaseProjectInNewTab: (project) => {
      const origin = project.documentOrigin?.kind === 'library-member' ? project.documentOrigin : undefined
      openRecordInNewTab(project.record, origin ? { folderId: origin.folderId, initiallyUnsaved: true, documentOrigin: origin } : { folderId: project.folderId ?? null, projectId: project.id })
    },
    addDatabasePrimers,
    applyDatabaseConstructsToAlignment,
    addLibraryMembersFromDatabase,
    convertOpenConstructToLibraryFromDatabase,
    deleteProjects: async (projectIds) => {
      await Promise.all(projectIds.map((projectId) => deleteProject(projectId)))
    },
    removeRecentDatabaseProject,
    setStatus,
    setDatabaseOpen,
    clearDatabasePicks,
  })

  const { sequenceImportProps } = useSequenceDatabaseImportDialogController({
    isNativeDesktop: isTauriRuntime(),
    shouldOpenInNewWindow: () => shouldOpenMenuDocumentInNewWindow(isTauriRuntime(), recordRef.current, workspaceDiskPath, libraryFolderId, isDirtyRef.current),
    openImportedRecordInNewWindow: (imported, { saveToDatabase }) => openRecordInNewTab(imported, { initiallyUnsaved: true, openSaveToDatabase: saveToDatabase }),
    requestDocumentExit,
    setSequenceDatabaseImportOpen,
    commitImportedRecord,
    setSaveToDialogOpen,
    setStatus,
    openExternalUrl: async (url) => { await openExternalUrl(url) },
  })

  useHybridDatabasePayloadLifecycle({
    isNativeDesktop: isTauriRuntime(),
    currentRecordId: record.id,
    alignmentPick: databaseAlignmentPick,
    libraryMemberPick: databaseLibraryMemberPick,
    writeHybridDatabasePayload: (payload) => writeHybridPayload('database', payload as never),
    notifyHybridDatabasePayloadUpdated: () => notifyHybridPayloadUpdated('database'),
    readHybridDatabaseConstructPick: () => readHybridPayload('database')?.constructPick ?? null,
  })

  useDatabaseHybridResults({
    enabled: isTauriRuntime(),
    recordId: record.id,
    libraryMemberPick: databaseLibraryMemberPick,
    subscribeResults: subscribeHybridResults,
    openPrimerProperties: (primer) => openOrFocusHybridWindow('primer-properties', primer),
    setStatus,
    ...databaseHybridCallbacks,
    setLibraryPrimer,
  })

  async function rebuildLibraryConsensusFromMembers() {
    await rebuildLibraryConsensusFromMembersCommand()
  }

  function groupLibraryMembers(memberIds: string[], options?: { keepMemberId?: string }) {
    groupLibraryMembersCommand(memberIds, options?.keepMemberId)
  }






  const canCropDnaLibrary = Boolean(
    isDnaLibraryRecord(record)
    && selectedRange
    && !cutStrandSelection
    && selectedRange.end > selectedRange.start
    && (selectedRange.start > 0 || selectedRange.end < record.sequence.length),
  )

  function handleTopologyChoice(topology: SequenceRecord['topology']) {
    const pending = pendingTopologyImport
    if (!pending) return
    const imported = applyImportedTopology(pending.record, topology)
    setPendingTopologyImport(null)
    setImportedTitleFile({ recordId: imported.id, fileName: pending.fileName })
    commitImportedRecord(imported, pending.fileName, pending.localPath)
  }









  const featureMenuRange =
    selectedRange && !cutStrandSelection && selectedRange.start !== selectedRange.end ? selectedRange : null
  const featureMenuHasRange = Boolean(featureMenuRange)
  const featureMenuHasPoint = Boolean(selectedRange && !cutStrandSelection)


  const nativeMenuCommands: NativeMenuCommands = {
    setStatus,
    restoreDraftAt: (index) => {
      const draft = sessionDraftsRef.current[index]
      if (draft) restoreSessionDraft(draft.id)
    },
    openRecentAt: (index) => {
      const entry = recentFilesRef.current[index]
      if (entry) openRecentFile(entry)
    },
    requestNativeQuit: () => requestNativeQuit(),
    setWhatsNewOpen: helpDialogs.setWhatsNewOpen,
    setAboutOpen: helpDialogs.setAboutOpen,
    setDnaLibraryHelpOpen: helpDialogs.setDnaLibraryHelpOpen,
    setHistoryDerivedWorkflowsHelpOpen: helpDialogs.setHistoryDerivedWorkflowsHelpOpen,
    setDatabaseHelpOpen: helpDialogs.setDatabaseHelpOpen,
    setCrisprWorkflowHelpOpen: helpDialogs.setCrisprWorkflowHelpOpen,
    setAlignmentsHelpOpen: helpDialogs.setAlignmentsHelpOpen,
    setKeyboardShortcutsOpen: helpDialogs.setKeyboardShortcutsOpen,
    openKofiSupport,
    openSourceRepository: () => {
      void openExternalUrl(SOURCE_REPOSITORY_URL)
        .catch((error) => setStatus(`Could not open the source repository: ${error instanceof Error ? error.message : String(error)}`))
    },
    openTelegramGroup: () => helpDialogs.setTelegramGroupOpen(true),
    setBugReportOpen,
    openFilePicker: () => fileInputRef.current?.click(),
    handleSave,
    handleSaveToDatabase,
    openRenameFileDialog,
    openNewDnaFileWindow,
    openNewDnaLibraryPicker,
    openConvertToLibraryPicker,
    openNewProteinFileDialog,
    setSequenceDatabaseImportOpen,
    handleNewFileFromSelection,
    handleExportSnapGene,
    handleSaveDiskFile: (options) => handleSaveDiskFile(options),
    handleExportGenBank,
    handleExportFasta,
    openNewVibegeneWindow,
    openDatabaseWindow,
    openPreferencesWindow,
    handleUndo,
    handleRedo,
    writeClipboardText,
    copyTopStrand,
    copyBottomStrand53,
    copyBottomStrand35,
    copyTranslation,
    setSelectRangeOpen,
    invertSelection,
    cropDnaLibraryToSelection,
    changeSelectionCase: changeSelectionCase,
    activateUserDnaColors,
    handleToggleTopologyAtOrigin,
    handleFlipSequence,
    setDnaEndsEditorOpen,
    handleSetOrigin,
    setActiveTab,
    setEditMapLabelOpen,
    toggleAlignments,
    setDescriptionPanelVisible,
    setDisplaySettings,
    openFeatureEditorFromSelection,
    addProteinBond,
    openProteinUniProtAnnotation,
    markSelectedProteinVariable,
    clearProteinVariableRegions,
    annotateAutoProteinBinder,
    openTranslationOptions,
    enzymeMenuOpenChoose: enzymeSets.openChoose,
    enzymeMenuSelectSet: enzymeSets.selectSet,
    enzymeMenuToggleVisibility: enzymeSets.toggleVisibility,
    enzymeMenuOpenSaveSet: enzymeSets.openSaveSet,
    enzymeMenuExportSet: enzymeSets.exportSet,
    setManageEnzymeSetsOpen: enzymeSets.setManageSetsOpen,
    setEnzymePrioritiesOpen,
    setEnzymeMenuNoncuttersOpen: enzymeSets.setNoncuttersOpen,
    openRandomEnzymeInfo,
    addFeature,
    editSelectedFeature: () => {
      if (workspaceView.features.selected) openFeatureEditorForFeature(workspaceView.features.selected.id)
    },
    duplicateSelectedFeature,
    deleteSelectedFeature,
    createFeatureSegment,
    deleteFeatureSegment,
    mergeFeatureSegments,
    openFeatureMergeTemplateDialog,
    addCleavageSite,
    removeCleavageSite,
    openFeatureColorEditor,
    showSelectedFeatures,
    hideSelectedFeatures,
    setFeaturesImportFromFileOpen,
    setExportFeatureDataOpen,
    spliceToRemoveIntrons,
    detectCommonFeaturesInDocument,
    detectCrisprInDocument,
    openAddSgRna,
    openCloneSgRna,
    openCrisprExcision,
    exportSelectedSgRnas,
    openGuideScanDesign,
    openSangerAlleles: () => {
      if (record.molecule === 'dna' && !traceDocument && !isDnaLibraryRecord(record)) setSangerAlleles({ record, traces: traceFiles })
      else setStatus('Open a single DNA reference document to analyze Sanger alleles.')
    },
    openDnaDatabaseAnnotation,
    setTranslatedOrfAnnotationRange,
    addSelectedFeatureToCommonFeatures,
    openCommonFeaturesBrowser,
    openAddPrimerFromMenu,
    openEditSelectedPrimers,
    duplicateSelectedPrimers,
    removeSelectedPrimers,
    openPrimerColorPicker,
    setHybridizationParamsOpen,
    openPickPrimers,
    showSelectedPrimers,
    hideSelectedPrimers,
    setPrimersImportFromFileOpen,
    openPrimerListPicker: () => primerListInputRef.current?.click(),
    detectCommonPrimersInDocument,
    addSelectedPrimersToCommonLibrary,
    exportSelectedPrimers,
    openRestrictionCloning,
    openGibsonAssembly,
    openTaGcCloning,
    openGatewayCloning,
    openRetainedPcr,
    openRetainedMutagenesis,
    openAgaroseGelWindow,
    setDnaMwOpen,
    openLetterCodesWindow,
    openGeneticCodeTablesWindow,
    handleDownloadSettingsFile,
    openSettingsFilePicker: () => settingsFileInputRef.current?.click(),
  }
  const nativeMenuLifecycle: NativeMenuLifecycle = nativeMenuLifecycleAdapters

  const nativeMenuState: NativeMenuState = {
    record,
    documentSaveBinding,
    canCreateFromSelection: workspaceView.selection.canCreateFileFromSelection,
    canConvertToLibrary,
    canUndo,
    canRedo,
    canCopySelection,
    canCopyTranslation,
    hasSelection: hasSequenceSelection,
    canInvertSelection,
    canCropLibrary: canCropDnaLibrary,
    canRenameFile: canRenameCurrentFile(),
    enzymesVisible: displaySettings.enzymes.visible,
    canSaveEnzymeSet: enzymeSets.activeEnzymeSetExport.enzymeNames.length > 0,
    hasFeatureSelected,
    canMergeFeatures: canMergeSelectedFeatures,
    canCloneSgRna: workspaceView.primers.selectedSgRnasForCloning.length > 0,
    canExciseSgRnaRegion: Boolean(crisprExcisionPlan),
    canExportSgRnas: workspaceView.primers.selectedSgRnasForExport.length > 0,
    hasSelectionRange: featureMenuHasRange,
    hasSelectionPoint: featureMenuHasPoint,
    canRemoveCleavageSite,
    canShowSelectedFeatures,
    canHideSelectedFeatures,
    hasPrimerSelected,
    canShowSelectedPrimers,
    canHideSelectedPrimers,
    activeTab,
    displaySettings,
    effectiveDescriptionPanelVisible,
    traceDocument: Boolean(traceDocument),
    nucleotideStrands: moleculeCapabilities.nucleotideStrands,
    selectedRange,
    enzymeTabCaretPosition: workspaceView.enzymes.tabCaretPosition,
  }
  const { dispatch: nativeMenuDispatch } = useNativeAppMenuController(
    nativeMenuState,
    nativeMenuCommands,
    nativeMenuLifecycle,
  )
  useRegisteredAppKeyboardShortcutLifecycle(
    {
      traceDocument: Boolean(traceDocument),
      molecule: record.molecule,
      activeTab,
      dnaEndsEditorOpen,
      featureEditor: Boolean(featureEditor),
      primerEditor: Boolean(primerEditor),
      hasFeatureSelected,
      hasSequenceSelection,
      cutStrandSelection,
      selectionFocus,
      selectedProteinBondId,
      selectedFeatureId,
      selectedFeatureIds,
      hasSelectedFeature: Boolean(workspaceView.features.selected),
      selectedPrimerId,
      selectedRange,
      onTraceDocumentMutationBlocked: () => {
        setStatus('Trace documents are read-only. Open as sequence before editing or saving.')
      },
    },
    {
      dispatch: nativeMenuDispatch,
      commands: {
        handleUndo,
        handleRedo,
        copySequenceSelection: () => {
          void copySequenceSelection()
        },
        copySequenceSelectionFromEvent: (event) => {
          void copySequenceSelection(event)
        },
        openFeatureEditorFromSelection,
        pasteSequenceFromClipboard,
        deleteProteinBond,
        deleteSelectedFeature,
        clearOrfSelection: () => {
          setSelectedFeatureId(null)
          setSelectionFocus('dna')
          setStatus('Cleared ORF selection.')
        },
        removeSelectedPrimers,
        deleteSequenceSelection,
        deleteSequenceAtCaret,
        insertSequenceBases,
      },
      canHandleAppShortcut,
      isEditableShortcutTarget,
      isKeyboardShortcutAvailable: (shortcut, molecule) =>
        isKeyboardShortcutAvailable(
          { description: '', key: '', modifiers: [], ...shortcut },
          molecule,
        ),
      matchKeyboardShortcut,
      hasOpenModalDialog: () =>
        Boolean(document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')),
      hasSelectedSelectionBarText: () => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false
        const container = selection.getRangeAt(0).commonAncestorContainer
        const element = container instanceof Element ? container : container.parentElement
        return Boolean(element?.closest('.selection-bar'))
      },
      hasPrimerOrDbManagerDialog: () =>
        Boolean(document.querySelector('.primer-properties-dialog, .db-manager-dialog')),
      isNativeDesktop: isNativeDesktopApp(),
      isWindowsNativeDesktop: isNativeDesktopApp() && getShortcutPlatform() === 'windows',
    },
  )

  const { requestNativeQuit } = useDesktopWindowLifecycle({
    ...desktopWindowLifecycleAdapters,
    tabId, isDirtyRef,
    pendingExitRef: pendingDocumentExitRef,
    closeInProgressRef: desktopCloseInProgressRef,
    setSyncProgress: setDatabaseExitSyncProgress,
    requestExit: (action, options) => requestDocumentExitRef.current(action, options),
  })

  const mobileSidePanelAvailable =
    !traceDocument && (
      (activeTab === 'Map' && moleculeCapabilities.map) || activeTab === 'Sequence'
    )
  const mobileSidePanelLabel = 'Display controls'

  return (
    <main
      className={`snapgene-shell${workspaceFileDragActive ? ' is-file-drag-active' : ''}${isMobileShell ? ' is-mobile-shell' : ''}`}
      onDragEnter={onWorkspaceFileDragEnter}
      onDragOver={onWorkspaceFileDragOver}
      onDragLeave={onWorkspaceFileDragLeave}
      onDrop={onWorkspaceFileDrop}
    >
      <a className="skip-link" href="#main-workspace">Skip to workspace</a>
      <div className="mobile-browser-chrome-gesture-strip" aria-hidden="true" />
      <nav className="toolbar" aria-label="Document toolbar">
        <MobileAppBar
          menuButtonRef={mobileMenuButtonRef}
          sidebarButtonRef={mobileSidebarButtonRef}
          descriptionButtonRef={mobileDescriptionButtonRef}
          documentTitle={workspaceWindowTitle(workspaceTitleName, {
            binding: documentSaveBinding,
            showSource: isTauriRuntime(),
          })}
          menuOpen={mobileMenuOpen}
          sidebarOpen={mobileSidebarOpen}
          descriptionPanelVisible={descriptionPanelVisible}
          sidePanelAvailable={mobileSidePanelAvailable}
          sidePanelLabel={mobileSidePanelLabel}
          descriptionPanelAvailable={!traceDocument}
          onToggleMenu={() => {
            setMobileMenuOpen((open) => !open)
            setMobileSidebarOpen(false)
            if (!traceDocument) setDescriptionPanelVisible(false)
          }}
          onToggleSidebar={() => {
            setMobileSidebarOpen((open) => !open)
            setMobileMenuOpen(false)
            if (!traceDocument) setDescriptionPanelVisible(false)
          }}
          onToggleDescriptionPanel={() => {
            setDescriptionPanelVisible((visible) => !visible)
            setMobileMenuOpen(false)
            setMobileSidebarOpen(false)
          }}
        />
        <MobileDocumentMenu
          menuOpen={mobileMenuOpen}
          isMobileShell={isMobileShell}
          onCloseMenu={() => setMobileMenuOpen(false)}
        >
          <MobileMenuActions
            onOpen={() => fileInputRef.current?.click()}
            saveMenuRef={saveMenuRef}
            saveMenuOpen={saveMenuOpen}
            saveToolbarMode={saveToolbarMode}
            saveToolbarOptions={saveToolbarOptions}
            onRunSaveMode={runSaveToolbarMode}
            onToggleSaveMenu={() => setSaveMenuOpen((open) => !open)}
            onSelectSaveMode={(mode) => {
              setSaveToolbarMode(mode)
              setSaveMenuOpen(false)
              runSaveToolbarMode(mode)
            }}
            onOpenDatabase={openDatabaseWindow}
            onOpenNewWindow={openNewVibegeneWindow}
            newWindowAvailable={!isTauriRuntime()}
          />
          <WorkspaceDocumentMenus
            dispatch={nativeMenuDispatch}
            menuState={nativeMenuState}
            availableTabs={availableTabs}
            moleculeCapabilities={moleculeCapabilities}
            workspaceFeatures={{
              canOpenAsProtein: workspaceView.features.canOpenAsProtein,
              selected: workspaceView.features.selected,
            }}
            workspaceEnzymes={{ parentalRestrictionSites: workspaceView.enzymes.parentalRestrictionSites }}
            workspacePrimers={{
              selectedSgRnasForCloning: workspaceView.primers.selectedSgRnasForCloning,
              selectedSgRnasForExport: workspaceView.primers.selectedSgRnasForExport,
            }}
            recentFiles={recentFiles}
            sessionDrafts={sessionDrafts}
            enzymePreferences={enzymePreferences}
            fileEnzymeSets={record.fileEnzymeSets ?? []}
            canAddCleavageSite={canAddCleavageSite}
            showBrowserOnlyMenus={!isTauriRuntime()}
            residuals={{
              onOpenRecent: (entry) => openRecentFile(entry),
              onRestoreDraft: (draftId) => restoreSessionDraft(draftId),
              onDiscardDraft: (draftId) => discardSessionDraft(draftId),
              onOpenFromUrl: () => setOpenSequenceUrlOpen(true),
              onGenerateLink: () => setGenerateLinkOpen(true),
              onSelectSupplier: enzymeSets.selectSupplier,
              onSelectSavedSet: enzymeSets.selectSavedSet,
              onSelectFileSet: enzymeSets.selectFileSet,
              onOpenAsProtein: openSelectedFeatureAsProtein,
              onSaveAsFile: () => void handleSaveDiskFile({ forceDialog: true }),
              onOpenDoubleDigest: () => setDoubleDigestOpen(true),
              loadCommonPrimers: listCommonPrimers,
              loadPrimerTagMap,
              onSelectTab: setActiveTab,
              onSetOrigin: handleSetOrigin,
            }}
          />
        </MobileDocumentMenu>
        <WorkspaceFileInput
          inputRef={fileInputRef}
          accept={SEQUENCE_OPEN_ACCEPT}
          onFile={(file) => {
            void documentFileImportController.openPickedFile(file)
          }}
        />
        <WorkspaceFileInput
          inputRef={libraryFileInputRef}
          accept=".ab1,.seq,.txt"
          multiple
          onFiles={createDnaLibraryFromFiles}
        />
        <WorkspaceFileInput
          inputRef={convertToLibraryFileInputRef}
          accept={`.ab1,${SEQUENCE_OPEN_ACCEPT}`}
          multiple
          onFiles={convertOpenConstructToLibraryFromFiles}
        />
        <WorkspaceFileInput
          inputRef={settingsFileInputRef}
          accept=".json,application/json"
          onFile={(file) => void handleLoadSettingsFile(file)}
        />
        <WorkspaceFileInput
          inputRef={primerListInputRef}
          accept=".txt,text/plain"
          onFile={(file) => void importPrimersFromListFile(file)}
        />
      </nav>

      <SelectionStatusBar
        {...buildSelectionStatusBarModel({
          isDirty,
          mapViewZoomEnabled: displaySettings.mapView.zoom,
          mapZoomRange,
          molecule: record.molecule,
          sequence: record.sequence,
          summary: {
            molecule: record.molecule,
            sequenceLength: record.sequence.length,
            cutStrandSelection,
            selectionFocus,
            selectedFeatureIds,
            selectedFeature: workspaceView.features.selected,
            selectedPrimerIds,
            selectedPrimerId,
            primers: record.primers,
            selectedProteinBond: workspaceView.features.selectedProteinBond,
            selectedRange,
            selectedAnnotation: workspaceView.annotations.selected,
          },
          showWorkspaceCounts: activeTab === 'Sequence' && record.molecule === 'dna',
          featureCount: record.features.length,
          primerBindingCount: workspaceView.primers.bindings.length,
          visibleEnzymeSiteCount: workspaceView.enzymes.displayedRestrictionSites.length,
          status,
          enzymeScan: workspaceView.enzymes.scan,
        })}
        attentionKey={statusAttentionKey}
      />

      <section
        className={`snapgene-body${effectiveDescriptionPanelVisible ? '' : ' description-panel-hidden'}${mobileSidebarOpen ? ' mobile-sidebar-open' : ''}`}
      >
        <div
          className="snapgene-main"
          style={
            effectiveDescriptionPanelVisible
              ? ({ ['--description-panel-width' as string]: `${descriptionPanelWidthPx}px` } as CSSProperties)
              : undefined
          }
        >
        {mobileSidebarOpen ? (
          <button
            type="button"
            className="mobile-drawer-backdrop mobile-sidebar-backdrop"
            aria-label={`Close ${mobileSidePanelLabel.toLowerCase()}`}
            onClick={() => setMobileSidebarOpen(false)}
          />
        ) : null}
        <section id="main-workspace" className="workspace" aria-label={`${activeTab} workspace`} tabIndex={-1}>
          <div className="tab-content">
            <WorkspaceMapHost {...createWorkspaceMapModel({
              activeTab,
              mapAvailable: moleculeCapabilities.map,
              protein: record.molecule === 'protein' ? {
                record,
                selectedRange,
                motifHits,
                activeHitIndex: searchHitIndex,
                searchQuery,
                selectedFeatureId,
                displaySettings,
                mapZoomRange,
                mapZoomSlider,
                actions: {
                  onPaintColor: paintUserProteinColor,
                  onToggleMapZoom: toggleMapZoom,
                  onChange: setDisplaySettings,
                  onRangeSelect: setSequenceRange,
                  onFeatureSelect: selectFeatureById,
                  onFeatureEdit: openFeatureEditorForFeature,
                  onAnnotateBinder: annotateProteinBinder,
                  onOpenTranslationSourceDna: openTranslationSourceDnaCommand,
                  onBinderNumberingChange: updateProteinBinderNumbering,
                  onBinderStructureChange: updateProteinBinderStructure,
                  onAlignmentCacheEntry: updateProteinComparisonAlignmentCacheEntry,
                  onBondEdit: openProteinBondEditor,
                  onStatus: setStatus,
                  onDisplaySettingsChange: setDisplaySettings,
                  onSaveVisualSettings: saveMapVisualSettings,
                  onRevertVisualSettings: revertMapVisualSettings,
                  onZoomSliderValueChange: handleMapZoomSliderChange,
                  onViewRangeChange: handleMapZoomRangeChange,
                },
              } : null,
              dna: record.molecule !== 'protein' ? {
                record,
                displaySettings,
                enzymePreferences,
                fileEnzymeSets: record.fileEnzymeSets ?? [],
                restrictionSites: workspaceView.enzymes.restrictionSites,
                parentalRestrictionSites: workspaceView.enzymes.parentalRestrictionSites,
                mapViewSequenceLength: workspaceView.map.sequenceLength,
                mapViewRecord: workspaceView.map.viewRecord,
                mapViewRestrictionSites: workspaceView.map.restrictionSites,
                mapViewPrimerBindings: workspaceView.map.primerBindings,
                mapViewAnnotationFeatures: workspaceView.map.annotationFeatures,
                mapViewSelectedRange: workspaceView.map.selectedRange,
                mapZoomRange,
                mapZoomSlider,
                mapZoomCaretPosition: mapZoomCaretPosition(workspaceView.map.selectedRange, workspaceView.map.sequenceLength),
                mapAnnotationFeatures: workspaceView.annotations.map,
                displayedRestrictionSites: workspaceView.enzymes.displayedRestrictionSites,
                primerBindings: workspaceView.primers.bindings,
                selectedRange,
                mapSelectedRange,
                selectedFeatureId,
                selectedFeatureIds,
                selectedPrimerId,
                selectedPrimerIds,
                selectedRestrictionSites: workspaceView.enzymes.selectedRestrictionSites,
                traceFiles,
                dnaComparisonSources,
                libraryComparativeMemberIds,
                dnaAlignmentMode,
                dnaComparisonMapFiles,
                mapAlignmentSidebarWidthPx,
                selectedAlignmentTraceId,
                traceAlignBusy,
                isLibrary: isDnaLibraryRecord(record),
                libraryNavigator: (
                  <LibraryMapNavigator
                    label={workspaceView.map.browseMember?.fileName ?? 'Consensus'}
                    index={workspaceView.map.browseIndex}
                    count={workspaceView.map.browseActive ? workspaceView.map.browseKeys.length : 0}
                    onPrevious={navigatePreviousLibraryMap}
                    onNext={navigateNextLibraryMap}
                  />
                ),
                libraryMemberBrowse: Boolean(workspaceView.map.browseMemberId),
                actions: {
                  onChange: setDisplaySettings,
                  onToggleMapZoom: toggleMapZoom,
                  onEnzymeInfo: openEnzymeInfo,
                  onPreferencesChange: handleEnzymePreferencesChange,
                  onFileEnzymeSetsChange: enzymeSets.updateFileEnzymeSets,
                  onPaintStrandColor: paintUserStrandColor,
                  openDatabaseForAlignment: () => openDatabaseForAlignment('dna'),
                  updateDnaComparisonSources,
                  setStatus,
                  onTraceFilesChange,
                  handleAlignmentTracesAdded,
                  selectAlignmentTraceFromMap,
                  viewAlignmentTraceFromMap: openTraceInspector,
                  setSelectedAlignmentTraceId,
                  startMapAlignmentSplitDrag,
                  groupLibraryMembers,
                  selectFeatureById: (featureId, extendSelection = false, position) =>
                    selectFeatureById(featureId, extendSelection, false, { scrollPosition: position }),
                  setRange,
                  extendSelectionToBase,
                  selectPrimerById,
                  selectRestrictionCutFromLabel,
                  openFeatureEditorForFeature,
                  openFeatureAsProtein,
                  openPrimerEditorForPrimer,
                  updateRecord,
                  selectMapFeature,
                  selectMapRange,
                  selectMapPrimer,
                  editMapFeature,
                  editMapPrimer,
                  saveMapVisualSettings,
                  revertMapVisualSettings,
                  handleMapZoomSliderChange,
                  handleMapZoomRangeChange,
                },
              } : null,
            })} />
            <WorkspaceSequenceHost {...createWorkspaceSequenceModel({
              mounted: sequencePaneMounted,
              activeTab,
              layoutClassName: traceDocumentSequenceLayoutClass(Boolean(traceDocument)),
              protein: record.molecule === 'protein' ? {
                record,
                displaySettings,
                selectedRange,
                motifHits,
                activeHitIndex: searchHitIndex,
                searchQuery,
                selectedFeatureId,
                selectedBondId: selectedProteinBondId,
                mapZoomRange,
                mapZoomSlider,
                comparisonSources: record.protein?.comparisonSources ?? [],
                variableRegions: record.protein?.comparisonVariableRegions ?? [],
                onAlignmentDisplaySettingsChange: applyProteinAlignmentDisplayPatch,
                actions: {
                  onPaintColor: paintUserProteinColor,
                  onToggleMapZoom: toggleMapZoom,
                  onChange: setDisplaySettings,
                  onSourcesChange: updateProteinComparisonSources,
                  onVariableRegionsChange: updateProteinComparisonVariableRegions,
                  onAlignmentCacheEntry: updateProteinComparisonAlignmentCacheEntry,
                  onAnnotateBinder: annotateProteinBinder,
                  onOpenTranslationSourceDna: openTranslationSourceDnaCommand,
                  onBinderNumberingChange: updateProteinBinderNumbering,
                  onBinderStructureChange: updateProteinBinderStructure,
                  onStatus: setStatus,
                  onSaveVisualSettings: saveSequenceVisualSettings,
                  onRevertVisualSettings: revertSequenceVisualSettings,
                  onPickFromDatabase: () => openDatabaseForAlignment('protein'),
                  onOpenAlignedSource: openAlignedProteinComparisonSource,
                  onRangeSelect: setSequenceRange,
                  onSequenceEdit: handleProteinSequenceEdit,
                  onDisplaySettingsChange: setDisplaySettings,
                  onUndo: handleUndo,
                  onRedo: handleRedo,
                  onFeatureSelect: selectProteinSequenceFeature,
                  onFeatureEdit: editProteinSequenceFeature,
                  onBondSelect: selectProteinBondById,
                  onBondEdit: openProteinBondEditor,
                  onZoomSliderValueChange: handleMapZoomSliderChange,
                  onViewRangeChange: handleMapZoomRangeChange,
                },
              } : null,
              dna: record.molecule !== 'protein' ? {
                record,
                displaySettings,
                enzymePreferences,
                fileEnzymeSets: record.fileEnzymeSets ?? [],
                restrictionSites: workspaceView.enzymes.restrictionSites,
                parentalRestrictionSites: workspaceView.enzymes.parentalRestrictionSites,
                selectedRange,
                selectedFeatureId,
                selectedFeatureIds,
                selectedPrimerId,
                selectedPrimerIds,
                selectedRestrictionSites: workspaceView.enzymes.selectedRestrictionSites,
                displayAnnotationFeatures: workspaceView.annotations.display,
                orfTranslationByFeatureId: workspaceView.orf.visibleTranslations,
                displayedRestrictionSites: workspaceView.enzymes.displayedRestrictionSites,
                cutStrandSelection,
                sequenceHoverSiteKey,
                motifHits,
                motifQueryLength,
                displayablePrimerSites: workspaceView.primers.displaySites.displays,
                activeEnzymePool: workspaceView.enzymes.activePool,
                traceFiles,
                traceAlignBusy,
                selectedAlignmentTraceId,
                dnaComparisonSources,
                dnaComparisonEntries,
                dnaComparisonPending,
                dnaAlignmentMode,
                libraryComparativeMemberIds,
                mapZoomRange,
                mapZoomSlider,
                canCropLibrary: canCropDnaLibrary,
                trace: traceDocument ? { trace: traceDocument.trace, onOpenAsSequence: openTraceAsSequence } : null,
                actions: {
                  onChange: setDisplaySettings,
                  onToggleMapZoom: toggleMapZoom,
                  onEnzymeInfo: openEnzymeInfo,
                  onPreferencesChange: handleEnzymePreferencesChange,
                  onFileEnzymeSetsChange: enzymeSets.updateFileEnzymeSets,
                  onPaintStrandColor: paintUserStrandColor,
                  onSourcesChange: updateDnaComparisonSources,
                  onStatus: setStatus,
                  onPickFromDatabase: () => openDatabaseForAlignment('dna'),
                  onNavigate: navigateDnaSequenceCaret,
                  onTraceFilesChange,
                  onSelectAlignmentTrace: setSelectedAlignmentTraceId,
                  onViewTrace: openTraceInspector,
                  onTracesAdded: handleAlignmentTracesAdded,
                  onRebuildLibraryConsensus: rebuildLibraryConsensusFromMembers,
                  onFlipLibrary: flipDnaLibraryOrientation,
                  onFlipLibraryMember: flipLibraryMemberOrientation,
                  onOpenLibraryMemberAsConstruct: openLibraryMemberAsConstruct,
                  onOpenCombineLibraryReads: () => setCombineLibraryReadsOpen(true),
                  onCropLibrary: cropDnaLibraryToSelection,
                  onGroupLibraryMembers: groupLibraryMembers,
                  onReassembleLibraryMember: reassembleSelectedLibraryMember,
                  onDetachLibraryMemberRead: detachReadFromLibraryMember,
                  onAcceptReadBaseAtTemplate: acceptLibraryReadBaseAtTemplate,
                  onViewRangeChange: handleMapZoomRangeChange,
                  onZoomSliderValueChange: handleMapZoomSliderChange,
                  onFeatureSelect: selectDnaSequenceFeature,
                  onFeatureEdit: editDnaSequenceFeature,
                  onPrimerSelect: selectDnaSequencePrimer,
                  onRestrictionSelect: selectDnaSequenceRestriction,
                  onRangeSelect: setSequenceRange,
                  onExtendToBase: extendSelectionToBase,
                  onPrimerEdit: openPrimerEditorForPrimer,
                  onApplyReferenceReplacement: applyReferenceReplacementFromTrace,
                  onDisplaySettingsChange: setDisplaySettings,
                  onSaveVisualSettings: saveSequenceVisualSettings,
                  onRevertVisualSettings: revertSequenceVisualSettings,
                  onRegisterTemplateNavigator: handleRegisterTemplateNavigator,
                },
              } : null,
            })} sequenceScrollHostRef={sequenceScrollRef} />
            {activeTab === 'Properties' && record.molecule === 'protein' && (
              <ProteinPropertiesPane record={record} selectedRange={selectedRange} />
            )}

            {activeTab === 'Enzymes' && moleculeCapabilities.restrictionEnzymes && (
              <EnzymesTabPane
                settings={displaySettings}
                enzymePreferences={enzymePreferences}
                fileEnzymeSets={record.fileEnzymeSets ?? []}
                restrictionSites={workspaceView.enzymes.restrictionSites}
                parentalRestrictionSites={workspaceView.enzymes.parentalRestrictionSites}
                record={{
                  name: record.name,
                  sequence: record.sequence,
                  topology: record.topology,
                  construct: record.construct,
                }}
                selectedRange={selectedRange}
                searchQuery={searchQuery}
                table={{
                  rows: workspaceView.enzymes.tabRows,
                  sortMode: enzymeTabSortMode,
                  sortDirection: enzymeTabSortDirection,
                }}
                mobile={{
                  isMobileShell,
                  positionMode: enzymeTabPositionMode,
                  expandedLocations: expandedMobileEnzymeLocations,
                }}
                actions={{
                  updateSection: updateDisplaySection,
                  onEnzymeInfo: openEnzymeInfo,
                  onPreferencesChange: handleEnzymePreferencesChange,
                  onFileEnzymeSetsChange: enzymeSets.updateFileEnzymeSets,
                  onSaveEnzymeSet: enzymeSets.openSaveSet,
                  onSort: toggleEnzymeTabSort,
                  onPositionModeChange: setEnzymeTabPositionMode,
                  onExpandLocations: (enzymeName) =>
                    setExpandedMobileEnzymeLocations((current) => new Set(current).add(enzymeName)),
                  onNavigateToSite: navigateToEnzymeSite,
                }}
              />
            )}

            {activeTab === 'Members' && isDnaLibraryRecord(record) && (
              <MembersTabPane
                record={record}
                traceFiles={traceFiles}
                rows={libraryMemberTabRows}
                selection={{
                  selectedMemberIds: selectedLibraryMemberIds,
                  selectedAlignmentTraceId,
                }}
                addMenu={{
                  open: membersAddMenuOpen,
                  busy: membersAddBusy,
                }}
                addMenuRef={membersAddMenuRef}
                reorder={{
                  dropBeforeId: memberReorderDropBeforeId,
                  sourceId: memberReorderSourceId,
                  dragActiveRef: memberReorderDragActiveRef,
                }}
                nameEdit={{
                  editingMemberId: editingMemberNameId,
                  draft: memberNameDraft,
                }}
                columns={{
                  widths: memberColumnWidths,
                  minWidthPx: memberTableMinWidthPx,
                  sortMode: memberTabSortMode,
                  sortDirection: memberTabSortDirection,
                }}
                actions={{
                  onToggleAddMenu: () => setMembersAddMenuOpen((open) => !open),
                  onCloseAddMenu: () => setMembersAddMenuOpen(false),
                  onAddMembersFromFiles: (files) => void addLibraryMembersFromFiles(files),
                  onAddMembersFromDatabase: openDatabaseForLibraryMembers,
                  onDeleteSelected: deleteSelectedLibraryMembers,
                  onDeduplicate: openDeduplicateLibraryMembers,
                  onSetAllEnabled: setAllLibraryMembersEnabled,
                  onSelectAnnotationReference: setLibraryAnnotationReference,
                  onSetConsensusEnabled: setLibraryConsensusEnabled,
                  onSetMemberEnabled: setLibraryMemberEnabled,
                  onBeginReorderDrag: beginLibraryMemberReorderDrag,
                  onSelectRow: selectLibraryMemberTabRow,
                  onOpenMemberSequence: (memberId) => {
                    setSelectedAlignmentTraceId(memberId)
                    setActiveTab('Sequence')
                    hideAlignmentsForMemberSequenceView()
                  },
                  onBeginNameEdit: beginLibraryMemberNameEdit,
                  onCommitNameEdit: commitLibraryMemberNameEdit,
                  onCancelNameEdit: cancelLibraryMemberNameEdit,
                  onNameDraftChange: setMemberNameDraft,
                  onOpenMemberAsConstruct: openLibraryMemberAsConstruct,
                  onFlipMember: flipLibraryMemberOrientation,
                  onRemoveMembers: removeLibraryMembers,
                  onResizeColumn: resizeMemberColumn,
                  onSort: toggleMemberTabSort,
                }}
              />
            )}

            {activeTab === 'Features' && moleculeCapabilities.features && (
              <FeaturesTabPane
                molecule={record.molecule}
                proteinBonds={record.protein?.bonds ?? []}
                selectedBondId={selectedProteinBondId}
                hasFeatureSelected={hasFeatureSelected}
                selectedFeature={workspaceView.features.selected}
                featureSelectionMemberId={featureTabSelectionMemberId}
                selectedFeatureId={selectedFeatureId}
                selectedFeatureIds={selectedFeatureIds}
                table={{
                  entries: workspaceView.features.tabEntries,
                  featureRows: workspaceView.features.tabRows,
                  sortMode: featureTabSortMode,
                  sortDirection: featureTabSortDirection,
                }}
                actions={{
                  onAddFeature: addFeature,
                  onAddBond: addProteinBond,
                  onDeleteSelected: deleteSelectedFeatureOrBond,
                  onEditProperties: editSelectedFeatureProperties,
                  onCheckAllVisibility: setAllFeaturesVisibility,
                  onSort: toggleFeatureTabSort,
                  onSelectRow: selectFeatureTabRow,
                  onFocusSelection: focusFeatureTabSelection,
                  onSetFeatureVisibility: setFeatureVisibility,
                  onSetBondVisibility: setProteinBondVisibility,
                  onSelectBond: selectProteinBondRow,
                  onOpenBondEditor: openProteinBondEditor,
                  onOpenFeatureEditor: openFeatureEditorForFeature,
                }}
              />
            )}

            {activeTab === 'Primers' && moleculeCapabilities.primers && (
              <PrimersTabPane
                featureSelectionMemberId={featureTabSelectionMemberId}
                selectedAlignmentTraceId={selectedAlignmentTraceId}
                selectedFeatureId={selectedFeatureId}
                selectedFeatureIds={selectedFeatureIds}
                selectedPrimerId={selectedPrimerId}
                selectedPrimerIds={selectedPrimerIds}
                newSgRnaMemberId={isDnaLibraryRecord(record) ? (featureTabSelectionMemberId ?? selectedAlignmentTraceId) : null}
                selectedSgRnaRow={workspaceView.primers.selectedPaneSgRna?.kind === 'sgrna' ? workspaceView.primers.selectedPaneSgRna : undefined}
                openAnnealedOligosAvailable={
                  selectedPrimersForMenu.length === 2
                  || (selectedPrimersForMenu.length === 1 && Boolean(sgRnaOligoDirectionFromName(selectedPrimersForMenu[0]!.name)))
                }
                hasPrimerSelected={hasPrimerSelected}
                table={{
                  entries: workspaceView.primers.tabEntries,
                  minWidthPx: primerTableMinWidthPx,
                  columnWidths: primerColumnWidths,
                  primerSort: { mode: primerTabSortMode, direction: primerTabSortDirection },
                  oligoSort: { mode: oligoTabSortMode, direction: oligoTabSortDirection },
                  sgRnaSort: { mode: sgRnaTabSortMode, direction: sgRnaTabSortDirection },
                }}
                search={{
                  hitSet: primerSearchHitSet,
                  activeHitId: primerSearchHitIds[searchHitIndex] ?? null,
                }}
                queries={{
                  hasRegularSelection: hasRegularPrimerPaneSelection,
                  hasOligoSelection: (memberId) => selectedPrimersInPaneMember(memberId, true).length > 0,
                  hasSgRnaSelection: (memberId) => selectedSgRnasInPaneMember(memberId).length > 0,
                }}
                actions={{
                  onAddPrimer: openAddPrimerFromMenu,
                  onNewSgRna: (memberId) => setSgRnaDialog({ memberId, editingId: null, selection: null }),
                  onOpenAnnealedOligos: openSelectedAnnealedOligos,
                  onDeleteSelected: deleteSelectedPrimerOrSgRna,
                  onCheckRegularVisibility: setRegularPrimerGroupPaneVisibility,
                  onCheckOligoVisibility: setOligoGroupPaneVisibility,
                  onCheckSgRnaVisibility: setSgRnaGroupPaneVisibility,
                  onSortPrimer: togglePrimerTabSort,
                  onSortOligo: toggleOligoTabSort,
                  onSortSgRna: toggleSgRnaTabSort,
                  onResizeColumn: resizePrimerColumn,
                  onSelectSgRnaRow: selectSgRnaPaneRowCommand,
                  onSelectPrimerRow: selectPrimerTabRow,
                  onSetPrimerVisibility: setPrimerVisibility,
                  onSetSgRnasVisibility: setSgRnasVisibility,
                  onFocusFeatureSelection: focusFeatureTabSelection,
                  onFocusPrimerSelection: focusPrimerTabSelection,
                  onOpenFeatureEditor: openFeatureEditorForFeature,
                  onOpenPrimerEditor: openPrimerEditorForPrimer,
                }}
              />
            )}

            {activeTab === 'History' && (
              <WorkspaceHistoryTab
                model={workspaceHistoryTabModel}
                commands={{
                  onManageHistory: () => setHistoryManagerOpen(true),
                  onManageProteinSourceHistory: () => setProteinSourceHistoryManagerOpen(true),
                  onOpenTranslationSourceDna: openTranslationSourceDnaCommand,
                  onOpenHistoryConstruct: openHistoryConstruct,
                  onInspectHistoryOligo: inspectHistoryOligo,
                  onOpenEnzymeInfo: openEnzymeInfo,
                  onOpenHistoryRestrictionGel: openHistoryRestrictionGel,
                  onOpenAnnealedHistoryInsert: openAnnealedHistoryInsert,
                }}
              />
            )}
          </div>
        </section>

        {effectiveDescriptionPanelVisible && (
            <div
              className="description-panel-splitter"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize description panel"
              aria-valuenow={Math.round(descriptionPanelWidthPx)}
              onPointerDown={startDescriptionPanelSplitDrag}
            />
        )}
        {effectiveDescriptionPanelVisible ? (
          <button
            type="button"
            className="mobile-drawer-backdrop mobile-description-backdrop"
            aria-label="Close description panel"
            onClick={() => setDescriptionPanelVisible(false)}
          />
        ) : null}
        <div
          id="document-description-drawer"
          className={`description-panel-drawer${effectiveDescriptionPanelVisible ? ' is-open' : ''}`}
          aria-hidden={!effectiveDescriptionPanelVisible}
          inert={effectiveDescriptionPanelVisible ? undefined : true}
        >
          <div className="mobile-drawer-heading description-drawer-heading">
            <strong>Description</strong>
            <button type="button" aria-label="Close description panel" onClick={() => setDescriptionPanelVisible(false)}>
              <X aria-hidden="true" />
            </button>
          </div>
          <DescriptionPanel
              record={record}
              otherOpenTabs={otherOpenTabs}
              pendingSharedFragment={pendingSharedFragment}
              canInsertSharedFragment={canInsertSharedFragment}
              canShareSelectionToOtherTabs={canShareSelectionToOtherTabs}
              onRecordChange={updateRecord}
              onShareSelectionToOtherTabs={() => void shareSelectionToOtherTabs()}
              onLoadOpenTab={sharedTabController.loadFromOpenTab}
              onUnloadOpenTab={(openTabId) => void unloadOpenTab(openTabId)}
              onUnloadOrphanedTabs={() => void unloadOrphanedOpenTabs()}
              onInsertSharedFragment={insertPendingSharedFragment}
              onDismissSharedFragment={dismissPendingSharedFragment}
              isNativeDesktop={isTauriRuntime()}
              {...(!isTauriRuntime()
                ? {
                    projects,
                    onLoadProject: (project: StoredProjectSummary) =>
                      void requestDocumentExit(() => handleLoadProjectSummary(project)),
                    onDeleteProject: (project: StoredProjectSummary) => void handleDeleteProject(project),
                  }
                : {})}
            />
        </div>
        </div>

          <WorkspaceTabBar
            model={workspaceTabBarModel}
            commands={{
              onSelectTab: createWorkspaceTabSelectHandler({ setActiveTab, setMobileSearchOpen }),
              onToggleMobileSearch: () => setMobileSearchOpen((open) => !open),
              onSearchQueryChange: setSearchQuery,
              onPreviousSearchHit: () => goToSearchHit(-1),
              onNextSearchHit: () => goToSearchHit(1),
              onDescriptionPanelVisibleChange: setDescriptionPanelVisible,
            }}
          />
      </section>
      <PrimerDialogsHost
        record={record}
        primerEditor={primerEditor}
        onSavePrimerEditor={savePrimerEditor}
        onPrimerSpecificityChange={savePrimerSpecificity}
        setPrimerEditor={setPrimerEditor}
        primerMergeNotice={primerMergeNotice}
        setPrimerMergeNotice={setPrimerMergeNotice}
        primerNameWarning={primerNameWarning}
        setPrimerNameWarning={setPrimerNameWarning}
        libraryPrimer={libraryPrimer}
        setLibraryPrimer={setLibraryPrimer}
        primerOrientationOpen={primerOrientationOpen}
        setPrimerOrientationOpen={setPrimerOrientationOpen}
        openPrimerEditorFromSelection={openPrimerEditorFromSelection}
        primerColorPickerOpen={primerColorPickerOpen}
        setPrimerColorPickerOpen={setPrimerColorPickerOpen}
        selectedPrimer={selectedPrimersForMenu[0] ?? null}
        applyPrimerColor={applyPrimerColor}
        hybridizationParamsOpen={hybridizationParamsOpen}
        setHybridizationParamsOpen={setHybridizationParamsOpen}
        hybridization={normalizePrimerHybridizationParams(displaySettings.primers.hybridization)}
        saveHybridizationParameters={saveHybridizationParameters}
        pickPrimersRange={pickPrimersRange}
        setPickPrimersRange={setPickPrimersRange}
        addPickedPrimers={addPickedPrimers}
        setStatus={setStatus}
        primerImportDialog={primerImportDialog}
        setPrimerImportDialog={setPrimerImportDialog}
        addImportedPrimers={addImportedPrimers}
        primersImportFromFileOpen={primersImportFromFileOpen}
        otherOpenTabs={otherOpenTabs.map((tab) => ({ tabId: tab.tabId, name: tab.name, molecule: tab.molecule }))}
        onLoadOpenTab={async (openTabId) => (await getFreshOpenTabSession(openTabId))?.record ?? null}
        libraryMemberSequences={isDnaLibraryRecord(record) ? traceFiles.filter((trace) => !trace.parseError && trace.sequence.length > 0).map((trace) => trace.sequence) : undefined}
        libraryMemberPrimers={isDnaLibraryRecord(record) ? traceFiles.flatMap((trace) => trace.primers ?? []) : undefined}
        setPrimersImportFromFileOpen={setPrimersImportFromFileOpen}
      />
      <HistoryDialogsHost
        record={record}
        historyManagerOpen={historyManagerOpen}
        setHistoryManagerOpen={setHistoryManagerOpen}
        onApplyHistoryRetention={applyManagedHistoryRetention}
        proteinSourceHistoryManagerOpen={proteinSourceHistoryManagerOpen}
        setProteinSourceHistoryManagerOpen={setProteinSourceHistoryManagerOpen}
        onLoadProject={async (projectId) => (await getProject(projectId))?.record ?? null}
        onApplyProteinSourceRetention={applyManagedProteinSourceRetention}
      />
      <AnnotationDialogsHost
        record={record}
        traceFiles={traceFiles}
        featureEditor={featureEditor}
        setFeatureEditor={setFeatureEditor}
        setPendingFeatureMergeIds={setPendingFeatureMergeIds}
        saveFeatureEditor={saveFeatureEditor}
        openFeatureDraftAsProtein={openFeatureDraftAsProtein}
        proteinFeatureEditor={proteinFeatureEditor}
        setProteinFeatureEditor={setProteinFeatureEditor}
        saveProteinFeatureEditor={saveProteinFeatureEditor}
        commonFeatureDetection={commonFeatureDetection}
        redetectCommonFeatures={redetectCommonFeatures}
        setCommonFeatureDetection={setCommonFeatureDetection}
        addDetectedCommonFeatures={addDetectedCommonFeatures}
        crisprDetection={crisprDetection}
        setCrisprDetection={setCrisprDetection}
        featuresImportFromFileOpen={featuresImportFromFileOpen}
        setFeaturesImportFromFileOpen={setFeaturesImportFromFileOpen}
        otherOpenTabs={otherOpenTabs.map((tab) => ({ tabId: tab.tabId, name: tab.name, molecule: tab.molecule }))}
        getOpenTabSession={async (openTabId) => {
          const session = await getOpenTabSession(openTabId)
          return session?.record ? { record: session.record } : null
        }}
        addImportedFeatures={addImportedFeatures}
        commonFeaturesBrowseOpen={commonFeaturesBrowseOpen}
        setCommonFeaturesBrowseOpen={setCommonFeaturesBrowseOpen}
        renderWorkspace={(args) => <CloningRecordWorkspace {...args} primerHybridization={args.primerHybridization ?? displaySettings.primers.hybridization} />}
      />
      <CrisprWorkflowDialogsHost
        record={record}
        traceFiles={traceFiles}
        sgRnaDialog={sgRnaDialog}
        setSgRnaDialog={setSgRnaDialog}
        onSaveSgRna={saveSgRna}
        sgRnaCloningSnapshot={sgRnaCloningSnapshot}
        currentTabId={tabId}
        setSgRnaCloningSnapshot={setSgRnaCloningSnapshot}
        onOpenAnnealedInsert={openAnnealedInsert}
        onCloneSgRna={(products) => {
          setSgRnaCloningSnapshot(null)
          openUnsavedRecordsInNewTabs(products)
          setStatus(`Opened ${products.length} sgRNA cloning product${products.length === 1 ? '' : 's'}.`)
        }}
        renderWorkspace={(args) => <CloningRecordWorkspace {...args} primerHybridization={args.primerHybridization ?? displaySettings.primers.hybridization} />}
        guideScanDesignDialog={guideScanDesignDialog}
        setGuideScanDesignDialog={setGuideScanDesignDialog}
        selectionFocus={selectionFocus}
        selectedFeatureId={selectedFeatureId}
        selectedRange={selectedRange}
        onPersistGuideScanCache={persistGuideScanDesignCache}
        onAddGuideScanSelected={guideScanDesignAddSelected}
        setStatus={setStatus}
        commonPrimerMatches={commonPrimerMatches}
        setCommonPrimerMatches={setCommonPrimerMatches}
        onAddDatabasePrimers={addDatabasePrimers}
      />
      {crisprExcision && <CrisprExcisionDialog record={crisprExcision.source} plan={crisprExcision.plan} onCancel={() => setCrisprExcision(null)} onExcise={exciseCrisprRegion} />}
      {sangerAlleles && <SangerAllelesDialog record={sangerAlleles.record} traces={sangerAlleles.traces} onCancel={() => setSangerAlleles(null)} onAnalysisChange={(analysis) => updateRecord((current) => current.id === sangerAlleles.record.id ? { ...current, dna: { ...current.dna, sangerAlleleAnalysis: analysis } } : current, { recordHistory: false })} onOpenLibrary={async (prepareLibrary) => {
        const reservedTab = isTauriRuntime() ? undefined : window.open('about:blank', '_blank')
        if (reservedTab === null) throw new Error('The new tab was blocked. Allow popups for this site and try again.')
        try {
          if (reservedTab) {
            reservedTab.document.title = 'Preparing allele library…'
            reservedTab.document.body.textContent = 'Preparing allele library…'
          }
          const library = await prepareLibrary()
          const opened = await new Promise<boolean>((resolve) => openRecordInNewTab(library, { initiallyUnsaved: true, reservedTab, onOpenResult: resolve }))
          if (!opened) throw new Error('Could not open the allele library in a new window or tab.')
          setSangerAlleles(null)
        } catch (error) {
          reservedTab?.close()
          throw error
        }
      }} />}
      <CloningAssemblyDialogsHost
        record={record}
        traceFiles={traceFiles}
        tabId={tabId}
        selectedRange={selectedRange}
        retainedCloningDialogs={retainedCloningDialogs}
        primerHybridization={displaySettings.primers.hybridization}
        renderWorkspace={(args) => <CloningRecordWorkspace key={args.workspaceKey} {...args} primerHybridization={args.primerHybridization ?? displaySettings.primers.hybridization} />}
        lifecycle={cloningDialogLifecycle}
        restrictionCloningOpen={restrictionCloningOpen}
        restrictionCloningMode={restrictionCloningMode}
        initialEnzymeSet={displaySettings.enzymes}
        initialVectorSites={cutSelectionEnzymes ? [cutSelectionEnzymes.upstream, cutSelectionEnzymes.downstream] : []}
        onRestrictionClone={cloningAssemblyHandlers.onRestrictionClone}
        gibsonAssemblyOpen={gibsonAssemblyOpen}
        gibsonAssemblyMethod={gibsonAssemblyMethod}
        onGibsonAssemble={cloningAssemblyHandlers.onGibsonAssemble}
        taGcCloningOpen={taGcCloningOpen}
        taGcCloningMethod={taGcCloningMethod}
        onTaGcClone={cloningAssemblyHandlers.onTaGcClone}
        gatewayCloningOpen={gatewayCloningOpen}
        gatewayCloningMethod={gatewayCloningMethod}
        onGatewayClone={cloningAssemblyHandlers.onGatewayClone}
        massRestrictionResult={massRestrictionResult}
        blockedBatchOpen={blockedBatchOpen}
        onOpenBlockedProduct={cloningAssemblyHandlers.onOpenBlockedProduct}
        agaroseGelOpen={agaroseGelOpen}
        agaroseGelSnapshot={agaroseGelSnapshot}
        onCloseAgaroseGel={closeAgaroseGel}
      />
      <UtilityBugReportDialogsRegion
        record={record}
        toolsMwSelection={toolsMwSelection}
        utility={{
          dnaMwOpen: analysisToolDialogs.dnaMwOpen,
          setDnaMwOpen,
          doubleDigestOpen: analysisToolDialogs.doubleDigestOpen,
          setDoubleDigestOpen,
          letterCodesOpen: analysisToolDialogs.letterCodesOpen,
          setLetterCodesOpen: analysisToolDialogs.setLetterCodesOpen,
          preferencesOpen: utilityDialogs.preferencesOpen,
          setPreferencesOpen,
          appPreferences,
          onSaveAppPreferences: saveAppPreferences,
          generateLinkOpen: utilityDialogs.generateLinkOpen,
          setGenerateLinkOpen,
          openSequenceUrlOpen: utilityDialogs.openSequenceUrlOpen,
          setOpenSequenceUrlOpen,
          requestDocumentExit,
          downloadRemoteSequenceDocument,
          bytesToFile,
          handleFile: documentFileImportController.handleFile,
          setStatus,
          setRemoteSequenceOpenError,
          remoteSequenceOpenError,
        }}
        bugReport={{
          open: utilityDialogs.bugReportOpen,
          onClose: () => setBugReportOpen(false),
          dialogProps: {
            recentStatus: status,
            statusHistory,
            snapshot: buildBugReportAppSnapshot({
              appVersion: WHATS_NEW_VERSION,
              record,
              otherOpenTabs,
              selectedRange,
              undoDepth: undoStack.length,
              redoDepth: redoStack.length,
              mapLinear: Boolean(displaySettings.mapView.linear),
              mapZoom: Boolean(displaySettings.mapView.zoom),
              openDialogs: [
                utilityDialogs.preferencesOpen && 'preferences',
                helpDialogs.aboutOpen && 'about',
                helpDialogs.whatsNewOpen && 'whats-new',
                pcrOpen && 'pcr',
                analysisToolDialogs.dnaMwOpen && 'dna-mw',
                analysisToolDialogs.doubleDigestOpen && 'double-digest',
                analysisToolDialogs.letterCodesOpen && 'letter-codes',
                helpDialogs.geneticCodeTablesOpen && 'genetic-code-tables',
                selectRangeOpen && 'select-range',
                editMapLabelOpen && 'edit-map-label',
                hybridizationParamsOpen && 'hybridization-params',
                primerOrientationOpen && 'primer-orientation',
                primerColorPickerOpen && 'primer-color',
                Boolean(pendingDocumentExit) && 'unsaved-changes',
                Boolean(primerImportDialog) && 'import-primers',
                Boolean(libraryPrimer) && 'library-primer',
                Boolean(primerEditor) && 'primer-editor',
              ].filter(Boolean) as string[],
            }),
            currentSequence: record.sequence,
            loadOtherSequences: async () => {
              const out: Array<{ name: string; sequence: string }> = []
              for (const tab of otherOpenTabs) {
                const session = await getOpenTabSession(tab.tabId)
                if (session?.record?.sequence) {
                  out.push({ name: session.record.name || tab.name, sequence: session.record.sequence })
                }
              }
              return out
            },
            onSubmitted: (reportId) =>
              setStatus(reportId ? `Bug report #${reportId} sent. Thank you.` : 'Bug report sent. Thank you.'),
          },
        }}
      />
      <DocumentLifecycleDialogsHost
        record={record}
        saveToDialogOpen={saveToDialogOpen}
        currentDocumentFileName={currentDocumentFileName}
        resolvedLibraryFolderId={resolvedLibraryFolderId}
        databaseSaveBusy={databaseSaveBusy}
        cancelDatabaseSaveFlow={cancelDatabaseSaveFlow}
        handleSaveToFolder={handleSaveToFolder}
        setSaveToDialogOpen={setSaveToDialogOpen}
        renameFileDialogOpen={renameFileDialogOpen}
        documentSaveBinding={documentSaveBinding}
        handleRenameFile={handleRenameFile}
        setRenameFileDialogOpen={setRenameFileDialogOpen}
        nativeFormatSaveProject={nativeFormatSaveProject}
        nativeOverwriteAvailability={nativeOverwriteAvailability}
        snapGeneExtensionForMolecule={snapGeneExtensionForMolecule}
        saveNativeFormatDecision={saveNativeFormatDecision}
        setNativeFormatSaveProject={setNativeFormatSaveProject}
        pendingDocumentExit={pendingDocumentExit}
        resolveDocumentExit={resolveDocumentExit}
      />
      {databaseExitSyncProgress && <DatabaseExitSyncOverlay progress={databaseExitSyncProgress} />}
      {traceInspectorTarget && <TraceInspectorOverlay target={traceInspectorTarget} onClose={closeTraceInspector} />}
      <HelpDialogsRegion
        molecule={record.molecule}
        helpOpen={{
          ...helpDialogs.openSnapshot,
          setGeneticCodeTablesOpen: helpDialogs.setGeneticCodeTablesOpen,
          setWhatsNewOpen: helpDialogs.setWhatsNewOpen,
          setAboutOpen: helpDialogs.setAboutOpen,
          setTelegramGroupOpen: helpDialogs.setTelegramGroupOpen,
          setDnaLibraryHelpOpen: helpDialogs.setDnaLibraryHelpOpen,
          setHistoryDerivedWorkflowsHelpOpen: helpDialogs.setHistoryDerivedWorkflowsHelpOpen,
          setDatabaseHelpOpen: helpDialogs.setDatabaseHelpOpen,
          setCrisprWorkflowHelpOpen: helpDialogs.setCrisprWorkflowHelpOpen,
          setAlignmentsHelpOpen: helpDialogs.setAlignmentsHelpOpen,
          setKeyboardShortcutsOpen: helpDialogs.setKeyboardShortcutsOpen,
        }}
      />
      <CloningWorkflowDialogsHost
        record={record}
        traceFiles={traceFiles}
        tabId={tabId}
        pcrOpen={pcrOpen}
        pcrInvocation={pcrInvocation}
        pcrRetained={retainedCloningDialogs.has('pcr')}
        setPcrOpen={setPcrOpen}
        selectedRange={selectedRange}
        selectedPrimerIds={selectedPrimersForMenu.map((primer) => primer.id)}
        primerHybridization={displaySettings.primers.hybridization}
        onPcr={cloningWorkflowHandlers.onPcr}
        pcrRenderWorkspace={(args) => <PcrRecordWorkspace {...args} primerHybridization={args.primerHybridization ?? displaySettings.primers.hybridization} />}
        lifecycle={cloningDialogLifecycle}
        mutagenesisOpen={mutagenesisOpen}
        mutagenesisRetained={retainedCloningDialogs.has('mutagenesis')}
        setMutagenesisOpen={setMutagenesisOpen}
        onMutagenize={cloningWorkflowHandlers.onMutagenize}
        mutagenesisRenderWorkspace={(args) => <CloningRecordWorkspace {...args} />}
      />
      <FeatureEditingDialogsHost
        record={record}
        exportFeatureDataOpen={exportFeatureDataOpen}
        selectedFeatureCount={workspaceView.features.menuSelection.length}
        setExportFeatureDataOpen={setExportFeatureDataOpen}
        onConfirmFeatureExport={confirmExportFeatureData}
        segmentTargetDialog={segmentTargetDialog}
        setSegmentTargetDialog={setSegmentTargetDialog}
        onCreateSegment={createSegmentOnFeature}
        featureMergeTemplateDialog={featureMergeTemplateDialog}
        setFeatureMergeTemplateDialog={setFeatureMergeTemplateDialog}
        onOpenFeatureMergeEditor={openFeatureMergeEditor}
        cleavageChooser={cleavageChooser}
        setCleavageChooser={setCleavageChooser}
        onAddCleavage={addCleavageToFeature}
        onRemoveCleavage={removeCleavageFromFeature}
        dnaEndsEditorOpen={dnaEndsEditorOpen}
        displayedRestrictionSites={workspaceView.enzymes.displayedRestrictionSites}
        cachedOrfFeatures={workspaceView.orf.cachedFeatures}
        setDnaEndsEditorOpen={setDnaEndsEditorOpen}
        onSaveDnaEnds={handleSaveDnaEnds}
        newDnaFileOpen={newDnaFileOpen}
        setNewDnaFileOpen={setNewDnaFileOpen}
        onCreateDnaFile={handleCreateNewDnaFile}
        newProteinFileOpen={newProteinFileOpen}
        setNewProteinFileOpen={setNewProteinFileOpen}
        onCreateProteinFile={handleCreateNewProteinFile}
        proteinBondEditor={proteinBondEditor}
        setProteinBondEditor={setProteinBondEditor}
        onSaveProteinBond={saveProteinBond}
        onDeleteProteinBond={record.protein?.bonds.some((bond) => bond.id === proteinBondEditor?.id) && proteinBondEditor ? () => deleteProteinBond(proteinBondEditor.id) : undefined}
        pendingNewFileFromSelection={pendingNewFileFromSelection}
        setPendingNewFileFromSelection={setPendingNewFileFromSelection}
        onConfirmNewFileFromSelection={confirmNewFileFromSelection}
        convertToLibrarySourceOpen={convertToLibrarySourceOpen}
        setConvertToLibrarySourceOpen={setConvertToLibrarySourceOpen}
        onConvertFromFiles={openConvertToLibraryFromFiles}
        onConvertFromDatabase={openDatabaseForConvertToLibrary}
      />
      <DatabaseDialogsHost
        combineLibraryReadsOpen={combineLibraryReadsOpen && isDnaLibraryRecord(record)}
        combineLibraryProps={{ members: traceFiles, onCombine: combineLibraryMembersFromGroups }}
        setCombineLibraryReadsOpen={setCombineLibraryReadsOpen}
        dedupeLibraryMembersGroups={dedupeLibraryMembersGroups}
        dedupeLibraryProps={{ onConfirm: confirmDeduplicateLibraryMembers }}
        setDedupeLibraryMembersGroups={setDedupeLibraryMembersGroups}
        databaseOpen={databaseOpen}
        databaseManagerProps={databaseManagerProps}
        setDatabaseOpen={setDatabaseOpen}
        onDatabaseClose={onDatabaseClose}
        sequenceDatabaseImportOpen={sequenceDatabaseImportOpen}
        sequenceImportProps={sequenceImportProps}
        setSequenceDatabaseImportOpen={setSequenceDatabaseImportOpen}
      />
      <DatabaseAnnotationDialogsHost
        record={record}
        proteinUniProtAnnotationRange={proteinUniProtAnnotationRange}
        setProteinUniProtAnnotationRange={setProteinUniProtAnnotationRange}
        onApplyProteinAnnotations={applyProteinUniProtAnnotations}
        onApplyProteinInterPro={applyProteinInterProAnnotations}
        onOpenExternal={(url) => { void openExternalUrl(url).catch((error) => setStatus(`Could not open annotation source: ${error instanceof Error ? error.message : String(error)}`)) }}
        dnaDatabaseAnnotationRange={dnaDatabaseAnnotationRange}
        setDnaDatabaseAnnotationRange={setDnaDatabaseAnnotationRange}
        onApplyDnaAnnotations={applyDnaDatabaseAnnotations}
        onApplyTranslatedOrfs={applyTranslatedOrfAnnotations}
        translatedOrfAnnotationRange={translatedOrfAnnotationRange}
        setTranslatedOrfAnnotationRange={setTranslatedOrfAnnotationRange}
      />
      <SelectionTranslationDialogsHost
        record={record}
        pendingTopologyImport={pendingTopologyImport}
        setPendingTopologyImport={setPendingTopologyImport}
        onCancelTopology={() => {
          if (!pendingTopologyImport) return
          setPendingTopologyImport(null)
          setStatus(`Cancelled opening ${pendingTopologyImport.fileName}.`)
        }}
        onChooseTopology={handleTopologyChoice}
        selectRangeOpen={selectRangeOpen}
        setSelectRangeOpen={setSelectRangeOpen}
        selectedRange={selectedRange}
        onApplySelectRange={applySelectRange}
        editMapLabelOpen={editMapLabelOpen}
        setEditMapLabelOpen={setEditMapLabelOpen}
        onApplyMapLabel={applyEditMapLabel}
        translationOptionsDraft={translationOptionsDraft}
        setTranslationOptionsDraft={setTranslationOptionsDraft}
        onTranslationDraftChange={(patch) => setTranslationOptionsDraft((current) => (current ? { ...current, ...patch } : current))}
        onConfirmTranslationOptions={confirmTranslationOptions}
      />
      <EnzymeDialogsHost
        record={record}
        selectedRange={selectedRange}
        enzymePreferences={enzymePreferences}
        onPreferencesChange={handleEnzymePreferencesChange}
        enzymeSetWorkflow={enzymeSets}
        enzymeInfoName={enzymeInfoName}
        setEnzymeInfoName={setEnzymeInfoName}
        enzymePrioritiesOpen={enzymePrioritiesOpen}
        setEnzymePrioritiesOpen={setEnzymePrioritiesOpen}
        onSavePriorities={saveEnzymePriorityOrder}
        parentalCounts={workspaceView.enzymes.parentalSiteCounts}
        noncutters={workspaceView.enzymes.menuNoncutters}
        onEnzymeInfo={openEnzymeInfo}
        onDownloadText={downloadText}
      />
      <ActionProfileOverlay />
      <AlignmentProfileOverlay />
    </main>
  )
}

App.prepareBootstrap = prepareAppDocumentBootstrap
export default App
