#!/usr/bin/env node

/**
 * Build a deterministic, reviewable plan for migrating literal theme colours.
 *
 * The planner is intentionally read-only by default.  It only proposes a
 * token when the literal has one unambiguous, non-startup token declaration in
 * the base palette.  Duplicate token values (notably white) are reported as
 * ambiguous instead of being guessed.
 */

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadScientificRegistryKeys, scanProject, scanSource, scientificRegistryKey, type ThemeFinding } from './check-theme-colors.ts'

export type ThemeMigrationToken = {
  name: string
  value: string
  source: string
}

export type ThemeMigrationCandidate = {
  id: string
  file: string
  kind: ThemeFinding['kind']
  line: number
  owner: string
  property: string
  literal: string
  candidates: string[]
  proposedToken: string | null
  evidenceCategory: 'exact-existing-token' | 'ambiguous-existing-tokens' | 'no-existing-token' | 'outside-tranche'
  beigePrior: string
  beigeEffective: string
  beigeTarget: string | null
  brightTarget: string | null
  darkTarget: string | null
  confidence: 'high' | 'ambiguous' | 'unmatched' | 'excluded'
  before: string
  after: string | null
  reason: string
}

export type ThemeMigrationGroup = {
  file: string
  owner: string
  property: string
  literal: string
  proposedToken: string | null
  evidenceCategory: ThemeMigrationCandidate['evidenceCategory']
  beigePrior: string
  beigeEffective: string
  beigeTarget: string | null
  brightTarget: string | null
  darkTarget: string | null
  confidence: ThemeMigrationCandidate['confidence']
  findingIds: string[]
  before: string
  after: string | null
}

export type ThemeMigrationLedgerEntry = {
  id: string
  file: string
  kind: ThemeFinding['kind']
  owner: string
  property: string
  literal: string
  token: string
  postMigration?: ThemeMigrationPostMigration
}

export type ThemeMigrationPostMigration = {
  sourceAnchor: string
  currentOwner: string
  currentProperty: string
  currentValue: string
  currentOccurrence: number
  currentMatchCount: number
  currentRuleCount: number
  currentAnchor: string
}

export type ThemeMigrationShadowEntry = {
  id: string
  file: 'src/App.css'
  kind: 'css'
  owner: string
  property: string
  literal: string
  sourceAnchor: string
  action: 'remove'
  shadowedBy: {
    mode: 'root-prefixed-same-owner' | 'db-same-selector'
    selector: string
    property: string
    value: string
    anchor: string
    specificity: [number, number, number]
    specificityMode: 'greater-than-source' | 'same-selector'
    winnerRuleOccurrence: number
    winnerRuleCount: number
    occurrence: number
    count: number
    sourceOrder: 'later'
    contexts: string[]
    layoutEvidence: string
  }
}

export type ThemeMigrationPickEntry = Omit<ThemeMigrationLedgerEntry, 'token'> & {
  action: 'remove' | 'replace'
  token?: string
}

export type ThemeMigrationEvidence = {
  token: string
  beigePrior: string[]
  beigeEffective: string | null
  beigeTarget: string
  brightTarget: string | null
  darkTarget: string | null
}

export type ThemeMigrationLedger = {
  version: 1
  generatedBy: string
  app: {
    count: number
    entries: ThemeMigrationLedgerEntry[]
    removals: ThemeMigrationShadowEntry[]
    anchorRows: Array<Omit<ThemeMigrationLedgerEntry, 'token'> & {
      action: 'anchor-drift'
      target: Omit<ThemeMigrationLedgerEntry, 'token'> & { anchor: string }
    }>
    retainedRows: Array<Omit<ThemeMigrationLedgerEntry, 'token'> & { action: 'retain'; anchor: string }>
    evidence: ThemeMigrationEvidence[]
  }
  pickPrimers: {
    count: number
    entries: ThemeMigrationPickEntry[]
  }
}

export type ThemeMigrationPlan = {
  version: 1
  generatedBy: string
  sourceManifest: string
  tokenSource: string
  summary: {
    rawFindings: number
    consideredFindings: number
    highConfidence: number
    ambiguous: number
    unmatched: number
    excluded: number
    groups: number
  }
  groups: ThemeMigrationGroup[]
  findings: ThemeMigrationCandidate[]
  applied: {
    ledger: string
    app: {
      count: number
      removalCount: number
      evidence: ThemeMigrationEvidence[]
    }
    pickPrimers: {
      count: number
      removeCount: number
      replaceCount: number
    }
  }
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..')
const DEFAULT_TOKEN_SOURCE = resolve(DEFAULT_ROOT, 'src/index.css')
const DEFAULT_OUTPUT = resolve(SCRIPT_DIR, 'theme-migration-plan.json')

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function equivalentColor(value: string): string {
  const normalized = normalize(value)
  const shortHex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{4})$/i)
  if (!shortHex) return normalized
  return `#${[...shortHex[1]!].map((digit) => `${digit}${digit}`).join('')}`
}

function identity(value: Pick<ThemeFinding, 'id' | 'file' | 'kind' | 'property' | 'literal' | 'locator'>): string {
  return JSON.stringify([value.id, value.file, value.kind, value.property, value.literal, value.locator.owner, value.locator.anchor])
}

const REQUIRED_POST_MIGRATION_IDS = new Set([
  'cf202002217ffb99', '262b7ca5365f0054', 'cd8e95d1900d23be', '8013b54949bf8038',
  '4e366bf8f66fe21d', '19bba29250d66d48', '004a2c2e00013ceb', '74a3870fbc74f1a8',
])

