/** Measured quality from the completed route at the selected radius. */
export type CircularRadiusDemand = {
  minBendAngle: number
  belowTargetBendSeverity: number
}

export type CircularDemandRadiusSearchInput = {
  selectedRadius: number
  hardMinRadius: number
  /** Lowest radius that still leaves the caller's feature tracks readable. */
  featureReadabilityFloor: number
  demand: CircularRadiusDemand
}

const MAX_DEMAND_PROBES = 3
const MATERIAL_SEVERITY = 30

/**
 * Plan a tiny deterministic set of smaller-radius probes when a completed route has a
 * materially poor bend distribution. The caller owns measurement and routing; this only
 * returns integer radii, bounded by hard geometry and feature readability constraints.
 */
export function planCircularDemandRadiusSearch(input: CircularDemandRadiusSearchInput): number[] {
  const { selectedRadius, hardMinRadius, featureReadabilityFloor, demand } = input
  if (
    !Number.isFinite(selectedRadius) || !Number.isFinite(hardMinRadius) ||
    !Number.isFinite(featureReadabilityFloor) || !Number.isFinite(demand.minBendAngle) ||
    !Number.isFinite(demand.belowTargetBendSeverity) ||
    demand.minBendAngle >= 120 || demand.belowTargetBendSeverity <= MATERIAL_SEVERITY
  ) return []

  const minimum = Math.ceil(Math.max(hardMinRadius, featureReadabilityFloor))
  const maximum = Math.ceil(selectedRadius) - 1
  if (minimum > maximum) return []

  const nearDelta = Math.max(4, Math.round(selectedRadius * 0.025))
  // Larger measured shortfall justifies somewhat broader exploration, capped to keep
  // candidate routing bounded even when the quality score is extreme.
  const demandScale = Math.min(1, Math.max(0, (demand.belowTargetBendSeverity - MATERIAL_SEVERITY) / 300))
  const mediumDelta = Math.round(nearDelta + 6 + demandScale * 8)
  const broadDelta = Math.round(nearDelta + 14 + demandScale * 18)
  const candidates = [nearDelta, mediumDelta, broadDelta]
    .map((delta) => Math.min(maximum, Math.max(minimum, Math.round(selectedRadius - delta))))
  return [...new Set(candidates)].slice(0, MAX_DEMAND_PROBES)
}
