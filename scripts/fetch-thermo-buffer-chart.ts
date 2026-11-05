import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ThermoBufferCode } from '../src/domain/types.ts'

const REACTION_CONDITIONS_URL =
  'https://www.thermofisher.com/us/en/home/brands/thermo-scientific/molecular-biology/thermo-scientific-restriction-modifying-enzymes/restriction-enzymes-thermo-scientific/conventional-restriction-enzymes-thermo-scientific/reaction-conditions-for-restriction-enzymes.html'

const SELECTION_TOOL_URL =
  'https://www.thermofisher.com/us/en/home/brands/thermo-scientific/molecular-biology/thermo-scientific-restriction-modifying-enzymes/restriction-enzymes-thermo-scientific/conventional-restriction-enzymes-thermo-scientific.html'

export type ThermoChartProfile = {
  thermoName: string
  alias: string | null
  recognitionRaw: string | null
  preferredBuffer: ThermoBufferCode
  suppliedBuffer: string
  bufferActivity: Record<ThermoBufferCode, string>
  tango2x: string | null
  doubleDigest: string | null
  heatInactivation: string | null
  incubationC: number
  methylation: {
    dam: string
    dcm: string
    ecoKI: string
  }
}

export const catalogToThermoKey: Record<string, string> = {
  'AgeI-HF': 'AgeI',
  'ApoI-HF': 'ApoI',
  'BamHI-HF': 'BamHI',
  'BbsI-HF': 'BpiI',
  'BsaI': 'Eco31I',
  'BsaI-HFv2': 'Eco31I',
  'BsmBI': 'Esp3I',
  'BsmBI-v2': 'Esp3I',
  'BsiWI-HF': 'BsiWI',
  'BspQI-HF': 'BspQI',
  'BsrGI-HF': 'BsrGI',
  'BstEII-HF': 'BstEII',
  'BstZ17I-HF': 'BstZ17I',
  'DraIII-HF': 'AdeI',
  'EagI-HF': 'EagI',
  'EcoRI-HF': 'EcoRI',
  'EcoRV-HF': 'EcoRV',
  'HindIII-HF': 'HindIII',
  'KpnI-HF': 'Acc65I',
  'MfeI-HF': 'MunI',
  'MluI-HF': 'MluI',
  'NcoI-HF': 'NcoI',
  'NheI-HF': 'NheI',
  'NotI-HF': 'NotI',
  'NruI-HF': 'NruI',
  'NsiI-HF': 'NsiI',
  'PstI-HF': 'PstI',
  'PvuI-HF': 'PvuI',
  'PvuII-HF': 'PvuII',
  'SacI-HF': 'SacI',
  'SalI-HF': 'SalI',
  'SbfI-HF': 'SbfI',
  'ScaI-HF': 'ScaI',
  'SpeI-HF': 'SpeI',
  'SphI-HF': 'SphI',
  'SspI-HF': 'SspI',
  'StyI-HF': 'Eco105I',
}

const methylationOverrides: Record<string, Partial<ThermoChartProfile['methylation']>> = {
  DpnI: { dam: 'Requires Dam methylation' },
  DpnII: { dam: 'Blocked by Dam methylation' },
  EcoRII: { dam: 'Blocked by Dam methylation' },
  MboI: { dam: 'Blocked by Dam methylation' },
  Sau3AI: { dam: 'Blocked by Dam methylation' },
  HpaII: { dcm: 'Blocked by Dcm methylation' },
  MspI: { dcm: 'Cleaves methylated and unmethylated CCGG' },
  MspJI: { dcm: 'Requires 5-methylcytosine (m⁵C)' },
  SgeI: { dcm: 'Requires 5-methylcytosine (m⁵C)' },
}

function decodeHtml(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseName(raw: string) {
  const match = raw.match(/^([^(]+?)(?:\s*\(([^)]+)\))?$/)
  return {
    thermoName: (match?.[1] ?? raw).trim(),
    alias: match?.[2]?.trim() ?? null,
  }
}

function activityScore(value: string) {
  const normalized = value.replace(/\([^)]*\)/g, '').replace('*', '').trim()
  if (!normalized || normalized.startsWith('NR')) return -1
  if (normalized === '100') return 100
  const range = normalized.match(/^(\d+)-(\d+)$/)
  if (range) return (Number(range[1]) + Number(range[2])) / 2
  const lessThan = normalized.match(/^<(\d+)$/)
  if (lessThan) return Number(lessThan[1]) - 1
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 50
}

