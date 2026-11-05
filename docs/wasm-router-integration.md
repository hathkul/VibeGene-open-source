# Experimental worker router

The app has an experimental label-router worker and client, but the worker currently uses its JavaScript fallback. The WASM module is not loaded, and normal map rendering uses the existing JavaScript router.

The worker protocol and client are in `src/domain/wasmRouterProtocol.ts` and `src/domain/labelRouterClient.ts`; the worker is `src/workers/labelRouter.worker.ts`.

## Runtime flags

- `?wasmRouter=1` runs the worker router in shadow mode while the normal router renders.
- `?wasmRouterRender=1` renders the experimental worker output; it may differ visually from the normal router.
- `?routerBenchmark=1` emits timing information for comparison.

Worker routing is disabled when outer feature callouts are active. For a visual comparison, start the app and use `?wasmRouter=1&wasmRouterRender=1&routerBenchmark=1`. Treat the worker render as experimental.
