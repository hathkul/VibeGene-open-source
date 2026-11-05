import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  formatPrimerBindingSite,
  type PrimerImportCandidate,
} from './domain/primerExport'
import type { Primer } from './domain/types'

type SortMode = 'name' | 'length' | 'binding' | 'orientation' | 'tm'
type SortDirection = 'asc' | 'desc'

type PrimersImportDialogProps = {
  recordName: string
  candidates: PrimerImportCandidate[]
  skippedCount: number
  onCancel: () => void
  onAdd: (primers: Primer[]) => void
  emptyMessage?: string
}

function SortHeader({
  label,
  mode,
  activeMode,
  direction,
  onSort,
}: {
  label: ReactNode
  mode: SortMode
  activeMode: SortMode
  direction: SortDirection
  onSort: (mode: SortMode) => void
}) {
  const isActive = activeMode === mode
  return (
    <button
      type="button"
      className={`enzyme-table-sort-header${isActive ? ' is-active' : ''}`}
      onClick={() => onSort(mode)}
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
            Select All
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onUncheckAll()
              setMenuOpen(false)
            }}
          >
            Unselect All
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

export function PrimersImportDialog({
  recordName,
  candidates,
  skippedCount,
  onCancel,
  onAdd,
  emptyMessage,
}: PrimersImportDialogProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const candidate of candidates) {
      if (!candidate.alreadyPresent) initial.add(candidate.id)
    }
    return initial
  })
  const [fullDescriptions, setFullDescriptions] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('binding')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const sorted = useMemo(() => {
    const sign = sortDirection === 'asc' ? 1 : -1
    return [...candidates].sort((left, right) => {
      let cmp: number
      if (sortMode === 'name') cmp = left.name.localeCompare(right.name)
      else if (sortMode === 'length') cmp = left.length - right.length
      else if (sortMode === 'binding') cmp = left.start - right.start || left.end - right.end
      else if (sortMode === 'orientation') cmp = left.strand.localeCompare(right.strand)
      else cmp = (left.tmC ?? -Infinity) - (right.tmC ?? -Infinity)
      return sign * cmp || left.name.localeCompare(right.name) || left.start - right.start
    })
  }, [candidates, sortDirection, sortMode])

  const newRows = sorted.filter((candidate) => !candidate.alreadyPresent)
  const presentRows = sorted.filter((candidate) => candidate.alreadyPresent)
  const checkedCount = sorted.reduce((count, candidate) => count + (checkedIds.has(candidate.id) ? 1 : 0), 0)

  function toggleSort(mode: SortMode) {
    if (sortMode === mode) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortMode(mode)
    setSortDirection('asc')
  }

  function setAllChecked(checked: boolean) {
    setCheckedIds(checked ? new Set(candidates.map((candidate) => candidate.id)) : new Set())
  }

  function toggleChecked(id: string) {
    setCheckedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderSection(title: string, rows: PrimerImportCandidate[]) {
    if (!rows.length) return null
    return (
      <>
        <tr className="common-features-section-row">
          <td colSpan={6}>{title}</td>
        </tr>
        {rows.map((candidate) => (
          <tr key={candidate.id} className={checkedIds.has(candidate.id) ? 'is-checked-row' : undefined}>
            <td className="feature-visibility-col">
              <input
                type="checkbox"
                checked={checkedIds.has(candidate.id)}
                onChange={() => toggleChecked(candidate.id)}
                aria-label={`Add ${candidate.name}`}
              />
            </td>
            <td>
              <div className="common-feature-name-cell">
                <strong>{candidate.name}</strong>
                {fullDescriptions && (
                  <div className="common-feature-description">
                    <div>{`/sequence = ${candidate.sequence}`}</div>
                    <div>
                      {candidate.gcPercent.toFixed(0)}% GC / {candidate.massDa.toFixed(1)} Da
                    </div>
                  </div>
                )}
              </div>
            </td>
            <td>{candidate.length}-mer</td>
            <td>{formatPrimerBindingSite(candidate.start, candidate.end)}</td>
            <td>
              <DirectionGlyph strand={candidate.strand} />
            </td>
            <td>{candidate.tmLabel}</td>
          </tr>
        ))}
      </>
    )
  }

  return (
    <div className="translation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="translation-dialog enzyme-dialog common-features-browse-dialog primers-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="primers-import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="primers-import-title">Import Primers into {recordName}</h3>
        <p className="muted">
          {candidates.length.toLocaleString()} primer{candidates.length === 1 ? '' : 's'} hybridized under the
          current parameters
          {skippedCount > 0
            ? `; ${skippedCount.toLocaleString()} list entr${skippedCount === 1 ? 'y' : 'ies'} skipped`
            : ''}
          .
        </p>
        <div className="common-features-detect-table-wrap">
          <table className="data-table features-table common-features-detect-table">
            <thead>
              <tr>
                <th className="feature-visibility-col">
                  <AddHeaderMenu onCheckAll={() => setAllChecked(true)} onUncheckAll={() => setAllChecked(false)} />
                </th>
                <th>
                  <SortHeader label="Primer" mode="name" activeMode={sortMode} direction={sortDirection} onSort={toggleSort} />
                </th>
                <th>
                  <SortHeader label="Length" mode="length" activeMode={sortMode} direction={sortDirection} onSort={toggleSort} />
                </th>
                <th>
                  <SortHeader
                    label="Binding site"
                    mode="binding"
                    activeMode={sortMode}
                    direction={sortDirection}
                    onSort={toggleSort}
                  />
                </th>
                <th>
                  <SortHeader
                    label="Orientation"
                    mode="orientation"
                    activeMode={sortMode}
                    direction={sortDirection}
                    onSort={toggleSort}
                  />
                </th>
                <th>
                  <SortHeader label="Tm" mode="tm" activeMode={sortMode} direction={sortDirection} onSort={toggleSort} />
                </th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="common-features-empty">
                    {emptyMessage ?? 'No hybridizing primers found in the list.'}
                  </td>
                </tr>
              ) : (
                <>
                  {renderSection('New primers', newRows)}
                  {renderSection('Already in this file', presentRows)}
                </>
              )}
            </tbody>
          </table>
        </div>
        <div className="translation-dialog-footer common-features-detect-footer">
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={fullDescriptions}
              onChange={(event) => setFullDescriptions(event.target.checked)}
            />
            Show descriptions
          </label>
          <div className="translation-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={checkedCount === 0}
              onClick={() =>
                onAdd(candidates.filter((candidate) => checkedIds.has(candidate.id)).map((candidate) => candidate.primer))
              }
            >
              Add {checkedCount > 0 ? checkedCount.toLocaleString() : ''} Primer
              {checkedCount === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
