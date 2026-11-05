import type { AlleleEdit, AlleleFit } from './fit'

export type IndependentReadFit = {
  name: string
  orientation: 'forward' | 'reverse' | 'unknown'
  result?: AlleleFit
  error?: string
}
export type ReadComparison = 'matching' | 'different' | 'uncertain' | 'unavailable'

/** Compare resulting sequences, not edit coordinates, which may be equivalent in repeats. */
export function compareIndependentReads(reference: string, reads: readonly IndependentReadFit[] | undefined): ReadComparison {
  if (!reads || reads.length !== 2 || reads.some((read) => !read.result || read.error || !read.result.alleles.length)) return 'unavailable'
  const first = reads[0]!.result!
  const second = reads[1]!.result!
  const normalizedReference = reference.toUpperCase()
  const sequence = (edit: AlleleEdit) => normalizedReference.slice(0, edit.start) + edit.inserted.toUpperCase() + normalizedReference.slice(edit.end)
  const candidates = (fit: AlleleFit) => [...new Set(fit.alleles.map((allele) => sequence(allele.edit)))].sort()
  const left = candidates(first)
  const right = candidates(second)
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) return 'different'
  if ([first, second].some((fit) => fit.fit < 0.8 || fit.alleles.some((allele) => allele.ambiguous || allele.alternativesTruncated))) return 'uncertain'
  return 'matching'
}

export function readComparisonMessage(comparison: ReadComparison): string {
  switch (comparison) {
    case 'matching': return 'The independently fitted reads report the same candidate sequences. This agreement does not confirm the genotype.'
    case 'different': return 'Warning: independently fitted reads report different candidate sequences. A good combined fit does not resolve this disagreement; inspect both reads and competing alternatives.'
    case 'uncertain': return 'The reported candidates match, but low fit or competing alternatives make the comparison inconclusive.'
    case 'unavailable': return 'Independent read comparison is unavailable. Analyze again to compare the reads.'
  }
}
