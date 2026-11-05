import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseNebRecognition,
  parseSibRecognition,
  parseThermoRecognition,
  parseUsbRecognition,
  parseVivantisRecognition,
} from '../src/domain/enzymeParser.ts'
import type { EnzymeBufferCode, EnzymeManufacturer, RestrictionEnzyme } from '../src/domain/types.ts'
import { nebRecognitionChart } from './neb-recognition-chart.ts'
import type { ThermoChartProfile } from './fetch-thermo-buffer-chart.ts'
import { catalogToThermoKey } from './fetch-thermo-buffer-chart.ts'
import type { SibChartProfile } from './fetch-sibenzyme-buffer-chart.ts'
import { sibProductUrl } from './fetch-sibenzyme-buffer-chart.ts'
import type { UsbChartProfile } from './fetch-usb-buffer-chart.ts'
import type { VivantisChartProfile } from './fetch-vivantis-buffer-chart.ts'
import { migrateVivantisChart } from './fetch-vivantis-buffer-chart.ts'
import { finalizeVivantisProfile } from '../src/domain/vivantisBuffer.ts'
import { vivantisEnzymeSpecificBufferLabel, reconcileVivantisPreferredBuffer } from '../src/domain/vivantisBuffer.ts'
import type { RocheChartProfile } from './fetch-roche-buffer-chart.ts'
import { rocheNotationFor } from './roche-recognition-chart.ts'
import type { TakaraChartProfile } from './fetch-takara-buffer-chart.ts'
import { takaraNotationFor } from './takara-recognition-chart.ts'
import type { PromegaChartProfile } from './fetch-promega-buffer-chart.ts'
import { promegaNotationFor } from './promega-recognition-chart.ts'
import type { JenaChartProfile } from './fetch-jena-buffer-chart.ts'
import type { EurxChartProfile } from './fetch-eurx-buffer-chart.ts'
import { eurxNotationFor } from './eurx-recognition-chart.ts'
import {
  attachMethylationRulesToCatalog,
  methylationDisplayStrings,
} from '../src/domain/methylationRules.ts'

const enzymeSpecificTips: Record<string, string[]> = {
  BlsI: [
    'The 1-base overhangs produced by BlsI may be hard to ligate.',
    'Sticky ends from different BlsI sites may not be compatible.',
  ],
  EcoRI: ['Star activity may be observed in non-optimal buffers or at high glycerol concentrations.'],
  DpnI: ['Cleaves only Dam-methylated GATC sites; does not cut unmethylated DNA.'],
  MspJI: ['Cleaves DNA containing 5-methylcytosine; recognition occurs at CNNR sites with m⁵C.'],
  SgeI: ['Cleaves only when the external cytosine in the CNNG site is methylated (5-methylcytosine).'],
}

type NebChartProfile = {
  suppliedBuffer: string | null
  preferredBuffer: EnzymeBufferCode
  bufferActivity: EnzymeManufacturer['bufferActivity']
  heatInactivation: string | null
  incubationC: number
  diluent: string | null
  methylation: EnzymeManufacturer['methylation']
  unitSubstrate: string | null
}

const root = dirname(fileURLToPath(import.meta.url))
const nebChart = JSON.parse(
  readFileSync(join(root, 'neb-buffer-chart.json'), 'utf8'),
) as Record<string, NebChartProfile>
const thermoChart = JSON.parse(
  readFileSync(join(root, 'thermo-buffer-chart.json'), 'utf8'),
) as Record<string, ThermoChartProfile>
const sibChart = JSON.parse(
  readFileSync(join(root, 'sibenzyme-buffer-chart.json'), 'utf8'),
) as Record<string, SibChartProfile>
const usbChart = JSON.parse(
  readFileSync(join(root, 'usb-buffer-chart.json'), 'utf8'),
) as Record<string, UsbChartProfile>
const vivantisChartRaw = JSON.parse(
  readFileSync(join(root, 'vivantis-buffer-chart.json'), 'utf8'),
) as Record<string, VivantisChartProfile & { alias?: string | null }>
const vivantisChart = Object.fromEntries(
  Object.entries(migrateVivantisChart(vivantisChartRaw)).map(([name, profile]) => [
    name,
    finalizeVivantisProfile(profile),
  ]),
)
const vivantisTradeNameTargets = new Set(
  Object.values(vivantisChart)
    .map((profile) => profile.alsoKnownAs)
    .filter((name): name is string => Boolean(name)),
)
const rocheChart = JSON.parse(
  readFileSync(join(root, 'roche-buffer-chart.json'), 'utf8'),
) as Record<string, RocheChartProfile>
const rocheTradeNameTargets = new Set(
  Object.values(rocheChart)
    .map((profile) => profile.alsoKnownAs)
    .filter((name): name is string => Boolean(name)),
)
const takaraChart = JSON.parse(
  readFileSync(join(root, 'takara-buffer-chart.json'), 'utf8'),
) as Record<string, TakaraChartProfile>
const takaraTradeNameTargets = new Set(
  Object.values(takaraChart)
    .map((profile) => profile.alsoKnownAs)
    .filter((name): name is string => Boolean(name)),
)
const promegaChart = JSON.parse(
  readFileSync(join(root, 'promega-buffer-chart.json'), 'utf8'),
) as Record<string, PromegaChartProfile>
const promegaTradeNameTargets = new Set(
  Object.values(promegaChart)
    .map((profile) => profile.alsoKnownAs)
    .filter((name): name is string => Boolean(name)),
)
const jenaChart = JSON.parse(
  readFileSync(join(root, 'jena-buffer-chart.json'), 'utf8'),
) as Record<string, JenaChartProfile>
const jenaTradeNameTargets = new Set(
  Object.values(jenaChart)
    .map((profile) => profile.alsoKnownAs)
    .filter((name): name is string => Boolean(name)),
)
const eurxChart = JSON.parse(
  readFileSync(join(root, 'eurx-buffer-chart.json'), 'utf8'),
) as Record<string, EurxChartProfile>
const eurxTradeNameTargets = new Set(
  Object.values(eurxChart)
    .map((profile) => profile.alsoKnownAs)
    .filter((name): name is string => Boolean(name)),
)

const methylationOverrides: Record<string, Partial<EnzymeManufacturer['methylation']>> = {}

