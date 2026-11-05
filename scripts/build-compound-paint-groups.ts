#!/usr/bin/env node
/**
 * Builds scripts/compound-paint-groups.json — whole-declaration compound paint inventory.
 */

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  declarationContainsGradient,
  declarationIsShadowProperty,
  diagramDestinationToken,
  gradientDestinationToken,
  hasTranslucentCompound,
  isBlockingScrimRow,
  isDiagramChromeRow,
  isScientificEncodingRow,
  isScientificShadowRetention,
  resolveFullDeclarationValue,
  saturatedExplicitToken,
  shadowDestinationToken,
  type ManifestRow,
} from './compound-paint-declarations.ts'

const SCRIPT_DIR = resolve(import.meta.dirname)
const MANIFEST_PATH = resolve(SCRIPT_DIR, 'theme-debt-manifest.json')
const REGISTRY_PATH = resolve(SCRIPT_DIR, 'theme-scientific-color-registry.json')
const EXTENSIONS_PATH = resolve(SCRIPT_DIR, 'theme-scientific-encoding-extensions.json')
const BULK_PATH = resolve(SCRIPT_DIR, 'bulk-theme-groups.json')
const OUT_PATH = resolve(SCRIPT_DIR, 'compound-paint-groups.json')

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

const MIGRATE_CLASSES: CompoundClass[] = [
  'generic-gradient',
  'generic-translucent-surface',
  'overlay-or-scrim',
  'elevation-or-shadow',
  'scheme-override',
  'generic-diagram-chrome',
  'dead-or-shadowed',
]

type BulkPlan = { groups: Array<{ findingIds: string[]; destinationToken: string; rationale: string }> }

type DeclarationPlan = {
  declarationKey: string
  compoundClass: CompoundClass
  migrate: boolean
  destinationToken: string
  fullValue: string
  property: string
  rationale: string
  findingIds: string[]
  deferReason?: string
}

type GroupRow = {
  groupId: string
  compoundClass: CompoundClass
  migrate: boolean
  fullValueStrategy: 'replace-with-var' | 'remove-dead-rule' | 'retain-literal'
  destinationToken: string
  property: string
  literal: string
  fullDeclarationValue: string
  ownerFamily: string
  themeContext: string
  role: string
  files: string[]
  owners: string[]
  exclusions: string[]
  rationale: string
  declarationCount: number
  findingCount: number
  enforcedCount: number
  findingIds: string[]
  enforcedIds: string[]
}

function ownerFamily(owner: string): string {
  const trimmed = owner.trim()
  if (trimmed.startsWith(':root[data-color-scheme')) return ':root[data-color-scheme] …'
  const first = trimmed.split(',')[0]?.trim() ?? trimmed
  return first
    .replace(/:(hover|focus|focus-visible|active|disabled|checked)(\([^)]*\))?/g, '')
    .replace(/\.is-[\w-]+/g, '.is-*')
    .slice(0, 120)
}

function themeContext(owner: string): string {
  if (owner.includes("data-color-scheme='dark'")) return 'dark'
  if (owner.includes("data-color-scheme='bright'")) return 'bright'
  if (owner.includes("data-color-scheme='beige'")) return 'beige'
  if (owner.includes('data-color-scheme')) return 'any-scheme'
  return 'base'
}

function normalizeLiteral(lit: string): string {
  return lit.replace(/\s+/g, ' ').trim()
}

function deferReason(row: ManifestRow, reason: string): string {
  if (/startup-|vg-startup|document-recent|document-draft|startup-window/i.test(row.owner + row.file)) {
    return 'Startup/document surfaces use the reviewed --vg-startup-* palette, not App.css compound convergence.'
  }
  if (/pick-primers-pane-tabs|hybrid-window|primer-editor-structures-method-popup/i.test(row.owner)) {
    return 'Specialized interaction palette reviewed separately from bulk compound paint migration.'
  }
  if (/mass-restriction-members-list > label\.is-uncloneable/.test(row.owner)) {
    return 'Mixed scientific status encoding and list chrome cannot split without changing uncloneable semantics.'
  }
  return reason
}

