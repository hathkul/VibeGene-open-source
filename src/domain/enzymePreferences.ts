import { enzymes } from './enzymes'
import { isTypeIisEnzyme } from './typeIisEnzymes'
import { enzymesSameRecognitionAndCut } from './enzymeCatalog'
import { canonicalEnzymeLabelName, COMMON_STICKY_SIX_AND_EIGHT_CUTTERS } from './enzymeLabelBudget'
import type { EnzymeManufacturerId, RestrictionEnzyme, RestrictionSite } from './types'

const COMMON_STICKY_RANK = new Map<string, number>(
  COMMON_STICKY_SIX_AND_EIGHT_CUTTERS.map((name, index) => [name.toLowerCase(), index]),
)

export type EnzymeParentalSet = 'all' | 'nonredundant'

export type EnzymeLabelDisplayStyle = {
  italic: boolean
  bold: boolean
  bluntGreen: boolean
  greyed: boolean
}

export type SavedEnzymeSet = {
  id: string
  name: string
  enzymeNames: string[]
}

export type EnzymePreferences = {
  italicizeNames: boolean
  boldUniqueCutters: boolean
  greenBluntCutters: boolean
  defaultTab: 'numbers' | 'lines'
  supplierOrder: EnzymeManufacturerId[]
  menuSupplierCount: number
  parentalSet: EnzymeParentalSet
  savedEnzymeSets: SavedEnzymeSet[]
  /**
   * Manual label-budget priority order (highest first). Empty means use the built-in
   * common sticky 6-/8-cutter defaults from enzymeLabelBudget.
   */
  priorityOrder: string[]
}

export type EnzymeCommercialSetMode = 'all' | 'nonredundant' | 'supplier'

const manufacturerLabels: Record<EnzymeManufacturerId, string> = {
  neb: 'New England Biolabs',
  thermo: 'Thermo Scientific (Fermentas)',
  sibenzyme: 'SibEnzyme',
  usb: 'US Biological (USB)',
  vivantis: 'Vivantis',
  roche: 'Roche',
  takara: 'TaKaRa',
  promega: 'Promega',
  jena: 'Jena Bioscience',
  eurx: 'EURx',
}

const manufacturerShortLabels: Record<EnzymeManufacturerId, string> = {
  neb: 'NEB',
  thermo: 'Thermo',
  sibenzyme: 'SibEnzyme',
  usb: 'USB',
  vivantis: 'Vivantis',
  roche: 'Roche',
  takara: 'TaKaRa',
  promega: 'Promega',
  jena: 'Jena',
  eurx: 'EURx',
}

export function manufacturerLabel(id: EnzymeManufacturerId) {
  return manufacturerLabels[id]
}

export function manufacturerShortLabel(id: EnzymeManufacturerId) {
  return manufacturerShortLabels[id]
}

export function manufacturerCounts(catalog = enzymes) {
  const counts = new Map<EnzymeManufacturerId, number>()
  for (const enzyme of catalog) {
    for (const manufacturer of enzyme.manufacturers) {
      counts.set(manufacturer.id, (counts.get(manufacturer.id) ?? 0) + 1)
    }
  }
  return counts
}

export function defaultSupplierOrder(catalog = enzymes) {
  const counts = manufacturerCounts(catalog)
  return [...counts.entries()]
    .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([id]) => id)
}

export const defaultEnzymePreferences: EnzymePreferences = {
  italicizeNames: false,
  boldUniqueCutters: true,
  greenBluntCutters: false,
  defaultTab: 'numbers',
  supplierOrder: defaultSupplierOrder(),
  menuSupplierCount: 2,
  parentalSet: 'nonredundant',
  savedEnzymeSets: [],
  priorityOrder: [],
}

function normalizeSavedEnzymeSets(
  sets: SavedEnzymeSet[] | undefined,
  catalog = enzymes,
): SavedEnzymeSet[] {
  if (!Array.isArray(sets) || sets.length === 0) return []
  const knownNames = new Map(catalog.map((enzyme) => [enzyme.name.toLowerCase(), enzyme.name]))
  const seenIds = new Set<string>()
  const normalized: SavedEnzymeSet[] = []
  for (const entry of sets) {
    if (!entry || typeof entry !== 'object') continue
    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    if (!name) continue
    const rawId = typeof entry.id === 'string' ? entry.id.trim() : ''
    const id = rawId || `saved-${normalized.length + 1}-${name}`
    if (seenIds.has(id)) continue
    seenIds.add(id)
    const enzymeNames = Array.isArray(entry.enzymeNames)
      ? [...new Set(entry.enzymeNames.filter((enzymeName) => typeof enzymeName === 'string').map((enzymeName) => enzymeName.trim()).filter(Boolean).map((enzymeName) => knownNames.get(enzymeName.toLowerCase()) ?? enzymeName))]
          .toSorted((left, right) => left.localeCompare(right))
      : []
    normalized.push({ id, name, enzymeNames })
  }
  return normalized
}