function canonicalMethylationFor(enzyme: Pick<RestrictionEnzyme, 'name' | 'recognition'>) {
  return methylationDisplayStrings(enzyme)
}

function preferredBufferFor(name: string): EnzymeBufferCode {
  if (name.includes('Bst') || name.includes('Taq') || name.startsWith('Tsp')) return 'r2.1'
  return 'cutSmart'
}

function incubationFor(name: string, type: RestrictionEnzyme['type']) {
  if (name.includes('Taq') || name.startsWith('Tsp')) return 65
  if (name.includes('Bst') && type === 'IIS') return 55
  return 37
}

function sanitizeEnzymeName(name: string) {
  const cleaned = name.replace(/[®§]/g, '')
  // Prefer familiar catalog names over NEB product-revision suffixes.
  const displayAliases: Record<string, string> = {
    'BsaI-HFv2': 'BsaI',
    'BsmBI-v2': 'BsmBI',
  }
  return displayAliases[cleaned] ?? cleaned
}

function chartProfileFor(rawName: string) {
  return nebChart[rawName] ?? nebChart[sanitizeEnzymeName(rawName)]
}

function nebWebsiteUrl(enzymeName: string) {
  return `https://www.neb.com/en/search?#q=${encodeURIComponent(enzymeName.trim())}&sort=relevancy`
}

function thermoWebsiteUrl(thermoName: string) {
  return `https://www.thermofisher.com/search/results?query=${encodeURIComponent(thermoName.trim())}`
}

function sibWebsiteUrl(sibName: string) {
  return sibProductUrl(sibName)
}

function usbWebsiteUrl(catalogNumber: string, enzymeName: string) {
  const slug = enzymeName.replace(/\s+/g, '-')
  return `https://www.usbio.net/molecular-biology/${catalogNumber}/${slug}`
}

function vivantisWebsiteUrl(productUrl: string) {
  return productUrl
}

function rocheWebsiteUrl(enzymeName: string) {
  return `https://www.sigmaaldrich.com/US/en/search/roche?term=${encodeURIComponent(enzymeName.trim())}`
}

function takaraWebsiteUrl(productUrl: string) {
  return productUrl
}

function promegaWebsiteUrl(productUrl: string) {
  return productUrl
}

function vivantisManufacturerFor(
  enzyme: Pick<RestrictionEnzyme, 'name'>,
  chartProfile: VivantisChartProfile,
): EnzymeManufacturer {
  const methylation = {
    ...chartProfile.methylation,
    ...methylationOverrides[enzyme.name],
  }

  const enzymeSpecificBuffer =
    chartProfile.enzymeSpecificBuffer ?? vivantisEnzymeSpecificBufferLabel(chartProfile.suppliedBuffer)
  const preferredBuffer = reconcileVivantisPreferredBuffer({
    ...chartProfile,
    enzymeSpecificBuffer,
  })

  return {
    id: 'vivantis',
    name: 'Vivantis',
    bufferSystem: 'vivantis',
    productUrl: vivantisWebsiteUrl(chartProfile.productUrl),
    incubationC: chartProfile.incubationC,
    preferredBuffer,
    suppliedBuffer: chartProfile.suppliedBuffer,
    enzymeSpecificBuffer,
    catalogNotes: chartProfile.catalogNotes ?? [],
    bufferActivity: chartProfile.bufferActivity,
    heatInactivation: chartProfile.heatInactivation,
    methylation,
  }
}

function vivantisProfileFor(enzymeName: string): VivantisChartProfile | undefined {
  const profile = vivantisChart[enzymeName]
  if (!profile || profile.catalogName !== enzymeName) return undefined
  return profile
}

function appendVivantisManufacturer(
  manufacturers: EnzymeManufacturer[],
  enzyme: Pick<RestrictionEnzyme, 'name'>,
) {
  if (vivantisTradeNameTargets.has(enzyme.name)) return
  const vivantisProfile = vivantisProfileFor(enzyme.name)
  if (vivantisProfile) manufacturers.push(vivantisManufacturerFor(enzyme, vivantisProfile))
}

function rocheProfileFor(enzymeName: string): RocheChartProfile | undefined {
  const profile = rocheChart[enzymeName]
  if (!profile || profile.catalogName !== enzymeName) return undefined
  return profile
}

function rocheManufacturerFor(
  enzyme: Pick<RestrictionEnzyme, 'name'>,
  chartProfile: RocheChartProfile,
): EnzymeManufacturer {
  const methylation = {
    ...chartProfile.methylation,
    ...methylationOverrides[enzyme.name],
  }

  return {
    id: 'roche',
    name: 'Roche (Sigma/Merck)',
    bufferSystem: 'roche',
    productUrl: rocheWebsiteUrl(enzyme.name),
    incubationC: chartProfile.incubationC,
    preferredBuffer: chartProfile.preferredBuffer,
    suppliedBuffer: chartProfile.suppliedBuffer,
    bufferActivity: chartProfile.bufferActivity,
    heatInactivation: chartProfile.heatInactivation,
    bsa: chartProfile.requiresBsa ? 'Required' : null,
    methylation,
  }
}

function appendRocheManufacturer(
  manufacturers: EnzymeManufacturer[],
  enzyme: Pick<RestrictionEnzyme, 'name'>,
) {
  if (rocheTradeNameTargets.has(enzyme.name)) return
  const rocheProfile = rocheProfileFor(enzyme.name)
  if (rocheProfile) manufacturers.push(rocheManufacturerFor(enzyme, rocheProfile))
}

function takaraProfileFor(enzymeName: string): TakaraChartProfile | undefined {
  const profile = takaraChart[enzymeName]
  if (!profile || profile.catalogName !== enzymeName) return undefined
  return profile
}

function takaraManufacturerFor(
  enzyme: Pick<RestrictionEnzyme, 'name'>,
  chartProfile: TakaraChartProfile,
): EnzymeManufacturer {
  const methylation = {
    ...chartProfile.methylation,
    ...methylationOverrides[enzyme.name],
  }

  return {
    id: 'takara',
    name: 'TaKaRa',
    bufferSystem: 'takara',
    productUrl: takaraWebsiteUrl(chartProfile.productUrl),
    incubationC: chartProfile.incubationC,
    preferredBuffer: chartProfile.preferredBuffer,
    suppliedBuffer: chartProfile.suppliedBuffer,
    bufferActivity: chartProfile.bufferActivity,
    heatInactivation: chartProfile.heatInactivation,
    methylation,
  }
}

