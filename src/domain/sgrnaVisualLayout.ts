import { circularMapPolarPoint } from './circularMapGeometry'
import { PRIMER_FRAME_EDGE_PAD_RATIO } from './primerSequenceLayout'
import { reverseComplement } from './sequence'
import type { SgRNAAnnotation } from './sgrna'
import type { RestrictionSite, Strand, Topology } from './types'

/** Matches primer map/sequence ruler offset (see App PRIMER_RULER_OFFSET_PX). */
export const PRIMER_MAP_RULER_OFFSET_PX = 8
/** Extra radial/vertical offset for sgRNA binding arcs beyond the primer ruler line. */
export const SG_RNA_MAP_BINDING_EXTRA_OFFSET_PX = 10
/** Vertical lane pitch for stacked sgRNA rows in the sequence pane. */
export const SG_RNA_SEQUENCE_LANE_HEIGHT_PX = 45
export const SG_RNA_SEQUENCE_FRAME_BODY_HEIGHT_PX = 19
export const SG_RNA_SEQUENCE_FRAME_CORNER_RADIUS_PX = 4
/** Matches `.sgrna-map-name` in App.css. */
export const SG_RNA_MAP_LABEL_FONT_SIZE_PX = 11
export const SG_RNA_MAP_LABEL_FONT_WEIGHT = 700
/** Match enzyme map callout padding so left-routed labels meet leaders. */
export const SG_RNA_MAP_CALLOUT_LABEL_PADDING_PX = 6
export const SG_RNA_SEQUENCE_LABEL_BAND_PX = 22
export const SG_RNA_SEQUENCE_REVERSE_FRAME_TOP_OFFSET_PX = 4
export const SG_RNA_SEQUENCE_LABEL_CENTER_OFFSET_PX = 13
export const SG_RNA_GUIDE_FRAME_STROKE_PX = 1.7
export const SG_RNA_PAM_FRAME_STROKE_PX = 3.4

export type SgRnaClearanceSpan = {
  left: number
  right: number
  heightPx: number
}

export function isSgRnaCalloutSite(site: Pick<RestrictionSite, 'match'>) {
  return site.match.startsWith('__primer_callout__sgrna_')
}

/** Genomic anchor for map leaders (5′ end of the guide on the annotated strand). */
export function sgRnaGuideAnchorBp(annotation: SgRNAAnnotation) {
  const location = annotation.guide.locations[0]!
  return location.strand === 'reverse' ? location.end : location.start
}

export function sgRnaMapBindingOffsetPx(strand: Strand) {
  const sign = strand === 'forward' ? -1 : 1
  return sign * (PRIMER_MAP_RULER_OFFSET_PX + SG_RNA_MAP_BINDING_EXTRA_OFFSET_PX)
}

export function sgRnaLinearBindingY(strandY: number, strand: Strand) {
  return strandY + sgRnaMapBindingOffsetPx(strand)
}

export function sgRnaCircularBindingRadius(baseRadius: number, strand: Strand) {
  return baseRadius + sgRnaMapBindingOffsetPx(strand)
}

export function sgRnaCircularLeaderAnchor(
  annotation: SgRNAAnnotation,
  sequenceLength: number,
  centerX: number,
  centerY: number,
  baseRadius: number,
  topology: Topology,
) {
  const strand = annotation.guide.locations[0]?.strand ?? 'forward'
  return circularMapPolarPoint(
    sgRnaGuideAnchorBp(annotation),
    sequenceLength,
    centerX,
    centerY,
    sgRnaCircularBindingRadius(baseRadius, strand),
    0,
    topology,
  )
}

export function sgRnaRowLaneHeightPx(laneCount: number) {
  return Math.max(0, laneCount) * SG_RNA_SEQUENCE_LANE_HEIGHT_PX
}

export type SgRnaSequenceFrameHorizontalBoundsOptions = {
  omitPadLeft?: boolean
  omitPadRight?: boolean
}

