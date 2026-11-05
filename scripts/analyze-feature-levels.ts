import { readFileSync } from 'node:fs'
import { parseSequenceFile } from '../src/domain/parsers'
import { featureBounds } from '../src/domain/sequence'
import type { SequenceFeature } from '../src/domain/types'

type FeatureSegmentInfo = {
  feature: SequenceFeature
  start: number
  end: number
}

function drawableSegments(features: SequenceFeature[], sequenceLength: number): FeatureSegmentInfo[] {
  return features.flatMap((feature) => {
    if (feature.type === 'source') return []

    const bounds = featureBounds(feature)
    const start = Math.max(0, Math.min(sequenceLength, bounds.start))
    const end = Math.max(0, Math.min(sequenceLength, bounds.end))
    if (start === end) return []
    if (start < end) return [{ feature, start, end }]
    return [
      { feature, start, end: sequenceLength },
      { feature, start: 0, end },
    ]
  })
}

function assignLevels(features: SequenceFeature[], sequenceLength: number) {
  const levelEnds: number[] = []
  return drawableSegments(features, sequenceLength)
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .map((item) => {
      const level = levelEnds.findIndex((end) => item.start >= end)
      const resolvedLevel = level === -1 ? levelEnds.length : level
      levelEnds[resolvedLevel] = item.end
      return { ...item, level: resolvedLevel }
    })
}

const fileName = process.argv[2] ?? 'tests/fixtures/vibegene-pdemo.gbk'
const record = parseSequenceFile(readFileSync(fileName, 'utf8'), fileName)
const levels = assignLevels(record.features, record.sequence.length)
const byLevel = new Map<number, typeof levels>()

levels.forEach((item) => {
  const entries = byLevel.get(item.level) ?? []
  entries.push(item)
  byLevel.set(item.level, entries)
})

console.log(`${record.name}: ${record.sequence.length} bp`)
console.log(`source features parsed: ${record.features.filter((feature) => feature.type === 'source').length}`)
for (const [level, entries] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(
    `level ${level}: ${entries
      .slice(0, 8)
      .map((entry) => `${entry.feature.name} ${entry.start + 1}..${entry.end}`)
      .join('; ')}${entries.length > 8 ? `; +${entries.length - 8} more` : ''}`,
  )
}
