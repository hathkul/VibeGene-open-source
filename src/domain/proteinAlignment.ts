import { codonMapForGeneticCode, translateCodon } from './geneticCode'
import { normalizeDna, reverseComplement, sanitizeProtein } from './sequence'
import type {
  ProteinAlignmentColumn,
  ProteinAlignmentOrientation,
  ProteinComparisonLayoutSlot,
  ProteinComparisonSource,
  ProteinComparisonVariableRegion,
  ProteinGuidedAlignment,
  ProteinSimilarity,
} from './proteinAlignmentTypes'

const AMINO_ACIDS = 'ARNDCQEGHILKMFPSTWYV'
const BLOSUM62_ROWS = [
  '4 -1 -2 -2 0 -1 -1 0 -2 -1 -1 -1 -1 -2 -1 1 0 -3 -2 0',
  '-1 5 0 -2 -3 1 0 -2 0 -3 -2 2 -1 -3 -2 -1 -1 -3 -2 -3',
  '-2 0 6 1 -3 0 0 0 1 -3 -3 0 -2 -3 -2 1 0 -4 -2 -3',
  '-2 -2 1 6 -3 0 2 -1 -1 -3 -4 -1 -3 -3 -1 0 -1 -4 -3 -3',
  '0 -3 -3 -3 9 -3 -4 -3 -3 -1 -1 -3 -1 -2 -3 -1 -1 -2 -2 -1',
  '-1 1 0 0 -3 5 2 -2 0 -3 -2 1 0 -3 -1 0 -1 -2 -1 -2',
  '-1 0 0 2 -4 2 5 -2 0 -3 -3 1 -2 -3 -1 0 -1 -3 -2 -2',
  '0 -2 0 -1 -3 -2 -2 6 -2 -4 -4 -2 -3 -3 -2 0 -2 -2 -3 -3',
  '-2 0 1 -1 -3 0 0 -2 8 -3 -3 -1 -2 -1 -2 -1 -2 -2 2 -3',
  '-1 -3 -3 -3 -1 -3 -3 -4 -3 4 2 -3 1 0 -3 -2 -1 -3 -1 3',
  '-1 -2 -3 -4 -1 -2 -3 -4 -3 2 4 -2 2 0 -3 -2 -1 -2 -1 1',
  '-1 2 0 -1 -3 1 1 -2 -1 -3 -2 5 -1 -3 -1 0 -1 -3 -2 -2',
  '-1 -1 -2 -3 -1 0 -2 -3 -2 1 2 -1 5 0 -2 -1 -1 -1 -1 1',
  '-2 -3 -3 -3 -2 -3 -3 -3 -1 0 0 -3 0 6 -4 -2 -2 1 3 -1',
  '-1 -2 -2 -1 -3 -1 -1 -2 -2 -3 -3 -1 -2 -4 7 -1 -1 -4 -3 -2',
  '1 -1 1 0 -1 0 0 0 -1 -2 -2 0 -1 -2 -1 4 1 -3 -2 -2',
  '0 -1 0 -1 -1 -1 -1 -2 -2 -1 -1 -1 -1 -2 -1 1 5 -2 -2 0',
  '-3 -3 -4 -4 -2 -2 -3 -2 -2 -3 -2 -3 -1 1 -4 -3 -2 11 2 -3',
  '-2 -2 -2 -3 -2 -1 -2 -3 2 -1 -1 -2 -1 3 -3 -2 -2 2 7 -1',
  '0 -3 -3 -3 -1 -2 -2 -3 -3 3 1 -2 1 -1 -2 -2 0 -3 -1 4',
].map((row) => row.split(' ').map(Number))

const GAP_OPEN = 9
const GAP_EXTEND = 1
const CODON_GAP = 7
const FRAME_SHIFT_PENALTY = 9
const TWO_BASE_FRAME_SHIFT_PENALTY = 12
const VARIABLE_REGION_FRAME_SHIFT_SURCHARGE = 18
const VARIABLE_REGION_MISMATCH_FLOOR = -1
const COMPENSATING_FRAME_WINDOW_AA = 18
const COMPENSATING_FRAME_EXACT_RUN = 6
const COMPENSATING_FRAME_BASE_PENALTY = 8
const COMPENSATING_FRAME_EVIDENCE_DEFICIT_PENALTY = 5
const COMPENSATING_FRAME_MINIMUM_ADVANTAGE = 12
const COMPENSATING_FRAME_BLOCK_PADDING_AA = 2
const MAX_COMPENSATING_FRAME_RECHECKS = 4
const MAX_ALIGNMENT_CELLS = 12_000_000
const MAX_BANDED_ALIGNMENT_CELLS = 20_000_000
const PROTEIN_BAND_RADIUS = 256
const DNA_BAND_RADIUS = 384
const SEED_KMER_LENGTH = 3

