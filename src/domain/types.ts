import type { BinderNumbering, BinderStructure } from './binderStructure'

export type Strand = 'forward' | 'reverse'

export type Topology = 'circular' | 'linear'

export type MoleculeType = 'dna' | 'rna' | 'protein'

export type ExternalSequenceProvider = 'ncbi' | 'uniprot' | 'ensembl'

/** Reproducible provenance for a molecule retrieved from a public sequence database. */
export type ExternalSequenceSource = {
  provider: ExternalSequenceProvider
  accession: string
  version?: string
  release?: string
  retrievedAt: string
  sourceUrl: string
  database?: string
  assembly?: string
}

export type ProteinBondType = 'disulfide' | 'thioether' | 'thiolester' | 'cross-link' | 'other'

/** A zero-based residue endpoint. Omit chainId for the protein in this document. */
export type ProteinBondEndpoint = {
  residue: number
  chainId?: string
}

export type ProteinBond = {
  id: string
  name: string
  type: ProteinBondType
  endpoints: [ProteinBondEndpoint, ProteinBondEndpoint]
  /** Connector color in protein Map and Sequence views. */
  color?: string
  /** Connector stroke width in pixels for protein Map and Sequence views. */
  strokeWidth?: number
  /** False hides this bond without deleting it. */
  visible?: boolean
  /** Show the user label beside the connector. */
  showLabel?: boolean
  /** Append the bond type to the displayed label. */
  showTypeLabel?: boolean
  notes?: string
}

/**
 * Display numbering for a half-open sequence region. Physical positions remain
 * zero-based; startAt is the user-facing number assigned to sequenceStart.
 */
export type ProteinNumberingRegion = {
  id: string
  name?: string
  sequenceStart: number
  sequenceEnd: number
  startAt: number
}

export type ProteinDocumentData = {
  /** Default user-facing number for residue index 0. */
  numberingStart: number
  numberingRegions: ProteinNumberingRegion[]
  bonds: ProteinBond[]
  /** User-painted amino-acid ranges displayed by Protein Sequence user-color mode. */
  userColors?: StrandColors
  /** Sources compared against this protein in the anchor-based alignment workspace. */
  comparisonSources?: import('./proteinAlignmentTypes').ProteinComparisonSource[]
  /** Reference stretches whose sequence is expected to vary between homologs. */
  comparisonVariableRegions?: import('./proteinAlignmentTypes').ProteinComparisonVariableRegion[]
  /** Reusable computed alignments; signatures prevent stale results from being displayed. */
  comparisonAlignmentCache?: import('./proteinAlignmentTypes').ProteinComparisonAlignmentCacheEntry[]
  /** Applied binder numbering, retained with the sequence it was computed for. */
  binderNumbering?: {
    sequenceDigest: string
    numbering: BinderNumbering
  }
  binderStructure?: { sequenceDigest: string; structure: BinderStructure }
  sourceDatabase?: string
  sourceAccession?: string
  retrievedAt?: string
  /** Portable DNA/CDS provenance for proteins created by translation. */
  translationDerivation?: ProteinTranslationDerivation
}

/** DNA-only metadata for reference-guided comparative alignment. */
export type LibraryMemberFeaturePack = import('./dnaComparisonTypes').LibraryMemberFeaturePack
export type LibraryMemberReadPack = import('./dnaComparisonTypes').LibraryMemberReadPack
export type DnaDocumentData = import('./dnaComparisonTypes').DnaComparisonDocumentData

export type ProteinTranslationCds = {
  featureId?: string
  featureName: string
  locations: FeatureSegment[]
  translation: FeatureTranslationOptions
  /** Coding bases in translation order, after frame/segment skipping. */
  nucleotideSequence: string
  includedTerminalStop: boolean
}

export type ProteinTranslationSource = {
  projectId?: string
  projectName: string
  folderId?: string | null
  recordUpdatedAt?: string
  sequenceDigest: string
  /** Indicates which portable payload remains after provenance trimming. */
  retention?: 'complete' | 'cds-only' | 'reference-only'
  cds?: ProteinTranslationCds
  /** Trace data is intentionally omitted; DNA sequence, annotations, and history remain. */
  sourceRecord?: SequenceRecord
}

export type ProteinTranslationDerivation = {
  kind: 'translated-cds'
  createdAt: string
  sources: ProteinTranslationSource[]
}

