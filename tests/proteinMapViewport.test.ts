import { describe, expect, it } from 'vitest'
import {
  clampProteinMapViewRange,
  DESKTOP_PROTEIN_MAP_MIN_VIEWPORT_WIDTH,
  MOBILE_PROTEIN_MAP_MIN_VIEWPORT_WIDTH,
  proteinMapBaseWidthFromScrollViewport,
  proteinMapViewRangeAfterHorizontalDrag,
} from '../src/ui/proteinMapViewport'

describe('proteinMapBaseWidthFromScrollViewport', () => {
  it('sizes mobile shell to the scroll viewport with a 320px floor', () => {
    expect(proteinMapBaseWidthFromScrollViewport(390, true)).toBe(390)
    expect(proteinMapBaseWidthFromScrollViewport(280, true)).toBe(MOBILE_PROTEIN_MAP_MIN_VIEWPORT_WIDTH)
    expect(proteinMapBaseWidthFromScrollViewport(0, true)).toBe(MOBILE_PROTEIN_MAP_MIN_VIEWPORT_WIDTH)
  })

  it('keeps desktop and Tauri on the 760px minimum', () => {
    expect(proteinMapBaseWidthFromScrollViewport(390, false)).toBe(DESKTOP_PROTEIN_MAP_MIN_VIEWPORT_WIDTH)
    expect(proteinMapBaseWidthFromScrollViewport(900, false)).toBe(900)
    expect(proteinMapBaseWidthFromScrollViewport(0, false)).toBe(DESKTOP_PROTEIN_MAP_MIN_VIEWPORT_WIDTH)
  })
})

describe('proteinMapViewRangeAfterHorizontalDrag', () => {
  const sequenceLength = 200
  const viewRange = { start: 40, end: 90 }

  it('shows earlier residues when the map is dragged to the right', () => {
    const next = proteinMapViewRangeAfterHorizontalDrag(viewRange, sequenceLength, 50, 500)
    expect(next.start).toBeLessThan(viewRange.start)
    expect(next.end - next.start).toBe(viewRange.end - viewRange.start)
  })

  it('shows later residues when the map is dragged to the left', () => {
    const next = proteinMapViewRangeAfterHorizontalDrag(viewRange, sequenceLength, -50, 500)
    expect(next.start).toBeGreaterThan(viewRange.start)
    expect(next.end - next.start).toBe(viewRange.end - viewRange.start)
  })

  it('clamps at the sequence start when dragging far right', () => {
    const next = proteinMapViewRangeAfterHorizontalDrag(viewRange, sequenceLength, 5000, 500)
    expect(next.start).toBe(0)
    expect(next.end).toBe(viewRange.end - viewRange.start)
  })

  it('clamps at the sequence end when dragging far left', () => {
    const nearEnd = { start: 150, end: 200 }
    const next = proteinMapViewRangeAfterHorizontalDrag(nearEnd, sequenceLength, -5000, 500)
    expect(next.end).toBe(sequenceLength)
    expect(next.start).toBe(sequenceLength - (nearEnd.end - nearEnd.start))
  })

  it('returns the same range for zero drag delta', () => {
    expect(proteinMapViewRangeAfterHorizontalDrag(viewRange, sequenceLength, 0, 500)).toEqual(viewRange)
  })
})

describe('clampProteinMapViewRange', () => {
  it('preserves window length inside sequence bounds', () => {
    expect(clampProteinMapViewRange({ start: -20, end: 30 }, 200)).toEqual({ start: 0, end: 50 })
    expect(clampProteinMapViewRange({ start: 180, end: 230 }, 200)).toEqual({ start: 150, end: 200 })
  })
})
