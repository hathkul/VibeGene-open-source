import type { EnzymeCalloutLayoutInput, Point } from './mapLayout'

type LabelCurveShape = NonNullable<EnzymeCalloutLayoutInput['labelCurveShape']>

/** Canonical first-quadrant cubic quarter: pole (0, poleRadius) → equator (a, 0). */
export function cubicArcPoint(a: number, poleRadius: number, curvature: number, t: number) {
  const mt = 1 - t
  const mt2 = mt * mt
  const t2 = t * t
  return {
    x: a * (0.84 * mt2 * t + 3 * mt * t2 + t2 * t),
    y: poleRadius * (mt2 * mt + 3 * mt2 * t * (1 - curvature) + 1.02 * mt * t2),
  }
}

const MIN_CUBIC_ARC_CURVATURE = 0.02
/** Exact (a, pole) caps for the recent working set; FIFO so continuous resize cannot grow without bound. */
const MAX_CUBIC_ARC_CAP_CACHE = 256
const cubicArcCurvatureCapCache = new Map<string, number>()

// Canonical quarter in monomials, matching cubicArcPoint:
//   X(t) = x/a = 0.84 t + 1.32 t² − 1.16 t³
//   Y(t) = y/b = 1 − 3c t + (6c − 1.98) t² + (0.98 − 3c) t³
const CUBIC_ARC_X_MONOMIAL = [0, 0.84, 1.32, -1.16]
const BINOM6 = [
  [1],
  [1, 1],
  [1, 2, 1],
  [1, 3, 3, 1],
  [1, 4, 6, 4, 1],
  [1, 5, 10, 10, 5, 1],
  [1, 6, 15, 20, 15, 6, 1],
] as const

function cubicArcYMonomial(curvature: number) {
  return [1, -3 * curvature, 6 * curvature - 1.98, 0.98 - 3 * curvature]
}

function addPolynomials(left: number[], right: number[]) {
  const out = new Array(Math.max(left.length, right.length)).fill(0)
  left.forEach((coeff, index) => { out[index] += coeff })
  right.forEach((coeff, index) => { out[index] += coeff })
  return out
}

function scalePolynomial(coeffs: number[], scale: number) {
  return coeffs.map((coeff) => coeff * scale)
}

function multiplyPolynomials(left: number[], right: number[]) {
  const out = new Array(left.length + right.length - 1).fill(0)
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      out[i + j] += left[i] * right[j]
    }
  }
  return out
}

function cubicArcRadiusSqPolynomial(a: number, poleRadius: number, curvature: number) {
  const x = CUBIC_ARC_X_MONOMIAL
  const y = cubicArcYMonomial(curvature)
  return addPolynomials(
    scalePolynomial(multiplyPolynomials(x, x), a * a),
    scalePolynomial(multiplyPolynomials(y, y), poleRadius * poleRadius),
  )
}

function monomialToBernstein6(mono: number[]) {
  const padded = [0, 0, 0, 0, 0, 0, 0]
  for (let k = 0; k < mono.length && k <= 6; k += 1) padded[k] = mono[k]
  return padded.map((_, j) => {
    let sum = 0
    for (let k = 0; k <= j; k += 1) sum += padded[k] * BINOM6[j][k] / BINOM6[6][k]
    return sum
  })
}

function splitBernstein(coeffs: number[]): [number[], number[]] {
  const n = coeffs.length
  const tmp = coeffs.slice()
  const left = new Array<number>(n)
  const right = new Array<number>(n)
  left[0] = tmp[0]
  right[n - 1] = tmp[n - 1]
  for (let step = 1; step < n; step += 1) {
    for (let i = 0; i < n - step; i += 1) tmp[i] = 0.5 * (tmp[i] + tmp[i + 1])
    left[step] = tmp[0]
    right[n - 1 - step] = tmp[n - 1 - step]
  }
  return [left, right]
}

/**
 * Bernstein convex-hull test that ρ²(t) − floor² ≥ 0 on [0, 1].
 * All-nonnegative coefficients prove positivity; a persistently mixed hull after
 * dyadic splits is treated as a dip so the test never false-accepts.
 */
