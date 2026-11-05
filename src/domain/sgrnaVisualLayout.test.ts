import { describe, expect, it } from 'vitest'
import {
  PRIMER_MAP_RULER_OFFSET_PX,
  SG_RNA_MAP_BINDING_EXTRA_OFFSET_PX,
  SG_RNA_MAP_CALLOUT_LABEL_PADDING_PX,
  SG_RNA_MAP_MIN_LENGTH_PX,
  SG_RNA_MAP_PAM_ARROW_MIN_LENGTH_PX,
  SG_RNA_SEQUENCE_FRAME_BODY_HEIGHT_PX,
  SG_RNA_SEQUENCE_FRAME_CORNER_RADIUS_PX,
  SG_RNA_SEQUENCE_LABEL_CENTER_OFFSET_PX,
  SG_RNA_SEQUENCE_LANE_HEIGHT_PX,
  linearMapLeftRoutedLabelGapPx,
  mapCalloutLeaderLabelGapX,
  sgRnaCircularBindingRadius,
  sgRnaForwardClearanceSpans,
  sgRnaGuidePamBoundaryBasePair,
  sgRnaGuidePamBoundaryX,
  sgRnaLinearBindingY,
  sgRnaMapCalloutReservedWidth,
  sgRnaMapDisplaySegments,
  sgRnaMapPamArrowSpan,
  sgRnaMapBindingOffsetPx,
  sgRnaRowLaneHeightPx,
  sgRnaRowLanes,
  sgRnaSequenceFrameHorizontalBounds,
  sgRnaSequenceFrameTop,
  sgRnaSequenceNameLabelY,
  sgRnaLinearCalloutTextPlacement,
  sgRnaOpenFrameFillPath,
  sgRnaOpenFrameOutlinePath,
  sgRnaSharedBoundaryOutlinePath,
  sgRnaVisualSegments,
} from './sgrnaVisualLayout'
import { PRIMER_FRAME_EDGE_PAD_RATIO } from './primerSequenceLayout'
import { reverseComplement } from './sequence'
import { createSgRNAFeatures, findSgRNATargets, groupSgRNAFeatures, SGRNA_PRESETS } from './sgrna'

const SP = SGRNA_PRESETS[0]!

const GUIDE = 'ACTGCCCTTGCACACTGGGG'

