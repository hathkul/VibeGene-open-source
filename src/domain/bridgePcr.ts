import { calculateAnnealTemperature } from './primerThermodynamics'
import {
  createPcrProductRecord,
  designPcrPrimerPair,
  type PcrAmplicon,
  type PcrPolymeraseMode,
  type PcrPrimerInput,
} from './pcr'
import { defaultConstructProperties } from './constructProperties'
import { defaultDnaEnds } from './dnaEnds'
import { snapshotParentalHistoryNode } from './snapgeneHistoryExport'
import { addOperation, createId, normalizeDna, nowIso, reverseComplement } from './sequence'
import { mergeIdenticalPrimers } from './primerNames'
import { readingFrameFromTranslationAnchor, readingFramePreservingAminoAcids } from './cdsTranslationFrame'
import type { HistoryNode, Primer, SequenceFeature, SequenceRecord } from './types'

const MIN_OVERLAP_BP = 15
/** Cap only for Primd Tm probe length; overlap detection itself is uncapped. */
const OVERLAP_TM_PROBE_BP = 60

export type BridgeFragmentProduct = {
  /** 0-based fragment tab index */
  index: number
  sequence: string
  sourceName: string
  productSize: number
  amplicon: PcrAmplicon
  template: SequenceRecord
  forwardPrimer: PcrPrimerInput
  reversePrimer: PcrPrimerInput
  polymerase: PcrPolymeraseMode
}

export type BridgeJunction = {
  leftIndex: number
  rightIndex: number
  overlapLength: number
  overlapSequence: string
  tmC: number | null
}

export type BridgeFusionResult = {
  ready: boolean
  message: string
  /** Oriented fragment sequences in left→right fusion order (may be a partial chain). */
  ordered: Array<{
    originalIndex: number
    orientation: 'forward' | 'reverse'
    sequence: string
    sourceName: string
    productSize: number
    color: string
  }>
  fusedSequence: string
  productSize: number
  junctions: BridgeJunction[]
  /** 0-based fragment tab indices not included in `ordered`. */
  unfusedIndices: number[]
}

export const BRIDGE_FRAGMENT_COLORS = ['#c44d4d', '#3b6fd8', '#2f9e6b', '#c47a2d', '#7a4fc4', '#2a9d8f']

function emptyFusion(message: string, unfusedIndices: number[] = []): BridgeFusionResult {
  return {
    ready: false,
    message,
    ordered: [],
    fusedSequence: '',
    productSize: 0,
    junctions: [],
    unfusedIndices,
  }
}

function fragmentLabel(index: number) {
  return `Fragment ${index + 1}`
}

function formatUnfusedList(indices: number[]) {
  if (!indices.length) return ''
  if (indices.length === 1) return fragmentLabel(indices[0]!)
  if (indices.length === 2) return `${fragmentLabel(indices[0]!)} and ${fragmentLabel(indices[1]!)}`
  const head = indices.slice(0, -1).map(fragmentLabel).join(', ')
  return `${head}, and ${fragmentLabel(indices[indices.length - 1]!)}`
}

function annotateFusionCompleteness(
  result: Omit<BridgeFusionResult, 'unfusedIndices' | 'ready' | 'message'> & {
    ready?: boolean
    message?: string
  },
  allFragmentIndices: number[],
): BridgeFusionResult {
  const fused = new Set(result.ordered.map((part) => part.originalIndex))
  const unfusedIndices = [...new Set(allFragmentIndices)]
    .filter((index) => !fused.has(index))
    .sort((left, right) => left - right)
  const chainReady = result.ordered.length >= 2 && Boolean(result.fusedSequence)
  const complete = chainReady && unfusedIndices.length === 0
  const chainLabel = result.ordered.map((part) => fragmentLabel(part.originalIndex)).join(' → ')
  let message = result.message ?? ''
  if (complete) {
    message = 'Ready for overlap extension PCR'
  } else if (chainReady) {
    message = `Partial fusion: ${chainLabel}. ${formatUnfusedList(unfusedIndices)} ${
      unfusedIndices.length === 1 ? 'is' : 'are'
    } not fused.`
  } else if (!message) {
    message = 'Configure overlapping PCR fragments to build a fused template.'
  }
  return {
    ...result,
    ready: complete,
    message,
    unfusedIndices,
  }
}

function fragmentColor(index: number) {
  return BRIDGE_FRAGMENT_COLORS[index % BRIDGE_FRAGMENT_COLORS.length]!
}

function overlapTm(overlapSequence: string): number | null {
  const probe =
    overlapSequence.length > OVERLAP_TM_PROBE_BP
      ? overlapSequence.slice(0, OVERLAP_TM_PROBE_BP)
      : overlapSequence
  const result = calculateAnnealTemperature(probe)
  return result.tmC ?? result.tmMinC
}

