import {
  computeFeatureTranslationCells,
  type FeatureTranslationCell,
  type FeatureTranslationComputeOptions,
} from './geneticCode'
import type {
  FeatureReadingFrame,
  FeatureTranslationOptions,
  SequenceFeature,
  Strand,
  Topology,
} from './types'

export type FeatureTranscriptionBounds = {
  strand: Strand
  /** First genomic base translated in transcription order (inclusive). */
  start: number
  /** Last genomic base in the annotated feature (inclusive). */
  last: number
  /** Exclusive transcription end (forward: max end; reverse: min start). */
  exclusiveEnd: number
}

function isTranslatedCds(feature: SequenceFeature): feature is SequenceFeature & { translation: FeatureTranslationOptions } {
  return Boolean(feature.translateInSequenceView && feature.translation)
}

export function featureTranscriptionBounds(feature: Pick<SequenceFeature, 'locations'>): FeatureTranscriptionBounds {
  const strand = feature.locations[0]?.strand ?? 'forward'
  const starts = feature.locations.map((location) => location.start)
  const ends = feature.locations.map((location) => location.end)
  if (strand === 'forward') {
    const start = Math.min(...starts)
    const exclusiveEnd = Math.max(...ends)
    return { strand, start, last: exclusiveEnd - 1, exclusiveEnd }
  }
  const start = Math.max(...ends) - 1
  const exclusiveEnd = Math.min(...starts)
  return { strand, start, last: exclusiveEnd, exclusiveEnd }
}

function translationCompatibilityMatch(a: FeatureTranslationOptions, b: FeatureTranslationOptions) {
  // Reading-frame numbers need not match: SnapGene often stores a downstream CDS as
  // readingFrame 2/3 when an unannotated gap completes the prior codon (e.g. 1 bp gap +
  // RF3 ≡ same continuous ORF as upstream RF1). Compare genomic codon phase instead.
  return a.geneticCode === b.geneticCode
}

/** Genomic gap in bases between upstream transcription end and downstream transcription start. */
export function transcriptionGapBetween(upstream: FeatureTranscriptionBounds, downstream: FeatureTranscriptionBounds): number | null {
  if (upstream.strand !== downstream.strand) return null
  if (upstream.strand === 'forward') {
    if (downstream.start < upstream.exclusiveEnd) return null
    return downstream.start - upstream.exclusiveEnd
  }
  if (downstream.start >= upstream.last) return null
  return upstream.last - 1 - downstream.start
}

/** First genomic base of the first complete codon (after reading-frame offset). */
export function firstTranslatedCodonPosition(
  feature: Pick<SequenceFeature, 'locations'> & { translation: FeatureTranslationOptions },
): number {
  const bounds = featureTranscriptionBounds(feature)
  const frameOffset = Math.abs(feature.translation.readingFrame) - 1
  return bounds.strand === 'forward' ? bounds.start + frameOffset : bounds.start - frameOffset
}

/**
 * When a translated feature's span changes, shift readingFrame so the first translated
 * codon stays on the same genomic bases (preserving the amino-acid sequence).
 *
 * Example: forward CDS 3..26 with frame +2 → span 2..26 becomes frame +3.
 */
export function readingFramePreservingAminoAcids(
  previous: Pick<SequenceFeature, 'locations'> & { translation: FeatureTranslationOptions },
  nextLocations: SequenceFeature['locations'],
): FeatureReadingFrame {
  const prevBounds = featureTranscriptionBounds(previous)
  const nextBounds = featureTranscriptionBounds({ locations: nextLocations })
  const magnitude = Math.abs(previous.translation.readingFrame) as 1 | 2 | 3

  if (prevBounds.strand !== nextBounds.strand) {
    return nextBounds.strand === 'forward' ? magnitude : ((-magnitude) as FeatureReadingFrame)
  }

  const codonStart = firstTranslatedCodonPosition(previous)
  const newOffset =
    prevBounds.strand === 'forward'
      ? ((codonStart - nextBounds.start) % 3 + 3) % 3
      : ((nextBounds.start - codonStart) % 3 + 3) % 3
  const newMagnitude = (newOffset + 1) as 1 | 2 | 3
  return prevBounds.strand === 'forward' ? newMagnitude : ((-newMagnitude) as FeatureReadingFrame)
}

/** Derive a translated feature's frame from a stable first-codon coordinate. */
export function readingFrameFromTranslationAnchor(
  anchor: number,
  strand: Strand,
  nextLocations: SequenceFeature['locations'],
): FeatureReadingFrame {
  const nextBounds = featureTranscriptionBounds({ locations: nextLocations })
  const offset =
    strand === 'forward'
      ? ((anchor - nextBounds.start) % 3 + 3) % 3
      : ((nextBounds.start - anchor) % 3 + 3) % 3
  const magnitude = (offset + 1) as 1 | 2 | 3
  return strand === 'forward' ? magnitude : ((-magnitude) as FeatureReadingFrame)
}

