import type { MoleculeType, Orf, Primer, PrimerBinding, PrimerBindingLayout, RestrictionSite, SequenceFeature, SequenceRecord, Strand, StrandColorRange, Topology } from './types'

const dnaAlphabet = /[^ACGTRYSWKMBDHVN]/gi
const rnaAlphabet = /[^ACGURYSWKMBDHVN]/gi
/** Standard, ambiguous, and genetically encoded non-standard amino acids plus stop. */
const proteinAlphabet = /[^ABCDEFGHIKLMNPQRSTVWYBXZJUO*]/gi

export type SequenceSelectionRange = {
  start: number
  end: number
}

export type StrandPairSelection = {
  forward: SequenceSelectionRange
  reverse: SequenceSelectionRange
}

function cutPointRange(position: number): SequenceSelectionRange {
  return { start: position, end: position + 1 }
}

function cutSpanBetween(first: number, second: number, topology: Topology = 'linear'): SequenceSelectionRange {
  if (first === second) return cutPointRange(first)
  if (topology === 'circular' && second < first) return { start: first, end: second }
  return { start: Math.min(first, second), end: Math.max(first, second) }
}

/** Single-click anchor: one template position at each strand's cut. */
export function restrictionCutAnchorStrandSelection(site: RestrictionSite): StrandPairSelection {
  return {
    forward: cutPointRange(site.cutTop),
    reverse: cutPointRange(site.cutBottom),
  }
}

/** Template span on each strand between two enzyme cuts. */
export function restrictionFragmentStrandSelection(
  anchor: RestrictionSite,
  second: RestrictionSite,
  topology: Topology = 'linear',
): StrandPairSelection {
  return {
    forward: cutSpanBetween(anchor.cutTop, second.cutTop, topology),
    reverse: cutSpanBetween(anchor.cutBottom, second.cutBottom, topology),
  }
}

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

const complementMap: Record<string, string> = {
  A: 'T',
  C: 'G',
  G: 'C',
  T: 'A',
  R: 'Y',
  Y: 'R',
  S: 'S',
  W: 'W',
  K: 'M',
  M: 'K',
  B: 'V',
  D: 'H',
  H: 'D',
  V: 'B',
  N: 'N',
}

const codonTable: Record<string, string> = {
  TTT: 'F',
  TTC: 'F',
  TTA: 'L',
  TTG: 'L',
  CTT: 'L',
  CTC: 'L',
  CTA: 'L',
  CTG: 'L',
  ATT: 'I',
  ATC: 'I',
  ATA: 'I',
  ATG: 'M',
  GTT: 'V',
  GTC: 'V',
  GTA: 'V',
  GTG: 'V',
  TCT: 'S',
  TCC: 'S',
  TCA: 'S',
  TCG: 'S',
  CCT: 'P',
  CCC: 'P',
  CCA: 'P',
  CCG: 'P',
  ACT: 'T',
  ACC: 'T',
  ACA: 'T',
  ACG: 'T',
  GCT: 'A',
  GCC: 'A',
  GCA: 'A',
  GCG: 'A',
  TAT: 'Y',
  TAC: 'Y',
  TAA: '*',
  TAG: '*',
  CAT: 'H',
  CAC: 'H',
  CAA: 'Q',
  CAG: 'Q',
  AAT: 'N',
  AAC: 'N',
  AAA: 'K',
  AAG: 'K',
  GAT: 'D',
  GAC: 'D',
  GAA: 'E',
  GAG: 'E',
  TGT: 'C',
  TGC: 'C',
  TGA: '*',
  TGG: 'W',
  CGT: 'R',
  CGC: 'R',
  CGA: 'R',
  CGG: 'R',
  AGT: 'S',
  AGC: 'S',
  AGA: 'R',
  AGG: 'R',
  GGT: 'G',
  GGC: 'G',
  GGA: 'G',
  GGG: 'G',
}

export function nowIso() {
  return new Date().toISOString()
}

export function nowMs() {
  return Date.now()
}

