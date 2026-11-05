import { enzymes } from './enzymes'
import { manufacturerLabel, manufacturerShortLabel } from './enzymePreferences'
import {
  vivantisBufferColumns,
  vivantisBufferPanelTitle,
} from './vivantisBuffer'
import { reverseComplement } from './sequence'
import type {
  EnzymeBufferCode,
  EnzymeBufferSystem,
  EnzymeManufacturer,
  EnzymeManufacturerId,
  RestrictionEnzyme,
  SibBufferCode,
  ThermoBufferCode,
  UsbBufferCode,
  VivantisBufferCode,
  RocheBufferCode,
  TakaraBufferCode,
  PromegaBufferCode,
  JenaBufferCode,
  EurxBufferCode,
} from './types'

export type {
  EnzymeBufferCode,
  EnzymeBufferSystem,
  SibBufferCode,
  ThermoBufferCode,
  UsbBufferCode,
  VivantisBufferCode,
  RocheBufferCode,
  TakaraBufferCode,
  PromegaBufferCode,
  JenaBufferCode,
  EurxBufferCode,
} from './types'

export type EnzymeManufacturerProfile = {
  id: EnzymeManufacturer['id']
  name: string
  bufferSystem: EnzymeBufferSystem
  bufferLabel: string
  preferredBuffer: EnzymeBufferCode
  bufferColumns: EnzymeBufferCode[]
  incubationC: number
  suppliedBuffer?: string | null
  enzymeSpecificBuffer?: string | null
  bufferActivity: Record<EnzymeBufferCode, string>
  heatInactivation?: string | null
  diluent?: string | null
  unitSubstrate?: string | null
  bsa?: string | null
  tango2x?: string | null
  doubleDigest?: string | null
  methylation: EnzymeManufacturer['methylation']
  websiteUrl: string
  tips: string[]
}

export type RelatedEnzymeEntry = {
  enzyme: RestrictionEnzyme
  sameCutSite: boolean
  incubationC: number
}

export type RelatedEnzymeGroup = {
  title: string
  entries: RelatedEnzymeEntry[]
}

export const dnaLetterCodes = [
  { code: 'B', meaning: 'C or G or T' },
  { code: 'D', meaning: 'A or G or T' },
  { code: 'H', meaning: 'A or C or T' },
  { code: 'K', meaning: 'G or T' },
  { code: 'M', meaning: 'A or C' },
  { code: 'N', meaning: 'A or C or G or T' },
  { code: 'R', meaning: 'Pu = A or G' },
  { code: 'S', meaning: 'C or G' },
  { code: 'V', meaning: 'A or C or G' },
  { code: 'W', meaning: 'A or T' },
  { code: 'Y', meaning: 'Py = C or T' },
] as const

export const proteinLetterCodes = [
  { code: 'A', meaning: 'Ala = Alanine' },
  { code: 'C', meaning: 'Cys = Cysteine' },
  { code: 'D', meaning: 'Asp = Aspartic Acid' },
  { code: 'E', meaning: 'Glu = Glutamic Acid' },
  { code: 'F', meaning: 'Phe = Phenylalanine' },
  { code: 'G', meaning: 'Gly = Glycine' },
  { code: 'H', meaning: 'His = Histidine' },
  { code: 'I', meaning: 'Ile = Isoleucine' },
  { code: 'K', meaning: 'Lys = Lysine' },
  { code: 'L', meaning: 'Leu = Leucine' },
  { code: 'M', meaning: 'Met = Methionine' },
  { code: 'N', meaning: 'Asn = Asparagine' },
  { code: 'P', meaning: 'Pro = Proline' },
  { code: 'Q', meaning: 'Gln = Glutamine' },
  { code: 'R', meaning: 'Arg = Arginine' },
  { code: 'S', meaning: 'Ser = Serine' },
  { code: 'T', meaning: 'Thr = Threonine' },
  { code: 'V', meaning: 'Val = Valine' },
  { code: 'W', meaning: 'Trp = Tryptophan' },
  { code: 'Y', meaning: 'Tyr = Tyrosine' },
] as const