type FrameShift = NonNullable<ProteinAlignmentColumn['frameShift']>

function disabledFrameShiftKey(
  orientation: Exclude<ProteinAlignmentOrientation, 'protein'>,
  start: number,
  end: number,
  shift: FrameShift,
) {
  return `${orientation}:${start}-${end}:${shift > 0 ? '+' : ''}${shift}`
}

function frameShiftPenalty(shift: FrameShift) {
  return Math.abs(shift) === 2 ? TWO_BASE_FRAME_SHIFT_PENALTY : FRAME_SHIFT_PENALTY
}

function referenceIndexInRanges(
  referenceIndex: number,
  ranges: readonly Pick<ProteinComparisonVariableRegion, 'start' | 'end'>[],
) {
  return ranges.some((range) => referenceIndex >= range.start && referenceIndex < range.end)
}

function referenceAwareSubstitutionScore(
  referenceResidue: string,
  sourceResidue: string,
  referenceIndex: number,
  variableRegions: readonly ProteinComparisonVariableRegion[],
) {
  const score = proteinSubstitutionScore(referenceResidue, sourceResidue)
  return referenceIndexInRanges(referenceIndex, variableRegions)
    ? Math.max(VARIABLE_REGION_MISMATCH_FLOOR, score)
    : score
}

function dnaFrameShiftPenalty(
  shift: FrameShift,
  referenceIndex: number,
  variableRegions: readonly ProteinComparisonVariableRegion[],
) {
  return frameShiftPenalty(shift) + (referenceIndexInRanges(referenceIndex, variableRegions)
    ? VARIABLE_REGION_FRAME_SHIFT_SURCHARGE
    : 0)
}

export function proteinSubstitutionScore(left: string, right: string): number {
  const a = left.toUpperCase()
  const b = right.toUpperCase()
  if (a === b) return a === '*' ? -4 : 5
  if (a === '*' || b === '*') return -6
  const ai = AMINO_ACIDS.indexOf(a)
  const bi = AMINO_ACIDS.indexOf(b)
  if (ai < 0 || bi < 0) return -1
  return BLOSUM62_ROWS[ai][bi]
}

function similarityFor(referenceResidue: string, sourceResidue: string): ProteinSimilarity {
  if (referenceResidue === sourceResidue) return 'identity'
  return proteinSubstitutionScore(referenceResidue, sourceResidue) > 0 ? 'similar' : 'mismatch'
}

type AlignmentGrid = {
  rowStarts: Int32Array
  rowEnds: Int32Array
  rowOffsets: Int32Array
  totalCells: number
}

function createAlignmentGrid(
  rowCount: number,
  maximumColumn: number,
  centerForRow?: (row: number) => number,
  radius = 0,
): AlignmentGrid {
  const rowStarts = new Int32Array(rowCount)
  const rowEnds = new Int32Array(rowCount)
  const rowOffsets = new Int32Array(rowCount)
  let totalCells = 0
  for (let row = 0; row < rowCount; row += 1) {
    const center = centerForRow?.(row)
    const start = center === undefined ? 0 : Math.max(0, Math.floor(center - radius))
    const end = center === undefined ? maximumColumn : Math.min(maximumColumn, Math.ceil(center + radius))
    rowStarts[row] = start
    rowEnds[row] = end
    rowOffsets[row] = totalCells
    totalCells += Math.max(0, end - start + 1)
  }
  if (totalCells > MAX_BANDED_ALIGNMENT_CELLS) {
    throw new Error('Seeded alignment band is too large; shorten one of the comparison sequences')
  }
  return { rowStarts, rowEnds, rowOffsets, totalCells }
}

function gridIndex(grid: AlignmentGrid, row: number, column: number) {
  if (row < 0 || row >= grid.rowStarts.length) return -1
  const start = grid.rowStarts[row]
  if (column < start || column > grid.rowEnds[row]) return -1
  return grid.rowOffsets[row] + column - start
}

function gridValue(values: Int32Array, grid: AlignmentGrid, row: number, column: number) {
  const index = gridIndex(grid, row, column)
  return index < 0 ? 0 : values[index]
}

