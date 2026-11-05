import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TakaraBufferCode } from '../src/domain/types.ts'
import type { RocheChartProfile } from './fetch-roche-buffer-chart.ts'
import type { VivantisChartProfile } from './fetch-vivantis-buffer-chart.ts'
import { migrateVivantisChart } from './fetch-vivantis-buffer-chart.ts'
import { takaraAlsoKnownAsOverrides } from './takara-recognition-chart.ts'

const BUFFER_CHART_URL =
  'https://www.takarabio.com/us/products/molecular_biology_tools/restriction_enzymes/buffer_activity_chart'
const INACTIVATION_URL =
  'https://www.takarabio.com/learning-centers/cloning/traditional-molecular-cloning/restriction-enzyme-overview/inactivation-of-restriction-enzymes'

const SUPPLIED_BG = '#B4F7FA'
const takaraBufferCodes: TakaraBufferCode[] = ['l', 'm', 'h', 'k', 't', 'basal']

const basalSuppliedEnzymes = new Set([
  'AccIII',
  'BalI',
  'BcnI',
  'BglI',
  'Bpu1102I',
  'Cfr10I',
  'Eco52I',
  'NruI',
  'PshBI',
  'SnaBI',
  'SspI',
  'TaqI',
  'VpaK11BI',
])

const incubationOverrides: Record<string, number> = {
  TaqI: 65,
}

const methylationOverrides: Record<string, Partial<TakaraChartProfile['methylation']>> = {
  DpnI: { dam: 'Requires Dam methylation' },
  EcoRII: { dam: 'Blocked by Dam methylation' },
  MboI: { dam: 'Blocked by Dam methylation' },
  Sau3AI: { dam: 'Blocked by Dam methylation' },
  HpaII: { dcm: 'Blocked by Dcm methylation' },
  MspI: { dcm: 'Cleaves methylated and unmethylated CCGG' },
}

export type TakaraChartProfile = {
  takaraName: string
  catalogName: string
  alsoKnownAs: string | null
  preferredBuffer: TakaraBufferCode
  suppliedBuffer: string
  bufferActivity: Partial<Record<TakaraBufferCode, string>>
  heatInactivation: string | null
  incubationC: number
  productUrl: string
  methylation: {
    dam: string
    dcm: string
    ecoKI: string
  }
}

function decodeHtml(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&ndash;/g, '–')
    .replace(/&deg;/g, '°')
    .replace(/\s+/g, ' ')
    .trim()
}

export function takaraNameToCatalog(name: string) {
  const cleaned = decodeHtml(name)
    .replace(/\*/g, '')
    .replace(/\s*\([^)]+\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return cleaned

  if (/^Asp\s+718$/i.test(cleaned)) return 'Asp718I'
  if (/^Asp\s+700$/i.test(cleaned)) return 'Asp700I'

  const parts = cleaned.split(' ')
  const last = parts[parts.length - 1]
  if (parts.length >= 2 && last && /^I{1,3}$/.test(last)) {
    return `${parts.slice(0, -1).join('')}${last}`
  }

  if (parts.length >= 2 && last && /^[A-Z]{2,}$/.test(last) && !/^I{1,3}$/.test(last)) {
    return `${parts.slice(0, -1).join('')}${last}`
  }

  const compact = cleaned.replace(/\s+/g, '')
  return compact.endsWith('I') ? compact : `${compact}I`
}

export function takaraAlsoKnownAsFromTitle(title: string) {
  const match = title.trim().match(/\(([^)]+)\)\s*$/)
  if (!match) return null
  return takaraNameToCatalog(match[1]!)
}

export function takaraBufferLabel(buffer: TakaraBufferCode) {
  if (buffer === 'basal') return 'Basal buffer (enzyme-specific)'
  if (buffer === 't') return '10× Universal Buffer T + BSA'
  return `10× Universal Buffer ${buffer.toUpperCase()}`
}

export function normalizeTakaraActivityValue(raw: string) {
  const trimmed = raw.replace(/\s+/g, '').trim()
  if (!trimmed) return ''
  const starSuffix = trimmed.includes('*') ? '*' : ''
  const value = trimmed.replace(/\*/g, '')
  const parenthetical = value.match(/^\((.+)\)$/)
  if (parenthetical) return `${parenthetical[1]}${starSuffix || '*'}`
  return `${value}${starSuffix}`
}

export function preferredBufferFromRow(
  cells: string[],
  bgcolors: Array<string | null>,
): TakaraBufferCode | null {
  for (let index = 0; index < takaraBufferCodes.length; index += 1) {
    const bgcolor = bgcolors[index]?.toUpperCase()
    if (bgcolor === SUPPLIED_BG) return takaraBufferCodes[index]!
  }
  return null
}

export function parseBufferChartRow(cells: string[], bgcolors: Array<string | null>) {
  const rawName = decodeHtml(cells[0]!)
  const catalogName = takaraNameToCatalog(rawName)
  const alsoKnownAs = takaraAlsoKnownAsFromTitle(rawName)
  const bufferActivity: Partial<Record<TakaraBufferCode, string>> = {}
  const preferredBuffer =
    preferredBufferFromRow(cells.slice(1), bgcolors.slice(1)) ??
    (basalSuppliedEnzymes.has(catalogName) ? 'basal' : 'h')

  takaraBufferCodes.forEach((code, index) => {
    const value = normalizeTakaraActivityValue(decodeHtml(cells[index + 1]!))
    if (value) bufferActivity[code] = value
  })

  return {
    catalogName,
    alsoKnownAs,
    preferredBuffer,
    bufferActivity,
  }
}