const enzymeByName = new Map(enzymes.map((enzyme) => [enzyme.name, enzyme]))
const complementBase: Record<string, string> = {
  A: 'T',
  C: 'G',
  G: 'C',
  T: 'A',
  R: 'Y',
  Y: 'R',
  S: 'S',
  W: 'W',
  K: 'M',
  M: 'K',
  B: 'V',
  D: 'H',
  H: 'D',
  V: 'B',
  N: 'N',
}

export function nebBufferLabel(buffer: EnzymeBufferCode) {
  if (buffer === 'r1.1') return 'NEBuffer r1.1'
  if (buffer === 'r2.1') return 'NEBuffer r2.1'
  if (buffer === 'r3.1') return 'NEBuffer r3.1'
  return 'rCutSmart Buffer'
}

export function thermoBufferLabel(buffer: ThermoBufferCode) {
  if (buffer === 'b') return 'Buffer B (blue)'
  if (buffer === 'g') return 'Buffer G (green)'
  if (buffer === 'o') return 'Buffer O (orange)'
  if (buffer === 'r') return 'Buffer R (red)'
  return 'Tango Buffer (yellow)'
}

export function sibBufferLabel(buffer: SibBufferCode) {
  if (buffer === 'b') return 'SE Buffer B (blue)'
  if (buffer === 'g') return 'SE Buffer G (green)'
  if (buffer === 'o') return 'SE Buffer O (orange)'
  if (buffer === 'w') return 'SE Buffer W (white)'
  if (buffer === 'y') return 'SE Buffer Y (yellow)'
  return 'ROSE Buffer'
}

export function usbBufferLabel(buffer: UsbBufferCode) {
  return `USB Buffer ${buffer.toUpperCase()}`
}

export function vivantisBufferLabel(buffer: VivantisBufferCode) {
  if (buffer === 'ub05') return '0.5× Buffer UB'
  if (buffer === 'ub') return '1.0× Buffer UB'
  if (buffer === 'ub15') return '1.5× Buffer UB'
  if (buffer === 'ub2') return '2.0× Buffer UB'
  if (buffer === 'specific') return 'Enzyme-specific buffer'
  return `Buffer ${buffer.toUpperCase()}`
}

export function rocheBufferLabel(buffer: RocheBufferCode) {
  return `SuRE/Cut Buffer ${buffer.toUpperCase()}`
}

export function takaraBufferLabel(buffer: TakaraBufferCode) {
  if (buffer === 'basal') return 'Basal buffer'
  if (buffer === 't') return 'Universal Buffer T + BSA'
  return `Universal Buffer ${buffer.toUpperCase()}`
}

export function promegaBufferLabel(buffer: PromegaBufferCode) {
  if (buffer === 'multicore') return 'MULTI-CORE™ Buffer'
  return `Buffer ${buffer.toUpperCase()}`
}

export function jenaBufferLabel(buffer: JenaBufferCode) {
  if (buffer === 'ub') return 'Universal Buffer (UB)'
  if (buffer === 'ub05') return '0.5× Universal Buffer (UB)'
  if (buffer === 'ub2') return '2× Universal Buffer (UB)'
  return `Buffer B${buffer.slice(1)}`
}

export function eurxBufferLabel(buffer: EurxBufferCode) {
  if (buffer === 'one') return 'ONE Buffer'
  if (buffer === 'cviJI') return 'CviJI Buffer'
  if (buffer === 'cviJIStar') return 'CviJI(*) Buffer'
  if (buffer === 'tspGWI') return 'TspGWI Buffer'
  if (buffer === 'tspDTI') return 'TspDTI Buffer'
  if (buffer === 'sau3AI') return 'Sau3AI Buffer'
  return 'Specific buffer'
}