export type SequenceMergeJunction = {
  overlapLength: number
  overlapSequence: string
  /** Keep left[0..leftKeep) then append right[rightFrom..] */
  leftKeep: number
  rightFrom: number
  /** How terminal the overlap is (0 = perfect SOE ends). */
  terminalWaste: number
}

/** Longest suffix(left) === prefix(right) overlap (uncapped). */
export function longestEndOverlap(left: string, right: string): number {
  const a = normalizeDna(left)
  const b = normalizeDna(right)
  const max = Math.min(a.length, b.length)
  // Quick reject: if even MIN doesn't match, still scan — but start from max.
  for (let length = max; length >= MIN_OVERLAP_BP; length -= 1) {
    if (a.slice(-length) === b.slice(0, length)) return length
  }
  return 0
}

/**
 * Longest common substring with positions in both strings.
 * O(n·m) time, O(m) memory — fine for typical PCR products.
 */
export function longestCommonSubstring(
  left: string,
  right: string,
): { length: number; posA: number; posB: number; sequence: string } | null {
  const a = normalizeDna(left)
  const b = normalizeDna(right)
  if (!a || !b) return null

  let bestLen = 0
  let bestEndA = 0
  let bestEndB = 0
  let prev = new Int32Array(b.length + 1)

  for (let i = 1; i <= a.length; i += 1) {
    const curr = new Int32Array(b.length + 1)
    const ai = a[i - 1]
    for (let j = 1; j <= b.length; j += 1) {
      if (ai === b[j - 1]) {
        const len = prev[j - 1]! + 1
        curr[j] = len
        if (len > bestLen) {
          bestLen = len
          bestEndA = i
          bestEndB = j
        }
      }
    }
    prev = curr
  }

  if (bestLen < MIN_OVERLAP_BP) return null
  const posA = bestEndA - bestLen
  const posB = bestEndB - bestLen
  return {
    length: bestLen,
    posA,
    posB,
    sequence: a.slice(posA, posA + bestLen),
  }
}

/**
 * Best way to join left→right by shared sequence.
 * Prefers true end-overlap (SOE), otherwise uses the longest common substring
 * (PCR products often share internal template sequence behind primer flanks).
 */
export function findBestSequenceJunction(left: string, right: string): SequenceMergeJunction | null {
  const a = normalizeDna(left)
  const b = normalizeDna(right)
  if (a.length < MIN_OVERLAP_BP || b.length < MIN_OVERLAP_BP) return null

  const endLen = longestEndOverlap(a, b)
  let best: SequenceMergeJunction | null = endLen >= MIN_OVERLAP_BP
    ? {
        overlapLength: endLen,
        overlapSequence: a.slice(-endLen),
        leftKeep: a.length,
        rightFrom: endLen,
        terminalWaste: 0,
      }
    : null

  const lcs = longestCommonSubstring(a, b)
  if (lcs) {
    const terminalWaste = a.length - (lcs.posA + lcs.length) + lcs.posB
    const candidate: SequenceMergeJunction = {
      overlapLength: lcs.length,
      overlapSequence: lcs.sequence,
      leftKeep: lcs.posA + lcs.length,
      rightFrom: lcs.posB + lcs.length,
      terminalWaste,
    }
    // Prefer longer overlap; for equal length prefer more terminal (SOE-like) junctions.
    if (
      !best ||
      candidate.overlapLength > best.overlapLength ||
      (candidate.overlapLength === best.overlapLength && candidate.terminalWaste < best.terminalWaste)
    ) {
      best = candidate
    }
  }

  return best
}

function mergeByJunction(left: string, right: string, junction: SequenceMergeJunction) {
  return left.slice(0, junction.leftKeep) + right.slice(junction.rightFrom)
}

type Pairing = {
  leftIndex: number
  rightIndex: number
  leftOrientation: 'forward' | 'reverse'
  rightOrientation: 'forward' | 'reverse'
  leftSequence: string
  rightSequence: string
  junction: SequenceMergeJunction
  score: number
}

function orientedSequence(sequence: string, orientation: 'forward' | 'reverse') {
  const normalized = normalizeDna(sequence)
  return orientation === 'forward' ? normalized : reverseComplement(normalized)
}

