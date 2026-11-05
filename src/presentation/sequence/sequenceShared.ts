import { enzymes, findRestrictionSites } from "../../domain/enzymes"
import { defaultPrimerHybridizationParams, type PrimerHybridizationParams } from "../../domain/primerHybridization"
import { groupSgRNAFeatures } from "../../domain/sgrna"
import { MOBILE_SHELL_MEDIA } from "../../ui/mobileShellMedia"
import type { FeatureTranslationExtensionSpan, GeneticCodeOption } from "../../domain/geneticCode"
import type { OrfDisplayMode } from "../../domain/orfPrediction"
import type { EnzymeManufacturerId, PrimerBindingLayout, RestrictionSite, SequenceFeature, Strand } from "../../domain/types"
import type { MoleculeWorkspaceTab } from "../../domain/moleculeCapabilities"
import type { AminoAcidClass } from "../../domain/protein"
import { defaultProteinAlignmentVisual, defaultProteinSequenceVisual, type ProteinAlignmentVisualSettings, type ProteinSequenceVisualSettings } from '../protein/proteinVisualSettings'
import type { SequenceLabelCallout, SequenceRowSegment } from "../../domain/sequenceLabelRouter"
import { featureDisplayName } from "../map/mapPrimitives"
import { featureArrowForPiece, type FeatureArrowDirection } from '../../domain/featureDirectionality'
import { featureTypeHasArrow } from '../map/featureRendering'
export type WorkspaceTab = MoleculeWorkspaceTab
export type RestrictionSiteList = ReturnType<typeof findRestrictionSites>
export type SelectionRange = {
  start: number
  end: number
}
export type SelectionFocus = 'dna' | 'feature' | 'primer' | 'bond'
/** A per-strand span pair (top/bottom). Equal forward/reverse means a blunt/duplex span. */
export type StrandSpanPair = {
  forward: SelectionRange
  reverse: SelectionRange
}
/**
 * Origin of the last primary selection, reused as the anchor for cross-type shift-click extends.
 * Carries per-strand spans so that combining with an enzyme cut can produce sticky ends.
 */
export type SelectionAnchor = StrandSpanPair & {
  kind: 'base' | 'enzyme' | 'primer' | 'feature'
  site?: RestrictionSite
}
export function isPrimerFeature(feature: SequenceFeature) {
  return feature.type === 'primer_bind'
}

export function withLinkedSgRnaFeatureIds(ids: string[], features: SequenceFeature[]): string[] {
  const linked = new Set<string>(ids)
  for (const annotation of groupSgRNAFeatures(features)) {
    if (linked.has(annotation.guide.id) || (annotation.pam && linked.has(annotation.pam.id))) {
      linked.add(annotation.guide.id)
      if (annotation.pam) linked.add(annotation.pam.id)
    }
  }
  return [...linked]
}
export type PrimerEditorState = {
  mode: 'edit' | 'create'
  primerId?: string
  name: string
  sequence: string
  color: string
  description: string
  specificity?: import('../../domain/primer3/specificity').SavedPrimerSpecificity
  phosphorylated: boolean
  annealedLength?: number
  strand?: Strand
  bindings?: PrimerBindingLayout[]
  sourceRange?: SelectionRange
}
export type StrandPairSelection = {
  forward: SelectionRange
  reverse: SelectionRange
}
export type EnzymeSetMode = 'all' | 'nonredundant' | 'supplier' | 'unique' | 'unique-dual' | 'six-plus' | 'unique-six-plus' | 'type-iis' | 'custom'
export type EnzymeTabPositionMode = 'numbers' | 'lines'
export type EnzymeTabSortMode = 'name' | 'site-count' | 'first-site' | 'caret-distance'
export type EnzymeTabSortDirection = 'asc' | 'desc'
export type FeatureTabSortMode = 'name' | 'location' | 'size' | 'strand' | 'type' | 'notes'
export type FeatureTabSortDirection = 'asc' | 'desc'
export type PrimerTabSortDirection = 'asc' | 'desc'
export type PrimerColumnId =
  | 'vis'
  | 'name'
  | 'description'
  | 'length'
  | 'binding'
  | 'orientation'
  | 'tm'
  | 'gc'
  | 'mass'
  | 'sequence'
  | 'warnings'
export type MemberColumnId =
  | 'ref'
  | 'on'
  | 'name'
  | 'length'
  | 'reads'
  | 'strand'
  | 'aligned'
  | 'mismatches'
  | 'features'
  | 'primers'
  | 'status'
  | 'actions'
