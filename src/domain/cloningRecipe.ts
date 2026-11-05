import {
  contributedFragmentLength,
  contributionGeometry,
  parentSummaries,
  type HistoryRegion,
} from './historyContribution'
import type { HistoryInputSummary, HistoryNode } from './types'

export const CLONING_RECIPE_OPERATIONS = new Set([
  'insertFragment',
  'insertFragments',
  'ligateFragments',
  'taCloning',
  'gcCloning',
  'cloneSgRNA',
])

export const DEFAULT_VECTOR_AMOUNT_NG = 20
export const DEFAULT_STICKY_MULTIPLICITY = 3
export const DEFAULT_BLUNT_MULTIPLICITY = 5
export const DEFAULT_OLIGO_MULTIPLICITY = 10

/** Adapter / phosphorylated oligo inserts (dsDNA or annealed). */
const OLIGO_INSERT_MAX_BP = 60
/** Short linkers and tiny PCR products. */
const SHORT_INSERT_MAX_BP = 120
/** Small restriction fragments still well below a typical CDS. */
const SMALL_INSERT_MAX_BP = 250

export type CloningRecipePart = {
  id: string
  role: 'vector' | 'insert'
  name: string
  lengthBp: number
}

/**
 * Insert:vector molar excess from insert length (and blunt vs sticky).
 * Typical cloning stays 3:1 / 5:1; short oligos go up to 10:1.
 */
export function defaultLigationMultiplicity(input: {
  insertLengthBp: number
  junctionsBlunt?: boolean
}): number {
  const insert = Math.max(0, input.insertLengthBp)
  const blunt = Boolean(input.junctionsBlunt)
  if (insert <= OLIGO_INSERT_MAX_BP) return DEFAULT_OLIGO_MULTIPLICITY
  if (insert <= SHORT_INSERT_MAX_BP) return blunt ? DEFAULT_OLIGO_MULTIPLICITY : 7
  if (insert <= SMALL_INSERT_MAX_BP) return blunt ? 7 : 5
  return blunt ? DEFAULT_BLUNT_MULTIPLICITY : DEFAULT_STICKY_MULTIPLICITY
}

export function historyJunctionsAreBlunt(node: HistoryNode): boolean {
  const sites = node.regeneratedSites
  return sites.length > 0 && sites.every((site) => site.blunt)
}

/**
 * Single-site linearization (`insertAt`, or `replace` with only one cut) has no
 * excised span; the whole parent is the vector. Insert-at on an insert parent
 * (rare) likewise uses the parent length.
 */
export function recipeFragmentLength(
  role: HistoryRegion['kind'] | null,
  region: HistoryRegion | null,
  seqLen: number,
): number | null {
  const fromRegion = contributedFragmentLength(role, region, seqLen)
  if (fromRegion !== null && fromRegion > 0) return fromRegion
  if (seqLen > 0 && (role === 'insert' || role === 'vector') && (fromRegion === null || fromRegion === 0)) {
    return seqLen
  }
  return null
}

function cloningRecipeRole(
  summary: HistoryInputSummary | undefined,
  geometryRole: HistoryRegion['kind'] | null,
): 'vector' | 'insert' | null {
  switch (summary?.manipulation) {
    case 'insertAt':
    case 'replace':
      return 'vector'
    case 'insert':
    case 'flipAndInsert':
      return 'insert'
    default:
      return geometryRole === 'vector' || geometryRole === 'insert' ? geometryRole : null
  }
}

