# Workspace map/sequence navigation contracts

Contract inventory of **App.tsx** map/sequence wiring and the focused controllers that own option-binding behavior. Identity forwards are documented for completeness but are **not** extraction targets.

Legend: **adapter** = real option/context shaping; **forward** = direct reference or identity lambda.

## Protein map (`createWorkspaceMapModel` → protein actions)

| Callback | Kind | Scroll | Toggle | Member | Notes |
|----------|------|--------|--------|--------|-------|
| `onRangeSelect: setSequenceRange` | forward | Default `setSequenceRange` (no scroll) | — | — | Clears annotation selection via controller |
| `onFeatureSelect: selectFeatureById` | forward | Default scroll (`scroll !== false`) | Default `allowToggle=false` | N/A | |
| `onFeatureEdit: openFeatureEditorForFeature` | forward | Editor default | — | N/A | |

## DNA alignment map (App `dna.actions` → view model alignment `map`)

| Callback | Kind | Scroll | Toggle | Member | Restriction |
|----------|------|--------|--------|--------|-------------|
| `onSelect: selectFeatureById` | forward | Default | Default false | Controller resolves | — |
| `onRangeSelect: setRange` | forward | **`setRange` scrolls** | — | — | — |
| `onPrimerSelect: selectPrimerById` | forward | Default | — | Controller default | — |
| `onPrimerEdit: openPrimerEditorForPrimer` | forward | Editor default | — | Controller resolves | — |
| `onRestrictionSelect: selectRestrictionCutFromLabel` | forward | **Default scroll** (`scroll !== false`) | — | — | Full cut/extend behavior |
| `onExtendToBase: extendSelectionToBase` | forward | Via `setSequenceRange` / extend | — | — | — |
| `onFeatureEdit` / `openFeatureAsProtein` / editors | forward | — | — | — | — |

## DNA library map (App passes controller commands → view model library linear/circular)

| Callback | Kind | Scroll | Toggle | Member | Restriction |
|----------|------|--------|--------|--------|-------------|
| `onSelect: selectMapFeature` | controller | Primer/feature: default unless options | **`allowToggle=false`** | `libraryMapBrowseMemberId` | — |
| `onRangeSelect: selectMapRange` | controller | Omits scroll (uses `setSequenceRange`) | — | **`libraryMemberId` + `sequenceLength`** | — |
| `onPrimerSelect: selectMapPrimer` | controller | Default via omission | — | Browse member | — |
| `onFeatureEdit: editMapFeature` | controller | Editor options only | — | Browse member | — |
| `onPrimerEdit: editMapPrimer` | controller | Editor options only | — | Browse member | — |
| `onRestrictionSelect: selectRestrictionCutFromLabel` | forward | Default scroll | — | — | Same as alignment |
| Library navigator `onPrevious/onNext` → `navigatePreviousLibraryMap` / `navigateNextLibraryMap` | controller | Collapsed caret via `setSequenceRange` | — | Sets member or `null` consensus | — |

Browse member: `selectedRestrictionSites` cleared in view model when `libraryMemberBrowse` (not App lambda).

## Protein sequence (`createWorkspaceSequenceModel` → protein actions)

| Callback | Kind | Scroll | Toggle | Member |
|----------|------|--------|--------|--------|
| `onRangeSelect: setSequenceRange` | forward | No scroll | — | Options passthrough |
| `onFeatureSelect: selectProteinSequenceFeature` | controller | **`scroll: false`** | **`allowToggle: true`** | N/A |
| `onFeatureEdit: editProteinSequenceFeature` | controller | **`scroll: false`** | — | N/A |

## DNA sequence (`createWorkspaceSequenceModel` → dna actions)

| Callback | Kind | Scroll | Toggle | Member |
|----------|------|--------|--------|--------|
| `onNavigate: navigateDnaSequenceCaret` | controller | No scroll flag | — | Collapsed caret |
| `onRangeSelect: setSequenceRange` | forward | No scroll | — | Via options when provided |
| `onFeatureSelect: selectDnaSequenceFeature` | controller | **`scroll: false`** | **`allowToggle: true`** | **Omits** `libraryMemberId` when `undefined`; includes explicit `null` |
| `onFeatureEdit: editDnaSequenceFeature` | controller | **`scroll: false`** | — | Same conditional spread as feature select |
| `onPrimerSelect: selectDnaSequencePrimer` | controller | **`scroll: false`** | — | Property always passed |
| `onRestrictionSelect: selectDnaSequenceRestriction` | controller | **`scroll: false`** | — | — |

Production owners: `useWorkspaceAnnotationSelectionController` (protein/DNA feature + DNA primer sequence picks), `useFeatureEditorController` (protein/DNA sequence feature edit), and `useSelectionRangeController` (DNA caret navigation + DNA restriction sequence picks). App forwards the named exports; sequence model receives them directly.

## Map navigation controller (`useWorkspaceMapNavigationController`)

| Export | Behavior |
|--------|----------|
| `selectMapFeature(id, extend?)` | `selectFeatureById(id, extend, **false**, { libraryMemberId: browseMemberId })` |
| `selectMapRange(range)` | `setSequenceRange(range, { libraryMemberId: browseMemberId, sequenceLength: mapViewSequenceLength })` — no scroll key |
| `selectMapPrimer` | `selectPrimerById(..., { libraryMemberId: browseMemberId })` — scroll default |
| `editMapFeature` / `editMapPrimer` | Editor routes with browse member |
| `navigatePreviousLibraryMap` / `navigateNextLibraryMap` | Internal delta navigation sets collapsed `{0,0}` + member/consensus + `sequenceLength` + status; no-op when browse inactive |

## Restriction selection (`useSelectionRangeController.selectRestrictionCutFromLabel`)

| Input | Scroll | Outcome |
|-------|--------|---------|
| Default / omitted `selectionOptions` | Scrolls to `site.start` on single-cut anchor | Sticky cut anchor |
| `{ scroll: false }` | No `setSequenceScrollTarget` | Same anchor semantics |
| Extend + `cutSelectionAnchor` + different site key | **No scroll** (early return) | Fragment between cuts; circular topology may yield **`start > end`** spans |
| Extend + `selectionAnchor` (no cut pair) | `extendSelectionToEndpoint` → may scroll forward.start | Directional cut-label extend |

Map restriction selection remains a direct `selectRestrictionCutFromLabel` forward because map picks intentionally use default scrolling. A parameterized wrapper would only duplicate that existing command, while a fixed-option wrapper would encode the wrong policy for one pane, so no additional shared-navigation extraction was accepted.

Feature-structure post-segment focus and feature-annotation post-result selection remain outside this boundary because they own feature-workflow transitions rather than map/sequence option binding.
