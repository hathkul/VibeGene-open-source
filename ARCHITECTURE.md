# VibeGene architecture

VibeGene is a React/Vite sequence editor that runs in browsers and, when available, through Tauri. This is the durable guide for feature work and bug fixes. It describes the rules that should shape new code; it is not a request for further broad refactoring.

For navigation, see [feature ownership](docs/architecture/feature-ownership.md). For specialized policies, see [theme architecture](docs/architecture/theme.md), [verification](docs/architecture/verification.md), [database architecture](docs/database-architecture.md), [workspace navigation contracts](docs/workspace-navigation-contracts.md), and [startup performance](docs/startup-performance.md).

## Architectural stance

```text
Presentation / composition hosts
              |
              v
Application workflows and ports
              |
              v
Domain rules and protocols

Infrastructure adapters (storage, desktop, workers, WASM, network)
implement ports and are wired only at composition boundaries.
```

Dependencies should point inward. Domain code knows no UI or concrete adapter. Application code coordinates a use case through neutral values and explicit ports. Presentation renders and translates user events into workflow commands. Infrastructure performs I/O.

The primary composition roots are `src/main.tsx`, `src/App.tsx`, `src/DatabaseManagerDialog.tsx`, desktop window hosts, and a small number of legacy root-level feature dialogs. They may assemble concrete adapters. Do not imitate their direct-I/O imports in new presentation code.

## Layer contracts

### Domain: `src/domain/`

Owns deterministic biology, parsing, geometry, normalization, selection rules, and serializable worker protocols.

- May depend on domain modules, static data, and standard language APIs.
- Must not import React, application/presentation modules, storage, desktop, workers, concrete WASM runtimes, Dexie, or Tauri.
- Browser capabilities, clocks, randomness, files, network access, and worker construction enter through arguments or ports when needed.

### Application: `src/application/`

Owns deterministic plans and multi-step use cases that coordinate domain rules with ports.

- May depend on domain and neutral application contracts.
- Must not import React rendering, `src/presentation/`, or concrete storage, desktop, worker, or WASM adapters.
- `src/application/ports/` contains contracts shared by presentation and adapters.
- A folder named `presentation` inside a feature's application folder contains neutral projection models only; it is still application code and must remain React-free.

### Protected presentation: `src/presentation/` and `src/ui/`

Owns React rendering, focused controllers/hooks, view models, and reusable UI primitives.

- May depend on domain rules/types, application workflows/ports, and other presentation/UI modules.
- Must not import storage, desktop, workers, concrete WASM, Dexie, or Tauri directly.
- Receive I/O and host capabilities through narrow props or ports.
- `src/ui/` is for small cross-feature primitives, not workflow coordination.

The architecture checker enforces these protected presentation rules for static, type-only, dynamic, and test-mock imports. A future `src/databaseManagerDialog/` folder is deliberately classified as protected presentation too.

### Infrastructure

- `src/storage/` owns IndexedDB schemas, queries, persistence, and repositories. It may use domain code and neutral application ports or pure application helpers, but not React/UI, desktop/Tauri, or worker implementations.
- `src/desktop/` owns Tauri capability checks, native files, windows, menus, clipboard, and desktop lifecycle adapters. It may assemble storage and application workflows but should not own feature rendering, except dedicated desktop composition hosts.
- `src/workers/` contains execution entry points around explicit serializable domain protocols. Computation belongs in domain modules.
- `src/wasm/` implements domain-facing protocols. Domain code must not import the concrete runtime.
- `src/data/`, `src/assets/`, `src/theme/`, and `src/styles/` are resources, not workflow coordinators.

### Legacy composition hosts

Some root-level dialogs and older modules under `src/components/` still import desktop or storage adapters directly. They are existing composition seams, not examples for new code and not currently covered by the protected-presentation import rule. When a feature or bug genuinely requires changing one, prefer passing the affected capability through a narrow port if that improves the change safely. Do not start unrelated extraction work merely to satisfy an idealized layer diagram.

