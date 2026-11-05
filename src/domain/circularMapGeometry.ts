import type { Topology } from './types'

/** Open gap at 12 o'clock for linear sequences shown in circular map mode. */
export const LINEAR_HORSESHOE_GAP_DEG = 20

export function circularMapSweepRadians(topology: Topology = 'circular') {
  if (topology === 'circular') return Math.PI * 2
  return Math.PI * 2 - (LINEAR_HORSESHOE_GAP_DEG * Math.PI) / 180
}

/** Start angle (from +x, y-down) for position 0. Circular: 12 o'clock. Linear: just past the gap. */
export function circularMapStartAngle(topology: Topology = 'circular') {
  if (topology === 'circular') return -Math.PI / 2
  const gap = (LINEAR_HORSESHOE_GAP_DEG * Math.PI) / 180
  return -Math.PI / 2 + gap / 2
}

/** Polar angle for a sequence position on the circular (or horseshoe) map. */
export function circularMapAngle(position: number, sequenceLength: number, topology: Topology = 'circular') {
  const length = Math.max(1, sequenceLength)
  if (topology === 'linear') {
    // Half-open ends use `end === length`. That must map to the horseshoe terminus
    // (t = 1), not wrap to 0 — wrapping would drag the arc across the open gap.
    const clamped = Math.max(0, Math.min(length, position))
    const t = clamped / length
    return circularMapStartAngle(topology) + t * circularMapSweepRadians(topology)
  }
  const normalized = ((position % length) + length) % length
  const t = normalized / length
  return circularMapStartAngle(topology) + t * circularMapSweepRadians(topology)
}

/** Inverse of `circularMapAngle` for pointer → base mapping. */
export function circularMapPositionFromAngle(angle: number, sequenceLength: number, topology: Topology = 'circular') {
  const length = Math.max(1, sequenceLength)
  const start = circularMapStartAngle(topology)
  const sweep = circularMapSweepRadians(topology)
  let delta = angle - start
  while (delta < 0) delta += Math.PI * 2
  while (delta >= Math.PI * 2) delta -= Math.PI * 2
  if (topology === 'linear') {
    // Clicks in the open gap clamp to the nearer end.
    if (delta > sweep) {
      const intoGap = delta - sweep
      const gap = Math.PI * 2 - sweep
      delta = intoGap < gap / 2 ? sweep : 0
    }
  }
  const t = Math.max(0, Math.min(1, delta / sweep))
  return Math.max(0, Math.min(length - 1, Math.round(t * length)))
}

export function circularMapPolarPoint(
  position: number,
  sequenceLength: number,
  centerX: number,
  centerY: number,
  radius: number,
  offset = 0,
  topology: Topology = 'circular',
) {
  const angle = circularMapAngle(position, sequenceLength, topology)
  return {
    x: centerX + Math.cos(angle) * (radius + offset),
    y: centerY + Math.sin(angle) * (radius + offset),
  }
}

/** Gap from the tick to the start of a circular ruler label, along the ring. */
export const CIRCULAR_RULER_LABEL_GAP_PX = 5
/** Matches `.map-ruler-label` font-size; middle baseline extends half of this toward the ring. */
export const CIRCULAR_RULER_LABEL_FONT_PX = 9
/** Extra air between the letter and the inner ruler edge, on top of half the font. */
export const CIRCULAR_RULER_LABEL_RING_CLEARANCE_PX = 2

export function circularRulerLabelRadius(
  ringRadius: number,
  innerEdgeOffset: number,
  tickLength: number,
) {
  return (
    ringRadius +
    innerEdgeOffset -
    tickLength / 2 -
    CIRCULAR_RULER_LABEL_FONT_PX / 2 -
    CIRCULAR_RULER_LABEL_RING_CLEARANCE_PX
  )
}

export function circularRulerLabelReadsReversed(position: number, sequenceLength: number, topology: Topology = 'circular') {
  const angle = circularMapAngle(position, sequenceLength, topology)
  const clockwiseDeg = (angle * 180) / Math.PI + 90
  const normalized = ((clockwiseDeg % 360) + 360) % 360
  return normalized > 90 && normalized < 270
}

function wrapRulerPosition(position: number, sequenceLength: number, topology: Topology) {
  const length = Math.max(1, sequenceLength)
  if (topology === 'linear') return Math.max(0, Math.min(length, position))
  return ((position % length) + length) % length
}

/**
 * Arc for a concentric size-tick label, offset along the ring so it sits beside the notch.
 * Reverse the sweep on the bottom half so the text stays upright. Do not use textPath `side`:
 * that shifts the baseline to the opposite side of the path in some WebViews.
 */
export function circularRulerLabelArc(
  tickPosition: number,
  sequenceLength: number,
  labelRadius: number,
  labelWidthPx: number,
  topology: Topology = 'circular',
  gapPx = CIRCULAR_RULER_LABEL_GAP_PX,
) {
  const length = Math.max(1, sequenceLength)
  const radius = Math.max(1, labelRadius)
  const sweep = circularMapSweepRadians(topology)
  const pxToBp = (px: number) => (px / radius) * (length / sweep)
  const gapBp = pxToBp(gapPx)
  const spanBp = Math.max(1, pxToBp(Math.max(8, labelWidthPx)))
  const reverse = circularRulerLabelReadsReversed(tickPosition, length, topology)
  if (!reverse) {
    return {
      start: wrapRulerPosition(tickPosition + gapBp, length, topology),
      end: wrapRulerPosition(tickPosition + gapBp + spanBp, length, topology),
      span: spanBp,
      reverse: false,
      sweepFlag: 1 as const,
    }
  }
  return {
    start: wrapRulerPosition(tickPosition - gapBp, length, topology),
    end: wrapRulerPosition(tickPosition - gapBp - spanBp, length, topology),
    span: spanBp,
    reverse: true,
    sweepFlag: 0 as const,
  }
}
