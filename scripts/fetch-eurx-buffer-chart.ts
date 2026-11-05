import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { EurxBufferCode } from '../src/domain/types.ts'
import { eurxAlsoKnownAsOverrides, eurxDuplicateSkuNames } from './eurx-recognition-chart.ts'

const PRODUCTS_URL = 'https://eurx.com.pl/products/endonukleazy-restrykcyjne/'
const ONE_BUFFER_URL = 'https://eurx.com.pl/one-buffer/'
const PDF_BASE = 'https://eurx.com.pl/docs/specs/en'

const pdfFallbackByCatalogNumber: Record<string, string> = {
  E2295: 'E2296',
  E2330: 'E2331',
}

const activityColumns = ['one', 'cviJI', 'cviJIStar', 'tspGWI', 'tspDTI', 'sau3AI', 'specific'] as const satisfies readonly EurxBufferCode[]

const methylationOverrides: Record<string, Partial<EurxChartProfile['methylation']>> = {
  DpnI: { dam: 'Requires Dam methylation' },
  MboI: { dam: 'Blocked by Dam methylation' },
  Sau3AI: { dam: 'Blocked by Dam methylation' },
  HpaII: { dcm: 'Blocked by Dcm methylation' },
  MspI: { dcm: 'Cleaves methylated and unmethylated CCGG' },
}

export type EurxChartProfile = {
  eurxName: string
  catalogName: string
  alsoKnownAs: string | null
  catalogNumber: string
  preferredBuffer: EurxBufferCode
  suppliedBuffer: string
  bufferActivity: Partial<Record<EurxBufferCode, string>>
  heatInactivation: string | null
  incubationC: number
  incubationMinutes: number | null
  productUrl: string
  prototype: string | null
  requiresBsa: boolean
  methylation: {
    dam: string
    dcm: string
    ecoKI: string
  }
}

export function eurxBufferLabel(buffer: EurxBufferCode) {
  if (buffer === 'one') return 'ONE Buffer'
  if (buffer === 'cviJI') return 'CviJI Buffer (5×)'
  if (buffer === 'cviJIStar') return 'CviJI(*) Buffer (2×)'
  if (buffer === 'tspGWI') return 'TspGWI Buffer'
  if (buffer === 'tspDTI') return 'TspDTI Buffer'
  if (buffer === 'sau3AI') return 'Sau3AI Buffer'
  return 'Specific buffer'
}

export function normalizeEurxActivityValue(raw: string) {
  const trimmed = raw.replace(/\u2013/g, '-').replace(/\s+/g, '').trim()
  if (!trimmed || trimmed === '–' || trimmed === '-') return ''
  if (trimmed.toUpperCase() === 'NR') return 'NR'
  return trimmed
}

export function preferredBufferFromReactionText(text: string): EurxBufferCode {
  const normalized = text.replace(/\s+/g, ' ')
  if (/CviJI\* Buffer/i.test(normalized)) return 'cviJIStar'
  if (/CviJI Buffer/i.test(normalized)) return 'cviJI'
  if (/TspGWI Buffer/i.test(normalized)) return 'tspGWI'
  if (/TspDTI Buffer/i.test(normalized)) return 'tspDTI'
  if (/Sau3AI Buffer/i.test(normalized)) return 'sau3AI'
  if (/ONE Buffer/i.test(normalized)) return 'one'
  return 'one'
}

export function parseEurxIncubation(text: string) {
  const normalized = text.replace(/\s+/g, ' ')
  const reactionTemp = normalized.match(/Reaction Temperature:\s*(\d+)\s*°C/i)?.[1]
  const incubate = normalized.match(/Incubate(?:\s+for\s+(\d+)\s*h(?:r)?)?\s+at\s+(\d+)\s*°C/i)
  if (incubate) {
    const hours = incubate[1] ? Number(incubate[1]) : null
    return {
      incubationC: Number(incubate[2]),
      incubationMinutes: hours ? hours * 60 : null,
    }
  }
  return {
    incubationC: reactionTemp ? Number(reactionTemp) : 37,
    incubationMinutes: null as number | null,
  }
}

export function parseEurxHeatInactivation(text: string) {
  const normalized = text.replace(/\s+/g, ' ')
  const explicit = normalized.match(/Inactivation Temperature\s*\(20 min\):\s*(\d+)\s*°C/i)
  if (explicit) return `${explicit[1]}°C for 20 min`
  const heat = normalized.match(/Heat Inactivation\s+20 min at\s+(\d+)\s*°C/i)
  if (heat) return `${heat[1]}°C for 20 min`
  if (/Inactivation Temperature:\s*(?:no|—|–|-)/i.test(normalized)) return null
  return null
}

