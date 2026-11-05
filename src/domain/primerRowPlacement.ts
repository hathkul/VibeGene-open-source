import type { PrimerFrameDisplay } from './primerSequenceLayout'

export type PrimerRowPlacement = {
  display: PrimerFrameDisplay
  lane: number
  left: number
  right: number
  yOffset: number
  stackHeight: number
  labelOverflow: number
  laneHeight: number
}

export type PrimerRowPlacementCandidate = {
  display: PrimerFrameDisplay
  left: number
  right: number
  stackHeight: number
  labelOverflow: number
}

export function assignPrimerPlacementLanes(
  candidates: readonly PrimerRowPlacementCandidate[],
  strand: 'forward' | 'reverse',
  baseStepPx: number,
  labelFontSizePx: number,
): PrimerRowPlacement[] {
  const laneRights: number[] = []
  const placed = candidates
    .toSorted((a, b) => a.left - b.left || a.right - b.right || a.display.name.localeCompare(b.display.name))
    .map((placement) => {
      let lane = laneRights.findIndex((right) => placement.left >= right + baseStepPx * 0.5)
      if (lane === -1) {
        lane = laneRights.length
        laneRights.push(placement.right)
      } else {
        laneRights[lane] = placement.right
      }
      return { ...placement, lane }
    })

  const laneCount = placed.reduce((count, placement) => Math.max(count, placement.lane + 1), 0)
  const laneHeights = Array.from({ length: laneCount }, () => 0)
  for (const placement of placed) {
    laneHeights[placement.lane] = Math.max(laneHeights[placement.lane]!, placement.stackHeight)
  }
  const laneGaps = Array.from({ length: Math.max(0, laneCount - 1) }, () => 0)
  if (strand === 'forward') {
    for (const placement of placed) {
      const upperLane = placement.lane + 1
      if (placement.labelOverflow <= 0 || upperLane >= laneHeights.length) continue
      laneGaps[placement.lane] = Math.max(
        laneGaps[placement.lane]!,
        placement.labelOverflow + Math.max(4, labelFontSizePx * 0.25),
      )
    }
  }
  const laneOffsets = Array.from({ length: laneCount }, () => 0)
  if (strand === 'reverse') {
    let y = 0
    for (let lane = 0; lane < laneCount; lane += 1) {
      laneOffsets[lane] = y
      y += laneHeights[lane]!
    }
  } else {
    const topOverflow = Math.max(0, ...placed
      .filter((placement) => placement.lane === laneCount - 1)
      .map((placement) => placement.labelOverflow))
    let y = topOverflow > 0 ? topOverflow + Math.max(4, labelFontSizePx * 0.25) : 0
    for (let lane = laneCount - 1; lane >= 0; lane -= 1) {
      laneOffsets[lane] = y
      y += laneHeights[lane]!
      if (lane > 0) y += laneGaps[lane - 1]!
    }
  }

  return placed.map((placement) => ({
    ...placement,
    yOffset: laneOffsets[placement.lane]!,
    laneHeight: laneHeights[placement.lane]!,
  }))
}

export function reversePrimerFrameOffsets<T extends { left: number; right: number; yOffset: number; stackHeight: number }>(
  placements: readonly T[],
  frameYOffset: (placement: T) => number,
) {
  const offsets = new Map<T, number>()
  placements.forEach((placement) => offsets.set(placement, frameYOffset(placement)))
  const ordered = placements.toSorted((a, b) => a.yOffset - b.yOffset)
  ordered.forEach((placement, index) => {
    const minimum = ordered.slice(0, index)
      .filter((upper) => upper.left < placement.right && placement.left < upper.right)
      .reduce((min, upper) => Math.max(min,
        (upper.yOffset + (offsets.get(upper) ?? 0) + upper.stackHeight) - placement.yOffset),
      offsets.get(placement) ?? 0)
    offsets.set(placement, minimum)
  })
  return offsets
}

export function primerPackingRangeForRow(
  left: number,
  right: number,
  rowStart: number,
  rowEnd: number,
  baseStepPx: number,
  frameInsetPx: number,
) {
  const visibleBases = rowEnd - rowStart
  const clippedLeft = Math.max(0, left - frameInsetPx)
  const clippedRight = Math.min(visibleBases * baseStepPx, right - frameInsetPx)
  return {
    start: rowStart + Math.max(0, Math.floor(clippedLeft / baseStepPx)),
    end: rowStart + Math.min(visibleBases, Math.ceil(clippedRight / baseStepPx)),
  }
}
