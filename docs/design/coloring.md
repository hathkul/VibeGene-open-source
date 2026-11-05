# Vibegene color-scheme implementation guide

This document is the color contract for new Vibegene UI. Follow it when adding
components, dialogs, menus, tables, map controls, or SVG artwork. The goal is
not merely to make Dark mode usable: every new element must belong visibly to
Beige, Bright, and Dark from its first implementation.

## Non-negotiable rules

1. Use semantic CSS variables. Do not copy palette hex values into feature CSS.
2. Implement all component states together: normal, hover, focus, selected,
   active, disabled, invalid, and loading where applicable.
3. Test all three explicit schemes. A Dark-only override is not a complete
   theme implementation.
4. Theme the whole component boundary. Include headings, body, footer, nested
   menus, native fields, table headers and rows, badges, icons, and empty text.
5. Keep biological or data-encoded colors, but put their surrounding UI and
   neutral ink on theme variables. Mix semantic colors with theme variables
   when they are used as UI surfaces.
6. Do not use `prefers-color-scheme` for application theming. The user's
   explicit Vibegene setting must win.

## Theme source of truth

The palette is defined in `src/index.css` on the root element:

```css
:root { /* Beige defaults */ }
:root[data-color-scheme='beige'] { color-scheme: light; }
:root[data-color-scheme='bright'] { color-scheme: light; /* overrides */ }
:root[data-color-scheme='dark'] { color-scheme: dark; /* overrides */ }
```

The application sets `data-color-scheme` to `beige`, `bright`, or `dark`.
Native controls use the corresponding `color-scheme` value. Do not add another
theme class, local theme enum, or duplicated palette.

New components should use variables directly. Use a late
`:root[data-color-scheme] .component` override only when adapting older CSS
whose fixed colors or selector specificity cannot yet be removed.

## What the three schemes mean

- **Beige (`beige`)**: warm paper, cream tables, traditional gray desktop
  chrome, and the strongest green table headings.
- **Bright (`bright`)**: clean white paper, cool blue-gray chrome and borders,
  subtle table contrast, and no accidental beige carry-over.
- **Dark (`dark`)**: navy-charcoal surfaces with bright neutral ink. It is not
  a dimmed Beige scheme; fields, rows, menus, icons, SVG labels, and hover
  states must all use the dark palette.

Do not make Beige and Bright identical. In particular, use the appropriate
workspace, panel, table, and divider tokens instead of literal white.

## Canonical tokens

The variables below already contain values for every scheme.

### Text and focus

- `--text`: normal body text and labels.
- `--text-h`: titles, headings, strong values, and high-emphasis icon ink.
- `--muted`: descriptions, metadata, hints, timestamps, and secondary counts.
- `--accent`: general accent for newer non-desktop UI.
- `--app-focus`: focus rings, focused borders, and hover borders.
- `--app-selection-text`: text and icon ink on selected surfaces.

### Application surfaces

- `--bg`: outer page/window background.
- `--app-workspace`: main scientific workspace and large scrolling canvases.
- `--app-sidebar`: persistent left or right sidebars.
- `--app-panel`: dialogs, cards, popovers, and primary panel paper.
- `--app-panel-muted`: toolbars, headers, footers, and recessed panel bands.
- `--app-field`: inputs, list boxes, editable areas, and inset papers.
- `--app-divider`: separators between sections.
- `--app-overlay`: modal backdrop.
- `--app-dialog-shadow`: dialog and floating-control shadow color.

The shorter `--surface`, `--field`, `--button`, `--border`,
`--border-strong`, and `--shadow` tokens also appear throughout existing UI.
For new desktop/scientific components, prefer the more specific `--app-*`
tokens so the surface or control role is explicit.

### Window chrome

- `--app-chrome`, `--app-chrome-end`: toolbar/title-strip gradient endpoints.
- `--app-chrome-border`: toolbar and window-chrome borders.

### Buttons

- `--app-button-top`, `--app-button-bottom`: normal button gradient.
- `--app-button-hover-bottom`: hover gradient endpoint.
- `--app-button-border`: normal control border.
- `--app-button-text`: normal button text and pictogram color.

### Tables and lists

- `--app-table`: normal row surface.
- `--app-table-alt`: alternate or gently emphasized row surface.
- `--app-table-head`: table and grouped-list header surface.
- `--app-table-head-border`: table-header border.
- `--app-table-border`: cell and row border.
- `--app-table-hover`: hover surface for rows, options, and menu items.

