import { sanitizeProtein } from './sequence'
import type { ProteinDocumentData, SequenceFeature } from './types'

export type AminoAcidClass = 'nonpolar' | 'polar' | 'acidic' | 'basic' | 'special' | 'unknown'

export type AminoAcidInfo = {
  code: string
  threeLetter: string
  name: string
  className: AminoAcidClass
  averageResidueMass: number | null
}

export type ProteinCompositionEntry = {
  code: string
  threeLetter: string
  name: string
  count: number
  percent: number
}

export type ProteinProperties = {
  length: number
  averageMass: number | null
  monoisotopicMass: number | null
  extinctionCoefficient: number
  extinctionCoefficientReduced: number
  extinctionCoefficientOxidized: number
  absorbance: number | null
  absorbanceReduced: number | null
  absorbanceOxidized: number | null
  isoelectricPoint: number | null
  charge: number | null
  composition: ProteinCompositionEntry[]
}

const aminoAcids: Record<string, Omit<AminoAcidInfo, 'code'>> = {
  A: { threeLetter: 'Ala', name: 'Alanine', className: 'nonpolar', averageResidueMass: 71.0788 },
  R: { threeLetter: 'Arg', name: 'Arginine', className: 'basic', averageResidueMass: 156.1875 },
  N: { threeLetter: 'Asn', name: 'Asparagine', className: 'polar', averageResidueMass: 114.1038 },
  D: { threeLetter: 'Asp', name: 'Aspartic acid', className: 'acidic', averageResidueMass: 115.0886 },
  C: { threeLetter: 'Cys', name: 'Cysteine', className: 'special', averageResidueMass: 103.1388 },
  E: { threeLetter: 'Glu', name: 'Glutamic acid', className: 'acidic', averageResidueMass: 129.1155 },
  Q: { threeLetter: 'Gln', name: 'Glutamine', className: 'polar', averageResidueMass: 128.1307 },
  G: { threeLetter: 'Gly', name: 'Glycine', className: 'special', averageResidueMass: 57.0519 },
  H: { threeLetter: 'His', name: 'Histidine', className: 'basic', averageResidueMass: 137.1411 },
  I: { threeLetter: 'Ile', name: 'Isoleucine', className: 'nonpolar', averageResidueMass: 113.1594 },
  L: { threeLetter: 'Leu', name: 'Leucine', className: 'nonpolar', averageResidueMass: 113.1594 },
  K: { threeLetter: 'Lys', name: 'Lysine', className: 'basic', averageResidueMass: 128.1741 },
  M: { threeLetter: 'Met', name: 'Methionine', className: 'nonpolar', averageResidueMass: 131.1926 },
  F: { threeLetter: 'Phe', name: 'Phenylalanine', className: 'nonpolar', averageResidueMass: 147.1766 },
  P: { threeLetter: 'Pro', name: 'Proline', className: 'special', averageResidueMass: 97.1167 },
  S: { threeLetter: 'Ser', name: 'Serine', className: 'polar', averageResidueMass: 87.0782 },
  T: { threeLetter: 'Thr', name: 'Threonine', className: 'polar', averageResidueMass: 101.1051 },
  W: { threeLetter: 'Trp', name: 'Tryptophan', className: 'nonpolar', averageResidueMass: 186.2132 },
  Y: { threeLetter: 'Tyr', name: 'Tyrosine', className: 'polar', averageResidueMass: 163.1760 },
  V: { threeLetter: 'Val', name: 'Valine', className: 'nonpolar', averageResidueMass: 99.1326 },
  U: { threeLetter: 'Sec', name: 'Selenocysteine', className: 'special', averageResidueMass: 150.0388 },
  O: { threeLetter: 'Pyl', name: 'Pyrrolysine', className: 'basic', averageResidueMass: 237.3018 },
  B: { threeLetter: 'Asx', name: 'Aspartic acid or asparagine', className: 'unknown', averageResidueMass: null },
  Z: { threeLetter: 'Glx', name: 'Glutamic acid or glutamine', className: 'unknown', averageResidueMass: null },
  J: { threeLetter: 'Xle', name: 'Leucine or isoleucine', className: 'unknown', averageResidueMass: 113.1594 },
  X: { threeLetter: 'Xaa', name: 'Unknown residue', className: 'unknown', averageResidueMass: null },
  '*': { threeLetter: 'Ter', name: 'Stop', className: 'unknown', averageResidueMass: null },
}

