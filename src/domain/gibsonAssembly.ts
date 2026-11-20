import { longestEndOverlap } from './bridgePcr'
import { readingFrameAfterMapping } from './cdsTranslationFrame'
import { normalizeConstructProperties } from './constructProperties'
import { defaultDnaEnds } from './dnaEnds'
import { mergeAbuttingAssemblyFeatures } from './featureMerge'
import { flipFeature } from './flipRecord'
import {
  createPcrProductRecord,
  directedPcrAmpliconForRange,
  listPcrAmplicons,
  mapTemplateIndexToPcrProduct,
  pickAmpliconForAmplifyRange,
  type PcrAmplicon,
  type PcrPolymeraseMode,
  type PcrPrimerInput,
} from './pcr'
import { refreshExactPrimerBindings } from './primerSequenceLayout'
import { calculateAnnealTemperature } from './primerThermodynamics'
import { snapshotParentalHistoryNode } from './snapgeneHistoryExport'
import type { ConstructProperties } from './types'
import {
  defaultCloningDntpSet,
  defaultDigestFragmentId,
  listDigestFragmentsBetweenCuts,
  resolveCloningPart,
  type CloningCutEnd,
  type CloningDigestFragment,
} from './restrictionCloning'
import {
  addOperation,
  createId,
  normalizeDna,
  nowIso,
  reverseComplement,
  rotateCircularRecord,
} from './sequence'
import type {
  HistoryAssemblyLinearization,
  HistoryFeature,
  HistoryNode,
  Primer,
  PrimerBindingLayout,
  RestrictionSite,
  SequenceFeature,
  SequenceRecord,
} from './types'

/** @deprecated Prefer method thresholds via `gibsonMethodThresholds`. Kept for call-site defaults. */
export const GIBSON_MIN_OVERLAP_BP = 15
/** @deprecated Prefer `gibsonMethodThresholds(method).minOverlapTmC`. */
export const GIBSON_MIN_OVERLAP_TM_C = 48
const OVERLAP_TM_PROBE_BP = 60

export const GIBSON_FRAGMENT_COLORS = ['#c44d4d', '#3b6fd8', '#2f9e6b', '#c47a2d', '#7a4fc4', '#2a9d8f']

/**
 * Homology-assembly chemistry. Thresholds are not enzyme-agnostic: each kit's
 * published overlap guidance implies which reactions will grade as Optimal.
 */
export type GibsonAssemblyMethod = 'classic-gibson' | 'nebuilder-hifi' | 'infusion'

export type GibsonMethodThresholds = {
  id: GibsonAssemblyMethod
  /** Menu / dialog title. */
  label: string
  /** Short badge text in the schema status line. */
  shortLabel: string
  /** Absolute floor for a detectable / assemblable junction. */
  minBp: number
  /** Overlaps at or above this but below preferred → Suboptimal. */
  softMinBp: number
  /** Preferred band lower bound for simple (≤3 fragment) assemblies. */
  simpleOptimalMinBp: number
  simpleOptimalMaxBp: number
  simpleAcceptableMaxBp: number
  /** Preferred band for 4–6 fragment assemblies. */
  multiOptimalMinBp: number
  multiOptimalMaxBp: number
  multiAcceptableMaxBp: number
  /** Preferred band when fragment count exceeds 6. */
  manyOptimalMinBp: number
  manyOptimalMaxBp: number
  manyAcceptableMaxBp: number
  /**
   * Overlap Tm floor (°C), or null when the vendor does not specify an overlap Tm
   * rule (In-Fusion focuses on gene-specific primer Tm instead).
   */
  minOverlapTmC: number | null
  /**
   * Vendor-recommended minimum dsDNA fragment length for standard assembly
   * (NEBuilder ≥120 bp; In-Fusion ≥50 bp; Classic Gibson ≈100 bp).
   */
  minFragmentBp: number
  /** Soft upper guidance — warn when a fragment/product exceeds this. */
  largeFragmentBp: number
  /** Stronger upper guidance — still assemblable but efficiency drops sharply. */
  veryLargeFragmentBp: number
}

export const GIBSON_ASSEMBLY_METHODS: GibsonAssemblyMethod[] = [
  'classic-gibson',
  'nebuilder-hifi',
  'infusion',
]

export function gibsonMethodThresholds(method: GibsonAssemblyMethod): GibsonMethodThresholds {
  switch (method) {
    case 'classic-gibson':
      // NEB Gibson Assembly Master Mix: longer preferred overlaps than HiFi,
      // especially for 4–6 fragments (20–80 nt usable band).
      return {
        id: method,
        label: 'Classic Gibson',
        shortLabel: 'Gibson',
        minBp: 15,
        softMinBp: 20,
        simpleOptimalMinBp: 20,
        simpleOptimalMaxBp: 40,
        simpleAcceptableMaxBp: 60,
        multiOptimalMinBp: 25,
        multiOptimalMaxBp: 40,
        multiAcceptableMaxBp: 80,
        manyOptimalMinBp: 40,
        manyOptimalMaxBp: 60,
        manyAcceptableMaxBp: 100,
        minOverlapTmC: 48,
        minFragmentBp: 100,
        largeFragmentBp: 8000,
        veryLargeFragmentBp: 15000,
      }
    case 'infusion':
      // Takara In-Fusion: 15 bp (single insert) / 20 bp (multi-insert); avoid <12 or >21.
      // Smallest validated insert ~50 bp; routine guidance up to ~10 kb (rare demos to ~34 kb).
      return {
        id: method,
        label: 'In-Fusion',
        shortLabel: 'In-Fusion',
        minBp: 12,
        softMinBp: 15,
        simpleOptimalMinBp: 15,
        simpleOptimalMaxBp: 15,
        simpleAcceptableMaxBp: 21,
        multiOptimalMinBp: 20,
        multiOptimalMaxBp: 20,
        multiAcceptableMaxBp: 21,
        manyOptimalMinBp: 20,
        manyOptimalMaxBp: 20,
        manyAcceptableMaxBp: 21,
        minOverlapTmC: null,
        minFragmentBp: 50,
        largeFragmentBp: 10000,
        veryLargeFragmentBp: 20000,
      }
    case 'nebuilder-hifi':
    default:
      // NEBuilder HiFi: shorter preferred overlaps; productive from ~12 bp, recommend ≥15.
      // Standard dsDNA protocol: prefer ≥120 bp fragments; validated routinely to ~10 kb.
      return {
        id: method,
        label: 'NEBuilder HiFi',
        shortLabel: 'NEBuilder',
        minBp: 12,
        softMinBp: 15,
        simpleOptimalMinBp: 15,
        simpleOptimalMaxBp: 20,
        simpleAcceptableMaxBp: 30,
        multiOptimalMinBp: 20,
        multiOptimalMaxBp: 30,
        multiAcceptableMaxBp: 40,
        manyOptimalMinBp: 30,
        manyOptimalMaxBp: 40,
        manyAcceptableMaxBp: 50,
        minOverlapTmC: 48,
        minFragmentBp: 120,
        largeFragmentBp: 10000,
        veryLargeFragmentBp: 20000,
      }
  }
}

export function gibsonMethodLabel(method: GibsonAssemblyMethod) {
  return gibsonMethodThresholds(method).label
}

/**
 * Minimum amplify-region length for Gibson-style overlapping PCR design.
 * At least the method’s recommended fragment floor, and enough room for two anneals.
 */
export function minGibsonAmplifyBp(method: GibsonAssemblyMethod = 'nebuilder-hifi'): number {
  const thresholds = gibsonMethodThresholds(method)
  return Math.max(thresholds.minFragmentBp, thresholds.softMinBp * 2 + 20)
}

/** Vendor-recommended minimum fragment / PCR-product length for this chemistry. */
export function minGibsonFragmentBp(method: GibsonAssemblyMethod = 'nebuilder-hifi'): number {
  return gibsonMethodThresholds(method).minFragmentBp
}

export type GibsonFragmentSizeAssessment = {
  level: 'short' | 'large' | 'very-large'
  /** When true, assembly should not proceed as Ready. */
  blocking: boolean
  message: string
}

