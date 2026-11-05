import type { SequenceFeature } from './types'

export type FeatureLabelSegmentCandidate = {
  feature: Pick<SequenceFeature, 'id'>
  segmentId: string
  start: number
  end: number
  span: number
}

/** Prefer the longest segment that fits an in-body label; otherwise the longest segment overall. */
export function preferredFeatureLabelSegmentIds(
  segments: FeatureLabelSegmentCandidate[],
  segmentFitsInBody: (segment: FeatureLabelSegmentCandidate) => boolean,
): Set<string> {
  const byFeature = new Map<string, FeatureLabelSegmentCandidate[]>()
  segments.forEach((segment) => {
    const list = byFeature.get(segment.feature.id) ?? []
    list.push(segment)
    byFeature.set(segment.feature.id, list)
  })

  const preferred = new Set<string>()
  byFeature.forEach((featureSegments) => {
    if (!featureSegments.length) return
    const bySpan = [...featureSegments].toSorted((a, b) => b.span - a.span || a.start - b.start)
    const fitting = bySpan.find((segment) => segmentFitsInBody(segment))
    preferred.add((fitting ?? bySpan[0]!).segmentId)
  })
  return preferred
}
