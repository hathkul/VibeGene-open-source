# Feature ownership map

Use this map to find the established boundary before adding a feature or fixing a bug. It is intentionally organized by responsibility, not by every exported function. Source and tests remain the final authority when details differ.

## Workspace shell

- `src/App.tsx` is the main workspace composition root. It owns top-level state, refs, concrete adapter assembly, and cross-feature result commits.
- `src/presentation/workspace/WorkspaceMapHost.tsx` and `WorkspaceSequenceHost.tsx` render the main Map and Sequence regions from typed view models.
- `src/presentation/workspace/useWorkspaceViewProjection.ts` builds read-only projections for current record, library member, features, primers, enzymes, and pane visibility.
- `src/presentation/workspaceTabs/` owns Enzymes, Members, Features, and Primers tab panes.
- `src/presentation/workspace/SelectionStatusBar.tsx` and its model/helpers own selection and status-bar presentation.
- `src/presentation/mobileShell/` and `useMobileShellBehavior` own mobile app-bar/drawer rendering and lifecycle.

## Document lifecycle and persistence

- `src/application/documentOpen/`, `src/remoteDocumentOpen.ts`, and `src/localDocumentOpen.ts` own document-open planning and adapter assembly.
- `src/application/documentImport/` owns import classification and deterministic import/commit plans. `useDocumentImportController`, `useDocumentFileImportController`, and `useDocumentImportCommitController` own React orchestration.
- `src/application/documentSave/` owns standalone save planning and routing. `src/documentSave.ts` provides concrete adapters.
- `src/application/documentExit/` owns the unsaved-document decision tree.
- `useDocumentDiskPersistenceController`, `useDatabasePersistenceController`, and `useDocumentSaveCoordinator` own save orchestration.
- `useDocumentDraftLifecycle`, `useRecentDocumentLifecycle`, `useDesktopFileDropLifecycle`, and `useDesktopWindowLifecycle` own recovery, recent/open events, drop subscriptions, and close coordination through injected host ports.
- `useSettingsPersistenceController`, `useProjectPersistenceController`, `useDocumentHandoffController`, and `useSharedTabController` own their named persistence/handoff workflows.

## Selection and editing

- `src/application/selectionEditing/` owns deterministic range, caret, sticky-end, replacement, case, inversion, history, and edit-commit transitions.
- `useSelectionEditingController` owns selection and undo/redo state.
- `useDnaSequenceEditController`, `useSequenceEditingActions`, `useSequenceClipboardController`, and `useSelectionRangeController` own mutation/clipboard/range orchestration through injected ports.
- Clipboard, focus, scroll, persistence, and history adapters remain composition-root concerns.

## Map and sequence rendering

- `src/presentation/map/` owns map rendering, zoom, history previews, image export, and map interaction primitives.
- `PlasmidMap.tsx` is a deliberate render-engine exception containing tightly coupled SVG, label routing, worker lifecycle, caches, and interactions.
- `CircularMapStage.tsx` owns the circular map's responsive viewport measurement, resize stabilization, remembered stage size, and visual controls; the map barrel exports it alongside `PlasmidMap`.
- `src/domain/circularEllipticCurve.ts` owns label-curve geometry, radial-clearance proofs, and the bounded curvature cache. `circularEllipticCandidateQuality.ts` owns elliptic candidate comparisons and half/side bend summaries; the router retains packing, search, and completed-layout quality measurement.
- `src/presentation/sequence/` owns nucleotide sequence rows, minimaps, layout, scrolling, and virtualization.
- `SequenceRows.tsx` is a deliberate render-engine exception containing tightly coupled per-base rendering and interaction lifecycle.
- `src/domain/primerRowPlacement.ts` owns primer lane assignment, label-overflow spacing, reverse-frame clearance, and row packing-coordinate conversion; the renderer supplies measured geometry.
- `useTranslationDragSelection` owns translation-glyph drag selection; `useTranslationCopyAction` owns the matching copy action; `src/domain/contextMenuGesture.ts` owns the context-menu gesture rule that keeps such a selection intact.
- `src/domain/geneticCode.ts` owns the fragment-scoped translation selection rules: a codon spanning a segment boundary is one amino acid drawn as one glyph per segment, so selection follows the drawn glyph while the clipboard still yields one amino acid.
- `src/domain/sequencePaneTranslationLayout.ts` owns sequence-row level allocation: feature bodies and primer bodies share one skyline, and a primer that overlaps a feature is always placed below that feature.
- `src/presentation/protein/` owns protein map/sequence panes, bonds, properties, controls, and protein-specific rendering helpers.
- `useAlignmentOrchestration` owns trace/comparative alignment scheduling, projection, and deferred scrolling without storage/native I/O.
- `src/workerAdapters/` owns worker execution and cleanup; focused ports are injected at the application composition boundary. Domain owns alignment, scanning, and serializable protocols.

## Workspace interaction controllers

- `useWorkspaceSearchController`: search cycling and reveal.
- `useWorkspaceAnnotationSelectionController`: feature/primer selection variants and member scope.
- `useWorkspaceMapInteractionController` and `useWorkspaceMapNavigationController`: map interaction and library navigation.
- `useWorkspacePanelLayoutController`: zoom and panel resizing.
- `useWorkspaceClipboardColorController`: injected clipboard and color actions.
- `useWorkspaceTopologyDisplayController`: topology, origin, ends, orientation, labels, and translation display.
- `useWorkspaceDisplaySettingsController`: display-setting transitions and persistence-facing patches.
- `src/application/workspaceInteraction/` owns deterministic calculations behind these controllers.

## Features and annotations

