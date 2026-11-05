#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { scanProject } from './check-theme-colors.ts'

const REGISTRY_PATH = resolve(import.meta.dirname, 'theme-scientific-color-registry.json')

function key(f: { file: string; kind: string; property: string; literal: string; locator: { owner: string } }): string {
  return JSON.stringify([f.file, f.kind, f.property, f.literal, f.locator.owner])
}

const registry = JSON.parse(await readFile(REGISTRY_PATH, 'utf8')) as {
  findings: Array<{ file: string; kind: string; property: string; literal: string; owner: string; locator: { owner: string } }>
}
const registryKeys = new Set(registry.findings.map((r) => key({ ...r, locator: r.locator ?? { owner: r.owner } })))
const enforced = await scanProject({ mode: 'enforced' })
let missing = 0
for (const f of enforced) {
  if (!registryKeys.has(key(f))) {
    console.log('missing', f.file, f.line, f.property, f.literal, f.locator.owner)
    missing += 1
  }
}
console.log('enforced', enforced.length, 'missingFromRegistryKey', missing)
const raw = await scanProject({ mode: 'raw' })
let rawMissing = 0
for (const f of raw) {
  if (!registryKeys.has(key(f))) {
    console.log('rawNotRegistry', f.file, f.line, f.property, f.literal.slice(0, 30))
    rawMissing += 1
  }
}
console.log('raw', raw.length, 'notInRegistry', rawMissing)
