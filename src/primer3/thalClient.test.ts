import { describe, expect, it } from 'vitest'
import type { Primer3ThalInput, Primer3ThalResult } from '../domain/primer3/thalProtocol'
import { createPrimer3ThalClient } from './thalClient'
import { vi } from 'vitest'

class FakeWorker {
  listeners = new Map<string, Array<(event: Event) => void>>()
  messages: unknown[] = []
  terminated = false
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = typeof listener === 'function' ? listener : (event: Event) => listener.handleEvent(event)
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback])
  }
  postMessage(message: unknown) { this.messages.push(message) }
  terminate() { this.terminated = true }
  emit(type: string, event: Event) { for (const listener of this.listeners.get(type) ?? []) listener(event) }
  respond(index: number, result: Primer3ThalResult) {
    const request = this.messages[index] as { id: number }
    this.emit('message', new MessageEvent('message', { data: { id: request.id, ok: true, result } }))
  }
}

const input: Primer3ThalInput = { sequence1: 'ACGT', sequence2: 'ACGT', mode: 'end1' }
const result: Primer3ThalResult = { tmC: 61, alignEnd1: 4, alignEnd2: 4, structure: 'duplex', mode: 'end1' }

function setup() {
  const workers: FakeWorker[] = []
  const client = createPrimer3ThalClient({
    createWorker: () => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    },
  })
  return { client, workers }
}

describe('Primer3 THAL client', () => {
  it('reuses one worker and caches completed results', async () => {
    const { client, workers } = setup()
    const first = client.run(input)
    expect(workers).toHaveLength(1)
    workers[0]!.respond(0, result)
    await expect(first).resolves.toEqual(result)
    await expect(client.run({ ...input })).resolves.toEqual(result)
    expect(workers).toHaveLength(1)
    expect(workers[0]!.messages).toHaveLength(1)
  })

  it('runs a batch through one worker and returns values in input order', async () => {
    const { client, workers } = setup()
    const secondInput = { ...input, sequence1: 'TGCA' }
    const batch = client.runBatch([input, secondInput])
    expect(workers).toHaveLength(1)
    expect(workers[0]!.messages).toHaveLength(1)
    workers[0]!.respond(0, result)
    expect(workers[0]!.messages).toHaveLength(2)
    workers[0]!.respond(1, { ...result, tmC: 57 })
    await expect(batch).resolves.toEqual([result, { ...result, tmC: 57 }])
    expect(workers).toHaveLength(1)
  })

  it('retains a 130-site revisit set inside the documented 512-result cache bound', async () => {
    const { client, workers } = setup()
    const inputs = Array.from({ length: 130 }, (_, index) => ({
      sequence1: index.toString(2).padStart(8, '0').replaceAll('0', 'A').replaceAll('1', 'C'),
      sequence2: 'ACGTACGT',
      mode: 'end1' as const,
    }))

    for (const siteInput of inputs) {
      const pending = client.run(siteInput)
      const messageIndex = workers[0]!.messages.length - 1
      workers[0]!.respond(messageIndex, { ...result, structure: siteInput.sequence1 })
      await pending
    }

    const calculatedCount = workers[0]!.messages.length
    const warmed = await Promise.all(inputs.map((siteInput) => client.run(siteInput)))
    expect(warmed).toHaveLength(130)
    expect(workers[0]!.messages).toHaveLength(calculatedCount)
    expect(calculatedCount).toBe(130)
  })

  it('uses one abort listener for a large batch and cancels queued callers together', async () => {
    const { client, workers } = setup()
    const controller = new AbortController()
    const addListener = vi.spyOn(controller.signal, 'addEventListener')
    const inputs = Array.from({ length: 130 }, (_, index) => ({ ...input, sequence1: `A${index}` }))
    const batch = client.runBatch(inputs, { signal: controller.signal })
    const batchAssertion = expect(batch).rejects.toMatchObject({ name: 'AbortError' })
    expect(addListener.mock.calls.filter(([type]) => type === 'abort')).toHaveLength(1)
    controller.abort()
    await batchAssertion
    expect(workers[0]!.terminated).toBe(true)
  })

  it('deduplicates concurrent identical inputs and keeps work for remaining subscribers after one aborts', async () => {
    const { client, workers } = setup()
    const controller = new AbortController()
    const cancelled = client.run(input, { signal: controller.signal })
    const retained = client.run({ ...input })
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers[0]!.messages).toHaveLength(1)
    workers[0]!.respond(0, result)
    await expect(retained).resolves.toEqual(result)
    expect(workers).toHaveLength(1)
  })

  it('restarts a busy worker when its only subscriber cancels, so stale work cannot block a fresh request', async () => {
    const { client, workers } = setup()
    const controller = new AbortController()
    const stale = client.run(input, { signal: controller.signal })
    const staleAssertion = expect(stale).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await staleAssertion
    expect(workers[0]!.terminated).toBe(true)

    const fresh = client.run({ ...input, sequence1: 'TGCA' })
    expect(workers).toHaveLength(2)
    workers[0]!.respond(0, { ...result, tmC: 99 })
    workers[1]!.respond(0, result)
    await expect(fresh).resolves.toEqual(result)
  })

  it('rejects the failed calculation, restarts the worker, and completes subsequent work', async () => {
    const { client, workers } = setup()
    const failed = client.run(input)
    const failedAssertion = expect(failed).rejects.toThrow('worker crashed')
    workers[0]!.emit('error', Object.assign(new Event('error'), { message: 'worker crashed' }))
    await failedAssertion
    const next = client.run({ ...input, sequence1: 'TGCA' })
    expect(workers).toHaveLength(2)
    workers[1]!.respond(0, result)
    await expect(next).resolves.toEqual(result)
  })
})
