import type { EnzymeCalloutLayoutInput, EnzymeCalloutLayoutResult } from './mapLayout'
import { circularMapAngle } from './circularMapGeometry'
import { leaderBendAngleDegrees } from './mapLayout'

type Side = 'left' | 'right'
const ROUTING_BEND_TARGET_DEGREES = 120
/** Let quality gains buy a small amount of extra canvas, with a hard growth limit per comparison. */
const ROUTING_MAX_OVERFLOW_GROWTH_PX = 4
const ROUTING_QUALITY_TOLERANCE = 0.25

export function circularRoutingQualityIsBetter(
  candidate: NonNullable<EnzymeCalloutLayoutResult['routingQuality']>,
  current: NonNullable<EnzymeCalloutLayoutResult['routingQuality']>,
) {
  const horizontalGrowth = (candidate.canvasGrowthHorizontalPx ?? 0) - (current.canvasGrowthHorizontalPx ?? 0)
  const verticalGrowth = (candidate.canvasGrowthVerticalPx ?? 0) - (current.canvasGrowthVerticalPx ?? 0)
  const extraGrowth = Math.max(0, horizontalGrowth) + Math.max(0, verticalGrowth)
  if (extraGrowth > 32 || (extraGrowth > 8 && candidate.minBendAngle < current.minBendAngle + 2)) return false
  // Treat the weakest bend as the primary defect. Summed label-edge overflow can be thousands
  // of pixels in a crowded map, so blending it into a score can buy a worse bend distribution.
  if ((candidate.minBendAngle < ROUTING_BEND_TARGET_DEGREES || current.minBendAngle < ROUTING_BEND_TARGET_DEGREES) &&
    Math.abs(candidate.minBendAngle - current.minBendAngle) > ROUTING_QUALITY_TOLERANCE) {
    return candidate.minBendAngle > current.minBendAngle
  }
  if (Math.abs(candidate.belowTargetBendSeverity - current.belowTargetBendSeverity) > ROUTING_QUALITY_TOLERANCE) {
    return candidate.belowTargetBendSeverity < current.belowTargetBendSeverity
  }
  if (candidate.belowTargetBendCount !== current.belowTargetBendCount) {
    return candidate.belowTargetBendCount < current.belowTargetBendCount
  }

  if (candidate.viewportOverflowPx > current.viewportOverflowPx + ROUTING_MAX_OVERFLOW_GROWTH_PX) {
    return false
  }

  // Stable tie-breaks only use overflow after bend quality is effectively tied.
  for (const [candidateValue, currentValue, lowerIsBetter] of [
    [candidate.meanBendAngle, current.meanBendAngle, false],
    [candidate.maxLeaderLength, current.maxLeaderLength, true],
    [candidate.meanLeaderLength, current.meanLeaderLength, true],
    [candidate.viewportOverflowPx, current.viewportOverflowPx, true],
  ] as const) {
    if (Math.abs(candidateValue - currentValue) <= ROUTING_QUALITY_TOLERANCE) continue
    return lowerIsBetter ? candidateValue < currentValue : candidateValue > currentValue
  }
  return false
}

export function arcCandidateIsBetter(
  candidate: EnzymeCalloutLayoutResult,
  current: EnzymeCalloutLayoutResult,
) {
  const candidateQuality = candidate.routingQuality
  const currentQuality = current.routingQuality
  if (!candidateQuality || !currentQuality) return false

  if (candidate.hasPlacementFailure !== current.hasPlacementFailure) {
    return !candidate.hasPlacementFailure
  }
  // During the viewport-constrained search, keep a valid in-bounds candidate when one exists.
  if (candidateQuality.fitsViewport !== currentQuality.fitsViewport) {
    return candidateQuality.fitsViewport
  }
  return circularRoutingQualityIsBetter(candidateQuality, currentQuality)
}

