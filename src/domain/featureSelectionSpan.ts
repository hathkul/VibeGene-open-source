import type { SequenceFeature } from './types'

/** Smallest continuous selection containing every segment of the features. */
export function featureSelectionSpan(
  features: readonly Pick<SequenceFeature, 'locations'>[],
  sequenceLength: number,
  topology: 'linear' | 'circular',
): { start: number; end: number } | null {
  if (sequenceLength <= 0) return null
  const intervals: Array<{ start: number; end: number }> = []
  for (const feature of features) {
    for (const location of feature.locations) {
      const start = Math.max(0, Math.min(sequenceLength, location.start))
      const end = Math.max(0, Math.min(sequenceLength, location.end))
      if (end > start) intervals.push({ start, end })
      else if (end < start && topology === 'circular') {
        if (start < sequenceLength) intervals.push({ start, end: sequenceLength })
        if (end > 0) intervals.push({ start: 0, end })
      }
    }
  }
  if (!intervals.length) return null
  intervals.sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: typeof intervals = []
  for (const interval of intervals) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
    else merged.push({ ...interval })
  }
  const first = merged[0]!
  const last = merged[merged.length - 1]!
  if (topology === 'linear') return { start: first.start, end: last.end }

  // Exclude the largest uncovered gap; on ties prefer a non-wrapping range.
  let largestGap = sequenceLength - last.end + first.start
  let result = { start: first.start, end: last.end }
  for (let index = 1; index < merged.length; index++) {
    const previous = merged[index - 1]!
    const next = merged[index]!
    const gap = next.start - previous.end
    if (gap > largestGap) {
      largestGap = gap
      result = { start: next.start, end: previous.end }
    }
  }
  return largestGap === 0 ? { start: 0, end: sequenceLength } : result
}
