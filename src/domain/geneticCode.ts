import { complementDnaBase } from './sequence'
import type { FeatureReadingFrame, FeatureSegment, FeatureTranslationOptions, SequenceFeature, Strand } from './types'

export type { FeatureReadingFrame, FeatureSegmentNumbering, FeatureTranslationOptions } from './types'

/**
 * NCBI genetic-code translation tables.
 *
 * Each table is described by a 64-character amino-acid string in NCBI's
 * canonical codon order: base1 cycles slowest through T,C,A,G; base2 next;
 * base3 fastest. Building the codon->amino-acid map from this string keeps the
 * data compact and matches the reference tables exactly.
 */
const BASES = ['T', 'C', 'A', 'G'] as const

const CODON_ORDER: string[] = (() => {
  const codons: string[] = []
  for (const base1 of BASES) {
    for (const base2 of BASES) {
      for (const base3 of BASES) {
        codons.push(`${base1}${base2}${base3}`)
      }
    }
  }
  return codons
})()

const AMINO_ACID_STRINGS: Record<string, string> = {
  Standard: 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
  'Vertebrate Mitochondrial': 'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSS**VVVVAAAADDEEGGGG',
  'Yeast Mitochondrial': 'FFLLSSSSYY**CCWWTTTTPPPPHHQQRRRRIIMMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
  'Mold, Protozoan, Coelenterate Mitochondrial & Mycoplasma/Spiroplasma':
    'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
  'Invertebrate Mitochondrial': 'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSSSSVVVVAAAADDEEGGGG',
  'Ciliate, Dasycladacean, Hexamita Nuclear':
    'FFLLSSSSYYQQCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
  'Echinoderm, Flatworm Mitochondrial': 'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNNKSSSSVVVVAAAADDEEGGGG',
  'Euplotid Nuclear': 'FFLLSSSSYY**CCCWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
  'Bacterial, Archaeal and Plant Plastid':
    'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
  'Alternative Yeast Nuclear': 'FFLLSSSSYY**CC*WLLLSPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
  'Ascidian Mitochondrial': 'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSSGGVVVVAAAADDEEGGGG',
  'Alternative Flatworm Mitochondrial': 'FFLLSSSSYYY*CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNNKSSSSVVVVAAAADDEEGGGG',
  'Blepharisma Nuclear': 'FFLLSSSSYY*QCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
  'Chlorophycean Mitochondrial': 'FFLLSSSSYY*LCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
  'Trematode Mitochondrial': 'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNNKSSSSVVVVAAAADDEEGGGG',
  'Scenedesmus Obliquus Mitochondrial': 'FFLLSS*SYY*LCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
  'Thraustochytrium Mitochondrial': 'FF*LSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
  'Pterobranchia Mitochondrial': 'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSSKVVVVAAAADDEEGGGG',
  'Candidate Division SR1 and Gracilibacteria':
    'FFLLSSSSYY**CCGWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG',
}

/** Suppressor codes read the named stop codon as an arbitrary amino acid (Xaa). */
const SUPPRESSOR_OVERRIDES: Record<string, string> = {
  'Amber (UAG -> Xaa)': 'TAG',
  'Ochre (UAA -> Xaa)': 'TAA',
  'Opal (UGA -> Xaa)': 'TGA',
}

export const GENETIC_CODE_NAMES = [
  'Standard',
  'Vertebrate Mitochondrial',
  'Yeast Mitochondrial',
  'Mold, Protozoan, Coelenterate Mitochondrial & Mycoplasma/Spiroplasma',
  'Invertebrate Mitochondrial',
  'Ciliate, Dasycladacean, Hexamita Nuclear',
  'Echinoderm, Flatworm Mitochondrial',
  'Euplotid Nuclear',
  'Bacterial, Archaeal and Plant Plastid',
  'Alternative Yeast Nuclear',
  'Ascidian Mitochondrial',
  'Alternative Flatworm Mitochondrial',
  'Blepharisma Nuclear',
  'Chlorophycean Mitochondrial',
  'Trematode Mitochondrial',
  'Scenedesmus Obliquus Mitochondrial',
  'Thraustochytrium Mitochondrial',
  'Pterobranchia Mitochondrial',
  'Candidate Division SR1 and Gracilibacteria',
  'Amber (UAG -> Xaa)',
  'Ochre (UAA -> Xaa)',
  'Opal (UGA -> Xaa)',
] as const

