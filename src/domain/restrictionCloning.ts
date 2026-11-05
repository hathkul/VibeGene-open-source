import { normalizeConstructProperties } from './constructProperties'
import { defaultDnaEnds, normalizeDnaEnds, type DnaEnds } from './dnaEnds'
import { enzymes } from './enzymes'
import { mergeAbuttingAssemblyFeatures } from './featureMerge'
import { refreshExactPrimerBindings } from './primerSequenceLayout'
import { snapshotParentalHistoryNode } from './snapgeneHistoryExport'
import {
  addOperation,
  complementDnaBase,
  createId,
  nowIso,
  reverseComplement,
  rotateCircularRecord,
  sanitizeDna,
} from './sequence'
import type {
  HistoryFeature,
  HistoryInputSummary,
  HistoryNode,
  HistoryRegeneratedSite,
  Primer,
  PrimerBindingLayout,
  RestrictionEnzyme,
  RestrictionSite,
  SequenceFeature,
  SequenceRecord,
  Topology,
  ConstructProperties,
  DnaEndState,
} from './types'

export type CloningEndTreatment = 'none' | 'fill' | 'remove'

export type CloningDntpBase = 'A' | 'C' | 'G' | 'T'

export type CloningDntpSet = Record<CloningDntpBase, boolean>

export const ALL_CLONING_DNTPS: CloningDntpSet = { A: true, C: true, G: true, T: true }

export const CLONING_DNTP_BASES: CloningDntpBase[] = ['A', 'C', 'G', 'T']

export type CloningCutEnd = {
  enzymeName: string | null
  site: RestrictionSite | null
  treatment: CloningEndTreatment
  fillWith: CloningDntpSet
}

export function defaultCloningDntpSet(): CloningDntpSet {
  return { ...ALL_CLONING_DNTPS }
}

export function cloningDntpLabel(fillWith: CloningDntpSet): string {
  const selected = CLONING_DNTP_BASES.filter((base) => fillWith[base])
  if (selected.length === 4) return 'dNTPs'
  if (selected.length === 0) return 'no dNTPs'
  return selected.map((base) => `d${base}TP`).join(', ')
}

export type CloningDigestFragment = {
  id: string
  label: string
  /** Slice start (0-based), sticky outer bound of the start enzyme. */
  start: number
  /** Slice end (exclusive for non-wrap; wrap prefix end after origin). */
  end: number
  length: number
  wraps: boolean
  /** True when fragment runs leftCut → rightCut. */
  followsLeftToRight: boolean
}

export type CloningPartRole = 'vector' | 'insert'

export type CloningPartConfig = {
  role: CloningPartRole
  record: SequenceRecord | null
  leftCut: CloningCutEnd
  rightCut: CloningCutEnd
  selectedFragmentId: string | null
  orientation: 'forward' | 'reverse'
}

export type EnzymeOverhangInfo = {
  type: 'blunt' | "5'" | "3'"
  sequence: string | null
  length: number
  enzymeName: string
}

export type ResolvedCloningPart = {
  role: CloningPartRole
  name: string
  sequence: string
  length: number
  dnaEnds: DnaEnds
  color: string
  /** Sequence-upstream enzyme (5′ of the stored fragment). */
  upstreamEnzyme: string | null
  /** Sequence-downstream enzyme (3′ of the stored fragment). */
  downstreamEnzyme: string | null
  upstreamOverhang: EnzymeOverhangInfo | null
  downstreamOverhang: EnzymeOverhangInfo | null
  /** Schema left lip = fragment upstream terminus. */
  leftEnzyme: string | null
  /** Schema right lip = fragment downstream terminus. */
  rightEnzyme: string | null
  leftEnzymeLabel: string | null
  rightEnzymeLabel: string | null
  /** Which stored terminus is drawn on the left of the schema card. */
  schemaLeftSide: 'upstream' | 'downstream'
  features: SequenceFeature[]
  primers: Primer[]
  /** Parental construct (for history lineage and origin numbering). */
  source: SequenceRecord
  fragment: CloningDigestFragment
  startSite: RestrictionSite
  endSite: RestrictionSite
  /**
   * Index in `sequence` of the parental coordinate 0, or null when the origin
   * lies outside this fragment (excised arc).
   */
  originOffsetInFragment: number | null
}

export type CloningJunctionIssue = {
  leftLabel: string
  rightLabel: string
  message: string
}

export type CloningValidation = {
  ready: boolean
  closed: boolean
  message: string
  issues: CloningJunctionIssue[]
  productLength: number | null
}

/** Alternate circular products that compete with the configured ligation scheme. */
export type CloningOrientationAmbiguity = {
  /** 0-based indices into the ligation-ordered insert list that can reverse in some product. */
  ambiguousInsertIndexes: number[]
  /** Human labels, e.g. "Insert 1 (blunt ends)". */
  ambiguousInsertLabels: string[]
  /** Closed circular products that include the vector (equal-weight model). */
  variantCount: number
  /** Probability the configured assembly is obtained (1 / variantCount). */
  intendedProbability: number
  /** Vector ends can re-ligate with no insert. */
  includesVectorSelfLigation: boolean
  /** Closed products with exactly one insert (any insert, any orientation). */
  singleInsertVariantCount: number
  /** Closed products that use every configured insert (any order/orientation). */
  fullAssemblyVariantCount: number
  /** Closed products that use a proper non-empty subset of inserts (not singles-only tally). */
  partialAssemblyVariantCount: number
  message: string
}

/** Visual plan for the product schema card (arcs / linear bar with junction gaps). */
export type CloningProductDiagram = {
  layout: 'empty' | 'linear' | 'circular'
  segments: ResolvedCloningPart[]
  /**
   * For circular: one flag per segment for the junction after it (last closes to first).
   * For linear: one flag per gap between consecutive segments (length segments-1).
   */
  junctionSealed: boolean[]
}

export type CloningAssemblyResult = {
  record: SequenceRecord
  validation: CloningValidation
  parts: ResolvedCloningPart[]
  /**
   * Part ranges on the final product (after origin rotation), as half-open spans.
   * A part that wraps the restored origin yields two spans with the same label/color.
   */
  partSpans: Array<{ start: number; end: number; color: string; label: string; role: CloningPartRole }>
}

/**
 * `insert` splices inserts into the cut vector; `delete-fragment` drops the
 * unselected arc and re-ligates the retained fragment onto itself;
 * `destroy-site` linearizes at one site, blunts the overhangs, and re-ligates
 * so the recognition site cannot regenerate; `linear-ligation` joins two or
 * more restriction fragments with no designated vector.
 */
export type CloningAssemblyMode =
  | 'insert'
  | 'delete-fragment'
  | 'destroy-site'
  | 'linear-ligation'

const INSERT_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085']

export function cloningInsertColor(index: number) {
  return INSERT_COLORS[index % INSERT_COLORS.length]!
}

export function defaultCloningPartConfig(role: CloningPartRole, record: SequenceRecord | null): CloningPartConfig {
  return {
    role,
    record,
    leftCut: { enzymeName: null, site: null, treatment: 'none', fillWith: defaultCloningDntpSet() },
    rightCut: { enzymeName: null, site: null, treatment: 'none', fillWith: defaultCloningDntpSet() },
    selectedFragmentId: null,
    orientation: 'forward',
  }
}

/** Sticky polarity of a cut end, or null when blunt / unset. */
export function cutEndOverhangPolarity(cut: CloningCutEnd): "5'" | "3'" | null {
  const type = cut.site?.enzyme.overhang.type
  if (type === "5'" || type === "3'") return type
  return null
}

/**
 * Fill-in and chew-back are bulk reactions: every sticky end of the same polarity
 * on a fragment is a substrate. Two ends that share polarity must share treatment.
 */
export function endsShareOverhangPolarity(left: CloningCutEnd, right: CloningCutEnd): boolean {
  const leftPolarity = cutEndOverhangPolarity(left)
  const rightPolarity = cutEndOverhangPolarity(right)
  return leftPolarity != null && leftPolarity === rightPolarity
}

export function samePolarityTreatmentsConflict(left: CloningCutEnd, right: CloningCutEnd): boolean {
  if (!endsShareOverhangPolarity(left, right)) return false
  if (left.treatment !== right.treatment) return true
  if (left.treatment !== 'fill') return false
  return CLONING_DNTP_BASES.some((base) => left.fillWith[base] !== right.fillWith[base])
}

/**
 * After a site change, keep same-polarity ends on one chemistry. Prefer an active
 * treatment if only one side has one; otherwise keep the left cut's choice.
 */
export function synchronizeSamePolarityTreatments(config: CloningPartConfig): CloningPartConfig {
  if (!endsShareOverhangPolarity(config.leftCut, config.rightCut)) return config
  const left = config.leftCut
  const right = config.rightCut
  let treatment = left.treatment
  let fillWith = left.fillWith
  if (left.treatment === 'none' && right.treatment !== 'none') {
    treatment = right.treatment
    fillWith = right.fillWith
  }
  return {
    ...config,
    leftCut: { ...left, treatment, fillWith: { ...fillWith } },
    rightCut: { ...right, treatment, fillWith: { ...fillWith } },
  }
}

/**
 * Apply overhang treatment to one sidebar cut. When the other cut shares overhang
 * polarity, copy treatment + dNTP mix so fill and remove cannot be mixed.
 */
export function applyCutEndTreatment(
  config: CloningPartConfig,
  side: 'left' | 'right',
  next: CloningCutEnd,
): CloningPartConfig {
  const leftCut = side === 'left' ? next : config.leftCut
  const rightCut = side === 'right' ? next : config.rightCut
  if (!endsShareOverhangPolarity(leftCut, rightCut)) {
    return { ...config, leftCut, rightCut }
  }
  const synced: CloningCutEnd = {
    ...(side === 'left' ? rightCut : leftCut),
    treatment: next.treatment,
    fillWith: { ...next.fillWith },
  }
  return {
    ...config,
    leftCut: side === 'left' ? next : synced,
    rightCut: side === 'right' ? next : synced,
  }
}

function cutPosition(site: RestrictionSite) {
  return Math.min(site.cutTop, site.cutBottom)
}

function enzymeCutLabel(site: RestrictionSite) {
  return `${site.enzyme.name} (${cutPosition(site) + 1})`
}

function isConcreteDna(sequence: string) {
  return sequence.length > 0 && /^[ACGT]+$/i.test(sequence)
}

/** Explicit overhang glyphs for schema previews (ACGT or IUPAC such as R = A/G). */
function isDisplayableOverhangDna(sequence: string) {
  return sequence.length > 0 && /^[ACGTRYSWKMBDHVN]+$/i.test(sequence)
}

function sliceCircularDna(sequence: string, start: number, end: number): string {
  const len = sequence.length
  if (len <= 0 || end === start) return ''
  const lo = ((start % len) + len) % len
  const hi = ((end % len) + len) % len
  if (lo < hi) return sequence.slice(lo, hi)
  return sequence.slice(lo) + sequence.slice(0, hi)
}

/**
 * Prefer real plasmid bases between the cuts over catalog placeholders like NNNN.
 * Enzyme overhang strings from degenerate sites (ArsI, DraIII, …) are not fillable.
 * When the catalog already lists a concrete overhang (BamHI GATC), keep that.
 */
export function preferConcreteOverhangSequence(
  enzymeOverhang: string | null | undefined,
  fromDna: string,
  overhangLength: number,
): string {
  const enzymeOh = (enzymeOverhang ?? '').replace(/\s/g, '').toUpperCase()
  const dnaOh = fromDna.replace(/\s/g, '').toUpperCase()
  const enzymeConcrete = enzymeOh.length === overhangLength && isConcreteDna(enzymeOh)
  const dnaConcrete = dnaOh.length === overhangLength && isConcreteDna(dnaOh)

  if (!enzymeConcrete && dnaConcrete) return dnaOh
  if (enzymeConcrete) return enzymeOh
  if (dnaOh.length === overhangLength) return dnaOh
  if (enzymeOh.length === overhangLength) return enzymeOh
  return dnaOh || enzymeOh
}

function overhangSequenceBetweenCuts(sourceSequence: string, cutTop: number, cutBottom: number) {
  const left = Math.min(cutTop, cutBottom)
  const right = Math.max(cutTop, cutBottom)
  if (right === left) return ''
  return sliceCircularDna(sanitizeDna(sourceSequence), left, right).toUpperCase()
}

function overhangInfo(site: RestrictionSite, sourceSequence?: string): EnzymeOverhangInfo {
  const overhang = site.enzyme.overhang
  const length = overhang.length
  const fromDna = sourceSequence
    ? overhangSequenceBetweenCuts(sourceSequence, site.cutTop, site.cutBottom)
    : ''
  const sequence = preferConcreteOverhangSequence(overhang.sequence, fromDna, length)
  return {
    type: overhang.type,
    sequence: sequence || overhang.sequence,
    length,
    enzymeName: site.enzyme.name,
  }
}

