import type { RestrictionSite, SiteMethylationDisplay } from './types'
import type { EnzymeCallout } from './mapLayout'

export type RankedEnzymeGroup = {
  name: string
  sites: RestrictionSite[]
  count: number
  recognitionLength: number
  sticky: boolean
  commonStickyLongCutter: boolean
  usable: boolean
  commonRank: number
}

/**
 * Classic cloning / MCS sticky 6- and 8-cutters. These get the highest label-budget
 * priority among usable sticky enzymes. Names are matched after stripping HF / trademark
 * suffixes (EcoRI-HF → EcoRI).
 */
export const COMMON_STICKY_SIX_AND_EIGHT_CUTTERS = [
  // Core MCS / cloning 6-cutters
  'EcoRI',
  'BamHI',
  'HindIII',
  'XbaI',
  'SalI',
  'XhoI',
  'NheI',
  'NdeI',
  'KpnI',
  'PstI',
  'SacI',
  'ApaI',
  'SpeI',
  'BglII',
  'ClaI',
  'MluI',
  'AgeI',
  'BsrGI',
  'Acc65I',
  'EagI',
  'NarI',
  'KasI',
  'AflII',
  'AvrII',
  'NcoI',
  'PvuI',
  // Common sticky 8-cutters
  'NotI',
  'AscI',
  'PacI',
  'SbfI',
  'FseI',
  'AsiSI',
  'SfiI',
  // Golden Gate / Type IIS — prefer familiar NEB trade names over isoschizomers
  'BsaI',
  'BsmBI',
  'BbsI',
  'SapI',
] as const

const COMMON_STICKY_RANK = new Map<string, number>(
  COMMON_STICKY_SIX_AND_EIGHT_CUTTERS.map((name, index) => [name.toLowerCase(), index]),
)

/** Built-in priority names that exist in `catalog` (exact catalog spelling). */
export function defaultEnzymePriorityOrder(catalogNames: Iterable<string>): string[] {
  const byCanonical = new Map<string, string>()
  for (const name of catalogNames) {
    const key = canonicalEnzymeLabelName(name).toLowerCase()
    if (!byCanonical.has(key)) byCanonical.set(key, name)
  }
  const resolved: string[] = []
  for (const name of COMMON_STICKY_SIX_AND_EIGHT_CUTTERS) {
    const match = byCanonical.get(name.toLowerCase())
    if (match) resolved.push(match)
  }
  return resolved
}

/** Strip HF / trademark noise so EcoRI-HF matches the EcoRI common entry. */
export function canonicalEnzymeLabelName(name: string) {
  return name
    .replace(/\u00ae/gi, '')
    .replace(/-HF$/i, '')
    .replace(/\s+/g, '')
    .trim()
}

function isUsableMethylation(display: SiteMethylationDisplay | undefined) {
  return display !== 'blocked' && display !== 'methyl-required-unavailable'
}

function isStickyOverhang(site: RestrictionSite) {
  return site.enzyme.overhang.type !== 'blunt'
}

function commonStickyRank(name: string, priorityOrder: string[]) {
  const canonical = canonicalEnzymeLabelName(name).toLowerCase()
  if (priorityOrder.length) {
    const index = priorityOrder.findIndex(
      (entry) => canonicalEnzymeLabelName(entry).toLowerCase() === canonical,
    )
    return index >= 0 ? index : Number.POSITIVE_INFINITY
  }
  return COMMON_STICKY_RANK.get(canonical) ?? Number.POSITIVE_INFINITY
}

/**
 * Rank enzymes for map/sequence label budget.
 *
 * Priority (highest first):
 * 1. Usable enzymes in the priority list (custom `priorityOrder`, else built-in common sticky 6-/8-cutters)
 * 2. Other usable sticky cutters (prefer ≥6 bp recognition, fewer sites, longer recognition)
 * 3. Usable blunt cutters (same secondary keys)
 * 4. Fully methylation-blocked / methyl-required-unavailable enzymes last
 */
