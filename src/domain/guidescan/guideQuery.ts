import type { GuideScanGuideValidationRequest } from './types'
import { GuideScanError } from './types'

/** GuideScan2 open-source gRNA parser accepts 20–23 nt ATCGN (after uppercasing). */
export const GUIDESCAN_GUIDE_MIN_LENGTH = 20
export const GUIDESCAN_GUIDE_MAX_LENGTH = 23

/**
 * Normalize a single guide query for GuideScan2: uppercase DNA, strip whitespace,
 * map U→T. Does not invent PAM bases.
 */
export function normalizeGuideScanGuideQuery(input: string): string {
  return input
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/U/g, 'T')
}

/**
 * Client-side checks mirroring guidescan-web `parse-grnas` (20–23 nt, ATCGN).
 * Enzyme is accepted for API symmetry; PAM motifs are not required client-side so
 * spacer-only and spacer+PAM inputs GuideScan accepts are not rejected.
 */
export function validateGuideScanGuideQuery(
  sequence: string,
  enzyme?: string,
): void {
  void enzyme
  if (!sequence) {
    throw new GuideScanError('invalid_request', 'Enter a guide DNA sequence to validate.')
  }
  if (!/^[ACGTN]+$/.test(sequence)) {
    throw new GuideScanError(
      'invalid_request',
      'Guide sequences must contain only A, C, G, T, or N.',
    )
  }
  if (sequence.length < GUIDESCAN_GUIDE_MIN_LENGTH || sequence.length > GUIDESCAN_GUIDE_MAX_LENGTH) {
    throw new GuideScanError(
      'invalid_request',
      `GuideScan gRNA queries must be ${GUIDESCAN_GUIDE_MIN_LENGTH}–${GUIDESCAN_GUIDE_MAX_LENGTH} nt (got ${sequence.length}).`,
    )
  }
}

export function buildGuideScanGuideValidationForm(
  request: GuideScanGuideValidationRequest,
): FormData {
  const organism = request.organism.trim()
  const enzyme = String(request.enzyme).trim()
  if (!organism) throw new GuideScanError('invalid_request', 'Choose a GuideScan reference genome.')
  if (!enzyme) throw new GuideScanError('invalid_request', 'Choose a Cas enzyme supported by GuideScan2.')

  const querySequence = normalizeGuideScanGuideQuery(request.guideSequence)
  validateGuideScanGuideQuery(querySequence, enzyme)

  const form = new FormData()
  form.append('query-type', 'grna')
  form.append('query-text', querySequence)
  form.append('organism', organism)
  form.append('enzyme', enzyme)
  return form
}
