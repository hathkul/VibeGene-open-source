type AmpliconIdentity = { id: string }

export function effectivePcrAmpliconId(
  amplicons: readonly AmpliconIdentity[],
  selectedId: string | null,
): string | null {
  if (!amplicons.length) return null
  return amplicons.find((amplicon) => amplicon.id === selectedId)?.id ?? amplicons[0]!.id
}