function preferredBufferFor(preferredRaw: string, activities: Record<ThermoBufferCode, string>): ThermoBufferCode {
  const token = preferredRaw.split(/\s+/)[0] ?? ''
  const mapped: Record<string, ThermoBufferCode> = {
    B: 'b',
    G: 'g',
    O: 'o',
    R: 'r',
    Tango: 'tango',
  }
  if (mapped[token]) return mapped[token]!

  const best = (Object.entries(activities) as [ThermoBufferCode, string][])
    .map(([code, value]) => ({ code, score: activityScore(value) }))
    .filter((entry) => entry.score >= 0)
    .toSorted((left, right) => right.score - left.score)[0]
  return best?.code ?? 'g'
}

function suppliedBufferLabel(preferredRaw: string, preferred: ThermoBufferCode) {
  const color =
    preferred === 'b'
      ? 'blue'
      : preferred === 'g'
        ? 'green'
        : preferred === 'o'
          ? 'orange'
          : preferred === 'r'
            ? 'red'
            : 'yellow'
  if (/^unique/i.test(preferredRaw) || preferredRaw.includes('+')) return preferredRaw
  if (['B', 'G', 'O', 'R', 'Tango'].includes(preferredRaw)) {
    return `Buffer ${preferredRaw} (${color})`
  }
  return preferredRaw
}

function parseReactionConditions(html: string) {
  const rows = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)]
  const profiles = new Map<string, ThermoChartProfile>()

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis)].map((cell) => decodeHtml(cell[1]!))
    if (cells.length < 8 || !cells[0] || cells[0].includes('Recommended buffer')) continue

    const { thermoName, alias } = parseName(cells[0])
    const activities: Record<ThermoBufferCode, string> = {
      b: cells[2] ?? '',
      g: cells[3] ?? '',
      o: cells[4] ?? '',
      r: cells[5] ?? '',
      tango: cells[6] ?? '',
    }
    const preferredBuffer = preferredBufferFor(cells[1] ?? '', activities)
    const profile: ThermoChartProfile = {
      thermoName,
      alias,
      recognitionRaw: null,
      preferredBuffer,
      suppliedBuffer: suppliedBufferLabel(cells[1] ?? '', preferredBuffer),
      bufferActivity: activities,
      tango2x: cells[7] ?? null,
      doubleDigest: cells[8] ?? null,
      heatInactivation: cells[10] ?? null,
      incubationC: 37,
      methylation: {
        dam: 'No Effect',
        dcm: 'No Effect',
        ecoKI: 'No Effect',
        ...methylationOverrides[thermoName],
        ...(alias ? methylationOverrides[alias] : {}),
      },
    }

    profiles.set(thermoName, profile)
  }

  return profiles
}