### Selection

- `--app-selection`: selected row/control surface.
- `--app-selection-hover`: selected item on hover.
- `--app-selection-text`: selected text and icon ink.

Never put normal `--text` on `--app-selection` without checking contrast. The
selection tokens are designed as a pair.

## Durable primitives for new and migrated UI

`src/index.css` exposes `--vg-*` semantic tokens as the stable public theme
contract. They are aliases for the active scheme's palette, so components do
not need their own Beige/Bright/Dark selector. Use these names in new feature
CSS instead of reaching directly for a palette hex or an unrelated legacy
token:

- Surfaces: `--vg-surface-canvas`, `--vg-surface-sidebar`,
  `--vg-surface-panel`, `--vg-surface-panel-muted`,
  `--vg-surface-raised`, and `--vg-surface-inset`.
- Text and borders: `--vg-text`, `--vg-text-strong`, `--vg-text-muted`,
  `--vg-border`, and `--vg-border-strong`.
- Controls and interaction: `--vg-control-surface`,
  `--vg-control-surface-hover`, `--vg-control-border`, `--vg-control-ink`,
  `--vg-interactive-hover`, `--vg-interactive-selected`,
  `--vg-interactive-selected-hover`, `--vg-interactive-selected-ink`, and
  `--vg-focus`.
- Chips and semantic notices: `--vg-chip-*`, `--vg-warning-*`,
  `--vg-danger-*`, and `--vg-success-*`.
- Schematics: `--vg-diagram-surface`, `--vg-diagram-inset`,
  `--vg-diagram-ink`, `--vg-diagram-muted`, `--vg-diagram-line`, and the
  `--vg-map-*` SVG/map tokens.
- Compact data diagrams: `--vg-data-track`, `--vg-data-mark`, and
  `--vg-data-mark-selected` for neutral tracks, ticks, and the active mark.
- Annotation labels: use transparent `--vg-annotation-label-surface` for
  normal labels; use the separate `--vg-annotation-label-selected-*` pair only
  for a selected label. This prevents the unwanted dark-mode label boxes.

`src/styles/theme-primitives.css` provides opt-in primitives. They do not
style bare HTML tags or legacy classes:

```tsx
<section className="vg-card">
  <button className="vg-button" data-vg-state={selected ? 'selected' : undefined}>
    Choose fragment
  </button>
</section>

<button className="vg-selectable-row" aria-selected={selected}>…</button>
<span className="vg-chip" data-vg-tone="warning">Incomplete digest</span>
<svg><text className="vg-svg-ink">…</text></svg>
```

Available primitives are `vg-panel`, `vg-card`, `vg-dialog`, `vg-button`,
`vg-field`, `vg-selectable-row`, `vg-chip`, `vg-notice--warning`,
`vg-notice--danger`, `vg-notice--success`, `vg-diagram`, and the `vg-svg-*`
and `vg-annotation-label` classes. Equivalent `data-vg-*` attributes are
available when a component cannot accept a class name.

### Migration rule

Migrate one visual boundary at a time: add an opt-in primitive or semantic
token to the component, then remove its literal neutral colors and test every
state in all three schemes. Do not add broad selectors such as `.dialog *`,
global `button`, or generic SVG rules to make a legacy screen appear themed.
Those rules hide ownership and reintroduce the regressions this contract is
meant to prevent. Domain/biological colors remain local data colors; only
their neutral UI surround should move to `--vg-*` tokens.

## Component recipes

These are defaults, not a reason to create duplicate global classes. Apply the
same token relationships in the component's existing selectors.

### Dialog, card, or popover

```css
:root[data-color-scheme] .example-dialog {
  border-color: var(--app-button-border);
  color: var(--text);
  background: var(--app-panel);
  box-shadow: 0 18px 40px var(--app-dialog-shadow);
}

:root[data-color-scheme] .example-dialog :is(h1, h2, h3, h4) {
  color: var(--text-h);
}

:root[data-color-scheme] .example-dialog .description {
  color: var(--muted);
}

:root[data-color-scheme] .example-dialog :is(.header, .footer) {
  border-color: var(--app-divider);
  background: var(--app-panel-muted);
}
```