export type GeneticCodeOption = (typeof GENETIC_CODE_NAMES)[number]

const codonMapCache = new Map<string, Record<string, string>>()

export function codonMapForGeneticCode(name: string): Record<string, string> {
  const cached = codonMapCache.get(name)
  if (cached) return cached

  const suppressorCodon = SUPPRESSOR_OVERRIDES[name]
  const aminoAcids = suppressorCodon ? AMINO_ACID_STRINGS.Standard : AMINO_ACID_STRINGS[name] ?? AMINO_ACID_STRINGS.Standard

  const map: Record<string, string> = {}
  CODON_ORDER.forEach((codon, index) => {
    map[codon] = aminoAcids[index] ?? 'X'
  })
  if (suppressorCodon) map[suppressorCodon] = 'X'

  codonMapCache.set(name, map)
  return map
}

export function translateCodon(codon: string, map: Record<string, string>): string {
  return map[codon.toUpperCase()] ?? 'X'
}

/** Signed SnapGene-style frames: +1/+2/+3 read the forward strand, −1/−2/−3 the reverse. */
export function transcriptionStrandFromReadingFrame(
  readingFrame: FeatureReadingFrame,
  fallback: Strand = 'forward',
): Strand {
  if (readingFrame < 0) return 'reverse'
  if (readingFrame > 0) return 'forward'
  return fallback
}

function translationStrand(locations: FeatureSegment[], options: FeatureTranslationOptions): Strand {
  return transcriptionStrandFromReadingFrame(options.readingFrame, locations[0]?.strand ?? 'forward')
}

export function defaultFeatureTranslationOptions(segmentCount: number): FeatureTranslationOptions {
  return {
    geneticCode: 'Standard',
    firstCodonAsMet: false,
    readingFrame: 1,
    consecutiveNumbering: true,
    segmentNumbering: Array.from({ length: Math.max(1, segmentCount) }, (_, index) => ({
      startAt: index === 0 ? 1 : 1,
      skip: false,
    })),
  }
}

export type FeatureTranslationCell = {
  aa: string
  number: number
  /** Template base positions (0-based) covered by this codon, in reading order. */
  positions: number[]
  /** Pixel span in merged alignment layout (trace annotation translations with indels). */
  layoutSpan?: { leftPx: number; widthPx: number }
}

/**
 * One visible part of a translation cell on a genomic sequence row.
 *
 * A codon remains one {@link FeatureTranslationCell} even when its bases span
 * disjoint annotated segments (or the origin of a circular sequence).  The
 * sequence pane uses these fragments strictly for placement, never as a
 * second biological translation value.
 */
export type TranslationCellDisplayFragment = {
  /** Consecutive genomic template positions covered by this visible glyph. */
  positions: number[]
}

/**
 * Project a canonical codon cell into its consecutive visible genomic runs.
 * The input cell is deliberately not copied or split: callers must retain it
 * for selection and clipboard semantics so a multipart codon remains one AA.
 */
export function translationCellDisplayFragments(
  cell: Pick<FeatureTranslationCell, 'positions'>,
  rowStart = Number.NEGATIVE_INFINITY,
  rowEnd = Number.POSITIVE_INFINITY,
): TranslationCellDisplayFragment[] {
  const positions = [...new Set(cell.positions)]
    .filter((position) => position >= rowStart && position < rowEnd)
    .toSorted((a, b) => a - b)
  if (!positions.length) return []

  const fragments: TranslationCellDisplayFragment[] = []
  let fragment = [positions[0]!]
  for (let index = 1; index < positions.length; index += 1) {
    const position = positions[index]!
    if (position === fragment[fragment.length - 1]! + 1) {
      fragment.push(position)
      continue
    }
    fragments.push({ positions: fragment })
    fragment = [position]
  }
  fragments.push({ positions: fragment })
  return fragments
}

export type AminoAcidCodeFormat = 'one-letter' | 'three-letter'

