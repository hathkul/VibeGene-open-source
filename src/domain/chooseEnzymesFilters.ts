import { enzymes } from './enzymes'
import {
  buildNonredundantCommercialSet,
  enzymesForSupplier,
  manufacturerCounts,
  manufacturerLabel,
  type EnzymePreferences,
} from './enzymePreferences'
import type { EnzymeManufacturerId, RestrictionEnzyme, RestrictionSite } from './types'

export type ChooseEnzymesSourceSet =
  | 'all'
  | 'nonredundant'
  | `supplier:${EnzymeManufacturerId}`
  | `saved:${string}`
  | `file:${string}`

export type ChooseEnzymesCutLocation = 'anywhere' | 'only-inside' | 'only-outside'
export type ChooseEnzymesCutCountMode = 'at-least' | 'exact' | 'range'
export type ChooseEnzymesCutCountScope = 'entire' | 'inside-selection'
export type ChooseEnzymesOverhangFilter =
  | 'blunt-or-sticky'
  | 'blunt-or-nondeg-sticky'
  | 'blunt'
  | 'sticky'
  | 'nondeg-sticky'
  | '5-prime'
  | '3-prime'

export type ChooseEnzymesSourceOption = {
  value: ChooseEnzymesSourceSet
  label: string
}

export type ChooseEnzymesCriteria = {
  sourceSet: ChooseEnzymesSourceSet
  cutLocation: ChooseEnzymesCutLocation
  cutCountMode: ChooseEnzymesCutCountMode
  cutCountAtLeast: number
  cutCountExact: number
  cutCountRangeMin: number
  cutCountRangeMax: number
  cutCountScope: ChooseEnzymesCutCountScope
  overhang: ChooseEnzymesOverhangFilter
  /** Inclusive minimum recognition length (4–9). */
  recognitionMin: number
  /** Inclusive maximum recognition length; 9 means 9+. */
  recognitionMax: number
}

export type ChooseEnzymesSelectionRange = {
  start: number
  end: number
}

export function chooseEnzymesSourceOptions(
  preferences: EnzymePreferences,
  fileEnzymeSets: import('./enzymePreferences').SavedEnzymeSet[] = [],
): ChooseEnzymesSourceOption[] {
  const supplierCounts = manufacturerCounts()
  const options: ChooseEnzymesSourceOption[] = [
    { value: 'all', label: `All Commercial (${enzymes.length})` },
    {
      value: 'nonredundant',
      label: `Nonredundant Commercial (${buildNonredundantCommercialSet(preferences.supplierOrder, undefined, preferences.priorityOrder).length})`,
    },
  ]
  for (const supplierId of preferences.supplierOrder) {
    options.push({
      value: `supplier:${supplierId}`,
      label: `${manufacturerLabel(supplierId)} (${supplierCounts.get(supplierId) ?? 0})`,
    })
  }
  for (const saved of preferences.savedEnzymeSets) {
    options.push({
      value: `saved:${saved.id}`,
      label: `${saved.name} (${saved.enzymeNames.length})`,
    })
  }
  for (const saved of fileEnzymeSets) {
    options.push({
      value: `file:${saved.id}`,
      label: `${saved.name} (${saved.enzymeNames.length})`,
    })
  }
  return options
}

export function enzymesForChooseSource(
  sourceSet: ChooseEnzymesSourceSet,
  preferences: EnzymePreferences,
  fileEnzymeSets: import('./enzymePreferences').SavedEnzymeSet[] = [],
): RestrictionEnzyme[] {
  if (sourceSet === 'all') return enzymes
  if (sourceSet === 'nonredundant') {
    return buildNonredundantCommercialSet(preferences.supplierOrder, undefined, preferences.priorityOrder)
  }
  if (sourceSet.startsWith('saved:')) {
    const savedId = sourceSet.slice('saved:'.length)
    const saved = preferences.savedEnzymeSets.find((entry) => entry.id === savedId)
    if (!saved) return []
    const selected = new Set(saved.enzymeNames)
    return enzymes.filter((enzyme) => selected.has(enzyme.name))
  }
  if (sourceSet.startsWith('file:')) {
    const savedId = sourceSet.slice('file:'.length)
    const saved = fileEnzymeSets.find((entry) => entry.id === savedId)
    if (!saved) return []
    const selected = new Set(saved.enzymeNames)
    return enzymes.filter((enzyme) => selected.has(enzyme.name))
  }
  const supplierId = sourceSet.slice('supplier:'.length) as EnzymeManufacturerId
  return enzymesForSupplier(supplierId)
}

export function enzymeNamesForChooseSource(
  sourceSet: ChooseEnzymesSourceSet,
  preferences: EnzymePreferences,
  fileEnzymeSets: import('./enzymePreferences').SavedEnzymeSet[] = [],
): string[] {
  return enzymesForChooseSource(sourceSet, preferences, fileEnzymeSets).map((enzyme) => enzyme.name)
}

export function isNondegenerateSticky(enzyme: RestrictionEnzyme): boolean {
  if (enzyme.overhang.type === 'blunt') return false
  const overhang = enzyme.overhang.sequence
  if (overhang != null && overhang.length > 0) return /^[ACGT]+$/i.test(overhang)
  const start = Math.min(enzyme.cutTop, enzyme.cutBottom)
  const end = Math.max(enzyme.cutTop, enzyme.cutBottom)
  if (start < 0 || end > enzyme.recognition.length || end <= start) return false
  const slice = enzyme.recognition.slice(start, end)
  return slice.length > 0 && /^[ACGT]+$/i.test(slice)
}