export function sgRnaSequenceFrameHorizontalBounds(
  start: number,
  end: number,
  rowStart: number,
  trackInsetPx: number,
  baseStepPx: number,
  options?: SgRnaSequenceFrameHorizontalBoundsOptions,
) {
  const leftBase = trackInsetPx + (start - rowStart) * baseStepPx
  const rightBase = trackInsetPx + (end - rowStart) * baseStepPx
  const pad = baseStepPx * PRIMER_FRAME_EDGE_PAD_RATIO
  const padLeft = options?.omitPadLeft ? 0 : pad
  const padRight = options?.omitPadRight ? 0 : pad
  return {
    left: leftBase - padLeft,
    right: rightBase + padRight,
    innerLeft: leftBase,
    innerRight: rightBase,
    pad,
    padLeft,
    padRight,
  }
}

/** Genomic coordinate between adjacent guide and PAM intervals, if they touch. */
export function sgRnaGuidePamBoundaryBasePair(
  guide: { start: number; end: number },
  pam: { start: number; end: number },
): number | null {
  if (guide.end === pam.start) return guide.end
  if (pam.end === guide.start) return guide.start
  return null
}

export function sgRnaGuidePamBoundaryX(
  boundaryBp: number,
  rowStart: number,
  trackInsetPx: number,
  baseStepPx: number,
  templateCenterX?: (templateIndex: number) => number,
) {
  if (templateCenterX) {
    return templateCenterX(boundaryBp - 1) + baseStepPx / 2
  }
  return trackInsetPx + (boundaryBp - rowStart) * baseStepPx
}

export function sgRnaMapCalloutLabelFont(
  fontStack = 'system-ui, -apple-system, "Segoe UI", sans-serif',
) {
  return `${SG_RNA_MAP_LABEL_FONT_WEIGHT} ${SG_RNA_MAP_LABEL_FONT_SIZE_PX}px ${fontStack}`
}

export function sgRnaMapCalloutTextWidth(
  label: string,
  measureTextWidth: (label: string, font: string, fallbackPerChar: number) => number,
) {
  return measureTextWidth(label, sgRnaMapCalloutLabelFont(), 6.2)
}

/** Reserved label width for map routers (text + padding). */
export function sgRnaMapCalloutReservedWidth(
  label: string,
  measureTextWidth: (label: string, font: string, fallbackPerChar: number) => number,
) {
  return sgRnaMapCalloutTextWidth(label, measureTextWidth) + SG_RNA_MAP_CALLOUT_LABEL_PADDING_PX
}

/** Left-routed linear map gap between label right edge and connector (reserved width − rendered width). */
export function linearMapLeftRoutedLabelGapPx(reservedLabelWidthPx: number, renderedTextWidthPx: number) {
  return reservedLabelWidthPx - renderedTextWidthPx
}

/** Left-routed linear map labels anchor at the leader end (textAnchor end). */
export function sgRnaLinearCalloutTextPlacement(
  x: number,
  connectorEndX: number,
  textAnchor: 'start' | 'end' | 'middle',
): { x: number; textAnchor: 'start' | 'end' | 'middle' } {
  if (textAnchor === 'start' && connectorEndX > x + 0.5) {
    return { x: connectorEndX, textAnchor: 'end' }
  }
  return { x, textAnchor }
}

export function sgRnaSequenceFrameTop(laneTop: number, strand: Strand) {
  return strand === 'forward'
    ? laneTop + SG_RNA_SEQUENCE_LABEL_BAND_PX
    : laneTop + SG_RNA_SEQUENCE_REVERSE_FRAME_TOP_OFFSET_PX
}

export function sgRnaSequenceNameLabelY(strand: Strand, _laneTop: number, frameTop: number) {
  if (strand === 'forward') {
    return frameTop - SG_RNA_SEQUENCE_LABEL_CENTER_OFFSET_PX
  }
  return frameTop + SG_RNA_SEQUENCE_FRAME_BODY_HEIGHT_PX + SG_RNA_SEQUENCE_LABEL_CENTER_OFFSET_PX
}

export function sgRnaSequenceNameLabelX(frameLeft: number, frameRight: number) {
  return (frameLeft + frameRight) / 2
}

export function sgRnaSequenceShowsNameLabel(
  segment: Pick<SgRnaVisualSegment, 'part' | 'start' | 'end'>,
  annotation: SgRNAAnnotation,
) {
  if (segment.part !== 'guide') return false
  const location = annotation.guide.locations[0]
  if (!location) return false
  const fivePrimeBase = location.strand === 'forward' ? location.start : location.end - 1
  return segment.start <= fivePrimeBase && segment.end > fivePrimeBase
}

