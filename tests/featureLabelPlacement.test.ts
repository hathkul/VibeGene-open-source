import { describe, expect, it } from 'vitest'
import { preferredFeatureLabelSegmentIds } from '../src/domain/featureLabelPlacement'

function segment(featureId: string, segmentId: string, start: number, end: number) {
  return {
    feature: { id: featureId },
    segmentId,
    start,
    end,
    span: end - start,
  }
}

describe('preferredFeatureLabelSegmentIds', () => {
  it('prefers a longer later segment that fits over a short start segment', () => {
    const preferred = preferredFeatureLabelSegmentIds(
      [
        segment('f1', 'f1:0-5', 0, 5),
        segment('f1', 'f1:10-100', 10, 100),
      ],
      (candidate) => candidate.span >= 40,
    )
    expect([...preferred]).toEqual(['f1:10-100'])
  })

  it('falls back to the longest segment when none fit in-body', () => {
    const preferred = preferredFeatureLabelSegmentIds(
      [
        segment('f1', 'f1:0-5', 0, 5),
        segment('f1', 'f1:10-25', 10, 25),
      ],
      () => false,
    )
    expect([...preferred]).toEqual(['f1:10-25'])
  })

  it('keeps a single-segment feature on that segment', () => {
    const preferred = preferredFeatureLabelSegmentIds(
      [segment('f1', 'f1:0-80', 0, 80)],
      (candidate) => candidate.span >= 40,
    )
    expect([...preferred]).toEqual(['f1:0-80'])
  })
})
