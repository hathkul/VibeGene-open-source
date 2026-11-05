import type { GuideScanSupportedInfo } from './types'

export function pickGuideScanCatalogDefaults(
  catalog: GuideScanSupportedInfo | null | undefined,
): { organism: string; enzyme: string } {
  const organisms = catalog?.organisms ?? []
  const organism = organisms.includes('hg38') ? 'hg38' : (organisms[0] ?? 'hg38')
  const pairs = catalog?.available.filter((entry) => entry.organism === organism) ?? []
  const enzyme = pairs.some((entry) => entry.enzyme === 'cas9')
    ? 'cas9'
    : (pairs[0]?.enzyme ?? 'cas9')
  return { organism, enzyme }
}

export function enzymesForGuideScanOrganism(
  catalog: GuideScanSupportedInfo | null | undefined,
  organism: string,
): string[] {
  const fromCatalog = catalog?.available
    .filter((entry) => entry.organism === organism)
    .map((entry) => String(entry.enzyme)) ?? []
  if (fromCatalog.length) return [...new Set(fromCatalog)]
  return ['cas9', 'cpf1']
}
