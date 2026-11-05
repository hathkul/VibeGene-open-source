import { beforeAll, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { assertNoSelfReferentialTokenFallbacks, assertThemeMigrationAppliedContracts, assertThemeMigrationShadowContracts, buildThemeMigrationPlan, parseBaseThemeTokens, readThemeMigrationLedger, validateApprovalIds, validateThemeMigrationLedger, type ThemeMigrationPlan } from './plan-theme-migration.ts'

let sharedPlan: ThemeMigrationPlan

beforeAll(async () => {
  sharedPlan = await buildThemeMigrationPlan()
}, 60_000)

describe('theme migration planner', () => {
  it('reads only non-startup base-palette tokens and preserves duplicate values', () => {
    const tokens = parseBaseThemeTokens(`
      :root { --panel: #fffdf8; --first: #fff; --second: #fff; --alias: var(--panel); --startup-ink: #111; }
      :root[data-color-scheme='dark'] { --panel: #182333; }
    `)
    expect(tokens).toEqual([
      { name: '--panel', value: '#fffdf8', source: 'src/index.css' },
      { name: '--first', value: '#fff', source: 'src/index.css' },
      { name: '--second', value: '#fff', source: 'src/index.css' },
    ])
  })

  it('produces deterministic high-confidence and ambiguous groups for App.css', async () => {
    const plan = sharedPlan
    const manifest = JSON.parse(await readFile(new URL('./theme-debt-manifest.json', import.meta.url), 'utf8')) as { findings: unknown[] }
    expect(plan.version).toBe(1)
    expect(plan.summary.rawFindings).toBe(manifest.findings.length)
    expect(plan.findings.some((finding) => finding.owner.includes('protein-bond-track.is-other') && finding.after?.includes('var(--text)'))).toBe(false)
    expect(plan.applied.app.count).toBe(424)
    expect(plan.applied.app.removalCount).toBe(229)
    expect(plan.applied.pickPrimers.count).toBe(33)
    expect(plan.applied.pickPrimers.removeCount).toBe(31)
    expect(plan.applied.pickPrimers.replaceCount).toBe(2)
    expect(plan.applied.app.evidence).toHaveLength(37)
    expect(plan.summary.excluded).toBe(manifest.findings.length)
    expect(plan.summary.ambiguous).toBe(0)
    expect(plan.findings.some((finding) => /protein-map|protein-alignment/.test(finding.owner))).toBe(false)
    expect(plan.findings.some((finding) => finding.owner.includes('protein-bond-track.is-other'))).toBe(false)
    expect(plan.groups).toEqual([...plan.groups].sort((left, right) =>
      left.file.localeCompare(right.file) || left.owner.localeCompare(right.owner) || left.property.localeCompare(right.property) || left.literal.localeCompare(right.literal)))
  })

  it('retains the explicit neutral chrome tranche as the authority after application', async () => {
    const reviewedIds = [
      '5795ea80956bf1c8', '4db14abf8fed99dc', 'b8397a89a9b85753', 'f7792cce8d7fd896', '0e0e041d7909ae70',
      'b009fa9cb5d1d550', '177b2b9e1dc657e1', 'cc4bf46217089690', 'd343ccaa7afd367a',
      '887cae53250fa8e1', '2c3f8afc809e061a', '100d6e02befd850c', '81d30898ecc1e307',
      '30c55464eb173546', '21786481952c6398', '73d31f6fc9dd1a6b', 'e6224a54d184878d',
      'cf202002217ffb99', '262b7ca5365f0054', 'cd8e95d1900d23be', '8013b54949bf8038',
      '4e366bf8f66fe21d', '19bba29250d66d48', '004a2c2e00013ceb', '74a3870fbc74f1a8',
    ]
    const ledger = await readThemeMigrationLedger()
    const selected = ledger.app.entries.filter((entry) => reviewedIds.includes(entry.id))
    expect(selected).toHaveLength(25)
    expect(new Set(selected.map((entry) => entry.token))).toEqual(new Set(['--app-field', '--app-button-top', '--app-button-bottom']))
    expect(sharedPlan.findings.some((finding) => reviewedIds.includes(finding.id))).toBe(false)
    expect(sharedPlan.applied.app.count).toBe(424)
  })

  it('matches the committed report byte-for-byte and rejects self-referential fallbacks', async () => {
    expect(await readFile(new URL('./theme-migration-plan.json', import.meta.url), 'utf8')).toBe(`${JSON.stringify(sharedPlan, null, 2)}\n`)
    expect(() => assertNoSelfReferentialTokenFallbacks('color: var(--accent, var(--accent));')).toThrow(/self-referential/)
    expect(() => assertNoSelfReferentialTokenFallbacks('color: var(--accent);')).not.toThrow()
  })

  it('locks the eight applied declarations after their raw findings disappear', async () => {
    const source = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
    const ledger = await readThemeMigrationLedger()

    const wrongToken = structuredClone(ledger)
    wrongToken.app.entries.find((entry) => entry.id === 'cf202002217ffb99')!.token = '--app-panel'
    expect(() => validateThemeMigrationLedger(wrongToken)).toThrow(/invalid post-migration contract/)

    const fallbackChain = structuredClone(ledger)
    fallbackChain.app.entries.find((entry) => entry.id === 'd03f59e444df45a6')!.postMigration!.currentValue = '1px solid var(--border, var(--vg-border))'
    expect(() => validateThemeMigrationLedger(fallbackChain)).toThrow(/invalid post-migration contract/)

    const wrongAnchor = structuredClone(ledger)
    wrongAnchor.app.entries.find((entry) => entry.id === 'cf202002217ffb99')!.postMigration!.currentAnchor = '0000000000000000'
    expect(() => assertThemeMigrationAppliedContracts(source, wrongAnchor)).toThrow(/declaration drift/)

    const wrongOwner = structuredClone(ledger)
    wrongOwner.app.entries.find((entry) => entry.id === 'cf202002217ffb99')!.postMigration!.currentOwner = '.moved-surface'
    expect(() => assertThemeMigrationAppliedContracts(source, wrongOwner)).toThrow(/post-migration declaration count drift/)

    const duplicateDeclaration = source.replace(
      '  background: var(--app-field);\n  margin-bottom: 12px;',
      '  background: var(--app-field);\n  background: var(--app-panel);\n  margin-bottom: 12px;',
    )
    expect(() => assertThemeMigrationAppliedContracts(duplicateDeclaration, ledger)).toThrow(/post-migration declaration count drift/)
  })

  it('locks every reviewed dead declaration to its exact cascade winner', async () => {
    const source = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
    const ledger = await readThemeMigrationLedger()
    expect(ledger.app.removals).toHaveLength(229)
    expect(new Set(ledger.app.removals.map((entry) => entry.id)).size).toBe(229)
    expect(ledger.app.removals.filter((entry) => entry.shadowedBy.mode === 'db-same-selector')).toHaveLength(14)
    expect(ledger.app.removals.every((entry) => entry.shadowedBy.contexts.includes('beige') && entry.shadowedBy.contexts.includes('bright') && entry.shadowedBy.contexts.includes('dark'))).toBe(true)

    const wrongWinner = structuredClone(ledger)
    wrongWinner.app.removals[0]!.shadowedBy.value = 'var(--app-panel)'
    expect(() => assertThemeMigrationShadowContracts(source, wrongWinner.app.removals, { allowRemoved: true })).toThrow(/winner declaration drift/)

    const wrongAnchor = structuredClone(ledger)
    wrongAnchor.app.removals[0]!.shadowedBy.anchor = '0000000000000000'
    expect(() => assertThemeMigrationShadowContracts(source, wrongAnchor.app.removals, { allowRemoved: true })).toThrow(/winner identity drift/)

    const contextGap = structuredClone(ledger)
    contextGap.app.removals[0]!.shadowedBy.contexts = ['beige', 'bright', 'dark']
    expect(() => validateThemeMigrationLedger(contextGap)).toThrow(/context coverage/)

    const relationDrift = structuredClone(ledger)
    relationDrift.app.removals[0]!.shadowedBy.mode = 'db-same-selector'
    expect(() => validateThemeMigrationLedger(relationDrift)).toThrow(/DB shadow relation/)

    const duplicate = structuredClone(ledger)
    duplicate.app.removals.push(structuredClone(duplicate.app.removals[0]))
    expect(() => validateThemeMigrationLedger(duplicate)).toThrow(/duplicate or empty/)

    const first = ledger.app.removals[0]!
    const restored = `${first.owner} {\n  ${first.property}: ${first.literal};\n}\n${source}`
    const wrongSourceAnchor = structuredClone(ledger)
    wrongSourceAnchor.app.removals[0]!.sourceAnchor = '0000000000000000'
    expect(() => assertThemeMigrationShadowContracts(restored, [wrongSourceAnchor.app.removals[0]!], { allowRemoved: false })).toThrow(/source identity drift/)
    expect(() => assertThemeMigrationShadowContracts(restored, [ledger.app.removals[0]!], { allowRemoved: false })).not.toThrow()

    const duplicateWinner = `${source}\n${first.shadowedBy.selector} {\n  ${first.shadowedBy.property}: ${first.shadowedBy.value};\n}\n`
    expect(() => assertThemeMigrationShadowContracts(duplicateWinner, [first], { allowRemoved: true })).toThrow(/winner rule count drift/)
  })

  it('keeps color-scheme initialization before the first React mount', async () => {
    const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
    expect(main.indexOf('initializeColorScheme()')).toBeGreaterThanOrEqual(0)
    expect(main.indexOf('initializeColorScheme()')).toBeLessThan(main.indexOf('createRoot(document'))
  })

  it('rejects duplicate, stale, ambiguous, and excluded approval IDs', async () => {
    const plan = sharedPlan
    const ambiguous = {
      id: 'synthetic-ambiguous-finding',
      file: 'src/App.css',
      kind: 'css' as const,
      line: 1,
      owner: '.example-chrome',
      property: 'color',
      literal: '#ffffff',
      candidates: ['--panel', '--app-field'],
      proposedToken: null,
      evidenceCategory: 'ambiguous-existing-tokens' as const,
      beigePrior: '#ffffff',
      beigeEffective: '#ffffff',
      beigeTarget: null,
      brightTarget: null,
      darkTarget: null,
      confidence: 'ambiguous' as const,
      before: 'color: #ffffff;',
      after: null,
      reason: 'Synthetic ambiguous row for approval validation.',
    }
    const high = { ...ambiguous, confidence: 'high' as const, proposedToken: '--muted' }
    const approvalPlan = { ...plan, findings: [high] }
    expect(() => validateApprovalIds(approvalPlan, [high.id, high.id])).toThrow(/duplicate approved/)
    expect(() => validateApprovalIds(plan, ['missing-id'])).toThrow(/unknown or stale/)
    expect(() => validateApprovalIds({ ...plan, findings: [ambiguous] }, [ambiguous.id])).toThrow(/not a high-confidence/)
    expect(() => validateApprovalIds(plan, ['excluded-id'])).toThrow(/unknown or stale/)
  })
})