function sgRnaSequenceFrameCornerRadiusPx(
  frameLeft: number,
  frameRight: number,
  frameTop: number,
  frameBottom: number,
  radius: number,
) {
  const width = frameRight - frameLeft
  const height = frameBottom - frameTop
  return Math.min(radius, width / 2, height / 2)
}

function sgRnaOpenFrameOuterEdgePath(
  piece: 'left' | 'right',
  frameLeft: number,
  frameRight: number,
  frameTop: number,
  frameBottom: number,
  radius: number,
) {
  const r = sgRnaSequenceFrameCornerRadiusPx(frameLeft, frameRight, frameTop, frameBottom, radius)
  if (piece === 'left') {
    if (r <= 0) {
      return `L ${frameLeft} ${frameTop} L ${frameLeft} ${frameBottom}`
    }
    return `L ${frameLeft + r} ${frameTop} A ${r} ${r} 0 0 0 ${frameLeft} ${frameTop + r} L ${frameLeft} ${frameBottom - r} A ${r} ${r} 0 0 0 ${frameLeft + r} ${frameBottom}`
  }
  if (r <= 0) {
    return `L ${frameRight} ${frameTop} L ${frameRight} ${frameBottom}`
  }
  return `L ${frameRight - r} ${frameTop} A ${r} ${r} 0 0 1 ${frameRight} ${frameTop + r} L ${frameRight} ${frameBottom - r} A ${r} ${r} 0 0 1 ${frameRight - r} ${frameBottom}`
}

/** Open SVG path for one side of a split guide/PAM frame (top, outer side, bottom; no shared edge). */
export function sgRnaOpenFrameOutlinePath(
  piece: 'left' | 'right',
  frameLeft: number,
  frameRight: number,
  frameTop: number,
  frameBottom: number,
  boundaryX: number,
  radius = SG_RNA_SEQUENCE_FRAME_CORNER_RADIUS_PX,
) {
  const outer = sgRnaOpenFrameOuterEdgePath(piece, frameLeft, frameRight, frameTop, frameBottom, radius)
  return `M ${boundaryX} ${frameTop} ${outer} L ${boundaryX} ${frameBottom}`
}

/** Closed fill path for one side of a split guide/PAM frame (rounded outer corners; square boundary). */
export function sgRnaOpenFrameFillPath(
  piece: 'left' | 'right',
  frameLeft: number,
  frameRight: number,
  frameTop: number,
  frameBottom: number,
  boundaryX: number,
  radius = SG_RNA_SEQUENCE_FRAME_CORNER_RADIUS_PX,
) {
  const outer = sgRnaOpenFrameOuterEdgePath(piece, frameLeft, frameRight, frameTop, frameBottom, radius)
  return `M ${boundaryX} ${frameTop} ${outer} L ${boundaryX} ${frameBottom} Z`
}

export function sgRnaSharedBoundaryFillPath(input: {
  segmentPart: 'guide' | 'pam'
  guideLeftOfPam: boolean
  pamLeftOfGuide: boolean
  frameLeft: number
  frameRight: number
  frameTop: number
  frameBottom: number
  boundaryX: number
  radius?: number
}): string | null {
  const piece: 'left' | 'right' | null = input.segmentPart === 'guide'
    ? (input.guideLeftOfPam ? 'left' : input.pamLeftOfGuide ? 'right' : null)
    : (input.guideLeftOfPam ? 'right' : input.pamLeftOfGuide ? 'left' : null)
  if (!piece) return null
  return sgRnaOpenFrameFillPath(
    piece,
    input.frameLeft,
    input.frameRight,
    input.frameTop,
    input.frameBottom,
    input.boundaryX,
    input.radius,
  )
}