function appendTakaraManufacturer(
  manufacturers: EnzymeManufacturer[],
  enzyme: Pick<RestrictionEnzyme, 'name'>,
) {
  if (takaraTradeNameTargets.has(enzyme.name)) return
  const takaraProfile = takaraProfileFor(enzyme.name)
  if (takaraProfile) manufacturers.push(takaraManufacturerFor(enzyme, takaraProfile))
}

function promegaProfileFor(enzymeName: string): PromegaChartProfile | undefined {
  const profile = promegaChart[enzymeName]
  if (!profile || profile.catalogName !== enzymeName) return undefined
  return profile
}

function promegaManufacturerFor(
  enzyme: Pick<RestrictionEnzyme, 'name'>,
  chartProfile: PromegaChartProfile,
): EnzymeManufacturer {
  const methylation = {
    ...chartProfile.methylation,
    ...methylationOverrides[enzyme.name],
  }

  return {
    id: 'promega',
    name: 'Promega',
    bufferSystem: 'promega',
    productUrl: promegaWebsiteUrl(chartProfile.productUrl),
    incubationC: chartProfile.incubationC,
    preferredBuffer: chartProfile.preferredBuffer,
    suppliedBuffer: chartProfile.suppliedBuffer,
    bufferActivity: chartProfile.bufferActivity,
    heatInactivation: chartProfile.heatInactivation,
    bsa: 'Recommended (0.1 mg/ml)',
    methylation,
  }
}

function appendPromegaManufacturer(
  manufacturers: EnzymeManufacturer[],
  enzyme: Pick<RestrictionEnzyme, 'name'>,
) {
  if (promegaTradeNameTargets.has(enzyme.name)) return
  const promegaProfile = promegaProfileFor(enzyme.name)
  if (promegaProfile) manufacturers.push(promegaManufacturerFor(enzyme, promegaProfile))
}

function jenaProfileFor(enzymeName: string): JenaChartProfile | undefined {
  const profile = jenaChart[enzymeName]
  if (!profile || profile.catalogName !== enzymeName) return undefined
  return profile
}

function jenaManufacturerFor(
  enzyme: Pick<RestrictionEnzyme, 'name'>,
  chartProfile: JenaChartProfile,
): EnzymeManufacturer {
  const methylation = {
    ...chartProfile.methylation,
    ...methylationOverrides[enzyme.name],
  }

  return {
    id: 'jena',
    name: 'Jena Bioscience',
    bufferSystem: 'jena',
    productUrl: chartProfile.productUrl,
    incubationC: chartProfile.incubationC,
    preferredBuffer: chartProfile.preferredBuffer,
    suppliedBuffer: chartProfile.suppliedBuffer,
    bufferActivity: chartProfile.bufferActivity,
    heatInactivation: chartProfile.heatInactivation,
    methylation,
  }
}

function appendJenaManufacturer(
  manufacturers: EnzymeManufacturer[],
  enzyme: Pick<RestrictionEnzyme, 'name'>,
) {
  if (jenaTradeNameTargets.has(enzyme.name)) return
  const jenaProfile = jenaProfileFor(enzyme.name)
  if (jenaProfile) manufacturers.push(jenaManufacturerFor(enzyme, jenaProfile))
}

function eurxProfileFor(enzymeName: string): EurxChartProfile | undefined {
  const profile = eurxChart[enzymeName]
  if (!profile || profile.catalogName !== enzymeName) return undefined
  return profile
}

function eurxManufacturerFor(
  enzyme: Pick<RestrictionEnzyme, 'name'>,
  chartProfile: EurxChartProfile,
): EnzymeManufacturer {
  const methylation = {
    ...chartProfile.methylation,
    ...methylationOverrides[enzyme.name],
  }

  return {
    id: 'eurx',
    name: 'EURx',
    bufferSystem: 'eurx',
    productUrl: chartProfile.productUrl,
    incubationC: chartProfile.incubationC,
    preferredBuffer: chartProfile.preferredBuffer,
    suppliedBuffer: chartProfile.suppliedBuffer,
    bufferActivity: chartProfile.bufferActivity,
    heatInactivation: chartProfile.heatInactivation,
    bsa: chartProfile.requiresBsa ? 'Recommended (100 µg/ml)' : null,
    methylation,
  }
}

function appendEurxManufacturer(
  manufacturers: EnzymeManufacturer[],
  enzyme: Pick<RestrictionEnzyme, 'name'>,
) {
  if (eurxTradeNameTargets.has(enzyme.name)) return
  const eurxProfile = eurxProfileFor(enzyme.name)
  if (eurxProfile) manufacturers.push(eurxManufacturerFor(enzyme, eurxProfile))
}

function nebManufacturerFor(
  enzyme: Pick<RestrictionEnzyme, 'name' | 'type' | 'overhang'>,
  chartName: string,
): EnzymeManufacturer {
  const chartProfile = chartProfileFor(chartName)
  const preferredBuffer = chartProfile?.preferredBuffer ?? preferredBufferFor(enzyme.name)
  const methylation = {
    dam: 'No Effect',
    dcm: 'No Effect',
    ecoKI: 'No Effect',
    ...chartProfile?.methylation,
    ...methylationOverrides[enzyme.name],
  }

  return {
    id: 'neb',
    name: 'New England Biolabs',
    bufferSystem: 'neb',
    productUrl: nebWebsiteUrl(enzyme.name),
    incubationC: chartProfile?.incubationC ?? incubationFor(enzyme.name, enzyme.type),
    preferredBuffer,
    suppliedBuffer: chartProfile?.suppliedBuffer ?? null,
    bufferActivity: chartProfile?.bufferActivity ?? {
      'r1.1': preferredBuffer === 'r1.1' ? 100 : null,
      'r2.1': preferredBuffer === 'r2.1' ? 100 : null,
      'r3.1': preferredBuffer === 'r3.1' ? 100 : null,
      cutSmart: preferredBuffer === 'cutSmart' ? 100 : null,
    },
    heatInactivation: chartProfile?.heatInactivation ?? null,
    diluent: chartProfile?.diluent ?? null,
    unitSubstrate: chartProfile?.unitSubstrate ?? null,
    methylation,
  }
}

