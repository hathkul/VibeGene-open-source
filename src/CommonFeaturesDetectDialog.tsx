import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  type CommonFeatureMatch,
  formatCommonFeatureQualifierLines,
  peptideMassDa,
} from './domain/commonFeatures'
import { defaultFeatureTranslationOptions, translateFeature } from './domain/geneticCode'
import { featureLength, formatRange } from './domain/sequence'
import type { SequenceRecord, Topology } from './domain/types'

type SortMode = 'name' | 'location' | 'size' | 'color' | 'direction' | 'type' | 'match'
type SortDirection = 'asc' | 'desc'

type CommonFeaturesDetectDialogProps = {
  recordName: string
  record: SequenceRecord
  matches: CommonFeatureMatch[]
  minimumIdentityPercent: number
  onMinimumIdentityChange: (value: number) => void
  showMatchOptions?: boolean
  onCancel: () => void
  onAdd: (features: CommonFeatureMatch['feature'][]) => void
  emptyMessage?: string
}

function SortHeader({
  label,
  mode,
  activeMode,
  direction,
  onSort,
  title,
}: {
  label: ReactNode
  mode: SortMode
  activeMode: SortMode
  direction: SortDirection
  onSort: (mode: SortMode) => void
  title?: string
}) {
  const isActive = activeMode === mode
  return (
    <button
      type="button"
      className={`enzyme-table-sort-header${isActive ? ' is-active' : ''}`}
      onClick={() => onSort(mode)}
      title={title}
      aria-sort={isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span>{label}</span>
      <span className="enzyme-table-sort-arrow" aria-hidden>
        {isActive ? (direction === 'asc' ? '▲' : '▼') : '▾'}
      </span>
    </button>
  )
}

function AddHeaderMenu({ onCheckAll, onUncheckAll }: { onCheckAll: () => void; onUncheckAll: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  return (
    <div className={`feature-visibility-header-menu${menuOpen ? ' menu-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="feature-visibility-menu-trigger"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        Add <span aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <div className="feature-visibility-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCheckAll()
              setMenuOpen(false)
            }}
          >
            Check All Features
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onUncheckAll()
              setMenuOpen(false)
            }}
          >
            Uncheck All Features
          </button>
        </div>
      )}
    </div>
  )
}

function DirectionGlyph({ strand }: { strand: 'forward' | 'reverse' }) {
  return (
    <span className="common-feature-direction" aria-label={strand}>
      {strand === 'reverse' ? '←' : '→'}
    </span>
  )
}

function matchDescriptionLines(match: CommonFeatureMatch, sequence: string, topology: Topology) {
  const lines = formatCommonFeatureQualifierLines(match.template)
  if (!match.template.translateInSequenceView && !match.template.translation) return lines
  const options = match.feature.translation ?? defaultFeatureTranslationOptions(match.feature.locations.length)
  const peptide = translateFeature(match.feature, sequence, options, { topology })
  if (!peptide) return lines
  const mass = peptideMassDa(peptide)
  return [
    ...lines,
    `/translation = ${peptide}`,
    `${peptide.length} amino acid${peptide.length === 1 ? '' : 's'} = ${mass.toFixed(1)} Da`,
  ]
}

export function CommonFeaturesDetectDialog({
  recordName,
  record,
  matches,
  minimumIdentityPercent,
  onMinimumIdentityChange,
  showMatchOptions = true,
  onCancel,
  onAdd,
  emptyMessage,
}: CommonFeaturesDetectDialogProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const match of matches) {
      if (!match.alreadyPresent) initial.add(match.id)
    }
    return initial
  })
  const [fullDescriptions, setFullDescriptions] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('location')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const sortedMatches = useMemo(() => {
    const sign = sortDirection === 'asc' ? 1 : -1
    return [...matches].sort((left, right) => {
      let cmp: number
      if (sortMode === 'name') cmp = left.template.name.localeCompare(right.template.name)
      else if (sortMode === 'location') cmp = left.start - right.start || left.end - right.end
      else if (sortMode === 'size') {
        cmp =
          featureLength(left.feature, record.sequence.length) -
          featureLength(right.feature, record.sequence.length)
      } else if (sortMode === 'color') cmp = left.template.color.localeCompare(right.template.color)
      else if (sortMode === 'direction') cmp = left.strand.localeCompare(right.strand)
      else if (sortMode === 'type') cmp = left.template.type.localeCompare(right.template.type)
      else cmp = left.matchPercent - right.matchPercent
      return sign * cmp || left.template.name.localeCompare(right.template.name) || left.start - right.start
    })
  }, [matches, record.sequence.length, sortDirection, sortMode])

  const newMatches = sortedMatches.filter((match) => !match.alreadyPresent)
  const presentMatches = sortedMatches.filter((match) => match.alreadyPresent)
  const checkedCount = sortedMatches.reduce((count, match) => count + (checkedIds.has(match.id) ? 1 : 0), 0)

  function toggleSort(mode: SortMode) {
    if (sortMode === mode) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortMode(mode)
    setSortDirection('asc')
  }

  function setAllChecked(checked: boolean) {
    setCheckedIds(checked ? new Set(matches.map((match) => match.id)) : new Set())
  }

  function toggleChecked(id: string) {
    setCheckedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderSection(title: string, rows: CommonFeatureMatch[]) {
    if (!rows.length) return null
    return (
      <>
        <tr className="common-features-section-row">
          <td colSpan={8}>{title}</td>
        </tr>
        {rows.map((match) => {
          const size = featureLength(match.feature, record.sequence.length)
          const descriptionLines = fullDescriptions
            ? matchDescriptionLines(match, record.sequence, record.topology)
            : []
          return (
            <tr key={match.id} className={checkedIds.has(match.id) ? 'is-checked-row' : undefined}>
              <td className="feature-visibility-col">
                <input
                  type="checkbox"
                  checked={checkedIds.has(match.id)}
                  onChange={() => toggleChecked(match.id)}
                  aria-label={`Add ${match.template.name}`}
                />
              </td>
              <td>
                <div className="common-feature-name-cell">
                  <strong>{match.template.name}</strong>
                  {fullDescriptions && descriptionLines.length > 0 && (
                    <div className="common-feature-description">
                      {descriptionLines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>
              </td>
              <td>{formatRange(match.start, match.end)}</td>
              <td>{size}</td>
              <td>
                <span className="color-chip" style={{ background: match.template.color }} title={match.template.color} />
              </td>
              <td>
                <DirectionGlyph strand={match.strand} />
              </td>
              <td>{match.template.type}</td>
              <td>{match.matchPercent.toFixed(1)}%</td>
            </tr>
          )
        })}
      </>
    )
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="translation-dialog enzyme-dialog common-features-detect-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="common-features-detect-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="common-features-detect-title">Add detected features to {recordName}:</h3>
        {showMatchOptions && <div className="common-features-detect-options">
          <label>
            <span>Minimum identity</span>
            <select value={minimumIdentityPercent} onChange={(event) => onMinimumIdentityChange(Number(event.target.value))}>
              <option value={100}>100% — exact matches only</option>
              <option value={98}>98% — very strict</option>
              <option value={95}>95% — recommended approximate</option>
              <option value={90}>90% — permissive</option>
            </select>
          </label>
          <span>Short features automatically require stricter identity to limit false positives.</span>
        </div>}
        <div className="common-features-detect-table-wrap">
          <table className="data-table features-table common-features-detect-table">
            <thead>
              <tr>
                <th className="feature-visibility-col">
                  <AddHeaderMenu onCheckAll={() => setAllChecked(true)} onUncheckAll={() => setAllChecked(false)} />
                </th>
                <th className="enzyme-sortable-header">
                  <SortHeader label="Feature" mode="name" activeMode={sortMode} direction={sortDirection} onSort={toggleSort} />
                </th>
                <th className="enzyme-sortable-header">
                  <SortHeader label="Location" mode="location" activeMode={sortMode} direction={sortDirection} onSort={toggleSort} />
                </th>
                <th className="enzyme-sortable-header">
                  <SortHeader label="Size (bp)" mode="size" activeMode={sortMode} direction={sortDirection} onSort={toggleSort} />
                </th>
                <th className="enzyme-sortable-header">
                  <SortHeader
                    label={<span className="common-feature-color-header" aria-hidden />}
                    mode="color"
                    activeMode={sortMode}
                    direction={sortDirection}
                    onSort={toggleSort}
                    title="Color"
                  />
                </th>
                <th className="enzyme-sortable-header">
                  <SortHeader
                    label={<span aria-hidden>↔</span>}
                    mode="direction"
                    activeMode={sortMode}
                    direction={sortDirection}
                    onSort={toggleSort}
                    title="Direction"
                  />
                </th>
                <th className="enzyme-sortable-header">
                  <SortHeader label="Type" mode="type" activeMode={sortMode} direction={sortDirection} onSort={toggleSort} />
                </th>
                <th className="enzyme-sortable-header">
                  <SortHeader label="Match" mode="match" activeMode={sortMode} direction={sortDirection} onSort={toggleSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {matches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="common-features-empty">{emptyMessage ?? 'No common features were detected in this sequence.'}</td>
                </tr>
              ) : (
                <>
                  {renderSection(`New features for ${recordName.replace(/\.dna$/i, '')}`, newMatches)}
                  {renderSection('Already present', presentMatches)}
                </>
              )}
            </tbody>
          </table>
        </div>
        <div className="translation-dialog-footer common-features-detect-footer">
          {matches.length === 0 ? (
            <div className="translation-actions">
              <button type="button" className="primary" onClick={onCancel}>OK</button>
            </div>
          ) : (
            <>
              <label className="translation-checkbox-row">
                <input
                  type="checkbox"
                  checked={fullDescriptions}
                  onChange={(event) => setFullDescriptions(event.target.checked)}
                />
                Full descriptions
              </label>
              <div className="translation-actions">
                <button type="button" onClick={onCancel}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={checkedCount === 0}
                  onClick={() => {
                    const selected = matches.filter((match) => checkedIds.has(match.id)).map((match) => match.feature)
                    onAdd(selected)
                  }}
                >
                  {checkedCount === 1 ? 'Add 1 Feature' : `Add ${checkedCount} Features`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
