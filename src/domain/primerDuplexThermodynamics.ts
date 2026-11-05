import { applySaltCorrection } from '@shandley/primd'
import { buildGlyphsFromLayout } from './primerBindingAnalysis'
import { reverseComplement } from './sequence'
import { calculatePrimerDuplexVariantRange } from './primerDuplexVariantRange'
import type { PrimerGlyph } from './primerLayoutTypes'
import type { PrimerBindingLayout } from './types'

/*!
 * Mismatch parameter tables adapted from Biopython Bio.SeqUtils.MeltingTemp.
 * Copyright 2004–2008 Sebastian Bassi; copyright 2013–2018 Markus Piotrowski.
 * Copyright (c) 1999–2026 The Biopython Contributors. All rights reserved.
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
// Internal DNA mismatch nearest-neighbor ΔH (kcal/mol) and ΔS (cal/mol/K):
// Allawi & SantaLucia (1997–1998), Peyret et al. (1999), as tabulated in
// Biopython Bio.SeqUtils.MeltingTemp DNA_IMM1 (BSD-3-Clause / Biopython license).
// Keys read 5′ XY 3′ / 3′ ZW 5′; reversing a key swaps the strands.
const mismatchStacks: Record<string, readonly [number, number]> = {
  'AG/TT': [1, 0.9], 'AT/TG': [-2.5, -8.3], 'CG/GT': [-4.1, -11.7],
  'CT/GG': [-2.8, -8], 'GG/CT': [3.3, 10.4], 'GG/TT': [5.8, 16.3],
  'GT/CG': [-4.4, -12.3], 'GT/TG': [4.1, 9.5], 'TG/AT': [-0.1, -1.7],
  'TG/GT': [-1.4, -6.2], 'TT/AG': [-1.3, -5.3], 'AA/TG': [-0.6, -2.3],
  'AG/TA': [-0.7, -2.3], 'CA/GG': [-0.7, -2.3], 'CG/GA': [-4, -13.2],
  'GA/CG': [-0.6, -1], 'GG/CA': [0.5, 3.2], 'TA/AG': [0.7, 0.7], 'TG/AA': [3, 7.4],
  'AC/TT': [0.7, 0.2], 'AT/TC': [-1.2, -6.2], 'CC/GT': [-0.8, -4.5],
  'CT/GC': [-1.5, -6.1], 'GC/CT': [2.3, 5.4], 'GT/CC': [5.2, 13.5],
  'TC/AT': [1.2, 0.7], 'TT/AC': [1, 0.7], 'AA/TC': [2.3, 4.6],
  'AC/TA': [5.3, 14.6], 'CA/GC': [1.9, 3.7], 'CC/GA': [0.6, -0.6],
  'GA/CC': [5.2, 14.2], 'GC/CA': [-0.7, -3.8], 'TA/AC': [3.4, 8],
  'TC/AA': [7.6, 20.2], 'AA/TA': [1.2, 1.7], 'CA/GA': [-0.9, -4.2],
  'GA/CA': [-2.9, -9.8], 'TA/AA': [4.7, 12.9], 'AC/TC': [0, -4.4],
  'CC/GC': [-1.5, -7.2], 'GC/CC': [3.6, 8.9], 'TC/AC': [6.1, 16.4],
  'AG/TG': [-3.1, -9.5], 'CG/GG': [-4.9, -15.3], 'GG/CG': [-6, -15.8],
  'TG/AG': [1.6, 3.6], 'AT/TT': [-2.7, -10.8], 'CT/GT': [-5, -15.8],
  'GT/CT': [-2.2, -8.4], 'TT/AT': [0.2, -1.5],
}

// Terminal mismatch ΔH/ΔS (SantaLucia & Peyret, 2001), adapted from Biopython DNA_TMM1
// under the BSD license above. These flank internal loops of two or more bases.
const loopTerminalStacks: Record<string, readonly [number, number]> = {
  'AA/TA': [-3.1, -7.8], 'TA/AA': [-2.5, -6.3], 'CA/GA': [-4.3, -10.7], 'GA/CA': [-8, -22.5],
  'AC/TC': [-0.1, 0.5], 'TC/AC': [-0.7, -1.3], 'CC/GC': [-2.1, -5.1], 'GC/CC': [-3.9, -10.6],
  'AG/TG': [-1.1, -2.1], 'TG/AG': [-1.1, -2.7], 'CG/GG': [-3.8, -9.5], 'GG/CG': [-0.7, -19.2],
  'AT/TT': [-2.4, -6.5], 'TT/AT': [-3.2, -8.9], 'CT/GT': [-6.1, -16.9], 'GT/CT': [-7.4, -21.2],
  'AA/TC': [-1.6, -4], 'AC/TA': [-1.8, -3.8], 'CA/GC': [-2.6, -5.9], 'CC/GA': [-2.7, -6],
  'GA/CC': [-5, -13.8], 'GC/CA': [-3.2, -7.1], 'TA/AC': [-2.3, -5.9], 'TC/AA': [-2.7, -7],
  'AC/TT': [-0.9, -1.7], 'AT/TC': [-2.3, -6.3], 'CC/GT': [-3.2, -8], 'CT/GC': [-3.9, -10.6],
  'GC/CT': [-4.9, -13.5], 'GT/CC': [-3, -7.8], 'TC/AT': [-2.5, -6.3], 'TT/AC': [-0.7, -1.2],
  'AA/TG': [-1.9, -4.4], 'AG/TA': [-2.5, -5.9], 'CA/GG': [-3.9, -9.6], 'CG/GA': [-6, -15.5],
  'GA/CG': [-4.3, -11.1], 'GG/CA': [-4.6, -11.4], 'TA/AG': [-2, -4.7], 'TG/AA': [-2.4, -5.8],
  'AG/TT': [-3.2, -8.7], 'AT/TG': [-3.5, -9.4], 'CG/GT': [-3.8, -9], 'CT/GG': [-6.6, -18.7],
  'GG/CT': [-5.7, -15.9], 'GT/CG': [-5.9, -16.1], 'TG/AT': [-3.9, -10.5], 'TT/AG': [-3.6, -9.8],
}

// Symmetric loop initiation ΔG°37 (kcal/mol), indexed by total unpaired
// nucleotides on both strands: SantaLucia & Hicks 2004, Table 4.
const internalLoopFreeEnergy: Record<number, number> = {
  4: 3.6, 6: 4.4, 8: 4.8, 10: 4.9, 12: 5.2, 14: 5.4,
  16: 5.6, 18: 5.8, 20: 5.9, 22: 6.0, 24: 6.1, 26: 6.3, 28: 6.4, 30: 6.6,
}

function loopEntropy(unpaired: number): number {
  const freeEnergy = internalLoopFreeEnergy[unpaired] ?? (6.6 + 2.44 * 0.001987 * 310.15 * Math.log(unpaired / 30))
  return -1000 * freeEnergy / 310.15 // ΔH° = 0, ΔG°37 = ΔH° − TΔS°
}

// SantaLucia & Hicks 2004 perfect-pair stacks, in the same units.
const matchedStacks: Record<string, readonly [number, number]> = {
  AA: [-7.6, -21.3], TT: [-7.6, -21.3], AT: [-7.2, -20.4], TA: [-7.2, -21.3],
  CA: [-8.5, -22.7], TG: [-8.5, -22.7], GT: [-8.4, -22.4], AC: [-8.4, -22.4],
  CT: [-7.8, -21], AG: [-7.8, -21], GA: [-8.2, -22.2], TC: [-8.2, -22.2],
  CG: [-10.6, -27.2], GC: [-9.8, -24.4], GG: [-8, -19.9], CC: [-8, -19.9],
}
const complements: Record<string, string> = { A: 'T', C: 'G', G: 'C', T: 'A' }

export type PrimerDuplexTmResult =
  | { status: 'estimated'; tmC: number; mismatchCount: number; mismatchPositions: number[]; deltaH: number; deltaS: number; method: string; excludedFivePrimeBases?: number; modeledFivePrimeDanglingBases?: number; terminalMismatchPositions?: number[]; approximateTandemMismatch?: boolean; assumedSubstitutions?: boolean }
  | { status: 'estimated-range'; tmCRange: { min: number; max: number }; deltaHRange: { min: number; max: number }; deltaSRange: { min: number; max: number }; totalVariantCount: number; evaluatedVariantCount: number; estimatedVariantCount: number; unsupportedVariantCount: number; unexaminedVariantCount: 0; approximateTandemMismatchVariantCount: number; assumedEqualVariantAbundance: true; oligoConcPerVariant: number; method: string; excludedFivePrimeBases?: number; modeledFivePrimeDanglingBases?: number; assumedSubstitutions?: boolean }
  | { status: 'unsupported'; reason: string; mismatchPositions?: number[]; variantCoverage?: { totalVariantCount: number; evaluatedVariantCount: number; estimatedVariantCount: number; unsupportedVariantCount: number | null; unexaminedVariantCount: number } }

export type PrimerDuplexTmConditions = {
  /** Concentrations are molar, matching calculateAnnealTemperature options. */
  monoConc?: number
  mgConc?: number
  dntpConc?: number
  oligoConc?: number
  /** Primer 5′ tail sequence in oligo orientation; only its base adjacent to the duplex is modeled. */
  fivePrimeDangling?: string
}

