import { compareCircularRoutingCandidates, type CircularRoutingPolicyCandidate } from './circularRoutingPolicy'
import type { EnzymeCalloutLayoutResult } from './mapLayout'

/** A final, fully validated route at one radius, including its radius-specific feature plan. */
export type CircularFinalRadiusCandidate = {
  radius: number
  valid: boolean
  complete: boolean
  quality?: EnzymeCalloutLayoutResult['routingQuality']
}

/** Stop when the complete valid route is within four aggregate degrees of the target. */
export function needsFinalRadiusSearch(candidate: CircularFinalRadiusCandidate): boolean {
  if (!candidate.valid || !candidate.complete || !candidate.quality) return true
  return candidate.quality.minBendAngle < 120 && candidate.quality.belowTargetBendSeverity > 4
}

/** Outcome label for the candidate already chosen by the final-radius selector. */
export type CircularFinalRadiusStatus =
  | 'valid-fit'
  | 'valid-overflow'
  | 'invalid-fallback'
  | 'incomplete-fallback'
  | 'unavailable'

/** Classify the selected route without changing which candidate the selector returns. */
export function classifyFinalCircularRadius(
  candidate: CircularFinalRadiusCandidate | undefined,
): CircularFinalRadiusStatus {
  if (!candidate) return 'unavailable'
  if (!candidate.valid) return 'invalid-fallback'
  // Missing routing quality cannot establish a viewport fit.
  if (!candidate.complete || !candidate.quality) return 'incomplete-fallback'
  return candidate.quality.fitsViewport ? 'valid-fit' : 'valid-overflow'
}

/** Plan up to two untried integer radii inside the hard/soft recovery interval. */
export function planInvalidRadiusRecovery(
  hardMin: number,
  softFloor: number,
  currentlyTriedRadii: readonly number[],
): number[] {
  if (!Number.isFinite(hardMin) || !Number.isFinite(softFloor) || hardMin >= softFloor) return []
  const first = Math.ceil(hardMin)
  const last = Math.ceil(softFloor) - 1
  if (first > last) return []

  const tried = new Set(currentlyTriedRadii)
  const available: number[] = []
  for (let radius = first; radius <= last; radius += 1) {
    if (!tried.has(radius)) available.push(radius)
  }
  if (available.length <= 2) return available

  // Choose points near thirds of the remaining interval, keeping them distinct.
  const firstIndex = Math.round((available.length - 1) / 3)
  const secondIndex = Math.round(2 * (available.length - 1) / 3)
  return [...new Set([available[firstIndex]!, available[secondIndex]!])]
}

/**
 * Compare final routes against one fixed content-growth reference. Prefer a fitting route;
 * a small overflow is permitted only when it substantially improves a severe bend and the
 * overall distribution. Invalid/incomplete routes never beat a valid complete route.
 */
export function selectFinalCircularRadius<T extends CircularFinalRadiusCandidate>(
  candidates: readonly T[],
  maxExtraGrowthPx = 32,
): T | undefined {
  const baseline = candidates[0]
  if (!baseline) return undefined
  const initial = candidates.find((candidate) => candidate.quality)?.quality
  const baselineGrowth = {
    horizontal: initial?.canvasGrowthHorizontalPx ?? 0,
    vertical: initial?.canvasGrowthVerticalPx ?? 0,
  }
  const options = { baselineGrowth, maxAdditionalGrowth: { horizontal: maxExtraGrowthPx, vertical: maxExtraGrowthPx } }
  const overflowWorthwhile = (overflow: T, fit: T) => {
    const a = overflow.quality
    const b = fit.quality
    if (!a || !b) return false
    const horizontal = Math.max(0, (a.canvasGrowthHorizontalPx ?? 0) - (b.canvasGrowthHorizontalPx ?? 0))
    const vertical = Math.max(0, (a.canvasGrowthVerticalPx ?? 0) - (b.canvasGrowthVerticalPx ?? 0))
    // Reserve overflow for a severe visible defect and a material distribution gain.
    return b.minBendAngle < 100 && a.minBendAngle >= b.minBendAngle + 12 &&
      a.belowTargetBendSeverity <= b.belowTargetBendSeverity - 30 &&
      a.belowTargetBendCount <= b.belowTargetBendCount &&
      horizontal <= 24 && vertical <= 24 && horizontal + vertical <= 32 &&
      (a.canvasGrowthHorizontalPx ?? 0) <= baselineGrowth.horizontal + maxExtraGrowthPx &&
      (a.canvasGrowthVerticalPx ?? 0) <= baselineGrowth.vertical + maxExtraGrowthPx
  }
  const policyCandidate = (candidate: T): CircularRoutingPolicyCandidate => ({
    valid: candidate.valid,
    complete: candidate.complete,
    quality: {
      ...candidate.quality!,
      canvasGrowthHorizontalPx: candidate.quality!.canvasGrowthHorizontalPx ?? 0,
      canvasGrowthVerticalPx: candidate.quality!.canvasGrowthVerticalPx ?? 0,
    },
  })
  let selected = baseline
  for (const candidate of candidates.slice(1)) {
    const selectedReady = selected.valid && selected.complete
    const candidateReady = candidate.valid && candidate.complete
    if (candidateReady && !selectedReady) {
      selected = candidate
      continue
    }
    if (selectedReady && !candidateReady) continue

    // A valid finished route with measured quality is more useful than an
    // otherwise equivalent route that cannot be scored.
    if (selectedReady && candidateReady) {
      if (selected.quality && !candidate.quality) continue
      if (!selected.quality && candidate.quality) {
        selected = candidate
        continue
      }
    }
    if (!candidate.quality) continue
    if (selectedReady && candidateReady) {
      if (selected.quality && selected.quality.fitsViewport !== candidate.quality.fitsViewport) {
        const fit = selected.quality.fitsViewport ? selected : candidate
        const overflow = selected.quality.fitsViewport ? candidate : selected
        selected = overflowWorthwhile(overflow, fit) ? overflow : fit
        continue
      }
    }
    if (selected.quality && compareCircularRoutingCandidates(policyCandidate(candidate), policyCandidate(selected), options) < 0) {
      selected = candidate
    }
  }
  return selected
}
