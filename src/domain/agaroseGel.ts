import type { Topology } from './types'
import {
  DEFAULT_MW_LADDER_ID,
  mwLadderBandIntensity,
  mwLadderById,
  type MwLadder,
} from './mwLadders'

/** @deprecated Prefer mwLadderById(DEFAULT_MW_LADDER_ID). */
export const GENE_RULER_DNA_LADDER_MIX = mwLadderById(DEFAULT_MW_LADDER_ID)

export type AgaroseLadder = MwLadder

/** Slider middle (50) = normal run: 100 bp reaches the gel end. */
export const DEFAULT_GEL_RUN_SLIDER = 50

export function ladderById(id: string, customLadders: MwLadder[] = []): MwLadder {
  return mwLadderById(id, customLadders)
}

/** Fragment lengths from cut positions (top-strand cuts), topology-aware. */
export function fragmentSizesFromCuts(
  sequenceLength: number,
  cutPositions: number[],
  topology: Topology,
): number[] {
  return listDigestFragmentsFromCuts(sequenceLength, cutPositions, topology).map(
    (fragment) => fragment.length,
  )
}

export type DigestedFragment = {
  id: string
  /** 0-based cut coordinate where the fragment starts (inclusive). */
  start: number
  /**
   * 0-based cut coordinate where the fragment ends.
   * For a wrapping circular fragment, `end < start` (or end === start for full circle).
   * Half-open on the template: bases `[start, end)` when end > start.
   */
  end: number
  length: number
  wraps: boolean
}

/** Ordered digest fragments (largest first) with genomic ranges for selection. */
export function listDigestFragmentsFromCuts(
  sequenceLength: number,
  cutPositions: number[],
  topology: Topology,
): DigestedFragment[] {
  const length = Math.max(0, sequenceLength)
  if (length === 0) return []
  const cuts = [...new Set(cutPositions.map((p) => ((p % length) + length) % length))].sort(
    (a, b) => a - b,
  )

  const fragments: DigestedFragment[] = []

  if (cuts.length === 0) {
    fragments.push({
      id: 'uncut',
      start: 0,
      end: length,
      length,
      wraps: topology === 'circular',
    })
  } else if (topology === 'circular') {
    for (let index = 0; index < cuts.length; index += 1) {
      const start = cuts[index]!
      const end = cuts[(index + 1) % cuts.length]!
      const fragLen = end > start ? end - start : length - start + end
      if (fragLen <= 0) continue
      fragments.push({
        id: `circ-${start}-${end}`,
        start,
        end,
        length: fragLen,
        wraps: end <= start,
      })
    }
  } else {
    if (cuts[0]! > 0) {
      fragments.push({
        id: `lin-0-${cuts[0]}`,
        start: 0,
        end: cuts[0]!,
        length: cuts[0]!,
        wraps: false,
      })
    }
    for (let index = 0; index < cuts.length - 1; index += 1) {
      const start = cuts[index]!
      const end = cuts[index + 1]!
      const fragLen = end - start
      if (fragLen <= 0) continue
      fragments.push({
        id: `lin-${start}-${end}`,
        start,
        end,
        length: fragLen,
        wraps: false,
      })
    }
    const last = cuts[cuts.length - 1]!
    if (last < length) {
      fragments.push({
        id: `lin-${last}-${length}`,
        start: last,
        end: length,
        length: length - last,
        wraps: false,
      })
    }
  }

  return fragments.sort((a, b) => b.length - a.length || a.start - b.start)
}

/**
 * Map a digested fragment to a workspace selection range (supports circular wrap).
 * Single-cut circular digests use start === end; selectionLength treats that as 1 bp,
 * so expand those to the full molecule.
 */
export function digestedFragmentSelectionRange(
  fragment: DigestedFragment,
  sequenceLength?: number,
): { start: number; end: number } {
  if (
    fragment.wraps &&
    fragment.start === fragment.end &&
    sequenceLength != null &&
    sequenceLength > 0
  ) {
    return { start: 0, end: sequenceLength }
  }
  return { start: fragment.start, end: fragment.end }
}

/**
 * Run-duration multiplier from a 0–100 vertical slider.
 * 0 → short run, 50 → normal (100 bp at gel end), 100 → long run.
 */
export function gelRunDurationFromSlider(slider: number): number {
  const t = Math.max(0, Math.min(100, slider))
  if (t <= 50) return 0.12 + (t / 50) * (1 - 0.12)
  return 1 + ((t - 50) / 50) * (2.6 - 1)
}