/** Assess one fragment (or product) length against method min/max guidance. */
export function assessGibsonFragmentSize(
  length: number,
  label: string,
  method: GibsonAssemblyMethod,
  options?: { blockingShort?: boolean },
): GibsonFragmentSizeAssessment | null {
  const thresholds = gibsonMethodThresholds(method)
  const blockingShort = options?.blockingShort ?? true
  if (length < thresholds.minFragmentBp) {
    return {
      level: 'short',
      blocking: blockingShort,
      message: `${label} is only ${length.toLocaleString()} bp — below the ${thresholds.shortLabel} recommended minimum of ${thresholds.minFragmentBp.toLocaleString()} bp.`,
    }
  }
  if (length > thresholds.veryLargeFragmentBp) {
    return {
      level: 'very-large',
      blocking: false,
      message: `${label} is ${length.toLocaleString()} bp — well above typical ${thresholds.shortLabel} fragment sizes (warn >${Math.round(thresholds.veryLargeFragmentBp / 1000)} kb); assembly efficiency may drop sharply.`,
    }
  }
  if (length > thresholds.largeFragmentBp) {
    return {
      level: 'large',
      blocking: false,
      message: `${label} is ${length.toLocaleString()} bp — above the usual ${thresholds.shortLabel} comfort range (≤${Math.round(thresholds.largeFragmentBp / 1000)} kb); prefer longer overlaps / specialized competent cells.`,
    }
  }
  return null
}

export type GibsonLinearizationMode = 'pcr' | 'restriction' | 'direct'

export type GibsonPartRole = 'vector' | 'fragment'

export type GibsonPrimerDraft = PcrPrimerInput & {
  sourcePrimerId: string | null
}

export type GibsonPartConfig = {
  id: string
  role: GibsonPartRole
  record: SequenceRecord | null
  linearizationMode: GibsonLinearizationMode
  orientation: 'forward' | 'reverse'
  forwardPrimer: GibsonPrimerDraft
  reversePrimer: GibsonPrimerDraft
  polymerase: PcrPolymeraseMode
  selectedAmpliconId: string | null
  leftCut: CloningCutEnd
  rightCut: CloningCutEnd
  selectedFragmentId: string | null
  /**
   * User-selected stretch on the source construct (feature click or drag).
   * Used to seed overlapping PCR primer design for inserts.
   */
  amplifyRange: { start: number; end: number } | null
}

/** @deprecated Use GibsonPartConfig — kept as alias for older call sites. */
export type GibsonFragmentConfig = GibsonPartConfig

/**
 * Overlap quality relative to the selected chemistry's fragment-count / size guidelines.
 */
export type GibsonOverlapGradeLevel = 'optimal' | 'good' | 'suboptimal' | 'insufficient'

export type GibsonOverlapRecommendation = {
  method: GibsonAssemblyMethod
  /** Absolute floor used for assembly readiness. */
  minBp: number
  /** Lower bound of the preferred band for this design. */
  optimalMinBp: number
  /** Upper bound of the preferred band for this design. */
  optimalMaxBp: number
  /** Longer overlaps remain usable up to this length. */
  acceptableMaxBp: number
  /** Overlap Tm floor, or null when not graded. */
  minOverlapTmC: number | null
  fragmentCount: number
  maxFragmentBp: number
  productBp: number
  summary: string
}

export type GibsonOverlapGrade = {
  level: GibsonOverlapGradeLevel
  label: string
  detail: string
}

export type GibsonJunction = {
  leftOrderIndex: number
  rightOrderIndex: number
  overlapLength: number
  overlapSequence: string
  tmC: number | null
  grade: GibsonOverlapGrade
}

export type GibsonValidationIssue = {
  leftLabel: string
  rightLabel: string
  message: string
}

export type ResolvedGibsonPart = {
  role: GibsonPartRole
  configIndex: number
  name: string
  label: string
  color: string
  orientation: 'forward' | 'reverse'
  linearizationMode: GibsonLinearizationMode
  linearizationDetails: HistoryAssemblyLinearization
  sequence: string
  features: SequenceFeature[]
  primers: Primer[]
  source: SequenceRecord
  /**
   * Index in this part's sequence of the parental coordinate 0, or null when the
   * origin is not present on the linearized fragment.
   */
  originOffsetInPart: number | null
  ready: boolean
  message: string
  /** Selected amplify stretch on the source construct, if any. */
  amplifyRange: { start: number; end: number } | null
  /** Length of amplifyRange when set; used for schema cards before PCR/RE is ready. */
  selectedStretchBp: number | null
  amplicons: PcrAmplicon[]
  digestFragments: CloningDigestFragment[]
  selectedAmplicon: PcrAmplicon | null
  selectedDigest: CloningDigestFragment | null
}

export type GibsonAssemblyMode = 'linear' | 'cloning'

export type GibsonAnalysis = {
  ready: boolean
  closed: boolean
  message: string
  method: GibsonAssemblyMethod
  issues: GibsonValidationIssue[]
  productLength: number | null
  junctions: GibsonJunction[]
  recommendation: GibsonOverlapRecommendation | null
  designGrade: GibsonOverlapGrade | null
  orderedParts: Array<{
    configIndex: number
    role: GibsonPartRole
    name: string
    label: string
    color: string
    orientation: 'forward' | 'reverse'
    linearizationDetails: HistoryAssemblyLinearization
    sequence: string
    features: SequenceFeature[]
    primers: Primer[]
    source: SequenceRecord
    originOffsetInPart: number | null
  }>
  fusedSequence: string
}

function fragmentColor(index: number) {
  return GIBSON_FRAGMENT_COLORS[index % GIBSON_FRAGMENT_COLORS.length]!
}

function overlapTm(overlapSequence: string): number | null {
  const probe =
    overlapSequence.length > OVERLAP_TM_PROBE_BP
      ? overlapSequence.slice(0, OVERLAP_TM_PROBE_BP)
      : overlapSequence
  const result = calculateAnnealTemperature(probe)
  return result.tmC ?? result.tmMinC
}

const GRADE_RANK: Record<GibsonOverlapGradeLevel, number> = {
  insufficient: 0,
  suboptimal: 1,
  good: 2,
  optimal: 3,
}

const GRADE_LABEL: Record<GibsonOverlapGradeLevel, string> = {
  insufficient: 'Insufficient',
  suboptimal: 'Suboptimal',
  good: 'Good',
  optimal: 'Optimal',
}

/**
 * Recommended overlap band from chemistry, fragment count, and size.
 */
export function recommendGibsonOverlap(input: {
  fragmentCount: number
  maxFragmentBp: number
  productBp: number
  method?: GibsonAssemblyMethod
}): GibsonOverlapRecommendation {
  const method = input.method ?? 'nebuilder-hifi'
  const thresholds = gibsonMethodThresholds(method)
  const fragmentCount = Math.max(0, Math.floor(input.fragmentCount))
  const maxFragmentBp = Math.max(0, Math.floor(input.maxFragmentBp))
  const productBp = Math.max(0, Math.floor(input.productBp))
  const largeFragment =
    maxFragmentBp > thresholds.largeFragmentBp || productBp > thresholds.largeFragmentBp
  const veryLargeFragment =
    maxFragmentBp > thresholds.veryLargeFragmentBp || productBp > thresholds.veryLargeFragmentBp

  let optimalMinBp: number
  let optimalMaxBp: number
  let acceptableMaxBp: number
  let countNote: string

  if (fragmentCount <= 3) {
    optimalMinBp = thresholds.simpleOptimalMinBp
    optimalMaxBp = thresholds.simpleOptimalMaxBp
    acceptableMaxBp = thresholds.simpleAcceptableMaxBp
    countNote = `${fragmentCount || 2} fragments`
  } else if (fragmentCount <= 6) {
    optimalMinBp = thresholds.multiOptimalMinBp
    optimalMaxBp = thresholds.multiOptimalMaxBp
    acceptableMaxBp = thresholds.multiAcceptableMaxBp
    countNote = `${fragmentCount} fragments`
  } else {
    optimalMinBp = thresholds.manyOptimalMinBp
    optimalMaxBp = thresholds.manyOptimalMaxBp
    acceptableMaxBp = thresholds.manyAcceptableMaxBp
    countNote = `${fragmentCount} fragments`
  }

  if (method !== 'infusion') {
    if (veryLargeFragment) {
      optimalMinBp = Math.max(optimalMinBp, thresholds.manyOptimalMinBp)
      optimalMaxBp = Math.max(optimalMaxBp, thresholds.manyOptimalMaxBp)
      acceptableMaxBp = Math.max(acceptableMaxBp, thresholds.manyAcceptableMaxBp)
    } else if (largeFragment) {
      optimalMinBp = Math.max(optimalMinBp, Math.min(optimalMaxBp, thresholds.multiOptimalMinBp + 5))
      optimalMaxBp = Math.max(optimalMaxBp, thresholds.multiOptimalMaxBp)
      acceptableMaxBp = Math.max(acceptableMaxBp, thresholds.multiAcceptableMaxBp)
    }
  }

  const sizeNote = veryLargeFragment
    ? `, large construct (>${Math.round(thresholds.veryLargeFragmentBp / 1000)} kb)`
    : largeFragment
      ? `, large fragment/construct (>${Math.round(thresholds.largeFragmentBp / 1000)} kb)`
      : ''

  const preferred =
    optimalMinBp === optimalMaxBp
      ? `${optimalMinBp} bp`
      : `${optimalMinBp}–${optimalMaxBp} bp`

  return {
    method,
    minBp: thresholds.minBp,
    optimalMinBp,
    optimalMaxBp,
    acceptableMaxBp,
    minOverlapTmC: thresholds.minOverlapTmC,
    fragmentCount,
    maxFragmentBp,
    productBp,
    summary: `${thresholds.shortLabel}: recommend ${preferred} for ${countNote}${sizeNote}`,
  }
}

