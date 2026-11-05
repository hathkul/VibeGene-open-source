import { primerHasDisplayableBinding } from './primerSequenceLayout'
import {
  defaultPrimerHybridizationParams,
  type PrimerHybridizationParams,
} from './primerHybridization'
import { normalizeDna } from './sequence'
import type { Primer } from './types'

export type CommonPrimerMatch<T extends { name: string; sequence: string }> = {
  primer: T
  alreadyPresent: boolean
}

/** Common-library oligos that hybridize to the construct under current parameters. */
export function detectCommonPrimers<T extends { name: string; sequence: string }>(
  template: string,
  library: T[],
  existingPrimers: Primer[],
  hybridization: PrimerHybridizationParams = defaultPrimerHybridizationParams,
  additionalTemplates: readonly string[] = [],
): CommonPrimerMatch<T>[] {
  const sequence = normalizeDna(template)
  const extras = additionalTemplates.map((entry) => normalizeDna(entry)).filter(Boolean)
  if ((!sequence && !extras.length) || !library.length) return []
  const present = new Set(existingPrimers.map((primer) => normalizeDna(primer.sequence)).filter(Boolean))
  const matches: CommonPrimerMatch<T>[] = []
  for (const primer of library) {
    const oligo = normalizeDna(primer.sequence)
    if (!oligo) continue
    const hitsConsensus = sequence
      ? primerHasDisplayableBinding(sequence, oligo, hybridization)
      : false
    const hitsMember = !hitsConsensus && extras.some((member) =>
      primerHasDisplayableBinding(member, oligo, hybridization),
    )
    if (!hitsConsensus && !hitsMember) continue
    matches.push({
      primer,
      alreadyPresent: present.has(oligo),
    })
  }
  return matches.sort((left, right) =>
    left.primer.name.localeCompare(right.primer.name, undefined, { sensitivity: 'base' }),
  )
}