const nebBufferColumns: EnzymeBufferCode[] = ['r1.1', 'r2.1', 'r3.1', 'cutSmart']
const thermoBufferColumns: ThermoBufferCode[] = ['b', 'g', 'o', 'r', 'tango']
const sibBufferColumns: SibBufferCode[] = ['b', 'g', 'o', 'w', 'y', 'rose']
const usbBufferColumns: UsbBufferCode[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'k', 'l']
const rocheBufferColumns: RocheBufferCode[] = ['a', 'b', 'l', 'm', 'h']
const takaraBufferColumns: TakaraBufferCode[] = ['l', 'm', 'h', 'k', 't', 'basal']
const promegaBufferColumns: PromegaBufferCode[] = ['a', 'b', 'c', 'd', 'e', 'h', 'multicore']
const jenaBufferColumns: JenaBufferCode[] = ['b1', 'b2', 'b3', 'b4', 'b5', 'ub']
const eurxBufferColumns: EurxBufferCode[] = ['one', 'specific']

function bufferLabelFor(system: EnzymeBufferSystem, buffer: EnzymeBufferCode) {
  if (system === 'thermo') return thermoBufferLabel(buffer as ThermoBufferCode)
  if (system === 'sibenzyme') return sibBufferLabel(buffer as SibBufferCode)
  if (system === 'usb') return usbBufferLabel(buffer as UsbBufferCode)
  if (system === 'vivantis') return vivantisBufferLabel(buffer as VivantisBufferCode)
  if (system === 'roche') return rocheBufferLabel(buffer as RocheBufferCode)
  if (system === 'takara') return takaraBufferLabel(buffer as TakaraBufferCode)
  if (system === 'promega') return promegaBufferLabel(buffer as PromegaBufferCode)
  if (system === 'jena') return jenaBufferLabel(buffer as JenaBufferCode)
  if (system === 'eurx') return eurxBufferLabel(buffer as EurxBufferCode)
  return nebBufferLabel(buffer)
}

function bufferColumnsForSystem(system: EnzymeBufferSystem): EnzymeBufferCode[] {
  if (system === 'thermo') return thermoBufferColumns
  if (system === 'sibenzyme') return sibBufferColumns
  if (system === 'usb') return usbBufferColumns
  if (system === 'vivantis') return vivantisBufferColumns
  if (system === 'roche') return rocheBufferColumns
  if (system === 'takara') return takaraBufferColumns
  if (system === 'promega') return promegaBufferColumns
  if (system === 'jena') return jenaBufferColumns
  if (system === 'eurx') return eurxBufferColumns
  return nebBufferColumns
}

function bufferColumnsFor(manufacturer: EnzymeManufacturer) {
  return bufferColumnsForSystem(manufacturer.bufferSystem)
}

export function getEnzymeByName(name: string) {
  return enzymeByName.get(name) ?? null
}

export function listCatalogEnzymeNames() {
  return enzymes.map((enzyme) => enzyme.name)
}

export const catalogManufacturerOrder: EnzymeManufacturerId[] = [
  'neb',
  'thermo',
  'sibenzyme',
  'usb',
  'vivantis',
  'roche',
  'takara',
  'promega',
  'jena',
  'eurx',
]

export function catalogBufferColumns(id: EnzymeManufacturerId): EnzymeBufferCode[] {
  return bufferColumnsForSystem(id)
}

export function catalogBufferLabel(id: EnzymeManufacturerId, buffer: EnzymeBufferCode) {
  return bufferLabelFor(id, buffer)
}

export { manufacturerShortLabel }

export function listCatalogManufacturerIds(): EnzymeManufacturerId[] {
  const present = new Set<EnzymeManufacturerId>()
  for (const enzyme of enzymes) {
    for (const manufacturer of enzyme.manufacturers) {
      present.add(manufacturer.id)
    }
  }
  return catalogManufacturerOrder.filter((id) => present.has(id))
}

export function listCatalogManufacturerOptions() {
  return listCatalogManufacturerIds().map((id) => ({ id, name: manufacturerLabel(id) }))
}

