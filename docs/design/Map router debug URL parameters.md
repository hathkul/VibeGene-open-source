# Map Router Debug URL Parameters

Add these query parameters to the app URL to inspect router behavior.

Example:

```text
http://localhost:5173/?routerDebug=1&routerProfile=1
```

Multiple parameters can be combined with `&`.

## Circular Router

### `routerDebug=1`

Shows circular router debug rectangles in the SVG.

- Teal boxes indicate standard circular callout bounds.
- Red boxes indicate packed fallback callout bounds.
- Purple boxes indicate external feature callout bounds.

Use this to inspect:

- Label boxes.
- Whether the map is in standard or packed fallback mode.
- Obvious offscreen or overlapping label bounds.

Example:

```text
?routerDebug=1
```

### `routerProfile=1`

Logs detailed circular router timing and decision steps to the browser console.

Use this to inspect:

- Radius search steps.
- Cache hits.
- Whether a radius was feasible.
- Number of labels routed.
- Whether outer feature callouts were included.
- Final layout mode.

Example:

```text
?routerProfile=1
```

Useful with:

```text
?routerProfile=1&routerDebug=1
```

### `routerBenchmark=1`

Logs high-level circular router timing to the browser console.

Use this to inspect:

- Total JS router time.
- Label count.
- Map size.

Example:

```text
?routerBenchmark=1
```

### `routerPackedDebug=1`

Logs packed fallback placement debug entries to the browser console when packed fallback is used.

Use this to inspect:

- Packed fallback label placement.
- Packed fallback leader behavior.
- Dense-label fallback diagnostics.

Example:

```text
?routerPackedDebug=1&routerDebug=1
```

## Worker Router

### `wasmRouter=1`

Enables the worker router execution path for circular labels.

Notes:

- This runs the worker route call.
- Rendering still uses the JS layout unless `wasmRouterRender=1` is also enabled.

Example:

```text
?wasmRouter=1
```

### `wasmRouterRender=1`

Uses worker router output for rendered circular labels when worker routing is enabled.

Use this only when comparing worker output against JS output.

Example:

```text
?wasmRouter=1&wasmRouterRender=1
```

Useful with:

```text
?wasmRouter=1&wasmRouterRender=1&routerBenchmark=1&routerProfile=1
```

## Linear Router

### `linearRouterDebug=1`

Logs linear router placement events to the browser console.

Use this to inspect:

- Linear label placement rows.
- Row jumps.
- Placement failures.
- Cluster IDs.
- Label offsets.
- Primer and enzyme placement order.

Example:

```text
?linearRouterDebug=1
```

## Common Debug Recipes

### Inspect Circular Layout Bounds

```text
?routerDebug=1
```

Shows boxes and reveals whether labels are fitting the visible circular map area.

### Diagnose Circular Radius Search

```text
?routerProfile=1&routerDebug=1
```

Use this when the circular ring does not shrink, labels are dropped, or fallback does not trigger.

### Diagnose Circular Speed

```text
?routerBenchmark=1&routerProfile=1
```

Use this when loading or resizing a circular map is slow.

### Diagnose Packed Fallback

```text
?routerDebug=1&routerPackedDebug=1&routerProfile=1
```

Use this when a dense circular map enters packed fallback or should enter packed fallback.

### Compare Worker Router Against JS Router

```text
?wasmRouter=1&routerBenchmark=1&routerProfile=1
```

Runs worker routing for timing without rendering worker output.

```text
?wasmRouter=1&wasmRouterRender=1&routerDebug=1&routerBenchmark=1&routerProfile=1
```

Runs and renders worker output for visual comparison.

### Diagnose Linear Primer Rows

```text
?linearRouterDebug=1
```

Use this when linear primer labels jump rows, stack unexpectedly, or fail placement.

## Console Output Locations

All diagnostics appear in the browser DevTools console.

Expected console groups include:

- `[router][profile] ...`
- `[router][js] ...`
- `[router][worker] ...`
- `[router][packed-debug] ...`
- `[linear-router] ...`
