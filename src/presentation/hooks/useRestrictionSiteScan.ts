import { useRestrictionScanStream } from './workerStreamContexts'
import { useEffect, useRef, useState } from 'react'
import {
  restrictionSiteScanSignatures,
  type RestrictionSiteScanInput,
  type RestrictionSiteScanState,
  unwireRestrictionSites,
} from '../../domain/restrictionSiteScan'
import type {
  RestrictionScanWorkerRequest,
  RestrictionScanWorkerResponse,
} from '../../domain/restrictionScanProtocol'

const completedScanCache: Array<{
  sequence: string
  topology: RestrictionSiteScanInput['topology']
  constructSignature: string
  enzymeSignature: string
  sites: RestrictionSiteScanState['sites']
}> = []

export type { RestrictionSiteScanInput, RestrictionSiteScanState }

export function useRestrictionSiteScan(input: RestrictionSiteScanInput): RestrictionSiteScanState {
  const startWorker = useRestrictionScanStream()
  const [state, setState] = useState<RestrictionSiteScanState>({
    sites: [],
    stage: 'idle',
    pending: false,
    elapsedMs: 0,
  })
  const nextRequestId = useRef(1)
  const { enzymeSignature, previewSignature, constructSignature } = restrictionSiteScanSignatures(input)

  useEffect(() => {
    if (!input.enabled || !input.sequence || !input.enzymeNames.length) {
      return
    }

    const cached = completedScanCache.find(
      (entry) =>
        entry.sequence === input.sequence &&
        entry.topology === input.topology &&
        entry.constructSignature === constructSignature &&
        entry.enzymeSignature === enzymeSignature,
    )
    if (cached) {
      let cancelled = false
      queueMicrotask(() => {
        if (!cancelled) {
          setState({ sites: cached.sites, stage: 'complete', pending: false, elapsedMs: 0 })
        }
      })
      return () => {
        cancelled = true
      }
    }

    const id = nextRequestId.current++
    let disposed = false
    queueMicrotask(() => {
      if (!disposed) setState({ sites: [], stage: 'idle', pending: true, elapsedMs: 0 })
    })

    const onMessage = (response: RestrictionScanWorkerResponse) => {
      if (disposed || response.id !== id) return
      if (response.stage === 'error') {
        setState({ sites: [], stage: 'error', pending: false, elapsedMs: 0, error: response.message })
        stopWorker()
        return
      }
      const sites = unwireRestrictionSites(response.payload, input.sequence, input.topology)
      setState({ sites, stage: response.stage, pending: response.stage !== 'complete', elapsedMs: response.elapsedMs })
      if (response.stage === 'complete') {
        completedScanCache.unshift({ sequence: input.sequence, topology: input.topology, constructSignature, enzymeSignature, sites })
        if (completedScanCache.length > 3) completedScanCache.pop()
        stopWorker()
      }
    }
    const onError = (error: Error) => {
      if (disposed) return
      setState({ sites: [], stage: 'error', pending: false, elapsedMs: 0, error: error.message })
      stopWorker()
    }

    const request: RestrictionScanWorkerRequest = {
      id,
      sequence: input.sequence,
      topology: input.topology,
      construct: input.construct,
      enzymeNames: enzymeSignature ? enzymeSignature.split('\0') : [],
      previewEnzymeNames: previewSignature ? previewSignature.split('\0') : [],
      previewSiteCap: input.previewSiteCap ?? null,
    }
    const stopWorker = startWorker(request, onMessage, onError)
    return () => {
      disposed = true
      stopWorker()
    }
  }, [startWorker, constructSignature, enzymeSignature, input.construct, input.enabled, input.enzymeNames.length, input.sequence, input.topology, input.previewSiteCap, previewSignature])

  if (!input.enabled || !input.sequence || !input.enzymeNames.length) {
    return { sites: [], stage: 'idle', pending: false, elapsedMs: 0 }
  }
  return state
}