- `src/application/featureEditing/` owns strict feature-segment, cleavage, splicing, and mutation transitions.
- `useFeatureStructureController` owns segment/cleavage/splicing workflow orchestration and post-transition focus.
- `src/application/featureAnnotation/` owns annotation append and post-selection planning.
- `useFeatureAnnotationController`, `useCrisprFeatureController`, and `useFeatureEditorController` own annotation detection/application, CRISPR editing, and feature-editor orchestration.
- `useCrisprFeatureController` also owns excision dialog state, target revalidation, mutation dispatch, and post-excision selection; `src/application/selectionEditing/crisprExcision.ts` owns the deterministic excision plan and record transition.
- `useFeaturePaneInteractionController` owns feature-table selection, focus, and visibility commands.

## Primers and sgRNA

- `src/application/primerWorkflow/` owns deterministic primer projection, editing, mutations, import/export plans, library operations, and selection mapping.
- `src/presentation/primers/` owns primer table primitives and primer editor rendering.
- `usePrimerManagementController` owns editor state and primer CRUD commands.
- `usePrimerSelectionController` owns primer/oligo/sgRNA selection and visibility.
- `usePrimerLibraryWorkflowController` owns common-primer and database-primer workflows.
- `usePrimerImportExportController` owns list import, range picking, and export.
- `usePrimerOrSgRnaDeleteCommand` owns mixed-pane deletion routing.

## Proteins

- `src/application/proteinWorkflow/` owns deterministic comparison, annotation, and bond transitions.
- `useProteinComparisonController`, `useProteinAnnotationController`, and `useProteinBondController` own the corresponding UI orchestration.
- `useFeatureOrProteinBondCommands` owns feature-tab edit/delete precedence.
- `useProteinSequenceEditController` owns protein sequence replacement and cleanup coordination.

## DNA libraries and database

- `src/application/databaseLibrary/` owns eligibility, intake, and deterministic library plans.
- `useDnaLibraryCommandController` owns create/convert picker routing and commit/collapse commands.
- `useDnaLibraryWorkflowController` owns ingestion, reorder, consensus, grouping, reassembly, crop, flip, and member-to-construct workflows.
- `useDatabaseLibraryController`, `useDatabaseAlignmentIntakeController`, `useDatabaseLibraryMemberActions`, and `useDatabaseHybridResults` own workspace-facing database/library orchestration.
- `useDatabaseAlignmentIntakeController` routes dropped constructs to document opening or alignment through injected project, document-exit, and opening ports; App supplies adapters and drag subscriptions.
- `src/application/databaseManager/` owns neutral Database Manager models, intents, command planning, ports, and React-free projection models.
- `src/presentation/databaseManager/` owns Database Manager rendering regions.
- `src/DatabaseManagerDialog.tsx` is the adapter-aware Database Manager composition root and the sole boundary for concrete database/native values in that feature.
- Detailed persistence and folder-sync invariants are in [database architecture](../database-architecture.md).

## Enzymes and display preferences

- `src/domain/restrictionSiteFilters.ts` owns recognition-base projection and cut-boundary selection classification.
- `src/application/enzymeSets/` owns set selection, validation, merge, export, and record-set normalization plans.
- `useEnzymeSetWorkflowController` owns enzyme-set dialogs and commands through injected persistence/download/status ports.
- `useWorkspaceEnzymePreferencesController` owns preference persistence timing, position mode, priorities, and info routing.
- `src/workspaceEnzymePreferences.ts` supplies browser persistence and cross-window sync adapters.
- `src/presentation/dnaViewControls/` owns DNA view controls and enzyme/ORF/primer/range sidebars and dialogs.

## Menus and dialogs

- `src/presentation/documentMenus/` owns browser document-menu rendering and menu-local dialogs.
- `useNativeAppMenuController` owns native action dispatch and enabled-state derivation through the neutral lifecycle contract.
- `src/desktop/nativeMenuLifecycleAdapters.ts` owns Tauri focus/menu subscriptions and synchronization.
- `src/presentation/dialogs/` contains feature-level dialog hosts. Hosts preserve mounting, focus, accessibility, and callback order while controllers own state and workflows.
- `src/ui/DialogPrimitives.tsx` supplies shared structural primitives where a dialog fits the standard shell; specialized feature layout remains local.

## Cloning, PCR, gel, and heavy tools

- `src/presentation/cloning/` and `src/presentation/pcr/` own reusable workspace shells.
- `useCloningWorkspaceController` owns retained dialog identity and lifecycle.
- `useCloningCompletionHandlers` owns completion/handoff/status sequencing.
- Gateway, Gibson, restriction, TA/GC, PCR, and agarose dialogs are singular feature-level composition roots. Size alone is not a reason to split them.
- Database Manager, cloning, PCR/recipe, agarose gel, primer picking, and GuideScan dialogs are lazy-loaded. Preserve those lazy boundaries when changing imports.
- `src/application/agaroseGel/` owns neutral gel lane/source/band planning; export orchestration lives in `useAgaroseGelExportController`.

## Compatibility façades

- `src/domain/parsers.ts` is the stable parser entry point; format implementations remain behind it.
- `src/domain/primerSequenceLayout.ts` is the stable primer-layout entry point; binding, projection, and path modules remain behind it.
- `src/domain/primerBindingAnalysis.ts` owns the reading of a reverse primer duplex (top-strand projection vs. written oligo 5′→3′). One reading is resolved per component and drives both the drawn letters and the glyph positions, so a duplex that reads both ways (a reverse-complement palindrome) cannot shift the body off its anneal site.
- Do not bypass these façades from new callers merely because an implementation module is available.
