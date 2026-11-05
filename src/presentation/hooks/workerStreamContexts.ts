import { createContext, useContext } from 'react'
import type { DnaComparisonStream, ProteinComparisonStream, RestrictionScanStream } from '../../application/ports/workerStreams'

const unavailable = (_request: unknown, _message: (response: never) => void, error: (error: Error) => void) => {
  let cancelled = false
  queueMicrotask(() => { if (!cancelled) error(new Error('Worker unavailable')) })
  return () => { cancelled = true }
}
export const DnaComparisonContext = createContext<DnaComparisonStream>(unavailable)
export const ProteinComparisonContext = createContext<ProteinComparisonStream>(unavailable)
export const RestrictionScanContext = createContext<RestrictionScanStream>(unavailable)
export const useDnaComparisonStream = () => useContext(DnaComparisonContext)
export const useProteinComparisonStream = () => useContext(ProteinComparisonContext)
export const useRestrictionScanStream = () => useContext(RestrictionScanContext)
