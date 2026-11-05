/**
 * How the current DNA selection feeds Primer3.
 * - `template`: the selected stretch is SEQUENCE_TEMPLATE.
 * - `target`: the whole record is the template and the selection is added to SEQUENCE_TARGET,
 *   so primer pairs flank (amplify across) it.
 * - `included`: the whole record is the template and the selection is SEQUENCE_INCLUDED_REGION,
 *   so every oligo lies inside it.
 */
export type Primer3SelectionMode = 'template' | 'target' | 'included'

export type Primer3Topology = 'linear' | 'circular'

/** 0-based, end-exclusive record coordinates. `end < start` wraps the origin (circular records only). */
export type Primer3RecordRange = {
  start: number
  end: number
}

export type Primer3SequenceContext = {
  /** Full record sequence. */
  sequence: string
  topology: Primer3Topology
  selection: Primer3RecordRange
  mode: Primer3SelectionMode
  /** Written to SEQUENCE_ID. */
  name?: string
}

/**
 * Coordinate-bearing SEQUENCE_* tags. In `Primer3Request.sequenceTags` their values use Primer3's own
 * syntax but with 1-based record positions (as shown in Vibegene); the request builder converts them to
 * template coordinates.
 * - `interval`: `start,length`
 * - `intervalList`: `start,length start,length …`
 * - `positionList`: `pos pos …`
 * - `okRegionList`: `leftStart,leftLength,rightStart,rightLength ; …` (empty left/right fields allowed)
 * - `position`: single position
 */
export const PRIMER3_COORDINATE_TAGS = {
  SEQUENCE_TARGET: 'intervalList',
  SEQUENCE_EXCLUDED_REGION: 'intervalList',
  SEQUENCE_INCLUDED_REGION: 'interval',
  SEQUENCE_INTERNAL_EXCLUDED_REGION: 'intervalList',
  SEQUENCE_OVERLAP_JUNCTION_LIST: 'positionList',
  SEQUENCE_INTERNAL_OVERLAP_JUNCTION_LIST: 'positionList',
  SEQUENCE_PRIMER_PAIR_OK_REGION_LIST: 'okRegionList',
  SEQUENCE_FORCE_LEFT_START: 'position',
  SEQUENCE_FORCE_LEFT_END: 'position',
  SEQUENCE_FORCE_RIGHT_START: 'position',
  SEQUENCE_FORCE_RIGHT_END: 'position',
  SEQUENCE_START_CODON_POSITION: 'position',
} as const

export type Primer3CoordinateTag = keyof typeof PRIMER3_COORDINATE_TAGS
export type Primer3CoordinateFormat = (typeof PRIMER3_COORDINATE_TAGS)[Primer3CoordinateTag]

/**
 * Tags the request builder always sets itself; the settings UI must not expose them and the builder
 * ignores them if present in `settings` / `sequenceTags`.
 */
export const PRIMER3_RESERVED_TAGS = [
  'SEQUENCE_TEMPLATE',
  'SEQUENCE_ID',
  'PRIMER_FIRST_BASE_INDEX',
  'PRIMER_EXPLAIN_FLAG',
  'PRIMER_THERMODYNAMIC_PARAMETERS_PATH',
  'P3_FILE_FLAG',
  'P3_FILE_ID',
  'P3_FILE_TYPE',
  'P3_COMMENT',
] as const

/** Built-in mispriming / mishybridization library shipped with the WASM build. */
export const PRIMER3_BUILTIN_LIBRARY_HUMREP = 'builtin:humrep_and_simple'

export type Primer3LibrarySource =
  | { kind: 'none' }
  | { kind: 'builtin'; id: typeof PRIMER3_BUILTIN_LIBRARY_HUMREP }
  /** User-supplied FASTA text (Primer3 mispriming library format). */
  | { kind: 'custom'; name: string; fasta: string }

export type Primer3Request = {
  context: Primer3SequenceContext
  /** PRIMER_* tags as Boulder-IO strings. Empty string = omit (Primer3 default). */
  settings: Record<string, string>
  /** SEQUENCE_* tags. Coordinate tags use 1-based record positions (see PRIMER3_COORDINATE_TAGS). */
  sequenceTags: Record<string, string>
  /** Maps to PRIMER_MISPRIMING_LIBRARY. */
  misprimingLibrary?: Primer3LibrarySource
  /** Maps to PRIMER_INTERNAL_MISHYB_LIBRARY. */
  internalMishybLibrary?: Primer3LibrarySource
}

export type Primer3TemplateMapping = {
  topology: Primer3Topology
  recordLength: number
  templateLength: number
  /** Record position (0-based) of template position 0. */
  offset: number
}

/** Serializable input handed to the WASM engine (worker-safe: no functions). */
export type Primer3EngineInput = {
  /** Final Boulder-IO record, including the terminating `=` line. */
  boulder: string
  /** Virtual file-system files (absolute path -> text) to create before running. */
  files: Record<string, string>
}

export type BuiltPrimer3Input = Primer3EngineInput & {
  tags: Record<string, string>
  mapping: Primer3TemplateMapping
}

export type Primer3OligoKind = 'left' | 'right' | 'internal'

export type Primer3Oligo = {
  kind: Primer3OligoKind
  /** Index in Primer3 output (PRIMER_LEFT_<rank>). */
  rank: number
  /** 5'→3' as reported by Primer3. */
  sequence: string
  length: number
  /** Forward-strand span on the template, 0-based end-exclusive. */
  templateStart: number
  templateEnd: number
  /** Forward-strand span on the record, 0-based end-exclusive; `recordEnd < recordStart` wraps the origin. */
  recordStart: number
  recordEnd: number
  tm: number
  gcPercent: number
  penalty: number
  selfAny?: number
  selfEnd?: number
  selfAnyTh?: number
  selfEndTh?: number
  hairpinTh?: number
  endStability?: number
  templateMispriming?: number
  templateMisprimingTh?: number
  libraryMispriming?: string
  problems?: string
  /** Every other PRIMER_<KIND>_<rank>_* tag, keyed by suffix. */
  extra: Record<string, string>
}

export type Primer3Pair = {
  rank: number
  left?: Primer3Oligo
  right?: Primer3Oligo
  internal?: Primer3Oligo
  productSize?: number
  productTm?: number
  penalty: number
  complAny?: number
  complEnd?: number
  complAnyTh?: number
  complEndTh?: number
  /** Every other PRIMER_PAIR_<rank>_* tag, keyed by suffix. */
  extra: Record<string, string>
}

export type Primer3Result = {
  pairs: Primer3Pair[]
  lefts: Primer3Oligo[]
  rights: Primer3Oligo[]
  internals: Primer3Oligo[]
  /** PRIMER_LEFT_EXPLAIN, PRIMER_RIGHT_EXPLAIN, PRIMER_INTERNAL_EXPLAIN, PRIMER_PAIR_EXPLAIN. */
  explain: Partial<Record<Primer3OligoKind | 'pair', string>>
  warnings: string[]
  errors: string[]
  /** All output tags. */
  raw: Record<string, string>
  /** Boulder-IO text sent to / received from Primer3 (for the "Boulder I/O" view). */
  input: string
  output: string
}

export class Primer3InputError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(issues.join('\n'))
    this.name = 'Primer3InputError'
    this.issues = issues
  }
}
