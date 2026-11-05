export type SearchableGelSource = { label: string }

export type IdentifiableGelSource = SearchableGelSource & { record: { id: string } }

/**
 * Keep one live source per construct and exclude the construct already represented
 * by the gel's pinned current/history source.
 */
export function uniqueAgaroseGelOpenSources<T extends IdentifiableGelSource>(
  sources: readonly T[],
  currentRecordId: string,
): T[] {
  const seen = new Set([currentRecordId])
  return sources.filter((source) => {
    const id = source.record.id
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/** Return selected digest enzymes that have no cut sites in the active construct. */
export function absentGelDigestEnzymes(
  selectedNames: readonly string[],
  siteEnzymeNames: readonly string[],
): string[] {
  const present = new Set(siteEnzymeNames.map((name) => name.trim()).filter(Boolean))
  return [...new Set(selectedNames.map((name) => name.trim()).filter(Boolean))]
    .filter((name) => !present.has(name))
}