/** Preserve codon phase when coding bases are clipped and mapped to new coordinates. */
export function readingFrameAfterMapping(
  feature: Pick<SequenceFeature, 'locations'> & { translation: FeatureTranslationOptions },
  mapPosition: (position: number) => number | null,
): FeatureReadingFrame | null {
  const reverse = feature.translation.readingFrame < 0
  const segments = feature.locations.map((location, index) => ({ location, index }))
    .sort((a, b) => reverse ? b.location.start - a.location.start : a.location.start - b.location.start)
  let ordinal = 0
  let firstMapped: number | null = null
  let firstOrdinal = 0
  for (const { location, index } of segments) {
    if (feature.translation.segmentNumbering[index]?.skip) continue
    for (let pos = reverse ? location.end - 1 : location.start;
      reverse ? pos >= location.start : pos < location.end;
      pos += reverse ? -1 : 1) {
      const mapped = mapPosition(pos)
      if (mapped !== null && (firstMapped === null || (reverse ? mapped > firstMapped : mapped < firstMapped))) {
        firstMapped = mapped
        firstOrdinal = ordinal
      }
      ordinal += 1
    }
  }
  if (firstMapped === null) return null
  const offset = ((Math.abs(feature.translation.readingFrame) - 1 - firstOrdinal) % 3 + 3) % 3
  return ((reverse ? -1 : 1) * (offset + 1)) as FeatureReadingFrame
}

export function areTranslatedCdsInSameFrame(
  upstream: SequenceFeature & { translation: FeatureTranslationOptions },
  downstream: SequenceFeature & { translation: FeatureTranslationOptions },
): boolean {
  if (!translationCompatibilityMatch(upstream.translation, downstream.translation)) return false
  const upstreamBounds = featureTranscriptionBounds(upstream)
  const downstreamBounds = featureTranscriptionBounds(downstream)
  const gap = transcriptionGapBetween(upstreamBounds, downstreamBounds)
  if (gap === null || gap < 0) return false
  const upstreamFirst = firstTranslatedCodonPosition(upstream)
  const downstreamFirst = firstTranslatedCodonPosition(downstream)
  const phaseDistance =
    upstreamBounds.strand === 'forward' ? downstreamFirst - upstreamFirst : upstreamFirst - downstreamFirst
  return phaseDistance >= 0 && phaseDistance % 3 === 0
}


export function downstreamInFrameTranslatedCds(
  feature: SequenceFeature & { translation: FeatureTranslationOptions },
  candidates: SequenceFeature[],
): (SequenceFeature & { translation: FeatureTranslationOptions }) | null {
  const upstreamBounds = featureTranscriptionBounds(feature)
  const sameStrand = candidates.filter(isTranslatedCds).filter((candidate) => {
    if (candidate.id === feature.id) return false
    return featureTranscriptionBounds(candidate).strand === upstreamBounds.strand
  })

  let nearest: (SequenceFeature & { translation: FeatureTranslationOptions }) | null = null
  let nearestGap: number | null = null
  for (const candidate of sameStrand) {
    if (!areTranslatedCdsInSameFrame(feature, candidate)) continue
    const gap = transcriptionGapBetween(upstreamBounds, featureTranscriptionBounds(candidate))
    if (gap === null || gap < 0) continue
    if (nearestGap === null || gap < nearestGap) {
      nearest = candidate
      nearestGap = gap
    }
  }
  return nearest
}

export function stopTranslationBeforePosition(
  _feature: Pick<SequenceFeature, 'locations'>,
  downstream: SequenceFeature & { translation: FeatureTranslationOptions },
): number {
  // Clip before the downstream's first complete codon so a junction codon that
  // spans an unannotated gap + the downstream RF offset stays on the upstream.
  return firstTranslatedCodonPosition(downstream)
}

export function buildCdsTranslationByFeatureId(
  features: SequenceFeature[],
  sequence: string,
  topology: Topology,
): Map<string, FeatureTranslationCell[]> {
  const translated = features.filter(isTranslatedCds)
  const map = new Map<string, FeatureTranslationCell[]>()

  translated.forEach((feature) => {
    const downstream = downstreamInFrameTranslatedCds(feature, features)
    const computeOptions: FeatureTranslationComputeOptions = {
      topology,
      stopTranslationBefore: downstream ? stopTranslationBeforePosition(feature, downstream) : null,
    }
    const cells = computeFeatureTranslationCells(feature, sequence, feature.translation, computeOptions)
    if (cells.length) map.set(feature.id, cells)
  })

  return map
}