// Bommarito et al. (2000), NAR 28:1929–1934, DNA 5′ dangling-end ΔH (kcal/mol), ΔS (cal/mol/K).
// Keys are the oligo 5′→3′ dinucleotide and opposing target 3′→5′ dinucleotide.
const fivePrimeDanglingStacks: Record<string, readonly [number, number]> = {
  'AA/.T': [0.2, 2.3], 'AC/.G': [-6.3, -17.1], 'AG/.C': [-3.7, -10.0], 'AT/.A': [-2.9, -7.6],
  'CA/.T': [0.6, 3.3], 'CC/.G': [-4.4, -12.6], 'CG/.C': [-4.0, -11.9], 'CT/.A': [-4.1, -13.0],
  'GA/.T': [-1.1, -1.6], 'GC/.G': [-5.1, -14.0], 'GG/.C': [-3.9, -10.9], 'GT/.A': [-4.2, -15.0],
  'TA/.T': [-6.9, -20.0], 'TC/.G': [-4.0, -10.9], 'TG/.C': [-4.9, -13.8], 'TT/.A': [-0.2, -0.5],
}

/** Primer 5′→3′ and its aligned target 3′→5′. Never extrapolate missing parameters. */
export function calculatePrimerDuplexTm(primer: string, target: string, conditions: PrimerDuplexTmConditions = {}): PrimerDuplexTmResult {
  const top = primer.toUpperCase()
  const bottom = target.toUpperCase()
  if (top.length < 2 || top.length !== bottom.length || !/^[ACGT]+$/.test(top) || !/^[ACGT]+$/.test(bottom)) {
    return { status: 'unsupported', reason: 'Ambiguous bases or an incomplete duplex' }
  }
  if (top === [...bottom].reverse().join('')) {
    return { status: 'unsupported', reason: 'Self-complementary duplex requires a different concentration model' }
  }
  const mismatches = [...top].map((base, index) => complements[base] !== bottom[index])
  const mismatchPositions = mismatches.flatMap((mismatch, index) => mismatch ? [index + 1] : [])
  const mismatchCount = mismatchPositions.length
  // The terminal-mismatch table describes a single mismatch adjacent to a
  // Watson–Crick pair. Tandem mismatches touching an end lack validated values.
  if ((mismatches[0] && mismatches[1]) || (mismatches.at(-1) && mismatches.at(-2))) {
    return { status: 'unsupported', reason: 'Adjacent terminal mismatches are unsupported', mismatchPositions }
  }
  const terminalMismatchPositions = [0, mismatches.length - 1]
    .filter((index) => mismatches[index])
    .map((index) => index + 1)
  const loopEdges = new Set<number>()
  const loops: number[] = []
  for (let index = 0; index < mismatches.length;) {
    if (!mismatches[index]) { index += 1; continue }
    const start = index
    while (index < mismatches.length && mismatches[index]) index += 1
    if (index - start >= 2) {
      loopEdges.add(start - 1)
      loopEdges.add(index - 1)
      loops.push(index - start)
    }
  }
  const approximateTandemMismatch = loops.length > 0

  let dH = 0.2
  let dS = -5.7 + loops.reduce((total, length) => total + loopEntropy(length * 2), 0)
  // A terminal mismatch is removed before assessing the terminal paired-base
  // penalty, as in the nearest-neighbor convention. For a one-pair core that
  // pair is both ends and receives both end contributions.
  const terminalPairIndices = [mismatches[0] ? 1 : 0, mismatches.at(-1) ? top.length - 2 : top.length - 1]
  for (const index of terminalPairIndices) {
    if (top[index] === 'A' || top[index] === 'T') { dH += 2.2; dS += 6.9 }
  }
  // Add the measured one-nucleotide 5′ dangling contribution. For longer
  // tails, only the nucleotide directly adjoining the duplex has a table entry.
  const dangling = conditions.fivePrimeDangling?.toUpperCase() ?? ''
  if (dangling) {
    if (mismatches[0]) return { status: 'unsupported', reason: 'Combined terminal mismatch and dangling end is unsupported', mismatchPositions }
    if (!/^[ACGT]+$/.test(dangling)) return { status: 'unsupported', reason: 'Ambiguous 5′ dangling-end base', mismatchPositions }
    const danglingStack = fivePrimeDanglingStacks[`${dangling.at(-1)}${top[0]}/.${bottom[0]}`]
    if (!danglingStack) return { status: 'unsupported', reason: 'Missing 5′ dangling-end parameters', mismatchPositions }
    dH += danglingStack[0]
    dS += danglingStack[1]
  }
  for (let index = 0; index < top.length - 1; index += 1) {
    let stack: readonly [number, number] | undefined
    if (mismatches[index] && mismatches[index + 1]) continue
    if (!mismatches[index] && !mismatches[index + 1]) {
      stack = matchedStacks[top.slice(index, index + 2)]
    } else {
      const key = mismatches[0] && index === 0
        ? `${[...bottom.slice(0, 2)].reverse().join('')}/${[...top.slice(0, 2)].reverse().join('')}`
        : `${top.slice(index, index + 2)}/${bottom.slice(index, index + 2)}`
      const isTerminalMismatchStack = terminalMismatchPositions.includes(index + 1) || terminalMismatchPositions.includes(index + 2)
      const table = loopEdges.has(index) || isTerminalMismatchStack ? loopTerminalStacks : mismatchStacks
      stack = isTerminalMismatchStack
        ? table[key]
        : table[key] ?? table[[...key].reverse().join('')]
    }
    if (!stack) return { status: 'unsupported', reason: 'Missing nearest-neighbor parameters' }
    dH += stack[0]
    dS += stack[1]
  }
  const tm1M = dH * 1000 / (dS + 1.987 * Math.log((conditions.oligoConc ?? 250e-9) / 4)) - 273.15
  const gc = [...top].filter((base) => base === 'G' || base === 'C').length / top.length
  const tmC = applySaltCorrection(tm1M, gc, {
    model: 'owczarzy_2008',
    monoConc: conditions.monoConc ?? 0.05,
    mgConc: conditions.mgConc ?? 0.002,
    dntpConc: conditions.dntpConc ?? 0.0008,
    oligoLen: top.length,
  })
  if (!Number.isFinite(tmC)) return { status: 'unsupported', reason: 'Thermodynamic calculation failed' }
  return {
    status: 'estimated', tmC, mismatchCount, mismatchPositions, deltaH: dH, deltaS: dS,
    method: 'SantaLucia-Hicks 2004 / terminal and internal mismatch / Bommarito 2000 dangling-end nearest-neighbor',
    ...(dangling && { modeledFivePrimeDanglingBases: 1 }),
    ...(terminalMismatchPositions.length && { terminalMismatchPositions }),
    ...(approximateTandemMismatch && { approximateTandemMismatch: true }),
  }
}

