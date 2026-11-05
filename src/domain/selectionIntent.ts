/**
 * Describes why the current displayed range exists. A range alone is not an
 * instruction to reuse it: annotation and single-primer ranges are incidental
 * context, while a direct DNA range or paired-primer amplicon is deliberate.
 */
export type SelectionIntent =
  | 'neutral'
  | 'dna-range'
  | 'feature'
  | 'primer-binding'
  | 'primer-amplicon'
  | 'restriction-cut'

export function canSeedFeatureFromSelection(intent: SelectionIntent): boolean {
  return intent === 'dna-range' || intent === 'primer-amplicon'
}