function thermoManufacturerFor(
  enzyme: Pick<RestrictionEnzyme, 'name'>,
  chartProfile: ThermoChartProfile,
): EnzymeManufacturer {
  const methylation = {
    ...chartProfile.methylation,
    ...methylationOverrides[enzyme.name],
  }

  return {
    id: 'thermo',
    name: 'Thermo Scientific (Fermentas)',
    bufferSystem: 'thermo',
    productUrl: thermoWebsiteUrl(chartProfile.thermoName),
    incubationC: chartProfile.incubationC,
    preferredBuffer: chartProfile.preferredBuffer,
    suppliedBuffer: chartProfile.suppliedBuffer,
    bufferActivity: chartProfile.bufferActivity,
    heatInactivation: chartProfile.heatInactivation,
    tango2x: chartProfile.tango2x,
    doubleDigest: chartProfile.doubleDigest,
    methylation,
  }
}

function thermoProfileFor(enzymeName: string): ThermoChartProfile | undefined {
  // Display aliases (BsaI ← BsaI-HFv2) still need to resolve Thermo chart keys / isoschizomer names.
  const lookupNames = [enzymeName]
  if (enzymeName === 'BsaI') lookupNames.push('BsaI-HFv2', 'Eco31I')
  if (enzymeName === 'BsmBI') lookupNames.push('BsmBI-v2', 'Esp3I')

  for (const name of lookupNames) {
    const profile = thermoChart[name]
    if (!profile) continue
    if (profile.thermoName === name || profile.thermoName === enzymeName) return profile
    if (catalogToThermoKey[enzymeName] === profile.thermoName) return profile
    if (profile.alias === enzymeName) return profile
  }

  return undefined
}

function sibManufacturerFor(
  enzyme: Pick<RestrictionEnzyme, 'name'>,
  chartProfile: SibChartProfile,
): EnzymeManufacturer {
  const methylation = {
    ...chartProfile.methylation,
    ...methylationOverrides[enzyme.name],
  }

  return {
    id: 'sibenzyme',
    name: 'SibEnzyme',
    bufferSystem: 'sibenzyme',
    productUrl: sibWebsiteUrl(chartProfile.sibName),
    incubationC: chartProfile.incubationC,
    preferredBuffer: chartProfile.preferredBuffer,
    suppliedBuffer: chartProfile.suppliedBuffer,
    bufferActivity: chartProfile.bufferActivity,
    heatInactivation: chartProfile.heatInactivation,
    bsa: chartProfile.bsa,
    methylation,
  }
}

function usbManufacturerFor(
  enzyme: Pick<RestrictionEnzyme, 'name'>,
  chartProfile: UsbChartProfile,
): EnzymeManufacturer {
  const methylation = {
    ...chartProfile.methylation,
    ...methylationOverrides[enzyme.name],
  }

  return {
    id: 'usb',
    name: 'US Biological (USB)',
    bufferSystem: 'usb',
    productUrl: usbWebsiteUrl(chartProfile.catalogNumber, chartProfile.usbName),
    incubationC: chartProfile.incubationC,
    preferredBuffer: chartProfile.preferredBuffer,
    suppliedBuffer: chartProfile.suppliedBuffer,
    bufferActivity: chartProfile.bufferActivity,
    heatInactivation: chartProfile.heatInactivation,
    methylation,
  }
}

function manufacturersFor(
  enzyme: Pick<RestrictionEnzyme, 'name' | 'type' | 'overhang'>,
  chartName: string | null,
): EnzymeManufacturer[] {
  const manufacturers: EnzymeManufacturer[] = []
  if (chartName) manufacturers.push(nebManufacturerFor(enzyme, chartName))
  const thermoProfile = thermoProfileFor(enzyme.name)
  if (thermoProfile) manufacturers.push(thermoManufacturerFor(enzyme, thermoProfile))
  const sibProfile = sibChart[enzyme.name]
  if (sibProfile && sibProfile.catalogName === enzyme.name) {
    manufacturers.push(sibManufacturerFor(enzyme, sibProfile))
  }
  const usbProfile = usbChart[enzyme.name]
  if (usbProfile && usbProfile.catalogName === enzyme.name) {
    manufacturers.push(usbManufacturerFor(enzyme, usbProfile))
  }
  appendVivantisManufacturer(manufacturers, enzyme)
  appendRocheManufacturer(manufacturers, enzyme)
  appendTakaraManufacturer(manufacturers, enzyme)
  appendPromegaManufacturer(manufacturers, enzyme)
  appendJenaManufacturer(manufacturers, enzyme)
  appendEurxManufacturer(manufacturers, enzyme)
  return manufacturers
}

function manufacturersForSibOnly(
  enzyme: Pick<RestrictionEnzyme, 'name' | 'type' | 'overhang'>,
  sibProfile: SibChartProfile,
): EnzymeManufacturer[] {
  const manufacturers = [sibManufacturerFor(enzyme, sibProfile)]
  const thermoProfile = thermoProfileFor(enzyme.name)
  if (thermoProfile) manufacturers.push(thermoManufacturerFor(enzyme, thermoProfile))
  const usbProfile = usbChart[enzyme.name]
  if (usbProfile && usbProfile.catalogName === enzyme.name) {
    manufacturers.push(usbManufacturerFor(enzyme, usbProfile))
  }
  appendVivantisManufacturer(manufacturers, enzyme)
  appendRocheManufacturer(manufacturers, enzyme)
  appendTakaraManufacturer(manufacturers, enzyme)
  appendPromegaManufacturer(manufacturers, enzyme)
  appendJenaManufacturer(manufacturers, enzyme)
  appendEurxManufacturer(manufacturers, enzyme)
  return manufacturers
}