function classifyDeclaration(
  row: ManifestRow,
  fullValue: string,
  bulkToken: string,
  registryIds: Set<string>,
): Omit<DeclarationPlan, 'declarationKey' | 'findingIds' | 'fullValue'> & { fullValue: string } {
  if (row.classification === 'dead-or-shadowed') {
    return {
      compoundClass: 'dead-or-shadowed',
      migrate: true,
      destinationToken: 'delete',
      fullValue,
      property: row.property,
      rationale: 'Remove shadowed declaration; later rule already wins.',
    }
  }
  if (isScientificEncodingRow(row, registryIds)) {
    return {
      compoundClass: 'scientific-data',
      migrate: false,
      destinationToken: '',
      fullValue,
      property: row.property,
      rationale:
        row.id === '9307b5e2eff9c433' || row.id === 'a133c1e5ee018431'
          ? 'Primer-associated base letter ink in sequence rows (color/fill); biological encoding retained in unified registry.'
          : 'Biological or analytical data color retained under unified scientific registry scope.',
    }
  }
  if (isScientificShadowRetention(row, fullValue)) {
    return {
      compoundClass: 'scientific-data',
      migrate: false,
      destinationToken: '',
      fullValue,
      property: row.property,
      rationale: 'Selected stop-codon inset ring encodes analytical selection, not generic elevation.',
    }
  }
  if (declarationContainsGradient(fullValue)) {
    return {
      compoundClass: 'generic-gradient',
      migrate: true,
      destinationToken: gradientDestinationToken(row),
      fullValue,
      property: row.property,
      rationale: 'Whole gradient value migrates as one compound control or surface token.',
    }
  }
  if (declarationIsShadowProperty(row.property)) {
    return {
      compoundClass: 'elevation-or-shadow',
      migrate: true,
      destinationToken: shadowDestinationToken(row, fullValue),
      fullValue,
      property: row.property,
      rationale: 'Full shadow list migrates as one elevation, overlay, or inset shadow token.',
    }
  }
  if (isBlockingScrimRow(row, fullValue)) {
    return {
      compoundClass: 'overlay-or-scrim',
      migrate: true,
      destinationToken: /--emphasis|drop-target|blocking/i.test(row.owner) ? '--vg-overlay-emphasis' : '--vg-overlay-scrim',
      fullValue,
      property: row.property,
      rationale: 'Transparent blocking wash migrates as one overlay scrim token.',
    }
  }
  if (hasTranslucentCompound(fullValue) && !declarationContainsGradient(fullValue)) {
    const token = saturatedExplicitToken(row, fullValue, bulkToken) ?? '--vg-info-surface'
    if (/danger|warning|success|info|feedback|mix/.test(token + row.owner)) {
      return {
        compoundClass: 'generic-translucent-surface',
        migrate: true,
        destinationToken: token,
        fullValue,
        property: row.property,
        rationale: 'Alpha or color-mix wash migrates as one translucent feedback or surface role.',
      }
    }
  }
  if (isDiagramChromeRow(row)) {
    return {
      compoundClass: 'generic-diagram-chrome',
      migrate: true,
      destinationToken: diagramDestinationToken(row),
      fullValue,
      property: row.property,
      rationale: 'Diagram frame, grid, axis, or lane label chrome migrates as generic UI tokens.',
    }
  }
  const explicit = saturatedExplicitToken(row, fullValue, bulkToken)
  if (explicit) {
    return {
      compoundClass: 'scheme-override',
      migrate: true,
      destinationToken: explicit,
      fullValue,
      property: row.property,
      rationale: 'Legacy literal remints to an explicit semantic token for the full declaration value.',
    }
  }
  const reason = deferReason(row, 'No explicit semantic role for the full declaration value; defer rather than defaulting to body/panel/border tokens.')
  return {
    compoundClass: 'defer-with-specific-reason',
    migrate: false,
    destinationToken: '',
    fullValue,
    property: row.property,
    rationale: reason,
    deferReason: reason,
  }
}

