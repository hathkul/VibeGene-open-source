#!/usr/bin/env node
/**
 * Rebuild theme-debt-manifest.json and theme-scientific-color-registry.json
 * from a live raw scan. Preserves reviewed biologicalReason text when registry
 * keys still match; refreshes stable ids and locators from source.
 */

import { readFile, writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { scanProject, type ThemeFinding } from './check-theme-colors.ts'
import { isGenericBiologicalReason, specificBiologicalReason, type ManifestFinding } from './theme-closure-classification.ts'
import type { ThemeDebtEntry } from './generate-theme-debt-manifest.ts'

const SCRIPT_DIR = resolve(import.meta.dirname)
const MANIFEST_PATH = resolve(SCRIPT_DIR, 'theme-debt-manifest.json')
const REGISTRY_PATH = resolve(SCRIPT_DIR, 'theme-scientific-color-registry.json')
const CANDIDATE_PATH = resolve(SCRIPT_DIR, 'theme-debt-manifest.candidate.json')

function registryKey(f: Pick<ThemeFinding, 'file' | 'kind' | 'property' | 'literal' | 'locator'>): string {
  return JSON.stringify([f.file, f.kind, f.property, f.literal, f.locator.owner])
}

function asManifest(f: ThemeFinding): ManifestFinding {
  return {
    id: f.id,
    file: f.file,
    kind: f.kind,
    property: f.property,
    literal: f.literal,
    owner: f.locator.owner,
    classification: 'scientific-data',
  }
}

function cleanBiologicalReason(prior: string | undefined, f: ThemeFinding): string {
  const owner = f.locator.owner
  const manifest = asManifest(f)
  const specific = specificBiologicalReason(manifest)
  if (prior && !isGenericBiologicalReason(prior)) {
    let reason = prior.trim()
    if (!reason.includes(f.file)) reason = `Reviewed ${f.file} owner ${owner}: ${reason}`
    if (!reason.includes(owner)) reason = `Reviewed ${f.file} owner ${owner}: ${specific}`
    return reason
  }
  return `Reviewed ${f.file} owner ${owner}: ${specific}`
}

async function main(): Promise<void> {
  const raw = await scanProject({ mode: 'raw' })
  const priorManifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { findings: ThemeDebtEntry[] }
  const priorRegistry = JSON.parse(await readFile(REGISTRY_PATH, 'utf8')) as {
    findings: Array<ThemeDebtEntry & { biologicalReason: string }>
  }

  const reasonByKey = new Map<string, string>()
  for (const row of priorRegistry.findings) {
    reasonByKey.set(
      registryKey({ file: row.file, kind: row.kind, property: row.property, literal: row.literal, locator: row.locator }),
      row.biologicalReason,
    )
  }
  for (const row of priorManifest.findings) {
    if (row.classification !== 'scientific-data') continue
    const key = registryKey({ file: row.file, kind: row.kind, property: row.property, literal: row.literal, locator: row.locator })
    if (!reasonByKey.has(key) && row.rationale && !/retain the literal until/i.test(row.rationale)) {
      reasonByKey.set(key, row.rationale)
    }
  }

  const manifestFindings: ThemeDebtEntry[] = []
  const registryFindings: Array<ThemeDebtEntry & { biologicalReason: string; owner: string }> = []

  for (const f of raw) {
    const biologicalReason = cleanBiologicalReason(reasonByKey.get(registryKey(f)), f)
    const entry: ThemeDebtEntry = {
      id: f.id,
      file: f.file,
      kind: f.kind,
      property: f.property,
      literal: f.literal,
      locator: f.locator,
      owner: f.locator.owner,
      classification: 'scientific-data',
      rationale: biologicalReason,
      reviewStatus: 'reviewed',
    }
    manifestFindings.push(entry)
    registryFindings.push({ ...entry, biologicalReason, owner: f.locator.owner })
  }

  manifestFindings.sort((a, b) => a.id.localeCompare(b.id))
  registryFindings.sort((a, b) => a.id.localeCompare(b.id))

  await writeFile(
    MANIFEST_PATH,
    `${JSON.stringify(
      {
        version: 1,
        generatedBy: 'scripts/sync-live-theme-debt.ts',
        findings: manifestFindings,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  await writeFile(
    REGISTRY_PATH,
    `${JSON.stringify(
      {
        version: 2,
        generatedBy: 'scripts/sync-live-theme-debt.ts',
        schemaNote: 'Each row requires file, owner, property, literal, locator, and biologicalReason; no wildcards.',
        findings: registryFindings,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  try {
    await unlink(CANDIDATE_PATH)
  } catch {
    /* no candidate */
  }

  console.log('synced manifest and registry rows', manifestFindings.length)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