describe('sgRNA visual layout geometry', () => {
  it('uses primer-comparable map binding offset beyond the ruler line', () => {
    expect(sgRnaMapBindingOffsetPx('forward')).toBe(-(PRIMER_MAP_RULER_OFFSET_PX + SG_RNA_MAP_BINDING_EXTRA_OFFSET_PX))
    expect(sgRnaMapBindingOffsetPx('reverse')).toBe(PRIMER_MAP_RULER_OFFSET_PX + SG_RNA_MAP_BINDING_EXTRA_OFFSET_PX)
    expect(sgRnaLinearBindingY(100, 'forward')).toBe(100 - PRIMER_MAP_RULER_OFFSET_PX - SG_RNA_MAP_BINDING_EXTRA_OFFSET_PX)
    expect(sgRnaCircularBindingRadius(200, 'reverse')).toBe(200 + PRIMER_MAP_RULER_OFFSET_PX + SG_RNA_MAP_BINDING_EXTRA_OFFSET_PX)
  })

  it('pads sequence frames horizontally like primer frames without shifting coordinates', () => {
    const baseStepPx = 12
    const bounds = sgRnaSequenceFrameHorizontalBounds(10, 20, 0, 8, baseStepPx)
    const pad = baseStepPx * PRIMER_FRAME_EDGE_PAD_RATIO
    expect(bounds.innerLeft).toBe(8 + 10 * baseStepPx)
    expect(bounds.innerRight).toBe(8 + 20 * baseStepPx)
    expect(bounds.left).toBe(bounds.innerLeft - pad)
    expect(bounds.right).toBe(bounds.innerRight + pad)
  })

  it('reserves stacked forward clearance height per sgRNA lane', () => {
    const sequence = `${'A'.repeat(30)}${GUIDE}AGGTTT${'T'.repeat(20)}${GUIDE}AGGTTT`
    const hits = findSgRNATargets(sequence, GUIDE, 'linear', SP)
    expect(hits.length).toBeGreaterThanOrEqual(2)
    const features = hits.slice(0, 2).flatMap((hit, index) =>
      createSgRNAFeatures(hit, {
        name: index === 0 ? 'Guide A' : 'Guide B',
        nuclease: 'SpCas9',
        pamMotif: 'NGG',
        pamSide: '3prime',
        spacer: GUIDE,
      }),
    )
    const segments = sgRnaVisualSegments(groupSgRNAFeatures(features), sequence)
    const lanes = sgRnaRowLanes(segments)
    expect(lanes.count).toBeGreaterThanOrEqual(1)
    expect(sgRnaRowLaneHeightPx(lanes.count)).toBe(lanes.count * SG_RNA_SEQUENCE_LANE_HEIGHT_PX)
    const spans = sgRnaForwardClearanceSpans(segments, 0, sequence.length, 0, 10, lanes)
    expect(spans).toHaveLength(2)
    expect(spans.every((span) => span.heightPx >= SG_RNA_SEQUENCE_LANE_HEIGHT_PX)).toBe(true)
  })

  it('keeps left-routed sgRNA label reserve within enzyme-like padding of rendered width', () => {
    const label = 'SpCas9 guide 1'
    const rendered = 72.4
    const reserved = sgRnaMapCalloutReservedWidth(label, () => rendered)
    expect(reserved - rendered).toBe(SG_RNA_MAP_CALLOUT_LABEL_PADDING_PX)
    expect(linearMapLeftRoutedLabelGapPx(reserved, rendered)).toBe(SG_RNA_MAP_CALLOUT_LABEL_PADDING_PX)
  })

  it('abuts guide and PAM frames on the shared base boundary without double padding', () => {
    const baseStepPx = 12
    const boundary = sgRnaGuidePamBoundaryBasePair({ start: 10, end: 30 }, { start: 30, end: 33 })
    expect(boundary).toBe(30)
    const guide = sgRnaSequenceFrameHorizontalBounds(10, 30, 0, 8, baseStepPx, { omitPadRight: true })
    const pam = sgRnaSequenceFrameHorizontalBounds(30, 33, 0, 8, baseStepPx, { omitPadLeft: true })
    expect(guide.right).toBe(pam.left)
    expect(sgRnaGuidePamBoundaryX(boundary!, 0, 8, baseStepPx)).toBe(8 + 30 * baseStepPx)
  })

  it('draws open outline paths without the shared guide/PAM edge', () => {
    const left = 425.5
    const boundary = 628
    const top = 15
    const bottom = 34
    const r = SG_RNA_SEQUENCE_FRAME_CORNER_RADIUS_PX
    const guidePath = sgRnaSharedBoundaryOutlinePath({
      segmentPart: 'guide',
      guideLeftOfPam: true,
      pamLeftOfGuide: false,
      frameLeft: left,
      frameRight: 900,
      frameTop: top,
      frameBottom: bottom,
      boundaryX: boundary,
    })
    expect(guidePath).toMatch(/^M 628 15 /)
    expect(guidePath).toMatch(/ A /)
    expect(guidePath).toMatch(/ L 628 34$/)
    const pamPath = sgRnaSharedBoundaryOutlinePath({
      segmentPart: 'pam',
      guideLeftOfPam: true,
      pamLeftOfGuide: false,
      frameLeft: boundary,
      frameRight: 900,
      frameTop: top,
      frameBottom: bottom,
      boundaryX: boundary,
    })
    expect(pamPath).toMatch(/^M 628 15 /)
    expect(pamPath).toMatch(/ A /)
    expect(pamPath).toMatch(/ L 628 34$/)
    const fillPath = sgRnaOpenFrameFillPath('left', left, 900, top, bottom, boundary, r)
    expect(fillPath).toMatch(/ A /)
    expect(fillPath).toMatch(/ Z$/)
    expect(sgRnaOpenFrameOutlinePath('left', left, 900, top, bottom, boundary, 0)).toBe(
      `M ${boundary} ${top} L ${left} ${top} L ${left} ${bottom} L ${boundary} ${bottom}`,
    )
  })

  it('anchors left-routed linear map labels at the leader end', () => {
    expect(sgRnaLinearCalloutTextPlacement(40, 100, 'start')).toEqual({ x: 100, textAnchor: 'end' })
    expect(sgRnaLinearCalloutTextPlacement(99.4, 100, 'start')).toEqual({ x: 100, textAnchor: 'end' })
    expect(sgRnaLinearCalloutTextPlacement(99.6, 100, 'start')).toEqual({ x: 99.6, textAnchor: 'start' })
    expect(sgRnaLinearCalloutTextPlacement(100, 100, 'start')).toEqual({ x: 100, textAnchor: 'start' })
    expect(sgRnaLinearCalloutTextPlacement(120, 80, 'start')).toEqual({ x: 120, textAnchor: 'start' })
    expect(sgRnaLinearCalloutTextPlacement(50, 60, 'end')).toEqual({ x: 50, textAnchor: 'end' })
  })

  it('places sequence name labels offset from the frame edge', () => {
    const forwardFrameTop = sgRnaSequenceFrameTop(0, 'forward')
    expect(sgRnaSequenceNameLabelY('forward', 0, forwardFrameTop)).toBe(
      forwardFrameTop - SG_RNA_SEQUENCE_LABEL_CENTER_OFFSET_PX,
    )
    const laneTop = SG_RNA_SEQUENCE_LANE_HEIGHT_PX
    const reverseFrameTop = sgRnaSequenceFrameTop(laneTop, 'reverse')
    expect(sgRnaSequenceNameLabelY('reverse', laneTop, reverseFrameTop)).toBe(
      reverseFrameTop + SG_RNA_SEQUENCE_FRAME_BODY_HEIGHT_PX + SG_RNA_SEQUENCE_LABEL_CENTER_OFFSET_PX,
    )
  })

  it('measures leader-to-label horizontal gap from routed callout geometry', () => {
    expect(
      mapCalloutLeaderLabelGapX({
        connectorEnd: { x: 120 },
        x: 118,
        textAnchor: 'start',
      }),
    ).toBe(2)
    expect(
      mapCalloutLeaderLabelGapX({
        connectorEnd: { x: 80 },
        x: 140,
        textAnchor: 'start',
      }),
    ).toBe(60)
  })
})

