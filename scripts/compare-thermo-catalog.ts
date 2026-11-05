import { readFileSync } from 'node:fs'
import { parseThermoRecognition } from '../src/domain/enzymeParser.ts'
import { catalogToThermoKey } from './fetch-thermo-buffer-chart.ts'
import type { ThermoChartProfile } from './fetch-thermo-buffer-chart.ts'

const REACTION_CONDITIONS_URL =
  'https://www.thermofisher.com/us/en/home/brands/thermo-scientific/molecular-biology/thermo-scientific-restriction-modifying-enzymes/restriction-enzymes-thermo-scientific/conventional-restriction-enzymes-thermo-scientific/reaction-conditions-for-restriction-enzymes.html'
const SELECTION_TOOL_URL =
  'https://www.thermofisher.com/us/en/home/brands/thermo-scientific/molecular-biology/thermo-scientific-restriction-modifying-enzymes/restriction-enzymes-thermo-scientific/conventional-restriction-enzymes-thermo-scientific.html'

function decodeHtml(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

function thermoBaseName(raw: string) {
  return raw.replace(/\s*\([^)]+\)\s*$/, '').trim()
}

async function compareThermoSources() {
  const [reactionHtml, selectionHtml] = await Promise.all([
    fetch(REACTION_CONDITIONS_URL).then((response) => response.text()),
    fetch(SELECTION_TOOL_URL).then((response) => response.text()),
  ])

  const reactionNames = new Set<string>()
  for (const row of reactionHtml.matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)) {
    const cells = [...row[1]!.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis)].map((cell) => decodeHtml(cell[1]!))
    if (cells.length >= 8 && cells[0] && !cells[0].includes('Recommended buffer')) {
      reactionNames.add(thermoBaseName(cells[0]))
    }
  }

  const selectionNames = new Set<string>()
  for (const match of selectionHtml.matchAll(/<h2[^>]*>.*?>([^<]+)<\/a><\/h2>/gis)) {
    selectionNames.add(match[1]!.trim())
  }

  const selectionRecognitions = new Map<string, string>()
  for (const match of selectionHtml.matchAll(
    /<h2[^>]*>.*?>([^<]+)<\/a><\/h2>.*?<div class="cutsite"><code>([^<]+)<\/code>/gis,
  )) {
    selectionRecognitions.set(match[1]!.trim(), decodeHtml(match[2]!))
  }

  const inSelectionNotReaction = [...selectionNames].filter((name) => !reactionNames.has(name))
  const inReactionNotSelection = [...reactionNames].filter((name) => !selectionNames.has(name))

  console.log(`Reaction conditions enzymes: ${reactionNames.size}`)
  console.log(`Selection tool enzymes: ${selectionNames.size}`)
  console.log(`In selection but not reaction table: ${inSelectionNotReaction.length}`)
  if (inSelectionNotReaction.length) {
    console.log(inSelectionNotReaction.sort().join(', '))
    for (const name of inSelectionNotReaction.sort()) {
      console.log(`  ${name} recognition: ${selectionRecognitions.get(name) ?? 'unknown'}`)
    }
  }
  console.log(`In reaction table but not selection tool: ${inReactionNotSelection.length}`)
  if (inReactionNotSelection.length) console.log(inReactionNotSelection.sort().join(', '))
  console.log('')
}

const thermoChart = JSON.parse(
  readFileSync(new URL('./thermo-buffer-chart.json', import.meta.url), 'utf8'),
) as Record<string, ThermoChartProfile>
const enzymes = JSON.parse(
  readFileSync(new URL('../src/data/enzymes.json', import.meta.url), 'utf8'),
) as Array<{ name: string; manufacturers: Array<{ id: string }> }>

const uniqueProfiles = new Map<string, ThermoChartProfile>()
for (const profile of Object.values(thermoChart)) {
  if (!uniqueProfiles.has(profile.thermoName)) {
    uniqueProfiles.set(profile.thermoName, profile)
  }
}

const catalogNames = new Set(enzymes.map((enzyme) => enzyme.name))
const withThermo = new Set(
  enzymes.filter((enzyme) => enzyme.manufacturers.some((entry) => entry.id === 'thermo')).map((enzyme) => enzyme.name),
)

const missingFromCatalog: string[] = []
const missingThermoManufacturer: string[] = []
const noRecognition: string[] = []
const unparseable: Array<{ name: string; raw: string }> = []

function catalogEntryForThermoName(name: string, profile: ThermoChartProfile) {
  if (catalogNames.has(name)) return name
  if (profile.alias && catalogNames.has(profile.alias)) return profile.alias
  const hfKey = Object.entries(catalogToThermoKey).find(([, value]) => value === name)?.[0]
  if (hfKey && catalogNames.has(hfKey)) return hfKey
  return null
}

for (const [name, profile] of uniqueProfiles) {
  const catalogEntry = catalogEntryForThermoName(name, profile)
  const hasThermo = catalogEntry ? withThermo.has(catalogEntry) : false

  if (!catalogEntry) {
    if (!profile.recognitionRaw) noRecognition.push(name)
    else if (!parseThermoRecognition(profile.recognitionRaw)) {
      unparseable.push({ name, raw: profile.recognitionRaw })
    } else missingFromCatalog.push(name)
    continue
  }

  if (!hasThermo) missingThermoManufacturer.push(name)
}

async function main() {
  console.log(`Unique Thermo enzymes on chart: ${uniqueProfiles.size}`)
  console.log(`In catalog with Thermo manufacturer: ${withThermo.size}`)
  console.log(`Missing entirely (parseable): ${missingFromCatalog.length}`)
  if (missingFromCatalog.length) console.log(missingFromCatalog.sort().join(', '))
  console.log(`In catalog but missing Thermo manufacturer: ${missingThermoManufacturer.length}`)
  if (missingThermoManufacturer.length) console.log(missingThermoManufacturer.sort().join(', '))
  console.log(`No recognition raw: ${noRecognition.length}`)
  if (noRecognition.length) console.log(noRecognition.sort().join(', '))
  console.log(`Unparseable recognition: ${unparseable.length}`)
  for (const entry of unparseable) {
    console.log(` - ${entry.name}: ${entry.raw}`)
  }

  await compareThermoSources()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
