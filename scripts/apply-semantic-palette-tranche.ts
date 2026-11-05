#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { scanProject } from './check-theme-colors.ts'
import {
  applyApprovedThemeMigration,
  buildThemeMigrationPlan,
  findThemeMigrationDeclarations,
  readThemeMigrationLedger,
  validateThemeMigrationLedger,
  type ThemeMigrationLedger,
} from './plan-theme-migration.ts'

const ROOT = resolve(import.meta.dirname, '..')
const TRANCHE_PATH = resolve(import.meta.dirname, 'semantic-palette-tranche.json')
const INDEX_CSS = resolve(ROOT, 'src/index.css')

type TrancheRow = {
  id: string
  file: string
  owner: string
  property: string
  literal: string
  line: number
  role: string
  token: string
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseVgDefinitions(source: string): Map<string, string> {
  const block = source.split(':root[data-color-scheme')[0] ?? source
  const defs = new Map<string, string>()
  for (const match of block.matchAll(/(--vg-[\w-]+)\s*:\s*([^;{}]+);/g)) {
    defs.set(match[1]!, normalize(match[2]!))
  }
  return defs
}

function parseVgAliases(source: string): Map<string, string> {
  const aliases = new Map<string, string>()
  for (const [name, value] of parseVgDefinitions(source)) {
    const match = /^var\((--[\w-]+)\)$/.exec(value)
    if (match) aliases.set(name, match[1]!)
  }
  return aliases
}

function schemeValues(source: string, tokenNames: string[]): Map<string, { beige: string; bright: string | null; dark: string | null }> {
  const beigeRoot = source.split(":root[data-color-scheme")[0] ?? source
  const result = new Map<string, { beige: string; bright: string | null; dark: string | null }>()
  for (const name of tokenNames) {
    const beigeMatch = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;{}]+);`).exec(beigeRoot)
    const beige = beigeMatch ? normalize(beigeMatch[1]!) : ''
    let bright: string | null = null
    let dark: string | null = null
    for (const scheme of ['bright', 'dark'] as const) {
      const start = source.indexOf(`:root[data-color-scheme='${scheme}']`)
      const end = source.indexOf(':root[data-color-scheme=', start + 1)
      const block = source.slice(start, end < 0 ? source.length : end)
      const match = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;{}]+);`).exec(block)
      if (scheme === 'bright') bright = match ? normalize(match[1]!) : null
      else dark = match ? normalize(match[1]!) : null
    }
    result.set(name, { beige, bright, dark })
  }
  return result
}

function buildVgEvidence(indexSource: string, tokens: string[]): ThemeMigrationLedger['app']['evidence'] {
  const aliases = parseVgAliases(indexSource)
  const defs = parseVgDefinitions(indexSource)
  const underlying = [...new Set(tokens.map((token) => aliases.get(token)).filter(Boolean) as string[])]
  const resolved = schemeValues(indexSource, underlying)
  return tokens.map((token) => {
    const definition = defs.get(token)
    if (!definition) throw new Error(`missing --vg definition for ${token}`)
    const base = aliases.get(token)
    if (!base) {
      return {
        token,
        beigePrior: [],
        beigeEffective: definition,
        beigeTarget: `var(${token})`,
        brightTarget: definition,
        darkTarget: definition,
      }
    }
    const schemes = resolved.get(base)
    if (!schemes?.beige) throw new Error(`missing beige value for ${base} (${token})`)
    return {
      token,
      beigePrior: [],
      beigeEffective: schemes.beige,
      beigeTarget: `var(${token})`,
      brightTarget: schemes.bright,
      darkTarget: schemes.dark,
    }
  })
}