/** Interpret equal-length internal blocks as substitutions when both flanks fix their order. */
function inferSubstitutionBlocks(glyphs: PrimerGlyph[]): { glyphs: PrimerGlyph[]; assumed: boolean } {
  const result = [...glyphs]
  let assumed = false
  for (let start = 0; start < result.length;) {
    if (result[start]!.kind !== 'template-gap' && result[start]!.templateIndex !== undefined) { start += 1; continue }
    let end = start
    while (end < result.length && (result[end]!.kind === 'template-gap' || result[end]!.templateIndex === undefined)) end += 1
    const block = result.slice(start, end)
    const gaps = block.filter((glyph) => glyph.kind === 'template-gap')
    const unpaired = block.filter((glyph) => glyph.templateIndex === undefined)
    const before = result[start - 1]?.templateIndex
    const after = result[end]?.templateIndex
    const prior = result[start - 2]?.templateIndex
    const following = result[end + 1]?.templateIndex
    const direction = before !== undefined && prior !== undefined && Math.abs(before - prior) === 1
      ? before - prior
      : after !== undefined && following !== undefined && Math.abs(following - after) === 1 ? following - after : 0
    if (gaps.length && gaps.length === unpaired.length && before !== undefined && after !== undefined && direction !== 0) {
      const positions = gaps.map((glyph) => glyph.templateIndex!).sort((a, b) => direction * (a - b))
      if (positions[0] === before + direction && positions.at(-1) === after - direction) {
        let index = 0
        for (let cursor = start; cursor < end; cursor += 1) {
          const glyph = result[cursor]!
          if (glyph.templateIndex === undefined) result[cursor] = { ...glyph, kind: 'mismatch', templateIndex: positions[index++] }
        }
        result.splice(start, end - start, ...result.slice(start, end).filter((glyph) => glyph.kind !== 'template-gap'))
        end = start + unpaired.length
        assumed = true
      }
    }
    start = end
  }
  return { glyphs: result, assumed }
}

