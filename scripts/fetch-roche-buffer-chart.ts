import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { RocheBufferCode } from '../src/domain/types.ts'

const PDF_URL =
  'https://www.sigmaaldrich.com/deepweb/assets/sigmaaldrich/product/documents/347/251/11082035001bul.pdf'

const rocheBufferCodes: RocheBufferCode[] = ['a', 'b', 'h', 'l', 'm']

export type RocheChartProfile = {
  rocheName: string
  catalogName: string
  alsoKnownAs: string | null
  preferredBuffer: RocheBufferCode
  suppliedBuffer: string
  bufferActivity: Partial<Record<RocheBufferCode, string>>
  heatInactivation: string | null
  incubationC: number
  requiresBsa: boolean
  specialBuffer: boolean
  methylation: {
    dam: string
    dcm: string
    ecoKI: string
  }
}

const methylationOverrides: Record<string, Partial<RocheChartProfile['methylation']>> = {
  DpnI: { dam: 'Requires Dam methylation' },
  EcoRII: { dam: 'Blocked by Dam methylation' },
  MboI: { dam: 'Blocked by Dam methylation' },
  Sau3AI: { dam: 'Blocked by Dam methylation' },
  HpaII: { dcm: 'Blocked by Dcm methylation' },
  MspI: { dcm: 'Cleaves methylated and unmethylated CCGG' },
}

const rocheAlsoKnownAs: Record<string, string> = {
  MroI: 'AccIII',
  BlnI: 'AvrII',
  BanI: 'BshI',
  BanII: 'Bsh1236I',
  EclXI: 'Eco130I',
  Asp718I: 'PstI',
  AspEI: 'NsiI',
  Asp700I: 'Bsp1286I',
  XmaCI: 'XmaI',
}

const specialBufferEnzymes = new Set(['MaeI', 'MaeII', 'MaeIII', 'NdeII'])
const bsaRequiredEnzymes = new Set(['HpaII', 'KpnI'])

