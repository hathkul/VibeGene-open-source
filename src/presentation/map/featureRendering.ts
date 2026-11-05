import { isOrfFeature } from '../../domain/orfPrediction'
import { buildFeatureGapConnectors } from '../../domain/featureMapGaps'
import type { SequenceFeature, Strand } from '../../domain/types'
import { featureArrowForPiece, featureTypeHasDirectionalOptions } from '../../domain/featureDirectionality'

export type FeatureRenderInfo = {
  feature: SequenceFeature
  segmentId: string
  start: number
  end: number
  strand: 'forward' | 'reverse'
  level: number
  isFeatureStart: boolean
  isFeatureEnd: boolean
}

const featurePlacementPriority: Record<string, number> = { CDS: 0, ORF: 1, promoter: 2, rep_origin: 3, oriT: 3, gene: 4, mRNA: 5, transcript: 5, prim_transcript: 5, regulatory: 6, RBS: 6, enhancer: 6, operator: 6, terminator: 7, primer_bind: 8, protein_bind: 8, misc_binding: 9, exon: 10, intron: 10, ncRNA: 10, rRNA: 10, tRNA: 10, "5'UTR": 11, "3'UTR": 11, variation: 12, mutation: 12, misc_difference: 12, repeat_region: 13, mobile_element: 13, misc_feature: 30 }
const directionalFeatureTypes = new Set([
  'CDS', 'ORF', 'gene', 'promoter', 'mRNA', 'transcript', 'prim_transcript',
  'ncRNA', 'rRNA', 'tRNA', 'tmRNA', 'misc_RNA', 'mat_peptide', 'sig_peptide',
])

export function featurePriority(type: string) {
  return featurePlacementPriority[type] ?? 20
}

export function featureTypeHasArrow(type: string) {
  return directionalFeatureTypes.has(type) || featureTypeHasDirectionalOptions(type)
}

export function isRulerTrackFeature(feature: SequenceFeature) {
  return feature.mapTrack === 'ruler'
}

export function locationDrawablePieces(
  location: { start: number; end: number; strand: Strand },
  sequenceLength: number,
): Array<{ start: number; end: number; strand: Strand }> {
  const start = Math.max(0, Math.min(sequenceLength, location.start))
  const end = Math.max(0, Math.min(sequenceLength, location.end))
  if (start === end) return []
  if (start < end) {
    return [{ start, end, strand: location.strand }]
  }
  return [
    { start, end: sequenceLength, strand: location.strand },
    { start: 0, end, strand: location.strand },
  ]
}

export function featureDrawableSegments(features: SequenceFeature[], sequenceLength: number): Omit<FeatureRenderInfo, 'level'>[] {
  return features.flatMap((feature) => {
    const pieces: Array<{ start: number; end: number; strand: Strand; locationIndex: number }> = []
    feature.locations.forEach((location, locationIndex) => {
      locationDrawablePieces(location, sequenceLength).forEach((piece) => {
        pieces.push({ ...piece, locationIndex })
      })
    })
    if (!pieces.length) return []

    // Pieces are built in biological 5'→3' order for a forward feature: locations are
    // stored ascending, and a location that wraps the origin yields its [start..L] half
    // before its [0..end] half. Reverse features run the other way. Ordering by absolute
    // coordinate instead would put the wrong half first for an origin-crossing feature and
    // draw its arrowhead on the wrong end.
    const strand = pieces[0]?.strand ?? 'forward'
    const ordered = strand === 'reverse' ? [...pieces].reverse() : pieces
    const firstKey = `${ordered[0].locationIndex}:${ordered[0].start}`
    const lastKey = `${ordered[ordered.length - 1].locationIndex}:${ordered[ordered.length - 1].start}`

    return pieces.map((piece) => {
      const pieceKey = `${piece.locationIndex}:${piece.start}`
      return {
        feature,
        segmentId: `${feature.id}:${piece.start}-${piece.end}`,
        start: piece.start,
        end: piece.end,
        strand: piece.strand,
        isFeatureStart: pieceKey === firstKey,
        isFeatureEnd: pieceKey === lastKey,
      }
    })
  })
}

export function featureGapConnectors(segments: FeatureRenderInfo[], sequenceLength: number) {
  return buildFeatureGapConnectors(
    segments.map((segment) => {
      const matchingLocation = segment.feature.locations.find(
        (location) => location.start === segment.start && location.end === segment.end,
      )
      return {
        featureId: segment.feature.id,
        start: segment.start,
        end: segment.end,
        level: segment.level,
        strand: segment.strand,
        locationCount: segment.feature.locations.length,
        originWrapSplit: matchingLocation?.originWrapSplit === true,
      }
    }),
    sequenceLength,
  )
}

export function featureLevelBand(level: number) {
  return Math.floor(level)
}

export function constrainCircularFeatureLevels(
  features: FeatureRenderInfo[],
  levelLimit: number,
  _clampPriorityFeatures = false,
) {
  void _clampPriorityFeatures
  // Never crush overflow onto the last visible row — hide features that do not fit.
  return features.filter((feature) => featureLevelBand(feature.level) <= levelLimit)
}

