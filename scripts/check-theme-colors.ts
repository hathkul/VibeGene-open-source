#!/usr/bin/env node

/**
 * Guardrail for theme-sensitive colours.
 *
 * This is intentionally a small source scanner with a raw inventory mode.  It
 * catches the places most likely to leak a hard-coded chrome colour while
 * remaining useful for TSX/SVG, where a normal CSS parser cannot see inline
 * attributes.  Enforced mode requires zero unregistered literals; raw inventory
 * is owned by scripts/check-theme-debt.ts.
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'

export type ThemeFindingKind = 'css' | 'tsx'

export type ThemeFinding = {
  id: string
  file: string
  line: number
  kind: ThemeFindingKind
  property: string
  literal: string
  reason: string
  excerpt: string
  locator: ThemeFindingLocator
  /** Transitional identity used only when migrating the pre-locator baseline. */
  legacyId?: string
}

export type ThemeFindingLocator = {
  owner: string
  anchor: string
}

export type ThemeScanOptions = {
  rootDir?: string
  files?: string[]
  mode?: ThemeScanMode
  /** Live scientific registry keys (file, kind, property, literal, owner). Enforced mode exempts these. */
  scientificRegistryKeys?: Set<string>
}

export type ThemeScanMode = 'enforced' | 'raw'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(SCRIPT_DIR, '..')
const SOURCE_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.tsx', '.jsx', '.ts', '.js'])
const SOURCE_DIRECTORIES = ['src']
const THEME_PROPERTIES = new Set([
  'background',
  'background-color',
  'border',
  'border-color',
  'box-shadow',
  'color',
  'fill',
  'outline',
  'outline-color',
  'stroke',
  'text-shadow',
])
const JSX_THEME_PROPERTIES = new Set([
  'background',
  'backgroundColor',
  'border',
  'borderColor',
  'boxShadow',
  'color',
  'fill',
  'outline',
  'outlineColor',
  'stroke',
  'textShadow',
])

// These are CSS-wide values, not palette decisions.
const ALLOWED_LITERALS = new Set(['currentcolor', 'inherit', 'initial', 'none', 'transparent', 'unset', 'revert'])

const REGISTRY_PATH = resolve(SCRIPT_DIR, 'theme-scientific-color-registry.json')
const HEX_LITERAL = /#[0-9a-f]{3,8}\b/gi
const FUNCTION_LITERAL = /\b(?:rgb|rgba|hsl|hsla)\(\s*[^)]*\)/gi
const NAMED_LITERAL = /\b(?:black|white|gray|grey|silver|maroon|red|orange|yellow|olive|lime|green|aqua|teal|blue|navy|fuchsia|purple)\b/gi
const NAMED_LITERAL_VALUES = new Set(['black', 'white', 'gray', 'grey', 'silver', 'maroon', 'red', 'orange', 'yellow', 'olive', 'lime', 'green', 'aqua', 'teal', 'blue', 'navy', 'fuchsia', 'purple'])
const CSS_DECLARATION = /([\w-]+)\s*:\s*([^;{}]+)(?:;|(?=\}))/g
const JSX_ATTRIBUTE = /\b([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([\s\S]*?)\})/g
const OBJECT_PROPERTY = /(?:^|[,{\s])([A-Za-z][\w-]*)\s*:\s*([^,}\n]+)/g

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim()
}

function lineNumberAt(text: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === '\n') line += 1
  }
  return line
}

function sourceContext(text: string, offset: number, includePreviousLine = false): string {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1
  const lineEnd = text.indexOf('\n', offset)
  const previousLineStart = includePreviousLine && lineStart > 0 ? text.lastIndexOf('\n', lineStart - 2) + 1 : lineStart
  return text.slice(previousLineStart, lineEnd < 0 ? text.length : lineEnd)
}

export function scientificRegistryKey(finding: Pick<ThemeFinding, 'file' | 'kind' | 'property' | 'literal' | 'locator'>): string {
  return JSON.stringify([finding.file, finding.kind, finding.property, finding.literal, finding.locator.owner])
}

function literalIsAllowed(literal: string): boolean {
  const normalized = literal.toLowerCase().replace(/\s+/g, '')
  return ALLOWED_LITERALS.has(normalized)
}

export async function loadScientificRegistryKeys(registryPath = REGISTRY_PATH): Promise<Set<string>> {
  try {
    const registry = JSON.parse(await readFile(registryPath, 'utf8')) as {
      findings: Array<{ file: string; kind: ThemeFindingKind; property: string; literal: string; owner: string; locator?: ThemeFindingLocator }>
    }
    return new Set(
      registry.findings.map((entry) =>
        scientificRegistryKey({
          file: entry.file,
          kind: entry.kind as ThemeFindingKind,
          property: entry.property,
          literal: entry.literal,
          locator: entry.locator ?? { owner: entry.owner, anchor: '' },
        }),
      ),
    )
  } catch {
    return new Set()
  }
}

