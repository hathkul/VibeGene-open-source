import {
  computeFeatureTranslationCells,
  defaultFeatureTranslationOptions,
  transcriptionStrandFromReadingFrame,
} from './geneticCode'
import { complementDnaBase, normalizeDna } from './sequence'
import { remapFeaturesToTrace } from './traceAnnotationView'
import type { ProteinComparisonSource } from './proteinAlignmentTypes'
import type { TraceFileRecord } from './traceTypes'
import type { SequenceFeature } from './types'

function projectedFeatureOnMember(
  feature: SequenceFeature,
  member: TraceFileRecord,
): SequenceFeature | null {
  const existing = member.features?.find((entry) => entry.id === feature.id)
  if (existing?.locations.length) return existing
  if (!member.alignment || member.parseError) return null
  const preserveCodons = feature.locations.every((location) => {
    const length = location.end - location.start
    return length >= 3 && length % 3 === 0
  })
  return remapFeaturesToTrace([feature], member.alignment, { preserveCodons })[0] ?? null
}

/** Coding DNA for a projected feature (same strand/frame handling as protein provenance). */
export function codingDnaForProjectedFeature(
  feature: SequenceFeature,
  sequence: string,
): string | null {
  if (!feature.locations.length || !sequence) return null
  const translation = feature.translation ?? defaultFeatureTranslationOptions(feature.locations.length)
  const strand = transcriptionStrandFromReadingFrame(
    translation.readingFrame,
    feature.locations[0]?.strand ?? 'forward',
  )
  const cells = computeFeatureTranslationCells(feature, sequence, translation, { topology: 'linear' })
  const nucleotideSequence = cells
    .flatMap((cell) => cell.positions)
    .map((position) => {
      const base = sequence[position] ?? 'N'
      return strand === 'reverse' ? complementDnaBase(base) : base.toUpperCase()
    })
    .join('')
  const normalized = normalizeDna(nucleotideSequence)
  return normalized.length ? normalized : null
}

/**
 * Build protein comparative-alignment homologs from DNA library members for a
 * consensus translated feature (typically a CDS). Sources are DNA coding spans
 * (`kind: 'dna'`) so guided alignment can tolerate frameshifts/mismatches.
 * Source ids match member ids.
 */
export function proteinComparisonSourcesFromLibraryFeature(
  feature: SequenceFeature,
  members: readonly TraceFileRecord[],
): ProteinComparisonSource[] {
  if (!feature.translateInSequenceView && !feature.translation) return []
  const sources: ProteinComparisonSource[] = []
  for (const member of members) {
    if (!member.sequence.length || member.parseError) continue
    const projected = projectedFeatureOnMember(feature, member)
    if (!projected) continue
    const withTranslation: SequenceFeature = {
      ...projected,
      translateInSequenceView: projected.translateInSequenceView ?? feature.translateInSequenceView,
      translation: projected.translation ?? feature.translation,
    }
    const codingDna = codingDnaForProjectedFeature(withTranslation, member.sequence)
    if (!codingDna) continue
    sources.push({
      id: member.id,
      name: member.fileName,
      fileName: member.fileName,
      kind: 'dna',
      sequence: codingDna,
      enabled: member.enabled,
      disabledFrameShiftKeys: [],
    })
  }
  return sources
}