function referenceSeedIndex(reference: string) {
  const index = new Map<string, number[]>()
  for (let position = 0; position <= reference.length - SEED_KMER_LENGTH; position += 1) {
    const kmer = reference.slice(position, position + SEED_KMER_LENGTH)
    const positions = index.get(kmer) ?? []
    if (positions.length < 24) positions.push(position)
    index.set(kmer, positions)
  }
  return index
}

function bestSeedOffset(
  reference: string,
  query: string,
  queryPosition: (index: number) => number,
  referenceScale: number,
): { offset: number; votes: number } | undefined {
  const seeds = referenceSeedIndex(reference)
  const votes = new Map<number, number>()
  let bestOffset: number | undefined
  let bestVotes = 0
  for (let index = 0; index <= query.length - SEED_KMER_LENGTH; index += 1) {
    const positions = seeds.get(query.slice(index, index + SEED_KMER_LENGTH))
    if (!positions) continue
    for (const referencePosition of positions) {
      const offset = queryPosition(index) - referenceScale * referencePosition
      const count = (votes.get(offset) ?? 0) + 1
      votes.set(offset, count)
      if (count > bestVotes) {
        bestVotes = count
        bestOffset = offset
      }
    }
  }
  return bestVotes >= 2 && bestOffset !== undefined ? { offset: bestOffset, votes: bestVotes } : undefined
}

function proteinAlignmentGrid(reference: string, query: string) {
  if (reference.length * query.length <= MAX_ALIGNMENT_CELLS) {
    return createAlignmentGrid(reference.length + 1, query.length)
  }
  const seed = bestSeedOffset(reference, query, (index) => index, 1)
  if (!seed) {
    throw new Error('Large protein comparison has no reliable exact seed for banded alignment')
  }
  return createAlignmentGrid(
    reference.length + 1,
    query.length,
    (row) => row + seed.offset,
    PROTEIN_BAND_RADIUS,
  )
}

function translatedFrame(dna: string, frame: number, codonMap: Record<string, string>) {
  let translated = ''
  for (let index = frame; index + 3 <= dna.length; index += 3) {
    translated += translateCodon(dna.slice(index, index + 3), codonMap)
  }
  return translated
}

function dnaAlignmentGrid(reference: string, dna: string, codonMap: Record<string, string>) {
  if (reference.length * dna.length <= MAX_ALIGNMENT_CELLS) {
    return createAlignmentGrid(reference.length + 1, dna.length)
  }
  let bestSeed: { offset: number; votes: number } | undefined
  for (let frame = 0; frame < 3; frame += 1) {
    const translated = translatedFrame(dna, frame, codonMap)
    const seed = bestSeedOffset(reference, translated, (index) => frame + index * 3, 3)
    if (seed && (!bestSeed || seed.votes > bestSeed.votes)) bestSeed = seed
  }
  if (!bestSeed) {
    throw new Error('Large DNA comparison has no reliable translated seed for banded alignment')
  }
  return createAlignmentGrid(
    reference.length + 1,
    dna.length,
    (row) => row * 3 + bestSeed.offset,
    DNA_BAND_RADIUS,
  )
}

type ProteinTraceState = 0 | 1 | 2 | 3

