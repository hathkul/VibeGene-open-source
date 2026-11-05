/* eslint-disable react-refresh/only-export-components */
import type { RestrictionSite } from '../../domain/types'
import type { EnzymeTabRow, EnzymeTabSortDirection, EnzymeTabSortMode, RestrictionSiteList } from '../sequence'

export function groupRestrictionSitesByEnzyme(sites: RestrictionSiteList): EnzymeTabRow[] {
  const byEnzyme = new Map<string, RestrictionSite[]>()
  sites.forEach((site) => {
    const list = byEnzyme.get(site.enzyme.name) ?? []
    list.push(site)
    byEnzyme.set(site.enzyme.name, list)
  })
  return Array.from(byEnzyme.values()).map((enzymeSites) => ({
    enzyme: enzymeSites[0]!.enzyme,
    sites: enzymeSites.toSorted((left, right) => left.start - right.start),
  }))
}

function enzymeTabRowCaretDistance(row: EnzymeTabRow, caretPosition: number) {
  return Math.min(...row.sites.map((site) => Math.abs(site.start - caretPosition)))
}

export function sortEnzymeTabRows(
  rows: EnzymeTabRow[],
  mode: EnzymeTabSortMode,
  caretPosition: number,
  direction: EnzymeTabSortDirection,
) {
  const sorted = [...rows]
  const sign = direction === 'asc' ? 1 : -1
  const byName = (left: EnzymeTabRow, right: EnzymeTabRow) => left.enzyme.name.localeCompare(right.enzyme.name)
  if (mode === 'name') return sorted.toSorted((left, right) => sign * left.enzyme.name.localeCompare(right.enzyme.name))
  if (mode === 'site-count') return sorted.toSorted((left, right) => sign * (left.sites.length - right.sites.length) || byName(left, right))
  if (mode === 'first-site') {
    return sorted.toSorted((left, right) => sign * ((left.sites[0]?.start ?? 0) - (right.sites[0]?.start ?? 0)) || byName(left, right))
  }
  return sorted.toSorted(
    (left, right) => sign * (enzymeTabRowCaretDistance(left, caretPosition) - enzymeTabRowCaretDistance(right, caretPosition)) || byName(left, right),
  )
}

export function EnzymeTableSortHeader({
  label,
  ariaLabel,
  mode,
  activeMode,
  direction,
  onSort,
  className = '',
}: {
  label: string
  ariaLabel?: string
  mode: EnzymeTabSortMode
  activeMode: EnzymeTabSortMode
  direction: EnzymeTabSortDirection
  onSort: (mode: EnzymeTabSortMode) => void
  className?: string
}) {
  const isActive = activeMode === mode
  return (
    <button
      type="button"
      className={`enzyme-table-sort-header${isActive ? ' is-active' : ''} ${className}`.trim()}
      onClick={() => onSort(mode)}
      aria-label={ariaLabel ?? label}
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span>{label}</span>
      <span className="enzyme-table-sort-arrow" aria-hidden>
        {isActive ? (direction === 'asc' ? '▲' : '▼') : '▾'}
      </span>
    </button>
  )
}
