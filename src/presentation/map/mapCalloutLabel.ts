import { enzymeNamesFromLabel } from '../../domain/enzymeLabel'

export type MapCalloutKind = 'enzyme' | 'primer'

export function enzymeCalloutMatchesHover(displayedLabel: string, hoveredName: string | null) {
  return hoveredName !== null && enzymeNamesFromLabel(displayedLabel).includes(hoveredName)
}

/** Move label text outward from its leader endpoint by a visual clearance. */
export function mapCalloutTextOriginX(connectorX: number, anchor: 'start' | 'end' | 'middle', gapPx: number) {
  if (anchor === 'middle') return connectorX
  return connectorX + (anchor === 'start' ? 1 : -1) * Math.max(0, gapPx)
}

/** Coordinates sit on the outside edge of the label, away from its leader. */
export function mapCalloutLabelParts(label: string, kind: MapCalloutKind, anchor: string) {
  const match = kind === 'primer'
    ? label.match(/^(\([\d,]+\s*\.\.\s*[\d,]+\))\s+(.+)$/)
    : label.match(/^(.+?)\s+(\([\d,]+\))$/)
  if (!match) return { text: label, name: label, coordinate: '', coordinateFirst: false }
  const coordinate = kind === 'primer'
    ? match[1]!
    : `(${Number(match[2]!.slice(1, -1).replaceAll(',', '')).toLocaleString()})`
  const name = kind === 'primer' ? match[2]! : match[1]!
  const coordinateFirst = anchor === 'end'
  const gap = '\u00a0\u00a0\u00a0'
  return { name, coordinate, coordinateFirst, text: coordinateFirst ? `${coordinate}${gap}${name}` : `${name}${gap}${coordinate}` }
}

/** Conservative width: order and mixed font weights must never exceed the routed box. */
export function mapCalloutLabelWidth(label: string, kind: MapCalloutKind, measure: (text: string) => number) {
  return Math.max(measure(mapCalloutLabelParts(label, kind, 'start').text), measure(mapCalloutLabelParts(label, kind, 'end').text))
}