/** Overflow layouts rank geometry first; canvas size is only a final tie-breaker. */
export function arcOverflowCandidateIsBetter(
  candidate: EnzymeCalloutLayoutResult,
  current: EnzymeCalloutLayoutResult,
  compactLabels = false,
) {
  const candidateQuality = candidate.routingQuality
  const currentQuality = current.routingQuality
  if (!candidateQuality || !currentQuality) return false

  if (candidate.hasPlacementFailure !== current.hasPlacementFailure) {
    return !candidate.hasPlacementFailure
  }
  if (
    compactLabels &&
    candidateQuality.minBendAngle < currentQuality.minBendAngle - 1e-4
  ) return false
  if (compactLabels) {
    if (Math.abs(candidateQuality.viewportOverflowPx - currentQuality.viewportOverflowPx) > 0.5) {
      return candidateQuality.viewportOverflowPx < currentQuality.viewportOverflowPx
    }
    if (Math.abs(candidateQuality.maxLeaderLength - currentQuality.maxLeaderLength) > 0.5) {
      return candidateQuality.maxLeaderLength < currentQuality.maxLeaderLength
    }
    if (Math.abs(candidateQuality.meanLeaderLength - currentQuality.meanLeaderLength) > 0.25) {
      return candidateQuality.meanLeaderLength < currentQuality.meanLeaderLength
    }
  }
  if (Math.abs(candidateQuality.minBendAngle - currentQuality.minBendAngle) > 0.25) {
    return candidateQuality.minBendAngle > currentQuality.minBendAngle
  }
  if (compactLabels) {
    if (Math.abs(candidateQuality.viewportOverflowPx - currentQuality.viewportOverflowPx) > 0.5) {
      return candidateQuality.viewportOverflowPx < currentQuality.viewportOverflowPx
    }
    if (Math.abs(candidateQuality.maxLeaderLength - currentQuality.maxLeaderLength) > 0.5) {
      return candidateQuality.maxLeaderLength < currentQuality.maxLeaderLength
    }
    return candidateQuality.meanLeaderLength < currentQuality.meanLeaderLength - 0.25
  }
  if (Math.abs(candidateQuality.meanBendAngle - currentQuality.meanBendAngle) > 0.25) {
    return candidateQuality.meanBendAngle > currentQuality.meanBendAngle
  }
  if (Math.abs(candidateQuality.maxLeaderLength - currentQuality.maxLeaderLength) > 0.5) {
    return candidateQuality.maxLeaderLength < currentQuality.maxLeaderLength
  }
  if (Math.abs(candidateQuality.meanLeaderLength - currentQuality.meanLeaderLength) > 0.25) {
    return candidateQuality.meanLeaderLength < currentQuality.meanLeaderLength
  }
  return candidateQuality.viewportOverflowPx < currentQuality.viewportOverflowPx - 0.5
}

export function arcHalfBendQuality(
  result: EnzymeCalloutLayoutResult,
  input: EnzymeCalloutLayoutInput,
  half: 'upper' | 'lower',
) {
  const angles = result.callouts.flatMap((callout) => {
    const theta = circularMapAngle(callout.site.start, input.sequenceLength, input.topology)
    if ((half === 'upper') !== (Math.sin(theta) < 0)) return []
    const bend = leaderBendAngleDegrees(callout)
    return bend === null ? [] : [bend]
  })
  if (!angles.length) return null
  return {
    min: Math.min(...angles),
    mean: angles.reduce((sum, angle) => sum + angle, 0) / angles.length,
  }
}

export function arcSideBendQuality(
  result: EnzymeCalloutLayoutResult,
  side: Side,
) {
  const angles = result.callouts.flatMap((callout) => {
    const calloutSide: Side = callout.textAnchor === 'start' ? 'right' : 'left'
    if (calloutSide !== side) return []
    const bend = leaderBendAngleDegrees(callout)
    return bend === null ? [] : [bend]
  })
  if (!angles.length) return null
  return {
    min: Math.min(...angles),
    mean: angles.reduce((sum, angle) => sum + angle, 0) / angles.length,
  }
}

/**
 * Joint automatic arc-shape search for a fixed ring radius. The compact viewport-capped shape is
 * evaluated first, then automatic equator width and each automatic pole curvature are refined.
 * A candidate that leaves the viewport can never beat a clean fitting candidate merely because
 * it gains a few bend degrees. Manual controls remain hard constraints.
 */
