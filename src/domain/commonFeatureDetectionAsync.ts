import {
  detectCommonFeatures,
  type CommonFeatureDetectionOptions,
  type CommonFeatureMatch,
  type CommonFeatureTemplate,
} from './commonFeatures'
import type { SequenceRecord } from './types'

function abortError() {
  return new DOMException('Common-feature detection was cancelled.', 'AbortError')
}

export type AsyncCommonFeatureDetectionOptions = Pick<CommonFeatureDetectionOptions, 'minimumIdentityPercent' | 'onProgress'> & {
  signal?: AbortSignal
}

/** Run common-feature scanning away from the UI thread when Web Workers are available. */
export function detectCommonFeaturesAsync(
  record: SequenceRecord,
  templates: CommonFeatureTemplate[],
  options: AsyncCommonFeatureDetectionOptions = {},
): Promise<CommonFeatureMatch[]> {
  if (options.signal?.aborted) return Promise.reject(abortError())

  return Promise.resolve().then(() => {
    if (options.signal?.aborted) throw abortError()
    return detectCommonFeatures(record, templates, options)
  })
}
