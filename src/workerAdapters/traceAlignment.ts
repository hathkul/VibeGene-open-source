import { alignPendingTraces } from '../domain/traceFileWorkflow'
import type { TraceFileRecord } from '../domain/traceTypes'
import type { TraceAlignmentWorkerRequest, TraceAlignmentWorkerResponse } from '../domain/traceAlignmentWorkerProtocol'

function abortError() { return new DOMException('Aborted', 'AbortError') }

/** Send only sequences to workers; chromatogram arrays stay on the calling thread. */
export async function alignTracesWithWorkers(
  traces: TraceFileRecord[],
  templateSequence: string,
  topology?: 'circular' | 'linear',
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<TraceFileRecord[]> {
  if (!traces.length) return []
  if (signal?.aborted) throw abortError()
  if (typeof Worker === 'undefined') return alignPendingTraces(traces, templateSequence, topology, signal, onProgress)
  const hardwareConcurrency = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2
  const workerCount = Math.min(traces.length, 4, Math.max(1, hardwareConcurrency - 1))
  const workers: Worker[] = []
  try {
    for (let index = 0; index < workerCount; index += 1) {
      workers.push(new Worker(new URL('../workers/traceAlignment.worker.ts', import.meta.url), { type: 'module' }))
    }
  } catch {
    workers.forEach((worker) => worker.terminate())
    return alignPendingTraces(traces, templateSequence, topology, signal, onProgress)
  }

  return new Promise<TraceFileRecord[]>((resolve, reject) => {
    const aligned = new Array<TraceFileRecord>(traces.length)
    let nextIndex = 0
    let completed = 0
    let settled = false
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
      workers.forEach((worker) => worker.terminate())
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onAbort = () => fail(abortError())
    const dispatch = (worker: Worker) => {
      if (settled || nextIndex >= traces.length) return
      const index = nextIndex++
      const request: TraceAlignmentWorkerRequest = {
        index,
        traceSequence: traces[index]!.sequence,
        templateSequence,
        topology,
      }
      try {
        worker.postMessage(request)
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) {
      onAbort()
      return
    }
    for (const worker of workers) {
      worker.onmessage = (event: MessageEvent<TraceAlignmentWorkerResponse>) => {
        if (settled) return
        const response = event.data
        const trace = traces[response.index]
        if (!trace || aligned[response.index]) {
          fail(new Error('Invalid trace alignment worker response'))
          return
        }
        aligned[response.index] = response.error
          ? { ...trace, alignment: null, parseError: 'Alignment failed (sequence may be too long)' }
          : response.alignment
            ? { ...trace, alignment: response.alignment, parseError: undefined }
            : { ...trace, alignment: null, parseError: 'No alignment to reference found' }
        completed += 1
        onProgress?.(completed, traces.length)
        if (completed === traces.length) {
          settled = true
          cleanup()
          resolve(aligned)
        } else {
          dispatch(worker)
        }
      }
      worker.onerror = () => fail(new Error('Trace alignment worker failed'))
      worker.onmessageerror = () => fail(new Error('Trace alignment worker returned an unreadable result'))
      dispatch(worker)
    }
  })
}
