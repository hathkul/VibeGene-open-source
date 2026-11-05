# Primer3 thermodynamic alignment adapter

This isolated module wraps `thal()` from Primer3 2.6.1. It does not use or modify
the application's existing `primer3_core` WASM module. Build with
`npm run build:primer3-thal-wasm` after the pinned Primer3 2.6.1 source has been
unpacked under `.cache/primer3/build/primer3-2.6.1/src` (the existing
`build:primer3-wasm` workflow populates that cache but also rewrites the other
WASM artifact, so it is not needed when the cache already exists).

`npm run build:primer3-thal-wasm` verifies the SHA-256 of the pinned
`.cache/primer3/primer3-2.6.1.tar.gz`, extracts it into a temporary directory,
and compiles the adapter with Emscripten. It does not need an already extracted
source tree. The Emscripten cache defaults to `.cache/emscripten` and can be
overridden with `EM_CACHE`.

`primer3ThalAlign` accepts two sequence strings in the orientation passed to
Primer3 and returns Primer3's `tmC`, its 1-based `alignEnd1`/`alignEnd2`, and
the native `THL_STRUCT` drawing in `structure`. The drawing's contents survive
the JSON boundary unchanged, including Primer3's `&deg;C` notation and its
literal backslash-n separators. The API does not derive genomic start
coordinates or enumerate all possible alignments; these values describe the
single best structure returned by Primer3 for those sequences and mode.

Modes map directly to Primer3's `thal_alignment_type`: `any` (`thal_any`, 1),
`end1` (`thal_end1`, 2), and `end2` (`thal_end2`, 3). In the native code,
`end1` evaluates alignments at the last index of the first sequence;
`end2` swaps sequence roles internally and evaluates at the last index of the
second input. End modes force inclusion of that terminal index, but do not
require a Watson-Crick terminal pair: they can return a terminal mismatch and
very low/negative Tm. Thus, for a primer passed as `sequence1` in its 5' to 3'
orientation, `end1` is the appropriate Primer3 mode to anchor its 3' index,
followed by checking the returned drawing and terminal base compatibility if
the calling feature requires the 3' base to pair. For a primer passed as
`sequence2`, use `end2`. This mode behavior is not a biological guarantee of
extension competence.

Chemistry follows Primer3 units: monovalent salt, divalent salt, and dNTP
concentrations are mM; DNA concentration is nM. Defaults match
`set_thal_default_args`: 50 mM monovalent, 0 mM divalent, 0.8 mM dNTP, 50 nM
DNA, and 37 °C structure drawing reference temperature. The reference
temperature affects the structural drawing, not the reported melting point.
`maxLoop` is the native maximum loop parameter, allowed here from 0 to 30.
The bundled nearest-neighbor tables are Primer3's default tables from
`thal_parameters.c`; users cannot choose alternate parameter sets through this
adapter.

Primer3 documents a maximum of 60 nt for either sequence when both are longer
than 60, and 10,000 nt for either individual sequence. Runtime and memory grow
with sequence length. This adapter propagates native length errors. It only
uppercases input; callers should provide bases supported by Primer3. In the
primer editor, the target is restricted to the selected binding span (wrapped
modularly when a circular site crosses the origin), so a nearby locus cannot
replace the selected site in the thermodynamic calculation.

Focused tests check a terminal mismatch case where `any` ends before sequence
1's final index and `end1` is forced to that index with a dramatically
different Tm. They also compare an adapter result against the documented
Primer3 2.6.1 ntthal reference vector (59.9003 °C), and exercise a 5′ tail and
internal insertion. The tests demonstrate that end mode is position-anchored
but does not filter mismatches. A separate `ntthal` executable is not required;
the adapter is compiled from Primer3's same native `thal()` implementation.

Primer3 is distributed under GPL-2.0-or-later; see the adjacent `LICENSE`.
