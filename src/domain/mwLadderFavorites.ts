import { DEFAULT_MW_LADDER_ID, isKnownMwLadderId, type MwLadder } from './mwLadders'

export type MwLadderFavorites = {
  /** Ordered favorite ladder ids; index 0 is the default marker. */
  favoriteIds: string[]
}

/** Keep valid, distinct favorites in their user-selected order. */
export function sanitizeFavoriteIds(ids: unknown, customLadders: MwLadder[] = []): string[] {
  if (!Array.isArray(ids)) return [DEFAULT_MW_LADDER_ID]
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of ids) {
    if (typeof value !== 'string' || !value || seen.has(value)) continue
    if (!isKnownMwLadderId(value, customLadders)) continue
    seen.add(value)
    next.push(value)
  }
  if (next.length === 0) next.push(DEFAULT_MW_LADDER_ID)
  return next
}

export function defaultMwLadderId(
  favorites: MwLadderFavorites = { favoriteIds: [DEFAULT_MW_LADDER_ID] },
): string {
  return favorites.favoriteIds[0] ?? DEFAULT_MW_LADDER_ID
}
