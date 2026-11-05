import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  computeThemeClosureAccounting,
  type ThemeClosureAccounting,
} from './theme-closure-accounting.ts'

const ACCOUNTING_PATH = resolve(import.meta.dirname, 'theme-closure-accounting.json')
const MANIFEST_PATH = resolve(import.meta.dirname, 'theme-debt-manifest.json')
const REGISTRY_PATH = resolve(import.meta.dirname, 'theme-scientific-color-registry.json')

describe('theme closure accounting', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { findings: Array<{ id: string; classification: string }> }
  const manifestIds = manifest.findings.map((f) => f.id)
  const registryCount = (JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as { findings: unknown[] }).findings.length

  it('recomputes closure from live scans and matches committed JSON', async () => {
    const live = await computeThemeClosureAccounting()
    const committed = JSON.parse(readFileSync(ACCOUNTING_PATH, 'utf8')) as ThemeClosureAccounting

    expect(live.sourceCounts).toEqual(committed.sourceCounts)
    expect(live.baselineIdentity).toEqual(committed.baselineIdentity)
    expect(live.enforcedDispositionTotals).toEqual(committed.enforcedDispositionTotals)
    expect(live.nonScientificRawOutcomeTotals).toEqual(committed.nonScientificRawOutcomeTotals)

    const covered = new Set(live.groups.flatMap((group) => group.findingIds))
    for (const id of manifestIds) {
      expect(covered.has(id), `missing group coverage for ${id}`).toBe(true)
    }
  }, 30_000)

  it('records a zero enforced baseline with only scientific raw rows', () => {
    const accounting = JSON.parse(readFileSync(ACCOUNTING_PATH, 'utf8')) as ThemeClosureAccounting

    expect(accounting.sourceCounts.rawFindings).toBe(manifestIds.length)
    expect(accounting.sourceCounts.enforcedBaseline).toBe(0)
    expect(accounting.sourceCounts.liveEnforcedScan).toBe(0)
    expect(accounting.sourceCounts.scientificRegistry).toBe(registryCount)
    expect(accounting.sourceCounts.nonScientificRaw).toBe(0)
    expect(accounting.baselineIdentity.enforcedCount).toBe(0)
    expect(accounting.nonScientificRawOutcomeTotals['scientific-data']).toBe(manifestIds.length)
    expect(accounting.enforcedDispositionTotals['migrate-existing-token']).toBe(0)
  })

  it('covers every raw id in scientific registry groups only', () => {
    const accounting = JSON.parse(readFileSync(ACCOUNTING_PATH, 'utf8')) as ThemeClosureAccounting
    const covered = new Set(accounting.groups.flatMap((group) => group.findingIds))
    expect(covered.size).toBe(manifestIds.length)
    for (const group of accounting.groups) {
      expect(group.enforcedCount).toBe(0)
      expect(group.nonScientificRawOutcome ?? 'scientific-data').toBe('scientific-data')
    }
  })
})
