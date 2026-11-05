import {
  sanitizeFavoriteIds,
  type MwLadderFavorites,
} from '../domain/mwLadderFavorites'
import { DEFAULT_MW_LADDER_ID, mwLadderById, type MwLadder } from '../domain/mwLadders'
import { listCustomMwLadders } from './customMwLadders'

const STORAGE_KEY = 'vibegene.mwLadderFavorites.v1'

function defaultFavorites(): MwLadderFavorites {
  return { favoriteIds: [DEFAULT_MW_LADDER_ID] }
}

export function loadMwLadderFavorites(customLadders: MwLadder[] = listCustomMwLadders()): MwLadderFavorites {
  if (typeof window === 'undefined') return defaultFavorites()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultFavorites()
    const parsed = JSON.parse(raw) as { favoriteIds?: unknown }
    return { favoriteIds: sanitizeFavoriteIds(parsed.favoriteIds, customLadders) }
  } catch {
    return defaultFavorites()
  }
}

export function saveMwLadderFavorites(
  favorites: MwLadderFavorites,
  customLadders: MwLadder[] = listCustomMwLadders(),
) {
  if (typeof window === 'undefined') return
  const favoriteIds = sanitizeFavoriteIds(favorites.favoriteIds, customLadders)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ favoriteIds }))
}

/** Resolve a ladder using the custom-marker data owned by this storage adapter. */
export function resolveStoredMwLadder(id: string): MwLadder {
  return mwLadderById(id, listCustomMwLadders())
}