/** Strip non-DNA characters while preserving upper/lowercase. */
export function sanitizeDna(input: string) {
  return input.replace(dnaAlphabet, '')
}

export function normalizeDna(input: string) {
  return sanitizeDna(input).toUpperCase()
}

/** Strip non-RNA characters while preserving upper/lowercase. */
export function sanitizeRna(input: string) {
  return input.replace(rnaAlphabet, '')
}

/** Strip formatting and non-residue characters while preserving case and stop codons. */
export function sanitizeProtein(input: string) {
  return input.replace(proteinAlphabet, '')
}

export function sanitizeSequenceForMolecule(input: string, molecule: MoleculeType) {
  if (molecule === 'protein') return sanitizeProtein(input)
  if (molecule === 'rna') return sanitizeRna(input)
  return sanitizeDna(input)
}

export function normalizeSequenceForMolecule(input: string, molecule: MoleculeType) {
  return sanitizeSequenceForMolecule(input, molecule).toUpperCase()
}

export function complementDnaBase(base: string): string {
  const upper = base.toUpperCase()
  const complement = complementMap[upper] ?? 'N'
  return base === upper ? complement : complement.toLowerCase()
}

export function reverseComplement(sequence: string) {
  return sanitizeDna(sequence)
    .split('')
    .reverse()
    .map((base) => complementDnaBase(base))
    .join('')
}

export function gcContent(sequence: string) {
  const normalized = normalizeDna(sequence)
  if (!normalized.length) return 0
  const gc = [...normalized].filter((base) => base === 'G' || base === 'C').length
  return (gc / normalized.length) * 100
}

export function tmWallace(sequence: string) {
  const normalized = normalizeDna(sequence)
  const at = [...normalized].filter((base) => base === 'A' || base === 'T').length
  const gc = [...normalized].filter((base) => base === 'G' || base === 'C').length
  return at * 2 + gc * 4
}

export function formatRange(start: number, end: number) {
  return `${start + 1}..${end}`
}

export function extractRange(sequence: string, start: number, end: number) {
  const normalized = normalizeDna(sequence)
  if (start <= end) return normalized.slice(start, end)
  return normalized.slice(start) + normalized.slice(0, end)
}

/** Slice a template range without uppercasing — for clipboard copy of mixed-case DNA. */
export function extractRangePreserveCase(sequence: string, start: number, end: number) {
  const segment = start <= end ? sequence.slice(start, end) : sequence.slice(start) + sequence.slice(0, end)
  return sanitizeDna(segment)
}

export function translateDna(sequence: string) {
  const normalized = normalizeDna(sequence)
  const aminoAcids: string[] = []
  for (let index = 0; index + 2 < normalized.length; index += 3) {
    aminoAcids.push(codonTable[normalized.slice(index, index + 3)] ?? 'X')
  }
  return aminoAcids.join('')
}

export function featureBounds(feature: SequenceFeature) {
  const starts = feature.locations.map((location) => location.start)
  const ends = feature.locations.map((location) => location.end)
  return {
    start: Math.min(...starts),
    end: Math.max(...ends),
    strand: feature.locations[0]?.strand ?? 'forward',
  }
}

/**
 * DNA selection range for a feature when a single contiguous span is safe.
 * Returns null for gapped multi-segment features so selection does not paint
 * intervening bases (which are often out-of-frame after codon-aware remap).
 */
export function contiguousSelectionRangeForFeature(
  feature: Pick<SequenceFeature, 'locations'>,
): SequenceSelectionRange | null {
  if (!feature.locations.length) return null
  const ordered = [...feature.locations].toSorted(
    (left, right) => left.start - right.start || left.end - right.end,
  )
  const start = ordered[0]!.start
  let end = ordered[0]!.end
  for (let index = 1; index < ordered.length; index += 1) {
    const location = ordered[index]!
    if (location.start > end) return null
    end = Math.max(end, location.end)
  }
  return { start, end }
}

