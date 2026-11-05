import type { EnzymePreferences, SavedEnzymeSet } from '../../domain/enzymePreferences'
import { overhangDescription } from '../../domain/enzymeCatalog'
import type { RestrictionSite } from '../../domain/types'
import { Eye, EyeOff } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  EnzymeSiteMinimap,
  EnzymeTabSetControl,
} from '../dnaViewControls'
import { restrictionSiteRange, siteKey } from '../map/mapPrimitives'
import type {
  DisplaySettings,
  EnzymeTabPositionMode,
  EnzymeTabRow,
  EnzymeTabSortDirection,
  EnzymeTabSortMode,
  RestrictionSiteList,
  SelectionRange,
} from '../sequence'
import type { SequenceRecord } from '../../domain/types'
import { filterEnzymeTabRows } from './enzymeTabModel'


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

export type EnzymesTabPaneProps = {
  settings: DisplaySettings
  enzymePreferences: EnzymePreferences
  fileEnzymeSets: SavedEnzymeSet[]
  restrictionSites: RestrictionSiteList
  parentalRestrictionSites: RestrictionSiteList
  record: {
    name: string
    sequence: string
    topology: SequenceRecord['topology']
    construct: SequenceRecord['construct']
  }
  selectedRange: SelectionRange | null
  searchQuery: string
  table: {
    rows: EnzymeTabRow[]
    sortMode: EnzymeTabSortMode
    sortDirection: EnzymeTabSortDirection
  }
  mobile: {
    isMobileShell: boolean
    positionMode: EnzymeTabPositionMode
    expandedLocations: ReadonlySet<string>
  }
  actions: {
    updateSection: <Key extends keyof DisplaySettings>(key: Key, patch: Partial<DisplaySettings[Key]>) => void
    onEnzymeInfo: (name: string) => void
    onPreferencesChange: (preferences: EnzymePreferences) => void
    onFileEnzymeSetsChange: (sets: SavedEnzymeSet[]) => void
    onSaveEnzymeSet?: () => void
    onSort: (mode: EnzymeTabSortMode) => void
    onPositionModeChange: (mode: EnzymeTabPositionMode) => void
    onExpandLocations: (enzymeName: string) => void
    onNavigateToSite: (site: RestrictionSite) => void
  }
}

