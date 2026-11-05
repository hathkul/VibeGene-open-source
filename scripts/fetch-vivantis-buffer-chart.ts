import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { VivantisBufferCode } from '../src/domain/types.ts'
import { parseVivantisRecognition } from '../src/domain/enzymeParser.ts'
import {
  finalizeVivantisProfile,
  preferredVivantisTableBuffer,
  vivantisEnzymeSpecificBufferLabel,
} from '../src/domain/vivantisBuffer.ts'
import {
  loadVivantisPosterChartFromFile,
  type VivantisPosterRow,
} from './vivantis-poster-parser.ts'
import { applyVivantisPosterCorrections } from './vivantis-poster-corrections.ts'

const CATEGORY_URL =
  'https://www.vivantechnologies.com/index.php?Itemid=117&id=84&option=com_content&view=category'
const SITE_ORIGIN = 'https://www.vivantechnologies.com'

export type VivantisChartProfile = {
  vivantisName: string
  catalogName: string
  alsoKnownAs: string | null
  catalogNumber: string | null
  recognitionRaw: string
  preferredBuffer: VivantisBufferCode
  suppliedBuffer: string | null
  enzymeSpecificBuffer: string | null
  catalogNotes: string[]
  bufferActivity: Partial<Record<VivantisBufferCode, string>>
  heatInactivation: string | null
  incubationC: number
  productUrl: string
  methylation: {
    dam: string
    dcm: string
    ecoKI: string
  }
}

const vivantisActivityCodes = ['v1', 'v2', 'v3', 'v4', 'v5', 'ub05', 'ub', 'ub15', 'ub2'] as const satisfies readonly VivantisBufferCode[]
const FETCH_TIMEOUT_MS = 30_000
const chartFilePath = () => join(dirname(fileURLToPath(import.meta.url)), 'vivantis-buffer-chart.json')

function vivantisActivityComplete(activity: Partial<Record<VivantisBufferCode, string>>) {
  return vivantisActivityCodes.every((code) => Boolean(activity[code]))
}

function missingVivantisActivityCodes(activity: Partial<Record<VivantisBufferCode, string>>) {
  return vivantisActivityCodes.filter((code) => !activity[code])
}

const methylationOverrides: Record<string, Partial<VivantisChartProfile['methylation']>> = {
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

export function vivantisAlsoKnownAs(title: string) {
  const match = title.trim().match(/\{([^}]+)\}/)
  if (!match) return null
  return match[1]!.replace(/\*/g, '').trim().replace(/\s+/g, '')
}

/** OCR / font confusions seen on Vivantis product pages (lowercase L vs capital I). */
const vivantisCatalogNameAliases: Record<string, string> = {
  Bbv12l: 'Bbv12I',
  FbII: 'FblI',
}

export function normalizeVivantisCatalogName(name: string) {
  // "Bbv12l" (lowercase L) is Bbv12I; digits never precede a literal L in enzyme names.
  const romanFixed = name.replace(/(\d)l\b/g, '$1I').replace(/(\d)l$/g, '$1I')
  return vivantisCatalogNameAliases[romanFixed] ?? romanFixed
}

export function vivantisTitleToCatalog(title: string) {
  const cleaned = title.trim().replace(/\s+/g, ' ')
  const braceIndex = cleaned.indexOf('{')
  const tradePart = (braceIndex >= 0 ? cleaned.slice(0, braceIndex) : cleaned).trim()
  const parts = tradePart.split(' ')
  const last = parts[parts.length - 1]
  let catalogName: string
  if (parts.length >= 2 && last && /^I{1,3}$/.test(last)) {
    catalogName = `${parts.slice(0, -1).join('')}${last}`
  } else {
    catalogName = tradePart.replace(/\s+/g, '')
  }
  return normalizeVivantisCatalogName(catalogName)
}

