import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  declarationContainsGradient,
  declarationIsShadowProperty,
  resolveFullDeclarationValue,
  type ManifestRow,
} from './compound-paint-declarations.ts'

const COMPOUND_CLASSES = [
  'generic-gradient',
  'generic-translucent-surface',
  'overlay-or-scrim',
  'elevation-or-shadow',
  'scheme-override',
  'generic-diagram-chrome',
  'scientific-data',
  'dead-or-shadowed',
  'defer-with-specific-reason',
] as const

type CompoundClass = (typeof COMPOUND_CLASSES)[number]

type CompoundGroup = {
  compoundClass: CompoundClass
  migrate: boolean
  findingCount: number
  enforcedCount: number
  findingIds: string[]
  enforcedIds: string[]
  destinationToken: string
  property: string
}

type CompoundPlan = {
  version: number
  sourceCounts: { rawFindings: number; enforcedBaseline: number; scientificRegistry: number }
  outcomeTotals: {
    declarations: Record<CompoundClass, number>
    raw: Record<CompoundClass, number>
    enforced: Record<CompoundClass, number>
  }
  projectedEnforcedRetirement: number
  revisedBy: string
  unifiedScientificRegistry: {
    pendingAdmissions: Array<{ id: string; file: string; owner: string; property: string; literal: string; biologicalReason: string }>
    resolutions: Record<string, { decision: string; file: string; owner: string; property: string; literal: string; biologicalReason: string }>
  }
  groups: CompoundGroup[]
}

const PLAN_PATH = resolve(import.meta.dirname, 'compound-paint-groups.json')
const MANIFEST_PATH = resolve(import.meta.dirname, 'theme-debt-manifest.json')
const MIGRATE_CLASSES: CompoundClass[] = [
  'generic-gradient',
  'generic-translucent-surface',
  'overlay-or-scrim',
  'elevation-or-shadow',
  'scheme-override',
  'generic-diagram-chrome',
  'dead-or-shadowed',
]

describe('compound paint grouping plan', () => {
  const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8')) as CompoundPlan
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { findings: ManifestRow[] }
  const manifestIds = manifest.findings.map((row) => row.id)
  const classByFinding = new Map<string, CompoundClass>()
  for (const group of plan.groups) {
    for (const id of group.findingIds) classByFinding.set(id, group.compoundClass)
  }

  it('covers every raw finding exactly once with computed totals', () => {
    const seen = new Set<string>()
    let rawFromGroups = 0
    const rawByClass: Record<CompoundClass, number> = Object.fromEntries(COMPOUND_CLASSES.map((c) => [c, 0])) as Record<
      CompoundClass,
      number
    >
    const enforcedByClass: Record<CompoundClass, number> = Object.fromEntries(COMPOUND_CLASSES.map((c) => [c, 0])) as Record<
      CompoundClass,
      number
    >
    const declarationsByClass: Record<CompoundClass, number> = Object.fromEntries(COMPOUND_CLASSES.map((c) => [c, 0])) as Record<
      CompoundClass,
      number
    >

    for (const group of plan.groups) {
      rawFromGroups += group.findingCount
      rawByClass[group.compoundClass] += group.findingCount
      enforcedByClass[group.compoundClass] += group.enforcedCount
      declarationsByClass[group.compoundClass] += 1
      expect(group.findingIds).toHaveLength(group.findingCount)
      expect(group.enforcedIds).toHaveLength(group.enforcedCount)
      for (const id of group.findingIds) {
        expect(seen.has(id), `duplicate id ${id}`).toBe(false)
        seen.add(id)
      }
      expect(group.enforcedCount).toBe(0)
      expect(group.enforcedIds).toEqual([])
    }

    expect(seen.size).toBe(manifestIds.length)
    expect(rawFromGroups).toBe(plan.sourceCounts.rawFindings)
    for (const id of manifestIds) expect(seen.has(id), `missing id ${id}`).toBe(true)

    for (const compoundClass of COMPOUND_CLASSES) {
      expect(plan.outcomeTotals.raw[compoundClass]).toBe(rawByClass[compoundClass])
      expect(plan.outcomeTotals.enforced[compoundClass]).toBe(enforcedByClass[compoundClass])
      expect(plan.outcomeTotals.declarations[compoundClass]).toBe(declarationsByClass[compoundClass])
    }

    let computedRetirement = 0
    for (const group of plan.groups) {
      if (group.migrate && MIGRATE_CLASSES.includes(group.compoundClass)) computedRetirement += group.enforcedCount
    }
    expect(plan.projectedEnforcedRetirement).toBe(computedRetirement)
    expect(plan.projectedEnforcedRetirement).toBe(0)
    expect(plan.revisedBy).toBe('grok-approve-with-rule-changes')
    expect(plan.sourceCounts.rawFindings).toBe(manifestIds.length)
    expect(plan.sourceCounts.enforcedBaseline).toBe(0)
    expect(plan.sourceCounts.scientificRegistry).toBe(manifestIds.length)
  })

  it('does not classify gradient or multi-part shadow declarations as solid scheme overrides', async () => {
    let gradientMisclassified = 0
    let shadowMisclassified = 0
    for (const row of manifest.findings) {
      const { value } = await resolveFullDeclarationValue(row)
      const fullValue = value ?? row.literal
      const compoundClass = classByFinding.get(row.id)
      expect(compoundClass, `missing class for ${row.id}`).toBeDefined()
      if (declarationContainsGradient(fullValue)) {
        if (compoundClass === 'scheme-override') gradientMisclassified += 1
        expect(['generic-gradient', 'scientific-data', 'defer-with-specific-reason', 'dead-or-shadowed']).toContain(compoundClass)
      }
      if (declarationIsShadowProperty(row.property) && /\s/.test(fullValue.trim()) && /#|rgb|hsl/i.test(fullValue)) {
        if (compoundClass === 'scheme-override') shadowMisclassified += 1
        expect(['elevation-or-shadow', 'scientific-data', 'defer-with-specific-reason', 'dead-or-shadowed']).toContain(compoundClass)
      }
    }
    expect(gradientMisclassified, 'gradient declaration classified as scheme-override').toBe(0)
    expect(shadowMisclassified, 'shadow-list finding classified as scheme-override').toBe(0)
  })

  it('documents unified scientific registry proposal for primer base rows', () => {
    for (const target of ['9307b5e2eff9c433', 'a133c1e5ee018431'] as const) {
      const pending = plan.unifiedScientificRegistry.pendingAdmissions.find((row) => row.id === target)
      expect(pending).toBeDefined()
      expect(pending!.file).toBe('src/App.css')
      expect(pending!.owner.length).toBeGreaterThan(0)
      expect(pending!.literal).toBe('#f2e9ff')
      expect(plan.unifiedScientificRegistry.resolutions[target]?.decision).toBe('scientific-registration')
    }
    for (const row of plan.unifiedScientificRegistry.pendingAdmissions) {
      expect(row.file.length).toBeGreaterThan(0)
      expect(row.owner.length).toBeGreaterThan(0)
      expect(row.owner).not.toMatch(/\*/)
    }
  })
})
