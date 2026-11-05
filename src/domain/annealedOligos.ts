import { normalizeDnaEnds } from './dnaEnds'
import { serializeFeatureQualifiers } from './featureQualifiers'
import { snapshotParentalHistoryNode } from './snapgeneHistoryExport'
import { createId, normalizeDna, nowIso, reverseComplement } from './sequence'
import { sgRnaOligoDescription, type SgRnaOligoDirection } from './sgrnaOligoPrimers'
import type { DnaEnds, HistoryNode, Primer, PrimerBindingLayout, SequenceFeature, SequenceRecord } from './types'

const MIN_DUPLEX_LENGTH = 8

export type AnnealedDuplex = {
  sequence: string
  upstreamStickiness: number
  downstreamStickiness: number
  /** Top-strand interval covered by the sense oligo. */
  senseStart: number
  senseEnd: number
  /** Top-strand interval covered by the antisense oligo. */
  antisenseStart: number
  antisenseEnd: number
}

export type AnnealedOligoInput = {
  name: string
  sequence: string
  description?: string
}

export type AnnealedGuideAnnotation = {
  id: string
  name: string
  spacer: string
  expressedGuide?: string
  nuclease?: string
  pamMotif?: string
  pamSide?: string
}

/**
 * Anneal a sense oligo (top strand, 5′→3′) and an antisense oligo (bottom strand, 5′→3′)
 * into one linear top-strand sequence. Unpaired 5′ tails become sticky ends.
 * Positive stickiness is a 5′ overhang; negative stickiness is a 3′ overhang.
 */
export function annealComplementaryOligos(senseRaw: string, antisenseRaw: string): AnnealedDuplex | null {
  const sense = normalizeDna(senseRaw)
  const covered = reverseComplement(normalizeDna(antisenseRaw))
  if (!sense || !covered || sense.length < MIN_DUPLEX_LENGTH || covered.length < MIN_DUPLEX_LENGTH) return null

  let best: { offset: number; overlap: number } | null = null
  let tied = false
  for (let offset = 1 - covered.length; offset < sense.length; offset += 1) {
    const overlapStart = Math.max(0, offset)
    const overlapEnd = Math.min(sense.length, offset + covered.length)
    const overlap = overlapEnd - overlapStart
    if (overlap < MIN_DUPLEX_LENGTH) continue
    let matches = true
    for (let index = overlapStart; index < overlapEnd; index += 1) {
      if (sense[index] !== covered[index - offset]) {
        matches = false
        break
      }
    }
    if (!matches) continue
    if (!best || overlap > best.overlap) {
      best = { offset, overlap }
      tied = false
    } else if (overlap === best.overlap) {
      tied = true
    }
  }
  if (!best || tied) return null

  const offset = best.offset
  const senseStart = offset >= 0 ? 0 : -offset
  const coveredStart = offset >= 0 ? offset : 0
  const senseEnd = senseStart + sense.length
  const coveredEnd = coveredStart + covered.length
  const sequence = (offset < 0 ? covered.slice(0, -offset) : '')
    + sense
    + (coveredEnd > senseEnd ? covered.slice(covered.length - (coveredEnd - senseEnd)) : '')
  if (sequence.length !== Math.max(senseEnd, coveredEnd)) return null

  return {
    sequence,
    upstreamStickiness: offset,
    downstreamStickiness: coveredEnd - senseEnd,
    senseStart,
    senseEnd,
    antisenseStart: coveredStart,
    antisenseEnd: coveredEnd,
  }
}

function binding(strand: 'forward' | 'reverse', start: number, end: number, bases: string): PrimerBindingLayout {
  return {
    strand,
    templateStart: start,
    templateEnd: end,
    components: [{ primerBases: bases, templateStart: start, templateEnd: end }],
  }
}

function guideFeature(sequence: string, guide: AnnealedGuideAnnotation): SequenceFeature | null {
  const expressed = normalizeDna(guide.expressedGuide || guide.spacer)
  const spacer = normalizeDna(guide.spacer)
  const at = expressed ? sequence.indexOf(expressed) : -1
  const start = at >= 0 ? at : sequence.indexOf(spacer)
  const length = at >= 0 ? expressed.length : spacer.length
  if (start < 0 || length <= 0) return null
  return {
    id: createId('sgrna-guide'),
    name: guide.name,
    type: 'misc_feature',
    color: '#16a34a',
    locations: [{ start, end: start + length, strand: 'forward' }],
    notes: serializeFeatureQualifiers({
      vibegene_sgrna: '1',
      vibegene_sgrna_id: createId('sgrna'),
      vibegene_sgrna_part: 'guide',
      ...(guide.nuclease ? { vibegene_sgrna_nuclease: guide.nuclease } : {}),
      ...(guide.pamMotif ? { vibegene_sgrna_pam_motif: guide.pamMotif } : {}),
      ...(guide.pamSide ? { vibegene_sgrna_pam_side: guide.pamSide } : {}),
      vibegene_sgrna_spacer: spacer,
      ...(expressed ? { vibegene_sgrna_expressed_guide: expressed } : {}),
      vibegene_sgrna_source_id: guide.id,
      note: `${guide.name} annealed from cloning oligos; target ${spacer}`,
    }),
  }
}

function copyFeatures(features: SequenceFeature[]): SequenceFeature[] {
  return features.map((feature) => ({
    ...feature,
    id: createId('feat'),
    locations: feature.locations.map((location) => ({ ...location })),
  }))
}

/**
 * A linear construct for one complementary oligo pair. The parent plasmid is the history ancestor.
 * When `insert` is the duplex already built by cloning, its sequence, ends, and features are kept.
 */