export type EnzymeTabRow = {
  enzyme: RestrictionSite['enzyme']
  sites: RestrictionSite[]
}
export type DnaColorMode = 'history' | 'custom' | 'user'
export type ProteinColorMode = 'class' | 'residue' | 'user'
export type UserStrandPaintTarget = 'top' | 'both' | 'bottom'
export type DnaAlignmentMode = 'trace' | 'comparative'
export type DnaColorPalette = {
  A: string
  C: string
  G: string
  T: string
}
export type ProteinColorCode = 'A' | 'R' | 'N' | 'D' | 'C' | 'E' | 'Q' | 'G' | 'H' | 'I' | 'L' | 'K' | 'M' | 'F' | 'P' | 'S' | 'T' | 'W' | 'Y' | 'V' | 'U' | 'O' | 'B' | 'Z' | 'J' | 'X' | '*'
export type ProteinResidueColorPalette = Record<ProteinColorCode, string>
export type ProteinClassColorPalette = Record<AminoAcidClass, string>
export type DisplaySettings = {
  enzymes: {
    visible: boolean
    set: EnzymeSetMode
    selectedNames: string[]
    /** Enzymes temporarily hidden from map/sequence rendering without changing the active set. */
    hiddenNames?: string[]
    supplierSetId: EnzymeManufacturerId | null
    showPositions: boolean
  }
  features: {
    visible: boolean
    labelsVisible: boolean
    externalLabels: boolean
  }
  primers: {
    visible: boolean
    /** sgRNA guide/PAM annotations; toggled with primers from the sidebar, not with features. */
    sgRnasVisible: boolean
    hybridization: PrimerHybridizationParams
  }
  orfs: {
    visible: boolean
    mode: OrfDisplayMode
    minimumLengthAa: number
    requireStartCodon: boolean
    startCodon: string
    geneticCode: GeneticCodeOption
    applyToExistingFeatures: boolean
    preview: boolean
  }
  dnaColors: {
    enabled: boolean
    mode: DnaColorMode
    palette: DnaColorPalette
  }
  proteinColors: {
    enabled: boolean
    mode: ProteinColorMode
    residuePalette: ProteinResidueColorPalette
    classPalette: ProteinClassColorPalette
  }
  proteinBonds: {
    visible: boolean
  }
  alignments: {
    visible: boolean
    mode?: DnaAlignmentMode
    /** Map topology view (linear vs circular) to restore when alignments are hidden. */
    linearBeforeAlignments?: boolean
  }
  mapView: {
    linear: boolean
    /** Magnifier mode: linear map + zoom strip (slider + minimap). */
    zoom: boolean
  }
  sequenceView: {
    aminoAcidCodeFormat: 'one-letter' | 'three-letter'
  }
  labelRouting: {
    minMapRadiusRatio: number
    /** Preferred minimum ring diameter as a fraction of the circular-map viewport short side. */
    softRingFloorDiameterRatio: number
    /** Maximum ring radius relative to the automatic responsive result. */
    autoRingScaleRatio: number
    /** Outside-label placement curve used by the elliptic router. */
    labelCurveShape: 'ellipse' | 'arcs'
    /** Elliptic: px reserved outside the ring before the side label band (default 56). */
    ellipticRingGap: number
    /**
     * Elliptic: horizontal px reserved for side labels when sizing the ring.
     * null = auto (max(64, widest label)). 0 = don't reserve a label band (largest ring).
     */
    ellipticSideBudget: number | null
    /** Explicit horizontal ring-to-label-oval gap; null keeps automatic sizing. */
    ellipticHorizontalGapPx: number | null
    /** Explicit vertical ring-to-label-oval gap; null keeps automatic sizing. */
    ellipticVerticalGapPx: number | null
    /** Two-arcs equatorial ring-to-curve gap; null keeps automatic sizing. */
    arcHorizontalGapPx: number | null
    /** Keep the two arc halves' controls synchronized. */
    arcHalvesLinked: boolean
    /** Two-arcs minimum upper polar ring-to-tip gap; null keeps automatic sizing. */
    arcUpperVerticalGapPx: number | null
    /** Two-arcs minimum lower polar ring-to-tip gap; null keeps automatic sizing. */
    arcLowerVerticalGapPx: number | null
    /** Bluntest allowed upper tip; null lets density determine it. */
    arcUpperTipAngleDegrees: number | null
    /** Bluntest allowed lower tip; null lets density determine it. */
    arcLowerTipAngleDegrees: number | null
    /** In arc overflow, prefer shorter leaders once the minimum bend angle is protected. */
    arcCompactOverflowLabels: boolean
    /** Elliptic: slide packed labels horizontally toward their site rays (default true). */
    ellipticRaySlideEnabled: boolean
    /** Elliptic: min horizontal gap (px) to the more polar neighbor when ray-sliding (default 4). */
    ellipticRaySlideClearancePx: number
    /** Elliptic: pull labels radially toward the ring after ray-slide (default true). */
    ellipticRadialImplodeEnabled: boolean
    /** Elliptic: min gap (px) to labels/leaders when imploding radially (default 4). */
    ellipticRadialImplodeClearancePx: number
    /** Elliptic: min distance (px) from ring edge to label box when imploding (default 24). */
    ellipticRadialImplodeMinRingDistancePx: number
    /** Elliptic: nudge the ring toward the emptiest pocket among outer labels (default true). */
    ellipticBalanceRing: boolean
    maxEnzymeSiteLabels: number | null
    maxPrimerSiteLabels: number | null
    showAllPrimers: boolean
  }
  /** Circular map visual-controls panel + outside-label typography / manual placement. */
  circularVisual: {
    panelOpen: boolean
    manualLabelPlacement: boolean
    outsideLabelFontSizePx: number
    /** Horizontal clearance between circular enzyme/primer labels and their leaders. */
    outsideLabelLeaderGapPx: number
    enzymeFontWeight: number
    uniqueEnzymeFontWeight: number
    primerFontWeight: number
    /** In-line feature names drawn along the feature arc / bar. */
    featureInlineFontSizePx: number
    featureInlineFontWeight: number
  }
  /** Protein map visual-controls panel + protein-specific map geometry / typography. */
  proteinMapVisual: {
    panelOpen: boolean
    titleFontSizePx: number
    titleFontWeight: number
    subtitleFontSizePx: number
    rulerFontSizePx: number
    backboneHeightPx: number
    featureHeightPx: number
    featureLabelFontSizePx: number
    featureLabelFontWeight: number
    bondLabelFontSizePx: number
    bondLabelFontWeight: number
    alignmentLabelFontSizePx: number
    alignmentLabelFontWeight: number
    alignmentTrackHeightPx: number
  }
  /** Protein Sequence pane visual-controls panel + typography / geometry. */
  proteinSequenceVisual: ProteinSequenceVisualSettings
  /** Protein comparative-alignment visual-controls panel + typography / geometry. */
  proteinAlignmentVisual: ProteinAlignmentVisualSettings
  /** Sequence pane visual-controls panel + typography. */
  sequenceVisual: {
    panelOpen: boolean
    sequenceFontSizePx: number
    sequenceFontWeight: number
    /** Horizontal pitch between sequence bases (px). */
    sequenceBaseSpacingPx: number
    enzymeLabelFontSizePx: number
    enzymeFontWeight: number
    uniqueEnzymeFontWeight: number
    primerLabelFontSizePx: number
    primerLabelFontWeight: number
    featureBodyFontSizePx: number
    featureBodyFontWeight: number
    featureBodyFrame: boolean
    translationFontSizePx: number
    translationFontWeight: number
  }
}