export function filterCatalogEnzymeNames(query: string, manufacturerId: EnzymeManufacturerId | 'all' = 'all') {
  const normalized = query.trim().toLowerCase()
  let names = listCatalogEnzymeNames()
  if (manufacturerId !== 'all') {
    names = names.filter((name) => {
      const enzyme = getEnzymeByName(name)
      return enzyme?.manufacturers.some((entry) => entry.id === manufacturerId) ?? false
    })
  }
  if (!normalized) return names
  return names.filter((name) => name.toLowerCase().includes(normalized))
}

function formatBufferActivity(
  value: number | string | null | undefined,
  preferred: boolean,
  system: EnzymeBufferSystem,
) {
  if (value === 100 && preferred) return '100%'
  if (value === null || value === undefined || value === '') {
    return system === 'neb' ? 'NEB chart' : '—'
  }
  if (typeof value === 'string') {
    const star = value.endsWith('*') ? '*' : ''
    const base = star ? value.slice(0, -1) : value
    if (base.startsWith('NR')) return base
    if (base.includes('-') || base.startsWith('<')) return `${base}${star}`
    return `${base}%${star}`
  }
  return `${value}%`
}

function manufacturerProfile(enzyme: RestrictionEnzyme, manufacturer: EnzymeManufacturer): EnzymeManufacturerProfile {
  const bufferColumns = bufferColumnsFor(manufacturer)
  const tablePreferred = manufacturer.preferredBuffer === 'specific' ? null : manufacturer.preferredBuffer
  const bufferActivity = Object.fromEntries(
    bufferColumns.map((buffer) => [
      buffer,
      formatBufferActivity(
        manufacturer.bufferActivity[buffer],
        tablePreferred === buffer,
        manufacturer.bufferSystem,
      ),
    ]),
  ) as Record<EnzymeBufferCode, string>

  return {
    id: manufacturer.id,
    name: manufacturer.name,
    bufferSystem: manufacturer.bufferSystem,
    bufferLabel:
      manufacturer.bufferSystem === 'vivantis'
        ? vivantisBufferPanelTitle(enzyme.name, manufacturer.preferredBuffer, manufacturer.enzymeSpecificBuffer)
        : `${enzyme.name} Buffer: ${
            manufacturer.suppliedBuffer ?? bufferLabelFor(manufacturer.bufferSystem, manufacturer.preferredBuffer)
          }`,
    preferredBuffer: manufacturer.preferredBuffer,
    bufferColumns,
    incubationC: manufacturer.incubationC,
    suppliedBuffer: manufacturer.suppliedBuffer,
    enzymeSpecificBuffer: manufacturer.enzymeSpecificBuffer ?? null,
    bufferActivity,
    heatInactivation: manufacturer.heatInactivation,
    diluent: manufacturer.diluent,
    unitSubstrate: manufacturer.unitSubstrate,
    bsa: manufacturer.bsa,
    tango2x: manufacturer.tango2x,
    doubleDigest: manufacturer.doubleDigest,
    methylation: manufacturer.methylation,
    websiteUrl: manufacturer.productUrl,
    tips: [...(manufacturer.catalogNotes ?? []), ...enzyme.notes],
  }
}

export function manufacturersForEnzyme(enzyme: RestrictionEnzyme): EnzymeManufacturerProfile[] {
  return enzyme.manufacturers.map((manufacturer) => manufacturerProfile(enzyme, manufacturer))
}

export function formatOverhangType(enzyme: RestrictionEnzyme) {
  if (enzyme.overhang.type === 'blunt') return 'Blunt'
  return enzyme.overhang.type
}

export function overhangDescription(enzyme: RestrictionEnzyme) {
  if (enzyme.overhang.type === 'blunt') return 'blunt'
  return `${enzyme.overhang.type} ${enzyme.overhang.length} nt`
}

export function palindromeLengthBp(enzyme: RestrictionEnzyme) {
  const recognition = enzyme.recognition
  const concrete = recognition.replace(/[^ACGT]/g, 'N')
  if (concrete.length === recognition.length && concrete === reverseComplement(concrete)) {
    return recognition.length
  }
  return recognition.length
}

export type RecognitionSegment = {
  kind: 'recognition' | 'spacer'
  text: string
  rangeStart: number
  rangeEnd: number
  role?: 'overhang'
}