export function rankEnzymeGroups(
  sites: RestrictionSite[],
  options: { priorityOrder?: string[] } = {},
): RankedEnzymeGroup[] {
  const priorityOrder = options.priorityOrder ?? []
  const byEnzyme = new Map<string, RestrictionSite[]>()
  sites.forEach((site) => {
    const list = byEnzyme.get(site.enzyme.name) ?? []
    list.push(site)
    byEnzyme.set(site.enzyme.name, list)
  })

  return [...byEnzyme.entries()]
    .map(([name, groupSites]) => {
      const primary = groupSites[0]!
      const recognitionLength = primary.enzyme.recognition.length
      const sticky = isStickyOverhang(primary)
      const usable = groupSites.some((site) => isUsableMethylation(site.methylationDisplay))
      const commonRank = commonStickyRank(name, priorityOrder)
      const commonStickyLongCutter = usable && Number.isFinite(commonRank)
      return {
        name,
        sites: groupSites,
        count: groupSites.length,
        recognitionLength,
        sticky,
        commonStickyLongCutter,
        usable,
        commonRank,
      }
    })
    .toSorted((a, b) => {
      if (a.usable !== b.usable) return a.usable ? -1 : 1

      const aCommon = a.commonStickyLongCutter ? 1 : 0
      const bCommon = b.commonStickyLongCutter ? 1 : 0
      if (aCommon !== bCommon) return bCommon - aCommon
      if (a.commonStickyLongCutter && b.commonStickyLongCutter && a.commonRank !== b.commonRank) {
        return a.commonRank - b.commonRank
      }

      if (a.sticky !== b.sticky) return a.sticky ? -1 : 1

      const aSixPlus = a.recognitionLength >= 6 ? 1 : 0
      const bSixPlus = b.recognitionLength >= 6 ? 1 : 0
      if (aSixPlus !== bSixPlus) return bSixPlus - aSixPlus
      if (a.count !== b.count) return a.count - b.count
      if (a.recognitionLength !== b.recognitionLength) return b.recognitionLength - a.recognitionLength
      return a.name.localeCompare(b.name)
    })
}

/**
 * Select sites for labeling under a budget with a hard all-or-none rule:
 * if an enzyme has N sites, either all N labels are kept or the enzyme is skipped.
 */
export function selectEnzymeSitesAllOrNone(
  sites: RestrictionSite[],
  budget: number,
  options: { priorityOrder?: string[] } = {},
): RestrictionSite[] {
  const ranked = rankEnzymeGroups(sites, options)
  const selected: RestrictionSite[] = []
  let used = 0
  for (const group of ranked) {
    if (used + group.count > budget) continue
    selected.push(...group.sites)
    used += group.count
  }
  return selected
}

export function expectedEnzymeSiteCounts(sites: RestrictionSite[]): Map<string, number> {
  const counts = new Map<string, number>()
  sites.forEach((site) => {
    if (site.match === '__feature_callout__' || site.match.startsWith('__primer_callout__')) return
    enzymeNamesFromCalloutLabel(site.enzyme.name).forEach((name) => {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    })
  })
  return counts
}

