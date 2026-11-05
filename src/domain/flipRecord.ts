import { reverseComplement } from './sequence'
import type {
  Primer,
  PrimerBindingLayout,
  FeatureReadingFrame,
  SequenceFeature,
  SequenceRecord,
  Strand,
  StrandColorRange,
  StrandColors,
} from './types'

function oppositeStrand(strand: Strand): Strand {
  return strand === 'forward' ? 'reverse' : 'forward'
}

/** Map a half-open interval [start, end) to its position after reverse-complementing a length-L sequence. */
export function flipInterval(start: number, end: number, length: number): { start: number; end: number } {
  return { start: length - end, end: length - start }
}

export function flipFeature(feature: SequenceFeature, length: number): SequenceFeature {
  const locations = feature.locations
    .map((location) => ({
      ...location,
      ...flipInterval(location.start, location.end, length),
      strand: oppositeStrand(location.strand),
    }))
    // Segments are stored ascending by coordinate regardless of strand (the map
    // derives biological 5'->3' order by reversing reverse-strand features).
    // Keep that invariant after flipping so multi-segment arrowheads stay on the
    // correct terminal segment.
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const translation = feature.translation
    ? {
        ...feature.translation,
        readingFrame: (feature.translation.readingFrame > 0
          ? -feature.translation.readingFrame
          : Math.abs(feature.translation.readingFrame)) as FeatureReadingFrame,
        // Locations are normalized to ascending genomic order. Reverse the
        // per-segment settings with them so skipped segments and numbering stay
        // attached to the same biological segment after the coordinate flip.
        segmentNumbering: [...feature.translation.segmentNumbering].reverse().map((entry) => ({ ...entry })),
      }
    : feature.translation
  const directionality = feature.directionality === 'forward'
    ? 'reverse'
    : feature.directionality === 'reverse'
      ? 'forward'
      : feature.directionality
  return { ...feature, locations, ...(feature.directionality !== undefined ? { directionality } : {}), ...(translation ? { translation } : {}) }
}

function flipStrandColorRanges(ranges: StrandColorRange[], length: number): StrandColorRange[] {
  return ranges.map((range) => ({ ...range, ...flipInterval(range.start, range.end, length) }))
}

function flipStrandColors(colors: StrandColors, length: number): StrandColors {
  // Reverse-complementing swaps which physical strand each color band sits on.
  return {
    ...colors,
    topStrand: flipStrandColorRanges(colors.bottomStrand, length),
    bottomStrand: flipStrandColorRanges(colors.topStrand, length),
  }
}

function flipPrimerBinding(binding: PrimerBindingLayout, length: number): PrimerBindingLayout {
  const flipped = flipInterval(binding.templateStart, binding.templateEnd, length)
  return {
    ...binding,
    strand: oppositeStrand(binding.strand),
    templateStart: flipped.start,
    templateEnd: flipped.end,
    components: binding.components.map((component) => {
      if (component.templateStart === undefined || component.templateEnd === undefined) return component
      const flippedComponent = flipInterval(component.templateStart, component.templateEnd, length)
      return { ...component, templateStart: flippedComponent.start, templateEnd: flippedComponent.end }
    }),
  }
}

export function flipPrimer(primer: Primer, length: number): Primer {
  if (!primer.bindings?.length) return primer
  return { ...primer, bindings: primer.bindings.map((binding) => flipPrimerBinding(binding, length)) }
}

/**
 * Reverse-complement an entire construct: the sequence, every feature and primer
 * binding, painted strand colors, and (for linear molecules) the DNA end chemistry.
 * Applying `flipRecord` twice returns the original sequence, feature spans, and strands.
 */
export function flipRecord(record: SequenceRecord): SequenceRecord {
  const length = record.sequence.length
  const sequence = reverseComplement(record.sequence)
  const features = record.features.map((feature) => flipFeature(feature, length))
  const primers = record.primers.map((primer) => flipPrimer(primer, length))
  const strandColors = record.strandColors ? flipStrandColors(record.strandColors, length) : record.strandColors
  const dnaEnds = record.dnaEnds
    ? { upstream: record.dnaEnds.downstream, downstream: record.dnaEnds.upstream }
    : record.dnaEnds
  return {
    ...record,
    sequence,
    features,
    primers,
    strandColors,
    dnaEnds,
  }
}
