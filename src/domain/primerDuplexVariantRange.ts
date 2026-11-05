import type { PrimerDuplexTmResult } from './primerDuplexThermodynamics'

const iupacBases: Record<string, readonly string[]> = {
  A: ['A'], C: ['C'], G: ['G'], T: ['T'],
  R: ['A', 'G'], Y: ['C', 'T'], S: ['C', 'G'], W: ['A', 'T'],
  K: ['G', 'T'], M: ['A', 'C'], B: ['C', 'G', 'T'], D: ['A', 'G', 'T'],
  H: ['A', 'C', 'T'], V: ['A', 'C', 'G'], N: ['A', 'C', 'G', 'T'],
}

export type DuplexVariantRange = {
  status: 'estimated' | 'unsupported'
  reason?: string
  totalVariantCount: number
  evaluatedVariantCount: number
  estimatedVariantCount: number
  unsupportedVariantCount: number | null
  unexaminedVariantCount: number
  approximateTandemMismatchVariantCount: number
  modeledFivePrimeDanglingBases?: number
  tmCRange?: { min: number; max: number }
  deltaHRange?: { min: number; max: number }
  deltaSRange?: { min: number; max: number }
}

export type DuplexTmCalculator = (primer: string, target: string, totalVariantCount: number) => PrimerDuplexTmResult

/**
 * Exhaustively expand IUPAC bases on both aligned strands, then report ranges
 * over estimated variants. If the Cartesian product exceeds maxVariants, no
 * subset is sampled and the result explicitly reports how many were unexamined.
 */
export function calculatePrimerDuplexVariantRange(
  primer: string,
  target: string,
  options: { maxVariants?: number; calculate: DuplexTmCalculator },
): DuplexVariantRange {
  const top = primer.toUpperCase()
  const bottom = target.toUpperCase()
  if (top.length !== bottom.length || top.length < 2) {
    return {
      status: 'unsupported', reason: 'Aligned sequences must have equal length of at least two bases',
      totalVariantCount: 0, evaluatedVariantCount: 0, estimatedVariantCount: 0,
      unsupportedVariantCount: 0, unexaminedVariantCount: 0, approximateTandemMismatchVariantCount: 0,
    }
  }

  const symbols = [...top, ...bottom]
  if (symbols.some((base) => !iupacBases[base])) {
    return {
      status: 'unsupported', reason: 'Sequences contain a non-IUPAC DNA symbol',
      totalVariantCount: 0, evaluatedVariantCount: 0, estimatedVariantCount: 0,
      unsupportedVariantCount: 0, unexaminedVariantCount: 0, approximateTandemMismatchVariantCount: 0,
    }
  }

  const choices = symbols.map((base) => iupacBases[base]!)
  let totalVariantCount = 1
  for (const bases of choices) {
    totalVariantCount *= bases.length
    if (!Number.isSafeInteger(totalVariantCount)) {
      return {
        status: 'unsupported', reason: 'Variant count exceeds the safe integer range',
        totalVariantCount: Number.MAX_SAFE_INTEGER, evaluatedVariantCount: 0, estimatedVariantCount: 0,
        unsupportedVariantCount: null, unexaminedVariantCount: Number.MAX_SAFE_INTEGER, approximateTandemMismatchVariantCount: 0,
      }
    }
  }

  const maxVariants = options.maxVariants ?? 4096
  if (!Number.isSafeInteger(maxVariants) || maxVariants < 1) {
    return {
      status: 'unsupported', reason: 'maxVariants must be a positive safe integer',
      totalVariantCount, evaluatedVariantCount: 0, estimatedVariantCount: 0,
      unsupportedVariantCount: null, unexaminedVariantCount: totalVariantCount, approximateTandemMismatchVariantCount: 0,
    }
  }
  if (totalVariantCount > maxVariants) {
    return {
      status: 'unsupported', reason: 'Variant count exceeds the exhaustive enumeration limit',
      totalVariantCount, evaluatedVariantCount: 0, estimatedVariantCount: 0,
      unsupportedVariantCount: null, unexaminedVariantCount: totalVariantCount, approximateTandemMismatchVariantCount: 0,
    }
  }

  const calculate = options.calculate
  const sequenceLength = top.length
  const estimated: Extract<PrimerDuplexTmResult, { status: 'estimated' }>[] = []
  let unsupportedVariantCount = 0
  let approximateTandemMismatchVariantCount = 0
  let modeledFivePrimeDanglingBases = 0
  const current = new Array<string>(choices.length)

  const visit = (index: number): void => {
    if (index < choices.length) {
      for (const base of choices[index]!) {
        current[index] = base
        visit(index + 1)
      }
      return
    }
    const result = calculate(current.slice(0, sequenceLength).join(''), current.slice(sequenceLength).join(''), totalVariantCount)
    if (result.status === 'estimated') {
      estimated.push(result)
      if (result.approximateTandemMismatch) approximateTandemMismatchVariantCount += 1
      modeledFivePrimeDanglingBases = Math.max(modeledFivePrimeDanglingBases, result.modeledFivePrimeDanglingBases ?? 0)
    }
    else unsupportedVariantCount += 1
  }
  visit(0)

  if (estimated.length === 0) {
    return {
      status: 'unsupported', reason: 'No expanded variant has supported thermodynamic parameters',
      totalVariantCount, evaluatedVariantCount: totalVariantCount, estimatedVariantCount: 0,
      unsupportedVariantCount, unexaminedVariantCount: 0, approximateTandemMismatchVariantCount: 0,
    }
  }

  const range = (values: number[]) => ({ min: Math.min(...values), max: Math.max(...values) })
  return {
    status: 'estimated', totalVariantCount, evaluatedVariantCount: totalVariantCount,
    estimatedVariantCount: estimated.length, unsupportedVariantCount, unexaminedVariantCount: 0,
    approximateTandemMismatchVariantCount,
    ...(modeledFivePrimeDanglingBases && { modeledFivePrimeDanglingBases }),
    tmCRange: range(estimated.map((result) => result.tmC)),
    deltaHRange: range(estimated.map((result) => result.deltaH)),
    deltaSRange: range(estimated.map((result) => result.deltaS)),
  }
}
