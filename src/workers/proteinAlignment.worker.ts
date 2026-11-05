import { alignProteinComparisonSource } from '../domain/proteinAlignment'
import type {
  ProteinAlignmentWorkerRequest,
  ProteinAlignmentWorkerResponse,
  ProteinAlignmentWorkerSourceResult,
} from '../domain/proteinAlignmentProtocol'

const workerScope: Worker = self as unknown as Worker

workerScope.addEventListener('message', (event: MessageEvent<ProteinAlignmentWorkerRequest>) => {
  const request = event.data
  const started = performance.now()
  for (const source of request.sources) {
    let result: ProteinAlignmentWorkerSourceResult
    try {
      result = {
        sourceId: source.id,
        alignment: alignProteinComparisonSource(
          request.reference,
          source,
          request.geneticCode,
          request.variableRegions,
        ),
      }
    } catch (error) {
      result = {
        sourceId: source.id,
        alignment: null,
        error: error instanceof Error ? error.message : String(error),
      }
    }
    const response: ProteinAlignmentWorkerResponse = { id: request.id, stage: 'source', result }
    workerScope.postMessage(response)
  }
  const complete: ProteinAlignmentWorkerResponse = {
    id: request.id,
    stage: 'complete',
    elapsedMs: performance.now() - started,
  }
  workerScope.postMessage(complete)
})
