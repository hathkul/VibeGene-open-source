import { featureBounds } from '../../domain/sequence'
import type { RestrictionSite, SequenceFeature } from '../../domain/types'
import type { SequenceSelectionRange, StrandPairSelection } from '../../domain/sequence'

export type SequenceEnterTabSelectionFocus = 'dna' | 'feature' | 'primer' | 'bond'

export type SequenceEnterTabPrimerBinding = {
  primer: { id: string }
  start: number
}

export type SequenceEnterTabRevealInput = {
  selectionFocus: SequenceEnterTabSelectionFocus
  selectedFeature: SequenceFeature | null
  selectedPrimerId: string | null
  selectedRange: SequenceSelectionRange | null
  primerBindings: readonly SequenceEnterTabPrimerBinding[]
  cutSelectionEnzymes: { upstream: RestrictionSite; downstream: RestrictionSite } | null
  cutSelectionAnchor: RestrictionSite | null
  cutStrandSelection: StrandPairSelection | null
}

/** Map-originated intent retained until the Sequence tab can reveal it. */
export type SequencePendingRevealTarget =
  | { kind: 'selection'; viewport?: 'sequence' | 'alignment' }
  | { kind: 'sequence'; position: number }
  | { kind: 'alignment'; templateIndex: number }

/** Selection-driven scroll position when entering the Sequence tab; explicit targets win elsewhere. */
export function resolveSequenceEnterTabRevealPosition(input: SequenceEnterTabRevealInput): number | null {
  if (input.selectionFocus === 'feature' && input.selectedFeature) {
    return featureBounds(input.selectedFeature).start
  }
  if (input.selectionFocus === 'primer' && input.selectedPrimerId) {
    if (input.selectedRange) return input.selectedRange.start
    const binding = input.primerBindings.find((entry) => entry.primer.id === input.selectedPrimerId)
    if (binding) return binding.start
  }
  if (input.cutSelectionEnzymes) {
    return input.cutStrandSelection?.forward.start
      ?? Math.min(input.cutSelectionEnzymes.upstream.cutTop, input.cutSelectionEnzymes.upstream.cutBottom)
  }
  if (input.cutSelectionAnchor) {
    return Math.min(input.cutSelectionAnchor.cutTop, input.cutSelectionAnchor.cutBottom)
  }
  if (input.cutStrandSelection) return input.cutStrandSelection.forward.start
  if (input.selectedRange) return input.selectedRange.start
  return null
}

export const SEQUENCE_ENTER_TAB_ANCHOR_SCROLL_THRESHOLD = 30

export function shouldScheduleEnterTabAnchorScroll(
  visibleCenter: number,
  anchor: number,
  threshold = SEQUENCE_ENTER_TAB_ANCHOR_SCROLL_THRESHOLD,
): boolean {
  return Math.abs(visibleCenter - anchor) >= threshold
}
