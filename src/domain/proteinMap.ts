import type { ProteinBond, SequenceFeature } from './types'
import { localProteinBondResidues } from './proteinBonds'

export type ProteinMapFeatureSegment = {
  feature: SequenceFeature
  locationIndex: number
  start: number
  end: number
  lane: number
}

export type ProteinMapBondLayout = {
  bond: ProteinBond
  start: number
  end: number
  lane: number
}

/** Pack visible protein annotations into stable, non-overlapping map lanes. */
export function layoutProteinMapFeatures(
  features: readonly SequenceFeature[],
  sequenceLength: number,
): ProteinMapFeatureSegment[] {
  const segments = features
    .filter((feature) => feature.visible !== false)
    .flatMap((feature) => feature.locations.map((location, locationIndex) => ({
      feature,
      locationIndex,
      start: Math.max(0, Math.min(sequenceLength, location.start)),
      end: Math.max(0, Math.min(sequenceLength, location.end)),
    })))
    .filter((segment) => segment.end > segment.start)
    .sort((left, right) => left.start - right.start || right.end - left.end || left.feature.id.localeCompare(right.feature.id))

  const laneEnds: number[] = []
  return segments.map((segment) => {
    let lane = laneEnds.findIndex((end) => end <= segment.start)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = segment.end
    return { ...segment, lane }
  })
}

/** Pack visible local bonds into lanes so overlapping connectors stack. */
export function layoutProteinMapBonds(
  bonds: readonly ProteinBond[],
  sequenceLength: number,
): ProteinMapBondLayout[] {
  const segments = bonds
    .filter((bond) => bond.visible !== false)
    .map((bond) => {
      const local = localProteinBondResidues(bond).filter(
        (residue) => residue >= 0 && residue < sequenceLength,
      )
      if (!local.length) return null
      const start = local[0]!
      const end = local.length === 1 ? start + 1 : local[1]! + 1
      return { bond, start, end }
    })
    .filter((segment): segment is { bond: ProteinBond; start: number; end: number } => Boolean(segment))
    .sort((left, right) => left.start - right.start || right.end - left.end || left.bond.id.localeCompare(right.bond.id))

  const laneEnds: number[] = []
  return segments.map((segment) => {
    let lane = laneEnds.findIndex((end) => end <= segment.start)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = segment.end
    return { ...segment, lane }
  })
}

/**
 * Rounded-rectangle bond connector above the backbone:
 * vertical risers at each endpoint, curved corners, horizontal bar.
 */
export function proteinMapBondPath(
  x1: number,
  x2: number,
  baseY: number,
  barY: number,
  cornerRadius = 6,
): string {
  const left = Math.min(x1, x2)
  const right = Math.max(x1, x2)
  const span = right - left
  const rise = baseY - barY
  if (span < 0.5) {
    return `M ${left} ${baseY} V ${barY}`
  }
  if (rise <= 0) {
    return `M ${left} ${baseY} H ${right}`
  }
  const radius = Math.max(0.5, Math.min(cornerRadius, span / 2, rise))
  if (span < radius * 2 + 0.5) {
    const midX = (left + right) / 2
    return `M ${left} ${baseY} V ${barY + radius} Q ${left} ${barY} ${midX} ${barY} Q ${right} ${barY} ${right} ${barY + radius} V ${baseY}`
  }
  return [
    `M ${left} ${baseY}`,
    `V ${barY + radius}`,
    `Q ${left} ${barY} ${left + radius} ${barY}`,
    `H ${right - radius}`,
    `Q ${right} ${barY} ${right} ${barY + radius}`,
    `V ${baseY}`,
  ].join(' ')
}

export function proteinMapTickStep(sequenceLength: number, targetTicks = 10): number {
  if (sequenceLength <= 1) return 1
  const rough = sequenceLength / Math.max(2, targetTicks)
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return multiplier * magnitude
}

export function proteinMapResidueAtFraction(sequenceLength: number, fraction: number): number {
  if (sequenceLength <= 0) return 0
  const clamped = Math.max(0, Math.min(0.999999, fraction))
  return Math.floor(clamped * sequenceLength)
}

/** Nearest inter-residue boundary (0..length) for map selection, matching sequence-pane seam snapping. */
export function proteinMapBoundaryAtFraction(sequenceLength: number, fraction: number): number {
  if (sequenceLength <= 0) return 0
  const clamped = Math.max(0, Math.min(1, fraction))
  return Math.max(0, Math.min(sequenceLength, Math.round(clamped * sequenceLength)))
}
