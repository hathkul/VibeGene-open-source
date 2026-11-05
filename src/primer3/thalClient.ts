import type {
  Primer3ThalInput,
  Primer3ThalResult,
  Primer3ThalWorkerRequest,
  Primer3ThalWorkerResponse,
} from '../domain/primer3/thalProtocol'

export type RunPrimer3ThalOptions = { signal?: AbortSignal }
export type { Primer3ThalInput, Primer3ThalMode, Primer3ThalResult } from '../domain/primer3/thalProtocol'

type WorkerLike = Pick<Worker, 'addEventListener' | 'postMessage' | 'terminate'>
type WorkerFactory = () => WorkerLike
type Waiter = { resolve: (result: Primer3ThalResult) => void; reject: (error: Error) => void; signal?: AbortSignal; onAbort?: () => void }
type Job = { key: string; input: Primer3ThalInput; id: number; waiters: Set<Waiter> }

const DEFAULT_CACHE_SIZE = 512

function abortError(): DOMException {
  return new DOMException('Primer3 thermodynamic run cancelled', 'AbortError')
}

function inputKey(input: Primer3ThalInput): string {
  const chemistry = input.chemistry ?? {}
  return JSON.stringify([
    input.sequence1.toUpperCase(), input.sequence2.toUpperCase(), input.mode ?? 'any',
    chemistry.mvMmol ?? 50, chemistry.dvMmol ?? 0, chemistry.dntpMmol ?? 0.8,
    chemistry.dnaNmol ?? 50, input.structureTempC ?? 37, input.maxLoop ?? 30,
  ])
}

function copyResult(result: Primer3ThalResult): Primer3ThalResult {
  return { ...result }
}