export function gradeGibsonOverlap(
  overlapLength: number,
  tmC: number | null,
  recommendation: GibsonOverlapRecommendation,
): GibsonOverlapGrade {
  const { optimalMinBp, optimalMaxBp, acceptableMaxBp, minBp, minOverlapTmC } = recommendation
  const tmLow =
    minOverlapTmC !== null &&
    tmC !== null &&
    Number.isFinite(tmC) &&
    tmC < minOverlapTmC
  const tmNote =
    tmC !== null && Number.isFinite(tmC)
      ? ` Tm ${tmC.toFixed(1)} °C${tmLow && minOverlapTmC !== null ? ` (<${minOverlapTmC} °C)` : ''}.`
      : ''

  if (overlapLength < minBp) {
    return {
      level: 'insufficient',
      label: GRADE_LABEL.insufficient,
      detail: `${overlapLength} bp is below the ${minBp} bp minimum for ${gibsonMethodLabel(recommendation.method)}.${tmNote}`,
    }
  }

  const softMin = gibsonMethodThresholds(recommendation.method).softMinBp
  if (overlapLength < softMin || overlapLength < optimalMinBp) {
    return {
      level: 'suboptimal',
      label: GRADE_LABEL.suboptimal,
      detail: `${overlapLength} bp is short for this design (${recommendation.summary}).${tmNote}`,
    }
  }

  if (overlapLength <= optimalMaxBp && !tmLow) {
    return {
      level: 'optimal',
      label: GRADE_LABEL.optimal,
      detail: `${overlapLength} bp is in the preferred ${
        optimalMinBp === optimalMaxBp ? `${optimalMinBp} bp` : `${optimalMinBp}–${optimalMaxBp} bp`
      } band.${tmNote}`,
    }
  }

  if (overlapLength <= optimalMaxBp && tmLow && minOverlapTmC !== null) {
    return {
      level: 'good',
      label: GRADE_LABEL.good,
      detail: `${overlapLength} bp length is preferred, but overlap Tm is below ${minOverlapTmC} °C.${tmNote}`,
    }
  }

  if (overlapLength <= acceptableMaxBp) {
    return {
      level: 'good',
      label: GRADE_LABEL.good,
      detail: tmLow && minOverlapTmC !== null
        ? `${overlapLength} bp is usable but outside the preferred band; Tm is also below ${minOverlapTmC} °C.${tmNote}`
        : `${overlapLength} bp is outside the preferred ${
            optimalMinBp === optimalMaxBp ? `${optimalMinBp} bp` : `${optimalMinBp}–${optimalMaxBp} bp`
          } band but still suitable for ${gibsonMethodLabel(recommendation.method)}.${tmNote}`,
    }
  }

  return {
    level: recommendation.method === 'infusion' ? 'suboptimal' : 'good',
    label: recommendation.method === 'infusion' ? GRADE_LABEL.suboptimal : GRADE_LABEL.good,
    detail:
      recommendation.method === 'infusion'
        ? `${overlapLength} bp exceeds In-Fusion guidance (≤${acceptableMaxBp} bp); shorter overlaps are preferred.${tmNote}`
        : `${overlapLength} bp exceeds the usual ${acceptableMaxBp} bp upper guidance; assembly can work but primers are harder.${tmNote}`,
  }
}

/**
 * Short schema-line guidance shown under Optimal / Good / Suboptimal badges.
 */
export function formatGibsonOverlapRecommendationHint(
  overlapLength: number,
  recommendation: GibsonOverlapRecommendation,
  tmC: number | null = null,
): string {
  const { optimalMinBp, optimalMaxBp, acceptableMaxBp, minBp, minOverlapTmC } = recommendation
  const preferred =
    optimalMinBp === optimalMaxBp ? `${optimalMinBp} bp` : `${optimalMinBp}–${optimalMaxBp} bp`

  if (overlapLength < minBp) {
    return `at least ${minBp} bp is recommended`
  }
  if (overlapLength < optimalMinBp) {
    return `at least ${optimalMinBp} bp is recommended`
  }
  if (overlapLength > optimalMaxBp) {
    if (recommendation.method === 'infusion') {
      return `${acceptableMaxBp} bp or less is recommended`
    }
    return `${preferred} is preferred`
  }
  if (
    minOverlapTmC !== null &&
    tmC !== null &&
    Number.isFinite(tmC) &&
    tmC < minOverlapTmC
  ) {
    return `Tm ≥ ${minOverlapTmC} °C is recommended`
  }
  return `${preferred} preferred`
}

export function gradeGibsonDesign(junctionGrades: GibsonOverlapGrade[]): GibsonOverlapGrade | null {
  if (junctionGrades.length === 0) return null
  let worst = junctionGrades[0]!
  for (const grade of junctionGrades.slice(1)) {
    if (GRADE_RANK[grade.level] < GRADE_RANK[worst.level]) worst = grade
  }
  if (worst.level === 'optimal') {
    return {
      level: 'optimal',
      label: GRADE_LABEL.optimal,
      detail: 'All junctions are in the preferred overlap band.',
    }
  }
  if (worst.level === 'good') {
    return {
      level: 'good',
      label: GRADE_LABEL.good,
      detail: 'All junctions are assembly-suitable; some are outside the preferred band.',
    }
  }
  if (worst.level === 'suboptimal') {
    return {
      level: 'suboptimal',
      label: GRADE_LABEL.suboptimal,
      detail: 'At least one junction is shorter than recommended for this fragment count/size.',
    }
  }
  return {
    level: 'insufficient',
    label: GRADE_LABEL.insufficient,
    detail: 'At least one junction is below the minimum overlap.',
  }
}

function formatDesignStatusMessage(
  ready: boolean,
  closed: boolean,
  productLength: number | null,
  recommendation: GibsonOverlapRecommendation | null,
  designGrade: GibsonOverlapGrade | null,
  fallback: string,
) {
  if (!ready || productLength === null) return fallback
  const topology = closed ? 'Circular' : 'Linear'
  const base = `Ready to assemble. ${topology} product: ${productLength.toLocaleString()} bp.`
  if (!designGrade || !recommendation) return base
  if (designGrade.level === 'optimal') {
    return `${base} Design: Optimal (${recommendation.summary}).`
  }
  if (designGrade.level === 'good') {
    return `${base} Design: Good (${recommendation.summary}).`
  }
  return `${base} Design: ${designGrade.label} — ${designGrade.detail}`
}

function orientedSequence(sequence: string, orientation: 'forward' | 'reverse') {
  const normalized = normalizeDna(sequence)
  return orientation === 'forward' ? normalized : reverseComplement(normalized)
}

export function defaultGibsonPrimerDraft(label: string): GibsonPrimerDraft {
  return { sourcePrimerId: null, name: label, sequence: '', phosphorylated: false }
}

export function gibsonPrimerDraftFromPrimer(primer: Primer, fallbackName: string): GibsonPrimerDraft {
  return {
    sourcePrimerId: primer.id,
    name: primer.name || fallbackName,
    sequence: primer.sequence,
    phosphorylated: false,
    color: primer.color,
  }
}

/**
 * Primers actively used for PCR-linearized assembly parts (selected forward/reverse
 * drafts with sequence). Used for “Export selected primers”.
 */
