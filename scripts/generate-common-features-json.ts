/**
 * Build src/data/commonFeatures.json from SnapGene-exported standard feature .dna files.
 *
 * Usage: npx tsx scripts/generate-common-features-json.ts
 *        [optional path to Exported Standard Features directory]
 */
import { JSDOM } from 'jsdom'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSnapGene } from '../src/domain/parsers.ts'
import type { CommonFeatureTemplate } from '../src/domain/commonFeatures.ts'

const dom = new JSDOM('<!DOCTYPE html><html></html>')
;(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = dom.window.DOMParser

const root = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(root, '..')
const sourceDir = resolve(process.argv[2] ?? join(projectRoot, 'Exported Standard Features'))
const outPath = join(projectRoot, 'src/data/commonFeatures.json')

function slugFromFileName(fileName: string) {
  return fileName
    .replace(/\.dna$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseQualifiersFromNotes(notes: string | undefined): Array<{ name: string; value: string }> {
  if (!notes?.trim()) return []
  const known = [
    'product',
    'gene',
    'note',
    'bound_moiety',
    'direction',
    'allele',
    'citation',
    'db_xref',
    'EC_number',
    'experiment',
    'function',
    'label',
    'locus_tag',
    'map',
    'number',
    'operon',
    'organism',
    'phenotype',
    'plasmid',
    'protein_id',
    'pseudo',
    'ribosomal_slippage',
    'standard_name',
    'strain',
    'sub_species',
    'taxon',
    'transcript_id',
    'transgenic',
  ]
  const pattern = new RegExp(`(?:^|\\s)(${known.join('|')}):\\s*`, 'gi')
  const parts: Array<{ name: string; value: string }> = []
  const matches = [...notes.matchAll(pattern)]
  if (!matches.length) {
    return [{ name: 'note', value: sanitizeDescriptorText(notes.trim()) }]
  }
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const name = match[1]
    const valueStart = (match.index ?? 0) + match[0].length
    const valueEnd = index + 1 < matches.length ? (matches[index + 1].index ?? notes.length) : notes.length
    const value = sanitizeDescriptorText(notes.slice(valueStart, valueEnd).trim())
    if (value) parts.push({ name, value })
  }
  return parts
}

/** SnapGene notes sometimes embed literal HTML entities such as `&nbsp;`. */
function sanitizeDescriptorText(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const files = readdirSync(sourceDir)
  .filter((name) => name.toLowerCase().endsWith('.dna'))
  .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

if (!files.length) {
  console.error(`No .dna files found in ${sourceDir}`)
  process.exit(1)
}

const usedIds = new Set<string>()
const templates: CommonFeatureTemplate[] = []
let skipped = 0

for (const fileName of files) {
  const bytes = new Uint8Array(readFileSync(join(sourceDir, fileName)))
  let record
  try {
    record = parseSnapGene(bytes, fileName, { skipTraces: true })
  } catch (error) {
    console.warn(`Skip ${fileName}:`, error)
    skipped += 1
    continue
  }
  const feature = record.features[0]
  if (!feature || !record.sequence) {
    skipped += 1
    continue
  }

  let id = slugFromFileName(fileName)
  if (!id) id = `feature-${templates.length + 1}`
  if (usedIds.has(id)) {
    let suffix = 2
    while (usedIds.has(`${id}-${suffix}`)) suffix += 1
    id = `${id}-${suffix}`
  }
  usedIds.add(id)

  const qualifiers = parseQualifiersFromNotes(feature.notes)
  const notes = feature.notes ? sanitizeDescriptorText(feature.notes) : feature.notes
  templates.push({
    id,
    fileName,
    name: feature.name,
    type: feature.type,
    color: feature.color,
    sequence: record.sequence.toUpperCase(),
    notes,
    qualifiers,
    locations: feature.locations.map((location) => ({
      start: location.start,
      end: location.end,
      strand: location.strand,
    })),
    ...(feature.cleavageArrows?.length ? { cleavageArrows: [...feature.cleavageArrows] } : {}),
    ...(feature.translateInSequenceView ? { translateInSequenceView: true } : {}),
    ...(feature.translation ? { translation: feature.translation } : {}),
    ...(feature.prioritizeDisplay ? { prioritizeDisplay: true } : {}),
  })
}

writeFileSync(outPath, `${JSON.stringify(templates)}\n`)
console.log(
  `Wrote ${templates.length} common features (${skipped} skipped) → ${outPath} (${Math.round(JSON.stringify(templates).length / 1024)} KB)`,
)
