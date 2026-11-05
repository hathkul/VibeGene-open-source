import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type TrancheRow = {
  role: string
  token: string
}

type SemanticPaletteTranche = {
  total: number
  byRole: Record<string, number>
  byToken: Record<string, number>
  rows: TrancheRow[]
}

const TRANCHE_PATH = resolve(import.meta.dirname, 'semantic-palette-tranche.json')

function groupCounts(rows: TrancheRow[], key: 'role' | 'token'): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const value = row[key]
    counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}

function sumRecord(record: Record<string, number>): number {
  return Object.values(record).reduce((total, count) => total + count, 0)
}

describe('semantic palette tranche manifest', () => {
  const tranche = JSON.parse(readFileSync(TRANCHE_PATH, 'utf8')) as SemanticPaletteTranche

  it('keeps total, byRole, and byToken aligned with rows', () => {
    const { rows } = tranche
    const byRoleFromRows = groupCounts(rows, 'role')
    const byTokenFromRows = groupCounts(rows, 'token')

    expect(tranche.total).toBe(rows.length)
    expect(sumRecord(tranche.byRole)).toBe(rows.length)
    expect(sumRecord(tranche.byToken)).toBe(rows.length)
    expect(tranche.byRole).toEqual(byRoleFromRows)
    expect(tranche.byToken).toEqual(byTokenFromRows)
  })
})
