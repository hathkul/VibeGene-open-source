import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ALLOWED_MIGRATE_TOKENS = new Set([
  '--vg-text',
  '--vg-text-strong',
  '--vg-text-muted',
  '--vg-control-ink',
  '--vg-surface-inset',
  '--vg-surface-panel',
  '--vg-surface-panel-muted',
  '--vg-border',
  '--vg-control-border',
  '--vg-control-surface',
])

const FORBIDDEN_ACCEPTED_TOKENS = new Set(['--vg-surface-raised', '--vg-chip-border', '--vg-chip-surface', '--vg-table-head'])

/** Grok-locked cuts: must never remain accepted (disposition migrate). */
const GROK_CUT_IDS = new Set([
  '7d5273b2a83f2bc3',
  'a4d7acdbe83526e9',
  '9142476fcff64c64',
  '0d70deeeba3b34f1',
  'b8c3a623e8e168e7',
  'fe293d2d78868e19',
  '218a6c26f3e21b61',
  '7612178805d55d22',
  '311de9b701379d36',
  'bb30cb945b53003a',
  '8b2c950c072d342f',
  '4323a3311ebfa6f9',
  '1f9be0facb65904a',
  'f1ac571e44be1d9c',
  '4943edc482f04131',
  '146ba608681e8a21',
  'dc87f4977911ade0',
  'c727ab51025398dc',
  '22839fcc3962599b',
  '8ffa24231b349e34',
  'a1698c50a17ae072',
  '7aec7486e2ede13a',
  '1aab720cc0c68bbf',
  '1d667d0a155f799d',
  '8af6716770f6d5f8',
  '10fcd1be689b25d9',
  '88ec3e3038770bc6',
  '10f64e8ab1b90abb',
  '21964677585c28d8',
  '7fb16417c7f8bd05',
  '98aea0a34a5eae52',
  '038b582c195c7f6b',
  '205348fc67378409',
  '800277740a2bbbb6',
  '77ef03007b30fb6b',
  'b35381a161bd2e82',
  'd21cf7cbb75ad7de',
  'f2d779a3eea0e2da',
  'b16ffad39ad96148',
  '735d5a0dd4726585',
  '2ff2e896c9696686',
  'ea5da6cca012f879',
  'e1cea3bc9d2d9c2a',
  '4339b8bae0388cb4',
  '4230094885adb7f8',
  '29e5d1a26a12e175',
  '3690abf1a50483c4',
  'f22590c71eeae7e9',
  '5c65c9391fbb1acf',
  '1460fbc9df9894c7',
  '26534c2c9658b059',
  '2808401173269a7b',
  'eb8976a3396017b3',
  '8af509694a98e230',
  'fb1feb87273f6d1c',
  '152a94e5cbf882d3',
  'bc0995e6ad134166',
  '5a08dd42c173912c',
  'a431cbe1141a95b3',
  '3f16f731799aba3e',
  'e033daa590e56b99',
  '02a1f30ce515e60d',
  'e80b019f678cfa4c',
  '039c90ee007e41c2',
  'dcc953d9da02a538',
  'a45fc899dbc9fcf1',
  '91eabadb9d5ad271',
  '7f58530e399854e8',
  '7d640af99dfdb3ea',
  '12847bb824d3cbe5',
  'd419acd06c3506b4',
  '7798469e45ab2c9a',
  'd30ed12d7c04ce7b',
  '6a22e8a88cf5ca8c',
  '5d3ec1e0b6e32c74',
  '07e1ffcec507a1be',
  'a68b009b4ede51a4',
  '1c6d9c6b704c8c08',
  'e778252d59fd9225',
  '57988ea89bf29ea5',
  '283db19c3aacad80',
  '705a5bd5f56ab99c',
  '2691e5ac6ea77a22',
  'a0b98af7830754c5',
  '2e519ecbd4633e11',
  'd4fa3f4b54fe8b34',
  '8d39f8f478146a70',
  'ce7ec7db5e1387f1',
  '4c06dc371d78d444',
])

const GROK_LOCKED_ACCEPTED_COUNT = 85

type CandidateRow = {
  id: string
  file: string
  owner: string
  property: string
  literal: string
  proposedToken: string
  role: string
  disposition: 'migrate' | 'reject' | 'needs-manual-review'
  reason: string
}

type CandidateLedger = {
  acceptedCount: number
  migrateCount: number
  rejectedCount: number
  countsByDisposition: Record<string, number>
  migrateByRole: Record<string, number>
  migrateByToken: Record<string, number>
  migrateByProperty: Record<string, number>
  migrateByFile: Record<string, number>
  rows: CandidateRow[]
}

