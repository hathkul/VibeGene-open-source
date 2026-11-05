import type { Primer3WorkerResponse } from '../domain/primer3/protocol'
import type { Primer3EngineInput } from '../domain/primer3/types'
import { runPrimer3Engine } from '../wasm/primer3/engine'

const workerScope: Worker = self as unknown as Worker

workerScope.addEventListener('message', async (event: MessageEvent<Primer3EngineInput>) => {
  let response: Primer3WorkerResponse
  try {
    response = { ok: true, output: await runPrimer3Engine(event.data) }
  } catch (error) {
    response = { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  workerScope.postMessage(response)
})
