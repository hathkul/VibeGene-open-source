import type { SequenceFeature } from './types'

/**
 * Instrument acquisition channels from ABIF DATA1–4.
 *
 * They are optional because many imported chromatogram formats expose only
 * analyzed peaks. `basePos`, when present, is the file's PLOC.1 data; callers
 * must not substitute analyzed PLOC.2 positions when it is absent.
 */
export type RawChromatogramData = {
  aTrace: number[]
  tTrace: number[]
  gTrace: number[]
  cTrace: number[]
  basePos?: number[]
}

export type ChromatogramData = {
  aTrace: number[]
  tTrace: number[]
  gTrace: number[]
  cTrace: number[]
  basePos: number[]
  baseCalls: string[]
  qualNums?: number[]
  raw?: RawChromatogramData
}

export type TraceAlignmentColumn =
  | { kind: 'match'; templateIndex: number; traceIndex: number; match: boolean }
  | { kind: 'templateGap'; templateIndex: number; traceIndex: number }
  | { kind: 'traceInsert'; traceIndex: number }

export type TraceAlignmentOrientation = 'forward' | 'reverse'

export type TraceTemplateAlignment = {
  templateStart: number
  templateEnd: number
  traceStart: number
  traceEnd: number
  mismatchCount: number
  gapCount: number
  orientation: TraceAlignmentOrientation
  alignmentScore: number
  columns: TraceAlignmentColumn[]
}

/** One Sanger/plain read nested under a library member (clone). */
export type LibraryMemberRead = {
  id: string
  fileName: string
  fileLastModified?: number
  sequence: string
  chromatogram: ChromatogramData
  enabled: boolean
  expanded: boolean
  /** Alignment of this read onto the parent member.sequence. */
  alignment: TraceTemplateAlignment | null
  sequenceEdited?: boolean
  parseError?: string
}

export type TraceFileRecord = {
  id: string
  fileName: string
  fileLastModified?: number
  sequence: string
  chromatogram: ChromatogramData
  enabled: boolean
  expanded: boolean
  showAnnotations: boolean
  alignment: TraceTemplateAlignment | null
  /** Distinguishes chromatogram verification rows from plain-sequence comparative rows. */
  alignmentPurpose?: 'trace' | 'comparative'
  /**
   * True after the called/base sequence was edited independently of peak data.
   * Chromatogram peaks may no longer line up with `sequence` / `baseCalls`.
   */
  sequenceEdited?: boolean
  /** Member-local annotations (native coordinates). Persisted via dna.libraryMemberFeatures. */
  features?: SequenceFeature[]
  /** Member-local primers (native coordinates). Persisted via dna.libraryMemberPrimers. */
  primers?: import('./types').Primer[]
  /** Member-local construct history; persisted via dna.libraryMemberHistory. */
  history?: import('./types').HistoryNode
  /**
   * Nested sequencing reads for this library member (e.g. F and R primers of one clone).
   * When present, `sequence` is the assembled/curated member sequence that votes in library consensus.
   */
  reads?: LibraryMemberRead[]
  /** True when `sequence` was last produced by assembling `reads`. */
  sequenceAssembled?: boolean
  parseError?: string
}