const ONE_LETTER_TO_THREE: Record<string, string> = {
  A: 'Ala',
  R: 'Arg',
  N: 'Asn',
  D: 'Asp',
  C: 'Cys',
  Q: 'Gln',
  E: 'Glu',
  G: 'Gly',
  H: 'His',
  I: 'Ile',
  L: 'Leu',
  K: 'Lys',
  F: 'Phe',
  P: 'Pro',
  S: 'Ser',
  T: 'Thr',
  W: 'Trp',
  Y: 'Tyr',
  V: 'Val',
  M: 'Met',
  '*': 'Ter',
  X: 'Xaa',
}

export function formatAminoAcidCode(aa: string, format: AminoAcidCodeFormat): string {
  if (format === 'one-letter') return aa
  if (aa === '*') return '*'
  const three = ONE_LETTER_TO_THREE[aa.toUpperCase()]
  return three ?? aa
}

/** Read the feature's coding bases in transcription order across (non-skipped) segments. */
function orderedReadingBases(
  locations: FeatureSegment[],
  sequence: string,
  options: FeatureTranslationOptions,
): Array<{ position: number; base: string }> {
  const strand = translationStrand(locations, options)
  const indexedSegments = locations.map((location, index) => ({ location, index }))
  const ordered =
    strand === 'reverse'
      ? [...indexedSegments].sort((a, b) => b.location.start - a.location.start)
      : [...indexedSegments].sort((a, b) => a.location.start - b.location.start)

  const bases: Array<{ position: number; base: string }> = []
  for (const { location, index } of ordered) {
    if (options.segmentNumbering[index]?.skip) continue
    if (strand === 'reverse') {
      for (let position = location.end - 1; position >= location.start; position -= 1) {
        const raw = sequence[position]?.toUpperCase() ?? 'N'
        bases.push({ position, base: complementDnaBase(raw).toUpperCase() })
      }
    } else {
      for (let position = location.start; position < location.end; position += 1) {
        bases.push({ position, base: sequence[position]?.toUpperCase() ?? 'N' })
      }
    }
  }
  return bases
}

type SequenceTopology = 'linear' | 'circular'

export type FeatureTranslationComputeOptions = {
  topology?: SequenceTopology
  /** Do not read translation through this genomic position (downstream in-frame CDS start). */
  stopTranslationBefore?: number | null
}

/** SnapGene-style: only extend past the annotation when ≥ 2 complete AA are already present. */
export const MIN_ANNOTATED_AA_TO_EXTEND_TRANSLATION = 2

function applyReadingFrame(
  reading: Array<{ position: number; base: string }>,
  options: FeatureTranslationOptions,
): Array<{ position: number; base: string }> {
  // Strand comes from the sign of readingFrame; the magnitude selects codon offset 1/2/3.
  const frameOffset = Math.abs(options.readingFrame) - 1
  return frameOffset > 0 ? reading.slice(frameOffset) : reading
}

function aminoAcidForCodon(codon: string, codonIndex: number, options: FeatureTranslationOptions, map: Record<string, string>) {
  if (codonIndex === 0 && options.firstCodonAsMet) return 'M'
  return translateCodon(codon, map)
}

function lastCompleteCodonAminoAcid(
  reading: Array<{ position: number; base: string }>,
  options: FeatureTranslationOptions,
): string | null {
  const framed = applyReadingFrame(reading, options)
  if (framed.length < 3) return null
  const codonIndex = Math.floor(framed.length / 3) - 1
  const start = codonIndex * 3
  const codon = `${framed[start].base}${framed[start + 1].base}${framed[start + 2].base}`
  const map = codonMapForGeneticCode(options.geneticCode)
  return aminoAcidForCodon(codon, codonIndex, options, map)
}

function activeTranscriptionSegments(locations: FeatureSegment[], options: FeatureTranslationOptions) {
  const strand = translationStrand(locations, options)
  const indexedSegments = locations.map((location, index) => ({ location, index }))
  const ordered =
    strand === 'reverse'
      ? [...indexedSegments].sort((a, b) => b.location.start - a.location.start)
      : [...indexedSegments].sort((a, b) => a.location.start - b.location.start)
  return ordered.filter(({ index }) => !options.segmentNumbering[index]?.skip)
}