function scoreJunction(
  junction: SequenceMergeJunction,
  leftOrientation: 'forward' | 'reverse',
  rightOrientation: 'forward' | 'reverse',
  options?: {
    sameTemplate?: boolean
    leftOriginalIndex?: number
    rightOriginalIndex?: number
  },
) {
  const tm = overlapTm(junction.overlapSequence) ?? 0
  const reversePenalty = (leftOrientation === 'reverse' ? 1 : 0) + (rightOrientation === 'reverse' ? 1 : 0)
  // Terminal waste must dominate tab-order tie-breaks: a backwards SOE pair can have
  // hundreds of bp of waste while still sharing the mutagenic primer overlap.
  let score =
    junction.overlapLength * 1000 -
    junction.terminalWaste * 500 -
    Math.abs(tm - 60) -
    reversePenalty * 0.25

  // Same-template SOE should keep parental orientation; tab order is only a weak tie-breaker.
  if (options?.sameTemplate) {
    if (leftOrientation === 'forward') score += 1_000_000
    if (rightOrientation === 'forward') score += 1_000_000
    if (
      options.leftOriginalIndex !== undefined &&
      options.rightOriginalIndex !== undefined &&
      options.leftOriginalIndex < options.rightOriginalIndex
    ) {
      score += 50
    }
  } else {
    score -= reversePenalty * 50
  }
  return score
}

/** Reject internal LCS hits that are not SOE-like end overlaps. */
function isTerminalEnough(junction: SequenceMergeJunction, maxWaste = 80) {
  return junction.terminalWaste <= maxWaste
}

function productsShareTemplate(products: BridgeFragmentProduct[]) {
  if (products.length < 2) return false
  const firstId = products[0]!.template.id
  const firstSeq = normalizeDna(products[0]!.template.sequence)
  return products.every(
    (product) => product.template.id === firstId || normalizeDna(product.template.sequence) === firstSeq,
  )
}

function bestPairing(products: BridgeFragmentProduct[]): Pairing | null {
  const sameTemplate = productsShareTemplate(products)
  let best: Pairing | null = null
  for (let i = 0; i < products.length; i += 1) {
    for (let j = 0; j < products.length; j += 1) {
      if (i === j) continue
      for (const leftOrientation of ['forward', 'reverse'] as const) {
        for (const rightOrientation of ['forward', 'reverse'] as const) {
          const leftSequence = orientedSequence(products[i]!.sequence, leftOrientation)
          const rightSequence = orientedSequence(products[j]!.sequence, rightOrientation)
          const junction = findBestSequenceJunction(leftSequence, rightSequence)
          if (!junction || !isTerminalEnough(junction)) continue
          const candidate: Pairing = {
            leftIndex: i,
            rightIndex: j,
            leftOrientation,
            rightOrientation,
            leftSequence,
            rightSequence,
            junction,
            score: scoreJunction(junction, leftOrientation, rightOrientation, {
              sameTemplate,
              leftOriginalIndex: products[i]!.index,
              rightOriginalIndex: products[j]!.index,
            }),
          }
          if (!best || candidate.score > best.score) best = candidate
        }
      }
    }
  }
  return best
}

type ChainNode = {
  originalIndex: number
  orientation: 'forward' | 'reverse'
  sequence: string
}

function finalizeFusionChain(
  chain: ChainNode[],
  byIndex: Map<number, BridgeFragmentProduct>,
): Omit<BridgeFusionResult, 'unfusedIndices' | 'ready' | 'message'> & { ready: boolean; message: string } {
  const junctions: BridgeJunction[] = []
  let fusedSequence = chain[0]!.sequence
  for (let i = 1; i < chain.length; i += 1) {
    const left = chain[i - 1]!
    const right = chain[i]!
    const live = findBestSequenceJunction(fusedSequence, right.sequence)
    if (!live || !isTerminalEnough(live)) {
      return {
        ready: false,
        message: 'Lost overlap while building the fused template.',
        ordered: [],
        fusedSequence: '',
        productSize: 0,
        junctions: [],
      }
    }
    junctions.push({
      leftIndex: left.originalIndex,
      rightIndex: right.originalIndex,
      overlapLength: live.overlapLength,
      overlapSequence: live.overlapSequence,
      tmC: overlapTm(live.overlapSequence),
    })
    fusedSequence = mergeByJunction(fusedSequence, right.sequence, live)
  }

  return {
    ready: true,
    message: 'Ready for overlap extension PCR',
    ordered: chain.map((node) => {
      const product = byIndex.get(node.originalIndex)!
      return {
        originalIndex: node.originalIndex,
        orientation: node.orientation,
        sequence: node.sequence,
        sourceName: product.sourceName,
        productSize: product.productSize,
        color: fragmentColor(node.originalIndex),
      }
    }),
    fusedSequence,
    productSize: fusedSequence.length,
    junctions,
  }
}