export const sequenceBaseStepPx = 10
export const sequenceBaseFontPx = 12
export const sequenceBaseLineHeight = 1.8
export const sequenceRulerHeightPx = 14
export const sequenceRowSideMarginPx = 36
export const sequenceRowEndIndexPx = 56
export const sequenceRowEndIndexGapPx = 10
export const sequenceRowScrollbarReservePx = 16
export const sequenceTrackInsetPx = 28
export const alignmentLabelChunkBasesPerRow = 90
/** Match the mobile shell breakpoint; sequence rows switch to a compact layout at or below this width. */
export const MOBILE_SEQUENCE_LAYOUT_MAX_WIDTH = 760

export function isMobileShellViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_SHELL_MEDIA).matches
}

export type SequenceRowLayoutMetrics = {
  sideMarginPx: number
  scrollbarReservePx: number
  endIndexPx: number
  endIndexGapPx: number
  trackInsetPx: number
  minBasesPerRow: number
}

export function sequenceRowLayoutMetrics(compact: boolean): SequenceRowLayoutMetrics {
  if (compact) {
    return {
      sideMarginPx: 8,
      scrollbarReservePx: 0,
      endIndexPx: 0,
      endIndexGapPx: 0,
      trackInsetPx: 0,
      minBasesPerRow: 8,
    }
  }
  return {
    sideMarginPx: sequenceRowSideMarginPx,
    scrollbarReservePx: sequenceRowScrollbarReservePx,
    endIndexPx: sequenceRowEndIndexPx,
    endIndexGapPx: sequenceRowEndIndexGapPx,
    trackInsetPx: sequenceTrackInsetPx,
    minBasesPerRow: 40,
  }
}

export function emptySequenceRowLabelLayout(
  rowIndex: number,
  segment: SequenceRowSegment,
  baseStepPx = sequenceBaseStepPx,
  trackInsetPx = sequenceTrackInsetPx,
) {
  return {
    rowIndex,
    rowStart: segment.rowStart,
    rowLength: segment.rowLength,
    trackLeft: trackInsetPx,
    trackRight: trackInsetPx + segment.rowLength * baseStepPx,
    enzymeCallouts: [] as SequenceLabelCallout[],
    primerCallouts: [] as SequenceLabelCallout[],
    enzymeLaneRows: 0,
    primerLaneRows: 0,
  }
}