/** A single-worker client with request deduplication and a bounded result LRU. */
export function createPrimer3ThalClient(options: { createWorker: WorkerFactory; cacheSize?: number }) {
  const cache = new Map<string, Primer3ThalResult>()
  const jobs = new Map<string, Job>()
  const queue: Job[] = []
  const abortSubscriptions = new Map<AbortSignal, { callbacks: Set<() => void>; listener: () => void }>()
  let worker: WorkerLike | undefined
  let active: Job | undefined
  let nextId = 1

  const unsubscribeAbort = (waiter: Waiter) => {
    if (!waiter.signal || !waiter.onAbort) return
    const subscription = abortSubscriptions.get(waiter.signal)
    if (!subscription) return
    subscription.callbacks.delete(waiter.onAbort)
    if (subscription.callbacks.size === 0) {
      waiter.signal.removeEventListener('abort', subscription.listener)
      abortSubscriptions.delete(waiter.signal)
    }
  }

  const subscribeAbort = (signal: AbortSignal, callback: () => void) => {
    let subscription = abortSubscriptions.get(signal)
    if (!subscription) {
      const callbacks = new Set<() => void>()
      const listener = () => { for (const onAbort of [...callbacks]) onAbort() }
      subscription = { callbacks, listener }
      abortSubscriptions.set(signal, subscription)
      signal.addEventListener('abort', listener, { once: true })
    }
    subscription.callbacks.add(callback)
  }

  const removeWaiter = (job: Job, waiter: Waiter) => {
    unsubscribeAbort(waiter)
    job.waiters.delete(waiter)
  }

  const settle = (job: Job, result?: Primer3ThalResult, error?: Error) => {
    jobs.delete(job.key)
    if (active === job) active = undefined
    const capacity = Math.max(0, options.cacheSize ?? DEFAULT_CACHE_SIZE)
    if (!error && result && capacity > 0) {
      cache.delete(job.key)
      cache.set(job.key, copyResult(result))
      while (cache.size > capacity) cache.delete(cache.keys().next().value!)
    }
    for (const waiter of job.waiters) {
      removeWaiter(job, waiter)
      if (error) waiter.reject(error)
      else waiter.resolve(copyResult(result!))
    }
    job.waiters.clear()
  }

  const terminateWorker = () => {
    worker?.terminate()
    worker = undefined
    active = undefined
  }

  const spawnWorker = () => {
    const created = options.createWorker()
    worker = created
    created.addEventListener('message', (event: Event) => {
      if (worker !== created) return
      const job = active
      if (!job) return
      const response = (event as MessageEvent<Primer3ThalWorkerResponse>).data
      if (!response || response.id !== job.id || typeof response.ok !== 'boolean') {
        failWorker(new Error('Thermodynamic worker returned an invalid response'))
      } else if (response.ok) {
        settle(job, response.result)
        pump()
      } else {
        settle(job, undefined, new Error(response.error))
        pump()
      }
    })
    created.addEventListener('error', (event: Event) => {
      if (worker !== created) return
      const message = (event as ErrorEvent).message
      failWorker(new Error(message || 'Thermodynamic worker failed'))
    })
    created.addEventListener('messageerror', () => {
      if (worker === created) failWorker(new Error('Thermodynamic worker returned an unreadable message'))
    })
    return created
  }

  const failWorker = (error: Error) => {
    const failed = active
    terminateWorker()
    if (failed) settle(failed, undefined, error)
    pump()
  }

  function pump() {
    if (active || queue.length === 0) return
    let currentWorker = worker
    try {
      currentWorker ??= spawnWorker()
    } catch (error) {
      const failed = queue.shift()!
      settle(failed, undefined, error instanceof Error ? error : new Error(String(error)))
      pump()
      return
    }
    const job = queue.shift()!
    active = job
    try {
      currentWorker.postMessage({ id: job.id, input: job.input } satisfies Primer3ThalWorkerRequest)
    } catch (error) {
      failWorker(error instanceof Error ? error : new Error(String(error)))
    }
  }

  function run(input: Primer3ThalInput, runOptions: RunPrimer3ThalOptions = {}): Promise<Primer3ThalResult> {
    const signal = runOptions.signal
    if (signal?.aborted) return Promise.reject(abortError())
    const key = inputKey(input)
    const cached = cache.get(key)
    if (cached) {
      cache.delete(key)
      cache.set(key, cached)
      return Promise.resolve(copyResult(cached))
    }
    let job = jobs.get(key)
    if (!job) {
      job = { key, input, id: nextId++, waiters: new Set() }
      jobs.set(key, job)
      queue.push(job)
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal }
      waiter.onAbort = () => {
        removeWaiter(job!, waiter)
        reject(abortError())
        if (job!.waiters.size === 0 && active === job) {
          // WASM calls are synchronous inside the worker. Terminating it is how an
          // abandoned calculation is prevented from blocking the next current request.
          terminateWorker()
          jobs.delete(job!.key)
          queueMicrotask(pump)
        } else if (job!.waiters.size === 0) {
          jobs.delete(job!.key)
          const index = queue.indexOf(job!)
          if (index >= 0) queue.splice(index, 1)
        }
      }
      job!.waiters.add(waiter)
      if (signal) subscribeAbort(signal, waiter.onAbort)
      if (signal?.aborted) waiter.onAbort()
      else pump()
    })
  }

  return {
    run,
    runBatch(inputs: Primer3ThalInput[], runOptions: RunPrimer3ThalOptions = {}) {
      return Promise.all(inputs.map((input) => run(input, runOptions)))
    },
    clearCache() { cache.clear() },
    dispose() {
      terminateWorker()
      for (const job of jobs.values()) settle(job, undefined, abortError())
      queue.length = 0
      jobs.clear()
      cache.clear()
    },
  }
}

const client = createPrimer3ThalClient({
  createWorker: () => new Worker(new URL('../workers/primer3Thal.worker.ts', import.meta.url), { type: 'module' }),
})

export function runPrimer3Thal(input: Primer3ThalInput, options: RunPrimer3ThalOptions = {}): Promise<Primer3ThalResult> {
  if (typeof Worker === 'undefined') {
    if (options.signal?.aborted) return Promise.reject(abortError())
    return import('../wasm/primer3-thal/adapter').then(({ primer3ThalAlign }) => primer3ThalAlign(input)).then((result) => {
      if (options.signal?.aborted) throw abortError()
      return result
    })
  }
  return client.run(input, options)
}

export function runPrimer3ThalBatch(inputs: Primer3ThalInput[], options: RunPrimer3ThalOptions = {}): Promise<Primer3ThalResult[]> {
  return Promise.all(inputs.map((input) => runPrimer3Thal(input, options)))
}