function normalizeContinuationPosition(position: number, sequenceLength: number, topology: SequenceTopology): number | null {
  if (sequenceLength <= 0) return null
  if (topology === 'circular') return ((position % sequenceLength) + sequenceLength) % sequenceLength
  if (position < 0 || position >= sequenceLength) return null
  return position
}

function nextContinuationPosition(
  locations: FeatureSegment[],
  sequenceLength: number,
  options: FeatureTranslationOptions,
  topology: SequenceTopology,
): number | null {
  const segments = activeTranscriptionSegments(locations, options)
  if (!segments.length) return null
  const strand = translationStrand(locations, options)
  const last = segments[segments.length - 1].location
  const raw = strand === 'reverse' ? last.start - 1 : last.end
  return normalizeContinuationPosition(raw, sequenceLength, topology)
}

function stepContinuationPosition(
  position: number,
  strand: FeatureSegment['strand'],
  sequenceLength: number,
  topology: SequenceTopology,
): number | null {
  const raw = strand === 'reverse' ? position - 1 : position + 1
  return normalizeContinuationPosition(raw, sequenceLength, topology)
}

function readTranscriptionBase(
  sequence: string,
  position: number,
  strand: FeatureSegment['strand'],
): { position: number; base: string } {
  const raw = sequence[position]?.toUpperCase() ?? 'N'
  if (strand === 'reverse') {
    return { position, base: complementDnaBase(raw).toUpperCase() }
  }
  return { position, base: raw }
}

/** Continue translating downstream in transcription order until a stop codon or sequence end. */
function extendReadingBasesUntilStop(
  reading: Array<{ position: number; base: string }>,
  locations: FeatureSegment[],
  sequence: string,
  options: FeatureTranslationOptions,
  topology: SequenceTopology,
  stopTranslationBefore: number | null = null,
) {
  if (!reading.length) return
  const sequenceLength = sequence.length
  if (!sequenceLength) return
  if (lastCompleteCodonAminoAcid(reading, options) === '*') return

  const strand = translationStrand(locations, options)
  let cursor = nextContinuationPosition(locations, sequenceLength, options, topology)
  let steps = 0
  const maxSteps = sequenceLength

  while (cursor !== null && steps < maxSteps) {
    if (stopTranslationBefore !== null) {
      if (strand === 'forward' && cursor >= stopTranslationBefore) break
      if (strand === 'reverse' && cursor <= stopTranslationBefore) break
    }

    reading.push(readTranscriptionBase(sequence, cursor, strand))
    steps += 1

    const framedLength = applyReadingFrame(reading, options).length
    if (framedLength >= 3 && framedLength % 3 === 0 && lastCompleteCodonAminoAcid(reading, options) === '*') {
      break
    }

    cursor = stepContinuationPosition(cursor, strand, sequenceLength, topology)
  }
}

function buildTranslationCells(
  reading: Array<{ position: number; base: string }>,
  options: FeatureTranslationOptions,
): FeatureTranslationCell[] {
  const framed = applyReadingFrame(reading, options)
  const map = codonMapForGeneticCode(options.geneticCode)
  const startNumber = options.segmentNumbering[0]?.startAt ?? 1
  const cells: FeatureTranslationCell[] = []

  for (let codonIndex = 0; codonIndex * 3 + 2 < framed.length; codonIndex += 1) {
    const first = framed[codonIndex * 3]
    const second = framed[codonIndex * 3 + 1]
    const third = framed[codonIndex * 3 + 2]
    const codon = `${first.base}${second.base}${third.base}`
    cells.push({
      aa: aminoAcidForCodon(codon, codonIndex, options, map),
      number: startNumber + codonIndex,
      positions: [first.position, second.position, third.position],
    })
  }

  return cells
}

