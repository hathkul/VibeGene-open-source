/**
 * Convert SnapGene Gateway donor + destination (.dna) plasmids into JSON for the app catalog.
 *
 * Source: SnapGene Gateway Cloning Vectors (www.snapgene.com/resources).
 * Optional local inputs (not distributed in this repository):
 *   snapgene-gateway-vectors/donor/
 *   snapgene-gateway-vectors/destination/
 *
 * Usage:
 *   npx tsx scripts/generate-gateway-vector-catalog.ts
 */
import { JSDOM } from 'jsdom'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

;(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = new JSDOM('').window.DOMParser

const { parseSnapGene } = await import('../src/domain/parsers.ts')

const OUT_ROOT = join('public', 'gateway-vectors')

function extractLabel(notesXml: string, fallback: string) {
  const match = notesXml.match(/<CustomMapLabel>([^<]*)<\/CustomMapLabel>/)
  return match?.[1]?.trim() || fallback
}

function stemLabel(fileName: string) {
  return fileName.replace(/\.dna$/i, '').trim()
}

function convertKind(kind: 'donor' | 'destination') {
  const sourceDir = join('snapgene-gateway-vectors', kind)
  const outDir = join(OUT_ROOT, kind)
  mkdirSync(outDir, { recursive: true })
  for (const name of readdirSync(outDir)) {
    rmSync(join(outDir, name))
  }

  const files = readdirSync(sourceDir)
    .filter((name) => name.toLowerCase().endsWith('.dna'))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

  const entries = []
  for (const fileName of files) {
    const bytes = new Uint8Array(readFileSync(join(sourceDir, fileName)))
    const record = parseSnapGene(bytes, fileName, { skipTraces: true })
    const label =
      extractLabel(record.description || '', stemLabel(fileName)) ||
      record.name ||
      stemLabel(fileName)
    const displayName =
      record.name?.includes('™') || record.name?.includes('®') ? record.name : label
    const jsonName = fileName.replace(/\.dna$/i, '.json')
    const slim = {
      name: displayName,
      description: record.description,
      molecule: record.molecule,
      topology: record.topology,
      sequence: record.sequence,
      features: record.features,
      primers: [] as [],
      dnaEnds: record.dnaEnds,
      construct: record.construct,
    }
    writeFileSync(join(outDir, jsonName), JSON.stringify(slim))
    entries.push({
      id: `${kind}:${fileName}`,
      kind,
      label: slim.name,
      fileName: jsonName,
      path: `gateway-vectors/${kind}/${jsonName}`,
      length: record.sequence.length,
    })
    console.log(`${kind}\t${slim.name}\t${record.sequence.length}`)
  }

  entries.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  return entries
}

// Validate both inputs before deleting any existing generated catalog files.
for (const kind of ['donor', 'destination'] as const) {
  const sourceDir = join('snapgene-gateway-vectors', kind)
  if (!existsSync(sourceDir) || !readdirSync(sourceDir).some((name) => name.toLowerCase().endsWith('.dna'))) {
    throw new Error(`Gateway source files are missing from ${sourceDir}. Supply the SnapGene source files before regenerating the catalog.`)
  }
}

const donor = convertKind('donor')
const destination = convertKind('destination')
const catalog = { donor, destination }
writeFileSync(join(OUT_ROOT, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`)
console.log(`Wrote ${donor.length} donor + ${destination.length} destination Gateway vectors`)
