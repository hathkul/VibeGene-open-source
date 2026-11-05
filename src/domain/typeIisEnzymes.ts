import type { RestrictionEnzyme } from './types'

/**
 * The catalog's IIS tag means a cut was written as an offset, which also
 * includes within-site cuts and two-sided Type IIB enzymes. Restrict this set
 * to single-sided cuts with at least one boundary outside the recognition site.
 */
export function isTypeIisEnzyme(enzyme: RestrictionEnzyme): boolean {
  if (enzyme.type !== 'IIS' || enzyme.upstreamCutTop !== undefined || enzyme.upstreamCutBottom !== undefined) return false
  const offsets = enzyme.notation.match(/\((-?\d+)\/(-?\d+)\)$/)
  if (!offsets) return false
  const length = enzyme.recognition.length
  const top = length + Number(offsets[1])
  const bottom = length + Number(offsets[2])
  return top < 0 || bottom < 0 || top > length || bottom > length
}
