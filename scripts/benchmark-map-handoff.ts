import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { JSDOM } from 'jsdom'
import { layoutCircularEllipticCalloutsStrict } from '../src/domain/circularEllipticRouter'
import { selectEnzymeSitesAllOrNone } from '../src/domain/enzymeLabelBudget'
import { enzymes, findRestrictionSites } from '../src/domain/enzymes'
import { parseSnapGene } from '../src/domain/parsers'
import { initSnapGeneLzma } from '../src/domain/snapgeneLzma'
import type { RestrictionSite, SequenceRecord } from '../src/domain/types'

globalThis.DOMParser = new JSDOM('').window.DOMParser
await initSnapGeneLzma()

const [mapPath, handoffPath] = process.argv.slice(2)
if (!mapPath || !handoffPath) {
  throw new Error('Usage: node --import tsx scripts/benchmark-map-handoff.ts <circular-map.dna> <library-handoff.dna>')
}

function load(path: string) {
  return parseSnapGene(new Uint8Array(readFileSync(path)), path)
}

function median(samples: number[]) {
  return samples.toSorted((a, b) => a - b)[Math.floor(samples.length / 2)]!
}

function bench(fn: () => void, rounds = 9) {
  fn()
  const samples: number[] = []
  for (let index = 0; index < rounds; index += 1) {
    const started = performance.now()
    fn()
    samples.push(performance.now() - started)
  }
  return Number(median(samples).toFixed(2))
}

function mapSites(record: SequenceRecord): RestrictionSite[] {
  const all = findRestrictionSites(record.sequence, enzymes, {
    construct: record.construct,
    topology: record.topology,
  })
  const selected = selectEnzymeSitesAllOrNone(all, 90)
  const byCut = new Map<number, RestrictionSite[]>()
  for (const site of selected) {
    const group = byCut.get(site.cutTop) ?? []
    group.push(site)
    byCut.set(site.cutTop, group)
  }
  return [...byCut.values()].map((group) => ({
    ...group[0]!,
    enzyme: { ...group[0]!.enzyme, name: group.map((site) => site.enzyme.name).join(', ') },
    match: '__enzyme_callout__',
  }))
}

const mapRecord = load(mapPath)
const sites = mapSites(mapRecord)
const route = () => {
  layoutCircularEllipticCalloutsStrict({
    sites,
    sequenceLength: mapRecord.sequence.length,
    topology: mapRecord.topology,
    mapSize: 900,
    mapWidth: 900,
    mapHeight: 900,
    center: 450,
    centerX: 450,
    centerY: 450,
    radius: 270,
    outerFeatureOffset: 18,
    labelCurveShape: 'arcs',
    optimizationPass: 'final',
    labelForSite: (site) => site.enzyme.name,
    labelWidthForSite: (_site, label) => label.length * 6,
    textHeightForSite: () => 14,
    labelPaddingForSite: () => 6,
  })
}

const handoffRecord = load(handoffPath)
const payload = { type: 'vibegene:window-handoff-record', key: 'benchmark', record: handoffRecord }
const clone = () => { structuredClone(payload) }

const result = {
  note: 'Controlled operation proxy, not full UI navigation. Median of 9 runs after one warm-up; Node structuredClone proxies postMessage serialization.',
  map: {
    file: mapPath,
    bp: mapRecord.sequence.length,
    labels: sites.length,
    beforeTwoIdenticalRoutesMs: bench(() => { route(); route() }),
    afterOneRouteMs: bench(route),
  },
  handoff: {
    file: handoffPath,
    bp: handoffRecord.sequence.length,
    members: handoffRecord.traceFiles?.length ?? 0,
    beforeFiveClonesMs: bench(() => { for (let index = 0; index < 5; index += 1) clone() }),
    afterOneCloneMs: bench(clone),
  },
}

console.log(JSON.stringify(result, null, 2))
