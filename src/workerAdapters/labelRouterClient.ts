import type { RouterInput, RouterOutput, RouterWorkerRequest, RouterWorkerResponse } from '../domain/wasmRouterProtocol'

type Pending = { resolve: (value: RouterOutput) => void; reject: (reason?: unknown) => void }

export class LabelRouterClient {
  private readonly worker: Worker
  private nextId = 1
  private disposed = false
  private readonly pending = new Map<number, Pending>()
  private readonly onMessage = (event: MessageEvent<RouterWorkerResponse>) => {
    const { id, output } = event.data
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    pending.resolve(output)
  }
  private readonly onError = (error: Event) => {
    this.pending.forEach((pending) => pending.reject(error))
    this.pending.clear()
  }

  constructor(worker?: Worker) {
    this.worker = worker ?? new Worker(new URL('../workers/labelRouter.worker.ts', import.meta.url), { type: 'module' })
    this.worker.addEventListener('message', this.onMessage)
    this.worker.addEventListener('error', this.onError)
    this.worker.addEventListener('messageerror', this.onError)
  }

  route(input: RouterInput) {
    if (this.disposed) return Promise.reject(new Error('LabelRouterClient disposed'))
    const id = this.nextId++
    const message: RouterWorkerRequest = { id, input }
    return new Promise<RouterOutput>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try { this.worker.postMessage(message) } catch (error) { this.pending.delete(id); reject(error) }
    })
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.worker.removeEventListener('message', this.onMessage)
    this.worker.removeEventListener('error', this.onError)
    this.worker.removeEventListener('messageerror', this.onError)
    this.pending.forEach((pending) => pending.reject(new Error('LabelRouterClient disposed')))
    this.pending.clear()
    this.worker.terminate()
  }
}

/** Fall back to the regular map layout when workers cannot be created. */
export function createLabelRouterClient() {
  try { return new LabelRouterClient() } catch { return null }
}