function groupKey(row: Omit<GroupRow, 'groupId' | 'findingIds' | 'enforcedIds' | 'findingCount' | 'enforcedCount' | 'declarationCount' | 'owners'>): string {
  return [
    row.compoundClass,
    row.migrate ? 'migrate' : 'retain',
    row.destinationToken,
    row.property,
    normalizeLiteral(row.fullDeclarationValue).toLowerCase(),
    row.ownerFamily,
    row.themeContext,
    row.role,
  ].join('|')
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { findings: ManifestRow[] }
  const baseline = new Set<string>()
  const registry = JSON.parse(await readFile(REGISTRY_PATH, 'utf8')) as { findings: Array<{ id: string }> }
  const registryIds = new Set(registry.findings.map((r) => r.id))
  const bulk = JSON.parse(await readFile(BULK_PATH, 'utf8')) as BulkPlan
  const bulkById = new Map<string, { destinationToken: string; rationale: string }>()
  for (const g of bulk.groups) {
    for (const id of g.findingIds) bulkById.set(id, { destinationToken: g.destinationToken, rationale: g.rationale })
  }

  const declarationMap = new Map<string, DeclarationPlan>()
  const rowMeta = new Map<string, { fullValue: string; deferReason?: string }>()

  for (const row of manifest.findings) {
    const resolved = await resolveFullDeclarationValue(row)
    rowMeta.set(row.id, { fullValue: resolved.value ?? row.literal.trim(), deferReason: resolved.deferReason })
    const fullValue = resolved.value ?? row.literal.trim()
    const declKey = `${row.file}|${row.owner}|${row.property}|${normalizeLiteral(fullValue).toLowerCase()}`
    let plan = declarationMap.get(declKey)
    if (!plan) {
      const bulkMeta = bulkById.get(row.id)
      const classified = classifyDeclaration(row, fullValue, bulkMeta?.destinationToken ?? '', registryIds)
      plan = {
        declarationKey: declKey,
        ...classified,
        findingIds: [],
      }
      declarationMap.set(declKey, plan)
    }
    plan.findingIds.push(row.id)
  }

  const byGroup = new Map<string, GroupRow>()
  const classTotals = {
    declarations: Object.fromEntries(COMPOUND_CLASSES.map((c) => [c, 0])) as Record<CompoundClass, number>,
    raw: Object.fromEntries(COMPOUND_CLASSES.map((c) => [c, 0])) as Record<CompoundClass, number>,
    enforced: Object.fromEntries(COMPOUND_CLASSES.map((c) => [c, 0])) as Record<CompoundClass, number>,
  }

  for (const row of manifest.findings) {
    const meta = rowMeta.get(row.id)!
    const fullValue = meta.fullValue
    const declKey = `${row.file}|${row.owner}|${row.property}|${normalizeLiteral(fullValue).toLowerCase()}`
    const plan = declarationMap.get(declKey)!
    const migrate = plan.migrate && MIGRATE_CLASSES.includes(plan.compoundClass)
    const family = ownerFamily(row.owner)
    const context = themeContext(row.owner)
    const token = plan.compoundClass === 'dead-or-shadowed' ? 'delete' : plan.destinationToken
    const strategy: GroupRow['fullValueStrategy'] =
      plan.compoundClass === 'dead-or-shadowed'
        ? 'remove-dead-rule'
        : plan.compoundClass === 'scientific-data' || !migrate
          ? 'retain-literal'
          : 'replace-with-var'

    const partial = {
      compoundClass: plan.compoundClass,
      migrate,
      fullValueStrategy: strategy,
      destinationToken: token,
      property: row.property,
      literal: normalizeLiteral(row.literal),
      fullDeclarationValue: normalizeLiteral(fullValue),
      ownerFamily: family,
      themeContext: context,
      role: token.replace(/^--vg-/, '') || plan.compoundClass,
      files: [row.file],
      owners: [row.owner],
      exclusions: [] as string[],
      rationale: plan.rationale,
    }
    const key = groupKey(partial)
    let group = byGroup.get(key)
    if (!group) {
      group = {
        groupId: createHash('sha1').update(key).digest('hex').slice(0, 16),
        ...partial,
        declarationCount: 1,
        findingCount: 0,
        enforcedCount: 0,
        findingIds: [],
        enforcedIds: [],
      }
      byGroup.set(key, group)
    }
    if (!group.files.includes(row.file)) group.files.push(row.file)
    if (!group.owners.includes(row.owner)) group.owners.push(row.owner)
    group.findingIds.push(row.id)
    group.findingCount += 1
    classTotals.raw[plan.compoundClass] += 1
    if (baseline.has(row.id)) {
      group.enforcedCount += 1
      group.enforcedIds.push(row.id)
      classTotals.enforced[plan.compoundClass] += 1
    }
  }

  const groups = [...byGroup.values()].sort(
    (a, b) => b.enforcedCount - a.enforcedCount || b.findingCount - a.findingCount || a.groupId.localeCompare(b.groupId),
  )

  for (const g of groups) {
    classTotals.declarations[g.compoundClass] += 1
    g.files.sort()
    g.owners.sort()
    g.findingIds.sort()
    g.enforcedIds.sort()
  }

  let projectedEnforcedRetirement = 0
  for (const g of groups) {
    if (g.migrate && MIGRATE_CLASSES.includes(g.compoundClass)) projectedEnforcedRetirement += g.enforcedCount
  }

  const insetOwners = new Set<string>()
  const emphasisOwners = new Set<string>()
  let diagramFrameGroups = 0
  let diagramGridGroups = 0
  for (const g of groups) {
    if (g.compoundClass === 'elevation-or-shadow' && g.destinationToken === '--vg-shadow-inset-control') {
      for (const owner of g.owners) insetOwners.add(ownerFamily(owner))
    }
    if (g.compoundClass === 'overlay-or-scrim' && g.destinationToken === '--vg-overlay-emphasis') {
      for (const owner of g.owners) emphasisOwners.add(ownerFamily(owner))
    }
    if (g.compoundClass === 'generic-diagram-chrome' && g.destinationToken === '--vg-diagram-frame-stroke') diagramFrameGroups += 1
    if (g.compoundClass === 'generic-diagram-chrome' && g.destinationToken === '--vg-diagram-grid-stroke') diagramGridGroups += 1
  }

  const tokenProposals = {
    reused: [
      '--vg-overlay-scrim',
      '--vg-shadow-elevation',
      '--vg-shadow-overlay',
      '--vg-control-surface',
      '--vg-control-surface-hover',
      '--vg-control-surface-pressed',
      '--vg-surface-panel',
      '--vg-surface-chrome',
      '--vg-text-strong',
      '--vg-danger-surface',
      '--vg-danger-border',
      '--vg-danger-ink',
      '--vg-warning-surface',
      '--vg-success-surface',
      '--vg-info-surface',
    ],
    newCompound: [
      ...(diagramFrameGroups > 0 ? ['--vg-diagram-frame-stroke'] : []),
      ...(diagramGridGroups > 0 ? ['--vg-diagram-grid-stroke'] : []),
      ...(insetOwners.size >= 2 ? ['--vg-shadow-inset-control'] : []),
      ...(emphasisOwners.size >= 2 ? ['--vg-overlay-emphasis'] : []),
    ],
  }

  const unifiedScientificRegistry = {
    preferredSource: 'scripts/theme-scientific-color-registry.json',
    sunsetLedger: 'scripts/theme-scientific-encoding-extensions.json',
    schemaVersion: 2,
    model:
      'Single registry owns scientific literals with file, owner, property, literal, and biologicalReason. Extensions merge into registry; generated extensions view must match derived rows.',
    resolutions: {
      '9307b5e2eff9c433': {
        decision: 'scientific-registration',
        file: 'src/App.css',
        owner: ":root[data-color-scheme='dark'] .sequence-primer-base",
        property: 'color',
        literal: '#f2e9ff',
        biologicalReason: 'Primer-associated base letter ink in sequence rows under dark scheme.',
      },
      a133c1e5ee018431: {
        decision: 'scientific-registration',
        file: 'src/App.css',
        owner: ":root[data-color-scheme='dark'] .sequence-primer-base",
        property: 'fill',
        literal: '#f2e9ff',
        biologicalReason: 'SVG/base fill for primer-associated sequence letters under dark scheme.',
      },
    },
    pendingAdmissions: [
      {
        id: '9307b5e2eff9c433',
        file: 'src/App.css',
        owner: ":root[data-color-scheme='dark'] .sequence-primer-base",
        property: 'color',
        literal: '#f2e9ff',
        biologicalReason: 'Primer-associated base letter ink in sequence rows under dark scheme.',
      },
      {
        id: 'a133c1e5ee018431',
        file: 'src/App.css',
        owner: ":root[data-color-scheme='dark'] .sequence-primer-base",
        property: 'fill',
        literal: '#f2e9ff',
        biologicalReason: 'SVG/base fill for primer-associated sequence letters under dark scheme.',
      },
    ],
    registryRowCount: registryIds.size,
    extensionRowCount: (JSON.parse(await readFile(EXTENSIONS_PATH, 'utf8')) as { count: number }).count,
  }

  const payload = {
    version: 2,
    generatedAt: new Date().toISOString(),
    revisedBy: 'grok-approve-with-rule-changes',
    productNote: 'Whole compound declarations migrate together; stop-level literals inherit declaration-level classification from reconstructed source values.',
    sourceCounts: {
      rawFindings: manifest.findings.length,
      enforcedBaseline: baseline.size,
      scientificRegistry: registryIds.size,
    },
    outcomeTotals: classTotals,
    projectedEnforcedRetirement,
    tokenProposals,
    unifiedScientificRegistry,
    groups: groups.map(({ findingIds, enforcedIds, ...rest }) => ({ ...rest, findingIds, enforcedIds })),
  }

  await writeFile(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  console.log('groups', groups.length)
  console.log('raw by class', classTotals.raw)
  console.log('enforced by class', classTotals.enforced)
  console.log('projectedEnforcedRetirement', projectedEnforcedRetirement)
  if (projectedEnforcedRetirement < 150) process.exitCode = 2
}

main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