/** Longest contiguous Fragment-tab run with forward SOE-like overlaps (1→2→…). */
function findBestIndexedForwardRun(products: BridgeFragmentProduct[]): ChainNode[] | null {
  const sorted = [...products].sort((left, right) => left.index - right.index)
  if (sorted.length < 2) return null

  // Primer-sized unique tails only — larger “tails” are almost always an internal LCS false hit.
  const maxFlank = 40
  const canLink: boolean[] = []
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const leftSeq = normalizeDna(sorted[i]!.sequence)
    const rightSeq = normalizeDna(sorted[i + 1]!.sequence)
    const junction = findBestSequenceJunction(leftSeq, rightSeq)
    if (!junction) {
      canLink.push(false)
      continue
    }
    const leftTail = leftSeq.length - junction.leftKeep
    const rightHead = junction.rightFrom - junction.overlapLength
    canLink.push(leftTail <= maxFlank && rightHead <= maxFlank)
  }

  let bestStart = -1
  let bestEnd = -1
  let index = 0
  while (index < canLink.length) {
    if (!canLink[index]) {
      index += 1
      continue
    }
    const start = index
    while (index < canLink.length && canLink[index]) index += 1
    const end = index + 1
    if (bestStart < 0 || end - start > bestEnd - bestStart) {
      bestStart = start
      bestEnd = end
    }
  }
  if (bestStart < 0) return null

  return sorted.slice(bestStart, bestEnd).map((product) => ({
    originalIndex: product.index,
    orientation: 'forward' as const,
    sequence: normalizeDna(product.sequence),
  }))
}

function fusionCandidateRank(result: BridgeFusionResult) {
  // Prefer a complete chain, then more fragments, then longer product.
  return (result.ready ? 1_000_000_000 : 0) + result.ordered.length * 1_000_000 + result.productSize
}

function pickBestFusion(candidates: BridgeFusionResult[], fallbackMessage: string, allFragmentIndices: number[]) {
  const usable = candidates.filter((candidate) => candidate.ordered.length >= 2 && candidate.fusedSequence)
  if (!usable.length) return emptyFusion(fallbackMessage, allFragmentIndices)
  usable.sort((left, right) => fusionCandidateRank(right) - fusionCandidateRank(left))
  return usable[0]!
}

function buildGreedyFusionChain(
  valid: BridgeFragmentProduct[],
  byIndex: Map<number, BridgeFragmentProduct>,
): Omit<BridgeFusionResult, 'unfusedIndices' | 'ready' | 'message'> & { ready: boolean; message: string } | null {
  const firstPair = bestPairing(valid)
  if (!firstPair) return null

  const sameTemplate = productsShareTemplate(valid)
  const used = new Set<number>([firstPair.leftIndex, firstPair.rightIndex])
  const chain: ChainNode[] = [
    {
      originalIndex: valid[firstPair.leftIndex]!.index,
      orientation: firstPair.leftOrientation,
      sequence: firstPair.leftSequence,
    },
    {
      originalIndex: valid[firstPair.rightIndex]!.index,
      orientation: firstPair.rightOrientation,
      sequence: firstPair.rightSequence,
    },
  ]

  while (used.size < valid.length) {
    let next: {
      attach: 'left' | 'right'
      node: ChainNode
      score: number
    } | null = null
    for (let i = 0; i < valid.length; i += 1) {
      if (used.has(i)) continue
      const product = valid[i]!
      for (const orientation of ['forward', 'reverse'] as const) {
        const sequence = orientedSequence(product.sequence, orientation)
        const leftJunction = findBestSequenceJunction(sequence, chain[0]!.sequence)
        if (leftJunction && isTerminalEnough(leftJunction)) {
          const score = scoreJunction(leftJunction, orientation, chain[0]!.orientation, {
            sameTemplate,
            leftOriginalIndex: product.index,
            rightOriginalIndex: chain[0]!.originalIndex,
          })
          if (!next || score > next.score) {
            next = {
              attach: 'left',
              node: { originalIndex: product.index, orientation, sequence },
              score,
            }
          }
        }
        const rightJunction = findBestSequenceJunction(chain[chain.length - 1]!.sequence, sequence)
        if (rightJunction && isTerminalEnough(rightJunction)) {
          const score = scoreJunction(rightJunction, chain[chain.length - 1]!.orientation, orientation, {
            sameTemplate,
            leftOriginalIndex: chain[chain.length - 1]!.originalIndex,
            rightOriginalIndex: product.index,
          })
          if (!next || score > next.score) {
            next = {
              attach: 'right',
              node: { originalIndex: product.index, orientation, sequence },
              score,
            }
          }
        }
      }
    }
    if (!next) break
    const productIndex = valid.findIndex((product) => product.index === next!.node.originalIndex)
    used.add(productIndex)
    if (next.attach === 'left') chain.unshift(next.node)
    else chain.push(next.node)
  }

  if (chain.length < 2) return null
  const finalized = finalizeFusionChain(chain, byIndex)
  return finalized.fusedSequence ? finalized : null
}