export function migrateVivantisChart(chart: Record<string, VivantisChartProfile & { alias?: string | null }>) {
  const migrated: Record<string, VivantisChartProfile> = {}

  for (const profile of Object.values(chart)) {
    const catalogName = vivantisTitleToCatalog(profile.vivantisName)
    const alsoKnownAs = vivantisAlsoKnownAs(profile.vivantisName) ?? profile.alsoKnownAs ?? profile.alias ?? null
    const enzymeSpecificBuffer =
      profile.enzymeSpecificBuffer ?? vivantisEnzymeSpecificBufferLabel(profile.suppliedBuffer)
    const next: VivantisChartProfile = finalizeVivantisProfile({
      ...profile,
      catalogName,
      alsoKnownAs,
      enzymeSpecificBuffer: enzymeSpecificBuffer ?? null,
      catalogNotes: profile.catalogNotes ?? [],
    })
    delete (next as { alias?: string | null }).alias

    if (migrated[catalogName]) {
      continue
    }
    migrated[catalogName] = next
  }

  return migrated
}

function stripPercent(value: string) {
  return value.replace(/%$/, '')
}

export type PdfTextItem = { str: string; x: number; y: number }

function groupPdfRows(items: PdfTextItem[]) {
  const rows = new Map<number, PdfTextItem[]>()
  for (const item of items) {
    const row = rows.get(item.y) ?? []
    row.push(item)
    rows.set(item.y, row)
  }
  return [...rows.entries()]
    .map(([y, rowItems]) => ({ y, items: rowItems.sort((left, right) => left.x - right.x) }))
    .sort((left, right) => right.y - left.y)
}

function percentTokens(row: PdfTextItem[]) {
  const tokens: PdfTextItem[] = []
  for (const item of row) {
    const matches = item.str.match(/\d{1,3}%/g)
    if (!matches) continue
    for (const str of matches) {
      tokens.push({ ...item, str })
    }
  }
  return tokens.sort((left, right) => left.x - right.x || left.y - right.y)
}

export function parseBufferActivityFromPdfItems(items: PdfTextItem[]) {
  const activity: Partial<Record<VivantisBufferCode, string>> = {}
  const activityTitle = items.find((item) => /Activity in Reaction Buffer/i.test(item.str))
  if (!activityTitle) return activity

  const rows = groupPdfRows(items)
  const ubTitle = items.find((item) => /^Buffer UB$/i.test(item.str))
  if (ubTitle) {
    const ubRow = rows
      .filter((row) => row.y < ubTitle.y && row.y >= ubTitle.y - 40)
      .map((row) => ({ row, percents: percentTokens(row.items) }))
      .filter((entry) => entry.percents.length >= 2)
      .toSorted((left, right) => right.percents.length - left.percents.length || right.row.y - left.row.y)[0]
    if (ubRow) {
      assignUbBuffers(activity, ubRow.percents.map((item) => stripPercent(item.str)).slice(0, 4))
    }
  }

  const ubRowY = ubTitle
    ? rows
        .filter((row) => row.y < ubTitle.y && row.y >= ubTitle.y - 40)
        .map((row) => ({ row, percents: percentTokens(row.items) }))
        .filter((entry) => entry.percents.length >= 2)
        .toSorted((left, right) => right.percents.length - left.percents.length || right.row.y - left.row.y)[0]
        ?.row.y
    : null

  const activityRow = rows
    .filter((row) => row.y < activityTitle.y && row.y >= activityTitle.y - 50)
    .filter((row) => (ubTitle ? row.y > ubTitle.y : true))
    .filter((row) => row.y !== ubRowY)
    .map((row) => ({ row, percents: percentTokens(row.items) }))
    .filter((entry) => entry.percents.length >= 3)
    .toSorted((left, right) => right.percents.length - left.percents.length || right.row.y - left.row.y)[0]

  if (activityRow) {
    const values = activityRow.percents.map((item) => stripPercent(item.str))
    const codes = ['v1', 'v2', 'v3', 'v4', 'v5'] as const
    values.forEach((value, index) => {
      if (codes[index]) activity[codes[index]] = value
    })
  }

  return activity
}

