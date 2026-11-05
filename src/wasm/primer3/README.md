# Primer3 WebAssembly build

`primer3.mjs` is `primer3_core` from [Primer3](https://github.com/primer3-org/primer3) **v2.6.1**, compiled with Emscripten into a single-file ES module (the WASM binary and the `humrep_and_simple.txt` mispriming library are embedded). It is generated. Don't edit it by hand.

- Source: https://github.com/primer3-org/primer3/archive/refs/tags/v2.6.1.tar.gz
- SHA-256: `805cef7ef39607cd40f0f5bb8b32e35e20007153a0a55131dd430ce644c8fb9e`
- Built with: Emscripten 6.0.10
- License: GPL-2.0-or-later (see `LICENSE`, copied from the Primer3 source)

The embedded virtual file system contains `/primer3_libs/humrep_and_simple.txt`. Thermodynamic parameters are compiled into Primer3 (`thal_parameters.c`), so `primer3_config/` is not needed.

## Rebuild

Requires Emscripten (`emcc`/`em++` on `PATH`, e.g. `brew install emscripten`):

```sh
npm run build:primer3-wasm
```

The script downloads the pinned tarball to `.cache/primer3/`, verifies the SHA-256, compiles the `primer3_core` sources and rewrites `primer3.mjs` and `LICENSE` here. `primer3.d.mts` is hand-written.
