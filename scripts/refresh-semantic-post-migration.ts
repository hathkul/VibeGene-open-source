#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { scanProject } from './check-theme-colors.ts'
import {
  findThemeMigrationDeclarations,
  normalizeCssValue,
  validateThemeMigrationLedger,
  type ThemeMigrationLedger,
} from './plan-theme-migration.ts'

const ROOT = resolve(import.meta.dirname, '..')

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function main(): Promise<void> {
  const tranche = JSON.parse(await readFile(resolve(import.meta.dirname, 'semantic-palette-tranche.json'), 'utf8')) as {
    rows: Array<{ id: string; file: string; owner: string; property: string; literal: string; token: string }>
  }
  const manifest = JSON.parse(await readFile(resolve(ROOT, 'scripts/theme-debt-manifest.json'), 'utf8')) as {
    findings: Array<{ id: string; locator: { anchor: string } }>
  }
  const anchorById = new Map(manifest.findings.map((finding) => [finding.id, finding.locator.anchor]))
  const ledger = JSON.parse(await readFile(resolve(ROOT, 'scripts/theme-migration-ledger.json'), 'utf8')) as ThemeMigrationLedger
  const appCss = await readFile(resolve(ROOT, 'src/App.css'), 'utf8')
  const rawBefore = await scanProject({ rootDir: ROOT, mode: 'raw' })
  const rawAnchorById = new Map(rawBefore.map((finding) => [finding.id, finding.locator.anchor]))

  for (const row of tranche.rows.filter((entry) => entry.file === 'src/App.css')) {
    const entry = ledger.app.entries.find((candidate) => candidate.id === row.id)
    if (!entry) throw new Error(`missing ledger entry ${row.id}`)
    const tokenRef = normalize(`var(${row.token})`)
    const owners = row.owner.includes(',') ? row.owner.split(',').map((part) => part.trim()) : [row.owner]
    let matches = findThemeMigrationDeclarations(appCss, row.owner, row.property, row.file)
    if (matches.length === 0 && owners.length > 1) {
      matches = owners.flatMap((owner) => findThemeMigrationDeclarations(appCss, owner, row.property, row.file))
    }
    const currentOccurrence = matches.findIndex((match) => normalizeCssValue(match.value).includes(tokenRef))
    const current = matches[currentOccurrence]
    if (!current) throw new Error(`missing migrated declaration ${row.id}`)
    entry.postMigration = {
      sourceAnchor:
        anchorById.get(row.id)
        ?? rawAnchorById.get(row.id)
        ?? createHash('sha1').update([row.file, 'css', row.owner, row.property, row.literal, 0].join('|')).digest('hex').slice(0, 16),
      currentOwner: row.owner,
      currentProperty: row.property,
      currentValue: normalizeCssValue(current.value),
      currentAnchor: current.anchor,
      currentOccurrence,
      currentMatchCount: matches.length,
      currentRuleCount: current.ruleCount,
    }
  }

  validateThemeMigrationLedger(ledger)
  await writeFile(resolve(ROOT, 'scripts/theme-migration-ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`)
  console.log(`Refreshed postMigration for ${tranche.rows.filter((row) => row.file === 'src/App.css').length} App.css semantic rows.`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