export async function extractPdfTextItems(data: Uint8Array): Promise<PdfTextItem[]> {
  const header = new TextDecoder().decode(data.slice(0, 5))
  if (!header.startsWith('%PDF')) return []
  const pdf = await getDocument({ data }).promise
  const items: PdfTextItem[] = []
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!('str' in item)) continue
      const str = item.str.trim()
      if (!str) continue
      items.push({
        str,
        x: Math.round(item.transform[4] ?? 0),
        y: Math.round(item.transform[5] ?? 0),
      })
    }
  }
  return items
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchPdfData(url: string) {
  let response: Response
  try {
    response = await fetchWithTimeout(url)
  } catch {
    return null
  }
  if (!response.ok) return null
  const data = new Uint8Array(await response.arrayBuffer())
  const header = new TextDecoder().decode(data.slice(0, 5))
  if (!header.startsWith('%PDF')) return null
  return data
}

async function parseBufferActivityFromPdf(data: Uint8Array) {
  const items = await extractPdfTextItems(data)
  const positioned = parseBufferActivityFromPdfItems(items)
  const flatText = items.map((item) => item.str).join(' ')
  if (Object.values(positioned).some(Boolean)) {
    return { bufferActivity: positioned, flatText }
  }
  return { bufferActivity: parseBufferActivityFromManualText(flatText), flatText }
}

function assignUbBuffers(
  activity: Partial<Record<VivantisBufferCode, string>>,
  values: string[],
) {
  const codes = ['ub05', 'ub', 'ub15', 'ub2'] as const
  codes.forEach((code, index) => {
    if (values[index]) activity[code] = values[index]!
  })
}

function assignVBuffers(
  activity: Partial<Record<VivantisBufferCode, string>>,
  match: RegExpMatchArray,
  codes: readonly ('v1' | 'v2' | 'v3' | 'v4' | 'v5')[] = ['v1', 'v2', 'v3', 'v4', 'v5'],
) {
  codes.forEach((code, index) => {
    activity[code] = stripPercent(match[index + 1]!)
  })
}