/**
 * Total base count covered by a feature, summed across its locations and correct
 * for a location that wraps the circular origin (end <= start). Plain
 * `bounds.end - bounds.start` is wrong for such features (it goes negative or
 * counts the whole molecule), so use this for any size display.
 */
export function featureLength(feature: Pick<SequenceFeature, 'locations'>, sequenceLength: number) {
  return feature.locations.reduce((total, location) => {
    if (location.end > location.start) return total + (location.end - location.start)
    if (location.end === location.start) return total
    return total + (sequenceLength - location.start + location.end)
  }, 0)
}

/** Half-open segment [start, end): shift/extend for an insertion at insertStart. */
export function adjustSegmentForInsert(start: number, end: number, insertStart: number, insertLength: number) {
  if (insertLength <= 0 || end <= insertStart) return { start, end }
  if (insertStart <= start) return { start: start + insertLength, end: end + insertLength }
  return { start, end: end + insertLength }
}

/** Half-open segment [start, end): shift/trim for deleting [deleteStart, deleteEnd). */
export function adjustSegmentForDelete(
  start: number,
  end: number,
  deleteStart: number,
  deleteEnd: number,
): { start: number; end: number } | null {
  const deleteLength = deleteEnd - deleteStart
  if (deleteLength <= 0 || end <= deleteStart) return { start, end }
  if (start >= deleteEnd) return { start: start - deleteLength, end: end - deleteLength }
  if (start >= deleteStart && end <= deleteEnd) return null
  if (start < deleteStart && end > deleteEnd) return { start, end: end - deleteLength }
  if (start < deleteStart && end > deleteStart) return { start, end: deleteStart }
  return { start: deleteStart, end: end - deleteLength }
}

export function adjustFeaturesForInsert(features: SequenceFeature[], insertStart: number, insertLength: number) {
  if (insertLength <= 0) return features
  return features.map((feature) => ({
    ...feature,
    locations: feature.locations
      .map((location) => ({
        ...location,
        ...adjustSegmentForInsert(location.start, location.end, insertStart, insertLength),
      }))
      .filter((location) => location.end > location.start),
  }))
}

export function adjustFeaturesForDelete(features: SequenceFeature[], deleteStart: number, deleteEnd: number) {
  const deleteLength = deleteEnd - deleteStart
  if (deleteLength <= 0) return features
  return features
    .map((feature) => ({
      ...feature,
      locations: feature.locations
        .map((location) => {
          const adjusted = adjustSegmentForDelete(location.start, location.end, deleteStart, deleteEnd)
          return adjusted ? { ...location, ...adjusted } : null
        })
        .filter((location): location is NonNullable<typeof location> => location !== null && location.end > location.start),
    }))
    .filter((feature) => feature.locations.length > 0)
}

function hasComplexPrimerBindings(bindings: PrimerBindingLayout[]) {
  return bindings.some(
    (binding) =>
      binding.components.length > 1 ||
      binding.components.some((component) => component.templateStart === undefined),
  )
}

function adjustTemplateCoordinateForInsert(position: number, insertStart: number, insertLength: number) {
  return position >= insertStart ? position + insertLength : position
}

function adjustPrimerBindingLayoutForInsert(
  layout: PrimerBindingLayout,
  insertStart: number,
  insertLength: number,
): PrimerBindingLayout {
  return {
    ...layout,
    templateStart: adjustTemplateCoordinateForInsert(layout.templateStart, insertStart, insertLength),
    templateEnd: adjustTemplateCoordinateForInsert(layout.templateEnd, insertStart, insertLength),
    components: layout.components.map((component) => ({
      ...component,
      templateStart:
        component.templateStart === undefined
          ? undefined
          : adjustTemplateCoordinateForInsert(component.templateStart, insertStart, insertLength),
      templateEnd:
        component.templateEnd === undefined
          ? undefined
          : adjustTemplateCoordinateForInsert(component.templateEnd, insertStart, insertLength),
    })),
  }
}

