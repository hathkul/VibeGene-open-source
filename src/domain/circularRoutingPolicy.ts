export interface CircularRoutingPolicyQuality {
  minBendAngle: number;
  meanBendAngle: number;
  belowTargetBendCount: number;
  belowTargetBendSeverity: number;
  canvasGrowthHorizontalPx: number;
  canvasGrowthVerticalPx: number;
  maxLeaderLength: number;
  meanLeaderLength: number;
}

export interface CircularRoutingPolicyCandidate {
  quality: CircularRoutingPolicyQuality;
  valid: boolean;
  complete: boolean;
}

export interface CircularRoutingPolicyOptions {
  baselineGrowth: { horizontal: number; vertical: number };
  maxAdditionalGrowth: { horizontal: number; vertical: number };
  angleTarget?: number;
  preferCompact?: boolean;
}

const ANGLE_TOLERANCE = 2;
const ANGLE_COMPARISON_TOLERANCE = 0.25;
const PIXEL_COMPARISON_TOLERANCE = 0.5;
const LENGTH_COMPARISON_TOLERANCE = 0.5;
const MAX_EXTRA_SHORT_BENDS_FOR_WORST_ANGLE_GAIN = 1;
const MAX_EXTRA_SEVERITY_FOR_WORST_ANGLE_GAIN = 5;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function growthOverBudget(candidate: CircularRoutingPolicyCandidate, options: CircularRoutingPolicyOptions): boolean {
  const q = candidate.quality;
  const horizontalLimit = finite(options.baselineGrowth.horizontal) + Math.max(0, finite(options.maxAdditionalGrowth.horizontal));
  const verticalLimit = finite(options.baselineGrowth.vertical) + Math.max(0, finite(options.maxAdditionalGrowth.vertical));
  return finite(q.canvasGrowthHorizontalPx, Number.POSITIVE_INFINITY) > horizontalLimit
    || finite(q.canvasGrowthVerticalPx, Number.POSITIVE_INFINITY) > verticalLimit;
}

function cmp(a: number, b: number, tolerance = 0): number {
  if (Math.abs(a - b) <= tolerance) return 0;
  return a < b ? -1 : 1;
}

/** Returns a negative value when candidate is preferred, positive when current is preferred. */
export function compareCircularRoutingCandidates(
  candidate: CircularRoutingPolicyCandidate,
  current: CircularRoutingPolicyCandidate,
  options: CircularRoutingPolicyOptions,
): number {
  const state = (item: CircularRoutingPolicyCandidate) => Number(item.valid) * 2 + Number(item.complete);
  const stateResult = cmp(state(current), state(candidate));
  if (stateResult) return stateResult;
  const candidateReady = candidate.valid && candidate.complete;
  const currentReady = current.valid && current.complete;
  if (candidateReady && currentReady) {
    const candidateWithinBudget = !growthOverBudget(candidate, options);
    const currentWithinBudget = !growthOverBudget(current, options);
    if (candidateWithinBudget !== currentWithinBudget) return candidateWithinBudget ? -1 : 1;
  }

  const a = candidate.quality;
  const b = current.quality;
  const target = Math.max(0, finite(options.angleTarget ?? 120, 120));
  const aMin = finite(a.minBendAngle, Number.NEGATIVE_INFINITY);
  const bMin = finite(b.minBendAngle, Number.NEGATIVE_INFINITY);
  const aBad = aMin < target;
  const bBad = bMin < target;

  const aCount = finite(a.belowTargetBendCount, Number.POSITIVE_INFINITY);
  const bCount = finite(b.belowTargetBendCount, Number.POSITIVE_INFINITY);
  const aSeverity = finite(a.belowTargetBendSeverity, Number.POSITIVE_INFINITY);
  const bSeverity = finite(b.belowTargetBendSeverity, Number.POSITIVE_INFINITY);
  const boundedWorstAngleGain = (winnerCount: number, loserCount: number, winnerSeverity: number, loserSeverity: number) =>
    winnerCount - loserCount <= MAX_EXTRA_SHORT_BENDS_FOR_WORST_ANGLE_GAIN
    && winnerSeverity - loserSeverity <= MAX_EXTRA_SEVERITY_FOR_WORST_ANGLE_GAIN;

  // A >2° worst-angle gain may compensate for at most one additional short bend
  // and 5° of total shortfall severity. Larger distribution regressions take precedence.
  if (aBad && bBad && aMin - bMin > ANGLE_TOLERANCE
    && boundedWorstAngleGain(aCount, bCount, aSeverity, bSeverity)) return -1;
  if (aBad && bBad && bMin - aMin > ANGLE_TOLERANCE
    && boundedWorstAngleGain(bCount, aCount, bSeverity, aSeverity)) return 1;
  if (aBad !== bBad) {
    const gap = Math.abs((aBad ? aMin : bMin) - target);
    if (gap > ANGLE_TOLERANCE) {
      const winnerCount = aBad ? bCount : aCount;
      const loserCount = aBad ? aCount : bCount;
      const winnerSeverity = aBad ? bSeverity : aSeverity;
      const loserSeverity = aBad ? aSeverity : bSeverity;
      if (boundedWorstAngleGain(winnerCount, loserCount, winnerSeverity, loserSeverity)) return aBad ? 1 : -1;
    }
  }

  const checks: Array<[number, number]> = [
    [aCount, bCount],
    [aSeverity, bSeverity],
  ];
  for (const [av, bv] of checks) {
    const result = cmp(av, bv);
    if (result) return result;
  }

  // Once angles are acceptable, prefer better mean quality without treating 120° as a gate.
  if (options.preferCompact !== false) {
    const aExtent = Math.max(finite(a.canvasGrowthHorizontalPx), finite(a.canvasGrowthVerticalPx));
    const bExtent = Math.max(finite(b.canvasGrowthHorizontalPx), finite(b.canvasGrowthVerticalPx));
    let result = cmp(aExtent, bExtent, PIXEL_COMPARISON_TOLERANCE);
    if (result) return result;
    result = cmp(finite(a.maxLeaderLength, Number.POSITIVE_INFINITY), finite(b.maxLeaderLength, Number.POSITIVE_INFINITY), LENGTH_COMPARISON_TOLERANCE);
    if (result) return result;
    result = cmp(finite(a.meanLeaderLength, Number.POSITIVE_INFINITY), finite(b.meanLeaderLength, Number.POSITIVE_INFINITY), LENGTH_COMPARISON_TOLERANCE);
    if (result) return result;
  }

  if (aMin >= target && bMin >= target) {
    const result = cmp(finite(b.meanBendAngle, Number.NEGATIVE_INFINITY), finite(a.meanBendAngle, Number.NEGATIVE_INFINITY), ANGLE_COMPARISON_TOLERANCE);
    if (result) return result;
  }
  // Measurements within the meaningful tolerances are a stable tie.
  return 0;
}