export type RecognitionRowDisplay = {
  segments: RecognitionSegment[]
  /** Primary cut for this strand (distal when the enzyme cuts on both sides). */
  cutBoundary: number | null
  /** All cut positions on this strand (proximal + distal for dual cutters). */
  cutBoundaries: number[]
  cutColumn: number | null
  columnCount: number
  rangeStart: number
  rangeEnd: number
}

export type RecognitionDisplay = {
  top: RecognitionRowDisplay
  bottom: RecognitionRowDisplay
  topCutLabel: string
  bottomCutLabel: string
}

function formatCutBoundary(cut: number, recognitionLength: number, strand: 'top' | 'bottom') {
  const strandLabel = strand === 'top' ? 'Top strand' : 'Bottom strand'
  if (cut >= 0 && cut <= recognitionLength) {
    if (cut === 0) return `${strandLabel}: before recognition base 1`
    if (cut === recognitionLength) return `${strandLabel}: after recognition base ${recognitionLength}`
    return `${strandLabel}: between bases ${cut} and ${cut + 1}`
  }
  const direction = cut < 0 ? 'upstream' : 'downstream'
  const distance = cut < 0 ? Math.abs(cut) : cut - recognitionLength
  return `${strandLabel}: ${distance} bp ${direction} of recognition sequence`
}

function baseAt(enzyme: RestrictionEnzyme, position: number, strand: 'top' | 'bottom') {
  const recognitionLength = enzyme.recognition.length
  if (position >= 0 && position < recognitionLength) {
    const base = enzyme.recognition[position]!
    return strand === 'top' ? base : (complementBase[base] ?? 'N')
  }
  return 'N'
}

function enzymeCutPairs(enzyme: RestrictionEnzyme) {
  const pairs = [{ top: enzyme.cutTop, bottom: enzyme.cutBottom }]
  if (enzyme.upstreamCutTop != null && enzyme.upstreamCutBottom != null) {
    pairs.unshift({ top: enzyme.upstreamCutTop, bottom: enzyme.upstreamCutBottom })
  }
  return pairs
}

function allCutPositions(enzyme: RestrictionEnzyme) {
  return enzymeCutPairs(enzyme).flatMap((pair) => [pair.top, pair.bottom])
}

function recognitionRange(enzyme: RestrictionEnzyme) {
  const recognitionLength = enzyme.recognition.length
  const cuts = allCutPositions(enzyme)
  const minCut = Math.min(...cuts)
  const maxCut = Math.max(...cuts)
  const rangeStart = Math.min(0, minCut) - (minCut < 0 ? 1 : 0)
  const rangeEnd = Math.max(recognitionLength, maxCut) + (maxCut > recognitionLength ? 1 : 0)
  return { rangeStart, rangeEnd }
}

function buildRecognitionRow(
  enzyme: RestrictionEnzyme,
  strand: 'top' | 'bottom',
  rangeStart: number,
  rangeEnd: number,
): RecognitionRowDisplay {
  const recognitionLength = enzyme.recognition.length
  const pairs = enzymeCutPairs(enzyme)
  const strandCuts = pairs.map((pair) => (strand === 'top' ? pair.top : pair.bottom))
  const primaryCut = strandCuts[strandCuts.length - 1]!
  const segments: RecognitionSegment[] = []
  const cutPositions = allCutPositions(enzyme)
  const boundaries = [...new Set([rangeStart, rangeEnd, 0, recognitionLength, ...cutPositions])]
    .filter((boundary) => boundary >= rangeStart && boundary <= rangeEnd)
    .toSorted((left, right) => left - right)

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const position = boundaries[index]!
    const end = boundaries[index + 1]!
    if (position === end) continue
    const kind = position >= 0 && end <= recognitionLength ? 'recognition' : 'spacer'
    const role =
      kind === 'spacer' &&
      pairs.some((pair) => {
        const overhangStart = Math.min(pair.top, pair.bottom)
        const overhangEnd = Math.max(pair.top, pair.bottom)
        return position >= overhangStart && end <= overhangEnd
      })
        ? 'overhang'
        : undefined

    if (kind === 'spacer') {
      const segment: RecognitionSegment = {
        kind,
        text: '',
        rangeStart: position,
        rangeEnd: end,
      }
      if (role) segment.role = role
      segments.push(segment)
    } else {
      let text = ''
      for (let index = position; index < end; index += 1) {
        text += baseAt(enzyme, index, strand)
      }
      segments.push({ kind, text, rangeStart: position, rangeEnd: end })
    }
  }

  const cutBoundaries = strandCuts.filter((cut) => cut >= rangeStart && cut <= rangeEnd)
  const cutBoundary = cutBoundaries.includes(primaryCut)
    ? primaryCut
    : (cutBoundaries[cutBoundaries.length - 1] ?? null)
  const columnCount = rangeEnd - rangeStart
  const cutColumn = cutBoundary === null ? null : cutBoundary - rangeStart
  return { segments, cutBoundary, cutBoundaries, cutColumn, columnCount, rangeStart, rangeEnd }
}

