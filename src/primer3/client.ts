import { parsePrimer3Output } from '../domain/primer3/parseResult'
import type { Primer3WorkerResponse } from '../domain/primer3/protocol'
import { buildPrimer3Input } from '../domain/primer3/request'
import type { Primer3EngineInput, Primer3Request, Primer3Result } from '../domain/primer3/types'
import { runPrimer3Engine } from '../wasm/primer3/engine'

export type RunPrimer3Options = {
  signal?: AbortSignal
}

function abortError(): DOMException {
  return new DOMException('Primer3 run cancelled', 'AbortError')
}

function runInWorker(input: Primer3EngineInput, signal: AbortSignal | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/primer3.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => {
      signal?.removeEventListener('abort', onAbort)
      worker.terminate()
    }
    const onAbort = () => {
      finish()
      reject(abortError())
    }
    worker.addEventListener('message', (event: MessageEvent<Primer3WorkerResponse>) => {
      finish()
      if (event.data.ok) resolve(event.data.output)
      else reject(new Error(event.data.error))
    })
    worker.addEventListener('error', (event) => {
      finish()
      reject(new Error(event.message || 'Primer3 worker failed'))
    })
    worker.addEventListener('messageerror', () => {
      finish()
      reject(new Error('Primer3 worker returned an unreadable message'))
    })
    signal?.addEventListener('abort', onAbort, { once: true })
    worker.postMessage(input)
  })
}

async function runInline(input: Primer3EngineInput, signal: AbortSignal | undefined): Promise<string> {
  const output = await runPrimer3Engine(input)
  if (signal?.aborted) throw abortError()
  return output
}

export async function runPrimer3(request: Primer3Request, options: RunPrimer3Options = {}): Promise<Primer3Result> {
  const { signal } = options
  if (signal?.aborted) throw abortError()
  const built = buildPrimer3Input(request)
  const input: Primer3EngineInput = { boulder: built.boulder, files: built.files }
  const output = typeof Worker === 'undefined' ? await runInline(input, signal) : await runInWorker(input, signal)
  return parsePrimer3Output(output, built.boulder, built.mapping)
}