export function alignProteinToProtein(
  referenceInput: string,
  source: ProteinComparisonSource,
  variableRegions: readonly ProteinComparisonVariableRegion[] = [],
): ProteinGuidedAlignment | null {
  const reference = sanitizeProtein(referenceInput).toUpperCase()
  const query = sanitizeProtein(source.sequence).toUpperCase()
  if (!reference || !query) return null

  const grid = proteinAlignmentGrid(reference, query)
  const match = new Int32Array(grid.totalCells)
  const deleteState = new Int32Array(grid.totalCells)
  const insertState = new Int32Array(grid.totalCells)
  const matchTrace = new Uint8Array(grid.totalCells)
  const deleteTrace = new Uint8Array(grid.totalCells)
  const insertTrace = new Uint8Array(grid.totalCells)
  let bestScore = 0
  let bestI = 0
  let bestJ = 0
  let bestState: ProteinTraceState = 0

  for (let i = 1; i <= reference.length; i += 1) {
    const start = Math.max(1, grid.rowStarts[i])
    const end = grid.rowEnds[i]
    for (let j = start; j <= end; j += 1) {
      const index = gridIndex(grid, i, j)
      const score = referenceAwareSubstitutionScore(
        reference[i - 1],
        query[j - 1],
        i - 1,
        variableRegions,
      )
      const diagonalScores = [
        0,
        gridValue(match, grid, i - 1, j - 1),
        gridValue(deleteState, grid, i - 1, j - 1),
        gridValue(insertState, grid, i - 1, j - 1),
      ]
      let previousState: ProteinTraceState = 0
      for (let state = 1; state <= 3; state += 1) {
        if (diagonalScores[state] > diagonalScores[previousState]) previousState = state as ProteinTraceState
      }
      const nextMatch = diagonalScores[previousState] + score
      if (nextMatch > 0) {
        match[index] = nextMatch
        matchTrace[index] = previousState
      }

      const deleteCandidates = [
        0,
        gridValue(match, grid, i - 1, j) - GAP_OPEN,
        gridValue(deleteState, grid, i - 1, j) - GAP_EXTEND,
        gridValue(insertState, grid, i - 1, j) - GAP_OPEN,
      ]
      let deletePrevious: ProteinTraceState = 0
      for (let state = 1; state <= 3; state += 1) {
        if (deleteCandidates[state] > deleteCandidates[deletePrevious]) deletePrevious = state as ProteinTraceState
      }
      if (deleteCandidates[deletePrevious] > 0) {
        deleteState[index] = deleteCandidates[deletePrevious]
        deleteTrace[index] = deletePrevious
      }

      const insertCandidates = [
        0,
        gridValue(match, grid, i, j - 1) - GAP_OPEN,
        gridValue(deleteState, grid, i, j - 1) - GAP_OPEN,
        gridValue(insertState, grid, i, j - 1) - GAP_EXTEND,
      ]
      let insertPrevious: ProteinTraceState = 0
      for (let state = 1; state <= 3; state += 1) {
        if (insertCandidates[state] > insertCandidates[insertPrevious]) insertPrevious = state as ProteinTraceState
      }
      if (insertCandidates[insertPrevious] > 0) {
        insertState[index] = insertCandidates[insertPrevious]
        insertTrace[index] = insertPrevious
      }

      const scores = [0, match[index], deleteState[index], insertState[index]]
      for (let state = 1; state <= 3; state += 1) {
        if (scores[state] > bestScore) {
          bestScore = scores[state]
          bestI = i
          bestJ = j
          bestState = state as ProteinTraceState
        }
      }
    }
  }

  if (!bestScore) return null
  let i = bestI
  let j = bestJ
  let state = bestState
  const reversed: ProteinAlignmentColumn[] = []
  while (state !== 0 && i >= 0 && j >= 0) {
    const index = gridIndex(grid, i, j)
    if (index < 0) break
    if (state === 1) {
      const referenceResidue = reference[i - 1]
      const sourceResidue = query[j - 1]
      const score = referenceAwareSubstitutionScore(
        referenceResidue,
        sourceResidue,
        i - 1,
        variableRegions,
      )
      reversed.push({
        referenceIndex: i - 1,
        referenceBoundary: i - 1,
        referenceResidue,
        sourceIndex: j - 1,
        sourceResidue,
        event: 'residue',
        similarity: similarityFor(referenceResidue, sourceResidue),
        score,
      })
      state = matchTrace[index] as ProteinTraceState
      i -= 1
      j -= 1
    } else if (state === 2) {
      reversed.push({
        referenceIndex: i - 1,
        referenceBoundary: i - 1,
        referenceResidue: reference[i - 1],
        event: 'reference-gap',
        similarity: 'gap',
        score: -GAP_EXTEND,
      })
      state = deleteTrace[index] as ProteinTraceState
      i -= 1
    } else {
      reversed.push({
        referenceIndex: null,
        referenceBoundary: i,
        sourceIndex: j - 1,
        sourceResidue: query[j - 1],
        event: 'source-insertion',
        similarity: 'gap',
        score: -GAP_EXTEND,
      })
      state = insertTrace[index] as ProteinTraceState
      j -= 1
    }
  }
  return buildAlignmentSummary(source, 'protein', bestScore, undefined, reversed.reverse())
}

type DnaCandidate = {
  score: number
  orientation: Exclude<ProteinAlignmentOrientation, 'protein'>
  columns: ProteinAlignmentColumn[]
}

function bestExpandedCodonTranslation(bases: string, referenceResidue: string, codonMap: Record<string, string>) {
  let best = { residue: 'X', score: -Infinity }
  for (let first = 0; first < bases.length - 2; first += 1) {
    for (let second = first + 1; second < bases.length - 1; second += 1) {
      for (let third = second + 1; third < bases.length; third += 1) {
        const residue = translateCodon(bases[first] + bases[second] + bases[third], codonMap)
        const score = proteinSubstitutionScore(referenceResidue, residue)
        if (score > best.score) best = { residue, score }
      }
    }
  }
  return best
}