export function measureSequenceRowLayout(
  containerWidth: number,
  baseStepPx = sequenceBaseStepPx,
  metrics = sequenceRowLayoutMetrics(false),
): { basesPerRow: number; sequenceContentWidthPx: number } | null {
  const innerWidth = containerWidth - metrics.sideMarginPx * 2 - metrics.scrollbarReservePx
  const sequenceBudget =
    innerWidth - metrics.endIndexPx - metrics.endIndexGapPx - metrics.trackInsetPx * 2
  if (sequenceBudget <= 0) return null
  const basesPerRow = Math.max(metrics.minBasesPerRow, Math.floor(sequenceBudget / baseStepPx))
  return {
    basesPerRow,
    sequenceContentWidthPx: metrics.trackInsetPx * 2 + basesPerRow * baseStepPx,
  }
}

export function computeHorizontalVisibleRange(
  scrollLeft: number,
  viewportWidth: number,
  sequenceLength: number,
  baseStepPx = sequenceBaseStepPx,
) {
  const innerLeft = Math.max(0, scrollLeft - sequenceTrackInsetPx)
  const innerRight = scrollLeft + viewportWidth - sequenceTrackInsetPx
  const start = Math.max(0, Math.floor(innerLeft / baseStepPx) - 4)
  const end = Math.min(sequenceLength, Math.ceil(innerRight / baseStepPx) + 4)
  return { start, end }
}

/** Horizontal Xlim offset for sequence enzyme label row assignment. */
export const sequenceLabelCollisionPx = 0
export const sequenceEnzymeLabelFontSizePx = 11
export const defaultDnaColorPalette: DnaColorPalette = {
  A: '#0f766e',
  C: '#2563eb',
  G: '#a16207',
  T: '#b91c1c',
}
export const proteinColorCodes: ProteinColorCode[] = [...'ARNDCEQGHILKMFPSTWYV', 'U', 'O', 'B', 'Z', 'J', 'X', '*'] as ProteinColorCode[]
export const defaultProteinResidueColorPalette: ProteinResidueColorPalette = {
  A: '#dbeafe', R: '#ede9fe', N: '#dcfce7', D: '#fee2e2', C: '#fef3c7',
  E: '#fee2e2', Q: '#dcfce7', G: '#fef3c7', H: '#ede9fe', I: '#dbeafe',
  L: '#dbeafe', K: '#ede9fe', M: '#dbeafe', F: '#dbeafe', P: '#fef3c7',
  S: '#dcfce7', T: '#dcfce7', W: '#dbeafe', Y: '#dcfce7', V: '#dbeafe',
  U: '#fef3c7', O: '#ede9fe', B: '#e5e7eb', Z: '#e5e7eb', J: '#e5e7eb',
  X: '#e5e7eb', '*': '#e5e7eb',
}
export const proteinClassColorOptions: Array<{ code: AminoAcidClass; label: string }> = [
  { code: 'nonpolar', label: 'Nonpolar' },
  { code: 'polar', label: 'Polar' },
  { code: 'acidic', label: 'Acidic' },
  { code: 'basic', label: 'Basic' },
  { code: 'special', label: 'Special' },
  { code: 'unknown', label: 'Unknown' },
]
export const defaultProteinClassColorPalette: ProteinClassColorPalette = {
  nonpolar: '#dbeafe',
  polar: '#dcfce7',
  acidic: '#fee2e2',
  basic: '#ede9fe',
  special: '#fef3c7',
  unknown: '#e5e7eb',
}
export function normalizeProteinColorMode(mode: unknown): ProteinColorMode {
  return mode === 'residue' || mode === 'user' ? mode : 'class'
}
export const featureLabelModeIcon = {
  all: '/feature-label-all.png',
  internal: '/feature-label-internal.png',
} as const
export const dnaColorModeIcon: Record<Exclude<DnaColorMode, 'user'>, string> = {
  history: '/dna-color-history.png',
  custom: '/dna-color-custom.png',
}
export const orfModeOrder: OrfDisplayMode[] = ['orfs-only', 'frame-plus-1', 'top-3', 'bottom-3', 'all-6']
export const orfModeIconByMode: Record<OrfDisplayMode, string> = {
  'orfs-only': '/orf-mode-orfs-only.png',
  'frame-plus-1': '/orf-mode-frame-plus-1.png',
  'top-3': '/orf-mode-top-3.png',
  'bottom-3': '/orf-mode-bottom-3.png',
  'all-6': '/orf-mode-all-6.png',
}
export const geneticCodeOptions: GeneticCodeOption[] = [
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
]
export const defaultDisplaySettings: DisplaySettings = {
  enzymes: {
    visible: true,
    set: 'unique-six-plus',
    selectedNames: enzymes.map((enzyme) => enzyme.name),
    hiddenNames: [],
    supplierSetId: null,
    showPositions: true,
  },
  features: {
    visible: true,
    labelsVisible: true,
    externalLabels: true,
  },
  primers: {
    visible: true,
    sgRnasVisible: true,
    hybridization: defaultPrimerHybridizationParams,
  },
  orfs: {
    visible: false,
    mode: 'orfs-only',
    minimumLengthAa: 75,
    requireStartCodon: true,
    startCodon: 'ATG',
    geneticCode: 'Standard',
    applyToExistingFeatures: false,
    preview: true,
  },
  dnaColors: {
    enabled: false,
    mode: 'custom',
    palette: defaultDnaColorPalette,
  },
  proteinColors: {
    enabled: true,
    mode: 'class',
    residuePalette: defaultProteinResidueColorPalette,
    classPalette: defaultProteinClassColorPalette,
  },
  proteinBonds: {
    visible: true,
  },
  alignments: {
    visible: false,
    mode: 'trace',
  },
  mapView: {
    linear: false,
    zoom: false,
  },
  sequenceView: {
    aminoAcidCodeFormat: 'one-letter',
  },
  labelRouting: {
    minMapRadiusRatio: 0.3,
    softRingFloorDiameterRatio: 0.5,
    autoRingScaleRatio: 1,
    labelCurveShape: 'arcs',
    ellipticRingGap: 0,
    ellipticSideBudget: null,
    ellipticHorizontalGapPx: null,
    ellipticVerticalGapPx: null,
    arcHorizontalGapPx: null,
    arcHalvesLinked: false,
    arcUpperVerticalGapPx: null,
    arcLowerVerticalGapPx: null,
    arcUpperTipAngleDegrees: null,
    arcLowerTipAngleDegrees: null,
    arcCompactOverflowLabels: false,
    ellipticRaySlideEnabled: false,
    ellipticRaySlideClearancePx: 4,
    ellipticRadialImplodeEnabled: false,
    ellipticRadialImplodeClearancePx: 4,
    ellipticRadialImplodeMinRingDistancePx: 24,
    ellipticBalanceRing: true,
    maxEnzymeSiteLabels: null,
    maxPrimerSiteLabels: null,
    showAllPrimers: true,
  },
  circularVisual: {
    panelOpen: false,
    manualLabelPlacement: false,
    outsideLabelFontSizePx: 12,
    outsideLabelLeaderGapPx: 6,
    enzymeFontWeight: 500,
    uniqueEnzymeFontWeight: 800,
    primerFontWeight: 600,
    featureInlineFontSizePx: 12,
    featureInlineFontWeight: 400,
  },
  proteinMapVisual: {
    panelOpen: false,
    titleFontSizePx: 17,
    titleFontWeight: 700,
    subtitleFontSizePx: 11,
    rulerFontSizePx: 9,
    backboneHeightPx: 10,
    featureHeightPx: 16,
    featureLabelFontSizePx: 12,
    featureLabelFontWeight: 400,
    bondLabelFontSizePx: 11,
    bondLabelFontWeight: 600,
    alignmentLabelFontSizePx: 9,
    alignmentLabelFontWeight: 600,
    alignmentTrackHeightPx: 14,
  },
  proteinSequenceVisual: { ...defaultProteinSequenceVisual },
  proteinAlignmentVisual: { ...defaultProteinAlignmentVisual },
  sequenceVisual: {
    panelOpen: false,
    sequenceFontSizePx: 14,
    sequenceFontWeight: 500,
    sequenceBaseSpacingPx: 10,
    enzymeLabelFontSizePx: 12,
    enzymeFontWeight: 400,
    uniqueEnzymeFontWeight: 700,
    primerLabelFontSizePx: 12,
    primerLabelFontWeight: 500,
    featureBodyFontSizePx: 12,
    featureBodyFontWeight: 400,
    featureBodyFrame: true,
    translationFontSizePx: 12,
    translationFontWeight: 500,
  },
}


