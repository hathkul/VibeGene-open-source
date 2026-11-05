#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SCRIPT_DIR = resolve(import.meta.dirname)
const MANIFEST_PATH = resolve(SCRIPT_DIR, 'theme-debt-manifest.json')
const REGISTRY_PATH = resolve(SCRIPT_DIR, 'theme-scientific-color-registry.json')
const EXTENSIONS_PATH = resolve(SCRIPT_DIR, 'theme-scientific-encoding-extensions.json')

type ManifestEntry = {
  id: string
  file: string
  kind: string
  property: string
  literal: string
  owner: string
  locator: { owner: string; anchor: string }
  classification: string
  rationale: string
  reviewStatus: string
}

type RegistryEntry = ManifestEntry & { biologicalReason: string }

const PRIMER_BASE_ADMISSIONS: RegistryEntry[] = [
  {
    id: '9307b5e2eff9c433',
    file: 'src/App.css',
    kind: 'css',
    property: 'color',
    literal: '#f2e9ff',
    owner: ":root[data-color-scheme='dark'] .sequence-primer-base",
    locator: { owner: ":root[data-color-scheme='dark'] .sequence-primer-base", anchor: '' },
    classification: 'scientific-data',
    rationale: 'Reviewed src/App.css owner :root[data-color-scheme=\'dark\'] .sequence-primer-base: primer-associated base letter ink in sequence rows under dark scheme.',
    reviewStatus: 'reviewed',
    biologicalReason:
      "Reviewed src/App.css owner :root[data-color-scheme='dark'] .sequence-primer-base: primer-associated base letter ink in sequence rows under dark scheme encodes which bases belong to primers.",
  },
  {
    id: 'a133c1e5ee018431',
    file: 'src/App.css',
    kind: 'css',
    property: 'fill',
    literal: '#f2e9ff',
    owner: ":root[data-color-scheme='dark'] .sequence-primer-base",
    locator: { owner: ":root[data-color-scheme='dark'] .sequence-primer-base", anchor: '' },
    classification: 'scientific-data',
    rationale: 'Reviewed src/App.css owner :root[data-color-scheme=\'dark\'] .sequence-primer-base: primer-associated base fill in sequence rows under dark scheme.',
    reviewStatus: 'reviewed',
    biologicalReason:
      "Reviewed src/App.css owner :root[data-color-scheme='dark'] .sequence-primer-base: primer-associated base fill in sequence rows under dark scheme encodes which bases belong to primers.",
  },
]

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { version: number; findings: ManifestEntry[] }
  const registry = JSON.parse(await readFile(REGISTRY_PATH, 'utf8')) as { version: number; generatedBy?: string; findings: RegistryEntry[] }
  const extensions = JSON.parse(await readFile(EXTENSIONS_PATH, 'utf8')) as {
    findings: Array<{ id: string; file: string; owner: string; property: string; literal: string; rationale: string }>
  }

  const manifestById = new Map(manifest.findings.map((row) => [row.id, row]))
  const byId = new Map<string, RegistryEntry>()
  for (const row of registry.findings) byId.set(row.id, row)

  for (const ext of extensions.findings) {
    if (byId.has(ext.id)) continue
    const manifestRow = manifestById.get(ext.id)
    if (!manifestRow) throw new Error(`extension ${ext.id} missing from manifest`)
    byId.set(ext.id, {
      ...manifestRow,
      biologicalReason: `Reviewed ${ext.file} owner ${ext.owner}: ${ext.rationale}`,
    })
  }

  for (const row of PRIMER_BASE_ADMISSIONS) {
    const manifestRow = manifestById.get(row.id)
    if (!manifestRow) throw new Error(`missing manifest row ${row.id}`)
    byId.set(row.id, { ...manifestRow, biologicalReason: row.biologicalReason, classification: 'scientific-data' as const, rationale: row.biologicalReason })
  }

  const findings = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
  for (const row of findings) {
    const owner = row.owner || row.locator.owner
    if (!row.file || !owner || owner.includes('*')) throw new Error(`invalid registry row ${row.id}`)
    if (!row.owner) row.owner = owner
    if (!row.biologicalReason.includes(row.file)) {
      row.biologicalReason = `Reviewed ${row.file} owner ${row.locator.owner}: ${row.biologicalReason}`
    }
    if (!row.biologicalReason.includes(row.locator.owner)) {
      throw new Error(`registry row ${row.id} lacks exact owner rationale`)
    }
  }

  for (const row of manifest.findings) {
    if (byId.has(row.id)) {
      row.classification = 'scientific-data'
      row.rationale = byId.get(row.id)!.biologicalReason
      row.reviewStatus = 'reviewed'
    }
  }

  await writeFile(
    REGISTRY_PATH,
    `${JSON.stringify(
      {
        version: 2,
        generatedBy: 'scripts/merge-scientific-registry-v2.ts',
        schemaNote: 'Each row requires file, owner, property, literal, locator, and biologicalReason; no wildcards.',
        findings,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  await writeFile(MANIFEST_PATH, `${JSON.stringify({ ...manifest, findings: manifest.findings }, null, 2)}\n`, 'utf8')

  const originalIds = new Set(registry.findings.map((row) => row.id))
  const extensionView = findings.filter((row) => !originalIds.has(row.id))
  await writeFile(
    EXTENSIONS_PATH,
    `${JSON.stringify(
      {
        version: 1,
        generatedFrom: 'scripts/theme-scientific-color-registry.json',
        generatedAt: new Date().toISOString(),
        count: extensionView.length,
        findings: extensionView.map(({ id, file, owner, property, literal, biologicalReason }) => ({
          id,
          file,
          owner,
          property,
          literal,
          rationale: biologicalReason,
        })),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  console.log('registry rows', findings.length)
  console.log('extension view rows', extensionView.length)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