function stripEnzymeDecorators(name: string): string {
  return name.replace(/^<|>$/g, '').trim()
}

function findEnzymeByName(name: string | null | undefined): RestrictionEnzyme | undefined {
  if (!name) return undefined
  const cleaned = stripEnzymeDecorators(name)
  if (!cleaned) return undefined
  return enzymes.find((enzyme) => enzyme.name === cleaned || enzyme.name === name)
}

function endLooksPrepared(end: DnaEndState): boolean {
  if (end.stickiness !== 0) return true
  return Boolean(end.enzymeName && stripEnzymeDecorators(end.enzymeName))
}

/**
 * Linear inserts that already carry sticky (or named blunt) termini can ligate
 * without picking restriction sites on the oligo map.
 */
export function canResolveFromExistingEnds(record: SequenceRecord | null | undefined): boolean {
  if (!record || record.topology !== 'linear') return false
  if (!sanitizeDna(record.sequence)) return false
  const ends = normalizeDnaEnds(record.dnaEnds)
  return endLooksPrepared(ends.upstream) || endLooksPrepared(ends.downstream)
}

function overhangInfoFromDnaEnd(
  sequence: string,
  ends: DnaEnds,
  side: 'upstream' | 'downstream',
): EnzymeOverhangInfo {
  const end = ends[side]
  const enzyme = findEnzymeByName(end.enzymeName)
  const enzymeName = enzyme?.name ?? (stripEnzymeDecorators(end.enzymeName ?? '') || 'end')
  const abs = Math.abs(end.stickiness)

  if (
    enzyme &&
    enzyme.overhang.type !== 'blunt' &&
    enzyme.overhang.length > 0 &&
    (abs === 0 || abs === enzyme.overhang.length)
  ) {
    // Stickiness 0 with a sticky enzyme name usually means the end was filled;
    // only trust the catalog when stickiness still matches the cutter.
    if (abs === enzyme.overhang.length) {
      return {
        type: enzyme.overhang.type,
        sequence: enzyme.overhang.sequence,
        length: enzyme.overhang.length,
        enzymeName,
      }
    }
  }

  if (abs === 0) {
    return {
      type: 'blunt',
      sequence: null,
      length: 0,
      enzymeName,
    }
  }

  const type: "5'" | "3'" = end.stickiness > 0 ? "5'" : "3'"
  const fromDna =
    side === 'upstream'
      ? sanitizeDna(sequence.slice(0, abs)).toUpperCase()
      : sanitizeDna(sequence.slice(Math.max(0, sequence.length - abs))).toUpperCase()

  if (
    enzyme &&
    enzyme.overhang.type === type &&
    enzyme.overhang.length === abs &&
    enzyme.overhang.sequence
  ) {
    return {
      type,
      sequence: preferConcreteOverhangSequence(enzyme.overhang.sequence, fromDna, abs),
      length: abs,
      enzymeName,
    }
  }

  return {
    type,
    sequence: fromDna || null,
    length: abs,
    enzymeName,
  }
}

function syntheticSiteFromDnaEnd(
  sequence: string,
  ends: DnaEnds,
  side: 'upstream' | 'downstream',
): RestrictionSite {
  const end = ends[side]
  const overhang = overhangInfoFromDnaEnd(sequence, ends, side)
  const enzyme =
    findEnzymeByName(end.enzymeName) ??
    ({
      name: overhang.enzymeName,
      notation: overhang.enzymeName,
      recognition: '',
      cutTop: 0,
      cutBottom: overhang.length,
      type: 'II',
      overhang: {
        type: overhang.type,
        sequence: overhang.sequence,
        length: overhang.length,
      },
      manufacturers: [],
      notes: [],
    } satisfies RestrictionEnzyme)

  const abs = Math.abs(end.stickiness) || overhang.length
  const stickiness =
    end.stickiness !== 0
      ? end.stickiness
      : overhang.type === "5'"
        ? abs
        : overhang.type === "3'"
          ? -abs
          : 0

  if (side === 'upstream') {
    return {
      enzyme,
      start: 0,
      end: Math.max(abs, 1),
      match: '',
      cutTop: stickiness >= 0 ? 0 : abs,
      cutBottom: stickiness >= 0 ? abs : 0,
    }
  }

  const len = sequence.length
  return {
    enzyme,
    start: Math.max(0, len - Math.max(abs, 1)),
    end: len,
    match: '',
    cutTop: stickiness >= 0 ? len - abs : len,
    cutBottom: stickiness >= 0 ? len : len - abs,
  }
}

function resolveCloningPartFromExistingEnds(
  config: CloningPartConfig,
  color: string,
): ResolvedCloningPart | null {
  const { record, orientation, role, leftCut, rightCut } = config
  if (!record || !canResolveFromExistingEnds(record)) return null

  let sequence = sanitizeDna(record.sequence)
  if (!sequence) return null
  let ends = normalizeDnaEnds(record.dnaEnds)
  let features = record.features.map((feature) => ({ ...feature, id: createId('feat') }))
  let primers = record.primers.map((primer) => ({ ...primer, id: createId('primer') }))
  let startSite: RestrictionSite
  let endSite: RestrictionSite
  let upstreamOverhang = overhangInfoFromDnaEnd(sequence, ends, 'upstream')
  let downstreamOverhang = overhangInfoFromDnaEnd(sequence, ends, 'downstream')
  let originOffsetInFragment: number | null = 0

  const leftTreated = applyEndTreatment(
    sequence,
    ends,
    leftCut.treatment,
    leftCut.fillWith,
    'left',
    upstreamOverhang.sequence,
  )
  sequence = leftTreated.sequence
  ends = leftTreated.ends
  upstreamOverhang = enzymeOverhangAfterTreatment(
    upstreamOverhang,
    leftCut.treatment,
    leftCut.fillWith,
    'left',
  )

  const rightTreated = applyEndTreatment(
    sequence,
    ends,
    rightCut.treatment,
    rightCut.fillWith,
    'right',
    downstreamOverhang.sequence,
  )
  sequence = rightTreated.sequence
  ends = rightTreated.ends
  downstreamOverhang = enzymeOverhangAfterTreatment(
    downstreamOverhang,
    rightCut.treatment,
    rightCut.fillWith,
    'right',
  )

  // Rebuild synthetic sites after treatments may have changed termini.
  startSite = syntheticSiteFromDnaEnd(sequence, ends, 'upstream')
  endSite = syntheticSiteFromDnaEnd(sequence, ends, 'downstream')

  if (orientation === 'reverse') {
    const reversed = reversePartSequence(sequence, ends)
    sequence = reversed.sequence
    ends = reversed.ends
    features = reverseFeatures(features, sequence.length)
    primers = reversePrimers(primers, sequence.length)
    if (originOffsetInFragment !== null) {
      originOffsetInFragment =
        sequence.length === 0 ? 0 : sequence.length - 1 - originOffsetInFragment
    }
    ;[startSite, endSite] = [endSite, startSite]
    const reversedUpstreamOverhang = reverseOverhang(downstreamOverhang)
    const reversedDownstreamOverhang = reverseOverhang(upstreamOverhang)
    if (reversedUpstreamOverhang) upstreamOverhang = reversedUpstreamOverhang
    if (reversedDownstreamOverhang) downstreamOverhang = reversedDownstreamOverhang
  }

  const fragment: CloningDigestFragment = {
    id: 'existing-ends',
    label: 'Existing ends',
    start: 0,
    end: sequence.length,
    length: sequence.length,
    wraps: false,
    followsLeftToRight: true,
  }

  return {
    role,
    name: record.name,
    sequence: sanitizeDna(sequence),
    length: sequence.length,
    dnaEnds: ends,
    color,
    upstreamEnzyme: startSite.enzyme.name,
    downstreamEnzyme: endSite.enzyme.name,
    upstreamOverhang,
    downstreamOverhang,
    leftEnzyme: startSite.enzyme.name,
    rightEnzyme: endSite.enzyme.name,
    leftEnzymeLabel: `${startSite.enzyme.name} (existing)`,
    rightEnzymeLabel: `${endSite.enzyme.name} (existing)`,
    schemaLeftSide: 'upstream',
    features,
    primers,
    source: record,
    fragment,
    startSite,
    endSite,
    originOffsetInFragment,
  }
}

/**
 * Sticky-aware bounds matching createRecordFromSelection:
 * start at min(cutTop, cutBottom) of the start enzyme, end at max of the end enzyme.
 */
function stickyFragmentBounds(startSite: RestrictionSite, endSite: RestrictionSite) {
  return {
    start: Math.min(startSite.cutTop, startSite.cutBottom),
    end: Math.max(endSite.cutTop, endSite.cutBottom),
    upstreamStickiness: startSite.cutBottom - startSite.cutTop,
    downstreamStickiness: endSite.cutBottom - endSite.cutTop,
  }
}

function sliceFragment(sequence: string, start: number, end: number, wraps: boolean) {
  // Preserve mixed case from the source (sanitize only strips non-DNA).
  // normalizeDna would uppercase and make every ligation product look uniform.
  const cleaned = sanitizeDna(sequence)
  if (!wraps) return cleaned.slice(start, end)
  return cleaned.slice(start) + cleaned.slice(0, end)
}

function clipFeaturesToFragment(
  features: SequenceFeature[],
  fragment: CloningDigestFragment,
  sourceLength: number,
): SequenceFeature[] {
  const locationSpan = (locations: { start: number; end: number }[]) =>
    locations.reduce((sum, location) => sum + Math.max(0, location.end - location.start), 0)

  const result: SequenceFeature[] = []
  for (const feature of features) {
    if (feature.visible === false) continue
    const locations = feature.locations
      .map((location) => {
        if (fragment.wraps) {
          const pieces: { start: number; end: number; strand: typeof location.strand }[] = []
          const overlapTailStart = Math.max(location.start, fragment.start)
          const overlapTailEnd = Math.min(location.end, sourceLength)
          if (overlapTailEnd > overlapTailStart) {
            pieces.push({
              start: overlapTailStart - fragment.start,
              end: overlapTailEnd - fragment.start,
              strand: location.strand,
            })
          }
          const overlapHeadStart = Math.max(location.start, 0)
          const overlapHeadEnd = Math.min(location.end, fragment.end)
          if (overlapHeadEnd > overlapHeadStart) {
            const offset = sourceLength - fragment.start
            pieces.push({
              start: overlapHeadStart + offset,
              end: overlapHeadEnd + offset,
              strand: location.strand,
            })
          }
          return pieces
        }
        const locStart = Math.max(location.start, fragment.start)
        const locEnd = Math.min(location.end, fragment.end)
        if (locEnd <= locStart) return []
        return [
          {
            start: locStart - fragment.start,
            end: locEnd - fragment.start,
            strand: location.strand,
          },
        ]
      })
      .flat()
    if (!locations.length) continue
    // Truncated CDS must not keep translating past the cut into neighboring Product parts.
    const truncated = locationSpan(locations) + 0.5 < locationSpan(feature.locations)
    result.push({
      ...feature,
      id: createId('feat'),
      locations,
      ...(truncated && feature.translateInSequenceView
        ? { translateInSequenceView: false, translation: undefined }
        : {}),
    })
  }
  return result
}

function reverseFeatures(features: SequenceFeature[], length: number): SequenceFeature[] {
  return features.map((feature) => ({
    ...feature,
    id: createId('feat'),
    locations: feature.locations.map((location) => ({
      ...location,
      start: length - location.end,
      end: length - location.start,
      strand: location.strand === 'forward' ? ('reverse' as const) : ('forward' as const),
    })),
  }))
}

