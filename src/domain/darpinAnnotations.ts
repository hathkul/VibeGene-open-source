import type { DarpinDetection } from './darpinDetection'
import { createId } from './sequence'
import type { SequenceFeature } from './types'

export const AUTOMATIC_DARPIN_ANNOTATION_PREFIX = 'VibeGene automatic DARPin annotation:'

export type DarpinAnnotationPlan = {
  features: SequenceFeature[]
}

const CAP_COLOR = '#0d9488'
const INTERNAL_COLORS = ['#2563eb', '#1d4ed8', '#1e40af', '#172554']
const PARATOPE_COLOR = '#f59e0b'
const DOMAIN_COLOR = '#7c3aed'

function automaticAnnotationNote(detection: DarpinDetection, detail: string) {
  return `${AUTOMATIC_DARPIN_ANNOTATION_PREFIX} ${detection.format}; ${detail}`
}

export function isAutomaticDarpinAnnotation(item: { notes?: string }) {
  return item.notes?.startsWith(AUTOMATIC_DARPIN_ANNOTATION_PREFIX) ?? false
}

export function buildDarpinAnnotationPlan(
  sequence: string,
  detection: DarpinDetection,
): DarpinAnnotationPlan {
  if (detection.positions.length !== sequence.length) {
    throw new Error('The DARPin numbering no longer matches this protein sequence.')
  }

  const domainFeature: SequenceFeature = {
    id: createId('feature'),
    name: `DARPin ${detection.format}`,
    type: 'domain',
    color: DOMAIN_COLOR,
    notes: automaticAnnotationNote(
      detection,
      `${Math.round(detection.confidence * 100)}% confidence; `
      + `${detection.modules.filter((module) => module.kind === 'internal').length} internal repeats`,
    ),
    locations: [{ start: detection.queryStart, end: detection.queryEnd, strand: 'forward' }],
  }

  const moduleFeatures = detection.modules.map((module) => {
    if (module.kind === 'N-cap') {
      return {
        id: createId('feature'),
        name: 'N-cap',
        type: 'region',
        color: CAP_COLOR,
        notes: automaticAnnotationNote(detection, `N-terminal capping repeat (${module.end - module.start} aa)`),
        locations: [{ start: module.start, end: module.end, strand: 'forward' as const }],
      }
    }
    if (module.kind === 'C-cap') {
      return {
        id: createId('feature'),
        name: 'C-cap',
        type: 'region',
        color: CAP_COLOR,
        notes: automaticAnnotationNote(detection, `C-terminal capping repeat (${module.end - module.start} aa)`),
        locations: [{ start: module.start, end: module.end, strand: 'forward' as const }],
      }
    }
    const color = INTERNAL_COLORS[((module.index ?? 1) - 1) % INTERNAL_COLORS.length]
    return {
      id: createId('feature'),
      name: `IR${module.index}`,
      type: 'repeat',
      color,
      notes: automaticAnnotationNote(
        detection,
        `internal ankyrin repeat ${module.index} `
        + `(${Math.round(module.confidence * 100)}% framework match)`,
      ),
      locations: [{ start: module.start, end: module.end, strand: 'forward' as const }],
    }
  })

  const paratopeFeature: SequenceFeature[] = detection.paratopeIndices.length
    ? [{
      id: createId('feature'),
      name: 'Paratope residues',
      type: 'binding site',
      color: PARATOPE_COLOR,
      notes: automaticAnnotationNote(
        detection,
        `randomized library positions 2, 3, 5, 13, 14, 26, 33 `
        + `(${detection.paratopeIndices.length} residues)`,
      ),
      locations: detection.paratopeIndices.map((index) => ({
        start: index,
        end: index + 1,
        strand: 'forward' as const,
      })),
    }]
    : []

  return {
    features: [domainFeature, ...moduleFeatures, ...paratopeFeature],
  }
}

export function replaceAutomaticDarpinAnnotations(
  features: SequenceFeature[],
  plan: DarpinAnnotationPlan,
) {
  return [
    ...features.filter((feature) => !isAutomaticDarpinAnnotation(feature)),
    ...plan.features,
  ]
}
