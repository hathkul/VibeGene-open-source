import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const LOCKED_MIGRATE_COUNT = 1
const LOCKED_MIGRATE_ID = '8e57e9f2760e4833'
const LOCKED_MIGRATE_TOKEN = '--vg-control-surface-hover'

const ALLOWED_MIGRATE_TOKENS = new Set([
  '--vg-control-surface',
  '--vg-control-surface-hover',
  '--vg-control-border',
  '--vg-control-ink',
  '--vg-interactive-hover',
  '--vg-interactive-selected',
  '--vg-interactive-selected-hover',
  '--vg-interactive-selected-ink',
  '--vg-focus',
])

const FORBIDDEN_MIGRATE_TOKENS = new Set([
  '--vg-disabled-ink',
  '--vg-disabled-surface',
  '--vg-disabled-border',
  '--vg-control-surface-pressed',
  '--vg-focus-ring',
])

const DEAD_CASCADE_REJECT_IDS = [
  'a013e7885111b605',
  '346337e85ec1262d',
  'ebc9e2df2cebe929',
  '5d23429f8f20f6a6',
  'a8ee5683b0f9a913',
] as const

/** Former Grok-lock rejects that must stay reject under the single-migrate lock. */
const MUST_REJECT_FORMER_LOCK_IDS = [
  '84fedbbe93928232',
  '0e467c7e0a41e887',
  '569ce2d397b2a4d4',
  '353915f991a690a7',
  'b196edc263745ea5',
  '46b343c8b4a24331',
  'e4b5edbce8a35b9f',
  '8f7004a97ec91a6d',
  'dd5b5808fafc8917',
  '1d000d9919f7ca24',
  '1d1539730723f0b9',
  '32df70160915363c',
  'e64b89f0c8b04bce',
  '32d531d70cd4f3cf',
  'a76d7738e06d89a1',
  'dcdf0779390b487c',
  '3373fd0b7e10ce4f',
  '3791633f37d01c3a',
  '65c612c619231da9',
  'd55cee7c157b1b59',
  '0e7870994bada9e2',
  '79ba05c2d8ee497c',
  'b705c7558fb2156b',
  '235c96ef19d9a308',
  '7146717d597b320d',
  'bb3a989d0a870c76',
  '19aa0a8008cf19c6',
  '86797b62b057d4b8',
  '70bb3ce38962006e',
  'c624cdadeca02706',
  '544c86c73d50adb3',
  '4d0ee8387859c36e',
  '8dc4ed21a1a56ec8',
] as const

type CandidateRow = {
  id: string
  disposition: 'migrate' | 'reject'
  proposedToken: string
  reason: string
  rationale: string
  state: string
  owner: string
  property: string
  literal: string
  mechanism: string
  baseSelector: string
  file: string
}

type InteractiveStateLedger = {
  acceptedCount: number
  migrateCount: number
  rejectedCount: number
  needsManualReviewCount: number
  countsByDisposition: Record<string, number>
  migrateByState: Record<string, number>
  migrateByToken: Record<string, number>
  migrateByProperty: Record<string, number>
  migrateByFile: Record<string, number>
  rows: CandidateRow[]
}

const LEDGER_PATH = resolve(import.meta.dirname, 'interactive-state-candidates.json')
const NEUTRAL_PATH = resolve(import.meta.dirname, 'neutral-text-chrome-candidates.json')

function groupMigrate(rows: CandidateRow[], key: 'state' | 'proposedToken' | 'property' | 'file'): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows.filter((r) => r.disposition === 'migrate')) {
    counts[row[key]] = (counts[row[key]] ?? 0) + 1
  }
  return counts
}

function sumRecord(record: Record<string, number>): number {
  return Object.values(record).reduce((total, count) => total + count, 0)
}