function adjustPrimerBindingLayoutForDelete(
  layout: PrimerBindingLayout,
  deleteStart: number,
  deleteEnd: number,
): PrimerBindingLayout | null {
  const adjustedStart = adjustSegmentForDelete(layout.templateStart, layout.templateEnd, deleteStart, deleteEnd)
  if (!adjustedStart) return null
  const components = layout.components.flatMap((component) => {
    if (component.templateStart === undefined || component.templateEnd === undefined) {
      return [component]
    }
    const adjusted = adjustSegmentForDelete(component.templateStart, component.templateEnd, deleteStart, deleteEnd)
    return adjusted ? [{ ...component, ...adjusted }] : []
  })
  if (!components.some((component) => component.templateStart !== undefined)) return null
  return {
    ...layout,
    templateStart: adjustedStart.start,
    templateEnd: adjustedStart.end,
    components,
  }
}

export function adjustPrimersForInsert(primers: Primer[], insertStart: number, insertLength: number) {
  if (insertLength <= 0) return primers
  return primers.map((primer) => {
    if (!primer.bindings?.length || !hasComplexPrimerBindings(primer.bindings)) return primer
    return {
      ...primer,
      bindings: primer.bindings.map((binding) => adjustPrimerBindingLayoutForInsert(binding, insertStart, insertLength)),
    }
  })
}

export function adjustPrimersForDelete(primers: Primer[], deleteStart: number, deleteEnd: number) {
  const deleteLength = deleteEnd - deleteStart
  if (deleteLength <= 0) return primers
  return primers.map((primer) => {
    if (!primer.bindings?.length || !hasComplexPrimerBindings(primer.bindings)) return primer
    return {
      ...primer,
      bindings: primer.bindings
        .map((binding) => adjustPrimerBindingLayoutForDelete(binding, deleteStart, deleteEnd))
        .filter((binding): binding is PrimerBindingLayout => binding !== null),
    }
  })
}

export function applySequenceReplacementAnnotations(
  record: SequenceRecord,
  replaceStart: number,
  replaceEnd: number,
  insertedLength: number,
): Pick<SequenceRecord, 'features' | 'primers'> {
  const deleteLength = replaceEnd - replaceStart
  let features = record.features
  let primers = record.primers
  if (deleteLength > 0) {
    features = adjustFeaturesForDelete(features, replaceStart, replaceEnd)
    primers = adjustPrimersForDelete(primers, replaceStart, replaceEnd)
  }
  if (insertedLength > 0) {
    features = adjustFeaturesForInsert(features, replaceStart, insertedLength)
    primers = adjustPrimersForInsert(primers, replaceStart, insertedLength)
  }
  return { features, primers }
}

export function findMotifs(sequence: string, query: string) {
  const normalized = normalizeDna(sequence)
  const normalizedQuery = normalizeDna(query)
  if (!normalizedQuery) return []
  const hits: number[] = []
  let index = normalized.indexOf(normalizedQuery)
  while (index !== -1) {
    hits.push(index)
    index = normalized.indexOf(normalizedQuery, index + 1)
  }
  return hits
}

export function findOrfs(sequence: string, minimumAminoAcids = 25): Orf[] {
  const normalized = normalizeDna(sequence)
  const strands: Array<{ sequence: string; strand: Strand }> = [
    { sequence: normalized, strand: 'forward' },
    { sequence: reverseComplement(normalized), strand: 'reverse' },
  ]
  const orfs: Orf[] = []

  for (const strandInfo of strands) {
    for (let frame = 0; frame < 3; frame += 1) {
      for (let index = frame; index + 2 < strandInfo.sequence.length; index += 3) {
        if (strandInfo.sequence.slice(index, index + 3) !== 'ATG') continue

        for (let stop = index + 3; stop + 2 < strandInfo.sequence.length; stop += 3) {
          const codon = strandInfo.sequence.slice(stop, stop + 3)
          if (codon !== 'TAA' && codon !== 'TAG' && codon !== 'TGA') continue

          const length = (stop + 3 - index) / 3
          if (length >= minimumAminoAcids) {
            const start = strandInfo.strand === 'forward' ? index : normalized.length - stop - 3
            const end = strandInfo.strand === 'forward' ? stop + 3 : normalized.length - index
            orfs.push({
              id: createId('orf'),
              start,
              end,
              frame,
              strand: strandInfo.strand,
              aminoAcids: translateDna(strandInfo.sequence.slice(index, stop + 3)),
            })
          }
          index = stop
          break
        }
      }
    }
  }

  return orfs.sort((a, b) => a.start - b.start)
}