function mapOrientedRange(
  start: number,
  end: number,
  length: number,
  orientation: Exclude<ProteinAlignmentOrientation, 'protein'>,
) {
  return orientation === 'forward'
    ? { start, end }
    : { start: length - end, end: length - start }
}

function alignDnaOrientationRaw(
  reference: string,
  originalDna: string,
  orientation: Exclude<ProteinAlignmentOrientation, 'protein'>,
  disabledFrameShiftKeys: ReadonlySet<string>,
  geneticCode: string,
  variableRegions: readonly ProteinComparisonVariableRegion[],
  blockedFrameShiftRanges: readonly Pick<ProteinComparisonVariableRegion, 'start' | 'end'>[],
): DnaCandidate | null {
  const dna = orientation === 'forward' ? originalDna : reverseComplement(originalDna)
  const codonMap = codonMapForGeneticCode(geneticCode)
  const grid = dnaAlignmentGrid(reference, dna, codonMap)
  const scores = new Int32Array(grid.totalCells)
  const trace = new Uint8Array(grid.totalCells)
  let bestScore = 0
  let bestI = 0
  let bestJ = 0

  for (let i = 0; i <= reference.length; i += 1) {
    const start = grid.rowStarts[i]
    const end = grid.rowEnds[i]
    for (let j = start; j <= end; j += 1) {
      if (i === 0 && j === 0) continue
      const index = gridIndex(grid, i, j)
      let value = 0
      let direction = 0
      if (i > 0 && j >= 3) {
        const residue = translateCodon(dna.slice(j - 3, j), codonMap)
        const candidate = gridValue(scores, grid, i - 1, j - 3)
          + referenceAwareSubstitutionScore(reference[i - 1], residue, i - 1, variableRegions)
        if (candidate > value) { value = candidate; direction = 1 }
      }
      if (i > 0) {
        const candidate = gridValue(scores, grid, i - 1, j) - CODON_GAP
        if (candidate > value) { value = candidate; direction = 2 }
      }
      if (j >= 3) {
        const candidate = gridValue(scores, grid, i, j - 3) - CODON_GAP
        if (candidate > value) { value = candidate; direction = 3 }
      }
      if (i > 0 && j >= 2 && !referenceIndexInRanges(i - 1, blockedFrameShiftRanges)) {
        const orientedStart = j - 2
        const range = mapOrientedRange(orientedStart, j, originalDna.length, orientation)
        if (!disabledFrameShiftKeys.has(disabledFrameShiftKey(orientation, range.start, range.end, -1))) {
          const candidate = gridValue(scores, grid, i - 1, j - 2)
            - dnaFrameShiftPenalty(-1, i - 1, variableRegions)
          if (candidate > value) { value = candidate; direction = 4 }
        }
      }
      if (i > 0 && j >= 1 && !referenceIndexInRanges(i - 1, blockedFrameShiftRanges)) {
        const orientedStart = j - 1
        const range = mapOrientedRange(orientedStart, j, originalDna.length, orientation)
        if (!disabledFrameShiftKeys.has(disabledFrameShiftKey(orientation, range.start, range.end, -2))) {
          const candidate = gridValue(scores, grid, i - 1, j - 1)
            - dnaFrameShiftPenalty(-2, i - 1, variableRegions)
          if (candidate > value) { value = candidate; direction = 6 }
        }
      }
      if (i > 0 && j >= 4 && !referenceIndexInRanges(i - 1, blockedFrameShiftRanges)) {
        const orientedStart = j - 4
        const range = mapOrientedRange(orientedStart, j, originalDna.length, orientation)
        if (!disabledFrameShiftKeys.has(disabledFrameShiftKey(orientation, range.start, range.end, 1))) {
          const translated = bestExpandedCodonTranslation(dna.slice(j - 4, j), reference[i - 1], codonMap)
          const candidate = gridValue(scores, grid, i - 1, j - 4)
            - dnaFrameShiftPenalty(1, i - 1, variableRegions)
            + Math.max(0, translated.score)
          if (candidate > value) { value = candidate; direction = 5 }
        }
      }
      if (i > 0 && j >= 5 && !referenceIndexInRanges(i - 1, blockedFrameShiftRanges)) {
        const orientedStart = j - 5
        const range = mapOrientedRange(orientedStart, j, originalDna.length, orientation)
        if (!disabledFrameShiftKeys.has(disabledFrameShiftKey(orientation, range.start, range.end, 2))) {
          const translated = bestExpandedCodonTranslation(dna.slice(j - 5, j), reference[i - 1], codonMap)
          const candidate = gridValue(scores, grid, i - 1, j - 5)
            - dnaFrameShiftPenalty(2, i - 1, variableRegions)
            + Math.max(0, translated.score)
          if (candidate > value) { value = candidate; direction = 7 }
        }
      }
      if (value > 0) {
        scores[index] = value
        trace[index] = direction
        if (value > bestScore) { bestScore = value; bestI = i; bestJ = j }
      }
    }
  }

  if (!bestScore) return null
  let i = bestI
  let j = bestJ
  const reversed: ProteinAlignmentColumn[] = []
  while (i >= 0 && j >= 0) {
    const index = gridIndex(grid, i, j)
    if (index < 0) break
    const direction = trace[index]
    if (!direction) break
    if (direction === 1) {
      const orientedStart = j - 3
      const codon = dna.slice(orientedStart, j)
      const sourceResidue = translateCodon(codon, codonMap)
      const referenceResidue = reference[i - 1]
      const range = mapOrientedRange(orientedStart, j, originalDna.length, orientation)
      reversed.push({
        referenceIndex: i - 1,
        referenceBoundary: i - 1,
        referenceResidue,
        sourceResidue,
        nucleotideStart: range.start,
        nucleotideEnd: range.end,
        codon,
        frame: (orientation === 'forward' ? orientedStart % 3 + 1 : -(orientedStart % 3 + 1)) as ProteinAlignmentColumn['frame'],
        event: 'residue',
        similarity: similarityFor(referenceResidue, sourceResidue),
        score: referenceAwareSubstitutionScore(referenceResidue, sourceResidue, i - 1, variableRegions),
      })
      i -= 1; j -= 3
    } else if (direction === 2) {
      reversed.push({
        referenceIndex: i - 1,
        referenceBoundary: i - 1,
        referenceResidue: reference[i - 1],
        event: 'reference-gap',
        similarity: 'gap',
        score: -CODON_GAP,
      })
      i -= 1
    } else if (direction === 3) {
      const orientedStart = j - 3
      const codon = dna.slice(orientedStart, j)
      const range = mapOrientedRange(orientedStart, j, originalDna.length, orientation)
      reversed.push({
        referenceIndex: null,
        referenceBoundary: i,
        sourceResidue: translateCodon(codon, codonMap),
        nucleotideStart: range.start,
        nucleotideEnd: range.end,
        codon,
        frame: (orientation === 'forward' ? orientedStart % 3 + 1 : -(orientedStart % 3 + 1)) as ProteinAlignmentColumn['frame'],
        event: 'source-insertion',
        similarity: 'gap',
        score: -CODON_GAP,
      })
      j -= 3
    } else {
      const consumed = direction === 4 ? 2 : direction === 5 ? 4 : direction === 6 ? 1 : 5
      const frameShift = (consumed - 3) as FrameShift
      const orientedStart = j - consumed
      const codon = dna.slice(orientedStart, j)
      const range = mapOrientedRange(orientedStart, j, originalDna.length, orientation)
      const sourceResidue = consumed > 3
        ? bestExpandedCodonTranslation(codon, reference[i - 1], codonMap).residue
        : 'X'
      reversed.push({
        referenceIndex: i - 1,
        referenceBoundary: i - 1,
        referenceResidue: reference[i - 1],
        sourceResidue,
        nucleotideStart: range.start,
        nucleotideEnd: range.end,
        codon,
        frame: (orientation === 'forward' ? orientedStart % 3 + 1 : -(orientedStart % 3 + 1)) as ProteinAlignmentColumn['frame'],
        frameShift,
        event: 'frameshift',
        similarity: 'frameshift',
        score: -dnaFrameShiftPenalty(frameShift, i - 1, variableRegions),
      })
      i -= 1; j -= consumed
    }
  }
  return { score: bestScore, orientation, columns: reversed.reverse() }
}

