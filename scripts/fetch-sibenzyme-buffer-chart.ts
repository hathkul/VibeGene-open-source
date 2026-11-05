import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SibBufferCode } from '../src/domain/types.ts'

const ACTIVITY_URL = 'https://sibenzyme.com/en/aktivity/'

export type SibChartProfile = {
  sibName: string
  catalogName: string
  recognitionRaw: string
  preferredRaw: string
  preferredBuffer: SibBufferCode
  suppliedBuffer: string
  bsa: string | null
  bufferActivity: Record<SibBufferCode, string>
  heatInactivation: string | null
  incubationC: number
  methylation: {
    dam: string
    dcm: string
    ecoKI: string
  }
}

const methylationOverrides: Record<string, Partial<SibChartProfile['methylation']>> = {
  DpnI: { dam: 'Requires Dam methylation' },
  DpnII: { dam: 'Blocked by Dam methylation' },
  EcoRII: { dam: 'Blocked by Dam methylation' },
  Kzo9I: { dam: 'Blocked by Dam methylation' },
  MboI: { dam: 'Blocked by Dam methylation' },
  Sau3AI: { dam: 'Blocked by Dam methylation' },
  HpaII: { dcm: 'Blocked by Dcm methylation' },
  MspI: { dcm: 'Cleaves methylated and unmethylated CCGG' },
}

function decodeHtml(text: string) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

export function sibNameToCatalog(name: string) {
  const cleaned = name.replace(/\s+Temporarily unavailable$/i, '').trim()
  const parts = cleaned.split(/\s+/)
  const last = parts[parts.length - 1]
  if (parts.length >= 2 && last && /^I{1,3}$/.test(last)) {
    return `${parts.slice(0, -1).join('')}${last}`
  }
  return cleaned.replace(/\s+/g, '')
}

export function sibProductSlug(sibName: string) {
  return sibName.trim().toLowerCase().replace(/\s+/g, '-')
}

export function sibProductUrl(sibName: string) {
  return `https://sibenzyme.com/en/product/${sibProductSlug(sibName)}/`
}

const sibBufferHeaderToCode: Record<string, SibBufferCode> = {
  b: 'b',
  g: 'g',
  o: 'o',
  w: 'w',
  y: 'y',
  rose: 'rose',
}

function parseSibBufferTableRows(rows: string[][]): Record<SibBufferCode, string> | null {
  if (rows.length < 2) return null

  const headers = rows[0]!.map((cell) => cell.trim().toLowerCase())
  const values = rows[1]!.map((cell) => cell.trim())
  const activity = {} as Record<SibBufferCode, string>
  headers.forEach((header, index) => {
    const code = sibBufferHeaderToCode[header]
    const value = values[index]
    if (code && value) activity[code] = value
  })
  return Object.keys(activity).length === 6 ? activity : null
}

function tableRowsFromHtml(tableHtml: string) {
  return [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => decodeHtml(cell[1]!)),
  )
}

export function parseSibProductBufferTable(html: string): Record<SibBufferCode, string> | null {
  const classMatch = html.match(/<table[^>]*buffer-activity-table[^>]*>[\s\S]*?<\/table>/i)
  if (classMatch) {
    const parsed = parseSibBufferTableRows(tableRowsFromHtml(classMatch[0]))
    if (parsed) return parsed
  }

  const activitySection = html.match(/Enzyme activity\s*\(%\)[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i)
  if (activitySection) {
    const parsed = parseSibBufferTableRows(tableRowsFromHtml(`<table>${activitySection[1]}</table>`))
    if (parsed) return parsed
  }

  for (const table of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const parsed = parseSibBufferTableRows(tableRowsFromHtml(table[0]))
    if (parsed) return parsed
  }

  return null
}

function activityScore(value: string) {
  const normalized = value.replace(/\([^)]*\)/g, '').replace(/–/g, '-').trim()
  if (!normalized || normalized === '-') return -1
  const range = normalized.match(/^(\d+)\s*-\s*(\d+)$/)
  if (range) return (Number(range[1]) + Number(range[2])) / 2
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 50
}

