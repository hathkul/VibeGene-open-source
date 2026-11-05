import { enzymes } from './enzymes'
import { isTypeIisEnzyme } from './typeIisEnzymes'
import {
  buildNonredundantCommercialSet,
  enzymesForSupplier,
  manufacturerCounts,
  manufacturerLabel,
  type EnzymePreferences,
  type SavedEnzymeSet,
} from './enzymePreferences'
import type { EnzymeManufacturerId, RestrictionEnzyme } from './types'

export type ManageStandardSetId = 'unique' | 'unique-dual' | 'unique-six-plus' | 'six-plus' | 'type-iis'
export type ManageSupplierSetId = 'all' | 'nonredundant' | EnzymeManufacturerId

export type ManageSetRef =
  | { scope: 'standard'; id: ManageStandardSetId }
  | { scope: 'supplier'; id: ManageSupplierSetId }
  | { scope: 'global'; id: string }
  | { scope: 'file'; id: string }

export type ManageSetListItem = {
  key: string
  ref: ManageSetRef
  label: string
  count: number
  enzymeNames: string[]
  editable: boolean
}

export function manageSetKey(ref: ManageSetRef): string {
  return `${ref.scope}:${ref.id}`
}

export function parseManageSetKey(key: string): ManageSetRef | null {
  const colon = key.indexOf(':')
  if (colon <= 0) return null
  const scope = key.slice(0, colon)
  const id = key.slice(colon + 1)
  if (!id) return null
  if (scope === 'standard') {
    if (
      id === 'unique' ||
      id === 'unique-dual' ||
      id === 'unique-six-plus' ||
      id === 'type-iis' ||
      id === 'six-plus'
    ) {
      return { scope: 'standard', id }
    }
    return null
  }
  if (scope === 'supplier') return { scope: 'supplier', id: id as ManageSupplierSetId }
  if (scope === 'global') return { scope: 'global', id }
  if (scope === 'file') return { scope: 'file', id }
  return null
}

export function enzymeNamesForStandardSet(
  id: ManageStandardSetId,
  parentalCounts: Record<string, number>,
  catalog: RestrictionEnzyme[] = enzymes,
): string[] {
  if (id === 'type-iis') return catalog.filter(isTypeIisEnzyme).map((enzyme) => enzyme.name).toSorted((left, right) => left.localeCompare(right))
  const byName = new Map(catalog.map((enzyme) => [enzyme.name, enzyme]))
  return Object.entries(parentalCounts)
    .filter(([name, count]) => {
      if (count <= 0) return false
      const enzyme = byName.get(name)
      if (!enzyme) return false
      if (id === 'unique') return count === 1
      if (id === 'unique-dual') return count === 1 || count === 2
      if (id === 'six-plus') return enzyme.recognition.length >= 6
      return count === 1 && enzyme.recognition.length >= 6
    })
    .map(([name]) => name)
    .toSorted((left, right) => left.localeCompare(right))
}

export function enzymeNamesForSupplierSet(
  id: ManageSupplierSetId,
  preferences: EnzymePreferences,
  catalog: RestrictionEnzyme[] = enzymes,
): string[] {
  if (id === 'all') return catalog.map((enzyme) => enzyme.name)
  if (id === 'nonredundant') {
    return buildNonredundantCommercialSet(preferences.supplierOrder, catalog, preferences.priorityOrder).map((enzyme) => enzyme.name)
  }
  return enzymesForSupplier(id, catalog).map((enzyme) => enzyme.name)
}