function isCommentedOut(line: string, matchOffset: number): boolean {
  const before = line.slice(0, matchOffset)
  const commentStart = before.indexOf('/*')
  if (commentStart >= 0 && before.indexOf('*/', commentStart + 2) < 0) return true
  const lineComment = before.indexOf('//')
  return lineComment >= 0
}

function findingId(file: string, kind: ThemeFindingKind, property: string, literal: string, lineText: string, occurrence: number): string {
  const stable = [file, kind, property, literal.toLowerCase(), normalizeLine(lineText), occurrence].join('|')
  return createHash('sha1').update(stable).digest('hex').slice(0, 16)
}

function cleanCssHeader(header: string): string {
  let cleaned = header.replace(/\/\*[\s\S]*?\*\//g, '')
  const commentEnd = cleaned.lastIndexOf('*/')
  if (commentEnd >= 0) cleaned = cleaned.slice(commentEnd + 2)
  return normalizeLine(cleaned)
}

function createCssOwnerResolver(text: string): (offset: number) => string {
  const stack: string[] = []
  let cursor = 0
  let tokenStart = 0
  let quote: string | null = null
  return (offset: number): string => {
    while (cursor < offset) {
      const character = text[cursor]
      if (quote) {
        if (character === quote && text[cursor - 1] !== '\\') quote = null
        cursor += 1
        continue
      }
      if (character === '"' || character === "'") {
        quote = character
        cursor += 1
        continue
      }
      if (character === '/' && text[cursor + 1] === '*') {
        const end = text.indexOf('*/', cursor + 2)
        cursor = end < 0 ? offset : Math.min(end + 2, offset)
        continue
      }
      if (character === '{') {
        stack.push(cleanCssHeader(text.slice(tokenStart, cursor)))
        tokenStart = cursor + 1
      } else if (character === '}') {
        stack.pop()
        tokenStart = cursor + 1
      } else if (character === ';') {
        tokenStart = cursor + 1
      }
      cursor += 1
    }
    const owners = stack.filter(Boolean)
    return owners.length > 0 ? owners.join(' > ') : '<stylesheet>'
  }
}

function createAstOwnerResolver(source: ts.SourceFile): (offset: number) => string {
  const ranges: Array<{ start: number; end: number; owner: string }> = []
  function jsxTag(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
    return ts.isJsxElement(node) ? node.openingElement.tagName.getText(source) : node.tagName.getText(source)
  }
  function visit(node: ts.Node, ancestors: ts.Node[]): void {
    if (ts.isJsxAttribute(node)) {
      const element = ancestors.findLast((ancestor) => ts.isJsxElement(ancestor) || ts.isJsxSelfClosingElement(ancestor))
      if (element && (ts.isJsxElement(element) || ts.isJsxSelfClosingElement(element))) ranges.push({ start: node.getStart(source), end: node.getEnd(), owner: `jsx:${jsxTag(element)}` })
    } else if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      const names = [node.name.getText(source)]
      for (const ancestor of ancestors) {
        if (ts.isPropertyAssignment(ancestor) || ts.isShorthandPropertyAssignment(ancestor)) names.push(ancestor.name.getText(source))
        else if (ts.isVariableDeclaration(ancestor)) names.push(ancestor.name.getText(source))
      }
      ranges.push({ start: node.getStart(source), end: node.getEnd(), owner: `object:${names.reverse().join('.')}` })
    } else if (ts.isVariableDeclaration(node) && node.name) {
      ranges.push({ start: node.getStart(source), end: node.getEnd(), owner: `variable:${normalizeLine(node.name.getText(source))}` })
    }
    ts.forEachChild(node, (child) => visit(child, [...ancestors, node]))
  }
  visit(source, [])
  ranges.sort((left, right) => (left.end - left.start) - (right.end - right.start))
  return (offset: number): string => ranges.find((range) => offset >= range.start && offset < range.end)?.owner ?? '<source>'
}

function stableFindingId(file: string, kind: ThemeFindingKind, property: string, literal: string, owner: string, anchorSource: string): string {
  return createHash('sha1').update([file, kind, owner, property, literal.toLowerCase(), anchorSource].join('|')).digest('hex').slice(0, 16)
}

