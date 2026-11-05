import { sequenceRowLaneMetrics, type SequenceLabelRouterInput, type SequenceRowSegment } from '../../domain/sequenceLabelRouter'
import { sgRnaRowLaneHeightPx } from '../../domain/sgrnaVisualLayout'
import type { SequenceRowLabelLayout } from '../../domain/sequenceLabelRouter'

type PrimerPlacements = {
  forwardLaneHeight?: number
  reverseLaneHeight?: number
}

type SgRnaLanes = {
  forwardLanes: { count: number }
  reverseLanes: { count: number }
}

export type SequenceRowHeightOptions = {
  rowSegments: SequenceRowSegment[]
  rowPrimerPlacementsByIndex: Map<number, PrimerPlacements>
  sgRnaLanesByRow: Map<number, SgRnaLanes>
  rowLayoutByIndex: Map<number, SequenceRowLabelLayout>
  restrictionSiteCountByLabelRow: ReadonlyMap<number, number>
  rowFeatureBandHeightByRow: number[]
  horizontalMode: boolean
  featuresVisible: boolean
  featureLaneStepPx: number
  sequenceStrandRowHeightPx: number
  sequenceRulerHeightPx: number
  virtualRowEstimatePx: number
  labelRouterBase: SequenceLabelRouterInput
}

/**
 * Computes conservative row heights without knowing anything about the row's
 * renderer. Keeping this pure protects virtual-window geometry from render
 * changes and makes height regressions straightforward to characterize.
 */
export function estimateSequenceRowHeights({
  rowSegments,
  rowPrimerPlacementsByIndex,
  sgRnaLanesByRow,
  rowLayoutByIndex,
  restrictionSiteCountByLabelRow,
  rowFeatureBandHeightByRow,
  horizontalMode,
  featuresVisible,
  featureLaneStepPx,
  sequenceStrandRowHeightPx,
  sequenceRulerHeightPx,
  virtualRowEstimatePx,
  labelRouterBase,
}: SequenceRowHeightOptions) {
  return rowSegments.map((_segment, rowIndex) => {
    const primerPlacements = rowPrimerPlacementsByIndex.get(rowIndex)
    const forwardPrimerLaneHeight = (primerPlacements?.forwardLaneHeight ?? 0)
      + sgRnaRowLaneHeightPx(sgRnaLanesByRow.get(rowIndex)?.forwardLanes.count ?? 0)
    const reversePrimerLaneHeight = sgRnaRowLaneHeightPx(sgRnaLanesByRow.get(rowIndex)?.reverseLanes.count ?? 0)
    const rowLayout = rowLayoutByIndex.get(rowIndex)
    const routedCallouts = rowLayout?.enzymeCallouts.length ? rowLayout.enzymeCallouts : null
    let enzymeLaneHeight: number
    if (horizontalMode && rowLayout) {
      const stubHeight = 8
      enzymeLaneHeight = Math.max(
        18,
        rowLayout.enzymeLaneRows > 0 ? rowLayout.enzymeLaneRows * 17 + stubHeight : 0,
        forwardPrimerLaneHeight,
      )
    } else if (rowLayout && routedCallouts) {
      const laneMetrics = sequenceRowLaneMetrics(
        rowLayout,
        labelRouterBase,
        forwardPrimerLaneHeight,
        reversePrimerLaneHeight,
      )
      enzymeLaneHeight = Math.max(18, laneMetrics.enzymeLaneHeight, forwardPrimerLaneHeight)
    } else {
      // Stable placeholder from site count; it must not depend on the virtual
      // window, or heights thrash while scrolling.
      const siteCount = restrictionSiteCountByLabelRow.get(rowIndex) ?? 0
      const approxRows = Math.min(12, siteCount)
      enzymeLaneHeight = Math.max(18, siteCount > 0 ? approxRows * 17 + 8 : 0, forwardPrimerLaneHeight)
    }
    const featureBandHeight = rowFeatureBandHeightByRow[rowIndex] ?? (featuresVisible ? featureLaneStepPx : 0)
    const strandBlockHeight = sequenceStrandRowHeightPx * 2 + sequenceRulerHeightPx
    const rowGridGapTotal = 2 * 3
    const rowChrome = 2 + 2
    const estimated =
      enzymeLaneHeight +
      strandBlockHeight +
      featureBandHeight +
      reversePrimerLaneHeight +
      rowGridGapTotal +
      rowChrome
    return Math.max(virtualRowEstimatePx, Math.ceil(estimated))
  })
}