function enzymeNamesFromCalloutLabel(name: string): string[] {
  return name
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * After layout, drop every callout that mentions an enzyme whose placed count
 * is below the expected site count (never show 1 of 3 AclI labels).
 */
export function enforceAllOrNoneEnzymeCallouts(
  callouts: EnzymeCallout[],
  expectedByEnzyme: Map<string, number>,
): { callouts: EnzymeCallout[]; droppedEnzymes: string[] } {
  if (!expectedByEnzyme.size) return { callouts, droppedEnzymes: [] }

  const placedByEnzyme = new Map<string, number>()
  callouts.forEach((callout) => {
    if (callout.site.match === '__feature_callout__' || callout.site.match.startsWith('__primer_callout__')) return
    enzymeNamesFromCalloutLabel(callout.site.enzyme.name).forEach((name) => {
      placedByEnzyme.set(name, (placedByEnzyme.get(name) ?? 0) + 1)
    })
  })

  const droppedEnzymes: string[] = []
  expectedByEnzyme.forEach((expected, name) => {
    const placed = placedByEnzyme.get(name) ?? 0
    // Only punish partial sets (1 of 3). Zero placements already satisfy all-or-none (show none).
    if (placed > 0 && placed < expected) droppedEnzymes.push(name)
  })
  if (!droppedEnzymes.length) return { callouts, droppedEnzymes }

  const dropped = new Set(droppedEnzymes)
  return {
    callouts: callouts.filter((callout) => {
      if (callout.site.match === '__feature_callout__' || callout.site.match.startsWith('__primer_callout__')) return true
      return !enzymeNamesFromCalloutLabel(callout.site.enzyme.name).some((name) => dropped.has(name))
    }),
    droppedEnzymes,
  }
}

/**
 * Geometric radius bounds only. Responsive soft-floor policy and feature-row density live in
 * circularMapResponsive.ts.
 *
 * Classic/lane start with an 80%-diameter cap. Elliptic uses a configurable vertical ratio
 * (92% diameter by default), while its horizontal ceiling separately reserves the side-label
 * budget + ring gap from the actual viewport width. Its search can shrink to the hard minimum
 * because that creates room for the label curve.
 */
export function circularRadiusBounds(
  viewportWidth: number,
  viewportHeight: number,
  options: {
    algorithm?: 'classic' | 'lane' | 'elliptic'
    maxLabelWidth?: number
    /** Elliptic: clearance between ring and side label band (default 56). */
    ringGap?: number
    /**
     * Elliptic: horizontal reservation for side labels. When omitted, uses
     * max(64, maxLabelWidth). Pass 0 to allow the ring to grow into that band.
     */
    sideBudget?: number
    /** Elliptic: max radius as a fraction of the short side (default 0.46, clamped ≤ 0.49). */
    maxRadiusRatio?: number
  } = {},
) {
  const shortSide = Math.max(1, Math.min(viewportWidth, viewportHeight))
  let maxRadius = Math.max(32, Math.floor(shortSide * 0.4))
  const hardMinRadius = Math.max(24, Math.floor(shortSide * 0.08))
  // Once outer margin exceeds ~35% of short side (capped), shrinking the ring
  // mainly crowds label ideal-Y without buying usable column space.
  const maxUsefulOuter = Math.min(Math.floor(shortSide * 0.35), 240)
  let searchMinRadius = Math.max(hardMinRadius, Math.floor(shortSide / 2 - maxUsefulOuter))

  if (options.algorithm === 'elliptic') {
    // The curve labels stack VERTICALLY on the sides. Reserve their band against the
    // viewport WIDTH, not the short side: using the height here wastes the extra width of
    // landscape panes and leaves a needlessly small ring after the window is enlarged.
    const autoSide = Math.max(64, Math.round(options.maxLabelWidth ?? 0))
    const sideBudget = Math.max(0, Math.round(options.sideBudget ?? autoSide))
    const ringGap = Math.max(0, Math.round(options.ringGap ?? 56))
    const ratio = Math.max(0.25, Math.min(0.49, options.maxRadiusRatio ?? 0.46))
    const verticalCap = Math.floor(viewportHeight * ratio)
    const horizontalCap = Math.floor(viewportWidth / 2 - sideBudget - ringGap)
    maxRadius = Math.max(hardMinRadius, Math.min(verticalCap, horizontalCap))
    searchMinRadius = hardMinRadius
  }

  return {
    shortSide,
    maxRadius,
    hardMinRadius,
    searchMinRadius: Math.min(maxRadius, searchMinRadius),
  }
}

/** Axis-aligned content bounds for circular callouts (ring + labels + leaders). */
export function calloutsContentBounds(
  callouts: Array<{
    box: { left: number; right: number; top: number; bottom: number }
    anchor: { x: number; y: number }
    elbow: { x: number; y: number }
    connectorEnd: { x: number; y: number }
  }>,
  radius: number,
  centerX: number,
  centerY: number,
  padding = 10,
) {
  let left = centerX - (radius + 3)
  let right = centerX + (radius + 3)
  let top = centerY - (radius + 3)
  let bottom = centerY + (radius + 3)
  callouts.forEach((callout) => {
    left = Math.min(left, callout.box.left, callout.anchor.x, callout.elbow.x, callout.connectorEnd.x)
    right = Math.max(right, callout.box.right, callout.anchor.x, callout.elbow.x, callout.connectorEnd.x)
    top = Math.min(top, callout.box.top, callout.anchor.y, callout.elbow.y, callout.connectorEnd.y)
    bottom = Math.max(bottom, callout.box.bottom, callout.anchor.y, callout.elbow.y, callout.connectorEnd.y)
  })
  left -= padding
  right += padding
  top -= padding
  bottom += padding
  return { left, top, width: right - left, height: bottom - top }
}

export function contentFitsViewport(
  bounds: { left: number; top: number; width: number; height: number },
  viewportWidth: number,
  viewportHeight: number,
) {
  return bounds.width <= viewportWidth + 0.5 && bounds.height <= viewportHeight + 0.5
}

/** Evenly spaced candidate radii from high → low (inclusive), snapped to step. */
export function buildRadiusProbeLadder(minRadius: number, maxRadius: number, step = 12, maxProbes = 8): number[] {
  if (maxRadius <= minRadius) return [minRadius]
  const span = maxRadius - minRadius
  const count = Math.max(2, Math.min(maxProbes, Math.floor(span / step) + 1))
  const probes: number[] = []
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1)
    const raw = maxRadius - t * span
    const snapped = Math.round(raw / step) * step
    const clamped = Math.max(minRadius, Math.min(maxRadius, snapped))
    if (!probes.length || probes[probes.length - 1] !== clamped) probes.push(clamped)
  }
  if (probes[probes.length - 1] !== minRadius) probes.push(minRadius)
  return probes
}

