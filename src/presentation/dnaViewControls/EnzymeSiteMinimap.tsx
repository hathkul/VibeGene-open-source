import { type PointerEvent as ReactPointerEvent } from 'react'
import { restrictionSiteRange, siteKey } from '../map/mapPrimitives'
import { type RestrictionSite } from '../../domain/types'
import { type SelectionRange } from '../sequence'

function nearestRestrictionSite(sites: RestrictionSite[], position: number) {
  return sites.reduce<RestrictionSite | null>((nearest, site) => {
    if (!nearest) return site
    return Math.abs(site.start - position) < Math.abs(nearest.start - position) ? site : nearest
  }, null)
}
export function EnzymeSiteMinimap({
  sites,
  sequenceLength,
  selectedRange,
  onSiteSelect,
}: {
  sites: RestrictionSite[]
  sequenceLength: number
  selectedRange: SelectionRange | null
  onSiteSelect: (site: RestrictionSite, extendSelection?: boolean) => void
}) {
  const height = 20
  const margin = 5

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (sequenceLength <= 0 || sites.length === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const position = Math.round(ratio * sequenceLength)
    const nearest = nearestRestrictionSite(sites, position)
    if (nearest) onSiteSelect(nearest, event.shiftKey || event.ctrlKey || event.metaKey)
  }

  return (
    <svg
      className="enzyme-site-minimap"
      viewBox={`0 0 ${Math.max(1, sequenceLength)} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${sites.length} restriction site${sites.length === 1 ? '' : 's'}`}
      onPointerDown={handlePointerDown}
    >
      <rect
        x={0}
        y={margin}
        width={Math.max(1, sequenceLength)}
        height={height - margin * 2}
        className="enzyme-site-minimap-track"
      />
      {sites.map((site) => {
        const range = restrictionSiteRange(site, sequenceLength)
        const isSelected =
          selectedRange !== null && selectedRange.start === range.start && selectedRange.end === range.end
        const x = site.start + 0.5
        const className = `enzyme-site-minimap-line${isSelected ? ' is-selected' : ''}`
        return (
          <line
            key={siteKey(site)}
            x1={x}
            x2={x}
            y1={0}
            y2={height}
            className={className}
          />
        )
      })}
    </svg>
  )
}