`src/App.tsx` is now a frozen composition root. Ordinary adapter wiring and cross-feature assembly may remain there. New workflow policy, deterministic transitions, and feature rendering should go to an existing feature boundary. Do not create wrapper-only hooks, universal command bags, or props bags solely to reduce its line count.

## Canonical primitives and invariants

`SequenceRecord` in `src/domain/types.ts` is the canonical editable construct. Its identity, molecule, topology, sequence, annotations, primers, operations, history, and timestamps travel together. Screens may derive narrow view models; they must not create a competing editable-record shape.

- Sequence coordinates are zero-based and normally half-open: `start` inclusive, `end` exclusive. Use established circular/topology helpers rather than locally reinterpreting ranges.
- `molecule` (`dna`, `rna`, or `protein`) and `topology` are domain facts. Normalize records at import, persistence, and mutation boundaries.
- `src/domain/fileFormats.ts` is the format registry. File parsing, serialization, filters, extensions, and capability checks must not maintain competing format lists.
- `src/domain/parsers.ts` is the compatibility façade for parser dispatch. Implementations remain behind that public surface.
- `src/domain/primerSequenceLayout.ts` is the compatibility façade for primer-layout behavior. Binding analysis/policy, frame projection, and SVG paths remain behind it.
- A stored project includes more than a `SequenceRecord`: summary, normalized body, optional exact bytes, filename/format, and sync baseline are persistence facts. Timestamps alone are not authoritative change evidence.
- Worker messages must be serializable and version changes deliberate.

## Where new code belongs

Use this decision order:

1. Is it deterministic biology, parsing, geometry, normalization, or a state transition? Put it in a focused domain module.
2. Does it coordinate a user-visible use case or decide how domain work and I/O interact? Put the plan/workflow in `src/application/<feature>/` with explicit ports.
3. Is it React orchestration for one feature? Put it in that feature's presentation hook/controller.
4. Is it reusable rendering? Put feature rendering under `src/presentation/<feature>/`; use `src/ui/` only for genuinely cross-feature primitives.
5. Is it IndexedDB, native desktop, worker construction, WASM loading, or network I/O? Put it in the matching infrastructure adapter and inject it.
6. Is it only concrete assembly? Keep it at a documented composition root.

Before adding a helper, ask whether it can run in a unit test without React, IndexedDB, Tauri, files, or a browser. If yes, it usually belongs in domain or a pure application planner.

Prefer existing feature boundaries over new top-level folders. A new abstraction must own a coherent decision, transition, or capability—not merely rename or move lines.

## Feature and bug-fix workflow

### Feature work

1. Find the owner in [feature ownership](docs/architecture/feature-ownership.md) and inspect its existing tests and ports.
2. Define deterministic behavior at the lowest practical layer.
3. Keep I/O behind explicit ports and assemble implementations at a composition root.
4. Add observable behavioral tests. Preserve keyboard, focus, accessibility, persistence, and document-history semantics.
5. Avoid opportunistic refactoring outside the feature unless the change cannot be expressed safely through the current boundary.

### Bug fixes

1. Reproduce the failure and identify the winning code path—not merely the most similarly named component or CSS selector.
2. Add a regression test at the lowest layer that can prove the user-visible failure and correction.
3. Make the narrowest behavior-preserving fix. Do not combine it with unrelated architecture cleanup.
4. For cascade, native-window, timing, pointer, or renderer bugs, verify the live owner in the relevant browser/Tauri surface in addition to unit tests.
5. Record an architectural change only when the bug demonstrates that ownership itself is wrong.

## Composition-root contract

`App.tsx` may:

- hold top-level workspace state and refs;
- assemble storage, desktop, clipboard, file, parser, and window adapters;
- connect focused controllers and rendering hosts;
- translate results into cross-feature status, recent-file, clean-state, and document-history updates.

`App.tsx` should not gain:

- new deterministic domain calculations;
- feature-specific persistence policy;
- large JSX feature regions;
- same-signature command trampolines;
- render-time ref mutation or refs hidden inside view-model builders;
- generic command/props bags that obscure ownership.

