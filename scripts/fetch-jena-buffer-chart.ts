import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { JenaBufferCode } from '../src/domain/types.ts'

const MASTER_URL = 'https://www.jenabioscience.com/molecular-biology/enzymes-protein-markers/restriction-enzymes'
const PDF_BASE = 'https://www.jenabioscience.com/images/PDF'

const activityColumns = ['b1', 'b2', 'b3', 'b4', 'b5', 'ub', 'ub05', 'ub2'] as const satisfies readonly JenaBufferCode[]

const methylationOverrides: Record<string, Partial<JenaChartProfile['methylation']>> = {
  DpnI: { dam: 'Requires Dam methylation' },
  DpnII: { dam: 'Blocked by Dam methylation' },
  EcoRII: { dam: 'Blocked by Dam methylation' },
  MboI: { dam: 'Blocked by Dam methylation' },
  Sau3AI: { dam: 'Blocked by Dam methylation' },
  HpaII: { dcm: 'Blocked by Dcm methylation' },
  MspI: { dcm: 'Cleaves methylated and unmethylated CCGG' },
}

export type JenaChartProfile = {
  jenaName: string
  catalogName: string
  alsoKnownAs: string | null
  catalogNumber: string
  preferredBuffer: JenaBufferCode
  suppliedBuffer: string
  bufferActivity: Partial<Record<JenaBufferCode, string>>
  heatInactivation: string | null
  incubationC: number
  incubationMinutes: number | null
  productUrl: string
  methylation: {
    dam: string
    dcm: string
    ecoKI: string
  }
}

export function jenaBufferLabel(buffer: JenaBufferCode) {
  if (buffer === 'ub') return '10× Universal Buffer (UB)'
  if (buffer === 'ub05') return '0.5× Universal Buffer (UB)'
  if (buffer === 'ub2') return '2× Universal Buffer (UB)'
  return `10× Buffer B${buffer.slice(1)}`
}

export function normalizeJenaActivityValue(raw: string) {
  const trimmed = raw.replace(/\u2013/g, '-').replace(/\s+/g, '').trim()
  if (!trimmed) return ''
  if (trimmed === '<10') return '<10'
  return trimmed
}

export function parseJenaBufferActivity(text: string) {
  const normalized = text.replace(/\s+/g, ' ')
  const section = normalized.match(/Double Digestion - Buffer Compatibility:\s*(.*?)\s*Please/s)?.[1]
  if (!section) return { bufferActivity: {}, preferredBuffer: 'ub' as JenaBufferCode }

  const bufferActivity: Partial<Record<JenaBufferCode, string>> = {}
  const patterns: Array<[RegExp, JenaBufferCode]> = [
    [/\bB1\s*-\s*([^%]+?)\s*%\s*Relative Activity/gi, 'b1'],
    [/\bB2\s*-\s*([^%]+?)\s*%\s*Relative Activity/gi, 'b2'],
    [/\bB3\s*-\s*([^%]+?)\s*%\s*Relative Activity/gi, 'b3'],
    [/\bB4\s*-\s*([^%]+?)\s*%\s*Relative Activity/gi, 'b4'],
    [/\bB5\s*-\s*([^%]+?)\s*%\s*Relative Activity/gi, 'b5'],
    [/0\.5x\s+UB\s*-\s*([^%]+?)\s*%\s*Relative Activity/gi, 'ub05'],
    [/2x\s+UB\s*-\s*([^%]+?)\s*%\s*Relative Activity/gi, 'ub2'],
    [/1x\s+UB\s*-\s*([^%]+?)\s*%\s*Relative Activity/gi, 'ub'],
  ]

  for (const [pattern, code] of patterns) {
    const match = pattern.exec(section)
    if (match?.[1]) {
      const value = normalizeJenaActivityValue(match[1])
      if (value) bufferActivity[code] = value
    }
  }

  const optimum = normalized.match(/optimum digestion condition for this en-?\s*zyme is\s*(0\.5x|1x|2x)\s+UB/i)
  let preferredBuffer: JenaBufferCode = 'ub'
  if (optimum?.[1] === '0.5x') preferredBuffer = 'ub05'
  if (optimum?.[1] === '2x') preferredBuffer = 'ub2'

  return { bufferActivity, preferredBuffer }
}

