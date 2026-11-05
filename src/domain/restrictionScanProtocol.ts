import type { ConstructProperties, SiteMethylationDisplay, Topology } from './types'

export type RestrictionScanWorkerRequest = {
  id: number
  sequence: string
  topology: Topology
  construct: ConstructProperties
  /** Superset needed for active display and parental menu counts. */
  enzymeNames: string[]
  /** Optional fast first pass (normally six-plus enzymes). */
  previewEnzymeNames: string[]
  /** Count cap for unique/dual preview (2 means “one vs many”). */
  previewSiteCap: number | null
}

export type RestrictionSiteWirePayload = {
  enzymeNames: string[]
  enzymeIndexes: Uint16Array
  starts: Int32Array
  ends: Int32Array
  cutTops: Int32Array
  cutBottoms: Int32Array
  methylation: Uint8Array
}

export type RestrictionScanWorkerResponse =
  | {
      id: number
      stage: 'preview' | 'complete'
      elapsedMs: number
      payload: RestrictionSiteWirePayload
    }
  | {
      id: number
      stage: 'error'
      message: string
    }

export const methylationDisplayCodes: Record<SiteMethylationDisplay, number> = {
  normal: 0,
  blocked: 1,
  'methyl-required-available': 2,
  'methyl-required-unavailable': 3,
}

export const methylationDisplayFromCode: SiteMethylationDisplay[] = [
  'normal',
  'blocked',
  'methyl-required-available',
  'methyl-required-unavailable',
]