export function raiseSequenceRowHeightFloors(
  previous: Record<number, number>,
  estimates: readonly number[],
): Record<number, number> {
  let changed = false
  const next: Record<number, number> = { ...previous }
  for (let rowIndex = 0; rowIndex < estimates.length; rowIndex += 1) {
    const estimate = estimates[rowIndex] ?? 0
    const floor = previous[rowIndex] ?? 0
    if (floor < estimate) {
      next[rowIndex] = estimate
      changed = true
    }
  }
  return changed ? next : previous
}

export function initialSequenceVirtualWindow(rowCount: number): { start: number; end: number } {
  return { start: 0, end: Math.min(18, Math.max(0, rowCount - 1)) }
}

export function clampSequenceVirtualWindow(
  current: { start: number; end: number },
  rowCount: number,
): { start: number; end: number } {
  const maxRow = Math.max(0, rowCount - 1)
  const start = Math.min(current.start, maxRow)
  const end = Math.min(maxRow, Math.max(current.end, start))
  if (start === current.start && end === current.end) return current
  return { start, end }
}

export function horizontalSequenceVirtualWindow(rowCount: number): { start: number; end: number } {
  return { start: 0, end: Math.max(0, rowCount - 1) }
}

export type SequenceVirtualRowWindowOwner = {
  spanKey: string
  rowCount: number
  layoutActive: boolean
  horizontalMode: boolean
}

export function syncSequenceRowHeightFloors(
  measureKey: string,
  storedMeasureKey: string,
  previousFloors: Record<number, number>,
  estimates: readonly number[],
): { nextMeasureKey: string; nextFloors: Record<number, number>; resetMeasured: boolean } {
  if (measureKey !== storedMeasureKey) {
    return {
      nextMeasureKey: measureKey,
      nextFloors: raiseSequenceRowHeightFloors({}, estimates),
      resetMeasured: true,
    }
  }
  return {
    nextMeasureKey: storedMeasureKey,
    nextFloors: raiseSequenceRowHeightFloors(previousFloors, estimates),
    resetMeasured: false,
  }
}

export function planSequenceVirtualWindowTransition(
  currentWindow: { start: number; end: number },
  owner: SequenceVirtualRowWindowOwner,
  spanKey: string,
  rowCount: number,
  layoutActive: boolean,
  horizontalMode: boolean,
): { nextWindow?: { start: number; end: number }; nextOwner?: SequenceVirtualRowWindowOwner } {
  const nextOwner: SequenceVirtualRowWindowOwner = { spanKey, rowCount, layoutActive, horizontalMode }
  const ownerDiffers =
    spanKey !== owner.spanKey ||
    rowCount !== owner.rowCount ||
    layoutActive !== owner.layoutActive ||
    horizontalMode !== owner.horizontalMode
  const listenerRecalculates =
    layoutActive &&
    rowCount > 0 &&
    !horizontalMode &&
    (rowCount !== owner.rowCount ||
      layoutActive !== owner.layoutActive ||
      horizontalMode !== owner.horizontalMode)
  if (horizontalMode) {
    const fullWindow = horizontalSequenceVirtualWindow(rowCount)
    return {
      nextWindow:
        fullWindow.start !== currentWindow.start || fullWindow.end !== currentWindow.end ? fullWindow : undefined,
      nextOwner: ownerDiffers ? nextOwner : undefined,
    }
  }
  if (listenerRecalculates) {
    return { nextOwner: ownerDiffers ? nextOwner : undefined }
  }
  if (spanKey !== owner.spanKey) {
    return { nextWindow: initialSequenceVirtualWindow(rowCount), nextOwner }
  }
  if (!layoutActive || rowCount !== owner.rowCount) {
    const clamped = clampSequenceVirtualWindow(currentWindow, rowCount)
    return {
      nextWindow: clamped !== currentWindow ? clamped : undefined,
      nextOwner: ownerDiffers ? nextOwner : undefined,
    }
  }
  return {}
}