type CompensatingFrameExcursion = {
  start: number
  end: number
  positiveScore: number
  longestExactRun: number
}

function normalizedFramePhase(value: number) {
  return ((value % 3) + 3) % 3
}

function firstShortCompensatingFrameExcursion(
  columns: readonly ProteinAlignmentColumn[],
): CompensatingFrameExcursion | null {
  let phase = 0
  let openColumnIndex: number | null = null
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const frameShift = columns[columnIndex].frameShift
    if (frameShift === undefined) continue
    const previousPhase = phase
    phase = normalizedFramePhase(phase + frameShift)
    if (previousPhase === 0 && phase !== 0) {
      openColumnIndex = columnIndex
      continue
    }
    if (previousPhase !== 0 && phase === 0 && openColumnIndex !== null) {
      const excursion = columns.slice(openColumnIndex, columnIndex + 1)
      const referenceIndices = excursion.flatMap((column) => column.referenceIndex === null ? [] : [column.referenceIndex])
      if (!referenceIndices.length) {
        openColumnIndex = null
        continue
      }
      const start = Math.min(...referenceIndices)
      const end = Math.max(...referenceIndices) + 1
      if (end - start <= COMPENSATING_FRAME_WINDOW_AA) {
        let exactRun = 0
        let longestExactRun = 0
        let positiveScore = 0
        for (const column of columns.slice(openColumnIndex + 1, columnIndex)) {
          if (column.similarity === 'identity') {
            exactRun += 1
            longestExactRun = Math.max(longestExactRun, exactRun)
          } else {
            exactRun = 0
          }
          positiveScore += Math.max(0, column.score)
        }
        return { start, end, positiveScore, longestExactRun }
      }
      openColumnIndex = null
    }
  }
  return null
}