describe('sgRnaMapPamArrowSpan', () => {
  it('points along the strand and keeps a minimum on-screen length', () => {
    expect(sgRnaMapPamArrowSpan({ strand: 'forward', start: 120, end: 123 }, 10)).toEqual({ tipBp: 123, baseBp: 120 })
    expect(sgRnaMapPamArrowSpan({ strand: 'reverse', start: 120, end: 123 }, 10)).toEqual({ tipBp: 120, baseBp: 123 })
    const short = sgRnaMapPamArrowSpan({ strand: 'forward', start: 120, end: 123 }, 1)
    expect(short.tipBp).toBe(123)
    expect(short.tipBp - short.baseBp).toBe(SG_RNA_MAP_PAM_ARROW_MIN_LENGTH_PX)
  })
})

describe('sgRnaMapDisplaySegments', () => {
  const sequence = `${'T'.repeat(100)}${GUIDE}AGG${'T'.repeat(100)}`
  const segmentsFor = (strandSequence: string) => {
    const hit = findSgRNATargets(strandSequence, GUIDE, 'linear', SP)[0]!
    const features = createSgRNAFeatures(hit, { name: 'g', nuclease: 'SpCas9', pamMotif: 'NGG', pamSide: '3prime', spacer: GUIDE })
    return sgRnaVisualSegments(groupSgRNAFeatures(features), strandSequence)
  }

  it('keeps true coordinates once the sgRNA is at least the minimum length on screen', () => {
    const segments = segmentsFor(sequence)
    expect(sgRnaMapDisplaySegments(segments, SG_RNA_MAP_MIN_LENGTH_PX / 23)).toEqual(segments)
  })

  it('stretches guide and PAM together from the guide 5′ end when zoomed out', () => {
    const segments = segmentsFor(sequence)
    const pxPerBp = 0.1
    const stretched = sgRnaMapDisplaySegments(segments, pxPerBp)
    const [guide, pam] = stretched
    expect(guide!.start).toBe(100)
    expect(pam!.start).toBeCloseTo(guide!.end)
    expect((pam!.end - guide!.start) * pxPerBp).toBeCloseTo(SG_RNA_MAP_MIN_LENGTH_PX)
    expect((guide!.end - guide!.start) / (pam!.end - pam!.start)).toBeCloseTo(20 / 3)
  })

  it('stretches reverse guides leftward from their 5′ end and honours bounds', () => {
    const reverse = reverseComplement(sequence)
    const segments = segmentsFor(reverse)
    const guide = segments.find((segment) => segment.part === 'guide')!
    const stretched = sgRnaMapDisplaySegments(segments, 0.1).find((segment) => segment.part === 'guide')!
    expect(stretched.end).toBe(guide.end)
    expect(stretched.start).toBeLessThan(guide.start)
    const clamped = sgRnaMapDisplaySegments(segments, 0.001, { minPosition: 0, maxPosition: reverse.length })
    expect(Math.min(...clamped.map((segment) => segment.start))).toBe(0)
  })
})
