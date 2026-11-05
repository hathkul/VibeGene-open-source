#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { normalizeCssValue } from './plan-theme-migration.ts'
import type { ManifestRow } from './compound-paint-declarations.ts'

const ROOT = resolve(import.meta.dirname, '..')
const PLAN_PATH = resolve(import.meta.dirname, 'compound-paint-groups.json')
const MANIFEST_PATH = resolve(import.meta.dirname, 'theme-debt-manifest.json')

type CompoundClass =
  | 'generic-gradient'
  | 'generic-translucent-surface'
  | 'overlay-or-scrim'
  | 'elevation-or-shadow'
  | 'scheme-override'
  | 'generic-diagram-chrome'
  | 'dead-or-shadowed'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function blockEnd(source: string, open: number): number {
  let depth = 0
  let quote: string | null = null
  for (let index = open; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (character === quote && source[index - 1] !== '\\') quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '/' && source[index + 1] === '*') {
      const commentEnd = source.indexOf('*/', index + 2)
      if (commentEnd < 0) return -1
      index = commentEnd + 1
      continue
    }
    if (character === '{') depth += 1
    if (character === '}' && --depth === 0) return index
  }
  return -1
}

function ownerParts(owner: string): string[] {
  return owner.includes(',') ? owner.split(',').map((part) => part.trim()).filter(Boolean) : [owner.trim()]
}

function replaceDeclarationContainingLiteral(
  source: string,
  owner: string,
  property: string,
  literal: string,
  replacement: string,
): { next: string; changed: boolean } {
  for (const singleOwner of ownerParts(owner)) {
    const selector = new RegExp(`(?:^|\\n)[ \\t]*${escapeRegExp(singleOwner)}[ \\t]*\\{`, 'g')
    for (const match of source.matchAll(selector)) {
      const open = source.indexOf('{', match.index ?? 0)
      const close = blockEnd(source, open)
      if (open < 0 || close < 0) continue
      const body = source.slice(open + 1, close)
      const declarationPattern = new RegExp(`((?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*)([^;{}]+)`, 'gm')
      let changed = false
      const newBody = body.replace(declarationPattern, (full, prefix: string, value: string) => {
        if (!normalizeCssValue(value).toLowerCase().includes(literal.trim().toLowerCase())) return full
        changed = true
        return `${prefix}${replacement}`
      })
      if (changed) {
        const next = source.slice(0, open + 1) + newBody + source.slice(close)
        return { next, changed: true }
      }
    }
  }
  return { next: source, changed: false }
}

function removeDeclarationContainingLiteral(source: string, owner: string, property: string, literal: string): { next: string; changed: boolean } {
  for (const singleOwner of ownerParts(owner)) {
    const selector = new RegExp(`(?:^|\\n)[ \\t]*${escapeRegExp(singleOwner)}[ \\t]*\\{`, 'g')
    for (const match of source.matchAll(selector)) {
      const open = source.indexOf('{', match.index ?? 0)
      const close = blockEnd(source, open)
      if (open < 0 || close < 0) continue
      const body = source.slice(open + 1, close)
      const declarationPattern = new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*[^;{}]+;?`, 'gm')
      let removed = false
      const newBody = body.replace(declarationPattern, (full) => {
        const valueMatch = /:\s*([^;{}]+)/.exec(full)
        if (!valueMatch || !normalizeCssValue(valueMatch[1]!).toLowerCase().includes(literal.trim().toLowerCase())) return full
        removed = true
        return ''
      })
      if (removed) {
        const next = source.slice(0, open + 1) + newBody + source.slice(close)
        return { next, changed: true }
      }
    }
  }
  return { next: source, changed: false }
}

async function main(): Promise<void> {
  const classes = process.argv.slice(2).flatMap((arg) => arg.split(',')) as CompoundClass[]
  if (classes.length === 0) throw new Error('Pass compound classes to migrate, e.g. generic-gradient,scheme-override')

  const plan = JSON.parse(await readFile(PLAN_PATH, 'utf8')) as {
    groups: Array<{
      compoundClass: CompoundClass
      migrate: boolean
      destinationToken: string
      property: string
      literal: string
      fullDeclarationValue?: string
      findingIds: string[]
      owners: string[]
    }>
  }
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { findings: ManifestRow[] }
  const byId = new Map(manifest.findings.map((row) => [row.id, row]))
  const fileCache = new Map<string, string>()
  let applied = 0
  const refused: string[] = []

  for (const group of plan.groups) {
    if (!group.migrate || !classes.includes(group.compoundClass)) continue
    for (const id of group.findingIds) {
      const row = byId.get(id)
      if (!row) continue
      const filePath = resolve(ROOT, row.file)
      if (!fileCache.has(row.file)) fileCache.set(row.file, await readFile(filePath, 'utf8'))
      const source = fileCache.get(row.file)!
      const literal = row.literal.trim()
      if (group.compoundClass === 'dead-or-shadowed') {
        const { next, changed } = removeDeclarationContainingLiteral(source, row.owner, row.property, literal)
        if (!changed) {
          refused.push(`${id}:dead-remove`)
          continue
        }
        fileCache.set(row.file, next)
        applied += 1
        continue
      }
      const token = group.destinationToken
      if (!token.startsWith('--')) {
        refused.push(`${id}:missing-token`)
        continue
      }
      const replacement = `var(${token})`
      const { next, changed } = replaceDeclarationContainingLiteral(source, row.owner, row.property, literal, replacement)
      if (!changed) {
        refused.push(`${id}:${row.owner}:${row.property}:${literal}`)
        continue
      }
      fileCache.set(row.file, next)
      applied += 1
    }
  }

  for (const [file, contents] of fileCache) {
    await writeFile(resolve(ROOT, file), contents, 'utf8')
  }

  console.log('applied', applied)
  console.log('refused', refused.length)
  if (refused.length > 0) console.log(refused.slice(0, 20).join('\n'))
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