export function EnzymesTabPane({
  settings,
  enzymePreferences,
  fileEnzymeSets,
  restrictionSites,
  parentalRestrictionSites,
  record,
  selectedRange,
  searchQuery,
  table,
  mobile,
  actions,
}: EnzymesTabPaneProps) {
  const rows = filterEnzymeTabRows(table.rows, searchQuery)
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const selectionAnchor = useRef<string | null>(null)
  const selectRow = (name: string, event: React.MouseEvent<HTMLTableRowElement>) => {
    const visibleNames = rows.map((row) => row.enzyme.name)
    if (event.shiftKey && selectionAnchor.current) {
      const anchorIndex = visibleNames.indexOf(selectionAnchor.current)
      const clickedIndex = visibleNames.indexOf(name)
      if (anchorIndex >= 0 && clickedIndex >= 0) {
        const start = Math.min(anchorIndex, clickedIndex)
        const end = Math.max(anchorIndex, clickedIndex)
        setSelectedNames(visibleNames.slice(start, end + 1))
        return
      }
    }
    if (event.metaKey || event.ctrlKey) {
      setSelectedNames((current) => current.includes(name)
        ? current.filter((selectedName) => selectedName !== name)
        : [...current, name])
      selectionAnchor.current = name
      return
    }
    selectionAnchor.current = name
    setSelectedNames([name])
  }
  return (
    <div className="enzymes-tab">
      <EnzymeTabSetControl
        settings={settings}
        enzymePreferences={enzymePreferences}
        fileEnzymeSets={fileEnzymeSets}
        restrictionSites={restrictionSites}
        parentalRestrictionSites={parentalRestrictionSites}
        recordName={record.name}
        sequence={record.sequence}
        topology={record.topology}
        construct={record.construct}
        selectedRange={selectedRange}
        selectedEnzymeNames={selectedNames}
        enzymeCount={table.rows.length}
        updateSection={actions.updateSection}
        onEnzymeInfo={actions.onEnzymeInfo}
        onPreferencesChange={actions.onPreferencesChange}
        onFileEnzymeSetsChange={actions.onFileEnzymeSetsChange}
        onSaveEnzymeSet={actions.onSaveEnzymeSet}
      />
      <div className="enzymes-tab-table-wrap">
        <table className="data-table enzymes-table">
          <thead>
            <tr>
              <th className="enzyme-sortable-header">
                <EnzymeTableSortHeader
                  label="Enzyme"
                  mode="name"
                  activeMode={table.sortMode}
                  direction={table.sortDirection}
                  onSort={actions.onSort}
                />
              </th>
              <th className="enzyme-sortable-header">
                <EnzymeTableSortHeader
                  label="Sites"
                  mode="site-count"
                  activeMode={table.sortMode}
                  direction={table.sortDirection}
                  onSort={actions.onSort}
                />
              </th>
              <th className="enzyme-positions-header">
                <div className="enzyme-positions-header-inner">
                  <div className="enzyme-positions-sort-group">
                    <EnzymeTableSortHeader
                      label={mobile.isMobileShell ? 'Loc.' : 'Location'}
                      ariaLabel="Sort by location"
                      mode="first-site"
                      activeMode={table.sortMode}
                      direction={table.sortDirection}
                      onSort={actions.onSort}
                    />
                    <EnzymeTableSortHeader
                      label={mobile.isMobileShell ? 'Δ' : 'Caret'}
                      ariaLabel="Sort by caret distance"
                      mode="caret-distance"
                      activeMode={table.sortMode}
                      direction={table.sortDirection}
                      onSort={actions.onSort}
                    />
                  </div>
                  <div className="enzyme-position-mode-toggle" role="tablist" aria-label="Position display mode">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mobile.positionMode === 'numbers'}
                      className={mobile.positionMode === 'numbers' ? 'is-active' : ''}
                      onClick={() => actions.onPositionModeChange('numbers')}
                    >
                      Numbers
                    </button>
                    {!mobile.isMobileShell ? (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={mobile.positionMode === 'lines'}
                        className={mobile.positionMode === 'lines' ? 'is-active' : ''}
                        onClick={() => actions.onPositionModeChange('lines')}
                      >
                        Lines
                      </button>
                    ) : null}
                  </div>
                </div>
              </th>
              <th>Type</th>
              <th>Overhang</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  {searchQuery.trim()
                    ? 'No enzymes match the search.'
                    : 'No restriction sites match the selected enzyme set.'}
                </td>
              </tr>
            ) : (
              rows.map(({ enzyme, sites }) => {
                const siteRange = (site: RestrictionSite) => restrictionSiteRange(site, record.sequence.length)
                const methylationGreyed = sites.some(
                  (site) =>
                    site.methylationDisplay === 'blocked' ||
                    site.methylationDisplay === 'methyl-required-unavailable',
                )
                const methylationAsterisk = sites.some(
                  (site) =>
                    site.methylationDisplay === 'blocked' ||
                    site.methylationDisplay === 'methyl-required-available',
                )
                const useNumbers = mobile.isMobileShell || mobile.positionMode === 'numbers'
                const locationsExpanded = mobile.expandedLocations.has(enzyme.name)
                const enzymeHidden = (settings.enzymes.hiddenNames ?? []).includes(enzyme.name)
                return (
                  <tr
                    key={enzyme.name}
                    className={`${enzymeHidden ? 'is-enzyme-hidden ' : ''}${selectedNames.includes(enzyme.name) ? 'selected-row' : ''}`.trim()}
                    aria-selected={selectedNames.includes(enzyme.name)}
                    onMouseDown={(event) => {
                      if (event.shiftKey || event.metaKey || event.ctrlKey) event.preventDefault()
                    }}
                    onClick={(event) => selectRow(enzyme.name, event)}
                  >
                    <td
                      className={[
                        'enzyme-name-cell',
                        'enzyme-tab-name-cell',
                        'enzyme-name-cell-action',
                        enzymePreferences.italicizeNames ? 'is-italic' : '',
                        enzymePreferences.boldUniqueCutters && sites.length === 1 ? 'is-unique-cutter' : '',
                        enzymePreferences.greenBluntCutters &&
                        enzyme.overhang.type === 'blunt' &&
                        !methylationGreyed
                          ? 'is-blunt-cutter'
                          : '',
                        methylationGreyed ? 'is-methylation-greyed' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onDoubleClick={() => actions.onEnzymeInfo(enzyme.name)}
                      title="Double-click for enzyme information"
                    >
                      <span className="enzyme-tab-name-label">
                        {methylationAsterisk ? `${enzyme.name}*` : enzyme.name}
                      </span>
                      <button
                        type="button"
                        className="enzyme-row-visibility"
                        aria-label={`${enzymeHidden ? 'Show' : 'Hide'} ${enzyme.name} on map and sequence`}
                        aria-pressed={!enzymeHidden}
                        title={`${enzymeHidden ? 'Show' : 'Hide'} ${enzyme.name} on map and sequence`}
                        onClick={(event) => {
                          event.stopPropagation()
                          const hiddenNames = new Set(settings.enzymes.hiddenNames ?? [])
                          if (enzymeHidden) hiddenNames.delete(enzyme.name)
                          else hiddenNames.add(enzyme.name)
                          actions.updateSection('enzymes', { hiddenNames: [...hiddenNames] })
                        }}
                        onDoubleClick={(event) => event.stopPropagation()}
                      >
                        {enzymeHidden ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
                      </button>
                    </td>
                    <td className="enzyme-sites-cell">{sites.length}</td>
                    <td
                      className={`enzyme-positions-cell${useNumbers ? ' is-numbers' : ' is-lines'}${mobile.isMobileShell ? ' is-mobile-numbers' : ''}`}
                    >
                      {useNumbers ? (
                        mobile.isMobileShell && sites.length > 1 && !locationsExpanded ? (
                          <button
                            type="button"
                            className="enzyme-positions-expand"
                            aria-expanded="false"
                            aria-label={`Show all ${sites.length} cut locations for ${enzyme.name}`}
                            onClick={() => actions.onExpandLocations(enzyme.name)}
                          >
                            Expand ({sites.length})
                          </button>
                        ) : sites.map((site, index) => {
                          const range = siteRange(site)
                          const isSelected =
                            selectedRange !== null &&
                            selectedRange.start === range.start &&
                            selectedRange.end === range.end
                          return (
                            <span key={siteKey(site)}>
                              {index > 0 ? ', ' : ''}
                              <button
                                type="button"
                                className={`enzyme-position-link${isSelected ? ' is-selected' : ''}`}
                                onClick={() => actions.onNavigateToSite(site)}
                              >
                                {site.start + 1}
                              </button>
                            </span>
                          )
                        })
                      ) : (
                        <EnzymeSiteMinimap
                          sites={sites}
                          sequenceLength={record.sequence.length}
                          selectedRange={selectedRange}
                          onSiteSelect={actions.onNavigateToSite}
                        />
                      )}
                    </td>
                    <td className="enzyme-meta-cell">{enzyme.type}</td>
                    <td className="enzyme-meta-cell">{overhangDescription(enzyme)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
