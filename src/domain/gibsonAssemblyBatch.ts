import type { GibsonPartConfig } from './gibsonAssembly'
import { normalizeDna } from './sequence'
import type { Primer } from './types'
import {
  constructNameStem,
  expandRestrictionInsertSources,
  remapRestrictionPartConfig,
  type RestrictionBatchSourceChoice,
} from './restrictionCloningBatch'

export const GIBSON_PART_NAMES_TOKEN = '<part_names>'

export type GibsonBatchSourceChoice = RestrictionBatchSourceChoice

export function expandGibsonBatchSources(
  choices: readonly GibsonBatchSourceChoice[],
): GibsonBatchSourceChoice[] {
  return expandRestrictionInsertSources(choices, { topology: 'source' })
}

/** Apply one slot's preparation settings to another member/construct. */
export function remapGibsonPartConfig(
  template: GibsonPartConfig,
  record: GibsonBatchSourceChoice['record'],
): GibsonPartConfig {
  if (template.record === record) return { ...template, record }
  if (template.linearizationMode === 'restriction') {
    const mapped = remapRestrictionPartConfig(
      {
        role: template.role === 'vector' ? 'vector' : 'insert',
        record: template.record,
        leftCut: template.leftCut,
        rightCut: template.rightCut,
        selectedFragmentId: template.selectedFragmentId,
        orientation: template.orientation,
      },
      record,
    )
    return {
      ...template,
      record,
      leftCut: mapped.leftCut,
      rightCut: mapped.rightCut,
      selectedFragmentId: mapped.selectedFragmentId,
    }
  }

  const amplifyRange = template.amplifyRange
    ? {
        start: Math.min(template.amplifyRange.start, record.sequence.length),
        end: Math.min(template.amplifyRange.end, record.sequence.length),
      }
    : null
  return {
    ...template,
    record,
    amplifyRange:
      amplifyRange && amplifyRange.end > amplifyRange.start ? amplifyRange : null,
    selectedAmpliconId: null,
    forwardPrimer: { ...template.forwardPrimer, sourcePrimerId: null },
    reversePrimer: { ...template.reversePrimer, sourcePrimerId: null },
  }
}

export function gibsonBatchCombinations<T>(sets: readonly (readonly T[])[]): T[][] {
  if (sets.some((set) => set.length === 0)) return []
  return sets.reduce<T[][]>(
    (rows, set) => rows.flatMap((row) => set.map((entry) => [...row, entry])),
    [[]],
  )
}

export function renderMassGibsonProductName(template: string, partNames: string[]): string {
  const joined = partNames.map((name) => constructNameStem(name, 'Part')).join(' + ')
  const value = template.trim() || `Assembled ${GIBSON_PART_NAMES_TOKEN}.dna`
  return value.replace(/<part_names>/gi, joined)
}

/** Collapse identical oligos while retaining the products that use each sequence. */
export function deduplicateGibsonBatchPrimers(
  candidates: readonly { key: string; primers: readonly Primer[] }[],
): Array<{ primer: Primer; productKeys: string[] }> {
  const bySequence = new Map<string, { primer: Primer; productKeys: Set<string> }>()
  for (const candidate of candidates) {
    for (const primer of candidate.primers) {
      const sequence = normalizeDna(primer.sequence)
      if (!sequence) continue
      const entry = bySequence.get(sequence) ?? { primer, productKeys: new Set<string>() }
      entry.productKeys.add(candidate.key)
      bySequence.set(sequence, entry)
    }
  }
  return [...bySequence.values()].map((entry) => ({
    primer: entry.primer,
    productKeys: [...entry.productKeys],
  }))
}
