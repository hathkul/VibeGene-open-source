import type { MoleculeType, SequenceRecord } from './types'

export const ALL_WORKSPACE_TABS = [
  'Map',
  'Sequence',
  'Members',
  'Properties',
  'Enzymes',
  'Features',
  'Primers',
  'History',
] as const
export type MoleculeWorkspaceTab = (typeof ALL_WORKSPACE_TABS)[number]

export type SequenceUnit = 'bp' | 'nt' | 'aa'

export type MoleculeCapabilities = {
  sequenceUnit: SequenceUnit
  workspaceTabs: readonly MoleculeWorkspaceTab[]
  defaultWorkspaceTab: MoleculeWorkspaceTab
  map: boolean
  features: boolean
  nucleotideStrands: boolean
  restrictionEnzymes: boolean
  primers: boolean
  cloning: boolean
  alignments: boolean
  orfPrediction: boolean
  circularTopology: boolean
  dnaEnds: boolean
  dnaMetadata: boolean
}

const DNA_CAPABILITIES: MoleculeCapabilities = {
  sequenceUnit: 'bp',
  workspaceTabs: ['Map', 'Sequence', 'Enzymes', 'Features', 'Primers', 'History'],
  defaultWorkspaceTab: 'Map',
  map: true,
  features: true,
  nucleotideStrands: true,
  restrictionEnzymes: true,
  primers: true,
  cloning: true,
  alignments: true,
  orfPrediction: true,
  circularTopology: true,
  dnaEnds: true,
  dnaMetadata: true,
}

const DNA_LIBRARY_TABS: readonly MoleculeWorkspaceTab[] = [
  'Map',
  'Sequence',
  'Members',
  'Enzymes',
  'Features',
  'Primers',
  'History',
]

const RNA_CAPABILITIES: MoleculeCapabilities = {
  sequenceUnit: 'nt',
  workspaceTabs: ['Sequence', 'History'],
  defaultWorkspaceTab: 'Sequence',
  map: false,
  features: false,
  nucleotideStrands: false,
  restrictionEnzymes: false,
  primers: false,
  cloning: false,
  alignments: false,
  orfPrediction: false,
  circularTopology: false,
  dnaEnds: false,
  dnaMetadata: false,
}

const PROTEIN_CAPABILITIES: MoleculeCapabilities = {
  sequenceUnit: 'aa',
  workspaceTabs: ['Map', 'Sequence', 'Properties', 'Features', 'History'],
  defaultWorkspaceTab: 'Map',
  map: true,
  features: true,
  nucleotideStrands: false,
  restrictionEnzymes: false,
  primers: false,
  cloning: false,
  alignments: false,
  orfPrediction: false,
  circularTopology: false,
  dnaEnds: false,
  dnaMetadata: false,
}

export function capabilitiesForMolecule(molecule: MoleculeType): MoleculeCapabilities {
  if (molecule === 'protein') return PROTEIN_CAPABILITIES
  if (molecule === 'rna') return RNA_CAPABILITIES
  return DNA_CAPABILITIES
}

export function capabilitiesForRecord(
  record: Pick<SequenceRecord, 'molecule'> & { dna?: { documentRole?: string } | null },
): MoleculeCapabilities {
  const base = capabilitiesForMolecule(record.molecule)
  if (record.molecule === 'dna' && record.dna?.documentRole === 'library') {
    return { ...base, workspaceTabs: DNA_LIBRARY_TABS }
  }
  return base
}

export function sequenceUnitForMolecule(molecule: MoleculeType): SequenceUnit {
  return capabilitiesForMolecule(molecule).sequenceUnit
}

export function formatSequenceLength(length: number, molecule: MoleculeType): string {
  return `${Math.max(0, length).toLocaleString()} ${sequenceUnitForMolecule(molecule)}`
}

export function isWorkspaceTabAvailable(
  tab: MoleculeWorkspaceTab,
  moleculeOrRecord: MoleculeType | (Pick<SequenceRecord, 'molecule'> & { dna?: { documentRole?: string } | null }),
): boolean {
  if (typeof moleculeOrRecord === 'string') {
    return capabilitiesForMolecule(moleculeOrRecord).workspaceTabs.includes(tab)
  }
  return capabilitiesForRecord(moleculeOrRecord).workspaceTabs.includes(tab)
}

type WorkspaceTabRecord = Pick<SequenceRecord, 'molecule'> & {
  dna?: { documentRole?: string } | null
  sequence?: string
  features?: readonly unknown[]
}