If a dialog opens a nested picker or dropdown, theme that nested surface too.
Do not assume it inherits the dialog background when it is portalled elsewhere.

### Normal, hover, primary, and disabled buttons

```css
:root[data-color-scheme] .example button {
  border-color: var(--app-button-border);
  color: var(--app-button-text);
  background: linear-gradient(var(--app-button-top), var(--app-button-bottom));
}

:root[data-color-scheme] .example button:hover:not(:disabled) {
  border-color: var(--app-focus);
  color: var(--app-button-text);
  background: linear-gradient(
    var(--app-button-top),
    var(--app-button-hover-bottom)
  );
}

:root[data-color-scheme] .example button:is(.primary, .is-primary, .is-active) {
  border-color: var(--app-focus);
  color: var(--app-selection-text);
  background: var(--app-selection);
}

:root[data-color-scheme] .example button:is(.primary, .is-primary, .is-active):hover:not(:disabled) {
  background: var(--app-selection-hover);
}

:root[data-color-scheme] .example button:disabled {
  opacity: 0.45;
  cursor: default;
}

:root[data-color-scheme] .example button:focus-visible {
  outline: 2px solid var(--app-focus);
  outline-offset: 2px;
}
```

Do not use white or transparent hover fills. They caused white-on-white controls
in Bright and glowing light rectangles in Dark. Icon-only buttons follow the
same border, text, and background rules. Always write hover rules with
`:not(:disabled)`. When an older high-specificity hover selector cannot be
removed, add an explicit `button:disabled:hover` rule that restores the normal
disabled surface and border.

### Bulk visibility and segmented view controls

“Check all”, “Uncheck all”, visibility menus, and similar bulk actions are
normal controls. They must use `--vg-control-*` in their resting and hover
states even when they are compact, icon-only, or placed inside a table header.
Do not use literal white/black or inherit a scientific table-header color.

Numbers/Lines, Map/Sequence, and other mutually exclusive view selectors are
segmented controls. Unselected segments use a neutral inset/control surface;
the selected segment uses the `--vg-interactive-selected*` token pair. A
selection color must communicate state, not the biological meaning of the
content being displayed.

Tiny density and position diagrams are visualization ink rather than buttons:
paint their background with `--vg-data-track`, ordinary ticks with
`--vg-data-mark`, and the selected tick with `--vg-data-mark-selected`. Never
use a fixed white track with black hairlines, because that produces glare in
Dark and insufficient separation in Bright.

### Inputs, textareas, selects, and options

```css
:root[data-color-scheme] .example :is(input:not([type='color']), textarea, select) {
  border-color: var(--app-button-border);
  color: var(--text);
  background-color: var(--app-field);
}

:root[data-color-scheme] .example :is(input, textarea, select):focus-visible {
  border-color: var(--app-focus);
  outline: 2px solid var(--app-focus);
  outline-offset: 2px;
}

:root[data-color-scheme] .example select option {
  color: var(--text);
  background: var(--app-field);
}

:root[data-color-scheme] .example :is(input, textarea)::placeholder {
  color: var(--muted);
}
```

Include placeholders, units, validation messages, number steppers, checkboxes,
and radio controls in visual QA. Native opened dropdown lists are especially
important in Dark.

### Tables and selectable lists

```css
:root[data-color-scheme] .example-table {
  color: var(--text);
  background: var(--app-table);
}

:root[data-color-scheme] .example-table :is(th, td) {
  border-color: var(--app-table-border);
}

:root[data-color-scheme] .example-table th {
  color: var(--text-h);
  background: var(--app-table-head);
}

:root[data-color-scheme] .example-table tbody tr:hover td {
  background: var(--app-table-hover);
}

:root[data-color-scheme] .example-table tbody tr.is-selected td {
  color: var(--app-selection-text);
  background: var(--app-selection);
}

:root[data-color-scheme] .example-table tbody tr.is-selected:hover td {
  background: var(--app-selection-hover);
}
```

Apply the row surface to the cells when sticky columns or cell-specific legacy
backgrounds can cover the row background.

### Toolbars, tab strips, and pane selectors

Window-level title bars, the primary application toolbar, and the standalone
Database header use
`linear-gradient(var(--app-chrome), var(--app-chrome-end))` with
`--app-chrome-border`. In-pane toolbars, dialog headers/footers, and recessed
strips use `--app-panel-muted` with `--app-divider`.