export function computeFeatureTranslationCells(
  feature: Pick<SequenceFeature, 'locations'>,
  sequence: string,
  options: FeatureTranslationOptions,
  computeOptions: FeatureTranslationComputeOptions = {},
): FeatureTranslationCell[] {
  if (!feature.locations.length) return []

  const topology = computeOptions.topology ?? 'linear'
  const reading = orderedReadingBases(feature.locations, sequence, options)
  // Match SnapGene: do not extend short CDS fragments (< 2 annotated amino acids).
  if (Math.floor(applyReadingFrame(reading, options).length / 3) >= MIN_ANNOTATED_AA_TO_EXTEND_TRANSLATION) {
    extendReadingBasesUntilStop(
      reading,
      feature.locations,
      sequence,
      options,
      topology,
      computeOptions.stopTranslationBefore ?? null,
    )
  }
  return buildTranslationCells(reading, options)
}

/** Complete codons whose template bases are contained by the annotated feature body. */
export function computeAnnotatedFeatureTranslationCells(
  feature: Pick<SequenceFeature, 'locations'>,
  sequence: string,
  options: FeatureTranslationOptions,
): FeatureTranslationCell[] {
  if (!feature.locations.length) return []
  return buildTranslationCells(orderedReadingBases(feature.locations, sequence, options), options)
}

/** Complete codons available from the annotated feature span alone (no stop extension). */
export function annotatedFeatureCompleteCodonCount(
  feature: Pick<SequenceFeature, 'locations'>,
  sequence: string,
  options: FeatureTranslationOptions,
): number {
  if (!feature.locations.length || !sequence.length) return 0
  const reading = orderedReadingBases(feature.locations, sequence, options)
  return Math.floor(applyReadingFrame(reading, options).length / 3)
}

export function featureTranslationFromCells(cells: FeatureTranslationCell[]): string {
  return cells.map((cell) => cell.aa).join('')
}

function isPositionInSelectionRange(
  position: number,
  range: { start: number; end: number },
): boolean {
  if (range.start <= range.end) return position >= range.start && position < range.end
  return position >= range.start || position < range.end
}

/** Inclusive-exclusive genomic span covering a codon's template bases. */
export function translationCellGenomicRange(cell: FeatureTranslationCell): { start: number; end: number } | null {
  if (!cell.positions.length) return null
  return {
    start: Math.min(...cell.positions),
    end: Math.max(...cell.positions) + 1,
  }
}

/** True when every listed template position lies inside the DNA selection. */
export function areTranslationPositionsInRange(
  positions: number[],
  range: { start: number; end: number } | null,
): boolean {
  if (!range || !positions.length) return false
  return positions.every((position) => isPositionInSelectionRange(position, range))
}

/** True when every template base of the codon lies inside the DNA selection. */
export function isTranslationCellFullyInRange(
  cell: FeatureTranslationCell,
  range: { start: number; end: number } | null,
): boolean {
  return areTranslationPositionsInRange(cell.positions, range)
}

/**
 * True when a codon's bases are split across disjoint runs of template
 * positions, e.g. across a multipart CDS segment boundary or the origin of a
 * circular sequence.
 */
export function isTranslationCellMultipart(
  cell: Pick<FeatureTranslationCell, 'positions'>,
): boolean {
  return translationCellDisplayFragments(cell).length > 1
}

/**
 * True when the DNA selection covers the residue.
 *
 * A codon whose bases span a segment boundary cannot be covered by a single
 * contiguous range, so it counts as selected when any of its bases is inside
 * the range. The residue still stands for exactly one amino acid.
 */
export function isTranslationCellSelectedInRange(
  cell: FeatureTranslationCell,
  range: { start: number; end: number } | null,
): boolean {
  if (!range || !cell.positions.length) return false
  if (areTranslationPositionsInRange(cell.positions, range)) return true
  if (!isTranslationCellMultipart(cell)) return false
  return cell.positions.some((position) => isPositionInSelectionRange(position, range))
}

export function translationCellsFullyInRange(
  cells: FeatureTranslationCell[],
  range: { start: number; end: number } | null,
): FeatureTranslationCell[] {
  return cells.filter((cell) => isTranslationCellFullyInRange(cell, range))
}

/** Residues the DNA selection covers, including a partially covered multipart codon. */
export function translationCellsSelectedInRange(
  cells: FeatureTranslationCell[],
  range: { start: number; end: number } | null,
): FeatureTranslationCell[] {
  return cells.filter((cell) => isTranslationCellSelectedInRange(cell, range))
}

