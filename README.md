# VibeGene

VibeGene is a DNA, RNA and protein sequence editor for the browser and desktop. It brings sequence and plasmid-map views together with annotation, primers, restriction enzymes, cloning workflows and a local sequence database.

Use the hosted app at [vibe-gene.com](https://vibe-gene.com/). The desktop app uses Tauri for native windows, menus and file access. Projects can be imported from formats including SnapGene, GenBank, FASTA and EMBL; export support varies by format.

## Run locally

The CI environment uses Node.js 22. Install dependencies and start the web development server:

```sh
npm ci
npm run dev
```

Open the address printed by Vite. To run the desktop development app, install the platform prerequisites for Tauri and Rust, then run `npm run tauri:dev`. A production web build uses `npm run build`.

Protein searches submitted to EMBL-EBI require a valid contact address. Set `VITE_EMBL_EBI_EMAIL` in your local environment before starting or building the app. Without it, those searches report a configuration error.

The Cloudflare worker settings contain placeholders and must be configured for your own deployment. The desktop application identifier is also a placeholder: a build using it has a separate application identity and does not automatically access an existing installation's data. Production builds default to the VibeGene telemetry API; set `VITE_VIBEGENE_API_BASE` to use another API. Development builds do not send telemetry to production by default. See [workers/README.md](workers/README.md) for the service layout.

## Architecture

The app uses a layered architecture with dependencies pointing inward:

- **Domain** (`src/domain/`) contains sequence and biology rules, parsers, geometry and other deterministic logic.
- **Application** (`src/application/`) coordinates use cases through explicit ports and keeps workflow decisions independent of React and concrete I/O.
- **Presentation** (`src/presentation/` and `src/ui/`) renders the interface and translates user actions into workflows.
- **Infrastructure** includes IndexedDB storage (`src/storage/`), Tauri adapters (`src/desktop/`), workers and WebAssembly (`src/workers/` and `src/wasm/`). Composition roots assemble the concrete implementations.

`SequenceRecord` is the canonical editable record. Sequence coordinates are generally zero-based and half-open; use the existing helpers for circular sequences. The format registry in `src/domain/fileFormats.ts` is the source of truth for format capabilities.

See [ARCHITECTURE.md](ARCHITECTURE.md) for layer contracts, invariants and feature/bug-fix guidance; [feature ownership](docs/architecture/feature-ownership.md) for where to make a change; [database architecture](docs/database-architecture.md) for persistence and folder synchronization; and [design notes](docs/design/) for map routing and color guidance.

## Making and verifying changes

Start by identifying the feature owner and reproducing the behavior. Keep the change focused, put rules in the appropriate layer, and add a behavioral regression test where practical. Changes to UI timing, focus, rendering or native behavior also need a live check on the affected surface.

The project uses a tiered verification workflow:

1. **Implementation:** use the smallest relevant test or live check while iterating; document any regression test deferred to the checkpoint.
2. **Batch checkpoint:** run affected tests together, relevant architecture, type, lint or theme checks, and a live smoke for each affected surface. High-risk changes—such as persistence, history, parsers or native lifecycle—move directly to this checkpoint.
3. **Merge gate:** once the batch is ready, run the complete local gate below and any additional evidence the change requires. GitHub CI runs its own quality checks.

```sh
npm run check:architecture
npm run check:application-strict
npm run check:lint-baseline
npm run check:theme
npm run check:theme-debt
npm test
npm run build
git diff --check
```

For theme, cascade or responsive changes, also run `npm run test:theme-ui` after installing Playwright Chromium (`npx playwright install chromium`). Format changes need representative import/export round trips; native changes need an appropriate Tauri smoke test. Documentation-only changes can be checked through link inspection and `git diff --check`. The full process and change-specific checks are in [the verification guide](docs/architecture/verification.md); see also [theme architecture](docs/architecture/theme.md).

## Open a sequence from a URL

VibeGene can open a remote sequence file using the `url` query parameter:

```text
https://vibe-gene.com/?url=https%3A%2F%2Fexample.org%2Fplasmids%2FpDemo.dna
```

Encode the complete file URL with `encodeURIComponent`. Remote files are limited to 100 MB. In the web app, the file server must permit cross-origin downloads; desktop uses its native HTTP client. You can also use **File → Generate link…** to create a link in the app.
