export type RadiusCacheEntry = {
  radius: number
  updatedAt: number
  standardFeasible?: boolean
  /** When standardFeasible was last confirmed false; stale entries force revalidation. */
  infeasibleValidatedAt?: number
}

const STANDARD_INFEASIBLE_REVALIDATE_MS = 15_000
const PERSISTED_RADIUS_CACHE_LIMIT = 40
const persistedRadiusCache = new Map<string, RadiusCacheEntry>()

export function buildViewportKey(viewportWidth: number, viewportHeight: number, mapSize: number, minLocked: boolean) {
  return `${viewportWidth}x${viewportHeight}x${mapSize}x${minLocked ? 1 : 0}`
}

export function circularLayoutKey(radiusCacheKey: string, viewportKey: string) {
  return `${radiusCacheKey}|viewport=${viewportKey}`
}

export function writePersistedRadius(cacheKey: string, radius: number, standardFeasible?: boolean, now = Date.now()) {
  const existing = persistedRadiusCache.get(cacheKey)
  const nextFeasible = standardFeasible ?? existing?.standardFeasible
  persistedRadiusCache.set(cacheKey, {
    radius,
    updatedAt: now,
    standardFeasible: nextFeasible,
    infeasibleValidatedAt:
      nextFeasible === false
        ? standardFeasible === false
          ? now
          : (existing?.infeasibleValidatedAt ?? now)
        : undefined,
  })
  if (persistedRadiusCache.size <= PERSISTED_RADIUS_CACHE_LIMIT) return
  let oldestKey: string | null = null
  let oldestAt = Number.POSITIVE_INFINITY
  persistedRadiusCache.forEach((entry, key) => {
    if (entry.updatedAt >= oldestAt) return
    oldestAt = entry.updatedAt
    oldestKey = key
  })
  if (oldestKey) persistedRadiusCache.delete(oldestKey)
}

export function readPersistedRadius(cacheKey: string, now = Date.now()) {
  const entry = persistedRadiusCache.get(cacheKey)
  if (!entry) return null
  entry.updatedAt = now
  return entry.radius
}

export function readPersistedStandardFeasible(cacheKey: string, now = Date.now()) {
  const entry = persistedRadiusCache.get(cacheKey)
  if (!entry || entry.standardFeasible === undefined) return null
  if (entry.standardFeasible === false) {
    const validatedAt = entry.infeasibleValidatedAt ?? entry.updatedAt
    if (now - validatedAt >= STANDARD_INFEASIBLE_REVALIDATE_MS) {
      entry.standardFeasible = undefined
      entry.infeasibleValidatedAt = undefined
      return null
    }
  }
  entry.updatedAt = now
  return entry.standardFeasible
}

/** Test-only reset that does not participate in production behavior. */
export function clearPersistedRadiusCache() {
  persistedRadiusCache.clear()
}

type CircularMapWarmRadius = {
  key: string
  radius: number
  standardFeasible: boolean
}

let circularMapWarmRadius: CircularMapWarmRadius | null = null

export function readWarmRadius(cacheKey: string) {
  return circularMapWarmRadius?.key === cacheKey ? circularMapWarmRadius.radius : null
}

export function writeWarmRadius(cacheKey: string, radius: number, standardFeasible: boolean) {
  circularMapWarmRadius = { key: cacheKey, radius, standardFeasible }
}

/** Test-only reset that does not participate in production behavior. */
export function clearWarmRadiusCache() {
  circularMapWarmRadius = null
}