function addFinding(
  findings: ThemeFinding[],
  file: string,
  kind: ThemeFindingKind,
  property: string,
  literal: string,
  text: string,
  offset: number,
  reason: string,
  occurrence: number,
  owner: string,
  anchorSource: string,
): void {
  const line = lineNumberAt(text, offset)
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1
  const lineEnd = text.indexOf('\n', offset)
  const lineText = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd)
  findings.push({
    id: stableFindingId(file, kind, property, literal, owner, anchorSource),
    file,
    line,
    kind,
    property,
    literal,
    reason,
    excerpt: normalizeLine(lineText).slice(0, 240),
    locator: {
      owner,
      anchor: createHash('sha1').update(anchorSource).digest('hex').slice(0, 16),
    },
    legacyId: findingId(file, kind, property, literal, lineText, occurrence),
  })
}

function scanValue(
  findings: ThemeFinding[],
  file: string,
  kind: ThemeFindingKind,
  property: string,
  value: string,
  valueOffset: number,
  text: string,
  context: string,
  occurrenceByLiteral: Map<string, number>,
  locatorOccurrenceByOwner: Map<string, number>,
  mode: ThemeScanMode,
  owner: string,
  anchorSource: string,
  scientificRegistryKeys?: Set<string>,
): void {
  const literals = [...value.matchAll(HEX_LITERAL), ...value.matchAll(FUNCTION_LITERAL), ...value.matchAll(NAMED_LITERAL)]
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
  for (const match of literals) {
    const literal = match[0]
    const matchIndex = match.index ?? 0
    const varStart = value.lastIndexOf('var(--', matchIndex)
    const varEnd = varStart >= 0 ? value.indexOf(')', varStart) : -1
    const fallbackStart = varStart >= 0 ? value.indexOf(',', varStart) : -1
    const propertyEnd = fallbackStart >= 0 && fallbackStart < varEnd ? fallbackStart : varEnd
    const isCustomPropertyName = varStart >= 0 && varEnd >= 0 && propertyEnd > matchIndex
    if (isCustomPropertyName) continue
    if (NAMED_LITERAL_VALUES.has(literal.toLowerCase()) && value[matchIndex - 1] === '.') continue
    if (literalIsAllowed(literal)) continue
    const absoluteOffset = valueOffset + matchIndex
    const pending: Omit<ThemeFinding, 'id' | 'legacyId'> = {
      file,
      line: lineNumberAt(text, absoluteOffset),
      kind,
      property,
      literal,
      reason: `literal in theme-sensitive ${property}`,
      excerpt: '',
      locator: { owner, anchor: createHash('sha1').update(anchorSource).digest('hex').slice(0, 16) },
    }
    if (mode === 'enforced' && scientificRegistryKeys?.has(scientificRegistryKey({ ...pending, file, kind, property, literal, locator: pending.locator }))) {
      continue
    }
    const lineStart = text.lastIndexOf('\n', absoluteOffset - 1) + 1
    const lineEnd = text.indexOf('\n', absoluteOffset)
    const lineText = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd)
    if (isCommentedOut(lineText, absoluteOffset - lineStart)) continue
    const key = `${file}|${kind}|${property}|${literal.toLowerCase()}|${normalizeLine(lineText)}`
    const occurrence = occurrenceByLiteral.get(key) ?? 0
    occurrenceByLiteral.set(key, occurrence + 1)
    const locatorKey = `${file}|${kind}|${property}|${owner}|${normalizeLine(value).replace(literal, '<literal>')}`
    const locatorOccurrence = locatorOccurrenceByOwner.get(locatorKey) ?? 0
    locatorOccurrenceByOwner.set(locatorKey, locatorOccurrence + 1)
    addFinding(findings, file, kind, property, literal, text, absoluteOffset, `literal in theme-sensitive ${property}`, occurrence, owner, `${file}|${kind}|${property}|${owner}|${anchorSource}|${normalizeLine(value).replace(literal, '<literal>')}|${locatorOccurrence}`)
  }
}