/** Layout constants mirrored from the Sequence pane (featureless / no enzyme lanes). */
const SEQUENCE_PANE_BASE_STEP_PX = 10
const SEQUENCE_PANE_SIDE_MARGIN_PX = 36
const SEQUENCE_PANE_SCROLLBAR_RESERVE_PX = 16
const SEQUENCE_PANE_END_INDEX_PX = 56
const SEQUENCE_PANE_END_INDEX_GAP_PX = 10
const SEQUENCE_PANE_TRACK_INSET_PX = 28
const SEQUENCE_PANE_MIN_BASES_PER_ROW = 40
/** Double-strand + ruler + row padding when there are no feature/primer lanes. */
const SEQUENCE_PANE_FEATURELESS_ROW_HEIGHT_PX = 90
const SEQUENCE_PANE_PROTEIN_ROW_HEIGHT_PX = 52
/** Toolbar, tabs, status, minimap — leave the rest for sequence rows. */
const SEQUENCE_PANE_CHROME_HEIGHT_PX = 220
const SEQUENCE_PANE_FALLBACK_VIEWPORT = { width: 1440, height: 900 }

/**
 * True when the whole sequence is likely visible in the Sequence pane without
 * scrolling (conservative estimate from viewport size).
 */
export function sequenceLikelyFitsSequencePaneViewport(
  sequenceLength: number,
  options?: {
    viewportWidth?: number
    viewportHeight?: number
    molecule?: MoleculeType
  },
): boolean {
  if (sequenceLength <= 0) return true
  const viewportWidth =
    options?.viewportWidth ??
    (typeof window !== 'undefined' ? window.innerWidth : SEQUENCE_PANE_FALLBACK_VIEWPORT.width)
  const viewportHeight =
    options?.viewportHeight ??
    (typeof window !== 'undefined' ? window.innerHeight : SEQUENCE_PANE_FALLBACK_VIEWPORT.height)
  const innerWidth =
    Math.max(320, viewportWidth) -
    SEQUENCE_PANE_SIDE_MARGIN_PX * 2 -
    SEQUENCE_PANE_SCROLLBAR_RESERVE_PX
  const sequenceBudget =
    innerWidth -
    SEQUENCE_PANE_END_INDEX_PX -
    SEQUENCE_PANE_END_INDEX_GAP_PX -
    SEQUENCE_PANE_TRACK_INSET_PX * 2
  const basesPerRow = Math.max(
    SEQUENCE_PANE_MIN_BASES_PER_ROW,
    Math.floor(Math.max(0, sequenceBudget) / SEQUENCE_PANE_BASE_STEP_PX),
  )
  const rowHeight =
    options?.molecule === 'protein'
      ? SEQUENCE_PANE_PROTEIN_ROW_HEIGHT_PX
      : SEQUENCE_PANE_FEATURELESS_ROW_HEIGHT_PX
  const contentHeight = Math.max(rowHeight, viewportHeight - SEQUENCE_PANE_CHROME_HEIGHT_PX)
  const rowsThatFit = Math.max(1, Math.floor(contentHeight / rowHeight))
  return sequenceLength <= basesPerRow * rowsThatFit
}

/**
 * Prefer Sequence for short, annotation-free constructs that fit on screen;
 * otherwise the molecule's usual default (Map for DNA/protein, Sequence for RNA).
 */
export function preferredDefaultWorkspaceTab(record: WorkspaceTabRecord): MoleculeWorkspaceTab {
  if (record.molecule === 'dna' && record.dna?.documentRole === 'library') return 'Sequence'
  const caps = capabilitiesForRecord(record)
  if (!caps.workspaceTabs.includes('Sequence')) return caps.defaultWorkspaceTab
  const features = record.features ?? []
  const sequenceLength = record.sequence?.length ?? 0
  if (
    features.length === 0 &&
    sequenceLikelyFitsSequencePaneViewport(sequenceLength, { molecule: record.molecule })
  ) {
    return 'Sequence'
  }
  return caps.defaultWorkspaceTab
}

/**
 * Keep the current workspace pane across an in-window document replace when the
 * new molecule still supports it (e.g. Sequence → Sequence after a file drop).
 * Falls back to {@link preferredDefaultWorkspaceTab}.
 */
export function retainedOrDefaultWorkspaceTab(
  currentTab: MoleculeWorkspaceTab,
  record: WorkspaceTabRecord,
): MoleculeWorkspaceTab {
  if (isWorkspaceTabAvailable(currentTab, record)) return currentTab
  return preferredDefaultWorkspaceTab(record)
}