export function rocheNameToCatalog(name: string) {
  const cleaned = name.replace(/\*/g, '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return cleaned

  if (/^Asp\s+718$/i.test(cleaned)) return 'Asp718I'
  if (/^Asp\s+700$/i.test(cleaned)) return 'Asp700I'
  if (/^Ksp\s+632$/i.test(cleaned)) return 'Ksp632I'
  if (/^Psp\s+1406$/i.test(cleaned)) return 'Psp1406I'
  if (/^Bst\s+1107$/i.test(cleaned)) return 'Bst1107I'
  if (/^Bsp\s+LU\s*11$/i.test(cleaned)) return 'BspLU11I'
  if (/^Van\s+91$/i.test(cleaned)) return 'Van91I'
  if (/^Eco\s+47\s+III$/i.test(cleaned)) return 'Eco47III'
  if (/^Tru\s+9$/i.test(cleaned)) return 'Tru9I'
  if (/^Sau\s+96$/i.test(cleaned)) return 'Sau96I'
  if (/^Sau\s+3A$/i.test(cleaned)) return 'Sau3AI'
  if (/^Alw\s+44$/i.test(cleaned)) return 'Alw44I'
  if (/^Mlu\s+NI$/i.test(cleaned)) return 'MluNI'

  const aiMatch = cleaned.match(/^(.+?)\s+AI$/i)
  if (aiMatch) return `${aiMatch[1]!.replace(/\s+/g, '')}AI`

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

function normalizeActivity(value: string) {
  return value.replace(/\u2013/g, '-').replace(/\s+/g, '').trim()
}

function rocheBufferLabel(code: RocheBufferCode) {
  return `SuRE/Cut Buffer ${code.toUpperCase()}`
}

function suppliedBufferFor(code: RocheBufferCode, specialBuffer: boolean) {
  if (specialBuffer) return '2× special SuRE/Cut buffer (supplied with enzyme)'
  return rocheBufferLabel(code)
}

function extractRocheEnzymeNames(chunk: string) {
  const normalized = chunk.replace(/\s+/g, ' ').trim()
  const names: string[] = []
  let index = 0

  const tryMatch = (pattern: RegExp) => {
    const match = normalized.slice(index).match(pattern)
    if (!match) return false
    names.push(match[0]!.trim())
    index += match[0]!.length
    return true
  }

  while (index < normalized.length) {
    if (normalized[index] === ' ') {
      index += 1
      continue
    }

    const matched =
      tryMatch(/^Eco 47 III\b/i) ||
      tryMatch(/^Bsp LU 11\b/i) ||
      tryMatch(/^Cel II\b/i) ||
      tryMatch(/^Sau 3A\b/i) ||
      tryMatch(/^[A-Z][A-Za-z]+ AI\b/i) ||
      tryMatch(/^[A-Z][A-Za-z]+ \d+ I{1,3}\b/i) ||
      tryMatch(/^[A-Z][A-Za-z]+ \d+[A-Za-z]\b/i) ||
      tryMatch(/^[A-Z][A-Za-z]+ \d+\b/i) ||
      tryMatch(/^[A-Z][a-z]+ R[A-Z]*I{0,2}\b/i) ||
      tryMatch(/^[A-Z][a-z]+ [A-Z]{2,}\b/i) ||
      tryMatch(/^[A-Z][a-z]+ I{1,3}\b/i)

    if (!matched) {
      index += 1
    }
  }

  return names
}

export function extractRocheNamesAndValues(chunk: string) {
  const normalized = chunk.replace(/\*+/g, ' ').replace(/\s+/g, ' ').trim()
  const names: string[] = []
  let index = 0

  const tryMatch = (pattern: RegExp) => {
    const match = normalized.slice(index).match(pattern)
    if (!match) return false
    names.push(match[0]!.trim())
    index += match[0]!.length
    return true
  }

  while (index < normalized.length) {
    if (normalized[index] === ' ') {
      index += 1
      continue
    }

    const matched =
      tryMatch(/^Eco 47 III\b/i) ||
      tryMatch(/^Bsp LU 11\b/i) ||
      tryMatch(/^Cel II\b/i) ||
      tryMatch(/^Sau 3A\b/i) ||
      tryMatch(/^[A-Z][A-Za-z]+ AI\b/i) ||
      tryMatch(/^[A-Z][A-Za-z]+ \d+ I{1,3}\b/i) ||
      tryMatch(/^[A-Z][A-Za-z]+ \d+[A-Za-z]\b/i) ||
      tryMatch(/^[A-Z][A-Za-z]+ \d+\b/i) ||
      tryMatch(/^[A-Z][a-z]+ R[A-Z]*I{0,2}\b/i) ||
      tryMatch(/^[A-Z][a-z]+ [A-Z]{2,}\b/i) ||
      tryMatch(/^[A-Z][a-z]+ I{1,3}\b/i)

    if (!matched) {
      break
    }
  }

  const values = parseActivityValues(normalized.slice(index))
  return { names, values }
}

function parseTable3Preferred(text: string) {
  const start = text.indexOf('A  Aat')
  const end = text.indexOf('0418.')
  const preferred = new Map<string, RocheBufferCode>()
  if (start < 0 || end < 0) return preferred

  const section = text.slice(start, end)
  const columns: Array<{ code: RocheBufferCode; chunk: string | undefined }> = [
    { code: 'a', chunk: section.match(/^A\s+([\s\S]*?)\sB\s+/i)?.[1] },
    { code: 'b', chunk: section.match(/\sB\s+([\s\S]*?)\sL\s+/i)?.[1] },
    { code: 'l', chunk: section.match(/\sL\s+([\s\S]*?)\sM\s+/i)?.[1] },
    { code: 'm', chunk: section.match(/\sM\s+([\s\S]*?)\sH\s+/i)?.[1] },
    { code: 'h', chunk: section.match(/\sH\s+([\s\S]*?)$/i)?.[1] },
  ]

  for (const column of columns) {
    if (!column.chunk) continue
    for (const name of extractRocheEnzymeNames(column.chunk)) {
      preferred.set(rocheNameToCatalog(name), column.code)
    }
  }

  return preferred
}

function parseActivityValues(valuesText: string) {
  return [...valuesText.replace(/\u2013/g, '-').matchAll(/\d+(?:-\d+)?/g)].map((match) =>
    normalizeActivity(match[0]!),
  )
}

function parseTable4Activities(text: string) {
  const activities = new Map<string, Partial<Record<RocheBufferCode, string>>>()
  const sections = [
    ...text.matchAll(
      /Enzyme\s+A\s+B\s+L\s+M\s+H\s+([\s\S]*?)(?=Enzyme\s+A\s+B\s+L\s+M\s+H|Table 4:\s+This table)/gi,
    ),
  ]

  for (const section of sections) {
    const { names, values } = extractRocheNamesAndValues(section[1]!)
    const rowCount = names.length
    for (let index = 0; index < rowCount; index += 1) {
      const catalogName = rocheNameToCatalog(names[index]!)
      const row: string[] = []
      for (let column = 0; column < rocheBufferCodes.length; column += 1) {
        row.push(values[column * rowCount + index] ?? '')
      }
      if (row.some((value) => value)) {
        activities.set(catalogName, {
          a: row[0]!,
          b: row[1]!,
          l: row[2]!,
          m: row[3]!,
          h: row[4]!,
        })
      }
    }
  }

  return activities
}

function parseIncubationOverrides(text: string) {
  const temps = new Map<string, number>()
  const table2Start = text.indexOf('Table 2:')
  const table3Start = text.indexOf('Table 3:')
  if (table2Start < 0 || table3Start < 0) return temps

  const section = text.slice(table2Start, table3Start)
  const pattern =
    /\b([A-Z][A-Za-z]*(?:\s+[A-Za-z0-9]+)*\s+I{1,3}|[A-Z][A-Za-z]+\s+AI|Asp\s+(?:700|718)|Bst\s+1107|Bsp\s+LU\s*11|Van\s+91|Eco\s+47\s+III|Tru\s+9|Sau\s+(?:3A|96)|Alw\s+44|Mlu\s+NI)\b\s*\((\d+)\s*°?\s*C\)/gi

  for (const match of section.matchAll(pattern)) {
    temps.set(rocheNameToCatalog(match[1]!), Number(match[2]))
  }

  return temps
}

export function buildRocheChartFromText(text: string) {
  const preferredByCatalog = parseTable3Preferred(text)
  const activitiesByCatalog = parseTable4Activities(text)
  const incubationByCatalog = parseIncubationOverrides(text)
  const catalogNames = new Set([...preferredByCatalog.keys(), ...activitiesByCatalog.keys()])
  const chart: Record<string, RocheChartProfile> = {}

  for (const catalogName of catalogNames) {
    const preferredBuffer = preferredByCatalog.get(catalogName) ?? 'h'
    const bufferActivity = activitiesByCatalog.get(catalogName) ?? {}
    const specialBuffer = specialBufferEnzymes.has(catalogName)
    const requiresBsa = bsaRequiredEnzymes.has(catalogName)

    chart[catalogName] = {
      rocheName: catalogName,
      catalogName,
      alsoKnownAs: rocheAlsoKnownAs[catalogName] ?? null,
      preferredBuffer,
      suppliedBuffer: suppliedBufferFor(preferredBuffer, specialBuffer),
      bufferActivity,
      heatInactivation: '65°C',
      incubationC: incubationByCatalog.get(catalogName) ?? 37,
      requiresBsa,
      specialBuffer,
      methylation: {
        dam: 'No Effect',
        dcm: 'No Effect',
        ecoKI: 'No Effect',
        ...methylationOverrides[catalogName],
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
  const root = dirname(fileURLToPath(import.meta.url))
  let text: string
  try {
    text = await extractPdfText(PDF_URL)
  } catch (error) {
    const cachedPath = join(root, 'roche-pdf-text.txt')
    console.warn(`Failed to fetch PDF (${error}); using cached text at ${cachedPath}`)
    text = readFileSync(cachedPath, 'utf8')
  }
  const chart = buildRocheChartFromText(text)
  const withActivity = Object.values(chart).filter((profile) =>
    rocheBufferCodes.some((code) => profile.bufferActivity[code]),
  ).length

  const outputPath = join(root, 'roche-buffer-chart.json')
  writeFileSync(outputPath, `${JSON.stringify(chart, null, 2)}\n`)
  console.log(`Wrote ${Object.keys(chart).length} Roche enzymes (${withActivity} with buffer activity) to ${outputPath}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
