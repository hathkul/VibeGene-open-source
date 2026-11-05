if any label reaches row 3, then, a ladder is formed. previous 2 labels (on row 1 and 2, which triggered this label to row 3) also belong to this ladder, and all next labels until some label is placed on row 1. 
For each ladder, take distance between site of label before the ladder + 1/2 feature width (like, its Xlim, only with 1/2 feature width and not full feature width) and inner edge of label after ladder - 1/2 feature width (like its Xspan, but with 1/2 feature width and not full feature width). this is ladder spread potential. divide spread potential by ladder element number, you get max possible spread distance. If it is less than 1 feature width, spread labels evenly through spread potential. if it is more - pairwise check ladder elements and find those which have X distance lower than 1 feature width. increase it to at least 1 feature width by shifting one to left or other to right, whatever space allows. if neither of neighboring distances allow (this would reduce them below 1 feature width) - shift them too, until enough space is provided. do this for next pair which is closer than 1 feature width on axis X.  When spreading a ladder, the priority should always be lateral spread - first max possible movement lateral to condensed pair of labels (pairwise check ladder elements and find those which have X distance lower than 1 feature width. increase it to at least 1 feature width by shifting one to left or other to right, whatever space allows. if neither of neighboring distances allow (this would reduce them below 1 feature width) - shift them too, until enough space is provided. do this for next pair which is closer than 1 feature width on axis X) - this part, and only after that try moving inner labels. Also, level 1 labels are allowed to be moved up to 1 feature width on x axis, including moving out of map's span (beyond map edge). Your current implementation results in labels moving past previous' or next' label's X, which is absolutely forbidden. 


## Terminology

- **Row 1** is the lowest label row directly above the track; row numbers increase upward (row 2, row 3, …).
- **Feature width** is the rendered feature height on the linear map (one feature band thickness).
- **Anchor X** is the track X of the site cut position.
- **Actual label width** is the measured rendered text width plus label padding for that site.
- **Half-sweep** processes one map half independently. **Left half:** center → outward edge (ascending cut position). **Right half:** outward edge → center (descending cut position).
- **Outward** means away from map center; **inward** means toward map center.
- **Xlim** of a site is its outward limit line derived from that site’s anchor X and one feature width.
- **Xspan** of the current site is the outward extent of its label box, derived from its anchor X and actual label width.

## Row assignment (per half, in half-sweep order)

Process sites one by one. Keep a history of all prior labels in this half; for each prior label store its assigned row and its **Xlim**.

### First label in the half

Place on **row 1**.

### Every later label

Let **Xprev** = anchor X of the immediately previous site in half-sweep order.

Let **Xnext** = anchor X of the current site.

Let **W** = actual label width of the current site.

**Right half**

- Immediate limit: `Xlim_immediate = Xprev − featureWidth`
- Current span: `Xspan = Xnext + W`
- Each prior label’s stored **Xlim** = `that label’s anchor X − featureWidth`

**Left half** (mirror)

- Immediate limit: `Xlim_immediate = Xprev + featureWidth`
- Current span: `Xspan = Xnext − W`
- Each prior label’s stored **Xlim** = `that label’s anchor X + featureWidth`

**Crossing tests**

- Right half: Xspan crosses a limit when `Xspan > Xlim`
- Left half: Xspan crosses a limit when `Xspan < Xlim`

**Row selection**

1. Build the set of all **prior** labels whose **Xspan crosses that prior’s Xlim** (same half-aware crossing test as above).
2. If that set is non-empty: **candidate row** = one row above the label in that set that is already on the **highest row**.
3. If **Xspan** crosses **Xlim_immediate** of the immediately previous label: **floor row** = one row above that immediate previous label.
4. **Final row**:
   - If a candidate row exists and a floor row exists: `max(candidate row, floor row)`
   - If only a candidate row exists: candidate row
   - If only a floor row exists: floor row
   - If neither exists: **row 1**

Record the chosen row and this label’s **Xlim** in history before moving to the next site.

**Important:** Step 2 always searches the full prior history. A long label whose Xspan crosses a distant high-row prior must stack above that prior, not only above the immediately previous label.

## Ladder formation

A **ladder** starts when any label is placed on **row 3**.

The ladder includes:

- that row-3 label,
- the two labels on row 1 and row 2 that immediately preceded it in half-sweep order,
- every following label in the half-sweep that is **not** placed on row 1,

until a later label is again placed on row 1.

## Ladder spread

Y placement is row assignment (above). Default X for every label is **site anchor X** (vertical leaders). Ladder X spread only runs on detected ladders.

