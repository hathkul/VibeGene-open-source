#!/usr/bin/env node
/**
 * Static check: raw color literals in production styles must live in centralized
 * theme definitions, documented scientific encodings scoped to their owners, or
 * explicit bulk-plan exceptions scoped to their owners.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const BULK_PATH = resolve(import.meta.dirname, 'bulk-theme-groups.json')
const MANIFEST_PATH = resolve(import.meta.dirname, 'theme-debt-manifest.json')
const REGISTRY_PATH = resolve(import.meta.dirname, 'theme-scientific-color-registry.json')
const CONTRACT_PATH = resolve(import.meta.dirname, 'semantic-palette-contract.json')

const STYLE_EXT = new Set(['.css', '.scss', '.sass'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'tests', 'test-support'])

type BulkPlan = {
  groups: Array<{ outcome: string; findingIds: string[] }>
}

type ManifestFinding = {
  id: string
  file: string
  owner: string
  property: string
  literal: string
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) walk(path, out)
    else if (STYLE_EXT.has(name.slice(name.lastIndexOf('.')))) out.push(path)
  }
  return out
}

function normalizeLiteral(lit: string): string {
  return lit.replace(/\s+/g, ' ').trim().toLowerCase()
}

function normalizeOwner(owner: string): string {
  return owner.replace(/\s+/g, ' ').trim()
}

function scopeKey(file: string, owner: string, property: string, literal: string): string {
  return [file, normalizeOwner(owner), property, normalizeLiteral(literal)].join('|')
}

function matchingBrace(source: string, openIndex: number): number {
  let depth = 0
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

function walkCssRules(source: string, onRule: (selector: string, body: string) => void, start = 0, end = source.length): void {
  let i = start
  while (i < end) {
    while (i < end && /\s/.test(source[i]!)) i += 1
    if (i >= end) break
    if (source[i] === '@') {
      const open = source.indexOf('{', i)
      if (open < 0 || open >= end) break
      const close = matchingBrace(source, open)
      if (close < 0 || close >= end) break
      const prelude = source.slice(i, open).trim()
      if (/^@media\b/i.test(prelude)) {
        walkCssRules(source, onRule, open + 1, close)
      }
      i = close + 1
      continue
    }
    const open = source.indexOf('{', i)
    if (open < 0 || open >= end) break
    const selector = source.slice(i, open).trim()
    const close = matchingBrace(source, open)
    if (close < 0 || close >= end) break
    if (selector && !selector.startsWith('@')) onRule(selector, source.slice(open + 1, close))
    i = close + 1
  }
}

export function collectScopedExceptions(plan: BulkPlan, manifestById: Map<string, ManifestFinding>, registryIds: Set<string>): Set<string> {
  const allowed = new Set<string>()
  for (const group of plan.groups) {
    if (group.outcome !== 'scientific-data' && group.outcome !== 'special-exception') continue
    for (const id of group.findingIds) {
      const row = manifestById.get(id)
      if (!row) continue
      allowed.add(scopeKey(row.file, row.owner, row.property, row.literal))
    }
  }
  for (const id of registryIds) {
    const row = manifestById.get(id)
    if (!row) continue
    allowed.add(scopeKey(row.file, row.owner, row.property, row.literal))
  }
  return allowed
}

const COLOR_PROPERTIES = new Set(['color', 'background', 'background-color', 'border', 'border-color', 'outline', 'outline-color', 'fill', 'stroke', 'box-shadow', 'text-decoration-color'])

function extractLiteralsFromValue(value: string): string[] {
  const out: string[] = []
  const hex = /#(?:[0-9a-f]{3,8})\b/gi
  const rgb = /rgba?\(\s*[^)]+\)/gi
  for (const match of value.matchAll(hex)) out.push(match[0]!)
  for (const match of value.matchAll(rgb)) out.push(match[0]!)
  return out
}

function loadScopedExceptionKeys(): Set<string> {
  readFileSync(CONTRACT_PATH, 'utf8')
  const plan = JSON.parse(readFileSync(BULK_PATH, 'utf8')) as BulkPlan
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { findings: ManifestFinding[] }
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as { findings: Array<{ id: string }> }
  const manifestById = new Map(manifest.findings.map((row) => [row.id, row]))
  const registryIds = new Set(registry.findings.map((row) => row.id))
  return collectScopedExceptions(plan, manifestById, registryIds)
}

export function isScopedRawLiteralAllowed(file: string, owner: string, property: string, literal: string): boolean {
  return loadScopedExceptionKeys().has(scopeKey(file, owner, property, literal))
}

export function checkSemanticThemeStatic(rootDir = ROOT): { violations: string[] } {
  const scopedExceptions = loadScopedExceptionKeys()

  const violations: string[] = []
  const files = walk(resolve(rootDir, 'src'))

  for (const file of files) {
    const rel = relative(rootDir, file).replace(/\\/g, '/')
    const source = readFileSync(file, 'utf8')
    const isIndexCss = rel === 'src/index.css'

    walkCssRules(source, (selector, body) => {
      const owners = selector.split(',').map((part) => normalizeOwner(part))
      const declPattern = /(?:^|;)\s*([a-z-]+)\s*:\s*([^;{}]+)/gim
      for (const match of body.matchAll(declPattern)) {
        const property = match[1]!.trim()
        if (!COLOR_PROPERTIES.has(property)) continue
        const value = match[2]!.trim()
        if (/var\s*\(\s*--vg-/.test(value) && !/#|rgba?\(/i.test(value)) continue
        for (const literal of extractLiteralsFromValue(value)) {
          if (isIndexCss) continue
          let allowed = false
          for (const owner of owners) {
            if (scopedExceptions.has(scopeKey(rel, owner, property, literal))) {
              allowed = true
              break
            }
          }
          if (!allowed) {
            violations.push(`${rel} [${owners.join(', ')}] ${property}: disallowed raw literal ${literal}`)
          }
        }
      }
    })
  }

  return { violations }
}

if (process.argv[1]?.includes('check-semantic-theme-static')) {
  const { violations } = checkSemanticThemeStatic()
  if (violations.length > 0) {
    console.error('Semantic theme static check failed:')
    for (const v of violations.slice(0, 50)) console.error(v)
    if (violations.length > 50) console.error(`… and ${violations.length - 50} more`)
    process.exitCode = 1
  } else {
    console.log('Semantic theme static check passed.')
  }
}
