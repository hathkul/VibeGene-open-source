export type ProteinComparisonSourceKind = 'protein' | 'dna'

export type ProteinComparisonSource = {
  id: string
  name: string
  fileName?: string
  kind: ProteinComparisonSourceKind
  sequence: string
  enabled: boolean
  disabledFrameShiftKeys?: string[]
}

/** Half-open residue range on the fixed reference protein. */
export type ProteinComparisonVariableRegion = {
  id: string
  start: number
  end: number
}

export type ProteinAlignmentOrientation = 'protein' | 'forward' | 'reverse'

export type ProteinAlignmentEvent =
  | 'residue'
  | 'reference-gap'
  | 'source-insertion'
  | 'frameshift'

export type ProteinSimilarity = 'identity' | 'similar' | 'mismatch' | 'gap' | 'frameshift'

export type ProteinAlignmentColumn = {
  /** Reference protein coordinate, or null for an insertion between anchor residues. */
  referenceIndex: number | null
  /** Boundary before which an insertion is rendered (0..referenceLength). */
  referenceBoundary: number
  referenceResidue?: string
  sourceIndex?: number
  sourceResidue?: string
  nucleotideStart?: number
  nucleotideEnd?: number
  codon?: string
  frame?: 1 | 2 | 3 | -1 | -2 | -3
  frameShift?: -2 | -1 | 1 | 2
  event: ProteinAlignmentEvent
  similarity: ProteinSimilarity
  score: number
}

export type ProteinGuidedAlignment = {
  sourceId: string
  sourceKind: ProteinComparisonSourceKind
  orientation: ProteinAlignmentOrientation
  referenceStart: number
  referenceEnd: number
  sourceStart: number
  sourceEnd: number
  score: number
  runnerUpScore?: number
  identityCount: number
  similarCount: number
  mismatchCount: number
  gapCount: number
  frameShiftCount: number
  columns: ProteinAlignmentColumn[]
}

/** Persisted, versioned result for one exact reference/source/scoring input set. */
export type ProteinComparisonAlignmentCacheEntry = {
  sourceId: string
  signature: string
  alignment: ProteinGuidedAlignment | null
  error?: string
}

export type ProteinComparisonLayoutSlot =
  | { kind: 'reference'; referenceIndex: number }
  | { kind: 'insertion'; referenceBoundary: number; insertionIndex: number }
