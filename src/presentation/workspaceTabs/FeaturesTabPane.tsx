import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { featureBounds, featureLength, formatRange } from '../../domain/sequence'
import { isFeatureNoColor } from '../../domain/featureAppearance'
import { defaultProteinBondColor, proteinBondTypeLabel } from '../../domain/proteinBonds'
import { featureDisplayName } from '../map/mapPrimitives'
import type { ProteinBond, SequenceFeature, SequenceRecord } from '../../domain/types'
import { FeatureVisibilityHeaderMenu } from '../dnaViewControls'
import type { FeatureTabSortDirection, FeatureTabSortMode } from '../sequence'
import type { FeatureTabEntry, FeatureTabFeatureRow } from './featureTabModel'
import { featureNotesDisplayParts, translationSummary } from './featureNotesDisplay'
import { FeatureNoteContent } from './FeatureNoteContent'

function FeatureNoteValue({ children }: { children: ReactNode }) {
  return <span
    className="feature-note-value"
    onMouseDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
  >{children}</span>
}

function FeatureNotes({ notes }: { notes: string | undefined }) {
  return <>{featureNotesDisplayParts(notes).map((part, index) => {
    const summary = part.kind === 'qualifier' && part.name.toLowerCase() === 'translation' && part.value !== null
      ? translationSummary(part.value)
      : null
    return (
      <div className="feature-note-paragraph" key={index}>
        {part.kind === 'text' ? <FeatureNoteValue><FeatureNoteContent value={part.text} /></FeatureNoteValue> : <><strong>{part.name}</strong>{part.value !== null && <> = <FeatureNoteValue><FeatureNoteContent value={part.value} /></FeatureNoteValue></>}</>}
        {summary && <div className="feature-translation-summary" title="Estimated average mass of the unmodified peptide">{summary}</div>}
      </div>
    )
  })}</>
}

export function FeatureTableSortHeader({
  label,
  mode,
  activeMode,
  direction,
  onSort,
}: {
  label: string
  mode: FeatureTabSortMode
  activeMode: FeatureTabSortMode
  direction: FeatureTabSortDirection
  onSort: (mode: FeatureTabSortMode) => void
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

type FeatureColumnId = 'visibility' | 'name' | 'location' | 'size' | 'strand' | 'type' | 'notes'

const FEATURE_COLUMN_MIN_WIDTH: Record<FeatureColumnId, number> = {
  visibility: 30,
  name: 180,
  location: 92,
  size: 64,
  strand: 64,
  type: 96,
  notes: 120,
}

const FEATURE_COLUMN_DEFAULT_WIDTHS: Record<FeatureColumnId, number> = {
  visibility: 30,
  name: 180,
  location: 92,
  size: 64,
  strand: 64,
  type: 96,
  notes: 120,
}

const FEATURE_COLUMN_ORDER: Record<SequenceRecord['molecule'], FeatureColumnId[]> = {
  dna: ['visibility', 'name', 'location', 'size', 'strand', 'type', 'notes'],
  rna: ['visibility', 'name', 'location', 'size', 'strand', 'type', 'notes'],
  protein: ['visibility', 'name', 'location', 'size', 'type', 'notes'],
}

function FeatureColumnResizeHandle({
  columnId,
  width,
  onResize,
}: {
  columnId: FeatureColumnId
  width: number
  onResize: (columnId: FeatureColumnId, nextWidth: number) => void
}) {
  return (
    <span
      className="table-col-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${columnId} column`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event: ReactPointerEvent<HTMLSpanElement>) => {
        event.preventDefault()
        event.stopPropagation()
        const handle = event.currentTarget
        const startX = event.clientX
        const startWidth = width
        handle.classList.add('is-dragging')
        handle.setPointerCapture(event.pointerId)

        const onMove = (moveEvent: PointerEvent) => {
          const next = Math.max(FEATURE_COLUMN_MIN_WIDTH[columnId], Math.round(startWidth + (moveEvent.clientX - startX)))
          onResize(columnId, next)
        }
        const onUp = (upEvent: PointerEvent) => {
          handle.classList.remove('is-dragging')
          if (handle.hasPointerCapture(upEvent.pointerId)) handle.releasePointerCapture(upEvent.pointerId)
          handle.removeEventListener('pointermove', onMove)
          handle.removeEventListener('pointerup', onUp)
          handle.removeEventListener('pointercancel', onUp)
        }
        handle.addEventListener('pointermove', onMove)
        handle.addEventListener('pointerup', onUp)
        handle.addEventListener('pointercancel', onUp)
      }}
    />
  )
}