export function parseBufferActivityFromManualText(text: string) {
  const activity: Partial<Record<VivantisBufferCode, string>> = {}

  const vBufferPatterns = [
    /(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s*(\d{1,3}%)\s+Buffer UB/i,
    /(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s*(\d{1,3}%)\s+Activity in Reaction Buffer/i,
    /Activity in Reaction Buffer\s+(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s*(\d{1,3}%)/i,
  ]

  for (const pattern of vBufferPatterns) {
    const match = text.match(pattern)
    if (match) {
      assignVBuffers(activity, match)
      break
    }
  }

  if (!activity.v1) {
    const fourMatch = text.match(
      /(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s+Activity in Reaction Buffer/i,
    )
    if (fourMatch) {
      assignVBuffers(activity, fourMatch, ['v1', 'v2', 'v3', 'v4'])
    }
  }

  const ubBeforeActivity = text.match(
    /Buffer UB\s+0\.5X\s+1\.0X\s+1\.5X\s+2\.0X\s+(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s*(\d{1,3}%)\s+Activity in Reaction Buffer/i,
  )
  if (ubBeforeActivity) {
    assignUbBuffers(activity, ubBeforeActivity.slice(1, 5).map(stripPercent))
  }

  if (!activity.ub) {
    const ubAfterActivity = text.match(
      /Activity in Reaction Buffer\s+0\.5X\s+1\.0X\s+1\.5X\s+2\.0X\s+(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s*(\d{1,3}%)\s+Buffer UB/i,
    )
    if (ubAfterActivity) {
      assignUbBuffers(activity, ubAfterActivity.slice(1, 5).map(stripPercent))
    }
  }

  if (!activity.ub) {
    const ubAfterActivityAlt = text.match(
      /Activity in Reaction Buffer\s+\d{1,3}%\s+0\.5X\s+1\.0X\s+1\.5X\s+2\.0X\s+(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s*(\d{1,3}%)\s+Buffer UB/i,
    )
    if (ubAfterActivityAlt) {
      assignUbBuffers(activity, ubAfterActivityAlt.slice(1, 5).map(stripPercent))
    }
  }

  if (!activity.ub) {
    const ubTrailing = text.match(
      /0\.5X\s+1\.0X\s+1\.5X\s+2\.0X\s+(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s*(\d{1,3}%)\s+Buffer UB/i,
    )
    if (ubTrailing) {
      assignUbBuffers(activity, ubTrailing.slice(1, 5).map(stripPercent))
    }
  }

  if (!activity.ub) {
    const ubScrambled = text.match(
      /2\.0X\s+(\d{1,3}%)\s+0\.5X\s+1\.0X\s+1\.5X\s+(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s+Buffer UB/i,
    )
    if (ubScrambled) {
      assignUbBuffers(activity, [
        stripPercent(ubScrambled[2]!),
        stripPercent(ubScrambled[3]!),
        stripPercent(ubScrambled[4]!),
        stripPercent(ubScrambled[1]!),
      ])
    }
  }

  if (!activity.ub) {
    const ubPartial = text.match(
      /0\.5X\s+1\.0X\s+1\.5X\s+(\d{1,3}%)\s+(\d{1,3}%)\s+(\d{1,3}%)\s*(\d{1,3}%)?\s+Buffer UB/i,
    )
    if (ubPartial) {
      assignUbBuffers(
        activity,
        [ubPartial[1], ubPartial[2], ubPartial[3], ubPartial[4]].filter(Boolean).map((value) => stripPercent(value!)),
      )
    }
  }

  return activity
}

export function preferredBufferFromManualText(
  text: string,
  activity: Partial<Record<VivantisBufferCode, string>>,
  suppliedBuffer?: string | null,
): VivantisBufferCode {
  return preferredVivantisTableBuffer(text, activity, suppliedBuffer)
}

function absoluteUrl(path: string) {
  if (path.startsWith('http')) return path
  return `${SITE_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`
}

function normalizeArticleHref(href: string) {
  return href.replace(/&amp;/g, '&')
}

function extractArticleLinks(html: string) {
  const links = new Set<string>()
  const pattern = /href="([^"]*view=article[^"]*catid=84[^"]*)"/gi
  for (const match of html.matchAll(pattern)) {
    const href = normalizeArticleHref(match[1]!)
    if (href.includes('conventional-restriction-endonucleases') || href.includes('catid=84')) {
      links.add(absoluteUrl(href))
    }
  }
  return [...links]
}

function extractTitle(html: string) {
  const match = html.match(/<h2[^>]*class="contentheading"[^>]*>[\s\S]*?<a[^>]*>\s*([^<]+?)\s*<\/a>/i)
  if (match) return decodeHtml(match[1]!)
  const plain = html.match(/<h2[^>]*class="contentheading"[^>]*>\s*([^<]+?)\s*<\/h2>/i)
  return plain ? decodeHtml(plain[1]!) : null
}

function extractArticleContent(html: string) {
  const match = html.match(/<div class="article-content">([\s\S]*?)<\/div>/i)
  return match?.[1] ?? html
}

function extractRecognitionRaw(contentHtml: string) {
  const text = decodeHtml(contentHtml)
  const top = text.match(/5['’].*?↓.*?3['’]/i)
  const bottom = text.match(/3['’].*?↑.*?5['’]/i)
  if (!top || !bottom) return null
  return `${top[0]} ${bottom[0]}`
}

function extractIncubationC(contentHtml: string, manualText = '') {
  const text = `${decodeHtml(contentHtml)} ${manualText}`
  const match = text.match(/Incubate at\s*(\d+)\s*°?\s*C/i)
  return match ? Number(match[1]) : 37
}

function extractHeatInactivation(contentHtml: string, manualText = '') {
  const text = `${decodeHtml(contentHtml)} ${manualText}`
  const match = text.match(/Thermal Inactivation:?\s*([^*\n.]+(?:\.|$)?)/i)
  if (!match) return null
  const value = match[1]!.trim().replace(/\.$/, '')
  if (!value) return null
  if (/^no\.?$/i.test(value) || /^none\.?$/i.test(value)) return 'NO'
  return value
}

function extractSuppliedBuffer(contentHtml: string, manualText = '') {
  const text = `${decodeHtml(contentHtml)} ${manualText}`
  const match = text.match(/Supplied with\s*([^*]+?)(?:\*|Publication|Ordering|Store at|$)/i)
  return match?.[1]?.trim().replace(/\.$/, '') ?? null
}

function extractCatalogNumber(html: string, contentHtml = '', manualText = '') {
  for (const source of [contentHtml, html]) {
    const rows = [...source.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    for (const row of rows) {
      const cells = [...row[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => decodeHtml(cell[1]!))
      for (const cell of cells) {
        if (/^R[EV]\d+$/i.test(cell)) {
          return cell.toUpperCase()
        }
      }
    }
  }

  const textMatch = manualText.match(/Product No\s*:\s*(RE\d+|RV\d+)/i)
  if (textMatch) return textMatch[1]!.toUpperCase()

  const bodyText = decodeHtml(`${contentHtml} ${html}`)
  const inlineMatch = bodyText.match(/Product No\.?\s*:?\s*(RE\d+|RV\d+)/i) ?? bodyText.match(/\b(RE\d{3,}|RV\d{3,})\b/)
  return inlineMatch?.[1]?.toUpperCase() ?? null
}

function extractManualUrlFromHtml(html: string) {
  const restriction = html.match(/href="([^"]*\/Resources\/manual\/Restriction\/[^"]+\.pdf)"/i)
  if (restriction) return absoluteUrl(restriction[1]!)

  const manuals = [...html.matchAll(/href="([^"]*\/Resources\/manual\/[^"]+\.pdf)"/gi)]
    .map((match) => absoluteUrl(match[1]!))
    .filter((url) => !/msds|fastdigest/i.test(url))

  return manuals[0] ?? null
}

function vivantisNameToManualPrefixes(name: string) {
  const base = name.replace(/\{[^}]+\}/, '').replace(/\*/g, '').trim()
  const prefixes = new Set<string>([base])

  const roman = base.match(/^(.+?)(I{1,3}|IV|VI{0,3}|IX)$/i)
  if (roman?.[1] && roman[2]) {
    const stem = roman[1]!
    prefixes.add(`${stem} ${roman[2]}`)
    if (/[a-z][A-Z]/.test(stem)) {
      prefixes.add(`${stem.replace(/([a-z])([A-Z])/g, '$1 $2')} ${roman[2]}`)
    }
  }

  return [...prefixes]
}

function manualUrlCandidates(vivantisName: string, catalogNumber: string) {
  const prefixes = vivantisNameToManualPrefixes(vivantisName)
  const quantitySuffixes = ['', ' 150u', ' 500u', ' 100u', ' 1000u']
  const urls = new Set<string>()

  for (const prefix of prefixes) {
    urls.add(absoluteUrl(`/images/Resources/manual/Restriction/${prefix}-${catalogNumber}.pdf`))
    for (const suffix of quantitySuffixes) {
      urls.add(absoluteUrl(`/images/Resources/manual/Restriction/${prefix}-${catalogNumber}${suffix}.pdf`))
      urls.add(absoluteUrl(`/images/Resources/manual/Restriction/${prefix} (${catalogNumber}${suffix}).pdf`))
    }
  }

  return [...urls]
}

export async function resolveManualUrl(html: string, profile: VivantisChartProfile) {
  const candidates = new Set<string>()
  const linked = extractManualUrlFromHtml(html)
  if (linked) candidates.add(linked)

  const contentHtml = extractArticleContent(html)
  const catalogNumber = profile.catalogNumber ?? extractCatalogNumber(contentHtml, html)
  if (catalogNumber) {
    for (const url of manualUrlCandidates(profile.vivantisName, catalogNumber)) {
      candidates.add(url)
    }
  }

  let bestUrl: string | null = null
  let bestScore = 0
  for (const url of candidates) {
    const data = await fetchPdfData(url)
    if (!data) continue
    const { bufferActivity } = await parseBufferActivityFromPdf(data)
    const score = vivantisActivityCodes.filter((code) => bufferActivity[code]).length
    if (score > bestScore) {
      bestScore = score
      bestUrl = url
      if (bestScore >= vivantisActivityCodes.length) break
    }
  }

  return bestUrl
}

function extractMethylation(contentHtml: string, catalogName: string, manualText = ''): VivantisChartProfile['methylation'] {
  const text = `${decodeHtml(contentHtml)} ${manualText}`.toLowerCase()
  const methylation: VivantisChartProfile['methylation'] = {
    dam: 'No Effect',
    dcm: 'No Effect',
    ecoKI: 'No Effect',
    ...methylationOverrides[catalogName],
  }

  if (/dam methylation|overlapping gatc|blocked by dam/i.test(text)) {
    methylation.dam = 'Blocked by Dam methylation'
  }
  if (/requires dam methylation/i.test(text)) {
    methylation.dam = 'Requires Dam methylation'
  }
  if (/dcm methylation|blocked by dcm/i.test(text)) {
    methylation.dcm = 'Blocked by Dcm methylation'
  }
  if (/cpg methylation|5-methylcytosine|m⁵c|m5c/i.test(text)) {
    methylation.dcm = 'Sensitive to CpG methylation'
  }

  return methylation
}

function preferredBufferFromReaction(contentHtml: string) {
  const text = decodeHtml(contentHtml)
  if (/1X Buffer\s+UB\b/i.test(text)) return 'ub'
  const match = text.match(/1X Buffer\s+(V[1-5])\b/i)
  if (match) return match[1]!.toLowerCase() as VivantisBufferCode
  return 'v3'
}

function emptyVivantisActivity(): Partial<Record<VivantisBufferCode, string>> {
  return {}
}

export function mergeVivantisPosterProfile(
  profile: VivantisChartProfile,
  poster: VivantisPosterRow | undefined,
): VivantisChartProfile {
  if (!poster) return profile

  return finalizeVivantisProfile({
    ...profile,
    bufferActivity: { ...profile.bufferActivity, ...poster.bufferActivity },
    heatInactivation: poster.heatInactivation ?? profile.heatInactivation,
    incubationC: poster.incubationC ?? profile.incubationC,
    preferredBuffer: preferredBufferFromManualText(
      '',
      { ...profile.bufferActivity, ...poster.bufferActivity },
      profile.suppliedBuffer,
    ),
  })
}

export async function enrichVivantisProfileFromManual(
  profile: VivantisChartProfile,
  manualUrl: string | null,
): Promise<VivantisChartProfile> {
  if (!manualUrl) return profile

  const data = await fetchPdfData(manualUrl)
  if (!data) return profile

  const { bufferActivity, flatText: manualText } = await parseBufferActivityFromPdf(data)
  const hasActivity = Object.values(bufferActivity).some(Boolean)
  const suppliedBuffer = profile.suppliedBuffer ?? extractSuppliedBuffer('', manualText)

  return finalizeVivantisProfile(
    {
      ...profile,
      catalogNumber: profile.catalogNumber ?? extractCatalogNumber('', manualText),
      suppliedBuffer,
      enzymeSpecificBuffer: vivantisEnzymeSpecificBufferLabel(suppliedBuffer),
      catalogNotes: profile.catalogNotes ?? [],
      heatInactivation: profile.heatInactivation ?? extractHeatInactivation('', manualText),
      incubationC: extractIncubationC('', manualText) || profile.incubationC,
      bufferActivity: hasActivity ? { ...profile.bufferActivity, ...bufferActivity } : profile.bufferActivity,
      preferredBuffer: hasActivity
        ? preferredBufferFromManualText(manualText, bufferActivity, suppliedBuffer)
        : profile.preferredBuffer,
      methylation: extractMethylation('', profile.catalogName, manualText),
    },
    manualText,
  )
}

export function parseVivantisArticle(html: string, productUrl: string): VivantisChartProfile | null {
  const title = extractTitle(html)
  if (!title) return null

  const contentHtml = extractArticleContent(html)
  const recognitionRaw = extractRecognitionRaw(contentHtml)
  if (!recognitionRaw || !parseVivantisRecognition(recognitionRaw)) return null

  const catalogName = vivantisTitleToCatalog(title)
  const alsoKnownAs = vivantisAlsoKnownAs(title)
  const suppliedBuffer = extractSuppliedBuffer(contentHtml)
  const enzymeSpecificBuffer = vivantisEnzymeSpecificBufferLabel(suppliedBuffer)
  const preferredBuffer = enzymeSpecificBuffer ? 'specific' : preferredBufferFromReaction(contentHtml)

  return finalizeVivantisProfile({
    vivantisName: title.trim(),
    catalogName,
    alsoKnownAs,
    catalogNumber: extractCatalogNumber(html, contentHtml),
    recognitionRaw,
    preferredBuffer,
    suppliedBuffer,
    enzymeSpecificBuffer,
    catalogNotes: [],
    bufferActivity: emptyVivantisActivity(),
    heatInactivation: extractHeatInactivation(contentHtml),
    incubationC: extractIncubationC(contentHtml),
    productUrl,
    methylation: extractMethylation(contentHtml, catalogName),
  })
}

async function fetchText(url: string) {
  let response: Response
  try {
    response = await fetchWithTimeout(url)
  } catch {
    throw new Error(`Timed out fetching ${url}`)
  }
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return response.text()
}

function loadVivantisChartFile() {
  return migrateVivantisChart(
    JSON.parse(readFileSync(chartFilePath(), 'utf8')) as Record<
      string,
      VivantisChartProfile & { alias?: string | null }
    >,
  )
}

function writeVivantisChartFile(chart: Record<string, VivantisChartProfile>) {
  writeFileSync(chartFilePath(), `${JSON.stringify(chart, null, 2)}\n`)
}

function mergePosterIntoChart(
  chart: Record<string, VivantisChartProfile>,
  posterChart: Record<string, VivantisPosterRow>,
) {
  for (const [name, profile] of Object.entries(chart)) {
    chart[name] = mergeVivantisPosterProfile(profile, posterChart[name])
  }
  return chart
}

async function fillVivantisActivityGaps(
  chart: Record<string, VivantisChartProfile>,
  posterChart: Record<string, VivantisPosterRow>,
) {
  mergePosterIntoChart(chart, posterChart)

  const gaps = Object.values(chart).filter((profile) => !vivantisActivityComplete(profile.bufferActivity))
  console.log(`Filling buffer activity gaps for ${gaps.length} Vivantis enzymes`)

  for (const profile of gaps) {
    const missing = missingVivantisActivityCodes(profile.bufferActivity)
    try {
      const html = await fetchText(profile.productUrl)
      const manualUrl = await resolveManualUrl(html, profile)
      const enriched = await enrichVivantisProfileFromManual(profile, manualUrl)
      chart[profile.catalogName] = mergeVivantisPosterProfile(enriched, posterChart[profile.catalogName])
      const stillMissing = missingVivantisActivityCodes(chart[profile.catalogName]!.bufferActivity)
      if (stillMissing.length) {
        console.warn(`${profile.catalogName}: still missing ${stillMissing.join(', ')} (was missing ${missing.join(', ')})`)
      }
    } catch (error) {
      console.warn(`${profile.catalogName}: gap fill failed — ${error instanceof Error ? error.message : error}`)
    }
  }

  return chart
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

async function collectArticleUrls() {
  const urls = new Set<string>()
  let limitStart = 0

  while (true) {
    const pageUrl = limitStart === 0 ? CATEGORY_URL : `${CATEGORY_URL}&limitstart=${limitStart}`
    const html = await fetchText(pageUrl)
    const links = extractArticleLinks(html)
    if (links.length === 0) break
    links.forEach((link) => urls.add(link))

    const pageMatch = html.match(/Page\s+(\d+)\s+of\s+(\d+)/i)
    const currentPage = pageMatch ? Number(pageMatch[1]) : 1
    const totalPages = pageMatch ? Number(pageMatch[2]) : 1
    if (currentPage >= totalPages) break
    limitStart += 10
  }

  return [...urls]
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const posterChart = applyVivantisPosterCorrections(loadVivantisPosterChartFromFile())
  if (Object.keys(posterChart).length === 0) {
    console.warn('vivantis-poster-chart.json is empty; run scripts/vivantis-poster-parser.ts first')
  }

  if (args.has('--merge-poster')) {
    const chart = mergePosterIntoChart(loadVivantisChartFile(), posterChart)
    writeVivantisChartFile(chart)
    const complete = Object.values(chart).filter((profile) => vivantisActivityComplete(profile.bufferActivity)).length
    console.log(
      `Merged poster chart into ${Object.keys(chart).length} enzymes (${complete} with full V1–V5 + UB activity)`,
    )
    return
  }

  if (args.has('--fill-gaps')) {
    const chart = await fillVivantisActivityGaps(loadVivantisChartFile(), posterChart)
    writeVivantisChartFile(chart)
    const complete = Object.values(chart).filter((profile) => vivantisActivityComplete(profile.bufferActivity)).length
    console.log(`Wrote ${Object.keys(chart).length} Vivantis enzymes (${complete} with full V1–V5 + UB activity)`)
    return
  }

  const articleUrls = await collectArticleUrls()
  console.log(`Found ${articleUrls.length} Vivantis enzyme pages`)

  const profiles = await mapWithConcurrency(articleUrls, 6, async (url) => {
    const html = await fetchText(url)
    const profile = parseVivantisArticle(html, url)
    if (!profile) return null
    const manualUrl = await resolveManualUrl(html, profile)
    const enriched = await enrichVivantisProfileFromManual(profile, manualUrl)
    return mergeVivantisPosterProfile(enriched, posterChart[enriched.catalogName])
  })

  const chart: Record<string, VivantisChartProfile> = {}
  const skipped: string[] = []
  let withActivity = 0

  for (const profile of profiles) {
    if (!profile) continue
    if (chart[profile.catalogName]) {
      skipped.push(`${profile.vivantisName} (duplicate catalog name ${profile.catalogName})`)
      continue
    }
    if (vivantisActivityCodes.some((code) => profile.bufferActivity[code])) {
      withActivity += 1
    }
    chart[profile.catalogName] = profile
  }

  const outputPath = chartFilePath()
  writeVivantisChartFile(chart)
  const complete = Object.values(chart).filter((profile) => vivantisActivityComplete(profile.bufferActivity)).length
  console.log(
    `Wrote ${Object.keys(chart).length} Vivantis enzymes (${complete} with full V1–V5 + UB activity, ${withActivity} with any activity) to ${outputPath}`,
  )
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} duplicates/unparseable entries`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