export function cloningRecipePartsFromHistory(node: HistoryNode): CloningRecipePart[] | null {
  if (!CLONING_RECIPE_OPERATIONS.has(node.operation)) return null
  // TA/GC records predate per-parent input summaries. Their history always
  // stores the insert first and the linearized vector second.
  if ((node.operation === 'taCloning' || node.operation === 'gcCloning') && node.children.length >= 2) {
    const insert = node.children[0]!
    const vector = node.children[1]!
    if (insert.seqLen > 0 && vector.seqLen > 0) {
      return [
        { id: `${vector.id}:vector`, role: 'vector', name: vector.name.replace(/\.dna$/i, '') || 'Vector', lengthBp: vector.seqLen },
        { id: `${insert.id}:insert`, role: 'insert', name: insert.name.replace(/\.dna$/i, '') || 'Insert', lengthBp: insert.seqLen },
      ]
    }
  }
  // sgRNA cloning carries the uncut source plasmid as its first parent. Its
  // InputSummary describes the cut-out cloning window, which is useful for
  // drawing history but is not the vector size used in a ligation recipe.
  if (node.operation === 'cloneSgRNA' && node.children.length >= 2) {
    const vector = node.children[0]!
    const inserts = node.children.slice(1).filter((child) => child.seqLen > 0)
    if (vector.seqLen > 0 && inserts.length) {
      return [
        { id: `${vector.id}:vector`, role: 'vector', name: vector.name.replace(/\.dna$/i, '') || 'Vector', lengthBp: vector.seqLen },
        ...inserts.map((insert, index) => ({
          id: `${insert.id}:insert:${index}`,
          role: 'insert' as const,
          name: insert.name.replace(/\.dna$/i, '') || 'Insert',
          lengthBp: insert.seqLen,
        })),
      ]
    }
  }
  if (node.operation === 'ligateFragments') {
    // A ligation parent is the source construct, while its InputSummary marks
    // the selected arc between the two restriction cuts.  Use that arc rather
    // than the whole ancestor (which may contain substantial unligated DNA).
    const summaries = parentSummaries(node)
    const fragments = node.children.flatMap((child, index) => {
      const summary = summaries[index]
      const { region, role } = contributionGeometry(summary, child.seqLen)
      const lengthBp = recipeFragmentLength(role, region, child.seqLen)
      return lengthBp && lengthBp > 0 ? [{ child, lengthBp }] : []
    })
    if (fragments.length < 2) return null
    return fragments.map((fragment, index) => ({
      id: `${fragment.child.id}:ligation:${index}`,
      // The dialog's reference row uses the existing molar calculations; this
      // is a reference fragment, not a cloning vector.
      role: index === 0 ? 'vector' as const : 'insert' as const,
      name: fragment.child.name.replace(/\.dna$/i, '') || `Fragment ${index + 1}`,
      lengthBp: fragment.lengthBp,
    }))
  }
  const summaries = parentSummaries(node)
  const parts: CloningRecipePart[] = []
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index]
    if (!child) continue
    const summary = summaries[index]
    const { region, role: geometryRole } = contributionGeometry(summary, child.seqLen)
    const role = cloningRecipeRole(summary, geometryRole)
    const lengthBp = recipeFragmentLength(role, region, child.seqLen)
    if (!lengthBp || (role !== 'vector' && role !== 'insert')) continue
    parts.push({
      id: `${child.id}:${index}`,
      role,
      name: child.name.replace(/\.dna$/i, '') || (role === 'vector' ? 'Vector' : 'Insert'),
      lengthBp,
    })
  }
  if (!parts.some((part) => part.role === 'insert') && parts.some((part) => part.role === 'vector')) {
    // Unique-cutter cloning sometimes omits insert geometry; remaining parents are inserts.
    for (let index = 0; index < node.children.length; index += 1) {
      const child = node.children[index]
      if (!child || parts.some((part) => part.id === `${child.id}:${index}`)) continue
      if (child.seqLen <= 0) continue
      parts.push({
        id: `${child.id}:${index}`,
        role: 'insert',
        name: child.name.replace(/\.dna$/i, '') || 'Insert',
        lengthBp: child.seqLen,
      })
    }
  }
  if (!parts.some((part) => part.role === 'vector') || !parts.some((part) => part.role === 'insert')) {
    return null
  }
  return parts
}

export function ligationInsertAmountNg(input: {
  vectorAmountNg: number
  vectorLengthBp: number
  insertLengthBp: number
  multiplicity: number
}): number {
  if (
    input.vectorLengthBp <= 0 ||
    input.insertLengthBp <= 0 ||
    input.vectorAmountNg < 0 ||
    input.multiplicity < 0
  ) {
    return 0
  }
  return input.vectorAmountNg * (input.insertLengthBp / input.vectorLengthBp) * input.multiplicity
}

export function ligationVolumeUl(amountNg: number, concentrationNgPerUl: number): number | null {
  if (!Number.isFinite(amountNg) || !Number.isFinite(concentrationNgPerUl) || concentrationNgPerUl <= 0) {
    return null
  }
  return amountNg / concentrationNgPerUl
}

/** Parse a non-negative lab quantity; empty / invalid → null. */
export function parseRecipeNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

/**
 * Insert:vector length ratio (equimolar masses). Smaller insert → `1 : 6.28`.
 */
export function formatMolarRatio(insertBp: number, vectorBp: number): string {
  if (insertBp <= 0 || vectorBp <= 0) return '—'
  if (insertBp === vectorBp) return '1 : 1'
  if (insertBp < vectorBp) return `1 : ${formatRatioNumber(vectorBp / insertBp)}`
  return `${formatRatioNumber(insertBp / vectorBp)} : 1`
}

export function formatRecipeQuantity(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  const abs = Math.abs(value)
  const fractionDigits = abs >= 100 ? 1 : abs >= 10 ? 2 : digits
  return value.toLocaleString(undefined, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
  })
}

function formatRatioNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const digits = value >= 10 ? 1 : 2
  const rounded = Number(value.toFixed(digits))
  return String(rounded)
}
