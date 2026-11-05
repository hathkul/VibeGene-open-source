# Startup performance measurement

The repeatable browser harness measures the production web build served by
`vite preview`. It does not measure Vite dev-server startup or the Tauri shell.

Run it from the repository root:

```sh
npm run build:web
npm run measure:startup -- --runs=10
```

The harness starts and stops a local preview server on `127.0.0.1:5180`. Use a
different port with `--port=5181`; use `--runs=10` for a larger sample.

Each run uses a fresh Chromium context at a 1440×900 desktop viewport and
blocks the app service worker. This makes the two cache conditions explicit:

- `cold-ish`: a fresh context with the HTTP cache disabled for the first load;
- `cached-reload`: the same page context reloaded after the first load with the
  HTTP cache enabled.

The URL includes `?bootSplash=0`, so the intentional three-second launch splash
is not counted as application readiness. The report includes navigation
DOMContentLoaded/load timings; `#main-workspace` visibility; map readiness when
the map backbone is rendered; sequence readiness after selecting the Sequence
tab; same-origin transferred bytes, Resource Timing encoded-body bytes, decoded
bytes, zero-transfer entries (a cache heuristic, not proof of a cache hit), and
the slowest resources; long-task entries when the browser supports
them; FCP/LCP/CLS and long-task blocking observed through map readiness when supported;
and a bounded list of startup layout-shift values/timestamps with source-node
labels and previous/current bounds when Chromium exposes them; and
`measureUserAgentSpecificMemory()`
only when Chromium exposes and successfully completes that API. External
telemetry requests are excluded from resource totals. `encodedBodyBytes` is
the Resource Timing encoded body size (not a claim that Vite preview gzipped
the response); transfer bytes and zero-transfer entries are informational and
are not a network-performance verdict because the server is localhost. A
deployed-service-worker warm-profile run should be measured separately when
the production caching path itself is under review.

The command prints medians plus raw per-run samples. For an auditable record,
save stdout to a dated file outside the repository, for example:

```sh
npm run build:web && npm run measure:startup -- --runs=10 > /tmp/vibegene-startup-$(date +%Y%m%d-%H%M%S).log
```

The output includes the commit SHA, OS/architecture, Chromium version,
viewport, run count, medians, p90 values, and raw samples. Use at least 10–15
samples and alternate A/B builds when making bundle decisions; do not infer a
network verdict from localhost transfer sizes. The script is a Chromium web
lab only. A release-Tauri check should separately record process launch to
visible splash, JavaScript/UI marks, and document-open workspace readiness on a
fresh profile and a warm profile, noting that the desktop shell uses WKWebView
on macOS (not Chromium) and has different filesystem/cache behavior. Suggested
desktop defaults are process→first splash p90 ≤1 s and document-open functional
workspace readiness p90 ≤2.5 s.

Results vary with CPU load, Chromium version, OS, and whether the local preview
server is already warm. Compare runs on the same machine, viewport, browser,
build, and run count. The normal splash intentionally holds for about 3.28
seconds; `bootSplash=0` isolates functional readiness before that hold. The
default browser acceptance targets on the declared machine/profile are
workspace/map readiness p90 ≤2.5 s and startup long-task blocking ≤200 ms.
The normal splash path should report ready-before-3.28 s slack separately. The
decision gate for an optimization is: a target must be missed, and the
candidate must explain at least 200 ms of critical-path work attributable to
eager JavaScript/CSS with a repeatable material gain (at least 5%). Changes
below 100 ms or below 5% are likely measurement noise. These are tunable
product defaults; this harness is intentionally diagnostic and does not fail
the build on a performance threshold.

If CLS exceeds 0.1, inspect the reported `layoutShifts.sourceEntryValueTotals`
and `largest` entries. `sourceEntryValueTotals` ranks source labels by the sum
of whole layout-shift entry values for entries that mention each source; it is
not an exclusive per-node CLS contribution when one entry has multiple
sources. Entries are captured before synthetic tab interaction, so the
reported phase/time and source bounds describe startup layout only; source
labels are strings and the probe retains no DOM nodes.