See **Current implementation** below for the full algorithm. Summary:

1. Compute spread zone (`Xlim.2` … `Xspan.2`), map members **proportionally to anchor position** in that zone.
2. Widen adjacent pairs below their floor (outward first, then inward), without compressing pairs that already have excess gap.
3. Enforce sweep-order monotonicity (no label outward of an earlier ladder member).
4. Clamp inward motion per row and at map center.

### Outward constraint

First ladder member may not move more than **1 feature width** outward from its own site X (may extend past the map edge).

## Leader geometry

- Label boxes extend **outward** from the leader attach point by actual label width.
- Left half: box spans `[attachX − width, attachX]`
- Right half: box spans `[attachX, attachX + width]`
- Leader path: site anchor → stub elbow → vertical rise at site X → **inner bottom corner** of the label box
  - Left half: attach at `(box.right, box.bottom)`
  - Right half: attach at `(box.left, box.bottom)`

## Processing order

### Router (`linearSimpleRouter.ts`)

For each map half:

1. Assign rows (Y).
2. Set every label attach X to site anchor X.
3. Detect ladders and spread ladder attach X (see below).
4. Build label boxes and leaders from final attach X.

### App integration

1. Layout once on the provisional track (`trackLeft` / `trackRight` from viewport).
2. `computeLinearTrackLayout` may expand the map or shift track bounds to fit label overflow.
3. **Re-run** `layoutLinearEnzymeCalloutsSimple` on the final `mapWidth`, `trackLeft`, `trackRight` so anchors and spread share the same scale as rendered positions.

## Debug

`?linearRouterDebug=1` logs one `row_assign` event per site with `xPrev`, `xNext`, `xlim`, `xspan`, `crossesImmediate`, `exactCrossedRow`, and final `row`.

---

## Current implementation (`linearSimpleRouter.ts`)

Authoritative description of the active router. Row indices in code are **0-based** (code row `0` = row 1 above the track).

### Module entry

`layoutLinearEnzymeCalloutsSimple(input)`:

- Builds one **Item** per input site (anchor X from `trackLeft + cut/length × trackSpan`).
- Splits items into left / right halves; sorts each half in half-sweep order.
- Runs row assignment, ladder spread, then `buildCallout` per item.

### Ladder identification

After row assignment, walk the half-sweep-ordered list once with index `i` starting at `2`.

A **ladder start** is detected when three consecutive labels sit on rows `0`, `1`, `2` (rows 1–3 above the track):

- `row(i − 2) === 0`
- `row(i − 1) === 1`
- `row(i) === 2`

The ladder **includes**:

- the label at `i − 2` (row 1),
- the label at `i − 1` (row 2),
- the label at `i` (row 3),
- every following label in half-sweep order whose row is **not** `0`,

until the first later label again placed on row `0` (row 1).

Then set `i = ladderEnd + 1` and continue scanning for the next ladder.

Labels not in any ladder keep attach X at **site anchor X**.

### Spread zone (`Xlim.2`, `Xspan.2`, `Xspread`)

For each detected ladder, let **before** = the site immediately before the ladder in half-sweep order (if any), **after** = the site immediately after the ladder (if any), **last** = last ladder member.

**Left half**

- `Xlim.2 = before.anchorX − ½ feature width` (outward end); if there is no **before** site, use `ladder[0].anchorX − ½ feature width`
- `Xspan.2`:
  - if **after** exists: `after.anchorX − after.labelWidth + ½ feature width` (label width used only here)
  - else: `last.anchorX + ½ feature width`
  - if the **after** value is outward of `Xlim.2` (wide after-ladder label collapses the zone), ignore it and use `max(last.anchorX + ½ feature width, Xlim.2)`
- Normalize: `outwardX = min(Xlim.2, Xspan.2)`, `inwardX = max(Xlim.2, Xspan.2)`
- `Xspread = inwardX − outwardX`

**Right half** (mirror)

- `Xlim.2 = before.anchorX + ½ feature width` (or `ladder[0].anchorX + ½ feature width`)
- `Xspan.2`: `after.anchorX + after.labelWidth − ½ feature width`, else `last.anchorX − ½ feature width`; if outward of `Xlim.2`, fall back to `min(last.anchorX − ½ feature width, Xlim.2)`
- `outwardX = max(Xlim.2, Xspan.2)`, `inwardX = min(Xlim.2, Xspan.2)`
- `Xspread = outwardX − inwardX`