/**
 * Arrange fragment PCR products into a linear fusion by shared overlap.
 * Supports 2+ fragments; prefers Fragment-tab order + forward orientation when possible.
 * When only a subset overlaps, returns that partial chain with unfused indices called out.
 */
export function resolveBridgeFusion(
  products: BridgeFragmentProduct[],
  options?: { allFragmentIndices?: number[] },
): BridgeFusionResult {
  const valid = products.filter((product) => normalizeDna(product.sequence).length >= MIN_OVERLAP_BP)
  const allFragmentIndices =
    options?.allFragmentIndices?.length
      ? [...options.allFragmentIndices]
      : valid.map((product) => product.index)

  if (valid.length < 2) {
    return emptyFusion('Configure at least two overlapping PCR fragments.', allFragmentIndices)
  }

  const byIndex = new Map(valid.map((product) => [product.index, product]))
  const candidates: BridgeFusionResult[] = []

  const indexedRun = findBestIndexedForwardRun(valid)
  if (indexedRun && indexedRun.length >= 2) {
    const finalized = finalizeFusionChain(indexedRun, byIndex)
    if (finalized.fusedSequence) {
      candidates.push(annotateFusionCompleteness(finalized, allFragmentIndices))
    }
  }

  const greedy = buildGreedyFusionChain(valid, byIndex)
  if (greedy) {
    candidates.push(annotateFusionCompleteness(greedy, allFragmentIndices))
  }

  return pickBestFusion(
    candidates,
    'No shared overlap (≥15 bp) found between fragment products.',
    allFragmentIndices,
  )
}

export function designExternalBridgePrimers(
  fusedSequence: string,
  desiredTm: number,
  namePrefix = 'Bridge',
): { forward: PcrPrimerInput; reverse: PcrPrimerInput } {
  const sequence = normalizeDna(fusedSequence)
  const stub: SequenceRecord = {
    id: 'bridge-stub',
    name: namePrefix,
    description: '',
    molecule: 'dna',
    topology: 'linear',
    sequence,
    features: [],
    primers: [],
    operations: [],
    construct: { ...defaultConstructProperties },
    dnaEnds: defaultDnaEnds(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  return designPcrPrimerPair(stub, 0, sequence.length, desiredTm)
}

function partOffsetInFusion(fusion: BridgeFusionResult, orderIndex: number) {
  let start = 0
  for (let i = 0; i < orderIndex; i += 1) {
    const prev = fusion.ordered[i]!
    const junction = fusion.junctions[i]
    start += prev.sequence.length - (junction?.overlapLength ?? 0)
  }
  return start
}

function mapIntervalToOrientation(
  start: number,
  end: number,
  length: number,
  orientation: 'forward' | 'reverse',
) {
  if (orientation === 'forward') return { start, end }
  return { start: length - end, end: length - start }
}

function shiftFeatureToFusion(
  feature: SequenceFeature,
  productLength: number,
  orientation: 'forward' | 'reverse',
  offset: number,
  idPrefix: string,
): SequenceFeature {
  const mappedAnchor = feature.sourceTranslationAnchor === undefined
    ? undefined
    : mapIntervalToOrientation(feature.sourceTranslationAnchor, feature.sourceTranslationAnchor + 1, productLength, orientation).start + offset
  return {
    ...feature,
    id: `${idPrefix}-${feature.id}`,
    sourceTranslationAnchor: mappedAnchor,
    locations: feature.locations.map((location) => {
      const mapped = mapIntervalToOrientation(location.start, location.end, productLength, orientation)
      const strand =
        orientation === 'reverse'
          ? location.strand === 'forward'
            ? 'reverse'
            : location.strand === 'reverse'
              ? 'forward'
              : location.strand
          : location.strand
      return {
        ...location,
        start: mapped.start + offset,
        end: mapped.end + offset,
        strand,
      }
    }),
  }
}

function shiftPrimerToFusion(
  primer: Primer,
  productLength: number,
  orientation: 'forward' | 'reverse',
  offset: number,
  idPrefix: string,
): Primer {
  const bindings = (primer.bindings ?? []).map((binding) => {
    const mapped = mapIntervalToOrientation(binding.templateStart, binding.templateEnd, productLength, orientation)
    const strand =
      orientation === 'reverse'
        ? binding.strand === 'forward'
          ? 'reverse'
          : 'forward'
        : binding.strand
    return {
      ...binding,
      strand,
      templateStart: mapped.start + offset,
      templateEnd: mapped.end + offset,
      components: binding.components.map((component) => {
        if (component.templateStart === undefined || component.templateEnd === undefined) {
          return { ...component }
        }
        const cMapped = mapIntervalToOrientation(
          component.templateStart,
          component.templateEnd,
          productLength,
          orientation,
        )
        return {
          ...component,
          templateStart: cMapped.start + offset,
          templateEnd: cMapped.end + offset,
        }
      }),
    }
  })
  return {
    ...primer,
    id: `${idPrefix}-${primer.id}`,
    bindings: bindings.length ? bindings : primer.bindings,
  }
}

function featureMergeKey(feature: SequenceFeature, templateId: string) {
  const strand = feature.locations[0]?.strand ?? 'forward'
  return `${templateId}\0${feature.sourceFeatureId ?? feature.id}\0${feature.name}\0${feature.type}\0${feature.color}\0${strand}`
}

function intervalsOverlapOrAbut(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start <= b.end && b.start <= a.end
}

function mergeIntervalList(
  locations: Array<{ start: number; end: number; strand: SequenceFeature['locations'][number]['strand'] }>,
) {
  if (!locations.length) return []
  const sorted = [...locations].sort((left, right) => left.start - right.start || left.end - right.end)
  const merged = [{ ...sorted[0]! }]
  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index]!
    const current = merged[merged.length - 1]!
    if (current.strand === next.strand && intervalsOverlapOrAbut(current, next)) {
      current.end = Math.max(current.end, next.end)
      continue
    }
    merged.push({ ...next })
  }
  return merged
}

