import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneFixture } from '../domain/fixtures'
import type { RouterInput, RouterOutput } from '../domain/wasmRouterProtocol'
import { detectCommonFeaturesWithWorker } from './commonFeatureDetection'
import { createLabelRouterClient, LabelRouterClient } from './labelRouterClient'
import { alignTracesWithWorkers } from './traceAlignment'
import { traceRecordFromSequence } from '../domain/sequenceTraceFactory'
import { startDnaComparison } from './workerStreams'

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  messages: unknown[] = []
  terminated = 0
  constructor() { super(); FakeWorker.instances.push(this) }
  postMessage(message: unknown) { this.messages.push(message) }
  terminate() { this.terminated += 1 }
  send(data: unknown) {
    const event = new MessageEvent('message', { data })
    this.onmessage?.(event)
    this.dispatchEvent(event)
  }
}

afterEach(() => { vi.unstubAllGlobals(); FakeWorker.instances = [] })

describe('worker execution adapters', () => {
  it('delivers stream events and removes listeners on cancellation', () => {
    vi.stubGlobal('Worker', FakeWorker)
    const onMessage = vi.fn()
    const onError = vi.fn()
    const stop = startDnaComparison({ id: 1, reference: 'A', topology: 'linear', sources: [] }, onMessage, onError)
    const worker = FakeWorker.instances[0]!
    worker.send({ id: 1, stage: 'complete', elapsedMs: 1 })
    expect(onMessage).toHaveBeenCalledOnce()
    stop()
    stop()
    worker.send({ id: 1, stage: 'complete', elapsedMs: 2 })
    expect(onMessage).toHaveBeenCalledOnce()
    expect(worker.terminated).toBe(1)
  })

  it('reports construction failure asynchronously and respects cancellation', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('unavailable') } })
    const onError = vi.fn()
    const stop = startDnaComparison({ id: 1, reference: 'A', topology: 'linear', sources: [] }, vi.fn(), onError)
    stop()
    await Promise.resolve()
    expect(onError).not.toHaveBeenCalled()
    startDnaComparison({ id: 2, reference: 'A', topology: 'linear', sources: [] }, vi.fn(), onError)
    await Promise.resolve()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'unavailable' }))
  })

  it('reports common-feature progress and terminates on cancellation', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const abort = new AbortController()
    const progress = vi.fn()
    const promise = detectCommonFeaturesWithWorker(cloneFixture(), [], { signal: abort.signal, onProgress: progress })
    const worker = FakeWorker.instances[0]!
    worker.send({ kind: 'progress', completed: 1, total: 2 })
    expect(progress).toHaveBeenCalledWith(1, 2)
    abort.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminated).toBe(1)
  })

  it('falls back to domain scanning if construction fails', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('unavailable') } })
    await expect(detectCommonFeaturesWithWorker(cloneFixture(), [])).resolves.toEqual([])
  })

  it('falls back to local trace alignment and label layout when construction fails', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('unavailable') } })
    const trace = traceRecordFromSequence('ACGTACGTACGTACGT', 'read')
    const result = await alignTracesWithWorkers([trace], 'TTACGTACGTACGTACGTAA', 'linear')
    expect(result[0]!.alignment).not.toBeNull()
    expect(createLabelRouterClient()).toBeNull()
  })

  it('rejects pending label requests on worker errors', async () => {
    const worker = new FakeWorker()
    const client = new LabelRouterClient(worker as unknown as Worker)
    const request = client.route({} as RouterInput)
    worker.dispatchEvent(new Event('error'))
    await expect(request).rejects.toBeInstanceOf(Event)
    client.dispose()
  })

  it('routes matching label responses and rejects pending work on disposal', async () => {
    const worker = new FakeWorker()
    const client = new LabelRouterClient(worker as unknown as Worker)
    const first = client.route({} as RouterInput)
    const second = client.route({} as RouterInput)
    const output = { placedCount: 2 } as RouterOutput
    worker.send({ id: 2, output })
    await expect(second).resolves.toBe(output)
    client.dispose()
    await expect(first).rejects.toThrow('disposed')
    await expect(client.route({} as RouterInput)).rejects.toThrow('disposed')
    expect(worker.terminated).toBe(1)
  })
})