export function sequenceFeatureShowsArrow(info: {
  feature: SequenceFeature
  strand: Strand
  start: number
  end: number
  isFeatureStart: boolean
  isFeatureEnd: boolean
  segmentStart: number
  segmentEnd: number
}) {
  return sequenceFeatureArrowDirection(info) !== 'none'
}

export function sequenceFeatureArrowDirection(info: {
  feature: SequenceFeature
  strand: Strand
  start: number
  end: number
  isFeatureStart: boolean
  isFeatureEnd: boolean
  segmentStart: number
  segmentEnd: number
}): FeatureArrowDirection {
  if (!info.feature.directionality && !featureTypeHasArrow(info.feature.type)) return 'none'
  const desired = featureArrowForPiece(info)
  const hasLeftArrow = (desired === 'reverse' || desired === 'both') && info.start === info.segmentStart
  const hasRightArrow = (desired === 'forward' || desired === 'both') && info.end === info.segmentEnd
  if (hasLeftArrow && hasRightArrow) return 'both'
  if (hasLeftArrow) return 'reverse'
  if (hasRightArrow) return 'forward'
  return 'none'
}

export const sequenceFeatureArrowSizePx = 8


export function sequenceFeatureBodyOutlinePath(
  width: number,
  height: number,
  arrow: 'none' | 'forward' | 'reverse' | 'both',
  arrowSize = sequenceFeatureArrowSizePx,
) {
  const inset = 0.5
  const w = Math.max(inset * 2, width)
  const h = Math.max(inset * 2, height)
  if (arrow === 'forward') {
    const tip = Math.min(arrowSize, Math.max(2, w / 2))
    return `M${inset},${inset} H${Math.max(inset, w - tip - inset)} L${w - inset},${h / 2} L${Math.max(inset, w - tip - inset)},${h - inset} H${inset} Z`
  }
  if (arrow === 'reverse') {
    const tip = Math.min(arrowSize, Math.max(2, w / 2))
    return `M${tip + inset},${inset} H${w - inset} V${h - inset} H${tip + inset} L${inset},${h / 2} Z`
  }
  if (arrow === 'both') {
    const tip = Math.min(arrowSize, Math.max(2, w / 2))
    return `M${tip + inset},${inset} H${w - tip - inset} L${w - inset},${h / 2} L${w - tip - inset},${h - inset} H${tip + inset} L${inset},${h / 2} Z`
  }
  const radius = Math.min(2, w / 2, h / 2)
  return `M${inset + radius},${inset} H${w - inset - radius} Q${w - inset},${inset} ${w - inset},${inset + radius} V${h - inset - radius} Q${w - inset},${h - inset} ${w - inset - radius},${h - inset} H${inset + radius} Q${inset},${h - inset} ${inset},${h - inset - radius} V${inset + radius} Q${inset},${inset} ${inset + radius},${inset} Z`
}

