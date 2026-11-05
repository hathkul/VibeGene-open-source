#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { scanProject } from './check-theme-colors.ts'
import { resolveClosureRow } from './theme-closure-classification.ts'

const reg = JSON.parse(await readFile('scripts/theme-scientific-color-registry.json', 'utf8')) as { findings: Array<{ file: string; kind: string; property: string; literal: string; owner: string }> }
const ids = new Set(reg.findings.map((r) => r.id))
const rkeys = new Set(reg.findings.map((r) => JSON.stringify([r.file, r.kind, r.property, r.literal, r.owner])))
const raw = await scanProject({ mode: 'raw' })
for (const f of raw) {
  const k = JSON.stringify([f.file, f.kind, f.property, f.literal, f.locator.owner])
  if (!rkeys.has(k)) {
    const row = resolveClosureRow({ ...f, owner: f.locator.owner, classification: '' }, ids)
    console.log(f.file, f.line, f.property, f.literal.slice(0, 24), row.enforcedDisposition, row.destinationToken)
  }
}
