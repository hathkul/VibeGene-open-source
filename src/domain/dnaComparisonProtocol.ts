import type { DnaComparisonAlignment, DnaComparisonSource } from './dnaComparisonTypes'

export type DnaComparisonWorkerRequest = {
  id: number
  reference: string
  topology: 'linear' | 'circular'
  sources: DnaComparisonSource[]
}

export type DnaComparisonWorkerSourceResult = {
  sourceId: string
  alignment: DnaComparisonAlignment | null
  error?: string
}

export type DnaComparisonWorkerResponse =
  | { id: number; stage: 'source'; result: DnaComparisonWorkerSourceResult }
  | { id: number; stage: 'complete'; elapsedMs: number }
