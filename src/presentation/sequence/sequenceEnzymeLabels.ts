import { linearCutPosition } from '../../domain/mapLayout'
import { restrictionSiteCutsOutsideSequence } from '../../domain/enzymes'
import type { RestrictionSite } from '../../domain/types'
import type { SequenceRowSegment } from '../../domain/sequenceLabelRouter'

export function sequenceEnzymeLabelRows(
  sites: RestrictionSite[],
  sequenceLength: number,
  viewStart: number,
  viewLength: number,
  horizontalMode: boolean,
  basesPerRow: number,
  rowSegments: SequenceRowSegment[],
) {
  const byRow = new Map<number, RestrictionSite[]>()
  sites.forEach((site) => {
    const cut = linearCutPosition(site)
    const row = cut < 0 && viewStart === 0 ? 0
      : cut > sequenceLength && viewStart === 0 ? rowSegments.length - 1
        : cut < viewStart || cut >= viewStart + (horizontalMode ? sequenceLength : viewLength)
          ? -1 : Math.floor((cut - viewStart) / basesPerRow)
    if (row >= 0 && row < rowSegments.length) byRow.set(row, [...(byRow.get(row) ?? []), site])
  })
  return byRow
}

export function isOutsideLinearSequence(site: RestrictionSite, topology: string, sequenceLength: number) {
  return topology === 'linear' && restrictionSiteCutsOutsideSequence(site, sequenceLength)
}

export function sequenceEnzymeCalloutClassName(
  site: RestrictionSite,
  topology: string,
  sequenceLength: number,
  labelHovered: boolean,
  leaderHighlighted: boolean,
  unique: boolean,
  selected: boolean,
) {
  return `sequence-label-callout sequence-enzyme-callout ${isOutsideLinearSequence(site, topology, sequenceLength) ? 'is-outside-sequence ' : ''}${labelHovered ? 'is-hovered' : ''} ${leaderHighlighted ? 'is-leader-hovered' : ''} ${unique ? 'is-unique' : ''}${selected ? ' is-selected' : ''}`
}

export function recognitionHighlightClassFor(hovered: Set<number> | null, recognized: Set<number> | null) {
  return (position: number) => hovered?.has(position)
    ? 'recognition-highlight is-hovered-recognition'
    : recognized?.has(position) ? 'recognition-highlight' : ''
}