/** Keep known catalog names, preserve first-seen order, drop duplicates. */
export function normalizeEnzymePriorityOrder(
  order: string[] | undefined,
  catalog = enzymes,
): string[] {
  if (!Array.isArray(order) || order.length === 0) return []
  const knownNames = new Set(catalog.map((enzyme) => enzyme.name))
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const entry of order) {
    if (typeof entry !== 'string') continue
    const name = entry.trim()
    if (!name || !knownNames.has(name) || seen.has(name)) continue
    seen.add(name)
    normalized.push(name)
  }
  return normalized
}

export function createSavedEnzymeSetId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `saved-${crypto.randomUUID()}`
  }
  return `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function supplierRank(enzyme: RestrictionEnzyme, supplierOrder: EnzymeManufacturerId[]) {
  let best = Number.POSITIVE_INFINITY
  for (const manufacturer of enzyme.manufacturers) {
    const index = supplierOrder.indexOf(manufacturer.id)
    if (index >= 0 && index < best) best = index
  }
  return best
}

/** Lower = more familiar. Uses custom priorityOrder when set, else classic sticky MCS cutters. */
function commonNameRank(name: string, priorityOrder: string[]) {
  const canonical = canonicalEnzymeLabelName(name).toLowerCase()
  if (priorityOrder.length) {
    const index = priorityOrder.findIndex(
      (entry) => canonicalEnzymeLabelName(entry).toLowerCase() === canonical,
    )
    return index >= 0 ? index : Number.POSITIVE_INFINITY
  }
  return COMMON_STICKY_RANK.get(canonical) ?? Number.POSITIVE_INFINITY
}

function isHfVariantName(name: string) {
  return /-HF$/i.test(name.trim())
}

/**
 * Choose the isoschizomer users are most likely to recognize.
 * Prefer: common/priority names → non-HF → more vendors → preferred supplier → A–Z.
 */
function pickRepresentative(
  group: RestrictionEnzyme[],
  supplierOrder: EnzymeManufacturerId[],
  priorityOrder: string[],
) {
  return group.toSorted((left, right) => {
    const commonDiff = commonNameRank(left.name, priorityOrder) - commonNameRank(right.name, priorityOrder)
    if (commonDiff !== 0) return commonDiff

    const hfDiff = Number(isHfVariantName(left.name)) - Number(isHfVariantName(right.name))
    if (hfDiff !== 0) return hfDiff

    const vendorDiff = right.manufacturers.length - left.manufacturers.length
    if (vendorDiff !== 0) return vendorDiff

    const rankDiff = supplierRank(left, supplierOrder) - supplierRank(right, supplierOrder)
    if (rankDiff !== 0) return rankDiff
    return left.name.localeCompare(right.name)
  })[0]!
}

export function buildNonredundantCommercialSet(
  supplierOrder: EnzymeManufacturerId[],
  catalog = enzymes,
  priorityOrder: string[] = [],
): RestrictionEnzyme[] {
  const groups: RestrictionEnzyme[][] = []

  for (const enzyme of catalog) {
    const existing = groups.find((group) => enzymesSameRecognitionAndCut(group[0]!, enzyme))
    if (existing) existing.push(enzyme)
    else groups.push([enzyme])
  }

  return groups
    .map((group) => pickRepresentative(group, supplierOrder, priorityOrder))
    .toSorted((left, right) => left.name.localeCompare(right.name))
}

export function enzymesForSupplier(supplierId: EnzymeManufacturerId, catalog = enzymes) {
  return catalog.filter((enzyme) => enzyme.manufacturers.some((manufacturer) => manufacturer.id === supplierId))
}

export function enzymePoolForSettings(
  settings: {
    set: 'all' | 'nonredundant' | 'supplier' | 'unique' | 'unique-dual' | 'six-plus' | 'unique-six-plus' | 'type-iis' | 'custom'
    selectedNames: string[]
    supplierSetId: EnzymeManufacturerId | null
  },
  preferences: EnzymePreferences,
  catalog = enzymes,
) {
  if (settings.set === 'custom') {
    const selected = new Set(settings.selectedNames)
    return catalog.filter((enzyme) => selected.has(enzyme.name))
  }
  if (settings.set === 'all') return catalog
  if (settings.set === 'type-iis') return catalog.filter(isTypeIisEnzyme)
  if (settings.set === 'nonredundant') {
    return buildNonredundantCommercialSet(preferences.supplierOrder, catalog, preferences.priorityOrder)
  }
  if (settings.set === 'supplier' && settings.supplierSetId) {
    return enzymesForSupplier(settings.supplierSetId, catalog)
  }

  if (preferences.parentalSet === 'all') return catalog
  return buildNonredundantCommercialSet(preferences.supplierOrder, catalog, preferences.priorityOrder)
}

export function menuSuppliers(preferences: EnzymePreferences) {
  const count = Math.max(1, Math.min(preferences.menuSupplierCount, preferences.supplierOrder.length))
  return preferences.supplierOrder.slice(0, count)
}

export function normalizeEnzymePreferences(
  preferences: Partial<EnzymePreferences> | undefined,
  catalog = enzymes,
): EnzymePreferences {
  const counts = manufacturerCounts(catalog)
  const knownIds = new Set(counts.keys())
  const fallbackOrder = defaultSupplierOrder(catalog)
  const supplierOrder = (preferences?.supplierOrder ?? fallbackOrder).filter((id) => knownIds.has(id))
  for (const id of fallbackOrder) {
    if (!supplierOrder.includes(id)) supplierOrder.push(id)
  }

  return {
    italicizeNames: preferences?.italicizeNames ?? defaultEnzymePreferences.italicizeNames,
    boldUniqueCutters: preferences?.boldUniqueCutters ?? defaultEnzymePreferences.boldUniqueCutters,
    greenBluntCutters: preferences?.greenBluntCutters ?? defaultEnzymePreferences.greenBluntCutters,
    defaultTab: preferences?.defaultTab ?? defaultEnzymePreferences.defaultTab,
    supplierOrder,
    menuSupplierCount: Math.max(1, Math.min(preferences?.menuSupplierCount ?? 2, supplierOrder.length)),
    parentalSet: preferences?.parentalSet ?? defaultEnzymePreferences.parentalSet,
    savedEnzymeSets: normalizeSavedEnzymeSets(preferences?.savedEnzymeSets, catalog),
    priorityOrder: normalizeEnzymePriorityOrder(preferences?.priorityOrder, catalog),
  }
}

export function parentalSetCount(preferences: EnzymePreferences, catalog = enzymes) {
  if (preferences.parentalSet === 'all') return catalog.length
  return buildNonredundantCommercialSet(preferences.supplierOrder, catalog, preferences.priorityOrder).length
}

export const ENZYME_PREFERENCES_STORAGE_KEY = 'vibegene.enzymePreferences'

export function loadEnzymePreferences(catalog = enzymes): EnzymePreferences {
  if (typeof window === 'undefined') return normalizeEnzymePreferences(undefined, catalog)
  try {
    const raw = window.localStorage.getItem(ENZYME_PREFERENCES_STORAGE_KEY)
    if (!raw) return normalizeEnzymePreferences(undefined, catalog)
    return normalizeEnzymePreferences(JSON.parse(raw) as Partial<EnzymePreferences>, catalog)
  } catch {
    return normalizeEnzymePreferences(undefined, catalog)
  }
}

export function saveEnzymePreferences(preferences: EnzymePreferences, catalog = enzymes) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    ENZYME_PREFERENCES_STORAGE_KEY,
    JSON.stringify(normalizeEnzymePreferences(preferences, catalog)),
  )
}

export function enzymeNamesInMergedLabel(enzymeName: string): string[] {
  return enzymeName
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

/** True when every enzyme in a (possibly comma-merged) label is a unique cutter. */
export function isUniqueCutterEnzymeName(
  enzymeName: string,
  siteCountByEnzyme: Record<string, number>,
): boolean {
  const names = enzymeNamesInMergedLabel(enzymeName)
  if (!names.length) return false
  return names.every((name) => (siteCountByEnzyme[name] ?? 0) === 1)
}

export function enzymeLabelDisplayStyle(
  site: RestrictionSite,
  preferences: EnzymePreferences,
  siteCountByEnzyme: Record<string, number>,
): EnzymeLabelDisplayStyle {
  const methylation = site.methylationDisplay ?? 'normal'
  const greyed = methylation === 'blocked' || methylation === 'methyl-required-unavailable'
  return {
    italic: preferences.italicizeNames,
    bold: preferences.boldUniqueCutters && isUniqueCutterEnzymeName(site.enzyme.name, siteCountByEnzyme),
    bluntGreen: preferences.greenBluntCutters && site.enzyme.overhang.type === 'blunt' && !greyed,
    greyed,
  }
}

export function enzymeLabelTextClassName(style: EnzymeLabelDisplayStyle) {
  return [
    'enzyme-callout-name',
    style.italic ? 'is-italic' : '',
    style.bold ? 'is-bold' : '',
    style.bluntGreen ? 'is-blunt-green' : '',
    style.greyed ? 'is-methylation-greyed' : '',
  ]
    .filter(Boolean)
    .join(' ')
}