export function enzymeMatchesOverhangFilter(
  enzyme: RestrictionEnzyme,
  filter: ChooseEnzymesOverhangFilter,
): boolean {
  const type = enzyme.overhang.type
  if (filter === 'blunt-or-sticky') return true
  if (filter === 'blunt') return type === 'blunt'
  if (filter === 'sticky') return type === "5'" || type === "3'"
  if (filter === '5-prime') return type === "5'"
  if (filter === '3-prime') return type === "3'"
  if (filter === 'nondeg-sticky') return isNondegenerateSticky(enzyme)
  if (filter === 'blunt-or-nondeg-sticky') return type === 'blunt' || isNondegenerateSticky(enzyme)
  return true
}

export function enzymeMatchesRecognitionLength(
  enzyme: RestrictionEnzyme,
  minBp: number,
  maxBp: number,
): boolean {
  const length = enzyme.recognition.length
  const min = Math.max(4, Math.min(9, Math.floor(minBp)))
  const max = Math.max(4, Math.min(9, Math.floor(maxBp)))
  if (length < min) return false
  if (max >= 9) return length >= min
  return length <= max
}

export function isSiteInsideSelection(
  siteStart: number,
  selection: ChooseEnzymesSelectionRange | null,
): boolean {
  if (!selection || selection.start === selection.end) return false
  if (selection.start <= selection.end) return siteStart >= selection.start && siteStart < selection.end
  return siteStart >= selection.start || siteStart < selection.end
}

export function hasRangeSelection(selection: ChooseEnzymesSelectionRange | null): boolean {
  return selection != null && selection.start !== selection.end
}

function countMatchesMode(
  count: number,
  mode: ChooseEnzymesCutCountMode,
  atLeast: number,
  exact: number,
  rangeMin: number,
  rangeMax: number,
): boolean {
  if (mode === 'at-least') return count >= Math.max(0, Math.floor(atLeast))
  if (mode === 'exact') return count === Math.max(0, Math.floor(exact))
  const min = Math.max(0, Math.floor(rangeMin))
  const max = Math.max(min, Math.floor(rangeMax))
  return count >= min && count <= max
}

export function enzymeMatchesCutCriteria(
  enzymeName: string,
  sitesByEnzyme: Map<string, RestrictionSite[]>,
  criteria: Pick<
    ChooseEnzymesCriteria,
    | 'cutLocation'
    | 'cutCountMode'
    | 'cutCountAtLeast'
    | 'cutCountExact'
    | 'cutCountRangeMin'
    | 'cutCountRangeMax'
    | 'cutCountScope'
  >,
  selection: ChooseEnzymesSelectionRange | null,
): boolean {
  const sites = sitesByEnzyme.get(enzymeName) ?? []
  const hasSelection = hasRangeSelection(selection)
  const inside = sites.filter((site) => isSiteInsideSelection(site.start, selection))
  const outside = sites.filter((site) => !isSiteInsideSelection(site.start, selection))

  if (criteria.cutLocation === 'only-inside') {
    if (!hasSelection) return false
    if (sites.length === 0 || outside.length > 0) return false
  } else if (criteria.cutLocation === 'only-outside') {
    if (!hasSelection) return false
    if (sites.length === 0 || inside.length > 0) return false
  }

  const scopedCount =
    criteria.cutCountScope === 'inside-selection' && hasSelection ? inside.length : sites.length

  return countMatchesMode(
    scopedCount,
    criteria.cutCountMode,
    criteria.cutCountAtLeast,
    criteria.cutCountExact,
    criteria.cutCountRangeMin,
    criteria.cutCountRangeMax,
  )
}

export function filterEnzymesByChooseCriteria(
  pool: RestrictionEnzyme[],
  sites: RestrictionSite[],
  criteria: ChooseEnzymesCriteria,
  selection: ChooseEnzymesSelectionRange | null,
): RestrictionEnzyme[] {
  const sitesByEnzyme = new Map<string, RestrictionSite[]>()
  for (const site of sites) {
    const list = sitesByEnzyme.get(site.enzyme.name)
    if (list) list.push(site)
    else sitesByEnzyme.set(site.enzyme.name, [site])
  }

  return pool.filter((enzyme) => {
    if (!enzymeMatchesOverhangFilter(enzyme, criteria.overhang)) return false
    if (!enzymeMatchesRecognitionLength(enzyme, criteria.recognitionMin, criteria.recognitionMax)) {
      return false
    }
    return enzymeMatchesCutCriteria(enzyme.name, sitesByEnzyme, criteria, selection)
  })
}

export const CHOOSE_ENZYMES_OVERHANG_OPTIONS: { value: ChooseEnzymesOverhangFilter; label: string }[] = [
  { value: 'blunt-or-sticky', label: 'Blunt or Sticky' },
  { value: 'blunt-or-nondeg-sticky', label: 'Blunt or Nondegenerate Sticky' },
  { value: 'blunt', label: 'Blunt' },
  { value: 'sticky', label: 'Sticky' },
  { value: 'nondeg-sticky', label: 'Nondegenerate Sticky' },
  { value: '5-prime', label: "5'" },
  { value: '3-prime', label: "3'" },
]

export const CHOOSE_ENZYMES_CUT_LOCATION_OPTIONS: { value: ChooseEnzymesCutLocation; label: string }[] = [
  { value: 'anywhere', label: 'anywhere in the sequence' },
  { value: 'only-inside', label: 'only inside the selection' },
  { value: 'only-outside', label: 'only outside the selection' },
]

export const CHOOSE_ENZYMES_RECOGNITION_OPTIONS = [4, 5, 6, 7, 8, 9] as const

export function recognitionLengthLabel(value: number): string {
  return value >= 9 ? '9+' : String(value)
}