/**
 * Copy text for a translation context action. Any complete translated stretch
 * selected in the DNA pane — including a single AA — is copied by itself.
 */
export function translationCopyTextFromCells(
  cells: FeatureTranslationCell[],
  selectedRange: { start: number; end: number } | null,
): string {
  const selected = translationCellsSelectedInRange(cells, selectedRange)
  return featureTranslationFromCells(selected.length ? selected : cells)
}

/**
 * Copy text for a translation context action whose selection may span several
 * translated features merged into one continuous reading frame.
 *
 * In-frame CDS features without a stop codon are rendered as one seamless
 * translation, and the user can drag across that junction. The visible
 * stretch then belongs to no single feature, so the copy must be resolved
 * against the merged group cells rather than one feature's own cells.
 * Otherwise only the part contributed by the feature under the pointer would
 * be copied.
 */
export function translationCopyTextFromMergedCells(
  mergedCells: FeatureTranslationCell[],
  selectedRange: { start: number; end: number } | null,
): string {
  if (!mergedCells.length) return ''
  const selected = translationCellsSelectedInRange(mergedCells, selectedRange)
  // Fall back to the whole merged stretch when the selection does not fully
  // cover any residue, matching the single-feature behavior.
  return featureTranslationFromCells(selected.length ? selected : mergedCells)
}

/**
 * Template positions a click on one drawn glyph should select.
 *
 * A codon whose bases are split across disjoint runs (a multipart codon
 * spanning a segment boundary) is drawn as one glyph per run. Clicking such a
 * glyph must select only the bases under it, so the selection never swallows
 * the untranslated gap between the segments.
 *
 * A codon drawn as a single run keeps selecting the whole codon, even when
 * the drawn glyph is clipped by a row edge.
 */
export function translationSelectionPositionsForFragment(
  cell: Pick<FeatureTranslationCell, 'positions'>,
  fragmentPositions: number[],
): number[] {
  if (!fragmentPositions.length) return cell.positions
  if (isTranslationCellMultipart(cell)) return fragmentPositions
  return cell.positions
}

/**
 * Range covering the template bases under one rendered translation glyph.
 *
 * A codon that spans a segment boundary is rendered as one glyph per segment.
 * Pointing at such a glyph must select only the bases under it, so a selection
 * never swallows the untranslated gap between the segments.
 */
export function rangeCoveringTranslationPositions(
  positions: number[],
  options: { topology?: SequenceTopology; sequenceLength?: number } = {},
): { start: number; end: number } | null {
  const unique = [...new Set(positions)]
  if (!unique.length) return null
  return rangeCoveringPositionSet(unique, options)
}

export function rangeCoveringTranslationCells(
  cells: FeatureTranslationCell[],
  options: { topology?: SequenceTopology; sequenceLength?: number } = {},
): { start: number; end: number } | null {
  const positions = [...new Set(cells.flatMap((cell) => cell.positions))]
  if (!positions.length) return null
  return rangeCoveringPositionSet(positions, options)
}

function rangeCoveringPositionSet(
  positions: number[],
  options: { topology?: SequenceTopology; sequenceLength?: number } = {},
): { start: number; end: number } | null {
  if (options.topology === 'circular' && options.sequenceLength && positions.length) {
    const sequenceLength = options.sequenceLength
    const sorted = positions.toSorted((a, b) => a - b)
    if (sorted.length >= sequenceLength) return { start: 0, end: sequenceLength }
    let largestGap = -1
    let gapIndex = 0
    sorted.forEach((position, index) => {
      const next = sorted[(index + 1) % sorted.length]!
      const gap = (next - position - 1 + sequenceLength) % sequenceLength
      if (gap > largestGap) {
        largestGap = gap
        gapIndex = index
      }
    })
    const start = sorted[(gapIndex + 1) % sorted.length]!
    const end = (sorted[gapIndex]! + 1) % sequenceLength
    return { start, end }
  }

  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY
  for (const position of positions) {
    start = Math.min(start, position)
    end = Math.max(end, position + 1)
  }
  if (!Number.isFinite(start) || end <= start) return null
  return { start, end }
}