/**
 * When the same parental feature is clipped onto both sides of an SOE overlap
 * (typical for same-template fragments), join the halves instead of keeping duplicates.
 */
function mergeSplitParentalFeatures(
  tagged: Array<{ feature: SequenceFeature; templateId: string }>,
): SequenceFeature[] {
  const groups = new Map<string, Array<{ feature: SequenceFeature; templateId: string }>>()
  for (const entry of tagged) {
    const key = featureMergeKey(entry.feature, entry.templateId)
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }

  const result: SequenceFeature[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]!.feature)
      continue
    }

    const remaining = [...group]
    while (remaining.length) {
      const seed = remaining.shift()!
      const cluster = [seed]
      let grew = true
      while (grew) {
        grew = false
        for (let index = remaining.length - 1; index >= 0; index -= 1) {
          const candidate = remaining[index]!
          const touches = cluster.some((member) =>
            member.feature.locations.some((left) =>
              candidate.feature.locations.some((right) => intervalsOverlapOrAbut(left, right)),
            ),
          )
          if (!touches) continue
          cluster.push(candidate)
          remaining.splice(index, 1)
          grew = true
        }
      }

      if (cluster.length === 1) {
        result.push(cluster[0]!.feature)
        continue
      }

      const base = cluster[0]!.feature
      const locations = mergeIntervalList(cluster.flatMap((entry) => entry.feature.locations))
      const cleavageArrows = Array.from(
        new Set(
          cluster
            .flatMap((entry) => entry.feature.cleavageArrows ?? [])
            .filter((position) => locations.some((location) => position >= location.start && position < location.end)),
        ),
      ).sort((left, right) => left - right)

      const mergedFeature: SequenceFeature = {
        ...base,
        id: base.id,
        locations,
        cleavageArrows: cleavageArrows.length ? cleavageArrows : base.cleavageArrows,
      }
      const translatedBase = base.translation ? { locations: base.locations, translation: base.translation } : null
      if (translatedBase && mergedFeature.translation) {
        const anchor = cluster.find((entry) => entry.feature.sourceTranslationAnchor !== undefined)?.feature.sourceTranslationAnchor
        if (anchor !== undefined) mergedFeature.sourceTranslationAnchor = anchor
        mergedFeature.translation = {
          ...mergedFeature.translation,
          readingFrame:
            anchor === undefined
              ? readingFramePreservingAminoAcids(translatedBase, locations)
              : readingFrameFromTranslationAnchor(anchor, locations[0]!.strand, locations),
        }
      }
      result.push(mergedFeature)
    }
  }
  return result
}