function compensatingFramePenalty(excursion: CompensatingFrameExcursion) {
  return COMPENSATING_FRAME_BASE_PENALTY
    + excursion.positiveScore
    + Math.max(0, COMPENSATING_FRAME_EXACT_RUN - excursion.longestExactRun)
      * COMPENSATING_FRAME_EVIDENCE_DEFICIT_PENALTY
}

function alignDnaOrientation(
  reference: string,
  originalDna: string,
  orientation: Exclude<ProteinAlignmentOrientation, 'protein'>,
  disabledFrameShiftKeys: ReadonlySet<string>,
  geneticCode: string,
  variableRegions: readonly ProteinComparisonVariableRegion[],
): DnaCandidate | null {
  const blockedFrameShiftRanges: Array<Pick<ProteinComparisonVariableRegion, 'start' | 'end'>> = []
  let candidate = alignDnaOrientationRaw(
    reference,
    originalDna,
    orientation,
    disabledFrameShiftKeys,
    geneticCode,
    variableRegions,
    blockedFrameShiftRanges,
  )
  for (let attempt = 0; candidate && attempt < MAX_COMPENSATING_FRAME_RECHECKS; attempt += 1) {
    const excursion = firstShortCompensatingFrameExcursion(candidate.columns)
    if (!excursion) break
    const blockedRange = {
      start: Math.max(0, excursion.start - COMPENSATING_FRAME_BLOCK_PADDING_AA),
      end: Math.min(reference.length, excursion.end + COMPENSATING_FRAME_BLOCK_PADDING_AA),
    }
    const alternative = alignDnaOrientationRaw(
      reference,
      originalDna,
      orientation,
      disabledFrameShiftKeys,
      geneticCode,
      variableRegions,
      [...blockedFrameShiftRanges, blockedRange],
    )
    if (!alternative) break
    const adjustedCandidateScore = candidate.score - compensatingFramePenalty(excursion)
    if (adjustedCandidateScore >= alternative.score + COMPENSATING_FRAME_MINIMUM_ADVANTAGE) break
    blockedFrameShiftRanges.push(blockedRange)
    candidate = alternative
  }
  return candidate
}

export function alignDnaToProtein(
  referenceInput: string,
  source: ProteinComparisonSource,
  geneticCode = 'Standard',
  variableRegions: readonly ProteinComparisonVariableRegion[] = [],
): ProteinGuidedAlignment | null {
  const reference = sanitizeProtein(referenceInput).toUpperCase()
  const dna = normalizeDna(source.sequence)
  if (!reference || !dna) return null
  const disabledFrameShiftKeys = new Set(source.disabledFrameShiftKeys ?? [])
  const errors: Error[] = []
  const candidates = (['forward', 'reverse'] as const).map((orientation) => {
    try {
      return alignDnaOrientation(reference, dna, orientation, disabledFrameShiftKeys, geneticCode, variableRegions)
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
      return null
    }
  }).filter((candidate): candidate is DnaCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score)
  const best = candidates[0]
  if (!best) {
    if (errors.length) throw errors[0]
    return null
  }
  return buildAlignmentSummary(source, best.orientation, best.score, candidates[1]?.score, best.columns)
}