export function sgRnaSharedBoundaryOutlinePath(input: {
  segmentPart: 'guide' | 'pam'
  guideLeftOfPam: boolean
  pamLeftOfGuide: boolean
  frameLeft: number
  frameRight: number
  frameTop: number
  frameBottom: number
  boundaryX: number
  radius?: number
}): string | null {
  const piece: 'left' | 'right' | null = input.segmentPart === 'guide'
    ? (input.guideLeftOfPam ? 'left' : input.pamLeftOfGuide ? 'right' : null)
    : (input.guideLeftOfPam ? 'right' : input.pamLeftOfGuide ? 'left' : null)
  if (!piece) return null
  return sgRnaOpenFrameOutlinePath(
    piece,
    input.frameLeft,
    input.frameRight,
    input.frameTop,
    input.frameBottom,
    input.boundaryX,
    input.radius,
  )
}

/** Enzyme labels above the sequence must clear forward sgRNA stacks like primer frames. */
export function sgRnaForwardClearanceSpans(
  segments: readonly SgRnaVisualSegment[],
  rowStart: number,
  rowEnd: number,
  trackInsetPx: number,
  baseStepPx: number,
  lanes: ReturnType<typeof sgRnaRowLanes>,
): SgRnaClearanceSpan[] {
  const forward = sgRnaSegmentsForRow(segments, rowStart, rowEnd, 'forward')
  if (!forward.length) return []
  const laneHeight = sgRnaRowLaneHeightPx(lanes.count)
  const byAnnotation = new Map<string, { left: number; right: number; lane: number }>()
  for (const segment of forward) {
    const left = trackInsetPx + (segment.start - rowStart) * baseStepPx
    const right = trackInsetPx + (segment.end - rowStart) * baseStepPx
    const lane = lanes.lanes.get(segment.annotation.id) ?? 0
    const current = byAnnotation.get(segment.annotation.id)
    byAnnotation.set(segment.annotation.id, {
      left: Math.min(current?.left ?? left, left),
      right: Math.max(current?.right ?? right, right),
      lane,
    })
  }
  return [...byAnnotation.values()].map(({ left, right, lane }) => ({
    left,
    right,
    heightPx: Math.max(SG_RNA_SEQUENCE_LANE_HEIGHT_PX, laneHeight - lane * SG_RNA_SEQUENCE_LANE_HEIGHT_PX),
  }))
}

/** Horizontal gap between routed leader endpoint and label anchor X (deterministic layout QA). */
export function mapCalloutLeaderLabelGapX(callout: {
  connectorEnd: { x: number }
  x: number
  textAnchor: 'start' | 'end' | 'middle'
}) {
  return Math.abs(callout.connectorEnd.x - callout.x)
}

export type SgRnaVisualSegment = {
  annotation: SgRNAAnnotation
  part: 'guide' | 'pam'
  strand: Strand
  start: number
  end: number
  /** Bases in genomic left-to-right order, written on the annotated strand. */
  bases: string
}

/** Split linked guide/PAM annotations at their stored intervals, including origin wraps. */
export function sgRnaVisualSegments(annotations: readonly SgRNAAnnotation[], sequence: string): SgRnaVisualSegment[] {
  const dna = sequence.toUpperCase()
  return annotations.flatMap((annotation) => ([
    { feature: annotation.guide, part: 'guide' as const },
    ...(annotation.pam ? [{ feature: annotation.pam, part: 'pam' as const }] : []),
  ]).flatMap(({ feature, part }) => feature.locations.flatMap((location) => {
    const start = Math.max(0, Math.min(dna.length, location.start))
    const end = Math.max(start, Math.min(dna.length, location.end))
    if (start === end) return []
    const genomic = dna.slice(start, end)
    // Reverse mappings are read right-to-left. Per-base boxes remain aligned to
    // genomic positions, so their left-to-right text is the complement of DNA.
    const bases = location.strand === 'reverse'
      ? [...reverseComplement(genomic)].reverse().join('')
      : genomic
    return [{ annotation, part, strand: location.strand, start, end, bases }]
  })))
}

/** Shortest on-screen length of a whole sgRNA (guide + PAM) on overview maps. */
export const SG_RNA_MAP_MIN_LENGTH_PX = 16

/**
 * Stretch each sgRNA to at least `minLengthPx` on overview maps, keeping guide/PAM proportions
 * and the guide 5′ end (leader anchor) fixed. Positions become fractional bp; sgRNAs already
 * longer than the minimum at the current scale keep their true coordinates.
 */