function preferredBufferFor(preferredRaw: string, activities: Record<SibBufferCode, string>): SibBufferCode {
  const token = preferredRaw.split('+')[0]?.trim().split(/\s+/)[0] ?? ''
  const mapped: Record<string, SibBufferCode> = {
    B: 'b',
    G: 'g',
    O: 'o',
    W: 'w',
    Y: 'y',
    Rose: 'rose',
  }
  if (mapped[token]) return mapped[token]!

  const best = (Object.entries(activities) as [SibBufferCode, string][])
    .map(([code, value]) => ({ code, score: activityScore(value) }))
    .filter((entry) => entry.score >= 0)
    .toSorted((left, right) => right.score - left.score)[0]
  return best?.code ?? 'y'
}

function suppliedBufferLabel(preferredRaw: string, preferred: SibBufferCode) {
  const color =
    preferred === 'b'
      ? 'blue'
      : preferred === 'g'
        ? 'green'
        : preferred === 'o'
          ? 'orange'
          : preferred === 'w'
            ? 'white'
            : preferred === 'y'
              ? 'yellow'
              : 'universal'
  if (/^unique/i.test(preferredRaw) || preferredRaw.includes('*') || preferredRaw.includes('+')) {
    return preferredRaw
  }
  if (['B', 'G', 'O', 'W', 'Y', 'Rose'].includes(preferredRaw)) {
    return `SE Buffer ${preferredRaw} (${color})`
  }
  return preferredRaw
}

function formatInactivation(value: string) {
  if (!value || value === 'N' || value === '–' || value === '-') return null
  if (value.includes('°')) return value
  return `${value}°C`
}

function parseActivityPage(html: string) {
  const rows = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)]
  const profiles = new Map<string, SibChartProfile>()

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis)].map((cell) => decodeHtml(cell[1]!))
    if (cells.length !== 12 || cells[0] === 'Enzyme' || cells[0] === 'B') continue

    const sibName = cells[0]!
    const catalogName = sibNameToCatalog(sibName)
    const activities: Record<SibBufferCode, string> = {
      b: cells[4] ?? '',
      g: cells[5] ?? '',
      o: cells[6] ?? '',
      w: cells[7] ?? '',
      y: cells[8] ?? '',
      rose: cells[9] ?? '',
    }
    const preferredRaw = cells[2] ?? 'Y'
    const preferredBuffer = preferredBufferFor(preferredRaw, activities)
    const profile: SibChartProfile = {
      sibName,
      catalogName,
      recognitionRaw: cells[1] ?? '',
      preferredRaw,
      preferredBuffer,
      suppliedBuffer: suppliedBufferLabel(preferredRaw, preferredBuffer),
      bsa: cells[3] === '–' || cells[3] === '-' ? null : (cells[3] ?? null),
      bufferActivity: activities,
      heatInactivation: formatInactivation(cells[11] ?? ''),
      incubationC: Number((cells[10] ?? '37').replace(/[^\d]/g, '')) || 37,
      methylation: {
        dam: 'No Effect',
        dcm: 'No Effect',
        ecoKI: 'No Effect',
        ...methylationOverrides[catalogName],
      },
    }

    profiles.set(catalogName, profile)
  }

  return profiles
}

async function fetchText(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return response.text()
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let index = 0

  async function runWorker() {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await worker(items[current]!)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()))
  return results
}

async function enrichProfileFromProductPage(profile: SibChartProfile): Promise<SibChartProfile> {
  try {
    const html = await fetchText(sibProductUrl(profile.sibName))
    const productActivity = parseSibProductBufferTable(html)
    if (!productActivity) return profile
    const preferredBuffer = preferredBufferFor(profile.preferredRaw, productActivity)
    return {
      ...profile,
      bufferActivity: productActivity,
      preferredBuffer,
      suppliedBuffer: suppliedBufferLabel(profile.preferredRaw, preferredBuffer),
    }
  } catch {
    return profile
  }
}

async function main() {
  const html = await fetchText(ACTIVITY_URL)
  const profiles = parseActivityPage(html)
  const enriched = await mapWithConcurrency([...profiles.values()], 8, enrichProfileFromProductPage)
  const chart = Object.fromEntries(enriched.map((profile) => [profile.catalogName, profile]))

  const root = dirname(fileURLToPath(import.meta.url))
  const outputPath = join(root, 'sibenzyme-buffer-chart.json')
  writeFileSync(outputPath, `${JSON.stringify(chart, null, 2)}\n`)
  console.log(`Wrote ${Object.keys(chart).length} SibEnzyme enzymes to ${outputPath}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