function manufacturersForThermoOnly(
  enzyme: Pick<RestrictionEnzyme, 'name' | 'type' | 'overhang'>,
  thermoProfile: ThermoChartProfile,
): EnzymeManufacturer[] {
  const manufacturers = [thermoManufacturerFor(enzyme, thermoProfile)]
  const sibProfile = sibChart[enzyme.name]
  if (sibProfile && sibProfile.catalogName === enzyme.name) {
    manufacturers.push(sibManufacturerFor(enzyme, sibProfile))
  }
  const usbProfile = usbChart[enzyme.name]
  if (usbProfile && usbProfile.catalogName === enzyme.name) {
    manufacturers.push(usbManufacturerFor(enzyme, usbProfile))
  }
  appendVivantisManufacturer(manufacturers, enzyme)
  appendRocheManufacturer(manufacturers, enzyme)
  appendTakaraManufacturer(manufacturers, enzyme)
  appendPromegaManufacturer(manufacturers, enzyme)
  appendJenaManufacturer(manufacturers, enzyme)
  appendEurxManufacturer(manufacturers, enzyme)
  return manufacturers
}

function manufacturersForUsbOnly(
  enzyme: Pick<RestrictionEnzyme, 'name' | 'type' | 'overhang'>,
  usbProfile: UsbChartProfile,
): EnzymeManufacturer[] {
  const manufacturers = [usbManufacturerFor(enzyme, usbProfile)]
  const thermoProfile = thermoProfileFor(enzyme.name)
  if (thermoProfile) manufacturers.push(thermoManufacturerFor(enzyme, thermoProfile))
  const sibProfile = sibChart[enzyme.name]
  if (sibProfile && sibProfile.catalogName === enzyme.name) {
    manufacturers.push(sibManufacturerFor(enzyme, sibProfile))
  }
  appendVivantisManufacturer(manufacturers, enzyme)
  appendRocheManufacturer(manufacturers, enzyme)
  appendTakaraManufacturer(manufacturers, enzyme)
  appendPromegaManufacturer(manufacturers, enzyme)
  appendJenaManufacturer(manufacturers, enzyme)
  appendEurxManufacturer(manufacturers, enzyme)
  return manufacturers
}

function manufacturersForVivantisOnly(
  enzyme: Pick<RestrictionEnzyme, 'name' | 'type' | 'overhang'>,
  vivantisProfile: VivantisChartProfile,
): EnzymeManufacturer[] {
  const manufacturers = [vivantisManufacturerFor(enzyme, vivantisProfile)]
  const thermoProfile = thermoProfileFor(enzyme.name)
  if (thermoProfile) manufacturers.push(thermoManufacturerFor(enzyme, thermoProfile))
  const sibProfile = sibChart[enzyme.name]
  if (sibProfile && sibProfile.catalogName === enzyme.name) {
    manufacturers.push(sibManufacturerFor(enzyme, sibProfile))
  }
  const usbProfile = usbChart[enzyme.name]
  if (usbProfile && usbProfile.catalogName === enzyme.name) {
    manufacturers.push(usbManufacturerFor(enzyme, usbProfile))
  }
  appendRocheManufacturer(manufacturers, enzyme)
  appendTakaraManufacturer(manufacturers, enzyme)
  appendPromegaManufacturer(manufacturers, enzyme)
  appendJenaManufacturer(manufacturers, enzyme)
  appendEurxManufacturer(manufacturers, enzyme)
  return manufacturers
}

function manufacturersForRocheOnly(
  enzyme: Pick<RestrictionEnzyme, 'name' | 'type' | 'overhang'>,
  rocheProfile: RocheChartProfile,
): EnzymeManufacturer[] {
  const manufacturers = [rocheManufacturerFor(enzyme, rocheProfile)]
  const thermoProfile = thermoProfileFor(enzyme.name)
  if (thermoProfile) manufacturers.push(thermoManufacturerFor(enzyme, thermoProfile))
  const sibProfile = sibChart[enzyme.name]
  if (sibProfile && sibProfile.catalogName === enzyme.name) {
    manufacturers.push(sibManufacturerFor(enzyme, sibProfile))
  }
  const usbProfile = usbChart[enzyme.name]
  if (usbProfile && usbProfile.catalogName === enzyme.name) {
    manufacturers.push(usbManufacturerFor(enzyme, usbProfile))
  }
  appendVivantisManufacturer(manufacturers, enzyme)
  appendTakaraManufacturer(manufacturers, enzyme)
  appendPromegaManufacturer(manufacturers, enzyme)
  appendJenaManufacturer(manufacturers, enzyme)
  appendEurxManufacturer(manufacturers, enzyme)
  return manufacturers
}

function vivantisOnlyNotes(enzymeName: string, alsoKnownAs: string | null, catalogNotes: string[] = []): string[] {
  const notes: string[] = [...catalogNotes]
  if (alsoKnownAs) {
    notes.push(
      `Vivantis trade name for a distinct enzyme product; recognition may match ${alsoKnownAs}, but buffer and reaction conditions are Vivantis-specific.`,
    )
  }
  return notes
}

function rocheOnlyNotes(enzymeName: string, alsoKnownAs: string | null): string[] {
  const notes: string[] = []
  if (alsoKnownAs) {
    notes.push(
      `Roche trade name for a distinct enzyme product; recognition may match ${alsoKnownAs}, but buffer and reaction conditions are Roche-specific.`,
    )
  }
  if (['MaeI', 'MaeII', 'MaeIII', 'NdeII'].includes(enzymeName)) {
    notes.push('Supplied with a 2× special SuRE/Cut buffer; use the Roche buffer supplied with this enzyme.')
  }
  return notes
}

function manufacturersForTakaraOnly(
  enzyme: Pick<RestrictionEnzyme, 'name' | 'type' | 'overhang'>,
  takaraProfile: TakaraChartProfile,
): EnzymeManufacturer[] {
  const manufacturers = [takaraManufacturerFor(enzyme, takaraProfile)]
  const thermoProfile = thermoProfileFor(enzyme.name)
  if (thermoProfile) manufacturers.push(thermoManufacturerFor(enzyme, thermoProfile))
  const sibProfile = sibChart[enzyme.name]
  if (sibProfile && sibProfile.catalogName === enzyme.name) {
    manufacturers.push(sibManufacturerFor(enzyme, sibProfile))
  }
  const usbProfile = usbChart[enzyme.name]
  if (usbProfile && usbProfile.catalogName === enzyme.name) {
    manufacturers.push(usbManufacturerFor(enzyme, usbProfile))
  }
  appendVivantisManufacturer(manufacturers, enzyme)
  appendRocheManufacturer(manufacturers, enzyme)
  appendPromegaManufacturer(manufacturers, enzyme)
  appendJenaManufacturer(manufacturers, enzyme)
  appendEurxManufacturer(manufacturers, enzyme)
  return manufacturers
}

