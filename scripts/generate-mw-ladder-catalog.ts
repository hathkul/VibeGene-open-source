/**
 * Build src/data/mwLadderCatalog.json from SnapGene-style ladder XML.
 *
 * Usage: npx tsx scripts/generate-mw-ladder-catalog.ts
 */
import { JSDOM } from 'jsdom'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(root, '..')
const xmlPath = join(projectRoot, 'src/data/MWmarkers1.xml')
const outPath = join(projectRoot, 'src/data/mwLadderCatalog.json')

function slug(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

type FragmentFormat = 'normal' | 'bold' | 'hidden'

type CatalogFragment = {
  lengthBp: number
  mass: number
  format: FragmentFormat
}

type CatalogLadder = {
  id: string
  name: string
  supplier: string
  preferredUnits: 'bp' | 'kb'
  concentration: number | null
  url: string | null
  isDefault: boolean
  fragments: CatalogFragment[]
}

type CatalogSupplier = {
  supplier: string
  ladders: CatalogLadder[]
}

const xml = readFileSync(xmlPath, 'utf8')
const dom = new JSDOM(xml, { contentType: 'text/xml' })
const document = dom.window.document

const usedIds = new Set<string>()
function uniqueId(supplier: string, name: string) {
  const supplierSlug = slug(supplier)
  const nameSlug = slug(name)
  const base = supplierSlug || nameSlug ? `${supplierSlug}__${nameSlug}` : 'ladder'
  let id = base
  let n = 2
  while (usedIds.has(id)) {
    id = `${base}-${n}`
    n += 1
  }
  usedIds.add(id)
  return id
}

const suppliers: CatalogSupplier[] = []
for (const supplierEl of Array.from(document.querySelectorAll('Supplier'))) {
  const supplier = supplierEl.getAttribute('name')?.trim() || 'Unknown'
  const ladders: CatalogLadder[] = []
  for (const ladderEl of Array.from(supplierEl.querySelectorAll(':scope > Ladder'))) {
    const name = ladderEl.getAttribute('name')?.trim()
    if (!name) continue
    const unitsRaw = (ladderEl.getAttribute('preferredUnits') || 'bp').toLowerCase()
    const preferredUnits = unitsRaw === 'kb' ? 'kb' : 'bp'
    const concentrationRaw = ladderEl.getAttribute('concentration')
    const concentration = concentrationRaw ? Number(concentrationRaw) : null
    const urlRaw = ladderEl.getAttribute('url')?.trim() || null
    const url = urlRaw && urlRaw !== '??' ? urlRaw : null
    const isDefault = ladderEl.getAttribute('defaultLadder') === '1'
    const fragments: CatalogFragment[] = []
    for (const fragmentEl of Array.from(ladderEl.querySelectorAll(':scope > Fragment'))) {
      const lengthBp = Number(fragmentEl.getAttribute('length'))
      const mass = Number(fragmentEl.getAttribute('mass') ?? 0)
      if (!Number.isFinite(lengthBp) || lengthBp <= 0) continue
      const formatRaw = (fragmentEl.getAttribute('format') || 'normal').toLowerCase()
      const format: FragmentFormat =
        formatRaw === 'bold' ? 'bold' : formatRaw === 'hidden' ? 'hidden' : 'normal'
      fragments.push({
        lengthBp,
        mass: Number.isFinite(mass) && mass > 0 ? mass : 1,
        format,
      })
    }
    if (fragments.length === 0) continue
    ladders.push({
      id: uniqueId(supplier, name),
      name,
      supplier,
      preferredUnits,
      concentration: Number.isFinite(concentration) ? concentration : null,
      url,
      isDefault,
      fragments,
    })
  }
  if (ladders.length > 0) suppliers.push({ supplier, ladders })
}

const payload = {
  generatedFrom: 'src/data/MWmarkers1.xml',
  supplierCount: suppliers.length,
  ladderCount: suppliers.reduce((sum, group) => sum + group.ladders.length, 0),
  suppliers,
}

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(
  `Wrote ${outPath} (${payload.ladderCount} ladders in ${payload.supplierCount} suppliers)`,
)
