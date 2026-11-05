import type { VnarDetection, VnarRegionName } from './vnarDetection'
import { createId } from './sequence'
import type { ProteinBond, SequenceFeature } from './types'

export const AUTOMATIC_VNAR_ANNOTATION_PREFIX = 'VibeGene automatic VNAR annotation:'

export type VnarAnnotationPlan = {
  features: SequenceFeature[]
  bonds: ProteinBond[]
  missingCanonicalBond: boolean
}

const REGION_COLORS: Record<VnarRegionName, string> = {
  FR1: '#60a5fa',
  CDR1: '#f59e0b',
  FR2: '#60a5fa',
  HV2: '#14b8a6',
  FR3a: '#60a5fa',
  HV4: '#06b6d4',
  FR3b: '#60a5fa',
  CDR3: '#e11d48',
  FR4: '#60a5fa',
}

function automaticAnnotationNote(detection: VnarDetection, detail: string) {
  return `${AUTOMATIC_VNAR_ANNOTATION_PREFIX} type ${detection.vnarType}; ${detail}`
}

export function isAutomaticVnarAnnotation(item: { notes?: string }) {
  return item.notes?.startsWith(AUTOMATIC_VNAR_ANNOTATION_PREFIX) ?? false
}

export function buildVnarAnnotationPlan(
  sequence: string,
  detection: VnarDetection,
): VnarAnnotationPlan {
  if (detection.positions.length !== sequence.length) {
    throw new Error('The VNAR numbering no longer matches this protein sequence.')
  }

  const domainFeature: SequenceFeature = {
    id: createId('feature'),
    name: `VNAR type ${detection.vnarType}`,
    type: 'domain',
    color: '#0f766e',
    notes: automaticAnnotationNote(
      detection,
      `${Math.round(detection.confidence * 100)}% confidence; IgNAR variable domain`,
    ),
    locations: [{ start: detection.queryStart, end: detection.queryEnd, strand: 'forward' }],
  }

  const regionFeatures = detection.regions.map((region) => ({
    id: createId('feature'),
    name: region.name,
    type: 'region' as const,
    color: REGION_COLORS[region.name],
    notes: automaticAnnotationNote(
      detection,
      `${region.name} (${region.end - region.start} aa)`,
    ),
    locations: [{ start: region.start, end: region.end, strand: 'forward' as const }],
  }))

  const bonds: ProteinBond[] = []
  let missingCanonicalBond = true
  if (detection.canonicalCysteines) {
    const [first, second] = detection.canonicalCysteines
    if (
      sequence[first]?.toUpperCase() === 'C'
      && sequence[second]?.toUpperCase() === 'C'
    ) {
      missingCanonicalBond = false
      bonds.push({
        id: createId('protein-bond'),
        name: 'Canonical VNAR disulfide',
        type: 'disulfide',
        endpoints: [{ residue: first }, { residue: second }],
        color: '#eab308',
        visible: true,
        showLabel: true,
        notes: automaticAnnotationNote(detection, 'canonical FR1–FR3 disulfide'),
      })
    }
  }

  for (const [left, right] of detection.extraDisulfides) {
    if (sequence[left]?.toUpperCase() !== 'C' || sequence[right]?.toUpperCase() !== 'C') continue
    bonds.push({
      id: createId('protein-bond'),
      name: `VNAR type ${detection.vnarType} disulfide`,
      type: 'disulfide',
      endpoints: [{ residue: left }, { residue: right }],
      color: '#f97316',
      visible: true,
      showLabel: true,
      notes: automaticAnnotationNote(detection, 'non-canonical type-specific disulfide'),
    })
  }

  return {
    features: [domainFeature, ...regionFeatures],
    bonds,
    missingCanonicalBond,
  }
}

export function replaceAutomaticVnarAnnotations(
  features: SequenceFeature[],
  bonds: ProteinBond[],
  plan: VnarAnnotationPlan,
) {
  return {
    features: [
      ...features.filter((feature) => !isAutomaticVnarAnnotation(feature)),
      ...plan.features,
    ],
    bonds: [
      ...bonds.filter((bond) => !isAutomaticVnarAnnotation(bond)),
      ...plan.bonds,
    ],
  }
}