/** Template coordinate of the 3' annealed base for a primer binding. */
export function primerAnneal3PrimePosition(binding: PrimerBinding) {
  return binding.strand === 'forward' ? Math.max(binding.start, binding.end - 1) : binding.start
}

/** Template coordinate of the 5' annealed base for a primer binding. */
export function primerAnneal5PrimePosition(binding: PrimerBinding) {
  return binding.strand === 'forward' ? binding.start : Math.max(binding.start, binding.end - 1)
}

export function primerBindingLabel(binding: PrimerBinding) {
  const rangeLabel = `(${(binding.start + 1).toLocaleString()} .. ${binding.end.toLocaleString()})`
  const strandLabel = binding.strand === 'forward' ? '+' : '-'
  return `${rangeLabel} ${binding.primer.name}${strandLabel}`
}

export function primerBindingToCalloutSite(binding: PrimerBinding, index: number): RestrictionSite {
  // Leaders and label routing radiate from the 5' end of the annealed span.
  const anchorPosition = primerAnneal5PrimePosition(binding)
  return {
    enzyme: {
      name: primerBindingLabel(binding),
      notation: '',
      recognition: '',
      cutTop: anchorPosition,
      cutBottom: anchorPosition,
      type: 'II',
      overhang: { type: 'blunt' as const, sequence: null, length: 0 },
      manufacturers: [],
      notes: [],
    },
    start: anchorPosition,
    end: anchorPosition,
    match: `__primer_callout__${index}`,
    cutTop: anchorPosition,
    cutBottom: anchorPosition,
  }
}

export function findPrimerBindings(sequence: string, primers: Primer[]): PrimerBinding[] {
  const normalized = normalizeDna(sequence)
  const bindings: PrimerBinding[] = []

  for (const primer of primers) {
    const primerSequence = normalizeDna(primer.sequence)
    // Empty needle matches at every index and can OOM on long templates.
    if (!primerSequence) continue
    const reversePrimer = reverseComplement(primerSequence)
    for (const strand of ['forward', 'reverse'] as const) {
      const needle = strand === 'forward' ? primerSequence : reversePrimer
      let index = normalized.indexOf(needle)
      while (index !== -1) {
        bindings.push({
          primer,
          start: index,
          end: index + needle.length,
          strand,
          mismatches: 0,
        })
        index = normalized.indexOf(needle, index + 1)
      }
    }
  }

  return bindings
}

export function addOperation(record: SequenceRecord, type: string, summary: string): SequenceRecord {
  const updatedAt = nowIso()
  return {
    ...record,
    operations: [{ id: createId('op'), type, summary, createdAt: updatedAt }, ...record.operations],
    updatedAt,
  }
}

export function normalizeSequenceIndex(position: number, length: number) {
  if (length <= 0) return 0
  return ((position % length) + length) % length
}

export function parseOriginPositionInput(text: string, sequenceLength: number): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const value = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(value) || value < 1 || value > sequenceLength) return null
  return value - 1
}

function shiftCircularCoordinate(position: number, origin: number, length: number) {
  return normalizeSequenceIndex(position - origin, length)
}

export function rotateCircularSequence(sequence: string, origin: number) {
  // Preserve mixed case; only strip non-DNA. normalizeDna would uppercase and
  // wipe letter-case markup when cloning products restore the parental origin.
  const cleaned = sanitizeDna(sequence)
  const length = cleaned.length
  if (length === 0) return cleaned
  const start = normalizeSequenceIndex(origin, length)
  if (start === 0) return cleaned
  return cleaned.slice(start) + cleaned.slice(0, start)
}

