import type { SequenceLabelCallout } from '../domain/sequenceLabelRouter'
import type { SequenceFeature } from '../domain/types'

export type HorizontalFeatureBandSegment = {
  feature: SequenceFeature
  segmentId: string
  start: number
  end: number
  lane: number
}

export type HorizontalBandsSnapshot = {
  heightPx: number
  rowSequenceWidthPx: number
  enzymeLaneHeight: number
  enzymeCallouts: SequenceLabelCallout[]
  featureLaneHeight: number
  rowFeatures: HorizontalFeatureBandSegment[]
  reversePrimerLaneHeight: number
  rowKey: number
}
