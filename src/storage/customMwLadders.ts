import type { MwLadder, MwLadderFragment, MwFragmentFormat } from '../domain/mwLadders'

const STORAGE_KEY = 'vibegene.customMwLadders.v1'

export const CUSTOM_MW_SUPPLIER = 'Custom'

function isFragmentFormat(value: unknown): value is MwFragmentFormat {
  return value === 'normal' || value === 'bold' || value === 'hidden'
}

function sanitizeFragment(raw: unknown): MwLadderFragment | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const lengthBp = Number(entry.lengthBp)
  const mass = Number(entry.mass)
  if (!Number.isFinite(lengthBp) || lengthBp <= 0) return null
  const format = isFragmentFormat(entry.format) ? entry.format : 'normal'
  return {
    lengthBp: Math.round(lengthBp),
    mass: Number.isFinite(mass) && mass > 0 ? mass : 1,
    format,
  }
}

export function sanitizeCustomMwLadder(raw: unknown): MwLadder | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  if (typeof entry.id !== 'string' || !entry.id) return null
  if (typeof entry.name !== 'string' || !entry.name.trim()) return null
  if (!Array.isArray(entry.fragments)) return null
  const fragments = entry.fragments
    .map(sanitizeFragment)
    .filter((fragment): fragment is MwLadderFragment => Boolean(fragment))
  if (fragments.length === 0) return null
  return {
    id: entry.id,
    name: entry.name.trim(),
    supplier: CUSTOM_MW_SUPPLIER,
    preferredUnits: entry.preferredUnits === 'kb' ? 'kb' : 'bp',
    concentration: typeof entry.concentration === 'number' && Number.isFinite(entry.concentration)
      ? entry.concentration
      : null,
    url: typeof entry.url === 'string' ? entry.url : null,
    isDefault: false,
    fragments,
  }
}

export function listCustomMwLadders(): MwLadder[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const ladders: MwLadder[] = []
    for (const entry of parsed) {
      const ladder = sanitizeCustomMwLadder(entry)
      if (!ladder || seen.has(ladder.id)) continue
      seen.add(ladder.id)
      ladders.push(ladder)
    }
    return ladders
  } catch {
    return []
  }
}

export function writeCustomMwLadders(ladders: MwLadder[]) {
  if (typeof window === 'undefined') return
  const cleaned = ladders
    .map(sanitizeCustomMwLadder)
    .filter((ladder): ladder is MwLadder => Boolean(ladder))
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
}

/** Insert or replace a custom ladder by id. */
export function upsertCustomMwLadder(ladder: MwLadder) {
  const cleaned = sanitizeCustomMwLadder(ladder)
  if (!cleaned) return null
  const current = listCustomMwLadders().filter((entry) => entry.id !== cleaned.id)
  writeCustomMwLadders([...current, cleaned])
  return cleaned
}

/** Merge imported ladders (by id); existing ids are replaced. */
export function mergeCustomMwLadders(incoming: MwLadder[]) {
  const byId = new Map(listCustomMwLadders().map((ladder) => [ladder.id, ladder]))
  for (const raw of incoming) {
    const ladder = sanitizeCustomMwLadder(raw)
    if (!ladder) continue
    byId.set(ladder.id, ladder)
  }
  writeCustomMwLadders([...byId.values()])
}

export function createCustomMwLadderId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const stamp = Date.now().toString(36)
  return `custom__${slug || 'marker'}__${stamp}`
}
