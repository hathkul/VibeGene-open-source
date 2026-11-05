/**
 * Convert SnapGene TA/GC Cloning .dna plasmids into JSON for the app catalog.
 *
 * Source (local SnapGene install):
 *   /Applications/SnapGene.app/Contents/Resources/Plasmids/TA and GC Cloning/
 *
 * Usage:
 *   npx tsx scripts/generate-ta-gc-vector-catalog.ts
 */
import { JSDOM } from 'jsdom'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

;(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = new JSDOM('').window.DOMParser

const { parseSnapGene } = await import('../src/domain/parsers.ts')

type Method = 'ta' | 'gc'

const SNAPGENE_ROOT =
  '/Applications/SnapGene.app/Contents/Resources/Plasmids/TA and GC Cloning'
const SOURCE: Record<Method, string> = {
  ta: join(SNAPGENE_ROOT, 'TA Cloning Vectors'),
  gc: join(SNAPGENE_ROOT, 'GC Cloning Vectors'),
}
const OUT_ROOT = join('public', 'ta-gc-vectors')

function extractLabel(notesXml: string, fallback: string) {
  const match = notesXml.match(/<CustomMapLabel>([^<]*)<\/CustomMapLabel>/)
  return match?.[1]?.trim() || fallback
}

function stemLabel(fileName: string) {
  return fileName.replace(/\.dna$/i, '').replace(/\s*\(linearized\)\s*$/i, '').trim()
}

async function convertMethod(method: Method) {
  const sourceDir = SOURCE[method]
  const outDir = join(OUT_ROOT, method)
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
    const label = extractLabel(record.description || '', stemLabel(fileName)) || record.name || stemLabel(fileName)
    // Prefer CustomMapLabel from notes when description lacks it — re-read name from construct/map.
    const displayName = record.name?.includes('™') || record.name?.includes('®') ? record.name : label
    const jsonName = fileName.replace(/\.dna$/i, '.json')
    const slim = {
      name: displayName,
      description: record.description,
      molecule: record.molecule,
      topology: 'linear' as const,
      sequence: record.sequence,
      features: record.features,
      primers: [] as [],
      dnaEnds: record.dnaEnds,
      construct: record.construct,
    }
    writeFileSync(join(outDir, jsonName), JSON.stringify(slim))
    entries.push({
      id: `${method}:${fileName}`,
      method,
      label: slim.name,
      fileName: jsonName,
      path: `ta-gc-vectors/${method}/${jsonName}`,
      length: record.sequence.length,
    })
    console.log(`${method}\t${slim.name}\t${record.sequence.length}`)
  }

  entries.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  return entries
}

mkdirSync(OUT_ROOT, { recursive: true })
const catalog = {
  ta: await convertMethod('ta'),
  gc: await convertMethod('gc'),
}
writeFileSync(join(OUT_ROOT, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`)
console.log(`Wrote ${catalog.ta.length} TA + ${catalog.gc.length} GC vectors`)
