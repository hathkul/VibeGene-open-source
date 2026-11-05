import { applySaltCorrection, calcTm as calcPrimdTm } from '@shandley/primd'
import { MAX_PRIMER_LENGTH } from './primerLimits'

const dnaAlphabet = /[^ACGTRYSWKMBDHVN]/gi
const canonicalDna = /^[ACGT]+$/
const gasConstant = 1.987
const defaultOligoConc = 250e-9
const expansionLimit = 16384

type StackThermo = {
  dH: number
  dS: number
  dG37: number
}

export type AnnealTemperatureMethod =
  | 'primd-santalucia-1998'
  | 'santalucia-hicks-2004'
  | 'santalucia-hicks-2004-degenerate-range'
  | 'unsupported'

export type AnnealTemperatureResult = {
  sequence: string
  length: number
  gcPercent: number
  gcPercentMin: number
  gcPercentMax: number
  tmC: number | null
  tmMinC: number | null
  tmMaxC: number | null
  method: AnnealTemperatureMethod
  variantCount: number
  note?: string
}

export type AnnealTemperatureOptions = {
  oligoConc?: number
  monoConc?: number
  mgConc?: number
  dntpConc?: number
}

type MismatchDeltaG37Result = {
  dG37: number
  unsupportedSteps: number
}

const iupacBases: Record<string, string[]> = {
  A: ['A'],
  C: ['C'],
  G: ['G'],
  T: ['T'],
  R: ['A', 'G'],
  Y: ['C', 'T'],
  S: ['G', 'C'],
  W: ['A', 'T'],
  K: ['G', 'T'],
  M: ['A', 'C'],
  B: ['C', 'G', 'T'],
  D: ['A', 'G', 'T'],
  H: ['A', 'C', 'T'],
  V: ['A', 'C', 'G'],
  N: ['A', 'C', 'G', 'T'],
}

// SantaLucia & Hicks 2004, Table 1. Units: dH kcal/mol, dS cal/mol/K, dG37 kcal/mol.
const sl2004Stacks: Record<string, StackThermo> = {
  AA: { dH: -7.6, dS: -21.3, dG37: -1.0 },
  TT: { dH: -7.6, dS: -21.3, dG37: -1.0 },
  AT: { dH: -7.2, dS: -20.4, dG37: -0.88 },
  TA: { dH: -7.2, dS: -21.3, dG37: -0.58 },
  CA: { dH: -8.5, dS: -22.7, dG37: -1.45 },
  TG: { dH: -8.5, dS: -22.7, dG37: -1.45 },
  GT: { dH: -8.4, dS: -22.4, dG37: -1.44 },
  AC: { dH: -8.4, dS: -22.4, dG37: -1.44 },
  CT: { dH: -7.8, dS: -21.0, dG37: -1.28 },
  AG: { dH: -7.8, dS: -21.0, dG37: -1.28 },
  GA: { dH: -8.2, dS: -22.2, dG37: -1.3 },
  TC: { dH: -8.2, dS: -22.2, dG37: -1.3 },
  CG: { dH: -10.6, dS: -27.2, dG37: -2.17 },
  GC: { dH: -9.8, dS: -24.4, dG37: -2.24 },
  GG: { dH: -8.0, dS: -19.9, dG37: -1.84 },
  CC: { dH: -8.0, dS: -19.9, dG37: -1.84 },
}

const sl2004MismatchDG37: Record<string, Record<string, Record<string, number | 'WC'>>> = {
  'GX/CY': {
    A: { A: 0.17, C: 0.81, G: -0.25, T: 'WC' },
    C: { A: 0.47, C: 0.79, G: 'WC', T: 0.62 },
    G: { A: -0.52, C: 'WC', G: -1.11, T: 0.08 },
    T: { A: 'WC', C: 0.98, G: -0.59, T: 0.45 },
  },
  'CX/GY': {
    A: { A: 0.43, C: 0.75, G: 0.03, T: 'WC' },
    C: { A: 0.79, C: 0.7, G: 'WC', T: 0.62 },
    G: { A: 0.11, C: 'WC', G: -0.11, T: -0.47 },
    T: { A: 'WC', C: 0.4, G: -0.32, T: -0.12 },
  },
  'AX/TY': {
    A: { A: 0.61, C: 0.88, G: 0.14, T: 'WC' },
    C: { A: 0.77, C: 1.33, G: 'WC', T: 0.64 },
    G: { A: 0.02, C: 'WC', G: -0.13, T: 0.71 },
    T: { A: 'WC', C: 0.73, G: 0.07, T: 0.69 },
  },
  'TX/AY': {
    A: { A: 0.69, C: 0.92, G: 0.42, T: 'WC' },
    C: { A: 1.33, C: 1.05, G: 'WC', T: 0.97 },
    G: { A: 0.74, C: 'WC', G: 0.44, T: 0.43 },
    T: { A: 'WC', C: 0.75, G: 0.34, T: 0.68 },
  },
}

