import { normalizeDna } from '../../domain/sequence'
import type { Primer, SequenceRecord, Strand } from '../../domain/types'
import type { PrimerPropertiesPayload } from '../ports/hybridWindows'

export type PrimerPropertiesAnnealFields = Pick<
  PrimerPropertiesPayload,
  'templateSequence' | 'preferredStrand' | 'bindings'
>

export function libraryPrimerFromPropertiesPayload(payload: PrimerPropertiesPayload) {
  return {
    name: payload.name,
    sequence: payload.sequence,
    color: payload.color,
    description: payload.description,
    specificity: payload.specificity,
  }
}

export function findRecordPrimerBySequence(record: SequenceRecord, sequence: string): Primer | undefined {
  const normalized = normalizeDna(sequence)
  return record.primers.find((primer) => normalizeDna(primer.sequence) === normalized)
}

export function constructAnnealFieldsFromRecord(
  record: SequenceRecord,
  sequence: string,
): PrimerPropertiesAnnealFields {
  const templateSequence = normalizeDna(record.sequence)
  const primer = findRecordPrimerBySequence(record, sequence)
  if (!primer?.bindings?.length) {
    return { templateSequence }
  }
  return {
    templateSequence,
    preferredStrand: primer.bindings[0]?.strand,
    bindings: primer.bindings,
  }
}

export function constructAnnealFieldsFromWorkspace(
  record: SequenceRecord,
  primerId: string,
): PrimerPropertiesAnnealFields {
  const templateSequence = normalizeDna(record.sequence)
  const primer = record.primers.find((candidate) => candidate.id === primerId)
  if (!primer) return { templateSequence }
  return {
    templateSequence,
    preferredStrand: primer.bindings?.[0]?.strand,
    bindings: primer.bindings,
  }
}

export function primerPropertiesPayloadFromLibrary(
  primer: Pick<PrimerPropertiesPayload, 'name' | 'sequence' | 'color' | 'description' | 'specificity' | 'commonId'>,
  anneal?: PrimerPropertiesAnnealFields,
): PrimerPropertiesPayload {
  return {
    name: primer.name,
    sequence: primer.sequence,
    color: primer.color,
    description: primer.description,
    specificity: primer.specificity,
    commonId: primer.commonId,
    ...anneal,
  }
}

export function primerPropertiesPayloadFromConstructPrimer(
  record: SequenceRecord,
  primer: Pick<Primer, 'name' | 'sequence' | 'color' | 'description' | 'bindings' | 'specificity'>,
  preferredStrand?: Strand,
): PrimerPropertiesPayload {
  return primerPropertiesPayloadFromLibrary(
    {
      name: primer.name,
      sequence: primer.sequence,
      color: primer.color,
      description: primer.description,
      specificity: primer.specificity,
    },
    {
      templateSequence: normalizeDna(record.sequence),
      preferredStrand: preferredStrand ?? primer.bindings?.[0]?.strand,
      bindings: primer.bindings,
    },
  )
}

export function displayAnnealMaskForOrientation(mask: boolean[], showReverseComplement: boolean): boolean[] {
  if (!showReverseComplement) return mask
  return [...mask].reverse()
}
