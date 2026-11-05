import { groupSgRNAFeatures } from '../../domain/sgrna'
import type { PrimerFrameDisplay } from '../../domain/primerSequenceLayout'
import type { SequenceFeature, Strand } from '../../domain/types'

export type MinimapOligoSpan = { id: string; start: number; end: number; strand: Strand; color: string; kind: 'primer' | 'sgrna' }

export function sequenceMinimapOligoSpans(primers: readonly PrimerFrameDisplay[], features: readonly SequenceFeature[], showSgRnas: boolean): MinimapOligoSpan[] {
  const primerSpans: MinimapOligoSpan[] = primers.map((primer, index) => ({
    id: `${primer.primerId}:${index}`, start: primer.templateSpanStart, end: primer.templateSpanEnd,
    strand: primer.strand, color: primer.color, kind: 'primer',
  }))
  const sgRnaSpans: MinimapOligoSpan[] = showSgRnas ? groupSgRNAFeatures(features).flatMap((annotation) =>
    [annotation.guide, annotation.pam].flatMap((part) => part?.locations.map((location, index) => ({
      id: `${part.id}:${index}`, start: location.start, end: location.end, strand: location.strand,
      color: annotation.guide.color, kind: 'sgrna' as const,
    })) ?? []),
  ) : []
  return [...primerSpans, ...sgRnaSpans].filter((span) => span.end > span.start)
}
