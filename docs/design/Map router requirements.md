# Map Router Requirements

This document defines the intended behavior for map label routing. Circular and linear maps have different layout contracts and must not borrow behavior from each other unless explicitly stated here.

## Global Requirements

- Enzyme labels and primer labels are routed as callouts, not drawn as independent floating text.
- Primer leaders must point to the exact template coordinate where the primer 3' nucleotide anneals.
- Router changes for one map mode must not change the other map mode unless the change is deliberately part of both contracts.
- A layout must not be considered valid if labels were silently dropped by the strict router. Placement failure is a routing failure.

## Circular Map

### Purpose

Circular mode is optimized for a compact plasmid-style overview. It should first try a clean standard circular layout, shrinking the ring as needed. Dense labels should fall back to packed mode rather than expanding the standard map or relying on scroll.

### Standard Circular Mode

Standard circular mode must:

- Route enzymes, primers, and eligible external feature callouts together in one circular router pass.
- Treat primers as normal callout labels for collision purposes.
- Avoid label-label overlaps.
- Avoid leader-label intersections.
- Avoid bad leader crossings.
- Keep all routed callouts inside the actual visible circular map viewport.
- Shrink the map ring when labels do not fit.
- Stay at 1:1 SVG pixels; no CSS or SVG scale-to-fit tricks.
- Render without scroll.

Standard circular mode must not:

- Route primers separately from enzymes.
- Let primers overlap enzymes.
- Let primers overlap other primers.
- Drop labels and still call the radius feasible.
- Use linear-mode unlimited-row behavior.
- Grow the standard circular canvas and rely on scroll.
- Use scroll as a substitute for shrinking the ring.
- Scale the SVG to make oversized content appear to fit.
- Decide standard mode is valid because labels fit inside an artificially larger square while falling outside the visible map area.
- Make primer density produce a giant standard circle with labels offscreen.

### Circular Radius Search

The circular router must:

1. Start from the available radius for the current viewport.
2. Route the combined circular callouts.
3. Reject the radius if strict placement fails or any strict layout violation exists.
4. Shrink the ring and retry until all routed callouts fit.
5. If the minimum allowed radius is reached and the layout still cannot fit, switch to packed fallback.

Important feasibility rule:

- A radius is feasible only when every expected routed callout is placed and the resulting layout has no strict violations. Checking only the callouts that happened to be placed is not enough.

### Packed Fallback Mode

Packed fallback mode must:

- Be used for dense circular labels that cannot be routed cleanly at the minimum radius.
- Route primers and enzymes together.
- Allow scroll if the packed content is larger than the visible area.
- Be treated as an intended dense-label mode, not as an error.

Packed fallback mode may:

- Display a layout that is larger than the viewport.
- Use scroll to access offscreen content.

### Circular Canvas And Viewport

Circular standard mode must:

- Use native pixel dimensions.
- Use bounds that correspond to the visible map viewport.
- Center the map in the available visible coordinate area.

Circular standard mode must not:

- Use a square layout extent larger than the visible height when the visible map stage is rectangular.
- Let labels be placed below the visible stage and then expose them with scroll.

## Linear Map

### Purpose

Linear mode is optimized for a long sequence track. It may grow vertically and use scroll because rows above the track are the intended way to handle dense labels.

### Linear Standard Behavior

Linear mode must:

- Route visible enzymes and enabled primers together in the linear router.
- Avoid label-label overlaps and leader-label collisions where possible.
- Follow half-sweep label ladder rules (left half ascending, right half descending along the sequence):
  1. Each next label is either exactly one row above the previous label in that half, or resets to row 1 (bottom row).
  2. The leader-to-label attach point must not be further outward than the previous label’s attach point in the same half sweep.
  3. A row drop to row 1 is allowed only when the label’s outermost edge clears the previous label’s lateral leader segment by at least half the feature height.
  4. While building a ladder (consecutive +1 row steps on proximity-linked sites in the half sweep), spread connector attach points evenly to a forward bound: find `spreadEnd` from the next label position in sweep order (offset by `nextLabelWidth + 0.5 × featureHeight` toward ladder direction, clamped not to reverse direction), then use `step = (spreadEnd − firstAnchor) / labelCount` and attach rung `i` at `firstAnchor + i × step`.
- Draw primer annealed segments on the strand.
- Draw a 3' tick at the annealing coordinate.
- Draw primer leaders from the 3' annealing coordinate.
- Use the map panel width as `mapWidth`; inset the sequence track horizontally so outward edge labels fit inside that width without horizontal scroll (labels stay anchored; only the track span shrinks).
- Allow vertical scroll inside a viewport-bounded scroll host when content exceeds the map panel height.

Linear mode may:

- Use additional vertical rows for dense primer labels.
- Grow map height to fit many enabled primers.
- Limit enzyme labels by existing label budget behavior.

Linear mode must not:

- Change circular radius search.
- Change circular fallback behavior.
- Change circular canvas sizing.
- Change circular primer/enzyme routing.
- Scale the SVG with `preserveAspectRatio` meet or CSS max-width/max-height shrink-to-fit (use native pixel `width`/`height` matching `viewBox`; scroll for overflow).

## Primer Requirements

Primers must:

- Be visible in circular mode when primer display is enabled.
- Be visible in linear mode when primer display is enabled.
- Respect the user-enabled primer display settings and label limits.
- Anchor their leader to the exact 3' annealing nucleotide.
- Participate in collision routing with enzyme labels in circular mode.
- Participate in linear routing with enzyme labels in linear mode.

Primers must not:

- Be routed separately in circular mode.
- Be allowed to overlap enzyme labels in circular standard mode.
- Be allowed to force circular standard mode to use scroll instead of packed fallback.

## Regression Checklist

When changing map routing, verify:

- Circular normal plasmid opens in standard mode.
- Circular dense-primer plasmid shrinks the ring before fallback.
- Circular dense-primer plasmid enters packed fallback if minimum radius still cannot fit labels.
- Circular standard mode has no scrollbars caused by offscreen labels.
- Circular SVG is not CSS-scaled.
- Circular primers do not overlap enzyme labels in standard mode.
- Linear mode still shows primers.
- Linear primer leaders point to the 3' tick.
- Linear dense-primer maps can scroll vertically.
- Linear edge labels fit within panel width without horizontal scroll (track insets, labels not shifted off anchors).
- Linear half sweeps do not skip rows; row drops return to row 1 only with lateral leader clearance.
- Linear SVG is not CSS- or aspect-ratio-scaled.