Inactive tabs use `--text` on a transparent or muted surface. The active tab
uses `--text-h` or `--app-selection-text`, a clear `--app-focus` edge, and
either `--app-panel` or `--app-selection` depending on the interaction.

Theme controls at both ends of the strip. Previous/next arrows, overflow
buttons, dropdown triggers, status text, and bottom pane selectors are part of
the component even if they live in separate DOM groups.

### Menus and dropdowns

```css
:root[data-color-scheme] .example-menu {
  border-color: var(--app-button-border);
  color: var(--text);
  background: var(--app-panel);
  box-shadow: var(--shadow);
}

:root[data-color-scheme] .example-menu > button {
  color: var(--text);
  background: transparent;
}

:root[data-color-scheme] .example-menu > button:hover:not(:disabled) {
  color: var(--text-h);
  background: var(--app-table-hover);
}
```

Check submenu panels and menus mounted outside the component subtree.

### Badges and semantic colors

Neutral badges can use `--app-table-head`/`--app-table-head-border` or
`--app-selection`/`--app-selection-text`. For a domain color that must remain
recognizable, keep one accent and mix it into themed surfaces:

```css
:root[data-color-scheme] .example-badge {
  --badge-accent: #1d6fb8; /* domain meaning, not neutral UI chrome */
  border-color: color-mix(
    in srgb,
    var(--badge-accent) 44%,
    var(--app-divider)
  );
  color: color-mix(in srgb, var(--badge-accent) 55%, var(--text-h));
  background: color-mix(
    in srgb,
    var(--badge-accent) 11%,
    var(--app-panel)
  );
}
```

Theme every line inside a badge. A bright label with a black count underneath
is still a broken Dark-mode badge.

### Destructive, warning, and success states

There is no general license to introduce a full fixed light surface. Mix the
semantic hue into the current panel and divider:

```css
:root[data-color-scheme] .example-error {
  border-color: color-mix(in srgb, #e06a72 64%, var(--app-divider));
  color: var(--text);
  background: color-mix(in srgb, #e06a72 15%, var(--app-panel));
}
```

The semantic hue may be literal; the neutral half of the mixture must be a
theme token. Verify the result in all schemes.

## Maps, sequence panes, SVG, and canvas artwork

Map and sequence workspaces have local tokens because their neutral ink must
track their canvas rather than a dialog surface:

- `--map-surface`: map/sequence canvas.
- `--map-ink`: main bases, labels, ruler text, and backbone ink.
- `--map-muted`: secondary map labels.
- `--map-line`: subdued ruler, connector, and guide lines.
- `--map-callout`: callout and label backing surface.
- `--sidebar-surface`: map/sequence sidebar surface.

Bright and Dark define these local tokens in the shared `.map-tab` and
`.sequence-tab` rules in `src/App.css`. Beige and specialized embedded maps
may instead rely on inherited styles or component-local values. Descendants
must therefore consume local map tokens with safe app-token fallbacks:

```css
.new-map-control {
  color: var(--map-ink, var(--text));
  background: var(--map-callout, var(--app-panel));
  border-color: var(--map-line, var(--app-divider));
}
```

For SVG, set the property SVG actually reads:

```css
:root[data-color-scheme] .new-map-label { fill: var(--map-ink); }
:root[data-color-scheme] .new-map-line { stroke: var(--map-line); }
```

Setting only CSS `color` does not recolor a literal SVG `fill` or `stroke`.
Inspect text halos (`paint-order` strokes), marker arrows, rulers, ticks,
translation letters, selection outlines, and minimap artwork separately.

For `<canvas>`, CSS variables do not automatically change pixels already
drawn. Resolve the active token values when drawing and redraw when the scheme
changes. Avoid encoding neutral UI ink as a fixed color in rendering code.

Feature colors, primer colors, enzyme colors, gel bands, chromatogram channels,
and other scientific encodings may remain fixed when the color itself carries
meaning. Their labels, frames, backgrounds, and uncolored fallbacks must still
adapt. In Dark, choose light neutral outlines around colored bodies; in Bright
and Beige, avoid background masks whose shade visibly differs from the
surrounding viewport unless the mask communicates a state.

## Icons and pictograms

