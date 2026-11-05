import { normalizeDna } from './sequence'
import type { Primer } from './types'

export type PrimerNameConflict = {
  /** Display name from the first primer in the conflicting group. */
  name: string
  primers: Primer[]
}

export type PrimerMerge = {
  name: string
  sequence: string
  /** Number of duplicate entries folded into the retained primer. */
  mergedCount: number
}

function normalizedPrimerName(name: string): string {
  return name.trim().toLocaleLowerCase()
}

/** Same name with different sequences is ambiguous and must be resolved by renaming. */
export function primerNameConflicts(primers: readonly Primer[]): PrimerNameConflict[] {
  const groups = new Map<string, Primer[]>()
  for (const primer of primers) {
    const key = normalizedPrimerName(primer.name)
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(primer)
    else groups.set(key, [primer])
  }
  return [...groups.values()].flatMap((primersWithName) => {
    const sequences = new Set(primersWithName.map((primer) => normalizeDna(primer.sequence)))
    return sequences.size > 1 ? [{ name: primersWithName[0]!.name.trim(), primers: primersWithName }] : []
  })
}

/** True if another primer in the same construct already owns this name. */
export function isPrimerNameTaken(
  primers: readonly Primer[],
  name: string,
  exceptPrimerId?: string | null,
): boolean {
  const candidate = normalizedPrimerName(name)
  return Boolean(candidate) && primers.some(
    (primer) => primer.id !== exceptPrimerId && normalizedPrimerName(primer.name) === candidate,
  )
}

/**
 * Fold exact duplicate primer entries into the first one while retaining every
 * distinct binding location. This is safe to run while opening a document.
 */
export function mergeIdenticalPrimers(primers: readonly Primer[]): {
  primers: Primer[]
  merges: PrimerMerge[]
} {
  const merged: Primer[] = []
  const byIdentity = new Map<string, Primer>()
  const mergedCounts = new Map<string, number>()
  for (const primer of primers) {
    const sequence = normalizeDna(primer.sequence)
    const identity = `${normalizedPrimerName(primer.name)}\0${sequence}`
    const existing = byIdentity.get(identity)
    if (!existing) {
      const copy = {
        ...primer,
        bindings: primer.bindings?.map((binding) => ({
          ...binding,
          components: binding.components.map((component) => ({ ...component })),
        })),
      }
      byIdentity.set(identity, copy)
      merged.push(copy)
      continue
    }
    mergedCounts.set(identity, (mergedCounts.get(identity) ?? 0) + 1)
    const knownBindings = new Set((existing.bindings ?? []).map((binding) => JSON.stringify(binding)))
    const additions = (primer.bindings ?? []).filter((binding) => {
      const key = JSON.stringify(binding)
      if (knownBindings.has(key)) return false
      knownBindings.add(key)
      return true
    })
    if (additions.length) existing.bindings = [...(existing.bindings ?? []), ...additions]
  }
  return {
    primers: merged,
    merges: [...mergedCounts].map(([identity, mergedCount]) => {
      const retained = byIdentity.get(identity)!
      return { name: retained.name, sequence: retained.sequence, mergedCount }
    }),
  }
}
