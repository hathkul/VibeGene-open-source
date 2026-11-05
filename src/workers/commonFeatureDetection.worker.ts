import { detectCommonFeatures } from '../domain/commonFeatures'
import type {
  CommonFeatureDetectionWorkerRequest,
  CommonFeatureDetectionWorkerResponse,
} from '../domain/commonFeatureDetectionWorkerProtocol'

const workerScope: Worker = self as unknown as Worker

workerScope.addEventListener('message', (event: MessageEvent<CommonFeatureDetectionWorkerRequest>) => {
  const request = event.data
  try {
    const matches = detectCommonFeatures(request.record, request.templates, {
      minimumIdentityPercent: request.minimumIdentityPercent,
      onProgress: (completed, total) => {
        const response: CommonFeatureDetectionWorkerResponse = { kind: 'progress', completed, total }
        workerScope.postMessage(response)
      },
    })
    const response: CommonFeatureDetectionWorkerResponse = { kind: 'complete', matches }
    workerScope.postMessage(response)
  } catch (error) {
    const response: CommonFeatureDetectionWorkerResponse = {
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
    workerScope.postMessage(response)
  }
})
