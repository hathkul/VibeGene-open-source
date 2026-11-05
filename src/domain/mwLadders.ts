import catalogJson from '../data/mwLadderCatalog.json' with { type: 'json' }

export type MwFragmentFormat = 'normal' | 'bold' | 'hidden'

export type MwLadderFragment = {
  lengthBp: number
  mass: number
  format: MwFragmentFormat
}

export type MwLadder = {
  id: string
  name: string
  supplier: string
  preferredUnits: 'bp' | 'kb'
  concentration: number | null
  url: string | null
  isDefault: boolean
  fragments: MwLadderFragment[]
}

export type MwSupplierGroup = {
  supplier: string
  ladders: MwLadder[]
}

type CatalogFile = {
  suppliers: MwSupplierGroup[]
}

const catalog = catalogJson as CatalogFile

export const MW_SUPPLIER_GROUPS: MwSupplierGroup[] = catalog.suppliers

export const MW_LADDERS: MwLadder[] = MW_SUPPLIER_GROUPS.flatMap((group) => group.ladders)

const ladderByIdMap = new Map(MW_LADDERS.map((ladder) => [ladder.id, ladder]))

/** GeneRuler DNA Ladder Mix — historical gel default. */
export const DEFAULT_MW_LADDER_ID =
  MW_LADDERS.find((ladder) => /generuler.*dna ladder mix/i.test(ladder.name))?.id ??
  MW_LADDERS.find((ladder) => ladder.isDefault)?.id ??
  MW_LADDERS[0]?.id ??
  ''

export function mwLadderById(
  id: string | null | undefined,
  customLadders: MwLadder[] = [],
): MwLadder {
  if (id) {
    const custom = customLadders.find((ladder) => ladder.id === id)
    if (custom) return custom
    if (ladderByIdMap.has(id)) return ladderByIdMap.get(id)!
  }
  return ladderByIdMap.get(DEFAULT_MW_LADDER_ID) ?? MW_LADDERS[0]!
}

export function isKnownMwLadderId(id: string, customLadders: MwLadder[] = []): boolean {
  return ladderByIdMap.has(id) || customLadders.some((ladder) => ladder.id === id)
}

/** Built-in catalog plus an optional Custom group. */
export function mwSupplierGroupsWithCustom(customLadders: MwLadder[]): MwSupplierGroup[] {
  if (customLadders.length === 0) return MW_SUPPLIER_GROUPS
  return [
    {
      supplier: 'Custom',
      ladders: [...customLadders].sort((a, b) => a.name.localeCompare(b.name)),
    },
    ...MW_SUPPLIER_GROUPS,
  ]
}

export function mwLadderMaxMass(ladder: MwLadder): number {
  return Math.max(1, ...ladder.fragments.map((fragment) => fragment.mass))
}

/** Relative band intensity from loaded mass within a ladder. */
export function mwLadderBandIntensity(mass: number, maxMass: number): number {
  return Math.max(0.18, Math.min(1, Math.pow(Math.max(1, mass) / Math.max(1, maxMass), 0.9)))
}