/** Ignore a 5′ overhang and identify equal-length internal substitution blocks. */
export function primerDuplexTmForLayout(template: string, layout: PrimerBindingLayout, primerSequence?: string, conditions: PrimerDuplexTmConditions = {}): PrimerDuplexTmResult {
  const inferred = inferSubstitutionBlocks(buildGlyphsFromLayout(template.toUpperCase(), layout))
  const glyphs = inferred.glyphs
  let excludedFivePrimeBases = 0
  if (glyphs.some((glyph) => glyph.templateIndex === undefined)) {
    const parts = layout.components.map((component) => component.primerBases.toUpperCase())
    const sequence = primerSequence?.toUpperCase()
    const orientations = [layout.components, [...layout.components].reverse()]
      .flatMap((components, index) => {
        const joined = (index === 0 ? parts : [...parts].reverse()).join('')
        if (!sequence) return []
        // Reverse-complemented component strings also reverse their oligo order.
        return [
          ...(joined === sequence ? [components] : []),
          ...(reverseComplement(joined) === sequence ? [[...components].reverse()] : []),
        ]
      })
      .map((ordered) => {
        const firstPaired = ordered.findIndex((component) => component.templateStart !== undefined)
        if (firstPaired < 0) return -1
        const count = ordered.slice(0, firstPaired).reduce((sum, component) => sum + component.primerBases.length, 0)
        return count === glyphs.filter((glyph) => glyph.templateIndex === undefined).length ? count : -1
      })
    if (!orientations.length || orientations.some((count) => count < 0 || count !== orientations[0])) {
      return { status: 'unsupported', reason: 'Unpaired bases or alignment gaps' }
    }
    excludedFivePrimeBases = orientations[0]!
  }
  if (glyphs.some((glyph) => glyph.kind === 'template-gap')) {
    return { status: 'unsupported', reason: 'Unpaired bases or alignment gaps' }
  }
  const ordered = glyphs.filter((glyph) => glyph.templateIndex !== undefined).toSorted((a, b) => layout.strand === 'forward'
    ? a.templateIndex! - b.templateIndex!
    : b.templateIndex! - a.templateIndex!)
  if (ordered.some((glyph, index) => index > 0 && Math.abs(glyph.templateIndex! - ordered[index - 1]!.templateIndex!) !== 1)) {
    return { status: 'unsupported', reason: 'Discontinuous alignment' }
  }
  const primer = ordered.map((glyph) => glyph.char).join('').toUpperCase()
  const target = ordered.map((glyph) => {
    const base = (template[glyph.templateIndex!] ?? 'N').toUpperCase()
    return layout.strand === 'forward' ? (complements[base] ?? 'N') : base
  }).join('')
  if (!/^[ACGT]+$/.test(target)) {
    return { status: 'unsupported', reason: 'Ambiguous template bases do not define a single target duplex; primer variants were not evaluated' }
  }
  const fivePrimeDangling = excludedFivePrimeBases && primerSequence
    ? primerSequence.slice(0, excludedFivePrimeBases)
    : ''
  if (/[RYSWKMBDHVN]/.test(fivePrimeDangling)) {
    return { status: 'unsupported', reason: 'IUPAC bases in the 5′ tail are not included in duplex variant enumeration' }
  }
  if (/[RYSWKMBDHVN]/.test(primer)) {
    const variants = calculatePrimerDuplexVariantRange(primer, target, {
      maxVariants: 256,
      calculate: (variantPrimer, variantTarget, totalVariantCount) => calculatePrimerDuplexTm(variantPrimer, variantTarget, {
        ...conditions,
        oligoConc: (conditions.oligoConc ?? 250e-9) / totalVariantCount,
        fivePrimeDangling,
      }),
    })
    if (variants.status === 'unsupported') {
      const reason = variants.unexaminedVariantCount
        ? 'Variant count exceeds the exhaustive enumeration limit; no Tm range was computed'
        : variants.reason
      return {
        status: 'unsupported', reason: reason ?? 'No expanded variant has supported thermodynamic parameters',
        variantCoverage: {
          totalVariantCount: variants.totalVariantCount,
          evaluatedVariantCount: variants.evaluatedVariantCount,
          estimatedVariantCount: variants.estimatedVariantCount,
          unsupportedVariantCount: variants.unsupportedVariantCount,
          unexaminedVariantCount: variants.unexaminedVariantCount,
        },
      }
    }
    return {
      status: 'estimated-range',
      tmCRange: variants.tmCRange!, deltaHRange: variants.deltaHRange!, deltaSRange: variants.deltaSRange!,
      totalVariantCount: variants.totalVariantCount, evaluatedVariantCount: variants.evaluatedVariantCount,
      estimatedVariantCount: variants.estimatedVariantCount, unsupportedVariantCount: variants.unsupportedVariantCount!,
      unexaminedVariantCount: 0, approximateTandemMismatchVariantCount: variants.approximateTandemMismatchVariantCount,
      assumedEqualVariantAbundance: true,
      oligoConcPerVariant: (conditions.oligoConc ?? 250e-9) / variants.totalVariantCount,
      ...(variants.modeledFivePrimeDanglingBases && { modeledFivePrimeDanglingBases: variants.modeledFivePrimeDanglingBases }),
      method: 'Exhaustive IUPAC primer variant range / ' + (fivePrimeDangling ? 'with ' : 'without ') + '5′ dangling-end contribution',
      ...(excludedFivePrimeBases && { excludedFivePrimeBases }),
      ...(inferred.assumed && { assumedSubstitutions: true }),
    }
  }
  const result = calculatePrimerDuplexTm(primer, target, { ...conditions, fivePrimeDangling })
  if (!excludedFivePrimeBases && !inferred.assumed) return result
  return {
    ...result,
    ...('mismatchPositions' in result && result.mismatchPositions && { mismatchPositions: result.mismatchPositions.map((position: number) => position + excludedFivePrimeBases) }),
    ...(result.status === 'estimated' && result.terminalMismatchPositions && { terminalMismatchPositions: result.terminalMismatchPositions.map((position) => position + excludedFivePrimeBases) }),
    ...(result.status === 'estimated' && { excludedFivePrimeBases }),
    ...(result.status === 'estimated' && inferred.assumed && { assumedSubstitutions: true }),
  }
}