export function sgRnaMapDisplaySegments<Segment extends Pick<SgRnaVisualSegment, 'annotation' | 'start' | 'end'>>(
  segments: readonly Segment[],
  pxPerBp: number,
  options?: { minLengthPx?: number; minPosition?: number; maxPosition?: number },
): Segment[] {
  const minLengthPx = options?.minLengthPx ?? SG_RNA_MAP_MIN_LENGTH_PX
  if (!(pxPerBp > 0) || !(minLengthPx > 0)) return [...segments]
  const spans = new Map<string, { start: number; end: number; covered: number }>()
  for (const segment of segments) {
    const current = spans.get(segment.annotation.id)
    spans.set(segment.annotation.id, {
      start: Math.min(current?.start ?? segment.start, segment.start),
      end: Math.max(current?.end ?? segment.end, segment.end),
      covered: (current?.covered ?? 0) + segment.end - segment.start,
    })
  }
  const minPosition = options?.minPosition ?? Number.NEGATIVE_INFINITY
  const maxPosition = options?.maxPosition ?? Number.POSITIVE_INFINITY
  return segments.map((segment) => {
    const span = spans.get(segment.annotation.id)!
    const spanBp = span.end - span.start
    // Origin-wrapping pairs span most of the sequence; leave them at true coordinates.
    if (spanBp <= 0 || spanBp > span.covered * 2) return segment
    const lengthPx = spanBp * pxPerBp
    if (lengthPx >= minLengthPx) return segment
    const scale = minLengthPx / lengthPx
    const anchor = sgRnaGuideAnchorBp(segment.annotation)
    const stretch = (position: number) => Math.max(minPosition, Math.min(maxPosition, anchor + (position - anchor) * scale))
    return { ...segment, start: stretch(segment.start), end: stretch(segment.end) }
  })
}

export const SG_RNA_MAP_PAM_ARROW_MIN_LENGTH_PX = 9
export const SG_RNA_MAP_PAM_ARROW_HALF_WIDTH_PX = 3

/**
 * PAM arrowhead along the map ruler: tip at the PAM end in the strand direction, base pulled
 * back to at least the minimum on-screen length so short PAMs still read as a point.
 */
export function sgRnaMapPamArrowSpan(segment: Pick<SgRnaVisualSegment, 'strand' | 'start' | 'end'>, pxPerBp: number) {
  const direction = segment.strand === 'reverse' ? -1 : 1
  const tipBp = direction > 0 ? segment.end : segment.start
  const minLengthBp = pxPerBp > 0 ? SG_RNA_MAP_PAM_ARROW_MIN_LENGTH_PX / pxPerBp : 0
  const lengthBp = Math.max(segment.end - segment.start, minLengthBp)
  return { tipBp, baseBp: tipBp - direction * lengthBp }
}

export function sgRnaSegmentsForRow(segments: readonly SgRnaVisualSegment[], rowStart: number, rowEnd: number, strand: Strand) {
  return segments.flatMap((segment) => {
    if (segment.strand !== strand) return []
    const start = Math.max(rowStart, segment.start)
    const end = Math.min(rowEnd, segment.end)
    if (end <= start) return []
    return [{ ...segment, start, end, bases: segment.bases.slice(start - segment.start, end - segment.start) }]
  })
}

/** Adjacent guide and PAM pieces share one lane even when a row breaks between them. */
export function sgRnaRowLanes(segments: readonly SgRnaVisualSegment[]) {
  const spans = new Map<string, { start: number; end: number }>()
  for (const segment of segments) {
    const current = spans.get(segment.annotation.id)
    spans.set(segment.annotation.id, {
      start: Math.min(current?.start ?? segment.start, segment.start),
      end: Math.max(current?.end ?? segment.end, segment.end),
    })
  }
  const laneEnds: number[] = []
  const lanes = new Map<string, number>()
  for (const [id, span] of [...spans].sort((a, b) => a[1].start - b[1].start)) {
    let lane = laneEnds.findIndex((end) => span.start >= end)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = span.end
    lanes.set(id, lane)
  }
  return { lanes, count: laneEnds.length }
}
