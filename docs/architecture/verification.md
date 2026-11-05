# Tiered verification workflow

The goal is fast implementation without losing merge safety. Do not prove the whole repository after every small edit. Keep fixes individually understandable, validate related work together, and run the complete gate once before merging the batch.

## Choosing a tier

- **Tier 1 — implementation loop:** one bug or small feature change. Optimize for speed and locality.
- **Tier 2 — batch checkpoint:** normally after 5–10 coherent fixes, after 1–2 hours of implementation, before handing work to another agent, or immediately after a high-risk change.
- **Tier 3 — merge gate:** once when the batch is ready to merge into `main`.

Documentation-only work may go directly from Tier 1 to merge with link inspection and `git diff --check`; GitHub CI remains the final gate. A single urgent fix can be a batch of one, but should still follow Tier 2 and Tier 3 once rather than repeating them during implementation.

## Tier 1: implementation loop

Repeat these steps for each fix:

1. **Select one issue.** Write down the exact user route, input, expected behavior, and observed behavior.
2. **Reproduce it.** Identify the live owner, winning CSS declaration, active controller, or actual adapter path. Do not edit a similarly named but inactive path.
3. **Classify risk and scope.** Decide which feature owns the fix and which focused test or smoke can prove it.
4. **Implement narrowly.** Avoid unrelated cleanup, broad refactoring, dependency upgrades, or formatting churn.
5. **Record regression evidence.** Prefer adding the focused test beside the fix. For a trivial low-risk fix, it is acceptable to add the test later, but record the exact missing test in the batch checklist before moving on.
6. **Use the cheapest useful proof.** Run a single test file, a single test name, a typecheck for the touched module, or a short live smoke only when it materially helps the next edit. It is acceptable to defer execution of written focused tests to Tier 2.
7. **Inspect and commit.** Review the scoped diff, run `git diff --check` when useful, and commit the coherent fix. Do not merge or push to `main` during the active batch.

Line budgets are not formatting targets during Tier 1. Use the legacy-file headroom for legitimate prop wiring and local implementation. Do not compress code, remove useful whitespace, or invent wrapper abstractions to stay under a historical line count. Baseline ratcheting belongs at Tier 2 or Tier 3 and only follows a genuine reduction of at least 50 lines.

Tier 1 must not automatically run `npm test`, `npm run build`, the complete static gate, the full theme browser matrix, or startup benchmarks.

### Cheapest proof by change type

- Pure domain/application logic: one colocated Vitest file or one named test.
- React controller/component: its behavioral test; add a short live smoke only when DOM timing, focus, or pointer behavior matters.
- CSS/theme: computed style or live visual reproduction plus the smallest relevant theme contract test. For component layout, follow the [interface layout guidelines](../interface-layout.md).
- Map/sequence renderer: the focused renderer/interaction test and affected mode only—not every map/sequence configuration.
- Parser/serializer: one representative fixture during implementation; complete affected format coverage at Tier 2.
- Desktop/native: focused test or Tauri reproduction for the affected capability.
- Documentation/copy: inspect links/rendering and use `git diff --check`; no application test is required.

### Stop Tier 1 early for high-risk changes

Move immediately to Tier 2 when a change affects any of these:

- document save, import/export, recovery, handoff, or unsaved-change handling;
- sequence mutation, history, undo/redo, coordinate, topology, or normalization semantics;
- database schema/migration, folder synchronization, or destructive persistence;
- parser/serializer compatibility or exact-byte preservation;
- native window, menu, close, clipboard, or filesystem lifecycle;
- shared map/sequence rendering infrastructure used by several modes;
- global theme tokens or scientific-color registry rules;
- dependencies, TypeScript/build configuration, CI, architecture guards, or code generation.

Stopping Tier 1 means “validate the affected batch now,” not “run every repository check after every edit.”

## Tier 2: batch checkpoint

Run Tier 2 once for the accumulated batch, in this order:

