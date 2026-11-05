#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanProject, type ThemeFinding } from './check-theme-colors.ts'
import type { ThemeDebtEntry } from './generate-theme-debt-manifest.ts'

type Manifest = { version: number; findings: ThemeDebtEntry[] }
type RegistryEntry = Pick<ThemeDebtEntry, 'id' | 'file' | 'kind' | 'property' | 'literal' | 'locator'> & { biologicalReason: string }
type Registry = { version: number; findings: RegistryEntry[] }

export type ThemeDebtCheckOptions = {
  rootDir?: string
  manifestPath?: string
  registryPath?: string
}

const SCRIPT_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)))
const MANIFEST_PATH = resolve(SCRIPT_DIR, 'theme-debt-manifest.json')
const REGISTRY_PATH = resolve(SCRIPT_DIR, 'theme-scientific-color-registry.json')
const CLASSIFICATIONS = new Set<ThemeDebtEntry['classification']>(['ui-debt', 'scientific-data', 'test-fixture', 'dead-or-shadowed', 'specialized-state', 'needs-review'])
const GENERIC_BIOLOGICAL_REASON_PATTERNS = [
  /record, feature, primer, residue, protein, or workflow product/i,
  /part of the biological record or workflow palette/i,
  /Biological and analytical encoding belongs in the scientific registry/i,
  /Biological or analytical encoding retained outside the 67-row registry/i,
]

function fail(message: string): never {
  throw new Error(`Theme debt check failed: ${message}`)
}

function identity(value: Pick<ThemeFinding, 'id' | 'file' | 'kind' | 'property' | 'literal' | 'locator'>): string {
  return JSON.stringify([value.id, value.file, value.kind, value.property, value.literal, value.locator.owner, value.locator.anchor])
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

export async function checkThemeDebt(options: ThemeDebtCheckOptions = {}): Promise<{ rawCount: number; classificationCounts: Record<string, number>; registryCount: number }> {
  const manifestPath = options.manifestPath ?? MANIFEST_PATH
  const registryPath = options.registryPath ?? REGISTRY_PATH
  const [raw, manifest, registry] = await Promise.all([
    scanProject({ rootDir: options.rootDir, mode: 'raw' }),
    readJson<Manifest>(manifestPath),
    readJson<Registry>(registryPath),
  ])
  if (manifest.version !== 1) fail('manifest must use version 1')
  if (registry.version !== 1 && registry.version !== 2) fail('registry must use version 1 or 2')
  const manifestById = new Map<string, ThemeDebtEntry>()
  for (const entry of manifest.findings) {
    if (manifestById.has(entry.id)) fail(`duplicate manifest row ${entry.id}`)
    if (!entry.file || !entry.owner || !entry.locator?.anchor || !entry.rationale.trim()) fail(`incomplete manifest row ${entry.id}`)
    if (entry.file.includes('*') || entry.owner.trim() === '*') fail(`wildcard file/owner in manifest row ${entry.id}`)
    if (!CLASSIFICATIONS.has(entry.classification)) fail(`unclassified row ${entry.id}`)
    if (entry.reviewStatus !== 'reviewed') fail(`unreviewed row ${entry.id}`)
    if (entry.classification === 'needs-review' && !entry.rationale.startsWith('Reviewed unresolved theme debt')) fail(`unresolved row ${entry.id} lacks reviewed-debt rationale`)
    manifestById.set(entry.id, entry)
  }
  const rawIds = new Set(raw.map((finding) => finding.id))
  for (const entry of manifest.findings) if (!rawIds.has(entry.id)) fail(`stale manifest row ${entry.id}`)
  if (manifestById.size !== raw.length) fail(`manifest has ${manifestById.size} unique rows for ${raw.length} raw findings`)
  for (const finding of raw) {
    const entry = manifestById.get(finding.id)
    if (!entry) fail(`missing manifest row for ${finding.file}:${finding.line} ${finding.literal}`)
    if (identity(entry!) !== identity(finding)) fail(`locator or literal drift for ${finding.id}`)
  }
  const registryIds = new Set<string>()
  for (const entry of registry.findings) {
    if (registryIds.has(entry.id)) fail(`duplicate scientific registry row ${entry.id}`)
    if (!entry.biologicalReason.trim() || GENERIC_BIOLOGICAL_REASON_PATTERNS.some((pattern) => pattern.test(entry.biologicalReason))) fail(`scientific registry row ${entry.id} has a generic biological reason`)
    const manifestEntry = manifestById.get(entry.id)
    if (!manifestEntry || manifestEntry.classification !== 'scientific-data') fail(`registry row ${entry.id} is not an exact scientific manifest row`)
    if (identity(entry) !== identity(manifestEntry)) fail(`scientific registry locator drift for ${entry.id}`)
    if (!entry.biologicalReason.includes(entry.file) || !entry.biologicalReason.includes(entry.locator.owner)) fail(`scientific registry row ${entry.id} lacks exact owner rationale`)
    registryIds.add(entry.id)
  }
  const scientificIds = new Set(manifest.findings.filter((entry) => entry.classification === 'scientific-data').map((entry) => entry.id))
  if (registryIds.size !== scientificIds.size || [...scientificIds].some((id) => !registryIds.has(id))) fail('scientific registry is not an exact ownership set')

  const classificationCounts: Record<string, number> = {}
  for (const entry of manifest.findings) classificationCounts[entry.classification] = (classificationCounts[entry.classification] ?? 0) + 1
  return { rawCount: raw.length, classificationCounts, registryCount: registry.findings.length }
}

export async function run(): Promise<number> {
  const result = await checkThemeDebt()
  console.log(`Theme debt check passed (${result.rawCount} raw findings; ${result.registryCount} scientific registry entries).`)
  for (const [classification, count] of Object.entries(result.classificationCounts).sort()) console.log(`  ${classification}: ${count}`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  run().then((code) => { process.exitCode = code }).catch((error: unknown) => { console.error(error); process.exitCode = 1 })
}