function takaraOnlyNotes(enzymeName: string, alsoKnownAs: string | null): string[] {
  const notes: string[] = []
  if (alsoKnownAs) {
    notes.push(
      `TaKaRa trade name for a distinct enzyme product; recognition may match ${alsoKnownAs}, but buffer and reaction conditions are TaKaRa-specific.`,
    )
  }
  if (['AccIII', 'BalI', 'BcnI', 'BglI', 'Bpu1102I', 'Cfr10I', 'Eco52I', 'NruI', 'PshBI', 'SnaBI', 'SspI', 'TaqI', 'VpaK11BI'].includes(
    enzymeName,
  )) {
    notes.push('Supplied with an enzyme-specific basal buffer; use the basal buffer supplied with this enzyme.')
  }
  return notes
}

function manufacturersForPromegaOnly(
  enzyme: Pick<RestrictionEnzyme, 'name' | 'type' | 'overhang'>,
  promegaProfile: PromegaChartProfile,
): EnzymeManufacturer[] {
  const manufacturers = [promegaManufacturerFor(enzyme, promegaProfile)]
  const thermoProfile = thermoProfileFor(enzyme.name)
  if (thermoProfile) manufacturers.push(thermoManufacturerFor(enzyme, thermoProfile))
  const sibProfile = sibChart[enzyme.name]
  if (sibProfile && sibProfile.catalogName === enzyme.name) {
    manufacturers.push(sibManufacturerFor(enzyme, sibProfile))
  }
  const usbProfile = usbChart[enzyme.name]
  if (usbProfile && usbProfile.catalogName === enzyme.name) {
    manufacturers.push(usbManufacturerFor(enzyme, usbProfile))
  }
  appendVivantisManufacturer(manufacturers, enzyme)
  appendRocheManufacturer(manufacturers, enzyme)
  appendTakaraManufacturer(manufacturers, enzyme)
  appendJenaManufacturer(manufacturers, enzyme)
  appendEurxManufacturer(manufacturers, enzyme)
  return manufacturers
}

function promegaOnlyNotes(enzymeName: string, alsoKnownAs: string | null): string[] {
  const notes: string[] = []
  if (alsoKnownAs) {
    notes.push(
      `Promega trade name for a distinct enzyme product; recognition may match ${alsoKnownAs}, but buffer and reaction conditions are Promega-specific.`,
    )
  }
  notes.push('Promega recommends adding acetylated BSA to 0.1 mg/ml in restriction digests.')
  return notes
}

function eurxOnlyNotes(enzymeName: string, alsoKnownAs: string | null): string[] {
  const notes: string[] = []
  if (alsoKnownAs) {
    notes.push(
      `EURx trade name for a distinct enzyme product; recognition may match ${alsoKnownAs}, but buffer and reaction conditions are EURx-specific.`,
    )
  }
  if (['CviJI', 'CviJI(*)', 'TspGWI', 'TspDTI'].includes(enzymeName)) {
    notes.push('Supplied with an enzyme-specific buffer; ONE Buffer is not recommended for this enzyme.')
  }
  return notes
}

function manufacturersForEurxOnly(
  enzyme: Pick<RestrictionEnzyme, 'name' | 'type' | 'overhang'>,
  eurxProfile: EurxChartProfile,
): EnzymeManufacturer[] {
  const manufacturers = [eurxManufacturerFor(enzyme, eurxProfile)]
  const thermoProfile = thermoProfileFor(enzyme.name)
  if (thermoProfile) manufacturers.push(thermoManufacturerFor(enzyme, thermoProfile))
  const sibProfile = sibChart[enzyme.name]
  if (sibProfile && sibProfile.catalogName === enzyme.name) {
    manufacturers.push(sibManufacturerFor(enzyme, sibProfile))
  }
  const usbProfile = usbChart[enzyme.name]
  if (usbProfile && usbProfile.catalogName === enzyme.name) {
    manufacturers.push(usbManufacturerFor(enzyme, usbProfile))
  }
  appendVivantisManufacturer(manufacturers, enzyme)
  appendRocheManufacturer(manufacturers, enzyme)
  appendTakaraManufacturer(manufacturers, enzyme)
  appendPromegaManufacturer(manufacturers, enzyme)
  appendJenaManufacturer(manufacturers, enzyme)
  return manufacturers
}

function notesFor(enzyme: Pick<RestrictionEnzyme, 'name' | 'overhang'>): string[] {
  const notes = [...(enzymeSpecificTips[enzyme.name] ?? [])]
  if (enzyme.overhang.type === 'blunt') {
    notes.push('Blunt ends can be dephosphorylated before ligation to reduce vector recirculation.')
  } else {
    notes.push(`Produces ${enzyme.overhang.type} overhangs; check compatibility before mixing digests.`)
  }
  return notes
}

const nebEnzymes: RestrictionEnzyme[] = nebRecognitionChart.map(([rawName, notation]) => {
  const name = sanitizeEnzymeName(rawName)
  const parsed = parseNebRecognition(notation)
  const draft = { name, ...parsed }
  return {
    ...draft,
    manufacturers: manufacturersFor(draft, rawName),
    notes: notesFor(draft),
  }
})

const nebNames = new Set(nebEnzymes.map((enzyme) => enzyme.name))
const sibOnlySkipped: string[] = []
const sibOnlyEnzymes: RestrictionEnzyme[] = []

for (const profile of Object.values(sibChart)) {
  if (nebNames.has(profile.catalogName)) continue
  if (sibOnlyEnzymes.some((enzyme) => enzyme.name === profile.catalogName)) continue

  const parsed = parseSibRecognition(profile.recognitionRaw)
  if (!parsed) {
    sibOnlySkipped.push(profile.sibName)
    continue
  }

  const draft = { name: profile.catalogName, ...parsed }
  sibOnlyEnzymes.push({
    ...draft,
    manufacturers: manufacturersForSibOnly(draft, profile),
    notes: notesFor(draft),
  })
}