function normalizeThermoDna(input: string) {
  return input.toUpperCase().replace(dnaAlphabet, '')
}

function isAtTerminal(base: string) {
  return base === 'A' || base === 'T'
}

function concreteVariantCount(sequence: string) {
  return [...sequence].reduce((count, base) => count * (iupacBases[base]?.length ?? 0), 1)
}

function gcPercentRange(sequence: string) {
  if (!sequence.length) return { min: 0, max: 0, average: 0 }
  let min = 0
  let max = 0
  let total = 0

  for (const base of sequence) {
    const possibilities = iupacBases[base] ?? []
    if (!possibilities.length) continue
    const gcOptions = possibilities.filter((option) => option === 'G' || option === 'C').length
    if (gcOptions > 0) max += 1
    if (gcOptions === possibilities.length) min += 1
    total += gcOptions / possibilities.length
  }

  return {
    min: (min / sequence.length) * 100,
    max: (max / sequence.length) * 100,
    average: (total / sequence.length) * 100,
  }
}

function expandDna(sequence: string, limit: number) {
  const variants: string[] = ['']

  for (const base of sequence) {
    const possibilities = iupacBases[base] ?? []
    if (!possibilities.length) return []
    const next: string[] = []
    for (const prefix of variants) {
      for (const possibility of possibilities) {
        next.push(prefix + possibility)
        if (next.length > limit) return []
      }
    }
    variants.splice(0, variants.length, ...next)
  }

  return variants
}

function calculateSl2004PerfectMatchTm(sequence: string, options: AnnealTemperatureOptions = {}) {
  let dH = 0.2
  let dS = -5.7

  for (let index = 0; index < sequence.length - 1; index += 1) {
    const stack = sl2004Stacks[sequence.slice(index, index + 2)]
    if (!stack) return null
    dH += stack.dH
    dS += stack.dS
  }

  if (isAtTerminal(sequence[0])) {
    dH += 2.2
    dS += 6.9
  }
  if (isAtTerminal(sequence[sequence.length - 1])) {
    dH += 2.2
    dS += 6.9
  }

  const oligoConc = options.oligoConc ?? defaultOligoConc
  const tm1M = (dH * 1000) / (dS + gasConstant * Math.log(oligoConc / 4)) - 273.15
  const gc = (sequence.match(/[GC]/g)?.length ?? 0) / sequence.length
  return applySaltCorrection(tm1M, gc, {
    model: 'owczarzy_2008',
    monoConc: options.monoConc ?? 0.05,
    mgConc: options.mgConc ?? 0.002,
    dntpConc: options.dntpConc ?? 0.0008,
    oligoLen: sequence.length,
  })
}

function complement(base: string) {
  return base === 'A' ? 'T' : base === 'T' ? 'A' : base === 'G' ? 'C' : base === 'C' ? 'G' : 'N'
}

function isWatsonCrick(topBase: string, bottomBase: string) {
  return complement(topBase) === bottomBase
}

function stepMismatchDG37(topLeft: string, topRight: string, bottomLeft: string, bottomRight: string) {
  if (isWatsonCrick(topLeft, bottomLeft) && isWatsonCrick(topRight, bottomRight)) {
    return sl2004Stacks[`${topLeft}${topRight}`]?.dG37 ?? null
  }

  if (isWatsonCrick(topLeft, bottomLeft)) {
    const table = sl2004MismatchDG37[`${topLeft}X/${bottomLeft}Y`]
    const value = table?.[topRight]?.[bottomRight]
    if (typeof value === 'number') return value
    if (value === 'WC') return sl2004Stacks[`${topLeft}${topRight}`]?.dG37 ?? null
  }

  if (isWatsonCrick(topRight, bottomRight)) {
    const table = sl2004MismatchDG37[`${bottomRight}X/${topRight}Y`]
    const value = table?.[bottomLeft]?.[topLeft]
    if (typeof value === 'number') return value
    if (value === 'WC') return sl2004Stacks[`${topLeft}${topRight}`]?.dG37 ?? null
  }

  return null
}