export type FeatureSegment = {
  start: number
  end: number
  strand: Strand
  /**
   * True when this segment was produced by splitting a wrap-around location at the origin
   * during linearization. Gap connectors must not join such halves across the molecule.
   */
  originWrapSplit?: boolean
}

export type FeatureReadingFrame = 1 | 2 | 3 | -1 | -2 | -3

export type FeatureSegmentNumbering = {
  startAt: number
  skip: boolean
}

export type FeatureTranslationOptions = {
  geneticCode: string
  firstCodonAsMet: boolean
  readingFrame: FeatureReadingFrame
  consecutiveNumbering: boolean
  segmentNumbering: FeatureSegmentNumbering[]
}

export type SequenceFeature = {
  id: string
  /** Source feature identity retained while PCR/assembly workflows clip and rejoin annotations. */
  sourceFeatureId?: string
  /** Position of the first translated codon base in the current record coordinate system. */
  sourceTranslationAnchor?: number
  name: string
  type: string
  color: string
  /** Display direction selected in feature properties; independent of biological strand. */
  directionality?: 'none' | 'forward' | 'reverse' | 'both'
  notes?: string
  prioritizeDisplay?: boolean
  translateInSequenceView?: boolean
  translation?: FeatureTranslationOptions
  /** Restart displayed protein residue numbering at the first residue in this feature. */
  proteinNumberingStart?: number
  /**
   * Absolute 0-based sequence positions of SnapGene-style cleavage arrows.
   * Exported as 1-based `cleavageArrows` on the Feature XML element.
   */
  cleavageArrows?: number[]
  /**
   * When false, the feature is hidden on map and sequence panes (SnapGene `visible="0"`).
   * Undefined / true means visible.
   */
  visible?: boolean
  /**
   * When `'ruler'`, draw on the plasmid backbone instead of a feature ring/row.
   * Used for temporary cloning Product highlights (Vector / Inserts).
   */
  mapTrack?: 'features' | 'ruler'
  locations: FeatureSegment[]
}

export type PrimerLayoutComponent = {
  primerBases: string
  templateStart?: number
  templateEnd?: number
}

export type PrimerBindingLayout = {
  strand: Strand
  templateStart: number
  templateEnd: number
  components: PrimerLayoutComponent[]
}

export type Primer = {
  id: string
  name: string
  sequence: string
  color: string
  description?: string
  specificity?: import('./primer3/specificity').SavedPrimerSpecificity
  bindings?: PrimerBindingLayout[]
  /**
   * When false, the primer is hidden on map and sequence panes.
   * Omitted / true means visible (default).
   */
  visible?: boolean
}

import type { TraceFileRecord } from './traceTypes'
import type { SnapGeneEnzymeCache } from './snapgeneEnzymeData'

export type OperationRecord = {
  id: string
  type: string
  summary: string
  createdAt: string
}

export type HostMethylationStatus = {
  dam: boolean
  dcm: boolean
  ecoKI: boolean
}

export type HistoryOligo = {
  name: string
  sequence: string
  description?: string
}

/** How one input to a homology assembly was prepared. */
export type HistoryAssemblyLinearization =
  | { method: 'direct' }
  | { method: 'pcr'; forwardPrimer: HistoryOligo; reversePrimer: HistoryOligo; polymerase: string }
  | { method: 'restriction'; leftEnzyme: string; rightEnzyme: string }

export type HistoryAssemblyPart = {
  role: 'vector' | 'fragment'
  orientation: 'forward' | 'reverse'
  length: number
  linearization: HistoryAssemblyLinearization
}

/** Structured, exportable provenance for a guide cloning event. */
export type HistorySgRnaCloning = {
  version: 1
  createdAt: string
  sourceVector: { id: string; name: string }
  cloningChoice: { label: string; architecture: string; kind: string }
  ends: {
    promoter: { enzyme?: string; polarity: string; overhang: string; modification: string }
    scaffold: { enzyme?: string; polarity: string; overhang: string; modification: string }
  }
  guides: Array<{
    sourceGuideId: string
    name: string
    nuclease: string
    targetSpacer: string
    expressedGuide: string
    compatibility: 'compatible' | 'warning' | 'incompatible'
    compatibilityMessage: string
    addedSense5: string
    addedSense3: string
    addedAntisense5: string
    addedAntisense3: string
    productId: string
    productName: string
    warnings: string[]
  }>
  oligos: Array<{ name: string; sequence: string; modification: string; guideId: string }>
  library?: { id: string; name: string }
}

