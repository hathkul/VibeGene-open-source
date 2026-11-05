import { applySaltCorrection, calcNNThermo } from '@shandley/primd'
import { normalizeDna } from './sequence'
import { MAX_PRIMER_LENGTH } from './primerLimits'

const gasConstant = 1.987
/** Default primer concentration (mol/L), matching primd / anneal Tm. */
const defaultOligoConc = 250e-9
const tempK37 = 310.15
const maxReportedStructures = 40
const maxReportedPairStructures = 60

/** Turner 2004 hairpin loop initiation penalties (kcal/mol). */
const HAIRPIN_LOOP_PENALTY: Record<number, number> = {
  3: 5.4,
  4: 4.1,
  5: 4.4,
  6: 4.7,
  7: 5.0,
  8: 5.1,
  9: 5.2,
}

export type PrimerSecondaryStructureKind = 'hairpin' | 'self-dimer' | 'hetero-dimer'

export type PrimerSecondaryStructure = {
  id: string
  kind: PrimerSecondaryStructureKind
  /** Which oligo(s) this structure belongs to, e.g. "Primer 1" or "Primer 1 × Primer 2". */
  source: string
  /** Compact human label, e.g. "Hairpin · stem 4 bp · loop 5 nt". */
  label: string
  /** 1-based inclusive ranges for UI. */
  detail: string
  /** Stem duplex written 5′→3′ (top) / 3′→5′ (bottom). */
  topStem: string
  bottomStem: string
  stemLength: number
  loopLength: number | null
  dG37: number
  tmC: number | null
}

type StemThermo = {
  dH: number
  dS: number
  /** ΔG37 under the model used for this structure (kcal/mol). */
  dG37: number
  tmC: number | null
}

function complementBase(base: string) {
  return base === 'A' ? 'T' : base === 'T' ? 'A' : base === 'G' ? 'C' : base === 'C' ? 'G' : 'N'
}

function isWatsonCrick(a: string, b: string) {
  return complementBase(a) === b
}

function hairpinLoopPenalty(loopSize: number) {
  if (loopSize < 3) return Number.POSITIVE_INFINITY
  if (loopSize <= 9) return HAIRPIN_LOOP_PENALTY[loopSize] ?? 5.2
  return 5.2 + 1.75 * 1.987e-3 * tempK37 * Math.log(loopSize / 9)
}

function saltCorrectedTmFrom1M(tm1M: number, stemSeq: string) {
  const gc = (stemSeq.match(/[GC]/g)?.length ?? 0) / stemSeq.length
  return applySaltCorrection(tm1M, gc, {
    model: 'owczarzy_2008',
    monoConc: 0.05,
    mgConc: 0.002,
    dntpConc: 0.0008,
    oligoLen: stemSeq.length,
  })
}

/**
 * Full hairpin thermodynamics: stem NN stacks plus Turner loop initiation.
 * Loop ΔG is treated as temperature-independent so Tm solves
 * dH + ΔG_loop − T·(dS/1000) = 0 (intramolecular; no CT/4 term).
 */
function hairpinThermo(stemSeq: string, loopSize: number): StemThermo | null {
  if (stemSeq.length < 2) return null
  const { dH, dS } = calcNNThermo(stemSeq)
  if (!Number.isFinite(dH) || !Number.isFinite(dS) || dS === 0) return null
  const loopPenalty = hairpinLoopPenalty(loopSize)
  if (!Number.isFinite(loopPenalty)) return null

  const dG37 = dH - tempK37 * (dS / 1000) + loopPenalty
  // Effective enthalpy includes the loop initiation term for the two-state Tm.
  const tm1M = ((dH + loopPenalty) * 1000) / dS - 273.15
  if (!Number.isFinite(tm1M)) return null
  return { dH, dS, dG37, tmC: saltCorrectedTmFrom1M(tm1M, stemSeq) }
}

/**
 * Intermolecular dimers include R·ln(CT/4) so ΔG37 and Tm agree at oligo concentration.
 */
function dimerStemThermo(stemSeq: string): StemThermo | null {
  if (stemSeq.length < 2) return null
  const { dH, dS } = calcNNThermo(stemSeq)
  if (!Number.isFinite(dH) || !Number.isFinite(dS) || dS === 0) return null

  const concEntropy = gasConstant * Math.log(defaultOligoConc / 4)
  const dG37 = dH - tempK37 * ((dS + concEntropy) / 1000)
  const tm1M = (dH * 1000) / (dS + concEntropy) - 273.15
  return { dH, dS, dG37, tmC: saltCorrectedTmFrom1M(tm1M, stemSeq) }
}