const standardAminoAcidCodes = [...'ACDEFGHIKLMNPQRSTVWY']
const monoisotopicResidueMasses: Record<string, number> = {
  A: 71.037113805,
  R: 156.10111105,
  N: 114.04292747,
  D: 115.026943065,
  C: 103.009184505,
  E: 129.042593135,
  Q: 128.05857754,
  G: 57.021463735,
  H: 137.058911875,
  I: 113.084063975,
  L: 113.084063975,
  K: 128.094963015,
  M: 131.040484645,
  F: 147.068413945,
  P: 97.052763875,
  S: 87.032028435,
  T: 101.047678505,
  W: 186.07931298,
  Y: 163.063328575,
  V: 99.068413945,
}

const ionizationPka = {
  nTerm: 7.7,
  cTerm: 3.3,
  D: 3.5,
  E: 4.2,
  H: 6.6,
  C: 8.5,
  Y: 10.3,
  K: 10.5,
  R: 12.0,
} as const

export function aminoAcidInfo(code: string): AminoAcidInfo {
  const normalized = code.toUpperCase()
  const info = aminoAcids[normalized]
  return info
    ? { code: normalized, ...info }
    : { code: normalized, threeLetter: 'Xaa', name: 'Unknown residue', className: 'unknown', averageResidueMass: null }
}

export function proteinDisplayNumberAt(
  index: number,
  data?: ProteinDocumentData,
  features: readonly SequenceFeature[] = [],
): number {
  const numberedFeature = features.find((feature) =>
    Number.isFinite(feature.proteinNumberingStart)
      && feature.locations.some((location) => index >= location.start && index < location.end),
  )
  if (numberedFeature && numberedFeature.proteinNumberingStart !== undefined) {
    const orderedLocations = numberedFeature.locations.toSorted((left, right) => left.start - right.start)
    let offset = 0
    for (const location of orderedLocations) {
      if (index >= location.start && index < location.end) {
        return numberedFeature.proteinNumberingStart + offset + index - location.start
      }
      offset += location.end - location.start
    }
  }
  const region = data?.numberingRegions.find(
    (candidate) => index >= candidate.sequenceStart && index < candidate.sequenceEnd,
  )
  if (region) return region.startAt + index - region.sequenceStart
  return (data?.numberingStart ?? 1) + index
}

export type ProteinRulerMark = {
  index: number
  offset: number
  number: number
  major: boolean
}

/** One ruler tick per residue, with numbered major ticks every five display residues. */
export function proteinRulerMarks(
  rowStart: number,
  rowLength: number,
  data?: ProteinDocumentData,
  features: readonly SequenceFeature[] = [],
): ProteinRulerMark[] {
  return Array.from({ length: Math.max(0, rowLength) }, (_, offset) => {
    const index = rowStart + offset
    const number = proteinDisplayNumberAt(index, data, features)
    return { index, offset, number, major: number % 5 === 0 }
  })
}

/** Number of fixed-width residue cells that fit between the two row-number gutters. */
export function proteinResiduesPerRow(
  contentWidth: number,
  fontSize: number,
  minimum = 10,
  maximum = 200,
  cellWidthEm = 1.35,
  gutterPx = 120,
): number {
  const residueWidth = Math.max(1, fontSize) * Math.max(0.8, cellWidthEm)
  const availableWidth = Math.max(0, contentWidth - gutterPx)
  return Math.max(minimum, Math.min(maximum, Math.floor(availableWidth / residueWidth)))
}

export function findProteinMotifs(sequence: string, query: string): number[] {
  const needle = sanitizeProtein(query).toUpperCase()
  if (!needle) return []
  const haystack = sequence.toUpperCase()
  const hits: number[] = []
  let start = 0
  while (start <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, start)
    if (index < 0) break
    hits.push(index)
    start = index + 1
  }
  return hits
}

export function proteinMolecularWeight(sequence: string): number | null {
  const residues = sanitizeProtein(sequence).toUpperCase().replace(/\*/g, '')
  if (!residues) return 0
  let mass = 18.01528
  for (const residue of residues) {
    const residueMass = aminoAcidInfo(residue).averageResidueMass
    if (residueMass == null) return null
    mass += residueMass
  }
  return mass
}

export function proteinMonoisotopicMass(sequence: string): number | null {
  const residues = sanitizeProtein(sequence).toUpperCase().replace(/\*/g, '')
  if (!residues) return 0
  let mass = 18.010564684
  for (const residue of residues) {
    const residueMass = monoisotopicResidueMasses[residue]
    if (residueMass == null) return null
    mass += residueMass
  }
  return mass
}

