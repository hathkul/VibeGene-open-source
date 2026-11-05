import type {
  DnaComparisonStream,
  ProteinComparisonStream,
  RestrictionScanStream,
  WorkerStream,
} from '../application/ports/workerStreams'

function stream<Request, Response>(createWorker: () => Worker): WorkerStream<Request, Response> {
  return (request, onMessage, onError) => {
    let worker: Worker
    try {
      worker = createWorker()
    } catch (reason) {
      let cancelled = false
      queueMicrotask(() => {
        if (!cancelled) onError(reason instanceof Error ? reason : new Error(String(reason)))
      })
      return () => { cancelled = true }
    }
    let disposed = false
    const dispose = () => {
      if (disposed) return
      disposed = true
      worker.removeEventListener('message', message)
      worker.removeEventListener('error', error)
      worker.removeEventListener('messageerror', messageError)
      worker.terminate()
    }
    const message = (event: MessageEvent<Response>) => {
      if (!disposed) onMessage(event.data)
    }
    const error = (event: ErrorEvent) => {
      if (!disposed) onError(new Error(event.message || 'Worker failed'))
      dispose()
    }
    const messageError = () => {
      if (!disposed) onError(new Error('Worker returned unreadable data'))
      dispose()
    }
    worker.addEventListener('message', message)
    worker.addEventListener('error', error)
    worker.addEventListener('messageerror', messageError)
    try {
      worker.postMessage(request)
    } catch (reason) {
      queueMicrotask(() => {
        if (!disposed) onError(reason instanceof Error ? reason : new Error(String(reason)))
        dispose()
      })
    }
    return dispose
  }
}

export const startDnaComparison: DnaComparisonStream = stream(
  () => new Worker(new URL('../workers/dnaComparison.worker.ts', import.meta.url), { type: 'module' }),
)
export const startProteinComparison: ProteinComparisonStream = stream(
  () => new Worker(new URL('../workers/proteinAlignment.worker.ts', import.meta.url), { type: 'module' }),
)
export const startRestrictionScan: RestrictionScanStream = stream(
  () => new Worker(new URL('../workers/restrictionScan.worker.ts', import.meta.url), { type: 'module' }),
)
