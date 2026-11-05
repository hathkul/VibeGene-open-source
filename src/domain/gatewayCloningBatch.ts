import type { GatewayInsertConfig, GatewayPrimerDraft } from './gatewayBpCloning'
import { normalizeDna } from './sequence'
import type { Primer, SequenceRecord } from './types'
import {
  constructNameStem,
  expandRestrictionInsertSources,
  type RestrictionBatchSourceChoice,
} from './restrictionCloningBatch'

export type GatewayBatchSourceChoice = RestrictionBatchSourceChoice

export const GATEWAY_INSERT_NAME_TOKEN = '<insert_name>'
export const GATEWAY_DONOR_NAME_TOKEN = '<donor_name>'
export const GATEWAY_DESTINATION_NAME_TOKEN = '<destination_name>'
export const GATEWAY_ENTRY_NAMES_TOKEN = '<entry_names>'

export function expandGatewayBatchSources(
  choices: readonly GatewayBatchSourceChoice[],
): GatewayBatchSourceChoice[] {
  return expandRestrictionInsertSources(choices, { topology: 'source' })
}

function remapDraft(draft: GatewayPrimerDraft): GatewayPrimerDraft {
  return { ...draft, sourcePrimerId: null }
}

export function remapGatewayInsertConfig(
  template: GatewayInsertConfig,
  record: SequenceRecord,
): GatewayInsertConfig {
  const selectedRange = template.selectedRange
    ? {
        start: Math.min(template.selectedRange.start, record.sequence.length),
        end: Math.min(template.selectedRange.end, record.sequence.length),
      }
    : null
  return {
    ...template,
    record,
    selectedRange: selectedRange && selectedRange.end > selectedRange.start ? selectedRange : null,
    selectedAmpliconId: null,
    forwardPrimer: remapDraft(template.forwardPrimer),
    reversePrimer: remapDraft(template.reversePrimer),
  }
}

export function gatewayBatchCombinationCount<T>(sets: readonly (readonly T[])[]): number {
  if (sets.some((set) => set.length === 0)) return 0
  return sets.reduce((count, set) => count * set.length, 1)
}

/** Stable Cartesian product with a limit so a four-slot LR matrix cannot freeze the dialog. */
export function gatewayBatchCombinations<T>(
  sets: readonly (readonly T[])[],
  limit = 10_000,
): T[][] {
  if (sets.some((set) => set.length === 0)) return []
  const rows: T[][] = []
  const row: T[] = []
  const visit = (setIndex: number) => {
    if (rows.length >= limit) return
    if (setIndex === sets.length) {
      rows.push([...row])
      return
    }
    for (const entry of sets[setIndex]!) {
      row.push(entry)
      visit(setIndex + 1)
      row.pop()
      if (rows.length >= limit) return
    }
  }
  visit(0)
  return rows
}

export function renderGatewayBpBatchName(
  template: string,
  insertName: string,
  donorName: string,
): string {
  const value = template.trim() || `Entry ${GATEWAY_INSERT_NAME_TOKEN}.dna`
  return value
    .replace(/<insert_name>/gi, constructNameStem(insertName, 'Insert'))
    .replace(/<donor_name>/gi, constructNameStem(donorName, 'Donor'))
}

export function renderGatewayLrBatchName(
  template: string,
  entryNames: string[],
  destinationName: string,
): string {
  const stems = entryNames.map((name, index) => constructNameStem(name, `Entry ${index + 1}`))
  let value = template.trim() || `Expression ${GATEWAY_ENTRY_NAMES_TOKEN}.dna`
  value = value
    .replace(/<entry_names>/gi, stems.join(' + '))
    .replace(/<destination_name>/gi, constructNameStem(destinationName, 'Destination'))
  stems.forEach((name, index) => {
    value = value.replace(new RegExp(`<entry${index + 1}_name>`, 'gi'), name)
  })
  return value
}

export function deduplicateGatewayBatchPrimers(
  candidates: readonly { key: string; primers: readonly Primer[] }[],
): Array<{ primer: Primer; productKeys: string[] }> {
  const bySequence = new Map<string, { primer: Primer; productKeys: Set<string> }>()
  candidates.forEach((candidate) => candidate.primers.forEach((primer) => {
    const sequence = normalizeDna(primer.sequence)
    if (!sequence) return
    const entry = bySequence.get(sequence) ?? { primer, productKeys: new Set<string>() }
    entry.productKeys.add(candidate.key)
    bySequence.set(sequence, entry)
  }))
  return [...bySequence.values()].map((entry) => ({
    primer: entry.primer,
    productKeys: [...entry.productKeys],
  }))
}