export function listGibsonAssemblySelectedPrimers(
  parts: Array<Pick<GibsonPartConfig, 'linearizationMode' | 'forwardPrimer' | 'reversePrimer'>>,
): Primer[] {
  const out: Primer[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    if (part.linearizationMode !== 'pcr') continue
    for (const draft of [part.forwardPrimer, part.reversePrimer]) {
      const sequence = normalizeDna(draft.sequence)
      if (!sequence) continue
      const name = (draft.name || 'Primer').trim() || 'Primer'
      const key = `${name}\t${sequence}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        id: draft.sourcePrimerId ?? createId('primer'),
        name,
        sequence,
        color: draft.color ?? '#0ea5e9',
      })
    }
  }
  return out
}

function defaultCutEnd(): CloningCutEnd {
  return {
    enzymeName: null,
    site: null,
    treatment: 'none',
    fillWith: defaultCloningDntpSet(),
  }
}

export function defaultGibsonLinearizationMode(record: SequenceRecord | null): GibsonLinearizationMode {
  if (record?.topology === 'linear') return 'direct'
  return 'pcr'
}

export function defaultGibsonPartConfig(
  role: GibsonPartRole,
  record: SequenceRecord | null = null,
): GibsonPartConfig {
  return {
    id: createId('gibson-part'),
    role,
    record,
    linearizationMode: defaultGibsonLinearizationMode(record),
    orientation: 'forward',
    forwardPrimer: defaultGibsonPrimerDraft('Primer 1'),
    reversePrimer: defaultGibsonPrimerDraft('Primer 2'),
    polymerase: 'blunt',
    selectedAmpliconId: null,
    leftCut: defaultCutEnd(),
    rightCut: defaultCutEnd(),
    selectedFragmentId: null,
    amplifyRange: null,
  }
}

/** @deprecated Prefer defaultGibsonPartConfig. */
export function defaultGibsonFragmentConfig(record: SequenceRecord | null = null): GibsonPartConfig {
  return defaultGibsonPartConfig('fragment', record)
}

export function gibsonPartLabel(config: GibsonPartConfig, fragmentIndex?: number) {
  if (config.role === 'vector') return 'Vector'
  const featureName = exactFeatureNameForAmplifyRange(config.record, config.amplifyRange)
  if (featureName) return featureName
  return `Fragment ${(fragmentIndex ?? 0) + 1}`
}

/** Exact single-span feature covering the amplify stretch, if any. */
export function exactFeatureNameForAmplifyRange(
  record: SequenceRecord | null | undefined,
  range: { start: number; end: number } | null | undefined,
): string | null {
  if (!record || !range) return null
  const start = Math.min(range.start, range.end)
  const end = Math.max(range.start, range.end)
  if (end <= start) return null
  for (const feature of record.features) {
    if (feature.locations.length !== 1) continue
    const location = feature.locations[0]!
    if (location.start === start && location.end === end) {
      const name = feature.name.trim()
      if (name) return name
    }
  }
  return null
}

export function gibsonSelectedStretchBp(
  amplifyRange: { start: number; end: number } | null | undefined,
): number | null {
  if (!amplifyRange) return null
  const length = Math.max(amplifyRange.start, amplifyRange.end) - Math.min(amplifyRange.start, amplifyRange.end)
  return length > 0 ? length : null
}

function reverseFeatures(features: SequenceFeature[], length: number): SequenceFeature[] {
  return features.map((feature) => ({
    ...flipFeature(feature, length),
    id: createId('feat'),
    ...(feature.sourceTranslationAnchor !== undefined
      ? { sourceTranslationAnchor: length - 1 - feature.sourceTranslationAnchor }
      : {}),
  }))
}

function offsetFeatures(features: SequenceFeature[], offset: number): SequenceFeature[] {
  if (offset === 0) return features
  return features.map((feature) => ({
    ...feature,
    id: createId('feat'),
    ...(feature.sourceTranslationAnchor !== undefined ? { sourceTranslationAnchor: feature.sourceTranslationAnchor + offset } : {}),
    locations: feature.locations.map((location) => ({
      ...location,
      start: location.start + offset,
      end: location.end + offset,
    })),
  }))
}

function shiftBinding(binding: PrimerBindingLayout, offset: number): PrimerBindingLayout {
  return {
    ...binding,
    templateStart: binding.templateStart + offset,
    templateEnd: binding.templateEnd + offset,
    components: binding.components.map((component) => ({
      ...component,
      templateStart:
        component.templateStart === undefined ? undefined : component.templateStart + offset,
      templateEnd: component.templateEnd === undefined ? undefined : component.templateEnd + offset,
    })),
  }
}

function reversePrimers(primers: Primer[], length: number): Primer[] {
  return primers.map((primer) => ({
    ...primer,
    id: createId('primer'),
    sequence: reverseComplement(primer.sequence),
    bindings: primer.bindings?.map((binding) => ({
      ...binding,
      strand: binding.strand === 'forward' ? ('reverse' as const) : ('forward' as const),
      templateStart: length - binding.templateEnd,
      templateEnd: length - binding.templateStart,
      components: binding.components.map((component) => ({
        ...component,
        primerBases: reverseComplement(component.primerBases),
        templateStart:
          component.templateEnd === undefined ? undefined : length - component.templateEnd,
        templateEnd:
          component.templateStart === undefined ? undefined : length - component.templateStart,
      })),
    })),
  }))
}

function offsetPrimers(primers: Primer[], offset: number): Primer[] {
  if (offset === 0) return primers
  return primers.map((primer) => ({
    ...primer,
    id: createId('primer'),
    bindings: primer.bindings?.map((binding) => shiftBinding(binding, offset)),
  }))
}

function clipFeaturesToWindow(
  features: SequenceFeature[],
  windowStart: number,
  windowEnd: number,
): SequenceFeature[] {
  return features.flatMap((feature) => {
    const mapped = feature.locations.flatMap((location, index) => {
      const start = Math.max(windowStart, location.start)
      const end = Math.min(windowEnd, location.end)
      return end > start ? [{ location: { ...location, start: start - windowStart, end: end - windowStart }, index }] : []
    })
    if (!mapped.length) return []
    const next: SequenceFeature = { ...feature, id: createId('feat'), locations: mapped.map((entry) => entry.location) }
    const anchor = feature.sourceTranslationAnchor
    if (anchor !== undefined && anchor >= windowStart && anchor < windowEnd) next.sourceTranslationAnchor = anchor - windowStart
    else delete next.sourceTranslationAnchor
    if (feature.translation) {
      next.translation = {
        ...feature.translation,
        readingFrame: readingFrameAfterMapping({ locations: feature.locations, translation: feature.translation },
          (position) => position >= windowStart && position < windowEnd ? position - windowStart : null,
        ) ?? feature.translation.readingFrame,
        segmentNumbering: mapped.map(({ index }) => ({
          ...(feature.translation?.segmentNumbering[index] ?? { startAt: 1, skip: false }),
        })),
      }
    }
    return [next]
  })
}

function clipPrimersToWindow(primers: Primer[], windowStart: number, windowEnd: number): Primer[] {
  // Keep oligo identity when any binding overlaps the retained window, but drop parental
  // binding geometry. Overlap trimming easily desyncs primerBases from template spans;
  // refreshExactPrimerBindings re-resolves every primer against the assembled product.
  return primers
    .filter((primer) =>
      (primer.bindings ?? []).some((binding) => {
        const start = Math.max(windowStart, Math.min(binding.templateStart, binding.templateEnd))
        const end = Math.min(windowEnd, Math.max(binding.templateStart, binding.templateEnd))
        return end > start
      }),
    )
    .map((primer) => ({
      ...primer,
      id: createId('primer'),
      bindings: [],
    }))
}

function historyFileName(name: string) {
  return name.toLowerCase().endsWith('.dna') ? name : `${name}.dna`
}

function historyFeaturesFromProduct(features: SequenceFeature[]): HistoryFeature[] {
  return features.map((feature) => ({
    name: feature.name,
    type: feature.type,
    color: feature.color,
    strand: feature.locations[0]?.strand ?? 'forward',
    segments: feature.locations.map((location) => ({ start: location.start, end: location.end })),
  }))
}

function parentalHistoryNode(record: SequenceRecord): HistoryNode {
  return snapshotParentalHistoryNode(record)
}

function endOverlapJunction(
  leftSequence: string,
  rightSequence: string,
  minOverlap: number,
): Omit<GibsonJunction, 'leftOrderIndex' | 'rightOrderIndex' | 'grade'> | null {
  const overlapLength = longestEndOverlap(leftSequence, rightSequence)
  if (overlapLength < minOverlap) return null
  const overlapSequence = leftSequence.slice(-overlapLength)
  return {
    overlapLength,
    overlapSequence,
    tmC: overlapTm(overlapSequence),
  }
}

function withJunctionGrade(
  junction: Omit<GibsonJunction, 'grade'>,
  recommendation: GibsonOverlapRecommendation,
): GibsonJunction {
  return {
    ...junction,
    grade: gradeGibsonOverlap(junction.overlapLength, junction.tmC, recommendation),
  }
}

function estimateProductLength(
  parts: Array<{ sequence: string }>,
  junctions: Array<{ overlapLength: number }>,
  closeOverlap: number | null,
) {
  const raw = parts.reduce((sum, part) => sum + part.sequence.length, 0)
  const overlapSum = junctions.reduce((sum, junction) => sum + junction.overlapLength, 0)
  return Math.max(0, raw - overlapSum - (closeOverlap ?? 0))
}

function mergeByOverlap(left: string, right: string, overlapLength: number) {
  return left + right.slice(overlapLength)
}

function applyOrientationToResolved(
  sequence: string,
  features: SequenceFeature[],
  primers: Primer[],
  orientation: 'forward' | 'reverse',
  originOffsetInPart: number | null = null,
) {
  if (orientation === 'forward') {
    return {
      sequence: normalizeDna(sequence),
      features: features.map((feature) => ({ ...feature, id: createId('feat') })),
      primers: primers.map((primer) => ({ ...primer, id: createId('primer') })),
      originOffsetInPart,
    }
  }
  const oriented = orientedSequence(sequence, 'reverse')
  const flippedOrigin =
    originOffsetInPart === null || oriented.length === 0
      ? originOffsetInPart
      : oriented.length - 1 - originOffsetInPart
  return {
    sequence: oriented,
    features: reverseFeatures(features, sequence.length),
    primers: reversePrimers(primers, sequence.length),
    originOffsetInPart: flippedOrigin,
  }
}

/**
 * Resolve one Vector/Fragment to a linearized sequence via PCR, restriction, or direct use.
 *
 * `fragmentIndex` drives the Fragment N label (0-based among fragment labels).
 * `colorIndex` selects the schema palette entry; defaults to `fragmentIndex`. In cloning,
 * pass colorIndex = fragmentIndex + 1 so inserts do not share the vector's color.
 */
export function resolveGibsonPart(
  config: GibsonPartConfig,
  configIndex: number,
  fragmentIndex = 0,
  colorIndex = fragmentIndex,
): ResolvedGibsonPart {
  const label = gibsonPartLabel(config, fragmentIndex)
  const color = fragmentColor(config.role === 'vector' ? 0 : colorIndex)
  const amplifyRange = config.amplifyRange
  const selectedStretchBp = gibsonSelectedStretchBp(amplifyRange)
  const linearizationDetails: HistoryAssemblyLinearization = config.linearizationMode === 'pcr'
    ? {
        method: 'pcr',
        forwardPrimer: { name: config.forwardPrimer.name || 'Forward primer', sequence: normalizeDna(config.forwardPrimer.sequence) },
        reversePrimer: { name: config.reversePrimer.name || 'Reverse primer', sequence: normalizeDna(config.reversePrimer.sequence) },
        polymerase: config.polymerase,
      }
    : config.linearizationMode === 'restriction'
      ? {
          method: 'restriction',
          leftEnzyme: config.leftCut.enzymeName ?? config.leftCut.site?.enzyme.name ?? '',
          rightEnzyme: config.rightCut.enzymeName ?? config.rightCut.site?.enzyme.name ?? '',
        }
      : { method: 'direct' }
  const base: ResolvedGibsonPart = {
    role: config.role,
    configIndex,
    name: config.record?.name || label,
    label,
    color,
    orientation: config.orientation,
    linearizationMode: config.linearizationMode,
    linearizationDetails,
    sequence: '',
    features: [],
    primers: [],
    source: config.record!,
    originOffsetInPart: null,
    ready: false,
    message: `Choose a source for ${label}.`,
    amplifyRange,
    selectedStretchBp,
    amplicons: [],
    digestFragments: [],
    selectedAmplicon: null,
    selectedDigest: null,
  }

  if (!config.record?.sequence) {
    return {
      ...base,
      source: {
        id: 'gibson-empty',
        name: label,
        description: '',
        molecule: 'dna',
        topology: 'linear',
        sequence: '',
        features: [],
        primers: [],
        operations: [],
        construct: normalizeConstructProperties({}),
        dnaEnds: defaultDnaEnds(),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    }
  }

  const source = config.record

  if (config.linearizationMode === 'direct') {
    if (source.topology !== 'linear') {
      return {
        ...base,
        source,
        message: `${label} is circular. Choose PCR or restriction enzymes to linearize it.`,
      }
    }
    // Linear DNA is already numbered from its start (parental 0 if it came from a plasmid).
    const oriented = applyOrientationToResolved(
      source.sequence,
      source.features,
      source.primers,
      config.orientation,
      0,
    )
    return {
      ...base,
      source,
      ready: true,
      message: `${label}: ${oriented.sequence.length.toLocaleString()} bp (used directly).`,
      ...oriented,
    }
  }

  if (config.linearizationMode === 'pcr') {
    const forwardOk = normalizeDna(config.forwardPrimer.sequence).length > 0
    const reverseOk = normalizeDna(config.reversePrimer.sequence).length > 0
    if (!forwardOk || !reverseOk) {
      return {
        ...base,
        source,
        message:
          selectedStretchBp != null
            ? `${label}: ${selectedStretchBp.toLocaleString()} bp selected. Linearization not configured.`
            : 'Please specify two primers.',
      }
    }
    const listed = listPcrAmplicons(source, config.forwardPrimer, config.reversePrimer)
    const directed =
      config.amplifyRange != null
        ? directedPcrAmpliconForRange(
            source,
            config.amplifyRange,
            config.forwardPrimer,
            config.reversePrimer,
          )
        : null
    // Prefer the amplify-range product when set — soft hybridization can pick a
    // plasmid-scale wrap-around amplicon when primers are short / self-hit.
    const rangeMatch = pickAmpliconForAmplifyRange(listed, config.amplifyRange)
    let selectedAmplicon: PcrAmplicon | null =
      (config.selectedAmpliconId
        ? [...(directed ? [directed] : []), ...listed].find(
            (entry) => entry.id === config.selectedAmpliconId,
          )
        : null) ?? null
    if (!selectedAmplicon) {
      selectedAmplicon = directed ?? rangeMatch ?? (config.amplifyRange ? null : listed[0] ?? null)
    }
    const amplicons = [
      ...(directed ? [directed] : []),
      ...listed.filter((entry) => entry.id !== directed?.id),
    ]
    if (!selectedAmplicon) {
      const rangeLen = config.amplifyRange
        ? config.amplifyRange.end - config.amplifyRange.start
        : null
      return {
        ...base,
        source,
        amplicons,
        message:
          rangeLen !== null && rangeLen < 60
            ? `${label}: selected stretch (${rangeLen} bp) is too short for reliable Gibson PCR primer design (need room for gene-specific annealing plus overlaps).`
            : 'No PCR amplicon found for these primers.',
      }
    }
    const product = createPcrProductRecord({
      template: source,
      amplicon: selectedAmplicon,
      name: `${source.name} PCR`,
      forwardPrimer: config.forwardPrimer,
      reversePrimer: config.reversePrimer,
      polymerase: config.polymerase,
    })
    const forwardLen = normalizeDna(config.forwardPrimer.sequence).length
    const reverseLen = normalizeDna(config.reversePrimer.sequence).length
    const originOnAmplicon =
      source.topology === 'circular'
        ? mapTemplateIndexToPcrProduct(
            0,
            selectedAmplicon,
            forwardLen,
            reverseLen,
            source.sequence.length,
          )
        : 0
    const oriented = applyOrientationToResolved(
      product.sequence,
      product.features,
      product.primers,
      config.orientation,
      originOnAmplicon,
    )
    return {
      ...base,
      source,
      ready: true,
      message: `${label}: ${oriented.sequence.length.toLocaleString()} bp PCR product.`,
      amplicons,
      selectedAmplicon,
      ...oriented,
    }
  }

  // Restriction linearization
  if (!config.leftCut.site || !config.rightCut.site) {
    return {
      ...base,
      source,
      message:
        selectedStretchBp != null && config.role !== 'vector'
          ? `${label}: ${selectedStretchBp.toLocaleString()} bp selected. Linearization not configured.`
          : 'Please choose an enzyme, or a site of insertion.',
    }
  }
  const digestFragments = listDigestFragmentsBetweenCuts(
    source,
    config.leftCut.site,
    config.rightCut.site,
  )
  const resolved = resolveCloningPart(
    {
      role: config.role === 'vector' ? 'vector' : 'insert',
      record: source,
      leftCut: config.leftCut,
      rightCut: config.rightCut,
      selectedFragmentId:
        config.selectedFragmentId ??
        defaultDigestFragmentId(
          config.role === 'vector' ? 'vector' : 'insert',
          digestFragments,
          source.sequence.length,
        ),
      orientation: 'forward',
    },
    color,
  )
  if (!resolved) {
    return {
      ...base,
      source,
      digestFragments,
      message: 'Could not resolve the restriction fragment.',
    }
  }
  const oriented = applyOrientationToResolved(
    resolved.sequence,
    resolved.features,
    resolved.primers,
    config.orientation,
    resolved.originOffsetInFragment,
  )
  return {
    ...base,
    source,
    ready: true,
    message: `${label}: ${oriented.sequence.length.toLocaleString()} bp restriction fragment.`,
    digestFragments,
    selectedDigest: resolved.fragment,
    ...oriented,
  }
}

/**
 * Analyze Gibson assembly for already-ordered resolved parts.
 * - linear: join by consecutive overlaps into a linear product (no circular closure).
 * - cloning: require last↔first homology and produce a circular product.
 *
 * Partial configurations still report every detectable junction so the schema can
 * show overlaps that already exist while other parts are unfinished.
 */
export function analyzeGibsonAssembly(
  parts: ResolvedGibsonPart[],
  options?: { minOverlap?: number; mode?: GibsonAssemblyMode; method?: GibsonAssemblyMethod },
): GibsonAnalysis {
  const method = options?.method ?? 'nebuilder-hifi'
  const thresholds = gibsonMethodThresholds(method)
  const minOverlap = options?.minOverlap ?? thresholds.minBp
  const mode = options?.mode ?? 'linear'
  const empty: GibsonAnalysis = {
    ready: false,
    closed: false,
    method,
    message:
      mode === 'cloning'
        ? 'Add a vector and at least one overlapping fragment.'
        : 'Add at least two overlapping DNA fragments.',
    issues: [],
    productLength: null,
    junctions: [],
    recommendation: null,
    designGrade: null,
    orderedParts: [],
    fusedSequence: '',
  }

  if (parts.length < 2) return empty

  const orderedParts: GibsonAnalysis['orderedParts'] = parts.map((part) => ({
    configIndex: part.configIndex,
    role: part.role,
    name: part.name,
    label: part.label,
    color: part.color,
    orientation: part.orientation,
    linearizationDetails: part.linearizationDetails,
    sequence: part.sequence,
    features: part.features,
    primers: part.primers,
    source: part.source,
    originOffsetInPart: part.originOffsetInPart,
  }))

  const issues: GibsonValidationIssue[] = []
  const notReady = parts.find((part) => !part.ready)
  if (notReady) {
    issues.push({
      leftLabel: notReady.label,
      rightLabel: '',
      message: notReady.message,
    })
  }

  for (const part of parts) {
    if (!part.ready) continue
    if (part.sequence.length < minOverlap) {
      issues.push({
        leftLabel: part.label,
        rightLabel: '',
        message: `${part.label} is shorter than the ${minOverlap} bp minimum overlap.`,
      })
      continue
    }
    const size = assessGibsonFragmentSize(part.sequence.length, part.label, method, {
      // Vendor min-size is about PCR products; soft-warn restriction/direct so short fixtures stay usable.
      blockingShort: part.linearizationMode === 'pcr',
    })
    if (size) {
      issues.push({
        leftLabel: part.label,
        rightLabel: '',
        message: size.message,
      })
    }
  }

  const readyParts = parts.filter((part) => part.ready && part.sequence.length >= minOverlap)
  const maxFragmentBp =
    readyParts.length > 0
      ? Math.max(...readyParts.map((part) => part.sequence.length))
      : 0
  const draftRecommendation = recommendGibsonOverlap({
    fragmentCount: parts.length,
    maxFragmentBp,
    productBp: readyParts.reduce((sum, part) => sum + part.sequence.length, 0),
    method,
  })

  const rawJunctions: Array<Omit<GibsonJunction, 'grade'>> = []
  for (let index = 0; index < parts.length - 1; index += 1) {
    const left = parts[index]!
    const right = parts[index + 1]!
    if (!left.ready || !right.ready) {
      if (left.ready !== right.ready) {
        const pending = left.ready ? right : left
        issues.push({
          leftLabel: left.label,
          rightLabel: right.label,
          message: `${pending.label} is not configured.`,
        })
      }
      continue
    }
    if (left.sequence.length < minOverlap || right.sequence.length < minOverlap) continue
    const junction = endOverlapJunction(left.sequence, right.sequence, minOverlap)
    if (!junction) {
      issues.push({
        leftLabel: left.label,
        rightLabel: right.label,
        message: `No terminal overlap (≥${minOverlap} bp) between ${left.label} and ${right.label}.`,
      })
      continue
    }
    rawJunctions.push({
      leftOrderIndex: index,
      rightOrderIndex: index + 1,
      ...junction,
    })
  }

  const first = parts[0]!
  const last = parts[parts.length - 1]!
  let closeJunction: ReturnType<typeof endOverlapJunction> = null
  if (
    mode === 'cloning' &&
    first.ready &&
    last.ready &&
    first.sequence.length >= minOverlap &&
    last.sequence.length >= minOverlap
  ) {
    closeJunction = endOverlapJunction(last.sequence, first.sequence, minOverlap)
    if (!closeJunction) {
      issues.push({
        leftLabel: last.label,
        rightLabel: first.label,
        message: `Cloning requires circular closure (≥${minOverlap} bp overlap between ${last.label} and ${first.label}).`,
      })
    } else {
      rawJunctions.push({
        leftOrderIndex: parts.length - 1,
        rightOrderIndex: 0,
        ...closeJunction,
      })
    }
  }

  const consecutiveJunctions = rawJunctions.filter((junction) => junction.rightOrderIndex !== 0)
  const provisionalProductLength = estimateProductLength(
    orderedParts.filter((_, index) => parts[index]?.ready),
    consecutiveJunctions,
    mode === 'cloning' && closeJunction ? closeJunction.overlapLength : null,
  )
  const recommendation = recommendGibsonOverlap({
    fragmentCount: parts.length,
    maxFragmentBp,
    productBp: provisionalProductLength > 0 ? provisionalProductLength : draftRecommendation.productBp,
    method,
  })
  const junctions = rawJunctions.map((junction) => withJunctionGrade(junction, recommendation))
  const designGrade =
    gradeGibsonDesign(junctions.map((junction) => junction.grade)) ??
    (issues.length > 0
      ? {
          level: 'insufficient' as const,
          label: GRADE_LABEL.insufficient,
          detail: issues[0]!.message,
        }
      : null)

  const allPartsReady = parts.every((part) => part.ready)
  const expectedConsecutive = Math.max(0, parts.length - 1)
  const hasAllConsecutive = consecutiveJunctions.length === expectedConsecutive
  const hasClosure = mode !== 'cloning' || Boolean(closeJunction)
  const hasTooShortFragment = parts.some((part) => {
    if (!part.ready) return false
    return Boolean(
      assessGibsonFragmentSize(part.sequence.length, part.label, method, {
        blockingShort: part.linearizationMode === 'pcr',
      })?.blocking,
    )
  })
  const canAssemble =
    allPartsReady && hasAllConsecutive && hasClosure && !hasTooShortFragment

  // Prefer a concrete overlap/config message when assembly is blocked.
  const blockingMessage =
    notReady?.message ??
    issues.find((issue) => issue.message.includes('No terminal overlap'))?.message ??
    issues.find((issue) => issue.message.includes('circular closure'))?.message ??
    issues.find((issue) => issue.message.includes('not configured'))?.message ??
    issues.find((issue) => issue.message.includes('shorter than'))?.message ??
    issues.find((issue) => issue.message.includes('recommended minimum'))?.message ??
    issues.find((issue) => issue.message.includes('too short for reliable'))?.message ??
    issues[0]?.message ??
    empty.message

  if (!canAssemble) {
    return {
      ready: false,
      closed: false,
      method,
      message: blockingMessage,
      issues,
      productLength: null,
      junctions,
      recommendation,
      designGrade,
      orderedParts,
      fusedSequence: '',
    }
  }

  let fused = orderedParts[0]!.sequence
  for (const junction of consecutiveJunctions) {
    const right = orderedParts[junction.rightOrderIndex]!
    fused = mergeByOverlap(fused, right.sequence, junction.overlapLength)
  }

  const closed = mode === 'cloning' && Boolean(closeJunction)
  let productLength = fused.length
  if (closed && closeJunction) {
    productLength = Math.max(0, fused.length - closeJunction.overlapLength)
    fused = fused.slice(0, productLength)
  }

  const finalRecommendation = recommendGibsonOverlap({
    fragmentCount: orderedParts.length,
    maxFragmentBp: Math.max(...orderedParts.map((part) => part.sequence.length)),
    productBp: productLength,
    method,
  })
  const finalJunctions = rawJunctions.map((junction) => withJunctionGrade(junction, finalRecommendation))
  const finalDesignGrade = gradeGibsonDesign(finalJunctions.map((junction) => junction.grade))

  // Keep soft size warnings (large / very-large / short-non-PCR) even when Ready.
  const sizeWarnings: GibsonValidationIssue[] = []
  for (const part of parts) {
    if (!part.ready) continue
    const size = assessGibsonFragmentSize(part.sequence.length, part.label, method, {
      blockingShort: part.linearizationMode === 'pcr',
    })
    if (size && !size.blocking) {
      sizeWarnings.push({
        leftLabel: part.label,
        rightLabel: '',
        message: size.message,
      })
    }
  }
  const productSize = assessGibsonFragmentSize(productLength, 'Product', method, {
    blockingShort: false,
  })
  if (productSize && !productSize.blocking) {
    sizeWarnings.push({
      leftLabel: 'Product',
      rightLabel: '',
      message: productSize.message,
    })
  }

  let message = formatDesignStatusMessage(
    true,
    closed,
    productLength,
    finalRecommendation,
    finalDesignGrade,
    `Ready to assemble. ${closed ? 'Circular' : 'Linear'} product: ${productLength.toLocaleString()} bp.`,
  )
  if (sizeWarnings.length > 0) {
    // Soft limit: still Ready, but surface the strongest size guidance in the status line.
    message = `${message} Size note: ${sizeWarnings[0]!.message}`
  }

  return {
    ready: true,
    closed,
    method,
    message,
    issues: sizeWarnings,
    productLength,
    junctions: finalJunctions,
    recommendation: finalRecommendation,
    designGrade: finalDesignGrade,
    orderedParts,
    fusedSequence: fused,
  }
}

/**
 * Suggest fragment order (indices into the fragments array, not including vector)
 * by greedily chaining terminal overlaps after the resolved vector sequence.
 */
export function suggestGibsonFragmentOrder(
  vector: ResolvedGibsonPart,
  fragments: ResolvedGibsonPart[],
  options?: { minOverlap?: number; method?: GibsonAssemblyMethod },
): { fragmentOrder: number[]; orientations: Array<'forward' | 'reverse'> } | null {
  const minOverlap =
    options?.minOverlap ?? gibsonMethodThresholds(options?.method ?? 'nebuilder-hifi').minBp
  if (!vector.ready || fragments.some((part) => !part.ready) || fragments.length === 0) return null

  type Node = { index: number; orientation: 'forward' | 'reverse'; sequence: string }
  const nodes: Node[] = fragments.flatMap((part, index) => {
    const forward = orientedSequence(part.sequence, 'forward')
    // part.sequence is already oriented; re-derive both from source-length raw by flipping again
    const reverse = reverseComplement(forward)
    return [
      { index, orientation: 'forward' as const, sequence: forward },
      { index, orientation: 'reverse' as const, sequence: reverse },
    ]
  })

  let best: { order: Node[]; score: number } | null = null
  const vectorSeq = vector.sequence

  for (const start of nodes) {
    const used = new Set<number>([start.index])
    const chain: Node[] = [start]
    let score = longestEndOverlap(vectorSeq, start.sequence)
    if (score < minOverlap) continue
    while (used.size < fragments.length) {
      let next: { node: Node; overlap: number } | null = null
      const tip = chain[chain.length - 1]!
      for (const candidate of nodes) {
        if (used.has(candidate.index)) continue
        const overlap = longestEndOverlap(tip.sequence, candidate.sequence)
        if (overlap < minOverlap) continue
        if (!next || overlap > next.overlap) next = { node: candidate, overlap }
      }
      if (!next) break
      chain.push(next.node)
      used.add(next.node.index)
      score += next.overlap
    }
    if (chain.length === fragments.length) {
      const close = longestEndOverlap(chain[chain.length - 1]!.sequence, vectorSeq)
      if (close >= minOverlap) score += close
      if (!best || score > best.score) best = { order: chain, score }
    }
  }

  if (!best) return null
  return {
    fragmentOrder: best.order.map((node) => node.index),
    orientations: best.order.map((node) => node.orientation),
  }
}

/** @deprecated Prefer suggestGibsonFragmentOrder with resolved parts. */
export function suggestGibsonOrder(
  fragments: GibsonPartConfig[],
  options?: { minOverlap?: number; method?: GibsonAssemblyMethod },
): { fragmentOrder: number[]; orientations: Array<'forward' | 'reverse'> } | null {
  const resolved = fragments.map((config, index) => resolveGibsonPart(config, index, index))
  if (resolved.length < 2) return null
  const [first, ...rest] = resolved
  if (!first) return null
  // Treat first as pseudo-vector for legacy tests.
  const suggestion = suggestGibsonFragmentOrder(first, rest, options)
  if (!suggestion) return null
  return {
    fragmentOrder: [0, ...suggestion.fragmentOrder.map((index) => index + 1)],
    orientations: [first.orientation, ...suggestion.orientations],
  }
}

function gibsonPartSpanFeatures(analysis: GibsonAnalysis): SequenceFeature[] {
  const closeJunction = analysis.closed
    ? analysis.junctions.find(
        (junction) =>
          junction.leftOrderIndex === analysis.orderedParts.length - 1 &&
          junction.rightOrderIndex === 0,
      )
    : null
  return analysis.orderedParts.map((part, orderIndex) => {
    let start = 0
    for (let i = 0; i < orderIndex; i += 1) {
      const prev = analysis.orderedParts[i]!
      const incoming =
        i === 0
          ? null
          : analysis.junctions.find(
              (entry) => entry.leftOrderIndex === i - 1 && entry.rightOrderIndex === i,
            )
      const skipEnd =
        analysis.closed && i === analysis.orderedParts.length - 1
          ? (closeJunction?.overlapLength ?? 0)
          : 0
      start += prev.sequence.length - (incoming?.overlapLength ?? 0) - skipEnd
    }
    const incoming = analysis.junctions.find(
      (entry) => entry.leftOrderIndex === orderIndex - 1 && entry.rightOrderIndex === orderIndex,
    )
    const skipEnd =
      analysis.closed && orderIndex === analysis.orderedParts.length - 1
        ? (closeJunction?.overlapLength ?? 0)
        : 0
    const length = part.sequence.length - (incoming?.overlapLength ?? 0) - skipEnd
    return {
      id: createId('feat'),
      name: part.label,
      type: 'misc_feature',
      color: part.color,
      mapTrack: 'ruler' as const,
      locations: [{ start, end: start + Math.max(0, length), strand: 'forward' as const }],
    }
  })
}

/** Inherit features/primers into fused coordinates, then restore vector origin when circular. */
function materializeGibsonProduct(
  analysis: GibsonAnalysis,
  options?: { includePartSpans?: boolean },
): {
  sequence: string
  topology: 'circular' | 'linear'
  features: SequenceFeature[]
  primers: Primer[]
} {
  const topology = analysis.closed ? 'circular' : 'linear'
  const features: SequenceFeature[] = []
  const primers: Primer[] = []
  let cursor = 0
  const closeJunction = analysis.closed
    ? analysis.junctions.find(
        (junction) =>
          junction.leftOrderIndex === analysis.orderedParts.length - 1 &&
          junction.rightOrderIndex === 0,
      )
    : null

  let vectorUsedLength = 0
  for (let orderIndex = 0; orderIndex < analysis.orderedParts.length; orderIndex += 1) {
    const part = analysis.orderedParts[orderIndex]!
    const incoming =
      orderIndex === 0
        ? null
        : analysis.junctions.find(
            (junction) =>
              junction.leftOrderIndex === orderIndex - 1 && junction.rightOrderIndex === orderIndex,
          )
    const skipStart = incoming?.overlapLength ?? 0
    const skipEnd =
      analysis.closed && orderIndex === analysis.orderedParts.length - 1
        ? (closeJunction?.overlapLength ?? 0)
        : 0
    const windowEnd = part.sequence.length - skipEnd
    const usableLength = Math.max(0, windowEnd - skipStart)
    if (orderIndex === 0) vectorUsedLength = usableLength

    const clippedFeatures = clipFeaturesToWindow(part.features, skipStart, windowEnd).map(
      (feature) => ({
        ...feature,
        // Inherited annotations stay on the feature track, not the ruler.
        mapTrack: feature.mapTrack === 'ruler' ? undefined : feature.mapTrack,
      }),
    )
    const clippedPrimers = clipPrimersToWindow(part.primers, skipStart, windowEnd)
    features.push(...offsetFeatures(clippedFeatures, cursor))
    primers.push(...offsetPrimers(clippedPrimers, cursor))
    cursor += usableLength
  }

  // Preview-only Vector / Fragment bands on the ring ruler.
  if (options?.includePartSpans) {
    features.push(...gibsonPartSpanFeatures(analysis))
  }

  let record: SequenceRecord = {
    id: 'gibson-materialize',
    name: 'Assembled',
    description: '',
    molecule: 'dna',
    topology,
    sequence: analysis.fusedSequence,
    features,
    primers,
    operations: [],
    dnaEnds: defaultDnaEnds(),
    construct: normalizeConstructProperties({ syntheticDna: true }),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  // Restore parental numbering from the vector (first part), matching restriction cloning.
  if (analysis.closed) {
    const vector = analysis.orderedParts[0]
    if (vector?.originOffsetInPart !== null && vector?.originOffsetInPart !== undefined) {
      const originInProduct = Math.min(
        vector.originOffsetInPart,
        Math.max(0, vectorUsedLength - 1),
      )
      if (originInProduct > 0) {
        record = rotateCircularRecord(record, originInProduct)
      }
    }
  }

  // Same feature cloned beside / into itself across a junction → one annotation.
  record = {
    ...record,
    features: mergeAbuttingAssemblyFeatures(record.features, {
      circular: topology === 'circular',
      sequenceLength: record.sequence.length,
    }),
    // Rebind every inherited oligo (exact or soft); drop those that no longer anneal.
    primers: refreshExactPrimerBindings(record.primers, record.sequence).filter(
      (primer) => (primer.bindings?.length ?? 0) > 0,
    ),
  }

  return {
    sequence: record.sequence,
    topology,
    features: record.features,
    primers: record.primers,
  }
}

export function assembleGibsonProduct(input: {
  parts: ResolvedGibsonPart[]
  analysis: GibsonAnalysis
  productName: string
  constructOverrides?: Partial<ConstructProperties>
}): SequenceRecord {
  const { analysis, productName } = input
  if (!analysis.ready || !analysis.fusedSequence || analysis.orderedParts.length < 2) {
    throw new Error(analysis.message || 'Gibson assembly is not ready.')
  }

  const name = productName.replace(/\.dna$/i, '') || 'Assembled'
  const materialized = materializeGibsonProduct(analysis)
  const parent = analysis.orderedParts[0]!.source

  let record: SequenceRecord = {
    id: createId('seq'),
    name,
    description: 'Gibson assembly product',
    molecule: 'dna',
    topology: materialized.topology,
    sequence: materialized.sequence,
    features: materialized.features,
    primers: materialized.primers,
    operations: [],
    dnaEnds: defaultDnaEnds(),
    construct: normalizeConstructProperties({
      ...parent.construct,
      syntheticDna: true,
      ...input.constructOverrides,
    }),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  const children = analysis.orderedParts.map((part, index) => {
    const resolved = input.parts.find((candidate) => candidate.configIndex === part.configIndex)
    const preparation = part.linearizationDetails
    if (preparation.method === 'direct') return parentalHistoryNode(part.source)
    let prepared: HistoryNode | undefined
    if (preparation.method === 'pcr' && resolved?.selectedAmplicon) {
      const product = createPcrProductRecord({
        template: part.source, amplicon: resolved.selectedAmplicon, name: `Fragment ${index + 1}`,
        forwardPrimer: { ...preparation.forwardPrimer, phosphorylated: false },
        reversePrimer: { ...preparation.reversePrimer, phosphorylated: false },
        polymerase: preparation.polymerase as PcrPolymeraseMode,
      })
      prepared = product.history
    } else if (preparation.method === 'restriction' && part.orientation === 'forward') {
      prepared = {
        id: createId('history'), name: `Fragment ${index + 1}.dna`, seqLen: part.sequence.length,
        circular: false, operation: 'restrictionDigest', resurrectable: false, hideHistory: false,
        oligos: [], regeneratedSites: [], features: historyFeaturesFromProduct(part.features),
        sequence: part.sequence, primers: part.primers, children: [parentalHistoryNode(part.source)],
        inputSummaries: [{ manipulation: 'gibson', assemblyPart: { role: part.role, orientation: part.orientation,
          length: part.sequence.length, linearization: preparation } }],
      }
    }
    if (!prepared) return parentalHistoryNode(part.source)
    if (part.orientation === 'forward') return prepared
    return {
      id: createId('history'), name: `Fragment ${index + 1} (reversed).dna`, seqLen: part.sequence.length,
      circular: false, operation: 'flip', resurrectable: false, hideHistory: false, oligos: [],
      regeneratedSites: [], inputSummaries: [], features: historyFeaturesFromProduct(part.features),
      sequence: part.sequence, primers: part.primers, children: [prepared],
    }
  })

  const history: HistoryNode = {
    id: createId('history'),
    name: historyFileName(name),
    seqLen: record.sequence.length,
    circular: materialized.topology === 'circular',
    operation: 'gibsonAssembly',
    resurrectable: false,
    hideHistory: false,
    oligos: [],
    regeneratedSites: [],
    inputSummaries: analysis.orderedParts.map((part, index) => ({
      manipulation: 'gibson',
      name1: part.name,
      val1: String(index + 1),
      val2: part.orientation,
      assemblyPart: {
        role: part.role,
        orientation: part.orientation,
        length: part.sequence.length,
        linearization: part.linearizationDetails,
      },
    })),
    features: historyFeaturesFromProduct(record.features),
    sequence: record.sequence,
    primers: record.primers,
    children,
  }
  record = { ...record, history }
  return addOperation(
    record,
    'gibson',
    `${analysis.message} (${analysis.orderedParts.length} parts, ${analysis.junctions.length} junctions).`,
  )
}

/** Preview record for the product pane (empty when not ready). */
export function gibsonPreviewRecord(analysis: GibsonAnalysis, productName: string): SequenceRecord | null {
  if (!analysis.ready || !analysis.fusedSequence) return null
  const name = productName.replace(/\.dna$/i, '') || 'Assembled'
  const materialized = materializeGibsonProduct(analysis, { includePartSpans: true })
  return {
    id: 'gibson-preview',
    name,
    description: 'Gibson assembly preview',
    molecule: 'dna',
    topology: materialized.topology,
    sequence: materialized.sequence,
    features: materialized.features,
    primers: materialized.primers,
    operations: [],
    construct: normalizeConstructProperties({ syntheticDna: true }),
    dnaEnds: defaultDnaEnds(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
}

export function assignGibsonCutSite(
  config: GibsonPartConfig,
  side: 'left' | 'right',
  site: RestrictionSite | null,
): GibsonPartConfig {
  const leftCut =
    side === 'left'
      ? { ...config.leftCut, enzymeName: site?.enzyme.name ?? null, site }
      : config.leftCut
  const rightCut =
    side === 'right'
      ? { ...config.rightCut, enzymeName: site?.enzyme.name ?? null, site }
      : config.rightCut
  let selectedFragmentId: string | null
  if (config.record && leftCut.site && rightCut.site) {
    const fragments = listDigestFragmentsBetweenCuts(config.record, leftCut.site, rightCut.site)
    selectedFragmentId = defaultDigestFragmentId(
      config.role === 'vector' ? 'vector' : 'insert',
      fragments,
      config.record.sequence.length,
    )
  } else {
    selectedFragmentId = null
  }
  return { ...config, leftCut, rightCut, selectedFragmentId }
}
