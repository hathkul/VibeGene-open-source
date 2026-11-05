import type { FeatureTranslationCell } from './geneticCode'
import { getCachedOrfPrediction } from './orfPrediction'
import { buildUniProtAnnotationPlan, type ProjectedUniProtAnnotation, type UniProtSimilarityHit } from './proteinUniProtAnnotation'
import { createId, sanitizeProtein } from './sequence'
import type { FeatureSegment, SequenceFeature } from './types'

export type TranslatedOrfCandidate = {
  id: string
  name: string
  feature: SequenceFeature
  cells: FeatureTranslationCell[]
  proteinSequence: string
  aminoAcidLength: number
}

export type TranslatedOrfAnnotation = Omit<ProjectedUniProtAnnotation, 'feature' | 'bond' | 'kind'> & {
  kind: 'feature'
  feature: SequenceFeature
}

export type TranslatedOrfHitPlan = {
  orf: TranslatedOrfCandidate
  hit: UniProtSimilarityHit
  annotations: TranslatedOrfAnnotation[]
}

export function detectTranslatedOrfs(sequence: string, minimumLengthAa = 40, sequenceOffset = 0): TranslatedOrfCandidate[] {
  const prediction = getCachedOrfPrediction(sequence, {
    mode: 'all-6',
    minimumLengthAa,
    requireStartCodon: true,
    startCodon: 'ATG',
    geneticCode: 'Standard',
  })
  const seen = new Set<string>()
  return prediction.features.flatMap((feature) => {
    const cells = prediction.translations.get(feature.id) ?? []
    const proteinSequence = sanitizeProtein(cells.map((cell) => cell.aa).join('').replace(/\*+$/, '')).toUpperCase()
    if (proteinSequence.length < minimumLengthAa || seen.has(proteinSequence)) return []
    seen.add(proteinSequence)
    const offsetFeature: SequenceFeature = sequenceOffset === 0 ? feature : {
      ...feature,
      locations: feature.locations.map((location) => ({ ...location, start: location.start + sequenceOffset, end: location.end + sequenceOffset })),
    }
    const offsetCells = sequenceOffset === 0 ? cells : cells.map((cell) => ({
      ...cell,
      positions: cell.positions.map((position) => position + sequenceOffset),
    }))
    return [{
      id: feature.id,
      name: feature.name.replace(/\s*\(\d+ aa\)$/, ` (${proteinSequence.length} aa)`),
      feature: offsetFeature,
      cells: offsetCells.slice(0, proteinSequence.length),
      proteinSequence,
      aminoAcidLength: proteinSequence.length,
    }]
  }).sort((a, b) => b.aminoAcidLength - a.aminoAcidLength)
}

function segmentsForResidues(cells: FeatureTranslationCell[], start: number, end: number, strand: FeatureSegment['strand']) {
  const positions = [...new Set(cells.slice(start, end).flatMap((cell) => cell.positions))].sort((a, b) => a - b)
  const segments: FeatureSegment[] = []
  positions.forEach((position) => {
    const previous = segments.at(-1)
    if (previous && previous.end === position) previous.end = position + 1
    else segments.push({ start: position, end: position + 1, strand })
  })
  return segments
}

function projectFeature(feature: SequenceFeature, orf: TranslatedOrfCandidate): SequenceFeature | null {
  const strand = orf.feature.locations[0]?.strand ?? 'forward'
  const locations = feature.locations.flatMap((location) => segmentsForResidues(orf.cells, location.start, location.end, strand))
  if (!locations.length) return null
  return {
    ...feature,
    id: createId('feature'),
    locations,
    translation: undefined,
    translateInSequenceView: false,
    notes: `${feature.notes?.trim() ? `${feature.notes.trim()} ` : ''}/note="Projected from translated ${orf.name}"`,
  }
}

export function buildTranslatedOrfHitPlan(orf: TranslatedOrfCandidate, hit: UniProtSimilarityHit): TranslatedOrfHitPlan {
  const proteinPlan = buildUniProtAnnotationPlan(orf.proteinSequence, 0, hit)
  const annotations = proteinPlan.annotations.flatMap((annotation): TranslatedOrfAnnotation[] => {
    if (annotation.kind !== 'feature' || !annotation.feature) return []
    const feature = projectFeature(annotation.feature, orf)
    if (!feature) return []
    return [{ ...annotation, kind: 'feature', feature, targetRange: feature.locations.map((location) => `${location.start + 1}–${location.end}`).join(', ') }]
  })
  return { orf, hit, annotations }
}
