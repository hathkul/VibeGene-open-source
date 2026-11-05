import type { CommonFeatureMatch, CommonFeatureTemplate } from './commonFeatures'
import type { SequenceRecord } from './types'

export type CommonFeatureDetectionWorkerRequest = {
  record: SequenceRecord
  templates: CommonFeatureTemplate[]
  minimumIdentityPercent?: number
}

export type CommonFeatureDetectionWorkerResponse =
  | { kind: 'progress'; completed: number; total: number }
  | { kind: 'complete'; matches: CommonFeatureMatch[] }
  | { kind: 'error'; message: string }