export function parseEurxMethylation(text: string) {
  const normalized = text.replace(/\s+/g, ' ')
  const defaults = { dam: 'No Effect', dcm: 'No Effect', ecoKI: 'No Effect' }

  const noInhibition = normalized.match(/No Inhibition:\s*([^.]+)/i)?.[1] ?? ''
  if (/\bdam\b/i.test(noInhibition)) defaults.dam = 'No Effect'
  if (/\bdcm\b/i.test(noInhibition)) defaults.dcm = 'No Effect'
  if (/\bEcoKI\b/i.test(noInhibition)) defaults.ecoKI = 'No Effect'

  const blocked = [...normalized.matchAll(/Inhibition\s*\(([^)]+)\):\s*([^.]+)/gi)]
  for (const entry of blocked) {
    const label = entry[1]!.toLowerCase()
    const detail = entry[2]!.trim()
    if (label.includes('dam')) defaults.dam = detail
    if (label.includes('dcm')) defaults.dcm = detail
    if (label.includes('cpg')) defaults.ecoKI = detail
    if (label.includes('blocked')) {
      if (/\bdam\b/i.test(entry[1]!)) defaults.dam = detail
      if (/\bdcm\b/i.test(entry[1]!)) defaults.dcm = detail
    }
  }

  if (/Potential Inhibition:\s*CpG/i.test(normalized) && defaults.ecoKI === 'No Effect') {
    defaults.ecoKI = 'Potential inhibition (CpG)'
  }

  return defaults
}

export function parseEurxPrototype(text: string) {
  return text.match(/Prototype:\s*([A-Za-z0-9*]+)/)?.[1]?.trim() ?? null
}

export function catalogNameForEurxProduct(
  eurxName: string,
  prototype: string | null,
  catalogNames: ReadonlySet<string>,
) {
  if (eurxDuplicateSkuNames.has(eurxName)) return null
  if (eurxAlsoKnownAsOverrides[eurxName]) return eurxName
  if (catalogNames.has(eurxName)) return eurxName
  if (prototype && catalogNames.has(prototype)) return prototype
  return eurxName
}

type EurxProductLink = {
  eurxName: string
  catalogNumber: string
  productUrl: string
}

type OneBufferRow = {
  oneActivity: string
  specificActivity: string
}

function normalizeEurxProductName(raw: string) {
  const reduced = /\(reduced star activity\)/i.test(raw)
  const stripped = raw.replace(/\s*\(reduced star activity\)/gi, '').trim()
  if (reduced) {
    if (/^Mlul$/i.test(stripped)) return 'Mlul'
    if (/^NotI$/i.test(stripped)) return 'NotI RS'
    if (/^PvuII$/i.test(stripped)) return 'PvuII RS'
    if (/^SalI$/i.test(stripped)) return 'SalI RS'
    if (/^ScaI$/i.test(stripped)) return 'ScaI RS'
    if (/^SfiI$/i.test(stripped)) return 'SfiI RS'
  }
  return stripped.replace(/\s+/g, ' ').trim()
}

function parseProductLinks(html: string): EurxProductLink[] {
  const products: EurxProductLink[] = []
  const pattern =
    /<h3 class="tbl-title"><a href="https:\/\/eurx\.com\.pl\/product\/(e\d+)_pl\/">([^<]+)<\/a><span>(E\d+)<\/span><\/h3>/gi
  for (const match of html.matchAll(pattern)) {
    const slug = match[1]!
    const eurxName = normalizeEurxProductName(match[2]!.trim())
    const catalogNumber = match[3]!
    products.push({
      eurxName,
      catalogNumber,
      productUrl: `https://eurx.com.pl/product/${slug}/`,
    })
  }
  return products
}

function parseOneBufferTable(html: string) {
  const rows = new Map<string, OneBufferRow>()
  const products: EurxProductLink[] = []

  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
      match[1]!
        .replace(/<[^>]+>/g, '')
        .replace(/&#8211;/g, '–')
        .replace(/&nbsp;/g, ' ')
        .trim(),
    )
    if (cells.length < 7) continue
    const enzyme = normalizeEurxProductName(cells[0]!)
    const catalogNumber = cells[1]!
    if (!enzyme || enzyme === 'ONE' || !/^E\d+$/i.test(catalogNumber)) continue

    const oneActivity = normalizeEurxActivityValue(cells[5] ?? '')
    const specificActivity = normalizeEurxActivityValue(cells[6] ?? '')
    rows.set(enzyme, { oneActivity, specificActivity })
    products.push({
      eurxName: enzyme,
      catalogNumber,
      productUrl: `https://eurx.com.pl/product/${catalogNumber.toLowerCase()}/`,
    })
  }

  return { rows, products }
}

function bufferActivityForProduct(
  eurxName: string,
  preferredBuffer: EurxBufferCode,
  oneBufferRow: OneBufferRow | undefined,
): Partial<Record<EurxBufferCode, string>> {
  const activity: Partial<Record<EurxBufferCode, string>> = {}
  if (oneBufferRow?.oneActivity) activity.one = oneBufferRow.oneActivity
  if (oneBufferRow?.specificActivity) activity.specific = oneBufferRow.specificActivity

  if (preferredBuffer !== 'one') {
    activity[preferredBuffer] = '100'
    if (!activity.one) activity.one = 'NR'
  } else if (!activity.one) {
    activity.one = '100'
  }

  return activity
}