const LEDGER_PATH = resolve(import.meta.dirname, 'neutral-text-chrome-candidates.json')
function groupAccepted(rows: CandidateRow[], key: 'role' | 'proposedToken' | 'property' | 'file'): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows.filter((r) => r.disposition === 'migrate')) {
    const value = row[key]
    counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}

function sumRecord(record: Record<string, number>): number {
  return Object.values(record).reduce((total, count) => total + count, 0)
}

describe('neutral text chrome candidate ledger', () => {
  const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as CandidateLedger
  const migrationLedger = JSON.parse(readFileSync(resolve(import.meta.dirname, 'theme-migration-ledger.json'), 'utf8')) as {
    app: { entries: Array<{ id: string }> }
    pickPrimers: { entries: Array<{ id: string }> }
  }
  const migratedIds = new Set([
    ...migrationLedger.app.entries.map((entry) => entry.id),
    ...migrationLedger.pickPrimers.entries.map((entry) => entry.id),
  ])
  const acceptedRows = ledger.rows.filter((r) => r.disposition === 'migrate')
  const rejectedRows = ledger.rows.filter((r) => r.disposition === 'reject')

  it('keeps declared totals and migrate summaries aligned with accepted rows', () => {
    expect(ledger.acceptedCount).toBe(GROK_LOCKED_ACCEPTED_COUNT)
    expect(acceptedRows.length).toBe(GROK_LOCKED_ACCEPTED_COUNT)
    expect(ledger.migrateCount).toBe(GROK_LOCKED_ACCEPTED_COUNT)
    expect(ledger.rejectedCount).toBe(rejectedRows.length)
    expect(ledger.countsByDisposition.migrate).toBe(acceptedRows.length)
    expect(ledger.countsByDisposition.reject).toBe(rejectedRows.length)
    expect(ledger.migrateByRole).toEqual(groupAccepted(ledger.rows, 'role'))
    expect(ledger.migrateByToken).toEqual(groupAccepted(ledger.rows, 'proposedToken'))
    expect(ledger.migrateByProperty).toEqual(groupAccepted(ledger.rows, 'property'))
    expect(ledger.migrateByFile).toEqual(groupAccepted(ledger.rows, 'file'))
    expect(sumRecord(ledger.migrateByRole)).toBe(acceptedRows.length)
    expect(sumRecord(ledger.migrateByToken)).toBe(acceptedRows.length)
    expect(sumRecord(ledger.migrateByProperty)).toBe(acceptedRows.length)
    expect(sumRecord(ledger.migrateByFile)).toBe(acceptedRows.length)
  })

  it('has no duplicate or overlapping accepted/rejected ids', () => {
    const seen = new Set<string>()
    const acceptedIds = new Set<string>()
    const rejectedIds = new Set<string>()
    for (const row of ledger.rows) {
      expect(seen.has(row.id)).toBe(false)
      seen.add(row.id)
      if (row.disposition === 'migrate') acceptedIds.add(row.id)
      if (row.disposition === 'reject') rejectedIds.add(row.id)
    }
    for (const id of acceptedIds) {
      expect(rejectedIds.has(id)).toBe(false)
    }
  })

  it('validates accepted rows, manifest membership, and Grok cuts', () => {
    for (const row of acceptedRows) {
      expect(row.id.length).toBeGreaterThan(0)
      expect(row.file.length).toBeGreaterThan(0)
      expect(row.owner.length).toBeGreaterThan(0)
      expect(row.property.length).toBeGreaterThan(0)
      expect(row.literal.length).toBeGreaterThan(0)
      expect(row.role.length).toBeGreaterThan(0)
      expect(row.reason.length).toBeGreaterThan(0)
      expect(migratedIds.has(row.id)).toBe(true)
      expect(ALLOWED_MIGRATE_TOKENS.has(row.proposedToken)).toBe(true)
      expect(FORBIDDEN_ACCEPTED_TOKENS.has(row.proposedToken)).toBe(false)
      expect(GROK_CUT_IDS.has(row.id)).toBe(false)
      expect(row.proposedToken.startsWith('--vg-')).toBe(true)
    }

    for (const cutId of GROK_CUT_IDS) {
      const row = ledger.rows.find((r) => r.id === cutId)
      expect(row, `missing cut id ${cutId}`).toBeDefined()
      expect(row!.disposition).toBe('reject')
    }

    for (const row of rejectedRows) {
      expect(row.reason.length).toBeGreaterThan(0)
      expect(row.proposedToken).toBe('')
      expect(row.role).toBe('')
    }
  })
})