export function rangesOverlapOnMap(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end
}

export function assignFeatureLevels(features: SequenceFeature[], sequenceLength: number): FeatureRenderInfo[] {
  const segments = featureDrawableSegments(features, sequenceLength)

  // Group drawable pieces by feature so a single feature (including one that wraps the
  // origin and is drawn as two pieces) is packed onto exactly one ring/level. Packing per
  // piece could otherwise place the two halves of a wrap-around feature on different rings
  // and make it look split.
  const byFeature = new Map<string, Omit<FeatureRenderInfo, 'level'>[]>()
  const featureOrder: string[] = []
  segments.forEach((segment) => {
    const list = byFeature.get(segment.feature.id)
    if (list) {
      list.push(segment)
    } else {
      byFeature.set(segment.feature.id, [segment])
      featureOrder.push(segment.feature.id)
    }
  })

  const grouped = featureOrder.map((featureId) => {
    const pieces = byFeature.get(featureId)!
    const feature = pieces[0]!.feature
    return {
      feature,
      pieces,
      ranges: pieces.map((piece) => ({ start: piece.start, end: piece.end })),
      minStart: Math.min(...pieces.map((piece) => piece.start)),
      maxEnd: Math.max(...pieces.map((piece) => piece.end)),
    }
  })

  grouped.sort((a, b) => {
    // Prioritized features are packed first so they claim outer rings when free,
    // but they still first-fit to deeper levels when they overlap each other.
    const priorityDelta = Number(Boolean(b.feature.prioritizeDisplay)) - Number(Boolean(a.feature.prioritizeDisplay))
    if (priorityDelta !== 0) return priorityDelta
    return featurePriority(a.feature.type) - featurePriority(b.feature.type) || a.minStart - b.minStart || b.maxEnd - a.maxEnd
  })

  // Half-slots: each integer feature layer owns two slots so thin ORFs can pack 2-per-layer.
  // Regular features occupy both slots of a layer; ORFs occupy a single free slot.
  const slotOccupancy: Array<Array<{ start: number; end: number }>> = []

  function slotIsFree(slot: number, ranges: Array<{ start: number; end: number }>) {
    const occupied = slotOccupancy[slot] ?? []
    return !ranges.some((range) => occupied.some((used) => rangesOverlapOnMap(used, range)))
  }

  function occupySlot(slot: number, ranges: Array<{ start: number; end: number }>) {
    const occupied = slotOccupancy[slot] ?? []
    ranges.forEach((range) => occupied.push(range))
    slotOccupancy[slot] = occupied
  }

  function nextOrfSlot(ranges: Array<{ start: number; end: number }>) {
    for (let slot = 0; ; slot += 1) {
      if (slotIsFree(slot, ranges)) return slot
    }
  }

  function nextRegularSlot(ranges: Array<{ start: number; end: number }>) {
    for (let layer = 0; ; layer += 1) {
      const slot = layer * 2
      if (slotIsFree(slot, ranges) && slotIsFree(slot + 1, ranges)) return slot
    }
  }

  return grouped
    .flatMap((item) => {
      let level: number
      if (isOrfFeature(item.feature)) {
        const slot = nextOrfSlot(item.ranges)
        occupySlot(slot, item.ranges)
        level = slot / 2
      } else {
        const slot = nextRegularSlot(item.ranges)
        occupySlot(slot, item.ranges)
        occupySlot(slot + 1, item.ranges)
        level = slot / 2
      }
      return item.pieces.map((piece) => ({ ...piece, level }))
    })
    .toSorted((a, b) => a.level - b.level || a.start - b.start || b.end - a.end)
}

export function minimapFeaturePath(
  info: FeatureRenderInfo,
  mapLeft: number,
  mapWidth: number,
  sequenceLength: number,
  y: number,
  height: number,
) {
  const x = mapLeft + (info.start / sequenceLength) * mapWidth
  const xEnd = mapLeft + (info.end / sequenceLength) * mapWidth
  const width = Math.max(2, xEnd - x)
  const arrow = (!info.feature.directionality && !featureTypeHasArrow(info.feature.type))
    ? 'none'
    : featureArrowForPiece(info)
  const arrowSize = Math.min(width * 0.22, height * 0.9, 6)
  if (arrow === 'none' || width <= arrowSize * 2) return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`
  if (arrow === 'both') {
    const bodyStart = x + arrowSize
    const bodyEnd = x + width - arrowSize
    return `M ${bodyStart} ${y} H ${bodyEnd} L ${x + width} ${y + height / 2} L ${bodyEnd} ${y + height} H ${bodyStart} L ${x} ${y + height / 2} Z`
  }
  if (arrow === 'forward') {
    const bodyEnd = x + width - arrowSize
    return `M ${x} ${y} H ${bodyEnd} L ${x + width} ${y + height / 2} L ${bodyEnd} ${y + height} H ${x} Z`
  }
  const bodyStart = x + arrowSize
  return `M ${bodyStart} ${y} H ${x + width} V ${y + height} H ${bodyStart} L ${x} ${y + height / 2} Z`
}