export type FeaturesTabPaneProps = {
  molecule: SequenceRecord['molecule']
  proteinBonds: readonly ProteinBond[]
  selectedBondId: string | null
  hasFeatureSelected: boolean
  selectedFeature: SequenceFeature | null
  featureSelectionMemberId: string | null
  selectedFeatureId: string | null
  selectedFeatureIds: readonly string[]
  table: {
    entries: FeatureTabEntry[]
    featureRows: FeatureTabFeatureRow[]
    sortMode: FeatureTabSortMode
    sortDirection: FeatureTabSortDirection
  }
  actions: {
    onAddFeature: () => void
    onAddBond: () => void
    onDeleteSelected: () => void
    onEditProperties: () => void
    onCheckAllVisibility: (visible: boolean) => void
    onSort: (mode: FeatureTabSortMode) => void
    onSelectRow: (entry: FeatureTabFeatureRow, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void
    onFocusSelection: (featureId: string, selectedIds: string[], memberId: string | null) => void
    onSetFeatureVisibility: (featureId: string, visible: boolean, memberId: string | null) => void
    onSetBondVisibility: (bondId: string, visible: boolean) => void
    onSelectBond: (bondId: string) => void
    onOpenBondEditor: (bondId: string) => void
    onOpenFeatureEditor: (featureId: string, options?: { libraryMemberId?: string | null }) => void
  }
}

export function FeaturesTabPane({
  molecule,
  proteinBonds,
  selectedBondId,
  hasFeatureSelected,
  featureSelectionMemberId,
  selectedFeatureId,
  selectedFeatureIds,
  table,
  actions,
}: FeaturesTabPaneProps) {
  const [columnWidths, setColumnWidths] = useState(FEATURE_COLUMN_DEFAULT_WIDTHS)
  const [availableWidth, setAvailableWidth] = useState(0)
  const tableRef = useRef<HTMLTableElement | null>(null)
  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const autoSizedRef = useRef(false)

  useLayoutEffect(() => {
    const wrap = tableWrapRef.current
    if (!wrap) return
    const updateWidth = () => setAvailableWidth(wrap.clientWidth)
    updateWidth()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateWidth)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (autoSizedRef.current) return
    const tableElement = tableRef.current
    if (!tableElement) return
    const columns = Array.from(tableElement.querySelectorAll('col'))
    if (!columns.length) return
    const originalLayout = tableElement.style.tableLayout
    const originalWidth = tableElement.style.width
    const originalMinWidth = tableElement.style.minWidth
    const originalColumnWidths = columns.map((column) => column.style.width)

    tableElement.style.tableLayout = 'auto'
    tableElement.style.width = 'max-content'
    tableElement.style.minWidth = '0'
    columns.forEach((column) => { column.style.width = 'auto' })
    const naturalWidths = columns.map((column) => Math.ceil(column.getBoundingClientRect().width))

    tableElement.style.tableLayout = originalLayout
    tableElement.style.width = originalWidth
    tableElement.style.minWidth = originalMinWidth
    columns.forEach((column, index) => { column.style.width = originalColumnWidths[index] ?? '' })

    const columnOrder = FEATURE_COLUMN_ORDER[molecule]
    const nextWidths = { ...FEATURE_COLUMN_DEFAULT_WIDTHS }
    columnOrder.forEach((columnId, index) => {
      nextWidths[columnId] = Math.max(FEATURE_COLUMN_MIN_WIDTH[columnId], naturalWidths[index] ?? 0)
    })
    if (nextWidths.visibility > FEATURE_COLUMN_MIN_WIDTH.visibility) {
      nextWidths.notes += nextWidths.visibility - FEATURE_COLUMN_MIN_WIDTH.visibility
      nextWidths.visibility = FEATURE_COLUMN_MIN_WIDTH.visibility
    }
    setColumnWidths(nextWidths)
    autoSizedRef.current = true
  }, [molecule, table.entries.length, proteinBonds.length])

  const resizeColumn = (columnId: FeatureColumnId, nextWidth: number) => {
    setColumnWidths((current) => current[columnId] === nextWidth ? current : { ...current, [columnId]: nextWidth })
  }
  const columnOrder = FEATURE_COLUMN_ORDER[molecule]
  const fixedWidth = columnOrder.filter((columnId) => columnId !== 'notes')
    .reduce((total, columnId) => total + columnWidths[columnId], 0)
  const notesWidth = Math.max(
    columnWidths.notes,
    availableWidth > 0 ? availableWidth - fixedWidth : columnWidths.notes,
  )
  const tableMinWidth = fixedWidth + columnWidths.notes

  return (
    <div className="tab-table-layout features-tab">
      <div className="features-tab-table-wrap" ref={tableWrapRef}>
        <div className="features-toolbar">
          <button type="button" onClick={actions.onAddFeature}>
            <Plus size={16} /> Add feature
          </button>
          {molecule === 'protein' && (
            <button type="button" onClick={actions.onAddBond}>
              <Plus size={16} /> Add bond
            </button>
          )}
          <button
            type="button"
            className="danger"
            disabled={!hasFeatureSelected && !selectedBondId}
            onClick={actions.onDeleteSelected}
          >
            <Trash2 size={16} /> Delete
          </button>
          <button
            type="button"
            disabled={!hasFeatureSelected && !selectedBondId}
            onClick={actions.onEditProperties}
          >
            Edit properties
          </button>
        </div>
        <table ref={tableRef} className="data-table features-table" style={{ minWidth: tableMinWidth, width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col className="features-visibility-column" style={{ width: columnWidths.visibility, maxWidth: columnWidths.visibility }} />
            <col style={{ width: columnWidths.name }} />
            <col style={{ width: columnWidths.location }} />
            <col style={{ width: columnWidths.size }} />
            {molecule !== 'protein' && <col style={{ width: columnWidths.strand }} />}
            <col style={{ width: columnWidths.type }} />
            <col style={{ width: notesWidth }} />
          </colgroup>
          <thead>
            <tr>
              <th className="feature-visibility-col">
                <FeatureVisibilityHeaderMenu
                  onCheckAll={() => actions.onCheckAllVisibility(true)}
                  onUncheckAll={() => actions.onCheckAllVisibility(false)}
                />
                <FeatureColumnResizeHandle columnId="visibility" width={columnWidths.visibility} onResize={resizeColumn} />
              </th>
              <th className="enzyme-sortable-header feature-name-col">
                <FeatureTableSortHeader
                  label="Feature"
                  mode="name"
                  activeMode={table.sortMode}
                  direction={table.sortDirection}
                  onSort={actions.onSort}
                />
                <FeatureColumnResizeHandle columnId="name" width={columnWidths.name} onResize={resizeColumn} />
              </th>
              <th className="enzyme-sortable-header">
                <FeatureTableSortHeader
                  label="Location"
                  mode="location"
                  activeMode={table.sortMode}
                  direction={table.sortDirection}
                  onSort={actions.onSort}
                />
                <FeatureColumnResizeHandle columnId="location" width={columnWidths.location} onResize={resizeColumn} />
              </th>
              <th className="enzyme-sortable-header">
                <FeatureTableSortHeader
                  label={molecule === 'protein' ? 'Size (aa)' : 'Size'}
                  mode="size"
                  activeMode={table.sortMode}
                  direction={table.sortDirection}
                  onSort={actions.onSort}
                />
                <FeatureColumnResizeHandle columnId="size" width={columnWidths.size} onResize={resizeColumn} />
              </th>
              {molecule !== 'protein' && (
                <th className="enzyme-sortable-header feature-strand-col">
                  <FeatureTableSortHeader
                    label="Strand"
                    mode="strand"
                    activeMode={table.sortMode}
                    direction={table.sortDirection}
                    onSort={actions.onSort}
                  />
                  <FeatureColumnResizeHandle columnId="strand" width={columnWidths.strand} onResize={resizeColumn} />
                </th>
              )}
              <th className="enzyme-sortable-header">
                <FeatureTableSortHeader
                  label="Type"
                  mode="type"
                  activeMode={table.sortMode}
                  direction={table.sortDirection}
                  onSort={actions.onSort}
                />
                <FeatureColumnResizeHandle columnId="type" width={columnWidths.type} onResize={resizeColumn} />
              </th>
              <th className="enzyme-sortable-header feature-notes-col">
                <FeatureTableSortHeader
                  label="Notes"
                  mode="notes"
                  activeMode={table.sortMode}
                  direction={table.sortDirection}
                  onSort={actions.onSort}
                />
                <FeatureColumnResizeHandle columnId="notes" width={notesWidth} onResize={resizeColumn} />
              </th>
            </tr>
          </thead>
          <tbody>
            {table.featureRows.length === 0 && proteinBonds.length === 0 ? (
              <tr>
                <td colSpan={molecule === 'protein' ? 6 : 7} className="muted">
                  {molecule === 'protein'
                    ? 'No protein features yet. Select residues in Sequence view, then add a feature.'
                    : 'No features in this sequence.'}
                </td>
              </tr>
            ) : <>
            {table.entries.map((entry) => {
              if (entry.kind === 'heading') {
                return (
                  <tr key={entry.key} className="feature-section-row">
                    <td colSpan={molecule === 'protein' ? 6 : 7} title={entry.label}>
                      {entry.label}
                    </td>
                  </tr>
                )
              }
              const { feature, memberId, sequenceLength } = entry
              const bounds = featureBounds(feature)
              const isVisible = feature.visible !== false
              const isRowSelected =
                featureSelectionMemberId === memberId
                && (
                  selectedFeatureIds.includes(feature.id)
                  || selectedFeatureId === feature.id
                )
              return (
                <tr
                  key={entry.key}
                  className={isRowSelected ? 'selected-row' : ''}
                  onMouseDown={(event) => {
                    if (event.shiftKey || event.metaKey || event.ctrlKey) event.preventDefault()
                  }}
                  onClick={(event) => actions.onSelectRow(entry, event)}
                  onDoubleClick={() => {
                    actions.onFocusSelection(feature.id, [feature.id], memberId)
                    actions.onOpenFeatureEditor(feature.id, { libraryMemberId: memberId })
                  }}
                  title="Double-click for feature properties"
                >
                  <td className="feature-visibility-col" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isVisible}
                      aria-label={`Show ${featureDisplayName(feature)} on ${molecule === 'protein' ? 'protein sequence' : 'map and sequence'}`}
                      onChange={(event) => actions.onSetFeatureVisibility(feature.id, event.target.checked, memberId)}
                    />
                  </td>
                  <td className="feature-name-col">
                    <span className="feature-name-content">
                      <span
                        className={`color-chip${isFeatureNoColor(feature.color) ? ' is-nocolor' : ''}`}
                        style={isFeatureNoColor(feature.color) ? undefined : { background: feature.color }}
                      />
                      <button
                        type="button"
                        className="feature-name-button"
                        onClick={(event) => {
                          event.stopPropagation()
                          actions.onSelectRow(entry, event)
                        }}
                        onDoubleClick={(event) => {
                          event.stopPropagation()
                          actions.onFocusSelection(feature.id, [feature.id], memberId)
                          actions.onOpenFeatureEditor(feature.id, { libraryMemberId: memberId })
                        }}
                      >
                        {featureDisplayName(feature)}
                      </button>
                    </span>
                  </td>
                  <td>{formatRange(bounds.start, bounds.end)}</td>
                  <td>{featureLength(feature, sequenceLength)} {molecule === 'protein' ? 'aa' : 'b.p.'}</td>
                  {molecule !== 'protein' && (
                    <td className="feature-strand-col">
                      <span className="common-feature-direction" aria-label={`${bounds.strand} strand`} title={`${bounds.strand} strand`}>
                        {bounds.strand === 'reverse' ? '←' : '→'}
                      </span>
                    </td>
                  )}
                  <td>{feature.type}</td>
                  <td className="feature-notes-col"><FeatureNotes notes={feature.notes} /></td>
                </tr>
              )
            })}
            {molecule === 'protein' && proteinBonds.map((bond) => {
              const localResidues = bond.endpoints.filter((endpoint) => !endpoint.chainId).map((endpoint) => endpoint.residue)
              const location = localResidues.length
                ? localResidues.map((residue) => (residue + 1).toLocaleString()).join(' ↔ ')
                : bond.endpoints.map((endpoint) => `${endpoint.chainId ?? '?'}:${endpoint.residue + 1}`).join(' ↔ ')
              const selected = selectedBondId === bond.id
              return (
                <tr
                  key={bond.id}
                  className={selected ? 'selected-row protein-bond-feature-row' : 'protein-bond-feature-row'}
                  onMouseDown={(event) => {
                    if (event.shiftKey || event.metaKey || event.ctrlKey) event.preventDefault()
                  }}
                  onClick={() => actions.onSelectBond(bond.id)}
                  onDoubleClick={() => actions.onOpenBondEditor(bond.id)}
                  title="Double-click for bond properties"
                >
                  <td className="feature-visibility-col" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={bond.visible !== false}
                      aria-label={`Show ${bond.name || 'bond'} on protein sequence`}
                      onChange={(event) => actions.onSetBondVisibility(bond.id, event.target.checked)}
                    />
                  </td>
                  <td className="feature-name-col">
                    <span className="feature-name-content">
                      <span className="color-chip" style={{ background: bond.color || defaultProteinBondColor(bond.type) }} />
                      <button
                        type="button"
                        className="feature-name-button"
                        onClick={(event) => {
                          event.stopPropagation()
                          actions.onSelectBond(bond.id)
                        }}
                        onDoubleClick={(event) => {
                          event.stopPropagation()
                          actions.onOpenBondEditor(bond.id)
                        }}
                      >
                        {bond.name || 'Bond'}
                      </button>
                    </span>
                  </td>
                  <td>{location}</td>
                  <td>—</td>
                  <td>Bond · {proteinBondTypeLabel(bond.type)}</td>
                  <td className="feature-notes-col"><FeatureNotes notes={bond.notes} /></td>
                </tr>
              )
            })}
            </>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
