import { enzymes } from './enzymes'
import {
  methylationDisplayFromCode,
  type RestrictionSiteWirePayload,
} from './restrictionScanProtocol'
import type { ConstructProperties, RestrictionSite, Topology } from './types'

export type RestrictionSiteScanState = {
  sites: RestrictionSite[]
  stage: 'idle' | 'preview' | 'complete' | 'error'
  pending: boolean
  elapsedMs: number
  error?: string
}

export type RestrictionSiteScanInput = {
  enabled: boolean
  sequence: string
  topology: Topology
  construct: ConstructProperties
  enzymeNames: string[]
  previewEnzymeNames?: string[]
  previewSiteCap?: number
}

const enzymeByName = new Map(enzymes.map((enzyme) => [enzyme.name, enzyme]))

function siteMatch(sequence: string, topology: Topology, start: number, length: number) {
  if (topology === 'linear' || start + length <= sequence.length) return sequence.slice(start, start + length)
  return sequence.slice(start) + sequence.slice(0, start + length - sequence.length)
}

export function restrictionSiteScanSignatures(input: RestrictionSiteScanInput) {
  return {
    enzymeSignature: input.enzymeNames.join('\0'),
    previewSignature: (input.previewEnzymeNames ?? []).join('\0'),
    constructSignature: [
      input.construct.syntheticDna ? 1 : 0,
      input.construct.bacterialTransformationStrain,
      input.construct.hostMethylation.dam ? 1 : 0,
      input.construct.hostMethylation.dcm ? 1 : 0,
      input.construct.hostMethylation.ecoKI ? 1 : 0,
    ].join(':'),
  }
}

export function unwireRestrictionSites(
  payload: RestrictionSiteWirePayload,
  sequence: string,
  topology: Topology,
): RestrictionSite[] {
  const sites: RestrictionSite[] = []
  for (let index = 0; index < payload.starts.length; index += 1) {
    const enzymeName = payload.enzymeNames[payload.enzymeIndexes[index]!]
    const enzyme = enzymeName ? enzymeByName.get(enzymeName) : undefined
    if (!enzyme) continue
    sites.push({
      enzyme,
      start: payload.starts[index]!,
      end: payload.ends[index]!,
      cutTop: payload.cutTops[index]!,
      cutBottom: payload.cutBottoms[index]!,
      match: siteMatch(sequence, topology, payload.starts[index]!, enzyme.recognition.length),
      methylationDisplay: methylationDisplayFromCode[payload.methylation[index]!] ?? 'normal',
    })
  }
  return sites
}