/** Preview / product annotations: parental features+primers, optional temporary fragment spans. */
export function annotateBridgeFusion(
  fusion: BridgeFusionResult,
  fragmentProducts: BridgeFragmentProduct[],
  externalForward?: PcrPrimerInput | null,
  externalReverse?: PcrPrimerInput | null,
  options?: { includeTemporaryFragmentFeatures?: boolean },
): { features: SequenceFeature[]; primers: Primer[] } {
  if (!fusion.fusedSequence) return { features: [], primers: [] }

  const taggedFeatures: Array<{ feature: SequenceFeature; templateId: string }> = []
  const parentalPrimers: Primer[] = []
  const includeTemporaryFragmentFeatures = options?.includeTemporaryFragmentFeatures !== false

  fusion.ordered.forEach((part, orderIndex) => {
    const product = fragmentProducts.find((entry) => entry.index === part.originalIndex)
    if (!product) return
    const offset = partOffsetInFusion(fusion, orderIndex)
    const fragmentRecord = createPcrProductRecord({
      template: product.template,
      amplicon: product.amplicon,
      name: `Fragment ${part.originalIndex + 1}`,
      forwardPrimer: product.forwardPrimer,
      reversePrimer: product.reversePrimer,
      polymerase: product.polymerase,
    })
    const productLength = normalizeDna(product.sequence).length
    const templateId = product.template.id
    for (const feature of fragmentRecord.features) {
      taggedFeatures.push({
        feature: shiftFeatureToFusion(
          feature,
          productLength,
          part.orientation,
          offset,
          `bridge-parent-${part.originalIndex}`,
        ),
        templateId,
      })
    }
    for (const primer of fragmentRecord.primers) {
      parentalPrimers.push(
        shiftPrimerToFusion(primer, productLength, part.orientation, offset, `bridge-parent-${part.originalIndex}`),
      )
    }
  })

  const permanentFeatures = mergeSplitParentalFeatures(taggedFeatures)

  const fragmentFeatures: SequenceFeature[] = includeTemporaryFragmentFeatures
    ? fusion.ordered.map((part, orderIndex) => {
        const offset = partOffsetInFusion(fusion, orderIndex)
        return {
          id: `bridge-frag-${part.originalIndex}`,
          name: `Fragment ${part.originalIndex + 1}`,
          type: 'misc_feature',
          color: part.color,
          locations: [{ start: offset, end: offset + part.sequence.length, strand: 'forward' as const }],
        }
      })
    : []

  const externalPrimers: Primer[] = []
  if (externalForward && normalizeDna(externalForward.sequence)) {
    const sequence = normalizeDna(externalForward.sequence)
    externalPrimers.push({
      id: 'pcr-bridge-forward',
      name: externalForward.name || 'Primer A',
      sequence,
      color: '#db2777',
      bindings: [
        {
          strand: 'forward',
          templateStart: 0,
          templateEnd: sequence.length,
          components: [{ primerBases: sequence, templateStart: 0, templateEnd: sequence.length }],
        },
      ],
    })
  }
  if (externalReverse && normalizeDna(externalReverse.sequence)) {
    const sequence = normalizeDna(externalReverse.sequence)
    const start = Math.max(0, fusion.fusedSequence.length - sequence.length)
    externalPrimers.push({
      id: 'pcr-bridge-reverse',
      name: externalReverse.name || 'Primer B',
      sequence,
      color: '#db2777',
      bindings: [
        {
          strand: 'reverse',
          templateStart: start,
          templateEnd: fusion.fusedSequence.length,
          components: [{ primerBases: sequence, templateStart: start, templateEnd: fusion.fusedSequence.length }],
        },
      ],
    })
  }

  const primers = mergeIdenticalPrimers([
    ...externalPrimers,
    ...parentalPrimers.filter(
      (primer) =>
        !externalPrimers.some(
          (external) =>
            external.name === primer.name ||
            normalizeDna(external.sequence) === normalizeDna(primer.sequence),
        ),
    ),
  ]).primers

  return {
    features: [...permanentFeatures, ...fragmentFeatures],
    primers,
  }
}

function historyFileName(name: string) {
  return name.toLowerCase().endsWith('.dna') ? name : `${name}.dna`
}

function parentalHistoryNode(record: SequenceRecord): HistoryNode {
  return snapshotParentalHistoryNode(record)
}

function pcrProductEnds(
  mode: PcrPolymeraseMode,
  forwardPhosphorylated: boolean,
  reversePhosphorylated: boolean,
) {
  const stickiness = mode === 'blunt' ? 0 : -1
  return {
    upstream: {
      modification: forwardPhosphorylated ? ('fivePrimePhosphorylated' as const) : ('unmodified' as const),
      stickiness,
    },
    downstream: {
      modification: reversePhosphorylated ? ('fivePrimePhosphorylated' as const) : ('unmodified' as const),
      stickiness,
    },
  }
}

