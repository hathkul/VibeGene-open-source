export type LaneInterval = {
  id: string
  start: number
  end: number
  /** Lower packs first when starts are equal. Default 0. */
  priority?: number
}

export type LanedInterval = LaneInterval & {
  lane: number
}

/**
 * Pack intervals into the lowest free lane (lane 0 = top).
 * Must process left-to-right; packing by priority before start lets a later
 * high-priority interval claim lane 0 and push earlier free intervals downward.
 */
export function assignIntervalLanes(intervals: LaneInterval[]): LanedInterval[] {
  const laneRanges: Array<Array<{ start: number; end: number }>> = []
  return intervals
    .toSorted(
      (a, b) =>
        a.start - b.start ||
        (a.priority ?? 0) - (b.priority ?? 0) ||
        b.end - a.end ||
        a.id.localeCompare(b.id),
    )
    .map((interval) => {
      let lane = laneRanges.findIndex(
        (ranges) => !ranges.some((used) => interval.start < used.end && used.start < interval.end),
      )
      if (lane === -1) {
        lane = laneRanges.length
        laneRanges.push([])
      }
      laneRanges[lane]!.push({ start: interval.start, end: interval.end })
      return { ...interval, lane }
    })
}