async function main(): Promise<void> {
  const tranche = JSON.parse(await readFile(TRANCHE_PATH, 'utf8')) as { rows: TrancheRow[] }
  const rows = tranche.rows

  const ledger = await readThemeMigrationLedger(ROOT)
  const indexSource = await readFile(INDEX_CSS, 'utf8')
  const tokensUsed = [...new Set(rows.map((row) => row.token))]
  const vgEvidence = buildVgEvidence(indexSource, tokensUsed)

  const appRows = rows.filter((row) => row.file === 'src/App.css')
  const pickRows = rows.filter((row) => row.file === 'src/PickPrimersDialog.css')

  for (const row of appRows) {
    if (ledger.app.entries.some((entry) => entry.id === row.id) || ledger.app.removals.some((entry) => entry.id === row.id)) {
      throw new Error(`ledger already owns ${row.id}`)
    }
    ledger.app.entries.push({
      id: row.id,
      file: row.file,
      kind: 'css',
      owner: row.owner,
      property: row.property,
      literal: row.literal,
      token: row.token,
    })
  }
  ledger.app.count = ledger.app.entries.length

  for (const row of pickRows) {
    const existing = ledger.pickPrimers.entries.find((entry) => entry.id === row.id)
    if (existing) {
      existing.action = 'replace'
      existing.token = row.token
      delete (existing as { literal?: string }).literal
    } else {
      ledger.pickPrimers.entries.push({
        id: row.id,
        file: row.file,
        kind: 'css',
        owner: row.owner,
        property: row.property,
        literal: row.literal,
        action: 'replace',
        token: row.token,
      })
    }
  }
  ledger.pickPrimers.count = ledger.pickPrimers.entries.length

  const evidenceByToken = new Map(ledger.app.evidence.map((entry) => [entry.token, entry]))
  for (const entry of vgEvidence) {
    if (!evidenceByToken.has(entry.token)) ledger.app.evidence.push(entry)
  }

  const rawBefore = await scanProject({ rootDir: ROOT, mode: 'raw' })
  const anchorById = new Map(rawBefore.map((finding) => [finding.id, finding.locator.anchor]))

  validateThemeMigrationLedger(ledger)
  await writeFile(resolve(ROOT, 'scripts/theme-migration-ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')

  const plan = await buildThemeMigrationPlan({ rootDir: ROOT })
  const appIds = appRows.map((row) => row.id)
  if (appIds.length) await applyApprovedThemeMigration(plan, appIds, ROOT)

  if (pickRows.length) {
    const cssPath = resolve(ROOT, 'src/PickPrimersDialog.css')
    const source = await readFile(cssPath, 'utf8')
    const lines = source.split('\n')
    for (const row of pickRows) {
      const line = lines[row.line - 1]
      if (!line?.includes(row.literal)) throw new Error(`PickPrimers drift ${row.id}`)
      lines[row.line - 1] = line.replace(row.literal, `var(${row.token})`)
    }
    await writeFile(cssPath, lines.join('\n'), 'utf8')
  }

  const updatedLedger = await readThemeMigrationLedger(ROOT)
  for (const row of appRows) {
    const entry = updatedLedger.app.entries.find((candidate) => candidate.id === row.id)!
    const appCss = await readFile(resolve(ROOT, 'src/App.css'), 'utf8')
    const tokenRef = normalize(`var(${row.token})`)
    const owners = row.owner.includes(',') ? row.owner.split(',').map((part) => part.trim()) : [row.owner]
    let current
    for (const owner of owners) {
      const matches = findThemeMigrationDeclarations(appCss, owner, row.property, row.file)
      current = matches.find((match) => normalize(match.value) === tokenRef || normalize(match.value).includes(tokenRef))
      if (current) break
    }
    if (!current) throw new Error(`missing post-migration declaration for ${row.id}`)
    entry.postMigration = {
      sourceAnchor: anchorById.get(row.id) ?? createHash('sha1').update([row.file, 'css', row.owner, row.property, row.literal, 0].join('|')).digest('hex').slice(0, 16),
      currentOwner: row.owner,
      currentProperty: row.property,
      currentValue: `var(${row.token})`,
      currentAnchor: current.anchor,
      currentOccurrence: current.occurrence,
      currentMatchCount: current.matchCount,
      currentRuleCount: current.ruleCount,
    }
  }
  validateThemeMigrationLedger(updatedLedger)
  await writeFile(resolve(ROOT, 'scripts/theme-migration-ledger.json'), `${JSON.stringify(updatedLedger, null, 2)}\n`, 'utf8')
  await writeFile(resolve(import.meta.dirname, 'semantic-palette-anchors.json'), `${JSON.stringify({ anchors: Object.fromEntries(appRows.map((row) => [row.id, anchorById.get(row.id)])) }, null, 2)}\n`, 'utf8')

  console.log(`Applied ${appRows.length} App.css and ${pickRows.length} PickPrimers semantic token migrations.`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
