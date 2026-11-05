import { normalizeDna } from '../../domain/sequence'

export function primerIdentityKey(name: string, sequence: string): string {
  return `${name.trim().toLowerCase()}\0${normalizeDna(sequence)}`
}

export function collectTagsAmongCommonPrimers(
  primers: readonly { name: string; sequence: string }[],
  tagMap: Map<string, string[]>,
): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const primer of primers) {
    const key = primerIdentityKey(primer.name, primer.sequence)
    for (const tag of tagMap.get(key) ?? []) {
      const folded = tag.toLowerCase()
      if (seen.has(folded)) continue
      seen.add(folded)
      tags.push(tag)
    }
  }
  return tags.sort((a, b) => a.localeCompare(b))
}