If `Xspread ≤ 0`, skip zone mapping for that ladder; attach stays at anchor X.

Ladders with fewer than two members are not spread.

### Spread algorithm (`spreadLadder`)

Default attach X for ladder members is **site anchor X**. One unified path for all ladders (no `Xmaxdist` branch). Pass order:

| Step | Action |
|------|--------|
| 1 | Anchor-proportional placement in zone |
| 2 | Clamp inward limits (row cap + center) |
| 3 | Adjacent gap floors (pairwise, outward first) |
| 4 | Clamp inward limits |
| 5 | Sweep-order guard |
| 6 | Clamp inward limits |

#### 1. Anchor-proportional placement in zone

For each ladder member `i` with anchor `A_i` (inward direction adjusted per half):

```
span = (A_last − A_first) × towardCenter
t_i  = (A_i − A_first) × towardCenter / span     // if span ≈ 0: t_i = i / (N − 1)
attach_i = outwardX + t_i × Xspread              // left; mirrored on right (outwardX − t × Xspread)
```

Preserves relative anchor spacing across the zone (wide anchor gaps stay proportionally wide; non-adjacent pairs are not collapsed to uniform index spacing).

After placement, clamp every member to its **outward attach floor** (zone outward edge + row-1 rule for the first member + label-aware blocker limits; see step 3).

#### 2–4–6. Inward shift limits (row cap + map center)

**Map center:** `centerX = (trackLeft + trackRight) / 2`.

**Per-row inward cap** (code row index `r`, display row `r + 1`):

```
inwardCap_r = (r + 1) × ¼ feature width
```

**Left half** (inward = higher X):

```
attach_i ≤ min(anchor_i + inwardCap_r, centerX)
```

**Right half** (inward = lower X):

```
attach_i ≥ max(anchor_i − inwardCap_r, centerX)
```

No ladder label may cross map center.

Applied after steps 1, 3, and 5. Inward cascade moves during gap-floor widening use remaining **headroom** to this bound (`min(slack, headroom)`).

#### 3. Adjacent gap floors (pairwise, outward first)

For each adjacent pair `(p, p + 1)` in sweep order:

```
anchorGap_p = inward distance between anchor attach positions
floor_p     = max(feature width, anchorGap_p)
```

If spread gap `< floor_p`, widen the pair by `need = floor_p − gap`:

**Outward first** — move label `p` outward:

- Each label’s outward extent at attach is **Xspan.2(label)** = `attach − labelWidth + ½ feature width` (left; mirrored on right).
- Outward movement must not cross **Xlim.2** of any outward non-ladder label: for blocker `B`, require `Xspan.2(label) ≥ B.Xlim.2` (left), i.e. attach floor `B.Xlim.2 + labelWidth − ½ feature width`.
- Among outward non-ladder labels, use the **tightest** blocker (largest `Xlim.2` on the left half).
- Slack at `p = 0`: down to `max(zoneOutwardX, outwardMin_0, blocker attach floor)` where `outwardMin_0 = A_first ∓ feature width` and `zoneOutwardX` is the spread zone’s outward edge.
- Slack at `p > 0`: min of pair `(p − 1, p)` excess above `feature width` and remaining slack to that label’s blocker attach floor.
- If slack insufficient: **cascade** — recurse outward on label `p − 1`, then retry moving `p` with new slack.

**Inward second** — if still short, move label `p + 1` inward:

- Slack from excess in pair `(p + 1, p + 2)` above `feature width`, or to `Xspan.2` for the last pair.
- Cascade inward on successors when needed.
- Each inward step capped by row/center headroom.

Never **compress** a pair below `floor_p`. Repeat passes until stable; clamp inward limits after each pass.

#### 5. Sweep-order guard

Attach X must stay monotonic in half-sweep order:

- Left: `attach_{i+1} ≥ attach_i`
- Right: `attach_{i+1} ≤ attach_i`

A label may not end up outward of an earlier ladder member.

### Constraints summary

| Constraint | Rule |
|------------|------|
| Outward (row 1 only) | First member ≤ 1 feature width outward from own anchor; all members: label Xspan.2 must not cross outward non-ladder Xlim.2 |
| Inward (per row) | Row `r+1`: inward shift ≤ `(r+1) × ¼ feature width` from anchor |
| Map center | Left attach ≤ `centerX`; right attach ≥ `centerX` |
| Adjacent floor | Gap ≥ `max(feature width, anchor gap)`; never shrink wide pairs |
| Sweep order | Attach monotonic outward → inward in half-sweep order |