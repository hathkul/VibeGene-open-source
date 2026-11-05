import type { ImmunoglobulinNumbering } from './immunoglobulinNumbering'
import { createId } from './sequence'
import type { ProteinBond, SequenceFeature } from './types'

export const AUTOMATIC_IMMUNOGLOBULIN_ANNOTATION_PREFIX = 'VibeGene automatic immunoglobulin annotation:'

type RegionName = 'FR1' | 'CDR1' | 'FR2' | 'CDR2' | 'FR3' | 'CDR3' | 'FR4'

type RegionDefinition = {
  name: RegionName
  start: number
  end: number
  color: string
}

export type ImmunoglobulinAnnotationPlan = {
  features: SequenceFeature[]
  bonds: ProteinBond[]
  missingCanonicalBond: boolean
  predictedAdditionalBond: boolean
}

const frameworkColor = '#60a5fa'

const imgtRegions: RegionDefinition[] = [
  { name: 'FR1', start: 1, end: 26, color: frameworkColor },
  { name: 'CDR1', start: 27, end: 38, color: '#f59e0b' },
  { name: 'FR2', start: 39, end: 55, color: frameworkColor },
  { name: 'CDR2', start: 56, end: 65, color: '#f97316' },
  { name: 'FR3', start: 66, end: 104, color: frameworkColor },
  { name: 'CDR3', start: 105, end: 117, color: '#e11d48' },
  { name: 'FR4', start: 118, end: 129, color: frameworkColor },
]

const kabatHeavyRegions: RegionDefinition[] = [
  { name: 'FR1', start: 1, end: 30, color: frameworkColor },
  { name: 'CDR1', start: 31, end: 35, color: '#f59e0b' },
  { name: 'FR2', start: 36, end: 49, color: frameworkColor },
  { name: 'CDR2', start: 50, end: 65, color: '#f97316' },
  { name: 'FR3', start: 66, end: 94, color: frameworkColor },
  { name: 'CDR3', start: 95, end: 102, color: '#e11d48' },
  { name: 'FR4', start: 103, end: 113, color: frameworkColor },
]

const kabatLightRegions: RegionDefinition[] = [
  { name: 'FR1', start: 1, end: 23, color: frameworkColor },
  { name: 'CDR1', start: 24, end: 34, color: '#f59e0b' },
  { name: 'FR2', start: 35, end: 49, color: frameworkColor },
  { name: 'CDR2', start: 50, end: 56, color: '#f97316' },
  { name: 'FR3', start: 57, end: 88, color: frameworkColor },
  { name: 'CDR3', start: 89, end: 97, color: '#e11d48' },
  { name: 'FR4', start: 98, end: 107, color: frameworkColor },
]

function numericPosition(label: string | null) {
  if (!label) return null
  const match = /^(\d+)/.exec(label)
  return match ? Number.parseInt(match[1], 10) : null
}

function sequenceIndexForPosition(numbering: ImmunoglobulinNumbering, position: number) {
  return numbering.positions.findIndex((label) => label === String(position))
}

function automaticAnnotationNote(numbering: ImmunoglobulinNumbering, detail: string) {
  const chainLabel = numbering.vhh?.subtype === 'VHH' ? 'VHH' : numbering.chain
  return `${AUTOMATIC_IMMUNOGLOBULIN_ANNOTATION_PREFIX} ${numbering.scheme.toUpperCase()} ${chainLabel}; ${detail}`
}

export function isAutomaticImmunoglobulinAnnotation(item: { notes?: string }) {
  return item.notes?.startsWith(AUTOMATIC_IMMUNOGLOBULIN_ANNOTATION_PREFIX) ?? false
}

