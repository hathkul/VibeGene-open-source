#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { scanProject, type ThemeFinding } from './check-theme-colors.ts'
import { resolveClosureRow, type ManifestFinding } from './theme-closure-classification.ts'

const REGISTRY_PATH = resolve(import.meta.dirname, 'theme-scientific-color-registry.json')

function asManifest(f: ThemeFinding): ManifestFinding {
  return {
    id: f.id,
    file: f.file,
    kind: f.kind,
    property: f.property,
    literal: f.literal,
    owner: f.locator.owner,
    classification: '',
  }
}

const registry = JSON.parse(await readFile(REGISTRY_PATH, 'utf8')) as { findings: Array<{ id: string }> }
const registryIds = new Set(registry.findings.map((r) => r.id))
const enforced = await scanProject({ mode: 'enforced' })
const totals: Record<string, number> = {}
const refused: string[] = []
for (const f of enforced) {
  const row = resolveClosureRow(asManifest(f), registryIds)
  totals[row.enforcedDisposition] = (totals[row.enforcedDisposition] ?? 0) + 1
  if (row.enforcedDisposition === 'migrate-existing-token') {
    refused.push(`${f.file}:${f.line} ${f.property} ${f.literal} -> ${row.destinationToken}`)
  }
}
console.log('totals', totals)
console.log('migrate count', refused.length)
console.log(refused.slice(0, 40).join('\n'))
