/**
 * True when the term looks like a bare NCBI Entrez Gene id (all digits).
 * Kept in a lean module so eligibility checks do not pull in the gene
 * resolution network stack.
 */
export function isLikelyEntrezGeneId(term: string): boolean {
  return /^\d{1,12}$/.test(term.trim())
}