function bernsteinRangeNonNegative(coeffs: number[], tolerance: number, depth = 0): boolean {
  let minCoeff = coeffs[0]
  let maxCoeff = coeffs[0]
  for (let index = 1; index < coeffs.length; index += 1) {
    const coeff = coeffs[index]
    if (coeff < minCoeff) minCoeff = coeff
    if (coeff > maxCoeff) maxCoeff = coeff
  }
  if (minCoeff >= -tolerance) return true
  if (maxCoeff <= -tolerance) return false
  if (coeffs[0] < -tolerance || coeffs[coeffs.length - 1] < -tolerance) return false
  if (depth >= 20) return false
  const [left, right] = splitBernstein(coeffs)
  return bernsteinRangeNonNegative(left, tolerance, depth + 1)
    && bernsteinRangeNonNegative(right, tolerance, depth + 1)
}

/**
 * Radial-clearance invariant for a two-arc cubic quarter.
 *
 * The quarter runs from the pole (0, b) to the equator (a, 0). High Bézier
 * curvature drops the interior control point and can bow the mid-arc toward the
 * plasmid origin, so some interior point is closer to the ring than both
 * endpoints. Mid-quadrant labels then hug the ring and leaders collapse to
 * small bend angles.
 *
 * Required: ρ(t) ≥ min(a, b) for every t ∈ [0, 1]. Equivalent to the degree-6
 * polynomial ρ²(t) − min(a, b)² staying non-negative. When the pole is the
 * nearer endpoint, this is exact from the closed form ρ'(0) = −3bc: any
 * positive curvature immediately steps inside the floor (the old 20-sample
 * scan missed t ∈ (0, 1/n)). Otherwise Bernstein subdivision of ρ² proves
 * positivity or finds a dip, independent of a sample grid. The curvature
 * argument is the actual cubic parameter; the helper does not rewrite it
 * into the router's [0, 0.8] input range.
 */
export function cubicArcMaintainsRadialClearance(
  a: number,
  poleRadius: number,
  curvature: number,
): boolean {
  if (!(a > 0) || !(poleRadius > 0) || !Number.isFinite(curvature)) return false
  const floor = Math.min(a, poleRadius)
  // Answer for this curvature, not the router's [0, 0.8] input clamp. c>0 with a
  // nearer pole immediately steps inside the floor (ρ'(0) = −3bc).
  if (curvature > 0 && poleRadius <= a) return false
  const residual = cubicArcRadiusSqPolynomial(a, poleRadius, curvature)
  residual[0] -= floor * floor
  const tolerance = 1e-9 * Math.max(a * a, poleRadius * poleRadius)
  return bernsteinRangeNonNegative(monomialToBernstein6(residual), tolerance)
}

