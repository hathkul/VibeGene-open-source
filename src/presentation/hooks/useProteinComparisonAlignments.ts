import { useProteinComparisonStream } from './workerStreamContexts'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ProteinAlignmentWorkerRequest,
  ProteinAlignmentWorkerResponse,
  ProteinAlignmentWorkerSourceResult,
} from '../../domain/proteinAlignmentProtocol'
import {
  proteinAlignmentCacheSignature,
  type ProteinComparisonAlignmentCacheEntry,
} from '../../domain/proteinAlignmentCache'
import type {
  ProteinComparisonSource,
  ProteinComparisonVariableRegion,
  ProteinGuidedAlignment,
} from '../../domain/proteinAlignmentTypes'

export type ProteinComparisonAlignmentEntry = {
  source: ProteinComparisonSource
  alignment: ProteinGuidedAlignment | null
  pending: boolean
  error?: string
}

type AlignmentState = {
  requestId: number
  results: Map<string, ProteinAlignmentWorkerSourceResult>
  pending: boolean
}

const resultCache = new Map<string, ProteinAlignmentWorkerSourceResult>()

export function useProteinComparisonAlignments(
  reference: string,
  sources: ProteinComparisonSource[],
  variableRegions: ProteinComparisonVariableRegion[],
  geneticCode = 'Standard',
  persistedCache: ProteinComparisonAlignmentCacheEntry[] = [],
  onPersistedCacheEntry?: (entry: ProteinComparisonAlignmentCacheEntry) => void,
) {
  const startWorker = useProteinComparisonStream()
  const nextRequestId = useRef(1)
  const persistRef = useRef(onPersistedCacheEntry)
  const persistedCacheRef = useRef(persistedCache)
  useEffect(() => {
    persistRef.current = onPersistedCacheEntry
    persistedCacheRef.current = persistedCache
  }, [onPersistedCacheEntry, persistedCache])
  const sourceSignature = useMemo(
    () => sources.map((source) => proteinAlignmentCacheSignature(reference, source, geneticCode, variableRegions)).join('\u0000'),
    [geneticCode, reference, sources, variableRegions],
  )
  const [state, setState] = useState<AlignmentState>({
    requestId: 0,
    results: new Map(),
    pending: false,
  })

  useEffect(() => {
    const requestId = nextRequestId.current++
    const persistedBySignature = new Map(
      persistedCacheRef.current.map((entry) => [`${entry.sourceId}\u0000${entry.signature}`, entry]),
    )
    const cachedResults = new Map<string, ProteinAlignmentWorkerSourceResult>()
    const uncachedSources: ProteinComparisonSource[] = []
    for (const source of sources) {
      const signature = proteinAlignmentCacheSignature(reference, source, geneticCode, variableRegions)
      const persisted = persistedBySignature.get(`${source.id}\u0000${signature}`)
      if (persisted) {
        const result = {
          sourceId: source.id,
          alignment: persisted.alignment,
          ...(persisted.error ? { error: persisted.error } : {}),
        }
        resultCache.set(signature, result)
        cachedResults.set(source.id, result)
        continue
      }
      const cached = resultCache.get(signature)
      if (cached) cachedResults.set(source.id, cached)
      else uncachedSources.push(source)
    }
    setState({ requestId, results: cachedResults, pending: uncachedSources.length > 0 })
    if (!uncachedSources.length) return

    let disposed = false
    const onMessage = (response: ProteinAlignmentWorkerResponse) => {
      if (disposed || response.id !== requestId) return
      if (response.stage === 'source') {
        const result = response.result
        const source = sources.find((candidate) => candidate.id === result.sourceId)
        if (source) {
          const signature = proteinAlignmentCacheSignature(reference, source, geneticCode, variableRegions)
          resultCache.set(signature, result)
          persistRef.current?.({
            sourceId: source.id,
            signature,
            alignment: result.alignment,
            ...(result.error ? { error: result.error } : {}),
          })
        }
        setState((current) => {
          if (current.requestId !== requestId) return current
          const results = new Map(current.results)
          results.set(result.sourceId, result)
          return { ...current, results }
        })
        return
      }
      setState((current) => current.requestId === requestId ? { ...current, pending: false } : current)
      stopWorker()
    }
    const onError = (error: Error) => {
      if (disposed) return
      setState((current) => {
        if (current.requestId !== requestId) return current
        const results = new Map(current.results)
        for (const source of uncachedSources) {
          if (!results.has(source.id)) {
            results.set(source.id, { sourceId: source.id, alignment: null, error: error.message || 'Alignment worker failed' })
          }
        }
        return { ...current, results, pending: false }
      })
      stopWorker()
    }

    const request: ProteinAlignmentWorkerRequest = {
      id: requestId,
      reference,
      sources: uncachedSources,
      geneticCode,
      variableRegions,
    }
    const stopWorker = startWorker(request, onMessage, onError)
    return () => {
      disposed = true
      stopWorker()
    }
  }, [startWorker, geneticCode, reference, sourceSignature, sources, variableRegions])

  const entries = sources.map<ProteinComparisonAlignmentEntry>((source) => {
    const result = state.results.get(source.id)
    return {
      source,
      alignment: result?.alignment ?? null,
      pending: state.pending && !result,
      ...(result?.error ? { error: result.error } : {}),
    }
  })
  return { entries, pending: state.pending }
}
