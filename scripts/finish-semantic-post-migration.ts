#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { findThemeMigrationDeclarations, readThemeMigrationLedger, validateThemeMigrationLedger } from './plan-theme-migration.ts'

const ROOT = resolve(import.meta.dirname, '..')
const TRANCHE_PATH = resolve(import.meta.dirname, 'semantic-palette-tranche.json')

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function main(): Promise<void> {
  const tranche = JSON.parse(await readFile(TRANCHE_PATH, 'utf8')) as { rows: Array<{ id: string; file: string; owner: string; property: string; token: string }> }
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'scripts/theme-debt-manifest.json'), 'utf8')) as { findings: Array<{ id: string; locator: { anchor: string } }> }
  const anchorById = new Map(manifest.findings.map((finding) => [finding.id, finding.locator.anchor]))
  const ledger = await readThemeMigrationLedger(ROOT)
  const appCss = await readFile(resolve(ROOT, 'src/App.css'), 'utf8')
  let updated = 0
  for (const row of tranche.rows.filter((entry) => entry.file === 'src/App.css')) {
    const entry = ledger.app.entries.find((candidate) => candidate.id === row.id)
    if (!entry || entry.postMigration) continue
    const tokenRef = normalize(`var(${row.token})`)
    const owners = row.owner.includes(',') ? row.owner.split(',').map((part) => part.trim()) : [row.owner]
    let current
    for (const owner of owners) {
      const matches = findThemeMigrationDeclarations(appCss, owner, row.property, row.file)
      current = matches.find((match) => normalize(match.value) === tokenRef)
      if (current) break
    }
    if (!current) throw new Error(`missing post-migration declaration for ${row.id}`)
    entry.postMigration = {
      sourceAnchor: anchorById.get(row.id) ?? '0000000000000000',
      currentOwner: row.owner,
      currentProperty: row.property,
      currentValue: `var(${row.token})`,
      currentAnchor: current.anchor,
      currentOccurrence: current.occurrence,
      currentMatchCount: current.matchCount,
      currentRuleCount: current.ruleCount,
    }
    updated += 1
  }
  validateThemeMigrationLedger(ledger)
  await writeFile(resolve(ROOT, 'scripts/theme-migration-ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')
  console.log(`Backfilled postMigration for ${updated} entries.`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