The deliberate broad extraction phase is closed. `App.tsx` has a legacy-size baseline plus limited growth headroom; this is a guard against substantial responsibility growth, not a target for another reduction campaign. Update its baseline only when ordinary feature work produces a genuine ownership seam and reduces the file by at least 50 lines.

Large map and sequence renderers are algorithmic/render-engine exceptions, guarded by legacy baselines with modest growth headroom. Keep tightly coupled SVG, virtualization, cache, worker, and interaction lifecycles together unless a change reveals an independently testable boundary. Oversized feature dialogs may remain feature-level composition roots; size alone is not a reason to split a singular workflow.

## Enforced guardrails

`npm run check:architecture` enforces the protected dependency edges, test-support isolation, a 1,000-line maximum for new/unbudgeted source files, deliberate caps for thin façades, and bounded headroom for known legacy large files. The permitted legacy ceiling is the recorded baseline plus 5% or 100 lines (whichever is larger), rounded up to a 50-line boundary.

The headroom permits normal prop threading, adapter wiring, comments, and readable formatting; it is not an allocation to fill. Never compress signatures, delete useful whitespace, create wrapper modules, or move code to an inferior owner solely to pass a line budget. If a legitimate change exceeds the ceiling, either record an explicit reviewed baseline decision or extract a genuine independently owned seam. At a Tier 2 or Tier 3 checkpoint, lower a legacy baseline only after the file has genuinely shrunk by at least 50 lines; do not churn the baseline for incidental one-line changes.

Global TypeScript `strict` mode is enabled. `npm run check:application-strict` remains a focused application-layer check.

The ESLint baseline is empty and must remain empty. Do not run `update:lint-baseline` as part of ordinary work; increasing it requires an explicit, reviewed architecture decision.

Ordinary UI colors must use semantic theme roles. Raw scientific/data colors require exact scoped registry ownership. See [theme architecture](docs/architecture/theme.md).

Architecture rules are not bypassed by type-only imports, dynamic imports, re-export indirection, or test mocks.

## Verification

Verification is tiered so unrelated repository-wide checks are not repeated after every small fix. The ordered workflow and command-selection matrix are in [verification](docs/architecture/verification.md).

- **Tier 1 — implementation loop:** reproduce, make one narrow change, record or add its regression case, and use only the cheapest focused proof needed for that fix. A trivial low-risk fix may be committed without executing tests immediately when its test is explicitly queued for the batch checkpoint.
- **Tier 2 — batch checkpoint:** after roughly 5–10 coherent fixes, complete any queued regression tests and run the union of affected tests, relevant static checks, and one live smoke per changed surface. Do not run unrelated gates.
- **Tier 3 — merge gate:** once per batch, run the complete CI-equivalent gate and any conditional browser/Tauri/parser/performance evidence required by the accumulated changes, then merge to `main` and confirm CI. Incoming private batches require a privacy-reviewed export under the [public promotion policy](docs/architecture/public-promotion.md), never private history. New releases are tagged and built from validated source in `hathkul/vibegene-open-source`.

Do not run the full suite, production build, browser matrix, or every static guard after each minor edit. High-risk persistence, history, parser, database-migration, native-lifecycle, shared-renderer, dependency, or build-configuration changes end the fast loop and receive an immediate Tier 2 checkpoint; they still need only one Tier 3 gate before merge. Full CI remains the merge authority.

## Review checklist

- Is the behavior owned by the lowest appropriate layer?
- Does every dependency point inward, with concrete I/O visible at a composition boundary?
- Are coordinates, topology, molecule type, history, and record normalization preserved?
- Does file behavior use the central format registry?
- Is the regression covered behaviorally rather than only structurally?
- Did the change preserve focus, keyboard, pointer, accessibility, persistence, and native/browser differences where relevant?
- Did any legacy large file shrink by at least 50 lines, and if so was its recorded baseline ratcheted at the batch checkpoint?
- Did the change avoid increasing `App.tsx` responsibility or introducing a hollow abstraction?
