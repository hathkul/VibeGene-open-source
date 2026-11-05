import { describe, expect, it } from 'vitest'
import {
  LINEAR_HORSESHOE_GAP_DEG,
  circularMapAngle,
  circularMapPolarPoint,
  circularMapPositionFromAngle,
  circularMapStartAngle,
  circularMapSweepRadians,
} from '../src/domain/circularMapGeometry'

describe('circularMapGeometry', () => {
  it('keeps a full 360° sweep for circular topology', () => {
    expect(circularMapSweepRadians('circular')).toBeCloseTo(Math.PI * 2, 10)
    expect(circularMapStartAngle('circular')).toBeCloseTo(-Math.PI / 2, 10)
    expect(circularMapAngle(0, 1000, 'circular')).toBeCloseTo(-Math.PI / 2, 10)
    expect(circularMapAngle(500, 1000, 'circular')).toBeCloseTo(Math.PI / 2, 10)
  })

  it('opens a 20° gap at 12 o’clock for linear topology', () => {
    const gap = (LINEAR_HORSESHOE_GAP_DEG * Math.PI) / 180
    expect(LINEAR_HORSESHOE_GAP_DEG).toBe(20)
    expect(circularMapSweepRadians('linear')).toBeCloseTo(Math.PI * 2 - gap, 10)
    expect(circularMapStartAngle('linear')).toBeCloseTo(-Math.PI / 2 + gap / 2, 10)

    const start = circularMapAngle(0, 1000, 'linear')
    expect(start).toBeCloseTo(-Math.PI / 2 + gap / 2, 10)
    expect(circularMapAngle(999, 1000, 'linear')).toBeCloseTo(
      -Math.PI / 2 + gap / 2 + (999 / 1000) * (Math.PI * 2 - gap),
      8,
    )

    // Gap is centered on 12 o’clock: the open sector midpoint is -π/2.
    expect(start - gap / 2).toBeCloseTo(-Math.PI / 2, 10)
    const horseshoeEnd = circularMapStartAngle('linear') + circularMapSweepRadians('linear')
    expect(horseshoeEnd + gap / 2).toBeCloseTo(-Math.PI / 2 + Math.PI * 2, 10)
  })

  it('maps pointer angles back to bases, clamping the open gap', () => {
    const length = 1000
    expect(circularMapPositionFromAngle(circularMapAngle(0, length, 'linear'), length, 'linear')).toBe(0)
    expect(circularMapPositionFromAngle(circularMapAngle(500, length, 'linear'), length, 'linear')).toBe(500)

    // Straight up (into the gap) should clamp to an end, not the middle of the sequence.
    const twelveOClock = -Math.PI / 2
    const fromGap = circularMapPositionFromAngle(twelveOClock, length, 'linear')
    expect(fromGap === 0 || fromGap === length - 1).toBe(true)
  })

  it('places linear position 0 and the last base near the top gap ends', () => {
    const p0 = circularMapPolarPoint(0, 1000, 0, 0, 100, 0, 'linear')
    const pLast = circularMapPolarPoint(999, 1000, 0, 0, 100, 0, 'linear')
    expect(p0.y).toBeLessThan(-90)
    expect(pLast.y).toBeLessThan(-90)
    expect(p0.x).toBeGreaterThan(0)
    expect(pLast.x).toBeLessThan(0)
  })

  it('keeps exclusive end (== length) on the horseshoe terminus, not across the gap', () => {
    const length = 1000
    const startAngle = circularMapStartAngle('linear')
    const endAngle = startAngle + circularMapSweepRadians('linear')
    expect(circularMapAngle(length, length, 'linear')).toBeCloseTo(endAngle, 10)
    expect(circularMapAngle(0, length, 'linear')).toBeCloseTo(startAngle, 10)
    // Must not equal the position-0 angle (that would cross the gap).
    expect(circularMapAngle(length, length, 'linear')).not.toBeCloseTo(circularMapAngle(0, length, 'linear'), 5)

    const atEnd = circularMapPolarPoint(length, length, 0, 0, 100, 0, 'linear')
    const atZero = circularMapPolarPoint(0, length, 0, 0, 100, 0, 'linear')
    expect(atEnd.x).toBeLessThan(0)
    expect(atZero.x).toBeGreaterThan(0)
  })
})