/** True when `status` only echoes selection/caret (shown already on the left of the selection bar). */
export function isSelectionBarEchoStatus(message: string) {
  return /^(Selected |Caret at position )/i.test(message.trim())
}


export function inFrameWithLabel(feature: SequenceFeature) {
  return `(in frame with ${featureDisplayName(feature)})`
}

export function estimateInFrameLabelWidthPx(label: string) {
  return label.length * 6.1 + 12
}

export function inFrameLabelFits(widthPx: number, label: string) {
  return widthPx >= estimateInFrameLabelWidthPx(label) + 20
}

export function inFrameLabelOffsets(widthPx: number, label: string, intervalPx = 220): number[] {
  if (!inFrameLabelFits(widthPx, label)) return []
  const labelWidth = estimateInFrameLabelWidthPx(label)
  const offsets: number[] = []
  for (let offset = 16; offset + labelWidth <= widthPx - 8; offset += intervalPx) {
    offsets.push(offset)
  }
  if (!offsets.length && widthPx >= labelWidth + 16) {
    offsets.push(Math.max(8, (widthPx - labelWidth) / 2))
  }
  return offsets
}

export function inFrameExtensionSegmentId(featureId: string, span: FeatureTranslationExtensionSpan, spanIndex: number) {
  return `${featureId}:in-frame:${span.start}-${span.end}:${spanIndex}`
}

export function beveledLabelFramePath(box: { left: number; right: number; top: number; bottom: number }, pad = 2, chamfer = 3) {
  const left = box.left - pad
  const right = box.right + pad
  const top = box.top - pad
  const bottom = box.bottom + pad
  const c = chamfer
  return [
    `M ${left + c} ${top}`,
    `L ${right - c} ${top}`,
    `L ${right} ${top + c}`,
    `L ${right} ${bottom - c}`,
    `L ${right - c} ${bottom}`,
    `L ${left + c} ${bottom}`,
    `L ${left} ${bottom - c}`,
    `L ${left} ${top + c}`,
    'Z',
  ].join(' ')
}

export type { PrimerRowPlacement } from '../../domain/primerRowPlacement'

export const sequenceMinimapHeightPx = 24
export const sequenceMinimapOligoTracksHeightPx = 10
export const sequenceMinimapAlignmentExtraHeightPx = 8
export const sequenceMinimapMarginPx = 6
export const sequenceMinimapInsetLeftPx = sequenceRowSideMarginPx + sequenceTrackInsetPx
export const sequenceMinimapInsetRightPx = sequenceRowSideMarginPx + sequenceRowEndIndexPx + sequenceRowEndIndexGapPx

export function sequenceMinimapInsets(compact: boolean) {
  if (!compact) {
    return { left: sequenceMinimapInsetLeftPx, right: sequenceMinimapInsetRightPx }
  }
  const metrics = sequenceRowLayoutMetrics(true)
  return {
    left: metrics.sideMarginPx + metrics.trackInsetPx,
    right: metrics.sideMarginPx + metrics.endIndexPx + metrics.endIndexGapPx,
  }
}

export type SequenceMinimapTrackLayout = {
  insetLeft: number
  insetRight: number
  mapWidth: number
  compact: boolean
}

export function desktopSequenceMinimapTrackLayout(minimapWidth: number): SequenceMinimapTrackLayout {
  const { left, right } = sequenceMinimapInsets(false)
  return {
    insetLeft: left,
    insetRight: right,
    mapWidth: Math.max(120, minimapWidth - left - right),
    compact: false,
  }
}