- Prefer `currentColor` in SVG icons.
- Set the control's `color` to `--app-button-text`, `--text`, or `--text-h`.
- Theme both `fill` and `stroke` when importing an icon with fixed attributes.
- Do not use `filter: invert(...)` as the primary theme mechanism.
- Check black pictograms explicitly in Dark, including sidebar and diagram
  controls that are not ordinary buttons.

## Overlays and window-level behavior

Use `--app-overlay` for modal backdrops. A dialog should use `--app-panel`, not
the dimmed color sampled from the backdrop.

The color-scheme switch belongs to top-level main windows and the standalone
Database window. Child file-creation windows and modal dialogs inherit the
chosen scheme and must not add another switch. When a modal is open, window
chrome controls behind the backdrop should be visually dimmed and inactive.

## When scheme-specific selectors are appropriate

Prefer one tokenized rule for all schemes. Use a selector such as
`:root[data-color-scheme='dark']` only when the same semantic token cannot
describe the rendering, for example:

- SVG text needs a light halo only on the dark canvas.
- A scientific color requires a different contrast correction in Dark.
- A large Bright selection surface needs a rail instead of a saturated fill.
- Browser/native rendering requires a scheme-specific workaround.

If adding a scheme-specific rule, first add the shared rule, explain the visual
reason in a short comment, and check the other two schemes for regressions.

## Forbidden patterns in new UI

- Fixed `#fff`, `#000`, gray, beige, or navy for neutral UI surfaces or text.
- A component that only has a Dark override.
- `background: transparent` on hover when neighboring controls use a visible
  hover state.
- Styling a dialog body without its header, footer, dropdowns, and inputs.
- Styling an SVG container's `color` while leaving literal child fills/strokes.
- White text on `--app-selection` without using `--app-selection-text`.
- Using opacity alone to make normal text fit Dark mode.
- Reusing a viewport mask from Beige in Bright when it creates visible beige
  rectangles around feature, primer, or sgRNA labels.
- Adding a local scheme toggle to a modal or child file window.

## Required implementation workflow

1. Identify the component boundary and list its nested surfaces and states.
2. Choose tokens by semantic purpose, not by their current hex value.
3. Implement normal, hover, focus, selected/active, and disabled states in the
   same change.
4. Search the component for remaining literal `color`, `background`, `fill`,
   `stroke`, `border-color`, and gradient declarations.
5. Open the real UI or a temporary fixture in Beige, Bright, and Dark.
6. Exercise dropdowns, hover, selection, disabled controls, and nested dialogs.
7. Check both Map and Sequence variants if the component appears in both.
8. Run `npm run check:theme`. New neutral UI literals must be replaced with
   tokens or explicitly annotated when they are reviewed scientific colors.
9. Run `npm run build`.
10. Remove temporary fixtures before committing.

## Enforcement and visual audit

`npm run check:theme` scans theme-sensitive CSS and TSX properties. The
checked-in baseline records existing legacy debt, so the command fails only
when a change introduces an unreviewed literal. Do not refresh the baseline to
make a failure disappear: either use a semantic token or add a nearby
`theme-color-ignore` comment explaining why the literal encodes scientific
data rather than interface chrome.

During development, open `/theme-gallery.html` from the Vite server. It shows
the shared primitives and their normal, hover, selected, disabled, modal, SVG,
and schematic states in all three schemes. New primitives or state contracts
must be represented there before they are adopted broadly.

## Review checklist

- [ ] Beige remains warm; Bright is visibly white/cool; Dark is fully dark.
- [ ] Body text, headings, metadata, and placeholders remain readable.
- [ ] Normal and selected controls have distinct hover states.
- [ ] Disabled controls remain recognizable without looking active.
- [ ] Inputs and opened dropdown options match the dialog.
- [ ] Table headers, cells, sticky columns, and selected rows are all themed.
- [ ] Headers, footers, bottom strips, and resize gutters are themed.
- [ ] Nested popups and portalled menus are themed.
- [ ] Icons and SVG text/lines are visible in Dark.
- [ ] Selection text contrasts with the selection surface.
- [ ] Map/sequence masks match the viewport where no distinct surface is meant.
- [ ] No new top-level switch appears in a child window or modal.
- [ ] The production build passes and temporary QA files are gone.

When in doubt, compare with the late `:root[data-color-scheme]` theme sections
in `src/App.css`, but use the semantic relationships documented here rather
than copying a selector-specific workaround into a new component.