export type DnaGelMatrix = 'agarose' | 'polyacrylamide'

export const DEFAULT_AGAROSE_PERCENT = 1.0
export const DEFAULT_PAGE_PERCENT = 12

export function gelMatrixPercentBounds(matrix: DnaGelMatrix): {
  min: number
  max: number
  step: number
  defaultPercent: number
} {
  if (matrix === 'polyacrylamide') {
    return { min: 4, max: 30, step: 1, defaultPercent: DEFAULT_PAGE_PERCENT }
  }
  return { min: 0.5, max: 3, step: 0.1, defaultPercent: DEFAULT_AGAROSE_PERCENT }
}

export function formatGelMatrixLabel(matrix: DnaGelMatrix): string {
  return matrix === 'polyacrylamide' ? 'polyacrylamide' : 'agarose'
}

export function formatGelPercent(percent: number, matrix: DnaGelMatrix): string {
  return matrix === 'polyacrylamide' ? String(Math.round(percent)) : percent.toFixed(1)
}

export function clampGelPercent(percent: number, matrix: DnaGelMatrix): number {
  const bounds = gelMatrixPercentBounds(matrix)
  const clamped = Math.max(bounds.min, Math.min(bounds.max, percent))
  return matrix === 'polyacrylamide' ? Math.round(clamped) : Math.round(clamped * 10) / 10
}

/**
 * Relative mobility so that mobility(100 bp) = 1 at 1% agarose.
 * Smaller fragments migrate farther; higher agarose slows large DNA more.
 */
export function agaroseRelativeMobility(lengthBp: number, agarosePercent: number): number {
  const size = Math.max(1, lengthBp)
  const agarose = Math.max(0.5, Math.min(3, agarosePercent))
  const effective = size * Math.pow(agarose / 1.0, 0.35)
  const refImmobile = 80_000
  const numerator = Math.log10(refImmobile / effective)
  const denominator = Math.log10(refImmobile / 100)
  return Math.max(0, numerator / Math.max(0.01, denominator))
}

/**
 * Relative mobility so that mobility(100 bp) = 1 at 12% polyacrylamide.
 * PAGE sieves small DNA tightly; multi-kb fragments barely move.
 */
export function pageRelativeMobility(lengthBp: number, pagePercent: number): number {
  const size = Math.max(1, lengthBp)
  const percent = Math.max(4, Math.min(30, pagePercent))
  const effective = size * Math.pow(percent / DEFAULT_PAGE_PERCENT, 1.1)
  const refImmobile = 8_000
  const numerator = Math.log10(refImmobile / effective)
  const denominator = Math.log10(refImmobile / 100)
  return Math.max(0, numerator / Math.max(0.01, denominator))
}

export function gelRelativeMobility(
  lengthBp: number,
  percent: number,
  matrix: DnaGelMatrix = 'agarose',
): number {
  return matrix === 'polyacrylamide'
    ? pageRelativeMobility(lengthBp, percent)
    : agaroseRelativeMobility(lengthBp, percent)
}

export type AgaroseBandPlacement = {
  /** Pixel Y of band center; null if the band has run off the gel. */
  y: number | null
  /** Fraction of gel length traveled (1 = at bottom / just leaving). */
  travel: number
}

/**
 * Place a band given run duration (1 = 100 bp at the bottom for the matrix defaults).
 * Travel > 1 means the band has left the gel.
 */
export function placeDnaGelBand(
  lengthBp: number,
  top: number,
  bottom: number,
  percent: number,
  runDuration: number,
  matrix: DnaGelMatrix = 'agarose',
): AgaroseBandPlacement {
  const mobility = gelRelativeMobility(lengthBp, percent, matrix)
  const travel = Math.max(0, runDuration) * mobility
  if (travel > 1.02) return { y: null, travel }
  const clamped = Math.min(1, travel)
  return { y: top + clamped * (bottom - top), travel }
}

/** @deprecated Prefer placeDnaGelBand — agarose-only wrapper. */
export function placeAgaroseBand(
  lengthBp: number,
  top: number,
  bottom: number,
  agarosePercent: number,
  runDuration: number,
): AgaroseBandPlacement {
  return placeDnaGelBand(lengthBp, top, bottom, agarosePercent, runDuration, 'agarose')
}

/**
 * Relative intercalating-dye intensity from DNA mass.
 * Equal moles → mass ∝ length, so a 9 kb fragment stains ~9× a 1 kb sister band.
 * `referenceLengthBp` is typically the longest fragment in the same lane.
 */