function computeMaxCubicArcCurvature(a: number, poleRadius: number) {
  if (cubicArcMaintainsRadialClearance(a, poleRadius, 0.8)) return 0.8
  if (!cubicArcMaintainsRadialClearance(a, poleRadius, MIN_CUBIC_ARC_CURVATURE)) return 0
  let lo = MIN_CUBIC_ARC_CURVATURE
  let hi = 0.8
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const mid = (lo + hi) / 2
    if (cubicArcMaintainsRadialClearance(a, poleRadius, mid)) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * Largest cubic curvature in [0, 0.8] that still obeys the radial-clearance invariant.
 * Cached by the exact IEEE `a` and pole radius. Hits are a Map lookup; the proof
 * runs only on insert. FIFO eviction keeps the table bounded across resizes.
 */
export function maxCubicArcCurvatureForRadialClearance(a: number, poleRadius: number): number {
  if (!(a > 0) || !(poleRadius > 0) || !Number.isFinite(a) || !Number.isFinite(poleRadius)) return 0
  const key = `${a}:${poleRadius}`
  const cached = cubicArcCurvatureCapCache.get(key)
  if (cached !== undefined) return cached
  const allowed = computeMaxCubicArcCurvature(a, poleRadius)
  if (cubicArcCurvatureCapCache.size >= MAX_CUBIC_ARC_CAP_CACHE) {
    const oldest = cubicArcCurvatureCapCache.keys().next().value
    if (oldest !== undefined) cubicArcCurvatureCapCache.delete(oldest)
  }
  cubicArcCurvatureCapCache.set(key, allowed)
  return allowed
}

export function cubicArcCurvatureForPole(a: number, poleRadius: number, requested: number) {
  if (!(requested > 1e-9)) return 0
  const allowed = maxCubicArcCurvatureForRadialClearance(a, poleRadius)
  if (allowed < MIN_CUBIC_ARC_CURVATURE) return 0
  return Math.min(0.8, requested, allowed)
}

export function arcCurvatureUsableOnPoles(a: number, bTop: number, bBottom: number, curvature: number) {
  if (curvature <= 1e-9) return true
  return (
    cubicArcMaintainsRadialClearance(a, bTop, curvature) ||
    cubicArcMaintainsRadialClearance(a, bBottom, curvature)
  )
}

/**
 * Polar radius of the label curve.
 * λ = 0 → ellipse; otherwise the ovoid x²/a² + y²/(b(1+λx))² = 1 (x = ρ cos θ).
 */
export function curveRadiusAtPolarAngle(
  a: number,
  bTop: number,
  theta: number,
  lambda = 0,
  shape: LabelCurveShape = 'ellipse',
  bBottom = bTop,
) {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  if (shape === 'arcs') {
    const poleRadius = s < 0 ? bTop : bBottom
    const curvature = cubicArcCurvatureForPole(a, poleRadius, lambda)
    if (curvature > 1e-9) {
      // Automatic arcs may use a cubic quarter-arc. It keeps the equator tangent vertical while
      // varying the pole tangent and mid-arc bulge independently of the pole distance. Intersect
      // the monotone canonical quarter with the requested polar ray by binary search.
      // Curvature is capped per pole so the quarter cannot bow inside min(a, poleRadius).
      const absC = Math.abs(c)
      const absS = Math.abs(s)
      let lo = 0
      let hi = 1
      for (let iteration = 0; iteration < 14; iteration += 1) {
        const mid = (lo + hi) / 2
        const point = cubicArcPoint(a, poleRadius, curvature, mid)
        // Cross-multiply the ray slopes; atan2 in this hot binary search is unnecessary.
        if (point.y * absC > point.x * absS) lo = mid
        else hi = mid
      }
      const point = cubicArcPoint(a, poleRadius, curvature, (lo + hi) / 2)
      return Math.hypot(point.x, point.y)
    }
    // Each upper/lower pair is mirrored left/right. Every quarter arc has a vertical tangent
    // at the shared equator point, while its independent pole radius controls its curvature.
    const circleCenter = (a * a - poleRadius * poleRadius) / (2 * a)
    return (
      circleCenter * Math.abs(c) +
      Math.sqrt(poleRadius * poleRadius + circleCenter * circleCenter * c * c)
    )
  }
  if (Math.abs(lambda) < 1e-12) {
    const denom = (c * c) / (a * a) + (s * s) / (bTop * bTop)
    if (denom < 1e-12) return Math.min(a, bTop)
    return 1 / Math.sqrt(denom)
  }

  // f(ρ) = ρ²c²/a² + ρ²s²/(b²(1+λρc)²) - 1. Root in (0, ρMax).
  const f = (rho: number) => {
    const scale = 1 + lambda * rho * c
    if (scale <= 1e-6) return Number.POSITIVE_INFINITY
    return (rho * rho * c * c) / (a * a) + (rho * rho * s * s) / (bTop * bTop * scale * scale) - 1
  }

  let hi = Math.max(a, bTop) * 1.05
  // Stay clear of the 1+λx = 0 singularity.
  if (Math.abs(c) > 1e-9 && lambda * c < 0) {
    hi = Math.min(hi, -0.92 / (lambda * c))
  }
  hi = Math.max(hi, 1)
  if (!(f(hi) >= 0)) {
    // Rare: grow a bit if the cap was too tight.
    for (let i = 0; i < 8 && f(hi) < 0; i += 1) hi *= 1.15
  }
  let lo = 0
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2
    if (f(mid) < 0) lo = mid
    else hi = mid
  }
  return hi
}

export function curvePointAtPolar(
  a: number,
  bTop: number,
  center: Point,
  theta: number,
  lambda = 0,
  shape: LabelCurveShape = 'ellipse',
  bBottom = bTop,
): Point {
  const rho = curveRadiusAtPolarAngle(a, bTop, theta, lambda, shape, bBottom)
  return { x: center.x + rho * Math.cos(theta), y: center.y + rho * Math.sin(theta) }
}