export function buildManageStandardItems(
  parentalCounts: Record<string, number>,
  catalog: RestrictionEnzyme[] = enzymes,
): ManageSetListItem[] {
  const ids: ManageStandardSetId[] = ['unique', 'unique-dual', 'unique-six-plus', 'six-plus', 'type-iis']
  const labels: Record<ManageStandardSetId, string> = {
    unique: 'Unique Cutters',
    'unique-dual': 'Unique & Dual Cutters',
    'unique-six-plus': 'Unique 6+ Cutters',
    'six-plus': '6+ Cutters',
    'type-iis': 'Type IIS',
  }
  return ids.map((id) => {
    const enzymeNames = enzymeNamesForStandardSet(id, parentalCounts, catalog)
    const ref: ManageSetRef = { scope: 'standard', id }
    return {
      key: manageSetKey(ref),
      ref,
      label: labels[id],
      count: enzymeNames.length,
      enzymeNames,
      editable: false,
    }
  })
}

export function buildManageSupplierItems(
  preferences: EnzymePreferences,
  catalog: RestrictionEnzyme[] = enzymes,
): ManageSetListItem[] {
  const supplierCounts = manufacturerCounts(catalog)
  const items: ManageSetListItem[] = [
    {
      key: manageSetKey({ scope: 'supplier', id: 'all' }),
      ref: { scope: 'supplier', id: 'all' },
      label: 'All Commercial',
      count: catalog.length,
      enzymeNames: enzymeNamesForSupplierSet('all', preferences, catalog),
      editable: false,
    },
    {
      key: manageSetKey({ scope: 'supplier', id: 'nonredundant' }),
      ref: { scope: 'supplier', id: 'nonredundant' },
      label: 'Nonredundant Commercial',
      count: buildNonredundantCommercialSet(preferences.supplierOrder, catalog, preferences.priorityOrder).length,
      enzymeNames: enzymeNamesForSupplierSet('nonredundant', preferences, catalog),
      editable: false,
    },
  ]
  for (const supplierId of preferences.supplierOrder) {
    const enzymeNames = enzymeNamesForSupplierSet(supplierId, preferences, catalog)
    items.push({
      key: manageSetKey({ scope: 'supplier', id: supplierId }),
      ref: { scope: 'supplier', id: supplierId },
      label: manufacturerLabel(supplierId),
      count: supplierCounts.get(supplierId) ?? enzymeNames.length,
      enzymeNames,
      editable: false,
    })
  }
  return items
}

export function buildManageSavedItems(
  scope: 'global' | 'file',
  sets: SavedEnzymeSet[],
): ManageSetListItem[] {
  return sets.map((set) => {
    const ref: ManageSetRef = { scope, id: set.id }
    return {
      key: manageSetKey(ref),
      ref,
      label: set.name,
      count: set.enzymeNames.length,
      enzymeNames: [...set.enzymeNames],
      editable: true,
    }
  })
}

export function resolveManageSetEnzymes(
  ref: ManageSetRef,
  options: {
    parentalCounts: Record<string, number>
    preferences: EnzymePreferences
    globalSets: SavedEnzymeSet[]
    fileSets: SavedEnzymeSet[]
  },
): { name: string; enzymeNames: string[] } | null {
  if (ref.scope === 'standard') {
    const item = buildManageStandardItems(options.parentalCounts).find((entry) => entry.ref.id === ref.id)
    return item ? { name: item.label, enzymeNames: item.enzymeNames } : null
  }
  if (ref.scope === 'supplier') {
    const item = buildManageSupplierItems(options.preferences).find((entry) => entry.ref.id === ref.id)
    return item ? { name: item.label, enzymeNames: item.enzymeNames } : null
  }
  const set =
    ref.scope === 'global'
      ? options.globalSets.find((entry) => entry.id === ref.id)
      : options.fileSets.find((entry) => entry.id === ref.id)
  return set ? { name: set.name, enzymeNames: [...set.enzymeNames] } : null
}

export function uniqueSavedSetName(base: string, existing: SavedEnzymeSet[]): string {
  const trimmed = base.trim() || 'Enzyme Set'
  const lower = new Set(existing.map((set) => set.name.toLowerCase()))
  if (!lower.has(trimmed.toLowerCase())) return trimmed
  let index = 2
  while (lower.has(`${trimmed} ${index}`.toLowerCase())) index += 1
  return `${trimmed} ${index}`
}