/**
 * The compact minimap is a direct, full-width overview. Keeping its SVG and
 * drag overlays in the same measured box prevents the viewport frames from
 * using a different scale than the feature track.
 */
export function compactSequenceMinimapTrackLayout(minimapWidth: number): SequenceMinimapTrackLayout {
  return {
    insetLeft: 0,
    insetRight: 0,
    mapWidth: Math.max(1, Math.round(minimapWidth)),
    compact: true,
  }
}

export function resolveSequenceScrollHost(container: HTMLElement): HTMLElement {
  let node: HTMLElement | null = container
  while (node) {
    const { overflowY } = window.getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return node
    }
    node = node.parentElement
  }
  return container.parentElement ?? container
}

export function sequenceScrollHostFromViewMain(viewMain: HTMLElement): HTMLElement {
  const rows = viewMain.querySelector<HTMLElement>('.sequence-rows')
  return rows ? resolveSequenceScrollHost(rows) : viewMain
}

export function computeSequenceMinimapVisibleRange(
  scrollHost: HTMLElement,
  sequenceLength: number,
  rowsRoot: ParentNode = scrollHost,
) {
  const hostRect = scrollHost.getBoundingClientRect()
  const rows = rowsRoot.querySelectorAll<HTMLElement>('.sequence-row, .protein-sequence-row')
  let start: number | null = null
  let end: number | null = null

  rows.forEach((row) => {
    const rowRect = row.getBoundingClientRect()
    const rowStart = Number(row.dataset.rowStart ?? 0)
    const rowEnd = Number(row.dataset.rowEnd ?? rowStart)
    const visibleTop = Math.max(hostRect.top, rowRect.top)
    const visibleBottom = Math.min(hostRect.bottom, rowRect.bottom)
    if (visibleBottom <= visibleTop || rowRect.height <= 0) return

    const rowLength = Math.max(1, rowEnd - rowStart)
    const visibleFractionTop = Math.max(0, Math.min(1, (visibleTop - rowRect.top) / rowRect.height))
    const visibleFractionBottom = Math.max(0, Math.min(1, (visibleBottom - rowRect.top) / rowRect.height))
    const partialStart = rowStart + Math.floor(visibleFractionTop * rowLength)
    const partialEnd = rowStart + Math.ceil(visibleFractionBottom * rowLength)

    if (start === null || partialStart < start) start = partialStart
    if (end === null || partialEnd > end) end = partialEnd
  })

  return {
    start: start ?? 0,
    end: end ?? sequenceLength,
  }
}

export function scrollSequenceViewToPosition(
  viewMain: HTMLElement,
  position: number,
  rowsRoot?: ParentNode,
  options?: { viewportAnchorFraction?: number; interpolateWithinRow?: boolean; atEnd?: boolean },
): boolean {
  const scrollHost = sequenceScrollHostFromViewMain(viewMain)
  const rows = (rowsRoot ?? viewMain).querySelectorAll<HTMLElement>('.sequence-row, .protein-sequence-row')
  if (!rows.length) return false

  const hostRect = scrollHost.getBoundingClientRect()
  const anchorFraction = Math.max(0, Math.min(1, options?.viewportAnchorFraction ?? 0.5))
  const viewportAnchor = scrollHost.clientHeight * anchorFraction

  if (options?.atEnd) {
    const lastRow = rows[rows.length - 1]!
    const rect = lastRow.getBoundingClientRect()
    scrollHost.scrollTop = Math.max(0, rect.bottom - hostRect.top + scrollHost.scrollTop - scrollHost.clientHeight)
    return true
  }

  for (const row of rows) {
    const rowStart = Number(row.dataset.rowStart ?? 0)
    const rowEnd = Number(row.dataset.rowEnd ?? rowStart)
    if (position < rowStart || position >= rowEnd) continue

    const rowRect = row.getBoundingClientRect()
    const relativeTop = rowRect.top - hostRect.top + scrollHost.scrollTop
    const rowOffset = options?.interpolateWithinRow
      ? ((position - rowStart) / Math.max(1, rowEnd - rowStart)) * rowRect.height
      : 0
    scrollHost.scrollTop = Math.max(0, relativeTop + rowOffset - viewportAnchor)
    return true
  }

  const lastRow = rows[rows.length - 1]
  const lastRect = lastRow.getBoundingClientRect()
  scrollHost.scrollTop = Math.max(0, lastRect.top - hostRect.top + scrollHost.scrollTop - viewportAnchor)
  return true
}

export type SequenceRowScrollAnchor = {
  rowIndex: number
  rowStart: number
  /** How far the scroll host's top edge sits below the anchor row's top. */
  offsetPx: number
  /** scrollTop at capture; a mismatch means a scroll whose event has not fired yet. */
  scrollTop: number
}

export function sequenceRowElementAt(container: HTMLElement, rowIndex: number): HTMLElement | null {
  return container.querySelector<HTMLElement>(`:scope > .sequence-row[data-row-index="${rowIndex}"]`)
}

