import { alignDnaComparisonSource } from '../domain/dnaComparisonAlignment'
import type {
  DnaComparisonWorkerRequest,
  DnaComparisonWorkerResponse,
  DnaComparisonWorkerSourceResult,
} from '../domain/dnaComparisonProtocol'

const workerScope: Worker = self as unknown as Worker

workerScope.addEventListener('message', (event: MessageEvent<DnaComparisonWorkerRequest>) => {
  const request = event.data
  const started = performance.now()
  for (const source of request.sources) {
    let result: DnaComparisonWorkerSourceResult
    try {
      result = {
        sourceId: source.id,
        alignment: alignDnaComparisonSource(request.reference, source, request.topology),
      }
    } catch (error) {
      result = {
        sourceId: source.id,
        alignment: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
    const response: DnaComparisonWorkerResponse = { id: request.id, stage: 'source', result }
    workerScope.postMessage(response)
  }
  const complete: DnaComparisonWorkerResponse = {
    id: request.id,
    stage: 'complete',
    elapsedMs: performance.now() - started,
  }
  workerScope.postMessage(complete)
})