export function buildImmunoglobulinAnnotationPlan(
  sequence: string,
  numbering: ImmunoglobulinNumbering,
): ImmunoglobulinAnnotationPlan {
  if (numbering.positions.length !== sequence.length) {
    throw new Error('The numbering no longer matches this protein sequence.')
  }

  const definitions = numbering.scheme === 'imgt'
    ? imgtRegions
    : numbering.chain === 'H'
      ? kabatHeavyRegions
      : kabatLightRegions
  const regionFeatures = definitions.flatMap((definition) => {
    const indices = numbering.positions.flatMap((label, index) => {
      const position = numericPosition(label)
      return position !== null && position >= definition.start && position <= definition.end ? [index] : []
    })
    if (!indices.length) return []
    const start = indices[0]
    const end = indices[indices.length - 1] + 1
    return [{
      id: createId('feature'),
      name: definition.name,
      type: 'region',
      color: definition.color,
      notes: automaticAnnotationNote(
        numbering,
        `${definition.name} (${definition.start}–${definition.end})`,
      ),
      locations: [{ start, end, strand: 'forward' as const }],
    }]
  })
  const vhhFeatures: SequenceFeature[] = numbering.vhh?.subtype === 'VHH' ? [{
    id: createId('feature'),
    name: 'VHH domain',
    type: 'domain',
    color: '#8b5cf6',
    notes: automaticAnnotationNote(
      numbering,
      `${numbering.vhh.mode === 'manual' ? 'manually selected' : 'sequence-classified'} VHH domain; `
      + `${Math.round(numbering.vhh.confidence * 100)}% VHH evidence`,
    ),
    locations: [{ start: numbering.queryStart, end: numbering.queryEnd, strand: 'forward' }],
  }] : []
  const matchedHallmarks = numbering.vhh?.subtype === 'VHH'
    ? numbering.vhh.hallmarks.filter((hallmark) => hallmark.matches && hallmark.sequenceIndex !== null)
    : []
  if (matchedHallmarks.length) {
    vhhFeatures.push({
      id: createId('feature'),
      name: 'VHH hallmarks',
      type: 'region',
      color: '#a855f7',
      notes: automaticAnnotationNote(
        numbering,
        `VHH FR2 hallmarks: ${matchedHallmarks.map((hallmark) =>
          `${hallmark.residue}${hallmark.schemePosition}`).join(', ')}`,
      ),
      locations: matchedHallmarks.map((hallmark) => ({
        start: hallmark.sequenceIndex!,
        end: hallmark.sequenceIndex! + 1,
        strand: 'forward',
      })),
    })
  }
  const features = [...regionFeatures, ...vhhFeatures]

  const [firstCysteinePosition, secondCysteinePosition] = numbering.scheme === 'imgt'
    ? [23, 104]
    : numbering.chain === 'H'
      ? [22, 92]
      : [23, 88]
  const firstCysteine = sequenceIndexForPosition(numbering, firstCysteinePosition)
  const secondCysteine = sequenceIndexForPosition(numbering, secondCysteinePosition)
  const hasCanonicalCysteines = firstCysteine >= 0
    && secondCysteine >= 0
    && sequence[firstCysteine]?.toUpperCase() === 'C'
    && sequence[secondCysteine]?.toUpperCase() === 'C'
  const bonds: ProteinBond[] = hasCanonicalCysteines ? [{
    id: createId('protein-bond'),
    name: 'Canonical V-domain disulfide',
    type: 'disulfide',
    endpoints: [{ residue: firstCysteine }, { residue: secondCysteine }],
    color: '#eab308',
    visible: true,
    showLabel: true,
    notes: automaticAnnotationNote(
      numbering,
      `canonical Cys${firstCysteinePosition}–Cys${secondCysteinePosition} disulfide`,
    ),
  }] : []
  const extraCysteinePair = numbering.vhh?.subtype === 'VHH'
    ? numbering.vhh.extraCysteinePair
    : null
  if (extraCysteinePair) {
    const [firstResidue, secondResidue] = extraCysteinePair
    const firstPosition = numbering.positions[firstResidue]
    const secondPosition = numbering.positions[secondResidue]
    bonds.push({
      id: createId('protein-bond'),
      name: 'Predicted VHH CDR disulfide',
      type: 'disulfide',
      endpoints: [{ residue: firstResidue }, { residue: secondResidue }],
      color: '#8b5cf6',
      visible: true,
      showLabel: true,
      notes: automaticAnnotationNote(
        numbering,
        `predicted additional CDR1–CDR3 disulfide Cys${firstPosition}–Cys${secondPosition}; `
        + 'prediction is based on the unambiguous extra cysteine pair',
      ),
    })
  }

  return {
    features,
    bonds,
    missingCanonicalBond: !hasCanonicalCysteines,
    predictedAdditionalBond: Boolean(extraCysteinePair),
  }
}

export function replaceAutomaticImmunoglobulinAnnotations(
  features: SequenceFeature[],
  bonds: ProteinBond[],
  plan: ImmunoglobulinAnnotationPlan,
) {
  return {
    features: [
      ...features.filter((feature) => !isAutomaticImmunoglobulinAnnotation(feature)),
      ...plan.features,
    ],
    bonds: [
      ...bonds.filter((bond) => !isAutomaticImmunoglobulinAnnotation(bond)),
      ...plan.bonds,
    ],
  }
}