export function translationCellMatchesAnchor(
  cell: FeatureTranslationCell & { featureId?: string },
  anchor: { featureId: string; number: number; position0: number },
): boolean {
  const featureId = cell.featureId
  if (featureId !== undefined && featureId !== anchor.featureId) return false
  return cell.number === anchor.number && (cell.positions[0] ?? 0) === anchor.position0
}

/** Inclusive stretch of ordered translation cells between two residues (transcription order). */
export function translationCellStretch(
  orderedCells: Array<FeatureTranslationCell & { featureId?: string }>,
  from: FeatureTranslationCell & { featureId?: string },
  to: FeatureTranslationCell & { featureId?: string },
): Array<FeatureTranslationCell & { featureId?: string }> {
  const fromIndex = orderedCells.findIndex(
    (cell) =>
      cell.number === from.number &&
      (cell.positions[0] ?? 0) === (from.positions[0] ?? 0) &&
      (cell.featureId === undefined || from.featureId === undefined || cell.featureId === from.featureId),
  )
  const toIndex = orderedCells.findIndex(
    (cell) =>
      cell.number === to.number &&
      (cell.positions[0] ?? 0) === (to.positions[0] ?? 0) &&
      (cell.featureId === undefined || to.featureId === undefined || cell.featureId === to.featureId),
  )
  if (fromIndex < 0 || toIndex < 0) return [to]
  const start = Math.min(fromIndex, toIndex)
  const end = Math.max(fromIndex, toIndex)
  return orderedCells.slice(start, end + 1)
}

export type FeatureTranslationExtensionSpan = {
  start: number
  end: number
  strand: Strand
}

function featureOccupiedPositions(locations: FeatureSegment[], sequenceLength: number): Set<number> {
  const positions = new Set<number>()
  for (const location of locations) {
    const start = Math.max(0, location.start)
    const end = Math.min(sequenceLength, location.end)
    for (let position = start; position < end; position += 1) {
      positions.add(position)
    }
  }
  return positions
}

function contiguousPositionRuns(positions: number[]): Array<{ start: number; end: number }> {
  if (!positions.length) return []
  const sorted = [...positions].sort((a, b) => a - b)
  const runs: Array<{ start: number; end: number }> = []
  let runStart = sorted[0]
  let previous = sorted[0]
  for (let index = 1; index < sorted.length; index += 1) {
    const position = sorted[index]
    if (position === previous + 1) {
      previous = position
      continue
    }
    runs.push({ start: runStart, end: previous + 1 })
    runStart = position
    previous = position
  }
  runs.push({ start: runStart, end: previous + 1 })
  return runs
}

/** Genomic spans where translation continues past the annotated feature coordinates. */
export function featureTranslationExtensionSpans(
  feature: Pick<SequenceFeature, 'locations'>,
  cells: FeatureTranslationCell[],
  sequenceLength: number,
): FeatureTranslationExtensionSpan[] {
  if (!cells.length || !feature.locations.length || sequenceLength <= 0) return []

  const occupied = featureOccupiedPositions(feature.locations, sequenceLength)
  const extensionPositions = [...new Set(cells.flatMap((cell) => cell.positions))].filter(
    (position) => position >= 0 && position < sequenceLength && !occupied.has(position),
  )
  if (!extensionPositions.length) return []

  const strand = feature.locations[0]?.strand ?? 'forward'
  return contiguousPositionRuns(extensionPositions).map((run) => ({ ...run, strand }))
}

/** Full one-letter translation string for previews. */
export function translateFeature(
  feature: Pick<SequenceFeature, 'locations'>,
  sequence: string,
  options: FeatureTranslationOptions,
  computeOptions?: FeatureTranslationComputeOptions,
): string {
  return computeFeatureTranslationCells(feature, sequence, options, computeOptions)
    .map((cell) => cell.aa)
    .join('')
}

/** One-letter translation limited to complete codons inside the feature body. */
export function translateAnnotatedFeature(
  feature: Pick<SequenceFeature, 'locations'>,
  sequence: string,
  options: FeatureTranslationOptions,
): string {
  return computeAnnotatedFeatureTranslationCells(feature, sequence, options)
    .map((cell) => cell.aa)
    .join('')
}
