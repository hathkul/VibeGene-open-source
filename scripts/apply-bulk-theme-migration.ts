#!/usr/bin/env node
/**
 * Mechanical token replacement for bulk-plan generic-ui and semantic-feedback groups.
 * Skips findings when replacement would be ambiguous (non-whole value, scientific, etc.).
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { normalizeCssValue } from './plan-theme-migration.ts'

const ROOT = resolve(import.meta.dirname, '..')
const MANIFEST_PATH = resolve(import.meta.dirname, 'theme-debt-manifest.json')
const PLAN_PATH = resolve(import.meta.dirname, 'bulk-theme-groups.json')

type ManifestFinding = { id: string; file: string; owner: string; property: string; literal: string }
type BulkPlan = {
  groups: Array<{ outcome: string; destinationToken: string; findingIds: string[]; rationale: string; groupId: string }>
}

function replaceDeclarationValue(source: string, owner: string, property: string, fromLiteral: string, token: string): { next: string; changed: boolean } {
  const selector = new RegExp(`(?:^|\\n)([ \\t]*${owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*\\{)`, 'm')
  const match = selector.exec(source)
  if (!match?.index && match?.index !== 0) return { next: source, changed: false }
  const open = source.indexOf('{', match.index)
  let depth = 0
  let close = -1
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) {
        close = i
        break
      }
    }
  }
  if (close < 0) return { next: source, changed: false }
  const body = source.slice(open + 1, close)
  const decl = new RegExp(`((?:^|;)\\s*${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*)([^;{}]+)`, 'm')
  const dm = decl.exec(body)
  if (!dm) return { next: source, changed: false }
  const value = normalizeCssValue(dm[2]!)
  const target = normalizeCssValue(fromLiteral)
  if (value !== target) return { next: source, changed: false }
  const replacement = `${dm[1]!}var(${token})`
  const newBody = body.replace(decl, replacement)
  const next = source.slice(0, open + 1) + newBody + source.slice(close)
  return { next, changed: true }
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { findings: ManifestFinding[] }
  const plan = JSON.parse(await readFile(PLAN_PATH, 'utf8')) as BulkPlan
  const byId = new Map(manifest.findings.map((f) => [f.id, f]))
  const migrateIds = new Set<string>()
  for (const group of plan.groups) {
    if (group.outcome === 'generic-ui' || group.outcome === 'semantic-feedback') {
      for (const id of group.findingIds) migrateIds.add(id)
    }
  }

  const fileCache = new Map<string, string>()
  let applied = 0
  const refused: string[] = []

  for (const id of migrateIds) {
    const f = byId.get(id)
    const group = plan.groups.find((g) => g.findingIds.includes(id))
    if (!f || !group?.destinationToken) continue
    const filePath = resolve(ROOT, f.file)
    if (!fileCache.has(f.file)) fileCache.set(f.file, await readFile(filePath, 'utf8'))
    const source = fileCache.get(f.file)!
    const { next, changed } = replaceDeclarationValue(source, f.owner, f.property, f.literal.trim(), group.destinationToken)
    if (!changed) {
      refused.push(`${id}:${f.owner}:${f.property}:${f.literal}`)
      continue
    }
    fileCache.set(f.file, next)
    applied += 1
  }

  for (const [file, content] of fileCache) {
    await writeFile(resolve(ROOT, file), content, 'utf8')
  }

  console.log('applied', applied, 'refused', refused.length)
  if (refused.length > 0) console.log('refused sample', refused.slice(0, 10))
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
