import type { ProteinComparisonSource, ProteinComparisonVariableRegion, ProteinGuidedAlignment } from './proteinAlignmentTypes'

export type ProteinAlignmentWorkerRequest = {
  id: number
  reference: string
  sources: ProteinComparisonSource[]
  geneticCode: string
  variableRegions: ProteinComparisonVariableRegion[]
}

export type ProteinAlignmentWorkerSourceResult = {
  sourceId: string
  alignment: ProteinGuidedAlignment | null
  error?: string
}

export type ProteinAlignmentWorkerResponse =
  | {
      id: number
      stage: 'source'
      result: ProteinAlignmentWorkerSourceResult
    }
  | {
      id: number
      stage: 'complete'
      elapsedMs: number
    }
