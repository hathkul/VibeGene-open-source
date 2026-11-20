/** Search the entry itself, not filenames or hidden source metadata. */
export function matchesDatabaseEntrySearch(
  term: string,
  entry: { name: string; sequence: string; product?: string },
  tags: readonly string[] = [],
): boolean {
  const query = term.trim().toLocaleLowerCase()
  return !query || [entry.name, entry.sequence, entry.product ?? '', ...tags]
    .some((value) => value.toLocaleLowerCase().includes(query))
}
