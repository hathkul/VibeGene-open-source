#!/usr/bin/env node

/**
 * Guarded promotion of a reviewed theme-debt candidate.
 *
 * This command only removes manifest rows whose stable IDs disappeared after
 * an already-reviewed migration. It refuses new IDs, locator drift, or any
 * write without the explicit --accept-reviewed switch.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanProject, type ThemeFinding } from './check-theme-colors.ts'
import type { ThemeDebtEntry } from './generate-theme-debt-manifest.ts'
import { assertThemeMigrationAppliedContracts, readThemeMigrationLedger, validateThemeMigrationLedger, type ThemeMigrationLedger } from './plan-theme-migration.ts'

type Manifest = { version: 1; generatedBy: string; findings: ThemeDebtEntry[] }
const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))
const MANIFEST_PATH = resolve(SCRIPT_DIR, 'theme-debt-manifest.json')

function identity(value: Pick<ThemeFinding, 'id' | 'file' | 'kind' | 'property' | 'literal' | 'locator'>): string {
  return JSON.stringify([value.id, value.file, value.kind, value.property, value.literal, value.locator.owner, value.locator.anchor])
}

function freshReviewedRow(finding: ThemeFinding): ThemeDebtEntry {
  return {
    id: finding.id,
    file: finding.file,
    kind: finding.kind,
    property: finding.property,
    literal: finding.literal,
    locator: finding.locator,
    owner: finding.locator.owner,
    classification: 'needs-review',
    rationale: `Reviewed unresolved theme debt in ${finding.file} owner ${finding.locator.owner}; retain the literal until its UI/data ownership is migrated.`,
    reviewStatus: 'reviewed',
  }
}

function ledgerIds(ledger: ThemeMigrationLedger): Set<string> {
  return new Set([
    ...ledger.app.entries.map((entry) => entry.id),
    ...ledger.app.removals.map((entry) => entry.id),
    ...ledger.app.anchorRows.map((entry) => entry.id),
    ...ledger.app.retainedRows.map((entry) => entry.id),
    ...ledger.pickPrimers.entries.map((entry) => entry.id),
  ])
}

export function validateReviewedManifestDelta(manifest: Manifest, raw: ThemeFinding[], ledger: ThemeMigrationLedger): { next: Manifest; removedIds: string[] } {
  const existing = new Map<string, ThemeDebtEntry>()
  for (const entry of manifest.findings) {
    if (existing.has(entry.id)) throw new Error(`duplicate manifest row ${entry.id}`)
    existing.set(entry.id, entry)
  }
  const knownLedgerIds = ledgerIds(ledger)
  const expectedById = new Map<string, { file: string; kind: ThemeFinding['kind']; owner: string; property: string; literal: string; anchor?: string }>([
    ...ledger.app.entries,
    ...ledger.app.removals,
    ...ledger.app.anchorRows,
    ...ledger.app.retainedRows,
    ...ledger.pickPrimers.entries,
  ].map((entry) => [entry.id, {
    file: entry.file,
    kind: entry.kind,
    owner: entry.owner,
    property: entry.property,
    literal: entry.literal,
    anchor: 'sourceAnchor' in entry ? entry.sourceAnchor : undefined,
  }] as const))
  const rawIds = new Set(raw.map((finding) => finding.id))
  const anchorTargetIds = new Set<string>()
  for (const anchor of ledger.app.anchorRows) {
    if (anchorTargetIds.has(anchor.target.id)) throw new Error(`duplicate anchor target ID ${anchor.target.id}`)
    anchorTargetIds.add(anchor.target.id)
    const target = raw.find((finding) => finding.id === anchor.target.id)
    if (!target) throw new Error(`missing expected anchor target ${anchor.target.id}`)
    if (target.file !== anchor.target.file || target.kind !== anchor.target.kind || target.locator.owner !== anchor.target.owner || target.property !== anchor.target.property || target.literal !== anchor.target.literal || target.locator.anchor !== anchor.target.anchor) {
      throw new Error(`anchor target identity drift for ${anchor.id}`)
    }
  }
  for (const id of [...ledger.app.entries.map((entry) => entry.id), ...ledger.app.removals.map((entry) => entry.id), ...ledger.pickPrimers.entries.map((entry) => entry.id)]) {
    if (rawIds.has(id)) throw new Error(`listed migration ID ${id} is still present in raw findings`)
  }
  const consumed = new Set<string>()
  const usedAnchorRows = new Set<string>()
  const nextRows = new Map<string, ThemeDebtEntry>()
  for (const finding of raw) {
    const prior = existing.get(finding.id)
    if (prior) {
      if (identity(prior) !== identity(finding)) throw new Error(`locator or literal drift for ${finding.id}`)
      consumed.add(prior.id)
      nextRows.set(finding.id, prior)
      continue
    }
    const retained = ledger.app.retainedRows.find((entry) => entry.id === finding.id)
    if (retained) {
      if (retained.owner !== finding.locator.owner || retained.property !== finding.property || retained.literal !== finding.literal || retained.anchor !== finding.locator.anchor) {
        throw new Error(`retained ledger identity drift for ${finding.id}`)
      }
      nextRows.set(finding.id, freshReviewedRow(finding))
      continue
    }
    const anchors = ledger.app.anchorRows.filter((entry) => !usedAnchorRows.has(entry.id)
      && entry.file === finding.file && entry.kind === finding.kind && entry.owner === finding.locator.owner
      && entry.property === finding.property && entry.literal === finding.literal
      && entry.target.id === finding.id && entry.target.anchor === finding.locator.anchor)
    if (anchors.length !== 1) throw new Error(`unexpected new raw finding ${finding.id}`)
    usedAnchorRows.add(anchors[0]!.id)
    nextRows.set(finding.id, freshReviewedRow(finding))
  }
  const removedIds = manifest.findings.filter((entry) => !consumed.has(entry.id)).map((entry) => entry.id)
  for (const id of removedIds) {
    if (!knownLedgerIds.has(id)) throw new Error(`unlisted stale manifest row ${id}`)
    const expected = expectedById.get(id)!
    const actual = existing.get(id)!
    if (actual.file !== expected.file || actual.kind !== expected.kind || actual.owner !== expected.owner || actual.property !== expected.property || actual.literal !== expected.literal || (expected.anchor !== undefined && actual.locator.anchor !== expected.anchor)) {
      throw new Error(`ledger locator or literal drift for stale ${id}`)
    }
  }
  return {
    next: { ...manifest, generatedBy: 'scripts/accept-theme-debt-manifest.ts --accept-reviewed', findings: raw.map((finding) => nextRows.get(finding.id)!) },
    removedIds,
  }
}

export async function acceptReviewedManifest(options: { rootDir?: string; manifestPath?: string; ledgerPath?: string; accept?: boolean } = {}): Promise<{ rawCount: number; removedCount: number }> {
  if (!options.accept) throw new Error('Refusing to rewrite the authoritative manifest without --accept-reviewed.')
  const rootDir = options.rootDir ?? resolve(SCRIPT_DIR, '..')
  const manifestPath = options.manifestPath ?? MANIFEST_PATH
  const [raw, manifest, ledger] = await Promise.all([
    scanProject({ rootDir, mode: 'raw' }),
    readFile(manifestPath, 'utf8').then((value) => JSON.parse(value) as Manifest),
    options.ledgerPath ? readFile(options.ledgerPath, 'utf8').then((value) => validateThemeMigrationLedger(JSON.parse(value) as ThemeMigrationLedger)) : readThemeMigrationLedger(rootDir),
  ])
  if (options.ledgerPath) assertThemeMigrationAppliedContracts(await readFile(resolve(rootDir, 'src/App.css'), 'utf8'), ledger)
  const result = validateReviewedManifestDelta(manifest, raw, ledger)
  if (result.removedIds.length === 0) throw new Error('no explicitly listed migration rows are stale; refusing a no-op rewrite')
  await writeFile(manifestPath, `${JSON.stringify(result.next, null, 2)}\n`, 'utf8')
  return { rawCount: raw.length, removedCount: result.removedIds.length }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  acceptReviewedManifest({ accept: process.argv.includes('--accept-reviewed') })
    .then((result) => console.log(`Accepted reviewed manifest delta: removed ${result.removedCount} stale rows; ${result.rawCount} raw findings remain.`))
    .catch((error: unknown) => { console.error(error); process.exitCode = 1 })
}
