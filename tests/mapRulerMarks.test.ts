import { describe, expect, it } from 'vitest'
import { circularRulerLabelArc, circularRulerLabelRadius, CIRCULAR_RULER_LABEL_FONT_PX } from '../src/domain/circularMapGeometry'
import {
  CIRCULAR_RULER_MAX_MARKS,
  CIRCULAR_RULER_MIN_MARKS,
  circularRulerMarkPositions,
  linearRulerMarkPositions,
} from '../src/domain/mapRulerMarks'

describe('mapRulerMarks', () => {
  it('keeps linear size notches in the 4–6 range for typical plasmids', () => {
    for (const length of [2686, 5000, 10000, 48000]) {
      const marks = linearRulerMarkPositions(length)
      expect(marks.length).toBeGreaterThanOrEqual(4)
      expect(marks.length).toBeLessThanOrEqual(6)
      expect(marks[0]).toBeGreaterThan(0)
      expect(marks.at(-1)).toBeLessThan(length)
    }
  })

  it('keeps circular size notches in the 4–12 range for typical plasmids', () => {
    for (const length of [800, 2686, 5000, 10000, 15000, 48000, 100000]) {
      const marks = circularRulerMarkPositions(length)
      expect(marks.length).toBeGreaterThanOrEqual(CIRCULAR_RULER_MIN_MARKS)
      expect(marks.length).toBeLessThanOrEqual(CIRCULAR_RULER_MAX_MARKS)
      expect(marks[0]).toBeGreaterThan(0)
      expect(marks.at(-1)).toBeLessThan(length)
      const step = marks[1]! - marks[0]!
      for (let i = 1; i < marks.length; i++) {
        expect(marks[i]! - marks[i - 1]!).toBe(step)
      }
    }
  })
})

describe('circularRulerLabelArc', () => {
  it('pulls labels inward of the ruler so a central baseline cannot overlap the ring', () => {
    const ringRadius = 200
    const innerEdgeOffset = -3
    const tickLength = 6
    const labelRadius = circularRulerLabelRadius(ringRadius, innerEdgeOffset, tickLength)
    const innerEdge = ringRadius + innerEdgeOffset
    expect(innerEdge - labelRadius).toBeGreaterThanOrEqual(tickLength / 2 + CIRCULAR_RULER_LABEL_FONT_PX / 2)
  })

  it('places the arc beside the tick and reverses the bottom half', () => {
    const length = 8000
    const radius = 120
    const right = circularRulerLabelArc(length * 0.25, length, radius, 40)
    const bottom = circularRulerLabelArc(length * 0.5, length, radius, 40)
    const left = circularRulerLabelArc(length * 0.6, length, radius, 40)
    expect(right.reverse).toBe(false)
    expect(right.sweepFlag).toBe(1)
    expect(right.start).not.toBe(length * 0.25)
    expect(bottom.reverse).toBe(true)
    expect(bottom.sweepFlag).toBe(0)
    expect(left.reverse).toBe(true)
    expect(left.start).not.toBe(length * 0.6)
  })
})