async function fetchText(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.text()
}

async function fetchPdfText(catalogNumber: string) {
  const url = `${PDF_BASE}/${catalogNumber.toLowerCase()}.pdf`
  const data = new Uint8Array(
    await fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${url}`)
      return response.arrayBuffer()
    }),
  )
  const doc = await getDocument({ data }).promise
  let text = ''
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()
    text += `${content.items.map((item) => ('str' in item ? item.str : '')).join(' ')}\n`
  }
  return text
}

export function buildEurxChart(
  products: EurxProductLink[],
  pdfTextByCatalogNumber: Record<string, string>,
  oneBufferRows: Map<string, OneBufferRow>,
  catalogNames: ReadonlySet<string>,
) {
  const chart: Record<string, EurxChartProfile> = {}

  for (const product of products) {
    if (eurxDuplicateSkuNames.has(product.eurxName)) continue

    const pdfText = pdfTextByCatalogNumber[product.catalogNumber] ?? ''
    const prototype = pdfText ? parseEurxPrototype(pdfText) : null
    const catalogName = catalogNameForEurxProduct(product.eurxName, prototype, catalogNames)
    if (!catalogName) continue
    if (chart[catalogName]) continue

    const preferredBuffer = pdfText ? preferredBufferFromReactionText(pdfText) : 'one'
    const oneBufferRow = oneBufferRows.get(product.eurxName)
    const alsoKnownAs = eurxAlsoKnownAsOverrides[product.eurxName] ?? null

    const { incubationC, incubationMinutes } = pdfText
      ? parseEurxIncubation(pdfText)
      : { incubationC: 37, incubationMinutes: null as number | null }

    chart[catalogName] = {
      eurxName: product.eurxName,
      catalogName,
      alsoKnownAs: alsoKnownAs && alsoKnownAs !== catalogName ? alsoKnownAs : null,
      catalogNumber: product.catalogNumber,
      preferredBuffer,
      suppliedBuffer: eurxBufferLabel(preferredBuffer),
      bufferActivity: bufferActivityForProduct(product.eurxName, preferredBuffer, oneBufferRow),
      heatInactivation: pdfText ? parseEurxHeatInactivation(pdfText) : null,
      incubationC,
      incubationMinutes,
      productUrl: product.productUrl,
      prototype,
      requiresBsa: /BSA\s*\[100x\]/i.test(pdfText) || /supplemented with 100\s*µg\/ml bovine serum albumin/i.test(pdfText),
      methylation: {
        ...parseEurxMethylation(pdfText),
        ...methylationOverrides[catalogName],
      },
    }
  }

  return chart
}

async function main() {
  const root = dirname(fileURLToPath(import.meta.url))
  const catalogNames = new Set(
    (JSON.parse(readFileSync(join(root, '../src/data/enzymes.json'), 'utf8')) as Array<{ name: string }>).map(
      (enzyme) => enzyme.name,
    ),
  )

  const [productsHtml, oneBufferHtml] = await Promise.all([fetchText(PRODUCTS_URL), fetchText(ONE_BUFFER_URL)])
  const pageProducts = parseProductLinks(productsHtml)
  const { rows: oneBufferRows, products: oneBufferProducts } = parseOneBufferTable(oneBufferHtml)
  const productsByCatalog = new Map<string, EurxProductLink>()
  for (const product of [...oneBufferProducts, ...pageProducts]) {
    if (eurxDuplicateSkuNames.has(product.eurxName)) continue
    if (!productsByCatalog.has(product.catalogNumber)) {
      productsByCatalog.set(product.catalogNumber, product)
    }
  }
  const products = [...productsByCatalog.values()]

  const pdfTextByCatalogNumber: Record<string, string> = {}
  for (const product of products) {
    if (eurxDuplicateSkuNames.has(product.eurxName)) continue
    const candidates = [
      product.catalogNumber,
      pdfFallbackByCatalogNumber[product.catalogNumber],
    ].filter((value): value is string => Boolean(value))
    for (const catalogNumber of candidates) {
      if (pdfTextByCatalogNumber[product.catalogNumber]) break
      try {
        pdfTextByCatalogNumber[product.catalogNumber] = await fetchPdfText(catalogNumber)
      } catch (error) {
        if (catalogNumber === candidates.at(-1)) {
          console.warn(`Skipped PDF ${product.catalogNumber}: ${error instanceof Error ? error.message : error}`)
        }
      }
    }
  }

  const chart = buildEurxChart(products, pdfTextByCatalogNumber, oneBufferRows, catalogNames)
  const outputPath = join(root, 'eurx-buffer-chart.json')
  writeFileSync(outputPath, `${JSON.stringify(chart, null, 2)}\n`)
  console.log(
    `Wrote ${Object.keys(chart).length} EURx enzymes (${products.length} product links, ${Object.keys(pdfTextByCatalogNumber).length} PDFs) to ${outputPath}`,
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

export { activityColumns }
