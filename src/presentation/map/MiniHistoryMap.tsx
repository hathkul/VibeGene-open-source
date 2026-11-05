import { useMemo } from 'react'
import type { SequenceRecord } from '../../domain/types'
import { circularMapPolarPoint, circularMapStartAngle, circularMapSweepRadians } from '../../domain/circularMapGeometry'
import { assignFeatureLevels } from './featureRendering'

export function MiniHistoryMap({ record, mapSize }: { record: SequenceRecord; mapSize: number }) {
  const center = mapSize / 2
  const radius = Math.max(20, center - 10)
  const features = useMemo(() => assignFeatureLevels(record.features, record.sequence.length).filter((feature) => feature.level === 0).slice(0, 18), [record.features, record.sequence.length])

  function point(position: number, baseRadius = radius) {
    return circularMapPolarPoint(position, record.sequence.length, center, center, baseRadius, 0, record.topology)
  }

  function arc(startPosition: number, endPosition: number) {
    const start = point(startPosition)
    const end = point(endPosition)
    const span = endPosition >= startPosition ? endPosition - startPosition : record.sequence.length - startPosition + endPosition
    const angularSpan = (span / record.sequence.length) * circularMapSweepRadians(record.topology)
    const largeArc = angularSpan > Math.PI ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  function backbonePath() {
    if (record.topology === 'circular') return null
    const startAngle = circularMapStartAngle('linear')
    const sweep = circularMapSweepRadians('linear')
    const endAngle = startAngle + sweep
    const sx = center + Math.cos(startAngle) * radius
    const sy = center + Math.sin(startAngle) * radius
    const ex = center + Math.cos(endAngle) * radius
    const ey = center + Math.sin(endAngle) * radius
    const largeArc = sweep > Math.PI ? 1 : 0
    return `M ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} 1 ${ex} ${ey}`
  }

  return (
    <svg className="mini-history-map" width={mapSize} height={mapSize} viewBox={`0 0 ${mapSize} ${mapSize}`} aria-label={`${record.name} preview`}>
      {record.topology === 'circular' ? (
        <circle className="mini-history-map-backbone" cx={center} cy={center} r={radius} />
      ) : (
        <path className="mini-history-map-backbone" d={backbonePath() ?? undefined} />
      )}
      {features.map((feature) => (
        <path key={feature.segmentId} d={arc(feature.start, feature.end)} stroke={feature.feature.color} />
      ))}
    </svg>
  )
}