/**
 * SantaLucia & Hicks 2004 Table 2 provides internal single-mismatch dG37 terms,
 * but not the full dH/dS table needed for rigorous Tm. This helper is exposed for
 * future primer/template QC without mixing dG-only mismatch penalties into Tm.
 */
export function calculateSl2004MismatchDeltaG37(primer: string, templateAntiparallel: string): MismatchDeltaG37Result | null {
  const top = normalizeThermoDna(primer)
  const bottom = normalizeThermoDna(templateAntiparallel)
  if (!top || top.length !== bottom.length || !canonicalDna.test(top) || !canonicalDna.test(bottom)) return null

  let dG37 = 1.96
  let unsupportedSteps = 0

  for (let index = 0; index < top.length - 1; index += 1) {
    const stepDG = stepMismatchDG37(top[index], top[index + 1], bottom[index], bottom[index + 1])
    if (stepDG === null) {
      unsupportedSteps += 1
      continue
    }
    dG37 += stepDG
  }

  if (isAtTerminal(top[0])) dG37 += 0.05
  if (isAtTerminal(top[top.length - 1])) dG37 += 0.05

  return { dG37, unsupportedSteps }
}

export function calculateAnnealTemperature(sequence: string, options: AnnealTemperatureOptions = {}): AnnealTemperatureResult {
  const normalized = normalizeThermoDna(sequence)
  const gc = gcPercentRange(normalized)
  const base = {
    sequence: normalized,
    length: normalized.length,
    gcPercent: gc.average,
    gcPercentMin: gc.min,
    gcPercentMax: gc.max,
  }

  if (!normalized) {
    return {
      ...base,
      tmC: null,
      tmMinC: null,
      tmMaxC: null,
      method: 'unsupported',
      variantCount: 0,
      note: 'No DNA bases in selection.',
    }
  }

  if (normalized.length < 2) {
    return {
      ...base,
      tmC: null,
      tmMinC: null,
      tmMaxC: null,
      method: 'unsupported',
      variantCount: concreteVariantCount(normalized),
      note: 'Select at least 2 bases for Tm.',
    }
  }

  if (normalized.length > MAX_PRIMER_LENGTH) {
    return {
      ...base,
      tmC: null,
      tmMinC: null,
      tmMaxC: null,
      method: 'unsupported',
      variantCount: 0,
      note: `Tm is not calculated for oligos longer than ${MAX_PRIMER_LENGTH} bases.`,
    }
  }

  if (canonicalDna.test(normalized)) {
    const primd = calcPrimdTm(normalized, {
      oligoConc: options.oligoConc,
      monoConc: options.monoConc,
      mgConc: options.mgConc,
      dntpConc: options.dntpConc,
    })
    return {
      ...base,
      tmC: primd.tm,
      tmMinC: primd.tm,
      tmMaxC: primd.tm,
      method: 'primd-santalucia-1998',
      variantCount: 1,
    }
  }

  const variantCount = concreteVariantCount(normalized)
  if (variantCount > expansionLimit) {
    return {
      ...base,
      tmC: null,
      tmMinC: null,
      tmMaxC: null,
      method: 'unsupported',
      variantCount,
      note: `Too many degenerate variants to expand (${variantCount.toLocaleString()}).`,
    }
  }

  const variants = expandDna(normalized, expansionLimit)
  const temperatures = variants.flatMap((variant) => {
    const tm = calculateSl2004PerfectMatchTm(variant, options)
    return tm === null || Number.isNaN(tm) ? [] : [tm]
  })
  if (!temperatures.length) {
    return {
      ...base,
      tmC: null,
      tmMinC: null,
      tmMaxC: null,
      method: 'unsupported',
      variantCount,
      note: 'Could not calculate Tm for this degenerate sequence.',
    }
  }

  const tmMinC = Math.min(...temperatures)
  const tmMaxC = Math.max(...temperatures)
  return {
    ...base,
    tmC: temperatures.reduce((sum, temperature) => sum + temperature, 0) / temperatures.length,
    tmMinC,
    tmMaxC,
    method: variantCount === 1 ? 'santalucia-hicks-2004' : 'santalucia-hicks-2004-degenerate-range',
    variantCount,
  }
}