export function recognitionDisplayFor(enzyme: RestrictionEnzyme): RecognitionDisplay {
  const recognitionLength = enzyme.recognition.length
  const { rangeStart, rangeEnd } = recognitionRange(enzyme)
  return {
    top: buildRecognitionRow(enzyme, 'top', rangeStart, rangeEnd),
    bottom: buildRecognitionRow(enzyme, 'bottom', rangeStart, rangeEnd),
    topCutLabel: formatCutBoundary(enzyme.cutTop, recognitionLength, 'top'),
    bottomCutLabel: formatCutBoundary(enzyme.cutBottom, recognitionLength, 'bottom'),
  }
}

function cutSignature(enzyme: RestrictionEnzyme) {
  return `${enzyme.cutTop}:${enzyme.cutBottom}`
}

export function enzymesSameRecognitionAndCut(left: RestrictionEnzyme, right: RestrictionEnzyme) {
  return (
    left.cutTop === right.cutTop &&
    left.cutBottom === right.cutBottom &&
    iupacPatternsAlwaysCompatible(left.recognition, right.recognition)
  )
}

const iupacBases: Record<string, readonly string[]> = {
  A: ['A'],
  C: ['C'],
  G: ['G'],
  T: ['T'],
  R: ['A', 'G'],
  Y: ['C', 'T'],
  S: ['G', 'C'],
  W: ['A', 'T'],
  K: ['G', 'T'],
  M: ['A', 'C'],
  B: ['C', 'G', 'T'],
  D: ['A', 'G', 'T'],
  H: ['A', 'C', 'T'],
  V: ['A', 'C', 'G'],
  N: ['A', 'C', 'G', 'T'],
}

type OverhangPattern = {
  type: 'blunt' | '5' | '3'
  pattern: string
}

function overhangPattern(enzyme: RestrictionEnzyme): OverhangPattern {
  if (enzyme.cutTop === enzyme.cutBottom) return { type: 'blunt', pattern: '' }
  const recognition = enzyme.recognition
  if (enzyme.cutTop < enzyme.cutBottom) {
    return { type: '5', pattern: recognition.slice(enzyme.cutTop, enzyme.cutBottom) }
  }
  return { type: '3', pattern: recognition.slice(enzyme.cutBottom, enzyme.cutTop) }
}

function baseSetFor(code: string) {
  return iupacBases[code] ?? (code.length === 1 ? [code] : [])
}

function baseSetsEqual(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((base) => rightSet.has(base)) && right.every((base) => new Set(left).has(base))
}

function baseSetsIntersect(left: readonly string[], right: readonly string[]) {
  const rightSet = new Set(right)
  return left.some((base) => rightSet.has(base))
}

function overhangPatternsAlwaysCompatible(left: string, right: string) {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (!baseSetsEqual(baseSetFor(left[index]!), baseSetFor(right[index]!))) return false
  }
  return true
}