function adjustStrandColorRangesForRotation(ranges: StrandColorRange[], origin: number, length: number) {
  return ranges.map((range) => ({
    ...range,
    start: shiftCircularCoordinate(range.start, origin, length),
    end: shiftCircularCoordinate(range.end, origin, length),
  }))
}

function adjustPrimerBindingsForRotation(bindings: PrimerBindingLayout[], origin: number, length: number) {
  return bindings.map((binding) => ({
    ...binding,
    templateStart: shiftCircularCoordinate(binding.templateStart, origin, length),
    templateEnd: shiftCircularCoordinate(binding.templateEnd, origin, length),
    components: binding.components.map((component) => ({
      ...component,
      templateStart:
        component.templateStart === undefined
          ? undefined
          : shiftCircularCoordinate(component.templateStart, origin, length),
      templateEnd:
        component.templateEnd === undefined
          ? undefined
          : shiftCircularCoordinate(component.templateEnd, origin, length),
    })),
  }))
}

function splitWrapLocationForLinear<T extends { start: number; end: number }>(location: T, length: number): T[] {
  if (location.end > location.start || length === 0) return [location]
  if (location.start === location.end) return [location]
  return [
    { ...location, start: location.start, end: length, originWrapSplit: true },
    { ...location, start: 0, end: location.end, originWrapSplit: true },
  ]
}

function invalidateSnapGeneRotationCache(record: SequenceRecord): SequenceRecord['snapGeneEnzymes'] {
  if (!record.snapGeneEnzymes) return undefined
  return {
    ...record.snapGeneEnzymes,
    block2: undefined,
    block3: undefined,
  }
}

export function rotateCircularRecord(record: SequenceRecord, origin: number): SequenceRecord {
  if (record.topology !== 'circular' || record.sequence.length === 0) return record
  const length = record.sequence.length
  const normalizedOrigin = normalizeSequenceIndex(origin, length)
  if (normalizedOrigin === 0) return record
  const sequence = rotateCircularSequence(record.sequence, normalizedOrigin)
  const features = record.features.map((feature) => ({
    ...feature,
    locations: feature.locations.map((location) => ({
      ...location,
      start: shiftCircularCoordinate(location.start, normalizedOrigin, length),
      end: shiftCircularCoordinate(location.end, normalizedOrigin, length),
    })),
  }))
  const primers = record.primers.map((primer) => ({
    ...primer,
    bindings: primer.bindings?.length
      ? adjustPrimerBindingsForRotation(primer.bindings, normalizedOrigin, length)
      : primer.bindings,
  }))
  const strandColors = record.strandColors
    ? {
        ...record.strandColors,
        topStrand: adjustStrandColorRangesForRotation(record.strandColors.topStrand, normalizedOrigin, length),
        bottomStrand: adjustStrandColorRangesForRotation(record.strandColors.bottomStrand, normalizedOrigin, length),
      }
    : undefined
  return {
    ...record,
    sequence,
    features,
    primers,
    strandColors,
    snapGeneEnzymes: invalidateSnapGeneRotationCache(record),
  }
}

export function setCircularOrigin(record: SequenceRecord, origin: number): SequenceRecord {
  return rotateCircularRecord(record, origin)
}

export function linearizeCircularAtOrigin(record: SequenceRecord): SequenceRecord {
  if (record.topology !== 'circular') return record
  const length = record.sequence.length
  const features = record.features.map((feature) => ({
    ...feature,
    locations: feature.locations.flatMap((location) => splitWrapLocationForLinear(location, length)),
  }))
  return {
    ...record,
    topology: 'linear',
    features,
    dnaEnds: record.dnaEnds ?? {
      upstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
      downstream: { modification: 'fivePrimePhosphorylated', stickiness: 0 },
    },
    dnaEndsProvenance: undefined,
  }
}

export function circularizeLinearRecord(record: SequenceRecord): SequenceRecord {
  if (record.topology !== 'linear') return record
  return { ...record, topology: 'circular', dnaEndsProvenance: undefined }
}
