/**
 * Upper bound for a primer/oligo that Vibegene will analyze or save.
 *
 * This is deliberately more permissive than a typical PCR primer so primers
 * with long 5' additions remain supported, while construct-sized selections
 * cannot enter algorithms and UI paths intended for short oligos.
 */
export const MAX_PRIMER_LENGTH = 200

export function primerLengthError(length: number): string | null {
  if (length <= MAX_PRIMER_LENGTH) return null
  return `Primers can contain at most ${MAX_PRIMER_LENGTH} bases (this sequence contains ${length.toLocaleString()}).`
}
