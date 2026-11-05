import {
  buildImmunoglobulinAnnotationPlan,
  type ImmunoglobulinAnnotationPlan,
} from './immunoglobulinAnnotations'
import type { ScfvDetection } from './scfvDetection'
import { createId } from './sequence'
import type { ProteinBond, SequenceFeature } from './types'

export const AUTOMATIC_SCFV_ANNOTATION_PREFIX = 'VibeGene automatic scFv annotation:'

export type ScfvAnnotationPlan = {
  features: SequenceFeature[]
  bonds: ProteinBond[]
}

const SCFV_COLOR = '#7c3aed'
const VH_COLOR = '#2563eb'
const VL_COLOR = '#0891b2'
const LINKER_COLOR = '#84cc16'

function automaticAnnotationNote(detection: ScfvDetection, detail: string) {
  return `${AUTOMATIC_SCFV_ANNOTATION_PREFIX} ${detection.numberingScheme.toUpperCase()} ${detection.orientation}; ${detail}`
}

export function isAutomaticScfvAnnotation(item: { notes?: string }) {
  return item.notes?.startsWith(AUTOMATIC_SCFV_ANNOTATION_PREFIX) ?? false
}

function retargetDomainPlan(
  plan: ImmunoglobulinAnnotationPlan,
  detection: ScfvDetection,
  domainLabel: 'VH' | 'VL',
) {
  const features = plan.features.map((feature) => ({
    ...feature,
    id: createId('feature'),
    name: feature.name.startsWith(domainLabel) ? feature.name : `${domainLabel} ${feature.name}`,
    notes: automaticAnnotationNote(detection, `${domainLabel}; ${feature.name}`),
  }))
  const bonds = plan.bonds.map((bond) => ({
    ...bond,
    id: createId('protein-bond'),
    name: `${domainLabel} ${bond.name}`,
    notes: automaticAnnotationNote(detection, `${domainLabel}; ${bond.name}`),
  }))
  return { features, bonds }
}

export function buildScfvAnnotationPlan(
  sequence: string,
  detection: ScfvDetection,
): ScfvAnnotationPlan {
  if (detection.positions.length !== sequence.length) {
    throw new Error('The scFv numbering no longer matches this protein sequence.')
  }

  const heavyPlan = retargetDomainPlan(
    buildImmunoglobulinAnnotationPlan(sequence, detection.heavy),
    detection,
    'VH',
  )
  const lightPlan = retargetDomainPlan(
    buildImmunoglobulinAnnotationPlan(sequence, detection.light),
    detection,
    'VL',
  )

  const scfvFeature: SequenceFeature = {
    id: createId('feature'),
    name: `scFv ${detection.orientation}`,
    type: 'domain',
    color: SCFV_COLOR,
    notes: automaticAnnotationNote(
      detection,
      `${Math.round(detection.confidence * 100)}% confidence; `
      + `linker ${detection.linkerEnd - detection.linkerStart} aa`,
    ),
    locations: [{ start: detection.queryStart, end: detection.queryEnd, strand: 'forward' }],
  }

  const vhDomain: SequenceFeature = {
    id: createId('feature'),
    name: detection.heavy.vhh?.subtype === 'VHH' ? 'VHH domain' : 'VH domain',
    type: 'domain',
    color: VH_COLOR,
    notes: automaticAnnotationNote(
      detection,
      `heavy variable domain (${detection.heavy.chain}; `
      + `${Math.round(detection.heavy.confidence * 100)}% numbering confidence)`,
    ),
    locations: [{
      start: detection.heavy.queryStart,
      end: detection.heavy.queryEnd,
      strand: 'forward',
    }],
  }

  const vlDomain: SequenceFeature = {
    id: createId('feature'),
    name: `VL (${detection.light.chain === 'L' ? 'λ' : 'κ'}) domain`,
    type: 'domain',
    color: VL_COLOR,
    notes: automaticAnnotationNote(
      detection,
      `light variable domain (${detection.light.chain}; `
      + `${Math.round(detection.light.confidence * 100)}% numbering confidence)`,
    ),
    locations: [{
      start: detection.light.queryStart,
      end: detection.light.queryEnd,
      strand: 'forward',
    }],
  }

  const linkerFeature: SequenceFeature = {
    id: createId('feature'),
    name: 'Linker',
    type: 'region',
    color: LINKER_COLOR,
    notes: automaticAnnotationNote(
      detection,
      `inter-domain linker (${detection.linkerEnd - detection.linkerStart} aa; `
      + `${Math.round(detection.linkerConfidence * 100)}% Gly/Ser linker evidence); `
      + detection.linkerSequence,
    ),
    locations: [{
      start: detection.linkerStart,
      end: detection.linkerEnd,
      strand: 'forward',
    }],
  }

  // Prefer the dedicated VH/VL domain features over Ig plan's optional VHH domain duplicate names.
  const heavyRegions = heavyPlan.features.filter((feature) => !/domain$/i.test(feature.name))
  const lightRegions = lightPlan.features.filter((feature) => !/domain$/i.test(feature.name))

  return {
    features: [
      scfvFeature,
      vhDomain,
      vlDomain,
      linkerFeature,
      ...heavyRegions,
      ...lightRegions,
    ],
    bonds: [...heavyPlan.bonds, ...lightPlan.bonds],
  }
}

export function replaceAutomaticScfvAnnotations(
  features: SequenceFeature[],
  bonds: ProteinBond[],
  plan: ScfvAnnotationPlan,
) {
  return {
    features: [
      ...features.filter((feature) => !isAutomaticScfvAnnotation(feature)),
      ...plan.features,
    ],
    bonds: [
      ...bonds.filter((bond) => !isAutomaticScfvAnnotation(bond)),
      ...plan.bonds,
    ],
  }
}
