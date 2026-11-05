import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PromegaBufferCode } from '../src/domain/types.ts'
import { promegaAlsoKnownAsOverrides } from './promega-recognition-chart.ts'

const PDF_URL =
  'https://www.promega.com/-/media/files/resources/technical-references/restriction-enzyme-activity-in-promega-buffers.pdf'

const activityColumns = ['a', 'b', 'c', 'd', 'e', 'h', 'multicore'] as const satisfies readonly PromegaBufferCode[]
const suppliedLetters = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'k', 'l'])

const skipEnzymes = new Set(['I-PpoI'])

const methylationOverrides: Record<string, Partial<PromegaChartProfile['methylation']>> = {
  DpnI: { dam: 'Requires Dam methylation' },
  EcoRII: { dam: 'Blocked by Dam methylation' },
  MboI: { dam: 'Blocked by Dam methylation' },
  Sau3AI: { dam: 'Blocked by Dam methylation' },
  HpaII: { dcm: 'Blocked by Dcm methylation' },
  MspI: { dcm: 'Cleaves methylated and unmethylated CCGG' },
}

export type PromegaChartProfile = {
  promegaName: string
  catalogName: string
  alsoKnownAs: string | null
  preferredBuffer: PromegaBufferCode
  suppliedBuffer: string
  bufferActivity: Partial<Record<PromegaBufferCode, string>>
  heatInactivation: string | null
  incubationC: number
  productUrl: string
  methylation: {
    dam: string
    dcm: string
    ecoKI: string
  }
}

export function promegaBufferLabel(buffer: PromegaBufferCode) {
  if (buffer === 'multicore') return '10× MULTI-CORE™ Buffer'
  return `10× Buffer ${buffer.toUpperCase()}`
}

export function normalizePromegaActivityValue(raw: string) {
  const trimmed = raw.replace(/\u2013/g, '-').replace(/\s+/g, '').trim()
  if (!trimmed || trimmed === 'n.d.') return ''
  const star = trimmed.includes('*') ? '*' : ''
  const value = trimmed.replace(/\*+/g, '').replace(/%+/g, '')
  if (value.startsWith('<')) return `${value}${star}`
  if (value.startsWith('>')) return `${value}${star || '*'}`
  return `${value}${star}`
}

export function heatInactivationFromPromegaSymbol(symbol: string) {
  const normalized = symbol.replace(/\s+/g, '').replace(/\u2013/g, '–')
  if (normalized === '+') return '65°C for 15 min'
  if (normalized === '–' || normalized === '-') return null
  if (normalized === '+/–' || normalized === '+/-') return '65°C for 15 min (partial inactivation)'
  return null
}

export function suppliedBufferCode(raw: string): PromegaBufferCode | null {
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'multicore' || normalized === 'multi-core') return 'multicore'
  if (suppliedLetters.has(normalized)) return normalized as PromegaBufferCode
  return null
}

export function parsePromegaBufferText(text: string) {
  const normalized = text.replace(/\u2013/g, '-').replace(/\s+/g, ' ')
  const rows: Array<{
    catalogName: string
    preferredBuffer: PromegaBufferCode
    bufferActivity: Partial<Record<PromegaBufferCode, string>>
    heatInactivation: string | null
    incubationC: number
  }> = []

  const enzymePattern = /(?:^|\s)([A-Z][A-Za-z0-9-]+I)\s+([A-GHJ-KL])\s+/g
  const starts = [...normalized.matchAll(enzymePattern)]

  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index]!
    const catalogName = match[1]!
    if (skipEnzymes.has(catalogName)) continue

    const segmentStart = match.index! + (match[0].startsWith(' ') ? 1 : 0)
    const segmentEnd = starts[index + 1]?.index ?? normalized.length
    const tokens = normalized.slice(segmentStart, segmentEnd).trim().split(/\s+/)
    if (tokens.length < 11) continue

    const preferredBuffer = suppliedBufferCode(tokens[1]!)
    if (!preferredBuffer || preferredBuffer === 'multicore') continue

    const bufferActivity: Partial<Record<PromegaBufferCode, string>> = {}
    activityColumns.forEach((code, activityIndex) => {
      const value = normalizePromegaActivityValue(tokens[activityIndex + 2]!)
      if (value) bufferActivity[code] = value
    })

    const heatToken = tokens[9]!
    const tempToken = tokens[10]!
    const tempMatch = tempToken.match(/^(\d+)°C$/)
    if (!tempMatch) continue

    rows.push({
      catalogName,
      preferredBuffer,
      bufferActivity,
      heatInactivation: heatInactivationFromPromegaSymbol(heatToken),
      incubationC: Number(tempMatch[1]),
    })
  }

  return rows
}

function promegaProductUrl(catalogName: string) {
  return `https://www.promega.com/search/?q=${encodeURIComponent(catalogName)}&pagesize=25`
}

export function buildPromegaChart(text: string) {
  const chart: Record<string, PromegaChartProfile> = {}

  for (const row of parsePromegaBufferText(text)) {
    if (chart[row.catalogName]) continue
    const alsoKnownAs = promegaAlsoKnownAsOverrides[row.catalogName] ?? null
    chart[row.catalogName] = {
      promegaName: row.catalogName,
      catalogName: row.catalogName,
      alsoKnownAs,
      preferredBuffer: row.preferredBuffer,
      suppliedBuffer: promegaBufferLabel(row.preferredBuffer),
      bufferActivity: row.bufferActivity,
      heatInactivation: row.heatInactivation,
      incubationC: row.incubationC,
      productUrl: promegaProductUrl(row.catalogName),
      methylation: {
        dam: 'No Effect',
        dcm: 'No Effect',
        ecoKI: 'No Effect',
        ...methylationOverrides[row.catalogName],
      },
    }
  }

  return chart
}

async function extractPdfText(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/pdf,*/*',
    },
  })
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  const data = new Uint8Array(await response.arrayBuffer())
  if (!new TextDecoder().decode(data.slice(0, 5)).startsWith('%PDF')) {
    throw new Error(`Expected PDF from ${url}`)
  }
  const pdf = await getDocument({ data }).promise
  let text = ''
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex)
    const content = await page.getTextContent()
    text += `${content.items.map((item) => ('str' in item ? item.str : '')).join(' ')}\n`
  }
  return text
}

async function main() {
  const rootDir = dirname(fileURLToPath(import.meta.url))
  let text: string
  try {
    text = await extractPdfText(PDF_URL)
    writeFileSync(join(rootDir, 'promega-pdf-text.txt'), `${text}\n`)
  } catch (error) {
    const cachedPath = join(rootDir, 'promega-pdf-text.txt')
    console.warn(`Failed to fetch PDF (${error}); using cached text at ${cachedPath}`)
    text = readFileSync(cachedPath, 'utf8')
  }

  const chart = buildPromegaChart(text)
  const withActivity = Object.values(chart).filter((profile) =>
    activityColumns.some((code) => profile.bufferActivity[code]),
  ).length

  const outputPath = join(rootDir, 'promega-buffer-chart.json')
  writeFileSync(outputPath, `${JSON.stringify(chart, null, 2)}\n`)
  console.log(`Wrote ${Object.keys(chart).length} Promega enzymes (${withActivity} with buffer activity) to ${outputPath}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