function buildAlignmentSummary(
  source: ProteinComparisonSource,
  orientation: ProteinAlignmentOrientation,
  score: number,
  runnerUpScore: number | undefined,
  columns: ProteinAlignmentColumn[],
): ProteinGuidedAlignment {
  const referenceIndices = columns.flatMap((column) => column.referenceIndex === null ? [] : [column.referenceIndex])
  const sourceCoordinates = columns.flatMap((column) => {
    if (column.sourceIndex !== undefined) return [column.sourceIndex]
    if (column.nucleotideStart !== undefined && column.nucleotideEnd !== undefined) {
      return [column.nucleotideStart, Math.max(column.nucleotideStart, column.nucleotideEnd - 1)]
    }
    return []
  })
  return {
    sourceId: source.id,
    sourceKind: source.kind,
    orientation,
    referenceStart: referenceIndices.length ? Math.min(...referenceIndices) : 0,
    referenceEnd: referenceIndices.length ? Math.max(...referenceIndices) + 1 : 0,
    sourceStart: sourceCoordinates.length ? Math.min(...sourceCoordinates) : 0,
    sourceEnd: sourceCoordinates.length ? Math.max(...sourceCoordinates) + 1 : 0,
    score,
    runnerUpScore,
    identityCount: columns.filter((column) => column.similarity === 'identity').length,
    similarCount: columns.filter((column) => column.similarity === 'similar').length,
    mismatchCount: columns.filter((column) => column.similarity === 'mismatch').length,
    gapCount: columns.filter((column) => column.similarity === 'gap').length,
    frameShiftCount: columns.filter((column) => column.event === 'frameshift').length,
    columns,
  }
}

export function alignProteinComparisonSource(
  reference: string,
  source: ProteinComparisonSource,
  geneticCode = 'Standard',
  variableRegions: readonly ProteinComparisonVariableRegion[] = [],
): ProteinGuidedAlignment | null {
  return source.kind === 'protein'
    ? alignProteinToProtein(reference, source, variableRegions)
    : alignDnaToProtein(reference, source, geneticCode, variableRegions)
}

/** Reconstruct the aligned source protein sequence (non-gap residues) from a guided alignment. */
export function proteinSequenceFromGuidedAlignment(alignment: ProteinGuidedAlignment): string {
  const residues: string[] = []
  for (const column of alignment.columns) {
    const residue = column.sourceResidue
    if (!residue || residue === '–' || residue === '-' || residue === '.' || residue === '·') continue
    residues.push(residue)
  }
  return residues.join('')
}

export function proteinFrameShiftKey(
  alignment: ProteinGuidedAlignment,
  column: ProteinAlignmentColumn,
) {
  if (
    alignment.sourceKind === 'protein' ||
    alignment.orientation === 'protein' ||
    column.event !== 'frameshift' ||
    column.frameShift === undefined ||
    column.nucleotideStart === undefined ||
    column.nucleotideEnd === undefined
  ) {
    return null
  }
  return disabledFrameShiftKey(
    alignment.orientation,
    column.nucleotideStart,
    column.nucleotideEnd,
    column.frameShift,
  )
}

export function buildProteinComparisonLayout(
  referenceLength: number,
  alignments: ProteinGuidedAlignment[],
): ProteinComparisonLayoutSlot[] {
  const maximumInsertions = new Map<number, number>()
  alignments.forEach((alignment) => {
    const counts = new Map<number, number>()
    alignment.columns.forEach((column) => {
      if (column.referenceIndex !== null) return
      counts.set(column.referenceBoundary, (counts.get(column.referenceBoundary) ?? 0) + 1)
    })
    counts.forEach((count, boundary) => {
      maximumInsertions.set(boundary, Math.max(maximumInsertions.get(boundary) ?? 0, count))
    })
  })
  const slots: ProteinComparisonLayoutSlot[] = []
  for (let boundary = 0; boundary <= referenceLength; boundary += 1) {
    for (let insertionIndex = 0; insertionIndex < (maximumInsertions.get(boundary) ?? 0); insertionIndex += 1) {
      slots.push({ kind: 'insertion', referenceBoundary: boundary, insertionIndex })
    }
    if (boundary < referenceLength) slots.push({ kind: 'reference', referenceIndex: boundary })
  }
  return slots
}