function overhangPatternsSometimesCompatible(left: string, right: string) {
  if (left.length !== right.length) return false
  if (overhangPatternsAlwaysCompatible(left, right)) return false
  for (let index = 0; index < left.length; index += 1) {
    if (!baseSetsIntersect(baseSetFor(left[index]!), baseSetFor(right[index]!))) return false
  }
  return true
}

function iupacPatternsAlwaysCompatible(left: string, right: string) {
  return overhangPatternsAlwaysCompatible(left, right)
}

function overhangPatternsCompatible(reference: OverhangPattern, candidate: OverhangPattern) {
  if (reference.type !== candidate.type) return null
  if (reference.type === 'blunt') return 'always'
  if (overhangPatternsAlwaysCompatible(reference.pattern, candidate.pattern)) return 'always'
  if (overhangPatternsSometimesCompatible(reference.pattern, candidate.pattern)) return 'sometimes'
  return null
}

function incubationFor(enzyme: RestrictionEnzyme) {
  return enzyme.manufacturers[0]?.incubationC ?? 37
}

function relatedEntry(enzyme: RestrictionEnzyme, sameCutSite: boolean): RelatedEnzymeEntry {
  return {
    enzyme,
    sameCutSite,
    incubationC: incubationFor(enzyme),
  }
}

export function sameRecognitionGroups(reference: RestrictionEnzyme): RelatedEnzymeGroup[] {
  const referenceRecognition = reference.recognition
  const sameCut: RelatedEnzymeEntry[] = []
  const differentCut: RelatedEnzymeEntry[] = []

  for (const enzyme of enzymes) {
    if (enzyme.name === reference.name) continue
    if (!iupacPatternsAlwaysCompatible(referenceRecognition, enzyme.recognition)) continue

    const sameCutSite = cutSignature(enzyme) === cutSignature(reference)
    const entry = relatedEntry(enzyme, sameCutSite)
    if (sameCutSite) sameCut.push(entry)
    else differentCut.push(entry)
  }

  const groups: RelatedEnzymeGroup[] = []
  if (sameCut.length) {
    groups.push({
      title: 'Same Cut Site (different enzyme — use its own buffer data)',
      entries: sameCut.toSorted((left, right) => left.enzyme.name.localeCompare(right.enzyme.name)),
    })
  }
  if (differentCut.length) {
    groups.push({
      title: 'Same Recognition, Different Cut Site',
      entries: differentCut.toSorted((left, right) => left.enzyme.name.localeCompare(right.enzyme.name)),
    })
  }
  return groups
}

export function compatibleStickyEndGroups(reference: RestrictionEnzyme): RelatedEnzymeGroup[] {
  const referenceOverhang = overhangPattern(reference)
  const alwaysCompatible: RelatedEnzymeEntry[] = []
  const sometimesCompatible: RelatedEnzymeEntry[] = []

  for (const enzyme of enzymes) {
    if (enzyme.name === reference.name) continue
    const compatibility = overhangPatternsCompatible(referenceOverhang, overhangPattern(enzyme))
    if (compatibility === 'always') {
      alwaysCompatible.push(relatedEntry(enzyme, cutSignature(enzyme) === cutSignature(reference)))
    } else if (compatibility === 'sometimes') {
      sometimesCompatible.push(relatedEntry(enzyme, cutSignature(enzyme) === cutSignature(reference)))
    }
  }

  const groups: RelatedEnzymeGroup[] = []
  if (alwaysCompatible.length) {
    groups.push({
      title: referenceOverhang.type === 'blunt' ? 'Blunt Ends' : 'Always Compatible',
      entries: alwaysCompatible.toSorted((left, right) => left.enzyme.name.localeCompare(right.enzyme.name)),
    })
  }
  if (sometimesCompatible.length) {
    groups.push({
      title: 'Sometimes Compatible',
      entries: sometimesCompatible.toSorted((left, right) => left.enzyme.name.localeCompare(right.enzyme.name)),
    })
  }
  return groups
}

export function relatedEnzymeCount(groups: RelatedEnzymeGroup[]) {
  return groups.reduce((count, group) => count + group.entries.length, 0)
}
