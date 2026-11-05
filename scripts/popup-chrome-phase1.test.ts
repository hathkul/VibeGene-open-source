import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanSource, type ThemeFinding } from './check-theme-colors.ts'

const ROOT = resolve(import.meta.dirname, '..')
const LEDGER_PATH = resolve(import.meta.dirname, 'popup-chrome-phase1-inventory.json')
const CURRENT_THEME_LEDGER_PATH = resolve(import.meta.dirname, 'theme-migration-ledger.json')
type LedgerEntry = {
  file: string
  selector: string
  property: string
  originalValue: string
  currentValue: string
  token: string
  scannerOccurrenceCount: number
  role: string
  state: string
}

type PhaseLedger = {
  version: number
  schemaNotes: {
    declarationOwnership: string
    projectFingerprintSetDelta: string
  }
  baseCommit: string
  startingBaselineCount: number
  finalBaselineCount: number
  projectFingerprintSetDeltaCount: number
  includedMigrationCount: number
  included: LedgerEntry[]
}

const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as PhaseLedger
const currentThemeLedger = JSON.parse(readFileSync(CURRENT_THEME_LEDGER_PATH, 'utf8')) as {
  app: { count: number; entries: Array<{ file: string }> }
  pickPrimers: { count: number; entries: Array<{ file: string }> }
}

function readCss(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8')
}

function extractBlock(css: string, needleIndex: number): string | null {
  const open = css.indexOf('{', needleIndex)
  if (open < 0) return null
  let depth = 0
  for (let pos = open; pos < css.length; pos += 1) {
    const ch = css[pos]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, pos)
    }
  }
  return null
}

function ruleBlock(css: string, selector: string, property?: string): string | null {
  const selectorPattern = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const selectorRe = new RegExp(`${selectorPattern}\\s*\\{`)
  const match = selectorRe.exec(css)
  if (!match) return null
  const block = extractBlock(css, match.index)
  if (!block) return null
  if (!property || declarationValue(block, property)) return block
  return null
}

function declarationValue(block: string, property: string): string | null {
  const match = block.match(new RegExp(`${property}\\s*:\\s*([\\s\\S]*?);`))
  return match?.[1]?.replace(/\s+/g, ' ').trim() ?? null
}

function norm(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}

function literalNeedle(originalValue: string): string {
  const hex = originalValue.match(/#[0-9a-f]{3,8}/i)?.[0]
  return (hex ?? originalValue).toLowerCase()
}

function syntheticRuleCss(selector: string, blockBody: string): string {
  const trimmed = blockBody
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n  ')
  return `${selector} {\n  ${trimmed}\n}\n`
}

function syntheticFilePath(entry: LedgerEntry): string {
  const slug = entry.selector.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')
  return `synthetic/popup-chrome-phase1/${slug}.css`
}

function findingsMatchingLiteral(findings: ThemeFinding[], property: string, literal: string): ThemeFinding[] {
  const needle = literal.toLowerCase()
  return findings.filter((finding) => finding.property === property && finding.literal.toLowerCase() === needle)
}

describe('popup chrome phase 1 (locked five-declaration tranche)', () => {
  it('documents ledger metadata without project-ID ownership claims', () => {
    expect(ledger.version).toBeGreaterThanOrEqual(4)
    expect(ledger.includedMigrationCount).toBe(5)
    expect(ledger.included).toHaveLength(5)
    expect(ledger.startingBaselineCount).toBe(1999)
    expect(ledger.finalBaselineCount).toBe(1994)
    expect(ledger.projectFingerprintSetDeltaCount).toBe(5)
    expect(ledger.included.reduce((sum, entry) => sum + entry.scannerOccurrenceCount, 0)).toBe(5)
    expect(ledger.schemaNotes.declarationOwnership).toMatch(/selector context/i)
    expect(ledger.schemaNotes.projectFingerprintSetDelta).toMatch(/occurrence/i)
    expect(Object.prototype.hasOwnProperty.call(ledger as object, 'removedFingerprintIds')).toBe(false)
  })

  it('joins each migration to scanner behavior on isolated base vs current rules', () => {
    const currentAppCss = readCss('src/App.css')

    for (const entry of ledger.included) {
      const baseBlock = `${entry.property}: ${entry.originalValue};`
      const currentBlock = ruleBlock(currentAppCss, entry.selector, entry.property)
      expect(currentBlock, `missing current rule ${entry.selector}`).toBeTruthy()

      const baseDecl = declarationValue(baseBlock, entry.property)!
      const currentDecl = declarationValue(currentBlock!, entry.property)!
      expect(norm(baseDecl)).toContain(norm(entry.originalValue))
      expect(norm(currentDecl)).toContain(norm(entry.currentValue))
      expect(norm(currentDecl)).toContain(norm(entry.token))
      expect(norm(currentDecl)).not.toContain(literalNeedle(entry.originalValue))

      const scanFile = syntheticFilePath(entry)
      const baseFindings = scanSource(scanFile, syntheticRuleCss(entry.selector, baseBlock))
      const currentFindings = scanSource(scanFile, syntheticRuleCss(entry.selector, currentBlock!))
      const literal = literalNeedle(entry.originalValue)

      const baseLiteralFindings = findingsMatchingLiteral(baseFindings, entry.property, literal)
      expect(baseLiteralFindings).toHaveLength(entry.scannerOccurrenceCount)
      expect(findingsMatchingLiteral(currentFindings, entry.property, literal)).toHaveLength(0)
    }
  })

  it('verifies live CSS rule blocks still match the ledger current values', () => {
    const currentAppCss = readCss('src/App.css')
    for (const entry of ledger.included) {
      const block = ruleBlock(currentAppCss, entry.selector, entry.property)
      expect(block, `missing live rule ${entry.selector}`).toBeTruthy()
      const value = declarationValue(block!, entry.property)!
      expect(norm(value)).toContain(norm(entry.currentValue))
      expect(norm(value)).toContain(norm(entry.token))
      expect(norm(value)).not.toContain(literalNeedle(entry.originalValue))
    }
  })

  it('keeps the current tranche scope explicit in its authoritative ledger', () => {
    expect(currentThemeLedger.app.count).toBe(424)
    expect(currentThemeLedger.pickPrimers.count).toBe(33)
    expect(currentThemeLedger.app.entries).toHaveLength(424)
    expect(currentThemeLedger.pickPrimers.entries).toHaveLength(33)
    expect(currentThemeLedger.app.entries.every((entry) => entry.file === 'src/App.css')).toBe(true)
    expect(currentThemeLedger.pickPrimers.entries.every((entry) => entry.file === 'src/PickPrimersDialog.css')).toBe(true)
  })
})