function offsetFeatures(features: SequenceFeature[], offset: number): SequenceFeature[] {
  if (offset === 0) return features
  return features.map((feature) => ({
    ...feature,
    id: createId('feat'),
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

function bindingOverlapsFragment(
  binding: PrimerBindingLayout,
  fragment: CloningDigestFragment,
  sourceLength: number,
): boolean {
  const start = Math.min(binding.templateStart, binding.templateEnd)
  const end = Math.max(binding.templateStart, binding.templateEnd)
  if (fragment.wraps) {
    return end > fragment.start || start < fragment.end || (start >= fragment.start && end <= sourceLength)
  }
  return end > fragment.start && start < fragment.end
}

function mapRangeToFragment(
  start: number,
  end: number,
  fragment: CloningDigestFragment,
  sourceLength: number,
): { start: number; end: number } | null {
  if (fragment.wraps) {
    if (start >= fragment.start && end <= sourceLength) {
      return { start: start - fragment.start, end: end - fragment.start }
    }
    if (start >= 0 && end <= fragment.end) {
      const offset = sourceLength - fragment.start
      return { start: start + offset, end: end + offset }
    }
    // Binding spanning the wrap junction is dropped (same as features).
    return null
  }
  if (end <= fragment.start || start >= fragment.end) return null
  return {
    start: Math.max(start, fragment.start) - fragment.start,
    end: Math.min(end, fragment.end) - fragment.start,
  }
}

function clipPrimersToFragment(
  primers: Primer[],
  fragment: CloningDigestFragment,
  sourceLength: number,
): Primer[] {
  const result: Primer[] = []
  for (const primer of primers) {
    if (primer.visible === false) continue
    const bindings = (primer.bindings ?? [])
      .filter((binding) => bindingOverlapsFragment(binding, fragment, sourceLength))
      .flatMap((binding) => {
        const mapped = mapRangeToFragment(
          Math.min(binding.templateStart, binding.templateEnd),
          Math.max(binding.templateStart, binding.templateEnd),
          fragment,
          sourceLength,
        )
        if (!mapped || mapped.end <= mapped.start) return []
        const forward = binding.templateStart <= binding.templateEnd
        return [
          {
            ...binding,
            templateStart: forward ? mapped.start : mapped.end,
            templateEnd: forward ? mapped.end : mapped.start,
            components: binding.components.map((component) => {
              if (component.templateStart === undefined || component.templateEnd === undefined) {
                return { ...component }
              }
              const componentMapped = mapRangeToFragment(
                Math.min(component.templateStart, component.templateEnd),
                Math.max(component.templateStart, component.templateEnd),
                fragment,
                sourceLength,
              )
              if (!componentMapped) {
                return {
                  ...component,
                  templateStart: forward ? mapped.start : mapped.end,
                  templateEnd: forward ? mapped.end : mapped.start,
                }
              }
              return {
                ...component,
                templateStart: forward ? componentMapped.start : componentMapped.end,
                templateEnd: forward ? componentMapped.end : componentMapped.start,
              }
            }),
          },
        ]
      })
    result.push({
      ...primer,
      id: createId('primer'),
      bindings,
    })
  }
  return result
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

function computeOriginOffsetInFragment(
  fragment: CloningDigestFragment,
  sourceLength: number,
): number | null {
  if (sourceLength <= 0) return null
  if (fragment.wraps) {
    // Fragment is [start..L) + [0..end); parental 0 sits at index (L - start).
    if (fragment.start === 0 && fragment.end === 0) return 0 // full-circle linearization
    return fragment.start === 0 ? 0 : sourceLength - fragment.start
  }
  if (fragment.start <= 0 && fragment.end > 0) return 0
  return null
}

function circularArcLength(start: number, end: number, plasmidLength: number) {
  if (end >= start) return end - start
  return plasmidLength - start + end
}

function circularArcWraps(start: number, end: number) {
  return end < start
}

/** Same enzyme cut at the same genomic position (single-site digest). */
export function isSameRestrictionCut(left: RestrictionSite, right: RestrictionSite) {
  return (
    left.enzyme.name === right.enzyme.name &&
    left.start === right.start &&
    left.cutTop === right.cutTop &&
    left.cutBottom === right.cutBottom
  )
}

/** Same strand breaks, including isoschizomers such as ScaI and ScaI-HF. */
export function isSameDnaBreak(left: RestrictionSite, right: RestrictionSite) {
  return Math.min(left.cutTop, left.cutBottom) === Math.min(right.cutTop, right.cutBottom)
    && Math.max(left.cutTop, left.cutBottom) === Math.max(right.cutTop, right.cutBottom)
}

export function listDigestFragmentsBetweenCuts(
  record: SequenceRecord,
  leftSite: RestrictionSite,
  rightSite: RestrictionSite,
): CloningDigestFragment[] {
  const length = record.sequence.length
  const leftLabel = enzymeCutLabel(leftSite)
  const rightLabel = enzymeCutLabel(rightSite)

  // One cut: circular → full linearized molecule; linear → two flanks.
  if (isSameRestrictionCut(leftSite, rightSite)) {
    const cutMin = Math.min(leftSite.cutTop, leftSite.cutBottom)
    const cutMax = Math.max(leftSite.cutTop, leftSite.cutBottom)
    if (record.topology === 'circular') {
      return [
        {
          id: 'linearized',
          label: `${leftLabel} linearized`,
          start: cutMin,
          end: cutMin,
          length,
          wraps: true,
          followsLeftToRight: true,
        },
      ]
    }
    const fragments: CloningDigestFragment[] = []
    if (cutMax > 0) {
      fragments.push({
        id: 'left-flank',
        label: `Start – ${leftLabel}`,
        start: 0,
        end: cutMax,
        length: cutMax,
        wraps: false,
        followsLeftToRight: true,
      })
    }
    if (cutMin < length) {
      fragments.push({
        id: 'right-flank',
        label: `${leftLabel} – End`,
        start: cutMin,
        end: length,
        length: length - cutMin,
        wraps: false,
        followsLeftToRight: true,
      })
    }
    return fragments.filter((fragment) => fragment.length > 0)
  }

  const forwardBounds = stickyFragmentBounds(leftSite, rightSite)
  const reverseBounds = stickyFragmentBounds(rightSite, leftSite)

  if (record.topology === 'linear') {
    const fragments: CloningDigestFragment[] = []
    const leftFlankEnd = Math.max(leftSite.cutTop, leftSite.cutBottom)
    const rightFlankStart = Math.min(rightSite.cutTop, rightSite.cutBottom)
    if (leftFlankEnd > 0) {
      fragments.push({
        id: 'left-flank',
        label: `Start – ${leftLabel}`,
        start: 0,
        end: leftFlankEnd,
        length: leftFlankEnd,
        wraps: false,
        followsLeftToRight: true,
      })
    }
    fragments.push({
      id: 'between',
      label: `${leftLabel} – ${rightLabel}`,
      start: forwardBounds.start,
      end: forwardBounds.end,
      length: Math.max(0, forwardBounds.end - forwardBounds.start),
      wraps: false,
      followsLeftToRight: true,
    })
    if (rightFlankStart < length) {
      fragments.push({
        id: 'right-flank',
        label: `${rightLabel} – End`,
        start: rightFlankStart,
        end: length,
        length: length - rightFlankStart,
        wraps: false,
        followsLeftToRight: true,
      })
    }
    return fragments.filter((fragment) => fragment.length > 0)
  }

  // Both genome-order arcs: left→right and right→left. Either may wrap the origin
  // depending on cut order (Acc65I then BamHI vs BamHI then Acc65I).
  return [
    {
      id: 'forward',
      label: `${leftLabel} – ${rightLabel}`,
      start: forwardBounds.start,
      end: forwardBounds.end,
      length: circularArcLength(forwardBounds.start, forwardBounds.end, length),
      wraps: circularArcWraps(forwardBounds.start, forwardBounds.end),
      followsLeftToRight: true,
    },
    {
      id: 'reverse',
      label: `${rightLabel} – ${leftLabel}`,
      start: reverseBounds.start,
      end: reverseBounds.end,
      length: circularArcLength(reverseBounds.start, reverseBounds.end, length),
      wraps: circularArcWraps(reverseBounds.start, reverseBounds.end),
      followsLeftToRight: false,
    },
  ].filter((fragment) => fragment.length > 0)
}

export function defaultDigestFragmentId(
  role: CloningPartRole,
  fragments: CloningDigestFragment[],
  sourceLength?: number,
): string | null {
  if (!fragments.length) return null
  if (role === 'vector') {
    const plasmidLength =
      sourceLength && sourceLength > 0
        ? sourceLength
        : Math.max(...fragments.map((fragment) => fragment.length), 0)
    return fragments.reduce((best, fragment) => {
      if (fragment.length !== best.length) {
        return fragment.length > best.length ? fragment : best
      }
      // Same length: prefer the arc that carries the parental origin.
      if (plasmidLength <= 0) return best
      const bestHasOrigin = computeOriginOffsetInFragment(best, plasmidLength) !== null
      const fragmentHasOrigin = computeOriginOffsetInFragment(fragment, plasmidLength) !== null
      if (fragmentHasOrigin && !bestHasOrigin) return fragment
      return best
    }).id
  }
  // A two-site digest of a linear insert produces terminal flanks plus the
  // intended internal fragment. Keep that between-sites fragment regardless
  // of its relative length; circular inserts retain the directional arc rule.
  const betweenSites = fragments.find((fragment) => fragment.id === 'between')
  if (betweenSites) return betweenSites.id
  const leftToRight = fragments.find((fragment) => fragment.followsLeftToRight && !fragment.wraps)
  return leftToRight?.id ?? fragments.find((fragment) => fragment.followsLeftToRight)?.id ?? fragments[0]!.id
}

/** Longest first so the major arc is easy to pick for inserts. */
export function sortDigestFragmentsForDisplay(fragments: CloningDigestFragment[]) {
  return [...fragments].sort((left, right) => right.length - left.length || left.id.localeCompare(right.id))
}

export function digestFragmentDisplayLabel(fragment: CloningDigestFragment, plasmidLength: number) {
  const major = fragment.length * 2 >= plasmidLength
  const sizeTag = major ? 'major' : 'minor'
  const pathTag = fragment.wraps ? 'across origin' : 'direct'
  return `${fragment.label} · ${fragment.length.toLocaleString()} bp (${sizeTag}, ${pathTag})`
}

export function fragmentById(fragments: CloningDigestFragment[], id: string | null) {
  if (!id) return null
  return fragments.find((fragment) => fragment.id === id) ?? null
}

export type PartialDigestWarning = {
  partLabel: string
  /** Enzymes among the chosen cuts that appear more than once on the molecule. */
  nonUniqueEnzymes: string[]
  /** Fragments a complete digest with the chosen enzyme set would produce, excluding the intended one. */
  otherFragments: { label: string; length: number }[]
  message: string
}

function siteIdentityKey(site: RestrictionSite) {
  return `${site.enzyme.name}@${site.start}@${site.cutTop}@${site.cutBottom}`
}

/**
 * Fragments from a complete multi-site digest (all given cuts), ordered around the molecule.
 */
export function listCompleteDigestFragments(
  record: SequenceRecord,
  sites: RestrictionSite[],
): CloningDigestFragment[] {
  const length = record.sequence.length
  if (length <= 0 || sites.length === 0) return []

  const uniqueSites = new Map<string, RestrictionSite>()
  for (const site of sites) uniqueSites.set(siteIdentityKey(site), site)
  const ordered = [...uniqueSites.values()].sort(
    (left, right) => cutPosition(left) - cutPosition(right) || left.enzyme.name.localeCompare(right.enzyme.name),
  )

  if (ordered.length === 1) {
    return listDigestFragmentsBetweenCuts(record, ordered[0]!, ordered[0]!)
  }

  const fragments: CloningDigestFragment[] = []
  if (record.topology === 'linear') {
    const first = ordered[0]!
    const firstCut = cutPosition(first)
    if (firstCut > 0) {
      fragments.push({
        id: `flank-start-${siteIdentityKey(first)}`,
        label: `Start – ${enzymeCutLabel(first)}`,
        start: 0,
        end: firstCut,
        length: firstCut,
        wraps: false,
        followsLeftToRight: true,
      })
    }
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const left = ordered[index]!
      const right = ordered[index + 1]!
      const bounds = stickyFragmentBounds(left, right)
      fragments.push({
        id: `seg-${siteIdentityKey(left)}-${siteIdentityKey(right)}`,
        label: `${enzymeCutLabel(left)} – ${enzymeCutLabel(right)}`,
        start: bounds.start,
        end: bounds.end,
        length: Math.max(0, bounds.end - bounds.start),
        wraps: false,
        followsLeftToRight: true,
      })
    }
    const last = ordered[ordered.length - 1]!
    const lastCut = cutPosition(last)
    if (lastCut < length) {
      fragments.push({
        id: `flank-end-${siteIdentityKey(last)}`,
        label: `${enzymeCutLabel(last)} – End`,
        start: lastCut,
        end: length,
        length: length - lastCut,
        wraps: false,
        followsLeftToRight: true,
      })
    }
    return fragments.filter((fragment) => fragment.length > 0)
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const left = ordered[index]!
    const right = ordered[(index + 1) % ordered.length]!
    const bounds = stickyFragmentBounds(left, right)
    const wraps = circularArcWraps(bounds.start, bounds.end)
    const fragLength = circularArcLength(bounds.start, bounds.end, length)
    fragments.push({
      id: `seg-${siteIdentityKey(left)}-${siteIdentityKey(right)}`,
      label: `${enzymeCutLabel(left)} – ${enzymeCutLabel(right)}`,
      start: bounds.start,
      end: bounds.end,
      length: fragLength,
      wraps,
      followsLeftToRight: true,
    })
  }
  return fragments.filter((fragment) => fragment.length > 0)
}

function fragmentMatchesIntended(
  candidate: CloningDigestFragment,
  intended: CloningDigestFragment | null,
): boolean {
  if (!intended) return false
  if (candidate.length !== intended.length) return false
  if (candidate.start === intended.start && candidate.end === intended.end) return true
  // Single-cut linearization uses start===end sentinel.
  if (intended.id === 'linearized' && candidate.length === intended.length) return true
  return false
}

/**
 * Warn when a complete digest with the chosen enzymes would sever the intended
 * fragment (extra cut sites lie on that arc). Extra gel bands outside the
 * intended piece are normal for a full multi-cut digest and are not “partial”.
 *
 * Example that must NOT warn: BamHI at both ends of the kept/deleted piece when
 * those are the only BamHI sites — a full BamHI digest is exactly what you want.
 */
export function analyzePartialDigestWarning(
  partLabel: string,
  config: CloningPartConfig,
  allSitesOnMolecule: RestrictionSite[],
): PartialDigestWarning | null {
  const { record, leftCut, rightCut, selectedFragmentId, role } = config
  if (!record || !leftCut.site || !rightCut.site) return null

  const chosenSites = [leftCut.site, rightCut.site]
  const chosenEnzymeNames = [...new Set(chosenSites.map((site) => site.enzyme.name))]
  const uniqueSitesOnMolecule = [
    ...new Map(allSitesOnMolecule.map((site) => [siteIdentityKey(site), site])).values(),
  ]
  const nonUniqueEnzymes = chosenEnzymeNames.filter(
    (name) => uniqueSitesOnMolecule.filter((site) => site.enzyme.name === name).length > 1,
  )
  if (nonUniqueEnzymes.length === 0) return null

  const digestSites = uniqueSitesOnMolecule.filter((site) => chosenEnzymeNames.includes(site.enzyme.name))
  // Ensure the explicitly chosen sites are included even if the scan list was incomplete.
  for (const site of chosenSites) {
    if (!digestSites.some((entry) => siteIdentityKey(entry) === siteIdentityKey(site))) {
      digestSites.push(site)
    }
  }

  const completeFragments = sortDigestFragmentsForDisplay(
    listCompleteDigestFragments(record, digestSites),
  )
  const intendedFragments = listDigestFragmentsBetweenCuts(record, leftCut.site, rightCut.site)
  const intended =
    fragmentById(intendedFragments, selectedFragmentId) ??
    fragmentById(
      intendedFragments,
      defaultDigestFragmentId(role, intendedFragments, record.sequence.length),
    )
  if (!intended) return null

  // Full digest recovers the intended piece as one band → not a partial digest.
  if (completeFragments.some((fragment) => fragmentMatchesIntended(fragment, intended))) {
    return null
  }

  const otherFragments = completeFragments.map((fragment) => ({
    label: fragment.label,
    length: fragment.length,
  }))

  const enzymeList =
    nonUniqueEnzymes.length === 1
      ? nonUniqueEnzymes[0]!
      : nonUniqueEnzymes.slice(0, -1).join(', ') + ` and ${nonUniqueEnzymes[nonUniqueEnzymes.length - 1]!}`
  const verb = nonUniqueEnzymes.length === 1 ? 'cuts' : 'cut'
  const siteWord =
    nonUniqueEnzymes.length === 1
      ? `${uniqueSitesOnMolecule.filter((site) => site.enzyme.name === nonUniqueEnzymes[0]).length} sites`
      : 'multiple sites'
  const message = `${partLabel}: ${enzymeList} ${verb} at ${siteWord} — a complete digest would cut inside the selected fragment, so recovering it requires a partial digest.`

  return {
    partLabel,
    nonUniqueEnzymes,
    otherFragments,
    message,
  }
}

function overhangSequenceForEnd(
  sequence: string,
  stickiness: number,
  enzymeOverhang: string | null,
): string {
  const abs = Math.abs(stickiness)
  if (abs <= 0) return ''
  // Top-strand encoding of the overhang region at the fragment terminus.
  const fromDna = sequence.slice(0, abs).toUpperCase()
  return preferConcreteOverhangSequence(enzymeOverhang, fromDna, abs)
}

/**
 * How many bases polymerase can add given available dNTPs.
 * `needed5to3` is the order of incorporated bases from the duplex toward the tip.
 */
export function countPartialFillBases(needed5to3: string, fillWith: CloningDntpSet): number {
  let filled = 0
  for (const base of needed5to3.toUpperCase()) {
    if (base !== 'A' && base !== 'C' && base !== 'G' && base !== 'T') break
    if (!fillWith[base]) break
    filled += 1
  }
  return filled
}

export type DntpFillGlyphRole = 'duplex' | 'overhang' | 'filled' | 'empty'

export type DntpFillGlyph = {
  char: string
  role: DntpFillGlyphRole
}

export type DntpFillPreview = {
  enzymeName: string
  overhangType: 'blunt' | "5'" | "3'"
  overhangSequence: string
  /** Bases filled on the left fragment's recessed strand. */
  leftFilled: number
  /** Bases filled on the right fragment's recessed strand. */
  rightFilled: number
  overhangLength: number
  leftTop: DntpFillGlyph[]
  leftBottom: DntpFillGlyph[]
  rightTop: DntpFillGlyph[]
  rightBottom: DntpFillGlyph[]
}

function dntpGlyphs(sequence: string, role: DntpFillGlyphRole): DntpFillGlyph[] {
  return sequence
    .toLowerCase()
    .split('')
    .filter(Boolean)
    .map((char) => ({ char, role }))
}

function dntpEmpty(count: number): DntpFillGlyph[] {
  return Array.from({ length: Math.max(0, count) }, () => ({ char: ' ', role: 'empty' as const }))
}

/**
 * Preview both sides of a restriction cut after partial fill-in with the given dNTP mix.
 * Matches SnapGene's "Choose dNTPs" sticky-end diagram (gray = original, white = filled).
 */
export function buildDntpFillPreview(
  site: RestrictionSite,
  sourceSequence: string,
  fillWith: CloningDntpSet,
  contextBases = 3,
): DntpFillPreview {
  const sequence = sanitizeDna(sourceSequence)
  const enzymeName = site.enzyme.name
  const stickiness = site.cutBottom - site.cutTop
  const overhangLength = Math.abs(stickiness)
  const cutTop = site.cutTop
  const cutBottom = site.cutBottom
  const leftCut = Math.min(cutTop, cutBottom)
  const rightCut = Math.max(cutTop, cutBottom)

  const fromDna = overhangLength > 0 ? sliceCircularDna(sequence, leftCut, rightCut).toUpperCase() : ''
  const overhangSequence = preferConcreteOverhangSequence(
    site.enzyme.overhang.sequence,
    fromDna,
    overhangLength,
  )

  const leftDuplex = sliceCircularDna(sequence, leftCut - contextBases, leftCut).toLowerCase()
  const rightDuplex = sliceCircularDna(sequence, rightCut, rightCut + contextBases).toLowerCase()
  const leftDuplexBottom = complementDna(leftDuplex).toLowerCase()
  const rightDuplexBottom = complementDna(rightDuplex).toLowerCase()

  if (overhangLength === 0 || !overhangSequence) {
    return {
      enzymeName,
      overhangType: 'blunt',
      overhangSequence: '',
      leftFilled: 0,
      rightFilled: 0,
      overhangLength: 0,
      leftTop: [...dntpGlyphs('...', 'duplex'), ...dntpGlyphs(leftDuplex, 'duplex')],
      leftBottom: [...dntpGlyphs('...', 'duplex'), ...dntpGlyphs(leftDuplexBottom, 'duplex')],
      rightTop: [...dntpGlyphs(rightDuplex, 'duplex'), ...dntpGlyphs('...', 'duplex')],
      rightBottom: [...dntpGlyphs(rightDuplexBottom, 'duplex'), ...dntpGlyphs('...', 'duplex')],
    }
  }

  const oh = overhangSequence.toUpperCase()
  const ohComplement = complementDna(oh).toUpperCase()

  if (stickiness > 0) {
    // 5′ overhang: left fills top with `oh`; right fills bottom with complement(`oh`).
    const leftFilled = countPartialFillBases(oh, fillWith)
    const rightFilled = countPartialFillBases(ohComplement, fillWith)
    return {
      enzymeName,
      overhangType: "5'",
      overhangSequence: oh,
      leftFilled,
      rightFilled,
      overhangLength,
      leftTop: [
        ...dntpGlyphs('...', 'duplex'),
        ...dntpGlyphs(leftDuplex, 'duplex'),
        ...dntpGlyphs(oh.slice(0, leftFilled), 'filled'),
        ...dntpEmpty(overhangLength - leftFilled),
      ],
      leftBottom: [
        ...dntpGlyphs('...', 'duplex'),
        ...dntpGlyphs(leftDuplexBottom, 'duplex'),
        ...dntpGlyphs(ohComplement, 'overhang'),
      ],
      rightTop: [
        ...dntpGlyphs(oh, 'overhang'),
        ...dntpGlyphs(rightDuplex, 'duplex'),
        ...dntpGlyphs('...', 'duplex'),
      ],
      rightBottom: [
        ...dntpEmpty(overhangLength - rightFilled),
        ...dntpGlyphs(ohComplement.slice(0, rightFilled), 'filled'),
        ...dntpGlyphs(rightDuplexBottom, 'duplex'),
        ...dntpGlyphs('...', 'duplex'),
      ],
    }
  }

  // 3′ overhang: polymerase fill-in does not extend these ends; show untreated sticky ends.
  const topOh = oh.toLowerCase()
  const bottomOh = reverseDna(oh).toLowerCase()
  return {
    enzymeName,
    overhangType: "3'",
    overhangSequence: oh,
    leftFilled: 0,
    rightFilled: 0,
    overhangLength,
    leftTop: [
      ...dntpGlyphs('...', 'duplex'),
      ...dntpGlyphs(leftDuplex, 'duplex'),
      ...dntpGlyphs(topOh, 'overhang'),
    ],
    leftBottom: [
      ...dntpGlyphs('...', 'duplex'),
      ...dntpGlyphs(leftDuplexBottom, 'duplex'),
      ...dntpEmpty(overhangLength),
    ],
    rightTop: [
      ...dntpEmpty(overhangLength),
      ...dntpGlyphs(rightDuplex, 'duplex'),
      ...dntpGlyphs('...', 'duplex'),
    ],
    rightBottom: [
      ...dntpGlyphs(bottomOh, 'overhang'),
      ...dntpGlyphs(rightDuplexBottom, 'duplex'),
      ...dntpGlyphs('...', 'duplex'),
    ],
  }
}

function enzymeOverhangAfterTreatment(
  info: EnzymeOverhangInfo,
  treatment: CloningEndTreatment,
  fillWith: CloningDntpSet,
  side: 'left' | 'right',
): EnzymeOverhangInfo {
  if (treatment === 'none' || info.type === 'blunt' || info.length <= 0) return info
  if (treatment === 'remove') {
    return { ...info, type: 'blunt', sequence: null, length: 0 }
  }
  // Fill only applies to 5′ overhangs.
  if (info.type !== "5'" || !info.sequence) return info
  const oh = info.sequence.toUpperCase()
  const needed = side === 'left' ? reverseComplement(oh) : oh
  const filled = countPartialFillBases(needed, fillWith)
  if (filled <= 0) return info
  if (filled >= oh.length) return { ...info, type: 'blunt', sequence: null, length: 0 }
  const remaining = side === 'left' ? oh.slice(0, oh.length - filled) : oh.slice(filled)
  return { ...info, type: "5'", sequence: remaining, length: remaining.length }
}

function applyEndTreatment(
  sequence: string,
  ends: DnaEnds,
  treatment: CloningEndTreatment,
  fillWith: CloningDntpSet,
  side: 'left' | 'right',
  enzymeOverhangSequence: string | null,
) {
  const normalized = normalizeDnaEnds(ends)
  const next = {
    upstream: { ...normalized.upstream },
    downstream: { ...normalized.downstream },
  }
  const endKey = side === 'left' ? 'upstream' : 'downstream'
  const endState = next[endKey]
  if (treatment === 'none') return { sequence, ends: next }

  const stickiness = endState.stickiness
  const abs = Math.abs(stickiness)
  if (abs === 0) return { sequence, ends: next }

  if (treatment === 'remove') {
    const trimmed =
      side === 'left' ? sequence.slice(abs) : sequence.slice(0, Math.max(0, sequence.length - abs))
    next[endKey] = { ...endState, stickiness: 0 }
    return { sequence: trimmed, ends: next }
  }

  // Fill-in (partial or complete) only for 5′ overhangs.
  if (treatment !== 'fill' || stickiness <= 0) return { sequence, ends: next }

  const oh =
    side === 'left'
      ? overhangSequenceForEnd(sequence, stickiness, enzymeOverhangSequence)
      : preferConcreteOverhangSequence(
          enzymeOverhangSequence,
          sequence.slice(Math.max(0, sequence.length - abs)).toUpperCase(),
          abs,
        )
  if (!oh || oh.length < abs) return { sequence, ends: next }

  const needed = side === 'left' ? reverseComplement(oh) : oh
  const filled = countPartialFillBases(needed, fillWith)
  if (filled <= 0) return { sequence, ends: next }

  // 5′ fill only changes stickiness: overhang bases are already present in the top strand
  // encoding and become duplex as stickiness shrinks from the duplex side.
  next[endKey] = { ...endState, stickiness: abs - filled }
  return { sequence, ends: next }
}

function extractDigestFragment(
  source: SequenceRecord,
  fragment: CloningDigestFragment,
  leftSite: RestrictionSite,
  rightSite: RestrictionSite,
): {
  sequence: string
  dnaEnds: DnaEnds
  features: SequenceFeature[]
  startSite: RestrictionSite
  endSite: RestrictionSite
} | null {
  const startSite = fragment.followsLeftToRight ? leftSite : rightSite
  const endSite = fragment.followsLeftToRight ? rightSite : leftSite

  // A terminal fragment from a linear molecule has only one restriction-cut end.
  // Preserve the molecule's original outer terminus instead of assigning the
  // selected enzyme to both ends (which can falsely predict circular ligation).
  if (source.topology === 'linear' && fragment.id === 'left-flank') {
    const sequence = sliceFragment(source.sequence, 0, fragment.end, false)
    if (!sequence) return null
    const sourceEnds = normalizeDnaEnds(source.dnaEnds)
    const dnaEnds = normalizeDnaEnds({
      upstream: sourceEnds.upstream,
      downstream: {
        modification: 'fivePrimePhosphorylated',
        stickiness: startSite.cutBottom - startSite.cutTop,
        enzymeName: startSite.enzyme.name,
      },
    })
    return {
      sequence,
      dnaEnds,
      features: clipFeaturesToFragment(source.features, fragment, source.sequence.length),
      startSite: syntheticSiteFromDnaEnd(sequence, dnaEnds, 'upstream'),
      endSite: startSite,
    }
  }

  if (source.topology === 'linear' && fragment.id === 'right-flank') {
    const sequence = sliceFragment(source.sequence, fragment.start, source.sequence.length, false)
    if (!sequence) return null
    const sourceEnds = normalizeDnaEnds(source.dnaEnds)
    const dnaEnds = normalizeDnaEnds({
      upstream: {
        modification: 'fivePrimePhosphorylated',
        stickiness: endSite.cutBottom - endSite.cutTop,
        enzymeName: endSite.enzyme.name,
      },
      downstream: sourceEnds.downstream,
    })
    return {
      sequence,
      dnaEnds,
      features: clipFeaturesToFragment(source.features, fragment, source.sequence.length),
      startSite: endSite,
      endSite: syntheticSiteFromDnaEnd(sequence, dnaEnds, 'downstream'),
    }
  }

  // Single-site circular linearization: full top strand rotated to the cut.
  if (fragment.id === 'linearized' || (fragment.wraps && isSameRestrictionCut(startSite, endSite))) {
    const origin = Math.min(startSite.cutTop, startSite.cutBottom)
    const sequence = sliceFragment(source.sequence, origin, origin, true)
    if (!sequence) return null
    const stickiness = startSite.cutBottom - startSite.cutTop
    const dnaEnds = normalizeDnaEnds({
      upstream: {
        modification: 'fivePrimePhosphorylated',
        stickiness,
        enzymeName: startSite.enzyme.name,
      },
      downstream: {
        modification: 'fivePrimePhosphorylated',
        stickiness,
        enzymeName: startSite.enzyme.name,
      },
    })
    return {
      sequence,
      dnaEnds,
      features: clipFeaturesToFragment(
        source.features,
        { ...fragment, start: origin, end: origin },
        source.sequence.length,
      ),
      startSite,
      endSite: startSite,
    }
  }

  const bounds = stickyFragmentBounds(startSite, endSite)
  const sequence = sliceFragment(source.sequence, bounds.start, bounds.end, fragment.wraps)
  if (!sequence) return null

  const dnaEnds = normalizeDnaEnds({
    upstream: {
      modification: 'fivePrimePhosphorylated',
      stickiness: bounds.upstreamStickiness,
      enzymeName: startSite.enzyme.name,
    },
    downstream: {
      modification: 'fivePrimePhosphorylated',
      stickiness: bounds.downstreamStickiness,
      enzymeName: endSite.enzyme.name,
    },
  })

  return {
    sequence,
    dnaEnds,
    features: clipFeaturesToFragment(
      source.features,
      { ...fragment, start: bounds.start, end: bounds.end },
      source.sequence.length,
    ),
    startSite,
    endSite,
  }
}

function reversePartSequence(sequence: string, ends: DnaEnds) {
  const normalized = normalizeDnaEnds(ends)
  return {
    sequence: reverseComplement(sequence),
    ends: normalizeDnaEnds({
      upstream: normalized.downstream,
      downstream: normalized.upstream,
    }),
  }
}

function reverseOverhang(info: EnzymeOverhangInfo | null): EnzymeOverhangInfo | null {
  if (!info) return null
  if (!info.sequence) return { ...info }
  // After RC + end swap, overhang chemistry stays 5′/3′ but the stored bases flip.
  return {
    ...info,
    sequence: reverseComplement(info.sequence),
  }
}

type ChainTermini = {
  upstreamOverhang: EnzymeOverhangInfo | null
  downstreamOverhang: EnzymeOverhangInfo | null
}

function flippedInsertTermini(part: ResolvedCloningPart): ChainTermini {
  return {
    upstreamOverhang: reverseOverhang(part.downstreamOverhang),
    downstreamOverhang: reverseOverhang(part.upstreamOverhang),
  }
}

function chainJunctionsCompatible(chain: ChainTermini[]): boolean {
  if (chain.length === 0) return false
  for (let index = 0; index < chain.length - 1; index += 1) {
    if (!overhangsCompatible(chain[index]!.downstreamOverhang, chain[index + 1]!.upstreamOverhang)) {
      return false
    }
  }
  const last = chain[chain.length - 1]!
  return overhangsCompatible(last.downstreamOverhang, chain[0]!.upstreamOverhang)
}

function formatOrientationProbability(variantCount: number): string {
  const pct = 100 / variantCount
  const pctText = Number.isInteger(pct) ? `${pct}%` : `≈${Number(pct.toFixed(1))}%`
  return `1 in ${variantCount} (${pctText})`
}

function ambiguityReasonForInsert(part: ResolvedCloningPart): string {
  const up = part.upstreamOverhang
  const down = part.downstreamOverhang
  if (up?.type === 'blunt' && down?.type === 'blunt') return 'blunt ends'
  const upLabel = formatOverhangLabel(up)
  const downLabel = formatOverhangLabel(down)
  if (up && down && up.type === down.type && up.length === down.length) {
    const upSeq = up.sequence?.toUpperCase() ?? ''
    const downSeq = down.sequence?.toUpperCase() ?? ''
    if (
      upSeq &&
      downSeq &&
      (upSeq === downSeq || upSeq === reverseComplement(downSeq))
    ) {
      return 'matching sticky ends'
    }
  }
  return `${upLabel} / ${downLabel}`
}

function terminiForOrientation(part: ResolvedCloningPart, flipped: boolean): ChainTermini {
  return flipped
    ? flippedInsertTermini(part)
    : {
        upstreamOverhang: part.upstreamOverhang,
        downstreamOverhang: part.downstreamOverhang,
      }
}

/** Heap's algorithm — yields every permutation of `items`. */
function* permutationsOf<T>(items: readonly T[]): Generator<T[]> {
  const count = items.length
  if (count === 0) {
    yield []
    return
  }
  const working = items.slice()
  const stack = new Array<number>(count).fill(0)
  yield working.slice()
  let index = 0
  while (index < count) {
    if (stack[index]! < index) {
      const swapWith = index % 2 === 0 ? 0 : stack[index]!
      const tmp = working[swapWith]!
      working[swapWith] = working[index]!
      working[index] = tmp
      yield working.slice()
      stack[index]! += 1
      index = 0
    } else {
      stack[index] = 0
      index += 1
    }
  }
}

function joinList(parts: string[]): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]!
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`
}

/**
 * Enumerate closed circular products that include the vector: self-ligation,
 * every non-empty insert subset, every order of that subset, and every orientation.
 * Assumes each such product is equally likely (combinatorial, not kinetic).
 * Returns null when the configured assembly is the only closed vector-containing product.
 */
export function analyzeCloningOrientationAmbiguity(
  vector: ResolvedCloningPart,
  orderedInserts: ResolvedCloningPart[],
): CloningOrientationAmbiguity | null {
  if (orderedInserts.length === 0) return null

  const n = orderedInserts.length
  // Full subset × permutation × orientation enumeration; cloning UIs stay small.
  if (n > 5) return null

  const vectorTermini: ChainTermini = {
    upstreamOverhang: vector.upstreamOverhang,
    downstreamOverhang: vector.downstreamOverhang,
  }

  const intendedChain: ChainTermini[] = [
    vectorTermini,
    ...orderedInserts.map((part) => terminiForOrientation(part, false)),
  ]
  if (!chainJunctionsCompatible(intendedChain)) return null

  let variantCount = 0
  let includesVectorSelfLigation = false
  let singleInsertVariantCount = 0
  let fullAssemblyVariantCount = 0
  let partialAssemblyVariantCount = 0
  const flippableInSomeProduct = new Set<number>()

  if (chainJunctionsCompatible([vectorTermini])) {
    variantCount += 1
    includesVectorSelfLigation = true
  }

  for (let subsetMask = 1; subsetMask < 1 << n; subsetMask += 1) {
    const members: number[] = []
    for (let index = 0; index < n; index += 1) {
      if (subsetMask & (1 << index)) members.push(index)
    }
    const subsetSize = members.length

    for (const perm of permutationsOf(members)) {
      const orientCount = 1 << subsetSize
      for (let orientMask = 0; orientMask < orientCount; orientMask += 1) {
        const chain: ChainTermini[] = [vectorTermini]
        const flippedInChain: number[] = []
        for (let slot = 0; slot < subsetSize; slot += 1) {
          const insertIndex = perm[slot]!
          const flipped = (orientMask & (1 << slot)) !== 0
          if (flipped) flippedInChain.push(insertIndex)
          chain.push(terminiForOrientation(orderedInserts[insertIndex]!, flipped))
        }
        if (!chainJunctionsCompatible(chain)) continue
        variantCount += 1
        for (const insertIndex of flippedInChain) flippableInSomeProduct.add(insertIndex)
        if (subsetSize === 1) singleInsertVariantCount += 1
        else if (subsetSize === n) fullAssemblyVariantCount += 1
        else partialAssemblyVariantCount += 1
      }
    }
  }

  if (variantCount <= 1) return null

  const ambiguous = new Set<number>(flippableInSomeProduct)
  // Incomplete assemblies (self-ligation / subset paths) compete with every configured insert.
  if (includesVectorSelfLigation || singleInsertVariantCount > 0 || partialAssemblyVariantCount > 0) {
    for (let index = 0; index < n; index += 1) ambiguous.add(index)
  }
  if (ambiguous.size === 0) {
    for (let index = 0; index < n; index += 1) ambiguous.add(index)
  }

  const ambiguousInsertIndexes = [...ambiguous].sort((a, b) => a - b)
  const ambiguousInsertLabels = ambiguousInsertIndexes.map((index) => {
    const part = orderedInserts[index]!
    return `Insert ${index + 1} (${ambiguityReasonForInsert(part)})`
  })

  const intendedProbability = 1 / variantCount
  const factors: string[] = []
  if (includesVectorSelfLigation) factors.push('vector self-ligation')
  if (singleInsertVariantCount > 0) {
    factors.push(
      `${singleInsertVariantCount} single-insert product${singleInsertVariantCount === 1 ? '' : 's'}`,
    )
  }
  if (partialAssemblyVariantCount > 0) {
    factors.push(
      `${partialAssemblyVariantCount} partial multi-insert product${partialAssemblyVariantCount === 1 ? '' : 's'}`,
    )
  }
  if (fullAssemblyVariantCount > 1) {
    factors.push(
      `${fullAssemblyVariantCount} assemblies of all inserts (order/orientation)`,
    )
  } else if (
    fullAssemblyVariantCount === 1 &&
    flippableInSomeProduct.size > 0 &&
    !includesVectorSelfLigation &&
    singleInsertVariantCount === 0 &&
    partialAssemblyVariantCount === 0
  ) {
    factors.push(`${joinList(ambiguousInsertLabels)} in either orientation`)
  }

  const factorText = factors.length > 0 ? ` — including ${joinList(factors)}` : ''
  const message = `This ligation can produce ${variantCount} circular products containing the vector${factorText}. Chance of the configured product: ${formatOrientationProbability(variantCount)}.`

  return {
    ambiguousInsertIndexes,
    ambiguousInsertLabels,
    variantCount,
    intendedProbability,
    includesVectorSelfLigation,
    singleInsertVariantCount,
    fullAssemblyVariantCount,
    partialAssemblyVariantCount,
    message,
  }
}

/** True when two sticky/blunt ends can ligate. */
export function overhangsCompatible(
  left: EnzymeOverhangInfo | null,
  right: EnzymeOverhangInfo | null,
): boolean {
  if (!left || !right) return false
  if (left.type === 'blunt' && right.type === 'blunt') return true
  if (left.type === 'blunt' || right.type === 'blunt') return false
  if (left.type !== right.type) return false
  if (left.length !== right.length) return false
  const leftSeq = left.sequence?.toUpperCase() ?? null
  const rightSeq = right.sequence?.toUpperCase() ?? null
  if (!leftSeq || !rightSeq) return left.length === right.length && left.length > 0
  // Compatible sticky ends: identical overhang (palindromic, same enzyme) or complementary.
  return leftSeq === rightSeq || leftSeq === reverseComplement(rightSeq)
}

/** Human-readable terminus description, e.g. `BamHI 5′ GATC` or `SmaI blunt`. */
export function formatOverhangLabel(info: EnzymeOverhangInfo | null): string {
  if (!info) return 'unknown end'
  const name = info.enzymeName || 'end'
  if (info.type === 'blunt' || info.length <= 0) return `${name} blunt`
  const bases = info.sequence ? ` ${info.sequence.toUpperCase()}` : ` ${info.length} nt`
  return `${name} ${info.type}${bases}`
}

/** Build the product-card layout from configured parts (independent of ready/closed). */
export function buildCloningProductDiagram(
  vector: ResolvedCloningPart | null,
  inserts: ResolvedCloningPart[],
  insertOrder: number[],
): CloningProductDiagram {
  const orderedInserts = insertOrder
    .map((index) => inserts[index])
    .filter((part): part is ResolvedCloningPart => Boolean(part))

  if (!vector && orderedInserts.length === 0) {
    return { layout: 'empty', segments: [], junctionSealed: [] }
  }

  if (!vector) {
    const junctionSealed: boolean[] = []
    for (let index = 0; index < orderedInserts.length - 1; index += 1) {
      const left = orderedInserts[index]!
      const right = orderedInserts[index + 1]!
      junctionSealed.push(overhangsCompatible(left.downstreamOverhang, right.upstreamOverhang))
    }
    const canClose =
      orderedInserts.length >= 2 &&
      junctionSealed.every(Boolean) &&
      overhangsCompatible(
        orderedInserts[orderedInserts.length - 1]!.downstreamOverhang,
        orderedInserts[0]!.upstreamOverhang,
      )
    if (canClose) {
      return {
        layout: 'circular',
        segments: orderedInserts,
        junctionSealed: [...junctionSealed, true],
      }
    }
    return { layout: 'linear', segments: orderedInserts, junctionSealed }
  }

  const segments = [vector, ...orderedInserts]
  const junctionSealed = segments.map((left, index) => {
    const right = segments[(index + 1) % segments.length]!
    return overhangsCompatible(left.downstreamOverhang, right.upstreamOverhang)
  })
  return { layout: 'circular', segments, junctionSealed }
}

export function resolveCloningPart(
  config: CloningPartConfig,
  color: string,
): ResolvedCloningPart | null {
  const { record, leftCut, rightCut, selectedFragmentId, orientation, role } = config
  if (!record) return null

  // Pre-cut linear oligos: use existing sticky ends when no enzymes are chosen.
  if (!leftCut.site || !rightCut.site) {
    return resolveCloningPartFromExistingEnds(config, color)
  }

  const fragments = listDigestFragmentsBetweenCuts(record, leftCut.site, rightCut.site)
  const fragment =
    fragmentById(fragments, selectedFragmentId) ??
    fragmentById(fragments, defaultDigestFragmentId(role, fragments, record.sequence.length))
  if (!fragment) return null

  const extracted = extractDigestFragment(record, fragment, leftCut.site, rightCut.site)
  if (!extracted) return null

  let sequence = extracted.sequence
  let ends = extracted.dnaEnds
  let features = extracted.features
  let primers = clipPrimersToFragment(record.primers, fragment, record.sequence.length)
  let startSite = extracted.startSite
  let endSite = extracted.endSite
  const hasNaturalUpstream = record.topology === 'linear' && fragment.id === 'left-flank'
  const hasNaturalDownstream = record.topology === 'linear' && fragment.id === 'right-flank'
  let upstreamOverhang = hasNaturalUpstream
    ? overhangInfoFromDnaEnd(sequence, ends, 'upstream')
    : overhangInfo(startSite, record.sequence)
  let downstreamOverhang = hasNaturalDownstream
    ? overhangInfoFromDnaEnd(sequence, ends, 'downstream')
    : overhangInfo(endSite, record.sequence)
  let originOffsetInFragment = computeOriginOffsetInFragment(fragment, record.sequence.length)

  // Treatments are configured per sidebar cut (5′ / 3′ enzyme). Map them onto the
  // fragment's geometric upstream/downstream ends (reversed for the minor arc).
  const upstreamCut = hasNaturalDownstream
    ? rightCut
    : fragment.followsLeftToRight
      ? leftCut
      : rightCut
  const downstreamCut = hasNaturalUpstream
    ? leftCut
    : fragment.followsLeftToRight
      ? rightCut
      : leftCut

  const leftTreated = hasNaturalUpstream ? { sequence, ends } : applyEndTreatment(
    sequence,
    ends,
    upstreamCut.treatment,
    upstreamCut.fillWith,
    'left',
    upstreamOverhang.sequence,
  )
  sequence = leftTreated.sequence
  ends = leftTreated.ends
  if (!hasNaturalUpstream) {
    upstreamOverhang = enzymeOverhangAfterTreatment(
      upstreamOverhang,
      upstreamCut.treatment,
      upstreamCut.fillWith,
      'left',
    )
  }

  const rightTreated = hasNaturalDownstream ? { sequence, ends } : applyEndTreatment(
    sequence,
    ends,
    downstreamCut.treatment,
    downstreamCut.fillWith,
    'right',
    downstreamOverhang.sequence,
  )
  sequence = rightTreated.sequence
  ends = rightTreated.ends
  if (!hasNaturalDownstream) {
    downstreamOverhang = enzymeOverhangAfterTreatment(
      downstreamOverhang,
      downstreamCut.treatment,
      downstreamCut.fillWith,
      'right',
    )
  }

  if (orientation === 'reverse') {
    const reversed = reversePartSequence(sequence, ends)
    sequence = reversed.sequence
    ends = reversed.ends
    features = reverseFeatures(features, sequence.length)
    primers = reversePrimers(primers, sequence.length)
    if (originOffsetInFragment !== null) {
      originOffsetInFragment =
        sequence.length === 0 ? 0 : sequence.length - 1 - originOffsetInFragment
    }
    ;[startSite, endSite] = [endSite, startSite]
    const reversedUpstreamOverhang = reverseOverhang(downstreamOverhang)
    const reversedDownstreamOverhang = reverseOverhang(upstreamOverhang)
    if (reversedUpstreamOverhang) upstreamOverhang = reversedUpstreamOverhang
    if (reversedDownstreamOverhang) downstreamOverhang = reversedDownstreamOverhang
  }

  // Schema lips follow the selected fragment walk (S1→S2 or S2→S1). Do not reorient
  // vector to the sidebar cut order — both arcs share the same cuts but opposite directions.

  return {
    role,
    name: record.name,
    sequence: sanitizeDna(sequence),
    length: sequence.length,
    dnaEnds: ends,
    color,
    upstreamEnzyme: startSite.enzyme.name,
    downstreamEnzyme: endSite.enzyme.name,
    upstreamOverhang,
    downstreamOverhang,
    leftEnzyme: startSite.enzyme.name,
    rightEnzyme: endSite.enzyme.name,
    leftEnzymeLabel: enzymeCutLabel(startSite),
    rightEnzymeLabel: enzymeCutLabel(endSite),
    schemaLeftSide: 'upstream',
    features,
    primers,
    source: record,
    fragment,
    startSite,
    endSite,
    originOffsetInFragment,
  }
}

export function validateCloningAssembly(
  vector: ResolvedCloningPart | null,
  inserts: Array<ResolvedCloningPart | null>,
  insertOrder: number[],
): CloningValidation {
  if (!vector) {
    return {
      ready: false,
      closed: false,
      message: 'Choose vector source and restriction cuts.',
      issues: [],
      productLength: null,
    }
  }

  const ordered = insertOrder
    .map((index) => inserts[index])
    .filter((part): part is ResolvedCloningPart => Boolean(part))

  if (insertOrder.length !== inserts.length || ordered.length !== inserts.length || ordered.some((part) => !part)) {
    return {
      ready: false,
      closed: false,
      message: 'Configure all inserts before cloning.',
      issues: [],
      productLength: null,
    }
  }

  const chain = [vector, ...ordered]
  const issues: CloningJunctionIssue[] = []
  function partLabel(part: ResolvedCloningPart) {
    if (part.role === 'vector') return 'Vector'
    const ends = [part.leftEnzyme, part.rightEnzyme].filter(Boolean).join('→')
    return ends ? `${part.name} (${ends})` : part.name
  }
  for (let index = 0; index < chain.length - 1; index += 1) {
    const left = chain[index]!
    const right = chain[index + 1]!
    if (!overhangsCompatible(left.downstreamOverhang, right.upstreamOverhang)) {
      issues.push({
        leftLabel: partLabel(left),
        rightLabel: partLabel(right),
        message: `Sticky ends are not compatible (${left.downstreamEnzyme ?? '?'} / ${right.upstreamEnzyme ?? '?'}).`,
      })
    }
  }

  const last = chain[chain.length - 1]!
  const canClose = overhangsCompatible(last.downstreamOverhang, vector.upstreamOverhang)
  if (!canClose) {
    issues.push({
      leftLabel: partLabel(last),
      rightLabel: 'Vector',
      message: `Product ends do not close (${last.downstreamEnzyme ?? '?'} / ${vector.upstreamEnzyme ?? '?'}).`,
    })
  }

  // Closed loop only when every junction (including return to vector) is compatible.
  const closed = issues.length === 0 && canClose

  // Product length: sum of unique interiors. Overhang bases are shared at junctions;
  // approximate as sum of fragment lengths minus overhang lengths at each sealed junction.
  let productLength = chain.reduce((sum, part) => sum + part.length, 0)
  for (let index = 0; index < chain.length - 1; index += 1) {
    const left = chain[index]!
    const right = chain[index + 1]!
    if (overhangsCompatible(left.downstreamOverhang, right.upstreamOverhang)) {
      productLength -= left.downstreamOverhang?.length ?? 0
    }
  }
  if (canClose) {
    productLength -= last.downstreamOverhang?.length ?? 0
  }

  const ready = issues.length === 0
  return {
    ready,
    closed,
    message: ready
      ? `Ready to clone. Product: ${productLength.toLocaleString()} bp.`
      : issues[0]?.message ?? 'Cloning is not valid.',
    issues,
    productLength,
  }
}

/**
 * Linear ligation: join two or more restriction fragments in order. Consecutive
 * ends must match. Closing the terminal ends is optional — when they match the
 * product is circular; otherwise it stays linear and is still clonable.
 */
export function validateLinearLigation(
  fragments: Array<ResolvedCloningPart | null>,
  fragmentOrder: number[],
): CloningValidation {
  const ordered = fragmentOrder
    .map((index) => fragments[index])
    .filter((part): part is ResolvedCloningPart => Boolean(part))

  if (fragmentOrder.length !== fragments.length || ordered.length !== fragments.length) {
    return {
      ready: false,
      closed: false,
      message: 'Configure all fragments before ligation.',
      issues: [],
      productLength: null,
    }
  }

  if (ordered.length < 2) {
    return {
      ready: false,
      closed: false,
      message: 'Add at least two restriction fragments to ligate.',
      issues: [],
      productLength: null,
    }
  }

  function partLabel(part: ResolvedCloningPart, index: number) {
    const ends = [part.leftEnzyme, part.rightEnzyme].filter(Boolean).join('→')
    return ends ? `Fragment ${index + 1} (${ends})` : `Fragment ${index + 1}`
  }

  const issues: CloningJunctionIssue[] = []
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = ordered[index]!
    const right = ordered[index + 1]!
    if (!overhangsCompatible(left.downstreamOverhang, right.upstreamOverhang)) {
      issues.push({
        leftLabel: partLabel(left, index),
        rightLabel: partLabel(right, index + 1),
        message: `Sticky ends are not compatible (${left.downstreamEnzyme ?? '?'} / ${right.upstreamEnzyme ?? '?'}).`,
      })
    }
  }

  const first = ordered[0]!
  const last = ordered[ordered.length - 1]!
  const canClose = overhangsCompatible(last.downstreamOverhang, first.upstreamOverhang)

  let productLength = ordered.reduce((sum, part) => sum + part.length, 0)
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = ordered[index]!
    const right = ordered[index + 1]!
    if (overhangsCompatible(left.downstreamOverhang, right.upstreamOverhang)) {
      productLength -= left.downstreamOverhang?.length ?? 0
    }
  }
  if (canClose) {
    productLength -= last.downstreamOverhang?.length ?? 0
  }

  const ready = issues.length === 0
  const closed = ready && canClose
  return {
    ready,
    closed,
    message: ready
      ? closed
        ? `Ready to ligate. Circular product: ${productLength.toLocaleString()} bp.`
        : `Ready to ligate. Linear product: ${productLength.toLocaleString()} bp.`
      : issues[0]?.message ?? 'Ligation is not valid.',
    issues,
    productLength,
  }
}

/**
 * Deletion has no insert: the retained fragment must self-ligate, so the only
 * junction to check is its own downstream end against its own upstream end.
 */
export function validateFragmentDeletion(
  vector: ResolvedCloningPart | null,
  config?: CloningPartConfig | null,
): CloningValidation {
  if (!vector) {
    return {
      ready: false,
      closed: false,
      message: 'Choose a construct and two restriction cuts.',
      issues: [],
      productLength: null,
    }
  }

  if (config && samePolarityTreatmentsConflict(config.leftCut, config.rightCut)) {
    const polarity = cutEndOverhangPolarity(config.leftCut)
    const polarityLabel = polarity === "5'" ? '5′' : polarity === "3'" ? '3′' : 'sticky'
    const issue: CloningJunctionIssue = {
      leftLabel: formatOverhangLabel(vector.upstreamOverhang),
      rightLabel: formatOverhangLabel(vector.downstreamOverhang),
      message: `Cannot fill one ${polarityLabel} overhang and remove the other on the same fragment — fill-in and chew-back each act on every ${polarityLabel} end. Choose one treatment for both ends.`,
    }
    return {
      ready: false,
      closed: false,
      message: issue.message,
      issues: [issue],
      productLength: vector.length,
    }
  }

  const left = vector.downstreamOverhang
  const right = vector.upstreamOverhang
  const compatible = overhangsCompatible(left, right)
  const productLength = vector.length - (compatible ? left?.length ?? 0 : 0)

  if (!compatible) {
    // Polymerase only fills 5′ recesses, so 3′ overhangs must be chewed back instead.
    const advice =
      left?.type === "3'" || right?.type === "3'"
        ? 'Remove both overhangs to blunt them (3′ overhangs cannot be filled in).'
        : 'Fill in or remove both overhangs to blunt them (same treatment on both ends).'
    const issue: CloningJunctionIssue = {
      leftLabel: formatOverhangLabel(left),
      rightLabel: formatOverhangLabel(right),
      message: `Fragment ends do not ligate: ${formatOverhangLabel(left)} vs ${formatOverhangLabel(right)}. ${advice}`,
    }
    return {
      ready: false,
      closed: false,
      message: issue.message,
      issues: [issue],
      productLength,
    }
  }

  const deleted = Math.max(0, vector.source.sequence.length - productLength)
  const blunt = left?.type === 'blunt'
  const chemistry = blunt ? 'blunt ends ligate' : 'sticky ends match'
  return {
    ready: true,
    closed: true,
    message: `${formatOverhangLabel(left)} / ${formatOverhangLabel(right)} — ${chemistry}. Product: ${productLength.toLocaleString()} bp circular, ${deleted.toLocaleString()} bp removed.`,
    issues: [],
    productLength,
  }
}

/**
 * Destroying a restriction site: cut once, blunt both termini (fill or remove),
 * then re-ligate. Untreated sticky ends would regenerate the site; blunt cutters
 * cannot be destroyed by fill/remove alone.
 */
export function validateSiteDestruction(
  vector: ResolvedCloningPart | null,
  config?: CloningPartConfig | null,
): CloningValidation {
  if (!vector) {
    return {
      ready: false,
      closed: false,
      message: 'Choose a construct and one restriction site.',
      issues: [],
      productLength: null,
    }
  }

  if (!isSameRestrictionCut(vector.startSite, vector.endSite)) {
    const issue: CloningJunctionIssue = {
      leftLabel: vector.leftEnzymeLabel ?? 'left',
      rightLabel: vector.rightEnzymeLabel ?? 'right',
      message: 'Destroy site uses a single cut. Select the same enzyme site for both ends (or pick one site on the map).',
    }
    return {
      ready: false,
      closed: false,
      message: issue.message,
      issues: [issue],
      productLength: vector.length,
    }
  }

  if (vector.source.topology !== 'circular') {
    const issue: CloningJunctionIssue = {
      leftLabel: vector.leftEnzymeLabel ?? 'site',
      rightLabel: vector.rightEnzymeLabel ?? 'site',
      message: 'Destroy site re-ligates a circular plasmid. Open a circular construct.',
    }
    return {
      ready: false,
      closed: false,
      message: issue.message,
      issues: [issue],
      productLength: vector.length,
    }
  }

  const enzymeName = vector.startSite.enzyme.name
  const nativeOverhang = overhangInfo(vector.startSite, vector.source.sequence)
  if (nativeOverhang.type === 'blunt' || nativeOverhang.length <= 0) {
    const issue: CloningJunctionIssue = {
      leftLabel: formatOverhangLabel(nativeOverhang),
      rightLabel: formatOverhangLabel(nativeOverhang),
      message: `${enzymeName} is blunt; re-ligation regenerates the site. Fill/remove cannot destroy blunt cutters.`,
    }
    return {
      ready: false,
      closed: false,
      message: issue.message,
      issues: [issue],
      productLength: vector.length,
    }
  }

  const leftTreatment = config?.leftCut.treatment ?? null
  const rightTreatment = config?.rightCut.treatment ?? null
  if (leftTreatment === 'none' || rightTreatment === 'none') {
    const advice =
      nativeOverhang.type === "3'"
        ? 'Remove the overhangs on both ends (3′ overhangs cannot be filled in).'
        : 'Fill in or remove the overhangs on both ends to blunt them.'
    const issue: CloningJunctionIssue = {
      leftLabel: formatOverhangLabel(vector.upstreamOverhang),
      rightLabel: formatOverhangLabel(vector.downstreamOverhang),
      message: `Untreated ${enzymeName} ends will regenerate the site on ligation. ${advice}`,
    }
    return {
      ready: false,
      closed: false,
      message: issue.message,
      issues: [issue],
      productLength: vector.length,
    }
  }

  const left = vector.downstreamOverhang
  const right = vector.upstreamOverhang
  if (left?.type !== 'blunt' || right?.type !== 'blunt') {
    const advice =
      nativeOverhang.type === "3'"
        ? 'Remove the overhangs completely (3′ overhangs cannot be filled in).'
        : leftTreatment === 'fill' || rightTreatment === 'fill'
          ? 'Fill with all dNTPs (or remove overhangs) so both ends are blunt.'
          : 'Fill in or remove the overhangs so both ends are blunt.'
    const issue: CloningJunctionIssue = {
      leftLabel: formatOverhangLabel(left),
      rightLabel: formatOverhangLabel(right),
      message: `${enzymeName} ends are not fully blunted (${formatOverhangLabel(left)} / ${formatOverhangLabel(right)}). ${advice}`,
    }
    return {
      ready: false,
      closed: false,
      message: issue.message,
      issues: [issue],
      productLength: vector.length,
    }
  }

  if (!overhangsCompatible(left, right)) {
    const issue: CloningJunctionIssue = {
      leftLabel: formatOverhangLabel(left),
      rightLabel: formatOverhangLabel(right),
      message: `Fragment ends do not ligate after treatment: ${formatOverhangLabel(left)} vs ${formatOverhangLabel(right)}.`,
    }
    return {
      ready: false,
      closed: false,
      message: issue.message,
      issues: [issue],
      productLength: vector.length,
    }
  }

  const productLength = vector.length
  const delta = vector.source.sequence.length - productLength
  const usedRemove = leftTreatment === 'remove' || rightTreatment === 'remove'
  const usedFill = leftTreatment === 'fill' || rightTreatment === 'fill'
  const treatmentLabel = usedRemove
    ? 'overhangs removed'
    : usedFill
      ? 'overhangs filled in'
      : delta < 0
        ? 'overhangs removed'
        : 'overhangs filled in'
  const lengthNote =
    delta === 0
      ? `Product: ${productLength.toLocaleString()} bp circular.`
      : `Product: ${productLength.toLocaleString()} bp circular (${Math.abs(delta).toLocaleString()} bp ${delta > 0 ? 'removed' : 'added'}).`
  return {
    ready: true,
    closed: true,
    message: `${enzymeName} destroyed (${treatmentLabel}). ${lengthNote}`,
    issues: [],
    productLength,
  }
}

function historyName(record: SequenceRecord) {
  return record.name.toLowerCase().endsWith('.dna') ? record.name : `${record.name}.dna`
}

function parentalHistoryNode(record: SequenceRecord): HistoryNode {
  return snapshotParentalHistoryNode(record)
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

function buildCloningHistory(input: {
  productName: string
  productSequence: string
  circular: boolean
  operation: string
  vector: ResolvedCloningPart | null
  inserts: ResolvedCloningPart[]
  primers: Primer[]
  features: SequenceFeature[]
  regeneratedSites: HistoryRegeneratedSite[]
}): HistoryNode {
  const {
    productName,
    productSequence,
    circular,
    operation,
    vector,
    inserts,
    primers,
    features,
    regeneratedSites,
  } = input

  const inputSummaries: HistoryInputSummary[] = vector
    ? [
        {
          manipulation: 'replace',
          name1: vector.endSite.enzyme.name,
          val1: String(cutPosition(vector.endSite) + 1),
          name2: vector.startSite.enzyme.name,
          val2: String(cutPosition(vector.startSite) + 1),
          siteCount1: '1',
          siteCount2: '1',
        },
        ...inserts.map((part) => ({
          manipulation: 'insert' as const,
          name1: part.startSite.enzyme.name,
          val1: String(cutPosition(part.startSite) + 1),
          name2: part.endSite.enzyme.name,
          val2: String(cutPosition(part.endSite) + 1),
          siteCount1: '1',
          siteCount2: '1',
        })),
      ]
    : inserts.map((part) => ({
        manipulation: 'insert' as const,
        name1: part.startSite.enzyme.name,
        val1: String(cutPosition(part.startSite) + 1),
        name2: part.endSite.enzyme.name,
        val2: String(cutPosition(part.endSite) + 1),
        siteCount1: '1',
        siteCount2: '1',
      }))

  return {
    id: createId('history'),
    name: historyName({ name: productName } as SequenceRecord),
    seqLen: productSequence.length,
    circular,
    operation,
    resurrectable: false,
    hideHistory: false,
    oligos: [],
    regeneratedSites,
    inputSummaries,
    features: historyFeaturesFromProduct(features),
    sequence: productSequence,
    primers,
    children: [
      ...(vector ? [parentalHistoryNode(vector.source)] : []),
      ...inserts.map((part) => parentalHistoryNode(part.source)),
    ],
  }
}

function junctionTrimLength(
  left: ResolvedCloningPart,
  right: ResolvedCloningPart | undefined,
  seal: boolean,
) {
  if (!seal || !right) return 0
  if (!overhangsCompatible(left.downstreamOverhang, right.upstreamOverhang)) return 0
  return left.downstreamOverhang?.length ?? 0
}

export function assembleRestrictionCloningProduct(input: {
  vector?: ResolvedCloningPart | null
  inserts: ResolvedCloningPart[]
  insertOrder: number[]
  productName: string
  mode?: CloningAssemblyMode
  /** Overrides applied on top of the vector (or first fragment) parent's construct properties. */
  constructOverrides?: Partial<ConstructProperties>
}): CloningAssemblyResult {
  const { inserts, insertOrder, productName } = input
  const mode = input.mode ?? 'insert'
  const ligating = mode === 'linear-ligation'
  const deleting = mode === 'delete-fragment' || mode === 'destroy-site'
  const destroying = mode === 'destroy-site'
  const vector = ligating ? null : input.vector ?? null

  if (!ligating && !vector) {
    const validation: CloningValidation = {
      ready: false,
      closed: false,
      message: 'Choose vector source and restriction cuts.',
      issues: [],
      productLength: null,
    }
    return {
      record: {
        id: createId('seq'),
        name: 'Invalid',
        description: '',
        molecule: 'dna',
        topology: 'linear',
        sequence: '',
        features: [],
        primers: [],
        operations: [],
        construct: normalizeConstructProperties({}),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      validation,
      parts: [],
      partSpans: [],
    }
  }

  const ordered = deleting
    ? []
    : insertOrder
        .map((index) => inserts[index])
        .filter((part): part is ResolvedCloningPart => Boolean(part))

  const validation = destroying
    ? validateSiteDestruction(vector!)
    : mode === 'delete-fragment'
      ? validateFragmentDeletion(vector!)
      : ligating
        ? validateLinearLigation(inserts, insertOrder)
        : validateCloningAssembly(vector!, inserts, insertOrder)

  const parts = ligating ? ordered : [vector!, ...ordered]
  const closed = validation.closed
  const constructSource = ligating ? ordered[0]?.source : vector!.source

  // Join sequences, trimming the downstream overhang of each left part so sticky
  // bases are not duplicated (they are already present at the right part's start).
  let productSequence = ''
  const partUsedLengths: number[] = []
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!
    const next = parts[(index + 1) % parts.length]
    const seal = index < parts.length - 1 || closed
    const trim = junctionTrimLength(part, next, seal)
    const chunk = trim > 0 ? part.sequence.slice(0, -trim) : part.sequence
    partUsedLengths.push(chunk.length)
    productSequence += chunk
  }
  productSequence = sanitizeDna(productSequence)

  let cursor = 0
  const features: SequenceFeature[] = []
  const primers: Primer[] = []
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!
    const usedLength = partUsedLengths[index]!
    features.push(
      ...offsetFeatures(
        part.features
          .map((feature) => ({
            ...feature,
            locations: feature.locations
              .map((location) => ({
                ...location,
                start: Math.min(location.start, usedLength),
                end: Math.min(location.end, usedLength),
              }))
              .filter((location) => location.end > location.start),
          }))
          .filter((feature) => feature.locations.length > 0),
        cursor,
      ),
    )
    primers.push(
      ...offsetPrimers(
        part.primers
          .map((primer) => ({
            ...primer,
            bindings: primer.bindings
              ?.map((binding) => ({
                ...binding,
                templateStart: Math.min(binding.templateStart, usedLength),
                templateEnd: Math.min(binding.templateEnd, usedLength),
                components: binding.components.map((component) => ({
                  ...component,
                  templateStart:
                    component.templateStart === undefined
                      ? undefined
                      : Math.min(component.templateStart, usedLength),
                  templateEnd:
                    component.templateEnd === undefined
                      ? undefined
                      : Math.min(component.templateEnd, usedLength),
                })),
              }))
              .filter((binding) => binding.templateStart !== binding.templateEnd),
          }))
          .filter((primer) => (primer.bindings?.length ?? 0) > 0 || !primer.bindings),
        cursor,
      ),
    )
    cursor += usedLength
  }

  // Keep primers that have no bindings (unmapped) from parents as sequence-only entries.
  for (const part of parts) {
    for (const primer of part.primers) {
      if (primer.bindings && primer.bindings.length > 0) continue
      if (primers.some((existing) => existing.name === primer.name && existing.sequence === primer.sequence)) {
        continue
      }
      primers.push({ ...primer, id: createId('primer'), bindings: [] })
    }
  }

  let record: SequenceRecord = {
    id: createId('seq'),
    name:
      productName.replace(/\.dna$/i, '') ||
      (destroying ? 'DestroyedSite' : deleting ? 'Deleted' : ligating ? 'Ligated' : 'Cloned'),
    description: destroying
      ? 'Restriction site destruction'
      : deleting
        ? 'Restriction fragment deletion'
        : ligating
          ? 'Linear ligation product'
          : 'Restriction cloning product',
    molecule: 'dna',
    topology: closed ? 'circular' : 'linear',
    sequence: productSequence,
    features,
    primers,
    operations: [],
    dnaEnds: closed
      ? undefined
      : normalizeDnaEnds({
          upstream: parts[0]?.dnaEnds.upstream ?? defaultDnaEnds().upstream,
          downstream:
            parts[parts.length - 1]?.dnaEnds.downstream ?? defaultDnaEnds().downstream,
        }),
    construct: normalizeConstructProperties({
      ...(constructSource?.construct ?? {}),
      syntheticDna: true,
      ...input.constructOverrides,
    }),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  // Restore the vector parent's origin so numbering matches the parental plasmid.
  let originInProduct: number | null = null
  if (!ligating && vector && closed && vector.originOffsetInFragment !== null) {
    const vectorUsed = partUsedLengths[0]!
    originInProduct = Math.min(vector.originOffsetInFragment, Math.max(0, vectorUsed - 1))
  } else if (!ligating && vector && closed && vector.fragment.wraps === false && ordered.length > 0) {
    // Origin lay on the excised arc (kept fragment excludes origin). Put product
    // origin at the cassette index that replaced parental coordinate 0.
    const sourceLen = vector.source.sequence.length
    const keptStart = vector.fragment.start
    const keptEnd = vector.fragment.end
    const excisedLen = Math.max(1, sourceLen - (keptEnd - keptStart))
    const originWalkIndex = (sourceLen - keptEnd) % sourceLen
    const cassetteLen = Math.max(0, productSequence.length - partUsedLengths[0]!)
    originInProduct =
      partUsedLengths[0]! +
      Math.min(cassetteLen, Math.floor((originWalkIndex * cassetteLen) / excisedLen))
  }

  if (closed && originInProduct !== null && originInProduct > 0) {
    record = rotateCircularRecord(record, originInProduct)
  }

  record = {
    ...record,
    features: mergeAbuttingAssemblyFeatures(record.features, {
      circular: closed,
      sequenceLength: record.sequence.length,
    }),
    primers: refreshExactPrimerBindings(record.primers, record.sequence).filter(
      (primer) => (primer.bindings?.length ?? 0) > 0,
    ),
  }

  const productLengthFinal = record.sequence.length
  const originShift =
    closed && originInProduct !== null && originInProduct > 0 ? originInProduct : 0

  function mapPartRange(rawStart: number, rawEnd: number): Array<{ start: number; end: number }> {
    if (productLengthFinal <= 0 || rawEnd <= rawStart) return []
    if (!originShift) return [{ start: rawStart, end: rawEnd }]
    const o = originShift
    const L = productLengthFinal
    if (rawStart < o && o < rawEnd) {
      return [
        { start: (rawStart - o + L) % L, end: L },
        { start: 0, end: rawEnd - o },
      ].filter((span) => span.end > span.start)
    }
    const start = (rawStart - o + L) % L
    const end = rawEnd >= L ? (L - o) % L === 0 ? L : L - o : (rawEnd - o + L) % L
    return end > start ? [{ start, end }] : []
  }

  const partSpans: CloningAssemblyResult['partSpans'] = []
  {
    let rawCursor = 0
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!
      const used = partUsedLengths[index]!
      const label =
        part.role === 'vector' ? 'Vector' : ligating ? `Fragment ${index + 1}` : 'Insert'
      for (const span of mapPartRange(rawCursor, rawCursor + used)) {
        partSpans.push({
          start: span.start,
          end: span.end,
          color: part.color,
          label,
          role: part.role,
        })
      }
      rawCursor += used
    }
  }

  const regeneratedSites: HistoryRegeneratedSite[] = []
  // Destroyed sites are intentionally not regenerated; skip them in history.
  if (closed && !destroying) {
    // Junction positions after origin rotation: end of each part in product coordinates.
    let junctionCursor = 0
    for (let index = 0; index < parts.length; index += 1) {
      junctionCursor += partUsedLengths[index]!
      const site = parts[(index + 1) % parts.length]!.startSite
      const pos =
        originInProduct && originInProduct > 0
          ? (junctionCursor - originInProduct + record.sequence.length) % record.sequence.length
          : junctionCursor % record.sequence.length
      regeneratedSites.push({
        name: site.enzyme.name,
        pos,
        siteCount: 1,
        blunt: site.enzyme.overhang.type === 'blunt',
      })
    }
  }

  const history = buildCloningHistory({
    productName: record.name,
    productSequence: record.sequence,
    circular: closed,
    operation: destroying
      ? 'destroySite'
      : mode === 'delete-fragment'
        ? 'deleteFragment'
        : ligating
          ? 'ligateFragments'
          : ordered.length > 1
            ? 'insertFragments'
            : 'insertFragment',
    vector,
    inserts: ordered,
    primers: record.primers,
    features: record.features,
    regeneratedSites,
  })
  record = {
    ...record,
    history,
  }

  record = addOperation(
    record,
    destroying
      ? 'destroy-restriction-site'
      : mode === 'delete-fragment'
        ? 'delete-restriction-fragment'
        : ligating
          ? 'linear-ligation'
          : 'restriction-cloning',
    validation.message,
  )

  return {
    record,
    validation,
    parts,
    partSpans,
  }
}

function complementDna(sequence: string) {
  return sequence
    .split('')
    .map((base) => complementDnaBase(base.toUpperCase()))
    .join('')
}

function reverseDna(sequence: string) {
  return sequence.split('').reverse().join('')
}

/**
 * Duplex preview of a sticky/blunt terminus for schema cards.
 *
 * Top line is 5′→3′ left-to-right; bottom is 3′→5′ left-to-right (same spatial columns).
 * For a BamHI right end that means `...g` / `...cctag`, not `...gatc` on the bottom.
 */
export function formatStickyEndPreview(
  sequence: string,
  ends: DnaEnds,
  side: 'upstream' | 'downstream',
  contextBases = 6,
  /** Prefer enzyme overhang bases when sequence termini are ambiguous (e.g. single-cut linearization). */
  overhangSequence?: string | null,
): { top: string; bottom: string } {
  const normalized = normalizeDnaEnds(ends)
  const stickiness = normalized[side].stickiness
  const abs = Math.abs(stickiness)
  const enzymeOh = overhangSequence?.replace(/\s/g, '').toUpperCase() ?? ''
  // Prefer an explicit overhang glyph when provided (BamHI GATC, or IUPAC R = A/G).
  const useEnzymeOh = abs > 0 && enzymeOh.length === abs && isDisplayableOverhangDna(enzymeOh)

  if (side === 'upstream') {
    const slicedOh = abs > 0 ? sequence.slice(0, abs) : ''
    // Top-strand 5′→3′ encoding of the overhang (e.g. BamHI GATC).
    const overhang5to3 = (useEnzymeOh ? enzymeOh : slicedOh).toLowerCase()
    const duplexStart = abs
    const ctx = Math.min(contextBases, Math.max(0, sequence.length - duplexStart))
    const duplex = sequence.slice(duplexStart, duplexStart + ctx).toLowerCase()
    const bottomDuplex = complementDna(duplex).toLowerCase()
    if (stickiness === 0) {
      return {
        top: ctx ? `${duplex}...` : '...',
        bottom: ctx ? `${bottomDuplex}...` : '...',
      }
    }
    if (stickiness > 0) {
      // 5′ overhang on top
      return {
        top: `${overhang5to3}${duplex}...`,
        bottom: `${' '.repeat(overhang5to3.length)}${bottomDuplex}...`,
      }
    }
    // Bottom bases are the complement of the top-strand sequence at the same
    // spatial positions. Keep that left-to-right alignment in the preview.
    const bottomOverhang = complementDna(overhang5to3).toLowerCase()
    return {
      top: `${' '.repeat(bottomOverhang.length)}${duplex}...`,
      bottom: `${bottomOverhang}${bottomDuplex}...`,
    }
  }

  const slicedOh = abs > 0 ? sequence.slice(Math.max(0, sequence.length - abs)) : ''
  const overhang5to3 = (useEnzymeOh ? enzymeOh : slicedOh).toLowerCase()
  const duplexEnd = Math.max(0, sequence.length - abs)
  const ctx = Math.min(contextBases, duplexEnd)
  const duplex = sequence.slice(Math.max(0, duplexEnd - ctx), duplexEnd).toLowerCase()
  const bottomDuplex = complementDna(duplex).toLowerCase()
  if (stickiness === 0) {
    return {
      top: ctx ? `...${duplex}` : '...',
      bottom: ctx ? `...${bottomDuplex}` : '...',
    }
  }
  if (stickiness > 0) {
    // 5′ overhang on bottom: display its complementary bases in the same
    // spatial columns as the top-strand sequence (e.g. GCAT → CGTA).
    const bottomOverhang = complementDna(overhang5to3).toLowerCase()
    return {
      top: `...${duplex}`,
      bottom: `...${bottomDuplex}${bottomOverhang}`,
    }
  }
  // 3′ overhang on top
  return {
    top: `...${duplex}${overhang5to3}`,
    bottom: `...${bottomDuplex}`,
  }
}

export function formatTopologyLabel(topology: Topology) {
  return topology === 'circular' ? 'circular' : 'linear'
}
