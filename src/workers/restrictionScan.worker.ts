import { enzymes, findRestrictionSites } from '../domain/enzymes'
import {
  methylationDisplayCodes,
  type RestrictionScanWorkerRequest,
  type RestrictionScanWorkerResponse,
  type RestrictionSiteWirePayload,
} from '../domain/restrictionScanProtocol'
import type { RestrictionEnzyme, RestrictionSite } from '../domain/types'

const enzymeByName = new Map(enzymes.map((enzyme) => [enzyme.name, enzyme]))

function enzymePool(names: string[]) {
  return names.flatMap((name) => {
    const enzyme = enzymeByName.get(name)
    return enzyme ? [enzyme] : []
  })
}

function mergeSites(left: RestrictionSite[], right: RestrictionSite[]) {
  const merged: RestrictionSite[] = []
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length || rightIndex < right.length) {
    const a = left[leftIndex]
    const b = right[rightIndex]
    if (!b || (a && (a.start < b.start || (a.start === b.start && a.enzyme.name <= b.enzyme.name)))) {
      merged.push(a!)
      leftIndex += 1
    } else {
      merged.push(b)
      rightIndex += 1
    }
  }
  return merged
}

function wireSites(sites: RestrictionSite[]): RestrictionSiteWirePayload {
  const names: string[] = []
  const nameIndex = new Map<string, number>()
  const enzymeIndexes = new Uint16Array(sites.length)
  const starts = new Int32Array(sites.length)
  const ends = new Int32Array(sites.length)
  const cutTops = new Int32Array(sites.length)
  const cutBottoms = new Int32Array(sites.length)
  const methylation = new Uint8Array(sites.length)
  sites.forEach((site, index) => {
    let enzymeIndex = nameIndex.get(site.enzyme.name)
    if (enzymeIndex === undefined) {
      enzymeIndex = names.length
      names.push(site.enzyme.name)
      nameIndex.set(site.enzyme.name, enzymeIndex)
    }
    enzymeIndexes[index] = enzymeIndex
    starts[index] = site.start
    ends[index] = site.end
    cutTops[index] = site.cutTop
    cutBottoms[index] = site.cutBottom
    methylation[index] = methylationDisplayCodes[site.methylationDisplay ?? 'normal']
  })
  return { enzymeNames: names, enzymeIndexes, starts, ends, cutTops, cutBottoms, methylation }
}

function transferPayload(
  id: number,
  stage: 'preview' | 'complete',
  elapsedMs: number,
  sites: RestrictionSite[],
) {
  const payload = wireSites(sites)
  const response: RestrictionScanWorkerResponse = { id, stage, elapsedMs, payload }
  self.postMessage(response, {
    transfer: [
      payload.enzymeIndexes.buffer,
      payload.starts.buffer,
      payload.ends.buffer,
      payload.cutTops.buffer,
      payload.cutBottoms.buffer,
      payload.methylation.buffer,
    ],
  })
}

function scan(
  request: RestrictionScanWorkerRequest,
  pool: RestrictionEnzyme[],
  maxSitesPerEnzyme?: number,
) {
  return findRestrictionSites(request.sequence, pool, {
    construct: request.construct,
    topology: request.topology,
    annotateMethylation: true,
    maxSitesPerEnzyme,
  })
}

self.addEventListener('message', (event: MessageEvent<RestrictionScanWorkerRequest>) => {
  const request = event.data
  try {
    const allNames = new Set(request.enzymeNames)
    const previewNames = request.previewEnzymeNames.filter((name) => allNames.has(name))
    const previewSet = new Set(previewNames)
    const hasDistinctPreview = previewNames.length > 0 && previewNames.length < allNames.size
    const hasPreview = previewNames.length > 0 && (hasDistinctPreview || request.previewSiteCap !== null)
    let previewSites: RestrictionSite[] = []
    const started = performance.now()

    if (hasPreview) {
      previewSites = scan(
        request,
        enzymePool(previewNames),
        request.previewSiteCap ?? undefined,
      )
      transferPayload(request.id, 'preview', performance.now() - started, previewSites)
    }

    const canMergePreview = hasDistinctPreview && request.previewSiteCap === null
    const remainingNames = canMergePreview
      ? request.enzymeNames.filter((name) => !previewSet.has(name))
      : request.enzymeNames
    const remainingSites = scan(request, enzymePool(remainingNames))
    const completeSites = canMergePreview ? mergeSites(previewSites, remainingSites) : remainingSites
    transferPayload(request.id, 'complete', performance.now() - started, completeSites)
  } catch (error) {
    const response: RestrictionScanWorkerResponse = {
      id: request.id,
      stage: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
})
