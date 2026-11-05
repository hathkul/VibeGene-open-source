import type { Primer, SequenceRecord } from './types'
import { calculateAnnealTemperature } from './primerThermodynamics'
import { addOperation, createId, extractRange, normalizeDna, reverseComplement } from './sequence'

/** Minimum 3′ annealed Tm before flagging a primer in the Primers tab. */
export const PRIMER_WARN_MIN_TM_C = 38

export function primerAnnealedSequence(primer: Primer) {
  const sequence = normalizeDna(primer.sequence)
  const binding = primer.bindings?.[0]
  if (!binding) return sequence
  const annealed = binding.components
    .filter((component) => component.templateStart !== undefined)
    .map((component) => component.primerBases)
    .join('')
  return annealed || sequence
}

export function designPrimers(record: SequenceRecord, start: number, end: number): Primer[] {
  const amplicon = extractRange(record.sequence, start, end)
  const forwardCore = amplicon.slice(0, 22)
  const reverseCore = reverseComplement(amplicon.slice(-22))

  return [
    { id: createId('primer'), name: `${record.name}_F`, sequence: forwardCore, color: '#2563eb' },
    { id: createId('primer'), name: `${record.name}_R`, sequence: reverseCore, color: '#db2777' },
  ]
}

export function primerWarnings(primer: Primer) {
  const annealed = primerAnnealedSequence(primer)
  const warnings: string[] = []
  if (!annealed) return warnings
  const gc = ((annealed.match(/[GC]/g)?.length ?? 0) / annealed.length) * 100
  const thermo = calculateAnnealTemperature(annealed)
  if (annealed.length < 18) warnings.push('Annealed region shorter than common 18 bp minimum')
  if (gc < 35 || gc > 65) warnings.push('Annealed GC content outside common 35-65% range')
  if (thermo.tmMinC === null || thermo.tmMaxC === null) warnings.push('Tm unavailable for annealed region')
  else if (thermo.tmMinC < PRIMER_WARN_MIN_TM_C) {
    warnings.push(`Annealed Tm below common ${PRIMER_WARN_MIN_TM_C} C minimum`)
  }
  if (/(AAAA|CCCC|GGGG|TTTT)/.test(annealed)) warnings.push('Annealed region contains a 4-base homopolymer run')
  return warnings
}

export function virtualPcr(record: SequenceRecord, forward: Primer, reverse: Primer) {
  const sequence = normalizeDna(record.sequence)
  const forwardIndex = sequence.indexOf(normalizeDna(forward.sequence))
  const reverseIndex = sequence.indexOf(reverseComplement(reverse.sequence))

  if (forwardIndex === -1 || reverseIndex === -1) {
    return { product: '', summary: 'One or both primers do not bind exactly.' }
  }

  const productEnd = reverseIndex + reverse.sequence.length
  const product = forwardIndex <= reverseIndex ? sequence.slice(forwardIndex, productEnd) : sequence.slice(forwardIndex) + sequence.slice(0, productEnd)
  return {
    product,
    summary: `Virtual PCR product is ${product.length} bp from ${forward.name} and ${reverse.name}.`,
  }
}

export function simulateRestrictionLigation(record: SequenceRecord, insert: string, cutSite: number) {
  const normalizedInsert = normalizeDna(insert)
  const cut = Math.max(0, Math.min(record.sequence.length, cutSite))
  const product = record.sequence.slice(0, cut) + normalizedInsert + record.sequence.slice(cut)
  return addOperation(
    {
      ...record,
      id: createId('seq'),
      name: `${record.name} + insert`,
      sequence: product,
    },
    'restriction-ligation',
    `Inserted ${normalizedInsert.length} bp at ${cut + 1}.`,
  )
}

export function simulateGibsonAssembly(record: SequenceRecord, insert: string, overlapLength = 20) {
  const normalizedInsert = normalizeDna(insert)
  const leftOverlap = record.sequence.slice(0, overlapLength)
  const rightOverlap = record.sequence.slice(-overlapLength)
  const trimmedInsert = normalizedInsert.replace(leftOverlap, '').replace(rightOverlap, '')
  const product = record.sequence + trimmedInsert
  return addOperation(
    {
      ...record,
      id: createId('seq'),
      name: `${record.name} Gibson product`,
      sequence: product,
    },
    'gibson',
    `Assembled insert using ${overlapLength} bp overlap heuristic; product is ${product.length} bp.`,
  )
}