/** Quality snapshot used to pick a ring radius after each probe has already been routed. */
export type CircularArcRadiusCandidate = {
  radius: number
  overflowMode?: boolean
  strictInvalid: boolean
  routingQuality?: {
    fitsViewport: boolean
    viewportOverflowPx: number
    minBendAngle: number
    meanBendAngle: number
    maxLeaderLength: number
    meanLeaderLength: number
  }
}

export type CircularArcRadiusRankOptions = {
  /** Soft-floor / search-low radius; used only as a late overflow tie-breaker. */
  preferredRadius?: number
  /**
   * Inclusive overflow-only radius floor. The caller derives this from its snapped
   * max probe (App uses 70% of that radius). Ignored when any valid viewport-fitting
   * candidate exists. If every overflow candidate is below the floor, the floor is
   * dropped so a candidate is still chosen.
   */
  minimumOverflowRadius?: number
}

const ARC_RADIUS_BEND_EPS = 0.25
const ARC_RADIUS_OVERFLOW_EPS = 0.5
const ARC_RADIUS_LEADER_EPS = 0.5
const ARC_RADIUS_MEAN_LEADER_EPS = 0.25
/** Overflow compactness may not buy a layout whose worst leader is much sharper. */
const ARC_OVERFLOW_BEND_GUARD_DEG = 12

function candidateOverflowsViewport(candidate: CircularArcRadiusCandidate) {
  if (candidate.overflowMode === true) return true
  if (candidate.routingQuality) return candidate.routingQuality.fitsViewport !== true
  return false
}

function closerRadiusIsBetter(
  candidateRadius: number,
  currentRadius: number,
  preferredRadius: number | undefined,
) {
  if (preferredRadius != null) {
    const candidateDistance = Math.abs(candidateRadius - preferredRadius)
    const currentDistance = Math.abs(currentRadius - preferredRadius)
    if (Math.abs(candidateDistance - currentDistance) > 0.5) {
      return candidateDistance < currentDistance
    }
  }
  return candidateRadius < currentRadius
}

function overflowCompactnessIsBetter(
  candidate: CircularArcRadiusCandidate,
  current: CircularArcRadiusCandidate,
  preferredRadius: number | undefined,
) {
  const candidateQuality = candidate.routingQuality
  const currentQuality = current.routingQuality
  if (!candidateQuality || !currentQuality) {
    return closerRadiusIsBetter(candidate.radius, current.radius, preferredRadius)
  }
  const overflowGain = currentQuality.viewportOverflowPx - candidateQuality.viewportOverflowPx
  if (Math.abs(overflowGain) > ARC_RADIUS_OVERFLOW_EPS) return overflowGain > 0
  if (Math.abs(candidateQuality.maxLeaderLength - currentQuality.maxLeaderLength) > ARC_RADIUS_LEADER_EPS) {
    return candidateQuality.maxLeaderLength < currentQuality.maxLeaderLength
  }
  if (
    Math.abs(candidateQuality.meanLeaderLength - currentQuality.meanLeaderLength) > ARC_RADIUS_MEAN_LEADER_EPS
  ) {
    return candidateQuality.meanLeaderLength < currentQuality.meanLeaderLength
  }
  return closerRadiusIsBetter(candidate.radius, current.radius, preferredRadius)
}

