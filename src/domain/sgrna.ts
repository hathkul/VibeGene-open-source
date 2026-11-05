import { parseFeatureQualifiers, serializeFeatureQualifiers } from './featureQualifiers'
import {
  GUIDESCAN_EVIDENCE_QUALIFIER,
  guideScanEvidenceQualifierValue,
  readGuideScanEvidenceFromQualifiers,
  type GuideScanEvidence,
} from './guidescan/evidence'
import { reverseComplement } from './sequence'
import type { FeatureSegment, SequenceFeature, Strand, Topology } from './types'

export type SgRNAPamSide = '3prime' | '5prime'

export type SgRNAPreset = {
  id: string
  label: string
  pamMotif: string
  pamSide: SgRNAPamSide
  guideMinLength: number
  guideMaxLength: number
}

export const SGRNA_PRESETS: readonly SgRNAPreset[] = [
  { id: 'SpCas9', label: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', guideMinLength: 20, guideMaxLength: 20 },
  { id: 'SaCas9', label: 'SaCas9', pamMotif: 'NNGRRT', pamSide: '3prime', guideMinLength: 20, guideMaxLength: 22 },
  { id: 'Cas12a', label: 'Cas12a / Cpf1', pamMotif: 'TTTV', pamSide: '5prime', guideMinLength: 20, guideMaxLength: 24 },
]

export type SgRNAMappingOptions = {
  pamMotif: string
  pamSide: SgRNAPamSide
  guideMinLength?: number
  guideMaxLength?: number
}

export type SgRNATargetHit = {
  strand: Strand
  /** Zero-based start of each interval in the stored (+) sequence. */
  guideStart: number
  pamStart: number
  /** Both sequences are written 5′ to 3′ on the guide strand. */
  guideSequence: string
  pamSequence: string
  guideLocations: FeatureSegment[]
  pamLocations: FeatureSegment[]
}

export type SgRNAAnnotation = {
  id: string
  guide: SequenceFeature
  pam?: SequenceFeature
  nuclease: string
  pamMotif: string
  pamSide: SgRNAPamSide
  spacer: string
  observedPam: string
  /** Persisted GuideScan2 design/validation evidence when present. */
  guideScanEvidence?: GuideScanEvidence | null
}

/** Zero-based boundary in the stored sequence, or null when no supported rule applies. */
export function sgRnaNominalCut(annotation: SgRNAAnnotation, sequenceLength: number, topology: Topology): number | null {
  const locations = annotation.guide.locations
  const first = locations[0]
  const preset = SGRNA_PRESETS.find((candidate) => candidate.id === annotation.nuclease)
  const length = annotation.spacer.length
  if (!preset || !['SpCas9', 'SaCas9'].includes(preset.id) || annotation.pamSide !== '3prime' || !annotation.pam ||
      !matchesIupacPam(annotation.observedPam, preset.pamMotif) || length < preset.guideMinLength || length > preset.guideMaxLength ||
      !first || sequenceLength <= 0 || locations.reduce((sum, loc) => sum + loc.end - loc.start, 0) !== length) return null
  const cut = first.start + (first.strand === 'reverse' ? 3 : length - 3)
  return topology === 'circular' ? cut % sequenceLength : cut <= sequenceLength ? cut : null
}

/** Illustrative Cas12a strand cuts, measured from the PAM-proximal guide boundary.
 * Individual cuts can lie outside a linear sequence or beyond the guide itself. */
export function sgRnaCas12aIllustrativeCuts(annotation: SgRNAAnnotation, sequenceLength: number, topology: Topology): { nonTarget: number | null; target: number | null } | null {
  const first = annotation.guide.locations[0]
  const length = annotation.spacer.length
  if (annotation.nuclease !== 'Cas12a' || annotation.pamSide !== '5prime' || !annotation.pam ||
      !matchesIupacPam(annotation.observedPam, 'TTTN') || length < 20 || length > 24 || !first || sequenceLength <= 0 ||
      annotation.guide.locations.reduce((sum, loc) => sum + loc.end - loc.start, 0) !== length) return null
  const coordinate = (distance: number) => {
    const position = first.strand === 'reverse' ? first.start + length - distance : first.start + distance
    if (topology === 'circular') return ((position % sequenceLength) + sequenceLength) % sequenceLength
    return position >= 0 && position <= sequenceLength ? position : null
  }
  return { nonTarget: coordinate(18), target: coordinate(23) }
}

export type CreateSgRNAOptions = {
  name: string
  nuclease: string
  pamMotif: string
  pamSide: SgRNAPamSide
  spacer: string
  id?: string
  /** Compact GuideScan evidence stored on the guide feature (canonical). */
  guideScanEvidence?: GuideScanEvidence | null
}

const IUPAC: Record<string, string> = {
  A: 'A', C: 'C', G: 'G', T: 'T', U: 'T',
  R: 'AG', Y: 'CT', S: 'GC', W: 'AT', K: 'GT', M: 'AC',
  B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT',
}

const TAG_ID = 'vibegene_sgrna_id'
const TAG_PART = 'vibegene_sgrna_part'
const TAG_MARKER = 'vibegene_sgrna'
const COLOR = '#16a34a'

function normalizedDna(value: string) {
  return value.replace(/\s/g, '').toUpperCase().replace(/U/g, 'T')
}

function validateInput(spacer: string, options: SgRNAMappingOptions) {
  if (!spacer || /[^ACGT]/.test(spacer)) throw new Error('Guide spacer must contain only A, C, G, or T.')
  const motif = normalizedDna(options.pamMotif)
  if (!motif || [...motif].some((base) => !IUPAC[base])) throw new Error('PAM motif contains an unsupported IUPAC base.')
  if (options.pamSide !== '3prime' && options.pamSide !== '5prime') throw new Error('PAM side must be 3prime or 5prime.')
  if (options.guideMinLength !== undefined && spacer.length < options.guideMinLength) throw new Error(`Guide spacer must be at least ${options.guideMinLength} nt.`)
  if (options.guideMaxLength !== undefined && spacer.length > options.guideMaxLength) throw new Error(`Guide spacer must be at most ${options.guideMaxLength} nt.`)
  return motif
}

export function matchesIupacPam(sequence: string, motif: string): boolean {
  const observed = normalizedDna(sequence)
  const expected = normalizedDna(motif)
  return observed.length === expected.length && [...expected].every((code, index) => Boolean(IUPAC[code]?.includes(observed[index]!)))
}

function getInterval(sequence: string, start: number, length: number, topology: Topology): string | null {
  const n = sequence.length
  if (!n || length > n) return null
  if (topology === 'linear') return start < 0 || start + length > n ? null : sequence.slice(start, start + length)
  const offset = ((start % n) + n) % n
  return (sequence + sequence).slice(offset, offset + length)
}

function intervalLocations(start: number, length: number, strand: Strand, n: number): FeatureSegment[] {
  const offset = ((start % n) + n) % n
  const end = offset + length
  if (end <= n) return [{ start: offset, end, strand }]
  return [{ start: offset, end: n, strand }, { start: 0, end: end - n, strand }]
}

/** Locate exact spacer matches with a compatible adjacent PAM on either DNA strand. */
export function findSgRNATargets(
  sequence: string,
  spacer: string,
  topology: Topology,
  options: SgRNAMappingOptions,
): SgRNATargetHit[] {
  const dna = normalizedDna(sequence)
  const guide = normalizedDna(spacer)
  const motif = validateInput(guide, options)
  const n = dna.length
  if (!n || guide.length + motif.length > n) return []
  const hits: SgRNATargetHit[] = []
  const seen = new Set<string>()
  for (let start = 0; start < n; start += 1) {
    for (const strand of ['forward', 'reverse'] as const) {
      const genomicGuide = getInterval(dna, start, guide.length, topology)
      if (genomicGuide !== (strand === 'forward' ? guide : reverseComplement(guide))) continue
      const pamStart = strand === 'forward'
        ? start + (options.pamSide === '3prime' ? guide.length : -motif.length)
        : start + (options.pamSide === '3prime' ? -motif.length : guide.length)
      const genomicPam = getInterval(dna, pamStart, motif.length, topology)
      if (!genomicPam) continue
      const pamSequence = strand === 'forward' ? genomicPam : reverseComplement(genomicPam)
      if (!matchesIupacPam(pamSequence, motif)) continue
      const normalizedPamStart = ((pamStart % n) + n) % n
      // A palindromic spacer may be reported on both strands at one physical site.
      const key = `${start}:${normalizedPamStart}`
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({
        strand,
        guideStart: start,
        pamStart: normalizedPamStart,
        guideSequence: guide,
        pamSequence,
        guideLocations: intervalLocations(start, guide.length, strand, n),
        pamLocations: intervalLocations(pamStart, motif.length, strand, n),
      })
    }
  }
  return hits
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `sgrna-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Two ordinary features survive SnapGene .dna and GenBank export without a custom packet. */
export function createSgRNAFeatures(hit: SgRNATargetHit, options: CreateSgRNAOptions): [SequenceFeature, SequenceFeature] {
  const id = options.id?.trim() || newId()
  const name = options.name.trim() || 'sgRNA'
  const spacer = normalizedDna(options.spacer)
  const motif = normalizedDna(options.pamMotif)
  if (spacer !== hit.guideSequence) throw new Error('Spacer does not match the selected target hit.')
  if (!matchesIupacPam(hit.pamSequence, motif)) throw new Error('Selected target PAM does not match the motif.')
  const common = { [TAG_ID]: id, [TAG_MARKER]: '1' }
  const evidenceValue = guideScanEvidenceQualifierValue(options.guideScanEvidence)
  const guide: SequenceFeature = {
    id: `sgrna-guide-${newId()}`,
    name,
    type: 'misc_feature',
    color: COLOR,
    locations: hit.guideLocations.map((location) => ({ ...location })),
    notes: serializeFeatureQualifiers({
      ...common,
      [TAG_PART]: 'guide',
      vibegene_sgrna_nuclease: options.nuclease.trim() || 'Custom',
      vibegene_sgrna_pam_motif: motif,
      vibegene_sgrna_pam_side: options.pamSide,
      vibegene_sgrna_spacer: spacer,
      ...(evidenceValue ? { [GUIDESCAN_EVIDENCE_QUALIFIER]: evidenceValue } : {}),
      note: `${name} guide (${options.nuclease.trim() || 'Custom'}; ${motif} PAM)`,
    }),
  }
  const pam: SequenceFeature = {
    id: `sgrna-pam-${newId()}`,
    name: `${name} PAM (${hit.pamSequence})`,
    type: 'misc_feature',
    color: COLOR,
    locations: hit.pamLocations.map((location) => ({ ...location })),
    notes: serializeFeatureQualifiers({
      ...common,
      [TAG_PART]: 'pam',
      vibegene_sgrna_pam_motif: motif,
      vibegene_sgrna_observed_pam: hit.pamSequence,
      note: `${name} PAM (${hit.pamSequence})`,
    }),
  }
  return [guide, pam]
}

function sgRNAQualifiers(feature: SequenceFeature) {
  return parseFeatureQualifiers(feature.notes)
}

function partOf(feature: SequenceFeature): 'guide' | 'pam' | null {
  const q = sgRNAQualifiers(feature)
  if (!q[TAG_ID] || q[TAG_MARKER] !== '1' || feature.type !== 'misc_feature') return null
  if (q[TAG_PART] === 'guide' || !q[TAG_PART]) return 'guide'
  if (q[TAG_PART] === 'pam') return 'pam'
  return null
}

/** Guide or PAM half of a tagged sgRNA annotation (paired or orphan). */
export function isSgRNAFeature(feature: SequenceFeature): boolean {
  return partOf(feature) !== null
}

/** Unknown and orphan tagged features remain untouched in the source feature list. */
export function groupSgRNAFeatures(features: readonly SequenceFeature[]): SgRNAAnnotation[] {
  const guides = features.filter((feature) => partOf(feature) === 'guide')
  return guides.map((guide) => {
    const q = sgRNAQualifiers(guide)
    const id = q[TAG_ID]!
    const pam = features.find((feature) => partOf(feature) === 'pam' && sgRNAQualifiers(feature)[TAG_ID] === id)
    const pq = pam ? sgRNAQualifiers(pam) : {}
    return {
      id,
      guide,
      pam,
      nuclease: q.vibegene_sgrna_nuclease || 'Custom',
      pamMotif: q.vibegene_sgrna_pam_motif || pq.vibegene_sgrna_pam_motif || '',
      pamSide: q.vibegene_sgrna_pam_side === '5prime' ? '5prime' : '3prime',
      spacer: q.vibegene_sgrna_spacer || '',
      observedPam: pq.vibegene_sgrna_observed_pam || '',
      guideScanEvidence: readGuideScanEvidenceFromQualifiers(q, pq),
    }
  })
}

function pairMember(feature: SequenceFeature, id: string) {
  return partOf(feature) !== null && sgRNAQualifiers(feature)[TAG_ID] === id
}

/** Remove the known pair, leaving unrelated and unknown feature annotations intact. */
export function deleteSgRNAAnnotation(features: readonly SequenceFeature[], id: string): SequenceFeature[] {
  return features.filter((feature) => !pairMember(feature, id))
}

/** Replace the known pair while preserving its stable link ID and extra qualifiers. */
export function replaceSgRNAAnnotation(
  features: readonly SequenceFeature[],
  id: string,
  newPair: readonly [SequenceFeature, SequenceFeature],
): SequenceFeature[] {
  const oldPair = features.filter((feature) => pairMember(feature, id))
  if (!oldPair.some((feature) => partOf(feature) === 'guide')) throw new Error('sgRNA annotation was not found.')
  const updated = newPair.map((feature) => {
    const part = partOf(feature)
    if (!part) throw new Error('Replacement must contain a tagged sgRNA guide and PAM.')
    const old = oldPair.find((candidate) => partOf(candidate) === part)
    const existing = old ? { ...sgRNAQualifiers(old) } : {}
    const next = sgRNAQualifiers(feature)
    // Evidence is authored by createSgRNAFeatures; drop stale copies so cleared evidence stays cleared.
    delete existing[GUIDESCAN_EVIDENCE_QUALIFIER]
    return {
      ...feature,
      id: old?.id ?? feature.id,
      notes: serializeFeatureQualifiers({ ...existing, ...next, [TAG_ID]: id }),
    }
  }) as [SequenceFeature, SequenceFeature]
  if (partOf(updated[0]) !== 'guide' || partOf(updated[1]) !== 'pam') throw new Error('Replacement must be ordered guide, PAM.')
  const index = features.findIndex((feature) => pairMember(feature, id))
  const remaining = deleteSgRNAAnnotation(features, id)
  remaining.splice(index, 0, ...updated)
  return remaining
}