export function presentAnnealedInsert(input: {
  parent: SequenceRecord
  sense: AnnealedOligoInput
  antisense: AnnealedOligoInput
  insert?: SequenceRecord
  guide?: AnnealedGuideAnnotation
}): SequenceRecord | null {
  const duplex = annealComplementaryOligos(input.sense.sequence, input.antisense.sequence)
  const sequence = input.insert?.sequence ? normalizeDna(input.insert.sequence) : duplex?.sequence
  if (!sequence || (!input.insert && !duplex)) return null
  const ends: DnaEnds = normalizeDnaEnds(input.insert?.dnaEnds ?? (duplex ? {
    upstream: { modification: 'fivePrimePhosphorylated', stickiness: duplex.upstreamStickiness },
    downstream: { modification: 'fivePrimePhosphorylated', stickiness: duplex.downstreamStickiness },
  } : undefined))
  const senseSequence = normalizeDna(input.sense.sequence)
  const antisenseSequence = normalizeDna(input.antisense.sequence)
  const senseAt = duplex ?? annealComplementaryOligos(senseSequence, antisenseSequence)
  const sensePrimer: Primer = {
    id: createId('primer'),
    name: input.sense.name,
    sequence: senseSequence,
    color: '#16a34a',
    description: input.sense.description ?? sgRnaOligoDescription('sense'),
    bindings: senseAt ? [binding('forward', senseAt.senseStart, senseAt.senseEnd, senseSequence)] : [],
  }
  const antisensePrimer: Primer = {
    id: createId('primer'),
    name: input.antisense.name,
    sequence: antisenseSequence,
    color: '#16a34a',
    description: input.antisense.description ?? sgRnaOligoDescription('antisense'),
    bindings: senseAt ? [binding('reverse', senseAt.antisenseStart, senseAt.antisenseEnd, antisenseSequence)] : [],
  }
  const features = input.insert?.features.length
    ? copyFeatures(input.insert.features)
    : input.guide ? [guideFeature(sequence, input.guide)].filter((feature): feature is SequenceFeature => Boolean(feature)) : []
  const now = nowIso()
  const name = input.insert?.name?.trim() || `${input.guide?.name ?? input.sense.name.replace(/_sense$/i, '')} annealed oligos`
  const record: SequenceRecord = {
    id: createId('seq'),
    name,
    description: 'Annealed cloning oligos. Unpaired 5′ tails are the sticky ends.',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features,
    primers: [sensePrimer, antisensePrimer],
    operations: [{
      id: createId('op'),
      type: 'annealOligos',
      summary: `Annealed ${sensePrimer.name} and ${antisensePrimer.name} from ${input.parent.name}`,
      createdAt: now,
    }],
    dnaEnds: ends,
    dnaEndsProvenance: 'user-defined',
    construct: input.parent.construct,
    createdAt: now,
    updatedAt: now,
  }
  const history: HistoryNode = {
    id: createId('history'),
    name,
    seqLen: sequence.length,
    circular: false,
    operation: 'annealOligos',
    resurrectable: false,
    hideHistory: false,
    upstreamModification: 'FivePrimePhosphorylated',
    downstreamModification: 'FivePrimePhosphorylated',
    upstreamStickiness: ends.upstream.stickiness,
    downstreamStickiness: ends.downstream.stickiness,
    oligos: record.primers.map((primer) => ({
      name: primer.name,
      sequence: primer.sequence,
      description: primer.description,
    })),
    regeneratedSites: [],
    inputSummaries: [],
    features: features.map((feature) => ({
      name: feature.name,
      type: feature.type,
      color: feature.color,
      strand: feature.locations[0]?.strand ?? 'forward',
      segments: feature.locations.map((location) => ({ start: location.start, end: location.end })),
    })),
    sequence,
    primers: record.primers,
    children: [snapshotParentalHistoryNode(input.parent)],
  }
  return { ...record, history }
}

export function sgRnaOligoDirectionFromName(name: string): SgRnaOligoDirection | null {
  if (/_antisense$/i.test(name)) return 'antisense'
  if (/_sense$/i.test(name)) return 'sense'
  return null
}

export function complementaryPrimerPair(primers: readonly Primer[]): { sense: Primer; antisense: Primer } | null {
  if (primers.length !== 2) return null
  const [first, second] = primers
  if (!first || !second || first.id === second.id) return null
  const firstDirection = sgRnaOligoDirectionFromName(first.name)
  const secondDirection = sgRnaOligoDirectionFromName(second.name)
  const named = firstDirection === 'sense' && secondDirection === 'antisense'
    ? { sense: first, antisense: second }
    : firstDirection === 'antisense' && secondDirection === 'sense'
      ? { sense: second, antisense: first }
      : null
  if (named) return annealComplementaryOligos(named.sense.sequence, named.antisense.sequence) ? named : null
  if (annealComplementaryOligos(first.sequence, second.sequence)) return { sense: first, antisense: second }
  if (annealComplementaryOligos(second.sequence, first.sequence)) return { sense: second, antisense: first }
  return null
}

/** The other oligo of a named `_sense` / `_antisense` pair on the same primer list. */
export function partnerForCloningOligo(primer: Primer, primers: readonly Primer[]): { sense: Primer; antisense: Primer } | null {
  const direction = sgRnaOligoDirectionFromName(primer.name)
  if (!direction) return null
  const stem = primer.name.replace(/_(?:sense|antisense)$/i, '')
  const opposite = direction === 'sense' ? 'antisense' : 'sense'
  const mates = primers.filter((candidate) =>
    candidate.id !== primer.id
    && sgRnaOligoDirectionFromName(candidate.name) === opposite
    && candidate.name.replace(/_(?:sense|antisense)$/i, '') === stem)
  if (mates.length !== 1) return null
  return complementaryPrimerPair([primer, mates[0]!])
}