export type CdsTranslationRowGroup = {
  id: string
  features: Array<SequenceFeature & { translation: FeatureTranslationOptions }>
}

export type AnnotatedTranslationCell = FeatureTranslationCell & {
  featureId: string
}

function sortTranslatedCdsInTranscriptionOrder(
  features: Array<SequenceFeature & { translation: FeatureTranslationOptions }>,
) {
  return [...features].toSorted((a, b) => {
    const aBounds = featureTranscriptionBounds(a)
    const bBounds = featureTranscriptionBounds(b)
    return aBounds.strand === 'forward' ? aBounds.start - bBounds.start : bBounds.start - aBounds.start
  })
}

/** Group translated CDS features that share one continuous reading frame into one sequence-pane row. */
export function buildCdsTranslationRowGroups(features: SequenceFeature[]): CdsTranslationRowGroup[] {
  const translated = features.filter(isTranslatedCds)
  const parent = new Map<string, string>()

  function find(featureId: string): string {
    const parentId = parent.get(featureId)
    if (!parentId || parentId === featureId) return featureId
    const root = find(parentId)
    parent.set(featureId, root)
    return root
  }

  function union(featureIdA: string, featureIdB: string) {
    const rootA = find(featureIdA)
    const rootB = find(featureIdB)
    if (rootA !== rootB) parent.set(rootB, rootA)
  }

  translated.forEach((feature) => parent.set(feature.id, feature.id))
  translated.forEach((feature) => {
    const downstream = downstreamInFrameTranslatedCds(feature, features)
    if (downstream) union(feature.id, downstream.id)
  })

  const groups = new Map<string, CdsTranslationRowGroup>()
  translated.forEach((feature) => {
    const root = find(feature.id)
    const group = groups.get(root) ?? { id: root, features: [] }
    group.features.push(feature)
    groups.set(root, group)
  })

  return [...groups.values()].flatMap((group, groupIndex) => {
    const featuresInOrder = sortTranslatedCdsInTranscriptionOrder(group.features)

    // Prevent visually overlapping translation lanes for nested/overlapping CDS features.
    // When CDS features overlap, `transcriptionGapBetween(...)` becomes `null`.
    const subgroups: Array<Array<SequenceFeature & { translation: FeatureTranslationOptions }>> = []
    let current: Array<SequenceFeature & { translation: FeatureTranslationOptions }> = []

    for (const feature of featuresInOrder) {
      if (!current.length) {
        current = [feature]
        continue
      }
      const prev = current[current.length - 1]!
      // Start a new visual row whenever the next CDS cannot be continued as
      // the same translation frame.
      if (!areTranslatedCdsInSameFrame(prev, feature)) {
        subgroups.push(current)
        current = [feature]
        continue
      }
      current.push(feature)
    }
    if (current.length) subgroups.push(current)

    return subgroups.map((subgroup, subgroupIndex) => ({
      id: `${featuresInOrder[0]!.id}-${groupIndex}-${subgroupIndex}`,
      features: subgroup,
    }))
  })
}

export function mergeTranslationCellsForGroup(
  group: CdsTranslationRowGroup,
  cellsByFeatureId: Map<string, FeatureTranslationCell[]>,
): AnnotatedTranslationCell[] {
  const strand = featureTranscriptionBounds(group.features[0]!).strand
  const merged = group.features.flatMap((feature) => {
    const cells = cellsByFeatureId.get(feature.id) ?? []
    return cells.map((cell) => ({ ...cell, featureId: feature.id }))
  })
  return merged.toSorted((a, b) => {
    const aPos = a.positions[0] ?? 0
    const bPos = b.positions[0] ?? 0
    return strand === 'forward' ? aPos - bPos : bPos - aPos
  })
}

export type PositionIndexedTranslationCell = AnnotatedTranslationCell & {
  minPos: number
  maxPos: number
}

export type IndexedTranslationGroupCells = {
  group: CdsTranslationRowGroup
  cells: PositionIndexedTranslationCell[]
}

/** Merge translation cells once per group and index by genomic min position for row queries. */
export function buildIndexedTranslationCellsByGroup(
  groups: CdsTranslationRowGroup[],
  cellsByFeatureId: Map<string, FeatureTranslationCell[]>,
): IndexedTranslationGroupCells[] {
  return groups.map((group) => {
    const merged = mergeTranslationCellsForGroup(group, cellsByFeatureId)
    const cells = merged
      .map((cell) => {
        const minPos = Math.min(...cell.positions)
        const maxPos = Math.max(...cell.positions)
        return { ...cell, minPos, maxPos }
      })
      .toSorted((a, b) => a.minPos - b.minPos || a.maxPos - b.maxPos)
    return { group, cells }
  })
}
