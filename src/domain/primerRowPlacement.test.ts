import { describe, expect, it } from 'vitest'
import { themeFixturePalette } from '../test-support/themeFixturePalette'
import type { PrimerFrameDisplay } from './primerSequenceLayout'
import { assignPrimerPlacementLanes, primerPackingRangeForRow, reversePrimerFrameOffsets, type PrimerRowPlacementCandidate } from './primerRowPlacement'

function display(name: string, strand: 'forward' | 'reverse' = 'forward'): PrimerFrameDisplay {
  return {
    primerId: name,
    name,
    color: themeFixturePalette.blue,
    strand,
    sequence: 'ACGT',
    glyphs: [],
    templateSpanStart: 0,
    templateSpanEnd: 4,
    selectRange: { start: 0, end: 4 },
  }
}

function candidate(name: string, left: number, right: number, labelOverflow = 0): PrimerRowPlacementCandidate {
  return { display: display(name), left, right, stackHeight: 20, labelOverflow }
}

describe('primer row placement', () => {
  it('packs overlapping primers into lanes and keeps forward label overflow between lanes', () => {
    const placements = assignPrimerPlacementLanes([
      candidate('lower', 0, 30, 8),
      candidate('upper', 10, 40),
      candidate('separate', 42, 55),
    ], 'forward', 10, 12)

    expect(placements.map(({ display: item, lane, yOffset, laneHeight }) => ({ name: item.name, lane, yOffset, laneHeight }))).toEqual([
      { name: 'lower', lane: 0, yOffset: 32, laneHeight: 20 },
      { name: 'upper', lane: 1, yOffset: 0, laneHeight: 20 },
      { name: 'separate', lane: 0, yOffset: 32, laneHeight: 20 },
    ])
  })

  it('normalizes reverse frame offsets only when their horizontal spans overlap', () => {
    const placements = assignPrimerPlacementLanes([
      { ...candidate('upper', 0, 30), display: display('upper', 'reverse'), stackHeight: 20 },
      { ...candidate('lower', 10, 40), display: display('lower', 'reverse'), stackHeight: 15 },
      { ...candidate('clear', 42, 55), display: display('clear', 'reverse'), stackHeight: 15 },
    ], 'reverse', 10, 12)
    const offsets = reversePrimerFrameOffsets(placements, (placement) => placement.display.name === 'upper' ? 2 : 0)

    expect(offsets.get(placements[0]!)).toBe(2)
    expect(offsets.get(placements[1]!)).toBe(2)
    expect(offsets.get(placements[2]!)).toBe(0)
  })

  it('maps nonmerged and merged frame coordinates back to the same sequence range', () => {
    const nonmerged = primerPackingRangeForRow(20, 50, 100, 110, 10, 0)
    const merged = primerPackingRangeForRow(48, 78, 100, 110, 10, 28)

    expect(nonmerged).toEqual({ start: 102, end: 105 })
    expect(merged).toEqual(nonmerged)
  })
})
