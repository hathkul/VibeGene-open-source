# Sequence view label router

Authoritative description of `src/domain/sequenceLabelRouter.ts`. This router is **separate from** the map routers (`linearSimpleRouter.ts`, circular layout). It only lays out enzyme and primer callouts in the **Sequence tab**.

Row indices in code are **0-based** (code row `0` = row 1, closest to the sequence).

## Overview

For each wrapped sequence line (row chunk):

1. Collect enzyme sites above the strand block and primer sites below it.
2. Convert each site to a cut anchor **X** on that row’s track.
3. Group enzymes that share the same cut position into **co-cut stacks**.
4. Assign a vertical **lane row** to each stack using the same **Xspan / Xlim** row-assignment rule as the linear map router, in **one ascending cut-position sweep** for the whole row (no separate left/right routing regions).
5. When a **left ladder** ends (initial sweep assigns the next stack to **lane row 0** after a climb whose max initial row is **≥ 2**), **fold** the climb top→bottom onto the **right** side, then start the **next left ladder** at row 0 left (or row 1, 2, … left if folded spans block row 0).
6. Place labels at fixed **anchor X** with **vertical leaders only** — no horizontal label shift, no ladder spread.

Every displayed enzyme/primer in the row is routed. There is **no label budget** or merging in sequence view.

## Terminology

- **Sequence row** — one wrapped line of bases. The App passes exact **`rowSegments`** (`rowStart`, `rowLength` from each rendered row). Christmas-tree folds only consider stacks within that segment — a cut in the next visual row (e.g. 426 when the row ends at 424) does not fold labels in the current row.
- **Row 1** (UI) / **lane row 0** (code) — lowest label row directly adjacent to the sequence (enzymes above, primers below).
- **Feature width** — horizontal clearance unit `collisionUnitPx` (input). In production sequence view this is **`0px`** (`sequenceLabelCollisionPx` in `App.tsx`). Tests often use `48px`.
- **Anchor X** — horizontal position of the cut on the row track: `trackInsetPx + (cutPosition − rowStart) × baseStepPx`. `cutPosition` comes from `linearCutPosition(site)` (same as linear map).
- **Label width** — measured text width plus routing padding (`labelPadding`, default 6px in App). Used for collision span, not for hover frame.
- **Text width** — measured glyph width only; used for symmetric hover **frameBox**.
- **Primary side** — every label defaults to the **left** of its leader (`half: left`, box extends left, `textAnchor: end`). Christmas tree folds may move a label to the **right** of its leader (`half: right`).
- **Unified sweep** — all stacks in the row chunk, sorted by **ascending cut position**. One shared row-assignment history. Row collision uses **left-half rules only** (same as the linear map router’s left-half sweep).
- **Co-cut stack** — all sites with the same `cutPosition` in one row chunk. One shared vertical leader; labels stacked vertically by enzyme name.
- **Xlim** — `anchor X + featureWidth` (left-half limit from prior stack).
- **Xspan** — `anchor X − labelWidth` (inward edge of current label box).

## Input (`SequenceLabelRouterInput`)

| Field | Role |
|-------|------|
| `enzymeSites` / `primerSites` | Sites to route in this view |
| `sequenceLength`, `basesPerRow` | Wrap geometry |
| `rowSegments` | Optional exact per-row bounds from the Sequence tab (`rowStart`, `rowLength` per rendered row). When set, overrides `rowIndex × basesPerRow` derivation. |
| `baseStepPx`, `trackInsetPx` | Pixel track layout |
| `collisionUnitPx` | Feature width for Xlim (0 in sequence App) |
| `leaderStubPx` | Gap between label lane and sequence anchor line (default 8) |
| `labelForSite`, `labelWidthForSite`, `textHeight` | Label text measurement |
| `labelPadding` | Extra width added to measured text for routing box |

## Per-site geometry (`itemForSite`)

Skip sites whose `cutPosition` falls outside `[rowStart, rowStart + rowLength]`.

Each remaining site becomes an **Item** with anchor X, measured widths, and label text.

## Co-cut stacks (`buildCutStackUnits`)

Group items by `cutPosition`. Within a stack:

- Sort by enzyme name, then input index.
- **stackId** = `cut-${cutPosition}`.
- **anchorX** = first item’s anchor X (all equal).
- **labelWidth** = max of member label widths.
- **stackSize** = number of enzymes at that cut.

Row assignment runs on **stacks**, not individual enzymes. After row assignment, each stack member gets `laneRow = baseRow + stackIndex` (0 = stack leader / bottom of stack for enzymes above sequence).

## Row assignment (one sweep, left-half rules)

Same crossing logic as the linear map router’s **left-half** row assignment (`linear router specs.md`). All stacks in the row chunk are processed in **ascending cut position**. There is **no row-chunk midpoint split** and no per-side sweep direction.

### First stack in the row

Place on **lane row 0** (`half: left`). Record history with top row = `stackTopRow(0, stackSize)` and **Xlim = anchor X + featureWidth**.

### Every later stack

- **Xlim_immediate** = previous anchor X + featureWidth  
- **Xspan** = current anchor X − labelWidth  
- **Crossing:** `Xspan < Xlim`  
- **Row:** max(highest crossed prior row + 1, immediate-predecessor floor), same as linear map.

Farther sites along the row naturally return to row 0 when their spans no longer cross prior limits. Dense groups later in the row form new ladders independently.

This initial pass produces **initial rows** for Christmas tree detection.

## Christmas tree ladder fold (`applyChristmasTreeFolds`)

After the initial sweep, scan stacks in **ascending cut order**. A **ladder ends** when:

- The stack’s **initial** assignment is **lane row 0** (ladder foot / reset in the sweep), **and**
- The preceding climb (from the **nearest prior initial row-0 stack** through the stack immediately before this one) has **maximum initial base row ≥ 2**.

Example: ladder `[368 → 369 → 370]` ends when **374** gets initial row 0; fold **370** (and any higher climb members that pass fold checks) to the right; **374** starts the next left ladder. **375** continues that ladder **above** the foot (row 3 if the foot landed on row 2) — never row 1 below the foot.

If the **sequence row segment ends** before a row-0 successor arrives (e.g. row ends at cut 424 and **426** is on the next visual row), fold the trailing climb at the row boundary the same way — using the track’s right edge as the fold clearance limit, **plus the same margin slack** (`2×trackInset + labelPadding`).

When a ladder ends:

### 1. Fold the completed ladder

1. Consider the climb slice after the foot. Mid-row folds require a real climb: at least two climb stacks, with some initial base row ≥ 2. Row-end folds may fold a single trailing stack when it climbed to initial base row ≥ 2.
2. Start the competition with the **last climb stack** (`n-1`) on the right and the successor (`n`) on the left. Mid-row folds use normal left/right collision checks against the competing label and leader; row-end folds use the track right edge plus margin slack `2×trackInset + labelPadding` because there is no successor competing.
3. Fold from `n-1` backward toward the foot while building the next left ladder forward from `n`. `n-1` gets the lowest valid right row. Each earlier folded stack must start below the previous folded stack (`previous folded top + 1`) and must still have a folded top row lower than its current left top row.
4. At each row, compare the next backward folded stack (`n-m`, right) with the next forward stack (`n+r`, left). They may share that row only when neither label crosses the other's leader and their label boxes do not overlap.
5. If the competing left/right labels collide, place only one. Priority alternates by the previous contested row: when the folded label took the previous contested row, the forward label gets priority on the next contested row; when the forward label took the previous contested row, the folded label gets priority next.
6. Stop the backward fold at the first stack that cannot land lower. Stacks already folded stay right; the rest of the climb remains on the left. The successor and its forward ladder always stay on the left.

### 2. Place the successor (next ladder foot)

The next ladder **always** starts on the **left**. Try **row 0 left**, then **row 1 left**, **row 2 left**, … until the span fits in occupied rows. Occupancy includes only stacks **already processed** in the forward pass (index `<` successor) — not later stacks that still carry initial-sweep rows. **Never** flip the successor to the right because row 0 left is blocked by folded labels.

### 3. Continue the new left ladder upward

