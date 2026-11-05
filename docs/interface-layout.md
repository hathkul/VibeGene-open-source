# Interface layout guidelines

Use this guide when adding or changing a dialog, form, list, or other interface in VibeGene. New components share the existing application styles and must be checked in that environment, including with realistic document data.

## Why layouts have broken

The Sanger allele dialog placed each checkbox in a flex label, assuming it would retain its intrinsic width. `src/App.css` applies `width: 100%` to all `input`, `select`, and `textarea` elements. The checkboxes therefore consumed the labels' available width and pushed guide names outside the dialog. A shared `.translation-dialog select` rule also made each group selector fill its row, so selectors overlapped trace names. Long trace lists exposed scrolling and footer issues as well.

A component can look correct when its CSS is read in isolation, yet fail when shared rules, mobile overrides, content length, and the actual cascade are applied. DOM-only tests do not calculate layout and cannot establish that controls are visible or do not overlap.

The same dialog later gained a second pane when a group was named. Its intended 1100 px width lost to the shared `.translation-dialog` rule, leaving a 560 px dialog split into two columns; the group-name input then left almost no space for trace names. A viewport-only breakpoint did not help because the viewport was wider than the dialog. This was missed because the changed, populated state was not visually checked with the production cascade.

## Implementing an interface

1. **Inspect the inherited styles.** Identify the shared dialog, form, and control classes and the global element rules they inherit. Check mobile and hybrid-window overrides and the order and specificity of the rules. Use the browser's computed styles to identify the winning declarations if behavior is unexpected.
2. **Give controls explicit layout behavior.** Scope component overrides narrowly. For example, a checkbox inside a flex row typically needs `width: auto` and `flex: 0 0 auto`; a compact select may need an explicit width and its inherited margins reset. Do not change global input styles to fix a single component.
3. **Allow content to shrink and wrap.** Use `min-width: 0` for flex or grid children that must shrink, and `minmax(0, 1fr)` for flexible grid columns. Allocate separate space for labels and controls, and allow long names to wrap or truncate with an accessible way to read the full name. Avoid fixed dimensions that assume short sample names or a fixed number of rows.
4. **Keep the dialog usable at constrained sizes.** Bound it to the viewport, make its content scroll when necessary, and ensure primary actions and close/cancel remain reachable. Check shared responsive rules for `overflow: hidden` or different sizing; a local `overflow-y: auto` declaration may otherwise be overridden. If actions are sticky, give them an opaque themed background and ensure they do not conceal inaccessible content.
5. **Use existing semantic theme roles.** Follow [theme architecture](architecture/theme.md) for backgrounds, borders, text, and interaction states. Layout and readability must work in all supported themes.
6. **Size dynamic panes against their actual container.** When a selection adds a panel, verify the computed dialog width and the space available to every nested row. Give the dialog's width rule sufficient specificity to beat shared styles, and stack panes when the *container* is too narrow, including in resized native windows. Do not rely on viewport breakpoints or equal fractions alone to keep a label readable beside an input.

## Verify in a real browser or the relevant native surface

Render the actual component with production styles loaded in application order. Exercise the user path with representative data, including a long list, long names, disabled and enabled controls, and results or errors that expand the content. Explicitly trigger selections that add or remove panes and check each state; a screenshot of the empty dialog does not validate the populated layout. Check a desktop viewport, a constrained dialog inside a wide viewport, and a narrow viewport; also test the hybrid/native window when its styles or behavior differ.

Confirm that:

- labels, checkboxes, selects, and buttons are visible, readable, and do not overlap or extend outside the dialog;
- the dialog does not acquire unintended horizontal scrolling, and long content can be reached by vertical scrolling;
- the first and last entries and all actions can be reached and operated, including by keyboard;
- content remains usable when text wraps or browser zoom/text size increases;
- colors and contrast remain legible in supported themes.

Inspect the live view or screenshots and, where useful, element bounding boxes, scroll dimensions, and computed styles. A passing React/jsdom test, typecheck, or theme-token check alone is not visual verification. Add a focused browser regression test when the layout failure can be reproduced reliably; otherwise record the manual or native smoke and its coverage in the change report. Follow the appropriate tier in [verification](architecture/verification.md) rather than automatically running the entire browser matrix for every edit.
