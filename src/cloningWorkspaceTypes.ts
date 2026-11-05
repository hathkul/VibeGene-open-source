import type { RestrictionSite, SequenceRecord } from './domain/types'
import type { StrandPairSelection } from './domain/sequence'
import type { PrimerHybridizationParams } from './domain/primerHybridization'
import type { DisplaySettings } from './presentation/sequence'
import type { PrimerFrameDisplay } from './domain/primerLayoutTypes'

export type CloningWorkspaceEnzymeSet = Pick<
  DisplaySettings['enzymes'],
  'set' | 'selectedNames' | 'supplierSetId'
>

export type CloningWorkspaceSelectionRange = {
  start: number
  end: number
}

export type CloningWorkspaceRenderArgs = {
  /** Lets retained cloning previews reset when reopened or when the source set changes. */
  workspaceKey?: string
  record: SequenceRecord | null
  title?: string
  selectedRange: CloningWorkspaceSelectionRange | null
  cutStrandSelection: StrandPairSelection | null
  selectedSites: RestrictionSite[]
  segmentHighlights?: { start: number; end: number; color: string; label?: string }[]
  allowEnzymeSelect: boolean
  /** When true, show Map / Sequence / Enzymes / Primers (gel simulator). */
  includePrimersTab?: boolean
  /**
   * When true, keep CDS `translateInSequenceView` annotations so Sequence shows
   * amino-acid rows (Browse Common Features). Cloning/gel previews leave this off.
   */
  showFeatureTranslations?: boolean
  /** Allow Ctrl/Shift multi-select of primers (gel PCR mode). */
  allowPrimerSelect?: boolean
  selectedPrimerIds?: string[]
  /** Explicit per-site primer drawing for isolated previews such as a thermodynamic model. */
  primerFrameDisplayOverrides?: PrimerFrameDisplay[]
  /** Prevent automatic primer-frame calculation when the caller owns preview timing/conditions. */
  disablePrimer3PrimerFrameRefinement?: boolean
  /**
   * Sequence-only preview (no Map/Enzymes/Primers tabs or view sidebar).
   * Used by Mutagenesis to show the anneal neighborhood.
   */
  sequenceOnly?: boolean
  /** Keep the compact display-controls sidebar beside a sequence-only preview. */
  sequenceOnlySidebar?: boolean
  /** Suppress the whole-construct overview in a focused sequence-only preview. */
  hideSequenceMinimap?: boolean
  /** Render the focused sequence window as one horizontally scrollable row. */
  singleRowSequence?: boolean
  /** Show selected-range thermodynamics in the workspace status bar instead of over the sequence. */
  selectionDetailsInStatus?: boolean
  /** Initial preview tab when `sequenceOnly` is false (defaults to Map). */
  initialTab?: 'Map' | 'Sequence' | 'Enzymes' | 'Primers'
  /** Forced sequence magnifier window when `sequenceOnly` (or always applied when set). */
  sequenceViewRange?: CloningWorkspaceSelectionRange | null
  /** Override primer hybridization thresholds for this workspace only. */
  primerHybridization?: PrimerHybridizationParams
  /** Paint mismatch/template-gap DNA bases red (Mutagenesis preview only). */
  highlightMutagenicDnaBases?: boolean
  onRestrictionSelect?: (site: RestrictionSite, extendSelection: boolean) => void
  onPrimerSelect?: (primerId: string, extendSelection: boolean) => void
  onRangeSelect?: (range: CloningWorkspaceSelectionRange) => void
  /** Sites shown on the Enzymes tab / map for the current enzyme set (for cut dropdowns). */
  onEnzymePickerSitesChange?: (sites: RestrictionSite[]) => void
  /** The open plasmid's active enzyme set, when this preview is showing that plasmid. */
  initialEnzymeSet?: CloningWorkspaceEnzymeSet
}