const REQUIRED_POST_MIGRATION_SOURCE_ANCHORS = new Map([
  ['cf202002217ffb99', '98464a65ff82db6d'],
  ['262b7ca5365f0054', '2469e13bab41c81c'],
  ['cd8e95d1900d23be', 'dc7cefe4366e4254'],
  ['8013b54949bf8038', '3a08c72d5a0336e1'],
  ['4e366bf8f66fe21d', 'd6625de9a657a861'],
  ['19bba29250d66d48', '58723da33e108518'],
  ['004a2c2e00013ceb', '10b97d9da6fa83bd'],
  ['74a3870fbc74f1a8', 'c2a95a6176aa4f9f'],
])

const SHADOW_CONTEXTS = ['beige', 'bright', 'dark', 'desktop', 'narrow', 'hybrid']

export function normalizeCssValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function isValidPostMigrationContractValue(currentValue: string, token: string): boolean {
  if (/var\(\s*--(?:border-color|text-secondary|muted)\s*,\s*var\(\s*--vg-/.test(currentValue) && currentValue.includes(`var(${token})`)) return true
  if (/var\(\s*--[\w-]+,\s*/.test(currentValue)) return false
  const normalized = normalizeCssValue(currentValue)
  const bare = normalizeCssValue(`var(${token})`)
  if (normalized === bare) return true
  if (!currentValue.includes(`var(${token})`)) return false
  return !currentValue.includes(',')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type CssRule = { selectors: string[]; declarations: Array<{ property: string; value: string }>; index: number }

function cssRules(source: string): CssRule[] {
  const rules: CssRule[] = []
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/gs)) {
    const header = match[1]!.replace(/\/\*[\s\S]*?\*\//g, '').trim()
    if (!header || header.startsWith('@')) continue
    const declarations = [...match[2]!.matchAll(/([\w-]+)\s*:\s*([^;{}]+);?/g)].map((declaration) => ({
      property: declaration[1]!,
      value: normalizeCssValue(declaration[2]!),
    }))
    rules.push({ selectors: header.split(',').map((selector) => selector.trim()), declarations, index: match.index ?? 0 })
  }
  return rules
}

function cssSpecificity(selector: string): [number, number, number] {
  const withoutStrings = selector.replace(/(['"]).*?\1/g, '')
  const ids = (withoutStrings.match(/#[\w-]+/g) ?? []).length
  const classes = (withoutStrings.match(/\.[\w-]+/g) ?? []).length
  const attributes = (withoutStrings.match(/\[[^\]]+\]/g) ?? []).length
  const pseudos = (withoutStrings.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g) ?? []).length
  const withoutNonTypes = withoutStrings
    .replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+(?:\([^)]*\))?/g, ' ')
  const types = (withoutNonTypes.match(/(?:^|[ >+~])([a-z][\w-]*)/gi) ?? []).length
  return [ids, classes + attributes + pseudos, types]
}

function shadowWinnerAnchor(selector: string, property: string, value: string): string {
  return createHash('sha1').update([selector, property, normalizeCssValue(value)].join('|')).digest('hex').slice(0, 16)
}

export function assertThemeMigrationShadowContracts(source: string, removals: ThemeMigrationShadowEntry[], options: { allowRemoved?: boolean } = {}): void {
  const rules = cssRules(source)
  let sourceFindings: ReturnType<typeof scanSource> | undefined
  for (const entry of removals) {
    const sourceRule = rules.find((rule) => rule.selectors.includes(entry.owner) && rule.declarations.some((declaration) => declaration.property === entry.property && declaration.value.includes(normalizeCssValue(entry.literal))))
    if (!sourceRule && !options.allowRemoved) throw new Error(`missing shadow source rule for ${entry.id}`)
    if (sourceRule) {
      sourceFindings ??= scanSource('src/App.css', source, 'raw')
      const sourceFinding = sourceFindings?.find((finding) => finding.id === entry.id)
      if (!sourceFinding || sourceFinding.locator.owner !== entry.owner || sourceFinding.property !== entry.property || sourceFinding.literal !== entry.literal || sourceFinding.locator.anchor !== entry.sourceAnchor) throw new Error(`shadow source identity drift for ${entry.id}`)
    }
    const winnerRules = rules.filter((rule) => (!sourceRule || rule.index > sourceRule.index) && rule.selectors.includes(entry.shadowedBy.selector) && rule.declarations.some((declaration) => declaration.property === entry.shadowedBy.property))
    if (winnerRules.length !== entry.shadowedBy.winnerRuleCount) throw new Error(`shadow winner rule count drift for ${entry.id}`)
    const winner = winnerRules[entry.shadowedBy.winnerRuleOccurrence]
    if (!winner) throw new Error(`missing shadow winner for ${entry.id}`)
    const declarations = winner.declarations.filter((candidate) => candidate.property === entry.shadowedBy.property)
    const declaration = declarations[entry.shadowedBy.occurrence]
    if (!declaration || declaration.value !== normalizeCssValue(entry.shadowedBy.value)) throw new Error(`shadow winner declaration drift for ${entry.id}`)
    if (declarations.length !== entry.shadowedBy.count) throw new Error(`shadow winner declaration count drift for ${entry.id}`)
    if (sourceRule && winner.index <= sourceRule.index) throw new Error(`shadow winner order drift for ${entry.id}`)
    if (JSON.stringify(cssSpecificity(entry.shadowedBy.selector)) !== JSON.stringify(entry.shadowedBy.specificity)) throw new Error(`shadow winner specificity drift for ${entry.id}`)
    if (entry.shadowedBy.property !== entry.property || entry.shadowedBy.anchor !== shadowWinnerAnchor(entry.shadowedBy.selector, entry.shadowedBy.property, entry.shadowedBy.value) || entry.shadowedBy.sourceOrder !== 'later') throw new Error(`shadow winner identity drift for ${entry.id}`)
    if (entry.shadowedBy.mode === 'root-prefixed-same-owner') {
      if (!entry.shadowedBy.selector.startsWith(':root[data-color-scheme] ') || entry.shadowedBy.selector !== `:root[data-color-scheme] ${entry.owner}` || entry.shadowedBy.specificityMode !== 'greater-than-source') throw new Error(`root-prefixed shadow relation drift for ${entry.id}`)
      if (JSON.stringify(entry.shadowedBy.specificity) === JSON.stringify(cssSpecificity(entry.owner))) throw new Error(`root-prefixed shadow specificity is not greater for ${entry.id}`)
    } else if (entry.shadowedBy.mode === 'db-same-selector') {
      if (!entry.owner.startsWith('.db-') || entry.shadowedBy.selector !== entry.owner || entry.shadowedBy.specificityMode !== 'same-selector') throw new Error(`DB shadow relation drift for ${entry.id}`)
      if (JSON.stringify(entry.shadowedBy.specificity) !== JSON.stringify(cssSpecificity(entry.owner))) throw new Error(`DB shadow specificity drift for ${entry.id}`)
    } else {
      throw new Error(`unknown shadow relation mode for ${entry.id}`)
    }
    if (!SHADOW_CONTEXTS.every((context) => entry.shadowedBy.contexts.includes(context))) throw new Error(`shadow context coverage gap for ${entry.id}`)
    if (!entry.shadowedBy.layoutEvidence) throw new Error(`missing shadow layout evidence for ${entry.id}`)
  }
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

export type ThemeMigrationDeclaration = {
  owner: string
  property: string
  value: string
  occurrence: number
  matchCount: number
  ruleCount: number
  anchor: string
}

export function findThemeMigrationDeclarations(source: string, owner: string, property: string, file = 'src/App.css'): ThemeMigrationDeclaration[] {
  const selector = new RegExp(`(?:^|\\n)[ \\t]*${escapeRegExp(owner)}[ \\t]*\\{`, 'g')
  const declarations: Array<Omit<ThemeMigrationDeclaration, 'occurrence' | 'matchCount' | 'anchor'>> = []
  let ruleCount = 0
  for (const match of source.matchAll(selector)) {
    const open = source.indexOf('{', match.index ?? 0)
    const close = blockEnd(source, open)
    if (open < 0 || close < 0) continue
    ruleCount += 1
    const body = source.slice(open + 1, close)
    const declarationPattern = new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*([^;{}]+)`, 'gm')
    for (const declaration of body.matchAll(declarationPattern)) {
      declarations.push({ owner, property, value: normalizeCssValue(declaration[1]!) })
    }
  }
  const matchCount = declarations.length
  return declarations.map((declaration, occurrence) => ({
    ...declaration,
    occurrence,
    matchCount,
    ruleCount,
    anchor: createHash('sha1').update([file, 'css', declaration.owner, declaration.property, declaration.value, occurrence].join('|')).digest('hex').slice(0, 16),
  }))
}

export function assertThemeMigrationAppliedContracts(source: string, ledger: ThemeMigrationLedger): void {
  const entries = ledger.app.entries.filter((entry) => entry.postMigration)
  for (const id of REQUIRED_POST_MIGRATION_IDS) {
    const entry = ledger.app.entries.find((candidate) => candidate.id === id)
    if (!entry?.postMigration) throw new Error(`missing post-migration contract for ${id}`)
  }
  const currentAnchors = new Set<string>()
  for (const entry of entries) {
    const contract = entry.postMigration!
    const requiredAnchor = REQUIRED_POST_MIGRATION_SOURCE_ANCHORS.get(entry.id)
    if (requiredAnchor && contract.sourceAnchor !== requiredAnchor) throw new Error(`source manifest anchor drift for ${entry.id}`)
    const ownerParts = contract.currentOwner.includes(',') ? contract.currentOwner.split(',').map((part) => part.trim()) : [contract.currentOwner]
    let matches = findThemeMigrationDeclarations(source, contract.currentOwner, contract.currentProperty, entry.file)
    if (matches.length === 0 && ownerParts.length > 1) {
      matches = ownerParts.flatMap((owner) => findThemeMigrationDeclarations(source, owner, contract.currentProperty, entry.file))
    }
    if (matches.length !== contract.currentMatchCount) {
      throw new Error(`post-migration declaration count drift for ${entry.id}`)
    }
    const current = matches.find((match) => match.anchor === contract.currentAnchor) ?? matches[contract.currentOccurrence]
    if (!current) throw new Error(`missing post-migration declaration for ${entry.id}`)
    if (current.ruleCount !== contract.currentRuleCount) {
      throw new Error(`post-migration rule count drift for ${entry.id}`)
    }
    const expected = normalizeCssValue(contract.currentValue)
    const actual = normalizeCssValue(current.value)
    if (actual !== expected || current.anchor !== contract.currentAnchor) {
      throw new Error(`post-migration declaration drift for ${entry.id}`)
    }
    if (currentAnchors.has(current.anchor)) throw new Error(`duplicate post-migration declaration anchor ${current.anchor}`)
    currentAnchors.add(current.anchor)
  }
}

export function validateThemeMigrationLedger(ledger: ThemeMigrationLedger): ThemeMigrationLedger {
  if (ledger.version !== 1 || !ledger.app || !ledger.pickPrimers || !Array.isArray(ledger.app.entries) || !Array.isArray(ledger.app.removals) || !Array.isArray(ledger.app.anchorRows) || !Array.isArray(ledger.app.retainedRows) || !Array.isArray(ledger.app.evidence) || !Array.isArray(ledger.pickPrimers.entries)) {
    throw new Error('invalid theme migration ledger version or sections')
  }
  if (ledger.app.count !== ledger.app.entries.length || ledger.pickPrimers.count !== ledger.pickPrimers.entries.length) {
    throw new Error('theme migration ledger counts do not match entries')
  }
  const ids = new Set<string>()
  const addId = (id: string) => {
    if (!id || ids.has(id)) throw new Error(`duplicate or empty theme migration ledger ID ${id}`)
    ids.add(id)
  }
  for (const entry of ledger.app.entries) {
    addId(entry.id)
    if (entry.file !== 'src/App.css' || entry.kind !== 'css' || !entry.owner || !entry.property || !entry.literal || !/^--[\w-]+$/.test(entry.token)) {
      throw new Error(`invalid App.css migration ledger entry ${entry.id}`)
    }
    if (entry.postMigration) {
      const contract = entry.postMigration
      if (!contract.sourceAnchor || !contract.currentOwner || !contract.currentProperty || !contract.currentValue || !contract.currentAnchor || !Number.isInteger(contract.currentOccurrence) || contract.currentOccurrence < 0 || !Number.isInteger(contract.currentMatchCount) || contract.currentMatchCount <= contract.currentOccurrence || !Number.isInteger(contract.currentRuleCount) || contract.currentRuleCount <= 0 || contract.currentOwner !== entry.owner || contract.currentProperty !== entry.property || !isValidPostMigrationContractValue(contract.currentValue, entry.token)) {
        throw new Error(`invalid post-migration contract ${entry.id}`)
      }
    }
  }
  for (const entry of ledger.app.removals) {
    addId(entry.id)
    if (entry.file !== 'src/App.css' || entry.kind !== 'css' || entry.action !== 'remove' || !entry.owner || !entry.property || !entry.literal || !entry.sourceAnchor || !entry.shadowedBy?.mode || !entry.shadowedBy.selector || !entry.shadowedBy.property || !entry.shadowedBy.value || !entry.shadowedBy.anchor || !Array.isArray(entry.shadowedBy.specificity) || entry.shadowedBy.specificity.length !== 3 || !['greater-than-source', 'same-selector'].includes(entry.shadowedBy.specificityMode) || !Number.isInteger(entry.shadowedBy.winnerRuleOccurrence) || entry.shadowedBy.winnerRuleOccurrence < 0 || !Number.isInteger(entry.shadowedBy.winnerRuleCount) || entry.shadowedBy.winnerRuleCount <= entry.shadowedBy.winnerRuleOccurrence || !Number.isInteger(entry.shadowedBy.occurrence) || entry.shadowedBy.occurrence < 0 || !Number.isInteger(entry.shadowedBy.count) || entry.shadowedBy.count <= entry.shadowedBy.occurrence || entry.shadowedBy.sourceOrder !== 'later' || !Array.isArray(entry.shadowedBy.contexts) || !entry.shadowedBy.layoutEvidence) {
      throw new Error(`invalid App.css shadow ledger entry ${entry.id}`)
    }
    if (!SHADOW_CONTEXTS.every((context) => entry.shadowedBy.contexts.includes(context))) throw new Error(`shadow context coverage gap for ${entry.id}`)
    if (entry.shadowedBy.property !== entry.property || entry.shadowedBy.specificity.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new Error(`invalid shadow cascade evidence ${entry.id}`)
    }
    if (entry.shadowedBy.mode === 'root-prefixed-same-owner' && (entry.shadowedBy.selector !== `:root[data-color-scheme] ${entry.owner}` || entry.shadowedBy.specificityMode !== 'greater-than-source')) {
      throw new Error(`root-prefixed shadow relation drift for ${entry.id}`)
    }
    if (entry.shadowedBy.mode === 'db-same-selector' && (!entry.owner.startsWith('.db-') || entry.shadowedBy.selector !== entry.owner || entry.shadowedBy.specificityMode !== 'same-selector')) {
      throw new Error(`DB shadow relation drift for ${entry.id}`)
    }
  }
  for (const id of REQUIRED_POST_MIGRATION_IDS) {
    const entry = ledger.app.entries.find((candidate) => candidate.id === id)
    if (!entry?.postMigration) throw new Error(`missing post-migration contract for ${id}`)
  }
  for (const entry of ledger.app.anchorRows) {
    addId(entry.id)
    if (entry.file !== 'src/App.css' || entry.kind !== 'css' || entry.action !== 'anchor-drift' || !entry.target?.id || !entry.target.anchor) throw new Error(`invalid App.css anchor row ${entry.id}`)
    if (entry.target.file !== entry.file || entry.target.kind !== entry.kind || entry.target.owner !== entry.owner || entry.target.property !== entry.property || entry.target.literal !== entry.literal) {
      throw new Error(`anchor target identity drift for ${entry.id}`)
    }
    addId(entry.target.id)
  }
  for (const entry of ledger.app.retainedRows) {
    addId(entry.id)
    if (entry.file !== 'src/App.css' || entry.kind !== 'css' || entry.action !== 'retain' || !entry.anchor) throw new Error(`invalid retained App.css row ${entry.id}`)
  }
  for (const entry of ledger.pickPrimers.entries) {
    addId(entry.id)
    if (entry.file !== 'src/PickPrimersDialog.css' || entry.kind !== 'css' || !['remove', 'replace'].includes(entry.action)) {
      throw new Error(`invalid PickPrimers.css migration ledger entry ${entry.id}`)
    }
    if (entry.action === 'replace' && entry.token !== '--vg-text-muted' && entry.token !== '--vg-surface-inset') {
      throw new Error(`unexpected PickPrimers replacement token ${entry.id}`)
    }
    if (entry.action === 'remove' && entry.token) throw new Error(`remove entry ${entry.id} cannot carry a token`)
  }
  const evidenceTokens = new Set(ledger.app.evidence.map((evidence) => evidence.token))
  for (const entry of ledger.app.entries) if (!evidenceTokens.has(entry.token)) throw new Error(`missing scheme evidence for ${entry.token}`)
  return ledger
}

export async function readThemeMigrationLedger(rootDir = DEFAULT_ROOT): Promise<ThemeMigrationLedger> {
  const path = resolve(rootDir, 'scripts/theme-migration-ledger.json')
  const ledger = validateThemeMigrationLedger(JSON.parse(await readFile(path, 'utf8')) as ThemeMigrationLedger)
  const source = await readFile(resolve(rootDir, 'src/App.css'), 'utf8')
  assertThemeMigrationAppliedContracts(source, ledger)
  assertThemeMigrationShadowContracts(source, ledger.app.removals, { allowRemoved: true })
  return ledger
}

export function assertNoSelfReferentialTokenFallbacks(source: string): void {
  if (/var\((--[\w-]+),\s*var\(\1\)\)/.test(source)) throw new Error('self-referential token fallback found in theme source')
}

/** Extract only declarations from the base :root palette. */
export function parseBaseThemeTokens(source: string, sourceName = 'src/index.css'): ThemeMigrationToken[] {
  const root = source.split(":root[data-color-scheme")[0] ?? source
  const tokens: ThemeMigrationToken[] = []
  const declaration = /(--[\w-]+)\s*:\s*([^;{}]+);/g
  for (const match of root.matchAll(declaration)) {
    const name = match[1]!
    const value = normalize(match[2]!)
    if (value.startsWith('var(') || name.startsWith('--vg-') || name.startsWith('--startup-')) continue
    tokens.push({ name, value, source: sourceName })
  }
  return tokens
}

type TokenEvidence = { names: string[]; beige: string; bright: string | null; dark: string | null }

function semanticMatch(finding: ThemeFinding, token: string): boolean {
  if (finding.locator.owner.includes(':root[data-color-scheme=')) return false
  const property = finding.property.toLowerCase()
  // Visualization/data state palettes remain explicit.  Their literals may
  // happen to equal a UI token in Beige, but changing them would erase the
  // scientific/state meaning in Bright or Dark.
  if (property === 'fill' || property === 'stroke' || /(protein-comparison|protein-map|protein-alignment|protein-composition|protein-residue|protein-color-class|sequence-primer-callout|dna-base|clock-hand|pcr-amplicon-table|pcr-workspace-primer-table|mutagenesis-mer-badge|primer-editor-structure)/i.test(finding.locator.owner)) return false
  const isSurface = /(?:background|fill)$/i.test(property)
  const isInk = /^(?:color|stroke|fill|text-shadow)$/i.test(property)
  const isEdge = /^(?:border|border-color|outline|outline-color|box-shadow)$/i.test(property)
  if (/--(?:text|text-h|muted|app-button-text|app-selection-text)$/.test(token)) return isInk
  if (/--(?:accent|app-focus)$/.test(token)) return isInk || isEdge || isSurface
  if (/--(?:app-panel|app-panel-muted|app-workspace|app-sidebar|app-chrome|app-chrome-end|app-table|app-table-alt|app-table-head|app-table-hover|app-selection|app-button-bottom|field)$/.test(token)) return isSurface
  if (/--(?:app-divider|app-button-border|app-table-border|app-table-head-border)$/.test(token)) return isEdge
  if (/--(?:app-overlay|app-dialog-shadow)$/.test(token)) return /^(?:background|box-shadow)$/.test(property)
  return false
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

function vgSchemeValues(source: string, tokenNames: string[]): Map<string, { beige: string; bright: string | null; dark: string | null }> {
  const beigeRoot = source.split(':root[data-color-scheme')[0] ?? source
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

function expectedVgLedgerEvidence(indexSource: string, token: string): ThemeMigrationLedger['app']['evidence'][number] {
  const aliases = parseVgAliases(indexSource)
  const defs = parseVgDefinitions(indexSource)
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
  const schemes = vgSchemeValues(indexSource, [base]).get(base)
  if (!schemes?.beige) throw new Error(`missing beige value for ${base} (${token})`)
  return {
    token,
    beigePrior: [],
    beigeEffective: schemes.beige,
    beigeTarget: `var(${token})`,
    brightTarget: schemes.bright,
    darkTarget: schemes.dark,
  }
}

function schemeValues(source: string, tokenNames: string[]): Map<string, { bright: string | null; dark: string | null }> {
  const result = new Map<string, { bright: string | null; dark: string | null }>()
  for (const name of tokenNames) {
    const values = { bright: null as string | null, dark: null as string | null }
    for (const scheme of ['bright', 'dark'] as const) {
      const start = source.indexOf(`:root[data-color-scheme='${scheme}']`)
      const end = source.indexOf(':root[data-color-scheme=', start + 1)
      const block = source.slice(start, end < 0 ? source.length : end)
      const match = new RegExp(`${name}\\s*:\\s*([^;{}]+);`).exec(block)
      values[scheme] = match ? normalize(match[1]!) : null
    }
    result.set(name, values)
  }
  return result
}

function candidateFor(
  finding: ThemeFinding,
  tokensByValue: Map<string, TokenEvidence>,
  reviewed: ThemeMigrationLedgerEntry | undefined,
  tokenEvidenceByName: Map<string, TokenEvidence>,
  ledgerEvidence: ThemeMigrationLedger['app']['evidence'],
  scientificRegistryKeys: Set<string>,
): ThemeMigrationCandidate {
  const registryKey = scientificRegistryKey({
    file: finding.file,
    kind: finding.kind,
    property: finding.property,
    literal: finding.literal,
    locator: finding.locator,
  })
  if (scientificRegistryKeys.has(registryKey)) {
    return {
      id: finding.id,
      file: finding.file,
      kind: finding.kind,
      line: finding.line,
      owner: finding.locator.owner,
      property: finding.property,
      literal: finding.literal,
      candidates: [],
      proposedToken: null,
      beigePrior: finding.literal,
      beigeEffective: finding.literal,
      beigeTarget: null,
      brightTarget: null,
      darkTarget: null,
      evidenceCategory: 'outside-tranche',
      confidence: 'excluded',
      before: finding.excerpt,
      after: null,
      reason: 'Scoped scientific registry row; do not propose ordinary token rewrites for this literal.',
    }
  }
  const automaticEvidence = tokensByValue.get(normalize(finding.literal)) ?? { names: [], beige: finding.literal, bright: null, dark: null }
  let reviewedEvidence = reviewed ? tokenEvidenceByName.get(reviewed.token) : undefined
  if (reviewed?.token.startsWith('--vg-')) {
    const semantic = ledgerEvidence.find((entry) => entry.token === reviewed.token)
    if (semantic) {
      reviewedEvidence = {
        names: [reviewed.token],
        beige: semantic.beigeEffective,
        bright: semantic.brightTarget,
        dark: semantic.darkTarget,
      }
    }
  }
  if (reviewed && (!reviewedEvidence || finding.file !== reviewed.file || finding.kind !== reviewed.kind || finding.locator.owner !== reviewed.owner || finding.property !== reviewed.property || equivalentColor(finding.literal) !== equivalentColor(reviewed.literal))) {
    throw new Error(`ledger/source mapping drift for ${finding.id}`)
  }
  const evidence = reviewedEvidence ?? automaticEvidence
  const names = reviewed ? [reviewed.token] : evidence.names
  const proposedToken = reviewed?.token ?? (names.length === 1 ? names[0]! : null)
  const common = {
    id: finding.id, file: finding.file, kind: finding.kind, line: finding.line,
    owner: finding.locator.owner, property: finding.property, literal: finding.literal,
    candidates: names, proposedToken, beigePrior: finding.literal, beigeEffective: evidence.beige,
    beigeTarget: proposedToken ? `var(${proposedToken})` : null,
    brightTarget: proposedToken ? evidence.bright : null, darkTarget: proposedToken ? evidence.dark : null,
  }
  const before = finding.excerpt
  if (finding.file !== 'src/App.css' || finding.kind !== 'css') {
    return {
      ...common, evidenceCategory: 'outside-tranche', confidence: 'excluded', before, after: null,
      reason: 'Planner tranche is limited to ordinary App.css CSS chrome; specialized/data/startup owners require a separate review.',
    }
  }
  if (reviewed) {
    return {
      ...common, evidenceCategory: 'exact-existing-token', confidence: 'high', before,
      after: before.replace(finding.literal, `var(${proposedToken})`),
      reason: `Explicit reviewed mapping to ${proposedToken}; Beige is equivalent and Bright/Dark values are recorded in the ledger.`,
    }
  }
  if (proposedToken && semanticMatch(finding, proposedToken)) {
    return {
      ...common, evidenceCategory: 'exact-existing-token', confidence: 'high', before,
      after: before.replace(finding.literal, `var(${proposedToken})`),
      reason: `Exact Beige match to the unique base-palette token ${proposedToken}; Bright/Dark values are recorded for review.`,
    }
  }
  return {
    ...common, evidenceCategory: names.length > 1 ? 'ambiguous-existing-tokens' : 'no-existing-token',
    confidence: names.length > 1 ? 'ambiguous' : 'unmatched', before, after: null,
    reason: names.length > 1
      ? 'Several base-palette tokens share this literal; retain it until the semantic role is reviewed.'
      : 'No existing non-startup base-palette token has this exact value.',
  }
}

export async function buildThemeMigrationPlan(options: {
  rootDir?: string
  tokenSource?: string
} = {}): Promise<ThemeMigrationPlan> {
  const rootDir = options.rootDir ?? DEFAULT_ROOT
  const tokenSource = options.tokenSource ?? resolve(rootDir, relative(DEFAULT_ROOT, DEFAULT_TOKEN_SOURCE))
  const [source, raw] = await Promise.all([
    readFile(tokenSource, 'utf8'),
    scanProject({ rootDir, mode: 'raw' }),
  ])
  assertNoSelfReferentialTokenFallbacks(source)
  const ledger = await readThemeMigrationLedger(rootDir)
  const manifestPath = resolve(rootDir, 'scripts/theme-debt-manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { findings: Array<{ id: string; file: string; kind: ThemeFinding['kind']; property: string; literal: string; locator: ThemeFinding['locator'] }> }
  const manifestById = new Map(manifest.findings.map((entry) => [entry.id, entry]))
  for (const finding of raw) {
    const entry = manifestById.get(finding.id)
    if (!entry) throw new Error(`raw finding ${finding.id} has no reviewed manifest row`)
    if (identity(entry) !== identity(finding)) throw new Error(`manifest locator or literal drift for ${finding.id}`)
  }
  const baseTokens = parseBaseThemeTokens(source, relative(rootDir, tokenSource))
  const schemeByName = schemeValues(source, baseTokens.map((token) => token.name))
  const tokensByValue = new Map<string, TokenEvidence>()
  const tokenEvidenceByName = new Map<string, TokenEvidence>()
  for (const token of baseTokens) {
    const evidence = tokensByValue.get(token.value) ?? { names: [], beige: token.value, bright: null, dark: null }
    evidence.names.push(token.name)
    const schemes = schemeByName.get(token.name)
    if (schemes?.bright) evidence.bright = schemes.bright
    if (schemes?.dark) evidence.dark = schemes.dark
    tokensByValue.set(token.value, evidence)
    tokenEvidenceByName.set(token.name, evidence)
  }
  const ledgerById = new Map(ledger.app.entries.map((entry) => [entry.id, entry]))
  const scientificRegistryKeys = await loadScientificRegistryKeys(resolve(rootDir, 'scripts/theme-scientific-color-registry.json'))
  const findings = raw.map((finding) => candidateFor(finding, tokensByValue, ledgerById.get(finding.id), tokenEvidenceByName, ledger.app.evidence, scientificRegistryKeys))
  for (const evidence of ledger.app.evidence) {
    if (evidence.token.startsWith('--vg-')) {
      const expected = expectedVgLedgerEvidence(source, evidence.token)
      if (
        normalize(evidence.beigeEffective ?? '') !== normalize(expected.beigeEffective ?? '')
        || evidence.beigeTarget !== expected.beigeTarget
        || normalize(evidence.brightTarget ?? '') !== normalize(expected.brightTarget ?? '')
        || normalize(evidence.darkTarget ?? '') !== normalize(expected.darkTarget ?? '')
      ) {
        throw new Error(`ledger semantic evidence drift for ${evidence.token}`)
      }
      continue
    }
    const token = baseTokens.find((candidate) => candidate.name === evidence.token)
    if (!token || normalize(evidence.beigeEffective ?? '') !== token.value || evidence.beigeTarget !== `var(${evidence.token})`) {
      throw new Error(`ledger scheme evidence drift for ${evidence.token}`)
    }
    const schemes = schemeByName.get(evidence.token)
    if (evidence.brightTarget !== (schemes?.bright ?? null) || evidence.darkTarget !== (schemes?.dark ?? null)) {
      throw new Error(`ledger Bright/Dark evidence drift for ${evidence.token}`)
    }
  }
  const groupsByKey = new Map<string, ThemeMigrationGroup>()
  for (const finding of findings) {
    const key = [finding.file, finding.owner, finding.property, finding.literal, finding.proposedToken ?? finding.confidence].join('|')
    const group = groupsByKey.get(key) ?? {
      file: finding.file, owner: finding.owner, property: finding.property, literal: finding.literal,
      proposedToken: finding.proposedToken, evidenceCategory: finding.evidenceCategory,
      beigePrior: finding.beigePrior, beigeEffective: finding.beigeEffective, beigeTarget: finding.beigeTarget,
      brightTarget: finding.brightTarget, darkTarget: finding.darkTarget,
      confidence: finding.confidence, findingIds: [],
      before: finding.before, after: finding.after,
    }
    group.findingIds.push(finding.id)
    groupsByKey.set(key, group)
  }
  const groups = [...groupsByKey.values()].filter((group) => group.confidence === 'high' || group.confidence === 'ambiguous').sort((left, right) =>
    left.file.localeCompare(right.file) || left.owner.localeCompare(right.owner) || left.property.localeCompare(right.property) || left.literal.localeCompare(right.literal))
  const count = (confidence: ThemeMigrationCandidate['confidence']) => findings.filter((finding) => finding.confidence === confidence).length
  return {
    version: 1,
    generatedBy: 'npm run plan:theme-migration',
    sourceManifest: 'scripts/theme-debt-manifest.json',
    tokenSource: relative(rootDir, tokenSource).replaceAll('\\', '/'),
    summary: {
      rawFindings: raw.length,
      consideredFindings: findings.filter((finding) => finding.file === 'src/App.css' && finding.kind === 'css').length,
      highConfidence: count('high'), ambiguous: count('ambiguous'), unmatched: count('unmatched'),
      excluded: count('excluded'), groups: groups.length,
    },
    groups,
    findings: findings.filter((finding) => finding.confidence === 'high' || finding.confidence === 'ambiguous'),
    applied: {
      ledger: 'scripts/theme-migration-ledger.json',
      app: { count: ledger.app.count, removalCount: ledger.app.removals.length, evidence: ledger.app.evidence },
      pickPrimers: {
        count: ledger.pickPrimers.count,
        removeCount: ledger.pickPrimers.entries.filter((entry) => entry.action === 'remove').length,
        replaceCount: ledger.pickPrimers.entries.filter((entry) => entry.action === 'replace').length,
      },
    },
  }
}

export async function writeThemeMigrationPlan(outputPath = DEFAULT_OUTPUT): Promise<ThemeMigrationPlan> {
  const plan = await buildThemeMigrationPlan()
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
  return plan
}

/** Validate an explicit approval list before any source file is touched. */
export function validateApprovalIds(plan: ThemeMigrationPlan, approvedIds: string[]): ThemeMigrationCandidate[] {
  const seen = new Set<string>()
  for (const id of approvedIds) {
    if (seen.has(id)) throw new Error(`duplicate approved finding ID ${id}`)
    seen.add(id)
  }
  const byId = new Map(plan.findings.map((finding) => [finding.id, finding]))
  const selected = approvedIds.map((id) => {
    const finding = byId.get(id)
    if (!finding) throw new Error(`unknown or stale approved finding ID ${id}`)
    if (finding.confidence !== 'high' || !finding.proposedToken) throw new Error(`finding ${id} is not a high-confidence mapping`)
    return finding
  })
  return selected
}

/**
 * Apply only an explicit, pre-reviewed ID list.  Every line is validated and
 * transformed in memory first; a failed match aborts before any write.
 */
export async function applyApprovedThemeMigration(plan: ThemeMigrationPlan, approvedIds: string[], rootDir = DEFAULT_ROOT): Promise<number> {
  const ledger = await readThemeMigrationLedger(rootDir)
  const ledgerById = new Map(ledger.app.entries.map((entry) => [entry.id, entry]))
  for (const id of approvedIds) if (!ledgerById.has(id)) throw new Error(`approved ID ${id} is not present in the explicit migration ledger`)
  const selected = validateApprovalIds(plan, approvedIds)
  for (const finding of selected) {
    const reviewed = ledgerById.get(finding.id)
    if (!reviewed || reviewed.owner !== finding.owner || reviewed.property !== finding.property || reviewed.literal !== finding.literal || reviewed.token !== finding.proposedToken) {
      throw new Error(`ledger/source mapping drift for ${finding.id}`)
    }
  }
  const byFile = new Map<string, ThemeMigrationCandidate[]>()
  for (const finding of selected) {
    const list = byFile.get(finding.file) ?? []
    list.push(finding)
    byFile.set(finding.file, list)
  }
  const replacements = new Map<string, string>()
  for (const [file, fileFindings] of byFile) {
    const path = resolve(rootDir, file)
    const original = await readFile(path, 'utf8')
    const lines = original.split('\n')
    for (const finding of fileFindings) {
      const index = finding.line - 1
      const sourceLine = lines[index]
      if (sourceLine === undefined) throw new Error(`finding ${finding.id} moved beyond line ${finding.line}`)
      const declaration = new RegExp(`(${finding.property}\\s*:[^;{}]*?)${escapeRegExp(finding.literal)}(?=[^#0-9a-z])`, 'i')
      const nextLine = sourceLine.replace(declaration, `$1var(${finding.proposedToken})`)
      if (nextLine === sourceLine) throw new Error(`finding ${finding.id} no longer matches ${file}:${finding.line}`)
      lines[index] = nextLine
    }
    replacements.set(path, lines.join('\n'))
  }
  for (const [path, contents] of replacements) await writeFile(path, contents, 'utf8')
  return selected.length
}

/** Remove only explicitly reviewed declarations proven shadowed by a later scheme rule. */
export async function applyApprovedThemeRemovals(approvedIds: string[], rootDir = DEFAULT_ROOT): Promise<number> {
  const ledger = await readThemeMigrationLedger(rootDir)
  const removalById = new Map(ledger.app.removals.map((entry) => [entry.id, entry]))
  const seen = new Set<string>()
  for (const id of approvedIds) {
    if (seen.has(id)) throw new Error(`duplicate approved shadow finding ID ${id}`)
    seen.add(id)
    if (!removalById.has(id)) throw new Error(`unknown or stale approved removal finding ID ${id}`)
  }
  const sourcePath = resolve(rootDir, 'src/App.css')
  const source = await readFile(sourcePath, 'utf8')
  assertThemeMigrationShadowContracts(source, ledger.app.removals, { allowRemoved: true })
  const raw = await scanProject({ rootDir, mode: 'raw' })
  const rawById = new Map(raw.map((finding) => [finding.id, finding]))
  const lines = source.split('\n')
  const approvedSet = new Set(approvedIds)
  const removedLines = new Set<number>()
  for (const id of approvedIds) {
    const entry = removalById.get(id)!
    const finding = rawById.get(id)
    if (!finding || finding.file !== entry.file || finding.kind !== entry.kind || finding.locator.owner !== entry.owner || finding.property !== entry.property || finding.literal !== entry.literal || finding.locator.anchor !== entry.sourceAnchor) {
      throw new Error(`removal source identity drift for ${id}`)
    }
    const index = finding.line - 1
    if (removedLines.has(index)) continue
    const line = lines[index]
    const declaration = new RegExp(`^\\s*${escapeRegExp(entry.property)}\\s*:\\s*([^;{}]*)\\s*;\\s*$`, 'i')
    const declarationMatch = line?.match(declaration)
    const sameLineFindings = raw.filter((candidate) => candidate.file === entry.file && candidate.kind === entry.kind && candidate.line === finding.line && candidate.locator.owner === entry.owner && candidate.property === entry.property)
    if (!declarationMatch || !new RegExp(escapeRegExp(entry.literal), 'i').test(declarationMatch[1]!) || sameLineFindings.some((candidate) => !approvedSet.has(candidate.id))) throw new Error(`removal source declaration drift for ${id}`)
    lines[index] = ''
    removedLines.add(index)
  }
  await writeFile(sourcePath, lines.join('\n'), 'utf8')
  return approvedIds.length
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const applyShadow = process.argv.includes('--apply-shadow')
  const idsArgument = process.argv.find((argument) => argument.startsWith('--ids='))?.slice('--ids='.length)
  if ((apply || applyShadow) && !idsArgument) throw new Error('Refusing to apply a migration without an explicit --ids=id1,id2 list.')
  const plan = await writeThemeMigrationPlan()
  if (apply) {
    const count = await applyApprovedThemeMigration(plan, idsArgument!.split(',').filter(Boolean))
    console.log(`Applied ${count} explicitly approved theme migrations.`)
    return
  }
  if (applyShadow) {
    const count = await applyApprovedThemeRemovals(idsArgument!.split(',').filter(Boolean))
    console.log(`Removed ${count} explicitly approved shadowed theme declarations.`)
    return
  }
  console.log(`Wrote ${plan.summary.highConfidence} high-confidence mappings in ${plan.summary.groups} reviewer groups to scripts/theme-migration-plan.json.`)
  console.log(`Ambiguous: ${plan.summary.ambiguous}; unmatched: ${plan.summary.unmatched}; excluded: ${plan.summary.excluded}.`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
}
