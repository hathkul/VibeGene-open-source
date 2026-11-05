import type { Primer3ThalWorkerRequest, Primer3ThalWorkerResponse } from '../domain/primer3/thalProtocol'
import { primer3ThalAlign } from '../wasm/primer3-thal/adapter'

const workerScope: Worker = self as unknown as Worker
let workQueue = Promise.resolve()

workerScope.addEventListener('message', (event: MessageEvent<Primer3ThalWorkerRequest>) => {
  const { id, input } = event.data
  workQueue = workQueue.then(async () => {
    let response: Primer3ThalWorkerResponse
    try {
      response = { id, ok: true, result: await primer3ThalAlign(input) }
    } catch (error) {
      response = { id, ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    workerScope.postMessage(response)
  })
})