sibOnlyEnzymes.sort((left, right) => left.name.localeCompare(right.name))

const thermoOnlySkipped: string[] = []
const thermoOnlyEnzymes: RestrictionEnzyme[] = []
const thermoProfilesByName = new Map<string, ThermoChartProfile>()

for (const profile of Object.values(thermoChart)) {
  if (!thermoProfilesByName.has(profile.thermoName)) {
    thermoProfilesByName.set(profile.thermoName, profile)
  }
}

for (const profile of thermoProfilesByName.values()) {
  const name = profile.thermoName
  if (nebNames.has(name) || sibOnlyEnzymes.some((enzyme) => enzyme.name === name)) continue
  if (thermoOnlyEnzymes.some((enzyme) => enzyme.name === name)) continue

  if (!profile.recognitionRaw) {
    thermoOnlySkipped.push(name)
    continue
  }

  const parsed = parseThermoRecognition(profile.recognitionRaw)
  if (!parsed) {
    thermoOnlySkipped.push(name)
    continue
  }

  const draft = { name, ...parsed }
  thermoOnlyEnzymes.push({
    ...draft,
    manufacturers: manufacturersForThermoOnly(draft, profile),
    notes: notesFor(draft),
  })
}

const usbOnlySkipped: string[] = []
const usbOnlyEnzymes: RestrictionEnzyme[] = []
const catalogNames = new Set([
  ...nebNames,
  ...sibOnlyEnzymes.map((enzyme) => enzyme.name),
  ...thermoOnlyEnzymes.map((enzyme) => enzyme.name),
])

for (const profile of Object.values(usbChart)) {
  if (catalogNames.has(profile.catalogName)) continue
  if (usbOnlyEnzymes.some((enzyme) => enzyme.name === profile.catalogName)) continue

  const parsed = parseUsbRecognition(profile.recognitionRaw, profile.description)
  if (!parsed) {
    usbOnlySkipped.push(profile.usbName)
    continue
  }

  const draft = { name: profile.catalogName, ...parsed }
  usbOnlyEnzymes.push({
    ...draft,
    manufacturers: manufacturersForUsbOnly(draft, profile),
    notes: notesFor(draft),
  })
  catalogNames.add(profile.catalogName)
}

usbOnlyEnzymes.sort((left, right) => left.name.localeCompare(right.name))

const vivantisOnlySkipped: string[] = []
const vivantisOnlyEnzymes: RestrictionEnzyme[] = []

for (const profile of Object.values(vivantisChart)) {
  if (catalogNames.has(profile.catalogName)) continue
  if (vivantisOnlyEnzymes.some((enzyme) => enzyme.name === profile.catalogName)) continue

  const parsed = parseVivantisRecognition(profile.recognitionRaw)
  if (!parsed) {
    vivantisOnlySkipped.push(profile.vivantisName)
    continue
  }

  const draft = { name: profile.catalogName, ...parsed }
  vivantisOnlyEnzymes.push({
    ...draft,
    manufacturers: manufacturersForVivantisOnly(draft, profile),
    notes: [...vivantisOnlyNotes(profile.catalogName, profile.alsoKnownAs, profile.catalogNotes ?? []), ...notesFor(draft)],
  })
  catalogNames.add(profile.catalogName)
}

vivantisOnlyEnzymes.sort((left, right) => left.name.localeCompare(right.name))

const rocheOnlySkipped: string[] = []
const rocheOnlyEnzymes: RestrictionEnzyme[] = []

for (const profile of Object.values(rocheChart)) {
  const enzymeName = profile.catalogName
  if (enzymeName === 'CellII') continue
  if (catalogNames.has(enzymeName)) continue
  if (rocheOnlyEnzymes.some((enzyme) => enzyme.name === enzymeName)) continue

  const notation = rocheNotationFor(enzymeName)
  if (!notation) {
    rocheOnlySkipped.push(profile.rocheName)
    continue
  }

  const parsed = parseNebRecognition(notation)
  const draft = { name: enzymeName, ...parsed }
  rocheOnlyEnzymes.push({
    ...draft,
    manufacturers: manufacturersForRocheOnly(draft, profile),
    notes: [...rocheOnlyNotes(enzymeName, profile.alsoKnownAs), ...notesFor(draft)],
  })
  catalogNames.add(enzymeName)
}

rocheOnlyEnzymes.sort((left, right) => left.name.localeCompare(right.name))

const takaraOnlySkipped: string[] = []
const takaraOnlyEnzymes: RestrictionEnzyme[] = []

for (const profile of Object.values(takaraChart)) {
  const enzymeName = profile.catalogName
  if (catalogNames.has(enzymeName)) continue
  if (takaraOnlyEnzymes.some((enzyme) => enzyme.name === enzymeName)) continue

  const notation = takaraNotationFor(enzymeName, profile.alsoKnownAs)
  if (!notation) {
    takaraOnlySkipped.push(profile.takaraName)
    continue
  }

  const parsed = parseNebRecognition(notation)
  const draft = { name: enzymeName, ...parsed }
  takaraOnlyEnzymes.push({
    ...draft,
    manufacturers: manufacturersForTakaraOnly(draft, profile),
    notes: [...takaraOnlyNotes(enzymeName, profile.alsoKnownAs), ...notesFor(draft)],
  })
  catalogNames.add(enzymeName)
}

takaraOnlyEnzymes.sort((left, right) => left.name.localeCompare(right.name))

const promegaOnlySkipped: string[] = []
const promegaOnlyEnzymes: RestrictionEnzyme[] = []

for (const profile of Object.values(promegaChart)) {
  const enzymeName = profile.catalogName
  if (catalogNames.has(enzymeName)) continue
  if (promegaOnlyEnzymes.some((enzyme) => enzyme.name === enzymeName)) continue

  const notation = promegaNotationFor(enzymeName, profile.alsoKnownAs)
  if (!notation) {
    promegaOnlySkipped.push(profile.promegaName)
    continue
  }

  const parsed = parseNebRecognition(notation)
  const draft = { name: enzymeName, ...parsed }
  promegaOnlyEnzymes.push({
    ...draft,
    manufacturers: manufacturersForPromegaOnly(draft, profile),
    notes: [...promegaOnlyNotes(enzymeName, profile.alsoKnownAs), ...notesFor(draft)],
  })
  catalogNames.add(enzymeName)
}

