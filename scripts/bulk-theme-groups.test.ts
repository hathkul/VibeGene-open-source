import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type Outcome = 'generic-ui' | 'semantic-feedback' | 'scientific-data' | 'dead-or-shadowed' | 'special-exception'

type BulkGroup = {
  outcome: Outcome
  findingCount: number
  enforcedCount: number
  findingIds: string[]
}

type BulkPlan = {
  sourceCounts: { rawFindings: number; enforcedBaseline: number }
  outcomeTotals: { raw: Record<Outcome, number>; enforced: Record<Outcome, number> }
  projectedEnforcedRetirement: number
  groups: BulkGroup[]
}

const PLAN_PATH = resolve(import.meta.dirname, 'bulk-theme-groups.json')
const MANIFEST_PATH = resolve(import.meta.dirname, 'theme-debt-manifest.json')
const OUTCOMES: Outcome[] = ['generic-ui', 'semantic-feedback', 'scientific-data', 'dead-or-shadowed', 'special-exception']

describe('bulk theme grouping plan', () => {
  const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8')) as BulkPlan
  const manifestIds = (JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { findings: Array<{ id: string }> }).findings.map(
    (row) => row.id,
  )

  it('covers every raw finding exactly once with matching totals', () => {
    const seen = new Set<string>()
    let rawFromGroups = 0
    let enforcedFromGroups = 0
    const rawByOutcome: Record<Outcome, number> = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>
    const enforcedByOutcome: Record<Outcome, number> = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>

    for (const group of plan.groups) {
      rawFromGroups += group.findingCount
      enforcedFromGroups += group.enforcedCount
      rawByOutcome[group.outcome] += group.findingCount
      enforcedByOutcome[group.outcome] += group.enforcedCount
      expect(group.findingIds).toHaveLength(group.findingCount)
      for (const id of group.findingIds) {
        expect(seen.has(id), `duplicate id ${id}`).toBe(false)
        seen.add(id)
      }
    }

    expect(seen.size).toBe(manifestIds.length)
    expect(rawFromGroups).toBe(plan.sourceCounts.rawFindings)
    expect(rawFromGroups).toBe(manifestIds.length)
    for (const id of manifestIds) {
      expect(seen.has(id), `missing id ${id}`).toBe(true)
    }

    for (const outcome of OUTCOMES) {
      expect(plan.outcomeTotals.raw[outcome]).toBe(rawByOutcome[outcome])
      expect(plan.outcomeTotals.enforced[outcome]).toBe(enforcedByOutcome[outcome])
    }

    const computedRetirement =
      plan.outcomeTotals.enforced['generic-ui'] +
      plan.outcomeTotals.enforced['semantic-feedback'] +
      plan.outcomeTotals.enforced['dead-or-shadowed']

    expect(plan.projectedEnforcedRetirement).toBe(computedRetirement)
    expect(enforcedFromGroups).toBe(
      plan.outcomeTotals.enforced['generic-ui'] +
        plan.outcomeTotals.enforced['semantic-feedback'] +
        plan.outcomeTotals.enforced['scientific-data'] +
        plan.outcomeTotals.enforced['dead-or-shadowed'] +
        plan.outcomeTotals.enforced['special-exception'],
    )
    expect(plan.projectedEnforcedRetirement).toBe(0)
    expect(plan.sourceCounts.enforcedBaseline).toBe(0)
    expect(plan.revisedBy).toBe('grok-approve-with-rule-changes')
    expect(plan.proofChecks?.motifHitF8e16c?.outcome).toBe('scientific-data')
    expect(plan.proofChecks?.linearPrimerPolyline?.outcome).toBe('scientific-data')
    for (const group of plan.groups) {
      if (group.rationale.includes('uncommon chrome')) {
        expect.fail(`generic exception rationale on group ${group.groupId}`)
      }
    }
  })
})