export function parseJenaIncubation(text: string) {
  const normalized = text.replace(/\s+/g, ' ')
  const match =
    normalized.match(/Incubate\s+(\d+)\s*(?:to\s*(\d+)\s*)?min\.?\s*at\s*(\d+)\s*°C/i) ??
    normalized.match(/Incubate\s+(\d+)\s*min\.?\s*at\s*(\d+)\s*°C/i)
  if (!match) return { incubationC: 37, incubationMinutes: null as number | null }

  if (match.length === 4) {
    const low = Number(match[1])
    const high = match[2] ? Number(match[2]) : low
    return { incubationC: Number(match[3]), incubationMinutes: Math.max(low, high) }
  }

  return { incubationC: Number(match[2]), incubationMinutes: Number(match[1]) }
}

export function parseJenaHeatInactivation(text: string) {
  const normalized = text.replace(/\s+/g, ' ')
  const match = normalized.match(/Heat Inactivation\s*\(\s*(\d+)\s*min\.?\s*at\s*(\d+)\s*°C\s*\)/i)
  if (!match) return null
  return `${match[2]}°C for ${match[1]} min`
}

export function parseJenaMethylation(text: string) {
  const normalized = text.replace(/\s+/g, ' ')
  const defaults = { dam: 'No Effect', dcm: 'No Effect', ecoKI: 'No Effect' }

  const noInhibition = normalized.match(/No Inhibition:\s*([^.]+)/i)?.[1] ?? ''
  if (/\bdam\b/i.test(noInhibition)) defaults.dam = 'No Effect'
  if (/\bdcm\b/i.test(noInhibition)) defaults.dcm = 'No Effect'
  if (/\bCpG\b/i.test(noInhibition)) defaults.ecoKI = 'No Effect'

  const blocked = [...normalized.matchAll(/Inhibition\s*\(([^)]+)\):\s*([^.]+)/gi)]
  for (const entry of blocked) {
    const label = entry[1]!.toLowerCase()
    const detail = entry[2]!.trim()
    if (label.includes('dam')) defaults.dam = detail
    if (label.includes('dcm')) defaults.dcm = detail
    if (label.includes('cpg')) defaults.ecoKI = detail
  }

  const damLine = normalized.match(/dam methylation:\s*([^.]+)/i)
  if (damLine) defaults.dam = damLine[1]!.trim()
  const dcmLine = normalized.match(/dcm methylation:\s*([^.]+)/i)
  if (dcmLine) defaults.dcm = dcmLine[1]!.trim()

  return defaults
}

export function catalogNameForJenaProduct(
  jenaName: string,
  isoschizomers: string[],
  catalogNames: ReadonlySet<string>,
) {
  const isos = isoschizomers.map((name) => name.trim()).filter(Boolean)
  if (catalogNames.has(jenaName)) return jenaName
  for (const candidate of [...isos].reverse()) {
    if (catalogNames.has(candidate)) return candidate
  }
  return null
}

type JenaProductPage = {
  jenaName: string
  catalogNumber: string
  productUrl: string
  isoschizomers: string[]
}

async function fetchText(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.text()
}