export function scanSource(
  file: string,
  text: string,
  mode: ThemeScanMode = 'enforced',
  scientificRegistryKeys?: Set<string>,
): ThemeFinding[] {
  const findings: ThemeFinding[] = []
  const occurrenceByLiteral = new Map<string, number>()
  const locatorOccurrenceByOwner = new Map<string, number>()
  const isCss = /\.(?:css|scss|sass)$/i.test(file)
  const kind: ThemeFindingKind = isCss ? 'css' : 'tsx'

  if (isCss) {
    const cssOwner = createCssOwnerResolver(text)
    for (const match of text.matchAll(CSS_DECLARATION)) {
      const property = match[1]!
      if (property.startsWith('--') || !THEME_PROPERTIES.has(property.toLowerCase())) continue
      const value = match[2]!
      const declarationOffset = match.index ?? 0
      const valueOffset = declarationOffset + match[0].indexOf(value)
      const context = sourceContext(text, declarationOffset, true)
      const owner = cssOwner(declarationOffset)
      scanValue(findings, file, kind, property, value, valueOffset, text, context, occurrenceByLiteral, locatorOccurrenceByOwner, mode, owner, `${owner}|${property}`, scientificRegistryKeys)
    }
    return findings
  }

  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const astOwner = createAstOwnerResolver(source)

  // JSX attributes cover SVG fill/stroke and regular HTML style-ish props.
  for (const match of text.matchAll(JSX_ATTRIBUTE)) {
    const property = match[1]!
    if (!JSX_THEME_PROPERTIES.has(property)) continue
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    const declarationOffset = match.index ?? 0
    const valueStartInMatch = match[0].indexOf(value)
    const valueOffset = declarationOffset + Math.max(valueStartInMatch, 0)
    const context = sourceContext(text, declarationOffset)
    const owner = astOwner(declarationOffset)
    scanValue(findings, file, kind, property, value, valueOffset, text, context, occurrenceByLiteral, locatorOccurrenceByOwner, mode, owner, `${owner}|${property}`, scientificRegistryKeys)
  }

  // Inline style objects and data objects with theme-sensitive keys.  The
  // scientific-context test above allows feature/primer/map data colours.
  for (const match of text.matchAll(OBJECT_PROPERTY)) {
    const property = match[1]!
    if (!JSX_THEME_PROPERTIES.has(property)) continue
    const value = match[2]!
    const declarationOffset = (match.index ?? 0) + match[0].indexOf(property)
    const valueOffset = (match.index ?? 0) + match[0].indexOf(value)
    const context = sourceContext(text, declarationOffset)
    const owner = astOwner(declarationOffset)
    scanValue(findings, file, kind, property, value, valueOffset, text, context, occurrenceByLiteral, locatorOccurrenceByOwner, mode, owner, `${owner}|${property}`, scientificRegistryKeys)
  }
  return findings
}

async function collectSourceFiles(rootDir: string): Promise<string[]> {
  const result: string[] = []
  const { readdir } = await import('node:fs/promises')
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase())) result.push(path)
    }
  }
  for (const directory of SOURCE_DIRECTORIES) await visit(resolve(rootDir, directory))
  return result.sort()
}

export async function scanProject(options: ThemeScanOptions = {}): Promise<ThemeFinding[]> {
  const rootDir = options.rootDir ?? ROOT_DIR
  const mode = options.mode ?? 'enforced'
  const scientificRegistryKeys =
    options.scientificRegistryKeys ?? (mode === 'enforced' ? await loadScientificRegistryKeys() : undefined)
  const absoluteFiles = options.files?.map((file) => resolve(rootDir, file)) ?? await collectSourceFiles(rootDir)
  const findings: ThemeFinding[] = []
  for (const absoluteFile of absoluteFiles) {
    const text = await readFile(absoluteFile, 'utf8')
    const relativeFile = relative(rootDir, absoluteFile).replaceAll('\\', '/')
    findings.push(...scanSource(relativeFile, text, mode, scientificRegistryKeys))
  }
  return findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.id.localeCompare(right.id))
}

export async function run(argv = process.argv.slice(2)): Promise<number> {
  if (argv.includes('--update-baseline')) {
    console.error('Refusing to update theme-color-baseline.json; migrate UI chrome or register scientific paints instead.')
    return 1
  }
  const mode: ThemeScanMode = argv.includes('--raw') ? 'raw' : 'enforced'
  const findings = await scanProject({ mode })
  if (mode === 'enforced') {
    if (findings.length === 0) {
      console.log('Theme enforced color check passed (0 findings).')
      return 0
    }
    console.error(`Theme color check failed: ${findings.length} enforced finding${findings.length === 1 ? '' : 's'}.`)
    for (const finding of findings) console.error(`  ${finding.file}:${finding.line} ${finding.property} ${finding.literal} — ${finding.reason}\n    ${finding.excerpt}`)
    console.error('\nReplace ordinary UI literals with semantic tokens or add a scoped scientific registry row.')
    return 1
  }
  console.log(`Theme raw inventory (${findings.length} finding${findings.length === 1 ? '' : 's'}); ownership is checked by npm run check:theme-debt.`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  run().then((code) => { process.exitCode = code }).catch((error: unknown) => { console.error(error); process.exitCode = 1 })
}
