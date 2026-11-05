import type { HistoryNode, Primer, SequenceRecord } from './types'

export type SgRnaOligoDirection = 'sense' | 'antisense'

const MARKER = /\[vibegene:sgrna-oligo:v1:(sense|antisense)\]/i
const LEGACY_DESCRIPTION = /^sgRNA cloning (sense|antisense) oligo\b/i

/** Stored in the native SnapGene Primer description field, beside readable instructions. */
export function sgRnaOligoDescription(direction: SgRnaOligoDirection): string {
  return `sgRNA cloning ${direction} oligo, 5′→3′; order with 5′ phosphate [vibegene:sgrna-oligo:v1:${direction}]`
}

/** Existing generated primers predate the marker, so retain their exact description pattern. */
export function sgRnaOligoDirection(primer: Pick<Primer, 'description'>): SgRnaOligoDirection | null {
  const description = primer.description ?? ''
  const match = MARKER.exec(description) ?? LEGACY_DESCRIPTION.exec(description)
  return match?.[1]?.toLowerCase() === 'sense' || match?.[1]?.toLowerCase() === 'antisense'
    ? match[1].toLowerCase() as SgRnaOligoDirection
    : null
}

export function isSgRnaCloningOligo(primer: Pick<Primer, 'description'>): boolean {
  return sgRnaOligoDirection(primer) !== null
}

/** Hide the internal classification marker when presenting an oligo's description. */
export function primerDescriptionForDisplay(primer: Pick<Primer, 'description'>): string {
  const description = primer.description ?? ''
  return isSgRnaCloningOligo(primer) ? description.replace(MARKER, '').trim() : description
}

/**
 * Repair the historical case where one generated oligo took the product's name.
 * The structured cloning history supplies the intended name and exact synthesis sequence.
 * A typed cloning-oligo description and product-name/empty name are both required, so
 * unrelated user primers and intentionally renamed oligos are never touched.
 */
export function reconcileSgRnaOligoNames(
  primers: readonly Primer[],
  history: HistoryNode | undefined,
  productName: string,
): Primer[] {
  const recipe = history?.sgRnaCloning
  if (!recipe || history?.operation !== 'cloneSgRNA') return [...primers]
  return primers.map((primer) => {
    const direction = sgRnaOligoDirection(primer)
    if (!direction || (primer.name?.trim() && primer.name !== productName && primer.name !== 'SnapGene primer')) return primer
    const matching = recipe.oligos.filter((oligo) =>
      oligo.sequence.toUpperCase() === primer.sequence.toUpperCase()
      && oligo.name.endsWith(`_${direction}`))
    return matching.length === 1 ? { ...primer, name: matching[0]!.name } : primer
  })
}

export function reconcileSgRnaOligoNamesInRecord(record: SequenceRecord): SequenceRecord {
  const primers = reconcileSgRnaOligoNames(record.primers, record.history, record.name)
  const traceFiles = record.traceFiles?.map((member) => ({
    ...member,
    primers: member.primers
      ? reconcileSgRnaOligoNames(member.primers, member.history, member.fileName)
      : member.primers,
  }))
  return { ...record, primers, ...(traceFiles ? { traceFiles } : {}) }
}