export function parseBufferChartHtml(html: string) {
  const rows: ReturnType<typeof parseBufferChartRow>[] = []
  for (const match of html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1]!.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)]
    if (cells.length !== 7) continue
    const values = cells.map((cell) => cell[2]!)
    const bgcolors = cells.map((cell) => {
      const bgcolor = cell[1]!.match(/bgcolor="([^"]+)"/i)
      return bgcolor?.[1] ?? null
    })
    const name = decodeHtml(values[0]!)
    if (!name || name === 'Restriction enzyme') continue
    rows.push(parseBufferChartRow(values, bgcolors))
  }
  return rows
}

export function heatInactivationFromInactivationRow(at60: string, at70: string) {
  const normalized60 = at60.replace(/\u2013/g, '–').trim()
  const normalized70 = at70.replace(/\u2013/g, '–').trim()
  if (normalized70 === '–') return '70°C for 15 min'
  if (normalized60 === '–') return '60°C for 15 min'
  return null
}

export function parseInactivationHtml(html: string) {
  const inactivation = new Map<string, string | null>()
  for (const match of html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      decodeHtml(cell[1]!),
    )
    if (cells.length !== 5) continue
    const catalogName = takaraNameToCatalog(cells[0]!)
    if (!catalogName || catalogName === 'RestrictionEnzyme') continue
    inactivation.set(catalogName, heatInactivationFromInactivationRow(cells[1]!, cells[2]!))
  }
  return inactivation
}

function takaraProductUrl(catalogName: string, alsoKnownAs: string | null) {
  const slugBase = catalogName.toLowerCase()
  if (alsoKnownAs) {
    return `https://www.takarabio.com/products/cloning/restriction-enzymes/${slugBase}-(${alsoKnownAs.toLowerCase()})`
  }
  return `https://www.takarabio.com/us/search?q=${encodeURIComponent(catalogName)}`
}

function buildAlsoKnownAsLookup(rootDir: string) {
  const lookup = new Map<string, string>()

  try {
    const rocheChart = JSON.parse(
      readFileSync(join(rootDir, 'roche-buffer-chart.json'), 'utf8'),
    ) as Record<string, RocheChartProfile>
    for (const profile of Object.values(rocheChart)) {
      if (profile.alsoKnownAs) lookup.set(profile.catalogName, profile.alsoKnownAs)
    }
  } catch {
    // optional during first fetch
  }

  try {
    const vivantisChartRaw = JSON.parse(
      readFileSync(join(rootDir, 'vivantis-buffer-chart.json'), 'utf8'),
    ) as Record<string, VivantisChartProfile & { alias?: string | null }>
    const vivantisChart = migrateVivantisChart(vivantisChartRaw)
    for (const profile of Object.values(vivantisChart)) {
      if (profile.alsoKnownAs && !lookup.has(profile.catalogName)) {
        lookup.set(profile.catalogName, profile.alsoKnownAs)
      }
    }
  } catch {
    // optional during first fetch
  }

  for (const [catalogName, alsoKnownAs] of Object.entries(takaraAlsoKnownAsOverrides)) {
    if (!lookup.has(catalogName)) lookup.set(catalogName, alsoKnownAs)
  }

  return lookup
}

export function buildTakaraChart(
  bufferHtml: string,
  inactivationHtml: string,
  alsoKnownAsLookup: Map<string, string>,
) {
  const inactivation = parseInactivationHtml(inactivationHtml)
  const chart: Record<string, TakaraChartProfile> = {}

  for (const row of parseBufferChartHtml(bufferHtml)) {
    if (chart[row.catalogName]) continue
    const alsoKnownAs = row.alsoKnownAs ?? alsoKnownAsLookup.get(row.catalogName) ?? null
    const preferredBuffer = row.preferredBuffer
    chart[row.catalogName] = {
      takaraName: row.catalogName,
      catalogName: row.catalogName,
      alsoKnownAs,
      preferredBuffer,
      suppliedBuffer: takaraBufferLabel(preferredBuffer),
      bufferActivity: row.bufferActivity,
      heatInactivation: inactivation.get(row.catalogName) ?? null,
      incubationC: incubationOverrides[row.catalogName] ?? 37,
      productUrl: takaraProductUrl(row.catalogName, alsoKnownAs),
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

async function fetchText(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return response.text()
}

async function main() {
  const rootDir = dirname(fileURLToPath(import.meta.url))
  const [bufferHtml, inactivationHtml] = await Promise.all([
    fetchText(BUFFER_CHART_URL),
    fetchText(INACTIVATION_URL),
  ])
  const alsoKnownAsLookup = buildAlsoKnownAsLookup(rootDir)
  const chart = buildTakaraChart(bufferHtml, inactivationHtml, alsoKnownAsLookup)
  const withActivity = Object.values(chart).filter((profile) =>
    takaraBufferCodes.some((code) => profile.bufferActivity[code]),
  ).length

  const outputPath = join(rootDir, 'takara-buffer-chart.json')
  writeFileSync(outputPath, `${JSON.stringify(chart, null, 2)}\n`)
  console.log(`Wrote ${Object.keys(chart).length} TaKaRa enzymes (${withActivity} with buffer activity) to ${outputPath}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