function stripThermoConditionSuffix(value: string) {
  return value.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

function parseSelectionProfiles(html: string) {
  const profiles = new Map<string, ThermoChartProfile>()
  const blocks = [
    ...html.matchAll(/<h2><a>([^<]+)<\/a><\/h2>[\s\S]*?(?=<h2><a>|<div id="fdLink"|$)/gi),
  ]

  for (const block of blocks) {
    const thermoName = block[1]!.trim()
    const content = block[0]!
    const recognitionMatch = content.match(/<div class="cutsite"><code>([^<]+)<\/code>/i)
    const optimalMatch = content.match(/<span class="optimalbuffer">([^<]+)<\/span>/i)
    if (!recognitionMatch || !optimalMatch) continue

    const activities: Record<ThermoBufferCode, string> = {
      b: '',
      g: '',
      o: '',
      r: '',
      tango: '',
    }
    let tango2x: string | null = null

    for (const row of content.matchAll(/<tr class="[^"]*">\s*<th>([^<]+)<\/th>\s*<td>([^<]+)<\/td>/gi)) {
      const header = decodeHtml(row[1]!).trim()
      const value = stripThermoConditionSuffix(decodeHtml(row[2]!))
      if (header === 'B') activities.b = value
      else if (header === 'G') activities.g = value
      else if (header === 'O') activities.o = value
      else if (header === 'R') activities.r = value
      else if (/1X Tango/i.test(header)) activities.tango = value
      else if (/2X Tango/i.test(header)) tango2x = value
    }

    const conditions: Record<string, string> = {}
    for (const row of content.matchAll(/<th>([^<]+)<\/th>\s*<td>([^<]+)<\/td>/gi)) {
      conditions[decodeHtml(row[1]!).trim()] = decodeHtml(row[2]!).trim()
    }

    const preferredRaw = stripThermoConditionSuffix(optimalMatch[1]!)
    const preferredBuffer = preferredBufferFor(preferredRaw, activities)
    const incubation = conditions['Optimal Temperature']
    const incubationC = incubation ? Number(incubation.replace(/[^\d]/g, '')) || 37 : 37

    profiles.set(thermoName, {
      thermoName,
      alias: null,
      recognitionRaw: decodeHtml(recognitionMatch[1]!),
      preferredBuffer,
      suppliedBuffer: suppliedBufferLabel(preferredRaw, preferredBuffer),
      bufferActivity: activities,
      tango2x,
      doubleDigest: conditions['Double Digest'] ? stripThermoConditionSuffix(conditions['Double Digest']) : null,
      heatInactivation: conditions.Inactivation ?? null,
      incubationC,
      methylation: {
        dam: 'No Effect',
        dcm: 'No Effect',
        ecoKI: 'No Effect',
        ...methylationOverrides[thermoName],
      },
    })
  }

  return profiles
}

function parseSelectionRecognitions(html: string) {
  const recognitions = new Map<string, string>()
  const pattern =
    /<h2[^>]*>.*?>([^<]+)<\/a><\/h2>.*?<div class="cutsite"><code>([^<]+)<\/code>/gis

  for (const match of html.matchAll(pattern)) {
    const thermoName = match[1]!.trim()
    recognitions.set(thermoName, decodeHtml(match[2]!))
  }

  return recognitions
}

function parseIncubationTemps(markdown: string) {
  const temps = new Map<string, number>()
  const sections = markdown.split(/^## /m).slice(1)
  for (const section of sections) {
    const name = section.split('\n')[0]?.trim()
    if (!name || name === 'Search enzymes') continue
    const temp = section.match(/\| Optimal Temperature \| ([^|]+)/)?.[1]?.trim()
    if (!temp) continue
    const parsed = Number(temp.replace(/[^\d]/g, ''))
    if (Number.isFinite(parsed)) temps.set(name, parsed)
    const aliasLine = section
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /^\w+ \([^)]+\)$/.test(line))
    if (aliasLine) {
      const alias = aliasLine.match(/\(([^)]+)\)/)?.[1]
      if (alias) temps.set(alias, parsed)
    }
  }
  return temps
}

function chartForCatalog(
  profiles: Map<string, ThermoChartProfile>,
  incubation: Map<string, number>,
  recognitions: Map<string, string>,
) {
  const chart: Record<string, ThermoChartProfile> = {}

  for (const profile of profiles.values()) {
    const incubationC = incubation.get(profile.thermoName) ?? profile.incubationC
    chart[profile.thermoName] = {
      ...profile,
      recognitionRaw: recognitions.get(profile.thermoName) ?? profile.recognitionRaw,
      incubationC,
    }
  }

  for (const [catalogName, thermoKey] of Object.entries(catalogToThermoKey)) {
    const profile = chart[thermoKey]
    if (profile) chart[catalogName] = profile
  }

  return chart
}

async function fetchText(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return response.text()
}

async function main() {
  const [reactionHtml, selectionHtml] = await Promise.all([
    fetchText(REACTION_CONDITIONS_URL),
    fetchText(SELECTION_TOOL_URL),
  ])

  const profiles = parseReactionConditions(reactionHtml)
  const selectionProfiles = parseSelectionProfiles(selectionHtml)
  for (const [name, profile] of selectionProfiles) {
    if (!profiles.has(name)) {
      profiles.set(name, profile)
    }
  }

  const incubation = parseIncubationTemps(selectionHtml)
  const recognitions = parseSelectionRecognitions(selectionHtml)
  const chart = chartForCatalog(profiles, incubation, recognitions)

  const root = dirname(fileURLToPath(import.meta.url))
  const outputPath = join(root, 'thermo-buffer-chart.json')
  writeFileSync(outputPath, `${JSON.stringify(chart, null, 2)}\n`)
  console.log(`Wrote ${Object.keys(chart).length} Thermo lookup keys to ${outputPath}`)
  const uniqueNames = new Set(Object.values(chart).map((profile) => profile.thermoName))
  console.log(`Unique Thermo enzymes: ${uniqueNames.size}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