1. **Freeze the batch.** Stop adding fixes and list its commits, affected features, queued tests, and required live surfaces.
2. **Complete regression coverage.** Add every test deferred during Tier 1. Remove or explain any test that cannot reliably represent the bug.
3. **Run focused tests together.** Invoke all affected test files in one Vitest command so setup and reporting happen once.
4. **Run only relevant static guards:**
   - `npm run check:architecture` when imports, layers, new files, or budgeted file sizes changed;
   - `npm run check:application-strict` when `src/application/**` or its contracts changed;
   - lint only on touched source files during correction, then `npm run check:lint-baseline` once for the batch;
   - `npm run check:theme` and `npm run check:theme-debt` only when styles, colors, theme fixtures, manifests, or registries changed.
5. **Run one live smoke per affected surface.** Combine related cases in the same browser or Tauri session instead of relaunching for every commit.
6. **Run conditional subsystem evidence once:** parser round trips, theme UI matrix, lazy-chunk inspection, map-layout diagnostics, or native smoke only when the batch requires it.
7. **Correct failures and rerun only the failed/relevant subset.** Do not restart the whole checkpoint after every correction.
8. **Review batch boundaries.** Confirm no unrelated files, unjustified baseline changes, missing regression cases, or accidental architecture changes remain. If a legacy large file genuinely shrank by at least 50 lines, update its recorded baseline now rather than after each small fix. Commit checkpoint corrections separately.

If Tier 2 exposes broad or unclear regressions, split the batch before proceeding. Otherwise the batch is ready for Tier 3.

## Tier 3: merge gate

Run Tier 3 exactly once per merge candidate:

1. **Sync with current `main`.** Rebase or merge as appropriate and resolve integration conflicts before validation.
2. **Run the complete local gate:**

```sh
npm run check:architecture
npm run check:application-strict
npm run check:lint-baseline
npm run check:theme
npm run check:theme-debt
npm test
npm run build
git diff --check
```

3. **Run accumulated conditional evidence once:**
   - `npm run test:theme-ui` for theme/cascade/responsive work;
   - representative import/export/round-trip fixtures for format work;
   - production chunk inspection for lazy-loaded tools;
   - [startup measurements](../startup-performance.md) only for startup-critical work;
   - map-layout diagnostics only for routing/label-placement work;
   - Tauri smoke for native files, windows, menus, clipboard, or close lifecycle;
   - keyboard-only/focus smoke for accessibility changes.
4. **Review the final range and status.** Ensure the tree is clean apart from known unrelated files and that architecture/file-size baselines only decreased.
5. **Merge and push once.** Push the batch to `main`, then let GitHub CI provide the final independent full gate.
6. **Handle CI failures narrowly.** Inspect the failing job, fix only the demonstrated issue, rerun its focused proof, and let CI repeat the merge gate. Do not restart unrelated manual matrices.

## Suggested instructions to give an agent

For one implementation turn:

> Work in Tier 1. Reproduce and implement the next scoped bug, add or record its focused regression case, use only the cheapest relevant proof, commit it to the current batch branch, and do not run repository-wide checks or merge to main.

For a checkpoint:

> Run Tier 2 for the current bug-fix batch. Complete queued regression tests, run the union of affected tests and only the relevant guards/smokes, correct failures, and leave a clean checkpoint report. Do not run the full merge gate or merge to main.

For release of the batch:

> Run Tier 3 once for the validated batch. Sync with main, run the complete gate plus required conditional evidence, review the final range, then merge and push to main and confirm GitHub CI.

## Evidence expected from a fix

By Tier 3, every completed bug fix should have:

1. a concise reproduction;
2. identification of the actual live owner/code path;
3. a regression test or a documented reason that only live/native evidence is reliable;
4. the narrow fix in a reviewable commit;
5. a live smoke when the failure depends on cascade, timing, native APIs, pointer behavior, or renderer geometry.

Do not broaden a bug fix into unrelated refactoring. If a bug exposes an ownership flaw, document it separately and change the boundary only as far as the fix requires.
