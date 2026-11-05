import { complementDnaBase, extractRange, normalizeDna } from './sequence'
import type { Topology } from './types'

/** Anhydrous deoxyribonucleoside monophosphate residue masses (Da). */
const RESIDUE_MASS: Record<string, number> = {
  A: 313.2,
  C: 289.2,
  G: 329.2,
  T: 304.2,
}

/** IUPAC → concrete bases for averaging ambiguous positions. */
const IUPAC_BASES: Record<string, string[]> = {
  A: ['A'],
  C: ['C'],
  G: ['G'],
  T: ['T'],
  U: ['T'],
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

/** Water added per strand for free 5′-OH / 3′-OH ends (linear dsDNA). */
const LINEAR_END_WATER_DA = 18.0

function averageResidueMass(base: string): number {
  const options = IUPAC_BASES[base] ?? IUPAC_BASES.N
  return options.reduce((sum, b) => sum + (RESIDUE_MASS[b] ?? 308.9), 0) / options.length
}

/** Mass of one DNA strand from its 5′→3′ bases (anhydrous residues only). */
export function dnaStrandResidueMassDa(sequence: string): number {
  let mass = 0
  for (const base of normalizeDna(sequence)) {
    mass += averageResidueMass(base)
  }
  return mass
}

/**
 * Double-stranded DNA molecular weight (Da).
 * Circular: sum of both strand residues (covalently closed).
 * Linear: same, plus 36 Da for terminal OH groups on both strands.
 */
export function dsDnaMolecularWeightDa(sequence: string, topology: Topology): number {
  const top = normalizeDna(sequence)
  if (!top) return 0
  const bottom = top
    .split('')
    .map((base) => complementDnaBase(base))
    .join('')
  const mass = dnaStrandResidueMassDa(top) + dnaStrandResidueMassDa(bottom)
  const withEnds = topology === 'circular' ? mass : mass + 2 * LINEAR_END_WATER_DA
  return Math.round(withEnds)
}

/**
 * MW for a sticky restriction fragment from per-strand template spans.
 * `forward` / `reverse` are 0-based half-open ranges on the template.
 */
export function stickyDsDnaMolecularWeightDa(
  template: string,
  forward: { start: number; end: number },
  reverse: { start: number; end: number },
): number {
  const top = extractRange(template, forward.start, forward.end)
  const reverseTemplate = extractRange(template, reverse.start, reverse.end)
  const bottom = reverseTemplate
    .split('')
    .map((base) => complementDnaBase(base))
    .join('')
  const mass = dnaStrandResidueMassDa(top) + dnaStrandResidueMassDa(bottom) + 2 * LINEAR_END_WATER_DA
  return Math.round(mass)
}

export type DnaMwStats = {
  lengthBp: number
  mwDa: number
  /** Micrograms per picomole */
  ugPerPmol: number
  /** Picomoles per microgram */
  pmolPerUg: number
}

export function dnaMwStats(mwDa: number, lengthBp: number): DnaMwStats {
  const ugPerPmol = mwDa / 1_000_000
  const pmolPerUg = mwDa > 0 ? 1_000_000 / mwDa : 0
  return { lengthBp, mwDa, ugPerPmol, pmolPerUg }
}

export function formatMwDa(mwDa: number): string {
  return Math.round(mwDa).toLocaleString('en-US')
}

export function formatUgPerPmol(value: number): string {
  return value.toFixed(3)
}

export function formatPmolPerUg(value: number): string {
  return value.toFixed(3)
}
