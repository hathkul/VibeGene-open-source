/**
 * Machine-checked reconciliation of enforced baseline vs raw manifest vs registry.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { scanProject } from './check-theme-colors.ts'
import {
  closureGroupId,
  isScientificRawFinding,
  ownerFamily,
  resolveClosureRow,
  scientificRationale,
  type EnforcedDisposition,
  type ManifestFinding,
  type NonScientificRawOutcome,
} from './theme-closure-classification.ts'

export type { EnforcedDisposition, NonScientificRawOutcome }

export type ClosureGroup = {
  groupId: string
  ownerFamily: string
  property: string
  literal: string
  destinationOrRegistry: string
  roleHonesty: string
  enforcedDisposition?: EnforcedDisposition
  nonScientificRawOutcome?: NonScientificRawOutcome
  files: string[]
  rawCount: number
  enforcedCount: number
  findingIds: string[]
}

export type ThemeClosureAccounting = {
  version: 1
  generatedBy: string
  sourceCounts: {
    rawFindings: number
    enforcedBaseline: number
    scientificRegistry: number
    liveRawScan: number
    liveEnforcedScan: number
    nonScientificRaw: number
  }
  baselineIdentity: {
    enforcedCount: number
    nonScientificRawCount: number
    scientificInBaseline: number
    nonScientificNotInBaseline: number
    enforcedMinusNonScientificRaw: number
    scientificInBaselineMinusNonScientificNotInBaseline: number
  }
  enforcedDispositionTotals: Record<EnforcedDisposition, number>
  nonScientificRawOutcomeTotals: Record<NonScientificRawOutcome, number>
  unmigratableScientificFamilies: Array<{
    ownerFamily: string
    property: string
    enforcedCount: number
    rationale: string
  }>
  groups: ClosureGroup[]
}

const SCRIPT_DIR = resolve(import.meta.dirname)
const MANIFEST_PATH = resolve(SCRIPT_DIR, 'theme-debt-manifest.json')
const REGISTRY_PATH = resolve(SCRIPT_DIR, 'theme-scientific-color-registry.json')

const ENFORCED_DISPOSITIONS: EnforcedDisposition[] = [
  'migrate-existing-token',
  'register-scientific',
  'delete-dead',
  'correct-stale-accounting',
]

const NON_SCIENTIFIC_OUTCOMES: NonScientificRawOutcome[] = [
  'ordinary-ui',
  'interaction-state',
  'feedback-state',
  'scientific-data',
  'dead-or-redundant',
]

function emptyDispositionTotals(): Record<EnforcedDisposition, number> {
  return Object.fromEntries(ENFORCED_DISPOSITIONS.map((d) => [d, 0])) as Record<EnforcedDisposition, number>
}

function emptyOutcomeTotals(): Record<NonScientificRawOutcome, number> {
  return Object.fromEntries(NON_SCIENTIFIC_OUTCOMES.map((d) => [d, 0])) as Record<NonScientificRawOutcome, number>
}

export type ComputeOptions = {
  rootDir?: string
  manifestPath?: string
  registryPath?: string
}

export async function computeThemeClosureAccounting(options: ComputeOptions = {}): Promise<ThemeClosureAccounting> {
  const rootDir = options.rootDir ?? resolve(SCRIPT_DIR, '..')
  const manifestPath = options.manifestPath ?? MANIFEST_PATH
  const registryPath = options.registryPath ?? REGISTRY_PATH

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { findings: ManifestFinding[] }
  const registry = JSON.parse(await readFile(registryPath, 'utf8')) as { findings: Array<{ id: string }> }
  const registryIds = new Set(registry.findings.map((r) => r.id))

  const liveRaw = await scanProject({ rootDir, mode: 'raw' })
  const liveEnforced = await scanProject({ rootDir, mode: 'enforced' })
  const liveRawIds = new Set(liveRaw.map((f) => f.id))
  const liveEnforcedIds = new Set(liveEnforced.map((f) => f.id))

  if (liveEnforced.length !== 0) {
    throw new Error(`Live enforced scan must be empty after closure; found ${liveEnforced.length}.`)
  }

  if (liveRawIds.size !== manifest.findings.length) {
    throw new Error(`Live raw scan (${liveRawIds.size}) does not match manifest (${manifest.findings.length}).`)
  }
  for (const row of manifest.findings) {
    if (!liveRawIds.has(row.id)) throw new Error(`Manifest row ${row.id} missing from live raw scan.`)
  }

  const nonScientificRaw = manifest.findings.filter((f) => !isScientificRawFinding(f, registryIds))
  const nonScientificRawCount = nonScientificRaw.length
  if (nonScientificRawCount !== 0) {
    throw new Error(`Expected zero non-scientific raw rows; found ${nonScientificRawCount}.`)
  }

  const baselineIdentity = {
    enforcedCount: 0,
    nonScientificRawCount: 0,
    scientificInBaseline: 0,
    nonScientificNotInBaseline: 0,
    enforcedMinusNonScientificRaw: 0,
    scientificInBaselineMinusNonScientificNotInBaseline: 0,
  }

  const enforcedDispositionTotals = emptyDispositionTotals()
  const nonScientificRawOutcomeTotals = emptyOutcomeTotals()
  const enforcedById = new Map<string, EnforcedDisposition>()
  const nonSciOutcomeById = new Map<string, NonScientificRawOutcome>()

  type PartialGroup = Omit<ClosureGroup, 'groupId' | 'findingIds' | 'rawCount' | 'enforcedCount'>
  const groupMap = new Map<string, ClosureGroup>()

  for (const f of manifest.findings) {
    const row = resolveClosureRow(f, registryIds)

    if (row.enforcedDisposition === 'migrate-existing-token') {
      if (!row.destinationToken || row.destinationToken.includes(' or ') || row.destinationToken.includes('review')) {
        throw new Error(`Forbidden destination for ${f.id}: ${row.destinationToken}`)
      }
    }

    if (!row.isScientificRaw) {
      nonSciOutcomeById.set(f.id, row.nonScientificRawOutcome)
      nonScientificRawOutcomeTotals[row.nonScientificRawOutcome] += 1

      const dest =
        row.enforcedDisposition === 'migrate-existing-token'
          ? row.destinationToken
          : row.mappingRule
      const partial: PartialGroup = {
        ownerFamily: ownerFamily(f.owner),
        property: f.property,
        literal: f.literal.trim(),
        destinationOrRegistry: dest,
        roleHonesty: row.rationale,
        nonScientificRawOutcome: row.nonScientificRawOutcome,
        files: [f.file],
      }
      const key = ['raw', row.nonScientificRawOutcome, partial.ownerFamily, partial.property, partial.literal, dest, partial.roleHonesty].join('|')
      let group = groupMap.get(key)
      if (!group) {
        group = { groupId: closureGroupId([key]), ...partial, rawCount: 0, enforcedCount: 0, findingIds: [] }
        groupMap.set(key, group)
      } else if (!group.files.includes(f.file)) {
        group.files.push(f.file)
        group.files.sort()
      }
      group.findingIds.push(f.id)
      group.rawCount += 1
    } else {
      nonScientificRawOutcomeTotals['scientific-data'] += 1
      const partial: PartialGroup = {
        ownerFamily: ownerFamily(f.owner),
        property: f.property,
        literal: f.literal.trim(),
        destinationOrRegistry: `registry:${scientificRationale(f)}`,
        roleHonesty: row.rationale,
        nonScientificRawOutcome: 'scientific-data',
        files: [f.file],
      }
      const key = ['raw', 'scientific-data', partial.ownerFamily, partial.property, partial.literal, partial.destinationOrRegistry, partial.roleHonesty].join('|')
      let group = groupMap.get(key)
      if (!group) {
        group = { groupId: closureGroupId([key]), ...partial, rawCount: 0, enforcedCount: 0, findingIds: [] }
        groupMap.set(key, group)
      } else if (!group.files.includes(f.file)) {
        group.files.push(f.file)
        group.files.sort()
      }
      group.findingIds.push(f.id)
      group.rawCount += 1
    }
  }

  if (enforcedById.size !== 0) {
    throw new Error(`Expected zero enforced dispositions after closure; found ${enforcedById.size}.`)
  }

  if (nonSciOutcomeById.size !== nonScientificRawCount) {
    throw new Error(`Non-scientific outcome map size ${nonSciOutcomeById.size} ≠ non-scientific raw ${nonScientificRawCount}`)
  }

  const groups = [...groupMap.values()].sort(
    (a, b) => b.enforcedCount - a.enforcedCount || b.rawCount - a.rawCount || a.groupId.localeCompare(b.groupId),
  )

  const unmigratableScientificFamilies = groups
    .filter((g) => g.enforcedDisposition === 'correct-stale-accounting' || g.enforcedDisposition === 'register-scientific')
    .reduce((acc, g) => {
      const key = `${g.ownerFamily}|${g.property}`
      const entry = acc.get(key) ?? { ownerFamily: g.ownerFamily, property: g.property, enforcedCount: 0, rationale: g.roleHonesty }
      entry.enforcedCount += g.enforcedCount
      acc.set(key, entry)
      return acc
    }, new Map<string, { ownerFamily: string; property: string; enforcedCount: number; rationale: string }>())

  const unmigratableList = [...unmigratableScientificFamilies.values()]
    .sort((a, b) => b.enforcedCount - a.enforcedCount)
    .slice(0, 40)

  return {
    version: 1,
    generatedBy: 'scripts/build-theme-closure-accounting.ts',
    sourceCounts: {
      rawFindings: manifest.findings.length,
      enforcedBaseline: 0,
      scientificRegistry: registryIds.size,
      liveRawScan: liveRawIds.size,
      liveEnforcedScan: liveEnforcedIds.size,
      nonScientificRaw: nonScientificRawCount,
    },
    baselineIdentity,
    enforcedDispositionTotals,
    nonScientificRawOutcomeTotals,
    unmigratableScientificFamilies: unmigratableList,
    groups: groups.map(({ findingIds, ...rest }) => ({ ...rest, findingIds: [...findingIds].sort() })),
  }
}
