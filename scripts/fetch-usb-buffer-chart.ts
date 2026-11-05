import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UsbBufferCode } from '../src/domain/types.ts'

const SEARCH_URL = 'https://api.usbio.net/api/search'
const PRODUCT_URL = 'https://api.usbio.net/api/products/'

export type UsbChartProfile = {
  usbName: string
  catalogName: string
  catalogNumber: string
  recognitionRaw: string
  description: string
  preferredBuffer: UsbBufferCode
  suppliedBuffer: string | null
  bufferActivity: Partial<Record<UsbBufferCode, number | string | null>>
  heatInactivation: string | null
  incubationC: number
  methylation: {
    dam: string
    dcm: string
    ecoKI: string
  }
}

const usbBufferLetters: UsbBufferCode[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'k', 'l']

const methylationOverrides: Record<string, Partial<UsbChartProfile['methylation']>> = {
  DpnI: { dam: 'Requires Dam methylation' },
  DpnII: { dam: 'Blocked by Dam methylation' },
  EcoRII: { dam: 'Blocked by Dam methylation' },
  MboI: { dam: 'Blocked by Dam methylation' },
  Sau3AI: { dam: 'Blocked by Dam methylation' },
  HpaII: { dcm: 'Blocked by Dcm methylation' },
  MspI: { dcm: 'Cleaves methylated and unmethylated CCGG' },
}

function decodeHtml(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&darr;/g, '↓')
    .replace(/&uarr;/g, '↑')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&ordm;/g, '°')
    .replace(/&deg;/g, '°')
    .replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim()
}

export function usbNameToCatalog(name: string) {
  const cleaned = name.trim().replace(/\s+/g, ' ')
  const parts = cleaned.split(' ')
  const last = parts[parts.length - 1]
  if (parts.length >= 2 && last && /^I{1,3}$/.test(last)) {
    return `${parts.slice(0, -1).join('')}${last}`
  }
  return cleaned.replace(/\s+/g, '')
}

function isRestrictionProduct(productNameShort: string) {
  const name = productNameShort.trim()
  if (/buffer|diluent/i.test(name)) return false
  if (/kinase/i.test(name)) return false
  if (/^HPH\b/i.test(name)) return false
  return /I$/.test(name.replace(/\s+/g, ''))
}

function sectionValue(description: string, label: string) {
  const match = description.match(new RegExp(`${label}:\\|([^|]+)`, 'i'))
  return match?.[1]?.trim() ?? null
}

function letterToCode(letter: string): UsbBufferCode | null {
  const normalized = letter.toLowerCase()
  return usbBufferLetters.includes(normalized as UsbBufferCode) ? (normalized as UsbBufferCode) : null
}

function bufferActivityFor(preferred: UsbBufferCode | null): Partial<Record<UsbBufferCode, number | string | null>> {
  const activity: Partial<Record<UsbBufferCode, number | string | null>> = {}
  for (const code of usbBufferLetters) {
    activity[code] = preferred === code ? 100 : null
  }
  return activity
}

function suppliedBuffersFrom(description: string) {
  const block = sectionValue(description, 'Supplied With')
  if (!block) return []

  return block
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const match = part.match(/^(R1625[^:]*):\s*(.+)$/i)
      return match ? [{ code: match[1]!.trim(), label: match[2]!.trim() }] : []
    })
}

function preferredBufferFor(description: string): { preferred: UsbBufferCode | null; suppliedBuffer: string | null } {
  const supplied = suppliedBuffersFrom(description)
  const custom = supplied.filter((entry) => /buffer for/i.test(entry.label))
  if (custom.length) {
    const entry = custom[custom.length - 1]!
    const label = entry.label.split(':')[0]!.trim()
    const letter = label.match(/Buffer ([A-L])\b/i)
    return {
      preferred: letter ? letterToCode(letter[1]!) : null,
      suppliedBuffer: label,
    }
  }

  for (const entry of supplied) {
    const letter = entry.label.match(/Buffer ([A-L])\b/i)
    if (letter) {
      return {
        preferred: letterToCode(letter[1]!),
        suppliedBuffer: entry.label,
      }
    }
  }

  const letterMatch = description.match(/Restriction Enzyme Buffer ([A-L]), 10X/i)
  if (letterMatch) {
    const letter = letterToCode(letterMatch[1]!)
    return {
      preferred: letter,
      suppliedBuffer: `Restriction Enzyme Buffer ${letterMatch[1]!.toUpperCase()}, 10X`,
    }
  }

  const compatible = description.match(/Compatible Buffer:\s*([^|]+)/i)
  if (compatible) {
    return { preferred: null, suppliedBuffer: compatible[1]!.trim() }
  }

  const assayBuffer = sectionValue(description, 'Buffer')
  if (assayBuffer) {
    return { preferred: null, suppliedBuffer: assayBuffer }
  }

  return { preferred: null, suppliedBuffer: null }
}