describe('interactive state candidate ledger', () => {
  const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as InteractiveStateLedger
  const priorInteractionIds = new Set(
    (JSON.parse(readFileSync(NEUTRAL_PATH, 'utf8')) as { rows: Array<{ id: string; reason: string }> }).rows
      .filter((r) => r.reason === 'interaction-or-state')
      .map((r) => r.id),
  )

  const migrateRows = ledger.rows.filter((r) => r.disposition === 'migrate')
  const rejectRows = ledger.rows.filter((r) => r.disposition === 'reject')

  it('keeps the single Grok migrate lock aligned with rows and summaries', () => {
    expect(ledger.needsManualReviewCount).toBe(0)
    expect(ledger.countsByDisposition['needs-manual-review']).toBe(0)
    expect(ledger.acceptedCount).toBe(LOCKED_MIGRATE_COUNT)
    expect(ledger.migrateCount).toBe(LOCKED_MIGRATE_COUNT)
    expect(migrateRows.length).toBe(LOCKED_MIGRATE_COUNT)
    expect(ledger.rejectedCount).toBe(rejectRows.length)
    expect(ledger.countsByDisposition.migrate).toBe(LOCKED_MIGRATE_COUNT)
    expect(ledger.countsByDisposition.reject).toBe(rejectRows.length)
    expect(migrateRows.length + rejectRows.length).toBe(ledger.rows.length)
    expect(ledger.migrateByState).toEqual(groupMigrate(ledger.rows, 'state'))
    expect(ledger.migrateByToken).toEqual(groupMigrate(ledger.rows, 'proposedToken'))
    expect(ledger.migrateByProperty).toEqual(groupMigrate(ledger.rows, 'property'))
    expect(ledger.migrateByFile).toEqual(groupMigrate(ledger.rows, 'file'))
    expect(sumRecord(ledger.migrateByState)).toBe(LOCKED_MIGRATE_COUNT)
    expect(sumRecord(ledger.migrateByToken)).toBe(LOCKED_MIGRATE_COUNT)
    expect(sumRecord(ledger.migrateByProperty)).toBe(LOCKED_MIGRATE_COUNT)
    expect(sumRecord(ledger.migrateByFile)).toBe(LOCKED_MIGRATE_COUNT)
  })

  it('has no duplicate ids and re-examines prior interaction-or-state rejects', () => {
    const seen = new Set<string>()
    for (const row of ledger.rows) {
      expect(seen.has(row.id)).toBe(false)
      seen.add(row.id)
    }
    for (const id of priorInteractionIds) {
      expect(seen.has(id), `missing re-examined interaction-or-state id ${id}`).toBe(true)
    }
  })

  it('allows only approved migrate tokens and required migrate row fields', () => {
    for (const row of migrateRows) {
      expect(ALLOWED_MIGRATE_TOKENS.has(row.proposedToken)).toBe(true)
      expect(FORBIDDEN_MIGRATE_TOKENS.has(row.proposedToken)).toBe(false)
      expect(row.rationale.length).toBeGreaterThan(0)
      expect(row.reason).toBe('')
      expect(row.state.length).toBeGreaterThan(0)
      expect(row.mechanism.length).toBeGreaterThan(0)
      expect(row.baseSelector.length).toBeGreaterThan(0)
    }
    for (const row of rejectRows) {
      expect(row.reason.length).toBeGreaterThan(0)
      expect(row.proposedToken).toBe('')
      expect(row.rationale).toBe('')
    }
  })

  it('locks the sole migrate row to button:hover control surface hover', () => {
    const row = ledger.rows.find((r) => r.id === LOCKED_MIGRATE_ID)
    expect(row?.disposition).toBe('migrate')
    expect(row?.proposedToken).toBe(LOCKED_MIGRATE_TOKEN)
    expect(row?.owner).toBe('button:hover')
    expect(row?.property).toBe('background')
    expect(migrateRows.map((r) => r.id)).toEqual([LOCKED_MIGRATE_ID])
  })

  it('rejects dead-cascade matrix owners that must not migrate yet', () => {
    for (const id of DEAD_CASCADE_REJECT_IDS) {
      const row = ledger.rows.find((r) => r.id === id)
      expect(row, `missing dead-cascade id ${id}`).toBeDefined()
      expect(row!.disposition).toBe('reject')
      expect(row!.proposedToken).toBe('')
      expect(row!.reason).toContain('dead-cascade')
    }
  })

  it('keeps former scientific/mixed/primary lock rejects rejected', () => {
    for (const id of MUST_REJECT_FORMER_LOCK_IDS) {
      const row = ledger.rows.find((r) => r.id === id)
      expect(row, `missing former lock id ${id}`).toBeDefined()
      expect(row!.disposition).toBe('reject')
      expect(row!.proposedToken).toBe('')
    }
  })
})