promegaOnlyEnzymes.sort((left, right) => left.name.localeCompare(right.name))

const eurxOnlySkipped: string[] = []
const eurxOnlyEnzymes: RestrictionEnzyme[] = []

for (const profile of Object.values(eurxChart)) {
  const enzymeName = profile.catalogName
  if (catalogNames.has(enzymeName)) continue
  if (eurxOnlyEnzymes.some((enzyme) => enzyme.name === enzymeName)) continue

  const notation = eurxNotationFor(enzymeName, profile.alsoKnownAs)
  if (!notation) {
    eurxOnlySkipped.push(profile.eurxName)
    continue
  }

  const parsed = parseNebRecognition(notation)
  const draft = { name: enzymeName, ...parsed }
  eurxOnlyEnzymes.push({
    ...draft,
    manufacturers: manufacturersForEurxOnly(draft, profile),
    notes: [...eurxOnlyNotes(enzymeName, profile.alsoKnownAs), ...notesFor(draft)],
  })
  catalogNames.add(enzymeName)
}

eurxOnlyEnzymes.sort((left, right) => left.name.localeCompare(right.name))

const enzymes = [
  ...nebEnzymes,
  ...sibOnlyEnzymes,
  ...thermoOnlyEnzymes,
  ...usbOnlyEnzymes,
  ...vivantisOnlyEnzymes,
  ...rocheOnlyEnzymes,
  ...takaraOnlyEnzymes,
  ...promegaOnlyEnzymes,
  ...eurxOnlyEnzymes,
].toSorted((left, right) => left.name.localeCompare(right.name))

const enzymesWithMethylation = attachMethylationRulesToCatalog(enzymes).map((enzyme) => ({
  ...enzyme,
  manufacturers: enzyme.manufacturers.map((manufacturer) => ({
    ...manufacturer,
    methylation: canonicalMethylationFor(enzyme),
  })),
}))

const outputPath = join(root, '../src/data/enzymes.json')
writeFileSync(outputPath, `${JSON.stringify(enzymesWithMethylation, null, 2)}\n`)
const thermoCount = enzymesWithMethylation.filter((enzyme) => enzyme.manufacturers.some((entry) => entry.id === 'thermo')).length
const sibCount = enzymesWithMethylation.filter((enzyme) => enzyme.manufacturers.some((entry) => entry.id === 'sibenzyme')).length
const usbCount = enzymesWithMethylation.filter((enzyme) => enzyme.manufacturers.some((entry) => entry.id === 'usb')).length
const vivantisCount = enzymesWithMethylation.filter((enzyme) => enzyme.manufacturers.some((entry) => entry.id === 'vivantis')).length
const rocheCount = enzymesWithMethylation.filter((enzyme) => enzyme.manufacturers.some((entry) => entry.id === 'roche')).length
const takaraCount = enzymesWithMethylation.filter((enzyme) => enzyme.manufacturers.some((entry) => entry.id === 'takara')).length
const promegaCount = enzymesWithMethylation.filter((enzyme) => enzyme.manufacturers.some((entry) => entry.id === 'promega')).length
const jenaCount = enzymesWithMethylation.filter((enzyme) => enzyme.manufacturers.some((entry) => entry.id === 'jena')).length
const eurxCount = enzymesWithMethylation.filter((enzyme) => enzyme.manufacturers.some((entry) => entry.id === 'eurx')).length
console.log(
  `Wrote ${enzymesWithMethylation.length} enzymes (${nebEnzymes.length} NEB, ${sibOnlyEnzymes.length} Sib-only, ${thermoOnlyEnzymes.length} Thermo-only, ${usbOnlyEnzymes.length} USB-only, ${vivantisOnlyEnzymes.length} Vivantis-only, ${rocheOnlyEnzymes.length} Roche-only, ${takaraOnlyEnzymes.length} TaKaRa-only, ${promegaOnlyEnzymes.length} Promega-only, ${eurxOnlyEnzymes.length} EURx-only, ${thermoCount} with Thermo, ${sibCount} with SibEnzyme, ${usbCount} with USB, ${vivantisCount} with Vivantis, ${rocheCount} with Roche, ${takaraCount} with TaKaRa, ${promegaCount} with Promega, ${jenaCount} with Jena, ${eurxCount} with EURx) to ${outputPath}`,
)
if (sibOnlySkipped.length) {
  console.log(`Skipped ${sibOnlySkipped.length} Sib enzymes with unparseable recognition: ${sibOnlySkipped.join(', ')}`)
}
if (thermoOnlySkipped.length) {
  console.log(
    `Skipped ${thermoOnlySkipped.length} Thermo enzymes with unparseable recognition: ${thermoOnlySkipped.join(', ')}`,
  )
}
if (usbOnlySkipped.length) {
  console.log(`Skipped ${usbOnlySkipped.length} USB-only enzymes with unparseable recognition: ${usbOnlySkipped.join(', ')}`)
}
if (vivantisOnlySkipped.length) {
  console.log(
    `Skipped ${vivantisOnlySkipped.length} Vivantis-only enzymes with unparseable recognition: ${vivantisOnlySkipped.join(', ')}`,
  )
}
if (rocheOnlySkipped.length) {
  console.log(
    `Skipped ${rocheOnlySkipped.length} Roche-only enzymes with unparseable recognition: ${rocheOnlySkipped.join(', ')}`,
  )
}
if (takaraOnlySkipped.length) {
  console.log(
    `Skipped ${takaraOnlySkipped.length} TaKaRa-only enzymes with unparseable recognition: ${takaraOnlySkipped.join(', ')}`,
  )
}
if (promegaOnlySkipped.length) {
  console.log(
    `Skipped ${promegaOnlySkipped.length} Promega-only enzymes with unparseable recognition: ${promegaOnlySkipped.join(', ')}`,
  )
}
if (eurxOnlySkipped.length) {
  console.log(`Skipped ${eurxOnlySkipped.length} EURx-only enzymes with unparseable recognition: ${eurxOnlySkipped.join(', ')}`)
}
