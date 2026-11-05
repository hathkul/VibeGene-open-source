import type { RestrictionSite } from '../../domain/types'
import { isPrimerCalloutSite, linearCutPosition } from '../../domain/mapLayout'
import { siteKey } from '../map/mapPrimitives'

export function SequenceCutOverlay({
  rowStart,
  rowEnd,
  sequenceWidthPx,
  sequenceFontSizePx,
  sequenceStrandRowHeightPx,
  sequenceRulerHeightPx,
  selectedRestrictionSites,
  hoveredSite,
  hoveredEnzymeStackId,
  rowCutX,
}: {
  rowStart: number
  rowEnd: number
  sequenceWidthPx: number
  sequenceFontSizePx: number
  sequenceStrandRowHeightPx: number
  sequenceRulerHeightPx: number
  selectedRestrictionSites: RestrictionSite[]
  hoveredSite: RestrictionSite | null
  hoveredEnzymeStackId: string | null
  rowCutX: (cutPosition: number, rowStart: number) => number
}) {
  const strandMidlineY = sequenceStrandRowHeightPx + sequenceRulerHeightPx / 2
  const strandBlockHeight = sequenceStrandRowHeightPx * 2 + sequenceRulerHeightPx
  const strandTextInsetY = (sequenceStrandRowHeightPx - sequenceFontSizePx) / 2
  const sites = new Map<string, RestrictionSite>()
  for (const site of [...selectedRestrictionSites, ...(hoveredSite ? [hoveredSite] : [])]) {
    if (!isPrimerCalloutSite(site)) sites.set(siteKey(site), site)
  }

  return (
    <>
      {[...sites.values()].map((site) => {
        const isActiveCut = hoveredEnzymeStackId === `cut-${linearCutPosition(site)}` ||
          selectedRestrictionSites.some((selectedSite) => linearCutPosition(selectedSite) === linearCutPosition(site))
        const cutTop = site.cutTop ?? site.start
        const cutBottom = site.cutBottom ?? site.start
        const topVisible = cutTop >= rowStart && cutTop <= rowEnd
        const bottomVisible = cutBottom >= rowStart && cutBottom <= rowEnd
        if (!topVisible && !bottomVisible) return null
        const topX = rowCutX(cutTop, rowStart)
        const bottomX = rowCutX(cutBottom, rowStart)
        const rulerBottomY = sequenceStrandRowHeightPx + sequenceRulerHeightPx
        const directTextTopY = strandTextInsetY
        const directTextBottomY = strandTextInsetY + sequenceFontSizePx
        const reverseTextTopY = rulerBottomY + strandTextInsetY
        const reverseTextBottomY = reverseTextTopY + sequenceFontSizePx
        return (
          <svg key={siteKey(site)} className="sequence-cut-overlay" width={sequenceWidthPx} height={strandBlockHeight} aria-hidden>
            {topVisible && isActiveCut && <path d={`M ${topX} ${directTextTopY - 1} L ${topX - 5} ${directTextTopY - 11} L ${topX + 5} ${directTextTopY - 11} Z`} className="sequence-cut-arrowhead is-active" />}
            {topVisible && <line x1={topX} y1={directTextBottomY} x2={topX} y2={strandMidlineY} className="sequence-cut-tick top" />}
            {bottomVisible && <line x1={bottomX} y1={strandMidlineY} x2={bottomX} y2={reverseTextTopY} className="sequence-cut-tick bottom" />}
            {bottomVisible && isActiveCut && <path d={`M ${bottomX} ${reverseTextBottomY + 2} L ${bottomX - 5} ${reverseTextBottomY + 11} L ${bottomX + 5} ${reverseTextBottomY + 11} Z`} className="sequence-cut-arrowhead is-active" />}
            {topVisible && bottomVisible && <line x1={topX} y1={strandMidlineY} x2={bottomX} y2={strandMidlineY} className="sequence-cut-bridge" />}
          </svg>
        )
      })}
    </>
  )
}
