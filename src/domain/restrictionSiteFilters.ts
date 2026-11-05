import { enzymeRecognizedBaseOffsets } from './enzymeParser'
import type { RestrictionSite } from './types'
import { isTypeIisEnzyme } from './typeIisEnzymes'

export type EnzymeSetFilter = {
  set:
    | 'all'
    | 'nonredundant'
    | 'supplier'
    | 'unique'
    | 'unique-dual'
    | 'six-plus'
    | 'unique-six-plus'
    | 'type-iis'
    | 'custom'
  selectedNames: string[]
}

export function enzymeSiteCounts(sites: RestrictionSite[]) {
  return dedupeRestrictionSites(sites).reduce<Record<string, number>>((counts, site) => {
    counts[site.enzyme.name] = (counts[site.enzyme.name] ?? 0) + 1
    return counts
  }, {})
}

/** Same filtering rules as the Enzymes tab / map enzyme set. */
export function filterRestrictionSitesForEnzymeSet(
  sites: RestrictionSite[],
  settings: EnzymeSetFilter,
) {
  const counts = enzymeSiteCounts(sites)
  return sites.filter((site) => {
    const count = counts[site.enzyme.name] ?? 0
    if (settings.set === 'unique') return count === 1
    if (settings.set === 'unique-dual') return count === 1 || count === 2
    if (settings.set === 'six-plus') return site.enzyme.recognition.length >= 6
    if (settings.set === 'unique-six-plus') return site.enzyme.recognition.length >= 6 && count === 1
    if (settings.set === 'type-iis') return isTypeIisEnzyme(site.enzyme)
    if (settings.set === 'custom') return settings.selectedNames.includes(site.enzyme.name)
    return true
  })
}

/** Drop manufacturer / catalog duplicates that share enzyme name and cut position. */
export function dedupeRestrictionSites(sites: RestrictionSite[]) {
  const seen = new Set<string>()
  return sites.filter((site) => {
    const key = `${site.enzyme.name}@${site.start}@${site.end}@${site.cutTop}@${site.cutBottom}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** One representative site per enzyme name (first by genome position). */
export function uniqueSitesByEnzymeName(sites: RestrictionSite[]) {
  const byName = new Map<string, RestrictionSite>()
  const sorted = dedupeRestrictionSites(sites).sort(
    (left, right) => left.start - right.start || left.enzyme.name.localeCompare(right.enzyme.name),
  )
  for (const site of sorted) {
    if (!byName.has(site.enzyme.name)) byName.set(site.enzyme.name, site)
  }
  return Array.from(byName.values()).sort(
    (left, right) => left.enzyme.name.localeCompare(right.enzyme.name) || left.start - right.start,
  )
}

/** Recover an original site from a display-only callout that merges enzymes at one top-strand cut. */
export function restrictionSiteForCalloutEnzyme(
  callout: RestrictionSite,
  enzymeName: string,
  sites: RestrictionSite[],
) {
  return (
    sites.find(
      (site) => site.enzyme.name === enzymeName && site.cutTop === callout.cutTop,
    ) ?? callout
  )
}

/** Project sequence-specific recognition bases, excluding unconstrained spacers. */
export function recognitionPositions(sites: readonly RestrictionSite[], length: number, topology: 'linear' | 'circular') {
  const positions = new Set<number>()
  if (length <= 0) return positions
  for (const site of sites) {
    for (const offset of enzymeRecognizedBaseOffsets(site.enzyme.recognition)) {
      const raw = site.start + offset
      const position = topology === 'circular' ? ((raw % length) + length) % length : raw
      if (position >= 0 && position < length) positions.add(position)
    }
  }
  return positions
}

/** Cuts are boundaries: both selection endpoints are included. A staggered site
 * is inside only when both strand cuts are inside; otherwise it is outside. */
export function enzymeNamesBySelection(
  sites: readonly RestrictionSite[], range: { start: number; end: number } | null,
  length: number, topology: 'linear' | 'circular',
) {
  const inside = new Set<string>()
  const outside = new Set<string>()
  if (!range || range.start === range.end || length <= 0 || (topology === 'linear' && range.start > range.end)) return { inside, outside }
  const contains = (cut: number) => {
    if (topology === 'linear') return cut >= range.start && cut <= range.end
    const normalized = ((cut % length) + length) % length
    if (range.start < range.end) return (normalized >= range.start && normalized <= range.end) || (range.end === length && normalized === 0)
    return normalized >= range.start || normalized <= range.end
  }
  for (const site of sites) {
    ;(contains(site.cutTop) && contains(site.cutBottom) ? inside : outside).add(site.enzyme.name)
  }
  return { inside, outside }
}