export type HistoryInputSummary = {
  manipulation: string
  name1?: string
  name2?: string
  val1?: string
  val2?: string
  siteCount1?: string
  siteCount2?: string
  assemblyPart?: HistoryAssemblyPart
}

export type HistoryRegeneratedSite = {
  name: string
  pos: number
  siteCount: number
  blunt: boolean
}

export type HistoryFeatureSegment = {
  start: number
  end: number
}

export type HistoryFeature = {
  name: string
  type: string
  color: string
  strand: Strand
  segments: HistoryFeatureSegment[]
}

/** A colored span on one DNA strand (0-based, end exclusive). */
export type StrandColorRange = {
  start: number
  end: number
  color: string
}

/** SnapGene block 20 / HistoryColors strand highlighting. */
export type StrandColors = {
  type?: 'Product' | 'Input'
  topStrand: StrandColorRange[]
  bottomStrand: StrandColorRange[]
}

/**
 * A construct in the ancestry ("family tree") of a SnapGene document.
 *
 * Parsed from the SnapGene `.dna` History Tree block (0x07). Each node is a
 * construct; its `children` are the input constructs (parents) that were
 * combined or modified to produce it, and `operation` describes how it was made
 * from those inputs (the label shown on the arrow pointing from parent → child).
 */
export type HistoryNode = {
  id: string
  name: string
  seqLen: number
  circular: boolean
  operation: string
  resurrectable: boolean
  hideHistory: boolean
  /** In-memory/project marker that earlier parent nodes were intentionally trimmed. */
  ancestryTrimmed?: boolean
  upstreamModification?: string
  downstreamModification?: string
  /** SnapGene history-node sticky-end attrs (mirrors block 8). */
  upstreamStickiness?: number
  downstreamStickiness?: number
  oligos: HistoryOligo[]
  sgRnaCloning?: HistorySgRnaCloning
  polymerase?: string
  regeneratedSites: HistoryRegeneratedSite[]
  inputSummaries: HistoryInputSummary[]
  features: HistoryFeature[]
  /** Strand colors for this history step (SnapGene HistoryColors). */
  historyColors?: StrandColors
  /** Exact bases for this construct, decoded from the SnapGene per-node block. */
  sequence?: string
  /**
   * Primers stored on this ancestor snapshot (nested block 0x05 inside history
   * node block 0x0b). Distinct from `oligos`, which are PCR primers listed on
   * amplify operations in the history XML.
   */
  primers?: Primer[]
  /** Sequencing reads attached to this ancestor when its history snapshot was created. */
  traceFiles?: TraceFileRecord[]
  /**
   * In-memory flag: this root is an open manual DNA-edit session. Further
   * consecutive base edits update this node instead of pushing a new one.
   * Not written to SnapGene XML.
   */
  editSession?: boolean
  children: HistoryNode[]
}

/** Opaque SnapGene history payloads retained for lossless project save and export. */
export type SnapGeneNativeHistory = {
  /** Original block 0x07 payload; reused while the visible tree is unchanged. */
  treePayload?: Uint8Array
  /** Fingerprint of the normalized tree represented by treePayload. */
  treeFingerprint?: string
  /** Node packet that is authoritative for this scoped history root. */
  authoritativeRootPacketId?: string
  /** Exact block 0x0b payloads, including nested traces and unmodeled metadata. */
  nodePackets: Array<{ nodeId: string; payload: Uint8Array }>
}

export type ConstructProperties = {
  /** SnapGene Notes `<Type>`: true = Synthetic, false = Natural. */
  syntheticDna: boolean
  confirmedExperimentally: boolean
  laboratoryHostOrganism: string | null
  /** Source organism for Natural DNA (same option ids as laboratory host). */
  sourceOrganism: string | null
  bacterialTransformationStrain: string | null
  hostMethylation: HostMethylationStatus
  /** GenBank / SnapGene sequence class (PRI, ROD, UNA, …). */
  sequenceClass: string
  accessionNumber: string
  codeNumber: string
  sequenceAuthor: string
  comments: string
  references: string
}

/** SnapGene AdditionalSequenceProperties end chemistry. */
export type DnaEndModification = 'unmodified' | 'fivePrimePhosphorylated' | 'covalentlyClosed'

/**
 * Signed sticky-end length (SnapGene Upstream/DownstreamStickiness).
 * Positive = 5′ overhang length; negative = 3′ overhang length; 0 = blunt.
 */
