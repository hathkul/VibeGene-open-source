import { detectCommonFeaturesAsync, type AsyncCommonFeatureDetectionOptions } from '../domain/commonFeatureDetectionAsync'
import type { CommonFeatureTemplate } from '../domain/commonFeatures'
import type { CommonFeatureDetectionWorkerRequest, CommonFeatureDetectionWorkerResponse } from '../domain/commonFeatureDetectionWorkerProtocol'
import type { SequenceRecord } from '../domain/types'

export function detectCommonFeaturesWithWorker(record: SequenceRecord, templates: CommonFeatureTemplate[], options: AsyncCommonFeatureDetectionOptions = {}) {
  const abortError = () => new DOMException('Common-feature detection was cancelled.', 'AbortError')
  if (options.signal?.aborted) return Promise.reject(abortError())
  let worker: Worker
  try {
    worker = new Worker(new URL('../workers/commonFeatureDetection.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return detectCommonFeaturesAsync(record, templates, options)
  }
  return new Promise<Awaited<ReturnType<typeof detectCommonFeaturesAsync>>>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      worker.terminate()
      callback()
    }
    const onAbort = () => finish(() => reject(abortError()))
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted) { onAbort(); return }
    worker.onerror = () => finish(() => reject(new Error('Common-feature detection worker failed.')))
    worker.onmessageerror = () => finish(() => reject(new Error('Common-feature detection worker returned unreadable data.')))
    worker.onmessage = (event: MessageEvent<CommonFeatureDetectionWorkerResponse>) => {
      const response = event.data
      if (response.kind === 'progress') options.onProgress?.(response.completed, response.total)
      else if (response.kind === 'complete') finish(() => resolve(response.matches))
      else finish(() => reject(new Error(response.message)))
    }
    const request: CommonFeatureDetectionWorkerRequest = { record, templates, minimumIdentityPercent: options.minimumIdentityPercent }
    try { worker.postMessage(request) } catch (error) { finish(() => reject(error)) }
  })
}
