#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { scanProject, type ThemeFinding } from './check-theme-colors.ts'
import { resolveClosureRow, type ManifestFinding } from './theme-closure-classification.ts'
import { normalizeCssValue } from './plan-theme-migration.ts'

const ROOT = resolve(import.meta.dirname, '..')
const REGISTRY_PATH = resolve(import.meta.dirname, 'theme-scientific-color-registry.json')

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function asManifest(f: ThemeFinding): ManifestFinding {
  return {
    id: f.id,
    file: f.file,
    kind: f.kind,
    property: f.property,
    literal: f.literal,
    owner: f.locator.owner,
    classification: '',
  }
}

function replacementValue(property: string, token: string, currentValue: string, literal: string): string | null {
  const bare = `var(${token})`
  const norm = normalizeCssValue(currentValue).toLowerCase()
  const lit = literal.trim().toLowerCase()

  if (/linear-gradient|radial-gradient/i.test(currentValue)) {
    if (/var\(--vg-control-surface/.test(currentValue)) return null
    return bare
  }
  if (property === 'box-shadow' && /rgba?\(|#|color-mix/.test(currentValue)) return bare

  if (norm === lit || norm === normalizeCssValue(literal).toLowerCase()) return bare

  if (property === 'border' || property === 'outline') {
    if (norm === lit) return bare
    const parts = currentValue.trim().split(/\s+/)
    if (parts.length >= 3 && parts[parts.length - 1]!.toLowerCase().includes(lit.replace(/^#/, ''))) {
      return `${parts.slice(0, -1).join(' ')} ${bare}`
    }
    if (parts.length === 2 && /^\d|solid|dashed|dotted/.test(parts[0]!)) return `${parts[0]} ${bare}`
    if (norm.includes(lit)) return currentValue.replace(new RegExp(escapeRegExp(literal), 'gi'), bare)
    return null
  }

  if ((property === 'border-color' || property === 'outline-color') && norm.includes(lit)) return bare

  if (norm.includes(lit)) {
    if (norm === lit) return bare
    return currentValue.replace(new RegExp(escapeRegExp(literal), 'gi'), bare)
  }
  return null
}

function replaceCssAtLine(source: string, finding: ThemeFinding, token: string): { next: string; changed: boolean } {
  const lines = source.split('\n')
  const lineIndex = finding.line - 1
  if (lineIndex < 0 || lineIndex >= lines.length) return { next: source, changed: false }

  const property = finding.property
  const literal = finding.literal.trim()
  const props =
    property === 'border' && !/^\d/.test(literal)
      ? [property, 'border-color']
      : property === 'outline' && !/^\d/.test(literal)
        ? [property, 'outline-color']
        : [property]

  let changed = false
  for (let offset = -2; offset <= 2; offset += 1) {
    const idx = lineIndex + offset
    if (idx < 0 || idx >= lines.length) continue
    let line = lines[idx]!
    for (const prop of props) {
      const decl = new RegExp(`(^\\s*${escapeRegExp(prop)}\\s*:\\s*)([^;]+)(;?)`)
      const match = decl.exec(line)
      if (!match) continue
      const value = match[2]!.trim()
      if (!normalizeCssValue(value).toLowerCase().includes(literal.toLowerCase())) continue
      const replacement = replacementValue(prop, token, value, literal)
      if (!replacement) continue
      line = line.replace(decl, `$1${replacement}$3`)
      lines[idx] = line
      changed = true
      break
    }
    if (changed) break
  }

  if (!changed) {
    const decl = new RegExp(`(${escapeRegExp(property)}\\s*:\\s*)([^;{}]+)`, 'g')
    const rebuilt = source.replace(decl, (full, prefix: string, value: string, offset: number) => {
      if (!normalizeCssValue(value).toLowerCase().includes(literal.toLowerCase())) return full
      const line = lineNumberAt(source, offset)
      if (Math.abs(line - finding.line) > 3) return full
      const replacement = replacementValue(property, token, value.trim(), literal)
      if (!replacement) return full
      changed = true
      return `${prefix}${replacement}`
    })
    if (changed) return { next: rebuilt, changed: true }
  }

  return { next: changed ? lines.join('\n') : source, changed }
}

function lineNumberAt(text: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset; i += 1) if (text[i] === '\n') line += 1
  return line
}

function replaceTsxFinding(source: string, finding: ThemeFinding, token: string): { next: string; changed: boolean } {
  const literal = finding.literal.trim()
  const property = finding.property
  const jsxProp = property === 'backgroundColor' ? 'backgroundColor' : property
  const bare = `var(${token})`

  const lineStart = source.split('\n').slice(0, finding.line - 1).join('\n').length + (finding.line > 1 ? 1 : 0)
  const lineEnd = source.indexOf('\n', lineStart)
  const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd)

  if (line.includes(literal)) {
    const patterns: Array<[RegExp, string]> = [
      [new RegExp(`(\\b${escapeRegExp(jsxProp)}\\s*=\\s*")${escapeRegExp(literal)}"`), `$1${bare}"`],
      [new RegExp(`(\\b${escapeRegExp(jsxProp)}\\s*=\\s*')${escapeRegExp(literal)}'`), `$1${bare}'`],
      [new RegExp(`(${escapeRegExp(property)}\\s*:\\s*['"])${escapeRegExp(literal)}(['"])`, 'i'), `$1${bare}$2`],
      [new RegExp(`(\\b${escapeRegExp(jsxProp)}\\s*=\\s*\\{['"])${escapeRegExp(literal)}(['"]\\})`), `$1${bare}$2`],
    ]
    for (const [pattern, repl] of patterns) {
      if (pattern.test(line)) {
        const newLine = line.replace(pattern, repl)
        const next = source.slice(0, lineStart) + newLine + source.slice(lineEnd < 0 ? source.length : lineEnd)
        return { next, changed: true }
      }
    }
  }

  if (normalizeCssValue(source).toLowerCase().includes(literal.toLowerCase())) {
    const next = source.replace(new RegExp(escapeRegExp(literal), 'g'), bare)
    if (next !== source) return { next, changed: true }
  }
  return { next: source, changed: false }
}

async function main(): Promise<void> {
  const registry = JSON.parse(await readFile(REGISTRY_PATH, 'utf8')) as { version: number; findings: Array<Record<string, unknown>> }
  const registryIds = new Set(registry.findings.map((r) => r.id as string))

  let pass = 0
  let totalApplied = 0
  const fileCache = new Map<string, string>()

  while (pass < 8) {
    pass += 1
    const enforced = await scanProject({ mode: 'enforced' })
    const raw = await scanProject({ mode: 'raw' })
    const targets = [...enforced]
    for (const f of raw) {
      if (!targets.some((t) => t.id === f.id)) targets.push(f)
    }
    let applied = 0
    const refused: string[] = []

    for (const finding of targets) {
      const row = resolveClosureRow(asManifest(finding), registryIds)
      if (row.enforcedDisposition !== 'migrate-existing-token') continue
      const token = row.destinationToken
      const filePath = resolve(ROOT, finding.file)
      if (!fileCache.has(finding.file)) fileCache.set(finding.file, await readFile(filePath, 'utf8'))
      const source = fileCache.get(finding.file)!
      const result =
        finding.kind === 'css' || finding.file.endsWith('.css')
          ? replaceCssAtLine(source, finding, token)
          : replaceTsxFinding(source, finding, token)
      if (!result.changed) {
        refused.push(`${finding.file}:${finding.line}:${finding.property}:${finding.literal}->${token}`)
        continue
      }
      fileCache.set(finding.file, result.next)
      applied += 1
    }

    for (const [file, content] of fileCache) {
      await writeFile(resolve(ROOT, file), content, 'utf8')
    }
    fileCache.clear()
    totalApplied += applied
    console.log(`pass ${pass} applied ${applied} refused ${refused.length}`)
    if (refused.length > 0 && applied === 0) {
      console.log(refused.join('\n'))
      break
    }
    if (applied === 0) break
  }

  const toRegister: ThemeFinding[] = []
  const raw = await scanProject({ mode: 'raw' })
  for (const finding of raw) {
    const row = resolveClosureRow(asManifest(finding), registryIds)
    if (row.enforcedDisposition === 'register-scientific' && !registryIds.has(finding.id)) {
      toRegister.push(finding)
    }
  }

  for (const finding of toRegister) {
    const row = resolveClosureRow(asManifest(finding), registryIds)
    registry.findings.push({
      id: finding.id,
      file: finding.file,
      kind: finding.kind,
      property: finding.property,
      literal: finding.literal,
      locator: finding.locator,
      owner: finding.locator.owner,
      biologicalReason: row.rationale,
    })
    registryIds.add(finding.id)
  }

  if (toRegister.length > 0) {
    await writeFile(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
  }

  const after = await scanProject({ mode: 'enforced' })
  console.log('totalApplied', totalApplied, 'register', toRegister.length, 'enforcedAfter', after.length)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