export type DnaEndState = {
  modification: DnaEndModification
  stickiness: number
  /** Enzyme that produced this sticky end (SnapGene Upstream/DownstreamEnzymeName). */
  enzymeName?: string
}

export type DnaEnds = {
  upstream: DnaEndState
  downstream: DnaEndState
}

/** Origin of DNA end chemistry. Absence means the values may be parser defaults. */
export type DnaEndsProvenance = 'snapgene-block8' | 'snapgene-history' | 'user-defined' | 'legacy-defined'

export type SequenceRecord = {
  id: string
  name: string
  /**
   * Optional custom label shown as the sequence title in Map view (SnapGene
   * CustomMapLabel). When unset, the map falls back to the file `name`.
   */
  mapLabel?: string
  description: string
  molecule: MoleculeType
  topology: Topology
  sequence: string
  /** Public database record from which this molecule was retrieved. */
  externalSource?: ExternalSequenceSource
  /** Protein-only annotations and provenance. Undefined for nucleotide records. */
  protein?: ProteinDocumentData
  /** DNA-only comparative-alignment sources and reusable computed results. */
  dna?: DnaDocumentData
  features: SequenceFeature[]
  primers: Primer[]
  /**
   * Sequencing trace files and their computed template alignments.
   * Persisted in local projects / exported project JSON, and written into SnapGene
   * `.dna` as AlignableSequences + ZTR containers when exporting.
   */
  traceFiles?: TraceFileRecord[]
  operations: OperationRecord[]
  /**
   * Ancestry / cloning history parsed from the SnapGene `.dna` History Tree.
   * The root node is the current construct; walking `children` goes back in time
   * to the parent constructs it was derived from.
   */
  history?: HistoryNode
  /** Native SnapGene history packets preserved alongside the editable ancestry model. */
  snapGeneNativeHistory?: SnapGeneNativeHistory
  /** Custom painted sequence colors from SnapGene block 20 (StrandColors). */
  strandColors?: StrandColors
  /** SnapGene enzyme blocks 3/13 imported for round-trip export and display preset restore. */
  snapGeneEnzymes?: SnapGeneEnzymeCache
  /**
   * Custom enzyme sets stored only with this document (SnapGene block 14
   * `CustomEnzymeSets`, and Vibegene project JSON).
   */
  fileEnzymeSets?: import('./enzymePreferences').SavedEnzymeSet[]
  /**
   * Linear DNA end chemistry and sticky overhangs (SnapGene block 8).
   * Default for linear molecules is 5′-phosphorylated, blunt ends.
   */
  dnaEnds?: DnaEnds
  dnaEndsProvenance?: DnaEndsProvenance
  construct: ConstructProperties
  createdAt: string
  updatedAt: string
}

export type EnzymeOverhang = {
  type: 'blunt' | "5'" | "3'"
  sequence: string | null
  length: number
}

export type EnzymeMethylation = {
  dam: string
  dcm: string
  ecoKI: string
}

import type { EnzymeMethylationRules, MethylaseRule } from './methylationRules'

export type { EnzymeMethylationRules, MethylaseRule }

export type NebBufferCode = 'r1.1' | 'r2.1' | 'r3.1' | 'cutSmart'
export type ThermoBufferCode = 'b' | 'g' | 'o' | 'r' | 'tango'
export type SibBufferCode = 'b' | 'g' | 'o' | 'w' | 'y' | 'rose'
export type UsbBufferCode = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'j' | 'k' | 'l'
export type VivantisBufferCode = 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'ub05' | 'ub' | 'ub15' | 'ub2' | 'specific'
export type RocheBufferCode = 'a' | 'b' | 'h' | 'l' | 'm'
export type TakaraBufferCode = 'l' | 'm' | 'h' | 'k' | 't' | 'basal'
export type PromegaBufferCode =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'j'
  | 'k'
  | 'l'
  | 'multicore'
export type JenaBufferCode = 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'ub' | 'ub05' | 'ub2'
export type EurxBufferCode = 'one' | 'cviJI' | 'cviJIStar' | 'tspGWI' | 'tspDTI' | 'sau3AI' | 'specific'
export type EnzymeBufferCode =
  | NebBufferCode
  | ThermoBufferCode
  | SibBufferCode
  | UsbBufferCode
  | VivantisBufferCode
  | RocheBufferCode
  | TakaraBufferCode
  | PromegaBufferCode
  | JenaBufferCode
  | EurxBufferCode