export function captureSequenceRowScrollAnchor(
  container: HTMLElement,
  scrollHost: HTMLElement,
  rowStartOffsets: readonly number[],
): SequenceRowScrollAnchor | null {
  const rowCount = rowStartOffsets.length
  if (!rowCount) return null
  const hostTop = scrollHost.getBoundingClientRect().top
  const targetOffset = hostTop - container.getBoundingClientRect().top
  if (targetOffset <= 0) return null

  let low = 0
  let high = rowCount - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if ((rowStartOffsets[mid] ?? 0) <= targetOffset) low = mid
    else high = mid - 1
  }

  // Offsets are estimates for unmeasured rows; walk from the candidate to the row that
  // actually straddles the host's top edge.
  let rowIndex = low
  let direction = 0
  for (let step = 0; step < 64; step += 1) {
    const row = sequenceRowElementAt(container, rowIndex)
    if (!row) return null
    const rect = row.getBoundingClientRect()
    const stepDirection = rect.top > hostTop ? -1 : rect.bottom <= hostTop ? 1 : 0
    const atEdge = (stepDirection < 0 && rowIndex === 0) || (stepDirection > 0 && rowIndex === rowCount - 1)
    if (stepDirection === 0 || atEdge || stepDirection === -direction) {
      return {
        rowIndex,
        rowStart: Number(row.dataset.rowStart ?? 0),
        offsetPx: hostTop - rect.top,
        scrollTop: scrollHost.scrollTop,
      }
    }
    direction = stepDirection
    rowIndex += stepDirection
  }
  return null
}

/**
 * Moves the anchor by a scrollTop change without reading layout, using the heights the
 * virtual list last committed. Returns null when the resulting row is not in the DOM.
 */
export function shiftSequenceRowScrollAnchor(
  container: HTMLElement,
  anchor: SequenceRowScrollAnchor,
  scrollTop: number,
  rowHeights: readonly number[],
  fallbackRowHeight: number,
): SequenceRowScrollAnchor | null {
  const lastRowIndex = Math.max(0, rowHeights.length - 1)
  let rowIndex = Math.min(anchor.rowIndex, lastRowIndex)
  let offsetPx = anchor.offsetPx + scrollTop - anchor.scrollTop
  while (rowIndex < lastRowIndex && offsetPx >= (rowHeights[rowIndex] ?? fallbackRowHeight)) {
    offsetPx -= rowHeights[rowIndex] ?? fallbackRowHeight
    rowIndex += 1
  }
  while (rowIndex > 0 && offsetPx < 0) {
    rowIndex -= 1
    offsetPx += rowHeights[rowIndex] ?? fallbackRowHeight
  }
  if (rowIndex === anchor.rowIndex) return { ...anchor, offsetPx, scrollTop }
  const row = sequenceRowElementAt(container, rowIndex)
  if (!row) return null
  return { rowIndex, rowStart: Number(row.dataset.rowStart ?? 0), offsetPx, scrollTop }
}

export function scheduleSequenceScrollToPosition(
  scrollHost: HTMLElement,
  position: number,
  onSettled: () => void,
): () => void {
  let frame = 0
  let settleTimer = 0
  let settled = false

  const attemptScroll = () => {
    if (settled) return
    scrollSequenceViewToPosition(scrollHost, position)
  }

  const scheduleAttempt = () => {
    if (settled) return
    if (frame) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(attemptScroll)
    })
  }

  const finish = (notify = false) => {
    if (settled) return
    settled = true
    if (frame) cancelAnimationFrame(frame)
    if (settleTimer) window.clearTimeout(settleTimer)
    if (notify) onSettled()
  }

  const abortOnUserInteraction = () => finish(true)

  scheduleAttempt()
  settleTimer = window.setTimeout(() => {
    attemptScroll()
    scrollHost.querySelector<HTMLElement>('.sequence-rows')?.focus({ preventScroll: true })
    finish(true)
  }, 220)

  const resizeObserver = new ResizeObserver(scheduleAttempt)
  resizeObserver.observe(scrollHost)
  const rowsContainer = scrollHost.querySelector('.sequence-rows')
  if (rowsContainer) resizeObserver.observe(rowsContainer)
  scrollHost.addEventListener('wheel', abortOnUserInteraction, { passive: true })
  scrollHost.addEventListener('touchstart', abortOnUserInteraction, { passive: true })
  scrollHost.addEventListener('pointerdown', abortOnUserInteraction)
  scrollHost.addEventListener('keydown', abortOnUserInteraction)

  return () => {
    finish(false)
    resizeObserver.disconnect()
    scrollHost.removeEventListener('wheel', abortOnUserInteraction)
    scrollHost.removeEventListener('touchstart', abortOnUserInteraction)
    scrollHost.removeEventListener('pointerdown', abortOnUserInteraction)
    scrollHost.removeEventListener('keydown', abortOnUserInteraction)
  }
}
