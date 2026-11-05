# Theme architecture

VibeGene supports Beige, Bright, and Dark schemes. Theme work preserves semantic roles and scientific meaning; historical byte-for-byte shades are not a requirement.

## Ordinary interface chrome

Ordinary text, panels, controls, borders, interaction states, focus, feedback, overlays, and shadows use semantic `--vg-*` roles defined in `src/index.css`.

- Reuse the role that describes the UI purpose, not the closest-looking color.
- Compound paint—gradients, layered shadows, scrims, and alpha-bearing surfaces—is represented as a whole named declaration.
- Do not introduce one-off literals in component CSS.
- A new token requires a distinct recurring role with at least two genuine owners and scheme-specific values.

## Scientific and data paint

Scientific colors encode biological or analytical meaning: nucleotide/residue classes, primers, traces, map annotations, gel bands, frameshifts, compatibility states, and similar marks.

Raw scientific values are allowed only when all of the following hold:

- the owner and property are specific to a scientific/data encoding;
- contrast and category/state distinctions remain usable in all schemes;
- `scripts/theme-scientific-color-registry.json` contains the exact file, owner, property, literal, and a scoped biological rationale;
- `scripts/theme-debt-manifest.json` contains the matching reviewed `scientific-data` row.

Generic reasons, wildcard owners, ordinary chrome, and stale declarations are rejected. `scripts/theme-scientific-encoding-extensions.json` is migration history, not an exemption registry.

## Enforcement

- `npm run check:theme` allows semantic token definitions and live scientific registry rows; ordinary literal debt is zero.
- `npm run check:theme-debt` requires the raw inventory, debt manifest, and scientific registry to agree exactly.
- Test fixture colors come from `src/test-support/themeFixturePalette.ts`; production code must not import test support.
- Runtime sample biology remains domain-owned in `src/domain/fixtures.ts`.

Do not use `check:theme` success as proof of visual correctness. It proves ownership, not readability or winning cascade behavior.

For control sizing, overflow, responsive behavior, and visual verification, see the [interface layout guidelines](../interface-layout.md).

## Efficient change workflow

1. Identify the live element and winning declaration using computed style. Do not edit a similarly named shadowed rule.
2. Classify the paint as ordinary semantic chrome or scientific/data encoding.
3. Make the smallest source change and update registry/manifest rows only when scientifically justified.
4. Run focused static/theme tests while iterating.
5. Run the full browser matrix once after the tranche or bug fix is stable.

`npm run plan:theme-migration` is read-only. Migration ledgers authorize only the reviewed IDs they contain; apply/accept steps fail closed on unknown, stale, duplicate, drifted, or still-present findings.

## Browser evidence

`npm run test:theme-ui` runs the pinned Playwright matrix against Vite at desktop and touch-mobile sizes in Beige, Bright, and Dark. `theme-audit.html` mounts the static `src/theme/ThemeAudit.tsx` fixture and imports production CSS in application order.

This matrix proves the audited cascade, responsive rules, and contrast assertions. It does not prove Tauri behavior or every scientific renderer. For renderer bugs, also reproduce the actual map, sequence, trace, primer, cloning, or gel surface that owns the paint.