function reverseString(value: string) {
  return value.split('').reverse().join('')
}

/**
 * Predict intramolecular hairpins and intermolecular self-dimers for a primer oligo.
 * Structures are ranked by ΔG37 (most stable first). Only thermodynamically favorable
 * folds (ΔG37 < 0) with stem ≥ 3 bp are reported.
 */
export function predictPrimerSecondaryStructures(
  sequence: string,
  source = 'Primer',
): PrimerSecondaryStructure[] {
  const seq = normalizeDna(sequence)
  if (seq.length < 8 || seq.length > MAX_PRIMER_LENGTH) return []

  const hairpins = collectHairpins(seq, source)
  const dimers = collectIntermolecularDimers(seq, seq, {
    kind: 'self-dimer',
    source,
    labelA: source,
    labelB: source,
    idPrefix: `self:${source}`,
  })
  const merged = [...hairpins, ...dimers].sort((a, b) => a.dG37 - b.dG37 || b.stemLength - a.stemLength)
  return dedupeStructures(merged).slice(0, maxReportedStructures)
}

/**
 * Pair analysis for PCR: each primer's hairpins/self-dimers plus heterodimers (primer-dimers).
 */
export function predictPrimerPairStructures(
  forwardSequence: string,
  reverseSequence: string,
  labels: { forward: string; reverse: string } = { forward: 'Primer 1', reverse: 'Primer 2' },
): PrimerSecondaryStructure[] {
  const forward = normalizeDna(forwardSequence)
  const reverse = normalizeDna(reverseSequence)
  if (forward.length > MAX_PRIMER_LENGTH || reverse.length > MAX_PRIMER_LENGTH) return []
  const forwardHits = forward.length >= 8 ? predictPrimerSecondaryStructures(forward, labels.forward) : []
  const reverseHits = reverse.length >= 8 ? predictPrimerSecondaryStructures(reverse, labels.reverse) : []
  const hetero =
    forward.length >= 3 && reverse.length >= 3
      ? collectIntermolecularDimers(forward, reverse, {
          kind: 'hetero-dimer',
          source: `${labels.forward} × ${labels.reverse}`,
          labelA: labels.forward,
          labelB: labels.reverse,
          idPrefix: `hetero:${labels.forward}:${labels.reverse}`,
        })
      : []

  const merged = [...forwardHits, ...reverseHits, ...hetero].sort(
    (a, b) => a.dG37 - b.dG37 || b.stemLength - a.stemLength,
  )
  return dedupeStructures(merged).slice(0, maxReportedPairStructures)
}

function collectHairpins(seq: string, source: string): PrimerSecondaryStructure[] {
  const n = seq.length
  const found: PrimerSecondaryStructure[] = []

  for (let i = 0; i < n - 6; i += 1) {
    for (let stemLen = 3; i + stemLen * 2 + 3 <= n; stemLen += 1) {
      const loopStart = i + stemLen
      for (let j = loopStart + 3; j + stemLen <= n; j += 1) {
        let stemOk = true
        const topChars: string[] = []
        const bottomChars: string[] = []
        for (let k = 0; k < stemLen; k += 1) {
          const left = seq[i + k]!
          const right = seq[j + stemLen - 1 - k]!
          if (!isWatsonCrick(left, right)) {
            stemOk = false
            break
          }
          topChars.push(left)
          bottomChars.push(right)
        }
        if (!stemOk) continue

        const loopSize = j - loopStart
        const stemSeq = topChars.join('')
        const thermo = hairpinThermo(stemSeq, loopSize)
        if (!thermo || !(thermo.dG37 < 0) || thermo.tmC === null || !Number.isFinite(thermo.tmC)) continue

        const leftStart = i + 1
        const leftEnd = i + stemLen
        const rightStart = j + 1
        const rightEnd = j + stemLen
        found.push({
          id: `hairpin:${source}:${i}-${stemLen}-${j}`,
          kind: 'hairpin',
          source,
          label: `Hairpin · stem ${stemLen} bp · loop ${loopSize} nt`,
          detail: `5′ ${leftStart}–${leftEnd} ↔ ${rightStart}–${rightEnd}`,
          topStem: stemSeq,
          bottomStem: bottomChars.join(''),
          stemLength: stemLen,
          loopLength: loopSize,
          dG37: thermo.dG37,
          tmC: thermo.tmC,
        })
      }
    }
  }

  return found
}

/**
 * Align seqA 5′→3′ against reverse(seqB) so contiguous Watson–Crick stems model
 * antiparallel intermolecular duplexes (self-dimers when A === B, else primer-dimers).
 */
