import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { basename } from 'node:path'
import {
  clearRestrictionSiteCache,
  findRestrictionSites,
  findRestrictionSitesLegacy,
} from '../src/domain/enzymes'
import { enzymePoolForSettings, normalizeEnzymePreferences } from '../src/domain/enzymePreferences'
import { annotateRestrictionSiteMethylation } from '../src/domain/methylation'
import { parseSequenceFile } from '../src/domain/parsers'
import type { RestrictionSite } from '../src/domain/types'

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: npm run benchmark:enzymes -- "/path/to/sequence.gb"')
  process.exit(1)
}

const iterations = Math.max(1, Number(process.env.BENCH_ITERATIONS) || 3)
const text = readFileSync(filePath, 'utf8')

const parseStarted = performance.now()
const record = parseSequenceFile(text, basename(filePath))
const parseMs = performance.now() - parseStarted
const preferences = normalizeEnzymePreferences({})
const poolMode = process.env.BENCH_POOL === 'all' ? 'all' : 'nonredundant'
const topology = process.env.BENCH_TOPOLOGY === 'linear' ? 'linear' : record.topology
const pool = enzymePoolForSettings(
  { set: poolMode, selectedNames: [], supplierSetId: null },
  preferences,
)
const options = {
  construct: record.construct,
  topology,
  annotateMethylation: true,
  noCache: true,
} as const

function siteKey(site: RestrictionSite) {
  return [
    site.enzyme.name,
    site.start,
    site.end,
    site.cutTop,
    site.cutBottom,
    site.match,
    site.methylationDisplay ?? '',
  ].join('\0')
}

function median(values: number[]) {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)] ?? 0
}

function run(label: string, scan: () => RestrictionSite[]) {
  const times: number[] = []
  let result: RestrictionSite[] = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    clearRestrictionSiteCache()
    const started = performance.now()
    result = scan()
    times.push(performance.now() - started)
  }
  return {
    label,
    result,
    medianMs: median(times),
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
  }
}

const heapBeforeMb = process.memoryUsage().heapUsed / 1024 / 1024
const legacy = run('legacy-regex-indexed-methylation', () =>
  findRestrictionSitesLegacy(record.sequence, pool, options),
)
const optimized = run('compiled-anchor-indexed-methylation', () =>
  findRestrictionSites(record.sequence, pool, options),
)
const motifScan = run('compiled-motif-scan', () =>
  findRestrictionSites(record.sequence, pool, {
    ...options,
    annotateMethylation: false,
  }),
)
const methylationAnnotation = run('indexed-methylation-annotation', () =>
  annotateRestrictionSiteMethylation(
    motifScan.result,
    record.sequence,
    record.construct,
    topology,
  ),
)
const filtering = run('unique-six-plus-filter', () => {
  const counts = new Map<string, number>()
  methylationAnnotation.result.forEach((site) => {
    counts.set(site.enzyme.name, (counts.get(site.enzyme.name) ?? 0) + 1)
  })
  return methylationAnnotation.result.filter(
    (site) => site.enzyme.recognition.length >= 6 && counts.get(site.enzyme.name) === 1,
  )
})
const heapAfterMb = process.memoryUsage().heapUsed / 1024 / 1024

const legacyKeys = new Set(legacy.result.map(siteKey))
const optimizedKeys = new Set(optimized.result.map(siteKey))
const missing = [...legacyKeys].filter((key) => !optimizedKeys.has(key)).length
const extra = [...optimizedKeys].filter((key) => !legacyKeys.has(key)).length

console.log(
  JSON.stringify(
    {
      file: filePath,
      fileBytes: Buffer.byteLength(text),
      sequenceBp: record.sequence.length,
      topology,
      features: record.features.length,
      pool: poolMode,
      enzymes: pool.length,
      iterations,
      parseMs: Number(parseMs.toFixed(2)),
      legacy: {
        medianMs: Number(legacy.medianMs.toFixed(2)),
        minMs: Number(legacy.minMs.toFixed(2)),
        maxMs: Number(legacy.maxMs.toFixed(2)),
        sites: legacy.result.length,
      },
      optimized: {
        medianMs: Number(optimized.medianMs.toFixed(2)),
        minMs: Number(optimized.minMs.toFixed(2)),
        maxMs: Number(optimized.maxMs.toFixed(2)),
        sites: optimized.result.length,
      },
      speedup: Number((legacy.medianMs / optimized.medianMs).toFixed(2)),
      phases: {
        motifScanMedianMs: Number(motifScan.medianMs.toFixed(2)),
        methylationMedianMs: Number(methylationAnnotation.medianMs.toFixed(2)),
        filteringMedianMs: Number(filtering.medianMs.toFixed(2)),
        displayedUniqueSixPlusSites: filtering.result.length,
      },
      heap: {
        beforeMb: Number(heapBeforeMb.toFixed(1)),
        afterMb: Number(heapAfterMb.toFixed(1)),
        retainedBenchmarkDeltaMb: Number((heapAfterMb - heapBeforeMb).toFixed(1)),
        compactWorkerPayloadMb: Number(
          ((optimized.result.length * (2 + 4 * 4 + 1)) / 1024 / 1024).toFixed(2),
        ),
      },
      parity: { missing, extra },
    },
    null,
    2,
  ),
)
