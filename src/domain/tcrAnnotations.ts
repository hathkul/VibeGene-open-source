import type { TcrNumbering } from './tcrNumbering'
import { tcrChainLabel } from './tcrNumbering'
import { createId } from './sequence'
import type { ProteinBond, SequenceFeature } from './types'

export const AUTOMATIC_TCR_ANNOTATION_PREFIX = 'VibeGene automatic TCR annotation:'

type RegionName = 'FR1' | 'CDR1' | 'FR2' | 'CDR2' | 'FR3' | 'CDR3' | 'FR4'

type RegionDefinition = {
  name: RegionName
  start: number
  end: number
  color: string
}

export type TcrAnnotationPlan = {
  features: SequenceFeature[]
  bonds: ProteinBond[]
  missingCanonicalBond: boolean
}

const frameworkColor = '#60a5fa'

/** IMGT FR/CDR boundaries are shared across antibody and TCR V-domains. */
const imgtRegions: RegionDefinition[] = [
  { name: 'FR1', start: 1, end: 26, color: frameworkColor },
  { name: 'CDR1', start: 27, end: 38, color: '#f59e0b' },
  { name: 'FR2', start: 39, end: 55, color: frameworkColor },
  { name: 'CDR2', start: 56, end: 65, color: '#f97316' },
  { name: 'FR3', start: 66, end: 104, color: frameworkColor },
  { name: 'CDR3', start: 105, end: 117, color: '#e11d48' },
  { name: 'FR4', start: 118, end: 129, color: frameworkColor },
]

function numericPosition(label: string | null) {
  if (!label) return null
  const match = /^(\d+)/.exec(label)
  return match ? Number.parseInt(match[1], 10) : null
}

function sequenceIndexForPosition(numbering: TcrNumbering, position: number) {
  return numbering.positions.findIndex((label) => label === String(position))
}

function automaticAnnotationNote(numbering: TcrNumbering, detail: string) {
  return `${AUTOMATIC_TCR_ANNOTATION_PREFIX} ${numbering.scheme.toUpperCase()} `
    + `TCR${tcrChainLabel(numbering.chain)}; ${detail}`
}

export function isAutomaticTcrAnnotation(item: { notes?: string }) {
  return item.notes?.startsWith(AUTOMATIC_TCR_ANNOTATION_PREFIX) ?? false
}

export function buildTcrAnnotationPlan(
  sequence: string,
  numbering: TcrNumbering,
): TcrAnnotationPlan {
  if (numbering.positions.length !== sequence.length) {
    throw new Error('The TCR numbering no longer matches this protein sequence.')
  }

  const regionFeatures = imgtRegions.flatMap((definition) => {
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

  const domainFeature: SequenceFeature = {
    id: createId('feature'),
    name: `TCR ${tcrChainLabel(numbering.chain)} domain`,
    type: 'domain',
    color: '#0d9488',
    notes: automaticAnnotationNote(
      numbering,
      `${Math.round(numbering.confidence * 100)}% numbering confidence`,
    ),
    locations: [{ start: numbering.queryStart, end: numbering.queryEnd, strand: 'forward' }],
  }

  const firstCysteine = sequenceIndexForPosition(numbering, 23)
  const secondCysteine = sequenceIndexForPosition(numbering, 104)
  const hasCanonicalCysteines = firstCysteine >= 0
    && secondCysteine >= 0
    && sequence[firstCysteine]?.toUpperCase() === 'C'
    && sequence[secondCysteine]?.toUpperCase() === 'C'
  const bonds: ProteinBond[] = hasCanonicalCysteines ? [{
    id: createId('protein-bond'),
    name: 'Canonical TCR V-domain disulfide',
    type: 'disulfide',
    endpoints: [{ residue: firstCysteine }, { residue: secondCysteine }],
    color: '#eab308',
    visible: true,
    showLabel: true,
    notes: automaticAnnotationNote(numbering, 'canonical Cys23–Cys104 disulfide'),
  }] : []

  return {
    features: [domainFeature, ...regionFeatures],
    bonds,
    missingCanonicalBond: !hasCanonicalCysteines,
  }
}

export function replaceAutomaticTcrAnnotations(
  features: SequenceFeature[],
  bonds: ProteinBond[],
  plan: TcrAnnotationPlan,
) {
  return {
    features: [
      ...features.filter((feature) => !isAutomaticTcrAnnotation(feature)),
      ...plan.features,
    ],
    bonds: [
      ...bonds.filter((bond) => !isAutomaticTcrAnnotation(bond)),
      ...plan.bonds,
    ],
  }
}
