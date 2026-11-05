import { describe, expect, it } from 'vitest'
import { validateReviewedManifestDelta } from './accept-theme-debt-manifest.ts'
import type { ThemeMigrationLedger } from './plan-theme-migration.ts'
import type { ThemeFinding } from './check-theme-colors.ts'

const finding = (id: string): ThemeFinding => ({
  id,
  file: 'src/App.css',
  line: 1,
  kind: 'css',
  property: 'color',
  literal: '#475569',
  reason: 'literal in theme-sensitive color',
  excerpt: 'color: #475569',
  locator: { owner: '.ordinary-ui', anchor: id },
})

const manifestRow = (value: ThemeFinding) => ({
  id: value.id,
  file: value.file,
  kind: value.kind,
  property: value.property,
  literal: value.literal,
  locator: value.locator,
  owner: value.locator.owner,
  classification: 'needs-review' as const,
  rationale: `Reviewed unresolved theme debt in ${value.file} owner ${value.locator.owner}; retain the literal until its UI/data ownership is migrated.`,
  reviewStatus: 'reviewed' as const,
})

const emptyLedger = (entries: ThemeMigrationLedger['app']['entries'] = []): ThemeMigrationLedger => ({
  version: 1,
  generatedBy: 'test',
  app: { count: entries.length, entries, removals: [], anchorRows: [], retainedRows: [], evidence: [] },
  pickPrimers: { count: 0, entries: [] },
})

const anchorLedger = (targetId = 'target', targetAnchor = 'target-anchor'): ThemeMigrationLedger => ({
  ...emptyLedger(),
  app: {
    ...emptyLedger().app,
    anchorRows: [{
      id: 'source',
      file: 'src/App.css',
      kind: 'css',
      owner: '.ordinary-ui',
      property: 'color',
      literal: '#475569',
      action: 'anchor-drift',
      target: {
        id: targetId,
        file: 'src/App.css',
        kind: 'css',
        owner: '.ordinary-ui',
        property: 'color',
        literal: '#475569',
        anchor: targetAnchor,
      },
    }],
  },
})

describe('guarded theme manifest acceptance', () => {
  it('refuses a stale manifest row that is absent from the explicit ledger', () => {
    const live = finding('live')
    const stale = finding('stale')
    const manifest = { version: 1 as const, generatedBy: 'test', findings: [manifestRow(live), manifestRow(stale)] }
    expect(() => validateReviewedManifestDelta(manifest, [live], emptyLedger())).toThrow(/unlisted stale manifest row stale/)
  })

  it('refuses a listed migration that is still present in raw findings', () => {
    const live = finding('still-present')
    const entry = { id: live.id, file: live.file, kind: live.kind, owner: live.locator.owner, property: live.property, literal: live.literal, token: '--text' }
    const manifest = { version: 1 as const, generatedBy: 'test', findings: [manifestRow(live)] }
    expect(() => validateReviewedManifestDelta(manifest, [live], emptyLedger([entry]))).toThrow(/still present/)
  })

  it('accepts only the pinned anchor target ID and locator anchor', () => {
    const source = finding('source')
    const target = { ...finding('target'), locator: { owner: '.ordinary-ui', anchor: 'target-anchor' } }
    const manifest = { version: 1 as const, generatedBy: 'test', findings: [manifestRow(source)] }
    expect(validateReviewedManifestDelta(manifest, [target], anchorLedger()).removedIds).toEqual(['source'])
    expect(() => validateReviewedManifestDelta(manifest, [target], anchorLedger('different-target'))).toThrow(/missing expected anchor target/)
    expect(() => validateReviewedManifestDelta(manifest, [target], anchorLedger('target', 'different-anchor'))).toThrow(/anchor target identity drift/)
  })
})