Each following stack (until the next initial row-0 foot) is placed **above** the previous stack in that ladder: `row >= previousTopRow + 1`, using the same left-half Xspan/Xlim crossing rules. Do **not** reuse initial-sweep rows — if the foot landed on row 2, the next label is row 3 or higher, not row 1.

Only stacks folded in step 1 use **`half: right`**. Unfolded ladder members and all new ladder feet stay **`half: left`**.

Unfolded members keep primary side and row. Folded members form the descending slope on the opposite side.

## What this router does *not* do

Compared to the linear **map** router:

- **No ladder formation or ladder X spread** — labels never move horizontally off anchor X.
- **No label budget** — all input sites in the row are laid out.
- **No elbow / horizontal connector segments** — leader is a single vertical segment at anchor X.
- **No map-edge clamping** — only row-chunk bounds implied by which sites are included.

## Label placement (`buildCallout`)

### Vertical position

For side `above` (enzymes) or `below` (primers), with `rowGap` derived from text height:

```
rowGap = minTextHeight + 2×LABEL_PADDING + 2×COLLISION_GAP + 1
```

Enzymes (above, anchorY = 0):

```
labelY = anchorY − stubHeight − minTextHeight/2 − COLLISION_GAP − laneRow × rowGap
```

Primers (below):

```
labelY = anchorY + stubHeight + minTextHeight/2 + COLLISION_GAP + laneRow × rowGap
```

### Horizontal box (half-aware)

**Left half:** box extends left from anchor; `textAnchor = end`; label X at box right (= anchor).

**Right half:** box extends right from anchor; `textAnchor = start`; label X at box left (= anchor).

**frameBox** — symmetric padding around measured **textWidth** for hover chrome (does not affect row assignment span).

### Leader

Only **stackIndex === 0** (stack leader) draws a leader:

```
(anchorX, leaderAttachY) → (anchorX, anchorY)
```

`leaderAttachY` = bottom of leader’s label box (enzymes above) or top (primers below). Co-cut members above the leader in the stack have **no** leader segment.

Leaders are strictly vertical: **leader X = anchor X always**.

## Lanes per sequence row

`layoutSequenceRow` produces:

- **enzymeCallouts** — `side: above`, routed with `anchorY = 0`
- **primerCallouts** — `side: below`, routed with `anchorY = 0` (primer lane grows downward from anchor line)

`enzymeLaneRows` / `primerLaneRows` = max lane row + 1.

`sequenceRowLaneMetrics` converts callout box extents plus stub height into pixel lane heights for CSS (`--enzyme-lane-height`, `--primer-lane-height`).

## Current App defaults (Sequence tab)

| Parameter | Value |
|-----------|--------|
| `collisionUnitPx` | `0` |
| Enzyme label font | 11px system-ui, weight 600, black |
| `textHeight` (router) | 13 (= font size + 2) |
| `labelPadding` | 6 |
| `baseStepPx` | 10 |
| `trackInsetPx` | 28 |
| `leaderStubPx` | 8 |

With **feature width 0**, **Xlim equals anchor X**, so any label whose inward edge crosses a prior anchor in sweep order stacks on the next lane row.

## Implementation map

| Spec concept | Code |
|--------------|------|
| Entry | `layoutSequenceViewLabels(input, rowCount)` |
| Row chunk | `layoutSequenceRow` |
| Stack grouping | `buildCutStackUnits` |
| Row assign | `assignStackRows` → `rowAssignForSweep` + `applyChristmasTreeFolds` |
| Callout output | `buildCallout` |
| Lane height | `sequenceRowLaneMetrics` |

## Tests

`tests/sequenceLabelRouter.test.ts` covers vertical leaders, co-cut stacks, row stacking without horizontal spread, per-row filtering, half-aware boxes, stack-height-aware neighbor placement, Christmas tree ladder folding, and pDemo MCS successor placement with canvas-measured label widths (`tests/sequenceLabelTestUtils.ts`).

## Possible optimizations (not yet implemented)

- Reduce repeated passes over stacks when building callouts.
- Tie `textHeight` / `rowGap` to measured font metrics instead of fixed offsets.
- Optional small non-zero feature width if row-0 stacking is too aggressive at `collisionUnitPx = 0`.
- Share row-assignment core with `linearSimpleRouter.ts` to avoid drift.