function fittingArcRadiusIsBetter(
  candidate: CircularArcRadiusCandidate,
  current: CircularArcRadiusCandidate,
) {
  const candidateQuality = candidate.routingQuality
  const currentQuality = current.routingQuality
  if (!candidateQuality || !currentQuality) return candidate.radius > current.radius
  if (Math.abs(candidateQuality.minBendAngle - currentQuality.minBendAngle) > ARC_RADIUS_BEND_EPS) {
    return candidateQuality.minBendAngle > currentQuality.minBendAngle
  }
  if (Math.abs(candidateQuality.meanBendAngle - currentQuality.meanBendAngle) > ARC_RADIUS_BEND_EPS) {
    return candidateQuality.meanBendAngle > currentQuality.meanBendAngle
  }
  if (Math.abs(candidateQuality.maxLeaderLength - currentQuality.maxLeaderLength) > ARC_RADIUS_LEADER_EPS) {
    return candidateQuality.maxLeaderLength < currentQuality.maxLeaderLength
  }
  if (
    Math.abs(candidateQuality.meanLeaderLength - currentQuality.meanLeaderLength) > ARC_RADIUS_MEAN_LEADER_EPS
  ) {
    return candidateQuality.meanLeaderLength < currentQuality.meanLeaderLength
  }
  return candidate.radius > current.radius
}

/**
 * Pairwise compare for tests and fitting ties. Overflow readability uses the global
 * {@link selectPreferredCircularArcRadius} admit-set, not a relative pairwise guard.
 */
export function circularArcRadiusCandidateIsBetter(
  candidate: CircularArcRadiusCandidate,
  current: CircularArcRadiusCandidate,
  options: CircularArcRadiusRankOptions = {},
) {
  if (candidate.strictInvalid !== current.strictInvalid) return !candidate.strictInvalid
  const candidateOverflows = candidateOverflowsViewport(candidate)
  const currentOverflows = candidateOverflowsViewport(current)
  if (candidateOverflows !== currentOverflows) return currentOverflows
  if (candidateOverflows && currentOverflows) {
    return overflowCompactnessIsBetter(candidate, current, options.preferredRadius)
  }
  return fittingArcRadiusIsBetter(candidate, current)
}

/**
 * Deterministic pick over already-routed probes. Hard validity first, then viewport fit.
 * Overflow-only: optionally drop rings below `minimumOverflowRadius`, then admit
 * candidates within the bend guard of the best remaining min bend, then compactness.
 */
export function selectPreferredCircularArcRadius<T extends CircularArcRadiusCandidate>(
  candidates: readonly T[],
  options: CircularArcRadiusRankOptions = {},
): T | undefined {
  if (!candidates.length) return undefined
  const valid = candidates.filter((candidate) => !candidate.strictInvalid)
  const pool = valid.length ? valid : candidates
  const fitting = pool.filter((candidate) => !candidateOverflowsViewport(candidate))
  if (fitting.length) {
    return fitting.reduce((best, candidate) =>
      fittingArcRadiusIsBetter(candidate, best) ? candidate : best,
    )
  }

  const overflowFloor = options.minimumOverflowRadius
  const floored =
    overflowFloor == null
      ? pool
      : pool.filter((candidate) => candidate.radius >= overflowFloor)
  const overflowPool = floored.length ? floored : pool

  const bestMinBend = overflowPool.reduce((best, candidate) => {
    const bend = candidate.routingQuality?.minBendAngle
    return bend != null && bend > best ? bend : best
  }, Number.NEGATIVE_INFINITY)
  const admitted = Number.isFinite(bestMinBend)
    ? overflowPool.filter((candidate) => {
        const bend = candidate.routingQuality?.minBendAngle
        return bend == null || bend >= bestMinBend - ARC_OVERFLOW_BEND_GUARD_DEG
      })
    : overflowPool
  return admitted.reduce((best, candidate) =>
    overflowCompactnessIsBetter(candidate, best, options.preferredRadius) ? candidate : best,
  )
}