function parseMethylation(description: string): UsbChartProfile['methylation'] {
  const defaults = { dam: 'No Effect', dcm: 'No Effect', ecoKI: 'No Effect' }
  const block =
    sectionValue(description, 'Methylation Effects') ??
    sectionValue(description, 'Methylation Effect') ??
    sectionValue(description, 'Methylation Sensitivity')
  if (!block) return defaults

  const normalized = block.toLowerCase()
  const methylation = { ...defaults }

  if (/dam[^|]*never|not dam|dam:\s*never/i.test(block)) methylation.dam = 'No Effect'
  else if (/dam[^|]*block/i.test(block)) methylation.dam = 'Blocked by Dam methylation'
  else if (/requires dam/i.test(block)) methylation.dam = 'Requires Dam methylation'
  else if (/dam/.test(normalized) && /no effect|never overlaps/.test(normalized)) methylation.dam = 'No Effect'

  if (/dcm[^|]*never|not dcm/i.test(block)) methylation.dcm = 'No Effect'
  else if (/dcm[^|]*block/i.test(block)) methylation.dcm = 'Blocked by Dcm methylation'
  else if (/dcm/.test(normalized) && /no effect|never overlaps|may overlap[^|]*no effect/i.test(normalized)) {
    methylation.dcm = 'No Effect'
  }

  if (/ecok|eco\s*k/i.test(block) && /no effect|never/i.test(block)) methylation.ecoKI = 'No Effect'

  return methylation
}

function parseHeatInactivation(description: string) {
  const value =
    description.match(/Thermal Inactivation:\s*\|\s*([^|]+)/i)?.[1]?.trim() ??
    description.match(/Heat Inactivation:\s*\|\s*([^|]+)/i)?.[1]?.trim() ??
    null
  if (!value) return null
  if (/not heat|no heat/i.test(value)) return null
  return value.includes('°') ? value : value
}

function parseIncubation(description: string) {
  if (/incubat[^|]*65\s*°?c/i.test(description)) return 65
  if (/incubat[^|]*55\s*°?c/i.test(description)) return 55
  return 37
}

function recognitionRawFrom(description: string) {
  const first = description.split('||')[0]?.trim() ?? ''
  const site = description.match(/recognizes\s+([A-Z^/()\dNRYKMSWBDHV.]+?)\s+site/i)
  if (site) return site[1]!.trim()
  return first
}

async function searchRestrictionProducts() {
  const body = {
    size: 200,
    from: 0,
    querystring: '',
    filters: [
      { field: 'category', value: 'Molecular Biology' },
      { field: 'subcategory', value: 'Enzymes, Restriction' },
      { field: 'discontinued', value: false },
    ],
  }

  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`USB search failed: ${response.status}`)
  const payload = (await response.json()) as {
    hits: { hits: Array<{ _source: { catalogNumber: string; productNameShort: string } }> }
  }
  return payload.hits.hits
    .map((hit) => hit._source)
    .filter((source) => isRestrictionProduct(source.productNameShort))
}

async function fetchProduct(catalogNumber: string) {
  const response = await fetch(`${PRODUCT_URL}${encodeURIComponent(catalogNumber)}`)
  if (!response.ok) throw new Error(`USB product ${catalogNumber} failed: ${response.status}`)
  return (await response.json()) as {
    catalogNumber: string
    productNameShort: string
    productNoPrefix: string
    description1: string
  }
}

export async function buildUsbChart() {
  const searchHits = await searchRestrictionProducts()
  const chart: Record<string, UsbChartProfile> = {}
  const skipped: string[] = []

  for (const hit of searchHits) {
    const product = await fetchProduct(hit.catalogNumber)
    const usbName = product.productNameShort.trim()
    const catalogName = usbNameToCatalog(usbName)
    if (chart[catalogName]) continue

    const description = decodeHtml(product.description1 ?? '')
    if (!description) {
      skipped.push(usbName)
      continue
    }

    const recognitionRaw = recognitionRawFrom(description)
    const { preferred, suppliedBuffer } = preferredBufferFor(description)
    const methylation = {
      ...parseMethylation(description),
      ...methylationOverrides[catalogName],
    }

    chart[catalogName] = {
      usbName,
      catalogName,
      catalogNumber: product.catalogNumber,
      recognitionRaw,
      description,
      preferredBuffer: preferred ?? 'a',
      suppliedBuffer,
      bufferActivity: bufferActivityFor(preferred),
      heatInactivation: parseHeatInactivation(description),
      incubationC: parseIncubation(description),
      methylation,
    }
  }

  return { chart, skipped }
}

async function main() {
  const { chart, skipped } = await buildUsbChart()
  const root = dirname(fileURLToPath(import.meta.url))
  const outputPath = join(root, 'usb-buffer-chart.json')
  writeFileSync(outputPath, `${JSON.stringify(chart, null, 2)}\n`)
  console.log(`Wrote ${Object.keys(chart).length} USB enzymes to ${outputPath}`)
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} USB products without descriptions: ${skipped.join(', ')}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