function collectIntermolecularDimers(
  seqA: string,
  seqB: string,
  options: {
    kind: 'self-dimer' | 'hetero-dimer'
    source: string
    labelA: string
    labelB: string
    idPrefix: string
  },
): PrimerSecondaryStructure[] {
  const nA = seqA.length
  const nB = seqB.length
  const partner = reverseString(seqB)
  const found: PrimerSecondaryStructure[] = []

  for (let offset = -(nA - 1); offset <= nB - 1; offset += 1) {
    let runStart = -1
    for (let i = 0; i <= nA; i += 1) {
      const j = offset + i
      const top = i < nA ? seqA[i] : undefined
      const bottom = j >= 0 && j < nB ? partner[j] : undefined
      const paired = Boolean(top && bottom && isWatsonCrick(top, bottom))
      if (paired) {
        if (runStart < 0) runStart = i
        continue
      }
      if (runStart >= 0) {
        const stemLen = i - runStart
        if (stemLen >= 3) {
          const structure = intermolecularDimerAt(seqA, seqB, partner, runStart, stemLen, offset, options)
          if (structure) found.push(structure)
        }
        runStart = -1
      }
    }
  }

  return found
}

function intermolecularDimerAt(
  seqA: string,
  seqB: string,
  partner: string,
  topStart: number,
  stemLen: number,
  offset: number,
  options: {
    kind: 'self-dimer' | 'hetero-dimer'
    source: string
    labelA: string
    labelB: string
    idPrefix: string
  },
): PrimerSecondaryStructure | null {
  const topStem = seqA.slice(topStart, topStart + stemLen)
  const partnerStart = offset + topStart
  const bottomStemForward = partner.slice(partnerStart, partnerStart + stemLen)
  if (bottomStemForward.length !== stemLen) return null

  const mol2End = seqB.length - partnerStart
  const mol2Start = mol2End - stemLen + 1
  const thermo = dimerStemThermo(topStem)
  if (!thermo || !(thermo.dG37 < 0) || thermo.tmC === null || !Number.isFinite(thermo.tmC)) return null

  const kindLabel = options.kind === 'self-dimer' ? 'Self-dimer' : 'Primer-dimer'
  return {
    id: `${options.idPrefix}:${topStart}-${stemLen}-${offset}`,
    kind: options.kind,
    source: options.source,
    label: `${kindLabel} · stem ${stemLen} bp`,
    detail: `${options.labelA} ${topStart + 1}–${topStart + stemLen} ↔ ${options.labelB} ${mol2Start}–${mol2End}`,
    topStem,
    bottomStem: bottomStemForward,
    stemLength: stemLen,
    loopLength: null,
    dG37: thermo.dG37,
    tmC: thermo.tmC,
  }
}

/** Drop near-duplicate stems that share the same kind + source + top stem + detail. */
function dedupeStructures(structures: PrimerSecondaryStructure[]) {
  const seen = new Set<string>()
  const unique: PrimerSecondaryStructure[] = []
  for (const structure of structures) {
    const key = `${structure.kind}|${structure.source}|${structure.topStem}|${structure.detail}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(structure)
  }
  return unique
}

export function structureKindLabel(kind: PrimerSecondaryStructureKind) {
  if (kind === 'hairpin') return 'Hairpin'
  if (kind === 'self-dimer') return 'Self-dimer'
  return 'Primer-dimer'
}

export function formatStructureTm(tmC: number | null) {
  if (tmC === null || !Number.isFinite(tmC)) return '—'
  return `${tmC.toFixed(1)} °C`
}

export function formatStructureDeltaG(dG37: number) {
  return `${dG37.toFixed(2)} kcal/mol`
}

/** Short copy for the Structures-tab “calculation method” popup. */
export const PRIMER_SECONDARY_STRUCTURE_METHOD_SUMMARY = [
  'Hairpins: SantaLucia 1998 nearest-neighbor ΔH/ΔS for the Watson–Crick stem, plus Turner 2004 loop-initiation ΔG. Intramolecular Tm solves ΔH + ΔG_loop − T·ΔS = 0, then Owczarzy 2008 salt correction (50 mM Na⁺, 2 mM Mg²⁺, 0.8 mM dNTPs).',
  'Self-dimers and primer-dimers (heterodimers): the same NN stem treated as an intermolecular duplex at 250 nM primer (CT/4 concentration term), with the same salt correction. ΔG₃₇ and Tm share that model.',
  'Only stems ≥ 3 bp with ΔG₃₇ < 0 under those conditions are listed (most stable first). Structure Tm is where that fold is ~50% melted — not a minimum PCR annealing temperature.',
].join('\n\n')
