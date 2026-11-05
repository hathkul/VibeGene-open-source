import { readFileSync } from 'node:fs'
import { parseGenBank } from '../src/domain/parsers'
import { detectCommonFeatures, type CommonFeatureTemplate } from '../src/domain/commonFeatures'
import { indexIntervalsBySequenceRow, type SequenceRowInterval } from '../src/domain/sequenceRowIntervalIndex'
import { uniqueAgaroseGelOpenSources } from '../src/domain/agaroseGelSourceSearch'

type Interval = { id: number; start: number; end: number }

function median(samples: number[]) {
  const sorted = samples.toSorted((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

function bench(fn: () => unknown, iterations = 21) {
  for (let index = 0; index < 3; index += 1) fn()
  const samples = Array.from({ length: iterations }, () => {
    const started = performance.now()
    fn()
    return performance.now() - started
  })
  return { medianMs: median(samples), minMs: Math.min(...samples), maxMs: Math.max(...samples) }
}

function oldIndexIntervalsByRow(items: readonly Interval[], rows: readonly SequenceRowInterval[]) {
  return rows.map((row) => items.filter((item) => (
    item.end > row.rowStart && item.start < row.rowStart + row.rowLength
  )))
}

function format(result: ReturnType<typeof bench>) {
  return `${result.medianMs.toFixed(3)} ms median (${result.minMs.toFixed(3)}–${result.maxMs.toFixed(3)})`
}

const genBankPath = process.argv[2]
if (!genBankPath) throw new Error('Pass a representative large GenBank file path.')

const parseStarted = performance.now()
const record = parseGenBank(readFileSync(genBankPath, 'utf8'), genBankPath)
const parseMs = performance.now() - parseStarted
const basesPerRow = 74
const rows = Array.from({ length: Math.ceil(record.sequence.length / basesPerRow) }, (_, index) => ({
  rowStart: index * basesPerRow,
  rowLength: Math.min(basesPerRow, record.sequence.length - index * basesPerRow),
}))
const featureIntervals: Interval[] = record.features.flatMap((feature, featureIndex) => (
  feature.locations.map((location, locationIndex) => ({
    id: featureIndex * 100 + locationIndex,
    start: Math.min(location.start, location.end),
    end: Math.max(location.start, location.end),
  }))
)).filter((item) => item.end > item.start)
const syntheticPrimers = Array.from({ length: 31 }, (_, index) => ({
  id: 100_000 + index,
  start: Math.floor(index * Math.max(1, record.sequence.length - 28) / 31),
  end: Math.floor(index * Math.max(1, record.sequence.length - 28) / 31) + 28,
}))
const realScaleIntervals = [...featureIntervals, ...syntheticPrimers]

const denseRows = Array.from({ length: 1_000 }, (_, index) => ({ rowStart: index * 100, rowLength: 100 }))
const denseIntervals = Array.from({ length: 10_000 }, (_, index) => ({
  id: index,
  start: index * 10,
  end: index * 10 + 24,
}))

const sources = Array.from({ length: 9_106 }, (_, index) => ({ label: `Construct ${index}`, id: index }))
const openGelSources = Array.from({ length: 24 }, (_, index) => ({
  label: `Open construct ${index}`,
  record: { id: `record-${Math.floor(index / 2)}` },
}))
const projects = Array.from({ length: 8_892 }, (_, index) => ({
  id: index,
  name: `Construct ${index}`,
  folder: `Folder ${index % 120}`,
  updatedAt: 1_700_000_000_000 + index,
}))
const renderRows = (count: number) => projects.slice(0, count).map((project) => (
  `${project.id}|${project.name}|${project.folder}|${new Date(project.updatedAt).toISOString()}`
))

const commonFeatures = JSON.parse(
  readFileSync(new URL('../src/data/commonFeatures.json', import.meta.url), 'utf8'),
) as CommonFeatureTemplate[]

console.log(JSON.stringify({
  fixture: {
    name: record.name,
    bp: record.sequence.length,
    features: record.features.length,
    syntheticPrimers: syntheticPrimers.length,
    rows: rows.length,
    parseMs: Number(parseMs.toFixed(3)),
  },
  sequenceRowIndexRealScale: {
    before: format(bench(() => oldIndexIntervalsByRow(realScaleIntervals, rows), 101)),
    after: format(bench(() => indexIntervalsBySequenceRow(realScaleIntervals, rows, (item) => item), 101)),
  },
  sequenceRowIndexDenseStress: {
    before: format(bench(() => oldIndexIntervalsByRow(denseIntervals, denseRows), 15)),
    after: format(bench(() => indexIntervalsBySequenceRow(denseIntervals, denseRows, (item) => item), 15)),
  },
  gelSources: {
    beforeAllOptions: format(bench(() => sources.map((source) => ({ ...source })), 101)),
    afterOpenDropdown: format(bench(() => uniqueAgaroseGelOpenSources(openGelSources, 'current-record'), 101)),
    beforeCount: sources.length,
    afterCount: uniqueAgaroseGelOpenSources(openGelSources, 'current-record').length + 1,
    note: 'Current/history source plus deduplicated open constructs; database and files load only through Add.',
  },
  databaseRows: {
    before200: format(bench(() => renderRows(200), 101)),
    after50: format(bench(() => renderRows(50), 101)),
    beforeCount: 200,
    afterCount: 50,
  },
  commonFeatureDetection: {
    templates: commonFeatures.length,
    currentTotal: format(bench(() => detectCommonFeatures(record, commonFeatures), 7)),
    note: 'Total worker computation; UI main-thread blocking is now avoided.',
  },
}, null, 2))