async function fetchPdfText(catalogNumber: string) {
  const url = `${PDF_BASE}/${catalogNumber}.pdf`
  const data = new Uint8Array(await fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${response.status} ${url}`)
    return response.arrayBuffer()
  }))
  const doc = await getDocument({ data }).promise
  let text = ''
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()
    text += `${content.items.map((item) => ('str' in item ? item.str : '')).join(' ')}\n`
  }
  return text
}

function parseProductSlugs(masterHtml: string) {
  const slugToLetter = new Map<string, string>()
  const slugPattern = /restriction-enzymes\/([a-z])-enzymes\/([^"'?#]+)/g
  for (const match of masterHtml.matchAll(slugPattern)) {
    slugToLetter.set(match[2]!, match[1]!)
  }
  return slugToLetter
}

function parseProductPage(html: string, slug: string, letter: string): JenaProductPage | null {
  const jenaName = html.match(/<h1>([^<]+)<\/h1>/)?.[1]?.trim()
  const catalogNumber = html.match(/\b(EN-[A-Z]?\d+)\b/)?.[1]
  if (!jenaName || !catalogNumber) return null

  const isoschizomers =
    html
      .match(/Isoschizomers:\s*([^<]+)/)?.[1]
      ?.split(',')
      .map((name) => name.trim())
      .filter(Boolean) ?? []

  return {
    jenaName,
    catalogNumber,
    isoschizomers,
    productUrl: `https://www.jenabioscience.com/molecular-biology/enzymes-protein-markers/restriction-enzymes/${letter}-enzymes/${slug}`,
  }
}

export function buildJenaChart(
  products: JenaProductPage[],
  pdfTextByCatalogNumber: Record<string, string>,
  catalogNames: ReadonlySet<string>,
) {
  const chart: Record<string, JenaChartProfile> = {}

  for (const product of products) {
    const catalogName = catalogNameForJenaProduct(product.jenaName, product.isoschizomers, catalogNames)
    if (!catalogName) continue
    if (chart[catalogName] && chart[catalogName]!.jenaName === catalogName) continue

    const pdfText = pdfTextByCatalogNumber[product.catalogNumber]
    if (!pdfText) continue

    const { bufferActivity, preferredBuffer } = parseJenaBufferActivity(pdfText)
    const { incubationC, incubationMinutes } = parseJenaIncubation(pdfText)
    const methylation = {
      ...parseJenaMethylation(pdfText),
      ...methylationOverrides[catalogName],
    }

    chart[catalogName] = {
      jenaName: product.jenaName,
      catalogName,
      alsoKnownAs: product.jenaName !== catalogName ? product.jenaName : null,
      catalogNumber: product.catalogNumber,
      preferredBuffer,
      suppliedBuffer: jenaBufferLabel('ub'),
      bufferActivity,
      heatInactivation: parseJenaHeatInactivation(pdfText),
      incubationC,
      incubationMinutes,
      productUrl: product.productUrl,
      methylation,
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

  const masterHtml = await fetchText(MASTER_URL)
  const slugToLetter = parseProductSlugs(masterHtml)
  const products: JenaProductPage[] = []

  for (const [slug, letter] of slugToLetter) {
    const pageUrl = `${MASTER_URL}/${letter}-enzymes/${slug}`
    try {
      const html = await fetchText(pageUrl)
      const product = parseProductPage(html, slug, letter)
      if (product) products.push(product)
    } catch (error) {
      console.warn(`Skipped ${slug}: ${error instanceof Error ? error.message : error}`)
    }
  }

  const pdfTextByCatalogNumber: Record<string, string> = {}
  const catalogNumbers = [...new Set(products.map((product) => product.catalogNumber))]
  for (const catalogNumber of catalogNumbers) {
    try {
      pdfTextByCatalogNumber[catalogNumber] = await fetchPdfText(catalogNumber)
    } catch (error) {
      console.warn(`Skipped PDF ${catalogNumber}: ${error instanceof Error ? error.message : error}`)
    }
  }

  const chart = buildJenaChart(products, pdfTextByCatalogNumber, catalogNames)
  const outputPath = join(root, 'jena-buffer-chart.json')
  writeFileSync(outputPath, `${JSON.stringify(chart, null, 2)}\n`)
  console.log(
    `Wrote ${Object.keys(chart).length} Jena Bioscience enzymes (${products.length} product pages, ${Object.keys(pdfTextByCatalogNumber).length} PDFs) to ${outputPath}`,
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

export { activityColumns }