export function proteinChargeAtPh(sequence: string, ph: number): number | null {
  const residues = sanitizeProtein(sequence).toUpperCase().replace(/\*/g, '')
  if (!residues || !Number.isFinite(ph)) return null
  const counts = new Map<string, number>()
  for (const residue of residues) counts.set(residue, (counts.get(residue) ?? 0) + 1)
  const positiveFraction = (pka: number) => 1 / (1 + 10 ** (ph - pka))
  const negativeFraction = (pka: number) => 1 / (1 + 10 ** (pka - ph))
  return positiveFraction(ionizationPka.nTerm)
    + (counts.get('H') ?? 0) * positiveFraction(ionizationPka.H)
    + (counts.get('K') ?? 0) * positiveFraction(ionizationPka.K)
    + (counts.get('R') ?? 0) * positiveFraction(ionizationPka.R)
    - negativeFraction(ionizationPka.cTerm)
    - (counts.get('D') ?? 0) * negativeFraction(ionizationPka.D)
    - (counts.get('E') ?? 0) * negativeFraction(ionizationPka.E)
    - (counts.get('C') ?? 0) * negativeFraction(ionizationPka.C)
    - (counts.get('Y') ?? 0) * negativeFraction(ionizationPka.Y)
}

export function proteinIsoelectricPoint(sequence: string): number | null {
  if (!sanitizeProtein(sequence).replace(/\*/g, '')) return null
  let low = 0
  let high = 14
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const midpoint = (low + high) / 2
    const charge = proteinChargeAtPh(sequence, midpoint) ?? 0
    if (charge > 0) low = midpoint
    else high = midpoint
  }
  return (low + high) / 2
}

export function calculateProteinProperties(
  sequence: string,
  options: { ph?: number; knownDisulfideCysteines?: number } = {},
): ProteinProperties {
  const residues = sanitizeProtein(sequence).toUpperCase().replace(/\*/g, '')
  const averageMass = proteinMolecularWeight(residues)
  const monoisotopicMass = proteinMonoisotopicMass(residues)
  const counts = new Map<string, number>()
  for (const residue of residues) counts.set(residue, (counts.get(residue) ?? 0) + 1)
  const baseExtinction = (counts.get('W') ?? 0) * 5500 + (counts.get('Y') ?? 0) * 1490
  const cysteineCount = counts.get('C') ?? 0
  const knownDisulfideCysteines = Math.max(
    0,
    Math.min(cysteineCount, Math.trunc(options.knownDisulfideCysteines ?? 0)),
  )
  const extinctionCoefficientReduced = baseExtinction
  const extinctionCoefficient = baseExtinction + knownDisulfideCysteines * 62.5
  const extinctionCoefficientOxidized = baseExtinction + cysteineCount * 62.5
  const absorbanceFor = (coefficient: number) => averageMass && averageMass > 0
    ? coefficient / averageMass
    : null
  const compositionCodes = [
    ...standardAminoAcidCodes,
    ...[...counts.keys()].filter((code) => !standardAminoAcidCodes.includes(code)).sort(),
  ]
  const composition = compositionCodes.map((code) => {
    const info = aminoAcidInfo(code)
    const count = counts.get(code) ?? 0
    return {
      code,
      threeLetter: info.threeLetter,
      name: info.name,
      count,
      percent: residues.length ? count / residues.length * 100 : 0,
    }
  })
  return {
    length: residues.length,
    averageMass,
    monoisotopicMass,
    extinctionCoefficient,
    extinctionCoefficientReduced,
    extinctionCoefficientOxidized,
    absorbance: absorbanceFor(extinctionCoefficient),
    absorbanceReduced: absorbanceFor(extinctionCoefficientReduced),
    absorbanceOxidized: absorbanceFor(extinctionCoefficientOxidized),
    isoelectricPoint: proteinIsoelectricPoint(residues),
    charge: proteinChargeAtPh(residues, options.ph ?? 7),
    composition,
  }
}

export function formatProteinMass(sequence: string): string {
  const mass = proteinMolecularWeight(sequence)
  if (mass == null) return 'Unknown'
  return mass >= 1000 ? `${(mass / 1000).toFixed(2)} kDa` : `${mass.toFixed(1)} Da`
}

export function proteinComposition(sequence: string): Array<{ code: string; count: number; fraction: number }> {
  const residues = sanitizeProtein(sequence).toUpperCase().replace(/\*/g, '')
  const counts = new Map<string, number>()
  for (const residue of residues) counts.set(residue, (counts.get(residue) ?? 0) + 1)
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count, fraction: residues.length ? count / residues.length : 0 }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))
}
