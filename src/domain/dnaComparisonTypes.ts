import type { Strand } from './types'
import type { TraceTemplateAlignment } from './traceTypes'

/** Maps zero-based record indices to 1-based inclusive GuideScan genomic coordinates. */
export type GenomicReferenceAnchor = {
  organism: string
  chromosome: string
  /** 1-based genomic coordinate of record index 0. */
  start: number
  /** 1-based genomic coordinate of the last base in the record. */
  end: number
  /** Reference strand represented by the stored sequence (5′→3′ as loaded). */
  strand: Strand
}

export type DnaComparisonSource = {
  id: string
  name: string
  fileName?: string
  sequence: string
  enabled: boolean
}

/** Per-member annotations persisted on DNA library documents (VibeGene attachment). */
export type LibraryMemberFeaturePack = {
  memberId: string
  /** Stable rematch key when SnapGene reload regenerates trace ids. */
  fileName?: string
  features: import('./types').SequenceFeature[]
}

/** Per-member primers persisted on DNA library documents. */
export type LibraryMemberPrimerPack = {
  memberId: string
  /** Stable rematch key when SnapGene reload regenerates trace ids. */
  fileName?: string
  primers: import('./types').Primer[]
}

/** Legacy inline member-history payload (written by releases before pooled histories). */
export type LibraryMemberHistoryPack = {
  memberId: string
  fileName?: string
  history: import('./types').HistoryNode
}

/** A member root in the pooled v1 history representation. */
export type LibraryMemberHistoryReference = {
  memberId: string
  fileName?: string
  historyRef: string
}

/**
 * A HistoryNode with child nodes replaced by references into a shared pool.
 * The pool is intentionally JSON-only so it can be carried in the existing
 * VibeGene SnapGene attachment without a second binary format.
 */
export type LibraryMemberHistoryPooledNode = Omit<import('./types').HistoryNode, 'children'> & {
  children: string[]
}

export type LibraryMemberHistoryPool = {
  version: 1
  nodes: Record<string, LibraryMemberHistoryPooledNode>
}

export type LibraryMemberHistoryEntry = LibraryMemberHistoryPack | LibraryMemberHistoryReference

/** Nested read structure for multi-read library members (sequences; peaks stay in-session). */
export type LibraryMemberReadPack = {
  memberId: string
  fileName: string
  sequence: string
  sequenceAssembled?: boolean
  reads: Array<{
    id: string
    fileName: string
    fileLastModified?: number
    sequence: string
    enabled: boolean
    sequenceEdited?: boolean
    parseError?: string
    baseCalls?: string[]
    qualNums?: number[]
  }>
}

/** Reference-guided nucleotide alignment for one comparison source. */
export type DnaComparisonAlignment = TraceTemplateAlignment & {
  sourceId: string
  identityCount: number
}

export type DnaComparisonAlignmentCacheEntry = {
  sourceId: string
  signature: string
  alignment: DnaComparisonAlignment | null
  error?: string
}

export type DnaComparisonLayoutSlot =
  | { kind: 'reference'; referenceIndex: number }
  | { kind: 'insertion'; referenceBoundary: number; insertionIndex: number }

export type DnaDocumentRole = 'construct' | 'library'

export type DnaComparisonDocumentData = {
  /**
   * Document role for DNA files.
   * `library` = consensus sequence + peer members in `traceFiles` (typically from AB1/.seq).
   */
  documentRole?: DnaDocumentRole
  comparisonSources?: DnaComparisonSource[]
  comparisonAlignmentCache?: DnaComparisonAlignmentCacheEntry[]
  /**
   * Annotation reference for a DNA library.
   * `undefined` / omitted = consensus. When set to a member id, that member's
   * features/primers are the source that spreads to consensus and other members.
   */
  libraryReferenceMemberId?: string
  /**
   * Whether the consensus sequence is shown in Sequence/Map browse and counted
   * in library navigation. Omitted / true = on. When Ref moves to a member,
   * consensus is switched off until the user turns it back on.
   */
  libraryConsensusEnabled?: boolean
  /** Stored features for library members (trace id → features in native coordinates). */
  libraryMemberFeatures?: LibraryMemberFeaturePack[]
  /** Stored primers for library members (trace id → primers in native coordinates). */
  libraryMemberPrimers?: LibraryMemberPrimerPack[]
  /**
   * Per-member construct history, including sgRNA cloning recipes. Older
   * documents contain inline `history` entries; new documents use `historyRef`
   * and `libraryMemberHistoryPool` to share identical ancestry subtrees.
   */
  libraryMemberHistory?: LibraryMemberHistoryEntry[]
  /** Content-addressed child-node pool used by `libraryMemberHistory` refs. */
  libraryMemberHistoryPool?: LibraryMemberHistoryPool
  /** Nested F/R (etc.) reads under library members. */
  libraryMemberReads?: LibraryMemberReadPack[]
  /** When set, selected stretches/features can be sent to GuideScan2 as chr:start-end. */
  genomicAnchor?: GenomicReferenceAnchor
  /**
   * Last successful GuideScan2 design for one host sequence (see `hostRecordId` in the entry).
   * Stored in the vibegene.json SnapGene attachment; not exported via plain GenBank.
   */
  guideScanDesignCache?: import('./guidescan/designCache').GuideScanDesignCacheEntry
  /** Completed Sanger analysis and export choices, stored with the reference document. */
  sangerAlleleAnalysis?: import('./sangerAlleles/savedAnalysis').SavedSangerAlleleAnalysis
}