/** Build intermediate fragment PCR products for optional “Make file”. */
export function createBridgeFragmentRecords(
  products: BridgeFragmentProduct[],
  makeFiles: Array<{ index: number; name: string; enabled: boolean }>,
): SequenceRecord[] {
  const records: SequenceRecord[] = []
  for (const spec of makeFiles) {
    if (!spec.enabled) continue
    const product = products.find((entry) => entry.index === spec.index)
    if (!product) continue
    records.push(
      createPcrProductRecord({
        template: product.template,
        amplicon: product.amplicon,
        name: spec.name,
        forwardPrimer: product.forwardPrimer,
        reversePrimer: product.reversePrimer,
        polymerase: product.polymerase,
      }),
    )
  }
  return records
}

export function createBridgePcrProductRecord(args: {
  fusion: BridgeFusionResult
  fragmentProducts: BridgeFragmentProduct[]
  name: string
  forwardPrimer: PcrPrimerInput
  reversePrimer: PcrPrimerInput
  polymerase: PcrPolymeraseMode
}): SequenceRecord {
  const { fusion, fragmentProducts, name, forwardPrimer, reversePrimer, polymerase } = args
  if (!fusion.ready || !fusion.fusedSequence) {
    throw new Error(fusion.message || 'Bridge PCR fusion is not ready.')
  }

  const timestamp = nowIso()
  const normalizedName = name.trim().replace(/\.dna$/i, '') || 'Amplified'
  const productSequence = fusion.fusedSequence
  const annotated = annotateBridgeFusion(fusion, fragmentProducts, forwardPrimer, reversePrimer, {
    includeTemporaryFragmentFeatures: false,
  })
  const features = annotated.features
  const primers = annotated.primers
  const forwardSequence = normalizeDna(forwardPrimer.sequence)
  const reverseSequence = normalizeDna(reversePrimer.sequence)

  const junctionSummary = fusion.junctions
    .map((junction) => `${junction.overlapLength} bp` + (junction.tmC != null ? ` Tm ${junction.tmC.toFixed(0)}°C` : ''))
    .join(', ')

  // Retain the actual primary-PCR products as history parents.  Besides making
  // the assembly tree truthful, this preserves the primary primer pairs for a
  // later history-derived OE-PCR recipe.
  const primaryProducts = new Map(
    fragmentProducts.map((product) => [
      product.index,
      createPcrProductRecord({
        template: product.template,
        amplicon: product.amplicon,
        name: `OE-PCR fragment ${product.index + 1}`,
        forwardPrimer: product.forwardPrimer,
        reversePrimer: product.reversePrimer,
        polymerase: product.polymerase,
      }),
    ] as const),
  )

  const history: HistoryNode = {
    id: createId('hist'),
    name: historyFileName(normalizedName),
    seqLen: productSequence.length,
    circular: false,
    operation: 'overlapAndAmplify',
    resurrectable: true,
    hideHistory: false,
    oligos: [
      {
        name: forwardPrimer.name || 'Primer A',
        sequence: forwardSequence,
      },
      {
        name: reversePrimer.name || 'Primer B',
        sequence: reverseSequence,
      },
    ],
    regeneratedSites: [],
    inputSummaries: [
      {
        manipulation: 'overlapAndAmplify',
        name1: forwardPrimer.name || 'Primer A',
        name2: reversePrimer.name || 'Primer B',
        val1: String(fusion.junctions[0]?.overlapLength ?? 0),
        val2: String(productSequence.length),
      },
    ],
    features: features.map((feature) => ({
      type: feature.type,
      name: feature.name,
      color: feature.color,
      strand: feature.locations[0]?.strand ?? 'forward',
      segments: feature.locations.map((location) => ({ start: location.start, end: location.end })),
    })),
    sequence: productSequence,
    primers,
    children: fusion.ordered.map((part) => {
      const primaryProduct = primaryProducts.get(part.originalIndex)
      return primaryProduct
        ? parentalHistoryNode(primaryProduct)
        : parentalHistoryNode(fragmentProducts.find((product) => product.index === part.originalIndex)!.template)
    }),
  }

  const summary = `Overlap-extension PCR fused ${fusion.ordered.length} fragments (${junctionSummary || 'no junction'}) → ${productSequence.length} bp.`
  return addOperation(
    {
      id: createId('seq'),
      name: normalizedName,
      description: `Overlap-extension PCR product`,
      molecule: 'dna',
      topology: 'linear',
      sequence: productSequence,
      primers,
      features,
      operations: [],
      history,
      dnaEnds: pcrProductEnds(polymerase, forwardPrimer.phosphorylated, reversePrimer.phosphorylated),
      construct: { ...defaultConstructProperties, syntheticDna: true },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    'pcr',
    summary,
  )
}
