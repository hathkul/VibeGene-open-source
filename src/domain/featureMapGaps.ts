import type { Strand } from './types'

/**
 * Gap connectors must not join halves produced by linearizing a wrap-around feature
 * (they would otherwise draw a long chord across the open horseshoe / molecule middle).
 */
export function shouldSkipFeatureGapConnector(
  current: { start: number; end: number; originWrapSplit?: boolean },
  next: { start: number; end: number; originWrapSplit?: boolean },
  sequenceLength: number,
): boolean {
  if (current.originWrapSplit && next.originWrapSplit) return true
  // Fallback for wrap halves without the flag (e.g. drawable split of a still-wrapped location).
  return (
    (current.start === 0 && next.end === sequenceLength) || (current.end === sequenceLength && next.start === 0)
  )
}

export function buildFeatureGapConnectors(
  segments: Array<{
    featureId: string
    start: number
    end: number
    level: number
    strand: Strand
    locationCount: number
    originWrapSplit?: boolean
  }>,
  sequenceLength: number,
): Array<{ featureId: string; start: number; end: number; level: number; strand: Strand }> {
  const byFeature = new Map<string, typeof segments>()
  segments.forEach((segment) => {
    if (segment.locationCount <= 1) return
    const list = byFeature.get(segment.featureId) ?? []
    list.push(segment)
    byFeature.set(segment.featureId, list)
  })

  const connectors: Array<{ featureId: string; start: number; end: number; level: number; strand: Strand }> = []
  byFeature.forEach((featureSegments, featureId) => {
    const strand = featureSegments[0]?.strand ?? 'forward'
    const ordered = [...featureSegments].sort((a, b) => (strand === 'reverse' ? b.start - a.start : a.start - b.start))
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const current = ordered[index]
      const next = ordered[index + 1]
      if (shouldSkipFeatureGapConnector(current, next, sequenceLength)) continue
      // Connector geometry is always expressed left-to-right in sequence
      // coordinates, even when feature segments are ordered 5′→3′ on the
      // reverse strand.
      const gapStart = Math.min(current.end, next.end)
      const gapEnd = Math.max(current.start, next.start)
      if (gapEnd > gapStart) {
        connectors.push({ featureId, start: gapStart, end: gapEnd, level: current.level, strand })
      }
    }
  })
  return connectors
}