export type EnzymeBufferSystem =
  | 'neb'
  | 'thermo'
  | 'sibenzyme'
  | 'usb'
  | 'vivantis'
  | 'roche'
  | 'takara'
  | 'promega'
  | 'jena'
  | 'eurx'

export type EnzymeBufferActivity = Partial<Record<EnzymeBufferCode, number | string | null>>

export type EnzymeManufacturerId =
  | 'neb'
  | 'thermo'
  | 'sibenzyme'
  | 'usb'
  | 'vivantis'
  | 'roche'
  | 'takara'
  | 'promega'
  | 'jena'
  | 'eurx'

type EnzymeManufacturerFields = {
  name: string
  productUrl: string
  incubationC: number
  suppliedBuffer?: string | null
  enzymeSpecificBuffer?: string | null
  bufferActivity: EnzymeBufferActivity
  catalogNotes?: string[]
  heatInactivation?: string | null
  diluent?: string | null
  unitSubstrate?: string | null
  bsa?: string | null
  tango2x?: string | null
  doubleDigest?: string | null
  methylation: EnzymeMethylation
}

export type EnzymeManufacturer =
  | (EnzymeManufacturerFields & { id: 'neb'; bufferSystem: 'neb'; preferredBuffer: NebBufferCode })
  | (EnzymeManufacturerFields & { id: 'thermo'; bufferSystem: 'thermo'; preferredBuffer: ThermoBufferCode })
  | (EnzymeManufacturerFields & { id: 'sibenzyme'; bufferSystem: 'sibenzyme'; preferredBuffer: SibBufferCode })
  | (EnzymeManufacturerFields & { id: 'usb'; bufferSystem: 'usb'; preferredBuffer: UsbBufferCode })
  | (EnzymeManufacturerFields & { id: 'vivantis'; bufferSystem: 'vivantis'; preferredBuffer: VivantisBufferCode })
  | (EnzymeManufacturerFields & { id: 'roche'; bufferSystem: 'roche'; preferredBuffer: RocheBufferCode })
  | (EnzymeManufacturerFields & { id: 'takara'; bufferSystem: 'takara'; preferredBuffer: TakaraBufferCode })
  | (EnzymeManufacturerFields & { id: 'promega'; bufferSystem: 'promega'; preferredBuffer: PromegaBufferCode })
  | (EnzymeManufacturerFields & { id: 'jena'; bufferSystem: 'jena'; preferredBuffer: JenaBufferCode })
  | (EnzymeManufacturerFields & { id: 'eurx'; bufferSystem: 'eurx'; preferredBuffer: EurxBufferCode })

export type RestrictionEnzyme = {
  name: string
  notation: string
  recognition: string
  cutTop: number
  cutBottom: number
  /**
   * Upstream cut pair for enzymes that cleave on both sides of an interrupted
   * recognition site (e.g. AloI `(7/12)SEQ(12/7)`). Positions are relative to
   * the start of `recognition` (negative = before the motif).
   */
  upstreamCutTop?: number
  upstreamCutBottom?: number
  type: 'II' | 'IIS'
  overhang: EnzymeOverhang
  manufacturers: EnzymeManufacturer[]
  notes: string[]
  methylationRules?: EnzymeMethylationRules
}

export type SiteMethylationDisplay =
  | 'normal'
  | 'blocked'
  | 'methyl-required-available'
  | 'methyl-required-unavailable'

export type RestrictionSite = {
  enzyme: RestrictionEnzyme
  start: number
  end: number
  match: string
  cutTop: number
  cutBottom: number
  methylationDisplay?: SiteMethylationDisplay
}

export type Orf = {
  id: string
  start: number
  end: number
  frame: number
  strand: Strand
  aminoAcids: string
}

export type PrimerBinding = {
  primer: Primer
  start: number
  end: number
  strand: Strand
  mismatches: number
}

export type ProjectEnvelope = {
  schemaVersion: 1 | 2 | 3 | 4 | 5 | 6
  record: SequenceRecord
  /** User-added common feature templates (schemaVersion >= 2). */
  userCommonFeatures?: import('./commonFeatures').CommonFeatureTemplate[]
  /**
   * Map/sequence visual settings (font sizes, weights, label modes, etc.).
   * Stored as a plain JSON object; the app merges it into DisplaySettings on import.
   */
  displaySettings?: unknown
  /** User-defined agarose MW markers (schemaVersion >= 3). */
  customMwLadders?: import('./mwLadders').MwLadder[]
}
