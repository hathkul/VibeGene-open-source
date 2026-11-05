import { alignTraceToTemplate } from '../domain/traceAlignment'
import type {
  TraceAlignmentWorkerRequest,
  TraceAlignmentWorkerResponse,
} from '../domain/traceAlignmentWorkerProtocol'

const workerScope: Worker = self as unknown as Worker

workerScope.addEventListener('message', (event: MessageEvent<TraceAlignmentWorkerRequest>) => {
  const request = event.data
  let response: TraceAlignmentWorkerResponse
  try {
    response = {
      index: request.index,
      alignment: alignTraceToTemplate(request.traceSequence, request.templateSequence, {
        topology: request.topology,
      }),
    }
  } catch (error) {
    response = {
      index: request.index,
      alignment: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  workerScope.postMessage(response)
})