export function agaroseBandMassIntensity(lengthBp: number, referenceLengthBp: number): number {
  const length = Math.max(1, lengthBp)
  const ref = Math.max(1, referenceLengthBp)
  // Mild gamma keeps faint bands readable without flattening large:small contrast.
  return Math.max(0.18, Math.min(1, Math.pow(length / ref, 0.9)))
}

/**
 * MW band intensity from loaded mass within a ladder (relative to the heaviest band).
 */
export function agaroseLadderBandIntensity(mass: number, maxMass: number): number {
  return mwLadderBandIntensity(mass, maxMass)
}

export type AgaroseBandStyle = {
  thickness: number
  opacity: number
}

/** Map mass intensity to on-gel band thickness and opacity. */
export function agaroseBandStyle(
  intensity: number,
  options: { selected?: boolean } = {},
): AgaroseBandStyle {
  const mass = Math.max(0, Math.min(1, intensity))
  const thickness = options.selected ? 2.4 + mass * 3 : 1.35 + mass * 2.85
  const opacity = options.selected ? 1 : 0.22 + mass * 0.78
  return { thickness, opacity }
}

export type LadderBandLabelInput = {
  lengthBp: number
  /** Ideal vertical center of the band on the gel. */
  bandY: number
  isMajor: boolean
}

export type LadderBandLabelLayout = LadderBandLabelInput & {
  /** Vertical center of the annotation after collision resolution. */
  labelY: number
}

/**
 * Place MW size annotations in one column as close as possible to each band
 * without overlapping (pack gaps, then slide the column toward the bands).
 */
export function layoutLadderBandLabels(
  bands: LadderBandLabelInput[],
  options: { minGap: number; minY: number; maxY: number },
): LadderBandLabelLayout[] {
  if (bands.length === 0) return []
  const sorted = [...bands].sort((a, b) => a.bandY - b.bandY || b.lengthBp - a.lengthBp)
  const gap = Math.max(1, options.minGap)
  const available = options.maxY - options.minY
  const labelYs = sorted.map((band) => band.bandY)

  const distributeEvenly = () => {
    if (labelYs.length === 1) {
      labelYs[0] = Math.max(options.minY, Math.min(options.maxY, sorted[0]!.bandY))
      return
    }
    for (let index = 0; index < labelYs.length; index += 1) {
      labelYs[index] = options.minY + (index / (labelYs.length - 1)) * available
    }
  }

  // Pack downward from each band's preferred Y so labels never collide.
  for (let index = 1; index < labelYs.length; index += 1) {
    labelYs[index] = Math.max(labelYs[index]!, labelYs[index - 1]! + gap)
  }

  const packedSpan = labelYs[labelYs.length - 1]! - labelYs[0]!
  if (packedSpan > available + 0.01) {
    distributeEvenly()
  } else {
    // Keep gaps rigid and fit the block into [minY, maxY], sliding toward bands.
    let first = labelYs[0]!
    let last = labelYs[labelYs.length - 1]!
    if (last > options.maxY) {
      const shift = last - options.maxY
      for (let index = 0; index < labelYs.length; index += 1) labelYs[index] = labelYs[index]! - shift
      first = labelYs[0]!
    }
    if (first < options.minY) {
      const shift = options.minY - first
      for (let index = 0; index < labelYs.length; index += 1) labelYs[index] = labelYs[index]! + shift
      last = labelYs[labelYs.length - 1]!
      if (last > options.maxY + 0.01) {
        distributeEvenly()
        return sorted.map((band, index) => ({ ...band, labelY: labelYs[index]! }))
      }
    }

    const idealFirsts = sorted
      .map((band, index) => band.bandY - (labelYs[index]! - labelYs[0]!))
      .sort((a, b) => a - b)
    const medianFirst = idealFirsts[Math.floor(idealFirsts.length / 2)]!
    const span = labelYs[labelYs.length - 1]! - labelYs[0]!
    const clampedFirst = Math.max(options.minY, Math.min(options.maxY - span, medianFirst))
    const delta = clampedFirst - labelYs[0]!
    if (Math.abs(delta) > 0.01) {
      for (let index = 0; index < labelYs.length; index += 1) {
        labelYs[index] = labelYs[index]! + delta
      }
    }
  }

  return sorted.map((band, index) => ({
    ...band,
    labelY: labelYs[index]!,
  }))
}

/** Format a ladder band size for the annotation column. */
export function formatLadderBandLabel(lengthBp: number): string {
  return lengthBp.toLocaleString('en-US')
}
